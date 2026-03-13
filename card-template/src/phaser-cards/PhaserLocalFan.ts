/**
 * PhaserLocalFan.ts
 * ─────────────────
 * Interactive face-up carousel fan for the local player (bottom of screen).
 *
 * Swipeable carousel: horizontal swipe/drag scrolls the carousel (no arrow buttons).
 * Drag a card upward to throw it (triggers onCardTap).
 * On pointer down we wait for first move: horizontal → scroll, vertical up on card → throw.
 *
 * All animations driven by Phaser scene.tweens — no GSAP dependency.
 */

import Phaser from "phaser";
import { oasiz } from "@oasiz/sdk";
import { CardAction, type CardFace, type CardVisualConfig } from "../cards-core/types";
import { computeFanSlots, layoutCards } from "../cards-core/fanMath";
import { PhaserCard } from "./PhaserCard";
import { PhaserFlyCard } from "./PhaserFlyCard";
import { CARD_W, CARD_H } from "./constants";
import { ANIM, EASE } from "./anim";

const MAX_VISIBLE = 6;
const GESTURE_THRESHOLD = 10;
const SCROLL_PIXEL_THRESHOLD = 50;

export class PhaserLocalFan extends Phaser.GameObjects.Container {
  private cards: PhaserCard[] = [];
  /** Index of the first visible card in this.cards[]. */
  private viewOffset = 0;

  private centerX: number;
  private centerY: number;
  private radius: number;
  private config: CardVisualConfig;
  private flyLayer: Phaser.GameObjects.Container;
  private interactable = true;

  private leftArrow!: Phaser.GameObjects.Container;
  private rightArrow!: Phaser.GameObjects.Container;

  /** Delayed-call handle for post-layout interactivity finalizer. */
  private _layoutTimer: Phaser.Time.TimerEvent | null = null;

  /** Called with absolute hand index + face when the user throws a card. */
  onCardTap?: (index: number, face: CardFace) => void;

  // ── Drag state ──────────────────────────────────────────────────────────────
  private _highlightedCard: PhaserCard | null = null;
  private _draggingCard: PhaserCard | null = null;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStartGlobalX = 0;
  private _dragStartGlobalY = 0;
  private readonly THROW_THRESHOLD = 70;

  // ── Gesture: scroll vs throw ────────────────────────────────────────────────
  private _pointerDownX = 0;
  private _pointerDownY = 0;
  private _isPointerDown = false;
  private _pointerCardAtDown: PhaserCard | null = null;
  private _gestureMode: "idle" | "scroll" | "throw" = "idle";
  private _gestureDecided = false;
  private _accScrollDelta = 0;
  private _lastGlobalX = 0;

  constructor(
    scene: Phaser.Scene,
    centerX: number,
    centerY: number,
    radius: number,
    config: CardVisualConfig,
    flyLayer: Phaser.GameObjects.Container,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);

    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.config = config;
    this.flyLayer = flyLayer;

    this.buildArrows();
  }

  // ── Arrow indicators ────────────────────────────────────────────────────────

  private buildArrows(): void {
    this.leftArrow = this.makeArrow("left");
    this.rightArrow = this.makeArrow("right");
    this.add([this.leftArrow, this.rightArrow]);
    this.syncArrows();
  }

  private makeArrow(side: "left" | "right"): Phaser.GameObjects.Container {
    const c = this.scene.add.container(0, 0);

    const bg = this.scene.add.graphics();
    c.add(bg);

    const arrowText = this.scene.add.text(0, 0, side === "left" ? "<" : ">", {
      fontSize: "13px", color: "#ffffff", fontFamily: "Arial", fontStyle: "bold",
    });
    arrowText.setOrigin(0.5, 0.5);
    c.add(arrowText);

    const countText = this.scene.add.text(0, 0, "0", {
      fontSize: "11px", color: "#ffd700", fontFamily: "Arial", fontStyle: "bold",
    });
    countText.setOrigin(0.5, 0.5);
    c.add(countText);

    // Store refs as custom props for later update
    (c as unknown as Record<string, unknown>)._bg = bg;
    (c as unknown as Record<string, unknown>)._arrowText = arrowText;
    (c as unknown as Record<string, unknown>)._countText = countText;

    // No setInteractive — hit-tested manually in handlePointerDown()
    return c;
  }

  private refreshArrow(
    c: Phaser.GameObjects.Container,
    side: "left" | "right",
    count: number,
  ): void {
    c.setVisible(false);
    if (count === 0) return;

    const PILL_W = 52;
    const PILL_H = 30;
    const ARROW_OFF = 10;
    const COUNT_OFF = 10;

    const refs = c as unknown as {
      _bg: Phaser.GameObjects.Graphics;
      _arrowText: Phaser.GameObjects.Text;
      _countText: Phaser.GameObjects.Text;
    };

    refs._bg.clear();
    refs._bg.fillStyle(0x000000, 0.6);
    refs._bg.fillRoundedRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H, PILL_H / 2);
    refs._bg.lineStyle(1.5, 0xffffff, 0.25);
    refs._bg.strokeRoundedRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H, PILL_H / 2);

    if (side === "left") {
      refs._arrowText.setPosition(-ARROW_OFF, 0);
      refs._countText.setPosition(COUNT_OFF, 0);
    } else {
      refs._countText.setPosition(-COUNT_OFF, 0);
      refs._arrowText.setPosition(ARROW_OFF, 0);
    }
    refs._countText.setText(String(count));
  }

  private syncArrows(): void {
    const leftCount = this.viewOffset;
    const rightCount = Math.max(0, this.cards.length - this.viewOffset - MAX_VISIBLE);

    this.refreshArrow(this.leftArrow, "left", leftCount);
    this.refreshArrow(this.rightArrow, "right", rightCount);

    const halfSpread = this.fanHalfSpread();
    const MARGIN = 38;
    const arrowY = this.centerY - CARD_H * 0.55;

    this.leftArrow.setPosition(this.centerX - halfSpread - MARGIN, arrowY);
    this.rightArrow.setPosition(this.centerX + halfSpread + MARGIN, arrowY);
  }

  private fanHalfSpread(): number {
    const n = Math.min(this.cards.length, MAX_VISIBLE);
    if (n <= 1) return CARD_W * 0.5;
    const stepX = 100 / n;
    return ((n - 1) * stepX) / 2 + CARD_W * 0.5;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Animate a card flying in from (deckX, deckY) and add it to the hand. */
  addCard(face: CardFace, deckX: number, deckY: number, onComplete?: () => void): void {
    const newIdx = this.cards.length;
    const newCount = newIdx + 1;

    // Auto-scroll right so the new card is always in view
    const maxOffset = Math.max(0, newCount - MAX_VISIBLE);
    this.viewOffset = maxOffset;

    const visibleIdx = newIdx - this.viewOffset;
    const visibleCount = Math.min(newCount, MAX_VISIBLE);
    const raw = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots = layoutCards(raw, "local");
    const target = slots[visibleIdx] ?? {
      x: this.centerX + window.innerWidth * 0.8,
      y: this.centerY,
      rotation: 0,
    };

    const fly = new PhaserFlyCard(this.scene, deckX, deckY, this.config.backColor, this.config.borderRadius);
    this.flyLayer.add(fly);

    fly.flyTo(target.x, target.y, target.rotation, ANIM.FLY, () => {
      const card = this.makeCard(face);
      card.setPosition(target.x, target.y);
      card.setRotation(target.rotation);
      card.flip(true, true);
      this.cards.push(card);
      this.add(card);

      this.tweenToLayout(this.cards.length);
      this.syncArrows();
      onComplete?.();
    });
  }

  /** Animate card at absolute index flying to (discardX, discardY), remove from hand. */
  throwCard(index: number, discardX: number, discardY: number, onComplete?: () => void): void {
    if (index < 0 || index >= this.cards.length) return;

    const card = this.cards[index]!;
    this.cards.splice(index, 1);
    this.remove(card, false); // don't destroy yet — need its position

    const worldX = card.x;
    const worldY = card.y;

    const fly = new PhaserFlyCard(
      this.scene, worldX, worldY,
      this.config.backColor, this.config.borderRadius,
    );
    fly.setRotation(card.rotation);
    this.flyLayer.add(fly);

    card.destroy();

    fly.flyTo(discardX, discardY, 0, ANIM.FLY, () => {
      onComplete?.();
    });

    this.viewOffset = Math.min(this.viewOffset, Math.max(0, this.cards.length - MAX_VISIBLE));
    this.tweenToLayout(this.cards.length);
    this.syncArrows();
  }

  setInteractable(v: boolean): void {
    this.interactable = v;
    for (const c of this.cards) c.setInteractable(v);
  }

  /** Lift the card under the pointer (call from scene pointermove). */
  updateHighlight(globalX: number, globalY: number): void {
    if (this._draggingCard || this._gestureMode !== "idle") return;
    if (!this.interactable || this.cards.length === 0) {
      this.putLiftedDown();
      return;
    }
    const card = this.visibleCardUnderPoint(globalX, globalY);
    if (card === this._highlightedCard) return;
    this.putLiftedDown();
    this._highlightedCard = card ?? null;
    if (this._highlightedCard) this._highlightedCard.setLifted(true);
  }

  /** Lower the currently lifted card. */
  putLiftedDown(): void {
    if (this._highlightedCard) {
      this._highlightedCard.setLifted(false);
      this._highlightedCard = null;
    }
  }

  /**
   * Main entry point for all pointer-down events (called from scene-level input).
   * Record position and card (if any); gesture is decided on first move (scroll vs throw).
   */
  handlePointerDown(globalX: number, globalY: number): boolean {
    this._pointerDownX = globalX;
    this._pointerDownY = globalY;
    this._lastGlobalX = globalX;
    this._isPointerDown = true;
    this._gestureDecided = false;
    this._gestureMode = "idle";
    this._accScrollDelta = 0;
    this._pointerCardAtDown = this.visibleCardUnderPoint(globalX, globalY);
    this.putLiftedDown();
    return !!this._pointerCardAtDown;
  }

  /** Start dragging a specific card for throw (internal). */
  startDrag(card: PhaserCard, globalX: number, globalY: number): void {
    const i = this.cards.indexOf(card);
    if (i < 0) return;
    this.putLiftedDown();
    this._draggingCard = card;
    this._dragStartX = card.x;
    this._dragStartY = card.y;
    this._dragStartGlobalX = globalX;
    this._dragStartGlobalY = globalY;
    this._gestureMode = "throw";
    this._gestureDecided = true;
  }

  /** Update drag or scroll (call from scene pointermove). */
  updateDrag(globalX: number, globalY: number): void {
    if (this._draggingCard) {
      const dx = globalX - this._dragStartGlobalX;
      const dy = globalY - this._dragStartGlobalY;
      this._draggingCard.setPosition(this._dragStartX + dx, this._dragStartY + dy);
      return;
    }

    if (this._isPointerDown) {
      const dx = globalX - this._pointerDownX;
      const dy = globalY - this._pointerDownY;
      if (!this._gestureDecided && (Math.abs(dx) > GESTURE_THRESHOLD || Math.abs(dy) > GESTURE_THRESHOLD)) {
        this._gestureDecided = true;
        if (Math.abs(dx) > Math.abs(dy)) {
          this._gestureMode = "scroll";
          this._accScrollDelta = dx;
        } else if (this._pointerCardAtDown && dy < 0 && this.interactable) {
          this._gestureMode = "throw";
          this.startDrag(this._pointerCardAtDown, globalX, globalY);
        } else {
          this._gestureMode = "scroll";
          this._accScrollDelta = dx;
        }
      }
      if (this._gestureMode === "scroll") {
        const moveDx = globalX - this._lastGlobalX;
        this._lastGlobalX = globalX;
        this._accScrollDelta += moveDx;
        while (this._accScrollDelta > SCROLL_PIXEL_THRESHOLD) {
          this.scrollBy(-1);
          this._accScrollDelta -= SCROLL_PIXEL_THRESHOLD;
        }
        while (this._accScrollDelta < -SCROLL_PIXEL_THRESHOLD) {
          this.scrollBy(1);
          this._accScrollDelta += SCROLL_PIXEL_THRESHOLD;
        }
      }
    }
  }

  /** End drag: throw if upward past threshold, else snap back or commit scroll. */
  endDrag(): void {
    if (this._draggingCard) {
      const card = this._draggingCard;
      const index = this.cards.indexOf(card);
      this._draggingCard = null;
      this._gestureMode = "idle";
      this._isPointerDown = false;
      this._pointerCardAtDown = null;
      if (index < 0) return;

      const upward = this._dragStartY - card.y;
      if (upward >= this.THROW_THRESHOLD && this.interactable) {
        this._highlightedCard = null;
        oasiz.triggerHaptic("medium");
        const face = card.getFace() ?? {
          suit: "", value: "", action: CardAction.NONE, color: "#000000", symbol: "",
        };
        this.onCardTap?.(index, face);
        return;
      }

      this.snapCardToSlot(index);
      return;
    }

    this._isPointerDown = false;
    this._gestureMode = "idle";
    this._gestureDecided = false;
    this._accScrollDelta = 0;
    this._pointerCardAtDown = null;
  }

  // ── Debug helpers ───────────────────────────────────────────────────────────

  getDebugCards(): Array<{ x: number; y: number; interactable: boolean }> {
    return this.cards.map((c) => ({ x: c.x, y: c.y, interactable: c.isInteractable() }));
  }

  getDebugArrows(): Array<{ x: number; y: number; visible: boolean }> {
    return [
      { x: this.leftArrow.x, y: this.leftArrow.y, visible: this.leftArrow.visible },
      { x: this.rightArrow.x, y: this.rightArrow.y, visible: this.rightArrow.visible },
    ];
  }

  reposition(centerX: number, centerY: number, radius: number): void {
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.tweenToLayout(this.cards.length);
    this.syncArrows();
  }

  override destroy(fromScene?: boolean): void {
    this._layoutTimer?.remove(false);
    this._layoutTimer = null;
    this.scene?.tweens.killTweensOf(this.cards);
    super.destroy(fromScene);
  }

  // ── Scroll ──────────────────────────────────────────────────────────────────

  private scrollBy(delta: number): void {
    const maxOffset = Math.max(0, this.cards.length - MAX_VISIBLE);
    const next = Math.max(0, Math.min(maxOffset, this.viewOffset + delta));
    if (next === this.viewOffset) return;
    this.viewOffset = next;
    oasiz.triggerHaptic("light");
    this.tweenToLayout(this.cards.length);
    this.syncArrows();
  }

  // ── Fan tween ───────────────────────────────────────────────────────────────

  tweenToLayout(count: number): void {
    this.scene.tweens.killTweensOf(this.cards);
    this._layoutTimer?.remove(false);
    this._layoutTimer = null;

    const visibleCount = Math.min(count, MAX_VISIBLE);
    const raw = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots = layoutCards(raw, "local");
    const offLeft = this.centerX - window.innerWidth * 0.75;
    const offRight = this.centerX + window.innerWidth * 0.75;

    for (let i = 0; i < this.cards.length; i++) {
      const vi = i - this.viewOffset;
      const visible = vi >= 0 && vi < visibleCount;
      const tg = visible
        ? { x: slots[vi]!.x, y: slots[vi]!.y, rotation: slots[vi]!.rotation, alpha: 1 }
        : { x: i < this.viewOffset ? offLeft : offRight, y: this.centerY, rotation: 0, alpha: 0 };

      this.scene.tweens.add({
        targets: this.cards[i],
        x: tg.x,
        y: tg.y,
        rotation: tg.rotation,
        alpha: tg.alpha,
        duration: ANIM.LAYOUT,
        ease: visible ? EASE.SPRING : EASE.OUT,
      });
    }

    // Finalise interactivity after animation completes
    this._layoutTimer = this.scene.time.delayedCall(ANIM.LAYOUT, () => {
      this._layoutTimer = null;
      for (let i = 0; i < this.cards.length; i++) {
        const vi = i - this.viewOffset;
        const visible = vi >= 0 && vi < visibleCount;
        this.cards[i]?.setInteractable(visible && this.interactable);
        if (this.cards[i]) this.cards[i]!.setAlpha(visible ? 1 : 0);
      }
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private snapCardToSlot(index: number): void {
    const visibleCount = Math.min(this.cards.length, MAX_VISIBLE);
    const raw = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots = layoutCards(raw, "local");
    const slot = slots[index - this.viewOffset];
    const card = this.cards[index];
    if (!slot || !card) return;

    this.scene.tweens.killTweensOf(card);
    this.scene.tweens.add({
      targets: card,
      x: slot.x,
      y: slot.y,
      rotation: slot.rotation,
      duration: ANIM.SNAP,
      ease: EASE.OUT,
    });
  }

  /** Hit-test visible cards. Returns topmost card under (globalX, globalY). */
  private visibleCardUnderPoint(globalX: number, globalY: number): PhaserCard | null {
    if (!this.interactable) return null;
    const end = Math.min(this.viewOffset + MAX_VISIBLE, this.cards.length);
    for (let i = end - 1; i >= this.viewOffset; i--) {
      const card = this.cards[i]!;
      if (!card.isInteractable()) continue;
      // Card origin is bottom-center: rect spans (-W/2, -H) to (W/2, 0)
      const dx = globalX - card.x;
      const dy = globalY - card.y;
      if (dx >= -CARD_W / 2 && dx <= CARD_W / 2 && dy >= -CARD_H && dy <= 0) {
        return card;
      }
    }
    return null;
  }

  // ── Card factory ────────────────────────────────────────────────────────────

  private makeCard(face: CardFace): PhaserCard {
    return new PhaserCard(
      this.scene,
      this.cards.length,
      face,
      this.config.backColor,
      this.config.borderRadius,
    );
  }
}
