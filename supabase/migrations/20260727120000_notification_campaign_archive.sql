alter table public.notification_campaigns
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null;

create index if not exists notification_campaigns_school_archived_idx
  on public.notification_campaigns(school_id,archived_at,created_at desc);

alter table public.notification_deliveries
  add column if not exists campaign_title text,
  add column if not exists campaign_body text,
  add column if not exists campaign_category text,
  add column if not exists campaign_destination_url text,
  add column if not exists campaign_related_entity_type text;

update public.notification_deliveries delivery
set campaign_title = campaign.title,
    campaign_body = campaign.body,
    campaign_category = campaign.category,
    campaign_destination_url = campaign.destination_url,
    campaign_related_entity_type = campaign.related_entity_type
from public.notification_campaigns campaign
where campaign.id = delivery.campaign_id
  and campaign.school_id = delivery.school_id
  and (
    delivery.campaign_title is null
    or delivery.campaign_body is null
    or delivery.campaign_category is null
  );

alter table public.notification_deliveries
  alter column campaign_title set not null,
  alter column campaign_body set not null,
  alter column campaign_category set not null,
  alter column campaign_id drop not null;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_campaign_id_school_id_fkey,
  drop constraint if exists notification_deliveries_campaign_id_fkey;
alter table public.notification_deliveries
  add constraint notification_deliveries_campaign_id_fkey
  foreign key(campaign_id) references public.notification_campaigns(id) on delete set null;

alter table public.notification_audit
  drop constraint if exists notification_audit_campaign_id_school_id_fkey,
  drop constraint if exists notification_audit_campaign_id_fkey;
alter table public.notification_audit
  add constraint notification_audit_campaign_id_fkey
  foreign key(campaign_id) references public.notification_campaigns(id) on delete set null;

create or replace function public.enforce_notification_delivery_campaign_tenant()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.campaign_id is not null and not exists (
    select 1
    from public.notification_campaigns campaign
    where campaign.id = new.campaign_id
      and campaign.school_id = new.school_id
  ) then
    raise exception 'Notification delivery campaign must belong to the same school';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_notification_delivery_campaign_tenant
  on public.notification_deliveries;
create trigger enforce_notification_delivery_campaign_tenant
before insert or update of campaign_id,school_id
on public.notification_deliveries
for each row execute function public.enforce_notification_delivery_campaign_tenant();

create or replace function public.enforce_notification_audit_campaign_tenant()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.campaign_id is not null and not exists (
    select 1
    from public.notification_campaigns campaign
    where campaign.id = new.campaign_id
      and campaign.school_id = new.school_id
  ) then
    raise exception 'Notification audit campaign must belong to the same school';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_notification_audit_campaign_tenant
  on public.notification_audit;
create trigger enforce_notification_audit_campaign_tenant
before insert or update of campaign_id,school_id
on public.notification_audit
for each row execute function public.enforce_notification_audit_campaign_tenant();

create or replace function public.archive_notification_campaign(
  p_campaign_id uuid,
  p_school_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.notification_campaigns%rowtype;
begin
  if not public.current_user_can_manage_school_section(p_school_id,'notifications') then
    return jsonb_build_object('status','permission_error');
  end if;
  select * into v_row
  from public.notification_campaigns
  where id=p_campaign_id and school_id=p_school_id
  for update;
  if v_row.id is null then return jsonb_build_object('status','not_found'); end if;
  if v_row.version<>p_expected_version then return jsonb_build_object('status','stale'); end if;
  if v_row.archived_at is not null then return jsonb_build_object('status','already_archived'); end if;
  if v_row.status='sending' then return jsonb_build_object('status','active_processing'); end if;

  update public.notification_campaigns
  set archived_at=now(),archived_by=v_actor,updated_at=now(),
      updated_by=v_actor,version=version+1
  where id=v_row.id and school_id=p_school_id;
  insert into public.notification_audit(
    school_id,campaign_id,actor_id,action,summary,previous_values,new_values
  ) values (
    p_school_id,v_row.id,v_actor,'campaign_archived','Archived notification campaign',
    jsonb_build_object('archived_at',v_row.archived_at),
    jsonb_build_object('archived_at',now())
  );
  return jsonb_build_object('status','success');
end;
$$;

create or replace function public.restore_notification_campaign(
  p_campaign_id uuid,
  p_school_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.notification_campaigns%rowtype;
begin
  if not public.current_user_can_manage_school_section(p_school_id,'notifications') then
    return jsonb_build_object('status','permission_error');
  end if;
  select * into v_row
  from public.notification_campaigns
  where id=p_campaign_id and school_id=p_school_id
  for update;
  if v_row.id is null then return jsonb_build_object('status','not_found'); end if;
  if v_row.version<>p_expected_version then return jsonb_build_object('status','stale'); end if;
  if v_row.archived_at is null then return jsonb_build_object('status','not_archived'); end if;

  update public.notification_campaigns
  set archived_at=null,archived_by=null,updated_at=now(),
      updated_by=v_actor,version=version+1
  where id=v_row.id and school_id=p_school_id;
  insert into public.notification_audit(
    school_id,campaign_id,actor_id,action,summary,previous_values,new_values
  ) values (
    p_school_id,v_row.id,v_actor,'campaign_restored','Restored notification campaign',
    jsonb_build_object('archived_at',v_row.archived_at),
    jsonb_build_object('archived_at',null)
  );
  return jsonb_build_object('status','success');
end;
$$;

create or replace function public.permanently_delete_notification_campaign(
  p_campaign_id uuid,
  p_school_id uuid,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.notification_campaigns%rowtype;
begin
  if not public.current_user_can_manage_school_section(p_school_id,'notifications') then
    return jsonb_build_object('status','permission_error');
  end if;
  select * into v_row
  from public.notification_campaigns
  where id=p_campaign_id and school_id=p_school_id
  for update;
  if v_row.id is null then return jsonb_build_object('status','not_found'); end if;
  if v_row.version<>p_expected_version then return jsonb_build_object('status','stale'); end if;
  if v_row.archived_at is null then return jsonb_build_object('status','archive_required'); end if;

  insert into public.notification_audit(
    school_id,campaign_id,actor_id,action,summary,previous_values,new_values
  ) values (
    p_school_id,v_row.id,v_actor,'campaign_permanently_deleted',
    'Permanently deleted notification campaign from admin history',
    jsonb_build_object(
      'campaign_id',v_row.id,
      'title',v_row.title,
      'status',v_row.status,
      'eligible_count',v_row.eligible_count,
      'successful_count',v_row.successful_count,
      'failed_count',v_row.failed_count,
      'archived_at',v_row.archived_at
    ),
    jsonb_build_object('deleted_at',now())
  );

  delete from public.notification_campaigns
  where id=v_row.id and school_id=p_school_id;
  return jsonb_build_object('status','success');
end;
$$;

create or replace function public.claim_notification_campaign(p_campaign_id uuid default null)
returns setof public.notification_campaigns
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text:=auth.role();
begin
  if v_role<>'service_role' then return; end if;
  return query
  with candidate as (
    select campaign.id
    from public.notification_campaigns campaign
    join public.schools school
      on school.id=campaign.school_id and school.archived_at is null
    where campaign.archived_at is null
      and (p_campaign_id is null or campaign.id=p_campaign_id)
      and (
        campaign.status='queued'
        or (campaign.status='scheduled' and campaign.scheduled_for<=now())
        or (campaign.status='sending' and campaign.claimed_at<now()-interval '10 minutes')
      )
    order by coalesce(campaign.scheduled_for,campaign.created_at)
    for update of campaign skip locked
    limit case when p_campaign_id is null then 20 else 1 end
  )
  update public.notification_campaigns campaign
  set status='sending',claimed_at=now(),claim_token=pg_catalog.gen_random_uuid(),
      send_attempt_count=send_attempt_count+1,updated_at=now()
  from candidate
  where campaign.id=candidate.id
  returning campaign.*;
end;
$$;

revoke all on function
  public.archive_notification_campaign(uuid,uuid,bigint),
  public.restore_notification_campaign(uuid,uuid,bigint),
  public.permanently_delete_notification_campaign(uuid,uuid,bigint)
from public,anon,authenticated;
grant execute on function
  public.archive_notification_campaign(uuid,uuid,bigint),
  public.restore_notification_campaign(uuid,uuid,bigint),
  public.permanently_delete_notification_campaign(uuid,uuid,bigint)
to authenticated;
