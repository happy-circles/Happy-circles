import { useCallback, useEffect, useRef, useState } from 'react';

/** A visit is permanent for this pager's lifetime, so tab state survives switching. */
export function visitPagerPage<T extends string>(
  visited: ReadonlySet<T>,
  value: T,
): ReadonlySet<T> {
  return visited.has(value) ? visited : new Set([...visited, value]);
}

export function shouldMountPagerPage<T extends string>(input: {
  readonly activeValue: T;
  readonly lazy: boolean;
  readonly pageValue: T;
  readonly visited: ReadonlySet<T>;
}): boolean {
  return !input.lazy || input.pageValue === input.activeValue || input.visited.has(input.pageValue);
}

export function useVisitedPagerPages<T extends string>(activeValue: T, lazy: boolean) {
  const [visited, setVisited] = useState<ReadonlySet<T>>(() => new Set([activeValue]));
  const visitedRef = useRef(visited);
  const visitPage = useCallback((pageValue: T) => {
    const next = visitPagerPage(visitedRef.current, pageValue);
    if (next === visitedRef.current) return;
    visitedRef.current = next;
    setVisited(next);
  }, []);

  useEffect(() => {
    if (lazy) visitPage(activeValue);
  }, [activeValue, lazy, visitPage]);

  return {
    shouldMountPage: (pageValue: T) =>
      shouldMountPagerPage({ activeValue, lazy, pageValue, visited }),
    visitPage,
  };
}
