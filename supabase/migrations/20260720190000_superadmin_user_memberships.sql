begin;

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  role text not null check (role in ('SchoolAdmin','Editor')),
  is_active boolean not null default true,
  version bigint not null default 1,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  unique(user_id,school_id)
);
create index if not exists school_memberships_school_role_idx on public.school_memberships(school_id,role) where is_active;
create index if not exists school_memberships_user_idx on public.school_memberships(user_id,is_active);

insert into public.school_memberships(user_id,school_id,role,is_active,joined_at)
select u.id,u.school_id,case when lower(replace(coalesce(u.role,''),'_',''))='editor' then 'Editor' else 'SchoolAdmin' end,coalesce(u.is_active,true),coalesce(u.created_at,now())
from public.users u where u.school_id is not null and lower(replace(coalesce(u.role,''),'_',''))<>'superadmin'
on conflict(user_id,school_id) do nothing;

alter table public.pending_admin_invites add column if not exists requested_role text not null default 'SchoolAdmin' check (requested_role in ('SchoolAdmin','Editor'));
alter table public.pending_admin_invites add column if not exists canceled_at timestamptz;
alter table public.pending_admin_invites add column if not exists canceled_by uuid references public.users(id) on delete set null;
create unique index if not exists pending_admin_invites_one_active_email_school_idx on public.pending_admin_invites(school_id,lower(email)) where status in ('pending','accepting') and used_at is null and canceled_at is null;

create table if not exists public.platform_user_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.users(id) on delete restrict,
 affected_user_id uuid references public.users(id) on delete restrict,
 school_id uuid references public.schools(id) on delete restrict,
 invitation_id uuid references public.pending_admin_invites(id) on delete restrict,
 action text not null,
 summary text not null,
 previous_values jsonb not null default '{}'::jsonb,
 new_values jsonb not null default '{}'::jsonb,
 result_status text not null default 'success' check(result_status in ('success','blocked')),
 created_at timestamptz not null default now()
);
create index if not exists platform_user_audit_user_idx on public.platform_user_audit(affected_user_id,created_at desc);

alter table public.school_memberships enable row level security;
alter table public.platform_user_audit enable row level security;
create policy "SuperAdmins read memberships" on public.school_memberships for select to authenticated using(public.current_user_is_super_admin());
create policy "Users read own memberships" on public.school_memberships for select to authenticated using(user_id=auth.uid());
create policy "SuperAdmins read user audit" on public.platform_user_audit for select to authenticated using(public.current_user_is_super_admin());
revoke all on public.school_memberships,public.platform_user_audit from public,anon,authenticated;
grant select on public.school_memberships,public.platform_user_audit to authenticated;
grant all on public.school_memberships,public.platform_user_audit to service_role;

create or replace function public.add_school_membership(p_user_id uuid,p_school_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_row public.school_memberships%rowtype;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;
 if p_role not in ('SchoolAdmin','Editor') then return jsonb_build_object('status','unsupported_role');end if;
 if not exists(select 1 from public.users where id=p_user_id) then return jsonb_build_object('status','invalid_user');end if;
 if not exists(select 1 from public.schools where id=p_school_id and archived_at is null) then return jsonb_build_object('status','school_unavailable');end if;
 insert into public.school_memberships(user_id,school_id,role,created_by,updated_by) values(p_user_id,p_school_id,p_role,v_actor,v_actor)
 on conflict(user_id,school_id) do update set is_active=true,role=excluded.role,version=school_memberships.version+1,updated_at=now(),updated_by=v_actor
 returning * into v_row;
 insert into public.platform_user_audit(actor_id,affected_user_id,school_id,action,summary,new_values) values(v_actor,p_user_id,p_school_id,'membership_added','Added school membership',to_jsonb(v_row)-array['created_by','updated_by']);
 return jsonb_build_object('status','success','membership_id',v_row.id,'version',v_row.version);
exception when unique_violation then return jsonb_build_object('status','duplicate_membership');when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.update_school_membership_role(p_membership_id uuid,p_expected_version bigint,p_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_before public.school_memberships%rowtype;v_after public.school_memberships%rowtype;v_admins bigint;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;
 if p_role not in ('SchoolAdmin','Editor') then return jsonb_build_object('status','unsupported_role');end if;
 lock table public.school_memberships in share row exclusive mode;
 select * into v_before from public.school_memberships where id=p_membership_id for update;
 if v_before.id is null then return jsonb_build_object('status','not_found');end if;if v_before.version<>p_expected_version then return jsonb_build_object('status','stale');end if;
 if v_before.role='SchoolAdmin' and p_role<>'SchoolAdmin' and v_before.is_active then select count(*) into v_admins from public.school_memberships where school_id=v_before.school_id and role='SchoolAdmin' and is_active and id<>v_before.id;if v_admins=0 then insert into public.platform_user_audit(actor_id,affected_user_id,school_id,action,summary,previous_values,result_status) values(v_actor,v_before.user_id,v_before.school_id,'final_admin_change_blocked','Blocked final SchoolAdmin demotion',to_jsonb(v_before)-array['created_by','updated_by'],'blocked');return jsonb_build_object('status','last_school_admin');end if;end if;
 update public.school_memberships set role=p_role,version=version+1,updated_at=now(),updated_by=v_actor where id=p_membership_id returning * into v_after;
 insert into public.platform_user_audit(actor_id,affected_user_id,school_id,action,summary,previous_values,new_values) values(v_actor,v_after.user_id,v_after.school_id,'membership_role_changed','Changed school membership role',to_jsonb(v_before)-array['created_by','updated_by'],to_jsonb(v_after)-array['created_by','updated_by']);
 return jsonb_build_object('status','success','version',v_after.version);
exception when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.remove_school_membership(p_membership_id uuid,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_before public.school_memberships%rowtype;v_admins bigint;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;
 lock table public.school_memberships in share row exclusive mode;
 select * into v_before from public.school_memberships where id=p_membership_id for update;
 if v_before.id is null then return jsonb_build_object('status','not_found');end if;if v_before.version<>p_expected_version then return jsonb_build_object('status','stale');end if;
 if v_before.role='SchoolAdmin' and v_before.is_active then select count(*) into v_admins from public.school_memberships where school_id=v_before.school_id and role='SchoolAdmin' and is_active and id<>v_before.id;if v_admins=0 then insert into public.platform_user_audit(actor_id,affected_user_id,school_id,action,summary,previous_values,result_status) values(v_actor,v_before.user_id,v_before.school_id,'final_admin_removal_blocked','Blocked final SchoolAdmin removal',to_jsonb(v_before)-array['created_by','updated_by'],'blocked');return jsonb_build_object('status','last_school_admin');end if;end if;
 update public.school_memberships set is_active=false,version=version+1,updated_at=now(),updated_by=v_actor where id=p_membership_id;
 insert into public.platform_user_audit(actor_id,affected_user_id,school_id,action,summary,previous_values,new_values) values(v_actor,v_before.user_id,v_before.school_id,'membership_removed','Removed school membership',to_jsonb(v_before)-array['created_by','updated_by'],jsonb_build_object('is_active',false));
 return jsonb_build_object('status','success');
exception when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.cancel_platform_user_invitation(p_invitation_id uuid,p_school_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_invite public.pending_admin_invites%rowtype;
begin if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;select * into v_invite from public.pending_admin_invites where id=p_invitation_id and school_id=p_school_id for update;if v_invite.id is null then return jsonb_build_object('status','not_found');end if;if v_invite.used_at is not null or v_invite.canceled_at is not null then return jsonb_build_object('status','not_pending');end if;update public.pending_admin_invites set canceled_at=now(),canceled_by=v_actor,used_at=now(),acceptance_locked_at=null where id=v_invite.id;insert into public.platform_user_audit(actor_id,school_id,invitation_id,action,summary) values(v_actor,p_school_id,v_invite.id,'invitation_canceled','Canceled school invitation');return jsonb_build_object('status','success');exception when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.claim_platform_password_reset_audit(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();
begin if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;if not exists(select 1 from public.users where id=p_user_id) then return jsonb_build_object('status','not_found');end if;if exists(select 1 from public.platform_user_audit where actor_id=v_actor and affected_user_id=p_user_id and action='password_reset_requested' and created_at>now()-interval '5 minutes') then return jsonb_build_object('status','rate_limited');end if;insert into public.platform_user_audit(actor_id,affected_user_id,action,summary) values(v_actor,p_user_id,'password_reset_requested','Requested secure password-reset email');return jsonb_build_object('status','success');exception when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.search_platform_users(p_search text,p_school_id uuid,p_role text,p_account_status text,p_invitation_status text,p_multiple boolean,p_archived boolean,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;
 with candidates as (
  select u.id,u.full_name,u.first_name,u.last_name,u.email,u.role,u.is_active,u.created_at,
   coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'school_id',m.school_id,'school_name',s.name,'school_subdomain',s.subdomain,'school_archived_at',s.archived_at,'role',m.role,'is_active',m.is_active,'version',m.version,'joined_at',m.joined_at) order by s.name) from public.school_memberships m join public.schools s on s.id=m.school_id where m.user_id=u.id),'[]'::jsonb) memberships,
   (select count(*) from public.school_memberships m where m.user_id=u.id and m.is_active) membership_count,
   exists(select 1 from public.pending_admin_invites i where lower(i.email)=lower(u.email) and i.used_at is null and i.canceled_at is null and i.status in ('pending','accepting')) has_pending_invitation
  from public.users u
  where (coalesce(p_search,'')='' or concat_ws(' ',u.full_name,u.first_name,u.last_name,u.email) ilike '%'||p_search||'%' or exists(select 1 from public.school_memberships sm join public.schools ss on ss.id=sm.school_id where sm.user_id=u.id and ss.name ilike '%'||p_search||'%'))
   and (p_school_id is null or exists(select 1 from public.school_memberships m where m.user_id=u.id and m.school_id=p_school_id and m.is_active))
   and (coalesce(p_role,'')='' or (p_role='SuperAdmin' and lower(replace(coalesce(u.role,''),'_',''))='superadmin') or exists(select 1 from public.school_memberships m where m.user_id=u.id and m.role=p_role and m.is_active))
   and (coalesce(p_account_status,'')='' or (p_account_status='active')=coalesce(u.is_active,false))
   and (p_multiple is null or p_multiple=((select count(*) from public.school_memberships m where m.user_id=u.id and m.is_active)>1))
   and (p_archived is null or p_archived=exists(select 1 from public.school_memberships m join public.schools s on s.id=m.school_id where m.user_id=u.id and s.archived_at is not null))
 ), filtered as (select * from candidates where coalesce(p_invitation_status,'')='' or (p_invitation_status='pending')=has_pending_invitation), page as (select * from filtered order by lower(coalesce(full_name,concat_ws(' ',first_name,last_name),email)),id offset greatest(p_offset,0) limit least(greatest(p_limit,1),100))
 select jsonb_build_object('status','success','count',(select count(*) from filtered),'users',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into v_result;
 return v_result;
end;$$;

create or replace function public.current_user_can_access_school(p_school_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.users u join public.schools s on s.id=p_school_id
  where u.id=auth.uid() and u.is_active is true and s.archived_at is null and (
   lower(replace(coalesce(u.role,''),'_',''))='superadmin'
   or u.school_id=p_school_id
   or exists(select 1 from public.school_memberships m where m.user_id=u.id and m.school_id=p_school_id and m.is_active)
  )
 );
$$;

create or replace function public.current_user_can_manage_school_section(p_school_id uuid,p_permission_key text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.users u join public.schools s on s.id=p_school_id
  where u.id=auth.uid() and u.is_active is true and s.archived_at is null and (
   lower(replace(coalesce(u.role,''),'_',''))='superadmin'
   or (u.school_id=p_school_id and lower(replace(coalesce(u.role,''),'_',''))='schooladmin')
   or exists(select 1 from public.school_memberships m where m.user_id=u.id and m.school_id=p_school_id and m.is_active and m.role='SchoolAdmin')
   or ((u.school_id=p_school_id and lower(coalesce(u.role,''))='editor') or exists(select 1 from public.school_memberships m where m.user_id=u.id and m.school_id=p_school_id and m.is_active and m.role='Editor')) and exists(select 1 from public.user_permissions up join public.permissions p on p.id=up.permission_id where up.user_id=u.id and p.key=p_permission_key)
  )
 );
$$;

create or replace function public.platform_user_directory_summary()
returns jsonb language sql stable security definer set search_path=public as $$
 select case when public.current_user_is_super_admin() then jsonb_build_object('total_users',(select count(*) from public.users),'active_users',(select count(*) from public.users where is_active),'pending_invitations',(select count(*) from public.pending_admin_invites where used_at is null and canceled_at is null and status in ('pending','accepting')),'school_administrators',(select count(distinct user_id) from public.school_memberships where role='SchoolAdmin' and is_active),'editors',(select count(distinct user_id) from public.school_memberships where role='Editor' and is_active),'super_admins',(select count(*) from public.users where lower(replace(coalesce(role,''),'_',''))='superadmin' and is_active),'multi_school_users',(select count(*) from (select user_id from public.school_memberships where is_active group by user_id having count(*)>1) multi)) else jsonb_build_object('status','permission_error') end;
$$;

revoke all on function public.add_school_membership(uuid,uuid,text),public.update_school_membership_role(uuid,bigint,text),public.remove_school_membership(uuid,bigint),public.cancel_platform_user_invitation(uuid,uuid),public.claim_platform_password_reset_audit(uuid),public.search_platform_users(text,uuid,text,text,text,boolean,boolean,integer,integer),public.platform_user_directory_summary() from public,anon,authenticated;
grant execute on function public.add_school_membership(uuid,uuid,text),public.update_school_membership_role(uuid,bigint,text),public.remove_school_membership(uuid,bigint),public.cancel_platform_user_invitation(uuid,uuid),public.claim_platform_password_reset_audit(uuid),public.search_platform_users(text,uuid,text,text,text,boolean,boolean,integer,integer),public.platform_user_directory_summary() to authenticated;

commit;
