begin;

-- Supabase's default table privileges left application roles with write and
-- TRUNCATE access. Feature availability is read-only to application roles;
-- trusted writes use service_role or SECURITY DEFINER RPCs.
revoke all privileges
on table public.school_feature_availability
from anon;

revoke all privileges
on table public.school_feature_availability
from authenticated;

grant select
on table public.school_feature_availability
to anon;

grant select
on table public.school_feature_availability
to authenticated;

-- Abort atomically if inherited or default privileges still provide a write
-- path. This verifies effective privileges, not only direct ACL entries.
do $verify_application_role_privileges$
declare
  v_role text;
  v_privilege text;
begin
  foreach v_role in array array['anon', 'authenticated']
  loop
    if not has_table_privilege(
      v_role::name,
      'public.school_feature_availability',
      'SELECT'
    ) then
      raise exception '% must retain SELECT on school_feature_availability', v_role;
    end if;

    foreach v_privilege in array array[
      'DELETE',
      'INSERT',
      'REFERENCES',
      'TRIGGER',
      'TRUNCATE',
      'UPDATE'
    ]
    loop
      if has_table_privilege(
        v_role::name,
        'public.school_feature_availability',
        v_privilege
      ) then
        raise exception
          '% still has % on school_feature_availability',
          v_role,
          v_privilege;
      end if;
    end loop;
  end loop;
end;
$verify_application_role_privileges$;

commit;
