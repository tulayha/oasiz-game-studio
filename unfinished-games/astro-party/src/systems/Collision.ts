import Matter from "matter-js";
import { Physics } from "./Physics";

export interface CollisionCallbacks {
  onProjectileHitShip: (
    projectileOwnerId: string,
    shipPlayerId: string,
    projectileBody: Matter.Body,
  ) => void;
  onProjectileHitPilot: (
    projectileOwnerId: string,
    pilotPlayerId: string,
    projectileBody: Matter.Body,
    pilotBody: Matter.Body,
  ) => void;
  onShipHitPilot: (
    shipPlayerId: string,
    pilotPlayerId: string,
    pilotBody: Matter.Body,
  ) => void;
  onProjectileHitWall: (projectileBody: Matter.Body) => void;
  onProjectileHitYellowBlock: (
    projectileOwnerId: string,
    yellowBlockBody: Matter.Body,
    projectileBody: Matter.Body,
  ) => void;
  onProjectileHitAsteroid: (
    projectileOwnerId: string,
    asteroidBody: Matter.Body,
    projectileBody: Matter.Body,
  ) => void;
  onShipHitAsteroid: (shipPlayerId: string, asteroidBody: Matter.Body) => void;
  onPilotHitAsteroid: (
    pilotPlayerId: string,
    asteroidBody: Matter.Body,
  ) => void;
  onShipHitPowerUp: (shipPlayerId: string, powerUpBody: Matter.Body) => void;
}

export function setupCollisions(
  physics: Physics,
  callbacks: CollisionCallbacks,
): void {
  physics.onCollision((event) => {
    for (const pair of event.pairs) {
      const bodyA = pair.bodyA;
      const bodyB = pair.bodyB;
      const labelA = bodyA.label;
      const labelB = bodyB.label;

      // Helper to get body by label
      const getBody = (label: string): Matter.Body | null => {
        if (labelA === label) return bodyA;
        if (labelB === label) return bodyB;
        return null;
      };

      const getOtherBody = (label: string): Matter.Body | null => {
        if (labelA === label) return bodyB;
        if (labelB === label) return bodyA;
        return null;
      };

      // Projectile hits Ship
      if (
        (labelA === "projectile" && labelB === "ship") ||
        (labelA === "ship" && labelB === "projectile")
      ) {
        const projectile = getBody("projectile")!;
        const ship = getBody("ship")!;

        const projectileOwnerId = projectile.plugin?.ownerId as string;
        const shipPlayerId = ship.plugin?.playerId as string;

        // Don't hit own ship
        if (
          projectileOwnerId &&
          shipPlayerId &&
          projectileOwnerId !== shipPlayerId
        ) {
          callbacks.onProjectileHitShip(
            projectileOwnerId,
            shipPlayerId,
            projectile,
          );
        }
      }

      // Projectile hits Pilot
      if (
        (labelA === "projectile" && labelB === "pilot") ||
        (labelA === "pilot" && labelB === "projectile")
      ) {
        const projectile = getBody("projectile")!;
        const pilot = getBody("pilot")!;

        const projectileOwnerId = projectile.plugin?.ownerId as string;
        const pilotPlayerId = pilot.plugin?.playerId as string;

        // Can shoot any pilot (including your own for now, could be changed)
        if (projectileOwnerId && pilotPlayerId) {
          callbacks.onProjectileHitPilot(
            projectileOwnerId,
            pilotPlayerId,
            projectile,
            pilot,
          );
        }
      }

      // Ship crushes Pilot
      if (
        (labelA === "ship" && labelB === "pilot") ||
        (labelA === "pilot" && labelB === "ship")
      ) {
        const ship = getBody("ship")!;
        const pilot = getBody("pilot")!;

        const shipPlayerId = ship.plugin?.playerId as string;
        const pilotPlayerId = pilot.plugin?.playerId as string;

        // Can't crush own pilot
        if (shipPlayerId && pilotPlayerId && shipPlayerId !== pilotPlayerId) {
          callbacks.onShipHitPilot(shipPlayerId, pilotPlayerId, pilot);
        }
      }

      // Projectile hits Wall (for cleanup/effects)
      if (
        (labelA === "projectile" && labelB === "wall") ||
        (labelA === "wall" && labelB === "projectile")
      ) {
        const projectile = getBody("projectile")!;
        callbacks.onProjectileHitWall(projectile);
      }

      // Projectile hits Yellow Block
      if (
        (labelA === "projectile" && labelB === "yellowBlock") ||
        (labelA === "yellowBlock" && labelB === "projectile")
      ) {
        const projectile = getBody("projectile")!;
        const yellowBlock = getBody("yellowBlock")!;
        const projectileOwnerId = projectile.plugin?.ownerId as string;
        if (projectileOwnerId) {
          callbacks.onProjectileHitYellowBlock(
            projectileOwnerId,
            yellowBlock,
            projectile,
          );
        }
      }

      // Projectile hits Asteroid
      if (
        (labelA === "projectile" && labelB === "asteroid") ||
        (labelA === "asteroid" && labelB === "projectile")
      ) {
        const projectile = getBody("projectile")!;
        const asteroid = getBody("asteroid")!;
        const projectileOwnerId = projectile.plugin?.ownerId as string;

        if (projectileOwnerId) {
          callbacks.onProjectileHitAsteroid(
            projectileOwnerId,
            asteroid,
            projectile,
          );
        }
      }

      // Ship hits Asteroid
      if (
        (labelA === "ship" && labelB === "asteroid") ||
        (labelA === "asteroid" && labelB === "ship")
      ) {
        const ship = getBody("ship")!;
        const asteroid = getBody("asteroid")!;
        const shipPlayerId = ship.plugin?.playerId as string;

        if (shipPlayerId) {
          callbacks.onShipHitAsteroid(shipPlayerId, asteroid);
        }
      }

      // Pilot hits Asteroid
      if (
        (labelA === "pilot" && labelB === "asteroid") ||
        (labelA === "asteroid" && labelB === "pilot")
      ) {
        const pilot = getBody("pilot")!;
        const asteroid = getBody("asteroid")!;
        const pilotPlayerId = pilot.plugin?.playerId as string;

        if (pilotPlayerId) {
          callbacks.onPilotHitAsteroid(pilotPlayerId, asteroid);
        }
      }

      // Ship hits PowerUp
      if (
        (labelA === "ship" && labelB === "powerup") ||
        (labelA === "powerup" && labelB === "ship")
      ) {
        const ship = getBody("ship")!;
        const powerUp = getBody("powerup")!;
        const shipPlayerId = ship.plugin?.playerId as string;

        if (shipPlayerId) {
          callbacks.onShipHitPowerUp(shipPlayerId, powerUp);
        }
      }
    }
  });
}
