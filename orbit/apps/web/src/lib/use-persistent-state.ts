'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * State backed by `localStorage` — so a value (e.g. a set of filters) persists
 * across logout/login and browser restarts **within the same browser**, but a
 * different browser starts fresh (localStorage is per-browser, per-origin).
 *
 * Hydration-safe: the first render always uses `initial` (matching SSR); the
 * stored value is applied in an effect after mount. `hydrated` flips to true
 * once that has happened, so callers can defer side effects (like fetching with
 * the wrong filters) until the persisted value is in place.
 *
 * For plain-object state, the stored value is shallow-merged over `initial` so
 * newly-added keys keep their defaults across deploys.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const initialRef = useRef(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        const base = initialRef.current;
        const isObj = (v: unknown) =>
          v !== null && typeof v === 'object' && !Array.isArray(v);
        setState(
          isObj(base) && isObj(parsed) ? ({ ...base, ...parsed } as T) : (parsed as T),
        );
      }
    } catch {
      // Corrupt/unavailable storage — fall back to the initial value.
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Ignore quota/availability errors.
    }
  }, [key, state, hydrated]);

  return [state, setState, hydrated] as const;
}
