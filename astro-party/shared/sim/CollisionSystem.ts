import type { SimState, RuntimeProjectile } from "./types.js";
import {
  SHIP_RADIUS,
  SHIP_HIT_RADIUS,
  PILOT_RADIUS,
  PROJECTILE_RADIUS,
  TURRET_RADIUS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ASTEROID_DAMAGE_SHIPS,
  POWERUP_SHIELD_HITS,
} from "./constants.js";
import { clamp } from "./utils.js";

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

export function resolveShipAsteroidCollisions(sim: SimState): void {
  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      const dx = player.ship.x - asteroid.x;
      const dy = player.ship.y - asteroid.y;
      const hitDistance = SHIP_RADIUS + asteroid.size;
      const collided = dx * dx + dy * dy <= hitDistance * hitDistance;

      if (
        collided &&
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
      const dx = pilot.x - asteroid.x;
      const dy = pilot.y - asteroid.y;
      const hitDistance = PILOT_RADIUS + asteroid.size;
      const collided = dx * dx + dy * dy <= hitDistance * hitDistance;
      if (collided && ASTEROID_DAMAGE_SHIPS) {
        sim.destroyAsteroid(asteroid);
        sim.killPilot(pilotPlayerId, "asteroid");
        break;
      }
    }
  }
}

export function resolveAsteroidAsteroidCollisions(sim: SimState): void {
  void sim;
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

export function updateProjectiles(sim: SimState, _dtSec: number): void {
  sim.projectiles = sim.projectiles.filter((proj: RuntimeProjectile) => {
    if (sim.nowMs - proj.spawnTime > proj.lifetimeMs) return false;
    if (proj.x <= PROJECTILE_RADIUS || proj.x >= ARENA_WIDTH - PROJECTILE_RADIUS) return false;
    if (proj.y <= PROJECTILE_RADIUS || proj.y >= ARENA_HEIGHT - PROJECTILE_RADIUS) return false;
    return true;
  });
}
