import { Physics } from "./systems/Physics";
import { Renderer } from "./systems/Renderer";
import { InputManager } from "./systems/Input";
import { setupCollisions } from "./systems/Collision";
import { NetworkManager } from "./network/NetworkManager";
import { Ship } from "./entities/Ship";
import { Pilot } from "./entities/Pilot";
import { Projectile } from "./entities/Projectile";
import {
  GamePhase,
  GameStateSync,
  PlayerInput,
  PlayerData,
  ShipState,
  PilotState,
  ProjectileState,
  GAME_CONFIG,
  PLAYER_COLORS,
} from "./types";

export class Game {
  private physics: Physics;
  private renderer: Renderer;
  private input: InputManager;
  private network: NetworkManager;

  private phase: GamePhase = "START";
  private ships: Map<string, Ship> = new Map();
  private pilots: Map<string, Pilot> = new Map();
  private projectiles: Projectile[] = [];
  private players: Map<string, PlayerData> = new Map();

  private pendingInputs: Map<string, PlayerInput> = new Map();
  private countdown: number = 0;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private lastTime: number = 0;
  private winnerId: string | null = null;

  // UI callbacks
  private onPhaseChange: ((phase: GamePhase) => void) | null = null;
  private onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;
  private onCountdownUpdate: ((count: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new Physics();
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.network = new NetworkManager();

    this.setupCollisions();
    this.input.setup();
  }

  // ============= INITIALIZATION =============

  private setupCollisions(): void {
    setupCollisions(this.physics, {
      onProjectileHitShip: (
        projectileOwnerId,
        shipPlayerId,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;

        const ship = this.ships.get(shipPlayerId);
        if (ship && ship.alive && !ship.isInvulnerable()) {
          this.destroyShip(shipPlayerId);
          this.removeProjectileByBody(projectileBody);
        }
      },

      onProjectileHitPilot: (
        projectileOwnerId,
        pilotPlayerId,
        projectileBody,
        pilotBody,
      ) => {
        if (!this.network.isHost()) return;

        const pilot = this.pilots.get(pilotPlayerId);
        if (pilot && pilot.alive) {
          this.killPilot(pilotPlayerId, projectileOwnerId);
          this.removeProjectileByBody(projectileBody);
        }
      },

      onShipHitPilot: (shipPlayerId, pilotPlayerId, pilotBody) => {
        if (!this.network.isHost()) return;

        const pilot = this.pilots.get(pilotPlayerId);
        if (pilot && pilot.alive) {
          this.killPilot(pilotPlayerId, shipPlayerId);
        }
      },

      onProjectileHitWall: (projectileBody) => {
        // Projectiles bounce off walls (handled by Matter.js restitution)
        // Could add particle effects here
      },
    });
  }

  setUICallbacks(callbacks: {
    onPhaseChange: (phase: GamePhase) => void;
    onPlayersUpdate: (players: PlayerData[]) => void;
    onCountdownUpdate: (count: number) => void;
  }): void {
    this.onPhaseChange = callbacks.onPhaseChange;
    this.onPlayersUpdate = callbacks.onPlayersUpdate;
    this.onCountdownUpdate = callbacks.onCountdownUpdate;
  }

  // ============= NETWORK =============

  async createRoom(): Promise<string> {
    const code = await this.network.createRoom();
    this.setupNetworkCallbacks();
    return code;
  }

  async joinRoom(code: string): Promise<boolean> {
    const success = await this.network.joinRoom(code);
    if (success) {
      this.setupNetworkCallbacks();
    }
    return success;
  }

  private setupNetworkCallbacks(): void {
    this.network.setCallbacks({
      onPlayerJoined: (playerId, playerIndex) => {
        this.addPlayer(playerId, playerIndex);
      },

      onPlayerLeft: (playerId) => {
        this.removePlayer(playerId);
      },

      onGameStateReceived: (state) => {
        if (!this.network.isHost()) {
          this.applyNetworkState(state);
        }
      },

      onInputReceived: (playerId, input) => {
        if (this.network.isHost()) {
          this.pendingInputs.set(playerId, input);
        }
      },

      onHostChanged: () => {
        console.log("[Game] Host changed, we are now host");

        // Update UI to reflect new host status
        this.onPlayersUpdate?.([...this.players.values()]);

        // If we become host mid-game, we need to handle it
        if (this.phase === "PLAYING") {
          // For now, end the game if host leaves mid-game
          // Full host migration would require reconstructing physics state
          console.log("[Game] Previous host left mid-game, ending match");
          this.endGame(this.network.getMyPlayerId() || "");
        }

        // If we become host during countdown, cancel and return to lobby
        if (this.phase === "COUNTDOWN") {
          if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
          }
          this.setPhase("LOBBY");
        }
      },

      onDisconnected: () => {
        console.log("[Game] Disconnected from room");
        this.handleDisconnected();
      },

      onGamePhaseReceived: (phase) => {
        console.log("[Game] RPC phase received:", phase);
        // Only non-host should process this (host already set the phase)
        if (!this.network.isHost()) {
          const oldPhase = this.phase;
          this.phase = phase;

          // If returning to LOBBY from GAME_END, clear game state
          if (phase === "LOBBY" && oldPhase === "GAME_END") {
            this.clearGameState();
          }

          this.onPhaseChange?.(phase);
        }
      },

      onWinnerReceived: (winnerId) => {
        console.log("[Game] RPC winner received:", winnerId);
        this.winnerId = winnerId;
        // UI will pick this up on next phase change or can update immediately
        this.onPlayersUpdate?.([...this.players.values()]);
      },
    });

    this.network.startSync();
    this.setPhase("LOBBY");
  }

  private handleDisconnected(): void {
    // Stop any ongoing countdown
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    // Clear game state
    this.clearGameState();
    this.players.clear();

    // Return to start screen
    this.setPhase("START");
  }

  // ============= PLAYER MANAGEMENT =============

  private addPlayer(playerId: string, playerIndex: number): void {
    // Don't add players during active gameplay - they missed the start
    if (this.phase === "PLAYING" || this.phase === "GAME_END") {
      console.log(
        "[Game] Player tried to join during active game, setting as spectator",
      );
      // Add as spectator
      const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
      const player: PlayerData = {
        id: playerId,
        name: this.network.getPlayerName(playerId),
        color,
        kills: 0,
        state: "SPECTATING",
      };
      this.players.set(playerId, player);
      this.onPlayersUpdate?.([...this.players.values()]);
      return;
    }

    // If joining during countdown and we're host, cancel countdown and return to lobby
    if (this.phase === "COUNTDOWN" && this.network.isHost()) {
      console.log("[Game] Player joined during countdown, restarting countdown");
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      // Don't go back to lobby, just restart countdown with new player
    }

    const color = PLAYER_COLORS[playerIndex % PLAYER_COLORS.length];
    const player: PlayerData = {
      id: playerId,
      name: this.network.getPlayerName(playerId),
      color,
      kills: 0,
      state: "ACTIVE",
    };
    this.players.set(playerId, player);
    this.onPlayersUpdate?.([...this.players.values()]);
  }

  private removePlayer(playerId: string): void {
    const ship = this.ships.get(playerId);
    if (ship) {
      ship.destroy();
      this.ships.delete(playerId);
    }

    const pilot = this.pilots.get(playerId);
    if (pilot) {
      pilot.destroy();
      this.pilots.delete(playerId);
    }

    this.players.delete(playerId);
    this.onPlayersUpdate?.([...this.players.values()]);

    // Handle based on current phase
    if (this.network.isHost()) {
      if (this.phase === "PLAYING") {
        // Check if remaining players should trigger a win
        this.checkEliminationWin();
      } else if (this.phase === "COUNTDOWN") {
        // If we drop below 2 players during countdown, cancel and return to lobby
        if (this.players.size < 2) {
          console.log(
            "[Game] Not enough players during countdown, returning to lobby",
          );
          if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
          }
          this.setPhase("LOBBY");
        }
      }
    }
  }

  // ============= GAME FLOW =============

  private setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.onPhaseChange?.(phase);

    if (this.network.isHost()) {
      this.network.broadcastGamePhase(phase);
    }
  }

  startGame(): void {
    if (!this.network.isHost()) return;
    if (this.network.getPlayerCount() < 2) return;

    this.startCountdown();
  }

  private startCountdown(): void {
    this.setPhase("COUNTDOWN");
    this.countdown = GAME_CONFIG.COUNTDOWN_DURATION;
    this.onCountdownUpdate?.(this.countdown);

    this.countdownInterval = setInterval(() => {
      this.countdown--;
      this.onCountdownUpdate?.(this.countdown);

      if (this.countdown <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        this.beginMatch();
      }
    }, 1000);
  }

  private beginMatch(): void {
    this.setPhase("PLAYING");

    // Initialize physics world with FIXED arena size
    this.physics.createWalls(GAME_CONFIG.ARENA_WIDTH, GAME_CONFIG.ARENA_HEIGHT);

    // Spawn ships for all players
    if (this.network.isHost()) {
      const playerIds = this.network.getPlayerIds();
      const spawnPoints = this.getSpawnPoints(
        playerIds.length,
        GAME_CONFIG.ARENA_WIDTH,
        GAME_CONFIG.ARENA_HEIGHT,
      );

      playerIds.forEach((playerId, index) => {
        const spawn = spawnPoints[index];
        const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        const ship = new Ship(
          this.physics,
          spawn.x,
          spawn.y,
          playerId,
          color,
          spawn.angle,
        );
        ship.invulnerableUntil = Date.now() + GAME_CONFIG.INVULNERABLE_TIME;
        this.ships.set(playerId, ship);

        const player = this.players.get(playerId);
        if (player) {
          player.state = "ACTIVE";
        }
      });
    }

    this.onPlayersUpdate?.([...this.players.values()]);
  }

  private getSpawnPoints(
    count: number,
    width: number,
    height: number,
  ): { x: number; y: number; angle: number }[] {
    const padding = 100;

    // Corners with angles facing toward arena center (first free direction clockwise after wall)
    // Top-left: walls on top & left, clockwise from up -> first free after wall is RIGHT
    // Top-right: walls on top & right, first free after right wall is DOWN
    // Bottom-right: walls on right & bottom, first free after bottom wall is LEFT
    // Bottom-left: walls on left & bottom, first free after left wall is UP
    const corners = [
      { x: padding, y: padding, angle: 0 }, // Top-left -> face RIGHT
      { x: width - padding, y: padding, angle: Math.PI / 2 }, // Top-right -> face DOWN
      { x: width - padding, y: height - padding, angle: Math.PI }, // Bottom-right -> face LEFT
      { x: padding, y: height - padding, angle: -Math.PI / 2 }, // Bottom-left -> face UP
    ];

    // For 2 players: use opposite corners (diagonal)
    if (count === 2) {
      return [corners[0], corners[2]]; // Top-left and Bottom-right
    }

    // For 3 players: triangle formation
    if (count === 3) {
      return [corners[0], corners[1], corners[2]];
    }

    // For 4 players: all corners
    const points: { x: number; y: number; angle: number }[] = [];
    for (let i = 0; i < count; i++) {
      points.push(corners[i % corners.length]);
    }

    return points;
  }


  // ============= COMBAT =============

  private destroyShip(playerId: string): void {
    const ship = this.ships.get(playerId);
    if (!ship || !ship.alive) return;

    const pos = ship.body.position;
    const vel = ship.body.velocity;

    // Spawn explosion particles
    this.renderer.spawnExplosion(pos.x, pos.y, ship.color.primary);
    this.renderer.addScreenShake(15, 0.4);

    // Create pilot
    const pilot = new Pilot(this.physics, pos.x, pos.y, playerId, vel);
    this.pilots.set(playerId, pilot);

    // Destroy ship
    ship.destroy();
    this.ships.delete(playerId);

    // Update player state
    const player = this.players.get(playerId);
    if (player) {
      player.state = "EJECTED";
      this.network.updatePlayerState(playerId, "EJECTED");
    }

    this.onPlayersUpdate?.([...this.players.values()]);
    this.triggerHaptic("heavy");
  }

  private killPilot(pilotPlayerId: string, killerId: string): void {
    const pilot = this.pilots.get(pilotPlayerId);
    if (!pilot || !pilot.alive) return;

    const pos = pilot.body.position;

    // Spawn death particles
    this.renderer.spawnExplosion(pos.x, pos.y, "#ff0000");
    this.renderer.addScreenShake(10, 0.3);

    // Destroy pilot
    pilot.destroy();
    this.pilots.delete(pilotPlayerId);

    // Update player state to spectating
    const player = this.players.get(pilotPlayerId);
    if (player) {
      player.state = "SPECTATING";
      this.network.updatePlayerState(pilotPlayerId, "SPECTATING");
    }

    // Award kill to killer
    const killer = this.players.get(killerId);
    if (killer) {
      killer.kills++;
      this.network.updateKills(killerId, killer.kills);

      // Check win condition by kills
      if (killer.kills >= GAME_CONFIG.KILLS_TO_WIN) {
        this.endGame(killerId);
        return;
      }
    }

    // Check win condition by elimination
    // If only one player is not spectating, they win
    this.checkEliminationWin();

    this.onPlayersUpdate?.([...this.players.values()]);
    this.triggerHaptic("success");
  }

  private checkEliminationWin(): void {
    // Count players who are still alive (not spectating)
    const alivePlayers = [...this.players.values()].filter(
      (p) => p.state !== "SPECTATING",
    );

    // If only one player remains and we're in a game, they win
    // Note: This handles both:
    // - Player killed (set to SPECTATING)
    // - Player disconnected (removed from players map entirely)
    if (alivePlayers.length === 1) {
      this.endGame(alivePlayers[0].id);
    } else if (alivePlayers.length === 0 && this.players.size > 0) {
      // Edge case: all active players died simultaneously or disconnected
      // Give win to whoever has most kills, or first player
      const sortedByKills = [...this.players.values()].sort(
        (a, b) => b.kills - a.kills,
      );
      this.endGame(sortedByKills[0].id);
    }
  }

  private respawnPlayer(
    playerId: string,
    position: { x: number; y: number },
  ): void {
    const player = this.players.get(playerId);
    if (!player) return;

    const color = player.color;

    // Calculate angle to face toward arena center
    const centerX = GAME_CONFIG.ARENA_WIDTH / 2;
    const centerY = GAME_CONFIG.ARENA_HEIGHT / 2;
    const angleToCenter = Math.atan2(
      centerY - position.y,
      centerX - position.x,
    );

    // Spawn ship at the provided position (pilot's position), facing center
    const ship = new Ship(
      this.physics,
      position.x,
      position.y,
      playerId,
      color,
      angleToCenter,
    );
    ship.invulnerableUntil = Date.now() + GAME_CONFIG.INVULNERABLE_TIME;
    this.ships.set(playerId, ship);

    player.state = "ACTIVE";
    this.network.updatePlayerState(playerId, "ACTIVE");

    this.onPlayersUpdate?.([...this.players.values()]);
  }

  private endGame(winnerId: string): void {
    this.winnerId = winnerId;
    this.setPhase("GAME_END");
    this.network.broadcastWinner(winnerId);
    this.triggerHaptic("success");
  }

  async restartGame(): Promise<void> {
    // Only host can initiate restart - non-host should wait for host's broadcast
    if (!this.network.isHost()) {
      console.log("[Game] Non-host cannot restart game, waiting for host");
      return;
    }

    // Reset player states on PlayroomKit (keeps customName)
    await this.network.resetAllPlayerStates();

    this.clearGameState();
    this.setPhase("LOBBY");
    this.onPlayersUpdate?.([...this.players.values()]);
  }

  private clearGameState(): void {
    // Clear all entities
    this.ships.forEach((ship) => ship.destroy());
    this.ships.clear();

    this.pilots.forEach((pilot) => pilot.destroy());
    this.pilots.clear();

    this.projectiles.forEach((proj) => proj.destroy());
    this.projectiles = [];

    // Clear network state caches
    this.networkShips = [];
    this.networkPilots = [];
    this.networkProjectiles = [];

    // Reset player scores
    this.players.forEach((player) => {
      player.kills = 0;
      player.state = "ACTIVE";
    });

    this.winnerId = null;
  }

  private removeProjectileByBody(body: Matter.Body): void {
    const index = this.projectiles.findIndex((p) => p.body === body);
    if (index !== -1) {
      this.projectiles[index].destroy();
      this.projectiles.splice(index, 1);
    }
  }

  // ============= GAME LOOP =============

  start(): void {
    this.renderer.resize();
    this.renderer.initStars();

    window.addEventListener("resize", () => {
      this.renderer.resize();
      // Stars and walls don't need to be recreated - arena size is fixed
    });

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.render(dt);

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number): void {
    if (this.phase !== "PLAYING") return;

    // Send local input
    const localInput = this.input.capture();
    this.network.sendInput(localInput);

    // Host: process all inputs and update physics
    if (this.network.isHost()) {
      // Apply inputs to ships
      this.ships.forEach((ship, playerId) => {
        const input = this.pendingInputs.get(playerId) || {
          buttonA: false,
          buttonB: false,
          dashTriggered: false,
          timestamp: 0,
        };

        const fireResult = ship.applyInput(input, dt);
        if (fireResult?.shouldFire) {
          const firePos = ship.getFirePosition();
          const projectile = new Projectile(
            this.physics,
            firePos.x,
            firePos.y,
            fireResult.fireAngle,
            playerId,
          );
          this.projectiles.push(projectile);
        }
      });

      // Update pilots
      const threats: { x: number; y: number }[] = [];
      this.ships.forEach((ship) => {
        if (ship.alive) {
          threats.push({ x: ship.body.position.x, y: ship.body.position.y });
        }
      });
      this.projectiles.forEach((proj) => {
        threats.push({ x: proj.body.position.x, y: proj.body.position.y });
      });

      this.pilots.forEach((pilot, playerId) => {
        pilot.update(dt, threats);

        // Check if pilot survived
        if (pilot.hasSurvived()) {
          // Get pilot position before destroying
          const pilotPosition = {
            x: pilot.body.position.x,
            y: pilot.body.position.y,
          };
          pilot.destroy();
          this.pilots.delete(playerId);
          // Respawn ship at pilot's position
          this.respawnPlayer(playerId, pilotPosition);
        }
      });

      // Update physics
      this.physics.update(dt * 1000);

      // Clean up expired projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        if (this.projectiles[i].isExpired()) {
          this.projectiles[i].destroy();
          this.projectiles.splice(i, 1);
        }
      }

      // Broadcast state
      this.broadcastState();
    }

    // Update particles and effects
    this.renderer.updateParticles(dt);
    this.renderer.updateScreenShake(dt);
  }

  private broadcastState(): void {
    const state: GameStateSync = {
      phase: this.phase,
      ships: [...this.ships.values()].map((s) => s.getState()),
      pilots: [...this.pilots.values()].map((p) => p.getState()),
      projectiles: this.projectiles.map((p) => p.getState()),
      players: [...this.players.values()],
      countdown: this.countdown,
      winnerId: this.winnerId ?? undefined,
    };

    this.network.broadcastGameState(state);
  }

  private applyNetworkState(state: GameStateSync): void {
    // Update players FIRST so names are available
    state.players.forEach((playerData) => {
      this.players.set(playerData.id, playerData);
    });
    this.onPlayersUpdate?.([...this.players.values()]);

    // Update winner BEFORE phase change so name is available in callback
    if (state.winnerId) {
      this.winnerId = state.winnerId;
    }

    // Update countdown
    if (state.countdown !== undefined) {
      this.countdown = state.countdown;
      this.onCountdownUpdate?.(this.countdown);
    }

    // Handle phase transitions
    if (state.phase !== this.phase) {
      const oldPhase = this.phase;
      this.phase = state.phase;

      // If returning to LOBBY from GAME_END, clear game state on non-host
      if (state.phase === "LOBBY" && oldPhase === "GAME_END") {
        this.clearGameState();
      }

      this.onPhaseChange?.(state.phase);
    }

    // Sync entity states for rendering on clients
    this.networkShips = state.ships;
    this.networkPilots = state.pilots;
    this.networkProjectiles = state.projectiles;
  }

  // Cached network state for rendering on clients
  private networkShips: ShipState[] = [];
  private networkPilots: PilotState[] = [];
  private networkProjectiles: ProjectileState[] = [];

  private render(dt: number): void {
    this.renderer.clear();
    this.renderer.beginFrame();

    // Draw background stars (in arena coordinates)
    this.renderer.drawStars();

    // Draw arena border
    this.renderer.drawArenaBorder();

    if (this.phase === "PLAYING" || this.phase === "GAME_END") {
      const isHost = this.network.isHost();

      // Draw ships (thrust animation always on since ship always thrusts forward)
      if (isHost) {
        this.ships.forEach((ship) => {
          if (ship.alive) {
            this.renderer.drawShip(ship.getState(), ship.color);
          }
        });
      } else {
        this.networkShips.forEach((state) => {
          if (state.alive) {
            const color = this.network.getPlayerColor(state.playerId);
            this.renderer.drawShip(state, color);
          }
        });
      }

      // Draw pilots
      if (isHost) {
        this.pilots.forEach((pilot) => {
          if (pilot.alive) {
            this.renderer.drawPilot(pilot.getState());
          }
        });
      } else {
        this.networkPilots.forEach((state) => {
          if (state.alive) {
            this.renderer.drawPilot(state);
          }
        });
      }

      // Draw projectiles
      if (isHost) {
        this.projectiles.forEach((proj) => {
          this.renderer.drawProjectile(proj.getState());
        });
      } else {
        this.networkProjectiles.forEach((state) => {
          this.renderer.drawProjectile(state);
        });
      }

      // Draw particles
      this.renderer.drawParticles();
    }

    // Draw countdown (in arena coordinates)
    if (this.phase === "COUNTDOWN" && this.countdown > 0) {
      this.renderer.drawCountdown(this.countdown);
    } else if (this.phase === "COUNTDOWN" && this.countdown === 0) {
      this.renderer.drawCountdown(0); // Shows "FIGHT!"
    }

    this.renderer.endFrame();
  }

  // ============= UTILITIES =============

  private triggerHaptic(
    type: "light" | "medium" | "heavy" | "success" | "error",
  ): void {
    if (
      typeof (window as unknown as { triggerHaptic?: (type: string) => void })
        .triggerHaptic === "function"
    ) {
      (
        window as unknown as { triggerHaptic: (type: string) => void }
      ).triggerHaptic(type);
    }
  }

  // ============= PUBLIC API =============

  getPhase(): GamePhase {
    return this.phase;
  }

  getPlayers(): PlayerData[] {
    return [...this.players.values()];
  }

  getWinnerId(): string | null {
    return this.winnerId;
  }

  getWinnerName(): string | null {
    if (!this.winnerId) return null;
    return this.network.getPlayerName(this.winnerId);
  }

  getRoomCode(): string {
    return this.network.getRoomCode();
  }

  isHost(): boolean {
    return this.network.isHost();
  }

  getPlayerCount(): number {
    return this.network.getPlayerCount();
  }

  canStartGame(): boolean {
    return this.network.isHost() && this.network.getPlayerCount() >= 2;
  }

  async leaveGame(): Promise<void> {
    // Stop any ongoing countdown
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    // Properly leave room using PlayroomKit's native leaveRoom()
    // This triggers onQuit for other players
    await this.network.disconnect();

    // Clear local state
    this.clearGameState();
    this.players.clear();

    // Return to start screen
    this.setPhase("START");
  }
}
