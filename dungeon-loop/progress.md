Original prompt: Haritayı güncelle (yanında - olanlar collidere sahip olmaması gerekenler eğer yanında - varsa onun önceki bloğunun collider ayarları korunacak)
Eğer  bir yerde parantez içinde bir şey yazılmışsa ve aşağıda o yazılmış şey varsa o kısım (start) olduğu yerden oraya koyulacak demektir (kolay anlaşılması adına yapılmıştır) eğer tilenin yanında parantez içinde sayı varsa bu o derece kadar döndürülmesi gerektiğini söyler örneğin 20(90)
Eğerki o tilenin parantez içinde / işareti ve numara varsa o tilenin üstüne işaretli tileyide koy, üst üste designli özel tileler için duvar üstüne meşale koyma gibi, örnek kullanım: 233(/196). Eğer bir bloktan önce parantez varsa ve içinde oda kodu yazıyorsa mesela (room3/up)79 bu bu bloktan sonra odayı getir demektir, yanında / da yazanda hangi yönde doğru oda oluşmalıdır onu söyler, up yukarı down aşağı left sola right sağa doğru odayı oluşturmalıdır. Mesela 0 0  (room3/up)54(90) 0 0 burda 90 derece döndürülmüş 54 ün üst tarafından room3 ü başlatmalıdır. (spawn) karakterin spawnlanıcağı tileyi gösterir. Eğer bir objenin yanında * varsa bu ne olursa olsun o objenin collideri olması gerektiğini vurgular. Aynı zamanda oyunda key ve doorlar bulunur, her key bir doğru açar ve bu keylerin spawn olması ve eşleşmesi aşağıda yapılmıştır, örnek key spawnı şudur key[1] 1 o keyin id sidir ve door[1] i açar. Karakter anahtara değindiğinde anahtar yok olmalı ve karakterin bünyesine geçmelidir. Eğer anahtarına sahipse kapıya değdiğinde kapı direktmen yok olmalıdır. Kapılar colliderli olmalıdır. Keyler değince alınmalıdır. Örnek kapı a510(door[1]) örnek anahtar a228(key[1]) şeklindedir. Eğer objede animasyon varsa şu şekildedir {a123,a124,a125[0.1]} içeriye her frame virgülle ayrılarak yazılmalı en son kareli parantez içinde kareler arası kaç saniye bekleneceği yazmaktadır. Animasyondaki frameler bitince başa dönüp animasyonu döngülemelelidir. Aynı zamanda aşağıda bazı atamalar vardır, o atamaları değişken gibi düşün ve atamayı yerinde gördüğünde direkt öyle kullan. Aynı zamanda hem rotasyonu dönük hem kapıya sahip objeler olabilir, bunlar örneğin 54(90)(a510(door[2])) gibi kullanımlara sahip olur, objeyi dönük koyup üstüne kapıyı koyman gerekir basit bir kullanımı vardır. Eğer parantez içinde rotasyon amacıyla (-1) yazıyorsa tam tersi yöne baktır demektir, sola bakıyorsa sağa sağa bakıyorsa sola baktırmalı.

b172- b173- b173- b174- b175- b176- b177-
b480- b362(/bTorch)- b362- b362(/bPainting2)- b362- b362- b362(/bTorch)-
b480- b126(/bCrate1)* b127 b120 b121 b122 b123
b480- b146 b147(spawn) b140 b141 b142 b143
b480- b124 b125(a228(key[1])) b126 b127 b120 b121
b480- b144 b145 b146 b147 b140 b141 b120(a510(door[1])) b121 b120 b125 (room2/right)
b480- b521* b127 b120 b121 b122 b123 b272- b273- b274 - b275-
b480- b522* b147 b140 b141 b142(/bSkulls) b143(/bVase1) b292- b293- b294- b294-
b192- b193- b193- b193- b193- b193- b197- b313- b314- b315- b316-
b292- b293- b294- b295- b296- b296- b297- 
b312- b313- b314- b315- b314- b316- b317-

Room2
0 0 0  (room3/up)b42 0 0
0 0 0  b42(b520(door[2])) 0 0
b172- b173- b173- b42 b175- b176- b177-
b480- b362(/bTorch)- b362(/pChain)- b62 b362- b362(/pChain)- b362(/bTorch)-
b480- b146(/bVaseBroken2) b147 b140 b141 b142(bCrate2)* b143
b480- b124 b125(a228(key[2])) b126 b127 b120(/bBooks) b121
b480- b144 b145 b146 b147 b140 b141
(start)b126 b126 b127(bBlood) b120 b121 b122 b123
b277- b146 b147 b140 b141 b142(bBlood) b143(bChair2)* 
b294- b293- b294- b295- b296- b296- b297- 
b312- b313- b314- b315- b314- b316- b317-

Room3
b172- b173- b173- b174- b175- b176- b177-
b480- b362(/bTorch)- b362(/bPainting3)- b362- b362(bPainting2)- b362(/pChain)- b362(/bTorch)-
b480- b146(/bVase2) b147 b140 b141 b142(bCrate2)* b143
b480- b124(/bSkulls) b125(bAcid) b126(bAcid) b127 b120(/bBooks) b121
b480- b144 b145 b146 b147 b140 b141 b120 b121 b122 b123 
b480- b126((bBooks) b127 b120 b121(bAcid) b122 b123 b140 b141 b142 b143(room4/right)
b390- b146(/bChair1)* b147 b140 b141 b142 b143 b292- b293- b296- b297- 
b294- b293- b294- b42 b296- b296- b297- b312- b313- b314- b317-
b312- b313- b314- b42(start)  b314- b316- b317-

Room4
b172- b173- b173- b174- b175- b176- b177-
b480- b362(/bTorch)- b362(/bPainting3)- b362- b362(bPainting2)- b362(/pChain)- b362(/bTorch)-
b480- b146(/bVase2) b147 b140 b141 b142(bCrate2)* b143
b480- b124(/bSkulls) b125(bAcid) b126(bAcid) b127 b120(/bBooks) b121
b42 b144 b145 b146 b147 b140 b141
(start)b42 b126((bBooks) b127 b120 b121(bAcid) b122 b123
b390- b146(/bChair1)* b147 b140 b141 b142 b143 
b294- b293- b294- b314- b296- b296- b297- 
b312- b313- b314- b314-  b314- b316- b317-

Notes:
- Updated map layout in src/scenes/Level.ts to reflect new Room1/Room2/Room3/Room4 data, aligning Room3 above Room2 and Room4 to the right of Room3 based on (room3/up) and (room4/right) markers.
- Normalized the duplicated "((bBooks)" entries to "(bBooks)" to avoid unbalanced parenthesis parsing.
- Map width increased to fit Room4 placement on the right.
- Changed Room4 interior tiles to a distinct layout (new wall art/props, blood accents, chairs) so it differs from other rooms.
- Added a new Room5 below Room4 on the right side and populated it with a custom layout (new wall art, props, and floor accents).
- Added a Room4 bottom exit using b42(room5/down) and aligned Room5 top entrance with b42(start).
- Adjusted Room4/Room5 rows per user layout: added b42 openings in Room4 lower rows and aligned Room5 top-row entrance with b42 tiles.
- Updated Room4/Room5 again to match latest provided layout, including b42 openings and Room5 top row ordering.
- Extended the bridge with an extra b42 and shifted the Room4->Room5 down exit to align with the upper bridge.
- Added one more b42 on the upper bridge row without shifting columns to fix the last small offset.
- Updated Room5 layout with key[3] and door[3] placements plus new bottom rows.
- Added Rat enemy support:
  - Added Rat spritesheets to public/assets/asset-pack.json (idle/attack/dying).
  - Map tag (rat) marks spawners; spawners spawn a rat every 10s and one immediately at game start for testing.
  - Rat uses simple A* on a walkable grid to chase the player, stops chasing if >7 tiles away, and plays attack animation in range.
  - Player attack (Space) can kill rats (dying animation then destroy).
- Door opening now updates rat navigation:
  - When a keyed door is destroyed, its tile is marked walkable in the rat A* grid so rats can path through opened doors.
- Generalized enemies system:
  - Added 3 new enemies: `beholder`, `golem`, `skeleton` (same spawn/chase/attack/dying loop as rat).
  - Spawner tags: `(rat)`, `(beholder)`, `(golem)`, `(skeleton)` spawn every 10s with puff; spawn one of each immediately at game start for testing.
  - Inferred sheet frame counts:
    - Beholder: idle 16, attack 8, dying 16 (36x38 frames)
    - Golem: idle 6, attack 10, dying 20 (42x36 frames)
    - Skeleton: idle 12, attack 8, dying 14 (36x34 frames)
  - Room1 spawners updated per latest layout: b141(rat), b126(golem), b141(beholder), b122(skeleton).
- Enemy spawns are now random but balanced (round-robin) and never in Room1:
  - Build a walkable mask from the player spawn tile, then exclude that connected region from spawn candidates.
  - Spawn locations are picked randomly from remaining walkable tiles; types cycle evenly.
- Combat feedback + HP system:
  - Player takes damage on enemy attack: red flash, knockback, short slow-mo, and camera shake.
  - Enemies have HP (rat 1, beholder 2, golem 4, skeleton 2); hit flashes red and gets knocked back.
  - Player hitbox now matches player collider height and is a bit wider forward/back to allow close-range hits.
- Added `Icon2x.png` spritesheet (32x32 frames) to asset pack and placed the 22nd icon (frame 21) into the pause menu above the title.
- Moved the 22nd icon (frame 21) to the top-right pause button and merged Music/FX/Haptics toggles into the pause menu (single overlay, persisted to localStorage).
- Added new SFX hooks for player/enemy attacks: `playerShoot` and `enemyShoot`.
- Added Stinger enemy:
  - Added spritesheets to asset-pack (idle/attack/dying) with 46x40 frames.
  - Added stinger config (hp 1, damage 1, speed 1.5x) and per-enemy speed handling.
  - Added map tag parsing for enemy spawns and placed a (stinger) tag in Room1 for testing.
- Ensured Room1 test visibility by forcing a stinger spawn near the player after enemy animations initialize (in addition to tag spawns).
- Added stinger tag detection in map parsing; confirmed Playwright run shows stingers near the player in Room1.
- Removed Room1 enemy spawns and room-tag spawns.
- Added room-based spawn distribution: Room2 (rat, stinger), Room3 (skeleton), Room4 (beholder), Room5 (golem).
- Enemy spawn order now cycles through rat, stinger, skeleton, beholder, golem.
- Beholder collider size halved (w/h scales) and moved 5px higher by adjusting offset (-8 from base).
- Chests now drop an icon on open: 50% frame 3, 50% frame 7, tweening 2 tiles forward (no pickup yet).
- Loot icons are now physics objects; player overlap plays getKey sound, spawns puff, and destroys the icon.
- Added loot icon effects: icon 3 heals +2 (capped), icon 7 grants Double Damage for 15s with on-screen countdown and 2x knockback.
- Double Damage now increases player speed by 1.2x and renders a fading clone trail while active.
- Added icon 5 (33% each for icons 3/5/7). Icon 5 grants Wizard buff with countdown text below Double Damage.
- Wizard buff: blue trail (overrides double damage trail), chain lightning damage to nearby mobs (50% damage).
- Added visible chain lightning graphics between mobs when Wizard chain damage triggers (cyan/white jagged bolts).
- Added icon 15 drop (25% each for icons 3/5/7/15). Icon 15 grants a 3-hit blue shield bubble.
- Reworked Room1 layout into a dining-room vibe (tables/chairs), removed enemy tags from Room1.
- Added ct_ custom tile support, loaded selected 32x32 PNGs, and reworked Room2 into a library area using ct_ shelves/tables/chairs/rug/potions.
- Cleaned up Room2 library layout to reduce overlap by using ct_ tiles as base and spacing props. Disabled mob spawning via mobsEnabled flag.
- Split Carpets2x.png into 2x2 bottom-right carpet tiles and placed them in Room2 lower-right area.
- Added DragonShoot.wav to asset pack and play it (louder) when the dragon boss lands an attack hit.
- Dragon now plays shoot SFX at attack start (even if it misses); hit no longer triggers the sound.
- Added Slime boss (same behavior/scale/collider as dragon), uses SlimeBoss sprites, plays slimeShoot, and spawns in Room1 for testing (dragon test spawn removed). Added slimeShoot audio entry.
- Slime collider reduced by 1.5x and moved downward for better alignment.
- Added Mummy boss (sprites, audio, config), enabled test spawn in Room1, and disabled normal spawns for test mode.
- Added wave system: waves start after Room1 door opens, spawn per-room enemies with increasing counts, scale spawn interval, show wave/boss messages, reset chests each wave, and spawn rotating bosses every 3 waves.

- Disabled physics debug rendering by default and removed the P debug toggle in Level.ts.
- Removed the T key shortcut that switched to the TestTiles menu/scene.

- Added mage player sprites to asset pack and implemented character switch on 1/2 keys (knight/mage).
- Mage uses its own idle/walk/attack animations and does not trigger the existing melee hitbox.

- Added mage fireball cast/effect and homing projectile with mageShoot audio; mage max HP set to 5 with hearts hidden beyond max.

- Fireball now only targets nearest enemy in front; added small spawn collision grace and increased forward spawn offset so it moves reliably.

- Fireball now keeps moving straight when no valid front target; added blocked check and increased spawn offset/collision grace.

- Refreshed chest static bodies and increased mage fireball collider to improve chest overlap.

- Fireball now collides with chests (static bodies) instead of overlap to reliably open them.

- Added manual chest proximity hit-check for mage fireballs to ensure chests open reliably.

- Fireball chest hit now uses body-rectangle intersection; mage nearby chest uses nearest chest by range.

- Fireball chest hit uses sprite bounds intersection and checks before blocked collisions; mage nearby chest uses nearest chest helper.

- Fireball chest detection now falls back to nearest chest within a wider radius if bounds miss.

- Chest bodies realigned (no Y offset), fireball collider expanded to full frame size for reliable overlap.

- Removed invalid setImmovable call on static chest sprites (was causing crash).

- Removed invalid refreshBody call on arcade chest sprite (was crashing on load).

- Added Archer character (key 3) with same mechanics as Mage: idle/walk/attack, cast animation, homing arrow projectile, and chest/enemy interactions.

- Archer now fires arrow at 75% of attack anim without pre-cast; arrow uses looping animation and spawns immediately in front.

- Adjusted archer arrow spawn Y downward: startY changed from player.y - 6 to player.y.

- Added character 4 (rogue) with same melee mechanics as knight; integrated key 4 selection, rogue idle/walk/attack animations, and RoguePlayer assets.
- Verified build passes and no fresh Playwright runtime errors in isolated output dir.

- Fixed rare wall-stuck spawns: spawn now runs a physics probe with actual enemy collider settings and rejects positions overlapping walls/doors/chests before creating enemy.
- Chest test drop updated: chest loot is now forced to icon 8 (100%) for transformation testing.
- Added icon 8 pickup effect: transforms player to a random character excluding current, refills HP to full for new character, shows "Character Changed!" status, triggers heavy shake/haptics, and spawns a large puff effect.
- Validation: `npm run build` passes after icon-8 transform changes.
- Validation: ran Playwright client via `web_game_playwright_client.js` against local Vite server (`npm run start -- --host 127.0.0.1 --port 4173`); latest screenshot captured in `output/web-game/shot-0.png` and no new errors file generated for this run.
- Mage chest-hit reliability fix: replaced per-frame physics-only chest overlap check with path-based chest intersection (`findChestHitAlongPath`) using chest display bounds + small margin, so fast projectiles no longer tunnel past chests.
- Mage fireball now stores previous position (`lastX/lastY`) and evaluates segment intersection before blocked-wall destruction.
- Validation: `npm run build` passes after mage chest-hit path fix.
- Validation: ran Playwright client with screenshot dir `output/web-game-mage-chest-fix`; captured `shot-0.png` and no new `errors-*.json` file was produced in that run dir.
- Mobile landscape lock update: added forced landscape fallback for portrait-held mobile devices by rotating `#app` and `#ui-layer` via `body.force-landscape`, toggled from `main.ts` on resize/orientation changes.
- Requested debug removal completed: arcade physics debug disabled in game config and `keydown-P` debug toggle removed from Level scene.
- Validation: `npm run build` passes.
- Fullscreen sizing tweak: made `html/body/#app/#game-container` fill viewport (`100dvh/100vw`) and hide overflow.
- Phaser scale mode switched from `FIT` to `ENVELOP` so the game fills screen instead of appearing small.
- Validation: `npm run build` passes.
- Adjusted fullscreen behavior to remove zoom/cropping: Phaser scale mode reverted from `ENVELOP` back to `FIT` while keeping viewport-filling CSS.
- Validation: `npm run build` passes.
- Fullscreen alignment fix: removed forced `scale.resize(1280,720)` in `applyForcedLandscapeLayout` and now only refresh scale on next frame after layout class changes.
- Viewport fill fix: `#app` pinned with `position: fixed; inset: 0;`, `#game-container` centered via flex, and canvas forced to `width/height: 100%` to prevent bottom-left quarter-size rendering.
- Validation: `npm run build` passes.
- UI inset pass: moved corner HUD elements slightly inward with shared constants (`uiInsetX=24`, `uiInsetY=20`), affecting hearts, score, pause icon, and right-side buff timers.
- Buff text base Y is now centralized (`uiBuffBaseY=84`) so stacked status labels stay aligned with new inset.
- Validation: `npm run build` passes.
- Mobile HUD tweak: shifted only top-right HUD (Score + Pause) slightly left on mobile/coarse-pointer devices via `getTopRightUiX()` in Level scene.
- Desktop HUD placement remains unchanged.
- Validation: `npm run build` passes.
- Added mobile touch support for all DOM menu buttons by binding `click` + `pointerup` + `touchend` with debounce, so pause/menu interactions work reliably by finger tap.
- Implemented mobile-only on-screen controls in Level scene:
  - Left-bottom virtual joystick (drag to move).
  - Right-bottom attack button using `icons2x` frame 7 (7th icon), semi-transparent idle alpha, press animation, and hold-to-attack behavior wired to existing attack cooldown/logic.
  - Controls fade in with gameplay UI after start and re-layout on resize.
- Added touch-action CSS for canvas/UI layer to improve touch responsiveness.
- Validation: `npm run build` passes; Playwright run captured output in `output/web-game-mobile-ui` with no new error logs.
- Fixed portrait-held landscape input mismatch by decoupling mobile controls from Phaser interactive hit-testing and using raw pointer/touch coordinates remapped to game-space when `body.force-landscape` is active.
- Mobile joystick/fire/pause now use manual pointer handlers with transformed coordinates; this avoids rotated-axis input interpretation.
- Added TouchEvent coordinate handling (`touches/changedTouches`) and reset mobile control state on pause transitions.
- Validation: `npm run build` passes; Playwright smoke run output at `output/web-game-input-fix` with no new error logs.
- UI scale update per request:
  - Top-right pause icon size increased to 90x90 (~2.5x).
  - Score font size increased from 22px to 33px (~1.5x).
  - Mobile joystick radius increased from 58 to 145 (~2.5x), knob radius to 55, and layout offsets adjusted to keep controls on-screen.
  - Mobile fire button scale increased from 2.6 to 5.2 (~2x).
- Mobile pause menu sizing/centering fix: added coarse-pointer CSS rules to cap width and padding, with dedicated force-landscape width rule.
- Validation: `npm run build` passes.
- Fixed mobile control shape distortion: canvas sizing switched to aspect-preserving (`width/height:auto` + `max-width/max-height:100%`) instead of forced 100%x100% stretch.
- Improved mobile fire reliability while moving: fire touch hit-test now uses circular radius around button center and touch coordinate extraction now tries to match touch identifier with current pointer.
- Validation: `npm run build` passes.
- Fixed post-settings touch lock by hard-controlling pause/game-over menu visibility and hitability (`display` + `pointer-events`) in `togglePause`, `setupDOMUI`, and `restartGame`.
- Mobile button handlers switched to `pointerdown`/`touchstart` (with debounce + preventDefault) for more reliable tap recognition.
- Validation: `npm run build` passes.
- Buff text UI update: increased buff label font size from 16px to 24px.
- Renamed Double Damage label text to `Warrior` (`Warrior: <remaining>`).
- Increased stacked buff line spacing (second line offset from +20 to +32) to prevent overlap with larger text.
- Validation: `npm run build` passes.
- Added `characterChange` audio asset (`assets/Audio/CharacterChange.wav`) to `asset-pack.json`.
- Character transform pickup now plays `characterChange` SFX during transform effect.
- Per request, no build/test run executed for this change.
- Force-landscape mobile input offset fix:
  - Root cause: `getMobileControlPoint` normalized touch coordinates against `window.innerWidth/innerHeight` and a viewport center rotation, which drifted when `#app` is rotated and when canvas occupies a letterboxed subset of the viewport.
  - Implemented element-based mapping in `Level.ts`:
    - Added `getPointerClientPosition()` to extract stable screen-space (`clientX/clientY`) pointer/touch coordinates.
    - Added `toAppLocalPoint()` with correct inverse rotation for `body.force-landscape` (`rotate(90deg)` -> inverse `-90deg`).
    - Added `getCanvasBoundsInAppSpace()` and now normalize input against actual canvas bounds (not the full viewport).
  - Expected effect: joystick center no longer produces left drift; taps should align with visible controls instead of right-side offset/blank area.
- Validation:
  - `npm run build` passes.
  - Playwright smoke run captured `output/web-game-input-offset-fix-2/shot-0.png` and `state-0.json`; no new `errors-*.json` produced.
- TODO / next check:
  - Verify on a real mobile device in forced-landscape mode (portrait hold) with direct finger tests for joystick center and edge taps; automated desktop Playwright cannot fully emulate the real touch/orientation stack.
- Follow-up mobile input offset attempt (user reported prior fix unchanged):
  - Replaced force-landscape remap with simpler canvas-rect-based conversion in `getMobileControlPoint`.
  - New mapping uses actual `canvas.getBoundingClientRect()` ratios:
    - normal: `(rx, ry)`
    - force-landscape: axis-swapped `(nx=ry, ny=1-rx)` matching `rotate(90deg)`.
  - Removed the previous app-local/corner-transform helper methods to avoid transform-chain drift.
- Validation: `npm run build` passes after the remap simplification.
- Additional verification after canvas-rect remap:
  - Playwright smoke run completed to `output/web-game-input-offset-fix-3` with `shot-0.png` and `state-0.json`.
  - No `errors-*.json` generated.
- User-requested manual shift applied:
  - Added global force-landscape X calibration offset in `Level.ts`:
    - `mobileInputCalibrateXForceLandscape = 0.05` (5% of canvas width to the left).
  - Applied in `getMobileControlPoint` as `nx = clamp(rawNx - offset)` only when `body.force-landscape` is active.
- Validation:
  - `npm run build` passes.
  - Playwright smoke run output at `output/web-game-input-offset-fix-4` with no error file.
- Tuning note:
  - If still right-shifted on device, increase offset to `0.07` or `0.09` for stronger left correction.
- Per user request, inverted manual calibration direction:
  - `getMobileControlPoint` now applies `+mobileInputCalibrateXForceLandscape` under force-landscape (rightward shift), replacing previous subtraction.
- Validation:
  - `npm run build` passes.
  - Playwright smoke run output in `output/web-game-input-offset-fix-5`; no `errors-*.json` generated.
- Joystick-only recalibration (after user feedback that pause/fire are good but joystick is too shifted):
  - Kept global force-landscape mapping used by pause/fire/attack.
  - Added joystick-specific compensation: `mobileJoystickExtraLeftShiftForceLandscape = 0.04`.
  - Applied only in joystick path (`pointerdown` and `pointermove`) via new helper `getJoystickControlPoint()`.
  - Effect: joystick touch point is shifted left additionally, without affecting pause and fire hit tests.
- Validation:
  - `npm run build` passes.
  - Playwright smoke run output at `output/web-game-input-offset-fix-6`; no `errors-*.json` generated.
- Tweaked joystick-only calibration per request: set `mobileJoystickExtraLeftShiftForceLandscape` to `0.02` so joystick net X shift is ~+3% (with global +5% still applied to pause/fire).
- Validation: `npm run build` passes.
- Joystick recalibration per request: moved joystick 4% left overall by setting `mobileJoystickExtraLeftShiftForceLandscape` to `0.09` (with global +0.05 still active for pause/fire).
- Validation: `npm run build` passes.
- Fixed knight attack direction lock bug: melee and Power Slash direction no longer rely only on `flipX`; added persistent `playerFacingDir` tracking from input/velocity and unified direction resolver (`getPlayerFacingDirection`) so effects spawn correctly to left or right.
- Reworked knight melee slash VFX geometry to be explicitly direction-aware (mirrored wedge path), preventing right-side-only rendering.
- Validation: `npm run build` passes after direction fix.
- Feature system refactor (character-based, numbered) for Knight (character 1):
  - `feature1` Power Slash toggle added and set to disabled by default.
  - `feature2` Vampiric Tendency toggle added and enabled.
- Added Knight `feature2` behavior: every 2 successful auto-attack hits heals 1 HP (capped at max HP).
- Lifesteal counting is now tied to successful damage application (`damageEnemy` now returns boolean), so blocked/ignored hits do not count.
- Validation: `npm run build` passes.
- Removed Knight feature2 (Vampiric Tendency) behavior and references.
- Added Knight feature3 (Golden Shield): blocks 2 incoming hits, then recharges to full after 4s out of combat (timer resets on each damage taken while broken).
- Golden Shield uses chest-style damage-block semantics and shows left-side HUD icon (`icons2x` frame 15) with remaining stack text (`x2/x1/x0`) while Knight is active.
- Feature toggles now: feature1 Power Slash (disabled), feature3 Golden Shield (enabled).
- Validation: `npm run build` passes.
- Golden Shield visual pass completed for Knight feature3:
  - Added persistent yellow shield bubble around player while shield stacks remain (same style as chest shield, recolored gold).
  - Added block pulse/reform visual feedback tied to the persistent bubble.
  - Ensured cleanup on death/restart.
  - HUD still uses `icons2x` frame 15 for shield status.
- Validation: `npm run build` passes.
- Added Knight feature4: Fire Aura (character-based feature flag).
- Fire Aura is active around Knight and continuously damages nearby enemies while they stay inside aura radius.
- Added visual fire aura ring around Knight (outer + inner pulse) plus ember burn hit particles on affected enemies.
- Cleanup added for restart/death/character-switch to prevent lingering aura visuals.
- Current Knight features: feature1 disabled, feature3 enabled, feature4 enabled.
- Validation: `npm run build` passes.
- Restored Knight feature2 (Vampiric Tendency) as a proper togglable feature flag (`knightFeature2VampiricEnabled`).
- Feature2 defaults to disabled; logic remains in code and can be enabled via bool anytime.
- Lifesteal behavior restored: every 2 successful Knight auto-attack / Power Slash hits heals 1 HP.
- Validation: `npm run build` passes.
- Disabled Knight feature4 (Fire Aura) via feature flag.
- Added Knight feature5: Ground Spike.
  - Every 4 auto attacks, next first enemy hit spawns a ground spike at that enemy location.
  - Spike lasts 2s.
  - Enemies standing on spike take periodic damage and receive 0.5s stun.
- Enemy AI now respects `stunnedUntil` and stops movement/attacks while stunned.
- Validation: `npm run build` passes.
- Ground Spike reliability pass:
  - Reworked trigger to deterministic per-attack local trigger on every 4th Knight auto attack (first enemy hit in that attack spawns spike).
  - Converted spike visuals from circles to spiky star-style ground hazard.
  - Increased spike radius and per-spike enemy tick tracking.
  - Stun now applies reliably on spike ticks, and spike damage bypasses generic hit cooldown to prevent missed ticks.
- Disabled all Knight feature flags (feature1..feature5 all false).
- Chest loot simplified to only HP (icon 3) and character change (icon 8).
- Loot pickup handling now only applies effects for icon 3 and icon 8; other feature effect code remains in file for future reuse.
- Validation: `npm run build` passes.
- Chest loot rework for Knight (character 1):
  - Drops are now 45% full-heal (icon 3), 45% special upgrade icon (icon 7), 10% character change (icon 8).
  - If no upgradable Knight feature remains, icon 7 is removed from chest drop table.
- Added special icon ownership cleanup: character-special icons on ground are removed when character changes to a different character.
- Added Knight feature upgrade progression via icon 7:
  - 5 features each have level 0..4.
  - Level 1 unlocks the feature.
  - Levels 2..4 apply +25% damage to that feature (feature3 uses +1 extra shield hit per level instead).
  - Upgrade event shows wave-style message and camera shake.
- All feature flags currently start disabled until unlocked through upgrades.
- Heal icon now fully restores HP.
- Validation: `npm run build` passes.
- Archer feature set added as character-based toggles (feature1..feature5) in `src/scenes/Level.ts`:
  - feature1 Piercing Arrow: every 3rd archer auto attack now spawns powered piercing arrows that can damage multiple enemies along the path.
  - feature2 Explosive Shot: every 2nd auto attack support added (explodes on impact with AoE damage + knockback).
  - feature3 Arch Arrow: support added (fires 3 arrows in an arch spread).
  - feature4 Binding Shot: every 3rd auto attack support added (roots first hit target for 1.5s via `rootedUntil`).
  - feature5 Helpful Companions: support added (spawns companions every 5s, each lasts 5s and fires companion projectiles).
- Default test config set per user request: ONLY archer feature1 enabled; feature2..feature5 disabled.
- Archer projectile system was integrated with feature-aware impact handling:
  - piercing multi-hit path checks,
  - explosion handling on enemy/chest/wall impact,
  - binding application,
  - feature-colored trail/impact visuals.
- Enemy update loop now respects `rootedUntil` (separate from stun), so rooted enemies stop chasing while root is active.
- Character switch / death cleanup now clears archer companions + companion projectiles.
- Validation: `npm run build` passes.
- Playwright skill client (`web_game_playwright_client.js`) was attempted multiple times for this change, but the run hangs in this environment (headless chrome swiftshader GPU process spins and script does not terminate). Build validation was completed successfully despite this runtime test blockage.
- Archer feature1 visual update: piercing arrow color switched to blue, and piercing arrows now leave a clone-style blue ghost trail instead of the generic ellipse trail.
- Validation: `npm run build` passes.
- Mage feature set added as character-based toggles (for manual testing flow like Archer):
  - feature1 Lightning Chain (enabled by default)
  - feature2 Supernova (disabled)
  - feature3 Freeze Zone (disabled)
  - feature4 Poison Zone (disabled)
  - feature5 Laser Beam (disabled)
- Mage attack flow refactor: `startMageCast` now triggers `fireMageAttack()`, which counts auto attacks and attaches feature triggers to each mage attack.
- Feature behaviors implemented:
  - Lightning Chain: every 3rd auto attack chains to nearby enemies using existing `createChainLightning` wizard-style visuals and chained damage.
  - Supernova: every 4th auto attack hit causes AoE explosion damage.
  - Freeze Zone: every 3rd auto attack creates a 2s freeze zone that slows enemies in zone.
  - Poison Zone: every 4th auto attack creates a 2s poison zone with periodic DoT ticks.
  - Laser Beam: every 5th auto attack fires a straight beam damaging all enemies in line.
- Added mage feature object lifecycle management:
  - Created `mageFreezeZones`, `magePoisonZones`, `mageLaserVisuals` groups.
  - Added `updateMageFeatureZones()` in the main update loop.
  - Added cleanup on character switch away from mage and on player death (`clearMageFeatureObjects`).
- Enemy movement now respects freeze zones via `getMageEnemySpeedMultiplier(enemy)` multiplier inside chase speed calculation.
- Validation: `npm run build` passes.
- Playwright validation attempt:
  - `web_game_playwright_client.js` against `http://127.0.0.1:5173` starts but hangs in this environment (same known issue from earlier attempts), producing no screenshots/states before forced kill.
- Mage feature toggle update per request: feature2 disabled, feature3 enabled.
- Heal pickup behavior refined:
  - Icon 3 now supports two modes:
    - if `healAmount` exists on icon, heals that exact amount (capped by max HP),
    - if `healAmount` is absent, performs full heal.
- Chest icon 3 now drops without `healAmount` (so chest heal stays full).
- Golem drop remains icon 3 with `healAmount=2`, so golem heart drops now heal exactly 2 HP.
- Start-game UI heart fade-in now targets only visible hearts for current `playerMaxHp`, and `updateHearts()` is called immediately when leaving main menu to prevent temporary 10-heart display.
- Validation: `npm run build` passes.
- Playwright client attempt still hangs in this environment and produced no artifacts before forced kill.
- Switched default active character to Rogue:
  - `activeCharacter` class default now `"rogue"`.
  - Scene reset/start now sets `this.activeCharacter = "rogue"`.
- Validation: `npm run build` passes.
- Major progression rework completed in `src/scenes/Level.ts`:
  - Default character switched back to Knight (both field default and create() reset path).
  - Added player level/exp progression system with UI text (`Lv.X XP current/next`) under score.
  - Level scales by character role:
    - Base damage: Knight scales highest; others lower.
    - Base attack speed: Archer scales highest.
    - Base move speed: Rogue scales highest.
    - Crit rate: Mage scales highest.
  - Added enemy health bars (live-following per enemy, color by remaining HP).
  - Added floating damage numbers and crit hits (larger yellow values).
  - Added EXP gain on enemy kill and level-up flow (message + shake + UI update).
  - Extended render_game_to_text payload with level/exp fields.
- Removed old "%25 damage" feature-upgrade behavior and replaced with direct feature-behavior upgrades per latest request:
  - Knight:
    - F2 lifesteal hit threshold progression: 3 -> 2 -> 1 (max +3 upgrades).
    - F3 shield visual size grows +10% each upgrade (max +4 upgrades).
    - F4 adds +1 shield block each upgrade (max +2 upgrades).
    - F5 spike lifetime scales +10% each upgrade (max +5 upgrades, up to +50%).
    - F1 remains unlock-only.
  - Archer:
    - F1 unlock-only.
    - F2 explosion radius + knockback scale +10% per upgrade (max +4 upgrades).
    - F3 arrow count upgrade: 3->4->5 (max +2 upgrades).
    - F4 root duration +10% per upgrade (max +4 upgrades).
    - F5 companion lifetime +1s per upgrade (10s -> 11/12/13/14s, max +4 upgrades).
  - Mage:
    - F1 unlock-only.
    - F2 supernova radius +10% per upgrade (max +4 upgrades).
    - F3 freeze-zone radius +10% per upgrade (max +4 upgrades).
    - F4 poison-zone radius +10% per upgrade (max +4 upgrades).
    - F5 trigger cadence upgrades 5 -> 4 -> 3 attacks (max +2 upgrades).
- Chest upgrade messaging now shows `Lv current/max` in Character Updated text.
- Validation:
  - `npm run build` passes.
  - Playwright client run succeeded to generate screenshots/state files, but scripted actions do not currently move the player from spawn in this environment; smoke artifacts reviewed:
    - `output/web-game/shot-0.png`, `state-0.json`
    - `output/feature-upgrade-smoke/shot-0.png`, `state-0.json`
  - State confirms default character is Knight and render payload includes current fields.
- Remaining follow-up suggestion:
  - Re-tune/expand Playwright action bursts (or test with manual in-app run) to move into enemy rooms and visually confirm damage numbers + HP bars + EXP level-up progression under active combat.
- Switched default active character back to Rogue per request:
  - `activeCharacter` field default is now `"rogue"`.
  - scene reset path in `create()` now sets `this.activeCharacter = "rogue"`.
- Validation: `npm run build` passes.
- Added Rogue feature system + chest upgrade branch (special icon 4, owner-tagged cleanup):
  - Feature 1 Heavy Stab: every 3 auto attacks, long line stab damages enemies on path.
  - Feature 2 Crit Heal: heals on crit; levels map to +1/+2/+3 HP.
  - Feature 3 Shadow Dash: every 3 auto attacks, dashes forward with nav-walkable checks so it does not phase through walls.
  - Feature 4 Execution: instant kill on hit when enemy HP <= 30% with blood splash.
  - Feature 5 Dodge: chance to avoid enemy hit; starts 10%, scales with upgrades to max 50%.
- Critical system updated per request:
  - Base crit now starts at 20% for all characters.
  - Crit damage is 2x.
  - Crit visual/audio: hit flash + shake + `threeHitFirst` SFX.
  - Crit remains a base stat and still scales with level-up by character profile.
- Enemy scaling by waves added:
  - Enemies gain +1 max HP every 2 waves (applied on spawn via wave-based bonus).
- Level text UI improved:
  - Moved to top-center, larger font, visually separate from score/pause.
  - `render_game_to_text` includes level/exp fields.
- Validation:
  - `npm run build` passes.
  - Playwright smoke run artifact `output/rogue-feature-smoke` generated; state confirms default character rogue and level/exp payload fields present.
- UI adjustment: moved level text to lower-center ("orta aşağı") instead of top UI cluster.
  - Added helper `getLevelUiPosition()`.
  - Level label now uses helper on creation and on resize.
- Validation: `npm run build` passes.
- Rogue quick-test config updated: only Rogue Feature 1 enabled by default.
  - `rogueFeatureLevels` now starts as `{1:1,2:0,3:0,4:0,5:0}` (field + reset path).
  - This keeps Heavy Stab active and all other Rogue features disabled for testing.
- Validation: `npm run build` passes.
- Rogue Feature 1 (Heavy Stab) tuning update:
  - Base range reduced by 2.5x.
  - Feature 1 is now upgradeable: max level 4 (unlock + 3 upgrades).
  - Range scaling for upgrades: +10% per upgrade, up to +30% total at max upgrades.
  - Upgrade feedback text updated to show Heavy Stab range increase.
- Validation: `npm run build` passes.
- Unified all base stat scaling across characters (no character-based branching anymore):
  - Damage multiplier per level: +5.5%.
  - Attack speed scaling: base cooldown 680ms, +1.5% attack-rate per level.
  - Move speed scaling: base 280, +1.2% per level.
  - Crit scaling: base 20%, +0.5% per level.
- This ensures base stats are preserved identically when switching characters.
- Validation: `npm run build` passes.
- Added crit feedback popup text:
  - New `spawnCritPopup(x, y)` in `Level.ts` creates small pixel-art `CRIT!` text above target.
  - Popup floats upward and fades out quickly for hit-feedback feel.
  - Integrated into crit branch of `damageEnemy` before crit flash/audio.
- Validation:
  - `npm run build` passes.
  - Playwright smoke artifacts generated at `output/crit-popup-smoke` (runtime smoke no errors).
- Fixed menu interaction regression that blocked Restart/Try Again:
  - `startGame()` now disables main-menu pointer events immediately and hides menu DOM via `window.setTimeout` after fade, so invisible overlay cannot intercept pause/gameover buttons.
  - `setupDOMUI()` now restores main-menu DOM visibility/pointer state on scene create (`display:flex`, `pointer-events:auto`).
- Hardened restart flow:
  - `restartGame()` now performs a hard page reload (`window.location.reload()`) after resetting pause/time scales to avoid rare frozen states seen after DOM-triggered restart/retry.
- Improved crit feedback visibility:
  - `spawnCritPopup()` now uses larger text (`18px`), brighter color, stronger outline, additive blend, higher depth, and longer/larger tween for clear visibility.
- Stability for automation/debug output:
  - `render_game_to_text` enemy extraction wrapped in try/catch to avoid transient group teardown errors during restart transitions.
- Validation:
  - `npm run build` passes.
  - Playwright flow verified: Play -> Pause -> Restart returns to main menu with `main-menu` visible and interactive.
  - Playwright flow verified: simulated Retry click also returns to main menu with `main-menu` visible and interactive.
- UI tweak: Character upgrade popup text (`showCharacterUpdated`) reduced from wave-size to 21px (about 1.5x smaller than 32px wave text). `showWaveMessage` now explicitly restores 32px so wave announcements keep original size.
- Mobile/force-landscape input fix for character select overlay:
  - Added dedicated hit area cache (`characterSelectHitAreas`) for character cards.
  - Added pointer mapping split:
    - `getMobileControlPoint` keeps calibrated mapping for joystick/fire controls.
    - `getUiPointerPoint` uses non-calibrated mapping for menu/overlay taps.
  - While character select is active, mobile `pointerdown` now routes through `tryHandleCharacterSelectPointer` and picks cards via mapped coordinates, preventing rotated-screen click/touch drift.
- Test aid: added a guaranteed character-change loot spawn (icon 8) at Room1 center tile on scene create (`spawnRoom1CenterCharacterChangeLootForTest`, tile 3,14).
- Rebuilt character-select to use DOM menu (same interaction model as pause/gameover) to remove mobile/force-landscape input drift.
- Added `#character-select-menu` in `index.html` with pause-style visual structure and buttons.
- Updated `setupDOMUI`:
  - initializes/hides character-select menu,
  - binds option/cancel buttons with the same click/pointer/touch debounce helper as pause.
- `openCharacterSelectMenu` now opens DOM menu (`showCharacterSelectMenu`) instead of Phaser overlay.
- Kept compatibility stub `renderCharacterSelectOverlay()` but it now forwards to DOM menu.
- Mobile input path now exits immediately while character-select is active (no canvas-side hit testing).
- Added responsive CSS parity for `#character-select-menu` to match pause menu on desktop/mobile/force-landscape.
- Validation: `npm run build` passes.
- Character select menu: restored `CANCEL` button in DOM and re-bound `btn-char-cancel` to `closeCharacterSelectMenu(true)`.
- Added menu map routing for tutorial flow:
  - New `#btn-tutorial` under Play in main menu (`index.html`).
  - `btn-play` now routes to main map mode; `btn-tutorial` routes to tutorial map mode.
  - `Level.create` now accepts scene data `{ mapMode, autoStart }`, and map mode is persisted on restart.
- Added tutorial map generator in `Level.ts`:
  - `getTutorialMapLayout()` builds 5 Room1-style rooms connected left-to-right with 2-tile bridge corridor.
  - Tutorial map has spawn in room 1 and opens side exits between rooms.
- Added `ui.mapMode` to `render_game_to_text` payload for verification.
- Fixed restart crash during map switch:
  - Guarded `clearArcherCompanions()` against destroyed/uninitialized group internals during scene restart.
- Validation:
  - `npm run build` passes.
  - Headless Playwright check confirms state transition on tutorial click:
    - before: `mainMenu:true, mapMode:'main'`
    - after: `mainMenu:false, mapMode:'tutorial'`
  - Saved verification screenshot: `output/web-game-tutorial-menu-4.png`.
- Expanded tutorial flow to 6 rooms and step system updates:
  - Room1 move, Room2 attack dummy, Room3 chest-hit/heal, Room4 character-change icon, Room5 skill icon, Room6 final combat.
  - Added extra tutorial gate between Room5->Room6 and updated step progression/labels to 1/6.
- Chest tutorial adjustment:
  - Step-3 tutorial chest now drops icon 3 (heal) with 100% probability.
  - Objective text updated to explicitly tell player to hit the chest to open it.
- Added new character-change tutorial room behavior:
  - New room after chest contains centered icon 8 with pulse aura.
  - Picking tutorial reward icons now cleans associated aura VFX and marks step completion.
- Updated final fight spawn to last tutorial room and completion transition remains smooth (pan + fade + restart into main map).
- Validation: `npm run build` passes.
- Tutorial skill icon is now dynamic by selected character:
  - Room5 tutorial skill icon auto-maps to current character (knight=7, mage=5, archer=6, rogue=2).
  - If character changes before pickup, old skill icon is replaced and respawned for the new character.
- Removed initial tutorial popup label `Tutorial 1/6` (and its popup background effect by not showing that wave message at tutorial start).
- Validation: `npm run build` passes.
- Added character skill-info popup system (DOM + Phaser HUD button):
  - New HUD button near pause icon opens a skill info menu (`skillsInfoBtn`, icons2x frame 4).
  - Menu content is character-specific (Warrior/Mage/Archer/Rogue skill name + description + icon).
  - Popup state tracked with `skillsInfoActive`; ESC closes popup first.
- Added full popup lifecycle in Level scene:
  - Implemented `toggleSkillsInfoMenu`, `openSkillsInfoMenu`, `closeSkillsInfoMenu`, and wired `updateSkillsInfoMenuContent` updates on resize + character switch.
  - Opening popup pauses gameplay using same pause/timeScale/physics freeze model; closing resumes safely.
  - `togglePause` now ignores pause toggles while skills popup is active to prevent overlap.
  - `restartGame` now force-closes skills popup to avoid stuck UI state.
- Input stability:
  - Did not touch mobile coordinate transform mapping.
  - Mobile pointer down now early-returns when skills popup is open, so no joystick/fire leakage.
- DOM/CSS:
  - Added `#skills-info-menu` in `index.html` with `#skills-info-title`, `#skills-info-list`, and close button `#btn-skillinfo-close`.
  - Added pixel-art styles for skill rows/icons in `public/style.css` (icons from `Icon2x.png`, proper 8x3 sheet frame offsets).
  - Added responsive sizing rules for skills popup in coarse-pointer and force-landscape modes.
- Verification:
  - `npm run build` passes after changes.
  - Playwright skill client smoke tests run on local Vite server:
    - Open game, open skills popup via HUD icon => `state-0.json` shows `skillsInfo: true`, `paused: true`.
    - Close popup via close button => `state-0.json` shows `skillsInfo: false`, `paused: false`.
    - No new `errors-*.json` generated in test artifact dirs.
- Skill popup polish update:
  - Removed per-skill row icons in the skills info popup (text-only rows).
  - Changed top-right skills button icon to icon #8 (spritesheet frame 7), next to pause button.
- Validation: `npm run build` passes.
- Tutorial skill pickup messaging update:
  - Special-icon upgrade methods now return the exact upgraded skill label.
  - Tutorial reward step 5 now shows `<Skill Name> Unlocked` (fallback `Skill Collected`) and then auto-shows `Move to the next room!` after a short delay.
  - Hooked this through loot pickup overlap by passing unlocked label into `markTutorialRewardCollected`.
- Validation:
  - `npm run build` passes.
  - Playwright smoke run (`#btn-tutorial` entry + short input burst) produced screenshot/state with no new `errors-*.json`.
- Skills popup icons restored with character-specific icon mapping:
  - Re-enabled row icons in skills info menu.
  - Each row now uses the active character's special icon (Knight=7, Mage=5, Archer=6, Rogue=2) instead of per-skill icons.
- Validation: `npm run build` passes.
- Skills popup unlock visibility update:
  - Added active-character feature level helper for popup rendering.
  - Skill row icon now appears only if that specific feature is unlocked (feature level > 0).
  - Locked skills no longer show the character icon in the row.
- Validation: `npm run build` passes.
