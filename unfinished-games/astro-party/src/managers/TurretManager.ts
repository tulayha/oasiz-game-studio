import { Physics } from "../systems/Physics";
import { Renderer } from "../systems/Renderer";
import { NetworkManager } from "../network/NetworkManager";
import { GameFlowManager } from "./GameFlowManager";
import { PlayerManager } from "./PlayerManager";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Turret } from "../entities/Turret";
import { TurretBullet } from "../entities/TurretBullet";
import { FireSystem } from "./FireSystem";
import { SettingsManager } from "../SettingsManager";
import { GAME_CONFIG, PlayerPowerUp } from "../types";

export class TurretManager {
  private turret: Turret | null = null;
  private turretBullets: TurretBullet[] = [];

  constructor(
    private physics: Physics,
    private renderer: Renderer,
    private network: NetworkManager,
    private flowMgr: GameFlowManager,
    private playerMgr: PlayerManager,
    private ships: Map<string, Ship>,
    private pilots: Map<string, Pilot>,
    private playerPowerUps: Map<string, PlayerPowerUp | null>,
    private fireSystem: FireSystem,
    private onTriggerScreenShake: (intensity: number, duration: number) => void,
  ) {}

  spawn(): void {
    if (!this.network.isHost()) return;

    const centerX = GAME_CONFIG.ARENA_WIDTH / 2;
    const centerY = GAME_CONFIG.ARENA_HEIGHT / 2;

    this.turret = new Turret(this.physics, centerX, centerY);
    console.log("[TurretManager] Turret spawned at center:", centerX, centerY);
  }

  update(dt: number, nowMs: number): void {
    if (!this.network.isHost()) return;

    this.updateTurret(dt, nowMs);
    this.updateTurretBullets(dt, nowMs);
  }

  clear(): void {
    if (this.turret) {
      this.turret.destroy();
      this.turret = null;
    }

    this.turretBullets.forEach((bullet) => bullet.destroy());
    this.turretBullets.length = 0;
  }

  getTurret(): Turret | null {
    return this.turret;
  }

  getTurretBullets(): TurretBullet[] {
    return this.turretBullets;
  }

  private updateTurret(dt: number, nowMs: number): void {
    if (!this.turret) return;

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

    const fireResult = this.turret.update(dt, nowMs, shipPositions);
    if (fireResult?.shouldFire) {
      const turretX = this.turret.body.position.x;
      const turretY = this.turret.body.position.y;
      const bullet = new TurretBullet(
        this.physics,
        turretX + Math.cos(fireResult.fireAngle) * 40,
        turretY + Math.sin(fireResult.fireAngle) * 40,
        fireResult.fireAngle,
        nowMs,
      );
      this.turretBullets.push(bullet);

      this.fireSystem.playGameSoundLocal("fire");
      if (this.fireSystem.shouldBroadcastSound("fire", "turret")) {
        this.network.broadcastGameSoundToOthers("fire", "turret");
      }
    }
  }

  private updateTurretBullets(dt: number, nowMs: number): void {
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

    for (let i = this.turretBullets.length - 1; i >= 0; i--) {
      const bullet = this.turretBullets[i];
      const stillActive = bullet.update(dt, nowMs);

      if (!bullet.exploded) {
        for (const ship of this.ships.values()) {
          if (!ship.alive) continue;

          const dx = ship.body.position.x - bullet.body.position.x;
          const dy = ship.body.position.y - bullet.body.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= 25) {
            bullet.explode(nowMs);
            this.renderer.spawnExplosion(
              bullet.body.position.x,
              bullet.body.position.y,
              "#ff6600",
            );
            this.onTriggerScreenShake(8, 0.2);
            break;
          }
        }
      }

      if (bullet.exploded) {
        const hitShips = bullet.checkExplosionHits(shipPositions);
        for (const shipPlayerId of hitShips) {
          const ship = this.ships.get(shipPlayerId);
          if (ship && ship.alive) {
            const powerUp = this.playerPowerUps.get(shipPlayerId);
            if (powerUp?.type === "SHIELD") {
              powerUp.shieldHits++;
              this.onTriggerScreenShake(3, 0.1);
              if (powerUp.shieldHits >= GAME_CONFIG.POWERUP_SHIELD_HITS) {
                this.renderer.spawnShieldBreakDebris(
                  ship.body.position.x,
                  ship.body.position.y,
                );
                this.playerPowerUps.delete(shipPlayerId);
                SettingsManager.triggerHaptic("medium");
              }
            } else {
            this.flowMgr.destroyShip(
              shipPlayerId,
              this.ships,
              this.pilots,
              this.playerMgr.players,
              nowMs,
            );
              this.playerPowerUps.delete(shipPlayerId);
            }
          }
        }
      }

      if (bullet.isExpired(nowMs) || !stillActive) {
        bullet.destroy();
        this.turretBullets.splice(i, 1);
      }
    }
  }
}
