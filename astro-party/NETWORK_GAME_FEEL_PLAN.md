# Astro Party - Network Game Feel Spec (Implemented)

Canonical network-feel spec for `astro-party/`, aligned to the shipped implementation.
This intentionally ignores `unfinished-games/`.

## 1) Runtime Model

## Authority and rates
- Multiplayer is server-authoritative (Colyseus room + shared Matter.js sim).
- Server simulation tick: 60 Hz.
- Snapshot broadcast: 20 Hz (`SYNC_INTERVAL = 50 ms` target cadence on client input send side).

## Transport modes
- `online`: `ColyseusTransport` (server-authoritative networked play).
- `local`: `LocalSharedSimTransport` (in-process shared simulation).
- Local players are supported in local mode; not exposed in online mode.

## 2) Protocol and Timing

## Input payload
- `PlayerInput` contains:
  - `buttonA`, `buttonB`
  - `timestamp`, `clientTimeMs`
  - `inputSequence` (monotonic per local player stream)
  - `rttMs` (optional client-measured RTT sample)

## Snapshot payload
- Snapshot includes:
  - `hostTick`, `tickDurationMs`
  - `serverNowMs`
  - `lastProcessedInputSequenceByPlayer: Record<string, number>`
  - full authoritative entity state

## Server-side tracking
- Per player runtime state tracks:
  - latest received input sequence
  - last processed input sequence
  - reported RTT
- Snapshot ack map is emitted every snapshot.

## 3) Presentation Pipeline Split

## Online mode behavior
- Remote entities are rendered from a snapshot ring buffer with interpolation.
- Render time uses delayed host time (`estimatedHostNow - interpolationDelay`).
- Extrapolation is allowed only within a capped window.
- Self ship is excluded from remote interpolation and rendered through prediction/reconciliation.
- Predicted local dash/fire cosmetics are shown immediately.

## Local mode behavior
- Renders latest authoritative snapshot directly.
- No interpolation delay path.
- No self prediction/reconciliation path.
- No predicted-action cosmetic suppression logic required.

## 4) Self Prediction/Reconciliation (Online)

- Input capture runs every frame; input send is cadence-based.
- Sent inputs are recorded in pending history keyed by `inputSequence`.
- On authoritative snapshot:
  - read self ack sequence from `lastProcessedInputSequenceByPlayer`
  - drop acked pending inputs
  - rebase to authoritative ship
  - replay remaining pending inputs
- Correction behavior:
  - low error: direct rebase
  - medium error: blend correction
  - high error: hard snap

## 5) Lag Compensation (Server)

- Scoped lag compensation is implemented for laser ship-hit checks.
- Server stores per-ship transform history and rewinds target ships for hit evaluation.
- Rewind uses bounded budget derived from RTT estimate and hard cap.
- Scope is intentionally narrow (laser first); broad rewind for all mechanics is not implemented.

## 6) Key Tuning Values

Primary client tuning lives in `src/network/gameFeel/NetworkGameFeelTuning.ts`.

## Remote smoothing
- interpolation delay base: `120 ms`
- adaptive delay range: `80-220 ms`
- extrapolation cap range: `100-140 ms`
- buffer size cap: `120 snapshots`

## Self prediction
- replay step: `SYNC_INTERVAL / 1000`
- pending input buffer cap: `64`
- soft blend threshold: `32 px`
- hard snap threshold: `85 px`
- correction threshold (event count): `2 px`

## Predicted local sound suppression
- fire: `260 ms`
- dash: `320 ms`

## Server lag-comp bounds
- history window: `500 ms`
- max rewind: `200 ms`

## 7) File Map

- `shared/sim/types.ts`
  - input sequence + RTT fields
  - snapshot ack + `serverNowMs`
  - runtime fields for per-player input progression and RTT
- `shared/sim/AstroPartySimulation.ts`
  - per-player sequence tracking
  - snapshot ack map emission
  - ship transform history + lag-comp pose/rewind helpers
- `shared/sim/ShipSystem.ts`
  - laser hit resolution uses bounded lag-comp rewind for ship targets
- `server/src/rooms/AstroPartyRoom.ts`
  - input message contract extended for `inputSequence`/`rttMs`
- `src/network/transports/ColyseusTransport.ts`
  - sends `inputSequence` + RTT sample
- `src/network/transports/LocalSharedSimTransport.ts`
  - sends `inputSequence` (RTT forced to local value)
- `src/systems/PlayerInputResolver.ts`
  - monotonic `inputSequence` generation
- `src/network/NetworkSyncSystem.ts`
  - explicit online vs local render-path divergence
  - online interpolation/extrapolation + self reconciliation
- `src/network/gameFeel/SelfShipPredictor.ts`
  - local self prediction/replay/correction
- `src/network/gameFeel/NetworkGameFeelTuning.ts`
  - centralized network-feel tuning constants
- `src/Game.ts`
  - predicted local fire/dash cosmetics + duplicate authoritative sound suppression

## 8) Validation

Build validation currently passing:
- `bun run typecheck`
- `bun run build`

Recommended live-network test matrix:
- RTT: `40, 120, 250, 400 ms`
- jitter: low/medium/high
- loss: `0%, 2%, 5%`

Pass criteria:
- self controls remain immediate-feeling online at high RTT
- remote movement remains readable
- correction snaps stay limited
- server authority outcomes remain consistent (kills, rounds, score flow)
