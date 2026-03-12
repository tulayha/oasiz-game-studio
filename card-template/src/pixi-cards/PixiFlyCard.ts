/**
 * PixiFlyCard.ts
 * ──────────────
 * Transient card spawned during draw and throw animations.
 * Created at source position, tweened to target, then destroyed.
 */

import { Container, Graphics, type Ticker } from "pixi.js";
import { CARD_W, CARD_H } from "./PixiCard";

export class PixiFlyCard extends Container {
  constructor(
    x:         number,
    y:         number,
    backColor: number,
    r:         number,
    ticker:    Ticker,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.pivot.set(CARD_W / 2, CARD_H);
    this.draw(backColor, r);
    void ticker; // stored if needed for multi-step tweens
  }

  /** Tween this container to (targetX, targetY, targetRot) over durationMs. */
  flyTo(
    targetX:    number,
    targetY:    number,
    targetRot:  number,
    durationMs: number,
    ticker:     Ticker,
    onComplete: () => void,
  ): void {
    const startX = this.x;
    const startY = this.y;
    const startR = this.rotation;
    let elapsed  = 0;

    const tick = (delta: { deltaTime: number }) => {
      elapsed  += (delta.deltaTime / 60) * 1000;
      const t   = Math.min(elapsed / durationMs, 1);
      const e   = easeOutCubic(t);

      this.x        = lerp(startX, targetX, e);
      this.y        = lerp(startY, targetY, e);
      this.rotation = lerpAngle(startR, targetRot, e);

      if (t >= 1) {
        ticker.remove(tick);
        onComplete();
      }
    };

    ticker.add(tick);
  }

  private draw(backColor: number, r: number): void {
    const g = new Graphics();
    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.fill({ color: backColor });
    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.stroke({ width: 1.5, color: 0xffd700, alpha: 0.7 });
    this.addChild(g);
  }
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
