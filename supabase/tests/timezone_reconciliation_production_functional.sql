-- Controlled production verification for the timezone reconciliation.
-- Every mutation is contained in this transaction and rolled back.
begin;

do $test$
declare
  v_superadmin uuid;
  v_schooladmin uuid;
  v_school uuid;
  v_other_school uuid;
  v_archived_school uuid;
  v_school_version bigint;
  v_archived_version bigint;
  v_original_timezone text;
  v_test_timezone text;
  v_platform_version bigint;
  v_original_platform_timezone text;
  v_test_platform_timezone text;
  v_platform_values jsonb;
  v_result jsonb;
  v_success_audits bigint;
  v_rejected_audits bigint;
  v_platform_audits bigint;
begin
  select actor.id
  into v_superadmin
  from public.users actor
  where actor.is_active is true
    and lower(replace(coalesce(actor.role, ''), '_', '')) = 'superadmin'
  order by actor.id
  limit 1;

  select membership.user_id, membership.school_id
  into v_schooladmin, v_school
  from public.school_memberships membership
  join public.users actor on actor.id = membership.user_id
  join public.schools school on school.id = membership.school_id
  where actor.is_active is true
    and membership.is_active is true
    and membership.role = 'SchoolAdmin'
    and school.archived_at is null
  order by membership.id
  limit 1;

  select school.id
  into v_other_school
  from public.schools school
  where school.archived_at is null
    and school.id <> v_school
    and not exists (
      select 1
      from public.school_memberships membership
      where membership.user_id = v_schooladmin
        and membership.school_id = school.id
        and membership.role = 'SchoolAdmin'
        and membership.is_active is true
    )
    and not exists (
      select 1
      from public.users actor
      where actor.id = v_schooladmin
        and actor.school_id = school.id
        and lower(replace(coalesce(actor.role, ''), '_', '')) = 'schooladmin'
    )
  order by school.id
  limit 1;

  select school.id, school.timezone_version
  into v_archived_school, v_archived_version
  from public.schools school
  where school.archived_at is not null
  order by school.id
  limit 1;

  if v_superadmin is null
     or v_schooladmin is null
     or v_school is null
     or v_other_school is null
     or v_archived_school is null then
    raise exception 'Required functional-test actor or school fixture is unavailable';
  end if;

  select school.timezone, school.timezone_version
  into v_original_timezone, v_school_version
  from public.schools school
  where school.id = v_school;

  v_test_timezone := case
    when v_original_timezone = 'America/Denver' then 'America/Chicago'
    else 'America/Denver'
  end;

  if not public.school_timezone_is_supported(v_test_timezone) then
    raise exception 'The selected school test timezone is unavailable';
  end if;

  select
    settings.version,
    settings.default_timezone,
    case
      when settings.default_timezone = 'America/New_York'
        then 'America/Los_Angeles'
      else 'America/New_York'
    end,
    jsonb_build_object(
      'default_timezone',
      case
        when settings.default_timezone = 'America/New_York'
          then 'America/Los_Angeles'
        else 'America/New_York'
      end,
      'default_appearance',
      settings.default_appearance,
      'features',
      (
        select jsonb_object_agg(defaults.feature_key, defaults.enabled)
        from public.platform_feature_defaults defaults
      )
    )
  into
    v_platform_version,
    v_original_platform_timezone,
    v_test_platform_timezone,
    v_platform_values
  from public.platform_settings settings
  where settings.id = true;

  select count(*)
  into v_platform_audits
  from public.platform_settings_audit;

  perform set_config('request.jwt.claim.sub', v_superadmin::text, true);
  v_result := public.update_platform_settings(
    'new_school_defaults',
    v_platform_version,
    v_platform_values
  );
  if v_result->>'status' <> 'success' then
    raise exception 'SuperAdmin platform timezone update failed: %', v_result;
  end if;
  if (
    select default_timezone
    from public.platform_settings
    where id = true
  ) <> v_test_platform_timezone then
    raise exception 'SuperAdmin platform timezone update did not persist in the test transaction';
  end if;
  if (select count(*) from public.platform_settings_audit) <> v_platform_audits + 1 then
    raise exception 'SuperAdmin platform timezone update was not audited';
  end if;

  select
    count(*) filter (where result_status = 'success'),
    count(*) filter (where result_status = 'rejected')
  into v_success_audits, v_rejected_audits
  from public.school_timezone_audit;

  perform set_config('request.jwt.claim.sub', v_schooladmin::text, true);
  v_result := public.update_school_timezone(
    v_school,
    v_school_version,
    v_test_timezone,
    true
  );
  if v_result->>'status' <> 'success' then
    raise exception 'Authorized SchoolAdmin timezone update failed: %', v_result;
  end if;
  if (
    select count(*)
    from public.school_timezone_audit
    where result_status = 'success'
  ) <> v_success_audits + 1 then
    raise exception 'Successful SchoolAdmin update was not audited';
  end if;

  select timezone_version
  into v_school_version
  from public.schools
  where id = v_school;

  v_result := public.update_school_timezone(
    v_other_school,
    1,
    v_test_timezone,
    true
  );
  if v_result->>'status' <> 'permission_error' then
    raise exception 'Cross-school request was not rejected: %', v_result;
  end if;

  -- Production currently has no active Editor membership. Transform the chosen
  -- SchoolAdmin only inside this transaction to exercise the Editor gate.
  update public.users
  set role = 'Editor',
      school_id = v_school
  where id = v_schooladmin;
  update public.school_memberships
  set role = 'Editor'
  where user_id = v_schooladmin
    and school_id = v_school;

  v_result := public.update_school_timezone(
    v_school,
    v_school_version,
    v_original_timezone,
    true
  );
  if v_result->>'status' <> 'permission_error' then
    raise exception 'Editor request was not rejected: %', v_result;
  end if;

  update public.users
  set role = 'SchoolAdmin',
      school_id = v_school,
      is_active = false
  where id = v_schooladmin;
  update public.school_memberships
  set role = 'SchoolAdmin'
  where user_id = v_schooladmin
    and school_id = v_school;

  v_result := public.update_school_timezone(
    v_school,
    v_school_version,
    v_original_timezone,
    true
  );
  if v_result->>'status' <> 'permission_error' then
    raise exception 'Inactive-user request was not rejected: %', v_result;
  end if;

  perform set_config('request.jwt.claim.sub', v_superadmin::text, true);
  v_result := public.update_school_timezone(
    v_archived_school,
    v_archived_version,
    'America/Phoenix',
    true
  );
  if v_result->>'status' <> 'school_unavailable' then
    raise exception 'Archived-school request was not rejected: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    v_school,
    v_school_version,
    'Mars/Olympus_Mons',
    true
  );
  if v_result->>'status' <> 'invalid_timezone' then
    raise exception 'Unsupported timezone request was not rejected: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    v_school,
    v_school_version,
    'PST',
    true
  );
  if v_result->>'status' <> 'invalid_timezone' then
    raise exception 'Malformed timezone request was not rejected: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    v_school,
    v_school_version,
    'US/Pacific',
    true
  );
  if v_result->>'status' <> 'invalid_timezone' then
    raise exception 'US alias request was not rejected: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    v_school,
    v_school_version,
    'Etc/GMT+8',
    true
  );
  if v_result->>'status' <> 'invalid_timezone' then
    raise exception 'Etc/GMT request was not rejected: %', v_result;
  end if;

  if (
    select count(*)
    from public.school_timezone_audit
    where result_status = 'rejected'
  ) <> v_rejected_audits + 5 then
    raise exception 'Expected rejected timezone attempts were not all audited';
  end if;

  begin
    update public.schools
    set timezone = 'US/Pacific'
    where id = v_school;
    raise exception 'Direct invalid table update unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;

  if (
    select timezone
    from public.schools
    where id = v_school
  ) <> v_test_timezone then
    raise exception 'Rejected direct write changed the school timezone';
  end if;

  if v_original_platform_timezone = v_test_platform_timezone then
    raise exception 'Platform functional test did not choose an alternate timezone';
  end if;
end
$test$;

rollback;

select jsonb_build_object(
  'status',
  'production_timezone_functional_checks_passed',
  'temporary_changes',
  'rolled_back'
) as result;
