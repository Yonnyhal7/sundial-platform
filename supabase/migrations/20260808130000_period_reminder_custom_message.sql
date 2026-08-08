begin;

alter table public.notification_school_settings
  add column period_reminder_custom_message text,
  add constraint notification_school_settings_period_reminder_custom_message_check
    check(period_reminder_custom_message is null or length(period_reminder_custom_message)<=160);

drop function if exists public.update_notification_school_settings(uuid,bigint,boolean,boolean,text,boolean,text[]);

create function public.update_notification_school_settings(
  p_school_id uuid,
  p_expected_version bigint,
  p_notifications_enabled boolean,
  p_scheduled_notifications_enabled boolean,
  p_sender_display_name text,
  p_period_reminders_enabled boolean,
  p_period_reminder_audiences text[],
  p_period_reminder_custom_message text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
  v_updated public.notification_school_settings%rowtype;
  v_custom_message text:=nullif(
    left(
      pg_catalog.regexp_replace(
        btrim(coalesce(p_period_reminder_custom_message,'')),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      160
    ),
    ''
  );
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
      period_reminder_custom_message=v_custom_message,
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
    'period_reminder_audiences',v_updated.period_reminder_audiences,
    'period_reminder_custom_message',v_updated.period_reminder_custom_message
  ));
  return jsonb_build_object('status','success','version',v_updated.version);
end;
$$;

revoke all on function public.update_notification_school_settings(uuid,bigint,boolean,boolean,text,boolean,text[],text) from public,anon;
grant execute on function public.update_notification_school_settings(uuid,bigint,boolean,boolean,text,boolean,text[],text) to authenticated,service_role;

commit;
