import { GAME_CONFIG, Particle } from "../../types";
import { getEntityAsset } from "../../../shared/geometry/EntityAssets";
import { EntitySpriteStore } from "./EntitySpriteStore";

interface BulletCasing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  angle: number;
  angularVelocity: number;
  shimmerOffset: number;
}

type PilotDebrisKind = "visor" | "shellLeft" | "shellRight" | "core";
type PilotDebrisAssetId =
  | "pilot_death_debris_visor"
  | "pilot_death_debris_shell_left"
  | "pilot_death_debris_shell_right"
  | "pilot_death_debris_core";

interface PilotDebrisPiece {
  kind: PilotDebrisKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  radius: number;
  mass: number;
  life: number;
  maxLife: number;
  persistent: boolean;
  primaryColor: string;
  secondaryColor: string;
  outlineColor: string;
}

interface PilotDeathBurstFx {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  color: string;
}

export class RenderEffectsSystem {
  private static readonly PILOT_DEBRIS_BASELINE_PILOT_WIDTH = 52;
  private static readonly PILOT_DEBRIS_SCALE_MULTIPLIER = 1;
  private static readonly PILOT_DEBRIS_PERSISTENT_LIFE = 1;
  private static readonly MAX_BULLET_CASINGS = 96;
  private static readonly MAX_PILOT_DEBRIS_PIECES = 36;
  private static readonly MAX_PILOT_DEATH_BURSTS = 10;
  private particles: Particle[] = [];
  private bulletCasings: BulletCasing[] = [];
  private pilotDebrisPieces: PilotDebrisPiece[] = [];
  private pilotDeathBursts: PilotDeathBurstFx[] = [];

  constructor(
    private ctx: CanvasRenderingContext2D,
    private entitySprites: EntitySpriteStore,
    private random: () => number,
    private getNowMs: () => number,
  ) {}

  clear(): void {
    this.particles = [];
    this.bulletCasings = [];
    this.pilotDebrisPieces = [];
    this.pilotDeathBursts = [];
  }

  spawnParticle(
    x: number,
    y: number,
    color: string,
    type: "explosion" | "thrust" | "hit",
  ): void {
    const angle = this.random() * Math.PI * 2;
    let speed: number;
    let life: number;
    let size: number;

    switch (type) {
      case "explosion":
        speed = 80 + this.random() * 120;
        life = 0.3 + this.random() * 0.3;
        size = 3 + this.random() * 5;
        break;
      case "thrust":
        speed = 20 + this.random() * 40;
        life = 0.1 + this.random() * 0.2;
        size = 2 + this.random() * 3;
        break;
      case "hit":
        speed = 40 + this.random() * 60;
        life = 0.2 + this.random() * 0.2;
        size = 2 + this.random() * 3;
        break;
    }

    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size,
      color,
    });
  }

  spawnExplosion(x: number, y: number, color: string): void {
    for (let i = 0; i < 20; i++) {
      this.spawnParticle(x, y, color, "explosion");
    }
    for (let i = 0; i < 10; i++) {
      this.spawnParticle(x, y, "#ffffff", "explosion");
    }
  }

  spawnShipDestroyedBurst(x: number, y: number, color: string): void {
    const hullColor = color || "#6ed6ff";

    const flashCount = 18;
    for (let i = 0; i < flashCount; i++) {
      const angle = (i / flashCount) * Math.PI * 2 + this.random() * 0.28;
      const speed = 95 + this.random() * 105;
      const life = 0.16 + this.random() * 0.1;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 3.4 + this.random() * 3.6,
        color: this.random() > 0.45 ? "#fff4d8" : "#ffc47a",
      });
    }

    const blastRingCount = 24;
    for (let i = 0; i < blastRingCount; i++) {
      const angle = (i / blastRingCount) * Math.PI * 2 + this.random() * 0.24;
      const spawnRadius = 11 + this.random() * 6;
      const speed = 40 + this.random() * 55;
      const life = 0.24 + this.random() * 0.16;
      this.particles.push({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + Math.sin(angle) * spawnRadius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2.6 + this.random() * 3.4,
        color: this.random() > 0.4 ? "#ff7c3c" : "#ffb55f",
      });
    }

    const plasmaShardCount = 12;
    for (let i = 0; i < plasmaShardCount; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 75 + this.random() * 95;
      const life = 0.32 + this.random() * 0.2;
      this.particles.push({
        x: x + (this.random() - 0.5) * 9,
        y: y + (this.random() - 0.5) * 9,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + this.random() * 2.6,
        color: this.random() > 0.3 ? hullColor : "#d8f4ff",
      });
    }

    this.spawnShipDebris(x, y, hullColor);
  }

  spawnNitroParticle(x: number, y: number, color: string): void {
    // Larger, faster particles for nitro boost effect
    const angle = this.random() * Math.PI * 2;
    const speed = 100 + this.random() * 80;
    const life = 0.2 + this.random() * 0.15;
    const size = 4 + this.random() * 4;

    this.particles.push({
      x: x + (this.random() - 0.5) * 8,
      y: y + (this.random() - 0.5) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size,
      color,
    });
  }

  spawnDashParticles(
    x: number,
    y: number,
    shipAngle: number,
    color: string,
    count: number = 12,
  ): void {
    // Spray particles behind the ship during dash
    // Ship angle is where the ship is pointing - particles should spray from the back
    const backAngle = shipAngle + Math.PI; // Opposite direction of ship
    const spreadAngle = Math.PI / 3; // 60 degree spread

    for (let i = 0; i < count; i++) {
      // Random angle within spread behind the ship
      const particleAngle = backAngle + (this.random() - 0.5) * spreadAngle;
      const speed = 150 + this.random() * 100; // Fast spray
      const life = 0.15 + this.random() * 0.15; // Short life
      const size = 3 + this.random() * 3;

      // Spawn slightly behind the ship
      const spawnDistance = 10;
      const spawnX = x + Math.cos(backAngle) * spawnDistance;
      const spawnY = y + Math.sin(backAngle) * spawnDistance;

      this.particles.push({
        x: spawnX + (this.random() - 0.5) * 6,
        y: spawnY + (this.random() - 0.5) * 6,
        vx: Math.cos(particleAngle) * speed,
        vy: Math.sin(particleAngle) * speed,
        life,
        maxLife: life,
        size,
        color: color || "#44aaff", // Default blue if no color provided
      });
    }

    // Add some white/bright core particles
    for (let i = 0; i < 5; i++) {
      const particleAngle =
        backAngle + (this.random() - 0.5) * (spreadAngle * 0.5);
      const speed = 200 + this.random() * 100;
      const life = 0.1 + this.random() * 0.1;
      const size = 2 + this.random() * 2;

      const spawnDistance = 8;
      const spawnX = x + Math.cos(backAngle) * spawnDistance;
      const spawnY = y + Math.sin(backAngle) * spawnDistance;

      this.particles.push({
        x: spawnX,
        y: spawnY,
        vx: Math.cos(particleAngle) * speed,
        vy: Math.sin(particleAngle) * speed,
        life,
        maxLife: life,
        size,
        color: "#ffffff",
      });
    }
  }

  spawnPilotDashBurstParticles(
    x: number,
    y: number,
    pilotAngle: number,
    color: string,
  ): void {
    const burstColor = color || "#c8ecff";
    const burstCount = 16;
    for (let i = 0; i < burstCount; i++) {
      const ringAngle = (i / burstCount) * Math.PI * 2;
      const spawnRadius = 2 + this.random() * 2.2;
      const speed = 70 + this.random() * 70;
      const life = 0.08 + this.random() * 0.08;
      const size = 1.2 + this.random() * 2.0;
      const isCore = i % 4 === 0;

      this.particles.push({
        x: x + Math.cos(ringAngle) * spawnRadius,
        y: y + Math.sin(ringAngle) * spawnRadius,
        vx: Math.cos(ringAngle) * speed,
        vy: Math.sin(ringAngle) * speed,
        life,
        maxLife: life,
        size,
        color: isCore ? "#ffffff" : burstColor,
      });
    }

    const releaseAngle = pilotAngle + Math.PI;
    const releaseSpread = Math.PI * 0.85;
    for (let i = 0; i < 7; i++) {
      const angle = releaseAngle + (this.random() - 0.5) * releaseSpread;
      const speed = 55 + this.random() * 45;
      const life = 0.11 + this.random() * 0.09;
      const size = 1.6 + this.random() * 1.8;

      this.particles.push({
        x: x + (this.random() - 0.5) * 3,
        y: y + (this.random() - 0.5) * 3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size,
        color: "#d8f4ff",
      });
    }
  }

  spawnBulletCasing(
    x: number,
    y: number,
    shotAngle: number,
    inheritedVx: number = 0,
    inheritedVy: number = 0,
  ): void {
    const ejectionAngle =
      shotAngle + Math.PI / 2 + (this.random() - 0.5) * 0.5;
    const ejectionSpeed = 28 + this.random() * 34;
    const casingScale = 1.5;

    this.bulletCasings.push({
      x,
      y,
      vx: Math.cos(ejectionAngle) * ejectionSpeed + inheritedVx * 0.08,
      vy: Math.sin(ejectionAngle) * ejectionSpeed + inheritedVy * 0.08,
      width: (4.6 + this.random() * 1.6) * casingScale,
      height: (2 + this.random() * 0.8) * casingScale,
      angle: this.random() * Math.PI * 2,
      angularVelocity: (this.random() - 0.5) * 7,
      shimmerOffset: this.random() * Math.PI * 2,
    });

    while (this.bulletCasings.length > RenderEffectsSystem.MAX_BULLET_CASINGS) {
      this.bulletCasings.shift();
    }
  }

  spawnAsteroidDebris(x: number, y: number, size: number, color: string): void {
    // Spawn debris pieces - purely visual, no collision
    const pieceCount = 4 + Math.floor(this.random() * 4); // 4-7 pieces
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 30 + this.random() * 50;
      const life = 0.5 + this.random() * 0.5;
      const pieceSize = size * 0.2 + this.random() * (size * 0.3);

      this.particles.push({
        x: x + Math.cos(angle) * size * 0.3,
        y: y + Math.sin(angle) * size * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: pieceSize,
        color,
      });
    }

    // Add some dust/smaller particles
    for (let i = 0; i < 8; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 20 + this.random() * 40;
      const life = 0.3 + this.random() * 0.4;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + this.random() * 3,
        color: "#888888",
      });
    }
  }

  spawnShipDebris(x: number, y: number, color: string): void {
    // Spawn ship debris pieces - larger and more dramatic than asteroid debris
    const pieceCount = 8 + Math.floor(this.random() * 4); // 8-11 pieces

    // Ship body pieces (colored)
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 50 + this.random() * 80;
      const life = 0.8 + this.random() * 0.6; // Longer lasting
      const pieceSize = 4 + this.random() * 6;

      this.particles.push({
        x: x + Math.cos(angle) * 10,
        y: y + Math.sin(angle) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: pieceSize,
        color,
      });
    }

    // Metal/wreckage pieces (grey/silver)
    for (let i = 0; i < 6; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 40 + this.random() * 60;
      const life = 0.6 + this.random() * 0.5;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 3 + this.random() * 4,
        color: "#aaaaaa",
      });
    }

    // Spark particles
    for (let i = 0; i < 15; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 60 + this.random() * 100;
      const life = 0.3 + this.random() * 0.3;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.5 + this.random() * 2,
        color: "#ffdd00",
      });
    }
  }

  spawnPilotKillBurst(x: number, y: number, color: string): void {
    const burstColor = color || "#00f0ff";
    this.spawnPilotDeathBurst(x, y, burstColor);

    const haloCount = 12;
    for (let i = 0; i < haloCount; i++) {
      const angle = (i / haloCount) * Math.PI * 2 + this.random() * 0.18;
      const spawnRadius = 5.5 + this.random() * 2.5;
      const speed = 25 + this.random() * 35;
      const life = 0.11 + this.random() * 0.08;
      this.particles.push({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + Math.sin(angle) * spawnRadius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.2 + this.random() * 1.4,
        color: this.random() > 0.35 ? "#ffffff" : "#c8f4ff",
      });
    }

    const ventCount = 8;
    for (let i = 0; i < ventCount; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 42 + this.random() * 34;
      const life = 0.12 + this.random() * 0.1;
      this.particles.push({
        x: x + (this.random() - 0.5) * 4,
        y: y + (this.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1 + this.random() * 1.1,
        color: this.random() > 0.55 ? burstColor : "#dff8ff",
      });
    }
  }

  spawnPilotDeathBurst(x: number, y: number, color: string): void {
    const burstColor = color || "#00f0ff";
    this.pilotDeathBursts.push({
      x,
      y,
      angle: this.random() * Math.PI * 2,
      life: 0.36,
      maxLife: 0.36,
      color: burstColor,
    });
    while (this.pilotDeathBursts.length > RenderEffectsSystem.MAX_PILOT_DEATH_BURSTS) {
      this.pilotDeathBursts.shift();
    }

    const implosionCount = 14;
    for (let i = 0; i < implosionCount; i++) {
      const angle = (i / implosionCount) * Math.PI * 2 + this.random() * 0.2;
      const spawnRadius = 12 + this.random() * 4;
      const speed = 70 + this.random() * 40;
      const life = 0.09 + this.random() * 0.08;
      this.particles.push({
        x: x + Math.cos(angle) * spawnRadius,
        y: y + Math.sin(angle) * spawnRadius,
        vx: -Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.5 + this.random() * 1.5,
        color: this.random() > 0.5 ? "#ffffff" : burstColor,
      });
    }

    const explosionCount = 20;
    for (let i = 0; i < explosionCount; i++) {
      const angle = (i / explosionCount) * Math.PI * 2 + this.random() * 0.3;
      const speed = 30 + this.random() * 55;
      const life = 0.16 + this.random() * 0.14;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.8 + this.random() * 2.2,
        color: this.random() > 0.35 ? burstColor : "#dff8ff",
      });
    }

    this.spawnPilotDeathDebrisPieces(x, y, burstColor);
  }

  private spawnPilotDeathDebrisPieces(
    x: number,
    y: number,
    primaryColor: string,
  ): void {
    const pilotScale = this.getPilotDebrisScaleFactor();
    const templates: ReadonlyArray<{
      kind: PilotDebrisKind;
      offsetX: number;
      offsetY: number;
      radius: number;
      speedMin: number;
      speedMax: number;
      angleJitter: number;
      secondaryColor: string;
      outlineColor: string;
    }> = [
      {
        kind: "visor",
        offsetX: 10.6,
        offsetY: -7.8,
        radius: 4.1,
        speedMin: 16,
        speedMax: 28,
        angleJitter: 0.45,
        secondaryColor: "#0b1120",
        outlineColor: "#e8f5ff",
      },
      {
        kind: "shellLeft",
        offsetX: -8.1,
        offsetY: 0,
        radius: 5.8,
        speedMin: 14,
        speedMax: 24,
        angleJitter: 0.4,
        secondaryColor: "#141d2a",
        outlineColor: "#cfe8ff",
      },
      {
        kind: "shellRight",
        offsetX: 5.8,
        offsetY: 0.2,
        radius: 5.4,
        speedMin: 14,
        speedMax: 24,
        angleJitter: 0.4,
        secondaryColor: "#162233",
        outlineColor: "#cfe8ff",
      },
      {
        kind: "core",
        offsetX: -0.4,
        offsetY: 0,
        radius: 2.9,
        speedMin: 10,
        speedMax: 18,
        angleJitter: 0.9,
        secondaryColor: "#05131d",
        outlineColor: "#e9fcff",
      },
    ];

    for (const template of templates) {
      const baseAngle = Math.atan2(template.offsetY, template.offsetX);
      const launchAngle =
        baseAngle + (this.random() - 0.5) * template.angleJitter;
      const speed =
        template.speedMin * pilotScale +
        this.random() * (template.speedMax - template.speedMin) * pilotScale;
      const radiusJitter =
        template.radius * pilotScale * (0.92 + this.random() * 0.18);
      const mass = Math.max(0.7, radiusJitter * radiusJitter * 0.06);

      this.pilotDebrisPieces.push({
        kind: template.kind,
        x:
          x +
          template.offsetX * pilotScale +
          (this.random() - 0.5) * 1.1 * pilotScale,
        y:
          y +
          template.offsetY * pilotScale +
          (this.random() - 0.5) * 1.1 * pilotScale,
        vx: Math.cos(launchAngle) * speed,
        vy: Math.sin(launchAngle) * speed,
        angle: this.random() * Math.PI * 2,
        angularVelocity: (this.random() - 0.5) * 3.2,
        radius: radiusJitter,
        mass,
        life: RenderEffectsSystem.PILOT_DEBRIS_PERSISTENT_LIFE,
        maxLife: RenderEffectsSystem.PILOT_DEBRIS_PERSISTENT_LIFE,
        persistent: true,
        primaryColor: primaryColor,
        secondaryColor: template.secondaryColor,
        outlineColor: template.outlineColor,
      });
    }

    while (this.pilotDebrisPieces.length > RenderEffectsSystem.MAX_PILOT_DEBRIS_PIECES) {
      this.pilotDebrisPieces.shift();
    }
  }

  drawPilotDeathDebris(): void {
    if (this.pilotDeathBursts.length <= 0 && this.pilotDebrisPieces.length <= 0) {
      return;
    }
    const { ctx } = this;
    for (const burst of this.pilotDeathBursts) {
      const phase = 1 - burst.life / burst.maxLife;
      const implodeT = phase < 0.34 ? 1 - phase / 0.34 : 0;
      const ringRadius = 5 + phase * 16;
      ctx.save();
      ctx.translate(burst.x, burst.y);
      ctx.rotate(burst.angle + phase * 5.8);

      ctx.globalAlpha = Math.max(0, 0.76 * (1 - phase));
      ctx.fillStyle = burst.color;
      ctx.beginPath();
      ctx.arc(0, 0, 2.8 + implodeT * 4.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = Math.max(0, 0.54 * (1 - phase));
      ctx.strokeStyle = "#dff8ff";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = Math.max(0, 0.45 * (1 - phase));
      ctx.strokeStyle = burst.color;
      for (let i = 0; i < 6; i++) {
        const rayAngle = (i / 6) * Math.PI * 2;
        const rayInner = ringRadius * 0.35;
        const rayOuter = ringRadius * 0.78;
        ctx.beginPath();
        ctx.moveTo(Math.cos(rayAngle) * rayInner, Math.sin(rayAngle) * rayInner);
        ctx.lineTo(Math.cos(rayAngle) * rayOuter, Math.sin(rayAngle) * rayOuter);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const piece of this.pilotDebrisPieces) {
      const alpha = Math.max(0, Math.min(1, piece.life / piece.maxLife));
      this.drawPilotDebrisPiece(piece, alpha);
    }
    ctx.globalAlpha = 1;
  }

  private getPilotDebrisAssetId(kind: PilotDebrisKind): PilotDebrisAssetId {
    switch (kind) {
      case "visor":
        return "pilot_death_debris_visor";
      case "shellLeft":
        return "pilot_death_debris_shell_left";
      case "shellRight":
        return "pilot_death_debris_shell_right";
      case "core":
        return "pilot_death_debris_core";
    }
  }

  private getPilotDebrisBaseRadius(kind: PilotDebrisKind): number {
    const pilotScale = this.getPilotDebrisScaleFactor();
    switch (kind) {
      case "visor":
        return 4.1 * pilotScale;
      case "shellLeft":
        return 5.8 * pilotScale;
      case "shellRight":
        return 5.4 * pilotScale;
      case "core":
        return 2.9 * pilotScale;
    }
  }

  getPilotDebrisScaleFactor(): number {
    const pilotRenderWidth = getEntityAsset("pilot").renderSize.width;
    return (
      (pilotRenderWidth / RenderEffectsSystem.PILOT_DEBRIS_BASELINE_PILOT_WIDTH) *
      RenderEffectsSystem.PILOT_DEBRIS_SCALE_MULTIPLIER
    );
  }

  private drawPilotDebrisPiece(piece: PilotDebrisPiece, alpha: number): void {
    if (alpha <= 0) return;
    const { ctx } = this;

    const spriteAssetId = this.getPilotDebrisAssetId(piece.kind);
    const baseRadius = this.getPilotDebrisBaseRadius(piece.kind);
    const spriteScale = Math.max(0.45, piece.radius / baseRadius);

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.scale(spriteScale, spriteScale);
    ctx.globalAlpha = alpha;
    const drewSprite = this.entitySprites.drawEntity(ctx, spriteAssetId, {
      "slot-primary": piece.primaryColor,
      "slot-secondary": piece.secondaryColor,
      "slot-stroke": piece.outlineColor,
    });
    ctx.restore();
    if (drewSprite) {
      return;
    }

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.globalAlpha = alpha;

    if (piece.kind === "visor") {
      const r = piece.radius;
      ctx.fillStyle = piece.secondaryColor;
      ctx.strokeStyle = piece.outlineColor;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = piece.primaryColor;
      ctx.globalAlpha = alpha * 0.34;
      ctx.beginPath();
      ctx.ellipse(0.4 * r, -0.05 * r, r * 0.72, r * 0.46, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;

      ctx.fillStyle = "#eaf9ff";
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(r * 0.38, -r * 0.4, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.restore();
      return;
    }

    if (piece.kind === "core") {
      const r = piece.radius;
      ctx.fillStyle = piece.primaryColor;
      ctx.strokeStyle = piece.outlineColor;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.95, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }

    const s = piece.radius / 5.8;
    ctx.scale(s, s);
    ctx.fillStyle = piece.primaryColor;
    ctx.strokeStyle = piece.outlineColor;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    if (piece.kind === "shellLeft") {
      ctx.moveTo(-6.8, -4.3);
      ctx.lineTo(-1.8, -5.5);
      ctx.lineTo(0.5, -1.2);
      ctx.lineTo(0.5, 1.2);
      ctx.lineTo(-1.7, 5.4);
      ctx.lineTo(-6.1, 4.5);
      ctx.lineTo(-7.3, 0.2);
    } else {
      ctx.moveTo(-1.4, -5.5);
      ctx.lineTo(2.8, -5.4);
      ctx.lineTo(5.1, -3.7);
      ctx.lineTo(6.5, -1.1);
      ctx.lineTo(6.5, 1.1);
      ctx.lineTo(5.1, 3.7);
      ctx.lineTo(2.8, 5.4);
      ctx.lineTo(-1.4, 5.5);
      ctx.lineTo(-2.4, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = piece.secondaryColor;
    ctx.globalAlpha = alpha * 0.34;
    ctx.beginPath();
    if (piece.kind === "shellLeft") {
      ctx.moveTo(-5.4, -2.8);
      ctx.lineTo(-2.0, -3.4);
      ctx.lineTo(-0.8, -0.8);
      ctx.lineTo(-0.8, 0.8);
      ctx.lineTo(-2.1, 3.3);
      ctx.lineTo(-5.2, 2.6);
    } else {
      ctx.moveTo(-0.3, -3.8);
      ctx.lineTo(2.6, -3.6);
      ctx.lineTo(4.3, -2.3);
      ctx.lineTo(5.2, -0.9);
      ctx.lineTo(5.2, 0.9);
      ctx.lineTo(4.2, 2.4);
      ctx.lineTo(2.6, 3.6);
      ctx.lineTo(-0.2, 3.8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.restore();
  }

  private updatePilotDeathDebris(dt: number): void {
    const linearDrag = Math.max(0, 1 - dt * 5.8);
    const angularDrag = Math.max(0, 1 - dt * 7.2);

    for (let i = this.pilotDeathBursts.length - 1; i >= 0; i--) {
      const burst = this.pilotDeathBursts[i];
      burst.life -= dt;
      if (burst.life <= 0) {
        this.pilotDeathBursts.splice(i, 1);
      }
    }

    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const piece = this.pilotDebrisPieces[i];
      piece.vx *= linearDrag;
      piece.vy *= linearDrag;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.angle += piece.angularVelocity * dt;
      piece.angularVelocity *= angularDrag;

      const minX = piece.radius;
      const maxX = GAME_CONFIG.ARENA_WIDTH - piece.radius;
      if (piece.x < minX) {
        piece.x = minX;
        piece.vx = Math.abs(piece.vx) * 0.38;
      } else if (piece.x > maxX) {
        piece.x = maxX;
        piece.vx = -Math.abs(piece.vx) * 0.38;
      }

      const minY = piece.radius;
      const maxY = GAME_CONFIG.ARENA_HEIGHT - piece.radius;
      if (piece.y < minY) {
        piece.y = minY;
        piece.vy = Math.abs(piece.vy) * 0.38;
      } else if (piece.y > maxY) {
        piece.y = maxY;
        piece.vy = -Math.abs(piece.vy) * 0.38;
      }

      if (!piece.persistent) {
        piece.life -= dt;
        const speedSq = piece.vx * piece.vx + piece.vy * piece.vy;
        if (speedSq < 16 && piece.life < piece.maxLife * 0.45) {
          piece.life -= dt * 1.35;
        }
      }
    }

    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const a = this.pilotDebrisPieces[i];
      for (let j = i + 1; j < this.pilotDebrisPieces.length; j++) {
        const b = this.pilotDebrisPieces[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(Math.max(1e-6, distSq));
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const separateA = overlap * (b.mass / (a.mass + b.mass));
        const separateB = overlap * (a.mass / (a.mass + b.mass));
        a.x -= nx * separateA;
        a.y -= ny * separateA;
        b.x += nx * separateB;
        b.y += ny * separateB;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal >= 0) continue;
        const restitution = 0.32;
        const impulse =
          (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;
        a.vx -= impulseX / a.mass;
        a.vy -= impulseY / a.mass;
        b.vx += impulseX / b.mass;
        b.vy += impulseY / b.mass;
      }
    }

    for (let i = this.pilotDebrisPieces.length - 1; i >= 0; i--) {
      if (this.pilotDebrisPieces[i].life <= 0) {
        this.pilotDebrisPieces.splice(i, 1);
      }
    }
  }

  bumpPilotDebrisWithBody(
    bodyX: number,
    bodyY: number,
    bodyRadius: number,
    bodyVx: number,
    bodyVy: number,
  ): void {
    if (this.pilotDebrisPieces.length <= 0) return;
    for (let i = 0; i < this.pilotDebrisPieces.length; i++) {
      const piece = this.pilotDebrisPieces[i];
      const dx = piece.x - bodyX;
      const dy = piece.y - bodyY;
      const minDist = piece.radius + bodyRadius;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(Math.max(1e-6, distSq));
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      piece.x += nx * (overlap + 0.08);
      piece.y += ny * (overlap + 0.08);

      piece.vx += nx * 10 + bodyVx * 0.15;
      piece.vy += ny * 10 + bodyVy * 0.15;
      const maxSpeed = 88;
      const speedSq = piece.vx * piece.vx + piece.vy * piece.vy;
      if (speedSq > maxSpeed * maxSpeed) {
        const speed = Math.sqrt(speedSq);
        const scale = maxSpeed / speed;
        piece.vx *= scale;
        piece.vy *= scale;
      }
      piece.angularVelocity += (bodyVx * ny - bodyVy * nx) * 0.03;
    }
  }

  updateParticles(dt: number): void {
    this.updatePilotDeathDebris(dt);

    for (let i = this.bulletCasings.length - 1; i >= 0; i--) {
      const casing = this.bulletCasings[i];
      casing.x += casing.vx * dt;
      casing.y += casing.vy * dt;
      casing.vx *= 0.993;
      casing.vy = casing.vy * 0.993 + 2.4 * dt;
      casing.angle += casing.angularVelocity * dt;
      casing.angularVelocity *= 0.995;

      if (casing.x < 0) {
        casing.x = 0;
        casing.vx = Math.abs(casing.vx) * 0.45;
      } else if (casing.x > GAME_CONFIG.ARENA_WIDTH) {
        casing.x = GAME_CONFIG.ARENA_WIDTH;
        casing.vx = -Math.abs(casing.vx) * 0.45;
      }

      if (casing.y < 0) {
        casing.y = 0;
        casing.vy = Math.abs(casing.vy) * 0.45;
      } else if (casing.y > GAME_CONFIG.ARENA_HEIGHT) {
        casing.y = GAME_CONFIG.ARENA_HEIGHT;
        casing.vy = -Math.abs(casing.vy) * 0.45;
      }

    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  drawBulletCasings(): void {
    const { ctx } = this;
    const nowMs = this.getNowMs();
    for (const casing of this.bulletCasings) {
      const shimmer = 0.78 + 0.22 * Math.sin(nowMs * 0.006 + casing.shimmerOffset);
      ctx.save();
      ctx.translate(casing.x, casing.y);
      ctx.rotate(casing.angle);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "rgba(200, 160, 80, 1)";
      ctx.fillRect(
        -casing.width * 0.5,
        -casing.height * 0.5,
        casing.width,
        casing.height,
      );
      ctx.fillStyle = "rgba(255, 225, 165, " + shimmer + ")";
      ctx.fillRect(
        -casing.width * 0.34,
        -casing.height * 0.34,
        casing.width * 0.52,
        casing.height * 0.5,
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawParticles(): void {
    const { ctx } = this;
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }


  spawnShieldBreakDebris(x: number, y: number): void {
    // Spawn glass-like debris when shield breaks
    const pieceCount = 8 + Math.floor(this.random() * 4);
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 40 + this.random() * 60;
      const life = 0.4 + this.random() * 0.4;

      this.particles.push({
        x: x + Math.cos(angle) * 20,
        y: y + Math.sin(angle) * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 30, // Add downward gravity effect
        life,
        maxLife: life,
        size: 3 + this.random() * 4,
        color: "#88ccff",
      });
    }
  }


  spawnMineExplosion(x: number, y: number, radius: number): void {
    // Create a bright flash particle
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.3,
      maxLife: 0.3,
      size: radius,
      color: "#ffffff",
    });

    // Create explosion ring
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.4 + i * 0.1,
        maxLife: 0.4 + i * 0.1,
        size: radius * (0.3 + i * 0.2),
        color: i === 0 ? "#ffffff" : i === 1 ? "#ffffcc" : "#ffcccc",
      });
    }

    // Create debris particles
    const debrisCount = 20;
    for (let i = 0; i < debrisCount; i++) {
      const angle = (i / debrisCount) * Math.PI * 2 + this.random() * 0.5;
      const speed = 50 + this.random() * 100;
      const life = 0.3 + this.random() * 0.3;

      this.particles.push({
        x: x + Math.cos(angle) * 10,
        y: y + Math.sin(angle) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + this.random() * 3,
        color: this.random() > 0.5 ? "#ffffff" : "#ffcccc",
      });
    }
  }

}

