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
const fullscreenButtons = [...document.querySelectorAll('[data-action="fullscreen"]')];
const touchControls = $('#touchControls');
const progressTrack = $('#progressTrack');
const trackCtx = track.getContext('2d');
const previewCtx = preview.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const sound = new Sound(read('dusk:sound', true));
const characters = {
  rick: { name: 'Rick', character: 'rick', color: PLAYER_COLORS[0] },
  morty: { name: 'Morty', character: 'morty', color: PLAYER_COLORS[1] },
};
const soloKeys = { KeyA: [0, 'left'], ArrowLeft: [0, 'left'], KeyD: [0, 'right'], ArrowRight: [0, 'right'], Space: [0, 'jump'], ArrowUp: [0, 'jump'], KeyW: [0, 'jump'], ArrowDown: [0, 'duck'], KeyS: [0, 'duck'], KeyF: [0, 'fire'], KeyG: [0, 'missile'] };
const versusKeys = { KeyA: [0, 'left'], KeyD: [0, 'right'], KeyW: [0, 'jump'], KeyS: [0, 'duck'], KeyF: [0, 'fire'], KeyG: [0, 'missile'], ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'], ArrowUp: [1, 'jump'], ArrowDown: [1, 'duck'], Enter: [1, 'fire'], NumpadEnter: [1, 'fire'], Slash: [1, 'missile'], NumpadDivide: [1, 'missile'] };
const controlSchemes = {
  solo: [{ label: 'Solo', keys: [['A', 'D', '←', '→'], ['Space', '↑', 'W'], ['↓', 'S'], ['F'], ['G']] }],
  versus: [
    { label: 'Rick', keys: [['A', 'D'], ['W'], ['S'], ['F'], ['G']] },
    { label: 'Morty', keys: [['←', '→'], ['↑'], ['↓'], ['Enter'], ['/']] },
  ],
};
const controlLabels = ['Move', 'Jump', 'Duck', 'Blaster', 'Missile'];
const levelNames = ['Badlands', 'Wastes', 'Citadel'];
const fingers = new Map();
let best = read('dusk:best', 0);
let runs = read('dusk:runs', 0);
let unlocked = clampLevel(read('portal:unlocked', 0));
let cleared = Math.min(LEVELS.length, Math.max(unlocked, Math.floor(Number(read('portal:cleared', 0)) || 0)));
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
let previewLevel = -1;
let windowMode = false;
let changingFullscreen = false;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be disabled */ }
}
function setText(element, value) {
  if (element.textContent !== String(value)) element.textContent = value;
}
function scoreText(value) { return String(Math.max(0, value)).padStart(5, '0'); }
function clampLevel(value) { return Math.min(LEVELS.length - 1, Math.max(0, Math.floor(Number(value) || 0))); }

const demo = new World({ runner: createRunner({ ...characters.rick, x: 221 }), rival: createRunner({ ...characters.morty, x: 274 }) });
levelOptions.innerHTML = LEVELS.map((level, index) => `
  <button type="button" class="level-card" data-level="${index}" style="--stage:${level.rim};--stage-bg:${level.near}">
    <span class="level-number">${String(index + 1).padStart(2, '0')}</span>
    <strong>${levelNames[index]}</strong>
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
  setText($('#mapStatus'), versus ? 'Choose any level to race.' : cleared === LEVELS.length ? 'All three levels cleared.' : 'Clear a level to unlock the next.');
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
    sound.unlock();
    sound.click();
  });
}
for (const canvas of document.querySelectorAll('[data-portrait]')) {
  const ctx = canvas.getContext('2d');
  ctx.scale(2.18, 2.18);
  drawRunner(ctx, { ...createRunner({ ...characters[canvas.dataset.portrait], x: -4 }), feet: 77 }, { shadow: false });
}

function syncSound() {
  const button = $('#sound');
  button.setAttribute('aria-pressed', String(sound.enabled));
  button.setAttribute('aria-label', sound.enabled ? 'Mute sound' : 'Unmute sound');
  const pauseSound = $('#pauseSound');
  if (pauseSound) setText(pauseSound, sound.enabled ? 'Mute sound' : 'Unmute sound');
}
function toggleSound() {
  sound.setEnabled(!sound.enabled);
  if (sound.enabled) { sound.unlock(); sound.click(); }
  write('dusk:sound', sound.enabled);
  syncSound();
}
syncSound();
$('#sound').addEventListener('click', toggleSound);

function syncFullscreen() {
  const active = Boolean(document.fullscreenElement || windowMode);
  document.documentElement.classList.toggle('fullscreen-mode', active);
  for (const button of fullscreenButtons) {
    button.setAttribute('aria-pressed', String(active));
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
  return scheme.map(({ label, keys }) => `<div class="control-group">${scheme.length > 1 ? `<strong>${label}</strong>` : ''}${keys.map((group, index) => `<span class="control-pair"><span>${group.map((key) => `<kbd>${key}</kbd>`).join(' ')}</span><span>${controlLabels[index]}</span></span>`).join('')}</div>`).join('');
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
    <div style="--pilot:${runner.color}" aria-label="${runner.name} controls">
      ${versus ? `<span>${runner.name}</span>` : ''}
      <button type="button" data-touch="left" data-runner="${index}" aria-label="${runner.name} move left">←</button>
      <button type="button" data-touch="right" data-runner="${index}" aria-label="${runner.name} move right">→</button>
      <button type="button" data-touch="duck" data-runner="${index}" aria-label="${runner.name} duck">Duck</button>
      <button type="button" data-touch="jump" data-runner="${index}" aria-label="${runner.name} jump">Jump</button>
      <button type="button" data-touch="fire" data-runner="${index}" aria-label="${runner.name} fire blaster">Blast</button>
      <button type="button" data-touch="missile" data-runner="${index}" aria-label="${runner.name} fire missile">Missile</button>
    </div>`).join('');
  s.missileButtons = [...touchControls.querySelectorAll('[data-touch="missile"]')];
}

function start(runMode, level = selectedLevels[runMode]) {
  mode = runMode;
  write('portal:mode', mode);
  const versus = runMode === 'versus';
  const runner = createRunner(versus ? characters.rick : characters[pilot]);
  const rival = versus ? createRunner({ ...characters.morty, x: 131 }) : undefined;
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
  sound.unlock();
  ready(session);
  window.scrollTo(0, 0);
  track.focus({ preventScroll: true });
}

function ready(s) {
  s.phase = 'ready';
  s.timer = s.mode === 'versus' ? 2450 : 1250;
  s.acc = 0;
  dialog.close();
  pause.disabled = true;
  raceMessage.hidden = true;
  progressTrack.style.setProperty('--checkpoint', `${(s.world.dimension.checkpoint / s.world.dimension.exit) * 100}%`);
  $('#countdown')?.remove();
  raceWindow.insertAdjacentHTML('beforeend', `<div class="countdown" id="countdown"><small>${s.mode === 'versus' ? 'RACE TO THE PORTAL' : `LEVEL ${s.world.level + 1}`}</small><strong>${s.mode === 'versus' ? '3' : 'READY'}</strong></div>`);
  sound.playMusic(false);
  sound.tick();
  updateHUD(s);
  drawTrack(s);
}

function home() {
  if (!session) return;
  if (session.phase !== 'crossing') saveSelection(session.mode, session.world.level);
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
}

function togglePause() {
  const s = session;
  if (s?.phase === 'running') {
    s.phase = 'paused';
    clearInput(s);
    sound.playMusic(false);
    showDialog(`
      <h2 id="dialogTitle">Paused</h2>
      <p>${s.world.dimension.name}${s.world.runner.checkpoint && !s.world.versus ? ' · Checkpoint reached' : ''}</p>
      <div class="dialog-actions"><button class="primary-button" data-action="pause">Resume</button><button class="back-button" data-action="home">Garage</button></div>
      <div class="pause-links"><button class="text-button" data-action="guide">How to play</button>
      <button class="text-button" id="pauseSound" data-action="sound">${sound.enabled ? 'Mute sound' : 'Unmute sound'}</button></div>`, '[data-action="pause"]');
  } else if (s?.phase === 'paused') {
    s.phase = 'running';
    s.acc = 0;
    dialog.close();
    sound.unlock();
    sound.playMusic(true);
    track.focus({ preventScroll: true });
  }
}

function finish(s, completed, cause) {
  const { world, mode } = s;
  s.phase = 'over';
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
    runs++;
    newBest = world.score > best;
    best = Math.max(best, world.score);
    write('dusk:best', best);
    write('dusk:runs', runs);
    title = completed ? 'Back in the garage!' : { fall: 'You fell into a pit', 'sentry-hit': 'A sentry hit you', death: 'You hit a hazard' }[cause];
    detail = completed ? 'You cleared the Citadel and made it home.' : world.runner.checkpoint ? 'Your checkpoint is ready.' : `Restart from the beginning of ${world.dimension.name}.`;
    retry = completed ? 'Play again' : world.runner.checkpoint ? 'Retry from checkpoint' : 'Retry level';
    if (!completed) s.canRetry = true;
  }
  showDialog(`
    ${newBest ? '<p class="result-tag">NEW PERSONAL BEST</p>' : ''}
    <h2 id="dialogTitle">${title}</h2><p>${detail}</p>
    <div class="result-stats">${world.runners.map((runner) => `<div style="--pilot:${runner.color}"><small>${runner.name}’s score</small><strong>${scoreText(world.scoreFor(runner))}</strong><span>${runner.kills} ${runner.kills === 1 ? 'hazard' : 'hazards'} cleared · ${runner.walls} ${runner.walls === 1 ? 'wall' : 'walls'} broken</span></div>`).join('')}</div>
    <div class="dialog-actions"><button class="primary-button" data-action="retry">${retry}</button><button class="back-button" data-action="home">Garage</button></div>`, '[data-action="retry"]');
}

function notify(s, text) {
  s.messageTicks = 155;
  raceMessage.hidden = false;
  setText(raceMessage, text);
}

function enterPortal(s) {
  const { world, mode } = s;
  clearInput(s);
  sound.playMusic(false);
  sound.rift();
  if (mode === 'solo') {
    cleared = Math.max(cleared, world.level + 1);
    write('portal:cleared', cleared);
  }
  if (mode === 'versus' || world.level === LEVELS.length - 1) {
    finish(s, true);
    return;
  }
  unlocked = Math.max(unlocked, world.level + 1);
  write('portal:unlocked', unlocked);
  saveSelection('solo', world.level + 1);
  s.phase = 'crossing';
  s.timer = 1250;
  pause.disabled = true;
  raceMessage.hidden = true;
  $('#countdown')?.remove();
  raceWindow.insertAdjacentHTML('beforeend', `<div class="countdown portal-crossing" id="countdown"><small>ENTERING</small><strong>${LEVELS[world.level + 1].name}</strong></div>`);
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

function drawCanvas(canvas, ctx, world, isPreview = false) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = Math.round(canvas.clientWidth * dpr);
  const height = Math.round(canvas.clientHeight * dpr);
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const expandedRace = !isPreview && (document.fullscreenElement || windowMode);
  // Keep the full jump height visible and at least 560 units of the track ahead on narrow screens.
  const scale = expandedRace ? Math.min(height / H, width / 560) : Math.max(width / W, height / H);
  const viewWidth = width / scale;
  if (!isPreview) {
    const active = world.runners.filter((runner) => runner.alive);
    const front = Math.max(...(active.length ? active : world.runners).map((runner) => runner.x));
    const target = Math.max(0, Math.min(world.dimension.width - viewWidth, front - viewWidth * .42));
    if (Math.abs(target - world.camera) > viewWidth * .6) world.camera = target;
    else world.camera += (target - world.camera) * .2;
  }
  render(ctx, world, { scale, viewWidth, offsetY: height - H * scale, preview: isPreview, reduceMotion: motion.matches });
}

function drawTrack(s) { drawCanvas(track, trackCtx, s.world); }
new ResizeObserver(() => { needsDraw = true; }).observe(preview);
new ResizeObserver(() => { if (session) drawTrack(session); }).observe(track);
motion.addEventListener('change', () => { needsDraw = true; });

function frame(now) {
  const dt = Math.min(now - last, 75);
  last = now;
  const s = session;
  if (!s) {
    if (!motion.matches || needsDraw) {
      if (!motion.matches) {
        demo.tick = ++demoTick;
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
    if (s.phase === 'ready') {
      s.timer -= dt;
      if (s.timer <= 0) {
        $('#countdown').remove();
        s.phase = 'running';
        pause.disabled = false;
        sound.go();
        sound.playMusic(true);
      } else if (s.mode === 'versus') {
        const cue = $('#countdown strong');
        const next = String(Math.ceil(s.timer / (2450 / 3)));
        if (cue.textContent !== next) { cue.textContent = next; sound.tick(); }
      }
    } else if (s.phase === 'running') {
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
        handleGameEvents(s);
        if (s.messageTicks && !--s.messageTicks) raceMessage.hidden = true;
      }
      sound.updateMusic(s.world.level);
      updateHUD(s);
    } else {
      s.world.updateEffects();
      if (s.phase === 'crossing') {
        s.timer -= dt;
        s.world.portalPull = Math.min(1, (1250 - s.timer) / 510);
        if (s.timer <= 0) { s.world.nextLevel(); ready(s); }
      }
    }
    drawTrack(s);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function press(index, action, key) {
  const controls = session.controls[index];
  const held = controls.held[ACTIONS.indexOf(action)];
  if (!held.size) controls.pressed.add(action);
  held.add(key);
  return held;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'start') start(mode);
  else if (button.dataset.mode) {
    mode = button.dataset.mode;
    write('portal:mode', mode);
    sound.unlock();
    sound.click();
    updateGarage();
  } else if (button.dataset.level !== undefined) {
    saveSelection(mode, Number(button.dataset.level));
    sound.unlock();
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
});

window.addEventListener('keydown', (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (guide.open) return;
  if (event.code === 'Escape' && windowMode) {
    event.preventDefault();
    void toggleFullscreen();
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
  const mapping = (session.mode === 'versus' ? versusKeys : soloKeys)[event.code];
  if (!mapping || !['ready', 'running'].includes(session.phase)) return;
  if (['Space', 'Enter', 'NumpadEnter'].includes(event.code) && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (!event.repeat) press(...mapping, event.code);
});

window.addEventListener('keyup', (event) => {
  if (!session) return;
  const mapping = (session.mode === 'versus' ? versusKeys : soloKeys)[event.code];
  if (mapping) session.controls[mapping[0]].held[ACTIONS.indexOf(mapping[1])].delete(event.code);
});
window.addEventListener('blur', () => { if (session) clearInput(session); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session?.phase === 'running') togglePause();
});

function holdPointer(event, target, index, action) {
  if (!session || !['ready', 'running'].includes(session.phase)) return;
  event.preventDefault();
  fingers.set(event.pointerId, { keys: press(index, action, event.pointerId), target });
  target.classList.add('is-held');
  target.setPointerCapture?.(event.pointerId);
}
touchControls.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('[data-touch]');
  if (button) holdPointer(event, button, Number(button.dataset.runner), button.dataset.touch);
});
track.addEventListener('pointerdown', (event) => {
  if (session?.mode !== 'solo') return;
  holdPointer(event, track, 0, 'jump');
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  window.addEventListener(name, (event) => {
    const finger = fingers.get(event.pointerId);
    if (!finger) return;
    finger.keys.delete(event.pointerId);
    fingers.delete(event.pointerId);
    if (![...fingers.values()].some(({ target }) => target === finger.target)) finger.target.classList.remove('is-held');
  });
}
