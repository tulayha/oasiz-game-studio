// ============= GAME TYPES =============

export type GamePhase =
  | "START" // Main menu
  | "LOBBY" // Waiting for players
  | "COUNTDOWN" // 3-2-1-FIGHT
  | "PLAYING" // Active gameplay
  | "GAME_END"; // Winner determined

export type PlayerState =
  | "ACTIVE" // Has ship, playing
  | "EJECTED" // Pilot mode, surviving
  | "SPECTATING"; // Eliminated, watching

// ============= INPUT =============

export interface PlayerInput {
  buttonA: boolean; // Rotation (hold)
  buttonB: boolean; // Thrust AND Fire (simultaneous)
  timestamp: number;
  // Note: Dash is handled via RPC, not input state
}

// ============= ENTITIES =============

export interface ShipState {
  id: string;
  playerId: string;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  alive: boolean;
  invulnerableUntil: number;
}

export interface PilotState {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnTime: number;
  alive: boolean;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnTime: number;
}

export interface AsteroidState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  size: number;
  alive: boolean;
  vertices: { x: number; y: number }[];
}

export interface PowerUpState {
  id: string;
  x: number;
  y: number;
  type: PowerUpType;
  spawnTime: number;
  alive: boolean;
}

export interface LaserBeamState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  spawnTime: number;
  alive: boolean;
}

export type PowerUpType = "LASER" | "SHIELD";

export type GameMode = "CHAOTIC" | "SANE";

export interface PlayerPowerUp {
  type: PowerUpType;
  charges: number;
  maxCharges: number;
  lastFireTime: number;
  shieldHits: number;
}

// ============= PLAYER =============

export interface PlayerData {
  id: string;
  name: string;
  color: PlayerColor;
  kills: number;
  state: PlayerState;
}

export interface PlayerColor {
  primary: string;
  glow: string;
}

export const PLAYER_COLORS: PlayerColor[] = [
  { primary: "#00f0ff", glow: "#00f0ff" }, // Cyan
  { primary: "#ff00aa", glow: "#ff00aa" }, // Magenta
  { primary: "#ffee00", glow: "#ffee00" }, // Yellow
  { primary: "#00ff88", glow: "#00ff88" }, // Green
];

// ============= NETWORK SYNC =============

export interface GameStateSync {
  // Entity positions for rendering (broadcast every 50ms, unreliable)
  ships: ShipState[];
  pilots: PilotState[];
  projectiles: ProjectileState[];
  asteroids: AsteroidState[];
  powerUps: PowerUpState[];
  laserBeams: LaserBeamState[];
  players: PlayerData[];
  playerPowerUps: Record<string, PlayerPowerUp | null>;
  // Note: phase, countdown, winnerId are sent via RPC (reliable, one-time)
}

// ============= SETTINGS =============

export interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

// ============= PARTICLES =============

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

// ============= CONSTANTS =============

export const GAME_CONFIG = {
  // Win condition
  KILLS_TO_WIN: 5,

  // Arena - FIXED SIZE (scales to fit window)
  ARENA_WIDTH: 1200,
  ARENA_HEIGHT: 800,
  ARENA_PADDING: 50,

  // Ship physics
  BASE_THRUST: 0.00015, // Always-on forward thrust
  ROTATION_SPEED: 4.5, // rad/s
  ROTATION_THRUST_BONUS: 0.00008, // Extra thrust when rotating
  RECOIL_FORCE: 0.0003, // Pushback when shooting
  DASH_FORCE: 0.012,
  SHIP_FRICTION_AIR: 0.002,
  SHIP_RESTITUTION: 0.9,

  // Combat
  FIRE_COOLDOWN: 180, // ms
  PROJECTILE_SPEED: 14,
  PROJECTILE_LIFETIME: 2500, // ms

  // Pilot
  PILOT_SURVIVAL_TIME: 5000, // ms
  PILOT_FRICTION_AIR: 0.01,

  // Respawn
  INVULNERABLE_TIME: 2000, // ms

  // Network
  SYNC_INTERVAL: 50, // ms (20 updates/sec)

  // Countdown
  COUNTDOWN_DURATION: 3, // seconds

  // Asteroids
  ASTEROID_COUNT: 6, // Number of asteroids to spawn
  ASTEROID_MIN_SIZE: 25,
  ASTEROID_MAX_SIZE: 45,
  ASTEROID_MIN_SPEED: 0.5,
  ASTEROID_MAX_SPEED: 2.0,
  ASTEROID_VERTICES_MIN: 6,
  ASTEROID_VERTICES_MAX: 10,
  ASTEROID_COLOR: "#ff8800",
  ASTEROID_GLOW: "#ff4400",

  // Asteroid Spawning
  ASTEROID_SPAWN_INTERVAL_MIN: 2000, // ms
  ASTEROID_SPAWN_INTERVAL_MAX: 5000, // ms
  ASTEROID_SPAWN_BATCH_MIN: 1,
  ASTEROID_SPAWN_BATCH_MAX: 3,
  ASTEROID_SPAWN_MARGIN: 100, // Distance outside arena to spawn

  // Power-ups
  POWERUP_DESPAWN_TIME: 10000, // ms (10 seconds)
  POWERUP_DROP_CHANCE: 0.3, // 30% chance from asteroid
  POWERUP_SIZE: 25,
  POWERUP_LASER_CHARGES: 3,
  POWERUP_LASER_COOLDOWN: 2500, // ms (2.5 seconds between shots)
  POWERUP_SHIELD_HITS: 2,
  POWERUP_BEAM_LENGTH: 800, // Beam length - long but not game-breaking
  POWERUP_BEAM_WIDTH: 8,
} as const;

// Mutable version of GAME_CONFIG type (widens literal types from `as const`)
export type GameConfigType = { [K in keyof typeof GAME_CONFIG]: (typeof GAME_CONFIG)[K] extends number ? number : (typeof GAME_CONFIG)[K] extends string ? string : (typeof GAME_CONFIG)[K] };

// Overrides for "Sane" game mode (slower, more controlled)
export const SANE_OVERRIDES: Partial<GameConfigType> = {
  BASE_THRUST: 0.00008,
  ROTATION_SPEED: 3.0,
  ROTATION_THRUST_BONUS: 0.00004,
  RECOIL_FORCE: 0.00015,
  DASH_FORCE: 0.006,
  SHIP_FRICTION_AIR: 0.003,
  SHIP_RESTITUTION: 0.5,
};

// Physics body-level overrides (not in GAME_CONFIG, applied in Physics.ts)
export const SANE_PHYSICS = {
  WALL_RESTITUTION: 0.5,
  WALL_FRICTION: 0.5,
  SHIP_FRICTION: 0.5,
  SHIP_ANGULAR_DAMPING: 0.1,
};

export const CHAOTIC_PHYSICS = {
  WALL_RESTITUTION: 1,
  WALL_FRICTION: 0,
  SHIP_FRICTION: 0,
  SHIP_ANGULAR_DAMPING: 0,
};
