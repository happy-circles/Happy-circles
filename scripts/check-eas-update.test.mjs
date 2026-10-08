import assert from 'node:assert/strict';
import test from 'node:test';
import { readUpdateConfiguration, validateUpdateConfiguration } from './check-eas-update.mjs';

const base = readUpdateConfiguration();

function previewFixture() {
  const fixture = structuredClone(base);
  fixture.targetName = 'preview';
  fixture.environment = 'preview';
  fixture.expectedRuntime = fixture.policy.runtimeVersion;
  fixture.config.extra.supabaseUrl = `https://${fixture.policy.targets.preview.supabaseProjectRef}.supabase.co`;
  fixture.config.extra.supabaseAnonKey = 'sb_publishable_fixture';
  return fixture;
}

test('accepts a preview export using the preview backend and matching native runtime', () => {
  assert.equal(validateUpdateConfiguration(previewFixture()).target, 'preview');
});

test('blocks publishing a preview backend bundle to production', () => {
  const fixture = previewFixture();
  fixture.targetName = 'production';
  fixture.environment = 'production';
  assert.throws(() => validateUpdateConfiguration(fixture), /Supabase URL/);
});

test('blocks an environment or runtime inconsistent with the installed build', () => {
  const wrongEnvironment = previewFixture();
  wrongEnvironment.environment = 'production';
  assert.throws(() => validateUpdateConfiguration(wrongEnvironment), /environment differs/);
  const wrongRuntime = previewFixture();
  wrongRuntime.expectedRuntime = 'previous-native-runtime';
  assert.throws(() => validateUpdateConfiguration(wrongRuntime), /Expected runtime differs/);
});

test('blocks native Android runtime drift and startup without an embedded bundle', () => {
  const wrongNative = previewFixture();
  wrongNative.strings = wrongNative.strings.replace(
    wrongNative.policy.runtimeVersion,
    'old-runtime',
  );
  assert.throws(() => validateUpdateConfiguration(wrongNative), /Android runtime differs/);
  const missingOfflineBundle = previewFixture();
  missingOfflineBundle.config.updates.useEmbeddedUpdate = false;
  assert.throws(() => validateUpdateConfiguration(missingOfflineBundle), /offline embedded bundle/);
});

test('blocks an APK smoke profile from sharing the production update channel', () => {
  const fixture = previewFixture();
  fixture.eas.build.apk.channel = 'production';
  assert.throws(() => validateUpdateConfiguration(fixture), /production-smoke: build channel/);
});

test('rejects public JWT keys from a different Supabase project without exposing them', () => {
  const fixture = previewFixture();
  fixture.config.extra.supabaseAnonKey = `fixture.${Buffer.from(JSON.stringify({ role: 'anon', ref: fixture.policy.targets.production.supabaseProjectRef })).toString('base64url')}.fixture`;
  assert.throws(() => validateUpdateConfiguration(fixture), /key belongs to a different project/);
});

test('rejects server keys from an EAS public environment without printing them', () => {
  const fixture = previewFixture();
  fixture.config.extra.supabaseAnonKey = 'sb_secret_do-not-print';
  assert.throws(
    () => validateUpdateConfiguration(fixture),
    (error) => !error.message.includes('do-not-print') && /publishable key/.test(error.message),
  );
});
