# Multiplayer Card Game Template — Animation Timing Plan

---

## Animation Timing Plan

### Draw Card Animation  (deck → local fan)

| Phase | Start | End | Description |
|---|---|---|---|
| Pop at deck | 0ms | 80ms | FlyCard appears at deck center, scale 1.0 → 1.05 |
| Fly to fan slot | 80ms | 400ms | Cubic ease-out, face-down, to new fan slot position |
| Land + fan re-layout | 400ms | 520ms | FlyCard → real Card; all cards tween 200ms to new slots |

Easing: `cubicBezier(0.25, 0.46, 0.45, 0.94)`
Card flips face-up at the 400ms land point (fast 100ms flip).

### Throw Card Animation  (fan → discard pile)

| Phase | Start | End | Description |
|---|---|---|---|
| Lift | 0ms | 80ms | Tapped card rises 12px, scale → 1.1 |
| Fly to discard | 80ms | 380ms | Ease-in-out arc toward discard center, slight rotation |
| Land + fan close | 380ms | 480ms | Card removed; remaining cards slide to closed positions |

Fan re-layout (200ms) begins at 380ms in parallel with land.

### Fan Re-layout  (any handCount change)

All non-animating cards slide 200ms (`easeOutQuad`) to new computed fan slot positions.

### Opponent Fan Update  (remote handCount changes)

| Change | Animation |
|---|---|
| Count **increased** | Ghost card fades in (50ms, 50% alpha) at slot anchor, then a real back card appears and fan re-layouts (200ms slide) |
| Count **decreased** | Rightmost back card fades out (150ms), remaining cards slide closed (200ms) |

### Turn Indicator Transition

| Element | Animation |
|---|---|
| Outgoing player label | Opacity 1.0 → 0.4 over 300ms |
| Incoming player label | Scale pulse 1.0 → 1.15 → 1.0 over 500ms |
| Glow ring | Alpha fade-in around active fan over 200ms |
