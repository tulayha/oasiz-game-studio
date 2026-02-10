import Matter from "matter-js";
import { GAME_CONFIG, PlayerInput, ShipState, PlayerColor } from "../types";
import { GameConfig } from "../GameConfig";
import { Physics } from "../systems/Physics";

const { Body } = Matter;

export class Ship {
  body: Matter.Body;
  playerId: string;
  color: PlayerColor;
  alive: boolean = true;
  invulnerableUntil: number = 0;
  private lastFireTime: number = 0;
  private physics: Physics;
  private dashTimer: number = 0;
  private recoilTimer: number = 0;

  // Ammo system
  ammo: number = 3;
  maxAmmo: number = 3;
  lastShotTime: number = 0;
  reloadStartTime: number = 0;
  isReloading: boolean = false;

  constructor(
    physics: Physics,
    x: number,
    y: number,
    playerId: string,
    color: PlayerColor,
    initialAngle: number = 0,
  ) {
    this.physics = physics;
    this.playerId = playerId;
    this.color = color;
    this.body = physics.createShip(x, y, playerId);
    // Set initial facing direction
    Body.setAngle(this.body, initialAngle);
  }

  applyInput(
    input: PlayerInput,
    dash: boolean,
    dt: number,
    rotationDirection: number = 1,
    speedMultiplier: number = 1,
  ): { shouldFire: boolean; fireAngle: number } | null {
    if (!this.alive) return null;

    const angle = this.body.angle;
    const cfg = GameConfig.config;
    const mode = GameConfig.getMode();

    if (mode === "STANDARD") {
      // Prevent uncontrolled spin from collisions
      Body.setAngularVelocity(this.body, 0);

      if (input.buttonA) {
        // Apply rotation direction multiplier (1 = normal/cw, -1 = reversed/ccw)
        Body.rotate(this.body, cfg.ROTATION_SPEED * dt * rotationDirection);
      }

      if (dash) {
        this.dashTimer = cfg.SHIP_DASH_DURATION;
      }

      if (this.dashTimer > 0) {
        this.dashTimer = Math.max(0, this.dashTimer - dt);
      }

      if (this.recoilTimer > 0) {
        this.recoilTimer = Math.max(0, this.recoilTimer - dt);
      }

      const dashBoost = this.dashTimer > 0 ? cfg.SHIP_DASH_BOOST : 0;
      const recoilSlowdown =
        this.recoilTimer > 0 ? cfg.SHIP_RECOIL_SLOWDOWN : 0;
      const targetSpeed = Math.max(
        0,
        (cfg.SHIP_TARGET_SPEED + dashBoost - recoilSlowdown) * speedMultiplier,
      );
      const forwardX = Math.cos(angle);
      const forwardY = Math.sin(angle);
      const desiredVx = forwardX * targetSpeed;
      const desiredVy = forwardY * targetSpeed;
      const response = cfg.SHIP_SPEED_RESPONSE;
      const t = 1 - Math.exp(-response * dt);
      const currentVx = this.body.velocity.x;
      const currentVy = this.body.velocity.y;
      Body.setVelocity(this.body, {
        x: currentVx + (desiredVx - currentVx) * t,
        y: currentVy + (desiredVy - currentVy) * t,
      });
    } else {
      // ALWAYS apply base forward thrust in the direction the ship is facing
      // When ship rotates, its facing direction changes, so thrust direction changes automatically
      Body.applyForce(this.body, this.body.position, {
        x: Math.cos(angle) * cfg.BASE_THRUST,
        y: Math.sin(angle) * cfg.BASE_THRUST,
      });

      // Button A: ONLY rotate the ship (no extra thrust)
      // The thrust direction changes because the ship's angle changes
      if (input.buttonA) {
        Body.setAngularVelocity(this.body, 0);
        Body.rotate(this.body, cfg.ROTATION_SPEED * dt);
      }

      // Dash: Super Dash (burst of thrust) - received via RPC
      if (dash) {
        Body.applyForce(this.body, this.body.position, {
          x: Math.cos(angle) * cfg.DASH_FORCE,
          y: Math.sin(angle) * cfg.DASH_FORCE,
        });
      }
    }

    // Button B: Fire with recoil (with ammo system)
    let fireResult: { shouldFire: boolean; fireAngle: number } | null = null;
    if (input.buttonB) {
      const now = Date.now();

      // Check if we can fire: have ammo and burst delay has passed
      if (this.ammo > 0 && now - this.lastShotTime > cfg.FIRE_COOLDOWN) {
        this.lastShotTime = now;
        this.ammo--;
        this.lastFireTime = now;

        if (mode === "STANDARD") {
          this.recoilTimer = cfg.SHIP_RECOIL_DURATION;
        } else {
          // Apply recoil force (pushback opposite to firing direction)
          Body.applyForce(this.body, this.body.position, {
            x: -Math.cos(angle) * cfg.RECOIL_FORCE,
            y: -Math.sin(angle) * cfg.RECOIL_FORCE,
          });
        }

        // Start reload if not already reloading
        if (this.ammo < this.maxAmmo && !this.isReloading) {
          this.isReloading = true;
          this.reloadStartTime = now;
        }

        fireResult = {
          shouldFire: true,
          fireAngle: angle,
        };
      }
    }

    // Update ammo reload
    this.updateReload(Date.now());

    return fireResult;
  }

  getFirePosition(): { x: number; y: number } {
    const angle = this.body.angle;
    const noseDistance = 18; // Distance from center to nose
    return {
      x: this.body.position.x + Math.cos(angle) * noseDistance,
      y: this.body.position.y + Math.sin(angle) * noseDistance,
    };
  }

  destroy(): void {
    this.alive = false;
    this.physics.removeBody(this.body);
  }

  respawn(x: number, y: number): void {
    this.body = this.physics.createShip(x, y, this.playerId);
    this.alive = true;
    this.invulnerableUntil = Date.now() + GAME_CONFIG.INVULNERABLE_TIME;
    Body.setVelocity(this.body, { x: 0, y: 0 });
    Body.setAngularVelocity(this.body, 0);
    // Reset ammo on respawn
    this.ammo = this.maxAmmo;
    this.isReloading = false;
  }

  isInvulnerable(): boolean {
    return Date.now() < this.invulnerableUntil;
  }

  private updateReload(now: number): void {
    if (this.isReloading && this.ammo < this.maxAmmo) {
      const reloadProgress = now - this.reloadStartTime;
      if (reloadProgress >= GAME_CONFIG.AMMO_RELOAD_TIME) {
        this.ammo++;
        this.reloadStartTime = now;

        // Stop reloading when full
        if (this.ammo >= this.maxAmmo) {
          this.isReloading = false;
          this.ammo = this.maxAmmo;
        }
      }
    }
  }

  getReloadProgress(): number {
    if (!this.isReloading || this.ammo >= this.maxAmmo) return 1;
    const now = Date.now();
    return Math.min(
      1,
      (now - this.reloadStartTime) / GAME_CONFIG.AMMO_RELOAD_TIME,
    );
  }

  getState(): ShipState {
    return {
      id: this.body.id.toString(),
      playerId: this.playerId,
      x: this.body.position.x,
      y: this.body.position.y,
      angle: this.body.angle,
      vx: this.body.velocity.x,
      vy: this.body.velocity.y,
      alive: this.alive,
      invulnerableUntil: this.invulnerableUntil,
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      lastShotTime: this.lastShotTime,
      reloadStartTime: this.reloadStartTime,
      isReloading: this.isReloading,
    };
  }

  updateFromState(state: ShipState): void {
    if (!this.alive) return;
    Body.setPosition(this.body, { x: state.x, y: state.y });
    Body.setAngle(this.body, state.angle);
    Body.setVelocity(this.body, { x: state.vx, y: state.vy });
    this.invulnerableUntil = state.invulnerableUntil;
  }

  stop(): void {
    // Stop the ship completely - used when hit by mine
    Body.setVelocity(this.body, { x: 0, y: 0 });
    Body.setAngularVelocity(this.body, 0);
  }
}
