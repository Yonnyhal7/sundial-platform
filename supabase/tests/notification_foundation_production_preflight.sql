-- Read-only production preflight for 20260724110000_notification_foundation.sql.
with
notification_objects as (
  select count(*)::bigint as table_count
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
notification_functions as (
  select count(*)::bigint as function_count
  from pg_catalog.pg_proc function
  join pg_catalog.pg_namespace namespace
    on namespace.oid=function.pronamespace
  where namespace.nspname='public'
    and (
      function.proname like '%notification%'
      or function.proname='claim_notification_campaign'
    )
),
dependencies as (
  select count(*) filter(where not present)::bigint as missing_count
  from (
    values
      ('schools.id',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='schools' and column_name='id'
          and udt_name='uuid'
      )),
      ('schools.archived_at',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='schools' and column_name='archived_at'
      )),
      ('schools.timezone',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='schools' and column_name='timezone'
      )),
      ('schools.subdomain',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='schools' and column_name='subdomain'
      )),
      ('users.id',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='users' and column_name='id'
          and udt_name='uuid'
      )),
      ('permissions.key',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='permissions' and column_name='key'
      )),
      ('announcements.school_id',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='announcements' and column_name='school_id'
          and udt_name='uuid'
      )),
      ('events.school_id',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='events' and column_name='school_id'
          and udt_name='uuid'
      )),
      ('teams.school_id',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='teams' and column_name='school_id'
          and udt_name='uuid'
      )),
      ('calendar_days.school_id',exists(
        select 1 from information_schema.columns
        where table_schema='public' and table_name='calendar_days' and column_name='school_id'
          and udt_name='uuid'
      )),
      ('current_user_can_manage_school_section',to_regprocedure(
        'public.current_user_can_manage_school_section(uuid,text)'
      ) is not null),
      ('anon role',exists(select 1 from pg_catalog.pg_roles where rolname='anon')),
      ('authenticated role',exists(
        select 1 from pg_catalog.pg_roles where rolname='authenticated'
      )),
      ('service_role role',exists(
        select 1 from pg_catalog.pg_roles where rolname='service_role'
      )),
      ('pg_catalog.gen_random_uuid',to_regprocedure(
        'pg_catalog.gen_random_uuid()'
      ) is not null)
  ) required(name,present)
),
columns_constraints_indexes as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(value,E'\n' order by value),'')) as value
  from (
    select concat_ws(
      '|','column',table_name,ordinal_position,column_name,udt_name,is_nullable,
      coalesce(column_default,'')
    ) as value
    from information_schema.columns
    where table_schema='public'
    union all
    select concat_ws(
      '|','constraint',relation.relname,table_constraint.contype,
      pg_catalog.pg_get_constraintdef(table_constraint.oid,true)
    )
    from pg_catalog.pg_constraint table_constraint
    join pg_catalog.pg_class relation on relation.oid=table_constraint.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public'
    union all
    select concat_ws('|','index',tablename,indexname,indexdef)
    from pg_catalog.pg_indexes
    where schemaname='public'
  ) values_to_hash
),
policies as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    concat_ws('|',tablename,policyname,permissive,roles::text,cmd,qual,with_check),
    E'\n' order by tablename,policyname
  ),'')) as value
  from pg_catalog.pg_policies
  where schemaname='public'
),
grants as (
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    concat_ws('|',table_name,grantee,privilege_type,is_grantable),
    E'\n' order by table_name,grantee,privilege_type
  ),'')) as value
  from information_schema.role_table_grants
  where table_schema='public'
),
functions as (
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
),
triggers as (
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
),
ai_preservation as (
  select
    count(*) filter(
      where status<>'pending' and analysis_attempt_id is not null
    )::bigint as completed_attempt_ids,
    count(*) filter(where status='pending')::bigint as pending_attempts,
    count(*) filter(
      where status='pending'
        and coalesce(last_heartbeat_at,updated_at,created_at)
          < now()-interval '15 minutes'
    )::bigint as stale_pending_attempts
  from public.ai_calendar_analysis_cache
)
select jsonb_build_object(
  'database',current_database(),
  'notification_tables',notification_objects.table_count,
  'notification_functions',notification_functions.function_count,
  'notification_permission_rows',(
    select count(*) from public.permissions where key='notifications'
  ),
  'missing_dependencies',dependencies.missing_count,
  'active_schools',(
    select count(*) from public.schools where archived_at is null
  ),
  'archived_schools',(
    select count(*) from public.schools where archived_at is not null
  ),
  'schools_rows',(select count(*) from public.schools),
  'users_rows',(select count(*) from public.users),
  'memberships_rows',(select count(*) from public.school_memberships),
  'permissions_rows',(select count(*) from public.permissions),
  'user_permissions_rows',(select count(*) from public.user_permissions),
  'announcements_rows',(select count(*) from public.announcements),
  'events_rows',(select count(*) from public.events),
  'teams_rows',(select count(*) from public.teams),
  'calendar_days_rows',(select count(*) from public.calendar_days),
  'columns_constraints_indexes',columns_constraints_indexes.value,
  'policies',policies.value,
  'grants',grants.value,
  'functions',functions.value,
  'triggers',triggers.value,
  'completed_attempt_ids',ai_preservation.completed_attempt_ids,
  'pending_attempts',ai_preservation.pending_attempts,
  'stale_pending_attempts',ai_preservation.stale_pending_attempts
) as production_preflight
from notification_objects
cross join notification_functions
cross join dependencies
cross join columns_constraints_indexes
cross join policies
cross join grants
cross join functions
cross join triggers
cross join ai_preservation;
