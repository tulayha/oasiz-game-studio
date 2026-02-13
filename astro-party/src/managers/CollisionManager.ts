import { NetworkManager } from "../network/NetworkManager";
import { setupCollisions } from "../systems/Collision";
import { Physics } from "../systems/Physics";
import { Renderer } from "../systems/Renderer";
import { GameFlowManager } from "./GameFlowManager";
import { PlayerManager } from "./PlayerManager";
import { AsteroidManager } from "./AsteroidManager";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Projectile } from "../entities/Projectile";
import { PowerUp } from "../entities/PowerUp";
import { Mine } from "../entities/Mine";
import { HomingMissile } from "../entities/HomingMissile";
import { SettingsManager } from "../SettingsManager";
import {
  GAME_CONFIG,
  PlayerPowerUp,
  PowerUpType,
} from "../types";

export interface CollisionManagerDeps {
  network: NetworkManager;
  renderer: Renderer;
  flowMgr: GameFlowManager;
  playerMgr: PlayerManager;
  asteroidMgr: AsteroidManager;
  ships: Map<string, Ship>;
  pilots: Map<string, Pilot>;
  projectiles: Projectile[];
  powerUps: PowerUp[];
  mines: Mine[];
  homingMissiles: HomingMissile[];
  playerPowerUps: Map<string, PlayerPowerUp | null>;
  onGrantPowerUp: (playerId: string, type: PowerUpType) => void;
  onTriggerScreenShake: (intensity: number, duration: number) => void;
  onEmitPlayersUpdate: () => void;
  isDevModeEnabled: () => boolean;
}

export class CollisionManager {
  private network: NetworkManager;
  private renderer: Renderer;
  private flowMgr: GameFlowManager;
  private playerMgr: PlayerManager;
  private asteroidMgr: AsteroidManager;
  private ships: Map<string, Ship>;
  private pilots: Map<string, Pilot>;
  private projectiles: Projectile[];
  private powerUps: PowerUp[];
  private mines: Mine[];
  private homingMissiles: HomingMissile[];
  private playerPowerUps: Map<string, PlayerPowerUp | null>;
  private onGrantPowerUp: (playerId: string, type: PowerUpType) => void;
  private onTriggerScreenShake: (intensity: number, duration: number) => void;
  private onEmitPlayersUpdate: () => void;
  private isDevModeEnabled: () => boolean;
  private simTimeMs: number = 0;
  private pendingEliminationCheckAtMs: number | null = null;

  constructor(deps: CollisionManagerDeps) {
    this.network = deps.network;
    this.renderer = deps.renderer;
    this.flowMgr = deps.flowMgr;
    this.playerMgr = deps.playerMgr;
    this.asteroidMgr = deps.asteroidMgr;
    this.ships = deps.ships;
    this.pilots = deps.pilots;
    this.projectiles = deps.projectiles;
    this.powerUps = deps.powerUps;
    this.mines = deps.mines;
    this.homingMissiles = deps.homingMissiles;
    this.playerPowerUps = deps.playerPowerUps;
    this.onGrantPowerUp = deps.onGrantPowerUp;
    this.onTriggerScreenShake = deps.onTriggerScreenShake;
    this.onEmitPlayersUpdate = deps.onEmitPlayersUpdate;
    this.isDevModeEnabled = deps.isDevModeEnabled;
  }

  setSimTimeMs(nowMs: number): void {
    this.simTimeMs = nowMs;
  }

  update(nowMs: number): void {
    if (!this.network.isHost()) return;
    if (
      this.pendingEliminationCheckAtMs !== null &&
      nowMs >= this.pendingEliminationCheckAtMs
    ) {
      this.pendingEliminationCheckAtMs = null;
      if (this.flowMgr.phase === "PLAYING") {
        this.flowMgr.checkEliminationWin(this.playerMgr.players);
      }
    }
  }

  registerCollisions(physics: Physics): void {
    setupCollisions(physics, {
      onProjectileHitShip: (
        projectileOwnerId,
        shipPlayerId,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;
        const ship = this.ships.get(shipPlayerId);
        if (ship && ship.alive && !ship.isInvulnerable(this.simTimeMs)) {
          const powerUp = this.playerPowerUps.get(shipPlayerId);
          if (powerUp?.type === "SHIELD") {
            powerUp.shieldHits++;
            this.flowMgr.removeProjectileByBody(
              projectileBody,
              this.projectiles,
            );
            this.onTriggerScreenShake(3, 0.1);
            if (powerUp.shieldHits >= GAME_CONFIG.POWERUP_SHIELD_HITS) {
              this.renderer.spawnShieldBreakDebris(
                ship.body.position.x,
                ship.body.position.y,
              );
              this.playerPowerUps.delete(shipPlayerId);
              SettingsManager.triggerHaptic("medium");
            }
            return;
          }

          this.flowMgr.destroyShip(
            shipPlayerId,
            this.ships,
            this.pilots,
            this.playerMgr.players,
            this.simTimeMs,
          );
          this.playerPowerUps.delete(shipPlayerId);
          this.flowMgr.removeProjectileByBody(
            projectileBody,
            this.projectiles,
          );
        }
      },
      onProjectileHitPilot: (
        projectileOwnerId,
        pilotPlayerId,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;
        this.flowMgr.killPilot(
          pilotPlayerId,
          projectileOwnerId,
          this.pilots,
          this.playerMgr.players,
        );
        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
      onShipHitPilot: (shipPlayerId, pilotPlayerId) => {
        if (!this.network.isHost()) return;
        this.flowMgr.killPilot(
          pilotPlayerId,
          shipPlayerId,
          this.pilots,
          this.playerMgr.players,
        );
      },
      onProjectileHitWall: (projectileBody) => {
        if (!this.network.isHost()) return;
        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
      onProjectileHitAsteroid: (
        projectileOwnerId,
        asteroidBody,
        projectileBody,
      ) => {
        if (!this.network.isHost()) return;

        this.destroyAsteroidByBody(asteroidBody, 8, 0.2);

        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
      onShipHitAsteroid: (shipPlayerId, asteroidBody) => {
        if (!this.network.isHost()) return;
        if (!GAME_CONFIG.ASTEROID_DAMAGE_SHIPS) return;

        const ship = this.ships.get(shipPlayerId);
        if (ship && ship.alive && !ship.isInvulnerable(this.simTimeMs)) {
          const powerUp = this.playerPowerUps.get(shipPlayerId);
          if (powerUp?.type === "SHIELD") {
            powerUp.shieldHits++;

            this.destroyAsteroidByBody(asteroidBody, 10, 0.3);

            this.onTriggerScreenShake(3, 0.1);
            if (powerUp.shieldHits >= GAME_CONFIG.POWERUP_SHIELD_HITS) {
              this.renderer.spawnShieldBreakDebris(
                ship.body.position.x,
                ship.body.position.y,
              );
              this.playerPowerUps.delete(shipPlayerId);
              SettingsManager.triggerHaptic("medium");
            }
            return;
          }

          this.destroyAsteroidByBody(asteroidBody, 10, 0.3);

          this.flowMgr.destroyShip(
            shipPlayerId,
            this.ships,
            this.pilots,
            this.playerMgr.players,
            this.simTimeMs,
          );
          this.playerPowerUps.delete(shipPlayerId);
        }
      },
      onPilotHitAsteroid: (pilotPlayerId, asteroidBody) => {
        if (!this.network.isHost()) return;
        if (!GAME_CONFIG.ASTEROID_DAMAGE_SHIPS) return;

        const pilot = this.pilots.get(pilotPlayerId);
        if (pilot && pilot.alive) {
          this.destroyAsteroidByBody(asteroidBody, 6, 0.2);

          this.flowMgr.killPilot(
            pilotPlayerId,
            "asteroid",
            this.pilots,
            this.playerMgr.players,
          );
        }
      },
      onShipHitPowerUp: (shipPlayerId, powerUpBody) => {
        if (!this.network.isHost()) return;

        const existingPowerUp = this.playerPowerUps.get(shipPlayerId);
        if (existingPowerUp) return;

        const powerUpIndex = this.powerUps.findIndex(
          (p) => p.body === powerUpBody,
        );
        if (powerUpIndex !== -1 && this.powerUps[powerUpIndex].alive) {
          const powerUp = this.powerUps[powerUpIndex];
          this.onGrantPowerUp(shipPlayerId, powerUp.type);
          powerUp.destroy();
          this.powerUps.splice(powerUpIndex, 1);
          SettingsManager.triggerHaptic("medium");
        }
      },
    });
  }

  private destroyAsteroidByBody(
    asteroidBody: unknown,
    screenShakeIntensity: number,
    screenShakeDuration: number,
  ): void {
    const asteroids = this.asteroidMgr.getAsteroids();
    const asteroidIndex = asteroids.findIndex((a) => a.body === asteroidBody);
    if (asteroidIndex === -1 || !asteroids[asteroidIndex].alive) return;

    const asteroid = asteroids[asteroidIndex];
    const pos = asteroid.body.position;

    this.renderer.spawnExplosion(
      pos.x,
      pos.y,
      GAME_CONFIG.ASTEROID_COLOR,
    );
    this.renderer.spawnAsteroidDebris(
      pos.x,
      pos.y,
      asteroid.size,
      GAME_CONFIG.ASTEROID_COLOR,
    );
    this.onTriggerScreenShake(screenShakeIntensity, screenShakeDuration);

    asteroid.destroy();
    asteroids.splice(asteroidIndex, 1);

    if (asteroid.isLarge()) {
      this.asteroidMgr.splitAsteroid(asteroid, pos.x, pos.y);
    } else {
    this.asteroidMgr.trySpawnPowerUp(pos.x, pos.y, this.simTimeMs);
    }
  }

  applyLaserDamage(
    ownerId: string,
    startX: number,
    startY: number,
    angle: number,
  ): void {
    const beamLength = GAME_CONFIG.POWERUP_BEAM_LENGTH;
    const endX = startX + Math.cos(angle) * beamLength;
    const endY = startY + Math.sin(angle) * beamLength;

    this.ships.forEach((ship, shipPlayerId) => {
      if (
        shipPlayerId === ownerId ||
        !ship.alive ||
        ship.isInvulnerable(this.simTimeMs)
      )
        return;

      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          ship.body.position.x,
          ship.body.position.y,
          25,
        )
      ) {
        this.flowMgr.destroyShip(
          shipPlayerId,
          this.ships,
          this.pilots,
          this.playerMgr.players,
          this.simTimeMs,
        );
        this.playerPowerUps.delete(shipPlayerId);
      }
    });

    const asteroids = this.asteroidMgr.getAsteroids();
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const asteroid = asteroids[i];
      if (!asteroid.alive) continue;

      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          asteroid.body.position.x,
          asteroid.body.position.y,
          asteroid.size,
        )
      ) {
        const pos = asteroid.body.position;
        this.renderer.spawnExplosion(pos.x, pos.y, GAME_CONFIG.ASTEROID_COLOR);
        this.renderer.spawnAsteroidDebris(
          pos.x,
          pos.y,
          asteroid.size,
          GAME_CONFIG.ASTEROID_COLOR,
        );
        asteroid.destroy();
        asteroids.splice(i, 1);
        if (asteroid.isLarge()) {
          this.asteroidMgr.splitAsteroid(asteroid, pos.x, pos.y);
        } else {
          this.asteroidMgr.trySpawnPowerUp(pos.x, pos.y, this.simTimeMs);
        }
      }
    }

    this.pilots.forEach((pilot, pilotPlayerId) => {
      if (!pilot.alive) return;

      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          pilot.body.position.x,
          pilot.body.position.y,
          10,
        )
      ) {
        this.flowMgr.killPilot(
          pilotPlayerId,
          ownerId,
          this.pilots,
          this.playerMgr.players,
        );
      }
    });
  }

  checkLineCircleCollision(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
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
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;

    return distSq <= radius * radius;
  }

  explodeMine(mine: Mine, triggeredByPlayerId?: string): void {
    if (!this.network.isHost()) return;

    // Mark mine as exploded - this will sync to clients immediately
    mine.explode(this.simTimeMs);

    const explosionRadius = GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS;
    const mineX = mine.x;
    const mineY = mine.y;

    // Trigger mine explosion effect on host (synced to clients via network state)
    this.renderer.spawnMineExplosion(mineX, mineY, explosionRadius);
    this.onTriggerScreenShake(15, 0.4);
    SettingsManager.triggerHaptic("heavy");

    // IMMEDIATELY destroy the triggering ship and any ships in radius
    // Both mine and ship animations play simultaneously
    this.ships.forEach((ship, shipPlayerId) => {
      if (!ship.alive) return;

      const dx = ship.body.position.x - mineX;
      const dy = ship.body.position.y - mineY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Destroy any ship in explosion radius (including the triggering player)
      if (dist <= explosionRadius) {
        const pos = ship.body.position;

        // Spawn ship explosion and debris immediately
        this.renderer.spawnExplosion(pos.x, pos.y, ship.color.primary);
        this.renderer.spawnShipDebris(pos.x, pos.y, ship.color.primary);
        this.onTriggerScreenShake(10, 0.3);

        // Destroy ship without creating pilot (mine instantly kills)
        ship.destroy();
        this.ships.delete(shipPlayerId);
        this.playerPowerUps.delete(shipPlayerId);

        // Set player as spectating (eliminated)
        const player = this.playerMgr.players.get(shipPlayerId);
        if (player) {
          player.state = "SPECTATING";
          this.network.updatePlayerState(shipPlayerId, "SPECTATING");
        }

        this.network.broadcastGameSound("explosion", shipPlayerId);
        SettingsManager.triggerHaptic("heavy");
      }
    });

    // Destroy pilots in explosion radius
    this.pilots.forEach((pilot, pilotPlayerId) => {
      if (!pilot.alive) return;

      const dx = pilot.body.position.x - mineX;
      const dy = pilot.body.position.y - mineY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= explosionRadius) {
        const pos = pilot.body.position;
        this.renderer.spawnExplosion(pos.x, pos.y, "#ff0000");
        this.onTriggerScreenShake(8, 0.2);

        pilot.destroy();
        this.pilots.delete(pilotPlayerId);

        const player = this.playerMgr.players.get(pilotPlayerId);
        if (player) {
          player.state = "SPECTATING";
          this.network.updatePlayerState(pilotPlayerId, "SPECTATING");
        }

        this.network.broadcastGameSound("kill", pilotPlayerId);
        SettingsManager.triggerHaptic("error");
      }
    });

    // Update player list to show eliminations
    this.onEmitPlayersUpdate();

    // Wait for both mine explosion (500ms) and ship debris (up to 1400ms) animations
    // Plus extra time to see the aftermath (tick-based)
    const eliminationAt = this.simTimeMs + 2000;
    if (
      this.pendingEliminationCheckAtMs === null ||
      eliminationAt < this.pendingEliminationCheckAtMs
    ) {
      this.pendingEliminationCheckAtMs = eliminationAt;
    }
  }

  checkMineCollisions(): void {
    if (!this.network.isHost()) return;

    // Mine detection radius - increased when dev mode is on for testing
    const baseMineRadius = GAME_CONFIG.POWERUP_MINE_SIZE + 33;
    const devModeMultiplier = this.isDevModeEnabled() ? 3 : 1; // Triple radius in dev mode
    const mineDetectionRadius = baseMineRadius * devModeMultiplier;

    for (const mine of this.mines) {
      if (!mine.alive || mine.exploded) continue;

      // Check if mine is arming and should explode
      if (mine.checkArmingComplete(this.simTimeMs)) {
        this.explodeMine(mine, mine.triggeringPlayerId);
        mine.triggeringPlayerId = undefined;
        continue;
      }

      // Skip normal collision check if mine is already arming
      if (mine.isArming()) continue;

      // Check collision with all ships
      for (const [shipPlayerId, ship] of this.ships) {
        if (!ship.alive) continue;

        const dx = ship.body.position.x - mine.x;
        const dy = ship.body.position.y - mine.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= mineDetectionRadius) {
          if (shipPlayerId !== mine.ownerId) {
            // Player touched the mine - trigger arming sequence
            // Explosion happens after 1 second delay
            mine.triggerArming(this.simTimeMs);
            mine.triggeringPlayerId = shipPlayerId;
            // Show warning effect
            this.renderer.spawnExplosion(mine.x, mine.y, "#ff4400");
            this.onTriggerScreenShake(5, 0.15);
            SettingsManager.triggerHaptic("medium");
            break;
          }
        }
      }
    }
  }

  updateHomingMissiles(dt: number): void {
    if (!this.network.isHost()) return;

    // Create ship position map for targeting
    const shipPositions = new Map<
      string,
      { x: number; y: number; alive: boolean }
    >();
    this.ships.forEach((ship, playerId) => {
      shipPositions.set(playerId, {
        x: ship.body.position.x,
        y: ship.body.position.y,
        alive: ship.alive,
      });
    });

    for (const missile of this.homingMissiles) {
      if (!missile.alive) continue;
      missile.update(dt, shipPositions);
    }
  }

  checkHomingMissileCollisions(): void {
    if (!this.network.isHost()) return;

    const asteroids = this.asteroidMgr.getAsteroids();

    for (const missile of this.homingMissiles) {
      if (!missile.alive) continue;

      // Check collision with ships
      for (const [shipPlayerId, ship] of this.ships) {
        if (!ship.alive || shipPlayerId === missile.ownerId) continue;

        const dx = ship.body.position.x - missile.x;
        const dy = ship.body.position.y - missile.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Missile radius (approx 6) + ship radius (approx 25)
        if (dist <= 31) {
          // Check if ship has shield or joust
          const powerUp = this.playerPowerUps.get(shipPlayerId);
          if (powerUp?.type === "SHIELD") {
            powerUp.shieldHits++;
            missile.destroy();
            this.onTriggerScreenShake(3, 0.1);
            if (powerUp.shieldHits >= GAME_CONFIG.POWERUP_SHIELD_HITS) {
              this.renderer.spawnShieldBreakDebris(
                ship.body.position.x,
                ship.body.position.y,
              );
              this.playerPowerUps.delete(shipPlayerId);
              SettingsManager.triggerHaptic("medium");
            }
          } else if (powerUp?.type === "JOUST") {
            // Check approach angle: is missile coming from the sides?
            const missileAngle = Math.atan2(missile.vy, missile.vx);
            const angleToShip = Math.atan2(dy, dx);
            const approachDiff = angleToShip - missileAngle;
            const normalizedApproach = Math.abs(
              Math.atan2(Math.sin(approachDiff), Math.cos(approachDiff)),
            );
            const isFromSide = normalizedApproach > Math.PI / 4;

            if (!isFromSide) {
              // Coming from front/back — passes through swords, hits ship
              this.flowMgr.destroyShip(
                shipPlayerId,
                this.ships,
                this.pilots,
                this.playerMgr.players,
                this.simTimeMs,
              );
              this.playerPowerUps.delete(shipPlayerId);
              missile.destroy();
            } else {
              // Coming from side — determine which sword blocks it
              const shipAngle = ship.body.angle;
              const relativeAngle = Math.atan2(dy, dx) - shipAngle;
              const normalizedAngle = Math.atan2(
                Math.sin(relativeAngle),
                Math.cos(relativeAngle),
              );
              const isLeftSide = normalizedAngle > 0;

              if (isLeftSide && powerUp.leftSwordActive) {
                powerUp.leftSwordActive = false;
                missile.destroy();
                this.onTriggerScreenShake(5, 0.15);
                SettingsManager.triggerHaptic("medium");
              } else if (!isLeftSide && powerUp.rightSwordActive) {
                powerUp.rightSwordActive = false;
                missile.destroy();
                this.onTriggerScreenShake(5, 0.15);
                SettingsManager.triggerHaptic("medium");
              } else {
                // Active sword not on the hit side — destroy ship
                this.flowMgr.destroyShip(
                  shipPlayerId,
                  this.ships,
                  this.pilots,
                  this.playerMgr.players,
                  this.simTimeMs,
                );
                this.playerPowerUps.delete(shipPlayerId);
                missile.destroy();
              }
            }

            // Remove joust if both swords are gone
            if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
              this.playerPowerUps.delete(shipPlayerId);
            }
          } else {
            // No protection - destroy ship
            this.flowMgr.destroyShip(
              shipPlayerId,
              this.ships,
              this.pilots,
              this.playerMgr.players,
              this.simTimeMs,
            );
            this.playerPowerUps.delete(shipPlayerId);
            missile.destroy();

            // Spawn explosion effect
            this.renderer.spawnExplosion(missile.x, missile.y, "#ff4400");
            this.onTriggerScreenShake(10, 0.3);
          }
          break;
        }
      }

      if (!missile.alive) continue;

      // Check collision with asteroids
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const asteroid = asteroids[i];
        if (!asteroid.alive) continue;

        const dx = asteroid.body.position.x - missile.x;
        const dy = asteroid.body.position.y - missile.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= asteroid.size + 6) {
          // Destroy asteroid
          const pos = asteroid.body.position;
          this.renderer.spawnExplosion(
            pos.x,
            pos.y,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.renderer.spawnAsteroidDebris(
            pos.x,
            pos.y,
            asteroid.size,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.onTriggerScreenShake(8, 0.2);

          asteroid.destroy();
          asteroids.splice(i, 1);

          if (asteroid.isLarge()) {
            this.asteroidMgr.splitAsteroid(asteroid, pos.x, pos.y);
          } else {
            this.asteroidMgr.trySpawnPowerUp(pos.x, pos.y, this.simTimeMs);
          }

          missile.destroy();
          break;
        }
      }
    }
  }

  checkJoustCollisions(): void {
    if (!this.network.isHost()) return;

    const asteroids = this.asteroidMgr.getAsteroids();

    // Check Joust sword-to-ship collisions
    for (const [playerId, powerUp] of this.playerPowerUps) {
      if (powerUp?.type !== "JOUST") continue;

      const ship = this.ships.get(playerId);
      if (!ship || !ship.alive) continue;

      const shipX = ship.body.position.x;
      const shipY = ship.body.position.y;
      const shipAngle = ship.body.angle;

      // Calculate sword positions relative to ship
      // Swords are now at 10-degree angles from back corners with offset
      const swordLength = GAME_CONFIG.POWERUP_JOUST_SIZE;
      const size = 15;
      const cornerOffset = 8; // Space at back corners

      // Ship triangle vertices (relative to center, rotated by ship angle)
      const noseX = shipX + Math.cos(shipAngle) * size;
      const noseY = shipY + Math.sin(shipAngle) * size;
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

      // Left sword: starts at left back corner with offset, extends at 0 degrees (straight forward)
      const leftSwordAngle = shipAngle;
      // Apply offset backward from ship direction
      const leftSwordStartX = topWingX - Math.cos(shipAngle) * cornerOffset;
      const leftSwordStartY = topWingY - Math.sin(shipAngle) * cornerOffset;
      const leftSwordEndX =
        leftSwordStartX + Math.cos(leftSwordAngle) * swordLength;
      const leftSwordEndY =
        leftSwordStartY + Math.sin(leftSwordAngle) * swordLength;

      // Right sword: starts at right back corner with offset, extends at +10 degrees from ship
      const rightSwordAngle = shipAngle + Math.PI / 18;
      // Apply offset backward from ship direction
      const rightSwordStartX = bottomWingX - Math.cos(shipAngle) * cornerOffset;
      const rightSwordStartY = bottomWingY - Math.sin(shipAngle) * cornerOffset;
      const rightSwordEndX =
        rightSwordStartX + Math.cos(rightSwordAngle) * swordLength;
      const rightSwordEndY =
        rightSwordStartY + Math.sin(rightSwordAngle) * swordLength;

      // Calculate sword center points for collision detection
      const leftSwordCenterX = (leftSwordStartX + leftSwordEndX) / 2;
      const leftSwordCenterY = (leftSwordStartY + leftSwordEndY) / 2;
      const rightSwordCenterX = (rightSwordStartX + rightSwordEndX) / 2;
      const rightSwordCenterY = (rightSwordStartY + rightSwordEndY) / 2;

      // Check collision with other ships
      for (const [otherPlayerId, otherShip] of this.ships) {
        if (otherPlayerId === playerId || !otherShip.alive) continue;

        const otherX = otherShip.body.position.x;
        const otherY = otherShip.body.position.y;

        // Check left sword collision (using center point)
        let hitShip = false;
        if (powerUp.leftSwordActive) {
          const dx = otherX - leftSwordCenterX;
          const dy = otherY - leftSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Sword hitbox: length/2 + ship radius
          if (dist <= swordLength / 2 + 20) {
            // Destroy other ship
            this.flowMgr.destroyShip(
              otherPlayerId,
              this.ships,
              this.pilots,
              this.playerMgr.players,
              this.simTimeMs,
            );
            this.playerPowerUps.delete(otherPlayerId);

            // Left sword falls off
            powerUp.leftSwordActive = false;
            this.onTriggerScreenShake(8, 0.25);
            SettingsManager.triggerHaptic("heavy");

            // Spawn debris for fallen sword at the start position (back corner)
            this.renderer.spawnShipDebris(
              leftSwordStartX,
              leftSwordStartY,
              "#00ff44",
            );
            hitShip = true;
          }
        }

        // Check right sword collision (skip if left sword already killed this ship)
        if (!hitShip && powerUp.rightSwordActive) {
          const dx = otherX - rightSwordCenterX;
          const dy = otherY - rightSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= swordLength / 2 + 20) {
            // Destroy other ship
            this.flowMgr.destroyShip(
              otherPlayerId,
              this.ships,
              this.pilots,
              this.playerMgr.players,
              this.simTimeMs,
            );
            this.playerPowerUps.delete(otherPlayerId);

            // Right sword falls off
            powerUp.rightSwordActive = false;
            this.onTriggerScreenShake(8, 0.25);
            SettingsManager.triggerHaptic("heavy");

            // Spawn debris for fallen sword at the start position (back corner)
            this.renderer.spawnShipDebris(
              rightSwordStartX,
              rightSwordStartY,
              "#00ff44",
            );
          }
        }

        // Remove joust if both swords are gone
        if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
          this.playerPowerUps.delete(playerId);
          break;
        }
      }

      // Check sword-to-projectile collisions (block bullets from sides only)
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const projectile = this.projectiles[i];
        if (projectile.ownerId === playerId) continue; // Don't block own bullets

        const projX = projectile.body.position.x;
        const projY = projectile.body.position.y;

        // Get projectile velocity direction
        const projVx = projectile.body.velocity.x;
        const projVy = projectile.body.velocity.y;
        const projAngle = Math.atan2(projVy, projVx);

        // Calculate angle from projectile to ship
        const dx = shipX - projX;
        const dy = shipY - projY;
        const angleToShip = Math.atan2(dy, dx);

        // Check if projectile is approaching from the sides (should be blocked)
        // vs front/back (should pass through to hit ship)
        const angleDiff = angleToShip - projAngle;
        const normalizedAngleDiff = Math.abs(
          Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff)),
        );

        // Only block if projectile is coming from the sides (angle > 45 degrees from approach direction)
        const isFromSide = normalizedAngleDiff > Math.PI / 4; // > 45 degrees

        // Check left sword collision with projectile
        if (powerUp.leftSwordActive) {
          const swordDx = projX - leftSwordCenterX;
          const swordDy = projY - leftSwordCenterY;
          const dist = Math.sqrt(swordDx * swordDx + swordDy * swordDy);

          if (dist <= swordLength / 2 + 8) {
            if (isFromSide) {
              // Destroy sword and block projectile
              powerUp.leftSwordActive = false;
              this.flowMgr.removeProjectileByBody(
                projectile.body,
                this.projectiles,
              );
              this.renderer.spawnExplosion(
                leftSwordCenterX,
                leftSwordCenterY,
                "#00ff44",
              );
              this.onTriggerScreenShake(5, 0.15);
              SettingsManager.triggerHaptic("medium");

              // Spawn debris where the bullet hit the sword
              this.renderer.spawnShipDebris(projX, projY, "#00ff44");
            }
            // If not from side, let projectile pass through to hit ship
          }
        }

        // Check right sword collision with projectile
        if (powerUp.rightSwordActive) {
          const swordDx = projX - rightSwordCenterX;
          const swordDy = projY - rightSwordCenterY;
          const dist = Math.sqrt(swordDx * swordDx + swordDy * swordDy);

          if (dist <= swordLength / 2 + 8) {
            if (isFromSide) {
              // Destroy sword and block projectile
              powerUp.rightSwordActive = false;
              this.flowMgr.removeProjectileByBody(
                projectile.body,
                this.projectiles,
              );
              this.renderer.spawnExplosion(
                rightSwordCenterX,
                rightSwordCenterY,
                "#00ff44",
              );
              this.onTriggerScreenShake(5, 0.15);
              SettingsManager.triggerHaptic("medium");

              // Spawn debris where the bullet hit the sword
              this.renderer.spawnShipDebris(projX, projY, "#00ff44");
            }
            // If not from side, let projectile pass through to hit ship
          }
        }
      }

      // Remove joust if both swords are gone after projectile collisions
      if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
        this.playerPowerUps.delete(playerId);
        continue;
      }

      // Check sword-to-asteroid collisions (destroy asteroids, swords stay intact)
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const asteroid = asteroids[i];
        if (!asteroid.alive) continue;

        const asteroidX = asteroid.body.position.x;
        const asteroidY = asteroid.body.position.y;

        let asteroidDestroyed = false;
        let hitByLeftSword = false;
        let hitByRightSword = false;

        // Check left sword collision - swords destroy asteroids but don't break
        if (powerUp.leftSwordActive && !asteroidDestroyed) {
          const dx = asteroidX - leftSwordCenterX;
          const dy = asteroidY - leftSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= swordLength / 2 + asteroid.size) {
            asteroidDestroyed = true;
            hitByLeftSword = true;
            this.onTriggerScreenShake(3, 0.1);
          }
        }

        // Check right sword collision - swords destroy asteroids but don't break
        if (powerUp.rightSwordActive && !asteroidDestroyed) {
          const dx = asteroidX - rightSwordCenterX;
          const dy = asteroidY - rightSwordCenterY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= swordLength / 2 + asteroid.size) {
            asteroidDestroyed = true;
            hitByRightSword = true;
            this.onTriggerScreenShake(3, 0.1);
          }
        }

        if (asteroidDestroyed) {
          // Destroy asteroid
          const pos = asteroid.body.position;
          this.renderer.spawnExplosion(
            pos.x,
            pos.y,
            GAME_CONFIG.ASTEROID_COLOR,
          );
          this.renderer.spawnAsteroidDebris(
            pos.x,
            pos.y,
            asteroid.size,
            GAME_CONFIG.ASTEROID_COLOR,
          );

          asteroid.destroy();
          asteroids.splice(i, 1);

          if (asteroid.isLarge()) {
            this.asteroidMgr.splitAsteroid(asteroid, pos.x, pos.y);
          } else {
            this.asteroidMgr.trySpawnPowerUp(pos.x, pos.y, this.simTimeMs);
          }
        }
      }
    }
  }
}
