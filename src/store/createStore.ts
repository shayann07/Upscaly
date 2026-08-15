import { useCallback, useRef, useSyncExternalStore } from 'react';

export interface Store<S> {
  getState: () => S;
  setState: (updater: (prev: S) => S) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * A minimal external store, read through `useSyncExternalStore`.
 *
 * Deliberately not React state. The studio's state was previously spread
 * across a dozen `useState` pairs threaded down through hooks as setter
 * bags, which made two things impossible: every action's identity changed
 * on every render (so `React.memo` on the leaves never held), and the order
 * hooks were constructed in became load-bearing (three of them needed each
 * other's callbacks, which was bridged with mutable refs).
 *
 * Both problems disappear when state lives outside the render cycle:
 * actions are defined once at module scope and are stable forever, and
 * anything can read or write the store without being handed a reference to
 * whoever owns it.
 */
export function createStore<S>(initialState: S): Store<S> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (updater) => {
      const next = updater(state);
      if (Object.is(next, state)) return;
      state = next;
      // Copied before iterating: a listener that unsubscribes (or subscribes)
      // while being notified would otherwise mutate the set mid-iteration.
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Subscribes a component to one slice of a store.
 *
 * `useSyncExternalStore` re-renders whenever the snapshot changes by
 * `Object.is`, so a selector that builds a fresh object or array every call
 * would re-render on every store write -- and React would flag it as an
 * infinite loop. The last result is cached and reused when `isEqual` says
 * nothing changed, which is what lets selectors return derived collections
 * (a filtered list, a computed dimension pair) without giving up the
 * subscription's precision.
 *
 * `selector` and `isEqual` must have stable identities across renders --
 * define them at module scope, not inline.
 */
export function useStoreValue<S, T>(
  store: Store<S>,
  selector: (state: S) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const cache = useRef<{ value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const next = selector(store.getState());
    if (cache.current && isEqual(cache.current.value, next)) {
      return cache.current.value;
    }
    cache.current = { value: next };
    return next;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Shallow array comparison, for selectors that return derived lists. */
export function arrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, i) => Object.is(item, b[i]));
}
