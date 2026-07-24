-- Emergency rollback for 20260724105500_reconcile_school_timezone_management.sql.
-- Target only the Sundial production project aqofdpwnswydladodblc.
--
-- This restores the two function definitions and ACLs captured immediately
-- before reconciliation, then removes the new trigger and private helpers.
-- It does not reverse legitimate timezone changes or audit rows created after
-- reconciliation.
begin;

create or replace function public.update_platform_settings(
  p_section text,
  p_expected_version bigint,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_version bigint;
begin
  if not public.current_user_is_super_admin() then
    return jsonb_build_object('status', 'permission_error');
  end if;
  if p_section not in ('general', 'new_school_defaults') then
    return jsonb_build_object('status', 'validation_error');
  end if;

  select to_jsonb(settings), settings.version
  into v_before, v_version
  from public.platform_settings settings
  where id = true
  for update;

  if v_version <> p_expected_version then
    return jsonb_build_object('status', 'stale');
  end if;

  if p_section = 'general' then
    update public.platform_settings
    set support_email = p_values->>'support_email',
        default_sender_name = p_values->>'default_sender_name',
        support_website_url = nullif(p_values->>'support_website_url', ''),
        support_phone = nullif(p_values->>'support_phone', ''),
        version = version + 1,
        updated_at = now(),
        updated_by = v_actor
    where id = true;
  else
    update public.platform_settings
    set default_timezone = p_values->>'default_timezone',
        default_appearance = p_values->>'default_appearance',
        version = version + 1,
        updated_at = now(),
        updated_by = v_actor
    where id = true;

    update public.platform_feature_defaults defaults
    set enabled = (p_values->'features'->>defaults.feature_key)::boolean,
        updated_at = now(),
        updated_by = v_actor
    where p_values->'features' ? defaults.feature_key;
  end if;

  select to_jsonb(settings)
  into v_after
  from public.platform_settings settings
  where id = true;

  insert into public.platform_settings_audit (
    actor_id,
    section,
    summary,
    previous_values,
    new_values
  ) values (
    v_actor,
    p_section,
    case
      when p_section = 'general'
        then 'Updated general platform settings'
      else 'Updated new-school defaults'
    end,
    v_before - 'updated_by',
    v_after - 'updated_by'
  );

  return jsonb_build_object(
    'status',
    'success',
    'version',
    v_after->'version'
  );
exception
  when others then
    return jsonb_build_object('status', 'server_error');
end;
$$;

create or replace function public.update_school_timezone(
  p_school_id uuid,
  p_expected_version bigint,
  p_timezone text,
  p_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_before public.schools%rowtype;
  v_authorized boolean := false;
begin
  select exists (
    select 1
    from public.users actor
    where actor.id = v_actor
      and actor.is_active is true
      and (
        lower(replace(coalesce(actor.role, ''), '_', '')) = 'superadmin'
        or (
          lower(replace(coalesce(actor.role, ''), '_', '')) = 'schooladmin'
          and actor.school_id = p_school_id
        )
        or exists (
          select 1
          from public.school_memberships membership
          where membership.user_id = actor.id
            and membership.school_id = p_school_id
            and membership.role = 'SchoolAdmin'
            and membership.is_active is true
        )
      )
  )
  into v_authorized;

  if not v_authorized then
    return jsonb_build_object('status', 'permission_error');
  end if;

  select *
  into v_before
  from public.schools
  where id = p_school_id
  for update;

  if v_before.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_before.archived_at is not null then
    return jsonb_build_object('status', 'school_unavailable');
  end if;
  if p_confirmed is not true then
    insert into public.school_timezone_audit (
      school_id,
      previous_timezone,
      new_timezone,
      actor_id,
      result_status
    ) values (
      p_school_id,
      coalesce(v_before.timezone, ''),
      coalesce(p_timezone, ''),
      v_actor,
      'rejected'
    );
    return jsonb_build_object('status', 'confirmation_required');
  end if;
  if p_expected_version is null
     or v_before.timezone_version <> p_expected_version then
    return jsonb_build_object(
      'status',
      'stale',
      'version',
      v_before.timezone_version
    );
  end if;
  if p_timezone is null
     or length(p_timezone) > 100
     or p_timezone !~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+$'
     or p_timezone like 'Etc/GMT%'
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names
       where name = p_timezone
     ) then
    insert into public.school_timezone_audit (
      school_id,
      previous_timezone,
      new_timezone,
      actor_id,
      result_status
    ) values (
      p_school_id,
      coalesce(v_before.timezone, ''),
      coalesce(p_timezone, ''),
      v_actor,
      'rejected'
    );
    return jsonb_build_object('status', 'invalid_timezone');
  end if;
  if v_before.timezone = p_timezone then
    return jsonb_build_object(
      'status',
      'no_change',
      'timezone',
      v_before.timezone,
      'version',
      v_before.timezone_version
    );
  end if;

  update public.schools
  set timezone = p_timezone,
      timezone_version = timezone_version + 1,
      timezone_updated_at = now(),
      timezone_updated_by = v_actor
  where id = p_school_id;

  insert into public.school_timezone_audit (
    school_id,
    previous_timezone,
    new_timezone,
    actor_id,
    result_status
  ) values (
    p_school_id,
    coalesce(v_before.timezone, ''),
    p_timezone,
    v_actor,
    'success'
  );

  return jsonb_build_object(
    'status',
    'success',
    'timezone',
    p_timezone,
    'version',
    v_before.timezone_version + 1
  );
exception
  when others then
    return jsonb_build_object('status', 'server_error');
end;
$$;

revoke all on function public.update_platform_settings(text, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_school_timezone(
  uuid,
  bigint,
  text,
  boolean
) from public, anon, authenticated;
grant execute on function public.update_platform_settings(text, bigint, jsonb)
  to authenticated, service_role;
grant execute on function public.update_school_timezone(
  uuid,
  bigint,
  text,
  boolean
) to authenticated, service_role;

drop trigger if exists enforce_supported_school_timezone on public.schools;
drop function if exists public.enforce_supported_school_timezone();
drop function if exists public.school_timezone_is_supported(text);

commit;
