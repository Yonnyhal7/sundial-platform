-- Assertions for the dedicated migration-staging project. Every school and
-- user identifier below is synthetic.
do $test$
declare
  v_actual text;
  v_result jsonb;
  v_version bigint;
  v_audit_before bigint;
  v_platform_version bigint;
  v_timezone text;
begin
  select count(*)::text
  into v_actual
  from public.school_timezone_audit;
  if v_actual <> (
    select value from timezone_test.baseline where key = 'audit_rows'
  ) then
    raise exception 'The reconciliation changed existing timezone audit rows';
  end if;

  select md5(
    string_agg(
      concat_ws(
        '|',
        id,
        school_id,
        previous_timezone,
        new_timezone,
        actor_id,
        result_status,
        created_at
      ),
      E'\n'
      order by id
    )
  )
  into v_actual
  from public.school_timezone_audit;
  if v_actual <> (
    select value from timezone_test.baseline where key = 'audit_fingerprint'
  ) then
    raise exception 'The reconciliation changed existing timezone audit data';
  end if;

  select md5(
    string_agg(
      concat_ws(
        '|',
        policyname,
        permissive,
        roles::text,
        cmd,
        qual,
        with_check
      ),
      E'\n'
      order by policyname
    )
  )
  into v_actual
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'school_timezone_audit';
  if v_actual <> (
    select value from timezone_test.baseline where key = 'audit_policy_fingerprint'
  ) then
    raise exception 'The reconciliation changed timezone audit RLS policies';
  end if;

  select md5(
    string_agg(
      concat_ws('|', grantee, privilege_type, is_grantable),
      E'\n'
      order by grantee, privilege_type
    )
  )
  into v_actual
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'school_timezone_audit';
  if v_actual <> (
    select value from timezone_test.baseline where key = 'audit_grant_fingerprint'
  ) then
    raise exception 'The reconciliation changed timezone audit grants';
  end if;

  select md5(
    string_agg(
      concat_ws(
        '|',
        column_name,
        data_type,
        is_nullable,
        coalesce(column_default, '')
      ),
      E'\n'
      order by ordinal_position
    )
  )
  into v_actual
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'school_timezone_audit';
  if v_actual <> (
    select value from timezone_test.baseline where key = 'audit_column_fingerprint'
  ) then
    raise exception 'The reconciliation changed timezone audit columns';
  end if;

  if not public.school_timezone_is_supported('America/Los_Angeles')
     or public.school_timezone_is_supported('US/Pacific')
     or public.school_timezone_is_supported('Etc/GMT+8')
     or public.school_timezone_is_supported('Mars/Olympus_Mons')
     or public.school_timezone_is_supported('PST')
     or public.school_timezone_is_supported(null) then
    raise exception 'Supported-timezone helper contract failed';
  end if;

  if has_function_privilege('anon', 'public.school_timezone_is_supported(text)', 'EXECUTE')
     or has_function_privilege(
       'authenticated',
       'public.school_timezone_is_supported(text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.enforce_supported_school_timezone()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.enforce_supported_school_timezone()',
       'EXECUTE'
     ) then
    raise exception 'A private timezone helper is executable by an application role';
  end if;

  if has_function_privilege(
       'anon',
       'public.update_school_timezone(uuid,bigint,text,boolean)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.update_school_timezone(uuid,bigint,text,boolean)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.update_platform_settings(text,bigint,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.update_platform_settings(text,bigint,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Timezone RPC ACL contract failed';
  end if;

  begin
    update public.schools
    set timezone = 'US/Pacific'
    where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'Direct invalid timezone write unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;

  select timezone
  into v_timezone
  from public.schools
  where id = '10000000-0000-0000-0000-000000000001';
  if v_timezone <> 'America/Los_Angeles' then
    raise exception 'Rejected direct write changed the school timezone';
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000001',
    true
  );
  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    1,
    'America/Chicago',
    true
  );
  if v_result->>'status' <> 'success' or (v_result->>'version')::bigint <> 2 then
    raise exception 'SuperAdmin school update failed: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000002',
    true
  );
  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    2,
    'America/Denver',
    true
  );
  if v_result->>'status' <> 'success' or (v_result->>'version')::bigint <> 3 then
    raise exception 'SchoolAdmin own-school update failed: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    '20000000-0000-0000-0000-000000000002',
    1,
    'America/Phoenix',
    true
  );
  if v_result->>'status' <> 'permission_error' then
    raise exception 'Cross-school SchoolAdmin update was not denied: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000003',
    true
  );
  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    3,
    'America/Phoenix',
    true
  );
  if v_result->>'status' <> 'permission_error' then
    raise exception 'Editor timezone update was not denied: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000005',
    true
  );
  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    3,
    'America/Phoenix',
    true
  );
  if v_result->>'status' <> 'permission_error' then
    raise exception 'Inactive SchoolAdmin timezone update was not denied: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000001',
    true
  );
  select count(*)
  into v_audit_before
  from public.school_timezone_audit;
  v_result := public.update_school_timezone(
    '30000000-0000-0000-0000-000000000003',
    1,
    'America/Phoenix',
    true
  );
  if v_result->>'status' <> 'school_unavailable' then
    raise exception 'Archived school update was not denied: %', v_result;
  end if;
  if (select count(*) from public.school_timezone_audit) <> v_audit_before + 1 then
    raise exception 'Archived school rejection was not audited';
  end if;

  select timezone_version
  into v_version
  from public.schools
  where id = '10000000-0000-0000-0000-000000000001';

  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    v_version,
    'America/Phoenix',
    false
  );
  if v_result->>'status' <> 'confirmation_required' then
    raise exception 'Unconfirmed update was not denied: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    v_version - 1,
    'America/Phoenix',
    true
  );
  if v_result->>'status' <> 'stale' then
    raise exception 'Stale update was not denied: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    v_version,
    'US/Pacific',
    true
  );
  if v_result->>'status' <> 'invalid_timezone' then
    raise exception 'Alias timezone was not denied: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    v_version,
    'Etc/GMT+8',
    true
  );
  if v_result->>'status' <> 'invalid_timezone' then
    raise exception 'Fixed-offset timezone was not denied: %', v_result;
  end if;

  v_result := public.update_school_timezone(
    '10000000-0000-0000-0000-000000000001',
    v_version,
    'Mars/Olympus_Mons',
    true
  );
  if v_result->>'status' <> 'invalid_timezone' then
    raise exception 'Unknown timezone was not denied: %', v_result;
  end if;

  select version, default_timezone
  into v_platform_version, v_timezone
  from public.platform_settings
  where id = true;

  v_result := public.update_platform_settings(
    'new_school_defaults',
    v_platform_version,
    jsonb_build_object(
      'default_timezone',
      'US/Pacific',
      'default_appearance',
      'system',
      'features',
      jsonb_build_object('pwa', true, 'offline_mode', true)
    )
  );
  if v_result->>'status' <> 'validation_error' then
    raise exception 'Invalid platform timezone was not denied: %', v_result;
  end if;
  if (
    select default_timezone
    from public.platform_settings
    where id = true
  ) <> v_timezone then
    raise exception 'Rejected platform update changed the default timezone';
  end if;

  v_result := public.update_platform_settings(
    'new_school_defaults',
    v_platform_version,
    jsonb_build_object(
      'default_timezone',
      'America/New_York',
      'default_appearance',
      'dark',
      'features',
      jsonb_build_object('pwa', false, 'offline_mode', true)
    )
  );
  if v_result->>'status' <> 'success' then
    raise exception 'Valid platform timezone update failed: %', v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000002',
    true
  );
  v_result := public.update_platform_settings(
    'new_school_defaults',
    v_platform_version + 1,
    jsonb_build_object(
      'default_timezone',
      'America/Los_Angeles',
      'default_appearance',
      'system',
      'features',
      '{}'::jsonb
    )
  );
  if v_result->>'status' <> 'permission_error' then
    raise exception 'SchoolAdmin platform-default update was not denied: %', v_result;
  end if;
end
$test$;

select jsonb_build_object(
  'status',
  'timezone_reconciliation_staging_passed',
  'school_a_timezone',
  (
    select timezone
    from public.schools
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'school_a_version',
  (
    select timezone_version
    from public.schools
    where id = '10000000-0000-0000-0000-000000000001'
  ),
  'existing_audit_rows_preserved',
  (select value::bigint from timezone_test.baseline where key = 'audit_rows'),
  'total_audit_rows_after_tests',
  (select count(*) from public.school_timezone_audit),
  'platform_default_timezone',
  (select default_timezone from public.platform_settings where id = true)
) as result;
