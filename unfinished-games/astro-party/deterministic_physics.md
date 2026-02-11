# Astro Party: Smooth Online Multiplayer - Pragmatic Plan

**Created**: 2026-02-11
**Estimated Timeline**: 4-6 weeks
**Complexity**: Medium
**Status**: Design Complete - Awaiting Approval

---

## Problem Statement

**Current Issue**: Non-host players experience jittery/laggy gameplay that makes online multiplayer feel unpolished.

**Root Cause**: Non-deterministic physics prevents clients from running local prediction:
- **70+ Math.random() calls** (43 affect game logic) → clients can't predict spawns
- **Variable delta-time** physics → different frame rates = different physics
- **Date.now() timestamps** → different clocks = different expiration times
- **Result**: Clients only render what host sends (50ms delayed snapshots)

**Goal**: Make online multiplayer feel smooth for ALL players (host AND non-host) so the game is shippable. Focus on practical improvements, not overengineering.

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Non-Determinism Sources](#2-non-determinism-sources)
3. [Proposed Architecture](#3-proposed-architecture)
4. [Technical Specifications](#4-technical-specifications)
5. [Implementation Phases](#5-implementation-phases)
6. [Testing & Validation](#6-testing-validation)
7. [Risks & Mitigations](#7-risks-mitigations)
8. [Critical Files Reference](#8-critical-files-reference)

---

## 1. Current State Analysis

### 1.1 Architecture Overview

**File Structure**:
```
unfinished-games/astro-party/src/
├── Game.ts                    # Main orchestrator (variable dt loop)
├── GameConfig.ts              # Modes: STANDARD, SANE, CHAOTIC
├── types.ts                   # All interfaces & constants
├── systems/
│   ├── Physics.ts             # Matter.js engine (variable dt)
│   ├── Renderer.ts            # Canvas rendering
│   └── Input.ts               # Input capture
├── entities/                  # 10 entity types (Ship, Asteroid, etc.)
├── managers/                  # 8 managers (Asteroid, Fire, Collision, etc.)
└── network/
    ├── NetworkManager.ts      # PlayroomKit wrapper
    └── NetworkSyncSystem.ts   # DisplaySmoother (velocity extrapolation)
```

**Current Game Loop** (`Game.ts:641-665`):
```typescript
private loop(timestamp: number): void {
  const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
  this.lastTime = timestamp;

  this.update(dt);  // Variable timestep
  this.render(dt);

  requestAnimationFrame((t) => this.loop(t));
}
```

**Physics Update** (`Physics.ts:322`):
```typescript
update(dt: number): void {
  Engine.update(this.engine, Math.min(dt, 16.667));
}
```

### 1.2 Network Synchronization

**Host Authority**:
- Only host runs Matter.js physics simulation (60 FPS)
- Host collects player inputs via PlayroomKit state polling (50ms)
- Host broadcasts `GameStateSync` snapshots every 50ms (20Hz)
- One-time events (fire, kill, phase changes) via RPC

**Non-Host Behavior**:
- Sends input via PlayroomKit player state (unreliable, 50ms throttle)
- Receives state snapshots every 50ms
- Uses `DisplaySmoother` for velocity extrapolation between snapshots
- **No local physics simulation** (pure remote rendering)

**GameStateSync Contents**:
```typescript
{
  ships: ShipState[];           // x, y, angle, vx, vy, alive, ammo
  asteroids: AsteroidState[];   // x, y, vx, vy, angle, angularVelocity
  projectiles: ProjectileState[];
  pilots: PilotState[];
  powerUps: PowerUpState[];
  laserBeams: LaserBeamState[];
  mines: MineState[];
  homingMissiles: HomingMissileState[];
  turret: TurretState | null;
  turretBullets: TurretBulletState[];
  // NO tick ID (non-deterministic timing)
}
```

### 1.3 DisplaySmoother (Current Prediction)

**Location**: `NetworkSyncSystem.ts:68-72`

**Algorithm**:
1. Store target positions from network snapshots (tx, ty, ta)
2. Store velocities (vx, vy) from snapshot
3. Each frame (60fps):
   - Extrapolate target: `targetX = tx + vx * ageSec` (max 200ms)
   - Blend display toward target: `dx = lerp(dx, targetX, blendFactor)`
4. Render using smoothed display positions

**Blend Factors**:
- Ships: 0.25 (slower correction)
- Projectiles: 0.4 (moderate)
- Asteroids: 0.15 (very smooth)
- Pilots: 0.2
- Missiles: 0.35

**Limitation**: Only smooths rendering; no physics simulation on client.

### 1.4 Entity Lifecycle

**Spawn Examples**:

**Asteroids** (`AsteroidManager.ts`):
- Initial: Random count [5-7], random center positions ±280px
- Size: Random [16-38px] based on tier (60% LARGE / 40% SMALL)
- Velocity: Random angle × random speed [0.6-1.6] px/frame
- Vertices: Random [6-10] with 0.7-1.3× radius variance
- **Scheduled spawns**: Random [2-5] second intervals, random [1-3] count per batch

**Power-Ups** (`AsteroidManager.trySpawnPowerUp`):
- Trigger: 30% chance on asteroid destruction
- Type: Weighted random (7 types, equal weights)
- Position: Asteroid death location
- Lifetime: 10000ms (Date.now() based)

**Ships** (`GameFlowManager.beginMatch`):
- Position: Deterministic (corner spawns based on player count)
- Angle: Toward arena center (deterministic)
- Velocity: {0, 0} (deterministic)

**Projectiles** (`FireSystem.processFire`):
- Position: Ship nose (18px forward)
- Velocity: Fixed speed (14 px/frame) at ship angle
- Lifetime: 2500ms (Date.now() based)

---

## 2. Non-Determinism Sources

### 2.1 Math.random() Calls (70+ instances)

#### Game Logic (43 calls - HIGH IMPACT)

| File | Lines | Usage | Impact |
|------|-------|-------|--------|
| **AsteroidManager.ts** | 28 calls | Initial count, positions, sizes, velocities, angles, split variance, power-up drops, scheduled spawn intervals | Complete asteroid state divergence |
| **AstroBot.ts** | 5 calls | Dodge decisions (50% chance), rotation overshoot, fire probability (5% opportunistic), aim error | AI behavior divergence |
| **Game.ts** | 4 calls | Starting power-up selection, weighted power-up spawn type | Power-up type/location desync |
| **Asteroid.ts** | 3 calls | Vertex count [6-10], vertex radius variance [0.7-1.3×] | Visual variance (minor) |
| **Pilot.ts** | 3 calls | AI wander (20% chance), random velocity generation | Pilot behavior divergence |

#### Visual Effects (27 calls - LOW IMPACT)

| File | Lines | Usage | Impact |
|------|-------|-------|--------|
| **Renderer.ts** | 27 calls | Particle spray (angle, speed, life, size), debris generation, star field init | Visual only (no gameplay) |

**Critical Example** (`AsteroidManager.ts:34-74`):
```typescript
const count = this.randomInt(min, max); // Uses Math.random()
for (let i = 0; i < count; i++) {
  const tier = i === 0 ? "LARGE" : this.rollAsteroidTier(); // 60% LARGE
  const size = this.randomAsteroidSize(tier); // Random within tier bounds
  const x = centerX + (Math.random() * 2 - 1) * spreadX;
  const y = centerY + (Math.random() * 2 - 1) * spreadY;
  const angle = Math.random() * Math.PI * 2;
  const speed = this.randomRange(minSpeed, maxSpeed);
  const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  const angularVelocity = (Math.random() * 2 - 1) * 0.01;
}
```

**Result**: Every client generates different asteroids → **complete state divergence**.

### 2.2 Timestamp-Based Logic (79 calls)

#### Date.now() Usage

| File | Usage | Impact |
|------|-------|--------|
| **Projectile.ts** | `spawnTime = Date.now()`, `isExpired()` check | Projectile expiration timing varies per client |
| **LaserBeam.ts** | Entity ID: `beam_${Date.now()}_${Math.random()}` | Non-deterministic IDs (minor) |
| **HomingMissile.ts** | Entity ID: `missile_${Date.now()}_${Math.random()}` | Non-deterministic IDs (minor) |

#### performance.now() Usage

| File | Usage | Impact |
|------|-------|--------|
| **Game.ts** | Input capture timing, network throttle checks | Local timing only (no sync) |
| **Mine.ts** | Entity ID: `mine_${performance.now()}_${Math.random()}` | Non-deterministic IDs (minor) |
| **NetworkManager.ts** | Ping measurement (RTT calculation) | Latency tracking only |

**Critical Example** (`Projectile.ts:24,30`):
```typescript
this.spawnTime = Date.now();

isExpired(): boolean {
  return Date.now() - this.spawnTime > this.lifetime;
}
```

**Problem**: Client clocks differ by 1-50ms → projectiles expire at different ticks across clients.

### 2.3 Variable Delta-Time

**Current Loop** (`Game.ts:641-651`):
```typescript
const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
this.physics.update(dt * 1000); // Variable timestep
```

**Issues**:
- Different frame rates → different physics integration steps
- Floating-point accumulation varies per device
- 60 FPS device: ~16.667ms steps
- 120 FPS device: ~8.333ms steps
- 30 FPS device: ~33.333ms steps (capped at 16.667ms)

**Result**: Physics simulation diverges over time due to integration differences.

### 2.4 Matter.js Non-Determinism

**Root Cause**: Matter.js uses JavaScript floating-point arithmetic (IEEE 754).

**Sources of Drift**:
- Position integration: `x += vx * dt` accumulates rounding errors
- Velocity updates: `vx += ax * dt` compounds errors
- Collision resolution: Iterative solver may converge differently
- Cross-platform differences: Intel vs ARM CPUs, Chrome vs Firefox JIT

**Evidence**: No determinism guarantees in Matter.js documentation.

**Mitigation**: Host authority currently masks this (clients trust host snapshots).

---

## 3. Proposed Solution (Pragmatic Approach)

### 3.1 Simple Architecture

**Goal**: Make non-host gameplay feel smooth WITHOUT complex rollback systems.

```
┌──────────────────────────────────────────────────────────────┐
│ SMOOTH MULTIPLAYER (Practical)                               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Round Start: Host generates seed → All clients get seed     │
│               Everyone initializes RNG with same seed         │
│                                                               │
│  ┌──────────────────┐            ┌──────────────────┐        │
│  │   HOST           │            │  NON-HOST        │        │
│  └──────────────────┘            └──────────────────┘        │
│                                                               │
│  Every Frame (60fps):            Every Frame (60fps):        │
│  1. Run fixed physics            1. Run same physics locally │
│  2. Process all inputs           2. Apply own input          │
│  3. Broadcast snapshot           3. Smoothly blend toward    │
│     (every 50ms)                    host snapshot when       │
│                                     it arrives               │
│                                                               │
│  No rollback. No replay. Just smooth prediction + gentle     │
│  corrections when host updates arrive.                       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Key Changes (Simplified)

| Component | Current | Proposed | Complexity |
|-----------|---------|----------|------------|
| **RNG** | Math.random() | Seeded PRNG | Simple |
| **Timing** | Variable dt | Fixed 16.667ms | Simple |
| **Lifetimes** | Date.now() | Tick counters | Simple |
| **Client Physics** | None | Run same physics locally | Medium |
| **Corrections** | DisplaySmoother | Gentle blend toward host | Simple |

**What we're NOT doing**:
- ❌ Complex rollback/replay systems
- ❌ Input buffering with history
- ❌ Mismatch detection with state hashing
- ❌ Tick-tagged input RPCs
- ❌ Full state capture/restore

**What we ARE doing**:
- ✅ Seed RNG at round start (everyone sees same spawns)
- ✅ Fixed timestep (consistent physics)
- ✅ Clients run physics locally (smooth input)
- ✅ Gentle corrections when host updates arrive (no hard snaps)

### 3.3 Roles (Simplified)

**Host**:
- Generates RNG seed at round start, broadcasts it
- Runs fixed timestep physics (60Hz)
- Broadcasts state snapshots (20Hz)
- **Still authoritative** - clients trust host when corrections arrive

**Non-Host**:
- Initializes RNG with host's seed
- Runs identical fixed timestep physics (60Hz)
- Applies own input immediately (feels responsive)
- When host snapshot arrives: smoothly blends positions (no hard snap)
- **No rollback** - just gentle corrections

---

## 4. Technical Specifications

### 4.1 Seeded RNG System

#### xoshiro128** PRNG Implementation

**File**: `src/systems/SeededRNG.ts` (NEW)

**Algorithm**: xoshiro128** (Blackman & Vigna, 2018)
- **State Size**: 128 bits (4 × uint32)
- **Period**: 2^128 - 1 (effectively infinite)
- **Performance**: ~1ns per call (faster than Math.random)
- **Quality**: Passes BigCrush statistical tests

```typescript
export class SeededRNG {
  private state: Uint32Array; // [a, b, c, d]

  constructor(seed: number) {
    this.state = new Uint32Array(4);
    this.setSeed(seed);
  }

  setSeed(seed: number): void {
    // SplitMix64 initialization (converts 32-bit seed to 128-bit state)
    let s = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = ((z ^ (z >>> 16)) * 0x85ebca6b) >>> 0;
      z = ((z ^ (z >>> 15)) * 0xc2b2ae35) >>> 0;
      this.state[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }

  next(): number {
    // xoshiro128** core algorithm
    const result = (((this.state[1] * 5) >>> 0) << 7 |
                    ((this.state[1] * 5) >>> 0) >>> 25) * 9;
    const t = (this.state[1] << 9) >>> 0;

    this.state[2] ^= this.state[0];
    this.state[3] ^= this.state[1];
    this.state[1] ^= this.state[2];
    this.state[0] ^= this.state[3];
    this.state[2] ^= t;
    this.state[3] = (this.state[3] << 11 | this.state[3] >>> 21) >>> 0;

    return (result >>> 0) / 0x100000000; // Returns [0, 1)
  }

  nextInt(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  getState(): Uint32Array { return new Uint32Array(this.state); }
  setState(state: Uint32Array): void { this.state.set(state); }
}
```

#### Multi-RNG Manager

**File**: `src/systems/DeterministicRNGManager.ts` (NEW)

**Purpose**: Separate RNG instances per subsystem to avoid coupling.

```typescript
export class DeterministicRNGManager {
  private asteroidRng: SeededRNG;
  private powerUpRng: SeededRNG;
  private aiRng: SeededRNG;
  private visualRng: SeededRNG; // Not synced (local-only effects)

  initializeFromSeed(baseSeed: number): void {
    const tempRng = new SeededRNG(baseSeed);
    this.asteroidRng.setSeed(tempRng.next() * 0xffffffff);
    this.powerUpRng.setSeed(tempRng.next() * 0xffffffff);
    this.aiRng.setSeed(tempRng.next() * 0xffffffff);
    // visualRng stays random (particle effects, local only)
  }

  getAsteroidRng(): SeededRNG { return this.asteroidRng; }
  getPowerUpRng(): SeededRNG { return this.powerUpRng; }
  getAIRng(): SeededRNG { return this.aiRng; }
  getVisualRng(): SeededRNG { return this.visualRng; }

  captureState(): RNGState {
    return {
      asteroid: this.asteroidRng.getState(),
      powerUp: this.powerUpRng.getState(),
      ai: this.aiRng.getState(),
    };
  }

  restoreState(state: RNGState): void {
    this.asteroidRng.setState(state.asteroid);
    this.powerUpRng.setState(state.powerUp);
    this.aiRng.setState(state.ai);
  }
}
```

#### Seed Distribution Protocol

**At Round Start** (`GameFlowManager.beginMatch`):

```typescript
// Host generates seed
if (this.network.isHost()) {
  const roundSeed = Math.floor(Math.random() * 0xffffffff);
  const startTick = this.tickSystem.getCurrentTick();
  this.network.broadcastRNGSeed(roundSeed, startTick);
  this.rngManager.initializeFromSeed(roundSeed);
}

// All clients receive (including host)
onRNGSeedReceived(baseSeed: number, startTick: number): void {
  this.rngManager.initializeFromSeed(baseSeed);
  this.tickSystem.reset(startTick);
  console.log(`[RNG] Initialized with seed ${baseSeed} at tick ${startTick}`);
}
```

**RPC Definition** (`NetworkManager.ts`):

```typescript
RPC.register("INIT_RNG", (data: { baseSeed: number; startTick: number }) => {
  this.callbacks?.onRNGSeedReceived?.(data.baseSeed, data.startTick);
});

broadcastRNGSeed(baseSeed: number, startTick: number): void {
  RPC.call("INIT_RNG", { baseSeed, startTick }, RPC.Mode.ALL);
}
```

### 4.2 Fixed Timestep System

#### Tick System with Accumulator

**File**: `src/systems/TickSystem.ts` (NEW)

**Purpose**: Replace variable delta-time with fixed 60Hz ticks, smooth rendering.

```typescript
export class TickSystem {
  private readonly TICK_RATE = 60; // Hz
  private readonly TICK_DURATION_MS = 1000 / this.TICK_RATE; // 16.667ms
  private readonly MAX_FRAME_TIME = 250; // Prevent spiral of death

  private currentTick: number = 0;
  private accumulator: number = 0;
  private lastFrameTime: number = 0;

  constructor() {
    this.lastFrameTime = performance.now();
  }

  update(onTick: (tick: number) => void): void {
    const now = performance.now();
    let frameTime = now - this.lastFrameTime;

    // Cap frame time to prevent spiral of death on lag spikes
    if (frameTime > this.MAX_FRAME_TIME) {
      frameTime = this.MAX_FRAME_TIME;
    }

    this.lastFrameTime = now;
    this.accumulator += frameTime;

    // Run fixed timestep updates
    while (this.accumulator >= this.TICK_DURATION_MS) {
      onTick(this.currentTick);
      this.currentTick++;
      this.accumulator -= this.TICK_DURATION_MS;
    }
  }

  getCurrentTick(): number { return this.currentTick; }
  getTickDurationMs(): number { return this.TICK_DURATION_MS; }

  // For render interpolation between ticks
  getAccumulatorAlpha(): number {
    return this.accumulator / this.TICK_DURATION_MS;
  }

  reset(startTick: number = 0): void {
    this.currentTick = startTick;
    this.accumulator = 0;
    this.lastFrameTime = performance.now();
  }
}
```

#### Game Loop Refactor

**File**: `Game.ts` (MODIFY)

**Before**:
```typescript
private loop(timestamp: number): void {
  const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
  this.lastTime = timestamp;

  this.update(dt);
  this.render(dt);

  requestAnimationFrame((t) => this.loop(t));
}
```

**After**:
```typescript
private loop(timestamp: number): void {
  // Fixed timestep simulation (may run 0, 1, or 2+ ticks per frame)
  this.tickSystem.update((tick) => {
    this.simulateTick(tick);
  });

  // Variable framerate rendering with interpolation
  const alpha = this.tickSystem.getAccumulatorAlpha();
  this.render(alpha);

  requestAnimationFrame((t) => this.loop(t));
}

private simulateTick(tick: number): void {
  if (this.flowMgr.phase !== "PLAYING") return;

  // All game logic runs at fixed 60 FPS
  this.processInput(tick);
  this.physics.update(); // Always 16.667ms (no dt parameter)
  this.updateEntities(tick);

  // Broadcast state every 3 ticks (20Hz = 50ms)
  if (this.network.isHost() && tick % 3 === 0) {
    this.networkSync.broadcastState({
      ...this.captureEntityStates(),
      tick: tick,
    });
  }
}
```

#### Physics Update Changes

**File**: `Physics.ts` (MODIFY)

**Before**:
```typescript
update(dt: number): void {
  Engine.update(this.engine, Math.min(dt, 16.667));
}
```

**After**:
```typescript
update(): void {
  // Always use fixed timestep (no dt parameter)
  Engine.update(this.engine, 16.667);
}
```

#### Render Interpolation

**Purpose**: Smooth rendering at any framerate (30fps, 60fps, 120fps, 144fps).

**Implementation** (`Game.ts`):

```typescript
private render(alpha: number): void {
  // Interpolate positions between previous and current tick
  const interpolatedShips = Array.from(this.ships.values()).map(ship => ({
    ...ship.getState(),
    x: lerp(ship.prevX, ship.body.position.x, alpha),
    y: lerp(ship.prevY, ship.body.position.y, alpha),
    angle: lerpAngle(ship.prevAngle, ship.body.angle, alpha),
  }));

  this.gameRenderer.render({
    ships: interpolatedShips,
    asteroids: this.interpolateAsteroids(alpha),
    // ... other entities
  });
}
```

**Entity Changes**: All entities must store previous tick state.

```typescript
// In Ship.ts, Asteroid.ts, etc.
prevX: number = 0;
prevY: number = 0;
prevAngle: number = 0;

savePreviousState(): void {
  this.prevX = this.body.position.x;
  this.prevY = this.body.position.y;
  this.prevAngle = this.body.angle;
}
```

**Call in simulateTick**:
```typescript
// Before physics update
this.ships.forEach(ship => ship.savePreviousState());
this.asteroids.forEach(asteroid => asteroid.savePreviousState());

// Then run physics
this.physics.update();
```

### 4.3 Tick-Based Entity Lifetimes

#### Projectile Example

**File**: `Projectile.ts` (MODIFY)

**Before**:
```typescript
private spawnTime: number = Date.now();

isExpired(): boolean {
  return Date.now() - this.spawnTime > this.lifetime;
}
```

**After**:
```typescript
private spawnTick: number;
private lifetimeTicks: number;

constructor(..., spawnTick: number, lifetimeTicks: number) {
  this.spawnTick = spawnTick;
  this.lifetimeTicks = lifetimeTicks;
}

isExpired(currentTick: number): boolean {
  return currentTick - this.spawnTick > this.lifetimeTicks;
}
```

#### Config Updates

**File**: `types.ts` (MODIFY)

Convert all millisecond durations to ticks (÷16.667):

```typescript
// Before (milliseconds)
PROJECTILE_LIFETIME: 2500,
PROJECTILE_SCATTER_LIFETIME: 600,
POWERUP_DESPAWN_TIME: 10000,
PILOT_SURVIVAL_TIME: 5000,
INVULNERABLE_TIME: 2000,
POWERUP_MINE_DESPAWN_TIME: 30000,

// After (ticks at 60Hz)
PROJECTILE_LIFETIME_TICKS: 150,       // 2500ms ÷ 16.667 = 150 ticks
PROJECTILE_SCATTER_LIFETIME_TICKS: 36, // 600ms ÷ 16.667 = 36 ticks
POWERUP_DESPAWN_TICKS: 600,           // 10000ms ÷ 16.667 = 600 ticks
PILOT_SURVIVAL_TICKS: 300,            // 5000ms ÷ 16.667 = 300 ticks
INVULNERABLE_TICKS: 120,              // 2000ms ÷ 16.667 = 120 ticks
POWERUP_MINE_DESPAWN_TICKS: 1800,     // 30000ms ÷ 16.667 = 1800 ticks
```

### 4.4 Deterministic Spawning

#### Asteroid Initial Spawn

**File**: `AsteroidManager.ts` (MODIFY)

**Before** (Line 34-74):
```typescript
const count = this.randomInt(min, max); // Math.random()
for (let i = 0; i < count; i++) {
  const tier = i === 0 ? "LARGE" : this.rollAsteroidTier();
  const size = this.randomAsteroidSize(tier);
  const x = centerX + (Math.random() * 2 - 1) * spreadX;
  const y = centerY + (Math.random() * 2 - 1) * spreadY;
  const angle = Math.random() * Math.PI * 2;
  const speed = this.randomRange(minSpeed, maxSpeed);
  const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  const angularVelocity = (Math.random() * 2 - 1) * 0.01;
}
```

**After**:
```typescript
spawnInitialAsteroids(rng: SeededRNG, tick: number): void {
  const count = rng.nextInt(cfg.ASTEROID_INITIAL_MIN, cfg.ASTEROID_INITIAL_MAX);

  for (let i = 0; i < count; i++) {
    // Deterministic tier selection
    const tier = i === 0 ? "LARGE" : (rng.next() < 0.6 ? "LARGE" : "SMALL");

    // Deterministic size within tier
    const size = rng.nextRange(
      tier === "LARGE" ? cfg.ASTEROID_LARGE_MIN : cfg.ASTEROID_SMALL_MIN,
      tier === "LARGE" ? cfg.ASTEROID_LARGE_MAX : cfg.ASTEROID_SMALL_MAX
    );

    // Deterministic position
    const x = centerX + (rng.next() * 2 - 1) * spreadX;
    const y = centerY + (rng.next() * 2 - 1) * spreadY;

    // Deterministic velocity
    const angle = rng.next() * Math.PI * 2;
    const speed = rng.nextRange(minSpeed, maxSpeed);
    const velocity = {
      x: Math.cos(angle) * speed * 0.75,
      y: Math.sin(angle) * speed * 0.75,
    };

    // Deterministic angular velocity
    const angularVelocity = (rng.next() * 2 - 1) * 0.01;

    // Create asteroid with tick-based lifetime
    const asteroid = new Asteroid(
      this.physics,
      x, y,
      velocity,
      angularVelocity,
      tier,
      size,
      tick
    );
    this.asteroids.push(asteroid);
  }
}
```

#### Scheduled Spawning (Tick-Based)

**File**: `AsteroidManager.ts` (MODIFY)

**Before** (setTimeout with random intervals):
```typescript
private scheduleNextAsteroidSpawn(): void {
  const delay = min + Math.random() * (max - min);
  this.asteroidSpawnTimeout = setTimeout(() => {
    this.spawnAsteroidBatch();
    this.scheduleNextAsteroidSpawn();
  }, delay * intervalScale);
}
```

**After** (Deterministic tick-based):
```typescript
private nextSpawnTick: number = 0;

planNextAsteroidSpawn(currentTick: number, rng: SeededRNG): void {
  const intervalMs = rng.nextRange(
    cfg.ASTEROID_SPAWN_INTERVAL_MIN,
    cfg.ASTEROID_SPAWN_INTERVAL_MAX
  ) * this.getIntervalScale();

  const intervalTicks = Math.floor(intervalMs / 16.667);
  this.nextSpawnTick = currentTick + intervalTicks;
}

updateSpawning(currentTick: number, rng: SeededRNG): void {
  if (this.asteroidSpawnSetting !== "SPAWN") return;

  if (currentTick >= this.nextSpawnTick) {
    this.spawnAsteroidBatch(rng, currentTick);
    this.planNextAsteroidSpawn(currentTick, rng);
  }
}
```

**Call in Game.simulateTick**:
```typescript
this.asteroidMgr.updateSpawning(tick, this.rngManager.getAsteroidRng());
```

#### Power-Up Drops

**File**: `AsteroidManager.ts` (MODIFY)

**Before**:
```typescript
trySpawnPowerUp(x: number, y: number): void {
  if (Math.random() > cfg.POWERUP_DROP_CHANCE) return;

  const rand = Math.random() * totalWeight;
  // ... weighted selection
}
```

**After**:
```typescript
trySpawnPowerUp(x: number, y: number, rng: SeededRNG, tick: number): void {
  if (rng.next() > cfg.POWERUP_DROP_CHANCE) return;

  const rand = rng.next() * totalWeight;
  let accumulated = 0;
  for (const [type, weight] of Object.entries(weights)) {
    accumulated += weight;
    if (rand <= accumulated) {
      const powerUp = new PowerUp(this.physics, x, y, type as PowerUpType, tick);
      this.powerUps.push(powerUp);
      return;
    }
  }
}
```

### 4.5 Client Prediction & Rollback

#### Input Buffer

**File**: `src/systems/InputBuffer.ts` (NEW)

**Purpose**: Store input history for rollback/replay.

```typescript
export interface TickInput {
  tick: number;
  playerId: string;
  input: PlayerInput;
}

export class InputBuffer {
  private buffer: Map<number, Map<string, PlayerInput>> = new Map();
  private maxHistoryTicks = 120; // 2 seconds at 60Hz

  addInput(tick: number, playerId: string, input: PlayerInput): void {
    if (!this.buffer.has(tick)) {
      this.buffer.set(tick, new Map());
    }
    this.buffer.get(tick)!.set(playerId, input);

    // Clean old inputs
    const oldestTick = tick - this.maxHistoryTicks;
    for (const t of this.buffer.keys()) {
      if (t < oldestTick) this.buffer.delete(t);
    }
  }

  getInput(tick: number, playerId: string): PlayerInput | null {
    return this.buffer.get(tick)?.get(playerId) ?? null;
  }

  getAllInputsForTick(tick: number): Map<string, PlayerInput> {
    return this.buffer.get(tick) ?? new Map();
  }

  clear(): void {
    this.buffer.clear();
  }
}
```

#### Client Prediction System

**File**: `src/systems/ClientPrediction.ts` (NEW)

**Purpose**: Run local physics prediction, reconcile with host, rollback on mismatch.

```typescript
export class ClientPrediction {
  private predictedTick: number = 0;
  private lastConfirmedTick: number = 0;
  private inputBuffer: InputBuffer = new InputBuffer();
  private stateSnapshots: Map<number, GameSnapshot> = new Map();

  constructor(
    private game: Game, // Access to entities, physics, RNG
  ) {}

  // Called every tick on non-host
  predictTick(tick: number, myPlayerId: string, myInput: PlayerInput): void {
    // Store my input for this tick
    this.inputBuffer.addInput(tick, myPlayerId, myInput);

    // Save snapshot before prediction
    this.stateSnapshots.set(tick, this.captureSnapshot());

    // Simulate this tick with my input
    this.simulateTick(tick, new Map([[myPlayerId, myInput]]));

    this.predictedTick = tick;
  }

  // Called when authoritative snapshot arrives from host
  reconcile(authoritativeState: GameStateSync, authTick: number): void {
    if (authTick <= this.lastConfirmedTick) return; // Old snapshot, ignore

    // Compare predicted state with authoritative state
    const mismatch = this.detectMismatch(authTick, authoritativeState);

    if (mismatch) {
      console.log(`[Prediction] Mismatch at tick ${authTick}, rolling back`);

      // Rollback to authoritative state
      this.restoreSnapshot(authTick, authoritativeState);

      // Replay all inputs from authTick+1 to current predicted tick
      for (let t = authTick + 1; t <= this.predictedTick; t++) {
        const inputs = this.inputBuffer.getAllInputsForTick(t);
        this.simulateTick(t, inputs);
      }
    }

    this.lastConfirmedTick = authTick;

    // Clean old snapshots (keep 1 second history)
    for (const t of this.stateSnapshots.keys()) {
      if (t < authTick - 60) this.stateSnapshots.delete(t);
    }
  }

  private detectMismatch(tick: number, authState: GameStateSync): boolean {
    const predicted = this.stateSnapshots.get(tick);
    if (!predicted) return false; // No prediction to compare

    // Compare critical state (ship positions within tolerance)
    for (const authShip of authState.ships) {
      const predShip = predicted.ships.find(s => s.playerId === authShip.playerId);
      if (!predShip) return true; // Entity count mismatch

      const dx = authShip.x - predShip.x;
      const dy = authShip.y - predShip.y;
      const distSq = dx * dx + dy * dy;

      // Mismatch if position error > 10px
      if (distSq > 100) {
        console.log(`[Prediction] Ship ${authShip.playerId} off by ${Math.sqrt(distSq).toFixed(1)}px`);
        return true;
      }
    }

    // Could add checks for asteroid count, projectile count, etc.
    return false; // States match within tolerance
  }

  private simulateTick(tick: number, inputs: Map<string, PlayerInput>): void {
    // Apply all player inputs
    inputs.forEach((input, playerId) => {
      const ship = this.game.ships.get(playerId);
      if (ship) {
        ship.applyInput(input, false, 16.667 / 1000, 1, 1);
      }
    });

    // Run fixed timestep physics
    this.game.physics.update();

    // Update all entities (lifetimes, AI, etc.)
    this.game.updateEntities(tick);

    // Save snapshot after simulation
    this.stateSnapshots.set(tick, this.captureSnapshot());
  }

  private captureSnapshot(): GameSnapshot {
    return {
      ships: Array.from(this.game.ships.values()).map(s => s.getState()),
      asteroids: this.game.asteroidMgr.getAsteroids().map(a => a.getState()),
      projectiles: this.game.projectiles.map(p => p.getState()),
      // ... other entities
      rngState: this.game.rngManager.captureState(),
    };
  }

  private restoreSnapshot(tick: number, authState: GameStateSync): void {
    // Destroy all current entities
    this.game.ships.forEach(ship => ship.destroy());
    this.game.ships.clear();

    this.game.projectiles.forEach(proj => proj.destroy());
    this.game.projectiles = [];

    // Recreate entities from authoritative state
    authState.ships.forEach(shipState => {
      const ship = Ship.fromState(this.game.physics, shipState);
      this.game.ships.set(shipState.playerId, ship);
    });

    authState.projectiles.forEach(projState => {
      const proj = Projectile.fromState(this.game.physics, projState);
      this.game.projectiles.push(proj);
    });

    // ... restore other entities

    // Restore RNG state (if included in authState)
    if (authState.rngState) {
      this.game.rngManager.restoreState(authState.rngState);
    }
  }
}
```

#### Integration in Game Loop

**File**: `Game.ts` (MODIFY)

**Non-Host Tick Simulation**:
```typescript
private simulateTick(tick: number): void {
  if (this.flowMgr.phase !== "PLAYING") return;

  if (this.network.isHost()) {
    // Host: Collect all player inputs and simulate
    this.processAllInputs(tick);
    this.physics.update();
    this.updateEntities(tick);

    // Broadcast every 3 ticks (20Hz)
    if (tick % 3 === 0) {
      this.networkSync.broadcastState({
        ...this.captureEntityStates(),
        tick: tick,
      });
    }
  } else {
    // Non-Host: Predict local input immediately
    const myInput = this.inputResolver.captureLocalInput();
    this.prediction.predictTick(tick, this.network.getMyPlayerId(), myInput);

    // Send input to host (will arrive 1-3 ticks later)
    this.network.sendInput(tick, myInput);
  }
}

// When host snapshot arrives (non-host only)
private onGameStateReceived(state: GameStateSync): void {
  if (!this.network.isHost()) {
    // Reconcile prediction with authoritative state
    this.prediction.reconcile(state, state.tick);
  }
}
```

### 4.6 Network Protocol Updates

#### Updated GameStateSync

**File**: `types.ts` (MODIFY)

```typescript
export interface GameStateSync {
  tick: number; // ← NEW: Authoritative tick number
  ships: ShipState[];
  pilots: PilotState[];
  projectiles: ProjectileState[];
  asteroids: AsteroidState[];
  powerUps: PowerUpState[];
  laserBeams: LaserBeamState[];
  mines: MineState[];
  homingMissiles: HomingMissileState[];
  turret: TurretState | null;
  turretBullets: TurretBulletState[];
  playerPowerUps?: Record<string, PlayerPowerUp | null>;
  rotationDirection: number;
  screenShakeIntensity: number;
  screenShakeDuration: number;
  rngState?: RNGState; // ← NEW: Optional for debugging mismatches
}

export interface RNGState {
  asteroid: Uint32Array;
  powerUp: Uint32Array;
  ai: Uint32Array;
}
```

#### Input Message Format

**File**: `types.ts` (ADD)

```typescript
export interface InputMessage {
  tick: number;         // Client's predicted tick
  playerId: string;
  input: PlayerInput;
  clientTime: number;   // For latency tracking (performance.now())
}
```

**File**: `NetworkManager.ts` (MODIFY)

**Before** (unreliable player state):
```typescript
sendInput(input: PlayerInput): void {
  const player = myPlayer();
  if (player) {
    player.setState("input", input, false); // Unreliable
  }
}
```

**After** (RPC for reliability):
```typescript
sendInput(tick: number, input: PlayerInput): void {
  const msg: InputMessage = {
    tick,
    playerId: this.getMyPlayerId(),
    input,
    clientTime: performance.now(),
  };
  RPC.call("PLAYER_INPUT", msg, RPC.Mode.HOST);
}

// In setupListeners() (host only)
RPC.register("PLAYER_INPUT", (msg: InputMessage) => {
  if (!isHost()) return;

  const latency = performance.now() - msg.clientTime;
  // Store input for processing at msg.tick (or current tick if late)
  this.callbacks?.onInputReceived?.(msg.playerId, msg.input, msg.tick);
});
```

#### Broadcast with Tick ID

**File**: `NetworkSyncSystem.ts` (MODIFY)

```typescript
broadcastState(input: BroadcastStateInput, tick: number): void {
  const state: GameStateSync = {
    tick: tick, // ← Include authoritative tick
    ships: Array.from(input.ships.values()).map(s => s.getState()),
    asteroids: input.asteroidMgr.getAsteroids().map(a => a.getState()),
    // ... other entities
    rngState: input.rngManager.captureState(), // Optional (debug mode)
  };

  this.network.broadcastGameState(state);
}
```

---

## 5. Implementation Phases (Simplified)

### Phase 1: Seeded RNG (Week 1-2)

**Goal**: Everyone sees the same spawns (asteroids, power-ups, etc.).

**What to Build**:
1. Simple `SeededRNG.ts` class (150 LOC) - xoshiro128** algorithm
2. RPC to broadcast seed at round start
3. Replace all 43 game-logic Math.random() calls

**Files to Change**:
- NEW: `src/systems/SeededRNG.ts` (~150 lines)
- MODIFY: `NetworkManager.ts` - Add seed RPC (~20 lines)
- MODIFY: `AsteroidManager.ts` - Replace Math.random (~100 lines)
- MODIFY: `AstroBot.ts` - Replace Math.random (~20 lines)
- MODIFY: `Game.ts` - Initialize RNG (~15 lines)

**Testing**:
- Two clients with same seed → see identical asteroid spawns
- Power-ups drop in same locations for everyone

**Deliverable**: Everyone plays on the same "random" map.

**Time**: 1-2 weeks

---

### Phase 2: Fixed Timestep (Week 3-4)

**Goal**: Physics runs consistently regardless of frame rate.

**What to Build**:
1. Simple `TickSystem.ts` (~150 LOC) - accumulator pattern
2. Refactor game loop to use fixed ticks
3. Convert Date.now() to tick counters

**Files to Change**:
- NEW: `src/systems/TickSystem.ts` (~150 lines)
- MODIFY: `Game.ts` - Loop refactor (~40 lines)
- MODIFY: `Physics.ts` - Remove variable dt (~10 lines)
- MODIFY: Entity files - Tick-based lifetimes (~60 lines total)

**Testing**:
- 30fps display: Still feels smooth (render interpolation works)
- 120fps display: Physics doesn't speed up
- Game feels identical to current version

**Deliverable**: Stable physics at any frame rate.

**Time**: 1-2 weeks

---

### Phase 3: Light Client Physics (Week 5-6)

**Goal**: Non-hosts run physics locally for smooth input.

**What to Build**:
1. Non-hosts run the same fixed physics loop
2. Apply own input immediately (feels instant)
3. When host snapshot arrives: gently blend toward it (no hard snap)

**Files to Change**:
- MODIFY: `Game.ts` - Add non-host physics path (~50 lines)
- MODIFY: `NetworkSyncSystem.ts` - Gentle blending (~40 lines)
- MODIFY: `Ship.ts` - Add blend target fields (~20 lines)

**Code Example** (NetworkSyncSystem.ts):
```typescript
applyHostCorrection(shipState: ShipState): void {
  const ship = this.ships.get(shipState.playerId);

  // Check if we're significantly off
  const dx = shipState.x - ship.x;
  const dy = shipState.y - ship.y;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (dist > 50) {
    // Too far off, snap to host position
    ship.x = shipState.x;
    ship.y = shipState.y;
  } else {
    // Close enough, gently blend over 3 frames
    ship.targetX = shipState.x;
    ship.targetY = shipState.y;
    ship.blendSpeed = 0.3; // 30% per frame
  }
}
```

**Testing**:
- Non-host player moves ship → feels instant (no lag)
- Host correction arrives → ship smoothly adjusts (no teleport)
- 100ms network latency: Still feels smooth

**Deliverable**: Smooth online multiplayer for all players.

**Time**: 1-2 weeks

---

### Total Timeline: 4-6 weeks

**Best case**: 3 weeks (1 week per phase if everything goes smoothly)
**Expected**: 4-5 weeks (minor issues, testing, polish)
**Worst case**: 6 weeks (some rework needed)

**Rollback Strategy**: Each phase builds on the previous, so you can stop at any phase and still have improvements.

- Phase 1 only: Everyone sees same spawns (minor improvement)
- Phase 2 only: Stable physics (minor improvement)
- Phase 1+2: Deterministic game (good for debugging)
- All 3 phases: **Smooth multiplayer (shippable)**

---

## 6. Testing (Keep It Simple)

### 6.1 Phase 1 Testing (Seeded RNG)

**Test 1: Same Seed = Same Spawns**
```typescript
// Two browser tabs, both join with seed 12345
// Verify:
// - Same number of asteroids spawn
// - Asteroids at same positions
// - Power-ups drop from same asteroids
```

**Test 2: Different Browsers**
- Chrome, Firefox, Safari all get seed 12345
- Verify: Identical asteroid patterns

**Pass Criteria**: Everyone sees the same game world.

---

### 6.2 Phase 2 Testing (Fixed Timestep)

**Test 1: Frame Rate Independence**
```typescript
// Throttle browser to 30 FPS
// Verify: Game still feels 60fps smooth

// Run at 120 FPS
// Verify: Physics doesn't speed up
```

**Test 2: Lag Spike**
```typescript
// Artificially freeze for 500ms
// Verify: Game catches up smoothly (no spiral of death)
```

**Pass Criteria**: Game runs consistently at any frame rate.

---

### 6.3 Phase 3 Testing (Client Physics)

**Test 1: Input Responsiveness**
```typescript
// Non-host player presses rotate button
// Verify: Ship rotates IMMEDIATELY (no 50ms delay)
```

**Test 2: Smooth Corrections**
```typescript
// Artificially offset client ship by 20px
// When host correction arrives
// Verify: Ship smoothly blends back (no teleport)
```

**Test 3: Network Conditions**
```typescript
// Test with 100ms latency
// Verify: Still feels smooth

// Test with 200ms latency
// Verify: Playable (some corrections visible but smooth)
```

**Pass Criteria**: Non-host gameplay feels responsive and smooth.

---

### 6.4 Simple Debug Tool

Add to Game.ts:
```typescript
// Press F3 to toggle debug overlay
if (key === 'F3') {
  this.showDebugInfo = !this.showDebugInfo;
}

// Render debug info
if (this.showDebugInfo) {
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText(`FPS: ${Math.round(fps)}`, 10, 20);
  ctx.fillText(`Tick: ${this.currentTick}`, 10, 35);
  ctx.fillText(`Latency: ${this.network.getPing()}ms`, 10, 50);
  ctx.fillText(`Asteroids: ${this.asteroids.length}`, 10, 65);
}
```

**That's it.** No complex hash validation, no desync detection systems. Just basic testing to verify it works.

---

## 7. Practical Risks

### 7.1 Matter.js Might Not Be Perfectly Deterministic (LOW-MEDIUM RISK)

**Issue**: Matter.js uses floating-point math, might differ slightly across browsers.

**Why It's Probably Fine**:
- We're using gentle blending (50px snap threshold)
- Small differences (<10px) get smoothed out
- Host is still authoritative

**If It Becomes a Problem**:
- Test on Chrome, Firefox, Safari during Phase 2
- If differences are large (>20px often), we'll see it in testing
- Worst case: Increase blend tolerance or keep current system

**Don't Worry About This Yet**: Cross that bridge if/when we get there.

---

### 7.2 Mobile Performance (MEDIUM RISK)

**Issue**: Running physics on client might be too slow on budget phones.

**Mitigation**:
- Test on an older device (iPhone 8 or budget Android) during Phase 3
- If too slow: Disable client physics on mobile (keep current system for mobile)
- Desktop gets smooth experience, mobile gets acceptable experience

**Code Example**:
```typescript
const ENABLE_CLIENT_PHYSICS = !isMobile() || deviceScore > 1000;
```

---

### 7.3 Time Investment vs Benefit (MEDIUM RISK)

**Issue**: 4-6 weeks is significant time. Is it worth it?

**Consider**:
- If current system is "playable but not great" → Maybe ship first, improve later
- If current system is "unacceptably laggy" → This is critical path to launch

**Fallback Options**:
1. **Quick Win**: Just do Phase 1 (seeded RNG) for consistent spawns - 1 week effort
2. **Medium Win**: Phase 1+2 (deterministic physics) - 2-3 weeks, helps debugging
3. **Full Win**: All 3 phases - 4-6 weeks, smooth multiplayer

**Decision Point**: After Phase 1, evaluate if the improvement is worth continuing.

---

### 7.4 Unexpected Bugs (ALWAYS A RISK)

**Issue**: Changing core game loop might break things.

**Mitigation**:
- Test thoroughly after each phase
- Keep old system code commented out (easy rollback)
- Have a "kill switch" to disable new code:
  ```typescript
  const USE_NEW_PHYSICS = true; // Set to false to revert
  ```

**Philosophy**: Ship working code, not perfect code.

---

## 8. Files You'll Touch

### Phase 1: Seeded RNG (~300 LOC total)

**New Files**:
- `src/systems/SeededRNG.ts` (~150 lines) - Simple PRNG

**Modified Files**:
- `src/network/NetworkManager.ts` (+20 lines) - Seed RPC
- `src/managers/AsteroidManager.ts` (+100 lines) - Replace Math.random
- `src/managers/AstroBot.ts` (+20 lines) - Replace Math.random
- `src/Game.ts` (+15 lines) - Initialize RNG

### Phase 2: Fixed Timestep (~200 LOC total)

**New Files**:
- `src/systems/TickSystem.ts` (~150 lines) - Accumulator pattern

**Modified Files**:
- `src/Game.ts` (+40 lines) - Loop refactor
- `src/systems/Physics.ts` (+10 lines) - Remove variable dt
- `src/entities/*.ts` (+60 lines total) - Tick-based lifetimes

### Phase 3: Client Physics (~110 LOC total)

**Modified Files**:
- `src/Game.ts` (+50 lines) - Non-host physics path
- `src/network/NetworkSyncSystem.ts` (+40 lines) - Gentle blending
- `src/entities/Ship.ts` (+20 lines) - Blend targets

### Total Changes

- **New Code**: ~300 lines (2 new files)
- **Modified Code**: ~310 lines (8 existing files)
- **Total**: ~610 lines of code across 10 files
- **Manageable**: ~150 lines per week over 4 weeks

---

## 9. Bottom Line

### What This Gets You

**For Players**:
- Non-host gameplay feels smooth (no more jittery ships)
- Everyone sees the same game (same asteroid spawns, power-ups)
- Input feels instant (~20ms → ~5ms perceived latency)

**For Launch**:
- **Shippable online multiplayer** that doesn't feel laggy
- Competitive feature (smooth multiplayer is table stakes)
- Good foundation for future improvements

### Timeline Decision Tree

**Option A: Ship Current System** (0 weeks)
- Pros: Immediate launch
- Cons: Jittery non-host experience might hurt reviews

**Option B: Quick Fix** (1-2 weeks)
- Just do Phase 1 (seeded RNG)
- Pros: Everyone sees same spawns, minor improvement
- Cons: Still laggy for non-hosts

**Option C: Solid Foundation** (3-4 weeks)
- Do Phase 1+2 (seeded RNG + fixed timestep)
- Pros: Deterministic game, better physics
- Cons: Still 50ms input lag for non-hosts

**Option D: Smooth Multiplayer** (4-6 weeks) ← **RECOMMENDED**
- Do all 3 phases
- Pros: Actually feels smooth for everyone, shippable quality
- Cons: 1-1.5 months of development time

### Next Steps

1. **Decide**: Is smooth multiplayer worth 4-6 weeks?
2. **If yes**: Start with Phase 1 (seeded RNG)
3. **Test after each phase**: Make sure it's working before continuing
4. **Ship it**: Launch when non-host experience feels good

**This isn't overengineering. This is the minimum needed to make online multiplayer feel smooth enough to ship.**

---

**Document Version**: 2.0 (Simplified)
**Last Updated**: 2026-02-11
**Estimated Read Time**: 15 minutes
