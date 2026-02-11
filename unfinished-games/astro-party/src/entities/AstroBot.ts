// ============= ASTRO BOT =============
// AI-controlled player using PlayroomKit's Bot API

import { Bot } from "playroomkit";
import { PlayerInput, GAME_CONFIG } from "../types";
import { SeededRNG } from "../systems/SeededRNG";

// Data provided to bot for decision making
export interface BotVisibleData {
  myShip: {
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    alive: boolean;
  } | null;
  myPilot: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    alive: boolean;
  } | null;
  enemyShips: Array<{
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    playerId: string;
  }>;
  enemyPilots: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    playerId: string;
  }>;
  projectiles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    ownerId: string;
  }>;
  arenaWidth: number;
  arenaHeight: number;
}

// Bot's output action
export interface BotAction {
  buttonA: boolean; // Rotate
  buttonB: boolean; // Fire
  dash: boolean; // Trigger dash
}

// Configuration for bot behavior
interface BotParams {
  botType?: "ai" | "local";
  keySlot?: number; // For local human bots
}

// AI tuning constants - EASY MODE
const AI_CONFIG = {
  // Targeting
  AIM_TOLERANCE: 0.6, // radians (~35 degrees) - much wider firing angle for easy mode
  LEAD_FACTOR: 0.05, // Reduced leading for less accuracy

  // Avoidance
  DANGER_RADIUS: 100, // Reduced detection range
  DANGER_TIME: 0.3, // Shorter prediction time
  WALL_MARGIN: 60, // React closer to walls

  // Behavior timing
  FIRE_PROBABILITY: 0.4, // Only 40% chance to fire when aimed (much less aggressive)
  REACTION_DELAY: 250, // Slower reaction time

  // Easy mode randomness
  AIM_ERROR: 0.3, // Add random error to aim
  ROTATION_OVERSHOOT: 0.2, // Chance to overshoot rotation
} as const;

export class AstroBot extends Bot {
  private static rng: SeededRNG | null = null;
  private static fallbackRng = new SeededRNG(Date.now() >>> 0);

  static setRng(rng: SeededRNG): void {
    AstroBot.rng = rng;
  }

  private botType: "ai" | "local";
  private keySlot: number;
  private lastDecisionTime = 0;
  private cachedAction: BotAction = {
    buttonA: false,
    buttonB: false,
    dash: false,
  };

  constructor(botParams?: BotParams) {
    super(botParams || {});
    this.botType = botParams?.botType || "ai";
    this.keySlot = botParams?.keySlot ?? -1;
  }

  getBotType(): "ai" | "local" {
    return this.botType;
  }

  getKeySlot(): number {
    return this.keySlot;
  }

  // Main AI decision function - called by Game.ts on host
  decideAction(data: BotVisibleData): BotAction {
    // Add reaction delay for more human-like behavior
    const now = performance.now();
    if (now - this.lastDecisionTime < AI_CONFIG.REACTION_DELAY) {
      return this.cachedAction;
    }
    this.lastDecisionTime = now;

    // If we don't have a ship, no actions
    if (!data.myShip || !data.myShip.alive) {
      this.cachedAction = { buttonA: false, buttonB: false, dash: false };
      return this.cachedAction;
    }

    const ship = data.myShip;
    let shouldRotate = false;
    let shouldFire = false;
    let shouldDash = false;

    // 1. Check for incoming danger (projectiles)
    const danger = this.detectDanger(ship, data.projectiles);
    if (danger.inDanger && this.random() < 0.5) {
      // Only dash 50% of the time when in danger (easy mode)
      shouldDash = true;
      // Rotate away from danger
      shouldRotate = this.shouldRotateAwayFromDanger(ship, danger.dangerAngle);
    }

    // 2. Check for wall proximity
    const wallDanger = this.detectWallDanger(
      ship,
      data.arenaWidth,
      data.arenaHeight,
    );
    if (wallDanger.nearWall && !shouldDash) {
      // Rotate away from wall
      shouldRotate = this.shouldRotateAwayFromWall(ship, wallDanger.wallAngle);
    }

    // 3. Find and target nearest enemy
    const target = this.findNearestTarget(
      ship,
      data.enemyShips,
      data.enemyPilots,
    );
    if (target && !danger.inDanger && !wallDanger.nearWall) {
      const aimResult = this.calculateAim(ship, target);
      shouldRotate = aimResult.shouldRotate;

      // Add random rotation errors for easy mode
      if (this.random() < AI_CONFIG.ROTATION_OVERSHOOT) {
        shouldRotate = !shouldRotate; // Sometimes rotate wrong way
      }

      // Fire if aimed at target (with lower probability for easy mode)
      if (aimResult.isAimed && this.random() < AI_CONFIG.FIRE_PROBABILITY) {
        shouldFire = true;
      }

      // Sometimes fire randomly even when not aimed (spray and pray)
      if (!aimResult.isAimed && this.random() < 0.05) {
        shouldFire = true;
      }
    }

    this.cachedAction = {
      buttonA: shouldRotate,
      buttonB: shouldFire,
      dash: shouldDash,
    };

    return this.cachedAction;
  }

  private detectDanger(
    ship: BotVisibleData["myShip"],
    projectiles: BotVisibleData["projectiles"],
  ): { inDanger: boolean; dangerAngle: number } {
    if (!ship) return { inDanger: false, dangerAngle: 0 };

    for (const proj of projectiles) {
      // Predict where projectile will be
      const futureX = proj.x + proj.vx * AI_CONFIG.DANGER_TIME * 60; // 60 fps approx
      const futureY = proj.y + proj.vy * AI_CONFIG.DANGER_TIME * 60;

      // Check if projectile is heading toward us
      const toShipX = ship.x - proj.x;
      const toShipY = ship.y - proj.y;
      const projDir = Math.atan2(proj.vy, proj.vx);
      const toShipDir = Math.atan2(toShipY, toShipX);

      // Is projectile moving toward us?
      const angleDiff = Math.abs(this.normalizeAngle(projDir - toShipDir));
      if (angleDiff > Math.PI / 2) continue; // Moving away

      // Distance check
      const dist = Math.sqrt(toShipX * toShipX + toShipY * toShipY);
      if (dist < AI_CONFIG.DANGER_RADIUS) {
        // Will it hit us?
        const futureDist = Math.sqrt(
          (futureX - ship.x) ** 2 + (futureY - ship.y) ** 2,
        );
        if (futureDist < AI_CONFIG.DANGER_RADIUS) {
          return { inDanger: true, dangerAngle: projDir };
        }
      }
    }

    return { inDanger: false, dangerAngle: 0 };
  }

  private detectWallDanger(
    ship: BotVisibleData["myShip"],
    arenaWidth: number,
    arenaHeight: number,
  ): { nearWall: boolean; wallAngle: number } {
    if (!ship) return { nearWall: false, wallAngle: 0 };

    const margin = AI_CONFIG.WALL_MARGIN;
    let nearWall = false;
    let wallAngle = 0;

    // Check each wall
    if (ship.x < margin) {
      nearWall = true;
      wallAngle = Math.PI; // Wall is to the left
    } else if (ship.x > arenaWidth - margin) {
      nearWall = true;
      wallAngle = 0; // Wall is to the right
    }

    if (ship.y < margin) {
      nearWall = true;
      wallAngle = -Math.PI / 2; // Wall is above
    } else if (ship.y > arenaHeight - margin) {
      nearWall = true;
      wallAngle = Math.PI / 2; // Wall is below
    }

    return { nearWall, wallAngle };
  }

  private findNearestTarget(
    ship: BotVisibleData["myShip"],
    enemyShips: BotVisibleData["enemyShips"],
    enemyPilots: BotVisibleData["enemyPilots"],
  ): { x: number; y: number; vx: number; vy: number } | null {
    if (!ship) return null;

    let nearest: { x: number; y: number; vx: number; vy: number } | null = null;
    let nearestDist = Infinity;

    // Check enemy ships
    for (const enemy of enemyShips) {
      const dist = Math.sqrt((enemy.x - ship.x) ** 2 + (enemy.y - ship.y) ** 2);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy };
      }
    }

    // Check enemy pilots (higher priority if closer)
    for (const pilot of enemyPilots) {
      const dist = Math.sqrt((pilot.x - ship.x) ** 2 + (pilot.y - ship.y) ** 2);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { x: pilot.x, y: pilot.y, vx: pilot.vx, vy: pilot.vy };
      }
    }

    return nearest;
  }

  private calculateAim(
    ship: BotVisibleData["myShip"],
    target: { x: number; y: number; vx: number; vy: number },
  ): { shouldRotate: boolean; isAimed: boolean } {
    if (!ship) return { shouldRotate: false, isAimed: false };

    // Lead the target based on their velocity (reduced for easy mode)
    const leadX = target.x + target.vx * AI_CONFIG.LEAD_FACTOR * 60;
    const leadY = target.y + target.vy * AI_CONFIG.LEAD_FACTOR * 60;

    // Calculate desired angle to target
    const dx = leadX - ship.x;
    const dy = leadY - ship.y;
    let targetAngle = Math.atan2(dy, dx);

    // Add random aim error for easy mode
    targetAngle += (this.random() - 0.5) * AI_CONFIG.AIM_ERROR * 2;

    // Calculate angle difference
    const angleDiff = this.normalizeAngle(targetAngle - ship.angle);

    // Are we aimed at the target?
    const isAimed = Math.abs(angleDiff) < AI_CONFIG.AIM_TOLERANCE;

    // Should we rotate? (rotate clockwise by holding A)
    // Ship rotates clockwise when buttonA is held
    // We want to rotate if the target is in our rotation direction
    const shouldRotate = !isAimed;

    return { shouldRotate, isAimed };
  }

  private shouldRotateAwayFromDanger(
    ship: BotVisibleData["myShip"],
    dangerAngle: number,
  ): boolean {
    if (!ship) return false;
    // Rotate to face perpendicular to danger
    const escapeAngle = dangerAngle + Math.PI / 2;
    const angleDiff = this.normalizeAngle(escapeAngle - ship.angle);
    return angleDiff > 0;
  }

  private shouldRotateAwayFromWall(
    ship: BotVisibleData["myShip"],
    wallAngle: number,
  ): boolean {
    if (!ship) return false;
    // Face away from wall
    const awayAngle = wallAngle + Math.PI;
    const angleDiff = this.normalizeAngle(awayAngle - ship.angle);
    return angleDiff > 0;
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  private random(): number {
    const rng = AstroBot.rng ?? AstroBot.fallbackRng;
    return rng.next();
  }
}
