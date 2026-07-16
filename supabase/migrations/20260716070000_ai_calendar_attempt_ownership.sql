alter table public.ai_calendar_analysis_cache
  add column if not exists analysis_attempt_id uuid,
  add column if not exists attempt_started_at timestamptz;

-- Legacy rows are results, not resumable attempts. Leaving ownership null prevents an old
-- browser recovery token from attaching itself to them after this migration is deployed.
update public.ai_calendar_analysis_cache
set analysis_attempt_id = null
where status <> 'pending';

create index if not exists ai_calendar_analysis_cache_attempt_lookup_idx
  on public.ai_calendar_analysis_cache (school_id, analysis_attempt_id, status)
  where analysis_attempt_id is not null;

create or replace function public.claim_ai_calendar_analysis_attempt(
  p_school_id uuid,
  p_pdf_sha256 text,
  p_analysis_strategy text,
  p_model text,
  p_version text,
  p_analysis_attempt_id uuid,
  p_route_request_id text,
  p_attempt_started_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  insert into public.ai_calendar_analysis_cache (
    school_id, pdf_sha256, analysis_strategy, model, prompt_schema_version,
    analysis_version, analysis_attempt_id, attempt_started_at, request_id,
    status, current_stage, stage_strategy, reason_code, result, created_at,
    updated_at, last_heartbeat_at, finished_at, invalidated_at,
    invalidated_by, invalidation_reason
  ) values (
    p_school_id, p_pdf_sha256, p_analysis_strategy, p_model, p_version,
    p_version, p_analysis_attempt_id, p_attempt_started_at, p_route_request_id,
    'pending', 'upload_received', p_analysis_strategy, null, null,
    p_attempt_started_at, now(), now(), null, null, null, null
  )
  on conflict (school_id, pdf_sha256, analysis_strategy, model, prompt_schema_version)
  do update set
    analysis_version = excluded.analysis_version,
    analysis_attempt_id = excluded.analysis_attempt_id,
    attempt_started_at = excluded.attempt_started_at,
    request_id = excluded.request_id,
    status = 'pending', current_stage = 'upload_received',
    stage_strategy = excluded.stage_strategy, reason_code = null, result = null,
    created_at = excluded.created_at, updated_at = now(), last_heartbeat_at = now(),
    finished_at = null, invalidated_at = null, invalidated_by = null,
    invalidation_reason = null
  where ai_calendar_analysis_cache.attempt_started_at is null
     or ai_calendar_analysis_cache.attempt_started_at <= excluded.attempt_started_at
  returning analysis_attempt_id into v_claimed;

  return v_claimed = p_analysis_attempt_id;
end;
$$;

notify pgrst, 'reload schema';
