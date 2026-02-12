type GamePhase =
  | "START"
  | "LOBBY"
  | "COUNTDOWN"
  | "PLAYING"
  | "ROUND_END"
  | "GAME_END";

type PlayerState = "ACTIVE" | "EJECTED" | "SPECTATING";
type GameMode = "STANDARD" | "SANE" | "CHAOTIC" | "CUSTOM";
type BaseGameMode = "STANDARD" | "SANE" | "CHAOTIC";
type PowerUpType =
  | "LASER"
  | "SHIELD"
  | "SCATTER"
  | "MINE"
  | "REVERSE"
  | "JOUST"
  | "HOMING_MISSILE";

interface AdvancedSettings {
  asteroidDensity: "NONE" | "SOME" | "MANY" | "SPAWN";
  startPowerups: boolean;
  roundsToWin: number;
  shipSpeed: "SLOW" | "NORMAL" | "FAST";
  dashPower: "LOW" | "NORMAL" | "HIGH";
  rotationPreset: "STANDARD" | "SANE" | "CHAOTIC";
  rotationBoostPreset: "STANDARD" | "SANE" | "CHAOTIC";
  recoilPreset: "STANDARD" | "SANE" | "CHAOTIC";
  shipRestitutionPreset: "STANDARD" | "SANE" | "CHAOTIC";
  shipFrictionAirPreset: "STANDARD" | "SANE" | "CHAOTIC";
  wallRestitutionPreset: "STANDARD" | "SANE" | "CHAOTIC";
  wallFrictionPreset: "STANDARD" | "SANE" | "CHAOTIC";
  shipFrictionPreset: "STANDARD" | "SANE" | "CHAOTIC";
  angularDampingPreset: "STANDARD" | "SANE" | "CHAOTIC";
}

interface PlayerInput {
  buttonA: boolean;
  buttonB: boolean;
  timestamp: number;
  clientTimeMs: number;
}

interface ShipState {
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

interface ProjectileState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spawnTime: number;
}

interface PilotState {
  id: string;
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spawnTime: number;
  survivalProgress: number;
  alive: boolean;
}

interface AsteroidState {
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

interface PowerUpState {
  id: string;
  x: number;
  y: number;
  type: PowerUpType;
  spawnTime: number;
  remainingTimeFraction: number;
  alive: boolean;
  magneticRadius?: number;
  isMagneticActive?: boolean;
}

interface LaserBeamState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  spawnTime: number;
  alive: boolean;
}

interface MineState {
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

interface HomingMissileState {
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

interface TurretState {
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

interface TurretBulletState {
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

interface PlayerPowerUp {
  type: PowerUpType;
  charges: number;
  maxCharges: number;
  lastFireTime: number;
  shieldHits: number;
  leftSwordActive?: boolean;
  rightSwordActive?: boolean;
}

interface RoundResultPayload {
  roundNumber: number;
  winnerId?: string;
  winnerName?: string;
  isTie: boolean;
  roundWinsById: Record<string, number>;
}

interface PlayerListMeta {
  id: string;
  customName: string;
  profileName?: string;
  botType?: "ai" | "local";
  colorIndex: number;
  keySlot?: number;
  kills: number;
  roundWins: number;
  playerState: PlayerState;
  isBot: boolean;
}

interface PlayerListPayload {
  order: string[];
  meta: PlayerListMeta[];
  hostId: string | null;
  revision: number;
}

interface RoomMetaPayload {
  roomCode: string;
  leaderPlayerId: string | null;
  phase: GamePhase;
  mode: GameMode;
  baseMode: BaseGameMode;
  settings: AdvancedSettings;
}

interface AdvancedSettingsSync {
  mode: GameMode;
  baseMode: BaseGameMode;
  settings: AdvancedSettings;
}

interface SnapshotPayload {
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
  playerPowerUps: Record<string, PlayerPowerUp | null>;
  rotationDirection: number;
  screenShakeIntensity: number;
  screenShakeDuration: number;
  hostTick: number;
  tickDurationMs: number;
}

interface Hooks {
  onPlayers: (payload: PlayerListPayload) => void;
  onRoomMeta: (payload: RoomMetaPayload) => void;
  onPhase: (phase: GamePhase, winnerId?: string, winnerName?: string) => void;
  onCountdown: (count: number) => void;
  onRoundResult: (payload: RoundResultPayload) => void;
  onSnapshot: (payload: SnapshotPayload) => void;
  onSound: (type: string, playerId: string) => void;
  onScreenShake: (intensity: number, duration: number) => void;
  onDashParticles: (payload: {
    playerId: string;
    x: number;
    y: number;
    angle: number;
    color: string;
  }) => void;
  onDevMode: (enabled: boolean) => void;
  onError: (sessionId: string, code: string, message: string) => void;
}

interface RuntimePlayer {
  id: string;
  sessionId: string | null;
  name: string;
  isBot: boolean;
  botType: "ai" | "local" | null;
  keySlot?: number;
  colorIndex: number;
  kills: number;
  roundWins: number;
  state: PlayerState;
  input: PlayerInput;
  dashQueued: boolean;
  botThinkAtMs: number;
  botLastDecisionMs: number;
  botCachedAction: {
    buttonA: boolean;
    buttonB: boolean;
    dash: boolean;
  };
  dashTimerSec: number;
  recoilTimerSec: number;
  angularVelocity: number;
  ship: ShipState;
}

interface RuntimePilot extends PilotState {
  lastDashAtMs: number;
  controlMode: "player" | "ai";
  aiThinkAtMs: number;
  aiTargetAngle: number;
  aiShouldDash: boolean;
}

interface RuntimeProjectile extends ProjectileState {
  lifetimeMs: number;
}

interface RuntimeAsteroid extends AsteroidState {}

interface RuntimePowerUp extends PowerUpState {
  magneticRadius: number;
  magneticSpeed: number;
  targetPlayerId: string | null;
}

interface RuntimeLaserBeam extends LaserBeamState {
  durationMs: number;
}

interface RuntimeMine extends MineState {}

interface RuntimeHomingMissile extends HomingMissileState {
  targetId: string | null;
  hasDetectedTarget: boolean;
}

interface RuntimeTurret extends TurretState {
  lastFireTimeMs: number;
  fireCooldownMs: number;
  fireAngleThreshold: number;
}

interface RuntimeTurretBullet extends TurretBulletState {
  lifetimeMs: number;
  explosionRadius: number;
  hitsApplied: boolean;
}

const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
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

const PLAYER_COLORS = [
  { primary: "#00f0ff", glow: "#00f0ff" },
  { primary: "#ff00aa", glow: "#ff00aa" },
  { primary: "#ffee00", glow: "#ffee00" },
  { primary: "#00ff88", glow: "#00ff88" },
] as const;

const ARENA_WIDTH = 1200;
const ARENA_HEIGHT = 800;
const ARENA_PADDING = 50;

const FIRE_COOLDOWN_MS = 180;
const PROJECTILE_LIFETIME_MS = 2500;
const PROJECTILE_SPEED_PX_PER_SEC = 14 * 60;
const PROJECTILE_RADIUS = 4;
const SHIP_RADIUS = 18;
const SHIP_HIT_RADIUS = 25;
const RELOAD_MS = 1200;
const MAX_AMMO = 3;

const COUNTDOWN_SECONDS = 3;
const ROUND_RESULTS_DURATION_MS = 2500;

const PILOT_SURVIVAL_MS = 5000;
const PILOT_DASH_COOLDOWN_MS = 250;
const PILOT_RADIUS = 10;

const ASTEROID_INITIAL_MIN = 5;
const ASTEROID_INITIAL_MAX = 7;
const ASTEROID_LARGE_MIN = 30;
const ASTEROID_LARGE_MAX = 38;
const ASTEROID_SMALL_MIN = 16;
const ASTEROID_SMALL_MAX = 22;
const ASTEROID_SPLIT_COUNT = 2;
const ASTEROID_DRIFT_MIN = 36;
const ASTEROID_DRIFT_MAX = 96;
const ASTEROID_RESTITUTION = 0.6;
const ASTEROID_FRICTION = 0.02;
const ASTEROID_DAMAGE_SHIPS = false;
const ASTEROID_VERTICES_MIN = 6;
const ASTEROID_VERTICES_MAX = 10;
const ASTEROID_DROP_CHANCE = 0.3;
const ASTEROID_SPAWN_INTERVAL_MIN_MS = 2000;
const ASTEROID_SPAWN_INTERVAL_MAX_MS = 5000;
const ASTEROID_SPAWN_BATCH_MIN = 1;
const ASTEROID_SPAWN_BATCH_MAX = 3;

const POWERUP_DESPAWN_MS = 10000;
const POWERUP_PICKUP_RADIUS = 30;
const POWERUP_SHIELD_HITS = 2;
const POWERUP_MAGNETIC_RADIUS = 50;
const POWERUP_MAGNETIC_SPEED = 120;

const LASER_CHARGES = 3;
const LASER_COOLDOWN_MS = 2500;
const LASER_BEAM_DURATION_MS = 150;
const LASER_BEAM_LENGTH = 800;

const SCATTER_CHARGES = 3;
const SCATTER_COOLDOWN_MS = 180;
const SCATTER_ANGLE_DEG = 15;
const SCATTER_PROJECTILE_SPEED_PX_PER_SEC = 10 * 60;
const SCATTER_PROJECTILE_LIFETIME_MS = 600;

const MINE_SIZE = 12;
const MINE_EXPLOSION_RADIUS = 150;
const MINE_ARMING_DELAY_MS = 400;
const MINE_EXPLOSION_DURATION_MS = 500;
const MINE_POST_EXPIRY_MS = 4500;
const MINE_DETECTION_RADIUS = MINE_SIZE + 33;

const JOUST_SWORD_LENGTH = 35;
const JOUST_COLLISION_RADIUS = JOUST_SWORD_LENGTH / 2;
const JOUST_SPEED_MULTIPLIER = 1.4;

const HOMING_MISSILE_SPEED_PX_PER_SEC = 9 * 60;
const HOMING_MISSILE_TURN_RATE = 2.5;
const HOMING_MISSILE_LIFETIME_MS = 4000;
const HOMING_MISSILE_ACCURACY = 0.85;
const HOMING_MISSILE_DETECTION_RADIUS = 200;
const HOMING_MISSILE_RADIUS = 6;

const TURRET_RADIUS = 20;
const TURRET_DETECTION_RADIUS = 300;
const TURRET_ORBIT_RADIUS = 50;
const TURRET_ROTATION_SPEED = 4.0;
const TURRET_FIRE_COOLDOWN_MS = 1500;
const TURRET_FIRE_ANGLE_THRESHOLD = 0.25;
const TURRET_IDLE_ROTATION_SPEED = 0.5;

const TURRET_BULLET_SPEED_PX_PER_SEC = 12 * 60;
const TURRET_BULLET_LIFETIME_MS = 3000;
const TURRET_BULLET_IMPACT_RADIUS = 25;
const TURRET_BULLET_EXPLOSION_RADIUS = 100;
const TURRET_BULLET_EXPLOSION_DURATION_MS = 500;

const POWERUP_SPAWN_WEIGHTS: Record<PowerUpType, number> = {
  LASER: 1,
  SHIELD: 1,
  SCATTER: 1,
  MINE: 1,
  REVERSE: 1,
  JOUST: 1,
  HOMING_MISSILE: 1,
};

const STARTING_POWERUP_TYPES: PowerUpType[] = [
  "LASER",
  "SHIELD",
  "SCATTER",
  "MINE",
];

const AI_CONFIG = {
  AIM_TOLERANCE: 0.6,
  LEAD_FACTOR: 0.05,
  DANGER_RADIUS: 100,
  DANGER_TIME: 0.3,
  WALL_MARGIN: 60,
  FIRE_PROBABILITY: 0.4,
  REACTION_DELAY_MS: 250,
  AIM_ERROR: 0.3,
  ROTATION_OVERSHOOT: 0.2,
};

const STANDARD_CONFIG = {
  BASE_THRUST: 0,
  ROTATION_SPEED: 3.2,
  ROTATION_THRUST_BONUS: 0,
  RECOIL_FORCE: 0,
  DASH_FORCE: 0,
  SHIP_FRICTION_AIR: 0,
  SHIP_RESTITUTION: 0,
  SHIP_TARGET_SPEED: 4.4,
  SHIP_SPEED_RESPONSE: 7,
  SHIP_DASH_BOOST: 2.0,
  SHIP_DASH_DURATION: 0.18,
  SHIP_RECOIL_SLOWDOWN: 0.7,
  SHIP_RECOIL_DURATION: 0.08,
  PROJECTILE_SPEED: PROJECTILE_SPEED_PX_PER_SEC,
  PILOT_ROTATION_SPEED: 3.8,
  PILOT_DASH_FORCE: 0.006,
};

const SANE_CONFIG = {
  ...STANDARD_CONFIG,
  BASE_THRUST: 0.00008,
  ROTATION_SPEED: 3.0,
  ROTATION_THRUST_BONUS: 0.00004,
  RECOIL_FORCE: 0.00015,
  DASH_FORCE: 0.006,
  SHIP_FRICTION_AIR: 0.003,
  SHIP_RESTITUTION: 0.5,
};

const CHAOTIC_CONFIG = {
  ...STANDARD_CONFIG,
  BASE_THRUST: 0.00015,
  ROTATION_SPEED: 4.5,
  ROTATION_THRUST_BONUS: 0.00008,
  RECOIL_FORCE: 0.0003,
  DASH_FORCE: 0.012,
  SHIP_FRICTION_AIR: 0.002,
  SHIP_RESTITUTION: 0.9,
};

const FORCE_TO_ACCEL = 1_466_666;
const FORCE_TO_IMPULSE = 38_333;
const RECOIL_TO_IMPULSE = 233_333;

const SHIP_RESTITUTION_BY_PRESET: Record<AdvancedSettings["shipRestitutionPreset"], number> = {
  STANDARD: 0,
  SANE: 0.5,
  CHAOTIC: 0.9,
};
const SHIP_FRICTION_BY_PRESET: Record<AdvancedSettings["shipFrictionPreset"], number> = {
  STANDARD: 0.02,
  SANE: 0.5,
  CHAOTIC: 0,
};
const SHIP_FRICTION_AIR_BY_PRESET: Record<AdvancedSettings["shipFrictionAirPreset"], number> = {
  STANDARD: 0,
  SANE: 0.003,
  CHAOTIC: 0.002,
};
const SHIP_ANGULAR_DAMPING_BY_PRESET: Record<AdvancedSettings["angularDampingPreset"], number> = {
  STANDARD: 0.4,
  SANE: 0.1,
  CHAOTIC: 0,
};
const WALL_FRICTION_BY_PRESET: Record<AdvancedSettings["wallFrictionPreset"], number> = {
  STANDARD: 0.04,
  SANE: 0.5,
  CHAOTIC: 0,
};
const WALL_RESTITUTION_BY_PRESET: Record<AdvancedSettings["wallRestitutionPreset"], number> = {
  STANDARD: 0,
  SANE: 0.5,
  CHAOTIC: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  let out = angle;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x9e3779b9;
    }
  }

  nextUint32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

function getModeBaseConfig(baseMode: BaseGameMode): typeof STANDARD_CONFIG {
  if (baseMode === "SANE") return { ...SANE_CONFIG };
  if (baseMode === "CHAOTIC") return { ...CHAOTIC_CONFIG };
  return { ...STANDARD_CONFIG };
}

function resolveConfigValue(
  preset: AdvancedSettings["rotationPreset"],
  standardValue: number,
  saneValue: number,
  chaoticValue: number,
): number {
  if (preset === "STANDARD") return standardValue;
  if (preset === "SANE") return saneValue;
  return chaoticValue;
}

export class AstroPartySimulation {
  private players = new Map<string, RuntimePlayer>();
  private playerOrder: string[] = [];
  private humanBySession = new Map<string, string>();
  private pilots = new Map<string, RuntimePilot>();
  private projectiles: RuntimeProjectile[] = [];
  private asteroids: RuntimeAsteroid[] = [];
  private powerUps: RuntimePowerUp[] = [];
  private laserBeams: RuntimeLaserBeam[] = [];
  private mines: RuntimeMine[] = [];
  private homingMissiles: RuntimeHomingMissile[] = [];
  private turret: RuntimeTurret | null = null;
  private turretBullets: RuntimeTurretBullet[] = [];
  private playerPowerUps = new Map<string, PlayerPowerUp | null>();
  private phase: GamePhase = "LOBBY";
  private hostTick = 0;
  private nowMs = 0;
  private countdownMs = 0;
  private countdownValue = COUNTDOWN_SECONDS;
  private roundEndMs = 0;
  private currentRound = 1;
  private leaderPlayerId: string | null = null;
  private mode: GameMode = "STANDARD";
  private baseMode: BaseGameMode = "STANDARD";
  private settings: AdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };
  private revision = 0;
  private playerCounter = 0;
  private botCounter = 0;
  private projectileCounter = 0;
  private asteroidCounter = 0;
  private powerUpCounter = 0;
  private laserBeamCounter = 0;
  private mineCounter = 0;
  private missileCounter = 0;
  private turretBulletCounter = 0;
  private nextAsteroidSpawnAtMs: number | null = null;
  private pendingEliminationCheckAtMs: number | null = null;
  private winnerId: string | null = null;
  private winnerName: string | null = null;
  private rotationDirection = 1;
  private devModeEnabled = false;
  private screenShakeIntensity = 0;
  private screenShakeDuration = 0;

  private baseSeed = 0;
  private asteroidRng = new SeededRNG(1);
  private powerUpRng = new SeededRNG(2);
  private aiRng = new SeededRNG(3);
  private idRng = new SeededRNG(4);

  constructor(
    private roomCode: string,
    private maxPlayers: number,
    private tickDurationMs: number,
    private hooks: Hooks,
  ) {
    this.reseed(Math.floor(Date.now()) >>> 0);
  }

  addHuman(sessionId: string, requestedName?: string): void {
    if (this.players.size >= this.maxPlayers) {
      this.hooks.onError(sessionId, "ROOM_FULL", "Room is full");
      return;
    }

    const id = "player_" + (++this.playerCounter).toString();
    const index = this.playerOrder.length % PLAYER_COLORS.length;
    const name = this.sanitizeName(requestedName) ?? "Player " + (this.playerOrder.length + 1);
    const player = this.createPlayer(id, sessionId, name, false, null, index);
    this.players.set(id, player);
    this.playerOrder.push(id);
    this.humanBySession.set(sessionId, id);

    if (!this.leaderPlayerId) {
      this.leaderPlayerId = id;
    }

    if (this.phase === "PLAYING" || this.phase === "GAME_END") {
      player.state = "SPECTATING";
      player.ship.alive = false;
    }

    if (this.phase === "COUNTDOWN") {
      this.countdownMs = COUNTDOWN_SECONDS * 1000;
      this.countdownValue = COUNTDOWN_SECONDS;
      this.hooks.onCountdown(this.countdownValue);
    }

    this.syncPlayers();
    this.syncRoomMeta();
  }

  removeSession(sessionId: string): void {
    const playerId = this.humanBySession.get(sessionId);
    if (!playerId) return;
    this.humanBySession.delete(sessionId);
    this.removePlayerById(playerId);
  }

  setName(sessionId: string, rawName: string): void {
    const player = this.getHuman(sessionId);
    if (!player) return;
    const name = this.sanitizeName(rawName);
    if (!name) return;
    player.name = name;
    this.syncPlayers();
  }

  sendInput(
    sessionId: string,
    payload: {
      controlledPlayerId?: string;
      buttonA: boolean;
      buttonB: boolean;
      clientTimeMs?: number;
    },
  ): void {
    const player = this.getHuman(sessionId);
    if (!player) return;

    if (payload.controlledPlayerId && payload.controlledPlayerId !== player.id) {
      this.hooks.onError(
        sessionId,
        "LOCAL_PLAYER_UNSUPPORTED",
        "Local player control is deferred in this version",
      );
      return;
    }

    player.input.buttonA = Boolean(payload.buttonA);
    player.input.buttonB = Boolean(payload.buttonB);
    player.input.timestamp = this.nowMs;
    player.input.clientTimeMs = payload.clientTimeMs ?? this.nowMs;
  }

  queueDash(sessionId: string, payload: { controlledPlayerId?: string }): void {
    const player = this.getHuman(sessionId);
    if (!player) return;
    if (payload.controlledPlayerId && payload.controlledPlayerId !== player.id) {
      this.hooks.onError(
        sessionId,
        "LOCAL_PLAYER_UNSUPPORTED",
        "Local player control is deferred in this version",
      );
      return;
    }
    player.dashQueued = true;
  }

  startMatch(sessionId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    if (this.phase !== "LOBBY" && this.phase !== "GAME_END") {
      this.hooks.onError(sessionId, "INVALID_PHASE", "Cannot start from this phase");
      return;
    }
    if (this.playerOrder.length < 2) {
      this.hooks.onError(sessionId, "NOT_ENOUGH_PLAYERS", "Need at least 2 players");
      return;
    }

    this.winnerId = null;
    this.winnerName = null;
    this.currentRound = 1;
    this.phase = "COUNTDOWN";
    this.countdownMs = COUNTDOWN_SECONDS * 1000;
    this.countdownValue = COUNTDOWN_SECONDS;
    this.roundEndMs = 0;
    this.resetScoreAndState();
    this.hooks.onPhase("COUNTDOWN");
    this.hooks.onCountdown(this.countdownValue);
    this.syncRoomMeta();
    this.syncPlayers();
  }

  restartToLobby(sessionId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    this.phase = "LOBBY";
    this.countdownMs = 0;
    this.countdownValue = COUNTDOWN_SECONDS;
    this.roundEndMs = 0;
    this.currentRound = 1;
    this.clearRoundEntities();
    this.devModeEnabled = false;
    this.resetScoreAndState();
    this.hooks.onPhase("LOBBY");
    this.syncRoomMeta();
    this.syncPlayers();
  }

  setMode(sessionId: string, mode: GameMode): void {
    if (!this.ensureLeader(sessionId)) return;
    if (mode === "CUSTOM") return;
    this.mode = mode;
    this.baseMode = mode;
    this.settings = {
      ...DEFAULT_ADVANCED_SETTINGS,
      roundsToWin: this.settings.roundsToWin,
      ...(mode === "SANE"
        ? {
            asteroidDensity: "MANY",
            startPowerups: true,
            rotationPreset: "SANE",
            rotationBoostPreset: "SANE",
            recoilPreset: "SANE",
            shipRestitutionPreset: "SANE",
            shipFrictionAirPreset: "SANE",
            wallRestitutionPreset: "SANE",
            wallFrictionPreset: "SANE",
            shipFrictionPreset: "SANE",
            angularDampingPreset: "SANE",
          }
        : mode === "CHAOTIC"
          ? {
              asteroidDensity: "SPAWN",
              startPowerups: true,
              rotationPreset: "CHAOTIC",
              rotationBoostPreset: "CHAOTIC",
              recoilPreset: "CHAOTIC",
              shipRestitutionPreset: "CHAOTIC",
              shipFrictionAirPreset: "CHAOTIC",
              wallRestitutionPreset: "CHAOTIC",
              wallFrictionPreset: "CHAOTIC",
              shipFrictionPreset: "CHAOTIC",
              angularDampingPreset: "CHAOTIC",
            }
          : {
              asteroidDensity: "SOME",
              startPowerups: false,
              rotationPreset: "STANDARD",
              rotationBoostPreset: "STANDARD",
              recoilPreset: "STANDARD",
              shipRestitutionPreset: "STANDARD",
              shipFrictionAirPreset: "STANDARD",
              wallRestitutionPreset: "STANDARD",
              wallFrictionPreset: "STANDARD",
              shipFrictionPreset: "STANDARD",
              angularDampingPreset: "STANDARD",
            }),
    };
    this.syncRoomMeta();
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  setAdvancedSettings(
    sessionId: string,
    payload: AdvancedSettingsSync,
  ): void {
    if (!this.ensureLeader(sessionId)) return;
    const sanitizeMode = (
      value: string,
      fallback: "STANDARD" | "SANE" | "CHAOTIC",
    ): "STANDARD" | "SANE" | "CHAOTIC" =>
      value === "STANDARD" || value === "SANE" || value === "CHAOTIC"
        ? value
        : fallback;
    const sanitizeDensity = (
      value: string,
      fallback: AdvancedSettings["asteroidDensity"],
    ): AdvancedSettings["asteroidDensity"] =>
      value === "NONE" || value === "SOME" || value === "MANY" || value === "SPAWN"
        ? value
        : fallback;

    const baseMode = sanitizeMode(payload.baseMode, this.baseMode);
    this.mode =
      payload.mode === "CUSTOM"
        ? "CUSTOM"
        : sanitizeMode(payload.mode, baseMode);
    this.baseMode = baseMode;
    this.settings = {
      ...DEFAULT_ADVANCED_SETTINGS,
      ...payload.settings,
      asteroidDensity: sanitizeDensity(
        payload.settings.asteroidDensity,
        DEFAULT_ADVANCED_SETTINGS.asteroidDensity,
      ),
      roundsToWin: clamp(Math.floor(payload.settings.roundsToWin ?? 3), 3, 6),
      startPowerups: Boolean(payload.settings.startPowerups),
      shipSpeed:
        payload.settings.shipSpeed === "SLOW" ||
        payload.settings.shipSpeed === "NORMAL" ||
        payload.settings.shipSpeed === "FAST"
          ? payload.settings.shipSpeed
          : DEFAULT_ADVANCED_SETTINGS.shipSpeed,
      dashPower:
        payload.settings.dashPower === "LOW" ||
        payload.settings.dashPower === "NORMAL" ||
        payload.settings.dashPower === "HIGH"
          ? payload.settings.dashPower
          : DEFAULT_ADVANCED_SETTINGS.dashPower,
      rotationPreset: sanitizeMode(
        payload.settings.rotationPreset,
        DEFAULT_ADVANCED_SETTINGS.rotationPreset,
      ),
      rotationBoostPreset: sanitizeMode(
        payload.settings.rotationBoostPreset,
        DEFAULT_ADVANCED_SETTINGS.rotationBoostPreset,
      ),
      recoilPreset: sanitizeMode(
        payload.settings.recoilPreset,
        DEFAULT_ADVANCED_SETTINGS.recoilPreset,
      ),
      shipRestitutionPreset: sanitizeMode(
        payload.settings.shipRestitutionPreset,
        DEFAULT_ADVANCED_SETTINGS.shipRestitutionPreset,
      ),
      shipFrictionAirPreset: sanitizeMode(
        payload.settings.shipFrictionAirPreset,
        DEFAULT_ADVANCED_SETTINGS.shipFrictionAirPreset,
      ),
      wallRestitutionPreset: sanitizeMode(
        payload.settings.wallRestitutionPreset,
        DEFAULT_ADVANCED_SETTINGS.wallRestitutionPreset,
      ),
      wallFrictionPreset: sanitizeMode(
        payload.settings.wallFrictionPreset,
        DEFAULT_ADVANCED_SETTINGS.wallFrictionPreset,
      ),
      shipFrictionPreset: sanitizeMode(
        payload.settings.shipFrictionPreset,
        DEFAULT_ADVANCED_SETTINGS.shipFrictionPreset,
      ),
      angularDampingPreset: sanitizeMode(
        payload.settings.angularDampingPreset,
        DEFAULT_ADVANCED_SETTINGS.angularDampingPreset,
      ),
    };
    this.syncRoomMeta();
  }

  addAIBot(sessionId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    if (this.phase !== "LOBBY") {
      this.hooks.onError(sessionId, "INVALID_PHASE", "Bots can only be added in lobby");
      return;
    }
    if (this.playerOrder.length >= this.maxPlayers) {
      this.hooks.onError(sessionId, "ROOM_FULL", "Room is full");
      return;
    }

    const id = "bot_" + (++this.botCounter).toString();
    const index = this.playerOrder.length % PLAYER_COLORS.length;
    const player = this.createPlayer(id, null, "Bot " + this.botCounter.toString(), true, "ai", index);
    this.players.set(id, player);
    this.playerOrder.push(id);
    this.syncPlayers();
  }

  addLocalPlayer(sessionId: string): void {
    this.hooks.onError(
      sessionId,
      "LOCAL_PLAYER_UNSUPPORTED",
      "Local players are deferred and not available in this version",
    );
  }

  setDevMode(sessionId: string, enabled: boolean): void {
    if (!this.ensureLeader(sessionId)) return;
    this.devModeEnabled = Boolean(enabled);
    this.hooks.onDevMode(this.devModeEnabled);
  }

  removeBot(sessionId: string, playerId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    const player = this.players.get(playerId);
    if (!player || !player.isBot) {
      this.hooks.onError(sessionId, "NOT_FOUND", "Bot not found");
      return;
    }
    this.removePlayerById(playerId);
  }

  kickPlayer(sessionId: string, targetId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    const target = this.players.get(targetId);
    if (!target) {
      this.hooks.onError(sessionId, "NOT_FOUND", "Player not found");
      return;
    }
    if (target.isBot) {
      this.removePlayerById(targetId);
      return;
    }
    this.removePlayerById(targetId);
  }

  update(deltaMs: number): void {
    this.nowMs += deltaMs;
    this.hostTick += 1;
    if (this.screenShakeDuration > 0) {
      this.screenShakeDuration = Math.max(0, this.screenShakeDuration - deltaMs / 1000);
      if (this.screenShakeDuration <= 0) {
        this.screenShakeIntensity = 0;
      }
    }

    if (this.phase === "COUNTDOWN") {
      this.countdownMs = Math.max(0, this.countdownMs - deltaMs);
      const next = Math.max(0, Math.ceil(this.countdownMs / 1000));
      if (next !== this.countdownValue) {
        this.countdownValue = next;
        this.hooks.onCountdown(next);
      }
      if (this.countdownMs <= 0) {
        this.beginPlaying();
      }
    }

    if (this.phase === "ROUND_END") {
      this.roundEndMs = Math.max(0, this.roundEndMs - deltaMs);
      if (this.roundEndMs <= 0) {
        this.currentRound += 1;
        this.clearRoundEntities();
        this.phase = "COUNTDOWN";
        this.countdownMs = COUNTDOWN_SECONDS * 1000;
        this.countdownValue = COUNTDOWN_SECONDS;
        for (const playerId of this.playerOrder) {
          const player = this.players.get(playerId);
          if (!player) continue;
          player.state = "ACTIVE";
          player.ship.alive = false;
        }
        this.hooks.onPhase("COUNTDOWN");
        this.hooks.onCountdown(this.countdownValue);
        this.syncRoomMeta();
        this.syncPlayers();
      }
    }

    if (this.phase !== "PLAYING") {
      this.hooks.onSnapshot(this.buildSnapshot());
      return;
    }

    this.updateBots();
    this.updateShips(deltaMs / 1000);
    this.updatePilots(deltaMs / 1000);
    this.updateProjectiles(deltaMs / 1000);
    this.updateAsteroidSpawning();
    this.updateAsteroids(deltaMs / 1000);
    this.resolveAsteroidAsteroidCollisions();
    this.resolveShipAsteroidCollisions(
      SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset] ?? 0,
    );
    this.resolvePilotAsteroidCollisions();
    this.updatePowerUps(deltaMs / 1000);
    this.processProjectileCollisions();
    this.updateLaserBeams();
    this.checkMineCollisions();
    this.updateMines();
    this.updateHomingMissiles(deltaMs / 1000);
    this.checkHomingMissileCollisions();
    this.updateJoustCollisions();
    this.updateTurret(deltaMs / 1000);
    this.updateTurretBullets(deltaMs / 1000);
    this.processShipPilotCollisions();
    this.processPowerUpPickups();
    this.cleanupExpiredEntities();
    this.updatePendingEliminationChecks();
    if (this.pendingEliminationCheckAtMs === null) {
      this.checkEliminationWin();
    }

    this.hooks.onSnapshot(this.buildSnapshot());
  }

  getPlayerIdForSession(sessionId: string): string | null {
    return this.humanBySession.get(sessionId) ?? null;
  }

  getAdvancedSettingsSync(): AdvancedSettingsSync {
    return {
      mode: this.mode,
      baseMode: this.baseMode,
      settings: { ...this.settings },
    };
  }

  getDevModeEnabled(): boolean {
    return this.devModeEnabled;
  }

  private getActiveConfig(): typeof STANDARD_CONFIG {
    const cfg = getModeBaseConfig(this.baseMode);

    if (this.settings.shipSpeed === "SLOW") {
      cfg.SHIP_TARGET_SPEED = 3.6;
      cfg.BASE_THRUST = 0.0001;
    } else if (this.settings.shipSpeed === "FAST") {
      cfg.SHIP_TARGET_SPEED = 5.2;
      cfg.BASE_THRUST = 0.0002;
    }

    if (this.settings.dashPower === "LOW") {
      cfg.SHIP_DASH_BOOST = 1.2;
      cfg.DASH_FORCE = 0.007;
    } else if (this.settings.dashPower === "HIGH") {
      cfg.SHIP_DASH_BOOST = 2.8;
      cfg.DASH_FORCE = 0.018;
    }

    cfg.ROTATION_SPEED = resolveConfigValue(this.settings.rotationPreset, 3.2, 3.0, 4.5);
    cfg.ROTATION_THRUST_BONUS = resolveConfigValue(
      this.settings.rotationBoostPreset,
      0,
      0.00004,
      0.00008,
    );
    cfg.RECOIL_FORCE = resolveConfigValue(this.settings.recoilPreset, 0, 0.00015, 0.0003);

    cfg.SHIP_RESTITUTION =
      SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset];
    cfg.SHIP_FRICTION_AIR =
      SHIP_FRICTION_AIR_BY_PRESET[this.settings.shipFrictionAirPreset];

    return cfg;
  }

  private getInitialAsteroidRange(): { min: number; max: number } {
    if (this.settings.asteroidDensity === "NONE") {
      return { min: 0, max: 0 };
    }
    if (
      this.settings.asteroidDensity === "MANY" ||
      this.settings.asteroidDensity === "SPAWN"
    ) {
      return { min: 8, max: 11 };
    }
    return { min: ASTEROID_INITIAL_MIN, max: ASTEROID_INITIAL_MAX };
  }

  private beginPlaying(): void {
    if (this.playerOrder.length < 2) {
      this.phase = "LOBBY";
      this.hooks.onPhase("LOBBY");
      this.syncRoomMeta();
      this.syncPlayers();
      return;
    }
    this.phase = "PLAYING";
    this.reseed((Date.now() >>> 0) ^ this.currentRound);
    this.clearRoundEntities();
    this.spawnAllShips();
    this.grantStartingPowerups();
    this.spawnInitialAsteroids();
    this.scheduleAsteroidSpawn();
    this.spawnTurret();
    this.hooks.onPhase("PLAYING");
    this.syncRoomMeta();
    this.syncPlayers();
  }

  private reseed(seed: number): void {
    const normalized = (seed >>> 0) || 0x9e3779b9;
    this.baseSeed = normalized;
    this.asteroidRng = new SeededRNG(normalized ^ 0xa341316c);
    this.powerUpRng = new SeededRNG(normalized ^ 0xc8013ea4);
    this.aiRng = new SeededRNG(normalized ^ 0xad90777d);
    this.idRng = new SeededRNG(normalized ^ 0x7e95761e);
  }

  private nextEntityId(prefix: string): string {
    return prefix + "_" + this.idRng.nextUint32().toString(16);
  }

  private clearRoundEntities(): void {
    this.pilots.clear();
    this.projectiles = [];
    this.asteroids = [];
    this.powerUps = [];
    this.laserBeams = [];
    this.mines = [];
    this.homingMissiles = [];
    this.turret = null;
    this.turretBullets = [];
    this.playerPowerUps.clear();
    this.rotationDirection = 1;
    this.nextAsteroidSpawnAtMs = null;
    this.pendingEliminationCheckAtMs = null;
    this.screenShakeIntensity = 0;
    this.screenShakeDuration = 0;
  }

  private spawnTurret(): void {
    this.turret = {
      id: this.nextEntityId("turret"),
      x: ARENA_WIDTH * 0.5,
      y: ARENA_HEIGHT * 0.5,
      angle: 0,
      alive: true,
      detectionRadius: TURRET_DETECTION_RADIUS,
      orbitRadius: TURRET_ORBIT_RADIUS,
      isTracking: false,
      targetAngle: 0,
      lastFireTimeMs: this.nowMs - TURRET_FIRE_COOLDOWN_MS - 1,
      fireCooldownMs: TURRET_FIRE_COOLDOWN_MS,
      fireAngleThreshold: TURRET_FIRE_ANGLE_THRESHOLD,
    };
  }

  private triggerScreenShake(intensity: number, duration: number): void {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
    this.screenShakeDuration = Math.max(this.screenShakeDuration, duration);
    this.hooks.onScreenShake(intensity, duration);
  }

  private grantPowerUp(playerId: string, type: PowerUpType): void {
    if (type === "LASER") {
      this.playerPowerUps.set(playerId, {
        type: "LASER",
        charges: LASER_CHARGES,
        maxCharges: LASER_CHARGES,
        lastFireTime: this.nowMs - LASER_COOLDOWN_MS - 1,
        shieldHits: 0,
      });
      return;
    }
    if (type === "SHIELD") {
      this.playerPowerUps.set(playerId, {
        type: "SHIELD",
        charges: 0,
        maxCharges: 0,
        lastFireTime: this.nowMs,
        shieldHits: 0,
      });
      return;
    }
    if (type === "SCATTER") {
      this.playerPowerUps.set(playerId, {
        type: "SCATTER",
        charges: SCATTER_CHARGES,
        maxCharges: SCATTER_CHARGES,
        lastFireTime: this.nowMs - SCATTER_COOLDOWN_MS - 1,
        shieldHits: 0,
      });
      return;
    }
    if (type === "MINE") {
      this.playerPowerUps.set(playerId, {
        type: "MINE",
        charges: 1,
        maxCharges: 1,
        lastFireTime: this.nowMs,
        shieldHits: 0,
      });
      return;
    }
    if (type === "REVERSE") {
      this.rotationDirection *= -1;
      return;
    }
    if (type === "JOUST") {
      this.playerPowerUps.set(playerId, {
        type: "JOUST",
        charges: 0,
        maxCharges: 0,
        lastFireTime: this.nowMs,
        shieldHits: 0,
        leftSwordActive: true,
        rightSwordActive: true,
      });
      return;
    }
    this.playerPowerUps.set(playerId, {
      type: "HOMING_MISSILE",
      charges: 1,
      maxCharges: 1,
      lastFireTime: this.nowMs,
      shieldHits: 0,
    });
  }

  private checkLineCircleCollision(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    cx: number,
    cy: number,
    radius: number,
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const distSq = (cx - x1) ** 2 + (cy - y1) ** 2;
      return distSq <= radius * radius;
    }
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = clamp(t, 0, 1);
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const distSq = (cx - px) ** 2 + (cy - py) ** 2;
    return distSq <= radius * radius;
  }

  private applyLaserDamage(
    ownerId: string,
    startX: number,
    startY: number,
    angle: number,
  ): void {
    const endX = startX + Math.cos(angle) * LASER_BEAM_LENGTH;
    const endY = startY + Math.sin(angle) * LASER_BEAM_LENGTH;

    for (const playerId of this.playerOrder) {
      if (playerId === ownerId) continue;
      const shipOwner = this.players.get(playerId);
      if (!shipOwner || !shipOwner.ship.alive) continue;
      if (shipOwner.ship.invulnerableUntil > this.nowMs) continue;
      if (
        !this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          shipOwner.ship.x,
          shipOwner.ship.y,
          SHIP_HIT_RADIUS,
        )
      ) {
        continue;
      }
      this.playerPowerUps.delete(playerId);
      this.onShipHit(this.players.get(ownerId), shipOwner);
    }

    for (const [pilotPlayerId, pilot] of this.pilots) {
      if (!pilot.alive) continue;
      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          pilot.x,
          pilot.y,
          PILOT_RADIUS,
        )
      ) {
        this.killPilot(pilotPlayerId, ownerId);
      }
    }

    for (const asteroid of this.asteroids) {
      if (!asteroid.alive) continue;
      if (
        this.checkLineCircleCollision(
          startX,
          startY,
          endX,
          endY,
          asteroid.x,
          asteroid.y,
          asteroid.size,
        )
      ) {
        this.destroyAsteroid(asteroid);
      }
    }
  }

  private getJoustSwordGeometry(ship: ShipState): {
    left: { startX: number; startY: number; centerX: number; centerY: number };
    right: { startX: number; startY: number; centerX: number; centerY: number };
  } {
    const shipX = ship.x;
    const shipY = ship.y;
    const shipAngle = ship.angle;
    const size = 15;
    const cornerOffset = 8;

    const topWingX =
      shipX +
      Math.cos(shipAngle) * (-size * 0.7) +
      Math.cos(shipAngle - Math.PI / 2) * (-size * 0.6);
    const topWingY =
      shipY +
      Math.sin(shipAngle) * (-size * 0.7) +
      Math.sin(shipAngle - Math.PI / 2) * (-size * 0.6);
    const bottomWingX =
      shipX +
      Math.cos(shipAngle) * (-size * 0.7) +
      Math.cos(shipAngle + Math.PI / 2) * (-size * 0.6);
    const bottomWingY =
      shipY +
      Math.sin(shipAngle) * (-size * 0.7) +
      Math.sin(shipAngle + Math.PI / 2) * (-size * 0.6);

    const leftStartX = topWingX - Math.cos(shipAngle) * cornerOffset;
    const leftStartY = topWingY - Math.sin(shipAngle) * cornerOffset;
    const leftEndX = leftStartX + Math.cos(shipAngle) * JOUST_SWORD_LENGTH;
    const leftEndY = leftStartY + Math.sin(shipAngle) * JOUST_SWORD_LENGTH;

    const rightAngle = shipAngle + Math.PI / 18;
    const rightStartX = bottomWingX - Math.cos(shipAngle) * cornerOffset;
    const rightStartY = bottomWingY - Math.sin(shipAngle) * cornerOffset;
    const rightEndX = rightStartX + Math.cos(rightAngle) * JOUST_SWORD_LENGTH;
    const rightEndY = rightStartY + Math.sin(rightAngle) * JOUST_SWORD_LENGTH;

    return {
      left: {
        startX: leftStartX,
        startY: leftStartY,
        centerX: (leftStartX + leftEndX) * 0.5,
        centerY: (leftStartY + leftEndY) * 0.5,
      },
      right: {
        startX: rightStartX,
        startY: rightStartY,
        centerX: (rightStartX + rightEndX) * 0.5,
        centerY: (rightStartY + rightEndY) * 0.5,
      },
    };
  }

  private spawnAllShips(): void {
    const points = this.getSpawnPoints(this.playerOrder.length);
    this.playerOrder.forEach((playerId, index) => {
      const player = this.players.get(playerId);
      if (!player) return;
      const spawn = points[index] ?? points[0];
      player.state = "ACTIVE";
      player.dashQueued = false;
      player.dashTimerSec = 0;
      player.recoilTimerSec = 0;
      player.angularVelocity = 0;
      player.ship = {
        ...player.ship,
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
        vx: 0,
        vy: 0,
        alive: true,
        invulnerableUntil: this.nowMs + 2000,
        ammo: MAX_AMMO,
        maxAmmo: MAX_AMMO,
        lastShotTime: this.nowMs - FIRE_COOLDOWN_MS - 1,
        reloadStartTime: this.nowMs,
        isReloading: false,
      };
    });
  }

  private grantStartingPowerups(): void {
    if (!this.settings.startPowerups) return;

    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      if (this.playerPowerUps.get(playerId)) continue;
      const idx = this.powerUpRng.nextInt(0, STARTING_POWERUP_TYPES.length - 1);
      this.grantPowerUp(playerId, STARTING_POWERUP_TYPES[idx]);
    }
  }

  private updateBots(): void {
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.isBot || player.botType !== "ai") continue;
      if (this.nowMs - player.botLastDecisionMs < AI_CONFIG.REACTION_DELAY_MS) {
        player.input.buttonA = player.botCachedAction.buttonA;
        player.input.buttonB = player.botCachedAction.buttonB;
        if (player.botCachedAction.dash) {
          player.dashQueued = true;
        }
        continue;
      }
      player.botLastDecisionMs = this.nowMs;

      if (!player.ship.alive) {
        const pilot = this.pilots.get(playerId);
        if (!pilot || !pilot.alive) continue;
        player.botCachedAction = {
          buttonA: this.aiRng.next() > 0.45,
          buttonB: this.aiRng.next() > 0.78,
          dash: false,
        };
        player.input.buttonA = player.botCachedAction.buttonA;
        player.input.buttonB = player.botCachedAction.buttonB;
        continue;
      }

      const target = this.findNearestEnemy(playerId);
      if (!target) {
        player.botCachedAction = {
          buttonA: this.aiRng.next() > 0.5,
          buttonB: this.aiRng.next() > 0.7,
          dash: false,
        };
        player.input.buttonA = player.botCachedAction.buttonA;
        player.input.buttonB = player.botCachedAction.buttonB;
        continue;
      }

      const leadX = target.ship.x + target.ship.vx * AI_CONFIG.LEAD_FACTOR;
      const leadY = target.ship.y + target.ship.vy * AI_CONFIG.LEAD_FACTOR;
      let desired = Math.atan2(leadY - player.ship.y, leadX - player.ship.x);
      desired += (this.aiRng.next() - 0.5) * AI_CONFIG.AIM_ERROR * 2;
      const diff = normalizeAngle(desired - player.ship.angle);
      const aimed = Math.abs(diff) < AI_CONFIG.AIM_TOLERANCE;
      let rotate = !aimed;
      if (this.aiRng.next() < AI_CONFIG.ROTATION_OVERSHOOT) {
        rotate = !rotate;
      }
      const fire = aimed
        ? this.aiRng.next() < AI_CONFIG.FIRE_PROBABILITY
        : this.aiRng.next() < 0.05;
      const dash = aimed && Math.abs(diff) < 0.3 && this.aiRng.next() > 0.94;

      player.botCachedAction = { buttonA: rotate, buttonB: fire, dash };
      player.input.buttonA = rotate;
      player.input.buttonB = fire;
      if (dash) {
        player.dashQueued = true;
      }
    }
  }

  private updateShips(dtSec: number): void {
    const cfg = this.getActiveConfig();
    const isStandard = this.baseMode === "STANDARD";
    const wallRestitution =
      WALL_RESTITUTION_BY_PRESET[this.settings.wallRestitutionPreset] ?? 0;
    const wallFriction =
      WALL_FRICTION_BY_PRESET[this.settings.wallFrictionPreset] ?? 0;
    const shipRestitution =
      SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset] ?? 0;
    const shipFriction =
      SHIP_FRICTION_BY_PRESET[this.settings.shipFrictionPreset] ?? 0;
    const shipFrictionAir =
      SHIP_FRICTION_AIR_BY_PRESET[this.settings.shipFrictionAirPreset] ?? 0;
    const shipAngularDamping =
      SHIP_ANGULAR_DAMPING_BY_PRESET[this.settings.angularDampingPreset] ?? 0;

    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      const ship = player.ship;
      if (!ship.alive) continue;

      if (player.input.buttonA) {
        player.angularVelocity = 0;
        ship.angle += cfg.ROTATION_SPEED * dtSec * this.rotationDirection;
        ship.angle = normalizeAngle(ship.angle);
      } else if (player.angularVelocity !== 0) {
        ship.angle = normalizeAngle(ship.angle + player.angularVelocity * dtSec);
      }

      if (player.dashQueued) {
        player.dashQueued = false;
        if (isStandard) {
          player.dashTimerSec = cfg.SHIP_DASH_DURATION;
        } else {
          const dashImpulse = cfg.DASH_FORCE * FORCE_TO_IMPULSE;
          ship.vx += Math.cos(ship.angle) * dashImpulse;
          ship.vy += Math.sin(ship.angle) * dashImpulse;
        }
        this.hooks.onSound("dash", player.id);
        this.hooks.onDashParticles({
          playerId: player.id,
          x: ship.x,
          y: ship.y,
          angle: ship.angle,
          color: PLAYER_COLORS[player.colorIndex].primary,
        });
      }

      if (player.dashTimerSec > 0) {
        player.dashTimerSec = Math.max(0, player.dashTimerSec - dtSec);
      }
      if (player.recoilTimerSec > 0) {
        player.recoilTimerSec = Math.max(0, player.recoilTimerSec - dtSec);
      }
      if (shipAngularDamping > 0 && player.angularVelocity !== 0) {
        const damping = Math.max(0, 1 - shipAngularDamping * 60 * dtSec);
        player.angularVelocity *= damping;
        if (Math.abs(player.angularVelocity) < 1e-4) {
          player.angularVelocity = 0;
        }
      }

      if (isStandard) {
        const dashBoost = player.dashTimerSec > 0 ? cfg.SHIP_DASH_BOOST : 0;
        const recoilSlowdown =
          player.recoilTimerSec > 0 ? cfg.SHIP_RECOIL_SLOWDOWN : 0;
        const targetSpeedPxSec = Math.max(
          0,
          (cfg.SHIP_TARGET_SPEED + dashBoost - recoilSlowdown) * 60,
        );
        const desiredVx = Math.cos(ship.angle) * targetSpeedPxSec;
        const desiredVy = Math.sin(ship.angle) * targetSpeedPxSec;
        const t = 1 - Math.exp(-cfg.SHIP_SPEED_RESPONSE * dtSec);
        ship.vx += (desiredVx - ship.vx) * t;
        ship.vy += (desiredVy - ship.vy) * t;
      } else {
        const accel = cfg.BASE_THRUST * FORCE_TO_ACCEL;
        ship.vx += Math.cos(ship.angle) * accel * dtSec;
        ship.vy += Math.sin(ship.angle) * accel * dtSec;
      }

      // Mirror Matter's frictionAir behavior for velocity damping.
      if (shipFrictionAir > 0) {
        const damping = Math.max(0, 1 - shipFrictionAir * 60 * dtSec);
        ship.vx *= damping;
        ship.vy *= damping;
      }

      if (player.input.buttonB) {
        this.tryFire(player, cfg, isStandard);
      }

      this.updateReload(ship);
      ship.x += ship.vx * dtSec;
      ship.y += ship.vy * dtSec;

      if (ship.x < SHIP_RADIUS) {
        ship.x = SHIP_RADIUS;
        ship.vx = Math.abs(ship.vx) * wallRestitution;
        ship.vy *= Math.max(0, 1 - wallFriction);
      }
      if (ship.x > ARENA_WIDTH - SHIP_RADIUS) {
        ship.x = ARENA_WIDTH - SHIP_RADIUS;
        ship.vx = -Math.abs(ship.vx) * wallRestitution;
        ship.vy *= Math.max(0, 1 - wallFriction);
      }
      if (ship.y < SHIP_RADIUS) {
        ship.y = SHIP_RADIUS;
        ship.vy = Math.abs(ship.vy) * wallRestitution;
        ship.vx *= Math.max(0, 1 - wallFriction);
      }
      if (ship.y > ARENA_HEIGHT - SHIP_RADIUS) {
        ship.y = ARENA_HEIGHT - SHIP_RADIUS;
        ship.vy = -Math.abs(ship.vy) * wallRestitution;
        ship.vx *= Math.max(0, 1 - wallFriction);
      }
    }

    // Host path previously relied on Matter collision response.
    this.resolveShipShipCollisions(shipRestitution, shipFriction);
  }

  private resolveShipShipCollisions(restitution: number, friction: number): void {
    for (let i = 0; i < this.playerOrder.length; i++) {
      const a = this.players.get(this.playerOrder[i]);
      if (!a || !a.ship.alive) continue;
      for (let j = i + 1; j < this.playerOrder.length; j++) {
        const b = this.players.get(this.playerOrder[j]);
        if (!b || !b.ship.alive) continue;
        const result = this.resolveCircleCollision(
          a.ship,
          b.ship,
          SHIP_RADIUS + SHIP_RADIUS,
          restitution,
          friction,
          1,
          1,
        );
        if (result.collided) {
          this.applyShipSpinFromTangential(a, -result.relativeTangentSpeed);
          this.applyShipSpinFromTangential(b, result.relativeTangentSpeed);
        }
      }
    }
  }

  private resolveShipAsteroidCollisions(shipRestitution: number): void {
    const shipFriction =
      SHIP_FRICTION_BY_PRESET[this.settings.shipFrictionPreset] ?? 0;

    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;

      for (const asteroid of this.asteroids) {
        if (!asteroid.alive) continue;

        const result = this.resolveCircleCollision(
          player.ship,
          asteroid,
          SHIP_RADIUS + asteroid.size,
          (shipRestitution + ASTEROID_RESTITUTION) * 0.5,
          (shipFriction + ASTEROID_FRICTION) * 0.5,
          1,
          Math.max(1, asteroid.size / ASTEROID_SMALL_MIN),
        );
        if (result.collided) {
          this.applyShipSpinFromTangential(player, -result.relativeTangentSpeed);
        }

        if (
          result.collided &&
          ASTEROID_DAMAGE_SHIPS &&
          player.ship.invulnerableUntil <= this.nowMs
        ) {
          this.destroyAsteroid(asteroid);
          this.onShipHit(undefined, player);
          this.playerPowerUps.delete(playerId);
          break;
        }
      }
    }
  }

  private resolvePilotAsteroidCollisions(): void {
    for (const [pilotPlayerId, pilot] of this.pilots) {
      if (!pilot.alive) continue;

      for (const asteroid of this.asteroids) {
        if (!asteroid.alive) continue;

        const result = this.resolveCircleCollision(
          pilot,
          asteroid,
          PILOT_RADIUS + asteroid.size,
          (0.5 + ASTEROID_RESTITUTION) * 0.5,
          ASTEROID_FRICTION,
          0.35,
          Math.max(1, asteroid.size / ASTEROID_SMALL_MIN),
        );

        if (result.collided && ASTEROID_DAMAGE_SHIPS) {
          this.destroyAsteroid(asteroid);
          this.killPilot(pilotPlayerId, "asteroid");
          break;
        }
      }
    }
  }

  private resolveAsteroidAsteroidCollisions(): void {
    for (let i = 0; i < this.asteroids.length; i++) {
      const a = this.asteroids[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.asteroids.length; j++) {
        const b = this.asteroids[j];
        if (!b.alive) continue;
        this.resolveCircleCollision(
          a,
          b,
          a.size + b.size,
          ASTEROID_RESTITUTION,
          ASTEROID_FRICTION,
          Math.max(1, a.size / ASTEROID_SMALL_MIN),
          Math.max(1, b.size / ASTEROID_SMALL_MIN),
        );
      }
    }
  }

  private resolveCircleCollision(
    a: { x: number; y: number; vx: number; vy: number },
    b: { x: number; y: number; vx: number; vy: number },
    minDistance: number,
    restitution: number,
    friction: number,
    massA: number,
    massB: number,
  ): { collided: boolean; relativeTangentSpeed: number } {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;
    const minDistSq = minDistance * minDistance;
    if (distSq > minDistSq) {
      return { collided: false, relativeTangentSpeed: 0 };
    }

    const distance = Math.sqrt(Math.max(distSq, 1e-6));
    const nx = dx / distance;
    const ny = dy / distance;
    const overlap = minDistance - distance;

    if (overlap > 0) {
      const totalMass = massA + massB;
      const moveA = (overlap * (massB / totalMass)) + 0.01;
      const moveB = (overlap * (massA / totalMass)) + 0.01;
      a.x -= nx * moveA;
      a.y -= ny * moveA;
      b.x += nx * moveB;
      b.y += ny * moveB;
    }

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;
    const tangentX = -ny;
    const tangentY = nx;
    const relTan = rvx * tangentX + rvy * tangentY;

    if (velAlongNormal > 0) {
      return { collided: true, relativeTangentSpeed: relTan };
    }

    const e = clamp(restitution, 0, 1);
    const invMassA = 1 / Math.max(1e-6, massA);
    const invMassB = 1 / Math.max(1e-6, massB);
    const j = (-(1 + e) * velAlongNormal) / (invMassA + invMassB);
    const impulseX = j * nx;
    const impulseY = j * ny;

    a.vx -= impulseX * invMassA;
    a.vy -= impulseY * invMassA;
    b.vx += impulseX * invMassB;
    b.vy += impulseY * invMassB;

    const mu = clamp(friction, 0, 1);
    if (mu > 0) {
      const jtUnclamped = -relTan / (invMassA + invMassB);
      const maxJt = Math.abs(j) * mu;
      const jt = clamp(jtUnclamped, -maxJt, maxJt);
      const frictionX = jt * tangentX;
      const frictionY = jt * tangentY;
      a.vx -= frictionX * invMassA;
      a.vy -= frictionY * invMassA;
      b.vx += frictionX * invMassB;
      b.vy += frictionY * invMassB;
    }

    return { collided: true, relativeTangentSpeed: relTan };
  }

  private applyShipSpinFromTangential(
    player: RuntimePlayer,
    tangentSpeed: number,
  ): void {
    const spinDelta = clamp(tangentSpeed * 0.0012, -2.5, 2.5);
    player.angularVelocity = clamp(player.angularVelocity + spinDelta, -7, 7);
  }

  private updatePilots(dtSec: number): void {
    const cfg = this.getActiveConfig();
    const wallRestitution = Math.max(
      0.5,
      WALL_RESTITUTION_BY_PRESET[this.settings.wallRestitutionPreset] ?? 0,
    );
    const wallFriction =
      WALL_FRICTION_BY_PRESET[this.settings.wallFrictionPreset] ?? 0;
    for (const [playerId, pilot] of this.pilots) {
      if (!pilot.alive) continue;
      const player = this.players.get(playerId);
      if (!player) continue;

      let rotate = player.input.buttonA;
      let dash = player.input.buttonB;
      if (pilot.controlMode === "ai") {
        if (this.nowMs >= pilot.aiThinkAtMs) {
          pilot.aiThinkAtMs = this.nowMs + 300;
          let nearestThreat: { x: number; y: number; distSq: number } | null = null;
          for (const asteroid of this.asteroids) {
            if (!asteroid.alive) continue;
            const dx = asteroid.x - pilot.x;
            const dy = asteroid.y - pilot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 200 * 200) continue;
            if (!nearestThreat || distSq < nearestThreat.distSq) {
              nearestThreat = { x: asteroid.x, y: asteroid.y, distSq };
            }
          }
          if (nearestThreat) {
            const awayAngle = Math.atan2(pilot.y - nearestThreat.y, pilot.x - nearestThreat.x);
            pilot.aiTargetAngle = awayAngle;
            pilot.aiShouldDash = Math.sqrt(nearestThreat.distSq) < 140;
          } else if (this.aiRng.next() < 0.3) {
            pilot.aiTargetAngle = this.aiRng.next() * Math.PI * 2;
            pilot.aiShouldDash = this.aiRng.next() < 0.25;
          } else {
            pilot.aiShouldDash = false;
          }
        }
        const angleDiff = Math.abs(normalizeAngle(pilot.aiTargetAngle - pilot.angle));
        rotate = angleDiff > 0.35;
        dash = pilot.aiShouldDash && angleDiff <= 0.35;
      }

      if (rotate) {
        pilot.angle += cfg.PILOT_ROTATION_SPEED * dtSec * this.rotationDirection;
      }
      if (dash && this.nowMs - pilot.lastDashAtMs >= PILOT_DASH_COOLDOWN_MS) {
        pilot.lastDashAtMs = this.nowMs;
        // Pilot dash is a short impulse, not a sustained acceleration step.
        const dashImpulse = cfg.PILOT_DASH_FORCE * FORCE_TO_IMPULSE;
        pilot.vx += Math.cos(pilot.angle) * dashImpulse;
        pilot.vy += Math.sin(pilot.angle) * dashImpulse;
      }

      pilot.vx *= 0.95;
      pilot.vy *= 0.95;
      pilot.x += pilot.vx * dtSec;
      pilot.y += pilot.vy * dtSec;

      if (pilot.x < PILOT_RADIUS) {
        pilot.x = PILOT_RADIUS;
        pilot.vx = Math.abs(pilot.vx) * wallRestitution;
        pilot.vy *= Math.max(0, 1 - wallFriction);
      }
      if (pilot.x > ARENA_WIDTH - PILOT_RADIUS) {
        pilot.x = ARENA_WIDTH - PILOT_RADIUS;
        pilot.vx = -Math.abs(pilot.vx) * wallRestitution;
        pilot.vy *= Math.max(0, 1 - wallFriction);
      }
      if (pilot.y < PILOT_RADIUS) {
        pilot.y = PILOT_RADIUS;
        pilot.vy = Math.abs(pilot.vy) * wallRestitution;
        pilot.vx *= Math.max(0, 1 - wallFriction);
      }
      if (pilot.y > ARENA_HEIGHT - PILOT_RADIUS) {
        pilot.y = ARENA_HEIGHT - PILOT_RADIUS;
        pilot.vy = -Math.abs(pilot.vy) * wallRestitution;
        pilot.vx *= Math.max(0, 1 - wallFriction);
      }

      if (this.nowMs - pilot.spawnTime >= PILOT_SURVIVAL_MS) {
        this.respawnFromPilot(playerId, pilot);
      }
    }
  }

  private updateAsteroids(dtSec: number): void {
    const wallRestitution =
      WALL_RESTITUTION_BY_PRESET[this.settings.wallRestitutionPreset] ?? 0;
    const wallFriction =
      WALL_FRICTION_BY_PRESET[this.settings.wallFrictionPreset] ?? 0;
    for (const asteroid of this.asteroids) {
      if (!asteroid.alive) continue;
      asteroid.x += asteroid.vx * dtSec;
      asteroid.y += asteroid.vy * dtSec;
      asteroid.angle += asteroid.angularVelocity * dtSec;

      if (asteroid.x < asteroid.size) {
        asteroid.x = asteroid.size;
        asteroid.vx = Math.abs(asteroid.vx) * wallRestitution;
        asteroid.vy *= Math.max(0, 1 - wallFriction);
      }
      if (asteroid.x > ARENA_WIDTH - asteroid.size) {
        asteroid.x = ARENA_WIDTH - asteroid.size;
        asteroid.vx = -Math.abs(asteroid.vx) * wallRestitution;
        asteroid.vy *= Math.max(0, 1 - wallFriction);
      }
      if (asteroid.y < asteroid.size) {
        asteroid.y = asteroid.size;
        asteroid.vy = Math.abs(asteroid.vy) * wallRestitution;
        asteroid.vx *= Math.max(0, 1 - wallFriction);
      }
      if (asteroid.y > ARENA_HEIGHT - asteroid.size) {
        asteroid.y = ARENA_HEIGHT - asteroid.size;
        asteroid.vy = -Math.abs(asteroid.vy) * wallRestitution;
        asteroid.vx *= Math.max(0, 1 - wallFriction);
      }
    }
  }

  private updatePowerUps(dtSec: number): void {
    for (const powerUp of this.powerUps) {
      if (!powerUp.alive) continue;
      if (this.nowMs - powerUp.spawnTime > POWERUP_DESPAWN_MS) {
        powerUp.alive = false;
        continue;
      }

      let best: { id: string; x: number; y: number; distSq: number } | null = null;
      for (const playerId of this.playerOrder) {
        const player = this.players.get(playerId);
        if (!player || !player.ship.alive) continue;
        if (this.playerPowerUps.get(playerId)) continue;
        const dx = player.ship.x - powerUp.x;
        const dy = player.ship.y - powerUp.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > powerUp.magneticRadius * powerUp.magneticRadius) continue;
        if (!best || distSq < best.distSq) {
          best = { id: playerId, x: player.ship.x, y: player.ship.y, distSq };
        }
      }

      if (!best) {
        powerUp.isMagneticActive = false;
        powerUp.targetPlayerId = null;
        continue;
      }

      powerUp.isMagneticActive = true;
      powerUp.targetPlayerId = best.id;
      const angle = Math.atan2(best.y - powerUp.y, best.x - powerUp.x);
      powerUp.x += Math.cos(angle) * powerUp.magneticSpeed * dtSec;
      powerUp.y += Math.sin(angle) * powerUp.magneticSpeed * dtSec;
    }
  }

  private tryFire(
    player: RuntimePlayer,
    cfg: typeof STANDARD_CONFIG,
    isStandard: boolean,
  ): void {
    const ship = player.ship;
    if (this.nowMs - ship.lastShotTime < FIRE_COOLDOWN_MS) return;
    if (ship.ammo <= 0) return;

    ship.lastShotTime = this.nowMs;
    ship.ammo -= 1;

    if (isStandard) {
      player.recoilTimerSec = cfg.SHIP_RECOIL_DURATION;
    } else {
      const recoilImpulse = cfg.RECOIL_FORCE * RECOIL_TO_IMPULSE;
      ship.vx -= Math.cos(ship.angle) * recoilImpulse;
      ship.vy -= Math.sin(ship.angle) * recoilImpulse;
    }

    if (!ship.isReloading) {
      ship.reloadStartTime = this.nowMs;
      ship.isReloading = true;
    }

    const spawnX = ship.x + Math.cos(ship.angle) * 18;
    const spawnY = ship.y + Math.sin(ship.angle) * 18;
    const powerUp = this.playerPowerUps.get(player.id);

    if (powerUp?.type === "JOUST") {
      return;
    }

    if (powerUp?.type === "LASER" && powerUp.charges > 0) {
      if (this.nowMs - powerUp.lastFireTime <= LASER_COOLDOWN_MS) {
        return;
      }
      powerUp.lastFireTime = this.nowMs;
      powerUp.charges -= 1;
      this.laserBeams.push({
        id: this.nextEntityId("beam"),
        ownerId: player.id,
        x: spawnX,
        y: spawnY,
        angle: ship.angle,
        spawnTime: this.nowMs,
        alive: true,
        durationMs: LASER_BEAM_DURATION_MS,
      });
      this.applyLaserDamage(player.id, spawnX, spawnY, ship.angle);
      this.hooks.onSound("fire", player.id);
      if (powerUp.charges <= 0) {
        this.playerPowerUps.delete(player.id);
      }
      return;
    }

    if (powerUp?.type === "SCATTER" && powerUp.charges > 0) {
      if (this.nowMs - powerUp.lastFireTime <= SCATTER_COOLDOWN_MS) {
        return;
      }
      powerUp.lastFireTime = this.nowMs;
      powerUp.charges -= 1;
      const offsets = [-(SCATTER_ANGLE_DEG * Math.PI) / 180, 0, (SCATTER_ANGLE_DEG * Math.PI) / 180];
      for (const offset of offsets) {
        const angle = ship.angle + offset;
        this.projectiles.push({
          id: this.nextEntityId("proj"),
          ownerId: player.id,
          x: spawnX,
          y: spawnY,
          vx: Math.cos(angle) * SCATTER_PROJECTILE_SPEED_PX_PER_SEC,
          vy: Math.sin(angle) * SCATTER_PROJECTILE_SPEED_PX_PER_SEC,
          spawnTime: this.nowMs,
          lifetimeMs: SCATTER_PROJECTILE_LIFETIME_MS,
        });
      }
      this.hooks.onSound("fire", player.id);
      if (powerUp.charges <= 0) {
        this.playerPowerUps.delete(player.id);
      }
      return;
    }

    if (powerUp?.type === "MINE" && powerUp.charges > 0) {
      powerUp.charges -= 1;
      const mineOffset = 30;
      this.mines.push({
        id: this.nextEntityId("mine"),
        ownerId: player.id,
        x: spawnX - Math.cos(ship.angle) * mineOffset,
        y: spawnY - Math.sin(ship.angle) * mineOffset,
        spawnTime: this.nowMs,
        alive: true,
        exploded: false,
        explosionTime: 0,
        arming: false,
        armingStartTime: 0,
      });
      this.hooks.onSound("fire", player.id);
      if (powerUp.charges <= 0) {
        this.playerPowerUps.delete(player.id);
      }
      return;
    }

    if (powerUp?.type === "HOMING_MISSILE" && powerUp.charges > 0) {
      powerUp.charges -= 1;
      this.homingMissiles.push({
        id: this.nextEntityId("missile"),
        ownerId: player.id,
        x: spawnX,
        y: spawnY,
        vx: Math.cos(ship.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC,
        vy: Math.sin(ship.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC,
        angle: ship.angle,
        spawnTime: this.nowMs,
        alive: true,
        targetId: null,
        hasDetectedTarget: false,
      });
      this.hooks.onSound("fire", player.id);
      if (powerUp.charges <= 0) {
        this.playerPowerUps.delete(player.id);
      }
      return;
    }

    this.projectiles.push({
      id: this.nextEntityId("proj"),
      ownerId: player.id,
      x: spawnX,
      y: spawnY,
      vx: Math.cos(ship.angle) * cfg.PROJECTILE_SPEED,
      vy: Math.sin(ship.angle) * cfg.PROJECTILE_SPEED,
      spawnTime: this.nowMs,
      lifetimeMs: PROJECTILE_LIFETIME_MS,
    });
    this.hooks.onSound("fire", player.id);
  }

  private updateReload(ship: ShipState): void {
    if (!ship.isReloading) return;
    if (ship.ammo >= ship.maxAmmo) {
      ship.isReloading = false;
      return;
    }
    if (this.nowMs - ship.reloadStartTime < RELOAD_MS) return;
    ship.ammo += 1;
    ship.reloadStartTime = this.nowMs;
    if (ship.ammo >= ship.maxAmmo) {
      ship.ammo = ship.maxAmmo;
      ship.isReloading = false;
    }
  }

  private updateProjectiles(dtSec: number): void {
    for (const proj of this.projectiles) {
      proj.x += proj.vx * dtSec;
      proj.y += proj.vy * dtSec;
    }
    this.projectiles = this.projectiles.filter((proj) => {
      if (this.nowMs - proj.spawnTime > proj.lifetimeMs) return false;
      if (proj.x <= PROJECTILE_RADIUS || proj.x >= ARENA_WIDTH - PROJECTILE_RADIUS) return false;
      if (proj.y <= PROJECTILE_RADIUS || proj.y >= ARENA_HEIGHT - PROJECTILE_RADIUS) return false;
      return true;
    });
  }

  private processProjectileCollisions(): void {
    const consumed = new Set<string>();
    for (const proj of this.projectiles) {
      if (consumed.has(proj.id)) continue;
      const owner = this.players.get(proj.ownerId);
      for (const playerId of this.playerOrder) {
        if (playerId === proj.ownerId) continue;
        const target = this.players.get(playerId);
        if (!target || !target.ship.alive) continue;
        if (target.ship.invulnerableUntil > this.nowMs) continue;
        const dx = target.ship.x - proj.x;
        const dy = target.ship.y - proj.y;
        if (dx * dx + dy * dy > SHIP_HIT_RADIUS * SHIP_HIT_RADIUS) continue;
        const shield = this.playerPowerUps.get(playerId);
        if (shield?.type === "SHIELD") {
          shield.shieldHits += 1;
          this.triggerScreenShake(3, 0.1);
          if (shield.shieldHits >= POWERUP_SHIELD_HITS) {
            this.playerPowerUps.delete(playerId);
          }
          consumed.add(proj.id);
          break;
        }
        consumed.add(proj.id);
        this.playerPowerUps.delete(playerId);
        this.onShipHit(owner, target);
        break;
      }

      if (consumed.has(proj.id)) continue;
      for (const [pilotPlayerId, pilot] of this.pilots) {
        if (!pilot.alive) continue;
        const dx = pilot.x - proj.x;
        const dy = pilot.y - proj.y;
        if (dx * dx + dy * dy > PILOT_RADIUS * PILOT_RADIUS) continue;
        consumed.add(proj.id);
        this.killPilot(pilotPlayerId, proj.ownerId);
        break;
      }

      if (consumed.has(proj.id)) continue;
      for (const asteroid of this.asteroids) {
        if (!asteroid.alive) continue;
        const dx = asteroid.x - proj.x;
        const dy = asteroid.y - proj.y;
        if (dx * dx + dy * dy > asteroid.size * asteroid.size) continue;
        consumed.add(proj.id);
        this.destroyAsteroid(asteroid);
        break;
      }
    }
    if (consumed.size > 0) {
      this.projectiles = this.projectiles.filter((p) => !consumed.has(p.id));
    }
  }

  private onShipHit(owner: RuntimePlayer | undefined, target: RuntimePlayer): void {
    if (!target.ship.alive) return;
    const prevVx = target.ship.vx;
    const prevVy = target.ship.vy;
    const prevAngle = target.ship.angle;
    target.ship.alive = false;
    target.ship.vx = 0;
    target.ship.vy = 0;
    target.state = "EJECTED";
    const controlMode: RuntimePilot["controlMode"] =
      target.isBot && target.botType === "ai" ? "ai" : "player";
    this.pilots.set(target.id, {
      id: this.nextEntityId("pilot"),
      playerId: target.id,
      x: target.ship.x,
      y: target.ship.y,
      vx: prevVx * 0.7,
      vy: prevVy * 0.7,
      angle: prevAngle,
      spawnTime: this.nowMs,
      survivalProgress: 0,
      alive: true,
      lastDashAtMs: this.nowMs - PILOT_DASH_COOLDOWN_MS - 1,
      controlMode,
      aiThinkAtMs: this.nowMs + 300,
      aiTargetAngle: prevAngle,
      aiShouldDash: false,
    });

    this.hooks.onSound("explosion", target.id);
    this.triggerScreenShake(15, 0.4);
    this.syncPlayers();
  }

  private killPilot(pilotPlayerId: string, killerId: string): void {
    const pilot = this.pilots.get(pilotPlayerId);
    if (!pilot || !pilot.alive) return;
    pilot.alive = false;
    this.pilots.delete(pilotPlayerId);

    const player = this.players.get(pilotPlayerId);
    if (player) {
      player.state = "SPECTATING";
    }

    if (killerId !== "asteroid") {
      const killer = this.players.get(killerId);
      if (killer) {
        killer.kills += 1;
      }
    }

    this.hooks.onSound("kill", pilotPlayerId);
    this.triggerScreenShake(10, 0.3);
    this.syncPlayers();
  }

  private respawnFromPilot(playerId: string, pilot: RuntimePilot): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.pilots.delete(playerId);

    player.ship.x = pilot.x;
    player.ship.y = pilot.y;
    player.ship.vx = 0;
    player.ship.vy = 0;
    player.ship.angle = pilot.angle;
    player.ship.alive = true;
    player.ship.invulnerableUntil = this.nowMs + 2000;
    player.angularVelocity = 0;
    player.ship.ammo = MAX_AMMO;
    player.ship.lastShotTime = this.nowMs - FIRE_COOLDOWN_MS - 1;
    player.ship.reloadStartTime = this.nowMs;
    player.ship.isReloading = false;
    player.state = "ACTIVE";

    this.hooks.onSound("respawn", player.id);
    this.syncPlayers();
  }

  private processPowerUpPickups(): void {
    for (const powerUp of this.powerUps) {
      if (!powerUp.alive) continue;
      for (const playerId of this.playerOrder) {
        const player = this.players.get(playerId);
        if (!player || !player.ship.alive) continue;
        if (this.playerPowerUps.get(playerId)) continue;
        const dx = player.ship.x - powerUp.x;
        const dy = player.ship.y - powerUp.y;
        if (dx * dx + dy * dy > POWERUP_PICKUP_RADIUS * POWERUP_PICKUP_RADIUS) {
          continue;
        }
        this.grantPowerUp(playerId, powerUp.type);
        powerUp.alive = false;
        break;
      }
    }
  }

  private processShipPilotCollisions(): void {
    for (const playerId of this.playerOrder) {
      const shipOwner = this.players.get(playerId);
      if (!shipOwner || !shipOwner.ship.alive) continue;
      for (const [pilotPlayerId, pilot] of this.pilots) {
        if (!pilot.alive) continue;
        if (pilotPlayerId === playerId) continue;
        const dx = shipOwner.ship.x - pilot.x;
        const dy = shipOwner.ship.y - pilot.y;
        if (dx * dx + dy * dy > (SHIP_RADIUS + PILOT_RADIUS) * (SHIP_RADIUS + PILOT_RADIUS)) {
          continue;
        }
        this.killPilot(pilotPlayerId, playerId);
      }
    }
  }

  private updateLaserBeams(): void {
    for (const beam of this.laserBeams) {
      if (!beam.alive) continue;
      if (this.nowMs - beam.spawnTime > beam.durationMs) {
        beam.alive = false;
      }
    }
  }

  private explodeMine(mine: RuntimeMine): void {
    if (!mine.alive || mine.exploded) return;
    mine.exploded = true;
    mine.explosionTime = this.nowMs;
    mine.arming = false;
    this.triggerScreenShake(15, 0.4);

    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - mine.x;
      const dy = player.ship.y - mine.y;
      if (dx * dx + dy * dy > MINE_EXPLOSION_RADIUS * MINE_EXPLOSION_RADIUS) continue;
      player.ship.alive = false;
      player.ship.vx = 0;
      player.ship.vy = 0;
      player.state = "SPECTATING";
      this.playerPowerUps.delete(playerId);
      this.hooks.onSound("explosion", playerId);
    }

    for (const [pilotPlayerId, pilot] of this.pilots) {
      if (!pilot.alive) continue;
      const dx = pilot.x - mine.x;
      const dy = pilot.y - mine.y;
      if (dx * dx + dy * dy > MINE_EXPLOSION_RADIUS * MINE_EXPLOSION_RADIUS) continue;
      pilot.alive = false;
      this.pilots.delete(pilotPlayerId);
      const player = this.players.get(pilotPlayerId);
      if (player) {
        player.state = "SPECTATING";
      }
      this.hooks.onSound("kill", pilotPlayerId);
    }

    const eliminationAt = this.nowMs + 2000;
    if (
      this.pendingEliminationCheckAtMs === null ||
      eliminationAt < this.pendingEliminationCheckAtMs
    ) {
      this.pendingEliminationCheckAtMs = eliminationAt;
    }
    this.syncPlayers();
  }

  private checkMineCollisions(): void {
    const devMultiplier = this.devModeEnabled ? 3 : 1;
    const detectionRadius = MINE_DETECTION_RADIUS * devMultiplier;

    for (const mine of this.mines) {
      if (!mine.alive || mine.exploded) continue;

      if (mine.arming && this.nowMs - mine.armingStartTime >= MINE_ARMING_DELAY_MS) {
        this.explodeMine(mine);
        mine.triggeringPlayerId = undefined;
        continue;
      }

      if (mine.arming) continue;

      for (const playerId of this.playerOrder) {
        if (playerId === mine.ownerId) continue;
        const player = this.players.get(playerId);
        if (!player || !player.ship.alive) continue;
        const dx = player.ship.x - mine.x;
        const dy = player.ship.y - mine.y;
        if (dx * dx + dy * dy > detectionRadius * detectionRadius) continue;
        mine.arming = true;
        mine.armingStartTime = this.nowMs;
        mine.triggeringPlayerId = playerId;
        this.triggerScreenShake(5, 0.15);
        break;
      }
    }
  }

  private updateMines(): void {
    // Mines are static entities. State transitions are handled in checkMineCollisions().
  }

  private updateHomingMissiles(dtSec: number): void {
    for (const missile of this.homingMissiles) {
      if (!missile.alive) continue;

      let nearestId: string | null = null;
      let nearestDistSq = Infinity;
      for (const playerId of this.playerOrder) {
        if (playerId === missile.ownerId) continue;
        const player = this.players.get(playerId);
        if (!player || !player.ship.alive) continue;
        const dx = player.ship.x - missile.x;
        const dy = player.ship.y - missile.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > HOMING_MISSILE_DETECTION_RADIUS * HOMING_MISSILE_DETECTION_RADIUS) continue;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestId = playerId;
        }
      }

      if (nearestId) {
        missile.targetId = nearestId;
        missile.hasDetectedTarget = true;
      }

      if (missile.hasDetectedTarget && missile.targetId) {
        const target = this.players.get(missile.targetId);
        if (target && target.ship.alive) {
          const desired = Math.atan2(target.ship.y - missile.y, target.ship.x - missile.x);
          const diff = normalizeAngle(desired - missile.angle);
          const turnRate = HOMING_MISSILE_TURN_RATE * dtSec;
          const maxTurn = turnRate * HOMING_MISSILE_ACCURACY;
          missile.angle += clamp(diff, -maxTurn, maxTurn);
        } else {
          missile.targetId = null;
        }
      }

      missile.vx = Math.cos(missile.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC;
      missile.vy = Math.sin(missile.angle) * HOMING_MISSILE_SPEED_PX_PER_SEC;
      missile.x += missile.vx * dtSec;
      missile.y += missile.vy * dtSec;

      const margin = 100;
      if (
        missile.x < -margin ||
        missile.x > ARENA_WIDTH + margin ||
        missile.y < -margin ||
        missile.y > ARENA_HEIGHT + margin
      ) {
        missile.alive = false;
      }
    }
  }

  private checkHomingMissileCollisions(): void {
    for (const missile of this.homingMissiles) {
      if (!missile.alive) continue;

      for (const playerId of this.playerOrder) {
        if (playerId === missile.ownerId) continue;
        const player = this.players.get(playerId);
        if (!player || !player.ship.alive) continue;
        const dx = player.ship.x - missile.x;
        const dy = player.ship.y - missile.y;
        if (dx * dx + dy * dy > (SHIP_HIT_RADIUS + HOMING_MISSILE_RADIUS) ** 2) continue;

        const powerUp = this.playerPowerUps.get(playerId);
        if (powerUp?.type === "SHIELD") {
          powerUp.shieldHits += 1;
          this.triggerScreenShake(3, 0.1);
          if (powerUp.shieldHits >= POWERUP_SHIELD_HITS) {
            this.playerPowerUps.delete(playerId);
          }
          missile.alive = false;
          break;
        }

        if (powerUp?.type === "JOUST") {
          const missileAngle = Math.atan2(missile.vy, missile.vx);
          const angleToShip = Math.atan2(dy, dx);
          const approachDiff = Math.abs(normalizeAngle(angleToShip - missileAngle));
          const isFromSide = approachDiff > Math.PI / 4;

          if (!isFromSide) {
            this.playerPowerUps.delete(playerId);
            this.onShipHit(this.players.get(missile.ownerId), player);
            missile.alive = false;
            break;
          }

          const relativeAngle = normalizeAngle(Math.atan2(dy, dx) - player.ship.angle);
          const isLeftSide = relativeAngle > 0;
          if (isLeftSide && powerUp.leftSwordActive) {
            powerUp.leftSwordActive = false;
            missile.alive = false;
            this.triggerScreenShake(5, 0.15);
          } else if (!isLeftSide && powerUp.rightSwordActive) {
            powerUp.rightSwordActive = false;
            missile.alive = false;
            this.triggerScreenShake(5, 0.15);
          } else {
            this.playerPowerUps.delete(playerId);
            this.onShipHit(this.players.get(missile.ownerId), player);
            missile.alive = false;
          }
          if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
            this.playerPowerUps.delete(playerId);
          }
          break;
        }

        this.playerPowerUps.delete(playerId);
        this.onShipHit(this.players.get(missile.ownerId), player);
        missile.alive = false;
        this.triggerScreenShake(10, 0.3);
        break;
      }

      if (!missile.alive) continue;

      for (const asteroid of this.asteroids) {
        if (!asteroid.alive) continue;
        const dx = asteroid.x - missile.x;
        const dy = asteroid.y - missile.y;
        if (dx * dx + dy * dy > (asteroid.size + HOMING_MISSILE_RADIUS) ** 2) continue;
        this.destroyAsteroid(asteroid);
        missile.alive = false;
        break;
      }
    }
  }

  private updateJoustCollisions(): void {
    const consumedProjectiles = new Set<string>();
    for (const [playerId, powerUp] of this.playerPowerUps) {
      if (powerUp?.type !== "JOUST") continue;
      const owner = this.players.get(playerId);
      if (!owner || !owner.ship.alive) continue;

      const swords = this.getJoustSwordGeometry(owner.ship);

      for (const otherId of this.playerOrder) {
        if (otherId === playerId) continue;
        const other = this.players.get(otherId);
        if (!other || !other.ship.alive) continue;
        let hitShip = false;

        if (powerUp.leftSwordActive) {
          const dx = other.ship.x - swords.left.centerX;
          const dy = other.ship.y - swords.left.centerY;
          if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 20) ** 2) {
            this.playerPowerUps.delete(otherId);
            this.onShipHit(owner, other);
            powerUp.leftSwordActive = false;
            this.triggerScreenShake(8, 0.25);
            hitShip = true;
          }
        }

        if (!hitShip && powerUp.rightSwordActive) {
          const dx = other.ship.x - swords.right.centerX;
          const dy = other.ship.y - swords.right.centerY;
          if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 20) ** 2) {
            this.playerPowerUps.delete(otherId);
            this.onShipHit(owner, other);
            powerUp.rightSwordActive = false;
            this.triggerScreenShake(8, 0.25);
          }
        }

        if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
          this.playerPowerUps.delete(playerId);
          break;
        }
      }

      if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) continue;

      for (const proj of this.projectiles) {
        if (proj.ownerId === playerId || consumedProjectiles.has(proj.id)) continue;
        const projAngle = Math.atan2(proj.vy, proj.vx);
        const angleToShip = Math.atan2(owner.ship.y - proj.y, owner.ship.x - proj.x);
        const isFromSide = Math.abs(normalizeAngle(angleToShip - projAngle)) > Math.PI / 4;

        if (powerUp.leftSwordActive) {
          const dx = proj.x - swords.left.centerX;
          const dy = proj.y - swords.left.centerY;
          if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 8) ** 2 && isFromSide) {
            powerUp.leftSwordActive = false;
            consumedProjectiles.add(proj.id);
            this.triggerScreenShake(5, 0.15);
          }
        }
        if (powerUp.rightSwordActive) {
          const dx = proj.x - swords.right.centerX;
          const dy = proj.y - swords.right.centerY;
          if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + 8) ** 2 && isFromSide) {
            powerUp.rightSwordActive = false;
            consumedProjectiles.add(proj.id);
            this.triggerScreenShake(5, 0.15);
          }
        }
      }

      if (!powerUp.leftSwordActive && !powerUp.rightSwordActive) {
        this.playerPowerUps.delete(playerId);
        continue;
      }

      for (const asteroid of this.asteroids) {
        if (!asteroid.alive) continue;
        let destroyed = false;
        if (powerUp.leftSwordActive) {
          const dx = asteroid.x - swords.left.centerX;
          const dy = asteroid.y - swords.left.centerY;
          if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + asteroid.size) ** 2) {
            destroyed = true;
          }
        }
        if (!destroyed && powerUp.rightSwordActive) {
          const dx = asteroid.x - swords.right.centerX;
          const dy = asteroid.y - swords.right.centerY;
          if (dx * dx + dy * dy <= (JOUST_COLLISION_RADIUS + asteroid.size) ** 2) {
            destroyed = true;
          }
        }
        if (destroyed) {
          this.triggerScreenShake(3, 0.1);
          this.destroyAsteroid(asteroid);
        }
      }
    }

    if (consumedProjectiles.size > 0) {
      this.projectiles = this.projectiles.filter((p) => !consumedProjectiles.has(p.id));
    }
  }

  private updateTurret(dtSec: number): void {
    if (!this.turret || !this.turret.alive) return;
    let nearest: RuntimePlayer | null = null;
    let nearestDistSq = Infinity;
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.ship.alive) continue;
      const dx = player.ship.x - this.turret.x;
      const dy = player.ship.y - this.turret.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > this.turret.detectionRadius * this.turret.detectionRadius) continue;
      if (distSq < nearestDistSq) {
        nearest = player;
        nearestDistSq = distSq;
      }
    }

    if (nearest) {
      const targetAngle = Math.atan2(nearest.ship.y - this.turret.y, nearest.ship.x - this.turret.x);
      const diff = normalizeAngle(targetAngle - this.turret.angle);
      this.turret.angle = normalizeAngle(this.turret.angle + diff * TURRET_ROTATION_SPEED * dtSec);
      this.turret.targetAngle = targetAngle;
      this.turret.isTracking = true;
      const alignedDiff = Math.abs(normalizeAngle(targetAngle - this.turret.angle));
      if (
        alignedDiff <= this.turret.fireAngleThreshold &&
        this.nowMs - this.turret.lastFireTimeMs >= this.turret.fireCooldownMs
      ) {
        this.turret.lastFireTimeMs = this.nowMs;
        this.turretBullets.push({
          id: this.nextEntityId("turret_bullet"),
          x: this.turret.x + Math.cos(this.turret.angle) * 40,
          y: this.turret.y + Math.sin(this.turret.angle) * 40,
          vx: Math.cos(this.turret.angle) * TURRET_BULLET_SPEED_PX_PER_SEC,
          vy: Math.sin(this.turret.angle) * TURRET_BULLET_SPEED_PX_PER_SEC,
          angle: this.turret.angle,
          spawnTime: this.nowMs,
          alive: true,
          exploded: false,
          explosionTime: 0,
          lifetimeMs: TURRET_BULLET_LIFETIME_MS,
          explosionRadius: TURRET_BULLET_EXPLOSION_RADIUS,
          hitsApplied: false,
        });
        this.hooks.onSound("fire", "turret");
      }
      return;
    }

    this.turret.isTracking = false;
    this.turret.angle = normalizeAngle(this.turret.angle + TURRET_IDLE_ROTATION_SPEED * dtSec);
  }

  private updateTurretBullets(dtSec: number): void {
    for (const bullet of this.turretBullets) {
      if (!bullet.alive) continue;

      if (!bullet.exploded) {
        bullet.x += bullet.vx * dtSec;
        bullet.y += bullet.vy * dtSec;
        if (this.nowMs - bullet.spawnTime > bullet.lifetimeMs) {
          bullet.exploded = true;
          bullet.explosionTime = this.nowMs;
          bullet.vx = 0;
          bullet.vy = 0;
        } else {
          for (const playerId of this.playerOrder) {
            const player = this.players.get(playerId);
            if (!player || !player.ship.alive) continue;
            const dx = player.ship.x - bullet.x;
            const dy = player.ship.y - bullet.y;
            if (dx * dx + dy * dy > TURRET_BULLET_IMPACT_RADIUS * TURRET_BULLET_IMPACT_RADIUS) {
              continue;
            }
            bullet.exploded = true;
            bullet.explosionTime = this.nowMs;
            bullet.vx = 0;
            bullet.vy = 0;
            this.triggerScreenShake(8, 0.2);
            break;
          }
        }
      }

      if (bullet.exploded && !bullet.hitsApplied) {
        bullet.hitsApplied = true;
        for (const playerId of this.playerOrder) {
          const player = this.players.get(playerId);
          if (!player || !player.ship.alive) continue;
          const dx = player.ship.x - bullet.x;
          const dy = player.ship.y - bullet.y;
          if (dx * dx + dy * dy > bullet.explosionRadius * bullet.explosionRadius) continue;
          const powerUp = this.playerPowerUps.get(playerId);
          if (powerUp?.type === "SHIELD") {
            powerUp.shieldHits += 1;
            this.triggerScreenShake(3, 0.1);
            if (powerUp.shieldHits >= POWERUP_SHIELD_HITS) {
              this.playerPowerUps.delete(playerId);
            }
            continue;
          }
          this.playerPowerUps.delete(playerId);
          this.onShipHit(undefined, player);
        }
      }

      if (
        bullet.exploded &&
        this.nowMs - bullet.explosionTime > TURRET_BULLET_EXPLOSION_DURATION_MS
      ) {
        bullet.alive = false;
      }
    }
  }

  private cleanupExpiredEntities(): void {
    this.asteroids = this.asteroids.filter((asteroid) => asteroid.alive);
    this.powerUps = this.powerUps.filter(
      (powerUp) => powerUp.alive && this.nowMs - powerUp.spawnTime <= POWERUP_DESPAWN_MS,
    );
    this.laserBeams = this.laserBeams.filter(
      (beam) => beam.alive && this.nowMs - beam.spawnTime <= beam.durationMs,
    );
    this.mines = this.mines.filter((mine) => {
      if (!mine.alive) return false;
      if (!mine.exploded) return true;
      return this.nowMs - mine.explosionTime <= MINE_POST_EXPIRY_MS;
    });
    this.homingMissiles = this.homingMissiles.filter(
      (missile) => missile.alive && this.nowMs - missile.spawnTime <= HOMING_MISSILE_LIFETIME_MS,
    );
    this.turretBullets = this.turretBullets.filter((bullet) => bullet.alive);
  }

  private updatePendingEliminationChecks(): void {
    if (this.pendingEliminationCheckAtMs === null) return;
    if (this.nowMs < this.pendingEliminationCheckAtMs) return;
    this.pendingEliminationCheckAtMs = null;
    if (this.phase === "PLAYING") {
      this.checkEliminationWin();
    }
  }

  private checkEliminationWin(): void {
    if (this.phase !== "PLAYING") return;
    const alive = this.playerOrder
      .map((playerId) => this.players.get(playerId))
      .filter((player): player is RuntimePlayer => Boolean(player))
      .filter((player) => player.state !== "SPECTATING");

    if (alive.length === 1) {
      this.endRound(alive[0].id);
      return;
    }
    if (alive.length === 0 && this.playerOrder.length > 0) {
      this.endRound(null);
    }
  }

  private endRound(winnerId: string | null): void {
    if (this.phase !== "PLAYING") return;

    const isTie = winnerId === null;
    let winnerName: string | undefined;
    if (!isTie && winnerId) {
      const winner = this.players.get(winnerId);
      if (winner) {
        winner.roundWins += 1;
        winnerName = winner.name;
      }
    }

    const roundWinsById: Record<string, number> = {};
    this.playerOrder.forEach((playerId) => {
      const player = this.players.get(playerId);
      if (!player) return;
      roundWinsById[playerId] = player.roundWins;
    });

    this.hooks.onRoundResult({
      roundNumber: this.currentRound,
      winnerId: winnerId ?? undefined,
      winnerName,
      isTie,
      roundWinsById,
    });

    if (!isTie && winnerId) {
      const winner = this.players.get(winnerId);
      if (winner && winner.roundWins >= this.settings.roundsToWin) {
        this.endGame(winner.id, winner.name);
        return;
      }
    }

    this.phase = "ROUND_END";
    this.roundEndMs = ROUND_RESULTS_DURATION_MS;
    this.hooks.onPhase("ROUND_END");
    this.syncRoomMeta();
    this.syncPlayers();
  }

  private endGame(winnerId: string, winnerName: string): void {
    this.phase = "GAME_END";
    this.winnerId = winnerId;
    this.winnerName = winnerName;
    const roundWinsById: Record<string, number> = {};
    this.playerOrder.forEach((playerId) => {
      const player = this.players.get(playerId);
      if (!player) return;
      roundWinsById[playerId] = player.roundWins;
    });
    this.hooks.onRoundResult({
      roundNumber: this.currentRound,
      winnerId,
      winnerName,
      isTie: false,
      roundWinsById,
    });
    this.hooks.onPhase("GAME_END", winnerId, winnerName);
    this.hooks.onSound("win", winnerId);
    this.syncRoomMeta();
    this.syncPlayers();
  }

  private findNearestEnemy(playerId: string): RuntimePlayer | null {
    const me = this.players.get(playerId);
    if (!me) return null;
    let best: RuntimePlayer | null = null;
    let bestDistSq = Infinity;
    for (const otherId of this.playerOrder) {
      if (otherId === playerId) continue;
      const other = this.players.get(otherId);
      if (!other || !other.ship.alive) continue;
      const dx = other.ship.x - me.ship.x;
      const dy = other.ship.y - me.ship.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = other;
      }
    }
    return best;
  }

  private getSpawnPoints(count: number): Array<{ x: number; y: number; angle: number }> {
    const padding = 100;
    const corners = [
      { x: padding, y: padding, angle: 0 },
      { x: ARENA_WIDTH - padding, y: padding, angle: Math.PI / 2 },
      { x: ARENA_WIDTH - padding, y: ARENA_HEIGHT - padding, angle: Math.PI },
      { x: padding, y: ARENA_HEIGHT - padding, angle: -Math.PI / 2 },
    ];
    if (count <= 2) return [corners[0], corners[2]];
    if (count === 3) return [corners[0], corners[1], corners[2]];
    return corners;
  }

  private spawnInitialAsteroids(): void {
    if (this.settings.asteroidDensity === "NONE") return;
    const { min, max } = this.getInitialAsteroidRange();
    const count = this.randomInt(min, max);

    const centerX = ARENA_WIDTH * 0.5;
    const centerY = ARENA_HEIGHT * 0.5;
    const spreadX = ARENA_WIDTH * 0.28;
    const spreadY = ARENA_HEIGHT * 0.28;
    const maxAttempts = 20;

    for (let i = 0; i < count; i++) {
      const tier = i === 0 ? "LARGE" : this.rollAsteroidTier();
      const size = this.randomAsteroidSize(tier);
      let x = centerX;
      let y = centerY;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidateX = centerX + (this.asteroidRng.next() * 2 - 1) * spreadX;
        const candidateY = centerY + (this.asteroidRng.next() * 2 - 1) * spreadY;
        if (this.isAsteroidSpawnClear(candidateX, candidateY, size)) {
          x = candidateX;
          y = candidateY;
          break;
        }
      }

      const angle = this.asteroidRng.next() * Math.PI * 2;
      const speed = this.randomRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
      const velocityScale = 0.75;
      this.asteroids.push({
        id: this.nextEntityId("ast"),
        x,
        y,
        vx: Math.cos(angle) * speed * velocityScale,
        vy: Math.sin(angle) * speed * velocityScale,
        angle: 0,
        angularVelocity: this.randomAsteroidAngularVelocity(),
        size,
        alive: true,
        vertices: this.generateAsteroidVertices(size),
      });
    }
  }

  private scheduleAsteroidSpawn(): void {
    if (this.settings.asteroidDensity !== "SPAWN") {
      this.nextAsteroidSpawnAtMs = null;
      return;
    }
    const round = Math.max(1, this.currentRound);
    const t = clamp((round - 1) / 4, 0, 1);
    const intervalScale = 3 + ((1 / 1.5) - 3) * t;
    const delay = this.asteroidRng.nextRange(
      ASTEROID_SPAWN_INTERVAL_MIN_MS,
      ASTEROID_SPAWN_INTERVAL_MAX_MS,
    );
    this.nextAsteroidSpawnAtMs = this.nowMs + delay * intervalScale;
  }

  private updateAsteroidSpawning(): void {
    if (this.settings.asteroidDensity !== "SPAWN") return;
    if (this.nextAsteroidSpawnAtMs === null) {
      this.scheduleAsteroidSpawn();
      return;
    }
    if (this.nowMs < this.nextAsteroidSpawnAtMs) return;

    const batch = this.randomInt(ASTEROID_SPAWN_BATCH_MIN, ASTEROID_SPAWN_BATCH_MAX);
    for (let i = 0; i < batch; i++) {
      this.spawnSingleAsteroidFromBorder();
    }
    this.scheduleAsteroidSpawn();
  }

  private spawnSingleAsteroidFromBorder(): void {
    const inset = ARENA_PADDING + 6;
    const side = Math.floor(this.asteroidRng.next() * 4);

    let x = inset;
    let y = inset;
    if (side === 0) {
      x = inset + this.asteroidRng.next() * (ARENA_WIDTH - inset * 2);
      y = inset;
    } else if (side === 1) {
      x = ARENA_WIDTH - inset;
      y = inset + this.asteroidRng.next() * (ARENA_HEIGHT - inset * 2);
    } else if (side === 2) {
      x = inset + this.asteroidRng.next() * (ARENA_WIDTH - inset * 2);
      y = ARENA_HEIGHT - inset;
    } else {
      x = inset;
      y = inset + this.asteroidRng.next() * (ARENA_HEIGHT - inset * 2);
    }

    const targetX = ARENA_WIDTH * (0.3 + this.asteroidRng.next() * 0.4);
    const targetY = ARENA_HEIGHT * (0.3 + this.asteroidRng.next() * 0.4);
    const baseAngle = Math.atan2(targetY - y, targetX - x);
    const finalAngle = baseAngle + (this.asteroidRng.next() - 0.5) * (Math.PI / 3);
    const speed = this.randomRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
    const tier = this.rollAsteroidTier();
    const size = this.randomAsteroidSize(tier);

    this.asteroids.push({
      id: this.nextEntityId("ast"),
      x,
      y,
      vx: Math.cos(finalAngle) * speed,
      vy: Math.sin(finalAngle) * speed,
      angle: 0,
      angularVelocity: this.randomAsteroidAngularVelocity(),
      size,
      alive: true,
      vertices: this.generateAsteroidVertices(size),
    });
  }

  private generateAsteroidVertices(size: number): { x: number; y: number }[] {
    const count =
      ASTEROID_VERTICES_MIN +
      Math.floor(this.asteroidRng.next() * (ASTEROID_VERTICES_MAX - ASTEROID_VERTICES_MIN + 1));
    const vertices: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const radius = size * (0.7 + this.asteroidRng.next() * 0.6);
      vertices.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    return vertices;
  }

  private destroyAsteroid(asteroid: RuntimeAsteroid): void {
    if (!asteroid.alive) return;
    asteroid.alive = false;
    this.triggerScreenShake(8, 0.2);

    if (asteroid.size >= ASTEROID_LARGE_MIN) {
      this.splitAsteroid(asteroid);
    }

    if (this.powerUpRng.next() <= ASTEROID_DROP_CHANCE) {
      const entries = Object.entries(POWERUP_SPAWN_WEIGHTS) as Array<[PowerUpType, number]>;
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      const r = this.powerUpRng.next() * total;
      let cumulative = 0;
      let type: PowerUpType = entries[0][0];
      for (const [entryType, weight] of entries) {
        cumulative += weight;
        if (r <= cumulative) {
          type = entryType;
          break;
        }
      }
      this.powerUps.push({
        id: this.nextEntityId("pow"),
        x: asteroid.x,
        y: asteroid.y,
        type,
        spawnTime: this.nowMs,
        remainingTimeFraction: 1,
        alive: true,
        magneticRadius: POWERUP_MAGNETIC_RADIUS,
        isMagneticActive: false,
        magneticSpeed: POWERUP_MAGNETIC_SPEED,
        targetPlayerId: null,
      });
    }
  }

  private splitAsteroid(asteroid: RuntimeAsteroid): void {
    const baseVx = asteroid.vx * 0.4;
    const baseVy = asteroid.vy * 0.4;
    for (let i = 0; i < ASTEROID_SPLIT_COUNT; i++) {
      const angle =
        (Math.PI * 2 * i) / ASTEROID_SPLIT_COUNT + (this.asteroidRng.next() - 0.5) * 0.6;
      const speed = this.randomRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
      const offset = 10 + this.asteroidRng.next() * 6;
      const size = this.randomAsteroidSize("SMALL");
      this.asteroids.push({
        id: this.nextEntityId("ast"),
        x: asteroid.x + Math.cos(angle) * offset,
        y: asteroid.y + Math.sin(angle) * offset,
        vx: baseVx + Math.cos(angle) * speed,
        vy: baseVy + Math.sin(angle) * speed,
        angle: 0,
        angularVelocity: this.randomAsteroidAngularVelocity(),
        size,
        alive: true,
        vertices: this.generateAsteroidVertices(size),
      });
    }
  }

  private isAsteroidSpawnClear(x: number, y: number, size: number): boolean {
    const minDistance = size * 1.8;
    for (const asteroid of this.asteroids) {
      if (!asteroid.alive) continue;
      const dx = asteroid.x - x;
      const dy = asteroid.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minDistance + asteroid.size) {
        return false;
      }
    }
    return true;
  }

  private rollAsteroidTier(): "LARGE" | "SMALL" {
    return this.asteroidRng.next() < 0.6 ? "LARGE" : "SMALL";
  }

  private randomAsteroidSize(tier: "LARGE" | "SMALL"): number {
    if (tier === "LARGE") {
      return this.randomRange(ASTEROID_LARGE_MIN, ASTEROID_LARGE_MAX);
    }
    return this.randomRange(ASTEROID_SMALL_MIN, ASTEROID_SMALL_MAX);
  }

  private randomAsteroidAngularVelocity(): number {
    return (this.asteroidRng.next() - 0.5) * 0.02;
  }

  private randomInt(min: number, max: number): number {
    return min + Math.floor(this.asteroidRng.next() * (max - min + 1));
  }

  private randomRange(min: number, max: number): number {
    return min + this.asteroidRng.next() * (max - min);
  }

  private buildSnapshot(): SnapshotPayload {
    const ships: ShipState[] = [];
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      ships.push({ ...player.ship });
    }

    const pilots = [...this.pilots.values()]
      .filter((pilot) => pilot.alive)
      .map((pilot) => ({
        id: pilot.id,
        playerId: pilot.playerId,
        x: pilot.x,
        y: pilot.y,
        vx: pilot.vx,
        vy: pilot.vy,
        angle: pilot.angle,
        spawnTime: pilot.spawnTime,
        survivalProgress: clamp((this.nowMs - pilot.spawnTime) / PILOT_SURVIVAL_MS, 0, 1),
        alive: true,
      }));

    const playerPowerUps: Record<string, PlayerPowerUp | null> = {};
    this.playerPowerUps.forEach((value, key) => {
      playerPowerUps[key] = value;
    });

    return {
      ships,
      pilots,
      projectiles: this.projectiles.map((proj) => ({
        id: proj.id,
        ownerId: proj.ownerId,
        x: proj.x,
        y: proj.y,
        vx: proj.vx,
        vy: proj.vy,
        spawnTime: proj.spawnTime,
      })),
      asteroids: this.asteroids
        .filter((asteroid) => asteroid.alive)
        .map((asteroid) => ({
          id: asteroid.id,
          x: asteroid.x,
          y: asteroid.y,
          vx: asteroid.vx,
          vy: asteroid.vy,
          angle: asteroid.angle,
          angularVelocity: asteroid.angularVelocity,
          size: asteroid.size,
          alive: asteroid.alive,
          vertices: asteroid.vertices,
        })),
      powerUps: this.powerUps
        .filter((powerUp) => powerUp.alive)
        .map((powerUp) => ({
          id: powerUp.id,
          x: powerUp.x,
          y: powerUp.y,
          type: powerUp.type,
          spawnTime: powerUp.spawnTime,
          remainingTimeFraction: clamp(
            (POWERUP_DESPAWN_MS - (this.nowMs - powerUp.spawnTime)) / POWERUP_DESPAWN_MS,
            0,
            1,
          ),
          alive: powerUp.alive,
          magneticRadius: powerUp.magneticRadius,
          isMagneticActive: powerUp.isMagneticActive,
        })),
      laserBeams: this.laserBeams.filter((beam) => beam.alive).map((beam) => ({
        id: beam.id,
        ownerId: beam.ownerId,
        x: beam.x,
        y: beam.y,
        angle: beam.angle,
        spawnTime: beam.spawnTime,
        alive: beam.alive,
      })),
      mines: this.mines.filter((mine) => mine.alive).map((mine) => ({
        id: mine.id,
        ownerId: mine.ownerId,
        x: mine.x,
        y: mine.y,
        spawnTime: mine.spawnTime,
        alive: mine.alive,
        exploded: mine.exploded,
        explosionTime: mine.explosionTime,
        arming: mine.arming,
        armingStartTime: mine.armingStartTime,
        triggeringPlayerId: mine.triggeringPlayerId,
      })),
      homingMissiles: this.homingMissiles
        .filter((missile) => missile.alive)
        .map((missile) => ({
          id: missile.id,
          ownerId: missile.ownerId,
          x: missile.x,
          y: missile.y,
          vx: missile.vx,
          vy: missile.vy,
          angle: missile.angle,
          spawnTime: missile.spawnTime,
          alive: missile.alive,
        })),
      turret: this.turret
        ? {
            id: this.turret.id,
            x: this.turret.x,
            y: this.turret.y,
            angle: this.turret.angle,
            alive: this.turret.alive,
            detectionRadius: this.turret.detectionRadius,
            orbitRadius: this.turret.orbitRadius,
            isTracking: this.turret.isTracking,
            targetAngle: this.turret.targetAngle,
          }
        : undefined,
      turretBullets: this.turretBullets
        .filter((bullet) => bullet.alive)
        .map((bullet) => ({
          id: bullet.id,
          x: bullet.x,
          y: bullet.y,
          vx: bullet.vx,
          vy: bullet.vy,
          angle: bullet.angle,
          spawnTime: bullet.spawnTime,
          alive: bullet.alive,
          exploded: bullet.exploded,
          explosionTime: bullet.explosionTime,
        })),
      playerPowerUps,
      rotationDirection: this.rotationDirection,
      screenShakeIntensity: this.screenShakeIntensity,
      screenShakeDuration: this.screenShakeDuration,
      hostTick: this.hostTick,
      tickDurationMs: this.tickDurationMs,
    };
  }

  private buildPlayerPayload(): PlayerListPayload {
    const meta: PlayerListMeta[] = this.playerOrder
      .map((playerId) => this.players.get(playerId))
      .filter((player): player is RuntimePlayer => Boolean(player))
      .map((player) => ({
        id: player.id,
        customName: player.name,
        profileName: player.name,
        botType: player.botType ?? undefined,
        colorIndex: player.colorIndex,
        keySlot: player.keySlot,
        kills: player.kills,
        roundWins: player.roundWins,
        playerState: player.state,
        isBot: player.isBot,
      }));

    this.revision += 1;
    return {
      order: [...this.playerOrder],
      meta,
      hostId: this.leaderPlayerId,
      revision: this.revision,
    };
  }

  private syncPlayers(): void {
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  private syncRoomMeta(): void {
    this.hooks.onRoomMeta({
      roomCode: this.roomCode,
      leaderPlayerId: this.leaderPlayerId,
      phase: this.phase,
      mode: this.mode,
      baseMode: this.baseMode,
      settings: { ...this.settings },
    });
  }

  private removePlayerById(playerId: string): void {
    this.players.delete(playerId);
    this.playerOrder = this.playerOrder.filter((id) => id !== playerId);
    this.pilots.delete(playerId);
    this.playerPowerUps.delete(playerId);
    this.projectiles = this.projectiles.filter((proj) => proj.ownerId !== playerId);

    if (this.leaderPlayerId === playerId) {
      this.reassignLeader();
    }

    if (this.playerOrder.length < 2 && this.phase === "PLAYING") {
      this.phase = "LOBBY";
      this.hooks.onPhase("LOBBY");
      this.syncRoomMeta();
    }
    if (this.playerOrder.length < 2 && this.phase === "COUNTDOWN") {
      this.phase = "LOBBY";
      this.countdownMs = 0;
      this.hooks.onPhase("LOBBY");
      this.syncRoomMeta();
    }

    this.syncPlayers();
  }

  private reassignLeader(): void {
    this.leaderPlayerId = null;
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || player.isBot) continue;
      this.leaderPlayerId = playerId;
      break;
    }
    this.syncRoomMeta();
  }

  private ensureLeader(sessionId: string): boolean {
    const player = this.getHuman(sessionId);
    if (!player) return false;
    if (this.leaderPlayerId !== player.id) {
      this.hooks.onError(sessionId, "LEADER_ONLY", "Only room leader can do this");
      return false;
    }
    return true;
  }

  private getHuman(sessionId: string): RuntimePlayer | null {
    const playerId = this.humanBySession.get(sessionId);
    if (!playerId) return null;
    return this.players.get(playerId) ?? null;
  }

  private sanitizeName(raw?: string): string | null {
    if (!raw) return null;
    const out = raw.trim().slice(0, 20);
    return out.length > 0 ? out : null;
  }

  private resetScoreAndState(): void {
    this.clearRoundEntities();
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      player.kills = 0;
      player.roundWins = 0;
      player.state = "ACTIVE";
      player.input = {
        buttonA: false,
        buttonB: false,
        timestamp: this.nowMs,
        clientTimeMs: this.nowMs,
      };
      player.dashQueued = false;
      player.dashTimerSec = 0;
      player.recoilTimerSec = 0;
      player.angularVelocity = 0;
      player.botThinkAtMs = 0;
      player.botLastDecisionMs = 0;
      player.botCachedAction = {
        buttonA: false,
        buttonB: false,
        dash: false,
      };
      player.ship = {
        ...player.ship,
        x: ARENA_WIDTH * 0.5,
        y: ARENA_HEIGHT * 0.5,
        vx: 0,
        vy: 0,
        alive: false,
        ammo: MAX_AMMO,
        maxAmmo: MAX_AMMO,
        lastShotTime: this.nowMs - FIRE_COOLDOWN_MS - 1,
        reloadStartTime: this.nowMs,
        isReloading: false,
      };
    }
    this.syncPlayers();
  }

  private createPlayer(
    id: string,
    sessionId: string | null,
    name: string,
    isBot: boolean,
    botType: "ai" | "local" | null,
    colorIndex: number,
  ): RuntimePlayer {
    return {
      id,
      sessionId,
      name,
      isBot,
      botType,
      colorIndex,
      kills: 0,
      roundWins: 0,
      state: "ACTIVE",
      input: {
        buttonA: false,
        buttonB: false,
        timestamp: 0,
        clientTimeMs: 0,
      },
      dashQueued: false,
      botThinkAtMs: 0,
      botLastDecisionMs: 0,
      botCachedAction: {
        buttonA: false,
        buttonB: false,
        dash: false,
      },
      dashTimerSec: 0,
      recoilTimerSec: 0,
      angularVelocity: 0,
      ship: {
        id: "ship_" + id,
        playerId: id,
        x: ARENA_WIDTH * 0.5,
        y: ARENA_HEIGHT * 0.5,
        angle: 0,
        vx: 0,
        vy: 0,
        alive: false,
        invulnerableUntil: 0,
        ammo: MAX_AMMO,
        maxAmmo: MAX_AMMO,
        lastShotTime: 0,
        reloadStartTime: 0,
        isReloading: false,
      },
    };
  }
}

export type {
  AdvancedSettings,
  AdvancedSettingsSync,
  PlayerListPayload,
  RoomMetaPayload,
  RoundResultPayload,
  SnapshotPayload,
};
