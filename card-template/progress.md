# Card Template — Multiplayer Implementation Progress

Tracks what is done for the **multiplayer card game template** (fan of cards, draw/play, PlayroomKit). If context is lost or the session crashes, continue from the next unchecked item.

**Plans:** `plans/cards-*.md` and `plans/architecture.md` (file index).

---

## File index (from plans)

| File | Description | Status |
|------|-------------|--------|
| `index.html` | Start / loading / lobby / game / gameover screens, settings modal | Done |
| `src/cards-main.ts` | Entry: screen nav, PlayroomKit connect, lobby, renderer launch, settings; DummyBridge class still present but unused — Create Room always calls `connect(null)` | Done |
| `src/cards-core/types.ts` | CardFace, LocalCard, FanSlot, TableZone, PlayerState, TableConfig, IGameRules | Done |
| `src/cards-core/config.ts` | STANDARD_52_DECK, DEFAULT_TABLE_CONFIG, visual config | Done |
| `src/cards-core/fanMath.ts` | computeFanSpread, computeFanSlots, applyArcRotation | Done |
| `src/cards-core/CardGameEngine.ts` | localHand, drawCard(), playCard(), reset() | Done |
| `src/cards-core/PlayroomBridge.ts` | connect, init, requestDraw, requestThrow, leaveRoom, polling | Done |
| `src/pixi-cards/PixiCardGame.ts` | PIXI app, layers, table, local fan, opponent fans, turn HUD, bridge wiring; `_drawLocked` guard (draw debounce); passes pointer coords to `handlePointerDown` | Done |
| `src/pixi-cards/PixiTable.ts` | Felt, deck, discard, zones, deck tap → requestDraw | Done |
| `src/pixi-cards/PixiLocalFan.ts` | Carousel fan: MAX_VISIBLE=6 window, viewOffset, swipe-to-scroll, arrow pills (◀N / N▶), tween tick cancellation fix, addCard onComplete callback | Done |
| `src/pixi-cards/PixiOpponentFan.ts` | setHandCount, setPlayerName, showSlot, reposition | Done |
| `src/pixi-cards/PixiCard.ts` | Single card, pivot bottom-center, flip, setInteractable | Done |
| `src/pixi-cards/PixiFlyCard.ts` | Transient card for draw/throw animations | Done |
| `src/pixi-cards/PixiTurnHUD.ts` | Name labels, card count badges, turn glow | Done |
| `src/phaser-cards/PhaserCardGame.ts` | Phaser.Game factory, registry, destroy | Done |
| `src/phaser-cards/scenes/CardBootScene.ts` | card-back, card-felt textures → start CardGameScene | Done |
| `src/phaser-cards/scenes/CardGameScene.ts` | Table, local fan, draw/throw animations, bridge wiring | Done |

---

## Checklist

- [x] **Start screen** — Create Room, Join Room (code input). Auto-join if `oasiz.roomCode` set.
- [x] **Loading screen** — Shown while `bridge.connect(roomCode)`.
- [x] **Lobby** — Room code, copy, player list, name input, Ready Up, Start Game (host, all ready), Leave.
- [x] **Game container** — Canvas mount, back btn, settings btn, settings modal (Music / FX / Haptics).
- [x] **cards-main** — Settings from `localStorage` (`cards_settings`), lifecycle (cardsGame:pause/resume).
- [x] **PlayroomBridge** — insertCoin, getRoomCode, polling (currentTurn, discardTopCard, deckCount, gamePhase, handCount), requestDraw, requestThrow, leaveRoom, initializeDeck, advanceTurnFrom.
- [x] **PixiCardGame** — Layout (slot A/B/C, table center, local fan), table + local fan + opponent fans + turn HUD, bridge callbacks, resize.
- [x] **PhaserCardGame** — BootScene (textures), CardGameScene (table, local fan, draw/throw), bridge wiring.
- [x] **Pixi-only dummy mode** — `PIXI_DUMMY_MODE` + `DummyBridge` class still in cards-main but **not actively used**. Create Room always routes through `connect(null)` (PlayroomBridge). The `isDummy` branch in PixiCardGame is unreachable in normal flow.
- [x] **Carousel fan** — `PixiLocalFan` shows MAX_VISIBLE=6 cards; off-screen cards fade to alpha=0 and become `eventMode="none"`; swipe left/right scrolls viewOffset; arrow pills show hidden count; auto-scrolls right on draw.
- [x] **Draw debounce / crash fix** — `_drawLocked` flag in PixiCardGame prevents queuing multiple draw animations. Deck disabled on draw, re-enabled in `addCard` onComplete. Root crash cause (ticker accumulation from multiple concurrent `tweenToLayout` ticks) fixed by cancelling previous layout tick before starting a new one.

---

## Where to continue

1. **Multiplayer is the default.** `bun run dev` → Create Room → PlayroomKit lobby → Start Game. No dummy mode in the active path.
2. **Next: game rules.** `CardGameEngine` only manages local hand state (draw/play). A real game needs win conditions, turn validation (can the played card be played?), and UNO-specific actions (skip, reverse, +2, wild). Add an `IGameRules` interface and implement it.
3. **Turn advance for non-host.** Currently only the host calls `advanceTurnFrom()`. For correctness, non-host throw should signal the host to advance the turn (e.g. via a player state flag `wantsAdvance`).
4. **Gameover.** `gamePhase = "gameover"` is detected and shows the overlay, but winner info isn't displayed. Add `winnerPlayerId` to room state and read it in the gameover overlay.
5. **Uncomment commented-out handlers** in `cards-main.ts`: Play Again, Back from Gameover, auto-join from `oasiz.roomCode`, back button, settings modal toggle.

---

## Recent changes

- **Dummy mode removed from active flow:** `PIXI_DUMMY_MODE` flag and `DummyBridge` class remain in `cards-main.ts` but are no longer used. `btnCreateRoom` always calls `connect(null)` → PlayroomKit lobby. The `isDummy` branch in `PixiCardGame` is still present for reference but unreachable in normal use.
- **Carousel fan (PixiLocalFan):** Refactored to a MAX_VISIBLE=6 sliding window. Off-screen cards tween to ±75% viewport and fade to alpha=0, becoming `eventMode="none"`. Arrow pill buttons (◀N / N▶) are PIXI children — updated on every scroll/draw/throw, tappable. Horizontal swipe anywhere on stage triggers scroll gesture; vertical drag on a card still throws. `handlePointerDown(x, y)` added to fan (replaces bare `putLiftedDown` call from stage).
- **Draw debounce + crash fix:** Spam-clicking the deck caused the Pixi ticker to accumulate dozens of concurrent `tweenToLayout` ticks (one added per draw, never removed), each fighting to set card positions → renderer hangs. Fix: `_layoutTick` ref in `PixiLocalFan` cancels the previous layout tween before starting a new one. Additionally, `_drawLocked` flag in `PixiCardGame` disables the deck during the fly animation and only re-enables it in the `addCard` onComplete callback.

## Earlier changes (UNO style, portrait, game start fix)

- **Game start for non-host:** Lobby `onGamePhaseChange` now runs `showScreen("game")` and `launchGame()` when `phase === "playing"` and the client is still on the lobby screen. Host still starts via Start Game button; other players transition when they receive the phase update from the poll.
- **UNO-like styling:** `index.html` restyled for UNO: bright green gradients (#2e7d32, #1b5e20, #0d3d0f), red/blue/yellow buttons (Create Room = red, Join = blue, Ready = green, Start = yellow), rounder corners (14–24px), bolder font (Segoe UI, font-weight 600–700), and game over/settings in the same palette.
- **Portrait focus:** `@media (min-aspect-ratio: 1/1)` constrains body to `max-width: 420px` and centers on landscape so the game feels portrait-first. Game container background set to `#1b5e20`.
- **Fan in front (portrait layout):** In `PixiCardGame.calcLayout()`, when `H > W` (portrait): opponents moved higher (slot A ~12%, B/C ~28%), table at ~34%, local fan at 82% with `fanRadius = CARD_H * 4.2` so the hand is larger and clearly in front of the player. Landscape keeps the previous layout.
- **Config:** `DEFAULT_TABLE_CONFIG` now uses `UNO_VISUAL_CONFIG` (bright green table, indigo card back, 12px border radius) and `UNO_108_DECK`. `PixiTable` felt uses `config.visualConfig.backgroundColor` with higher opacity and rounder rect (20px).

---

## Removed (per user)

- Old single-player Memory Match: `src/main.ts`, `src/types.ts`, `src/config.ts`, `src/core/GameEngine.ts`, `src/pixi/` (PixiGame, PixiCard, PixiBoard, PixiHUD), `src/phaser/` (PhaserGame, BootScene, GameScene, Card). Entry is now **cards-main.ts** and **index.html** loads `/src/cards-main.ts`.
