# Astro Party - Network Game Feel Plan (Current Implementation Baseline)

This is the canonical network-feel plan for `astro-party/`.
It intentionally ignores `unfinished-games/` and is aligned to the current shipping stack.

## 1) Current Runtime Reality

## Authority and Tick Rates
- Multiplayer is server-authoritative via Colyseus.
- Server simulation runs at 60 Hz.
- Snapshots are broadcast at 20 Hz.

## Active Networking Path
- Active transport is Colyseus (`src/network/transports/createTransport.ts`).
- Legacy Playroom transport code has been removed from active source.

## Input Pipeline Today
- Clients capture input every frame.
- Non-authority clients send input state every `SYNC_INTERVAL` (50 ms).
- Dash is sent as a separate RPC (`cmd:dash`).
- Payload currently has no monotonic input sequence ID.

## Client Presentation Today
- `NetworkSyncSystem` prediction APIs are no-op stubs.
- Client now renders latest authoritative snapshot state directly (no interpolation path currently wired).

## Lag Handling Today
- RTT is measured via ping/pong and used for telemetry only.
- No client prediction/reconciliation.
- No server rewind/lag compensation for hit resolution.

## Physics/Simulation Stack
- Shared simulation and client runtime both use Matter.js.
- No Rapier snapshot/restore in the active code path.

## Local Multiplayer State
- Local player add is currently unsupported in active server sim (`LOCAL_PLAYER_UNSUPPORTED`).

## 2) Goals

- Keep server-authoritative fairness and anti-cheat properties.
- Make local self-control feel immediate, including at 250-400 ms RTT.
- Make remote entities readable and stable with minimal warping.
- Keep corrections explainable and rare.

## 3) Non-Goals

- No trust shift from server authority to clients.
- No full rollback netcode rewrite for all entities in the first pass.
- No dependency on archived transport implementations.

## 4) Major Plan Corrections vs Current State

1. The model is server-authoritative, not peer host-authoritative.
2. "Remote interpolation already exists" is not true in active render path.
3. Local prediction/reconciliation is currently not implemented.
4. Sequence/ack protocol required by reconciliation does not exist yet.
5. Lag compensation must be scoped; broad rewind for every mechanic is too risky as first step.

## 5) Phased Implementation Plan

## Phase 0 - Instrumentation and Feature Flags

Add runtime toggles and telemetry before behavior changes.

### Deliverables
- Feature flags:
  - `netRemoteInterpolationV1`
  - `netSelfPredictionV1`
  - `netPredictedActionCosmeticsV1`
  - `netLagCompLaserV1`
- Telemetry counters:
  - RTT avg/p95
  - snapshot interval and jitter
  - correction count and magnitude
  - hard snap count per minute
  - input-to-local-response ms
  - input-to-server-ack ms

### Why first
- Lets us roll out incrementally and tune with real signals.

## Phase 1 - Real Remote Interpolation Buffer

Implement actual buffered interpolation for non-owned entities.

### Core Mechanics
- Maintain a time-ordered snapshot ring buffer.
- Estimate render timestamp as `estimatedHostNowMs - interpolationDelayMs`.
- Interpolate between surrounding snapshots.
- Extrapolate only when necessary, capped to short horizon.
- Keep per-entity hard snap thresholds.

### Initial Tuning
- Start interpolation delay at 120 ms.
- Adaptive range: 80-220 ms based on jitter.
- Extrapolation cap: 100-140 ms.

### Scope
- Apply to remote ships, pilots, projectiles, asteroids, missiles, turret bullets.
- Keep own controlled ship out of remote interpolation path.

## Phase 2 - Sequence/Ack Protocol Foundation

Add protocol fields needed for deterministic reconciliation.

### Input Changes
- Extend `PlayerInput` with:
  - `inputSequence: number`
  - `clientTimeMs: number` (already present, keep)

### Snapshot Changes
- Add per-player ack state:
  - `lastProcessedInputSequenceByPlayer: Record<string, number>`
- Keep `hostTick` and `tickDurationMs`.
- Add `serverNowMs` in snapshot payload for better clock alignment.

### Server Behavior
- Store latest valid input per player with sequence.
- Track last applied sequence per player in sim tick.
- Include ack map in every snapshot.

## Phase 3 - Self Movement Prediction + Reconciliation

Predict only local controlled ship movement first.

### Client Mechanics
- On local input:
  - assign `inputSequence`
  - send to server
  - apply movement prediction same frame
  - store input in pending history
- On authoritative snapshot:
  - read ack sequence for self
  - discard acknowledged inputs
  - reset predicted baseline to authoritative state
  - replay remaining unacked inputs

### Correction Policy
- Tiny error: smooth over a few frames.
- Medium error: quick nudge.
- Large error: controlled snap with clear feedback.

### Important Constraint
- Combat outcomes remain server-authoritative in this phase.

## Phase 4 - Predicted Local Action Cosmetics

Reduce perceived latency for actions without changing authority.

### Fire
- Trigger local muzzle flash/recoil/sfx immediately on press.
- Keep projectile creation/hit authority on server.
- Reconcile visual-only divergences quietly.

### Dash
- Start dash VFX/audio/haptic immediately.
- Keep actual validation/cooldown authority server-side.

### Damage/Death
- No client-finalized elimination states.
- Optional pre-hit cues allowed, final state only from server.

## Phase 5 - Bounded Lag Compensation (Targeted)

Add rewind only where it gives high value with low exploit surface.

### Recommended First Target
- Laser (instant line-based checks) because latency disadvantage is largest there.

### Server Mechanic
- Keep transform history window per player ship (for example 500 ms at 60 Hz).
- When processing lag-compensated action, evaluate against rewound target transform using bounded rewind.
- Hard cap rewind budget (for example <= 200 ms).

### Deferred Targets
- Projectile-vs-ship broad rewind stays deferred until telemetry confirms need.

## Phase 6 - Rollout Strategy

1. Ship Phase 1 behind flags and tune.
2. Ship Phase 2 protocol changes (no behavior change yet).
3. Enable Phase 3 for internal testing and staged rollout.
4. Enable Phase 4 cosmetics.
5. Add Phase 5 laser lag compensation.

Each phase should be independently reversible by flag.

## 6) File-Level Change Map

- `shared/sim/types.ts`
  - add `inputSequence` to input type
  - add per-player ack map and optional `serverNowMs` to snapshot type
- `shared/sim/AstroPartySimulation.ts`
  - track per-player last processed input sequence
  - include ack map in snapshot build
- `server/src/rooms/AstroPartyRoom.ts`
  - pass new input fields through
  - keep current 60 Hz sim / 20 Hz snapshot defaults
- `src/systems/PlayerInputResolver.ts`
  - monotonic input sequence generator
  - maintain pending local input history for prediction
- `src/network/NetworkSyncSystem.ts`
  - implement snapshot buffer interpolation for remote entities
  - implement self prediction and reconciliation pipeline
- `src/systems/GameRenderer.ts`
  - consume interpolated remote stream and predicted self stream cleanly

## 7) Validation Matrix

Test with representative network profiles:
- RTT: 40 ms, 120 ms, 250 ms, 400 ms
- Jitter: low, medium, high
- Packet loss: 0%, 2%, 5%

Verify:
- local input feels immediate at high RTT
- remote motion remains readable and stable
- hard corrections are rare and understandable
- no authority regressions (kills, round flow, score submission)

## 8) Known Open Constraints

- Local multiplayer remains unsupported and is out of this plan scope.
- Existing host-simulation branch in `Game.ts` is legacy; plan assumes server-authoritative Colyseus runtime.
- Matter.js remains the active physics dependency for this plan.
