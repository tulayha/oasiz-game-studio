# Multiplayer Card Game Template — Oasiz SDK, HTML Shell & Lobby Flow

---

## Oasiz SDK Integration Points

| Hook | Where | Notes |
|---|---|---|
| `oasiz.emitScoreConfig()` | `CardGameEngine` constructor | Placeholder anchors: raw 1/5/10/20 → normalized 100/300/600/950 |
| `oasiz.gameplayStart()` | `CardGameScene.create()` / `PixiCardGame.init()` after first render | |
| `oasiz.gameplayStop()` | On back-to-lobby, browser hide | |
| `oasiz.submitScore(0)` | Placeholder at `gamePhase = "gameover"` | Real score added when rules are implemented |
| `oasiz.triggerHaptic("light")` | Lobby button, settings toggle | |
| `oasiz.triggerHaptic("medium")` | Draw card, throw card | Action confirmation |
| `oasiz.triggerHaptic("error")` | Tapping deck/card when not your turn | |
| `oasiz.onPause(cb)` | `cards-main.ts` | Dispatches `"cardsGame:pause"` CustomEvent |
| `oasiz.onResume(cb)` | `cards-main.ts` | Dispatches `"cardsGame:resume"` CustomEvent |
| `oasiz.shareRoomCode(code)` | After `insertCoin` resolves | |
| `oasiz.shareRoomCode(null)` | On `leaveRoom()` | |
| `oasiz.playerName` | Lobby init: pre-fill name | |
| `oasiz.playerAvatar` | Player state init | |
| `oasiz.roomCode` | `cards-main.ts`: auto-join if present | |
| Settings key: `"cards_settings"` | `cards-main.ts` | Music / FX / Haptics, loaded at startup |

**Settings button placement** (per `Agents.md`):
- Desktop: `top: 50px; right: 16px`
- Mobile (pointer:coarse): `top: 128px; right: 16px`

---

## HTML Shell and Settings

### `cards-index.html` Screen States

```
#start-screen      — Create Room / Join Room buttons (main entry)
#loading-screen    — Connecting spinner
#lobby-screen      — Player list, ready-up, room code, start button
#game-container    — Canvas + HUD overlays (settings btn only)
#gameover-overlay  — Placeholder end state
```

### Start Screen Layout

```
┌──────────────────────────────────────┐
│                                      │
│         Card Game  (title)           │
│      Multiplayer Card Game           │
│                                      │
│   ┌──────────────────────────────┐   │
│   │  [ Create Room ]             │   │
│   │  [ Join Room   ]             │   │
│   └──────────────────────────────┘   │
│                                      │
└──────────────────────────────────────┘
Background: rich dark radial gradient
```

### Lobby Screen Layout

```
┌──────────────────────────────────────┐
│  Room: ABCD  [copy icon]             │
│                                      │
│  Players (2/4)                       │
│  ┌────────────────────────────────┐  │
│  │ [avatar] Player 1 (HOST)       │  │
│  │ [avatar] Player 2  [ready]     │  │
│  └────────────────────────────────┘  │
│                                      │
│  Name: [__________________]          │
│                                      │
│  [ Ready Up ]   (all players)        │
│  [ Start Game ] (host only, ≥2 rdy)  │
└──────────────────────────────────────┘
```

### HUD During Gameplay

Only the settings button and back button are HTML overlays during play. All other game UI (player names, card counts, turn indicators) is rendered on canvas by the active renderer.

### Settings Modal

```
Settings
  Music    [toggle]
  Sound FX [toggle]
  Haptics  [toggle]
```

Saves to `localStorage` key `"cards_settings"`.

---

## Lobby and Room Flow

### Full State Machine

```
[start-screen]
    ├─ "Create Room"  → generate 4-char code → insertCoin → [lobby-screen]
    ├─ "Join Room"    → show code input
    │      └─ submit  → insertCoin(code) → [lobby-screen]
    └─ oasiz.roomCode set → auto insertCoin → [lobby-screen]

[lobby-screen]
    ├─ "Ready Up" pressed    → myPlayer.setState("isReady", true)
    ├─ host: all ready, "Start Game" → setState("gamePhase","playing") → [game-container]
    └─ "Back"                → leaveRoom() → oasiz.shareRoomCode(null) → [start-screen]

[game-container]
    ├─ gamePhase poll → "gameover" → [gameover-overlay]
    └─ "Back"          → leaveRoom() → oasiz.shareRoomCode(null) → [start-screen]

[gameover-overlay]
    ├─ "Play Again" (host) → re-init deck, setState("gamePhase","playing") → [game-container]
    └─ "Back"              → leaveRoom() → [start-screen]
```

### Ready-Up Mechanic

Each client taps "Ready Up" → `myPlayer().setState("isReady", true, true)`. Host polls all player states at 100ms; when **all** players have `isReady === true`, enables "Start Game". Host taps "Start Game" → `setState("gamePhase", "playing", true)`. All clients' polling loop detects the phase change and transition to game-container screen.
