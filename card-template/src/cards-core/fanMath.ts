/**
 * fanMath.ts
 * ──────────
 * Card layout: straight-line default + placeholder for custom layout.
 * No side-effects, no renderer imports.
 */

import type { FanSlot } from "./types";

// ── Straight line (default) ───────────────────────────────────────────────────

/**
 * Place cards in a horizontal straight line centered at (centerX, centerY).
 * No spread, no angles; rotation 0. Use layoutCards() to apply custom layout.
 */
export function computeFanSlots(
  cardCount: number,
  centerX: number,
  centerY: number,
  radius: number,
): FanSlot[] {
  const slots: FanSlot[] = [];
  if (cardCount <= 0) return slots;

  if (cardCount === 1) {
    slots.push({ x: centerX, y: centerY, rotation: 0, index: 0 });
    return slots;
  }

  const startX = centerX;

  for (let i = 0; i < cardCount; i++) {
    slots.push({
      x: startX + i,
      y: centerY,
      rotation: 0,
      index: i,
    });
  }

  return slots;
}

// ── Placeholder: custom layout ─────────────────────────────────────────────────

export type LayoutRole = "local" | "opponent";

/**
 * Placeholder: take the default straight-line slots and return them as-is.
 * Replace this with your own logic to position cards (arc, fan, carousel, etc.)
 * for local and/or opponent. You get centerX, centerY and role to branch on.
 */
export function layoutCards(
  slots: FanSlot[],
  role: LayoutRole,
): FanSlot[] {
  const rotationPerCard = 0.07;
  const isCountEven = slots.length % 2 === 0;
  const centerIndex = isCountEven ? slots.length / 2 - 0.5 : Math.floor(slots.length / 2);
  const middleIndex = Math.floor(slots.length / 2);

  if (role === "local") {
    const stepX = 100 / slots.length;
    const stepY = 20 / slots.length;

    return slots.map((slot, index) => {
      let x = slot.x + (index - middleIndex) * stepX;
      if (isCountEven) {
        x += stepX / 2;
      }
      const y = slot.y + Math.abs(index - centerIndex) * stepY;
      const rotation = (index - centerIndex) * rotationPerCard;
      return {
        ...slot,
        x,
        y,
        rotation,
      };
    });
  } else {
    const stepX = 60 / slots.length;
    const stepY = 10 / slots.length;

    return slots.map((slot, index) => {
      let x = slot.x + (index - middleIndex) * stepX;
      if (isCountEven) {
        x += stepX / 2;
      }
      const y = slot.y - Math.abs(index - centerIndex) * stepY;
      const rotation = (index - centerIndex) * -rotationPerCard;
      return {
        ...slot,
        x,
        y,
        rotation,
      };
    });
  }
}
