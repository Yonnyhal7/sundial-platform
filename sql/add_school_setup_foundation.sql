alter table public.schools
add column if not exists setup_complete boolean not null default false;

alter table public.schools
add column if not exists setup_step text not null default 'welcome';

update public.schools
set setup_complete = coalesce(is_active, false)
where setup_complete is false;

update public.schools
set setup_step = 'complete'
where setup_complete is true
  and setup_step <> 'complete';

create table if not exists public.pending_admin_invites (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null,
  invite_token text not null unique,
  status text not null default 'pending',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pending_admin_invites_school_id_idx
on public.pending_admin_invites (school_id);

create index if not exists pending_admin_invites_email_idx
on public.pending_admin_invites (lower(email));

alter table public.pending_admin_invites enable row level security;
