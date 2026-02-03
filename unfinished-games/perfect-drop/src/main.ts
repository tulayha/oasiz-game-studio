// ============================================================================
// PERFECT DROP - PROFESSIONAL EDITION
// A precision timing game with advanced game feel and polish
// ============================================================================

// Types & Interfaces
interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
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
  rotation: number;
  rotationSpeed: number;
  shape: "circle" | "square" | "triangle";
}

interface PowerUp {
  type: "slowmo" | "shield" | "double" | "expand" | "magnet" | "life";
  x: number;
  y: number;
  active: boolean;
  collected: boolean;
  rotation: number;
  pulsePhase: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  icon: string;
  reward: number;
}

interface Trail {
  x: number;
  y: number;
  alpha: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  twinkle: number;
  brightness: number;
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

type GameState = "START" | "PLAYING" | "GAMEOVER" | "PAUSED";

// ============================================================================
// GAME CLASS
// ============================================================================

class PerfectDropGame {
  // Canvas & Context
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w: number = 0;
  private h: number = 0;
  private isMobile: boolean;
  private pixelRatio: number = window.devicePixelRatio || 1;

  // Game State
  private gameState: GameState = "START";
  private score: number = 0;
  private settings: Settings;
  private isPaused: boolean = false;
  private lives: number = 3;
  private maxLives: number = 5;

  // Ball Physics
  private ballY: number = 0;
  private ballX: number = 0;
  private ballRadius: number = 20;
  private ballVelocity: number = 0;
  private ballGravity: number = 0.6;
  private isDropping: boolean = false;
  private ballRotation: number = 0;
  private ballRotationSpeed: number = 0;
  private previousBallY: number = 0;
  private dropResolved: boolean = false;

  // Target
  private targetY: number = 0;
  private targetWidth: number = 200;
  private targetMinWidth: number = 40;
  private targetShrinkRate: number = 0.5;
  private targetHeight: number = 20;
  private targetPulse: number = 0;

  // Oscillation
  private oscillationTime: number = 0;
  private oscillationSpeed: number = 2;
  private oscillationAmplitude: number = 100;

  // Difficulty
  private baseGravity: number = 0.5;
  private gravityIncrease: number = 0.02;
  private difficultyLevel: number = 1;

  // Difficulty Scaling
  private speedIncrease: number = 0.04;
  private minOscillSpeed: number = 1.5;

  // Visual Effects
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private flashAlpha: number = 0;
  private flashColor: string = "#ffffff";
  private shakeAmount: number = 0;
  private chromatic: number = 0;
  private timeScale: number = 1;

  // Combo System
  private combo: number = 0;
  private comboTimer: number = 0;
  private comboMaxTime: number = 60;
  private maxCombo: number = 0;

  // Power-ups
  private powerUps: PowerUp[] = [];
  private activePowerUp: string | null = null;
  private powerUpTimer: number = 0;
  private powerUpDuration: number = 180;
  private nextPowerUpScore: number = 100;
  private powerUpsCollected: number = 0;

  // Achievements & Stats
  private achievements: Achievement[] = [];
  private highScore: number = 0;
  private totalDrops: number = 0;
  private perfectHits: number = 0;
  private showAchievement: Achievement | null = null;
  private achievementTimer: number = 0;
  private coins: number = 0;
  private consecutiveHits: number = 0;
  private totalScore: number = 0;

  // Visual Enhancements
  private trails: Trail[] = [];
  private stars: Star[] = [];
  private backgroundHue: number = 260;
  private vignette: number = 0;

  // Audio
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Performance
  private lastFrameTime: number = 0;
  private fps: number = 60;
  private frameCount: number = 0;

  constructor() {
    console.log("[PerfectDrop] Initializing Professional Edition v2.0");

    this.canvas = document.getElementById("canvas") as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d", { alpha: true })!;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    this.settings = this.loadSettings();
    this.loadGameData();
    this.updateHighScoreDisplay();
    this.initAudio();
    this.initAchievements();
    this.initStars();
    this.setupCanvas();
    this.setupEventListeners();
    this.setupUI();

    this.lastFrameTime = performance.now();
    this.gameLoop(this.lastFrameTime);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private loadSettings(): Settings {
    const saved = localStorage.getItem("perfectDropSettings");
    return saved ? JSON.parse(saved) : { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    localStorage.setItem("perfectDropSettings", JSON.stringify(this.settings));
  }

  private loadGameData(): void {
    const saved = localStorage.getItem("perfectDropGameData");
    if (saved) {
      const data = JSON.parse(saved);
      // High score is not loaded from local storage as per platform rules
      this.totalDrops = data.totalDrops || 0;
      this.perfectHits = data.perfectHits || 0;
      this.coins = data.coins || 0;
      this.powerUpsCollected = data.powerUpsCollected || 0;
      this.totalScore = data.totalScore || 0;
      this.maxCombo = data.maxCombo || 0;
    }
  }

  private saveGameData(): void {
    const data = {
      // highScore: this.highScore, // Do not save high score locally
      totalDrops: this.totalDrops,
      perfectHits: this.perfectHits,
      coins: this.coins,
      powerUpsCollected: this.powerUpsCollected,
      totalScore: this.totalScore,
      maxCombo: this.maxCombo,
      achievements: this.achievements.filter(a => a.unlocked).map(a => a.id)
    };
    localStorage.setItem("perfectDropGameData", JSON.stringify(data));
  }

  private initAudio(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.masterGain.gain.value = 0.25;
    } catch (e) {
      console.warn("Audio not supported");
    }
  }

  private playSound(frequency: number, duration: number, type: OscillatorType = "sine", volume: number = 0.3): void {
    if (!this.settings.fx || !this.audioContext || !this.masterGain) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.masterGain);

      oscillator.type = type;
      oscillator.frequency.value = frequency;

      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      // Silently fail
    }
  }

  private playChord(frequencies: number[], duration: number): void {
    frequencies.forEach((freq, i) => {
      setTimeout(() => this.playSound(freq, duration, "sine", 0.15), i * 50);
    });
  }

  private initAchievements(): void {
    this.achievements = [
      { id: "first_drop", name: "First Drop", description: "Complete your first drop", unlocked: false, icon: "TARGET", reward: 10 },
      { id: "perfect_10", name: "Perfectionist", description: "Land 10 perfect hits", unlocked: false, icon: "STAR", reward: 50 },
      { id: "perfect_50", name: "Master", description: "Land 50 perfect hits", unlocked: false, icon: "STAR_FILLED", reward: 100 },
      { id: "perfect_100", name: "Grandmaster", description: "Land 100 perfect hits", unlocked: false, icon: "CROWN", reward: 200 },
      { id: "combo_5", name: "Combo Master", description: "Reach a 5x combo", unlocked: false, icon: "FLAME", reward: 50 },
      { id: "combo_10", name: "Combo King", description: "Reach a 10x combo", unlocked: false, icon: "CROWN", reward: 150 },
      { id: "combo_20", name: "Combo God", description: "Reach a 20x combo", unlocked: false, icon: "LIGHTNING", reward: 300 },
      { id: "score_500", name: "High Scorer", description: "Score 500 points", unlocked: false, icon: "TROPHY", reward: 50 },
      { id: "score_1000", name: "Legend", description: "Score 1000 points", unlocked: false, icon: "DIAMOND", reward: 100 },
      { id: "score_2500", name: "Unstoppable", description: "Score 2500 points", unlocked: false, icon: "ROCKET", reward: 250 },
      { id: "score_5000", name: "Immortal", description: "Score 5000 points", unlocked: false, icon: "STAR", reward: 500 },
      { id: "drops_50", name: "Dedicated", description: "Complete 50 drops", unlocked: false, icon: "MUSCLE", reward: 50 },
      { id: "drops_100", name: "Committed", description: "Complete 100 drops", unlocked: false, icon: "MEDAL", reward: 100 },
      { id: "drops_500", name: "Veteran", description: "Complete 500 drops", unlocked: false, icon: "MEDAL_GOLD", reward: 250 },
      { id: "powerup_10", name: "Power Player", description: "Collect 10 power-ups", unlocked: false, icon: "LIGHTNING", reward: 50 },
      { id: "powerup_50", name: "Power Master", description: "Collect 50 power-ups", unlocked: false, icon: "BATTERY", reward: 150 },
      { id: "no_miss_10", name: "Flawless", description: "Land 10 in a row", unlocked: false, icon: "SPARKLE", reward: 100 },
      { id: "no_miss_25", name: "Perfect Run", description: "Land 25 in a row", unlocked: false, icon: "RAINBOW", reward: 250 },
      { id: "rich", name: "Wealthy", description: "Earn 1000 coins", unlocked: false, icon: "COIN", reward: 100 },
      { id: "millionaire", name: "Millionaire", description: "Earn 10000 total score", unlocked: false, icon: "CASH", reward: 500 }
    ];

    const saved = localStorage.getItem("perfectDropGameData");
    if (saved) {
      const data = JSON.parse(saved);
      if (data.achievements) {
        data.achievements.forEach((id: string) => {
          const achievement = this.achievements.find(a => a.id === id);
          if (achievement) achievement.unlocked = true;
        });
      }
    }
  }

  private initStars(): void {
    this.stars = [];
    for (let i = 0; i < 150; i++) {
      this.stars.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        size: Math.random() * 2.5 + 0.5,
        speed: Math.random() * 0.8 + 0.3,
        twinkle: Math.random() * Math.PI * 2,
        brightness: Math.random() * 0.5 + 0.5
      });
    }
  }

  private checkAchievements(): void {
    const checks = [
      { id: "first_drop", condition: this.totalDrops >= 1 },
      { id: "perfect_10", condition: this.perfectHits >= 10 },
      { id: "perfect_50", condition: this.perfectHits >= 50 },
      { id: "perfect_100", condition: this.perfectHits >= 100 },
      { id: "combo_5", condition: this.combo >= 5 },
      { id: "combo_10", condition: this.combo >= 10 },
      { id: "combo_20", condition: this.combo >= 20 },
      { id: "score_500", condition: this.score >= 500 },
      { id: "score_1000", condition: this.score >= 1000 },
      { id: "score_2500", condition: this.score >= 2500 },
      { id: "score_5000", condition: this.score >= 5000 },
      { id: "drops_50", condition: this.totalDrops >= 50 },
      { id: "drops_100", condition: this.totalDrops >= 100 },
      { id: "drops_500", condition: this.totalDrops >= 500 },
      { id: "powerup_10", condition: this.powerUpsCollected >= 10 },
      { id: "powerup_50", condition: this.powerUpsCollected >= 50 },
      { id: "no_miss_10", condition: this.consecutiveHits >= 10 },
      { id: "no_miss_25", condition: this.consecutiveHits >= 25 },
      { id: "rich", condition: this.coins >= 1000 },
      { id: "millionaire", condition: this.totalScore >= 10000 }
    ];

    checks.forEach(check => {
      const achievement = this.achievements.find(a => a.id === check.id);
      if (achievement && !achievement.unlocked && check.condition) {
        achievement.unlocked = true;
        this.showAchievement = achievement;
        this.achievementTimer = 240;
        this.coins += achievement.reward;
        this.playChord([523, 659, 784], 0.3);
        this.saveGameData();
        this.chromatic = 0.5;
      }
    });
  }

  private setupCanvas(): void {
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.pixelRatio;
    this.canvas.height = this.h * this.pixelRatio;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.scale(this.pixelRatio, this.pixelRatio);

    this.ballX = this.w / 2;
    this.targetY = this.h * 0.75;

    if (!this.isDropping) {
      this.ballY = this.h * 0.2;
    }

    if (this.stars.length === 0) {
      this.initStars();
    }
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this.handleTap();
    });

    this.canvas.addEventListener("click", () => {
      this.handleTap();
    });

    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        this.handleTap();
      } else if (e.code === "Escape" && this.gameState === "PLAYING") {
        this.togglePause();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.gameState === "PLAYING") {
        this.togglePause();
      }
    });
  }

  private handleTap(): void {
    if (this.gameState === "START") {
      this.startGame();
    } else if (this.gameState === "PLAYING" && !this.isPaused) {
      this.dropBall();
    } else if (this.gameState === "GAMEOVER") {
      this.restartGame();
    } else if (this.gameState === "PAUSED") {
      this.togglePause();
    }
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.gameState = "PAUSED";
    } else {
      this.gameState = "PLAYING";
    }
  }

  private setupUI(): void {
    const startBtn = document.getElementById("start-btn");
    const restartBtn = document.getElementById("restart-btn");
    const settingsBtn = document.getElementById("settings-btn");
    const closeSettings = document.getElementById("close-settings");
    const toggleMusic = document.getElementById("toggle-music");
    const toggleFx = document.getElementById("toggle-fx");
    const toggleHaptics = document.getElementById("toggle-haptics");
    const homeBtn = document.getElementById("home-btn"); // New home button

    if (startBtn) {
      startBtn.addEventListener("click", () => {
        this.triggerHaptic("light");
        this.playSound(440, 0.1);
        this.startGame();
      });
    }

    if (restartBtn) {
      restartBtn.addEventListener("click", () => {
        this.triggerHaptic("light");
        this.playSound(440, 0.1);
        this.restartGame();
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        this.triggerHaptic("light");
        this.playSound(440, 0.1);
        this.openSettings();
      });
    }

    if (closeSettings) {
      closeSettings.addEventListener("click", () => {
        this.triggerHaptic("light");
        this.playSound(440, 0.1);
        this.closeSettings();
      });
    }

    if (toggleMusic) {
      toggleMusic.addEventListener("click", () => {
        this.settings.music = !this.settings.music;
        toggleMusic.classList.toggle("active", this.settings.music);
        this.saveSettings();
        this.triggerHaptic("light");
        this.playSound(440, 0.1);
      });
      toggleMusic.classList.toggle("active", this.settings.music);
    }

    if (toggleFx) {
      toggleFx.addEventListener("click", () => {
        this.settings.fx = !this.settings.fx;
        toggleFx.classList.toggle("active", this.settings.fx);
        this.saveSettings();
        this.triggerHaptic("light");
        if (this.settings.fx) this.playSound(440, 0.1);
      });
      toggleFx.classList.toggle("active", this.settings.fx);
    }

    if (toggleHaptics) {
      toggleHaptics.addEventListener("click", () => {
        this.settings.haptics = !this.settings.haptics;
        toggleHaptics.classList.toggle("active", this.settings.haptics);
        this.saveSettings();
        this.triggerHaptic("light");
        this.playSound(440, 0.1);
      });
      toggleHaptics.classList.toggle("active", this.settings.haptics);
    }

    if (homeBtn) {
      homeBtn.addEventListener("click", () => {
        window.location.reload();
      });
    }
  }

  // ============================================================================
  // GAME FLOW
  // ============================================================================

  private startGame(): void {
    console.log("[PerfectDrop] Starting game");

    const startScreen = document.getElementById("start-screen");
    const hud = document.getElementById("hud");
    const settingsBtn = document.getElementById("settings-btn");

    if (startScreen) startScreen.classList.add("hidden");
    if (hud) hud.classList.remove("hidden");
    if (settingsBtn) settingsBtn.classList.remove("hidden");

    this.gameState = "PLAYING";
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.isDropping = false;
    this.ballVelocity = 0;
    this.ballGravity = this.baseGravity;
    this.targetWidth = 250; // Start wider for "easy" mode
    this.oscillationSpeed = this.minOscillSpeed; // Start slower
    this.oscillationTime = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.powerUps = [];
    this.activePowerUp = null;
    this.powerUpTimer = 0;
    this.nextPowerUpScore = 150; // Delay first powerup slightly
    this.trails = [];
    this.backgroundHue = 260;
    this.consecutiveHits = 0;
    this.difficultyLevel = 1;
    this.ballRotation = 0;
    this.ballRotationSpeed = 0;
    this.isPaused = false;
    this.timeScale = 1;
    this.lives = 3;

    this.ballX = this.w / 2;
    this.ballY = this.h * 0.2;
    this.previousBallY = this.ballY;
    this.dropResolved = false;

    this.updateScoreDisplay();
    this.updateHighScoreDisplay();
    this.playChord([262, 330, 392], 0.2);
  }

  private restartGame(): void {
    const gameoverScreen = document.getElementById("gameover-screen");
    if (gameoverScreen) gameoverScreen.classList.add("hidden");
    this.startGame();
  }

  private openSettings(): void {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.classList.remove("hidden");
  }

  private closeSettings(): void {
    const modal = document.getElementById("settings-modal");
    if (modal) modal.classList.add("hidden");
  }

  private dropBall(): void {
    if (this.isDropping || this.isPaused) return;

    this.isDropping = true;
    this.ballVelocity = 0;
    this.ballRotationSpeed = 0.2;
    this.totalDrops++;
    this.triggerHaptic("light");
    this.playSound(400, 0.1, "sine", 0.2);
    this.dropResolved = false;
  }

  private checkLanding(): void {
    if (this.dropResolved) return;

    const ballBottom = this.ballY + this.ballRadius;
    const prevBallBottom = this.previousBallY + this.ballRadius;

    // Check if ball crossed the target surface (swept collision)
    // We check if it was above in previous frame and below/on in current frame
    if (prevBallBottom < this.targetY && ballBottom >= this.targetY) {
      const ballLeft = this.ballX - this.ballRadius;
      const ballRight = this.ballX + this.ballRadius;
      const targetLeft = this.w / 2 - this.targetWidth / 2;
      const targetRight = this.w / 2 + this.targetWidth / 2;

      // Allow a small margin of error (2px) to be forgiving
      if (ballRight >= targetLeft + 2 && ballLeft <= targetRight - 2) {
        this.handleSuccessfulLanding();
      } else {
        this.handleMiss();
      }
    }
    // Failsafe: if we somehow missed the sweep (e.g. extremely low FPS), 
    // or if the ball was already below target when logic started
    else if (ballBottom > this.h) {
      this.handleMiss();
    }
  }

  private handleSuccessfulLanding(): void {
    this.dropResolved = true;
    const centerX = this.w / 2;
    const distance = Math.abs(this.ballX - centerX);
    const perfectThreshold = this.targetWidth * 0.15;
    const isPerfect = distance < perfectThreshold;

    let points = 10;
    let multiplier = 1;

    if (isPerfect) {
      points = 50;
      this.combo++;
      this.comboTimer = this.comboMaxTime;
      this.flashColor = "#ffd700";
      this.triggerHaptic("success");
      this.perfectHits++;
      this.consecutiveHits++;
      this.playChord([800, 1000, 1200], 0.15);
      this.addFloatingText("PERFECT!", this.ballX, this.ballY, "#ffd700", 32);
      this.chromatic = 0.3;

      // Gain life every 5 perfect hits (max 5 lives)
      if (this.perfectHits % 5 === 0 && this.lives < this.maxLives) {
        this.lives++;
        this.addFloatingText("+1 LIFE!", this.w / 2, this.h * 0.3, "#00ff88", 28);
        this.playChord([1000, 1200, 1400], 0.2);
      }
    } else {
      points = 20;
      this.combo = 0;
      this.flashColor = "#4ade80";
      this.triggerHaptic("medium");
      this.consecutiveHits++;
      this.playSound(600, 0.15);
      this.addFloatingText("GOOD", this.ballX, this.ballY, "#4ade80", 24);
    }

    if (this.combo > 1) {
      multiplier = 1 + (this.combo * 0.5);
      points = Math.floor(points * multiplier);
      this.addFloatingText(`${this.combo}x COMBO`, this.w / 2, this.h * 0.15, "#ffd700", 28);
    }

    if (this.activePowerUp === "double") {
      points *= 2;
      this.addFloatingText("×2", this.ballX + 30, this.ballY, "#ff00ff", 20);
    }

    this.score += points;
    this.totalScore += points;
    this.addFloatingText(`+${points}`, this.ballX, this.ballY - 30, "#ffffff", 20);

    if (this.score > this.highScore) {
      this.highScore = this.score;
    }

    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    this.updateScoreDisplay();
    this.updateHighScoreDisplay();
    this.checkAchievements();

    this.flashAlpha = isPerfect ? 0.5 : 0.3;
    this.shakeAmount = isPerfect ? 10 : 5;
    this.spawnParticles(this.ballX, this.ballY + this.ballRadius, isPerfect ? 40 : 20, isPerfect);

    this.backgroundHue = (this.backgroundHue + (isPerfect ? 25 : 12)) % 360;
    this.targetPulse = 1;

    if (this.score >= this.nextPowerUpScore && this.powerUps.length === 0) {
      this.spawnPowerUp();
      this.nextPowerUpScore += 150;
    }

    if (this.activePowerUp !== "shield") {
      // Dynamic Difficulty Progression

      // 1. Gravity (Drop speed)
      this.ballGravity += this.gravityIncrease;

      // 2. Target Size (Precision) - Shrink faster based on combo
      const shrinkAmount = this.combo > 5 ? 3.0 : 2.0;
      this.targetWidth = Math.max(this.targetMinWidth, this.targetWidth - shrinkAmount);

      // 3. Speed (Oscillation) - Gets faster
      this.oscillationSpeed += this.speedIncrease;

      // Calculate level based on combined difficulty metrics
      this.difficultyLevel = Math.floor(this.score / 200) + 1;
    }

    this.resetBall();
    this.saveGameData();
  }

  private handleMiss(): void {
    this.dropResolved = true;
    this.lives--;
    this.triggerHaptic("error");
    this.flashColor = "#ef4444";
    this.flashAlpha = 0.7;
    this.shakeAmount = 15;
    this.playSound(200, 0.4, "sawtooth", 0.4);
    this.consecutiveHits = 0;
    this.vignette = 0.5;
    this.combo = 0;

    this.spawnParticles(this.ballX, this.ballY, 30, false);
    this.addFloatingText("MISS!", this.ballX, this.ballY, "#ef4444", 36);
    this.addFloatingText(`${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, this.w / 2, this.h / 2, "#ff6b6b", 28);

    if (this.lives <= 0) {
      setTimeout(() => {
        this.gameOver();
      }, 600);
    } else {
      // Reset ball but continue playing
      setTimeout(() => {
        this.resetBall();
      }, 800);
    }
  }

  private resetBall(): void {
    this.isDropping = false;
    this.ballVelocity = 0;
    this.ballY = this.h * 0.2;
    this.ballX = this.w / 2;
    this.oscillationTime = 0;
    this.trails = [];
    this.ballRotation = 0;
    this.ballRotationSpeed = 0;
  }

  private gameOver(): void {
    this.gameState = "GAMEOVER";

    const coinsEarned = Math.floor(this.score / 10) + (this.combo > 5 ? 20 : 0);
    this.coins += coinsEarned;
    this.saveGameData();

    const hud = document.getElementById("hud");
    const settingsBtn = document.getElementById("settings-btn");
    const finalScore = document.getElementById("final-score");
    const coinsEarnedEl = document.getElementById("coins-earned");
    const highScoreEl = document.getElementById("gameover-highscore");
    const comboEl = document.getElementById("gameover-combo");
    const gameoverScreen = document.getElementById("gameover-screen");

    if (hud) hud.classList.add("hidden");
    if (settingsBtn) settingsBtn.classList.add("hidden");
    if (finalScore) finalScore.textContent = this.score.toString();
    if (coinsEarnedEl) coinsEarnedEl.textContent = `+${coinsEarned} 💰`;
    if (highScoreEl) highScoreEl.textContent = `Best: ${this.highScore}`;
    if (comboEl) comboEl.textContent = `Max Combo: ${this.combo}x`;
    if (gameoverScreen) gameoverScreen.classList.remove("hidden");

    this.submitScore();
    this.playChord([392, 330, 262], 0.3);
  }

  private submitScore(): void {
    if (typeof (window as any).submitScore === "function") {
      (window as any).submitScore(this.score);
    }
  }

  private triggerHaptic(type: string): void {
    if (this.settings.haptics && typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }

  private addFloatingText(text: string, x: number, y: number, color: string, size: number): void {
    this.floatingTexts.push({
      text,
      x,
      y,
      vy: -2,
      life: 1,
      color,
      size
    });
  }

  // ============================================================================
  // POWER-UPS
  // ============================================================================

  private spawnPowerUp(): void {
    const types: Array<"slowmo" | "shield" | "double" | "expand" | "magnet" | "life"> =
      ["slowmo", "shield", "double", "expand", "magnet", "life"];
    const type = types[Math.floor(Math.random() * types.length)];

    this.powerUps.push({
      type,
      x: this.w / 2,
      y: this.h * 0.5,
      active: true,
      collected: false,
      rotation: 0,
      pulsePhase: 0
    });
  }

  private checkPowerUpCollection(): void {
    for (const powerUp of this.powerUps) {
      if (!powerUp.active || powerUp.collected) continue;

      const dist = Math.hypot(this.ballX - powerUp.x, this.ballY - powerUp.y);
      const collectRadius = this.activePowerUp === "magnet" ? 80 : 30;

      if (dist < collectRadius) {
        powerUp.collected = true;
        powerUp.active = false;
        this.activatePowerUp(powerUp.type);
        this.spawnParticles(powerUp.x, powerUp.y, 25, true);
        this.playChord([1200, 1400, 1600], 0.2);
        this.triggerHaptic("success");
        this.powerUpsCollected++;
        this.addFloatingText(this.getPowerUpName(powerUp.type), powerUp.x, powerUp.y - 30, this.getPowerUpColor(powerUp.type), 20);
        this.checkAchievements();
      }
    }
  }

  private activatePowerUp(type: string): void {
    this.activePowerUp = type;
    this.powerUpTimer = this.powerUpDuration;

    switch (type) {
      case "slowmo":
        this.timeScale = 0.5;
        break;
      case "shield":
        break;
      case "double":
        break;
      case "expand":
        this.targetWidth = Math.min(300, this.targetWidth + 60);
        break;
      case "magnet":
        break;
      case "life":
        if (this.lives < this.maxLives) {
          this.lives++;
          this.addFloatingText("+1 LIFE!", this.w / 2, this.h * 0.3, "#00ff88", 32);
        }
        this.activePowerUp = null;
        this.powerUpTimer = 0;
        break;
    }
  }

  private getPowerUpColor(type: string): string {
    const colors: Record<string, string> = {
      slowmo: "#00d4ff",
      shield: "#ffd700",
      double: "#ff00ff",
      expand: "#00ff88",
      magnet: "#ff6b6b",
      life: "#ff69b4"
    };
    return colors[type] || "#ffffff";
  }

  private getPowerUpSymbol(type: string): string {
    const symbols: Record<string, string> = {
      slowmo: "SLOW",
      shield: "PROT",
      double: "2X",
      expand: "WIDE",
      magnet: "MAG",
      life: "1UP"
    };
    return symbols[type] || "?";
  }

  private getPowerUpName(type: string): string {
    const names: Record<string, string> = {
      slowmo: "SLOW MOTION",
      shield: "SHIELD",
      double: "DOUBLE POINTS",
      expand: "EXPAND",
      magnet: "MAGNET",
      life: "EXTRA LIFE"
    };
    return names[type] || "";
  }

  // ============================================================================
  // PARTICLES & EFFECTS
  // ============================================================================

  private spawnParticles(x: number, y: number, count: number, isPerfect: boolean): void {
    const colors = isPerfect
      ? ["#ffd700", "#ffed4e", "#ffa500", "#ff6b6b"]
      : ["#4ade80", "#22c55e", "#16a34a", "#10b981"];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 3 + Math.random() * 5;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        life: 1,
        maxLife: 0.6 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 5,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        shape: Math.random() > 0.6 ? "square" : (Math.random() > 0.5 ? "triangle" : "circle")
      });
    }
  }

  private updateScoreDisplay(): void {
    const scoreEl = document.getElementById("score-display");
    if (scoreEl) scoreEl.textContent = this.score.toString();
  }

  private updateHighScoreDisplay(): void {
    const highScoreEl = document.getElementById("high-score-display");
    if (highScoreEl) highScoreEl.textContent = `Best: ${this.highScore}`;
  }

  // ============================================================================
  // UPDATE LOOP
  // ============================================================================

  private update(deltaTime: number): void {
    if (this.gameState !== "PLAYING" || this.isPaused) return;

    const dt = deltaTime * this.timeScale;

    // Update stars
    for (const star of this.stars) {
      star.y += star.speed * dt;
      star.twinkle += 0.05 * dt;
      if (star.y > this.h) {
        star.y = 0;
        star.x = Math.random() * this.w;
      }
    }

    // Update combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
      }
    }

    // Update power-up timer
    if (this.powerUpTimer > 0) {
      this.powerUpTimer -= dt;
      if (this.powerUpTimer <= 0) {
        this.activePowerUp = null;
        this.timeScale = 1;
      }
    }

    // Update achievement display
    if (this.achievementTimer > 0) {
      this.achievementTimer -= dt;
      if (this.achievementTimer <= 0) {
        this.showAchievement = null;
      }
    }

    // Update power-ups
    for (const powerUp of this.powerUps) {
      if (powerUp.active) {
        powerUp.rotation += 0.05 * dt;
        powerUp.pulsePhase += 0.1 * dt;
      }
    }

    // Update ball
    if (this.isDropping) {
      if (this.trails.length < 25) {
        this.trails.push({
          x: this.ballX,
          y: this.ballY,
          alpha: 1,
          size: this.ballRadius
        });
      }

      const gravity = this.ballGravity * dt;
      this.ballVelocity += gravity;
      this.previousBallY = this.ballY;
      this.ballY += this.ballVelocity * dt;
      this.ballRotation += this.ballRotationSpeed * dt;
      this.checkLanding();
      this.checkPowerUpCollection();
    } else {
      this.oscillationTime += 0.016 * dt;
      const offset = Math.sin(this.oscillationTime * this.oscillationSpeed) * this.oscillationAmplitude;
      this.ballX = this.w / 2 + offset;
    }

    // Update trails
    for (let i = this.trails.length - 1; i >= 0; i--) {
      this.trails[i].alpha -= 0.04 * dt;
      this.trails[i].size *= 0.98;
      if (this.trails[i].alpha <= 0) {
        this.trails.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.4 * dt;
      p.rotation += p.rotationSpeed * dt;
      p.life -= (0.016 / p.maxLife) * dt;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.life -= 0.015 * dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Update effects
    if (this.flashAlpha > 0) {
      this.flashAlpha -= 0.025 * dt;
    }

    if (this.shakeAmount > 0) {
      this.shakeAmount *= Math.pow(0.9, dt);
      if (this.shakeAmount < 0.1) this.shakeAmount = 0;
    }

    if (this.chromatic > 0) {
      this.chromatic -= 0.02 * dt;
    }

    if (this.vignette > 0) {
      this.vignette -= 0.02 * dt;
    }

    if (this.targetPulse > 0) {
      this.targetPulse -= 0.05 * dt;
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  private draw(): void {
    const time = Date.now() / 50;
    const shakeX = this.shakeAmount > 0 ? Math.sin(time * 14.5) * this.shakeAmount : 0;
    const shakeY = this.shakeAmount > 0 ? Math.cos(time * 12.2) * this.shakeAmount : 0;

    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);

    this.ctx.clearRect(0, 0, this.w, this.h);

    // Update CSS background hue for the blob animation
    const bgAnim = document.querySelector('.bg-animation') as HTMLElement;
    if (bgAnim) {
      bgAnim.style.filter = `hue-rotate(${this.backgroundHue - 260}deg)`;
    }

    // Draw minimalist grid background
    this.drawGrid();

    // Draw stars with twinkling
    for (const star of this.stars) {
      const alpha = (0.3 + Math.sin(star.twinkle) * 0.4) * star.brightness;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    if (this.gameState === "PLAYING") {
      this.drawTarget();
      this.drawTrails();
      this.drawBall();
      this.drawPowerUps();
      this.drawParticles();
      this.drawFloatingTexts();
      this.drawCombo();
      this.drawPowerUpIndicator();
      this.drawAchievement();
      this.drawDifficultyIndicator();
      this.drawLives();

      // Flash overlay
      if (this.flashAlpha > 0) {
        this.ctx.fillStyle = this.flashColor;
        this.ctx.globalAlpha = this.flashAlpha;
        this.ctx.fillRect(0, 0, this.w, this.h);
        this.ctx.globalAlpha = 1;
      }

      // Vignette effect
      if (this.vignette > 0) {
        const vignetteGradient = this.ctx.createRadialGradient(
          this.w / 2, this.h / 2, this.h * 0.3,
          this.w / 2, this.h / 2, this.h * 0.8
        );
        vignetteGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignetteGradient.addColorStop(1, `rgba(0, 0, 0, ${this.vignette})`);
        this.ctx.fillStyle = vignetteGradient;
        this.ctx.fillRect(0, 0, this.w, this.h);
      }
    }

    if (this.isPaused) {
      this.drawPauseScreen();
    }

    this.ctx.restore();
  }

  private drawGrid(): void {
    const gridSize = 40;
    const time = Date.now() / 1000;
    const offsetY = (time * 20) % gridSize;

    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    this.ctx.lineWidth = 1;

    // Vertical lines
    for (let x = 0; x <= this.w; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.h);
      this.ctx.stroke();
    }

    // Horizontal lines (moving)
    for (let y = offsetY; y <= this.h; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.w, y);
      this.ctx.stroke();
    }
  }

  private drawTarget(): void {
    const centerX = this.w / 2;
    const pulse = 1 + this.targetPulse * 0.15;
    const currentWidth = this.targetWidth * pulse;
    const height = this.targetHeight;

    this.ctx.save();

    // Glow effect
    this.ctx.shadowColor = "#6366f1";
    this.ctx.shadowBlur = 20 + this.targetPulse * 20;

    // Platform base (Holographic)
    const gradient = this.ctx.createLinearGradient(0, this.targetY, 0, this.targetY + height);
    gradient.addColorStop(0, "rgba(99, 102, 241, 0.8)");
    gradient.addColorStop(0.5, "rgba(99, 102, 241, 0.4)");
    gradient.addColorStop(1, "rgba(99, 102, 241, 0.1)");

    this.ctx.fillStyle = gradient;

    // Draw rounded rectangle manually for broader compat or just fillRect
    // Using a path for a tech-look
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - currentWidth / 2, this.targetY);
    this.ctx.lineTo(centerX + currentWidth / 2, this.targetY);
    this.ctx.lineTo(centerX + currentWidth / 2 - 10, this.targetY + height);
    this.ctx.lineTo(centerX - currentWidth / 2 + 10, this.targetY + height);
    this.ctx.closePath();
    this.ctx.fill();

    // Top laser line
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - currentWidth / 2, this.targetY);
    this.ctx.lineTo(centerX + currentWidth / 2, this.targetY);
    this.ctx.stroke();

    // Perfect Zone Marker
    const perfectZone = currentWidth * 0.15;
    this.ctx.shadowColor = "#ffd700";
    this.ctx.shadowBlur = 15;
    this.ctx.fillStyle = "rgba(255, 215, 0, 0.5)";
    this.ctx.fillRect(centerX - perfectZone / 2, this.targetY, perfectZone, 4);

    this.ctx.restore();
  }

  private drawBall(): void {
    this.ctx.save();
    this.ctx.translate(this.ballX, this.ballY);
    this.ctx.rotate(this.ballRotation);

    // Glow
    this.ctx.shadowColor = this.isDropping ? "#d946ef" : "#6366f1";
    this.ctx.shadowBlur = 25;

    // Core
    const gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, this.ballRadius);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.5, this.isDropping ? "#f0abfc" : "#a5b4fc");
    gradient.addColorStop(1, this.isDropping ? "#d946ef" : "#6366f1");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.ballRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Rim
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.ballRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Inner Detail (Icon-like)
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    this.ctx.beginPath();
    this.ctx.arc(-5, -5, 4, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawTrails(): void {
    for (const trail of this.trails) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${trail.alpha * 0.4})`;
      this.ctx.beginPath();
      this.ctx.arc(trail.x, trail.y, trail.size * 0.7, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawPowerUps(): void {
    for (const powerUp of this.powerUps) {
      if (!powerUp.active) continue;

      const pulse = 1 + Math.sin(powerUp.pulsePhase) * 0.15;

      this.ctx.save();
      this.ctx.translate(powerUp.x, powerUp.y);
      this.ctx.rotate(powerUp.rotation);
      this.ctx.scale(pulse, pulse);

      // Outer glow
      this.ctx.shadowColor = this.getPowerUpColor(powerUp.type);
      this.ctx.shadowBlur = 30;

      // Star shape
      this.ctx.fillStyle = this.getPowerUpColor(powerUp.type);
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 3;

      this.ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const x = Math.cos(angle) * 28;
        const y = Math.sin(angle) * 28;
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Symbol
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = "bold 22px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(this.getPowerUpSymbol(powerUp.type), 0, 0);

      this.ctx.restore();
    }
  }

  private drawParticles(): void {
    for (const p of this.particles) {
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;

      if (p.shape === "square") {
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else if (p.shape === "triangle") {
        this.ctx.beginPath();
        this.ctx.moveTo(0, -p.size / 2);
        this.ctx.lineTo(p.size / 2, p.size / 2);
        this.ctx.lineTo(-p.size / 2, p.size / 2);
        this.ctx.closePath();
        this.ctx.fill();
      } else { // Default to circle if shape is not specified or unknown
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    }
    this.ctx.globalAlpha = 1;
  }

  private drawFloatingTexts(): void {
    for (const ft of this.floatingTexts) {
      this.ctx.save();
      this.ctx.globalAlpha = ft.life;
      this.ctx.font = `bold ${ft.size}px sans-serif`;
      this.ctx.fillStyle = ft.color;
      this.ctx.strokeStyle = "#000000";
      this.ctx.lineWidth = 4;
      this.ctx.textAlign = "center";
      this.ctx.strokeText(ft.text, ft.x, ft.y);
      this.ctx.fillText(ft.text, ft.x, ft.y);
      this.ctx.restore();
    }
  }

  private drawCombo(): void {
    if (this.combo > 1) {
      const scale = 1 + Math.sin(Date.now() / 100) * 0.1;
      const comboText = `${this.combo}x COMBO!`;

      this.ctx.save();
      this.ctx.translate(this.w / 2, this.h * 0.12);
      this.ctx.scale(scale, scale);

      this.ctx.font = "bold 36px sans-serif";
      this.ctx.fillStyle = "#ffd700";
      this.ctx.strokeStyle = "#000000";
      this.ctx.lineWidth = 5;
      this.ctx.textAlign = "center";
      this.ctx.shadowColor = "#ffd700";
      this.ctx.shadowBlur = 20;
      this.ctx.strokeText(comboText, 0, 0);
      this.ctx.fillText(comboText, 0, 0);
      this.ctx.shadowBlur = 0;

      this.ctx.restore();
    }
  }

  private drawPowerUpIndicator(): void {
    if (!this.activePowerUp) return;

    const barWidth = 180;
    const barHeight = 12;
    const x = this.w / 2 - barWidth / 2;
    const y = this.h * 0.88;

    // Background
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(x - 2, y - 2, barWidth + 4, barHeight + 4);

    // Progress bar
    const progress = this.powerUpTimer / this.powerUpDuration;
    const gradient = this.ctx.createLinearGradient(x, y, x + barWidth, y);
    gradient.addColorStop(0, this.getPowerUpColor(this.activePowerUp));
    gradient.addColorStop(1, this.getPowerUpColor(this.activePowerUp) + "88");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x, y, barWidth * progress, barHeight);

    // Border
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, barWidth, barHeight);

    // Label
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 16px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.shadowColor = "#000000";
    this.ctx.shadowBlur = 5;
    this.ctx.fillText(this.getPowerUpName(this.activePowerUp), this.w / 2, y - 12);
    this.ctx.shadowBlur = 0;
  }

  private drawDifficultyIndicator(): void {
    const x = this.w - 100;
    const y = 60;

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    this.ctx.font = "bold 14px sans-serif";
    this.ctx.textAlign = "right";
    this.ctx.fillText(`Level ${this.difficultyLevel}`, x, y);

    // Difficulty bars
    for (let i = 0; i < 10; i++) {
      if (i < this.difficultyLevel) {
        this.ctx.fillStyle = `hsl(${120 - i * 12}, 70%, 50%)`;
      } else {
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      }
      this.ctx.fillRect(x - 80 + i * 8, y + 5, 6, 10);
    }
  }

  private drawLives(): void {
    const x = 20;
    const y = this.isMobile ? 180 : 100;

    this.ctx.font = "bold 16px sans-serif";
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    this.ctx.textAlign = "left";
    this.ctx.fillText("Lives:", x, y);

    // Draw hearts
    this.ctx.fillStyle = "#ff6b6b"; // Set fill style once

    for (let i = 0; i < this.maxLives; i++) {
      // Increased spacing: 20 (start) + ~70 (text width) + 15 (gap) + i * 30
      const heartX = x + 90 + i * 30;
      this.ctx.save();
      this.ctx.translate(heartX, y - 5);

      if (i < this.lives) {
        this.ctx.globalAlpha = 1;
        this.ctx.shadowColor = "#ff6b6b";
        this.ctx.shadowBlur = 10;
      } else {
        this.ctx.globalAlpha = 0.3;
        this.ctx.shadowBlur = 0;
      }

      // Draw heart path
      const size = 20;
      this.ctx.beginPath();
      this.ctx.moveTo(0, size * 0.3);
      this.ctx.bezierCurveTo(size * 0.3, -size * 0.3, size * 0.8, -size * 0.2, 0, size * 0.8);
      this.ctx.bezierCurveTo(-size * 0.8, -size * 0.2, -size * 0.3, -size * 0.3, 0, size * 0.3);
      this.ctx.fill();

      this.ctx.restore();
    }
    this.ctx.shadowBlur = 0;
  }

  private drawAchievement(): void {
    if (!this.showAchievement) return;

    const progress = this.achievementTimer / 240;
    const alpha = progress > 0.8 ? (1 - progress) / 0.2 : progress / 0.8;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;

    const boxWidth = 320;
    const boxHeight = 90;
    const x = this.w / 2 - boxWidth / 2;
    const y = 120;

    // Background with gradient
    const bgGradient = this.ctx.createLinearGradient(x, y, x, y + boxHeight);
    bgGradient.addColorStop(0, "rgba(0, 0, 0, 0.95)");
    bgGradient.addColorStop(1, "rgba(20, 20, 20, 0.95)");
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(x, y, boxWidth, boxHeight);

    // Border with glow
    this.ctx.strokeStyle = "#ffd700";
    this.ctx.lineWidth = 3;
    this.ctx.shadowColor = "#ffd700";
    this.ctx.shadowBlur = 15;
    this.ctx.strokeRect(x, y, boxWidth, boxHeight);
    this.ctx.shadowBlur = 0;

    // Icon
    this.ctx.font = "bold 24px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(this.showAchievement.icon, x + 50, y + boxHeight / 2);

    // Text
    this.ctx.fillStyle = "#ffd700";
    this.ctx.font = "bold 18px sans-serif";
    this.ctx.textAlign = "left";
    this.ctx.fillText("Achievement Unlocked!", x + 85, y + 25);

    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 16px sans-serif";
    this.ctx.fillText(this.showAchievement.name, x + 85, y + 48);

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    this.ctx.font = "13px sans-serif";
    this.ctx.fillText(this.showAchievement.description, x + 85, y + 68);

    // Reward
    this.ctx.fillStyle = "#ffd700";
    this.ctx.font = "bold 14px sans-serif";
    this.ctx.textAlign = "right";
    this.ctx.fillText(`+${this.showAchievement.reward} 💰`, x + boxWidth - 10, y + boxHeight - 15);

    this.ctx.restore();
  }

  private drawPauseScreen(): void {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(0, 0, this.w, this.h);

    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 48px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("PAUSED", this.w / 2, this.h / 2);

    this.ctx.font = "20px sans-serif";
    this.ctx.fillText("Press SPACE or tap to continue", this.w / 2, this.h / 2 + 50);
  }

  // ============================================================================
  // GAME LOOP
  // ============================================================================

  private gameLoop = (currentTime: number): void => {
    const deltaTime = Math.min((currentTime - this.lastFrameTime) / 16.67, 2);
    this.lastFrameTime = currentTime;

    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      this.fps = Math.round(1000 / ((currentTime - this.lastFrameTime) * 60));
    }

    this.update(deltaTime);
    this.draw();

    requestAnimationFrame(this.gameLoop);
  };
}

// ============================================================================
// INITIALIZE GAME
// ============================================================================

new PerfectDropGame();
