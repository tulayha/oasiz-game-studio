/**
 * anim.ts
 * ───────
 * Centralised animation timing and easing constants for the Phaser renderer.
 * Mirrors gsapPixi.ts so game feel is tunable in one place per renderer.
 *
 * Durations are in milliseconds (Phaser tween convention).
 * Ease strings are Phaser tween ease names.
 */

export const ANIM = {
  /** Card flying from deck to hand / hand to discard pile (ms). */
  FLY: 320,
  /** Fan re-layout after draw, throw, or carousel scroll (ms). */
  LAYOUT: 220,
  /** Single card snap back after a cancelled drag (ms). */
  SNAP: 180,
  /** HUD label alpha fade (ms). */
  HUD_ALPHA: 250,
  /** Each half of the card flip animation – squash + expand (ms). */
  FLIP_PHASE: 70,
} as const;

export const EASE = {
  OUT: "Cubic.easeOut",
  FLY: "Quart.easeOut",
  FLIP_IN: "Cubic.easeIn",
  SINE: "Sine.easeInOut",
  /** Fan layout snap — spring overshoot so cards feel alive */
  SPRING: "Back.easeOut",
  /** Card thrown from hand — aggressive decel */
  THROW: "Quint.easeOut",
} as const;
