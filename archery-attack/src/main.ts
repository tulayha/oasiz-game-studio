/**
 * ARCHERY ATTACK — Mongolian Horse Archer Game
 *
 * Horse gallops across the steppe on a sine-wave bob.
 * Tap to fire — arrow inherits the horse's vertical velocity.
 * Time your shot at the top or bottom of the wave where vy ≈ 0.
 */

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "PAUSED" | "GAME_OVER";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface Arrow {
  worldX: number;
  screenY: number;
  vx: number;
  vy: number;
  active: boolean;
  angle: number;
  perfect: boolean;
}

interface WorldTarget {
  worldX: number;
  screenY: number;
  postHeight: number;
  radius: number;
  hit: boolean;
}

interface Horse {
  screenX: number;
  screenY: number;
  baseY: number;
  legPhase: number;
  bobPhase: number;
}

interface World {
  cameraX: number;
  speed: number;
  width: number;
}

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  scale: number;
  opacity: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

// ============= CONFIG =============
const CONFIG = {
  // Horse bob (sine wave)
  BOB_AMPLITUDE: 55,        // px peak-to-center
  BOB_FREQUENCY: 0.003,     // rad/ms (~2s period)
  VELOCITY_TRANSFER: 2.0,   // how much bob vy transfers to arrow
  PERFECT_THRESHOLD: 0.82,  // steadiness above this = "perfect" zone

  // Horse
  HORSE_SPEED: 0.22,        // px/ms world-space (fast gallop)
  HORSE_SCREEN_X: 0.20,

  // World
  WORLD_WIDTH: 4000,
  TARGETS_PER_LAP: 8,

  // Arrow
  ARROW_SPEED: 1.8,
  ARROW_GRAVITY: 0.0003,
  ARROW_LENGTH: 36,
  ARROW_HEAD_SIZE: 8,

  // Target
  TARGET_RADIUS: 28,
  TARGET_HIT_RADIUS: 34,

  // Parallax
  PARALLAX_MOUNTAINS: 0.15,
  PARALLAX_MIDGROUND: 0.5,
  PARALLAX_GROUND: 1.0,

  // Gameplay
  ROUND_TIME_MS: 20000,
  PERFECT_MULTIPLIER: 2,

  // Layout
  GROUND_RATIO: 0.18,

  // Ring scoring
  RING_COLORS: ["#FFD700", "#FF4444", "#4488FF", "#333333", "#EEEEEE"],
};

// ============= GLOBALS =============
const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// UI Elements
const startScreen = document.getElementById("startScreen")!;
const gameOverScreen = document.getElementById("gameOverScreen")!;
const pauseScreen = document.getElementById("pauseScreen")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBtn = document.getElementById("settingsBtn")!;
const pauseBtn = document.getElementById("pauseBtn")!;
const scoreDisplay = document.getElementById("scoreDisplay")!;
const currentScoreEl = document.getElementById("currentScore")!;
const finalScoreEl = document.getElementById("finalScore")!;
const fireBtn = document.getElementById("fireBtn")!;

// State
let gameState: GameState = "START";
let w = window.innerWidth;
let h = window.innerHeight;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

let score = 0;
let timeRemaining = CONFIG.ROUND_TIME_MS;

let settings: Settings = loadSettings();

let animationFrameId: number;
let lastTime = 0;

let groundY = 0;

// Derived bob velocity (updated each frame)
let horseBobVelocity = 0;

let world: World = {
  cameraX: 0,
  speed: CONFIG.HORSE_SPEED,
  width: CONFIG.WORLD_WIDTH,
};

let horse: Horse = {
  screenX: 0,
  screenY: 0,
  baseY: 0,
  legPhase: 0,
  bobPhase: 0,
};

let targets: WorldTarget[] = [];
let arrows: Arrow[] = [];
let particles: Particle[] = [];
let clouds: Cloud[] = [];
let scorePopups: ScorePopup[] = [];

// ============= CANVAS SETUP =============
function resizeCanvas(): void {
  w = window.innerWidth;
  h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  groundY = h * (1 - CONFIG.GROUND_RATIO);
  horse.screenX = w * CONFIG.HORSE_SCREEN_X;
  horse.baseY = groundY - 5;
  horse.screenY = horse.baseY;
}

// ============= COORDINATE TRANSFORMS =============
function worldToScreen(worldX: number): number {
  return worldX - world.cameraX + horse.screenX;
}

function screenToWorld(screenX: number): number {
  return screenX + world.cameraX - horse.screenX;
}

// ============= HAPTICS =============
function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

// ============= SETTINGS =============
function loadSettings(): Settings {
  const saved = localStorage.getItem("archeryAttack_settings");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // ignore
    }
  }
  return { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  localStorage.setItem("archeryAttack_settings", JSON.stringify(settings));
}

// ============= BOB STEADINESS =============
/** 0 = max velocity (mid-wave), 1 = zero velocity (peak/trough) */
function getSteadiness(): number {
  const maxV = CONFIG.BOB_AMPLITUDE * CONFIG.BOB_FREQUENCY;
  return 1 - Math.abs(horseBobVelocity) / maxV;
}

// ============= TARGET GENERATION =============
function generateTargets(): void {
  targets = [];
  const spacing = world.width / (CONFIG.TARGETS_PER_LAP + 1);

  for (let i = 0; i < CONFIG.TARGETS_PER_LAP; i++) {
    const jitter = (Math.random() - 0.5) * spacing * 0.4;
    const worldX = spacing * (i + 1) + jitter;
    const postHeight = 80 + Math.random() * 120;
    const screenY = groundY - postHeight;

    targets.push({
      worldX,
      screenY,
      postHeight,
      radius: CONFIG.TARGET_RADIUS,
      hit: false,
    });
  }
}

// ============= AUTO-AIM =============
function getBowPosition(): { x: number; y: number } {
  return {
    x: horse.screenX + 20,
    y: horse.screenY - 75,
  };
}

function findNearestTarget(): WorldTarget | null {
  const bowPos = getBowPosition();
  const bowWorldX = screenToWorld(bowPos.x);
  let best: WorldTarget | null = null;
  let bestDist = Infinity;

  for (const t of targets) {
    if (t.hit) continue;
    const dx = t.worldX - bowWorldX;
    if (dx < -50) continue;
    const screenX = worldToScreen(t.worldX);
    if (screenX < 0 || screenX > w + 100) continue;
    const dy = t.screenY - bowPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

function getAutoAimAngle(target: WorldTarget): number {
  const bowPos = getBowPosition();
  const targetScreenX = worldToScreen(target.worldX);
  const dx = targetScreenX - bowPos.x;
  const dy = target.screenY - bowPos.y;
  return Math.atan2(dy, dx);
}

// ============= FIRE =============
function fireArrow(): void {
  const nearestTarget = findNearestTarget();
  if (!nearestTarget) return;

  const bowPos = getBowPosition();
  const baseAngle = getAutoAimAngle(nearestTarget);
  const steadiness = getSteadiness();
  const isPerfect = steadiness >= CONFIG.PERFECT_THRESHOLD;

  // Arrow fires along auto-aim angle, but inherits horse bob velocity as vy offset
  const baseVx = Math.cos(baseAngle) * CONFIG.ARROW_SPEED;
  const baseVy = Math.sin(baseAngle) * CONFIG.ARROW_SPEED;
  const addedVy = horseBobVelocity * CONFIG.VELOCITY_TRANSFER;

  const arrow: Arrow = {
    worldX: screenToWorld(bowPos.x),
    screenY: bowPos.y,
    vx: baseVx,
    vy: baseVy + addedVy,
    active: true,
    angle: Math.atan2(baseVy + addedVy, baseVx),
    perfect: isPerfect,
  };

  arrows.push(arrow);
  triggerHaptic(isPerfect ? "success" : "medium");
}

// ============= PARTICLES =============
function spawnHitParticles(x: number, y: number): void {
  const colors = ["#FFD700", "#FF6644", "#FFAA22", "#FFFFFF"];
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.1 + Math.random() * 0.3;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 4,
    });
  }
}

// ============= SCORE POPUPS =============
function spawnScorePopup(
  x: number,
  y: number,
  points: number,
  perfect: boolean,
): void {
  const text = perfect ? `${points} PERFECT!` : `+${points}`;
  const color = perfect ? "#FFD700" : "#FFFFFF";
  scorePopups.push({
    x,
    y,
    text,
    color,
    life: 1,
    vy: -0.08,
  });
}

// ============= GAME STATE =============
function gameOver(): void {
  if (gameState !== "PLAYING") return;
  gameState = "GAME_OVER";

  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(score);
  }

  triggerHaptic("error");

  finalScoreEl.textContent = score.toString();
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  fireBtn.classList.add("hidden");
  gameOverScreen.classList.remove("hidden");
}

function startGame(): void {
  gameState = "PLAYING";

  score = 0;
  timeRemaining = CONFIG.ROUND_TIME_MS;
  currentScoreEl.textContent = "0";

  arrows = [];
  particles = [];
  scorePopups = [];

  world.cameraX = 0;
  horse.bobPhase = 0;
  horse.screenY = horse.baseY;
  horseBobVelocity = 0;

  generateTargets();

  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");

  scoreDisplay.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");
  fireBtn.classList.remove("hidden");

  triggerHaptic("light");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  gameState = "PAUSED";
  pauseScreen.classList.remove("hidden");
  fireBtn.classList.add("hidden");
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  fireBtn.classList.remove("hidden");
  triggerHaptic("light");
}

function showStartScreen(): void {
  gameState = "START";
  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  scoreDisplay.classList.add("hidden");
  pauseBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  fireBtn.classList.add("hidden");
}

// ============= CLOUDS =============
function initClouds(): void {
  clouds = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * w * 1.5 - w * 0.25,
      y: 30 + Math.random() * (groundY * 0.35),
      speed: 0.008 + Math.random() * 0.015,
      scale: 0.6 + Math.random() * 0.8,
      opacity: 0.25 + Math.random() * 0.25,
    });
  }
}

function updateClouds(dt: number): void {
  for (const c of clouds) {
    c.x += c.speed * dt;
    if (c.x > w + 150) {
      c.x = -150;
      c.y = 30 + Math.random() * (groundY * 0.35);
    }
  }
}

function drawCloud(c: Cloud): void {
  ctx.globalAlpha = c.opacity;
  ctx.fillStyle = "#FFEEDD";
  const s = c.scale;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 50 * s, 25 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x - 30 * s, c.y + 5 * s, 35 * s, 20 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x + 30 * s, c.y + 5 * s, 35 * s, 20 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x + 10 * s, c.y - 12 * s, 30 * s, 18 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ============= WORLD UPDATE =============
function updateWorld(dt: number): void {
  world.cameraX += world.speed * dt;
  horse.legPhase += dt * 0.015;

  // Sine wave bob
  horse.bobPhase += CONFIG.BOB_FREQUENCY * dt;
  horse.screenY = horse.baseY - Math.sin(horse.bobPhase) * CONFIG.BOB_AMPLITUDE;

  // Derivative of -sin(phase)*A = -cos(phase)*A*freq
  // But we want: positive bobVelocity = moving down on screen (increasing Y)
  // d/dt of screenY = -cos(phase) * A * freq
  horseBobVelocity = -Math.cos(horse.bobPhase) * CONFIG.BOB_AMPLITUDE * CONFIG.BOB_FREQUENCY;

  // Wrap at world end
  if (world.cameraX >= world.width) {
    world.cameraX -= world.width;
    generateTargets();
  }
}

// ============= DRAWING =============
function drawSteppeSky(): void {
  const grad = ctx.createLinearGradient(0, 0, 0, groundY);
  grad.addColorStop(0, "#2A1B3D");
  grad.addColorStop(0.3, "#A0522D");
  grad.addColorStop(0.6, "#D4883E");
  grad.addColorStop(0.85, "#E8A84C");
  grad.addColorStop(1, "#F0C060");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, groundY);

  // Low sun
  const sunX = w * 0.75;
  const sunY = groundY * 0.82;
  const sunR = 45;

  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3);
  glow.addColorStop(0, "rgba(255, 240, 180, 0.6)");
  glow.addColorStop(0.4, "rgba(255, 200, 100, 0.2)");
  glow.addColorStop(1, "rgba(255, 180, 50, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 3, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  body.addColorStop(0, "#FFFDE0");
  body.addColorStop(0.7, "#FFE44D");
  body.addColorStop(1, "#FFB800");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountains(): void {
  const offset = -(world.cameraX * CONFIG.PARALLAX_MOUNTAINS) % w;
  const mountainY = groundY * 0.65;

  ctx.fillStyle = "#5A3A2A";

  for (let pass = 0; pass < 2; pass++) {
    const shiftX = offset + pass * w;
    ctx.beginPath();
    ctx.moveTo(shiftX - 100, groundY);

    const peaks = [
      { x: 0.1, y: 0.6, cx1: 0.05, cy1: 0.9, cx2: 0.08, cy2: 0.65 },
      { x: 0.25, y: 0.35, cx1: 0.15, cy1: 0.55, cx2: 0.2, cy2: 0.38 },
      { x: 0.4, y: 0.5, cx1: 0.3, cy1: 0.38, cx2: 0.35, cy2: 0.48 },
      { x: 0.55, y: 0.3, cx1: 0.45, cy1: 0.45, cx2: 0.5, cy2: 0.32 },
      { x: 0.7, y: 0.45, cx1: 0.6, cy1: 0.32, cx2: 0.65, cy2: 0.42 },
      { x: 0.85, y: 0.55, cx1: 0.75, cy1: 0.42, cx2: 0.8, cy2: 0.52 },
      { x: 1.0, y: 0.7, cx1: 0.9, cy1: 0.5, cx2: 0.95, cy2: 0.68 },
    ];

    for (const p of peaks) {
      ctx.bezierCurveTo(
        shiftX + p.cx1 * w,
        mountainY + (1 - p.cy1) * (groundY - mountainY),
        shiftX + p.cx2 * w,
        mountainY + (1 - p.cy2) * (groundY - mountainY),
        shiftX + p.x * w,
        mountainY + (1 - p.y) * (groundY - mountainY),
      );
    }

    ctx.lineTo(shiftX + w + 100, groundY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawMidground(): void {
  const offset = -(world.cameraX * CONFIG.PARALLAX_MIDGROUND) % w;
  const midY = groundY - 30;

  for (let pass = 0; pass < 2; pass++) {
    const shiftX = offset + pass * w;
    ctx.fillStyle = "#7A6830";
    ctx.beginPath();
    ctx.moveTo(shiftX - 50, groundY);

    for (let x = 0; x <= w + 100; x += 50) {
      const hillY =
        midY +
        Math.sin((x + pass * 200) * 0.008) * 15 +
        Math.sin((x + pass * 300) * 0.003) * 25;
      ctx.lineTo(shiftX + x, hillY);
    }

    ctx.lineTo(shiftX + w + 100, groundY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround(): void {
  const grad = ctx.createLinearGradient(0, groundY, 0, h);
  grad.addColorStop(0, "#8B7340");
  grad.addColorStop(0.3, "#7A6330");
  grad.addColorStop(1, "#5A4820");
  ctx.fillStyle = grad;
  ctx.fillRect(0, groundY, w, h - groundY);

  ctx.strokeStyle = "#9A8350";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(w, groundY);
  ctx.stroke();

  const lineOffset = -(world.cameraX * CONFIG.PARALLAX_GROUND) % 60;
  ctx.strokeStyle = "rgba(100, 80, 40, 0.3)";
  ctx.lineWidth = 1;
  for (let x = lineOffset - 60; x < w + 60; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 5);
    ctx.lineTo(x - 15, h);
    ctx.stroke();
  }
}

function drawWorldTargets(): void {
  for (const t of targets) {
    if (t.hit) continue;

    const screenX = worldToScreen(t.worldX);
    if (screenX < -60 || screenX > w + 60) continue;

    // Post
    ctx.strokeStyle = "#5A3A1E";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(screenX, groundY);
    ctx.lineTo(screenX, t.screenY);
    ctx.stroke();

    // Post cap
    ctx.fillStyle = "#3D2810";
    ctx.fillRect(screenX - 5, t.screenY - 3, 10, 6);

    // Target face (concentric rings)
    const rings = CONFIG.RING_COLORS;
    for (let i = 0; i < rings.length; i++) {
      const r = t.radius * (1 - i / rings.length);
      ctx.fillStyle = rings[i];
      ctx.beginPath();
      ctx.arc(screenX, t.screenY, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, t.screenY, t.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawHorseAndArcher(): void {
  const hx = horse.screenX;
  const hy = horse.screenY;
  const phase = horse.legPhase;

  const horseColor = "#3D2810";
  const horseLightColor = "#5A3A1E";

  // Body
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.ellipse(hx, hy - 40, 50, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Underbelly highlight
  ctx.fillStyle = horseLightColor;
  ctx.beginPath();
  ctx.ellipse(hx, hy - 35, 42, 14, 0, 0.2, Math.PI - 0.2);
  ctx.fill();

  // Legs
  ctx.strokeStyle = horseColor;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";

  const legPositions = [
    { base: -30, offset: 0 },
    { base: -12, offset: Math.PI * 0.5 },
    { base: 12, offset: Math.PI },
    { base: 30, offset: Math.PI * 1.5 },
  ];

  for (const leg of legPositions) {
    const swing = Math.sin(phase + leg.offset) * 18;
    const lift = Math.max(0, -Math.sin(phase + leg.offset)) * 12;

    const kneeX = hx + leg.base + swing * 0.3;
    const kneeY = hy - 12;
    const hoofX = hx + leg.base + swing;
    const hoofY = hy + 8 - lift;

    ctx.beginPath();
    ctx.moveTo(hx + leg.base, hy - 22);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(hoofX, hoofY);
    ctx.stroke();

    ctx.fillStyle = "#1A0E05";
    ctx.beginPath();
    ctx.ellipse(hoofX, hoofY + 2, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Neck
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.moveTo(hx + 40, hy - 52);
  ctx.quadraticCurveTo(hx + 55, hy - 70, hx + 50, hy - 82);
  ctx.quadraticCurveTo(hx + 42, hy - 72, hx + 38, hy - 52);
  ctx.closePath();
  ctx.fill();

  // Head
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.ellipse(hx + 56, hy - 84, 18, 10, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Muzzle
  ctx.fillStyle = horseLightColor;
  ctx.beginPath();
  ctx.ellipse(hx + 70, hy - 80, 8, 6, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(hx + 58, hy - 88, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Ear
  ctx.fillStyle = horseColor;
  ctx.beginPath();
  ctx.moveTo(hx + 50, hy - 92);
  ctx.lineTo(hx + 46, hy - 104);
  ctx.lineTo(hx + 54, hy - 94);
  ctx.closePath();
  ctx.fill();

  // Mane
  ctx.strokeStyle = "#1A0E05";
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const mx = hx + 42 + i * 2;
    const my = hy - 55 - i * 6;
    const windOffset = Math.sin(phase * 0.7 + i * 0.8) * 5;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(mx - 10 + windOffset, my - 5, mx - 15 + windOffset, my + 3);
    ctx.stroke();
  }

  // Tail
  ctx.strokeStyle = "#1A0E05";
  ctx.lineWidth = 4;
  const tailSwing = Math.sin(phase * 0.5) * 12;
  ctx.beginPath();
  ctx.moveTo(hx - 48, hy - 42);
  ctx.quadraticCurveTo(hx - 70 + tailSwing, hy - 35, hx - 80 + tailSwing * 1.5, hy - 20);
  ctx.stroke();

  // ---- RIDER ----
  const riderBaseX = hx + 5;
  const riderBaseY = hy - 58;

  // Legs on horse
  ctx.fillStyle = "#8B2500";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 12, riderBaseY + 10);
  ctx.lineTo(riderBaseX - 18, riderBaseY + 25);
  ctx.lineTo(riderBaseX - 8, riderBaseY + 25);
  ctx.lineTo(riderBaseX - 5, riderBaseY + 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 5, riderBaseY + 10);
  ctx.lineTo(riderBaseX + 12, riderBaseY + 25);
  ctx.lineTo(riderBaseX + 20, riderBaseY + 25);
  ctx.lineTo(riderBaseX + 10, riderBaseY + 10);
  ctx.closePath();
  ctx.fill();

  // Torso
  ctx.fillStyle = "#B22222";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 12, riderBaseY + 12);
  ctx.lineTo(riderBaseX - 10, riderBaseY - 20);
  ctx.lineTo(riderBaseX + 10, riderBaseY - 20);
  ctx.lineTo(riderBaseX + 12, riderBaseY + 12);
  ctx.closePath();
  ctx.fill();

  // Sash
  ctx.strokeStyle = "#FFD700";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 11, riderBaseY + 2);
  ctx.lineTo(riderBaseX + 11, riderBaseY + 2);
  ctx.stroke();

  // Head
  ctx.fillStyle = "#D2A679";
  ctx.beginPath();
  ctx.arc(riderBaseX, riderBaseY - 28, 8, 0, Math.PI * 2);
  ctx.fill();

  // Hat
  ctx.fillStyle = "#8B4513";
  ctx.beginPath();
  ctx.moveTo(riderBaseX - 10, riderBaseY - 30);
  ctx.lineTo(riderBaseX, riderBaseY - 48);
  ctx.lineTo(riderBaseX + 10, riderBaseY - 30);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#A0522D";
  ctx.beginPath();
  ctx.ellipse(riderBaseX, riderBaseY - 30, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- BOW (always drawn at rest — tap to fire, no draw animation) ----
  const bowX = riderBaseX + 20;
  const bowY = riderBaseY - 15;

  // Bow arm
  ctx.strokeStyle = "#D2A679";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 8, riderBaseY - 14);
  ctx.lineTo(bowX, bowY);
  ctx.stroke();

  // Bow arc
  const bowR = 22;
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bowX, bowY, bowR, -Math.PI * 0.45, Math.PI * 0.45, false);
  ctx.stroke();

  const topBowX = bowX + Math.cos(-Math.PI * 0.45) * bowR;
  const topBowY = bowY + Math.sin(-Math.PI * 0.45) * bowR;
  const botBowX = bowX + Math.cos(Math.PI * 0.45) * bowR;
  const botBowY = bowY + Math.sin(Math.PI * 0.45) * bowR;

  // Bowstring
  ctx.strokeStyle = "#C4A058";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(topBowX, topBowY);
  ctx.lineTo(botBowX, botBowY);
  ctx.stroke();

  // Draw arm at rest
  ctx.strokeStyle = "#D2A679";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(riderBaseX + 5, riderBaseY - 14);
  ctx.lineTo(riderBaseX, riderBaseY - 8);
  ctx.stroke();
}

function drawArrow(arrow: Arrow): void {
  const screenX = worldToScreen(arrow.worldX);
  const screenY = arrow.screenY;

  if (screenX < -60 || screenX > w + 60) return;

  const len = CONFIG.ARROW_LENGTH;
  const hs = CONFIG.ARROW_HEAD_SIZE;
  const a = arrow.angle;

  const tipX = screenX + Math.cos(a) * len * 0.6;
  const tipY = screenY + Math.sin(a) * len * 0.6;
  const tailX = screenX - Math.cos(a) * len * 0.4;
  const tailY = screenY - Math.sin(a) * len * 0.4;

  ctx.strokeStyle = "#5C3A1E";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - Math.cos(a - 0.4) * hs, tipY - Math.sin(a - 0.4) * hs);
  ctx.lineTo(tipX - Math.cos(a + 0.4) * hs, tipY - Math.sin(a + 0.4) * hs);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#CC3333";
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tailX + Math.cos(a - 0.5) * 7, tailY + Math.sin(a - 0.5) * 7);
  ctx.lineTo(tailX + Math.cos(a) * 5, tailY + Math.sin(a) * 5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tailX + Math.cos(a + 0.5) * 7, tailY + Math.sin(a + 0.5) * 7);
  ctx.lineTo(tailX + Math.cos(a) * 5, tailY + Math.sin(a) * 5);
  ctx.closePath();
  ctx.fill();
}

function drawParticles(): void {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawScorePopups(): void {
  for (const sp of scorePopups) {
    ctx.globalAlpha = sp.life;
    ctx.fillStyle = sp.color;
    ctx.font = "bold 22px 'Cinzel', serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(sp.text, sp.x, sp.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

/** Rhythm meter — shows sine wave position and sweet spots at top/bottom */
function drawBobIndicator(): void {
  const meterX = 35;
  const meterCenterY = h * 0.5;
  const meterH = CONFIG.BOB_AMPLITUDE * 2.2;
  const halfH = meterH / 2;

  // Track background
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(meterX, meterCenterY - halfH);
  ctx.lineTo(meterX, meterCenterY + halfH);
  ctx.stroke();

  // Sweet-spot zones at top and bottom
  const zoneH = meterH * 0.15;
  ctx.fillStyle = "rgba(50, 220, 50, 0.15)";
  ctx.fillRect(meterX - 12, meterCenterY - halfH - 2, 24, zoneH);
  ctx.fillRect(meterX - 12, meterCenterY + halfH - zoneH + 2, 24, zoneH);

  // Green lines at top/bottom sweet spots
  ctx.strokeStyle = "rgba(50, 220, 50, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(meterX - 10, meterCenterY - halfH);
  ctx.lineTo(meterX + 10, meterCenterY - halfH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(meterX - 10, meterCenterY + halfH);
  ctx.lineTo(meterX + 10, meterCenterY + halfH);
  ctx.stroke();

  // Current position dot
  const bobNorm = Math.sin(horse.bobPhase); // -1 to 1
  const dotY = meterCenterY - bobNorm * halfH;
  const steadiness = getSteadiness();

  let dotColor: string;
  if (steadiness >= CONFIG.PERFECT_THRESHOLD) {
    dotColor = "#44FF44";
  } else if (steadiness > 0.5) {
    dotColor = "#FFDD44";
  } else {
    dotColor = "#FF5544";
  }

  // Glow
  ctx.shadowColor = dotColor;
  ctx.shadowBlur = steadiness >= CONFIG.PERFECT_THRESHOLD ? 12 : 6;
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(meterX, dotY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Dot outline
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(meterX, dotY, 7, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHUD(): void {
  // Timer — top center
  const secs = Math.ceil(timeRemaining / 1000);
  const timerText = secs.toString();
  const urgent = secs <= 5;

  ctx.textAlign = "center";
  ctx.font = `bold ${urgent ? 52 : 44}px 'Cinzel', serif`;
  ctx.fillStyle = urgent ? "#FF3333" : "rgba(255, 255, 255, 0.9)";
  ctx.shadowColor = urgent ? "rgba(255, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = urgent ? 20 : 10;
  ctx.fillText(timerText, w / 2, isMobile ? 130 : 70);
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";

  // Bob rhythm meter
  drawBobIndicator();
}

// ============= FIRE BUTTON DOM UPDATE =============
function updateFireButton(): void {
  if (gameState !== "PLAYING") return;

  fireBtn.classList.remove("state-focusing", "state-steady", "state-flash");

  const steadiness = getSteadiness();

  if (steadiness >= CONFIG.PERFECT_THRESHOLD) {
    fireBtn.classList.add("state-flash");
  } else if (steadiness > 0.5) {
    fireBtn.classList.add("state-steady");
  } else {
    fireBtn.classList.add("state-focusing");
  }
}

// ============= UPDATE =============
function update(dt: number): void {
  if (gameState !== "PLAYING") return;

  updateClouds(dt);
  updateWorld(dt);
  updateFireButton();

  // Update arrows
  for (const arrow of arrows) {
    if (!arrow.active) continue;

    arrow.vy += CONFIG.ARROW_GRAVITY * dt;
    arrow.worldX += arrow.vx * dt;
    arrow.screenY += arrow.vy * dt;
    arrow.angle = Math.atan2(arrow.vy, arrow.vx);

    if (arrow.screenY >= groundY) {
      arrow.active = false;
      continue;
    }

    if (arrow.screenY < -100) {
      arrow.active = false;
      continue;
    }

    for (const t of targets) {
      if (t.hit) continue;

      const arrowScreenX = worldToScreen(arrow.worldX);
      const targetScreenX = worldToScreen(t.worldX);
      const dx = arrowScreenX - targetScreenX;
      const dy = arrow.screenY - t.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CONFIG.TARGET_HIT_RADIUS) {
        arrow.active = false;
        t.hit = true;

        const ringFrac = dist / t.radius;
        let points = 2;
        if (ringFrac < 0.2) points = 10;
        else if (ringFrac < 0.4) points = 8;
        else if (ringFrac < 0.6) points = 6;
        else if (ringFrac < 0.8) points = 4;

        if (arrow.perfect) points *= CONFIG.PERFECT_MULTIPLIER;

        score += points;
        currentScoreEl.textContent = score.toString();

        const hitScreenX = worldToScreen(t.worldX);
        spawnHitParticles(hitScreenX, t.screenY);
        spawnScorePopup(hitScreenX, t.screenY - 30, points, arrow.perfect);
        triggerHaptic("success");
        break;
      }
    }
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= 0.002 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Update score popups
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const sp = scorePopups[i];
    sp.y += sp.vy * dt;
    sp.life -= 0.0015 * dt;
    if (sp.life <= 0) scorePopups.splice(i, 1);
  }

  arrows = arrows.filter((a) => a.active);

  timeRemaining -= dt;
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    gameOver();
  }
}

// ============= INPUT =============
function setupFireButton(): void {
  const doFire = (e: Event) => {
    e.preventDefault();
    if (gameState !== "PLAYING") return;
    fireArrow();
  };

  fireBtn.addEventListener("pointerdown", doFire);
  fireBtn.addEventListener("contextmenu", (e) => e.preventDefault());
}

function setupInputHandlers(): void {
  setupFireButton();

  window.addEventListener("keydown", (e) => {
    if (gameState === "PLAYING") {
      if (e.key === "Escape") {
        pauseGame();
      }
      if (e.key === " ") {
        fireArrow();
        e.preventDefault();
      }
    } else if (gameState === "PAUSED" && e.key === "Escape") {
      resumeGame();
    } else if (gameState === "START" && (e.key === " " || e.key === "Enter")) {
      startGame();
    }
  });

  document.getElementById("startButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("startSettingsBtn")?.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.add("hidden");
  });

  pauseBtn.addEventListener("click", () => {
    triggerHaptic("light");
    pauseGame();
  });

  document.getElementById("resumeButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    resumeGame();
  });

  document.getElementById("pauseRestartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    pauseScreen.classList.add("hidden");
    startGame();
  });

  document.getElementById("pauseMenuButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    showStartScreen();
  });

  document.getElementById("restartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    startGame();
  });

  document.getElementById("backToStartButton")!.addEventListener("click", () => {
    triggerHaptic("light");
    showStartScreen();
  });

  setupSettingsToggles();
}

function setupSettingsToggles(): void {
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    saveSettings();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    saveSettings();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    saveSettings();
    if (settings.haptics) triggerHaptic("light");
  });
}

// ============= GAME LOOP =============
function gameLoop(timestamp: number): void {
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  update(dt);

  ctx.clearRect(0, 0, w, h);

  drawSteppeSky();
  drawMountains();
  for (const c of clouds) drawCloud(c);
  drawMidground();
  drawGround();
  drawWorldTargets();
  drawHorseAndArcher();

  for (const arrow of arrows) {
    if (arrow.active) drawArrow(arrow);
  }

  drawParticles();
  drawScorePopups();

  if (gameState === "PLAYING") {
    drawHUD();
  }

  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "11px monospace";
  ctx.textAlign = "right";
  ctx.fillText("build 9", w - 10, h - 10);
  ctx.textAlign = "left";

  animationFrameId = requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  setupInputHandlers();
  initClouds();
  generateTargets();

  requestAnimationFrame(gameLoop);
  showStartScreen();
}

init();
