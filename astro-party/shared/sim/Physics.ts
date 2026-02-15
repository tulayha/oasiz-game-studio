import Matter from "matter-js";
import {
  SHIP_COLLIDER_VERTICES,
  cloneShapeVertices,
} from "../geometry/EntityShapes.js";
import { CollisionCategory } from "./CollisionCategories.js";

const { Engine, Bodies, Body, Events, Composite } = Matter;
const FIXED_STEP_MS = 1000 / 60;

export class Physics {
  engine: Matter.Engine;
  world: Matter.World;
  private walls: Matter.Body[] = [];

  constructor() {
    this.engine = Engine.create({
      gravity: { x: 0, y: 0 },
    });
    this.world = this.engine.world;
  }

  createWalls(
    width: number,
    height: number,
    padding: number,
    wallRestitution: number,
    wallFriction: number,
  ): void {
    if (this.walls.length > 0) {
      Composite.remove(this.world, this.walls);
    }

    const thickness = padding;
    const wallOpts = {
      isStatic: true as const,
      label: "wall",
      restitution: wallRestitution,
      friction: wallFriction,
      collisionFilter: {
        category: CollisionCategory.Wall,
        mask:
          CollisionCategory.Ship |
          CollisionCategory.Projectile |
          CollisionCategory.Asteroid,
      },
    };

    this.walls = [
      Bodies.rectangle(width / 2, -thickness / 2, width + thickness * 2, thickness, wallOpts),
      Bodies.rectangle(
        width / 2,
        height + thickness / 2,
        width + thickness * 2,
        thickness,
        wallOpts,
      ),
      Bodies.rectangle(-thickness / 2, height / 2, thickness, height + thickness * 2, wallOpts),
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

  setWallMaterials(wallRestitution: number, wallFriction: number): void {
    for (const wall of this.walls) {
      wall.restitution = wallRestitution;
      wall.friction = wallFriction;
    }
  }

  createShip(
    x: number,
    y: number,
    playerId: string,
    options: {
      frictionAir: number;
      restitution: number;
      friction: number;
      angularDamping: number;
    },
  ): Matter.Body {
    const vertices = cloneShapeVertices(SHIP_COLLIDER_VERTICES);

    const body = Bodies.fromVertices(x, y, [vertices], {
      label: "ship",
      frictionAir: options.frictionAir,
      restitution: options.restitution,
      friction: options.friction,
      density: 0.001,
      collisionFilter: {
        category: CollisionCategory.Ship,
        mask:
          CollisionCategory.Ship |
          CollisionCategory.Projectile |
          CollisionCategory.Asteroid |
          CollisionCategory.Wall |
          CollisionCategory.PowerUp |
          CollisionCategory.Turret,
      },
    });

    if (options.angularDamping > 0) {
      (body as unknown as Record<string, number>).angularDamping = options.angularDamping;
    }

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
    options: {
      frictionAir: number;
      angularDamping: number;
      initialAngle: number;
      initialAngularVelocity: number;
      vx: number;
      vy: number;
    },
  ): Matter.Body {
    const body = Bodies.circle(x, y, 8, {
      label: "pilot",
      frictionAir: options.frictionAir,
      restitution: 0.5,
      friction: 0,
      density: 0.0005,
    });

    Body.setVelocity(body, { x: options.vx, y: options.vy });
    Body.setAngle(body, options.initialAngle);
    Body.setAngularVelocity(body, options.initialAngularVelocity);

    if (options.angularDamping > 0) {
      (body as unknown as Record<string, number>).angularDamping = options.angularDamping;
    }

    body.plugin = body.plugin || {};
    body.plugin.playerId = playerId;
    body.plugin.entityType = "pilot";

    Composite.add(this.world, body);
    return body;
  }

  createProjectile(
    x: number,
    y: number,
    vx: number,
    vy: number,
    ownerId: string,
    projectileId: string,
  ): Matter.Body {
    const body = Bodies.circle(x, y, 4, {
      label: "projectile",
      frictionAir: 0,
      restitution: 0.8,
      friction: 0,
      density: 0.0001,
      isSensor: false,
      collisionFilter: {
        category: CollisionCategory.Projectile,
        mask:
          CollisionCategory.Ship |
          CollisionCategory.Asteroid |
          CollisionCategory.Wall,
      },
    });

    Body.setVelocity(body, { x: vx, y: vy });

    body.plugin = body.plugin || {};
    body.plugin.ownerId = ownerId;
    body.plugin.entityType = "projectile";
    body.plugin.entityId = projectileId;

    Composite.add(this.world, body);
    return body;
  }

  createAsteroid(
    x: number,
    y: number,
    vertices: Array<{ x: number; y: number }>,
    velocity: { x: number; y: number },
    angle: number,
    angularVelocity: number,
    asteroidId: string,
    restitution: number,
    friction: number,
  ): Matter.Body {
    const body = Matter.Bodies.fromVertices(x, y, [vertices], {
      label: "asteroid",
      frictionAir: 0,
      restitution,
      friction,
      density: 0.001,
      collisionFilter: {
        category: CollisionCategory.Asteroid,
        mask:
          CollisionCategory.Ship |
          CollisionCategory.Projectile |
          CollisionCategory.Asteroid |
          CollisionCategory.Wall |
          CollisionCategory.Turret,
      },
    });

    Body.setVelocity(body, velocity);
    Body.setAngle(body, angle);
    Body.setAngularVelocity(body, angularVelocity);

    body.plugin = body.plugin || {};
    body.plugin.entityType = "asteroid";
    body.plugin.entityId = asteroidId;

    Composite.add(this.world, body);
    return body;
  }

  createPowerUp(
    x: number,
    y: number,
    type: import("./types.js").PowerUpType,
    powerUpId: string,
  ): Matter.Body {
    const size = 25;
    const body = Bodies.rectangle(x, y, size, size, {
      label: "powerup",
      isStatic: true,
      isSensor: true,
      frictionAir: 0,
      restitution: 0,
      friction: 0,
      collisionFilter: {
        category: CollisionCategory.PowerUp,
        mask: CollisionCategory.Ship,
      },
    });

    body.plugin = body.plugin || {};
    body.plugin.entityType = "powerup";
    body.plugin.entityId = powerUpId;
    body.plugin.powerUpType = type;

    Composite.add(this.world, body);
    return body;
  }

  createYellowBlock(
    x: number,
    y: number,
    width: number,
    height: number,
    blockIndex: number,
  ): Matter.Body {
    const body = Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      label: "yellowBlock",
      friction: 0,
      restitution: 0.9,
      collisionFilter: {
        category: CollisionCategory.Wall,
        mask:
          CollisionCategory.Ship |
          CollisionCategory.Projectile |
          CollisionCategory.Asteroid |
          CollisionCategory.TurretBullet,
      },
    });

    body.plugin = body.plugin || {};
    body.plugin.entityType = "yellowBlock";
    body.plugin.blockIndex = blockIndex;

    Composite.add(this.world, body);
    return body;
  }

  createCenterHoleObstacle(x: number, y: number, radius: number): Matter.Body {
    const body = Bodies.circle(x, y, radius * 0.92, {
      isStatic: true,
      label: "wall",
      friction: 0,
      restitution: 0.9,
      collisionFilter: {
        category: CollisionCategory.Wall,
        mask:
          CollisionCategory.Ship |
          CollisionCategory.Projectile |
          CollisionCategory.Asteroid |
          CollisionCategory.TurretBullet,
      },
    });

    body.plugin = body.plugin || {};
    body.plugin.entityType = "centerHoleObstacle";

    Composite.add(this.world, body);
    return body;
  }

  createTurret(x: number, y: number): Matter.Body {
    const body = Bodies.circle(x, y, 20, {
      label: "turret",
      isStatic: true,
      isSensor: false,
      frictionAir: 0,
      restitution: 0,
      friction: 0,
      collisionFilter: {
        category: CollisionCategory.Turret,
        // Pilot bodies use Matter's default category, which matches CollisionCategory.Ship.
        mask: CollisionCategory.Ship | CollisionCategory.Asteroid,
      },
    });

    body.plugin = body.plugin || {};
    body.plugin.entityType = "turret";

    Composite.add(this.world, body);
    return body;
  }

  createTurretBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    bulletId: string,
  ): Matter.Body {
    const body = Bodies.circle(x, y, 5, {
      label: "turretBullet",
      frictionAir: 0,
      restitution: 0.5,
      friction: 0,
      density: 0.0001,
      collisionFilter: {
        category: CollisionCategory.TurretBullet,
        mask: CollisionCategory.Ship | CollisionCategory.Wall,
      },
    });

    Body.setVelocity(body, { x: vx, y: vy });

    body.plugin = body.plugin || {};
    body.plugin.entityType = "turretBullet";
    body.plugin.entityId = bulletId;

    Composite.add(this.world, body);
    return body;
  }

  removeBody(body: Matter.Body): void {
    Composite.remove(this.world, body);
  }

  update(dtMs: number): void {
    Engine.update(this.engine, Math.min(dtMs, FIXED_STEP_MS));
  }

  onCollision(
    callback: (event: Matter.IEventCollision<Matter.Engine>) => void,
  ): void {
    Events.on(this.engine, "collisionStart", callback);
  }
}
