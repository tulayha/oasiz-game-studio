import Matter from "matter-js";
import { PilotState, GAME_CONFIG, PlayerInput } from "../types";
import { GameConfig } from "../GameConfig";
import { Physics } from "../systems/Physics";
import { SeededRNG } from "../systems/SeededRNG";

const { Body } = Matter;

export class Pilot {
  body: Matter.Body;
  playerId: string;
  spawnTime: number;
  alive: boolean = true;
  controlMode: "player" | "ai";
  private lastDashTime: number = 0;
  private physics: Physics;
  private aiThinkTimer: number = 0;
  private targetDirection: { x: number; y: number } = { x: 0, y: 0 };
  private aiTargetAngle: number = 0;
  private aiShouldDash: boolean = false;
  private rng: SeededRNG;

  constructor(
    physics: Physics,
    x: number,
    y: number,
    playerId: string,
    inheritedVelocity: Matter.Vector,
    controlMode: "player" | "ai",
    initialAngle: number,
    initialAngularVelocity: number = 0,
    rng: SeededRNG,
    spawnTimeMs: number,
  ) {
    this.physics = physics;
    this.playerId = playerId;
    this.spawnTime = spawnTimeMs;
    this.controlMode = controlMode;
    this.rng = rng;
    const cfg = GameConfig.config;
    this.lastDashTime = -cfg.PILOT_DASH_COOLDOWN - 1;
    this.body = physics.createPilot(
      x,
      y,
      playerId,
      inheritedVelocity,
      initialAngle,
      initialAngularVelocity,
    );
  }

  update(
    dt: number,
    nowMs: number,
    threats: { x: number; y: number }[],
    input?: PlayerInput,
    rotationDirection: number = 1,
  ): void {
    if (!this.alive) return;

    if (this.controlMode === "player") {
      if (input) {
        this.applyInput(input, rotationDirection, dt, nowMs);
      }
      return;
    }

    this.aiThinkTimer -= dt;
    if (this.aiThinkTimer <= 0) {
      this.aiThinkTimer = 0.3; // Think every 300ms
      this.updateAI(threats);
    }

    const angleDiff = this.normalizeAngle(
      this.aiTargetAngle - this.body.angle,
    );
    const shouldRotate = Math.abs(angleDiff) > 0.35;
    const shouldDash = this.aiShouldDash && Math.abs(angleDiff) <= 0.35;
    this.applyInput(
      {
        buttonA: shouldRotate,
        buttonB: shouldDash,
        timestamp: nowMs,
        clientTimeMs: nowMs,
      },
      rotationDirection,
      dt,
      nowMs,
    );
  }

  applyInput(
    input: PlayerInput,
    rotationDirection: number,
    dt: number,
    nowMs: number,
  ): void {
    const cfg = GameConfig.config;
    let angle = this.body.angle;

    if (input.buttonA) {
      Body.setAngularVelocity(this.body, 0);
      Body.rotate(this.body, cfg.PILOT_ROTATION_SPEED * dt * rotationDirection);
      angle = this.body.angle;
    }

    if (
      input.buttonB &&
      nowMs - this.lastDashTime >= cfg.PILOT_DASH_COOLDOWN
    ) {
      this.lastDashTime = nowMs;
      Body.applyForce(this.body, this.body.position, {
        x: Math.cos(angle) * cfg.PILOT_DASH_FORCE,
        y: Math.sin(angle) * cfg.PILOT_DASH_FORCE,
      });
    }
  }

  private updateAI(threats: { x: number; y: number }[]): void {
    // Find nearest threat
    let nearestThreat: { x: number; y: number } | null = null;
    let nearestDist = Infinity;

    for (const threat of threats) {
      const dx = threat.x - this.body.position.x;
      const dy = threat.y - this.body.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < nearestDist && dist < 200) {
        nearestDist = dist;
        nearestThreat = threat;
      }
    }

    if (nearestThreat) {
      const dx = this.body.position.x - nearestThreat.x;
      const dy = this.body.position.y - nearestThreat.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        this.targetDirection = { x: dx / len, y: dy / len };
        this.aiTargetAngle = Math.atan2(
          this.targetDirection.y,
          this.targetDirection.x,
        );
        this.aiShouldDash = nearestDist < 140;
      }
    } else {
      this.aiShouldDash = false;
      if (this.rng.next() < 0.3) {
        const angle = this.rng.next() * Math.PI * 2;
        this.targetDirection = {
          x: Math.cos(angle),
          y: Math.sin(angle),
        };
        this.aiTargetAngle = angle;
        this.aiShouldDash = this.rng.next() < 0.25;
      }
    }
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  hasSurvived(nowMs: number): boolean {
    return nowMs - this.spawnTime >= GAME_CONFIG.PILOT_SURVIVAL_TIME;
  }

  getSurvivalProgress(nowMs: number): number {
    return Math.min(
      1,
      (nowMs - this.spawnTime) / GAME_CONFIG.PILOT_SURVIVAL_TIME,
    );
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  getState(nowMs: number): PilotState {
    return {
      id: this.body.id.toString(),
      playerId: this.playerId,
      x: this.body.position.x,
      y: this.body.position.y,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      angle: this.body.angle,
      spawnTime: this.spawnTime,
      survivalProgress: this.getSurvivalProgress(nowMs),
      alive: this.alive,
    };
  }
}
