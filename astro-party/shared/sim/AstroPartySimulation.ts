import type {
  GamePhase,
  GameMode,
  BaseGameMode,
  PowerUpType,
  PlayerState,
  AdvancedSettings,
  AdvancedSettingsSync,
  PlayerInput,
  PlayerPowerUp,
  RuntimePlayer,
  RuntimePilot,
  RuntimeProjectile,
  RuntimeAsteroid,
  RuntimePowerUp,
  RuntimeLaserBeam,
  RuntimeMine,
  RuntimeHomingMissile,
  RuntimeTurret,
  RuntimeTurretBullet,
  Hooks,
  SnapshotPayload,
  PlayerListPayload,
  PlayerListMeta,
  RoundResultPayload,
  ShipState,
  ActiveConfig,
  SimState,
} from "./types.js";
import { SeededRNG } from "./SeededRNG.js";
import { clamp, getModeBaseConfig, resolveConfigValue } from "./utils.js";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_COLORS,
  DEFAULT_ADVANCED_SETTINGS,
  COUNTDOWN_SECONDS,
  ROUND_RESULTS_DURATION_MS,
  FIRE_COOLDOWN_MS,
  MAX_AMMO,
  PILOT_SURVIVAL_MS,
  POWERUP_DESPAWN_MS,
  HOMING_MISSILE_LIFETIME_MS,
  SHIP_RESTITUTION_BY_PRESET,
  SHIP_FRICTION_AIR_BY_PRESET,
} from "./constants.js";

// System imports
import { updateBots } from "./AISystem.js";
import { updateShips } from "./ShipSystem.js";
import {
  resolveShipTurretCollisions,
  resolveShipAsteroidCollisions,
  resolvePilotAsteroidCollisions,
  resolveAsteroidAsteroidCollisions,
  processProjectileCollisions,
  processShipPilotCollisions,
  updateProjectiles,
} from "./CollisionSystem.js";
import { updateAsteroidSpawning, updateAsteroids, destroyAsteroid as asteroidDestroyAsteroid } from "./AsteroidSystem.js";
import { updatePowerUps, processPowerUpPickups, grantPowerUp as powerUpGrantPowerUp, spawnRandomPowerUp } from "./PowerUpSystem.js";
import {
  updateLaserBeams,
  checkMineCollisions,
  explodeMine as weaponExplodeMine,
  updateHomingMissiles,
  checkHomingMissileCollisions,
  updateJoustCollisions,
  updateTurret,
  updateTurretBullets,
} from "./WeaponSystem.js";
import {
  updatePilots,
  onShipHit as flowOnShipHit,
  killPilot as flowKillPilot,
  respawnFromPilot as flowRespawnFromPilot,
  updatePendingEliminationChecks,
  checkEliminationWin,
  beginPlaying,
  clearRoundEntities,
  syncRoomMeta,
  cleanupExpiredEntities,
} from "./GameFlowSystem.js";

export class AstroPartySimulation implements SimState {
  // ---- Entity collections ----
  players = new Map<string, RuntimePlayer>();
  playerOrder: string[] = [];
  humanBySession = new Map<string, string>();
  pilots = new Map<string, RuntimePilot>();
  projectiles: RuntimeProjectile[] = [];
  asteroids: RuntimeAsteroid[] = [];
  powerUps: RuntimePowerUp[] = [];
  laserBeams: RuntimeLaserBeam[] = [];
  mines: RuntimeMine[] = [];
  homingMissiles: RuntimeHomingMissile[] = [];
  turret: RuntimeTurret | null = null;
  turretBullets: RuntimeTurretBullet[] = [];
  playerPowerUps = new Map<string, PlayerPowerUp | null>();

  // ---- Game state ----
  phase: GamePhase = "LOBBY";
  hostTick = 0;
  nowMs = 0;
  settings: AdvancedSettings = { ...DEFAULT_ADVANCED_SETTINGS };
  baseMode: BaseGameMode = "STANDARD";
  mode: GameMode = "STANDARD";
  rotationDirection = 1;
  devModeEnabled = false;
  currentRound = 1;
  screenShakeIntensity = 0;
  screenShakeDuration = 0;
  pendingEliminationCheckAtMs: number | null = null;
  nextAsteroidSpawnAtMs: number | null = null;
  leaderPlayerId: string | null = null;
  roundEndMs = 0;

  // ---- Counters ----
  private revision = 0;
  private playerCounter = 0;
  private botCounter = 0;
  private countdownMs = 0;
  private countdownValue = COUNTDOWN_SECONDS;
  private winnerId: string | null = null;
  private winnerName: string | null = null;

  // ---- RNG ----
  private baseSeed = 0;
  asteroidRng = new SeededRNG(1);
  powerUpRng = new SeededRNG(2);
  aiRng = new SeededRNG(3);
  idRng = new SeededRNG(4);

  constructor(
    public readonly roomCode: string,
    private maxPlayers: number,
    public readonly tickDurationMs: number,
    public readonly hooks: Hooks,
  ) {
    this.reseed(Math.floor(Date.now()) >>> 0);
  }

  // ============= PUBLIC API (called by Room) =============

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
    syncRoomMeta(this);
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
    this.setFireButtonState(player, Boolean(payload.buttonB));
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
    syncRoomMeta(this);
    this.syncPlayers();
  }

  restartToLobby(sessionId: string): void {
    if (!this.ensureLeader(sessionId)) return;
    this.phase = "LOBBY";
    this.countdownMs = 0;
    this.countdownValue = COUNTDOWN_SECONDS;
    this.roundEndMs = 0;
    this.currentRound = 1;
    clearRoundEntities(this);
    this.devModeEnabled = false;
    this.resetScoreAndState();
    this.hooks.onPhase("LOBBY");
    syncRoomMeta(this);
    this.syncPlayers();
  }

  setMode(sessionId: string, mode: GameMode): void {
    if (!this.ensureLeader(sessionId)) return;
    if (mode === "CUSTOM") return;
    this.mode = mode;
    this.baseMode = mode as BaseGameMode;
    this.settings = {
      ...DEFAULT_ADVANCED_SETTINGS,
      roundsToWin: this.settings.roundsToWin,
      ...(mode === "SANE"
        ? {
            asteroidDensity: "MANY" as const,
            startPowerups: true,
            rotationPreset: "SANE" as const,
            rotationBoostPreset: "SANE" as const,
            recoilPreset: "SANE" as const,
            shipRestitutionPreset: "SANE" as const,
            shipFrictionAirPreset: "SANE" as const,
            wallRestitutionPreset: "SANE" as const,
            wallFrictionPreset: "SANE" as const,
            shipFrictionPreset: "SANE" as const,
            angularDampingPreset: "SANE" as const,
          }
        : mode === "CHAOTIC"
          ? {
              asteroidDensity: "SPAWN" as const,
              startPowerups: true,
              rotationPreset: "CHAOTIC" as const,
              rotationBoostPreset: "CHAOTIC" as const,
              recoilPreset: "CHAOTIC" as const,
              shipRestitutionPreset: "CHAOTIC" as const,
              shipFrictionAirPreset: "CHAOTIC" as const,
              wallRestitutionPreset: "CHAOTIC" as const,
              wallFrictionPreset: "CHAOTIC" as const,
              shipFrictionPreset: "CHAOTIC" as const,
              angularDampingPreset: "CHAOTIC" as const,
            }
          : {}),
    };
    syncRoomMeta(this);
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  setAdvancedSettings(sessionId: string, payload: AdvancedSettingsSync): void {
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
      rotationPreset: sanitizeMode(payload.settings.rotationPreset, DEFAULT_ADVANCED_SETTINGS.rotationPreset),
      rotationBoostPreset: sanitizeMode(payload.settings.rotationBoostPreset, DEFAULT_ADVANCED_SETTINGS.rotationBoostPreset),
      recoilPreset: sanitizeMode(payload.settings.recoilPreset, DEFAULT_ADVANCED_SETTINGS.recoilPreset),
      shipRestitutionPreset: sanitizeMode(payload.settings.shipRestitutionPreset, DEFAULT_ADVANCED_SETTINGS.shipRestitutionPreset),
      shipFrictionAirPreset: sanitizeMode(payload.settings.shipFrictionAirPreset, DEFAULT_ADVANCED_SETTINGS.shipFrictionAirPreset),
      wallRestitutionPreset: sanitizeMode(payload.settings.wallRestitutionPreset, DEFAULT_ADVANCED_SETTINGS.wallRestitutionPreset),
      wallFrictionPreset: sanitizeMode(payload.settings.wallFrictionPreset, DEFAULT_ADVANCED_SETTINGS.wallFrictionPreset),
      shipFrictionPreset: sanitizeMode(payload.settings.shipFrictionPreset, DEFAULT_ADVANCED_SETTINGS.shipFrictionPreset),
      angularDampingPreset: sanitizeMode(payload.settings.angularDampingPreset, DEFAULT_ADVANCED_SETTINGS.angularDampingPreset),
    };
    syncRoomMeta(this);
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

  devGrantPowerUp(sessionId: string, type: PowerUpType | "SPAWN_RANDOM"): void {
    const player = this.getHuman(sessionId);
    if (!player) return;
    if (!this.devModeEnabled) {
      this.hooks.onError(sessionId, "DEV_MODE_REQUIRED", "Enable dev mode first");
      return;
    }

    if (type === "SPAWN_RANDOM") {
      spawnRandomPowerUp(this);
      return;
    }

    if (!player.ship.alive) {
      this.hooks.onError(sessionId, "INVALID_STATE", "You need an active ship");
      return;
    }

    if (type !== "REVERSE" && this.playerPowerUps.get(player.id)) {
      this.hooks.onError(sessionId, "POWERUP_OCCUPIED", "Ship already has a power-up");
      return;
    }

    this.grantPowerUp(player.id, type);
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
    this.removePlayerById(targetId);
  }

  // ============= TICK =============

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
        this.reseed((Date.now() >>> 0) ^ this.currentRound);
        beginPlaying(this);
      }
    }

    if (this.phase === "ROUND_END") {
      this.roundEndMs = Math.max(0, this.roundEndMs - deltaMs);
      if (this.roundEndMs <= 0) {
        this.currentRound += 1;
        clearRoundEntities(this);
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
        syncRoomMeta(this);
        this.syncPlayers();
      }
    }

    if (this.phase !== "PLAYING") {
      this.hooks.onSnapshot(this.buildSnapshot());
      return;
    }

    const dtSec = deltaMs / 1000;

    updateBots(this);
    updateShips(this, dtSec);
    resolveShipTurretCollisions(
      this,
      SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset] ?? 0,
    );
    updatePilots(this, dtSec);
    updateProjectiles(this, dtSec);
    updateAsteroidSpawning(this);
    updateAsteroids(this, dtSec);
    resolveAsteroidAsteroidCollisions(this);
    resolveShipAsteroidCollisions(
      this,
      SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset] ?? 0,
    );
    resolvePilotAsteroidCollisions(this);
    updatePowerUps(this, dtSec);
    processProjectileCollisions(this);
    updateLaserBeams(this);
    checkMineCollisions(this);
    updateHomingMissiles(this, dtSec);
    checkHomingMissileCollisions(this);
    updateJoustCollisions(this);
    updateTurret(this, dtSec);
    updateTurretBullets(this, dtSec);
    processShipPilotCollisions(this);
    processPowerUpPickups(this);
    cleanupExpiredEntities(this);
    updatePendingEliminationChecks(this);
    if (this.pendingEliminationCheckAtMs === null) {
      checkEliminationWin(this);
    }

    this.hooks.onSnapshot(this.buildSnapshot());
  }

  // ============= GETTERS =============

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

  // ============= SimState interface methods =============

  nextEntityId(prefix: string): string {
    return prefix + "_" + this.idRng.nextUint32().toString(16);
  }

  getActiveConfig(): ActiveConfig {
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
    cfg.ROTATION_THRUST_BONUS = resolveConfigValue(this.settings.rotationBoostPreset, 0, 0.00004, 0.00008);
    cfg.RECOIL_FORCE = resolveConfigValue(this.settings.recoilPreset, 0, 0.00015, 0.0003);
    cfg.SHIP_RESTITUTION = SHIP_RESTITUTION_BY_PRESET[this.settings.shipRestitutionPreset];
    cfg.SHIP_FRICTION_AIR = SHIP_FRICTION_AIR_BY_PRESET[this.settings.shipFrictionAirPreset];

    return cfg;
  }

  triggerScreenShake(intensity: number, duration: number): void {
    this.screenShakeIntensity = Math.max(this.screenShakeIntensity, intensity);
    this.screenShakeDuration = Math.max(this.screenShakeDuration, duration);
    this.hooks.onScreenShake(intensity, duration);
  }

  syncPlayers(): void {
    this.hooks.onPlayers(this.buildPlayerPayload());
  }

  grantPowerUp(playerId: string, type: PowerUpType): void {
    powerUpGrantPowerUp(this, playerId, type);
  }

  setFireButtonState(player: RuntimePlayer, pressed: boolean): void {
    if (pressed && !player.fireButtonHeld) {
      player.fireRequested = true;
      player.firePressStartMs = this.nowMs;
    } else if (!pressed && player.fireButtonHeld) {
      player.fireRequested = false;
      player.firePressStartMs = 0;
    }
    player.fireButtonHeld = pressed;
    player.input.buttonB = pressed;
  }

  onShipHit(owner: RuntimePlayer | undefined, target: RuntimePlayer): void {
    flowOnShipHit(this, owner, target);
  }

  killPilot(pilotPlayerId: string, killerId: string): void {
    flowKillPilot(this, pilotPlayerId, killerId);
  }

  respawnFromPilot(playerId: string, pilot: RuntimePilot): void {
    flowRespawnFromPilot(this, playerId, pilot);
  }

  destroyAsteroid(asteroid: RuntimeAsteroid): void {
    asteroidDestroyAsteroid(this, asteroid);
  }

  explodeMine(mine: RuntimeMine): void {
    weaponExplodeMine(this, mine);
  }

  // ============= PRIVATE HELPERS =============

  private reseed(seed: number): void {
    const normalized = (seed >>> 0) || 0x9e3779b9;
    this.baseSeed = normalized;
    this.asteroidRng = new SeededRNG(normalized ^ 0xa341316c);
    this.powerUpRng = new SeededRNG(normalized ^ 0xc8013ea4);
    this.aiRng = new SeededRNG(normalized ^ 0xad90777d);
    this.idRng = new SeededRNG(normalized ^ 0x7e95761e);
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
      syncRoomMeta(this);
    }
    if (this.playerOrder.length < 2 && this.phase === "COUNTDOWN") {
      this.phase = "LOBBY";
      this.countdownMs = 0;
      this.hooks.onPhase("LOBBY");
      syncRoomMeta(this);
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
    syncRoomMeta(this);
  }

  private resetScoreAndState(): void {
    clearRoundEntities(this);
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
      player.fireButtonHeld = false;
      player.fireRequested = false;
      player.firePressStartMs = 0;
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
      fireButtonHeld: false,
      fireRequested: false,
      firePressStartMs: 0,
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
}

export type {
  AdvancedSettings,
  AdvancedSettingsSync,
  PlayerListPayload,
  RoomMetaPayload,
  RoundResultPayload,
  SnapshotPayload,
} from "./types.js";
