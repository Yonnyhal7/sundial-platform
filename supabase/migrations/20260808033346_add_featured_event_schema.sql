alter table public.events
  add column if not exists is_featured boolean not null default false;

update public.events
set is_featured = false
where is_featured is null;

create unique index if not exists events_one_featured_per_school_idx
  on public.events (school_id)
  where is_featured is true;

create or replace function public.set_school_featured_event(
  p_school_id uuid,
  p_event_id uuid,
  p_featured boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.current_user_can_manage_school_section(p_school_id, 'events') then
    raise exception 'Not authorized to manage events for this school'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text, 0));

  if not exists (
    select 1
    from public.events
    where id = p_event_id
      and school_id = p_school_id
  ) then
    raise exception 'Event not found for this school'
      using errcode = 'P0002';
  end if;

  if p_featured then
    if not exists (
      select 1
      from public.events
      where id = p_event_id
        and school_id = p_school_id
        and is_active is true
    ) then
      raise exception 'Inactive events cannot be featured'
        using errcode = '22023';
    end if;

    update public.events
    set is_featured = false
    where school_id = p_school_id
      and is_featured is true
      and id <> p_event_id;

    update public.events
    set is_featured = true
    where id = p_event_id
      and school_id = p_school_id;
  else
    update public.events
    set is_featured = false
    where id = p_event_id
      and school_id = p_school_id;
  end if;
end;
$$;

revoke all on function public.set_school_featured_event(uuid, uuid, boolean) from public;
grant execute on function public.set_school_featured_event(uuid, uuid, boolean) to authenticated;
