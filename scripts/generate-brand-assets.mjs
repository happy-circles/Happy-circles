import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const landingRoot = join(repoRoot, 'apps', 'landing');
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve('next/package.json', { paths: [landingRoot] }));
const sharp = nextRequire('sharp');
const source = await readFile(join(repoRoot, 'apps', 'mobile', 'assets', 'app-icon.png'));
const publicRoot = join(landingRoot, 'public');

// Keep the published app icon as the source of truth, including its safe margins.
const renderIcon = (size) =>
  sharp(source)
    .resize(size, size)
    .flatten({ background: '#f6f7fa' })
    .removeAlpha()
    .png()
    .toBuffer();

await mkdir(join(publicRoot, 'brand'), { recursive: true });
await Promise.all(
  [
    ['icon-96.png', 96],
    ['icon-192.png', 192],
    ['apple-touch-icon.png', 180],
    ['brand/happy-circles.png', 1024],
  ].map(async ([name, size]) => writeFile(join(publicRoot, name), await renderIcon(size))),
);

// Modern ICO supports PNG entries; include small browser sizes and a crisp large fallback.
const sizes = [16, 32, 48, 96, 256];
const icons = await Promise.all(sizes.map(renderIcon));
const directory = Buffer.alloc(6 + 16 * icons.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(icons.length, 4);
let offset = directory.length;
icons.forEach((icon, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(icon.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += icon.length;
});
await writeFile(join(publicRoot, 'favicon.ico'), Buffer.concat([directory, ...icons]));
console.log('Generated website icons from the original Happy Circles app icon.');
