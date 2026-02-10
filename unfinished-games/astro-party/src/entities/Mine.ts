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
      // Keep mine alive for:
      // - 500ms explosion animation
      // - Ship debris animation (up to 1400ms)
      // - 2s delay before round end
      // - Extra buffer for client sync
      return Date.now() - this.explosionTime > 4500; // 4.5 seconds total
    }
    // Mines no longer expire - they stay until hit or round ends
    return false;
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
