import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DEFAULT_START_PORT = Number(process.env.EXPO_START_PORT ?? 8091);
const MAX_PORT_ATTEMPTS = 20;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => {
      server.close(() => resolve(true));
    });
  });
}

function getListeningPortsFromNetstat() {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('cmd.exe', ['/c', 'netstat -ano'], { encoding: 'utf8' });
      return new Set(
        output
          .split(/\r?\n/)
          .filter((line) => line.includes('LISTENING'))
          .map((line) => {
            const match = line.match(/:(\d+)\s+/);
            return match ? Number(match[1]) : null;
          })
          .filter((port) => Number.isInteger(port)),
      );
    }
  } catch {
    return new Set();
  }

  return new Set();
}

async function findOpenPort(startPort) {
  const listeningPorts = getListeningPortsFromNetstat();

  for (let port = startPort; port < startPort + MAX_PORT_ATTEMPTS; port += 1) {
    if (listeningPorts.has(port)) {
      continue;
    }

    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No open Expo port found between ${startPort} and ${startPort + MAX_PORT_ATTEMPTS - 1}.`);
}

function resolveExpoCliPath() {
  const expoPackageJsonPath = require.resolve('expo/package.json');
  const expoPackageJson = JSON.parse(fs.readFileSync(expoPackageJsonPath, 'utf8'));
  const expoPackageRoot = path.dirname(expoPackageJsonPath);

  return path.join(expoPackageRoot, expoPackageJson.bin.expo);
}

const port = await findOpenPort(DEFAULT_START_PORT);
const expoCliPath = resolveExpoCliPath();
const extraArgs = process.argv.slice(2);
const args = [expoCliPath, 'start', '--port', String(port), ...extraArgs];

console.log(`Starting Expo on port ${port}`);

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
