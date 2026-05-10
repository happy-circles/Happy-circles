#!/usr/bin/env node
import {
  loadLocalEnv,
  resolveProjectRef,
  runLogsQuery,
  runManagementSql,
} from './_supabase-management.mjs';

loadLocalEnv();

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const FREE_DB_LIMIT_BYTES = Number(process.env.SUPABASE_FREE_DB_LIMIT_BYTES ?? 500 * MIB);
const FREE_STORAGE_LIMIT_BYTES = Number(process.env.SUPABASE_FREE_STORAGE_LIMIT_BYTES ?? 1 * GIB);
const FREE_STORAGE_EGRESS_LIMIT_BYTES = Number(
  process.env.SUPABASE_FREE_STORAGE_EGRESS_LIMIT_BYTES ?? 5 * GIB,
);

function formatBytes(value) {
  const bytes = Number(value ?? 0);
  if (bytes >= GIB) {
    return `${(bytes / GIB).toFixed(2)} GiB`;
  }
  if (bytes >= MIB) {
    return `${(bytes / MIB).toFixed(2)} MiB`;
  }
  return `${bytes.toFixed(0)} B`;
}

function limitStatus(usedBytes, limitBytes) {
  const ratio = limitBytes > 0 ? usedBytes / limitBytes : 0;
  const percent = `${(ratio * 100).toFixed(1)}%`;
  const level = ratio >= 0.9 ? 'critical' : ratio >= 0.7 ? 'warning' : 'ok';
  return { level, percent };
}

function printLimit(label, usedBytes, limitBytes) {
  const status = limitStatus(usedBytes, limitBytes);
  console.log(
    `${label}: ${formatBytes(usedBytes)} / ${formatBytes(limitBytes)} (${status.percent}, ${status.level})`,
  );
}

async function maybeRun(label, callback) {
  try {
    return await callback();
  } catch (error) {
    console.warn(`${label}: unavailable (${error instanceof Error ? error.message : error})`);
    return [];
  }
}

async function loadDatabaseUsage() {
  const rows = await runManagementSql(`
    select
      pg_database_size(current_database())::bigint as database_bytes,
      (
        select coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint
        from storage.objects
      ) as storage_bytes
  `);
  return rows[0] ?? {};
}

async function loadStorageBuckets() {
  return runManagementSql(`
    select
      bucket_id,
      count(*)::integer as object_count,
      coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint as storage_bytes
    from storage.objects
    group by bucket_id
    order by storage_bytes desc
  `);
}

async function loadStorageHotPaths(startIso, endIso) {
  return runLogsQuery(
    `
    select
      regexp_replace(r.url, r'\\?.*$', '') as path,
      count(*) as request_count,
      coalesce(sum(safe_cast(response.headers[safe_offset(0)].content_length as int64)), 0) as egress_bytes
    from storage_logs
      cross join unnest(metadata) as m
      cross join unnest(m.req) as r
      cross join unnest(m.res) as response
    where starts_with(r.url, "/object")
       or starts_with(r.url, "/render")
       or starts_with(r.url, "/storage/v1/object")
    group by path
    order by egress_bytes desc, request_count desc
    limit 10
    `,
    startIso,
    endIso,
  );
}

async function loadStorageEgress(startIso, endIso) {
  return runLogsQuery(
    `
    select
      coalesce(sum(safe_cast(response.headers[safe_offset(0)].content_length as int64)), 0) as egress_bytes,
      count(*) as request_count
    from storage_logs
      cross join unnest(metadata) as m
      cross join unnest(m.req) as r
      cross join unnest(m.res) as response
    where starts_with(r.url, "/object")
       or starts_with(r.url, "/render")
       or starts_with(r.url, "/storage/v1/object")
    `,
    startIso,
    endIso,
  );
}

async function loadFunctionHotPaths(startIso, endIso) {
  return runLogsQuery(
    `
    select
      regexp_extract(r.url, r'/functions/v1/([^/?]+)') as function_name,
      count(*) as request_count
    from function_edge_logs
      cross join unnest(metadata) as m
      cross join unnest(m.req) as r
    where starts_with(r.url, "/functions/v1/")
    group by function_name
    order by request_count desc
    limit 10
    `,
    startIso,
    endIso,
  );
}

async function main() {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = now.toISOString();
  const projectRef = resolveProjectRef();

  console.log(`Supabase usage report for ${projectRef}`);
  console.log(`Window: ${startIso} -> ${endIso}`);
  console.log('');

  const databaseUsage = await loadDatabaseUsage();
  const databaseBytes = Number(databaseUsage.database_bytes ?? 0);
  const storageBytes = Number(databaseUsage.storage_bytes ?? 0);
  const storageEgressRows = await maybeRun('Storage egress', () =>
    loadStorageEgress(startIso, endIso),
  );
  const storageEgressBytes = Number(storageEgressRows[0]?.egress_bytes ?? 0);

  printLimit('Database', databaseBytes, FREE_DB_LIMIT_BYTES);
  printLimit('Storage stored', storageBytes, FREE_STORAGE_LIMIT_BYTES);
  printLimit('Storage egress, last 24h', storageEgressBytes, FREE_STORAGE_EGRESS_LIMIT_BYTES);
  console.log('');

  const buckets = await maybeRun('Storage bucket usage', loadStorageBuckets);
  if (buckets.length > 0) {
    console.log('Storage buckets');
    for (const bucket of buckets) {
      console.log(
        `- ${bucket.bucket_id}: ${formatBytes(bucket.storage_bytes)} across ${bucket.object_count} objects`,
      );
    }
    console.log('');
  }

  const storageHotPaths = await maybeRun('Storage hot paths', () =>
    loadStorageHotPaths(startIso, endIso),
  );
  if (storageHotPaths.length > 0) {
    console.log('Top storage paths by egress, last 24h');
    for (const row of storageHotPaths) {
      console.log(`- ${row.path}: ${formatBytes(row.egress_bytes)} across ${row.request_count}`);
    }
    console.log('');
  }

  const functionHotPaths = await maybeRun('Function hot paths', () =>
    loadFunctionHotPaths(startIso, endIso),
  );
  if (functionHotPaths.length > 0) {
    console.log('Top edge functions by requests, last 24h');
    for (const row of functionHotPaths) {
      console.log(`- ${row.function_name}: ${row.request_count}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
