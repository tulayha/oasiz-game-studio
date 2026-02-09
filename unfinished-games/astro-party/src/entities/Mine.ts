import { MineState, GAME_CONFIG } from "../types";

export class Mine {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  spawnTime: number;
  alive: boolean = true;
  exploded: boolean = false;
  explosionTime: number = 0;

  constructor(ownerId: string, x: number, y: number) {
    this.id = `mine_${Date.now()}_${Math.random()}`;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.spawnTime = Date.now();
  }

  isExpired(): boolean {
    if (this.exploded) {
      // Keep mine alive for explosion animation (500ms) + delay before cleanup
      return Date.now() - this.explosionTime > 2500; // 2.5 seconds total
    }
    return Date.now() - this.spawnTime > GAME_CONFIG.POWERUP_MINE_DESPAWN_TIME;
  }

  explode(): void {
    if (!this.exploded) {
      this.exploded = true;
      this.explosionTime = Date.now();
    }
  }

  isExploding(): boolean {
    return this.exploded && Date.now() - this.explosionTime < 500;
  }

  getExplosionProgress(): number {
    if (!this.exploded) return 0;
    const elapsed = Date.now() - this.explosionTime;
    return Math.min(1, elapsed / 500);
  }

  isExplosionComplete(): boolean {
    return this.exploded && Date.now() - this.explosionTime >= 500;
  }

  destroy(): void {
    this.alive = false;
  }

  getState(): MineState {
    return {
      id: this.id,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      spawnTime: this.spawnTime,
      alive: this.alive,
      exploded: this.exploded,
      explosionTime: this.explosionTime,
    };
  }
}
