begin;

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  support_email text not null default 'support@sundialk12.com',
  default_sender_name text not null default 'Sundial',
  support_website_url text,
  support_phone text,
  default_timezone text not null default 'America/Los_Angeles',
  default_appearance text not null default 'system' check (default_appearance in ('light','dark','system')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.platform_feature_defaults (
  feature_key text primary key check (feature_key in ('public_website','pwa','kiosk','ai_calendar_import','guided_calendar_setup','announcements','events','athletics','resources','offline_mode')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.platform_feature_defaults (feature_key, enabled)
select key, true from unnest(array['public_website','pwa','kiosk','ai_calendar_import','guided_calendar_setup','announcements','events','athletics','resources','offline_mode']) key
on conflict (feature_key) do nothing;

create table if not exists public.school_feature_availability (
  school_id uuid not null references public.schools(id) on delete cascade,
  feature_key text not null check (feature_key in ('public_website','pwa','kiosk','ai_calendar_import','guided_calendar_setup','announcements','events','athletics','resources','offline_mode')),
  enabled boolean not null,
  created_at timestamptz not null default now(),
  primary key (school_id, feature_key)
);

create table if not exists public.platform_settings_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.users(id) on delete set null,
  section text not null check (section in ('general','new_school_defaults')),
  summary text not null,
  previous_values jsonb not null,
  new_values jsonb not null,
  result_status text not null default 'success' check (result_status in ('success','rejected')),
  created_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;
alter table public.platform_feature_defaults enable row level security;
alter table public.school_feature_availability enable row level security;
alter table public.platform_settings_audit enable row level security;

create policy "SuperAdmins read platform settings" on public.platform_settings for select to authenticated using (public.current_user_is_super_admin());
create policy "SuperAdmins read platform defaults" on public.platform_feature_defaults for select to authenticated using (public.current_user_is_super_admin());
create policy "SuperAdmins read platform audit" on public.platform_settings_audit for select to authenticated using (public.current_user_is_super_admin());
create policy "Authorized users read their school features" on public.school_feature_availability for select to authenticated using (public.current_user_can_access_school(school_id));
create policy "Public reads available school features" on public.school_feature_availability for select to anon using (public.school_is_publicly_available(school_id));

revoke all on public.platform_settings, public.platform_feature_defaults, public.platform_settings_audit from public, anon, authenticated;
grant select on public.platform_settings, public.platform_feature_defaults, public.platform_settings_audit to authenticated;
grant all on public.platform_settings, public.platform_feature_defaults, public.platform_settings_audit to service_role;
grant select on public.school_feature_availability to anon, authenticated;
grant all on public.school_feature_availability to service_role;

create or replace function public.school_feature_is_enabled(p_school_id uuid,p_feature_key text)
returns boolean language sql stable security definer set search_path=public as $$
  select case when p_feature_key not in ('public_website','pwa','kiosk','ai_calendar_import','guided_calendar_setup','announcements','events','athletics','resources','offline_mode') then false
  else coalesce((select enabled from public.school_feature_availability where school_id=p_school_id and feature_key=p_feature_key),true) end;
$$;
revoke all on function public.school_feature_is_enabled(uuid,text) from public;
grant execute on function public.school_feature_is_enabled(uuid,text) to anon,authenticated;

do $$ declare v_table text; v_feature text; begin
  for v_table,v_feature in select * from (values ('announcements','announcements'),('events','events'),('sports','athletics'),('teams','athletics'),('games','athletics'),('resources','resources')) x(t,f) loop
    execute format('drop policy if exists %I on public.%I','Feature availability gate',v_table);
    execute format('create policy %I on public.%I as restrictive for all to public using (public.school_feature_is_enabled(school_id,%L)) with check (public.school_feature_is_enabled(school_id,%L))','Feature availability gate',v_table,v_feature,v_feature);
  end loop;
end $$;

create or replace function public.update_platform_settings(p_section text, p_expected_version bigint, p_values jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_before jsonb; v_after jsonb; v_version bigint;
begin
  if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error'); end if;
  if p_section not in ('general','new_school_defaults') then return jsonb_build_object('status','validation_error'); end if;
  select to_jsonb(s), s.version into v_before, v_version from public.platform_settings s where id = true for update;
  if v_version <> p_expected_version then return jsonb_build_object('status','stale'); end if;
  if p_section = 'general' then
    update public.platform_settings set support_email=p_values->>'support_email', default_sender_name=p_values->>'default_sender_name', support_website_url=nullif(p_values->>'support_website_url',''), support_phone=nullif(p_values->>'support_phone',''), version=version+1, updated_at=now(), updated_by=v_actor where id=true;
  else
    update public.platform_settings set default_timezone=p_values->>'default_timezone', default_appearance=p_values->>'default_appearance', version=version+1, updated_at=now(), updated_by=v_actor where id=true;
    update public.platform_feature_defaults d set enabled=(p_values->'features'->>d.feature_key)::boolean, updated_at=now(), updated_by=v_actor where p_values->'features' ? d.feature_key;
  end if;
  select to_jsonb(s) into v_after from public.platform_settings s where id=true;
  insert into public.platform_settings_audit(actor_id,section,summary,previous_values,new_values) values(v_actor,p_section,case when p_section='general' then 'Updated general platform settings' else 'Updated new-school defaults' end,v_before - 'updated_by',v_after - 'updated_by');
  return jsonb_build_object('status','success','version',v_after->'version');
exception when others then return jsonb_build_object('status','server_error');
end; $$;

create or replace function public.create_school_with_platform_defaults(p_name text,p_slug text,p_subdomain text,p_district_id uuid,p_created_at timestamptz)
returns table(id uuid, subdomain text) language plpgsql security definer set search_path=public as $$
declare v_school_id uuid; v_settings public.platform_settings%rowtype;
begin
  if not public.current_user_is_super_admin() then raise exception 'permission denied'; end if;
  select * into v_settings from public.platform_settings where platform_settings.id=true;
  insert into public.schools(name,slug,subdomain,mascot,primary_color,secondary_color,timezone,default_appearance,is_active,setup_complete,setup_step,district_id,created_at)
  values(p_name,p_slug,p_subdomain,'','#2563eb','#64748b',coalesce(v_settings.default_timezone,'America/Los_Angeles'),coalesce(v_settings.default_appearance,'system'),false,false,'welcome',p_district_id,p_created_at) returning schools.id into v_school_id;
  insert into public.school_feature_availability(school_id,feature_key,enabled) select v_school_id,feature_key,enabled from public.platform_feature_defaults;
  return query select v_school_id,p_subdomain;
end; $$;

revoke all on function public.update_platform_settings(text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.create_school_with_platform_defaults(text,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.update_platform_settings(text,bigint,jsonb) to authenticated;
grant execute on function public.create_school_with_platform_defaults(text,text,text,uuid,timestamptz) to authenticated;

commit;
