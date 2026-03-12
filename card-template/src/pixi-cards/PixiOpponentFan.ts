/**
 * PixiOpponentFan.ts
 * ──────────────────
 * Face-down card fan for one opponent slot (A = top, B = left, C = right).
 * For all slots the fan opens downward so cards sit below the name/character.
 * Animates card additions/removals and re-layouts via the shared Ticker.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Ticker } from "pixi.js";
import { loadAvatarTexture } from "./loadAvatarTexture";
import type { CardVisualConfig } from "../cards-core/types";
import { computeFanSlots, layoutCards } from "../cards-core/fanMath";
import { CARD_W, CARD_H } from "./PixiCard";

export type OpponentSlot = "A" | "B" | "C";

const SLOT_SCALE: Record<OpponentSlot, number> = { A: 0.5, B: 0.5, C: 0.5 };

const OPPONENT_AVATAR_SIZE = 32;

export class PixiOpponentFan extends Container {
  private backCards: Container[] = [];
  private nameLabel: Text;
  private badgeText: Text;
  private avatarSprite: Sprite | null = null;
  private readonly slot: OpponentSlot;
  private anchorX: number;
  private anchorY: number;
  private readonly scale_: number;
  private readonly config: CardVisualConfig;
  private readonly ticker: Ticker;

  constructor(
    slot: OpponentSlot,
    anchorX: number,
    anchorY: number,
    config: CardVisualConfig,
    ticker: Ticker,
  ) {
    super();
    this.slot = slot;
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.scale_ = SLOT_SCALE[slot];
    this.config = config;
    this.ticker = ticker;

    this.nameLabel = this.buildLabel(11);
    this.badgeText = this.buildLabel(10);
    this.badgeText.alpha = 0.7;

    this.positionLabels();
    this.visible = false;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setHandCount(n: number): void {
    const prev = this.backCards.length;

    if (n > prev) {
      for (let i = prev; i < n; i++) {
        const c = this.buildBackCard();
        c.alpha = 0;
        this.backCards.push(c);
        this.addChild(c);
        this.fadeIn(c);
      }
    } else if (n < prev) {
      for (let i = prev - 1; i >= n; i--) {
        const c = this.backCards[i];
        this.fadeOut(c, () => {
          this.removeChild(c);
          c.destroy();
        });
      }
      this.backCards.splice(n);
    }

    this.relayout();
    this.badgeText.text = String(n);
  }

  setPlayerName(name: string): void {
    this.nameLabel.text = name;
    this.positionLabels();
  }

  /** Load and show player avatar from URL (Playroom avatar). Hides if url is null. */
  setPlayerAvatar(url: string | null): void {
    if (this.avatarSprite) {
      this.removeChild(this.avatarSprite);
      this.avatarSprite.destroy();
      this.avatarSprite = null;
    }
    if (!url) return;
    loadAvatarTexture(url)
      .then((texture) => {
        const sprite = new Sprite({ texture });
        sprite.anchor.set(0.5);
        const scale = OPPONENT_AVATAR_SIZE / texture.width;
        sprite.scale.set(scale);
        sprite.x = this.anchorX;
        sprite.y = this.anchorY - 50 - OPPONENT_AVATAR_SIZE / 2 - 4;
        this.addChildAt(sprite, 0);
        this.avatarSprite = sprite;
      })
      .catch(() => {
        console.log("[PixiOpponentFan] Failed to load avatar:", url);
      });
  }

  showSlot(show: boolean): void {
    this.visible = show;
    this.nameLabel.visible = show;
    this.badgeText.visible = show;
    if (this.avatarSprite) this.avatarSprite.visible = show;
  }

  reposition(anchorX: number, anchorY: number): void {
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.relayout();
    this.positionLabels();
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private relayout(): void {
    const cardH = CARD_H * this.scale_;
    const radius = cardH * 2.2;

    const raw = computeFanSlots(this.backCards.length, this.anchorX, this.anchorY, radius);
    const slots = layoutCards(raw, "opponent");

    for (let i = 0; i < this.backCards.length; i++) {
      const s = slots[i];
      if (!s) continue;
      const c = this.backCards[i];
      c.x = s.x;
      c.y = s.y;
      c.rotation = s.rotation;
      c.scale.set(this.scale_);
    }
  }

  private positionLabels(): void {
    /* Name/badge above anchor so fan sits below character for all slots. */
    const offsetY = -50;
    this.nameLabel.x = this.anchorX - this.nameLabel.width / 2;
    this.nameLabel.y = this.anchorY + offsetY;
    this.badgeText.x = this.anchorX - this.badgeText.width / 2;
    this.badgeText.y = this.nameLabel.y + 14;
  }

  // ── Animations ──────────────────────────────────────────────────────────────

  private fadeIn(c: Container): void {
    const tick = (delta: { deltaTime: number }) => {
      c.alpha = Math.min(1, c.alpha + delta.deltaTime * 0.06);
      if (c.alpha >= 1) this.ticker.remove(tick);
    };
    this.ticker.add(tick);
  }

  private fadeOut(c: Container, onDone: () => void): void {
    const tick = (delta: { deltaTime: number }) => {
      c.alpha = Math.max(0, c.alpha - delta.deltaTime * 0.1);
      if (c.alpha <= 0) {
        this.ticker.remove(tick);
        onDone();
      }
    };
    this.ticker.add(tick);
  }

  // ── Card drawing ────────────────────────────────────────────────────────────

  private buildBackCard(): Container {
    const c = new Container();
    const g = new Graphics();
    const r = this.config.borderRadius;

    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.fill({ color: this.config.backColor });
    g.roundRect(0, 0, CARD_W, CARD_H, r);
    g.stroke({ width: 1.5, color: 0xffd700, alpha: 0.7 });

    g.setStrokeStyle({ width: 1, color: 0xffd700, alpha: 0.12 });
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += 10) {
      g.moveTo(i, 0);
      g.lineTo(i + CARD_H, CARD_H);
      g.stroke();
    }

    c.addChild(g);
    c.pivot.set(CARD_W / 2, CARD_H);
    return c;
  }

  private buildLabel(size: number): Text {
    const t = new Text({
      text: "",
      style: new TextStyle({ fontSize: size, fill: 0xffffff, fontFamily: "Arial" }),
    });
    t.alpha = 0.9;
    this.addChild(t);
    return t;
  }
}
