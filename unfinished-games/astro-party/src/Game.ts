import { Physics } from "./systems/Physics";
import { Renderer } from "./systems/Renderer";
import { InputManager } from "./systems/Input";
import { MultiInputManager } from "./systems/MultiInputManager";
import { setupCollisions } from "./systems/Collision";
import { NetworkManager } from "./network/NetworkManager";
import { Ship } from "./entities/Ship";
import { Pilot } from "./entities/Pilot";
import { Projectile } from "./entities/Projectile";
import { AudioManager } from "./AudioManager";
import { PlayerManager } from "./managers/PlayerManager";
import { GameFlowManager } from "./managers/GameFlowManager";
import { BotManager } from "./managers/BotManager";
import {
  GamePhase,
  GameStateSync,
  PlayerInput,
  PlayerData,
  ShipState,
  PilotState,
  ProjectileState,
  GAME_CONFIG,
} from "./types";

export class Game {
  private physics: Physics;
  private renderer: Renderer;
  private input: InputManager;
  private network: NetworkManager;
  private multiInput: MultiInputManager | null = null;

  // Managers
  private playerMgr: PlayerManager;
  private flowMgr: GameFlowManager;
  private botMgr: BotManager;

  // Entity state (shared with managers via reference)
  private ships: Map<string, Ship> = new Map();
  private pilots: Map<string, Pilot> = new Map();
  private projectiles: Projectile[] = [];

  // Input state
  private pendingInputs: Map<string, PlayerInput> = new Map();
  private pendingDashes: Set<string> = new Set();

  // Network state caches (for client rendering)
  private networkShips: ShipState[] = [];
  private networkPilots: PilotState[] = [];
  private networkProjectiles: ProjectileState[] = [];

  // Timing
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastTime: number = 0;
  private latencyMs: number = 0;

  static SHOW_PING = true;

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new Physics();
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.network = new NetworkManager();
    this.multiInput = new MultiInputManager();

    // Create managers
    this.playerMgr = new PlayerManager(this.network);
    this.flowMgr = new GameFlowManager(
      this.network,
      this.physics,
      this.renderer,
      this.input,
      this.multiInput,
    );
    this.botMgr = new BotManager(this.network, this.multiInput);

    // Wire flow manager callbacks
    this.flowMgr.onPlayersUpdate = () => this.emitPlayersUpdate();
    this.flowMgr.onBeginMatch = () =>
      this.flowMgr.beginMatch(this.playerMgr.players, this.ships);

    // Setup collision callbacks
    setupCollisions(this.physics, {
      onProjectileHitShip: (projectileOwnerId, shipPlayerId, projectileBody) => {
        if (!this.network.isHost()) return;
        const ship = this.ships.get(shipPlayerId);
        if (ship && ship.alive && !ship.isInvulnerable()) {
          this.flowMgr.destroyShip(
            shipPlayerId,
            this.ships,
            this.pilots,
            this.playerMgr.players,
          );
          this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
        }
      },
      onProjectileHitPilot: (projectileOwnerId, pilotPlayerId, projectileBody) => {
        if (!this.network.isHost()) return;
        this.flowMgr.killPilot(
          pilotPlayerId,
          projectileOwnerId,
          this.pilots,
          this.playerMgr.players,
        );
        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
      onShipHitPilot: (shipPlayerId, pilotPlayerId) => {
        if (!this.network.isHost()) return;
        this.flowMgr.killPilot(
          pilotPlayerId,
          shipPlayerId,
          this.pilots,
          this.playerMgr.players,
        );
      },
      onProjectileHitWall: (projectileBody) => {
        if (!this.network.isHost()) return;
        this.flowMgr.removeProjectileByBody(projectileBody, this.projectiles);
      },
    });

    this.input.setup();
  }

  // ============= UI CALLBACKS =============

  setUICallbacks(callbacks: {
    onPhaseChange: (phase: GamePhase) => void;
    onPlayersUpdate: (players: PlayerData[]) => void;
    onCountdownUpdate: (count: number) => void;
  }): void {
    this.flowMgr.onPhaseChange = callbacks.onPhaseChange;
    this.flowMgr.onCountdownUpdate = callbacks.onCountdownUpdate;
    // Store players update callback — we wrap it to pass ordered players
    this._onPlayersUpdate = callbacks.onPlayersUpdate;
  }

  private _onPlayersUpdate: ((players: PlayerData[]) => void) | null = null;

  private emitPlayersUpdate(): void {
    this._onPlayersUpdate?.(this.getPlayers());
  }

  // ============= NETWORK =============

  async createRoom(): Promise<string> {
    this.registerNetworkCallbacks();
    const code = await this.network.createRoom();
    this.initializeNetworkSession();
    return code;
  }

  async joinRoom(code: string): Promise<boolean> {
    this.registerNetworkCallbacks();
    const success = await this.network.joinRoom(code);
    if (success) {
      this.initializeNetworkSession();
    }
    return success;
  }

  private registerNetworkCallbacks(): void {
    this.network.setCallbacks({
      onPlayerJoined: (playerId, playerIndex) => {
        this.playerMgr.addPlayer(
          playerId,
          playerIndex,
          this.flowMgr.phase,
          () => this.emitPlayersUpdate(),
          () => this.flowMgr.startCountdown(),
        );
      },

      onPlayerLeft: (playerId) => {
        // Clean up entities
        const ship = this.ships.get(playerId);
        if (ship) {
          ship.destroy();
          this.ships.delete(playerId);
        }
        const pilot = this.pilots.get(playerId);
        if (pilot) {
          pilot.destroy();
          this.pilots.delete(playerId);
        }

        this.playerMgr.removePlayer(playerId, () => this.emitPlayersUpdate());

        // Handle phase-specific logic
        if (this.network.isHost()) {
          if (this.flowMgr.phase === "PLAYING") {
            this.flowMgr.checkEliminationWin(this.playerMgr.players);
          } else if (this.flowMgr.phase === "COUNTDOWN") {
            if (this.playerMgr.players.size < 2) {
              console.log(
                "[Game] Not enough players during countdown, returning to lobby",
              );
              if (this.flowMgr.countdownInterval) {
                clearInterval(this.flowMgr.countdownInterval);
                this.flowMgr.countdownInterval = null;
              }
              this.flowMgr.setPhase("LOBBY");
            }
          }
        }
      },

      onGameStateReceived: (state) => {
        if (!this.network.isHost()) {
          this.applyNetworkState(state);
        }
      },

      onInputReceived: (playerId, input) => {
        if (this.network.isHost()) {
          this.pendingInputs.set(playerId, input);
        }
      },

      onHostChanged: () => {
        console.log("[Game] Host changed, we are now host");
        this.emitPlayersUpdate();

        if (this.flowMgr.phase === "PLAYING") {
          console.log("[Game] Previous host left mid-game, ending match");
          const sortedByKills = [...this.playerMgr.players.values()].sort(
            (a, b) => b.kills - a.kills,
          );
          this.flowMgr.endGame(
            sortedByKills[0]?.id || this.network.getMyPlayerId() || "",
            this.playerMgr.players,
          );
        }

        if (this.flowMgr.phase === "COUNTDOWN") {
          if (this.flowMgr.countdownInterval) {
            clearInterval(this.flowMgr.countdownInterval);
            this.flowMgr.countdownInterval = null;
          }
          this.flowMgr.setPhase("LOBBY");
        }
      },

      onDisconnected: () => {
        console.log("[Game] Disconnected from room");
        this.handleDisconnected();
      },

      onGamePhaseReceived: (phase) => {
        console.log("[Game] RPC phase received:", phase);
        if (!this.network.isHost()) {
          const oldPhase = this.flowMgr.phase;
          this.flowMgr.phase = phase;

          if (phase === "LOBBY" && oldPhase === "GAME_END") {
            this.flowMgr.clearGameState(
              this.ships,
              this.pilots,
              this.projectiles,
              this.pendingInputs,
              this.pendingDashes,
              this.playerMgr.players,
            );
          }

          this.flowMgr.onPhaseChange?.(phase);
        }
      },

      onWinnerReceived: (winnerId) => {
        console.log("[Game] RPC winner received:", winnerId);
        this.flowMgr.winnerId = winnerId;
        this.flowMgr.winnerName =
          this.playerMgr.players.get(winnerId)?.name ??
          this.network.getPlayerName(winnerId);
        this.emitPlayersUpdate();
      },

      onCountdownReceived: (count) => {
        if (!this.network.isHost()) {
          this.flowMgr.countdown = count;
          this.flowMgr.onCountdownUpdate?.(count);
        }
      },

      onGameSoundReceived: (type, _playerId) => {
        switch (type) {
          case "fire":
            AudioManager.playFire();
            break;
          case "dash":
            AudioManager.playDash();
            break;
          case "explosion":
            AudioManager.playExplosion();
            AudioManager.playPilotEject();
            break;
          case "kill":
            AudioManager.playKill();
            AudioManager.playPilotDeath();
            break;
          case "respawn":
            AudioManager.playRespawn();
            break;
          case "win":
            AudioManager.playWin();
            break;
        }
      },

      onDashRequested: (playerId) => {
        if (this.network.isHost()) {
          this.pendingDashes.add(playerId);
        }
      },

      onPingReceived: (latencyMs) => {
        this.latencyMs = latencyMs;
      },

      onPlayerListReceived: (playerOrder) => {
        if (!this.network.isHost()) {
          this.playerMgr.rebuildPlayersFromOrder(
            playerOrder,
            () => this.emitPlayersUpdate(),
          );
        }
      },
    });
  }

  private initializeNetworkSession(): void {
    this.network.startSync();

    this.input.setDashCallback(() => {
      this.network.sendDashRequest();
    });

    this.startPingInterval();
    this.flowMgr.setPhase("LOBBY");
  }

  private startPingInterval(): void {
    if (this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      if (this.network.isHost()) {
        this.network.broadcastPing();
      }
    }, 1000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleDisconnected(): void {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }
    this.stopPingInterval();
    this.flowMgr.clearGameState(
      this.ships,
      this.pilots,
      this.projectiles,
      this.pendingInputs,
      this.pendingDashes,
      this.playerMgr.players,
    );
    this.playerMgr.clear();
    this.flowMgr.setPhase("START");
  }

  // ============= GAME LOOP =============

  start(): void {
    this.renderer.resize();
    this.renderer.initStars();

    window.addEventListener("resize", () => {
      this.renderer.resize();
    });

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(timestamp: number): void {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    this.update(dt);
    this.render(dt);

    requestAnimationFrame((t) => this.loop(t));
  }

  private update(dt: number): void {
    if (this.flowMgr.phase !== "PLAYING") return;

    // Send local input
    const localInput = this.botMgr.useTouchForHost
      ? (this.multiInput?.capture(0) || { buttonA: false, buttonB: false, timestamp: 0 })
      : this.input.capture();
    this.network.sendInput(localInput);

    // Host: process all inputs and update physics
    if (this.network.isHost()) {
      this.ships.forEach((ship, playerId) => {
        let input: PlayerInput;
        let shouldDash = false;

        const isBot = this.network.isPlayerBot(playerId);
        const botType = this.network.getPlayerBotType(playerId);

        if (isBot && botType === "ai") {
          const player = this.network.getPlayer(playerId);
          const bot = player?.bot;
          if (bot) {
            const botData = this.botMgr.getBotVisibleData(
              playerId,
              this.ships,
              this.pilots,
              this.projectiles,
            );
            const action = bot.decideAction(botData);
            input = {
              buttonA: action.buttonA,
              buttonB: action.buttonB,
              timestamp: performance.now(),
            };
            shouldDash = action.dash;
          } else {
            input = { buttonA: false, buttonB: false, timestamp: 0 };
          }
        } else if (isBot && botType === "local") {
          const keySlot = this.network.getPlayerKeySlot(playerId);
          input = this.multiInput?.capture(keySlot) || {
            buttonA: false,
            buttonB: false,
            timestamp: 0,
          };
          shouldDash = this.multiInput?.consumeDash(keySlot) || false;
        } else {
          const myId = this.network.getMyPlayerId();
          const isMe = playerId === myId;

          if (isMe && this.botMgr.useTouchForHost) {
            input = this.multiInput?.capture(0) || {
              buttonA: false,
              buttonB: false,
              timestamp: 0,
            };
            shouldDash = this.multiInput?.consumeDash(0) || false;
          } else {
            input = this.pendingInputs.get(playerId) || {
              buttonA: false,
              buttonB: false,
              timestamp: 0,
            };
            shouldDash = this.pendingDashes.has(playerId);
            if (shouldDash) {
              this.pendingDashes.delete(playerId);
            }
          }
        }

        const fireResult = ship.applyInput(input, shouldDash, dt);
        if (fireResult?.shouldFire) {
          const firePos = ship.getFirePosition();
          const projectile = new Projectile(
            this.physics,
            firePos.x,
            firePos.y,
            fireResult.fireAngle,
            playerId,
          );
          this.projectiles.push(projectile);
          this.network.broadcastGameSound("fire", playerId);
        }

        if (shouldDash) {
          this.network.broadcastGameSound("dash", playerId);
        }
      });

      // Update pilots
      const threats: { x: number; y: number }[] = [];
      this.ships.forEach((ship) => {
        if (ship.alive) {
          threats.push({ x: ship.body.position.x, y: ship.body.position.y });
        }
      });
      this.projectiles.forEach((proj) => {
        threats.push({ x: proj.body.position.x, y: proj.body.position.y });
      });

      this.pilots.forEach((pilot, playerId) => {
        pilot.update(dt, threats);

        if (pilot.hasSurvived()) {
          const pilotPosition = {
            x: pilot.body.position.x,
            y: pilot.body.position.y,
          };
          pilot.destroy();
          this.pilots.delete(playerId);
          this.flowMgr.respawnPlayer(
            playerId,
            pilotPosition,
            this.ships,
            this.playerMgr.players,
          );
        }
      });

      this.physics.update(dt * 1000);

      // Clean up expired projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        if (this.projectiles[i].isExpired()) {
          this.projectiles[i].destroy();
          this.projectiles.splice(i, 1);
        }
      }

      this.broadcastState();
    }

    // Update particles and effects
    this.renderer.updateParticles(dt);
    this.renderer.updateScreenShake(dt);
  }

  private broadcastState(): void {
    const state: GameStateSync = {
      ships: [...this.ships.values()].map((s) => s.getState()),
      pilots: [...this.pilots.values()].map((p) => p.getState()),
      projectiles: this.projectiles.map((p) => p.getState()),
      players: [...this.playerMgr.players.values()],
    };

    this.network.broadcastGameState(state);
  }

  private applyNetworkState(state: GameStateSync): void {
    state.players.forEach((playerData) => {
      this.playerMgr.players.set(playerData.id, playerData);
    });
    this.emitPlayersUpdate();

    this.networkShips = state.ships;
    this.networkPilots = state.pilots;
    this.networkProjectiles = state.projectiles;
  }

  private render(dt: number): void {
    this.renderer.clear();
    this.renderer.beginFrame();

    this.renderer.drawStars();
    this.renderer.drawArenaBorder();

    if (this.flowMgr.phase === "PLAYING" || this.flowMgr.phase === "GAME_END") {
      const isHost = this.network.isHost();

      if (isHost) {
        this.ships.forEach((ship) => {
          if (ship.alive) {
            this.renderer.drawShip(ship.getState(), ship.color);
          }
        });
      } else {
        this.networkShips.forEach((state) => {
          if (state.alive) {
            const player = this.playerMgr.players.get(state.playerId);
            if (player) {
              this.renderer.drawShip(state, player.color);
            }
          }
        });
      }

      if (isHost) {
        this.pilots.forEach((pilot) => {
          if (pilot.alive) {
            this.renderer.drawPilot(pilot.getState());
          }
        });
      } else {
        this.networkPilots.forEach((state) => {
          if (state.alive) {
            this.renderer.drawPilot(state);
          }
        });
      }

      if (isHost) {
        this.projectiles.forEach((proj) => {
          this.renderer.drawProjectile(proj.getState());
        });
      } else {
        this.networkProjectiles.forEach((state) => {
          this.renderer.drawProjectile(state);
        });
      }

      this.renderer.drawParticles();
    }

    if (this.flowMgr.phase === "COUNTDOWN" && this.flowMgr.countdown > 0) {
      this.renderer.drawCountdown(this.flowMgr.countdown);
    } else if (this.flowMgr.phase === "COUNTDOWN" && this.flowMgr.countdown === 0) {
      this.renderer.drawCountdown(0);
    }

    this.renderer.endFrame();
  }

  // ============= PUBLIC API =============

  getPhase(): GamePhase {
    return this.flowMgr.phase;
  }

  getPlayers(): PlayerData[] {
    return this.playerMgr.getPlayers();
  }

  getWinnerId(): string | null {
    return this.flowMgr.winnerId;
  }

  getWinnerName(): string | null {
    return this.flowMgr.winnerName;
  }

  getRoomCode(): string {
    return this.network.getRoomCode();
  }

  isHost(): boolean {
    return this.network.isHost();
  }

  getMyPlayerId(): string | null {
    return this.network.getMyPlayerId();
  }

  getPlayerCount(): number {
    return this.network.getPlayerCount();
  }

  canStartGame(): boolean {
    return this.network.isHost() && this.network.getPlayerCount() >= 2;
  }

  getLatencyMs(): number {
    return this.latencyMs;
  }

  shouldShowPing(): boolean {
    return Game.SHOW_PING;
  }

  startGame(): void {
    this.flowMgr.startGame();
  }

  async leaveGame(): Promise<void> {
    if (this.flowMgr.countdownInterval) {
      clearInterval(this.flowMgr.countdownInterval);
      this.flowMgr.countdownInterval = null;
    }

    this.stopPingInterval();

    await this.network.disconnect();

    this.flowMgr.clearGameState(
      this.ships,
      this.pilots,
      this.projectiles,
      this.pendingInputs,
      this.pendingDashes,
      this.playerMgr.players,
    );
    this.playerMgr.clear();

    this.flowMgr.setPhase("START");
  }

  async restartGame(): Promise<void> {
    await this.flowMgr.restartGame(
      this.playerMgr.players,
      this.ships,
      this.pilots,
      this.projectiles,
      this.pendingInputs,
      this.pendingDashes,
    );
  }

  setPlayerName(name: string): void {
    this.network.setCustomName(name);
  }

  // ============= BOT DELEGATION =============

  isPlayerBot(playerId: string): boolean {
    return this.botMgr.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.botMgr.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    return this.botMgr.getPlayerKeySlot(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.botMgr.hasRemotePlayers();
  }

  async addAIBot(): Promise<boolean> {
    return this.botMgr.addAIBot(this.flowMgr.phase);
  }

  async addLocalBot(keySlot: number): Promise<boolean> {
    return this.botMgr.addLocalBot(keySlot, this.flowMgr.phase, this.playerMgr.players);
  }

  async removeBot(playerId: string): Promise<boolean> {
    return this.botMgr.removeBot(playerId);
  }

  getUsedKeySlots(): number[] {
    return this.botMgr.getUsedKeySlots(this.playerMgr.players);
  }

  getLocalPlayersInfo(): Array<{ name: string; color: string; keyPreset: string }> {
    return this.botMgr.getLocalPlayersInfo(this.playerMgr.players);
  }

  hasLocalPlayers(): boolean {
    return this.botMgr.hasLocalPlayers(this.playerMgr.players);
  }

  // ============= TOUCH LAYOUT DELEGATION =============

  updateTouchLayout(): void {
    this.botMgr.updateTouchLayout(this.getPlayers());
  }

  clearTouchLayout(): void {
    this.botMgr.clearTouchLayout();
  }
}
