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
import { AudioManager } from "./AudioManager";
import { SettingsManager } from "./SettingsManager";
import { PlayerManager } from "./managers/PlayerManager";
import { GameFlowManager } from "./managers/GameFlowManager";
import { BotManager } from "./managers/BotManager";
import {
  GamePhase,
  GameMode,
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
  PowerUpType,
  PlayerPowerUp,
  GAME_CONFIG,
  RoundResultPayload,
} from "./types";
import { GameConfig } from "./GameConfig";

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
  private networkRotationDirection: number = 1;

  // Track which mines have exploded on client (for effects)
  private clientExplodedMines: Set<string> = new Set();
  
  // Track ship positions for debris effects on client
  private clientShipPositions: Map<string, { x: number; y: number; color: string }> = new Map();

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
  }

  // ============= ASTEROID & POWERUP LOGIC =============

  private spawnInitialAsteroids(): void {
    if (!this.network.isHost()) return;

    const count = this.randomInt(
      GAME_CONFIG.ASTEROID_INITIAL_MIN,
      GAME_CONFIG.ASTEROID_INITIAL_MAX,
    );
    const centerX = GAME_CONFIG.ARENA_WIDTH / 2;
    const centerY = GAME_CONFIG.ARENA_HEIGHT / 2;
    const spreadX = GAME_CONFIG.ARENA_WIDTH * 0.28;
    const spreadY = GAME_CONFIG.ARENA_HEIGHT * 0.28;
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

  private splitAsteroid(asteroid: Asteroid, x: number, y: number): void {
    const count = GAME_CONFIG.ASTEROID_SPLIT_COUNT;
    const baseVx = asteroid.body.velocity.x * 0.4;
    const baseVy = asteroid.body.velocity.y * 0.4;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = this.randomRange(
        GAME_CONFIG.ASTEROID_DRIFT_MIN_SPEED,
        GAME_CONFIG.ASTEROID_DRIFT_MAX_SPEED,
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
    const min =
      tier === "LARGE"
        ? GAME_CONFIG.ASTEROID_LARGE_MIN
        : GAME_CONFIG.ASTEROID_SMALL_MIN;
    const max =
      tier === "LARGE"
        ? GAME_CONFIG.ASTEROID_LARGE_MAX
        : GAME_CONFIG.ASTEROID_SMALL_MAX;
    return min + Math.random() * (max - min);
  }

  private randomAsteroidVelocity(): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const speed = this.randomRange(
      GAME_CONFIG.ASTEROID_DRIFT_MIN_SPEED,
      GAME_CONFIG.ASTEROID_DRIFT_MAX_SPEED,
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

    const delay =
      GAME_CONFIG.ASTEROID_SPAWN_INTERVAL_MIN +
      Math.random() *
        (GAME_CONFIG.ASTEROID_SPAWN_INTERVAL_MAX -
          GAME_CONFIG.ASTEROID_SPAWN_INTERVAL_MIN);

    this.asteroidSpawnTimeout = setTimeout(() => {
      if (this.flowMgr.phase === "PLAYING" && this.network.isHost()) {
        this.spawnAsteroidBatch();
        this.scheduleNextAsteroidSpawn();
      }
    }, delay);
  }

  private spawnAsteroidBatch(): void {
    if (!this.network.isHost()) return;

    const batchSize =
      GAME_CONFIG.ASTEROID_SPAWN_BATCH_MIN +
      Math.floor(
        Math.random() *
          (GAME_CONFIG.ASTEROID_SPAWN_BATCH_MAX -
            GAME_CONFIG.ASTEROID_SPAWN_BATCH_MIN +
            1),
      );

    for (let i = 0; i < batchSize; i++) {
      this.spawnSingleAsteroidFromBorder();
    }
  }

  private spawnSingleAsteroidFromBorder(): void {
    const spawnMargin = 80;
    const w = GAME_CONFIG.ARENA_WIDTH;
    const h = GAME_CONFIG.ARENA_HEIGHT;

    const side = Math.floor(Math.random() * 4);
    let x: number, y: number;
    let targetX: number, targetY: number;

    switch (side) {
      case 0:
        x = Math.random() * w;
        y = -spawnMargin;
        targetX = Math.random() * w;
        targetY = h * (0.3 + Math.random() * 0.4);
        break;
      case 1:
        x = w + spawnMargin;
        y = Math.random() * h;
        targetX = w * (0.3 + Math.random() * 0.4);
        targetY = Math.random() * h;
        break;
      case 2:
        x = Math.random() * w;
        y = h + spawnMargin;
        targetX = Math.random() * w;
        targetY = h * (0.3 + Math.random() * 0.4);
        break;
      case 3:
      default:
        x = -spawnMargin;
        y = Math.random() * h;
        targetX = w * (0.3 + Math.random() * 0.4);
        targetY = Math.random() * h;
        break;
    }

    const dx = targetX - x;
    const dy = targetY - y;
    const angle = Math.atan2(dy, dx);
    const angleVariance = (Math.random() - 0.5) * (Math.PI / 3);
    const finalAngle = angle + angleVariance;

    const speed = this.randomRange(
      GAME_CONFIG.ASTEROID_DRIFT_MIN_SPEED,
      GAME_CONFIG.ASTEROID_DRIFT_MAX_SPEED,
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
    if (rand < 0.2) {
      type = "LASER";
    } else if (rand < 0.4) {
      type = "SHIELD";
    } else if (rand < 0.6) {
      type = "SCATTER";
    } else if (rand < 0.8) {
      type = "MINE";
    } else {
      type = "REVERSE";
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
      console.log(`[Game] Rotation direction changed to: ${this.rotationDirection === 1 ? "clockwise" : "counter-clockwise"}`);
      // Don't add to playerPowerUps since it's a global effect
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
    
    for (const mine of this.mines) {
      if (!mine.alive || mine.exploded) continue;
      
      // Check collision with all ships except the owner
      for (const [shipPlayerId, ship] of this.ships) {
        if (!ship.alive || shipPlayerId === mine.ownerId) continue;
        
        const dx = ship.body.position.x - mine.x;
        const dy = ship.body.position.y - mine.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Mine size + ship radius (approx 25)
        if (dist <= GAME_CONFIG.POWERUP_MINE_SIZE + 25) {
          // Trigger explosion immediately - ship will be destroyed as part of explosion
          this.explodeMine(mine, shipPlayerId);
          break;
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
  }): void {
    this.flowMgr.onPhaseChange = callbacks.onPhaseChange;
    this.flowMgr.onCountdownUpdate = callbacks.onCountdownUpdate;
    this._onPlayersUpdate = callbacks.onPlayersUpdate;
    this._onGameModeChange = callbacks.onGameModeChange ?? null;
    this._onRoundResult = callbacks.onRoundResult ?? null;
  }

  private _onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;
  private _onGameModeChange: ((mode: GameMode) => void) | null = null;
  private _onRoundResult: ((payload: RoundResultPayload) => void) | null = null;

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

      onGameModeReceived: (mode) => {
        console.log("[Game] Game mode received:", mode);
        GameConfig.setMode(mode);
        this._onGameModeChange?.(mode);
      },

      onRoundResultReceived: (payload) => {
        if (!this.network.isHost()) {
          this.applyRoundResult(payload);
        }
      },
    });
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
    this.networkRotationDirection = 1;
    
    // Clear client tracking
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();
    
    this.roundResult = null;
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

        const fireResult = ship.applyInput(input, shouldDash, dt, this.rotationDirection);
        if (fireResult?.shouldFire) {
          const firePos = ship.getFirePosition();

          // Check if player has a power-up
          const playerPowerUp = this.playerPowerUps.get(playerId);

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
          } else if (playerPowerUp?.type === "SCATTER" && playerPowerUp.charges > 0) {
            const fireNow = Date.now();
            if (
              fireNow - playerPowerUp.lastFireTime >
              GAME_CONFIG.POWERUP_SCATTER_COOLDOWN
            ) {
              playerPowerUp.lastFireTime = fireNow;
              playerPowerUp.charges--;

              // Fire 3 projectiles in triangle pattern: -15°, 0°, +15°
              const angles = [
                fireResult.fireAngle - (GAME_CONFIG.POWERUP_SCATTER_ANGLE_1 * Math.PI / 180),
                fireResult.fireAngle,
                fireResult.fireAngle + (GAME_CONFIG.POWERUP_SCATTER_ANGLE_1 * Math.PI / 180),
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
          } else if (playerPowerUp?.type === "MINE" && playerPowerUp.charges > 0) {
            // Deploy mine instead of firing
            playerPowerUp.charges--;
            
            // Spawn mine slightly behind the ship
            const mineOffset = 30;
            const mineX = firePos.x - Math.cos(fireResult.fireAngle) * mineOffset;
            const mineY = firePos.y - Math.sin(fireResult.fireAngle) * mineOffset;
            
            const mine = new Mine(playerId, mineX, mineY);
            this.mines.push(mine);
            
            this.network.broadcastGameSound("fire", playerId);
            SettingsManager.triggerHaptic("light");

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

      // Broadcast state (throttled to sync rate)
      if (now - this.lastBroadcastTime >= GAME_CONFIG.SYNC_INTERVAL) {
        this.broadcastState();
        this.lastBroadcastTime = now;
      }
    }

    // Update particles and effects
    this.renderer.updateParticles(dt);
    this.renderer.updateScreenShake(dt);
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
    const currentShipIds = new Set(state.ships.map(s => s.playerId));
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
          color
        });
      }
    }
    
    this.networkShips = state.ships;
    this.networkPilots = state.pilots;
    this.networkProjectiles = state.projectiles;
    this.networkAsteroids = state.asteroids;
    this.networkPowerUps = state.powerUps;
    this.networkLaserBeams = state.laserBeams;
    
    // Check for mine explosions on client and trigger effects
    if (state.mines) {
      for (const mineState of state.mines) {
        if (mineState.exploded && !this.clientExplodedMines.has(mineState.id)) {
          // Mine just exploded - trigger effect on client
          this.clientExplodedMines.add(mineState.id);
          this.renderer.spawnMineExplosion(mineState.x, mineState.y, GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS);
          this.renderer.addScreenShake(15, 0.4);
          SettingsManager.triggerHaptic("heavy");
        }
      }
      
      // Clean up old mine IDs that no longer exist
      const currentMineIds = new Set(state.mines.map(m => m.id));
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
            this.renderer.drawShip(
              ship.getState(),
              ship.color,
              shieldHits,
              laserCharges,
              laserCooldownProgress,
              scatterCharges,
              scatterCooldownProgress,
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
              this.renderer.drawShip(
                state,
                player.color,
                shieldHits,
                laserCharges,
                laserCooldownProgress,
                scatterCharges,
                scatterCooldownProgress,
              );
            }
          }
        });
      }

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

  setGameMode(mode: GameMode): void {
    GameConfig.setMode(mode);
  }

  broadcastGameMode(mode: GameMode): void {
    this.network.broadcastGameMode(mode);
  }

  getGameMode(): GameMode {
    return GameConfig.getMode();
  }

  startGame(): void {
    // Broadcast mode to all clients before starting countdown
    this.network.broadcastGameMode(GameConfig.getMode());
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

  // ============= TOUCH LAYOUT DELEGATION =============

  updateTouchLayout(): void {
    this.botMgr.updateTouchLayout(this.getPlayers());
  }

  clearTouchLayout(): void {
    this.botMgr.clearTouchLayout();
  }
}
