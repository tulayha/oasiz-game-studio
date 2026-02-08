import Matter from "matter-js";
import { PowerUpState, PowerUpType, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";

export class PowerUp {
  body: Matter.Body;
  alive: boolean = true;
  type: PowerUpType;
  spawnTime: number;
  private physics: Physics;

  constructor(physics: Physics, x: number, y: number, type: PowerUpType) {
    this.physics = physics;
    this.type = type;
    this.spawnTime = Date.now();
    this.body = physics.createPowerUp(x, y, type);
  }

  isExpired(): boolean {
    return Date.now() - this.spawnTime > GAME_CONFIG.POWERUP_DESPAWN_TIME;
  }

  getRemainingTime(): number {
    const elapsed = Date.now() - this.spawnTime;
    return Math.max(0, GAME_CONFIG.POWERUP_DESPAWN_TIME - elapsed);
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  getState(): PowerUpState {
    return {
      id: this.body.id.toString(),
      x: this.body.position.x,
      y: this.body.position.y,
      type: this.type,
      spawnTime: this.spawnTime,
      alive: this.alive,
    };
  }
}
