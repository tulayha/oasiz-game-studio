import Matter from "matter-js";
import { PowerUpState, PowerUpType, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";

const { Body } = Matter;

export class PowerUp {
  body: Matter.Body;
  alive: boolean = true;
  type: PowerUpType;
  spawnTime: number;
  private physics: Physics;

  // Magnetic properties
  private magneticRadius: number = 50; // Detection radius for magnetic pull (REDUCED)
  private magneticSpeed: number = 120; // Speed at which powerup moves toward player (pixels per second)
  private isMagneticActive: boolean = false;
  private targetPlayerId: string | null = null;

  constructor(physics: Physics, x: number, y: number, type: PowerUpType) {
    this.physics = physics;
    this.type = type;
    this.spawnTime = Date.now();
    this.body = physics.createPowerUp(x, y, type);
  }

  isExpired(): boolean {
    return Date.now() - this.spawnTime > GAME_CONFIG.POWERUP_DESPAWN_TIME;
  }

  getRemainingTime(): number {
    const elapsed = Date.now() - this.spawnTime;
    return Math.max(0, GAME_CONFIG.POWERUP_DESPAWN_TIME - elapsed);
  }

  update(
    shipPositions: Map<
      string,
      { x: number; y: number; alive: boolean; hasPowerUp: boolean }
    >,
    dt: number,
  ): void {
    if (!this.alive) return;

    const powerUpX = this.body.position.x;
    const powerUpY = this.body.position.y;

    // Find nearest ship without power-up within magnetic radius
    let nearestShip: {
      id: string;
      x: number;
      y: number;
      distance: number;
    } | null = null;

    for (const [shipId, ship] of shipPositions) {
      if (!ship.alive || ship.hasPowerUp) continue;

      const dx = ship.x - powerUpX;
      const dy = ship.y - powerUpY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.magneticRadius) {
        if (!nearestShip || distance < nearestShip.distance) {
          nearestShip = { id: shipId, x: ship.x, y: ship.y, distance };
        }
      }
    }

    if (nearestShip) {
      // Move toward the nearest ship (magnetic effect)
      const dx = nearestShip.x - powerUpX;
      const dy = nearestShip.y - powerUpY;
      const angle = Math.atan2(dy, dx);

      // Calculate new position (powerups are static, so we manually move them)
      const moveDistance = this.magneticSpeed * dt; // Frame-rate independent
      const newX = powerUpX + Math.cos(angle) * moveDistance;
      const newY = powerUpY + Math.sin(angle) * moveDistance;

      // Set position directly (since body is static)
      Body.setPosition(this.body, { x: newX, y: newY });

      this.isMagneticActive = true;
      this.targetPlayerId = nearestShip.id;
    } else {
      // No target in range - stop moving
      if (this.isMagneticActive) {
        this.isMagneticActive = false;
        this.targetPlayerId = null;
      }
    }
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  getState(): PowerUpState {
    const remaining = Math.max(
      0,
      GAME_CONFIG.POWERUP_DESPAWN_TIME - (Date.now() - this.spawnTime),
    );
    return {
      id: this.body.id.toString(),
      x: this.body.position.x,
      y: this.body.position.y,
      type: this.type,
      spawnTime: this.spawnTime,
      remainingTimeFraction: remaining / GAME_CONFIG.POWERUP_DESPAWN_TIME,
      alive: this.alive,
      magneticRadius: this.magneticRadius,
      isMagneticActive: this.isMagneticActive,
    };
  }

  getMagneticRadius(): number {
    return this.magneticRadius;
  }

  getIsMagneticActive(): boolean {
    return this.isMagneticActive;
  }
}
