// ── Card face ─────────────────────────────────────────────────────────────────

export enum CardAction {
  NONE = "none",
  SKIP = "skip",
  REVERSE = "reverse",
  DRAW_TWO = "draw_two",
  WILD = "wild",
  WILD_DRAW_FOUR = "wild_draw_four",
}

/** Minimal data required to render a card face.  Works for 52-card, UNO, Tarot, or any custom deck. */
export interface CardFace {
  suit: string;   // e.g. "hearts", "red", "wild"
  value: string;   // e.g. "A", "7", "skip"
  action: CardAction;
  color: string;   // CSS hex, e.g. "#cc2222"
  symbol: string;   // Unicode char shown large on face, e.g. "♥"
}

/** A card in the local player's hand — face plus a unique instance id. */
export interface LocalCard extends CardFace {
  id: string;
}

// ── Fan layout ────────────────────────────────────────────────────────────────

export interface FanSlot {
  x: number;
  y: number;
  rotation: number;  // radians
  index: number;
}

// ── Table zones ───────────────────────────────────────────────────────────────

export type ZoneCapacity = number | "stack" | "spread";

export interface TableZone {
  key: string;           // e.g. "deck", "discard", "community"
  x: number;           // pixel position (computed at runtime)
  y: number;
  capacity: ZoneCapacity;
  faceUp: boolean;
  label?: string;
}

// ── Multiplayer state ─────────────────────────────────────────────────────────

export type CardGamePhase = "lobby" | "playing" | "gameover";

export interface PlayerState {
  id: string;
  handCount: number;
  playerName: string;
  playerAvatar: string | null;
  isReady: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface DeckDefinition {
  cards: CardFace[];
  totalCount: number;   // size of the full shuffled deck\
  isInfinite: boolean;
}

export interface CardVisualConfig {
  backColor: number;   // 0xRRGGBB
  backgroundColor: number;
  borderRadius: number;
}

export interface TableConfig {
  /** Zone definitions without pixel positions — layout fills them in. */
  zones: Omit<TableZone, "x" | "y">[];
  visualConfig: CardVisualConfig;
  deck: DeckDefinition;
}

// ── Game rules plug-in ────────────────────────────────────────────────────────

export interface IGameRules {
  /** Called after a card is played to a zone.  Return false to reject the play. */
  onCardPlayed(card: LocalCard, players: PlayerState[]): boolean;
  /** Called after a turn ends.  Returns the next player's id. */
  onTurnEnd(currentPlayerId: string, players: PlayerState[]): string;
}

// ── Renderer contract ─────────────────────────────────────────────────────────

export interface IRenderer {
  destroy(): void;
}
