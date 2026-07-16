alter table public.ai_calendar_analysis_cache
  add column if not exists last_heartbeat_at timestamptz;

update public.ai_calendar_analysis_cache
set last_heartbeat_at = coalesce(last_heartbeat_at, updated_at)
where status = 'pending'
  and last_heartbeat_at is null;

create index if not exists ai_calendar_analysis_cache_pending_heartbeat_idx
  on public.ai_calendar_analysis_cache (status, last_heartbeat_at, created_at)
  where status = 'pending';

update public.ai_calendar_analysis_cache
set
  status = 'failed',
  current_stage = 'confirmed_failed',
  reason_code = 'analysis_job_stale',
  finished_at = now(),
  updated_at = now()
where status = 'pending'
  and coalesce(last_heartbeat_at, updated_at) < now() - interval '45 seconds'
  and created_at < now() - interval '195 seconds';
