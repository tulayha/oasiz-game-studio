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
  phase: GamePhase;
  ships: ShipState[];
  pilots: PilotState[];
  projectiles: ProjectileState[];
  players: PlayerData[];
  countdown?: number;
  winnerId?: string;
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
} as const;
