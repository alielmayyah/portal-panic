# Portal Panic

An unofficial browser platformer with eight levels and two bosses. Walk into the exit portal to advance, and touch a checkpoint flag before tackling the second half of a level.

Built with Phaser 3, React 18 and TypeScript, Vite, GSAP, Tailwind CSS v4 and Sass.

## Modes

- **Solo:** Choose Rick or Morty. The game saves unlocked levels, your character choice, and your personal best on this device.
- **Rick vs. Morty:** Race to the exit portal on the same screen. If a player falls or is hit, they return to their checkpoint and keep racing. A player who drops far behind is warped back onto the shared screen.

## Controls

| Action | Solo | Rick in versus | Morty in versus |
| --- | --- | --- | --- |
| Move | A / D or ← / → | A / D | ← / → |
| Jump | Space / ↑ / W | W | ↑ |
| Duck, slide or dive | ↓ / S | S | ↓ |
| Fire blaster (hold to repeat) | F | F | Right Shift |
| Fire a missile | G | G | \ (Backslash) |
| Swap weapon | Q | Q | Right Ctrl |

Hold jump to go higher. Your blaster has unlimited shots. Shoot cracked walls until they break and time jumps onto moving platforms.

- **Duck:** Ducking drops under drone shots, and a "Dodged!" toast confirms each one you avoid. When a sentry drone starts charging at you, a duck hint appears. Duck while running to start a slide that keeps your momentum. Duck in midair to dive.
- **Hazards:** Crystals are deadly red spikes, so jump over them. Slimes, drone shots and falls also send you back to your checkpoint.
- **Pickups:** Each portal cell adds 25 points and reloads a missile. A phase shield absorbs one hit. Gravity boots give you ten seconds of double jumps.
- **Checkpoints:** Respawning at a checkpoint brings back every monster you killed. Broken walls stay broken. In versus, monsters return only where neither player can see them appear.

## Levels

| # | Level | Notes |
| --- | --- | --- |
| 1 | Alien Badlands | |
| 2 | Cronenberg Wastes | |
| 3 | The Citadel | |
| 4 | Frozen Moon | Mid-boss: Brood Warden Gulvax |
| 5 | Neon Sprawl | |
| 6 | Toxic Mire | |
| 7 | Sky Islands | |
| 8 | The Maw | Final boss: Rift Tyrant Ozzaroth |

## Monsters and bosses

- **Hopper:** hops toward you in arcs.
- **Swooper:** dives in a curve. Duck under it.
- **Spitter:** a turret that swells before lobbing arcing goo.
- **Brute:** armored in front and charges. Hit it from behind, jump over it, or use a missile.
- **Splitter:** splits into two small blobs when it dies.

Bosses have three phases with an HP bar. They fire orb volleys (alternate ducking and jumping), dash across the arena and summon minions. The exit portal stays sealed until the boss dies. Boss fights have their own music that intensifies each phase.

## Superpowers

| Power | Lasts | Effect |
| --- | --- | --- |
| Turbo | 8 s | Faster running and higher jumps |
| Magnet | 10 s | Pulls in nearby cells and coins |
| Freeze | 5 s | Stops enemies and their shots |
| Ghost | 4 s | Pass through hazards and shots |
| Rapid fire | 10 s | Weapon cooldowns halved |
| Giant | 6 s | Double size, stomps monsters, immune to shots |

Powers end when you die.

## Shop

Earn coins from cells, kills, broken walls, monster drops, bosses and level clears. Coins are banked at the end of each run. Open the **Shop** from the garage to buy weapons and upgrades, and equip a weapon per pilot.

| Weapon | Price | Notes |
| --- | --- | --- |
| Pocket Blaster | free | The default pulse pistol |
| Scatter Fan | 120 | Three pellets in a fan |
| Ricochet Orb | 180 | Bounces along the ground |
| Ember Hose | 200 | Short continuous flame (hold) |
| Prism Lance | 240 | Instant piercing beam |
| Hornet Pods | 280 | Two homing seekers |
| Nova Cannon | 340 | Hold to charge; full charge pierces |

Upgrades: **Missile rack** (+1 missile, up to 8) and **Pocket shield** (start each level with a phase shield).

Press **P** or **Esc** to pause and **M** to mute. On the menu, press **1** to start Solo or **2** to start Versus. Use **V** or the **Fullscreen** button beside Pause to expand the game. In fullscreen, **Esc** leaves fullscreen instead of pausing. Phones and tablets show movement, jump, duck, blaster and missile buttons. In Solo you can also tap the game view to jump.

## Cheat codes

Press **`** (Backquote) during a run to open the cheat console. The game pauses while it is open. Type a code and press **Enter** to apply it, or press **Esc** or **`** to close the console. Codes ignore case and spaces.

| Code | Effect |
| --- | --- |
| `GODMODE` | Toggles invincibility. Hazards and shots cannot hurt you, and a fall puts you back on safe ground. |
| `AMMO` | Fills your missiles. |
| `INFINITEAMMO` | Toggles unlimited missiles. |
| `SHIELD` | Gives you a phase shield. |
| `BOOTS` | Gives you gravity boots. |
| `SKIP` | Finishes the current level (Solo only). |
| `UNLOCKALL` | Unlocks every level. |

Entering the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) on the menu also unlocks every level. When you use any cheat other than `UNLOCKALL` in a Solo run, the HUD shows a **CHEATS** tag and the run does not save a personal best.

## Play offline

Double-click `portal-panic.html` to play directly. Both modes work offline.

## Development

Requires Node.js 20.19+ or 22.12+. Run `npm install` first.

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite dev server. |
| `npm run build` | Type-checks, builds the static site into `dist/`, and regenerates `portal-panic.html`. |
| `npm test` | Runs the Vitest suite once. |
| `npm run typecheck` | Runs the TypeScript compiler without emitting files. |
| `npm start` | Serves the built `dist/` folder locally. |

The standalone step (`scripts/standalone.mjs`) inlines the single JS bundle and stylesheet into `portal-panic.html`. It fails the build if Vite emits any other file, such as an extra chunk, font, image or wasm module. CI checks that the committed `portal-panic.html` matches the build, so commit it after you run `npm run build`.

## Project structure

```
index.html            Page shell that mounts the React app
src/main.tsx          React entry point
src/core/             Renderer-independent game logic: World simulation, levels, enemies and bosses,
                      powers, weapons and shop, input maps, cheats, localStorage helpers, and the store and event bus shared by React and Phaser
src/phaser/           Phaser game config, the game and menu preview scenes, and drawing and effects
src/ui/               React components, hooks and GSAP animations (menu, HUD, dialogs, touch controls,
                      cheat console)
src/audio/            Synthesized sound effects and music
src/styles/           Sass styles with the Tailwind import
tests/                Vitest tests for the core logic and audio
scripts/standalone.mjs  Builds the offline portal-panic.html
```
