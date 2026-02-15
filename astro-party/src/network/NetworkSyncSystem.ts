import { Renderer } from "../systems/Renderer";
import { NetworkManager } from "./NetworkManager";
import { PlayerManager } from "../managers/PlayerManager";
import { SettingsManager } from "../SettingsManager";
import {
  GAME_CONFIG,
  GameStateSync,
  MapId,
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
  hostTick: number;
  tickDurationMs: number;
  mapId?: MapId;
  yellowBlockHp?: number[];
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

  private snapshotJitterMs = 0;
  private snapshotIntervalMs = 0;
  private lastSnapshotReceivedAtMs = 0;
  private lastPlayerStateSyncMs = 0;
  private lastSnapshotAgeMs = 0;

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
  private clientShipPositions: Map<
    string,
    { x: number; y: number; color: string }
  > = new Map();
  private clientAsteroidStates: Map<string, { x: number; y: number; size: number }> =
    new Map();
  private clientPilotPositions: Map<string, { x: number; y: number }> = new Map();
  private lastAppliedHostTick = -1;

  constructor(
    private network: NetworkManager,
    private renderer: Renderer,
    private playerMgr: PlayerManager,
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private onPlayersUpdate: () => void,
  ) {}

  getRenderState(
    _myPlayerId: string | null = null,
    _latencyMs: number = 0,
  ): RenderNetworkState {
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
    const playerPowerUpsRecord: Record<string, PlayerPowerUp | null> = {};
    input.playerPowerUps.forEach((powerUp, playerId) => {
      playerPowerUpsRecord[playerId] = powerUp;
    });

    const state: GameStateSync = {
      ships: [...input.ships.values()].map((ship) => ship.getState()),
      pilots: [...input.pilots.values()].map((pilot) => pilot.getState(nowMs)),
      projectiles: input.projectiles.map((projectile) => projectile.getState()),
      asteroids: input.asteroids.map((asteroid) => asteroid.getState()),
      powerUps: input.powerUps.map((powerUp) => powerUp.getState(nowMs)),
      laserBeams: input.laserBeams.map((beam) => beam.getState()),
      mines: input.mines.map((mine) => mine.getState()),
      homingMissiles: input.homingMissiles.map((missile) => missile.getState()),
      turret: input.turret?.getState(),
      turretBullets: input.turretBullets.map((bullet) => bullet.getState()),
      playerPowerUps: playerPowerUpsRecord,
      rotationDirection: input.rotationDirection,
      screenShakeIntensity: input.screenShakeIntensity,
      screenShakeDuration: input.screenShakeDuration,
      hostTick: input.hostTick,
      tickDurationMs: input.tickDurationMs,
      mapId: input.mapId ?? 0,
      yellowBlockHp: input.yellowBlockHp ?? [],
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
    this.hostSimTimeMs = normalizedHostTick * normalizedTickDurationMs;

    this.trackSnapshotTiming(performance.now());
    this.syncPlayerStatesFromNetwork();

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
      const player = this.playerMgr.players.get(shipState.playerId);
      const color = player?.color.primary || "#ffffff";
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
        this.renderer.spawnExplosion(
          asteroidData.x,
          asteroidData.y,
          GAME_CONFIG.ASTEROID_COLOR,
        );
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
      if (!currentMineIds.has(mineId)) {
        this.clientArmingMines.delete(mineId);
      }
    }
    for (const mineId of this.clientExplodedMines) {
      if (!currentMineIds.has(mineId)) {
        this.clientExplodedMines.delete(mineId);
      }
    }

    this.networkShips = incomingShips;
    this.networkPilots = incomingPilots;
    this.networkProjectiles = state.projectiles || [];
    this.networkAsteroids = incomingAsteroids;
    this.networkPowerUps = state.powerUps || [];
    this.networkLaserBeams = state.laserBeams || [];
    this.networkMines = incomingMines;
    this.networkHomingMissiles = state.homingMissiles || [];
    this.networkTurret = state.turret ?? null;
    this.networkTurretBullets = state.turretBullets || [];
    this.networkMapId = (state.mapId ?? 0) as MapId;
    this.networkYellowBlockHp = state.yellowBlockHp || [];

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

    this.snapshotJitterMs = 0;
    this.snapshotIntervalMs = 0;
    this.lastSnapshotReceivedAtMs = 0;
    this.lastSnapshotAgeMs = 0;
    this.lastPlayerStateSyncMs = 0;
    this.hostSimTimeMs = 0;
    this.lastAppliedHostTick = -1;
  }

  clearClientTracking(): void {
    this.clientArmingMines.clear();
    this.clientExplodedMines.clear();
    this.clientShipPositions.clear();
    this.clientAsteroidStates.clear();
    this.clientPilotPositions.clear();
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

    this.lastAppliedHostTick = -1;
    this.hostSimTimeMs = 0;
  }

  getPredictionDebugTelemetry(): NetworkPredictionDebugTelemetry {
    return {
      predictionErrorPxLast: 0,
      predictionErrorPxEwma: 0,
      presentationLagPxLast: 0,
      presentationLagPxEwma: 0,
      wallCorrectionEvents: 0,
      wallOscillationEvents: 0,
      wallOscillationRatio: 0,
      hostNowBiasTicks: null,
      hostNowBiasMs: null,
      estimatedHostNowTick: null,
      latestSnapshotTick:
        this.lastAppliedHostTick >= 0 ? this.lastAppliedHostTick : null,
      capturedInputTick: null,
      latestHostAckTick: null,
      inputAckGapTicks: null,
      inputAckGapMs: null,
    };
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

    if (changed) {
      this.onPlayersUpdate();
    }
  }
}

