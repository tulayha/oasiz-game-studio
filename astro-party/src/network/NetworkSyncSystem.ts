import { Renderer } from "../systems/Renderer";
import { NetworkManager } from "./NetworkManager";
import { PlayerManager } from "../managers/PlayerManager";
import { SettingsManager } from "../SettingsManager";
import { GameConfig } from "../GameConfig";
import { SelfShipPredictor } from "./gameFeel/SelfShipPredictor";
import { NETWORK_GAME_FEEL_TUNING } from "./gameFeel/NetworkGameFeelTuning";
import {
  GAME_CONFIG,
  BaseGameMode,
  GameStateSync,
  MapId,
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

interface SnapshotFrame {
  state: GameStateSync;
  receivedAtMs: number;
  hostTick: number;
  tickDurationMs: number;
  hostTimeMs: number;
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
  networkMapId: MapId;
  networkYellowBlockHp: number[];
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

  private snapshotBuffer: SnapshotFrame[] = [];
  private latestSnapshotFrame: SnapshotFrame | null = null;
  private interpolationDelayMs: number =
    NETWORK_GAME_FEEL_TUNING.remoteSmoothing.interpolationDelayBaseMs;
  private extrapolationCapMs: number =
    NETWORK_GAME_FEEL_TUNING.remoteSmoothing.extrapolationCapBaseMs;
  private latestRotationDirection = 1;

  private snapshotJitterMs = 0;
  private snapshotIntervalMs = 0;
  private lastSnapshotReceivedAtMs = 0;
  private lastPlayerStateSyncMs = 0;
  private lastSnapshotAgeMs = 0;
  private hostNowBiasMs: number | null = null;
  private hostNowBiasTicks: number | null = null;
  private estimatedHostNowTick: number | null = null;
  private presentationLagPxLast = 0;
  private presentationLagPxEwma = 0;

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
  private networkMapId: MapId = 0;
  private networkYellowBlockHp: number[] = [];

  hostSimTimeMs = 0;

  private clientArmingMines: Set<string> = new Set();
  private clientExplodedMines: Set<string> = new Set();
  private clientShipPositions: Map<string, { x: number; y: number; color: string }> =
    new Map();
  private clientAsteroidStates: Map<string, { x: number; y: number; size: number }> =
    new Map();
  private clientPilotPositions: Map<string, { x: number; y: number }> = new Map();
  private lastAppliedHostTick = -1;

  private selfShipPredictor = new SelfShipPredictor();

  constructor(
    private network: NetworkManager,
    private renderer: Renderer,
    private playerMgr: PlayerManager,
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private onPlayersUpdate: () => void,
  ) {}

  captureLocalInput(input: PlayerInput): void {
    if (!this.isSelfPredictionEnabled()) return;
    this.selfShipPredictor.captureInput(input);
  }

  recordSentInput(input: PlayerInput): void {
    if (!this.isSelfPredictionEnabled()) return;
    this.selfShipPredictor.recordSentInput(input);
  }

  triggerLocalDashPrediction(playerId: string): void {
    this.selfShipPredictor.queueDash();
    const ship = this.getLocalVisualShip(playerId);
    if (!ship) return;
    const color = this.playerMgr.players.get(playerId)?.color.primary ?? "#ffffff";
    const dodgeAngle =
      ship.angle + ((80 * Math.PI) / 180) * this.latestRotationDirection;
    this.renderer.spawnDashParticles(ship.x, ship.y, dodgeAngle, color, 10);
  }

  triggerLocalFirePrediction(playerId: string): void {
    const ship = this.getLocalVisualShip(playerId);
    if (!ship) return;
    const color = this.playerMgr.players.get(playerId)?.color.primary ?? "#ffffff";
    const muzzleX = ship.x + Math.cos(ship.angle) * 18;
    const muzzleY = ship.y + Math.sin(ship.angle) * 18;
    for (let i = 0; i < 3; i += 1) {
      this.renderer.spawnParticle(muzzleX, muzzleY, color, "hit");
    }
    this.renderer.spawnParticle(muzzleX, muzzleY, "#ffffff", "hit");
  }

  getRenderState(
    myPlayerId: string | null = null,
    _latencyMs: number = 0,
  ): RenderNetworkState {
    const nowMs = performance.now();
    if (!this.latestSnapshotFrame) {
      return this.buildRenderState();
    }

    if (this.lastSnapshotReceivedAtMs > 0) {
      this.lastSnapshotAgeMs = Math.max(0, nowMs - this.lastSnapshotReceivedAtMs);
    }

    // Local mode renders latest authoritative state directly.
    if (!this.isOnlineGameFeelEnabled()) {
      this.hostSimTimeMs = this.latestSnapshotFrame.hostTimeMs;
      this.estimatedHostNowTick = this.latestSnapshotFrame.hostTick;
      this.applyDirectSnapshotState(this.latestSnapshotFrame.state);
      this.presentationLagPxLast = 0;
      this.presentationLagPxEwma = 0;
      return this.buildRenderState();
    }

    const selfPredictionEnabled = this.isSelfPredictionEnabled();
    if (selfPredictionEnabled) {
      const baseMode = GameConfig.getMode();
      this.selfShipPredictor.step(nowMs, this.latestRotationDirection, baseMode);
    }

    const estimatedHostNowMs =
      this.latestSnapshotFrame.hostTimeMs +
      Math.max(0, nowMs - this.latestSnapshotFrame.receivedAtMs);
    const renderHostTimeMs = this.computeRenderHostTimeMs(estimatedHostNowMs);
    this.hostSimTimeMs = renderHostTimeMs;
    this.estimatedHostNowTick =
      this.latestSnapshotFrame.tickDurationMs > 0
        ? renderHostTimeMs / this.latestSnapshotFrame.tickDurationMs
        : null;

    const { prev, next, t } = this.selectFramePair(renderHostTimeMs);
    const prevState = prev.state;
    const nextState = next.state;

    this.networkShips = this.interpolateShips(
      prevState.ships || [],
      nextState.ships || [],
      t,
      selfPredictionEnabled ? myPlayerId : null,
    );
    this.networkPilots = this.interpolateList(
      prevState.pilots || [],
      nextState.pilots || [],
      (pilot) => pilot.playerId,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
        vx: this.lerp(a.vx, b.vx, blend),
        vy: this.lerp(a.vy, b.vy, blend),
        angle: this.lerpAngle(a.angle, b.angle, blend),
      }),
      t,
    );
    this.networkProjectiles = this.interpolateList(
      prevState.projectiles || [],
      nextState.projectiles || [],
      (projectile) => projectile.id,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
        vx: this.lerp(a.vx, b.vx, blend),
        vy: this.lerp(a.vy, b.vy, blend),
      }),
      t,
    );
    this.networkAsteroids = this.interpolateList(
      prevState.asteroids || [],
      nextState.asteroids || [],
      (asteroid) => asteroid.id,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
        vx: this.lerp(a.vx, b.vx, blend),
        vy: this.lerp(a.vy, b.vy, blend),
        angle: this.lerpAngle(a.angle, b.angle, blend),
        angularVelocity: this.lerp(a.angularVelocity, b.angularVelocity, blend),
      }),
      t,
    );
    this.networkPowerUps = this.interpolateList(
      prevState.powerUps || [],
      nextState.powerUps || [],
      (powerUp) => powerUp.id,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
        remainingTimeFraction: this.lerp(
          a.remainingTimeFraction,
          b.remainingTimeFraction,
          this.clamp(blend, 0, 1),
        ),
      }),
      t,
    );
    this.networkLaserBeams = this.interpolateList(
      prevState.laserBeams || [],
      nextState.laserBeams || [],
      (beam) => beam.id,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
        angle: this.lerpAngle(a.angle, b.angle, blend),
      }),
      t,
    );
    this.networkMines = this.interpolateList(
      prevState.mines || [],
      nextState.mines || [],
      (mine) => mine.id,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
      }),
      t,
    );
    this.networkHomingMissiles = this.interpolateList(
      prevState.homingMissiles || [],
      nextState.homingMissiles || [],
      (missile) => missile.id,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
        vx: this.lerp(a.vx, b.vx, blend),
        vy: this.lerp(a.vy, b.vy, blend),
        angle: this.lerpAngle(a.angle, b.angle, blend),
      }),
      t,
    );
    this.networkTurret = this.interpolateTurret(prevState.turret, nextState.turret, t);
    this.networkTurretBullets = this.interpolateList(
      prevState.turretBullets || [],
      nextState.turretBullets || [],
      (bullet) => bullet.id,
      (a, b, blend) => ({
        ...b,
        x: this.lerp(a.x, b.x, blend),
        y: this.lerp(a.y, b.y, blend),
        vx: this.lerp(a.vx, b.vx, blend),
        vy: this.lerp(a.vy, b.vy, blend),
        angle: this.lerpAngle(a.angle, b.angle, blend),
      }),
      t,
    );
    this.networkMapId = (nextState.mapId ?? 0) as MapId;
    this.networkYellowBlockHp = nextState.yellowBlockHp || [];

    if (selfPredictionEnabled && myPlayerId) {
      const predictedShip = this.selfShipPredictor.getPredictedShip(nowMs);
      if (predictedShip && predictedShip.playerId === myPlayerId) {
        this.replaceOrInsertShip(predictedShip);
      } else {
        const latestOwnShip = this.latestSnapshotFrame.state.ships.find(
          (ship) => ship.playerId === myPlayerId,
        );
        if (latestOwnShip) {
          this.replaceOrInsertShip(
            this.buildAuthoritativeSelfShip(latestOwnShip, nowMs),
          );
        }
      }
    }

    if (selfPredictionEnabled) {
      const latestAuthoritativeOwnShip = myPlayerId
        ? this.latestSnapshotFrame.state.ships.find((ship) => ship.playerId === myPlayerId)
        : null;
      const shownOwnShip = myPlayerId
        ? this.networkShips.find((ship) => ship.playerId === myPlayerId)
        : null;
      if (latestAuthoritativeOwnShip && shownOwnShip) {
        const lagPx = Math.hypot(
          latestAuthoritativeOwnShip.x - shownOwnShip.x,
          latestAuthoritativeOwnShip.y - shownOwnShip.y,
        );
        this.presentationLagPxLast = lagPx;
        this.presentationLagPxEwma = this.presentationLagPxEwma * 0.9 + lagPx * 0.1;
      }
    } else {
      this.presentationLagPxLast = 0;
      this.presentationLagPxEwma = 0;
    }

    return this.buildRenderState();
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
    this.latestRotationDirection = state.rotationDirection ?? this.latestRotationDirection;

    const receivedAtMs = performance.now();

    const frame: SnapshotFrame = {
      state,
      receivedAtMs,
      hostTick: normalizedHostTick,
      tickDurationMs: normalizedTickDurationMs,
      hostTimeMs: normalizedHostTick * normalizedTickDurationMs,
    };
    this.latestSnapshotFrame = frame;

    // Local mode bypasses interpolation/reconciliation and stays fully direct.
    if (!this.isOnlineGameFeelEnabled()) {
      this.snapshotBuffer = [frame];
      this.snapshotJitterMs = 0;
      this.snapshotIntervalMs = normalizedTickDurationMs;
      this.lastSnapshotReceivedAtMs = receivedAtMs;
      this.lastSnapshotAgeMs = 0;
      this.interpolationDelayMs =
        NETWORK_GAME_FEEL_TUNING.remoteSmoothing.interpolationDelayBaseMs;
      this.extrapolationCapMs =
        NETWORK_GAME_FEEL_TUNING.remoteSmoothing.extrapolationCapBaseMs;
      this.hostNowBiasMs = null;
      this.hostNowBiasTicks = null;
      this.presentationLagPxLast = 0;
      this.presentationLagPxEwma = 0;

      this.hostSimTimeMs = frame.hostTimeMs;
      this.estimatedHostNowTick = frame.hostTick;
      this.networkMapId = (state.mapId ?? 0) as MapId;
      this.networkYellowBlockHp = state.yellowBlockHp || [];

      this.applyDirectSnapshotState(state);
      this.syncPlayerStatesFromNetwork();
      this.processAuthoritativeEffects(state);
      this.syncPlayerPowerUps(state.playerPowerUps);
      this.selfShipPredictor.clear();
      return;
    }

    this.trackSnapshotTiming(receivedAtMs);
    this.appendSnapshot(frame);

    this.hostSimTimeMs = frame.hostTimeMs;
    this.networkMapId = (state.mapId ?? 0) as MapId;
    this.networkYellowBlockHp = state.yellowBlockHp || [];

    if (Number.isFinite(state.serverNowMs)) {
      const biasSample = Date.now() - (state.serverNowMs as number);
      this.hostNowBiasMs =
        this.hostNowBiasMs === null
          ? biasSample
          : this.hostNowBiasMs * 0.9 + biasSample * 0.1;
      this.hostNowBiasTicks = this.hostNowBiasMs / normalizedTickDurationMs;
    }

    this.syncPlayerStatesFromNetwork();
    this.processAuthoritativeEffects(state);
    this.syncPlayerPowerUps(state.playerPowerUps);
    if (this.isSelfPredictionEnabled()) {
      this.ingestSelfAuthoritativeShip(state);
    } else {
      this.selfShipPredictor.clear();
    }
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
    this.networkMapId = 0;
    this.networkYellowBlockHp = [];

    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();
    this.clientAsteroidStates.clear();
    this.clientPilotPositions.clear();

    this.snapshotBuffer = [];
    this.latestSnapshotFrame = null;
    this.interpolationDelayMs =
      NETWORK_GAME_FEEL_TUNING.remoteSmoothing.interpolationDelayBaseMs;
    this.extrapolationCapMs =
      NETWORK_GAME_FEEL_TUNING.remoteSmoothing.extrapolationCapBaseMs;
    this.snapshotJitterMs = 0;
    this.snapshotIntervalMs = 0;
    this.lastSnapshotReceivedAtMs = 0;
    this.lastSnapshotAgeMs = 0;
    this.lastPlayerStateSyncMs = 0;
    this.hostNowBiasMs = null;
    this.hostNowBiasTicks = null;
    this.estimatedHostNowTick = null;
    this.presentationLagPxLast = 0;
    this.presentationLagPxEwma = 0;
    this.hostSimTimeMs = 0;
    this.lastAppliedHostTick = -1;
    this.latestRotationDirection = 1;
    this.selfShipPredictor.clear();
  }

  clearClientTracking(): void {
    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();
    this.clientAsteroidStates.clear();
    this.clientPilotPositions.clear();
    this.selfShipPredictor.clear();
  }

  clearNetworkEntities(): void {
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
    this.networkMapId = 0;
    this.networkYellowBlockHp = [];

    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();
    this.clientAsteroidStates.clear();
    this.clientPilotPositions.clear();

    this.snapshotBuffer = [];
    this.latestSnapshotFrame = null;
    this.interpolationDelayMs =
      NETWORK_GAME_FEEL_TUNING.remoteSmoothing.interpolationDelayBaseMs;
    this.extrapolationCapMs =
      NETWORK_GAME_FEEL_TUNING.remoteSmoothing.extrapolationCapBaseMs;
    this.snapshotJitterMs = 0;
    this.snapshotIntervalMs = 0;
    this.lastSnapshotReceivedAtMs = 0;
    this.lastSnapshotAgeMs = 0;
    this.lastPlayerStateSyncMs = 0;
    this.hostNowBiasMs = null;
    this.hostNowBiasTicks = null;
    this.presentationLagPxLast = 0;
    this.presentationLagPxEwma = 0;
    this.lastAppliedHostTick = -1;
    this.hostSimTimeMs = 0;
    this.estimatedHostNowTick = null;
    this.selfShipPredictor.clear();
  }

  getPredictionDebugTelemetry(): NetworkPredictionDebugTelemetry {
    const prediction = this.selfShipPredictor.getTelemetry();
    const captured = prediction.capturedInputSequence;
    const acked = prediction.latestAckSequence;
    const gap = Math.max(0, captured - acked);

    return {
      predictionErrorPxLast: prediction.predictionErrorPxLast,
      predictionErrorPxEwma: prediction.predictionErrorPxEwma,
      presentationLagPxLast: this.presentationLagPxLast,
      presentationLagPxEwma: this.presentationLagPxEwma,
      wallCorrectionEvents: prediction.correctionEvents,
      wallOscillationEvents: 0,
      wallOscillationRatio: 0,
      hostNowBiasTicks: this.hostNowBiasTicks,
      hostNowBiasMs: this.hostNowBiasMs,
      estimatedHostNowTick: this.estimatedHostNowTick,
      latestSnapshotTick:
        this.lastAppliedHostTick >= 0 ? this.lastAppliedHostTick : null,
      capturedInputTick: captured > 0 ? captured : null,
      latestHostAckTick: acked > 0 ? acked : null,
      inputAckGapTicks: gap > 0 ? gap : null,
      inputAckGapMs: gap > 0
        ? gap * NETWORK_GAME_FEEL_TUNING.selfPrediction.inputSendIntervalMs
        : null,
    };
  }

  private buildRenderState(): RenderNetworkState {
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
      networkMapId: this.networkMapId,
      networkYellowBlockHp: this.networkYellowBlockHp,
    };
  }

  private isOnlineGameFeelEnabled(): boolean {
    return this.network.getTransportMode() === "online";
  }

  private isSelfPredictionEnabled(): boolean {
    return (
      this.isOnlineGameFeelEnabled() &&
      NETWORK_GAME_FEEL_TUNING.selfPrediction.enabled
    );
  }

  isShipAlive(playerId: string): boolean {
    const ship = this.latestSnapshotFrame?.state.ships.find(
      (entry) => entry.playerId === playerId,
    );
    return Boolean(ship?.alive);
  }

  private applyDirectSnapshotState(state: GameStateSync): void {
    this.networkShips = state.ships || [];
    this.networkPilots = state.pilots || [];
    this.networkProjectiles = state.projectiles || [];
    this.networkAsteroids = state.asteroids || [];
    this.networkPowerUps = state.powerUps || [];
    this.networkLaserBeams = state.laserBeams || [];
    this.networkMines = state.mines || [];
    this.networkHomingMissiles = state.homingMissiles || [];
    this.networkTurret = state.turret ?? null;
    this.networkTurretBullets = state.turretBullets || [];
    this.networkMapId = (state.mapId ?? 0) as MapId;
    this.networkYellowBlockHp = state.yellowBlockHp || [];
  }

  private appendSnapshot(frame: SnapshotFrame): void {
    this.snapshotBuffer.push(frame);
    if (
      this.snapshotBuffer.length >
      NETWORK_GAME_FEEL_TUNING.remoteSmoothing.maxSnapshotBufferSize
    ) {
      this.snapshotBuffer.shift();
    }
  }

  private computeRenderHostTimeMs(estimatedHostNowMs: number): number {
    if (!this.latestSnapshotFrame) return 0;
    const minHostTime = this.snapshotBuffer.length > 0 ? this.snapshotBuffer[0].hostTimeMs : 0;
    const maxHostTime = this.latestSnapshotFrame.hostTimeMs + this.extrapolationCapMs;
    const delayed = estimatedHostNowMs - this.interpolationDelayMs;
    return this.clamp(delayed, minHostTime, maxHostTime);
  }

  private selectFramePair(renderHostTimeMs: number): {
    prev: SnapshotFrame;
    next: SnapshotFrame;
    t: number;
  } {
    if (this.snapshotBuffer.length <= 1) {
      const frame = this.latestSnapshotFrame as SnapshotFrame;
      return { prev: frame, next: frame, t: 0 };
    }

    const first = this.snapshotBuffer[0];
    const last = this.snapshotBuffer[this.snapshotBuffer.length - 1];
    if (renderHostTimeMs <= first.hostTimeMs) {
      return { prev: first, next: first, t: 0 };
    }
    if (renderHostTimeMs >= last.hostTimeMs) {
      const prev = this.snapshotBuffer[this.snapshotBuffer.length - 2];
      const span = Math.max(1, last.hostTimeMs - prev.hostTimeMs);
      return { prev, next: last, t: 1 + (renderHostTimeMs - last.hostTimeMs) / span };
    }

    for (let i = 1; i < this.snapshotBuffer.length; i += 1) {
      const prev = this.snapshotBuffer[i - 1];
      const next = this.snapshotBuffer[i];
      if (renderHostTimeMs <= next.hostTimeMs) {
        const span = Math.max(1, next.hostTimeMs - prev.hostTimeMs);
        return { prev, next, t: (renderHostTimeMs - prev.hostTimeMs) / span };
      }
    }

    return { prev: last, next: last, t: 0 };
  }

  private ingestSelfAuthoritativeShip(state: GameStateSync): void {
    const myPlayerId = this.network.getMyPlayerId();
    if (!myPlayerId) return;
    const ownShip = (state.ships || []).find((ship) => ship.playerId === myPlayerId) || null;
    const ackSequence = state.lastProcessedInputSequenceByPlayer
      ? state.lastProcessedInputSequenceByPlayer[myPlayerId]
      : null;
    const renderNowMs = performance.now();
    const hostTick = Number.isFinite(state.hostTick) ? (state.hostTick as number) : 0;
    const tickDurationMs =
      Number.isFinite(state.tickDurationMs) && state.tickDurationMs > 0
        ? (state.tickDurationMs as number)
        : NetworkSyncSystem.DEFAULT_TICK_MS;
    const authoritativeSimNowMs = hostTick * tickDurationMs;
    const baseMode: BaseGameMode = GameConfig.getMode();
    this.selfShipPredictor.ingestAuthoritative(
      ownShip,
      Number.isFinite(ackSequence) ? (ackSequence as number) : null,
      renderNowMs,
      authoritativeSimNowMs,
      state.rotationDirection ?? this.latestRotationDirection,
      baseMode,
      state,
    );
  }

  private getLocalVisualShip(playerId: string): ShipState | null {
    const nowMs = performance.now();
    const predicted = this.selfShipPredictor.getPredictedShip(nowMs);
    if (predicted && predicted.playerId === playerId) return predicted;
    const latest = this.latestSnapshotFrame?.state.ships.find(
      (ship) => ship.playerId === playerId,
    );
    return latest ? this.buildAuthoritativeSelfShip(latest, nowMs) : null;
  }

  private replaceOrInsertShip(ship: ShipState): void {
    const index = this.networkShips.findIndex(
      (entry) => entry.playerId === ship.playerId,
    );
    if (index >= 0) {
      this.networkShips[index] = ship;
      return;
    }
    this.networkShips.push(ship);
  }

  private buildAuthoritativeSelfShip(ship: ShipState, nowMs: number): ShipState {
    if (!ship.alive) {
      return { ...ship };
    }
    const latestSnapshot = this.latestSnapshotFrame;
    if (!latestSnapshot) {
      return { ...ship };
    }

    const extrapolationMs = this.clamp(
      nowMs - latestSnapshot.receivedAtMs,
      0,
      NETWORK_GAME_FEEL_TUNING.selfPrediction.authoritativeFallbackExtrapolationMs,
    );
    const dtSec = extrapolationMs / 1000;

    return {
      ...ship,
      x: this.clamp(ship.x + ship.vx * dtSec * 60, 0, GAME_CONFIG.ARENA_WIDTH),
      y: this.clamp(ship.y + ship.vy * dtSec * 60, 0, GAME_CONFIG.ARENA_HEIGHT),
    };
  }

  private interpolateShips(
    prevShips: ShipState[],
    nextShips: ShipState[],
    t: number,
    excludedPlayerId: string | null,
  ): ShipState[] {
    const prevByPlayer = new Map(prevShips.map((ship) => [ship.playerId, ship]));
    const nextByPlayer = new Map(nextShips.map((ship) => [ship.playerId, ship]));
    const out: ShipState[] = [];

    for (const ship of nextShips) {
      if (excludedPlayerId && ship.playerId === excludedPlayerId) continue;
      const prev = prevByPlayer.get(ship.playerId);
      if (!prev) {
        out.push({ ...ship });
        continue;
      }

      // Ship lifecycle changes (destroyed -> respawned, respawned -> destroyed)
      // should snap to authoritative state instead of lerping across the arena.
      if (prev.alive !== ship.alive) {
        out.push({ ...ship });
        continue;
      }

      out.push({
        ...ship,
        x: this.lerp(prev.x, ship.x, t),
        y: this.lerp(prev.y, ship.y, t),
        vx: this.lerp(prev.vx, ship.vx, t),
        vy: this.lerp(prev.vy, ship.vy, t),
        angle: this.lerpAngle(prev.angle, ship.angle, t),
      });
    }

    if (t < 1) {
      for (const ship of prevShips) {
        if (excludedPlayerId && ship.playerId === excludedPlayerId) continue;
        if (nextByPlayer.has(ship.playerId)) continue;
        out.push({ ...ship });
      }
    }

    return out;
  }

  private interpolateList<T>(
    prevItems: T[],
    nextItems: T[],
    getId: (item: T) => string,
    blend: (a: T, b: T, t: number) => T,
    t: number,
  ): T[] {
    const prevById = new Map(prevItems.map((item) => [getId(item), item]));
    const nextById = new Map(nextItems.map((item) => [getId(item), item]));
    const out: T[] = [];

    for (const item of nextItems) {
      const id = getId(item);
      const prev = prevById.get(id);
      if (!prev) {
        out.push(item);
        continue;
      }
      out.push(blend(prev, item, t));
    }

    if (t < 1) {
      for (const item of prevItems) {
        const id = getId(item);
        if (nextById.has(id)) continue;
        out.push(item);
      }
    }

    return out;
  }

  private interpolateTurret(
    prevTurret: TurretState | undefined,
    nextTurret: TurretState | undefined,
    t: number,
  ): TurretState | null {
    if (!prevTurret && !nextTurret) return null;
    if (!prevTurret && nextTurret) return { ...nextTurret };
    if (prevTurret && !nextTurret) return t < 1 ? { ...prevTurret } : null;
    if (!prevTurret || !nextTurret) return null;
    return {
      ...nextTurret,
      x: this.lerp(prevTurret.x, nextTurret.x, t),
      y: this.lerp(prevTurret.y, nextTurret.y, t),
      angle: this.lerpAngle(prevTurret.angle, nextTurret.angle, t),
      targetAngle: this.lerpAngle(prevTurret.targetAngle, nextTurret.targetAngle, t),
    };
  }

  private processAuthoritativeEffects(state: GameStateSync): void {
    const incomingShips = state.ships || [];
    const currentShipIds = new Set(incomingShips.map((ship) => ship.playerId));
    for (const [playerId, shipData] of this.clientShipPositions) {
      if (!currentShipIds.has(playerId)) {
        this.renderer.spawnExplosion(shipData.x, shipData.y, shipData.color);
        this.renderer.spawnShipDebris(shipData.x, shipData.y, shipData.color);
        this.clientShipPositions.delete(playerId);
      }
    }
    for (const shipState of incomingShips) {
      if (!shipState.alive) continue;
      const color = this.playerMgr.players.get(shipState.playerId)?.color.primary || "#ffffff";
      this.clientShipPositions.set(shipState.playerId, {
        x: shipState.x,
        y: shipState.y,
        color,
      });
    }

    const incomingPilots = state.pilots || [];
    const currentPilotIds = new Set(incomingPilots.map((pilot) => pilot.playerId));
    for (const [playerId, pilotData] of this.clientPilotPositions) {
      if (!currentPilotIds.has(playerId)) {
        this.renderer.spawnExplosion(pilotData.x, pilotData.y, "#ff0000");
        this.clientPilotPositions.delete(playerId);
      }
    }
    for (const pilotState of incomingPilots) {
      if (!pilotState.alive) continue;
      this.clientPilotPositions.set(pilotState.playerId, {
        x: pilotState.x,
        y: pilotState.y,
      });
    }

    const incomingAsteroids = state.asteroids || [];
    const currentAsteroidIds = new Set(incomingAsteroids.map((asteroid) => asteroid.id));
    for (const [asteroidId, asteroidData] of this.clientAsteroidStates) {
      if (!currentAsteroidIds.has(asteroidId)) {
        this.renderer.spawnExplosion(asteroidData.x, asteroidData.y, GAME_CONFIG.ASTEROID_COLOR);
        this.renderer.spawnAsteroidDebris(
          asteroidData.x,
          asteroidData.y,
          asteroidData.size,
          GAME_CONFIG.ASTEROID_COLOR,
        );
        this.clientAsteroidStates.delete(asteroidId);
      }
    }
    for (const asteroidState of incomingAsteroids) {
      if (!asteroidState.alive) continue;
      this.clientAsteroidStates.set(asteroidState.id, {
        x: asteroidState.x,
        y: asteroidState.y,
        size: asteroidState.size,
      });
    }

    const incomingMines = state.mines || [];
    for (const mineState of incomingMines) {
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

    const currentMineIds = new Set(incomingMines.map((mine) => mine.id));
    for (const mineId of this.clientArmingMines) {
      if (!currentMineIds.has(mineId)) this.clientArmingMines.delete(mineId);
    }
    for (const mineId of this.clientExplodedMines) {
      if (!currentMineIds.has(mineId)) this.clientExplodedMines.delete(mineId);
    }
  }

  private syncPlayerPowerUps(
    networkPlayerPowerUps: Record<string, PlayerPowerUp | null> | undefined,
  ): void {
    if (!networkPlayerPowerUps) return;
    const activePowerUpIds = new Set(Object.keys(networkPlayerPowerUps));
    for (const playerId of this.playerPowerUps.keys()) {
      if (!activePowerUpIds.has(playerId)) this.playerPowerUps.delete(playerId);
    }
    Object.entries(networkPlayerPowerUps).forEach(([playerId, powerUp]) => {
      this.playerPowerUps.set(playerId, powerUp);
    });
  }

  private trackSnapshotTiming(receivedAt: number): void {
    const smoothing = NETWORK_GAME_FEEL_TUNING.remoteSmoothing;
    if (this.lastSnapshotReceivedAtMs > 0) {
      const interval = receivedAt - this.lastSnapshotReceivedAtMs;
      this.snapshotIntervalMs = interval;
      const jitterSample = Math.abs(interval - smoothing.snapshotIntervalTargetMs);
      this.snapshotJitterMs =
        this.snapshotJitterMs * (1 - smoothing.snapshotJitterSmoothing) +
        jitterSample * smoothing.snapshotJitterSmoothing;
    }
    this.lastSnapshotReceivedAtMs = receivedAt;

    const targetDelay = this.clamp(
      smoothing.interpolationDelayBaseMs +
        this.snapshotJitterMs * smoothing.interpolationDelayJitterScale,
      smoothing.interpolationDelayMinMs,
      smoothing.interpolationDelayMaxMs,
    );
    this.interpolationDelayMs =
      this.interpolationDelayMs * (1 - smoothing.interpolationDelaySmoothing) +
      targetDelay * smoothing.interpolationDelaySmoothing;
    this.extrapolationCapMs = this.clamp(
      smoothing.extrapolationCapBaseMs +
        this.snapshotJitterMs * smoothing.extrapolationCapJitterScale,
      smoothing.extrapolationCapMinMs,
      smoothing.extrapolationCapMaxMs,
    );
  }

  private syncPlayerStatesFromNetwork(): void {
    if (this.network.isSimulationAuthority()) return;
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

    if (changed) this.onPlayersUpdate();
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpAngle(a: number, b: number, t: number): number {
    const delta = this.normalizeAngle(b - a);
    return a + delta * t;
  }

  private normalizeAngle(angle: number): number {
    let out = angle;
    while (out > Math.PI) out -= Math.PI * 2;
    while (out < -Math.PI) out += Math.PI * 2;
    return out;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
