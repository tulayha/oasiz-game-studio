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
  buttonA: boolean; // Rotation (hold) + Dash (double-tap)
  buttonB: boolean; // Thrust AND Fire (simultaneous)
  dashTriggered: boolean; // True on double-tap frame
  timestamp: number;
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

  // Arena
  ARENA_PADDING: 50,

  // Ship physics
  ROTATION_SPEED: 4.5, // rad/s
  THRUST_FORCE: 0.0004,
  DASH_FORCE: 0.008,
  SHIP_FRICTION_AIR: 0.002,
  SHIP_RESTITUTION: 0.9,

  // Combat
  FIRE_COOLDOWN: 150, // ms
  PROJECTILE_SPEED: 12,
  PROJECTILE_LIFETIME: 2000, // ms

  // Pilot
  PILOT_SURVIVAL_TIME: 5000, // ms
  PILOT_FRICTION_AIR: 0.01,

  // Respawn
  INVULNERABLE_TIME: 2000, // ms
  SPAWN_SAFE_DISTANCE: 150,

  // Network
  SYNC_INTERVAL: 50, // ms (20 updates/sec)

  // Countdown
  COUNTDOWN_DURATION: 3, // seconds
} as const;
