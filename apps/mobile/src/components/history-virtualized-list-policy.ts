// Small batches protect the JS thread while allowing one screen ahead/behind.
export const HISTORY_LIST_RENDER_WINDOW = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 8,
  windowSize: 5,
  // Expanded conversations can overflow their original measured bounds on iOS.
  removeClippedSubviews: false,
} as const;

export function focusedListIndex<T extends { readonly id: string }>(
  data: readonly T[],
  focusedId: string | null | undefined,
): number {
  return focusedId ? data.findIndex((item) => item.id === focusedId) : -1;
}
