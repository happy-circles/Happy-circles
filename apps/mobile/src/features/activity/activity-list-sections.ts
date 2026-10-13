export interface ActivityListSection<T> {
  readonly data: readonly T[];
  readonly key: string;
  readonly title: string;
}

/** Sections retain the source order and rows; only empty section headers are omitted. */
export function nonEmptyActivitySections<T, S extends ActivityListSection<T>>(
  sections: readonly S[],
): readonly S[] {
  return sections.filter((section) => section.data.length > 0);
}

export function activityRowKey(
  item: { readonly id: string; readonly kind: string } | { readonly key: string },
): string {
  // SectionList can retain an old boundary token during asynchronous regrouping.
  if ('key' in item) return item.key;
  return `${item.kind}:${item.id}`;
}

export function inviteActivityRowKey(
  item: { readonly inviteId: string; readonly kind: string } | { readonly key: string },
): string {
  if ('key' in item) return item.key;
  return `${item.kind}:${item.inviteId}`;
}
