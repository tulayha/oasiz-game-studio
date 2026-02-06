import {
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
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
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

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

  drawShip(state: ShipState, color: PlayerColor): void {
    const { ctx } = this;
    const { x, y, angle, invulnerableUntil } = state;
    const isInvulnerable = Date.now() < invulnerableUntil;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Flash when invulnerable
    if (isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    const size = 15;

    // Engine glow - ALWAYS on since ship always thrusts forward
    // Use pre-calculated random offset to avoid flicker
    const flameLength = size * 0.8 + Math.sin(Date.now() * 0.02) * size * 0.2;
    ctx.fillStyle = "#ff4400";
    const baseAlpha = isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0 ? 0.35 : 0.7;
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, 0);
    ctx.lineTo(-size * 0.7, -size * 0.3);
    ctx.lineTo(-size * 0.4 - flameLength, 0);
    ctx.lineTo(-size * 0.7, size * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0 ? 0.5 : 1;

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
      const pieceSize = (size * 0.2) + Math.random() * (size * 0.3);

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
}
