create table if not exists public.calendar_wizard_drafts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  draft_type text not null default 'school_year_calendar',
  school_year_label text,
  wizard_data jsonb not null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_wizard_drafts_type_check
    check (draft_type in (
      'school_year_calendar',
      'school_year_calendar_ai',
      'school_year_calendar_guided'
    )),
  constraint calendar_wizard_drafts_school_type_unique
    unique (school_id, draft_type)
);

create index if not exists calendar_wizard_drafts_school_id_idx
on public.calendar_wizard_drafts (school_id);

alter table public.calendar_wizard_drafts
  drop constraint if exists calendar_wizard_drafts_type_check;

alter table public.calendar_wizard_drafts
  add constraint calendar_wizard_drafts_type_check
  check (draft_type in (
    'school_year_calendar',
    'school_year_calendar_ai',
    'school_year_calendar_guided'
  ));

alter table public.calendar_wizard_drafts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_wizard_drafts'
      and policyname = 'Calendar admins can read calendar wizard drafts'
  ) then
    create policy "Calendar admins can read calendar wizard drafts"
    on public.calendar_wizard_drafts
    for select
    to authenticated
    using (
      exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.is_active is true
          and (
            lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) in ('school_admin', 'schooladmin')
            )
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) = 'editor'
              and exists (
                select 1
                from public.user_permissions up
                join public.permissions p on p.id = up.permission_id
                where up.user_id = u.id
                  and p.key = 'calendar'
              )
            )
          )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_wizard_drafts'
      and policyname = 'Calendar admins can insert calendar wizard drafts'
  ) then
    create policy "Calendar admins can insert calendar wizard drafts"
    on public.calendar_wizard_drafts
    for insert
    to authenticated
    with check (
      exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.is_active is true
          and (
            lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) in ('school_admin', 'schooladmin')
            )
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) = 'editor'
              and exists (
                select 1
                from public.user_permissions up
                join public.permissions p on p.id = up.permission_id
                where up.user_id = u.id
                  and p.key = 'calendar'
              )
            )
          )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_wizard_drafts'
      and policyname = 'Calendar admins can update calendar wizard drafts'
  ) then
    create policy "Calendar admins can update calendar wizard drafts"
    on public.calendar_wizard_drafts
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.is_active is true
          and (
            lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) in ('school_admin', 'schooladmin')
            )
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) = 'editor'
              and exists (
                select 1
                from public.user_permissions up
                join public.permissions p on p.id = up.permission_id
                where up.user_id = u.id
                  and p.key = 'calendar'
              )
            )
          )
      )
    )
    with check (
      exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.is_active is true
          and (
            lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) in ('school_admin', 'schooladmin')
            )
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) = 'editor'
              and exists (
                select 1
                from public.user_permissions up
                join public.permissions p on p.id = up.permission_id
                where up.user_id = u.id
                  and p.key = 'calendar'
              )
            )
          )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_wizard_drafts'
      and policyname = 'Calendar admins can delete calendar wizard drafts'
  ) then
    create policy "Calendar admins can delete calendar wizard drafts"
    on public.calendar_wizard_drafts
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.users u
        where u.id = auth.uid()
          and u.is_active is true
          and (
            lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) in ('school_admin', 'schooladmin')
            )
            or (
              u.school_id = calendar_wizard_drafts.school_id
              and lower(coalesce(u.role, '')) = 'editor'
              and exists (
                select 1
                from public.user_permissions up
                join public.permissions p on p.id = up.permission_id
                where up.user_id = u.id
                  and p.key = 'calendar'
              )
            )
          )
      )
    );
  end if;
end $$;
