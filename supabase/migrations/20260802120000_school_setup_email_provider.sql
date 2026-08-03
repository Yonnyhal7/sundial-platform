begin;

alter table public.platform_settings
  add column if not exists school_setup_email_provider text not null default 'resend',
  add column if not exists school_setup_email_provider_updated_at timestamptz,
  add column if not exists school_setup_email_provider_updated_by uuid references public.users(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='platform_settings_school_setup_email_provider_check') then
    alter table public.platform_settings add constraint platform_settings_school_setup_email_provider_check
      check (school_setup_email_provider in ('google_workspace','resend'));
  end if;
end $$;

alter table public.platform_settings_audit add column if not exists correlation_id uuid;

create table if not exists public.school_setup_email_attempts (
  id bigint generated always as identity primary key,
  invitation_id uuid references public.pending_admin_invites(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  recipient text not null,
  provider text not null check (provider in ('google_workspace','resend')),
  from_address text not null,
  provider_message_id text,
  sent_at timestamptz,
  status text not null check (status in ('sent','failed')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists school_setup_email_attempts_invitation_created_idx on public.school_setup_email_attempts(invitation_id,created_at desc);
alter table public.school_setup_email_attempts enable row level security;
create policy "SuperAdmins read setup email attempts" on public.school_setup_email_attempts for select to authenticated using (public.current_user_is_super_admin());
revoke all on public.school_setup_email_attempts from public,anon,authenticated;
grant select on public.school_setup_email_attempts to authenticated;
grant all on public.school_setup_email_attempts to service_role;

create or replace function public.update_platform_settings(p_section text,p_expected_version bigint,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid();v_before jsonb;v_after jsonb;v_version bigint;v_correlation uuid;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error'); end if;
 if p_section not in ('general','new_school_defaults','email_delivery') then return jsonb_build_object('status','validation_error'); end if;
 if p_section='email_delivery' and (p_values->>'school_setup_email_provider' not in ('google_workspace','resend') or (p_values-'school_setup_email_provider'-'correlation_id')<>'{}'::jsonb) then return jsonb_build_object('status','validation_error'); end if;
 begin v_correlation:=(p_values->>'correlation_id')::uuid; exception when others then return jsonb_build_object('status','validation_error'); end;
 select to_jsonb(s),s.version into v_before,v_version from public.platform_settings s where id=true for update;
 if v_version<>p_expected_version then return jsonb_build_object('status','stale'); end if;
 if p_section='general' then
  update public.platform_settings set support_email=p_values->>'support_email',default_sender_name=p_values->>'default_sender_name',support_website_url=nullif(p_values->>'support_website_url',''),support_phone=nullif(p_values->>'support_phone',''),version=version+1,updated_at=now(),updated_by=v_actor where id=true;
 elsif p_section='new_school_defaults' then
  if not public.school_timezone_is_supported(p_values->>'default_timezone') or p_values->>'default_appearance' not in ('light','dark','system') then return jsonb_build_object('status','validation_error'); end if;
  update public.platform_settings set default_timezone=p_values->>'default_timezone',default_appearance=p_values->>'default_appearance',version=version+1,updated_at=now(),updated_by=v_actor where id=true;
  update public.platform_feature_defaults d set enabled=(p_values->'features'->>d.feature_key)::boolean,updated_at=now(),updated_by=v_actor where p_values->'features'?d.feature_key;
 else
  update public.platform_settings set school_setup_email_provider=p_values->>'school_setup_email_provider',school_setup_email_provider_updated_at=now(),school_setup_email_provider_updated_by=v_actor,version=version+1,updated_at=now(),updated_by=v_actor where id=true;
 end if;
 select to_jsonb(s) into v_after from public.platform_settings s where id=true;
 insert into public.platform_settings_audit(actor_id,section,summary,previous_values,new_values,correlation_id) values(v_actor,p_section,case p_section when 'general' then 'Updated general platform settings' when 'new_school_defaults' then 'Updated new-school defaults' else 'Updated school setup email provider' end,v_before-'updated_by',v_after-'updated_by',v_correlation);
 return jsonb_build_object('status','success','version',v_after->'version');
exception when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.complete_school_setup_invitation_delivery(p_invite_id uuid,p_school_id uuid,p_attempt_count integer,p_success boolean,p_provider_message_id text default null,p_failure_reason text default null,p_provider text default 'resend',p_from_address text default 'Sundial School Setup <setup@sundialk12.com>',p_error_code text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_invite public.pending_admin_invites%rowtype;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error'); end if;
 if p_provider not in ('google_workspace','resend') then return jsonb_build_object('status','validation_error'); end if;
 update public.pending_admin_invites i set delivery_status=case when p_success then 'sent' else 'failed' end,sent_at=case when p_success then now() else i.sent_at end,provider_message_id=case when p_success then left(nullif(p_provider_message_id,''),255) else null end,delivery_failure_reason=case when p_success then null else left(coalesce(nullif(p_failure_reason,''),'Email provider rejected the request.'),255) end,delivery_locked_at=null,updated_at=now() from public.schools s where i.id=p_invite_id and i.school_id=p_school_id and i.delivery_status='sending' and i.delivery_attempt_count=p_attempt_count and s.id=i.school_id and s.archived_at is null returning i.* into v_invite;
 if v_invite.id is null then return jsonb_build_object('status','stale_or_unavailable'); end if;
 insert into public.school_setup_email_attempts(invitation_id,school_id,recipient,provider,from_address,provider_message_id,sent_at,status,error_code,error_message) values(v_invite.id,v_invite.school_id,v_invite.email,p_provider,left(p_from_address,255),case when p_success then left(p_provider_message_id,255) end,case when p_success then now() end,case when p_success then 'sent' else 'failed' end,case when p_success then null else left(p_error_code,100) end,case when p_success then null else left(p_failure_reason,255) end);
 return jsonb_build_object('status','completed');
end;$$;
revoke all on function public.complete_school_setup_invitation_delivery(uuid,uuid,integer,boolean,text,text,text,text,text) from public,anon;
grant execute on function public.complete_school_setup_invitation_delivery(uuid,uuid,integer,boolean,text,text,text,text,text) to authenticated;
commit;
