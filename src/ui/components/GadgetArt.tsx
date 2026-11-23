import type { UpgradeId } from '../../core/shop';
import type { WeaponKind } from '../../core/weapons';

const positions: Record<WeaponKind | UpgradeId, string> = {
  pulse: '0% 0%', spread: '50% 0%', bounce: '100% 0%',
  flame: '0% 50%', beam: '50% 50%', homing: '100% 50%',
  charge: '0% 100%', 'missile-cap': '50% 100%', 'start-shield': '100% 100%',
};

export function GadgetArt({ kind }: { kind: keyof typeof positions }) {
  return <span aria-hidden="true" className="gadget-art" style={{ backgroundPosition: positions[kind] }} />;
}
