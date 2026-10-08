/** A resolved invitation must never be retried into a new actionable push. */
export async function isPushEventCurrent(
  event: { readonly id: string; readonly source_kind: string },
  checkFriendship: (eventId: string) => Promise<{ data: unknown; error: unknown }>,
): Promise<boolean> {
  if (event.source_kind !== 'friendship_invite') return true;
  const { data, error } = await checkFriendship(event.id);
  // Failed verification is retried by the worker; it must not send speculatively.
  if (error) throw error;
  return data === true;
}
