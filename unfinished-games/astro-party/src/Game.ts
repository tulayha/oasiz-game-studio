import { Physics } from "./systems/Physics";
import { Renderer } from "./systems/Renderer";
import { InputManager } from "./systems/Input";
import { MultiInputManager } from "./systems/MultiInputManager";
import { setupCollisions } from "./systems/Collision";
import { NetworkManager } from "./network/NetworkManager";
import { Ship } from "./entities/Ship";
import { Pilot } from "./entities/Pilot";
import { Projectile } from "./entities/Projectile";
import { BotVisibleData } from "./entities/AstroBot";
import { SettingsManager } from "./SettingsManager";
import { AudioManager } from "./AudioManager";
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
  private pendingDashes: Set<string> = new Set(); // Dash requests received via RPC
  private multiInput: MultiInputManager | null = null; // For local human bots
  private localPlayerSlots: Map<string, number> = new Map(); // playerId -> keySlot
  private useTouchForHost = false; // On mobile with touch zones, host input comes from MultiInputManager
  private countdown: number = 0;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastTime: number = 0;
  private winnerId: string | null = null;
  private winnerName: string | null = null;
  private latencyMs: number = 0;

  // Enable to show ping indicator (can wire to settings later)
  static SHOW_PING = true;

  // UI callbacks
  private onPhaseChange: ((phase: GamePhase) => void) | null = null;
  private onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;
  private onCountdownUpdate: ((count: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new Physics();
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.network = new NetworkManager();
    this.multiInput = new MultiInputManager();

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
    this.registerNetworkCallbacks();
    const code = await this.network.createRoom();
    this.initializeNetworkSession();
    return code;
  }

  async joinRoom(code: string): Promise<boolean> {
    this.registerNetworkCallbacks();
    const success = await this.network.joinRoom(code);
    if (success) {
      this.initializeNetworkSession();
    }
    return success;
  }

  // Set callbacks on NetworkManager so onPlayerJoin (which fires immediately
  // for existing players per PK docs) can find them during setupListeners()
  private registerNetworkCallbacks(): void {
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
        this.onPlayersUpdate?.(this.getPlayers());

        // If we become host mid-game, award win to highest scorer
        if (this.phase === "PLAYING") {
          console.log("[Game] Previous host left mid-game, ending match");
          const sortedByKills = [...this.players.values()].sort(
            (a, b) => b.kills - a.kills,
          );
          this.endGame(sortedByKills[0]?.id || this.network.getMyPlayerId() || "");
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
        this.winnerName =
          this.players.get(winnerId)?.name ??
          this.network.getPlayerName(winnerId);
        // UI will pick this up on next phase change or can update immediately
        this.onPlayersUpdate?.(this.getPlayers());
      },

      onCountdownReceived: (count) => {
        // Non-host receives countdown updates via RPC
        if (!this.network.isHost()) {
          this.countdown = count;
          this.onCountdownUpdate?.(count);
        }
      },

      onGameSoundReceived: (type, _playerId) => {
        // All clients play sounds when host broadcasts events
        switch (type) {
          case "fire":
            AudioManager.playFire();
            break;
          case "dash":
            AudioManager.playDash();
            break;
          case "explosion":
            AudioManager.playExplosion();
            AudioManager.playPilotEject();
            break;
          case "kill":
            AudioManager.playKill();
            AudioManager.playPilotDeath();
            break;
          case "respawn":
            AudioManager.playRespawn();
            break;
          case "win":
            AudioManager.playWin();
            break;
        }
      },

      onDashRequested: (playerId) => {
        // Host receives dash request, queues it for processing
        if (this.network.isHost()) {
          this.pendingDashes.add(playerId);
        }
      },

      onPingReceived: (latencyMs) => {
        this.latencyMs = latencyMs;
      },

      onPlayerListReceived: (playerOrder) => {
        // Non-host receives authoritative player order from host
        // Rebuild players map with correct indices/colors
        if (!this.network.isHost()) {
          this.rebuildPlayersFromOrder(playerOrder);
        }
      },
    });
  }

  // Start sync, ping, and transition to lobby — must be called after room exists
  private initializeNetworkSession(): void {
    this.network.startSync();

    // Set up dash detection callback - sends RPC when double-tap detected
    this.input.setDashCallback(() => {
      this.network.sendDashRequest();
    });

    // Start ping interval for latency measurement (host broadcasts, all receive)
    this.startPingInterval();

    this.setPhase("LOBBY");
  }

  private startPingInterval(): void {
    if (this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      if (this.network.isHost()) {
        this.network.broadcastPing();
      }
    }, 1000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleDisconnected(): void {
    // Stop any ongoing countdown
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    // Stop ping interval
    this.stopPingInterval();

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
      // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
      this.onPlayersUpdate?.(this.getPlayers());
      return;
    }

    // If joining during countdown and we're host, restart countdown to include new player
    if (this.phase === "COUNTDOWN" && this.network.isHost()) {
      console.log("[Game] Player joined during countdown, restarting countdown");
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      this.startCountdown();
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
    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());

    // Host broadcasts authoritative player order after any join
    if (this.network.isHost()) {
      this.network.broadcastPlayerList();
    }
  }

  // Rebuild players map from host's authoritative order
  private rebuildPlayersFromOrder(playerOrder: string[]): void {
    // Update each player's color based on host's order
    playerOrder.forEach((playerId, index) => {
      const existingPlayer = this.players.get(playerId);
      if (existingPlayer) {
        existingPlayer.color = PLAYER_COLORS[index % PLAYER_COLORS.length];
      } else {
        // Player not yet in our map, create them
        const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        const player: PlayerData = {
          id: playerId,
          name: this.network.getPlayerName(playerId),
          color,
          kills: 0,
          state: "ACTIVE",
        };
        this.players.set(playerId, player);
      }
    });

    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());
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
    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());

    // Host broadcasts updated player order after any leave
    if (this.network.isHost()) {
      this.network.broadcastPlayerList();
    }

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
    if (this.phase !== "LOBBY") return;
    if (this.network.getPlayerCount() < 2) return;

    this.startCountdown();
  }

  private startCountdown(): void {
    this.setPhase("COUNTDOWN");
    this.countdown = GAME_CONFIG.COUNTDOWN_DURATION;
    this.onCountdownUpdate?.(this.countdown);
    this.network.broadcastCountdown(this.countdown);

    this.countdownInterval = setInterval(() => {
      this.countdown--;
      this.onCountdownUpdate?.(this.countdown);
      this.network.broadcastCountdown(this.countdown);

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

    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());
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

    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());
    this.triggerHaptic("heavy");
    // Broadcast explosion sound to all players
    this.network.broadcastGameSound("explosion", playerId);
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

    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());
    this.triggerHaptic("success");
    // Broadcast kill sound to all players
    this.network.broadcastGameSound("kill", pilotPlayerId);
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

    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());
    // Broadcast respawn sound to all players
    this.network.broadcastGameSound("respawn", playerId);
  }

  private endGame(winnerId: string): void {
    this.winnerId = winnerId;
    this.winnerName =
      this.players.get(winnerId)?.name ??
      this.network.getPlayerName(winnerId);
    this.setPhase("GAME_END");
    this.network.broadcastWinner(winnerId);
    this.triggerHaptic("success");
    // Broadcast win sound to all players
    this.network.broadcastGameSound("win", winnerId);

    // Submit local player's score to the platform
    const myId = this.network.getMyPlayerId();
    if (myId) {
      const myPlayer = this.players.get(myId);
      if (myPlayer) {
        this.submitScore(myPlayer.kills);
      }
    }
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
    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());
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

    // Clear all input states to prevent stale inputs on next round
    this.pendingInputs.clear();
    this.pendingDashes.clear();
    this.input.reset();
    this.multiInput?.reset();

    // Reset player scores
    this.players.forEach((player) => {
      player.kills = 0;
      player.state = "ACTIVE";
    });

    this.winnerId = null;
    this.winnerName = null;
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

    // Send local input - use touch zones if active on mobile, otherwise InputManager
    const localInput = this.useTouchForHost
      ? (this.multiInput?.capture(0) || { buttonA: false, buttonB: false, timestamp: 0 })
      : this.input.capture();
    this.network.sendInput(localInput);

    // Host: process all inputs and update physics
    if (this.network.isHost()) {
      // Apply inputs to ships
      this.ships.forEach((ship, playerId) => {
        let input: PlayerInput;
        let shouldDash = false;

        // Check if this player is a bot
        const isBot = this.network.isPlayerBot(playerId);
        const botType = this.network.getPlayerBotType(playerId);

        if (isBot && botType === "ai") {
          // AI bot - get decision from bot's AI
          const player = this.network.getPlayer(playerId);
          const bot = player?.bot;
          if (bot) {
            const botData = this.getBotVisibleData(playerId);
            const action = bot.decideAction(botData);
            input = {
              buttonA: action.buttonA,
              buttonB: action.buttonB,
              timestamp: performance.now(),
            };
            shouldDash = action.dash;
          } else {
            input = { buttonA: false, buttonB: false, timestamp: 0 };
          }
        } else if (isBot && botType === "local") {
          // Local human bot - get input from MultiInputManager
          // (will be implemented in MultiInputManager task)
          const keySlot = this.network.getPlayerKeySlot(playerId);
          input = this.multiInput?.capture(keySlot) || {
            buttonA: false,
            buttonB: false,
            timestamp: 0,
          };
          // Check for dash from multi-input
          shouldDash = this.multiInput?.consumeDash(keySlot) || false;
        } else {
          // Human player - get input from network or touch zones
          const myId = this.network.getMyPlayerId();
          const isMe = playerId === myId;

          if (isMe && this.useTouchForHost) {
            // Host using touch zones - input already captured above, get from multiInput slot 0
            input = this.multiInput?.capture(0) || {
              buttonA: false,
              buttonB: false,
              timestamp: 0,
            };
            shouldDash = this.multiInput?.consumeDash(0) || false;
          } else {
            input = this.pendingInputs.get(playerId) || {
              buttonA: false,
              buttonB: false,
              timestamp: 0,
            };
            // Check for pending dash (received via RPC)
            shouldDash = this.pendingDashes.has(playerId);
            if (shouldDash) {
              this.pendingDashes.delete(playerId);
            }
          }
        }

        const fireResult = ship.applyInput(input, shouldDash, dt);
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
          // Broadcast fire sound to all players
          this.network.broadcastGameSound("fire", playerId);
        }

        // Broadcast dash sound when triggered
        if (shouldDash) {
          this.network.broadcastGameSound("dash", playerId);
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
    // Note: phase, countdown, winnerId are sent via RPC (reliable)
    // This broadcast only contains position data and player stats for rendering
    const state: GameStateSync = {
      ships: [...this.ships.values()].map((s) => s.getState()),
      pilots: [...this.pilots.values()].map((p) => p.getState()),
      projectiles: this.projectiles.map((p) => p.getState()),
      players: [...this.players.values()],
    };

    this.network.broadcastGameState(state);
  }

  private applyNetworkState(state: GameStateSync): void {
    // Update players for UI display (names, colors, kills)
    state.players.forEach((playerData) => {
      this.players.set(playerData.id, playerData);
    });
    // Use getPlayers() to ensure correct ordering from network.getPlayerIds()
    this.onPlayersUpdate?.(this.getPlayers());

    // Note: phase, countdown, winnerId are synced via RPC (reliable), not here

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
            // Use synced color from PlayerData, not local playerOrder
            const player = this.players.get(state.playerId);
            if (player) {
              this.renderer.drawShip(state, player.color);
            }
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
    SettingsManager.triggerHaptic(type);
  }

  private submitScore(score: number): void {
    console.log("[Game] Submitting score:", score);
    if (
      typeof (window as unknown as { submitScore?: (score: number) => void })
        .submitScore === "function"
    ) {
      (
        window as unknown as { submitScore: (score: number) => void }
      ).submitScore(score);
    }
  }

  // ============= PUBLIC API =============

  getPhase(): GamePhase {
    return this.phase;
  }

  getPlayers(): PlayerData[] {
    // Return players in canonical order (host's playerOrder)
    const playerIds = this.network.getPlayerIds();
    const orderedPlayers: PlayerData[] = [];
    for (const id of playerIds) {
      const player = this.players.get(id);
      if (player) {
        orderedPlayers.push(player);
      }
    }
    return orderedPlayers;
  }

  getWinnerId(): string | null {
    return this.winnerId;
  }

  getWinnerName(): string | null {
    return this.winnerName;
  }

  getRoomCode(): string {
    return this.network.getRoomCode();
  }

  isHost(): boolean {
    return this.network.isHost();
  }

  getMyPlayerId(): string | null {
    return this.network.getMyPlayerId();
  }

  getPlayerCount(): number {
    return this.network.getPlayerCount();
  }

  canStartGame(): boolean {
    return this.network.isHost() && this.network.getPlayerCount() >= 2;
  }

  getLatencyMs(): number {
    return this.latencyMs;
  }

  shouldShowPing(): boolean {
    return Game.SHOW_PING;
  }

  async leaveGame(): Promise<void> {
    // Stop any ongoing countdown
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    // Stop ping interval before disconnecting to prevent RPC calls during teardown
    this.stopPingInterval();

    // Leave room — PlayroomKit handles bot cleanup when room closes
    // Don't kick bots individually as it corrupts PlayroomKit state before disconnect
    await this.network.disconnect();

    // Clear local state
    this.clearGameState();
    this.players.clear();

    // Return to start screen
    this.setPhase("START");
  }

  setPlayerName(name: string): void {
    this.network.setCustomName(name);
  }

  // ============= TOUCH LAYOUT MANAGEMENT =============

  /**
   * Update the mobile touch control layout based on current local player count.
   * Called from main.ts when players change or on phase transitions.
   */
  updateTouchLayout(): void {
    if (!this.multiInput) return;

    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    if (!isMobile) {
      this.useTouchForHost = false;
      this.multiInput.destroyTouchZones();
      return;
    }

    // Count local players (host + local bots)
    let localCount = 1; // Host is always local
    for (const [playerId] of this.players) {
      if (this.network.getPlayerBotType(playerId) === "local") {
        localCount++;
      }
    }

    // Build slot-to-color-index mapping
    const slotToColorIndex = new Map<number, number>();
    const orderedPlayers = this.getPlayers();
    const myId = this.network.getMyPlayerId();

    // Host is always slot 0
    const hostIdx = orderedPlayers.findIndex((p) => p.id === myId);
    if (hostIdx >= 0) {
      slotToColorIndex.set(0, hostIdx);
    }

    // Map each local bot's key slot to their color index
    orderedPlayers.forEach((player, colorIndex) => {
      const botType = this.network.getPlayerBotType(player.id);
      if (botType === "local") {
        const keySlot = this.network.getPlayerKeySlot(player.id);
        slotToColorIndex.set(keySlot, colorIndex);
      }
    });

    // Determine layout
    let layout: "single" | "dual" | "corner";
    if (localCount <= 1) {
      layout = "single";
    } else if (localCount === 2) {
      layout = "dual";
    } else {
      layout = "corner";
    }

    // Activate slot 0 for the host on mobile touch
    this.multiInput.activateSlot(0);

    // Set up touch zones
    this.multiInput.setupTouchZones(layout, localCount, slotToColorIndex);
    this.useTouchForHost = true;
  }

  /**
   * Tear down touch zones (e.g., when leaving game)
   */
  clearTouchLayout(): void {
    this.useTouchForHost = false;
    this.multiInput?.destroyTouchZones();
  }

  // ============= BOT MANAGEMENT =============

  isPlayerBot(playerId: string): boolean {
    return this.network.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.network.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    return this.network.getPlayerKeySlot(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.network.hasRemotePlayers();
  }

  async addAIBot(): Promise<boolean> {
    if (this.phase !== "LOBBY") {
      console.log("[Game] Cannot add bots outside lobby phase");
      return false;
    }
    const bot = await this.network.addAIBot();
    return bot !== null;
  }

  async addLocalBot(keySlot: number): Promise<boolean> {
    if (this.phase !== "LOBBY") {
      console.log("[Game] Cannot add bots outside lobby phase");
      return false;
    }
    // Check if keySlot is already in use
    if (this.getUsedKeySlots().includes(keySlot)) {
      console.log("[Game] Key slot already in use:", keySlot);
      return false;
    }
    const bot = await this.network.addLocalBot(keySlot);
    if (bot) {
      // Activate the key slot for this local player
      this.multiInput?.activateSlot(keySlot);

      // We need to find the player ID for this bot after it joins
      // The bot is added as a player, so we track it when onPlayerJoined fires
      // For now, we'll update the mapping in a delayed check
      setTimeout(() => {
        for (const [playerId] of this.players) {
          const botType = this.network.getPlayerBotType(playerId);
          const slot = this.network.getPlayerKeySlot(playerId);
          if (botType === "local" && slot === keySlot) {
            this.localPlayerSlots.set(playerId, keySlot);
            break;
          }
        }
      }, 100);

      return true;
    }
    return false;
  }

  async removeBot(playerId: string): Promise<boolean> {
    // Deactivate the key slot if this is a local player
    const slot = this.localPlayerSlots.get(playerId);
    if (slot !== undefined) {
      this.multiInput?.deactivateSlot(slot);
      this.localPlayerSlots.delete(playerId);
    }

    return this.network.removeBot(playerId);
  }

  // Get key slots that are already in use by local players
  getUsedKeySlots(): number[] {
    const slots: number[] = [];
    // Slot 0 (WASD) is always used by the host player
    slots.push(0);

    for (const [playerId] of this.players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        const slot = this.network.getPlayerKeySlot(playerId);
        if (slot >= 0) slots.push(slot);
      }
    }
    return slots;
  }

  // Get info for local players (for displaying key hints)
  getLocalPlayersInfo(): Array<{ name: string; color: string; keyPreset: string }> {
    const localPlayers: Array<{ name: string; color: string; keyPreset: string }> = [];

    // First add the host player with WASD controls
    const myId = this.network.getMyPlayerId();
    const myPlayer = myId ? this.players.get(myId) : null;
    if (myPlayer) {
      localPlayers.push({
        name: myPlayer.name,
        color: myPlayer.color.primary,
        keyPreset: "A/← rotate | D/→ fire",
      });
    }

    // Then add local bot players
    for (const [playerId, player] of this.players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        const slot = this.network.getPlayerKeySlot(playerId);
        const keyHints = this.getKeyHintForSlot(slot);
        localPlayers.push({
          name: player.name,
          color: player.color.primary,
          keyPreset: keyHints,
        });
      }
    }

    return localPlayers;
  }

  // Get key hint text for a slot
  private getKeyHintForSlot(slot: number): string {
    switch (slot) {
      case 1:
        return "← rotate | →/Space fire";
      case 2:
        return "J rotate | L/I fire";
      case 3:
        return "Num4 rotate | Num6/8 fire";
      default:
        return "A rotate | D fire";
    }
  }

  // Check if there are any local players (for showing hints)
  hasLocalPlayers(): boolean {
    for (const [playerId] of this.players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        return true;
      }
    }
    return false;
  }

  // Provide game state data to AI bots for decision making
  private getBotVisibleData(botPlayerId: string): BotVisibleData {
    const myShip = this.ships.get(botPlayerId);
    const myPilot = this.pilots.get(botPlayerId);

    // Collect enemy ships
    const enemyShips: BotVisibleData["enemyShips"] = [];
    this.ships.forEach((ship, playerId) => {
      if (playerId !== botPlayerId && ship.alive) {
        enemyShips.push({
          x: ship.body.position.x,
          y: ship.body.position.y,
          angle: ship.body.angle,
          vx: ship.body.velocity.x,
          vy: ship.body.velocity.y,
          playerId,
        });
      }
    });

    // Collect enemy pilots
    const enemyPilots: BotVisibleData["enemyPilots"] = [];
    this.pilots.forEach((pilot, playerId) => {
      if (playerId !== botPlayerId && pilot.alive) {
        enemyPilots.push({
          x: pilot.body.position.x,
          y: pilot.body.position.y,
          vx: pilot.body.velocity.x,
          vy: pilot.body.velocity.y,
          playerId,
        });
      }
    });

    // Collect all projectiles (except own)
    const projectiles: BotVisibleData["projectiles"] = [];
    this.projectiles.forEach((proj) => {
      if (proj.ownerId !== botPlayerId) {
        projectiles.push({
          x: proj.body.position.x,
          y: proj.body.position.y,
          vx: proj.body.velocity.x,
          vy: proj.body.velocity.y,
          ownerId: proj.ownerId,
        });
      }
    });

    return {
      myShip: myShip
        ? {
            x: myShip.body.position.x,
            y: myShip.body.position.y,
            angle: myShip.body.angle,
            vx: myShip.body.velocity.x,
            vy: myShip.body.velocity.y,
            alive: myShip.alive,
          }
        : null,
      myPilot: myPilot
        ? {
            x: myPilot.body.position.x,
            y: myPilot.body.position.y,
            vx: myPilot.body.velocity.x,
            vy: myPilot.body.velocity.y,
            alive: myPilot.alive,
          }
        : null,
      enemyShips,
      enemyPilots,
      projectiles,
      arenaWidth: GAME_CONFIG.ARENA_WIDTH,
      arenaHeight: GAME_CONFIG.ARENA_HEIGHT,
    };
  }
}
