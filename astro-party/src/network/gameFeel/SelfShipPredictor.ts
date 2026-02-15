import { GameConfig } from "../../GameConfig";
import { BaseGameMode, PlayerInput, ShipState, GAME_CONFIG } from "../../types";
import {
  SHIP_DODGE_ANGLE_DEG,
  SHIP_DODGE_COOLDOWN_MS,
} from "../../../shared/sim/constants";
import { NETWORK_GAME_FEEL_TUNING } from "./NetworkGameFeelTuning";

const SELF_TUNING = NETWORK_GAME_FEEL_TUNING.selfPrediction;
const REPLAY_STEP_SEC = SELF_TUNING.replayStepSec;
const HARD_SNAP_THRESHOLD_PX = SELF_TUNING.hardSnapThresholdPx;
const SOFT_BLEND_THRESHOLD_PX = SELF_TUNING.softBlendThresholdPx;

interface PendingInputEntry {
  sequence: number;
  input: PlayerInput;
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
  private pendingInputs: PendingInputEntry[] = [];
  private latestAckSequence = 0;
  private latestCapturedSequence = 0;
  private lastStepAtMs = 0;
  private dashQueued = false;
  private lastDashAtMs = -SHIP_DODGE_COOLDOWN_MS;
  private dashTimerSec = 0;
  private dashVectorX = 0;
  private dashVectorY = 0;
  private predictionErrorPxLast = 0;
  private predictionErrorPxEwma = 0;
  private correctionEvents = 0;
  private hardSnapEvents = 0;

  captureInput(input: PlayerInput): void {
    this.currentInput = { ...input };
    this.latestCapturedSequence = Math.max(
      this.latestCapturedSequence,
      input.inputSequence,
    );
  }

  recordSentInput(input: PlayerInput): void {
    const sequence = input.inputSequence;
    if (!Number.isFinite(sequence) || sequence <= 0) return;
    if (this.pendingInputs.some((entry) => entry.sequence === sequence)) return;
    this.pendingInputs.push({
      sequence,
      input: { ...input },
    });
    if (this.pendingInputs.length > SELF_TUNING.pendingInputLimit) {
      this.pendingInputs.shift();
    }
  }

  queueDash(): void {
    this.dashQueued = true;
  }

  ingestAuthoritative(
    authoritativeShip: ShipState | null,
    ackSequence: number | null,
    nowMs: number,
    rotationDirection: number,
    baseMode: BaseGameMode,
  ): void {
    if (!authoritativeShip) {
      this.predictedShip = null;
      this.pendingInputs = [];
      this.dashQueued = false;
      this.lastStepAtMs = nowMs;
      return;
    }

    if (Number.isFinite(ackSequence) && (ackSequence as number) >= 0) {
      this.latestAckSequence = Math.max(
        this.latestAckSequence,
        Math.floor(ackSequence as number),
      );
      this.pendingInputs = this.pendingInputs.filter(
        (entry) => entry.sequence > this.latestAckSequence,
      );
    }

    const previousPrediction = this.predictedShip
      ? { ...this.predictedShip }
      : null;

    const rebasedShip: ShipState = { ...authoritativeShip };
    for (const pending of this.pendingInputs) {
      this.applyPredictionStep(
        rebasedShip,
        pending.input,
        REPLAY_STEP_SEC,
        rotationDirection,
        baseMode,
      );
    }

    if (previousPrediction) {
      const error = Math.hypot(
        rebasedShip.x - previousPrediction.x,
        rebasedShip.y - previousPrediction.y,
      );
      this.predictionErrorPxLast = error;
      this.predictionErrorPxEwma = this.predictionErrorPxEwma * 0.9 + error * 0.1;
      if (error > SELF_TUNING.correctionThresholdPx) {
        this.correctionEvents += 1;
      }

      if (error >= HARD_SNAP_THRESHOLD_PX) {
        this.hardSnapEvents += 1;
        this.predictedShip = rebasedShip;
      } else if (error >= SOFT_BLEND_THRESHOLD_PX) {
        const blend = SELF_TUNING.softBlendFactor;
        this.predictedShip = {
          ...rebasedShip,
          x: previousPrediction.x + (rebasedShip.x - previousPrediction.x) * blend,
          y: previousPrediction.y + (rebasedShip.y - previousPrediction.y) * blend,
          vx: previousPrediction.vx + (rebasedShip.vx - previousPrediction.vx) * blend,
          vy: previousPrediction.vy + (rebasedShip.vy - previousPrediction.vy) * blend,
          angle:
            previousPrediction.angle +
            this.shortestAngleDelta(previousPrediction.angle, rebasedShip.angle) * blend,
        };
      } else {
        this.predictedShip = rebasedShip;
      }
    } else {
      this.predictedShip = rebasedShip;
      this.predictionErrorPxLast = 0;
    }

    this.lastStepAtMs = nowMs;
  }

  step(
    nowMs: number,
    rotationDirection: number,
    baseMode: BaseGameMode,
  ): void {
    if (!this.predictedShip) {
      this.lastStepAtMs = nowMs;
      return;
    }

    if (this.lastStepAtMs <= 0) {
      this.lastStepAtMs = nowMs;
      return;
    }

    const dtSec = Math.min(
      SELF_TUNING.maxFrameStepSec,
      Math.max(0, (nowMs - this.lastStepAtMs) / 1000),
    );
    if (dtSec <= 0) return;
    this.lastStepAtMs = nowMs;

    this.applyPredictionStep(
      this.predictedShip,
      this.currentInput,
      dtSec,
      rotationDirection,
      baseMode,
    );
  }

  getPredictedShip(): ShipState | null {
    return this.predictedShip ? { ...this.predictedShip } : null;
  }

  getTelemetry(): SelfPredictionTelemetry {
    return {
      predictionErrorPxLast: this.predictionErrorPxLast,
      predictionErrorPxEwma: this.predictionErrorPxEwma,
      correctionEvents: this.correctionEvents,
      hardSnapEvents: this.hardSnapEvents,
      capturedInputSequence: this.latestCapturedSequence,
      latestAckSequence: this.latestAckSequence,
    };
  }

  clear(): void {
    this.predictedShip = null;
    this.pendingInputs = [];
    this.dashQueued = false;
    this.lastDashAtMs = -SHIP_DODGE_COOLDOWN_MS;
    this.dashTimerSec = 0;
    this.dashVectorX = 0;
    this.dashVectorY = 0;
    this.lastStepAtMs = 0;
    this.predictionErrorPxLast = 0;
    this.predictionErrorPxEwma = 0;
    this.correctionEvents = 0;
    this.hardSnapEvents = 0;
    this.latestAckSequence = 0;
    this.latestCapturedSequence = 0;
  }

  private applyPredictionStep(
    ship: ShipState,
    input: PlayerInput,
    dtSec: number,
    rotationDirection: number,
    baseMode: BaseGameMode,
  ): void {
    if (!ship.alive) return;
    const cfg = GameConfig.config;
    const isStandard = baseMode === "STANDARD";

    if (input.buttonA) {
      ship.angle += cfg.ROTATION_SPEED * dtSec * rotationDirection;
      ship.angle = this.normalizeAngle(ship.angle);
    }

    if (this.dashQueued) {
      this.dashQueued = false;
      if (input.timestamp - this.lastDashAtMs >= SHIP_DODGE_COOLDOWN_MS) {
        this.lastDashAtMs = input.timestamp;
        const dodgeAngle =
          ship.angle + ((SHIP_DODGE_ANGLE_DEG * Math.PI) / 180) * rotationDirection;
        this.dashVectorX = Math.cos(dodgeAngle);
        this.dashVectorY = Math.sin(dodgeAngle);
        this.dashTimerSec = cfg.SHIP_DASH_DURATION;
      }
    }

    if (this.dashTimerSec > 0) {
      this.dashTimerSec = Math.max(0, this.dashTimerSec - dtSec);
      if (this.dashTimerSec <= 0) {
        this.dashVectorX = 0;
        this.dashVectorY = 0;
      }
    }

    const desiredSpeed = cfg.SHIP_TARGET_SPEED;
    const desiredVx =
      Math.cos(ship.angle) * desiredSpeed + this.dashVectorX * cfg.SHIP_DASH_BOOST;
    const desiredVy =
      Math.sin(ship.angle) * desiredSpeed + this.dashVectorY * cfg.SHIP_DASH_BOOST;

    const response = isStandard
      ? cfg.SHIP_SPEED_RESPONSE
      : cfg.SHIP_SPEED_RESPONSE * SELF_TUNING.nonStandardResponseScale;
    const t = 1 - Math.exp(-Math.max(0.0001, response) * dtSec);
    ship.vx += (desiredVx - ship.vx) * t;
    ship.vy += (desiredVy - ship.vy) * t;

    ship.x += ship.vx * dtSec * 60;
    ship.y += ship.vy * dtSec * 60;

    ship.x = Math.max(0, Math.min(GAME_CONFIG.ARENA_WIDTH, ship.x));
    ship.y = Math.max(0, Math.min(GAME_CONFIG.ARENA_HEIGHT, ship.y));
  }

  private normalizeAngle(angle: number): number {
    let out = angle;
    while (out > Math.PI) out -= Math.PI * 2;
    while (out < -Math.PI) out += Math.PI * 2;
    return out;
  }

  private shortestAngleDelta(from: number, to: number): number {
    return this.normalizeAngle(to - from);
  }
}
