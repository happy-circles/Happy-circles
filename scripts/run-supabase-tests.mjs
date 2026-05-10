import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const pnpmCommand = 'pnpm';
const nodeOptions = [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
    shell: isWindows,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
    shell: isWindows,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function resolveSupabaseDbContainer() {
  const names = capture('docker', ['ps', '--format', '{{.Names}}'])
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => name.startsWith('supabase_db_'));

  if (names.length === 0) {
    throw new Error('No Supabase DB container is running.');
  }

  const projectName = path.basename(rootDir).replace(/[^a-zA-Z0-9_.-]/g, '_');
  return names.find((name) => name === `supabase_db_${projectName}`) ?? names[0];
}

function seedLocalDemoData() {
  const seedHelpersPath = path.join(rootDir, 'supabase', 'dev', 'seed_demo_helpers.sql');
  const seedSql = `${fs.readFileSync(seedHelpersPath, 'utf8')}\nselect public.seed_demo_data();\n`;
  const dbContainer = resolveSupabaseDbContainer();
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      dbContainer,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      input: seedSql,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(pnpmCommand, ['dlx', 'supabase@latest', 'db', 'start']);
run(pnpmCommand, ['dlx', 'supabase@latest', 'db', 'reset', '--no-seed']);
seedLocalDemoData();
run(pnpmCommand, ['dlx', 'supabase@latest', 'test', 'db']);
