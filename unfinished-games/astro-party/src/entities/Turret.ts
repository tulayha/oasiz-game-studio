import Matter from "matter-js";
import { TurretState, GAME_CONFIG } from "../types";
import { Physics } from "../systems/Physics";

const { Body } = Matter;

export class Turret {
  body: Matter.Body;
  angle: number = 0;
  alive: boolean = true;
  private physics: Physics;
  private lastFireTime: number = 0;
  private fireCooldown: number = 1500; // 1.5 seconds between shots
  private detectionRadius: number = 300; // Radius to detect ships
  private orbitRadius: number = 50; // Visual orbit radius
  private fireAngleThreshold: number = 0.25; // Radians: must be roughly facing target

  // Current target info for visual purposes
  currentTargetId: string | null = null;
  targetAngle: number = 0;
  isTracking: boolean = false;

  constructor(physics: Physics, x: number, y: number) {
    this.physics = physics;
    this.body = physics.createTurret(x, y);
  }

  update(
    dt: number,
    shipPositions: Map<string, { x: number; y: number; alive: boolean }>,
  ): {
    shouldFire: boolean;
    fireAngle: number;
    targetId: string | null;
  } | null {
    if (!this.alive) return null;

    const now = Date.now();
    const turretX = this.body.position.x;
    const turretY = this.body.position.y;

    // Find nearest ship within detection radius
    let nearestShip: {
      id: string;
      x: number;
      y: number;
      distance: number;
    } | null = null;

    for (const [shipId, ship] of shipPositions) {
      if (!ship.alive) continue;

      const dx = ship.x - turretX;
      const dy = ship.y - turretY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.detectionRadius) {
        if (!nearestShip || distance < nearestShip.distance) {
          nearestShip = { id: shipId, x: ship.x, y: ship.y, distance };
        }
      }
    }

    if (nearestShip) {
      // Calculate angle to target
      const targetAngle = Math.atan2(
        nearestShip.y - turretY,
        nearestShip.x - turretX,
      );

      // Smoothly rotate turret toward target
      const angleDiff = targetAngle - this.angle;
      const normalizedDiff = Math.atan2(
        Math.sin(angleDiff),
        Math.cos(angleDiff),
      );
      const rotationSpeed = 4.0; // rad/s
      this.angle += normalizedDiff * rotationSpeed * dt;

      // Normalize angle
      this.angle = Math.atan2(Math.sin(this.angle), Math.cos(this.angle));

      // Update tracking info
      this.currentTargetId = nearestShip.id;
      this.targetAngle = targetAngle;
      this.isTracking = true;

      const postDiff = targetAngle - this.angle;
      const postNormalizedDiff = Math.atan2(
        Math.sin(postDiff),
        Math.cos(postDiff),
      );
      const isAligned = Math.abs(postNormalizedDiff) <= this.fireAngleThreshold;

      // Check if can fire (must be roughly aligned)
      if (isAligned && now - this.lastFireTime >= this.fireCooldown) {
        this.lastFireTime = now;
        return {
          shouldFire: true,
          fireAngle: this.angle,
          targetId: nearestShip.id,
        };
      }
    } else {
      // No target - slowly rotate
      this.angle += 0.5 * dt;
      this.isTracking = false;
      this.currentTargetId = null;
    }

    return null;
  }

  getState(): TurretState {
    return {
      id: this.body.id.toString(),
      x: this.body.position.x,
      y: this.body.position.y,
      angle: this.angle,
      alive: this.alive,
      detectionRadius: this.detectionRadius,
      orbitRadius: this.orbitRadius,
      isTracking: this.isTracking,
      targetAngle: this.targetAngle,
    };
  }

  getDetectionRadius(): number {
    return this.detectionRadius;
  }

  getOrbitRadius(): number {
    return this.orbitRadius;
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }
}
