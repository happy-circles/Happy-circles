import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const pnpmCommand = 'pnpm';
const nodeOptions = [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ');

function shouldUseCmdShim(command) {
  return (
    isWindows && ['pnpm', 'pnpm.cmd', 'supabase', 'supabase.cmd'].includes(command.toLowerCase())
  );
}

function quoteCmdArg(value) {
  return /^[a-zA-Z0-9_@%+=:,./\\-]+$/.test(value) ? value : `"${value.replace(/"/g, '""')}"`;
}

function spawn(command, args, options) {
  if (!shouldUseCmdShim(command)) {
    return spawnSync(command, args, options);
  }

  return spawnSync(
    'cmd.exe',
    ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')],
    options,
  );
}

function run(command, args, options = {}) {
  const result = spawn(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      SUPABASE_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      CI: process.env.CI ?? '1',
    },
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runForStatus(command, args, options = {}) {
  const result = spawn(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      SUPABASE_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      CI: process.env.CI ?? '1',
    },
    stdio: 'inherit',
    ...options,
  });

  return result.status ?? 1;
}

function capture(command, args) {
  const result = spawn(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      SUPABASE_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      CI: process.env.CI ?? '1',
    },
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function commandExists(command) {
  const result = spawn(command, ['--version'], {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
    stdio: 'ignore',
  });

  return result.status === 0;
}

const useInstalledSupabaseCli = commandExists('supabase');

function runSupabase(args) {
  if (useInstalledSupabaseCli) {
    run('supabase', args);
    return;
  }

  run(pnpmCommand, ['dlx', 'supabase@latest', ...args]);
}

function runSupabaseForStatus(args) {
  if (useInstalledSupabaseCli) {
    return runForStatus('supabase', args);
  }

  return runForStatus(pnpmCommand, ['dlx', 'supabase@latest', ...args]);
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

function bootstrapLocalRealtimePolicy() {
  const policyPath = path.join(rootDir, 'supabase', 'dev', 'bootstrap_realtime_policy.sql');
  const policySql = fs.readFileSync(policyPath, 'utf8');
  const dbContainer = resolveSupabaseDbContainer();
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      dbContainer,
      'sh',
      '-lc',
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
      input: policySql,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runSqlTestFile(dbContainer, testPath) {
  const sql = fs.readFileSync(testPath, 'utf8');
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
      input: sql,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runDbTestsViaPsql() {
  const dbContainer = resolveSupabaseDbContainer();
  const testDir = path.join(rootDir, 'supabase', 'tests');
  const testFiles = fs
    .readdirSync(testDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const testFile of testFiles) {
    console.log(`Running ${path.join('supabase', 'tests', testFile)}`);
    runSqlTestFile(dbContainer, path.join(testDir, testFile));
  }
}

runSupabase(['db', 'start']);
runSupabase(['db', 'reset', '--no-seed']);
bootstrapLocalRealtimePolicy();
seedLocalDemoData();
const supabaseTestStatus = runSupabaseForStatus(['test', 'db']);
if (supabaseTestStatus !== 0) {
  console.warn('supabase test db failed; falling back to psql execution against local DB.');
  runDbTestsViaPsql();
}
