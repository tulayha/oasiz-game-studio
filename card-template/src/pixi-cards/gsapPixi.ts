/**
 * gsapPixi.ts
 * ───────────
 * Centralised animation timing and easing constants.
 * All durations are in GSAP seconds (not ms).
 * Change values here to retune the whole game feel in one place.
 */

export const ANIM = {
  /** Card flying from deck to hand / hand to discard pile. */
  FLY:    0.32,
  /** Fan re-layout after draw, throw, or carousel scroll. */
  LAYOUT: 0.22,
  /** Single card snap back after a cancelled drag. */
  SNAP:   0.18,
  /** HUD label alpha fade (dim outgoing, brighten incoming). */
  HUD_ALPHA: 0.25,
  /** Each half of the card flip animation (squash + expand). */
  FLIP_PHASE: 0.07,
  /** Glow pulse half-period (yoyo). */
  GLOW_PULSE: 0.5,
} as const;

export const EASE = {
  OUT:      "power2.out",
  FLY:      "power3.out",
  FLIP_IN:  "power2.in",
  SINE:     "sine.inOut",
} as const;
