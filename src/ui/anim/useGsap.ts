import { useLayoutEffect, type DependencyList, type RefObject } from 'react';
import { gsap } from 'gsap';

/**
 * Runs `setup` inside a gsap.context scoped to `scope` (selector strings resolve inside it).
 * Every tween/timeline created there is reverted when the deps change or the component unmounts.
 * `setup` may return a cleanup function, which runs before the revert.
 */
export function useGsap(
  setup: (context: gsap.Context) => void | (() => void),
  deps: DependencyList = [],
  scope?: RefObject<Element | null>,
): void {
  useLayoutEffect(() => {
    let cleanup: void | (() => void);
    const ctx = gsap.context((self) => {
      cleanup = setup(self);
    }, scope?.current ?? undefined);
    return () => {
      if (typeof cleanup === 'function') cleanup();
      ctx.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
