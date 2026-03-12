# Multiplayer Card Game Template — File Structure

---

## File Structure

```
card-template/
├── plans/
│   ├── architecture.md           (memory match template — single-player)
│   ├── cards-overview.md         (template intent, scope, template contract)
│   ├── cards-layout.md           (portrait layout, slot positions, TableZone system)
│   ├── cards-state.md            (PlayroomKit state design + PlayroomBridge module)
│   ├── cards-fan-algorithm.md    (fan arc math: computeFanSlots, applyArcRotation)
│   ├── cards-animations.md       (animation timing for draw, throw, fan re-layout)
│   ├── cards-file-structure.md   (this file)
│   ├── cards-pixi-renderer.md    (PixiJS v8 renderer plan)
│   ├── cards-phaser-renderer.md  (Phaser 3 renderer plan)
│   ├── cards-integrations.md     (Oasiz SDK, HTML shell, lobby flow)
│   └── cards-test-checklist.md   (QA test checklist)
│
├── src/
│   │
│   ├── cards-core/               ← SHARED domain layer — zero renderer dependencies
│   │   ├── types.ts              ← CardFace, LocalCard, FanSlot, TableZone, PlayerSlot,
│   │   │                            CardGameConfig, GamePhase, IGameRules
│   │   ├── config.ts             ← STANDARD_52_DECK (default), UNO_108_DECK (alternative)
│   │   │                            DEFAULT_TABLE_ZONES, DEFAULT_TABLE_CONFIG
│   │   │                            ← THIS is the swap file for new card games
│   │   ├── CardGameEngine.ts     ← Local state machine: localHand, drawCard(), playCard(),
│   │   │                            fanLayout, onTurnEnd hook — game rules plug in here
│   │   ├── PlayroomBridge.ts     ← All PlayroomKit wiring; neither renderer imports playroomkit
│   │   └── fanMath.ts            ← computeFanSlots(), computeFanSpread(), applyArcRotation()
│   │                                — pure functions, no side-effects
│   │
│   ├── pixi-cards/               ← PixiJS v8 renderer variant
│   │   ├── PixiCardGame.ts       ← PIXI.Application bootstrap, IRenderer, top coordinator
│   │   ├── PixiTable.ts          ← Renders all TableZone slots from config (deck, discard, etc.)
│   │   ├── PixiLocalFan.ts       ← Interactive face-up fan; Ticker-based tween logic
│   │   ├── PixiOpponentFan.ts    ← Face-down fan for one opponent slot (A, B, or C)
│   │   ├── PixiCard.ts           ← Single card Container: front+back graphics, pivot at bottom
│   │   ├── PixiFlyCard.ts        ← Transient animating card (draw and play animations)
│   │   └── PixiTurnHUD.ts        ← Name labels, card-count badges, turn glow rings
│   │
│   └── phaser-cards/             ← Phaser 3 renderer variant
│       ├── PhaserCardGame.ts     ← Phaser.Game factory; returns IRenderer
│       ├── scenes/
│       │   ├── CardBootScene.ts  ← Generates card-back texture via RenderTexture; starts GameScene
│       │   └── CardGameScene.ts  ← Main scene: layout, input, PlayroomBridge wiring, resize
│       └── objects/
│           ├── PhaserLocalFan.ts     ← Phaser Container: interactive local fan + tween re-layout
│           ├── PhaserOpponentFan.ts  ← Phaser Container: face-down fan (slots A / B / C)
│           ├── PhaserCard.ts         ← Phaser Container: back/front Images, flip tween
│           └── PhaserTable.ts        ← Reads config.zones, renders each TableZone dynamically
│
├── cards-index.html              ← HTML shell: start/lobby/game/gameover screens, settings modal
└── cards-main.ts                 ← Entry point: screen nav, PlayroomKit connect, renderer launch,
                                     settings persistence, Oasiz SDK lifecycle wiring
```

## Adding a new card game — file touches required

| What you want | Files to touch |
|---|---|
| New card deck (e.g. Tarot) | `cards-core/config.ts` only — add a new deck export |
| New table layout (e.g. Poker community zone) | `cards-core/config.ts` — add zones to `TABLE_ZONES` |
| New game rules (e.g. UNO matching) | Create `cards-core/rules/UnoRules.ts` implementing `IGameRules`; pass to `CardGameEngine` |
| New visual theme | `cards-core/config.ts` — change `cardBack.color`, `backgroundColor`, card face colors |
| Add a dealer/fixed seat | Add a 4th opponent slot in `cards-core/types.ts` and update fan positions |
