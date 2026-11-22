import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { gsap } from 'gsap';
import type { BossHud } from '../../core/enemies';
import { prefersReducedMotion } from '../anim';

export interface BossBarProps {
  /** HudSnapshot.boss (bossHud(world)); null or undefined hides the bar. */
  boss: BossHud | null | undefined;
}

/** Phase thresholds drawn as ticks on the bar (the boss changes phase at 2/3 and 1/3 HP). */
const PHASE_TICKS = [2 / 3, 1 / 3] as const;
const CLEAR = 'transform,opacity';

const pct = (hp: number, max: number) => (max > 0 ? Math.min(100, Math.max(0, (hp / max) * 100)) : 0);

/** Boss name and segmented HP bar across the top of the course while a boss fight is on. */
export function BossBar({ boss }: BossBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lastHp = useRef<number | null>(null);
  const name = boss?.name ?? null;

  // Entrance: slides down from the top edge when a boss appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!name || !el || prefersReducedMotion()) return;
    const tween = gsap.fromTo(el, { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.8)', clearProps: CLEAR });
    return () => { tween.kill(); };
  }, [name]);

  // Damage: a short horizontal shake each time the HP goes down.
  const hp = boss?.hp ?? null;
  useLayoutEffect(() => {
    const prev = lastHp.current;
    lastHp.current = hp;
    const el = barRef.current;
    if (hp === null || prev === null || hp >= prev || !el || prefersReducedMotion()) return;
    gsap.killTweensOf(el);
    gsap.fromTo(el, { x: -5 }, { x: 0, duration: 0.32, ease: 'elastic.out(1.2, 0.3)', clearProps: CLEAR });
  }, [hp]);

  useLayoutEffect(() => {
    if (!name) lastHp.current = null;
  }, [name]);

  if (!boss) return <div ref={ref} className="boss-bar" hidden />;

  const fill = pct(boss.hp, boss.maxHp);
  return (
    <div
      ref={ref}
      className={`boss-bar phase-${Math.min(3, Math.max(1, boss.phase))}`}
      role="meter"
      aria-label={`${boss.name} health`}
      aria-valuemin={0}
      aria-valuemax={boss.maxHp}
      aria-valuenow={Math.max(0, boss.hp)}
      aria-valuetext={`${Math.max(0, boss.hp)} of ${boss.maxHp}, phase ${boss.phase}`}
    >
      <div className="boss-bar-head" aria-hidden="true">
        <span className="boss-bar-tag">BOSS</span>
        <strong className="boss-bar-name">{boss.name}</strong>
        <span className="boss-bar-phase">PHASE {boss.phase}</span>
      </div>
      <div ref={barRef} className="boss-bar-track" aria-hidden="true" style={{ '--hp': `${fill}%`, '--segments': boss.maxHp } as CSSProperties}>
        <i className="boss-bar-lag" />
        <i className="boss-bar-fill" />
        {PHASE_TICKS.map((t) => <i key={t} className="boss-bar-tick" style={{ left: `${t * 100}%` }} />)}
      </div>
    </div>
  );
}
