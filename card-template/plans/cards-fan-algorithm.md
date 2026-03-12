# Multiplayer Card Game Template — Card Fan Arc Algorithm

---

## Card Fan Arc Algorithm

### Concept

Cards are arranged in a semicircular arc. Each card's bottom edge is tangent to the arc. The pivot point is well below the visible card area, giving a natural "held in hand" appearance.

### Fan Spread Calculation

```
computeFanSpread(cardCount):
  if cardCount <= 1: return 0
  clamped      = clamp(cardCount, 1, 12)
  spreadPerCard = lerp(14, 5, (clamped - 1) / 11)   // 14° for 2 cards, 5° for 12
  totalSpread   = clamp(spreadPerCard * (cardCount - 1), 10, 40)
  return totalSpread   // degrees
```

### Per-Card Slot Position

```
computeFanSlots(cardCount, centerX, centerY, radius):
  totalSpread = computeFanSpread(cardCount)
  slots = []
  for i in 0..cardCount-1:
    t        = (cardCount == 1) ? 0 : (i / (cardCount - 1)) - 0.5  // -0.5 … +0.5
    angleDeg = t * totalSpread
    angleRad = degToRad(angleDeg - 90)          // -90 so 0° = straight up
    x        = centerX + radius * cos(angleRad)
    y        = centerY + radius * sin(angleRad)
    rotation = degToRad(angleDeg)               // card tilts with arc
    slots.push({ x, y, rotation, index: i })
  return slots
```

### Fan Center and Radius

```
-- Local fan --
fanCenterX = W / 2
fanCenterY = localZoneTop + localZoneH * 0.85   // pivot below visible area
fanRadius  = CARD_H * 3.5

-- Opponent fans --
OPP fan uses same function but:
  radius   = OPP_CARD_H * 2.2
  maxSpread = 28°
  arcRotationOffset:
    top-center → +180° (arc opens downward, cards hang down)
    top-left   → +90°  (arc opens rightward)
    top-right  → -90°  (arc opens leftward)
```

### Card Pivot Point

Each card's transform origin (pivot / anchor) is set to its **bottom-center**:

```
pivot = (CARD_W/2, CARD_H)   -- in PixiJS
origin = (0.5, 1.0)          -- in Phaser
```

This makes the card swing naturally around its base when rotated.

### Visual Layering

Cards render in index order; the rightmost card (last index) renders on top. On hover/select, the card rises `CARD_H * 0.12` and scales to `1.08`.

### `applyArcRotation` Helper

After computing slots in the default upward orientation, opponent fans need their slot positions rotated around the fan anchor to face the table center:

```
applyArcRotation(slots, anchorX, anchorY, offsetDeg):
  offsetRad = degToRad(offsetDeg)
  return slots.map(slot => {
    dx = slot.x - anchorX
    dy = slot.y - anchorY
    rotated_x = dx * cos(offsetRad) - dy * sin(offsetRad)
    rotated_y = dx * sin(offsetRad) + dy * cos(offsetRad)
    return {
      x:        anchorX + rotated_x,
      y:        anchorY + rotated_y,
      rotation: slot.rotation + offsetRad,
      index:    slot.index,
    }
  })
```
