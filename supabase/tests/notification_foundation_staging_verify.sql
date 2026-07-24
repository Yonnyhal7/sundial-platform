-- Destructive synthetic assertions for the dedicated migration-staging project.
-- No push provider, VAPID key, email provider, production domain, or cron is used.
do $test$
declare
  v_result jsonb;
  v_duplicate jsonb;
  v_campaign uuid;
  v_scheduled uuid;
  v_queued uuid;
  v_editor_campaign uuid;
  v_device_student uuid;
  v_device_parent uuid;
  v_device_staff uuid;
  v_device_second uuid;
  v_count bigint;
  v_version bigint;
  v_timezone text;
  v_claim_token uuid;
begin
  if (
    select count(*)
    from information_schema.tables
    where table_schema='public'
      and table_name in (
        'notification_school_settings',
        'notification_campaigns',
        'notification_campaign_audiences',
        'notification_devices',
        'push_subscriptions',
        'notification_device_preferences',
        'notification_deliveries',
        'notification_audit'
      )
  )<>8 then
    raise exception 'Notification table set is incomplete';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname like 'notification_%'
      and relation.relkind='r'
      and not relation.relrowsecurity
  ) or not (
    select relrowsecurity
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname='push_subscriptions'
  ) then
    raise exception 'Notification RLS flags are incomplete';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname='public'
      and tablename like 'notification_%'
  )<>5 then
    raise exception 'Notification policy count is not least privilege';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (
        'notification_devices',
        'push_subscriptions',
        'notification_device_preferences'
      )
      and grantee in ('anon','authenticated')
  ) then
    raise exception 'Application roles can access notification secrets';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (
        'notification_school_settings',
        'notification_campaigns',
        'notification_campaign_audiences',
        'notification_deliveries',
        'notification_audit'
      )
      and grantee='authenticated'
      and privilege_type<>'SELECT'
  ) then
    raise exception 'Authenticated notification grants exceed SELECT';
  end if;

  if (
    select count(*)
    from public.notification_school_settings
  )<>2
     or exists (
       select 1
       from public.notification_school_settings settings
       join public.schools school on school.id=settings.school_id
       where school.archived_at is not null
     ) then
    raise exception 'Initial notification settings include the wrong schools';
  end if;

  insert into public.schools(id,name,subdomain,timezone,archived_at)
  values(
    '40000000-0000-0000-0000-000000000004',
    'Synthetic Trigger School',
    'synthetic-trigger',
    'America/Chicago',
    null
  );
  if not exists (
    select 1
    from public.notification_school_settings
    where school_id='40000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'Active-school settings trigger did not initialize';
  end if;
  delete from public.schools
  where id='40000000-0000-0000-0000-000000000004';

  insert into public.schools(id,name,subdomain,timezone,archived_at)
  values(
    '50000000-0000-0000-0000-000000000005',
    'Synthetic Archived Trigger School',
    'synthetic-trigger-archived',
    'America/Chicago',
    now()
  );
  if exists (
    select 1
    from public.notification_school_settings
    where school_id='50000000-0000-0000-0000-000000000005'
  ) then
    raise exception 'Archived-school settings were initialized';
  end if;
  delete from public.schools
  where id='50000000-0000-0000-0000-000000000005';

  select timezone into v_timezone
  from public.schools
  where id='10000000-0000-0000-0000-000000000001';

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000002',
    true
  );
  perform set_config('request.jwt.claim.role','authenticated',true);

  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Draft notification',
    'Synthetic draft body',
    'important_announcement',
    array['student','parent'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-draft-0001'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Draft creation failed: %',v_result;
  end if;
  v_campaign:=(v_result->>'campaign_id')::uuid;

  v_duplicate:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Duplicate draft',
    'This must return the existing campaign',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-draft-0001'
  );
  if v_duplicate->>'status'<>'duplicate'
     or (v_duplicate->>'campaign_id')::uuid<>v_campaign then
    raise exception 'Idempotency did not return the existing campaign: %',v_duplicate;
  end if;

  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Scheduled notification',
    'Synthetic scheduled body',
    'school_event',
    array['parent'],
    'scheduled',
    now()+interval '2 hours',
    v_timezone,
    'normal',
    '/synthetic-a/app/calendar',
    null,
    null,
    'audience',
    null,
    null,
    'staging-scheduled-0001'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Schedule creation failed: %',v_result;
  end if;
  v_scheduled:=(v_result->>'campaign_id')::uuid;

  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Queued notification',
    'Synthetic queued body',
    'emergency',
    array['staff'],
    'queued',
    null,
    v_timezone,
    'emergency',
    '/synthetic-a/app',
    'announcement',
    'a0000000-0000-0000-0000-000000000001',
    'audience',
    null,
    null,
    'staging-queued-0001'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Send-now creation failed: %',v_result;
  end if;
  v_queued:=(v_result->>'campaign_id')::uuid;

  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Invalid audience',
    'Synthetic invalid body',
    'staff_meeting',
    array['student'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-invalid-audience'
  );
  if v_result->>'status'<>'invalid_audience' then
    raise exception 'Invalid category/audience pair was accepted: %',v_result;
  end if;

  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Invalid destination',
    'Synthetic invalid destination',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-b/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-invalid-dest-01'
  );
  if v_result->>'status'<>'invalid_destination' then
    raise exception 'Cross-tenant destination was accepted: %',v_result;
  end if;

  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Invalid relation',
    'Synthetic cross-school related entity',
    'school_event',
    array['parent'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    'event',
    'e0000000-0000-0000-0000-000000000002',
    'audience',
    null,
    null,
    'staging-invalid-rel-001'
  );
  if v_result->>'status'<>'invalid_related_entity' then
    raise exception 'Cross-tenant related entity was accepted: %',v_result;
  end if;

  v_result:=public.cancel_notification_campaign(
    v_campaign,
    '10000000-0000-0000-0000-000000000001',
    1
  );
  if v_result->>'status'<>'success' then
    raise exception 'Campaign cancellation failed: %',v_result;
  end if;

  v_result:=public.cancel_notification_campaign(
    v_campaign,
    '10000000-0000-0000-0000-000000000001',
    1
  );
  if v_result->>'status'<>'stale' then
    raise exception 'Stale cancellation was not rejected: %',v_result;
  end if;

  select version into v_version
  from public.notification_campaigns
  where id=v_scheduled;
  v_result:=public.reschedule_notification_campaign(
    v_scheduled,
    '10000000-0000-0000-0000-000000000001',
    v_version,
    now()+interval '3 hours',
    v_timezone
  );
  if v_result->>'status'<>'success' then
    raise exception 'Campaign reschedule failed: %',v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000003',
    true
  );
  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Editor notification',
    'Synthetic editor notification',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-editor-000001'
  );
  if v_result->>'status'<>'permission_error' then
    raise exception 'Editor without notification permission was authorized early';
  end if;

  insert into public.user_permissions(user_id,permission_id)
  select
    '00000000-0000-0000-0000-000000000003',
    id
  from public.permissions
  where key='notifications'
  on conflict do nothing;

  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Editor notification',
    'Synthetic editor notification',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-editor-000002'
  );
  if v_result->>'status'<>'success' then
    raise exception 'Permitted Editor was rejected: %',v_result;
  end if;
  v_editor_campaign:=(v_result->>'campaign_id')::uuid;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000004',
    true
  );
  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Cross-school notification',
    'Synthetic cross-school attempt',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-cross-school-01'
  );
  if v_result->>'status'<>'permission_error' then
    raise exception 'Cross-school SchoolAdmin was authorized: %',v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000005',
    true
  );
  v_result:=public.create_notification_campaign(
    '10000000-0000-0000-0000-000000000001',
    'Inactive notification',
    'Synthetic inactive-user attempt',
    'important_announcement',
    array['student'],
    'draft',
    null,
    v_timezone,
    'normal',
    '/synthetic-a/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-inactive-00001'
  );
  if v_result->>'status'<>'permission_error' then
    raise exception 'Inactive SchoolAdmin was authorized: %',v_result;
  end if;

  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000001',
    true
  );
  v_result:=public.create_notification_campaign(
    '30000000-0000-0000-0000-000000000003',
    'Archived notification',
    'Synthetic archived-school attempt',
    'important_announcement',
    array['student'],
    'draft',
    null,
    'America/Denver',
    'normal',
    '/synthetic-archived/app',
    null,
    null,
    'audience',
    null,
    null,
    'staging-archived-0001'
  );
  if v_result->>'status'<>'permission_error' then
    raise exception 'Archived school campaign was authorized: %',v_result;
  end if;

  begin
    insert into public.notification_devices(
      school_id,user_id,installation_id,device_token_hash,audience,
      platform,browser,pwa_installed,notifications_supported,permission_status
    )
    values(
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000004',
      'cross-school-device-0001',
      repeat('1',64),
      'student','test','test',true,true,'granted'
    );
    raise exception 'Cross-school device user unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    '10000000-0000-0000-0000-000000000001',
    null,
    'anonymous-student-0001',
    repeat('a',64),
    'student','test','test',true,true,'granted'
  )
  returning id into v_device_student;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'authenticated-parent-01',
    repeat('b',64),
    'parent','test','test',true,true,'granted'
  )
  returning id into v_device_parent;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    'authenticated-staff-001',
    repeat('c',64),
    'staff','test','test',true,true,'granted'
  )
  returning id into v_device_staff;

  insert into public.notification_devices(
    school_id,user_id,installation_id,device_token_hash,audience,
    platform,browser,pwa_installed,notifications_supported,permission_status
  )
  values(
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'second-parent-device-01',
    repeat('d',64),
    'parent','test','test',true,false,'default'
  )
  returning id into v_device_second;

  insert into public.notification_device_preferences(
    school_id,device_id,category,enabled
  )
  values
    ('10000000-0000-0000-0000-000000000001',v_device_parent,'school_event',true),
    ('10000000-0000-0000-0000-000000000001',v_device_second,'school_event',false),
    ('10000000-0000-0000-0000-000000000001',v_device_student,'important_announcement',true),
    ('10000000-0000-0000-0000-000000000001',v_device_staff,'important_announcement',true);

  if (
    select count(distinct enabled)
    from public.notification_device_preferences
    where device_id in (v_device_parent,v_device_second)
      and category='school_event'
  )<>2 then
    raise exception 'Two devices for one account cannot keep distinct preferences';
  end if;

  begin
    insert into public.notification_device_preferences(
      school_id,device_id,category,enabled
    )
    values(
      '20000000-0000-0000-0000-000000000002',
      v_device_student,
      'emergency',
      true
    );
    raise exception 'Cross-school preference unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.push_subscriptions(
    school_id,device_id,endpoint,p256dh,auth
  )
  values(
    '10000000-0000-0000-0000-000000000001',
    v_device_student,
    'https://push.invalid/first',
    'synthetic-p256dh',
    'synthetic-auth'
  );

  begin
    insert into public.push_subscriptions(
      school_id,device_id,endpoint,p256dh,auth
    )
    values(
      '10000000-0000-0000-0000-000000000001',
      v_device_student,
      'https://push.invalid/overlap',
      'synthetic-p256dh',
      'synthetic-auth'
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
    '10000000-0000-0000-0000-000000000001',
    v_device_student,
    'https://push.invalid/replacement',
    'synthetic-p256dh',
    'synthetic-auth'
  );

  begin
    insert into public.push_subscriptions(
      school_id,device_id,endpoint,p256dh,auth
    )
    values(
      '20000000-0000-0000-0000-000000000002',
      v_device_parent,
      'https://push.invalid/cross-school',
      'synthetic-p256dh',
      'synthetic-auth'
    );
    raise exception 'Cross-school push subscription unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.notification_deliveries(
    school_id,campaign_id,device_id,audience,delivery_status
  )
  values
    (
      '10000000-0000-0000-0000-000000000001',
      v_editor_campaign,
      v_device_student,
      'student',
      'inbox_only'
    ),
    (
      '10000000-0000-0000-0000-000000000001',
      v_editor_campaign,
      v_device_parent,
      'parent',
      'sent'
    );

  select count(*) into v_count
  from public.notification_deliveries
  where device_id in (v_device_student,v_device_parent)
    and read_at is null;
  if v_count<>2 then
    raise exception 'Unread delivery count is incorrect';
  end if;

  update public.notification_deliveries
  set read_at=now()
  where campaign_id=v_editor_campaign
    and device_id=v_device_student;
  if (
    select count(*)
    from public.notification_deliveries
    where device_id=v_device_student
      and read_at is null
  )<>0 then
    raise exception 'Mark-one-read behavior failed';
  end if;

  update public.notification_deliveries
  set read_at=now()
  where device_id=v_device_parent
    and read_at is null;
  if (
    select count(*)
    from public.notification_deliveries
    where device_id in (v_device_student,v_device_parent)
      and read_at is null
  )<>0 then
    raise exception 'Mark-all-read behavior failed';
  end if;

  begin
    insert into public.notification_deliveries(
      school_id,campaign_id,device_id,audience
    )
    values(
      '10000000-0000-0000-0000-000000000001',
      v_editor_campaign,
      v_device_student,
      'student'
    );
    raise exception 'Duplicate delivery unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.notification_deliveries(
      school_id,campaign_id,device_id,audience
    )
    values(
      '20000000-0000-0000-0000-000000000002',
      v_editor_campaign,
      v_device_staff,
      'staff'
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
      '20000000-0000-0000-0000-000000000002',
      v_editor_campaign,
      'cross_school_test',
      'Synthetic cross-school audit'
    );
    raise exception 'Cross-school audit unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;

  perform set_config('request.jwt.claim.role','service_role',true);
  select claim_token into v_claim_token
  from public.claim_notification_campaign(v_queued)
  limit 1;
  if v_claim_token is null then
    raise exception 'Due queued campaign was not claimed';
  end if;

  if exists(
    select 1 from public.claim_notification_campaign(v_queued)
  ) then
    raise exception 'An actively claimed campaign was claimed twice';
  end if;

  update public.notification_campaigns
  set claimed_at=now()-interval '11 minutes'
  where id=v_queued;
  if not exists(
    select 1 from public.claim_notification_campaign(v_queued)
  ) then
    raise exception 'A stale worker claim was not retryable';
  end if;

  if exists(
    select 1 from public.claim_notification_campaign(v_scheduled)
  ) then
    raise exception 'A future scheduled campaign was claimed';
  end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-0000-0000-000000000004',
    true
  );
  select timezone into v_timezone
  from public.schools
  where id='20000000-0000-0000-0000-000000000002';
  delete from public.notification_campaigns
  where school_id='20000000-0000-0000-0000-000000000002';
  for v_count in 1..20 loop
    v_result:=public.create_notification_campaign(
      '20000000-0000-0000-0000-000000000002',
      'Rate limit seed',
      'Synthetic rate limit campaign',
      'important_announcement',
      array['student'],
      'queued',
      null,
      v_timezone,
      'normal',
      '/synthetic-b/app',
      null,
      null,
      'audience',
      null,
      null,
      'rate-limit-'||lpad(v_count::text,8,'0')
    );
    if v_result->>'status'<>'success' then
      raise exception 'Rate-limit seed failed at %: %',v_count,v_result;
    end if;
  end loop;
  v_result:=public.create_notification_campaign(
    '20000000-0000-0000-0000-000000000002',
    'Rate limit blocked',
    'Synthetic rate limit rejection',
    'important_announcement',
    array['student'],
    'queued',
    null,
    v_timezone,
    'normal',
    '/synthetic-b/app',
    null,
    null,
    'audience',
    null,
    null,
    'rate-limit-blocked-001'
  );
  if v_result->>'status'<>'rate_limited' then
    raise exception 'Rate limit did not block the twenty-first campaign: %',v_result;
  end if;

  if has_function_privilege(
       'anon',
       'public.create_notification_campaign(uuid,text,text,text,text[],text,timestamptz,text,text,text,text,uuid,text,text,uuid,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.create_notification_campaign(uuid,text,text,text,text[],text,timestamptz,text,text,text,text,uuid,text,text,uuid,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.claim_notification_campaign(uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.claim_notification_campaign(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.enforce_notification_campaign_tenant_relationships()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.enforce_notification_device_tenant_relationships()',
       'EXECUTE'
     ) then
    raise exception 'Notification function ACL contract failed';
  end if;
end
$test$;

select jsonb_build_object(
  'status','notification_foundation_staging_passed',
  'tables',(
    select count(*)
    from information_schema.tables
    where table_schema='public'
      and table_name in (
        'notification_school_settings',
        'notification_campaigns',
        'notification_campaign_audiences',
        'notification_devices',
        'push_subscriptions',
        'notification_device_preferences',
        'notification_deliveries',
        'notification_audit'
      )
  ),
  'policies',(
    select count(*)
    from pg_catalog.pg_policies
    where schemaname='public'
      and tablename like 'notification_%'
  ),
  'active_school_settings',(
    select count(*)
    from public.notification_school_settings
  ),
  'campaigns',(
    select count(*)
    from public.notification_campaigns
  ),
  'devices',(
    select count(*)
    from public.notification_devices
  ),
  'deliveries',(
    select count(*)
    from public.notification_deliveries
  ),
  'external_pushes',0
) as result;
