-- Emergency rollback for 20260724110000 before notification onboarding.
-- This permanently removes notification records. Export them first if the
-- feature has accepted any real device, campaign, delivery, or audit data.
begin;

drop trigger if exists initialize_notification_school_settings_after_school
  on public.schools;
drop trigger if exists enforce_notification_campaign_tenant_relationships
  on public.notification_campaigns;
drop trigger if exists enforce_notification_device_tenant_relationships
  on public.notification_devices;

drop function if exists public.claim_notification_campaign(uuid);
drop function if exists public.reschedule_notification_campaign(
  uuid,uuid,bigint,timestamptz,text
);
drop function if exists public.cancel_notification_campaign(uuid,uuid,bigint);
drop function if exists public.create_notification_campaign(
  uuid,text,text,text,text[],text,timestamptz,text,text,text,text,uuid,text,text,uuid,text
);
drop function if exists public.notification_category_available(text,text);
drop function if exists public.enforce_notification_device_tenant_relationships();
drop function if exists public.enforce_notification_campaign_tenant_relationships();
drop function if exists public.notification_user_can_access_school(uuid,uuid);
drop function if exists public.initialize_notification_school_settings();

drop table if exists public.notification_audit;
drop table if exists public.notification_deliveries;
drop table if exists public.notification_device_preferences;
drop table if exists public.push_subscriptions;
drop table if exists public.notification_devices;
drop table if exists public.notification_campaign_audiences;
drop table if exists public.notification_campaigns;
drop table if exists public.notification_school_settings;

delete from public.user_permissions
where permission_id in (
  select id from public.permissions where key='notifications'
);
delete from public.permissions where key='notifications';

commit;
