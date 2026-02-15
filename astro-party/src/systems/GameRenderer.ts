import { Renderer } from "./Renderer";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Projectile } from "../entities/Projectile";
import { Asteroid } from "../entities/Asteroid";
import { PowerUp } from "../entities/PowerUp";
import { LaserBeam } from "../entities/LaserBeam";
import { Mine } from "../entities/Mine";
import { HomingMissile } from "../entities/HomingMissile";
import { Turret } from "../entities/Turret";
import { TurretBullet } from "../entities/TurretBullet";
import {
  GAME_CONFIG,
  GamePhase,
  MapId,
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
  TurretState,
  TurretBulletState,
} from "../types";
import { getMapDefinition, type YellowBlock } from "../../shared/sim/maps";

export interface RenderContext {
  dt: number;
  nowMs: number;
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
  turret: Turret | null;
  turretBullets: TurretBullet[];
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
  networkTurret: TurretState | null;
  networkTurretBullets: TurretBulletState[];
  mapId: MapId;
  yellowBlockHp: number[];
}

export class GameRenderer {
  constructor(private renderer: Renderer) {}

  render(ctx: RenderContext): void {
    this.renderer.clear();
    this.renderer.beginFrame();
    const useSimTime =
      ctx.phase === "PLAYING" || ctx.phase === "GAME_END" || ctx.phase === "ROUND_END";
    this.renderer.setGameTimeMs(useSimTime ? ctx.nowMs : null);

    this.renderer.drawStars();
    const map = getMapDefinition(ctx.mapId);
    const mapTheme = this.getMapTheme(ctx.mapId);
    const mapTimeSec = ctx.nowMs / 1000;
    this.renderer.drawArenaBorder(mapTheme.border);
    for (const block of this.getYellowBlocksForRender(map.yellowBlocks, ctx.yellowBlockHp)) {
      this.renderer.drawYellowBlock(block);
    }
    for (const hole of map.centerHoles) {
      this.renderer.drawCenterHole(hole, mapTimeSec, 1, mapTheme.centerHole);
    }
    for (const zone of map.repulsionZones) {
      this.renderer.drawRepulsionZone(zone, mapTimeSec, mapTheme.repulsion);
    }

    if (ctx.phase === "PLAYING" || ctx.phase === "GAME_END") {
      let renderShips: ShipState[];
      let renderPilots: PilotState[];
      let renderProjectiles: ProjectileState[];
      let renderAsteroids: AsteroidState[];
      let renderHomingMissiles: HomingMissileState[];

      if (!ctx.isHost) {
        renderShips = ctx.networkShips;
        renderPilots = ctx.networkPilots;
        renderProjectiles = ctx.networkProjectiles;
        renderAsteroids = ctx.networkAsteroids;
        renderHomingMissiles = ctx.networkHomingMissiles;
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
      const renderTurret = ctx.networkTurret;
      const renderTurretBullets = ctx.networkTurretBullets;

      if (ctx.isHost) {
        ctx.ships.forEach((ship) => {
          if (ship.alive) {
            const powerUp = ctx.playerPowerUps.get(ship.playerId);
            const renderData = this.getShipPowerUpRenderData(
              powerUp,
              ctx.nowMs,
            );
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
              const renderData = this.getShipPowerUpRenderData(
                powerUp,
                ctx.nowMs,
              );
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
              this.renderer.drawPilot(pilot.getState(ctx.nowMs), player.color);
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
            this.renderer.drawPowerUp(powerUp.getState(ctx.nowMs));
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

      if (ctx.isHost) {
        if (ctx.turret) {
          this.renderer.drawTurret(ctx.turret.getState());
        }
      } else {
        if (renderTurret) {
          this.renderer.drawTurret(renderTurret);
        }
      }

      if (ctx.isHost) {
        ctx.turretBullets.forEach((bullet) => {
          if (bullet.alive) {
            this.renderer.drawTurretBullet(bullet.getState());
          }
        });
      } else {
        renderTurretBullets.forEach((state) => {
          if (state.alive) {
            this.renderer.drawTurretBullet(state);
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

        if (ctx.isHost) {
          if (ctx.turret) {
            this.renderer.drawTurretDetectionRadius(
              ctx.turret.body.position.x,
              ctx.turret.body.position.y,
              ctx.turret.getDetectionRadius(),
            );
          }
        } else {
          if (renderTurret) {
            this.renderer.drawTurretDetectionRadius(
              renderTurret.x,
              renderTurret.y,
              renderTurret.detectionRadius,
            );
          }
        }

        if (ctx.isHost) {
          ctx.turretBullets.forEach((bullet) => {
            if (bullet.alive && !bullet.exploded) {
              this.renderer.drawTurretBulletRadius(
                bullet.body.position.x,
                bullet.body.position.y,
                bullet.getExplosionRadius(),
              );
            }
          });
        } else {
          renderTurretBullets.forEach((state) => {
            if (state.alive && !state.exploded) {
              this.renderer.drawTurretBulletRadius(state.x, state.y, 100);
            }
          });
        }

        if (ctx.isHost) {
          ctx.powerUps.forEach((powerUp) => {
            if (powerUp.alive) {
              this.renderer.drawPowerUpMagneticRadius(
                powerUp.body.position.x,
                powerUp.body.position.y,
                powerUp.getMagneticRadius(),
                powerUp.getIsMagneticActive(),
              );
            }
          });
        } else {
          renderPowerUps.forEach((state) => {
            if (state.alive) {
              this.renderer.drawPowerUpMagneticRadius(
                state.x,
                state.y,
                state.magneticRadius || 150,
                state.isMagneticActive || false,
              );
            }
          });
        }
      }

      for (const box of map.overlayBoxes) {
        this.renderer.drawOverlayBox(box, mapTheme.overlay);
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
    nowMs: number,
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
            (nowMs - powerUp.lastFireTime) /
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
            (nowMs - powerUp.lastFireTime) /
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

  private getYellowBlocksForRender(
    yellowBlocks: YellowBlock[],
    networkYellowBlockHp: number[],
  ): YellowBlock[] {
    if (networkYellowBlockHp.length <= 0) return [];
    if (networkYellowBlockHp.length !== yellowBlocks.length) return [];
    return yellowBlocks.filter((_, index) => (networkYellowBlockHp[index] ?? 1) > 0);
  }

  private getMapTheme(mapId: MapId): {
    border: string;
    centerHole?: {
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    };
    repulsion?: {
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
      core: string;
      ring: string;
      arrow: string;
      glow: string;
    };
    overlay?: { fill: string; stroke: string; hole: string };
  } {
    switch (mapId) {
      case 1:
        return { border: "#ffee00" };
      case 2:
        return {
          border: "#ff5a2b",
          centerHole: {
            ring: "#ff5a2b",
            innerRing: "#ffb36b",
            arrow: "#ff8844",
            glow: "#ff5a2b",
            gradientInner: "rgba(0, 0, 0, 0.95)",
            gradientMid: "rgba(40, 12, 0, 0.9)",
            gradientOuter: "rgba(90, 35, 10, 0.65)",
          },
        };
      case 3:
        return {
          border: "#ff5a2b",
          repulsion: {
            gradientInner: "rgba(255, 90, 40, 0.45)",
            gradientMid: "rgba(255, 140, 60, 0.2)",
            gradientOuter: "rgba(255, 120, 50, 0)",
            core: "rgba(230, 50, 30, 0.65)",
            ring: "#ff5a2b",
            arrow: "rgba(255, 140, 80, 0.75)",
            glow: "#ff5a2b",
          },
        };
      case 4:
        return {
          border: "#00ff88",
          overlay: {
            fill: "#0bb866",
            stroke: "#7cffb8",
            hole: "transparent",
          },
        };
      case 0:
      default:
        return { border: "#00f0ff" };
    }
  }
}
