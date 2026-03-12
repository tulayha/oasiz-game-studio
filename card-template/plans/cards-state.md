# Multiplayer Card Game Template — State Design & PlayroomKit Integration

---

## Multiplayer State Design (PlayroomKit)

### Room State  (host-authoritative, `setState(..., true)`)

| Key | Type | Description |
|---|---|---|
| `gamePhase` | `"lobby" \| "playing" \| "gameover"` | Overall phase broadcast to all |
| `currentTurn` | `string` (player id) | Active player's id |
| `discardTopCard` | `CardFace \| null` | Face data of the discard top |
| `deckCount` | `number` | Cards remaining in draw pile |

### Player State  (written by that player only)

| Key | Type | Description |
|---|---|---|
| `handCount` | `number` | Integer count — card identities stay local |
| `playerName` | `string` | Display name |
| `playerAvatar` | `string \| null` | Avatar URL |
| `isReady` | `boolean` | Lobby ready flag |

### Local State  (never synced)

| Variable | Type | Description |
|---|---|---|
| `localHand` | `LocalCard[]` | Actual card objects (suit, value, color, symbol) |
| `animatingCards` | `FlyingCard[]` | Cards in mid-animation |
| `fanLayout` | `FanSlot[]` | Pre-computed (x, y, rotation) per hand card |

### CardFace Shape  (generic — used for any card game)

```typescript
/**
 * A CardFace is the minimal data needed to render a card.
 * It is game-agnostic: the suit/value fields work for standard 52-card decks,
 * UNO, Tarot, or any custom deck — just populate them differently.
 */
interface CardFace {
  suit:   string   // e.g. "hearts", "red", "spades", "wild", "major"
  value:  string   // e.g. "A", "7", "skip", "J", "reverse", "0"
  color:  string   // CSS hex used to tint the card face, e.g. "#e74c3c"
  symbol: string   // Unicode character displayed large on the face, e.g. "♥", "7", "S"
}

/**
 * When a card is broadcast to the room (played to a zone),
 * only the CardFace is shared — the full LocalCard stays private.
 */
type PublicCard = CardFace   // alias for clarity at call sites

// Default 52-card deck defined in config.ts:
//   suits: hearts ♥ / diamonds ♦ / clubs ♣ / spades ♠
//   values: A 2 3 4 5 6 7 8 9 10 J Q K
//
// UNO deck (108 cards) also defined in config.ts as an alternative export.
// Custom decks (Tarot, etc.) follow the same shape.
```

### PlayroomKit Init

```typescript
await insertCoin({
  skipLobby: true,
  maxPlayersPerRoom: 4,
  roomCode: roomCode,
  defaultPlayerStates: {
    handCount: 0,
    playerName: "",
    playerAvatar: null,
    isReady: false,
  },
})
oasiz.shareRoomCode(getRoomCode())
```

### State Polling Pattern

`PlayroomBridge` runs a `setInterval` at 100ms polling `getState()` for all room keys and each player's `handCount`. A local shadow object tracks the previous value; on diff, the registered callback fires. This matches the pattern in `draw-the-thing/src/GameManager.ts`.

### Host-Only Logic

```
HOST: initializeDeck()
  setState("deckCount", 108, true)
  setState("currentTurn", players[0].id, true)
  setState("discardTopCard", null, true)

HOST: advanceTurn(afterPlayerId)
  currentIndex = players.findIndex(p => p.id === afterPlayerId)
  nextIndex    = (currentIndex + 1) % players.length
  setState("currentTurn", players[nextIndex].id, true)
```

---

## PlayroomBridge Module  (`src/cards-core/PlayroomBridge.ts`)

Wraps all PlayroomKit calls so neither renderer imports `playroomkit` directly. Renderers receive a `bridge` instance via the game registry or constructor.

```
interface PlayroomBridgeCallbacks {
  onTurnChange:              (playerId: string) => void
  onDiscardTopChange:        (card: CardFace | null) => void
  onDeckCountChange:         (count: number) => void
  onOpponentHandCountChange: (playerId: string, count: number) => void
  onGamePhaseChange:         (phase: GamePhase) => void
}

class PlayroomBridge {
  init(callbacks): void           // start polling interval
  requestDraw(): void             // LOCAL: draw a card (your turn only)
  requestThrow(card): void        // LOCAL: throw a card (your turn only)
  isMyTurn(): boolean
  getPlayers(): PlayerState[]
  destroy(): void                 // clear interval
}
```

### requestDraw() flow

```
1. Check isMyTurn() → if not, triggerHaptic("error"), return
2. CardGameEngine.drawCard() → localHand grows, returns new LocalCard
3. myPlayer().setState("handCount", handCount + 1, true)
4. if isHost():
     setState("deckCount", deckCount - 1, true)
5. Renderer: animateDrawCard(deckX, deckY, newCard)
```

### requestThrow(card) flow

```
1. Check isMyTurn() → if not, triggerHaptic("error"), return
2. CardGameEngine.throwCard(index) → localHand shrinks
3. myPlayer().setState("handCount", handCount - 1, true)
4. setState("discardTopCard", serializedCard, true)
5. if isHost():
     advanceTurn(myPlayer().id)
6. Renderer: animateThrowCard(cardIndex, discardX, discardY)
```

### Player Join / Quit

```
onPlayerJoin(player => {
  players.push(player)
  updateLobbyUI()
  updateOpponentSlots()

  player.onQuit(() => {
    players = players.filter(p => p.id !== player.id)
    if isHost() && getState("currentTurn") === player.id:
      advanceTurn(player.id)
    updateOpponentSlots()
  })
})
```
