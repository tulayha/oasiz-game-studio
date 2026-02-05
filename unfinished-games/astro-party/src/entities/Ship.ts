import Matter from "matter-js";
import { GAME_CONFIG, PlayerInput, ShipState, PlayerColor } from "../types";
import { Physics } from "../systems/Physics";

const { Body } = Matter;

export class Ship {
  body: Matter.Body;
  playerId: string;
  color: PlayerColor;
  alive: boolean = true;
  invulnerableUntil: number = 0;
  private lastFireTime: number = 0;
  private physics: Physics;

  constructor(
    physics: Physics,
    x: number,
    y: number,
    playerId: string,
    color: PlayerColor,
  ) {
    this.physics = physics;
    this.playerId = playerId;
    this.color = color;
    this.body = physics.createShip(x, y, playerId);
  }

  applyInput(
    input: PlayerInput,
    dt: number,
  ): { shouldFire: boolean; fireAngle: number } | null {
    if (!this.alive) return null;

    // Button A: Rotate clockwise
    if (input.buttonA) {
      Body.setAngularVelocity(this.body, 0);
      Body.rotate(this.body, GAME_CONFIG.ROTATION_SPEED * dt);
    }

    // Button A double-tap: Super Dash
    if (input.dashTriggered) {
      const angle = this.body.angle;
      Body.applyForce(this.body, this.body.position, {
        x: Math.cos(angle) * GAME_CONFIG.DASH_FORCE,
        y: Math.sin(angle) * GAME_CONFIG.DASH_FORCE,
      });
    }

    // Button B: Thrust AND Fire (inseparable)
    let fireResult: { shouldFire: boolean; fireAngle: number } | null = null;
    if (input.buttonB) {
      // Thrust
      const angle = this.body.angle;
      Body.applyForce(this.body, this.body.position, {
        x: Math.cos(angle) * GAME_CONFIG.THRUST_FORCE,
        y: Math.sin(angle) * GAME_CONFIG.THRUST_FORCE,
      });

      // Fire (with cooldown)
      const now = Date.now();
      if (now - this.lastFireTime > GAME_CONFIG.FIRE_COOLDOWN) {
        this.lastFireTime = now;
        fireResult = {
          shouldFire: true,
          fireAngle: angle,
        };
      }
    }

    return fireResult;
  }

  getFirePosition(): { x: number; y: number } {
    const angle = this.body.angle;
    const noseDistance = 18; // Distance from center to nose
    return {
      x: this.body.position.x + Math.cos(angle) * noseDistance,
      y: this.body.position.y + Math.sin(angle) * noseDistance,
    };
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  respawn(x: number, y: number): void {
    this.body = this.physics.createShip(x, y, this.playerId);
    this.alive = true;
    this.invulnerableUntil = Date.now() + GAME_CONFIG.INVULNERABLE_TIME;
    Body.setVelocity(this.body, { x: 0, y: 0 });
    Body.setAngularVelocity(this.body, 0);
  }

  isInvulnerable(): boolean {
    return Date.now() < this.invulnerableUntil;
  }

  getState(): ShipState {
    return {
      id: this.body.id.toString(),
      playerId: this.playerId,
      x: this.body.position.x,
      y: this.body.position.y,
      angle: this.body.angle,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      alive: this.alive,
      invulnerableUntil: this.invulnerableUntil,
    };
  }

  updateFromState(state: ShipState): void {
    if (!this.alive) return;
    Body.setPosition(this.body, { x: state.x, y: state.y });
    Body.setAngle(this.body, state.angle);
    Body.setVelocity(this.body, { x: state.vx, y: state.vy });
    this.invulnerableUntil = state.invulnerableUntil;
  }
}
