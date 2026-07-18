begin;

-- This is the durable audit for a completed AI calendar creation. The draft
-- row is deleted by create_ai_calendar_from_draft before this audit is
-- inserted, so draft_id intentionally remains an immutable identifier rather
-- than a foreign key to calendar_wizard_drafts.
create table if not exists public.ai_calendar_import_reviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  draft_id uuid not null,
  analysis_attempt_id uuid,
  declared_instructional_count integer
    check (declared_instructional_count is null or declared_instructional_count >= 0),
  generated_instructional_count integer
    check (generated_instructional_count is null or generated_instructional_count >= 0),
  final_instructional_count integer not null
    check (final_instructional_count >= 0),
  count_review_status text
    check (count_review_status is null or count_review_status in ('acknowledged', 'resolved')),
  final_classifications jsonb not null default '[]'::jsonb
    check (jsonb_typeof(final_classifications) = 'array'),
  classification_digest text
    check (classification_digest is null or btrim(classification_digest) <> ''),
  acknowledged_issue_codes text[] not null default '{}',
  review_note text,
  reviewed_by uuid not null references public.users(id),
  reviewed_at timestamp with time zone not null default now(),
  analysis_version text
    check (analysis_version is null or btrim(analysis_version) <> ''),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Environments where the original split-audit migration ran have the old
-- final-count name. Preserve those rows while moving the table to the
-- canonical contract.
do $rename_legacy_final_count$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_calendar_import_reviews'
      and column_name = 'final_approved_instructional_day_count'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_calendar_import_reviews'
      and column_name = 'final_instructional_count'
  ) then
    alter table public.ai_calendar_import_reviews
      rename column final_approved_instructional_day_count to final_instructional_count;
  end if;
end;
$rename_legacy_final_count$;

alter table public.ai_calendar_import_reviews
  add column if not exists analysis_attempt_id uuid,
  add column if not exists declared_instructional_count integer,
  add column if not exists generated_instructional_count integer,
  add column if not exists final_instructional_count integer,
  add column if not exists count_review_status text,
  add column if not exists final_classifications jsonb not null default '[]'::jsonb,
  add column if not exists classification_digest text,
  add column if not exists analysis_version text,
  add column if not exists updated_at timestamp with time zone not null default now();

do $add_review_contract_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_calendar_import_reviews'::regclass
      and conname = 'ai_calendar_import_reviews_declared_count_check'
  ) then
    alter table public.ai_calendar_import_reviews
      add constraint ai_calendar_import_reviews_declared_count_check
      check (declared_instructional_count is null or declared_instructional_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_calendar_import_reviews'::regclass
      and conname = 'ai_calendar_import_reviews_generated_count_check'
  ) then
    alter table public.ai_calendar_import_reviews
      add constraint ai_calendar_import_reviews_generated_count_check
      check (generated_instructional_count is null or generated_instructional_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_calendar_import_reviews'::regclass
      and conname = 'ai_calendar_import_reviews_final_count_check'
  ) then
    alter table public.ai_calendar_import_reviews
      add constraint ai_calendar_import_reviews_final_count_check
      check (final_instructional_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_calendar_import_reviews'::regclass
      and conname = 'ai_calendar_import_reviews_count_status_check'
  ) then
    alter table public.ai_calendar_import_reviews
      add constraint ai_calendar_import_reviews_count_status_check
      check (count_review_status is null or count_review_status in ('acknowledged', 'resolved'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_calendar_import_reviews'::regclass
      and conname = 'ai_calendar_import_reviews_classifications_check'
  ) then
    alter table public.ai_calendar_import_reviews
      add constraint ai_calendar_import_reviews_classifications_check
      check (jsonb_typeof(final_classifications) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_calendar_import_reviews'::regclass
      and conname = 'ai_calendar_import_reviews_digest_check'
  ) then
    alter table public.ai_calendar_import_reviews
      add constraint ai_calendar_import_reviews_digest_check
      check (classification_digest is null or btrim(classification_digest) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_calendar_import_reviews'::regclass
      and conname = 'ai_calendar_import_reviews_analysis_version_check'
  ) then
    alter table public.ai_calendar_import_reviews
      add constraint ai_calendar_import_reviews_analysis_version_check
      check (analysis_version is null or btrim(analysis_version) <> '');
  end if;
end;
$add_review_contract_constraints$;

alter table public.ai_calendar_import_reviews
  alter column final_instructional_count set not null;

create index if not exists ai_calendar_import_reviews_school_id_idx
  on public.ai_calendar_import_reviews (school_id);

create index if not exists ai_calendar_import_reviews_draft_id_idx
  on public.ai_calendar_import_reviews (draft_id);

create index if not exists ai_calendar_import_reviews_analysis_attempt_id_idx
  on public.ai_calendar_import_reviews (analysis_attempt_id);

create index if not exists ai_calendar_import_reviews_reviewed_at_idx
  on public.ai_calendar_import_reviews (reviewed_at desc);

create index if not exists ai_calendar_import_reviews_school_attempt_idx
  on public.ai_calendar_import_reviews (school_id, analysis_attempt_id)
  where analysis_attempt_id is not null;

create unique index if not exists ai_calendar_import_reviews_school_attempt_uidx
  on public.ai_calendar_import_reviews (school_id, draft_id, analysis_attempt_id)
  where analysis_attempt_id is not null;

alter table public.ai_calendar_import_reviews enable row level security;

drop policy if exists "Calendar admins can read AI calendar import reviews"
  on public.ai_calendar_import_reviews;

create policy "Calendar admins can read AI calendar import reviews"
on public.ai_calendar_import_reviews for select to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'));

revoke all on public.ai_calendar_import_reviews from public, anon, authenticated;
grant select on public.ai_calendar_import_reviews to authenticated;
grant all on public.ai_calendar_import_reviews to service_role;

create or replace function public.create_available_ai_calendar_from_draft(
  p_school_id uuid,
  p_draft_id uuid,
  p_expected_draft_updated_at timestamp with time zone,
  p_start_date date,
  p_end_date date,
  p_replace_existing boolean,
  p_schedules jsonb,
  p_calendar_days jsonb,
  p_review jsonb,
  p_count_review jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_final_instructional_count integer;
  v_declared_instructional_count integer;
  v_generated_instructional_count integer;
  v_draft_analysis_attempt_id uuid;
  v_analysis_attempt_id uuid;
  v_analysis_version text;
begin
  select
    nullif(d.wizard_data #>> '{draft,aiImport,result,declaredInstructionalDayCount}', '')::integer,
    nullif(d.wizard_data #>> '{draft,aiImport,result,generatedInstructionalDayCount}', '')::integer,
    nullif(d.wizard_data #>> '{draft,aiImport,analysisAttemptId}', '')::uuid
  into
    v_declared_instructional_count,
    v_generated_instructional_count,
    v_draft_analysis_attempt_id
  from public.calendar_wizard_drafts d
  where d.id = p_draft_id
    and d.school_id = p_school_id
    and d.draft_type = 'school_year_calendar_ai';

  select count(*)
  into v_final_instructional_count
  from jsonb_to_recordset(coalesce(p_calendar_days, '[]'::jsonb))
    as day(is_school_day boolean)
  where coalesce(day.is_school_day, false) is true;

  if p_review is null
     or jsonb_typeof(coalesce(p_review->'acknowledged_issue_codes', 'null'::jsonb)) <> 'array'
     or (p_review->>'final_approved_instructional_day_count')::integer
       is distinct from v_final_instructional_count
     or nullif(btrim(coalesce(p_review->>'classification_digest', '')), '') is null
     or nullif(btrim(coalesce(p_review->>'analysis_version', '')), '') is null then
    return jsonb_build_object(
      'status', 'validation_error',
      'message', 'The AI calendar review audit payload is incomplete.'
    );
  end if;

  v_analysis_attempt_id := nullif(p_review->>'analysis_attempt_id', '')::uuid;
  v_analysis_version := btrim(p_review->>'analysis_version');

  if v_draft_analysis_attempt_id is not null
     and v_analysis_attempt_id is distinct from v_draft_analysis_attempt_id then
    return jsonb_build_object(
      'status', 'validation_error',
      'message', 'The AI calendar review no longer matches the saved analysis attempt.'
    );
  end if;

  if v_declared_instructional_count is not null
     and v_generated_instructional_count is not null
     and v_declared_instructional_count <> v_generated_instructional_count
     and p_count_review is null then
    return jsonb_build_object(
      'status', 'validation_error',
      'message', 'The instructional-day count review is required.'
    );
  end if;

  if p_count_review is not null then
    if coalesce(p_count_review->>'reason_code', '') <> 'instructional_day_count_mismatch'
       or coalesce((p_count_review->>'acknowledged')::boolean, false) is not true
       or coalesce(p_count_review->>'review_status', '') not in ('acknowledged', 'resolved')
       or jsonb_typeof(coalesce(p_count_review->'classifications', 'null'::jsonb)) <> 'array'
       or p_count_review->>'classification_digest'
         is distinct from p_review->>'classification_digest'
       or (
         p_count_review->>'review_status' = 'resolved'
         and exists (
           select 1
           from jsonb_array_elements(p_count_review->'classifications') item
           where coalesce((item->>'reviewed')::boolean, false) is not true
              or coalesce(item->>'classification', '') not in (
                'instructional',
                'no_school',
                'staff_only',
                'neutral_non_operating',
                'removed_from_coverage'
              )
         )
       ) then
      return jsonb_build_object(
        'status', 'validation_error',
        'message', 'The instructional-day count review is incomplete.'
      );
    end if;

    if (p_count_review->>'declared_instructional_day_count')::integer
         is distinct from v_declared_instructional_count
       or (p_count_review->>'generated_instructional_day_count')::integer
         is distinct from v_generated_instructional_count then
      return jsonb_build_object(
        'status', 'validation_error',
        'message', 'The instructional-day count review no longer matches the saved analysis.'
      );
    end if;

    if v_final_instructional_count <>
       (p_count_review->>'final_approved_instructional_day_count')::integer then
      return jsonb_build_object(
        'status', 'validation_error',
        'message', 'The approved instructional-day count does not match the calendar payload.'
      );
    end if;
  end if;

  -- The delegated function performs authorization, school/archive checks,
  -- schedule matching/creation, calendar replacement, draft locking/deletion,
  -- and post-write assignment digest validation in this same transaction.
  v_result := public.create_ai_calendar_from_draft(
    p_school_id,
    p_draft_id,
    p_expected_draft_updated_at,
    p_start_date,
    p_end_date,
    p_replace_existing,
    p_schedules,
    p_calendar_days
  );

  if coalesce(v_result->>'status', '') <> 'success' then
    return v_result;
  end if;

  insert into public.ai_calendar_import_reviews (
    school_id,
    draft_id,
    analysis_attempt_id,
    declared_instructional_count,
    generated_instructional_count,
    final_instructional_count,
    count_review_status,
    final_classifications,
    classification_digest,
    acknowledged_issue_codes,
    review_note,
    reviewed_by,
    reviewed_at,
    analysis_version
  ) values (
    p_school_id,
    p_draft_id,
    v_analysis_attempt_id,
    v_declared_instructional_count,
    v_generated_instructional_count,
    v_final_instructional_count,
    p_count_review->>'review_status',
    coalesce(p_count_review->'classifications', '[]'::jsonb),
    p_review->>'classification_digest',
    array(
      select jsonb_array_elements_text(
        coalesce(p_review->'acknowledged_issue_codes', '[]'::jsonb)
      )
    ),
    nullif(btrim(coalesce(p_review->>'review_note', '')), ''),
    auth.uid(),
    now(),
    v_analysis_version
  );

  return v_result;
exception
  when others then
    -- The review insert is part of the same transaction as schedule/calendar
    -- creation. Any audit failure rolls all delegated writes back.
    raise;
end;
$$;

revoke all on function public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb, jsonb
) to authenticated;

do $verify_ai_calendar_import_review_contract$
declare
  v_missing_columns text[];
  v_rls_enabled boolean;
  v_school_fk boolean;
  v_reviewer_fk boolean;
  v_read_policy boolean;
begin
  if to_regclass('public.ai_calendar_import_reviews') is null then
    raise exception 'AI calendar import review audit table was not created';
  end if;

  select array_agg(required.column_name order by required.ordinality)
  into v_missing_columns
  from unnest(array[
    'id',
    'school_id',
    'draft_id',
    'analysis_attempt_id',
    'declared_instructional_count',
    'generated_instructional_count',
    'final_instructional_count',
    'count_review_status',
    'final_classifications',
    'classification_digest',
    'acknowledged_issue_codes',
    'review_note',
    'reviewed_by',
    'reviewed_at',
    'analysis_version',
    'created_at',
    'updated_at'
  ]) with ordinality as required(column_name, ordinality)
  where not exists (
    select 1
    from information_schema.columns actual
    where actual.table_schema = 'public'
      and actual.table_name = 'ai_calendar_import_reviews'
      and actual.column_name = required.column_name
  );

  select c.relrowsecurity
  into v_rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'ai_calendar_import_reviews';

  select exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.ai_calendar_import_reviews'::regclass
      and constraint_row.confrelid = 'public.schools'::regclass
      and constraint_row.contype = 'f'
  ) into v_school_fk;

  select exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.ai_calendar_import_reviews'::regclass
      and constraint_row.confrelid = 'public.users'::regclass
      and constraint_row.contype = 'f'
  ) into v_reviewer_fk;

  select exists (
    select 1
    from pg_policies policy_row
    where policy_row.schemaname = 'public'
      and policy_row.tablename = 'ai_calendar_import_reviews'
      and policy_row.policyname = 'Calendar admins can read AI calendar import reviews'
      and policy_row.cmd = 'SELECT'
  ) into v_read_policy;

  if v_missing_columns is not null
     or v_rls_enabled is not true
     or v_school_fk is not true
     or v_reviewer_fk is not true
     or v_read_policy is not true
     or has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'SELECT') is not true
     or has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'INSERT') is not false
     or has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'UPDATE') is not false
     or has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'DELETE') is not false
     or has_table_privilege('anon', 'public.ai_calendar_import_reviews', 'SELECT') is not false
     or has_table_privilege('service_role', 'public.ai_calendar_import_reviews', 'SELECT') is not true
     or has_table_privilege('service_role', 'public.ai_calendar_import_reviews', 'INSERT') is not true
     or has_table_privilege('service_role', 'public.ai_calendar_import_reviews', 'UPDATE') is not true
     or has_table_privilege('service_role', 'public.ai_calendar_import_reviews', 'DELETE') is not true then
    raise exception 'AI calendar import review contract verification failed: missing columns %, RLS %, school/reviewer FK %/%, policy %, authenticated select/insert/update/delete %/%/%/%, anon select %',
      v_missing_columns,
      v_rls_enabled,
      v_school_fk,
      v_reviewer_fk,
      v_read_policy,
      has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'SELECT'),
      has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'INSERT'),
      has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'UPDATE'),
      has_table_privilege('authenticated', 'public.ai_calendar_import_reviews', 'DELETE'),
      has_table_privilege('anon', 'public.ai_calendar_import_reviews', 'SELECT');
  end if;
end;
$verify_ai_calendar_import_review_contract$;

NOTIFY pgrst, 'reload schema';

commit;
