# Multiplayer Card Game Template — Overview & Scope

> **Template intent:** This skeleton is designed to be the foundation for *any* turn-based multiplayer card game — UNO, Poker, Blackjack, Rummy, Go Fish, and beyond.
> UNO is used as the first demo mechanic but the architecture is explicitly game-agnostic.

**Target:** `card-template/` monorepo
**Date drafted:** 2026-03-11

---

## 1. Overview

A renderer-agnostic, game-agnostic multiplayer card table skeleton supporting up to 4 players via PlayroomKit. **No game rules are implemented** — this plan covers the universal primitives that every card game needs: a card fan, a draw pile, a play area, animated card movement, and real-time hand-count sync.

### What the skeleton delivers

- **Local player** — interactive face-up card fan at the bottom of the screen.
- **Remote players** — face-down card-back fans placed at natural table positions (top, left, right).
- **Table centre** — draw deck + active play zone (discard pile, community cards, pot, etc.) — configurable.
- **Draw interaction** — tapping the deck animates a card flying into the local fan.
- **Play interaction** — tapping a hand card animates it flying to the centre play zone, then ends the turn.
- **Real-time sync** — PlayroomKit syncs only `handCount` (an integer). Actual card identities stay local-only, giving privacy for games like Poker.

### Template extensibility — example games

| Game | What you add on top of this skeleton |
|------|--------------------------------------|
| **UNO** | Color/value matching rules, special cards, +2/+4/skip/reverse logic |
| **Poker** | Community card zone, betting UI, chip counts, hand evaluation |
| **Blackjack** | Dealer slot (fixed position), hit/stand buttons, bust detection |
| **Rummy** | Meld zones on the table, card grouping UI |
| **Go Fish** | Ask-for-card UI, pair collection zone |

### Renderer variants

| Variant | Directory | Key library |
|---------|-----------|-------------|
| PixiJS v8 | `src/pixi-cards/` | `pixi.js` |
| Phaser 3  | `src/phaser-cards/` | `phaser` |

Both share `src/cards-core/` (types, config, PlayroomKit bridge, fan math) and the same HTML shell.

**Pixi-only dummy mode:** For local UI development without PlayroomKit, set `PIXI_DUMMY_MODE = true` in `cards-main.ts`. The app then shows the game screen directly with a `DummyBridge`, a local hand (5–10 random cards), and 3 opponent slots with dummy hand counts; draw/play are disabled. See `progress.md` for details.

---

## 2. Scope and Constraints

### In scope

- Portrait-first responsive layout for 2–4 players
- Card fan rendering: face-up local fan, face-down remote fans, arc algorithm
- Draw animation: card flies from deck → local fan
- Play animation: card flies from local fan → centre play zone (discard, community, etc.)
- Fan re-layout tween whenever hand size changes
- Configurable `TableZone` system (deck, play area, community slots, pot display)
- PlayroomKit room state: `currentTurn`, `topPlayedCard`, `deckCount`, `gamePhase`
- PlayroomKit player state: `handCount`, `playerName`, `playerAvatar`, `isReady`
- Lobby screen with ready-up and room-code sharing
- Settings modal (Music / FX / Haptics) — mandatory per `Agents.md`
- Full Oasiz SDK integration (haptics, lifecycle, score placeholder)

### Out of scope (for this skeleton)

- Any specific card game rules
- Win condition / actual scoring logic
- AI / bot players
- Chip/betting UI
- Card backs that vary per player

### Template contract (what implementing a new game requires)

A new card game built on this skeleton only needs to:
1. Provide a `GameRules` class with `onCardPlayed(card, state)` and `onTurnEnd(state)` hooks
2. Define which `TableZone`s are active (e.g. poker adds a `communityZone` and `potZone`)
3. Optionally replace the default 52-card deck in `config.ts` with a custom deck definition
