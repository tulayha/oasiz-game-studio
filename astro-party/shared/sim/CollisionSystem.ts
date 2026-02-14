import type { SimState, RuntimeProjectile } from "./types.js";
import {
  PROJECTILE_RADIUS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ASTEROID_DAMAGE_SHIPS,
  POWERUP_SHIELD_HITS,
} from "./constants.js";

export function resolveShipAsteroidCollisions(sim: SimState): void {
  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      const collided = sim.physicsWorld.intersectsShipAsteroid(playerId, asteroid.id);

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
      const collided = sim.physicsWorld.intersectsPilotAsteroid(pilotPlayerId, asteroid.id);
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
      if (!sim.physicsWorld.intersectsProjectileShip(proj.id, playerId)) continue;
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
      if (!sim.physicsWorld.intersectsProjectilePilot(proj.id, pilotPlayerId)) continue;
      consumed.add(proj.id);
      sim.killPilot(pilotPlayerId, proj.ownerId);
      break;
    }

    if (consumed.has(proj.id)) continue;
    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      if (!sim.physicsWorld.intersectsProjectileAsteroid(proj.id, asteroid.id)) continue;
      consumed.add(proj.id);
      sim.destroyAsteroid(asteroid);
      break;
    }
  }
  if (consumed.size > 0) {
    for (const projId of consumed) {
      sim.physicsWorld.removeProjectile(projId);
    }
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
      if (!sim.physicsWorld.intersectsShipPilot(playerId, pilotPlayerId)) continue;
      sim.killPilot(pilotPlayerId, playerId);
    }
  }
}

export function updateProjectiles(sim: SimState, _dtSec: number): void {
  const kept: RuntimeProjectile[] = [];
  for (const proj of sim.projectiles) {
    let isAlive = true;
    if (sim.nowMs - proj.spawnTime > proj.lifetimeMs) isAlive = false;
    if (proj.x <= PROJECTILE_RADIUS || proj.x >= ARENA_WIDTH - PROJECTILE_RADIUS) isAlive = false;
    if (proj.y <= PROJECTILE_RADIUS || proj.y >= ARENA_HEIGHT - PROJECTILE_RADIUS) isAlive = false;
    if (!isAlive) {
      sim.physicsWorld.removeProjectile(proj.id);
      continue;
    }
    kept.push(proj);
  }
  sim.projectiles = kept;
}
