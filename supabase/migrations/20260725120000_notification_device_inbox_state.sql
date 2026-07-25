begin;

alter table public.notification_deliveries
  add column if not exists deleted_at timestamptz;

create index if not exists notification_deliveries_active_device_inbox_idx
  on public.notification_deliveries(device_id,created_at desc)
  where deleted_at is null;

create or replace function public.cleanup_notification_device_inbox()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_deleted bigint;
begin
  if auth.role() <> 'service_role' then
    return jsonb_build_object('status','permission_error','deleted',0);
  end if;

  delete from public.notification_deliveries
  where (read_at is not null and created_at < now() - interval '90 days')
     or created_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('status','success','deleted',v_deleted);
end;
$$;

revoke all on function public.cleanup_notification_device_inbox()
  from public,anon,authenticated;
grant execute on function public.cleanup_notification_device_inbox()
  to service_role;

commit;
