import { DisplaySmoother } from "./DisplaySmoother";
import { Renderer } from "../systems/Renderer";
import { NetworkManager } from "./NetworkManager";
import { PlayerManager } from "../managers/PlayerManager";
import { SettingsManager } from "../SettingsManager";
import {
  GAME_CONFIG,
  GameStateSync,
  PlayerInput,
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
import { GameConfig } from "../GameConfig";
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

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpAngle = (a: number, b: number, t: number): number => {
  const twoPi = Math.PI * 2;
  let diff = (b - a) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return a + diff * t;
};

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
  hostTick: number;
  tickDurationMs: number;
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
  useBufferedInterpolation: boolean;
}

export class NetworkSyncSystem {
  private static readonly DEFAULT_TICK_MS = 1000 / 60;
  private static readonly MIN_REMOTE_DELAY_TICKS = 6;
  private static readonly MAX_REMOTE_DELAY_TICKS = 120;
  private static readonly SNAPSHOT_HISTORY_LIMIT = 360;
  private static readonly DELAY_SMOOTHING_STEP_PER_FRAME = 0.5;
  private static readonly LATENCY_EWMA_ALPHA = 0.1;
  private static readonly LOCAL_PREDICTION_HISTORY_TICKS = 720;
  private static readonly LOCAL_PRESENTATION_BLEND = 0.35;
  private static readonly LOCAL_SNAP_DISTANCE = 160;

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
  private snapshotHistory: Array<{
    state: GameStateSync;
    receivedAtMs: number;
  }> = [];
  private smoothedLatencyMs: number = 0;
  private currentRemoteDelayTicks: number =
    NetworkSyncSystem.MIN_REMOTE_DELAY_TICKS;
  private lastAppliedHostTick: number = -1;
  private localInputState: PlayerInput = {
    buttonA: false,
    buttonB: false,
    timestamp: 0,
    clientTimeMs: 0,
  };
  private localPredictedTick: number | null = null;
  private localPredictedShipState: ShipState | null = null;
  private localPresentationShipState: ShipState | null = null;
  private localInputHistoryByTick: Map<number, PlayerInput> = new Map();
  private localStateHistoryByTick: Map<number, ShipState> = new Map();

  constructor(
    private network: NetworkManager,
    private renderer: Renderer,
    private playerMgr: PlayerManager,
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private onPlayersUpdate: () => void,
  ) {}

  setLocalInput(input: PlayerInput): void {
    this.localInputState = input;
  }

  getRenderState(
    myPlayerId: string | null = null,
    latencyMs: number = 0,
  ): RenderNetworkState {
    const bufferedSnapshot = this.buildBufferedRenderState(myPlayerId, latencyMs);
    const baseShips = bufferedSnapshot ? bufferedSnapshot.ships : this.networkShips;
    const renderShips = this.applyPredictedLocalShip(baseShips, myPlayerId);
    if (bufferedSnapshot) {
      return {
        networkShips: renderShips,
        networkPilots: bufferedSnapshot.pilots,
        networkProjectiles: bufferedSnapshot.projectiles,
        networkAsteroids: bufferedSnapshot.asteroids,
        networkPowerUps: bufferedSnapshot.powerUps,
        networkLaserBeams: bufferedSnapshot.laserBeams,
        networkMines: bufferedSnapshot.mines,
        networkHomingMissiles: bufferedSnapshot.homingMissiles,
        networkTurret: bufferedSnapshot.turret ?? null,
        networkTurretBullets: bufferedSnapshot.turretBullets,
        shipSmoother: this.shipSmoother,
        projectileSmoother: this.projectileSmoother,
        asteroidSmoother: this.asteroidSmoother,
        pilotSmoother: this.pilotSmoother,
        missileSmoother: this.missileSmoother,
        useBufferedInterpolation: true,
      };
    }

    return {
      networkShips: renderShips,
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
      useBufferedInterpolation: false,
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
      hostTick: input.hostTick,
      tickDurationMs: input.tickDurationMs,
    };

    this.network.broadcastGameState(state);
  }

  applyNetworkState(state: GameStateSync): void {
    const normalizedHostTick = Number.isFinite(state.hostTick)
      ? Math.floor(state.hostTick)
      : this.lastAppliedHostTick + 1;
    const normalizedTickDurationMs =
      Number.isFinite(state.tickDurationMs) && state.tickDurationMs > 0
        ? state.tickDurationMs
        : NetworkSyncSystem.DEFAULT_TICK_MS;

    if (normalizedHostTick <= this.lastAppliedHostTick) {
      return;
    }
    this.lastAppliedHostTick = normalizedHostTick;
    state.hostTick = normalizedHostTick;
    state.tickDurationMs = normalizedTickDurationMs;

    const receivedAt = performance.now();
    this.trackSnapshotTiming(receivedAt);
    this.appendSnapshot(state, receivedAt);
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
    this.reconcileLocalPrediction(state);

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
    this.snapshotHistory = [];
    this.smoothedLatencyMs = 0;
    this.currentRemoteDelayTicks = NetworkSyncSystem.MIN_REMOTE_DELAY_TICKS;
    this.lastAppliedHostTick = -1;
    this.localPredictedTick = null;
    this.localPredictedShipState = null;
    this.localPresentationShipState = null;
    this.localInputHistoryByTick.clear();
    this.localStateHistoryByTick.clear();
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

  private appendSnapshot(state: GameStateSync, receivedAtMs: number): void {
    const previous = this.snapshotHistory[this.snapshotHistory.length - 1];
    const fallbackTick = previous ? previous.state.hostTick + 1 : 0;
    const normalizedState: GameStateSync = {
      ...state,
      hostTick: Number.isFinite(state.hostTick) ? state.hostTick : fallbackTick,
      tickDurationMs:
        Number.isFinite(state.tickDurationMs) && state.tickDurationMs > 0
          ? state.tickDurationMs
          : NetworkSyncSystem.DEFAULT_TICK_MS,
    };

    // Unreliable transport can deliver old snapshots late. Reject them so
    // interpolation never moves backward in host tick.
    if (previous && normalizedState.hostTick <= previous.state.hostTick) {
      return;
    }

    this.snapshotHistory.push({ state: normalizedState, receivedAtMs });
    if (
      this.snapshotHistory.length > NetworkSyncSystem.SNAPSHOT_HISTORY_LIMIT
    ) {
      this.snapshotHistory.shift();
    }
  }

  private buildBufferedRenderState(
    myPlayerId: string | null,
    latencyMs: number,
  ): GameStateSync | null {
    if (this.network.isHost()) return null;
    if (this.snapshotHistory.length < 2) return null;

    const now = performance.now();
    const hostNowTick = this.estimateHostNowTick(now);
    if (hostNowTick === null) return null;

    const remoteDelayTicks = this.getStableRemoteDelayTicks(latencyMs);

    const remoteSnapshot = this.sampleSnapshotAtTick(
      hostNowTick - remoteDelayTicks,
    );
    if (!remoteSnapshot) return null;

    void myPlayerId;
    return remoteSnapshot;
  }

  private estimateHostNowTick(nowMs: number): number | null {
    if (this.snapshotHistory.length === 0) return null;
    const latest = this.snapshotHistory[this.snapshotHistory.length - 1];
    const tickMs =
      latest.state.tickDurationMs || NetworkSyncSystem.DEFAULT_TICK_MS;
    const elapsedTicks = (nowMs - latest.receivedAtMs) / tickMs;
    return latest.state.hostTick + Math.max(0, elapsedTicks);
  }

  private getTargetRemoteDelayTicks(latencyMs: number): number {
    const tickMs = this.getTickDurationEstimate();
    const measuredLatency = Math.max(0, latencyMs);
    if (this.smoothedLatencyMs <= 0) {
      this.smoothedLatencyMs = measuredLatency;
    } else {
      this.smoothedLatencyMs =
        this.smoothedLatencyMs * (1 - NetworkSyncSystem.LATENCY_EWMA_ALPHA) +
        measuredLatency * NetworkSyncSystem.LATENCY_EWMA_ALPHA;
    }
    const halfRttTicks = (this.smoothedLatencyMs * 0.5) / tickMs;
    const jitterTicks = this.snapshotJitterMs / tickMs;
    const delay = Math.ceil(halfRttTicks + jitterTicks + 2);
    return Math.max(
      NetworkSyncSystem.MIN_REMOTE_DELAY_TICKS,
      Math.min(NetworkSyncSystem.MAX_REMOTE_DELAY_TICKS, delay),
    );
  }

  private getTickDurationEstimate(): number {
    if (this.snapshotHistory.length === 0) {
      return NetworkSyncSystem.DEFAULT_TICK_MS;
    }

    const latest = this.snapshotHistory[this.snapshotHistory.length - 1];
    return latest.state.tickDurationMs || NetworkSyncSystem.DEFAULT_TICK_MS;
  }

  private stepToward(current: number, target: number): number {
    const diff = target - current;
    if (Math.abs(diff) <= NetworkSyncSystem.DELAY_SMOOTHING_STEP_PER_FRAME) {
      return target;
    }
    return (
      current +
      Math.sign(diff) * NetworkSyncSystem.DELAY_SMOOTHING_STEP_PER_FRAME
    );
  }

  private getStableRemoteDelayTicks(latencyMs: number): number {
    const target = this.getTargetRemoteDelayTicks(latencyMs);
    this.currentRemoteDelayTicks = this.stepToward(
      this.currentRemoteDelayTicks,
      target,
    );
    return this.currentRemoteDelayTicks;
  }

  private sampleSnapshotAtTick(targetTick: number): GameStateSync | null {
    if (this.snapshotHistory.length === 0) return null;

    let older:
      | {
          state: GameStateSync;
          receivedAtMs: number;
        }
      | null = null;
    let newer:
      | {
          state: GameStateSync;
          receivedAtMs: number;
        }
      | null = null;

    for (const snapshot of this.snapshotHistory) {
      if (snapshot.state.hostTick <= targetTick) {
        older = snapshot;
      }
      if (snapshot.state.hostTick >= targetTick) {
        newer = snapshot;
        break;
      }
    }

    if (!older && !newer) return null;
    if (!older && newer) {
      return this.cloneSnapshotState(newer.state);
    }
    if (older && !newer) {
      return this.cloneSnapshotState(older.state);
    }

    if (!older || !newer) return null;

    const olderTick = older.state.hostTick;
    const newerTick = newer.state.hostTick;
    if (newerTick <= olderTick) {
      return this.cloneSnapshotState(newer.state);
    }

    const t = Math.max(0, Math.min(1, (targetTick - olderTick) / (newerTick - olderTick)));
    return this.interpolateSnapshots(older.state, newer.state, targetTick, t);
  }

  private interpolateSnapshots(
    older: GameStateSync,
    newer: GameStateSync,
    targetTick: number,
    t: number,
  ): GameStateSync {
    const result = this.cloneSnapshotState(t < 0.5 ? older : newer);
    result.hostTick = targetTick;
    result.tickDurationMs = newer.tickDurationMs || older.tickDurationMs;

    result.ships = this.interpolateCollection(
      older.ships,
      newer.ships,
      (item) => item.playerId,
      t,
      ["x", "y", "vx", "vy"],
      ["angle"],
    );

    result.pilots = this.interpolateCollection(
      older.pilots,
      newer.pilots,
      (item) => item.playerId,
      t,
      ["x", "y", "vx", "vy", "survivalProgress"],
      ["angle"],
    );

    result.projectiles = this.interpolateCollection(
      older.projectiles,
      newer.projectiles,
      (item) => item.id,
      t,
      ["x", "y", "vx", "vy"],
    );

    result.asteroids = this.interpolateCollection(
      older.asteroids,
      newer.asteroids,
      (item) => item.id,
      t,
      ["x", "y", "vx", "vy", "angularVelocity", "size"],
      ["angle"],
    );

    result.powerUps = this.interpolateCollection(
      older.powerUps,
      newer.powerUps,
      (item) => item.id,
      t,
      ["x", "y", "remainingTimeFraction"],
    );

    result.laserBeams = this.interpolateCollection(
      older.laserBeams,
      newer.laserBeams,
      (item) => item.id,
      t,
      ["x", "y"],
      ["angle"],
    );

    result.mines = this.interpolateCollection(
      older.mines,
      newer.mines,
      (item) => item.id,
      t,
      ["x", "y"],
    );

    result.homingMissiles = this.interpolateCollection(
      older.homingMissiles,
      newer.homingMissiles,
      (item) => item.id,
      t,
      ["x", "y", "vx", "vy"],
      ["angle"],
    );

    result.turretBullets = this.interpolateCollection(
      older.turretBullets,
      newer.turretBullets,
      (item) => item.id,
      t,
      ["x", "y", "vx", "vy"],
      ["angle"],
    );

    if (older.turret && newer.turret) {
      const interpolatedTurret = this.interpolateItem(
        older.turret,
        newer.turret,
        t,
        ["x", "y", "detectionRadius", "orbitRadius"],
        ["angle", "targetAngle"],
      );
      result.turret = interpolatedTurret;
    } else {
      result.turret = t < 0.5 ? older.turret : newer.turret;
    }

    return result;
  }

  private interpolateCollection<T>(
    olderItems: T[],
    newerItems: T[],
    getId: (item: T) => string,
    t: number,
    numericKeys: string[],
    angleKeys: string[] = [],
  ): T[] {
    const olderById = new Map<string, T>();
    for (const item of olderItems) {
      olderById.set(getId(item), item);
    }

    const newerById = new Map<string, T>();
    for (const item of newerItems) {
      newerById.set(getId(item), item);
    }

    const ids = new Set<string>([...olderById.keys(), ...newerById.keys()]);
    const result: T[] = [];

    for (const id of ids) {
      const older = olderById.get(id);
      const newer = newerById.get(id);
      if (older && newer) {
        result.push(this.interpolateItem(older, newer, t, numericKeys, angleKeys));
      } else if (older && t < 0.5) {
        result.push({ ...(older as Record<string, unknown>) } as T);
      } else if (newer) {
        result.push({ ...(newer as Record<string, unknown>) } as T);
      } else if (older) {
        result.push({ ...(older as Record<string, unknown>) } as T);
      }
    }

    return result;
  }

  private interpolateItem<T>(
    older: T,
    newer: T,
    t: number,
    numericKeys: string[],
    angleKeys: string[],
  ): T {
    const result = {
      ...((t < 0.5 ? older : newer) as Record<string, unknown>),
    } as Record<string, unknown>;
    const olderRecord = older as Record<string, unknown>;
    const newerRecord = newer as Record<string, unknown>;

    for (const key of numericKeys) {
      const olderValue = olderRecord[key];
      const newerValue = newerRecord[key];
      if (typeof olderValue === "number" && typeof newerValue === "number") {
        result[key] = lerp(olderValue, newerValue, t);
      }
    }

    for (const key of angleKeys) {
      const olderValue = olderRecord[key];
      const newerValue = newerRecord[key];
      if (typeof olderValue === "number" && typeof newerValue === "number") {
        result[key] = lerpAngle(olderValue, newerValue, t);
      }
    }

    return result as T;
  }

  private cloneSnapshotState(state: GameStateSync): GameStateSync {
    return {
      ships: state.ships.map((ship) => ({ ...ship })),
      pilots: state.pilots.map((pilot) => ({ ...pilot })),
      projectiles: state.projectiles.map((projectile) => ({ ...projectile })),
      asteroids: state.asteroids.map((asteroid) => ({ ...asteroid })),
      powerUps: state.powerUps.map((powerUp) => ({ ...powerUp })),
      laserBeams: state.laserBeams.map((beam) => ({ ...beam })),
      mines: state.mines.map((mine) => ({ ...mine })),
      homingMissiles: state.homingMissiles.map((missile) => ({ ...missile })),
      turret: state.turret ? { ...state.turret } : undefined,
      turretBullets: state.turretBullets.map((bullet) => ({ ...bullet })),
      playerPowerUps: state.playerPowerUps
        ? { ...state.playerPowerUps }
        : undefined,
      rotationDirection: state.rotationDirection,
      screenShakeIntensity: state.screenShakeIntensity,
      screenShakeDuration: state.screenShakeDuration,
      hostTick: state.hostTick,
      tickDurationMs: state.tickDurationMs,
    };
  }

  private applyPredictedLocalShip(
    baseShips: ShipState[],
    myPlayerId: string | null,
  ): ShipState[] {
    if (this.network.isHost() || !myPlayerId) {
      return baseShips;
    }
    if (GameConfig.getMode() !== "STANDARD") {
      return baseShips;
    }

    const predicted = this.getPredictedLocalShip(myPlayerId);
    if (!predicted) {
      return baseShips;
    }

    let found = false;
    const ships = baseShips.map((ship) => {
      if (ship.playerId !== myPlayerId) return ship;
      found = true;
      return { ...predicted };
    });

    if (!found) {
      ships.push({ ...predicted });
    }

    return ships;
  }

  private getPredictedLocalShip(playerId: string): ShipState | null {
    if (this.localPredictedShipState === null || this.localPredictedTick === null) {
      this.initializePredictionFromLatestSnapshot(playerId);
    }
    if (this.localPredictedShipState === null || this.localPredictedTick === null) {
      return null;
    }

    const hostNowTick = this.estimateHostNowTick(performance.now());
    if (hostNowTick === null) {
      return this.localPresentationShipState
        ? { ...this.localPresentationShipState }
        : { ...this.localPredictedShipState };
    }

    const targetTick = Math.max(this.localPredictedTick, Math.floor(hostNowTick));
    this.replayPredictionToTick(targetTick);

    if (!this.localPredictedShipState) return null;
    if (!this.localPresentationShipState) {
      this.localPresentationShipState = { ...this.localPredictedShipState };
    } else {
      const dx = this.localPredictedShipState.x - this.localPresentationShipState.x;
      const dy = this.localPredictedShipState.y - this.localPresentationShipState.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > NetworkSyncSystem.LOCAL_SNAP_DISTANCE) {
        this.localPresentationShipState = { ...this.localPredictedShipState };
      } else if (dist <= 4) {
        this.localPresentationShipState = { ...this.localPredictedShipState };
      } else {
        const t = dist <= 30 ? 0.7 : NetworkSyncSystem.LOCAL_PRESENTATION_BLEND;
        this.localPresentationShipState.x = lerp(
          this.localPresentationShipState.x,
          this.localPredictedShipState.x,
          t,
        );
        this.localPresentationShipState.y = lerp(
          this.localPresentationShipState.y,
          this.localPredictedShipState.y,
          t,
        );
        this.localPresentationShipState.vx = lerp(
          this.localPresentationShipState.vx,
          this.localPredictedShipState.vx,
          t,
        );
        this.localPresentationShipState.vy = lerp(
          this.localPresentationShipState.vy,
          this.localPredictedShipState.vy,
          t,
        );
        this.localPresentationShipState.angle = lerpAngle(
          this.localPresentationShipState.angle,
          this.localPredictedShipState.angle,
          t,
        );
        this.localPresentationShipState.alive = this.localPredictedShipState.alive;
        this.localPresentationShipState.invulnerableUntil =
          this.localPredictedShipState.invulnerableUntil;
        this.localPresentationShipState.ammo = this.localPredictedShipState.ammo;
        this.localPresentationShipState.maxAmmo =
          this.localPredictedShipState.maxAmmo;
        this.localPresentationShipState.lastShotTime =
          this.localPredictedShipState.lastShotTime;
        this.localPresentationShipState.reloadStartTime =
          this.localPredictedShipState.reloadStartTime;
        this.localPresentationShipState.isReloading =
          this.localPredictedShipState.isReloading;
      }
    }

    return this.localPresentationShipState
      ? { ...this.localPresentationShipState }
      : { ...this.localPredictedShipState };
  }

  private initializePredictionFromLatestSnapshot(playerId: string): void {
    const latest = this.snapshotHistory[this.snapshotHistory.length - 1];
    if (!latest) return;
    const hostShip = latest.state.ships.find((ship) => ship.playerId === playerId);
    if (!hostShip) return;
    const tick = Math.floor(latest.state.hostTick);
    this.localPredictedTick = tick;
    this.localPredictedShipState = { ...hostShip };
    this.localPresentationShipState = { ...hostShip };
    this.localStateHistoryByTick.set(tick, { ...hostShip });
    this.pruneLocalPredictionHistory(tick);
  }

  private reconcileLocalPrediction(state: GameStateSync): void {
    if (this.network.isHost()) return;
    if (GameConfig.getMode() !== "STANDARD") {
      this.localPredictedTick = null;
      this.localPredictedShipState = null;
      this.localPresentationShipState = null;
      this.localInputHistoryByTick.clear();
      this.localStateHistoryByTick.clear();
      return;
    }

    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;
    const hostShip = state.ships.find((ship) => ship.playerId === myPlayerId);
    if (!hostShip) {
      this.localPredictedTick = null;
      this.localPredictedShipState = null;
      this.localPresentationShipState = null;
      this.localInputHistoryByTick.clear();
      this.localStateHistoryByTick.clear();
      return;
    }

    const snapshotTick = Math.floor(state.hostTick);
    const replayTarget = Math.max(
      snapshotTick,
      this.localPredictedTick ?? snapshotTick,
    );

    this.localPredictedTick = snapshotTick;
    this.localPredictedShipState = { ...hostShip };
    this.localStateHistoryByTick.clear();
    this.localStateHistoryByTick.set(snapshotTick, { ...hostShip });

    this.replayPredictionToTick(replayTarget);
    this.pruneLocalPredictionHistory(replayTarget);
  }

  private replayPredictionToTick(targetTick: number): void {
    if (this.localPredictedShipState === null || this.localPredictedTick === null) {
      return;
    }
    const cfg = GameConfig.config;
    const tickMs = this.getTickDurationEstimate();

    for (let tick = this.localPredictedTick + 1; tick <= targetTick; tick++) {
      const input =
        this.localInputHistoryByTick.get(tick) ?? this.cloneInput(this.localInputState);
      if (!this.localInputHistoryByTick.has(tick)) {
        this.localInputHistoryByTick.set(tick, this.cloneInput(input));
      }
      this.localPredictedShipState = this.simulateStandardPredictionStep(
        this.localPredictedShipState,
        input,
        tickMs,
        cfg,
      );
      this.localPredictedTick = tick;
      this.localStateHistoryByTick.set(tick, { ...this.localPredictedShipState });
    }
  }

  private simulateStandardPredictionStep(
    state: ShipState,
    input: PlayerInput,
    dtMs: number,
    cfg: typeof GameConfig.config,
  ): ShipState {
    if (!state.alive) return { ...state };

    const dtSec = dtMs / 1000;
    const dtTicks = dtMs / NetworkSyncSystem.DEFAULT_TICK_MS;
    const rotationDirection = this.networkRotationDirection || 1;
    let angle = state.angle;
    if (input.buttonA) {
      angle += cfg.ROTATION_SPEED * dtSec * rotationDirection;
    }

    const powerUp = this.playerPowerUps.get(state.playerId);
    const speedMultiplier = powerUp?.type === "JOUST" ? 1.4 : 1;
    const targetSpeed = Math.max(0, cfg.SHIP_TARGET_SPEED * speedMultiplier);
    const desiredVx = Math.cos(angle) * targetSpeed;
    const desiredVy = Math.sin(angle) * targetSpeed;
    const response = cfg.SHIP_SPEED_RESPONSE;
    const t = 1 - Math.exp(-response * dtSec);
    let vx = state.vx + (desiredVx - state.vx) * t;
    let vy = state.vy + (desiredVy - state.vy) * t;
    let x = state.x + vx * dtTicks;
    let y = state.y + vy * dtTicks;

    const shipRadius = 15;
    const width = GAME_CONFIG.ARENA_WIDTH;
    const height = GAME_CONFIG.ARENA_HEIGHT;
    const minX = shipRadius;
    const maxX = width - shipRadius;
    const minY = shipRadius;
    const maxY = height - shipRadius;

    if (x < minX) {
      x = minX;
      if (vx < 0) vx = 0;
    } else if (x > maxX) {
      x = maxX;
      if (vx > 0) vx = 0;
    }

    if (y < minY) {
      y = minY;
      if (vy < 0) vy = 0;
    } else if (y > maxY) {
      y = maxY;
      if (vy > 0) vy = 0;
    }

    return {
      ...state,
      x,
      y,
      vx,
      vy,
      angle,
    };
  }

  private pruneLocalPredictionHistory(currentTick: number): void {
    const keepFrom =
      currentTick - NetworkSyncSystem.LOCAL_PREDICTION_HISTORY_TICKS;
    for (const tick of this.localInputHistoryByTick.keys()) {
      if (tick < keepFrom) {
        this.localInputHistoryByTick.delete(tick);
      }
    }
    for (const tick of this.localStateHistoryByTick.keys()) {
      if (tick < keepFrom) {
        this.localStateHistoryByTick.delete(tick);
      }
    }
  }

  private cloneInput(input: PlayerInput): PlayerInput {
    return {
      buttonA: input.buttonA,
      buttonB: input.buttonB,
      timestamp: input.timestamp,
      clientTimeMs: input.clientTimeMs,
    };
  }

}
