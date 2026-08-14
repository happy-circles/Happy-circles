import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedPatchedAdvisories = new Set([
  'GHSA-5p2g-fcmc-qvqq',
  'GHSA-w3rx-r6r6-pgpr',
]);
const patchPath = path.join(rootDir, 'patches', 'image-size@1.2.1.patch');

const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm audit --json'] : ['audit', '--json'];
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

const advisories = Object.values(report.advisories ?? {});
const unexpected = advisories.filter(
  (advisory) => !allowedPatchedAdvisories.has(advisory.github_advisory_id),
);
const allowed = advisories.filter((advisory) =>
  allowedPatchedAdvisories.has(advisory.github_advisory_id),
);

const patchSource = fs.existsSync(patchPath) ? fs.readFileSync(patchPath, 'utf8') : '';
const hasExpectedPatch =
  patchSource.includes('assertValidEntryLength') && patchSource.includes('boxSize < 8');
const allowedSetMatches =
  allowed.length === allowedPatchedAdvisories.size &&
  allowed.every(
    (advisory) =>
      advisory.module_name === 'image-size' &&
      advisory.findings?.every((finding) => finding.version === '1.2.1'),
  );

if (unexpected.length > 0 || (allowed.length > 0 && (!hasExpectedPatch || !allowedSetMatches))) {
  process.stderr.write(
    `${JSON.stringify(
      {
        allowedPatchValid: hasExpectedPatch && allowedSetMatches,
        unexpectedAdvisories: unexpected.map((advisory) => advisory.github_advisory_id),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `dependency audit passed; ${allowed.length} upstream advisories are covered by the verified image-size patch\n`,
);
