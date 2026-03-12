# Multiplayer Card Game Template — Portrait Layout Design

---

## Portrait Layout

### Viewport Zones — Full Picture

The three opponents occupy **fixed anchor positions** that mirror a real card table in portrait:
- **Slot A (top-center)** — directly above the deck, arc opens downward.
- **Slot B (left-mid)** — left edge, shifted slightly above center so the fan points right and down toward the table.
- **Slot C (right-mid)** — mirror of B, fan points left and down.

This gives a natural "seated around a table" feel rather than three players squashed in a horizontal row.

```
┌─────────────────────────────────────────┐  ← safe area top (120px mobile / 45px desktop)
│                                         │
│              ┌──────────┐               │
│              │  Slot A  │               │  ← y ≈ 20% H
│              │  (top)   │               │    arc opens downward (180°)
│              │ fan+name │               │
│              └──────────┘               │
│                                         │
│  ┌────────┐                 ┌────────┐  │
│  │ Slot B │                 │ Slot C │  │  ← y ≈ 42% H
│  │ (left) │  ┌────┐ ┌────┐  │(right) │  │    B arc opens right (+90°)
│  │ fan    │  │DECK│ │PLAY│  │ fan    │  │    C arc opens left  (-90°)
│  │ name   │  └────┘ └────┘  │ name   │  │
│  └────────┘                 └────────┘  │
│                                         │
│                                         │
│    ┌──────────────────────────────────┐ │
│    │       LOCAL PLAYER CARD FAN      │ │  ← y ≈ 78% H (fan pivot)
│    │     (face-up, interactive arc)   │ │    arc opens upward (0°)
│    └──────────────────────────────────┘ │
│        [Your Name]   [Turn indicator]   │
└─────────────────────────────────────────┘  ← bottom
```

### Zone Pixel Math

```
H = window.innerHeight,  W = window.innerWidth
isMobile = matchMedia("(pointer: coarse)").matches

safeTop = isMobile ? 120 : 45

-- Vertical anchor positions (percentages of H) --
slotA_y      = safeTop + (H * 0.20 - safeTop) * 0.5 + safeTop    // ≈ 20% H, never below safeTop
slotBC_y     = H * 0.42      // left and right players sit just above table centre
tableCenterY = H * 0.46      // deck + play zone vertical centre
localFanY    = H * 0.78      // local fan arc pivot (below card tops)

-- Horizontal positions --
slotA_x      = W * 0.50
slotB_x      = W * 0.10      // left edge; fan hangs to the right
slotC_x      = W * 0.90      // right edge; fan hangs to the left
deckCenterX  = W * 0.38
playCenterX  = W * 0.62
localFanX    = W * 0.50
```

### Card Sizing

```
CARD_W_BASE = 56,  CARD_H_BASE = 80   (standard poker ratio ≈ 1:1.43)

-- Local fan (large, dominant at bottom) --
fanCardScale = clamp(W * 0.90 / (CARD_W_BASE * 6), 0.8, 1.4)
CARD_W       = CARD_W_BASE * fanCardScale
CARD_H       = CARD_H_BASE * fanCardScale

-- Slot A (top-center) — slightly smaller than sides (more cards visible in narrow space) --
OPP_A_SCALE  = fanCardScale * 0.58
OPP_A_W      = CARD_W_BASE * OPP_A_SCALE
OPP_A_H      = CARD_H_BASE * OPP_A_SCALE

-- Slots B and C (left / right) — slightly larger than top (more visual real estate on sides) --
OPP_BC_SCALE = fanCardScale * 0.65
OPP_BC_W     = CARD_W_BASE * OPP_BC_SCALE
OPP_BC_H     = CARD_H_BASE * OPP_BC_SCALE
```

### Opponent Slot Visibility by Player Count

| Active opponents | Slot A (top) | Slot B (left) | Slot C (right) |
|---|---|---|---|
| 1 (2-player game) | Shown | Hidden | Hidden |
| 2 (3-player game) | Hidden | Shown | Shown |
| 3 (4-player game) | Shown | Shown | Shown |

Slot visibility is set dynamically when `onPlayerJoin` / `onQuit` fires. Hidden slots have `visible = false` and their name labels are hidden.

### Opponent Fan Arc Rotations

The arc rotation offset rotates the entire fan so it always "faces" the centre of the table:

| Slot | Arc rotation offset | Effect |
|---|---|---|
| Slot A (top-center) | +180° | Fan opens downward toward table |
| Slot B (left) | +90° | Fan opens rightward toward table |
| Slot C (right) | -90° | Fan opens leftward toward table |
| Local (bottom) | 0° | Fan opens upward (default) |

### TableZone System (game-agnostic)

Rather than hardcoding a single "discard pile", the table supports named `TableZone` slots defined in config. Each zone has a position, capacity, and display mode:

```
interface TableZone {
  key:      string          // e.g. "discard", "community", "pot", "flop"
  x:        number          // absolute position (set by layout algorithm)
  y:        number
  capacity: number | "stack" | "spread"
              // stack = pile (only top visible), spread = fan-out row, number = fixed slots
  faceUp:   boolean         // whether cards in this zone are face-up
  label?:   string          // optional label shown below the zone
}
```

Default config for UNO/simple games:
```
zones: [
  { key: "deck",    capacity: "stack",  faceUp: false, x: deckCenterX,  y: tableCenterY },
  { key: "discard", capacity: "stack",  faceUp: true,  x: playCenterX,  y: tableCenterY },
]
```

Override for Poker (Texas Hold'em):
```
zones: [
  { key: "deck",      capacity: "stack",  faceUp: false },
  { key: "community", capacity: 5,        faceUp: true,  label: "Community" },
  { key: "pot",       capacity: 0,        faceUp: false, label: "Pot" },  // text-only display
]
```

Override for Blackjack:
```
zones: [
  { key: "deck",   capacity: "stack", faceUp: false },
  { key: "dealer", capacity: "spread", faceUp: true, label: "Dealer" },
]
```

The renderer reads `config.zones` and lays them out horizontally centred in the table band, spacing them evenly. No renderer code changes are needed when zones change.
