import type { CachedPeopleOverview } from './people-overview-cache';

export async function restorePeopleOverviewForSession(options: {
  readonly read: () => Promise<CachedPeopleOverview | null>;
  readonly canRestore: () => boolean;
  readonly publish: (cached: CachedPeopleOverview) => void;
}): Promise<boolean> {
  const cached = await options.read();
  if (!cached || !options.canRestore()) return false;
  options.publish(cached);
  return true;
}
