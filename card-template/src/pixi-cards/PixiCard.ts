/**
 * PixiCard.ts
 * ───────────
 * Single card PIXI.Container.
 * Pivot is at bottom-center so the card arcs naturally in a fan.
 * Flip animation uses GSAP: two-phase scale.x squash → expand.
 */

import { Container, Graphics, Rectangle, Text, TextStyle } from "pixi.js";
import { gsap } from "gsap";
import type { CardFace } from "../cards-core/types";
import { ANIM, EASE } from "./gsapPixi";

export const CARD_W = 56;
export const CARD_H = 80;

export class PixiCard extends Container {
  readonly cardIndex: number;

  private backGfx!: Container;
  private frontGfx!: Container;
  private _faceUp = false;

  private readonly faceData: CardFace | null;

  constructor(
    index:       number,
    face:        CardFace | null,
    backColor:   number,
    borderRadius: number,
  ) {
    super();
    this.cardIndex = index;
    this.faceData  = face;

    this.buildBack(backColor, borderRadius);
    this.buildFront(face, borderRadius);

    this.backGfx.position.set(-CARD_W / 2, -CARD_H);
    this.frontGfx.position.set(-CARD_W / 2, -CARD_H);

    this.backGfx.visible  = true;
    this.frontGfx.visible = false;

    this.pivot.set(0, 0);
    this.eventMode = "static";
    this.cursor    = "pointer";
    this.hitArea   = new Rectangle(-CARD_W / 2, -CARD_H, CARD_W, CARD_H);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  flip(faceVisible: boolean, instant = false): void {
    this._faceUp = faceVisible;

    if (instant) {
      gsap.killTweensOf(this.scale);
      this.scale.x          = 1;
      this.backGfx.visible  = !faceVisible;
      this.frontGfx.visible = faceVisible;
      return;
    }

    // Phase 1: squash to x = 0
    gsap.to(this.scale, {
      x:        0,
      duration: ANIM.FLIP_PHASE,
      ease:     EASE.FLIP_IN,
      overwrite: true,
      onComplete: () => {
        // Midpoint: swap faces
        this.backGfx.visible  = !faceVisible;
        this.frontGfx.visible = faceVisible;
        // Phase 2: expand back to 1
        gsap.to(this.scale, {
          x:        1,
          duration: ANIM.FLIP_PHASE,
          ease:     EASE.OUT,
        });
      },
    });
  }

  private _lifted = false;

  isLifted(): boolean { return this._lifted; }

  setLifted(lifted: boolean): void {
    if (this._lifted === lifted) return;
    this._lifted = lifted;
    if (lifted) {
      this.y       += -CARD_H * 0.12;
      this.scale.set(1.1);
    } else {
      this.y       += CARD_H * 0.12;
      this.scale.set(1);
    }
  }

  setInteractable(v: boolean): void {
    this.cursor = v ? "pointer" : "default";
  }

  getFace(): CardFace | null { return this.faceData; }
  frontGfxVisible(): boolean { return this._faceUp; }

  override destroy(): void {
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.scale);
    super.destroy({ children: true });
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  private buildBack(backColor: number, r: number): void {
    const c = new Container();
    const g = new Graphics();

    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.fill({ color: backColor });

    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.stroke({ width: 1.5, color: 0xffd700, alpha: 0.7 });

    g.setStrokeStyle({ width: 1, color: 0xffd700, alpha: 0.12 });
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += 10) {
      g.moveTo(i, 0);
      g.lineTo(i + CARD_H, CARD_H);
      g.stroke();
    }

    g.roundRect(4, 4, CARD_W - 8, CARD_H - 8, Math.max(r - 2, 1));
    g.stroke({ width: 1, color: 0xffd700, alpha: 0.2 });

    c.addChild(g);
    this.backGfx = c;
    this.addChild(c);
  }

  private buildFront(face: CardFace | null, r: number): void {
    const c = new Container();
    const g = new Graphics();

    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.fill({ color: 0xffffff });
    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.stroke({ width: 1.5, color: 0x999999, alpha: 0.5 });
    c.addChild(g);

    if (face) {
      const colorNum = parseInt(face.color.replace("#", ""), 16);
      const valStyle = new TextStyle({ fontSize: 10, fill: colorNum, fontFamily: "Arial", fontWeight: "bold" });
      const symStyle = new TextStyle({ fontSize: 9,  fill: colorNum, fontFamily: "Arial" });
      const bigStyle = new TextStyle({ fontSize: 26, fill: colorNum, fontFamily: "Arial" });

      const tlVal = new Text({ text: face.value,  style: valStyle });
      const tlSym = new Text({ text: face.symbol, style: symStyle });
      tlVal.position.set(5, 5);
      tlSym.position.set(5, 15);

      const centre = new Text({ text: face.symbol, style: bigStyle });
      centre.anchor.set(0.5, 0.5);
      centre.position.set(CARD_W / 2, CARD_H / 2);

      c.addChild(tlVal, tlSym, centre);
    }

    this.frontGfx = c;
    this.addChild(c);
  }
}
