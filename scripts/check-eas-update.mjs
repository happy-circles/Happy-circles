import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobileRoot = resolve(root, 'apps/mobile');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const require = createRequire(resolve(mobileRoot, 'package.json'));
const expoRequire = createRequire(require.resolve('expo/package.json'));
const { satisfies } = expoRequire('semver');

function nativeMetadata(manifest, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return manifest.match(new RegExp(`android:name="${escapedName}" android:value="([^"]*)"`))?.[1];
}

export function readUpdateConfiguration() {
  const { getConfig } = expoRequire('@expo/config');
  return {
    config: getConfig(mobileRoot).exp,
    policy: readJson(resolve(mobileRoot, 'update-policy.json')),
    eas: readJson(resolve(mobileRoot, 'eas.json')),
    manifest: readFileSync(resolve(mobileRoot, 'android/app/src/main/AndroidManifest.xml'), 'utf8'),
    strings: readFileSync(
      resolve(mobileRoot, 'android/app/src/main/res/values/strings.xml'),
      'utf8',
    ),
    dependencies: readJson(resolve(mobileRoot, 'package.json')).dependencies,
    bundledNativeModules: expoRequire('expo/bundledNativeModules.json'),
    installedUpdatesVersion: require('expo-updates/package.json').version,
  };
}

export function validateUpdateConfiguration({
  config,
  policy,
  eas,
  manifest,
  strings,
  dependencies,
  bundledNativeModules,
  installedUpdatesVersion,
  targetName,
  expectedRuntime,
  environment,
}) {
  assert.equal(typeof policy.runtimeVersion, 'string', 'Runtime must be an explicit string.');
  assert.ok(policy.runtimeVersion.length > 0, 'Runtime cannot be empty.');
  assert.equal(
    config.runtimeVersion,
    policy.runtimeVersion,
    'App runtime differs from update policy.',
  );
  assert.equal(config.extra?.eas?.projectId, policy.projectId, 'EAS project differs from policy.');
  const updateUrl = `https://u.expo.dev/${policy.projectId}`;
  assert.equal(config.updates?.url, updateUrl, 'Update URL differs from the EAS project.');
  assert.equal(config.updates?.enabled, true, 'Updates must be enabled.');
  assert.equal(config.updates?.checkAutomatically, 'ON_LOAD', 'Updates must check at launch.');
  assert.equal(config.updates?.fallbackToCacheTimeout, 0, 'Startup must not wait for the network.');
  assert.equal(config.updates?.useEmbeddedUpdate, true, 'An offline embedded bundle is required.');
  assert.ok(
    satisfies(installedUpdatesVersion, bundledNativeModules['expo-updates']) &&
      satisfies(installedUpdatesVersion, dependencies['expo-updates']),
    'Run expo install expo-updates for the installed SDK.',
  );

  assert.equal(nativeMetadata(manifest, 'expo.modules.updates.ENABLED'), 'true');
  assert.equal(nativeMetadata(manifest, 'expo.modules.updates.EXPO_UPDATE_URL'), updateUrl);
  assert.equal(
    nativeMetadata(manifest, 'expo.modules.updates.EXPO_RUNTIME_VERSION'),
    '@string/expo_runtime_version',
  );
  assert.equal(
    nativeMetadata(manifest, 'expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH'),
    'ALWAYS',
  );
  assert.equal(nativeMetadata(manifest, 'expo.modules.updates.EXPO_UPDATES_LAUNCH_WAIT_MS'), '0');
  assert.equal(
    strings.match(/<string name="expo_runtime_version">([^<]+)<\/string>/)?.[1],
    policy.runtimeVersion,
    'Checked-in Android runtime differs from app configuration.',
  );

  for (const [name, target] of Object.entries(policy.targets)) {
    const profile = eas.build[target.buildProfile];
    assert.equal(profile?.channel, target.channel, `${name}: build channel differs from policy.`);
    assert.equal(
      profile?.environment,
      target.environment,
      `${name}: build environment differs from policy.`,
    );
  }
  assert.notEqual(policy.targets.preview.channel, policy.targets.production.channel);
  assert.notEqual(policy.targets['production-smoke'].channel, policy.targets.production.channel);
  assert.notEqual(
    policy.targets.preview.supabaseProjectRef,
    policy.targets.production.supabaseProjectRef,
  );
  assert.equal(eas.build.development.environment, 'preview');
  assert.equal(eas.build.development.channel, 'preview');

  if (targetName) {
    const target = policy.targets[targetName];
    assert.ok(target, 'Unknown update target.');
    assert.equal(
      expectedRuntime,
      policy.runtimeVersion,
      'Expected runtime differs; select a matching installed build.',
    );
    assert.equal(environment, target.environment, 'Selected EAS environment differs from target.');
    assert.equal(
      config.extra?.supabaseUrl,
      `https://${target.supabaseProjectRef}.supabase.co`,
      'Supabase URL does not match the selected update target.',
    );
    assert.ok(
      config.extra?.supabaseAnonKey?.trim(),
      'The selected EAS environment is missing a public Supabase key.',
    );
    const publicKey = config.extra.supabaseAnonKey;
    if (!publicKey.startsWith('sb_publishable_')) {
      let payload;
      try {
        payload = JSON.parse(Buffer.from(publicKey.split('.')[1] ?? '', 'base64url').toString());
      } catch {
        throw new Error('The Supabase key must be an anon JWT or a publishable key.');
      }
      assert.ok(payload.role === 'anon', 'Only a public anon Supabase key may be bundled.');
      assert.ok(
        payload.ref === target.supabaseProjectRef,
        'Public Supabase key belongs to a different project.',
      );
    }
  }
  return {
    runtimeVersion: policy.runtimeVersion,
    projectId: policy.projectId,
    ...(targetName ? { target: targetName, ...policy.targets[targetName] } : {}),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        target: { type: 'string' },
        environment: { type: 'string' },
        'expected-runtime': { type: 'string' },
      },
    });
    const result = validateUpdateConfiguration({
      ...readUpdateConfiguration(),
      targetName: values.target,
      environment: values.environment,
      expectedRuntime: values['expected-runtime'],
    });
    console.log('EAS Update configuration verified:', JSON.stringify(result));
  } catch (error) {
    // Do not serialize config: it contains environment keys.
    console.error(`EAS Update check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
