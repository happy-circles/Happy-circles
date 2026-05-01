create or replace function public.effective_account_invite_status(
  p_status public.account_invite_status,
  p_expires_at timestamptz
)
returns public.account_invite_status
language plpgsql
stable
set search_path = public
as $$
begin
  if p_status in ('pending_activation', 'pending_inviter_review')
    and p_expires_at <= timezone('utc', now()) then
    return 'expired'::public.account_invite_status;
  end if;

  return p_status;
end;
$$;

create or replace function public.sanitize_product_event_metadata(p_metadata_json jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_key text;
  v_value jsonb;
  v_result jsonb := '{}'::jsonb;
  v_text_value text;
begin
  if p_metadata_json is null or jsonb_typeof(p_metadata_json) <> 'object' then
    return '{}'::jsonb;
  end if;

  for v_key, v_value in
    select key, value
    from jsonb_each(p_metadata_json)
  loop
    if v_key in (
      'amountBucket',
      'category',
      'channel',
      'decision',
      'flow',
      'itemKind',
      'reason',
      'result',
      'route',
      'source',
      'status'
    ) and jsonb_typeof(v_value) in ('string', 'number', 'boolean', 'null') then
      if jsonb_typeof(v_value) = 'string' then
        v_text_value := left(btrim(v_value #>> '{}'), 120);
        if v_text_value <> '' then
          v_result := jsonb_set(v_result, array[v_key], to_jsonb(v_text_value), true);
        end if;
      else
        v_result := jsonb_set(v_result, array[v_key], v_value, true);
      end if;
    end if;
  end loop;

  return v_result;
end;
$$;
