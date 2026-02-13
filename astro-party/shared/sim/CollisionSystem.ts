import type { SimState, RuntimeProjectile } from "./types.js";
import {
  SHIP_RADIUS,
  SHIP_HIT_RADIUS,
  PILOT_RADIUS,
  PROJECTILE_RADIUS,
  TURRET_RADIUS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ASTEROID_RESTITUTION,
  ASTEROID_FRICTION,
  ASTEROID_DAMAGE_SHIPS,
  ASTEROID_SMALL_MIN,
  POWERUP_SHIELD_HITS,
  SHIP_RESTITUTION_BY_PRESET,
  SHIP_FRICTION_BY_PRESET,
  WALL_RESTITUTION_BY_PRESET,
  WALL_FRICTION_BY_PRESET,
} from "./constants.js";
import { clamp } from "./utils.js";
import { resolveCircleCollision, applyShipSpinFromTangential } from "./ShipSystem.js";

export function resolveShipTurretCollisions(sim: SimState, shipRestitution: number): void {
  if (!sim.turret || !sim.turret.alive) return;
  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    const ship = player.ship;
    const dx = ship.x - sim.turret.x;
    const dy = ship.y - sim.turret.y;
    const distSq = dx * dx + dy * dy;
    const minDistance = SHIP_RADIUS + TURRET_RADIUS;
    if (distSq > minDistance * minDistance) continue;

    const distance = Math.sqrt(Math.max(distSq, 1e-6));
    const nx = dx / distance;
    const ny = dy / distance;

    const overlap = minDistance - distance;
    if (overlap > 0) {
      ship.x += nx * (overlap + 0.01);
      ship.y += ny * (overlap + 0.01);
    }

    const velAlongNormal = ship.vx * nx + ship.vy * ny;
    if (velAlongNormal < 0) {
      const impulse = -(1 + clamp(shipRestitution, 0, 1)) * velAlongNormal;
      ship.vx += impulse * nx;
      ship.vy += impulse * ny;
    }
  }
}

export function resolveShipAsteroidCollisions(sim: SimState, shipRestitution: number): void {
  const shipFriction =
    SHIP_FRICTION_BY_PRESET[sim.settings.shipFrictionPreset] ?? 0;

  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;

      const result = resolveCircleCollision(
        player.ship,
        asteroid,
        SHIP_RADIUS + asteroid.size,
        (shipRestitution + ASTEROID_RESTITUTION) * 0.5,
        (shipFriction + ASTEROID_FRICTION) * 0.5,
        1,
        Math.max(1, asteroid.size / ASTEROID_SMALL_MIN),
      );
      if (result.collided) {
        applyShipSpinFromTangential(player, -result.relativeTangentSpeed);
      }

      if (
        result.collided &&
        ASTEROID_DAMAGE_SHIPS &&
        player.ship.invulnerableUntil <= sim.nowMs
      ) {
        sim.destroyAsteroid(asteroid);
        sim.onShipHit(undefined, player);
        sim.playerPowerUps.delete(playerId);
        break;
      }
    }
  }
}

export function resolvePilotAsteroidCollisions(sim: SimState): void {
  for (const [pilotPlayerId, pilot] of sim.pilots) {
    if (!pilot.alive) continue;

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;

      const result = resolveCircleCollision(
        pilot,
        asteroid,
        PILOT_RADIUS + asteroid.size,
        (0.5 + ASTEROID_RESTITUTION) * 0.5,
        ASTEROID_FRICTION,
        0.35,
        Math.max(1, asteroid.size / ASTEROID_SMALL_MIN),
      );

      if (result.collided && ASTEROID_DAMAGE_SHIPS) {
        sim.destroyAsteroid(asteroid);
        sim.killPilot(pilotPlayerId, "asteroid");
        break;
      }
    }
  }
}

export function resolveAsteroidAsteroidCollisions(sim: SimState): void {
  for (let i = 0; i < sim.asteroids.length; i++) {
    const a = sim.asteroids[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < sim.asteroids.length; j++) {
      const b = sim.asteroids[j];
      if (!b.alive) continue;
      resolveCircleCollision(
        a,
        b,
        a.size + b.size,
        ASTEROID_RESTITUTION,
        ASTEROID_FRICTION,
        Math.max(1, a.size / ASTEROID_SMALL_MIN),
        Math.max(1, b.size / ASTEROID_SMALL_MIN),
      );
    }
  }
}

export function processProjectileCollisions(sim: SimState): void {
  const consumed = new Set<string>();
  for (const proj of sim.projectiles) {
    if (consumed.has(proj.id)) continue;
    const owner = sim.players.get(proj.ownerId);
    for (const playerId of sim.playerOrder) {
      if (playerId === proj.ownerId) continue;
      const target = sim.players.get(playerId);
      if (!target || !target.ship.alive) continue;
      if (target.ship.invulnerableUntil > sim.nowMs) continue;
      const dx = target.ship.x - proj.x;
      const dy = target.ship.y - proj.y;
      if (dx * dx + dy * dy > SHIP_HIT_RADIUS * SHIP_HIT_RADIUS) continue;
      const shield = sim.playerPowerUps.get(playerId);
      if (shield?.type === "SHIELD") {
        shield.shieldHits += 1;
        sim.triggerScreenShake(3, 0.1);
        if (shield.shieldHits >= POWERUP_SHIELD_HITS) {
          sim.playerPowerUps.delete(playerId);
        }
        consumed.add(proj.id);
        break;
      }
      consumed.add(proj.id);
      sim.playerPowerUps.delete(playerId);
      sim.onShipHit(owner, target);
      break;
    }

    if (consumed.has(proj.id)) continue;
    for (const [pilotPlayerId, pilot] of sim.pilots) {
      if (!pilot.alive) continue;
      const dx = pilot.x - proj.x;
      const dy = pilot.y - proj.y;
      const hitDist = PILOT_RADIUS + PROJECTILE_RADIUS;
      if (dx * dx + dy * dy > hitDist * hitDist) continue;
      consumed.add(proj.id);
      sim.killPilot(pilotPlayerId, proj.ownerId);
      break;
    }

    if (consumed.has(proj.id)) continue;
    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      const dx = asteroid.x - proj.x;
      const dy = asteroid.y - proj.y;
      const hitDist = asteroid.size + PROJECTILE_RADIUS;
      if (dx * dx + dy * dy > hitDist * hitDist) continue;
      consumed.add(proj.id);
      sim.destroyAsteroid(asteroid);
      break;
    }
  }
  if (consumed.size > 0) {
    sim.projectiles = sim.projectiles.filter((p: { id: string }) => !consumed.has(p.id));
  }
}

export function processShipPilotCollisions(sim: SimState): void {
  for (const playerId of sim.playerOrder) {
    const shipOwner = sim.players.get(playerId);
    if (!shipOwner || !shipOwner.ship.alive) continue;
    for (const [pilotPlayerId, pilot] of sim.pilots) {
      if (!pilot.alive) continue;
      if (pilotPlayerId === playerId) continue;
      const dx = shipOwner.ship.x - pilot.x;
      const dy = shipOwner.ship.y - pilot.y;
      if (dx * dx + dy * dy > (SHIP_RADIUS + PILOT_RADIUS) * (SHIP_RADIUS + PILOT_RADIUS)) {
        continue;
      }
      sim.killPilot(pilotPlayerId, playerId);
    }
  }
}

export function updateProjectiles(sim: SimState, dtSec: number): void {
  for (const proj of sim.projectiles) {
    proj.x += proj.vx * dtSec;
    proj.y += proj.vy * dtSec;
  }
  sim.projectiles = sim.projectiles.filter((proj: RuntimeProjectile) => {
    if (sim.nowMs - proj.spawnTime > proj.lifetimeMs) return false;
    if (proj.x <= PROJECTILE_RADIUS || proj.x >= ARENA_WIDTH - PROJECTILE_RADIUS) return false;
    if (proj.y <= PROJECTILE_RADIUS || proj.y >= ARENA_HEIGHT - PROJECTILE_RADIUS) return false;
    return true;
  });
}
