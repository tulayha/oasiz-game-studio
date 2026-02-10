import { Physics } from "./systems/Physics";
import { Renderer } from "./systems/Renderer";
import { InputManager } from "./systems/Input";
import { MultiInputManager } from "./systems/MultiInputManager";
import { setupCollisions } from "./systems/Collision";
import { NetworkManager } from "./network/NetworkManager";
import { Ship } from "./entities/Ship";
import { Pilot } from "./entities/Pilot";
import { Projectile } from "./entities/Projectile";
import { Asteroid } from "./entities/Asteroid";
import { PowerUp } from "./entities/PowerUp";
import { LaserBeam } from "./entities/LaserBeam";
import { Mine } from "./entities/Mine";
import { HomingMissile } from "./entities/HomingMissile";
import { AudioManager } from "./AudioManager";
import { SettingsManager } from "./SettingsManager";
import { PlayerManager } from "./managers/PlayerManager";
import { GameFlowManager } from "./managers/GameFlowManager";
import { BotManager } from "./managers/BotManager";
import {
  GamePhase,
  GameMode,
  BaseGameMode,
  GameStateSync,
  PlayerInput,
  PlayerData,
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
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

  // Entity state (shared with managers via reference)
  private ships: Map<string, Ship> = new Map();
  private pilots: Map<string, Pilot> = new Map();
  private projectiles: Projectile[] = [];
  private asteroids: Asteroid[] = [];
  private powerUps: PowerUp[] = [];
  private laserBeams: LaserBeam[] = [];
  private mines: Mine[] = [];
  private homingMissiles: HomingMissile[] = [];
  private playerPowerUps: Map<string, PlayerPowerUp | null> = new Map();

  // Input state
  private pendingInputs: Map<string, PlayerInput> = new Map();
  private pendingDashes: Set<string> = new Set();

  // Network state caches (for client rendering)
  private networkShips: ShipState[] = [];
  private networkPilots: PilotState[] = [];
  private networkProjectiles: ProjectileState[] = [];
  private networkAsteroids: AsteroidState[] = [];
  private networkPowerUps: PowerUpState[] = [];
  private networkLaserBeams: LaserBeamState[] = [];
  private networkMines: MineState[] = [];
  private networkHomingMissiles: HomingMissileState[] = [];
  private networkRotationDirection: number = 1;

  // Track which mines have exploded on client (for effects)
  private clientExplodedMines: Set<string> = new Set();

  // Track ship positions for debris effects on client
  private clientShipPositions: Map<
    string,
    { x: number; y: number; color: string }
  > = new Map();

  // Global rotation direction (1 = normal/cw, -1 = reversed/ccw)
  private rotationDirection: number = 1;

  // Timing
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private asteroidSpawnTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastTime: number = 0;
  private latencyMs: number = 0;
  private lastBroadcastTime: number = 0;
  private lastInputSendTime: number = 0;

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

    // Wire flow manager callbacks
    this.flowMgr.onPlayersUpdate = () => this.emitPlayersUpdate();
    this.flowMgr.onBeginMatch = () => {
      this.flowMgr.beginMatch(this.playerMgr.players, this.ships);
      this.spawnInitialAsteroids();
      this.scheduleAsteroidSpawnsIfNeeded();
      this.grantStartingPowerups();
    };
    this.flowMgr.onRoundResult = (payload) => {
      this.applyRoundResult(payload);
    };
    this.flowMgr.onResetRound = () => {
      this.resetForNextRound();
    };

    // Setup collision callbacks
    setupCollisions(this.physics, {
      onProjectileHitShip: (
        projectileOwnerId,
        shipPlayerId,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;
        const ship = this.ships.get(shipPlayerId);
        if (ship && ship.alive && !ship.isInvulnerable()) {
          // Check if ship has shield
          const powerUp = this.playerPowerUps.get(shipPlayerId);
          if (powerUp?.type === "SHIELD") {
            powerUp.shieldHits++;
            this.flowMgr.removeProjectileByBody(
              projectileBody,
              this.projectiles,
            );
            this.renderer.addScreenShake(3, 0.1);
            if (powerUp.shieldHits >= GAME_CONFIG.POWERUP_SHIELD_HITS) {
              this.renderer.spawnShieldBreakDebris(
                ship.body.position.x,
                ship.body.position.y,
              );
              this.playerPowerUps.delete(shipPlayerId);
              SettingsManager.triggerHaptic("medium");
            }
            return;
          }

          this.flowMgr.destroyShip(
            shipPlayerId,
            this.ships,
            this.pilots,
            this.playerMgr.players,
          );
          this.playerPowerUps.delete(shipPlayerId);
          this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
        }
      },
      onProjectileHitPilot: (
        projectileOwnerId,
        pilotPlayerId,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;
        this.flowMgr.killPilot(
          pilotPlayerId,
          projectileOwnerId,
          this.pilots,
          this.playerMgr.players,
        );
        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
      onShipHitPilot: (shipPlayerId, pilotPlayerId) => {
        if (!this.network.isHost()) return;
        this.flowMgr.killPilot(
          pilotPlayerId,
          shipPlayerId,
          this.pilots,
          this.playerMgr.players,
        );
      },
      onProjectileHitWall: (projectileBody) => {
        if (!this.network.isHost()) return;
        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
      onProjectileHitAsteroid: (
        projectileOwnerId,
        asteroidBody,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;

        const asteroidIndex = this.asteroids.findIndex(
          (a) => a.body === asteroidBody,
        );
        if (asteroidIndex !== -1 && this.asteroids[asteroidIndex].alive) {
          const asteroid = this.asteroids[asteroidIndex];
          const pos = asteroid.body.position;

          this.renderer.spawnExplosion(
            pos.x,
            pos.y,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.renderer.spawnAsteroidDebris(
            pos.x,
            pos.y,
            asteroid.size,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.renderer.addScreenShake(8, 0.2);

          asteroid.destroy();
          this.asteroids.splice(asteroidIndex, 1);

          if (asteroid.isLarge()) {
            this.splitAsteroid(asteroid, pos.x, pos.y);
          } else {
            this.trySpawnPowerUp(pos.x, pos.y);
          }
        }

        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
      onShipHitAsteroid: (shipPlayerId, asteroidBody) => {
        if (!this.network.isHost()) return;
        if (!GAME_CONFIG.ASTEROID_DAMAGE_SHIPS) return;

        const ship = this.ships.get(shipPlayerId);
        if (ship && ship.alive && !ship.isInvulnerable()) {
          // Check if ship has shield
          const powerUp = this.playerPowerUps.get(shipPlayerId);
          if (powerUp?.type === "SHIELD") {
            powerUp.shieldHits++;

            const asteroidIndex = this.asteroids.findIndex(
              (a) => a.body === asteroidBody,
            );
            if (asteroidIndex !== -1 && this.asteroids[asteroidIndex].alive) {
              const asteroid = this.asteroids[asteroidIndex];
              const pos = asteroid.body.position;
              this.renderer.spawnExplosion(
                pos.x,
                pos.y,
                GAME_CONFIG.ASTEROID_COLOR,
              );
              this.renderer.spawnAsteroidDebris(
                pos.x,
                pos.y,
                asteroid.size,
                GAME_CONFIG.ASTEROID_COLOR,
              );
              this.renderer.addScreenShake(10, 0.3);
              asteroid.destroy();
              this.asteroids.splice(asteroidIndex, 1);
              this.trySpawnPowerUp(pos.x, pos.y);
            }

            this.renderer.addScreenShake(3, 0.1);
            if (powerUp.shieldHits >= GAME_CONFIG.POWERUP_SHIELD_HITS) {
              this.renderer.spawnShieldBreakDebris(
                ship.body.position.x,
                ship.body.position.y,
              );
              this.playerPowerUps.delete(shipPlayerId);
              SettingsManager.triggerHaptic("medium");
            }
            return;
          }

          // Destroy asteroid
          const asteroidIndex = this.asteroids.findIndex(
            (a) => a.body === asteroidBody,
          );
          if (asteroidIndex !== -1 && this.asteroids[asteroidIndex].alive) {
            const asteroid = this.asteroids[asteroidIndex];
            const pos = asteroid.body.position;
            this.renderer.spawnExplosion(
              pos.x,
              pos.y,
              GAME_CONFIG.ASTEROID_COLOR,
            );
            this.renderer.spawnAsteroidDebris(
              pos.x,
              pos.y,
              asteroid.size,
              GAME_CONFIG.ASTEROID_COLOR,
            );
            this.renderer.addScreenShake(10, 0.3);
            asteroid.destroy();
            this.asteroids.splice(asteroidIndex, 1);
            this.trySpawnPowerUp(pos.x, pos.y);
          }

          this.flowMgr.destroyShip(
            shipPlayerId,
            this.ships,
            this.pilots,
            this.playerMgr.players,
          );
          this.playerPowerUps.delete(shipPlayerId);
        }
      },
      onPilotHitAsteroid: (pilotPlayerId, asteroidBody) => {
        if (!this.network.isHost()) return;
        if (!GAME_CONFIG.ASTEROID_DAMAGE_SHIPS) return;

        const pilot = this.pilots.get(pilotPlayerId);
        if (pilot && pilot.alive) {
          const asteroidIndex = this.asteroids.findIndex(
            (a) => a.body === asteroidBody,
          );
          if (asteroidIndex !== -1 && this.asteroids[asteroidIndex].alive) {
            const asteroid = this.asteroids[asteroidIndex];
            const pos = asteroid.body.position;
            this.renderer.spawnExplosion(
              pos.x,
              pos.y,
              GAME_CONFIG.ASTEROID_COLOR,
            );
            this.renderer.spawnAsteroidDebris(
              pos.x,
              pos.y,
              asteroid.size,
              GAME_CONFIG.ASTEROID_COLOR,
            );
            this.renderer.addScreenShake(6, 0.2);
            asteroid.destroy();
            this.asteroids.splice(asteroidIndex, 1);
            this.trySpawnPowerUp(pos.x, pos.y);
          }

          this.flowMgr.killPilot(
            pilotPlayerId,
            "asteroid",
            this.pilots,
            this.playerMgr.players,
          );
        }
      },
      onShipHitPowerUp: (shipPlayerId, powerUpBody) => {
        if (!this.network.isHost()) return;

        const existingPowerUp = this.playerPowerUps.get(shipPlayerId);
        if (existingPowerUp) return;

        const powerUpIndex = this.powerUps.findIndex(
          (p) => p.body === powerUpBody,
        );
        if (powerUpIndex !== -1 && this.powerUps[powerUpIndex].alive) {
          const powerUp = this.powerUps[powerUpIndex];
          this.grantPowerUp(shipPlayerId, powerUp.type);
          powerUp.destroy();
          this.powerUps.splice(powerUpIndex, 1);
          SettingsManager.triggerHaptic("medium");
        }
      },
    });

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

  private spawnInitialAsteroids(): void {
    if (!this.network.isHost()) return;
    if (this.advancedSettings.asteroidDensity === "NONE") return;

    const cfg = GameConfig.config;
    const count = this.randomInt(
      cfg.ASTEROID_INITIAL_MIN,
      cfg.ASTEROID_INITIAL_MAX,
    );
    const centerX = cfg.ARENA_WIDTH / 2;
    const centerY = cfg.ARENA_HEIGHT / 2;
    const spreadX = cfg.ARENA_WIDTH * 0.28;
    const spreadY = cfg.ARENA_HEIGHT * 0.28;
    const maxAttempts = 20;

    for (let i = 0; i < count; i++) {
      const tier = i === 0 ? "LARGE" : this.rollAsteroidTier();
      const size = this.randomAsteroidSize(tier);
      let spawnX = centerX;
      let spawnY = centerY;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidateX = centerX + (Math.random() * 2 - 1) * spreadX;
        const candidateY = centerY + (Math.random() * 2 - 1) * spreadY;
        if (this.isAsteroidSpawnClear(candidateX, candidateY, size)) {
          spawnX = candidateX;
          spawnY = candidateY;
          break;
        }
      }

      const velocity = this.randomAsteroidVelocity();
      velocity.x *= 0.75;
      velocity.y *= 0.75;
      const angularVelocity = this.randomAsteroidAngularVelocity();
      const asteroid = new Asteroid(
        this.physics,
        spawnX,
        spawnY,
        velocity,
        angularVelocity,
        tier,
        size,
      );
      this.asteroids.push(asteroid);
    }
  }

  private scheduleAsteroidSpawnsIfNeeded(): void {
    if (!this.network.isHost()) return;
    if (this.advancedSettings.asteroidDensity !== "SPAWN") return;
    if (this.asteroidSpawnTimeout) {
      clearTimeout(this.asteroidSpawnTimeout);
      this.asteroidSpawnTimeout = null;
    }
    this.scheduleNextAsteroidSpawn();
  }

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

  private splitAsteroid(asteroid: Asteroid, x: number, y: number): void {
    const count = GAME_CONFIG.ASTEROID_SPLIT_COUNT;
    const baseVx = asteroid.body.velocity.x * 0.4;
    const baseVy = asteroid.body.velocity.y * 0.4;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const cfg = GameConfig.config;
      const speed = this.randomRange(
        cfg.ASTEROID_DRIFT_MIN_SPEED,
        cfg.ASTEROID_DRIFT_MAX_SPEED,
      );
      const offset = 10 + Math.random() * 6;
      const spawnX = x + Math.cos(angle) * offset;
      const spawnY = y + Math.sin(angle) * offset;
      const velocity = {
        x: baseVx + Math.cos(angle) * speed,
        y: baseVy + Math.sin(angle) * speed,
      };
      const angularVelocity = this.randomAsteroidAngularVelocity();
      const size = this.randomAsteroidSize("SMALL");
      const child = new Asteroid(
        this.physics,
        spawnX,
        spawnY,
        velocity,
        angularVelocity,
        "SMALL",
        size,
      );
      this.asteroids.push(child);
    }
  }

  private isAsteroidSpawnClear(x: number, y: number, size: number): boolean {
    const minDistance = size * 1.8;
    for (const asteroid of this.asteroids) {
      if (!asteroid.alive) continue;
      const dx = asteroid.body.position.x - x;
      const dy = asteroid.body.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance + asteroid.size) return false;
    }
    return true;
  }

  private rollAsteroidTier(): "LARGE" | "SMALL" {
    return Math.random() < 0.6 ? "LARGE" : "SMALL";
  }

  private randomAsteroidSize(tier: "LARGE" | "SMALL"): number {
    const cfg = GameConfig.config;
    const min =
      tier === "LARGE" ? cfg.ASTEROID_LARGE_MIN : cfg.ASTEROID_SMALL_MIN;
    const max =
      tier === "LARGE" ? cfg.ASTEROID_LARGE_MAX : cfg.ASTEROID_SMALL_MAX;
    return min + Math.random() * (max - min);
  }

  private randomAsteroidVelocity(): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const cfg = GameConfig.config;
    const speed = this.randomRange(
      cfg.ASTEROID_DRIFT_MIN_SPEED,
      cfg.ASTEROID_DRIFT_MAX_SPEED,
    );
    return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  }

  private randomAsteroidAngularVelocity(): number {
    const spread = 0.02;
    return (Math.random() - 0.5) * spread;
  }

  private randomInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private scheduleNextAsteroidSpawn(): void {
    if (this.flowMgr.phase !== "PLAYING") return;
    if (this.advancedSettings.asteroidDensity !== "SPAWN") return;

    const cfg = GameConfig.config;
    const intervalScale = this.getAsteroidSpawnIntervalScale();
    const delay =
      cfg.ASTEROID_SPAWN_INTERVAL_MIN +
      Math.random() *
        (cfg.ASTEROID_SPAWN_INTERVAL_MAX - cfg.ASTEROID_SPAWN_INTERVAL_MIN);

    this.asteroidSpawnTimeout = setTimeout(() => {
      if (this.flowMgr.phase === "PLAYING" && this.network.isHost()) {
        this.spawnAsteroidBatch();
        this.scheduleNextAsteroidSpawn();
      }
    }, delay * intervalScale);
  }

  private getAsteroidSpawnIntervalScale(): number {
    const round = Math.max(1, this.flowMgr.currentRound);
    const t = Math.min(1, Math.max(0, (round - 1) / 4));
    const startScale = 3.0;
    const endScale = 1 / 1.5;
    return startScale + (endScale - startScale) * t;
  }

  private spawnAsteroidBatch(): void {
    if (!this.network.isHost()) return;
    if (this.advancedSettings.asteroidDensity !== "SPAWN") return;

    const cfg = GameConfig.config;
    const batchSize =
      cfg.ASTEROID_SPAWN_BATCH_MIN +
      Math.floor(
        Math.random() *
          (cfg.ASTEROID_SPAWN_BATCH_MAX - cfg.ASTEROID_SPAWN_BATCH_MIN + 1),
      );

    for (let i = 0; i < batchSize; i++) {
      this.spawnSingleAsteroidFromBorder();
    }
  }

  private spawnSingleAsteroidFromBorder(): void {
    const cfg = GameConfig.config;
    const w = cfg.ARENA_WIDTH;
    const h = cfg.ARENA_HEIGHT;
    const spawnInset = cfg.ARENA_PADDING + 6;

    const side = Math.floor(Math.random() * 4);
    let x: number, y: number;
    let targetX: number, targetY: number;

    switch (side) {
      case 0:
        x = spawnInset + Math.random() * (w - spawnInset * 2);
        y = spawnInset;
        targetX = w * (0.3 + Math.random() * 0.4);
        targetY = h * (0.3 + Math.random() * 0.4);
        break;
      case 1:
        x = w - spawnInset;
        y = spawnInset + Math.random() * (h - spawnInset * 2);
        targetX = w * (0.3 + Math.random() * 0.4);
        targetY = h * (0.3 + Math.random() * 0.4);
        break;
      case 2:
        x = spawnInset + Math.random() * (w - spawnInset * 2);
        y = h - spawnInset;
        targetX = w * (0.3 + Math.random() * 0.4);
        targetY = h * (0.3 + Math.random() * 0.4);
        break;
      case 3:
      default:
        x = spawnInset;
        y = spawnInset + Math.random() * (h - spawnInset * 2);
        targetX = w * (0.3 + Math.random() * 0.4);
        targetY = h * (0.3 + Math.random() * 0.4);
        break;
    }

    const dx = targetX - x;
    const dy = targetY - y;
    const angle = Math.atan2(dy, dx);
    const angleVariance = (Math.random() - 0.5) * (Math.PI / 3);
    const finalAngle = angle + angleVariance;

    const speed = this.randomRange(
      cfg.ASTEROID_DRIFT_MIN_SPEED,
      cfg.ASTEROID_DRIFT_MAX_SPEED,
    );

    const velocity = {
      x: Math.cos(finalAngle) * speed,
      y: Math.sin(finalAngle) * speed,
    };

    const angularVelocity = this.randomAsteroidAngularVelocity();
    const tier = this.rollAsteroidTier();
    const size = this.randomAsteroidSize(tier);
    const asteroid = new Asteroid(
      this.physics,
      x,
      y,
      velocity,
      angularVelocity,
      tier,
      size,
    );
    this.asteroids.push(asteroid);
  }

  private trySpawnPowerUp(x: number, y: number): void {
    if (Math.random() > GAME_CONFIG.POWERUP_DROP_CHANCE) return;
    const rand = Math.random();
    let type: PowerUpType;
    if (rand < 0.16) {
      type = "LASER";
    } else if (rand < 0.32) {
      type = "SHIELD";
    } else if (rand < 0.48) {
      type = "SCATTER";
    } else if (rand < 0.64) {
      type = "MINE";
    } else if (rand < 0.8) {
      type = "REVERSE";
    } else if (rand < 0.9) {
      type = "JOUST";
    } else {
      type = "HOMING_MISSILE";
    }
    const powerUp = new PowerUp(this.physics, x, y, type);
    this.powerUps.push(powerUp);
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

  private applyLaserDamage(
    ownerId: string,
    startX: number,
    startY: number,
    angle: number,
  ): void {
    const beamLength = GAME_CONFIG.POWERUP_BEAM_LENGTH;
    const endX = startX + Math.cos(angle) * beamLength;
    const endY = startY + Math.sin(angle) * beamLength;

    this.ships.forEach((ship, shipPlayerId) => {
      if (shipPlayerId === ownerId || !ship.alive || ship.isInvulnerable())
        return;

      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          ship.body.position.x,
          ship.body.position.y,
          25,
        )
      ) {
        this.flowMgr.destroyShip(
          shipPlayerId,
          this.ships,
          this.pilots,
          this.playerMgr.players,
        );
        this.playerPowerUps.delete(shipPlayerId);
      }
    });

    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const asteroid = this.asteroids[i];
      if (!asteroid.alive) continue;

      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          asteroid.body.position.x,
          asteroid.body.position.y,
          asteroid.size,
        )
      ) {
        const pos = asteroid.body.position;
        this.renderer.spawnExplosion(pos.x, pos.y, GAME_CONFIG.ASTEROID_COLOR);
        this.renderer.spawnAsteroidDebris(
          pos.x,
          pos.y,
          asteroid.size,
          GAME_CONFIG.ASTEROID_COLOR,
        );
        asteroid.destroy();
        this.asteroids.splice(i, 1);
        if (asteroid.isLarge()) {
          this.splitAsteroid(asteroid, pos.x, pos.y);
        } else {
          this.trySpawnPowerUp(pos.x, pos.y);
        }
      }
    }

    this.pilots.forEach((pilot, pilotPlayerId) => {
      if (!pilot.alive) return;

      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          pilot.body.position.x,
          pilot.body.position.y,
          10,
        )
      ) {
        this.flowMgr.killPilot(
          pilotPlayerId,
          ownerId,
          this.pilots,
          this.playerMgr.players,
        );
      }
    });
  }

  private checkLineCircleCollision(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    radius: number,
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      const distSq = (cx - x1) ** 2 + (cy - y1) ** 2;
      return distSq <= radius * radius;
    }

    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;

    return distSq <= radius * radius;
  }

  private explodeMine(mine: Mine, triggeredByPlayerId?: string): void {
    if (!this.network.isHost()) return;

    // Mark mine as exploded - this will sync to clients immediately
    mine.explode();

    const explosionRadius = GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS;
    const mineX = mine.x;
    const mineY = mine.y;

    // Trigger mine explosion effect on host (synced to clients via network state)
    this.renderer.spawnMineExplosion(mineX, mineY, explosionRadius);
    this.renderer.addScreenShake(15, 0.4);
    SettingsManager.triggerHaptic("heavy");

    // Track if any ships were destroyed
    let shipsDestroyed = 0;

    // IMMEDIATELY destroy the triggering ship and any ships in radius
    // Both mine and ship animations play simultaneously
    this.ships.forEach((ship, shipPlayerId) => {
      if (!ship.alive) return;

      const dx = ship.body.position.x - mineX;
      const dy = ship.body.position.y - mineY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Destroy triggering ship or ships in explosion radius
      if (shipPlayerId === triggeredByPlayerId || dist <= explosionRadius) {
        shipsDestroyed++;
        const pos = ship.body.position;

        // Spawn ship explosion and debris immediately
        this.renderer.spawnExplosion(pos.x, pos.y, ship.color.primary);
        this.renderer.spawnShipDebris(pos.x, pos.y, ship.color.primary);
        this.renderer.addScreenShake(10, 0.3);

        // Destroy ship without creating pilot (mine instantly kills)
        ship.destroy();
        this.ships.delete(shipPlayerId);
        this.playerPowerUps.delete(shipPlayerId);

        // Set player as spectating (eliminated)
        const player = this.playerMgr.players.get(shipPlayerId);
        if (player) {
          player.state = "SPECTATING";
          this.network.updatePlayerState(shipPlayerId, "SPECTATING");
        }

        this.network.broadcastGameSound("explosion", shipPlayerId);
        SettingsManager.triggerHaptic("heavy");
      }
    });

    // Destroy pilots in explosion radius
    this.pilots.forEach((pilot, pilotPlayerId) => {
      if (!pilot.alive) return;

      const dx = pilot.body.position.x - mineX;
      const dy = pilot.body.position.y - mineY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= explosionRadius) {
        const pos = pilot.body.position;
        this.renderer.spawnExplosion(pos.x, pos.y, "#ff0000");
        this.renderer.addScreenShake(8, 0.2);

        pilot.destroy();
        this.pilots.delete(pilotPlayerId);

        const player = this.playerMgr.players.get(pilotPlayerId);
        if (player) {
          player.state = "SPECTATING";
          this.network.updatePlayerState(pilotPlayerId, "SPECTATING");
        }

        this.network.broadcastGameSound("kill", pilotPlayerId);
        SettingsManager.triggerHaptic("error");
      }
    });

    // Update player list to show eliminations
    this.emitPlayersUpdate();

    // Wait for both mine explosion (500ms) and ship debris (up to 1400ms) animations
    // Plus extra time to see the aftermath
    setTimeout(() => {
      if (!this.network.isHost()) return;
      if (this.flowMgr.phase === "PLAYING") {
        this.flowMgr.checkEliminationWin(this.playerMgr.players);
      }
    }, 2000); // 2 seconds for all animations to complete
  }

  private checkMineCollisions(): void {
    if (!this.network.isHost()) return;

    // Mine detection radius - increased when dev mode is on for testing
    const baseMineRadius = GAME_CONFIG.POWERUP_MINE_SIZE + 33;
    const devModeMultiplier = this.isDevModeEnabled() ? 3 : 1; // Triple radius in dev mode
    const mineDetectionRadius = baseMineRadius * devModeMultiplier;

    for (const mine of this.mines) {
      if (!mine.alive || mine.exploded) continue;

      // Check if mine is arming and should explode
      if (mine.checkArmingComplete()) {
        this.explodeMine(mine, mine.triggeringPlayerId);
        mine.triggeringPlayerId = undefined;
        continue;
      }

      // Skip normal collision check if mine is already arming
      if (mine.isArming()) continue;

      // Check collision with all ships
      for (const [shipPlayerId, ship] of this.ships) {
        if (!ship.alive) continue;

        const dx = ship.body.position.x - mine.x;
        const dy = ship.body.position.y - mine.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= mineDetectionRadius) {
          if (shipPlayerId !== mine.ownerId) {
            // Player touched the mine - trigger arming sequence
            // Explosion happens after 1 second delay
            mine.triggerArming();
            mine.triggeringPlayerId = shipPlayerId;
            // Show warning effect
            this.renderer.spawnExplosion(mine.x, mine.y, "#ff4400");
            this.renderer.addScreenShake(5, 0.15);
            SettingsManager.triggerHaptic("medium");
            break;
          }
        }
      }
    }
  }

  private updateHomingMissiles(dt: number): void {
    if (!this.network.isHost()) return;

    // Create ship position map for targeting
    const shipPositions = new Map<
      string,
      { x: number; y: number; alive: boolean }
    >();
    this.ships.forEach((ship, playerId) => {
      shipPositions.set(playerId, {
        x: ship.body.position.x,
        y: ship.body.position.y,
        alive: ship.alive,
      });
    });

    for (const missile of this.homingMissiles) {
      if (!missile.alive) continue;
      missile.update(dt, shipPositions);
    }
  }

  private checkHomingMissileCollisions(): void {
    if (!this.network.isHost()) return;

    for (const missile of this.homingMissiles) {
      if (!missile.alive) continue;

      // Check collision with ships
      for (const [shipPlayerId, ship] of this.ships) {
        if (!ship.alive || shipPlayerId === missile.ownerId) continue;

        const dx = ship.body.position.x - missile.x;
        const dy = ship.body.position.y - missile.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Missile radius (approx 6) + ship radius (approx 25)
        if (dist <= 31) {
          // Check if ship has shield or joust
          const powerUp = this.playerPowerUps.get(shipPlayerId);
          if (powerUp?.type === "SHIELD") {
            powerUp.shieldHits++;
            missile.destroy();
            this.renderer.addScreenShake(3, 0.1);
            if (powerUp.shieldHits >= GAME_CONFIG.POWERUP_SHIELD_HITS) {
              this.renderer.spawnShieldBreakDebris(
                ship.body.position.x,
                ship.body.position.y,
              );
              this.playerPowerUps.delete(shipPlayerId);
              SettingsManager.triggerHaptic("medium");
            }
          } else if (powerUp?.type === "JOUST") {
            // Check which side of joust was hit
            const shipAngle = ship.body.angle;
            const relativeAngle = Math.atan2(dy, dx) - shipAngle;
            const normalizedAngle = Math.atan2(
              Math.sin(relativeAngle),
              Math.cos(relativeAngle),
            );

            // Left side is roughly PI/2 to -PI/2 (facing left of ship)
            // Right side is the opposite
            const isLeftSide = normalizedAngle > 0;

            if (isLeftSide && powerUp.leftSwordActive) {
              powerUp.leftSwordActive = false;
              missile.destroy();
              this.renderer.addScreenShake(5, 0.15);
              SettingsManager.triggerHaptic("medium");
            } else if (!isLeftSide && powerUp.rightSwordActive) {
              powerUp.rightSwordActive = false;
              missile.destroy();
              this.renderer.addScreenShake(5, 0.15);
              SettingsManager.triggerHaptic("medium");
            } else {
              // No active sword on that side - destroy ship
              this.flowMgr.destroyShip(
                shipPlayerId,
                this.ships,
                this.pilots,
                this.playerMgr.players,
              );
              this.playerPowerUps.delete(shipPlayerId);
              missile.destroy();
            }

            // Remove joust if both swords are gone
            if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
              this.playerPowerUps.delete(shipPlayerId);
            }
          } else {
            // No protection - destroy ship
            this.flowMgr.destroyShip(
              shipPlayerId,
              this.ships,
              this.pilots,
              this.playerMgr.players,
            );
            this.playerPowerUps.delete(shipPlayerId);
            missile.destroy();

            // Spawn explosion effect
            this.renderer.spawnExplosion(missile.x, missile.y, "#ff4400");
            this.renderer.addScreenShake(10, 0.3);
          }
          break;
        }
      }

      if (!missile.alive) continue;

      // Check collision with asteroids
      for (let i = this.asteroids.length - 1; i >= 0; i--) {
        const asteroid = this.asteroids[i];
        if (!asteroid.alive) continue;

        const dx = asteroid.body.position.x - missile.x;
        const dy = asteroid.body.position.y - missile.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= asteroid.size + 6) {
          // Destroy asteroid
          const pos = asteroid.body.position;
          this.renderer.spawnExplosion(
            pos.x,
            pos.y,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.renderer.spawnAsteroidDebris(
            pos.x,
            pos.y,
            asteroid.size,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.renderer.addScreenShake(8, 0.2);

          asteroid.destroy();
          this.asteroids.splice(i, 1);

          if (asteroid.isLarge()) {
            this.splitAsteroid(asteroid, pos.x, pos.y);
          } else {
            this.trySpawnPowerUp(pos.x, pos.y);
          }

          missile.destroy();
          break;
        }
      }
    }
  }

  private checkJoustCollisions(): void {
    if (!this.network.isHost()) return;

    // Check Joust sword-to-ship collisions
    for (const [playerId, powerUp] of this.playerPowerUps) {
      if (powerUp?.type !== "JOUST") continue;

      const ship = this.ships.get(playerId);
      if (!ship || !ship.alive) continue;

      const shipX = ship.body.position.x;
      const shipY = ship.body.position.y;
      const shipAngle = ship.body.angle;

      // Calculate sword positions relative to ship
      // Swords are now at 10-degree angles from back corners with offset
      const swordLength = GAME_CONFIG.POWERUP_JOUST_SIZE;
      const size = 15;
      const cornerOffset = 8; // Space at back corners

      // Ship triangle vertices (relative to center, rotated by ship angle)
      const noseX = shipX + Math.cos(shipAngle) * size;
      const noseY = shipY + Math.sin(shipAngle) * size;
      const topWingX =
        shipX +
        Math.cos(shipAngle) * (-size * 0.7) +
        Math.cos(shipAngle - Math.PI / 2) * (-size * 0.6);
      const topWingY =
        shipY +
        Math.sin(shipAngle) * (-size * 0.7) +
        Math.sin(shipAngle - Math.PI / 2) * (-size * 0.6);
      const bottomWingX =
        shipX +
        Math.cos(shipAngle) * (-size * 0.7) +
        Math.cos(shipAngle + Math.PI / 2) * (-size * 0.6);
      const bottomWingY =
        shipY +
        Math.sin(shipAngle) * (-size * 0.7) +
        Math.sin(shipAngle + Math.PI / 2) * (-size * 0.6);

      // Left sword: starts at left back corner with offset, extends at 0 degrees (straight forward)
      const leftSwordAngle = shipAngle;
      // Apply offset backward from ship direction
      const leftSwordStartX = topWingX - Math.cos(shipAngle) * cornerOffset;
      const leftSwordStartY = topWingY - Math.sin(shipAngle) * cornerOffset;
      const leftSwordEndX =
        leftSwordStartX + Math.cos(leftSwordAngle) * swordLength;
      const leftSwordEndY =
        leftSwordStartY + Math.sin(leftSwordAngle) * swordLength;

      // Right sword: starts at right back corner with offset, extends at +10 degrees from ship
      const rightSwordAngle = shipAngle + Math.PI / 18;
      // Apply offset backward from ship direction
      const rightSwordStartX = bottomWingX - Math.cos(shipAngle) * cornerOffset;
      const rightSwordStartY = bottomWingY - Math.sin(shipAngle) * cornerOffset;
      const rightSwordEndX =
        rightSwordStartX + Math.cos(rightSwordAngle) * swordLength;
      const rightSwordEndY =
        rightSwordStartY + Math.sin(rightSwordAngle) * swordLength;

      // Calculate sword center points for collision detection
      const leftSwordCenterX = (leftSwordStartX + leftSwordEndX) / 2;
      const leftSwordCenterY = (leftSwordStartY + leftSwordEndY) / 2;
      const rightSwordCenterX = (rightSwordStartX + rightSwordEndX) / 2;
      const rightSwordCenterY = (rightSwordStartY + rightSwordEndY) / 2;

      // Check collision with other ships
      for (const [otherPlayerId, otherShip] of this.ships) {
        if (otherPlayerId === playerId || !otherShip.alive) continue;

        const otherX = otherShip.body.position.x;
        const otherY = otherShip.body.position.y;

        // Check left sword collision (using center point)
        if (powerUp.leftSwordActive) {
          const dx = otherX - leftSwordCenterX;
          const dy = otherY - leftSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Sword hitbox: length/2 + ship radius
          if (dist <= swordLength / 2 + 20) {
            // Destroy other ship
            this.flowMgr.destroyShip(
              otherPlayerId,
              this.ships,
              this.pilots,
              this.playerMgr.players,
            );
            this.playerPowerUps.delete(otherPlayerId);

            // Left sword falls off
            powerUp.leftSwordActive = false;
            this.renderer.addScreenShake(8, 0.25);
            SettingsManager.triggerHaptic("heavy");

            // Spawn debris for fallen sword at the start position (back corner)
            this.renderer.spawnShipDebris(
              leftSwordStartX,
              leftSwordStartY,
              "#00ff44",
            );
          }
        }

        // Check right sword collision (using center point)
        if (powerUp.rightSwordActive) {
          const dx = otherX - rightSwordCenterX;
          const dy = otherY - rightSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= swordLength / 2 + 20) {
            // Destroy other ship
            this.flowMgr.destroyShip(
              otherPlayerId,
              this.ships,
              this.pilots,
              this.playerMgr.players,
            );
            this.playerPowerUps.delete(otherPlayerId);

            // Right sword falls off
            powerUp.rightSwordActive = false;
            this.renderer.addScreenShake(8, 0.25);
            SettingsManager.triggerHaptic("heavy");

            // Spawn debris for fallen sword at the start position (back corner)
            this.renderer.spawnShipDebris(
              rightSwordStartX,
              rightSwordStartY,
              "#00ff44",
            );
          }
        }

        // Remove joust if both swords are gone
        if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
          this.playerPowerUps.delete(playerId);
          break;
        }
      }

      if (!powerUp || powerUp.type !== "JOUST") continue;

      // Check sword-to-projectile collisions (block bullets from sides only)
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const projectile = this.projectiles[i];
        if (projectile.ownerId === playerId) continue; // Don't block own bullets

        const projX = projectile.body.position.x;
        const projY = projectile.body.position.y;
        
        // Get projectile velocity direction
        const projVx = projectile.body.velocity.x;
        const projVy = projectile.body.velocity.y;
        const projSpeed = Math.sqrt(projVx * projVx + projVy * projVy);
        const projAngle = Math.atan2(projVy, projVx);
        
        // Calculate angle from projectile to ship
        const dx = shipX - projX;
        const dy = shipY - projY;
        const angleToShip = Math.atan2(dy, dx);
        
        // Check if projectile is approaching the ship from the front or back (should NOT be blocked)
        // A projectile from front/back would have velocity pointing toward the ship
        // We allow blocking only if projectile is coming from roughly perpendicular angles (sides)
        const angleDiff = Math.abs(angleToShip - projAngle);
        const normalizedAngleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
        
        // Only block if projectile is coming from the sides (angle > 45 degrees from approach direction)
        const isFromSide = normalizedAngleDiff > Math.PI / 4; // > 45 degrees

        // Check left sword collision with projectile
        if (powerUp.leftSwordActive) {
          const swordDx = projX - leftSwordCenterX;
          const swordDy = projY - leftSwordCenterY;
          const dist = Math.sqrt(swordDx * swordDx + swordDy * swordDy);

          if (dist <= swordLength / 2 + 8) {
            if (isFromSide) {
              // Destroy sword and block projectile
              powerUp.leftSwordActive = false;
              this.flowMgr.removeProjectileByBody(
                projectile.body,
                this.projectiles,
              );
              this.renderer.spawnExplosion(leftSwordCenterX, leftSwordCenterY, "#00ff44");
              this.renderer.addScreenShake(5, 0.15);
              SettingsManager.triggerHaptic("medium");
              
              // Spawn debris where the bullet hit the sword
              this.renderer.spawnShipDebris(
                projX,
                projY,
                "#00ff44",
              );
            }
            // If not from side, let projectile pass through to hit ship
          }
        }

        // Check right sword collision with projectile
        if (powerUp.rightSwordActive) {
          const swordDx = projX - rightSwordCenterX;
          const swordDy = projY - rightSwordCenterY;
          const dist = Math.sqrt(swordDx * swordDx + swordDy * swordDy);

          if (dist <= swordLength / 2 + 8) {
            if (isFromSide) {
              // Destroy sword and block projectile
              powerUp.rightSwordActive = false;
              this.flowMgr.removeProjectileByBody(
                projectile.body,
                this.projectiles,
              );
              this.renderer.spawnExplosion(rightSwordCenterX, rightSwordCenterY, "#00ff44");
              this.renderer.addScreenShake(5, 0.15);
              SettingsManager.triggerHaptic("medium");
              
              // Spawn debris where the bullet hit the sword
              this.renderer.spawnShipDebris(
                projX,
                projY,
                "#00ff44",
              );
            }
            // If not from side, let projectile pass through to hit ship
          }
        }
      }

      // Remove joust if both swords are gone after projectile collisions
      if (powerUp && !powerUp.leftSwordActive && !powerUp.rightSwordActive) {
        this.playerPowerUps.delete(playerId);
        continue;
      }

      if (!powerUp || powerUp.type !== "JOUST") continue;

      // Check sword-to-asteroid collisions (destroy asteroids, swords stay intact)
      for (let i = this.asteroids.length - 1; i >= 0; i--) {
        const asteroid = this.asteroids[i];
        if (!asteroid.alive) continue;

        const asteroidX = asteroid.body.position.x;
        const asteroidY = asteroid.body.position.y;

        let asteroidDestroyed = false;
        let hitByLeftSword = false;
        let hitByRightSword = false;

        // Check left sword collision - swords destroy asteroids but don't break
        if (powerUp.leftSwordActive && !asteroidDestroyed) {
          const dx = asteroidX - leftSwordCenterX;
          const dy = asteroidY - leftSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= swordLength / 2 + asteroid.size) {
            asteroidDestroyed = true;
            hitByLeftSword = true;
            this.renderer.addScreenShake(3, 0.1);
          }
        }

        // Check right sword collision - swords destroy asteroids but don't break
        if (powerUp.rightSwordActive && !asteroidDestroyed) {
          const dx = asteroidX - rightSwordCenterX;
          const dy = asteroidY - rightSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= swordLength / 2 + asteroid.size) {
            asteroidDestroyed = true;
            hitByRightSword = true;
            this.renderer.addScreenShake(3, 0.1);
          }
        }

        if (asteroidDestroyed) {
          // Destroy asteroid
          const pos = asteroid.body.position;
          this.renderer.spawnExplosion(
            pos.x,
            pos.y,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.renderer.spawnAsteroidDebris(
            pos.x,
            pos.y,
            asteroid.size,
            GAME_CONFIG.ASTEROID_COLOR,
          );

          asteroid.destroy();
          this.asteroids.splice(i, 1);

          if (asteroid.isLarge()) {
            this.splitAsteroid(asteroid, pos.x, pos.y);
          } else {
            this.trySpawnPowerUp(pos.x, pos.y);
          }
        }
      }
    }
  }

  // ============= UI CALLBACKS =============

  setUICallbacks(callbacks: {
    onPhaseChange: (phase: GamePhase) => void;
    onPlayersUpdate: (players: PlayerData[]) => void;
    onCountdownUpdate: (count: number) => void;
    onGameModeChange?: (mode: GameMode) => void;
    onRoundResult?: (payload: RoundResultPayload) => void;
    onAdvancedSettingsChange?: (settings: AdvancedSettings) => void;
  }): void {
    this.flowMgr.onPhaseChange = callbacks.onPhaseChange;
    this.flowMgr.onCountdownUpdate = callbacks.onCountdownUpdate;
    this._onPlayersUpdate = callbacks.onPlayersUpdate;
    this._onGameModeChange = callbacks.onGameModeChange ?? null;
    this._onRoundResult = callbacks.onRoundResult ?? null;
    this._onAdvancedSettingsChange = callbacks.onAdvancedSettingsChange ?? null;
  }

  private _onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;
  private _onGameModeChange: ((mode: GameMode) => void) | null = null;
  private _onRoundResult: ((payload: RoundResultPayload) => void) | null = null;
  private _onAdvancedSettingsChange:
    | ((settings: AdvancedSettings) => void)
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
          this.applyNetworkState(state);
        }
      },

      onInputReceived: (playerId, input) => {
        if (this.network.isHost()) {
          this.pendingInputs.set(playerId, input);
        }
      },

      onHostChanged: () => {
        console.log("[Game] Host left, leaving room");
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
        if (this.network.isHost()) {
          this.pendingDashes.add(playerId);
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
      this.network.sendDashRequest();
    });

    this.startPingInterval();
    this.flowMgr.setPhase("LOBBY");
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
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }
    this.stopPingInterval();
    this.clearAllGameState();
    this.playerMgr.clear();
    this._originalHostLeft = false;
    this.resetAdvancedSettings();
    this.flowMgr.setPhase("START");
  }

  /** Clear all entity/game state including asteroid/powerup/laser entities */
  private clearAllGameState(): void {
    this.flowMgr.clearGameState(
      this.ships,
      this.pilots,
      this.projectiles,
      this.pendingInputs,
      this.pendingDashes,
      this.playerMgr.players,
      true,
    );

    this.asteroids.forEach((asteroid) => asteroid.destroy());
    this.asteroids = [];

    this.powerUps.forEach((powerUp) => powerUp.destroy());
    this.powerUps = [];

    this.laserBeams.forEach((beam) => beam.destroy());
    this.laserBeams = [];

    this.mines.forEach((mine) => mine.destroy());
    this.mines = [];

    this.homingMissiles.forEach((missile) => missile.destroy());
    this.homingMissiles = [];

    this.playerPowerUps.clear();

    // Reset rotation direction
    this.rotationDirection = 1;

    if (this.asteroidSpawnTimeout) {
      clearTimeout(this.asteroidSpawnTimeout);
      this.asteroidSpawnTimeout = null;
    }

    this.networkShips = [];
    this.networkPilots = [];
    this.networkProjectiles = [];
    this.networkAsteroids = [];
    this.networkPowerUps = [];
    this.networkLaserBeams = [];
    this.networkMines = [];
    this.networkHomingMissiles = [];
    this.networkRotationDirection = 1;

    // Clear client tracking
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();

    this.roundResult = null;
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
    this.flowMgr.clearGameState(
      this.ships,
      this.pilots,
      this.projectiles,
      this.pendingInputs,
      this.pendingDashes,
      this.playerMgr.players,
      false,
    );

    this.asteroids.forEach((asteroid) => asteroid.destroy());
    this.asteroids = [];

    this.powerUps.forEach((powerUp) => powerUp.destroy());
    this.powerUps = [];

    this.laserBeams.forEach((beam) => beam.destroy());
    this.laserBeams = [];

    this.mines.forEach((mine) => mine.destroy());
    this.mines = [];

    this.homingMissiles.forEach((missile) => missile.destroy());
    this.homingMissiles = [];

    this.playerPowerUps.clear();

    // Reset rotation direction for new round
    this.rotationDirection = 1;

    // Clear client tracking for new round
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();

    if (this.asteroidSpawnTimeout) {
      clearTimeout(this.asteroidSpawnTimeout);
      this.asteroidSpawnTimeout = null;
    }

    this.roundResult = null;
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
    const localInput = this.botMgr.useTouchForHost
      ? this.multiInput?.capture(0) || {
          buttonA: false,
          buttonB: false,
          timestamp: 0,
        }
      : this.input.capture();
    if (now - this.lastInputSendTime >= GAME_CONFIG.SYNC_INTERVAL) {
      this.network.sendInput(localInput);
      this.lastInputSendTime = now;
    }

    // Check dev keys for testing powerups (only for local player on host)
    const devKeys = this.input.consumeDevKeys();
    const myPlayerId = this.network.getMyPlayerId();
    if (myPlayerId && this.network.isHost()) {
      const myShip = this.ships.get(myPlayerId);
      const existingPowerUp = this.playerPowerUps.get(myPlayerId);

      if (myShip && myShip.alive && !existingPowerUp) {
        if (devKeys.laser) {
          console.log("[Dev] Granting LASER powerup");
          this.grantPowerUp(myPlayerId, "LASER");
        }
        if (devKeys.shield) {
          console.log("[Dev] Granting SHIELD powerup");
          this.grantPowerUp(myPlayerId, "SHIELD");
        }
        if (devKeys.scatter) {
          console.log("[Dev] Granting SCATTER powerup");
          this.grantPowerUp(myPlayerId, "SCATTER");
        }
        if (devKeys.mine) {
          console.log("[Dev] Granting MINE powerup");
          this.grantPowerUp(myPlayerId, "MINE");
        }
        if (devKeys.joust) {
          console.log("[Dev] Granting JOUST powerup");
          this.grantPowerUp(myPlayerId, "JOUST");
        }
        if (devKeys.homing) {
          console.log("[Dev] Granting HOMING_MISSILE powerup");
          this.grantPowerUp(myPlayerId, "HOMING_MISSILE");
        }
      }

      // Reverse can be triggered even with existing power-up since it's global
      if (devKeys.reverse) {
        console.log("[Dev] Toggling REVERSE rotation");
        this.grantPowerUp(myPlayerId, "REVERSE");
      }
    }

    // Host: process all inputs and update physics
    if (this.network.isHost()) {
      this.ships.forEach((ship, playerId) => {
        let input: PlayerInput;
        let shouldDash = false;

        const isBot = this.network.isPlayerBot(playerId);
        const botType = this.network.getPlayerBotType(playerId);

        if (isBot && botType === "ai") {
          const player = this.network.getPlayer(playerId);
          const bot = player?.bot;
          if (bot) {
            const botData = this.botMgr.getBotVisibleData(
              playerId,
              this.ships,
              this.pilots,
              this.projectiles,
            );
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
          const keySlot = this.network.getPlayerKeySlot(playerId);
          input = this.multiInput?.capture(keySlot) || {
            buttonA: false,
            buttonB: false,
            timestamp: 0,
          };
          shouldDash = this.multiInput?.consumeDash(keySlot) || false;
        } else {
          const myId = this.network.getMyPlayerId();
          const isMe = playerId === myId;

          if (isMe && this.botMgr.useTouchForHost) {
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
            shouldDash = this.pendingDashes.has(playerId);
            if (shouldDash) {
              this.pendingDashes.delete(playerId);
            }
          }
        }

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
        if (fireResult?.shouldFire) {
          // Cannot shoot when joust is active
          if (playerPowerUp?.type === "JOUST") {
            // Joust melee only - no shooting
          } else {
            const firePos = ship.getFirePosition();

            // Check if player has a power-up

            if (playerPowerUp?.type === "LASER" && playerPowerUp.charges > 0) {
              const fireNow = Date.now();
              if (
                fireNow - playerPowerUp.lastFireTime >
                GAME_CONFIG.POWERUP_LASER_COOLDOWN
              ) {
                playerPowerUp.lastFireTime = fireNow;
                playerPowerUp.charges--;

                const beam = new LaserBeam(
                  playerId,
                  firePos.x,
                  firePos.y,
                  fireResult.fireAngle,
                );
                this.laserBeams.push(beam);

                this.applyLaserDamage(
                  playerId,
                  firePos.x,
                  firePos.y,
                  fireResult.fireAngle,
                );
                this.network.broadcastGameSound("fire", playerId);
                SettingsManager.triggerHaptic("heavy");

                if (playerPowerUp.charges <= 0) {
                  this.playerPowerUps.delete(playerId);
                }
              }
            } else if (
              playerPowerUp?.type === "SCATTER" &&
              playerPowerUp.charges > 0
            ) {
              const fireNow = Date.now();
              if (
                fireNow - playerPowerUp.lastFireTime >
                GAME_CONFIG.POWERUP_SCATTER_COOLDOWN
              ) {
                playerPowerUp.lastFireTime = fireNow;
                playerPowerUp.charges--;

                // Fire 3 projectiles in triangle pattern: -15°, 0°, +15°
                const angles = [
                  fireResult.fireAngle -
                    (GAME_CONFIG.POWERUP_SCATTER_ANGLE_1 * Math.PI) / 180,
                  fireResult.fireAngle,
                  fireResult.fireAngle +
                    (GAME_CONFIG.POWERUP_SCATTER_ANGLE_1 * Math.PI) / 180,
                ];

                for (const angle of angles) {
                  const projectile = new Projectile(
                    this.physics,
                    firePos.x,
                    firePos.y,
                    angle,
                    playerId,
                    GAME_CONFIG.POWERUP_SCATTER_PROJECTILE_SPEED,
                    GAME_CONFIG.POWERUP_SCATTER_PROJECTILE_LIFETIME,
                  );
                  this.projectiles.push(projectile);
                }

                this.network.broadcastGameSound("fire", playerId);
                SettingsManager.triggerHaptic("medium");

                if (playerPowerUp.charges <= 0) {
                  this.playerPowerUps.delete(playerId);
                }
              }
            } else if (
              playerPowerUp?.type === "MINE" &&
              playerPowerUp.charges > 0
            ) {
              // Deploy mine instead of firing
              playerPowerUp.charges--;

              // Spawn mine slightly behind the ship
              const mineOffset = 30;
              const mineX =
                firePos.x - Math.cos(fireResult.fireAngle) * mineOffset;
              const mineY =
                firePos.y - Math.sin(fireResult.fireAngle) * mineOffset;

              const mine = new Mine(playerId, mineX, mineY);
              this.mines.push(mine);

              this.network.broadcastGameSound("fire", playerId);
              SettingsManager.triggerHaptic("light");

              if (playerPowerUp.charges <= 0) {
                this.playerPowerUps.delete(playerId);
              }
            } else if (
              playerPowerUp?.type === "HOMING_MISSILE" &&
              playerPowerUp.charges > 0
            ) {
              // Fire homing missile
              playerPowerUp.charges--;

              const missile = new HomingMissile(
                playerId,
                firePos.x,
                firePos.y,
                fireResult.fireAngle,
              );
              this.homingMissiles.push(missile);

              this.network.broadcastGameSound("fire", playerId);
              SettingsManager.triggerHaptic("heavy");

              if (playerPowerUp.charges <= 0) {
                this.playerPowerUps.delete(playerId);
              }
            } else {
              // Regular projectile
              const projectile = new Projectile(
                this.physics,
                firePos.x,
                firePos.y,
                fireResult.fireAngle,
                playerId,
              );
              this.projectiles.push(projectile);
              this.network.broadcastGameSound("fire", playerId);
            }
          }
        }

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
        const input =
          pilot.controlMode === "player"
            ? this.getPilotInputForPlayer(playerId)
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
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        if (this.projectiles[i].isExpired()) {
          this.projectiles[i].destroy();
          this.projectiles.splice(i, 1);
        }
      }

      // Wrap asteroids around the arena
      this.asteroids.forEach((asteroid) => {
        this.physics.wrapAround(asteroid.body);
      });

      // Clean up expired power-ups
      for (let i = this.powerUps.length - 1; i >= 0; i--) {
        if (this.powerUps[i].isExpired()) {
          this.powerUps[i].destroy();
          this.powerUps.splice(i, 1);
        }
      }

      // Clean up expired laser beams
      for (let i = this.laserBeams.length - 1; i >= 0; i--) {
        if (this.laserBeams[i].isExpired()) {
          this.laserBeams[i].destroy();
          this.laserBeams.splice(i, 1);
        }
      }

      // Check mine collisions and clean up expired mines
      this.checkMineCollisions();
      for (let i = this.mines.length - 1; i >= 0; i--) {
        if (this.mines[i].isExpired()) {
          this.mines[i].destroy();
          this.mines.splice(i, 1);
        }
      }

      // Update homing missiles and check collisions
      this.updateHomingMissiles(dt);
      this.checkHomingMissileCollisions();
      for (let i = this.homingMissiles.length - 1; i >= 0; i--) {
        if (
          this.homingMissiles[i].isExpired() ||
          !this.homingMissiles[i].alive
        ) {
          this.homingMissiles[i].destroy();
          this.homingMissiles.splice(i, 1);
        }
      }

      // Check Joust collisions (sword-to-ship and sword-to-projectile)
      this.checkJoustCollisions();

      // Broadcast state (throttled to sync rate)
      if (now - this.lastBroadcastTime >= GAME_CONFIG.SYNC_INTERVAL) {
        this.broadcastState();
        this.lastBroadcastTime = now;
      }
    }

    // Update particles and effects
    this.renderer.updateParticles(dt);
    this.renderer.updateScreenShake(dt);

    // Update visual effects for all clients (nitro particles, etc.)
    this.updateVisualEffects();
  }

  private broadcastState(): void {
    const playerPowerUpsRecord: Record<string, PlayerPowerUp | null> = {};
    this.playerPowerUps.forEach((powerUp, playerId) => {
      playerPowerUpsRecord[playerId] = powerUp;
    });

    const state: GameStateSync = {
      ships: [...this.ships.values()].map((s) => s.getState()),
      pilots: [...this.pilots.values()].map((p) => p.getState()),
      projectiles: this.projectiles.map((p) => p.getState()),
      asteroids: this.asteroids.map((a) => a.getState()),
      powerUps: this.powerUps.map((p) => p.getState()),
      laserBeams: this.laserBeams.map((b) => b.getState()),
      mines: this.mines.map((m) => m.getState()),
      homingMissiles: this.homingMissiles.map((m) => m.getState()),
      players: [...this.playerMgr.players.values()],
      playerPowerUps: playerPowerUpsRecord,
      rotationDirection: this.rotationDirection,
    };

    this.network.broadcastGameState(state);
  }

  private applyNetworkState(state: GameStateSync): void {
    state.players.forEach((playerData) => {
      this.playerMgr.players.set(playerData.id, playerData);
    });
    this.emitPlayersUpdate();

    // Check for ships that were destroyed and trigger debris effects on client
    const currentShipIds = new Set(state.ships.map((s) => s.playerId));
    for (const [playerId, shipData] of this.clientShipPositions) {
      if (!currentShipIds.has(playerId)) {
        // Ship was destroyed - spawn debris on client
        this.renderer.spawnExplosion(shipData.x, shipData.y, shipData.color);
        this.renderer.spawnShipDebris(shipData.x, shipData.y, shipData.color);
        this.renderer.addScreenShake(10, 0.3);
        this.clientShipPositions.delete(playerId);
      }
    }

    // Update ship positions for tracking
    for (const shipState of state.ships) {
      if (shipState.alive) {
        const player = this.playerMgr.players.get(shipState.playerId);
        const color = player?.color.primary || "#ffffff";
        this.clientShipPositions.set(shipState.playerId, {
          x: shipState.x,
          y: shipState.y,
          color,
        });
      }
    }

    this.networkShips = state.ships;
    this.networkPilots = state.pilots;
    this.networkProjectiles = state.projectiles;
    this.networkAsteroids = state.asteroids;
    this.networkPowerUps = state.powerUps;
    this.networkLaserBeams = state.laserBeams;
    this.networkHomingMissiles = state.homingMissiles || [];

    // Check for mine explosions on client and trigger effects
    if (state.mines) {
      for (const mineState of state.mines) {
        if (mineState.exploded && !this.clientExplodedMines.has(mineState.id)) {
          // Mine just exploded - trigger effect on client
          this.clientExplodedMines.add(mineState.id);
          this.renderer.spawnMineExplosion(
            mineState.x,
            mineState.y,
            GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS,
          );
          this.renderer.addScreenShake(15, 0.4);
          SettingsManager.triggerHaptic("heavy");
        }
      }

      // Clean up old mine IDs that no longer exist
      const currentMineIds = new Set(state.mines.map((m) => m.id));
      for (const mineId of this.clientExplodedMines) {
        if (!currentMineIds.has(mineId)) {
          this.clientExplodedMines.delete(mineId);
        }
      }
    }

    this.networkMines = state.mines;
    this.networkRotationDirection = state.rotationDirection ?? 1;

    // Sync player power-ups: update existing and remove expired ones
    if (state.playerPowerUps) {
      // Create a set of player IDs that should have power-ups
      const activePowerUpIds = new Set(Object.keys(state.playerPowerUps));

      // Remove power-ups for players not in the sync state
      for (const playerId of this.playerPowerUps.keys()) {
        if (!activePowerUpIds.has(playerId)) {
          this.playerPowerUps.delete(playerId);
        }
      }

      // Update/add power-ups from sync state
      Object.entries(state.playerPowerUps).forEach(([playerId, powerUp]) => {
        this.playerPowerUps.set(playerId, powerUp);
      });
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

          // Spawn nitro particles (orange/yellow fire) - more intense than regular thrust
          const color = Math.random() > 0.4 ? "#ff6600" : "#ffee00";
          this.renderer.spawnNitroParticle(tailX, tailY, color);
        }
      });
    } else {
      // For non-host: use networkShips with state data
      this.networkShips.forEach((shipState) => {
        const joustPowerUp = this.playerPowerUps.get(shipState.playerId);
        if (joustPowerUp?.type === "JOUST") {
          const shipAngle = shipState.angle;
          const tailX = shipState.x - Math.cos(shipAngle) * 18;
          const tailY = shipState.y - Math.sin(shipAngle) * 18;

          // Spawn nitro particles (orange/yellow fire) - more intense than regular thrust
          const color = Math.random() > 0.4 ? "#ff6600" : "#ffee00";
          this.renderer.spawnNitroParticle(tailX, tailY, color);
        }
      });
    }
  }

  private getPilotInputForPlayer(playerId: string): PlayerInput {
    const isBot = this.network.isPlayerBot(playerId);
    const botType = this.network.getPlayerBotType(playerId);

    if (isBot && botType === "local") {
      const keySlot = this.network.getPlayerKeySlot(playerId);
      return (
        this.multiInput?.capture(keySlot) || {
          buttonA: false,
          buttonB: false,
          timestamp: 0,
        }
      );
    }

    const myId = this.network.getMyPlayerId();
    const isMe = playerId === myId;
    if (isMe && this.botMgr.useTouchForHost) {
      return (
        this.multiInput?.capture(0) || {
          buttonA: false,
          buttonB: false,
          timestamp: 0,
        }
      );
    }

    return (
      this.pendingInputs.get(playerId) || {
        buttonA: false,
        buttonB: false,
        timestamp: 0,
      }
    );
  }

  private render(dt: number): void {
    this.renderer.clear();
    this.renderer.beginFrame();

    this.renderer.drawStars();
    this.renderer.drawArenaBorder();

    if (this.flowMgr.phase === "PLAYING" || this.flowMgr.phase === "GAME_END") {
      const isHost = this.network.isHost();

      if (isHost) {
        this.ships.forEach((ship) => {
          if (ship.alive) {
            const powerUp = this.playerPowerUps.get(ship.playerId);
            const shieldHits =
              powerUp?.type === "SHIELD" ? powerUp.shieldHits : undefined;
            const laserCharges =
              powerUp?.type === "LASER" ? powerUp.charges : undefined;
            const laserCooldownProgress =
              powerUp?.type === "LASER" &&
              powerUp.charges < GAME_CONFIG.POWERUP_LASER_CHARGES
                ? Math.min(
                    1,
                    (Date.now() - powerUp.lastFireTime) /
                      GAME_CONFIG.POWERUP_LASER_COOLDOWN,
                  )
                : undefined;
            const scatterCharges =
              powerUp?.type === "SCATTER" ? powerUp.charges : undefined;
            const scatterCooldownProgress =
              powerUp?.type === "SCATTER" &&
              powerUp.charges < GAME_CONFIG.POWERUP_SCATTER_CHARGES
                ? Math.min(
                    1,
                    (Date.now() - powerUp.lastFireTime) /
                      GAME_CONFIG.POWERUP_SCATTER_COOLDOWN,
                  )
                : undefined;
            // Joust powerup data
            const joustLeftActive =
              powerUp?.type === "JOUST" ? powerUp.leftSwordActive : undefined;
            const joustRightActive =
              powerUp?.type === "JOUST" ? powerUp.rightSwordActive : undefined;
            // Homing missile powerup data
            const homingMissileCharges =
              powerUp?.type === "HOMING_MISSILE" ? powerUp.charges : undefined;
            this.renderer.drawShip(
              ship.getState(),
              ship.color,
              shieldHits,
              laserCharges,
              laserCooldownProgress,
              scatterCharges,
              scatterCooldownProgress,
              joustLeftActive,
              joustRightActive,
              homingMissileCharges,
            );
          }
        });
      } else {
        this.networkShips.forEach((state) => {
          if (state.alive) {
            const player = this.playerMgr.players.get(state.playerId);
            if (player) {
              const powerUp = this.playerPowerUps.get(state.playerId);
              const shieldHits =
                powerUp?.type === "SHIELD" ? powerUp.shieldHits : undefined;
              const laserCharges =
                powerUp?.type === "LASER" ? powerUp.charges : undefined;
              const laserCooldownProgress =
                powerUp?.type === "LASER" &&
                powerUp.charges < GAME_CONFIG.POWERUP_LASER_CHARGES
                  ? Math.min(
                      1,
                      (Date.now() - powerUp.lastFireTime) /
                        GAME_CONFIG.POWERUP_LASER_COOLDOWN,
                    )
                  : undefined;
              const scatterCharges =
                powerUp?.type === "SCATTER" ? powerUp.charges : undefined;
              const scatterCooldownProgress =
                powerUp?.type === "SCATTER" &&
                powerUp.charges < GAME_CONFIG.POWERUP_SCATTER_CHARGES
                  ? Math.min(
                      1,
                      (Date.now() - powerUp.lastFireTime) /
                        GAME_CONFIG.POWERUP_SCATTER_COOLDOWN,
                    )
                  : undefined;
              // Joust powerup data
              const joustLeftActive =
                powerUp?.type === "JOUST" ? powerUp.leftSwordActive : undefined;
              const joustRightActive =
                powerUp?.type === "JOUST"
                  ? powerUp.rightSwordActive
                  : undefined;
              // Homing missile powerup data
              const homingMissileCharges =
                powerUp?.type === "HOMING_MISSILE"
                  ? powerUp.charges
                  : undefined;
              this.renderer.drawShip(
                state,
                player.color,
                shieldHits,
                laserCharges,
                laserCooldownProgress,
                scatterCharges,
                scatterCooldownProgress,
                joustLeftActive,
                joustRightActive,
                homingMissileCharges,
              );
            }
          }
        });
      }

      if (isHost) {
        this.pilots.forEach((pilot) => {
          if (pilot.alive) {
            const player = this.playerMgr.players.get(pilot.playerId);
            if (player) {
              this.renderer.drawPilot(pilot.getState(), player.color);
            }
          }
        });
      } else {
        this.networkPilots.forEach((state) => {
          if (state.alive) {
            const player = this.playerMgr.players.get(state.playerId);
            if (player) {
              this.renderer.drawPilot(state, player.color);
            }
          }
        });
      }

      if (isHost) {
        this.projectiles.forEach((proj) => {
          this.renderer.drawProjectile(proj.getState());
        });
      } else {
        this.networkProjectiles.forEach((state) => {
          this.renderer.drawProjectile(state);
        });
      }

      // Draw asteroids
      if (isHost) {
        this.asteroids.forEach((asteroid) => {
          if (asteroid.alive) {
            this.renderer.drawAsteroid(asteroid.getState());
          }
        });
      } else {
        this.networkAsteroids.forEach((state) => {
          if (state.alive) {
            this.renderer.drawAsteroid(state);
          }
        });
      }

      // Draw power-ups
      if (isHost) {
        this.powerUps.forEach((powerUp) => {
          if (powerUp.alive) {
            this.renderer.drawPowerUp(powerUp.getState());
          }
        });
      } else {
        this.networkPowerUps.forEach((state) => {
          if (state.alive) {
            this.renderer.drawPowerUp(state);
          }
        });
      }

      // Draw laser beams
      if (isHost) {
        this.laserBeams.forEach((beam) => {
          if (beam.alive) {
            this.renderer.drawLaserBeam(beam.getState());
          }
        });
      } else {
        this.networkLaserBeams.forEach((state) => {
          if (state.alive) {
            this.renderer.drawLaserBeam(state);
          }
        });
      }

      // Draw mines
      if (isHost) {
        this.mines.forEach((mine) => {
          if (mine.alive) {
            this.renderer.drawMine(mine);
          }
        });
      } else {
        // For clients, we need to create Mine objects from network state or draw directly
        // Since mines don't have physics bodies, we can render from network state
        this.networkMines.forEach((state) => {
          if (state.alive) {
            this.renderer.drawMineState(state);
          }
        });
      }

      // Draw homing missiles
      if (isHost) {
        this.homingMissiles.forEach((missile) => {
          if (missile.alive) {
            this.renderer.drawHomingMissile(missile.getState());
          }
        });
      } else {
        this.networkHomingMissiles.forEach((state) => {
          if (state.alive) {
            this.renderer.drawHomingMissile(state);
          }
        });
      }

      // Draw dev mode visualization (debug circles for homing missile and mine radii)
      if (this.isDevModeEnabled()) {
        // Draw homing missile detection radius for all active missiles
        if (isHost) {
          this.homingMissiles.forEach((missile) => {
            if (missile.alive) {
              const state = missile.getState();
              this.renderer.drawHomingMissileDetectionRadius(
                state.x,
                state.y,
                GAME_CONFIG.POWERUP_HOMING_MISSILE_DETECTION_RADIUS,
              );
            }
          });
        } else {
          this.networkHomingMissiles.forEach((state) => {
            if (state.alive) {
              this.renderer.drawHomingMissileDetectionRadius(
                state.x,
                state.y,
                GAME_CONFIG.POWERUP_HOMING_MISSILE_DETECTION_RADIUS,
              );
            }
          });
        }

        // Draw mine detection radius for all active mines
        const mineDetectionRadius = GAME_CONFIG.POWERUP_MINE_SIZE + 33; // Collision radius
        if (isHost) {
          this.mines.forEach((mine) => {
            if (mine.alive && !mine.exploded) {
              this.renderer.drawMineDetectionRadius(
                mine.x,
                mine.y,
                mineDetectionRadius,
              );
            }
          });
        } else {
          this.networkMines.forEach((state) => {
            if (state.alive && !state.exploded) {
              this.renderer.drawMineDetectionRadius(
                state.x,
                state.y,
                mineDetectionRadius,
              );
            }
          });
        }
      }

      this.renderer.drawParticles();
    }

    if (this.flowMgr.phase === "COUNTDOWN" && this.flowMgr.countdown > 0) {
      this.renderer.drawCountdown(this.flowMgr.countdown);
    } else if (
      this.flowMgr.phase === "COUNTDOWN" &&
      this.flowMgr.countdown === 0
    ) {
      this.renderer.drawCountdown(0);
    }

    this.renderer.endFrame();
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

    this.stopPingInterval();

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
