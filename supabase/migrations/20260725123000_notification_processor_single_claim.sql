begin;

create or replace function public.claim_notification_campaign(
  p_campaign_id uuid default null
)
returns setof public.notification_campaigns
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text:=auth.role();
begin
  if v_role<>'service_role' then
    return;
  end if;

  return query
  with candidate as (
    select c.id
    from public.notification_campaigns c
    join public.schools school
      on school.id=c.school_id
     and school.archived_at is null
    where (p_campaign_id is null or c.id=p_campaign_id)
      and (
        c.status='queued'
        or (c.status='scheduled' and c.scheduled_for<=now())
        or (
          c.status='sending'
          and c.claimed_at<now()-interval '10 minutes'
        )
      )
    order by coalesce(c.scheduled_for,c.created_at)
    for update of c skip locked
    limit 1
  )
  update public.notification_campaigns c
  set status='sending',
      claimed_at=now(),
      claim_token=pg_catalog.gen_random_uuid(),
      send_attempt_count=send_attempt_count+1,
      updated_at=now()
  from candidate
  where c.id=candidate.id
  returning c.*;
end;
$$;

revoke all on function public.claim_notification_campaign(uuid)
  from public,anon,authenticated;
grant execute on function public.claim_notification_campaign(uuid)
  to service_role;

commit;
