import {
  ShipState,
  PilotState,
  ProjectileState,
  Particle,
  PlayerColor,
  PLAYER_COLORS,
  GAME_CONFIG,
} from "../types";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private screenShake = { intensity: 0, duration: 0 };

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

    // Apply screen shake
    if (this.screenShake.duration > 0) {
      const shakeX = (Math.random() - 0.5) * this.screenShake.intensity;
      const shakeY = (Math.random() - 0.5) * this.screenShake.intensity;
      this.ctx.translate(shakeX, shakeY);
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
      if (this.screenShake.duration <= 0) {
        this.screenShake.intensity = 0;
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

  drawShip(state: ShipState, color: PlayerColor, isThrusting: boolean): void {
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

    // Engine glow when thrusting
    if (isThrusting) {
      ctx.fillStyle = "#ff4400";
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.7;
      ctx.beginPath();
      ctx.moveTo(-size * 0.4, 0);
      ctx.lineTo(-size * 0.7, -size * 0.3);
      ctx.lineTo(-size * 1.2 - Math.random() * size * 0.3, 0);
      ctx.lineTo(-size * 0.7, size * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha =
        isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0 ? 0.5 : 1;
    }

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
    const count = Math.floor((this.canvas.width * this.canvas.height) / 3000);
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
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

  // ============= UI ELEMENTS =============

  drawCountdown(count: number): void {
    const { ctx } = this;
    const text = count > 0 ? count.toString() : "FIGHT!";

    ctx.save();
    ctx.font = "bold 80px Orbitron, sans-serif";
    ctx.fillStyle = count > 0 ? "#ffee00" : "#00ff88";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 30;
    ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2);
    ctx.restore();
  }

  getPlayerColor(index: number): PlayerColor {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }
}
