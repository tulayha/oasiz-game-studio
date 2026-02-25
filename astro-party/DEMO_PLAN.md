# Demo / Attract Mode Implementation Plan

## Context

This game needs a first-launch demo/attract experience that showcases gameplay before the player interacts. After the splash screen, a real local AI-only battle runs in the background while an overlay shows the Space Force logo and "Tap to Start." On tap, a tutorial with typewriter dialogue teaches controls. On completion or skip, the normal main menu appears. The demo runs only on first visit (tracked via localStorage). A hidden demo map (MapId 6) is used, and no scores are submitted.

---

## New Files

### 1. `src/demo/DemoController.ts`
Central lifecycle manager for the demo session.

**State machine:** `IDLE → STARTING → ATTRACT → TUTORIAL → TEARING_DOWN → DONE`

**Responsibilities:**
- `startDemo()`: Creates a local room, makes host AI-controlled, adds 3 more AI bots (4 AI total), sets demo map, starts game, mutes gameplay SFX
- `enterTutorial()`: Restores host to human control, enables keyboard input
- `teardown()`: Calls `game.leaveGame()`, restores SFX, resets demo flag, hides overlays
- `isDemoActive()` / `getState()`: Queried by `main.ts` to gate UI behavior
- Auto-restarts match on GAME_END (calls `game.continueMatchSequence()` after delay)

**startDemo() sequence:**
1. `game.setDemoSession(true)`
2. `game.setSessionMode("local")`
3. `await game.createRoom()`
4. `game.setHostAI(true)` — makes host AI-controlled
5. `await game.addAIBot()` x3
6. `game.setMap(6 as MapId)`
7. Save current `SettingsManager.get().fx`, then `SettingsManager.set("fx", false)`
8. `game.startGame()`
9. State → ATTRACT

### 2. `src/demo/DemoOverlayUI.ts`
Manages all demo DOM overlays and user input listeners.

**Methods:**
- `showAttract()`: Unhides attract overlay, binds click/tap/keypress to `onTapToStart` callback
- `showTutorial(isMobile)`: Hides attract overlay, shows tutorial panel, runs typewriter sequence
- `hideAll()`: Hides both overlays, removes listeners
- `destroy()`: Full cleanup

**Callbacks interface:** `{ onTapToStart, onTutorialComplete, onSkipToMenu }`

### 3. `src/demo/demoTutorial.ts`
Tutorial dialogue definitions and typewriter renderer.

**Exports:**
- `getTutorialSteps(isMobile: boolean): TutorialStep[]` — dialogue lines with platform-specific control hints
- `typewriteText(element, text, charDelayMs): { cancel(), done: Promise<void> }` — character-by-character text reveal
- `createControlDiagram(isMobile: boolean): string` — returns inline SVG markup for a simple rotate/fire control hint diagram

**Dialogue (desktop):**
1. "Welcome, pilot. Your ship always thrusts forward."
2. "Press A or Left Arrow to rotate. Press D, Right Arrow, or Space to fire."
3. "Double-tap A to dodge incoming fire."
4. "Destroy ships to eject pilots. Eliminate pilots to score!"
5. "You're ready. Good luck, Cadet!"

**Dialogue (mobile):** Same structure with "Hold left side" / "Tap right side" / "Double-tap left side".

---

## Existing Files Modified

### `shared/sim/types.ts`
- Extended `MapId` union to include `6`

### `shared/sim/maps.ts`
- Added `MAP_6_DEMO` with center hole, two repulsion zones, 6 asteroids
- Added to `MAP_DEFINITIONS` record only (NOT to `ALL_MAP_IDS` or `CLASSIC_ROTATION_MAP_IDS`)

### `shared/sim/AstroPartySimulation.ts`
- Updated `setMap()` validation: `mapId > 5` → `mapId > 6`
- Added `setPlayerAI(sessionId, enabled)` method to toggle host between AI/human

### `src/network/transports/NetworkTransport.ts`
- Added optional `setPlayerAI?(sessionId, enabled)` to interface

### `src/network/transports/LocalSharedSimTransport.ts`
- Implemented `setPlayerAI` delegating to simulation

### `src/network/NetworkManager.ts`
- Added `setPlayerAI` passthrough method

### `src/Game.ts`
- Added `isDemoSession` private field
- Added `setDemoSession()`, `isDemoMode()`, `setHostAI()` public methods
- Added `if (this.isDemoSession) return false;` guard in `shouldSubmitScoreNow()`

### `src/ui/screens.ts`
- Added map 6 gradient: `{ inner: "#050308", mid: "#180a20", outer: "#351535" }`

### `src/ui/elements.ts`
- Added 8 demo overlay element references

### `src/ui/startScreen.ts`
- Added `setBeforeAction` to interface and implementation
- Button handlers call `await beforeAction?.()` before game logic

### `src/main.ts`
- Added demo bootstrap after splash (skipped if `__ROOM_CODE__` present or not first visit)
- `syncScreenToPhase` intercepts demo phases to suppress HUD, keep game canvas visible
- All UI callbacks guard against demo-active state

### `index.html`
- Added two overlay `<div>` elements before `</body>`
- Added full demo CSS section at end of `<style>` block

---

## Key Design Decisions

1. **4 AI-only attract**: Host is added as human by transport, then `game.setHostAI(true)` toggles it to AI-controlled via `AstroPartySimulation.setPlayerAI()`. On tutorial start, `setHostAI(false)` restores human control.

2. **First visit only**: `localStorage.getItem("astro-party-demo-seen")` checked at init. Set on teardown.

3. **SFX muting**: Save `SettingsManager.get().fx`, set to false during demo, restore on teardown. Music continues.

4. **Score blocking**: `Game.isDemoSession` flag → `shouldSubmitScoreNow()` returns false.

5. **Demo map hidden**: MapId 6 in `MAP_DEFINITIONS` but absent from `ALL_MAP_IDS` / `CLASSIC_ROTATION_MAP_IDS`.

6. **Typewriter SFX**: Throttled `AudioManager.playUIClick()` every ~3 characters. Can be replaced with dedicated SFX later.

---

## Verification Checklist

1. **First launch**: Splash → demo attract shows (logo slides in, "Tap to Start" pulses, AI battle visible in background, all 4 ships AI-controlled). Skip button visible.
2. **Tap to start**: Attract fades, tutorial panel appears at bottom. Typewriter text plays. SVG control diagram shown. Player ship becomes human-controlled.
3. **Tutorial complete / skip**: Overlay hides, `game.leaveGame()` runs, start screen appears. `localStorage` has `astro-party-demo-seen=1`.
4. **Second launch**: Splash → straight to start screen (no demo).
5. **Menu buttons during demo**: Click any menu button → demo teardown first, then normal flow.
6. **Demo map**: Map 6 not visible in map picker. Used during attract.
7. **Score**: No `window.submitScore()` calls during demo.
8. **GAME_END loop**: Match auto-restarts after 1.5s.
9. **Mobile**: Touch controls not shown during attract. Tutorial shows mobile hints.
10. **Typecheck**: `bun run typecheck` passes.
