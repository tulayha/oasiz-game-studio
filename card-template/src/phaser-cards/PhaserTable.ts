/**
 * PhaserTable.ts
 * ──────────────
 * Renders the felt surface, deck stack, and discard zone.
 * Extends Phaser.GameObjects.Container so it slots directly into a layer container
 * or the scene display list.
 *
 * Public API mirrors PixiTable for drop-in parity:
 *   setDeckInteractable(v)      — enable/disable deck tap
 *   updateDiscardPile(card)     — redraw discard with card face or empty state
 *   updateDeckCount(n)          — update count label
 *   reposition(zones)           — rebuild after resize
 *   deckCenterX / deckCenterY   — animation targets for fly cards
 *   onDrawRequest               — callback fired on deck tap
 */

import Phaser from "phaser";
import type { CardFace, TableConfig, TableZone } from "../cards-core/types";
import { CARD_W, CARD_H } from "./constants";

export class PhaserTable extends Phaser.GameObjects.Container {
  private deckContainer!: Phaser.GameObjects.Container;
  private discardContainer!: Phaser.GameObjects.Container;
  private deckCountText!: Phaser.GameObjects.Text;

  private _deckCX = 0;
  private _deckCY = 0;
  private _deckActive = true;

  private _deckZone: TableZone | null = null;
  private zones: TableZone[];
  private readonly config: TableConfig;

  /** Called by CardGameScene when a pointerdown hits the deck zone. */
  onDrawRequest?: () => void;

  get deckCenterX(): number { return this._deckCX; }
  get deckCenterY(): number { return this._deckCY; }

  constructor(scene: Phaser.Scene, zones: TableZone[], config: TableConfig) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.zones = zones;
    this.config = config;
    this.build();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Enable / disable deck hit testing. Visual stays the same. */
  setDeckInteractable(active: boolean): void {
    this._deckActive = active;
  }

  /**
   * Returns true if (x, y) is inside the deck zone and the deck is active.
   * Used by CardGameScene's scene-level pointerdown handler.
   */
  containsPoint(x: number, y: number): boolean {
    if (!this._deckActive || !this._deckZone) return false;
    const z = this._deckZone;
    return x >= z.x && x <= z.x + CARD_W && y >= z.y && y <= z.y + CARD_H;
  }

  updateDiscardPile(card: CardFace | null): void {
    if (!this.discardContainer) return;
    this.discardContainer.removeAll(true);

    const r = this.config.visualConfig.borderRadius;
    const gfx = this.scene.add.graphics();

    if (!card) {
      gfx.lineStyle(1.5, 0x888888, 0.4);
      gfx.strokeRoundedRect(0, 0, CARD_W, CARD_H, r);
      this.discardContainer.add(gfx);
      return;
    }

    const col = parseInt(card.color.replace("#", ""), 16);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillRoundedRect(0, 0, CARD_W, CARD_H, r);
    gfx.lineStyle(2, col, 0.8);
    gfx.strokeRoundedRect(0, 0, CARD_W, CARD_H, r);
    this.discardContainer.add(gfx);

    const sym = this.scene.add.text(CARD_W / 2, CARD_H / 2, card.symbol, {
      fontSize: "28px",
      color: card.color,
      fontFamily: "Arial",
    });
    sym.setOrigin(0.5, 0.5);
    this.discardContainer.add(sym);

    const val = this.scene.add.text(4, 3, card.value, {
      fontSize: "10px",
      color: card.color,
      fontFamily: "Arial",
      fontStyle: "bold",
    });
    val.setOrigin(0, 0);
    this.discardContainer.add(val);
  }

  updateDeckCount(n: number): void {
    if (this.deckCountText) this.deckCountText.setText(String(n));
  }

  reposition(zones: TableZone[]): void {
    this.zones = zones;
    this.removeAll(true);
    this.build();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  private build(): void {
    this.drawFelt();
    for (const zone of this.zones) {
      if (zone.key === "deck") this.buildDeck(zone);
      else if (zone.key === "discard") this.buildDiscard(zone);
      else this.buildGenericZone(zone);
    }
  }

  private drawFelt(): void {
    if (this.zones.length === 0) return;
    const xs = this.zones.map((z) => z.x);
    const ys = this.zones.map((z) => z.y);
    const x1 = Math.min(...xs) - 16;
    const y1 = Math.min(...ys) - 16;
    const x2 = Math.max(...xs) + CARD_W + 16;
    const y2 = Math.max(...ys) + CARD_H + 16;

    const gfx = this.scene.add.graphics();
    gfx.fillStyle(this.config.visualConfig.backgroundColor, 0.92);
    gfx.fillRoundedRect(x1, y1, x2 - x1, y2 - y1, 20);
    this.add(gfx);
  }

  private buildDeck(zone: TableZone): void {
    this._deckZone = zone;

    const ctr = this.scene.add.container(zone.x, zone.y);
    const r = this.config.visualConfig.borderRadius;
    const backColor = this.config.visualConfig.backColor;

    // Stack shadow layers (3 offset cards behind the top)
    for (let i = 3; i >= 1; i--) {
      const g = this.scene.add.graphics();
      g.fillStyle(backColor, 1);
      g.fillRoundedRect(i * 0.8, -i * 0.8, CARD_W, CARD_H, r);
      g.lineStyle(1, 0xffd700, 0.35);
      g.strokeRoundedRect(i * 0.8, -i * 0.8, CARD_W, CARD_H, r);
      ctr.add(g);
    }

    // Top card face
    const top = this.scene.add.graphics();
    top.fillStyle(backColor, 1);
    top.fillRoundedRect(0, 0, CARD_W, CARD_H, r);
    top.lineStyle(1.5, 0xffd700, 0.8);
    top.strokeRoundedRect(0, 0, CARD_W, CARD_H, r);
    ctr.add(top);

    // Count label
    this.deckCountText = this.scene.add.text(CARD_W / 2, CARD_H / 2, String(this.config.deck.totalCount), {
      fontSize: "12px",
      color: "#ffd700",
      fontFamily: "Arial",
      fontStyle: "bold",
    });
    this.deckCountText.setOrigin(0.5, 0.5);
    ctr.add(this.deckCountText);

    // No setInteractive — CardGameScene uses containsPoint() for manual hit testing

    this._deckCX = zone.x + CARD_W / 2;
    this._deckCY = zone.y + CARD_H / 2;

    this.deckContainer = ctr;
    this.add(ctr);
  }

  private buildDiscard(zone: TableZone): void {
    const ctr = this.scene.add.container(zone.x, zone.y);
    this.discardContainer = ctr;
    this.add(ctr);
    this.updateDiscardPile(null);
  }

  private buildGenericZone(zone: TableZone): void {
    const r = this.config.visualConfig.borderRadius;
    const gfx = this.scene.add.graphics();
    gfx.lineStyle(1, 0xffffff, 0.15);
    gfx.strokeRoundedRect(zone.x, zone.y, CARD_W, CARD_H, r);
    this.add(gfx);

    if (zone.label) {
      const lbl = this.scene.add.text(zone.x + CARD_W / 2, zone.y + CARD_H + 4, zone.label, {
        fontSize: "10px",
        color: "#ffffff",
        fontFamily: "Arial",
      });
      lbl.setOrigin(0.5, 0);
      lbl.setAlpha(0.5);
      this.add(lbl);
    }
  }
}
