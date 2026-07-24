-- Read-only production preflight for the timezone reconciliation.
with school_validation as (
  select
    count(*) as total,
    count(*) filter (where archived_at is null) as active,
    count(*) filter (where archived_at is not null) as archived,
    count(*) filter (where timezone is null) as null_timezone,
    count(*) filter (where length(timezone) > 100) as overlength,
    count(*) filter (where timezone like 'US/%') as legacy_alias,
    count(*) filter (where timezone like 'Etc/GMT%') as fixed_offset,
    count(*) filter (
      where timezone !~ '^[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+$'
    ) as malformed,
    count(*) filter (
      where timezone is not null
        and not exists (
          select 1
          from pg_catalog.pg_timezone_names zone
          where zone.name = schools.timezone
        )
    ) as unsupported
  from public.schools
),
audit_summary as (
  select
    count(*) as rows,
    count(*) filter (where result_status = 'success') as successful,
    count(*) filter (where result_status = 'rejected') as rejected,
    md5(
      coalesce(
        string_agg(
          concat_ws(
            '|',
            id,
            school_id,
            previous_timezone,
            new_timezone,
            actor_id,
            result_status,
            created_at
          ),
          E'\n'
          order by id
        ),
        ''
      )
    ) as fingerprint
  from public.school_timezone_audit
),
column_fingerprint as (
  select md5(
    string_agg(
      concat_ws(
        '|',
        table_name,
        column_name,
        data_type,
        is_nullable,
        coalesce(column_default, '')
      ),
      E'\n'
      order by table_name, ordinal_position
    )
  ) as fingerprint
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('schools', 'school_timezone_audit')
),
constraint_fingerprint as (
  select md5(
    string_agg(
      concat_ws(
        '|',
        constraint_definition.conrelid::regclass::text,
        constraint_definition.conname,
        constraint_definition.contype,
        pg_get_constraintdef(constraint_definition.oid)
      ),
      E'\n'
      order by
        constraint_definition.conrelid::regclass::text,
        constraint_definition.conname
    )
  ) as fingerprint
  from pg_catalog.pg_constraint constraint_definition
  where constraint_definition.conrelid in (
    'public.schools'::regclass,
    'public.school_timezone_audit'::regclass
  )
),
index_fingerprint as (
  select md5(
    string_agg(
      concat_ws('|', tablename, indexname, indexdef),
      E'\n'
      order by tablename, indexname
    )
  ) as fingerprint
  from pg_catalog.pg_indexes
  where schemaname = 'public'
    and tablename in ('schools', 'school_timezone_audit')
),
policy_fingerprint as (
  select md5(
    coalesce(
      string_agg(
        concat_ws(
          '|',
          tablename,
          policyname,
          permissive,
          roles::text,
          cmd,
          qual,
          with_check
        ),
        E'\n'
        order by tablename, policyname
      ),
      ''
    )
  ) as fingerprint
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in ('schools', 'school_timezone_audit')
),
grant_fingerprint as (
  select md5(
    coalesce(
      string_agg(
        concat_ws(
          '|',
          table_name,
          grantee,
          privilege_type,
          is_grantable
        ),
        E'\n'
        order by table_name, grantee, privilege_type
      ),
      ''
    )
  ) as fingerprint
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('schools', 'school_timezone_audit')
),
function_fingerprint as (
  select jsonb_object_agg(
    function_definition.proname,
    jsonb_build_object(
      'identity_args',
      pg_get_function_identity_arguments(function_definition.oid),
      'result',
      pg_get_function_result(function_definition.oid),
      'hash',
      md5(pg_get_functiondef(function_definition.oid)),
      'search_path',
      function_definition.proconfig,
      'acl',
      function_definition.proacl
    )
  ) as functions
  from pg_catalog.pg_proc function_definition
  join pg_catalog.pg_namespace function_schema
    on function_schema.oid = function_definition.pronamespace
  where function_schema.nspname = 'public'
    and function_definition.proname in (
      'school_timezone_is_supported',
      'enforce_supported_school_timezone',
      'update_school_timezone',
      'update_platform_settings'
    )
),
trigger_fingerprint as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name',
        trigger_definition.tgname,
        'definition',
        pg_get_triggerdef(trigger_definition.oid)
      )
      order by trigger_definition.tgname
    ),
    '[]'::jsonb
  ) as triggers
  from pg_catalog.pg_trigger trigger_definition
  where trigger_definition.tgrelid = 'public.schools'::regclass
    and not trigger_definition.tgisinternal
)
select jsonb_build_object(
  'project_ref',
  'aqofdpwnswydladodblc',
  'schools',
  (select to_jsonb(school_validation) from school_validation),
  'platform_default_timezone',
  (select default_timezone from public.platform_settings where id = true),
  'audit',
  (select to_jsonb(audit_summary) from audit_summary),
  'fingerprints',
  jsonb_build_object(
    'columns',
    (select fingerprint from column_fingerprint),
    'constraints',
    (select fingerprint from constraint_fingerprint),
    'indexes',
    (select fingerprint from index_fingerprint),
    'policies',
    (select fingerprint from policy_fingerprint),
    'grants',
    (select fingerprint from grant_fingerprint)
  ),
  'rls',
  jsonb_build_object(
    'schools',
    (
      select jsonb_build_object(
        'enabled',
        relrowsecurity,
        'forced',
        relforcerowsecurity
      )
      from pg_catalog.pg_class
      where oid = 'public.schools'::regclass
    ),
    'audit',
    (
      select jsonb_build_object(
        'enabled',
        relrowsecurity,
        'forced',
        relforcerowsecurity
      )
      from pg_catalog.pg_class
      where oid = 'public.school_timezone_audit'::regclass
    )
  ),
  'functions',
  (select functions from function_fingerprint),
  'school_triggers',
  (select triggers from trigger_fingerprint)
) as preflight;
