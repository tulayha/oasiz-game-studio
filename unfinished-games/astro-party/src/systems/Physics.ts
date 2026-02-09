import Matter from "matter-js";
import { GAME_CONFIG } from "../types";
import { GameConfig } from "../GameConfig";

const { Engine, World, Bodies, Body, Events, Composite } = Matter;

export class Physics {
  engine: Matter.Engine;
  world: Matter.World;
  private walls: Matter.Body[] = [];

  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0 }, // Zero-G
    });
    this.world = this.engine.world;
  }

  createWalls(width: number, height: number): void {
    // Remove existing walls
    if (this.walls.length > 0) {
      Composite.remove(this.world, this.walls);
    }

    const thickness = GAME_CONFIG.ARENA_PADDING;
    const phys = GameConfig.physics;
    const wallOpts = {
      isStatic: true as const,
      label: "wall",
      restitution: phys.WALL_RESTITUTION,
      friction: phys.WALL_FRICTION,
      collisionFilter: {
        category: 0x0008, // Wall category
        mask: 0x0001 | 0x0002 | 0x0004, // Collide with ships (1), projectiles (2), and asteroids (4)
      },
    };
    this.walls = [
      // Top
      Bodies.rectangle(
        width / 2,
        -thickness / 2,
        width + thickness * 2,
        thickness,
        wallOpts,
      ),
      // Bottom
      Bodies.rectangle(
        width / 2,
        height + thickness / 2,
        width + thickness * 2,
        thickness,
        wallOpts,
      ),
      // Left
      Bodies.rectangle(
        -thickness / 2,
        height / 2,
        thickness,
        height + thickness * 2,
        wallOpts,
      ),
      // Right
      Bodies.rectangle(
        width + thickness / 2,
        height / 2,
        thickness,
        height + thickness * 2,
        wallOpts,
      ),
    ];

    Composite.add(this.world, this.walls);
  }

  createShip(x: number, y: number, playerId: string): Matter.Body {
    const size = 15;
    // Triangle vertices for ship shape
    const vertices = [
      { x: size, y: 0 }, // Nose
      { x: -size * 0.7, y: -size * 0.6 }, // Left wing
      { x: -size * 0.4, y: 0 }, // Notch
      { x: -size * 0.7, y: size * 0.6 }, // Right wing
    ];

    const cfg = GameConfig.config;
    const phys = GameConfig.physics;
    const body = Bodies.fromVertices(x, y, [vertices], {
      label: "ship",
      frictionAir: cfg.SHIP_FRICTION_AIR,
      restitution: cfg.SHIP_RESTITUTION,
      friction: phys.SHIP_FRICTION,
      density: 0.001,
      collisionFilter: {
        category: 0x0001, // Ship category
        mask: 0x0001 | 0x0002 | 0x0004 | 0x0008 | 0x0010, // Collide with ships (1), projectiles (2), asteroids (4), walls (8), and powerups (16)
      },
    });

    if (phys.SHIP_ANGULAR_DAMPING > 0) {
      (body as unknown as Record<string, number>).angularDamping =
        phys.SHIP_ANGULAR_DAMPING;
    }

    // Store player ID in plugin data
    body.plugin = body.plugin || {};
    body.plugin.playerId = playerId;
    body.plugin.entityType = "ship";

    Composite.add(this.world, body);
    return body;
  }

  createPilot(
    x: number,
    y: number,
    playerId: string,
    velocity: Matter.Vector,
    initialAngle: number,
    initialAngularVelocity: number = 0,
  ): Matter.Body {
    const body = Bodies.circle(x, y, 8, {
      label: "pilot",
      frictionAir: GAME_CONFIG.PILOT_FRICTION_AIR,
      restitution: 0.5,
      friction: 0,
      density: 0.0005,
    });

    // Inherit some momentum from the ship
    Body.setVelocity(body, {
      x: velocity.x * GAME_CONFIG.PILOT_EJECT_VELOCITY_SCALE,
      y: velocity.y * GAME_CONFIG.PILOT_EJECT_VELOCITY_SCALE,
    });
    Body.setAngle(body, initialAngle);
    Body.setAngularVelocity(body, initialAngularVelocity);

    if (GAME_CONFIG.PILOT_ANGULAR_DAMPING > 0) {
      (body as unknown as Record<string, number>).angularDamping =
        GAME_CONFIG.PILOT_ANGULAR_DAMPING;
    }

    body.plugin = body.plugin || {};
    body.plugin.playerId = playerId;
    body.plugin.entityType = "pilot";
    body.plugin.spawnTime = Date.now();

    Composite.add(this.world, body);
    return body;
  }

  createProjectile(
    x: number,
    y: number,
    angle: number,
    ownerId: string,
    speed?: number,
  ): Matter.Body {
    const projectileSpeed = speed ?? GAME_CONFIG.PROJECTILE_SPEED;
    const body = Bodies.circle(x, y, 4, {
      label: "projectile",
      frictionAir: 0,
      restitution: 0.8,
      friction: 0,
      density: 0.0001,
      isSensor: false,
      collisionFilter: {
        category: 0x0002, // Projectile category
        mask: 0x0001 | 0x0004 | 0x0008, // Collide with ships (1), asteroids (4), and walls (8)
      },
    });

    Body.setVelocity(body, {
      x: Math.cos(angle) * projectileSpeed,
      y: Math.sin(angle) * projectileSpeed,
    });

    body.plugin = body.plugin || {};
    body.plugin.ownerId = ownerId;
    body.plugin.entityType = "projectile";
    body.plugin.spawnTime = Date.now();

    Composite.add(this.world, body);
    return body;
  }

  createAsteroid(
    x: number,
    y: number,
    vertices: { x: number; y: number }[],
    velocity: { x: number; y: number },
  ): Matter.Body {
    const body = Matter.Bodies.fromVertices(x, y, [vertices], {
      label: "asteroid",
      frictionAir: 0,
      restitution: GAME_CONFIG.ASTEROID_RESTITUTION,
      friction: GAME_CONFIG.ASTEROID_FRICTION,
      density: 0.001,
      collisionFilter: {
        category: 0x0004, // Asteroid category
        mask: 0x0001 | 0x0002 | 0x0004 | 0x0008, // Collide with ships (1), projectiles (2), asteroids (4), and walls (8)
      },
    });

    Matter.Body.setVelocity(body, velocity);

    body.plugin = body.plugin || {};
    body.plugin.entityType = "asteroid";

    Composite.add(this.world, body);
    return body;
  }

  createPowerUp(
    x: number,
    y: number,
    type: import("../types").PowerUpType,
  ): Matter.Body {
    const size = GAME_CONFIG.POWERUP_SIZE;
    const body = Bodies.rectangle(x, y, size, size, {
      label: "powerup",
      isStatic: true,
      isSensor: true, // Power-ups are pickups, not physical obstacles
      frictionAir: 0,
      restitution: 0,
      friction: 0,
      collisionFilter: {
        category: 0x0010, // Power-up category (16)
        mask: 0x0001, // Only collide with ships (1)
      },
    });

    body.plugin = body.plugin || {};
    body.plugin.entityType = "powerup";
    body.plugin.powerUpType = type;

    Composite.add(this.world, body);
    return body;
  }

  wrapAround(body: Matter.Body): void {
    const margin = 50;
    const w = GAME_CONFIG.ARENA_WIDTH;
    const h = GAME_CONFIG.ARENA_HEIGHT;
    let wrapped = false;

    if (body.position.x < -margin) {
      Matter.Body.setPosition(body, { x: w + margin, y: body.position.y });
      wrapped = true;
    } else if (body.position.x > w + margin) {
      Matter.Body.setPosition(body, { x: -margin, y: body.position.y });
      wrapped = true;
    }

    if (body.position.y < -margin) {
      Matter.Body.setPosition(body, { x: body.position.x, y: h + margin });
      wrapped = true;
    } else if (body.position.y > h + margin) {
      Matter.Body.setPosition(body, { x: body.position.x, y: -margin });
      wrapped = true;
    }

    if (wrapped) {
      // Clear velocity to prevent weirdness
      Matter.Body.setVelocity(body, body.velocity);
    }
  }

  removeBody(body: Matter.Body): void {
    Composite.remove(this.world, body);
  }

  update(dt: number): void {
    // Cap delta time to prevent physics explosions
    Engine.update(this.engine, Math.min(dt, 16.667));
  }

  applyForce(body: Matter.Body, force: Matter.Vector): void {
    Body.applyForce(body, body.position, force);
  }

  rotate(body: Matter.Body, angle: number): void {
    Body.rotate(body, angle);
  }

  setAngularVelocity(body: Matter.Body, velocity: number): void {
    Body.setAngularVelocity(body, velocity);
  }

  setVelocity(body: Matter.Body, velocity: Matter.Vector): void {
    Body.setVelocity(body, velocity);
  }

  onCollision(
    callback: (event: Matter.IEventCollision<Matter.Engine>) => void,
  ): void {
    Events.on(this.engine, "collisionStart", callback);
  }

  getBodyLabel(body: Matter.Body): string {
    return body.label;
  }

  getBodyPlugin(body: Matter.Body): Record<string, unknown> {
    return body.plugin || {};
  }
}
