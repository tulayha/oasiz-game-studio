# Multiplayer Card Game Template — PixiJS v8 Renderer Plan

---

## PixiJS v8 Renderer Plan  (`src/pixi-cards/`)

### Layer Stack (PIXI.stage children)

```
app.stage
  ├── tableLayer      (PIXI.Container)  ← felt bg + all TableZone slots (deck, play area, etc.)
  ├── opponentLayer   (PIXI.Container)  ← Slot A (top), Slot B (left), Slot C (right) fans
  ├── localFanLayer   (PIXI.Container)  ← PixiLocalFan (bottom)
  ├── flyLayer        (PIXI.Container)  ← PixiFlyCard during animation (renders above everything)
  └── hudLayer        (PIXI.Container)  ← name labels, glow rings, card-count badges
```

### PixiCard

`PixiCard extends PIXI.Container`

- `backContainer` — PIXI.Graphics: deep blue rounded rect, gold border, diagonal stripes
- `frontContainer` — PIXI.Graphics + PIXI.Text: white face, suit color, value + symbol
- Pivot set to `(CARD_W/2, CARD_H)` (bottom-center)
- `flip(faceUp, instant?)` — two-phase scaleX tween identical to existing `PixiCard.ts`
- `setLifted(bool)` — moves card up by `CARD_H * 0.12`, scale 1.08 (for hover/select)
- No position management of its own — `PixiLocalFan` owns all positioning

### PixiFlyCard

`PixiFlyCard extends PIXI.Container`

Transient object spawned only during an animation. After animation completes it is destroyed.

Constructor: `(x, y, faceUp, cardData, config)`

Ticker-based tween method:
```
flyTo(targetX, targetY, targetRotation, durationMs, onComplete):
  startX = this.x, startY = this.y, startR = this.rotation
  elapsed = 0
  ticker.add(tick)

  tick(delta):
    elapsed += delta / 60 * 1000   // convert pixi delta to ms
    t = clamp(elapsed / durationMs, 0, 1)
    ease = easeOutCubic(t)
    this.x        = lerp(startX, targetX, ease)
    this.y        = lerp(startY, targetY, ease)
    this.rotation = lerpAngle(startR, targetRotation, ease)
    if t >= 1: ticker.remove(tick), onComplete()
```

### PixiLocalFan

`PixiLocalFan extends PIXI.Container`

Owns an array of `PixiCard` matching `localHand`.

Key methods:
- `addCard(data, deckX, deckY)` — spawns `PixiFlyCard` from deck, tweens to new slot, then inserts `PixiCard` and re-layouts
- `throwCard(index)` — detaches card at index, wraps in `PixiFlyCard`, tweens to discardCenter, re-layouts remaining
- `syncLayout(animated = true)` — calls `fanMath.computeFanSlots()`, tweens all non-animating cards 200ms to new positions
- `setInteractable(bool)` — enables/disables pointer events on all cards

Input: each `PixiCard` listens for `pointerdown`. `PixiLocalFan` identifies the card by index, lifts it, waits 80ms for visual feedback, then calls `CardGameEngine.throwCard(index)`.

Fan tween (Ticker-based, no external tween library):
```
tweenFanToLayout(newSlots, durationMs = 200):
  For each card i: record startX, startY, startR and targetX, targetY, targetR
  elapsed = 0
  ticker.add(tick)
  tick(delta):
    elapsed += delta / 60 * 1000
    t = clamp(elapsed / durationMs, 0, 1)
    e = easeOutQuad(t)
    for each card i:
      card.x        = lerp(start[i].x, target[i].x, e)
      card.y        = lerp(start[i].y, target[i].y, e)
      card.rotation = lerpAngle(start[i].r, target[i].r, e)
    if t >= 1: ticker.remove(tick)
```

### PixiOpponentFan

`PixiOpponentFan extends PIXI.Container`

Constructor params: `(slot: "A"|"B"|"C", anchorX, anchorY, arcRotationOffsetDeg, cardScale)`

The three slots use different card sizes and arc offsets per layout plan:
- Slot A (top): `OPP_A_SCALE`, `arcRotation = 180°`
- Slot B (left): `OPP_BC_SCALE`, `arcRotation = +90°`
- Slot C (right): `OPP_BC_SCALE`, `arcRotation = -90°`

Uses `fanMath.computeFanSlots()` then `fanMath.applyArcRotation(slots, anchorX, anchorY, offsetDeg)` to rotate all slot (x,y) positions and card rotations around the anchor point.

`setHandCount(n)`:
- n > current: spawn ghost card at anchor (fade in 50ms at 50% alpha → real card), insert at end, re-layout
- n < current: tween last card alpha to 0 (150ms), remove, re-layout

`setVisible(bool)`: hides/shows entire fan + name label for the slot (used when player count changes).

### PixiTable

`PixiTable extends PIXI.Container`

Draws using PIXI.Graphics:
- Felt oval background
- Deck stack (card-back + count text over it)
- Discard pile (face-up card showing `discardTopCard` suit symbol + color, or dashed placeholder)

`setDeckInteractable(bool)`: on `true`, deck sprite is `eventMode = "static"` and shows hand cursor. On pointerdown, calls `CardGameEngine.requestDraw()` + haptic.

`updateDiscardPile(card)`: redraws the discard graphic with card's color, symbol, value text.

`updateDeckCount(n)`: updates the count text overlay.

### PixiTurnHUD

`PixiTurnHUD extends PIXI.Container`

Per player slot (local + 3 opponents):
- Name label (`PIXI.Text`) at bottom of each fan area
- Card count badge (`PIXI.Text`) for opponents
- Glow ring (`PIXI.Graphics`, circle stroke, pulsed alpha) around the active fan

`setActiveTurn(playerId)`:
- Previous active label: alpha 1.0 → 0.4 (300ms ticker tween)
- New active label: scale pulse 1.0 → 1.15 → 1.0 (500ms ticker tween)
- Glow ring animates to new player slot

### How PlayroomKit Triggers PixiJS Visuals

`PixiCardGame` subscribes in `init()`:

```
bridge.onTurnChange((id) => {
  pixiTurnHUD.setActiveTurn(id)
  pixiLocalFan.setInteractable(id === myPlayer().id)
  pixiTable.setDeckInteractable(id === myPlayer().id)
})

bridge.onOpponentHandCountChange((playerId, count) => {
  const slot = playerSlotIndex(playerId)   // 0, 1, or 2
  opponentFans[slot].setHandCount(count)
})

bridge.onDiscardTopChange((card) => {
  pixiTable.updateDiscardPile(card)
})

bridge.onDeckCountChange((count) => {
  pixiTable.updateDeckCount(count)
})
```

### Resize Handling (PixiJS)

`window.addEventListener("resize", onResize)` in `PixiCardGame`:

```
onResize():
  app.renderer.resize(innerWidth, innerHeight)
  recalcZones()                       // recompute zone boundaries
  pixiTable.reposition(tableCenterX, tableCenterY)
  pixiLocalFan.reposition(fanCenterX, fanCenterY, fanRadius)
  for slot of opponentFans: slot.reposition(...)
  pixiTurnHUD.reposition(...)
```
