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
  ) {
    this.id = `beam_${Date.now()}_${Math.random()}`;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.spawnTime = Date.now();
  }

  isExpired(): boolean {
    return Date.now() - this.spawnTime > this.duration;
  }

  getProgress(): number {
    const elapsed = Date.now() - this.spawnTime;
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
