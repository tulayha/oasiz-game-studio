import { Physics } from "./systems/Physics";
import { Renderer } from "./systems/Renderer";
import { InputManager } from "./systems/Input";
import { MultiInputManager } from "./systems/MultiInputManager";
import { NetworkManager } from "./network/NetworkManager";
import { Ship } from "./entities/Ship";
import { Pilot } from "./entities/Pilot";
import { Projectile } from "./entities/Projectile";
import { PowerUp } from "./entities/PowerUp";
import { LaserBeam } from "./entities/LaserBeam";
import { Mine } from "./entities/Mine";
import { HomingMissile } from "./entities/HomingMissile";
import { PlayerManager } from "./managers/PlayerManager";
import { GameFlowManager } from "./managers/GameFlowManager";
import { BotManager } from "./managers/BotManager";
import { AsteroidManager } from "./managers/AsteroidManager";
import { CollisionManager } from "./managers/CollisionManager";
import { FireSystem } from "./managers/FireSystem";
import { TurretManager } from "./managers/TurretManager";
import { GameRenderer } from "./systems/GameRenderer";
import { NetworkSyncSystem } from "./network/NetworkSyncSystem";
import { PlayerInputResolver } from "./systems/PlayerInputResolver";
import {
  GamePhase,
  GameMode,
  BaseGameMode,
  PlayerData,
  PowerUpType,
  PlayerPowerUp,
  GAME_CONFIG,
  RoundResultPayload,
  AdvancedSettings,
  AdvancedSettingsSync,
  DEFAULT_ADVANCED_SETTINGS,
} from "./types";
import { GameConfig } from "./GameConfig";
import {
  applyModeTemplate,
  buildAdvancedOverrides,
  isCustomComparedToTemplate,
  sanitizeAdvancedSettings,
} from "./advancedSettings";

export class Game {
  private physics: Physics;
  private renderer: Renderer;
  private input: InputManager;
  private network: NetworkManager;
  private multiInput: MultiInputManager | null = null;

  // Managers
  private playerMgr: PlayerManager;
  private flowMgr: GameFlowManager;
  private botMgr: BotManager;
  private asteroidMgr: AsteroidManager;
  private collisionMgr!: CollisionManager;
  private fireSystem: FireSystem;
  private turretMgr: TurretManager;
  private gameRenderer: GameRenderer;
  private networkSync: NetworkSyncSystem;
  private inputResolver: PlayerInputResolver;

  // Entity state (shared with managers via reference)
  private ships: Map<string, Ship> = new Map();
  private pilots: Map<string, Pilot> = new Map();
  private projectiles: Projectile[] = [];
  private powerUps: PowerUp[] = [];
  private laserBeams: LaserBeam[] = [];
  private mines: Mine[] = [];
  private homingMissiles: HomingMissile[] = [];
  private playerPowerUps: Map<string, PlayerPowerUp | null> = new Map();

  private nitroColorIndex: number = 0;

  // Global rotation direction (1 = normal/cw, -1 = reversed/ccw)
  private rotationDirection: number = 1;

  // Timing
  private lastTime: number = 0;
  private latencyMs: number = 0;
  private lastBroadcastTime: number = 0;

  // Host migration tracking (proper migration not supported)
  private _originalHostLeft = false;

  private roundResult: RoundResultPayload | null = null;
  private advancedSettings: AdvancedSettings = {
    ...DEFAULT_ADVANCED_SETTINGS,
  };
  private currentMode: GameMode = "STANDARD";
  private baseMode: BaseGameMode = "STANDARD";

  static SHOW_PING = true;

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new Physics();
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.network = new NetworkManager();
    this.multiInput = new MultiInputManager();

    // Create managers
    this.playerMgr = new PlayerManager(this.network);
    this.flowMgr = new GameFlowManager(
      this.network,
      this.physics,
      this.renderer,
      this.input,
      this.multiInput,
    );
    this.botMgr = new BotManager(this.network, this.multiInput);
    this.asteroidMgr = new AsteroidManager(
      this.physics,
      this.network,
      this.flowMgr,
      this.powerUps,
      () => this.advancedSettings,
    );
    this.collisionMgr = new CollisionManager({
      network: this.network,
      renderer: this.renderer,
      flowMgr: this.flowMgr,
      playerMgr: this.playerMgr,
      asteroidMgr: this.asteroidMgr,
      ships: this.ships,
      pilots: this.pilots,
      projectiles: this.projectiles,
      powerUps: this.powerUps,
      mines: this.mines,
      homingMissiles: this.homingMissiles,
      playerPowerUps: this.playerPowerUps,
      onGrantPowerUp: (playerId, type) => this.grantPowerUp(playerId, type),
      onTriggerScreenShake: (intensity, duration) => this.triggerScreenShake(intensity, duration),
      onEmitPlayersUpdate: () => this.emitPlayersUpdate(),
      isDevModeEnabled: () => this.isDevModeEnabled(),
    });
    this.fireSystem = new FireSystem(
      this.physics,
      this.network,
      this.collisionMgr,
      this.projectiles,
      this.laserBeams,
      this.mines,
      this.homingMissiles,
      this.playerPowerUps,
      (intensity, duration) => this.triggerScreenShake(intensity, duration),
    );
    this.turretMgr = new TurretManager(
      this.physics,
      this.renderer,
      this.network,
      this.flowMgr,
      this.playerMgr,
      this.ships,
      this.pilots,
      this.playerPowerUps,
      this.fireSystem,
      (intensity, duration) => this.triggerScreenShake(intensity, duration),
    );
    this.gameRenderer = new GameRenderer(this.renderer);
    this.networkSync = new NetworkSyncSystem(
      this.network,
      this.renderer,
      this.playerMgr,
      this.playerPowerUps,
      () => this.emitPlayersUpdate(),
    );
    this.inputResolver = new PlayerInputResolver(
      this.network,
      this.input,
      this.multiInput,
      this.botMgr,
    );

    // Wire flow manager callbacks
    this.flowMgr.onPlayersUpdate = () => this.emitPlayersUpdate();
    this.flowMgr.onBeginMatch = () => {
      this.flowMgr.beginMatch(this.playerMgr.players, this.ships);
      this.asteroidMgr.spawnInitialAsteroids();
      this.asteroidMgr.scheduleAsteroidSpawnsIfNeeded();
      this.grantStartingPowerups();
      this.turretMgr.spawn();
    };
    this.flowMgr.onRoundResult = (payload) => {
      this.applyRoundResult(payload);
    };
    this.flowMgr.onResetRound = () => {
      this.resetForNextRound();
    };

    this.collisionMgr.registerCollisions(this.physics);

    this.input.setup();

    // Set up dev mode toggle callback
    this.input.setDevModeCallback((enabled) => {
      this.renderer.setDevMode(enabled);
      // Sync dev mode state across multiplayer
      if (this.network.isHost()) {
        this.network.broadcastDevMode(enabled);
      }
    });
  }

  // ============= ASTEROID & POWERUP LOGIC =============

  private grantStartingPowerups(): void {
    if (!this.network.isHost()) return;
    if (!this.advancedSettings.startPowerups) return;

    const options: PowerUpType[] = ["LASER", "SHIELD", "SCATTER", "MINE"];

    this.playerMgr.players.forEach((player) => {
      const ship = this.ships.get(player.id);
      if (!ship || !ship.alive) return;
      if (this.playerPowerUps.get(player.id)) return;
      const type = options[Math.floor(Math.random() * options.length)];
      this.grantPowerUp(player.id, type);
    });
  }

  private grantPowerUp(playerId: string, type: PowerUpType): void {
    if (type === "LASER") {
      this.playerPowerUps.set(playerId, {
        type: "LASER",
        charges: GAME_CONFIG.POWERUP_LASER_CHARGES,
        maxCharges: GAME_CONFIG.POWERUP_LASER_CHARGES,
        lastFireTime: 0,
        shieldHits: 0,
      });
    } else if (type === "SHIELD") {
      this.playerPowerUps.set(playerId, {
        type: "SHIELD",
        charges: 0,
        maxCharges: 0,
        lastFireTime: 0,
        shieldHits: 0,
      });
    } else if (type === "SCATTER") {
      this.playerPowerUps.set(playerId, {
        type: "SCATTER",
        charges: GAME_CONFIG.POWERUP_SCATTER_CHARGES,
        maxCharges: GAME_CONFIG.POWERUP_SCATTER_CHARGES,
        lastFireTime: 0,
        shieldHits: 0,
      });
    } else if (type === "MINE") {
      this.playerPowerUps.set(playerId, {
        type: "MINE",
        charges: 1,
        maxCharges: 1,
        lastFireTime: 0,
        shieldHits: 0,
      });
    } else if (type === "REVERSE") {
      // Toggle global rotation direction for all ships
      this.rotationDirection *= -1;
      console.log(
        `[Game] Rotation direction changed to: ${this.rotationDirection === 1 ? "clockwise" : "counter-clockwise"}`,
      );
      // Don't add to playerPowerUps since it's a global effect
    } else if (type === "JOUST") {
      this.playerPowerUps.set(playerId, {
        type: "JOUST",
        charges: 0,
        maxCharges: 0,
        lastFireTime: 0,
        shieldHits: 0,
        leftSwordActive: true,
        rightSwordActive: true,
      });
    } else if (type === "HOMING_MISSILE") {
      this.playerPowerUps.set(playerId, {
        type: "HOMING_MISSILE",
        charges: 1,
        maxCharges: 1,
        lastFireTime: 0,
        shieldHits: 0,
      });
    }
  }

  private spawnDashParticles(playerId: string, ship: Ship): void {
    if (!ship.alive) return;

    const pos = ship.body.position;
    const angle = ship.body.angle;
    const color = ship.color.primary;

    this.renderer.spawnDashParticles(pos.x, pos.y, angle, color);
    this.network.broadcastDashParticles(playerId, pos.x, pos.y, angle, color);
  }

  private spawnRandomPowerUp(): void {
    if (!this.network.isHost()) return;

    const weights = GAME_CONFIG.POWERUP_SPAWN_WEIGHTS;
    const entries = Object.entries(weights) as [PowerUpType, number][];
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    const rand = Math.random() * totalWeight;

    let cumulative = 0;
    let type: PowerUpType = entries[0][0];
    for (const [t, w] of entries) {
      cumulative += w;
      if (rand < cumulative) {
        type = t;
        break;
      }
    }

    const padding = 100;
    const x = padding + Math.random() * (GAME_CONFIG.ARENA_WIDTH - padding * 2);
    const y =
      padding + Math.random() * (GAME_CONFIG.ARENA_HEIGHT - padding * 2);

    const powerUp = new PowerUp(this.physics, x, y, type);
    this.powerUps.push(powerUp);

    console.log(
      "[Game] Spawned random " +
        type +
        " power-up at (" +
        x.toFixed(0) +
        ", " +
        y.toFixed(0) +
        ")",
    );
  }

  // ============= UI CALLBACKS =============

  setUICallbacks(callbacks: {
    onPhaseChange: (phase: GamePhase) => void;
    onPlayersUpdate: (players: PlayerData[]) => void;
    onCountdownUpdate: (count: number) => void;
    onGameModeChange?: (mode: GameMode) => void;
    onRoundResult?: (payload: RoundResultPayload) => void;
    onAdvancedSettingsChange?: (settings: AdvancedSettings) => void;
    onSystemMessage?: (message: string, durationMs?: number) => void;
  }): void {
    this.flowMgr.onPhaseChange = callbacks.onPhaseChange;
    this.flowMgr.onCountdownUpdate = callbacks.onCountdownUpdate;
    this._onPlayersUpdate = callbacks.onPlayersUpdate;
    this._onGameModeChange = callbacks.onGameModeChange ?? null;
    this._onRoundResult = callbacks.onRoundResult ?? null;
    this._onAdvancedSettingsChange = callbacks.onAdvancedSettingsChange ?? null;
    this._onSystemMessage = callbacks.onSystemMessage ?? null;
  }

  private _onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;
  private _onGameModeChange: ((mode: GameMode) => void) | null = null;
  private _onRoundResult: ((payload: RoundResultPayload) => void) | null = null;
  private _onAdvancedSettingsChange:
    | ((settings: AdvancedSettings) => void)
    | null = null;
  private _onSystemMessage:
    | ((message: string, durationMs?: number) => void)
    | null = null;

  private emitPlayersUpdate(): void {
    this._onPlayersUpdate?.(this.getPlayers());
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

  private registerNetworkCallbacks(): void {
    this.network.setCallbacks({
      onPlayerJoined: (playerId, playerIndex) => {
        this.playerMgr.addPlayer(
          playerId,
          playerIndex,
          this.flowMgr.phase,
          () => this.emitPlayersUpdate(),
          () => this.flowMgr.startCountdown(),
        );
        if (this.network.isHost()) {
          this.broadcastModeState();
        }
      },

      onPlayerLeft: (playerId) => {
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
        this.playerPowerUps.delete(playerId);

        this.playerMgr.removePlayer(playerId, () => this.emitPlayersUpdate());

        if (this.network.isHost()) {
          if (this.flowMgr.phase === "PLAYING") {
            this.flowMgr.checkEliminationWin(this.playerMgr.players);
          } else if (this.flowMgr.phase === "COUNTDOWN") {
            if (this.playerMgr.players.size < 2) {
              console.log(
                "[Game] Not enough players during countdown, returning to lobby",
              );
              if (this.flowMgr.countdownInterval) {
                clearInterval(this.flowMgr.countdownInterval);
                this.flowMgr.countdownInterval = null;
              }
              this.flowMgr.setPhase("LOBBY");
            }
          }
        }
      },

      onGameStateReceived: (state) => {
        if (!this.network.isHost()) {
          this.networkSync.applyNetworkState(state);
        }
      },

      onInputReceived: (playerId, input) => {
        if (this.network.isHost()) {
          this.inputResolver.setPendingInput(playerId, input);
        }
      },

      onHostChanged: () => {
        console.log("[Game] Host left, leaving room");
        this._onSystemMessage?.("Host left, returning to menu", 5000);
        void this.leaveGame();
      },

      onDisconnected: () => {
        console.log("[Game] Disconnected from room");
        this.handleDisconnected();
      },

      onGamePhaseReceived: (phase, winnerId, winnerName) => {
        console.log("[Game] RPC phase received:", phase);
        if (!this.network.isHost()) {
          const oldPhase = this.flowMgr.phase;
          this.flowMgr.phase = phase;

          if (phase === "GAME_END" && winnerId && winnerName) {
            this.flowMgr.winnerId = winnerId;
            this.flowMgr.winnerName = winnerName;
            this.emitPlayersUpdate();
          }

          if (phase === "LOBBY" && oldPhase === "GAME_END") {
            this.clearAllGameState();
          }

          this.flowMgr.onPhaseChange?.(phase);
        }
      },

      onCountdownReceived: (count) => {
        if (!this.network.isHost()) {
          this.flowMgr.countdown = count;
          this.flowMgr.onCountdownUpdate?.(count);
        }
      },

      onGameSoundReceived: (type, _playerId) => {
        this.fireSystem.playGameSoundLocal(type);
      },

      onDashRequested: (playerId) => {
        if (this.network.isHost()) {
          this.inputResolver.queueDash(playerId);
        }
      },

      onPingReceived: (latencyMs) => {
        this.latencyMs = latencyMs;
      },

      onPlayerListReceived: (playerOrder, _meta) => {
        if (!this.network.isHost()) {
          this.playerMgr.rebuildPlayersFromOrder(playerOrder, () =>
            this.emitPlayersUpdate(),
          );
        }
      },

      onRoundResultReceived: (payload) => {
        if (!this.network.isHost()) {
          this.applyRoundResult(payload);
        }
      },

      onDevModeReceived: (enabled) => {
        this.setDevModeFromNetwork(enabled);
      },

      onAdvancedSettingsReceived: (payload) => {
        this.applyModeStateFromNetwork(payload);
      },

      onScreenShakeReceived: (intensity, duration) => {
        if (this.network.isHost()) return;
        this.triggerScreenShake(intensity, duration);
      },

      onDashParticlesReceived: (payload) => {
        if (this.network.isHost()) return;
        this.renderer.spawnDashParticles(
          payload.x,
          payload.y,
          payload.angle,
          payload.color,
        );
      },

    });
  }

  private applyModeStateFromNetwork(payload: AdvancedSettingsSync): void {
    const sanitized = sanitizeAdvancedSettings(payload.settings);
    this.baseMode = payload.baseMode;
    this.currentMode = payload.mode;
    this.advancedSettings = sanitized;
    this.applyAdvancedOverrides(sanitized, this.baseMode);
    this._onGameModeChange?.(this.currentMode);
    this._onAdvancedSettingsChange?.(sanitized);
  }

  private initializeNetworkSession(): void {
    this.network.startSync();

    this.input.setDashCallback(() => {
      this.handleLocalDash();
    });

    this.flowMgr.setPhase("LOBBY");
  }

  private handleLocalDash(): void {
    if (this.network.isHost()) {
      const myId = this.network.getMyPlayerId();
      if (myId) {
        this.inputResolver.queueDash(myId);
      }
      return;
    }

    this.network.sendDashRequest();
  }

  private triggerScreenShake(intensity: number, duration: number): void {
    this.renderer.addScreenShake(intensity, duration);
  }

  private handleDisconnected(): void {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }
    this.clearAllGameState();
    this.playerMgr.clear();
    this._originalHostLeft = false;
    this.resetAdvancedSettings();
    this.flowMgr.setPhase("START");
  }

  /** Shared cleanup for both full reset and between-round reset */
  private clearEntities(resetScores: boolean): void {
    this.flowMgr.clearGameState(
      this.ships,
      this.pilots,
      this.projectiles,
      this.inputResolver.getPendingInputs(),
      this.inputResolver.getPendingDashes(),
      this.playerMgr.players,
      resetScores,
    );

    this.renderer.clearEffects();
    this.asteroidMgr.cleanup();

    this.powerUps.forEach((powerUp) => powerUp.destroy());
    this.powerUps.length = 0;

    this.laserBeams.forEach((beam) => beam.destroy());
    this.laserBeams.length = 0;

    this.mines.forEach((mine) => mine.destroy());
    this.mines.length = 0;

    this.homingMissiles.forEach((missile) => missile.destroy());
    this.homingMissiles.length = 0;

    this.turretMgr.clear();

    this.playerPowerUps.clear();
    this.rotationDirection = 1;
    this.roundResult = null;
  }

  /** Clear all entity/game state including network caches and throttles */
  private clearAllGameState(): void {
    this.clearEntities(true);
    this.networkSync.clear();
    this.fireSystem.clearThrottles();
  }

  private resetAdvancedSettings(): void {
    this.baseMode = "STANDARD";
    this.currentMode = "STANDARD";
    this.advancedSettings = applyModeTemplate(this.baseMode);
    GameConfig.setMode(this.baseMode);
    GameConfig.clearAdvancedOverrides();
    this._onGameModeChange?.(this.currentMode);
    this._onAdvancedSettingsChange?.(this.advancedSettings);
  }

  private resetForNextRound(): void {
    this.clearEntities(false);
    this.networkSync.clearClientTracking();
  }

  // ============= GAME LOOP =============

  start(): void {
    this.renderer.resize();
    this.renderer.initStars();

    window.addEventListener("resize", () => {
      this.renderer.resize();
    });

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  handleResize(): void {
    this.renderer.resize();
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.render(dt);

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number): void {
    if (this.flowMgr.phase !== "PLAYING") return;

    // Send local input (throttled to sync rate)
    const now = performance.now();
    this.inputResolver.captureLocalInput(now, this.botMgr.useTouchForHost);
    this.inputResolver.sendLocalInputIfNeeded(now);

    // Check dev keys for testing powerups (only for local player on host)
    const devKeys = this.input.consumeDevKeys();
    const myPlayerId = this.network.getMyPlayerId();
    if (myPlayerId && this.network.isHost()) {
      const myShip = this.ships.get(myPlayerId);
      const existingPowerUp = this.playerPowerUps.get(myPlayerId);
      const grantDevPowerUp = (
        flag: boolean,
        type: PowerUpType,
        label: string,
      ): void => {
        if (!flag) return;
        console.log("[Dev] Granting " + label + " powerup");
        this.grantPowerUp(myPlayerId, type);
      };

      if (myShip && myShip.alive && !existingPowerUp) {
        grantDevPowerUp(devKeys.laser, "LASER", "LASER");
        grantDevPowerUp(devKeys.shield, "SHIELD", "SHIELD");
        grantDevPowerUp(devKeys.scatter, "SCATTER", "SCATTER");
        grantDevPowerUp(devKeys.mine, "MINE", "MINE");
        grantDevPowerUp(devKeys.joust, "JOUST", "JOUST");
        grantDevPowerUp(devKeys.homing, "HOMING_MISSILE", "HOMING_MISSILE");
      }

      // Reverse can be triggered even with existing power-up since it's global
      if (devKeys.reverse) {
        console.log("[Dev] Toggling REVERSE rotation");
        this.grantPowerUp(myPlayerId, "REVERSE");
      }

      if (devKeys.spawnPowerUp) {
        console.log("[Dev] Spawning random power-up");
        this.spawnRandomPowerUp();
      }
    }

    // Host: process all inputs and update physics
    if (this.network.isHost()) {
      this.ships.forEach((ship, playerId) => {
        const { input, shouldDash } = this.inputResolver.resolveHostInput(
          playerId,
          this.ships,
          this.pilots,
          this.projectiles,
        );

        // Check if player has joust for speed boost
        const playerPowerUp = this.playerPowerUps.get(playerId);
        const hasJoust = playerPowerUp?.type === "JOUST";
        const speedMultiplier = hasJoust ? 1.4 : 1;

        const fireResult = ship.applyInput(
          input,
          shouldDash,
          dt,
          this.rotationDirection,
          speedMultiplier,
        );
        this.fireSystem.processFire(playerId, ship, fireResult, shouldDash);
        if (shouldDash) {
          this.spawnDashParticles(playerId, ship);
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
        const input =
          pilot.controlMode === "player"
            ? this.inputResolver.getPilotInputForPlayer(playerId)
            : undefined;
        pilot.update(dt, threats, input, this.rotationDirection);

        if (pilot.hasSurvived()) {
          const pilotPosition = {
            x: pilot.body.position.x,
            y: pilot.body.position.y,
          };
          pilot.destroy();
          this.pilots.delete(playerId);
          this.flowMgr.respawnPlayer(
            playerId,
            pilotPosition,
            this.ships,
            this.playerMgr.players,
          );
        }
      });

      this.physics.update(dt * 1000);

      // Clean up expired projectiles
      this.cleanupExpired(
        this.projectiles,
        (projectile) => projectile.isExpired(),
        (projectile) => projectile.destroy(),
      );

      // Wrap asteroids around the arena
      this.asteroidMgr.getAsteroids().forEach((asteroid) => {
        this.physics.wrapAround(asteroid.body);
      });

      // Update power-ups (magnetic effect)
      const shipPositionsForPowerUps = new Map<
        string,
        { x: number; y: number; alive: boolean; hasPowerUp: boolean }
      >();
      this.ships.forEach((ship, playerId) => {
        shipPositionsForPowerUps.set(playerId, {
          x: ship.body.position.x,
          y: ship.body.position.y,
          alive: ship.alive,
          hasPowerUp: this.playerPowerUps.has(playerId),
        });
      });

      this.powerUps.forEach((powerUp) => {
        powerUp.update(shipPositionsForPowerUps, dt);
      });

      // Clean up expired power-ups
      this.cleanupExpired(
        this.powerUps,
        (powerUp) => powerUp.isExpired(),
        (powerUp) => powerUp.destroy(),
      );

      // Clean up expired laser beams
      this.cleanupExpired(
        this.laserBeams,
        (beam) => beam.isExpired(),
        (beam) => beam.destroy(),
      );

      // Check mine collisions and clean up expired mines
      this.collisionMgr.checkMineCollisions();
      this.cleanupExpired(
        this.mines,
        (mine) => mine.isExpired(),
        (mine) => mine.destroy(),
      );

      // Update homing missiles and check collisions
      this.collisionMgr.updateHomingMissiles(dt);
      this.collisionMgr.checkHomingMissileCollisions();
      this.cleanupExpired(
        this.homingMissiles,
        (missile) => missile.isExpired() || !missile.alive,
        (missile) => missile.destroy(),
      );

      // Check Joust collisions (sword-to-ship and sword-to-projectile)
      this.collisionMgr.checkJoustCollisions();

      // Update turret and bullets
      this.turretMgr.update(dt);

      // Broadcast state (throttled to sync rate)
      if (now - this.lastBroadcastTime >= GAME_CONFIG.SYNC_INTERVAL) {
        this.networkSync.broadcastState({
          ships: this.ships,
          pilots: this.pilots,
          projectiles: this.projectiles,
          asteroids: this.asteroidMgr.getAsteroids(),
          powerUps: this.powerUps,
          laserBeams: this.laserBeams,
          mines: this.mines,
          homingMissiles: this.homingMissiles,
          turret: this.turretMgr.getTurret(),
          turretBullets: this.turretMgr.getTurretBullets(),
          playerPowerUps: this.playerPowerUps,
          rotationDirection: this.rotationDirection,
          screenShakeIntensity: this.renderer.getScreenShakeIntensity(),
          screenShakeDuration: this.renderer.getScreenShakeDuration(),
        });
        this.lastBroadcastTime = now;
      }
    }

    // Update particles and effects
    this.renderer.updateParticles(dt);
    this.renderer.updateScreenShake(dt);

    // Update visual effects for all clients (nitro particles, etc.)
    this.updateVisualEffects();
  }

  private cleanupExpired<T>(
    items: T[],
    isExpired: (item: T) => boolean,
    onDestroy: (item: T) => void,
  ): void {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (isExpired(item)) {
        onDestroy(item);
        items.splice(i, 1);
      }
    }
  }

  private applyRoundResult(payload: RoundResultPayload): void {
    this.roundResult = payload;
    Object.entries(payload.roundWinsById).forEach(([playerId, wins]) => {
      const player = this.playerMgr.players.get(playerId);
      if (player) {
        player.roundWins = wins;
      }
    });
    this.emitPlayersUpdate();
    this._onRoundResult?.(payload);
  }

  private updateVisualEffects(): void {
    // Spawn nitro particles for joust power-up (runs for all clients)
    // For host: use this.ships with physics bodies
    if (this.network.isHost()) {
      this.ships.forEach((ship, playerId) => {
        const joustPowerUp = this.playerPowerUps.get(playerId);
        if (joustPowerUp?.type === "JOUST") {
          const shipAngle = ship.body.angle;
          const tailX = ship.body.position.x - Math.cos(shipAngle) * 18;
          const tailY = ship.body.position.y - Math.sin(shipAngle) * 18;

          // Spawn nitro particles (orange/yellow fire) - deterministic 60/40 color cycle
          const color = this.nitroColorIndex++ % 5 < 3 ? "#ff6600" : "#ffee00";
          this.renderer.spawnNitroParticle(tailX, tailY, color);
        }
      });
    } else {
      // For non-host: use smoothed ship positions so particles track the rendered ship
      const renderState = this.networkSync.getRenderState();
      const smoothedShips = renderState.shipSmoother.smooth(
        renderState.networkShips,
        (s) => s.playerId,
      );
      smoothedShips.forEach((shipState) => {
        const joustPowerUp = this.playerPowerUps.get(shipState.playerId);
        if (joustPowerUp?.type === "JOUST") {
          const shipAngle = shipState.angle;
          const tailX = shipState.x - Math.cos(shipAngle) * 18;
          const tailY = shipState.y - Math.sin(shipAngle) * 18;

          // Spawn nitro particles (orange/yellow fire) - deterministic 60/40 color cycle
          const color = this.nitroColorIndex++ % 5 < 3 ? "#ff6600" : "#ffee00";
          this.renderer.spawnNitroParticle(tailX, tailY, color);
        }
      });
    }
  }

  private render(dt: number): void {
    const renderState = this.networkSync.getRenderState();
    this.gameRenderer.render({
      dt,
      phase: this.flowMgr.phase,
      countdown: this.flowMgr.countdown,
      isHost: this.network.isHost(),
      isDevModeEnabled: this.isDevModeEnabled(),
      ships: this.ships,
      pilots: this.pilots,
      projectiles: this.projectiles,
      asteroids: this.asteroidMgr.getAsteroids(),
      powerUps: this.powerUps,
      laserBeams: this.laserBeams,
      mines: this.mines,
      homingMissiles: this.homingMissiles,
      turret: this.turretMgr.getTurret(),
      turretBullets: this.turretMgr.getTurretBullets(),
      playerPowerUps: this.playerPowerUps,
      players: this.playerMgr.players,
      networkShips: renderState.networkShips,
      networkPilots: renderState.networkPilots,
      networkProjectiles: renderState.networkProjectiles,
      networkAsteroids: renderState.networkAsteroids,
      networkPowerUps: renderState.networkPowerUps,
      networkLaserBeams: renderState.networkLaserBeams,
      networkMines: renderState.networkMines,
      networkHomingMissiles: renderState.networkHomingMissiles,
      networkTurret: renderState.networkTurret,
      networkTurretBullets: renderState.networkTurretBullets,
      shipSmoother: renderState.shipSmoother,
      projectileSmoother: renderState.projectileSmoother,
      asteroidSmoother: renderState.asteroidSmoother,
      pilotSmoother: renderState.pilotSmoother,
      missileSmoother: renderState.missileSmoother,
    });
  }

  // ============= PUBLIC API =============

  getPhase(): GamePhase {
    return this.flowMgr.phase;
  }

  getPlayers(): PlayerData[] {
    return this.playerMgr.getPlayers();
  }

  getWinnerId(): string | null {
    return this.flowMgr.winnerId;
  }

  getWinnerName(): string | null {
    return this.flowMgr.winnerName;
  }

  getRoomCode(): string {
    return this.network.getRoomCode();
  }

  isHost(): boolean {
    return this.network.isHost();
  }

  didHostLeave(): boolean {
    return this._originalHostLeft;
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

  getNetworkTelemetry(): {
    latencyMs: number;
    jitterMs: number;
    snapshotAgeMs: number;
    snapshotIntervalMs: number;
    webrtcConnected: boolean;
  } {
    const telemetry = this.networkSync.getSnapshotTelemetry();
    return {
      latencyMs: this.latencyMs,
      jitterMs: telemetry.jitterMs,
      snapshotAgeMs: telemetry.snapshotAgeMs,
      snapshotIntervalMs: telemetry.snapshotIntervalMs,
      webrtcConnected: this.network.isWebRtcConnected(),
    };
  }

  getHostId(): string | null {
    return this.network.getHostId();
  }

  shouldShowPing(): boolean {
    return Game.SHOW_PING;
  }

  getRoundResult(): RoundResultPayload | null {
    return this.roundResult;
  }

  private applyAdvancedOverrides(
    settings: AdvancedSettings,
    baseMode: BaseGameMode,
  ): void {
    GameConfig.setMode(baseMode);
    const baseTemplate = applyModeTemplate(baseMode);
    const overrides = buildAdvancedOverrides(settings, baseTemplate);
    if (overrides.configOverrides || overrides.physicsOverrides) {
      GameConfig.setAdvancedOverrides(
        overrides.configOverrides,
        overrides.physicsOverrides,
      );
    } else {
      GameConfig.clearAdvancedOverrides();
    }
  }

  private broadcastModeState(): void {
    if (!this.network.isHost()) return;
    const payload: AdvancedSettingsSync = {
      mode: this.currentMode,
      baseMode: this.baseMode,
      settings: this.advancedSettings,
    };
    this.network.broadcastAdvancedSettings(payload);
  }

  getAdvancedSettings(): AdvancedSettings {
    return { ...this.advancedSettings };
  }

  setAdvancedSettings(
    settings: AdvancedSettings,
    source: "local" | "remote" = "local",
  ): void {
    if (source === "local" && !this.network.isHost()) return;
    const sanitized = sanitizeAdvancedSettings(settings);
    this.advancedSettings = sanitized;
    const baseTemplate = applyModeTemplate(this.baseMode);
    const isCustom = isCustomComparedToTemplate(sanitized, baseTemplate);
    const nextMode: GameMode = isCustom ? "CUSTOM" : this.baseMode;
    const modeChanged = nextMode !== this.currentMode;
    this.currentMode = nextMode;
    this.applyAdvancedOverrides(sanitized, this.baseMode);
    if (source === "local" && this.network.isHost()) {
      this.broadcastModeState();
    }
    if (modeChanged) {
      this._onGameModeChange?.(this.currentMode);
    }
    this._onAdvancedSettingsChange?.(sanitized);
  }

  setGameMode(mode: GameMode, source: "local" | "remote" = "local"): void {
    if (source === "local" && !this.network.isHost()) return;
    if (mode === "CUSTOM") {
      this.currentMode = "CUSTOM";
      this._onGameModeChange?.(this.currentMode);
      if (source === "local" && this.network.isHost()) {
        this.broadcastModeState();
      }
      return;
    }

    this.baseMode = mode;
    this.currentMode = mode;
    const template = applyModeTemplate(mode);
    template.roundsToWin = this.advancedSettings.roundsToWin;
    this.advancedSettings = sanitizeAdvancedSettings(template);
    this.applyAdvancedOverrides(this.advancedSettings, this.baseMode);
    this._onGameModeChange?.(this.currentMode);
    this._onAdvancedSettingsChange?.(this.advancedSettings);
    if (source === "local" && this.network.isHost()) {
      this.broadcastModeState();
    }
  }

  getGameMode(): GameMode {
    return this.currentMode;
  }

  startGame(): void {
    // Broadcast mode + advanced settings to all clients before starting countdown
    this.broadcastModeState();
    this.roundResult = null;
    this.flowMgr.startGame();
  }

  async leaveGame(): Promise<void> {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }

    await this.network.disconnect();

    this.clearAllGameState();
    this.playerMgr.clear();
    this._originalHostLeft = false;
    this.resetAdvancedSettings();

    this.flowMgr.setPhase("START");
  }

  async restartGame(): Promise<void> {
    if (!this.network.isHost()) {
      console.log("[Game] Non-host cannot restart game, waiting for host");
      return;
    }

    await this.network.resetAllPlayerStates();

    this.clearAllGameState();
    this.flowMgr.setPhase("LOBBY");
    this.emitPlayersUpdate();
  }

  setPlayerName(name: string): void {
    this.network.setCustomName(name);
  }

  // ============= BOT DELEGATION =============

  isPlayerBot(playerId: string): boolean {
    return this.botMgr.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.botMgr.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    return this.botMgr.getPlayerKeySlot(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.botMgr.hasRemotePlayers();
  }

  async addAIBot(): Promise<boolean> {
    return this.botMgr.addAIBot(this.flowMgr.phase);
  }

  async addLocalBot(keySlot: number): Promise<boolean> {
    return this.botMgr.addLocalBot(
      keySlot,
      this.flowMgr.phase,
      this.playerMgr.players,
    );
  }

  async removeBot(playerId: string): Promise<boolean> {
    return this.botMgr.removeBot(playerId);
  }

  async kickPlayer(playerId: string): Promise<boolean> {
    if (!this.network.isHost()) {
      console.log("[Game] Only host can kick players");
      return false;
    }

    const myId = this.network.getMyPlayerId();
    if (myId && playerId === myId) {
      console.log("[Game] Host cannot kick themselves");
      return false;
    }

    if (this.botMgr.isPlayerBot(playerId)) {
      return this.botMgr.removeBot(playerId);
    }

    return this.network.kickPlayer(playerId);
  }

  getUsedKeySlots(): number[] {
    return this.botMgr.getUsedKeySlots(this.playerMgr.players);
  }

  getLocalPlayerCount(): number {
    return this.botMgr.getLocalPlayerCount(this.playerMgr.players);
  }

  getLocalPlayersInfo(): Array<{
    name: string;
    color: string;
    keyPreset: string;
  }> {
    return this.botMgr.getLocalPlayersInfo(this.playerMgr.players);
  }

  hasLocalPlayers(): boolean {
    return this.botMgr.hasLocalPlayers(this.playerMgr.players);
  }

  setKeyboardInputEnabled(enabled: boolean): void {
    this.input.setKeyboardEnabled(enabled);
    this.multiInput?.setKeyboardEnabled(enabled);
  }

  setAllowAltKeyBindings(allow: boolean): void {
    this.input.setAllowAltKeys(allow);
    this.multiInput?.setAllowAltKeys(allow);
  }

  setDevKeysEnabled(enabled: boolean): void {
    this.input.setDevKeysEnabled(enabled);
  }

  // Toggle dev mode visualization
  toggleDevMode(): boolean {
    const newState = this.input.toggleDevMode();
    this.renderer.setDevMode(newState);

    // Sync dev mode state across multiplayer
    if (this.network.isHost()) {
      this.network.broadcastDevMode(newState);
    }

    return newState;
  }

  // Get current dev mode state
  isDevModeEnabled(): boolean {
    return this.input.isDevModeEnabled();
  }

  // Called by network when receiving dev mode state from host
  setDevModeFromNetwork(enabled: boolean): void {
    this.renderer.setDevMode(enabled);
    console.log("[Game] Dev mode synced from network:", enabled ? "ON" : "OFF");
  }

  // ============= TOUCH LAYOUT DELEGATION =============

  updateTouchLayout(): void {
    this.botMgr.updateTouchLayout(this.getPlayers());
  }

  clearTouchLayout(): void {
    this.botMgr.clearTouchLayout();
  }
}
