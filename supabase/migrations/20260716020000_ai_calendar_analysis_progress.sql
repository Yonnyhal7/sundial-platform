alter table public.ai_calendar_analysis_cache
  alter column result drop not null;

alter table public.ai_calendar_analysis_cache
  add column if not exists status text not null default 'ready',
  add column if not exists current_stage text,
  add column if not exists stage_strategy text,
  add column if not exists request_id text,
  add column if not exists reason_code text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.ai_calendar_analysis_cache
  drop constraint if exists ai_calendar_analysis_cache_status_check;

alter table public.ai_calendar_analysis_cache
  add constraint ai_calendar_analysis_cache_status_check
  check (status in ('pending', 'ready', 'failed'));

update public.ai_calendar_analysis_cache
set
  status = 'ready',
  current_stage = coalesce(current_stage, 'ready'),
  stage_strategy = coalesce(stage_strategy, analysis_strategy),
  updated_at = coalesce(updated_at, created_at, now())
where status = 'ready';
