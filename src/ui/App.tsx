import { useEffect, useRef } from 'react';
import { CONTROL_SCHEMES } from '../core/input';
import { actions, store } from '../core/store';
import { Footer, GuideDialog, Masthead, RaceToast, SrStatus } from './components';
import { refocusGame, toggleFullscreen, toggleSound } from './hooks/controls';
import { closeGuide, goHome, openGuide, ui } from './hooks/session';
import { useAnnouncer } from './hooks/useAnnouncer';
import { useAppEffects } from './hooks/useAppEffects';
import { useGlobalKeys } from './hooks/useGlobalKeys';
import { useSelector, useStore } from './hooks/useStore';
import { GameScreen } from './screens/GameScreen';
import { GarageScreen } from './screens/GarageScreen';
import ShopScreen from './screens/ShopScreen';


/** Matches the old race toast lifetime (155 fixed steps). */
const MENU_TOAST_MS = 2600;

export function App() {
  // A string so the router can grow new screens ('shop') before core/store's Screen type does.
  const screen: string = useStore((s) => s.screen);
  const mode = useStore((s) => s.mode);
  const sessionMode = useStore((s) => s.session?.mode);
  const message = useStore((s) => s.message);
  const soundEnabled = useStore((s) => s.soundEnabled);
  const fullscreen = useStore((s) => s.fullscreen);
  const guideOpen = useSelector(ui, (s) => s.guideOpen);
  useSelector(ui, (s) => s.keysVersion);
  const announcement = useAnnouncer();
  const startRef = useRef<HTMLButtonElement>(null);

  useAppEffects();
  useGlobalKeys();

  // Back in the garage: focus Start, as main.js did.
  const lastScreen = useRef(screen);
  useEffect(() => {
    if (lastScreen.current !== screen && screen === 'menu') startRef.current?.focus({ preventScroll: true });
    lastScreen.current = screen;
  }, [screen]);

  // Toasts on the garage (Konami code) are not timed by the game scene; clear them here.
  useEffect(() => {
    if (screen !== 'menu' || !message) return;
    const id = message.id;
    const timer = window.setTimeout(() => {
      if (store.getState().message?.id === id) actions.clearMessage();
    }, MENU_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [screen, message]);

  const inGame = screen === 'game';

  return (
    <div className="shell">
      <Masthead
        soundEnabled={soundEnabled}
        fullscreen={fullscreen}
        showGuide={!inGame}
        onGuide={openGuide}
        onToggleSound={() => { toggleSound(); refocusGame(); }}
        onToggleFullscreen={() => void toggleFullscreen()}
        onHome={() => { if (inGame) goHome(); }}
      />
      <main>
        {screen === 'game' ? (
          <GameScreen />
        ) : screen === 'shop' ? (
          <ShopScreen />
        ) : (
          <GarageScreen startRef={startRef} />
        )}
        {screen === 'menu' && message && (
          <div className="pointer-events-none fixed inset-x-0 top-20 z-50">
            <div className="relative mx-auto max-w-md">
              <RaceToast toast={message} />
            </div>
          </div>
        )}
        <SrStatus message={announcement.text} seq={announcement.seq} />
      </main>
      <GuideDialog open={guideOpen} scheme={CONTROL_SCHEMES[sessionMode ?? mode]} onClose={closeGuide} />
      <Footer />
    </div>
  );
}

