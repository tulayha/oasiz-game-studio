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

  constructor(
    ownerId: string,
    x: number,
    y: number,
    id: string,
    spawnTimeMs: number,
  ) {
    this.id = id;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.spawnTime = spawnTimeMs;
  }

  isExpired(nowMs: number): boolean {
    if (this.exploded) {
      // Keep mine alive for:
      // - 500ms explosion animation
      // - Ship debris animation (up to 1400ms)
      // - 2s delay before round end
      // - Extra buffer for client sync
      return nowMs - this.explosionTime > 4500; // 4.5 seconds total
    }
    // Mines no longer expire - they stay until hit or round ends
    return false;
  }

  // Trigger arming sequence (short delay before explosion)
  triggerArming(nowMs: number): void {
    if (!this.arming && !this.exploded) {
      this.arming = true;
      this.armingStartTime = nowMs;
    }
  }

  // Check if arming is complete and should explode
  checkArmingComplete(nowMs: number): boolean {
    if (this.arming && !this.exploded) {
      return nowMs - this.armingStartTime >= 400; // 400ms delay - quick reaction
    }
    return false;
  }

  isArming(): boolean {
    return this.arming && !this.exploded;
  }

  explode(nowMs: number): void {
    if (!this.exploded) {
      this.exploded = true;
      this.explosionTime = nowMs;
    }
  }

  isExploding(nowMs: number): boolean {
    return this.exploded && nowMs - this.explosionTime < 500;
  }

  getExplosionProgress(nowMs: number): number {
    if (!this.exploded) return 0;
    const elapsed = nowMs - this.explosionTime;
    return Math.min(1, elapsed / 500);
  }

  isExplosionComplete(nowMs: number): boolean {
    return this.exploded && nowMs - this.explosionTime >= 500;
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
