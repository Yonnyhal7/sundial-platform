begin;

-- Production accumulated three identities during rolling deployments. Drop
-- every known type identity explicitly so PostgREST has one unambiguous
-- callable contract. PostgreSQL overload identity does not include names.
drop function if exists public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb
);

drop function if exists public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb
);

drop function if exists public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb, jsonb
);

create function public.create_available_ai_calendar_from_draft(
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

  -- This function owns the transactional school/archive gate, schedule
  -- creation, calendar row replacement, tenant checks, draft lock, and
  -- post-write assignment digest validation. Any exception rolls back this
  -- wrapper's audit inserts and all delegated changes together.
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
exception
  when others then
    raise;
end;
$$;

revoke all on function public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.create_available_ai_calendar_from_draft(
  uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb, jsonb
) to authenticated;

do $verify_ai_calendar_rpc$
declare
  v_count integer;
  v_argument_count integer;
  v_argument_types text;
  v_argument_names text[];
  v_authenticated_execute boolean;
  v_anon_execute boolean;
  v_public_execute boolean;
begin
  select count(*)
  into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_available_ai_calendar_from_draft';

  select
    p.pronargs,
    oidvectortypes(p.proargtypes),
    p.proargnames,
    has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    has_function_privilege('anon', p.oid, 'EXECUTE'),
    exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
  into
    v_argument_count,
    v_argument_types,
    v_argument_names,
    v_authenticated_execute,
    v_anon_execute,
    v_public_execute
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_available_ai_calendar_from_draft'
  limit 1;

  if v_count <> 1
     or v_argument_count <> 10
     or v_argument_types <> 'uuid, uuid, timestamp with time zone, date, date, boolean, jsonb, jsonb, jsonb, jsonb'
     or v_argument_names <> array[
       'p_school_id',
       'p_draft_id',
       'p_expected_draft_updated_at',
       'p_start_date',
       'p_end_date',
       'p_replace_existing',
       'p_schedules',
       'p_calendar_days',
       'p_review',
       'p_count_review'
     ]::text[]
     or v_argument_names[9] <> 'p_review'
     or v_argument_names[10] <> 'p_count_review'
     or v_authenticated_execute is not true
     or v_anon_execute is not false
     or v_public_execute is not false then
    raise exception 'AI calendar RPC overload reconciliation failed: count %, argument count %, types %, names %, authenticated execute %, anon execute %, public execute %',
      v_count,
      v_argument_count,
      v_argument_types,
      v_argument_names,
      v_authenticated_execute,
      v_anon_execute,
      v_public_execute;
  end if;
end;
$verify_ai_calendar_rpc$;

NOTIFY pgrst, 'reload schema';

commit;
