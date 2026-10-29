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
import { pathToFileURL } from 'node:url';
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
const shared = createRequire(resolve('packages/shared/package.json'));
const zodRoot = resolve(shared.resolve('zod/package.json'), '..');
const zodRequire = createRequire(join(zodRoot, 'package.json'));
const expoConfig = createRequire(expo.resolve('@expo/config/package.json'));
const deepmergeRoot = resolve(expoConfig.resolve('deepmerge/package.json'), '..');
const deepmergeRequire = createRequire(join(deepmergeRoot, 'package.json'));
const deepmergeModules = [
  ['Expo config CommonJS', expoConfig('deepmerge')],
  ['UMD CommonJS', deepmergeRequire('./dist/umd.js')],
];

for (const [name, merge] of deepmergeModules) {
  test(`Deepmerge ${name} rejects prototype keys from source and target shapes`, () => {
    const poisoned = () => JSON.parse('{"__proto__":{"qaInjected":true},"safe":1}');
    const cases = [
      [Object.create(null), poisoned()],
      [poisoned(), {}],
      [poisoned(), poisoned()],
      [null, poisoned()],
      [undefined, poisoned()],
      [false, poisoned()],
      [7, poisoned()],
    ];
    for (const [target, source] of cases) {
      const result = merge(target, source);
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.equal(Object.hasOwn(result, '__proto__'), false);
      assert.equal(result.qaInjected, undefined);
      assert.equal(result.safe, 1);
    }
    assert.equal({}.qaInjected, undefined);
  });

  test(`Deepmerge ${name} protects nested placeholder merges and array clones`, () => {
    for (const placeholder of [null, undefined, false, 7, 'placeholder', Object.create(null)]) {
      const source = JSON.parse('{"session":{"__proto__":{"qaInjected":true},"safe":2}}');
      const result = merge({ session: placeholder }, source);
      assert.equal(Object.getPrototypeOf(result.session), Object.prototype);
      assert.equal(result.session.qaInjected, undefined);
      assert.equal(Object.hasOwn(result.session, '__proto__'), false);
      assert.equal(result.session.safe, 2);
    }
    const input = [JSON.parse('{"__proto__":{"qaInjected":true},"safe":3}')];
    const result = merge([], input);
    assert.notEqual(result[0], input[0]);
    assert.equal(Object.getPrototypeOf(result[0]), Object.prototype);
    assert.equal(result[0].qaInjected, undefined);
    assert.equal(result[0].safe, 3);
  });

  test(`Deepmerge ${name} ignores forbidden getters before copying either input`, () => {
    const target = { fromTarget: true };
    const source = { fromSource: true };
    for (const input of [target, source]) {
      Object.defineProperty(input, '__proto__', {
        enumerable: true,
        get() {
          throw new Error('Forbidden prototype getter must not be evaluated');
        },
      });
    }
    assert.deepEqual(merge(target, source), { fromTarget: true, fromSource: true });
  });

  test(`Deepmerge ${name} preserves Expo config arrays, symbols and custom merges`, () => {
    const targetSymbol = Symbol('target config');
    const sourceSymbol = Symbol('source config');
    const target = {
      plugins: [['existing-plugin', { enabled: true }]],
      extra: { environment: 'production', retained: true },
      [targetSymbol]: { retained: true },
    };
    const source = {
      plugins: ['new-plugin'],
      extra: { environment: 'preview', added: 2 },
      [sourceSymbol]: { added: true },
    };
    const result = merge(target, source);
    assert.deepEqual(result.plugins, [['existing-plugin', { enabled: true }], 'new-plugin']);
    assert.deepEqual(result.extra, { environment: 'preview', retained: true, added: 2 });
    assert.notEqual(result.plugins[0], target.plugins[0]);
    assert.equal(target.extra.environment, 'production');
    assert.deepEqual(result[targetSymbol], { retained: true });
    assert.deepEqual(result[sourceSymbol], { added: true });
    const custom = merge(target, source, {
      customMerge: (key) =>
        key === 'plugins' ? (_target, incoming) => incoming.slice() : undefined,
    });
    assert.deepEqual(custom.plugins, ['new-plugin']);
    assert.deepEqual(merge.all([{ extra: { first: true } }, { extra: { second: true } }]), {
      extra: { first: true, second: true },
    });
    const plainData = merge(
      Object.create(null),
      JSON.parse('{"constructor":{"safe":true},"prototype":{"safe":true}}'),
    );
    assert.deepEqual(plainData.constructor, { safe: true });
    assert.deepEqual(plainData.prototype, { safe: true });
    assert.equal(Object.getPrototypeOf(plainData), Object.prototype);
  });
}

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
  advisory('GHSA-gcqx-w48m-w2h4', 'deepmerge', '4.3.1'),
  advisory('GHSA-mrhx-c7xc-m3w5', 'zod', '3.25.76'),
  advisory('GHSA-86w9-cpqp-85rv', 'node-forge', '1.4.0'),
  advisory('GHSA-ch52-4w7c-c8xp', 'http-cache-semantics', '4.2.0'),
  advisory('GHSA-vfj7-8cjw-p6xm', 'braces', '3.0.3'),
];
test('Audit exceptions require exact package/version and reject unknown advisories', () => {
  assert.equal(evaluateAdvisories(fixtures).allowed.length, fixtures.length);
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
    assert.deepEqual(
      evaluateAdvisories([{ ...fixture, findings: [...fixture.findings, { version: '0.0.0' }] }])
        .invalidPatchedAdvisories,
      [fixture.github_advisory_id],
    );
  }
  assert.deepEqual(
    evaluateAdvisories([advisory('GHSA-new-unreviewed', 'node-forge', '1.4.0')])
      .unexpectedAdvisories,
    ['GHSA-new-unreviewed'],
  );
});
for (const fixture of fixtures) {
  test(`Audit rejects changed patch bytes or missing pnpm patch configuration for ${fixture.module_name}`, () => {
    const scratch = mkdtempSync(join(tmpdir(), 'happy-circles-patch-policy-'));
    try {
      mkdirSync(join(scratch, 'patches'));
      const filename = `${fixture.module_name}@${fixture.findings[0].version}.patch`;
      copyFileSync(resolve('patches', filename), join(scratch, 'patches', filename));
      writeFileSync(
        join(scratch, 'pnpm-workspace.yaml'),
        `patchedDependencies:\n  ${fixture.module_name}@${fixture.findings[0].version}: patches/${filename}\n`,
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
}

const zodModules = [
  ['v3 CommonJS', zodRequire('./index.cjs').z],
  ['v3 ESM', (await import(pathToFileURL(join(zodRoot, 'index.js')).href)).z],
  ['v4 CommonJS', zodRequire('./v4/index.cjs').z],
  ['v4 ESM', (await import(pathToFileURL(join(zodRoot, 'v4/index.js')).href)).z],
];

for (const [name, z] of zodModules) {
  test(`Zod ${name} rejects oversized bounded collections without reading their elements`, async () => {
    let walked = 0;
    let refined = 0;
    const element = z.preprocess((value) => {
      walked += 1;
      return value;
    }, z.string());
    for (const [schema, input] of [
      [
        z
          .array(element)
          .max(2, 'bounded')
          .refine(() => ++refined),
        Array(1000).fill(0),
      ],
      [z.array(element).length(2, 'bounded'), Array(1000).fill(0)],
      [
        z
          .set(element)
          .max(2, 'bounded')
          .refine(() => ++refined),
        new Set(Array.from({ length: 1000 }, (_, i) => i)),
      ],
      [z.set(element).size(2, 'bounded'), new Set(Array.from({ length: 1000 }, (_, i) => i))],
    ]) {
      for (const result of [schema.safeParse(input), await schema.safeParseAsync(input)]) {
        assert.equal(result.success, false);
        assert.equal(result.error.issues.length, 1);
        assert.equal(result.error.issues[0].code, 'too_big');
        assert.equal(result.error.issues[0].maximum, 2);
        assert.equal(result.error.issues[0].message, 'bounded');
      }
    }
    assert.equal(walked, 0);
    assert.equal(refined, 0);
  });

  test(`Zod ${name} preserves valid, unbounded, nested and transformed collection behavior`, async () => {
    const element = z.string().transform((value) => value.toUpperCase());
    assert.deepEqual(z.array(element).max(2).parse(['a', 'b']), ['A', 'B']);
    assert.deepEqual(await z.array(element).length(2).parseAsync(['a', 'b']), ['A', 'B']);
    assert.deepEqual(
      z
        .set(element)
        .size(2)
        .parse(new Set(['a', 'b'])),
      new Set(['A', 'B']),
    );
    assert.deepEqual(
      await z.map(z.string(), element).parseAsync(new Map([['a', 'b']])),
      new Map([['a', 'B']]),
    );
    assert.deepEqual(z.array(z.number()).parse([1, 2, 3]), [1, 2, 3]);
    assert.equal(
      z.array(z.string()).max(1).safeParse('wrong').error.issues[0].code,
      'invalid_type',
    );
    assert.equal(z.array(z.string()).length(2).safeParse(['a']).error.issues[0].code, 'too_small');
    const nested = z
      .object({ items: z.array(element).max(2) })
      .safeParse({ items: Array(1000).fill(0) });
    assert.equal(nested.success, false);
    assert.equal(nested.error.issues.length, 1);
    assert.deepEqual(nested.error.issues[0].path, ['items']);
    let asyncWalked = 0;
    const asyncElement = z.string().transform(async (value) => {
      asyncWalked += 1;
      return value.toUpperCase();
    });
    assert.deepEqual(await z.array(asyncElement).max(2).parseAsync(['a', 'b']), ['A', 'B']);
    assert.equal(asyncWalked, 2);
    asyncWalked = 0;
    assert.equal(
      (await z.array(asyncElement).max(2).safeParseAsync(['a', 'b', 'c'])).success,
      false,
    );
    assert.equal(asyncWalked, 0);
  });

  if (name.startsWith('v4')) {
    test(`Zod ${name} caps existing map size checks and respects preceding value rewrites`, async () => {
      let walked = 0;
      const element = z.preprocess((value) => {
        walked += 1;
        return value;
      }, z.string());
      const schema = z.map(element, element).check(z.maxSize(2));
      const input = new Map(Array.from({ length: 1000 }, (_, i) => [i, i]));
      for (const result of [schema.safeParse(input), await schema.safeParseAsync(input)]) {
        assert.equal(result.success, false);
        assert.equal(result.error.issues.length, 1);
        assert.equal(result.error.issues[0].code, 'too_big');
      }
      assert.equal(walked, 0);
      assert.deepEqual(schema.parse(new Map([['a', 'b']])), new Map([['a', 'b']]));
      assert.deepEqual(
        z
          .array(z.number())
          .overwrite((value) => value.slice(0, 2))
          .max(2)
          .parse([1, 2, 3]),
        [1, 2],
      );
      assert.deepEqual(
        z
          .array(z.number())
          .max(3)
          .overwrite((value) => value.slice(0, 2))
          .max(2)
          .parse([1, 2, 3]),
        [1, 2],
      );
    });
  }
}
