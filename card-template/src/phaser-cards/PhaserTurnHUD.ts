/**
 * PhaserTurnHUD.ts
 * ─────────────────
 * Turn indicator overlay for all four player slots (local, A, B, C).
 *
 * Features:
 *  • Pulsing glow ring that moves to the active player's position
 *  • "YOUR TURN" flash banner when the local player's turn begins
 *  • Local player name + avatar pill anchored near the fan
 *  • All animations via scene.tweens — no GSAP / no external deps
 */

import Phaser from "phaser";
import { loadAvatarTexture } from "./loadAvatarTexture";

export type HudSlot = "local" | "A" | "B" | "C";

interface SlotRecord {
  x: number;
  y: number;
  visible: boolean;
}

const GLOW_RADIUS = 38;
const GLOW_COLOR_LOCAL = 0x00e676;   // green — it's YOUR turn
const GLOW_COLOR_OPP   = 0xffd700;   // gold  — opponent's turn

export class PhaserTurnHUD extends Phaser.GameObjects.Container {
  // ── Glow ring ───────────────────────────────────────────────────────────────
  private glowOuter!: Phaser.GameObjects.Graphics;
  private glowInner!: Phaser.GameObjects.Graphics;
  private glowTween: Phaser.Tweens.Tween | null = null;

  // ── "YOUR TURN" banner ──────────────────────────────────────────────────────
  private banner!: Phaser.GameObjects.Container;
  private bannerTween: Phaser.Tweens.Tween | null = null;

  // ── Local player pill ───────────────────────────────────────────────────────
  private localPill!: Phaser.GameObjects.Container;
  private localPillBg!: Phaser.GameObjects.Graphics;
  private localNameText!: Phaser.GameObjects.Text;
  private localAvatarKey: string | null = null;
  private localAvatarImg: Phaser.GameObjects.Image | null = null;

  // ── Slot registry ───────────────────────────────────────────────────────────
  private slots: Map<HudSlot, SlotRecord> = new Map([
    ["local", { x: 0, y: 0, visible: true }],
    ["A",     { x: 0, y: 0, visible: false }],
    ["B",     { x: 0, y: 0, visible: false }],
    ["C",     { x: 0, y: 0, visible: false }],
  ]);

  private activeSlot: HudSlot | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);

    this.buildGlow();
    this.buildBanner();
    this.buildLocalPill();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Update the screen position of a slot (call after layout calc). */
  setSlotPosition(slot: HudSlot, x: number, y: number): void {
    const rec = this.slots.get(slot);
    if (rec) { rec.x = x; rec.y = y; }
    if (slot === this.activeSlot) this.moveGlowTo(x, y);
    if (slot === "local") this.localPill.setPosition(x, y + 28);
  }

  showSlot(slot: HudSlot, visible: boolean): void {
    const rec = this.slots.get(slot);
    if (rec) rec.visible = visible;
  }

  setLocalPlayer(name: string, avatarUrl: string | null): void {
    this.localNameText.setText(name);
    this.refreshLocalPill();

    if (avatarUrl && avatarUrl !== this.localAvatarKey) {
      this.localAvatarKey = avatarUrl;
      loadAvatarTexture(this.scene, avatarUrl, "hud-local-avatar")
        .then((key) => {
          if (this.localAvatarImg) { this.localAvatarImg.destroy(); this.localAvatarImg = null; }
          const img = this.scene.add.image(-28, 0, key);
          img.setDisplaySize(22, 22);
          img.setOrigin(0.5, 0.5);
          this.localPill.add(img);
          this.localAvatarImg = img;
        })
        .catch(() => { /* avatar optional */ });
    }
  }

  /**
   * Move the glow ring to the given slot and animate it.
   * Pass null to hide the glow (e.g. game over).
   */
  setActiveTurn(slot: HudSlot | null): void {
    const prev = this.activeSlot;
    this.activeSlot = slot;

    if (!slot) {
      this.hideGlow();
      return;
    }

    const rec = this.slots.get(slot);
    if (!rec) return;

    const isLocal = slot === "local";
    this.moveGlowTo(rec.x, rec.y, isLocal);

    if (isLocal && prev !== "local") {
      this.flashYourTurn();
    }
  }

  /** Reposition local pill (call from scene onResize). */
  repositionLocal(x: number, y: number): void {
    this.setSlotPosition("local", x, y);
  }

  override destroy(fromScene?: boolean): void {
    this.glowTween?.remove();
    this.bannerTween?.remove();
    super.destroy(fromScene);
  }

  // ── Glow ring ───────────────────────────────────────────────────────────────

  private buildGlow(): void {
    this.glowOuter = this.scene.add.graphics();
    this.glowInner = this.scene.add.graphics();
    this.add([this.glowOuter, this.glowInner]);
    this.glowOuter.setAlpha(0);
    this.glowInner.setAlpha(0);
  }

  private moveGlowTo(x: number, y: number, isLocal = false): void {
    this.glowTween?.remove();
    this.glowTween = null;

    const color = isLocal ? GLOW_COLOR_LOCAL : GLOW_COLOR_OPP;

    this.glowOuter.clear();
    this.glowOuter.lineStyle(3, color, 0.35);
    this.glowOuter.strokeCircle(x, y, GLOW_RADIUS + 8);

    this.glowInner.clear();
    this.glowInner.lineStyle(2, color, 0.85);
    this.glowInner.strokeCircle(x, y, GLOW_RADIUS);

    // Bring to visible before pulsing
    this.glowOuter.setAlpha(0.6);
    this.glowInner.setAlpha(0.9);

    // Pulse loop
    this.glowTween = this.scene.tweens.add({
      targets: [this.glowOuter, this.glowInner],
      alpha: { from: 0.9, to: 0.25 },
      duration: 800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private hideGlow(): void {
    this.glowTween?.remove();
    this.glowTween = null;
    this.scene.tweens.add({
      targets: [this.glowOuter, this.glowInner],
      alpha: 0,
      duration: 200,
      ease: "Cubic.easeOut",
    });
  }

  // ── "YOUR TURN" banner ──────────────────────────────────────────────────────

  private buildBanner(): void {
    this.banner = this.scene.add.container(0, 0);
    this.banner.setAlpha(0);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x00e676, 0.92);
    bg.fillRoundedRect(-72, -18, 144, 36, 18);
    this.banner.add(bg);

    const txt = this.scene.add.text(0, 0, "YOUR TURN", {
      fontSize: "13px",
      color: "#000000",
      fontFamily: "Arial",
      fontStyle: "bold",
    });
    txt.setOrigin(0.5, 0.5);
    this.banner.add(txt);

    this.add(this.banner);
  }

  private flashYourTurn(): void {
    this.bannerTween?.remove();
    this.bannerTween = null;

    // Position above local fan area using local slot y
    const rec = this.slots.get("local")!;
    this.banner.setPosition(rec.x, rec.y - 60);
    this.banner.setScale(0.8);
    this.banner.setAlpha(0);

    this.bannerTween = this.scene.tweens.add({
      targets: this.banner,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Back.easeOut",
      onComplete: () => {
        this.scene.time.delayedCall(1000, () => {
          this.bannerTween = this.scene.tweens.add({
            targets: this.banner,
            alpha: 0,
            duration: 300,
            ease: "Cubic.easeIn",
          });
        });
      },
    });
  }

  // ── Local player pill ───────────────────────────────────────────────────────

  private buildLocalPill(): void {
    this.localPill = this.scene.add.container(0, 0);

    this.localPillBg = this.scene.add.graphics();
    this.localPill.add(this.localPillBg);

    this.localNameText = this.scene.add.text(0, 0, "", {
      fontSize: "11px",
      color: "#ffffff",
      fontFamily: "Arial",
      fontStyle: "bold",
    });
    this.localNameText.setOrigin(0.5, 0.5);
    this.localPill.add(this.localNameText);

    this.add(this.localPill);
  }

  private refreshLocalPill(): void {
    const PAD_X = 10;
    const PAD_Y = 5;
    const w = Math.max(this.localNameText.width + PAD_X * 2, 52);
    const h = this.localNameText.height + PAD_Y * 2;

    this.localPillBg.clear();
    this.localPillBg.fillStyle(0x000000, 0.6);
    this.localPillBg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.localPillBg.lineStyle(1, 0x00e676, 0.4);
    this.localPillBg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  }
}
