import * as Tone from "tone";

/**
 * PADDLE BOUNCE - A polished ping-pong arcade game
 *
 * Features:
 * - CSS-drawn hand-drawn style graphics (thick black borders)
 * - Touch drag and keyboard controls
 * - Difficulty scaling with speed ramp
 * - Satisfying animations and visual feedback
 * - Mobile and desktop support
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Colors (warm orange theme by default)
  BACKGROUND_COLORS: [
    { bg: "#F5A962", accent: "#E08B3D" }, // Orange
    { bg: "#9DB4A0", accent: "#7A9A7E" }, // Sage green
    { bg: "#E8D06B", accent: "#D4BC4F" }, // Yellow
    { bg: "#E88B8B", accent: "#D46B6B" }, // Coral
    { bg: "#8BB8E8", accent: "#6B9AD4" }, // Sky blue
  ],

  // Particles
  PARTICLE_COUNT: 8,
  PARTICLE_LIFE: 400,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= UTILITY FUNCTIONS =============
function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const gameContainer = document.getElementById("game-container")!;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const finalScore = document.getElementById("finalScore")!;
const startButton = document.getElementById("startButton")!;

// State
let gameState: GameState = "START";
let w = gameContainer.clientWidth;
let h = gameContainer.clientHeight;

// Score
let score = 0;

// Gameplay state
let indicatorPosition = 0; // Normalized 0.0 to 1.0
let indicatorSpeed = 0.003; // Pixels per frame (normalized)
let zoneWidth = 0.2; // Normalized width (20% of screen)
let baseZoneWidth = 0.2; // Starting zone width
let minZoneWidth = 0.05; // Minimum zone width (5%)
let zoneReductionAmount = 0.01; // Reduction per success (1%)
let perfectZoneStart = 0; // Calculated from zoneWidth
let perfectZoneEnd = 0; // Calculated from zoneWidth
let canTap = true;
let shotResolved = false;

// Basketball state
let ballX = 0;
let ballY = 0;
let ballProgress = 0; // 0 to 1
let ballActive = false;
let lastShotWasSuccess = false;
let pendingGameOver = false;
let ballStartX = 0;
let ballStartY = 0;
let ballTargetX = 0;
let ballTargetY = 0;
let ballAnimationDuration = 500; // ms
let ballAnimationStartTime = 0;

// Particles
let particles: Particle[] = [];

// Settings
let settings: Settings = {
  music: localStorage.getItem("paddleBounce_music") !== "false",
  fx: localStorage.getItem("paddleBounce_fx") !== "false",
  haptics: localStorage.getItem("paddleBounce_haptics") !== "false",
};

// Current color theme
let currentColorIndex = 0;
let bgColor = CONFIG.BACKGROUND_COLORS[0].bg;

// Audio
const bgMusic = new Audio("https://assets.oasiz.ai/audio/paddle_song.mp3");
bgMusic.loop = true;
bgMusic.preload = "auto";

// Tap sounds for paddle hits
const hitSynth = new Tone.Synth({
  oscillator: { type: "sine" },
  envelope: { attack: 0.001, decay: 0.01, sustain: 0, release: 0.01 },
}).toDestination();

function playHitSound(isCenterHit: boolean): void {
  if (!settings.fx) return;
  if (Tone.getContext().state !== "running") {
    Tone.start();
  }

  if (isCenterHit) {
    // Crisp "tap" for center
    hitSynth.triggerAttackRelease("F#6", "64n");
  } else {
    // Slightly lower, slightly softer "tap" for outer zones
    hitSynth.triggerAttackRelease("C6", "64n");
  }
}

// ============= DRAWING FUNCTIONS =============
function drawBackground(): void {
  // Gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, bgColor);
  gradient.addColorStop(1, darkenColor(bgColor, 20));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  
  // Simple court line (horizontal line below ball start position)
  const courtLineY = h * 0.9;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, courtLineY);
  ctx.lineTo(w, courtLineY);
  ctx.stroke();
}

function drawScore(): void {
  // Large score in center (watermark style)
  const scoreText = score.toString();
  const fontSize = Math.min(w * 0.35, 200);
  ctx.font = "700 " + fontSize + "px Fredoka";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = darkenColor(bgColor, 30);
  ctx.globalAlpha = 0.3;
  ctx.fillText(scoreText, w / 2, h * 0.38);

  // "SCORE" label below
  const labelSize = Math.min(w * 0.06, 24);
  ctx.font = "600 " + labelSize + "px Fredoka";
  ctx.fillText("SCORE", w / 2, h * 0.38 + fontSize * 0.45);
  ctx.globalAlpha = 1;
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, " + alpha + ")";
    ctx.fill();
  }
}

// ============= GAMEPLAY FUNCTIONS =============
function updateIndicator(dt: number): void {
  // Move indicator continuously from left to right
  indicatorPosition += indicatorSpeed * (dt / 16); // Normalize to 60fps

  // Loop back to start when reaching end
  if (indicatorPosition >= 1.0) {
    indicatorPosition = indicatorPosition - 1.0;
    shotResolved = false;
    canTap = true;
  }

  // Update perfect zone boundaries (centered horizontally)
  perfectZoneStart = 0.5 - zoneWidth / 2;
  perfectZoneEnd = 0.5 + zoneWidth / 2;
}

function drawPerfectZone(): void {
  const zoneY = h * 0.55;
  const zoneX = perfectZoneStart * w;
  const zoneWidthPx = (perfectZoneEnd - perfectZoneStart) * w;
  const zoneHeight = 8;

  // Draw zone background
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(zoneX, zoneY - zoneHeight / 2, zoneWidthPx, zoneHeight);

  // Draw zone border
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeRect(zoneX, zoneY - zoneHeight / 2, zoneWidthPx, zoneHeight);
}

const HOOP_SCALE = 1.4;
const RIM_RADIUS = 30 * HOOP_SCALE;
const BACKBOARD_W = 60 * HOOP_SCALE;
const BACKBOARD_H = 40 * HOOP_SCALE;
const BALL_RADIUS = 12 * HOOP_SCALE;
const NET_LENGTH = 40 * HOOP_SCALE;
const NET_CURVE = 8 * HOOP_SCALE;

function drawHoopBack(): void {
  const hoopY = h * 0.2;
  const hoopX = w / 2;

  ctx.fillStyle = "#fff";
  ctx.fillRect(hoopX - BACKBOARD_W / 2, hoopY - BACKBOARD_H, BACKBOARD_W, BACKBOARD_H);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeRect(hoopX - BACKBOARD_W / 2, hoopY - BACKBOARD_H, BACKBOARD_W, BACKBOARD_H);
}

function drawRimBack(): void {
  const hoopY = h * 0.2;
  const hoopX = w / 2;
  ctx.fillStyle = "#FF8C00";
  ctx.beginPath();
  ctx.arc(hoopX, hoopY, RIM_RADIUS, 0, Math.PI / 2, true);
  ctx.lineTo(hoopX, hoopY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hoopX, hoopY, RIM_RADIUS, 0, Math.PI / 2, true);
  ctx.stroke();
}

function drawRimFront(): void {
  const hoopY = h * 0.2;
  const hoopX = w / 2;
  ctx.fillStyle = "#FF8C00";
  ctx.beginPath();
  ctx.arc(hoopX, hoopY, RIM_RADIUS, Math.PI / 2, Math.PI, true);
  ctx.lineTo(hoopX, hoopY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hoopX, hoopY, RIM_RADIUS, Math.PI / 2, Math.PI, true);
  ctx.stroke();
}

function drawNetBack(sway: number): void {
  const hoopY = h * 0.2;
  const hoopX = w / 2;
  const netStringCount = 8;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < netStringCount; i++) {
    const angle = (Math.PI * i) / (netStringCount - 1);
    const startX = hoopX + Math.cos(angle) * RIM_RADIUS + sway;
    const startY = hoopY;
    const endX = startX + sway;
    const endY = startY + NET_LENGTH;
    const midX = startX + Math.cos(angle) * NET_CURVE;
    const midY = (startY + endY) / 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();
  }
}

function drawNetFront(sway: number): void {
  const hoopY = h * 0.2;
  const hoopX = w / 2;
  const netStringCount = 8;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 2;
  for (let i = 0; i < netStringCount; i++) {
    const angle = (Math.PI * i) / (netStringCount - 1);
    const startX = hoopX + Math.cos(angle) * RIM_RADIUS + sway;
    const startY = hoopY;
    const endX = startX + sway;
    const endY = startY + NET_LENGTH;
    const midX = startX + Math.cos(angle) * NET_CURVE;
    const midY = (startY + endY) / 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(midX, midY, endX, endY);
    ctx.stroke();
  }
}

function drawBasketball(): void {
  if (!ballActive) return;

  const r = BALL_RADIUS;
  const g = ctx.createRadialGradient(
    ballX - r * 0.3,
    ballY - r * 0.3,
    0,
    ballX,
    ballY,
    r,
  );
  g.addColorStop(0, "#FFB366");
  g.addColorStop(0.5, "#FF8C00");
  g.addColorStop(1, "#CC6600");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ballX, ballY, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ballX, ballY, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(ballX - r * 0.25, ballY - r * 0.25, r * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ballX, ballY, r * 0.85, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ballX, ballY, r * 0.85, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.stroke();
}

function drawIndicator(): void {
  // Draw indicator as a vertical line/bar (always visible, indicator never stops)
  const indicatorX = indicatorPosition * w;
  const indicatorY = h * 0.55;
  const indicatorWidth = 4;
  const indicatorHeight = 32;

  // Draw indicator
  ctx.fillStyle = "#fff";
  ctx.fillRect(
    indicatorX - indicatorWidth / 2,
    indicatorY - indicatorHeight / 2,
    indicatorWidth,
    indicatorHeight,
  );

  // Draw indicator border
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    indicatorX - indicatorWidth / 2,
    indicatorY - indicatorHeight / 2,
    indicatorWidth,
    indicatorHeight,
  );
}

function handleTap(): void {
  if (gameState !== "PLAYING") return;
  if (shotResolved) return;
  if (!canTap) return;

  shotResolved = true;
  canTap = false;
  checkTiming();
}

function checkTiming(): void {
  const wasSuccess =
    indicatorPosition >= perfectZoneStart &&
    indicatorPosition <= perfectZoneEnd;

  if (!wasSuccess) {
    pendingGameOver = true;
    lastShotWasSuccess = false;
  } else {
    pendingGameOver = false;
    lastShotWasSuccess = true;
  }

  ballActive = true;
  ballProgress = 0;

  ballStartX = w / 2;
  ballStartY = h * 0.85;

  const hoopX = w / 2;
  const hoopY = h * 0.2;
  const rimRadius = 30;

  if (wasSuccess) {
    ballTargetX = hoopX;
    ballTargetY = hoopY;
  } else {
    // FAILURE: target OUTSIDE rim by visible margin; ball must NOT pass through net
    const missDistance = rimRadius * 1.5;
    const missRight = indicatorPosition > 0.5;
    ballTargetX = hoopX + (missRight ? missDistance : -missDistance);
    ballTargetY = hoopY - 10;
  }

  ballAnimationStartTime = performance.now();

  playHitSound(wasSuccess);
  if (settings.haptics && typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(wasSuccess ? "success" : "error");
  }
}

// ============= GAME LOGIC =============
function resetGame(): void {
  score = 0;
  particles = [];

  // Initialize gameplay state
  indicatorPosition = 0;
  indicatorSpeed = 0.003;
  zoneWidth = baseZoneWidth;
  perfectZoneStart = 0.5 - zoneWidth / 2;
  perfectZoneEnd = 0.5 + zoneWidth / 2;
  canTap = true;
  shotResolved = false;

  // Initialize ball state
  ballX = 0;
  ballY = 0;
  ballProgress = 0;
  ballActive = false;
  lastShotWasSuccess = false;
  pendingGameOver = false;
  ballStartX = 0;
  ballStartY = 0;
  ballTargetX = 0;
  ballTargetY = 0;

  // Pick random color theme
  currentColorIndex = Math.floor(
    Math.random() * CONFIG.BACKGROUND_COLORS.length,
  );
  bgColor = CONFIG.BACKGROUND_COLORS[currentColorIndex].bg;
  gameContainer.style.background = bgColor;
}

function spawnParticles(x: number, y: number): void {
  for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
    const angle =
      (Math.PI * 2 * i) / CONFIG.PARTICLE_COUNT + Math.random() * 0.5;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: CONFIG.PARTICLE_LIFE,
      maxLife: CONFIG.PARTICLE_LIFE,
      size: 4 + Math.random() * 4,
    });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1; // Gravity
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }  
}

function updateBall(dt: number): void {
  if (!ballActive) {
    return;
  }

  // Update progress based on elapsed time
  const elapsed = performance.now() - ballAnimationStartTime;
  ballProgress = Math.min(1, elapsed / ballAnimationDuration);
  
  // Lerp with curved arc (parabolic path)
  const t = ballProgress;
  const arcHeight = 150; // Height of the arc peak
  
  // Horizontal lerp
  ballX = ballStartX + (ballTargetX - ballStartX) * t;
  
  // Vertical lerp with arc (parabola)
  const verticalProgress = ballStartY + (ballTargetY - ballStartY) * t;
  const arcOffset = -arcHeight * (4 * t * (1 - t)); // Parabolic arc
  ballY = verticalProgress + arcOffset;
  
  // Check if animation completed
  if (ballProgress >= 1) {
    ballActive = false;
    
    if (lastShotWasSuccess) {
      // Success: ball passes through rim
      spawnParticles(ballTargetX, ballTargetY);
      
      // Increment score AFTER animation
      score++;
      
      // Reduce zone width for difficulty
      zoneWidth = Math.max(minZoneWidth, zoneWidth - zoneReductionAmount);
    } else if (pendingGameOver) {
      // Failure: game over immediately after miss animation
      // DO NOT spawn success particles
      gameOver();
    }
  }
}
function gameOver(): void {
  gameState = "GAME_OVER";

  // Submit score
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }
  // Haptic feedback for game over
  if (settings.haptics && typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic("error");
  }

  // Update UI
  finalScore.textContent = score.toString();

  // Show game over screen
  startScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
  pauseBtn.classList.add("hidden");
}

function startGame(): void {
  gameState = "PLAYING";

  // Handle background music and Tone.js start
  if (settings.music) {
    Tone.start();
    bgMusic.play().catch(() => {});
  }

  resetGame();

  // Hide overlays
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");

  // Show game UI
  pauseBtn.classList.remove("hidden");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  gameState = "PAUSED";
  pauseScreen.classList.remove("hidden");
  
  // Pause music on pause
  bgMusic.pause();
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");

  // Resume music on resume
  if (settings.music) {
    bgMusic.play().catch(() => {});
  }
}

function showStartScreen(): void {
  gameState = "START";

  // Handle background music
  if (settings.music) {
    bgMusic.play().catch(() => {});
  }

  // Reset color to default
  currentColorIndex = 0;
  bgColor = CONFIG.BACKGROUND_COLORS[0].bg;
  gameContainer.style.background = bgColor;

  // Show start screen
  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.add("hidden");
}

// ============= INPUT HANDLERS =============
function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (gameState === "PLAYING") pauseGame();
      else if (gameState === "PAUSED") resumeGame();
    }
  });

  // Touch
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;
    handleTap();
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;
  });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
  });

  // Mouse (for desktop)
  canvas.addEventListener("mousedown", (e) => {
    if (gameState !== "PLAYING") return;
    handleTap();
  });

  canvas.addEventListener("mousemove", (e) => {
    if (gameState !== "PLAYING") return;
  });

  canvas.addEventListener("mouseup", () => {
  });

  // UI Buttons
  startButton.addEventListener("click", () => {
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
  });

  pauseBtn.addEventListener("click", pauseGame);
  document
    .getElementById("resumeButton")!
    .addEventListener("click", resumeGame);
  document
    .getElementById("pauseRestartButton")!
    .addEventListener("click", () => {
      pauseScreen.classList.add("hidden");
      startGame();
    });
  document
    .getElementById("pauseMenuButton")!
    .addEventListener("click", showStartScreen);

  document
    .getElementById("restartButton")!
    .addEventListener("click", startGame);
  document
    .getElementById("backToStartButton")!
    .addEventListener("click", showStartScreen);

  // Settings toggles
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticsToggle = document.getElementById("hapticsToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticsToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("paddleBounce_music", settings.music.toString());

    if (settings.music) {
      Tone.start();
      bgMusic.play().catch(() => {});
    } else {
      bgMusic.pause();
    }
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("paddleBounce_fx", settings.fx.toString());
  });

  hapticsToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticsToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("paddleBounce_haptics", settings.haptics.toString());
  });
}

// ============= RESIZE HANDLER =============
function resizeCanvas(): void {
  w = gameContainer.clientWidth;
  h = gameContainer.clientHeight;
  canvas.width = w;
  canvas.height = h;
}

// ============= GAME LOOP =============
let lastTime = 0;

function gameLoop(timestamp: number): void {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  // Clear and draw background
  drawBackground();

  if (gameState === "PLAYING") {
    updateIndicator(dt);
    updateBall(dt);
    updateParticles(dt);

    drawHoopBack();
    drawRimBack();
    const sway = ballActive ? Math.sin(ballProgress * Math.PI) * 4 : 0;
    drawNetBack(sway);
    drawPerfectZone();
    drawIndicator();
    drawBasketball();
    drawRimFront();
    drawNetFront(sway);
    drawParticles();
    drawScore();
  } else if (gameState === "START") {
    drawScore();
  } else if (gameState === "PAUSED" || gameState === "GAME_OVER") {
    drawHoopBack();
    drawRimBack();
    drawNetBack(0);
    drawPerfectZone();
    drawIndicator();
    drawBasketball();
    drawRimFront();
    drawNetFront(0);
    drawParticles();
    drawScore();
  }

  requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  // Setup canvas
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Setup input
  setupInputHandlers();

  // Initialize display
  gameContainer.style.background = bgColor;

  // Start game loop
  requestAnimationFrame(gameLoop);

  // Initialize display state
  showStartScreen();
}

init();
