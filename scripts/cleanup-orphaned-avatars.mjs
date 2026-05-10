#!/usr/bin/env node
import { callSupabaseRest, loadLocalEnv, runManagementSql } from './_supabase-management.mjs';

loadLocalEnv();

const apply = process.argv.includes('--apply');
const olderThanHours = Number(process.env.ORPHANED_AVATAR_MIN_AGE_HOURS ?? 24);

if (!Number.isInteger(olderThanHours) || olderThanHours < 1 || olderThanHours > 720) {
  throw new Error('ORPHANED_AVATAR_MIN_AGE_HOURS must be an integer from 1 to 720.');
}

async function listCandidates() {
  return runManagementSql(`
    select
      object.name,
      object.created_at
    from storage.objects object
    where object.bucket_id = 'avatars'
      and object.created_at < timezone('utc', now()) - interval '${olderThanHours} hours'
      and not exists (
        select 1
        from public.user_profiles profile
        where profile.avatar_path = object.name
      )
    order by object.created_at asc
    limit 500
  `);
}

async function deleteAvatarObjects(names) {
  if (names.length === 0) {
    return;
  }

  await callSupabaseRest('/storage/v1/object/avatars', {
    body: JSON.stringify({ prefixes: names }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'DELETE',
  });
}

async function main() {
  const candidates = await listCandidates();
  console.log(
    `${candidates.length} orphaned avatar candidate(s) older than ${olderThanHours}h found.`,
  );

  for (const candidate of candidates.slice(0, 25)) {
    console.log(`- ${candidate.name} (${candidate.created_at})`);
  }

  if (candidates.length > 25) {
    console.log(`... ${candidates.length - 25} more`);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply and SUPABASE_SERVICE_ROLE_KEY to delete.');
    return;
  }

  await deleteAvatarObjects(candidates.map((candidate) => candidate.name));
  console.log(`Deleted ${candidates.length} orphaned avatar object(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
