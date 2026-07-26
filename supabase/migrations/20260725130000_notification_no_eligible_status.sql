alter table public.notification_campaigns
  drop constraint if exists notification_campaigns_status_check;

alter table public.notification_campaigns
  add constraint notification_campaigns_status_check
  check(status in (
    'draft',
    'scheduled',
    'queued',
    'sending',
    'sent',
    'partially_failed',
    'failed',
    'no_eligible_devices',
    'cancelled'
  ));

update public.notification_campaigns
set status = case
      when eligible_count = 0 then 'no_eligible_devices'
      when successful_count > 0 and failed_count > 0 then 'partially_failed'
      when successful_count = 0 and failed_count > 0 then 'failed'
      when successful_count > 0 and failed_count = 0 then 'sent'
      else status
    end,
    updated_at = now()
where status in ('sent', 'partially_failed', 'failed', 'no_eligible_devices')
  and status is distinct from case
    when eligible_count = 0 then 'no_eligible_devices'
    when successful_count > 0 and failed_count > 0 then 'partially_failed'
    when successful_count = 0 and failed_count > 0 then 'failed'
    when successful_count > 0 and failed_count = 0 then 'sent'
    else status
  end;
