/**
 * ARROW ARENA
 *
 * A 2D physics-based arena game where players control circular characters,
 * use bow and arrow weapons to knock opponents into pits, and try to be
 * the last one standing.
 *
 * Controls:
 * - A/D: Move left/right
 * - W: Jump (when grounded)
 * - Z (hold): Enter aiming mode
 * - A/D (while holding Z): Rotate aim
 * - Z (release): Fire arrow
 */

// ============= CONFIGURATION =============
const CONFIG = {
  // Player
  PLAYER_RADIUS: 20,
  PLAYER_MASS: 1,
  PLAYER_MOVE_SPEED: 1.8,
  PLAYER_JUMP_FORCE: 10,
  PLAYER_MAX_VELOCITY: 6,
  PLAYER_GROUND_FRICTION: 0.96,
  PLAYER_AIR_FRICTION: 0.92,
  PLAYER_BOUNCE: 0.3,

  // Physics
  GRAVITY: 0.4,
  TERMINAL_VELOCITY: 12,

  // Arrow
  ARROW_SPEED: 12,
  ARROW_LENGTH: 25,
  ARROW_WIDTH: 4,
  ARROW_LIFETIME: 3000, // ms
  ARROW_COOLDOWN: 500, // ms
  ARROW_GRAVITY: 0.25, // Gravity applied to arrows
  AIM_ROTATION_SPEED: 2.5, // degrees per frame (slower)

  // Knockback
  KNOCKBACK_FORCE: 15,
  HIT_STUN_DURATION: 100, // ms

  // Charge mechanics
  CHARGE_MIN_TIME: 100, // ms - minimum charge for any shot
  CHARGE_MAX_TIME: 1500, // ms - full charge
  CHARGE_MIN_SPEED_MULT: 0.5, // arrow speed at min charge
  CHARGE_MAX_SPEED_MULT: 1.8, // arrow speed at full charge
  CHARGE_MIN_KNOCKBACK_MULT: 0.5,
  CHARGE_MAX_KNOCKBACK_MULT: 2.0,
  MOVEMENT_WHILE_CHARGING: 0.4, // 40% movement speed while charging

  // Arena
  PLATFORM_COLOR: "#3d5a80",
  PLATFORM_STROKE: "#1d3557",
  DEATH_ZONE_COLOR: "#c1121f",
  BACKGROUND_COLOR: "#4a6fa5",

  // AI
  AI_REACTION_TIME: 300, // ms
  AI_AIM_VARIANCE: 15, // degrees
  AI_SHOOT_CHANCE: 0.02, // per frame when aiming
  BOT_RADIUS: 14, // Bots are smaller than player
  BOT_SPAWN_INTERVAL: 10000, // Spawn new bot every 10 seconds

  // Arena constraints
  MAX_ARENA_WIDTH: 500, // Max playable width for consistent gameplay

  // Colors
  PLAYER_COLORS: [
    "#f72585", // Player - pink
    "#4cc9f0", // Bot 1 - cyan
    "#7209b7", // Bot 2 - purple
    "#f77f00", // Bot 3 - orange
    "#06d6a0", // Bot 4 - green
    "#ef476f", // Bot 5 - red
    "#ffd166", // Bot 6 - yellow
    "#118ab2", // Bot 7 - blue
  ],

  // Safe areas
  TOP_SAFE_DESKTOP: 45,
  TOP_SAFE_MOBILE: 120,
};

// ============= TYPES =============
type GameState = "START" | "PLAYING" | "GAME_OVER" | "PAUSED";

interface Vector2 {
  x: number;
  y: number;
}

interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isGrounded: boolean;
  isAiming: boolean;
  aimAngle: number;
  lastShotTime: number;
  hitStunEnd: number;
  isPlayer: boolean;
  isAlive: boolean;
  chargeStartTime: number; // When Z was pressed (0 if not charging)
  // AI properties
  aiTargetX: number;
  aiLastDecisionTime: number;
  aiWantsToJump: boolean;
  aiWantsToShoot: boolean;
  aiChargeTime: number; // How long AI will charge
}

interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  ownerId: number;
  spawnTime: number;
  isActive: boolean;
  knockbackForce: number; // Scales with charge
}

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DeathZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= UTILITY FUNCTIONS =============
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function normalizeAngle(angle: number): number {
  while (angle < 0) angle += Math.PI * 2;
  while (angle >= Math.PI * 2) angle -= Math.PI * 2;
  return angle;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
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
const hud = document.getElementById("hud")!;
const mobileControls = document.getElementById("mobile-controls")!;
const roundDisplay = document.getElementById("roundDisplay")!;
const killsDisplay = document.getElementById("killsDisplay")!;
const finalScore = document.getElementById("finalScore")!;
const finalRound = document.getElementById("finalRound")!;

// State
let gameState: GameState = "START";
let w = 0;
let h = 0;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Game objects
let players: Player[] = [];
let arrows: Arrow[] = [];
let platforms: Platform[] = [];
let deathZones: DeathZone[] = [];
let particles: Particle[] = [];

// Game progress
let totalKills = 0;
let gameStartTime = 0;
let nextBotSpawnTime = 0;
let botCount = 0;
let currentWave = 1; // Wave number = how many bots spawn each round

// Input state
let keysDown: Set<string> = new Set();
let mobileAiming = false;
let mobileAimAngle = 0;

// Screen shake
let screenShake = 0;

// Settings
let settings: Settings = {
  music: localStorage.getItem("arrowArena_music") !== "false",
  fx: localStorage.getItem("arrowArena_fx") !== "false",
  haptics: localStorage.getItem("arrowArena_haptics") !== "false",
};

// ============= AUDIO =============
let audioContext: AudioContext | null = null;

function initAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext();
    console.log("[initAudio] Audio context initialized");
  }
}

function playShootSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.1);

  gain.gain.setValueAtTime(0.2, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.1);
}

function playHitSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "square";
  osc.frequency.setValueAtTime(150, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.15);

  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.15);
}

function playDeathSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(300, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.4);

  gain.gain.setValueAtTime(0.3, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.4);
}

function playJumpSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(300, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(500, audioContext.currentTime + 0.1);

  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.1);
}

function playWinSound(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = audioContext!.createOscillator();
    const gain = audioContext!.createGain();
    osc.connect(gain);
    gain.connect(audioContext!.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, audioContext!.currentTime + i * 0.1);

    gain.gain.setValueAtTime(0.2, audioContext!.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext!.currentTime + i * 0.1 + 0.2);

    osc.start(audioContext!.currentTime + i * 0.1);
    osc.stop(audioContext!.currentTime + i * 0.1 + 0.2);
  });
}

function playUIClick(): void {
  if (!settings.fx || !audioContext) return;
  if (audioContext.state === "suspended") audioContext.resume();

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.type = "sine";
  osc.frequency.setValueAtTime(600, audioContext.currentTime);

  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.05);
}

// ============= HAPTICS =============
function triggerHaptic(type: string): void {
  if (!settings.haptics) return;
  if (typeof (window as any).triggerHaptic === "function") {
    (window as any).triggerHaptic(type);
  }
}

// ============= ARENA SETUP =============
// Arena bounds for constrained gameplay
let arenaLeft = 0;
let arenaRight = 0;
let arenaWidth = 0;

function setupArena(): void {
  console.log("[setupArena] Setting up arena for dimensions:", w, "x", h);

  platforms = [];
  deathZones = [];

  // Constrain arena width for consistent gameplay
  arenaWidth = Math.min(w, CONFIG.MAX_ARENA_WIDTH);
  arenaLeft = (w - arenaWidth) / 2;
  arenaRight = arenaLeft + arenaWidth;

  const platformHeight = 20;
  const groundY = h - 80;
  const pitWidth = 70; // Fixed pit width for consistency

  // Main ground platform (center, with gaps on sides for pits)
  platforms.push({
    x: arenaLeft + pitWidth,
    y: groundY,
    width: arenaWidth - pitWidth * 2,
    height: platformHeight,
  });

  // Floating platforms
  const platformY1 = groundY - 100;
  const platformY2 = groundY - 190;

  // Left floating platform
  platforms.push({
    x: arenaLeft + arenaWidth * 0.08,
    y: platformY1,
    width: arenaWidth * 0.28,
    height: platformHeight,
  });

  // Right floating platform
  platforms.push({
    x: arenaLeft + arenaWidth * 0.64,
    y: platformY1,
    width: arenaWidth * 0.28,
    height: platformHeight,
  });

  // Center top platform
  platforms.push({
    x: arenaLeft + arenaWidth * 0.3,
    y: platformY2,
    width: arenaWidth * 0.4,
    height: platformHeight,
  });

  // Death zones - LEFT PIT
  deathZones.push({
    x: arenaLeft - 20,
    y: groundY,
    width: pitWidth + 20,
    height: h - groundY + 50,
  });

  // Death zones - RIGHT PIT
  deathZones.push({
    x: arenaRight - pitWidth,
    y: groundY,
    width: pitWidth + 20,
    height: h - groundY + 50,
  });

  // Bottom of screen death zone (fallback)
  deathZones.push({
    x: 0,
    y: h - 10,
    width: w,
    height: 30,
  });

  // Side death zones if arena is narrower than screen (falling off sides)
  if (arenaLeft > 0) {
    // Left side of screen
    deathZones.push({
      x: -20,
      y: 0,
      width: arenaLeft + 20,
      height: h,
    });
    // Right side of screen
    deathZones.push({
      x: arenaRight,
      y: 0,
      width: w - arenaRight + 20,
      height: h,
    });
  }

  console.log("[setupArena] Arena constrained to", arenaWidth, "px wide, from", arenaLeft, "to", arenaRight);
}

// ============= PLAYER CREATION =============
function createPlayer(x: number, y: number, colorIndex: number, isPlayer: boolean): Player {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    radius: isPlayer ? CONFIG.PLAYER_RADIUS : CONFIG.BOT_RADIUS,
    color: CONFIG.PLAYER_COLORS[colorIndex % CONFIG.PLAYER_COLORS.length],
    isGrounded: false,
    isAiming: false,
    aimAngle: isPlayer ? -Math.PI / 2 : Math.random() * Math.PI * 2,
    lastShotTime: 0,
    hitStunEnd: 0,
    isPlayer,
    isAlive: true,
    chargeStartTime: 0,
    aiTargetX: x,
    aiLastDecisionTime: 0,
    aiWantsToJump: false,
    aiWantsToShoot: false,
    aiChargeTime: 0,
  };
}

function spawnPlayers(): void {
  players = [];
  botCount = 0;

  const groundY = h - 80 - CONFIG.PLAYER_RADIUS - 5;

  // Spawn player in center of arena (safe zone)
  const centerX = arenaLeft + arenaWidth * 0.5;
  players.push(createPlayer(centerX, groundY - 50, 0, true));

  // Spawn first bot
  spawnNewBot();

  console.log("[spawnPlayers] Spawned player and initial bot");
}

function spawnNewBot(): void {
  const groundY = h - 80 - CONFIG.BOT_RADIUS - 5;

  // Random spawn position in arena safe zone (away from pits)
  const spawnX = arenaLeft + arenaWidth * 0.25 + Math.random() * arenaWidth * 0.5;

  // Spawn above the arena and let them fall
  const spawnY = groundY - 100 - Math.random() * 50;

  botCount++;
  const colorIndex = botCount % (CONFIG.PLAYER_COLORS.length - 1) + 1; // Skip player color

  players.push(createPlayer(spawnX, spawnY, colorIndex, false));

  // Visual/audio feedback
  spawnParticles(spawnX, spawnY, CONFIG.PLAYER_COLORS[colorIndex], 10);
  triggerHaptic("medium");

  console.log("[spawnNewBot] Spawned bot #" + botCount);
}

// ============= PHYSICS =============
function updatePlayerPhysics(player: Player): void {
  if (!player.isAlive) return;

  // Apply gravity
  player.vy += CONFIG.GRAVITY;
  player.vy = Math.min(player.vy, CONFIG.TERMINAL_VELOCITY);

  // Apply friction
  if (player.isGrounded) {
    player.vx *= CONFIG.PLAYER_GROUND_FRICTION;
  } else {
    player.vx *= CONFIG.PLAYER_AIR_FRICTION;
  }

  // Update position
  player.x += player.vx;
  player.y += player.vy;

  // Platform collision
  player.isGrounded = false;

  for (const platform of platforms) {
    // Check if player is colliding with platform
    const closestX = clamp(player.x, platform.x, platform.x + platform.width);
    const closestY = clamp(player.y, platform.y, platform.y + platform.height);
    const distX = player.x - closestX;
    const distY = player.y - closestY;
    const dist = Math.sqrt(distX * distX + distY * distY);

    if (dist < player.radius) {
      // Collision detected - resolve it
      const overlap = player.radius - dist;

      if (dist > 0) {
        const nx = distX / dist;
        const ny = distY / dist;

        player.x += nx * overlap;
        player.y += ny * overlap;

        // If landing on top of platform
        if (ny < -0.5 && player.vy > 0) {
          player.vy = 0;
          player.isGrounded = true;
        } else if (ny > 0.5 && player.vy < 0) {
          // Hit from below
          player.vy = 0;
        } else {
          // Side collision
          player.vx *= -CONFIG.PLAYER_BOUNCE;
        }
      }
    }
  }

  // No wall collision on sides - players can fall off into pits
  // Just prevent going too far off screen for visual purposes
  if (player.x < -50 || player.x > w + 50) {
    // Let death zones handle this
  }

  // Ceiling collision
  if (player.y - player.radius < 0) {
    player.y = player.radius;
    player.vy = 0;
  }
}

function checkDeathZones(player: Player): boolean {
  for (const zone of deathZones) {
    if (
      player.x > zone.x &&
      player.x < zone.x + zone.width &&
      player.y > zone.y
    ) {
      return true;
    }
  }
  return false;
}

// Player-to-player collision
function handlePlayerCollisions(): void {
  for (let i = 0; i < players.length; i++) {
    const p1 = players[i];
    if (!p1.isAlive) continue;

    for (let j = i + 1; j < players.length; j++) {
      const p2 = players[j];
      if (!p2.isAlive) continue;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = p1.radius + p2.radius;

      if (dist < minDist && dist > 0) {
        // Collision! Push players apart
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        // Push each player away by half the overlap
        const pushX = nx * overlap * 0.5;
        const pushY = ny * overlap * 0.5;

        p1.x -= pushX;
        p1.y -= pushY;
        p2.x += pushX;
        p2.y += pushY;

        // Exchange some velocity (bounce off each other)
        const relVelX = p1.vx - p2.vx;
        const relVelY = p1.vy - p2.vy;
        const relVelDotNormal = relVelX * nx + relVelY * ny;

        // Only resolve if moving towards each other
        if (relVelDotNormal > 0) {
          const bounce = 0.5;
          const impulse = relVelDotNormal * bounce;

          p1.vx -= impulse * nx;
          p1.vy -= impulse * ny;
          p2.vx += impulse * nx;
          p2.vy += impulse * ny;
        }
      }
    }
  }
}

// ============= ARROWS =============
function getChargeLevel(chargeStartTime: number): number {
  if (chargeStartTime === 0) return 0;
  const now = Date.now();
  const chargeTime = now - chargeStartTime;
  // Clamp between 0 and 1 based on charge time
  return clamp((chargeTime - CONFIG.CHARGE_MIN_TIME) / (CONFIG.CHARGE_MAX_TIME - CONFIG.CHARGE_MIN_TIME), 0, 1);
}

function createArrow(player: Player, playerId: number): void {
  const now = Date.now();
  if (now - player.lastShotTime < CONFIG.ARROW_COOLDOWN) return;

  // Calculate charge level (0 to 1)
  const chargeLevel = player.chargeStartTime > 0 ? getChargeLevel(player.chargeStartTime) : 0;

  // Calculate speed and knockback multipliers based on charge
  const speedMult = lerp(CONFIG.CHARGE_MIN_SPEED_MULT, CONFIG.CHARGE_MAX_SPEED_MULT, chargeLevel);
  const knockbackMult = lerp(CONFIG.CHARGE_MIN_KNOCKBACK_MULT, CONFIG.CHARGE_MAX_KNOCKBACK_MULT, chargeLevel);

  const arrowSpeed = CONFIG.ARROW_SPEED * speedMult;
  const knockbackForce = CONFIG.KNOCKBACK_FORCE * knockbackMult;

  player.lastShotTime = now;
  player.chargeStartTime = 0; // Reset charge

  const spawnDist = player.radius + 5;
  const arrow: Arrow = {
    x: player.x + Math.cos(player.aimAngle) * spawnDist,
    y: player.y + Math.sin(player.aimAngle) * spawnDist,
    vx: Math.cos(player.aimAngle) * arrowSpeed,
    vy: Math.sin(player.aimAngle) * arrowSpeed,
    angle: player.aimAngle,
    ownerId: playerId,
    spawnTime: now,
    isActive: true,
    knockbackForce: knockbackForce,
  };

  arrows.push(arrow);
  playShootSound();
  triggerHaptic(chargeLevel > 0.7 ? "medium" : "light");

  console.log("[createArrow] Player", playerId, "fired arrow with charge", (chargeLevel * 100).toFixed(0) + "%");
}

function updateArrows(): void {
  const now = Date.now();

  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i];

    if (!arrow.isActive) {
      arrows.splice(i, 1);
      continue;
    }

    // Apply gravity to arrow
    arrow.vy += CONFIG.ARROW_GRAVITY;

    // Move arrow
    arrow.x += arrow.vx;
    arrow.y += arrow.vy;

    // Update arrow angle to match trajectory
    arrow.angle = Math.atan2(arrow.vy, arrow.vx);

    // Check lifetime
    if (now - arrow.spawnTime > CONFIG.ARROW_LIFETIME) {
      arrow.isActive = false;
      continue;
    }

    // Check wall collision
    if (arrow.x < 0 || arrow.x > w || arrow.y < 0) {
      arrow.isActive = false;
      spawnParticles(arrow.x, arrow.y, "#fff", 5);
      continue;
    }

    // Check platform collision
    for (const platform of platforms) {
      if (
        arrow.x > platform.x &&
        arrow.x < platform.x + platform.width &&
        arrow.y > platform.y &&
        arrow.y < platform.y + platform.height
      ) {
        arrow.isActive = false;
        spawnParticles(arrow.x, arrow.y, "#fff", 5);
        break;
      }
    }

    if (!arrow.isActive) continue;

    // Check player collision
    for (let j = 0; j < players.length; j++) {
      const player = players[j];
      if (!player.isAlive) continue;
      if (j === arrow.ownerId) continue; // Can't hit yourself

      const dist = distance(arrow.x, arrow.y, player.x, player.y);
      if (dist < player.radius) {
        // Hit!
        arrow.isActive = false;

        // Apply knockback (uses arrow's knockback force based on charge)
        const knockbackAngle = arrow.angle;
        player.vx += Math.cos(knockbackAngle) * arrow.knockbackForce;
        player.vy += Math.sin(knockbackAngle) * arrow.knockbackForce;
        player.hitStunEnd = now + CONFIG.HIT_STUN_DURATION;
        player.isGrounded = false;

        // Effects - stronger feedback for charged shots
        playHitSound();
        const isStrongHit = arrow.knockbackForce > CONFIG.KNOCKBACK_FORCE;
        triggerHaptic(isStrongHit ? "heavy" : "medium");
        screenShake = isStrongHit ? 12 : 8;
        spawnParticles(arrow.x, arrow.y, player.color, isStrongHit ? 25 : 15);

        console.log("[updateArrows] Player", arrow.ownerId, "hit player", j, "with force", arrow.knockbackForce.toFixed(1));
        break;
      }
    }
  }
}

// ============= AI =============
function isNearDeathZone(x: number): boolean {
  const safeMargin = 80;
  // Check if near arena edges (where pits are)
  return x < arenaLeft + safeMargin || x > arenaRight - safeMargin;
}

function getSafeTargetX(currentX: number, desiredX: number): number {
  const safeMargin = 100;
  const safeMin = arenaLeft + safeMargin;
  const safeMax = arenaRight - safeMargin;
  // Clamp desired position to safe zone within arena
  return clamp(desiredX, safeMin, safeMax);
}

function updateAI(player: Player, playerIndex: number): void {
  if (!player.isAlive || player.isPlayer) return;

  const now = Date.now();
  const humanPlayer = players.find(p => p.isPlayer && p.isAlive);

  // EMERGENCY: If near death zone, immediately move to safety
  if (isNearDeathZone(player.x) && now > player.hitStunEnd) {
    // Move towards arena center urgently
    const centerX = arenaLeft + arenaWidth / 2;
    player.aiTargetX = centerX;
    const dx = player.aiTargetX - player.x;
    player.vx += Math.sign(dx) * CONFIG.PLAYER_MOVE_SPEED * 0.5;

    // Jump if grounded to help recover
    if (player.isGrounded && Math.abs(player.vx) < 2) {
      player.vy = -CONFIG.PLAYER_JUMP_FORCE;
      player.isGrounded = false;
    }
    return;
  }

  // Make decisions periodically
  if (now - player.aiLastDecisionTime > CONFIG.AI_REACTION_TIME) {
    player.aiLastDecisionTime = now;

    // Find target (prefer human player, or nearest alive enemy)
    let target: Player | null = humanPlayer || null;
    if (!target) {
      let nearestDist = Infinity;
      for (let i = 0; i < players.length; i++) {
        if (i === playerIndex || !players[i].isAlive) continue;
        const dist = distance(player.x, player.y, players[i].x, players[i].y);
        if (dist < nearestDist) {
          nearestDist = dist;
          target = players[i];
        }
      }
    }

    if (target) {
      // Decide movement
      const dx = target.x - player.x;

      // Move towards target but maintain some distance
      let desiredX = player.x;
      if (Math.abs(dx) > 120) {
        desiredX = player.x + Math.sign(dx) * 80;
      } else if (Math.abs(dx) < 60) {
        desiredX = player.x - Math.sign(dx) * 40;
      }

      // Keep target position in safe zone (away from pits)
      player.aiTargetX = getSafeTargetX(player.x, desiredX);

      // Random jump (less frequent)
      player.aiWantsToJump = Math.random() < 0.08 && player.isGrounded;

      // Aim towards target with some variance
      const targetAngle = Math.atan2(target.y - player.y, target.x - player.x);
      const variance = (Math.random() - 0.5) * CONFIG.AI_AIM_VARIANCE * (Math.PI / 180);
      player.aimAngle = targetAngle + variance;

      // Decide to start charging (if not already)
      if (player.chargeStartTime === 0 && Math.random() < 0.3) {
        player.chargeStartTime = now;
        player.aiChargeTime = CONFIG.CHARGE_MIN_TIME + Math.random() * (CONFIG.CHARGE_MAX_TIME - CONFIG.CHARGE_MIN_TIME) * 0.7;
        player.isAiming = true;
      }
    } else {
      // No target, wander in safe zone within arena
      player.aiTargetX = getSafeTargetX(player.x, arenaLeft + arenaWidth * 0.3 + Math.random() * arenaWidth * 0.4);
      player.aiWantsToJump = Math.random() < 0.05 && player.isGrounded;
      player.chargeStartTime = 0; // Stop charging if no target
      player.isAiming = false;
    }
  }

  // Execute movement (slower, more controlled, even slower while charging)
  const moveSpeedMult = player.chargeStartTime > 0 ? 0.5 : 1.0;
  const dx = player.aiTargetX - player.x;
  if (Math.abs(dx) > 15 && now > player.hitStunEnd) {
    player.vx += Math.sign(dx) * CONFIG.PLAYER_MOVE_SPEED * 0.2 * moveSpeedMult;
  }

  // Execute jump
  if (player.aiWantsToJump && player.isGrounded && now > player.hitStunEnd) {
    player.vy = -CONFIG.PLAYER_JUMP_FORCE;
    player.isGrounded = false;
    player.aiWantsToJump = false;
  }

  // Execute shooting - fire when charge time reached
  if (player.chargeStartTime > 0 && now > player.hitStunEnd) {
    const chargeTime = now - player.chargeStartTime;
    if (chargeTime >= player.aiChargeTime) {
      createArrow(player, playerIndex);
      player.chargeStartTime = 0;
      player.isAiming = false;
    }
  }
}

// ============= PARTICLES =============
function spawnParticles(x: number, y: number, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 500,
      maxLife: 500,
      size: 3 + Math.random() * 4,
      color,
    });
  }
}

function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2; // Gravity
    p.life -= dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ============= INPUT HANDLING =============
function handlePlayerInput(): void {
  const player = players.find(p => p.isPlayer && p.isAlive);
  if (!player) return;

  const now = Date.now();
  if (now < player.hitStunEnd) return; // In hit stun

  // Check if charging (Z key held or mobile aim)
  const isCharging = keysDown.has("z") || keysDown.has("Z") || mobileAiming;
  player.isAiming = isCharging;

  // Start charging if Z just pressed
  if (isCharging && player.chargeStartTime === 0) {
    player.chargeStartTime = now;
  }

  if (isCharging) {
    // WHILE CHARGING: Can only jump and rotate aim - NO movement
    // Aim rotation with A/D or arrow keys
    if (keysDown.has("a") || keysDown.has("A") || keysDown.has("ArrowLeft")) {
      player.aimAngle -= CONFIG.AIM_ROTATION_SPEED * (Math.PI / 180);
    }
    if (keysDown.has("d") || keysDown.has("D") || keysDown.has("ArrowRight")) {
      player.aimAngle += CONFIG.AIM_ROTATION_SPEED * (Math.PI / 180);
    }

    // Use mobile aim angle if mobile aiming
    if (mobileAiming) {
      player.aimAngle = mobileAimAngle;
    }

    player.aimAngle = normalizeAngle(player.aimAngle);
  } else {
    // NOT CHARGING: Can move with A/D
    if (keysDown.has("a") || keysDown.has("A") || keysDown.has("ArrowLeft")) {
      player.vx -= CONFIG.PLAYER_MOVE_SPEED * 0.4;
    }
    if (keysDown.has("d") || keysDown.has("D") || keysDown.has("ArrowRight")) {
      player.vx += CONFIG.PLAYER_MOVE_SPEED * 0.4;
    }
  }

  // Clamp velocity
  player.vx = clamp(player.vx, -CONFIG.PLAYER_MAX_VELOCITY, CONFIG.PLAYER_MAX_VELOCITY);

  // Jump (can jump anytime, including while charging)
  if ((keysDown.has("w") || keysDown.has("W")) && player.isGrounded) {
    player.vy = -CONFIG.PLAYER_JUMP_FORCE;
    player.isGrounded = false;
    playJumpSound();
    triggerHaptic("light");
  }
}

// ============= DRAWING =============
function drawBackground(): void {
  // Sky gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#3a5a80");
  gradient.addColorStop(1, CONFIG.BACKGROUND_COLOR);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Decorative clouds
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  for (let i = 0; i < 5; i++) {
    const x = (i * w / 4 + Date.now() * 0.01) % (w + 200) - 100;
    const y = 50 + i * 30;
    ctx.beginPath();
    ctx.arc(x, y, 40, 0, Math.PI * 2);
    ctx.arc(x + 30, y - 10, 30, 0, Math.PI * 2);
    ctx.arc(x + 60, y, 35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlatforms(): void {
  ctx.fillStyle = CONFIG.PLATFORM_COLOR;
  ctx.strokeStyle = CONFIG.PLATFORM_STROKE;
  ctx.lineWidth = 4;

  for (const platform of platforms) {
    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(platform.x + 4, platform.y + 4, platform.width, platform.height);

    // Platform
    ctx.fillStyle = CONFIG.PLATFORM_COLOR;
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);

    // Top highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(platform.x, platform.y, platform.width, 4);
  }
}

function drawDeathZones(): void {
  ctx.fillStyle = CONFIG.DEATH_ZONE_COLOR;

  for (const zone of deathZones) {
    // Danger stripes
    const stripeWidth = 20;
    for (let x = zone.x; x < zone.x + zone.width; x += stripeWidth * 2) {
      ctx.fillStyle = CONFIG.DEATH_ZONE_COLOR;
      ctx.fillRect(x, zone.y, stripeWidth, zone.height);
      ctx.fillStyle = "#fca311";
      ctx.fillRect(x + stripeWidth, zone.y, stripeWidth, zone.height);
    }
  }
}

function drawPlayer(player: Player, index: number): void {
  if (!player.isAlive) return;

  ctx.save();
  ctx.translate(player.x, player.y);

  // Shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(4, player.radius - 5, player.radius * 0.8, player.radius * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glow effect
  const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, player.radius * 1.5);
  glowGradient.addColorStop(0, hexToRgba(player.color, 0.3));
  glowGradient.addColorStop(1, hexToRgba(player.color, 0));
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Main body
  ctx.fillStyle = player.color;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Inner highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(-player.radius * 0.3, -player.radius * 0.3, player.radius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeOffset = player.radius * 0.25;
  const eyeRadius = player.radius * 0.15;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-eyeOffset, -eyeOffset * 0.5, eyeRadius, 0, Math.PI * 2);
  ctx.arc(eyeOffset, -eyeOffset * 0.5, eyeRadius, 0, Math.PI * 2);
  ctx.fill();

  // Pupils - look in aim direction if aiming
  const pupilOffset = player.isAiming ? 2 : 0;
  const pupilX = Math.cos(player.aimAngle) * pupilOffset;
  const pupilY = Math.sin(player.aimAngle) * pupilOffset;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(-eyeOffset + pupilX, -eyeOffset * 0.5 + pupilY, eyeRadius * 0.5, 0, Math.PI * 2);
  ctx.arc(eyeOffset + pupilX, -eyeOffset * 0.5 + pupilY, eyeRadius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Draw aim indicator if aiming/charging
  if (player.isAiming && player.chargeStartTime > 0) {
    const chargeLevel = getChargeLevel(player.chargeStartTime);

    // Aim length grows with charge
    const baseAimLength = 40;
    const maxAimLength = 80;
    const aimLength = baseAimLength + (maxAimLength - baseAimLength) * chargeLevel;

    const aimStartX = Math.cos(player.aimAngle) * player.radius;
    const aimStartY = Math.sin(player.aimAngle) * player.radius;
    const aimEndX = Math.cos(player.aimAngle) * (player.radius + aimLength);
    const aimEndY = Math.sin(player.aimAngle) * (player.radius + aimLength);

    // Color changes from white to yellow to red with charge
    let aimColor: string;
    if (chargeLevel < 0.5) {
      aimColor = `rgba(255, 255, ${255 - chargeLevel * 200}, 0.9)`;
    } else {
      aimColor = `rgba(255, ${255 - (chargeLevel - 0.5) * 300}, 50, 0.9)`;
    }

    // Aim line - thickness grows with charge
    ctx.strokeStyle = aimColor;
    ctx.lineWidth = 3 + chargeLevel * 4;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(aimStartX, aimStartY);
    ctx.lineTo(aimEndX, aimEndY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow head - size grows with charge
    const arrowSize = 10 + chargeLevel * 8;
    const arrowAngle = player.aimAngle;
    ctx.fillStyle = aimColor;
    ctx.beginPath();
    ctx.moveTo(aimEndX, aimEndY);
    ctx.lineTo(
      aimEndX - Math.cos(arrowAngle - 0.4) * arrowSize,
      aimEndY - Math.sin(arrowAngle - 0.4) * arrowSize
    );
    ctx.lineTo(
      aimEndX - Math.cos(arrowAngle + 0.4) * arrowSize,
      aimEndY - Math.sin(arrowAngle + 0.4) * arrowSize
    );
    ctx.closePath();
    ctx.fill();

    // Charge bar around player
    if (chargeLevel > 0) {
      ctx.strokeStyle = aimColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, player.radius + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeLevel);
      ctx.stroke();
    }
  }

  // Player indicator (only for human player)
  if (player.isPlayer) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Fredoka";
    ctx.textAlign = "center";
    ctx.fillText("YOU", 0, -player.radius - 10);
  }

  ctx.restore();
}

function drawArrows(): void {
  for (const arrow of arrows) {
    if (!arrow.isActive) continue;

    ctx.save();
    ctx.translate(arrow.x, arrow.y);
    ctx.rotate(arrow.angle);

    // Arrow shaft
    ctx.fillStyle = "#8b4513";
    ctx.fillRect(-CONFIG.ARROW_LENGTH / 2, -CONFIG.ARROW_WIDTH / 2, CONFIG.ARROW_LENGTH, CONFIG.ARROW_WIDTH);

    // Arrow head
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.moveTo(CONFIG.ARROW_LENGTH / 2 + 10, 0);
    ctx.lineTo(CONFIG.ARROW_LENGTH / 2, -6);
    ctx.lineTo(CONFIG.ARROW_LENGTH / 2, 6);
    ctx.closePath();
    ctx.fill();

    // Fletching
    ctx.fillStyle = "#c00";
    ctx.beginPath();
    ctx.moveTo(-CONFIG.ARROW_LENGTH / 2, 0);
    ctx.lineTo(-CONFIG.ARROW_LENGTH / 2 - 8, -5);
    ctx.lineTo(-CONFIG.ARROW_LENGTH / 2 - 5, 0);
    ctx.lineTo(-CONFIG.ARROW_LENGTH / 2 - 8, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function drawParticles(): void {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = hexToRgba(p.color, alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============= GAME STATE =============
function resetGame(): void {
  console.log("[resetGame] Resetting game");
  totalKills = 0;
  botCount = 0;
  currentWave = 1;
  gameStartTime = Date.now();
  nextBotSpawnTime = gameStartTime + CONFIG.BOT_SPAWN_INTERVAL;

  arrows = [];
  particles = [];
  screenShake = 0;

  setupArena();
  spawnPlayers();

  updateHUD();
}

function updateHUD(): void {
  // Show survival time
  const survivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
  roundDisplay.textContent = survivalTime + "s";
  killsDisplay.textContent = totalKills.toString();
}

function getCountdownToNextBot(): number {
  const now = Date.now();
  return Math.max(0, Math.ceil((nextBotSpawnTime - now) / 1000));
}

function checkGameState(): void {
  const now = Date.now();
  const humanAlive = players.some(p => p.isPlayer && p.isAlive);

  // Check deaths
  for (const player of players) {
    if (!player.isAlive) continue;

    if (checkDeathZones(player)) {
      player.isAlive = false;
      playDeathSound();
      triggerHaptic("heavy");
      screenShake = 15;
      spawnParticles(player.x, player.y, player.color, 30);

      if (!player.isPlayer) {
        totalKills++;
      }

      console.log("[checkGameState] Player died:", player.isPlayer ? "HUMAN" : "BOT");
    }
  }

  // Check game over
  if (!humanAlive) {
    gameOver();
    return;
  }

  // Spawn new wave - top up bots to match wave number
  if (now >= nextBotSpawnTime) {
    currentWave++;
    const aliveBots = players.filter(p => !p.isPlayer && p.isAlive).length;
    const botsToSpawn = Math.max(0, currentWave - aliveBots);
    for (let i = 0; i < botsToSpawn; i++) {
      spawnNewBot();
    }
    nextBotSpawnTime = now + CONFIG.BOT_SPAWN_INTERVAL;
    playWinSound(); // Alert sound for new wave
  }

  // Update HUD
  updateHUD();
}

function gameOver(): void {
  const survivalTime = Math.floor((Date.now() - gameStartTime) / 1000);
  console.log("[gameOver] Game over after", survivalTime, "s with", totalKills, "kills");
  gameState = "GAME_OVER";

  // Submit score
  if (typeof (window as any).submitScore === "function") {
    (window as any).submitScore(totalKills);
    console.log("[gameOver] Score submitted:", totalKills);
  }

  triggerHaptic("error");

  // Update UI
  finalScore.textContent = totalKills.toString();
  finalRound.textContent = "Wave " + currentWave + " | " + survivalTime + "s";

  // Hide gameplay UI
  hud.classList.add("hidden");
  mobileControls.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  pauseBtn.classList.add("hidden");

  // Show game over screen
  gameOverScreen.classList.remove("hidden");
}

function startGame(): void {
  console.log("[startGame] Starting game");
  gameState = "PLAYING";
  initAudio();
  resetGame();

  // Show gameplay UI
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  hud.classList.remove("hidden");
  settingsBtn.classList.remove("hidden");
  pauseBtn.classList.remove("hidden");
  if (isMobile) {
    mobileControls.classList.remove("hidden");
  }

  playUIClick();
  triggerHaptic("light");
}

function pauseGame(): void {
  if (gameState !== "PLAYING") return;
  console.log("[pauseGame] Game paused");
  gameState = "PAUSED";
  pauseScreen.classList.remove("hidden");
  triggerHaptic("light");
}

function resumeGame(): void {
  if (gameState !== "PAUSED") return;
  console.log("[resumeGame] Game resumed");
  gameState = "PLAYING";
  pauseScreen.classList.add("hidden");
  triggerHaptic("light");
}

function showStartScreen(): void {
  console.log("[showStartScreen] Showing start screen");
  gameState = "START";

  startScreen.classList.remove("hidden");
  gameOverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  hud.classList.add("hidden");
  mobileControls.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  pauseBtn.classList.add("hidden");
}

// ============= INPUT SETUP =============
function setupInputHandlers(): void {
  // Keyboard
  window.addEventListener("keydown", (e) => {
    keysDown.add(e.key);

    if (e.key === "Escape") {
      if (gameState === "PLAYING") pauseGame();
      else if (gameState === "PAUSED") resumeGame();
    }

    if (e.key === " " && gameState === "START") {
      startGame();
    }
  });

  window.addEventListener("keyup", (e) => {
    keysDown.delete(e.key);

    // Fire arrow on Z release (if was charging)
    if ((e.key === "z" || e.key === "Z") && gameState === "PLAYING") {
      const player = players.find(p => p.isPlayer && p.isAlive);
      if (player && player.chargeStartTime > 0) {
        createArrow(player, 0);
        player.chargeStartTime = 0; // Reset charge
        player.isAiming = false;
      }
    }
  });

  // UI Buttons
  document.getElementById("startButton")!.addEventListener("click", () => {
    startGame();
  });

  settingsBtn.addEventListener("click", () => {
    settingsModal.classList.remove("hidden");
    playUIClick();
    triggerHaptic("light");
  });

  document.getElementById("settingsClose")!.addEventListener("click", () => {
    settingsModal.classList.add("hidden");
    playUIClick();
    triggerHaptic("light");
  });

  pauseBtn.addEventListener("click", pauseGame);
  document.getElementById("resumeButton")!.addEventListener("click", resumeGame);
  document.getElementById("pauseRestartButton")!.addEventListener("click", () => {
    pauseScreen.classList.add("hidden");
    startGame();
  });
  document.getElementById("pauseMenuButton")!.addEventListener("click", showStartScreen);

  document.getElementById("restartButton")!.addEventListener("click", startGame);
  document.getElementById("backToStartButton")!.addEventListener("click", showStartScreen);

  // Settings toggles
  const musicToggle = document.getElementById("musicToggle")!;
  const fxToggle = document.getElementById("fxToggle")!;
  const hapticToggle = document.getElementById("hapticToggle")!;

  musicToggle.classList.toggle("active", settings.music);
  fxToggle.classList.toggle("active", settings.fx);
  hapticToggle.classList.toggle("active", settings.haptics);

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    musicToggle.classList.toggle("active", settings.music);
    localStorage.setItem("arrowArena_music", settings.music.toString());
    playUIClick();
    triggerHaptic("light");
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    fxToggle.classList.toggle("active", settings.fx);
    localStorage.setItem("arrowArena_fx", settings.fx.toString());
    if (settings.fx) playUIClick();
    triggerHaptic("light");
  });

  hapticToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    hapticToggle.classList.toggle("active", settings.haptics);
    localStorage.setItem("arrowArena_haptics", settings.haptics.toString());
    playUIClick();
    triggerHaptic("light");
  });

  // Mobile controls
  setupMobileControls();
}

function setupMobileControls(): void {
  const leftBtn = document.getElementById("leftBtn")!;
  const rightBtn = document.getElementById("rightBtn")!;
  const jumpBtn = document.getElementById("jumpBtn")!;
  const aimArea = document.getElementById("aimArea")!;
  const aimIndicator = document.getElementById("aimIndicator")!;

  function addButtonHandler(btn: HTMLElement, key: string): void {
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      keysDown.add(key);
      btn.classList.add("active");
      triggerHaptic("light");
    }, { passive: false });

    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      keysDown.delete(key);
      btn.classList.remove("active");
    }, { passive: false });

    btn.addEventListener("touchcancel", () => {
      keysDown.delete(key);
      btn.classList.remove("active");
    });
  }

  addButtonHandler(leftBtn, "a");
  addButtonHandler(rightBtn, "d");
  addButtonHandler(jumpBtn, "w");

  // Aim area - tap and drag to aim
  let aimStartX = 0;
  let aimStartY = 0;

  aimArea.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = aimArea.getBoundingClientRect();
    aimStartX = rect.left + rect.width / 2;
    aimStartY = rect.top + rect.height / 2;
    mobileAiming = true;
    triggerHaptic("light");
  }, { passive: false });

  aimArea.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!mobileAiming) return;

    const touch = e.touches[0];
    const dx = touch.clientX - aimStartX;
    const dy = touch.clientY - aimStartY;

    mobileAimAngle = Math.atan2(dy, dx);

    // Update indicator position
    const dist = Math.min(50, Math.sqrt(dx * dx + dy * dy));
    const indicatorX = Math.cos(mobileAimAngle) * dist;
    const indicatorY = Math.sin(mobileAimAngle) * dist;
    aimIndicator.style.transform = `translate(${indicatorX}px, ${indicatorY}px)`;
  }, { passive: false });

  aimArea.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (mobileAiming && gameState === "PLAYING") {
      const player = players.find(p => p.isPlayer && p.isAlive);
      if (player) {
        player.aimAngle = mobileAimAngle;
        createArrow(player, 0);
      }
    }
    mobileAiming = false;
    aimIndicator.style.transform = "translate(0, 0)";
  }, { passive: false });

  aimArea.addEventListener("touchcancel", () => {
    mobileAiming = false;
    aimIndicator.style.transform = "translate(0, 0)";
  });
}

// ============= RESIZE =============
function resizeCanvas(): void {
  w = gameContainer.clientWidth;
  h = gameContainer.clientHeight;
  canvas.width = w;
  canvas.height = h;

  if (gameState === "PLAYING") {
    setupArena();
  }

  console.log("[resizeCanvas] Canvas resized to:", w, "x", h);
}

// ============= GAME LOOP =============
let lastTime = 0;

function gameLoop(timestamp: number): void {
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;

  ctx.save();

  // Screen shake
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
    screenShake *= 0.9;
    if (screenShake < 0.5) screenShake = 0;
  }

  // Draw background
  drawBackground();
  drawDeathZones();
  drawPlatforms();

  if (gameState === "PLAYING") {
    // Handle input
    handlePlayerInput();

    // Update AI
    for (let i = 0; i < players.length; i++) {
      updateAI(players[i], i);
    }

    // Update physics
    for (const player of players) {
      updatePlayerPhysics(player);
    }

    // Handle player-to-player collisions
    handlePlayerCollisions();

    // Update arrows
    updateArrows();

    // Check game state (deaths, new bot spawns)
    checkGameState();

    // Update particles
    updateParticles(dt);

    // Draw game objects
    drawArrows();
    for (let i = 0; i < players.length; i++) {
      drawPlayer(players[i], i);
    }
    drawParticles();

    // Draw wave info and countdown
    const countdown = getCountdownToNextBot();
    const aliveBots = players.filter(p => !p.isPlayer && p.isAlive).length;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // Wave indicator
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "bold 20px Fredoka";
    ctx.fillText("Wave " + currentWave, w / 2, 8);

    // Countdown or warning - shows how many bots will spawn to reach wave number
    const nextWave = currentWave + 1;
    const botsNeeded = Math.max(0, nextWave - aliveBots);
    if (countdown > 0) {
      ctx.fillStyle = "rgba(200, 200, 200, 0.8)";
      ctx.font = "16px Fredoka";
      ctx.fillText("Wave " + nextWave + " in: " + countdown + "s (+" + botsNeeded + " bots)", w / 2, 32);
    } else {
      ctx.fillStyle = "rgba(255, 100, 100, 0.9)";
      ctx.font = "bold 16px Fredoka";
      ctx.fillText("WAVE " + nextWave + "!", w / 2, 32);
    }

    // Active bots count
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "14px Fredoka";
    ctx.fillText("Active bots: " + aliveBots, w / 2, 52);
  } else if (gameState === "START") {
    // Draw preview players
    const previewY = h * 0.6;
    const player1 = createPlayer(w * 0.35, previewY, 0, true);
    const player2 = createPlayer(w * 0.65, previewY, 1, false);
    player1.aimAngle = 0;
    player2.aimAngle = Math.PI;

    drawPlayer(player1, 0);
    drawPlayer(player2, 1);
  }

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// ============= INIT =============
function init(): void {
  console.log("[init] Initializing Arrow Arena");

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  setupInputHandlers();

  showStartScreen();

  requestAnimationFrame(gameLoop);

  console.log("[init] Game initialized");
}

init();
