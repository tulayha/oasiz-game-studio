import Matter from "matter-js";
import { GameConfig } from "../../GameConfig";
import {
  AsteroidState,
  BaseGameMode,
  GameStateSync,
  PlayerInput,
  ShipState,
  GAME_CONFIG,
} from "../../types";
import { ARENA_PADDING, SHIP_DODGE_COOLDOWN_MS } from "../../../shared/sim/constants";
import {
  SHIP_COLLIDER_VERTICES,
  cloneShapeVertices,
} from "../../../shared/geometry/EntityShapes";
import { updateShips } from "../../../shared/sim/ShipSystem";
import { NETWORK_GAME_FEEL_TUNING } from "./NetworkGameFeelTuning";

const { Engine, Bodies, Body, Composite } = Matter;

const SELF_TUNING = NETWORK_GAME_FEEL_TUNING.selfPrediction;
const FIXED_STEP_SEC = SELF_TUNING.fixedStepSec;
const MAX_STEPS_PER_FRAME = SELF_TUNING.maxPredictionStepsPerFrame;
const MAX_ACCUMULATOR_SEC = SELF_TUNING.maxPredictionAccumulatorSec;
const HISTORY_LIMIT_STEPS = SELF_TUNING.historyLimitSteps;
const HARD_SNAP_THRESHOLD_PX = SELF_TUNING.hardSnapThresholdPx;
const CORRECTION_OFFSET_DECAY_PER_SEC = SELF_TUNING.correctionOffsetDecayPerSec;
const MAX_RENDER_OFFSET_PX = SELF_TUNING.maxRenderOffsetPx;

interface PredictionStepEntry {
  sequence: number;
  input: PlayerInput;
  dashQueued: boolean;
}

export interface SelfPredictionTelemetry {
  predictionErrorPxLast: number;
  predictionErrorPxEwma: number;
  correctionEvents: number;
  hardSnapEvents: number;
  capturedInputSequence: number;
  latestAckSequence: number;
}

export class SelfShipPredictor {
  private predictedShip: ShipState | null = null;
  private currentInput: PlayerInput = {
    buttonA: false,
    buttonB: false,
    timestamp: 0,
    clientTimeMs: 0,
    inputSequence: 0,
  };
  private latestAckSequence = 0;
  private latestSentSequence = 0;
  private latestCapturedSequence = 0;
  private predictionHistory: PredictionStepEntry[] = [];
  private lastRenderStepAtMs = 0;
  private stepAccumulatorSec = 0;
  private dashQueued = false;
  private renderOffsetX = 0;
  private renderOffsetY = 0;
  private predictionErrorPxLast = 0;
  private predictionErrorPxEwma = 0;
  private correctionEvents = 0;
  private hardSnapEvents = 0;
  private simPlayer: any = null;
  private simPlayers = new Map<string, any>();
  private simPlayerOrder: string[] = [];
  private simPlayerPowerUps = new Map<string, any>();
  private simNowMs = 0;
  private simEntityCounter = 0;

  private engine = Engine.create({
    gravity: { x: 0, y: 0 },
  });
  private shipBody = this.createShipBody();
  private wallBodies: Matter.Body[] = [];
  private asteroidBodies = new Map<string, Matter.Body>();
  private remoteShipBodies = new Map<string, Matter.Body>();
  private turretBody: Matter.Body | null = null;

  constructor() {
    Composite.add(this.engine.world, this.shipBody);
    this.createWalls();
  }

  captureInput(input: PlayerInput): void {
    if (!SELF_TUNING.enabled) return;
    const sequence = Math.max(this.latestSentSequence, input.inputSequence || 0);
    this.currentInput = {
      ...input,
      inputSequence: sequence,
    };
    this.latestCapturedSequence = Math.max(this.latestCapturedSequence, sequence);
  }

  recordSentInput(input: PlayerInput): void {
    if (!SELF_TUNING.enabled) return;
    const sequence = input.inputSequence;
    if (!Number.isFinite(sequence) || sequence <= 0) return;
    this.latestSentSequence = Math.max(this.latestSentSequence, Math.floor(sequence));
    this.currentInput.inputSequence = Math.max(
      this.currentInput.inputSequence,
      this.latestSentSequence,
    );
    this.latestCapturedSequence = Math.max(
      this.latestCapturedSequence,
      this.latestSentSequence,
    );
  }

  queueDash(): void {
    if (!SELF_TUNING.enabled) return;
    this.dashQueued = true;
  }

  ingestAuthoritative(
    authoritativeShip: ShipState | null,
    ackSequence: number | null,
    renderNowMs: number,
    authoritativeSimNowMs: number,
    rotationDirection: number,
    baseMode: BaseGameMode,
    snapshotState?: GameStateSync,
  ): void {
    if (!authoritativeShip) {
      this.predictedShip = null;
      this.predictionHistory = [];
      this.dashQueued = false;
      this.renderOffsetX = 0;
      this.renderOffsetY = 0;
      this.stepAccumulatorSec = 0;
      this.simPlayer = null;
      this.simPlayers.clear();
      this.simPlayerOrder = [];
      this.simPlayerPowerUps.clear();
      this.lastRenderStepAtMs = renderNowMs;
      return;
    }

    if (!SELF_TUNING.enabled) {
      this.predictedShip = { ...authoritativeShip };
      this.renderOffsetX = 0;
      this.renderOffsetY = 0;
      this.stepAccumulatorSec = 0;
      this.simNowMs = authoritativeSimNowMs;
      this.lastRenderStepAtMs = renderNowMs;
      return;
    }

    if (Number.isFinite(ackSequence) && (ackSequence as number) >= 0) {
      this.latestAckSequence = Math.max(
        this.latestAckSequence,
        Math.floor(ackSequence as number),
      );
    }

    if (snapshotState) {
      this.syncObstacleBodies(snapshotState);
    }

    const replaySteps = this.predictionHistory.filter(
      (entry) => entry.sequence > this.latestAckSequence,
    );
    const previousPrediction = this.predictedShip ? { ...this.predictedShip } : null;

    this.predictedShip = { ...authoritativeShip };
    this.simNowMs = authoritativeSimNowMs;
    this.ensureSimPlayer(this.predictedShip, authoritativeSimNowMs);
    this.syncSimPowerUp(snapshotState, authoritativeShip.playerId);
    this.syncShipBodyFromState(this.predictedShip);

    for (const step of replaySteps) {
      this.applyPredictionStep(
        step.input,
        FIXED_STEP_SEC,
        rotationDirection,
        baseMode,
        step.dashQueued,
      );
    }

    this.predictionHistory = replaySteps.slice(-HISTORY_LIMIT_STEPS);

    if (previousPrediction && this.predictedShip) {
      const targetPrediction = { ...this.predictedShip };
      const correctionX = targetPrediction.x - previousPrediction.x;
      const correctionY = targetPrediction.y - previousPrediction.y;
      const error = Math.hypot(correctionX, correctionY);
      this.predictionErrorPxLast = error;
      this.predictionErrorPxEwma = this.predictionErrorPxEwma * 0.9 + error * 0.1;
      const lifecycleChanged = previousPrediction.alive !== targetPrediction.alive;
      if (lifecycleChanged) {
        this.renderOffsetX = 0;
        this.renderOffsetY = 0;
      } else if (error > SELF_TUNING.correctionThresholdPx) {
        this.correctionEvents += 1;
        if (error >= HARD_SNAP_THRESHOLD_PX) {
          this.hardSnapEvents += 1;
          this.renderOffsetX = 0;
          this.renderOffsetY = 0;
        } else {
          this.renderOffsetX -= correctionX;
          this.renderOffsetY -= correctionY;
          const offsetMag = Math.hypot(this.renderOffsetX, this.renderOffsetY);
          if (offsetMag > MAX_RENDER_OFFSET_PX) {
            const scale = MAX_RENDER_OFFSET_PX / offsetMag;
            this.renderOffsetX *= scale;
            this.renderOffsetY *= scale;
          }
        }
      }
      this.predictedShip = targetPrediction;
      this.syncShipBodyFromState(this.predictedShip);
      if (this.simPlayer) {
        this.simPlayer.ship = this.predictedShip;
      }
    } else {
      this.predictionErrorPxLast = 0;
    }

    this.lastRenderStepAtMs = renderNowMs;
    this.stepAccumulatorSec = this.clamp(this.stepAccumulatorSec, 0, FIXED_STEP_SEC);
  }

  step(
    nowMs: number,
    rotationDirection: number,
    baseMode: BaseGameMode,
  ): void {
    if (!SELF_TUNING.enabled) return;
    if (!this.predictedShip || !this.predictedShip.alive) {
      this.lastRenderStepAtMs = nowMs;
      this.stepAccumulatorSec = 0;
      return;
    }

    if (this.lastRenderStepAtMs <= 0) {
      this.lastRenderStepAtMs = nowMs;
      return;
    }

    const dtSec = this.clamp(
      (nowMs - this.lastRenderStepAtMs) / 1000,
      0,
      SELF_TUNING.maxFrameStepSec,
    );
    this.lastRenderStepAtMs = nowMs;
    if (dtSec <= 0) return;

    this.stepAccumulatorSec = Math.min(
      MAX_ACCUMULATOR_SEC,
      this.stepAccumulatorSec + dtSec,
    );

    let steps = 0;
    while (
      this.stepAccumulatorSec >= FIXED_STEP_SEC &&
      steps < MAX_STEPS_PER_FRAME
    ) {
      const dashForStep = this.consumeDashQueued();
      const liveInput = {
        ...this.currentInput,
        inputSequence: Math.max(
          this.currentInput.inputSequence,
          this.latestSentSequence,
        ),
      };
      this.applyPredictionStep(
        liveInput,
        FIXED_STEP_SEC,
        rotationDirection,
        baseMode,
        dashForStep,
      );
      this.recordPredictionStep(liveInput, dashForStep);
      this.stepAccumulatorSec -= FIXED_STEP_SEC;
      this.decayRenderOffset(FIXED_STEP_SEC);
      steps += 1;
    }

    if (steps >= MAX_STEPS_PER_FRAME && this.stepAccumulatorSec > FIXED_STEP_SEC) {
      this.stepAccumulatorSec = FIXED_STEP_SEC;
    }
  }

  getPredictedShip(_nowMs: number = performance.now()): ShipState | null {
    if (!SELF_TUNING.enabled) return null;
    if (!this.predictedShip) return null;
    return {
      ...this.predictedShip,
      x: this.clamp(
        this.predictedShip.x + this.renderOffsetX,
        0,
        GAME_CONFIG.ARENA_WIDTH,
      ),
      y: this.clamp(
        this.predictedShip.y + this.renderOffsetY,
        0,
        GAME_CONFIG.ARENA_HEIGHT,
      ),
    };
  }

  getTelemetry(): SelfPredictionTelemetry {
    return {
      predictionErrorPxLast: this.predictionErrorPxLast,
      predictionErrorPxEwma: this.predictionErrorPxEwma,
      correctionEvents: this.correctionEvents,
      hardSnapEvents: this.hardSnapEvents,
      capturedInputSequence: Math.max(
        this.latestCapturedSequence,
        this.latestSentSequence,
      ),
      latestAckSequence: this.latestAckSequence,
    };
  }

  clear(): void {
    this.predictedShip = null;
    this.predictionHistory = [];
    this.dashQueued = false;
    this.renderOffsetX = 0;
    this.renderOffsetY = 0;
    this.lastRenderStepAtMs = 0;
    this.stepAccumulatorSec = 0;
    this.predictionErrorPxLast = 0;
    this.predictionErrorPxEwma = 0;
    this.correctionEvents = 0;
    this.hardSnapEvents = 0;
    this.latestAckSequence = 0;
    this.latestSentSequence = 0;
    this.latestCapturedSequence = 0;
    this.simPlayer = null;
    this.simPlayers.clear();
    this.simPlayerOrder = [];
    this.simPlayerPowerUps.clear();
    this.simNowMs = 0;
    this.simEntityCounter = 0;
    this.asteroidBodies.forEach((body) => {
      Composite.remove(this.engine.world, body);
    });
    this.asteroidBodies.clear();
    this.remoteShipBodies.forEach((body) => {
      Composite.remove(this.engine.world, body);
    });
    this.remoteShipBodies.clear();
    if (this.turretBody) {
      Composite.remove(this.engine.world, this.turretBody);
      this.turretBody = null;
    }
  }

  private consumeDashQueued(): boolean {
    if (!this.dashQueued) return false;
    this.dashQueued = false;
    return true;
  }

  private recordPredictionStep(input: PlayerInput, dashQueued: boolean): void {
    const sequence = Math.max(0, this.latestSentSequence, input.inputSequence || 0);
    this.predictionHistory.push({
      sequence,
      input: {
        ...input,
        timestamp: this.simNowMs,
        clientTimeMs: this.simNowMs,
        inputSequence: sequence,
      },
      dashQueued,
    });

    if (this.predictionHistory.length > HISTORY_LIMIT_STEPS) {
      this.predictionHistory.splice(0, this.predictionHistory.length - HISTORY_LIMIT_STEPS);
    }
  }

  private applyPredictionStep(
    input: PlayerInput,
    dtSec: number,
    rotationDirection: number,
    baseMode: BaseGameMode,
    dashQueued: boolean,
  ): void {
    if (!this.predictedShip || !this.predictedShip.alive || !this.simPlayer) return;

    this.syncWallMaterials();
    this.syncShipBodyMaterial();
    this.simNowMs += dtSec * 1000;

    this.simPlayer.input = {
      ...this.simPlayer.input,
      buttonA: input.buttonA,
      buttonB: input.buttonB,
      timestamp: this.simNowMs,
      clientTimeMs: Number.isFinite(input.clientTimeMs)
        ? input.clientTimeMs
        : this.simNowMs,
      inputSequence: Number.isFinite(input.inputSequence)
        ? input.inputSequence
        : this.simPlayer.input.inputSequence,
    };

    const firePressed = Boolean(input.buttonB);
    if (firePressed && !this.simPlayer.fireButtonHeld) {
      this.simPlayer.fireRequested = true;
      this.simPlayer.firePressStartMs = this.simNowMs;
    } else if (!firePressed && this.simPlayer.fireButtonHeld) {
      this.simPlayer.fireRequested = false;
      this.simPlayer.firePressStartMs = 0;
    }
    this.simPlayer.fireButtonHeld = firePressed;

    this.simPlayer.state = this.simPlayer.ship.alive ? "ACTIVE" : "SPECTATING";
    if (dashQueued) {
      this.simPlayer.dashQueued = true;
    }

    updateShips(this.buildShipSimAdapter(rotationDirection, baseMode), dtSec);
    Engine.update(this.engine, dtSec * 1000);
    this.syncShipStateFromBody();
  }

  private ensureSimPlayer(authoritativeShip: ShipState, nowMs: number): void {
    if (!this.predictedShip) return;
    if (!this.simPlayer || this.simPlayer.id !== authoritativeShip.playerId) {
      const player: any = {
        id: authoritativeShip.playerId,
        sessionId: null,
        name: "predict",
        isBot: false,
        botType: null,
        colorIndex: 0,
        kills: 0,
        roundWins: 0,
        state: authoritativeShip.alive ? "ACTIVE" : "SPECTATING",
        input: {
          buttonA: false,
          buttonB: false,
          timestamp: nowMs,
          clientTimeMs: nowMs,
          inputSequence: 0,
        },
        latestInputSequence: 0,
        lastProcessedInputSequence: 0,
        reportedRttMs: 0,
        dashQueued: false,
        botThinkAtMs: 0,
        botLastDecisionMs: 0,
        botCachedAction: {
          buttonA: false,
          buttonB: false,
          dash: false,
        },
        fireButtonHeld: false,
        fireRequested: false,
        firePressStartMs: 0,
        lastShipDashAtMs: nowMs - SHIP_DODGE_COOLDOWN_MS - 1,
        dashTimerSec: 0,
        dashVectorX: 0,
        dashVectorY: 0,
        recoilTimerSec: 0,
        angularVelocity: 0,
        ship: this.predictedShip,
      };
      this.simPlayer = player;
      this.simPlayers.clear();
      this.simPlayers.set(player.id, player);
      this.simPlayerOrder = [player.id];
      return;
    }

    this.simPlayer.ship = this.predictedShip;
    this.simPlayer.state = authoritativeShip.alive ? "ACTIVE" : "SPECTATING";
  }

  private syncSimPowerUp(
    snapshotState: GameStateSync | undefined,
    playerId: string,
  ): void {
    this.simPlayerPowerUps.clear();
    if (!snapshotState?.playerPowerUps) return;
    this.simPlayerPowerUps.set(
      playerId,
      snapshotState.playerPowerUps[playerId] ?? null,
    );
  }

  private buildShipSimAdapter(
    rotationDirection: number,
    baseMode: BaseGameMode,
  ): any {
    const activeConfig = this.buildActiveConfig();
    const noop = () => {};
    return {
      players: this.simPlayers,
      playerOrder: this.simPlayerOrder,
      playerPowerUps: this.simPlayerPowerUps,
      baseMode,
      rotationDirection,
      nowMs: this.simNowMs,
      projectiles: [],
      laserBeams: [],
      mines: [],
      homingMissiles: [],
      asteroids: [],
      pilots: new Map(),
      hooks: {
        onSound: noop,
        onDashParticles: noop,
      },
      getActiveConfig: () => activeConfig,
      setShipAngle: (playerId: string, angle: number) => {
        if (!this.simPlayer || playerId !== this.simPlayer.id) return;
        Body.setAngle(this.shipBody, angle);
      },
      setShipVelocity: (playerId: string, vx: number, vy: number) => {
        if (!this.simPlayer || playerId !== this.simPlayer.id) return;
        Body.setVelocity(this.shipBody, { x: vx, y: vy });
      },
      setShipAngularVelocity: (playerId: string, angularVelocity: number) => {
        if (!this.simPlayer || playerId !== this.simPlayer.id) return;
        this.simPlayer.angularVelocity = angularVelocity;
        Body.setAngularVelocity(this.shipBody, angularVelocity);
      },
      applyShipForce: (playerId: string, x: number, y: number) => {
        if (!this.simPlayer || playerId !== this.simPlayer.id) return;
        Body.applyForce(this.shipBody, this.shipBody.position, { x, y });
      },
      nextEntityId: (prefix: string) => {
        this.simEntityCounter += 1;
        return prefix + "_predict_" + this.simEntityCounter.toString();
      },
      getLagCompensatedShipPose: () => null,
      getLagCompensationRewindMs: () => 0,
      triggerScreenShake: noop,
      onShipHit: noop,
      killPilot: noop,
      destroyAsteroid: noop,
    };
  }

  private buildActiveConfig(): any {
    const cfg = GameConfig.config;
    return {
      BASE_THRUST: cfg.BASE_THRUST,
      ROTATION_SPEED: cfg.ROTATION_SPEED,
      ROTATION_THRUST_BONUS: cfg.ROTATION_THRUST_BONUS,
      RECOIL_FORCE: cfg.RECOIL_FORCE,
      DASH_FORCE: cfg.DASH_FORCE,
      SHIP_FRICTION_AIR: cfg.SHIP_FRICTION_AIR,
      SHIP_RESTITUTION: cfg.SHIP_RESTITUTION,
      SHIP_TARGET_SPEED: cfg.SHIP_TARGET_SPEED,
      SHIP_SPEED_RESPONSE: cfg.SHIP_SPEED_RESPONSE,
      SHIP_DASH_BOOST: cfg.SHIP_DASH_BOOST,
      SHIP_DASH_DURATION: cfg.SHIP_DASH_DURATION,
      SHIP_RECOIL_SLOWDOWN: cfg.SHIP_RECOIL_SLOWDOWN,
      SHIP_RECOIL_DURATION: cfg.SHIP_RECOIL_DURATION,
      PROJECTILE_SPEED: cfg.PROJECTILE_SPEED,
      PILOT_ROTATION_SPEED: cfg.PILOT_ROTATION_SPEED,
      PILOT_DASH_FORCE: cfg.PILOT_DASH_FORCE,
    };
  }

  private createWalls(): void {
    const thickness = ARENA_PADDING;
    const wallOpts = {
      isStatic: true,
      label: "predictor_wall",
      restitution: GameConfig.physics.WALL_RESTITUTION,
      friction: GameConfig.physics.WALL_FRICTION,
    };
    this.wallBodies = [
      Bodies.rectangle(
        GAME_CONFIG.ARENA_WIDTH / 2,
        -thickness / 2,
        GAME_CONFIG.ARENA_WIDTH + thickness * 2,
        thickness,
        wallOpts,
      ),
      Bodies.rectangle(
        GAME_CONFIG.ARENA_WIDTH / 2,
        GAME_CONFIG.ARENA_HEIGHT + thickness / 2,
        GAME_CONFIG.ARENA_WIDTH + thickness * 2,
        thickness,
        wallOpts,
      ),
      Bodies.rectangle(
        -thickness / 2,
        GAME_CONFIG.ARENA_HEIGHT / 2,
        thickness,
        GAME_CONFIG.ARENA_HEIGHT + thickness * 2,
        wallOpts,
      ),
      Bodies.rectangle(
        GAME_CONFIG.ARENA_WIDTH + thickness / 2,
        GAME_CONFIG.ARENA_HEIGHT / 2,
        thickness,
        GAME_CONFIG.ARENA_HEIGHT + thickness * 2,
        wallOpts,
      ),
    ];
    Composite.add(this.engine.world, this.wallBodies);
  }

  private createShipBody(): Matter.Body {
    return this.createShipLikeBody(
      GAME_CONFIG.ARENA_WIDTH * 0.5,
      GAME_CONFIG.ARENA_HEIGHT * 0.5,
      "predictor_ship",
    );
  }

  private syncObstacleBodies(state: GameStateSync): void {
    this.syncAsteroidBodies(state.asteroids || []);
    const selfPlayerId = this.predictedShip?.playerId ?? null;
    this.syncRemoteShipBodies(state.ships || [], selfPlayerId);
    if (state.turret && state.turret.alive) {
      if (!this.turretBody) {
        this.turretBody = Bodies.circle(state.turret.x, state.turret.y, 20, {
          isStatic: true,
          label: "predictor_turret",
        });
        Composite.add(this.engine.world, this.turretBody);
      }
      Body.setPosition(this.turretBody, { x: state.turret.x, y: state.turret.y });
    } else if (this.turretBody) {
      Composite.remove(this.engine.world, this.turretBody);
      this.turretBody = null;
    }
  }

  private syncRemoteShipBodies(
    ships: ShipState[],
    selfPlayerId: string | null,
  ): void {
    const seen = new Set<string>();
    for (const ship of ships) {
      if (!ship.alive) continue;
      if (selfPlayerId && ship.playerId === selfPlayerId) continue;
      seen.add(ship.playerId);

      let body = this.remoteShipBodies.get(ship.playerId);
      if (!body) {
        body = this.createShipLikeBody(ship.x, ship.y, "predictor_remote_ship");
        body.restitution = GameConfig.config.SHIP_RESTITUTION;
        body.frictionAir = GameConfig.config.SHIP_FRICTION_AIR;
        this.remoteShipBodies.set(ship.playerId, body);
        Composite.add(this.engine.world, body);
      }

      Body.setPosition(body, { x: ship.x, y: ship.y });
      Body.setVelocity(body, { x: ship.vx, y: ship.vy });
      Body.setAngle(body, ship.angle);
      Body.setAngularVelocity(body, 0);
    }

    for (const [playerId, body] of this.remoteShipBodies) {
      if (seen.has(playerId)) continue;
      Composite.remove(this.engine.world, body);
      this.remoteShipBodies.delete(playerId);
    }
  }

  private syncAsteroidBodies(asteroids: AsteroidState[]): void {
    const seen = new Set<string>();
    for (const asteroid of asteroids) {
      if (!asteroid.alive) continue;
      seen.add(asteroid.id);
      let body = this.asteroidBodies.get(asteroid.id);
      if (!body) {
        const vertices = asteroid.vertices.map((point) => ({
          x: point.x,
          y: point.y,
        }));
        if (vertices.length >= 3) {
          const result = Bodies.fromVertices(asteroid.x, asteroid.y, [vertices], {
            label: "predictor_asteroid",
            frictionAir: 0,
            restitution: 0.9,
            friction: 0,
            density: 0.001,
          });
          body = this.resolveBodyFromVertices(result, () =>
            Bodies.circle(asteroid.x, asteroid.y, Math.max(6, asteroid.size), {
              label: "predictor_asteroid",
              frictionAir: 0,
              restitution: 0.9,
              friction: 0,
              density: 0.001,
            }),
          );
        } else {
          body = Bodies.circle(asteroid.x, asteroid.y, Math.max(6, asteroid.size), {
            label: "predictor_asteroid",
            frictionAir: 0,
            restitution: 0.9,
            friction: 0,
            density: 0.001,
          });
        }
        this.asteroidBodies.set(asteroid.id, body);
        Composite.add(this.engine.world, body);
      }
      Body.setPosition(body, { x: asteroid.x, y: asteroid.y });
      Body.setVelocity(body, { x: asteroid.vx, y: asteroid.vy });
      Body.setAngle(body, asteroid.angle);
      Body.setAngularVelocity(body, asteroid.angularVelocity);
    }

    for (const [asteroidId, body] of this.asteroidBodies) {
      if (seen.has(asteroidId)) continue;
      Composite.remove(this.engine.world, body);
      this.asteroidBodies.delete(asteroidId);
    }
  }

  private syncShipBodyFromState(ship: ShipState): void {
    Body.setPosition(this.shipBody, { x: ship.x, y: ship.y });
    Body.setVelocity(this.shipBody, { x: ship.vx, y: ship.vy });
    Body.setAngle(this.shipBody, ship.angle);
    Body.setAngularVelocity(this.shipBody, 0);
  }

  private syncShipStateFromBody(): void {
    if (!this.predictedShip) return;
    this.predictedShip.x = this.shipBody.position.x;
    this.predictedShip.y = this.shipBody.position.y;
    this.predictedShip.vx = this.shipBody.velocity.x;
    this.predictedShip.vy = this.shipBody.velocity.y;
    this.predictedShip.angle = this.normalizeAngle(this.shipBody.angle);
  }

  private syncShipBodyMaterial(): void {
    this.shipBody.restitution = GameConfig.config.SHIP_RESTITUTION;
    this.shipBody.friction = 0;
    this.shipBody.frictionAir = GameConfig.config.SHIP_FRICTION_AIR;
  }

  private syncWallMaterials(): void {
    const restitution = GameConfig.physics.WALL_RESTITUTION;
    const friction = GameConfig.physics.WALL_FRICTION;
    for (const wall of this.wallBodies) {
      wall.restitution = restitution;
      wall.friction = friction;
    }
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

  private decayRenderOffset(dtSec: number): void {
    if (this.renderOffsetX === 0 && this.renderOffsetY === 0) return;
    const decay = this.clamp(dtSec * CORRECTION_OFFSET_DECAY_PER_SEC, 0, 1);
    const keep = 1 - decay;
    this.renderOffsetX *= keep;
    this.renderOffsetY *= keep;
    if (Math.abs(this.renderOffsetX) < 0.01) this.renderOffsetX = 0;
    if (Math.abs(this.renderOffsetY) < 0.01) this.renderOffsetY = 0;
  }

  private createShipLikeBody(x: number, y: number, label: string): Matter.Body {
    const result = Bodies.fromVertices(
      x,
      y,
      [cloneShapeVertices(SHIP_COLLIDER_VERTICES)],
      {
        label,
        frictionAir: 0,
        restitution: 0,
        friction: 0,
        density: 0.001,
      },
    );
    return this.resolveBodyFromVertices(result, () =>
      Bodies.polygon(x, y, 3, 12, {
        label,
        frictionAir: 0,
        restitution: 0,
        friction: 0,
        density: 0.001,
      }),
    );
  }

  private resolveBodyFromVertices(
    result: Matter.Body | Matter.Body[],
    fallback: () => Matter.Body,
  ): Matter.Body {
    if (Array.isArray(result)) {
      return result[0] ?? fallback();
    }
    return result;
  }
}
