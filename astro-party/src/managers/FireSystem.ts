import { Physics } from "../systems/Physics";
import { NetworkManager } from "../network/NetworkManager";
import { CollisionManager } from "./CollisionManager";
import { Ship } from "../entities/Ship";
import { Projectile } from "../entities/Projectile";
import { LaserBeam } from "../entities/LaserBeam";
import { Mine } from "../entities/Mine";
import { HomingMissile } from "../entities/HomingMissile";
import { AudioManager } from "../AudioManager";
import { SettingsManager } from "../SettingsManager";
import { SeededRNG } from "../systems/SeededRNG";
import {
  GAME_CONFIG,
  PlayerPowerUp,
} from "../types";

export class FireSystem {
  private soundThrottleByKey: Map<string, number> = new Map();

  constructor(
    private physics: Physics,
    private network: NetworkManager,
    private collisionMgr: CollisionManager,
    private projectiles: Projectile[],
    private laserBeams: LaserBeam[],
    private mines: Mine[],
    private homingMissiles: HomingMissile[],
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private idRng: SeededRNG,
    private onTriggerScreenShake: (intensity: number, duration: number) => void,
  ) {}

  private nextEntityId(prefix: string): string {
    return prefix + "_" + this.idRng.nextUint32().toString(16);
  }

  processFire(
    playerId: string,
    ship: Ship,
    fireResult: { shouldFire: boolean; fireAngle: number } | null,
    shouldDash: boolean,
    nowMs: number,
  ): void {
    if (fireResult?.shouldFire) {
      const playerPowerUp = this.playerPowerUps.get(playerId);

      // Cannot shoot when joust is active
      if (playerPowerUp?.type === "JOUST") {
        // Joust melee only - no shooting
      } else {
        const firePos = ship.getFirePosition();

        if (playerPowerUp?.type === "LASER" && playerPowerUp.charges > 0) {
          if (
            nowMs - playerPowerUp.lastFireTime >
            GAME_CONFIG.POWERUP_LASER_COOLDOWN
          ) {
            playerPowerUp.lastFireTime = nowMs;
            playerPowerUp.charges--;

            const beam = new LaserBeam(
              playerId,
              firePos.x,
              firePos.y,
              fireResult.fireAngle,
              this.nextEntityId("beam"),
              nowMs,
            );
            this.laserBeams.push(beam);

            this.collisionMgr.applyLaserDamage(
              playerId,
              firePos.x,
              firePos.y,
              fireResult.fireAngle,
            );
            this.playGameSoundLocal("fire");
            if (this.shouldBroadcastSound("fire", playerId)) {
              this.network.broadcastGameSoundToOthers("fire", playerId);
            }
            SettingsManager.triggerHaptic("heavy");

            if (playerPowerUp.charges <= 0) {
              this.playerPowerUps.delete(playerId);
            }
          }
        } else if (
          playerPowerUp?.type === "SCATTER" &&
          playerPowerUp.charges > 0
        ) {
          if (
            nowMs - playerPowerUp.lastFireTime >
            GAME_CONFIG.POWERUP_SCATTER_COOLDOWN
          ) {
            playerPowerUp.lastFireTime = nowMs;
            playerPowerUp.charges--;

            // Fire 3 projectiles in triangle pattern: -15°, 0°, +15°
            const angles = [
              fireResult.fireAngle -
                (GAME_CONFIG.POWERUP_SCATTER_ANGLE_1 * Math.PI) / 180,
              fireResult.fireAngle,
              fireResult.fireAngle +
                (GAME_CONFIG.POWERUP_SCATTER_ANGLE_1 * Math.PI) / 180,
            ];

            for (const angle of angles) {
              const projectile = new Projectile(
                this.physics,
                firePos.x,
                firePos.y,
                angle,
                playerId,
                nowMs,
                GAME_CONFIG.POWERUP_SCATTER_PROJECTILE_SPEED,
                GAME_CONFIG.POWERUP_SCATTER_PROJECTILE_LIFETIME,
              );
              this.projectiles.push(projectile);
            }

            this.playGameSoundLocal("fire");
            if (this.shouldBroadcastSound("fire", playerId)) {
              this.network.broadcastGameSoundToOthers("fire", playerId);
            }
            SettingsManager.triggerHaptic("medium");

            if (playerPowerUp.charges <= 0) {
              this.playerPowerUps.delete(playerId);
            }
          }
        } else if (
          playerPowerUp?.type === "MINE" &&
          playerPowerUp.charges > 0
        ) {
          // Deploy mine instead of firing
          playerPowerUp.charges--;

          // Spawn mine slightly behind the ship
          const mineOffset = 30;
          const mineX =
            firePos.x - Math.cos(fireResult.fireAngle) * mineOffset;
          const mineY =
            firePos.y - Math.sin(fireResult.fireAngle) * mineOffset;

          const mine = new Mine(
            playerId,
            mineX,
            mineY,
            this.nextEntityId("mine"),
            nowMs,
          );
          this.mines.push(mine);

          this.playGameSoundLocal("fire");
          if (this.shouldBroadcastSound("fire", playerId)) {
            this.network.broadcastGameSoundToOthers("fire", playerId);
          }
          SettingsManager.triggerHaptic("light");

          if (playerPowerUp.charges <= 0) {
            this.playerPowerUps.delete(playerId);
          }
        } else if (
          playerPowerUp?.type === "HOMING_MISSILE" &&
          playerPowerUp.charges > 0
        ) {
          // Fire homing missile
          playerPowerUp.charges--;

          const missile = new HomingMissile(
            playerId,
            firePos.x,
            firePos.y,
            fireResult.fireAngle,
            this.nextEntityId("missile"),
            nowMs,
          );
          this.homingMissiles.push(missile);

          this.playGameSoundLocal("fire");
          if (this.shouldBroadcastSound("fire", playerId)) {
            this.network.broadcastGameSoundToOthers("fire", playerId);
          }
          SettingsManager.triggerHaptic("heavy");

          if (playerPowerUp.charges <= 0) {
            this.playerPowerUps.delete(playerId);
          }
        } else {
          // Regular projectile
          const projectile = new Projectile(
            this.physics,
            firePos.x,
            firePos.y,
            fireResult.fireAngle,
            playerId,
            nowMs,
          );
          this.projectiles.push(projectile);
          this.playGameSoundLocal("fire");
          if (this.shouldBroadcastSound("fire", playerId)) {
            this.network.broadcastGameSoundToOthers("fire", playerId);
          }
        }
      }
    }

    if (shouldDash) {
      this.playGameSoundLocal("dash");
      if (this.shouldBroadcastSound("dash", playerId)) {
        this.network.broadcastGameSoundToOthers("dash", playerId);
      }
    }
  }

  playGameSoundLocal(type: string): void {
    switch (type) {
      case "fire":
        AudioManager.playFire();
        break;
      case "dash":
        AudioManager.playDash();
        break;
      case "explosion":
        AudioManager.playExplosion();
        AudioManager.playPilotEject();
        break;
      case "kill":
        AudioManager.playKill();
        AudioManager.playPilotDeath();
        break;
      case "respawn":
        AudioManager.playRespawn();
        break;
      case "win":
        AudioManager.playWin();
        break;
      default:
        break;
    }
  }

  shouldBroadcastSound(type: string, playerId: string): boolean {
    const now = performance.now();
    let interval = 0;
    if (type === "fire") interval = 120;
    if (type === "dash") interval = 200;
    if (interval <= 0) return true;

    const key = type + ":" + playerId;
    const lastTime = this.soundThrottleByKey.get(key) ?? 0;
    if (now - lastTime < interval) return false;
    this.soundThrottleByKey.set(key, now);
    return true;
  }

  clearThrottles(): void {
    this.soundThrottleByKey.clear();
  }
}
