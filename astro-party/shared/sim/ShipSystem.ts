import type { SimState, RuntimePlayer, ActiveConfig } from "./types.js";
import {
  SHIP_HIT_RADIUS,
  FIRE_COOLDOWN_MS,
  FIRE_HOLD_REPEAT_DELAY_MS,
  RELOAD_MS,
  PROJECTILE_LIFETIME_MS,
  PLAYER_COLORS,
  JOUST_SPEED_MULTIPLIER,
  LASER_COOLDOWN_MS,
  LASER_BEAM_DURATION_MS,
  LASER_BEAM_LENGTH,
  SCATTER_COOLDOWN_MS,
  SCATTER_ANGLE_DEG,
  SCATTER_PROJECTILE_SPEED,
  SCATTER_PROJECTILE_LIFETIME_MS,
  HOMING_MISSILE_SPEED,
  POWERUP_SHIELD_HITS,
  SHIP_DODGE_COOLDOWN_MS,
  SHIP_DODGE_ANGLE_DEG,
} from "./constants.js";
import { normalizeAngle, clamp } from "./utils.js";
import {
  PILOT_COLLIDER_VERTICES,
  transformLocalVertices,
} from "../geometry/EntityShapes.js";

export function updateShips(sim: SimState, dtSec: number): void {
  const cfg = sim.getActiveConfig();
  const isStandard = sim.baseMode === "STANDARD";

  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player) continue;
    const ship = player.ship;
    if (!ship.alive) continue;

    if (isStandard) {
      player.angularVelocity = 0;
      sim.setShipAngularVelocity(player.id, 0);
    }

    if (player.input.buttonA) {
      player.angularVelocity = 0;
      sim.setShipAngularVelocity(player.id, 0);
      ship.angle += cfg.ROTATION_SPEED * dtSec * sim.rotationDirection;
      ship.angle = normalizeAngle(ship.angle);
      sim.setShipAngle(player.id, ship.angle);
    }

    if (player.dashQueued) {
      player.dashQueued = false;
      if (sim.nowMs - player.lastShipDashAtMs >= SHIP_DODGE_COOLDOWN_MS) {
        player.lastShipDashAtMs = sim.nowMs;
        const dodgeAngle =
          ship.angle +
          ((SHIP_DODGE_ANGLE_DEG * Math.PI) / 180) * sim.rotationDirection;
        player.dashVectorX = Math.cos(dodgeAngle);
        player.dashVectorY = Math.sin(dodgeAngle);
        player.dashTimerSec = cfg.SHIP_DASH_DURATION;

        if (!isStandard) {
          sim.applyShipForce(
            player.id,
            player.dashVectorX * cfg.DASH_FORCE,
            player.dashVectorY * cfg.DASH_FORCE,
          );
        }

        sim.hooks.onSound("dash", player.id);
        sim.hooks.onDashParticles({
          playerId: player.id,
          x: ship.x,
          y: ship.y,
          angle: dodgeAngle,
          color: PLAYER_COLORS[player.colorIndex].primary,
        });
      }
    }

    if (player.dashTimerSec > 0) {
      player.dashTimerSec = Math.max(0, player.dashTimerSec - dtSec);
      if (player.dashTimerSec <= 0) {
        player.dashVectorX = 0;
        player.dashVectorY = 0;
      }
    }
    if (player.recoilTimerSec > 0) {
      player.recoilTimerSec = Math.max(0, player.recoilTimerSec - dtSec);
    }
    if (isStandard) {
      const dodgeBoost = player.dashTimerSec > 0 ? cfg.SHIP_DASH_BOOST : 0;
      const recoilSlowdown =
        player.recoilTimerSec > 0 ? cfg.SHIP_RECOIL_SLOWDOWN : 0;
      const joustPowerUp = sim.playerPowerUps.get(playerId);
      const speedMultiplier = joustPowerUp?.type === "JOUST" ? JOUST_SPEED_MULTIPLIER : 1;
      const forwardSpeed = Math.max(
        0,
        (cfg.SHIP_TARGET_SPEED - recoilSlowdown) * speedMultiplier,
      );
      const desiredVx =
        Math.cos(ship.angle) * forwardSpeed + player.dashVectorX * dodgeBoost;
      const desiredVy =
        Math.sin(ship.angle) * forwardSpeed + player.dashVectorY * dodgeBoost;
      const t = 1 - Math.exp(-cfg.SHIP_SPEED_RESPONSE * dtSec);
      ship.vx += (desiredVx - ship.vx) * t;
      ship.vy += (desiredVy - ship.vy) * t;
      sim.setShipVelocity(player.id, ship.vx, ship.vy);
    } else {
      sim.applyShipForce(
        player.id,
        Math.cos(ship.angle) * cfg.BASE_THRUST,
        Math.sin(ship.angle) * cfg.BASE_THRUST,
      );
    }

    if (player.fireRequested) {
      const didFire = tryFire(sim, player, cfg, isStandard);
      player.fireRequested = false;
      if (didFire && player.firePressStartMs <= 0) {
        player.firePressStartMs = sim.nowMs;
      }
    } else if (
      player.input.buttonB &&
      player.firePressStartMs > 0 &&
      sim.nowMs - player.firePressStartMs >= FIRE_HOLD_REPEAT_DELAY_MS
    ) {
      tryFire(sim, player, cfg, isStandard);
    }

    updateReload(sim, ship);
  }
}

export function tryFire(
  sim: SimState,
  player: RuntimePlayer,
  cfg: ActiveConfig,
  isStandard: boolean,
): boolean {
  const ship = player.ship;
  const spawnX = ship.x + Math.cos(ship.angle) * 18;
  const spawnY = ship.y + Math.sin(ship.angle) * 18;
  const powerUp = sim.playerPowerUps.get(player.id);

  if (powerUp?.type === "JOUST") {
    return false;
  }

  if (powerUp?.type === "LASER" && powerUp.charges > 0) {
    if (sim.nowMs - powerUp.lastFireTime < LASER_COOLDOWN_MS) {
      return false;
    }
    powerUp.lastFireTime = sim.nowMs;
    powerUp.charges -= 1;
    sim.laserBeams.push({
      id: sim.nextEntityId("beam"),
      ownerId: player.id,
      x: spawnX,
      y: spawnY,
      angle: ship.angle,
      spawnTime: sim.nowMs,
      alive: true,
      durationMs: LASER_BEAM_DURATION_MS,
    });
    applyLaserDamage(sim, player.id, spawnX, spawnY, ship.angle);
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (powerUp?.type === "SCATTER" && powerUp.charges > 0) {
    if (sim.nowMs - powerUp.lastFireTime < SCATTER_COOLDOWN_MS) {
      return false;
    }
    powerUp.lastFireTime = sim.nowMs;
    powerUp.charges -= 1;
    const offsets = [-(SCATTER_ANGLE_DEG * Math.PI) / 180, 0, (SCATTER_ANGLE_DEG * Math.PI) / 180];
    for (const offset of offsets) {
      const angle = ship.angle + offset;
      sim.projectiles.push({
        id: sim.nextEntityId("proj"),
        ownerId: player.id,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(angle) * SCATTER_PROJECTILE_SPEED,
        vy: Math.sin(angle) * SCATTER_PROJECTILE_SPEED,
        spawnTime: sim.nowMs,
        lifetimeMs: SCATTER_PROJECTILE_LIFETIME_MS,
      });
    }
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (powerUp?.type === "MINE" && powerUp.charges > 0) {
    powerUp.charges -= 1;
    const mineOffset = 30;
    sim.mines.push({
      id: sim.nextEntityId("mine"),
      ownerId: player.id,
      x: spawnX - Math.cos(ship.angle) * mineOffset,
      y: spawnY - Math.sin(ship.angle) * mineOffset,
      spawnTime: sim.nowMs,
      alive: true,
      exploded: false,
      explosionTime: 0,
      arming: false,
      armingStartTime: 0,
    });
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (powerUp?.type === "HOMING_MISSILE" && powerUp.charges > 0) {
    powerUp.charges -= 1;
    sim.homingMissiles.push({
      id: sim.nextEntityId("missile"),
      ownerId: player.id,
      x: spawnX,
      y: spawnY,
      vx: Math.cos(ship.angle) * HOMING_MISSILE_SPEED,
      vy: Math.sin(ship.angle) * HOMING_MISSILE_SPEED,
      angle: ship.angle,
      spawnTime: sim.nowMs,
      alive: true,
      targetId: null,
      hasDetectedTarget: false,
    });
    sim.hooks.onSound("fire", player.id);
    if (powerUp.charges <= 0) {
      sim.playerPowerUps.delete(player.id);
    }
    return true;
  }

  if (sim.nowMs - ship.lastShotTime < FIRE_COOLDOWN_MS) return false;
  if (ship.ammo <= 0) return false;

  ship.lastShotTime = sim.nowMs;
  ship.ammo -= 1;

  if (isStandard) {
    player.recoilTimerSec = cfg.SHIP_RECOIL_DURATION;
  } else {
    sim.applyShipForce(
      player.id,
      -Math.cos(ship.angle) * cfg.RECOIL_FORCE,
      -Math.sin(ship.angle) * cfg.RECOIL_FORCE,
    );
  }

  if (!ship.isReloading) {
    ship.reloadStartTime = sim.nowMs;
    ship.isReloading = true;
  }

  sim.projectiles.push({
    id: sim.nextEntityId("proj"),
    ownerId: player.id,
    x: spawnX,
    y: spawnY,
    vx: Math.cos(ship.angle) * cfg.PROJECTILE_SPEED,
    vy: Math.sin(ship.angle) * cfg.PROJECTILE_SPEED,
    spawnTime: sim.nowMs,
    lifetimeMs: PROJECTILE_LIFETIME_MS,
  });
  sim.hooks.onSound("fire", player.id);
  return true;
}

function updateReload(sim: SimState, ship: { ammo: number; maxAmmo: number; isReloading: boolean; reloadStartTime: number }): void {
  if (!ship.isReloading) return;
  if (ship.ammo >= ship.maxAmmo) {
    ship.isReloading = false;
    return;
  }
  if (sim.nowMs - ship.reloadStartTime < RELOAD_MS) return;
  ship.ammo += 1;
  ship.reloadStartTime = sim.nowMs;
  if (ship.ammo >= ship.maxAmmo) {
    ship.ammo = ship.maxAmmo;
    ship.isReloading = false;
  }
}

function applyLaserDamage(
  sim: SimState,
  ownerId: string,
  startX: number,
  startY: number,
  angle: number,
): void {
  const endX = startX + Math.cos(angle) * LASER_BEAM_LENGTH;
  const endY = startY + Math.sin(angle) * LASER_BEAM_LENGTH;

  for (const playerId of sim.playerOrder) {
    if (playerId === ownerId) continue;
    const shipOwner = sim.players.get(playerId);
    if (!shipOwner || !shipOwner.ship.alive) continue;
    if (shipOwner.ship.invulnerableUntil > sim.nowMs) continue;
    if (
      !checkLineCircleCollision(
        startX, startY, endX, endY,
        shipOwner.ship.x, shipOwner.ship.y,
        SHIP_HIT_RADIUS,
      )
    ) {
      continue;
    }
    const shield = sim.playerPowerUps.get(playerId);
    if (shield?.type === "SHIELD") {
      shield.shieldHits += 1;
      sim.triggerScreenShake(3, 0.1);
      if (shield.shieldHits >= POWERUP_SHIELD_HITS) {
        sim.playerPowerUps.delete(playerId);
      }
      continue;
    }
    sim.playerPowerUps.delete(playerId);
    sim.onShipHit(sim.players.get(ownerId), shipOwner);
  }

  for (const [pilotPlayerId, pilot] of sim.pilots) {
    if (!pilot.alive) continue;
    if (
      checkLinePilotCollision(
        startX, startY, endX, endY,
        pilot.x, pilot.y, pilot.angle,
      )
    ) {
      sim.killPilot(pilotPlayerId, ownerId);
    }
  }

  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    if (
      checkLineAsteroidCollision(
        startX, startY, endX, endY,
        asteroid,
      )
    ) {
      sim.destroyAsteroid(asteroid);
    }
  }
}

function checkLineAsteroidCollision(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  asteroid: {
    x: number;
    y: number;
    angle: number;
    vertices: Array<{ x: number; y: number }>;
  },
): boolean {
  const vertices = getAsteroidWorldVertices(asteroid);
  if (vertices.length < 3) return false;

  if (pointInPolygon(x1, y1, vertices) || pointInPolygon(x2, y2, vertices)) {
    return true;
  }

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (segmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) {
      return true;
    }
  }

  return false;
}

function checkLinePilotCollision(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pilotX: number,
  pilotY: number,
  pilotAngle: number,
): boolean {
  const vertices = transformLocalVertices(PILOT_COLLIDER_VERTICES, pilotX, pilotY, pilotAngle);
  if (vertices.length < 3) return false;

  if (pointInPolygon(x1, y1, vertices) || pointInPolygon(x2, y2, vertices)) {
    return true;
  }

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (segmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) {
      return true;
    }
  }

  return false;
}

function getAsteroidWorldVertices(asteroid: {
  x: number;
  y: number;
  angle: number;
  vertices: Array<{ x: number; y: number }>;
}): Array<{ x: number; y: number }> {
  return transformLocalVertices(
    asteroid.vertices,
    asteroid.x,
    asteroid.y,
    asteroid.angle,
  );
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

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const orient = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);

  const onSegment = (
    px: number,
    py: number,
    qx: number,
    qy: number,
    rx: number,
    ry: number,
  ): boolean =>
    Math.min(px, qx) <= rx &&
    rx <= Math.max(px, qx) &&
    Math.min(py, qy) <= ry &&
    ry <= Math.max(py, qy);

  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;

  const eps = 1e-9;
  if (Math.abs(o1) <= eps && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (Math.abs(o2) <= eps && onSegment(ax, ay, bx, by, dx, dy)) return true;
  if (Math.abs(o3) <= eps && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (Math.abs(o4) <= eps && onSegment(cx, cy, dx, dy, bx, by)) return true;

  return false;
}

export function checkLineCircleCollision(
  x1: number, y1: number,
  x2: number, y2: number,
  cx: number, cy: number,
  radius: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const distSq = (cx - x1) ** 2 + (cy - y1) ** 2;
    return distSq <= radius * radius;
  }
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  t = clamp(t, 0, 1);
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const distSq = (cx - px) ** 2 + (cy - py) ** 2;
  return distSq <= radius * radius;
}

