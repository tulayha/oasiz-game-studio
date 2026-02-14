import RAPIER from "@dimforge/rapier2d";
import {
  ARENA_PADDING,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  SHIP_RADIUS,
  ASTEROID_RESTITUTION,
  ASTEROID_FRICTION,
  PILOT_RADIUS,
  PROJECTILE_RADIUS,
  HOMING_MISSILE_RADIUS,
  TURRET_BULLET_RADIUS,
  SHIP_RESTITUTION_BY_PRESET,
  SHIP_FRICTION_BY_PRESET,
  SHIP_FRICTION_AIR_BY_PRESET,
  WALL_RESTITUTION_BY_PRESET,
  WALL_FRICTION_BY_PRESET,
} from "./constants.js";
import type { SimState } from "./types.js";

interface BodyRef {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
}

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
  private shipBodies = new Map<string, BodyRef>();
  private asteroidBodies = new Map<string, BodyRef>();
  private pilotBodies = new Map<string, BodyRef>();
  private projectileBodies = new Map<string, BodyRef>();
  private homingMissileBodies = new Map<string, BodyRef>();
  private turretBulletBodies = new Map<string, BodyRef>();
  private wallColliders: RAPIER.Collider[] = [];

  constructor() {
    assertRapierReady();
    this.world = new RAPIER.World({ x: 0, y: 0 });
    this.createArenaWalls();
  }

  syncFromSim(sim: SimState): void {
    const shipRestitution =
      SHIP_RESTITUTION_BY_PRESET[sim.settings.shipRestitutionPreset] ?? 0;
    const shipFriction =
      SHIP_FRICTION_BY_PRESET[sim.settings.shipFrictionPreset] ?? 0;
    const shipLinearDamping =
      SHIP_FRICTION_AIR_BY_PRESET[sim.settings.shipFrictionAirPreset] ?? 0;
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
      this.syncCircleBody(
        this.shipBodies,
        playerId,
        player.ship.x,
        player.ship.y,
        player.ship.vx,
        player.ship.vy,
        SHIP_RADIUS,
        shipRestitution,
        shipFriction,
        shipLinearDamping,
      );
    }
    this.removeMissingBodies(this.shipBodies, aliveShips);

    const aliveAsteroids = new Set<string>();
    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      aliveAsteroids.add(asteroid.id);
      this.syncCircleBody(
        this.asteroidBodies,
        asteroid.id,
        asteroid.x,
        asteroid.y,
        asteroid.vx,
        asteroid.vy,
        asteroid.size,
        ASTEROID_RESTITUTION,
        ASTEROID_FRICTION,
        0,
      );
    }
    this.removeMissingBodies(this.asteroidBodies, aliveAsteroids);

    const alivePilots = new Set<string>();
    for (const [playerId, pilot] of sim.pilots) {
      if (!pilot.alive) continue;
      alivePilots.add(playerId);
      this.syncCircleBody(
        this.pilotBodies,
        playerId,
        pilot.x,
        pilot.y,
        pilot.vx,
        pilot.vy,
        PILOT_RADIUS,
        Math.max(0.5, wallRestitution),
        wallFriction,
        0.05,
      );
    }
    this.removeMissingBodies(this.pilotBodies, alivePilots);

    const aliveProjectiles = new Set<string>();
    for (const projectile of sim.projectiles) {
      aliveProjectiles.add(projectile.id);
      this.syncCircleBody(
        this.projectileBodies,
        projectile.id,
        projectile.x,
        projectile.y,
        projectile.vx,
        projectile.vy,
        PROJECTILE_RADIUS,
        0,
        0,
        0,
        true,
      );
    }
    this.removeMissingBodies(this.projectileBodies, aliveProjectiles);

    const aliveHomingMissiles = new Set<string>();
    for (const missile of sim.homingMissiles) {
      if (!missile.alive) continue;
      aliveHomingMissiles.add(missile.id);
      this.syncCircleBody(
        this.homingMissileBodies,
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
      );
    }
    this.removeMissingBodies(this.homingMissileBodies, aliveHomingMissiles);

    const aliveTurretBullets = new Set<string>();
    for (const bullet of sim.turretBullets) {
      if (!bullet.alive || bullet.exploded) continue;
      aliveTurretBullets.add(bullet.id);
      this.syncCircleBody(
        this.turretBulletBodies,
        bullet.id,
        bullet.x,
        bullet.y,
        bullet.vx,
        bullet.vy,
        TURRET_BULLET_RADIUS,
        0,
        0,
        0,
        true,
      );
    }
    this.removeMissingBodies(this.turretBulletBodies, aliveTurretBullets);
  }

  step(dtSec: number): void {
    this.world.integrationParameters.dt = dtSec;
    this.world.step();
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

  removeShip(playerId: string): void {
    this.removeBody(this.shipBodies, playerId);
  }

  removeAsteroid(asteroidId: string): void {
    this.removeBody(this.asteroidBodies, asteroidId);
  }

  removePilot(playerId: string): void {
    this.removeBody(this.pilotBodies, playerId);
  }

  removeProjectile(projectileId: string): void {
    this.removeBody(this.projectileBodies, projectileId);
  }

  removeHomingMissile(missileId: string): void {
    this.removeBody(this.homingMissileBodies, missileId);
  }

  removeTurretBullet(bulletId: string): void {
    this.removeBody(this.turretBulletBodies, bulletId);
  }

  clearDynamicBodies(): void {
    for (const [id] of this.shipBodies) {
      this.removeBody(this.shipBodies, id);
    }
    for (const [id] of this.asteroidBodies) {
      this.removeBody(this.asteroidBodies, id);
    }
    for (const [id] of this.pilotBodies) {
      this.removeBody(this.pilotBodies, id);
    }
    for (const [id] of this.projectileBodies) {
      this.removeBody(this.projectileBodies, id);
    }
    for (const [id] of this.homingMissileBodies) {
      this.removeBody(this.homingMissileBodies, id);
    }
    for (const [id] of this.turretBulletBodies) {
      this.removeBody(this.turretBulletBodies, id);
    }
  }

  takeSnapshot(): Uint8Array {
    return this.world.takeSnapshot();
  }

  restoreSnapshot(snapshot: Uint8Array): void {
    this.world = RAPIER.World.restoreSnapshot(snapshot);
    this.shipBodies.clear();
    this.asteroidBodies.clear();
    this.pilotBodies.clear();
    this.projectileBodies.clear();
    this.homingMissileBodies.clear();
    this.turretBulletBodies.clear();
  }

  private createArenaWalls(): void {
    const thickness = Math.max(10, ARENA_PADDING);
    const halfThickness = thickness * 0.5;
    const halfWidth = ARENA_WIDTH * 0.5 + thickness;
    const halfHeight = ARENA_HEIGHT * 0.5 + thickness;

    const wallBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
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
  }

  private updateWallMaterials(restitution: number, friction: number): void {
    for (const collider of this.wallColliders) {
      collider.setRestitution(restitution);
      collider.setFriction(friction);
    }
  }

  private syncCircleBody(
    map: Map<string, BodyRef>,
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
  ): void {
    const existing = map.get(id);
    if (existing) {
      existing.body.setTranslation({ x, y }, true);
      existing.body.setLinvel({ x: vx, y: vy }, true);
      existing.body.setLinearDamping(Math.max(0, linearDamping));
      existing.collider.setRestitution(Math.max(0, restitution));
      existing.collider.setFriction(Math.max(0, friction));
      existing.collider.setSensor(isSensor);
      return;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(vx, vy)
      .setLinearDamping(Math.max(0, linearDamping));
    const body = this.world.createRigidBody(bodyDesc);
    body.lockRotations(true, true);
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(Math.max(0.5, radius))
        .setRestitution(Math.max(0, restitution))
        .setFriction(Math.max(0, friction))
        .setSensor(isSensor),
      body,
    );
    map.set(id, { body, collider });
  }

  private removeMissingBodies(map: Map<string, BodyRef>, aliveIds: Set<string>): void {
    for (const [id] of map) {
      if (!aliveIds.has(id)) {
        this.removeBody(map, id);
      }
    }
  }

  private removeBody(map: Map<string, BodyRef>, id: string): void {
    const ref = map.get(id);
    if (!ref) return;
    this.world.removeRigidBody(ref.body);
    map.delete(id);
  }
}
