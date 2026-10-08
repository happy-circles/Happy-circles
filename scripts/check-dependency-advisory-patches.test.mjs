import assert from 'node:assert/strict';
import { constants, generateKeyPairSync, privateEncrypt, sign, createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  appendFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { test } from 'node:test';
import { evaluateAdvisories } from './audit-dependencies.mjs';

const mobile = createRequire(resolve('apps/mobile/package.json'));
const expo = createRequire(mobile.resolve('expo/package.json'));
const cli = createRequire(expo.resolve('@expo/cli/package.json'));
const forge = cli('node-forge');
const ngrok = createRequire(mobile.resolve('@expo/ngrok/package.json'));
const got = createRequire(ngrok.resolve('got/package.json'));
const cacheable = createRequire(got.resolve('cacheable-request/package.json'));
const CachePolicy = cacheable('http-cache-semantics');
const metro = createRequire(cli.resolve('@expo/metro/package.json'));
const filemap = createRequire(metro.resolve('metro-file-map/package.json'));
const micromatch = createRequire(filemap.resolve('micromatch/package.json'));
const braces = micromatch('braces');

test('Forge accepts native RSA signatures and rejects garbage in nested DigestAlgorithm', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicExponent: 3,
  });
  const verifier = forge.pki.publicKeyFromPem(publicKey.export({ type: 'spki', format: 'pem' }));
  const message = Buffer.from('Happy Circles release signature regression');
  const digest = createHash('sha256').update(message).digest();
  assert.equal(
    verifier.verify(
      digest.toString('binary'),
      sign('sha256', message, privateKey).toString('binary'),
    ),
    true,
  );
  const asn1 = forge.asn1;
  const sequence = (children) =>
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children);
  const oid = () =>
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OID,
      false,
      asn1.oidToDer(forge.oids.sha256).getBytes(),
    );
  const nullValue = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '');
  const octets = (value) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, value);
  const encode = (algorithm) =>
    Buffer.from(
      asn1.toDer(sequence([sequence(algorithm), octets(digest.toString('binary'))])).getBytes(),
      'binary',
    );
  const signature = (algorithm) =>
    privateEncrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
      encode(algorithm),
    ).toString('binary');
  assert.equal(verifier.verify(digest.toString('binary'), signature([oid(), nullValue()])), true);
  assert.equal(verifier.verify(digest.toString('binary'), signature([oid()])), true);
  for (const algorithm of [
    [oid(), nullValue(), octets('unconsumed garbage')],
    [oid(), octets('unconsumed garbage')],
  ]) {
    assert.throws(
      () => verifier.verify(digest.toString('binary'), signature(algorithm)),
      /valid RSASSA-PKCS1-v1_5 DigestInfo/,
    );
  }
});

const request = (cacheControl) => ({
  url: 'https://example.test/account',
  method: 'GET',
  headers: { host: 'example.test', ...(cacheControl ? { 'cache-control': cacheControl } : {}) },
});
for (const [label, headers] of [
  [
    'shared Set-Cookie',
    {
      'set-cookie': 'session=belongs-to-another-user',
      'cache-control': 'max-age=600, stale-while-revalidate=600, stale-if-error=600',
    },
  ],
  [
    'proxy-revalidate',
    {
      'cache-control':
        'max-age=600, proxy-revalidate, stale-while-revalidate=600, stale-if-error=600',
    },
  ],
  [
    'no-cache',
    { 'cache-control': 'no-cache, max-age=600, stale-while-revalidate=600, stale-if-error=600' },
  ],
  [
    'private',
    { 'cache-control': 'private, max-age=600, stale-while-revalidate=600, stale-if-error=600' },
  ],
  [
    'no-store',
    { 'cache-control': 'no-store, max-age=600, stale-while-revalidate=600, stale-if-error=600' },
  ],
]) {
  test(`CachePolicy cannot expose ${label} through client max-stale or server stale directives`, () => {
    const policy = new CachePolicy(request(), { status: 200, headers });
    for (const directive of ['max-stale', 'max-stale=999999']) {
      const incoming = request(directive);
      assert.equal(policy.satisfiesWithoutRevalidation(incoming), false);
      assert.equal(policy.evaluateRequest(incoming).response, undefined);
      assert.equal(policy.evaluateRequest(incoming).revalidation.synchronous, true);
    }
    assert.equal(policy.useStaleWhileRevalidate(), false);
    const failedOrigin = policy.revalidatedPolicy(request(), { status: 500, headers: {} });
    assert.equal(failedOrigin.matches, false);
    assert.notEqual(failedOrigin.policy, policy);
  });
}
test('CachePolicy preserves ordinary expiry, public cookies and private browser caches', () => {
  const expired = new CachePolicy(request(), {
    status: 200,
    headers: { 'cache-control': 'public, max-age=1', age: '5' },
  });
  assert.equal(expired.satisfiesWithoutRevalidation(request('max-stale=60')), true);
  assert.equal(expired.satisfiesWithoutRevalidation(request()), false);
  const publicCookies = new CachePolicy(request(), {
    status: 200,
    headers: { 'cache-control': 'public, max-age=600', 'set-cookie': 'public-opt-in' },
  });
  assert.equal(publicCookies.satisfiesWithoutRevalidation(request()), true);
  const browser = new CachePolicy(
    request(),
    {
      status: 200,
      headers: { 'cache-control': 'private, max-age=600', 'set-cookie': 'browser-only' },
    },
    { shared: false },
  );
  assert.equal(browser.satisfiesWithoutRevalidation(request()), true);
});

test('Braces rejects deeply nested strings and ASTs before stack exhaustion', () => {
  const pattern = '{'.repeat(4000) + 'a,b' + '}'.repeat(4000);
  assert.ok(pattern.length < 10000);
  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    assert.throws(() => braces[method](pattern), { name: 'SyntaxError', message: /safe depth/ });
  }
  const parentheses = '('.repeat(4000) + 'a' + ')'.repeat(4000);
  assert.throws(() => braces.compile(parentheses), { name: 'SyntaxError', message: /safe depth/ });
  for (const method of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'end', nodes: [] };
    for (let depth = 0; depth < 4000; depth++) {
      const parent = { type: 'root', nodes: [ast] };
      ast.parent = parent;
      ast = parent;
    }
    assert.throws(() => braces[method](ast), { name: 'SyntaxError', message: /safe depth/ });
  }
});
test('Braces preserves common Metro globs, nested choices and numeric ranges', () => {
  assert.equal(braces.compile('src/{app,lib}/**/*.{js,ts}'), 'src/(app|lib)/**/*.(js|ts)');
  assert.deepEqual(braces.expand('v{1..3}/{a,{b,c}}'), [
    'v1/a',
    'v1/b',
    'v1/c',
    'v2/a',
    'v2/b',
    'v2/c',
    'v3/a',
    'v3/b',
    'v3/c',
  ]);
  assert.equal(braces.stringify(braces.parse('x/{a,{b,c}}')), 'x/{a,{b,c}}');
});

const advisory = (id, name, version) => ({
  github_advisory_id: id,
  module_name: name,
  findings: [{ version }],
});
const fixtures = [
  advisory('GHSA-86w9-cpqp-85rv', 'node-forge', '1.4.0'),
  advisory('GHSA-ch52-4w7c-c8xp', 'http-cache-semantics', '4.2.0'),
  advisory('GHSA-vfj7-8cjw-p6xm', 'braces', '3.0.3'),
];
test('Audit exceptions require exact package/version and reject unknown advisories', () => {
  assert.equal(evaluateAdvisories(fixtures).allowed.length, 3);
  for (const fixture of fixtures) {
    assert.deepEqual(
      evaluateAdvisories([{ ...fixture, module_name: 'different-package' }])
        .invalidPatchedAdvisories,
      [fixture.github_advisory_id],
    );
    assert.deepEqual(
      evaluateAdvisories([{ ...fixture, findings: [{ version: '0.0.0' }] }])
        .invalidPatchedAdvisories,
      [fixture.github_advisory_id],
    );
    assert.deepEqual(evaluateAdvisories([{ ...fixture, findings: [] }]).invalidPatchedAdvisories, [
      fixture.github_advisory_id,
    ]);
  }
  assert.deepEqual(
    evaluateAdvisories([advisory('GHSA-new-unreviewed', 'node-forge', '1.4.0')])
      .unexpectedAdvisories,
    ['GHSA-new-unreviewed'],
  );
});
test('Audit rejects changed patch bytes or missing pnpm patch configuration', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'happy-circles-patch-policy-'));
  try {
    mkdirSync(join(scratch, 'patches'));
    const fixture = fixtures[0];
    const filename = 'node-forge@1.4.0.patch';
    copyFileSync(resolve('patches', filename), join(scratch, 'patches', filename));
    writeFileSync(
      join(scratch, 'pnpm-workspace.yaml'),
      `patchedDependencies:\n  node-forge@1.4.0: patches/${filename}\n`,
    );
    assert.equal(evaluateAdvisories([fixture], scratch).allowed.length, 1);
    appendFileSync(join(scratch, 'patches', filename), '\n# modified after review\n');
    assert.deepEqual(evaluateAdvisories([fixture], scratch).invalidPatchedAdvisories, [
      fixture.github_advisory_id,
    ]);
    copyFileSync(resolve('patches', filename), join(scratch, 'patches', filename));
    writeFileSync(join(scratch, 'pnpm-workspace.yaml'), 'patchedDependencies: {}\n');
    assert.deepEqual(evaluateAdvisories([fixture], scratch).invalidPatchedAdvisories, [
      fixture.github_advisory_id,
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
