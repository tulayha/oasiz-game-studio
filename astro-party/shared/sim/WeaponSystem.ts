import type { SimState, RuntimeMine, RuntimeAsteroid, ShipState } from "./types.js";
import {
  SHIP_RADIUS,
  PILOT_RADIUS,
  MINE_EXPLOSION_RADIUS,
  MINE_ARMING_DELAY_MS,
  MINE_DETECTION_RADIUS,
  HOMING_MISSILE_SPEED_PX_PER_SEC,
  HOMING_MISSILE_TURN_RATE,
  HOMING_MISSILE_DETECTION_RADIUS,
  HOMING_MISSILE_ACCURACY,
  HOMING_MISSILE_LIFETIME_MS,
  JOUST_SWORD_LENGTH,
  JOUST_COLLISION_RADIUS,
  POWERUP_SHIELD_HITS,
  TURRET_ROTATION_SPEED,
  TURRET_IDLE_ROTATION_SPEED,
  TURRET_BULLET_SPEED_PX_PER_SEC,
  TURRET_BULLET_LIFETIME_MS,
  TURRET_BULLET_RADIUS,
  TURRET_BULLET_IMPACT_RADIUS,
  TURRET_BULLET_EXPLOSION_RADIUS,
  TURRET_BULLET_EXPLOSION_DURATION_MS,
  ARENA_WIDTH,
  ARENA_HEIGHT,
} from "./constants.js";
import { normalizeAngle, clamp } from "./utils.js";

export function updateLaserBeams(sim: SimState): void {
  for (const beam of sim.laserBeams) {
    if (!beam.alive) continue;
    if (sim.nowMs - beam.spawnTime > beam.durationMs) {
      beam.alive = false;
    }
  }
}

export function checkMineCollisions(sim: SimState): void {
  const devMultiplier = sim.devModeEnabled ? 3 : 1;
  const detectionRadius = MINE_DETECTION_RADIUS * devMultiplier;

  for (const mine of sim.mines) {
    if (!mine.alive || mine.exploded) continue;

    if (mine.arming && sim.nowMs - mine.armingStartTime >= MINE_ARMING_DELAY_MS) {
      sim.explodeMine(mine);
      mine.triggeringPlayerId = undefined;
      continue;
    }

    if (mine.arming) continue;

    for (const playerId of sim.playerOrder) {
      if (playerId === mine.ownerId) continue;
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - mine.x;
      const dy = player.ship.y - mine.y;
      if (dx * dx + dy * dy > detectionRadius * detectionRadius) continue;
      mine.arming = true;
      mine.armingStartTime = sim.nowMs;
      mine.triggeringPlayerId = playerId;
      sim.triggerScreenShake(5, 0.15);
      break;
    }
  }
}

export function explodeMine(sim: SimState, mine: RuntimeMine): void {
  if (!mine.alive || mine.exploded) return;
  mine.exploded = true;
  mine.explosionTime = sim.nowMs;
  mine.arming = false;
  sim.triggerScreenShake(15, 0.4);

  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    const dx = player.ship.x - mine.x;
    const dy = player.ship.y - mine.y;
    if (dx * dx + dy * dy > MINE_EXPLOSION_RADIUS * MINE_EXPLOSION_RADIUS) continue;
    const shipPowerUp = sim.playerPowerUps.get(playerId);
    if (shipPowerUp?.type === "SHIELD") {
      sim.playerPowerUps.delete(playerId);
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const knockback = 350;
      player.ship.vx += (dx / dist) * knockback;
      player.ship.vy += (dy / dist) * knockback;
      sim.triggerScreenShake(10, 0.3);
      continue;
    }
    player.ship.alive = false;
    player.ship.vx = 0;
    player.ship.vy = 0;
    player.state = "SPECTATING";
    sim.playerPowerUps.delete(playerId);
    sim.hooks.onSound("explosion", playerId);
  }

  for (const [pilotPlayerId, pilot] of sim.pilots) {
    if (!pilot.alive) continue;
    const dx = pilot.x - mine.x;
    const dy = pilot.y - mine.y;
    if (dx * dx + dy * dy > MINE_EXPLOSION_RADIUS * MINE_EXPLOSION_RADIUS) continue;
    pilot.alive = false;
    sim.pilots.delete(pilotPlayerId);
    const player = sim.players.get(pilotPlayerId);
    if (player) {
      player.state = "SPECTATING";
    }
    sim.hooks.onSound("kill", pilotPlayerId);
  }

  const eliminationAt = sim.nowMs + 2000;
  if (
    sim.pendingEliminationCheckAtMs === null ||
    eliminationAt < sim.pendingEliminationCheckAtMs
  ) {
    sim.pendingEliminationCheckAtMs = eliminationAt;
  }
  sim.syncPlayers();
}

export function updateHomingMissiles(sim: SimState, dtSec: number): void {
  for (const missile of sim.homingMissiles) {
    if (!missile.alive) continue;

    let nearestId: string | null = null;
    let nearestDistSq = Infinity;
    for (const playerId of sim.playerOrder) {
      if (playerId === missile.ownerId) continue;
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - missile.x;
      const dy = player.ship.y - missile.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > HOMING_MISSILE_DETECTION_RADIUS * HOMING_MISSILE_DETECTION_RADIUS) continue;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestId = playerId;
      }
    }

    if (nearestId) {
      missile.targetId = nearestId;
      missile.hasDetectedTarget = true;
    }

    if (missile.hasDetectedTarget && missile.targetId) {
      const target = sim.players.get(missile.targetId);
      if (target && target.ship.alive) {
        const desired = Math.atan2(target.ship.y - missile.y, target.ship.x - missile.x);
        const diff = normalizeAngle(desired - missile.angle);
        const turnRate = HOMING_MISSILE_TURN_RATE * dtSec;
        const maxTurn = turnRate * HOMING_MISSILE_ACCURACY;
        missile.angle += clamp(diff, -maxTurn, maxTurn);
      } else {
        missile.targetId = null;
      }
    }

    missile.vx = Math.cos(missile.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC;
    missile.vy = Math.sin(missile.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC;

    const margin = 100;
    if (
      missile.x < -margin ||
      missile.x > ARENA_WIDTH + margin ||
      missile.y < -margin ||
      missile.y > ARENA_HEIGHT + margin
    ) {
      missile.alive = false;
      sim.physicsWorld.removeHomingMissile(missile.id);
    }
  }
}

export function checkHomingMissileCollisions(sim: SimState): void {
  const missileShipHits = buildPairHitMap(
    sim.physicsWorld.getStartedPairIds("homingMissile", "ship"),
  );
  const missileAsteroidHits = buildPairHitMap(
    sim.physicsWorld.getStartedPairIds("homingMissile", "asteroid"),
  );
  const asteroidById = new Map<string, RuntimeAsteroid>();
  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    asteroidById.set(asteroid.id, asteroid);
  }

  for (const missile of sim.homingMissiles) {
    if (!missile.alive) continue;

    const shipHitIds = missileShipHits.get(missile.id) ?? [];
    for (const playerId of shipHitIds) {
      if (playerId === missile.ownerId) continue;
      const player = sim.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - missile.x;
      const dy = player.ship.y - missile.y;

      const powerUp = sim.playerPowerUps.get(playerId);
      if (powerUp?.type === "SHIELD") {
        powerUp.shieldHits += 1;
        sim.triggerScreenShake(3, 0.1);
        if (powerUp.shieldHits >= POWERUP_SHIELD_HITS) {
          sim.playerPowerUps.delete(playerId);
        }
        missile.alive = false;
        break;
      }

      if (powerUp?.type === "JOUST") {
        const missileAngle = Math.atan2(missile.vy, missile.vx);
        const angleToShip = Math.atan2(dy, dx);
        const approachDiff = Math.abs(normalizeAngle(angleToShip - missileAngle));
        const isFromSide = approachDiff > Math.PI / 4;

        if (!isFromSide) {
          sim.playerPowerUps.delete(playerId);
          sim.onShipHit(sim.players.get(missile.ownerId), player);
          missile.alive = false;
          break;
        }

        const relativeAngle = normalizeAngle(Math.atan2(dy, dx) - player.ship.angle);
        const isLeftSide = relativeAngle > 0;
        if (isLeftSide && powerUp.leftSwordActive) {
          powerUp.leftSwordActive = false;
          missile.alive = false;
          sim.triggerScreenShake(5, 0.15);
        } else if (!isLeftSide && powerUp.rightSwordActive) {
          powerUp.rightSwordActive = false;
          missile.alive = false;
          sim.triggerScreenShake(5, 0.15);
        } else {
          sim.playerPowerUps.delete(playerId);
          sim.onShipHit(sim.players.get(missile.ownerId), player);
          missile.alive = false;
        }
        if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
          sim.playerPowerUps.delete(playerId);
        }
        break;
      }

      sim.playerPowerUps.delete(playerId);
      sim.onShipHit(sim.players.get(missile.ownerId), player);
      missile.alive = false;
      sim.triggerScreenShake(10, 0.3);
      break;
    }

    if (!missile.alive) continue;

    const asteroidHitIds = missileAsteroidHits.get(missile.id) ?? [];
    for (const asteroidId of asteroidHitIds) {
      const asteroid = asteroidById.get(asteroidId);
      if (!asteroid) continue;
      sim.destroyAsteroid(asteroid);
      missile.alive = false;
      break;
    }

    if (!missile.alive) {
      sim.physicsWorld.removeHomingMissile(missile.id);
    }
  }
}

function buildPairHitMap(
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

export function updateJoustCollisions(sim: SimState): void {
  const consumedProjectiles = new Set<string>();
  for (const [playerId, powerUp] of sim.playerPowerUps) {
    if (powerUp?.type !== "JOUST") continue;
    const owner = sim.players.get(playerId);
    if (!owner || !owner.ship.alive) continue;

    const swords = getJoustSwordGeometry(owner.ship);

    for (const otherId of sim.playerOrder) {
      if (otherId === playerId) continue;
      const other = sim.players.get(otherId);
      if (!other || !other.ship.alive) continue;
      let hitShip = false;

      if (powerUp.leftSwordActive) {
        const dx = other.ship.x - swords.left.centerX;
        const dy = other.ship.y - swords.left.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 20) ** 2) {
          const otherPowerUp = sim.playerPowerUps.get(otherId);
          if (otherPowerUp?.type === "SHIELD") {
            sim.playerPowerUps.delete(otherId);
            powerUp.leftSwordActive = false;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const knockback = 250;
            other.ship.vx += (dx / dist) * knockback;
            other.ship.vy += (dy / dist) * knockback;
            sim.triggerScreenShake(8, 0.25);
          } else {
            sim.playerPowerUps.delete(otherId);
            sim.onShipHit(owner, other);
            powerUp.leftSwordActive = false;
            sim.triggerScreenShake(8, 0.25);
          }
          hitShip = true;
        }
      }

      if (!hitShip && powerUp.rightSwordActive) {
        const dx = other.ship.x - swords.right.centerX;
        const dy = other.ship.y - swords.right.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 20) ** 2) {
          const otherPowerUp = sim.playerPowerUps.get(otherId);
          if (otherPowerUp?.type === "SHIELD") {
            sim.playerPowerUps.delete(otherId);
            powerUp.rightSwordActive = false;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const knockback = 250;
            other.ship.vx += (dx / dist) * knockback;
            other.ship.vy += (dy / dist) * knockback;
            sim.triggerScreenShake(8, 0.25);
          } else {
            sim.playerPowerUps.delete(otherId);
            sim.onShipHit(owner, other);
            powerUp.rightSwordActive = false;
            sim.triggerScreenShake(8, 0.25);
          }
        }
      }

      if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
        sim.playerPowerUps.delete(playerId);
        break;
      }
    }

    if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) continue;

    for (const proj of sim.projectiles) {
      if (proj.ownerId === playerId || consumedProjectiles.has(proj.id)) continue;
      const projAngle = Math.atan2(proj.vy, proj.vx);
      const angleToShip = Math.atan2(owner.ship.y - proj.y, owner.ship.x - proj.x);
      const isFromSide = Math.abs(normalizeAngle(angleToShip - projAngle)) > Math.PI / 4;

      if (powerUp.leftSwordActive) {
        const dx = proj.x - swords.left.centerX;
        const dy = proj.y - swords.left.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 8) ** 2 && isFromSide) {
          powerUp.leftSwordActive = false;
          consumedProjectiles.add(proj.id);
          sim.triggerScreenShake(5, 0.15);
        }
      }
      if (powerUp.rightSwordActive) {
        const dx = proj.x - swords.right.centerX;
        const dy = proj.y - swords.right.centerY;
        if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 8) ** 2 && isFromSide) {
          powerUp.rightSwordActive = false;
          consumedProjectiles.add(proj.id);
          sim.triggerScreenShake(5, 0.15);
        }
      }
    }

    if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
      sim.playerPowerUps.delete(playerId);
      continue;
    }

    for (const asteroid of sim.asteroids) {
      if (!asteroid.alive) continue;
      let destroyed = false;
      if (powerUp.leftSwordActive) {
        if (
          checkCircleAsteroidCollision(
            swords.left.centerX,
            swords.left.centerY,
            JOUST_COLLISION_RADIUS,
            asteroid,
          )
        ) {
          destroyed = true;
        }
      }
      if (!destroyed && powerUp.rightSwordActive) {
        if (
          checkCircleAsteroidCollision(
            swords.right.centerX,
            swords.right.centerY,
            JOUST_COLLISION_RADIUS,
            asteroid,
          )
        ) {
          destroyed = true;
        }
      }
      if (destroyed) {
        sim.triggerScreenShake(3, 0.1);
        sim.destroyAsteroid(asteroid);
      }
    }
  }

  if (consumedProjectiles.size > 0) {
    for (const projId of consumedProjectiles) {
      sim.physicsWorld.removeProjectile(projId);
    }
    sim.projectiles = sim.projectiles.filter((p: { id: string }) => !consumedProjectiles.has(p.id));
  }
}

function checkCircleAsteroidCollision(
  cx: number,
  cy: number,
  radius: number,
  asteroid: RuntimeAsteroid,
): boolean {
  const vertices = getAsteroidWorldVertices(asteroid);
  if (vertices.length < 3) return false;

  if (pointInPolygon(cx, cy, vertices)) {
    return true;
  }

  const radiusSq = radius * radius;
  for (const vertex of vertices) {
    const dx = vertex.x - cx;
    const dy = vertex.y - cy;
    if (dx * dx + dy * dy <= radiusSq) {
      return true;
    }
  }

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (distanceSqPointToSegment(cx, cy, a.x, a.y, b.x, b.y) <= radiusSq) {
      return true;
    }
  }

  return false;
}

function getAsteroidWorldVertices(asteroid: RuntimeAsteroid): Array<{ x: number; y: number }> {
  const cos = Math.cos(asteroid.angle);
  const sin = Math.sin(asteroid.angle);
  return asteroid.vertices.map((vertex) => ({
    x: asteroid.x + vertex.x * cos - vertex.y * sin,
    y: asteroid.y + vertex.x * sin + vertex.y * cos,
  }));
}

function pointInPolygon(
  x: number,
  y: number,
  vertices: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceSqPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) {
    const vx = px - ax;
    const vy = py - ay;
    return vx * vx + vy * vy;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const vx = px - cx;
  const vy = py - cy;
  return vx * vx + vy * vy;
}

export function getJoustSwordGeometry(ship: ShipState): {
  left: { startX: number; startY: number; centerX: number; centerY: number };
  right: { startX: number; startY: number; centerX: number; centerY: number };
} {
  const shipX = ship.x;
  const shipY = ship.y;
  const shipAngle = ship.angle;
  const size = 15;
  const cornerOffset = 8;

  const topWingX =
    shipX +
    Math.cos(shipAngle) * (-size * 0.7) +
    Math.cos(shipAngle - Math.PI / 2) * (-size * 0.6);
  const topWingY =
    shipY +
    Math.sin(shipAngle) * (-size * 0.7) +
    Math.sin(shipAngle - Math.PI / 2) * (-size * 0.6);
  const bottomWingX =
    shipX +
    Math.cos(shipAngle) * (-size * 0.7) +
    Math.cos(shipAngle + Math.PI / 2) * (-size * 0.6);
  const bottomWingY =
    shipY +
    Math.sin(shipAngle) * (-size * 0.7) +
    Math.sin(shipAngle + Math.PI / 2) * (-size * 0.6);

  const leftStartX = topWingX - Math.cos(shipAngle) * cornerOffset;
  const leftStartY = topWingY - Math.sin(shipAngle) * cornerOffset;
  const leftEndX = leftStartX + Math.cos(shipAngle) * JOUST_SWORD_LENGTH;
  const leftEndY = leftStartY + Math.sin(shipAngle) * JOUST_SWORD_LENGTH;

  const rightAngle = shipAngle + Math.PI / 18;
  const rightStartX = bottomWingX - Math.cos(shipAngle) * cornerOffset;
  const rightStartY = bottomWingY - Math.sin(shipAngle) * cornerOffset;
  const rightEndX = rightStartX + Math.cos(rightAngle) * JOUST_SWORD_LENGTH;
  const rightEndY = rightStartY + Math.sin(rightAngle) * JOUST_SWORD_LENGTH;

  return {
    left: {
      startX: leftStartX,
      startY: leftStartY,
      centerX: (leftStartX + leftEndX) * 0.5,
      centerY: (leftStartY + leftEndY) * 0.5,
    },
    right: {
      startX: rightStartX,
      startY: rightStartY,
      centerX: (rightStartX + rightEndX) * 0.5,
      centerY: (rightStartY + rightEndY) * 0.5,
    },
  };
}

export function updateTurret(sim: SimState, dtSec: number): void {
  if (!sim.turret || !sim.turret.alive) return;
  let nearest: { ship: ShipState } | null = null;
  let nearestDistSq = Infinity;
  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player || !player.ship.alive) continue;
    const dx = player.ship.x - sim.turret.x;
    const dy = player.ship.y - sim.turret.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > sim.turret.detectionRadius * sim.turret.detectionRadius) continue;
    if (distSq < nearestDistSq) {
      nearest = player;
      nearestDistSq = distSq;
    }
  }

  if (nearest) {
    const targetAngle = Math.atan2(nearest.ship.y - sim.turret.y, nearest.ship.x - sim.turret.x);
    const diff = normalizeAngle(targetAngle - sim.turret.angle);
    const maxStep = TURRET_ROTATION_SPEED * dtSec;
    const step = Math.abs(diff) < maxStep ? diff : Math.sign(diff) * maxStep;
    sim.turret.angle = normalizeAngle(sim.turret.angle + step);
    sim.turret.targetAngle = targetAngle;
    sim.turret.isTracking = true;
    const alignedDiff = Math.abs(normalizeAngle(targetAngle - sim.turret.angle));
    if (
      alignedDiff <= sim.turret.fireAngleThreshold &&
      sim.nowMs - sim.turret.lastFireTimeMs >= sim.turret.fireCooldownMs
    ) {
      sim.turret.lastFireTimeMs = sim.nowMs;
      sim.turretBullets.push({
        id: sim.nextEntityId("turret_bullet"),
        x: sim.turret.x + Math.cos(sim.turret.angle) * 40,
        y: sim.turret.y + Math.sin(sim.turret.angle) * 40,
        vx: Math.cos(sim.turret.angle) * TURRET_BULLET_SPEED_PX_PER_SEC,
        vy: Math.sin(sim.turret.angle) * TURRET_BULLET_SPEED_PX_PER_SEC,
        angle: sim.turret.angle,
        spawnTime: sim.nowMs,
        alive: true,
        exploded: false,
        explosionTime: 0,
        lifetimeMs: TURRET_BULLET_LIFETIME_MS,
        explosionRadius: TURRET_BULLET_EXPLOSION_RADIUS,
        hitsApplied: false,
      });
      sim.hooks.onSound("fire", "turret");
    }
    return;
  }

  sim.turret.isTracking = false;
  sim.turret.angle = normalizeAngle(sim.turret.angle + TURRET_IDLE_ROTATION_SPEED * dtSec);
}

export function updateTurretBullets(sim: SimState, dtSec: number): void {
  void dtSec;
  for (const bullet of sim.turretBullets) {
    if (!bullet.alive) continue;

    if (!bullet.exploded) {
      const hitWall =
        bullet.x <= TURRET_BULLET_RADIUS ||
        bullet.x >= ARENA_WIDTH - TURRET_BULLET_RADIUS ||
        bullet.y <= TURRET_BULLET_RADIUS ||
        bullet.y >= ARENA_HEIGHT - TURRET_BULLET_RADIUS;
      if (hitWall || sim.nowMs - bullet.spawnTime > bullet.lifetimeMs) {
        bullet.exploded = true;
        bullet.explosionTime = sim.nowMs;
        bullet.vx = 0;
        bullet.vy = 0;
        sim.physicsWorld.removeTurretBullet(bullet.id);
      } else {
        for (const playerId of sim.playerOrder) {
          const player = sim.players.get(playerId);
          if (!player || !player.ship.alive) continue;
          const dx = player.ship.x - bullet.x;
          const dy = player.ship.y - bullet.y;
          if (dx * dx + dy * dy > TURRET_BULLET_IMPACT_RADIUS * TURRET_BULLET_IMPACT_RADIUS) {
            continue;
          }
          bullet.exploded = true;
          bullet.explosionTime = sim.nowMs;
          bullet.vx = 0;
          bullet.vy = 0;
          sim.physicsWorld.removeTurretBullet(bullet.id);
          sim.triggerScreenShake(8, 0.2);
          break;
        }
      }
    }

    if (bullet.exploded && !bullet.hitsApplied) {
      bullet.hitsApplied = true;
      for (const playerId of sim.playerOrder) {
        const player = sim.players.get(playerId);
        if (!player || !player.ship.alive) continue;
        const dx = player.ship.x - bullet.x;
        const dy = player.ship.y - bullet.y;
        if (dx * dx + dy * dy > bullet.explosionRadius * bullet.explosionRadius) continue;
        const powerUp = sim.playerPowerUps.get(playerId);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const knockback = 300;
        if (powerUp?.type === "SHIELD") {
          sim.playerPowerUps.delete(playerId);
          player.ship.vx += (dx / dist) * knockback;
          player.ship.vy += (dy / dist) * knockback;
          sim.triggerScreenShake(5, 0.15);
          continue;
        }
        player.ship.vx += (dx / dist) * knockback;
        player.ship.vy += (dy / dist) * knockback;
        sim.playerPowerUps.delete(playerId);
        sim.onShipHit(undefined, player);
      }
    }

    if (
      bullet.exploded &&
      sim.nowMs - bullet.explosionTime > TURRET_BULLET_EXPLOSION_DURATION_MS
    ) {
      bullet.alive = false;
    }
  }
}
