// Gadget shop (screen 'shop', opened from the garage): weapon cards with stats, buy/equip per pilot,
// missile rack and pocket shield upgrades. Reads and writes the app store directly (actions.buyWeapon etc.).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { UPGRADES, UPGRADE_IDS, upgradeLevel, upgradePrice, type UpgradeId } from '../../core/shop';
import { actions, shopState, type Pilot } from '../../core/store';
import { BASE_MAX_MISSILES, WEAPONS, WEAPON_IDS, type WeaponId } from '../../core/weapons';
import { prefersReducedMotion } from '../anim';
import { ShopUpgradeCard } from '../components/ShopUpgradeCard';
import { ShopWallet } from '../components/ShopWallet';
import { ShopWeaponCard } from '../components/ShopWeaponCard';
import { clickSound } from '../hooks/controls';
import { useStore } from '../hooks/useStore';

const PILOTS: { id: Pilot; name: string; seat: string }[] = [
  { id: 'rick', name: 'Rick', seat: 'Solo or P1' },
  { id: 'morty', name: 'Morty', seat: 'Solo or P2' },
];

/** Card pop plus a floating "-price" tag. */
function purchaseFlourish(card: HTMLElement | null | undefined, text: string): void {
  if (!card || prefersReducedMotion()) return;
  gsap.fromTo(card, { scale: 1.06, boxShadow: '0 0 0 3px var(--weapon, #cbf66f), 0 0 34px var(--weapon, #cbf66f)' },
    { scale: 1, boxShadow: '0 0 0 0px transparent, 0 0 0px transparent', duration: .6, ease: 'back.out(2.2)', clearProps: 'transform,boxShadow' });
  const tag = document.createElement('span');
  tag.className = 'shop-float';
  tag.textContent = text;
  tag.setAttribute('aria-hidden', 'true');
  card.appendChild(tag);
  gsap.fromTo(tag, { y: 0, opacity: 1 }, { y: -46, opacity: 0, duration: .9, ease: 'power2.out', onComplete: () => tag.remove() });
}

function equipFlourish(card: HTMLElement | null | undefined): void {
  if (!card || prefersReducedMotion()) return;
  const art = card.querySelector('.shop-card-art');
  if (art) gsap.fromTo(art, { rotate: -8, scale: 1.12 }, { rotate: 0, scale: 1, duration: .5, ease: 'elastic.out(1.2, .4)', clearProps: 'transform' });
}

export default function ShopScreen() {
  const storePilot = useStore((s) => s.pilot);
  const mode = useStore((s) => s.mode);
  const coins = useStore((s) => s.coins);
  const owned = useStore((s) => s.ownedWeapons);
  const equipped = useStore((s) => s.equipped);
  const upgrades = useStore((s) => s.upgrades);
  const [pilot, setPilot] = useState<Pilot>(mode === 'versus' ? 'rick' : storePilot);
  const [status, setStatus] = useState('');
  const [denied, setDenied] = useState(0);
  const rootRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const pilotName = PILOTS.find((p) => p.id === pilot)!.name;
  const state = { coins, ownedWeapons: owned, equipped, upgrades };

  useLayoutEffect(() => {
    backRef.current?.focus({ preventScroll: true });
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.shop-head > *', { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: .4, stagger: .06, ease: 'power3.out', clearProps: 'transform,opacity' });
      gsap.fromTo('.shop-card', { y: 26, opacity: 0, rotateX: -18 },
        { y: 0, opacity: 1, rotateX: 0, duration: .55, stagger: .05, delay: .1, ease: 'power3.out', clearProps: 'transform,opacity' });
    }, root);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      actions.closeShop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const deny = (what: string, price: number) => {
    setDenied((n) => n + 1);
    setStatus(`Not enough coins for ${what}: ${price - shopState().coins} more needed.`);
  };

  const buyWeapon = (id: WeaponId) => {
    const w = WEAPONS[id];
    if (!actions.buyWeapon(id, pilot)) { deny(w.name, w.price); return; }
    clickSound();
    purchaseFlourish(cards.current.get(id), `-${w.price}`);
    setStatus(`Bought ${w.name} and equipped it for ${pilotName}.`);
  };

  const equip = (id: WeaponId) => {
    if (!actions.equip(pilot, id)) return;
    clickSound();
    equipFlourish(cards.current.get(id));
    setStatus(`${pilotName} now carries the ${WEAPONS[id].name}.`);
  };

  const buyUpgrade = (id: UpgradeId) => {
    const price = upgradePrice(state, id);
    if (price == null) return;
    if (!actions.buyUpgrade(id)) { deny(UPGRADES[id].name, price); return; }
    clickSound();
    purchaseFlourish(cards.current.get(id), `-${price}`);
    setStatus(`Bought ${UPGRADES[id].name}.`);
  };

  const cardRef = (key: string) => (el: HTMLElement | null) => {
    if (el) cards.current.set(key, el);
    else cards.current.delete(key);
  };

  return (
    <section ref={rootRef} className="shop" aria-labelledby="shopTitle">
      <header className="shop-head">
        <button ref={backRef} type="button" className="back-button" onClick={() => { clickSound(); actions.closeShop(); }}>
          <span aria-hidden="true">◀</span>Garage
        </button>
        <div className="shop-title">
          <h1 id="shopTitle">GADGET <span>SHOP</span></h1>
          <p>Coins come from cells, kills, coin drops and cleared levels. They are banked when a run ends.</p>
        </div>
        <ShopWallet coins={coins} denied={denied} />
      </header>

      <div className="shop-loadout" role="group" aria-label="Edit loadout for">
        <span>Loadout for</span>
        {PILOTS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`shop-pilot shop-pilot--${p.id}`}
            aria-pressed={pilot === p.id}
            onClick={() => { setPilot(p.id); clickSound(); }}
          >
            <strong>{p.name}</strong>
            <small>{p.seat} · {WEAPONS[equipped[p.id]].name}</small>
          </button>
        ))}
        <p className="shop-hint">Swap weapons in a run: <kbd>Q</kbd> (solo / Rick), <kbd>Right Ctrl</kbd> (Morty).</p>
      </div>

      <h2 className="shop-section">Weapons</h2>
      <div className="shop-grid">
        {WEAPON_IDS.map((id) => {
          const w = WEAPONS[id];
          return (
            <ShopWeaponCard
              key={id}
              ref={cardRef(id)}
              weapon={w}
              owned={owned.includes(id)}
              equippedBy={PILOTS.filter((p) => equipped[p.id] === id).map((p) => p.id)}
              pilot={pilot}
              pilotName={pilotName}
              affordable={coins >= w.price}
              onBuy={() => buyWeapon(id)}
              onEquip={() => equip(id)}
            />
          );
        })}
      </div>

      <h2 className="shop-section">Upgrades</h2>
      <div className="shop-grid shop-grid--upgrades">
        {UPGRADE_IDS.map((id) => {
          const price = upgradePrice(state, id);
          const level = upgradeLevel(state, id);
          return (
            <ShopUpgradeCard
              key={id}
              ref={cardRef(id)}
              upgrade={UPGRADES[id]}
              level={level}
              price={price}
              affordable={price != null && coins >= price}
              detail={id === 'missile-cap' ? `Capacity ${BASE_MAX_MISSILES + upgrades.missileCap}` : upgrades.startShield ? 'Active' : 'Not owned'}
              onBuy={() => buyUpgrade(id)}
            />
          );
        })}
      </div>

      <p className="shop-status" role="status" aria-live="polite">{status}</p>
    </section>
  );
}
