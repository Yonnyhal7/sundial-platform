alter table public.calendar_days
add column if not exists base_schedule_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'calendar_days_base_schedule_id_fkey'
  ) then
    alter table public.calendar_days
    add constraint calendar_days_base_schedule_id_fkey
    foreign key (base_schedule_id)
    references public.schedules(id)
    on delete set null;
  end if;
end $$;

create index if not exists calendar_days_base_schedule_id_idx
on public.calendar_days (base_schedule_id);
