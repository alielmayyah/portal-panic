import { forwardRef } from 'react';
import { GadgetArt } from './GadgetArt';
import { MenuIcon } from './icons';
import type { UpgradeDef } from '../../core/shop';

export interface ShopUpgradeCardProps {
  upgrade: UpgradeDef;
  /** Levels bought (0..upgrade.prices.length). */
  level: number;
  /** Next level price, or null when maxed. */
  price: number | null;
  affordable: boolean;
  /** Short current-value text, e.g. 'Capacity 6'. */
  detail: string;
  onBuy: () => void;
}

export const ShopUpgradeCard = forwardRef<HTMLElement, ShopUpgradeCardProps>(function ShopUpgradeCard(props, ref) {
  const { upgrade, level, price, affordable, detail } = props;
  const max = upgrade.prices.length;
  const titleId = `upgrade-${upgrade.id}`;
  return (
    <article ref={ref} className="shop-card shop-card--upgrade" data-owned={price == null || undefined} aria-labelledby={titleId}>
      <div className="shop-card-art"><GadgetArt kind={upgrade.id} /></div>
      <h3 id={titleId}>{upgrade.name}</h3>
      <p>{upgrade.blurb}</p>
      <div className="shop-pips" role="img" aria-label={`Level ${level} of ${max}`}>
        {Array.from({ length: max }, (_, i) => <i key={i} className={i < level ? 'on' : undefined} />)}
        <small>{detail}</small>
      </div>
      <div className="shop-card-foot">
        {price == null ? (
          <span className="shop-price shop-price--owned"><MenuIcon name="check" />MAXED</span>
        ) : (
          <>
            <span className="shop-price"><i className="shop-coin" aria-hidden="true" />{price}</span>
            <button
              type="button"
              className="shop-action shop-action--buy"
              aria-disabled={!affordable}
              aria-label={`Buy ${upgrade.name} for ${price} coins${affordable ? '' : ' (not enough coins)'}`}
              onClick={props.onBuy}
            >
              <MenuIcon name={level ? 'upgrade' : 'buy'} />
              {level ? 'Upgrade' : 'Buy'}
            </button>
          </>
        )}
      </div>
    </article>
  );
});
