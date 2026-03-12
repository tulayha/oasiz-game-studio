/**
 * CardGameEngine.ts
 * ─────────────────
 * Renderer-agnostic local state machine.
 * Manages the local player's hand only — multiplayer state lives in PlayroomBridge.
 */

import { oasiz } from "@oasiz/sdk";
import type { LocalCard, TableConfig } from "./types";

export class CardGameEngine {
  private localHand: LocalCard[] = [];
  private cardCounter = 0;

  constructor(private readonly config: TableConfig) {
    try {
      oasiz.emitScoreConfig({
        anchors: [
          { raw: 1,  normalized: 100 },
          { raw: 5,  normalized: 300 },
          { raw: 10, normalized: 600 },
          { raw: 20, normalized: 950 },
        ],
      });
    } catch { /* SDK not available in dev */ }
  }

  get handCount(): number {
    return this.localHand.length;
  }

  getHand(): LocalCard[] {
    return [...this.localHand];
  }

  /** Draw a random card from the deck definition.  Returns the new card. */
  drawCard(): LocalCard {
    const deck = this.config.deck.cards;
    const face = deck[Math.floor(Math.random() * deck.length)];
    const card: LocalCard = {
      ...face,
      id: `card-${++this.cardCounter}-${Date.now()}`,
    };
    this.localHand.push(card);
    return card;
  }

  /** Remove the card at `index` from the hand and return it. */
  playCard(index: number): LocalCard {
    if (index < 0 || index >= this.localHand.length) {
      throw new RangeError(`Invalid hand index: ${index}`);
    }
    const [card] = this.localHand.splice(index, 1);
    return card;
  }

  reset(): void {
    this.localHand  = [];
    this.cardCounter = 0;
  }
}
