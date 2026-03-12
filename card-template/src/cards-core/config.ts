import { type DeckDefinition, type CardVisualConfig, type TableConfig, CardAction } from "./types";

// ── Standard 52-card deck ─────────────────────────────────────────────────────

const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export const STANDARD_52_DECK: DeckDefinition = {
  isInfinite: false,
  totalCount: 52,
  cards: [
    ...VALUES.map(v => ({ suit: "hearts", value: v, action: CardAction.NONE, color: "#cc2222", symbol: "♥" })),
    ...VALUES.map(v => ({ suit: "diamonds", value: v, action: CardAction.NONE, color: "#cc2222", symbol: "♦" })),
    ...VALUES.map(v => ({ suit: "clubs", value: v, action: CardAction.NONE, color: "#222222", symbol: "♣" })),
    ...VALUES.map(v => ({ suit: "spades", value: v, action: CardAction.NONE, color: "#222222", symbol: "♠" })),
  ],
};

// ── UNO 108-card deck ─────────────────────────────────────────────────────────

const UNO_COLORS = [
  { suit: "red", color: "#e74c3c" },
  { suit: "green", color: "#27ae60" },
  { suit: "blue", color: "#2980b9" },
  { suit: "yellow", color: "#f1c40f" },
];

export const UNO_108_DECK: DeckDefinition = {
  totalCount: 108,
  isInfinite: true,
  cards: [
    // 0 once + 1-9 twice + action cards twice per color
    ...UNO_COLORS.flatMap(c => [
      { suit: c.suit, value: "0", action: CardAction.NONE, color: c.color, symbol: "" },
      ...["1", "2", "3", "4", "5", "6", "7", "8", "9"].flatMap(v => [
        { suit: c.suit, value: v, action: CardAction.NONE, color: c.color, symbol: v },
        { suit: c.suit, value: v, action: CardAction.NONE, color: c.color, symbol: v },
      ]),
      { suit: c.suit, value: "skip", action: CardAction.SKIP, color: c.color, symbol: "S" },
      { suit: c.suit, value: "skip", action: CardAction.SKIP, color: c.color, symbol: "S" },
      { suit: c.suit, value: "reverse", action: CardAction.REVERSE, color: c.color, symbol: "R" },
      { suit: c.suit, value: "reverse", action: CardAction.REVERSE, color: c.color, symbol: "R" },
      { suit: c.suit, value: "+2", action: CardAction.DRAW_TWO, color: c.color, symbol: "+2" },
      { suit: c.suit, value: "+2", action: CardAction.DRAW_TWO, color: c.color, symbol: "+2" },
    ]),
    // Wild × 4, Wild +4 × 4
    ...Array.from({ length: 4 }, () => ({ suit: "wild", value: "wild", action: CardAction.WILD, color: "#333333", symbol: "W" })),
    ...Array.from({ length: 4 }, () => ({ suit: "wild", value: "+4", action: CardAction.WILD_DRAW_FOUR, color: "#333333", symbol: "+4" })),
  ],
};

// ── Visual defaults (poker-style) ─────────────────────────────────────────────

export const DEFAULT_VISUAL_CONFIG: CardVisualConfig = {
  backColor: 0x1a3a8f,
  backgroundColor: 0x0f6b3a,
  borderRadius: 6,
};

// ── UNO-style visual (bright table, colorful card back) ────────────────────────

export const UNO_VISUAL_CONFIG: CardVisualConfig = {
  backColor: 0x1a237e,   // deep indigo / UNO-style back
  backgroundColor: 0x1b5e20,  // bright green table (UNO green)
  borderRadius: 12,        // rounder cards
};

// ── Default table config (UNO-like: deck + discard) ───────────────────────────

export const DEFAULT_TABLE_CONFIG: TableConfig = {
  zones: [
    { key: "deck", capacity: "stack", faceUp: false },
    { key: "discard", capacity: "stack", faceUp: true },
  ],
  visualConfig: UNO_VISUAL_CONFIG,
  deck: UNO_108_DECK,
};

// ── Poker table config ────────────────────────────────────────────────────────

export const POKER_TABLE_CONFIG: TableConfig = {
  zones: [
    { key: "deck", capacity: "stack", faceUp: false },
    { key: "community", capacity: 5, faceUp: true, label: "Community" },
    { key: "pot", capacity: 0, faceUp: false, label: "Pot" },
  ],
  visualConfig: DEFAULT_VISUAL_CONFIG,
  deck: STANDARD_52_DECK,
};
