/**
 * PhaserCard.ts
 * ─────────────
 * Single card as a Phaser.GameObjects.Container.
 *
 * Pivot convention: the container origin sits at the card's BOTTOM-CENTER.
 * All children are offset to (-CARD_W/2, -CARD_H) so they visually anchor there.
 * This makes fan rotation arc naturally around the bottom edge — same as PixiCard.
 *
 * Flip uses two-phase Phaser tweens (scaleX squash → face swap → expand).
 * Lift nudges y up and scales slightly — no tween, instant (same as Pixi).
 */

import Phaser from "phaser";
import type { CardFace } from "../cards-core/types";
import { CARD_W, CARD_H } from "./constants";
import { ANIM, EASE } from "./anim";

export class PhaserCard extends Phaser.GameObjects.Container {
  readonly cardIndex: number;

  private backContainer!: Phaser.GameObjects.Container;
  private frontContainer!: Phaser.GameObjects.Container;
  private _faceUp = false;
  private _lifted = false;
  private _interactable = true;

  private readonly faceData: CardFace | null;
  private readonly backColor: number;
  private readonly borderRadius: number;

  constructor(
    scene: Phaser.Scene,
    index: number,
    face: CardFace | null,
    backColor: number,
    borderRadius: number,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);

    this.cardIndex = index;
    this.faceData = face;
    this.backColor = backColor;
    this.borderRadius = borderRadius;

    this.buildBack();
    this.buildFront();
    // Note: no setInteractive() — hit testing is done manually by PhaserLocalFan
    // via visibleCardUnderPoint(), avoiding Phaser's broken input clearing on
    // exclusive Container children.
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  flip(faceVisible: boolean, instant = false): void {
    this._faceUp = faceVisible;

    if (instant) {
      this.scene.tweens.killTweensOf(this);
      this.setScale(1, 1);
      this.backContainer.setVisible(!faceVisible);
      this.frontContainer.setVisible(faceVisible);
      return;
    }

    this.scene.tweens.killTweensOf(this);

    // Phase 1: squash scaleX to 0
    this.scene.tweens.add({
      targets: this,
      scaleX: 0,
      duration: ANIM.FLIP_PHASE,
      ease: EASE.FLIP_IN,
      onComplete: () => {
        // Midpoint: swap visible faces
        this.backContainer.setVisible(!faceVisible);
        this.frontContainer.setVisible(faceVisible);
        // Phase 2: expand back to 1
        this.scene.tweens.add({
          targets: this,
          scaleX: 1,
          duration: ANIM.FLIP_PHASE,
          ease: EASE.OUT,
        });
      },
    });
  }

  isLifted(): boolean { return this._lifted; }

  setLifted(lifted: boolean): void {
    if (this._lifted === lifted) return;
    this._lifted = lifted;
    if (lifted) {
      this.y -= CARD_H * 0.12;
      this.setScale(1.1);
    } else {
      this.y += CARD_H * 0.12;
      this.setScale(1);
    }
  }

  /** Flag checked by PhaserLocalFan.visibleCardUnderPoint — no Phaser input involved. */
  setInteractable(active: boolean): void {
    this._interactable = active;
  }

  isInteractable(): boolean { return this._interactable; }

  getFace(): CardFace | null { return this.faceData; }
  isFaceUp(): boolean { return this._faceUp; }

  override destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf(this);
    super.destroy(fromScene);
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private buildBack(): void {
    const c = this.scene.add.container(-CARD_W / 2, -CARD_H);
    const r = this.borderRadius;
    const gfx = this.scene.add.graphics();

    // Card fill
    gfx.fillStyle(this.backColor, 1);
    gfx.fillRoundedRect(0, 0, CARD_W, CARD_H, r);

    // Gold border
    gfx.lineStyle(1.5, 0xffd700, 0.7);
    gfx.strokeRoundedRect(0, 0, CARD_W, CARD_H, r);

    // Diagonal stripe pattern
    gfx.lineStyle(1, 0xffd700, 0.12);
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += 10) {
      gfx.beginPath();
      gfx.moveTo(i, 0);
      gfx.lineTo(i + CARD_H, CARD_H);
      gfx.strokePath();
    }

    // Inner border
    gfx.lineStyle(1, 0xffd700, 0.2);
    gfx.strokeRoundedRect(4, 4, CARD_W - 8, CARD_H - 8, Math.max(r - 2, 1));

    // Shine strip at top — same glass-like highlight as opponent cards
    gfx.fillStyle(0xffffff, 0.09);
    gfx.fillRoundedRect(4, 4, CARD_W - 8, CARD_H * 0.28, r);

    c.add(gfx);
    this.backContainer = c;
    this.add(c);
  }

  private buildFront(): void {
    const c = this.scene.add.container(-CARD_W / 2, -CARD_H);
    const r = this.borderRadius;
    const gfx = this.scene.add.graphics();

    // White card face
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRoundedRect(0, 0, CARD_W, CARD_H, r);
    gfx.lineStyle(1.5, 0x999999, 0.5);
    gfx.strokeRoundedRect(0, 0, CARD_W, CARD_H, r);
    c.add(gfx);

    if (this.faceData) {
      const col = this.faceData.color;

      // Top-left value
      const tlVal = this.scene.add.text(5, 5, this.faceData.value, {
        fontSize: "10px", color: col, fontFamily: "Arial", fontStyle: "bold",
      });
      tlVal.setOrigin(0, 0);

      // Top-left symbol (small)
      const tlSym = this.scene.add.text(5, 15, this.faceData.symbol, {
        fontSize: "9px", color: col, fontFamily: "Arial",
      });
      tlSym.setOrigin(0, 0);

      // Centre symbol (large)
      const centre = this.scene.add.text(CARD_W / 2, CARD_H / 2, this.faceData.symbol, {
        fontSize: "26px", color: col, fontFamily: "Arial",
      });
      centre.setOrigin(0.5, 0.5);

      c.add([tlVal, tlSym, centre]);
    }

    c.setVisible(false); // starts face-down
    this.frontContainer = c;
    this.add(c);
  }
}
