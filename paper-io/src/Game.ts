import { SPAWN_POINTS, PLAYER_COLORS, PLAYER_COLOR_STRINGS, PLAYER_NAMES, type Difficulty, type Vec2 } from './constants.ts';
import { type PlayerState, createPlayer, computeMovement, clampToArena, sampleTrailPoint, InputHandler } from './Player.ts';
import { segmentsIntersect } from './Collision.ts';
import { BotController } from './Bot.ts';
import { Renderer } from './Renderer.ts';
import { ParticleSystem } from './ParticleSystem.ts';
import { Audio } from './Audio.ts';
import { HUD } from './HUD.ts';
import { Menu, type MenuConfig } from './Menu.ts';
import { SpatialHash } from './SpatialHash.ts';

export class Game {
  private renderer: Renderer;
  private particleSystem: ParticleSystem;
  private audio: Audio;
  private hud: HUD;
  private menu: Menu;

  private players: PlayerState[] = [];
  private botController!: BotController;
  private inputHandler!: InputHandler;

  private trailHash = new SpatialHash(4);
  private running = false;
  private paused = false;
  private gameOver = false;
  private started = false; // waiting for first human input
  private gameTime = 0;
  private lastFrameTime = 0;
  private hudUpdateTimer = 0;
  private currentLeaderId = -1;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.particleSystem = new ParticleSystem(this.renderer.scene);
    this.audio = new Audio();
    this.hud = new HUD();
    this.menu = new Menu();

    this.menu.setCallbacks(
      (config) => this.startGame(config),
      () => this.startGame(this.menu.currentConfig),
      () => this.showMainMenu(),
    );

    document.getElementById('mute-btn')!.addEventListener('click', () => {
      const muted = this.audio.toggleMute();
      document.getElementById('mute-btn')!.textContent = muted ? '🔇' : '🔊';
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if ((e.key === 'r' || e.key === 'R') && this.gameOver) this.startGame(this.menu.currentConfig);
      if (e.key === 'Escape' && this.running) this.showMainMenu();
    });

    this.showMainMenu();
    this.startRenderLoop();
  }

  private showMainMenu(): void {
    this.stopGame();
    this.menu.showMenu();
    this.hud.hide();
  }

  private startGame(config: MenuConfig): void {
    this.stopGame();
    this.menu.hideMenu();
    this.menu.hideGameOver();

    this.players = [];
    this.gameOver = false;
    this.paused = false;
    this.started = false;
    this.gameTime = 0;

    // Create players
    const total = 1 + config.botCount;
    for (let i = 0; i < total; i++) {
      const sp = SPAWN_POINTS[i];
      const player = createPlayer(
        i, PLAYER_COLORS[i], PLAYER_COLOR_STRINGS[i],
        PLAYER_NAMES[i], sp.x, sp.z, i === 0,
      );
      this.players.push(player);
      this.renderer.createAvatar(i, PLAYER_COLORS[i], PLAYER_NAMES[i]);
    }

    // Bot AI
    this.botController = new BotController(config.difficulty);
    for (const p of this.players) {
      if (!p.isHuman) this.botController.initBot(p);
    }

    // Input — pass camera and canvas for mouse/touch raycasting
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.inputHandler = new InputHandler(this.players[0], this.renderer.camera, canvas);

    // HUD
    this.hud.show();

    // Initial territory + avatar positioning
    for (const p of this.players) {
      this.renderer.updateTerritory(p.id, p.territory.polygons, p.color);
      this.renderer.updateAvatar(p.id, p.position, 0);
    }

    // Snap camera to human player immediately
    const human = this.players[0];
    this.renderer.setCameraTarget(human.position);

    this.running = true;
  }

  private stopGame(): void {
    this.running = false;
    // Clean up renderer objects
    for (const p of this.players) {
      this.renderer.cleanupPlayer(p.id);
    }
    this.particleSystem.dispose();
  }

  private togglePause(): void {
    if (!this.running || this.gameOver) return;
    this.paused = !this.paused;
    if (this.paused) this.menu.showPause();
    else this.menu.hidePause();
  }

  private updateGame(dt: number): void {
    if (this.paused || this.gameOver) return;

    // Update human input (steer toward mouse/touch each frame)
    this.inputHandler.update();

    // Update bot AI
    for (const p of this.players) {
      if (!p.isHuman && p.alive) {
        this.botController.update(p, this.players);
      }
    }

    // Rebuild spatial hash for all trails
    this.trailHash.clear();
    for (const p of this.players) {
      if (p.alive && p.trail.length >= 2) {
        this.trailHash.insertTrail(p.id, p.trail);
      }
    }

    // Move all players
    for (const p of this.players) {
      if (!p.alive) continue;

      // Wait for first human input
      if (p.isHuman && !this.started) {
        if (p.hasInput) this.started = true;
        else continue;
      }

      const rawPos = computeMovement(p, dt);

      // Clamp to circular arena instead of killing
      const newPos = clampToArena(rawPos);

      const oldPos: Vec2 = { x: p.position.x, z: p.position.z };
      const wasInTerritory = p.territory.containsPoint(oldPos);
      const nowInTerritory = p.territory.containsPoint(newPos);

      // Check trail collision using spatial hash
      let hitTrail = false;
      const candidates = this.trailHash.query(oldPos, newPos);
      for (const cand of candidates) {
        const other = this.players[cand.playerId];
        if (!other || !other.alive) continue;
        const trail = other.trail;
        const i = cand.segIdx;
        // Skip last 2 segments of own trail to avoid self-collision at current pos
        if (other.id === p.id && i >= trail.length - 3) continue;
        if (segmentsIntersect(oldPos, newPos, trail[i], trail[i + 1])) {
          if (other.id === p.id) {
            this.killPlayer(p);
            hitTrail = true;
            break;
          } else {
            this.killPlayer(other);
          }
        }
      }
      if (hitTrail) continue;

      // Move
      p.position = newPos;

      // Trail logic
      if (wasInTerritory && !nowInTerritory) {
        // Leaving territory — start trailing
        p.isTrailing = true;
        p.trail = [{ x: oldPos.x, z: oldPos.z }];
      }

      if (p.isTrailing) {
        sampleTrailPoint(p);

        if (nowInTerritory && p.trail.length >= 3) {
          // Returned to territory — capture!
          p.trail.push({ x: newPos.x, z: newPos.z }); // close the trail
          p.territory.captureFromTrail(p.trail);

          // Remove overlap from other players
          for (const other of this.players) {
            if (other.id !== p.id && other.alive) {
              other.territory.removeOverlap(p.trail);
              this.renderer.updateTerritory(other.id, other.territory.polygons, other.color);
            }
          }

          p.trail = [];
          p.isTrailing = false;
          this.renderer.updateTerritory(p.id, p.territory.polygons, p.color);
          this.audio.territoryCaptured();
        }
      }
    }

    // Update visuals
    for (const p of this.players) {
      if (p.alive) {
        this.renderer.updateAvatar(p.id, p.position, this.gameTime, p.moveDir);
        this.renderer.updateTrail(p.id, p.trail, p.color);
      }
    }

    // Camera follows human player
    const human = this.players.find(p => p.isHuman);
    if (human) {
      this.renderer.updateCamera(human.position, dt);
    }

    // Throttled HUD update
    this.hudUpdateTimer += dt;
    if (this.hudUpdateTimer >= 0.1) {
      this.hudUpdateTimer = 0;
      this.hud.update(this.players);

      // Gold ring for the leader
      let leaderId = -1;
      let bestArea = -1;
      for (const p of this.players) {
        if (!p.alive) continue;
        const area = p.territory.computeArea();
        if (area > bestArea) { bestArea = area; leaderId = p.id; }
      }
      if (leaderId !== this.currentLeaderId) {
        // Reset previous leader's ring to their own color
        if (this.currentLeaderId >= 0) {
          this.renderer.setRingColor(this.currentLeaderId, PLAYER_COLORS[this.currentLeaderId]);
        }
        // Set new leader's ring to gold
        if (leaderId >= 0) {
          this.renderer.setRingColor(leaderId, 0xFFD700);
        }
        this.currentLeaderId = leaderId;
      }
    }

    // Check game over
    this.checkGameOver();
  }

  private killPlayer(player: PlayerState): void {
    player.alive = false;
    player.trail = [];
    player.isTrailing = false;

    this.particleSystem.spawnDeathBurst(player.position.x, player.position.z, player.color);
    this.renderer.cleanupPlayer(player.id);
    player.territory.clear();

    if (player.isHuman) this.audio.playerDeath();
    else this.audio.enemyDeath();
  }

  private checkGameOver(): void {
    const human = this.players.find(p => p.isHuman);
    if (!human) return;

    const alive = this.players.filter(p => p.alive);

    if (!human.alive || alive.length <= 1) {
      this.gameOver = true;

      // Crown the winner (last alive, or top territory holder)
      const winner = alive.length === 1 ? alive[0] : null;
      if (winner) this.renderer.showCrown(winner.id);

      const { pct, rank } = this.hud.getHumanScore(this.players);
      this.menu.showGameOver(
        `${pct}%`,
        `#${rank} of ${this.players.length}`,
        this.hud.getElapsedTime(),
      );
    }
  }

  private startRenderLoop(): void {
    this.lastFrameTime = performance.now() / 1000;

    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - this.lastFrameTime, 0.05); // cap at 50ms
      this.lastFrameTime = now;
      this.gameTime += dt;

      if (this.running) {
        this.updateGame(dt);
      }

      this.particleSystem.update(dt);
      this.renderer.render();
    };

    loop();
  }
}
