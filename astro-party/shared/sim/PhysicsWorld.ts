import RAPIER from "@dimforge/rapier2d-compat";
import {
  ARENA_PADDING,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  TURRET_RADIUS,
  ASTEROID_RESTITUTION,
  ASTEROID_FRICTION,
  PILOT_FRICTION_AIR,
  PILOT_ANGULAR_DAMPING,
  PROJECTILE_RADIUS,
  HOMING_MISSILE_RADIUS,
  TURRET_BULLET_RADIUS,
  SHIP_RESTITUTION_BY_PRESET,
  SHIP_FRICTION_BY_PRESET,
  SHIP_FRICTION_AIR_BY_PRESET,
  SHIP_ANGULAR_DAMPING_BY_PRESET,
  WALL_RESTITUTION_BY_PRESET,
  WALL_FRICTION_BY_PRESET,
} from "./constants.js";
import type { SimState } from "./types.js";
import {
  SHIP_COLLIDER_VERTICES,
  PILOT_COLLIDER_VERTICES,
} from "../geometry/EntityShapes.js";

interface BodyRef {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

interface Point2D {
  x: number;
  y: number;
}

interface CircleBodyOptions {
  lockRotations?: boolean;
  angle?: number;
  angularVelocity?: number;
  angularDamping?: number;
}

interface BodyRefToken {
  kind: BodyKind;
  id: string;
}

interface CollisionPair {
  left: BodyRefToken;
  right: BodyRefToken;
}

type BodyKind =
  | "ship"
  | "turret"
  | "asteroid"
  | "pilot"
  | "projectile"
  | "homingMissile"
  | "turretBullet"
  | "wall";

const COLLISION_GROUP = {
  SHIP: 1 << 0,
  PROJECTILE: 1 << 1,
  ASTEROID: 1 << 2,
  PILOT: 1 << 3,
  HOMING_MISSILE: 1 << 4,
  TURRET: 1 << 5,
  TURRET_BULLET: 1 << 6,
  WALL: 1 << 7,
} as const;

const COLLISION_GROUP_ALL =
  COLLISION_GROUP.SHIP |
  COLLISION_GROUP.PROJECTILE |
  COLLISION_GROUP.ASTEROID |
  COLLISION_GROUP.PILOT |
  COLLISION_GROUP.HOMING_MISSILE |
  COLLISION_GROUP.TURRET |
  COLLISION_GROUP.TURRET_BULLET |
  COLLISION_GROUP.WALL;

let rapierInitPromise: Promise<void> | null = null;
let rapierReady = false;

export async function initializeRapier(): Promise<void> {
  if (rapierReady) return;
  if (!rapierInitPromise) {
    const maybeInit = (RAPIER as unknown as { init?: () => Promise<void> }).init;
    rapierInitPromise = (maybeInit ? maybeInit() : Promise.resolve()).then(() => {
      rapierReady = true;
    });
  }
  await rapierInitPromise;
}

function assertRapierReady(): void {
  if (!rapierReady) {
    throw new Error("Rapier is not initialized. Call initializeRapier() first.");
  }
}

export class PhysicsWorld {
  private world: RAPIER.World;
  private eventQueue: RAPIER.EventQueue;
  private shipBodies = new Map<string, BodyRef>();
  private asteroidBodies = new Map<string, BodyRef>();
  private pilotBodies = new Map<string, BodyRef>();
  private projectileBodies = new Map<string, BodyRef>();
  private homingMissileBodies = new Map<string, BodyRef>();
  private turretBulletBodies = new Map<string, BodyRef>();
  private turretBody: BodyRef | null = null;
  private wallColliders: RAPIER.Collider[] = [];
  private activeCollisionPairs = new Map<string, CollisionPair>();
  private startedCollisionPairs = new Map<string, CollisionPair>();

  constructor() {
    assertRapierReady();
    this.world = new RAPIER.World({ x: 0, y: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    this.createArenaWalls();
  }

  syncFromSim(sim: SimState): void {
    const shipRestitution =
      SHIP_RESTITUTION_BY_PRESET[sim.settings.shipRestitutionPreset] ?? 0;
    const shipFriction =
      SHIP_FRICTION_BY_PRESET[sim.settings.shipFrictionPreset] ?? 0;
    const shipLinearDamping =
      SHIP_FRICTION_AIR_BY_PRESET[sim.settings.shipFrictionAirPreset] ?? 0;
    const shipAngularDamping =
      SHIP_ANGULAR_DAMPING_BY_PRESET[sim.settings.angularDampingPreset] ?? 0;
    const wallRestitution =
      WALL_RESTITUTION_BY_PRESET[sim.settings.wallRestitutionPreset] ?? 0;
    const wallFriction =
      WALL_FRICTION_BY_PRESET[sim.settings.wallFrictionPreset] ?? 0;

    this.updateWallMaterials(wallRestitution, wallFriction);

    const aliveShips = new Set<string>();
    for (const playerId of sim.playerOrder) {
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      aliveShips.add(playerId);
      this.syncShipBody(
        this.shipBodies,
        playerId,
        player.ship.x,
        player.ship.y,
        player.ship.vx,
        player.ship.vy,
        shipRestitution,
        shipFriction,
        shipLinearDamping,
        {
          lockRotations: false,
          angle: player.ship.angle,
          angularVelocity: player.angularVelocity,
          angularDamping: shipAngularDamping,
        },
      );
    }
    this.removeMissingBodies(this.shipBodies, "ship", aliveShips);
    this.syncTurretBody(
      sim.turret && sim.turret.alive ? sim.turret.x : null,
      sim.turret && sim.turret.alive ? sim.turret.y : null,
      0,
      0,
    );

    const aliveAsteroids = new Set<string>();
    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      aliveAsteroids.add(asteroid.id);
      this.syncAsteroidBody(
        this.asteroidBodies,
        "asteroid",
        asteroid.id,
        asteroid.x,
        asteroid.y,
        asteroid.vx,
        asteroid.vy,
        asteroid.angle,
        asteroid.vertices,
        ASTEROID_RESTITUTION,
        ASTEROID_FRICTION,
        0,
      );
    }
    this.removeMissingBodies(this.asteroidBodies, "asteroid", aliveAsteroids);

    const alivePilots = new Set<string>();
    for (const [playerId, pilot] of sim.pilots) {
      if (!pilot.alive) continue;
      alivePilots.add(playerId);
      this.syncPilotBody(
        this.pilotBodies,
        playerId,
        pilot.x,
        pilot.y,
        pilot.vx,
        pilot.vy,
        pilot.angle,
        pilot.angularVelocity,
        0.5,
        0,
        PILOT_FRICTION_AIR,
        PILOT_ANGULAR_DAMPING,
      );
    }
    this.removeMissingBodies(this.pilotBodies, "pilot", alivePilots);

    const aliveProjectiles = new Set<string>();
    for (const projectile of sim.projectiles) {
      aliveProjectiles.add(projectile.id);
      this.syncCircleBody(
        this.projectileBodies,
        "projectile",
        projectile.id,
        projectile.x,
        projectile.y,
        projectile.vx,
        projectile.vy,
        PROJECTILE_RADIUS,
        0.8,
        0,
        0,
        true,
        true,
      );
    }
    this.removeMissingBodies(this.projectileBodies, "projectile", aliveProjectiles);

    const aliveHomingMissiles = new Set<string>();
    for (const missile of sim.homingMissiles) {
      if (!missile.alive) continue;
      aliveHomingMissiles.add(missile.id);
      this.syncCircleBody(
        this.homingMissileBodies,
        "homingMissile",
        missile.id,
        missile.x,
        missile.y,
        missile.vx,
        missile.vy,
        HOMING_MISSILE_RADIUS,
        0,
        0,
        0,
        true,
        true,
      );
    }
    this.removeMissingBodies(this.homingMissileBodies, "homingMissile", aliveHomingMissiles);

    const aliveTurretBullets = new Set<string>();
    for (const bullet of sim.turretBullets) {
      if (!bullet.alive || bullet.exploded) continue;
      aliveTurretBullets.add(bullet.id);
      this.syncCircleBody(
        this.turretBulletBodies,
        "turretBullet",
        bullet.id,
        bullet.x,
        bullet.y,
        bullet.vx,
        bullet.vy,
        TURRET_BULLET_RADIUS,
        0.5,
        0,
        0,
        true,
        true,
      );
    }
    this.removeMissingBodies(this.turretBulletBodies, "turretBullet", aliveTurretBullets);
  }

  step(dtSec: number): void {
    this.world.integrationParameters.dt = dtSec;
    this.startedCollisionPairs.clear();
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents(
      (handleA: number, handleB: number, started: boolean) => {
        const left = this.getBodyRefTokenByColliderHandle(handleA);
        const right = this.getBodyRefTokenByColliderHandle(handleB);
        if (!left || !right) return;

        const pair = this.normalizeCollisionPair(left, right);
        const key = this.collisionPairKey(pair);
        if (started) {
          this.activeCollisionPairs.set(key, pair);
          this.startedCollisionPairs.set(key, pair);
          return;
        }
        this.activeCollisionPairs.delete(key);
      },
    );
    this.recoverOutOfBoundsBodies();
  }

  getStartedPairIds(
    firstKind: BodyKind,
    secondKind: BodyKind,
  ): Array<{ firstId: string; secondId: string }> {
    return this.collectPairIds(
      this.startedCollisionPairs.values(),
      firstKind,
      secondKind,
    );
  }

  getActivePairIds(
    firstKind: BodyKind,
    secondKind: BodyKind,
  ): Array<{ firstId: string; secondId: string }> {
    return this.collectPairIds(
      this.activeCollisionPairs.values(),
      firstKind,
      secondKind,
    );
  }

  syncToSim(sim: SimState): void {
    for (const playerId of sim.playerOrder) {
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const bodyRef = this.shipBodies.get(playerId);
      if (!bodyRef) continue;
      const t = bodyRef.body.translation();
      const v = bodyRef.body.linvel();
      player.ship.x = t.x;
      player.ship.y = t.y;
      player.ship.vx = v.x;
      player.ship.vy = v.y;
      player.ship.angle = bodyRef.body.rotation();
      player.angularVelocity = bodyRef.body.angvel();
    }

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      const bodyRef = this.asteroidBodies.get(asteroid.id);
      if (!bodyRef) continue;
      const t = bodyRef.body.translation();
      const v = bodyRef.body.linvel();
      asteroid.x = t.x;
      asteroid.y = t.y;
      asteroid.vx = v.x;
      asteroid.vy = v.y;
    }

    for (const [playerId, pilot] of sim.pilots) {
      if (!pilot.alive) continue;
      const bodyRef = this.pilotBodies.get(playerId);
      if (!bodyRef) continue;
      const t = bodyRef.body.translation();
      const v = bodyRef.body.linvel();
      pilot.x = t.x;
      pilot.y = t.y;
      pilot.vx = v.x;
      pilot.vy = v.y;
      pilot.angle = bodyRef.body.rotation();
      pilot.angularVelocity = bodyRef.body.angvel();
    }

    for (const projectile of sim.projectiles) {
      const bodyRef = this.projectileBodies.get(projectile.id);
      if (!bodyRef) continue;
      const t = bodyRef.body.translation();
      const v = bodyRef.body.linvel();
      projectile.x = t.x;
      projectile.y = t.y;
      projectile.vx = v.x;
      projectile.vy = v.y;
    }

    for (const missile of sim.homingMissiles) {
      if (!missile.alive) continue;
      const bodyRef = this.homingMissileBodies.get(missile.id);
      if (!bodyRef) continue;
      const t = bodyRef.body.translation();
      const v = bodyRef.body.linvel();
      missile.x = t.x;
      missile.y = t.y;
      missile.vx = v.x;
      missile.vy = v.y;
    }

    for (const bullet of sim.turretBullets) {
      if (!bullet.alive || bullet.exploded) continue;
      const bodyRef = this.turretBulletBodies.get(bullet.id);
      if (!bodyRef) continue;
      const t = bodyRef.body.translation();
      const v = bodyRef.body.linvel();
      bullet.x = t.x;
      bullet.y = t.y;
      bullet.vx = v.x;
      bullet.vy = v.y;
    }
  }

  intersectsShipAsteroid(playerId: string, asteroidId: string): boolean {
    return this.intersectsById(this.shipBodies, playerId, this.asteroidBodies, asteroidId);
  }

  intersectsPilotAsteroid(playerId: string, asteroidId: string): boolean {
    return this.intersectsById(this.pilotBodies, playerId, this.asteroidBodies, asteroidId);
  }

  intersectsProjectileShip(projectileId: string, playerId: string): boolean {
    return this.intersectsById(this.projectileBodies, projectileId, this.shipBodies, playerId);
  }

  intersectsProjectilePilot(projectileId: string, playerId: string): boolean {
    return this.intersectsById(this.projectileBodies, projectileId, this.pilotBodies, playerId);
  }

  intersectsProjectileAsteroid(projectileId: string, asteroidId: string): boolean {
    return this.intersectsById(this.projectileBodies, projectileId, this.asteroidBodies, asteroidId);
  }

  intersectsShipPilot(shipPlayerId: string, pilotPlayerId: string): boolean {
    return this.intersectsById(this.shipBodies, shipPlayerId, this.pilotBodies, pilotPlayerId);
  }

  intersectsHomingMissileShip(missileId: string, playerId: string): boolean {
    return this.intersectsById(this.homingMissileBodies, missileId, this.shipBodies, playerId);
  }

  intersectsHomingMissileAsteroid(missileId: string, asteroidId: string): boolean {
    return this.intersectsById(this.homingMissileBodies, missileId, this.asteroidBodies, asteroidId);
  }

  removeShip(playerId: string): void {
    this.removeBody(this.shipBodies, "ship", playerId);
  }

  removeAsteroid(asteroidId: string): void {
    this.removeBody(this.asteroidBodies, "asteroid", asteroidId);
  }

  removePilot(playerId: string): void {
    this.removeBody(this.pilotBodies, "pilot", playerId);
  }

  removeProjectile(projectileId: string): void {
    this.removeBody(this.projectileBodies, "projectile", projectileId);
  }

  removeHomingMissile(missileId: string): void {
    this.removeBody(this.homingMissileBodies, "homingMissile", missileId);
  }

  removeTurretBullet(bulletId: string): void {
    this.removeBody(this.turretBulletBodies, "turretBullet", bulletId);
  }

  clearDynamicBodies(): void {
    for (const [id] of this.shipBodies) {
      this.removeBody(this.shipBodies, "ship", id);
    }
    for (const [id] of this.asteroidBodies) {
      this.removeBody(this.asteroidBodies, "asteroid", id);
    }
    for (const [id] of this.pilotBodies) {
      this.removeBody(this.pilotBodies, "pilot", id);
    }
    for (const [id] of this.projectileBodies) {
      this.removeBody(this.projectileBodies, "projectile", id);
    }
    for (const [id] of this.homingMissileBodies) {
      this.removeBody(this.homingMissileBodies, "homingMissile", id);
    }
    for (const [id] of this.turretBulletBodies) {
      this.removeBody(this.turretBulletBodies, "turretBullet", id);
    }
    if (this.turretBody) {
      this.world.removeRigidBody(this.turretBody.body);
      this.removeCollisionPairsFor("turret", "center");
      this.turretBody = null;
    }
  }

  takeSnapshot(): Uint8Array {
    return this.world.takeSnapshot();
  }

  restoreSnapshot(snapshot: Uint8Array): void {
    this.world = RAPIER.World.restoreSnapshot(snapshot);
    this.activeCollisionPairs.clear();
    this.startedCollisionPairs.clear();
    this.rebuildBodyMapsFromWorld();
  }

  private createArenaWalls(): void {
    const thickness = Math.max(10, ARENA_PADDING);
    const halfThickness = thickness * 0.5;
    const halfWidth = ARENA_WIDTH * 0.5 + thickness;
    const halfHeight = ARENA_HEIGHT * 0.5 + thickness;

    const wallBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.setBodyRefUserData({ body: wallBody, collider: null }, "wall", "arena");
    this.wallColliders = [
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfThickness, halfHeight).setTranslation(
          -halfThickness,
          ARENA_HEIGHT * 0.5,
        ),
        wallBody,
      ),
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfThickness, halfHeight).setTranslation(
          ARENA_WIDTH + halfThickness,
          ARENA_HEIGHT * 0.5,
        ),
        wallBody,
      ),
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfWidth, halfThickness).setTranslation(
          ARENA_WIDTH * 0.5,
          -halfThickness,
        ),
        wallBody,
      ),
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfWidth, halfThickness).setTranslation(
          ARENA_WIDTH * 0.5,
          ARENA_HEIGHT + halfThickness,
        ),
        wallBody,
      ),
    ];
    const wallIds = ["left", "right", "top", "bottom"];
    for (let i = 0; i < this.wallColliders.length; i++) {
      const collider = this.wallColliders[i];
      const wallId = wallIds[i] ?? "segment";
      this.setColliderUserData(collider, "wall", wallId);
      this.configureCollider(collider, "wall", false);
    }
  }

  private updateWallMaterials(restitution: number, friction: number): void {
    for (const collider of this.wallColliders) {
      collider.setRestitution(restitution);
      collider.setFriction(friction);
    }
  }

  private syncTurretBody(
    x: number | null,
    y: number | null,
    restitution: number,
    friction: number,
  ): void {
    if (x === null || y === null) {
      if (this.turretBody) {
        this.world.removeRigidBody(this.turretBody.body);
        this.removeCollisionPairsFor("turret", "center");
        this.turretBody = null;
      }
      return;
    }

    if (this.turretBody) {
      this.turretBody.body.setTranslation({ x, y }, true);
      this.turretBody.collider.setRestitution(Math.max(0, restitution));
      this.turretBody.collider.setFriction(Math.max(0, friction));
      this.configureCollider(this.turretBody.collider, "turret", false);
      this.setBodyRefUserData(this.turretBody, "turret", "center");
      return;
    }

    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, y),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(TURRET_RADIUS)
        .setRestitution(Math.max(0, restitution))
        .setFriction(Math.max(0, friction)),
      body,
    );
    this.configureCollider(collider, "turret", false);
    this.turretBody = { body, collider };
    this.setBodyRefUserData(this.turretBody, "turret", "center");
  }

  private syncPilotBody(
    map: Map<string, BodyRef>,
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    angle: number,
    angularVelocity: number,
    restitution: number,
    friction: number,
    linearDamping: number,
    angularDamping: number,
  ): void {
    const existing = map.get(id);
    if (existing) {
      existing.body.setTranslation({ x, y }, true);
      existing.body.setLinvel({ x: vx, y: vy }, true);
      existing.body.setRotation(angle, true);
      existing.body.setAngvel(angularVelocity, true);
      existing.body.lockRotations(false, true);
      existing.body.setLinearDamping(Math.max(0, linearDamping));
      existing.body.setAngularDamping(Math.max(0, angularDamping));
      existing.body.enableCcd(true);
      existing.collider.setRestitution(Math.max(0, restitution));
      existing.collider.setFriction(Math.max(0, friction));
      this.configureCollider(existing.collider, "pilot", false);
      this.setBodyRefUserData(existing, "pilot", id);
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(vx, vy)
      .setRotation(angle)
      .setAngvel(angularVelocity)
      .setLinearDamping(Math.max(0, linearDamping))
      .setAngularDamping(Math.max(0, angularDamping))
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    body.lockRotations(false, true);
    const collider = this.world.createCollider(
      this.createPilotColliderDesc()
        .setRestitution(Math.max(0, restitution))
        .setFriction(Math.max(0, friction)),
      body,
    );
    this.configureCollider(collider, "pilot", false);
    const ref = { body, collider };
    this.setBodyRefUserData(ref, "pilot", id);
    map.set(id, ref);
  }

  private syncShipBody(
    map: Map<string, BodyRef>,
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    restitution: number,
    friction: number,
    linearDamping: number,
    options?: CircleBodyOptions,
  ): void {
    const lockRotations = options?.lockRotations ?? false;
    const angle = options?.angle;
    const angularVelocity = options?.angularVelocity;
    const angularDamping = options?.angularDamping;
    const existing = map.get(id);
    if (existing) {
      existing.body.setTranslation({ x, y }, true);
      existing.body.setLinvel({ x: vx, y: vy }, true);
      if (typeof angle === "number") {
        existing.body.setRotation(angle, true);
      }
      if (typeof angularVelocity === "number") {
        existing.body.setAngvel(angularVelocity, true);
      }
      existing.body.lockRotations(lockRotations, true);
      existing.body.setAngularDamping(Math.max(0, angularDamping ?? 0));
      existing.body.enableCcd(true);
      existing.body.setLinearDamping(Math.max(0, linearDamping));
      existing.collider.setRestitution(Math.max(0, restitution));
      existing.collider.setFriction(Math.max(0, friction));
      this.configureCollider(existing.collider, "ship", false);
      this.setBodyRefUserData(existing, "ship", id);
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(vx, vy)
      .setLinearDamping(Math.max(0, linearDamping))
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    if (typeof angle === "number") {
      body.setRotation(angle, true);
    }
    if (typeof angularVelocity === "number") {
      body.setAngvel(angularVelocity, true);
    }
    body.setAngularDamping(Math.max(0, angularDamping ?? 0));
    body.lockRotations(lockRotations, true);
    const collider = this.world.createCollider(
      this.createShipColliderDesc()
        .setRestitution(Math.max(0, restitution))
        .setFriction(Math.max(0, friction)),
      body,
    );
    this.configureCollider(collider, "ship", false);
    const ref = { body, collider };
    this.setBodyRefUserData(ref, "ship", id);
    map.set(id, ref);
  }

  private syncCircleBody(
    map: Map<string, BodyRef>,
    kind: BodyKind,
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    restitution: number,
    friction: number,
    linearDamping: number,
    isSensor = false,
    enableCcd = false,
    options?: CircleBodyOptions,
  ): void {
    const lockRotations = options?.lockRotations ?? true;
    const angle = options?.angle;
    const angularVelocity = options?.angularVelocity;
    const angularDamping = options?.angularDamping;
    const existing = map.get(id);
    if (existing) {
      existing.body.setTranslation({ x, y }, true);
      existing.body.setLinvel({ x: vx, y: vy }, true);
      if (typeof angle === "number") {
        existing.body.setRotation(angle, true);
      }
      if (typeof angularVelocity === "number") {
        existing.body.setAngvel(angularVelocity, true);
      }
      existing.body.lockRotations(lockRotations, true);
      existing.body.setAngularDamping(Math.max(0, angularDamping ?? 0));
      existing.body.enableCcd(enableCcd);
      existing.body.setLinearDamping(Math.max(0, linearDamping));
      existing.collider.setRestitution(Math.max(0, restitution));
      existing.collider.setFriction(Math.max(0, friction));
      this.configureCollider(existing.collider, kind, isSensor);
      this.setBodyRefUserData(existing, kind, id);
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(vx, vy)
      .setLinearDamping(Math.max(0, linearDamping))
      .setCcdEnabled(enableCcd);
    const body = this.world.createRigidBody(bodyDesc);
    if (typeof angle === "number") {
      body.setRotation(angle, true);
    }
    if (typeof angularVelocity === "number") {
      body.setAngvel(angularVelocity, true);
    }
    body.setAngularDamping(Math.max(0, angularDamping ?? 0));
    body.lockRotations(lockRotations, true);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(Math.max(0.5, radius))
        .setRestitution(Math.max(0, restitution))
        .setFriction(Math.max(0, friction)),
      body,
    );
    this.configureCollider(collider, kind, isSensor);
    const ref = { body, collider };
    this.setBodyRefUserData(ref, kind, id);
    map.set(id, ref);
  }

  private createShipColliderDesc(): RAPIER.ColliderDesc {
    const flat = this.flattenVertices(SHIP_COLLIDER_VERTICES);
    const hull = RAPIER.ColliderDesc.convexHull(flat);
    if (hull) return hull;

    const direct = RAPIER.ColliderDesc.convexPolyline(flat);
    if (direct) return direct;

    const fallbackFlat = this.flattenVertices([
      SHIP_COLLIDER_VERTICES[0],
      SHIP_COLLIDER_VERTICES[1],
      SHIP_COLLIDER_VERTICES[2],
    ]);
    const fallback =
      RAPIER.ColliderDesc.convexPolyline(fallbackFlat) ??
      RAPIER.ColliderDesc.convexHull(fallbackFlat);
    if (fallback) return fallback;

    throw new Error("Failed to build ship collider descriptor");
  }

  private createPilotColliderDesc(): RAPIER.ColliderDesc {
    const flat = this.flattenVertices(PILOT_COLLIDER_VERTICES);
    const hull = RAPIER.ColliderDesc.convexHull(flat);
    if (hull) return hull;

    const direct = RAPIER.ColliderDesc.convexPolyline(flat);
    if (direct) return direct;

    const fallbackFlat = this.flattenVertices([
      PILOT_COLLIDER_VERTICES[0],
      PILOT_COLLIDER_VERTICES[2],
      PILOT_COLLIDER_VERTICES[5],
      PILOT_COLLIDER_VERTICES[7],
    ]);
    const fallback =
      RAPIER.ColliderDesc.convexPolyline(fallbackFlat) ??
      RAPIER.ColliderDesc.convexHull(fallbackFlat);
    if (fallback) return fallback;

    throw new Error("Failed to build pilot collider descriptor");
  }

  private syncAsteroidBody(
    map: Map<string, BodyRef>,
    kind: BodyKind,
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    angle: number,
    vertices: Point2D[],
    restitution: number,
    friction: number,
    linearDamping: number,
  ): void {
    const existing = map.get(id);
    if (existing) {
      existing.body.setTranslation({ x, y }, true);
      existing.body.setLinvel({ x: vx, y: vy }, true);
      existing.body.setRotation(angle, true);
      existing.body.enableCcd(true);
      existing.body.setLinearDamping(Math.max(0, linearDamping));
      existing.collider.setRestitution(Math.max(0, restitution));
      existing.collider.setFriction(Math.max(0, friction));
      this.configureCollider(existing.collider, kind, false);
      this.setBodyRefUserData(existing, kind, id);
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(vx, vy)
      .setRotation(angle)
      .setLinearDamping(Math.max(0, linearDamping))
      .setCcdEnabled(true);
    const body = this.world.createRigidBody(bodyDesc);
    body.lockRotations(true, true);

    const colliderDesc = this
      .createAsteroidColliderDesc(vertices)
      .setRestitution(Math.max(0, restitution))
      .setFriction(Math.max(0, friction));
    const collider = this.world.createCollider(colliderDesc, body);
    this.configureCollider(collider, kind, false);
    const ref = { body, collider };
    this.setBodyRefUserData(ref, kind, id);
    map.set(id, ref);
  }

  private createAsteroidColliderDesc(vertices: Point2D[]): RAPIER.ColliderDesc {
    const flat = this.flattenVertices(vertices);
    const hull = RAPIER.ColliderDesc.convexHull(flat);
    if (hull) return hull;

    const direct = RAPIER.ColliderDesc.convexPolyline(flat);
    if (direct) return direct;

    const fallbackFlat = this.flattenVertices(this.buildFallbackConvexVertices(vertices));
    const fallback =
      RAPIER.ColliderDesc.convexPolyline(fallbackFlat) ??
      RAPIER.ColliderDesc.convexHull(fallbackFlat);
    if (fallback) return fallback;

    throw new Error("Failed to build convex asteroid collider descriptor");
  }

  private flattenVertices(vertices: ReadonlyArray<Point2D>): Float32Array {
    const count = Math.max(3, vertices.length);
    const out = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const point = vertices[i] ?? vertices[vertices.length - 1] ?? { x: 1, y: 0 };
      out[i * 2] = point.x;
      out[i * 2 + 1] = point.y;
    }
    return out;
  }

  private buildFallbackConvexVertices(vertices: ReadonlyArray<Point2D>): Point2D[] {
    let maxRadius = 6;
    for (const vertex of vertices) {
      const radius = Math.hypot(vertex.x, vertex.y);
      if (radius > maxRadius) maxRadius = radius;
    }
    const sides = Math.max(6, Math.min(10, vertices.length || 6));
    const fallback: Point2D[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides;
      fallback.push({
        x: Math.cos(angle) * maxRadius,
        y: Math.sin(angle) * maxRadius,
      });
    }
    return fallback;
  }

  private configureCollider(
    collider: RAPIER.Collider,
    kind: BodyKind,
    isSensor: boolean,
  ): void {
    collider.setSensor(isSensor);
    collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const groups = this.getCollisionGroups(kind);
    collider.setCollisionGroups(groups);
    collider.setSolverGroups(groups);
  }

  private getCollisionGroups(kind: BodyKind): number {
    const membership = this.groupForKind(kind);
    let filter = COLLISION_GROUP_ALL;

    if (kind === "turret") {
      filter =
        COLLISION_GROUP.SHIP |
        COLLISION_GROUP.PILOT |
        COLLISION_GROUP.ASTEROID;
    } else if (kind === "turretBullet") {
      filter = COLLISION_GROUP.SHIP | COLLISION_GROUP.WALL;
    } else if (kind === "homingMissile") {
      filter =
        COLLISION_GROUP.SHIP |
        COLLISION_GROUP.ASTEROID |
        COLLISION_GROUP.WALL;
    } else if (kind === "projectile") {
      filter =
        COLLISION_GROUP.SHIP |
        COLLISION_GROUP.PILOT |
        COLLISION_GROUP.ASTEROID |
        COLLISION_GROUP.WALL;
    } else if (kind === "wall") {
      filter =
        COLLISION_GROUP.SHIP |
        COLLISION_GROUP.ASTEROID |
        COLLISION_GROUP.PILOT |
        COLLISION_GROUP.PROJECTILE |
        COLLISION_GROUP.HOMING_MISSILE |
        COLLISION_GROUP.TURRET_BULLET;
    }

    return ((membership & 0xffff) << 16) | (filter & 0xffff);
  }

  private recoverOutOfBoundsBodies(): void {
    for (const bodyRef of this.shipBodies.values()) {
      this.recoverBodyToArena(bodyRef.body);
    }
    for (const bodyRef of this.asteroidBodies.values()) {
      this.recoverBodyToArena(bodyRef.body);
    }
    for (const bodyRef of this.pilotBodies.values()) {
      this.recoverBodyToArena(bodyRef.body);
    }
  }

  private recoverBodyToArena(body: RAPIER.RigidBody): void {
    const translation = body.translation();
    const velocity = body.linvel();

    if (
      !Number.isFinite(translation.x) ||
      !Number.isFinite(translation.y) ||
      !Number.isFinite(velocity.x) ||
      !Number.isFinite(velocity.y)
    ) {
      body.setTranslation(
        { x: ARENA_WIDTH * 0.5, y: ARENA_HEIGHT * 0.5 },
        true,
      );
      body.setLinvel({ x: 0, y: 0 }, true);
      return;
    }

    let x = translation.x;
    let y = translation.y;
    let vx = velocity.x;
    let vy = velocity.y;
    let corrected = false;

    if (x < 0) {
      x = 0;
      vx = Math.abs(vx);
      corrected = true;
    } else if (x > ARENA_WIDTH) {
      x = ARENA_WIDTH;
      vx = -Math.abs(vx);
      corrected = true;
    }

    if (y < 0) {
      y = 0;
      vy = Math.abs(vy);
      corrected = true;
    } else if (y > ARENA_HEIGHT) {
      y = ARENA_HEIGHT;
      vy = -Math.abs(vy);
      corrected = true;
    }

    if (!corrected) return;
    body.setTranslation({ x, y }, true);
    body.setLinvel({ x: vx, y: vy }, true);
  }

  private groupForKind(kind: BodyKind): number {
    if (kind === "ship") return COLLISION_GROUP.SHIP;
    if (kind === "projectile") return COLLISION_GROUP.PROJECTILE;
    if (kind === "asteroid") return COLLISION_GROUP.ASTEROID;
    if (kind === "pilot") return COLLISION_GROUP.PILOT;
    if (kind === "homingMissile") return COLLISION_GROUP.HOMING_MISSILE;
    if (kind === "turret") return COLLISION_GROUP.TURRET;
    if (kind === "turretBullet") return COLLISION_GROUP.TURRET_BULLET;
    return COLLISION_GROUP.WALL;
  }

  private getBodyRefTokenByColliderHandle(handle: number): BodyRefToken | null {
    let collider: RAPIER.Collider;
    try {
      collider = this.world.getCollider(handle);
    } catch {
      return null;
    }
    return this.parseUserDataToken(
      (collider as unknown as { userData?: unknown }).userData,
    );
  }

  private normalizeCollisionPair(left: BodyRefToken, right: BodyRefToken): CollisionPair {
    const leftToken = this.makeUserDataToken(left.kind, left.id);
    const rightToken = this.makeUserDataToken(right.kind, right.id);
    if (leftToken <= rightToken) {
      return { left, right };
    }
    return { left: right, right: left };
  }

  private collisionPairKey(pair: CollisionPair): string {
    const leftToken = this.makeUserDataToken(pair.left.kind, pair.left.id);
    const rightToken = this.makeUserDataToken(pair.right.kind, pair.right.id);
    return leftToken + "|" + rightToken;
  }

  private collectPairIds(
    source: Iterable<CollisionPair>,
    firstKind: BodyKind,
    secondKind: BodyKind,
  ): Array<{ firstId: string; secondId: string }> {
    const out: Array<{ firstId: string; secondId: string }> = [];
    for (const pair of source) {
      if (pair.left.kind === firstKind && pair.right.kind === secondKind) {
        out.push({ firstId: pair.left.id, secondId: pair.right.id });
      } else if (
        pair.left.kind === secondKind &&
        pair.right.kind === firstKind
      ) {
        out.push({ firstId: pair.right.id, secondId: pair.left.id });
      }
    }
    return out;
  }

  private intersectsById(
    a: Map<string, BodyRef>,
    aId: string,
    b: Map<string, BodyRef>,
    bId: string,
  ): boolean {
    const left = a.get(aId);
    const right = b.get(bId);
    if (!left || !right) return false;
    return this.world.intersectionPair(left.collider, right.collider);
  }

  private setBodyRefUserData(ref: { body: RAPIER.RigidBody; collider: RAPIER.Collider | null }, kind: BodyKind, id: string): void {
    const token = this.makeUserDataToken(kind, id);
    (ref.body as unknown as { userData?: unknown }).userData = token;
    if (ref.collider) {
      this.setColliderUserData(ref.collider, kind, id);
    }
  }

  private setColliderUserData(collider: RAPIER.Collider, kind: BodyKind, id: string): void {
    const token = this.makeUserDataToken(kind, id);
    (collider as unknown as { userData?: unknown }).userData = token;
  }

  private makeUserDataToken(kind: BodyKind, id: string): string {
    return kind + ":" + id;
  }

  private parseUserDataToken(value: unknown): { kind: BodyKind; id: string } | null {
    if (typeof value !== "string") return null;
    const index = value.indexOf(":");
    if (index <= 0 || index >= value.length - 1) return null;
    const kind = value.slice(0, index) as BodyKind;
    const id = value.slice(index + 1);
    if (
      kind !== "ship" &&
      kind !== "turret" &&
      kind !== "asteroid" &&
      kind !== "pilot" &&
      kind !== "projectile" &&
      kind !== "homingMissile" &&
      kind !== "turretBullet" &&
      kind !== "wall"
    ) {
      return null;
    }
    return { kind, id };
  }

  private rebuildBodyMapsFromWorld(): void {
    this.shipBodies.clear();
    this.asteroidBodies.clear();
    this.pilotBodies.clear();
    this.projectileBodies.clear();
    this.homingMissileBodies.clear();
    this.turretBulletBodies.clear();
    this.turretBody = null;
    this.wallColliders = [];

    this.world.forEachCollider((collider: RAPIER.Collider) => {
      const parsed = this.parseUserDataToken(
        (collider as unknown as { userData?: unknown }).userData,
      );
      if (!parsed) return;
      if (parsed.kind === "wall") {
        this.configureCollider(collider, "wall", false);
        this.wallColliders.push(collider);
        return;
      }
      const body = collider.parent();
      if (!body) return;
      this.configureCollider(collider, parsed.kind, collider.isSensor());
      const ref = { body, collider };
      if (parsed.kind === "ship") {
        this.shipBodies.set(parsed.id, ref);
      } else if (parsed.kind === "turret") {
        this.turretBody = ref;
      } else if (parsed.kind === "asteroid") {
        this.asteroidBodies.set(parsed.id, ref);
      } else if (parsed.kind === "pilot") {
        this.pilotBodies.set(parsed.id, ref);
      } else if (parsed.kind === "projectile") {
        this.projectileBodies.set(parsed.id, ref);
      } else if (parsed.kind === "homingMissile") {
        this.homingMissileBodies.set(parsed.id, ref);
      } else if (parsed.kind === "turretBullet") {
        this.turretBulletBodies.set(parsed.id, ref);
      }
    });
  }

  private removeMissingBodies(
    map: Map<string, BodyRef>,
    kind: BodyKind,
    aliveIds: Set<string>,
  ): void {
    for (const [id] of map) {
      if (!aliveIds.has(id)) {
        this.removeBody(map, kind, id);
      }
    }
  }

  private removeBody(map: Map<string, BodyRef>, kind: BodyKind, id: string): void {
    const ref = map.get(id);
    if (!ref) return;
    this.world.removeRigidBody(ref.body);
    this.removeCollisionPairsFor(kind, id);
    map.delete(id);
  }

  private removeCollisionPairsFor(kind: BodyKind, id: string): void {
    for (const [key, pair] of this.activeCollisionPairs) {
      if (
        (pair.left.kind === kind && pair.left.id === id) ||
        (pair.right.kind === kind && pair.right.id === id)
      ) {
        this.activeCollisionPairs.delete(key);
      }
    }
    for (const [key, pair] of this.startedCollisionPairs) {
      if (
        (pair.left.kind === kind && pair.left.id === id) ||
        (pair.right.kind === kind && pair.right.id === id)
      ) {
        this.startedCollisionPairs.delete(key);
      }
    }
  }
}
