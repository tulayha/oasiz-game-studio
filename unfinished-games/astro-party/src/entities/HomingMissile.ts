import { HomingMissileState, GAME_CONFIG } from "../types";

export class HomingMissile {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  alive: boolean = true;
  private targetId: string | null = null;
  private hasDetectedTarget: boolean = false;

  constructor(
    ownerId: string,
    x: number,
    y: number,
    angle: number,
    id: string,
  ) {
    this.id = id;
    this.ownerId = ownerId;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.spawnTime = Date.now();

    // Initial velocity in firing direction
    const speed = GAME_CONFIG.POWERUP_HOMING_MISSILE_SPEED;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
  }

  update(
    dt: number,
    ships: Map<string, { x: number; y: number; alive: boolean }>,
  ): void {
    if (!this.alive) return;

    // Check for targets within detection radius
    const detectionRadius = GAME_CONFIG.POWERUP_HOMING_MISSILE_DETECTION_RADIUS;
    let nearestDist = Infinity;
    let nearestId: string | null = null;
    let nearestX = 0;
    let nearestY = 0;

    for (const [playerId, ship] of ships) {
      if (playerId === this.ownerId || !ship.alive) continue;

      const dx = ship.x - this.x;
      const dy = ship.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Only detect targets within the detection radius
      if (dist <= detectionRadius && dist < nearestDist) {
        nearestDist = dist;
        nearestId = playerId;
        nearestX = ship.x;
        nearestY = ship.y;
      }
    }

    // Start homing only if a target is detected within radius
    if (nearestId) {
      this.targetId = nearestId;
      this.hasDetectedTarget = true;
    }

    // Homing behavior - only if we've detected a target
    if (this.hasDetectedTarget && this.targetId) {
      // Check if target still exists and is alive
      const target = ships.get(this.targetId);
      if (target && target.alive) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const targetAngle = Math.atan2(dy, dx);

        // Calculate angle difference
        let angleDiff = targetAngle - this.angle;
        // Normalize to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Apply turn rate with accuracy factor (makes it dodgeable)
        const turnRate = GAME_CONFIG.POWERUP_HOMING_MISSILE_TURN_RATE * dt;
        const accuracy = GAME_CONFIG.POWERUP_HOMING_MISSILE_ACCURACY;

        // Limit the turn to make it less accurate
        const maxTurn = turnRate * accuracy;
        const actualTurn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

        this.angle += actualTurn;
      } else {
        // Target lost, continue in current direction
        this.targetId = null;
      }
    }

    // Update velocity based on current angle
    const speed = GAME_CONFIG.POWERUP_HOMING_MISSILE_SPEED;
    this.vx = Math.cos(this.angle) * speed;
    this.vy = Math.sin(this.angle) * speed;

    // Update position
    this.x += this.vx * dt * 60; // Normalize to ~60fps
    this.y += this.vy * dt * 60;

    // Destroy if off screen (outside arena bounds + margin)
    const margin = 100;
    if (
      this.x < -margin ||
      this.x > GAME_CONFIG.ARENA_WIDTH + margin ||
      this.y < -margin ||
      this.y > GAME_CONFIG.ARENA_HEIGHT + margin
    ) {
      this.alive = false;
    }
  }

  isExpired(): boolean {
    return (
      Date.now() - this.spawnTime > GAME_CONFIG.POWERUP_HOMING_MISSILE_LIFETIME
    );
  }

  destroy(): void {
    this.alive = false;
  }

  getState(): HomingMissileState {
    return {
      id: this.id,
      ownerId: this.ownerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      angle: this.angle,
      spawnTime: this.spawnTime,
      alive: this.alive,
    };
  }
}
