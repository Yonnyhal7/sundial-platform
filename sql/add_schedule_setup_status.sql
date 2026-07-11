alter table public.schedules
add column if not exists setup_status text not null default 'ready';

update public.schedules
set setup_status = 'ready'
where setup_status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schedules_setup_status_check'
  ) then
    alter table public.schedules
    add constraint schedules_setup_status_check
    check (setup_status in ('ready', 'needs_times'));
  end if;
end $$;
