-- Transactional production database smoke tests for
-- 20260724110000_notification_foundation.sql.
-- Every synthetic mutation is rolled back. This file never calls Web Push.
begin;

do $test$
declare
  v_super uuid;
  v_admin_a uuid;
  v_admin_b uuid;
  v_editor uuid;
  v_school_a uuid;
  v_school_b uuid;
  v_archived_school uuid;
  v_slug_a text;
  v_slug_b text;
  v_archived_slug text;
  v_timezone_a text;
  v_timezone_b text;
  v_calendar_b uuid;
  v_permission uuid;
  v_result jsonb;
  v_duplicate jsonb;
  v_draft uuid;
  v_scheduled uuid;
  v_queued uuid;
  v_editor_campaign uuid;
  v_device_student uuid;
  v_device_parent uuid;
  v_device_staff uuid;
  v_device_second uuid;
  v_count bigint;
  v_version bigint;
  v_claim_token uuid;
  v_delivery uuid;
begin
  select id into strict v_super
  from public.users
  where is_active is true
    and lower(replace(coalesce(role,''),'_',''))='superadmin'
  order by id
  limit 1;

  select actor.id,school.id,school.subdomain,school.timezone
  into strict v_admin_a,v_school_a,v_slug_a,v_timezone_a
  from public.users actor
  join public.schools school on school.id=actor.school_id
  where actor.is_active is true
    and lower(replace(coalesce(actor.role,''),'_',''))='schooladmin'
    and school.archived_at is null
  order by actor.id
  limit 1;

  select actor.id,school.id,school.subdomain,school.timezone
  into strict v_admin_b,v_school_b,v_slug_b,v_timezone_b
  from public.users actor
  join public.schools school on school.id=actor.school_id
  where actor.is_active is true
    and lower(replace(coalesce(actor.role,''),'_',''))='schooladmin'
    and school.archived_at is null
    and actor.id<>v_admin_a
  order by actor.id
  limit 1;

  select id,subdomain
  into strict v_archived_school,v_archived_slug
  from public.schools
  where archived_at is not null
  order by id
  limit 1;

  select id into strict v_editor
  from public.users
  where is_active is not true
  order by id
  limit 1;

  select id into strict v_permission
  from public.permissions
  where key='notifications';

  select id into strict v_calendar_b
  from public.calendar_days
  where school_id=v_school_b
  order by id
  limit 1;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_admin_a::text,true);

  v_result:=public.create_notification_campaign(
    v_school_a,
    'Database smoke draft',
    'Synthetic notification rolled back after verification.',
    'important_announcement',
    array['student','parent'],
    'draft',
    null,
    v_timezone_a,
    'normal',
    '/'||v_slug_a||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-draft-0001'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Draft campaign failed: %',v_result;
  end if;
  v_draft:=(v_result->>'campaign_id')::uuid;

  v_duplicate:=public.create_notification_campaign(
    v_school_a,
    'Database smoke duplicate',
    'This must return the existing synthetic campaign.',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone_a,
    'normal',
    '/'||v_slug_a||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-draft-0001'
  );
  if v_duplicate->>'status'<>'duplicate'
     or (v_duplicate->>'campaign_id')::uuid<>v_draft then
    raise exception 'Idempotent creation failed: %',v_duplicate;
  end if;

  v_result:=public.create_notification_campaign(
    v_school_a,
    'Database smoke scheduled',
    'Synthetic scheduled notification.',
    'school_event',
    array['parent'],
    'scheduled',
    now()+interval '2 hours',
    v_timezone_a,
    'normal',
    '/'||v_slug_a||'/app/events',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-scheduled-01'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Scheduled campaign failed: %',v_result;
  end if;
  v_scheduled:=(v_result->>'campaign_id')::uuid;

  v_result:=public.create_notification_campaign(
    v_school_a,
    'Database smoke queued',
    'Synthetic queued notification.',
    'emergency',
    array['staff'],
    'queued',
    null,
    v_timezone_a,
    'emergency',
    '/'||v_slug_a||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-queued-0001'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Send-now queue creation failed: %',v_result;
  end if;
  v_queued:=(v_result->>'campaign_id')::uuid;

  v_result:=public.cancel_notification_campaign(v_draft,v_school_a,1);
  if v_result->>'status'<>'success' then
    raise exception 'Cancellation failed: %',v_result;
  end if;
  v_result:=public.cancel_notification_campaign(v_draft,v_school_a,1);
  if v_result->>'status'<>'stale' then
    raise exception 'Optimistic-version rejection failed: %',v_result;
  end if;

  select version into strict v_version
  from public.notification_campaigns
  where id=v_scheduled;
  v_result:=public.reschedule_notification_campaign(
    v_scheduled,
    v_school_a,
    v_version,
    now()+interval '3 hours',
    v_timezone_a
  );
  if v_result->>'status'<>'success' then
    raise exception 'Rescheduling failed: %',v_result;
  end if;

  v_result:=public.create_notification_campaign(
    v_school_b,
    'Cross-school attempt',
    'This must be rejected.',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone_b,
    'normal',
    '/'||v_slug_b||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-cross-school'
  );
  if v_result->>'status'<>'permission_error' then
    raise exception 'Cross-school campaign was not rejected: %',v_result;
  end if;

  perform set_config('request.jwt.claim.sub',v_super::text,true);
  v_result:=public.create_notification_campaign(
    v_archived_school,
    'Archived-school attempt',
    'This must be rejected.',
    'important_announcement',
    array['student'],
    'draft',
    null,
    'America/Los_Angeles',
    'normal',
    '/'||v_archived_slug||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-archived-001'
  );
  if v_result->>'status'<>'permission_error' then
    raise exception 'Archived-school campaign was not rejected: %',v_result;
  end if;

  delete from public.user_permissions where user_id=v_editor;
  delete from public.school_memberships where user_id=v_editor;
  update public.users
  set role='Editor',is_active=true,school_id=null
  where id=v_editor;
  insert into public.school_memberships(user_id,school_id,role,is_active)
  values(v_editor,v_school_a,'Editor',true);

  perform set_config('request.jwt.claim.sub',v_editor::text,true);
  v_result:=public.create_notification_campaign(
    v_school_a,
    'Editor denied',
    'Editor without notification permission.',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone_a,
    'normal',
    '/'||v_slug_a||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-editor-denied'
  );
  if v_result->>'status'<>'permission_error' then
    raise exception 'Editor without permission was authorized: %',v_result;
  end if;

  insert into public.user_permissions(user_id,permission_id)
  values(v_editor,v_permission);
  v_result:=public.create_notification_campaign(
    v_school_a,
    'Editor allowed',
    'Membership-aware Editor authorization.',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone_a,
    'normal',
    '/'||v_slug_a||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-smoke-editor-allowed'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Permitted Editor was rejected: %',v_result;
  end if;
  v_editor_campaign:=(v_result->>'campaign_id')::uuid;

  v_result:=public.create_notification_campaign(
    v_school_a,
    'Cross-related entity',
    'Cross-school calendar relation must be rejected.',
    'calendar_schedule_change',
    array['student'],
    'draft',
    null,
    v_timezone_a,
    'normal',
    '/'||v_slug_a||'/app/schedule',
    'calendar_change',
    v_calendar_b,
    'audience',
    null,
    null,
    'production-smoke-cross-related'
  );
  if v_result->>'status'<>'invalid_related_entity' then
    raise exception 'Cross-school related entity was not rejected: %',v_result;
  end if;

  begin
    update public.notification_campaigns
    set destination_url='/'||v_slug_b||'/app'
    where id=v_editor_campaign;
    raise exception 'Cross-school destination unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.notification_campaign_audiences(
      school_id,campaign_id,audience
    )
    values(v_school_b,v_editor_campaign,'parent');
    raise exception 'Cross-school campaign audience unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.notification_devices(
      school_id,user_id,installation_id,device_token_hash,audience,
      platform,browser,pwa_installed,notifications_supported,permission_status
    )
    values(
      v_school_a,v_admin_b,'prod-smoke-cross-user-01',repeat('1',64),
      'student','test','test',false,false,'default'
    );
    raise exception 'Cross-school authenticated device unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.notification_devices(
      school_id,user_id,installation_id,device_token_hash,audience,
      platform,browser,pwa_installed,notifications_supported,permission_status
    )
    values(
      v_archived_school,null,'prod-smoke-archived-001',repeat('2',64),
      'student','test','test',false,false,'default'
    );
    raise exception 'Archived-school device unexpectedly succeeded';
  exception
    when check_violation then null;
  end;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    v_school_a,null,'prod-smoke-student-0001',repeat('a',64),
    'student','test','test',true,true,'granted'
  )
  returning id into v_device_student;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    v_school_a,v_admin_a,'prod-smoke-parent-00001',repeat('b',64),
    'parent','test','test',true,true,'granted'
  )
  returning id into v_device_parent;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    v_school_a,v_editor,'prod-smoke-staff-000001',repeat('c',64),
    'staff','test','test',true,true,'granted'
  )
  returning id into v_device_staff;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    v_school_a,v_admin_a,'prod-smoke-parent-00002',repeat('d',64),
    'parent','test','test',true,false,'default'
  )
  returning id into v_device_second;

  insert into public.notification_device_preferences(
    school_id,device_id,category,enabled
  )
  values
    (v_school_a,v_device_student,'important_announcement',true),
    (v_school_a,v_device_parent,'school_event',true),
    (v_school_a,v_device_second,'school_event',false),
    (v_school_a,v_device_staff,'important_announcement',true);

  if (
    select count(distinct enabled)
    from public.notification_device_preferences
    where device_id in (v_device_parent,v_device_second)
      and category='school_event'
  )<>2 then
    raise exception 'Per-device preference isolation failed';
  end if;

  begin
    insert into public.notification_device_preferences(
      school_id,device_id,category,enabled
    )
    values(v_school_b,v_device_student,'emergency',true);
    raise exception 'Cross-school preference unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.push_subscriptions(
    school_id,device_id,endpoint,p256dh,auth
  )
  values(
    v_school_a,v_device_student,
    'https://push.invalid/production-smoke-first',
    'synthetic-p256dh','synthetic-auth'
  );

  begin
    insert into public.push_subscriptions(
      school_id,device_id,endpoint,p256dh,auth
    )
    values(
      v_school_a,v_device_student,
      'https://push.invalid/production-smoke-overlap',
      'synthetic-p256dh','synthetic-auth'
    );
    raise exception 'Overlapping active push subscription unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  update public.push_subscriptions
  set disabled_at=now()
  where device_id=v_device_student
    and disabled_at is null;
  insert into public.push_subscriptions(
    school_id,device_id,endpoint,p256dh,auth
  )
  values(
    v_school_a,v_device_student,
    'https://push.invalid/production-smoke-replacement',
    'synthetic-p256dh','synthetic-auth'
  );

  begin
    insert into public.push_subscriptions(
      school_id,device_id,endpoint,p256dh,auth
    )
    values(
      v_school_b,v_device_parent,
      'https://push.invalid/production-smoke-cross',
      'synthetic-p256dh','synthetic-auth'
    );
    raise exception 'Cross-school subscription unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.notification_deliveries(
    school_id,campaign_id,device_id,audience,delivery_status
  )
  values(
    v_school_a,v_editor_campaign,v_device_student,'student','inbox_only'
  )
  returning id into v_delivery;
  insert into public.notification_deliveries(
    school_id,campaign_id,device_id,audience,delivery_status
  )
  values(
    v_school_a,v_editor_campaign,v_device_parent,'parent','sent'
  );

  select count(*) into v_count
  from public.notification_deliveries
  where device_id in (v_device_student,v_device_parent)
    and read_at is null;
  if v_count<>2 then
    raise exception 'Unread count failed: %',v_count;
  end if;

  update public.notification_deliveries
  set read_at=now()
  where id=v_delivery and device_id=v_device_student;
  if exists(
    select 1
    from public.notification_deliveries
    where id=v_delivery and read_at is null
  ) then
    raise exception 'Mark-one-read failed';
  end if;

  update public.notification_deliveries
  set read_at=now()
  where device_id=v_device_parent and read_at is null;
  if exists(
    select 1
    from public.notification_deliveries
    where device_id in (v_device_student,v_device_parent)
      and read_at is null
  ) then
    raise exception 'Mark-all-read failed';
  end if;

  insert into public.notification_deliveries(
    school_id,campaign_id,device_id,audience,delivery_status
  )
  values(
    v_school_a,v_editor_campaign,v_device_parent,'parent','failed'
  )
  on conflict(campaign_id,device_id) do nothing;
  if (
    select delivery_status
    from public.notification_deliveries
    where campaign_id=v_editor_campaign and device_id=v_device_parent
  )<>'sent' then
    raise exception 'Completed-delivery retry protection failed';
  end if;

  begin
    insert into public.notification_deliveries(
      school_id,campaign_id,device_id,audience,delivery_status
    )
    values(
      v_school_b,v_editor_campaign,v_device_staff,'staff','pending'
    );
    raise exception 'Cross-school delivery unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.notification_audit(
      school_id,campaign_id,action,summary
    )
    values(
      v_school_b,v_editor_campaign,
      'production_smoke_cross_school',
      'Synthetic cross-school audit'
    );
    raise exception 'Cross-school audit unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  update public.push_subscriptions
  set disabled_at=now(),last_failure_at=now(),failure_count=failure_count+1
  where device_id=v_device_student and disabled_at is null;
  update public.notification_deliveries
  set delivery_status='disabled_subscription',
      failed_at=now(),
      failure_reason='web_push_410'
  where campaign_id=v_editor_campaign and device_id=v_device_student;
  if exists(
    select 1
    from public.push_subscriptions
    where device_id=v_device_student and disabled_at is null
  ) or (
    select delivery_status
    from public.notification_deliveries
    where campaign_id=v_editor_campaign and device_id=v_device_student
  )<>'disabled_subscription' then
    raise exception 'Permanent subscription failure handling failed';
  end if;

  perform set_config('request.jwt.claim.role','service_role',true);
  select claim_token into v_claim_token
  from public.claim_notification_campaign(v_queued)
  limit 1;
  if v_claim_token is null then
    raise exception 'Atomic due-campaign claim failed';
  end if;
  if exists(select 1 from public.claim_notification_campaign(v_queued)) then
    raise exception 'Actively claimed campaign was claimed twice';
  end if;
  update public.notification_campaigns
  set claimed_at=now()-interval '11 minutes'
  where id=v_queued;
  if not exists(select 1 from public.claim_notification_campaign(v_queued)) then
    raise exception 'Stale claim retry failed';
  end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_admin_b::text,true);
  for v_count in 1..20 loop
    insert into public.notification_campaigns(
      school_id,title,body,category,status,origin_timezone,
      created_by,updated_by,idempotency_key
    )
    values(
      v_school_b,
      'Rate limit seed',
      'Synthetic rate-limit campaign.',
      'important_announcement',
      'queued',
      v_timezone_b,
      v_admin_b,
      v_admin_b,
      'production-rate-'||lpad(v_count::text,8,'0')
    );
  end loop;
  v_result:=public.create_notification_campaign(
    v_school_b,
    'Rate limit blocked',
    'Synthetic twenty-first campaign.',
    'important_announcement',
    array['student'],
    'queued',
    null,
    v_timezone_b,
    'normal',
    '/'||v_slug_b||'/app',
    null,
    null,
    'audience',
    null,
    null,
    'production-rate-limit-block'
  );
  if v_result->>'status'<>'rate_limited' then
    raise exception 'Rate limiting failed: %',v_result;
  end if;
end
$test$;

rollback;

select jsonb_build_object(
  'status','notification_foundation_production_smoke_rolled_back',
  'campaigns_remaining',(select count(*) from public.notification_campaigns),
  'devices_remaining',(select count(*) from public.notification_devices),
  'subscriptions_remaining',(select count(*) from public.push_subscriptions),
  'preferences_remaining',(select count(*) from public.notification_device_preferences),
  'deliveries_remaining',(select count(*) from public.notification_deliveries),
  'audit_rows_remaining',(select count(*) from public.notification_audit),
  'external_pushes',0
) as result;
