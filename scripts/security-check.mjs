import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function walk(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  return fs.readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childRelativePath = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      return walk(childRelativePath);
    }

    return [childRelativePath];
  });
}

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function assertContains(relativePath, pattern, message) {
  const content = readFile(relativePath);
  assert(pattern.test(content), `${relativePath}: ${message}`);
}

const migrationFiles = walk('supabase/migrations').filter((file) => file.endsWith('.sql'));
const forbiddenMigrationPatterns = [
  { pattern: /\bseed_demo_data\b/i, label: 'seed_demo_data helper' },
  { pattern: /\breset_demo_data\b/i, label: 'reset_demo_data helper' },
  { pattern: /\btrust_demo_devices\b/i, label: 'trust_demo_devices helper' },
  { pattern: /\b(ana|bruno|carla|diego)@example\.com\b/i, label: 'demo account email' },
  { pattern: /\bCircles1234\b/i, label: 'demo password' },
];

for (const migrationFile of migrationFiles) {
  const lines = readFile(migrationFile).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const { pattern, label } of forbiddenMigrationPatterns) {
      if (pattern.test(line)) {
        failures.push(`${migrationFile}:${index + 1}: production migration contains ${label}`);
      }
    }
  }
}

const config = readFile('supabase/config.toml');
const publicFunctionAllowlist = new Set([
  'get-account-invite-preview-public',
  'process-graph-cycle-jobs',
]);
const functionBlocks = [...config.matchAll(/^\[functions\.([^\]]+)\]\s*([\s\S]*?)(?=^\[|\s*$)/gm)];
for (const [, functionName, block] of functionBlocks) {
  const verifyJwt = block.match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/m)?.[1];
  if (verifyJwt === 'false' && !publicFunctionAllowlist.has(functionName)) {
    failures.push(`supabase/config.toml: unexpected public function ${functionName}`);
  }
}

assert(
  /\[functions\.upload-avatar\][\s\S]*?verify_jwt\s*=\s*true/.test(config),
  'supabase/config.toml: upload-avatar must require JWT verification',
);

assertContains(
  'supabase/functions/process-graph-cycle-jobs/index.ts',
  /jsonResponse\(503[\s\S]*worker_not_configured/,
  'graph worker must fail closed when GRAPH_CYCLE_WORKER_SECRET is missing',
);
assertContains(
  'supabase/functions/process-graph-cycle-jobs/index.ts',
  /jsonResponse\(403[\s\S]*code:\s*'forbidden'/,
  'graph worker must reject bad secrets with a generic 403',
);
assertContains(
  'supabase/functions/_shared/cycle-worker.ts',
  /!graphCycleWorkerSecret[\s\S]*return;/,
  'internal graph worker trigger must not call the worker without a secret',
);
assertContains(
  'supabase/functions/_shared/http.ts',
  /'cache-control':\s*'no-store'[\s\S]*'x-content-type-options':\s*'nosniff'/,
  'Edge JSON responses must include no-store and nosniff',
);

assert(
  exists('supabase/functions/upload-avatar/index.ts'),
  'supabase/functions/upload-avatar/index.ts: authenticated avatar upload function is required',
);
assertContains(
  'supabase/functions/upload-avatar/index.ts',
  /MAX_AVATAR_BYTES[\s\S]*avatar\.size\s*>\s*MAX_AVATAR_BYTES/,
  'avatar upload must validate size',
);
assertContains(
  'supabase/functions/upload-avatar/index.ts',
  /detectImageType[\s\S]*Invalid avatar content/,
  'avatar upload must validate magic bytes',
);

assertContains(
  'supabase/migrations/0036_private_avatar_storage.sql',
  /public\)\s*values\s*\('avatars',\s*'avatars',\s*false\)|set\s+public\s*=\s*false/i,
  'avatars bucket must be private',
);
assertContains(
  'supabase/migrations/0036_private_avatar_storage.sql',
  /revoke\s+update\s*\(\s*avatar_path\s*\)\s+on\s+public\.user_profiles\s+from\s+authenticated/i,
  'authenticated users must not update avatar_path directly',
);
assertContains(
  'supabase/migrations/0036_private_avatar_storage.sql',
  /create\s+policy\s+avatars_select_related/i,
  'avatars must have a relationship-scoped select policy',
);

for (const mobileFile of walk('apps/mobile/src').filter((file) => /\.(ts|tsx)$/.test(file))) {
  const content = readFile(mobileFile);
  if (/storage\s*\.\s*from\s*\(\s*AVATAR_BUCKET\s*\)\s*\.\s*upload/.test(content)) {
    failures.push(`${mobileFile}: client avatar uploads must go through upload-avatar`);
  }
}

assertContains(
  'apps/landing/next.config.mjs',
  /Strict-Transport-Security[\s\S]*Content-Security-Policy[\s\S]*X-Content-Type-Options[\s\S]*Referrer-Policy[\s\S]*Permissions-Policy[\s\S]*X-Frame-Options/,
  'landing app must define the required security headers',
);

if (failures.length > 0) {
  console.error('security:check failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('security:check passed');
