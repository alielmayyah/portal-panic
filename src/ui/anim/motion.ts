import { gsap } from 'gsap';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when the player asked the OS for reduced motion. Safe outside a browser. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

type Anim = gsap.core.Tween | gsap.core.Timeline | null;
type Target = Element | null | undefined;

// Every helper clears its inline styles afterwards so CSS (hover, responsive rules) owns the element again.
const CLEAR = 'transform,opacity,filter,letterSpacing';

/** Countdown digit / READY / GO pop: overshoots in from large and transparent. */
export function popCountdown(el: Target): Anim {
  if (!el || prefersReducedMotion()) return null;
  gsap.killTweensOf(el);
  return gsap.fromTo(
    el,
    { scale: 1.7, opacity: 0, filter: 'blur(3px)' },
    { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.42, ease: 'back.out(2.4)', clearProps: CLEAR },
  );
}

/** "ENTERING <level>" title: the label drops in, then the name stretches out of the portal. */
export function crossingTitle(el: Target): Anim {
  if (!el || prefersReducedMotion()) return null;
  const small = el.querySelector('small');
  const strong = el.querySelector('strong');
  const tl = gsap.timeline();
  if (small) tl.fromTo(small, { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out', clearProps: CLEAR });
  if (strong) {
    tl.fromTo(
      strong,
      { scaleX: 0.2, scaleY: 1.4, opacity: 0, letterSpacing: '0.4em' },
      { scaleX: 1, scaleY: 1, opacity: 1, letterSpacing: '0em', duration: 0.55, ease: 'expo.out', clearProps: CLEAR },
      small ? '-=0.12' : 0,
    );
  }
  return tl;
}

/** Modal card entrance. */
export function dialogIn(el: Target): Anim {
  if (!el || prefersReducedMotion()) return null;
  gsap.killTweensOf(el);
  return gsap.fromTo(
    el,
    { y: 18, scale: 0.96, opacity: 0 },
    { y: 0, scale: 1, opacity: 1, duration: 0.32, ease: 'power3.out', clearProps: CLEAR },
  );
}

/** Garage entrance: cabinet, map and launch panel rise in with a stagger. */
export function menuIn(root: Target): Anim {
  if (!root || prefersReducedMotion()) return null;
  const parts = root.querySelectorAll('.cabinet, .portal-map, .launch-panel');
  if (!parts.length) return null;
  return gsap.fromTo(
    parts,
    { y: 22, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.08, clearProps: CLEAR },
  );
}

/** Small punch on a HUD number when it goes up. */
export function scoreBump(el: Target): Anim {
  if (!el || prefersReducedMotion()) return null;
  gsap.killTweensOf(el);
  return gsap.fromTo(
    el,
    { scale: 1.22, transformOrigin: '0% 70%' },
    { scale: 1, duration: 0.3, ease: 'power2.out', clearProps: CLEAR },
  );
}

/** Race message toast slides down from the top edge. */
export function toastIn(el: Target): Anim {
  if (!el || prefersReducedMotion()) return null;
  gsap.killTweensOf(el);
  return gsap.fromTo(
    el,
    { y: -12, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: CLEAR },
  );
}
