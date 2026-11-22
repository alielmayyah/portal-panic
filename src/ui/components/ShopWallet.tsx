import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../anim';

export interface ShopWalletProps {
  coins: number;
  /** Increment to shake the wallet (e.g. after a purchase that could not be afforded). */
  denied?: number;
}

/** Coin counter: tweens the number when it changes and shakes when a purchase is denied. */
export function ShopWallet({ coins, denied = 0 }: ShopWalletProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLElement>(null);
  const shown = useRef(coins);

  useLayoutEffect(() => {
    const el = numRef.current;
    if (!el) return;
    const from = shown.current;
    shown.current = coins;
    if (from === coins || prefersReducedMotion()) { el.textContent = String(coins); return; }
    const counter = { n: from };
    const tween = gsap.to(counter, {
      n: coins, duration: .55, ease: 'power2.out',
      onUpdate: () => { el.textContent = String(Math.round(counter.n)); },
    });
    const pop = gsap.fromTo(el, { scale: coins > from ? 1.25 : .85 }, { scale: 1, duration: .45, ease: 'back.out(3)', clearProps: 'transform' });
    return () => { tween.kill(); pop.kill(); el.textContent = String(coins); };
  }, [coins]);

  useLayoutEffect(() => {
    if (!denied || prefersReducedMotion() || !rootRef.current) return;
    const shake = gsap.fromTo(rootRef.current, { x: -7 }, { x: 0, duration: .4, ease: 'elastic.out(1.4, .25)', clearProps: 'transform' });
    return () => { shake.kill(); };
  }, [denied]);

  return (
    <div ref={rootRef} className="shop-wallet" role="group" aria-label={`Wallet: ${coins} coins`}>
      <i className="shop-coin" aria-hidden="true" />
      {/* Text is owned by the effect above (tweened), not by React. */}
      <strong ref={numRef} aria-hidden="true" />
      <small>COINS</small>
    </div>
  );
}
