# Multiplayer Card Game Template — Phaser 3 Renderer Plan

---

## Phaser 3 Renderer Plan  (`src/phaser-cards/`)

### Scene Structure

```
Phaser.Game
  ├── CardBootScene    (key: "CardBootScene")
  │     └── generates textures → this.scene.start("CardGameScene")
  └── CardGameScene    (key: "CardGameScene")
        ├── PhaserTable             ← renders all config.zones dynamically
        ├── PhaserOpponentFan × 3   ← Slot A (top), B (left), C (right)
        ├── PhaserLocalFan
        └── Phaser.GameObjects.Text labels (names, counts, turn indicator)
```

Data is passed to scenes via `game.registry`:
- `"cardGameConfig"` — CardGameConfig object (includes zones, deck definition)
- `"onStateChange"` — HUD/nav update callback to `cards-main.ts`

### CardBootScene

Textures generated using `Phaser.GameObjects.Graphics` + `renderTexture.saveTexture()`:

| Texture key | What it is |
|---|---|
| `"card-back"` | Deep blue rounded rect, gold border, diagonal stripes |
| `"card-felt"` | Soft green rounded rectangle for table surface |
| `"card-zone-empty"` | Dashed placeholder shown in an empty TableZone |

Front card textures are NOT pre-generated in Boot. Each `PhaserCard` draws its own front face programmatically from `CardFace` data at construction time. Zone active cards (discard top, community cards) are drawn live in `PhaserTable` using `Phaser.GameObjects.Graphics`.

After textures are saved: `this.scene.start("CardGameScene")`.

### CardGameScene

```
create():
  1. Get config + callbacks from registry
  2. Set background color to config.backgroundColor
  3. Build PhaserTable  (reads config.zones — no hardcoded zone assumptions)
  4. Build 3× PhaserOpponentFan at Slot A/B/C positions (hidden until player joins)
  5. Build PhaserLocalFan
  6. Add player name + count Text per slot
  7. Subscribe to PlayroomBridge callbacks
  8. this.scale.on("resize", onResize, this)
  9. oasiz.gameplayStart()
  10. CardGameEngine.start()

update(): // used only for subtle continuous effects if needed
```

`shutdown()`: removes all event listeners, PlayroomBridge subscriptions, scale listener.

### PhaserLocalFan  extends Phaser.GameObjects.Container

Holds an array of `PhaserCard`.

`addCard(data, deckX, deckY)`:
1. Compute new fan slots for `cards.length + 1`
2. Create a temporary `Phaser.GameObjects.Image` at (deckX, deckY) with `"card-back"` texture, `origin(0.5, 1)`, correct scale
3. `scene.tweens.add({ ... })` to fly it to `newSlots[cards.length]` in 320ms ease-out-cubic
4. `onComplete`: destroy temp image, create real `PhaserCard` at slot position, call `tweenToLayout(cards.length + 1)`

`throwCard(index)`:
1. Detach `PhaserCard` at index, set it as a container child of `scene` (so it renders above fan)
2. `scene.tweens.add({ ... })` to fly it to (discardCenterX, discardCenterY) in 300ms ease-in-out
3. Simultaneously: remove card from `cards[]` array, call `tweenToLayout(cards.length - 1)` for remaining cards
4. `onComplete`: destroy detached card, call bridge.requestThrow(cardData)

`tweenToLayout(count)`:
```
newSlots = fanMath.computeFanSlots(count, fanCenterX, fanCenterY, fanRadius)
for i, card of cards:
  scene.tweens.add({
    targets: card,
    x: newSlots[i].x,  y: newSlots[i].y,  rotation: newSlots[i].rotation,
    duration: 200,  ease: "Power2.Out"
  })
```

### PhaserCard  extends Phaser.GameObjects.Container

Children:
- `backImg: Phaser.GameObjects.Image` — `"card-back"` texture
- `frontGfx: Phaser.GameObjects.Graphics` — redrawn when card data is set

`setOrigin(0.5, 1)` on the container so pivot is bottom-center.

`flip(faceUp, instant?)`:
- Two-phase tween identical to existing `Card.ts` in the memory-match template

`setLifted(bool)`: `y -= CARD_H * 0.12`, `setScale(1.08)` with 80ms ease-out tween.

`setInteractable(bool)`: enables/disables pointer events.

### PhaserOpponentFan  extends Phaser.GameObjects.Container

Constructor: `(scene, slot: "A"|"B"|"C", anchorX, anchorY, arcRotationOffsetDeg, cardScale)`

Slot-specific parameters (matching layout plan):
- Slot A: `arcRotation = 180°`, `scale = OPP_A_SCALE`
- Slot B: `arcRotation = +90°`, `scale = OPP_BC_SCALE`
- Slot C: `arcRotation = -90°`, `scale = OPP_BC_SCALE`

Holds array of `Phaser.GameObjects.Image` objects using `"card-back"` texture.

`setHandCount(n)`:
- If n > current: add image at anchor (alpha 0), tween alpha → 1 (50ms), then `tweenToLayout(n)`
- If n < current: tween last image alpha → 0 (150ms), remove, `tweenToLayout(n)`

`setVisible(bool)`: shows/hides entire container and associated name label.

`tweenToLayout(n)`:
- Calls `fanMath.computeFanSlots(n, ...)` then `fanMath.applyArcRotation(slots, anchor, offsetDeg)`
- Same 200ms `Power2.Out` tween pattern as `PhaserLocalFan`

### PhaserTable

Dynamically builds zone display objects from `config.zones` (game-agnostic):

Holds:
- `feltBg: Phaser.GameObjects.Image` — `"card-felt"` texture
- Per zone in `config.zones`:
  - `zoneSprite: Phaser.GameObjects.Image | Graphics` — `"card-back"` (faceDown) or drawn face (faceUp)
  - `zoneCountText: Phaser.GameObjects.Text` — count overlay for stack zones
  - `zoneLabel: Phaser.GameObjects.Text` — optional zone label (e.g. "Community", "Pot")
- `discardEmptyBg: Phaser.GameObjects.Graphics` — dashed rect placeholder

`setDeckInteractable(bool)`:
- `deckSprite.setInteractive()` or `disableInteractive()`
- Hover: brief scale pulse via tween
- pointerdown → bridge.requestDraw() + haptic

`updateDiscardPile(card | null)`:
- Redraws `discardGfx` using card's color + symbol + value
- Plays a random ±3° rotation tween on land

### How PlayroomKit Triggers Phaser Visuals

Subscriptions in `CardGameScene.create()`:

```
bridge.onTurnChange((id) => {
  localFan.setInteractable(id === myPlayer().id)
  table.setDeckInteractable(id === myPlayer().id)
  updateTurnIndicators(id)     // tweens on name labels + glow graphics
})

bridge.onOpponentHandCountChange((playerId, count) => {
  const slot = playerSlotIndex(playerId)
  opponentFans[slot].setHandCount(count)
})

bridge.onDiscardTopChange((card) => {
  table.updateDiscardPile(card)
})

bridge.onDeckCountChange((count) => {
  table.updateDeckCount(count)
})
```

### Resize Handling (Phaser)

```
this.scale.on("resize", (gameSize) => {
  const { width: W, height: H } = gameSize
  recalcZones(W, H)
  table.reposition(tableCenterX, tableCenterY)
  localFan.reposition(fanCenterX, fanCenterY, fanRadius)
  for slot of opponentFans: slot.reposition(...)
  // reposition name labels
})
```
