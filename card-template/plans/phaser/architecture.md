# Phaser Renderer — Architecture

How the Phaser renderer fits into the card template and what it reuses from cards-core.

---

## Design principle: renderer swap

The game is **renderer-agnostic**. `cards-main.ts` creates one of:

- `PixiCardGame(mount, config, bridge, engine, settings, onGamePhaseChange)`
- `PhaserCardGame(mount, config, bridge, engine, settings, onGamePhaseChange)` (to be implemented)

Same arguments, same responsibilities. No changes to `CardGameEngine`, `PlayroomBridge`, or config.

---

## What Phaser reuses (cards-core)

| Module | Role | Phaser usage |
|--------|------|--------------|
| **types.ts** | CardFace, FanSlot, TableZone, TableConfig, CardVisualConfig | Import for all Phaser objects; layout uses same FanSlot shape |
| **config.ts** | DEFAULT_TABLE_CONFIG, UNO_VISUAL_CONFIG, deck | Passed in as `config`; table and cards read zones + visualConfig |
| **fanMath.ts** | computeFanSlots(), layoutCards() | Local and opponent fans call these for (x, y, rotation) per card |
| **CardGameEngine** | drawCard(), playCard(index), getHand() | Bridge calls engine; Phaser only animates what bridge reports |
| **PlayroomBridge** | connect(), init(callbacks), requestDraw(), requestThrow(), getPlayers(), getMyId(), isMyTurn() | Phaser subscribes to same callbacks; deck/card taps call requestDraw/requestThrow |

No new types or core logic. Phaser only implements the **visual and input layer**.

---

## Data flow (unchanged)

```
cards-main.ts
  → bridge.connect() / bridge.init(callbacks, engine)
  → launchGame() → new PhaserCardGame(mount, config, bridge, engine, settings, onGamePhaseChange)

User taps deck
  → PhaserTable (or scene) → bridge.requestDraw()
  → engine.drawCard() (in bridge)
  → callback / return → PhaserLocalFan.addCard(face, deckX, deckY, onComplete)

User drags card up (throw)
  → PhaserLocalFan.endDrag() → bridge.requestThrow(index)
  → engine.playCard(index) (in bridge)
  → PhaserLocalFan.throwCard(index, discardX, discardY)

Polling (PlayroomBridge)
  → onTurnChange → setActiveTurn(), setInteractable(), setDeckInteractable()
  → onDiscardTopChange → table.updateDiscardPile(card)
  → onDeckCountChange → table.updateDeckCount(count)
  → onOpponentHandCountChange → opponentFans[slot].setHandCount(count)
  → onPlayersUpdate → updateOpponentSlots()
```

Same as Pixi; only the class names (PhaserTable, PhaserLocalFan, etc.) change.

---

## Phaser entry contract

To be a drop-in replacement for PixiCardGame, the Phaser renderer must:

1. **Constructor:**  
   `constructor(mount: HTMLElement, config: TableConfig, bridge: PlayroomBridge, engine: CardGameEngine, settings: Settings, onGamePhaseChange?: (phase: string) => void)`

2. **Lifecycle:**  
   - On construction, create the Phaser.Game instance (or async init), inject config/bridge/engine into the game (e.g. registry or scene data).
   - Append the game canvas to `mount`.
   - Subscribe to bridge callbacks and wire table/fans/HUD the same way PixiCardGame does.

3. **Cleanup:**  
   Expose `destroy()` that removes canvas, stops scenes, and unsubscribes from bridge and window events.

4. **Resize:**  
   On `window.resize` (or Phaser scale manager), resize the game and reposition table, fans, and HUD using the same layout math (calcLayout from config + fanMath).

---

## Scene structure (Phaser-specific)

```
Phaser.Game
  ├── BootScene (optional)
  │     → Generate card-back / felt textures via Graphics + RenderTexture
  │     → this.scene.start("CardGameScene")
  └── CardGameScene
        ├── Background (image or gradient; same assets folder fallback as Pixi)
        ├── PhaserTable          ← zones from config.zones
        ├── PhaserOpponentFan × 3
        ├── PhaserLocalFan
        ├── PhaserTurnHUD        ← names, avatars, turn glow
        └── (fly layer for animating cards)
```

Config, bridge, and engine are passed via `scene.registry` or a shared context object so the scene and game objects never import cards-main.

---

## Layout and coordinates

Use the **same layout numbers** as Pixi (see `plans/cards-layout.md` and `PixiCardGame.calcLayout()`):

- Portrait: slotA_x/y, slotB/C, tableCenterY, deckCenterX, playCenterX, localFanX/Y, fanRadius.
- Landscape: same keys, different percentages.

Phaser scene or PhaserCardGame holds `calcLayout(W, H)` (or equivalent) and passes results to table and fans. `fanMath.computeFanSlots()` and `layoutCards()` return the same FanSlot[]; Phaser game objects set `x`, `y`, `rotation` from those slots.

---

## Oasiz SDK

Same hooks as Pixi (see `plans/cards-integrations.md`):

- `oasiz.gameplayStart()` when game scene is ready.
- `oasiz.gameplayStop()` on back or game over.
- `oasiz.triggerHaptic("medium")` on draw/throw; `"light"` on UI; `"error"` when action not allowed.
- `oasiz.submitScore()`, `oasiz.emitScoreConfig()`, `oasiz.onPause/onResume` — all in cards-main or bridge, no Phaser-specific code.
