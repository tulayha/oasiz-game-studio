import { Physics } from "./systems/Physics";
import { Renderer } from "./systems/Renderer";
import { InputManager } from "./systems/Input";
import { MultiInputManager } from "./systems/MultiInputManager";
import { NetworkManager } from "./network/NetworkManager";
import { Ship } from "./entities/Ship";
import { AstroBot } from "./entities/AstroBot";
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
import type {
  RenderNetworkState,
  NetworkPredictionDebugTelemetry,
} from "./network/NetworkSyncSystem";
import { PlayerInputResolver } from "./systems/PlayerInputResolver";
import { DeterministicRNGManager } from "./systems/DeterministicRNGManager";
import { TickSystem } from "./systems/TickSystem";
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
  private rngManager: DeterministicRNGManager;
  private rngSeed: number | null = null;
  private pendingRngSeed: number | null = null;
  private tickSystem: TickSystem;
  private simTimeMs: number = 0;

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
  private finalScoreSubmittedForMatch = false;
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
    this.rngManager = new DeterministicRNGManager();
    AstroBot.setRng(this.rngManager.getAIRng());
    this.renderer.setVisualRng(this.rngManager.getVisualRng());
    this.tickSystem = new TickSystem();

    // Create managers
    this.playerMgr = new PlayerManager(this.network);
    this.flowMgr = new GameFlowManager(
      this.network,
      this.physics,
      this.renderer,
      this.input,
      this.multiInput,
      () => this.rngManager.getAIRng(),
    );
    this.botMgr = new BotManager(this.network, this.multiInput);
    this.asteroidMgr = new AsteroidManager(
      this.physics,
      this.network,
      this.flowMgr,
      this.powerUps,
      this.rngManager,
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
      this.rngManager.getIdRng(),
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
      if (this.network.isSimulationAuthority()) {
        this.seedRngForRound();
      }
      this.tickSystem.reset(0);
      this.simTimeMs = 0;
      this.flowMgr.beginMatch(this.playerMgr.players, this.ships, this.simTimeMs);
      this.asteroidMgr.spawnInitialAsteroids();
      this.asteroidMgr.scheduleAsteroidSpawnsIfNeeded(this.simTimeMs);
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
      if (this.isLeader()) {
        this.network.broadcastDevMode(enabled);
      }
    });
  }

  // ============= ASTEROID & POWERUP LOGIC =============

  private grantStartingPowerups(): void {
    if (!this.network.isSimulationAuthority()) return;
    if (!this.advancedSettings.startPowerups) return;

    const options: PowerUpType[] = ["LASER", "SHIELD", "SCATTER", "MINE"];
    const rng = this.rngManager.getPowerUpRng();

    this.playerMgr.players.forEach((player) => {
      const ship = this.ships.get(player.id);
      if (!ship || !ship.alive) return;
      if (this.playerPowerUps.get(player.id)) return;
      const type = options[Math.floor(rng.next() * options.length)];
      this.grantPowerUp(player.id, type);
    });
  }

  private grantPowerUp(playerId: string, type: PowerUpType): void {
    const nowMs = this.simTimeMs;
    if (type === "LASER") {
      this.playerPowerUps.set(playerId, {
        type: "LASER",
        charges: GAME_CONFIG.POWERUP_LASER_CHARGES,
        maxCharges: GAME_CONFIG.POWERUP_LASER_CHARGES,
        lastFireTime: nowMs - GAME_CONFIG.POWERUP_LASER_COOLDOWN - 1,
        shieldHits: 0,
      });
    } else if (type === "SHIELD") {
      this.playerPowerUps.set(playerId, {
        type: "SHIELD",
        charges: 0,
        maxCharges: 0,
        lastFireTime: nowMs,
        shieldHits: 0,
      });
    } else if (type === "SCATTER") {
      this.playerPowerUps.set(playerId, {
        type: "SCATTER",
        charges: GAME_CONFIG.POWERUP_SCATTER_CHARGES,
        maxCharges: GAME_CONFIG.POWERUP_SCATTER_CHARGES,
        lastFireTime: nowMs - GAME_CONFIG.POWERUP_SCATTER_COOLDOWN - 1,
        shieldHits: 0,
      });
    } else if (type === "MINE") {
      this.playerPowerUps.set(playerId, {
        type: "MINE",
        charges: 1,
        maxCharges: 1,
        lastFireTime: nowMs,
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
        lastFireTime: nowMs,
        shieldHits: 0,
        leftSwordActive: true,
        rightSwordActive: true,
      });
    } else if (type === "HOMING_MISSILE") {
      this.playerPowerUps.set(playerId, {
        type: "HOMING_MISSILE",
        charges: 1,
        maxCharges: 1,
        lastFireTime: nowMs,
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

  private spawnRandomPowerUp(nowMs: number): void {
    if (!this.network.isSimulationAuthority()) return;

    const weights = GAME_CONFIG.POWERUP_SPAWN_WEIGHTS;
    const entries = Object.entries(weights) as [PowerUpType, number][];
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    const rng = this.rngManager.getPowerUpRng();
    const rand = rng.next() * totalWeight;

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
    const x =
      padding + rng.next() * (GAME_CONFIG.ARENA_WIDTH - padding * 2);
    const y =
      padding + rng.next() * (GAME_CONFIG.ARENA_HEIGHT - padding * 2);

    const powerUp = new PowerUp(this.physics, x, y, type, nowMs);
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
    this.flowMgr.onPhaseChange = (phase) => {
      if (phase === "PLAYING" && !this.network.isSimulationAuthority()) {
        this.tickSystem.reset(0);
        this.simTimeMs = 0;
      }
      callbacks.onPhaseChange(phase);
    };
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
        if (this.isLeader()) {
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

        if (this.network.isSimulationAuthority()) {
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
        if (!this.network.isSimulationAuthority()) {
          if (this.flowMgr.phase !== "PLAYING") {
            return; // Only process snapshots during PLAYING
          }
          this.networkSync.applyNetworkState(state);
        }
      },

      onInputReceived: (playerId, input) => {
        if (this.network.isSimulationAuthority()) {
          this.inputResolver.setPendingInput(playerId, input);
        }
      },

      onRNGSeedReceived: (baseSeed) => {
        this.applyRngSeed(baseSeed);
      },

      onHostChanged: () => {
        console.log("[Game] Room leader changed");
        this._onSystemMessage?.("Room leader updated", 2500);
        this.emitPlayersUpdate();
      },

      onDisconnected: () => {
        console.log("[Game] Disconnected from room");
        this.handleDisconnected();
      },

      onGamePhaseReceived: (phase, winnerId, winnerName) => {
        console.log("[Game] RPC phase received:", phase);
        if (!this.network.isSimulationAuthority()) {
          const shouldForceRosterSync =
            phase === "COUNTDOWN" || phase === "PLAYING";
          this.network.resyncPlayerListFromState(
            "rpc-phase-" + phase.toLowerCase(),
            shouldForceRosterSync,
          );
          const oldPhase = this.flowMgr.phase;
          this.flowMgr.phase = phase;

          if (phase === "GAME_END") {
            if (winnerId && winnerName) {
              this.flowMgr.winnerId = winnerId;
              this.flowMgr.winnerName = winnerName;
              this.emitPlayersUpdate();
            }
            this.submitFinalScoreFromAuthoritativeState();
          }

          if (phase === "LOBBY" && oldPhase === "GAME_END") {
            this.clearAllGameState();
          }

          // Clear old round state when new round starts
          if (phase === "COUNTDOWN" && (oldPhase === "ROUND_END" || oldPhase === "LOBBY")) {
            console.log("[Game] Non-host: new round starting, clearing old state");
            this.finalScoreSubmittedForMatch = false;
            this.resetForNextRound();
            this.networkSync.clearNetworkEntities();
            this.roundResult = null;
          }

          this.flowMgr.onPhaseChange?.(phase);
        }
      },

      onCountdownReceived: (count) => {
        if (!this.network.isSimulationAuthority()) {
          this.flowMgr.countdown = count;
          this.flowMgr.onCountdownUpdate?.(count);
        }
      },

      onGameSoundReceived: (type, _playerId) => {
        this.fireSystem.playGameSoundLocal(type);
      },

      onDashRequested: (playerId) => {
        if (this.network.isSimulationAuthority()) {
          this.inputResolver.queueDash(playerId);
        }
      },

      onPingReceived: (latencyMs) => {
        this.latencyMs = latencyMs;
      },

      onPlayerListReceived: (playerOrder, _meta) => {
        if (!this.network.isSimulationAuthority()) {
          this.playerMgr.rebuildPlayersFromOrder(playerOrder, () =>
            this.emitPlayersUpdate(),
          );
          if (this.flowMgr.phase === "GAME_END") {
            this.submitFinalScoreFromAuthoritativeState();
          }
        }
      },

      onRoundResultReceived: (payload) => {
        if (!this.network.isSimulationAuthority()) {
          this.applyRoundResult(payload);
          if (this.flowMgr.phase === "GAME_END") {
            this.submitFinalScoreFromAuthoritativeState();
          }
        }
      },

      onDevModeReceived: (enabled) => {
        this.setDevModeFromNetwork(enabled);
      },

      onAdvancedSettingsReceived: (payload) => {
        this.applyModeStateFromNetwork(payload);
      },

      onScreenShakeReceived: (intensity, duration) => {
        if (this.network.isSimulationAuthority()) return;
        this.triggerScreenShake(intensity, duration);
      },

      onDashParticlesReceived: (payload) => {
        if (this.network.isSimulationAuthority()) return;
        this.renderer.spawnDashParticles(
          payload.x,
          payload.y,
          payload.angle,
          payload.color,
        );
      },

      onTransportError: (code, message) => {
        if (code === "LOCAL_PLAYER_UNSUPPORTED") {
          this._onSystemMessage?.("Local players are deferred in this version", 3500);
          return;
        }
        if (code === "LEADER_ONLY") {
          this._onSystemMessage?.("Only the room leader can do that", 2500);
          return;
        }
        this._onSystemMessage?.(message || "Network error", 3500);
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
    this.finalScoreSubmittedForMatch = false;
    if (!this.network.isSimulationAuthority()) {
      this.network.resyncPlayerListFromState("session-init", true);
    }

    this.input.setDashCallback(() => {
      this.handleLocalDash();
    });

    this.flowMgr.setPhase("LOBBY");
  }

  private handleLocalDash(): void {
    if (this.network.isSimulationAuthority()) {
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
    if (this.network.isSimulationAuthority()) {
      this.network.broadcastScreenShake(intensity, duration);
    }
  }

  private handleDisconnected(): void {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }
    this.clearAllGameState();
    this.playerMgr.clear();
    this._originalHostLeft = false;
    this.finalScoreSubmittedForMatch = false;
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

  private seedRngForRound(): void {
    if (!this.network.isSimulationAuthority()) return;
    const seed = this.pendingRngSeed ?? this.generateSeed();
    this.pendingRngSeed = null;
    this.network.broadcastRNGSeed(seed);
    this.applyRngSeed(seed);
  }

  private applyRngSeed(baseSeed: number): void {
    this.rngSeed = baseSeed;
    this.rngManager.initializeFromSeed(baseSeed);
    console.log(
      "[Game.applyRngSeed]",
      "Seeded RNG with " + baseSeed.toString(),
    );
  }

  private generateSeed(): number {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] >>> 0;
    }
    return Date.now() >>> 0;
  }

  getRngSeed(): number | null {
    return this.rngSeed;
  }

  setNextRngSeed(seed: number | null): void {
    if (!this.network.isSimulationAuthority()) {
      console.log("[Game.setNextRngSeed] Only simulation authority can set seed");
      return;
    }

    if (seed === null || !Number.isFinite(seed)) {
      this.pendingRngSeed = null;
      console.log("[Game.setNextRngSeed] Cleared pending seed");
      return;
    }

    const normalized = Math.floor(seed) >>> 0;
    this.pendingRngSeed = normalized;
    console.log("[Game.setNextRngSeed] Next seed set to " + normalized);
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
    const frameDt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    // Capture local input every frame (local-only timing)
    const now = performance.now();
    this.inputResolver.captureLocalInput(
      now,
      this.botMgr.useTouchForHost,
    );
    this.inputResolver.sendLocalInputIfNeeded(now);
    if (this.network.isSimulationAuthority()) {
      this.network.pollHostInputs();
    }

    const runTicks =
      this.flowMgr.phase === "PLAYING" ||
      (this.network.isSimulationAuthority() &&
        (this.flowMgr.phase === "COUNTDOWN" ||
          this.flowMgr.phase === "ROUND_END"));
    let frameRenderState: RenderNetworkState | null = null;
    if (!this.network.isSimulationAuthority() && this.flowMgr.phase === "PLAYING") {
      frameRenderState = this.networkSync.getRenderState(
        this.network.getMyPlayerId(),
        this.latencyMs,
      );
    }

    if (runTicks) {
      this.tickSystem.update((tick) => this.simulateTick(tick));
      if (this.flowMgr.phase === "PLAYING") {
        this.updateVisualEffects(frameRenderState);
      }
    }

    this.renderer.updateParticles(frameDt);
    this.renderer.updateScreenShake(frameDt);
    this.render(frameDt, frameRenderState);

    requestAnimationFrame((t) => this.loop(t));
  }

  private simulateTick(tick: number): void {
    const dtMs = this.tickSystem.getTickDurationMs();
    if (this.network.isSimulationAuthority()) {
      const phaseBefore = this.flowMgr.phase;
      this.flowMgr.updateTimers(dtMs);
      if (phaseBefore !== "PLAYING") {
        return;
      }
    }

    if (this.flowMgr.phase !== "PLAYING") return;

    const dt = dtMs / 1000;
    this.simTimeMs = tick * dtMs;
    const nowMs = this.simTimeMs;
    const syncNow = performance.now();
    this.collisionMgr.setSimTimeMs(nowMs);

    // Check dev keys for testing powerups (only for local player on host)
    const devKeys = this.input.consumeDevKeys();
    const myPlayerId = this.network.getMyPlayerId();
    if (myPlayerId) {
      const myShip = this.ships.get(myPlayerId);
      const existingPowerUp = this.playerPowerUps.get(myPlayerId);
      const grantDevPowerUp = (
        flag: boolean,
        type: PowerUpType,
        label: string,
      ): void => {
        if (!flag) return;
        console.log("[Dev] Granting " + label + " powerup");
        if (this.network.isSimulationAuthority()) {
          this.grantPowerUp(myPlayerId, type);
        } else {
          this.network.requestDevPowerUp(type);
        }
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
        if (this.network.isSimulationAuthority()) {
          this.grantPowerUp(myPlayerId, "REVERSE");
        } else {
          this.network.requestDevPowerUp("REVERSE");
        }
      }

      if (devKeys.spawnPowerUp) {
        console.log("[Dev] Spawning random power-up");
        if (this.network.isSimulationAuthority()) {
          this.spawnRandomPowerUp(nowMs);
        } else {
          this.network.requestDevPowerUp("SPAWN_RANDOM");
        }
      }
    }

    // Simulation authority: process all inputs and update physics
    if (this.network.isSimulationAuthority()) {
      this.asteroidMgr.updateSpawning(nowMs);
      this.ships.forEach((ship, playerId) => {
        const { input, shouldDash } = this.inputResolver.resolveHostInput(
          playerId,
          this.ships,
          this.pilots,
          this.projectiles,
          nowMs,
        );

        // Check if player has joust for speed boost
        const playerPowerUp = this.playerPowerUps.get(playerId);
        const hasJoust = playerPowerUp?.type === "JOUST";
        const speedMultiplier = hasJoust ? 1.4 : 1;

        const fireResult = ship.applyInput(
          input,
          shouldDash,
          dt,
          nowMs,
          this.rotationDirection,
          speedMultiplier,
        );
        this.fireSystem.processFire(
          playerId,
          ship,
          fireResult,
          shouldDash,
          nowMs,
        );
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
        pilot.update(dt, nowMs, threats, input, this.rotationDirection);

        if (pilot.hasSurvived(nowMs)) {
          const pilotPosition = {
            x: pilot.body.position.x,
            y: pilot.body.position.y,
          };
          const pilotAngle = pilot.body.angle;
          pilot.destroy();
          this.pilots.delete(playerId);
          this.flowMgr.respawnPlayer(
            playerId,
            pilotPosition,
            this.ships,
            this.playerMgr.players,
            pilotAngle,
            nowMs,
          );
        }
      });

      this.physics.updateFixed(this.tickSystem.getTickDurationMs());

      // Clean up expired projectiles
      this.cleanupExpired(
        this.projectiles,
        (projectile) => projectile.isExpired(nowMs),
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
        powerUp.update(shipPositionsForPowerUps, dt, nowMs);
      });

      // Clean up expired power-ups
      this.cleanupExpired(
        this.powerUps,
        (powerUp) => powerUp.isExpired(nowMs),
        (powerUp) => powerUp.destroy(),
      );

      // Clean up expired laser beams
      this.cleanupExpired(
        this.laserBeams,
        (beam) => beam.isExpired(nowMs),
        (beam) => beam.destroy(),
      );

      // Check mine collisions and clean up expired mines
      this.collisionMgr.checkMineCollisions();
      this.cleanupExpired(
        this.mines,
        (mine) => mine.isExpired(nowMs),
        (mine) => mine.destroy(),
      );

      // Update homing missiles and check collisions
      this.collisionMgr.updateHomingMissiles(dt);
      this.collisionMgr.checkHomingMissileCollisions();
      this.cleanupExpired(
        this.homingMissiles,
        (missile) => missile.isExpired(nowMs) || !missile.alive,
        (missile) => missile.destroy(),
      );

      // Check Joust collisions (sword-to-ship and sword-to-projectile)
      this.collisionMgr.checkJoustCollisions();

      // Update turret and bullets
      this.turretMgr.update(dt, nowMs);
      this.collisionMgr.update(nowMs);

      // Broadcast state (throttled to sync rate)
      if (syncNow - this.lastBroadcastTime >= GAME_CONFIG.SYNC_INTERVAL) {
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
          hostTick: tick,
          tickDurationMs: this.tickSystem.getTickDurationMs(),
        }, nowMs);
        this.lastBroadcastTime = syncNow;
      }
    }
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

  private updateVisualEffects(renderState: RenderNetworkState | null = null): void {
    // Spawn nitro particles for joust power-up (runs for all clients)
    // For simulation authority: use local physics bodies
    if (this.network.isSimulationAuthority()) {
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
      // For non-authority clients: use smoothed ship positions.
      const networkRenderState =
        renderState ??
        this.networkSync.getRenderState(this.network.getMyPlayerId(), this.latencyMs);
      const smoothedShips = networkRenderState.useBufferedInterpolation
        ? networkRenderState.networkShips
        : networkRenderState.shipSmoother.smooth(
            networkRenderState.networkShips,
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

  private render(dt: number, renderState: RenderNetworkState | null = null): void {
    const frameRenderState =
      renderState ??
      this.networkSync.getRenderState(this.network.getMyPlayerId(), this.latencyMs);
    this.gameRenderer.render({
      dt,
      nowMs: this.network.isSimulationAuthority()
        ? this.simTimeMs
        : this.networkSync.hostSimTimeMs,
      phase: this.flowMgr.phase,
      countdown: this.flowMgr.countdown,
      isHost: this.network.isSimulationAuthority(),
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
      networkShips: frameRenderState.networkShips,
      networkPilots: frameRenderState.networkPilots,
      networkProjectiles: frameRenderState.networkProjectiles,
      networkAsteroids: frameRenderState.networkAsteroids,
      networkPowerUps: frameRenderState.networkPowerUps,
      networkLaserBeams: frameRenderState.networkLaserBeams,
      networkMines: frameRenderState.networkMines,
      networkHomingMissiles: frameRenderState.networkHomingMissiles,
      networkTurret: frameRenderState.networkTurret,
      networkTurretBullets: frameRenderState.networkTurretBullets,
      shipSmoother: frameRenderState.shipSmoother,
      projectileSmoother: frameRenderState.projectileSmoother,
      asteroidSmoother: frameRenderState.asteroidSmoother,
      pilotSmoother: frameRenderState.pilotSmoother,
      missileSmoother: frameRenderState.missileSmoother,
      useBufferedInterpolation: frameRenderState.useBufferedInterpolation,
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

  isLeader(): boolean {
    return this.network.isHost();
  }

  isHost(): boolean {
    return this.isLeader();
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
    return this.isLeader() && this.network.getPlayerCount() >= 2;
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

  getPredictionDebugTelemetry(): NetworkPredictionDebugTelemetry {
    return this.networkSync.getPredictionDebugTelemetry();
  }

  getHostId(): string | null {
    return this.network.getHostId();
  }

  getLeaderId(): string | null {
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
    if (!this.isLeader()) return;
    const payload: AdvancedSettingsSync = {
      mode: this.currentMode,
      baseMode: this.baseMode,
      settings: this.advancedSettings,
    };
    this.network.setAdvancedSettings(payload);
  }

  getAdvancedSettings(): AdvancedSettings {
    return { ...this.advancedSettings };
  }

  setAdvancedSettings(
    settings: AdvancedSettings,
    source: "local" | "remote" = "local",
  ): void {
    if (source === "local" && !this.isLeader()) return;
    const sanitized = sanitizeAdvancedSettings(settings);
    this.advancedSettings = sanitized;
    const baseTemplate = applyModeTemplate(this.baseMode);
    const isCustom = isCustomComparedToTemplate(sanitized, baseTemplate);
    const nextMode: GameMode = isCustom ? "CUSTOM" : this.baseMode;
    const modeChanged = nextMode !== this.currentMode;
    this.currentMode = nextMode;
    this.applyAdvancedOverrides(sanitized, this.baseMode);
    if (source === "local" && this.isLeader()) {
      this.broadcastModeState();
    }
    if (modeChanged) {
      this._onGameModeChange?.(this.currentMode);
    }
    this._onAdvancedSettingsChange?.(sanitized);
  }

  setGameMode(mode: GameMode, source: "local" | "remote" = "local"): void {
    if (source === "local" && !this.isLeader()) return;
    if (mode === "CUSTOM") {
      this.currentMode = "CUSTOM";
      this._onGameModeChange?.(this.currentMode);
      if (source === "local" && this.isLeader()) {
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
    if (source === "local" && this.isLeader()) {
      this.network.setMode(mode);
      this.broadcastModeState();
    }
  }

  getGameMode(): GameMode {
    return this.currentMode;
  }

  startGame(): void {
    if (!this.isLeader()) {
      console.log("[Game] Non-leader cannot start game");
      return;
    }
    // Push mode/settings before requesting match start on the server.
    this.broadcastModeState();
    this.roundResult = null;
    this.finalScoreSubmittedForMatch = false;
    this.network.startGame();
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
    this.finalScoreSubmittedForMatch = false;
    this.resetAdvancedSettings();

    this.flowMgr.setPhase("START");
  }

  async restartGame(): Promise<void> {
    if (!this.isLeader()) {
      console.log("[Game] Non-leader cannot restart game, waiting for leader");
      return;
    }
    this.finalScoreSubmittedForMatch = false;
    this.network.restartGame();
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
    if (!this.supportsLocalPlayers()) {
      this._onSystemMessage?.("Local players are deferred in this version", 3500);
      return false;
    }
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
    if (!this.isLeader()) {
      console.log("[Game] Only leader can kick players");
      return false;
    }

    const myId = this.network.getMyPlayerId();
    if (myId && playerId === myId) {
      console.log("[Game] Leader cannot kick themselves");
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
    if (!this.supportsLocalPlayers()) {
      return 1;
    }
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
    if (!this.supportsLocalPlayers()) return false;
    return this.botMgr.hasLocalPlayers(this.playerMgr.players);
  }

  supportsLocalPlayers(): boolean {
    return this.network.supportsLocalPlayers();
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
    if (this.isLeader()) {
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

  private submitFinalScoreFromAuthoritativeState(): void {
    if (this.network.isSimulationAuthority()) return;
    if (this.finalScoreSubmittedForMatch) return;

    const myId = this.network.getMyPlayerId();
    if (!myId) return;

    const resultScore = this.roundResult?.roundWinsById?.[myId];
    const fallbackScore = this.playerMgr.players.get(myId)?.roundWins;
    const rawScore =
      Number.isFinite(resultScore) ? resultScore : fallbackScore;

    if (!Number.isFinite(rawScore)) return;
    const score = Math.max(0, Math.floor(rawScore as number));

    if (
      typeof (window as unknown as { submitScore?: (value: number) => void })
        .submitScore === "function"
    ) {
      (
        window as unknown as { submitScore: (value: number) => void }
      ).submitScore(score);
      console.log("[Game] Submitted authoritative final score:", score);
      this.finalScoreSubmittedForMatch = true;
    }
  }

  // ============= TOUCH LAYOUT DELEGATION =============

  updateTouchLayout(): void {
    this.botMgr.updateTouchLayout(this.getPlayers());
  }

  clearTouchLayout(): void {
    this.botMgr.clearTouchLayout();
  }
}
