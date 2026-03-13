# Phaser Renderer Plan — Card Template

Implementation plan for the multiplayer card game using **Phaser 3** as the renderer while **reusing the full cards-core layer** (types, config, fanMath, CardGameEngine, PlayroomBridge). The same HTML shell, lobby flow, and Oasiz SDK integration apply; only the canvas layer is swapped from PixiJS to Phaser.

## Plan index

| Document | Purpose |
|----------|---------|
| [architecture.md](./architecture.md) | What is reused vs. new; data flow; constructor contract |
| [implementation.md](./implementation.md) | Phased implementation steps (scenes, table, card, fans, HUD, wiring) |

## Reuse summary

| Layer | Reuse | Notes |
|-------|--------|-------|
| `cards-core/types.ts` | 100% | CardFace, FanSlot, TableZone, TableConfig, etc. |
| `cards-core/config.ts` | 100% | DEFAULT_TABLE_CONFIG, UNO_VISUAL_CONFIG, deck definitions |
| `cards-core/fanMath.ts` | 100% | computeFanSlots(), layoutCards() — same coordinates |
| `cards-core/CardGameEngine.ts` | 100% | drawCard(), playCard(), getHand() — no renderer deps |
| `cards-core/PlayroomBridge.ts` | 100% | connect(), init(), requestDraw/Throw, getPlayers() |
| `cards-main.ts` | Minimal | Same entry; swap dynamic import to PhaserCardGame |
| `index.html` | 100% | Same screens, settings modal, lobby UI |
| **phaser-cards/** | New | Phaser scenes and game objects mirror pixi-cards API |

The Phaser renderer must accept the **same constructor signature** as `PixiCardGame(mount, config, bridge, engine, settings, onGamePhaseChange)` so `launchGame()` in cards-main does not need branching logic.

## Phaser local fan (carousel)

The Phaser local fan is **swipeable** (no arrow buttons):

- **Swipe to scroll** — Horizontal drag (on a card or empty area) scrolls the carousel like a wheel.
- **Drag up to throw** — Drag upward on a card to play it (when it’s your turn). On pointer down we wait for first move: horizontal → scroll, vertical up → throw.
