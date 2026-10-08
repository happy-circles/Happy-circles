import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Requires functions serve against .tmp/friendship-validation. This script only
// permits the isolated local stack and creates/removes its own synthetic users.
// It does not deliver notifications to real devices or change linked projects.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/mobile/package.json'));
const { createClient } = require('@supabase/supabase-js');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const spawn = expoRequire('cross-spawn');
const apiUrl = 'http://127.0.0.1:55371';
const container = 'supabase_db_hc_friendship_validation';
const workdir = resolve(root, '.tmp/friendship-validation');
const runId = randomUUID();
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const key = (name) => `edge-${runId}-${name}`;
const users = [];

function docker(args, input) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim();
  } catch {
    throw new Error('Isolated Docker operation failed; credentials and fixture data omitted.');
  }
}

const inspected = JSON.parse(docker(['inspect', container]))[0];
assert.equal(inspected.Name, `/${container}`);
assert.ok(inspected.State.Running);
assert.ok(inspected.NetworkSettings.Ports['5432/tcp']?.some((item) => item.HostPort === '55372'));

function sql(statement) {
  return docker(
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
    `set client_min_messages=error; set statement_timeout='20s'; ${statement}`,
  );
}

function localKeys() {
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
  assert.equal(result.status, 0, 'Cannot read isolated CLI status; no keys were printed.');
  const status = JSON.parse(result.stdout);
  assert.equal(new URL(status.API_URL).port, '55371');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(status.API_URL).hostname));
  assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);
  return { anon: status.ANON_KEY, service: status.SERVICE_ROLE_KEY };
}

const keys = localKeys();
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const admin = createClient(apiUrl, keys.service, options);

async function fixture(index) {
  const email = `hc-edge-${runId}-${index}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Edge fixture' },
  });
  assert.ok(!created.error && created.data.user?.id, 'Could not create local fixture.');
  const id = created.data.user.id;
  users.push(id);
  const client = createClient(apiUrl, keys.anon, options);
  const auth = await client.auth.signInWithPassword({ email, password });
  assert.ok(
    !auth.error && auth.data.session?.access_token,
    'Could not authenticate local fixture.',
  );
  const phone = `+1999${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
  sql(
    `update public.user_profiles set display_name='Edge fixture', phone_e164=${literal(phone)}, phone_verified_at=now(), account_access_state='active' where id=${literal(id)};`,
  );
  return { id, phone, token: auth.data.session.access_token };
}

async function call(name, user, body, expected = 200) {
  const response = await fetch(`${apiUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: keys.anon,
      'content-type': 'application/json',
      ...(user ? { authorization: `Bearer ${user.token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    expected,
    `${name}: expected HTTP ${expected}, got ${response.status} (${data.code ?? 'no code'})`,
  );
  return data;
}

function pushCount(inviteId) {
  return Number(
    sql(
      `select count(*) from public.push_notification_events where source_item_id=${literal(inviteId)};`,
    ),
  );
}

try {
  const actor = await fixture(0);
  const recipient = await fixture(1);
  const outsider = await fixture(2);
  await call('resolve-people-targets', null, { phoneE164List: [recipient.phone] }, 401);
  const phones = Array.from(
    { length: 61 },
    (_, index) => `+1999555${String(index).padStart(7, '0')}`,
  );
  await call('resolve-people-targets', actor, { phoneE164List: phones }, 400);
  await call(
    'resolve-people-targets',
    actor,
    { phoneE164List: [recipient.phone], discoverySessionId: 'bad' },
    400,
  );
  const session = randomUUID();
  const resolved = await call('resolve-people-targets', actor, {
    phoneE164List: [recipient.phone, ...phones.slice(0, 59)],
    discoverySessionId: session,
  });
  assert.equal(resolved.length, 60);
  assert.equal(resolved[0].status, 'active_user');
  assert.ok(resolved.every((target) => typeof target.discoveryWatchId === 'string'));
  assert.ok(resolved[0].availableActions.includes('add'));
  console.log(
    'PASS Edge resolver: authenticated, max 60, UUID validation, private watches, actions',
  );

  await call(
    'register-contact-discovery',
    null,
    { phoneE164List: [recipient.phone], discoverySessionId: session },
    401,
  );
  await call(
    'register-contact-discovery',
    actor,
    { phoneE164List: phones, discoverySessionId: session },
    400,
  );
  await call('register-contact-discovery', actor, { phoneE164List: [recipient.phone] }, 400);
  await call(
    'register-contact-discovery',
    actor,
    { phoneE164List: [recipient.phone], discoverySessionId: 'bad' },
    400,
  );
  const registered = await call('register-contact-discovery', actor, {
    phoneE164List: [recipient.phone, ...phones.slice(0, 59)],
    discoverySessionId: session,
  });
  assert.equal(registered.status, 'registered');
  assert.equal(registered.discoverySessionId, session);
  assert.equal(registered.watches.length, 60);
  assert.ok(registered.expiresAt);
  assert.deepEqual(registered.watches[0], {
    phoneE164: recipient.phone,
    discoveryWatchId: resolved[0].discoveryWatchId,
  });
  assert.ok(registered.watches.every((watch) => Object.keys(watch).length === 2));
  const registeredReplay = await call('register-contact-discovery', actor, {
    phoneE164List: [recipient.phone],
    discoverySessionId: session,
  });
  assert.equal(
    registeredReplay.watches[0].discoveryWatchId,
    registered.watches[0].discoveryWatchId,
  );
  const outsiderRegistered = await call('register-contact-discovery', outsider, {
    actorUserId: actor.id,
    phoneE164List: [recipient.phone],
    discoverySessionId: session,
  });
  assert.notEqual(
    outsiderRegistered.watches[0].discoveryWatchId,
    registered.watches[0].discoveryWatchId,
  );
  await call('manage-contact-discovery', outsider, {
    discoverySessionId: session,
    action: 'stop',
  });
  console.log(
    'PASS Edge registration: authenticated, max 60, required UUID, stable watches, no resolved data, scoped actor',
  );

  const removeBody = {
    discoverySessionId: session,
    action: 'remove',
    watchIds: [registered.watches[1].discoveryWatchId],
  };
  await call('manage-contact-discovery', null, removeBody, 401);
  await call('manage-contact-discovery', actor, { ...removeBody, watchIds: [] }, 400);
  await call('manage-contact-discovery', actor, { ...removeBody, watchIds: ['not-a-watch'] }, 400);
  await call(
    'manage-contact-discovery',
    actor,
    { ...removeBody, watchIds: Array(61).fill(registered.watches[1].discoveryWatchId) },
    400,
  );
  assert.equal(
    (await call('manage-contact-discovery', outsider, { ...removeBody, actorUserId: actor.id }))
      .removedWatchCount,
    0,
  );
  assert.equal((await call('manage-contact-discovery', actor, removeBody)).removedWatchCount, 1);
  assert.equal((await call('manage-contact-discovery', actor, removeBody)).removedWatchCount, 0);
  assert.equal(
    sql(`select count(*) from app_private.contact_discovery_watches
         where id=${literal(registered.watches[0].discoveryWatchId)};`),
    '1',
  );
  console.log(
    'PASS Edge pruning: bounded UUIDs, scoped actor, idempotent delete, remaining watch preserved',
  );

  await call(
    'manage-contact-discovery',
    null,
    { discoverySessionId: session, action: 'renew' },
    401,
  );
  await call(
    'manage-contact-discovery',
    actor,
    { discoverySessionId: session, action: 'invalid' },
    400,
  );
  assert.equal(
    (
      await call('manage-contact-discovery', outsider, {
        actorUserId: actor.id,
        discoverySessionId: session,
        action: 'renew',
      })
    ).status,
    'expired',
  );
  assert.equal(
    (
      await call('manage-contact-discovery', outsider, {
        actorUserId: actor.id,
        discoverySessionId: session,
        action: 'stop',
      })
    ).status,
    'stopped',
  );
  assert.equal(
    sql(
      `select count(*) from app_private.contact_discovery_sessions where owner_user_id=${literal(actor.id)} and session_id=${literal(session)};`,
    ),
    '1',
  );
  assert.equal(
    (
      await call('manage-contact-discovery', actor, {
        discoverySessionId: session,
        action: 'renew',
      })
    ).status,
    'renewed',
  );
  console.log('PASS Edge discovery ownership: a forged actor cannot renew or stop another session');

  const outreachBody = {
    idempotencyKey: key('outreach'),
    channel: 'remote',
    intendedRecipientPhoneE164: recipient.phone,
    intendedRecipientAlias: 'Edge fixture',
    sourceContext: 'edge_smoke',
  };
  const outreach = await call('create-people-outreach', actor, outreachBody);
  assert.equal(outreach.kind, 'friendship');
  assert.ok(outreach.inviteId);
  assert.equal(pushCount(outreach.inviteId), 1);
  assert.equal(
    (await call('create-people-outreach', actor, outreachBody)).inviteId,
    outreach.inviteId,
  );
  assert.equal(pushCount(outreach.inviteId), 1);
  const incoming = await call('resolve-people-targets', recipient, {
    phoneE164List: [actor.phone],
  });
  assert.equal(incoming[0].friendshipDirection, 'incoming');
  assert.ok(incoming[0].availableActions.includes('accept'));
  console.log(
    'PASS Edge outreach: committed invitation plus one atomic push event, idempotent replay',
  );

  const remindBody = { idempotencyKey: key('reminder-initial'), inviteId: outreach.inviteId };
  assert.equal(
    (await call('remind-friendship-invite', actor, remindBody)).reminderStatus,
    'cooldown',
  );
  await call(
    'remind-friendship-invite',
    outsider,
    { ...remindBody, idempotencyKey: key('reminder-forbidden') },
    403,
  );
  sql(
    `update public.friendship_invites set created_at=now()-interval '2 minutes' where id=${literal(outreach.inviteId)};`,
  );
  const reminder = await call('remind-friendship-invite', actor, {
    ...remindBody,
    idempotencyKey: key('reminder-queued'),
  });
  assert.equal(reminder.reminderStatus, 'queued');
  assert.ok(reminder.reminderId);
  assert.equal(
    (
      await call('remind-friendship-invite', actor, {
        ...remindBody,
        idempotencyKey: key('reminder-queued'),
      })
    ).reminderId,
    reminder.reminderId,
  );
  assert.equal(
    (
      await call('remind-friendship-invite', actor, {
        ...remindBody,
        idempotencyKey: key('reminder-cooldown'),
      })
    ).reminderStatus,
    'cooldown',
  );
  assert.equal(pushCount(outreach.inviteId), 2);
  console.log('PASS Edge reminders: ownership, cooldown, real outbox request, deduplicated replay');

  const cancelBody = { idempotencyKey: key('cancel'), inviteId: outreach.inviteId };
  await call('cancel-friendship-invite', outsider, { ...cancelBody, actorUserId: actor.id }, 403);
  assert.equal((await call('cancel-friendship-invite', actor, cancelBody)).status, 'canceled');
  assert.equal(
    (
      await call('cancel-friendship-invite', actor, {
        ...cancelBody,
        idempotencyKey: key('cancel-repeat'),
      })
    ).status,
    'canceled',
  );
  assert.equal(
    (
      await call('remind-friendship-invite', actor, {
        ...remindBody,
        idempotencyKey: key('reminder-resolved'),
      })
    ).reminderStatus,
    'resolved',
  );
  assert.equal(
    sql(
      `select count(*) from public.push_notification_events where source_item_id=${literal(outreach.inviteId)} and (status in ('pending','processing') or public.friendship_push_event_is_current(id));`,
    ),
    '0',
  );
  const afterCancel = await call('create-people-outreach', actor, {
    ...outreachBody,
    idempotencyKey: key('after-cancel'),
  });
  assert.notEqual(afterCancel.inviteId, outreach.inviteId);
  assert.equal(
    (
      await call('respond-internal-friendship-invite', recipient, {
        idempotencyKey: key('reject'),
        inviteId: afterCancel.inviteId,
        decision: 'reject',
      })
    ).status,
    'rejected',
  );
  const afterReject = await call('create-people-outreach', actor, {
    ...outreachBody,
    idempotencyKey: key('after-reject'),
  });
  assert.notEqual(afterReject.inviteId, afterCancel.inviteId);
  await call('cancel-friendship-invite', actor, {
    idempotencyKey: key('cancel-final'),
    inviteId: afterReject.inviteId,
  });
  console.log(
    'PASS Edge cancellation: terminal idempotence, stale pushes suppressed, immediate cancel/reject resend',
  );

  const externalBody = { ...outreachBody, idempotencyKey: key('external') };
  const external = await call('create-external-friendship-invite', actor, externalBody);
  const replay = await call('create-external-friendship-invite', actor, externalBody);
  assert.ok(external.deliveryToken);
  assert.equal(replay.deliveryToken, external.deliveryToken);
  assert.equal(replay.deliveryId, external.deliveryId);
  await call(
    'create-external-friendship-invite',
    actor,
    { ...externalBody, intendedRecipientAlias: 'Changed payload' },
    409,
  );
  await call('cancel-friendship-invite', actor, {
    idempotencyKey: key('external-cancel'),
    inviteId: external.inviteId,
  });
  await call('send-push-notifications', actor, {}, 503);
  assert.equal(
    (await call('manage-contact-discovery', actor, { discoverySessionId: session, action: 'stop' }))
      .status,
    'stopped',
  );
  console.log(
    'PASS Edge external replay: stable delivery/token, mismatched key rejected; push worker compiles and fails closed without secret',
  );
  console.log('All friendship Edge HTTP scenarios passed.');
} finally {
  if (users.length) {
    const ids = users.map(literal).join(',');
    sql(`begin;
      delete from public.audit_events where actor_user_id in (${ids});
      delete from public.idempotency_keys where actor_user_id in (${ids});
      delete from public.friendship_invites where inviter_user_id in (${ids});
      delete from public.ledger_accounts where owner_user_id in (${ids});
      delete from public.relationships where user_low_id in (${ids}) and user_high_id in (${ids});
      delete from auth.users where id in (${ids});
      commit;`);
    assert.equal(sql(`select count(*) from auth.users where id in (${ids});`), '0');
  }
}
