import {
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  PowerUpState,
  LaserBeamState,
  MineState,
  Particle,
  PlayerColor,
  PLAYER_COLORS,
  GAME_CONFIG,
} from "../types";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private screenShake = { intensity: 0, duration: 0, offsetX: 0, offsetY: 0 };

  // Fixed arena scaling
  private scale: number = 1;
  private offsetX: number = 0;
  private offsetY: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const rootStyles = getComputedStyle(document.documentElement);
    const layoutWidth = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-width"),
    );
    const layoutHeight = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-height"),
    );
    const targetWidth =
      Number.isFinite(layoutWidth) && layoutWidth > 0
        ? layoutWidth
        : rect.width;
    const targetHeight =
      Number.isFinite(layoutHeight) && layoutHeight > 0
        ? layoutHeight
        : rect.height;

    this.canvas.width = Math.max(1, Math.round(targetWidth));
    this.canvas.height = Math.max(1, Math.round(targetHeight));

    // Calculate scale to fit fixed arena in window while maintaining aspect ratio
    const scaleX = this.canvas.width / GAME_CONFIG.ARENA_WIDTH;
    const scaleY = this.canvas.height / GAME_CONFIG.ARENA_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);

    // Center the arena
    this.offsetX =
      (this.canvas.width - GAME_CONFIG.ARENA_WIDTH * this.scale) / 2;
    this.offsetY =
      (this.canvas.height - GAME_CONFIG.ARENA_HEIGHT * this.scale) / 2;
  }

  getSize(): { width: number; height: number } {
    // Return fixed arena size (not canvas size)
    return { width: GAME_CONFIG.ARENA_WIDTH, height: GAME_CONFIG.ARENA_HEIGHT };
  }

  getScale(): number {
    return this.scale;
  }

  clear(): void {
    this.ctx.fillStyle = "#0a0a12";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  beginFrame(): void {
    this.ctx.save();

    // Apply screen shake (using pre-calculated offsets from updateScreenShake)
    if (this.screenShake.duration > 0) {
      this.ctx.translate(this.screenShake.offsetX, this.screenShake.offsetY);
    }

    // Apply arena scaling and centering
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
  }

  endFrame(): void {
    this.ctx.restore();
  }

  updateScreenShake(dt: number): void {
    if (this.screenShake.duration > 0) {
      this.screenShake.duration -= dt;

      // Calculate deterministic shake offsets using time-based sin/cos
      // This avoids Math.random() in the render loop while still giving chaotic motion
      const time = performance.now() * 0.05;
      const decay = this.screenShake.duration > 0 ? 1 : 0;
      this.screenShake.offsetX =
        Math.sin(time * 1.1) *
        Math.cos(time * 0.7) *
        this.screenShake.intensity *
        decay;
      this.screenShake.offsetY =
        Math.sin(time * 0.9) *
        Math.cos(time * 1.3) *
        this.screenShake.intensity *
        decay;

      if (this.screenShake.duration <= 0) {
        this.screenShake.intensity = 0;
        this.screenShake.offsetX = 0;
        this.screenShake.offsetY = 0;
      }
    }
  }

  addScreenShake(intensity: number, duration: number): void {
    this.screenShake.intensity = Math.max(
      this.screenShake.intensity,
      intensity,
    );
    this.screenShake.duration = Math.max(this.screenShake.duration, duration);
  }

  // ============= SHIP RENDERING =============

  drawShip(
    state: ShipState,
    color: PlayerColor,
    shieldHits?: number,
    laserCharges?: number,
    laserCooldownProgress?: number,
    scatterCharges?: number,
    scatterCooldownProgress?: number,
  ): void {
    const { ctx } = this;
    const { x, y, angle, invulnerableUntil } = state;
    const isInvulnerable = Date.now() < invulnerableUntil;
    const size = 15;

    ctx.save();
    ctx.translate(x, y);

    // Draw shield if present
    if (
      shieldHits !== undefined &&
      shieldHits < GAME_CONFIG.POWERUP_SHIELD_HITS
    ) {
      this.drawShield(0, 0, shieldHits);
    }

    // Draw laser cooldown circle (outside the rotation)
    if (laserCooldownProgress !== undefined && laserCooldownProgress < 1) {
      ctx.strokeStyle = "#ff0066";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        22,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * laserCooldownProgress,
      );
      ctx.stroke();
    }

    ctx.rotate(angle);

    // Draw laser charge indicators on ship tail - arranged in arc pattern
    if (laserCharges !== undefined && laserCharges > 0) {
      const maxCharges = GAME_CONFIG.POWERUP_LASER_CHARGES;
      const dotSize = 3.5;
      const arcRadius = size * 1.3; // Distance from ship center
      const arcAngle = Math.PI * 0.6; // Total arc spread (108 degrees)

      for (let i = 0; i < maxCharges; i++) {
        // Calculate angle for this charge in the arc (spread around back of ship)
        const angleOffset = (i / (maxCharges - 1) - 0.5) * arcAngle;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        // Red if available, dark gray/black if used
        const isAvailable = i < laserCharges;
        ctx.fillStyle = isAvailable ? "#ff0044" : "#333333";
        ctx.strokeStyle = isAvailable ? "#ff6688" : "#222222";
        ctx.lineWidth = 1;

        // Draw bullet-like shape
        ctx.beginPath();
        ctx.ellipse(dotX, dotY, dotSize, dotSize * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Draw scatter shot charge indicators on ship tail - green balls with red centers
    if (scatterCharges !== undefined && scatterCharges > 0) {
      const maxCharges = GAME_CONFIG.POWERUP_SCATTER_CHARGES;
      const ballSize = 5;
      const arcRadius = size * 1.3;
      const arcAngle = Math.PI * 0.6;

      for (let i = 0; i < maxCharges; i++) {
        const angleOffset = (i / (maxCharges - 1) - 0.5) * arcAngle;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        const isAvailable = i < scatterCharges;
        
        // Green ball background
        ctx.fillStyle = isAvailable ? "#00ff44" : "#333333";
        ctx.strokeStyle = isAvailable ? "#88ffaa" : "#222222";
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.arc(dotX, dotY, ballSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Red center dot
        if (isAvailable) {
          ctx.fillStyle = "#ff0044";
          ctx.beginPath();
          ctx.arc(dotX, dotY, ballSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw ammo indicators on ship tail (yellow dots) - arranged in arc pattern
    // Only show when no laser power-up is active
    if (laserCharges === undefined && scatterCharges === undefined && state.maxAmmo > 0) {
      const maxAmmo = state.maxAmmo;
      const currentAmmo = state.ammo;
      const dotSize = 3.5;
      const arcRadius = size * 1.2; // Distance from ship center
      const arcAngle = Math.PI * 0.5; // Total arc spread (90 degrees)

      for (let i = 0; i < maxAmmo; i++) {
        // Calculate angle for this ammo in the arc (spread around back of ship)
        const angleOffset =
          maxAmmo > 1 ? (i / (maxAmmo - 1) - 0.5) * arcAngle : 0;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        // Yellow if available, dark gray if used
        const isAvailable = i < currentAmmo;
        ctx.fillStyle = isAvailable ? "#ffee00" : "#333333";
        ctx.strokeStyle = isAvailable ? "#ffee88" : "#222222";
        ctx.lineWidth = 1;

        // Draw bullet-like shape
        ctx.beginPath();
        ctx.ellipse(dotX, dotY, dotSize, dotSize * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Flash when invulnerable
    if (isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    // Engine glow - ALWAYS on since ship always thrusts forward
    // Use pre-calculated random offset to avoid flicker
    const flameLength = size * 0.8 + Math.sin(Date.now() * 0.02) * size * 0.2;
    ctx.fillStyle = "#ff4400";
    const baseAlpha =
      isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0 ? 0.35 : 0.7;
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, 0);
    ctx.lineTo(-size * 0.7, -size * 0.3);
    ctx.lineTo(-size * 0.4 - flameLength, 0);
    ctx.lineTo(-size * 0.7, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha =
      isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0 ? 0.5 : 1;

    // Glow effect
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 15;

    // Ship body (triangle pointing right)
    ctx.fillStyle = color.primary;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(size, 0); // Nose
    ctx.lineTo(-size * 0.7, -size * 0.6); // Top wing
    ctx.lineTo(-size * 0.4, 0); // Notch
    ctx.lineTo(-size * 0.7, size * 0.6); // Bottom wing
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(size * 0.2, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= PILOT RENDERING =============

  drawPilot(state: PilotState): void {
    const { ctx } = this;
    const { x, y, spawnTime } = state;
    const survivalProgress = Math.min(
      1,
      (Date.now() - spawnTime) / GAME_CONFIG.PILOT_SURVIVAL_TIME,
    );
    const isFlashing =
      survivalProgress > 0.6 && Math.floor(Date.now() / 150) % 2 === 0;

    ctx.save();
    ctx.translate(x, y);

    if (isFlashing) {
      ctx.globalAlpha = 0.5;
    }

    // Survival progress ring
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      15,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * survivalProgress,
    );
    ctx.stroke();

    // Parachute
    ctx.fillStyle = "#ff00aa";
    ctx.beginPath();
    ctx.arc(0, -10, 10, Math.PI, Math.PI * 2);
    ctx.fill();

    // Strings
    ctx.strokeStyle = "#888888";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -6);
    ctx.lineTo(0, 4);
    ctx.moveTo(8, -6);
    ctx.lineTo(0, 4);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 4);
    ctx.stroke();

    // Pilot body (circle)
    ctx.fillStyle = "#ffcc88";
    ctx.beginPath();
    ctx.arc(0, 6, 5, 0, Math.PI * 2);
    ctx.fill();

    // Helmet
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 4, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= ASTEROID RENDERING =============

  drawAsteroid(state: AsteroidState): void {
    const { ctx } = this;
    const { x, y, angle, vertices } = state;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow effect
    ctx.shadowColor = GAME_CONFIG.ASTEROID_GLOW;
    ctx.shadowBlur = 15;

    // Asteroid body
    ctx.fillStyle = GAME_CONFIG.ASTEROID_COLOR;
    ctx.strokeStyle = "#ffaa00";
    ctx.lineWidth = 2;

    ctx.beginPath();
    if (vertices.length > 0) {
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Add some surface detail (craters)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.arc(
      vertices[0].x * 0.3,
      vertices[0].y * 0.3,
      Math.abs(vertices[0].x) * 0.25,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  // ============= PROJECTILE RENDERING =============

  drawProjectile(state: ProjectileState): void {
    const { ctx } = this;
    const { x, y, vx, vy } = state;
    const angle = Math.atan2(vy, vx);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= PARTICLE SYSTEM =============

  spawnParticle(
    x: number,
    y: number,
    color: string,
    type: "explosion" | "thrust" | "hit",
  ): void {
    const angle = Math.random() * Math.PI * 2;
    let speed: number;
    let life: number;
    let size: number;

    switch (type) {
      case "explosion":
        speed = 80 + Math.random() * 120;
        life = 0.3 + Math.random() * 0.3;
        size = 3 + Math.random() * 5;
        break;
      case "thrust":
        speed = 20 + Math.random() * 40;
        life = 0.1 + Math.random() * 0.2;
        size = 2 + Math.random() * 3;
        break;
      case "hit":
        speed = 40 + Math.random() * 60;
        life = 0.2 + Math.random() * 0.2;
        size = 2 + Math.random() * 3;
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

  spawnAsteroidDebris(x: number, y: number, size: number, color: string): void {
    // Spawn debris pieces - purely visual, no collision
    const pieceCount = 4 + Math.floor(Math.random() * 4); // 4-7 pieces
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 30 + Math.random() * 50;
      const life = 0.5 + Math.random() * 0.5;
      const pieceSize = size * 0.2 + Math.random() * (size * 0.3);

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
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      const life = 0.3 + Math.random() * 0.4;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color: "#888888",
      });
    }
  }

  spawnShipDebris(x: number, y: number, color: string): void {
    // Spawn ship debris pieces - larger and more dramatic than asteroid debris
    const pieceCount = 8 + Math.floor(Math.random() * 4); // 8-11 pieces
    
    // Ship body pieces (colored)
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 50 + Math.random() * 80;
      const life = 0.8 + Math.random() * 0.6; // Longer lasting
      const pieceSize = 4 + Math.random() * 6;

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
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 60;
      const life = 0.6 + Math.random() * 0.5;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 3 + Math.random() * 4,
        color: "#aaaaaa",
      });
    }

    // Spark particles
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 100;
      const life = 0.3 + Math.random() * 0.3;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.5 + Math.random() * 2,
        color: "#ffdd00",
      });
    }
  }

  updateParticles(dt: number): void {
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

  // ============= POWER-UP RENDERING =============

  drawPowerUp(state: PowerUpState): void {
    const { ctx } = this;
    const { x, y, type, spawnTime } = state;
    const size = GAME_CONFIG.POWERUP_SIZE;
    const remainingTime = Math.max(
      0,
      GAME_CONFIG.POWERUP_DESPAWN_TIME - (Date.now() - spawnTime),
    );
    const progress = remainingTime / GAME_CONFIG.POWERUP_DESPAWN_TIME;

    ctx.save();
    ctx.translate(x, y);

    // Draw despawn ring
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      size * 0.8,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.stroke();

    // Draw power-up box - color based on type
    let boxColor: string;
    if (type === "LASER") {
      boxColor = "#ff0066"; // Pink
    } else if (type === "SHIELD") {
      boxColor = "#00ccff"; // Cyan
    } else if (type === "SCATTER") {
      boxColor = "#00cc44"; // Green
    } else if (type === "MINE") {
      boxColor = "#ff8800"; // Orange
    } else {
      boxColor = "#666666"; // Gray for REVERSE
    }
    ctx.fillStyle = boxColor;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;

    // Glow effect
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 15;

    // Draw square box
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);

    ctx.shadowBlur = 0;

    // Draw symbol
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 14px Arial";

    if (type === "LASER") {
      // Draw laser symbol (lightning bolt)
      ctx.beginPath();
      ctx.moveTo(2, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(-2, 8);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    } else if (type === "SHIELD") {
      // Draw shield symbol (circle)
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "SCATTER") {
      // Draw shotgun shell symbol - green cylinder with red primer
      // Shell body (green rectangle)
      ctx.fillStyle = "#00ff44";
      ctx.fillRect(-4, -7, 8, 14);
      // Shell rim
      ctx.fillStyle = "#00aa33";
      ctx.fillRect(-5, 5, 10, 3);
      // Red primer in center
      ctx.fillStyle = "#ff0044";
      ctx.beginPath();
      ctx.arc(0, 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === "MINE") {
      // Draw mine symbol - orange ball with grey spikes
      // Center orange ball
      ctx.fillStyle = "#ff8800";
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      // Grey spikes
      ctx.strokeStyle = "#888888";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 4, Math.sin(angle) * 4);
        ctx.lineTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
        ctx.stroke();
      }
    } else if (type === "REVERSE") {
      // Draw reverse symbol - blue glowing "R"
      // Blue glow effect
      ctx.shadowColor = "#0088ff";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#0088ff";
      ctx.font = "bold 16px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("R", 0, 0);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // ============= LASER BEAM RENDERING =============

  drawLaserBeam(state: LaserBeamState): void {
    const { ctx } = this;
    const { x, y, angle, id } = state;
    const beamLength = GAME_CONFIG.POWERUP_BEAM_LENGTH;
    const beamWidth = GAME_CONFIG.POWERUP_BEAM_WIDTH;
    // Use deterministic offsets based on beam id to avoid flickering
    const baseOffset = (id.charCodeAt(id.length - 1) % 10) / 10;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Main beam gradient
    const gradient = ctx.createLinearGradient(
      0,
      -beamWidth / 2,
      0,
      beamWidth / 2,
    );
    gradient.addColorStop(0, "rgba(255, 0, 100, 0.3)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(1, "rgba(255, 0, 100, 0.3)");

    // Draw main beam
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -beamWidth / 2, beamLength, beamWidth);

    // Core beam (bright white center)
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(0, -beamWidth / 4, beamLength, beamWidth / 2);

    // Wire-like effect (sharp lines) - deterministic based on id
    ctx.strokeStyle = "rgba(255, 150, 200, 0.6)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const offset = (((baseOffset + i * 0.2) % 1) - 0.5) * beamWidth * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(
        beamLength,
        offset + Math.sin(i * 1.5 + baseOffset * Math.PI) * 5,
      );
      ctx.stroke();
    }

    // Glow effect at beam origin
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    glowGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    glowGradient.addColorStop(0.5, "rgba(255, 0, 100, 0.5)");
    glowGradient.addColorStop(1, "transparent");
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= SHIELD RENDERING =============

  drawShield(x: number, y: number, hits: number): void {
    const { ctx } = this;

    // Color based on hits: 0 = blue, 1 = red
    const isDamaged = hits >= 1;
    const alpha = 0.4;
    const color = isDamaged
      ? `rgba(255, 50, 50, ${alpha})`
      : `rgba(50, 150, 255, ${alpha})`;
    const glowColor = isDamaged ? "#ff3333" : "#3399ff";

    ctx.save();
    ctx.translate(x, y);

    // Glow effect
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;

    // Draw oval shield
    ctx.fillStyle = color;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.ellipse(0, 0, 25, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  spawnShieldBreakDebris(x: number, y: number): void {
    // Spawn glass-like debris when shield breaks
    const pieceCount = 8 + Math.floor(Math.random() * 4);
    for (let i = 0; i < pieceCount; i++) {
      const angle = (i / pieceCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 40 + Math.random() * 60;
      const life = 0.4 + Math.random() * 0.4;

      this.particles.push({
        x: x + Math.cos(angle) * 20,
        y: y + Math.sin(angle) * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 30, // Add downward gravity effect
        life,
        maxLife: life,
        size: 3 + Math.random() * 4,
        color: "#88ccff",
      });
    }
  }

  // ============= STARS BACKGROUND =============

  private stars: {
    x: number;
    y: number;
    size: number;
    brightness: number;
    twinkleSpeed: number;
    twinkleOffset: number;
  }[] = [];

  initStars(): void {
    this.stars = [];
    // Stars are in arena coordinates (within the fixed arena size)
    const count = Math.floor(
      (GAME_CONFIG.ARENA_WIDTH * GAME_CONFIG.ARENA_HEIGHT) / 4000,
    );
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * GAME_CONFIG.ARENA_WIDTH,
        y: Math.random() * GAME_CONFIG.ARENA_HEIGHT,
        size: 0.5 + Math.random() * 1.5,
        brightness: 0.3 + Math.random() * 0.7,
        twinkleSpeed: 1 + Math.random() * 3,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }
  }

  drawStars(): void {
    const { ctx } = this;
    const time = performance.now() / 1000;

    // Stars are drawn in arena coordinates (already transformed)
    for (const star of this.stars) {
      const twinkle =
        0.5 + 0.5 * Math.sin(time * star.twinkleSpeed + star.twinkleOffset);
      const alpha = star.brightness * twinkle;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ============= ARENA BORDER =============

  drawArenaBorder(): void {
    const { ctx } = this;
    const w = GAME_CONFIG.ARENA_WIDTH;
    const h = GAME_CONFIG.ARENA_HEIGHT;
    const borderWidth = 4;

    // Neon border glow
    ctx.save();
    ctx.strokeStyle = "#00f0ff";
    ctx.shadowColor = "#00f0ff";
    ctx.shadowBlur = 20;
    ctx.lineWidth = borderWidth;

    // Draw rounded rectangle border
    const radius = 20;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.arcTo(w, 0, w, radius, radius);
    ctx.lineTo(w, h - radius);
    ctx.arcTo(w, h, w - radius, h, radius);
    ctx.lineTo(radius, h);
    ctx.arcTo(0, h, 0, h - radius, radius);
    ctx.lineTo(0, radius);
    ctx.arcTo(0, 0, radius, 0, radius);
    ctx.closePath();
    ctx.stroke();

    // Inner dim fill for area outside arena (corners if visible)
    ctx.restore();
  }

  // ============= UI ELEMENTS =============

  drawCountdown(count: number): void {
    const { ctx } = this;
    const text = count > 0 ? count.toString() : "FIGHT!";

    // Countdown is drawn in arena coordinates (already transformed)
    ctx.save();
    ctx.font = "bold 80px Orbitron, sans-serif";
    ctx.fillStyle = count > 0 ? "#ffee00" : "#00ff88";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 30;
    // Center of arena
    ctx.fillText(
      text,
      GAME_CONFIG.ARENA_WIDTH / 2,
      GAME_CONFIG.ARENA_HEIGHT / 2,
    );
    ctx.restore();
  }

  getPlayerColor(index: number): PlayerColor {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  // ============= MINE RENDERING =============

  drawMine(mine: import("../entities/Mine").Mine): void {
    const { ctx } = this;
    const { x, y, exploded, explosionTime } = mine;

    if (exploded && explosionTime > 0) {
      // Draw explosion effect - lasts 500ms
      const elapsed = Date.now() - explosionTime;
      const progress = Math.min(1, elapsed / 500);
      const radius = GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      ctx.save();
      ctx.translate(x, y);

      // Outer white flash
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Middle bright ring
      ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else {
      // Draw pointy ball mine with pulsing animation
      ctx.save();
      ctx.translate(x, y);

      // Pulsing animation - scale shrinks and grows
      const pulseSpeed = 0.008;
      const pulseAmount = 0.15;
      const pulseScale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseAmount;
      ctx.scale(pulseScale, pulseScale);

      const mineSize = GAME_CONFIG.POWERUP_MINE_SIZE;
      const spikeCount = 8;
      const innerRadius = mineSize * 0.6;
      const outerRadius = mineSize;

      // Glow effect - orange
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 15;

      // Draw spiky ball shape - grey spikes
      ctx.fillStyle = "#888888";
      ctx.strokeStyle = "#aaaaaa";
      ctx.lineWidth = 2;

      ctx.beginPath();
      for (let i = 0; i < spikeCount * 2; i++) {
        const angle = (i / (spikeCount * 2)) * Math.PI * 2;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Center glow - orange center
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff8800";
      ctx.beginPath();
      ctx.arc(0, 0, mineSize * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = "#ffaa44";
      ctx.beginPath();
      ctx.arc(0, 0, mineSize * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  drawMineState(state: import("../types").MineState): void {
    const { ctx } = this;
    const { x, y, exploded, explosionTime } = state;

    // Check if mine has exploded
    if (exploded && explosionTime > 0) {
      // Draw explosion effect on client - lasts 500ms
      const elapsed = Date.now() - explosionTime;
      const progress = Math.min(1, elapsed / 500);
      const radius = GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      ctx.save();
      ctx.translate(x, y);

      // Outer white flash
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Middle bright ring
      ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    // Normal mine rendering with pulse
    ctx.save();
    ctx.translate(x, y);

    // Pulsing animation
    const pulseSpeed = 0.008;
    const pulseAmount = 0.15;
    const pulseScale = 1 + Math.sin(Date.now() * pulseSpeed) * pulseAmount;
    ctx.scale(pulseScale, pulseScale);

    const mineSize = GAME_CONFIG.POWERUP_MINE_SIZE;
    const spikeCount = 8;
    const innerRadius = mineSize * 0.6;
    const outerRadius = mineSize;

    // Grey spikes
    ctx.fillStyle = "#888888";
    ctx.strokeStyle = "#aaaaaa";
    ctx.lineWidth = 2;

    ctx.beginPath();
    for (let i = 0; i < spikeCount * 2; i++) {
      const angle = (i / (spikeCount * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Orange center
    ctx.fillStyle = "#ff8800";
    ctx.beginPath();
    ctx.arc(0, 0, mineSize * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    ctx.fillStyle = "#ffaa44";
    ctx.beginPath();
    ctx.arc(0, 0, mineSize * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  spawnMineExplosion(x: number, y: number, radius: number): void {
    const { ctx } = this;

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
      const angle = (i / debrisCount) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 50 + Math.random() * 100;
      const life = 0.3 + Math.random() * 0.3;

      this.particles.push({
        x: x + Math.cos(angle) * 10,
        y: y + Math.sin(angle) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 2 + Math.random() * 3,
        color: Math.random() > 0.5 ? "#ffffff" : "#ffcccc",
      });
    }
  }
}
