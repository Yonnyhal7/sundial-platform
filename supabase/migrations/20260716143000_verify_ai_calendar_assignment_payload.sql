create or replace function public.create_ai_calendar_from_draft(
  p_school_id uuid,
  p_draft_id uuid,
  p_expected_draft_updated_at timestamptz,
  p_start_date date,
  p_end_date date,
  p_replace_existing boolean,
  p_schedules jsonb,
  p_calendar_days jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_first_differing_dates text[];
begin
  if not exists (
    select 1 from public.schools
    where id = p_school_id and archived_at is null
  ) then
    return jsonb_build_object(
      'status', 'permission_error',
      'message', 'This school is unavailable.'
    );
  end if;

  v_result := public.create_ai_calendar_from_draft_unchecked(
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

  with expected as (
    select
      day.date,
      day.schedule_id,
      day.base_schedule_id,
      day.label,
      day.is_school_day
    from jsonb_to_recordset(coalesce(p_calendar_days, '[]'::jsonb))
      as day(
        date date,
        schedule_id uuid,
        base_schedule_id uuid,
        label text,
        is_school_day boolean
      )
  ),
  actual as (
    select
      day.date,
      day.schedule_id,
      day.base_schedule_id,
      day.label,
      day.is_school_day
    from public.calendar_days day
    where day.school_id = p_school_id
      and day.date >= p_start_date
      and day.date <= p_end_date
  ),
  differing as (
    select coalesce(expected.date, actual.date) as date
    from expected
    full join actual using (date)
    where expected.date is null
       or actual.date is null
       or expected.schedule_id is distinct from actual.schedule_id
       or expected.base_schedule_id is distinct from actual.base_schedule_id
       or expected.label is distinct from actual.label
       or expected.is_school_day is distinct from actual.is_school_day
    order by coalesce(expected.date, actual.date)
    limit 5
  )
  select array_agg(date::text order by date)
  into v_first_differing_dates
  from differing;

  if coalesce(array_length(v_first_differing_dates, 1), 0) > 0 then
    raise exception using
      errcode = 'P0001',
      message = 'calendar_assignment_digest_mismatch',
      detail = jsonb_build_object(
        'code', 'calendar_assignment_digest_mismatch',
        'firstDifferingDates', to_jsonb(v_first_differing_dates)
      )::text;
  end if;

  return v_result;
end;
$$;
