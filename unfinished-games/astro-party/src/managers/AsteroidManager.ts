import { Physics } from "../systems/Physics";
import { NetworkManager } from "../network/NetworkManager";
import { GameFlowManager } from "./GameFlowManager";
import { Asteroid } from "../entities/Asteroid";
import { PowerUp } from "../entities/PowerUp";
import { GameConfig } from "../GameConfig";
import {
  GAME_CONFIG,
  PowerUpType,
  AdvancedSettings,
} from "../types";

export class AsteroidManager {
  private asteroids: Asteroid[] = [];
  private asteroidSpawnTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private physics: Physics,
    private network: NetworkManager,
    private flowMgr: GameFlowManager,
    private powerUps: PowerUp[],
    private getAdvancedSettings: () => AdvancedSettings,
  ) {}

  getAsteroids(): Asteroid[] {
    return this.asteroids;
  }

  spawnInitialAsteroids(): void {
    if (!this.network.isHost()) return;
    if (this.getAdvancedSettings().asteroidDensity === "NONE") return;

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

  scheduleAsteroidSpawnsIfNeeded(): void {
    if (!this.network.isHost()) return;
    if (this.getAdvancedSettings().asteroidDensity !== "SPAWN") return;
    if (this.asteroidSpawnTimeout) {
      clearTimeout(this.asteroidSpawnTimeout);
      this.asteroidSpawnTimeout = null;
    }
    this.scheduleNextAsteroidSpawn();
  }

  splitAsteroid(asteroid: Asteroid, x: number, y: number): void {
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

  trySpawnPowerUp(x: number, y: number): void {
    if (Math.random() > GAME_CONFIG.POWERUP_DROP_CHANCE) return;

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

    const powerUp = new PowerUp(this.physics, x, y, type);
    this.powerUps.push(powerUp);
  }

  cancelSpawnTimeout(): void {
    if (this.asteroidSpawnTimeout) {
      clearTimeout(this.asteroidSpawnTimeout);
      this.asteroidSpawnTimeout = null;
    }
  }

  cleanup(): void {
    this.asteroids.forEach((asteroid) => asteroid.destroy());
    this.asteroids = [];
    this.cancelSpawnTimeout();
  }

  // ============= PRIVATE HELPERS =============

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
    if (this.getAdvancedSettings().asteroidDensity !== "SPAWN") return;

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
    if (this.getAdvancedSettings().asteroidDensity !== "SPAWN") return;

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
}
