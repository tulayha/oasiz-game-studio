/**
 * PhaserLocalFan.ts
 * ─────────────────
 * Interactive face-up carousel fan for the local player (bottom of screen).
 *
 * Swipeable carousel: horizontal swipe scrolls; drag up on card throws.
 * Long-press a card to reorder: card lifts, other cards shift to fixed slot positions
 * with a slight shake when displaced. Slots are pre-calculated (same layout as before).
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
/** Depth for the card being dragged (on top of everyone). */
const DRAGGED_DEPTH = 1000;

interface SlotPos {
  x: number;
  y: number;
  rotation: number;
}

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
  /** Called when the user reorders the hand (long-press + place in slot). */
  onReorder?: (fromIndex: number, toIndex: number) => void;

  // ── Drag state ──────────────────────────────────────────────────────────────
  private _highlightedCard: PhaserCard | null = null;
  private _draggingCard: PhaserCard | null = null;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _dragStartGlobalX = 0;
  private _dragStartGlobalY = 0;
  private readonly THROW_THRESHOLD = 70;

  // ── Gesture: scroll vs throw vs reorder ──────────────────────────────────────
  private _pointerDownX = 0;
  private _pointerDownY = 0;
  private _isPointerDown = false;
  private _pointerCardAtDown: PhaserCard | null = null;
  private _longPressTimer: Phaser.Time.TimerEvent | null = null;
  private _gestureMode: "idle" | "scroll" | "throw" | "reorder" = "idle";
  private _gestureDecided = false;
  private _accScrollDelta = 0;
  private _lastGlobalX = 0;
  private _reorderFromIndex = 0;
  private _reorderDropIndex = 0;
  /** Last temp slot-in-view per card index (for shake when displaced). */
  private _lastTempSlot: number[] = [];

  // ── Edge-scroll during reorder ────────────────────────────────────────────
  private _edgeScrollDir: -1 | 0 | 1 = 0;
  private _edgeScrollTimer: Phaser.Time.TimerEvent | null = null;
  private readonly EDGE_SCROLL_DELAY = 900;
  private readonly EDGE_SCROLL_INTERVAL = 550;

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

  /** Pre-calculated slot positions (same layout as fan math). Used for snap and reorder. */
  private getSlotPositions(visibleCount: number): SlotPos[] {
    const raw = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots = layoutCards(raw, "local");
    return slots.map((s) => ({ x: s.x, y: s.y, rotation: s.rotation }));
  }

  private cancelLongPress(): void {
    if (this._longPressTimer) {
      this._longPressTimer.remove(false);
      this._longPressTimer = null;
    }
  }

  private _cancelEdgeScroll(): void {
    if (this._edgeScrollTimer) {
      this._edgeScrollTimer.remove(false);
      this._edgeScrollTimer = null;
    }
    this._edgeScrollDir = 0;
  }

  private _scheduleEdgeScroll(dir: -1 | 1, delay: number): void {
    this._edgeScrollTimer = this.scene.time.delayedCall(delay, () => {
      this._edgeScrollTimer = null;
      if (this._gestureMode !== "reorder" || this._edgeScrollDir !== dir) return;
      this.scrollBy(dir);
      // Reset temp-slot tracking so newly visible cards animate in correctly
      this._lastTempSlot = this.cards.map((_, i) => i - this.viewOffset);
      // After scroll, rebuild shift so the card and slots update immediately
      if (this._draggingCard) {
        const visibleCount = Math.min(this.cards.length, MAX_VISIBLE);
        const slotPositions = this.getSlotPositions(visibleCount);
        const dropIndex = this.slotIndexFromX(this._draggingCard.x, slotPositions);
        this._reorderDropIndex = dropIndex;
        this.updateReorderShift(slotPositions, visibleCount);
      }
      // Check if still at edge and continue
      if (this._draggingCard) {
        const visibleCount = Math.min(this.cards.length, MAX_VISIBLE);
        const slotPositions = this.getSlotPositions(visibleCount);
        const nextDir = this._edgeDir(slotPositions);
        if (nextDir === dir) {
          this._scheduleEdgeScroll(dir, this.EDGE_SCROLL_INTERVAL);
        } else {
          this._edgeScrollDir = 0;
        }
      }
    });
  }

  private _edgeDir(slotPositions: SlotPos[]): -1 | 0 | 1 {
    if (!this._draggingCard || slotPositions.length === 0) return 0;
    const cardX = this._draggingCard.x;
    const leftEdge = slotPositions[0]!.x;
    const rightEdge = slotPositions[slotPositions.length - 1]!.x;
    const threshold = CARD_W * 0.75;
    const hasLeft = this.viewOffset > 0;
    const hasRight = this.viewOffset < this.cards.length - MAX_VISIBLE;
    if (cardX < leftEdge + threshold && hasLeft) return -1;
    if (cardX > rightEdge - threshold && hasRight) return 1;
    return 0;
  }

  private _checkEdgeScroll(slotPositions: SlotPos[]): void {
    const dir = this._edgeDir(slotPositions);
    if (dir === this._edgeScrollDir) return; // no change
    this._cancelEdgeScroll();
    if (dir !== 0) {
      this._edgeScrollDir = dir;
      this._scheduleEdgeScroll(dir, this.EDGE_SCROLL_DELAY);
    }
  }

  private enterReorderMode(card: PhaserCard): void {
    const from = this.cards.indexOf(card);
    if (from < 0) return;
    this._gestureMode = "reorder";
    this._gestureDecided = true;
    this._reorderFromIndex = from;
    this._reorderDropIndex = from - this.viewOffset;
    this._draggingCard = card;
    this._dragStartX = card.x;
    this._dragStartY = card.y;
    this._dragStartGlobalX = this._pointerDownX;
    this._dragStartGlobalY = this._pointerDownY;
    card.setLifted(true);
    this._lastTempSlot = this.cards.map((_, i) => i - this.viewOffset);
    const visibleCount = Math.min(this.cards.length, MAX_VISIBLE);
    this.setDepthsBySlot(visibleCount);
    card.setDepth(DRAGGED_DEPTH);
    oasiz.triggerHaptic("light");
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
    if (this._layoutTimer) { this.putLiftedDown(); return; }
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
   * On card: start long-press timer (reorder) or wait for first move (scroll vs throw).
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
    this.cancelLongPress();
    if (this._pointerCardAtDown) {
      this._longPressTimer = this.scene.time.delayedCall(ANIM.LONG_PRESS, () => {
        this._longPressTimer = null;
        this.enterReorderMode(this._pointerCardAtDown!);
      });
    }
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
    if (this._gestureMode === "reorder" && this._draggingCard) {
      const dx = globalX - this._dragStartGlobalX;
      const dy = globalY - this._dragStartGlobalY;
      this._draggingCard.setPosition(this._dragStartX + dx, this._dragStartY + dy);
      this._dragStartGlobalX = globalX;
      this._dragStartGlobalY = globalY;
      this._dragStartX = this._draggingCard.x;
      this._dragStartY = this._draggingCard.y;
      const visibleCount = Math.min(this.cards.length, MAX_VISIBLE);
      const slotPositions = this.getSlotPositions(visibleCount);
      const dropIndex = this.slotIndexFromX(this._draggingCard.x, slotPositions);
      this._reorderDropIndex = dropIndex;
      this.updateReorderShift(slotPositions, visibleCount);
      this._checkEdgeScroll(slotPositions);
      return;
    }
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
        this.cancelLongPress();
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

  /** End drag: reorder commit, throw, or snap back / scroll. */
  endDrag(): void {
    this.cancelLongPress();
    this._cancelEdgeScroll();

    if (this._gestureMode === "reorder" && this._draggingCard) {
      const card = this._draggingCard;
      const from = this.cards.indexOf(card);
      this._draggingCard = null;
      this._gestureMode = "idle";
      this._isPointerDown = false;
      this._pointerCardAtDown = null;
      card.setLifted(false);
      if (from < 0) return;
      const to = this.viewOffset + Math.max(0, Math.min(this._reorderDropIndex, this.cards.length - 1));
      const clampedTo = Math.max(0, Math.min(to, this.cards.length - 1));
      if (from !== clampedTo) {
        const [moved] = this.cards.splice(from, 1);
        if (moved) {
          const insertAt = clampedTo;
          this.cards.splice(insertAt, 0, moved);
          this.onReorder?.(from, insertAt);
        }
      }
      const visibleCount = Math.min(this.cards.length, MAX_VISIBLE);
      this.setDepthsBySlot(visibleCount);
      this.tweenToLayout(this.cards.length);
      this.syncArrows();
      return;
    }

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

  /** Which slot index (0..length-1) is nearest to cardX. */
  private slotIndexFromX(cardX: number, slotPositions: SlotPos[]): number {
    if (slotPositions.length === 0) return 0;
    let best = 0;
    let bestDist = Math.abs(slotPositions[0]!.x - cardX);
    for (let i = 1; i < slotPositions.length; i++) {
      const d = Math.abs(slotPositions[i]!.x - cardX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  /** In reorder mode: tween non-dragged cards to shifted slot positions; shake when displaced. */
  private updateReorderShift(slotPositions: SlotPos[], visibleCount: number): void {
    const from = this._reorderFromIndex;
    const dropIndex = this._reorderDropIndex;
    const to = this.viewOffset + dropIndex;

    for (let i = 0; i < this.cards.length; i++) {
      if (this.cards[i] === this._draggingCard) continue;
      const vi = i - this.viewOffset;
      if (vi < 0 || vi >= visibleCount) continue;

      let tempIndex: number;
      if (i < from) tempIndex = i < to ? i : i + 1;
      else tempIndex = i <= to ? i - 1 : i;
      const tempSlotInView = tempIndex - this.viewOffset;
      const slotInView = Math.max(0, Math.min(tempSlotInView, slotPositions.length - 1));
      const pos = slotPositions[slotInView]!;
      this.cards[i]!.setDepth(slotInView);

      const prevSlot = this._lastTempSlot[i];
      const slotChanged = prevSlot !== slotInView;
      if (slotChanged) {
        this._lastTempSlot[i] = slotInView;
        this.scene.tweens.killTweensOf(this.cards[i]);
        this.playShakeThen(this.cards[i]!, pos);
      }
    }
    this.sort('depth');
  }

  private playShakeThen(card: PhaserCard, pos: SlotPos): void {
    const r = card.rotation;
    this.scene.tweens.add({
      targets: card,
      rotation: r + 0.04,
      duration: ANIM.SHAKE / 2,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.scene.tweens.add({
          targets: card,
          x: pos.x,
          y: pos.y,
          rotation: pos.rotation,
          duration: ANIM.LAYOUT * 0.4,
          ease: EASE.OUT,
        });
      },
    });
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
    this._cancelEdgeScroll();
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

  /** Set each card's depth by its visible slot: leftmost = least z (behind), rightmost = most z (on top).
   *  Also re-sorts container children since depth has no effect inside a Container.
   *  Skips the dragged card so it keeps DRAGGED_DEPTH. */
  private setDepthsBySlot(visibleCount: number): void {
    for (let i = 0; i < this.cards.length; i++) {
      if (this.cards[i] === this._draggingCard) continue;
      const vi = i - this.viewOffset;
      const depth = vi >= 0 && vi < visibleCount ? vi : 0;
      this.cards[i]?.setDepth(depth);
    }
    this.sort('depth');
  }

  tweenToLayout(count: number): void {
    // Kill tweens only on non-dragged cards — the dragged card stays under pointer control
    const nonDragged = this.cards.filter(c => c !== this._draggingCard);
    this.scene.tweens.killTweensOf(nonDragged);
    this._layoutTimer?.remove(false);
    this._layoutTimer = null;

    const visibleCount = Math.min(count, MAX_VISIBLE);
    // Reset any stale lifted state before tweening so setLifted(false) can't desync y later
    for (const card of nonDragged) {
      if (card.isLifted()) card.setLifted(false);
    }
    this._highlightedCard = null;
    this.setDepthsBySlot(visibleCount);
    const raw = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots = layoutCards(raw, "local");
    const offLeft = this.centerX - window.innerWidth * 0.75;
    const offRight = this.centerX + window.innerWidth * 0.75;

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]!;
      // Never tween the held card — it follows the pointer directly
      if (card === this._draggingCard) continue;
      const vi = i - this.viewOffset;
      const visible = vi >= 0 && vi < visibleCount;
      const tg = visible
        ? { x: slots[vi]!.x, y: slots[vi]!.y, rotation: slots[vi]!.rotation, alpha: 1 }
        : { x: i < this.viewOffset ? offLeft : offRight, y: this.centerY, rotation: 0, alpha: 0 };

      this.scene.tweens.add({
        targets: card,
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
        const card = this.cards[i]!;
        if (card === this._draggingCard) continue;
        const vi = i - this.viewOffset;
        const visible = vi >= 0 && vi < visibleCount;
        card.setInteractable(visible && this.interactable);
        card.setAlpha(visible ? 1 : 0);
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
