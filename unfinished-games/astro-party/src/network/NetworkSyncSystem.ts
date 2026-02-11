import { DisplaySmoother } from "./DisplaySmoother";
import { Renderer } from "../systems/Renderer";
import { NetworkManager } from "./NetworkManager";
import { PlayerManager } from "../managers/PlayerManager";
import { SettingsManager } from "../SettingsManager";
import {
  GAME_CONFIG,
  GameStateSync,
  PlayerPowerUp,
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
  TurretState,
  TurretBulletState,
} from "../types";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Projectile } from "../entities/Projectile";
import { Asteroid } from "../entities/Asteroid";
import { PowerUp } from "../entities/PowerUp";
import { LaserBeam } from "../entities/LaserBeam";
import { Mine } from "../entities/Mine";
import { HomingMissile } from "../entities/HomingMissile";
import { Turret } from "../entities/Turret";
import { TurretBullet } from "../entities/TurretBullet";

export interface BroadcastStateInput {
  ships: Map<string, Ship>;
  pilots: Map<string, Pilot>;
  projectiles: Projectile[];
  asteroids: Asteroid[];
  powerUps: PowerUp[];
  laserBeams: LaserBeam[];
  mines: Mine[];
  homingMissiles: HomingMissile[];
  turret: Turret | null;
  turretBullets: TurretBullet[];
  playerPowerUps: Map<string, PlayerPowerUp | null>;
  rotationDirection: number;
  screenShakeIntensity: number;
  screenShakeDuration: number;
}

export interface RenderNetworkState {
  networkShips: ShipState[];
  networkPilots: PilotState[];
  networkProjectiles: ProjectileState[];
  networkAsteroids: AsteroidState[];
  networkPowerUps: PowerUpState[];
  networkLaserBeams: LaserBeamState[];
  networkMines: MineState[];
  networkHomingMissiles: HomingMissileState[];
  networkTurret: TurretState | null;
  networkTurretBullets: TurretBulletState[];
  shipSmoother: DisplaySmoother;
  projectileSmoother: DisplaySmoother;
  asteroidSmoother: DisplaySmoother;
  pilotSmoother: DisplaySmoother;
  missileSmoother: DisplaySmoother;
}

export class NetworkSyncSystem {
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
  private lastPowerUpSyncTime: number = 0;

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

  private clientArmingMines: Set<string> = new Set();
  private clientExplodedMines: Set<string> = new Set();
  private clientShipPositions: Map<
    string,
    { x: number; y: number; color: string }
  > = new Map();

  constructor(
    private network: NetworkManager,
    private renderer: Renderer,
    private playerMgr: PlayerManager,
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private onPlayersUpdate: () => void,
  ) {}

  getRenderState(): RenderNetworkState {
    return {
      networkShips: this.networkShips,
      networkPilots: this.networkPilots,
      networkProjectiles: this.networkProjectiles,
      networkAsteroids: this.networkAsteroids,
      networkPowerUps: this.networkPowerUps,
      networkLaserBeams: this.networkLaserBeams,
      networkMines: this.networkMines,
      networkHomingMissiles: this.networkHomingMissiles,
      networkTurret: this.networkTurret,
      networkTurretBullets: this.networkTurretBullets,
      shipSmoother: this.shipSmoother,
      projectileSmoother: this.projectileSmoother,
      asteroidSmoother: this.asteroidSmoother,
      pilotSmoother: this.pilotSmoother,
      missileSmoother: this.missileSmoother,
    };
  }

  getSnapshotTelemetry(): {
    jitterMs: number;
    snapshotAgeMs: number;
    snapshotIntervalMs: number;
  } {
    return {
      jitterMs: this.snapshotJitterMs,
      snapshotAgeMs: this.lastSnapshotAgeMs,
      snapshotIntervalMs: this.snapshotIntervalMs,
    };
  }

  broadcastState(input: BroadcastStateInput, nowMs: number): void {
    const now = performance.now();

    let playerPowerUpsRecord: Record<string, PlayerPowerUp | null> | undefined;
    if (now - this.lastPowerUpSyncTime >= 200) {
      this.lastPowerUpSyncTime = now;
      playerPowerUpsRecord = {};
      input.playerPowerUps.forEach((powerUp, playerId) => {
        playerPowerUpsRecord![playerId] = powerUp;
      });
    }

    const state: GameStateSync = {
      ships: [...input.ships.values()].map((s) => s.getState()),
      pilots: [...input.pilots.values()].map((p) => p.getState(nowMs)),
      projectiles: input.projectiles.map((p) => p.getState()),
      asteroids: input.asteroids.map((a) => a.getState()),
      powerUps: input.powerUps.map((p) => p.getState(nowMs)),
      laserBeams: input.laserBeams.map((b) => b.getState()),
      mines: input.mines.map((m) => m.getState()),
      homingMissiles: input.homingMissiles.map((m) => m.getState()),
      turret: input.turret?.getState(),
      turretBullets: input.turretBullets.map((b) => b.getState()),
      playerPowerUps: playerPowerUpsRecord,
      rotationDirection: input.rotationDirection,
      screenShakeIntensity: input.screenShakeIntensity,
      screenShakeDuration: input.screenShakeDuration,
    };

    this.network.broadcastGameState(state);
  }

  applyNetworkState(state: GameStateSync): void {
    const receivedAt = performance.now();
    this.trackSnapshotTiming(receivedAt);
    this.syncPlayerStatesFromNetwork();

    const currentShipIds = new Set(state.ships.map((s) => s.playerId));
    for (const [playerId, shipData] of this.clientShipPositions) {
      if (!currentShipIds.has(playerId)) {
        this.renderer.spawnExplosion(shipData.x, shipData.y, shipData.color);
        this.renderer.spawnShipDebris(shipData.x, shipData.y, shipData.color);
        this.clientShipPositions.delete(playerId);
      }
    }

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
    this.networkTurret = state.turret ?? null;
    this.networkTurretBullets = state.turretBullets || [];

    if (state.mines) {
      for (const mineState of state.mines) {
        if (
          mineState.arming &&
          !mineState.exploded &&
          !this.clientArmingMines.has(mineState.id)
        ) {
          this.clientArmingMines.add(mineState.id);
          this.renderer.spawnExplosion(mineState.x, mineState.y, "#ff4400");
          SettingsManager.triggerHaptic("medium");
        }

        if (mineState.exploded && !this.clientExplodedMines.has(mineState.id)) {
          this.clientExplodedMines.add(mineState.id);
          this.renderer.spawnMineExplosion(
            mineState.x,
            mineState.y,
            GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS,
          );
          SettingsManager.triggerHaptic("heavy");
        }
      }

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
    this.networkRotationDirection = state.rotationDirection ?? 1;

    if (!this.network.isHost()) {
      this.renderer.addScreenShake(
        state.screenShakeIntensity ?? 0,
        state.screenShakeDuration ?? 0,
      );
    }

    if (state.playerPowerUps) {
      const activePowerUpIds = new Set(Object.keys(state.playerPowerUps));

      for (const playerId of this.playerPowerUps.keys()) {
        if (!activePowerUpIds.has(playerId)) {
          this.playerPowerUps.delete(playerId);
        }
      }

      Object.entries(state.playerPowerUps).forEach(([playerId, powerUp]) => {
        this.playerPowerUps.set(playerId, powerUp);
      });
    }

    this.shipSmoother.applySnapshot(state.ships, (s) => s.playerId);
    this.projectileSmoother.applySnapshot(state.projectiles, (p) => p.id);
    this.asteroidSmoother.applySnapshot(state.asteroids, (a) => a.id);
    this.pilotSmoother.applySnapshot(state.pilots, (p) => p.playerId);
    this.missileSmoother.applySnapshot(state.homingMissiles || [], (m) => m.id);
  }

  clear(): void {
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
    this.networkRotationDirection = 1;

    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();

    this.shipSmoother.clear();
    this.projectileSmoother.clear();
    this.asteroidSmoother.clear();
    this.pilotSmoother.clear();
    this.missileSmoother.clear();

    this.snapshotJitterMs = 0;
    this.snapshotIntervalMs = 0;
    this.lastSnapshotReceivedAtMs = 0;
    this.lastSnapshotAgeMs = 0;
    this.lastPlayerStateSyncMs = 0;
    this.lastPowerUpSyncTime = 0;
  }

  clearClientTracking(): void {
    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();
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
      }
    }

    if (changed) {
      this.onPlayersUpdate();
    }
  }
}
