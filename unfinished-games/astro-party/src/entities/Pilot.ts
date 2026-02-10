import Matter from "matter-js";
import { PilotState, GAME_CONFIG, PlayerInput } from "../types";
import { GameConfig } from "../GameConfig";
import { Physics } from "../systems/Physics";

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

  constructor(
    physics: Physics,
    x: number,
    y: number,
    playerId: string,
    inheritedVelocity: Matter.Vector,
    controlMode: "player" | "ai",
    initialAngle: number,
    initialAngularVelocity: number = 0,
  ) {
    this.physics = physics;
    this.playerId = playerId;
    this.spawnTime = Date.now();
    this.controlMode = controlMode;
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
    threats: { x: number; y: number }[],
    input?: PlayerInput,
    rotationDirection: number = 1,
  ): void {
    if (!this.alive) return;

    if (this.controlMode === "player") {
      if (input) {
        this.applyInput(input, rotationDirection, dt);
      }
      return;
    }

    this.aiThinkTimer -= dt;
    if (this.aiThinkTimer <= 0) {
      this.aiThinkTimer = 0.3; // Think every 300ms
      this.updateAI(threats);
    }

    // Apply movement toward target direction
    const speed = 0.00005;
    Body.applyForce(this.body, this.body.position, {
      x: this.targetDirection.x * speed,
      y: this.targetDirection.y * speed,
    });
  }

  applyInput(input: PlayerInput, rotationDirection: number, dt: number): void {
    const cfg = GameConfig.config;
    let angle = this.body.angle;

    if (input.buttonA) {
      Body.setAngularVelocity(this.body, 0);
      Body.rotate(this.body, cfg.PILOT_ROTATION_SPEED * dt * rotationDirection);
      angle = this.body.angle;
    }

    const now = performance.now();
    if (input.buttonB && now - this.lastDashTime >= cfg.PILOT_DASH_COOLDOWN) {
      this.lastDashTime = now;
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
      // Run away from threat
      const dx = this.body.position.x - nearestThreat.x;
      const dy = this.body.position.y - nearestThreat.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        this.targetDirection = { x: dx / len, y: dy / len };
      }
    } else {
      // Drift randomly
      if (Math.random() < 0.2) {
        const angle = Math.random() * Math.PI * 2;
        this.targetDirection = {
          x: Math.cos(angle),
          y: Math.sin(angle),
        };
      }
    }
  }

  hasSurvived(): boolean {
    return Date.now() - this.spawnTime >= GAME_CONFIG.PILOT_SURVIVAL_TIME;
  }

  getSurvivalProgress(): number {
    return Math.min(
      1,
      (Date.now() - this.spawnTime) / GAME_CONFIG.PILOT_SURVIVAL_TIME,
    );
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  getState(): PilotState {
    return {
      id: this.body.id.toString(),
      playerId: this.playerId,
      x: this.body.position.x,
      y: this.body.position.y,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      angle: this.body.angle,
      spawnTime: this.spawnTime,
      alive: this.alive,
    };
  }
}
