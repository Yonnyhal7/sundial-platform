-- Synthetic representation of the production objects relevant to
-- 20260720200000. Run only in the dedicated sundial-migration-staging project.
begin;

drop schema if exists timezone_test cascade;
create schema timezone_test;

drop table if exists public.school_timezone_audit cascade;
drop table if exists public.platform_settings_audit cascade;
drop table if exists public.platform_feature_defaults cascade;
drop table if exists public.platform_settings cascade;
drop table if exists public.school_memberships cascade;
drop table if exists public.users cascade;
drop table if exists public.schools cascade;

create table public.schools (
  id uuid primary key,
  name text not null,
  timezone text not null default 'America/Los_Angeles',
  timezone_version bigint not null default 1,
  timezone_updated_at timestamptz,
  archived_at timestamptz
);

create table public.users (
  id uuid primary key,
  school_id uuid references public.schools(id) on delete set null,
  role text not null,
  is_active boolean not null default true
);

alter table public.schools
  add column timezone_updated_by uuid references public.users(id) on delete set null;

create table public.school_memberships (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  role text not null check (role in ('SchoolAdmin', 'Editor')),
  is_active boolean not null default true,
  unique (user_id, school_id)
);

create table public.school_timezone_audit (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id) on delete restrict,
  previous_timezone text not null,
  new_timezone text not null,
  actor_id uuid references public.users(id) on delete set null,
  result_status text not null check (result_status in ('success', 'rejected')),
  created_at timestamptz not null default now()
);

create index school_timezone_audit_school_created_idx
  on public.school_timezone_audit (school_id, created_at desc);

create table public.platform_settings (
  id boolean primary key default true check (id),
  support_email text not null default 'support@sundialk12.com',
  default_sender_name text not null default 'Sundial',
  support_website_url text,
  support_phone text,
  default_timezone text not null default 'America/Los_Angeles',
  default_appearance text not null default 'system'
    check (default_appearance in ('light', 'dark', 'system')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table public.platform_feature_defaults (
  feature_key text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table public.platform_settings_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  section text not null check (section in ('general', 'new_school_defaults')),
  summary text not null,
  previous_values jsonb not null,
  new_values jsonb not null,
  result_status text not null default 'success'
    check (result_status in ('success', 'rejected')),
  created_at timestamptz not null default now()
);

insert into public.schools (id, name, timezone, archived_at)
values
  ('10000000-0000-0000-0000-000000000001', 'Synthetic School A', 'America/Los_Angeles', null),
  ('20000000-0000-0000-0000-000000000002', 'Synthetic School B', 'America/New_York', null),
  ('30000000-0000-0000-0000-000000000003', 'Synthetic Archived School', 'America/Denver', now());

insert into public.users (id, school_id, role, is_active)
values
  ('00000000-0000-0000-0000-000000000001', null, 'SuperAdmin', true),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'SchoolAdmin', true),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Editor', true),
  ('00000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'SchoolAdmin', true),
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'SchoolAdmin', false);

insert into public.school_memberships (user_id, school_id, role, is_active)
values
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'SchoolAdmin', true),
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Editor', true),
  ('00000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'SchoolAdmin', true),
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'SchoolAdmin', true);

insert into public.school_timezone_audit (
  school_id,
  previous_timezone,
  new_timezone,
  actor_id,
  result_status
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'America/Phoenix',
    'America/Los_Angeles',
    '00000000-0000-0000-0000-000000000001',
    'success'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'America/Chicago',
    'America/New_York',
    '00000000-0000-0000-0000-000000000004',
    'success'
  );

insert into public.platform_settings (id) values (true);
insert into public.platform_feature_defaults (feature_key, enabled)
values ('pwa', true), ('offline_mode', true);

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_active is true
      and lower(replace(coalesce(role, ''), '_', '')) = 'superadmin'
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
    from public.users actor
    join public.schools school on school.id = p_school_id
    where actor.id = auth.uid()
      and actor.is_active is true
      and school.archived_at is null
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
  );
$$;

alter table public.school_timezone_audit enable row level security;
create policy "School administrators read timezone audit"
on public.school_timezone_audit
for select
to authenticated
using (public.current_user_can_manage_school_section(school_id, 'settings'));

revoke all on public.school_timezone_audit from public, anon, authenticated;
grant select on public.school_timezone_audit to authenticated;
grant all on public.school_timezone_audit to service_role;

-- These placeholders reproduce the live signatures and application-role ACLs.
-- The reconciliation must replace them without breaking callers.
create or replace function public.update_platform_settings(
  p_section text,
  p_expected_version bigint,
  p_values jsonb
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object('status', 'legacy_placeholder');
$$;

create or replace function public.update_school_timezone(
  p_school_id uuid,
  p_expected_version bigint,
  p_timezone text,
  p_confirmed boolean
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('status', 'legacy_placeholder');
$$;

revoke all on function public.update_platform_settings(text, bigint, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_school_timezone(uuid, bigint, text, boolean)
  from public, anon, authenticated;
grant execute on function public.update_platform_settings(text, bigint, jsonb)
  to authenticated;
grant execute on function public.update_school_timezone(uuid, bigint, text, boolean)
  to authenticated;

create table timezone_test.baseline (
  key text primary key,
  value text not null
);

insert into timezone_test.baseline (key, value)
values
  (
    'audit_rows',
    (select count(*)::text from public.school_timezone_audit)
  ),
  (
    'audit_fingerprint',
    (
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
      from public.school_timezone_audit
    )
  ),
  (
    'audit_policy_fingerprint',
    (
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
      from pg_catalog.pg_policies
      where schemaname = 'public'
        and tablename = 'school_timezone_audit'
    )
  ),
  (
    'audit_grant_fingerprint',
    (
      select md5(
        string_agg(
          concat_ws('|', grantee, privilege_type, is_grantable),
          E'\n'
          order by grantee, privilege_type
        )
      )
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'school_timezone_audit'
    )
  ),
  (
    'audit_column_fingerprint',
    (
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
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'school_timezone_audit'
    )
  );

commit;
