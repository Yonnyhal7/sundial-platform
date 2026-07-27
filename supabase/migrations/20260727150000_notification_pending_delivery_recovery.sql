begin;

alter table public.notification_campaigns
  add column if not exists delivery_resolution_required boolean not null default false,
  add column if not exists cancelled_count integer not null default 0,
  add column if not exists delivery_recovery_requested_at timestamptz,
  add column if not exists delivery_recovery_requested_by uuid
    references public.users(id) on delete set null;

alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_status_check;
alter table public.notification_campaigns
  add constraint notification_campaigns_status_check
  check(status in (
    'draft','scheduled','queued','sending','sent','partially_failed',
    'failed','no_eligible_devices','partially_sent','cancelled'
  ));

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_delivery_status_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_delivery_status_check
  check(delivery_status in (
    'pending','sending','sent','inbox_only','failed',
    'disabled_subscription','cancelled'
  ));

update public.notification_campaigns campaign
set delivery_resolution_required=true,
    updated_at=now()
where campaign.pending_count>0
  and campaign.status='sending'
  and campaign.claim_token is null
  and campaign.claimed_at is null
  and campaign.archived_at is null
  and campaign.delivery_resolution_required is false
  and exists (
    select 1
    from public.notification_audit audit
    where audit.school_id=campaign.school_id
      and audit.campaign_id=campaign.id
      and audit.action='campaign_pending_delivery_quarantined'
  );

alter table public.notification_campaigns
  drop constraint if exists notification_campaign_resolution_required_check;
alter table public.notification_campaigns
  add constraint notification_campaign_resolution_required_check
  check(
    not delivery_resolution_required
    or (
      pending_count>0
      and status='sending'
      and claim_token is null
      and claimed_at is null
      and archived_at is null
    )
  );

create or replace function public.retry_notification_campaign_pending(
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
  v_actor uuid:=auth.uid();
  v_row public.notification_campaigns%rowtype;
  v_pending integer;
  v_ambiguous integer;
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
  if v_row.archived_at is not null then return jsonb_build_object('status','archived'); end if;
  if v_row.claim_token is not null or v_row.claimed_at is not null then
    return jsonb_build_object('status','active_processing');
  end if;
  if not v_row.delivery_resolution_required or v_row.pending_count<=0 then
    return jsonb_build_object('status','resolution_not_required');
  end if;

  select
    count(*) filter(where delivery_status='pending')::integer,
    count(*) filter(where delivery_status='sending')::integer
  into v_pending,v_ambiguous
  from public.notification_deliveries
  where campaign_id=v_row.id and school_id=p_school_id;

  if v_ambiguous>0 then
    return jsonb_build_object(
      'status','ambiguous_deliveries',
      'pending_count',v_pending,
      'ambiguous_count',v_ambiguous
    );
  end if;
  if v_pending<=0 or v_pending<>v_row.pending_count then
    return jsonb_build_object('status','pending_count_mismatch');
  end if;

  update public.notification_campaigns
  set status='queued',
      delivery_resolution_required=false,
      delivery_recovery_requested_at=now(),
      delivery_recovery_requested_by=v_actor,
      claimed_at=null,
      claim_token=null,
      sent_at=null,
      updated_at=now(),
      updated_by=v_actor,
      version=version+1
  where id=v_row.id and school_id=p_school_id;

  insert into public.notification_audit(
    school_id,campaign_id,actor_id,action,summary,previous_values,new_values
  ) values (
    p_school_id,v_row.id,v_actor,'campaign_pending_retry_requested',
    format('Retry requested for %s pending deliveries.',v_pending),
    jsonb_build_object(
      'status',v_row.status,
      'pending_count',v_row.pending_count,
      'delivery_resolution_required',v_row.delivery_resolution_required
    ),
    jsonb_build_object(
      'status','queued',
      'pending_count',v_pending,
      'delivery_resolution_required',false
    )
  );

  return jsonb_build_object(
    'status','success',
    'pending_count',v_pending,
    'version',v_row.version+1
  );
end;
$$;

create or replace function public.cancel_notification_campaign_pending(
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
  v_actor uuid:=auth.uid();
  v_row public.notification_campaigns%rowtype;
  v_cancelled integer;
  v_status text;
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
  if v_row.archived_at is not null then return jsonb_build_object('status','archived'); end if;
  if v_row.claim_token is not null or v_row.claimed_at is not null then
    return jsonb_build_object('status','active_processing');
  end if;
  if not v_row.delivery_resolution_required or v_row.pending_count<=0 then
    return jsonb_build_object('status','resolution_not_required');
  end if;

  update public.notification_deliveries
  set delivery_status='cancelled'
  where campaign_id=v_row.id
    and school_id=p_school_id
    and delivery_status in ('pending','sending');
  get diagnostics v_cancelled=row_count;

  if v_cancelled<=0 or v_cancelled<>v_row.pending_count then
    raise exception 'Pending delivery count changed during cancellation';
  end if;

  v_status:=case when v_row.successful_count>0 then 'partially_sent' else 'cancelled' end;

  update public.notification_campaigns
  set status=v_status,
      pending_count=0,
      cancelled_count=v_cancelled,
      delivery_resolution_required=false,
      delivery_recovery_requested_at=null,
      delivery_recovery_requested_by=null,
      claimed_at=null,
      claim_token=null,
      sent_at=now(),
      cancelled_at=case when v_status='cancelled' then now() else cancelled_at end,
      updated_at=now(),
      updated_by=v_actor,
      version=version+1
  where id=v_row.id and school_id=p_school_id;

  insert into public.notification_audit(
    school_id,campaign_id,actor_id,action,summary,previous_values,new_values
  ) values (
    p_school_id,v_row.id,v_actor,'campaign_pending_deliveries_cancelled',
    format('Remaining %s deliveries cancelled by administrator.',v_cancelled),
    jsonb_build_object(
      'status',v_row.status,
      'pending_count',v_row.pending_count,
      'successful_count',v_row.successful_count
    ),
    jsonb_build_object(
      'status',v_status,
      'pending_count',0,
      'cancelled_count',v_cancelled
    )
  );

  return jsonb_build_object(
    'status','success',
    'campaign_status',v_status,
    'cancelled_count',v_cancelled,
    'version',v_row.version+1
  );
end;
$$;

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
  v_actor uuid:=auth.uid();
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
  if v_row.status='sending' or v_row.pending_count>0 or v_row.delivery_resolution_required then
    return jsonb_build_object('status','active_processing');
  end if;

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

revoke all on function
  public.retry_notification_campaign_pending(uuid,uuid,bigint),
  public.cancel_notification_campaign_pending(uuid,uuid,bigint)
from public,anon,authenticated;
grant execute on function
  public.retry_notification_campaign_pending(uuid,uuid,bigint),
  public.cancel_notification_campaign_pending(uuid,uuid,bigint)
to authenticated;

commit;
