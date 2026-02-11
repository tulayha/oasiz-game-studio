import Matter from "matter-js";
import { AsteroidState, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";
import { SeededRNG } from "../systems/SeededRNG";

type AsteroidTier = "LARGE" | "SMALL";

export class Asteroid {
  body: Matter.Body;
  alive: boolean = true;
  size: number;
  tier: AsteroidTier;
  private physics: Physics;
  private vertices: { x: number; y: number }[];
  private rng: SeededRNG;

  constructor(
    physics: Physics,
    x: number,
    y: number,
    velocity: { x: number; y: number },
    angularVelocity: number,
    tier: AsteroidTier = "LARGE",
    size?: number,
    rng?: SeededRNG,
  ) {
    this.physics = physics;
    this.tier = tier;
    this.rng = rng ?? new SeededRNG(Date.now() >>> 0);
    const minSize =
      tier === "LARGE"
        ? GAME_CONFIG.ASTEROID_LARGE_MIN
        : GAME_CONFIG.ASTEROID_SMALL_MIN;
    const maxSize =
      tier === "LARGE"
        ? GAME_CONFIG.ASTEROID_LARGE_MAX
        : GAME_CONFIG.ASTEROID_SMALL_MAX;
    this.size = size ?? minSize + this.rng.next() * (maxSize - minSize);

    // Generate random jagged vertices for the asteroid
    this.vertices = this.generateVertices();

    this.body = physics.createAsteroid(x, y, this.vertices, velocity);

    // Set angular velocity for rotation
    Matter.Body.setAngularVelocity(this.body, angularVelocity);
  }

  private generateVertices(): { x: number; y: number }[] {
    const vertices: { x: number; y: number }[] = [];
    const numVertices = this.rng.nextInt(
      GAME_CONFIG.ASTEROID_VERTICES_MIN,
      GAME_CONFIG.ASTEROID_VERTICES_MAX,
    );

    for (let i = 0; i < numVertices; i++) {
      const angle = (i / numVertices) * Math.PI * 2;
      // Add some randomness to the radius for jagged edges
      const radiusVariation = 0.7 + this.rng.next() * 0.6; // 0.7 to 1.3
      vertices.push({
        x: Math.cos(angle) * this.size * radiusVariation,
        y: Math.sin(angle) * this.size * radiusVariation,
      });
    }

    return vertices;
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  isLarge(): boolean {
    return this.tier === "LARGE";
  }

  getState(): AsteroidState {
    return {
      id: this.body.id.toString(),
      x: this.body.position.x,
      y: this.body.position.y,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      angle: this.body.angle,
      angularVelocity: this.body.angularVelocity,
      size: this.size,
      alive: this.alive,
      vertices: this.vertices,
    };
  }
}
