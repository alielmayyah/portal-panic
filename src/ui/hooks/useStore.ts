import { useCallback, useRef, useSyncExternalStore } from 'react';
import { store, type AppState, type Store } from '../../core/store';

/**
 * Subscribes to a slice of any core/store Store. The selector may return a new object on every call:
 * the result is recomputed only when the state object changes, and an identical (Object.is) result
 * keeps the previous value so the component bails out of re-rendering.
 */
export function useSelector<S, T>(source: Store<S>, selector: (state: S) => T): T {
  const cache = useRef<{ state: S; value: T } | null>(null);
  const select = useRef(selector);
  select.current = selector;
  const getSnapshot = useCallback(() => {
    const state = source.getState();
    const cached = cache.current;
    if (cached && cached.state === state) return cached.value;
    const value = select.current(state);
    const next = cached && Object.is(cached.value, value) ? cached.value : value;
    cache.current = { state, value: next };
    return next;
  }, [source]);
  return useSyncExternalStore(source.subscribe, getSnapshot, getSnapshot);
}

/** useStore((s) => s.mode): a slice of the app store. */
export function useStore<T>(selector: (state: AppState) => T): T {
  return useSelector(store, selector);
}
