# Phaser Renderer — Implementation Steps

Step-by-step plan to implement the card game in Phaser 3 while reusing all of cards-core. Follow phases in order; each phase is testable before moving on.

---

## File structure (target)

```
card-template/
├── src/
│   ├── cards-main.ts              # One-line change: import PhaserCardGame instead of PixiCardGame (or feature-flag)
│   ├── cards-core/                # UNCHANGED — full reuse
│   │   ├── types.ts
│   │   ├── config.ts
│   │   ├── fanMath.ts
│   │   ├── CardGameEngine.ts
│   │   └── PlayroomBridge.ts
│   │
│   ├── pixi-cards/                # Existing (unchanged by this plan)
│   │   └── ...
│   │
│   └── phaser-cards/
│       ├── PhaserCardGame.ts      # Entry: creates Phaser.Game, passes config/bridge/engine to scene
│       ├── scenes/
│       │   ├── CardBootScene.ts   # Optional: generate card-back / felt textures
│       │   └── CardGameScene.ts  # Main: table, fans, HUD, input, bridge callbacks
│       ├── PhaserTable.ts         # Felt, deck, discard, zones from config.zones
│       ├── PhaserCard.ts          # Single card: back/front, flip, lift, pivot bottom-center
│       ├── PhaserFlyCard.ts       # Transient card for draw/throw animations
│       ├── PhaserLocalFan.ts      # Interactive fan: addCard, throwCard, drag-to-throw, layoutCards
│       ├── PhaserOpponentFan.ts   # Face-down fan: setHandCount, setPlayerName, setPlayerAvatar
│       ├── PhaserTurnHUD.ts       # Name labels, avatars, turn glow per slot
│       └── loadAvatarTexture.ts  # Optional: reuse pattern from pixi-cards for CORS-safe avatar load
```

---

## Phase 1 — Project setup

### Step 1.1 — Install Phaser

```bash
cd card-template
bun add phaser
```

- Use Phaser 3 (typings come with the package).
- No changes to Vite config required if you keep a single entry; Phaser runs in the same canvas mount as Pixi.

### Step 1.2 — Decide entry point strategy

- **Option A:** Feature flag or build target: `cards-main.ts` chooses `PixiCardGame` vs `PhaserCardGame` (e.g. `const USE_PHASER = import.meta.env.VITE_USE_PHASER === "true";` then dynamic import).
- **Option B:** Replace Pixi import with Phaser for development; switch back for comparison.

Keep `launchGame()` and `launchGameDummy()` unchanged in signature: both receive `(mount, config, bridge, engine, settings, onGamePhaseChange)`. Only the class instantiated changes.

---

## Phase 2 — PhaserCardGame and scene bootstrap

### Step 2.1 — PhaserCardGame.ts

- Create `src/phaser-cards/PhaserCardGame.ts`.
- Constructor: `(mount: HTMLElement, config: TableConfig, bridge: PlayroomBridge, engine: CardGameEngine, settings: Settings, onGamePhaseChange?: (phase: string) => void)` — same as PixiCardGame.
- In constructor or async `init()`:
  - Create `new Phaser.Game({ type: Phaser.AUTO, parent: mount, width: W, height: H, backgroundColor: config.visualConfig.backgroundColor, scene: [CardBootScene, CardGameScene], ... })`.
  - Store `config`, `bridge`, `engine`, `settings`, `onGamePhaseChange` in a way the scene can read (e.g. pass via `game.registry` before starting the game, or a static/singleton that the scene reads once).
- **Registry (recommended):** Before `this.scene.start("CardGameScene")`, set:
  - `game.registry.set("tableConfig", config)`
  - `game.registry.set("bridge", bridge)`
  - `game.registry.set("engine", engine)`
  - `game.registry.set("settings", settings)`
  - `game.registry.set("onGamePhaseChange", onGamePhaseChange)`
- Start BootScene first; BootScene generates textures then starts CardGameScene (or start CardGameScene directly if no boot textures yet).
- Append `game.canvas` to `mount` (Phaser usually does this via `parent`; ensure no duplicate).
- Expose `destroy()`: call `this.game.destroy(true)`, clear registry, remove canvas from mount.

### Step 2.2 — CardBootScene (optional for Phase 2)

- Key: `"CardBootScene"`.
- Create Graphics, draw rounded rect for card back (config visualConfig.backColor), render to RenderTexture, save as `"card-back"`.
- Draw felt (config visualConfig.backgroundColor), save as `"card-felt"`.
- Then `this.scene.start("CardGameScene")`.
- If skipped: CardGameScene can use Graphics for table/cards until textures are added later.

### Step 2.3 — CardGameScene skeleton

- Key: `"CardGameScene"`.
- In `create()`:
  - Read config, bridge, engine, settings from registry.
  - Set camera background color to `config.visualConfig.backgroundColor`.
  - Run layout calc (same math as PixiCardGame: portrait vs landscape, slot positions, tableCenterY, deckCenterX, playCenterX, localFanX/Y, fanRadius). Either copy `calcLayout` into the scene or into a shared helper used by both Pixi and Phaser.
  - Build zones array from config (same as `buildZones` in PixiCardGame).
  - Reserve/create containers for: background, table, opponent fans (3), local fan, fly layer, HUD.
- Do not wire bridge yet; just get the scene visible with a solid background.

**Checkpoint:** Run the game with Phaser entry point; CardGameScene opens with correct background color and no errors.

---

## Phase 3 — PhaserTable

### Step 3.1 — PhaserTable class

- Create `src/phaser-cards/PhaserTable.ts`.
- Constructor: `(scene: Phaser.Scene, zones: TableZone[], visualConfig: CardVisualConfig)`.
- Draw felt: use Graphics or an Image with a generated texture (rounded rect for table surface).
- For each zone in `zones`:
  - **Deck:** Draw card-back stack (or single card-back + count text). Store reference for tap.
  - **Discard:** Draw placeholder (dashed rect or card shape); later update with top card face.
- Methods:
  - `setDeckInteractable(active: boolean)`: setInteractive on deck sprite/zone or disable.
  - `updateDiscardPile(card: CardFace | null)`: redraw discard graphic with card color/symbol/value or empty state.
  - `updateDeckCount(n: number)`: update count text.
- Expose `deckCenterX`, `deckCenterY`, `playCenterX`, `playCenterY` (or discard center) for fly-card targets and layout.
- Deck pointerdown: call a callback (provided by CardGameScene) that invokes `bridge.requestDraw()` and haptic; guard with `_drawLocked` if reusing same pattern as Pixi.

### Step 3.2 — Integrate table into CardGameScene

- In `create()`, after layout and zones:
  - Instantiate `PhaserTable(scene, zones, config.visualConfig)`.
  - Add to display list.
  - Set table’s position from layout (table center).
  - Register table’s draw callback: call `bridge.requestDraw()`, then `localFan.addCard(...)` when bridge returns a card (same flow as Pixi).

**Checkpoint:** Table visible; deck and discard areas present; tapping deck triggers draw callback (can log or add a card manually for now).

---

## Phase 4 — PhaserCard and PhaserFlyCard

### Step 4.1 — PhaserCard

- Create `src/phaser-cards/PhaserCard.ts` extending `Phaser.GameObjects.Container` (or use Container and add to scene).
- Children: back (Image or Graphics with card-back texture), front (Graphics + Text for suit/value/symbol/color from CardFace).
- Set origin to bottom-center: `setOrigin(0.5, 1)` so rotation pivots at bottom.
- Methods:
  - `flip(faceUp: boolean, instant?: boolean)`: two-phase scaleX tween (same as PixiCard).
  - `setLifted(lifted: boolean)`: tween y and scale (e.g. y -= CARD_H*0.12, scale 1.08 when lifted).
  - `setInteractable(active: boolean)`: setInteractive / disableInteractive.
  - `getFace(): CardFace | null` for play callback.
- Card dimensions: use same CARD_W, CARD_H constants as Pixi (from config or shared constant).
- Draw front face from `CardFace`: color, symbol, value text.

### Step 4.2 — PhaserFlyCard

- Create `src/phaser-cards/PhaserFlyCard.ts`: temporary card used only during draw/throw.
- Constructor: `(scene, x, y, faceUp: boolean, cardData: CardFace | null, visualConfig)`.
- Display: single card-back or card face (Graphics + Text).
- Method: `flyTo(targetX, targetY, targetRotation, durationMs, onComplete)`: use `scene.tweens.add({ targets: this, x: targetX, y: targetY, angle: deg(targetRotation), duration: durationMs/1000, ease: "Power2.Out", onComplete })`.
- onComplete: destroy this object.

**Checkpoint:** Can create a PhaserCard and PhaserFlyCard in scene; fly card tweens to a target and destroys.

---

## Phase 5 — PhaserLocalFan

### Step 5.1 — PhaserLocalFan

- Create `src/phaser-cards/PhaserLocalFan.ts` (Container or similar).
- Constructor: `(scene, x, y, fanRadius, visualConfig, flyLayer)` — same role as PixiLocalFan.
- State: array of PhaserCard; interactable flag; drag state; gesture mode: `idle` | `scroll` | `throw`.
- Use **fanMath:** `computeFanSlots(cardCount, x, y, fanRadius)` then `layoutCards(slots, "local")` for (x, y, rotation) per card.
- **Carousel interactions (no arrow buttons):**
  - **Swipe to scroll** — On pointer down (card or empty), don’t commit immediately. On first significant move: if horizontal → scroll gesture (carousel follows finger via accumulated delta and `scrollBy(±1)` per threshold). If vertical up on a card → throw gesture (startDrag, then on up throw or snap).
- Methods:
  - `addCard(face: CardFace, fromX, fromY, onComplete?)`: create PhaserFlyCard, tween to slot, onComplete add PhaserCard, `tweenToLayout(cards.length)`.
  - `throwCard(index, toX, toY)`: fly card to discard, remove from array, `tweenToLayout`, update viewOffset.
  - `tweenToLayout(count)`: tween each card to slot.
  - `handlePointerDown`, `updateDrag`, `endDrag`: implement gesture decision (scroll vs throw).
  - `setInteractable(active: boolean)`.
- Callback: `onCardTap?: (index, face) => void` (throw).

### Step 5.2 — Wire local fan in CardGameScene

- Create PhaserLocalFan with layout localFanX, localFanY, fanRadius.
- Set `localFan.onCardTap = (index, face) => { const card = bridge.requestThrow(index); if (card) localFan.throwCard(index, discardX, discardY); }`.
- Table draw callback: get card from `bridge.requestDraw()`, then `localFan.addCard(face, table.deckCenterX, table.deckCenterY, () => { _drawLocked = false; ... })`.
- Stage (or scene) pointer events: pointermove → localFan.updateDrag; pointerup/pointerupoutside → localFan.endDrag; pointerdown → localFan.putLiftedDown (or equivalent).

**Checkpoint:** Draw card from deck → fly to fan → card appears in hand. Drag card up past threshold → throw to discard. Layout reflows correctly.

---

## Phase 6 — PhaserOpponentFan

### Step 6.1 — PhaserOpponentFan

- Create `src/phaser-cards/PhaserOpponentFan.ts` per slot (A, B, C).
- Constructor: `(scene, slot: "A"|"B"|"C", anchorX, anchorY, visualConfig)`.
- Holds array of face-down card images (card-back texture); no need for full PhaserCard.
- Use fanMath: `computeFanSlots(count, anchorX, anchorY, radius)` then apply slot-specific rotation (A: 180°, B: 90°, C: -90°) so arc faces table — same as layout doc.
- Methods:
  - `setHandCount(n)`: if n > current, add card-back image, tween to layout; if n < current, tween last card out, remove, tweenToLayout.
  - `setPlayerName(name: string)`, `setPlayerAvatar(url: string | null)` (reuse loadAvatarTexture pattern from pixi-cards for CORS).
  - `showSlot(visible: boolean)`.
  - `reposition(anchorX, anchorY)` for resize.

### Step 6.2 — Wire opponent fans in CardGameScene

- Create three PhaserOpponentFans at slot A/B/C positions from layout.
- On `bridge.onPlayersUpdate` (or equivalent), call `updateOpponentSlots()`: set visibility per slot (1 opponent → A only; 2 → B,C; 3 → A,B,C), set names and hand counts from `bridge.getPlayers()`.
- On `bridge.onOpponentHandCountChange(playerId, count)`, find slot index for playerId, call `opponentFans[slot].setHandCount(count)`.

**Checkpoint:** Opponent slots show correct visibility; hand count and names update when bridge state changes.

---

## Phase 7 — PhaserTurnHUD

### Step 7.1 — PhaserTurnHUD

- Create `src/phaser-cards/PhaserTurnHUD.ts`.
- Per slot (local, A, B, C): name Text, optional card-count Text, optional avatar (Image from loadAvatarTexture), turn glow (Graphics circle or rect).
- Methods:
  - `registerSlot(slot, x, y)` — store position for name/avatar.
  - `setPlayerName(slot, name)`, `setPlayerAvatar(slot, url)`.
  - `setActiveTurn(slot)`: tween previous active alpha down; new active scale pulse or glow; update glow position.
  - `setSlotVisible(slot, visible)`.

### Step 7.2 — Wire HUD in CardGameScene

- On `bridge` turn change (or polling callback): `turnHUD.setActiveTurn(playerIdToSlot(playerId))`, `localFan.setInteractable(isMyTurn)`, `table.setDeckInteractable(isMyTurn)`.
- Set names/avatars from `bridge.getPlayers()` on init and when players update.

**Checkpoint:** Turn indicator and names/avatars show correctly; switching turn updates highlight and interactivity.

---

## Phase 8 — Bridge wiring and resize

### Step 8.1 — Full bridge callback wiring

In CardGameScene `create()`, after all objects exist, call `bridge.init({ ... })` with:

- `onTurnChange` → setActiveTurn, setInteractable, setDeckInteractable.
- `onDiscardTopChange` → table.updateDiscardPile.
- `onDeckCountChange` → table.updateDeckCount.
- `onOpponentHandCountChange` → opponentFans[slot].setHandCount.
- `onGamePhaseChange` → onGamePhaseChange?.(phase).
- `onPlayersUpdate` → updateOpponentSlots (visibility, names, avatars).

Pass `engine` to bridge (already in registry). Ensure host calls `bridge.initializeDeck()` when game starts so deck count and phase are set.

### Step 8.2 — Resize

- Listen to Phaser scale manager resize (or window resize): recalc layout (same calcLayout), then:
  - `table.reposition(zones)` (or new zone positions).
  - `localFan.reposition(localFanX, localFanY, fanRadius)`.
  - Each `opponentFans[i].reposition(slotX, slotY)`.
  - `turnHUD.reposition(...)` if needed.
- Resize game: `this.scale.resize(W, H)` (Phaser 3 API).

### Step 8.3 — Lifecycle

- On scene shutdown or game destroy: remove resize listener, do not call bridge.init again (bridge is shared). PhaserCardGame.destroy() should destroy the game instance and clear registry.

**Checkpoint:** Full game flow: create room, start game, draw/throw cards, turn changes, opponent counts and discard pile update; resize works.

---

## Phase 9 — Background and assets

### Step 9.1 — Background

- Same as Pixi: try load image from `/assets/background.png` (or jpg/webp). Use `scene.load.image("bg", url)` in preload or dynamic load; on success add Image to scene at (0,0) scaled to game width/height.
- On failure: draw gradient or solid with Graphics (same fallback as Pixi: darker bottom, config backgroundColor top 60%).
- Resize: update background sprite/graphics size on resize.

### Step 9.2 — Card back / felt textures

- If not done in BootScene: generate in CardGameScene create() with Graphics + RenderTexture, store in texture manager so PhaserTable and PhaserCard use them.
- Use config.visualConfig for colors (backColor, backgroundColor).

### Step 9.3 — Avatars

- Reuse CORS-safe load pattern: create a small helper that loads image from URL with crossOrigin, then creates a Phaser texture from it (or use scene.textures.addBase64). Use in PhaserTurnHUD and PhaserOpponentFan for setPlayerAvatar.

---

## Summary checklist

| Phase | Deliverable |
|-------|-------------|
| 1 | Phaser installed; entry point (main) can switch to PhaserCardGame |
| 2 | PhaserCardGame creates game and scene; CardGameScene reads config/bridge/engine from registry |
| 3 | PhaserTable draws deck + discard; deck tap triggers draw callback |
| 4 | PhaserCard (flip, lift) and PhaserFlyCard (tween) work |
| 5 | PhaserLocalFan addCard, throwCard, drag-to-throw, layout from fanMath |
| 6 | PhaserOpponentFan hand count, name, avatar, visibility per slot |
| 7 | PhaserTurnHUD names, avatars, turn glow |
| 8 | bridge.init() wired; resize repositions all layers |
| 9 | Background from assets or gradient; card/felt textures; avatar loading |

No changes to cards-core; only new phaser-cards module and one-line (or flag) change in cards-main to use PhaserCardGame.
