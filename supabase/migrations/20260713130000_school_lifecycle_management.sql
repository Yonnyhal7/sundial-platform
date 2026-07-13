begin;

alter table public.schools
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null,
  add column if not exists lifecycle_version bigint not null default 0;

create index if not exists schools_archived_at_idx
  on public.schools (archived_at);

create table if not exists public.school_deletion_audits (
  id uuid primary key default gen_random_uuid(),
  deleted_school_id uuid not null,
  deleted_school_name text not null,
  deleted_school_subdomain text not null,
  acting_super_admin_id uuid,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  outcome text not null,
  detail text,
  constraint school_deletion_audits_outcome_check check (
    outcome in (
      'database_deleted_storage_pending',
      'completed',
      'storage_failed',
      'database_failed'
    )
  )
);

create table if not exists public.school_storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  deleted_school_id uuid not null,
  deleted_school_name text not null,
  deleted_school_subdomain text not null,
  requested_by uuid,
  deletion_audit_id uuid references public.school_deletion_audits(id) on delete set null,
  storage_manifest jsonb not null default '[]'::jsonb,
  status text not null default 'database_pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint school_storage_cleanup_jobs_status_check check (
    status in (
      'database_pending',
      'database_failed',
      'database_deleted',
      'storage_failed',
      'completed'
    )
  ),
  constraint school_storage_cleanup_jobs_manifest_check check (
    jsonb_typeof(storage_manifest) = 'array'
  )
);

create index if not exists school_storage_cleanup_jobs_status_idx
  on public.school_storage_cleanup_jobs (status, updated_at);

create unique index if not exists school_storage_cleanup_jobs_one_pending_per_school_idx
  on public.school_storage_cleanup_jobs (deleted_school_id)
  where status in ('database_pending', 'database_failed');

alter table public.school_deletion_audits enable row level security;
alter table public.school_storage_cleanup_jobs enable row level security;

drop policy if exists "SuperAdmins can read school deletion audits"
  on public.school_deletion_audits;
create policy "SuperAdmins can read school deletion audits"
on public.school_deletion_audits for select to authenticated
using (public.current_user_is_super_admin());

drop policy if exists "SuperAdmins can read school storage cleanup jobs"
  on public.school_storage_cleanup_jobs;
create policy "SuperAdmins can read school storage cleanup jobs"
on public.school_storage_cleanup_jobs for select to authenticated
using (public.current_user_is_super_admin());

revoke all on public.school_deletion_audits from public, anon, authenticated;
revoke all on public.school_storage_cleanup_jobs from public, anon, authenticated;
grant select on public.school_deletion_audits to authenticated;
grant select on public.school_storage_cleanup_jobs to authenticated;
grant all on public.school_deletion_audits to service_role;
grant all on public.school_storage_cleanup_jobs to service_role;

create or replace function public.current_user_can_access_school(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.schools school on school.id = p_school_id
    where u.id = auth.uid()
      and u.is_active is true
      and school.archived_at is null
      and (
        lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
        or u.school_id = p_school_id
      )
  );
$$;

create or replace function public.current_user_can_manage_school_section(
  p_school_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.schools school on school.id = p_school_id
    where u.id = auth.uid()
      and u.is_active is true
      and school.archived_at is null
      and (
        lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
        or (
          u.school_id = p_school_id
          and lower(coalesce(u.role, '')) in ('school_admin', 'schooladmin')
        )
        or (
          u.school_id = p_school_id
          and lower(coalesce(u.role, '')) = 'editor'
          and exists (
            select 1
            from public.user_permissions up
            join public.permissions permission on permission.id = up.permission_id
            where up.user_id = u.id
              and permission.key = p_permission_key
          )
        )
      )
  );
$$;

create or replace function public.school_is_publicly_available(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schools s
    where s.id = p_school_id
      and s.is_active is true
      and s.archived_at is null
  );
$$;

create or replace function public.current_user_school_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.school_id
  from public.users u
  join public.schools school on school.id = u.school_id
  where u.id = auth.uid()
    and u.is_active is true
    and school.archived_at is null
  limit 1;
$$;

create or replace function public.is_school_admin_or_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.schools school on school.id = u.school_id
    where u.id = auth.uid()
      and u.is_active is true
      and school.archived_at is null
      and lower(coalesce(u.role, '')) in (
        'school_admin', 'schooladmin', 'editor'
      )
  );
$$;

revoke all on function public.current_user_can_access_school(uuid) from public;
revoke all on function public.current_user_can_manage_school_section(uuid, text) from public;
revoke all on function public.school_is_publicly_available(uuid) from public;
revoke all on function public.current_user_school_id() from public;
revoke all on function public.is_school_admin_or_editor() from public;
grant execute on function public.current_user_can_access_school(uuid) to authenticated;
grant execute on function public.current_user_can_manage_school_section(uuid, text) to authenticated;
grant execute on function public.school_is_publicly_available(uuid) to anon, authenticated;
grant execute on function public.current_user_school_id() to authenticated;
grant execute on function public.is_school_admin_or_editor() to authenticated;

create or replace function public.storage_object_school_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if coalesce(v_parts[1], '') <> 'schools' then
    return null;
  end if;
  return v_parts[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function public.storage_object_school_id(text) from public;
grant execute on function public.storage_object_school_id(text) to authenticated;

create or replace function public.legacy_storage_object_is_available(
  p_bucket_id text,
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select case
    -- The deployed resource uploader does not encode a tenant identifier in
    -- its object path. Preserve it for one deployment window, but only for an
    -- active school administrator/editor or a SuperAdmin. The application
    -- still writes the resource row with normal school-scoped RLS.
    when p_bucket_id = 'resource-file'
      and coalesce((storage.foldername(p_name))[1], '') = 'resources'
    then public.is_school_admin_or_editor() or public.current_user_is_super_admin()
    -- Legacy logos do include the school slug, so retain full tenant binding.
    when p_bucket_id = 'school-logos'
      and coalesce((storage.foldername(p_name))[1], '') = 'logos'
    then exists (
      select 1
      from public.schools school
      where lower(school.subdomain) = lower((storage.foldername(p_name))[2])
        and school.archived_at is null
        and public.current_user_can_access_school(school.id)
    )
    else false
  end;
$$;

revoke all on function public.legacy_storage_object_is_available(text, text) from public;
grant execute on function public.legacy_storage_object_is_available(text, text) to authenticated;

drop policy if exists "Archived school storage is unavailable" on storage.objects;
create policy "Archived school storage is unavailable"
on storage.objects as restrictive for all to authenticated
using (
  bucket_id not in ('school-logos', 'resource-file')
  or public.current_user_can_access_school(public.storage_object_school_id(name))
  or public.legacy_storage_object_is_available(bucket_id, name)
)
with check (
  bucket_id not in ('school-logos', 'resource-file')
  or public.current_user_can_access_school(public.storage_object_school_id(name))
  or public.legacy_storage_object_is_available(bucket_id, name)
);

create or replace function public.get_available_school_by_subdomain(subdomain_input text)
returns setof public.schools
language sql
stable
security definer
set search_path = public
as $$
  select school.*
  from public.schools school
  where lower(school.subdomain) = lower(trim(subdomain_input))
    and school.archived_at is null
    and (
      school.is_active is true
      or public.current_user_is_super_admin()
      or exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and u.is_active is true
          and u.school_id = school.id
      )
    )
  limit 1;
$$;

revoke all on function public.get_available_school_by_subdomain(text) from public;
grant execute on function public.get_available_school_by_subdomain(text) to anon, authenticated;
grant execute on function public.get_available_school_by_subdomain(text) to service_role;

-- Deployment compatibility: the currently deployed application resolves every
-- public, admin, kiosk, PWA, and offline route through this legacy RPC. Keep its
-- exact signature and permissions until the archive-aware application has been
-- deployed and verified. A future cleanup migration may revoke and remove it.
create or replace function public.get_school_by_subdomain(subdomain_input text)
returns table(
  id uuid,
  district_id uuid,
  name text,
  slug text,
  subdomain text,
  mascot text,
  primary_color text,
  secondary_color text,
  logo_url text,
  timezone text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.district_id,
    s.name,
    s.slug,
    s.subdomain,
    s.mascot,
    s.primary_color,
    s.secondary_color,
    s.logo_url,
    s.timezone,
    s.is_active
  from public.schools s
  where lower(s.subdomain) = lower(subdomain_input)
    and s.is_active = true
    and s.archived_at is null
  limit 1;
$$;

-- Intentionally do not revoke or grant on the legacy function here.
-- CREATE OR REPLACE preserves its existing PUBLIC, anon, authenticated, and
-- service_role execute ACL during the rolling deployment.

-- Compatibility policies make the migration safe even if one of these legacy
-- content tables previously relied on RLS being disabled. They mirror the live
-- application's public reads and permission-checked admin mutations, while the
-- restrictive archive gate below remains an independent requirement.
do $$
declare
  v_table text;
  v_permission text;
begin
  foreach v_table in array array[
    'announcements', 'events', 'sports', 'teams', 'games', 'resources'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'drop policy if exists %I on public.%I',
      'Lifecycle rollout public school reads',
      v_table
    );
    execute format(
      'create policy %I on public.%I for select to anon '
      || 'using (public.school_is_publicly_available(school_id))',
      'Lifecycle rollout public school reads',
      v_table
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'Lifecycle rollout authenticated school reads',
      v_table
    );
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.current_user_can_access_school(school_id))',
      'Lifecycle rollout authenticated school reads',
      v_table
    );

    v_permission := case
      when v_table = 'announcements' then 'announcements'
      when v_table = 'events' then 'events'
      when v_table in ('sports', 'teams', 'games') then 'athletics'
      when v_table = 'resources' then 'resources'
    end;

    execute format(
      'drop policy if exists %I on public.%I',
      'Lifecycle rollout permission mutations',
      v_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.current_user_can_manage_school_section(school_id, %L)) '
      || 'with check (public.current_user_can_manage_school_section(school_id, %L))',
      'Lifecycle rollout permission mutations',
      v_table,
      v_permission,
      v_permission
    );
  end loop;
end
$$;

-- Add an archive gate as a restrictive policy. Existing feature/permission
-- policies remain intact and must also pass, while archived tenant rows fail
-- every read and mutation regardless of which permissive policy matched.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'analytics',
    'announcements',
    'calendar_days',
    'calendar_wizard_drafts',
    'events',
    'feature_flags',
    'games',
    'notifications',
    'pending_admin_invites',
    'periods',
    'resources',
    'schedule_patterns',
    'schedules',
    'sports',
    'teams'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format(
      'drop policy if exists %I on public.%I',
      'Archived schools are unavailable',
      v_table
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to public '
      || 'using (school_id is null or exists ('
      || 'select 1 from public.schools lifecycle_school '
      || 'where lifecycle_school.id = school_id '
      || 'and lifecycle_school.archived_at is null)) '
      || 'with check (school_id is null or exists ('
      || 'select 1 from public.schools lifecycle_school '
      || 'where lifecycle_school.id = school_id '
      || 'and lifecycle_school.archived_at is null))',
      'Archived schools are unavailable',
      v_table
    );
  end loop;
end
$$;

alter table public.schools enable row level security;
drop policy if exists "Lifecycle rollout anonymous school reads" on public.schools;
create policy "Lifecycle rollout anonymous school reads"
on public.schools for select to anon
using (archived_at is null and is_active is true);

drop policy if exists "Lifecycle rollout authenticated school reads" on public.schools;
create policy "Lifecycle rollout authenticated school reads"
on public.schools for select to authenticated
using (
  public.current_user_is_super_admin()
  or (archived_at is null and public.current_user_can_access_school(id))
);

drop policy if exists "Lifecycle rollout SuperAdmin school inserts" on public.schools;
create policy "Lifecycle rollout SuperAdmin school inserts"
on public.schools for insert to authenticated
with check (public.current_user_is_super_admin());

drop policy if exists "Lifecycle rollout SuperAdmin school updates" on public.schools;
create policy "Lifecycle rollout SuperAdmin school updates"
on public.schools for update to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "Lifecycle rollout SuperAdmin school deletes" on public.schools;
create policy "Lifecycle rollout SuperAdmin school deletes"
on public.schools for delete to authenticated
using (public.current_user_is_super_admin());

drop policy if exists "Anonymous users cannot read archived schools" on public.schools;
create policy "Anonymous users cannot read archived schools"
on public.schools as restrictive for select to anon
using (archived_at is null and is_active is true);

drop policy if exists "Authenticated users cannot use archived schools" on public.schools;
create policy "Authenticated users cannot use archived schools"
on public.schools as restrictive for all to authenticated
using (archived_at is null or public.current_user_is_super_admin())
with check (archived_at is null or public.current_user_is_super_admin());

create or replace function public.archive_school(
  p_school_id uuid,
  p_expected_name text,
  p_expected_subdomain text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school public.schools%rowtype;
begin
  if not public.current_user_is_super_admin() then
    return jsonb_build_object('status', 'permission_error');
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id
  for update;

  if v_school.id is null
     or v_school.name is distinct from p_expected_name
     or v_school.subdomain is distinct from p_expected_subdomain then
    return jsonb_build_object('status', 'stale_target');
  end if;

  if v_school.archived_at is not null then
    return jsonb_build_object(
      'status', 'already_archived',
      'archivedAt', v_school.archived_at
    );
  end if;

  update public.schools
  set archived_at = clock_timestamp(),
      archived_by = v_user_id,
      lifecycle_version = lifecycle_version + 1
  where id = p_school_id
  returning archived_at into v_school.archived_at;

  return jsonb_build_object(
    'status', 'success',
    'archivedAt', v_school.archived_at
  );
end;
$$;

create or replace function public.restore_school(
  p_school_id uuid,
  p_expected_name text,
  p_expected_subdomain text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school public.schools%rowtype;
begin
  if not public.current_user_is_super_admin() then
    return jsonb_build_object('status', 'permission_error');
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id
  for update;

  if v_school.id is null
     or v_school.name is distinct from p_expected_name
     or v_school.subdomain is distinct from p_expected_subdomain then
    return jsonb_build_object('status', 'stale_target');
  end if;

  if v_school.archived_at is null then
    return jsonb_build_object('status', 'already_active');
  end if;

  update public.schools
  set archived_at = null,
      archived_by = null,
      lifecycle_version = lifecycle_version + 1
  where id = p_school_id;

  return jsonb_build_object('status', 'success');
end;
$$;

create or replace function public.school_deletion_summary_json(p_school_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'schedules', (select count(*) from public.schedules where school_id = p_school_id),
    'periods', (select count(*) from public.periods where school_id = p_school_id),
    'calendarDays', (select count(*) from public.calendar_days where school_id = p_school_id),
    'users', (select count(*) from public.users where school_id = p_school_id),
    'drafts', (select count(*) from public.calendar_wizard_drafts where school_id = p_school_id),
    'announcements', (select count(*) from public.announcements where school_id = p_school_id),
    'events', (select count(*) from public.events where school_id = p_school_id),
    'sports', (select count(*) from public.sports where school_id = p_school_id),
    'teams', (select count(*) from public.teams where school_id = p_school_id),
    'games', (select count(*) from public.games where school_id = p_school_id),
    'resources', (select count(*) from public.resources where school_id = p_school_id),
    'notifications', (select count(*) from public.notifications where school_id = p_school_id),
    'analytics', (select count(*) from public.analytics where school_id = p_school_id),
    'featureFlags', (select count(*) from public.feature_flags where school_id = p_school_id),
    'schedulePatterns', (select count(*) from public.schedule_patterns where school_id = p_school_id),
    'invitations', (select count(*) from public.pending_admin_invites where school_id = p_school_id),
    'kioskSettings', 0,
    'storedFiles',
      (select count(*) from public.resources where school_id = p_school_id and file_url is not null)
      + (select count(*) from public.events where school_id = p_school_id and image_url is not null)
      + (select case when logo_url is null then 0 else 1 end from public.schools where id = p_school_id)
  );
$$;

create or replace function public.get_archived_school_deletion_summary(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_school public.schools%rowtype;
begin
  if not public.current_user_is_super_admin() then
    return jsonb_build_object('status', 'permission_error');
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id;

  if v_school.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_school.archived_at is null then
    return jsonb_build_object('status', 'school_not_archived');
  end if;

  return jsonb_build_object(
    'status', 'success',
    'counts', public.school_deletion_summary_json(p_school_id)
  );
end;
$$;

create or replace function public.permanently_delete_archived_school(
  p_school_id uuid,
  p_expected_name text,
  p_expected_subdomain text,
  p_cleanup_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school public.schools%rowtype;
  v_job public.school_storage_cleanup_jobs%rowtype;
  v_unknown_tables text[];
  v_summary jsonb;
  v_audit_id uuid;
begin
  if not public.current_user_is_super_admin() then
    return jsonb_build_object('status', 'permission_error');
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id
  for update;

  if v_school.id is null
     or v_school.name is distinct from p_expected_name
     or v_school.subdomain is distinct from p_expected_subdomain then
    return jsonb_build_object('status', 'stale_target');
  end if;
  if v_school.archived_at is null then
    return jsonb_build_object('status', 'school_not_archived');
  end if;

  select * into v_job
  from public.school_storage_cleanup_jobs
  where id = p_cleanup_job_id
    and deleted_school_id = p_school_id
    and deleted_school_name = p_expected_name
    and deleted_school_subdomain = p_expected_subdomain
    and status in ('database_pending', 'database_failed')
  for update;

  if v_job.id is null then
    return jsonb_build_object('status', 'invalid_cleanup_job');
  end if;

  select array_agg(format('%I.%I', namespace.nspname, relation.relname) order by relation.relname)
  into v_unknown_tables
  from pg_constraint constraint_row
  join pg_class relation on relation.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.schools'::regclass
    and format('%I.%I', namespace.nspname, relation.relname) <> all (array[
      'public.analytics',
      'public.announcements',
      'public.calendar_days',
      'public.calendar_wizard_drafts',
      'public.events',
      'public.feature_flags',
      'public.games',
      'public.notifications',
      'public.pending_admin_invites',
      'public.periods',
      'public.resources',
      'public.schedule_patterns',
      'public.schedules',
      'public.sports',
      'public.teams',
      'public.users'
    ]::text[]);

  if v_unknown_tables is not null then
    raise exception 'Deletion blocked: unaudited school foreign keys on %', v_unknown_tables;
  end if;

  v_summary := public.school_deletion_summary_json(p_school_id);

  delete from public.calendar_days where school_id = p_school_id;
  delete from public.periods where school_id = p_school_id;
  delete from public.games where school_id = p_school_id;
  delete from public.teams where school_id = p_school_id;
  delete from public.sports where school_id = p_school_id;
  delete from public.calendar_wizard_drafts where school_id = p_school_id;
  delete from public.schedule_patterns where school_id = p_school_id;
  delete from public.schedules where school_id = p_school_id;
  delete from public.notifications where school_id = p_school_id;
  delete from public.analytics where school_id = p_school_id;
  delete from public.feature_flags where school_id = p_school_id;
  delete from public.announcements where school_id = p_school_id;
  delete from public.events where school_id = p_school_id;
  delete from public.resources where school_id = p_school_id;
  delete from public.pending_admin_invites where school_id = p_school_id;

  update public.users
  set school_id = null,
      is_active = case
        when lower(coalesce(role, '')) in ('super_admin', 'superadmin') then is_active
        else false
      end
  where school_id = p_school_id;

  delete from public.schools
  where id = p_school_id
    and archived_at is not null;

  if not found then
    raise exception 'Archived school disappeared during deletion';
  end if;

  insert into public.school_deletion_audits (
    deleted_school_id,
    deleted_school_name,
    deleted_school_subdomain,
    acting_super_admin_id,
    outcome
  ) values (
    p_school_id,
    p_expected_name,
    p_expected_subdomain,
    v_user_id,
    'database_deleted_storage_pending'
  )
  returning id into v_audit_id;

  update public.school_storage_cleanup_jobs
  set status = 'database_deleted',
      deletion_audit_id = v_audit_id,
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where id = p_cleanup_job_id;

  return jsonb_build_object(
    'status', 'success',
    'auditId', v_audit_id,
    'counts', v_summary
  );
exception
  when others then
    insert into public.school_deletion_audits (
      deleted_school_id,
      deleted_school_name,
      deleted_school_subdomain,
      acting_super_admin_id,
      completed_at,
      outcome,
      detail
    ) values (
      p_school_id,
      p_expected_name,
      p_expected_subdomain,
      v_user_id,
      now(),
      'database_failed',
      left(sqlerrm, 1000)
    )
    returning id into v_audit_id;

    update public.school_storage_cleanup_jobs
    set status = 'database_failed',
        deletion_audit_id = v_audit_id,
        attempts = attempts + 1,
        last_error = left(sqlerrm, 1000),
        updated_at = now()
    where id = p_cleanup_job_id;

    return jsonb_build_object(
      'status', 'server_error',
      'message', 'The database deletion was rolled back.'
    );
end;
$$;

-- Preserve the already-applied AI-calendar implementation without copying or
-- modifying its transaction logic. Both deployment generations call wrappers
-- below, while only the internal implementation loses application-role access.
alter function public.create_ai_calendar_from_draft(
  uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb
) rename to create_ai_calendar_from_draft_unchecked;

revoke all on function public.create_ai_calendar_from_draft_unchecked(
  uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb
) from public, anon, authenticated;

create or replace function public.create_ai_calendar_from_draft(
  p_school_id uuid,
  p_draft_id uuid,
  p_expected_draft_updated_at timestamptz,
  p_start_date date,
  p_end_date date,
  p_replace_existing boolean,
  p_schedules jsonb,
  p_calendar_days jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.schools
    where id = p_school_id and archived_at is null
  ) then
    return jsonb_build_object(
      'status', 'permission_error',
      'message', 'This school is unavailable.'
    );
  end if;

  return public.create_ai_calendar_from_draft_unchecked(
    p_school_id,
    p_draft_id,
    p_expected_draft_updated_at,
    p_start_date,
    p_end_date,
    p_replace_existing,
    p_schedules,
    p_calendar_days
  );
end;
$$;

create or replace function public.create_available_ai_calendar_from_draft(
  p_school_id uuid,
  p_draft_id uuid,
  p_expected_draft_updated_at timestamptz,
  p_start_date date,
  p_end_date date,
  p_replace_existing boolean,
  p_schedules jsonb,
  p_calendar_days jsonb
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.create_ai_calendar_from_draft(
    p_school_id,
    p_draft_id,
    p_expected_draft_updated_at,
    p_start_date,
    p_end_date,
    p_replace_existing,
    p_schedules,
    p_calendar_days
  );
$$;

revoke all on function public.archive_school(uuid, text, text) from public;
revoke all on function public.restore_school(uuid, text, text) from public;
revoke all on function public.school_deletion_summary_json(uuid) from public;
revoke all on function public.get_archived_school_deletion_summary(uuid) from public;
revoke all on function public.permanently_delete_archived_school(uuid, text, text, uuid) from public;
revoke all on function public.create_ai_calendar_from_draft(uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb) from public;
revoke all on function public.create_available_ai_calendar_from_draft(uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb) from public;

grant execute on function public.archive_school(uuid, text, text) to authenticated;
grant execute on function public.restore_school(uuid, text, text) to authenticated;
grant execute on function public.get_archived_school_deletion_summary(uuid) to authenticated;
grant execute on function public.permanently_delete_archived_school(uuid, text, text, uuid) to authenticated;
grant execute on function public.create_ai_calendar_from_draft(uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb) to authenticated;
grant execute on function public.create_available_ai_calendar_from_draft(uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb) to authenticated;

commit;
