import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// This benchmark can only mutate the isolated validation database. It neither
// resolves a linked project nor uses API credentials or real phone contacts.
const container = 'supabase_db_hc_friendship_validation';
const actorCount = 20;
const contactsPerActor = 1000;
const historicalOwners = 10;
const historicalWatchesPerOwner = 6000;
const runId = randomUUID();
const fixtures = Array.from({ length: actorCount + historicalOwners }, () => ({
  id: randomUUID(),
  session: randomUUID(),
}));
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const ids = fixtures.map(({ id }) => literal(id)).join(',');

function sql(statement, operation) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        container,
        'psql',
        '-XqAt',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${operation} exceeded its local test timeout.`));
    }, 60_000);
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    // SQL errors can contain input literals. Keep only the operation and exit code.
    child.stderr.resume();
    child.on('error', () => {
      clearTimeout(timeout);
      reject(new Error(`${operation} could not start its local database process.`));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${operation} failed (exit ${code ?? 'unknown'}).`));
    });
    child.stdin.end(
      `set client_min_messages = error; set lock_timeout = '5s'; set statement_timeout = '30s';
       ${statement}
      `,
    );
  });
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1] * 100) / 100;
}

function actorWorkload(fixture, index) {
  const statements = [
    'create temp table discovery_load_timings(kind text, elapsed_ms numeric) on commit preserve rows;',
  ];
  for (let offset = 1; offset <= contactsPerActor; offset += 60) {
    const last = Math.min(offset + 59, contactsPerActor);
    const size = last - offset + 1;
    // 20% of each agenda is shared; the remainder is exclusive to that actor.
    const phones = `array(select '+1994' || lpad((case when n <= 200 then n
      else ${index + 1} * 1000 + n end)::text, 10, '0')
      from generate_series(${offset}, ${last}) n)`;
    // Each DO is its own transaction, matching separate requests. An entire
    // 1000-contact agenda must not hold its phone locks until its last batch.
    statements.push(`do $$ declare started timestamptz := clock_timestamp(); result jsonb; begin
      result := public.register_contact_discovery(${literal(fixture.id)}, ${phones}, ${literal(fixture.session)});
      if jsonb_array_length(result -> 'watches') <> ${size} then
        raise exception 'registration dropped contacts';
      end if;
      insert into discovery_load_timings values ('registration',
        extract(epoch from (clock_timestamp() - started)) * 1000);
    end $$;`);
    statements.push(`do $$ declare started timestamptz := clock_timestamp(); result jsonb; begin
      result := public.resolve_people_targets_observed(${literal(fixture.id)}, ${phones}, null);
      if jsonb_array_length(result) <> ${size}
         or exists (select 1 from jsonb_array_elements(result) row where row ->> 'status' <> 'no_account') then
        raise exception 'resolution lost or mismatched contacts';
      end if;
      insert into discovery_load_timings values ('resolution',
        extract(epoch from (clock_timestamp() - started)) * 1000);
    end $$;`);
  }
  statements.push(`do $$ begin
    if (select count(*) from app_private.contact_discovery_watches
        where owner_user_id = ${literal(fixture.id)} and session_id = ${literal(fixture.session)}) <> ${contactsPerActor}
       or public.manage_contact_discovery(${literal(fixture.id)}, ${literal(fixture.session)}, 'renew') ->> 'status' <> 'renewed' then
      raise exception 'agenda registration or lightweight renewal failed';
    end if;
  end $$;`);
  statements.push(`select jsonb_build_object(
    'registration', (select jsonb_agg(elapsed_ms) from discovery_load_timings where kind = 'registration'),
    'resolution', (select jsonb_agg(elapsed_ms) from discovery_load_timings where kind = 'resolution')
  );`);
  return statements.join('\n');
}

try {
  await sql('select 1;', 'Checking the isolated validation database');
  const values = fixtures
    .map(
      ({ id }, index) =>
        `(${literal(id)}, 'authenticated', 'authenticated', ${literal(`hc-load-${runId}-${index}@example.test`)},
          now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Load fixture"}')`,
    )
    .join(',');
  const background = fixtures
    .slice(actorCount)
    .map(
      ({ id, session }, index) => `
        insert into app_private.contact_discovery_sessions(owner_user_id, session_id)
          values (${literal(id)}, ${literal(session)});
        insert into app_private.contact_discovery_watches(owner_user_id, session_id, phone_hmac)
          select ${literal(id)}, ${literal(session)}, app_private.contact_phone_hmac(
            '+1994' || lpad((${index} * ${historicalWatchesPerOwner} + n)::text, 10, '0')
          ) from generate_series(1, ${historicalWatchesPerOwner}) n;
      `,
    )
    .join('\n');
  await sql(
    `begin;
     insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
       values ${values};
     update public.user_profiles set account_access_state = 'active' where id in (${ids});
     ${background}
     commit;
     analyze app_private.contact_discovery_watches;
     analyze app_private.contact_discovery_sessions;`,
    'Preparing synthetic local load fixtures',
  );

  const started = performance.now();
  const results = await Promise.allSettled(
    fixtures
      .slice(0, actorCount)
      .map((fixture, index) => sql(actorWorkload(fixture, index), `Actor ${index + 1} workload`)),
  );
  const wallMs = Math.round(performance.now() - started);
  const failed = results.filter((result) => result.status === 'rejected');
  assert.equal(failed.length, 0, `${failed.length} local concurrent workloads failed.`);
  const registration = [];
  const resolution = [];
  for (const result of results) {
    const timings = JSON.parse(result.value);
    registration.push(...timings.registration);
    resolution.push(...timings.resolution);
  }
  assert.equal(registration.length, actorCount * Math.ceil(contactsPerActor / 60));
  assert.equal(resolution.length, registration.length);

  const plan = JSON.parse(
    await sql(
      `explain (analyze, buffers, format json) select watch.id
       from app_private.contact_discovery_watches watch
       join app_private.contact_discovery_sessions session
         on session.owner_user_id = watch.owner_user_id and session.session_id = watch.session_id
       where watch.phone_hmac = app_private.contact_phone_hmac('+19940000000001')
         and session.expires_at > now();`,
      'Checking selective discovery query planning',
    ),
  );
  const indexUsed = JSON.stringify(plan).includes('contact_discovery_watches_phone_idx');
  assert.ok(indexUsed, 'Selective notification lookup did not use the phone HMAC index.');
  console.log(
    JSON.stringify({
      result: 'passed',
      actors: actorCount,
      contactsPerActor,
      sharedAgendaPercent: 20,
      backgroundWatches: historicalOwners * historicalWatchesPerOwner,
      registrationCalls: registration.length,
      resolutionCalls: resolution.length,
      errors: failed.length,
      registrationSqlP95Ms: percentile(registration, 0.95),
      registrationSqlMaxMs: percentile(registration, 1),
      resolutionSqlP95Ms: percentile(resolution, 0.95),
      resolutionSqlMaxMs: percentile(resolution, 1),
      totalWallMs: wallMs,
      selectivePhoneIndexUsed: indexUsed,
      measurement:
        'isolated PostgreSQL calls; excludes Edge, rate limits, network, and mobile rendering',
    }),
  );
} catch (error) {
  console.error(`Local discovery load test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql(
    `delete from auth.users where id in (${ids}) and email like ${literal(`hc-load-${runId}-%@example.test`)};`,
    'Removing only this run synthetic fixtures',
  ).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  console.log(`Cleaned ${fixtures.length} isolated fixture accounts and their watches.`);
}
