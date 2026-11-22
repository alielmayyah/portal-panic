import { forwardRef, type CSSProperties } from 'react';
import type { Pilot } from '../../core/store';
import type { WeaponDef, WeaponKind } from '../../core/weapons';

export interface ShopWeaponCardProps {
  weapon: WeaponDef;
  owned: boolean;
  /** Pilots that have this weapon equipped. */
  equippedBy: readonly Pilot[];
  /** The pilot whose loadout the shop is editing. */
  pilot: Pilot;
  pilotName: string;
  affordable: boolean;
  onBuy: () => void;
  onEquip: () => void;
}

const PILOT_TAG: Record<Pilot, string> = { rick: 'R', morty: 'M' };

/** Stat bars: value / max, clamped. */
function Stat({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const pct = Math.max(6, Math.min(100, (value / max) * 100));
  return (
    <div className="shop-stat">
      <small>{label}</small>
      <span className="shop-stat-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      <b>{text}</b>
    </div>
  );
}

/** Damage per second at a constant trigger, for the stat bar. */
export function weaponStats(w: WeaponDef): { damage: number; rate: number; range: number; dps: number } {
  const pellets = w.kind === 'spread' ? 3 : w.kind === 'homing' ? 2 : 1;
  const rate = 60 / w.cooldown;
  const perShot = w.kind === 'charge' ? w.damage : w.damage * pellets;
  const cycle = w.kind === 'charge' ? (w.cooldown + 60) / 60 : 1 / rate;
  return { damage: perShot, rate, range: w.range, dps: perShot / cycle };
}

export const ShopWeaponCard = forwardRef<HTMLElement, ShopWeaponCardProps>(function ShopWeaponCard(props, ref) {
  const { weapon, owned, equippedBy, pilot, pilotName, affordable } = props;
  const stats = weaponStats(weapon);
  const equippedHere = equippedBy.includes(pilot);
  const titleId = `weapon-${weapon.id}`;
  return (
    <article
      ref={ref}
      className="shop-card"
      data-owned={owned || undefined}
      data-equipped={equippedHere || undefined}
      aria-labelledby={titleId}
      style={{ '--weapon': weapon.color, '--weapon-glow': weapon.glow } as CSSProperties}
    >
      <div className="shop-card-art" aria-hidden="true">
        <WeaponGlyph kind={weapon.kind} />
        <span className="shop-badges">
          {equippedBy.map((p) => <i key={p} className={`shop-badge shop-badge--${p}`}>{PILOT_TAG[p]}</i>)}
        </span>
      </div>
      <h3 id={titleId}>{weapon.name}</h3>
      <p>{weapon.blurb}</p>
      <div className="shop-stats">
        <Stat label="DAMAGE" value={stats.dps} max={8} text={`${Math.round(stats.dps * 10) / 10}/s`} />
        <Stat label="FIRE RATE" value={stats.rate} max={6} text={weapon.kind === 'flame' ? 'Stream' : weapon.kind === 'charge' ? 'Charge' : `${Math.round(stats.rate * 10) / 10}/s`} />
        <Stat label="RANGE" value={stats.range} max={500} text={String(stats.range)} />
      </div>
      <div className="shop-card-foot">
        {owned ? (
          <>
            <span className="shop-price shop-price--owned">OWNED</span>
            <button
              type="button"
              className="shop-action"
              aria-pressed={equippedHere}
              disabled={equippedHere}
              onClick={props.onEquip}
            >
              {equippedHere ? `Equipped · ${pilotName}` : `Equip for ${pilotName}`}
            </button>
          </>
        ) : (
          <>
            <span className="shop-price"><i className="shop-coin" aria-hidden="true" />{weapon.price}</span>
            <button
              type="button"
              className="shop-action shop-action--buy"
              aria-disabled={!affordable}
              aria-label={`Buy ${weapon.name} for ${weapon.price} coins${affordable ? '' : ' (not enough coins)'}`}
              onClick={props.onBuy}
            >
              Buy
            </button>
          </>
        )}
      </div>
    </article>
  );
});

/** Original line-art glyph per weapon kind. */
export function WeaponGlyph({ kind }: { kind: WeaponKind }) {
  const common = { viewBox: '0 0 64 40', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const body = <path d="M6 24h22l4-6h8v12h-8l-4-3H12l-3 6H5Z" />;
  switch (kind) {
    case 'spread':
      return <svg {...common}>{body}<path d="M44 24h14M44 22l12-8M44 26l12 8" /></svg>;
    case 'beam':
      return <svg {...common}>{body}<path d="M42 24h20" strokeWidth={4} /><path d="M42 20h18M42 28h18" strokeWidth={1} /></svg>;
    case 'bounce':
      return <svg {...common}>{body}<path d="M42 24q5-12 10 0t10 0" /><circle cx="58" cy="15" r="4" /></svg>;
    case 'homing':
      return <svg {...common}>{body}<path d="M44 18q8-8 14 0M44 30q8 8 14 0" /><path d="m55 13 4 5-6 1M55 35l4-5-6-1" /></svg>;
    case 'flame':
      return <svg {...common}>{body}<path d="M42 24q6-8 10-2 2-8 8-6-1 6 2 8-4 8-12 6-5 0-8-6Z" /></svg>;
    case 'charge':
      return <svg {...common}>{body}<circle cx="52" cy="24" r="8" /><circle cx="52" cy="24" r="3" /></svg>;
    default:
      return <svg {...common}>{body}<path d="M44 24h8" /><circle cx="56" cy="24" r="2" /></svg>;
  }
}
