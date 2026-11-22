import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { RunnerHud as HudRunnerData } from '../../core/store';
import { scoreBump } from '../anim';
import { scoreText } from './format';
import { WEAPONS } from '../../core/weapons';

/** store.RunnerHud: {name,color,character,score,missiles,maxMissiles,shield,bootsSeconds,gadget,progress,alive,god,infiniteAmmo}. */
export type HudRunner = HudRunnerData;

export interface RunnerHudProps {
  /** HudSnapshot.runners */
  runners: readonly HudRunner[];
  /** HudSnapshot.cheats: shows the CHEATS tag (records are not saved this session). */
  cheats?: boolean;
}

function RunnerPanel({ runner, cheats }: { runner: HudRunner; cheats: boolean }) {
  const scoreRef = useRef<HTMLElement>(null);
  const ammoRef = useRef<HTMLElement>(null);
  const lastScore = useRef(runner.score);
  const lastAmmo = useRef(runner.missiles);

  useLayoutEffect(() => {
    if (runner.score > lastScore.current) scoreBump(scoreRef.current);
    lastScore.current = runner.score;
  }, [runner.score]);
  useLayoutEffect(() => {
    if (runner.missiles > lastAmmo.current) scoreBump(ammoRef.current);
    lastAmmo.current = runner.missiles;
  }, [runner.missiles]);

  const tags = [runner.god && 'GOD', runner.infiniteAmmo && '∞ AMMO'].filter(Boolean).join(' · ');
  return (
    <div className="runner-hud" style={{ '--pilot': runner.color } as CSSProperties}>
      <span className="runner-identity">
        <i />
        <strong>{runner.name}</strong>
        {cheats && (
          <span className="cheats-tag" title={`Cheats used: records are not saved this run${tags ? ` (${tags})` : ''}`}>
            CHEATS
          </span>
        )}
      </span>
      <span className="runner-score">
        <small>SCORE</small>
        <strong ref={scoreRef}>{scoreText(runner.score)}</strong>
      </span>
      <span className="runner-ammo">
        <small>MISSILES</small>
        <span className="ammo-stock">
          <strong ref={ammoRef}>{runner.infiniteAmmo ? `∞/${runner.maxMissiles}` : `${runner.missiles}/${runner.maxMissiles}`}</strong>
          <span className="ammo-pips" aria-hidden="true">
            {Array.from({ length: runner.maxMissiles }, (_, slot) => (
              <i key={slot} className={slot < runner.missiles ? 'loaded' : undefined} />
            ))}
          </span>
        </span>
      </span>
      {runner.coins !== undefined && (
        <span className="runner-coins">
          <small>COINS</small>
          <strong><i aria-hidden="true" />{runner.coins}</strong>
        </span>
      )}
      {runner.weapon && (
        <span
          className="runner-weapon"
          title="Held weapon (swap: Q / Right Ctrl)"
          style={runner.weaponId ? ({ '--weapon': WEAPONS[runner.weaponId].color } as CSSProperties) : undefined}
        >
          <i aria-hidden="true" />
          {runner.weapon}{runner.charge ? ` ${Math.round(runner.charge * 100)}%` : ''}
        </span>
      )}
      <span className="runner-gadget" hidden={!runner.gadget}>
        {runner.gadget}
      </span>
    </div>
  );
}

/** Per-runner score, missile stock and gadget status strip above the course. */
export function RunnerHud({ runners, cheats = false }: RunnerHudProps) {
  return (
    <div className="race-hud">
      {runners.map((runner, index) => (
        <RunnerPanel key={runner.character + index} runner={runner} cheats={cheats && index === 0} />
      ))}
    </div>
  );
}
