# Astro Party: Shared Simulation & Offline Mode Architecture

## Context

The game currently has **two separate implementations** of the same game logic:

1. **Client** (`astro-party/src/Game.ts` + managers/entities) — Uses Matter.js physics, runs full sim only when acting as "host", well-modularized (entities/, managers/, systems/)
2. **Server** (originally `unfinished-games/astro-party-colyseus-server/src/sim/AstroPartySimulation.ts`) — 3600-line monolith with custom circle physics (no Matter.js), server-authoritative

These are **not shared code**. The goals are:

- Extract a **single canonical simulation** usable by both client and server
- **Replace physics engine** with Rapier (rapier2d) — WASM-based, cross-platform deterministic, built-in snapshot/restore for future prediction
- **Modularize** the server monolith using the client's cleaner structure as a blueprint
- Enable an **offline local mode** (no server connection) via a UI toggle in the lobby
- **Colocate** all astro-party code (client + server + shared) under `astro-party/`
- Lay groundwork for **client-side prediction** (deferred to a future phase, but architecture must support it)

---

## Phase 1 Status: COMPLETE

Phase 1 (Restructure & Modularize) has been completed. The 3600-line server monolith has been decomposed into focused modules under `astro-party/shared/sim/`, the server has been moved to `astro-party/server/`, and both client and server typecheck cleanly.

### What Was Done

1. Created `astro-party/shared/sim/` with 12 modular files (see Actual Module Breakdown below)
2. Moved server from `unfinished-games/astro-party-colyseus-server/` to `astro-party/server/`
3. Updated `AstroPartyRoom.ts` imports to point to `../../../shared/sim/`
4. Updated server `tsconfig.json` with `rootDir: ".."` and `include: ["src", "../shared"]`
5. All shared imports use `.js` extensions for NodeNext compatibility
6. Client typecheck (`bun run typecheck`) and build (`bun run build`) pass
7. Server typecheck (`npx tsc --noEmit`) passes

### Deviations & Issues Encountered

| Issue | Resolution |
|-------|-----------|
| Server uses `NodeNext` module resolution which requires `.js` extensions on relative imports | Added `.js` extensions to all shared imports — works with both `bundler` (client) and `NodeNext` (server) |
| Server `tsconfig.json` `rootDir` must cover both `src/` and `../shared/` | Set `rootDir: ".."` (parent = `astro-party/`) so both directories are under root |
| `bun install` fails for server due to uWebSockets.js extraction error | Use `npm install` for server dependencies instead of bun |
| `endRound()` was missing `sim.roundEndMs = ROUND_RESULTS_DURATION_MS` assignment | Fixed — added the missing line and imported the constant |
| Implicit `any` types in filter/forEach callbacks under strict mode | Added explicit type annotations to all callback parameters |
| Original monolith still exists at `unfinished-games/` | Not deleted — kept as reference until Phase 2+ is verified |
| `PhysicsWorld.ts` not yet created | Deferred to Phase 2 (Rapier integration) — current shared sim uses custom circle physics from the monolith |

### Architecture Pattern: SimState Interface

The key architectural pattern chosen is a **SimState interface** implemented by the orchestrator class:

```typescript
// types.ts
export interface SimState {
  // Entity collections (Maps and arrays)
  players: Map<string, RuntimePlayer>;
  playerOrder: string[];
  pilots: Map<string, RuntimePilot>;
  projectiles: RuntimeProjectile[];
  // ... all entity state

  // Game state fields
  phase: GamePhase;
  nowMs: number;
  settings: AdvancedSettings;
  // ...

  // Helper methods systems can call
  nextEntityId(prefix: string): string;
  getActiveConfig(): ActiveConfig;
  triggerScreenShake(intensity: number, duration: number): void;
  syncPlayers(): void;
  grantPowerUp(playerId: string, type: PowerUpType): void;
  onShipHit(owner: RuntimePlayer | undefined, target: RuntimePlayer): void;
  killPilot(pilotPlayerId: string, killerId: string): void;
  // ...
}

// AstroPartySimulation.ts
export class AstroPartySimulation implements SimState { ... }
```

Each system module exports standalone functions that take `sim: SimState` as their first parameter. Cross-cutting event handlers (like `onShipHit`, `killPilot`, `destroyAsteroid`) stay as methods on the orchestrator class and delegate to the appropriate system function. This avoids circular dependencies while keeping the call sites clean.

---

## Current State

### Actual Folder Structure

```
astro-party/
├── src/                    ← Client code (unchanged from Phase 1)
│   ├── main.ts
│   ├── Game.ts             ← Still has host-mode sim code (Phase 5 cleanup)
│   ├── types.ts            ← Still has own type definitions (Phase 3 unification)
│   ├── entities/           ← Entity classes with Matter.js bodies (kept)
│   ├── managers/           ← Game subsystems (some to be removed in Phase 5)
│   ├── systems/            ← Physics.ts still uses Matter.js (Phase 2/5)
│   ├── network/
│   │   └── transports/
│   │       ├── NetworkTransport.ts   ← Interface (unchanged)
│   │       ├── ColyseusTransport.ts  ← Online mode (existing)
│   │       └── createTransport.ts    ← Factory (unchanged, Phase 4)
│   └── ui/                 ← UI controllers (unchanged)
│
├── server/                 ← Colyseus server (moved from unfinished-games/)
│   ├── src/
│   │   ├── index.ts                  ← Express + Colyseus setup (unchanged)
│   │   ├── rooms/AstroPartyRoom.ts   ← Updated: imports from shared/sim/
│   │   └── http/roomCodeRegistry.ts  ← Unchanged
│   ├── package.json        ← Server deps (colyseus, express, cors)
│   ├── tsconfig.json       ← rootDir: "..", includes shared/
│   └── node_modules/       ← Installed via npm (not bun)
│
├── shared/                 ← Shared simulation (NEW - modularized from monolith)
│   └── sim/
│       ├── AstroPartySimulation.ts   ← Orchestrator (~980 lines, implements SimState)
│       ├── types.ts                  ← All types + SimState interface (~430 lines)
│       ├── constants.ts              ← All constants + preset maps (~230 lines)
│       ├── SeededRNG.ts              ← Deterministic xorshift RNG (~35 lines)
│       ├── utils.ts                  ← clamp, normalizeAngle, config helpers (~35 lines)
│       ├── ShipSystem.ts             ← Ship movement, firing, collision (~330 lines)
│       ├── CollisionSystem.ts        ← All collision detection systems (~180 lines)
│       ├── AsteroidSystem.ts         ← Spawning, updating, splitting (~220 lines)
│       ├── PowerUpSystem.ts          ← Pickup, magnetic pull, 7 types (~145 lines)
│       ├── WeaponSystem.ts           ← Laser, mines, homing, joust, turret (~370 lines)
│       ├── AISystem.ts               ← Bot AI decision-making (~85 lines)
│       └── GameFlowSystem.ts         ← Phases, pilots, rounds, elimination (~410 lines)
│
├── index.html
├── package.json            ← Client deps (colyseus.js, matter-js, tone, vite)
├── vite.config.js
├── tsconfig.json           ← module: ESNext, moduleResolution: bundler
└── dist/index.html         ← Build output
```

### Actual Module Breakdown

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `AstroPartySimulation.ts` | ~980 | Orchestrator class, public API (addHuman, sendInput, startMatch, etc.), tick loop, snapshot building, SimState method implementations |
| `types.ts` | ~430 | All interfaces (SimState, RuntimePlayer, RuntimePilot, all entity states, Hooks, payloads, ActiveConfig) |
| `constants.ts` | ~230 | Arena dimensions, physics presets, timing, weapon stats, mode configs (STANDARD/SANE/CHAOTIC), preset lookup maps |
| `SeededRNG.ts` | ~35 | XOR-shift deterministic RNG with next(), nextInt(), nextRange(), nextUint32() |
| `utils.ts` | ~35 | clamp(), normalizeAngle(), getModeBaseConfig(), resolveConfigValue() |
| `ShipSystem.ts` | ~330 | updateShips(), tryFire() (all weapon types), resolveCircleCollision(), ship-ship collisions, reload, laser damage |
| `CollisionSystem.ts` | ~180 | Ship-turret, ship-asteroid, pilot-asteroid, asteroid-asteroid, projectile-all, ship-pilot collisions, projectile movement |
| `AsteroidSystem.ts` | ~220 | spawnInitialAsteroids(), updateAsteroidSpawning(), updateAsteroids(), destroyAsteroid() with splitting + power-up drops |
| `PowerUpSystem.ts` | ~145 | updatePowerUps() (magnetic pull), processPowerUpPickups(), grantPowerUp() (all 7 types), spawnRandomPowerUp() |
| `WeaponSystem.ts` | ~370 | Laser beams, mines (arming + explosion), homing missiles (tracking), joust swords (geometry + collisions), turret AI + bullets |
| `AISystem.ts` | ~85 | updateBots() with cached decisions, findNearestEnemy(), reaction delay |
| `GameFlowSystem.ts` | ~410 | Pilot movement/AI/respawn, onShipHit() (ejection), killPilot(), round flow (endRound, beginPlaying, checkEliminationWin), entity cleanup |

### Import Path Convention

All relative imports in `shared/sim/` use `.js` extensions:
```typescript
import type { SimState, RuntimePlayer } from "./types.js";
import { ARENA_WIDTH, ARENA_HEIGHT } from "./constants.js";
import { normalizeAngle } from "./utils.js";
```

This works with both:
- **Client** (`moduleResolution: "bundler"`) — Vite resolves `.js` to `.ts` automatically
- **Server** (`moduleResolution: "NodeNext"`) — Node.js ESM requires `.js` extensions at runtime

---

## Communication Protocol

**Client → Server:**
- `cmd:input` — `{ buttonA, buttonB, clientTimeMs }` (per frame)
- `cmd:dash` — double-tap event (one-shot)
- `cmd:start_match`, `cmd:restart_match`, `cmd:set_mode`, `cmd:set_advanced_settings`
- `cmd:add_ai_bot`, `cmd:add_local_player`, `cmd:remove_bot`, `cmd:kick_player`

**Server → Client:**
- `evt:snapshot` — full entity state @ 20Hz (ships, projectiles, asteroids, pilots, powerups, etc.)
- `evt:phase` — game phase transitions
- `evt:countdown` — countdown ticks
- `evt:sound` — audio cues (fire, explosion, kill, etc.)
- `evt:screen_shake` — shake intensity/duration
- `evt:dash_particles` — particle effect data
- `evt:players` — player list with metadata
- `evt:room_meta` — room config, leader, mode, settings
- `evt:round_result` — round winner, scores

### Existing Abstractions

**`NetworkTransport` interface** (`src/network/transports/NetworkTransport.ts`) — 145 lines, 40+ methods. Already abstracts all communication. `ColyseusTransport` implements it. This is the seam for plugging in offline mode.

**`Hooks` interface** (`shared/sim/types.ts`) — callback interface for simulation output:
```typescript
interface Hooks {
  onPlayers, onRoomMeta, onPhase, onCountdown, onRoundResult,
  onSnapshot, onSound, onScreenShake, onDashParticles, onDevMode, onError
}
```

These map 1:1 to `NetworkCallbacks` on the client side — the bridge is natural.

---

## Physics Engine: Rapier (rapier2d)

### Why Rapier

| Property | Rapier | Matter.js (current client) | Custom (current shared sim) |
|----------|--------|---------------------------|------------------------|
| Performance | Very fast (WASM) | Moderate (JS) | Moderate (JS) |
| Cross-platform determinism | Yes (same WASM binary) | No | Seeded RNG but FP drift |
| Snapshot/Restore | **Built-in** `world.takeSnapshot()` | Not supported | Manual |
| State correction | Trivial (restore + replay) | Hard (hidden internal state) | Trivial but feel is worse |
| Collision shapes | Polygons, circles, capsules, compound | Polygons, circles, compound | Circles only |
| Physics feel | Excellent (modern solver) | Good | Basic |
| Bundle size | ~200KB WASM | ~80KB JS | 0 |
| Node.js + Browser | Yes | Yes | Yes |

### Key Advantage: Snapshot/Restore

Rapier's `world.takeSnapshot()` and `World.restoreSnapshot()` make rollback reconciliation a first-class operation. When client-side prediction is added later:

1. Client takes snapshot before applying local input
2. Applies input locally → runs Rapier step → immediate visual feedback
3. Server authoritative state arrives
4. `restoreSnapshot()` → apply server truth → replay unconfirmed inputs forward
5. No manual state surgery, no hidden internal state problems

This is **architecturally impossible** with Matter.js without significant workarounds (Matter.js has hidden `positionPrev`, accumulated forces, constraint warmstarting that break on hard state sets).

### Migration Note

Physics feel will need tuning after switching. Rapier's solver behavior differs from Matter.js — restitution, friction, and density parameters won't translate 1:1. This is expected and budgeted in Phase 2.

---

## LocalTransport Design

`LocalTransport` implements `NetworkTransport` by wrapping the shared simulation:

**Hooks → NetworkCallbacks mapping:**

| Sim Hook | Client Callback |
|----------|----------------|
| `onSnapshot(payload)` | `onGameStateReceived(snapshot)` |
| `onPhase(phase, wId, wName)` | `onGamePhaseReceived(phase, wId, wName)` |
| `onCountdown(count)` | `onCountdownReceived(count)` |
| `onSound(type, pid)` | `onGameSoundReceived(type, pid)` |
| `onScreenShake(i, d)` | `onScreenShakeReceived(i, d)` |
| `onDashParticles(p)` | `onDashParticlesReceived(p)` |
| `onPlayers(p)` | `onPlayerListReceived(order, metaMap)` |
| `onRoundResult(p)` | `onRoundResultReceived(p)` |
| `onRoomMeta(p)` | `onAdvancedSettingsReceived(...)` |
| `onError(sid, code, msg)` | `onTransportError(code, msg)` |
| `onDevMode(e)` | `onDevModeReceived(e)` |

**Key behaviors:**
- `createRoom()` → instantiate `AstroPartySimulation` with hooks, return `"LOCAL"`
- `joinRoom()` → `sim.addHuman()`, return `true`
- `sendInput(input)` → `sim.sendInput(sessionId, input)` directly
- `startSync()` → `setInterval(() => sim.update(16.67), 16.67)`
- `isHost()` / `isSimulationAuthority()` → always `true`

**Local multiplayer:** Virtual session IDs per local player. `MultiInputManager` captures per-slot, each slot routes to its virtual session.

**Walls:** Static Rapier bodies created identically on both sides. Never change, never need syncing.

---

## Remaining Migration Phases

### Phase 2: Replace Physics with Rapier

**Status:** Not started

**Goal:** Swap custom circle physics for Rapier. Both client and server use same engine.

1. Add `@dimforge/rapier2d` to both client and server `package.json`
2. Create `shared/sim/PhysicsWorld.ts` — Rapier world wrapper:
   - `createWorld()` — arena walls as static bodies
   - `createShipBody()`, `createAsteroidBody()`, `createProjectileBody()` etc.
   - `step(dt)` — advance physics
   - `takeSnapshot()` / `restoreSnapshot()` — for future prediction
3. Replace custom physics in each system module with Rapier calls
4. Update collision detection to use Rapier contact events or proximity queries
5. **Tune physics parameters** — restitution, friction, density to match/exceed Matter.js feel
6. Remove custom `resolveCircleCollision()` and manual wall bounce code

**Verify:** Server sim produces correct gameplay. Compare feel side-by-side with old version.

### Phase 3: Unify Types

**Status:** Not started

**Goal:** Single source of truth for all shared types.

1. Audit `SnapshotPayload` (shared) vs `GameStateSync` (client) — diff shapes
2. Client `types.ts` re-exports from `shared/sim/types.ts` where types overlap
3. Update all client imports to use shared types
4. Update client `tsconfig.json` to include shared directory (`"include": ["src", "../shared"]` or similar)

**Note:** The shared `types.ts` already defines all the canonical types. The main work is making the client use them instead of its own duplicates.

**Verify:** `cd astro-party && bun run typecheck && bun run build`

### Phase 4: Build LocalTransport & Offline Mode

**Status:** Not started

**Goal:** Play the game without any server connection.

1. Create `src/network/transports/LocalTransport.ts` implementing `NetworkTransport`
2. Wire Hooks → NetworkCallbacks (see mapping table above)
3. Implement tick loop (`setInterval` at sim tick rate)
4. Handle virtual sessions for local multiplayer
5. Update `createTransport.ts` — accept mode parameter
6. Add online/offline toggle to lobby UI (start screen)

**Verify:** Boot game → select "Play Local" → add AI bots → play full match → no server

### Phase 5: Simplify Client

**Status:** Not started

**Goal:** Remove duplicated game logic from client. Client becomes a pure renderer.

1. Remove host-only simulation code from `Game.ts` (physics tick, collision dispatch, entity spawning)
2. Remove duplicate managers: `CollisionManager.ts`, `AsteroidManager.ts`, `FireSystem.ts`, `TurretManager.ts`
3. Remove `Physics.ts` (Matter.js wrapper) — replaced by Rapier in shared sim
4. Remove `matter-js` from client `package.json`
5. Client entity classes become lightweight render objects (position, angle, visual state only)
6. `Game.ts` becomes: receive snapshots → update display entities → render

**Verify:** Both online and offline modes work. All mechanics functional.

### Future: Client-Side Prediction (Deferred)

Architecture is ready for this thanks to Rapier:
- Client runs shared sim locally for own ship + own projectiles
- Rapier `takeSnapshot()` before applying local input
- On server snapshot arrival: `restoreSnapshot()` → apply server state → replay unconfirmed inputs
- Other entities: server snapshots + DisplaySmoother interpolation (existing)
- Scope (ship only vs ship+projectiles vs +asteroids) to be decided based on feel testing

---

## What Gets Removed From Client (Phase 5)

These client files duplicate logic that lives in the shared simulation:

| File | Lines | Reason for removal |
|------|-------|-------------------|
| `src/managers/CollisionManager.ts` | ~150 | Collision logic in shared `CollisionSystem.ts` |
| `src/managers/AsteroidManager.ts` | ~100 | Asteroid logic in shared `AsteroidSystem.ts` |
| `src/managers/FireSystem.ts` | ~150 | Firing logic in shared `WeaponSystem.ts` |
| `src/managers/TurretManager.ts` | ~80 | Turret logic in shared `WeaponSystem.ts` |
| `src/systems/Physics.ts` | ~200 | Replaced by shared `PhysicsWorld.ts` (Rapier) |
| Host-mode code in `Game.ts` | ~500 | Sim runs in transport (local or server) |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rapier physics feel differs from Matter.js | Game feel regression | Budget dedicated tuning time in Phase 2; A/B compare |
| WASM bundle size (~200KB) | Larger client build | Acceptable for game quality; lazy-load if needed |
| ~~Monolith modularization breaks logic~~ | ~~Server regression~~ | **Mitigated** — Phase 1 complete, typechecks pass |
| SnapshotPayload / GameStateSync mismatch | Type errors | Side-by-side audit in Phase 3 before LocalTransport |
| Client deeply coupled to host-mode sim | Hard cleanup | Phase 5 is incremental; keep host path until tested |
| Rapier WASM init is async | Boot delay | Init during loading screen before game starts |
| Local multiplayer session routing | Input bugs | Virtual sessions pattern; test with 2-3 local players |
| Server `bun install` fails (uWebSockets.js) | Can't install deps | Use `npm install` for server instead of bun |

---

## Verification Checklist

After each phase:

- [x] **Type safety**: `bun run typecheck` passes with no errors (Phase 1)
- [x] **Server typecheck**: `cd server && npx tsc --noEmit` passes (Phase 1)
- [x] **Client build**: `bun run build` produces `dist/index.html` (Phase 1)
- [ ] **Online mode**: Create room → 2+ players join → full match → works
- [ ] **Offline mode**: Start local → add AI bots → full match → no server
- [ ] **Local multiplayer**: 2+ players same keyboard, offline → all control ships
- [ ] **All mechanics**: All 7 power-ups, dash, pilot ejection, asteroid splitting, turret
- [ ] **Game flow**: Countdown → playing → round end → game end → restart
- [ ] **Physics feel**: Ships, collisions, wall bouncing feel good (play-test)
- [ ] **Server runtime**: `cd server && npm run build && npm start` → online functional
