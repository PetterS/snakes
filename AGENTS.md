# Working on Djupt under

## Project and product decisions

- This is a small, dependency-free browser game, hosted at <https://petters.github.io/snakes/>. The repository is `PetterS/snakes`.
- The primary device is **Safari on iPad**. Mouse and keyboard play also work. Preserve the original **hold-to-steer** touch interaction: hold a finger in the direction the miner should move, and release to stop. Do not replace it with a mandatory joystick or drag gesture.
- The game fills the browser viewport. Keep the HUD and tools over the playfield, with no surrounding landing page or page scrolling. This does not require the browser Fullscreen API.
- **All player-facing text is Swedish only**, including menus, hints, accessibility labels, biome names, relics, powers, and upgrades. Code identifiers, comments, and developer documentation can remain English. The page language is `sv`.
- Keep it entirely static and usable by opening `index.html` directly with a `file://` URL. No HTTP server, bundler, package installation, backend, or account is required to play. Avoid module imports, runtime fetches, or external assets that would break direct file loading.
- The user explicitly said Chrome testing is sufficient on this computer. Do not install Safari/WebKit or system dependencies just to verify a change. Chrome emulation is not proof of testing on a physical iPad; report verification accurately.
- The user asked to use the normal edit/patch tool for source changes. Prefer `apply_patch` over shell heredocs or scripts that rewrite files.
- This is still a test repository. Do not add a README or repository description unless requested. An earlier `README.md` remains untracked locally; leave it out of commits.

## Code layout

| File | Responsibility |
| --- | --- |
| `index.html` | Full-viewport canvas, HUD, tool buttons, overlays, Swedish accessibility text, and script/style references. |
| `style.css` | Responsive layout, safe-area spacing, touch target sizes, menus and HUD styling. |
| `engine.js` | Deterministic simulation: world generation, movement, snakes, combat, loot, relic choices, and expedition results. No DOM or browser dependencies. Exports `DeepBelow` in the browser and CommonJS exports for Node tests. |
| `game.js` | Canvas rendering, pointer/keyboard input, menus, sound, local saves, and consuming engine events. |
| `tests/game.test.cjs` | Node tests for generation, reachability, complete expeditions, snakes, tools, damage, payouts, and powers. |
| `tests/browser_check.py` | Playwright checks against an existing Chrome instance: actual touch tools, multiple pointers, cancellation, responsive layout, relic UI, victory, and upgrades. Dependencies are pinned in its inline `uv` metadata. |

Load `engine.js` before `game.js`. Keep gameplay rules in the engine and rendering/input/storage in `game.js`. Use `emit()` / `drainEvents()` to connect gameplay events to effects and menus. Do not add production debug state to support tests: the browser test injects its own instrumented `Game` constructor.

## Current game design

- Each expedition generates a seeded 58 × 184 tile world. Tiles are open tunnel (`0`), diggable earth (`1`), rock (`2`), unbreakable seal (`3`), or closed gate (`4`). The surface is row 3; one tile represents two metres of depth.
- The upper regions are **Rotdjupet**, **Kristallkatedralen**, and **Glödvalvet**. Recover **Vildmarkens hjärta**, **Månens tår**, and **Den sovande solen** to open **Nattporten**, at column 29, row 94. Its surrounding magical barrier cannot be drilled through, even after the gate opens.
- Below are **Asksvalget**, **De namnlösas salar**, and **Nattens avgrund**. Their relics are **Korpsångens krona**, **Den namnlöses öga**, and **Det sista andetaget**. Their positions vary and stay off the compass/map until discovered. Vision is shorter below; the minimap switches between the upper caves and the netherworld.
- The HUD shows only the first three relic slots until Nattporten opens. Then it reveals the three lower slots; its accessibility label follows the same visible total.
- Relic rooms have guaranteed diggable access and a return route through the gate. Preserve reachability and the sealed boundary when changing generation. Tests cover 100 seeds with the gate both closed and open.
- Each relic approach has two open flanking passages, a short rock ridge marked with gold cracks, and a side alcove for flare lures. A six-tile drill crosses the ridge. Preserve existing snake bodies when placing rock, and keep veins from erasing these shortcuts.
- Snakes move through open tunnels, including newly excavated player tunnels. They briefly stop on first detection (0.7 seconds above, 0.5 below), see through open passages, and investigate the location of digging noise. Without renewed sight or sound, they search the last known position for three seconds above/four and a half below. Opening the gate increases detection ranges and speed, without granting sight through walls. Spökstövlar suppresses pick noise; the drill stays loud. Flares override pursuit and lure nearby heads before stunning them. Snakes stay below the safe surface area.
- Ambient snakes cluster around encounter depths, leaving quieter gaps. Four lantern refuges—Rotvilan, Kristallvilan, Asklyktan, and Minnesljuset—have a visible three-tile protection circle. Snakes cannot enter it; horrors cancel attacks while the player rests there and cannot rush across it. Each refuge receives an existing supply chest; resting itself never heals. Discovered refuges appear on the minimap.
- Lower relics have distinct clue trails: bleka fjädrar, ögonristningar, and glödande sprickor. Marks follow diggable routes from the gate/previous relic, via nearby rest stops, and brighten near their destination. Their direction and spacing must remain followable within the normal lamp range. Clues never reveal a relic's coordinates on the compass/map; actual discovery still does. Taken relics hide their old trail, and a new expedition resets all clue/refuge state.
- Netherworld snakes are faster, inflict two hearts of damage, and recover from stuns sooner. Each lower relic increases pursuit speed further. Horrors cross walls, mark a fixed attack location for 1.5 seconds, then rush it. They remain below the gate; flares interrupt/repel them and drilling stuns them.
- The rechargeable drill bursts six tiles in the facing direction, breaks rock, and briefly protects the player. Flares consume charges, immediately stun nearby snakes, and attract others. Never let drilling destroy the seal or closed gate.
- Collecting diamonds quickly builds a multiplier. Supply chests provide diamonds, one heart, and one flare. Upper relics give 30 diamonds; lower relics give 90. Each also gives healing, a revealed area, and a choice of three expedition powers from a pool of nine.
- Diamonds form branching, diggable veins leading toward snake patrols, with a small pocket at every patrol. Generation retains each biome's original diamond count and value; the safe opening stays intact. Visible neighbouring gems have mineral threads; unseen gems stay hidden.
- The four-second diamond streak reaches ×2/×3/×4 at 5/10/15 gems. A meter inside the haul card shows time remaining; each tier triggers one celebration. Dig events distinguish earth/rock and facing direction for pick swings, directional debris, and optional sound. Effects never delay input; reduced-motion mode suppresses the new pulses and expanding combo rings.
- **Själslykta** expands vision, **Skuggmantel** reduces heavy hits to one heart and extends damage protection, and **Sista glöden** restores health/flares and doubles future chest supplies. Existing powers remain available.
- Players may return early, including with three to five relics, and press **Säkra fynden** to bank their haul. Collecting all six relics and surfacing ends the expedition automatically. Rescue after defeat saves one quarter of the haul. The gate and all expedition state reset on a new run.
- Banked diamonds buy permanent pick, drill, and health upgrades, each with three levels. Expedition powers reset on the next run; purchased camp upgrades persist.
- Save data uses `localStorage` key `deep-below-camp` with `bank`, `best`, `runs`, `wins`, and `upgrades` (`pick`, `boots`, `armor`). Validate loaded values and tolerate unavailable storage. Progress is local to that browser/origin, not synced between devices or between `file://` and the hosted site.

## Touch and Safari requirements

- Exactly one captured pointer owns steering. Track its `pointerId`; additional canvas fingers must not steal control.
- A second finger can activate **Turboborra** or **Bloss** while the first remains held down. Tool actions run on `pointerdown`, not only on the eventual `click`.
- Prevent default tool pointer handling from moving focus or starting a gesture. Keep keyboard/accessibility click activation, but suppress synthesized duplicate clicks so a single touch never spends two flares.
- Releasing or cancelling a tool finger must not stop steering. Clear steering only for the matching pointer ID, or on deliberate interruption such as pause, blur, visibility loss, or resize.
- Handle `pointerup`, `pointercancel`, and `lostpointercapture`; do not leave movement stuck after an interrupted touch.
- Preserve `touch-action: none` on the playfield/tools, safe-area insets, and large touch targets. Tools currently exceed the 44 CSS pixel minimum tested by the browser suite.
- Keep portrait and landscape usable. Coordinate conversion must account for canvas display scale; high-DPI rendering is capped at device pixel ratio 2 to limit iPad cost.
- Pause when the page loses visibility or focus. Unlock/resume optional Web Audio only after user interaction. Audio and local storage failures must not prevent play.
- Keyboard controls: arrows/WASD move, Space drills, F drops a flare, P/Escape pauses, and M toggles the map.

## Verification and browser workflow

Run the simulation tests from the repository root after meaningful gameplay changes:

```sh
node --test tests/game.test.cjs
```

Use the user's browser skill. Read the skill when starting a new browser workflow. Prefer its available MCP tools; its CLI also works. Check ownership/status before launching or closing anything. Invoke scripts from `~/bin` directly by their PATH command and shebang; never wrap them in `uv run /home/petter/bin/...`.

For the CLI, run these:

```sh
browser_control.py status
browser_control.py launch --headed
```

Run the browser suite from this repository:

```sh
uv run tests/browser_check.py
```

It connects to Chrome at `http://127.0.0.1:9222`, opens the local file in an isolated context, and closes that context when successful. It does not need an HTTP server. It uses a fixed seed for repeatability and writes screenshots to `/tmp/deep-below-chrome-*.png`; inspect relevant screenshots after layout changes. Test dimensions include 1024×768, 768×1024, and 390×844.

The suite mixes real native touch input with targeted simulation setup. It verifies input and UI behavior; it is not a claim that a human played the full expedition or that an actual iPad was tested. The Node suite separately checks full engine progression and generation.

For Chrome's CDP multi-touch tests, `touchEnd` with a nonempty `touchPoints` list identifies the finger being lifted. Ending the steering finger by mistake can make a tool test misleading. Keep explicit checks that movement continues after the tool finger lifts and stops after the steering finger lifts. Prefer state-based waits to short fixed sleeps for drill completion.

Check `git diff --check` before committing. Run checks appropriate to the change; documentation-only changes do not need browser/gameplay reruns. Use `quietly` for build/test commands such as `make` or `ninja` when applicable; this project currently needs neither.

The user asked to close all agent browser windows at the end of this session. Keep them closed until browser work is needed again. To close an instance confirmed to be tool-owned, use the browser skill's `close` command. Never kill or close unrelated user browser sessions.

## Publishing

- `origin` is `git@github.com:PetterS/snakes.git`; the working branch is `main`.
- GitHub Pages automatically publishes the **repository root of `main`** after a push. A push to `main` is a public deployment, so finish implementation and required checks first.
- The established workflow is to publish requested game updates after completing them. The user specifically required the expanded game to be translated to Swedish before publishing; that version is now live.
- Stage intended files explicitly so the untracked README or temporary test artifacts are not accidentally published. Do not force-push.
- Keep the app's relative asset paths valid under `/snakes/`. HTML currently references assets with `?v=6`; update the cache version together when necessary to prevent an old cached script/style from being mixed with new HTML.
- Verify the Pages build for the pushed commit, not just any previous successful build:

```sh
gh api repos/PetterS/snakes/pages/builds/latest --jq '{status,commit,error:.error.message}'
```

- Wait for `built`, check the served page/assets, and report the actual deployed result. The public URL is <https://petters.github.io/snakes/>. A query parameter can help verify a fresh page during a rollout.

The expanded Swedish version was published as commit `5d39b96`. At that point all seven simulation tests (including 100 generated worlds) and the Chrome touch/UI suite passed. The original version was confirmed working on the user's iPad; physical iPad testing of the expanded version has not been established here.

The Nattporten expansion passes 14 simulation tests, including 100 seeded worlds with sealed/open gate reachability, a full six-relic expedition, partial banking, stronger snakes, horror telegraphs, and flare/drill defenses. Chrome checks also cover entering and returning through the gate, hidden relic discovery, horror interruption, six choices, victory, new-run resets, and the existing touch/UI cases. This is still Chrome verification, not physical iPad testing.

The diamond-vein and digging-feedback pass adds three simulation tests (17 total), covering loot budgets and branching veins over 100 seeds, combo milestones/resets, and earth/rock dig events. Chrome also checks real movement through combo tiers, optional audio, pause/expiry, rock drilling, the narrow-screen combo meter, and reduced-motion mode.

The tactical encounters, pacing, and clue pass expands this to 23 simulation tests, including 100 worlds with flanking/drill routes, supplied refuges, and continuous clue trails; a trail requiring an upward detour; warning delays, pursuit memory, flare lures, and refuge defenses; and clue discovery/reset behavior. Chrome checks a real touch drill through a generated approach, refuge UI in three viewport sizes and the netherworld, all three clue styles without revealing destination coordinates, and snake warning/lost pursuit. Screenshots remain in `/tmp/deep-below-chrome-*.png`.
