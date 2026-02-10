# Astro Party — Networking Architecture

## Authority Model

**Host-authoritative.** One player is the host — they run all physics (Matter.js at 60fps), handle all collisions, entity spawning/destruction, kills, scoring, and phase transitions. Everyone else (non-host) is a dumb terminal: they send input, receive world state, and render it.

---

## Transport Layers (PlayroomKit)

PlayroomKit provides two transport mechanisms:

| Transport | API | Delivery | Use Case |
|-----------|-----|----------|----------|
| **WebRTC data channel** | `setState(key, val, false)` | **Unreliable**, unordered, low-latency (UDP-like) | High-frequency position/input data |
| **WebSocket** | `setState(key, val, true)` or `RPC.call()` | **Reliable**, ordered, higher latency (TCP-like) | One-time events, player metadata |

PlayroomKit auto-negotiates WebRTC. If it fails (firewalls, NAT), everything falls back to WebSocket silently. The game detects this via `myPlayer().webrtcConnected` + a `"webrtc_connected"` event. The telemetry overlay shows "RTC" or "WS" so you can see which transport is active.

---

## Data Channels — What Goes Where

### 1. Game State (Host → All, Unreliable, 20Hz)

```
Host: setState("gameState", fullWorldSnapshot, false)   // every 50ms
Non-host: getState("gameState")                          // polled every 50ms
```

**Payload** (`GameStateSync`):
- All entity positions/velocities/angles: ships, pilots, projectiles, asteroids, powerUps, laserBeams, mines, homingMissiles
- `rotationDirection` (arena rotation mode)
- `playerPowerUps` (optional — sent every 200ms, not every tick, to reduce payload)

**Why unreliable**: Positions update 20x/second. If one packet is lost, the next one arrives 50ms later with fresh data. Reliability would add latency for no benefit.

### 2. Player Input (Non-host → Host, Unreliable, 20Hz)

```
Non-host: player.setState("input", playerInput, false)   // every 50ms
Host: player.getState("input")                            // polled every 50ms
```

**Payload** (`PlayerInput`):
- `buttonA` (boolean) — rotation held
- `buttonB` (boolean) — thrust+fire held
- `timestamp`, `clientTimeMs`

**Note**: Dash is NOT sent via input state. It's sent as a separate RPC (see below) because it's a one-shot event that must not be missed.

### 3. Player Metadata (Both Directions, Reliable, On Change)

```
player.setState("kills", count, true)        // Host sets, reliable
player.setState("roundWins", count, true)     // Host sets, reliable
player.setState("playerState", state, true)   // Host sets, reliable
player.setState("customName", name, true)     // Player sets own name, reliable
player.setState("colorIndex", idx, true)      // Host sets, reliable
player.setState("botType", type, true)        // Host sets for bots, reliable
```

These use `setState(..., true)` — reliable delivery. They change rarely (on kills, round ends, name entry) so reliability is worth the latency cost.

### 4. RPCs (Reliable, On Demand)

RPCs use WebSocket internally — always reliable, always delivered. Used for one-time events that must not be missed:

| RPC Name | Direction | Mode | Payload | When |
|----------|-----------|------|---------|------|
| `gamePhase` | Host → All | `RPC.Mode.ALL` | phase + winnerId + winnerName | Phase transitions |
| `countdown` | Host → All | `RPC.Mode.ALL` | number (3, 2, 1, 0) | Countdown ticks |
| `gameSound` | Host → All/Others | `ALL` or `OTHERS` | type + playerId | Sound events |
| `dashRequest` | Non-host → Host | `RPC.Mode.HOST` | playerId | Player dashes |
| `ping` | Host → All | `RPC.Mode.ALL` | hostTime (Date.now()) | Latency measurement |
| `playerList` | Host → All | `RPC.Mode.ALL` | order[] + meta[] + hostId | Player join/leave/reorder |
| `roundResult` | Host → All | `RPC.Mode.ALL` | RoundResultPayload | Round ends |
| `gameMode` | Host → All | `RPC.Mode.ALL` | GameMode object | Mode selection |
| `advancedSettings` | Host → All | `RPC.Mode.ALL` | AdvancedSettingsSync | Settings change |

---

## Timing & Frequencies

```
60fps ─── Physics (host only) ──── Matter.js engine.update()
60fps ─── Render (everyone) ────── Canvas draw + smoother.update()
20Hz ──── Network sync (50ms) ──── Host broadcasts state, reads input
                                    Non-host sends input, polls state
5Hz ───── Power-ups sync (200ms) ─ playerPowerUps field in snapshot
5Hz ───── Player stats sync ────── Non-host polls PK reliable state
~2Hz ──── Ping measurement ─────── Host broadcasts Date.now() via RPC
```

**Key gap**: Physics runs at 60fps but network only syncs at 20Hz. Between those 50ms network ticks, non-host entities would snap/jump without smoothing.

---

## Non-Host Display Smoothing

**Technique**: Velocity extrapolation + smooth correction (`DisplaySmoother` class)

Every snapshot includes `vx, vy` (velocity) for each entity. Between the 50ms snapshots, the non-host:

1. **Extrapolates**: Advances each entity's display position along its velocity vector every render frame (60fps): `target = snapshotPos + velocity * timeSinceSnapshot`
2. **Blends**: Lerps the actual display position toward the extrapolated target: `displayPos = lerp(displayPos, target, blendFactor)`
3. **Corrects**: When a new snapshot arrives, the target resets. If the entity drifted, the blend smoothly corrects it over 2-4 frames. If it drifted too far (hard snap threshold), it teleports.

| Entity | Blend Factor | Hard Snap | Why |
|--------|-------------|-----------|-----|
| Ships | 0.25 | 100px | Smoothness > responsiveness for remote ships |
| Projectiles | 0.4 | 150px | Fast linear motion, extrapolation very accurate |
| Asteroids | 0.15 | 80px | Slow drift, very predictable |
| Pilots | 0.2 | 80px | Slow float after ejection |
| Homing missiles | 0.35 | 120px | Curved paths, velocity changes often |
| Mines/power-ups/lasers | N/A | N/A | Stationary — snap directly |

**Extrapolation cap**: 200ms max to prevent overshoot on late snapshots.

**Empty snapshot guard**: If a snapshot arrives with zero entities (network glitch), existing display entities are preserved rather than wiped.

---

## Sound Architecture

**Host plays own sounds immediately** (zero latency for host player):
```
Host fires → plays fire sound locally → broadcasts RPC "gameSound" to others
```

**Non-host hears sounds via RPC** (reliable, but delayed by network RTT):
```
Host detects event → RPC.call("gameSound", {type, playerId}) → Non-host plays sound
```

**Throttling**: Host throttles sound RPCs to avoid flooding — fire sounds at max 1 per 120ms, dash at max 1 per 200ms per player.

---

## Input-to-Screen Latency (Non-Host)

The round trip for a non-host input to show on their screen:

```
1. Player presses button          ─── 0ms
2. Wait for next 50ms send tick   ─── 0-50ms  (input send throttle)
3. Network transit to host        ─── RTT/2
4. Host polls input (next 50ms)   ─── 0-50ms  (host poll interval)
5. Host applies to physics        ─── next frame (~16ms)
6. Host broadcasts new state      ─── 0-50ms  (broadcast throttle)
7. Network transit back            ─── RTT/2
8. Non-host polls state (50ms)    ─── 0-50ms  (client poll interval)
9. DisplaySmoother blends toward  ─── 2-4 frames (~33-66ms)
```

**Total**: ~100-250ms + RTT. On a good local network (RTT ~20ms), about 120-270ms. On cross-region (RTT ~100ms), about 200-350ms.

The display smoothing masks the choppiness of 20Hz updates but does NOT reduce actual latency. What you see is always slightly behind where the host says you are.

---

## What's "Guessed" (Extrapolated) vs Authoritative

| Data | Source of Truth | Non-Host Behavior |
|------|----------------|-------------------|
| Ship positions | Host physics | **Extrapolated** between snapshots using velocity |
| Projectile positions | Host physics | **Extrapolated** (very accurate — linear motion) |
| Asteroid positions | Host physics | **Extrapolated** (very accurate — slow drift) |
| Collisions | Host only | Non-host sees result after the fact |
| Ship alive/dead | Host only | Non-host snaps to authoritative state |
| Kills / round wins | Host reliable state | Non-host reads via `getState(..., true)` |
| Power-ups | Host | Snapped directly (stationary, no extrapolation) |
| Game phase | Host RPC | Authoritative, reliable delivery |
| Sounds | Host RPC | Authoritative, but throttled |

**Nothing is predicted.** Non-host never runs physics or guesses outcomes. It only extrapolates *display positions* between known snapshots to make the 20Hz updates look smooth at 60fps. When the next authoritative snapshot arrives, it smoothly corrects any drift.
