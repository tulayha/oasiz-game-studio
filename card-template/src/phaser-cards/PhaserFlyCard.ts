/**
 * PhaserFlyCard.ts
 * ─────────────────
 * Transient card spawned during draw and throw animations.
 * Created at the source position, tweened to target via Phaser tweens, then destroyed.
 *
 * Origin sits at bottom-center (children offset to -CARD_W/2, -CARD_H),
 * matching PhaserCard's pivot convention so rotations look consistent.
 *
 * The caller is responsible for adding this to the fly layer:
 *   flyLayer.add(flyCard)
 */

import Phaser from "phaser";
import { CARD_W, CARD_H } from "./constants";
import { ANIM, EASE } from "./anim";

export class PhaserFlyCard extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    backColor: number,
    borderRadius: number,
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.draw(backColor, borderRadius);
  }

  /**
   * Tween this card to (targetX, targetY) with optional rotation (radians),
   * then call onComplete and destroy self.
   */
  flyTo(
    targetX: number,
    targetY: number,
    targetRotation: number,
    durationMs: number,
    onComplete: () => void,
  ): void {
    this.scene.tweens.killTweensOf(this);

    // Punch-out scale at launch — card "pops" off the source
    this.setScale(1.12);

    this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      rotation: targetRotation,
      scaleX: 1,
      scaleY: 1,
      duration: durationMs,
      ease: EASE.FLY,
      onComplete: () => {
        onComplete();
        this.destroy();
      },
    });
  }

  override destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf(this);
    super.destroy(fromScene);
  }

  private draw(backColor: number, r: number): void {
    // Use the pre-baked texture from CardBootScene when available — single draw call,
    // consistent look with hand cards, no per-fly-card Graphics overhead.
    if (this.scene.textures.exists("card-back")) {
      const img = this.scene.add.image(-CARD_W / 2, -CARD_H, "card-back");
      img.setOrigin(0, 0);
      this.add(img);
      return;
    }

    // Fallback: draw inline if texture isn't ready (shouldn't happen after CardBootScene)
    const gfx = this.scene.add.graphics();
    gfx.setPosition(-CARD_W / 2, -CARD_H);

    gfx.fillStyle(0x000000, 0.3);
    gfx.fillRoundedRect(2, 3, CARD_W, CARD_H, r);

    gfx.fillStyle(backColor, 1);
    gfx.fillRoundedRect(0, 0, CARD_W, CARD_H, r);

    gfx.lineStyle(1.5, 0xffd700, 0.75);
    gfx.strokeRoundedRect(0, 0, CARD_W, CARD_H, r);

    gfx.lineStyle(1, 0xffd700, 0.1);
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += 10) {
      gfx.beginPath();
      gfx.moveTo(i, 0);
      gfx.lineTo(i + CARD_H, CARD_H);
      gfx.strokePath();
    }

    gfx.fillStyle(0xffffff, 0.09);
    gfx.fillRoundedRect(4, 4, CARD_W - 8, CARD_H * 0.28, r);

    this.add(gfx);
  }
}

// ── Convenience factory ────────────────────────────────────────────────────────

/**
 * Spawn a fly card at (fromX, fromY), add it to flyLayer, tween to target, then remove.
 * Mirrors the pattern in PixiLocalFan for drop-in parity.
 */
export function spawnFlyCard(
  scene: Phaser.Scene,
  flyLayer: Phaser.GameObjects.Container,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  toRotation: number,
  backColor: number,
  borderRadius: number,
  onComplete: () => void,
): void {
  const fly = new PhaserFlyCard(scene, fromX, fromY, backColor, borderRadius);
  flyLayer.add(fly);
  fly.flyTo(toX, toY, toRotation, ANIM.FLY, () => {
    flyLayer.remove(fly, true);
    onComplete();
  });
}
