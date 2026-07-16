alter table public.ai_calendar_analysis_cache
  add column if not exists analysis_strategy text not null default 'pdf-gpt5';

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
