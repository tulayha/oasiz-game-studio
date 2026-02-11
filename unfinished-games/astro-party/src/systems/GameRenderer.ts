import { Renderer } from "./Renderer";
import { DisplaySmoother } from "../network/DisplaySmoother";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Projectile } from "../entities/Projectile";
import { Asteroid } from "../entities/Asteroid";
import { PowerUp } from "../entities/PowerUp";
import { LaserBeam } from "../entities/LaserBeam";
import { Mine } from "../entities/Mine";
import { HomingMissile } from "../entities/HomingMissile";
import {
  GAME_CONFIG,
  GamePhase,
  PlayerData,
  PlayerPowerUp,
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
} from "../types";

export interface RenderContext {
  dt: number;
  phase: GamePhase;
  countdown: number;
  isHost: boolean;
  isDevModeEnabled: boolean;
  ships: Map<string, Ship>;
  pilots: Map<string, Pilot>;
  projectiles: Projectile[];
  asteroids: Asteroid[];
  powerUps: PowerUp[];
  laserBeams: LaserBeam[];
  mines: Mine[];
  homingMissiles: HomingMissile[];
  playerPowerUps: Map<string, PlayerPowerUp | null>;
  players: Map<string, PlayerData>;
  networkShips: ShipState[];
  networkPilots: PilotState[];
  networkProjectiles: ProjectileState[];
  networkAsteroids: AsteroidState[];
  networkPowerUps: PowerUpState[];
  networkLaserBeams: LaserBeamState[];
  networkMines: MineState[];
  networkHomingMissiles: HomingMissileState[];
  shipSmoother: DisplaySmoother;
  projectileSmoother: DisplaySmoother;
  asteroidSmoother: DisplaySmoother;
  pilotSmoother: DisplaySmoother;
  missileSmoother: DisplaySmoother;
}

export class GameRenderer {
  constructor(private renderer: Renderer) {}

  render(ctx: RenderContext): void {
    this.renderer.clear();
    this.renderer.beginFrame();

    this.renderer.drawStars();
    this.renderer.drawArenaBorder();

    if (ctx.phase === "PLAYING" || ctx.phase === "GAME_END") {
      let renderShips: ShipState[];
      let renderPilots: PilotState[];
      let renderProjectiles: ProjectileState[];
      let renderAsteroids: AsteroidState[];
      let renderHomingMissiles: HomingMissileState[];

      if (!ctx.isHost) {
        const dtMs = ctx.dt * 1000;
        ctx.shipSmoother.update(dtMs);
        ctx.projectileSmoother.update(dtMs);
        ctx.asteroidSmoother.update(dtMs);
        ctx.pilotSmoother.update(dtMs);
        ctx.missileSmoother.update(dtMs);

        renderShips = ctx.shipSmoother.smooth(
          ctx.networkShips,
          (s) => s.playerId,
        );
        renderPilots = ctx.pilotSmoother.smooth(
          ctx.networkPilots,
          (p) => p.playerId,
        );
        renderProjectiles = ctx.projectileSmoother.smooth(
          ctx.networkProjectiles,
          (p) => p.id,
        );
        renderAsteroids = ctx.asteroidSmoother.smooth(
          ctx.networkAsteroids,
          (a) => a.id,
        );
        renderHomingMissiles = ctx.missileSmoother.smooth(
          ctx.networkHomingMissiles,
          (m) => m.id,
        );
      } else {
        renderShips = ctx.networkShips;
        renderPilots = ctx.networkPilots;
        renderProjectiles = ctx.networkProjectiles;
        renderAsteroids = ctx.networkAsteroids;
        renderHomingMissiles = ctx.networkHomingMissiles;
      }

      const renderPowerUps = ctx.networkPowerUps;
      const renderLaserBeams = ctx.networkLaserBeams;
      const renderMines = ctx.networkMines;

      if (ctx.isHost) {
        ctx.ships.forEach((ship) => {
          if (ship.alive) {
            const powerUp = ctx.playerPowerUps.get(ship.playerId);
            const renderData = this.getShipPowerUpRenderData(powerUp);
            this.renderer.drawShip(
              ship.getState(),
              ship.color,
              renderData.shieldHits,
              renderData.laserCharges,
              renderData.laserCooldownProgress,
              renderData.scatterCharges,
              renderData.scatterCooldownProgress,
              renderData.joustLeftActive,
              renderData.joustRightActive,
              renderData.homingMissileCharges,
            );
          }
        });
      } else {
        renderShips.forEach((state) => {
          if (state.alive) {
            const player = ctx.players.get(state.playerId);
            if (player) {
              const powerUp = ctx.playerPowerUps.get(state.playerId);
              const renderData = this.getShipPowerUpRenderData(powerUp);
              this.renderer.drawShip(
                state,
                player.color,
                renderData.shieldHits,
                renderData.laserCharges,
                renderData.laserCooldownProgress,
                renderData.scatterCharges,
                renderData.scatterCooldownProgress,
                renderData.joustLeftActive,
                renderData.joustRightActive,
                renderData.homingMissileCharges,
              );
            }
          }
        });
      }

      if (ctx.isHost) {
        ctx.pilots.forEach((pilot) => {
          if (pilot.alive) {
            const player = ctx.players.get(pilot.playerId);
            if (player) {
              this.renderer.drawPilot(pilot.getState(), player.color);
            }
          }
        });
      } else {
        renderPilots.forEach((state) => {
          if (state.alive) {
            const player = ctx.players.get(state.playerId);
            if (player) {
              this.renderer.drawPilot(state, player.color);
            }
          }
        });
      }

      if (ctx.isHost) {
        ctx.projectiles.forEach((proj) => {
          this.renderer.drawProjectile(proj.getState());
        });
      } else {
        renderProjectiles.forEach((state) => {
          this.renderer.drawProjectile(state);
        });
      }

      if (ctx.isHost) {
        ctx.asteroids.forEach((asteroid) => {
          if (asteroid.alive) {
            this.renderer.drawAsteroid(asteroid.getState());
          }
        });
      } else {
        renderAsteroids.forEach((state) => {
          if (state.alive) {
            this.renderer.drawAsteroid(state);
          }
        });
      }

      if (ctx.isHost) {
        ctx.powerUps.forEach((powerUp) => {
          if (powerUp.alive) {
            this.renderer.drawPowerUp(powerUp.getState());
          }
        });
      } else {
        renderPowerUps.forEach((state) => {
          if (state.alive) {
            this.renderer.drawPowerUp(state);
          }
        });
      }

      if (ctx.isHost) {
        ctx.laserBeams.forEach((beam) => {
          if (beam.alive) {
            this.renderer.drawLaserBeam(beam.getState());
          }
        });
      } else {
        renderLaserBeams.forEach((state) => {
          if (state.alive) {
            this.renderer.drawLaserBeam(state);
          }
        });
      }

      if (ctx.isHost) {
        ctx.mines.forEach((mine) => {
          if (mine.alive) {
            this.renderer.drawMine(mine);
          }
        });
      } else {
        // For clients, mines render directly from network state
        renderMines.forEach((state) => {
          if (state.alive) {
            this.renderer.drawMineState(state);
          }
        });
      }

      if (ctx.isHost) {
        ctx.homingMissiles.forEach((missile) => {
          if (missile.alive) {
            this.renderer.drawHomingMissile(missile.getState());
          }
        });
      } else {
        renderHomingMissiles.forEach((state) => {
          if (state.alive) {
            this.renderer.drawHomingMissile(state);
          }
        });
      }

      if (ctx.isDevModeEnabled) {
        if (ctx.isHost) {
          ctx.homingMissiles.forEach((missile) => {
            if (missile.alive) {
              const state = missile.getState();
              this.renderer.drawHomingMissileDetectionRadius(
                state.x,
                state.y,
                GAME_CONFIG.POWERUP_HOMING_MISSILE_DETECTION_RADIUS,
              );
            }
          });
        } else {
          renderHomingMissiles.forEach((state) => {
            if (state.alive) {
              this.renderer.drawHomingMissileDetectionRadius(
                state.x,
                state.y,
                GAME_CONFIG.POWERUP_HOMING_MISSILE_DETECTION_RADIUS,
              );
            }
          });
        }

        const mineDetectionRadius = GAME_CONFIG.POWERUP_MINE_SIZE + 33;
        if (ctx.isHost) {
          ctx.mines.forEach((mine) => {
            if (mine.alive && !mine.exploded) {
              this.renderer.drawMineDetectionRadius(
                mine.x,
                mine.y,
                mineDetectionRadius,
              );
            }
          });
        } else {
          renderMines.forEach((state) => {
            if (state.alive && !state.exploded) {
              this.renderer.drawMineDetectionRadius(
                state.x,
                state.y,
                mineDetectionRadius,
              );
            }
          });
        }
      }

      this.renderer.drawParticles();
    }

    if (ctx.phase === "COUNTDOWN" && ctx.countdown > 0) {
      this.renderer.drawCountdown(ctx.countdown);
    } else if (ctx.phase === "COUNTDOWN" && ctx.countdown === 0) {
      this.renderer.drawCountdown(0);
    }

    this.renderer.endFrame();
  }

  private getShipPowerUpRenderData(
    powerUp: PlayerPowerUp | null | undefined,
  ): {
    shieldHits?: number;
    laserCharges?: number;
    laserCooldownProgress?: number;
    scatterCharges?: number;
    scatterCooldownProgress?: number;
    joustLeftActive?: boolean;
    joustRightActive?: boolean;
    homingMissileCharges?: number;
  } {
    const shieldHits = powerUp?.type === "SHIELD" ? powerUp.shieldHits : undefined;
    const laserCharges = powerUp?.type === "LASER" ? powerUp.charges : undefined;
    const laserCooldownProgress =
      powerUp?.type === "LASER" &&
      powerUp.charges < GAME_CONFIG.POWERUP_LASER_CHARGES
        ? Math.min(
            1,
            (Date.now() - powerUp.lastFireTime) /
              GAME_CONFIG.POWERUP_LASER_COOLDOWN,
          )
        : undefined;
    const scatterCharges =
      powerUp?.type === "SCATTER" ? powerUp.charges : undefined;
    const scatterCooldownProgress =
      powerUp?.type === "SCATTER" &&
      powerUp.charges < GAME_CONFIG.POWERUP_SCATTER_CHARGES
        ? Math.min(
            1,
            (Date.now() - powerUp.lastFireTime) /
              GAME_CONFIG.POWERUP_SCATTER_COOLDOWN,
          )
        : undefined;
    const joustLeftActive =
      powerUp?.type === "JOUST" ? powerUp.leftSwordActive : undefined;
    const joustRightActive =
      powerUp?.type === "JOUST" ? powerUp.rightSwordActive : undefined;
    const homingMissileCharges =
      powerUp?.type === "HOMING_MISSILE" ? powerUp.charges : undefined;

    return {
      shieldHits,
      laserCharges,
      laserCooldownProgress,
      scatterCharges,
      scatterCooldownProgress,
      joustLeftActive,
      joustRightActive,
      homingMissileCharges,
    };
  }
}
