# Card Game Template — Architecture

> **Current state:** This repo is the **multiplayer card game template** (UNO-style, up to 4 players, PlayroomKit). For implementation status, file index, and "where to continue" notes, see **`progress.md`** in the repo root. The sections below describe design principles and the active data flow.

## Overview

A fully modular, renderer-agnostic **multiplayer card game** template with **PixiJS v8** renderer. The default run mode is **full multiplayer via PlayroomKit** — Create Room goes directly into `bridge.connect(null)`, lobby, then game. No dummy mode is active in the current flow. The architecture is designed so that swapping in new rules, art, or a renderer is a minimal-surface change.

---

## Design Principles

| Principle | How it's applied |
|-----------|-----------------|
| **Separation of concerns** | `GameEngine` owns all rules; renderers are pure display layers |
| **Swappable config** | `config.ts` is the single file to edit for new art, grid size, or rule tweaks |
| **Shared HTML shell** | HUD, settings modal, and win overlay are plain HTML — both renderers reuse them |
| **No renderer lock-in** | A third renderer (Three.js, Canvas2D, …) needs only to implement the same `IRenderer` contract |

---

## File Index (one-line descriptions)

| File | Description |
|------|-------------|
| `index.html` | HTML shell: start / loading / lobby / game / gameover screens, settings modal |
| `src/cards-main.ts` | Entry: screen nav, `bridge.connect()` → lobby → `launchGame()`, settings persistence, lifecycle |
| `src/cards-core/types.ts` | All shared TS interfaces: CardFace, LocalCard, FanSlot, TableZone, PlayerState, TableConfig |
| `src/cards-core/config.ts` | `DEFAULT_TABLE_CONFIG` (UNO 108-card deck + UNO visual), STANDARD_52_DECK, visual configs |
| `src/cards-core/fanMath.ts` | `computeFanSlots` (straight-line), `layoutCards` (fan spread + rotation per role) |
| `src/cards-core/CardGameEngine.ts` | Local hand state: `drawCard()`, `playCard(index)`, `reset()`, `getHand()` |
| `src/cards-core/PlayroomBridge.ts` | PlayroomKit wiring: `connect`, `init` (100ms poll), `requestDraw/Throw`, state mutations |
| `src/pixi-cards/PixiCardGame.ts` | Pixi Application bootstrap, layer stack, bridge callback wiring, draw-lock guard |
| `src/pixi-cards/PixiTable.ts` | Felt surface, deck stack, discard pile, zone tap interaction |
| `src/pixi-cards/PixiLocalFan.ts` | Carousel fan: MAX_VISIBLE=6 window, viewOffset, swipe-scroll, arrow pills, tween cancellation |
| `src/pixi-cards/PixiOpponentFan.ts` | Face-down opponent fan: hand count badge, player name/avatar, showSlot |
| `src/pixi-cards/PixiTurnHUD.ts` | Turn-indicator name labels and avatar rings per slot |
| `src/pixi-cards/PixiCard.ts` | Single card Container: programmatic drawing, two-phase flip, lifted hover state |
| `src/pixi-cards/PixiFlyCard.ts` | Transient face-down card for draw/throw flight animations |
| `plans/progress.md` (root) | Implementation status, checklist, "where to continue", recent changes |
| `plans/architecture.md` | Overall architecture, file index, data flow (this file) |
| `plans/cards-*.md` | Design docs: layout, state, fan math, animations, integrations, test checklist |

---

## Directory Layout

```
card-template/
├── plans/                              # Design docs
│   ├── architecture.md                 # Overall architecture (this file)
│   ├── cards-overview.md               # Multiplayer template intent and scope
│   ├── cards-layout.md                 # Portrait layout and TableZone system
│   ├── cards-state.md                  # PlayroomKit state + PlayroomBridge
│   ├── cards-fan-algorithm.md          # Fan arc math
│   ├── cards-animations.md             # Animation timing plan
│   ├── cards-file-structure.md         # File structure guide for new games
│   ├── cards-pixi-renderer.md          # PixiJS v8 renderer plan
│   ├── phaser/                         # Phaser 3 renderer plan (see phaser/README.md)
│   │   ├── README.md                   # Index + reuse summary
│   │   ├── architecture.md             # Data flow, constructor contract
│   │   └── implementation.md           # Phased implementation steps
│   ├── cards-phaser-renderer.md        # Legacy Phaser notes (superseded by phaser/)
│   ├── cards-integrations.md           # Oasiz SDK + HTML shell + lobby flow
│   └── cards-test-checklist.md         # QA test checklist
│
├── src/
│   ├── cards-main.ts                   # Entry: screen nav, connect, lobby, launchGame
│   │
│   ├── cards-core/
│   │   ├── types.ts                    # All shared TS interfaces & enums
│   │   ├── config.ts                   # DEFAULT_TABLE_CONFIG — swap here to change game
│   │   ├── fanMath.ts                  # computeFanSlots + layoutCards
│   │   ├── CardGameEngine.ts           # Local hand state machine (pure logic)
│   │   └── PlayroomBridge.ts           # All PlayroomKit wiring (connect, poll, mutate)
│   │
│   └── pixi-cards/
│       ├── PixiCardGame.ts             # Pixi app bootstrap + coordinator
│       ├── PixiTable.ts                # Felt, deck, discard, zones
│       ├── PixiLocalFan.ts             # Carousel local hand fan
│       ├── PixiOpponentFan.ts          # Face-down opponent fan
│       ├── PixiTurnHUD.ts              # Turn indicator labels
│       ├── PixiCard.ts                 # Single card with flip + hover
│       └── PixiFlyCard.ts              # Transient fly animation card
│
├── progress.md                         # Implementation status + where to continue
├── index.html                          # HTML shell: all screens + settings modal
├── package.json
├── tsconfig.json
└── vite.config.js
```

---

## Data Flow

### Entry / Lobby
```
Create Room button
       │
       ▼
bridge.connect(null)        ← PlayroomKit insertCoin (skipLobby: true)
       │
       ▼
Lobby Screen
  onPlayerJoin → players[]
  polling 100ms → onPlayersUpdate → refreshLobbyPlayers()
       │
  Host clicks "Start Game"
       │
       ▼
launchGame()
  bridge.init(gameCallbacks, engine)   ← replaces lobby callbacks
  bridge.initializeDeck()              ← host sets gamePhase="playing"
  new PixiCardGame(...)
       │
  Non-host: poll detects gamePhase="playing" → launchGame()
```

### In-Game
```
User taps deck
       │
       ▼
PixiTable.onDrawRequest
       │  _drawLocked guard
       ▼
bridge.requestDraw()
  engine.drawCard()         ← adds to localHand, returns CardFace
  setHandCount()            ← PlayroomKit player state
  decrementDeckCount()      ← PlayroomKit room state (host only)
       │
       ▼
localFan.addCard(face, deckX, deckY, onComplete)
  PixiFlyCard animation 320ms
  → card pushed to fan, tweenToLayout()
  → onComplete() → _drawLocked = false, deck re-enabled

User drags card upward past 70px threshold
       │
       ▼
localFan.onCardTap(index, face)
       │
       ▼
bridge.requestThrow(index)
  engine.playCard(index)    ← removes from localHand
  setHandCount()
  setDiscardTop(card)       ← PlayroomKit room state
  advanceTurnFrom(myId)     ← host-only: sets currentTurn = next player
       │
       ▼
localFan.throwCard(index, discardX, discardY)
  PixiFlyCard animation 300ms

PlayroomKit poll fires callbacks:
  onTurnChange     → setActiveTurn(), setInteractable(), setDeckInteractable()
  onDiscardTopChange → table.updateDiscardPile()
  onDeckCountChange  → table.updateDeckCount()
  onGamePhaseChange  → onGamePhaseChange?.("gameover")
  onPlayersUpdate    → updateOpponentSlots()
```

---

## Swapping Guide

### New card art / theme
1. Edit `src/config.ts` → change `cards[]` entries (symbol, color, suit)
2. Edit `cardBack` and `cardFront` color values for a new visual theme

### New grid size
1. Edit `config.gridCols` and `config.gridRows`
2. Ensure `cards` array has at least `(cols × rows) / 2` entries

### New mechanic (e.g., Snap, War, Solitaire)
1. Replace or extend `src/core/GameEngine.ts`
2. Keep the same `GameState` shape so renderers need no changes

### New renderer (e.g., Three.js)
1. Create `src/three/ThreeGame.ts` implementing the same constructor signature
2. Register it in `src/main.ts` alongside the existing options

---

## Oasiz SDK Integration Points

| Hook | Location | Purpose |
|------|----------|---------|
| `oasiz.emitScoreConfig()` | `CardGameEngine` constructor | Score normalisation anchors |
| `oasiz.gameplayStart()` | `cards-main.ts` → `launchGame()` | Tell platform game is live |
| `oasiz.submitScore()` + `gameplayStop()` | TODO: gameover handler | Submit final score |
| `oasiz.triggerHaptic()` | Bridge (draw/throw), fan (scroll), main (ready/copy) | Tactile feedback |
| `oasiz.shareRoomCode()` | `PlayroomBridge.connect()` + `leaveRoom()` | Platform room invite |
| `oasiz.onPause/onResume` | `cards-main.ts` | Fires `cardsGame:pause/resume` custom events |
| Settings `localStorage` | `cards-main.ts` | `cards_settings` key: music / fx / haptics |

## Swapping Guide

### New card game (UNO → Poker → Blackjack)
1. Edit `src/cards-core/config.ts` → change `DEFAULT_TABLE_CONFIG` (deck, zones, visuals)
2. Replace `CardGameEngine` rule logic (drawCard, playCard, win condition)
3. Update `PlayroomBridge.initializeDeck()` / `requestThrow()` if turn rules change

### New card art / theme
1. Edit `config.ts` → change `CardVisualConfig` colors and `borderRadius`
2. Card symbol/value/color live in the deck definition — no renderer changes needed

### New renderer (e.g. Phaser 3, Three.js)
1. Create `src/phaser-cards/PhaserCardGame.ts` implementing the same constructor signature as `PixiCardGame`
2. Replace the dynamic import in `cards-main.ts` (`launchGame` function)
3. `PlayroomBridge` and `CardGameEngine` are renderer-agnostic — no changes needed
