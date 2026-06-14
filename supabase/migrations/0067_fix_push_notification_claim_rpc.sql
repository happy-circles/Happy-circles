create or replace function public.claim_push_notification_events(
  p_worker_id text,
  p_limit integer default 25
)
returns table (
  id uuid,
  recipient_user_id uuid,
  notification_key text,
  source_kind text,
  source_item_id text,
  title text,
  body text,
  href text,
  attempts integer,
  max_attempts integer,
  metadata_json jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id text := nullif(btrim(p_worker_id), '');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
begin
  if v_worker_id is null then
    raise exception 'invalid_worker_id';
  end if;

  update public.push_notification_events as event
  set status = 'pending',
      worker_id = null,
      processing_started_at = null,
      last_error = coalesce(event.last_error, 'processing_timeout'),
      updated_at = timezone('utc', now())
  where event.status = 'processing'
    and event.processing_started_at < timezone('utc', now()) - interval '5 minutes'
    and event.attempts < event.max_attempts;

  return query
  with candidates as (
    select event.id
    from public.push_notification_events as event
    where event.status = 'pending'
      and event.attempts < event.max_attempts
    order by event.created_at asc
    limit v_limit
    for update skip locked
  )
  update public.push_notification_events as event
  set status = 'processing',
      attempts = event.attempts + 1,
      worker_id = v_worker_id,
      processing_started_at = timezone('utc', now()),
      last_error = null,
      updated_at = timezone('utc', now())
  from candidates
  where event.id = candidates.id
  returning
    event.id,
    event.recipient_user_id,
    event.notification_key,
    event.source_kind,
    event.source_item_id,
    event.title,
    event.body,
    event.href,
    event.attempts,
    event.max_attempts,
    event.metadata_json;
end;
$$;

revoke all on function public.claim_push_notification_events(text, integer) from public;
grant execute on function public.claim_push_notification_events(text, integer) to service_role;
