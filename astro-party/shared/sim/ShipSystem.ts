import type { SimState, RuntimePlayer, ActiveConfig } from "./types.js";
import {
  SHIP_HIT_RADIUS,
  PILOT_RADIUS,
  FIRE_COOLDOWN_MS,
  FIRE_HOLD_REPEAT_DELAY_MS,
  RELOAD_MS,
  PROJECTILE_LIFETIME_MS,
  FORCE_TO_ACCEL,
  FORCE_TO_IMPULSE,
  RECOIL_TO_IMPULSE,
  PLAYER_COLORS,
  JOUST_SPEED_MULTIPLIER,
  LASER_COOLDOWN_MS,
  LASER_BEAM_DURATION_MS,
  LASER_BEAM_LENGTH,
  SCATTER_COOLDOWN_MS,
  SCATTER_ANGLE_DEG,
  SCATTER_PROJECTILE_SPEED_PX_PER_SEC,
  SCATTER_PROJECTILE_LIFETIME_MS,
  HOMING_MISSILE_SPEED_PX_PER_SEC,
  POWERUP_SHIELD_HITS,
  SHIP_FRICTION_AIR_BY_PRESET,
  SHIP_ANGULAR_DAMPING_BY_PRESET,
} from "./constants.js";
import { normalizeAngle, clamp } from "./utils.js";

export function updateShips(sim: SimState, dtSec: number): void {
  const cfg = sim.getActiveConfig();
  const isStandard = sim.baseMode === "STANDARD";
  const shipFrictionAir =
    SHIP_FRICTION_AIR_BY_PRESET[sim.settings.shipFrictionAirPreset] ?? 0;
  const shipAngularDamping =
    SHIP_ANGULAR_DAMPING_BY_PRESET[sim.settings.angularDampingPreset] ?? 0;

  for (const playerId of sim.playerOrder) {
    const player = sim.players.get(playerId);
    if (!player) continue;
    const ship = player.ship;
    if (!ship.alive) continue;

    if (player.input.buttonA) {
      player.angularVelocity = 0;
      ship.angle += cfg.ROTATION_SPEED * dtSec * sim.rotationDirection;
      ship.angle = normalizeAngle(ship.angle);
    } else if (player.angularVelocity !== 0) {
      ship.angle = normalizeAngle(ship.angle + player.angularVelocity * dtSec);
    }

    if (player.dashQueued) {
      player.dashQueued = false;
      if (isStandard) {
        player.dashTimerSec = cfg.SHIP_DASH_DURATION;
      } else {
        const dashImpulse = cfg.DASH_FORCE * FORCE_TO_IMPULSE;
        ship.vx += Math.cos(ship.angle) * dashImpulse;
        ship.vy += Math.sin(ship.angle) * dashImpulse;
      }
      sim.hooks.onSound("dash", player.id);
      sim.hooks.onDashParticles({
        playerId: player.id,
        x: ship.x,
        y: ship.y,
        angle: ship.angle,
        color: PLAYER_COLORS[player.colorIndex].primary,
      });
    }

    if (player.dashTimerSec > 0) {
      player.dashTimerSec = Math.max(0, player.dashTimerSec - dtSec);
    }
    if (player.recoilTimerSec > 0) {
      player.recoilTimerSec = Math.max(0, player.recoilTimerSec - dtSec);
    }
    if (shipAngularDamping > 0 && player.angularVelocity !== 0) {
      const damping = Math.max(0, 1 - shipAngularDamping * 60 * dtSec);
      player.angularVelocity *= damping;
      if (Math.abs(player.angularVelocity) < 1e-4) {
        player.angularVelocity = 0;
      }
    }

    if (isStandard) {
      const dashBoost = player.dashTimerSec > 0 ? cfg.SHIP_DASH_BOOST : 0;
      const recoilSlowdown =
        player.recoilTimerSec > 0 ? cfg.SHIP_RECOIL_SLOWDOWN : 0;
      const joustPowerUp = sim.playerPowerUps.get(playerId);
      const speedMultiplier = joustPowerUp?.type === "JOUST" ? JOUST_SPEED_MULTIPLIER : 1;
      const targetSpeedPxSec = Math.max(
        0,
        (cfg.SHIP_TARGET_SPEED + dashBoost - recoilSlowdown) * speedMultiplier * 60,
      );
      const desiredVx = Math.cos(ship.angle) * targetSpeedPxSec;
      const desiredVy = Math.sin(ship.angle) * targetSpeedPxSec;
      const t = 1 - Math.exp(-cfg.SHIP_SPEED_RESPONSE * dtSec);
      ship.vx += (desiredVx - ship.vx) * t;
      ship.vy += (desiredVy - ship.vy) * t;
    } else {
      const accel = cfg.BASE_THRUST * FORCE_TO_ACCEL;
      ship.vx += Math.cos(ship.angle) * accel * dtSec;
      ship.vy += Math.sin(ship.angle) * accel * dtSec;
    }

    if (shipFrictionAir > 0) {
      const damping = Math.max(0, 1 - shipFrictionAir * 60 * dtSec);
      ship.vx *= damping;
      ship.vy *= damping;
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
        vx: Math.cos(angle) * SCATTER_PROJECTILE_SPEED_PX_PER_SEC,
        vy: Math.sin(angle) * SCATTER_PROJECTILE_SPEED_PX_PER_SEC,
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
      vx: Math.cos(ship.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC,
      vy: Math.sin(ship.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC,
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
    const recoilImpulse = cfg.RECOIL_FORCE * RECOIL_TO_IMPULSE;
    ship.vx -= Math.cos(ship.angle) * recoilImpulse;
    ship.vy -= Math.sin(ship.angle) * recoilImpulse;
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
      checkLineCircleCollision(
        startX, startY, endX, endY,
        pilot.x, pilot.y,
        PILOT_RADIUS,
      )
    ) {
      sim.killPilot(pilotPlayerId, ownerId);
    }
  }

  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    if (
      checkLineCircleCollision(
        startX, startY, endX, endY,
        asteroid.x, asteroid.y,
        asteroid.size,
      )
    ) {
      sim.destroyAsteroid(asteroid);
    }
  }
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

