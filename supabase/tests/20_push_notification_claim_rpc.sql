begin;

do $$
begin
  perform *
  from public.claim_push_notification_events(
    p_worker_id := 'push-claim-rpc-smoke',
    p_limit := 1
  );
end
$$;

rollback;

select '1..1';
select 'ok 1 - push notification claim RPC is callable without ambiguous columns';
