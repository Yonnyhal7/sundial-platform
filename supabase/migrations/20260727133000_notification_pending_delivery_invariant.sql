begin;

alter table public.notification_campaigns
  add column if not exists pending_count integer not null default 0;

with delivery_totals as (
  select
    campaign_id,
    count(*) filter (
      where delivery_status in ('pending','sending')
    )::integer as pending_count
  from public.notification_deliveries
  where campaign_id is not null
  group by campaign_id
)
update public.notification_campaigns campaign
set pending_count = coalesce(totals.pending_count,0)
from (
  select
    campaign.id,
    coalesce(delivery_totals.pending_count,0) as pending_count
  from public.notification_campaigns campaign
  left join delivery_totals on delivery_totals.campaign_id=campaign.id
) totals
where campaign.id=totals.id
  and campaign.pending_count is distinct from totals.pending_count;

with quarantined as (
  update public.notification_campaigns
  set status='sending',
      claimed_at=null,
      claim_token=null,
      sent_at=null,
      updated_at=now()
  where pending_count>0
    and status in ('sent','partially_failed','failed','no_eligible_devices')
  returning id,school_id,pending_count
)
insert into public.notification_audit(
  school_id,
  campaign_id,
  action,
  summary,
  new_values,
  result_status
)
select
  school_id,
  id,
  'campaign_pending_delivery_quarantined',
  'Campaign status reconciled because pending deliveries require an explicit retry decision.',
  jsonb_build_object(
    'status','sending',
    'pending_count',pending_count,
    'automatic_retry',false
  ),
  'blocked'
from quarantined;

alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_terminal_pending_check;

alter table public.notification_campaigns
  add constraint notification_campaigns_terminal_pending_check
  check(
    pending_count=0
    or status in ('draft','scheduled','queued','sending','cancelled')
  );

commit;
