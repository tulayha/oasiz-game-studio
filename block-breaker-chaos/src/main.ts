// Block Breaker Chaos - Physics-based destruction game
// Launch balls to destroy blocks and create chain reactions!

import Matter from 'matter-js';

const { Engine, World, Bodies, Body, Events, Composite } = Matter;

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface Block {
  body: Matter.Body;
  hits: number;
  maxHits: number;
  color: string;
}

interface Ball {
  body: Matter.Body;
  angleVariation: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Explosion {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

class BlockBreakerGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: Matter.Engine;
  private world: Matter.World;
  private width: number;
  private height: number;
  private gameState: 'START' | 'PLAYING' | 'GAME_OVER';
  private score: number;
  private combo: number;
  private comboTimer: number;
  private level: number;
  private blocks: Block[];
  private balls: Ball[];
  private particles: Particle[];
  private explosions: Explosion[];
  private settings: Settings;
  private isMobile: boolean;
  private lastTime: number;
  private blockRows: number;
  private blockCols: number;
  private launcher: { x: number; y: number; angle: number; power: number };
  private isAiming: boolean;
  private aimX: number;
  private aimY: number;
  private collisionPairs: Set<string>;

  constructor() {
    console.log('[BlockBreakerGame] Initializing');
    
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    if (!this.canvas) {
      console.error('[BlockBreakerGame] Canvas element not found');
      return;
    }
    
    // iOS WebView requires explicit canvas attributes for proper rendering
    this.canvas.setAttribute('willReadFrequently', 'true');
    
    const ctx = this.canvas.getContext('2d', { 
      alpha: false,  // Optimization: no transparency needed for background
      desynchronized: true  // Better performance on mobile
    });
    
    if (!ctx) {
      console.error('[BlockBreakerGame] Failed to get 2D context');
      return;
    }
    this.ctx = ctx;
    
    this.engine = Engine.create({
      gravity: { x: 0, y: 0.5 }
    });
    this.world = this.engine.world;
    
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.gameState = 'START';
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.level = 1;
    this.blocks = [];
    this.balls = [];
    this.particles = [];
    this.explosions = [];
    this.isMobile = window.matchMedia('(pointer: coarse)').matches;
    this.lastTime = performance.now();
    this.blockRows = 3;
    this.blockCols = 6;
    this.isAiming = false;
    this.aimX = 0;
    this.aimY = 0;
    this.collisionPairs = new Set();
    
    this.launcher = {
      x: this.width / 2,
      y: this.height - 100,
      angle: -Math.PI / 2,
      power: 20
    };
    
    this.settings = this.loadSettings();
    this.setupCanvas();
    this.setupEventListeners();
    this.setupCollisionEvents();
    this.setupUI();
    this.animate();
  }

  private loadSettings(): Settings {
    const saved = localStorage.getItem('blockBreakerSettings');
    return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem('blockBreakerSettings', JSON.stringify(this.settings));
  }

  private setupCanvas(): void {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  private setupCollisionEvents(): void {
    Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        
        const ball = this.balls.find(b => b.body === bodyA || b.body === bodyB);
        const block = this.blocks.find(b => b.body === bodyA || b.body === bodyB);
        
        if (ball && block) {
          const pairKey = `${ball.body.id}-${block.body.id}`;
          if (!this.collisionPairs.has(pairKey)) {
            this.collisionPairs.add(pairKey);
            this.handleBlockHit(block);
            
            const randomAngle = (Math.random() - 0.5) * 0.3;
            const currentVel = ball.body.velocity;
            const speed = Math.sqrt(currentVel.x * currentVel.x + currentVel.y * currentVel.y);
            const angle = Math.atan2(currentVel.y, currentVel.x) + randomAngle;
            Body.setVelocity(ball.body, {
              x: Math.cos(angle) * speed,
              y: Math.sin(angle) * speed
            });
          }
        }
      });
    });
    
    Events.on(this.engine, 'collisionEnd', (event) => {
      event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const ball = this.balls.find(b => b.body === bodyA || b.body === bodyB);
        const block = this.blocks.find(b => b.body === bodyA || b.body === bodyB);
        
        if (ball && block) {
          const pairKey = `${ball.body.id}-${block.body.id}`;
          this.collisionPairs.delete(pairKey);
        }
      });
    });
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => this.handleResize());
    
    document.getElementById('start-btn')?.addEventListener('click', () => this.startGame());
    document.getElementById('restart-btn')?.addEventListener('click', () => this.restartGame());
    
    document.getElementById('settings-btn')?.addEventListener('click', () => this.openSettings());
    document.getElementById('close-settings')?.addEventListener('click', () => this.closeSettings());
    
    document.getElementById('toggle-music')?.addEventListener('click', (e) => this.toggleSetting(e, 'music'));
    document.getElementById('toggle-fx')?.addEventListener('click', (e) => this.toggleSetting(e, 'fx'));
    document.getElementById('toggle-haptics')?.addEventListener('click', (e) => this.toggleSetting(e, 'haptics'));
    
    this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e.clientX, e.clientY));
    this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e.clientX, e.clientY));
    this.canvas.addEventListener('mouseup', () => this.handlePointerUp());
    
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerDown(touch.clientX, touch.clientY);
    });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.handlePointerMove(touch.clientX, touch.clientY);
    });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.handlePointerUp();
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.gameState === 'PLAYING') {
        this.launchBall();
      }
    });
  }

  private setupUI(): void {
    const toggles = ['toggle-music', 'toggle-fx', 'toggle-haptics'];
    const keys: (keyof Settings)[] = ['music', 'fx', 'haptics'];
    
    toggles.forEach((id, i) => {
      const toggle = document.getElementById(id);
      if (toggle && this.settings[keys[i]]) {
        toggle.classList.add('active');
      }
    });
  }

  private handleResize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.launcher.x = this.width / 2;
    this.launcher.y = this.height - 100;
  }

  private handlePointerDown(x: number, y: number): void {
    if (this.gameState !== 'PLAYING') return;
    this.isAiming = true;
    this.aimX = x;
    this.aimY = y;
  }

  private handlePointerMove(x: number, y: number): void {
    if (!this.isAiming || this.gameState !== 'PLAYING') return;
    this.aimX = x;
    this.aimY = y;
    
    const dx = this.aimX - this.launcher.x;
    const dy = this.aimY - this.launcher.y;
    this.launcher.angle = Math.atan2(dy, dx);
  }

  private handlePointerUp(): void {
    if (!this.isAiming || this.gameState !== 'PLAYING') return;
    this.isAiming = false;
    this.launchBall();
  }

  private toggleSetting(e: Event, key: keyof Settings): void {
    const toggle = e.currentTarget as HTMLElement;
    this.settings[key] = !this.settings[key];
    toggle.classList.toggle('active');
    this.saveSettings();
    this.triggerHaptic('light');
  }

  private openSettings(): void {
    document.getElementById('settings-modal')?.classList.remove('hidden');
    this.triggerHaptic('light');
  }

  private closeSettings(): void {
    document.getElementById('settings-modal')?.classList.add('hidden');
    this.triggerHaptic('light');
  }

  private startGame(): void {
    console.log('[BlockBreakerGame] Starting game');
    this.gameState = 'PLAYING';
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.level = 1;
    
    document.getElementById('start-screen')?.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('hidden');
    document.getElementById('settings-btn')?.classList.remove('hidden');
    
    this.createBlocks();
    this.createWalls();
    this.updateScore();
    this.triggerHaptic('medium');
  }

  private restartGame(): void {
    console.log('[BlockBreakerGame] Restarting game');
    
    this.blocks.forEach(block => World.remove(this.world, block.body));
    this.balls.forEach(ball => World.remove(this.world, ball.body));
    this.blocks = [];
    this.balls = [];
    this.particles = [];
    this.explosions = [];
    this.level = 1;
    
    document.getElementById('game-over')?.classList.add('hidden');
    this.startGame();
  }

  private createWalls(): void {
    const wallThickness = 50;
    
    const leftWall = Bodies.rectangle(
      -wallThickness / 2,
      this.height / 2,
      wallThickness,
      this.height,
      { isStatic: true, restitution: 0.95, friction: 0, frictionAir: 0 }
    );
    
    const rightWall = Bodies.rectangle(
      this.width + wallThickness / 2,
      this.height / 2,
      wallThickness,
      this.height,
      { isStatic: true, restitution: 0.95, friction: 0, frictionAir: 0 }
    );
    
    const topWall = Bodies.rectangle(
      this.width / 2,
      -wallThickness / 2,
      this.width,
      wallThickness,
      { isStatic: true, restitution: 0.95, friction: 0, frictionAir: 0 }
    );
    
    const bottomPaddle = Bodies.rectangle(
      this.width / 2,
      this.height - 50,
      150,
      20,
      { isStatic: true, restitution: 0.9, friction: 0, frictionAir: 0 }
    );
    
    World.add(this.world, [leftWall, rightWall, topWall, bottomPaddle]);
  }

  private createBlocks(): void {
    const padding = 10;
    const sideMargin = 60;
    const topOffset = this.isMobile ? 180 : 120;
    const availableWidth = this.width - (sideMargin * 2);
    const blockWidth = (availableWidth - padding * (this.blockCols - 1)) / this.blockCols;
    const blockHeight = 40;
    
    const colors = ['#ff6b6b', '#ff8e53', '#ffd93d', '#6bcf7f', '#4d96ff', '#9d4edd'];
    const rows = Math.min(3 + Math.floor(this.level / 2), 6);
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < this.blockCols; col++) {
        const x = sideMargin + col * (blockWidth + padding) + blockWidth / 2;
        const y = topOffset + row * (blockHeight + padding) + blockHeight / 2;
        
        const maxHits = Math.min(Math.floor(this.level / 2) + 1, 5);
        const body = Bodies.rectangle(x, y, blockWidth, blockHeight, {
          isStatic: true,
          restitution: 0.8,
          friction: 0,
          frictionAir: 0,
          label: `block-${row}-${col}`
        });
        
        this.blocks.push({
          body,
          hits: 0,
          maxHits,
          color: colors[row % colors.length]
        });
        
        World.add(this.world, body);
      }
    }
  }

  private launchBall(): void {
    if (this.balls.length >= 5) return;
    
    const ball = Bodies.circle(
      this.launcher.x,
      this.launcher.y,
      12,
      {
        restitution: 0.95,
        friction: 0,
        frictionAir: 0.001,
        density: 0.002,
        inertia: Infinity
      }
    );
    
    const vx = Math.cos(this.launcher.angle) * this.launcher.power;
    const vy = Math.sin(this.launcher.angle) * this.launcher.power;
    Body.setVelocity(ball, { x: vx, y: vy });
    
    this.balls.push({ 
      body: ball,
      angleVariation: (Math.random() - 0.5) * 0.5
    });
    World.add(this.world, ball);
    
    this.triggerHaptic('medium');
  }

  private handleBlockHit(block: Block): void {
    if (block.hits < block.maxHits) {
      block.hits++;
      
      if (block.hits >= block.maxHits) {
        this.destroyBlock(block);
      } else {
        this.createParticles(block.body.position.x, block.body.position.y, 5, block.color);
        this.triggerHaptic('light');
      }
    }
  }

  private destroyBlock(block: Block): void {
    const index = this.blocks.indexOf(block);
    if (index > -1) {
      this.blocks.splice(index, 1);
      World.remove(this.world, block.body);
      
      this.score += 10 * (this.combo + 1);
      this.combo++;
      this.comboTimer = 2000;
      this.updateScore();
      
      this.createExplosion(block.body.position.x, block.body.position.y);
      this.createParticles(block.body.position.x, block.body.position.y, 20, block.color);
      this.triggerHaptic('heavy');
      
      if (this.blocks.length === 0) {
        this.nextLevel();
      }
    }
  }

  private nextLevel(): void {
    console.log('[BlockBreakerGame] Level complete');
    this.level++;
    this.score += 100 * this.level;
    this.updateScore();
    this.triggerHaptic('success');
    
    this.balls.forEach(ball => World.remove(this.world, ball.body));
    this.balls = [];
    this.particles = [];
    this.explosions = [];
    
    setTimeout(() => {
      this.createBlocks();
    }, 500);
  }

  private createExplosion(x: number, y: number): void {
    this.explosions.push({
      x,
      y,
      radius: 0,
      maxRadius: 60,
      life: 0,
      maxLife: 300
    });
  }

  private createParticles(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 2 + Math.random() * 3;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 500 + Math.random() * 500,
        color,
        size: 3 + Math.random() * 3
      });
    }
  }

  private updateScore(): void {
    const scoreEl = document.getElementById('score');
    if (scoreEl) scoreEl.textContent = `Level ${this.level} - ${this.score}`;
    
    const comboEl = document.getElementById('combo');
    if (comboEl) {
      if (this.combo > 1) {
        comboEl.textContent = `x${this.combo} COMBO!`;
      } else {
        comboEl.textContent = '';
      }
    }
  }

  private gameOver(): void {
    console.log('[BlockBreakerGame] Game over');
    this.gameState = 'GAME_OVER';
    
    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('settings-btn')?.classList.add('hidden');
    document.getElementById('game-over')?.classList.remove('hidden');
    document.getElementById('final-score')!.textContent = this.score.toString();
    
    this.submitScore(this.score);
    this.triggerHaptic('success');
  }

  private submitScore(score: number): void {
    if (typeof (window as any).submitScore === 'function') {
      (window as any).submitScore(score);
      console.log('[BlockBreakerGame] Score submitted:', score);
    }
  }

  private triggerHaptic(type: string): void {
    if (!this.settings.haptics) return;
    if (typeof (window as any).triggerHaptic === 'function') {
      (window as any).triggerHaptic(type);
    }
  }

  private update(deltaTime: number): void {
    if (this.gameState !== 'PLAYING') return;
    
    Engine.update(this.engine, deltaTime);
    
    this.balls.forEach(ball => {
      const speed = Math.sqrt(
        ball.body.velocity.x * ball.body.velocity.x +
        ball.body.velocity.y * ball.body.velocity.y
      );
      
      if (speed < 5) {
        const angle = Math.atan2(ball.body.velocity.y, ball.body.velocity.x) + ball.angleVariation;
        Body.setVelocity(ball.body, {
          x: Math.cos(angle) * 10,
          y: Math.sin(angle) * 10
        });
      }
      
      const maxSpeed = 25;
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        Body.setVelocity(ball.body, {
          x: ball.body.velocity.x * scale,
          y: ball.body.velocity.y * scale
        });
      }
      
      if (Math.abs(ball.body.velocity.x) < 2 && Math.abs(ball.body.velocity.y) > 5) {
        Body.setVelocity(ball.body, {
          x: ball.body.velocity.x + ball.angleVariation * 4,
          y: ball.body.velocity.y
        });
      }
    });
    
    if (this.comboTimer > 0) {
      this.comboTimer -= deltaTime;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.updateScore();
      }
    }
    
    this.balls = this.balls.filter(ball => {
      if (ball.body.position.y > this.height + 100) {
        World.remove(this.world, ball.body);
        return false;
      }
      return true;
    });
    
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life += deltaTime;
      return p.life < p.maxLife;
    });
    
    this.explosions = this.explosions.filter(e => {
      e.life += deltaTime;
      e.radius = (e.life / e.maxLife) * e.maxRadius;
      return e.life < e.maxLife;
    });
  }

  private draw(): void {
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    if (this.gameState === 'PLAYING') {
      this.drawBlocks();
      this.drawBalls();
      this.drawParticles();
      this.drawExplosions();
      this.drawLauncher();
    }
  }

  private drawBlocks(): void {
    this.blocks.forEach(block => {
      const pos = block.body.position;
      const bounds = block.body.bounds;
      const width = bounds.max.x - bounds.min.x;
      const height = bounds.max.y - bounds.min.y;
      
      const alpha = 1 - (block.hits / block.maxHits) * 0.5;
      this.ctx.fillStyle = block.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillRect(pos.x - width / 2, pos.y - height / 2, width, height);
      this.ctx.globalAlpha = 1;
      
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(pos.x - width / 2, pos.y - height / 2, width, height);
      
      if (block.maxHits > 1) {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 20px Fredoka';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText((block.maxHits - block.hits).toString(), pos.x, pos.y);
      }
    });
  }

  private drawBalls(): void {
    this.balls.forEach(ball => {
      const pos = ball.body.position;
      const radius = (ball.body as any).circleRadius;
      
      const gradient = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
      gradient.addColorStop(0, '#00e5ff');
      gradient.addColorStop(1, '#00d4ff');
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    });
  }

  private drawParticles(): void {
    this.particles.forEach(p => {
      const alpha = 1 - (p.life / p.maxLife);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = alpha;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
    });
  }

  private drawExplosions(): void {
    this.explosions.forEach(e => {
      const alpha = 1 - (e.life / e.maxLife);
      this.ctx.strokeStyle = '#ff6b6b';
      this.ctx.globalAlpha = alpha;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
    });
  }

  private drawLauncher(): void {
    const paddleWidth = 150;
    const paddleHeight = 20;
    const paddleY = this.height - 50;
    
    this.ctx.fillStyle = '#00d4ff';
    this.ctx.fillRect(
      this.width / 2 - paddleWidth / 2,
      paddleY - paddleHeight / 2,
      paddleWidth,
      paddleHeight
    );
    
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      this.width / 2 - paddleWidth / 2,
      paddleY - paddleHeight / 2,
      paddleWidth,
      paddleHeight
    );
    
    if (this.isAiming) {
      const aimLength = 100;
      const endX = this.launcher.x + Math.cos(this.launcher.angle) * aimLength;
      const endY = this.launcher.y + Math.sin(this.launcher.angle) * aimLength;
      
      this.ctx.strokeStyle = '#00d4ff';
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([10, 5]);
      this.ctx.beginPath();
      this.ctx.moveTo(this.launcher.x, this.launcher.y);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  private animate(): void {
    const currentTime = performance.now();
    const deltaTime = Math.min(currentTime - this.lastTime, 100);
    this.lastTime = currentTime;
    
    this.update(deltaTime);
    this.draw();
    
    requestAnimationFrame(() => this.animate());
  }
}

// Ensure DOM is ready before initializing (critical for iOS WebView)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new BlockBreakerGame());
} else {
  new BlockBreakerGame();
}
