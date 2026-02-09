import Matter from "matter-js";
import { ProjectileState, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";

export class Projectile {
  body: Matter.Body;
  ownerId: string;
  spawnTime: number;
  private physics: Physics;

  private lifetime: number;

  constructor(
    physics: Physics,
    x: number,
    y: number,
    angle: number,
    ownerId: string,
    speed?: number,
    lifetime?: number,
  ) {
    this.physics = physics;
    this.ownerId = ownerId;
    this.spawnTime = Date.now();
    this.lifetime = lifetime ?? GAME_CONFIG.PROJECTILE_LIFETIME;
    this.body = physics.createProjectile(x, y, angle, ownerId, speed);
  }

  isExpired(): boolean {
    return Date.now() - this.spawnTime > this.lifetime;
  }

  destroy(): void {
    this.physics.removeBody(this.body);
  }

  getState(): ProjectileState {
    return {
      id: this.body.id.toString(),
      ownerId: this.ownerId,
      x: this.body.position.x,
      y: this.body.position.y,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      spawnTime: this.spawnTime,
    };
  }
}
