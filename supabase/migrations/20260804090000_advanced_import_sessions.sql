create table if not exists public.advanced_import_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  workflow_version text not null,
  pipeline_version text not null,
  status text not null check (status in ('active','completed','failed')),
  current_stage text not null check (current_stage in ('uploaded','rendering_pages','render_complete','classification','extraction','building','verification','validation','review','completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.advanced_import_artifacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.advanced_import_sessions(id) on delete cascade,
  type text not null,
  path text not null,
  page_number integer,
  content_type text not null,
  size_bytes bigint not null,
  checksum_sha256 text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, path)
);

create table if not exists public.advanced_import_page_metadata (
  session_id uuid not null references public.advanced_import_sessions(id) on delete cascade,
  page_number integer not null,
  width integer not null,
  height integer not null,
  dpi integer not null,
  rotation integer not null default 0,
  render_time_ms integer not null,
  artifact_id uuid not null references public.advanced_import_artifacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(session_id, page_number)
);

create table if not exists public.advanced_import_diagnostics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.advanced_import_sessions(id) on delete cascade,
  category text not null,
  name text not null,
  value jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists advanced_import_sessions_school_created_idx on public.advanced_import_sessions(school_id, created_at desc);
create index if not exists advanced_import_artifacts_session_idx on public.advanced_import_artifacts(session_id, created_at);
create index if not exists advanced_import_diagnostics_session_idx on public.advanced_import_diagnostics(session_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit)
values ('advanced-import-artifacts', 'advanced-import-artifacts', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

alter table public.advanced_import_sessions enable row level security;
alter table public.advanced_import_artifacts enable row level security;
alter table public.advanced_import_page_metadata enable row level security;
alter table public.advanced_import_diagnostics enable row level security;

revoke all on public.advanced_import_sessions, public.advanced_import_artifacts, public.advanced_import_page_metadata, public.advanced_import_diagnostics from anon, authenticated;
grant all on public.advanced_import_sessions, public.advanced_import_artifacts, public.advanced_import_page_metadata, public.advanced_import_diagnostics to service_role;
