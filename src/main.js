import './styles/arcade.css';
import { ACTIONS, GADGETS, GROUND_Y, H, LEVELS, MAX_MISSILES, PLAYER_COLORS, STEP_MS, W, World, createRunner } from './game/world.js';
import { drawRunner, render } from './game/render.js';
import { Sound } from './game/audio.js';

const $ = (selector) => document.querySelector(selector);
const menu = $('#menu');
const game = $('#game');
const dialog = $('#dialog');
const guide = $('#guide');
const track = $('#track');
const preview = $('#preview');
const raceWindow = $('#raceWindow');
const pause = $('#pause');
const levelOptions = $('#levelOptions');
const startButton = $('#start');
const raceMessage = $('#raceMessage');
const srStatus = $('#srStatus');
const fullscreenButtons = [...document.querySelectorAll('[data-action="fullscreen"]')];
const touchControls = $('#touchControls');
const progressTrack = $('#progressTrack');
const trackCtx = track.getContext('2d');
const previewCtx = preview.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
// Older builds stored these under 'dusk:' keys; read them once as a fallback and only write 'portal:' keys.
const sound = new Sound(read('portal:sound', read('dusk:sound', true)) !== false);
const COUNTDOWN_MS = { solo: 1250, versus: 2450 };
const CROSSING_MS = 1250;
const PULL_MS = 510;
const characters = {
  rick: { name: 'Rick', character: 'rick', color: PLAYER_COLORS[0] },
  morty: { name: 'Morty', character: 'morty', color: PLAYER_COLORS[1] },
};
const soloKeys = { KeyA: [0, 'left'], ArrowLeft: [0, 'left'], KeyD: [0, 'right'], ArrowRight: [0, 'right'], Space: [0, 'jump'], ArrowUp: [0, 'jump'], KeyW: [0, 'jump'], ArrowDown: [0, 'duck'], KeyS: [0, 'duck'], KeyF: [0, 'fire'], KeyG: [0, 'missile'] };
const versusKeys = { KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'jump'], KeyS: [0, 'duck'], KeyF: [0, 'fire'], KeyG: [0, 'missile'], ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowUp: [1, 'jump'], ArrowDown: [1, 'duck'], Enter: [1, 'fire'], NumpadEnter: [1, 'fire'], Slash: [1, 'missile'], NumpadDivide: [1, 'missile'] };
const scrollKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];
// Bindings are physical key positions (event.code); labels follow the player's layout when the browser exposes it.
const controlSchemes = {
  solo: [{ label: 'Solo', keys: [['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'], ['Space', 'ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS'], ['KeyF'], ['KeyG']] }],
  versus: [
    { label: 'Rick', keys: [['KeyA', 'KeyD'], ['KeyW'], ['KeyS'], ['KeyF'], ['KeyG']] },
    { label: 'Morty', keys: [['ArrowLeft', 'ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['Enter'], ['Slash']] },
  ],
};
const keyNames = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', Slash: '/' };
const keyName = (code) => keyNames[code] ?? code.replace(/^Key/, '');
const controlLabels = ['Move', 'Jump', 'Duck', 'Blaster', 'Missile'];
const fingers = new Map();
let best = count(read('portal:best', read('dusk:best', 0)));
let runs = count(read('portal:runs', read('dusk:runs', 0)));
let unlocked = clampLevel(read('portal:unlocked', 0));
let cleared = Math.min(LEVELS.length, Math.max(unlocked, count(read('portal:cleared', 0))));
let mode = read('portal:mode', 'solo') === 'versus' ? 'versus' : 'solo';
const selectedLevels = {
  solo: Math.min(unlocked, clampLevel(read('portal:solo-level', unlocked))),
  versus: clampLevel(read('portal:versus-level', 0)),
};
let pilot = read('portal:pilot', 'rick') === 'morty' ? 'morty' : 'rick';
let session = null;
let demoTick = 0;
let last = performance.now();
let needsDraw = true;
let previewOnScreen = true;
let previewLevel = -1;
let windowMode = false;
let changingFullscreen = false;
let dialogArmedAt = 0;
let swallowSpaceUp = false;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be disabled */ }
}
function setText(element, value) {
  if (element.textContent !== String(value)) element.textContent = value;
}
// #raceMessage is aria-hidden; screen readers hear game messages through this polite live region.
// Clearing first makes a repeated message announce again.
function announce(text) {
  srStatus.textContent = '';
  srStatus.textContent = text;
}
function scoreText(value) { return String(Math.max(0, value)).padStart(5, '0'); }
function clampLevel(value) { return Math.min(LEVELS.length - 1, Math.max(0, Math.floor(Number(value) || 0))); }
function count(value) { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? n : 0; }

Promise.resolve().then(() => navigator.keyboard?.getLayoutMap?.()).then((map) => {
  if (!map) return;
  for (const code of ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyF', 'KeyG', 'Slash']) {
    const key = map.get(code);
    if (key && /^[\x21-\x7e]$/.test(key)) keyNames[code] = key.toUpperCase();
  }
  if (session) $('#raceLegend').innerHTML = controlsMarkup(controlSchemes[session.mode]);
}).catch(() => { /* Layout names are optional; QWERTY labels stay. */ });

const demo = new World({ runner: createRunner({ ...characters.rick, x: 221 }), rival: createRunner({ ...characters.morty, x: 274 }) });
levelOptions.innerHTML = LEVELS.map((level, index) => `
  <button type="button" class="level-card" data-level="${index}" style="--stage:${level.rim};--stage-bg:${level.near}">
    <span class="level-number">${String(index + 1).padStart(2, '0')}</span>
    <strong>${level.short ?? level.name}</strong>
    <small></small>
  </button>`).join('');
const levelCards = [...levelOptions.children];

function saveSelection(runMode, level) {
  selectedLevels[runMode] = level;
  write(`portal:${runMode}-level`, level);
}

function updateGarage() {
  const selected = selectedLevels[mode];
  const versus = mode === 'versus';
  const level = LEVELS[selected];
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }
  $('#pilotSelect').hidden = versus;
  $('#versusInfo').hidden = !versus;
  setText($('#startLabel'), versus ? 'Start race' : 'Start solo');
  setText($('#startDetail'), versus ? level.name : `${characters[pilot].name} · ${level.name}`);
  setText($('#mapStatus'), versus ? 'Choose any level to race.' : cleared === LEVELS.length ? 'All levels cleared.' :'Clear a level to unlock the next.');
  setText($('#sceneCode'), level.code);
  setText($('#sceneName'), level.name);
  setText($('#best'), scoreText(best));
  setText($('#runs'), runs);
  levelCards.forEach((card, index) => {
    const locked = !versus && index > unlocked;
    const state = locked ? 'Locked' : !versus && index < cleared ? 'Cleared' : 'Ready';
    card.disabled = locked;
    card.setAttribute('aria-pressed', String(index === selected));
    card.setAttribute('aria-label', `Level ${index + 1}: ${LEVELS[index].name}, ${state}`);
    setText(card.querySelector('small'), index === selected ? (state === 'Cleared' ? 'Cleared' : 'Selected') : state);
  });
  if (previewLevel !== selected) {
    demo.loadLevel(selected);
    previewLevel = selected;
    for (const runner of demo.runners) runner.invuln = 0;
    demo.obstacles = [{ type: 'slime', wx: 703, y: 298, w: 52, h: 42, phase: 1 }];
    demo.orbs = [{ kind: 'shield', wx: 416, y: 222, phase: 2 }, { kind: 'boots', wx: 650, y: 200, phase: 3 }];
  }
  needsDraw = true;
}
updateGarage();

for (const radio of document.querySelectorAll('[name="pilot"]')) {
  radio.checked = radio.value === pilot;
  radio.addEventListener('change', () => {
    pilot = radio.value;
    write('portal:pilot', pilot);
    updateGarage();
    unlockSound();
    sound.click();
  });
}
for (const canvas of document.querySelectorAll('[data-portrait]')) {
  // Render at 4x the 48px CSS width so the busts stay sharp on high-density screens.
  canvas.width = 176;
  canvas.height = 208;
  const ctx = canvas.getContext('2d');
  ctx.scale(4.36, 4.36);
  drawRunner(ctx, { ...createRunner({ ...characters[canvas.dataset.portrait], x: -4 }), feet: 77 }, { shadow: false });
}

// Audio is optional: a browser that refuses an AudioContext must never stop the game.
function unlockSound() {
  try { sound.unlock(); } catch { /* play silently */ }
}
function syncSound() {
  const button = $('#sound');
  button.classList.toggle('is-muted', !sound.enabled);
  button.setAttribute('aria-label', sound.enabled ? 'Mute sound' : 'Unmute sound');
  const pauseSound = $('#pauseSound');
  if (pauseSound) setText(pauseSound, sound.enabled ? 'Mute sound' : 'Unmute sound');
}
function toggleSound() {
  sound.setEnabled(!sound.enabled);
  if (sound.enabled) { unlockSound(); sound.click(); }
  write('portal:sound', sound.enabled);
  syncSound();
}
syncSound();
$('#sound').addEventListener('click', () => {
  toggleSound();
  // A focused header button would otherwise take Space and Enter away from the runner.
  if (session && !dialog.open) track.focus({ preventScroll: true });
});

function syncFullscreen() {
  const active = Boolean(document.fullscreenElement || windowMode);
  document.documentElement.classList.toggle('fullscreen-mode', active);
  for (const button of fullscreenButtons) {
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    button.title = active ? 'Exit fullscreen (V)' : 'Fullscreen (V)';
  }
  setText($('#gameFullscreen span'), active ? 'Exit fullscreen' : 'Fullscreen');
  if (active && session) window.scrollTo(0, 0);
}

async function toggleFullscreen() {
  if (changingFullscreen) return;
  changingFullscreen = true;
  try {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); }
      catch { /* The browser still owns the fullscreen state. */ }
    } else if (windowMode) windowMode = false;
    else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); }
      catch { windowMode = true; }
    } else windowMode = true;
  } finally {
    changingFullscreen = false;
    syncFullscreen();
    if (session && !dialog.open) track.focus({ preventScroll: true });
  }
}
document.addEventListener('fullscreenchange', syncFullscreen);

function controlsMarkup(scheme) {
  return scheme.map(({ label, keys }) => `<div class="control-group">${scheme.length > 1 ? `<strong>${label}</strong>` : ''}${keys.map((group, index) => `<span class="control-pair"><span>${group.map((key) => `<kbd>${keyName(key)}</kbd>`).join(' ')}</span><span>${controlLabels[index]}</span></span>`).join('')}</div>`).join('');
}

function openGuide() {
  $('#guideControls').innerHTML = controlsMarkup(controlSchemes[session?.mode ?? mode]);
  guide.showModal();
}

function makeHud(s) {
  const hud = $('#raceHud');
  hud.innerHTML = s.world.runners.map((runner) => `
    <div class="runner-hud" style="--pilot:${runner.color}">
      <span class="runner-identity"><i></i><strong>${runner.name}</strong></span>
      <span class="runner-score"><small>SCORE</small><strong data-score>00000</strong></span>
      <span class="runner-ammo"><small>MISSILES</small><span class="ammo-stock"><strong data-ammo>3/5</strong><span class="ammo-pips" aria-hidden="true">${'<i></i>'.repeat(MAX_MISSILES)}</span></span></span>
      <span class="runner-gadget" data-gadget hidden></span>
    </div>`).join('');
  s.stats = [...hud.children].map((element) => ({
    score: element.querySelector('[data-score]'),
    ammo: element.querySelector('[data-ammo]'),
    pips: [...element.querySelectorAll('.ammo-pips i')],
    gadget: element.querySelector('[data-gadget]'),
    progress: null,
  }));
  progressTrack.innerHTML = `<i class="progress-checkpoint" aria-hidden="true"></i>${s.world.runners.map((runner) => `<i class="progress-pilot" role="meter" aria-label="${runner.name}’s progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" style="--pilot:${runner.color}"></i>`).join('')}`;
  [...progressTrack.querySelectorAll('.progress-pilot')].forEach((element, index) => { s.stats[index].progress = element; });
}

function makeControls(s) {
  const versus = s.mode === 'versus';
  $('#raceLegend').innerHTML = controlsMarkup(controlSchemes[s.mode]);
  touchControls.classList.toggle('is-versus', versus);
  touchControls.innerHTML = s.world.runners.map((runner, index) => `
    <div style="--pilot:${runner.color}" role="group" aria-label="${runner.name} controls">
      ${versus ? `<span>${runner.name}</span>` : ''}
      <button type="button" tabindex="-1" data-touch="left" data-runner="${index}" aria-label="${runner.name} move left">←</button>
      <button type="button" tabindex="-1" data-touch="right" data-runner="${index}" aria-label="${runner.name} move right">→</button>
      <button type="button" tabindex="-1" data-touch="duck" data-runner="${index}" aria-label="${runner.name} duck">Duck</button>
      <button type="button" tabindex="-1" data-touch="jump" data-runner="${index}" aria-label="${runner.name} jump">Jump</button>
      <button type="button" tabindex="-1" data-touch="fire" data-runner="${index}" aria-label="${runner.name} fire blaster">Blast</button>
      <button type="button" tabindex="-1" data-touch="missile" data-runner="${index}" aria-label="${runner.name} fire missile">Missile</button>
    </div>`).join('');
  s.missileButtons = [...touchControls.querySelectorAll('[data-touch="missile"]')];
}

function start(runMode, level = selectedLevels[runMode]) {
  mode = runMode;
  write('portal:mode', mode);
  const versus = runMode === 'versus';
  const runner = createRunner(versus ? characters.rick : characters[pilot]);
  const rival = versus ? createRunner(characters.morty) : undefined;
  const world = new World({ runner, rival, level });
  session = {
    mode: runMode, world, phase: 'ready', timer: 0, acc: 0, stats: [], messageTicks: 0,
    controls: world.runners.map(() => ({ held: ACTIONS.map(() => new Set()), pressed: new Set() })),
  };
  fingers.clear();
  makeHud(session);
  makeControls(session);
  menu.hidden = true;
  game.hidden = false;
  unlockSound();
  ready(session);
  window.scrollTo(0, 0);
  track.focus({ preventScroll: true });
}

function ready(s) {
  s.phase = 'ready';
  s.timer = COUNTDOWN_MS[s.mode];
  s.acc = 0;
  dialog.close();
  pause.disabled = true;
  raceMessage.hidden = true;
  progressTrack.style.setProperty('--checkpoint', `${(s.world.dimension.checkpoint / s.world.dimension.exit) * 100}%`);
  $('#countdown')?.remove();
  raceWindow.insertAdjacentHTML('beforeend', `<div class="countdown" id="countdown"><small>${s.mode === 'versus' ? 'RACE TO THE PORTAL' : `LEVEL ${s.world.level + 1}`}</small><strong>${s.mode === 'versus' ? '3' : 'READY'}</strong></div>`);
  sound.playMusic(false);
  sound.tick();
  announce(s.mode === 'versus' ? 'Race starting' : `Level ${s.world.level + 1}: ${s.world.dimension.name}. Get ready`);
  updateHUD(s);
  s.world.snapCamera = true;
  drawTrack(s);
}

function home() {
  if (!session) return;
  if (session.phase !== 'crossing') saveSelection(session.mode, session.world.level);
  bankBest(session);
  clearInput(session);
  session = null;
  sound.playMusic(false);
  game.hidden = true;
  dialog.close();
  $('#countdown')?.remove();
  menu.hidden = false;
  needsDraw = true;
  updateGarage();
  window.scrollTo(0, 0);
  startButton.focus({ preventScroll: true });
}

function updateHUD(s) {
  const world = s.world;
  setText($('#dimensionCode'), `LEVEL ${world.level + 1} / ${LEVELS.length} · ${world.dimension.code}`);
  setText($('#dimensionName'), world.dimension.name);
  world.runners.forEach((runner, index) => {
    const { score, ammo, gadget, pips, progress } = s.stats[index];
    setText(score, scoreText(world.scoreFor(runner)));
    const stock = `${runner.missiles}/${MAX_MISSILES}`;
    if (ammo.textContent !== stock || !ammo.dataset.ready) {
      setText(ammo, stock);
      ammo.dataset.ready = 'true';
      pips.forEach((pip, slot) => pip.classList.toggle('loaded', slot < runner.missiles));
      s.missileButtons[index].classList.toggle('is-empty', runner.missiles === 0);
    }
    const percent = Math.round(Math.min(1, Math.max(0, (runner.x - runner.startX) / (world.dimension.exit - runner.startX))) * 200) / 2;
    if (progress.dataset.position !== String(percent)) {
      progress.dataset.position = percent;
      progress.style.left = `${percent}%`;
      progress.setAttribute('aria-valuenow', percent);
    }
    progress.classList.toggle('is-out', !runner.alive);
    let status = '';
    if (!runner.alive && world.versus) status = 'Respawning…';
    else if (runner.boots && runner.shield) status = `Shield + boots ${Math.ceil(runner.boots / 60)}s`;
    else if (runner.boots) status = `Double jump ${Math.ceil(runner.boots / 60)}s`;
    else if (runner.shield) status = 'Shield ready';
    gadget.hidden = !status;
    setText(gadget, status);
  });
}

function clearInput(s) {
  for (const control of s.controls) {
    control.pressed.clear();
    for (const keys of control.held) keys.clear();
  }
  for (const { target } of fingers.values()) target.classList.remove('is-held');
  fingers.clear();
}

function showDialog(content, initialFocus) {
  $('#dialogCard').innerHTML = content;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector(initialFocus).focus();
  // Ignore Enter/Space briefly so a held or mashed game key cannot press the newly focused button.
  dialogArmedAt = performance.now() + 400;
}

function togglePause() {
  const s = session;
  if (s?.phase === 'running') {
    s.phase = 'paused';
    clearInput(s);
    sound.playMusic(false);
    showDialog(`
      <h2 id="dialogTitle">Paused</h2>
      <p id="dialogDetail">${s.world.dimension.name}${s.world.runner.checkpoint && !s.world.versus ? ' · Checkpoint reached' : ''}</p>
      <div class="dialog-actions"><button class="primary-button" data-action="pause">Resume</button><button class="back-button" data-action="home">Garage</button></div>
      <div class="pause-links"><button class="text-button" data-action="guide">How to play</button>
      <button class="text-button" id="pauseSound" data-action="sound">${sound.enabled ? 'Mute sound' : 'Unmute sound'}</button></div>`, '[data-action="pause"]');
  } else if (s?.phase === 'paused') {
    s.phase = 'running';
    s.acc = 0;
    dialog.close();
    unlockSound();
    sound.playMusic(true);
    track.focus({ preventScroll: true });
  }
}

// Saves a solo score as the personal best as soon as it beats the stored one, merging with other tabs.
function bankBest(s) {
  if (s.mode !== 'solo') return false;
  best = Math.max(best, count(read('portal:best', 0)));
  if (s.world.score <= best) return false;
  best = s.world.score;
  write('portal:best', best);
  return true;
}

function finish(s, completed, cause) {
  const { world, mode } = s;
  s.phase = 'over';
  s.overAt = performance.now();
  pause.disabled = true;
  raceMessage.hidden = true;
  clearInput(s);
  sound.playMusic(false);
  if (completed) sound.win();
  let title, detail, retry;
  let newBest = false;
  if (mode === 'versus') {
    title = world.winner ? `${world.winner.name} wins!` : 'A portal photo finish!';
    detail = world.winner ? `${world.winner.name} reached the exit first.` : 'Rick and Morty entered at the same time.';
    retry = 'Rematch';
  } else {
    runs = Math.max(runs, count(read('portal:runs', 0))) + 1;
    write('portal:runs', runs);
    newBest = bankBest(s);
    title = completed ? 'Back in the garage!' : { fall: 'You fell into a pit', 'sentry-hit': 'A sentry hit you', death: 'You hit a hazard' }[cause];
    detail = completed ? `You cleared ${LEVELS.at(-1).name} and made it home.` : world.runner.checkpoint ? 'Your checkpoint is ready.' : `Restart from the beginning of ${world.dimension.name}.`;
    retry = completed ? 'Play again' : world.runner.checkpoint ? 'Retry from checkpoint' : 'Retry level';
    if (!completed) s.canRetry = true;
  }
  showDialog(`
    ${newBest ? '<p class="result-tag" id="dialogTag">NEW PERSONAL BEST</p>' : ''}
    <h2 id="dialogTitle">${title}</h2><p id="dialogDetail">${detail}</p>
    <div class="result-stats">${world.runners.map((runner) => `<div style="--pilot:${runner.color}"><small>${runner.name}’s score</small><strong>${scoreText(world.scoreFor(runner))}</strong><span>${runner.kills} ${runner.kills === 1 ? 'hazard' : 'hazards'} cleared · ${runner.walls} ${runner.walls === 1 ? 'wall' : 'walls'} broken</span></div>`).join('')}</div>
    <div class="dialog-actions"><button class="primary-button" data-action="retry">${retry}</button><button class="back-button" data-action="home">Garage</button></div>`, '[data-action="retry"]');
}

function notify(s, text) {
  s.messageTicks = 155;
  raceMessage.hidden = false;
  setText(raceMessage, text);
  announce(text);
}

function enterPortal(s) {
  const { world, mode } = s;
  sound.playMusic(false);
  sound.rift();
  if (mode === 'solo') {
    cleared = Math.min(LEVELS.length, Math.max(cleared, count(read('portal:cleared', 0)), world.level + 1));
    write('portal:cleared', cleared);
  }
  if (mode === 'versus' || world.level === LEVELS.length - 1) {
    finish(s, true);
    return;
  }
  bankBest(s);
  unlocked = Math.max(unlocked, clampLevel(read('portal:unlocked', 0)), world.level + 1);
  write('portal:unlocked', unlocked);
  saveSelection('solo', world.level + 1);
  // Keep held directions so the runner moves at GO on the next level; drop taps and a held jump.
  for (const control of s.controls) {
    control.pressed.clear();
    control.held[ACTIONS.indexOf('jump')].clear();
  }
  s.phase = 'crossing';
  s.timer = CROSSING_MS;
  pause.disabled = true;
  raceMessage.hidden = true;
  $('#countdown')?.remove();
  raceWindow.insertAdjacentHTML('beforeend', `<div class="countdown portal-crossing" id="countdown"><small>ENTERING</small><strong>${LEVELS[world.level + 1].name}</strong></div>`);
  announce(`Entering ${LEVELS[world.level + 1].name}`);
}

const eventSounds = {
  jump: 'jump', orb: 'orb', launch: 'launch', blast: 'blast', empty: 'empty', boost: 'boost', bump: 'bump',
  fall: 'fall', death: 'hit', 'sentry-hit': 'hit', 'shield-hit': 'shieldHit', shield: 'gadget', boots: 'gadget',
  checkpoint: 'gadget', respawn: 'rift', regroup: 'rift',
  pulse: 'pulse', 'target-hit': 'targetHit', 'wall-break': 'wallBreak', 'enemy-charge': 'enemyCharge', 'enemy-fire': 'enemyFire',
};

function handleGameEvents(s) {
  const { world } = s;
  for (const { type, runner } of world.events.splice(0)) {
    const effect = eventSounds[type];
    if (effect) sound[effect]();
    const label = world.versus && runner ? runner.name + ' · ' : '';
    if (type === 'portal') enterPortal(s);
    else if (type === 'checkpoint') notify(s, label + 'Checkpoint saved');
    else if (GADGETS[type]) notify(s, label + GADGETS[type].name + (type === 'boots' ? ' · jump again in midair' : ' · one hit protected'));
    else if (type === 'empty') notify(s, label + 'Collect a green cell to reload');
    else if (type === 'wall-blocked') notify(s, label + 'Shoot the cracked wall to break through');
    else if (type === 'wall-break') notify(s, label + 'Wall breached');
    else if (type === 'regroup') notify(s, label + 'Warped back onto the shared screen');
    else if (type === 'shield-hit') notify(s, label + 'Shield absorbed the hit');
    else if (['death', 'fall', 'sentry-hit'].includes(type)) {
      if (world.versus) notify(s, label + 'Returning to checkpoint');
      else finish(s, false, type);
    }
  }
}

// `steps` is how many fixed 60 Hz steps passed since the last draw, so the camera eases at the
// same speed on every refresh rate and does not drift between simulation steps.
function drawCanvas(canvas, ctx, world, isPreview = false, steps = 0) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  // Keep the full jump height visible and at least 560 units of the track ahead on narrow screens.
  const scale = isPreview ? Math.max(width / W, height / H) : Math.min(height / H, width / 560);
  const viewWidth = width / scale;
  if (!isPreview) {
    const active = world.runners.filter((runner) => runner.alive);
    const front = Math.max(...(active.length ? active : world.runners).map((runner) => runner.x));
    const target = Math.max(0, Math.min(world.dimension.width - viewWidth, front - viewWidth * .42));
    if (world.snapCamera || Math.abs(target - world.camera) > viewWidth * .6) {
      world.camera = target;
      world.snapCamera = false;
    } else world.camera += (target - world.camera) * (1 - .8 ** steps);
  }
  render(ctx, world, { scale, viewWidth, offsetY: height - H * scale, preview: isPreview, reduceMotion: motion.matches, pixelRatio: dpr });
}

function drawTrack(s, steps = 0) { drawCanvas(track, trackCtx, s.world, false, steps); }
new ResizeObserver(() => { needsDraw = true; }).observe(preview);
new IntersectionObserver((entries) => {
  previewOnScreen = entries[entries.length - 1].isIntersecting;
  needsDraw = true;
}).observe(preview);
new ResizeObserver(() => {
  if (!session) return;
  if (session.phase === 'over') session.overAt = performance.now();
  drawTrack(session);
}).observe(track);
motion.addEventListener('change', () => { needsDraw = true; });
// Keep records in step with other open tabs; values only ever go up.
window.addEventListener('storage', () => {
  best = Math.max(best, count(read('portal:best', 0)));
  runs = Math.max(runs, count(read('portal:runs', 0)));
  unlocked = Math.max(unlocked, clampLevel(read('portal:unlocked', 0)));
  cleared = Math.min(LEVELS.length, Math.max(cleared, unlocked, count(read('portal:cleared', 0))));
  if (!session) updateGarage();
});

function frame(now) {
  // Schedule first so a stray error drops one frame instead of stopping the loop.
  requestAnimationFrame(frame);
  const dt = Math.min(now - last, 75);
  last = now;
  const s = session;
  if (!s) {
    if (previewOnScreen && (!motion.matches || needsDraw)) {
      if (!motion.matches) {
        demoTick += dt / STEP_MS;
        demo.tick = demoTick;
        demo.runners.forEach((runner, i) => {
          runner.vx = 2;
          runner.x = 220 + i * 62 + Math.sin(demoTick * .022 + i) * 20;
          runner.feet = GROUND_Y - Math.pow(Math.max(0, Math.sin(demoTick * .038 + i * 1.4)), 2) * 63;
          runner.grounded = runner.feet === GROUND_Y;
          runner.anim = demoTick * .21;
        });
      }
      drawCanvas(preview, previewCtx, demo, true);
      needsDraw = false;
    }
  } else if (s.phase !== 'paused') {
    let steps = 0;
    if (s.phase === 'running') {
      s.acc += dt;
      while (s.acc >= STEP_MS && s.phase === 'running') {
        s.acc -= STEP_MS;
        s.world.runners.forEach((runner, index) => {
          const controls = s.controls[index];
          ACTIONS.forEach((action, slot) => {
            runner.input[action] = controls.pressed.has(action) || (action !== 'missile' && controls.held[slot].size > 0);
          });
          controls.pressed.clear();
        });
        s.world.step();
        steps++;
        handleGameEvents(s);
        if (s.messageTicks && !--s.messageTicks) raceMessage.hidden = true;
      }
      sound.updateMusic(s.world.dimension);
      updateHUD(s);
    } else {
      // The world waits, but particles, shake and flashes keep the fixed simulation rate.
      s.acc += dt;
      while (s.acc >= STEP_MS) {
        s.acc -= STEP_MS;
        s.world.updateEffects();
        steps++;
      }
      if (s.phase === 'ready') {
        s.timer -= dt;
        if (s.timer <= 0) {
          $('#countdown')?.remove();
          s.phase = 'running';
          pause.disabled = false;
          sound.go();
          sound.playMusic(true);
          announce('Go');
        } else if (s.mode === 'versus') {
          const cue = $('#countdown strong');
          const next = String(Math.ceil(s.timer / (COUNTDOWN_MS.versus / 3)));
          if (cue && cue.textContent !== next) { cue.textContent = next; sound.tick(); }
        }
      } else if (s.phase === 'crossing') {
        s.timer -= dt;
        s.world.portalPull = Math.min(1, (CROSSING_MS - s.timer) / PULL_MS);
        if (s.timer <= 0) { s.world.nextLevel(); ready(s); }
      }
    }
    // The result card covers a still scene once its effects fade, so stop repainting under the blur.
    if (s.phase !== 'over' || now - s.overAt < 2000) drawTrack(s, steps);
  }
}
requestAnimationFrame(frame);

function press(index, action, key) {
  const controls = session.controls[index];
  const held = controls.held[ACTIONS.indexOf(action)];
  // Taps before GO only count while held, so an early missile tap cannot fire at the start.
  if (!held.size && session.phase === 'running') controls.pressed.add(action);
  held.add(key);
  return held;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  unlockSound();
  if (button.id === 'start') start(mode);
  else if (button.dataset.mode) {
    mode = button.dataset.mode;
    write('portal:mode', mode);
    sound.click();
    updateGarage();
  } else if (button.dataset.level !== undefined) {
    saveSelection(mode, Number(button.dataset.level));
    sound.click();
    updateGarage();
  } else if (button.dataset.action === 'guide') openGuide();
  else if (button.dataset.action === 'close-guide') guide.close();
  else if (button.dataset.action === 'fullscreen') void toggleFullscreen();
  else if (button.dataset.action === 'sound') toggleSound();
  else if (button.id === 'home' || button.dataset.action === 'home') home();
  else if (button.dataset.action === 'pause') togglePause();
  else if (button.dataset.action === 'retry' && session) {
    const s = session;
    if (s.canRetry) {
      s.canRetry = false;
      s.world.retry();
      unlockSound();
      ready(s);
      track.focus({ preventScroll: true });
    } else start(s.mode, s.mode === 'versus' ? s.world.level : 0);
  } else if (button.dataset.touch && event.detail === 0 && session?.phase === 'running') {
    session.controls[Number(button.dataset.runner)].pressed.add(button.dataset.touch);
  }
});

dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (session?.phase === 'paused') togglePause();
  else if (session?.phase === 'over') home();
});
// Browsers may refuse to cancel a repeated close request (Esc, Android back); never strand a finished run.
dialog.addEventListener('close', () => { if (session?.phase === 'over' && !dialog.open) home(); });

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') swallowSpaceUp = false;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (guide.open) return;
  if (dialog.open && ['Space', 'Enter', 'NumpadEnter'].includes(event.code) && (event.repeat || performance.now() < dialogArmedAt)) {
    event.preventDefault();
    if (event.code === 'Space') swallowSpaceUp = true;
    return;
  }
  if (event.code === 'Escape' && windowMode) {
    event.preventDefault();
    void toggleFullscreen();
    return;
  }
  if (event.code === 'Escape' && dialog.open && (event.repeat || session?.phase === 'over')) {
    event.preventDefault();
    return;
  }
  if (event.code === 'KeyV' && !event.repeat && !dialog.open) {
    event.preventDefault();
    void toggleFullscreen();
    return;
  }
  if (event.code === 'KeyM' && !event.repeat) toggleSound();
  if (!session) {
    if (!event.repeat && (event.code === 'Digit1' || event.code === 'Digit2')) start(event.code === 'Digit1' ? 'solo' : 'versus');
    return;
  }
  if (!event.repeat && ['KeyP', 'Escape'].includes(event.code) && ['running', 'paused'].includes(session.phase)) {
    event.preventDefault();
    togglePause();
    return;
  }
  const live = ['ready', 'running', 'crossing'].includes(session.phase);
  // Tab would move focus off the course (to the address bar or the Garage button) mid-run.
  if (event.code === 'Tab' && live) {
    event.preventDefault();
    return;
  }
  const mapping = (session.mode === 'versus' ? versusKeys : soloKeys)[event.code];
  if (!live || !(mapping || scrollKeys.includes(event.code))) return;
  if (['Space', 'Enter', 'NumpadEnter'].includes(event.code) && event.target instanceof HTMLButtonElement && !event.target.dataset.touch) return;
  event.preventDefault();
  if (event.code === 'Space') swallowSpaceUp = true;
  if (!mapping) return;
  if (!event.repeat) press(...mapping, event.code);
  // Auto-repeat re-arms a direction or blaster still held after pause, blur or a level change.
  else if (!['jump', 'missile'].includes(mapping[1])) session.controls[mapping[0]].held[ACTIONS.indexOf(mapping[1])].add(event.code);
});

window.addEventListener('keyup', (event) => {
  // A Space press the game consumed must not click a button that gained focus before its release.
  if (swallowSpaceUp && event.code === 'Space') {
    swallowSpaceUp = false;
    event.preventDefault();
  }
  if (!session) return;
  const mapping = (session.mode === 'versus' ? versusKeys : soloKeys)[event.code];
  if (mapping) session.controls[mapping[0]].held[ACTIONS.indexOf(mapping[1])].delete(event.code);
});
window.addEventListener('blur', () => {
  if (!session) return;
  clearInput(session);
  // Pause when focus really leaves the page, so the run does not continue unattended.
  setTimeout(() => { if (!document.hasFocus() && session?.phase === 'running') togglePause(); }, 150);
});
// Touchscreen laptops report a fine primary pointer; show the touch controls once a finger is used.
window.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') document.documentElement.classList.add('touch-input');
}, { passive: true });
const wakeAudio = () => { if (sound.enabled && sound.ctx && sound.ctx.state !== 'running') unlockSound(); };
for (const type of ['pointerup', 'touchend', 'keydown']) window.addEventListener(type, wakeAudio, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (session?.phase === 'running') togglePause(); }
  else wakeAudio();
});

function holdPointer(event, target, index, action) {
  if (event.type === 'pointerdown' && event.button !== 0) return;
  if (!session || !['ready', 'running', 'crossing'].includes(session.phase)) return;
  event.preventDefault();
  fingers.set(event.pointerId, { keys: press(index, action, event.pointerId), target });
  target.classList.add('is-held');
  target.setPointerCapture?.(event.pointerId);
}
function releasePointer(id) {
  const finger = fingers.get(id);
  if (!finger) return;
  finger.keys.delete(id);
  fingers.delete(id);
  if (![...fingers.values()].some(({ target }) => target === finger.target)) finger.target.classList.remove('is-held');
}
touchControls.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('[data-touch]');
  if (button) holdPointer(event, button, Number(button.dataset.runner), button.dataset.touch);
});
track.addEventListener('pointerdown', (event) => {
  if (session?.mode !== 'solo') return;
  holdPointer(event, track, 0, 'jump');
});
for (const surface of [track, touchControls]) surface.addEventListener('contextmenu', (event) => { if (session) event.preventDefault(); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  window.addEventListener(name, (event) => {
    const finger = fingers.get(event.pointerId);
    // A capture handed to another d-pad button reports a stale loss on the previous one.
    if (!finger || (name === 'lostpointercapture' && event.target !== finger.target)) return;
    releasePointer(event.pointerId);
  });
}
// Rocking a thumb between ← and → switches direction without lifting it.
window.addEventListener('pointermove', (event) => {
  const finger = fingers.get(event.pointerId);
  if (!finger || event.pointerType !== 'touch' || !['left', 'right'].includes(finger.target.dataset.touch)) return;
  const next = document.elementFromPoint(event.clientX, event.clientY)?.closest('#touchControls [data-touch="left"], #touchControls [data-touch="right"]');
  if (!next || next === finger.target || next.dataset.runner !== finger.target.dataset.runner) return;
  releasePointer(event.pointerId);
  holdPointer(event, next, Number(next.dataset.runner), next.dataset.touch);
});
