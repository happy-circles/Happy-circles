create table if not exists public.analytics_event_catalog (
  event_name text primary key,
  description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.analytics_event_catalog is
  'Catalogo oficial de eventos de producto permitidos para evitar tracking libre o ambiguo.';
comment on column public.analytics_event_catalog.event_name is
  'Nombre estable del evento que el cliente puede reportar si esta activo.';
comment on column public.analytics_event_catalog.description is
  'Descripcion corta de que representa el evento y cuando debe dispararse.';

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  client_session_id text not null,
  platform text not null,
  app_version text,
  device_id_hash text,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_sessions_client_session_not_blank check (btrim(client_session_id) <> ''),
  constraint app_sessions_platform_not_blank check (btrim(platform) <> ''),
  constraint app_sessions_time_order check (ended_at is null or ended_at >= started_at)
);

comment on table public.app_sessions is
  'Una fila por sesion autenticada de app para medir DAU, retencion y duracion aproximada.';
comment on column public.app_sessions.client_session_id is
  'Identificador efimero generado por el cliente para idempotencia de la apertura.';
comment on column public.app_sessions.device_id_hash is
  'Hash SHA-256 del device id local; nunca se guarda el identificador crudo.';
comment on column public.app_sessions.last_seen_at is
  'Ultimo evento conocido de la sesion, usado para actividad y duracion aproximada.';

create unique index if not exists app_sessions_user_client_session_unique_idx
  on public.app_sessions (user_id, client_session_id);

create index if not exists app_sessions_user_last_seen_idx
  on public.app_sessions (user_id, last_seen_at desc);

create index if not exists app_sessions_started_at_idx
  on public.app_sessions (started_at desc);

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  session_id uuid not null references public.app_sessions (id) on delete cascade,
  client_event_id text not null,
  event_name text not null references public.analytics_event_catalog (event_name),
  screen_name text,
  platform text not null,
  app_version text,
  occurred_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint product_events_client_event_not_blank check (btrim(client_event_id) <> ''),
  constraint product_events_platform_not_blank check (btrim(platform) <> ''),
  constraint product_events_metadata_object check (jsonb_typeof(metadata_json) = 'object')
);

comment on table public.product_events is
  'Event stream append-only de uso de producto para funnels, pantallas vistas y comportamiento clave.';
comment on column public.product_events.client_event_id is
  'Identificador idempotente enviado por el cliente para no duplicar reintentos.';
comment on column public.product_events.event_name is
  'Evento validado contra analytics_event_catalog.';
comment on column public.product_events.metadata_json is
  'Metadata minimizada y allowlisted; no debe contener PII cruda.';

create unique index if not exists product_events_user_client_event_unique_idx
  on public.product_events (user_id, client_event_id);

create index if not exists product_events_user_occurred_idx
  on public.product_events (user_id, occurred_at desc);

create index if not exists product_events_event_occurred_idx
  on public.product_events (event_name, occurred_at desc);

create index if not exists product_events_screen_occurred_idx
  on public.product_events (screen_name, occurred_at desc)
  where screen_name is not null;

create table if not exists public.analytics_daily_user_facts (
  fact_date date not null,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  is_active boolean not null default true,
  session_count integer not null default 0 check (session_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  screen_view_count integer not null default 0 check (screen_view_count >= 0),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  latest_platform text,
  latest_app_version text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (fact_date, user_id)
);

comment on table public.analytics_daily_user_facts is
  'Resumen diario por usuario para retencion, frecuencia de uso y cohortes.';
comment on column public.analytics_daily_user_facts.fact_date is
  'Dia UTC resumido.';
comment on column public.analytics_daily_user_facts.is_active is
  'True si el usuario tuvo al menos un evento de producto ese dia.';

create index if not exists analytics_daily_user_facts_user_date_idx
  on public.analytics_daily_user_facts (user_id, fact_date desc);

create table if not exists public.analytics_daily_product_facts (
  fact_date date primary key,
  active_user_count integer not null default 0 check (active_user_count >= 0),
  new_user_count integer not null default 0 check (new_user_count >= 0),
  session_count integer not null default 0 check (session_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  screen_view_count integer not null default 0 check (screen_view_count >= 0),
  relationships_created_count integer not null default 0 check (relationships_created_count >= 0),
  friendship_invites_created_count integer not null default 0 check (friendship_invites_created_count >= 0),
  friendship_invites_accepted_count integer not null default 0 check (friendship_invites_accepted_count >= 0),
  account_invites_created_count integer not null default 0 check (account_invites_created_count >= 0),
  account_invites_accepted_count integer not null default 0 check (account_invites_accepted_count >= 0),
  financial_requests_created_count integer not null default 0 check (financial_requests_created_count >= 0),
  financial_requests_accepted_count integer not null default 0 check (financial_requests_accepted_count >= 0),
  financial_requests_rejected_count integer not null default 0 check (financial_requests_rejected_count >= 0),
  ledger_transaction_count integer not null default 0 check (ledger_transaction_count >= 0),
  confirmed_volume_minor bigint not null default 0 check (confirmed_volume_minor >= 0),
  settlement_proposals_created_count integer not null default 0 check (settlement_proposals_created_count >= 0),
  settlement_executions_count integer not null default 0 check (settlement_executions_count >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.analytics_daily_product_facts is
  'Resumen diario global de producto y negocio para dashboards internos.';
comment on column public.analytics_daily_product_facts.confirmed_volume_minor is
  'Volumen confirmado desde ledger debit entries; evita duplicar ambos lados del asiento.';

insert into public.analytics_event_catalog (event_name, description)
values
  ('app_opened', 'La app se abrio con una sesion autenticada.'),
  ('app_backgrounded', 'La app paso a segundo plano o cerro la sesion visual.'),
  ('screen_viewed', 'El usuario vio una pantalla o ruta principal.'),
  ('registration_started', 'El usuario inicio un paso autenticado del registro o setup.'),
  ('registration_completed', 'El usuario completo el registro/setup requerido.'),
  ('financial_request_started', 'El usuario envio el formulario para crear una solicitud financiera.'),
  ('financial_request_created', 'La solicitud financiera se creo correctamente.'),
  ('financial_request_accepted', 'Una solicitud financiera fue aceptada y genero ledger.'),
  ('friendship_invite_created', 'Se creo una invitacion de amistad.'),
  ('friendship_invite_accepted', 'Una invitacion de amistad fue aceptada.'),
  ('settlement_proposal_viewed', 'El usuario abrio el detalle de una propuesta de Happy Circle.'),
  ('settlement_proposal_approved', 'El usuario aprobo una propuesta de Happy Circle.'),
  ('settlement_executed', 'El usuario ejecuto un Happy Circle aprobado.')
on conflict (event_name) do update
set description = excluded.description,
    is_active = true,
    updated_at = timezone('utc', now());

drop trigger if exists set_analytics_event_catalog_updated_at on public.analytics_event_catalog;
create trigger set_analytics_event_catalog_updated_at
before update on public.analytics_event_catalog
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_app_sessions_updated_at on public.app_sessions;
create trigger set_app_sessions_updated_at
before update on public.app_sessions
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_analytics_daily_user_facts_updated_at on public.analytics_daily_user_facts;
create trigger set_analytics_daily_user_facts_updated_at
before update on public.analytics_daily_user_facts
for each row execute function public.tg_set_updated_at();

drop trigger if exists set_analytics_daily_product_facts_updated_at on public.analytics_daily_product_facts;
create trigger set_analytics_daily_product_facts_updated_at
before update on public.analytics_daily_product_facts
for each row execute function public.tg_set_updated_at();

create or replace function public.hash_analytics_device_id(p_device_id text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_device_id, '')), '') is null then null
    else encode(extensions.digest(btrim(p_device_id), 'sha256'), 'hex')
  end
$$;

create or replace function public.sanitize_product_event_metadata(p_metadata_json jsonb)
returns jsonb
language plpgsql
immutable
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

create or replace function public.start_app_session(
  p_actor_user_id uuid,
  p_client_session_id text,
  p_platform text,
  p_app_version text default null,
  p_device_id text default null,
  p_started_at timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_session_id text := nullif(btrim(coalesce(p_client_session_id, '')), '');
  v_platform text := nullif(left(btrim(coalesce(p_platform, '')), 40), '');
  v_app_version text := nullif(left(btrim(coalesce(p_app_version, '')), 80), '');
  v_started_at timestamptz := coalesce(p_started_at, timezone('utc', now()));
  v_session_id uuid;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if v_client_session_id is null or length(v_client_session_id) > 160 then
    raise exception 'invalid clientSessionId';
  end if;

  if v_platform is null then
    raise exception 'invalid platform';
  end if;

  if v_started_at > timezone('utc', now()) + interval '5 minutes'
    or v_started_at < timezone('utc', now()) - interval '30 days' then
    raise exception 'invalid startedAt';
  end if;

  insert into public.app_sessions (
    user_id,
    client_session_id,
    platform,
    app_version,
    device_id_hash,
    started_at,
    last_seen_at,
    ended_at
  )
  values (
    p_actor_user_id,
    v_client_session_id,
    v_platform,
    v_app_version,
    public.hash_analytics_device_id(p_device_id),
    v_started_at,
    v_started_at,
    null
  )
  on conflict (user_id, client_session_id) do update
  set platform = excluded.platform,
      app_version = excluded.app_version,
      device_id_hash = coalesce(excluded.device_id_hash, public.app_sessions.device_id_hash),
      last_seen_at = greatest(public.app_sessions.last_seen_at, excluded.last_seen_at),
      ended_at = null
  returning id into v_session_id;

  insert into public.product_events (
    user_id,
    session_id,
    client_event_id,
    event_name,
    screen_name,
    platform,
    app_version,
    occurred_at,
    metadata_json
  )
  values (
    p_actor_user_id,
    v_session_id,
    'session:' || v_client_session_id || ':app_opened',
    'app_opened',
    null,
    v_platform,
    v_app_version,
    v_started_at,
    '{}'::jsonb
  )
  on conflict (user_id, client_event_id) do nothing;

  return v_session_id;
end;
$$;

create or replace function public.record_product_event(
  p_actor_user_id uuid,
  p_client_event_id text,
  p_session_id uuid,
  p_event_name text,
  p_occurred_at timestamptz default timezone('utc', now()),
  p_screen_name text default null,
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_event_id text := nullif(btrim(coalesce(p_client_event_id, '')), '');
  v_event_name text := nullif(btrim(coalesce(p_event_name, '')), '');
  v_screen_name text := nullif(left(btrim(coalesce(p_screen_name, '')), 80), '');
  v_occurred_at timestamptz := coalesce(p_occurred_at, timezone('utc', now()));
  v_session public.app_sessions%rowtype;
  v_event_id uuid;
begin
  perform public.assert_request_actor(p_actor_user_id);

  if v_client_event_id is null or length(v_client_event_id) > 180 then
    raise exception 'invalid clientEventId';
  end if;

  if v_event_name is null then
    raise exception 'invalid eventName';
  end if;

  if v_occurred_at > timezone('utc', now()) + interval '5 minutes'
    or v_occurred_at < timezone('utc', now()) - interval '30 days' then
    raise exception 'invalid occurredAt';
  end if;

  select *
    into v_session
  from public.app_sessions
  where id = p_session_id
    and user_id = p_actor_user_id;

  if not found then
    raise exception 'invalid sessionId';
  end if;

  if not exists (
    select 1
    from public.analytics_event_catalog
    where event_name = v_event_name
      and is_active
  ) then
    raise exception 'invalid eventName';
  end if;

  insert into public.product_events (
    user_id,
    session_id,
    client_event_id,
    event_name,
    screen_name,
    platform,
    app_version,
    occurred_at,
    metadata_json
  )
  values (
    p_actor_user_id,
    p_session_id,
    v_client_event_id,
    v_event_name,
    v_screen_name,
    v_session.platform,
    v_session.app_version,
    v_occurred_at,
    public.sanitize_product_event_metadata(p_metadata_json)
  )
  on conflict (user_id, client_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id
      into v_event_id
    from public.product_events
    where user_id = p_actor_user_id
      and client_event_id = v_client_event_id;
  end if;

  update public.app_sessions
  set last_seen_at = greatest(last_seen_at, v_occurred_at),
      ended_at = case
        when v_event_name = 'app_backgrounded' then v_occurred_at
        else ended_at
      end
  where id = p_session_id;

  return v_event_id;
end;
$$;

create or replace function public.refresh_analytics_daily_facts(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, timezone('utc', now())::date);
  v_day_start timestamptz := coalesce(p_day, timezone('utc', now())::date)::timestamptz;
  v_day_end timestamptz := (coalesce(p_day, timezone('utc', now())::date) + 1)::timestamptz;
begin
  delete from public.analytics_daily_user_facts
  where fact_date = v_day;

  insert into public.analytics_daily_user_facts (
    fact_date,
    user_id,
    is_active,
    session_count,
    event_count,
    screen_view_count,
    first_seen_at,
    last_seen_at,
    latest_platform,
    latest_app_version
  )
  with day_events as (
    select *
    from public.product_events
    where occurred_at >= v_day_start
      and occurred_at < v_day_end
  ),
  latest_events as (
    select distinct on (user_id)
      user_id,
      platform,
      app_version
    from day_events
    order by user_id, occurred_at desc, created_at desc
  )
  select
    v_day,
    day_events.user_id,
    true,
    count(distinct day_events.session_id)::integer,
    count(*)::integer,
    count(*) filter (where day_events.event_name = 'screen_viewed')::integer,
    min(day_events.occurred_at),
    max(day_events.occurred_at),
    latest_events.platform,
    latest_events.app_version
  from day_events
  join latest_events on latest_events.user_id = day_events.user_id
  group by day_events.user_id, latest_events.platform, latest_events.app_version;

  insert into public.analytics_daily_product_facts (
    fact_date,
    active_user_count,
    new_user_count,
    session_count,
    event_count,
    screen_view_count,
    relationships_created_count,
    friendship_invites_created_count,
    friendship_invites_accepted_count,
    account_invites_created_count,
    account_invites_accepted_count,
    financial_requests_created_count,
    financial_requests_accepted_count,
    financial_requests_rejected_count,
    ledger_transaction_count,
    confirmed_volume_minor,
    settlement_proposals_created_count,
    settlement_executions_count
  )
  select
    v_day,
    (select count(distinct user_id)::integer from public.product_events where occurred_at >= v_day_start and occurred_at < v_day_end),
    (select count(*)::integer from public.user_profiles where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.app_sessions where started_at >= v_day_start and started_at < v_day_end),
    (select count(*)::integer from public.product_events where occurred_at >= v_day_start and occurred_at < v_day_end),
    (select count(*)::integer from public.product_events where event_name = 'screen_viewed' and occurred_at >= v_day_start and occurred_at < v_day_end),
    (select count(*)::integer from public.relationships where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.friendship_invites where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.friendship_invites where status = 'accepted' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.account_invites where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.account_invites where status = 'accepted' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.financial_requests where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.financial_requests where status = 'accepted' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.financial_requests where status = 'rejected' and resolved_at >= v_day_start and resolved_at < v_day_end),
    (select count(*)::integer from public.ledger_transactions where created_at >= v_day_start and created_at < v_day_end),
    coalesce((
      select sum(entry.amount_minor)
      from public.ledger_entries entry
      join public.ledger_transactions ledger_tx on ledger_tx.id = entry.ledger_transaction_id
      where entry.entry_side = 'debit'
        and ledger_tx.created_at >= v_day_start
        and ledger_tx.created_at < v_day_end
    ), 0),
    (select count(*)::integer from public.settlement_proposals where created_at >= v_day_start and created_at < v_day_end),
    (select count(*)::integer from public.settlement_executions where created_at >= v_day_start and created_at < v_day_end)
  on conflict (fact_date) do update
  set active_user_count = excluded.active_user_count,
      new_user_count = excluded.new_user_count,
      session_count = excluded.session_count,
      event_count = excluded.event_count,
      screen_view_count = excluded.screen_view_count,
      relationships_created_count = excluded.relationships_created_count,
      friendship_invites_created_count = excluded.friendship_invites_created_count,
      friendship_invites_accepted_count = excluded.friendship_invites_accepted_count,
      account_invites_created_count = excluded.account_invites_created_count,
      account_invites_accepted_count = excluded.account_invites_accepted_count,
      financial_requests_created_count = excluded.financial_requests_created_count,
      financial_requests_accepted_count = excluded.financial_requests_accepted_count,
      financial_requests_rejected_count = excluded.financial_requests_rejected_count,
      ledger_transaction_count = excluded.ledger_transaction_count,
      confirmed_volume_minor = excluded.confirmed_volume_minor,
      settlement_proposals_created_count = excluded.settlement_proposals_created_count,
      settlement_executions_count = excluded.settlement_executions_count;
end;
$$;

alter table public.analytics_event_catalog enable row level security;
alter table public.app_sessions enable row level security;
alter table public.product_events enable row level security;
alter table public.analytics_daily_user_facts enable row level security;
alter table public.analytics_daily_product_facts enable row level security;

revoke all on public.analytics_event_catalog from public, anon, authenticated;
revoke all on public.app_sessions from public, anon, authenticated;
revoke all on public.product_events from public, anon, authenticated;
revoke all on public.analytics_daily_user_facts from public, anon, authenticated;
revoke all on public.analytics_daily_product_facts from public, anon, authenticated;

grant select, insert, update, delete on public.analytics_event_catalog to service_role;
grant select, insert, update, delete on public.app_sessions to service_role;
grant select, insert, update, delete on public.product_events to service_role;
grant select, insert, update, delete on public.analytics_daily_user_facts to service_role;
grant select, insert, update, delete on public.analytics_daily_product_facts to service_role;

revoke all on function public.hash_analytics_device_id(text) from public, anon, authenticated;
revoke all on function public.sanitize_product_event_metadata(jsonb) from public, anon, authenticated;
revoke all on function public.start_app_session(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_product_event(uuid, text, uuid, text, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.refresh_analytics_daily_facts(date) from public, anon, authenticated;

grant execute on function public.hash_analytics_device_id(text) to service_role;
grant execute on function public.sanitize_product_event_metadata(jsonb) to service_role;
grant execute on function public.start_app_session(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.record_product_event(uuid, text, uuid, text, timestamptz, text, jsonb) to service_role;
grant execute on function public.refresh_analytics_daily_facts(date) to service_role;
