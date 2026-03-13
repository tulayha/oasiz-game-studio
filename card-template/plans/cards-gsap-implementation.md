# GSAP Implementation Plan — Card Template

Step-by-step plan to add GSAP and migrate existing Pixi ticker-based animations to GSAP for smoother, consistent timing and easing.

---

## Prerequisites

- Current animations use **Pixi Ticker** callbacks with manual `elapsed`, `lerp`, and `easeOutQuad` / `easeOutCubic`.
- **Pixi v8** is in use; we will use **GSAP core only** (no PixiPlugin) to avoid v8 API drift. GSAP animates any object’s numeric properties (`x`, `y`, `rotation`, `alpha`, `scale.x`, `scale.y`), which Pixi will render on the next frame.

---

## Phase 1 — Install and bootstrap

### Step 1.1 — Install GSAP

```bash
cd card-template
bun add gsap
```

- Use **gsap** only (no `gsap/PixiPlugin` in this plan).
- No Pixi registration required when animating raw properties.

### Step 1.2 — Create a shared GSAP helper (optional)

- **File:** `src/pixi-cards/gsapPixi.ts` (or keep inline in each file).
- Export small helpers if you want consistency:
  - `toPixi(target, vars, config)` — wrapper around `gsap.to(target, { ...vars, ...config })` with defaults (e.g. `ease: "power2.out"`).
  - Map existing durations: 220ms → `duration: 0.22`, 180ms → `duration: 0.18`, etc.
- **Easing map:** `easeOutQuad` → `"power2.out"`, `easeOutCubic` → `"power3.out"`. GSAP uses seconds for `duration`.

### Step 1.3 — Ensure GSAP runs with the render loop

- GSAP uses its own `requestAnimationFrame` ticker. Pixi also renders on rAF. No extra wiring needed: when GSAP updates `obj.x` / `obj.y`, the next Pixi render will show it.
- Do **not** drive GSAP from Pixi’s ticker; let GSAP run independently.

---

## Phase 2 — Migrate animations by file

Order: from least to most critical path so you can test often.

---

### Step 2.1 — PixiFlyCard (`PixiFlyCard.ts`)

**Current:** `flyTo()` uses `ticker.add(tick)` and manual `elapsed` + `lerp` + `easeOutCubic` for `x`, `y`, `rotation`.

**Target:**

1. Add `import { gsap } from "gsap";`.
2. Remove the `tick` callback and `ticker.add(tick)`.
3. Replace with:

   ```ts
   gsap.to(this, {
     x: targetX,
     y: targetY,
     rotation: targetRot,
     duration: durationMs / 1000,
     ease: "power3.out",
     onComplete,
   });
   ```

4. You can remove the `ticker` parameter from `flyTo()` if it’s no longer used; update call sites (e.g. in `PixiLocalFan`).
5. Remove local `lerp`, `easeOutCubic`, `lerpAngle` from this file if unused.

**Test:** Draw a card (deck → fan) and throw a card (fan → discard). Flight should look smoother and better instead of the current shit one.

---

### Step 2.2 — PixiTurnHUD (`PixiTurnHUD.ts`)

**Current:**

- `tweenAlpha(obj, target, durationMs)` — ticker + `elapsed` + `lerp` on `obj.alpha`.
- `scalePulse(obj)` — ticker + `Math.sin` to scale 1 → 1.15 → 1.
- `showGlow(s)` — ticker + sine pulse on `s.glow.alpha`.

**Target:**

1. Add `import { gsap } from "gsap";`.
2. **tweenAlpha:**  
   `gsap.to(obj, { alpha: target, duration: durationMs / 1000, ease: "power2.out" });`  
   No need to add/remove a ticker callback.
3. **scalePulse:**  
   `gsap.fromTo(obj.scale, { x: 1, y: 1 }, { x: 1.15, y: 1.15, duration: 0.25, ease: "power2.inOut", yoyo: true, repeat: 1 });`  
   Or a short timeline: scale up then down. Remove the manual `tick` and `ticker.remove(tick)`.
4. **showGlow:**  
   Keep the glow visible and animate alpha with `gsap.to(s.glow, { alpha: 0.8, duration: 0.2, ease: "power2.out" });` and optionally a repeating `gsap.to(..., { alpha: 0.5, yoyo: true, repeat: -1, duration: 0.5 })` for pulse. If you prefer to keep the current sine pulse, you can still replace the ticker with a `gsap.ticker.add()` or a repeating tween—your choice.
5. Remove `ticker` from constructor and any `this.ticker.add` / `this.ticker.remove` for these effects. If the HUD still needs the ticker for something else, leave it in.

**Test:** Change turn (e.g. mock or real); outgoing label dims, incoming label pulses, glow appears.

---

### Step 2.3 — PixiOpponentFan (`PixiOpponentFan.ts`)

**Current:**

- `fadeIn(c)` — ticker increases `c.alpha` until 1.
- `fadeOut(c, onDone)` — ticker decreases `c.alpha` to 0 then `onDone()`.

**Target:**

1. Add `import { gsap } from "gsap";`.
2. **fadeIn:**  
   `gsap.to(c, { alpha: 1, duration: 0.05, ease: "power2.out" });`  
   (Match your existing ~50ms intent; adjust duration to taste.)
3. **fadeOut:**  
   `gsap.to(c, { alpha: 0, duration: 0.15, ease: "power2.in", onComplete: onDone });`  
   (Match existing ~150ms.)
4. Remove the `tick` callbacks and `ticker.add` / `ticker.remove` for these.
5. If `PixiOpponentFan` no longer uses the ticker elsewhere, you can stop passing/injecting it (optional cleanup).

**Test:** Add/remove opponent cards (or simulate hand count changes); cards fade in/out smoothly.

---

### Step 2.4 — PixiLocalFan (`PixiLocalFan.ts`)

**Current:**

- **tweenToLayout(count):** One ticker callback that each frame lerps every card’s `x`, `y`, `rotation`, `alpha` toward layout targets; duration ~220ms, `easeOutQuad`. Callback is stored in `_layoutTick` and removed/cancelled when a new layout starts.
- **snapCardToLayout(index):** Single-card tween back to slot over ~180ms, `easeOutQuad`.

**Target:**

1. Add `import { gsap } from "gsap";`.
2. **Cancel in-flight layout:**  
   When starting a new layout, kill any existing GSAP tweens for the cards involved. Store a `gsap.core.Tween` or use a dedicated timeline/group per layout. Easiest: `gsap.killTweensOf(this.cards)` (or a specific list) at the start of `tweenToLayout` so new tweens don’t fight old ones.
3. **tweenToLayout(count):**
   - Compute target slots (reuse existing `computeFanSlots` + `layoutCards`).
   - For each card, run:
     ```ts
     gsap.to(this.cards[i], {
       x: tg.x,
       y: tg.y,
       rotation: tg.rotation,
       alpha: tg.alpha ?? 1,
       duration: 0.22,
       ease: "power2.out",
       overwrite: true,
     });
     ```
   - Use `onComplete` on the **last** card (or a single `gsap.to()` that animates all via a timeline) to run your existing “finalize interactivity” / `syncArrows` logic so you don’t remove the ticker-based “on complete” behavior.
   - Remove the `_layoutTick` callback and all `ticker.add`/`ticker.remove` for layout.
4. **snapCardToLayout(index):**  
   One `gsap.to(card, { x: slot.x, y: slot.y, rotation: slot.rotation, duration: 0.18, ease: "power2.out" })`. Remove the ticker-based snap tween.
5. Optional: If `PixiLocalFan` no longer needs the ticker for anything else, you can stop adding layout-related ticker callbacks (any remaining ticker use can stay until you migrate that too).

**Test:** Draw card, throw card, drag-and-release (snap back), carousel navigation. All cards should slide to new positions smoothly; no double-jumping or stuck cards.

---

### Step 2.5 — PixiCard flip (`PixiCard.ts`) — optional / later

**Current:** Flip is a two-phase animation driven by `this.ticker.add(this.onTick)`: phase1 squashes `scale.x` to 0, phase2 expands back to 1; at midpoint it swaps back/front visibility.

**Target (optional):**

1. Add `import { gsap } from "gsap";`.
2. Replace the two-phase ticker logic with a short GSAP timeline:
   - Phase 1: `gsap.to(this.scale, { x: 0, duration: 0.07, ease: "power2.in", onComplete: () => { swap visibility } })`.
   - Phase 2: `gsap.to(this.scale, { x: 1, duration: 0.07, ease: "power2.out" })`.
3. Remove `onTick`, `flipPhase`, `flipProg`, and `this.ticker.add(this.onTick, this)` for the flip. Keep the ticker only if the class still needs it for something else.

**Test:** Cards that flip face-up (e.g. on draw or when revealed) should look the same or slightly snappier.

---

## Phase 3 — Cleanup and consistency

### Step 3.1 — Remove unused ticker usage

- After each file is migrated, delete:
  - Local `lerp`, `easeOutQuad`, `easeOutCubic`, `lerpAngle` if they are no longer used.
  - Any `ticker.add` / `ticker.remove` that only existed for the migrated animation.
- Keep the Pixi `Ticker` where it’s still required (e.g. game loop, or components that didn’t use it only for these tweens).

### Step 3.2 — Align with timing plan

- Cross-check `plans/cards-animations.md` and match durations/easing where specified (e.g. fan re-layout 200ms, draw fly 320ms, etc.). Use `duration: 0.2`, `duration: 0.32`, and GSAP eases like `"power2.out"` or custom cubic bezier if you add a plugin.

### Step 3.3 — Optional: centralize durations and eases

- In `gsapPixi.ts` or a small `animConfig.ts`, define constants (e.g. `FAN_LAYOUT_DURATION = 0.22`, `FLY_CARD_DURATION = 0.32`, `EASE_FAN = "power2.out"`) and use them in both `PixiLocalFan` and `PixiFlyCard` so future timing changes are in one place.

---

## Phase 4 — Verification

- **Draw card:** Deck → fly to fan → land and fan re-layout. No jitter, no cards stuck mid-position.
- **Throw card:** Drag up past threshold → card flies to discard → remaining cards re-layout.
- **Snap back:** Drag card up less than threshold → card snaps back to slot.
- **Turn change:** HUD label alpha and scale pulse; glow appears.
- **Opponent cards:** Add/remove cards; fade in/out and layout look correct.
- **Carousel / arrows:** If you have carousel behaviour, all layout tweens still complete and arrows/enabled state stay in sync.

---

## Rollback

- If a step causes regressions, revert that file and keep the rest. GSAP and ticker-based animations can coexist (e.g. only `PixiFlyCard` and `PixiTurnHUD` on GSAP, rest still on ticker) until you’re confident.

---

## Summary table

| File / area           | Current mechanism              | GSAP replacement                                      |
|-----------------------|--------------------------------|--------------------------------------------------------|
| PixiFlyCard           | ticker + lerp + easeOutCubic   | `gsap.to(this, { x, y, rotation, duration, ease })`   |
| PixiTurnHUD           | tweenAlpha, scalePulse, glow   | `gsap.to` / `gsap.fromTo` for alpha, scale, glow alpha |
| PixiOpponentFan       | fadeIn / fadeOut ticker        | `gsap.to(c, { alpha, duration, onComplete })`           |
| PixiLocalFan          | tweenToLayout, snapCardToLayout| `gsap.to(card, { x, y, rotation, alpha })` + killTweensOf |
| PixiCard (flip)       | ticker two-phase scale.x       | Optional: `gsap.to(this.scale, { x: 0/1 })` timeline    |

All steps use **GSAP core only**; no PixiPlugin required for this plan.
