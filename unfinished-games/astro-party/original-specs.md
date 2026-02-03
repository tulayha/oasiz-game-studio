# Project Specification: Astro Party Clone

**Gameplay Vidoe** https://www.youtube.com/watch?v=ekwammtv2Ac

## 1. Game Overview
**Astro Party** is a 2-4 player top-down arena shooter. The objective is not to destroy ships, but to eliminate the **Pilots** that survive the ship's destruction. The game relies on high-inertia physics, rapid rounds, and randomized map elements.

## 2. Input & Control Scheme
The game uses a **two-button control scheme** for each player corner.

### 2.1. Button Mapping
*   **Button A (Rotation & Dash):**
    *   **Hold:** Rotates the ship clockwise at a constant speed.
    *   **Release:** Stops rotation.
    *   **Double Tap:** Triggers **Super Dash**. The ship performs a sudden, short-range burst of speed in its current facing direction. This overrides current momentum.
*   **Button B (Thrust & Fire):**
    *   **Hold:** Fires the primary weapon (fixed fire rate) AND applies forward thrust simultaneously.
    *   **Note:** You cannot shoot without moving forward, and you cannot move forward without shooting (unless using the Super Dash).

### 2.2. Ship Physics
*   **Zero-G Inertia:** Ships drift significantly. Releasing Button B does not stop the ship; it continues gliding on its vector, slowed only by minor drag.
*   **Bounce:** Ships collide elastically with the arena bounds (walls) and indestructible map objects.
*   **Recoil:** Firing a projectile imparts a negligible but non-zero reverse force.

---

## 3. Core Loop & Scoring Mechanics

### 3.1. The "Pilot Hunter" Cycle
1.  **Ship Phase:** Players dogfight. A single hit from a laser, asteroid, or hazard destroys a ship.
2.  **Ejection Phase:** When a ship is destroyed, it explodes and ejects a **Pilot** (a small human sprite).
    *   The Pilot retains some momentum from the ship (ragdoll trajectory) before friction slows them down.
    *   The Pilot can run slowly on their own (AI controlled behavior: run away from threats or drift aimlessly).
3.  **The Kill:** A point is **only** awarded if a player destroys an ejected Pilot.
    *   *Methods:* Shooting the pilot or crushing them with a ship/asteroid.
    *   *Scoring:* +1 to the killer's score track.
4.  **Regeneration (The Rescue):**
    *   If a Pilot survives for a set duration (approx. 5 seconds), they are "rescued."
    *   The Pilot sprite flashes/fades out.
    *   The player immediately respawns in a new ship at a random safe spawn point.
    *   **No points** are awarded to anyone if the pilot regenerates.

### 3.2. Win Condition (The Track)
*   The scoreboard is a UI race track overlay.
*   Each "Kill" moves the player's ship icon one step forward.
*   First to reach the finish line (Standard: 5 kills) wins.

### 3.3. Sudden Death / Overtime
If no kills occur for a set duration:
1.  **"OVERTIME"** text flashes.
2.  **The Crush:** Indestructible blocks begin spawning from the outer edges of the map, slowly filling the screen row by row, reducing the playable area until someone is crushed.

### 3.4. **Player Death Handling (During an Active Round)**
1. On Player Death

 **When a player’s Pilot is killed:**
- The player is marked as Eliminated for the current round.
**- The eliminated player:**
- Enters Spectator Mode
- Can freely watch the remaining match
- Cannot interact with gameplay
- May Exit the game session at any time

2. Last Player Check
- After a player is eliminated:
- If only one active player remains:
- That player is declared Round Winner
- Winner’s score is incremented (score++)
- End the current round
- Automatically start the next round after a short delay
- If more than one active player remains:
- Continue the current round
- Eliminated players remain spectators until the round ends

### 3.5. **Round End → Game Session Progression**
1. Round Transition
Clear all active ships, pilots, and projectiles
Reset map state
Respawn all non-exited players
Start the next round using the same session rules

### 3.6. **Game Session End Condition**
1. Game Session End

- A Game Session ends when:
- One player reaches the defined win condition (e.g., first to 3 kills)
- At session end:
- Declare 1 Winner
- All other players are marked as Losers
- Freeze gameplay
- Display End Session UI

### 3.7 End Session UI
1. End Session Screen
- Show the following buttons:
- Restart
- Main Menu

### 3.8 Local Match Scenario (Input & Session Flow)

- On player elimination, the corresponding local input controls are locked and ignored by the game.
- Input remains disabled until a new game session is created.
- At the end of the game session, the winning player is announced, after which the game returns to the Main Menu.
- Starting a new session allows players to configure the local player count (2–4 players) before entering the lobby.

---

## 4. Game Entities

### 4.1. The Ships
*   **Hitbox:** Triangular.
*   **Attributes:** High inertia, continuous rotation.
*   **State:** Alive (Active), Destroyed (Pilot Ejected).

### 4.2. Destructible Objects
*   **Yellow Blocks:** Grid-aligned barriers. They block movement and lasers. Destroyed by 1 shot.
*   **Orange Asteroids:** Large, floating rocks with random trajectories.
    *   *Interaction:* Destroyed by 1 shot.
    *   *Loot Table:* Upon destruction, they may spawn a **Power-Up** bubble or nothing.
*   **Debris:** Small space junk (grey rocks/scrap).
    *   *Interaction:* Blocks movement/shots. Destroyed by 1 shot. Purely obstructional; drops no loot.

### 4.3. Indestructible Objects (Map Features)
*   **Border Walls:** Screen edges (unless "Loop" feature is active).
*   **Hard Blocks:** Metal/Grey blocks that cannot be destroyed (often used for the "Hideout" or "Turret" bases).

---

## 5. Map System
*Note: Maps are not strictly hardcoded "levels" but rather randomized arrangements of specific features. The reverse-engineered project should be able to generate maps containing one or more of the following archetypes:*

1.  **The Void:** Empty arena. Only players.
2.  **The Cache:** High density of Destructible Yellow Blocks and Orange Asteroids.
3.  **The Turret:** A neutral, invincible turret placed in the center. It rotates and fires standard projectiles at the nearest player.
4.  **Laser Beams:** Two moving emitters (either rotating or sliding along walls) create a lethal laser beam connection between them. Players must dash through or fly around the beam.
5.  **Repulse/Attract:** Large circular gravity wells.
    *   *Orange:* Pushes ships away.
    *   *Blue/Green:* Sucks ships in.
6.  **Loop:** Screen borders are disabled. Flying off the right wraps to the left.
7.  **Hideout:** Clusters of indestructible blocks that act as visual cover. Ships inside are obscured from enemies.
8.  **Large Obstacle (Moon-like):** A massive central circular object that blocks all fire and movement, forcing players to orbit it to fight.

---

## 6. Power-Ups
Power-ups appear in floating bubbles. They are collected by shooting the bubble or ramming it.

*   **Scatter Shot:** Fires 3 projectiles in a cone spread.
*   **Laser Beam:** A continuous hit-scan beam. Instantly destroys ships and penetrates through multiple soft blocks (Yellow blocks/Asteroids).
*   **Homing Missiles:** Fires projectiles that adjust their trajectory to track the nearest living enemy ship.
*   **Proximity Mine:** Drops a stationary, flashing mine from the rear of the ship. Explodes on contact with a ship or pilot.
*   **Joust:** Spawns two **Green Energy Layers** on the left and right flanks of the ship.
    *   *Function:* Acts as side-armor (blocking bullets from the side) and widens the ship's hitbox, allowing the player to "sideswipe" enemies to destroy them.
*   **Reverse All:** Global status effect. Inverts the rotation (Button A) for all players for a short duration.

---

## 7. Menu & Setup Logic

### 7.1. Pilot Selection (Lobby)
*   Four corners of the screen display "Join" prompts.
*   **Toggles:** Tapping the button cycles through:
    1.  **Player (1P, 2P, etc.)** - Active human player.
    2.  **OFF** - Slot is empty.
*   *Correction:* There is no AI/CPU toggle in the selection screen.
    Matchmaking Rules Summary

### 7.1.2 Minimum players required: 2
- Maximum players allowed: 4
-  Session starts only when:
-  playerCount ≥ 2
-  All active players are ready
-  If playerCount < 2:
-  Display warning:
-  “Player count is too low. Invite a friend or return to Main Menu.”

### 7.2. Settings (Advanced Setup)
Toggle switches to customize the engine:
*   **Asteroids:** Quantity slider (None -> Many).
*   **Auto-Balance:** Dynamic difficulty (Losing players get better power-ups).
*   **Powerups:** On/Off master switch.
*   **Fixed Spawn:** Ships spawn in corners vs. Random locations.
*   **Friendly Fire:** On/Off.
*   **Super Dash:** On/Off (Enables the double-tap Button A mechanic).

### 7.3. Restart Flow (Session Reset)
1. On Restart Button Click
- Create a new game session
- Preserve currently connected players
- Enter Matchmaking Ready State
- Player Count Handling:
- Required minimum players: 2
- If connected players ≥ 2:
- Wait for all players to confirm ready
- Start a new session automatically
- If connected players < 2:
- Show message:
- “Not enough players. Invite someone to play or return to Main Menu.”

### 7.3. Main Menu Flow
1. On Main Menu Button Click
- Remove the player from the current session
- Reduce the active matchmaking player count
- Remaining players stay in matchmaking
- Example:
- 4 players finish a session
- 1 player goes to Main Menu
- 3 players press Restart
- New matchmaking waits for 3 players to be ready
- Session starts once all ready

---

## 8. Technical Asset Requirements (For Reverse Engineering)

### 8.1. Visual Feedback
*   **Screen Shake:** Global camera offset must shake violently on ship death.
*   **Particles:**
    *   *Thrust:* Stream of particles opposite to movement.
    *   *Explosion:* 360-degree burst of pixel particles matching ship color.
    *   *Debris:* Grey/Yellow chunks when blocks/asteroids break.

### 8.2. Audio Cues
*   **Thrust:** Looping noise while Button B is held.
*   **Laser:** High pitch "pew".
*   **Explosion:** Bit-crushed noise.
*   **Announcer:** Arcade-style voice lines for major events ("FIGHT", "OVERTIME", "PLAYER 1 WINS").

### 9. Game States

* State        | Description
* Active       | Playing current round
* Eliminated   | Dead, spectating
* Ready        | Waiting for session start
* Disconnected | Left the session
* Menu	       | Returned to Main Menu