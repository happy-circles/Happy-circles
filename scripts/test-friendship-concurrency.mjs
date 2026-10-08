import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Deliberately restricted to the isolated validation container. This command
// never resolves linked projects, uses production credentials, or resets a DB.
const container = 'supabase_db_hc_friendship_validation';
const actor = randomUUID();
const recipient = randomUUID();
const suffix = `${Date.now()}`.slice(-9);
const actorPhone = `+579${suffix}1`;
const recipientPhone = `+579${suffix}2`;
const key = (name) => `concurrency-${actor}-${name}`;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

function sql(statement) {
  return new Promise((resolve, reject) => {
    const process = spawn(
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
    let error = '';
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    process.stderr.on('data', (data) => {
      error += data.toString();
    });
    process.on('error', reject);
    process.on('close', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(error || `psql exited ${code}`)),
    );
    process.stdin.end(
      `set client_min_messages = error; set lock_timeout = '5s'; set statement_timeout = '20s';\n${statement}\n`,
    );
  });
}

async function rpc(expression, hold = false) {
  const result = await sql(
    `begin; select ${expression}; ${hold ? 'select pg_sleep(0.15);' : ''} commit;`,
  );
  const line = result.split(/\r?\n/).find((value) => value.startsWith('{'));
  assert.ok(line, 'RPC did not return a JSON object');
  return JSON.parse(line);
}

const create = (sender, target, idempotencyKey, context = 'concurrency_test') =>
  `public.create_internal_friendship_invite(${literal(sender)}, ${literal(idempotencyKey)}, ${literal(target)}, ${literal(context)})`;
const cancel = (inviteId, idempotencyKey) =>
  `public.cancel_friendship_invite(${literal(actor)}, ${literal(idempotencyKey)}, ${literal(inviteId)})`;
const external = (idempotencyKey) =>
  `public.create_external_friendship_invite(${literal(actor)}, ${literal(idempotencyKey)}, 'remote', 'concurrency_test', 'Concurrency B', ${literal(recipientPhone)}, 'mobile')`;

async function clearPair() {
  // Only synthetic users created by this run; do not touch other local tests.
  await sql(`
    select public.cancel_friendship_invite(inviter_user_id, 'concurrency-clear-' || id, id)
    from public.friendship_invites
    where inviter_user_id in (${literal(actor)}, ${literal(recipient)})
      and status in ('pending_recipient', 'pending_claim', 'pending_sender_review');
    delete from public.relationships
    where user_low_id = least(${literal(actor)}::uuid, ${literal(recipient)}::uuid)
      and user_high_id = greatest(${literal(actor)}::uuid, ${literal(recipient)}::uuid);
  `);
}

async function assertTerminal(inviteId) {
  await sql(`do $$ declare v_status text; v_related boolean; begin
    select status::text into v_status from public.friendship_invites where id = ${literal(inviteId)};
    select exists (select 1 from public.relationships
      where user_low_id = least(${literal(actor)}::uuid, ${literal(recipient)}::uuid)
        and user_high_id = greatest(${literal(actor)}::uuid, ${literal(recipient)}::uuid)
        and status = 'active') into v_related;
    if v_status not in ('accepted', 'canceled') or v_related <> (v_status = 'accepted') then
      raise exception 'inconsistent terminal friendship state';
    end if;
  end $$;`);
}

async function waitForPhoneLock() {
  // Short-lived probe sessions release any successfully acquired lock on exit.
  // A false try-lock means the competing transaction has reached the fence.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const held = await sql(`select not pg_try_advisory_lock(hashtextextended(
      'contact-phone:' || encode(app_private.contact_phone_hmac(${literal(recipientPhone)}), 'hex'), 0));`);
    if (held === 't') return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Concurrent discovery transaction never acquired its phone lock');
}

function observedResolve(sessionId) {
  return `public.resolve_people_targets_observed(${literal(actor)}, array[${literal(recipientPhone)}], ${literal(sessionId)})`;
}

function readResolution(output) {
  const line = output.split(/\r?\n/).find((value) => value.startsWith('['));
  assert.ok(line, 'Observed resolver did not return JSON');
  return JSON.parse(line)[0];
}

try {
  await sql(`
    insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
    values
      (${literal(actor)}, 'authenticated', 'authenticated', ${literal(`concurrency-${actor}@example.com`)}, now(),
       '{"provider":"email","providers":["email"]}', '{"display_name":"Concurrency A"}'),
      (${literal(recipient)}, 'authenticated', 'authenticated', ${literal(`concurrency-${recipient}@example.com`)}, now(),
       '{"provider":"email","providers":["email"]}', '{"display_name":"Concurrency B"}');
    update public.user_profiles set account_access_state = 'active', phone_country_iso2 = 'CO',
      phone_country_calling_code = '+57',
      phone_national_number = case when id = ${literal(actor)} then ${literal(actorPhone.slice(3))} else ${literal(recipientPhone.slice(3))} end,
      phone_e164 = case when id = ${literal(actor)} then ${literal(actorPhone)} else ${literal(recipientPhone)} end
    where id in (${literal(actor)}, ${literal(recipient)});
  `);

  const crossed = await Promise.all([
    rpc(create(actor, recipient, key('cross-a')), true),
    rpc(create(recipient, actor, key('cross-b')), true),
  ]);
  assert.equal(crossed[0].inviteId, crossed[1].inviteId);
  assert.deepEqual(
    new Set(crossed.map((result) => result.friendshipDirection)),
    new Set(['incoming', 'outgoing']),
  );
  console.log('PASS simultaneous opposite requests reuse one invitation');

  await clearPair();
  const internal = await rpc(create(actor, recipient, key('accept-create')));
  await Promise.all([
    rpc(
      `public.respond_internal_friendship_invite(${literal(recipient)}, ${literal(key('accept'))}, ${literal(internal.inviteId)}, 'accept')`,
      true,
    ),
    rpc(cancel(internal.inviteId, key('cancel-accept')), true),
  ]);
  await assertTerminal(internal.inviteId);
  console.log('PASS concurrent internal acceptance and cancellation have one coherent winner');

  await clearPair();
  const link = await rpc(external(key('open-create')));
  await Promise.all([
    rpc(
      `public.get_friendship_invite_preview(${literal(recipient)}, ${literal(link.deliveryToken)})`,
      true,
    ),
    rpc(cancel(link.inviteId, key('cancel-open')), true),
    rpc(
      `public.claim_external_friendship_invite(${literal(recipient)}, ${literal(key('claim'))}, ${literal(link.deliveryToken)})`,
      true,
    ),
  ]);
  await assertTerminal(link.inviteId);
  console.log('PASS concurrent preview, claim and cancellation avoid lock inversion');

  await clearPair();
  const duplicateLinks = await Promise.all([
    rpc(external(key('same-external')), true),
    rpc(external(key('same-external')), true),
  ]);
  assert.equal(duplicateLinks[0].inviteId, duplicateLinks[1].inviteId);
  assert.equal(duplicateLinks[0].deliveryId, duplicateLinks[1].deliveryId);
  assert.equal(duplicateLinks[0].deliveryToken, duplicateLinks[1].deliveryToken);
  console.log('PASS concurrent external retries return the same delivery and bearer token');

  await clearPair();
  const pending = await rpc(create(actor, recipient, key('reminder-create')));
  await sql(
    `update public.friendship_invites set created_at = now() - interval '2 minutes' where id = ${literal(pending.inviteId)};`,
  );
  const reminders = await Promise.all([
    rpc(
      `public.remind_friendship_invite(${literal(actor)}, ${literal(key('reminder'))}, ${literal(pending.inviteId)})`,
      true,
    ),
    rpc(create(actor, recipient, key('reminder'), 'invite_requests_resend_pending'), true),
  ]);
  assert.deepEqual(
    new Set(reminders.map((result) => result.reminderStatus)),
    new Set(['queued', 'cooldown']),
  );
  console.log('PASS new and legacy reminder commands serialize without duplicate notices');

  await clearPair();
  await sql(
    `update public.user_profiles set account_access_state = 'needs_invite' where id = ${literal(recipient)};`,
  );
  const watchFirstSession = randomUUID();
  const watchFirst = sql(`begin;
    select pg_advisory_xact_lock(hashtextextended(
      'contact-phone:' || encode(app_private.contact_phone_hmac(${literal(recipientPhone)}), 'hex'), 0));
    select pg_sleep(1);
    select ${observedResolve(watchFirstSession)};
    commit;`);
  await waitForPhoneLock();
  const activationAfterWatch = sql(
    `update public.user_profiles set account_access_state = 'active' where id = ${literal(recipient)};`,
  );
  const [watchOutput] = await Promise.all([watchFirst, activationAfterWatch]);
  const beforeActivation = readResolution(watchOutput);
  assert.equal(beforeActivation.status, 'pending_activation');
  const signalExists = await sql(`select exists (
    select 1 from realtime.messages where event = 'contacts_changed' and topic = ${literal(`user:${actor}`)}
      and payload::text like ${literal(`%${beforeActivation.discoveryWatchId}%`)}
  );`);
  assert.equal(
    signalExists,
    't',
    'Activation after initial read must commit a private invalidation',
  );
  await sql(
    `select public.manage_contact_discovery(${literal(actor)}, ${literal(watchFirstSession)}, 'stop');`,
  );
  console.log('PASS activation after registration emits the matching private discovery signal');

  await sql(
    `update public.user_profiles set account_access_state = 'needs_invite' where id = ${literal(recipient)};`,
  );
  const activationFirst = sql(`begin;
    update public.user_profiles set account_access_state = 'active' where id = ${literal(recipient)};
    select pg_sleep(1);
    commit;`);
  await waitForPhoneLock();
  const afterActivationResolve = sql(`select ${observedResolve(randomUUID())};`);
  const [, activatedOutput] = await Promise.all([activationFirst, afterActivationResolve]);
  assert.equal(readResolution(activatedOutput).status, 'active_user');
  console.log('PASS registration during activation waits and returns the committed active profile');
  console.log('All friendship concurrency scenarios passed.');
} finally {
  await sql(`
    begin;
    delete from public.audit_events where actor_user_id in (${literal(actor)}, ${literal(recipient)});
    delete from public.idempotency_keys where actor_user_id in (${literal(actor)}, ${literal(recipient)});
    delete from public.friendship_invites where inviter_user_id in (${literal(actor)}, ${literal(recipient)});
    delete from public.ledger_accounts where owner_user_id in (${literal(actor)}, ${literal(recipient)});
    delete from public.relationships where user_low_id in (${literal(actor)}, ${literal(recipient)})
      and user_high_id in (${literal(actor)}, ${literal(recipient)});
    delete from auth.users where id in (${literal(actor)}, ${literal(recipient)});
    commit;
  `);
}
