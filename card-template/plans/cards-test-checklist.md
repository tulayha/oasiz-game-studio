# Multiplayer Card Game Template — Test Checklist

---

## Test Checklist

**Connection and lobby:**
- [ ] Open two tabs, Tab A creates room, Tab B joins via code.
- [ ] Both tabs show lobby with correct player names and count.
- [ ] Closing Tab B removes that player from Tab A's lobby.
- [ ] Ready-up flow: both press Ready, host sees "Start Game" enabled.

**Layout (portrait):**
- [ ] Local fan sits in bottom 35% of viewport.
- [ ] Deck and discard pile visible in center band.
- [ ] With 2 players: only top-center opponent slot shown.
- [ ] With 4 players: all three opponent slots filled.
- [ ] Settings button at least 120px from top on pointer:coarse device.
- [ ] Resize to landscape and back: layout recovers without breaking.

**Draw animation:**
- [ ] Tapping deck (on your turn) produces a card fly from deck → fan.
- [ ] Local fan grows by one card; fan re-layouts smoothly.
- [ ] Other players' view of your fan (card-back count) immediately updates to +1.
- [ ] Tapping deck on opponent's turn fires error haptic, does nothing.

**Throw animation:**
- [ ] Tapping a card in fan lifts it, then flies to discard pile.
- [ ] Fan shrinks; remaining cards close the gap (200ms tween).
- [ ] Discard pile top updates to show the thrown card's color and symbol.
- [ ] Other players see your fan count drop by 1.
- [ ] Turn advances to next player.

**PlayroomKit sync:**
- [ ] `currentTurn` highlighted correctly on both tabs simultaneously.
- [ ] Deck is tappable only on your turn.
- [ ] When remote player draws, their local tab shows fly animation and their tab's fan grows; your tab sees opponent fan count +1.

**PixiJS variant specific:**
- [ ] Card flip (face-down fly → face-up land) is smooth with no scale glitch.
- [ ] Fan re-layout tween does not stutter.
- [ ] PixiFlyCard is properly destroyed after animation (no memory leak).

**Phaser variant specific:**
- [ ] Phaser tweens for fan re-layout run at 60fps.
- [ ] `CardBootScene` completes texture generation before `CardGameScene.create()` runs.
- [ ] `CardGameScene.shutdown()` removes all event listeners cleanly.

**Settings:**
- [ ] Music, FX, Haptics toggles work.
- [ ] Settings persist across page reload (localStorage).
- [ ] Modal closes on outside tap.

**Oasiz SDK:**
- [ ] `oasiz.gameplayStart()` fires when table becomes visible (check console).
- [ ] `oasiz.triggerHaptic("medium")` fires on draw and throw.
- [ ] `oasiz.shareRoomCode(code)` fires on connect; `shareRoomCode(null)` on leave.
