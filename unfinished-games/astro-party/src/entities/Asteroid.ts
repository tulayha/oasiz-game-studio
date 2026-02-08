import Matter from "matter-js";
import { AsteroidState, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";

export class Asteroid {
  body: Matter.Body;
  alive: boolean = true;
  size: number;
  private physics: Physics;
  private vertices: { x: number; y: number }[];

  constructor(
    physics: Physics,
    x: number,
    y: number,
    velocity: { x: number; y: number },
    angularVelocity: number,
  ) {
    this.physics = physics;
    this.size =
      GAME_CONFIG.ASTEROID_MIN_SIZE +
      Math.random() *
        (GAME_CONFIG.ASTEROID_MAX_SIZE - GAME_CONFIG.ASTEROID_MIN_SIZE);

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

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
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
