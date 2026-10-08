import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imageSizeAdvisories = new Set(['GHSA-5p2g-fcmc-qvqq', 'GHSA-w3rx-r6r6-pgpr']);
// No fixed npm releases exist for these advisories. Every exception requires
// this exact package/version, a pinned patch, pnpm configuration and exploit tests.
const verifiedPatches = new Map([
  [
    'GHSA-86w9-cpqp-85rv',
    {
      name: 'node-forge',
      version: '1.4.0',
      sha256: '9bb484396da9580686b9233527cb48c4eccacf0415a239be253a76609cba8ec6',
    },
  ],
  [
    'GHSA-ch52-4w7c-c8xp',
    {
      name: 'http-cache-semantics',
      version: '4.2.0',
      sha256: 'c88e826bde88c6241f290836ac5a267180aaff83bc7483f7161be61590987008',
    },
  ],
  [
    'GHSA-vfj7-8cjw-p6xm',
    {
      name: 'braces',
      version: '3.0.3',
      sha256: 'e11535e18c12f1dab712e768b082587ea8616b7fe5b878c37d39ee6277ff6398',
    },
  ],
]);

export function evaluateAdvisories(advisories, directory = rootDir) {
  const imagePatchPath = path.join(directory, 'patches', 'image-size@1.2.1.patch');
  const imagePatch = fs.existsSync(imagePatchPath) ? fs.readFileSync(imagePatchPath, 'utf8') : '';
  const imageAllowed = advisories.filter((entry) =>
    imageSizeAdvisories.has(entry.github_advisory_id),
  );
  const imagePatchValid =
    imagePatch.includes('assertValidEntryLength') &&
    imagePatch.includes('boxSize < 8') &&
    imageAllowed.length === imageSizeAdvisories.size &&
    imageAllowed.every(
      (entry) =>
        entry.module_name === 'image-size' &&
        entry.findings?.length > 0 &&
        entry.findings.every((finding) => finding.version === '1.2.1'),
    );
  const workspacePath = path.join(directory, 'pnpm-workspace.yaml');
  const workspace = fs.existsSync(workspacePath) ? fs.readFileSync(workspacePath, 'utf8') : '';
  const unexpectedAdvisories = [];
  const invalidPatchedAdvisories = [];
  const allowed = [];

  for (const advisory of advisories) {
    const id = advisory.github_advisory_id;
    if (imageSizeAdvisories.has(id)) {
      (imagePatchValid ? allowed : invalidPatchedAdvisories).push(id);
      continue;
    }
    const expected = verifiedPatches.get(id);
    if (!expected) {
      unexpectedAdvisories.push(id);
      continue;
    }
    const filename = `${expected.name}@${expected.version}.patch`;
    const patchPath = path.join(directory, 'patches', filename);
    const patchHash = fs.existsSync(patchPath)
      ? createHash('sha256').update(fs.readFileSync(patchPath)).digest('hex')
      : '';
    const configured = workspace
      .split(/\r?\n/)
      .some((line) => line.trim() === `${expected.name}@${expected.version}: patches/${filename}`);
    const valid =
      advisory.module_name === expected.name &&
      advisory.findings?.length > 0 &&
      advisory.findings.every((finding) => finding.version === expected.version) &&
      patchHash === expected.sha256 &&
      configured;
    (valid ? allowed : invalidPatchedAdvisories).push(id);
  }
  return { allowed, unexpectedAdvisories, invalidPatchedAdvisories };
}

function runAudit() {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args =
    process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm audit --json'] : ['audit', '--json'];
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' '),
    },
  });
  if (!result.stdout.trim()) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  let report;
  try {
    report = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
  } catch {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(1);
  }
  if (!report.advisories || typeof report.advisories !== 'object' || report.error || result.error) {
    process.stderr.write('Dependency audit did not return a valid advisory report.\n');
    process.exit(1);
  }
  const evaluation = evaluateAdvisories(Object.values(report.advisories));
  if (evaluation.unexpectedAdvisories.length || evaluation.invalidPatchedAdvisories.length) {
    process.stderr.write(`${JSON.stringify(evaluation, null, 2)}\n`);
    process.exit(1);
  }
  const regressions = spawnSync(
    process.execPath,
    ['--test', 'scripts/check-dependency-advisory-patches.test.mjs'],
    { cwd: rootDir, encoding: 'utf8', timeout: 30_000 },
  );
  if (regressions.status !== 0 || regressions.error) {
    process.stderr.write(regressions.stdout ?? '');
    process.stderr.write(regressions.stderr ?? '');
    process.stderr.write('Patched dependency exploit regressions failed.\n');
    process.exit(1);
  }
  process.stdout.write(
    `dependency audit passed; ${evaluation.allowed.length} upstream advisories are covered by verified patches and exploit regressions\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAudit();
}
