\set QUIET 1
\pset format unaligned
\pset tuples_only on

do $$
declare
  v_request jsonb;
  v_request_id uuid;
  v_accept_response jsonb;
  v_accept_response_again jsonb;
  v_job_id uuid;
  v_job_count integer;
begin
  v_request := public.create_balance_request(
    '00000000-0000-0000-0000-0000000000a1',
    'test-graph-cycle-job-request',
    'balance_increase',
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-0000000000b2',
    7000,
    'Graph cycle job smoke',
    null,
    null
  );

  v_request_id := (v_request ->> 'requestId')::uuid;

  v_accept_response := public.accept_financial_request(
    '00000000-0000-0000-0000-0000000000b2',
    'test-graph-cycle-job-accept',
    v_request_id
  );

  if v_accept_response -> 'autoCycleJob' ->> 'status' <> 'queued' then
    raise exception 'expected queued graph cycle job, got %', v_accept_response -> 'autoCycleJob';
  end if;

  v_job_id := (v_accept_response -> 'autoCycleJob' ->> 'jobId')::uuid;
  if v_job_id is null then
    raise exception 'expected graph cycle job id';
  end if;

  v_accept_response_again := public.accept_financial_request(
    '00000000-0000-0000-0000-0000000000b2',
    'test-graph-cycle-job-accept',
    v_request_id
  );

  if (v_accept_response_again -> 'autoCycleJob' ->> 'jobId')::uuid <> v_job_id then
    raise exception 'expected idempotent accept response to reuse graph cycle job id';
  end if;

  select count(*)
    into v_job_count
  from public.graph_cycle_jobs
  where source_type = 'financial_request_accepted'
    and source_id = v_request_id;

  if v_job_count <> 1 then
    raise exception 'expected one graph cycle job for accepted request, got %', v_job_count;
  end if;
end
$$;

\unset QUIET
select '1..1';
select 'ok 1 - graph cycle jobs enqueue idempotently';
