/**
 * DOWNWELL - Powerup System
 * 
 * Powerups spawn at regular depth intervals (configured in CONFIG). 
 * When collected, time freezes, a title-style text drops in with the 
 * powerup name/description, then rises away and the game continues.
 * 
 * Powerups are stackable and each has a configurable duration.
 * 
 * Types:
 *  - Blast: Every 3rd shot creates an explosion on enemy hit, damaging nearby enemies
 *  - Laser: Shoots a beam straight down (or in shoot direction)
 *  - Satellite: 3 rotating orbs that kill enemies on contact and block projectiles
 *  - Lightning Chain: Every 4th shot chains lightning to nearby enemies in a radius
 */

import { CONFIG } from "./config";

// ============= TYPES =============
export type PowerUpType = "BLAST" | "LASER" | "SATELLITE" | "LIGHTNING";

export interface PowerUpOrb {
  x: number;
  y: number;
  width: number;
  height: number;
  type: PowerUpType;
  collected: boolean;
  depthMilestone: number; // The 500m milestone this orb was spawned for
  glowPhase: number;      // Pre-calculated phase offset for glow animation
}

export interface ActivePowerUp {
  type: PowerUpType;
  remainingFrames: number; // Frames remaining (configurable duration)
  totalFrames: number;     // Total frames for progress tracking
}

// Satellite orbiting entity
export interface SatelliteOrb {
  angle: number;    // Current angle in radians
  radius: number;   // Orbit radius
}

// Blast explosion effect
export interface BlastExplosion {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  frame: number;
}

// Lightning chain effect
export interface LightningChain {
  points: { x: number; y: number }[];
  alpha: number;
  frame: number;
}

// Laser beam effect
export interface LaserBeam {
  x: number;
  startY: number;
  endY: number;
  alpha: number;
  width: number;
  frame: number;
}

// ============= CONSTANTS =============
export const POWERUP_CONSTANTS = {
  ORB_SIZE: 20,                  // Visual size of the powerup orb
  ORB_HITBOX: 28,                // Collection hitbox (slightly larger)
  
  // Blast
  BLAST_EVERY_N_SHOTS: 3,        // Every 3rd shot triggers blast
  BLAST_RADIUS: 80,              // Explosion radius
  BLAST_DAMAGE: 1,               // Damage to nearby enemies
  
  // Laser
  LASER_WIDTH: 8,                // Beam width
  LASER_DAMAGE: 2,               // Damage per frame (kills quickly)
  LASER_DURATION: 15,            // Visual frames the beam persists
  
  // Satellite
  SATELLITE_COUNT: 3,            // Number of orbiting satellites
  SATELLITE_RADIUS: 50,          // Orbit radius
  SATELLITE_SPEED: 0.06,         // Radians per frame
  SATELLITE_ORB_SIZE: 8,         // Size of each satellite orb
  SATELLITE_DAMAGE: 1,           // Damage on contact
  
  // Lightning
  LIGHTNING_EVERY_N_SHOTS: 4,    // Every 4th shot triggers chain
  LIGHTNING_RADIUS: 100,         // Chain radius
  LIGHTNING_MAX_CHAINS: 3,       // Max enemies to chain to
  LIGHTNING_DAMAGE: 1,           // Damage per chain
};

// Powerup display info
export const POWERUP_INFO: Record<PowerUpType, { name: string; description: string; color: string; glowColor: string }> = {
  BLAST: {
    name: "BLAST",
    description: "Every 3rd shot explodes on impact",
    color: "#ff6633",
    glowColor: "rgba(255, 102, 51, 0.6)",
  },
  LASER: {
    name: "LASER",
    description: "Shoots a piercing beam downward",
    color: "#00ffcc",
    glowColor: "rgba(0, 255, 204, 0.6)",
  },
  SATELLITE: {
    name: "SATELLITE",
    description: "3 orbs orbit and destroy enemies",
    color: "#cc88ff",
    glowColor: "rgba(204, 136, 255, 0.6)",
  },
  LIGHTNING: {
    name: "LIGHTNING",
    description: "Every 4th shot chains to enemies",
    color: "#ffee33",
    glowColor: "rgba(255, 238, 51, 0.6)",
  },
};

// ============= POWERUP MANAGER =============
export class PowerUpManager {
  private orbs: PowerUpOrb[] = [];
  private activePowerUps: ActivePowerUp[] = [];
  private satellites: SatelliteOrb[] = [];
  
  // Visual effects
  private blastExplosions: BlastExplosion[] = [];
  private lightningChains: LightningChain[] = [];
  private laserBeams: LaserBeam[] = [];
  
  // Shot counters (for blast every 3rd, lightning every 4th)
  private shotCounter: number = 0;
  
  // Announcement state
  private announcing: boolean = false;
  private announceType: PowerUpType | null = null;
  private announceFrame: number = 0;
  private announceDuration: number = 150; // 2.5 seconds total animation
  
  // Track which milestones have been spawned
  private spawnedMilestones: Set<number> = new Set();
  
  // Available types to cycle through
  private typeIndex: number = 0;
  private typeOrder: PowerUpType[] = ["LASER", "BLAST", "LIGHTNING", "SATELLITE"];
  
  constructor() {
    this.reset();
  }
  
  reset(): void {
    this.orbs = [];
    this.activePowerUps = [];
    this.satellites = [];
    this.blastExplosions = [];
    this.lightningChains = [];
    this.laserBeams = [];
    this.shotCounter = 0;
    this.announcing = false;
    this.announceType = null;
    this.announceFrame = 0;
    this.spawnedMilestones.clear();
    this.typeIndex = 0;
  }
  
  // ============= ORB SPAWNING =============
  
  /** Check if a new powerup orb should be spawned at the given depth */
  checkSpawnOrb(maxDepth: number, playerX: number): void {
    // Calculate the NEXT milestone ahead of the player
    const nextMilestone = (Math.floor(maxDepth / CONFIG.POWERUP_SPAWN_DEPTH_INTERVAL) + 1) * CONFIG.POWERUP_SPAWN_DEPTH_INTERVAL;
    
    if (!this.spawnedMilestones.has(nextMilestone)) {
      this.spawnedMilestones.add(nextMilestone);
      this.spawnOrb(nextMilestone, playerX);
    }
  }
  
  private spawnOrb(depthMilestone: number, playerX: number): void {
    // Pick the next powerup type in cycle
    const type = this.typeOrder[this.typeIndex % this.typeOrder.length];
    this.typeIndex++;
    
    // Spawn at the milestone depth (in world Y coords, depth*10)
    const worldY = depthMilestone * 10;
    
    // Center horizontally in the well, with some variation
    const centerX = CONFIG.INTERNAL_WIDTH / 2;
    const variation = (Math.sin(depthMilestone * 0.1) * 0.5) * (CONFIG.INTERNAL_WIDTH - CONFIG.WALL_WIDTH * 4);
    const orbX = centerX + variation;
    
    const orb: PowerUpOrb = {
      x: orbX,
      y: worldY,
      width: POWERUP_CONSTANTS.ORB_HITBOX,
      height: POWERUP_CONSTANTS.ORB_HITBOX,
      type,
      collected: false,
      depthMilestone,
      glowPhase: depthMilestone * 0.37, // Deterministic phase
    };
    
    this.orbs.push(orb);
    console.log(`[PowerUpManager] Spawned ${type} orb at depth ${depthMilestone}m`);
  }
  
  // ============= COLLECTION =============
  
  /** Check if player collects any orb. Returns the collected orb type or null */
  checkCollection(playerX: number, playerY: number, playerWidth: number, playerHeight: number): PowerUpType | null {
    const px = playerX - playerWidth / 2;
    const py = playerY - playerHeight / 2;
    
    for (const orb of this.orbs) {
      if (orb.collected) continue;
      
      const ox = orb.x - orb.width / 2;
      const oy = orb.y - orb.height / 2;
      
      if (px < ox + orb.width && px + playerWidth > ox &&
          py < oy + orb.height && py + playerHeight > oy) {
        orb.collected = true;
        this.activatePowerUp(orb.type);
        return orb.type;
      }
    }
    return null;
  }
  
  private activatePowerUp(type: PowerUpType): void {
    // Check if this type is already active - if so, refresh its duration (stackable)
    const existing = this.activePowerUps.find(p => p.type === type);
    if (existing) {
      // Stack: add duration on top
      existing.remainingFrames += CONFIG.POWERUP_DURATION_FRAMES;
      existing.totalFrames = existing.remainingFrames;
    } else {
      this.activePowerUps.push({
        type,
        remainingFrames: CONFIG.POWERUP_DURATION_FRAMES,
        totalFrames: CONFIG.POWERUP_DURATION_FRAMES,
      });
    }
    
    // Initialize satellites if this is a satellite powerup
    if (type === "SATELLITE" && this.satellites.length === 0) {
      this.initSatellites();
    }
    
    console.log(`[PowerUpManager] Activated ${type} powerup`);
  }
  
  private initSatellites(): void {
    this.satellites = [];
    for (let i = 0; i < POWERUP_CONSTANTS.SATELLITE_COUNT; i++) {
      this.satellites.push({
        angle: (Math.PI * 2 / POWERUP_CONSTANTS.SATELLITE_COUNT) * i,
        radius: POWERUP_CONSTANTS.SATELLITE_RADIUS,
      });
    }
  }
  
  // ============= UPDATE =============
  
  update(): void {
    // Update active powerup timers
    for (let i = this.activePowerUps.length - 1; i >= 0; i--) {
      this.activePowerUps[i].remainingFrames--;
      if (this.activePowerUps[i].remainingFrames <= 0) {
        const expired = this.activePowerUps[i];
        console.log(`[PowerUpManager] ${expired.type} powerup expired`);
        this.activePowerUps.splice(i, 1);
        
        // Clean up satellites if no more satellite powerups remain
        if (expired.type === "SATELLITE" && !this.hasPowerUp("SATELLITE")) {
          this.satellites = [];
        }
      }
    }
    
    // Update satellite positions
    if (this.hasPowerUp("SATELLITE")) {
      for (const sat of this.satellites) {
        sat.angle += POWERUP_CONSTANTS.SATELLITE_SPEED;
      }
    }
    
    // Update visual effects
    this.updateBlastExplosions();
    this.updateLightningChains();
    this.updateLaserBeams();
    
    // Update announcement
    if (this.announcing) {
      this.announceFrame++;
      if (this.announceFrame >= this.announceDuration) {
        this.announcing = false;
        this.announceType = null;
        this.announceFrame = 0;
      }
    }
    
    // Clean up collected orbs that are far away (3 chunks above camera)
    // This is handled externally via getVisibleOrbs
  }
  
  private updateBlastExplosions(): void {
    for (let i = this.blastExplosions.length - 1; i >= 0; i--) {
      const exp = this.blastExplosions[i];
      exp.frame++;
      exp.radius = exp.maxRadius * (exp.frame / 20); // Expand over 20 frames
      exp.alpha = 1 - exp.frame / 25; // Fade over 25 frames
      
      if (exp.alpha <= 0 || exp.frame > 25) {
        this.blastExplosions.splice(i, 1);
      }
    }
  }
  
  private updateLightningChains(): void {
    for (let i = this.lightningChains.length - 1; i >= 0; i--) {
      const chain = this.lightningChains[i];
      chain.frame++;
      chain.alpha = 1 - chain.frame / 15; // Fade over 15 frames
      
      if (chain.alpha <= 0 || chain.frame > 15) {
        this.lightningChains.splice(i, 1);
      }
    }
  }
  
  private updateLaserBeams(): void {
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      const beam = this.laserBeams[i];
      beam.frame++;
      beam.alpha = 1 - beam.frame / POWERUP_CONSTANTS.LASER_DURATION;
      beam.width = POWERUP_CONSTANTS.LASER_WIDTH * (1 + beam.frame * 0.05); // Slightly expand
      
      if (beam.alpha <= 0 || beam.frame > POWERUP_CONSTANTS.LASER_DURATION) {
        this.laserBeams.splice(i, 1);
      }
    }
  }
  
  // ============= COMBAT INTEGRATION =============
  
  /** Called when player fires a shot. Returns what special effects to trigger */
  onPlayerShoot(): { triggerBlast: boolean; triggerLightning: boolean; triggerLaser: boolean } {
    this.shotCounter++;
    
    const hasBlast = this.hasPowerUp("BLAST");
    const hasLightning = this.hasPowerUp("LIGHTNING");
    const hasLaser = this.hasPowerUp("LASER");
    
    return {
      triggerBlast: hasBlast && (this.shotCounter % POWERUP_CONSTANTS.BLAST_EVERY_N_SHOTS === 0),
      triggerLightning: hasLightning && (this.shotCounter % POWERUP_CONSTANTS.LIGHTNING_EVERY_N_SHOTS === 0),
      triggerLaser: hasLaser,
    };
  }
  
  /** Spawn a blast explosion at position */
  spawnBlastExplosion(x: number, y: number): void {
    this.blastExplosions.push({
      x,
      y,
      radius: 0,
      maxRadius: POWERUP_CONSTANTS.BLAST_RADIUS,
      alpha: 1,
      frame: 0,
    });
  }
  
  /** Spawn a lightning chain effect between points */
  spawnLightningChain(points: { x: number; y: number }[]): void {
    this.lightningChains.push({
      points,
      alpha: 1,
      frame: 0,
    });
  }
  
  /** Spawn a laser beam */
  spawnLaserBeam(x: number, startY: number, endY: number): void {
    this.laserBeams.push({
      x,
      startY,
      endY,
      alpha: 1,
      width: POWERUP_CONSTANTS.LASER_WIDTH,
      frame: 0,
    });
  }
  
  // ============= QUERIES =============
  
  hasPowerUp(type: PowerUpType): boolean {
    return this.activePowerUps.some(p => p.type === type);
  }
  
  getActivePowerUps(): ActivePowerUp[] {
    return this.activePowerUps;
  }
  
  getSatellites(): SatelliteOrb[] {
    return this.satellites;
  }
  
  getBlastExplosions(): BlastExplosion[] {
    return this.blastExplosions;
  }
  
  getLightningChains(): LightningChain[] {
    return this.lightningChains;
  }
  
  getLaserBeams(): LaserBeam[] {
    return this.laserBeams;
  }
  
  getVisibleOrbs(cameraY: number, viewportHeight: number): PowerUpOrb[] {
    const buffer = viewportHeight;
    return this.orbs.filter(orb => 
      !orb.collected && 
      orb.y > cameraY - buffer && 
      orb.y < cameraY + viewportHeight + buffer
    );
  }
  
  // ============= ANNOUNCEMENT STATE =============
  
  startAnnouncement(type: PowerUpType): void {
    this.announcing = true;
    this.announceType = type;
    this.announceFrame = 0;
  }
  
  isAnnouncing(): boolean {
    return this.announcing;
  }
  
  getAnnouncementState(): { type: PowerUpType | null; frame: number; duration: number } {
    return {
      type: this.announceType,
      frame: this.announceFrame,
      duration: this.announceDuration,
    };
  }
  
  // Get satellite world positions given player position
  getSatellitePositions(playerX: number, playerY: number): { x: number; y: number }[] {
    return this.satellites.map(sat => ({
      x: playerX + Math.cos(sat.angle) * sat.radius,
      y: playerY + Math.sin(sat.angle) * sat.radius,
    }));
  }
}
