import { GadgetArt } from './GadgetArt';
import { MenuIcon } from './icons';
import { forwardRef, type CSSProperties } from 'react';
import type { Pilot } from '../../core/store';
import type { WeaponDef } from '../../core/weapons';

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
        <GadgetArt kind={weapon.kind} />
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
              <MenuIcon name={equippedHere ? 'check' : 'equip'} />
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
              <MenuIcon name="buy" />Buy
            </button>
          </>
        )}
      </div>
    </article>
  );
});
