begin;

-- Supabase installs pgcrypto in the extensions schema. Do not install, move,
-- or rely on search_path resolution for extension functions in this migration.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto'
      and n.nspname = 'extensions'
  ) then
    raise exception
      'pgcrypto must already be installed in the extensions schema';
  end if;
end
$$;

alter table public.pending_admin_invites
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists acceptance_locked_at timestamptz,
  add column if not exists acceptance_session_hash text,
  add column if not exists acceptance_session_expires_at timestamptz,
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists sent_at timestamptz,
  add column if not exists delivery_attempt_count integer not null default 0,
  add column if not exists last_delivery_attempt_at timestamptz,
  add column if not exists delivery_locked_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists delivery_failure_reason text;

update public.pending_admin_invites
set expires_at = coalesce(expires_at, created_at + interval '7 days');

alter table public.pending_admin_invites
  alter column expires_at set default (now() + interval '7 days'),
  alter column expires_at set not null;

-- The pre-email implementation stored opaque tokens in plaintext. No setup
-- email was sent by that implementation, so hashing those dormant values is
-- safe and prevents future reads from exposing a usable token.
update public.pending_admin_invites
set invite_token = encode(
  extensions.digest(invite_token::text, 'sha256'::text),
  'hex'::text
)
where invite_token !~ '^[0-9a-f]{64}$';

create or replace function public.hash_pending_admin_invite_token()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invite_token !~ '^[0-9a-f]{64}$' then
    new.invite_token := encode(
      extensions.digest(new.invite_token::text, 'sha256'::text),
      'hex'::text
    );
  end if;
  return new;
end
$$;

drop trigger if exists hash_pending_admin_invite_token_before_write
  on public.pending_admin_invites;
create trigger hash_pending_admin_invite_token_before_write
before insert or update of invite_token on public.pending_admin_invites
for each row execute function public.hash_pending_admin_invite_token();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pending_admin_invites_delivery_status_check'
      and conrelid = 'public.pending_admin_invites'::regclass
  ) then
    alter table public.pending_admin_invites
      add constraint pending_admin_invites_delivery_status_check
      check (delivery_status in ('pending', 'sending', 'sent', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pending_admin_invites_delivery_attempt_count_check'
      and conrelid = 'public.pending_admin_invites'::regclass
  ) then
    alter table public.pending_admin_invites
      add constraint pending_admin_invites_delivery_attempt_count_check
      check (delivery_attempt_count >= 0);
  end if;
end
$$;

create index if not exists pending_admin_invites_delivery_idx
  on public.pending_admin_invites (school_id, delivery_status, created_at desc);
create index if not exists pending_admin_invites_active_token_idx
  on public.pending_admin_invites (invite_token)
  where status in ('pending', 'accepting') and used_at is null;
create unique index if not exists pending_admin_invites_acceptance_session_idx
  on public.pending_admin_invites (acceptance_session_hash)
  where acceptance_session_hash is not null and used_at is null;

-- Lifecycle RLS already adds a restrictive archived-school gate to this
-- table. These permissive policies provide only SuperAdmin management access;
-- anonymous acceptance is performed by the server after token verification.
drop policy if exists "SuperAdmins can read setup invitations"
  on public.pending_admin_invites;
create policy "SuperAdmins can read setup invitations"
on public.pending_admin_invites for select to authenticated
using (public.current_user_is_super_admin());

drop policy if exists "SuperAdmins can create setup invitations"
  on public.pending_admin_invites;
create policy "SuperAdmins can create setup invitations"
on public.pending_admin_invites for insert to authenticated
with check (public.current_user_is_super_admin());

drop policy if exists "SuperAdmins can update setup invitations"
  on public.pending_admin_invites;
create policy "SuperAdmins can update setup invitations"
on public.pending_admin_invites for update to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

drop policy if exists "SuperAdmins can delete setup invitations"
  on public.pending_admin_invites;
create policy "SuperAdmins can delete setup invitations"
on public.pending_admin_invites for delete to authenticated
using (public.current_user_is_super_admin());

create or replace function public.claim_school_setup_invitation_delivery(
  p_invite_id uuid,
  p_school_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_rotate_token boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.pending_admin_invites%rowtype;
  v_school public.schools%rowtype;
  v_attempt integer;
begin
  if not public.current_user_is_super_admin() then
    return jsonb_build_object('status', 'permission_error');
  end if;

  if p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at <= now()
     or p_expires_at > now() + interval '8 days' then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  select i.* into v_invite
  from public.pending_admin_invites i
  where i.id = p_invite_id
    and i.school_id = p_school_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select s.* into v_school
  from public.schools s
  where s.id = p_school_id
  for share;

  if not found or v_school.archived_at is not null then
    return jsonb_build_object('status', 'school_unavailable');
  end if;

  if v_invite.used_at is not null or v_invite.status = 'accepted' then
    return jsonb_build_object('status', 'already_used');
  end if;

  if v_invite.role is not null and v_invite.role <> 'school_admin' then
    return jsonb_build_object('status', 'not_resendable');
  end if;

  if v_invite.created_by is null then
    return jsonb_build_object('status', 'not_resendable');
  end if;

  if v_invite.delivery_status = 'sending'
     and v_invite.delivery_locked_at > now() - interval '10 minutes' then
    return jsonb_build_object('status', 'already_sending');
  end if;

  if v_invite.last_delivery_attempt_at > now() - interval '60 seconds' then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from (
        v_invite.last_delivery_attempt_at + interval '60 seconds' - now()
      )))::integer)
    );
  end if;

  if p_rotate_token then
    if v_invite.delivery_status not in ('pending', 'failed') then
      return jsonb_build_object('status', 'not_resendable');
    end if;
  elsif v_invite.invite_token <> p_token_hash then
    return jsonb_build_object('status', 'token_mismatch');
  end if;

  v_attempt := v_invite.delivery_attempt_count + 1;

  update public.pending_admin_invites
  set invite_token = case when p_rotate_token then p_token_hash else invite_token end,
      expires_at = case when p_rotate_token then p_expires_at else expires_at end,
      acceptance_session_hash = case when p_rotate_token then null else acceptance_session_hash end,
      acceptance_session_expires_at = case when p_rotate_token then null else acceptance_session_expires_at end,
      delivery_status = 'sending',
      delivery_attempt_count = v_attempt,
      last_delivery_attempt_at = now(),
      delivery_locked_at = now(),
      delivery_failure_reason = null,
      provider_message_id = null,
      updated_at = now()
  where id = p_invite_id;

  return jsonb_build_object(
    'status', 'claimed',
    'invite_id', v_invite.id,
    'school_id', v_school.id,
    'school_name', v_school.name,
    'school_subdomain', v_school.subdomain,
    'email', v_invite.email,
    'expires_at', case when p_rotate_token then p_expires_at else v_invite.expires_at end,
    'attempt_count', v_attempt
  );
end
$$;

create or replace function public.complete_school_setup_invitation_delivery(
  p_invite_id uuid,
  p_school_id uuid,
  p_attempt_count integer,
  p_success boolean,
  p_provider_message_id text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_id uuid;
begin
  if not public.current_user_is_super_admin() then
    return jsonb_build_object('status', 'permission_error');
  end if;

  update public.pending_admin_invites i
  set delivery_status = case when p_success then 'sent' else 'failed' end,
      sent_at = case when p_success then now() else i.sent_at end,
      provider_message_id = case
        when p_success then left(nullif(p_provider_message_id, ''), 255)
        else null
      end,
      delivery_failure_reason = case
        when p_success then null
        else left(coalesce(nullif(p_failure_reason, ''), 'Email provider rejected the request.'), 255)
      end,
      delivery_locked_at = null,
      updated_at = now()
  from public.schools s
  where i.id = p_invite_id
    and i.school_id = p_school_id
    and i.delivery_status = 'sending'
    and i.delivery_attempt_count = p_attempt_count
    and s.id = i.school_id
    and s.archived_at is null
  returning i.id into v_updated_id;

  if v_updated_id is null then
    return jsonb_build_object('status', 'stale_or_unavailable');
  end if;

  return jsonb_build_object('status', 'completed');
end
$$;

revoke all on function public.claim_school_setup_invitation_delivery(
  uuid, uuid, text, timestamptz, boolean
) from public, anon;
revoke all on function public.complete_school_setup_invitation_delivery(
  uuid, uuid, integer, boolean, text, text
) from public, anon;
grant execute on function public.claim_school_setup_invitation_delivery(
  uuid, uuid, text, timestamptz, boolean
) to authenticated;
grant execute on function public.complete_school_setup_invitation_delivery(
  uuid, uuid, integer, boolean, text, text
) to authenticated;

grant all on public.pending_admin_invites to service_role;

commit;
