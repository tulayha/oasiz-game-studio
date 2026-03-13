/**
 * PixiTurnHUD.ts
 * ──────────────
 * Name labels, card-count badges, turn glow ring, and player avatar for each slot.
 * All animations driven by GSAP (no Pixi ticker).
 */

import { Container, Graphics, Sprite, Text, TextStyle } from "pixi.js";
import { gsap } from "gsap";
import { loadAvatarTexture } from "./loadAvatarTexture";
import { ANIM, EASE } from "./gsapPixi";

type Slot = "local" | "A" | "B" | "C";

const AVATAR_SIZE = 28;

interface SlotInfo {
  x:            number;
  y:            number;
  label:        Text;
  badge:        Text;
  glow:         Graphics;
  avatarSprite: Sprite | null;
}

export class PixiTurnHUD extends Container {
  private slots:      Partial<Record<Slot, SlotInfo>> = {};
  private activeSlot: Slot | null = null;

  constructor() {
    super();
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

  /** Load and show player avatar. Hides if url is null. */
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

    // Dim the outgoing slot
    if (prev && prev !== slot) {
      const p = this.slots[prev];
      if (p) gsap.to(p.label, { alpha: 0.4, duration: ANIM.HUD_ALPHA, ease: EASE.OUT });
    }

    // Brighten + pulse the incoming slot
    const cur = this.slots[slot];
    if (cur) {
      gsap.to(cur.label, { alpha: 1.0, duration: ANIM.HUD_ALPHA, ease: EASE.OUT });
      gsap.fromTo(
        cur.label.scale,
        { x: 1,    y: 1    },
        { x: 1.15, y: 1.15, duration: 0.25, ease: "power2.inOut", yoyo: true, repeat: 1 },
      );
      this.showGlow(cur);
    }

    // Kill glow on all other slots
    for (const [key, s] of Object.entries(this.slots) as [Slot, SlotInfo][]) {
      if (s && key !== slot) {
        gsap.killTweensOf(s.glow);
        s.glow.alpha   = 0;
        s.glow.visible = false;
      }
    }
  }

  override destroy(): void {
    for (const s of Object.values(this.slots) as (SlotInfo | undefined)[]) {
      if (!s) continue;
      gsap.killTweensOf(s.label);
      gsap.killTweensOf(s.glow);
      if (s.avatarSprite) gsap.killTweensOf(s.avatarSprite);
    }
    super.destroy({ children: true });
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
    gsap.killTweensOf(s.glow);
    // Fade in, then start infinite sine pulse
    gsap.fromTo(s.glow, { alpha: 0 }, {
      alpha:    0.8,
      duration: 0.2,
      ease:     EASE.OUT,
      onComplete: () => {
        if (s.glow.visible) {
          gsap.to(s.glow, { alpha: 0.4, duration: ANIM.GLOW_PULSE, yoyo: true, repeat: -1, ease: EASE.SINE });
        }
      },
    });
  }
}
