import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// Run against the already-migrated isolated stack, including its Realtime RLS policy:
// node scripts/test-contact-discovery-realtime.mjs --db-container supabase_db_hc_friendship_validation
// Ports 55371/55372 and .tmp/friendship-validation are intentional safety boundaries.
// Credentials come only from that local CLI status or explicit SUPABASE_TEST_* keys.
// Four synthetic accounts are created and removed; no real contact data is used.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/mobile/package.json'));
const { createClient } = require('@supabase/supabase-js');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const spawn = expoRequire('cross-spawn');
const { values } = parseArgs({
  options: {
    'api-url': { type: 'string', default: 'http://127.0.0.1:55371' },
    'db-container': { type: 'string' },
    workdir: { type: 'string', default: '.tmp/friendship-validation' },
    samples: { type: 'string', default: '20' },
  },
});

const apiUrl = new URL(values['api-url']);
assert.ok(
  apiUrl.protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(apiUrl.hostname) &&
    apiUrl.port === '55371' &&
    apiUrl.pathname === '/' &&
    !apiUrl.search &&
    !apiUrl.hash &&
    !apiUrl.username &&
    !apiUrl.password,
  'This test only supports the isolated local API on port 55371.',
);
const dbContainer = values['db-container'];
assert.equal(
  dbContainer,
  'supabase_db_hc_friendship_validation',
  'Pass the isolated test DB container explicitly.',
);
const workdir = resolve(root, values.workdir);
assert.equal(
  workdir,
  resolve(root, '.tmp/friendship-validation'),
  'Only the isolated validation workspace is allowed.',
);
const samples = Number(values.samples);
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 100, 'Use 1–100 samples.');

function docker(args, input) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim();
  } catch {
    // A psql error can contain fixture phones or SQL literals. Do not echo it.
    throw new Error('The isolated Docker database operation failed.');
  }
}

const inspected = JSON.parse(docker(['inspect', dbContainer]))[0];
assert.equal(inspected.Name, `/${dbContainer}`);
assert.ok(inspected.State.Running, 'The isolated DB must be running.');
assert.ok(
  inspected.NetworkSettings.Ports['5432/tcp']?.some((binding) => binding.HostPort === '55372'),
  'The isolated DB must expose port 55372.',
);

function sql(statement) {
  return docker(
    [
      'exec',
      '-i',
      dbContainer,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-A',
      '-t',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    statement,
  );
}

function localKeys() {
  if (process.env.SUPABASE_TEST_ANON_KEY && process.env.SUPABASE_TEST_SERVICE_ROLE_KEY) {
    return {
      anon: process.env.SUPABASE_TEST_ANON_KEY,
      service: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
    };
  }
  const result = spawn.sync(
    'pnpm',
    [
      'dlx',
      'supabase@2.114.0',
      '--profile',
      'supabase',
      'status',
      '--workdir',
      workdir,
      '--output',
      'json',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, NODE_USE_SYSTEM_CA: '1', SUPABASE_TELEMETRY_DISABLED: '1' },
    },
  );
  assert.equal(result.status, 0, 'Cannot read isolated CLI status; no credentials were printed.');
  const status = JSON.parse(result.stdout);
  const statusUrl = new URL(status.API_URL);
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(statusUrl.hostname) && statusUrl.port === '55371',
    'CLI status points to a different API.',
  );
  assert.ok(
    status.ANON_KEY && status.SERVICE_ROLE_KEY,
    'The isolated CLI status has no local keys.',
  );
  return { anon: status.ANON_KEY, service: status.SERVICE_ROLE_KEY };
}

const keys = localKeys();
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const admin = createClient(apiUrl.origin, keys.service, options);
const users = [];
const clients = [];
const runId = randomUUID();
const phoneA = `+1999${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
let phoneB = phoneA;
while (phoneB === phoneA) phoneB = `+1999${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;

function expectSuccess(result, operation) {
  if (result.error)
    throw new Error(
      `${operation} failed (${result.error.status ?? result.error.code ?? 'unknown'}).`,
    );
  return result.data;
}

async function createFixtureUser(index) {
  const email = `hc-discovery-${runId}-${index}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const data = expectSuccess(
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'Realtime fixture' },
    }),
    'Creating a local fixture',
  );
  assert.ok(data.user?.id, 'Fixture user ID missing.');
  users.push({ id: data.user.id, email });
  const client = createClient(apiUrl.origin, keys.anon, options);
  clients.push(client);
  const auth = expectSuccess(
    await client.auth.signInWithPassword({ email, password }),
    'Authenticating a local fixture',
  );
  assert.ok(auth.session?.access_token, 'Fixture session missing.');
  await client.realtime.setAuth(auth.session.access_token);
  return { id: data.user.id, client };
}

function subscribe(client, ownerId, { denied = false } = {}) {
  const events = [];
  const listeners = new Set();
  const channel = client
    .channel(`user:${ownerId}`, { config: { private: true } })
    .on('broadcast', { event: 'contacts_changed' }, ({ payload }) => {
      events.push({ payload, receivedAt: performance.now() });
      for (const listener of listeners) listener();
    });
  const ready = new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out.')), 15_000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        if (denied) reject(new Error('A user joined another user’s private discovery channel.'));
        else resolveReady();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        if (denied && status === 'CHANNEL_ERROR') resolveReady();
        else reject(new Error(`Private discovery subscription failed (${status}).`));
      }
    });
  });
  return {
    channel,
    events,
    ready,
    next(watchIds) {
      const after = events.length;
      return new Promise((resolveEvent, reject) => {
        const timeout = setTimeout(() => {
          listeners.delete(check);
          reject(
            new Error('No private discovery event arrived after the committed profile change.'),
          );
        }, 10_000);
        function check() {
          const event = events
            .slice(after)
            .find(({ payload }) => watchIds.every((id) => payload.watchIds?.includes(id)));
          if (!event) return;
          clearTimeout(timeout);
          listeners.delete(check);
          resolveEvent(event);
        }
        listeners.add(check);
      });
    },
  };
}

async function resolveObserved(actorId, sessionId) {
  return expectSuccess(
    await admin.rpc('resolve_people_targets_observed', {
      p_actor_user_id: actorId,
      p_phone_e164_list: [phoneA, phoneB],
      p_discovery_session_id: sessionId,
    }),
    'Registering local discovery observations',
  );
}

function verifyPayload(event, allowedWatchIds) {
  // Realtime can add its own message id to the payload after the SQL broadcast.
  assert.ok(
    Object.keys(event.payload).every((key) =>
      ['id', 'eventId', 'sentAt', 'watchIds'].includes(key),
    ),
    'Unexpected discovery payload fields.',
  );
  assert.ok(event.payload.eventId && event.payload.sentAt && Array.isArray(event.payload.watchIds));
  assert.ok(
    event.payload.watchIds.every((id) => allowedWatchIds.includes(id)),
    'Received another owner’s watch.',
  );
  const serialized = JSON.stringify(event.payload);
  assert.ok(!serialized.includes(phoneA) && !serialized.includes(phoneB), 'A phone was broadcast.');
}

try {
  console.log('Preparing isolated Realtime fixtures and private subscriptions.');
  const fixtures = [];
  for (let index = 0; index < 4; index += 1) fixtures.push(await createFixtureUser(index));
  const [first, second, outsider, target] = fixtures;
  const fixtureIds = users.map(({ id }) => `'${id}'`).join(',');
  sql(`update public.user_profiles set account_access_state = 'active' where id in (${fixtureIds});
    update public.user_profiles set phone_e164 = '${phoneA}', phone_verified_at = now() where id = '${target.id}';`);

  const firstSub = subscribe(first.client, first.id);
  const secondSub = subscribe(second.client, second.id);
  const outsiderSub = subscribe(outsider.client, outsider.id);
  await Promise.all([firstSub.ready, secondSub.ready, outsiderSub.ready]);
  const forbiddenSub = subscribe(outsider.client, first.id, { denied: true });
  await forbiddenSub.ready;
  await outsider.client.removeChannel(forbiddenSub.channel);
  assert.equal(forbiddenSub.events.length, 0);

  const firstSession = randomUUID();
  const secondSession = randomUUID();
  const firstRows = await resolveObserved(first.id, firstSession);
  const secondRows = await resolveObserved(second.id, secondSession);
  const firstIds = firstRows.map((row) => row.discoveryWatchId);
  const secondIds = secondRows.map((row) => row.discoveryWatchId);
  assert.ok(firstIds.every(Boolean) && secondIds.every(Boolean));
  assert.ok(
    firstIds.every((id) => !secondIds.includes(id)),
    'Observers shared watch identifiers.',
  );
  assert.deepEqual(
    firstRows.map((row) => row.status),
    ['active_user', 'no_account'],
  );

  // These public clients must not bypass Edge authentication/rate limits via RPC.
  const blockedRpc = await outsider.client.rpc('resolve_people_targets_observed', {
    p_actor_user_id: first.id,
    p_phone_e164_list: [phoneA],
    p_discovery_session_id: firstSession,
  });
  assert.ok(blockedRpc.error, 'A client called the server-only observation RPC.');

  const latencies = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const waits = [firstSub.next(firstIds), secondSub.next(secondIds)];
    // Attach rejection handling before the synchronous local write blocks the loop.
    const delivered = Promise.all(waits);
    const startedAt = performance.now();
    const nextPhone = sample % 2 === 0 ? phoneB : phoneA;
    sql(`update public.user_profiles set phone_e164 = '${nextPhone}' where id = '${target.id}';`);
    const events = await delivered;
    events.forEach((event, index) => verifyPayload(event, index === 0 ? firstIds : secondIds));
    latencies.push(Math.max(...events.map((event) => event.receivedAt - startedAt)));
    const resolved = await resolveObserved(first.id, firstSession);
    assert.equal(resolved.find((row) => row.phoneE164 === nextPhone)?.status, 'active_user');
    assert.equal(resolved.find((row) => row.phoneE164 !== nextPhone)?.status, 'no_account');
  }
  // Give the unrelated channel a bounded window to detect accidental fan-out.
  await delay(500);
  assert.equal(outsiderSub.events.length, 0, 'An unrelated user received a discovery event.');
  const sorted = [...latencies].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  assert.ok(p95 < 3000, 'Local write-to-broadcast p95 exceeded the 3 second target.');
  console.log(
    JSON.stringify({
      result: 'passed',
      samples,
      legitimateObservers: 2,
      unrelatedEvents: 0,
      crossUserSubscription: 'denied',
      oldAndNewPhoneInvalidated: true,
      writeToBroadcastP95Ms: Math.round(p95),
      maximumMs: Math.round(sorted.at(-1)),
      measurement:
        'local SQL write start to authenticated WebSocket delivery; excludes mobile rendering',
    }),
  );
} catch (error) {
  console.error(`Local discovery Realtime test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const client of clients) {
    await client.removeAllChannels().catch(() => undefined);
    client.realtime.disconnect();
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id).catch(() => ({ error: true }));
    if (result.error) {
      // Only exact IDs and run-specific emails created by this invocation may be removed.
      sql(`delete from auth.users where id = '${user.id}' and email = '${user.email}';`);
    }
  }
  console.log(`Cleaned ${users.length} isolated fixture accounts.`);
}
