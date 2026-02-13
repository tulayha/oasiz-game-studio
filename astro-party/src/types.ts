// ============= GAME TYPES =============

export type GamePhase =
  | "START" // Main menu
  | "LOBBY" // Waiting for players
  | "COUNTDOWN" // 3-2-1-FIGHT
  | "PLAYING" // Active gameplay
  | "ROUND_END" // Between rounds
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
  clientTimeMs: number;
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
  ammo: number;
  maxAmmo: number;
  lastShotTime: number;
  reloadStartTime: number;
  isReloading: boolean;
}

export interface PilotState {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  survivalProgress: number; // 0-1, computed by host
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
  remainingTimeFraction: number; // 0-1, computed by host (1 = just spawned, 0 = expired)
  alive: boolean;
  magneticRadius?: number; // Detection radius for magnetic pull
  isMagneticActive?: boolean; // Whether the powerup is currently moving toward a player
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

export interface MineState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  spawnTime: number;
  alive: boolean;
  exploded: boolean;
  explosionTime: number;
  arming: boolean;
  armingStartTime: number;
  triggeringPlayerId?: string;
}

export interface HomingMissileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  alive: boolean;
}

export interface TurretState {
  id: string;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  detectionRadius: number;
  orbitRadius: number;
  isTracking: boolean;
  targetAngle: number;
}

export interface TurretBulletState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  alive: boolean;
  exploded: boolean;
  explosionTime: number;
}

export type PowerUpType =
  | "LASER"
  | "SHIELD"
  | "SCATTER"
  | "MINE"
  | "REVERSE"
  | "JOUST"
  | "HOMING_MISSILE";

export type GameMode = "STANDARD" | "SANE" | "CHAOTIC" | "CUSTOM";
export type BaseGameMode = Exclude<GameMode, "CUSTOM">;

export interface PlayerPowerUp {
  type: PowerUpType;
  charges: number;
  maxCharges: number;
  lastFireTime: number;
  shieldHits: number;
  // Joust-specific fields
  leftSwordActive?: boolean;
  rightSwordActive?: boolean;
}

// ============= PLAYER =============

export interface PlayerData {
  id: string;
  name: string;
  color: PlayerColor;
  kills: number;
  roundWins: number;
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
  mines: MineState[];
  homingMissiles: HomingMissileState[];
  turret?: TurretState;
  turretBullets: TurretBulletState[];
  playerPowerUps?: Record<string, PlayerPowerUp | null>;
  rotationDirection: number; // 1 for normal, -1 for reversed
  screenShakeIntensity: number;
  screenShakeDuration: number;
  hostTick: number; // Host simulation tick for buffered interpolation
  tickDurationMs: number; // Host fixed tick duration (typically 16.667ms)
  // Note: phase, countdown, winnerId are sent via RPC (reliable, one-time)
}

export interface DashParticleEvent {
  playerId: string;
  x: number;
  y: number;
  angle: number; // Ship angle for particle direction
  color: string;
  timestamp: number;
}

export interface RoundResultPayload {
  roundNumber: number;
  winnerId?: string;
  winnerName?: string;
  isTie: boolean;
  roundWinsById: Record<string, number>;
}

// ============= SETTINGS =============

export interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
  controlHints: boolean;
}

// ============= ADVANCED SETTINGS =============

export type AsteroidDensity = "NONE" | "SOME" | "MANY" | "SPAWN";
export type SpeedPreset = "SLOW" | "NORMAL" | "FAST";
export type DashPreset = "LOW" | "NORMAL" | "HIGH";
export type ModePreset = "STANDARD" | "SANE" | "CHAOTIC";

export interface AdvancedSettings {
  asteroidDensity: AsteroidDensity;
  startPowerups: boolean;
  roundsToWin: number;
  shipSpeed: SpeedPreset;
  dashPower: DashPreset;
  rotationPreset: ModePreset;
  rotationBoostPreset: ModePreset;
  recoilPreset: ModePreset;
  shipRestitutionPreset: ModePreset;
  shipFrictionAirPreset: ModePreset;
  wallRestitutionPreset: ModePreset;
  wallFrictionPreset: ModePreset;
  shipFrictionPreset: ModePreset;
  angularDampingPreset: ModePreset;
}

export interface AdvancedSettingsSync {
  mode: GameMode;
  baseMode: BaseGameMode;
  settings: AdvancedSettings;
}

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  asteroidDensity: "SOME",
  startPowerups: false,
  roundsToWin: 3,
  shipSpeed: "NORMAL",
  dashPower: "NORMAL",
  rotationPreset: "STANDARD",
  rotationBoostPreset: "STANDARD",
  recoilPreset: "STANDARD",
  shipRestitutionPreset: "STANDARD",
  shipFrictionAirPreset: "STANDARD",
  wallRestitutionPreset: "STANDARD",
  wallFrictionPreset: "STANDARD",
  shipFrictionPreset: "STANDARD",
  angularDampingPreset: "STANDARD",
};
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
  ROUNDS_TO_WIN: 3,

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
  SHIP_TARGET_SPEED: 4.4,
  SHIP_SPEED_RESPONSE: 7,
  SHIP_DASH_BOOST: 2.0,
  SHIP_DASH_DURATION: 0.18,
  SHIP_RECOIL_SLOWDOWN: 0.7,
  SHIP_RECOIL_DURATION: 0.08,

  // Combat
  FIRE_COOLDOWN: 180, // ms
  PROJECTILE_SPEED: 14,
  PROJECTILE_LIFETIME: 2500, // ms

  // Ammo system
  MAX_AMMO: 3,
  AMMO_RELOAD_TIME: 1200, // ms (1.2 seconds per bullet)
  AMMO_BURST_DELAY: 150, // ms (small delay between burst shots)

  // Pilot
  PILOT_SURVIVAL_TIME: 5000, // ms
  PILOT_FRICTION_AIR: 0.05,
  PILOT_ROTATION_SPEED: 3.8,
  PILOT_DASH_FORCE: 0.006,
  PILOT_DASH_COOLDOWN: 250, // ms
  PILOT_EJECT_VELOCITY_SCALE: 0.7,
  PILOT_ANGULAR_DAMPING: 0.08,

  // Respawn
  INVULNERABLE_TIME: 2000, // ms

  // Network
  SYNC_INTERVAL: 50, // ms (20 updates/sec)

  // Countdown
  COUNTDOWN_DURATION: 3, // seconds
  ROUND_RESULTS_DURATION: 2.5, // seconds

  // Asteroids
  ASTEROID_INITIAL_MIN: 5,
  ASTEROID_INITIAL_MAX: 7,
  ASTEROID_LARGE_MIN: 30,
  ASTEROID_LARGE_MAX: 38,
  ASTEROID_SMALL_MIN: 16,
  ASTEROID_SMALL_MAX: 22,
  ASTEROID_DRIFT_MIN_SPEED: 0.6,
  ASTEROID_DRIFT_MAX_SPEED: 1.6,
  ASTEROID_SPLIT_COUNT: 2,
  ASTEROID_RESTITUTION: 0.6,
  ASTEROID_FRICTION: 0.02,
  ASTEROID_DAMAGE_SHIPS: false,
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
  POWERUP_SPAWN_WEIGHTS: {
    LASER: 1,
    SHIELD: 1,
    SCATTER: 1,
    MINE: 1,
    REVERSE: 1,
    JOUST: 1,
    HOMING_MISSILE: 1,
  } as Record<PowerUpType, number>,
  POWERUP_SIZE: 25,
  POWERUP_LASER_CHARGES: 3,
  POWERUP_LASER_COOLDOWN: 2500, // ms (2.5 seconds between shots)
  POWERUP_SHIELD_HITS: 2,
  POWERUP_BEAM_LENGTH: 800, // Beam length - long but not game-breaking
  POWERUP_BEAM_WIDTH: 8,

  // Scatter Shot
  POWERUP_SCATTER_CHARGES: 3,
  POWERUP_SCATTER_COOLDOWN: 180, // ms (same as normal fire)
  POWERUP_SCATTER_ANGLE_1: 15, // degrees
  POWERUP_SCATTER_ANGLE_2: 30, // degrees
  POWERUP_SCATTER_ANGLE_3: 45, // degrees
  POWERUP_SCATTER_PROJECTILE_SPEED: 10, // Slower for short range
  POWERUP_SCATTER_PROJECTILE_LIFETIME: 600, // ms (very short range - shotgun feel)

  // Proximity Mine
  POWERUP_MINE_DESPAWN_TIME: 30000, // ms (30 seconds)
  POWERUP_MINE_EXPLOSION_RADIUS: 150, // px
  POWERUP_MINE_SIZE: 12, // px

  // Joust (Lightsaber)
  POWERUP_JOUST_SIZE: 35, // Length of each lightsaber
  POWERUP_JOUST_WIDTH: 4, // Width of lightsaber blade
  POWERUP_JOUST_OFFSET: 22, // Distance from ship center

  // Homing Missile
  POWERUP_HOMING_MISSILE_SPEED: 9, // Slower than regular projectiles
  POWERUP_HOMING_MISSILE_TURN_RATE: 2.5, // How fast it can turn (rad/s)
  POWERUP_HOMING_MISSILE_LIFETIME: 4000, // ms (4 seconds)
  POWERUP_HOMING_MISSILE_ACCURACY: 0.85, // 0-1, lower = easier to dodge
  POWERUP_HOMING_MISSILE_DETECTION_RADIUS: 200, // px - radius to detect targets
} as const;

// Mutable version of GAME_CONFIG type (widens literal types from `as const`)
export type GameConfigType = {
  -readonly [K in keyof typeof GAME_CONFIG]: (typeof GAME_CONFIG)[K] extends number
    ? number
    : (typeof GAME_CONFIG)[K] extends string
      ? string
      : (typeof GAME_CONFIG)[K];
};

// Overrides for "Standard" game mode (controlled, default)
export const STANDARD_OVERRIDES: Partial<GameConfigType> = {
  BASE_THRUST: 0,
  ROTATION_SPEED: 3.2,
  ROTATION_THRUST_BONUS: 0,
  RECOIL_FORCE: 0,
  DASH_FORCE: 0,
  SHIP_FRICTION_AIR: 0,
  SHIP_RESTITUTION: 0.0,
};

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
export const STANDARD_PHYSICS = {
  WALL_RESTITUTION: 0,
  WALL_FRICTION: 0.04,
  SHIP_FRICTION: 0.02,
  SHIP_ANGULAR_DAMPING: 0.4,
};

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
