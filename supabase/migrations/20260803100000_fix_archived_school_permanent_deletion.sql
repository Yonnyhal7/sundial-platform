-- Reconciles permanent deletion with school_setup_email_attempts and preserves safe diagnostics.
begin;

create or replace function public.permanently_delete_archived_school(
  p_school_id uuid,
  p_expected_name text,
  p_expected_subdomain text,
  p_cleanup_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school public.schools%rowtype;
  v_job public.school_storage_cleanup_jobs%rowtype;
  v_unknown_tables text[];
  v_failure_object text;
  v_summary jsonb;
  v_audit_id uuid;
  v_sqlstate text;
  v_constraint text;
  v_table text;
  v_message text;
  v_detail text;
  v_hint text;
  v_schema text;
  v_column text;
  v_context text;
  v_stage text := 'authorization';
begin
  if not public.current_user_is_super_admin()
     and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    return jsonb_build_object('status', 'permission_error');
  end if;

  v_stage := 'school_lock';
  select * into v_school
  from public.schools
  where id = p_school_id
  for update;

  if v_school.id is null
     or v_school.name is distinct from p_expected_name
     or v_school.subdomain is distinct from p_expected_subdomain then
    return jsonb_build_object('status', 'stale_target');
  end if;
  if v_school.archived_at is null then
    return jsonb_build_object('status', 'school_not_archived');
  end if;

  select * into v_job
  from public.school_storage_cleanup_jobs
  where id = p_cleanup_job_id
    and deleted_school_id = p_school_id
    and deleted_school_name = p_expected_name
    and deleted_school_subdomain = p_expected_subdomain
    and status in ('database_pending', 'database_failed')
  for update;

  if v_job.id is null then
    return jsonb_build_object('status', 'invalid_cleanup_job');
  end if;

  v_stage := 'foreign_key_audit';
  select array_agg(
    format('%I.%I', namespace.nspname, relation.relname)
    order by relation.relname
  )
  into v_unknown_tables
  from pg_constraint constraint_row
  join pg_class relation on relation.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.schools'::regclass
    and format('%I.%I', namespace.nspname, relation.relname) <> all (array[
      'public.ai_calendar_analysis_cache',
      'public.ai_calendar_import_reviews',
      'public.ai_calendar_instructional_count_reviews',
      'public.analytics',
      'public.announcements',
      'public.calendar_days',
      'public.calendar_wizard_drafts',
      'public.events',
      'public.feature_flags',
      'public.founder_slot_claims',
      'public.games',
      'public.notification_audit',
      'public.notification_campaigns',
      'public.notification_devices',
      'public.notification_school_settings',
      'public.notifications',
      'public.pending_admin_invites',
      'public.periods',
      'public.platform_user_audit',
      'public.resources',
      'public.schedule_patterns',
      'public.schedules',
      'public.school_feature_availability',
      'public.school_memberships',
      'public.school_setup_email_attempts',
      'public.school_subscriptions',
      'public.school_timezone_audit',
      'public.sports',
      'public.subscription_audit',
      'public.subscription_ledger_entries',
      'public.teams',
      'public.users'
    ]::text[]);

  if v_unknown_tables is not null then
    v_failure_object := left(array_to_string(v_unknown_tables, ','), 500);
    raise exception using errcode = '23503', message = 'Deletion blocked by remaining school dependencies', detail = v_failure_object, hint = 'Deploy deletion support for every catalog-reported school foreign key before retrying.';
  end if;

  v_summary := public.school_deletion_summary_json(p_school_id);
  v_stage := 'dependent_cleanup';

  -- Delivery-attempt history is platform audit evidence. Detach both foreign
  -- keys explicitly before invitations and the school are removed.
  update public.school_setup_email_attempts
  set invitation_id = null, school_id = null
  where school_id = p_school_id
     or invitation_id in (
       select id from public.pending_admin_invites where school_id = p_school_id
     );

  -- Preserve platform and subscription audit evidence while detaching rows
  -- from tenant records that are about to be removed.
  update public.platform_user_audit
  set invitation_id = null
  where invitation_id in (
    select id from public.pending_admin_invites where school_id = p_school_id
  );
  update public.platform_user_audit
  set school_id = null
  where school_id = p_school_id;
  update public.subscription_audit
  set subscription_id = null,
      school_id = null
  where school_id = p_school_id
     or subscription_id in (
       select id from public.school_subscriptions where school_id = p_school_id
     );

  -- Delete dependent notification rows before campaigns/devices because
  -- notification_audit intentionally uses a restrictive campaign reference.
  delete from public.notification_audit where school_id = p_school_id;
  delete from public.notification_campaigns where school_id = p_school_id;
  delete from public.notification_devices where school_id = p_school_id;
  delete from public.notification_school_settings where school_id = p_school_id;

  delete from public.calendar_days where school_id = p_school_id;
  delete from public.periods where school_id = p_school_id;
  delete from public.games where school_id = p_school_id;
  delete from public.teams where school_id = p_school_id;
  delete from public.sports where school_id = p_school_id;
  delete from public.calendar_wizard_drafts where school_id = p_school_id;
  delete from public.schedule_patterns where school_id = p_school_id;
  delete from public.schedules where school_id = p_school_id;
  delete from public.notifications where school_id = p_school_id;
  delete from public.analytics where school_id = p_school_id;
  delete from public.feature_flags where school_id = p_school_id;
  delete from public.school_feature_availability where school_id = p_school_id;
  delete from public.ai_calendar_analysis_cache where school_id = p_school_id;
  delete from public.ai_calendar_import_reviews where school_id = p_school_id;
  delete from public.ai_calendar_instructional_count_reviews where school_id = p_school_id;
  delete from public.announcements where school_id = p_school_id;
  delete from public.events where school_id = p_school_id;
  delete from public.resources where school_id = p_school_id;
  delete from public.school_timezone_audit where school_id = p_school_id;
  delete from public.school_memberships where school_id = p_school_id;

  delete from public.subscription_ledger_entries where school_id = p_school_id;
  delete from public.founder_slot_claims where school_id = p_school_id;
  delete from public.school_subscriptions where school_id = p_school_id;

  delete from public.pending_admin_invites where school_id = p_school_id;

  update public.users
  set school_id = null,
      is_active = case
        when lower(coalesce(role, '')) in ('super_admin', 'superadmin') then is_active
        else false
      end
  where school_id = p_school_id;

  v_stage := 'school_delete';
  delete from public.schools
  where id = p_school_id
    and archived_at is not null;

  if not found then
    raise exception 'Archived school disappeared during deletion';
  end if;

  v_stage := 'success_audit';
  insert into public.school_deletion_audits (
    deleted_school_id,
    deleted_school_name,
    deleted_school_subdomain,
    acting_super_admin_id,
    outcome
  ) values (
    p_school_id,
    p_expected_name,
    p_expected_subdomain,
    v_user_id,
    'database_deleted_storage_pending'
  )
  returning id into v_audit_id;

  update public.school_storage_cleanup_jobs
  set status = 'database_deleted',
      deletion_audit_id = v_audit_id,
      attempts = attempts + 1,
      last_error = null,
      updated_at = now()
  where id = p_cleanup_job_id;

  return jsonb_build_object(
    'status', 'success',
    'auditId', v_audit_id,
    'counts', v_summary
  );
exception
  when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_message = message_text,
      v_detail = pg_exception_detail,
      v_hint = pg_exception_hint,
      v_schema = schema_name,
      v_constraint = constraint_name,
      v_table = table_name,
      v_column = column_name,
      v_context = pg_exception_context;

    insert into public.school_deletion_audits (
      deleted_school_id,
      deleted_school_name,
      deleted_school_subdomain,
      acting_super_admin_id,
      completed_at,
      outcome,
      detail
    ) values (
      p_school_id,
      p_expected_name,
      p_expected_subdomain,
      v_user_id,
      now(),
      'database_failed',
      left(
        format(
          'stage=%s code=%s message=%s detail=%s hint=%s schema=%s table=%s column=%s constraint=%s object=%s context=%s',
          coalesce(v_stage, 'unknown'), coalesce(v_sqlstate, 'unknown'),
          coalesce(nullif(v_message, ''), 'unknown'), coalesce(nullif(v_detail, ''), 'unknown'),
          coalesce(nullif(v_hint, ''), 'unknown'), coalesce(nullif(v_schema, ''), 'unknown'),
          coalesce(nullif(v_table, ''), 'unknown'), coalesce(nullif(v_column, ''), 'unknown'),
          coalesce(nullif(v_constraint, ''), 'unknown'), coalesce(nullif(v_failure_object, ''), 'unknown'),
          coalesce(nullif(v_context, ''), 'unknown')
        ),
        1000
      )
    )
    returning id into v_audit_id;

    update public.school_storage_cleanup_jobs
    set status = 'database_failed',
        deletion_audit_id = v_audit_id,
        attempts = attempts + 1,
        last_error = left(
          format(
          'stage=%s code=%s message=%s detail=%s hint=%s schema=%s table=%s column=%s constraint=%s object=%s context=%s',
          coalesce(v_stage, 'unknown'), coalesce(v_sqlstate, 'unknown'),
          coalesce(nullif(v_message, ''), 'unknown'), coalesce(nullif(v_detail, ''), 'unknown'),
          coalesce(nullif(v_hint, ''), 'unknown'), coalesce(nullif(v_schema, ''), 'unknown'),
          coalesce(nullif(v_table, ''), 'unknown'), coalesce(nullif(v_column, ''), 'unknown'),
          coalesce(nullif(v_constraint, ''), 'unknown'), coalesce(nullif(v_failure_object, ''), 'unknown'),
          coalesce(nullif(v_context, ''), 'unknown')
          ),
          1000
        ),
        updated_at = now()
    where id = p_cleanup_job_id;

    return jsonb_build_object(
      'status', case when v_stage = 'foreign_key_audit' then 'remaining_dependencies' else 'database_error' end,
      'stage', coalesce(v_stage, 'unknown'),
      'code', coalesce(v_sqlstate, 'unknown'),
      'message', coalesce(nullif(v_message, ''), 'unknown'),
      'details', coalesce(nullif(v_detail, ''), 'unknown'),
      'hint', coalesce(nullif(v_hint, ''), 'unknown'),
      'schema', coalesce(nullif(v_schema, ''), 'unknown'),
      'constraint', coalesce(nullif(v_constraint, ''), 'unknown'),
      'table', coalesce(nullif(v_table, ''), 'unknown'),
      'column', coalesce(nullif(v_column, ''), 'unknown'),
      'routine', 'permanently_delete_archived_school',
      'databaseObject', coalesce(nullif(v_failure_object, ''), 'unknown')
    );
end;
$$;

revoke all on function public.permanently_delete_archived_school(uuid, text, text, uuid)
from public;
grant execute on function public.permanently_delete_archived_school(uuid, text, text, uuid)
to authenticated, service_role;

commit;
