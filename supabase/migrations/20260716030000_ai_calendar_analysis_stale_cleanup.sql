alter table public.ai_calendar_analysis_cache
  add column if not exists finished_at timestamptz;

update public.ai_calendar_analysis_cache
set
  status = 'failed',
  current_stage = 'confirmed_failed',
  reason_code = 'analysis_job_stale',
  finished_at = now(),
  updated_at = now()
where status = 'pending'
  and updated_at < now() - interval '15 minutes';
