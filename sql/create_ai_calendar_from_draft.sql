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
  v_user_id uuid := auth.uid();
  v_authorized boolean := false;
  v_draft_updated_at timestamptz;
  v_existing_count integer := 0;
  v_first_existing date;
  v_last_existing date;
  v_created_schedule_count integer := 0;
  v_inserted_row_count integer := 0;
  v_schedule_conflict text;
begin
  if v_user_id is null then
    return jsonb_build_object(
      'status', 'permission_error',
      'message', 'You must be signed in to create a calendar.'
    );
  end if;

  select exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.is_active is true
      and (
        lower(coalesce(u.role, '')) in ('super_admin', 'superadmin')
        or (
          u.school_id = p_school_id
          and lower(coalesce(u.role, '')) in ('school_admin', 'schooladmin')
        )
        or (
          u.school_id = p_school_id
          and lower(coalesce(u.role, '')) = 'editor'
          and exists (
            select 1
            from public.user_permissions up
            join public.permissions p on p.id = up.permission_id
            where up.user_id = u.id
              and p.key = 'calendar'
          )
        )
      )
  )
  into v_authorized;

  if not v_authorized then
    return jsonb_build_object(
      'status', 'permission_error',
      'message', 'You do not have permission to create this calendar.'
    );
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    return jsonb_build_object(
      'status', 'validation_error',
      'message', 'The selected school-year dates are invalid.'
    );
  end if;

  select d.updated_at
  into v_draft_updated_at
  from public.calendar_wizard_drafts d
  where d.id = p_draft_id
    and d.school_id = p_school_id
    and d.draft_type = 'school_year_calendar'
  for update;

  if v_draft_updated_at is null then
    return jsonb_build_object(
      'status', 'draft_conflict',
      'message', 'The saved calendar draft could not be found. Reload the wizard and try again.'
    );
  end if;

  if p_expected_draft_updated_at is not null and v_draft_updated_at <> p_expected_draft_updated_at then
    return jsonb_build_object(
      'status', 'draft_conflict',
      'message', 'This calendar draft changed while you were reviewing it. Reload the latest draft before creating the calendar.'
    );
  end if;

  select count(*), min(date), max(date)
  into v_existing_count, v_first_existing, v_last_existing
  from public.calendar_days
  where school_id = p_school_id
    and date >= p_start_date
    and date <= p_end_date;

  if v_existing_count > 0 and not coalesce(p_replace_existing, false) then
    return jsonb_build_object(
      'status', 'replacement_required',
      'existingCount', v_existing_count,
      'firstExistingDate', v_first_existing,
      'lastExistingDate', v_last_existing
    );
  end if;

  with incoming as (
    select
      schedule_name,
      regexp_replace(lower(trim(schedule_name)), '[^a-z0-9]+', ' ', 'g') as normalized_name
    from jsonb_to_recordset(coalesce(p_schedules, '[]'::jsonb))
      as x(id uuid, temp_id text, schedule_name text, schedule_type text, setup_status text)
  ),
  duplicate_incoming as (
    select normalized_name
    from incoming
    group by normalized_name
    having count(*) > 1
  ),
  duplicate_existing as (
    select i.normalized_name
    from incoming i
    join public.schedules s
      on s.school_id = p_school_id
     and regexp_replace(lower(trim(s.schedule_name)), '[^a-z0-9]+', ' ', 'g') = i.normalized_name
    limit 1
  )
  select coalesce(
    (select 'Two detected schedules have the same name.' from duplicate_incoming limit 1),
    (select 'A schedule with one of these names already exists. Refresh and match it before creating the calendar.' from duplicate_existing limit 1)
  )
  into v_schedule_conflict;

  if v_schedule_conflict is not null then
    return jsonb_build_object(
      'status', 'schedule_conflict',
      'message', v_schedule_conflict
    );
  end if;

  insert into public.schedules (
    id,
    school_id,
    schedule_name,
    schedule_type,
    active,
    setup_status,
    created_at,
    updated_at
  )
  select
    x.id,
    p_school_id,
    nullif(trim(x.schedule_name), ''),
    nullif(trim(coalesce(x.schedule_type, '')), ''),
    true,
    'needs_times',
    now(),
    now()
  from jsonb_to_recordset(coalesce(p_schedules, '[]'::jsonb))
    as x(id uuid, temp_id text, schedule_name text, schedule_type text, setup_status text);

  get diagnostics v_created_schedule_count = row_count;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_calendar_days, '[]'::jsonb))
      as day(
        date date,
        schedule_id uuid,
        base_schedule_id uuid,
        label text,
        is_school_day boolean
      )
    left join public.schedules s
      on s.id = day.schedule_id
     and s.school_id = p_school_id
    where day.schedule_id is not null
      and s.id is null
  )
  or exists (
    select 1
    from jsonb_to_recordset(coalesce(p_calendar_days, '[]'::jsonb))
      as day(
        date date,
        schedule_id uuid,
        base_schedule_id uuid,
        label text,
        is_school_day boolean
      )
    left join public.schedules s
      on s.id = day.base_schedule_id
     and s.school_id = p_school_id
    where day.base_schedule_id is not null
      and s.id is null
  ) then
    raise exception 'calendar row references a schedule outside this school';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_calendar_days, '[]'::jsonb))
      as day(
        date date,
        schedule_id uuid,
        base_schedule_id uuid,
        label text,
        is_school_day boolean
      )
    where day.date < p_start_date
       or day.date > p_end_date
  ) then
    raise exception 'calendar row is outside the selected range';
  end if;

  delete from public.calendar_days
  where school_id = p_school_id
    and date >= p_start_date
    and date <= p_end_date;

  insert into public.calendar_days (
    school_id,
    date,
    schedule_id,
    base_schedule_id,
    label,
    is_school_day
  )
  select
    p_school_id,
    day.date,
    day.schedule_id,
    day.base_schedule_id,
    nullif(day.label, ''),
    coalesce(day.is_school_day, false)
  from jsonb_to_recordset(coalesce(p_calendar_days, '[]'::jsonb))
    as day(
      date date,
      schedule_id uuid,
      base_schedule_id uuid,
      label text,
      is_school_day boolean
    );

  get diagnostics v_inserted_row_count = row_count;

  delete from public.calendar_wizard_drafts
  where id = p_draft_id
    and school_id = p_school_id
    and draft_type = 'school_year_calendar';

  return jsonb_build_object(
    'status', 'success',
    'createdScheduleCount', v_created_schedule_count,
    'insertedRowCount', v_inserted_row_count
  );
exception
  when others then
    raise;
end;
$$;

revoke all on function public.create_ai_calendar_from_draft(
  uuid,
  uuid,
  timestamptz,
  date,
  date,
  boolean,
  jsonb,
  jsonb
) from public;

grant execute on function public.create_ai_calendar_from_draft(
  uuid,
  uuid,
  timestamptz,
  date,
  date,
  boolean,
  jsonb,
  jsonb
) to authenticated;
