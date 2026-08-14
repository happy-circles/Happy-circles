import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { describe, expect, it } from 'vitest';

type ProbeResult =
  | { status: 'hung' }
  | { status: 'returned'; value: unknown }
  | { status: 'threw'; message: string };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const metroPackagePath = createRequire(import.meta.url).resolve('metro/package.json', {
  paths: [join(repoRoot, 'apps', 'mobile')],
});
const imageSizeModulePath = createRequire(metroPackagePath).resolve('image-size');

const workerSource = `
  const { parentPort, workerData } = require('node:worker_threads');
  const imageSizeModule = require(workerData.modulePath);
  const imageSize = imageSizeModule.imageSize ?? imageSizeModule;

  try {
    const value = imageSize(new Uint8Array(workerData.bytes));
    parentPort.postMessage({ status: 'returned', value });
  } catch (error) {
    parentPort.postMessage({
      status: 'threw',
      message: error instanceof Error ? error.message : String(error),
    });
  }
`;

function probeImageSize(bytes: readonly number[], timeoutMs = 1_000): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { bytes, modulePath: imageSizeModulePath },
    });
    let settled = false;

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ status: 'hung' }), timeoutMs);

    worker.once('message', (result: ProbeResult) => finish(result));
    worker.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

const maliciousPayloads = {
  icns: [
    0x69, 0x63, 0x6e, 0x73, // icns
    0x00, 0x00, 0x00, 0x10, // file length = 16
    0x69, 0x73, 0x33, 0x32, // is32
    0x00, 0x00, 0x00, 0x00, // entry length = 0
  ],
  jxl: [
    0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
    0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x6a, 0x78, 0x6c, 0x20,
    0x00, 0x00, 0x00, 0x00, 0x6a, 0x78, 0x6c, 0x20,
    0x00, 0x00, 0x00, 0x00, 0x6a, 0x78, 0x6c, 0x70, 0x00, 0x00, 0x00, 0x00,
  ],
  heif: [
    0x00, 0x00, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x24, 0x6d, 0x65, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x08, 0x69, 0x70, 0x72, 0x70,
    0x00, 0x00, 0x00, 0x14, 0x69, 0x70, 0x63, 0x6f,
    0x00, 0x00, 0x00, 0x00, 0x69, 0x73, 0x70, 0x65,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ],
} as const;

describe('patched image-size parsers', () => {
  for (const [format, payload] of Object.entries(maliciousPayloads)) {
    it(`rejects the non-progressing ${format} payload`, async () => {
      const result = await probeImageSize(payload);

      expect(result.status).toBe('threw');
    });
  }

  it('continues to parse a valid minimal ICNS entry', async () => {
    const result = await probeImageSize([
      0x69, 0x63, 0x6e, 0x73,
      0x00, 0x00, 0x00, 0x10,
      0x69, 0x73, 0x33, 0x32,
      0x00, 0x00, 0x00, 0x08,
    ]);

    expect(result).toEqual({
      status: 'returned',
      value: { height: 16, type: 'is32', width: 16 },
    });
  });
});
