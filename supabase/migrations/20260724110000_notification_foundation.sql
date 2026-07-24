begin;

insert into public.permissions(key,label,description)
values('notifications','Notifications','Create and manage school notifications')
on conflict(key) do update set label=excluded.label,description=excluded.description;

create table public.notification_school_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  notifications_enabled boolean not null default true,
  scheduled_notifications_enabled boolean not null default true,
  allowed_categories text[] not null default array['emergency','closure_delay','important_announcement','calendar_schedule_change','school_event','athletics','student_activity','academic_testing','first_period_reminder','period_change_reminder','lunch_reminder','end_of_day_reminder','staff_announcement','staff_meeting','staff_duty','operational_update'],
  default_lead_times jsonb not null default '{}'::jsonb,
  quiet_hours_start time,
  quiet_hours_end time,
  emergency_behavior text not null default 'respect_preferences' check(emergency_behavior in ('respect_preferences','critical_policy_notice')),
  sender_display_name text check(sender_display_name is null or length(sender_display_name)<=80),
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.notification_school_settings(school_id)
select id
from public.schools
where archived_at is null
on conflict(school_id) do nothing;

create or replace function public.initialize_notification_school_settings()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.archived_at is not null then
    return new;
  end if;
  insert into public.notification_school_settings(school_id) values(new.id)
  on conflict(school_id) do nothing;
  return new;
end;$$;

create trigger initialize_notification_school_settings_after_school
after insert on public.schools for each row
execute function public.initialize_notification_school_settings();

create table public.notification_campaigns (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null check(length(title) between 1 and 60),
  body text not null check(length(body) between 1 and 180),
  category text not null check(category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','school_event','athletics','student_activity','academic_testing','first_period_reminder','period_change_reminder','lunch_reminder','end_of_day_reminder','staff_announcement','staff_meeting','staff_duty','operational_update')),
  status text not null check(status in ('draft','scheduled','queued','sending','sent','partially_failed','failed','cancelled')),
  urgency text not null default 'normal' check(urgency in ('normal','high','emergency')),
  destination_url text check(destination_url is null or (length(destination_url)<=500 and destination_url like '/%' and destination_url not like '//%' and destination_url not like '%..%' and destination_url not like '%\\%')),
  related_entity_type text check(related_entity_type is null or related_entity_type in ('announcement','event','athletics_team','calendar_change')),
  related_entity_id uuid,
  target_type text not null default 'audience' check(target_type in ('audience','followed_entity')),
  followed_entity_type text check(followed_entity_type is null or followed_entity_type in ('athletics_team','club','organization')),
  followed_entity_id uuid,
  origin_timezone text not null,
  scheduled_for timestamptz,
  original_scheduled_for timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  idempotency_key text not null check(length(idempotency_key) between 16 and 100),
  claimed_at timestamptz,
  claim_token uuid,
  send_attempt_count integer not null default 0,
  eligible_count integer not null default 0,
  attempted_count integer not null default 0,
  successful_count integer not null default 0,
  failed_count integer not null default 0,
  disabled_subscription_count integer not null default 0,
  unique(id,school_id),
  unique(school_id,idempotency_key),
  check((status='scheduled' and scheduled_for is not null) or status<>'scheduled'),
  check(
    (related_entity_type is null and related_entity_id is null)
    or (related_entity_type is not null and related_entity_id is not null)
  ),
  check(
    (target_type='audience' and followed_entity_type is null and followed_entity_id is null)
    or (
      target_type='followed_entity'
      and followed_entity_type is not null
      and followed_entity_id is not null
    )
  )
);
create index notification_campaigns_school_status_idx on public.notification_campaigns(school_id,status,coalesce(scheduled_for,created_at));

create or replace function public.notification_user_can_access_school(
  p_user_id uuid,
  p_school_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select p_user_id is null or exists (
    select 1
    from public.users actor
    join public.schools school on school.id=p_school_id
    where actor.id=p_user_id
      and actor.is_active is true
      and school.archived_at is null
      and (
        lower(replace(coalesce(actor.role,''),'_',''))='superadmin'
        or actor.school_id=p_school_id
        or exists (
          select 1
          from public.school_memberships membership
          where membership.user_id=actor.id
            and membership.school_id=p_school_id
            and membership.is_active is true
        )
      )
  );
$$;

create or replace function public.enforce_notification_campaign_tenant_relationships()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_school_slug text;
begin
  select school.subdomain
  into v_school_slug
  from public.schools school
  where school.id=new.school_id
    and school.archived_at is null;

  if v_school_slug is null then
    raise exception using
      errcode='23514',
      message='Notification school is unavailable';
  end if;

  if new.destination_url is not null
     and new.destination_url<>('/'||v_school_slug)
     and new.destination_url not like ('/'||v_school_slug||'/%') then
    raise exception using
      errcode='23514',
      message='Notification destination must remain within its school';
  end if;

  if new.target_type<>'audience' then
    raise exception using
      errcode='23514',
      message='Followed-entity notification targets are not available';
  end if;

  if not public.notification_user_can_access_school(new.created_by,new.school_id)
     or not public.notification_user_can_access_school(new.updated_by,new.school_id) then
    raise exception using
      errcode='23503',
      message='Notification campaign actor does not belong to its school';
  end if;

  if new.related_entity_id is not null then
    if new.related_entity_type='announcement'
       and not exists (
         select 1
         from public.announcements entity
         where entity.id=new.related_entity_id
           and entity.school_id=new.school_id
       ) then
      raise exception using
        errcode='23503',
        message='Notification announcement belongs to another school or is unavailable';
    elsif new.related_entity_type='event'
       and not exists (
         select 1
         from public.events entity
         where entity.id=new.related_entity_id
           and entity.school_id=new.school_id
       ) then
      raise exception using
        errcode='23503',
        message='Notification event belongs to another school or is unavailable';
    elsif new.related_entity_type='athletics_team'
       and not exists (
         select 1
         from public.teams entity
         where entity.id=new.related_entity_id
           and entity.school_id=new.school_id
       ) then
      raise exception using
        errcode='23503',
        message='Notification team belongs to another school or is unavailable';
    elsif new.related_entity_type='calendar_change'
       and not exists (
         select 1
         from public.calendar_days entity
         where entity.id=new.related_entity_id
           and entity.school_id=new.school_id
       ) then
      raise exception using
        errcode='23503',
        message='Notification calendar change belongs to another school or is unavailable';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_notification_campaign_tenant_relationships
before insert or update of
  school_id,
  destination_url,
  related_entity_type,
  related_entity_id,
  target_type,
  followed_entity_type,
  followed_entity_id
on public.notification_campaigns
for each row execute function public.enforce_notification_campaign_tenant_relationships();

create table public.notification_campaign_audiences (
  school_id uuid not null,
  campaign_id uuid not null,
  audience text not null check(audience in ('student','parent','staff')),
  primary key(campaign_id,audience),
  foreign key(campaign_id,school_id) references public.notification_campaigns(id,school_id) on delete cascade
);

create table public.notification_devices (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  installation_id text not null check(length(installation_id) between 16 and 100),
  device_token_hash text not null check(length(device_token_hash)=64),
  audience text not null check(audience in ('student','parent','staff')),
  device_label text check(device_label is null or length(device_label)<=80),
  platform text not null check(length(platform)<=40),
  browser text not null check(length(browser)<=40),
  pwa_installed boolean not null default false,
  notifications_supported boolean not null default false,
  permission_status text not null check(permission_status in ('default','granted','denied','unsupported')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(school_id,installation_id),
  unique(id,school_id)
);
create index notification_devices_school_audience_idx on public.notification_devices(school_id,audience) where revoked_at is null;

create or replace function public.enforce_notification_device_tenant_relationships()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if not exists (
    select 1
    from public.schools school
    where school.id=new.school_id
      and school.archived_at is null
  ) then
    raise exception using
      errcode='23514',
      message='Notification device school is unavailable';
  end if;

  if not public.notification_user_can_access_school(new.user_id,new.school_id) then
    raise exception using
      errcode='23503',
      message='Notification device user does not belong to its school';
  end if;

  return new;
end;
$$;

create trigger enforce_notification_device_tenant_relationships
before insert or update of school_id,user_id
on public.notification_devices
for each row execute function public.enforce_notification_device_tenant_relationships();

create table public.push_subscriptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  device_id uuid not null,
  endpoint text not null check(length(endpoint)<=2048),
  p256dh text not null check(length(p256dh)<=512),
  auth text not null check(length(auth)<=512),
  expiration_time bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  disabled_at timestamptz,
  unique(device_id,endpoint),
  foreign key(device_id,school_id) references public.notification_devices(id,school_id) on delete cascade
);
create index push_subscriptions_active_idx on public.push_subscriptions(school_id,device_id) where disabled_at is null;
create unique index push_subscriptions_one_active_device_idx
  on public.push_subscriptions(device_id)
  where disabled_at is null;

create table public.notification_device_preferences (
  school_id uuid not null,
  device_id uuid not null,
  category text not null check(category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','school_event','athletics','student_activity','academic_testing','first_period_reminder','period_change_reminder','lunch_reminder','end_of_day_reminder','staff_announcement','staff_meeting','staff_duty','operational_update')),
  enabled boolean not null,
  lead_time_minutes integer check(lead_time_minutes is null or lead_time_minutes between 0 and 10080),
  updated_at timestamptz not null default now(),
  primary key(device_id,category),
  foreign key(device_id,school_id) references public.notification_devices(id,school_id) on delete cascade
);

create table public.notification_deliveries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  school_id uuid not null,
  campaign_id uuid not null,
  device_id uuid not null,
  audience text not null check(audience in ('student','parent','staff')),
  delivery_status text not null default 'pending' check(delivery_status in ('pending','sending','sent','inbox_only','failed','disabled_subscription')),
  provider_message_id text check(provider_message_id is null or length(provider_message_id)<=200),
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text check(failure_reason is null or length(failure_reason)<=300),
  read_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id,device_id),
  foreign key(campaign_id,school_id) references public.notification_campaigns(id,school_id) on delete cascade,
  foreign key(device_id,school_id) references public.notification_devices(id,school_id) on delete cascade
);
create index notification_deliveries_device_inbox_idx on public.notification_deliveries(device_id,created_at desc);
create index notification_deliveries_campaign_status_idx on public.notification_deliveries(campaign_id,delivery_status);

create table public.notification_audit (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id) on delete cascade,
  campaign_id uuid,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  summary text not null check(length(summary)<=300),
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  result_status text not null default 'success' check(result_status in ('success','blocked','failed')),
  created_at timestamptz not null default now(),
  foreign key(campaign_id,school_id)
    references public.notification_campaigns(id,school_id)
    on delete restrict
);
create index notification_audit_school_created_idx on public.notification_audit(school_id,created_at desc);

alter table public.notification_school_settings enable row level security;
alter table public.notification_campaigns enable row level security;
alter table public.notification_campaign_audiences enable row level security;
alter table public.notification_devices enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_device_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_audit enable row level security;

create policy "Notification managers read settings" on public.notification_school_settings for select to authenticated using(public.current_user_can_manage_school_section(school_id,'notifications'));
create policy "Notification managers read campaigns" on public.notification_campaigns for select to authenticated using(public.current_user_can_manage_school_section(school_id,'notifications'));
create policy "Notification managers read campaign audiences" on public.notification_campaign_audiences for select to authenticated using(public.current_user_can_manage_school_section(school_id,'notifications'));
create policy "Notification managers read delivery metadata" on public.notification_deliveries for select to authenticated using(public.current_user_can_manage_school_section(school_id,'notifications'));
create policy "Notification managers read audit" on public.notification_audit for select to authenticated using(public.current_user_can_manage_school_section(school_id,'notifications'));

revoke all on public.notification_school_settings,public.notification_campaigns,public.notification_campaign_audiences,public.notification_devices,public.push_subscriptions,public.notification_device_preferences,public.notification_deliveries,public.notification_audit from public,anon,authenticated;
grant select on public.notification_school_settings,public.notification_campaigns,public.notification_campaign_audiences,public.notification_deliveries,public.notification_audit to authenticated;
grant all on public.notification_school_settings,public.notification_campaigns,public.notification_campaign_audiences,public.notification_devices,public.push_subscriptions,public.notification_device_preferences,public.notification_deliveries,public.notification_audit to service_role;

revoke all on function public.initialize_notification_school_settings(),
  public.notification_user_can_access_school(uuid,uuid),
  public.enforce_notification_campaign_tenant_relationships(),
  public.enforce_notification_device_tenant_relationships()
from public,anon,authenticated;

create or replace function public.notification_category_available(p_category text,p_audience text)
returns boolean language sql immutable set search_path=public as $$
 select case p_audience
  when 'student' then p_category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','first_period_reminder','period_change_reminder','lunch_reminder','end_of_day_reminder','school_event','athletics','student_activity','academic_testing')
  when 'parent' then p_category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','school_event','athletics','student_activity','academic_testing')
  when 'staff' then p_category in ('emergency','closure_delay','important_announcement','calendar_schedule_change','staff_announcement','staff_meeting','staff_duty','operational_update','first_period_reminder','period_change_reminder','lunch_reminder','end_of_day_reminder','school_event')
  else false end;
$$;

create or replace function public.create_notification_campaign(
 p_school_id uuid,p_title text,p_body text,p_category text,p_audiences text[],p_status text,
 p_scheduled_for timestamptz,p_origin_timezone text,p_urgency text,p_destination_url text,
 p_related_entity_type text,p_related_entity_id uuid,p_target_type text,p_followed_entity_type text,
 p_followed_entity_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_settings public.notification_school_settings%rowtype;v_school public.schools%rowtype;v_audience text;v_status text:=p_status;
begin
 if not public.current_user_can_manage_school_section(p_school_id,'notifications') then return jsonb_build_object('status','permission_error');end if;
 select * into v_school from public.schools where id=p_school_id and archived_at is null for share;
 if v_school.id is null then return jsonb_build_object('status','school_unavailable');end if;
 select * into v_settings from public.notification_school_settings where school_id=p_school_id;
 if not coalesce(v_settings.notifications_enabled,true) then return jsonb_build_object('status','notifications_disabled');end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 60 or p_body is null or length(btrim(p_body)) not between 1 and 180 then return jsonb_build_object('status','validation_error');end if;
 if p_category is null or not(p_category=any(v_settings.allowed_categories)) then return jsonb_build_object('status','category_disabled');end if;
 if p_audiences is null or cardinality(p_audiences)=0 or exists(select 1 from unnest(p_audiences) a where a not in ('student','parent','staff') or not public.notification_category_available(p_category,a)) then return jsonb_build_object('status','invalid_audience');end if;
 if p_origin_timezone is distinct from v_school.timezone then return jsonb_build_object('status','invalid_timezone');end if;
 if p_destination_url is not null
    and p_destination_url<>('/'||v_school.subdomain)
    and p_destination_url not like ('/'||v_school.subdomain||'/%')
 then return jsonb_build_object('status','invalid_destination');end if;
  if (p_related_entity_type is null)<>(p_related_entity_id is null) then return jsonb_build_object('status','invalid_related_entity');end if;
 if p_related_entity_id is not null and (
   (p_related_entity_type='announcement' and not exists(select 1 from public.announcements entity where entity.id=p_related_entity_id and entity.school_id=p_school_id))
   or (p_related_entity_type='event' and not exists(select 1 from public.events entity where entity.id=p_related_entity_id and entity.school_id=p_school_id))
   or (p_related_entity_type='athletics_team' and not exists(select 1 from public.teams entity where entity.id=p_related_entity_id and entity.school_id=p_school_id))
   or (p_related_entity_type='calendar_change' and not exists(select 1 from public.calendar_days entity where entity.id=p_related_entity_id and entity.school_id=p_school_id))
   or p_related_entity_type not in ('announcement','event','athletics_team','calendar_change')
 ) then return jsonb_build_object('status','invalid_related_entity');end if;
 if v_status not in ('draft','scheduled','queued') then return jsonb_build_object('status','validation_error');end if;
 if v_status='scheduled' and (not v_settings.scheduled_notifications_enabled or p_scheduled_for is null or p_scheduled_for<=now()) then return jsonb_build_object('status','invalid_schedule');end if;
 if p_target_type<>'audience' then return jsonb_build_object('status','future_target_unavailable');end if;
 if exists(select 1 from public.notification_campaigns where school_id=p_school_id and idempotency_key=p_idempotency_key) then select id into v_id from public.notification_campaigns where school_id=p_school_id and idempotency_key=p_idempotency_key;return jsonb_build_object('status','duplicate','campaign_id',v_id);end if;
 if v_status<>'draft' then
   perform pg_catalog.pg_advisory_xact_lock(
     pg_catalog.hashtextextended(p_school_id::text||':'||v_actor::text,0)
   );
   if (select count(*) from public.notification_campaigns where school_id=p_school_id and created_by=v_actor and created_at>now()-interval '10 minutes' and status<>'cancelled')>=20 then return jsonb_build_object('status','rate_limited');end if;
 end if;
 insert into public.notification_campaigns(school_id,title,body,category,status,created_by,updated_by,scheduled_for,original_scheduled_for,origin_timezone,urgency,destination_url,related_entity_type,related_entity_id,target_type,followed_entity_type,followed_entity_id,idempotency_key)
 values(p_school_id,btrim(p_title),btrim(p_body),p_category,v_status,v_actor,v_actor,p_scheduled_for,p_scheduled_for,p_origin_timezone,coalesce(p_urgency,'normal'),p_destination_url,p_related_entity_type,p_related_entity_id,p_target_type,p_followed_entity_type,p_followed_entity_id,p_idempotency_key) returning id into v_id;
 foreach v_audience in array p_audiences loop insert into public.notification_campaign_audiences(school_id,campaign_id,audience) values(p_school_id,v_id,v_audience) on conflict do nothing;end loop;
 insert into public.notification_audit(school_id,campaign_id,actor_id,action,summary,new_values) values(p_school_id,v_id,v_actor,'campaign_created','Created notification campaign',jsonb_build_object('status',v_status,'category',p_category,'audiences',p_audiences,'scheduled_for',p_scheduled_for));
 return jsonb_build_object('status','success','campaign_id',v_id);
exception when unique_violation then
 select id into v_id from public.notification_campaigns where school_id=p_school_id and idempotency_key=p_idempotency_key;
 return jsonb_build_object('status','duplicate','campaign_id',v_id);
when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.cancel_notification_campaign(p_campaign_id uuid,p_school_id uuid,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_actor uuid:=auth.uid();v_row public.notification_campaigns%rowtype;
begin if not public.current_user_can_manage_school_section(p_school_id,'notifications') then return jsonb_build_object('status','permission_error');end if;select * into v_row from public.notification_campaigns where id=p_campaign_id and school_id=p_school_id for update;if v_row.id is null then return jsonb_build_object('status','not_found');end if;if v_row.version<>p_expected_version then return jsonb_build_object('status','stale');end if;if v_row.status not in ('draft','scheduled','queued') then return jsonb_build_object('status','invalid_status');end if;update public.notification_campaigns set status='cancelled',cancelled_at=now(),updated_at=now(),updated_by=v_actor,version=version+1 where id=v_row.id;insert into public.notification_audit(school_id,campaign_id,actor_id,action,summary,previous_values,new_values) values(p_school_id,v_row.id,v_actor,'campaign_cancelled','Cancelled notification campaign',jsonb_build_object('status',v_row.status,'scheduled_for',v_row.scheduled_for),jsonb_build_object('status','cancelled'));return jsonb_build_object('status','success');end;$$;

create or replace function public.reschedule_notification_campaign(p_campaign_id uuid,p_school_id uuid,p_expected_version bigint,p_scheduled_for timestamptz,p_origin_timezone text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare v_actor uuid:=auth.uid();v_row public.notification_campaigns%rowtype;v_timezone text;
begin if not public.current_user_can_manage_school_section(p_school_id,'notifications') then return jsonb_build_object('status','permission_error');end if;
select timezone into v_timezone from public.schools where id=p_school_id and archived_at is null;
if v_timezone is null or p_origin_timezone is distinct from v_timezone or p_scheduled_for is null or p_scheduled_for<=now() then return jsonb_build_object('status','invalid_schedule');end if;
select * into v_row from public.notification_campaigns where id=p_campaign_id and school_id=p_school_id for update;
if v_row.id is null then return jsonb_build_object('status','not_found');end if;if v_row.version<>p_expected_version then return jsonb_build_object('status','stale');end if;if v_row.status not in ('draft','scheduled') then return jsonb_build_object('status','invalid_status');end if;
update public.notification_campaigns set status='scheduled',scheduled_for=p_scheduled_for,original_scheduled_for=coalesce(original_scheduled_for,p_scheduled_for),origin_timezone=p_origin_timezone,updated_at=now(),updated_by=v_actor,version=version+1 where id=v_row.id;
insert into public.notification_audit(school_id,campaign_id,actor_id,action,summary,previous_values,new_values) values(p_school_id,v_row.id,v_actor,'campaign_rescheduled','Rescheduled notification campaign',jsonb_build_object('status',v_row.status,'scheduled_for',v_row.scheduled_for),jsonb_build_object('status','scheduled','scheduled_for',p_scheduled_for));
return jsonb_build_object('status','success');end;$$;

create or replace function public.claim_notification_campaign(p_campaign_id uuid default null)
returns setof public.notification_campaigns language plpgsql security definer set search_path=public,pg_temp as $$
 declare v_role text:=auth.role();begin if v_role<>'service_role' then return;end if;return query with candidate as (select c.id from public.notification_campaigns c join public.schools school on school.id=c.school_id and school.archived_at is null where (p_campaign_id is null or c.id=p_campaign_id) and (c.status='queued' or (c.status='scheduled' and c.scheduled_for<=now()) or (c.status='sending' and c.claimed_at<now()-interval '10 minutes')) order by coalesce(c.scheduled_for,c.created_at) for update of c skip locked limit case when p_campaign_id is null then 20 else 1 end) update public.notification_campaigns c set status='sending',claimed_at=now(),claim_token=pg_catalog.gen_random_uuid(),send_attempt_count=send_attempt_count+1,updated_at=now() from candidate where c.id=candidate.id returning c.*;end;$$;

revoke all on function public.notification_category_available(text,text),public.create_notification_campaign(uuid,text,text,text,text[],text,timestamptz,text,text,text,text,uuid,text,text,uuid,text),public.cancel_notification_campaign(uuid,uuid,bigint),public.reschedule_notification_campaign(uuid,uuid,bigint,timestamptz,text),public.claim_notification_campaign(uuid) from public,anon,authenticated;
grant execute on function public.create_notification_campaign(uuid,text,text,text,text[],text,timestamptz,text,text,text,text,uuid,text,text,uuid,text),public.cancel_notification_campaign(uuid,uuid,bigint),public.reschedule_notification_campaign(uuid,uuid,bigint,timestamptz,text) to authenticated;
grant execute on function public.claim_notification_campaign(uuid) to service_role;

commit;
