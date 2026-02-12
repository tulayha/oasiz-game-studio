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
  pilots: never[];
  projectiles: ProjectileState[];
  asteroids: never[];
  powerUps: never[];
  laserBeams: never[];
  mines: never[];
  homingMissiles: never[];
  turret?: undefined;
  turretBullets: never[];
  playerPowerUps: Record<string, null>;
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
  ship: ShipState;
  respawnAtMs: number;
}

interface RuntimeProjectile extends ProjectileState {
  lifetimeMs: number;
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
const PROJECTILE_SPEED = 780;
const PROJECTILE_LIFETIME_MS = 2500;
const ROTATION_SPEED = 4.5;
const SHIP_ACCEL = 220;
const SHIP_DAMPING = 0.993;
const SHIP_RADIUS = 18;
const DASH_BOOST = 460;
const RECOIL = 70;
const RELOAD_MS = 1200;
const MAX_AMMO = 3;
const COUNTDOWN_SECONDS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angle: number): number {
  let out = angle;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

export class AstroPartySimulation {
  private players = new Map<string, RuntimePlayer>();
  private playerOrder: string[] = [];
  private humanBySession = new Map<string, string>();
  private projectiles: RuntimeProjectile[] = [];
  private phase: GamePhase = "LOBBY";
  private hostTick = 0;
  private nowMs = 0;
  private countdownMs = 0;
  private countdownValue = COUNTDOWN_SECONDS;
  private leaderPlayerId: string | null = null;
  private mode: GameMode = "STANDARD";
  private baseMode: BaseGameMode = "STANDARD";
  private settings: AdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };
  private revision = 0;
  private playerCounter = 0;
  private botCounter = 0;
  private projectileCounter = 0;
  private winnerId: string | null = null;
  private winnerName: string | null = null;

  constructor(
    private roomCode: string,
    private maxPlayers: number,
    private tickDurationMs: number,
    private hooks: Hooks,
  ) {}

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

    if (this.phase === "PLAYING") {
      player.state = "SPECTATING";
      player.ship.alive = false;
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
    this.phase = "COUNTDOWN";
    this.countdownMs = COUNTDOWN_SECONDS * 1000;
    this.countdownValue = COUNTDOWN_SECONDS;
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
    this.projectiles = [];
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
    this.settings = { ...DEFAULT_ADVANCED_SETTINGS };
    this.syncRoomMeta();
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  setAdvancedSettings(
    sessionId: string,
    payload: AdvancedSettingsSync,
  ): void {
    if (!this.ensureLeader(sessionId)) return;
    this.mode = payload.mode;
    this.baseMode = payload.baseMode;
    this.settings = { ...DEFAULT_ADVANCED_SETTINGS, ...payload.settings };
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

    if (this.phase !== "PLAYING") {
      this.hooks.onSnapshot(this.buildSnapshot());
      return;
    }

    this.updateBots();
    this.updateShips(deltaMs / 1000);
    this.updateProjectiles(deltaMs / 1000);
    this.processCollisions();
    this.handleRespawns();

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

  private beginPlaying(): void {
    this.phase = "PLAYING";
    this.projectiles = [];
    this.spawnAllShips();
    this.hooks.onPhase("PLAYING");
    this.syncRoomMeta();
    this.syncPlayers();
  }

  private spawnAllShips(): void {
    const points = this.getSpawnPoints(this.playerOrder.length);
    this.playerOrder.forEach((playerId, index) => {
      const player = this.players.get(playerId);
      if (!player) return;
      const spawn = points[index] ?? points[0];
      player.state = "ACTIVE";
      player.respawnAtMs = 0;
      player.ship = {
        ...player.ship,
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
        vx: 0,
        vy: 0,
        alive: true,
        invulnerableUntil: this.nowMs + 1500,
        ammo: MAX_AMMO,
        maxAmmo: MAX_AMMO,
        lastShotTime: this.nowMs - FIRE_COOLDOWN_MS - 1,
        reloadStartTime: this.nowMs,
        isReloading: false,
      };
    });
  }

  private updateBots(): void {
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player || !player.isBot || player.botType !== "ai") continue;
      if (!player.ship.alive) continue;
      if (this.nowMs < player.botThinkAtMs) continue;
      player.botThinkAtMs = this.nowMs + 150;

      const target = this.findNearestEnemy(playerId);
      if (!target) {
        player.input.buttonA = Math.random() > 0.5;
        player.input.buttonB = Math.random() > 0.7;
        continue;
      }

      const dx = target.ship.x - player.ship.x;
      const dy = target.ship.y - player.ship.y;
      const desired = Math.atan2(dy, dx);
      const diff = normalizeAngle(desired - player.ship.angle);
      player.input.buttonA = Math.abs(diff) > 0.18;
      player.input.buttonB = Math.abs(diff) < 0.65;
      if (Math.abs(diff) < 0.3 && Math.random() > 0.94) {
        player.dashQueued = true;
      }
    }
  }

  private updateShips(dtSec: number): void {
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      const ship = player.ship;
      if (!ship.alive) continue;

      if (player.input.buttonA) {
        ship.angle += ROTATION_SPEED * dtSec;
      }

      if (player.dashQueued) {
        player.dashQueued = false;
        ship.vx += Math.cos(ship.angle) * DASH_BOOST;
        ship.vy += Math.sin(ship.angle) * DASH_BOOST;
        this.hooks.onSound("dash", player.id);
        this.hooks.onDashParticles({
          playerId: player.id,
          x: ship.x,
          y: ship.y,
          angle: ship.angle,
          color: PLAYER_COLORS[player.colorIndex].primary,
        });
      }

      if (player.input.buttonB) {
        ship.vx += Math.cos(ship.angle) * SHIP_ACCEL * dtSec;
        ship.vy += Math.sin(ship.angle) * SHIP_ACCEL * dtSec;
        this.tryFire(player);
      }

      this.updateReload(ship);

      ship.vx *= SHIP_DAMPING;
      ship.vy *= SHIP_DAMPING;
      ship.x += ship.vx * dtSec;
      ship.y += ship.vy * dtSec;

      if (ship.x < ARENA_PADDING) {
        ship.x = ARENA_PADDING;
        ship.vx = Math.abs(ship.vx) * 0.6;
      }
      if (ship.x > ARENA_WIDTH - ARENA_PADDING) {
        ship.x = ARENA_WIDTH - ARENA_PADDING;
        ship.vx = -Math.abs(ship.vx) * 0.6;
      }
      if (ship.y < ARENA_PADDING) {
        ship.y = ARENA_PADDING;
        ship.vy = Math.abs(ship.vy) * 0.6;
      }
      if (ship.y > ARENA_HEIGHT - ARENA_PADDING) {
        ship.y = ARENA_HEIGHT - ARENA_PADDING;
        ship.vy = -Math.abs(ship.vy) * 0.6;
      }
    }
  }

  private tryFire(player: RuntimePlayer): void {
    const ship = player.ship;
    if (this.nowMs - ship.lastShotTime < FIRE_COOLDOWN_MS) return;
    if (ship.ammo <= 0) return;

    ship.lastShotTime = this.nowMs;
    ship.ammo -= 1;
    ship.vx -= Math.cos(ship.angle) * RECOIL;
    ship.vy -= Math.sin(ship.angle) * RECOIL;
    if (!ship.isReloading) {
      ship.reloadStartTime = this.nowMs;
      ship.isReloading = true;
    }

    const id = "proj_" + (++this.projectileCounter).toString();
    const spawnX = ship.x + Math.cos(ship.angle) * 18;
    const spawnY = ship.y + Math.sin(ship.angle) * 18;
    this.projectiles.push({
      id,
      ownerId: player.id,
      x: spawnX,
      y: spawnY,
      vx: Math.cos(ship.angle) * PROJECTILE_SPEED,
      vy: Math.sin(ship.angle) * PROJECTILE_SPEED,
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
      if (proj.x < -50 || proj.x > ARENA_WIDTH + 50) return false;
      if (proj.y < -50 || proj.y > ARENA_HEIGHT + 50) return false;
      return true;
    });
  }

  private processCollisions(): void {
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
        if (dx * dx + dy * dy > SHIP_RADIUS * SHIP_RADIUS) continue;
        consumed.add(proj.id);
        this.onShipHit(owner, target);
        break;
      }
    }
    if (consumed.size > 0) {
      this.projectiles = this.projectiles.filter((p) => !consumed.has(p.id));
    }
  }

  private onShipHit(owner: RuntimePlayer | undefined, target: RuntimePlayer): void {
    target.ship.alive = false;
    target.state = "EJECTED";
    target.respawnAtMs = this.nowMs + 1200;

    if (owner) {
      owner.kills += 1;
      owner.roundWins += 1;
    }
    this.hooks.onSound("explosion", target.id);
    this.hooks.onScreenShake(12, 0.25);
    this.syncPlayers();

    if (owner && owner.roundWins >= this.settings.roundsToWin) {
      this.endGame(owner.id, owner.name);
    }
  }

  private handleRespawns(): void {
    if (this.phase !== "PLAYING") return;
    const points = this.getSpawnPoints(this.playerOrder.length);
    this.playerOrder.forEach((playerId, index) => {
      const player = this.players.get(playerId);
      if (!player || player.ship.alive) return;
      if (player.respawnAtMs <= 0 || this.nowMs < player.respawnAtMs) return;
      const spawn = points[index] ?? points[0];
      player.ship.x = spawn.x;
      player.ship.y = spawn.y;
      player.ship.vx = 0;
      player.ship.vy = 0;
      player.ship.angle = spawn.angle;
      player.ship.alive = true;
      player.ship.invulnerableUntil = this.nowMs + 1000;
      player.ship.ammo = MAX_AMMO;
      player.ship.isReloading = false;
      player.state = "ACTIVE";
      player.respawnAtMs = 0;
      this.hooks.onSound("respawn", player.id);
    });
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
      roundNumber: 1,
      winnerId,
      winnerName,
      isTie: false,
      roundWinsById,
    });
    this.hooks.onPhase("GAME_END", winnerId, winnerName);
    this.hooks.onSound("win", winnerId);
    this.syncRoomMeta();
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
    const padding = 130;
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

  private buildSnapshot(): SnapshotPayload {
    const ships: ShipState[] = [];
    for (const playerId of this.playerOrder) {
      const player = this.players.get(playerId);
      if (!player) continue;
      ships.push({ ...player.ship });
    }

    return {
      ships,
      pilots: [],
      projectiles: this.projectiles.map((proj) => ({
        id: proj.id,
        ownerId: proj.ownerId,
        x: proj.x,
        y: proj.y,
        vx: proj.vx,
        vy: proj.vy,
        spawnTime: proj.spawnTime,
      })),
      asteroids: [],
      powerUps: [],
      laserBeams: [],
      mines: [],
      homingMissiles: [],
      turret: undefined,
      turretBullets: [],
      playerPowerUps: {},
      rotationDirection: 1,
      screenShakeIntensity: 0,
      screenShakeDuration: 0,
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
    this.projectiles = this.projectiles.filter((proj) => proj.ownerId !== playerId);

    if (this.leaderPlayerId === playerId) {
      this.reassignLeader();
    }

    if (this.playerOrder.length < 2 && this.phase === "PLAYING") {
      this.phase = "LOBBY";
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
    this.projectiles = [];
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
      player.ship = {
        ...player.ship,
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
    const color = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
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
      respawnAtMs: 0,
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
