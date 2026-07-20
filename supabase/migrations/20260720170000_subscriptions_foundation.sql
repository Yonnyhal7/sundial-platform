begin;

create table if not exists public.subscription_plans (
  code text primary key check (code in ('pilot','founder','standard','custom')),
  display_name text not null,
  description text not null default '',
  default_setup_fee_cents bigint check (default_setup_fee_cents is null or default_setup_fee_cents >= 0),
  default_annual_price_cents bigint check (default_annual_price_cents is null or default_annual_price_cents >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  counts_as_revenue boolean not null,
  founder_limited boolean not null default false,
  active_for_assignment boolean not null default true,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.subscription_plans(code,display_name,description,default_setup_fee_cents,default_annual_price_cents,counts_as_revenue,founder_limited)
values
 ('pilot','Pilot','Complimentary pilot plan',0,0,false,false),
 ('founder','Founder','Limited Founder School contract',250000,150000,true,true),
 ('standard','Standard','Standard annual school plan',500000,250000,true,false),
 ('custom','Custom','Individually contracted pricing',null,null,true,false)
on conflict (code) do nothing;

create table if not exists public.school_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete restrict,
  plan_code text not null references public.subscription_plans(code) on update cascade on delete restrict,
  status text not null check (status in ('pending','active','past_due','paused','canceled')),
  contracted_setup_fee_cents bigint not null check (contracted_setup_fee_cents >= 0),
  contracted_annual_price_cents bigint not null check (contracted_annual_price_cents >= 0),
  currency text not null default 'USD' check (currency='USD'),
  founder_slot smallint unique check (founder_slot between 1 and 5),
  start_date date,
  next_renewal_date date,
  cancel_at_renewal boolean not null default false,
  canceled_at timestamptz,
  cancellation_reason text,
  billing_contact_name text,
  billing_contact_email text,
  billing_contact_phone text,
  internal_notes text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid not null references public.users(id) on delete restrict,
  constraint subscription_dates_check check (next_renewal_date is null or start_date is null or next_renewal_date > start_date),
  constraint founder_slot_plan_check check ((plan_code='founder' and founder_slot is not null) or (plan_code<>'founder' and founder_slot is null)),
  constraint cancellation_reason_check check (canceled_at is null or length(btrim(coalesce(cancellation_reason,''))) > 0)
);

create index if not exists school_subscriptions_status_idx on public.school_subscriptions(status,next_renewal_date);
create index if not exists school_subscriptions_plan_idx on public.school_subscriptions(plan_code);

create table if not exists public.founder_slot_claims (
  slot smallint primary key check (slot between 1 and 5),
  school_id uuid not null unique references public.schools(id) on delete restrict,
  subscription_id uuid not null unique references public.school_subscriptions(id) on delete restrict,
  claimed_at timestamptz not null default now(),
  claimed_by uuid not null references public.users(id) on delete restrict
);

create table if not exists public.subscription_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.school_subscriptions(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  entry_type text not null check (entry_type in ('setup_fee_charge','annual_charge','custom_charge','payment','waiver','refund','adjustment')),
  direction text not null check (direction in ('debit','credit')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD' check (currency='USD'),
  status text not null check (status in ('pending','paid','past_due','waived','refunded','voided')),
  due_date date,
  effective_date date,
  external_reference text,
  internal_note text,
  reason text,
  related_entry_id uuid references public.subscription_ledger_entries(id) on delete restrict,
  idempotency_key text,
  recorded_by uuid not null references public.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint ledger_type_direction_check check (
    (entry_type in ('setup_fee_charge','annual_charge','custom_charge') and direction='debit') or
    (entry_type in ('payment','waiver') and direction='credit') or
    (entry_type='refund' and direction='debit') or
    entry_type='adjustment'
  ),
  constraint ledger_reason_check check (entry_type not in ('waiver','refund','adjustment') or length(btrim(coalesce(reason,''))) > 0)
);
create unique index if not exists subscription_ledger_idempotency_idx on public.subscription_ledger_entries(subscription_id,idempotency_key) where idempotency_key is not null;
create index if not exists subscription_ledger_school_date_idx on public.subscription_ledger_entries(school_id,recorded_at desc);
create index if not exists subscription_ledger_due_idx on public.subscription_ledger_entries(due_date) where status in ('pending','past_due');

create table if not exists public.subscription_audit (
 id bigint generated always as identity primary key,
 subscription_id uuid references public.school_subscriptions(id) on delete restrict,
 school_id uuid references public.schools(id) on delete restrict,
 actor_id uuid not null references public.users(id) on delete restrict,
 action text not null,
 summary text not null,
 previous_values jsonb not null default '{}'::jsonb,
 new_values jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists subscription_audit_subscription_idx on public.subscription_audit(subscription_id,created_at desc);

alter table public.subscription_plans enable row level security;
alter table public.school_subscriptions enable row level security;
alter table public.founder_slot_claims enable row level security;
alter table public.subscription_ledger_entries enable row level security;
alter table public.subscription_audit enable row level security;
create policy "SuperAdmins read subscription plans" on public.subscription_plans for select to authenticated using (public.current_user_is_super_admin());
create policy "SuperAdmins read school subscriptions" on public.school_subscriptions for select to authenticated using (public.current_user_is_super_admin());
create policy "SuperAdmins read founder claims" on public.founder_slot_claims for select to authenticated using (public.current_user_is_super_admin());
create policy "SuperAdmins read subscription ledger" on public.subscription_ledger_entries for select to authenticated using (public.current_user_is_super_admin());
create policy "SuperAdmins read subscription audit" on public.subscription_audit for select to authenticated using (public.current_user_is_super_admin());
revoke all on public.subscription_plans,public.school_subscriptions,public.founder_slot_claims,public.subscription_ledger_entries,public.subscription_audit from public,anon,authenticated;
grant select on public.subscription_plans,public.school_subscriptions,public.founder_slot_claims,public.subscription_ledger_entries,public.subscription_audit to authenticated;
grant all on public.subscription_plans,public.school_subscriptions,public.founder_slot_claims,public.subscription_ledger_entries,public.subscription_audit to service_role;

create or replace function public.assign_school_subscription(p_school_id uuid,p_plan_code text,p_setup_fee_cents bigint,p_annual_price_cents bigint,p_start_date date,p_next_renewal_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_plan public.subscription_plans%rowtype;v_existing public.school_subscriptions%rowtype;v_result public.school_subscriptions%rowtype;v_setup bigint;v_annual bigint;v_slot smallint;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;
 if not exists(select 1 from public.schools where id=p_school_id) then return jsonb_build_object('status','invalid_school');end if;
 select * into v_plan from public.subscription_plans where code=p_plan_code for update;
 if v_plan.code is null or not v_plan.active_for_assignment then return jsonb_build_object('status','plan_unavailable');end if;
 if p_next_renewal_date is not null and p_start_date is not null and p_next_renewal_date<=p_start_date then return jsonb_build_object('status','invalid_dates');end if;
 v_setup:=case when p_plan_code='custom' then p_setup_fee_cents else coalesce(p_setup_fee_cents,v_plan.default_setup_fee_cents) end;
 v_annual:=case when p_plan_code='custom' then p_annual_price_cents else coalesce(p_annual_price_cents,v_plan.default_annual_price_cents) end;
 if v_setup is null or v_annual is null or v_setup<0 or v_annual<0 then return jsonb_build_object('status','invalid_pricing');end if;
 select * into v_existing from public.school_subscriptions where school_id=p_school_id for update;
 if p_plan_code='founder' then
   select slot into v_slot from public.founder_slot_claims where school_id=p_school_id;
   if v_slot is null then select slot into v_slot from generate_series(1,5) slot where not exists(select 1 from public.founder_slot_claims where founder_slot_claims.slot=slot) order by slot limit 1;
   end if;
   if v_slot is null then return jsonb_build_object('status','founder_full');end if;
 end if;
 insert into public.school_subscriptions(school_id,plan_code,status,contracted_setup_fee_cents,contracted_annual_price_cents,founder_slot,start_date,next_renewal_date,created_by,updated_by)
 values(p_school_id,p_plan_code,'active',v_setup,v_annual,v_slot,p_start_date,p_next_renewal_date,v_actor,v_actor)
 on conflict(school_id) do update set plan_code=excluded.plan_code,status='active',contracted_setup_fee_cents=excluded.contracted_setup_fee_cents,contracted_annual_price_cents=excluded.contracted_annual_price_cents,founder_slot=excluded.founder_slot,start_date=excluded.start_date,next_renewal_date=excluded.next_renewal_date,cancel_at_renewal=false,canceled_at=null,cancellation_reason=null,version=school_subscriptions.version+1,updated_at=now(),updated_by=v_actor
 returning * into v_result;
 if p_plan_code='founder' then insert into public.founder_slot_claims(slot,school_id,subscription_id,claimed_by) values(v_slot,p_school_id,v_result.id,v_actor) on conflict(school_id) do nothing;end if;
 insert into public.subscription_audit(subscription_id,school_id,actor_id,action,summary,previous_values,new_values) values(v_result.id,p_school_id,v_actor,case when v_existing.id is null then 'plan_assigned' else 'plan_changed' end,case when v_existing.id is null then 'Assigned subscription plan' else 'Changed subscription plan' end,coalesce(to_jsonb(v_existing)-array['created_by','updated_by'], '{}'::jsonb),to_jsonb(v_result)-array['created_by','updated_by']);
 return jsonb_build_object('status','success','subscription_id',v_result.id,'version',v_result.version,'founder_slot',v_result.founder_slot);
exception when unique_violation then return jsonb_build_object('status','conflict');when others then return jsonb_build_object('status','server_error');
end;$$;

create or replace function public.update_school_subscription(p_subscription_id uuid,p_expected_version bigint,p_status text,p_start_date date,p_next_renewal_date date,p_cancel_at_renewal boolean,p_cancellation_reason text,p_billing_contact_name text,p_billing_contact_email text,p_billing_contact_phone text,p_internal_notes text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_before public.school_subscriptions%rowtype;v_after public.school_subscriptions%rowtype;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;
 if p_status not in ('pending','active','past_due','paused','canceled') then return jsonb_build_object('status','validation_error');end if;
 if p_next_renewal_date is not null and p_start_date is not null and p_next_renewal_date<=p_start_date then return jsonb_build_object('status','invalid_dates');end if;
 select * into v_before from public.school_subscriptions where id=p_subscription_id for update;
 if v_before.id is null then return jsonb_build_object('status','not_found');end if;
 if v_before.version<>p_expected_version then return jsonb_build_object('status','stale');end if;
 if p_status='canceled' and length(btrim(coalesce(p_cancellation_reason,'')))=0 then return jsonb_build_object('status','reason_required');end if;
 update public.school_subscriptions set status=p_status,start_date=p_start_date,next_renewal_date=p_next_renewal_date,cancel_at_renewal=p_cancel_at_renewal,canceled_at=case when p_status='canceled' then coalesce(canceled_at,now()) else null end,cancellation_reason=case when p_status='canceled' then p_cancellation_reason else null end,billing_contact_name=nullif(btrim(p_billing_contact_name),''),billing_contact_email=nullif(lower(btrim(p_billing_contact_email)),''),billing_contact_phone=nullif(btrim(p_billing_contact_phone),''),internal_notes=nullif(btrim(p_internal_notes),''),version=version+1,updated_at=now(),updated_by=v_actor where id=p_subscription_id returning * into v_after;
 insert into public.subscription_audit(subscription_id,school_id,actor_id,action,summary,previous_values,new_values) values(v_after.id,v_after.school_id,v_actor,'subscription_updated','Updated subscription contract',to_jsonb(v_before)-array['created_by','updated_by'],to_jsonb(v_after)-array['created_by','updated_by']);
 return jsonb_build_object('status','success','version',v_after.version);
exception when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.record_subscription_ledger_entry(p_subscription_id uuid,p_entry_type text,p_direction text,p_amount_cents bigint,p_status text,p_due_date date,p_effective_date date,p_external_reference text,p_internal_note text,p_reason text,p_related_entry_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_sub public.school_subscriptions%rowtype;v_entry public.subscription_ledger_entries%rowtype;
begin
 if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;
 select * into v_sub from public.school_subscriptions where id=p_subscription_id;
 if v_sub.id is null then return jsonb_build_object('status','not_found');end if;
 if p_amount_cents is null or p_amount_cents<=0 then return jsonb_build_object('status','invalid_amount');end if;
 if p_entry_type not in ('setup_fee_charge','annual_charge','custom_charge','payment','waiver','refund','adjustment') or p_status not in ('pending','paid','past_due','waived','refunded','voided') then return jsonb_build_object('status','validation_error');end if;
 if p_entry_type in ('waiver','refund','adjustment') and length(btrim(coalesce(p_reason,'')))=0 then return jsonb_build_object('status','reason_required');end if;
 if p_idempotency_key is not null then select * into v_entry from public.subscription_ledger_entries where subscription_id=p_subscription_id and idempotency_key=p_idempotency_key;if v_entry.id is not null then return jsonb_build_object('status','success','entry_id',v_entry.id,'idempotent',true);end if;end if;
 insert into public.subscription_ledger_entries(subscription_id,school_id,entry_type,direction,amount_cents,status,due_date,effective_date,external_reference,internal_note,reason,related_entry_id,idempotency_key,recorded_by) values(v_sub.id,v_sub.school_id,p_entry_type,p_direction,p_amount_cents,p_status,p_due_date,p_effective_date,nullif(btrim(p_external_reference),''),nullif(btrim(p_internal_note),''),nullif(btrim(p_reason),''),p_related_entry_id,nullif(btrim(p_idempotency_key),''),v_actor) returning * into v_entry;
 insert into public.subscription_audit(subscription_id,school_id,actor_id,action,summary,new_values) values(v_sub.id,v_sub.school_id,v_actor,'ledger_entry_recorded','Recorded subscription ledger entry',to_jsonb(v_entry)-array['recorded_by']);
 return jsonb_build_object('status','success','entry_id',v_entry.id,'idempotent',false);
exception when unique_violation then select * into v_entry from public.subscription_ledger_entries where subscription_id=p_subscription_id and idempotency_key=p_idempotency_key;return jsonb_build_object('status','success','entry_id',v_entry.id,'idempotent',true);when others then return jsonb_build_object('status','server_error');end;$$;

create or replace function public.update_subscription_plan_template(p_code text,p_expected_version bigint,p_display_name text,p_description text,p_setup_fee_cents bigint,p_annual_price_cents bigint,p_active boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_before public.subscription_plans%rowtype;v_after public.subscription_plans%rowtype;
begin if not public.current_user_is_super_admin() then return jsonb_build_object('status','permission_error');end if;select * into v_before from public.subscription_plans where code=p_code for update;if v_before.code is null then return jsonb_build_object('status','not_found');end if;if v_before.version<>p_expected_version then return jsonb_build_object('status','stale');end if;if p_setup_fee_cents<0 or p_annual_price_cents<0 or length(btrim(p_display_name))=0 then return jsonb_build_object('status','validation_error');end if;update public.subscription_plans set display_name=p_display_name,description=p_description,default_setup_fee_cents=case when code='custom' then null else p_setup_fee_cents end,default_annual_price_cents=case when code='custom' then null else p_annual_price_cents end,active_for_assignment=p_active,version=version+1,updated_at=now(),updated_by=v_actor where code=p_code returning * into v_after;insert into public.subscription_audit(school_id,actor_id,action,summary,previous_values,new_values) values(null,v_actor,'plan_template_updated','Updated plan template',to_jsonb(v_before)-'updated_by',to_jsonb(v_after)-'updated_by');return jsonb_build_object('status','success','version',v_after.version);exception when others then return jsonb_build_object('status','server_error');end;$$;

revoke all on function public.assign_school_subscription(uuid,text,bigint,bigint,date,date) from public,anon,authenticated;
revoke all on function public.update_school_subscription(uuid,bigint,text,date,date,boolean,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_subscription_ledger_entry(uuid,text,text,bigint,text,date,date,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.update_subscription_plan_template(text,bigint,text,text,bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.assign_school_subscription(uuid,text,bigint,bigint,date,date) to authenticated;
grant execute on function public.update_school_subscription(uuid,bigint,text,date,date,boolean,text,text,text,text,text) to authenticated;
grant execute on function public.record_subscription_ledger_entry(uuid,text,text,bigint,text,date,date,text,text,text,uuid,text) to authenticated;
grant execute on function public.update_subscription_plan_template(text,bigint,text,text,bigint,bigint,boolean) to authenticated;

commit;
