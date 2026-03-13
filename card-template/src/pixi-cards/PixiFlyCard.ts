/**
 * PixiFlyCard.ts
 * ──────────────
 * Transient card spawned during draw and throw animations.
 * Created at source position, tweened to target via GSAP, then destroyed.
 */

import { Container, Graphics } from "pixi.js";
import { gsap } from "gsap";
import { CARD_W, CARD_H } from "./PixiCard";
import { ANIM, EASE } from "./gsapPixi";

export class PixiFlyCard extends Container {
  constructor(
    x:         number,
    y:         number,
    backColor: number,
    r:         number,
  ) {
    super();
    this.x = x;
    this.y = y;
    this.pivot.set(CARD_W / 2, CARD_H);
    this.draw(backColor, r);
  }

  /** Tween this container to (targetX, targetY, targetRot) over durationMs, then call onComplete. */
  flyTo(
    targetX:    number,
    targetY:    number,
    targetRot:  number,
    durationMs: number,
    onComplete: () => void,
  ): void {
    gsap.to(this, {
      x:          targetX,
      y:          targetY,
      rotation:   targetRot,
      duration:   durationMs / 1000,
      ease:       EASE.FLY,
      onComplete,
    });
  }

  override destroy(): void {
    gsap.killTweensOf(this);
    super.destroy();
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
