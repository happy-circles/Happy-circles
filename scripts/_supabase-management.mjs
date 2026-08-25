import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MANAGEMENT_API_URL = 'https://api.supabase.com/v1';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

export function loadLocalEnv() {
  parseEnvFile(path.join(rootDir, '.env'));
  parseEnvFile(path.join(rootDir, 'apps', 'mobile', '.env'));
}

export function readEnv(name, aliases = []) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function requireEnv(name, aliases = []) {
  const value = readEnv(name, aliases);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function resolveSupabaseUrl() {
  return readEnv('NEXT_PUBLIC_SUPABASE_URL', ['EXPO_PUBLIC_SUPABASE_URL']);
}

export function resolveProjectRef() {
  const configured = readEnv('SUPABASE_PROJECT_REF');
  if (configured) {
    return configured;
  }

  const supabaseUrl = resolveSupabaseUrl();
  const host = supabaseUrl ? new URL(supabaseUrl).hostname : '';
  const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (!match) {
    throw new Error('Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL.');
  }

  return match[1];
}

function normalizeRows(responseBody) {
  if (Array.isArray(responseBody)) {
    return responseBody;
  }

  if (Array.isArray(responseBody?.data)) {
    return responseBody.data;
  }

  if (Array.isArray(responseBody?.result)) {
    return responseBody.result;
  }

  return [];
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error?.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      throw new Error('TLS verification failed. Run Node with --use-system-ca.');
    }
    throw error;
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message ?? body?.error ?? text ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  return body;
}

export async function runManagementSql(query, { readOnly = true } = {}) {
  const projectRef = resolveProjectRef();
  const accessToken = requireEnv('SUPABASE_ACCESS_TOKEN');
  const endpoint = readOnly ? 'database/query/read-only' : 'database/query';
  const body = await requestJson(`${MANAGEMENT_API_URL}/projects/${projectRef}/${endpoint}`, {
    body: JSON.stringify({ query }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  return normalizeRows(body);
}

export async function runLogsQuery(sql, startIso, endIso) {
  const projectRef = resolveProjectRef();
  const accessToken = requireEnv('SUPABASE_ACCESS_TOKEN');
  const params = new URLSearchParams({
    iso_timestamp_end: endIso,
    iso_timestamp_start: startIso,
    sql,
  });
  const body = await requestJson(
    `${MANAGEMENT_API_URL}/projects/${projectRef}/analytics/endpoints/logs?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'GET',
    },
  );

  return normalizeRows(body);
}

export async function callSupabaseRest(pathname, options = {}) {
  const supabaseUrl = resolveSupabaseUrl();
  if (!supabaseUrl) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL.');
  }

  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return requestJson(`${supabaseUrl.replace(/\/+$/, '')}${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(options.headers ?? {}),
    },
  });
}
