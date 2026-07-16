alter table public.ai_calendar_analysis_cache
  add column if not exists analysis_strategy text not null default 'pdf-gpt5',
  add column if not exists status text not null default 'ready',
  add column if not exists current_stage text,
  add column if not exists stage_strategy text,
  add column if not exists request_id text,
  add column if not exists reason_code text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists analysis_version text,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_by uuid references auth.users(id) on delete set null,
  add column if not exists invalidation_reason text;

update public.ai_calendar_analysis_cache
set
  analysis_version = coalesce(analysis_version, prompt_schema_version),
  status = coalesce(status, 'ready'),
  current_stage = coalesce(current_stage, 'ready'),
  stage_strategy = coalesce(stage_strategy, analysis_strategy),
  updated_at = coalesce(updated_at, created_at, now())
where analysis_version is null
  or current_stage is null
  or stage_strategy is null;

alter table public.ai_calendar_analysis_cache
  alter column analysis_version set not null;

alter table public.ai_calendar_analysis_cache
  drop constraint if exists ai_calendar_analysis_cache_pkey;

alter table public.ai_calendar_analysis_cache
  add constraint ai_calendar_analysis_cache_pkey
  primary key (
    school_id,
    pdf_sha256,
    analysis_strategy,
    model,
    prompt_schema_version
  );

alter table public.ai_calendar_analysis_cache
  drop constraint if exists ai_calendar_analysis_cache_status_check;

alter table public.ai_calendar_analysis_cache
  add constraint ai_calendar_analysis_cache_status_check
  check (status in ('pending', 'ready', 'failed'));

alter table public.ai_calendar_analysis_cache
  drop constraint if exists ai_calendar_analysis_cache_invalidation_reason_check;

alter table public.ai_calendar_analysis_cache
  add constraint ai_calendar_analysis_cache_invalidation_reason_check
  check (
    invalidation_reason is null
    or invalidation_reason in (
      'user_requested_reanalysis',
      'user_rejected_result',
      'analysis_version_changed',
      'incorrect_schedule_assignments',
      'stale_result',
      'administrator_reset',
      'openai_timeout',
      'pdf_analysis_timeout',
      'analysis_job_stale'
    )
  );

create index if not exists ai_calendar_analysis_cache_pending_heartbeat_idx
  on public.ai_calendar_analysis_cache (status, last_heartbeat_at, created_at)
  where status = 'pending';

create index if not exists ai_calendar_analysis_cache_active_lookup_idx
  on public.ai_calendar_analysis_cache (
    school_id,
    pdf_sha256,
    analysis_strategy,
    model,
    analysis_version,
    status,
    created_at
  )
  where invalidated_at is null;

update public.ai_calendar_analysis_cache
set
  status = 'failed',
  current_stage = 'confirmed_failed',
  reason_code = 'analysis_job_stale',
  finished_at = now(),
  updated_at = now()
where status = 'pending'
  and coalesce(last_heartbeat_at, updated_at) < now() - interval '45 seconds'
  and created_at < now() - interval '255 seconds';

notify pgrst, 'reload schema';
