import { DisplaySmoother } from "./DisplaySmoother";
import Matter from "matter-js";
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
import { Physics } from "../systems/Physics";

const { Body } = Matter;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpAngle = (a: number, b: number, t: number): number => {
  const twoPi = Math.PI * 2;
  let diff = (b - a) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return a + diff * t;
};

interface LocalPredictionRuntime {
  dashTimerSec: number;
  recoilTimerSec: number;
}

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

export interface NetworkPredictionDebugTelemetry {
  predictionErrorPxLast: number;
  predictionErrorPxEwma: number;
  presentationLagPxLast: number;
  presentationLagPxEwma: number;
  wallCorrectionEvents: number;
  wallOscillationEvents: number;
  wallOscillationRatio: number;
  hostNowBiasTicks: number | null;
  hostNowBiasMs: number | null;
  estimatedHostNowTick: number | null;
  latestSnapshotTick: number | null;
  capturedInputTick: number | null;
  latestHostAckTick: number | null;
  inputAckGapTicks: number | null;
  inputAckGapMs: number | null;
}

export class NetworkSyncSystem {
  private static readonly DEFAULT_TICK_MS = 1000 / 60;
  private static readonly MIN_REMOTE_DELAY_TICKS = 6;
  private static readonly MAX_REMOTE_DELAY_TICKS = 120;
  private static readonly MAX_LOCAL_LEAD_TICKS = 24;
  private static readonly MAX_PREDICTION_REPLAY_TICKS_PER_FRAME = 4;
  // FIX BUG R2: Increased thresholds to reduce unnecessary corrections
  // Position: 8px → 16px (allow more tolerance for wall bounce rounding)
  private static readonly LOCAL_RECONCILE_POSITION_EPSILON = 16;
  // Angle: 0.08 rad (4.6°) → 0.15 rad (8.6°) (allow more rotation variance)
  private static readonly LOCAL_RECONCILE_ANGLE_EPSILON = 0.15;
  // Velocity: 1.5 px/frame → 3.0 px/frame (allow more speed variance)
  private static readonly LOCAL_RECONCILE_VELOCITY_EPSILON = 3.0;
  private static readonly LOCAL_CORRECTION_BLEND = 0.35;
  private static readonly LOCAL_CORRECTION_SNAP_DISTANCE = 120;
  private static readonly SNAPSHOT_HISTORY_LIMIT = 360;
  private static readonly DELAY_SMOOTHING_STEP_PER_FRAME = 0.5;
  private static readonly LATENCY_EWMA_ALPHA = 0.1;
  private static readonly LOCAL_PREDICTION_HISTORY_TICKS = 720;
  private static readonly DEBUG_EWMA_ALPHA = 0.2;
  // FIX BUG W2: Increased wall proximity margin from 24px → 40px
  // Ship radius is ~15px, so 40px gives more early detection
  private static readonly WALL_PROXIMITY_MARGIN = 40;

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
  private localPreviousPredictedShipState: ShipState | null = null; // Track for correction detection
  private localPredictionPhysics: Physics | null = null;
  private localPredictionShipBody: Matter.Body | null = null;
  private localPredictionPlayerId: string | null = null;
  private localPredictedRuntime: LocalPredictionRuntime = {
    dashTimerSec: 0,
    recoilTimerSec: 0,
  };
  private localPresentationShipState: ShipState | null = null;
  private localInputHistoryByTick: Map<number, PlayerInput> = new Map();
  private localStateHistoryByTick: Map<number, ShipState> = new Map();
  private localRuntimeHistoryByTick: Map<number, LocalPredictionRuntime> =
    new Map();
  private localDashTicks: Set<number> = new Set();
  private localInputCaptureCursorTick: number | null = null;
  private lastMeasuredLatencyMs: number = 0;
  private predictionErrorPxLast: number = 0;
  private predictionErrorPxEwma: number = 0;
  private presentationLagPxLast: number = 0;
  private presentationLagPxEwma: number = 0;
  private wallCorrectionEvents: number = 0;
  private wallOscillationEvents: number = 0;
  private lastWallCorrectionAxis: "x" | "y" | null = null;
  private lastWallCorrectionSign: number = 0;
  private lastCapturedInputTick: number | null = null;
  private latestHostAckTick: number | null = null;

  constructor(
    private network: NetworkManager,
    private renderer: Renderer,
    private playerMgr: PlayerManager,
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private onPlayersUpdate: () => void,
  ) {}

  setLocalInput(input: PlayerInput): void {
    this.localInputState = input;
    const captureTick = this.captureInputForPredictedTicks(input);
    if (captureTick !== null) {
      this.lastCapturedInputTick = captureTick;
    }
  }

  queueLocalDashPrediction(): void {
    if (this.network.isHost()) return;
    const hostNowTick = this.estimateHostNowTickForLocal(performance.now());
    if (hostNowTick === null) return;
    const dashTick = Math.max(0, Math.floor(hostNowTick) + 1);
    this.localDashTicks.add(dashTick);
  }

  getRenderState(
    myPlayerId: string | null = null,
    latencyMs: number = 0,
  ): RenderNetworkState {
    if (Number.isFinite(latencyMs) && latencyMs >= 0) {
      this.lastMeasuredLatencyMs = latencyMs;
    }
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
    this.resetLocalPredictionState();
    this.resetDebugTelemetry();
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

  // FIX BUG T1: Separate local vs remote tick estimation
  // For local prediction: no half-RTT compensation (predict at actual host time, not ahead)
  private estimateHostNowTickForLocal(nowMs: number): number | null {
    if (this.snapshotHistory.length === 0) return null;
    const latest = this.snapshotHistory[this.snapshotHistory.length - 1];
    const tickMs =
      latest.state.tickDurationMs || NetworkSyncSystem.DEFAULT_TICK_MS;
    const elapsedTicks = (nowMs - latest.receivedAtMs) / tickMs;
    // No half-RTT added for local prediction
    return latest.state.hostTick + Math.max(0, elapsedTicks);
  }

  // For remote rendering: add half-RTT compensation (smooths remote entity display)
  private estimateHostNowTick(nowMs: number): number | null {
    if (this.snapshotHistory.length === 0) return null;
    const latest = this.snapshotHistory[this.snapshotHistory.length - 1];
    const tickMs =
      latest.state.tickDurationMs || NetworkSyncSystem.DEFAULT_TICK_MS;
    const elapsedTicks = (nowMs - latest.receivedAtMs) / tickMs;
    const latencyMs =
      this.smoothedLatencyMs > 0 ? this.smoothedLatencyMs : this.lastMeasuredLatencyMs;
    const halfRttTicks = Math.max(0, (latencyMs * 0.5) / tickMs);
    const boundedHalfRttTicks = Math.min(
      NetworkSyncSystem.MAX_LOCAL_LEAD_TICKS,
      halfRttTicks,
    );
    return latest.state.hostTick + Math.max(0, elapsedTicks) + boundedHalfRttTicks;
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

  getPredictionDebugTelemetry(): NetworkPredictionDebugTelemetry {
    const nowMs = performance.now();
    const latest = this.snapshotHistory[this.snapshotHistory.length - 1];
    const estimatedHostNowTick = this.estimateHostNowTick(nowMs);
    let hostNowBiasTicks: number | null = null;
    let hostNowBiasMs: number | null = null;
    let latestSnapshotTick: number | null = null;
    if (latest && estimatedHostNowTick !== null) {
      latestSnapshotTick = latest.state.hostTick;
      const tickMs =
        latest.state.tickDurationMs || NetworkSyncSystem.DEFAULT_TICK_MS;
      const elapsedTicks = Math.max(0, (nowMs - latest.receivedAtMs) / tickMs);
      const halfRttTicks = (this.lastMeasuredLatencyMs * 0.5) / tickMs;
      const compensatedHostNowTick =
        latest.state.hostTick + elapsedTicks + halfRttTicks;
      hostNowBiasTicks = estimatedHostNowTick - compensatedHostNowTick;
      hostNowBiasMs = hostNowBiasTicks * tickMs;
    }

    const inputAckGapTicks =
      this.lastCapturedInputTick !== null && this.latestHostAckTick !== null
        ? this.lastCapturedInputTick - this.latestHostAckTick
        : null;
    const tickMs = this.getTickDurationEstimate();
    const inputAckGapMs =
      inputAckGapTicks !== null ? inputAckGapTicks * tickMs : null;

    return {
      predictionErrorPxLast: this.predictionErrorPxLast,
      predictionErrorPxEwma: this.predictionErrorPxEwma,
      presentationLagPxLast: this.presentationLagPxLast,
      presentationLagPxEwma: this.presentationLagPxEwma,
      wallCorrectionEvents: this.wallCorrectionEvents,
      wallOscillationEvents: this.wallOscillationEvents,
      wallOscillationRatio:
        this.wallCorrectionEvents > 0
          ? this.wallOscillationEvents / this.wallCorrectionEvents
          : 0,
      hostNowBiasTicks,
      hostNowBiasMs,
      estimatedHostNowTick,
      latestSnapshotTick,
      capturedInputTick: this.lastCapturedInputTick,
      latestHostAckTick: this.latestHostAckTick,
      inputAckGapTicks,
      inputAckGapMs,
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

    // Use local estimate (no half-RTT) for local prediction
    const hostNowTick = this.estimateHostNowTickForLocal(performance.now());
    if (hostNowTick === null) {
      return this.localPresentationShipState
        ? { ...this.localPresentationShipState }
        : { ...this.localPredictedShipState };
    }

    const desiredTick = Math.max(this.localPredictedTick, Math.floor(hostNowTick));
    const maxCatchUpTick =
      this.localPredictedTick +
      NetworkSyncSystem.MAX_PREDICTION_REPLAY_TICKS_PER_FRAME;
    const targetTick = Math.min(desiredTick, maxCatchUpTick);

    // Save previous predicted state before replay to detect corrections
    const previousPredicted = this.localPredictedShipState ? { ...this.localPredictedShipState } : null;

    if (targetTick > this.localPredictedTick) {
      this.replayPredictionToTick(targetTick);
    }

    if (!this.localPredictedShipState) return null;

    // Detect if this was a correction (predicted jumped) vs normal advancement
    let wasCorrection = false;
    if (previousPredicted && this.localPredictedShipState) {
      const jumpDx = this.localPredictedShipState.x - previousPredicted.x;
      const jumpDy = this.localPredictedShipState.y - previousPredicted.y;
      const jumpDist = Math.sqrt(jumpDx * jumpDx + jumpDy * jumpDy);
      // Correction if predicted jumped more than expected for normal movement
      // Normal movement at max speed: ~14px/frame, so >20px = correction
      wasCorrection = jumpDist > 20;
    }

    if (!this.localPresentationShipState) {
      // First initialization - start synced
      this.localPresentationShipState = { ...this.localPredictedShipState };
    } else {
      const dx = this.localPredictedShipState.x - this.localPresentationShipState.x;
      const dy = this.localPredictedShipState.y - this.localPresentationShipState.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      this.presentationLagPxLast = dist;
      this.presentationLagPxEwma = this.updateEwma(
        this.presentationLagPxEwma,
        dist,
      );

      let blendFactor: number;
      if (dist > 100) {
        // Very far - snap immediately (teleport or major correction)
        this.localPresentationShipState = { ...this.localPredictedShipState };
      } else if (wasCorrection && dist > 10) {
        // CORRECTION DETECTED: Use slow blending to smooth out the jump
        if (dist > 40) {
          blendFactor = 0.5; // Medium correction - smooth over 2-3 frames
        } else if (dist > 20) {
          blendFactor = 0.35; // Small correction - smooth over 3-4 frames
        } else {
          blendFactor = 0.25; // Tiny correction - smooth over 5-6 frames
        }
      } else if (dist > 5) {
        // NORMAL ADVANCEMENT: Follow predicted tightly (95% blend = almost immediate)
        blendFactor = 0.95;
      } else if (dist > 1) {
        // Very close - blend tightly
        blendFactor = 0.9;
      } else {
        // Essentially synced - snap to eliminate sub-pixel jitter
        this.localPresentationShipState = { ...this.localPredictedShipState };
      }

      // Apply blending if not snapped
      if (dist > 1 && dist <= 100) {
        this.localPresentationShipState = {
          ...this.localPresentationShipState,
          playerId: this.localPredictedShipState.playerId,
          alive: this.localPredictedShipState.alive,
          x: lerp(this.localPresentationShipState.x, this.localPredictedShipState.x, blendFactor),
          y: lerp(this.localPresentationShipState.y, this.localPredictedShipState.y, blendFactor),
          vx: lerp(this.localPresentationShipState.vx, this.localPredictedShipState.vx, blendFactor),
          vy: lerp(this.localPresentationShipState.vy, this.localPredictedShipState.vy, blendFactor),
          angle: lerpAngle(this.localPresentationShipState.angle, this.localPredictedShipState.angle, blendFactor),
          // Snap non-interpolatable fields
          ammo: this.localPredictedShipState.ammo,
          maxAmmo: this.localPredictedShipState.maxAmmo,
          lastShotTime: this.localPredictedShipState.lastShotTime,
          reloadStartTime: this.localPredictedShipState.reloadStartTime,
          isReloading: this.localPredictedShipState.isReloading,
          color: this.localPredictedShipState.color,
          invulnerableUntil: this.localPredictedShipState.invulnerableUntil,
        };
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
    this.syncLocalPredictionBodyFromState(hostShip);
    this.localPredictedRuntime = this.runtimeFromHostShip(hostShip, tick);
    this.localPresentationShipState = { ...hostShip };
    this.localStateHistoryByTick.set(tick, { ...hostShip });
    this.localRuntimeHistoryByTick.set(tick, { ...this.localPredictedRuntime });
    this.localInputCaptureCursorTick = tick;
    this.pruneLocalPredictionHistory(tick);
  }

  private reconcileLocalPrediction(state: GameStateSync): void {
    if (this.network.isHost()) return;
    if (GameConfig.getMode() !== "STANDARD") {
      this.resetLocalPredictionState();
      return;
    }

    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;
    const hostShip = state.ships.find((ship) => ship.playerId === myPlayerId);
    if (!hostShip) {
      this.resetLocalPredictionState();
      return;
    }

    const snapshotTick = Math.floor(state.hostTick);
    const replayTarget = snapshotTick;
    this.latestHostAckTick = snapshotTick;

    const predictedAtSnapshot = this.localStateHistoryByTick.get(snapshotTick);
    const runtimeAtSnapshot = this.localRuntimeHistoryByTick.get(snapshotTick);
    if (predictedAtSnapshot) {
      const errorDx = hostShip.x - predictedAtSnapshot.x;
      const errorDy = hostShip.y - predictedAtSnapshot.y;
      const errorDist = Math.sqrt(errorDx * errorDx + errorDy * errorDy);
      this.predictionErrorPxLast = errorDist;
      this.predictionErrorPxEwma = this.updateEwma(
        this.predictionErrorPxEwma,
        errorDist,
      );
      this.trackWallCorrectionOscillation(hostShip, errorDx, errorDy);

      const velocityError = Math.sqrt(
        (hostShip.vx - predictedAtSnapshot.vx) ** 2 +
          (hostShip.vy - predictedAtSnapshot.vy) ** 2,
      );
      const angleError = this.absAngleDelta(
        hostShip.angle,
        predictedAtSnapshot.angle,
      );

      // FIX BUG W1: Skip reconciliation for moderate errors near walls
      // Wall physics divergence is expected (Matter.js non-deterministic)
      // Let presentation blending smooth it out instead of hard corrections
      const nearWall = this.isNearArenaWall(hostShip) || this.isNearArenaWall(predictedAtSnapshot);
      const moderateError = errorDist > NetworkSyncSystem.LOCAL_RECONCILE_POSITION_EPSILON &&
                           errorDist < 50; // Not huge error
      if (nearWall && moderateError) {
        // Near wall with moderate error - skip hard correction, let blend smooth it
        this.localStateHistoryByTick.set(
          snapshotTick,
          this.mergeAuthoritativeShipFields(predictedAtSnapshot, hostShip),
        );
        if (this.localPredictedTick !== null) {
          this.pruneLocalPredictionHistory(this.localPredictedTick);
        }
        return;
      }

      const smallError =
        errorDist <= NetworkSyncSystem.LOCAL_RECONCILE_POSITION_EPSILON &&
        velocityError <= NetworkSyncSystem.LOCAL_RECONCILE_VELOCITY_EPSILON &&
        angleError <= NetworkSyncSystem.LOCAL_RECONCILE_ANGLE_EPSILON;

      if (smallError) {
        this.localStateHistoryByTick.set(
          snapshotTick,
          this.mergeAuthoritativeShipFields(predictedAtSnapshot, hostShip),
        );
        if (this.localPredictedTick !== null) {
          this.pruneLocalPredictionHistory(this.localPredictedTick);
        }
        return;
      }

      const correctedBase = this.buildCorrectedSnapshotState(
        predictedAtSnapshot,
        hostShip,
        errorDist,
      );
      this.localPredictedTick = snapshotTick;
      this.localPredictedShipState = { ...correctedBase };
      // FIX BUG R1: Reset presentation to match corrected predicted state
      this.localPresentationShipState = { ...correctedBase };
      this.syncLocalPredictionBodyFromState(correctedBase);
      this.localPredictedRuntime = runtimeAtSnapshot
        ? { ...runtimeAtSnapshot }
        : this.runtimeFromHostShip(hostShip, snapshotTick);
      this.localStateHistoryByTick.set(snapshotTick, { ...correctedBase });
      this.localRuntimeHistoryByTick.set(snapshotTick, {
        ...this.localPredictedRuntime,
      });
      if (
        this.localInputCaptureCursorTick === null ||
        this.localInputCaptureCursorTick < snapshotTick
      ) {
        this.localInputCaptureCursorTick = snapshotTick;
      }
      this.replayPredictionToTick(replayTarget);
      this.pruneLocalPredictionHistory(replayTarget);
      return;
    }

    // No prediction history - initialize from host state
    this.localPredictedTick = snapshotTick;
    this.localPredictedShipState = { ...hostShip };
    // FIX BUG R1: Reset presentation to match when initializing from host
    this.localPresentationShipState = { ...hostShip };
    this.syncLocalPredictionBodyFromState(hostShip);
    this.localPredictedRuntime = this.runtimeFromHostShip(hostShip, snapshotTick);
    this.localStateHistoryByTick.set(snapshotTick, { ...hostShip });
    this.localRuntimeHistoryByTick.set(snapshotTick, {
      ...this.localPredictedRuntime,
    });
    if (
      this.localInputCaptureCursorTick === null ||
      this.localInputCaptureCursorTick < snapshotTick
    ) {
      this.localInputCaptureCursorTick = snapshotTick;
    }

    this.replayPredictionToTick(replayTarget);
    this.pruneLocalPredictionHistory(replayTarget);
  }

  private replayPredictionToTick(targetTick: number): void {
    if (this.localPredictedShipState === null || this.localPredictedTick === null) {
      return;
    }
    if (targetTick <= this.localPredictedTick) {
      return;
    }
    const cfg = GameConfig.config;
    const tickMs = this.getTickDurationEstimate();

    for (let tick = this.localPredictedTick + 1; tick <= targetTick; tick++) {
      const input = this.getInputForTick(tick);
      const stepResult = this.simulateStandardPredictionStep(
        this.localPredictedShipState,
        this.localPredictedRuntime,
        input,
        tickMs,
        cfg,
        tick,
        this.localDashTicks.has(tick),
      );
      this.localPredictedShipState = stepResult.state;
      this.localPredictedRuntime = stepResult.runtime;
      this.localPredictedTick = tick;
      this.localStateHistoryByTick.set(tick, { ...this.localPredictedShipState });
      this.localRuntimeHistoryByTick.set(tick, { ...this.localPredictedRuntime });
    }
  }

  private simulateStandardPredictionStep(
    state: ShipState,
    runtime: LocalPredictionRuntime,
    input: PlayerInput,
    dtMs: number,
    cfg: typeof GameConfig.config,
    tick: number,
    shouldDash: boolean,
  ): { state: ShipState; runtime: LocalPredictionRuntime } {
    if (!state.alive) {
      return {
        state: { ...state },
        runtime: { ...runtime },
      };
    }

    const dtSec = dtMs / 1000;
    const rotationDirection = this.networkRotationDirection || 1;
    const predictionBody = this.ensureLocalPredictionShipBody(state);
    Body.setPosition(predictionBody, { x: state.x, y: state.y });
    Body.setVelocity(predictionBody, { x: state.vx, y: state.vy });
    Body.setAngle(predictionBody, state.angle);
    Body.setAngularVelocity(predictionBody, 0);

    const preRotationAngle = predictionBody.angle;
    if (input.buttonA) {
      Body.rotate(predictionBody, cfg.ROTATION_SPEED * dtSec * rotationDirection);
    }

    let dashTimerSec = runtime.dashTimerSec;
    let recoilTimerSec = runtime.recoilTimerSec;
    if (shouldDash) {
      dashTimerSec = cfg.SHIP_DASH_DURATION;
    }
    if (dashTimerSec > 0) {
      dashTimerSec = Math.max(0, dashTimerSec - dtSec);
    }
    if (recoilTimerSec > 0) {
      recoilTimerSec = Math.max(0, recoilTimerSec - dtSec);
    }

    const simNowMs = tick * dtMs;
    let ammo = state.ammo;
    const maxAmmo = state.maxAmmo;
    let lastShotTime = state.lastShotTime;
    let reloadStartTime = state.reloadStartTime;
    let isReloading = state.isReloading;

    if (input.buttonB && ammo > 0 && simNowMs - lastShotTime > cfg.FIRE_COOLDOWN) {
      lastShotTime = simNowMs;
      ammo -= 1;
      recoilTimerSec = cfg.SHIP_RECOIL_DURATION;
      if (ammo < maxAmmo && !isReloading) {
        isReloading = true;
        reloadStartTime = simNowMs;
      }
    }

    if (isReloading && ammo < maxAmmo) {
      const reloadProgress = simNowMs - reloadStartTime;
      if (reloadProgress >= GAME_CONFIG.AMMO_RELOAD_TIME) {
        ammo += 1;
        reloadStartTime = simNowMs;
        if (ammo >= maxAmmo) {
          ammo = maxAmmo;
          isReloading = false;
        }
      }
    }

    const powerUp = this.playerPowerUps.get(state.playerId);
    const speedMultiplier = powerUp?.type === "JOUST" ? 1.4 : 1;
    const dashBoost = dashTimerSec > 0 ? cfg.SHIP_DASH_BOOST : 0;
    const recoilSlowdown = recoilTimerSec > 0 ? cfg.SHIP_RECOIL_SLOWDOWN : 0;
    const targetSpeed = Math.max(
      0,
      (cfg.SHIP_TARGET_SPEED + dashBoost - recoilSlowdown) * speedMultiplier,
    );
    const desiredVx = Math.cos(preRotationAngle) * targetSpeed;
    const desiredVy = Math.sin(preRotationAngle) * targetSpeed;
    const response = cfg.SHIP_SPEED_RESPONSE;
    const t = 1 - Math.exp(-response * dtSec);
    const nextVx = state.vx + (desiredVx - state.vx) * t;
    const nextVy = state.vy + (desiredVy - state.vy) * t;
    Body.setVelocity(predictionBody, {
      x: nextVx,
      y: nextVy,
    });
    this.localPredictionPhysics?.updateFixed(dtMs);

    const x = predictionBody.position.x;
    const y = predictionBody.position.y;
    const vx = predictionBody.velocity.x;
    const vy = predictionBody.velocity.y;
    const angle = predictionBody.angle;

    return {
      state: {
        ...state,
        x,
        y,
        vx,
        vy,
        angle,
        ammo,
        maxAmmo,
        lastShotTime,
        reloadStartTime,
        isReloading,
      },
      runtime: {
        dashTimerSec,
        recoilTimerSec,
      },
    };
  }

  private captureInputForPredictedTicks(input: PlayerInput): number | null {
    if (this.network.isHost()) return null;
    // Use local estimate (no half-RTT) for input capture
    const hostNowTick = this.estimateHostNowTickForLocal(performance.now());
    const baseTick =
      this.localPredictedTick ??
      (hostNowTick !== null ? Math.floor(hostNowTick) : null);
    if (baseTick === null) return null;
    const captureTick = Math.max(0, baseTick + 1);
    const captured = this.cloneInput(input);
    if (
      this.localInputCaptureCursorTick === null ||
      captureTick > this.localInputCaptureCursorTick
    ) {
      const fromTick =
        this.localInputCaptureCursorTick === null
          ? captureTick
          : this.localInputCaptureCursorTick + 1;
      for (let tick = fromTick; tick <= captureTick; tick++) {
        this.localInputHistoryByTick.set(tick, this.cloneInput(captured));
      }
      this.localInputCaptureCursorTick = captureTick;
      return captureTick;
    }

    this.localInputHistoryByTick.set(captureTick, captured);
    return captureTick;
  }

  private getInputForTick(tick: number): PlayerInput {
    const direct = this.localInputHistoryByTick.get(tick);
    if (direct) {
      return this.cloneInput(direct);
    }

    const fallback = this.getLatestCapturedInputBeforeTick(tick) ?? this.localInputState;
    const cloned = this.cloneInput(fallback);
    this.localInputHistoryByTick.set(tick, cloned);
    if (
      this.localInputCaptureCursorTick === null ||
      tick > this.localInputCaptureCursorTick
    ) {
      this.localInputCaptureCursorTick = tick;
    }
    return this.cloneInput(cloned);
  }

  private getLatestCapturedInputBeforeTick(tick: number): PlayerInput | null {
    const keepFrom = tick - NetworkSyncSystem.LOCAL_PREDICTION_HISTORY_TICKS;
    for (let t = tick - 1; t >= keepFrom; t--) {
      const input = this.localInputHistoryByTick.get(t);
      if (input) {
        return input;
      }
    }
    return null;
  }

  private runtimeFromHostShip(
    shipState: ShipState,
    tick: number,
  ): LocalPredictionRuntime {
    const tickMs = this.getTickDurationEstimate();
    const snapshotNowMs = tick * tickMs;
    const lastShotTime = Number.isFinite(shipState.lastShotTime)
      ? shipState.lastShotTime
      : 0;
    const elapsedSinceShotSec = Math.max(0, (snapshotNowMs - lastShotTime) / 1000);
    const recoilTimerSec = Math.max(
      0,
      GameConfig.config.SHIP_RECOIL_DURATION - elapsedSinceShotSec,
    );
    return {
      dashTimerSec: 0,
      recoilTimerSec,
    };
  }

  private resetLocalPredictionState(): void {
    this.localPredictedTick = null;
    this.localPredictedShipState = null;
    this.localPredictedRuntime = {
      dashTimerSec: 0,
      recoilTimerSec: 0,
    };
    this.localPresentationShipState = null;
    this.localInputHistoryByTick.clear();
    this.localStateHistoryByTick.clear();
    this.localRuntimeHistoryByTick.clear();
    this.localDashTicks.clear();
    this.localInputCaptureCursorTick = null;
    this.destroyLocalPredictionPhysics();
  }

  private ensureLocalPredictionShipBody(state: ShipState): Matter.Body {
    if (!this.localPredictionPhysics) {
      this.localPredictionPhysics = new Physics();
      this.localPredictionPhysics.createWalls(
        GAME_CONFIG.ARENA_WIDTH,
        GAME_CONFIG.ARENA_HEIGHT,
      );
    }

    if (
      !this.localPredictionShipBody ||
      this.localPredictionPlayerId !== state.playerId
    ) {
      if (this.localPredictionShipBody) {
        this.localPredictionPhysics.removeBody(this.localPredictionShipBody);
      }
      this.localPredictionShipBody = this.localPredictionPhysics.createShip(
        state.x,
        state.y,
        state.playerId,
      );
      this.localPredictionPlayerId = state.playerId;
    }

    return this.localPredictionShipBody;
  }

  private syncLocalPredictionBodyFromState(state: ShipState): void {
    const body = this.ensureLocalPredictionShipBody(state);
    Body.setPosition(body, { x: state.x, y: state.y });
    Body.setVelocity(body, { x: state.vx, y: state.vy });
    Body.setAngle(body, state.angle);
    Body.setAngularVelocity(body, 0);
  }

  private destroyLocalPredictionPhysics(): void {
    if (this.localPredictionPhysics && this.localPredictionShipBody) {
      this.localPredictionPhysics.removeBody(this.localPredictionShipBody);
    }
    this.localPredictionShipBody = null;
    this.localPredictionPhysics = null;
    this.localPredictionPlayerId = null;
  }

  private resetDebugTelemetry(): void {
    this.lastMeasuredLatencyMs = 0;
    this.predictionErrorPxLast = 0;
    this.predictionErrorPxEwma = 0;
    this.presentationLagPxLast = 0;
    this.presentationLagPxEwma = 0;
    this.wallCorrectionEvents = 0;
    this.wallOscillationEvents = 0;
    this.lastWallCorrectionAxis = null;
    this.lastWallCorrectionSign = 0;
    this.lastCapturedInputTick = null;
    this.latestHostAckTick = null;
  }

  private updateEwma(current: number, sample: number): number {
    if (current <= 0) return sample;
    return (
      current * (1 - NetworkSyncSystem.DEBUG_EWMA_ALPHA) +
      sample * NetworkSyncSystem.DEBUG_EWMA_ALPHA
    );
  }

  private absAngleDelta(a: number, b: number): number {
    const twoPi = Math.PI * 2;
    let diff = (a - b) % twoPi;
    if (diff > Math.PI) diff -= twoPi;
    if (diff < -Math.PI) diff += twoPi;
    return Math.abs(diff);
  }

  private mergeAuthoritativeShipFields(
    predicted: ShipState,
    host: ShipState,
  ): ShipState {
    return {
      ...predicted,
      alive: host.alive,
      invulnerableUntil: host.invulnerableUntil,
      ammo: host.ammo,
      maxAmmo: host.maxAmmo,
      lastShotTime: host.lastShotTime,
      reloadStartTime: host.reloadStartTime,
      isReloading: host.isReloading,
    };
  }

  private buildCorrectedSnapshotState(
    predicted: ShipState,
    host: ShipState,
    errorDist: number,
  ): ShipState {
    if (errorDist >= NetworkSyncSystem.LOCAL_CORRECTION_SNAP_DISTANCE) {
      return { ...host };
    }

    const t = NetworkSyncSystem.LOCAL_CORRECTION_BLEND;
    return {
      ...host,
      x: lerp(predicted.x, host.x, t),
      y: lerp(predicted.y, host.y, t),
      vx: lerp(predicted.vx, host.vx, t),
      vy: lerp(predicted.vy, host.vy, t),
      angle: lerpAngle(predicted.angle, host.angle, t),
    };
  }

  private isNearArenaWall(ship: ShipState): boolean {
    const margin = NetworkSyncSystem.WALL_PROXIMITY_MARGIN;
    const width = GAME_CONFIG.ARENA_WIDTH;
    const height = GAME_CONFIG.ARENA_HEIGHT;
    return (
      ship.x <= margin ||
      ship.x >= width - margin ||
      ship.y <= margin ||
      ship.y >= height - margin
    );
  }

  private trackWallCorrectionOscillation(
    hostShip: ShipState,
    errorDx: number,
    errorDy: number,
  ): void {
    if (!this.isNearArenaWall(hostShip)) return;
    const ax = Math.abs(errorDx);
    const ay = Math.abs(errorDy);
    if (ax < 0.25 && ay < 0.25) return;

    const axis: "x" | "y" = ax >= ay ? "x" : "y";
    const signedError = axis === "x" ? errorDx : errorDy;
    const sign = Math.sign(signedError);
    if (sign === 0) return;

    this.wallCorrectionEvents += 1;
    if (
      this.lastWallCorrectionAxis === axis &&
      this.lastWallCorrectionSign !== 0 &&
      this.lastWallCorrectionSign !== sign
    ) {
      this.wallOscillationEvents += 1;
    }
    this.lastWallCorrectionAxis = axis;
    this.lastWallCorrectionSign = sign;
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
    for (const tick of this.localRuntimeHistoryByTick.keys()) {
      if (tick < keepFrom) {
        this.localRuntimeHistoryByTick.delete(tick);
      }
    }
    for (const tick of this.localDashTicks) {
      if (tick < keepFrom) {
        this.localDashTicks.delete(tick);
      }
    }
    if (
      this.localInputCaptureCursorTick !== null &&
      this.localInputCaptureCursorTick < keepFrom
    ) {
      this.localInputCaptureCursorTick = keepFrom;
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
