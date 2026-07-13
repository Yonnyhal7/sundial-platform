-- Enforce schedule ownership at the database boundary.
--
-- This migration intentionally aborts before adding constraints if any legacy
-- row has missing or contradictory ownership. Resolve rows reported by the
-- exception (or the audit view after a successful dry run) explicitly; do not
-- guess a school for ambiguous data.

begin;

alter table public.periods
  add column if not exists school_id uuid;

-- A period's existing schedule is a single, unambiguous ownership path.
update public.periods p
set school_id = s.school_id
from public.schedules s
where p.schedule_id = s.id
  and p.school_id is null;

do $$
declare
  v_schedule_ids uuid[];
  v_period_ids uuid[];
  v_calendar_day_ids uuid[];
  v_draft_ids uuid[];
begin
  select array_agg(s.id order by s.id)
  into v_schedule_ids
  from public.schedules s
  left join public.schools school on school.id = s.school_id
  where s.school_id is null or school.id is null;

  select array_agg(p.id order by p.id)
  into v_period_ids
  from public.periods p
  left join public.schedules s on s.id = p.schedule_id
  where s.id is null
     or p.school_id is null
     or p.school_id is distinct from s.school_id;

  select array_agg(cd.id order by cd.id)
  into v_calendar_day_ids
  from public.calendar_days cd
  left join public.schools school on school.id = cd.school_id
  left join public.schedules assigned on assigned.id = cd.schedule_id
  left join public.schedules base on base.id = cd.base_schedule_id
  where cd.school_id is null
     or school.id is null
     or (cd.schedule_id is not null and (
       assigned.id is null or assigned.school_id is distinct from cd.school_id
     ))
     or (cd.base_schedule_id is not null and (
       base.id is null or base.school_id is distinct from cd.school_id
     ));

  select array_agg(d.id order by d.id)
  into v_draft_ids
  from public.calendar_wizard_drafts d
  left join public.schools school on school.id = d.school_id
  where d.school_id is null or school.id is null;

  if v_schedule_ids is not null
     or v_period_ids is not null
     or v_calendar_day_ids is not null
     or v_draft_ids is not null then
    raise exception using
      errcode = '23514',
      message = 'Schedule tenant isolation audit failed; migration made no changes.',
      detail = format(
        'invalid schedules=%s; invalid periods=%s; invalid calendar days=%s; invalid drafts=%s',
        coalesce(v_schedule_ids::text, '{}'),
        coalesce(v_period_ids::text, '{}'),
        coalesce(v_calendar_day_ids::text, '{}'),
        coalesce(v_draft_ids::text, '{}')
      ),
      hint = 'Repair each listed record explicitly, then rerun the migration.';
  end if;
end
$$;

alter table public.schedules
  alter column school_id set not null;

alter table public.periods
  alter column school_id set not null;

alter table public.calendar_days
  alter column school_id set not null;

alter table public.calendar_wizard_drafts
  alter column school_id set not null;

do $$
declare
  v_school_attnum smallint;
begin
  select attnum::smallint into v_school_attnum
  from pg_attribute
  where attrelid = 'public.schedules'::regclass and attname = 'school_id';
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and confrelid = 'public.schools'::regclass
      and contype = 'f'
      and conkey = array[v_school_attnum]::smallint[]
  ) then
    alter table public.schedules
      add constraint schedules_school_id_fkey
      foreign key (school_id) references public.schools(id) on delete cascade;
  end if;

  select attnum::smallint into v_school_attnum
  from pg_attribute
  where attrelid = 'public.calendar_days'::regclass and attname = 'school_id';
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calendar_days'::regclass
      and confrelid = 'public.schools'::regclass
      and contype = 'f'
      and conkey = array[v_school_attnum]::smallint[]
  ) then
    alter table public.calendar_days
      add constraint calendar_days_school_id_fkey
      foreign key (school_id) references public.schools(id) on delete cascade;
  end if;

  select attnum::smallint into v_school_attnum
  from pg_attribute
  where attrelid = 'public.calendar_wizard_drafts'::regclass and attname = 'school_id';
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.calendar_wizard_drafts'::regclass
      and confrelid = 'public.schools'::regclass
      and contype = 'f'
      and conkey = array[v_school_attnum]::smallint[]
  ) then
    alter table public.calendar_wizard_drafts
      add constraint calendar_wizard_drafts_school_id_fkey
      foreign key (school_id) references public.schools(id) on delete cascade;
  end if;
end
$$;

-- Remove only a legacy global schedule-name uniqueness rule. Schedule names
-- may repeat across schools. Name conflict handling remains school-scoped in
-- the application and AI import transaction.
do $$
declare
  v_constraint record;
  v_name_attnum smallint;
begin
  select attnum::smallint
  into v_name_attnum
  from pg_attribute
  where attrelid = 'public.schedules'::regclass
    and attname = 'schedule_name'
    and not attisdropped;

  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and contype = 'u'
      and conkey = array[v_name_attnum]::smallint[]
  loop
    execute format(
      'alter table public.schedules drop constraint %I',
      v_constraint.conname
    );
  end loop;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and conname = 'schedules_id_school_id_key'
  ) then
    alter table public.schedules
      add constraint schedules_id_school_id_key unique (id, school_id);
  end if;
end
$$;

-- Replace single-column schedule foreign keys with tenant-composite keys.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.schedules'::regclass
      and conrelid in (
        'public.periods'::regclass,
        'public.calendar_days'::regclass
      )
  loop
    execute format(
      'alter table %s drop constraint %I',
      v_constraint.table_name,
      v_constraint.conname
    );
  end loop;
end
$$;

alter table public.periods
  add constraint periods_schedule_school_fkey
  foreign key (schedule_id, school_id)
  references public.schedules (id, school_id)
  on delete cascade;

alter table public.calendar_days
  add constraint calendar_days_schedule_school_fkey
  foreign key (schedule_id, school_id)
  references public.schedules (id, school_id)
  on delete set null (schedule_id);

alter table public.calendar_days
  add constraint calendar_days_base_schedule_school_fkey
  foreign key (base_schedule_id, school_id)
  references public.schedules (id, school_id)
  on delete set null (base_schedule_id);

create index if not exists periods_school_id_idx
  on public.periods (school_id);

create index if not exists periods_school_schedule_idx
  on public.periods (school_id, schedule_id);

create index if not exists schedules_school_name_idx
  on public.schedules (school_id, schedule_name);

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.is_active is true
      and lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
  );
$$;

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
    where u.id = auth.uid()
      and u.is_active is true
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
    where u.id = auth.uid()
      and u.is_active is true
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
  );
$$;

revoke all on function public.current_user_is_super_admin() from public;
revoke all on function public.current_user_can_access_school(uuid) from public;
revoke all on function public.current_user_can_manage_school_section(uuid, text) from public;
revoke all on function public.school_is_publicly_available(uuid) from public;
grant execute on function public.current_user_is_super_admin() to authenticated;
grant execute on function public.current_user_can_access_school(uuid) to authenticated;
grant execute on function public.current_user_can_manage_school_section(uuid, text) to authenticated;
grant execute on function public.school_is_publicly_available(uuid) to anon, authenticated;

alter table public.schedules enable row level security;
alter table public.periods enable row level security;
alter table public.calendar_days enable row level security;
alter table public.calendar_wizard_drafts enable row level security;

-- Policies are permissive when combined, so remove every legacy policy on
-- these tables before installing the complete tenant policy set.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'schedules',
        'periods',
        'calendar_days',
        'calendar_wizard_drafts'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
  end loop;
end
$$;

create policy "Public can read active school schedules"
on public.schedules for select to anon
using (active is true and public.school_is_publicly_available(school_id));

create policy "Users can read schedules in their school"
on public.schedules for select to authenticated
using (public.current_user_can_access_school(school_id));

create policy "Schedule admins can insert school schedules"
on public.schedules for insert to authenticated
with check (public.current_user_can_manage_school_section(school_id, 'schedules'));

create policy "Schedule admins can update school schedules"
on public.schedules for update to authenticated
using (public.current_user_can_manage_school_section(school_id, 'schedules'))
with check (public.current_user_can_manage_school_section(school_id, 'schedules'));

create policy "Schedule admins can delete school schedules"
on public.schedules for delete to authenticated
using (public.current_user_can_manage_school_section(school_id, 'schedules'));

create policy "Public can read periods for active school schedules"
on public.periods for select to anon
using (
  public.school_is_publicly_available(school_id)
  and exists (
    select 1 from public.schedules s
    where s.id = periods.schedule_id
      and s.school_id = periods.school_id
      and s.active is true
  )
);

create policy "Users can read periods in their school"
on public.periods for select to authenticated
using (public.current_user_can_access_school(school_id));

create policy "Schedule admins can insert school periods"
on public.periods for insert to authenticated
with check (public.current_user_can_manage_school_section(school_id, 'schedules'));

create policy "Schedule admins can update school periods"
on public.periods for update to authenticated
using (public.current_user_can_manage_school_section(school_id, 'schedules'))
with check (public.current_user_can_manage_school_section(school_id, 'schedules'));

create policy "Schedule admins can delete school periods"
on public.periods for delete to authenticated
using (public.current_user_can_manage_school_section(school_id, 'schedules'));

create policy "Public can read active school calendar days"
on public.calendar_days for select to anon
using (
  public.school_is_publicly_available(school_id)
  and (
    schedule_id is null
    or exists (
      select 1 from public.schedules s
      where s.id = calendar_days.schedule_id
        and s.school_id = calendar_days.school_id
        and s.active is true
    )
  )
);

create policy "Users can read calendar days in their school"
on public.calendar_days for select to authenticated
using (public.current_user_can_access_school(school_id));

create policy "Calendar admins can insert school calendar days"
on public.calendar_days for insert to authenticated
with check (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can update school calendar days"
on public.calendar_days for update to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'))
with check (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can delete school calendar days"
on public.calendar_days for delete to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can read school drafts"
on public.calendar_wizard_drafts for select to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can insert school drafts"
on public.calendar_wizard_drafts for insert to authenticated
with check (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can update school drafts"
on public.calendar_wizard_drafts for update to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'))
with check (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can delete school drafts"
on public.calendar_wizard_drafts for delete to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'));

grant select on public.schedules, public.periods, public.calendar_days to anon;
grant select, insert, update, delete on
  public.schedules,
  public.periods,
  public.calendar_days,
  public.calendar_wizard_drafts
to authenticated;

create or replace view public.schedule_tenant_isolation_audit
with (security_invoker = true)
as
select 'schedule_without_school'::text as violation_type, s.id as record_id,
  s.school_id, null::uuid as referenced_id
from public.schedules s
left join public.schools school on school.id = s.school_id
where s.school_id is null or school.id is null
union all
select 'period_schedule_school_mismatch', p.id, p.school_id, p.schedule_id
from public.periods p
left join public.schedules s
  on s.id = p.schedule_id and s.school_id = p.school_id
where s.id is null
union all
select 'calendar_schedule_school_mismatch', cd.id, cd.school_id, cd.schedule_id
from public.calendar_days cd
left join public.schedules s
  on s.id = cd.schedule_id and s.school_id = cd.school_id
where cd.schedule_id is not null and s.id is null
union all
select 'calendar_base_schedule_school_mismatch', cd.id, cd.school_id, cd.base_schedule_id
from public.calendar_days cd
left join public.schedules s
  on s.id = cd.base_schedule_id and s.school_id = cd.school_id
where cd.base_schedule_id is not null and s.id is null
union all
select 'draft_without_school', d.id, d.school_id, null::uuid
from public.calendar_wizard_drafts d
left join public.schools school on school.id = d.school_id
where school.id is null;

revoke all on public.schedule_tenant_isolation_audit from public, anon, authenticated;
grant select on public.schedule_tenant_isolation_audit to service_role;

commit;
