/**
 * PixiTable.ts
 * ────────────
 * Renders the felt surface, deck stack, and active play zones.
 * Reads config.zones so it works for any game layout (UNO, Poker, Blackjack…).
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { oasiz } from "@oasiz/sdk";
import type { CardFace, TableConfig, TableZone } from "../cards-core/types";

export class PixiTable extends Container {
  private deckCtr!:       Container;
  private discardCtr!:    Container;
  private deckCountLbl!:  Text;
  private zones:          TableZone[] = [];
  private readonly config: TableConfig;

  private _deckCX = 0;   // deck center X (for animations)
  private _deckCY = 0;

  /** Called when user taps the deck. */
  onDrawRequest?: () => void;

  constructor(config: TableConfig) {
    super();
    this.config = config;
  }

  get deckCenterX(): number { return this._deckCX; }
  get deckCenterY(): number { return this._deckCY; }

  // ── Init / Reposition ───────────────────────────────────────────────────────

  init(zones: TableZone[]): void {
    this.zones = zones;
    this.build();
  }

  reposition(zones: TableZone[]): void {
    this.zones = zones;
    this.removeChildren();
    this.build();
  }

  // ── State updates ───────────────────────────────────────────────────────────

  setDeckInteractable(v: boolean): void {
    if (!this.deckCtr) return;
    this.deckCtr.eventMode = v ? "static" : "none";
    this.deckCtr.cursor    = v ? "pointer" : "default";
  }

  updateDiscardPile(card: CardFace | null): void {
    if (!this.discardCtr) return;
    this.discardCtr.removeChildren();
    const zone = this.zones.find(z => z.key === "discard");
    if (!zone) return;

    const r = this.config.visualConfig.borderRadius;
    const g = new Graphics();

    if (!card) {
      g.roundRect(0, 0, 56, 80, r);
      g.stroke({ width: 1.5, color: 0x888888, alpha: 0.4 });
      this.discardCtr.addChild(g);
      return;
    }

    const col = parseInt(card.color.replace("#", ""), 16);
    g.roundRect(0, 0, 56, 80, r);
    g.fill({ color: 0xffffff });
    g.roundRect(0, 0, 56, 80, r);
    g.stroke({ width: 2, color: col, alpha: 0.8 });
    this.discardCtr.addChild(g);

    const sym = new Text({
      text:  card.symbol,
      style: new TextStyle({ fontSize: 28, fill: col, fontFamily: "Arial" }),
    });
    sym.anchor.set(0.5, 0.5);
    sym.position.set(28, 40);
    this.discardCtr.addChild(sym);

    const val = new Text({
      text:  card.value,
      style: new TextStyle({ fontSize: 10, fill: col, fontFamily: "Arial", fontWeight: "bold" }),
    });
    val.position.set(4, 3);
    this.discardCtr.addChild(val);
  }

  updateDeckCount(n: number): void {
    if (this.deckCountLbl) this.deckCountLbl.text = String(n);
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  private build(): void {
    this.drawFelt();

    for (const zone of this.zones) {
      if (zone.key === "deck")    this.buildDeck(zone);
      else if (zone.key === "discard") this.buildDiscard(zone);
      else                             this.buildGenericZone(zone);
    }
  }

  private drawFelt(): void {
    if (this.zones.length === 0) return;
    const xs = this.zones.map(z => z.x);
    const ys = this.zones.map(z => z.y);
    const x1 = Math.min(...xs) - 16;
    const y1 = Math.min(...ys) - 16;
    const x2 = Math.max(...xs) + 72;
    const y2 = Math.max(...ys) + 96;

    const g = new Graphics();
    g.roundRect(x1, y1, x2 - x1, y2 - y1, 20);
    g.fill({ color: this.config.visualConfig.backgroundColor, alpha: 0.92 });
    this.addChild(g);
  }

  private buildDeck(zone: TableZone): void {
    const c = new Container();
    const r = this.config.visualConfig.borderRadius;

    // Stack shadow layers
    for (let i = 3; i >= 1; i--) {
      const g = new Graphics();
      g.roundRect(i * 0.8, -i * 0.8, 56, 80, r);
      g.fill({ color: this.config.visualConfig.backColor });
      g.roundRect(i * 0.8, -i * 0.8, 56, 80, r);
      g.stroke({ width: 1, color: 0xffd700, alpha: 0.35 });
      c.addChild(g);
    }

    // Top card
    const top = new Graphics();
    top.roundRect(0, 0, 56, 80, r);
    top.fill({ color: this.config.visualConfig.backColor });
    top.roundRect(0, 0, 56, 80, r);
    top.stroke({ width: 1.5, color: 0xffd700, alpha: 0.8 });
    c.addChild(top);

    // Count label
    this.deckCountLbl = new Text({
      text:  String(this.config.deck.totalCount),
      style: new TextStyle({ fontSize: 12, fill: 0xffd700, fontFamily: "Arial", fontWeight: "bold" }),
    });
    this.deckCountLbl.anchor.set(0.5, 0.5);
    this.deckCountLbl.position.set(28, 40);
    c.addChild(this.deckCountLbl);

    // Hit area + interaction
    const hit = new Graphics();
    hit.rect(0, 0, 56, 80);
    hit.fill({ color: 0x000000, alpha: 0 });
    c.addChild(hit);

    c.position.set(zone.x, zone.y);
    c.eventMode = "static";
    c.cursor    = "pointer";
    c.on("pointerdown", () => {
      oasiz.triggerHaptic("medium");
      this.onDrawRequest?.();
    });

    this._deckCX = zone.x + 28;
    this._deckCY = zone.y + 40;

    this.deckCtr = c;
    this.addChild(c);
  }

  private buildDiscard(zone: TableZone): void {
    const c = new Container();
    c.position.set(zone.x, zone.y);
    this.discardCtr = c;
    this.addChild(c);
    this.updateDiscardPile(null);
  }

  private buildGenericZone(zone: TableZone): void {
    // Placeholder for community cards, pot, etc.
    const g = new Graphics();
    g.roundRect(zone.x, zone.y, 56, 80, this.config.visualConfig.borderRadius);
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.15 });
    this.addChild(g);

    if (zone.label) {
      const lbl = new Text({
        text:  zone.label,
        style: new TextStyle({ fontSize: 10, fill: 0xffffff, fontFamily: "Arial" }),
      });
      lbl.alpha = 0.5;
      lbl.anchor.set(0.5, 0);
      lbl.position.set(zone.x + 28, zone.y + 84);
      this.addChild(lbl);
    }
  }
}
