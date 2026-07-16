alter table public.ai_calendar_analysis_cache
  add column if not exists analysis_version text,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_by uuid references auth.users(id) on delete set null,
  add column if not exists invalidation_reason text;

update public.ai_calendar_analysis_cache
set analysis_version = prompt_schema_version
where analysis_version is null;

alter table public.ai_calendar_analysis_cache
  alter column analysis_version set not null;

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
      'analysis_job_stale'
    )
  );

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
