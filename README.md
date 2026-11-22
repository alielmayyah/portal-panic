# Portal Panic

An unofficial browser platformer with three levels. Walk into the exit portal to advance, and touch a checkpoint flag before tackling the second half of a level.

- **Solo:** Choose Rick or Morty. The game saves unlocked levels, your character choice, and your personal best on this device.
- **Rick vs. Morty:** Race to the exit portal on the same screen. If a player falls or is hit, they return to their checkpoint and keep racing. A player who drops far behind is warped back onto the shared screen.

| Action | Solo | Rick in versus | Morty in versus |
| --- | --- | --- | --- |
| Move | A / D or ← / → | A / D | ← / → |
| Jump | Space / ↑ / W | W | ↑ |
| Duck or dive | ↓ / S | S | ↓ |
| Fire blaster (hold to repeat) | F | F | Enter |
| Fire a missile | G | G | / |

Hold jump to go higher. Your blaster has unlimited shots. Shoot cracked walls until they break, time jumps onto moving platforms, and duck or jump when sentry drones charge. Each portal cell adds 25 points and reloads a missile. A phase shield absorbs one hit. Gravity boots give you ten seconds of double jumps.

Press **P** or **Esc** to pause and **M** to mute. On the menu, press **1** to start Solo or **2** to start Versus. Use **V** or the **Fullscreen** button beside Pause to expand the game. In fullscreen, **Esc** leaves fullscreen instead of pausing. Phones and tablets show movement, jump, duck, blaster and missile buttons. In Solo you can also tap the game view to jump.

Double-click `portal-panic.html` to play directly. Both modes work offline.

Requires Node.js 20.19+ or 22.12+. For development, run `npm install` and `npm run dev`. Run `npm run build` to build the static site into `dist/` and refresh the standalone HTML. Run `npm start` to serve the static build locally.
