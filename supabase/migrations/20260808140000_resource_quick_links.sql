alter table public.resources
  add column if not exists is_quick_link boolean not null default false;

-- Preserve the menu users have today, while keeping future resources opt-in.
update public.resources
set is_quick_link = is_active is true;

alter table public.resources
  alter column is_quick_link set default false;

create or replace function public.clear_inactive_resource_quick_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_active is not true then
    new.is_quick_link := false;
  end if;
  return new;
end;
$$;

drop trigger if exists resources_clear_inactive_quick_link on public.resources;
create trigger resources_clear_inactive_quick_link
before insert or update of is_active on public.resources
for each row
execute function public.clear_inactive_resource_quick_link();

create or replace function public.set_resource_quick_link(
  p_school_id uuid,
  p_resource_id uuid,
  p_is_quick_link boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.current_user_can_manage_school_section(p_school_id, 'resources') then
    raise exception 'Not authorized to manage resources for this school'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.resources
    where id = p_resource_id
      and school_id = p_school_id
  ) then
    raise exception 'Resource not found for this school'
      using errcode = 'P0002';
  end if;

  if p_is_quick_link and not exists (
    select 1
    from public.resources
    where id = p_resource_id
      and school_id = p_school_id
      and is_active is true
  ) then
    raise exception 'Inactive resources cannot be Quick Links'
      using errcode = '22023';
  end if;

  update public.resources
  set is_quick_link = p_is_quick_link
  where id = p_resource_id
    and school_id = p_school_id;
end;
$$;

revoke all on function public.set_resource_quick_link(uuid, uuid, boolean) from public;
grant execute on function public.set_resource_quick_link(uuid, uuid, boolean) to authenticated;
