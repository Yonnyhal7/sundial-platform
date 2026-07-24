-- Read-only production postflight for 20260724110000_notification_foundation.sql.
with
expected_tables(name) as (
  values
    ('notification_school_settings'),
    ('notification_campaigns'),
    ('notification_campaign_audiences'),
    ('notification_devices'),
    ('push_subscriptions'),
    ('notification_device_preferences'),
    ('notification_deliveries'),
    ('notification_audit')
),
expected_indexes(name) as (
  values
    ('notification_school_settings_pkey'),
    ('notification_campaigns_pkey'),
    ('notification_campaigns_id_school_id_key'),
    ('notification_campaigns_school_id_idempotency_key_key'),
    ('notification_campaigns_school_status_idx'),
    ('notification_campaign_audiences_pkey'),
    ('notification_devices_pkey'),
    ('notification_devices_school_id_installation_id_key'),
    ('notification_devices_id_school_id_key'),
    ('notification_devices_school_audience_idx'),
    ('push_subscriptions_pkey'),
    ('push_subscriptions_device_id_endpoint_key'),
    ('push_subscriptions_active_idx'),
    ('push_subscriptions_one_active_device_idx'),
    ('notification_device_preferences_pkey'),
    ('notification_deliveries_pkey'),
    ('notification_deliveries_campaign_id_device_id_key'),
    ('notification_deliveries_device_inbox_idx'),
    ('notification_deliveries_campaign_status_idx'),
    ('notification_audit_pkey'),
    ('notification_audit_school_created_idx')
),
expected_functions(name) as (
  values
    ('initialize_notification_school_settings'),
    ('notification_user_can_access_school'),
    ('enforce_notification_campaign_tenant_relationships'),
    ('enforce_notification_device_tenant_relationships'),
    ('notification_category_available'),
    ('create_notification_campaign'),
    ('cancel_notification_campaign'),
    ('reschedule_notification_campaign'),
    ('claim_notification_campaign')
),
expected_triggers(name) as (
  values
    ('initialize_notification_school_settings_after_school'),
    ('enforce_notification_campaign_tenant_relationships'),
    ('enforce_notification_device_tenant_relationships')
),
actual_tables as (
  select table_name as name
  from information_schema.tables
  where table_schema='public'
    and table_name in (select name from expected_tables)
),
actual_indexes as (
  select indexname as name
  from pg_catalog.pg_indexes
  where schemaname='public'
    and tablename in (select name from expected_tables)
),
actual_functions as (
  select function.proname as name
  from pg_catalog.pg_proc function
  join pg_catalog.pg_namespace namespace
    on namespace.oid=function.pronamespace
  where namespace.nspname='public'
    and function.proname in (select name from expected_functions)
),
actual_triggers as (
  select trigger.tgname as name
  from pg_catalog.pg_trigger trigger
  join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
  join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public'
    and trigger.tgname in (select name from expected_triggers)
    and not trigger.tgisinternal
),
unrelated_columns_constraints_indexes as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(value,E'\n' order by value),'')) as value
  from (
    select concat_ws(
      '|','column',table_name,ordinal_position,column_name,udt_name,is_nullable,
      coalesce(column_default,'')
    ) as value
    from information_schema.columns
    where table_schema='public'
      and table_name not in (select name from expected_tables)
    union all
    select concat_ws(
      '|','constraint',relation.relname,table_constraint.contype,
      pg_catalog.pg_get_constraintdef(table_constraint.oid,true)
    )
    from pg_catalog.pg_constraint table_constraint
    join pg_catalog.pg_class relation on relation.oid=table_constraint.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname not in (select name from expected_tables)
    union all
    select concat_ws('|','index',tablename,indexname,indexdef)
    from pg_catalog.pg_indexes
    where schemaname='public'
      and tablename not in (select name from expected_tables)
  ) values_to_hash
),
unrelated_policies as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    concat_ws('|',tablename,policyname,permissive,roles::text,cmd,qual,with_check),
    E'\n' order by tablename,policyname
  ),'')) as value
  from pg_catalog.pg_policies
  where schemaname='public'
    and tablename not in (select name from expected_tables)
),
unrelated_grants as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    concat_ws('|',table_name,grantee,privilege_type,is_grantable),
    E'\n' order by table_name,grantee,privilege_type
  ),'')) as value
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name not in (select name from expected_tables)
),
unrelated_functions as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    concat_ws(
      '|',
      function.oid::regprocedure::text,
      pg_catalog.pg_get_functiondef(function.oid),
      coalesce(function.proacl::text,'')
    ),
    E'\n' order by function.oid::regprocedure::text
  ),'')) as value
  from pg_catalog.pg_proc function
  join pg_catalog.pg_namespace namespace on namespace.oid=function.pronamespace
  where namespace.nspname='public'
    and function.proname not in (select name from expected_functions)
),
unrelated_triggers as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    concat_ws(
      '|',relation.relname,trigger.tgname,
      pg_catalog.pg_get_triggerdef(trigger.oid,true)
    ),
    E'\n' order by relation.relname,trigger.tgname
  ),'')) as value
  from pg_catalog.pg_trigger trigger
  join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
  join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public'
    and not trigger.tgisinternal
    and trigger.tgname not in (select name from expected_triggers)
)
select jsonb_build_object(
  'tables',(
    select jsonb_agg(name order by name) from actual_tables
  ),
  'missing_tables',(
    select coalesce(jsonb_agg(name order by name),'[]'::jsonb)
    from (
      select name from expected_tables
      except
      select name from actual_tables
    ) missing
  ),
  'rls_enabled_tables',(
    select count(*)
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname in (select name from expected_tables)
      and relation.relrowsecurity
  ),
  'indexes',(
    select jsonb_agg(name order by name) from actual_indexes
  ),
  'missing_indexes',(
    select coalesce(jsonb_agg(name order by name),'[]'::jsonb)
    from (
      select name from expected_indexes
      except
      select name from actual_indexes
    ) missing
  ),
  'unexpected_indexes',(
    select coalesce(jsonb_agg(name order by name),'[]'::jsonb)
    from (
      select name from actual_indexes
      except
      select name from expected_indexes
    ) unexpected
  ),
  'foreign_keys',(
    select count(*)
    from pg_catalog.pg_constraint table_constraint
    join pg_catalog.pg_class relation on relation.oid=table_constraint.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and relation.relname in (select name from expected_tables)
      and table_constraint.contype='f'
  ),
  'policies',(
    select jsonb_agg(jsonb_build_object(
      'table',tablename,
      'name',policyname,
      'roles',roles,
      'command',cmd,
      'using',qual
    ) order by tablename,policyname)
    from pg_catalog.pg_policies
    where schemaname='public'
      and tablename in (select name from expected_tables)
  ),
  'functions',(
    select jsonb_agg(name order by name) from actual_functions
  ),
  'missing_functions',(
    select coalesce(jsonb_agg(name order by name),'[]'::jsonb)
    from (
      select name from expected_functions
      except
      select name from actual_functions
    ) missing
  ),
  'triggers',(
    select jsonb_agg(jsonb_build_object(
      'name',trigger.tgname,
      'table',relation.relname,
      'enabled',trigger.tgenabled
    ) order by trigger.tgname)
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_class relation on relation.oid=trigger.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
      and trigger.tgname in (select name from expected_triggers)
      and not trigger.tgisinternal
  ),
  'missing_triggers',(
    select coalesce(jsonb_agg(name order by name),'[]'::jsonb)
    from (
      select name from expected_triggers
      except
      select name from actual_triggers
    ) missing
  ),
  'notification_permission_rows',(
    select count(*) from public.permissions where key='notifications'
  ),
  'active_school_settings',(
    select count(*)
    from public.notification_school_settings settings
    join public.schools school on school.id=settings.school_id
    where school.archived_at is null
  ),
  'archived_school_settings',(
    select count(*)
    from public.notification_school_settings settings
    join public.schools school on school.id=settings.school_id
    where school.archived_at is not null
  ),
  'anon_notification_grants',(
    select count(*)
    from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (select name from expected_tables)
      and grantee='anon'
  ),
  'authenticated_notification_grants',(
    select jsonb_agg(
      jsonb_build_object('table',table_name,'privilege',privilege_type)
      order by table_name,privilege_type
    )
    from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (select name from expected_tables)
      and grantee='authenticated'
  ),
  'secret_table_application_grants',(
    select count(*)
    from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (
        'notification_devices',
        'push_subscriptions',
        'notification_device_preferences'
      )
      and grantee in ('anon','authenticated')
  ),
  'application_private_function_executes',(
    select count(*)
    from (
      select role_name,function_signature
      from (
        values
          ('anon','public.initialize_notification_school_settings()'),
          ('authenticated','public.initialize_notification_school_settings()'),
          ('anon','public.notification_user_can_access_school(uuid,uuid)'),
          ('authenticated','public.notification_user_can_access_school(uuid,uuid)'),
          ('anon','public.enforce_notification_campaign_tenant_relationships()'),
          ('authenticated','public.enforce_notification_campaign_tenant_relationships()'),
          ('anon','public.enforce_notification_device_tenant_relationships()'),
          ('authenticated','public.enforce_notification_device_tenant_relationships()'),
          ('anon','public.notification_category_available(text,text)'),
          ('authenticated','public.notification_category_available(text,text)'),
          ('anon','public.claim_notification_campaign(uuid)'),
          ('authenticated','public.claim_notification_campaign(uuid)')
      ) checks(role_name,function_signature)
      where has_function_privilege(role_name,function_signature,'EXECUTE')
    ) exposed
  ),
  'unrelated_columns_constraints_indexes',
    unrelated_columns_constraints_indexes.value,
  'unrelated_policies',unrelated_policies.value,
  'unrelated_grants',unrelated_grants.value,
  'unrelated_functions',unrelated_functions.value,
  'unrelated_triggers',unrelated_triggers.value
) as notification_postflight
from unrelated_columns_constraints_indexes
cross join unrelated_policies
cross join unrelated_grants
cross join unrelated_functions
cross join unrelated_triggers;
