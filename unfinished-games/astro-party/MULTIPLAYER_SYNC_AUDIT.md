# Astro Party - Multiplayer Sync Audit

Comprehensive audit of ALL multiplayer synchronization scenarios, validated from both HOST and NON-HOST perspectives.

---

## Scenario Matrix

### Category 1: Room Lifecycle

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 1.1 | Create room | `resetState()` clears old data, new playerOrder | N/A | OK |
| 1.2 | Join room | N/A | `resetState()` clears old data, receives existing players | OK |
| 1.3 | Leave room (disconnect) | `resetState()` called, `leaveRoom()` | `resetState()` called, `leaveRoom()` | OK |
| 1.4 | Create room after leaving previous | Should have clean state | Should have clean state | OK |
| 1.5 | Join room after leaving previous | N/A | Should have clean state | OK |

### Category 2: Player Join/Leave

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 2.1 | Player joins in LOBBY | `addPlayer()` with ACTIVE state | Same via `onPlayerJoin` | OK |
| 2.2 | Player joins during COUNTDOWN | Restarts countdown | Receives new countdown via RPC | OK |
| 2.3 | Player joins during PLAYING | Added as SPECTATING | Same | OK |
| 2.4 | Player joins during GAME_END | Added as SPECTATING | Same | OK |
| 2.5 | Player leaves in LOBBY | `removePlayer()`, UI updates | Same | OK |
| 2.6 | Player leaves during COUNTDOWN | If <2 players, cancel to LOBBY | Receives phase via RPC | OK |
| 2.7 | Player leaves during PLAYING | `checkEliminationWin()` | Receives state via gameState | OK |
| 2.8 | Host leaves during LOBBY | N/A - new host assigned | Becomes host, `onHostChanged` | OK |
| 2.9 | Host leaves during COUNTDOWN | N/A | New host cancels, returns to LOBBY | OK |
| 2.10 | Host leaves during PLAYING | N/A | New host awards win to highest scorer | OK |

### Category 3: Player Index & Color Assignment

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 3.1 | First player color | Index 0 = Cyan | Same (from PlayerData) | OK |
| 3.2 | Second player color | Index 1 = Magenta | Same (from PlayerData) | OK |
| 3.3 | Color after player leaves mid-game | Colors persist (frozen in PlayerData) | Uses synced PlayerData.color | OK |
| 3.4 | Color on render (host) | `ship.color` from Ship object | N/A | OK |
| 3.5 | Color on render (non-host) | N/A | `this.players.get(id).color` lookup | OK |
| 3.6 | Player rejoins after disconnect | Gets new index/color | Same | OK |
| 3.7 | Same players, new room, different creator | Creator gets index 0 | Joiner gets index 1 | OK |

### Category 4: Phase Transitions

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 4.1 | LOBBY → COUNTDOWN | `setPhase()` + RPC broadcast | Receives via `onGamePhaseReceived` RPC | OK |
| 4.2 | COUNTDOWN → PLAYING | `beginMatch()` + RPC | Receives via RPC, no ship creation | OK |
| 4.3 | PLAYING → GAME_END | `endGame()` + RPC + winner RPC | Receives both RPCs | OK |
| 4.4 | GAME_END → LOBBY | `restartGame()` + RPC | Receives via RPC, `clearGameState()` | OK |
| 4.5 | Phase in gameState vs RPC | RPC only (removed from GameStateSync type) | RPC only | OK |

### Category 5: Entity Sync (Ships/Pilots/Projectiles)

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 5.1 | Ship creation at match start | Creates Ship objects with Matter.js | Receives ShipState[] arrays | OK |
| 5.2 | Ship position updates | Physics simulation, broadcasts | Renders from networkShips[] | OK |
| 5.3 | Ship destruction | `destroyShip()`, creates Pilot | Receives updated arrays | OK |
| 5.4 | Pilot creation | Creates Pilot with AI | Receives PilotState[] | OK |
| 5.5 | Pilot survival → respawn | Creates new Ship | Receives new ShipState | OK |
| 5.6 | Projectile creation | Creates Projectile, broadcasts sound | Receives array + sound RPC | OK |
| 5.7 | Projectile expiration | Removes after 2500ms | Disappears from array | OK |
| 5.8 | Collision detection | Matter.js events on host only | N/A - host authoritative | OK |

### Category 6: Input & Actions

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 6.1 | Button A (rotate) | Applies to own ship | Sends via setState, host applies | OK |
| 6.2 | Button B (fire) | Applies, creates projectile | Sends via setState, host creates | OK |
| 6.3 | Double-tap A (dash) | Applies locally + RPC sound | Sends RPC to host, host applies | OK |
| 6.4 | Input at round end | Should be cleared | Should be cleared | OK |
| 6.5 | Input polling frequency | Polls every 50ms | Sends every frame | OK |

### Category 7: Kills & Scoring

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 7.1 | Kill registered | Increments, `updateKills()` reliable | Receives in PlayerData | OK |
| 7.2 | Win by kills (5) | `endGame(killerId)` | Receives winner RPC | OK |
| 7.3 | Win by elimination | `checkEliminationWin()` | Receives winner RPC | OK |
| 7.4 | Kills in gameState vs setState | setState (reliable) + gameState (display) | Same | OK |

### Category 8: Sound Sync

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 8.1 | Fire sound | Broadcasts RPC on projectile creation | Plays on RPC receive | OK |
| 8.2 | Dash sound | Broadcasts RPC on dash | Plays on RPC receive | OK |
| 8.3 | Explosion sound | Broadcasts RPC on ship destroy | Plays on RPC receive | OK |
| 8.4 | Kill sound | Broadcasts RPC on pilot kill | Plays on RPC receive | OK |
| 8.5 | Respawn sound | Broadcasts RPC on respawn | Plays on RPC receive | OK |
| 8.6 | Win sound | Broadcasts RPC on game end | Plays on RPC receive | OK |
| 8.7 | Countdown sound | Via countdown RPC callback | Via countdown RPC callback | OK |
| 8.8 | Rapid sound triggers | `safeTrigger()` catches errors | Same | OK |

### Category 9: UI Display

| # | Scenario | Host Behavior | Non-Host Behavior | Status |
|---|----------|---------------|-------------------|--------|
| 9.1 | Lobby player list | From local players Map | From synced PlayerData | OK |
| 9.2 | Start button visibility | Visible, enabled if 2+ | Hidden, "Waiting for host" | OK |
| 9.3 | Countdown display | From local countdown var | From RPC callback | OK |
| 9.4 | In-game player colors | From Ship.color | From PlayerData lookup | OK |
| 9.5 | Game end winner | From winnerId | From winner RPC | OK |
| 9.6 | Game end scores | From players Map | From synced PlayerData | OK |
| 9.7 | Play Again button | Enabled | Disabled, "Waiting..." | OK |
| 9.8 | Leave button | Enabled | Enabled | OK |

### Category 10: Edge Cases & Race Conditions

| # | Scenario | Expected Behavior | Status |
|---|----------|-------------------|--------|
| 10.1 | RPC arrives before gameState | Phase updated from RPC | OK |
| 10.2 | gameState arrives before RPC | No conflict - gameState has no phase | OK |
| 10.3 | Player lookup fails on render | Ship skipped (null check) | OK |
| 10.4 | Projectile expires between syncs | ~50ms visual lag | OK |
| 10.5 | Name change mid-game | Updates on next onPlayersUpdate | OK |
| 10.6 | Host migration during physics | Physics state lost, game ends | OK |
| 10.7 | Multiple dashes queued | Only first processed per release | OK |
| 10.8 | Stale input on round restart | Cleared in clearGameState() | OK |

---

## Category 11: Bot Lifecycle (AI Bots)

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 11.1 | Add AI bot in LOBBY | Bot joins as PlayroomKit player with `botType: "ai"`, unique name | `addBot()` creates player, name = `Bot ${getBotCount()}` | **BUG** |
| 11.2 | Add AI bot during COUNTDOWN | Should restart countdown to include bot | No phase guard - `addAIBot()` only checks player count ≤4 | **BUG** |
| 11.3 | Add AI bot during PLAYING | Should be blocked or added as SPECTATING | No phase guard - bot can be added mid-game | **BUG** |
| 11.4 | Remove AI bot in LOBBY | `player.kick()` removes bot, triggers `onQuit` | Works via `removeBot()` | OK |
| 11.5 | Remove AI bot during PLAYING | Should remove ship/pilot, check win condition | `removePlayer()` handles cleanup | OK |
| 11.6 | AI bot max count | Max 4 total players (humans + bots) | `players.size >= 4` check | OK |
| 11.7 | AI bot with remote players | AI bots allowed alongside remote humans | No restriction on AI + remote | OK |

### 11.1 Bug Detail: Duplicate Bot Names

**Root Cause**: `getBotCount()` counts ALL current bots at call time. If 2 bots exist and one is removed, adding a new bot reuses the count.

More critically: `getBotCount()` returns the total bot count *including the bot being added* (since `addBot()` adds the player to the room before `getBotCount()` is called). Example:
- Add first bot: `getBotCount()` returns 1 → "Bot 1" ✓
- Add second bot: `getBotCount()` returns 2 → "Bot 2" ✓
- Add third bot: `getBotCount()` returns 3 → "Bot 3" ✓

But if bots are removed and re-added, or if `getBotCount()` runs before the bot is tracked in the players Map, names collide. **Screenshot evidence: 3 bots all named "Bot 2"** — suggests a race condition where `getBotCount()` reads stale data or the timing between `addBot()` and player Map population is inconsistent.

**Fix needed**: Use a monotonically increasing bot counter instead of live count. e.g., `private botNameCounter = 0; ... name = \`Bot ${++this.botNameCounter}\``

---

## Category 12: Bot Lifecycle (Local/Human Bots)

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 12.1 | Add local player in LOBBY (no remotes) | Bot joins with `botType: "local"`, assigned keySlot | Works, name = `Player ${players.size}` | OK |
| 12.2 | Add local player when remote exists | Should be blocked | Blocked by `hasRemotePlayers()` check | OK |
| 12.3 | Remote player joins after local added | Should handle gracefully | No guard - local bots persist, creates inconsistent state | **BUG** |
| 12.4 | Local player key slot assignment | Each local player gets unique keySlot (1-3) | Caller provides slot number | OK |
| 12.5 | Local player input capture | MultiInputManager reads keyboard for slot | `multiInput.capture(keySlot)` in game loop | OK |
| 12.6 | Local player dash | Double-tap detection per slot | `multiInput.consumeDash(keySlot)` | OK |
| 12.7 | Remove local player | Deactivate key slot, kick bot | `removeBot()` + slot deactivation | OK |
| 12.8 | Host's own input vs local bot input | Host uses InputManager (slot 0), bots use MultiInputManager | Separate systems, no conflict | OK |

### 12.3 Bug Detail: Remote Joins After Local Bots Added

If a remote player joins a room where local bots already exist:
- `addLocalBot()` blocks future local additions, but existing local bots remain
- Local bot input (keyboard) only works on host machine - remote player sees bot ships but input is host-only
- This may not be a practical issue (rooms with local bots are typically private/offline), but there's no enforcement to prevent it

---

## Category 13: Bot Winner & Scoreboard Display

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 13.1 | Bot wins by kills (5) | Winner name shows bot name | **Shows "Unknown"** | **BUG** |
| 13.2 | Bot wins by elimination | Winner name shows bot name | **Shows "Unknown"** | **BUG** |
| 13.3 | Scoreboard shows all players | Each player on unique row with correct name | **Duplicate "Bot 2" entries, 6 rows for 4 players** | **BUG** |
| 13.4 | Bot kills shown correctly | Kills attributed to correct bot | Kills may be attributed to wrong bot due to name duplication | **BUG** |
| 13.5 | Non-host scoreboard | Same data as host via GameStateSync | Receives `players[]` array from host broadcast | OK (if host data correct) |
| 13.6 | Bot in score track (HUD) | Dot indicators for bot kills | Works same as human players | OK |

### 13.1-13.2 Bug Detail: "Unknown" Winner Name

**Root Cause**: `getWinnerName()` calls `network.getPlayerName(winnerId)`. For bots, this reads `player.getState("customName")`. If the winner is a bot and:
1. The bot's player state has been cleared/reset (e.g., `resetAllPlayerStates` only preserves `customName` but may not preserve it for bots correctly)
2. OR the bot's PlayroomKit player object is no longer in the `players` Map when queried
3. OR the winnerId doesn't match any player in the Map (bot was removed/cleaned up before the UI reads it)

...then `getPlayerName()` falls through to `Player ${index + 1}`, and if the player isn't found at all, returns undefined → UI shows "Unknown".

**Most likely cause**: The `resetAllPlayerStates(["customName"])` call uses PlayroomKit's `resetPlayersStates` which resets all player states to defaults EXCEPT the listed keys. But `botType` and `keySlot` are NOT in the preserve list, so after `restartGame()` these fields get wiped — meaning `isBot()` still returns true (PlayroomKit internal), but `getState("botType")` returns the default (`null`).

However, for the "Unknown" winner issue specifically: the winnerId is a bot's player ID, and `getPlayerName()` looks up the player in the Map. If the bot was removed between game end and UI render, the lookup fails.

### 13.3 Bug Detail: Duplicate Scoreboard Entries

**Root Cause**: The `broadcastState()` in `Game.ts` sends `players: [...this.players.values()]`. The `applyNetworkState()` on the client does:
```typescript
state.players.forEach((playerData) => {
  this.players.set(playerData.id, playerData);
});
```

If bot IDs are duplicated (multiple bots sharing the same PlayroomKit player ID — unlikely) OR if the players array contains stale entries that aren't being cleaned up properly, duplicates appear.

**More likely cause**: Bots from a previous game session persist in the room. When the host leaves and creates a new room, `resetState()` clears the local Map, but the PlayroomKit room may still have old bots registered. When `onPlayerJoin` fires for the new room, old bots re-register alongside new ones. The names are all "Bot 2" because `getBotCount()` returned 2 for each (race condition).

**Screenshot evidence**: 6 entries (Salad67, Bot 1, Pirate48, Bot 2, Bot 2, Bot 2) for what should be 4 players. This suggests ghost bot entries persisting across sessions.

---

## Category 14: Bot State Across Game Restart

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 14.1 | Play Again with bots | Bots remain in room, kills reset to 0 | `resetAllPlayerStates(["customName"])` resets kills but also wipes `botType`/`keySlot` | **BUG** |
| 14.2 | Bot kills reset on restart | All bot kills → 0 | `clearGameState()` resets local `player.kills = 0` | OK (local) |
| 14.3 | Bot type preserved on restart | `botType` remains "ai" or "local" | `resetAllPlayerStates` does NOT preserve `botType` — only `customName` | **BUG** |
| 14.4 | Local bot keySlot preserved | `keySlot` persists for correct input mapping | `resetAllPlayerStates` does NOT preserve `keySlot` | **BUG** |
| 14.5 | Bot names preserved on restart | Bot keeps "Bot 1", "Bot 2" etc. | `customName` IS preserved (in the keep list) | OK |
| 14.6 | Bot re-added after restart | Not needed if bots persist | Bots stay in room as players | OK |

### 14.1/14.3/14.4 Bug Detail: resetAllPlayerStates Wipes Bot Fields

```typescript
// NetworkManager.ts:307
await resetPlayersStates(["customName"]); // Keep custom names
```

This preserves ONLY `customName`. The defaults from `insertCoin` are:
```typescript
defaultPlayerStates: {
  kills: 0,
  playerState: "ACTIVE",
  input: null,
  botType: null,     // ← Reset to null!
  keySlot: undefined // ← Reset to undefined!
}
```

After restart, `getPlayerBotType()` returns `null` for all bots. The game loop's bot input branch (`if (isBot && botType === "ai")`) won't execute → bot ships won't receive any input and will fly straight into walls. Local bots lose their `keySlot` so `multiInput.capture()` gets `-1` and returns no input.

**Fix needed**: Change preserve list to `["customName", "botType", "keySlot"]`

---

## Category 15: Bot + Room Session Transitions

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 15.1 | Host leaves room with bots | Bots should be cleaned up or transferred | Bots stay in PlayroomKit room; `resetState()` clears local Map only | **BUG** |
| 15.2 | Host creates new room after leaving bot room | New room has no bots | `resetState()` clears local Map, but old room's bots may linger in PlayroomKit | OK (new insertCoin) |
| 15.3 | Non-host leaves room with bots | Local state cleared, bots remain for host | `resetState()` clears local, bots unaffected | OK |
| 15.4 | Host disconnects, new host inherits bots | New host should be able to manage bots | Bot AI only runs on host; new host would need to detect existing bots and run AI | **BUG** |
| 15.5 | All humans leave, bots alone in room | Room should be cleaned up | Bots can't self-clean; room persists until PlayroomKit timeout | OK (by design) |

### 15.1 Bug Detail: Orphaned Bots on Host Leave

When host calls `leaveGame()`:
1. `network.disconnect()` → `player.leaveRoom()` for the host only
2. Bots are NOT explicitly removed via `player.kick()`
3. If a new host is assigned, the bots remain but:
   - New host may not have bot AI running (AstroBot instances are local to the original host)
   - `onHostChanged` doesn't re-initialize bot AI
4. Bots become "zombie players" — present in room but with no input

### 15.4 Bug Detail: Bot AI Lost on Host Migration

Bot AI decisions are computed in `Game.update()` on the host. The `AstroBot` class instances exist only in the host's memory. When host migrates:
- New host has no `AstroBot` instances
- `player.bot` may not be accessible on the new host
- Bot ships will receive no input and drift until they die

---

## Category 16: Bot Input & Physics

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 16.1 | AI bot fires projectile | Host creates projectile, broadcasts sound RPC | Works identically to human player fire | OK |
| 16.2 | AI bot dashes | Host applies dash directly (no RPC needed since host-local) | Dash applied via `shouldDash` flag in game loop | OK |
| 16.3 | AI bot gets killed | Ship destroyed, pilot created, timer for respawn | Same code path as human player | OK |
| 16.4 | AI bot kills human | Kill attributed to bot, win check triggered | Same code path | OK |
| 16.5 | AI bot targeting accuracy | Should feel fair/fun, not perfect | Configurable tolerances (AIM_TOLERANCE: 0.25, FIRE_PROBABILITY: 0.7) | OK |
| 16.6 | AI bot wall avoidance | Should not fly into walls repeatedly | WALL_MARGIN: 80, rotates away from walls | OK |
| 16.7 | AI bot danger detection | Should try to dodge incoming projectiles | DANGER_RADIUS: 150, predicts projectile paths | OK |
| 16.8 | Local bot fires projectile | Same as human player fire | Host creates, sound broadcast | OK |
| 16.9 | Local bot dash | MultiInputManager double-tap detection | `consumeDash(keySlot)` in game loop | OK |

---

## Category 17: Bot + Non-Host Client Display

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 17.1 | Non-host sees bot ships | Rendered from `networkShips[]` | Same rendering path as human ships | OK |
| 17.2 | Non-host sees bot pilots | Rendered from `networkPilots[]` | Same rendering path | OK |
| 17.3 | Non-host sees bot in scoreboard | Bot name + kills in score track | Works if PlayerData is correct | OK (depends on 13.x) |
| 17.4 | Non-host sees bot badge in lobby | Robot icon SVG badge for AI bots | Reads `botType` from player state | OK |
| 17.5 | Non-host sees key preset for local bot | Key preset label shown | Reads `keySlot` from player state | OK (N/A - local bots offline only) |
| 17.6 | Non-host bot color sync | Bot color matches host's assignment | Color from PlayerData via GameStateSync | OK |
| 17.7 | Non-host cannot add/remove bots | Buttons hidden or disabled | `addAIBot()` / `addLocalBot()` guard with `isHost()` | OK |

---

## Category 18: Bot Edge Cases & Race Conditions

| # | Scenario | Expected Behavior | Current Behavior | Status |
|---|----------|-------------------|------------------|--------|
| 18.1 | Add bot rapidly (spam click) | Only add one, or queue | No debounce - multiple `addBot()` calls can fire simultaneously | **BUG** |
| 18.2 | Remove bot during COUNTDOWN | Recount players, cancel if <2 | `removePlayer()` checks and returns to LOBBY if <2 | OK |
| 18.3 | Remove bot during PLAYING | Ship/pilot cleaned up, win check | `removePlayer()` handles cleanup + `checkEliminationWin()` | OK |
| 18.4 | `addBot()` timing vs `onPlayerJoin` | Bot should be in players Map before name is set | `getPlayerByBot()` searches Map AFTER `addBot()` resolves, but Map population depends on `onPlayerJoin` callback timing | **BUG** |
| 18.5 | Bot added when room is exactly at 4 | Rejected with "Room is full" | `players.size >= 4` check | OK |
| 18.6 | `addLocalBot()` with same keySlot twice | Should be rejected | No duplicate keySlot check | **BUG** |
| 18.7 | Bot persists after `clearGameState()` | Bot stays in room, local PlayerData reset | `clearGameState()` resets kills/state but doesn't remove bots | OK (by design) |
| 18.8 | Multiple `removeBot()` on same bot | Should be idempotent | `player.kick()` may throw on already-removed bot | **MINOR** |

### 18.1 Bug Detail: No Add-Bot Debounce

If the user clicks "Add AI Bot" rapidly, multiple `addBot()` calls fire before the previous one resolves. Each checks `players.size >= 4` but the size hasn't been updated yet (async), so all pass. This can result in more than 4 players.

### 18.4 Bug Detail: `getPlayerByBot()` Race

```typescript
const bot = (await addBot()) as AstroBot;
const botPlayer = this.getPlayerByBot(bot); // Searches players Map
```

`getPlayerByBot()` iterates the `players` Map looking for a player whose `.bot` property matches. But the `players` Map is populated by `onPlayerJoin` which fires asynchronously. If `onPlayerJoin` hasn't fired yet when `getPlayerByBot()` runs, it returns `null` and the bot never gets its `customName`, `botType`, or `keySlot` set.

### 18.6 Bug Detail: Duplicate KeySlot

`addLocalBot(keySlot)` doesn't check if another local bot already has that keySlot. If called twice with the same slot, two bots would read from the same keyboard keys → both move identically.

---

## Identified Bugs Summary

### Critical (Gameplay-Breaking)

| # | Bug | Impact | Status | Fix Applied |
|---|-----|--------|--------|-------------|
| B1 | **"Unknown" winner when bot wins** | Winner display broken | **FIXED** | Winner name stored eagerly in `endGame()` and `onWinnerReceived` |
| B2 | **Duplicate bot names ("Bot 2" x3)** | Confusing, indistinguishable bots | **FIXED** | Monotonic `botNameCounter` instead of `getBotCount()` |
| B3 | **Duplicate scoreboard entries** | 6 rows for 4 players, kills misattributed | **FIXED** | Duplicate join guard in `onPlayerJoin` |
| B4 | **`resetAllPlayerStates` wipes bot fields** | Bot AI stops working after "Play Again" | **FIXED** | Preserve list now includes `botType` and `keySlot` |

### High (Sync Issues)

| # | Bug | Impact | Status | Fix Applied |
|---|-----|--------|--------|-------------|
| B5 | **No phase guard on bot addition** | Bot added during PLAYING with no ship/spawn logic | **FIXED** | Phase guard (`this.phase !== "LOBBY"`) in `addAIBot()` / `addLocalBot()` |
| B6 | **Bot AI lost on host migration** | Zombie bots with no input after host leaves | **BY DESIGN** | Match ends on host migration; bots restart naturally in next game |
| B7 | **Orphaned bots on host leave** | Bots persist in room without cleanup | **BY DESIGN** | PlayroomKit destroys room when host leaves (solo) or assigns new host (multiplayer). Kicking bots before `leaveRoom()` corrupts PK state. |
| B8 | **`getPlayerByBot()` race condition** | Bot state (name/type/slot) never set if `onPlayerJoin` fires late | **FIXED** | Uses `player.bot === bot` reference comparison with fallback |

### Medium (UX Issues)

| # | Bug | Impact | Status | Fix Applied |
|---|-----|--------|--------|-------------|
| B9 | **No add-bot debounce** | Can exceed 4 player limit with rapid clicks | **FIXED** | `addingBot` flag prevents concurrent adds |
| B10 | **Duplicate keySlot allowed** | Two local bots share same keyboard inputs | **FIXED** | `getUsedKeySlots()` check before `addLocalBot()` |
| B11 | **Remote joins after local bots** | Local bots exist in online room — input only on host | **KNOWN** | Low priority — local bot rooms are effectively private |

---

## Known Characteristics (By Design)

1. **~50ms position lag** - Inherent to 50ms sync interval (5.2, 5.7, 10.4)
2. **Kills dual-channel** - setState for authority, gameState for display (7.4) - intentional
3. **Bots persist after game end** - Stay in room until explicitly kicked or room closes (18.7)
4. **Local bots are offline-only** - Cannot coexist with remote players by design (12.2)
5. **Bot AI is host-only** - Decision logic runs exclusively on host, no network overhead (16.x)

---

## Verification Checklist

Test these scenarios with 2 players (P1=host, P2=non-host):

### Session Cleanup
- [ ] P1 creates room, P2 joins, both leave
- [ ] P2 creates new room, P1 joins
- [ ] Verify P2 is now host (index 0, cyan)
- [ ] Verify P1 is non-host (index 1, magenta)

### Color Sync
- [ ] Both players see correct colors on own ship
- [ ] Both players see correct colors on other's ship
- [ ] Colors persist after ship destruction/respawn

### Phase Transitions
- [ ] Countdown shows on both screens (3, 2, 1, FIGHT!)
- [ ] Both enter PLAYING simultaneously
- [ ] Winner announcement shows on both screens

### Sound Sync
- [ ] P1 fires - both hear sound
- [ ] P2 fires - both hear sound
- [ ] P1 dashes - both hear sound
- [ ] P2 dashes - both hear sound
- [ ] Ship destroyed - both hear explosion
- [ ] Game won - both hear win fanfare

### Input Cleanup
- [ ] Mash buttons at round end
- [ ] Start new round
- [ ] Verify no stray bullets fire

### Host Migration
- [ ] P1 leaves during PLAYING
- [ ] P2 becomes host, game ends
- [ ] Winner determined correctly

### Bot: AI Bot Basics
- [ ] Host adds 1 AI bot in lobby
- [ ] Bot appears with unique name ("Bot 1")
- [ ] Bot has correct color assignment
- [ ] Start game - bot ship spawns correctly
- [ ] Bot makes AI decisions (rotates, fires, dashes)
- [ ] Bot can be killed - pilot appears, respawns
- [ ] Bot can kill player - kill attributed correctly
- [ ] Game end shows correct winner name (not "Unknown")

### Bot: Multiple AI Bots
- [ ] Add 3 AI bots (total 4 players)
- [ ] Verify each has unique name (Bot 1, Bot 2, Bot 3)
- [ ] Verify 4th bot button is disabled (room full)
- [ ] All bots visible in scoreboard with correct separate entries
- [ ] Scoreboard shows exactly 4 rows, not more

### Bot: AI Bot + Online Player
- [ ] P1 (host) adds 1 AI bot
- [ ] P2 joins room
- [ ] All 3 players visible in lobby
- [ ] Bot appears correctly on P2's screen
- [ ] Start game - all 3 ships spawn
- [ ] Bot plays correctly from both perspectives
- [ ] Winner display correct for bot/human win

### Bot: Game Restart with Bots
- [ ] Play a game with bots, game ends
- [ ] Host clicks "Play Again"
- [ ] Bots remain in lobby
- [ ] Bot names preserved
- [ ] Start new game - bots still have AI (not frozen)
- [ ] Bot kills reset to 0

### Bot: Local Player Basics (Offline)
- [ ] Host adds local player (keySlot 1)
- [ ] Key preset label shown (e.g., "Arrows")
- [ ] "Add Local Player" button hidden when remote player exists
- [ ] Local player responds to assigned keyboard keys
- [ ] Local player can fire and dash independently

### Bot: Bot Removal
- [ ] Remove AI bot in lobby - disappears from list
- [ ] Remove bot during game - ship removed, win check triggers
- [ ] Add new bot after removal - unique name (not reused)

### Bot: Session Cleanup with Bots
- [ ] Host plays with bots, leaves room
- [ ] Host creates new room
- [ ] Verify no ghost bots from previous room
- [ ] Scoreboard shows only current room players

### Bot: Host Migration with Bots
- [ ] P1 adds bot, P2 in room
- [ ] P1 leaves during PLAYING
- [ ] Verify game ends correctly
- [ ] Verify bot behavior after host change (may freeze — known issue)

---

## Architecture Reference

### Data Flow Summary

```
HOST:
- Runs Matter.js physics (authoritative)
- Creates/destroys Ship, Pilot, Projectile objects
- Runs AI bot decisions in game loop (AstroBot.decideAction())
- Captures local bot keyboard input (MultiInputManager)
- Broadcasts GameStateSync every 50ms (unreliable):
  - ships[], pilots[], projectiles[] positions
  - players[] for UI display (names, colors, kills)
- Broadcasts events via RPC (reliable, one-time):
  - phase changes
  - countdown ticks
  - winner announcement
  - game sounds
  - dash acknowledgment

NON-HOST:
- Sends input via player.setState (unreliable, every frame)
- Sends dash via RPC (reliable, one-time)
- Receives GameStateSync: positions + player data for rendering
- Receives RPC: phase, countdown, winner, sounds
- Does NOT create physics objects, only renders
- Does NOT run bot AI — bots appear as regular ships in networkShips[]

BOT INPUT FLOW:
  AI Bot:     AstroBot.decideAction() → { buttonA, buttonB, dash } → applied directly on host
  Local Bot:  MultiInputManager.capture(keySlot) → PlayerInput → applied directly on host
  Human:      player.getState("input") from network → applied on host
```

### Key Files

| File | Purpose |
|------|---------|
| `NetworkManager.ts` | PlayroomKit integration, RPC handlers, state sync, bot CRUD |
| `Game.ts` | Game logic, entity management, host/non-host branches, bot input routing |
| `AstroBot.ts` | AI bot class (extends PlayroomKit Bot), decision logic |
| `MultiInputManager.ts` | Local player keyboard input per slot (4 presets) |
| `Input.ts` | Local input capture, dash detection (host's own input) |
| `Ship.ts` | Ship physics, input application |
| `AudioManager.ts` | Sound effects with Tone.js |
| `types.ts` | GameStateSync, PlayerData, etc. |
| `main.ts` | UI rendering, bot add/remove buttons, scoreboard display |
