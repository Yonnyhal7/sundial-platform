create table if not exists public.ai_calendar_analysis_cache (
  school_id uuid not null references public.schools(id) on delete cascade,
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  model text not null,
  prompt_schema_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (school_id, pdf_sha256, model, prompt_schema_version)
);

alter table public.ai_calendar_analysis_cache enable row level security;

create policy "Calendar admins can read AI analysis cache"
on public.ai_calendar_analysis_cache for select to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can insert AI analysis cache"
on public.ai_calendar_analysis_cache for insert to authenticated
with check (public.current_user_can_manage_school_section(school_id, 'calendar'));

create policy "Calendar admins can update AI analysis cache"
on public.ai_calendar_analysis_cache for update to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'))
with check (public.current_user_can_manage_school_section(school_id, 'calendar'));

revoke all on public.ai_calendar_analysis_cache from anon;
grant select, insert, update on public.ai_calendar_analysis_cache to authenticated;
