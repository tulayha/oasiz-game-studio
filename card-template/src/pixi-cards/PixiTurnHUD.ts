/**
 * PixiTurnHUD.ts
 * ──────────────
 * Name labels, card-count badges, turn glow ring, and player avatar for each slot.
 */

import { Container, Graphics, Sprite, Text, TextStyle, type Ticker } from "pixi.js";
import { loadAvatarTexture } from "./loadAvatarTexture";

type Slot = "local" | "A" | "B" | "C";

const AVATAR_SIZE = 28;

interface SlotInfo {
  x:     number;
  y:     number;
  label: Text;
  badge: Text;
  glow:  Graphics;
  avatarSprite: Sprite | null;
}

export class PixiTurnHUD extends Container {
  private slots: Partial<Record<Slot, SlotInfo>> = {};
  private activeSlot: Slot | null = null;
  private readonly ticker: Ticker;

  constructor(ticker: Ticker) {
    super();
    this.ticker = ticker;
  }

  // ── Setup ───────────────────────────────────────────────────────────────────

  registerSlot(slot: Slot, x: number, y: number): void {
    const label = this.makeText(12, 0.9);
    const badge = this.makeText(10, 0.65);
    const glow  = this.makeGlow();

    label.position.set(x, y);
    badge.position.set(x, y + 16);
    glow.position.set(x, y);

    this.addChild(glow, label, badge);

    this.slots[slot] = { x, y, label, badge, glow, avatarSprite: null };
  }

  /** Load and show player avatar from URL (Playroom avatar). Hides if url is null. */
  setPlayerAvatar(slot: Slot, url: string | null): void {
    const s = this.slots[slot];
    if (!s) return;
    if (s.avatarSprite) {
      this.removeChild(s.avatarSprite);
      s.avatarSprite.destroy();
      s.avatarSprite = null;
    }
    if (!url) return;
    loadAvatarTexture(url)
      .then((texture) => {
        const sprite = new Sprite({ texture });
        sprite.anchor.set(0.5);
        sprite.x = s.x;
        sprite.y = s.y - AVATAR_SIZE / 2 - 4;
        const scale = AVATAR_SIZE / texture.width;
        sprite.scale.set(scale);
        const labelIndex = this.getChildIndex(s.label);
        this.addChildAt(sprite, labelIndex);
        s.avatarSprite = sprite;
      })
      .catch(() => {
        console.log("[PixiTurnHUD] Failed to load avatar:", url);
      });
  }

  setPlayerName(slot: Slot, name: string): void {
    const s = this.slots[slot];
    if (!s) return;
    s.label.text = name;
    s.label.x    = s.x - s.label.width / 2;
  }

  setCardCount(slot: Slot, count: number): void {
    const s = this.slots[slot];
    if (!s) return;
    s.badge.text    = `${count} cards`;
    s.badge.visible = slot !== "local";
    s.badge.x       = s.x - s.badge.width / 2;
  }

  setSlotVisible(slot: Slot, visible: boolean): void {
    const s = this.slots[slot];
    if (!s) return;
    s.label.visible = visible;
    s.badge.visible = visible && slot !== "local";
    s.glow.visible  = visible && this.activeSlot === slot;
    if (s.avatarSprite) s.avatarSprite.visible = visible;
  }

  setActiveTurn(slot: Slot): void {
    const prev = this.activeSlot;
    this.activeSlot = slot;

    // Dim previous slot
    if (prev && prev !== slot) {
      const p = this.slots[prev];
      if (p) this.tweenAlpha(p.label, 0.4, 300);
    }

    // Pulse new slot
    const cur = this.slots[slot];
    if (cur) {
      this.tweenAlpha(cur.label, 1.0, 200);
      this.scalePulse(cur.label);
      this.showGlow(cur);
    }

    // Hide glow on others
    for (const [key, s] of Object.entries(this.slots) as [Slot, SlotInfo][]) {
      if (s && key !== slot) { s.glow.alpha = 0; s.glow.visible = false; }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private makeText(size: number, alpha: number): Text {
    const t = new Text({
      text:  "",
      style: new TextStyle({ fontSize: size, fill: 0xffffff, fontFamily: "Arial" }),
    });
    t.alpha = alpha;
    return t;
  }

  private makeGlow(): Graphics {
    const g = new Graphics();
    g.circle(0, 0, 36);
    g.stroke({ width: 2, color: 0xffff88, alpha: 0.8 });
    g.alpha   = 0;
    g.visible = false;
    return g;
  }

  private showGlow(s: SlotInfo): void {
    s.glow.visible = true;
    s.glow.x       = s.x;
    s.glow.y       = s.y - 16;

    let t = 0;
    const pulse = (delta: { deltaTime: number }) => {
      t += delta.deltaTime * 0.04;
      s.glow.alpha = 0.5 + 0.3 * Math.sin(t);
      if (this.activeSlot !== (Object.entries(this.slots) as [Slot, SlotInfo][]).find(([, v]) => v === s)?.[0]) {
        this.ticker.remove(pulse);
      }
    };
    this.ticker.add(pulse);
  }

  private tweenAlpha(obj: { alpha: number }, target: number, durationMs: number): void {
    const start = obj.alpha;
    let elapsed = 0;
    const tick  = (delta: { deltaTime: number }) => {
      elapsed  += (delta.deltaTime / 60) * 1000;
      const t   = Math.min(elapsed / durationMs, 1);
      obj.alpha = lerp(start, target, t);
      if (t >= 1) this.ticker.remove(tick);
    };
    this.ticker.add(tick);
  }

  private scalePulse(obj: { scale: { set(x: number, y: number): void } }): void {
    let t = 0;
    const tick = (delta: { deltaTime: number }) => {
      t += delta.deltaTime * 0.04;
      const s = 1 + 0.15 * Math.sin(t * Math.PI);
      obj.scale.set(s, s);
      if (t >= 1) {
        obj.scale.set(1, 1);
        this.ticker.remove(tick);
      }
    };
    this.ticker.add(tick);
  }
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
