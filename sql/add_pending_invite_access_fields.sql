alter table public.pending_admin_invites
add column if not exists role text;

alter table public.pending_admin_invites
add column if not exists permission_keys text[] not null default '{}';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pending_admin_invites_role_check'
  ) then
    alter table public.pending_admin_invites
    add constraint pending_admin_invites_role_check
    check (role is null or role in ('school_admin', 'editor'));
  end if;
end
$$;
