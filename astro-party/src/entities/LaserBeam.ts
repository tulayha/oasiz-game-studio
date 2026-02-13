import { LaserBeamState, GAME_CONFIG } from "../types";

export class LaserBeam {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  spawnTime: number;
  alive: boolean = true;
  private duration: number = 150; // ms - how long the beam stays visible

  constructor(
    ownerId: string,
    x: number,
    y: number,
    angle: number,
    id: string,
    spawnTimeMs: number,
  ) {
    this.id = id;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.spawnTime = spawnTimeMs;
  }

  isExpired(nowMs: number): boolean {
    return nowMs - this.spawnTime > this.duration;
  }

  getProgress(nowMs: number): number {
    const elapsed = nowMs - this.spawnTime;
    return Math.min(1, elapsed / this.duration);
  }

  destroy(): void {
    this.alive = false;
  }

  getState(): LaserBeamState {
    return {
      id: this.id,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      angle: this.angle,
      spawnTime: this.spawnTime,
      alive: this.alive,
    };
  }
}
