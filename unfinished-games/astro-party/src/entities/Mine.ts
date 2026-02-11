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
  arming: boolean = false; // Mine is arming (waiting 1 second before exploding)
  armingStartTime: number = 0;
  triggeringPlayerId: string | undefined = undefined; // Player who triggered the mine

  constructor(ownerId: string, x: number, y: number, id: string) {
    this.id = id;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.spawnTime = performance.now();
  }

  isExpired(): boolean {
    if (this.exploded) {
      // Keep mine alive for:
      // - 500ms explosion animation
      // - Ship debris animation (up to 1400ms)
      // - 2s delay before round end
      // - Extra buffer for client sync
      return performance.now() - this.explosionTime > 4500; // 4.5 seconds total
    }
    // Mines no longer expire - they stay until hit or round ends
    return false;
  }

  // Trigger arming sequence (short delay before explosion)
  triggerArming(): void {
    if (!this.arming && !this.exploded) {
      this.arming = true;
      this.armingStartTime = performance.now();
    }
  }

  // Check if arming is complete and should explode
  checkArmingComplete(): boolean {
    if (this.arming && !this.exploded) {
      return performance.now() - this.armingStartTime >= 400; // 400ms delay - quick reaction
    }
    return false;
  }

  isArming(): boolean {
    return this.arming && !this.exploded;
  }

  explode(): void {
    if (!this.exploded) {
      this.exploded = true;
      this.explosionTime = performance.now();
    }
  }

  isExploding(): boolean {
    return this.exploded && performance.now() - this.explosionTime < 500;
  }

  getExplosionProgress(): number {
    if (!this.exploded) return 0;
    const elapsed = performance.now() - this.explosionTime;
    return Math.min(1, elapsed / 500);
  }

  isExplosionComplete(): boolean {
    return this.exploded && performance.now() - this.explosionTime >= 500;
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
      arming: this.arming,
      armingStartTime: this.armingStartTime,
      triggeringPlayerId: this.triggeringPlayerId,
    };
  }
}
