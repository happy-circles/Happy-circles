import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(srcRoot, '../../..');
const scanRoots = ['apps/mobile', 'apps/landing'];
const tokenSourceFiles = new Set([
  'apps/mobile/app.config.ts',
  'apps/mobile/src/lib/theme.ts',
  'apps/landing/app/globals.css',
  'apps/landing/app/layout.tsx',
  'apps/landing/app/_components/brand-assets.tsx',
]);

const rawColorLiteralPattern =
  /(['"`])(?:#[0-9a-fA-F]{3,8}|rgba?\([^\n'"`]+\)|transparent|white|black)\1|(?:fill|stroke|color)=['"](?:white|black|transparent|#[0-9a-fA-F]{3,8}|rgba?\([^\n'"]+\))['"]/g;

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === 'node_modules' || entry === '.expo' || entry === '.next' || entry === '.tmp') {
        return [];
      }

      return listSourceFiles(fullPath);
    }

    return /\.(css|ts|tsx)$/.test(fullPath) ? [fullPath] : [];
  });
}

function isAllowedRawColor(relativePath: string, line: string): boolean {
  if (tokenSourceFiles.has(relativePath) || /\.test\.tsx?$/.test(relativePath)) {
    return true;
  }

  if (/['"`]transparent['"`]/.test(line) || /['"`]rgba\(0,\s*0,\s*0,\s*0\)['"`]/.test(line)) {
    return true;
  }

  if (
    relativePath === 'apps/mobile/src/components/card-shell.tsx' &&
    line.includes('return `rgba(${red}, ${green}, ${blue}, ${alpha})`;')
  ) {
    return true;
  }

  if (
    relativePath === 'apps/mobile/src/components/happy-circles-glyph.tsx' &&
    /fill="(?:white|black)"/.test(line)
  ) {
    return true;
  }

  return false;
}

describe('theme color boundaries', () => {
  it('keeps reusable raw colors inside the theme/token sources', () => {
    const violations = scanRoots
      .flatMap((root) => listSourceFiles(resolve(repoRoot, root)))
      .flatMap((filePath) => {
        const relativePath = relative(repoRoot, filePath).replace(/\\/g, '/');
        const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);

        return lines.flatMap((line, index) => {
          rawColorLiteralPattern.lastIndex = 0;
          if (!rawColorLiteralPattern.test(line) || isAllowedRawColor(relativePath, line)) {
            return [];
          }

          return [`${relativePath}:${index + 1}: ${line.trim()}`];
        });
      });

    expect(violations).toEqual([]);
  });
});
