import Matter from "matter-js";
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
import {
  MapDefinition,
  getMapDefinition,
  YellowBlock,
} from "./maps/MapDefinitions";
import type { MapId } from "./types";

interface YellowBlockState {
  block: YellowBlock;
  body?: Matter.Body;
  hp: number;
  maxHp: number;
}

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
  private mapPowerUpsSpawned = false; // Track if map power-ups have been spawned
  private mines: Mine[] = [];
  private homingMissiles: HomingMissile[] = [];
  private playerPowerUps: Map<string, PlayerPowerUp | null> = new Map();

  // Map system
  private selectedMapId: MapId = 0;
  private currentMap: MapDefinition | undefined = undefined;
  private yellowBlocks: YellowBlockState[] = [];
  private yellowBlockBodyIndex: Map<number, number> = new Map();
  private yellowBlockSwordHitCooldown: Map<number, number> = new Map();
  private centerHoleBodies: Matter.Body[] = [];
  private repulsionZoneBodies: Matter.Body[] = [];
  private networkYellowBlockHp: number[] = [];
  private mapTime: number = 0;
  private playerMovementDirection: number = 1; // 1 = clockwise, -1 = counter-clockwise

  // Input state
  private pendingInputs: Map<string, PlayerInput> = new Map();
  private pendingDashes: Set<string> = new Set();
  private localInputState: PlayerInput = {
    buttonA: false,
    buttonB: false,
    timestamp: 0,
    clientTimeMs: 0,
  };

  // Display smoothers for non-host rendering (velocity extrapolation + smooth correction)
  private shipSmoother = new DisplaySmoother(0.25, 100);
  private projectileSmoother = new DisplaySmoother(0.4, 150);
  private asteroidSmoother = new DisplaySmoother(0.15, 80);
  private pilotSmoother = new DisplaySmoother(0.2, 80);
  private missileSmoother = new DisplaySmoother(0.35, 120);

  private snapshotJitterMs: number = 0;
  private snapshotIntervalMs: number = 0;
  private lastSnapshotReceivedAtMs: number = 0;
  private lastPlayerStateSyncMs: number = 0;
  private lastSnapshotAgeMs: number = 0;

  // Network state caches (for client rendering)
  private networkShips: ShipState[] = [];
  private networkPilots: PilotState[] = [];
  private networkProjectiles: ProjectileState[] = [];
  private networkAsteroids: AsteroidState[] = [];
  private networkPowerUps: PowerUpState[] = [];
  private networkLaserBeams: LaserBeamState[] = [];
  private networkMines: MineState[] = [];
  private networkHomingMissiles: HomingMissileState[] = [];
  private networkTurret: TurretState | null = null;
  private networkTurretBullets: TurretBulletState[] = [];
  private networkRotationDirection: number = 1;
  private soundThrottleByKey: Map<string, number> = new Map();
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
      this.spawnInitialAsteroids();
      this.spawnMapFeatures(); // Spawn map-specific features (yellow blocks, map asteroids, etc.)
      this.scheduleAsteroidSpawnsIfNeeded();
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
            this.triggerScreenShake(3, 0.1);
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
      onProjectileHitYellowBlock: (
        _projectileOwnerId,
        yellowBlockBody,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;

        const blockIndex = this.yellowBlockBodyIndex.get(yellowBlockBody.id);
        if (blockIndex === undefined) {
          this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
          return;
        }

        const blockState = this.yellowBlocks[blockIndex];
        if (!blockState || blockState.hp <= 0) {
          this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
          return;
        }
        
        const hitX = projectileBody.position.x;
        const hitY = projectileBody.position.y;
        this.damageYellowBlock(blockIndex, hitX, hitY);

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
          const color = asteroid.getColor();

          const destroyed = asteroid.hit();

          if (destroyed) {
            this.renderer.spawnExplosion(pos.x, pos.y, color);
            this.renderer.spawnAsteroidDebris(pos.x, pos.y, asteroid.size, color);
            this.triggerScreenShake(8, 0.2);

            asteroid.destroy();
            this.asteroids.splice(asteroidIndex, 1);

            if (asteroid.isGrey()) {
              // Grey asteroids drop nothing
            } else if (asteroid.isLarge()) {
              this.splitAsteroid(asteroid, pos.x, pos.y);
            } else {
              this.trySpawnPowerUp(pos.x, pos.y);
            }
          } else {
            // Hit but not destroyed (grey asteroid with HP > 0)
            this.triggerScreenShake(3, 0.1);
            this.renderer.spawnExplosion(pos.x, pos.y, color);
            if (asteroid.isGrey()) {
              this.spawnHitParticles(pos.x, pos.y, color, 12);
            }
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
              const color = asteroid.getColor();
              this.renderer.spawnExplosion(pos.x, pos.y, color);
              this.renderer.spawnAsteroidDebris(pos.x, pos.y, asteroid.size, color);
              this.triggerScreenShake(10, 0.3);
              asteroid.destroy();
              this.asteroids.splice(asteroidIndex, 1);
              if (!asteroid.isGrey()) {
                this.trySpawnPowerUp(pos.x, pos.y);
              }
            }

            this.triggerScreenShake(3, 0.1);
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
            const color = asteroid.getColor();
            this.renderer.spawnExplosion(pos.x, pos.y, color);
            this.renderer.spawnAsteroidDebris(pos.x, pos.y, asteroid.size, color);
            this.triggerScreenShake(10, 0.3);
            asteroid.destroy();
            this.asteroids.splice(asteroidIndex, 1);
            if (!asteroid.isGrey()) {
              this.trySpawnPowerUp(pos.x, pos.y);
            }
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
            const color = asteroid.getColor();
            this.renderer.spawnExplosion(pos.x, pos.y, color);
            this.renderer.spawnAsteroidDebris(pos.x, pos.y, asteroid.size, color);
            this.triggerScreenShake(6, 0.2);
            asteroid.destroy();
            this.asteroids.splice(asteroidIndex, 1);
            if (!asteroid.isGrey()) {
              this.trySpawnPowerUp(pos.x, pos.y);
            }
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

        // Find powerup by body ID instead of object reference (more reliable)
        const powerUpIndex = this.powerUps.findIndex(
          (p) => p.body.id === powerUpBody.id,
        );
        if (powerUpIndex !== -1 && this.powerUps[powerUpIndex].alive) {
          const powerUp = this.powerUps[powerUpIndex];
          console.log(`[PowerUp] Ship ${shipPlayerId} collected ${powerUp.type} powerup`);
          this.grantPowerUp(shipPlayerId, powerUp.type);
          powerUp.destroy();
          this.powerUps.splice(powerUpIndex, 1);
          SettingsManager.triggerHaptic("medium");
        } else {
          console.log(`[PowerUp] Warning: Could not find powerup with body ID ${powerUpBody.id}. Available:`, this.powerUps.map(p => ({id: p.body.id, type: p.type, alive: p.alive})));
        }
      },
    });
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

  private spawnInitialAsteroids(): void {
    if (!this.network.isHost()) return;
    if (this.advancedSettings.asteroidDensity === "NONE") return;

    // If map has asteroid config (enabled or disabled), skip default spawning
    // The map asteroids will be spawned via spawnMapFeatures() -> spawnAsteroidsForMap()
    const map = this.getCurrentMap();
    if (map.asteroidConfig.enabled || map.asteroidConfig.minCount === 0) {
      console.log("[Game] Using map asteroid config, skipping default spawning");
      return;
    }

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

  private spawnTurret(): void {
    if (!this.network.isHost()) return;

    // Only spawn turret if map has turret
    const map = this.getCurrentMap();
    if (!map.hasTurret) {
      console.log("[Game] Turret disabled for this map");
      return;
    }

    // Spawn turret at center of map
    const centerX = GAME_CONFIG.ARENA_WIDTH / 2;
    const centerY = GAME_CONFIG.ARENA_HEIGHT / 2;

    this.turret = new Turret(this.physics, centerX, centerY);
    console.log("[Game] Turret spawned at center:", centerX, centerY);
  }

  private ensureMapInitialized(): void {
    if (!this.currentMap) {
      this.currentMap = getMapDefinition(this.selectedMapId);
    }
  }
  public setMap(mapId: MapId): void {
    if (this.flowMgr.phase !== "LOBBY") return;
    this.selectedMapId = mapId;
    this.currentMap = getMapDefinition(mapId);
    console.log("[Game] Map set to:", this.currentMap.name);
    // Broadcast to other players if host
    if (this.network.isHost()) {
      this.network.broadcastMapId(mapId);
    }
    // Notify UI
    this._onMapChange?.(mapId);
  }

  public getMapId(): MapId {
    return this.selectedMapId;
  }

  public getCurrentMap(): MapDefinition {
    // Lazy initialization if needed
    if (!this.currentMap) {
      this.currentMap = getMapDefinition(this.selectedMapId);
    }
    return this.currentMap;
  }

  // ===== MAP FEATURE SPAWNING =====
  private spawnMapFeatures(): void {
    if (!this.isHost()) return;
    this.ensureMapInitialized();

    this.spawnYellowBlocks();
    this.spawnCenterHoleObstacles();
    this.spawnRepulsionZoneObstacles();
    this.spawnAsteroidsForMap();
    this.spawnMapPowerUps();
  }

  private spawnYellowBlocks(): void {
    const map = this.getCurrentMap();
    const blocks = map.yellowBlocks;
    if (blocks.length === 0) return;

    console.log(`[SpawnYellowBlocks] ********** STARTING SPAWN **********`);
    console.log(`[SpawnYellowBlocks] Host: ${this.network.isHost()}, Current blocks in array: ${this.yellowBlocks.length}`);
    
    // SAFETY: If array is not empty, something went wrong - clear it first
    if (this.yellowBlocks.length > 0) {
      console.log(`[SpawnYellowBlocks] WARNING: Array not empty! Clearing ${this.yellowBlocks.length} old blocks first`);
      for (const block of this.yellowBlocks) {
        if (block.body) {
          this.physics.removeBody(block.body);
        }
      }
      this.yellowBlocks = [];
      this.yellowBlockBodyIndex.clear();
    }

    for (const [index, block] of blocks.entries()) {
      const hp = 1; // 1 shot to destroy
      const body = Matter.Bodies.rectangle(
        block.x,
        block.y,
        block.width,
        block.height,
        {
          isStatic: true,
          label: "yellowBlock",
          friction: 0,
          restitution: 0.9,
          collisionFilter: {
            category: 0x0008, // Treat like wall for collisions
            mask: 0x0001 | 0x0002 | 0x0004, // Ships, projectiles, asteroids
          },
        }
      );
      body.plugin = body.plugin || {};
      body.plugin.blockIndex = index;
      Matter.Composite.add(this.physics.world, body);
      this.yellowBlocks.push({
        block,
        body,
        hp,
        maxHp: hp,
      });
      this.yellowBlockBodyIndex.set(body.id, index);
    }
    const currentMapDef = this.getCurrentMap();
    console.log(`[SpawnYellowBlocks] ********** SPAWN COMPLETE **********`);
    console.log(`[SpawnYellowBlocks] Total blocks in array: ${this.yellowBlocks.length}, Index map size: ${this.yellowBlockBodyIndex.size}`);
  }

  private spawnCenterHoleObstacles(): void {
    const map = this.getCurrentMap();
    if (map.centerHoles.length === 0) return;

    for (const hole of map.centerHoles) {
      const body = Matter.Bodies.circle(hole.x, hole.y, hole.radius * 0.92, {
        isStatic: true,
        label: "wall",
        friction: 0,
        restitution: 0.9,
        collisionFilter: {
          category: 0x0008, // Wall category
          mask: 0x0001 | 0x0002 | 0x0004, // Ships, projectiles, asteroids
        },
      });
      Matter.Composite.add(this.physics.world, body);
      this.centerHoleBodies.push(body);
    }
  }

  private spawnRepulsionZoneObstacles(): void {
    // Repulse circles are force fields only (no static collider body).
    return;
  }

  private spawnAsteroidsForMap(): void {
    const currentMapDef = this.getCurrentMap();
    const asteroidConfig = currentMapDef.asteroidConfig;
    if (!asteroidConfig.enabled) return;
    if (this.advancedSettings.asteroidDensity === "NONE") return;

    const cfg = GameConfig.config;
    const count = this.randomInt(
      asteroidConfig.minCount,
      asteroidConfig.maxCount,
    );
    const centerX = cfg.ARENA_WIDTH / 2;
    const centerY = cfg.ARENA_HEIGHT / 2;
    const spreadX = cfg.ARENA_WIDTH * 0.28;
    const spreadY = cfg.ARENA_HEIGHT * 0.28;
    const maxAttempts = 20;

    for (let i = 0; i < count; i++) {
      // Spawn orange asteroids (60%) and grey asteroids (40%) based on map config
      const isGrey = Math.random() < asteroidConfig.greyRatio;
      const variant: "ORANGE" | "GREY" = isGrey ? "GREY" : "ORANGE";
      const tier = i === 0 ? "LARGE" : this.rollAsteroidTier();
      const size = isGrey
        ? this.randomRange(cfg.GREY_ASTEROID_MIN, cfg.GREY_ASTEROID_MAX)
        : this.randomAsteroidSize(tier);

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
        variant,
      );
      this.asteroids.push(asteroid);
    }

    console.log(
      `[Game] Spawned ${count} asteroids for map ${currentMapDef.name} (${asteroidConfig.greyRatio * 100}% grey)`,
    );
  }

  private spawnMapPowerUps(): void {
    if (!this.isHost()) return;
    const map = this.getCurrentMap();
    
    // Use powerUpConfig if defined for this map
    if (map.powerUpConfig?.enabled) {
      // Only spawn map power-ups once per game session (not per round)
      // The respawnPerRound flag controls whether they respawn in resetForNextRound()
      if (this.mapPowerUpsSpawned && map.powerUpConfig.respawnPerRound) {
        // Power-ups will respawn in resetForNextRound()
        return;
      }
      
      const cfg = map.powerUpConfig;
      const x = cfg.x * GAME_CONFIG.ARENA_WIDTH;
      const y = cfg.y * GAME_CONFIG.ARENA_HEIGHT;
      
      // Check if a powerup already exists at this exact location
      const existingPowerUp = this.powerUps.find(p => {
        const dx = Math.abs(p.body.position.x - x);
        const dy = Math.abs(p.body.position.y - y);
        return dx < 5 && dy < 5; // Exact position match (within 5 pixels)
      });
      
      if (existingPowerUp) {
        console.log(`[Game] Powerup already exists at center, skipping spawn`);
        return;
      }
      
      const randomType = cfg.types[Math.floor(Math.random() * cfg.types.length)];
      
      const powerUp = new PowerUp(this.physics, x, y, randomType);
      this.powerUps.push(powerUp);
      this.mapPowerUpsSpawned = true;
      console.log(`[Game] Spawned ${randomType} powerup at (${x.toFixed(0)}, ${y.toFixed(0)}) for ${map.name}. Total powerups: ${this.powerUps.length}`);
    }
  }

  // ===== MAP UPDATE LOOP =====
  private updateMapFeatures(dt: number): void {
    this.mapTime += dt;

    // Track player movement direction for rotating elements
    this.detectPlayerMovementDirection();

    // Apply repulsion zones
    const map = this.getCurrentMap();
    if (map.repulsionZones.length > 0) {
      this.applyRepulsionForces(dt);
    }
  }

  private detectPlayerMovementDirection(): void {
    // Calculate average angular velocity of all ships
    let totalAngularVel = 0;
    let shipCount = 0;

    for (const ship of this.ships.values()) {
      if (ship.alive && ship.body) {
        totalAngularVel += ship.body.angularVelocity;
        shipCount++;
      }
    }

    if (shipCount > 0) {
      const avgAngularVel = totalAngularVel / shipCount;
      // Update direction based on majority movement
      if (avgAngularVel > 0.05) {
        this.playerMovementDirection = 1;
      } else if (avgAngularVel < -0.05) {
        this.playerMovementDirection = -1;
      }
    }
  }

  private applyRepulsionForces(dt: number): void {
    const map = this.getCurrentMap();
    const zones = map.repulsionZones;
    for (const zone of zones) {
      const zoneCenter = { x: zone.x, y: zone.y };
      const zoneRadius = zone.radius;
      const zoneStrength = zone.strength;
      const influenceRadius = zoneRadius * 1.75;

      const applyForceToBody = (body: Matter.Body | undefined): void => {
        if (!body) return;
        const dx = body.position.x - zoneCenter.x;
        const dy = body.position.y - zoneCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= influenceRadius || dist <= 8) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const falloff = (influenceRadius - dist) / influenceRadius;
        const strengthScale = 0.8 + falloff * 1.4;
        const forceMagnitude =
          (zoneStrength * strengthScale) / Math.max(dist * dist, 60);

        Matter.Body.applyForce(body, body.position, {
          x: nx * forceMagnitude,
          y: ny * forceMagnitude,
        });
      };

      for (const ship of this.ships.values()) {
        if (!ship.alive) continue;
        applyForceToBody(ship.body);
      }

      for (const pilot of this.pilots.values()) {
        if (!pilot.alive) continue;
        applyForceToBody(pilot.body);
      }

      for (const asteroid of this.asteroids) {
        if (!asteroid.alive) continue;
        applyForceToBody(asteroid.body);
      }

      for (const powerUp of this.powerUps) {
        if (!powerUp.alive) continue;
        applyForceToBody(powerUp.body);
      }

      for (const projectile of this.projectiles) {
        if (!projectile.alive) continue;
        applyForceToBody(projectile.body);
      }

      for (const bullet of this.turretBullets) {
        if (!bullet.alive) continue;
        applyForceToBody(bullet.body);
      }

      for (const missile of this.homingMissiles) {
        if (!missile.alive) continue;
        const dx = missile.x - zoneCenter.x;
        const dy = missile.y - zoneCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= influenceRadius || dist <= 8) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const falloff = (influenceRadius - dist) / influenceRadius;
        const accel = zoneStrength * (6 + falloff * 10);
        missile.vx += nx * accel * dt * 60;
        missile.vy += ny * accel * dt * 60;
      }

      for (const mine of this.mines) {
        if (!mine.alive || mine.exploded) continue;
        const dx = mine.x - zoneCenter.x;
        const dy = mine.y - zoneCenter.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= influenceRadius || dist <= 8) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        const falloff = (influenceRadius - dist) / influenceRadius;
        const drift = zoneStrength * (12 + falloff * 16);
        mine.x += nx * drift * dt * 60;
        mine.y += ny * drift * dt * 60;
      }
    }
  }

  // ===== MAP RENDERING =====
  private renderMapFeatures(): void {
    const map = this.getCurrentMap();
    const theme = this.getMapTheme();

    // Draw yellow blocks
    for (const block of this.getYellowBlocksForRender()) {
      this.renderer.drawYellowBlock(block);
    }

    // Draw center holes with rotating arrows
    for (const hole of map.centerHoles) {
      this.renderer.drawCenterHole(
        hole,
        this.mapTime,
        this.playerMovementDirection,
        theme.centerHole,
      );
    }

    // Draw repulsion zones (visual indicator)
    for (const zone of map.repulsionZones) {
      this.renderer.drawRepulsionZone(zone, this.mapTime, theme.repulsion);
    }
  }

  private renderOverlayBoxes(): void {
    const map = this.getCurrentMap();
    const theme = this.getMapTheme();
    for (const box of map.overlayBoxes) {
      this.renderer.drawOverlayBox(box, theme.overlay);
    }
  }

  private getYellowBlocksForRender(): YellowBlock[] {
    const map = this.getCurrentMap();
    if (this.network.isHost()) {
      return this.yellowBlocks
        .filter((block) => block.hp > 0)
        .map((block) => block.block);
    }

    // Client-side rendering based on network state
    // Only render blocks if we have received state from host
    if (this.networkYellowBlockHp.length > 0 && this.networkYellowBlockHp.length === map.yellowBlocks.length) {
      return map.yellowBlocks.filter(
        (_, index) => (this.networkYellowBlockHp[index] ?? 1) > 0,
      );
    }

    // If no state received yet, don't render any blocks (wait for host sync)
    return [];
  }

  private getMapTheme(): {
    border: string;
    centerHole?: {
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    };
    repulsion?: {
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
      core: string;
      ring: string;
      arrow: string;
      glow: string;
    };
    overlay?: { fill: string; stroke: string; hole: string };
  } {
    const map = this.getCurrentMap();
    switch (map.id) {
      case 1: // Cache
        return {
          border: "#ffee00",
        };
      case 2: // Vortex
        return {
          border: "#ff5a2b",
          centerHole: {
            ring: "#ff5a2b",
            innerRing: "#ffb36b",
            arrow: "#ff8844",
            glow: "#ff5a2b",
            gradientInner: "rgba(0, 0, 0, 0.95)",
            gradientMid: "rgba(40, 12, 0, 0.9)",
            gradientOuter: "rgba(90, 35, 10, 0.65)",
          },
        };
      case 3: // Repulse
        return {
          border: "#ff5a2b",
          repulsion: {
            gradientInner: "rgba(255, 90, 40, 0.45)",
            gradientMid: "rgba(255, 140, 60, 0.2)",
            gradientOuter: "rgba(255, 120, 50, 0)",
            core: "rgba(230, 50, 30, 0.65)",
            ring: "#ff5a2b",
            arrow: "rgba(255, 140, 80, 0.75)",
            glow: "#ff5a2b",
          },
        };
      case 4: // Bunkers
        return {
          border: "#00ff88",
          overlay: {
            fill: "#0bb866",
            stroke: "#7cffb8",
            hole: "transparent",
          },
        };
      case 0:
      default:
        return {
          border: "#00f0ff",
        };
    }
  }

  // ===== MAP CLEANUP =====
  private clearMapFeatures(): void {
    console.log(`[ClearMapFeatures] ********** STARTING CLEANUP **********`);
    console.log(`[ClearMapFeatures] Host: ${this.network.isHost()}, Current blocks: ${this.yellowBlocks.length}`);
    
    // Remove yellow block bodies
    for (const block of this.yellowBlocks) {
      if (block.body) {
        this.physics.removeBody(block.body);
      }
    }
    
    // CRITICAL: Clear the array
    this.yellowBlocks = [];
    console.log(`[ClearMapFeatures] Array cleared. Length now: ${this.yellowBlocks.length}`);
    
    this.yellowBlockBodyIndex.clear();
    this.yellowBlockSwordHitCooldown.clear();
    this.networkYellowBlockHp = [];
    console.log(`[ClearMapFeatures] ********** CLEANUP COMPLETE **********`);

    // Remove center hole bodies
    for (const body of this.centerHoleBodies) {
      this.physics.removeBody(body);
    }
    this.centerHoleBodies = [];

    // Remove repulsion zone bodies
    for (const body of this.repulsionZoneBodies) {
      this.physics.removeBody(body);
    }
    this.repulsionZoneBodies = [];

    // Reset map state
    this.mapTime = 0;
    this.playerMovementDirection = 1;
  }

  private damageYellowBlock(
    blockIndex: number,
    hitX: number,
    hitY: number,
    amount: number = 1,
  ): void {
    const blockState = this.yellowBlocks[blockIndex];
    if (!blockState || blockState.hp <= 0) return;

    blockState.hp -= amount;
    this.spawnHitParticles(hitX, hitY, "#ffee00", 10);

    if (blockState.hp <= 0 && blockState.body) {
      this.physics.removeBody(blockState.body);
      this.yellowBlockBodyIndex.delete(blockState.body.id);
      this.yellowBlockSwordHitCooldown.delete(blockIndex);
      blockState.body = undefined;
      this.renderer.spawnExplosion(hitX, hitY, "#ffee00");
    }
  }

  private tryDamageYellowBlockWithSword(
    blockIndex: number,
    hitX: number,
    hitY: number,
  ): void {
    const now = performance.now();
    const nextAllowed = this.yellowBlockSwordHitCooldown.get(blockIndex) ?? 0;
    if (now < nextAllowed) return;

    this.yellowBlockSwordHitCooldown.set(blockIndex, now + 180);
    this.damageYellowBlock(blockIndex, hitX, hitY);
  }

  private isPointInsideBlock(
    x: number,
    y: number,
    block: YellowBlock,
    padding: number,
  ): boolean {
    return (
      x >= block.x - padding &&
      x <= block.x + block.width + padding &&
      y >= block.y - padding &&
      y <= block.y + block.height + padding
    );
  }

  private spawnHitParticles(
    x: number,
    y: number,
    color: string,
    count: number = 8,
  ): void {
    for (let i = 0; i < count; i++) {
      this.renderer.spawnParticle(x, y, color, "hit");
    }
  }

  private spawnDashParticles(playerId: string, ship: Ship): void {
    if (!ship.alive) return;

    const pos = ship.body.position;
    const angle = ship.body.angle;
    const color = ship.color.primary;

    // Spawn particles locally
    this.renderer.spawnDashParticles(pos.x, pos.y, angle, color);

    // Broadcast to other players
    this.broadcastDashParticles(playerId, pos.x, pos.y, angle, color);
  }

  private broadcastDashParticles(
    playerId: string,
    x: number,
    y: number,
    angle: number,
    color: string,
  ): void {
    if (!this.network.isHost()) return;

    // Send RPC to all clients to spawn dash particles
    this.network.broadcastDashParticles(playerId, x, y, angle, color);
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

    // Spawn at random position within arena (with padding)
    const padding = 100;
    const x = padding + Math.random() * (GAME_CONFIG.ARENA_WIDTH - padding * 2);
    const y =
      padding + Math.random() * (GAME_CONFIG.ARENA_HEIGHT - padding * 2);

    const powerUp = new PowerUp(this.physics, x, y, type);
    this.powerUps.push(powerUp);

    console.log(
      `[Game] Spawned random ${type} power-up at (${x.toFixed(0)}, ${y.toFixed(0)})`,
    );
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
        const color = asteroid.getColor();
        // Laser instantly destroys regardless of HP
        this.renderer.spawnExplosion(pos.x, pos.y, color);
        this.renderer.spawnAsteroidDebris(pos.x, pos.y, asteroid.size, color);
        asteroid.destroy();
        this.asteroids.splice(i, 1);
        if (asteroid.isGrey()) {
          // Grey asteroids drop nothing
        } else if (asteroid.isLarge()) {
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
    this.triggerScreenShake(15, 0.4);
    SettingsManager.triggerHaptic("heavy");

    // IMMEDIATELY destroy the triggering ship and any ships in radius
    // Both mine and ship animations play simultaneously
    this.ships.forEach((ship, shipPlayerId) => {
      if (!ship.alive) return;

      const dx = ship.body.position.x - mineX;
      const dy = ship.body.position.y - mineY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Destroy any ship in explosion radius (including the triggering player)
      if (dist <= explosionRadius) {
        const pos = ship.body.position;

        // Spawn ship explosion and debris immediately
        this.renderer.spawnExplosion(pos.x, pos.y, ship.color.primary);
        this.renderer.spawnShipDebris(pos.x, pos.y, ship.color.primary);
        this.triggerScreenShake(10, 0.3);

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
        this.triggerScreenShake(8, 0.2);

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

    // Destroy yellow blocks in explosion radius
    for (let i = this.yellowBlocks.length - 1; i >= 0; i--) {
      const block = this.yellowBlocks[i];
      if (!block.body) continue;

      const dx = block.body.position.x - mineX;
      const dy = block.body.position.y - mineY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= explosionRadius) {
        const pos = block.body.position;
        // Spawn yellow debris
        this.renderer.spawnAsteroidDebris(pos.x, pos.y, 40, "#ffee00");
        this.physics.removeBody(block.body);
        this.yellowBlockBodyIndex.delete(block.body.id);
        this.yellowBlocks.splice(i, 1);
      }
    }

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
            // Explosion happens after short delay
            mine.triggerArming();
            mine.triggeringPlayerId = shipPlayerId;
            // Warning effects removed - only one explosion when mine actually detonates
            this.triggerScreenShake(2, 0.1);
            SettingsManager.triggerHaptic("light");
            break;
          }
        }
      }
    }
  }

  private checkLaserBeamCollisions(): void {
    if (!this.network.isHost()) return;

    for (const beam of this.laserBeams) {
      if (!beam.alive) continue;

      const beamStart = beam.getStartPoint();
      const beamEnd = beam.getEndPoint();

      // Check collision with yellow blocks
      for (let i = this.yellowBlocks.length - 1; i >= 0; i--) {
        const block = this.yellowBlocks[i];
        if (!block.body) continue;

        const blockX = block.body.position.x;
        const blockY = block.body.position.y;
        const blockHalfSize = block.block.width / 2;

        // Check if beam line segment intersects with block
        if (this.lineIntersectsRect(beamStart, beamEnd, blockX, blockY, blockHalfSize)) {
          // Destroy the yellow block
          this.renderer.spawnAsteroidDebris(blockX, blockY, 40, "#ffee00");
          this.physics.removeBody(block.body);
          this.yellowBlockBodyIndex.delete(block.body.id);
          this.yellowBlocks.splice(i, 1);
        }
      }
    }
  }

  private lineIntersectsRect(
    start: { x: number; y: number },
    end: { x: number; y: number },
    rectX: number,
    rectY: number,
    halfSize: number,
  ): boolean {
    // Check if line intersects rectangle
    const left = rectX - halfSize;
    const right = rectX + halfSize;
    const top = rectY - halfSize;
    const bottom = rectY + halfSize;

    // Check if either endpoint is inside the rect
    if (this.pointInRect(start, left, right, top, bottom) ||
        this.pointInRect(end, left, right, top, bottom)) {
      return true;
    }

    // Check line intersection with each edge
    return this.lineIntersectsLine(start, end, { x: left, y: top }, { x: right, y: top }) ||
           this.lineIntersectsLine(start, end, { x: right, y: top }, { x: right, y: bottom }) ||
           this.lineIntersectsLine(start, end, { x: right, y: bottom }, { x: left, y: bottom }) ||
           this.lineIntersectsLine(start, end, { x: left, y: bottom }, { x: left, y: top });
  }

  private pointInRect(
    point: { x: number; y: number },
    left: number,
    right: number,
    top: number,
    bottom: number,
  ): boolean {
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  private lineIntersectsLine(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
  ): boolean {
    const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denominator === 0) return false;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  private updateHomingMissiles(dt: number): void {
    if (!this.network.isHost()) return;
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

          if (asteroid.isLarge()) {
            this.splitAsteroid(asteroid, pos.x, pos.y);
          } else {
            this.trySpawnPowerUp(pos.x, pos.y);
          }
        }
      }

      // Check sword-to-yellow-block collisions on Cache map.
      // Swords chip blocks with a short cooldown so damage feels controlled.
      if (
        this.getCurrentMap().id === 1 &&
        (powerUp.leftSwordActive || powerUp.rightSwordActive)
      ) {
        const swordPadding = 10;
        for (let blockIndex = 0; blockIndex < this.yellowBlocks.length; blockIndex++) {
          const blockState = this.yellowBlocks[blockIndex];
          if (!blockState || blockState.hp <= 0 || !blockState.body) continue;

          if (
            powerUp.leftSwordActive &&
            this.isPointInsideBlock(
              leftSwordCenterX,
              leftSwordCenterY,
              blockState.block,
              swordPadding,
            )
          ) {
            this.tryDamageYellowBlockWithSword(
              blockIndex,
              leftSwordCenterX,
              leftSwordCenterY,
            );
          }

          if (
            powerUp.rightSwordActive &&
            this.isPointInsideBlock(
              rightSwordCenterX,
              rightSwordCenterY,
              blockState.block,
              swordPadding,
            )
          ) {
            this.tryDamageYellowBlockWithSword(
              blockIndex,
              rightSwordCenterX,
              rightSwordCenterY,
            );
          }
        }
      }
    }
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
    onMapChange?: (mapId: MapId) => void;
  }): void {
    this.flowMgr.onPhaseChange = callbacks.onPhaseChange;
    this.flowMgr.onCountdownUpdate = callbacks.onCountdownUpdate;
    this._onPlayersUpdate = callbacks.onPlayersUpdate;
    this._onGameModeChange = callbacks.onGameModeChange ?? null;
    this._onRoundResult = callbacks.onRoundResult ?? null;
    this._onAdvancedSettingsChange = callbacks.onAdvancedSettingsChange ?? null;
    this._onSystemMessage = callbacks.onSystemMessage ?? null;
    this._onMapChange = callbacks.onMapChange ?? null;
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
  private _onMapChange: ((mapId: MapId) => void) | null = null;

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

      onMapIdReceived: (mapId: number) => {
        if (this.network.isHost()) return;
        this.selectedMapId = mapId as MapId;
        this.currentMap = getMapDefinition(mapId as MapId);
        console.log("[Game] MapId received from network:", this.currentMap.name);
        // Notify UI
        this._onMapChange?.(mapId as MapId);
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

    this.botMgr.resetLocalState();
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
    this.botMgr.resetLocalState();
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

    // Clear map features
    this.clearMapFeatures();

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

    this.renderer.clearEffects();

    this.asteroids.forEach((asteroid) => asteroid.destroy());
    this.asteroids = [];

    console.log(`[ResetRound] Clearing ${this.powerUps.length} powerups`);
    this.powerUps.forEach((powerUp) => {
      console.log(`[ResetRound] Destroying powerup ${powerUp.type} at (${powerUp.body.position.x.toFixed(0)}, ${powerUp.body.position.y.toFixed(0)})`);
      powerUp.destroy();
    });
    this.powerUps = [];
    
    // Reset map power-up spawn flag if respawnPerRound is enabled
    const map = this.getCurrentMap();
    if (map.powerUpConfig?.respawnPerRound) {
      this.mapPowerUpsSpawned = false;
    }

    this.laserBeams.forEach((beam) => beam.destroy());
    this.laserBeams = [];

    // Clear and respawn map features
    this.clearMapFeatures();
    // Step physics to ensure bodies are fully removed from collision detection
    this.physics.update(16.667);
    this.spawnMapFeatures();

    this.mines.forEach((mine) => mine.destroy());
    this.mines = [];

    this.homingMissiles.forEach((missile) => missile.destroy());
    this.homingMissiles = [];

    if (this.turret) {
      this.turret.destroy();
      this.turret = null;
    }

    this.turretBullets.forEach((bullet) => bullet.destroy());
    this.turretBullets = [];

    this.playerPowerUps.clear();

    // Reset rotation direction for new round
    this.rotationDirection = 1;

  /** Clear all entity/game state including network caches and throttles */
  private clearAllGameState(): void {
    this.clearEntities(true);
    this.networkSync.clear();
    this.fireSystem.clearThrottles();
  }

    // Clear network state arrays to prevent stale data on clients
    this.networkShips = [];
    this.networkPilots = [];
    this.networkProjectiles = [];
    this.networkAsteroids = [];
    this.networkPowerUps = [];
    this.networkLaserBeams = [];
    this.networkMines = [];
    this.networkHomingMissiles = [];
    this.networkTurret = null;
    this.networkTurretBullets = [];
    this.networkYellowBlockHp = [];

    if (this.asteroidSpawnTimeout) {
      clearTimeout(this.asteroidSpawnTimeout);
      this.asteroidSpawnTimeout = null;
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
          const pilotAngle = pilot.body.angle;
          pilot.destroy();
          this.pilots.delete(playerId);
          this.flowMgr.respawnPlayer(
            playerId,
            pilotPosition,
            this.ships,
            this.playerMgr.players,
            pilotAngle,
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

      // Check laser beam collisions with yellow blocks
      this.checkLaserBeamCollisions();

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

      // Update map features (repulsion zones, etc.)
      this.updateMapFeatures(dt);

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

  private broadcastState(): void {
    const now = performance.now();

    let playerPowerUpsRecord: Record<string, PlayerPowerUp | null> | undefined;
    if (now - this.lastPowerUpSyncTime >= 200) {
      this.lastPowerUpSyncTime = now;
      playerPowerUpsRecord = {};
      this.playerPowerUps.forEach((powerUp, playerId) => {
        playerPowerUpsRecord![playerId] = powerUp;
      });
    }

    const state: GameStateSync = {
      ships: [...this.ships.values()].map((s) => s.getState()),
      pilots: [...this.pilots.values()].map((p) => p.getState()),
      projectiles: this.projectiles.map((p) => p.getState()),
      asteroids: this.asteroids.map((a) => a.getState()),
      powerUps: this.powerUps.map((p) => p.getState()),
      laserBeams: this.laserBeams.map((b) => b.getState()),
      mines: this.mines.map((m) => m.getState()),
      homingMissiles: this.homingMissiles.map((m) => m.getState()),
      turret: this.turret?.getState(),
      turretBullets: this.turretBullets.map((b) => b.getState()),
      playerPowerUps: playerPowerUpsRecord,
      yellowBlockHp: this.yellowBlocks.map((block) => block.hp),
      rotationDirection: this.rotationDirection,
    };

    this.network.broadcastGameState(state);
  }

  private applyNetworkState(state: GameStateSync): void {
    const receivedAt = performance.now();
    this.trackSnapshotTiming(receivedAt);
    this.syncPlayerStatesFromNetwork();

    // Check for ships that were destroyed and trigger debris effects on client
    const currentShipIds = new Set(state.ships.map((s) => s.playerId));
    for (const [playerId, shipData] of this.clientShipPositions) {
      if (!currentShipIds.has(playerId)) {
        // Ship was destroyed - spawn debris on client
        this.renderer.spawnExplosion(shipData.x, shipData.y, shipData.color);
        this.renderer.spawnShipDebris(shipData.x, shipData.y, shipData.color);
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
    this.networkYellowBlockHp = state.yellowBlockHp || [];

    // Check for mine explosions on client and trigger effects
    if (state.mines) {
      for (const mineState of state.mines) {
        // Track arming mines for client-side tracking (no effects during arming)
        if (
          mineState.arming &&
          !mineState.exploded &&
          !this.clientArmingMines.has(mineState.id)
        ) {
          this.clientArmingMines.add(mineState.id);
          // No warning explosion - only the actual explosion
          SettingsManager.triggerHaptic("light");
        }

        if (mineState.exploded && !this.clientExplodedMines.has(mineState.id)) {
          // Mine just exploded - trigger effect on client
          this.clientExplodedMines.add(mineState.id);
          this.renderer.spawnMineExplosion(
            mineState.x,
            mineState.y,
            GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS,
          );
          SettingsManager.triggerHaptic("heavy");
        }
      }

      // Clean up old mine IDs that no longer exist
      const currentMineIds = new Set(state.mines.map((m) => m.id));
      for (const mineId of this.clientArmingMines) {
        if (!currentMineIds.has(mineId)) {
          this.clientArmingMines.delete(mineId);
        }
      }
      for (const mineId of this.clientExplodedMines) {
        if (!currentMineIds.has(mineId)) {
          this.clientExplodedMines.delete(mineId);
        }
      }
    }

    this.networkMines = state.mines;
    this.networkTurret = state.turret ?? null;
    this.networkTurretBullets = state.turretBullets || [];
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

    // Feed smoothers with new snapshot data
    this.shipSmoother.applySnapshot(state.ships, (s) => s.playerId);
    this.projectileSmoother.applySnapshot(state.projectiles, (p) => p.id);
    this.asteroidSmoother.applySnapshot(state.asteroids, (a) => a.id);
    this.pilotSmoother.applySnapshot(state.pilots, (p) => p.playerId);
    this.missileSmoother.applySnapshot(state.homingMissiles || [], (m) => m.id);
  }

  private trackSnapshotTiming(receivedAt: number): void {
    if (this.lastSnapshotReceivedAtMs > 0) {
      const interval = receivedAt - this.lastSnapshotReceivedAtMs;
      this.snapshotIntervalMs = interval;
      this.lastSnapshotAgeMs = interval;
      const jitterSample = Math.abs(interval - GAME_CONFIG.SYNC_INTERVAL);
      this.snapshotJitterMs = this.snapshotJitterMs * 0.9 + jitterSample * 0.1;
    }
    this.lastSnapshotReceivedAtMs = receivedAt;
  }

  private syncPlayerStatesFromNetwork(): void {
    if (this.network.isHost()) return;

    const now = performance.now();
    if (now - this.lastPlayerStateSyncMs < 200) return;
    this.lastPlayerStateSyncMs = now;

    let changed = false;
    for (const [playerId, player] of this.playerMgr.players) {
      const netPlayer = this.network.getPlayer(playerId);
      if (!netPlayer) continue;

      const kills = netPlayer.getState("kills") as number | undefined;
      if (Number.isFinite(kills) && kills !== player.kills) {
        player.kills = kills as number;
        changed = true;
      }

      const wins = netPlayer.getState("roundWins") as number | undefined;
      if (Number.isFinite(wins) && wins !== player.roundWins) {
        player.roundWins = wins as number;
        changed = true;
      }

      const state = netPlayer.getState("playerState") as
        | "ACTIVE"
        | "EJECTED"
        | "SPECTATING"
        | undefined;
      if (state && state !== player.state) {
        player.state = state;
        changed = true;
      }

      const name = this.network.getPlayerName(playerId);
      if (name && name !== player.name) {
        player.name = name;
        changed = true;
      }

      const color = this.network.getPlayerColor(playerId);
      if (color.primary !== player.color.primary) {
        player.color = color;
        changed = true;
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
    this.renderer.clear();
    this.renderer.beginFrame();

    this.renderer.drawStars();
    this.renderer.drawArenaBorder(this.getMapTheme().border);

    // Draw map features (yellow blocks, center holes, overlay boxes, etc.)
    this.renderMapFeatures();

    if (this.flowMgr.phase === "PLAYING" || this.flowMgr.phase === "GAME_END") {
      const isHost = this.network.isHost();
      // Non-host: apply display smoothing (velocity extrapolation + blend)
      let renderShips: ShipState[];
      let renderPilots: PilotState[];
      let renderProjectiles: ProjectileState[];
      let renderAsteroids: AsteroidState[];
      let renderHomingMissiles: HomingMissileState[];
      if (!isHost) {
        const dtMs = dt * 1000;
        this.shipSmoother.update(dtMs);
        this.projectileSmoother.update(dtMs);
        this.asteroidSmoother.update(dtMs);
        this.pilotSmoother.update(dtMs);
        this.missileSmoother.update(dtMs);

        renderShips = this.shipSmoother.smooth(
          this.networkShips,
          (s) => s.playerId,
        );
        renderPilots = this.pilotSmoother.smooth(
          this.networkPilots,
          (p) => p.playerId,
        );
        renderProjectiles = this.projectileSmoother.smooth(
          this.networkProjectiles,
          (p) => p.id,
        );
        renderAsteroids = this.asteroidSmoother.smooth(
          this.networkAsteroids,
          (a) => a.id,
        );
        renderHomingMissiles = this.missileSmoother.smooth(
          this.networkHomingMissiles,
          (m) => m.id,
        );
      } else {
        renderShips = this.networkShips;
        renderPilots = this.networkPilots;
        renderProjectiles = this.networkProjectiles;
        renderAsteroids = this.networkAsteroids;
        renderHomingMissiles = this.networkHomingMissiles;
      }
      const renderPowerUps = this.networkPowerUps;
      const renderLaserBeams = this.networkLaserBeams;
      const renderMines = this.networkMines;
      const renderTurret = this.networkTurret;
      const renderTurretBullets = this.networkTurretBullets;

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
        renderShips.forEach((state) => {
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
        renderPilots.forEach((state) => {
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
        renderProjectiles.forEach((state) => {
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
        renderAsteroids.forEach((state) => {
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
        renderPowerUps.forEach((state) => {
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
        renderLaserBeams.forEach((state) => {
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
        renderMines.forEach((state) => {
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
        renderHomingMissiles.forEach((state) => {
          if (state.alive) {
            this.renderer.drawHomingMissile(state);
          }
        });
      }

      // Draw turret
      if (isHost) {
        if (this.turret) {
          this.renderer.drawTurret(this.turret.getState());
        }
      } else {
        if (renderTurret) {
          this.renderer.drawTurret(renderTurret);
        }
      }

      // Draw turret bullets
      if (isHost) {
        this.turretBullets.forEach((bullet) => {
          if (bullet.alive) {
            this.renderer.drawTurretBullet(bullet.getState());
          }
        });
      } else {
        renderTurretBullets.forEach((state) => {
          if (state.alive) {
            this.renderer.drawTurretBullet(state);
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
          renderHomingMissiles.forEach((state) => {
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
          renderMines.forEach((state) => {
            if (state.alive && !state.exploded) {
              this.renderer.drawMineDetectionRadius(
                state.x,
                state.y,
                mineDetectionRadius,
              );
            }
          });
        }

        // Draw turret detection radius
        if (isHost) {
          if (this.turret) {
            this.renderer.drawTurretDetectionRadius(
              this.turret.body.position.x,
              this.turret.body.position.y,
              this.turret.getDetectionRadius(),
            );
          }
        } else {
          if (renderTurret) {
            this.renderer.drawTurretDetectionRadius(
              renderTurret.x,
              renderTurret.y,
              renderTurret.detectionRadius,
            );
          }
        }

        // Draw turret bullet explosion radius
        if (isHost) {
          this.turretBullets.forEach((bullet) => {
            if (bullet.alive && !bullet.exploded) {
              this.renderer.drawTurretBulletRadius(
                bullet.body.position.x,
                bullet.body.position.y,
                bullet.getExplosionRadius(),
              );
            }
          });
        } else {
          renderTurretBullets.forEach((state) => {
            if (state.alive && !state.exploded) {
              this.renderer.drawTurretBulletRadius(
                state.x,
                state.y,
                100, // Explosion radius
              );
            }
          });
        }

        // Draw power-up magnetic radius
        if (isHost) {
          this.powerUps.forEach((powerUp) => {
            if (powerUp.alive) {
              this.renderer.drawPowerUpMagneticRadius(
                powerUp.body.position.x,
                powerUp.body.position.y,
                powerUp.getMagneticRadius(),
                powerUp.getIsMagneticActive(),
              );
            }
          });
        } else {
          renderPowerUps.forEach((state) => {
            if (state.alive) {
              this.renderer.drawPowerUpMagneticRadius(
                state.x,
                state.y,
                state.magneticRadius || 150,
                state.isMagneticActive || false,
              );
            }
          });
        }
      }

      this.renderer.drawParticles();
    }

    this.renderOverlayBoxes();

    if (this.flowMgr.phase === "COUNTDOWN" && this.flowMgr.countdown > 0) {
      this.renderer.drawCountdown(this.flowMgr.countdown);
    } else if (
      this.flowMgr.phase === "COUNTDOWN" &&
      this.flowMgr.countdown === 0
    ) {
      this.renderer.drawCountdown(0);
    }

    this.renderer.endFrame();
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
    this.botMgr.resetLocalState();
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
