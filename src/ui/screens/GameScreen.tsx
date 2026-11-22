import { useCallback, useRef } from 'react';
import { CONTROL_SCHEMES } from '../../core/input';
import { LEVELS } from '../../core/levels';
import { bus, store, type HudSnapshot } from '../../core/store';
import {
  BossBar, CheatConsole, ControlsList, Countdown, GameTopBar, PauseDialog, ProgressTrack, RaceFrame, RaceToast,
  ResultDialog, RunnerHud, TouchControls, type TouchAction,
} from '../components';
import { refocusGame, toggleFullscreen, toggleSound } from '../hooks/controls';
import { attachStage } from '../hooks/gameHost';
import {
  closeCheat, goHome, openGuide, pauseRun, resumeRun, retryRun, submitCheat, ui,
} from '../hooks/session';
import { useSelector, useStore } from '../hooks/useStore';

const LIVE: readonly string[] = ['ready', 'running', 'crossing'];

/** A placeholder HUD for the frames between pressing Start and the scene's first snapshot. */
function pendingSnapshot(): HudSnapshot {
  const s = store.getState();
  const level = s.selectedLevels[s.mode];
  const def = LEVELS[level]!;
  return {
    phase: 'ready', mode: s.mode, level, levelCount: LEVELS.length, levelCode: def.code, levelName: def.name,
    checkpointPct: (def.checkpoint / def.exit) * 100, checkpointReached: false, runners: [], cheats: false,
  };
}

let tapId = 0;

/** The race: Phaser stage plus every React overlay (HUD, toasts, countdown, dialogs, touch, cheats). */
export function GameScreen() {
  const snapshot = useStore((s) => s.session);
  const dialog = useStore((s) => s.dialog);
  const countdown = useStore((s) => s.countdown);
  const message = useStore((s) => s.message);
  const soundEnabled = useStore((s) => s.soundEnabled);
  const fullscreen = useStore((s) => s.fullscreen);
  const cheatOpen = useSelector(ui, (s) => s.cheatOpen);
  const cheatFeedback = useSelector(ui, (s) => s.cheatFeedback);
  useSelector(ui, (s) => s.keysVersion);

  const session = snapshot ?? pendingSnapshot();
  const { phase, mode } = session;
  const versus = mode === 'versus';
  const active = LIVE.includes(phase);

  // The single app-lifetime Phaser game moves into this stage while the view is mounted.
  const stageRef = useCallback((element: HTMLDivElement | null) => attachStage(element), []);

  // Touch buttons: remember what each pointer holds so its release names the same runner/action.
  const held = useRef(new Map<number, { runner: number; action: TouchAction }>());
  const onPress = (runner: number, action: TouchAction, id: number) => {
    held.current.set(id, { runner, action });
    bus.emit('touch-press', { runner, action, id });
  };
  const onRelease = (id: number) => {
    const finger = held.current.get(id);
    if (!finger) return;
    held.current.delete(id);
    bus.emit('touch-release', { ...finger, id });
  };
  // Keyboard or assistive-tech activation of a touch button: a one-step tap while running.
  const onTap = (runner: number, action: TouchAction) => {
    if (store.getState().session?.phase !== 'running') return;
    const id = -1 - tapId++;
    bus.emit('touch-press', { runner, action, id });
    bus.emit('touch-release', { runner, action, id });
  };

  const onToggleSound = () => {
    toggleSound();
    refocusGame();
  };

  const pauseContent = dialog?.kind === 'pause' && !cheatOpen ? dialog : null;
  const resultContent = dialog?.kind === 'result' ? dialog : null;
  const toast = message && (phase === 'running' || phase === 'paused') ? message : null;

  return (
    <section className="game-view" aria-label="Platformer">
      <GameTopBar
        level={session.level}
        levelCount={session.levelCount}
        levelCode={session.levelCode}
        levelName={session.levelName}
        pauseDisabled={phase !== 'running'}
        fullscreen={fullscreen}
        soundEnabled={soundEnabled}
        showSound={false}
        onHome={goHome}
        onPause={pauseRun}
        onToggleFullscreen={() => void toggleFullscreen()}
        onToggleSound={onToggleSound}
      />
      <RaceFrame
        hud={<RunnerHud runners={session.runners} cheats={session.cheats} />}
        stageRef={stageRef}
        legend={<ControlsList scheme={CONTROL_SCHEMES[mode]} />}
      >
        <BossBar boss={active || phase === 'paused' ? session.boss : null} />
        <RaceToast toast={toast} />
        <ProgressTrack runners={session.runners} checkpointPct={session.checkpointPct} />
        {countdown && <Countdown {...countdown} />}
        <CheatConsole open={cheatOpen} feedback={cheatFeedback} onSubmit={submitCheat} onClose={() => closeCheat()} />
      </RaceFrame>
      <TouchControls
        runners={session.runners}
        versus={versus}
        active={active}
        resetKey={active ? 'live' : phase}
        onPress={onPress}
        onRelease={onRelease}
        onTap={onTap}
      />
      <PauseDialog
        content={pauseContent}
        soundEnabled={soundEnabled}
        onResume={resumeRun}
        onHome={goHome}
        onGuide={openGuide}
        onToggleSound={toggleSound}
      />
      <ResultDialog content={resultContent} onRetry={retryRun} onHome={goHome} />
    </section>
  );
}
