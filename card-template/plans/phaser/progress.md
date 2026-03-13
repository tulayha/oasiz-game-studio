# Phaser Renderer — Progress Tracker

## Goal
Compare Phaser 3 (scene-based) vs PixiJS (manual container management) for the card template.
The hypothesis: Phaser scenes reduce custom infrastructure — lifecycle, input routing, resize, and
layer management are handled by the engine, making the template easier to fork into new card games.

---

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Phaser installed; VITE_USE_PHASER feature flag in cards-main | ✅ Done |
| 2 | PhaserCardGame + CardBootScene + CardGameScene skeleton | ✅ Done |
| 3 | PhaserTable (deck + discard, tap callback) | ✅ Done |
| 4 | PhaserCard (flip/lift) + PhaserFlyCard (tween) | ✅ Done |
| 5 | PhaserLocalFan (addCard, throwCard, drag-to-throw) | ✅ Done |
| 6 | PhaserOpponentFan (hand count, name, avatar, visibility) | ✅ Done |
| 7 | PhaserTurnHUD (names, avatars, turn glow) | ✅ Done |
| 8 | bridge.init() wiring + resize | ✅ Done |
| 9 | Background from assets or gradient; textures; avatar loading | ✅ Done |

---

## Phase 1 — Done ✅
- Phaser `^3.90.0` already in package.json
- Added `VITE_USE_PHASER` env flag to `cards-main.ts`
- `CardGameRenderer` swaps between `PixiCardGame` and `PhaserCardGame` at import time
- Created `src/phaser-cards/` directory

---

## Phase 2 — Done ✅

### Files created
- `src/phaser-cards/PhaserCardGame.ts` — creates `Phaser.Game`, injects data via registry, destroys cleanly
- `src/phaser-cards/scenes/CardBootScene.ts` — generates `"card-back"` and `"card-felt"` RenderTextures, then launches CardGameScene
- `src/phaser-cards/scenes/CardGameScene.ts` — reads registry, runs `calcLayout`, creates layer containers, draws gradient background fallback

### Key Phaser pattern noted vs Pixi
- **No manual layer z-ordering** — Phaser display list order is explicit; containers behave the same
- **Registry** replaces constructor prop-drilling into scenes: `game.registry.set("bridge", bridge)`
- **Scene lifecycle** (`preload → create → update`) is built-in vs Pixi's manual async init
- `CardBootScene` handles texture pre-generation before `CardGameScene` runs — cleaner than Pixi's deferred async init

### Checkpoint
Run with `VITE_USE_PHASER=true bun run dev` — CardGameScene opens with background color and no errors.

---

## Phase 3 — Done ✅

### Files created
- `src/phaser-cards/PhaserTable.ts` — extends `Phaser.GameObjects.Container`; draws felt, deck stack (3 shadow layers + top card + count label), discard zone; deck is interactive with `pointerover/out` cursor changes

### Wired in CardGameScene
- `table.onDrawRequest` connected to `bridge.requestDraw()` with `_drawLocked` guard
- `table.reposition(zones)` called in `onResize`

### Key Phaser pattern noted
- `scene.add.existing(this)` inside the Container subclass constructor registers it with the scene automatically — no manual `addChild` in the parent needed (though we still `tableLayer.add(table)` for z-ordering)
- `setInteractive(new Phaser.Geom.Rectangle(...), Phaser.Geom.Rectangle.Contains)` on a Container is the idiomatic hit-area approach vs Pixi's transparent overlay graphics
- `scene.add.graphics()` / `scene.add.text()` must be used (not `new Graphics()`) inside Container subclasses to keep objects owned by the scene's display list

---

## Phase 4 — Done ✅

### Files created
- `src/phaser-cards/anim.ts` — timing + ease constants (ms, Phaser ease strings); mirrors `gsapPixi.ts`
- `src/phaser-cards/PhaserCard.ts` — Container with bottom-center origin, back/front children at offset (-W/2, -H), two-phase scaleX flip via `scene.tweens`, instant lift nudge, `setInteractable()`
- `src/phaser-cards/PhaserFlyCard.ts` — transient Container, `flyTo()` via `scene.tweens`, `spawnFlyCard()` factory helper

### Key Phaser pattern noted vs Pixi
- **No GSAP needed** — `scene.tweens.add()` replaces `gsap.to()` for all card animations; the tween system is part of the scene lifecycle so tweens are automatically paused/resumed with the scene
- `scene.tweens.killTweensOf(target)` replaces `gsap.killTweensOf(target)` for cleanup
- `scene.add.existing(this)` inside Container subclasses keeps ownership clear; calling destroy from outside kills scene-owned children automatically

---

## Phase 5 — Done ✅

### Files created/updated
- `src/phaser-cards/PhaserLocalFan.ts` — MAX_VISIBLE=6 carousel fan, arrow pills, drag-to-throw, scroll gesture, `tweenToLayout` via `scene.tweens`
- `src/phaser-cards/scenes/CardGameScene.ts` — wired draw/throw callbacks, dummy mode hand seeding, scene-level input routing (`pointermove/down/up → localFan`)

### Key Phaser pattern noted vs Pixi
- **Scene input events** (`this.input.on('pointermove', ...)`) replace stage-level Pixi events — cleaner, automatically scoped to the scene and cleaned up on shutdown
- `scene.time.delayedCall(ms, cb)` replaces `gsap.delayedCall(s, cb)` for post-layout interactivity finalization — same pattern, scene-owned so it pauses with the scene
- No separate `flyLayer.removeChild(fly)` needed — `PhaserFlyCard.flyTo()` self-destructs, and the `spawnFlyCard` factory handles layer cleanup

---

## Phase 6 — Done ✅

### Files created
- `src/phaser-cards/PhaserOpponentFan.ts` — spring pop-in/out, name pill, count badge, CORS avatar with colored ring per slot (A=gold, B=blue, C=red)
- `src/phaser-cards/loadAvatarTexture.ts` — HTML Image → canvas → `scene.textures.addCanvas()` for CORS-safe avatar loading

### Wired in CardGameScene
- Three fans at slots A/B/C instantiated in `create()`, added to `opponentLayer`
- `updateOpponentSlot(slot, data)` — public API to show/hide/update a single slot
- `syncOpponents()` — reads `bridge.getPlayers()` and wires all 3 at once
- All three fans repositioned on resize

### Design upgrades applied across all phases
- `PhaserCard.buildBack()` — shine strip at top (glass-like highlight)
- `PhaserFlyCard` — drop shadow + diagonal stripes + shine strip; launches at scale 1.12 (punch-off feel)
- `PhaserLocalFan.tweenToLayout()` — visible cards use `Back.easeOut` for springy snap
- Fixed: `throwCard()` now calls `table.updateDiscardPile(card)` on fly completion

### Key Phaser pattern noted
- Avatar loading pattern reused from pixi-cards, adapted to `scene.textures.addCanvas()` instead of `PIXI.Assets`
- `Back.easeOut` (spring ease) available out of the box — no custom easing needed

---

## Phase 7 — Done ✅

### Files created
- `src/phaser-cards/PhaserTurnHUD.ts` — pulsing glow ring per active slot, "YOUR TURN" pop banner for local player, local player name pill with green border

### Wired in CardGameScene
- HUD instantiated in `create()`, added to `hudLayer` (topmost layer)
- Slot positions set from layout for all 4 slots on init and resize
- `setActiveTurn(playerId)` — public scene method: moves glow ring, updates interactivity, flashes banner on local turn; ready for Phase 8 bridge wiring

### Key Phaser pattern noted
- Pulsing animations with `yoyo: true, repeat: -1` are extremely clean — one tween replaces manual requestAnimationFrame loops
- `scene.time.delayedCall()` inside a tween `onComplete` chains "flash then fade" without nesting

---

## Phase 8 — Done ✅

### Wired in CardGameScene
- `initBridge()` private method called from `create()` (skipped when `isDummy`)
- `onTurnChange` → `setActiveTurn(playerId)` — moves glow, enables/disables interactivity
- `onDiscardTopChange` → `table.updateDiscardPile(card)`
- `onDeckCountChange` → `table.updateDeckCount(count)`
- `onOpponentHandCountChange` → `opponentFans.get(slot)?.setHandCount(count)`
- `onGamePhaseChange` → `onGamePhaseChange?.(phase)` + `gameplayStart/Stop` via SDK cast
- `onPlayersUpdate` → `syncOpponents()` + HUD slot visibility sync
- Host calls `bridge.initializeDeck(config.deck.totalCount)` to boot the first turn
- Dummy mode gets `turnHUD.setActiveTurn("local")` so glow shows immediately in testing
- `shutdown()` calls `gameplayStop()` on scene exit

### Key Phaser pattern noted
- Phaser's `Scale.RESIZE` mode + the `scale.on("resize", ...)` listener handles all resize automatically — no custom window listener needed (unlike Pixi)

---

## Phase 9 — Done ✅

### Changes
- `CardGameScene.preload()` — tries `this.load.image("bg", "/assets/background.png")`; silently no-ops if missing
- `CardGameScene.drawBackground()` — if `"bg"` texture exists, uses a display-size-matched Image; else gradient fallback unchanged
- `CardBootScene.generateCardBackTexture()` — upgraded to full design: drop shadow, gold border, diagonal stripes, inner border, shine strip — matches `PhaserCard.buildBack()` exactly
- `PhaserFlyCard.draw()` — now uses `scene.add.image(..., "card-back")` from BootScene texture; single draw call, zero Graphics overhead; Graphics fallback retained for safety

### Key Phaser pattern noted
- Phaser's `RenderTexture.saveTexture(key)` bakes a Graphics draw into a reusable texture — the fly card and deck stack share the exact same pixels as the hand card backs with zero extra runtime cost

---

## Observations (updated as phases complete)

- [x] **Registry reduces prop-drilling** — `game.registry.set/get` replaces constructor chains; scenes stay decoupled from the outer app. Clear win vs Pixi.
- [x] **Scene lifecycle is a meaningful win** — `preload → create → update` + built-in tween/timer ownership means less manual cleanup. Pixi requires tracking every tween manually.
- [x] **Input routing was a wash** — Phaser's exclusive Container children bug forced manual hit-testing anyway, ending up with the same pattern as Pixi. No net gain here.
- [x] **`scene.tweens` is a drop-in GSAP replacement** — `killTweensOf`, `delayedCall`, `yoyo`, `repeat: -1`, ease strings all present. Saves the GSAP dependency entirely.
- [x] **Scale Manager is a genuine win** — `Phaser.Scale.RESIZE` + `scale.on("resize", ...)` handles canvas sizing, devicePixelRatio, and coordinate mapping automatically. Pixi requires manual `window.addEventListener("resize", ...)` + canvas style updates.
- [x] **Texture/asset management is comparable** — `scene.load.image()` + `textures.exists()` is roughly equivalent to Pixi's `Assets.load()` + `Assets.cache.has()`. Phaser's `RenderTexture.saveTexture()` is a clean way to bake procedural graphics into a reusable key, which has no direct Pixi equivalent.

## Overall verdict (all 9 phases complete)

**Where Phaser wins:**
- Registry eliminates all config prop-drilling into scenes
- Built-in scene lifecycle (`preload → create → update`) with owned tweens/timers that auto-pause
- `scene.tweens` replaces GSAP entirely — no extra dependency
- Scale Manager handles resize + coordinate math automatically
- `RenderTexture.saveTexture()` for baked procedural assets

**Where it's a wash or Pixi wins:**
- Container exclusive-child input clearing bug forced manual hit-testing — identical to Pixi's approach
- Display list management (z-order, layers) is the same pattern in both
- Both need the same `fanMath`, `CardGameEngine`, `PlayroomBridge` — cards-core is 100% renderer-agnostic

**Net conclusion:** Phaser reduces ~150–200 lines of custom infrastructure (GSAP dep, manual resize listener, coordinate math, tween cleanup). The template is easier to fork in Phaser because the scene scaffold gives you lifecycle and input scope for free.
