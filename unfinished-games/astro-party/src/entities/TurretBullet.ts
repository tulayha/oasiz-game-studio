import Matter from "matter-js";
import { TurretBulletState, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";

export class TurretBullet {
  body: Matter.Body;
  spawnTime: number;
  alive: boolean = true;
  exploded: boolean = false;
  explosionTime: number = 0;
  hasProcessedExplosion: boolean = false; // Track if explosion damage was already processed
  private physics: Physics;
  private lifetime: number = 3000; // 3 seconds lifetime
  private explosionRadius: number = 100; // Same as mine explosion radius

  constructor(physics: Physics, x: number, y: number, angle: number) {
    this.physics = physics;
    this.spawnTime = Date.now();

    // Create bullet with high speed in the locked direction
    const speed = 12;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    this.body = physics.createTurretBullet(x, y, vx, vy);
  }

  update(dt: number): boolean {
    if (!this.alive) return false;

    // Check if expired
    if (Date.now() - this.spawnTime > this.lifetime && !this.exploded) {
      this.explode();
      return true; // Still alive but exploded
    }

    return !this.exploded || Date.now() - this.explosionTime < 500;
  }

  explode(): void {
    if (this.exploded) return;

    this.exploded = true;
    this.explosionTime = Date.now();
    this.hasProcessedExplosion = false; // Reset for new explosion

    // Stop the bullet
    Matter.Body.setVelocity(this.body, { x: 0, y: 0 });
  }

  checkExplosionHits(
    shipPositions: Map<string, { x: number; y: number; alive: boolean }>,
  ): string[] {
    if (!this.exploded) return [];

    const hitShips: string[] = [];
    const bulletX = this.body.position.x;
    const bulletY = this.body.position.y;

    for (const [shipId, ship] of shipPositions) {
      if (!ship.alive) continue;

      const dx = ship.x - bulletX;
      const dy = ship.y - bulletY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.explosionRadius) {
        hitShips.push(shipId);
      }
    }

    return hitShips;
  }

  isExpired(): boolean {
    if (this.exploded) {
      return Date.now() - this.explosionTime > 500; // 500ms explosion duration
    }
    return Date.now() - this.spawnTime > this.lifetime;
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  getState(): TurretBulletState {
    return {
      id: this.body.id.toString(),
      x: this.body.position.x,
      y: this.body.position.y,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      angle: Math.atan2(this.body.velocity.y, this.body.velocity.x),
      spawnTime: this.spawnTime,
      alive: this.alive,
      exploded: this.exploded,
      explosionTime: this.explosionTime,
    };
  }

  getExplosionRadius(): number {
    return this.explosionRadius;
  }
}
