/**
 * CardBootScene.ts
 * ────────────────
 * Generates shared RenderTextures before the main scene starts:
 *   "card-back"  — rounded rect using visualConfig.backColor
 *   "card-felt"  — solid fill using visualConfig.backgroundColor
 *
 * Immediately transitions to CardGameScene when done.
 */

import Phaser from "phaser";
import type { CardVisualConfig } from "../../cards-core/types";
import { CARD_W, CARD_H } from "../constants";

export class CardBootScene extends Phaser.Scene {
  constructor() {
    super({ key: "CardBootScene" });
  }

  create(): void {
    const visualConfig = this.registry.get("visualConfig") as CardVisualConfig;
    this.generateCardBackTexture(visualConfig);
    this.generateFeltTexture(visualConfig);
    this.scene.start("CardGameScene");
  }

  private generateCardBackTexture(cfg: CardVisualConfig): void {
    const r = cfg.borderRadius ?? 6;
    const gfx = this.make.graphics({ x: 0, y: 0 });

    // Drop shadow
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillRoundedRect(2, 3, CARD_W, CARD_H, r);

    // Card back fill
    gfx.fillStyle(cfg.backColor, 1);
    gfx.fillRoundedRect(0, 0, CARD_W, CARD_H, r);

    // Gold border
    gfx.lineStyle(1.5, 0xffd700, 0.75);
    gfx.strokeRoundedRect(0, 0, CARD_W, CARD_H, r);

    // Diagonal stripe pattern
    gfx.lineStyle(1, 0xffd700, 0.1);
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += 10) {
      gfx.beginPath();
      gfx.moveTo(i, 0);
      gfx.lineTo(i + CARD_H, CARD_H);
      gfx.strokePath();
    }

    // Inner border
    gfx.lineStyle(1, 0xffd700, 0.2);
    gfx.strokeRoundedRect(4, 4, CARD_W - 8, CARD_H - 8, Math.max(r - 2, 1));

    // Shine strip at top
    gfx.fillStyle(0xffffff, 0.09);
    gfx.fillRoundedRect(4, 4, CARD_W - 8, CARD_H * 0.28, r);

    const rt = this.add.renderTexture(0, 0, CARD_W + 4, CARD_H + 4);
    rt.draw(gfx, 0, 0);
    rt.saveTexture("card-back");
    gfx.destroy();
    rt.destroy();
  }

  private generateFeltTexture(cfg: CardVisualConfig): void {
    const W = 64;
    const H = 64;
    const gfx = this.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(cfg.backgroundColor, 1);
    gfx.fillRect(0, 0, W, H);

    const rt = this.add.renderTexture(0, 0, W, H);
    rt.draw(gfx, 0, 0);
    rt.saveTexture("card-felt");
    gfx.destroy();
    rt.destroy();
  }
}
