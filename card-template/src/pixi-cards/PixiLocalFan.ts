/**
 * PixiLocalFan.ts
 * ───────────────
 * Interactive face-up carousel fan for the local player (bottom of screen).
 *
 * Shows up to MAX_VISIBLE=6 cards at once. When the hand is larger, cards
 * beyond the window are positioned off-screen. Arrow pills on each side
 * display how many cards are hidden and can be tapped to scroll. Horizontal
 * swipe anywhere on the stage also scrolls the carousel. Vertical drag on a
 * card still throws it (existing mechanic).
 *
 * All animations driven by GSAP (no Pixi ticker).
 */

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { gsap } from "gsap";
import { oasiz } from "@oasiz/sdk";
import { CardAction, type CardFace, type CardVisualConfig } from "../cards-core/types";
import { computeFanSlots, layoutCards } from "../cards-core/fanMath";
import { PixiCard, CARD_W, CARD_H } from "./PixiCard";
import { PixiFlyCard } from "./PixiFlyCard";
import { ANIM, EASE } from "./gsapPixi";

const MAX_VISIBLE = 6;

// ── Arrow helper types ────────────────────────────────────────────────────────
interface ArrowContainer extends Container {
  _bg:         Graphics;
  _arrowText:  Text;
  _countText:  Text;
}

export class PixiLocalFan extends Container {
  private cards:      PixiCard[] = [];
  /** Index of the first visible card in this.cards[]. */
  private viewOffset = 0;

  private centerX:  number;
  private centerY:  number;
  private radius:   number;
  private config:   CardVisualConfig;
  private flyLayer: Container;
  private interactable = true;

  private leftArrow!:  ArrowContainer;
  private rightArrow!: ArrowContainer;

  /** Delayed-call handle for the post-layout interactivity finalizer. */
  private _layoutKill: { kill(): void } | null = null;

  /** Called with absolute hand index + face when the user throws a card. */
  onCardTap?: (index: number, face: CardFace) => void;

  // ── Drag state ───────────────────────────────────────────────────────────────
  private _highlightedCard:    PixiCard | null = null;
  private _draggingCard:       PixiCard | null = null;
  private _dragStartX         = 0;
  private _dragStartY         = 0;
  private _dragStartGlobalX   = 0;
  private _dragStartGlobalY   = 0;
  private readonly THROW_THRESHOLD = 70;

  // ── Scroll-gesture state ─────────────────────────────────────────────────────
  private _pointerDownX    = 0;
  private _pointerDownY    = 0;
  private _isPointerDown   = false;
  private _isScrollGesture = false;
  private _gestureDecided  = false;
  private _accScrollDelta  = 0;

  constructor(
    centerX:  number,
    centerY:  number,
    radius:   number,
    config:   CardVisualConfig,
    flyLayer: Container,
  ) {
    super();
    this.centerX  = centerX;
    this.centerY  = centerY;
    this.radius   = radius;
    this.config   = config;
    this.flyLayer = flyLayer;
    this.buildArrows();
  }

  // ── Arrow indicators ─────────────────────────────────────────────────────────

  private buildArrows(): void {
    this.leftArrow  = this.makeArrowContainer("left");
    this.rightArrow = this.makeArrowContainer("right");
    this.addChild(this.leftArrow, this.rightArrow);
    this.syncArrows();
  }

  private makeArrowContainer(side: "left" | "right"): ArrowContainer {
    const c = new Container() as ArrowContainer;

    const bg = new Graphics();
    c._bg = bg;
    c.addChild(bg);

    const arrowStyle = new TextStyle({ fontSize: 13, fill: 0xffffff, fontFamily: "Arial", fontWeight: "bold" });
    const arrowText  = new Text({ text: side === "left" ? "◀" : "▶", style: arrowStyle });
    arrowText.anchor.set(0.5, 0.5);
    c._arrowText = arrowText;
    c.addChild(arrowText);

    const countStyle = new TextStyle({ fontSize: 11, fill: 0xffd700, fontFamily: "Arial", fontWeight: "bold" });
    const countText  = new Text({ text: "0", style: countStyle });
    countText.anchor.set(0.5, 0.5);
    c._countText = countText;
    c.addChild(countText);

    c.eventMode = "static";
    c.cursor    = "pointer";
    c.on("pointertap", () => {
      if (side === "left") this.scrollBy(-1);
      else                 this.scrollBy(1);
    });

    return c;
  }

  private refreshArrow(c: ArrowContainer, side: "left" | "right", count: number): void {
    c.visible = count > 0;
    if (count === 0) return;

    const PILL_W   = 52;
    const PILL_H   = 30;
    const ARROW_OFF = 10;
    const COUNT_OFF = 10;

    c._bg.clear();
    c._bg.roundRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H, PILL_H / 2);
    c._bg.fill({ color: 0x000000, alpha: 0.60 });
    c._bg.roundRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H, PILL_H / 2);
    c._bg.stroke({ width: 1.5, color: 0xffffff, alpha: 0.25 });

    if (side === "left") {
      c._arrowText.x = -ARROW_OFF;
      c._countText.x =  COUNT_OFF;
    } else {
      c._countText.x = -COUNT_OFF;
      c._arrowText.x =  ARROW_OFF;
    }
    c._arrowText.y = 0;
    c._countText.y = 0;
    c._countText.text = String(count);
  }

  private syncArrows(): void {
    const leftCount  = this.viewOffset;
    const rightCount = Math.max(0, this.cards.length - this.viewOffset - MAX_VISIBLE);

    this.refreshArrow(this.leftArrow,  "left",  leftCount);
    this.refreshArrow(this.rightArrow, "right", rightCount);

    const halfSpread = this.fanHalfSpread();
    const MARGIN     = 38;
    const arrowY     = this.centerY - CARD_H * 0.55;

    this.leftArrow.x  = this.centerX - halfSpread - MARGIN;
    this.leftArrow.y  = arrowY;
    this.rightArrow.x = this.centerX + halfSpread + MARGIN;
    this.rightArrow.y = arrowY;
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
    const newIdx  = this.cards.length;
    const newCount = newIdx + 1;

    // Auto-scroll right so the new card is always in view
    const maxOffset = Math.max(0, newCount - MAX_VISIBLE);
    this.viewOffset = maxOffset;

    const visibleIdx   = newIdx - this.viewOffset;
    const visibleCount = Math.min(newCount, MAX_VISIBLE);
    const raw    = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots  = layoutCards(raw, "local");
    const target = slots[visibleIdx] ?? { x: this.centerX + window.innerWidth * 0.8, y: this.centerY, rotation: 0 };

    const fly = new PixiFlyCard(deckX, deckY, this.config.backColor, this.config.borderRadius);
    this.flyLayer.addChild(fly);

    fly.flyTo(target.x, target.y, target.rotation, ANIM.FLY * 1000, () => {
      this.flyLayer.removeChild(fly);
      fly.destroy();

      const card = this.makeCard(face);
      card.x        = target.x;
      card.y        = target.y;
      card.rotation = target.rotation;
      card.flip(true, true);
      this.cards.push(card);
      this.addChild(card);

      this.tweenToLayout(this.cards.length);
      this.syncArrows();
      onComplete?.();
    });
  }

  /** Animate card at absolute index flying to (discardX, discardY), remove from hand. */
  throwCard(index: number, discardX: number, discardY: number): void {
    if (index < 0 || index >= this.cards.length) return;

    const card = this.cards[index];
    this.cards.splice(index, 1);
    this.removeChild(card);

    const worldX = card.x;
    const worldY = card.y;
    card.pivot.set(CARD_W / 2, CARD_H);
    card.x = worldX;
    card.y = worldY;

    const fly = new PixiFlyCard(worldX, worldY, this.config.backColor, this.config.borderRadius);
    fly.x        = worldX;
    fly.y        = worldY;
    fly.rotation = card.rotation;
    this.flyLayer.addChild(fly);
    card.destroy();

    fly.flyTo(discardX, discardY, 0, ANIM.FLY * 1000, () => {
      this.flyLayer.removeChild(fly);
      fly.destroy();
    });

    this.viewOffset = Math.min(this.viewOffset, Math.max(0, this.cards.length - MAX_VISIBLE));
    this.tweenToLayout(this.cards.length);
    this.syncArrows();
  }

  setInteractable(v: boolean): void {
    this.interactable = v;
    for (const c of this.cards) c.setInteractable(v);
  }

  /** Call from stage pointermove: lifts card under cursor (skips when dragging/scrolling). */
  updateHighlight(globalX: number | null, globalY?: number): void {
    if (this._draggingCard || this._isScrollGesture) return;
    if (!this.interactable || this.cards.length === 0) {
      this.putLiftedDown();
      return;
    }
    if (globalX === null) return;
    const card = this.visibleCardUnderPoint(globalX, globalY ?? 0);
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
   * Called from stage pointerdown.
   * Records start position for scroll-gesture detection.
   */
  handlePointerDown(globalX: number, globalY: number): void {
    this._pointerDownX   = globalX;
    this._pointerDownY   = globalY;
    this._isPointerDown  = true;
    this._isScrollGesture = false;
    this._gestureDecided  = false;
    this._accScrollDelta  = 0;
    this.putLiftedDown();
  }

  /** Start dragging a specific card (called from the card's own pointerdown). */
  startDrag(card: PixiCard, globalX: number, globalY: number): void {
    if (!this.interactable) return;
    const i = this.cards.indexOf(card);
    if (i < 0) return;
    this.putLiftedDown();
    this._draggingCard     = card;
    this._dragStartX       = card.x;
    this._dragStartY       = card.y;
    this._dragStartGlobalX = globalX;
    this._dragStartGlobalY = globalY;
    // Lock gesture to card-drag
    this._isScrollGesture = false;
    this._gestureDecided  = true;
  }

  /** Update drag or scroll (call from stage pointermove). */
  updateDrag(globalX: number, globalY: number): void {
    if (this._draggingCard) {
      const localNow   = this.toLocal({ x: globalX, y: globalY });
      const localStart = this.toLocal({ x: this._dragStartGlobalX, y: this._dragStartGlobalY });
      this._draggingCard.x = this._dragStartX + (localNow.x - localStart.x);
      this._draggingCard.y = this._dragStartY + (localNow.y - localStart.y);
      return;
    }

    if (this._isPointerDown) {
      const dx = globalX - this._pointerDownX;
      const dy = globalY - this._pointerDownY;
      if (!this._gestureDecided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        this._isScrollGesture = Math.abs(dx) > Math.abs(dy);
        this._gestureDecided  = true;
      }
      if (this._isScrollGesture) this._accScrollDelta = dx;
    }
  }

  /** End drag: throw card upward or commit scroll (call from stage pointerup). */
  endDrag(): void {
    if (this._draggingCard) {
      const card  = this._draggingCard;
      const index = this.cards.indexOf(card);
      this._draggingCard  = null;
      this._isPointerDown = false;
      if (index < 0) return;

      const upward = this._dragStartY - card.y;
      if (upward >= this.THROW_THRESHOLD) {
        this._highlightedCard = null;
        oasiz.triggerHaptic("medium");
        const face = card.getFace() ?? { suit: "", value: "", action: CardAction.NONE, color: "#000", symbol: "" };
        this.onCardTap?.(index, face);
        return;
      }

      this.snapCardToSlot(index);
      return;
    }

    if (this._isScrollGesture && this._isPointerDown) {
      const threshold = CARD_W * 1.2;
      if      (this._accScrollDelta < -threshold) this.scrollBy(1);
      else if (this._accScrollDelta >  threshold) this.scrollBy(-1);
    }

    this._isPointerDown   = false;
    this._isScrollGesture = false;
    this._gestureDecided  = false;
    this._accScrollDelta  = 0;
  }

  reposition(centerX: number, centerY: number, radius: number): void {
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius  = radius;
    this.tweenToLayout(this.cards.length);
    this.syncArrows();
  }

  override destroy(): void {
    this._layoutKill?.kill();
    this._layoutKill = null;
    gsap.killTweensOf(this.cards);
    super.destroy({ children: true });
  }

  // ── Scroll ───────────────────────────────────────────────────────────────────

  private scrollBy(delta: number): void {
    const maxOffset = Math.max(0, this.cards.length - MAX_VISIBLE);
    const next = Math.max(0, Math.min(maxOffset, this.viewOffset + delta));
    if (next === this.viewOffset) return;
    this.viewOffset = next;
    oasiz.triggerHaptic("light");
    this.tweenToLayout(this.cards.length);
    this.syncArrows();
  }

  // ── Fan tween (GSAP) ─────────────────────────────────────────────────────────

  tweenToLayout(count: number): void {
    // Kill any previous in-flight layout tweens and their finalizer
    gsap.killTweensOf(this.cards);
    this._layoutKill?.kill();
    this._layoutKill = null;

    const visibleCount = Math.min(count, MAX_VISIBLE);
    const raw    = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots  = layoutCards(raw, "local");
    const offLeft  = this.centerX - window.innerWidth * 0.75;
    const offRight = this.centerX + window.innerWidth * 0.75;

    for (let i = 0; i < this.cards.length; i++) {
      const vi = i - this.viewOffset;
      const visible = vi >= 0 && vi < visibleCount;
      const tg = visible
        ? { x: slots[vi]!.x, y: slots[vi]!.y, rotation: slots[vi]!.rotation, alpha: 1 }
        : { x: i < this.viewOffset ? offLeft : offRight, y: this.centerY, rotation: 0, alpha: 0 };

      gsap.to(this.cards[i], {
        x:        tg.x,
        y:        tg.y,
        rotation: tg.rotation,
        alpha:    tg.alpha,
        duration: ANIM.LAYOUT,
        ease:     EASE.OUT,
        overwrite: true,
      });
    }

    // Finalise interactivity after animation completes
    this._layoutKill = gsap.delayedCall(ANIM.LAYOUT, () => {
      this._layoutKill = null;
      for (let i = 0; i < this.cards.length; i++) {
        const vi = i - this.viewOffset;
        const visible = vi >= 0 && vi < visibleCount;
        this.cards[i].eventMode = visible ? "static" : "none";
        this.cards[i].alpha     = visible ? 1 : 0;
      }
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Snap the card at absolute index back to its fan slot (after a cancelled drag). */
  private snapCardToSlot(index: number): void {
    const visibleCount = Math.min(this.cards.length, MAX_VISIBLE);
    const raw   = computeFanSlots(visibleCount, this.centerX, this.centerY, this.radius);
    const slots = layoutCards(raw, "local");
    const slot  = slots[index - this.viewOffset];
    const card  = this.cards[index];
    if (!slot || !card) return;

    gsap.to(card, {
      x:        slot.x,
      y:        slot.y,
      rotation: slot.rotation,
      duration: ANIM.SNAP,
      ease:     EASE.OUT,
      overwrite: true,
    });
  }

  /** Hit-test within the currently visible window only. */
  private visibleCardUnderPoint(globalX: number, globalY: number): PixiCard | null {
    const global = { x: globalX, y: globalY };
    const end    = Math.min(this.viewOffset + MAX_VISIBLE, this.cards.length);
    for (let i = end - 1; i >= this.viewOffset; i--) {
      const card  = this.cards[i]!;
      const local = card.toLocal(global);
      if (local.x >= -CARD_W / 2 && local.x <= CARD_W / 2 && local.y >= -CARD_H && local.y <= 0) {
        return card;
      }
    }
    return null;
  }

  // ── Card factory ─────────────────────────────────────────────────────────────

  private makeCard(face: CardFace): PixiCard {
    const card = new PixiCard(
      this.cards.length,
      face,
      this.config.backColor,
      this.config.borderRadius,
    );

    card.on("pointerdown", (e: { global: { x: number; y: number } }) => {
      if (!this.interactable) return;
      this.startDrag(card, e.global.x, e.global.y);
    });

    return card;
  }
}
