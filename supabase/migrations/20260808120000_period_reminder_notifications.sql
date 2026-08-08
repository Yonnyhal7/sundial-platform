begin;

alter table public.notification_school_settings
  add column period_reminders_enabled boolean not null default false,
  add column period_reminder_minutes_before integer not null default 5,
  add column period_reminder_audiences text[] not null default array['student','staff'];

alter table public.notification_school_settings
  add constraint notification_school_settings_period_reminder_minutes_check
    check(period_reminder_minutes_before = 5),
  add constraint notification_school_settings_period_reminder_audiences_check
    check(
      cardinality(period_reminder_audiences) between 1 and 3
      and period_reminder_audiences <@ array['student','parent','staff']::text[]
    );

alter table public.notification_device_preferences
  drop constraint if exists notification_device_preferences_category_check;
alter table public.notification_device_preferences
  add constraint notification_device_preferences_category_check
  check(category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','school_event','athletics','student_activity','academic_testing','first_period_reminder','period_change_reminder','period_reminder','lunch_reminder','end_of_day_reminder','staff_announcement','staff_meeting','staff_duty','operational_update'));

insert into public.notification_device_preferences(school_id,device_id,category,enabled)
select school_id,id,'period_reminder',true
from public.notification_devices
on conflict(device_id,category) do nothing;

create or replace function public.notification_category_available(p_category text,p_audience text)
returns boolean language sql immutable set search_path=public as $$
 select case p_audience
  when 'student' then p_category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','first_period_reminder','period_change_reminder','period_reminder','lunch_reminder','end_of_day_reminder','school_event','athletics','student_activity','academic_testing')
  when 'parent' then p_category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','period_reminder','school_event','athletics','student_activity','academic_testing')
  when 'staff' then p_category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','staff_announcement','staff_meeting','staff_duty','operational_update','first_period_reminder','period_change_reminder','period_reminder','lunch_reminder','end_of_day_reminder','school_event')
  else false end;
$$;

create table public.notification_period_reminder_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  schedule_date date not null,
  schedule_id uuid not null,
  period_id uuid not null,
  lead_time_minutes integer not null check(lead_time_minutes=5),
  scheduled_for timestamptz not null,
  period_starts_at timestamptz not null,
  title text not null check(length(title) between 1 and 80),
  body text not null check(length(body) between 1 and 180),
  audiences text[] not null check(audiences <@ array['student','parent','staff']::text[]),
  status text not null default 'processing' check(status in ('processing','sent','partially_failed','failed','no_eligible_devices')),
  eligible_count integer not null default 0 check(eligible_count>=0),
  successful_count integer not null default 0 check(successful_count>=0),
  failed_count integer not null default 0 check(failed_count>=0),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,schedule_date,period_id,lead_time_minutes),
  unique(id,school_id)
);
create index notification_period_reminder_runs_school_date_idx
  on public.notification_period_reminder_runs(school_id,schedule_date,scheduled_for);

create table public.notification_period_reminder_deliveries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  run_id uuid not null,
  device_id uuid not null,
  audience text not null check(audience in ('student','parent','staff')),
  delivery_status text not null default 'pending' check(delivery_status in ('pending','sending','sent','failed','disabled_subscription')),
  provider_message_id text check(provider_message_id is null or length(provider_message_id)<=200),
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text check(failure_reason is null or length(failure_reason)<=300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,device_id),
  foreign key(run_id,school_id) references public.notification_period_reminder_runs(id,school_id) on delete cascade,
  foreign key(device_id,school_id) references public.notification_devices(id,school_id) on delete cascade
);
create index notification_period_reminder_deliveries_run_status_idx
  on public.notification_period_reminder_deliveries(run_id,delivery_status);

alter table public.notification_period_reminder_runs enable row level security;
alter table public.notification_period_reminder_deliveries enable row level security;
create policy "Notification managers read period reminder runs"
  on public.notification_period_reminder_runs for select to authenticated
  using(public.current_user_can_manage_school_section(school_id,'notifications'));
create policy "Notification managers read period reminder deliveries"
  on public.notification_period_reminder_deliveries for select to authenticated
  using(public.current_user_can_manage_school_section(school_id,'notifications'));

revoke all on public.notification_period_reminder_runs,public.notification_period_reminder_deliveries from public,anon,authenticated;
grant select on public.notification_period_reminder_runs,public.notification_period_reminder_deliveries to authenticated;
grant all on public.notification_period_reminder_runs,public.notification_period_reminder_deliveries to service_role;

create or replace function public.update_notification_school_settings(
  p_school_id uuid,
  p_expected_version bigint,
  p_notifications_enabled boolean,
  p_scheduled_notifications_enabled boolean,
  p_sender_display_name text,
  p_period_reminders_enabled boolean,
  p_period_reminder_audiences text[]
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
  v_updated public.notification_school_settings%rowtype;
begin
  if not public.current_user_can_manage_school_section(p_school_id,'notifications') then
    return jsonb_build_object('status','permission_error');
  end if;
  if p_period_reminder_audiences is null
    or cardinality(p_period_reminder_audiences) not between 1 and 3
    or exists(select 1 from unnest(p_period_reminder_audiences) audience where audience not in ('student','parent','staff'))
  then
    return jsonb_build_object('status','validation_error');
  end if;
  update public.notification_school_settings
  set notifications_enabled=p_notifications_enabled,
      scheduled_notifications_enabled=p_scheduled_notifications_enabled,
      sender_display_name=nullif(btrim(left(coalesce(p_sender_display_name,''),80)),''),
      period_reminders_enabled=p_period_reminders_enabled,
      period_reminder_minutes_before=5,
      period_reminder_audiences=array(select distinct audience from unnest(p_period_reminder_audiences) audience order by audience),
      updated_by=v_actor,
      updated_at=now(),
      version=version+1
  where school_id=p_school_id and version=p_expected_version
  returning * into v_updated;
  if v_updated.school_id is null then
    return jsonb_build_object('status','stale');
  end if;
  insert into public.notification_audit(school_id,actor_id,action,summary,new_values)
  values(p_school_id,v_actor,'notification_settings_updated','Updated notification settings.',jsonb_build_object(
    'period_reminders_enabled',v_updated.period_reminders_enabled,
    'period_reminder_minutes_before',v_updated.period_reminder_minutes_before,
    'period_reminder_audiences',v_updated.period_reminder_audiences
  ));
  return jsonb_build_object('status','success','version',v_updated.version);
end;
$$;

revoke all on function public.update_notification_school_settings(uuid,bigint,boolean,boolean,text,boolean,text[]) from public,anon;
grant execute on function public.update_notification_school_settings(uuid,bigint,boolean,boolean,text,boolean,text[]) to authenticated,service_role;

commit;
