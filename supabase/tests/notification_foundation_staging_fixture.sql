-- Synthetic dependencies for 20260724110000_notification_foundation.sql.
-- Run only in the dedicated sundial-migration-staging project.
begin;

drop trigger if exists initialize_notification_school_settings_after_school on public.schools;
do $cleanup$
begin
  if to_regclass('public.notification_campaigns') is not null then
    execute 'drop trigger if exists enforce_notification_campaign_tenant_relationships on public.notification_campaigns';
  end if;
  if to_regclass('public.notification_devices') is not null then
    execute 'drop trigger if exists enforce_notification_device_tenant_relationships on public.notification_devices';
  end if;
end
$cleanup$;

drop function if exists public.claim_notification_campaign(uuid);
drop function if exists public.reschedule_notification_campaign(uuid,uuid,bigint,timestamptz,text);
drop function if exists public.cancel_notification_campaign(uuid,uuid,bigint);
drop function if exists public.create_notification_campaign(uuid,text,text,text,text[],text,timestamptz,text,text,text,text,uuid,text,text,uuid,text);
drop function if exists public.notification_category_available(text,text);
drop function if exists public.enforce_notification_device_tenant_relationships();
drop function if exists public.enforce_notification_campaign_tenant_relationships();
drop function if exists public.notification_user_can_access_school(uuid,uuid);
drop function if exists public.initialize_notification_school_settings();

drop table if exists public.notification_audit cascade;
drop table if exists public.notification_deliveries cascade;
drop table if exists public.notification_device_preferences cascade;
drop table if exists public.push_subscriptions cascade;
drop table if exists public.notification_devices cascade;
drop table if exists public.notification_campaign_audiences cascade;
drop table if exists public.notification_campaigns cascade;
drop table if exists public.notification_school_settings cascade;

alter table public.schools add column if not exists subdomain text;
update public.schools
set subdomain=case id
  when '10000000-0000-0000-0000-000000000001' then 'synthetic-a'
  when '20000000-0000-0000-0000-000000000002' then 'synthetic-b'
  when '30000000-0000-0000-0000-000000000003' then 'synthetic-archived'
  else 'synthetic-'||left(replace(id::text,'-',''),12)
end
where subdomain is null;

create table if not exists public.permissions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text
);

create table if not exists public.user_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key(user_id,permission_id)
);

create table if not exists public.announcements (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade
);

create table if not exists public.events (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade
);

create table if not exists public.teams (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade
);

create table if not exists public.calendar_days (
  id uuid primary key,
  school_id uuid not null references public.schools(id) on delete cascade
);

delete from public.user_permissions
where permission_id in (
  select id from public.permissions where key='notifications'
);
delete from public.permissions where key='notifications';

insert into public.permissions(id,key,label,description)
values(
  '90000000-0000-0000-0000-000000000001',
  'existing_permission',
  'Existing permission',
  'Synthetic pre-existing permission'
)
on conflict(key) do nothing;

insert into public.users(id,school_id,role,is_active)
values(
  '00000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  'Editor',
  true
)
on conflict(id) do update
set school_id=excluded.school_id,role=excluded.role,is_active=excluded.is_active;

insert into public.school_memberships(user_id,school_id,role,is_active)
values(
  '00000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  'Editor',
  true
)
on conflict(user_id,school_id) do update
set role=excluded.role,is_active=excluded.is_active;

insert into public.announcements(id,school_id)
values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002')
on conflict(id) do update set school_id=excluded.school_id;

insert into public.events(id,school_id)
values
  ('e0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('e0000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002')
on conflict(id) do update set school_id=excluded.school_id;

insert into public.teams(id,school_id)
values
  ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002')
on conflict(id) do update set school_id=excluded.school_id;

insert into public.calendar_days(id,school_id)
values
  ('c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002')
on conflict(id) do update set school_id=excluded.school_id;

create or replace function public.current_user_can_manage_school_section(
  p_school_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.users actor
    join public.schools school on school.id=p_school_id
    where actor.id=auth.uid()
      and actor.is_active is true
      and school.archived_at is null
      and (
        lower(replace(coalesce(actor.role,''),'_',''))='superadmin'
        or (
          actor.school_id=p_school_id
          and lower(replace(coalesce(actor.role,''),'_',''))='schooladmin'
        )
        or exists (
          select 1
          from public.school_memberships membership
          where membership.user_id=actor.id
            and membership.school_id=p_school_id
            and membership.is_active is true
            and membership.role='SchoolAdmin'
        )
        or (
          (
            (
              actor.school_id=p_school_id
              and lower(coalesce(actor.role,''))='editor'
            )
            or exists (
              select 1
              from public.school_memberships membership
              where membership.user_id=actor.id
                and membership.school_id=p_school_id
                and membership.is_active is true
                and membership.role='Editor'
            )
          )
          and exists (
            select 1
            from public.user_permissions assignment
            join public.permissions permission
              on permission.id=assignment.permission_id
            where assignment.user_id=actor.id
              and permission.key=p_permission_key
          )
        )
      )
  );
$$;

commit;
