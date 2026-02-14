import type { SimState, RuntimeAsteroid, RuntimeProjectile } from "./types.js";
import {
  PROJECTILE_RADIUS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ASTEROID_DAMAGE_SHIPS,
  POWERUP_SHIELD_HITS,
} from "./constants.js";

export function resolveShipAsteroidCollisions(sim: SimState): void {
  if (!ASTEROID_DAMAGE_SHIPS) return;
  const handledShips = new Set<string>();
  const asteroidById = buildAliveAsteroidMap(sim);
  const pairs = sim.physicsWorld.getActivePairIds("ship", "asteroid");

  for (const { firstId: playerId, secondId: asteroidId } of pairs) {
    if (handledShips.has(playerId)) continue;
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    if (player.ship.invulnerableUntil > sim.nowMs) continue;

    const asteroid = asteroidById.get(asteroidId);
    if (!asteroid) continue;

    sim.destroyAsteroid(asteroid);
    sim.onShipHit(undefined, player);
    sim.playerPowerUps.delete(playerId);
    handledShips.add(playerId);
  }
}

export function resolvePilotAsteroidCollisions(sim: SimState): void {
  if (!ASTEROID_DAMAGE_SHIPS) return;
  const asteroidById = buildAliveAsteroidMap(sim);
  const handledPilots = new Set<string>();
  const pairs = sim.physicsWorld.getActivePairIds("pilot", "asteroid");

  for (const { firstId: pilotPlayerId, secondId: asteroidId } of pairs) {
    if (handledPilots.has(pilotPlayerId)) continue;
    const pilot = sim.pilots.get(pilotPlayerId);
    if (!pilot || !pilot.alive) continue;
    const asteroid = asteroidById.get(asteroidId);
    if (!asteroid) continue;
    sim.destroyAsteroid(asteroid);
    sim.killPilot(pilotPlayerId, "asteroid");
    handledPilots.add(pilotPlayerId);
  }
}

export function processProjectileCollisions(sim: SimState): void {
  const projectileShipHits = buildHitMap(
    sim.physicsWorld.getStartedPairIds("projectile", "ship"),
  );
  const projectilePilotHits = buildHitMap(
    sim.physicsWorld.getStartedPairIds("projectile", "pilot"),
  );
  const projectileAsteroidHits = buildHitMap(
    sim.physicsWorld.getStartedPairIds("projectile", "asteroid"),
  );
  const asteroidById = buildAliveAsteroidMap(sim);
  const consumed = new Set<string>();

  for (const proj of sim.projectiles) {
    if (consumed.has(proj.id)) continue;
    const owner = sim.players.get(proj.ownerId);
    const shipHitIds = projectileShipHits.get(proj.id) ?? [];

    for (const playerId of shipHitIds) {
      if (playerId === proj.ownerId) continue;
      const target = sim.players.get(playerId);
      if (!target || !target.ship.alive) continue;
      if (target.ship.invulnerableUntil > sim.nowMs) continue;
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
    const pilotHitIds = projectilePilotHits.get(proj.id) ?? [];
    for (const pilotPlayerId of pilotHitIds) {
      const pilot = sim.pilots.get(pilotPlayerId);
      if (!pilot) continue;
      if (!pilot.alive) continue;
      consumed.add(proj.id);
      sim.killPilot(pilotPlayerId, proj.ownerId);
      break;
    }

    if (consumed.has(proj.id)) continue;
    const asteroidHitIds = projectileAsteroidHits.get(proj.id) ?? [];
    for (const asteroidId of asteroidHitIds) {
      const asteroid = asteroidById.get(asteroidId);
      if (!asteroid) continue;
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
  const pairs = sim.physicsWorld.getActivePairIds("ship", "pilot");
  for (const { firstId: playerId, secondId: pilotPlayerId } of pairs) {
    const shipOwner = sim.players.get(playerId);
    if (!shipOwner || !shipOwner.ship.alive) continue;
    if (pilotPlayerId === playerId) continue;
    const pilot = sim.pilots.get(pilotPlayerId);
    if (!pilot || !pilot.alive) continue;
    sim.killPilot(pilotPlayerId, playerId);
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

function buildHitMap(
  pairs: Array<{ firstId: string; secondId: string }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const pair of pairs) {
    const list = out.get(pair.firstId);
    if (list) {
      list.push(pair.secondId);
    } else {
      out.set(pair.firstId, [pair.secondId]);
    }
  }
  return out;
}

function buildAliveAsteroidMap(sim: SimState): Map<string, RuntimeAsteroid> {
  const out = new Map<string, RuntimeAsteroid>();
  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    out.set(asteroid.id, asteroid);
  }
  return out;
}
