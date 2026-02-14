import Matter from "matter-js";
import { AsteroidState, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";

export type AsteroidTier = "LARGE" | "SMALL";
export type AsteroidVariant = "ORANGE" | "GREY";

export class Asteroid {
  body: Matter.Body;
  alive: boolean = true;
  size: number;
  tier: AsteroidTier;
  variant: AsteroidVariant;
  hp: number;
  maxHp: number;
  private physics: Physics;
  private vertices: { x: number; y: number }[];

  constructor(
    physics: Physics,
    x: number,
    y: number,
    velocity: { x: number; y: number },
    angularVelocity: number,
    tier: AsteroidTier = "LARGE",
    size?: number,
    variant: AsteroidVariant = "ORANGE",
  ) {
    this.physics = physics;
    this.tier = tier;
    this.variant = variant;

    if (variant === "GREY") {
      // Grey asteroids are smaller
      const minSize = GAME_CONFIG.GREY_ASTEROID_MIN;
      const maxSize = GAME_CONFIG.GREY_ASTEROID_MAX;
      this.size = size ?? minSize + Math.random() * (maxSize - minSize);
      // Grey asteroids take 2-3 shots
      this.hp = 2 + Math.floor(Math.random() * 2); // 2 or 3
      this.maxHp = this.hp;
    } else {
      const minSize =
        tier === "LARGE"
          ? GAME_CONFIG.ASTEROID_LARGE_MIN
          : GAME_CONFIG.ASTEROID_SMALL_MIN;
      const maxSize =
        tier === "LARGE"
          ? GAME_CONFIG.ASTEROID_LARGE_MAX
          : GAME_CONFIG.ASTEROID_SMALL_MAX;
      this.size = size ?? minSize + Math.random() * (maxSize - minSize);
      this.hp = 1;
      this.maxHp = 1;
    }

    // Generate random jagged vertices for the asteroid
    this.vertices = this.generateVertices();

    this.body = physics.createAsteroid(x, y, this.vertices, velocity);

    // Set angular velocity for rotation
    Matter.Body.setAngularVelocity(this.body, angularVelocity);
  }

  private generateVertices(): { x: number; y: number }[] {
    const vertices: { x: number; y: number }[] = [];
    const numVertices =
      GAME_CONFIG.ASTEROID_VERTICES_MIN +
      Math.floor(
        Math.random() *
          (GAME_CONFIG.ASTEROID_VERTICES_MAX -
            GAME_CONFIG.ASTEROID_VERTICES_MIN +
            1),
      );

    for (let i = 0; i < numVertices; i++) {
      const angle = (i / numVertices) * Math.PI * 2;
      // Add some randomness to the radius for jagged edges
      const radiusVariation = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
      vertices.push({
        x: Math.cos(angle) * this.size * radiusVariation,
        y: Math.sin(angle) * this.size * radiusVariation,
      });
    }

    return vertices;
  }

  /** Returns true if the asteroid was destroyed by this hit */
  hit(): boolean {
    this.hp--;
    if (this.hp <= 0) {
      return true;
    }
    return false;
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  isLarge(): boolean {
    return this.tier === "LARGE";
  }

  isGrey(): boolean {
    return this.variant === "GREY";
  }

  getColor(): string {
    return this.variant === "GREY"
      ? GAME_CONFIG.GREY_ASTEROID_COLOR
      : GAME_CONFIG.ASTEROID_COLOR;
  }

  getGlow(): string {
    return this.variant === "GREY"
      ? GAME_CONFIG.GREY_ASTEROID_GLOW
      : GAME_CONFIG.ASTEROID_GLOW;
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
      variant: this.variant,
      hp: this.hp,
      maxHp: this.maxHp,
    };
  }
}
