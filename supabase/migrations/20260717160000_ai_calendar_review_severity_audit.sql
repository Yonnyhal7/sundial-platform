create table if not exists public.ai_calendar_instructional_count_reviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  calendar_coverage_start date not null,
  calendar_coverage_end date not null,
  instructional_start date not null,
  instructional_end date not null,
  declared_instructional_day_count integer not null check (declared_instructional_day_count >= 0),
  generated_instructional_day_count integer not null check (generated_instructional_day_count >= 0),
  final_approved_instructional_day_count integer not null check (final_approved_instructional_day_count >= 0),
  reason_code text not null check (reason_code = 'instructional_day_count_mismatch'),
  review_status text not null check (review_status in ('acknowledged', 'resolved')),
  acknowledged_issue_codes text[] not null default '{}',
  classifications jsonb not null check (jsonb_typeof(classifications) = 'array'),
  classification_digest text not null,
  review_note text,
  reviewed_by uuid not null references public.users(id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ai_calendar_instructional_count_reviews_school_idx
  on public.ai_calendar_instructional_count_reviews (school_id, reviewed_at desc);

alter table public.ai_calendar_instructional_count_reviews enable row level security;

create policy "Calendar admins can read instructional count reviews"
on public.ai_calendar_instructional_count_reviews for select to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'));

revoke all on public.ai_calendar_instructional_count_reviews from anon;
revoke insert, update, delete on public.ai_calendar_instructional_count_reviews from authenticated;
grant select on public.ai_calendar_instructional_count_reviews to authenticated;

create table if not exists public.ai_calendar_import_reviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  draft_id uuid not null,
  acknowledged_issue_codes text[] not null default '{}',
  final_approved_instructional_day_count integer not null
    check (final_approved_instructional_day_count >= 0),
  review_note text,
  reviewed_by uuid not null references public.users(id),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ai_calendar_import_reviews_school_idx
  on public.ai_calendar_import_reviews (school_id, reviewed_at desc);

alter table public.ai_calendar_import_reviews enable row level security;

create policy "Calendar admins can read AI calendar import reviews"
on public.ai_calendar_import_reviews for select to authenticated
using (public.current_user_can_manage_school_section(school_id, 'calendar'));

revoke all on public.ai_calendar_import_reviews from anon;
revoke insert, update, delete on public.ai_calendar_import_reviews from authenticated;
grant select on public.ai_calendar_import_reviews to authenticated;

create or replace function public.create_available_ai_calendar_from_draft(
  p_school_id uuid,
  p_draft_id uuid,
  p_expected_draft_updated_at timestamptz,
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
begin
  select
    nullif(d.wizard_data #>> '{draft,aiImport,result,declaredInstructionalDayCount}', '')::integer,
    nullif(d.wizard_data #>> '{draft,aiImport,result,generatedInstructionalDayCount}', '')::integer
  into v_declared_instructional_count, v_generated_instructional_count
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
       is distinct from v_final_instructional_count then
    return jsonb_build_object(
      'status', 'validation_error',
      'message', 'The AI calendar review audit payload is incomplete.'
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
    acknowledged_issue_codes,
    final_approved_instructional_day_count,
    review_note,
    reviewed_by,
    reviewed_at
  ) values (
    p_school_id,
    p_draft_id,
    array(
      select jsonb_array_elements_text(
        coalesce(p_review->'acknowledged_issue_codes', '[]'::jsonb)
      )
    ),
    (p_review->>'final_approved_instructional_day_count')::integer,
    nullif(trim(coalesce(p_review->>'review_note', '')), ''),
    auth.uid(),
    now()
  );

  if p_count_review is not null then
    insert into public.ai_calendar_instructional_count_reviews (
      school_id,
      calendar_coverage_start,
      calendar_coverage_end,
      instructional_start,
      instructional_end,
      declared_instructional_day_count,
      generated_instructional_day_count,
      final_approved_instructional_day_count,
      reason_code,
      review_status,
      acknowledged_issue_codes,
      classifications,
      classification_digest,
      review_note,
      reviewed_by,
      reviewed_at
    ) values (
      p_school_id,
      (p_count_review->>'calendar_coverage_start')::date,
      (p_count_review->>'calendar_coverage_end')::date,
      (p_count_review->>'instructional_start')::date,
      (p_count_review->>'instructional_end')::date,
      (p_count_review->>'declared_instructional_day_count')::integer,
      (p_count_review->>'generated_instructional_day_count')::integer,
      (p_count_review->>'final_approved_instructional_day_count')::integer,
      p_count_review->>'reason_code',
      p_count_review->>'review_status',
      array(
        select jsonb_array_elements_text(
          coalesce(p_count_review->'acknowledged_issue_codes', '[]'::jsonb)
        )
      ),
      p_count_review->'classifications',
      p_count_review->>'classification_digest',
      nullif(trim(coalesce(p_count_review->>'review_note', '')), ''),
      auth.uid(),
      now()
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb, jsonb, jsonb
) from public, anon;

revoke execute on function public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb
) from authenticated;

grant execute on function public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamptz, date, date, boolean, jsonb, jsonb, jsonb, jsonb
) to authenticated;
