import {
  insertCoin,
  isHost,
  myPlayer,
  onPlayerJoin,
  onDisconnect,
  getState,
  setState,
  getRoomCode,
  RPC,
  resetPlayersStates,
} from "playroomkit";
import { AstroBot } from "../entities/AstroBot";
import { NetworkBotManager, PlayroomPlayerState } from "./NetworkBotManager";
import {
  GameStateSync,
  GamePhase,
  PlayerInput,
  PlayerData,
  PLAYER_COLORS,
  GAME_CONFIG,
  RoundResultPayload,
  AdvancedSettingsSync,
} from "../types";

export type { PlayroomPlayerState } from "./NetworkBotManager";

export interface NetworkCallbacks {
  onPlayerJoined: (playerId: string, playerIndex: number) => void;
  onPlayerLeft: (playerId: string) => void;
  onGameStateReceived: (state: GameStateSync) => void;
  onInputReceived: (playerId: string, input: PlayerInput) => void;
  onHostChanged: () => void;
  onDisconnected: () => void;
  onGamePhaseReceived: (
    phase: GamePhase,
    winnerId?: string,
    winnerName?: string,
  ) => void;
  onCountdownReceived: (count: number) => void;
  onGameSoundReceived: (type: string, playerId: string) => void;
  onDashRequested: (playerId: string) => void;
  onPingReceived: (latencyMs: number) => void;
  onPlayerListReceived: (playerOrder: string[], meta?: PlayerMetaMap) => void;
  onRoundResultReceived: (payload: RoundResultPayload) => void;

  onDevModeReceived: (enabled: boolean) => void;

  onAdvancedSettingsReceived: (payload: AdvancedSettingsSync) => void;

  onMapIdReceived: (mapId: number) => void;

  onScreenShakeReceived: (intensity: number, duration: number) => void;

  onDashParticlesReceived?: (payload: {
    playerId: string;
    x: number;
    y: number;
    angle: number;
    color: string;
  }) => void;
}

interface PlayerMeta {
  id: string;
  customName?: string;
  profileName?: string;
  botType?: "ai" | "local";
  colorIndex?: number;
  keySlot?: number;
}

type PlayerMetaMap = Map<string, PlayerMeta>;

interface PingPayload {
  seq: number;
  sentAt: number;
}

export class NetworkManager {
  private players: Map<string, PlayroomPlayerState> = new Map();
  private playerOrder: string[] = [];
  private callbacks: NetworkCallbacks | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private cleanupFunctions: (() => void)[] = [];
  private botMgr = new NetworkBotManager(this.players);
  private hostId: string | null = null;
  private colorUsed = new Set<number>();
  private colorIndexById = new Map<string, number>();
  private playerMetaById: PlayerMetaMap = new Map();
  private webrtcConnected = false;
  private pingSeq = 0;
  private lastPingSentAt = 0;
  private lastPingEchoSeq = -1;
  private lastPingSeqByPlayer = new Map<string, number>();
  private static readonly PING_INTERVAL_MS = 1000;

  async createRoom(): Promise<string> {
    console.log("[NetworkManager] Creating new room...");

    // Deregister stale listeners from any previous PK session
    this.cleanupPreviousListeners();

    // Clear state from any previous session
    this.resetState();

    // Don't pass roomCode - let PlayroomKit generate one
    await insertCoin({
      skipLobby: true,
      maxPlayersPerRoom: 4,
      enableBots: true,
      botOptions: {
        botClass: AstroBot,
      },
      defaultPlayerStates: {
        kills: 0,
        roundWins: 0,
        playerState: "ACTIVE",
        input: null,
        botType: null, // 'ai' | 'local' | null
      },
    });

    // Register PK listeners fresh for this session
    this.setupListeners();

    this.connected = true;
    const roomCode = getRoomCode() || "";
    console.log("[NetworkManager] Room created! Code:", roomCode);
    this.updateHostState();

    // Share room code with platform
    this.shareRoomCode(roomCode);
    return roomCode;
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    try {
      console.log("[NetworkManager] Joining room:", roomCode);

      // Deregister stale listeners from any previous PK session
      this.cleanupPreviousListeners();

      // Clear state from any previous session
      this.resetState();

      // Pass roomCode to join existing room
      await insertCoin({
        skipLobby: true,
        maxPlayersPerRoom: 4,
        roomCode: roomCode,
        enableBots: true,
        botOptions: {
          botClass: AstroBot,
        },
        defaultPlayerStates: {
          kills: 0,
          roundWins: 0,
          playerState: "ACTIVE",
          input: null,
          botType: null,
        },
      });

      // Register PK listeners fresh for this session
      this.setupListeners();

      this.connected = true;
      console.log("[NetworkManager] Joined room! Code:", getRoomCode());
      this.updateHostState();

      // Share room code with platform
      this.shareRoomCode(roomCode);
      return true;
    } catch (e) {
      console.error("[NetworkManager] Failed to join room:", e);
      return false;
    }
  }

  // Store callbacks reference only — listeners are registered per-session in setupListeners()
  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;
  }

  // Register all PlayroomKit event/RPC listeners and store their cleanup functions
  private setupListeners(): void {
    // Setup player join/leave handlers
    this.cleanupFunctions.push(
      onPlayerJoin((player) => {
        // Guard against duplicate join events
        if (this.players.has(player.id)) {
          console.log("[NetworkManager] Duplicate join ignored:", player.id);
          return;
        }
        console.log("[NetworkManager] Player joined:", player.id);
        const botPlayer = player as PlayroomPlayerState;
        this.players.set(player.id, botPlayer);
        if (isHost()) {
          this.assignColorOnJoin(botPlayer);
          if (botPlayer.isBot?.()) {
            this.botMgr.assignBotOnJoin(botPlayer);
          }
          if (!this.playerOrder.includes(botPlayer.id)) {
            this.playerOrder.push(botPlayer.id);
          }
          console.log(
            "[NetworkManager] playerOrder (after join):",
            this.playerOrder.length,
            this.playerOrder,
          );

          const playerIndex = this.playerOrder.indexOf(botPlayer.id);
          this.callbacks?.onPlayerJoined(botPlayer.id, playerIndex);
          this.broadcastPlayerList();
        }

        player.onQuit(() => {
          console.log("[NetworkManager] Player left:", player.id);
          this.players.delete(player.id);
          this.lastPingSeqByPlayer.delete(player.id);
          if (player.id === this.hostId) {
            this.callbacks?.onHostChanged();
          }
          if (isHost()) {
            this.playerOrder = this.playerOrder.filter(
              (id) => id !== player.id,
            );
            this.releaseColor(player.id);
            this.botMgr.releaseBot(player.id);
            this.callbacks?.onPlayerLeft(player.id);
            this.broadcastPlayerList();
          } else {
            this.callbacks?.onPlayerLeft(player.id);
          }
        });
      }),
    );

    // Setup disconnect handler (for when current player disconnects/leaves)
    this.cleanupFunctions.push(
      onDisconnect((e) => {
        console.log("[NetworkManager] Disconnected:", e.code, e.reason);
        this.connected = false;
        this.webrtcConnected = false;
        this.stopSync();
        this.callbacks?.onDisconnected();
      }),
    );

    const me = myPlayer() as unknown as {
      on?: (event: string, cb: () => void) => void;
      off?: (event: string, cb: () => void) => void;
      removeListener?: (event: string, cb: () => void) => void;
      webrtcConnected?: boolean;
    };
    if (me) {
      this.webrtcConnected = Boolean(me.webrtcConnected);
      if (me.on) {
        const handleWebRtcConnected = (): void => {
          this.webrtcConnected = true;
        };
        me.on("webrtc_connected", handleWebRtcConnected);
        this.cleanupFunctions.push(() => {
          if (me.off) {
            me.off("webrtc_connected", handleWebRtcConnected);
          } else if (me.removeListener) {
            me.removeListener("webrtc_connected", handleWebRtcConnected);
          }
        });
      }
    }

    // Register RPC handlers
    this.setupRPCHandlers();
  }

  private setupRPCHandlers(): void {
    // Handle game phase changes from host (GAME_END includes winner info)
    this.cleanupFunctions.push(
      RPC.register(
        "gamePhase",
        async (data: {
          phase: GamePhase;
          winnerId?: string;
          winnerName?: string;
        }) => {
          console.log("[NetworkManager] RPC gamePhase received:", data.phase);
          this.callbacks?.onGamePhaseReceived(
            data.phase,
            data.winnerId,
            data.winnerName,
          );
        },
      ),
    );

    // Handle countdown updates from host
    this.cleanupFunctions.push(
      RPC.register("countdown", async (count: number) => {
        console.log("[NetworkManager] RPC countdown received:", count);
        this.callbacks?.onCountdownReceived(count);
      }),
    );

    // Handle game sound events from host
    this.cleanupFunctions.push(
      RPC.register(
        "gameSound",
        async (data: { type: string; playerId: string }) => {
          this.callbacks?.onGameSoundReceived(data.type, data.playerId);
        },
      ),
    );

    // Handle dash request from any player (sent to host)
    this.cleanupFunctions.push(
      RPC.register("dashRequest", async (playerId: string) => {
        this.callbacks?.onDashRequested(playerId);
      }),
    );

    // Handle player list sync from host (authoritative order + metadata)
    this.cleanupFunctions.push(
      RPC.register(
        "playerList",
        async (payload: {
          order: string[];
          meta: PlayerMeta[];
          hostId?: string | null;
        }) => {
          if (!isHost()) {
            this.playerOrder = [...payload.order];
            this.playerMetaById.clear();
            for (const meta of payload.meta) {
              this.playerMetaById.set(meta.id, meta);
            }
            if (payload.hostId) {
              this.hostId = payload.hostId;
            }
            console.log(
              "[NetworkManager] playerList received:",
              this.playerOrder.length,
              this.playerOrder,
            );
          }
          this.callbacks?.onPlayerListReceived(
            payload.order,
            this.playerMetaById,
          );
        },
      ),
    );

    // Handle round results from host
    this.cleanupFunctions.push(
      RPC.register("roundResult", async (payload: RoundResultPayload) => {
        console.log("[NetworkManager] RPC roundResult received");
        this.callbacks?.onRoundResultReceived(payload);
      }),
    );

    // Handle dev mode state from host
    this.cleanupFunctions.push(
      RPC.register("devMode", async (enabled: boolean) => {
        console.log("[NetworkManager] RPC devMode received:", enabled);
        this.callbacks?.onDevModeReceived(enabled);
      }),
    );

    // Handle advanced settings + mode sync from host
    this.cleanupFunctions.push(
      RPC.register(
        "advancedSettings",
        async (payload: AdvancedSettingsSync) => {
          console.log("[NetworkManager] RPC advancedSettings received");
          this.callbacks?.onAdvancedSettingsReceived(payload);
        },
      ),
    );

    // Handle map selection from host
    this.cleanupFunctions.push(
      RPC.register("mapId", async (mapId: number) => {
        console.log("[NetworkManager] RPC mapId received:", mapId);
        this.callbacks?.onMapIdReceived(mapId);
      }),
    );

    this.cleanupFunctions.push(
      RPC.register(
        "screenShake",
        async (payload: { intensity: number; duration: number }) => {
          this.callbacks?.onScreenShakeReceived(
            payload.intensity,
            payload.duration,
          );
        },
      ),
    );

    // Handle dash particles from host
    this.cleanupFunctions.push(
      RPC.register(
        "dashParticles",
        async (payload: {
          playerId: string;
          x: number;
          y: number;
          angle: number;
          color: string;
        }) => {
          this.callbacks?.onDashParticlesReceived?.(payload);
        },
      ),
    );

  }

  startSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      if (!this.connected) return;
      this.handlePingTick(performance.now());

      // All clients: check for game state updates (positions, etc)
      if (!isHost()) {
        const gameState = getState("gameState") as GameStateSync;
        if (gameState) {
          this.callbacks?.onGameStateReceived(gameState);
        }
      }

      // Host: collect inputs from all players
      if (isHost()) {
        this.players.forEach((player, playerId) => {
          const input = player.getState("input") as PlayerInput;
          if (input) {
            this.callbacks?.onInputReceived(playerId, input);
          }
        });
      }
    }, GAME_CONFIG.SYNC_INTERVAL);
  }

  stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Send local player's input
  sendInput(input: PlayerInput): void {
    const player = myPlayer();
    if (player) {
      player.setState("input", input, false); // Unreliable for frequent updates
    }
  }

  // Host broadcasts game state to all clients (frequent position updates)
  broadcastGameState(state: GameStateSync): void {
    if (!isHost()) return;
    setState("gameState", state, false); // Unreliable for frequent position updates
  }

  // Broadcast game phase change via RPC (GAME_END includes winner info)
  broadcastGamePhase(
    phase: GamePhase,
    winnerId?: string,
    winnerName?: string,
  ): void {
    if (!isHost()) return;
    console.log("[NetworkManager] Broadcasting game phase via RPC:", phase);
    RPC.call("gamePhase", { phase, winnerId, winnerName }, RPC.Mode.ALL);
  }

  // Broadcast countdown via RPC (reliable one-time event per tick)
  broadcastCountdown(count: number): void {
    if (!isHost()) return;
    RPC.call("countdown", count, RPC.Mode.ALL);
  }

  // Broadcast game sound event via RPC (all players hear all sounds)
  broadcastGameSound(
    type: string,
    playerId: string,
    mode: typeof RPC.Mode.ALL | typeof RPC.Mode.OTHERS = RPC.Mode.ALL,
  ): void {
    if (!isHost()) return;
    RPC.call("gameSound", { type, playerId }, mode);
  }

  broadcastGameSoundToOthers(type: string, playerId: string): void {
    this.broadcastGameSound(type, playerId, RPC.Mode.OTHERS);
  }

  broadcastScreenShake(intensity: number, duration: number): void {
    if (!isHost()) return;
    RPC.call("screenShake", { intensity, duration }, RPC.Mode.OTHERS);
  }


  // Send dash request to host (any player can call)
  sendDashRequest(): void {
    const playerId = myPlayer()?.id;
    if (!playerId) return;
    RPC.call("dashRequest", playerId, RPC.Mode.HOST);
  }

  // Broadcast dash particles to all clients
  broadcastDashParticles(
    playerId: string,
    x: number,
    y: number,
    angle: number,
    color: string,
  ): void {
    if (!isHost()) return;
    RPC.call("dashParticles", { playerId, x, y, angle, color }, RPC.Mode.ALL);
  }

  broadcastRoundResult(payload: RoundResultPayload): void {
    if (!isHost()) return;
    console.log("[NetworkManager] Broadcasting round result");
    RPC.call("roundResult", payload, RPC.Mode.ALL);
  }

  // Broadcast dev mode state via RPC
  broadcastDevMode(enabled: boolean): void {
    if (!isHost()) return;
    console.log("[NetworkManager] Broadcasting dev mode:", enabled);
    RPC.call("devMode", enabled, RPC.Mode.ALL);
  }
  broadcastAdvancedSettings(payload: AdvancedSettingsSync): void {
    if (!isHost()) return;
    console.log("[NetworkManager] Broadcasting advanced settings");
    RPC.call("advancedSettings", payload, RPC.Mode.ALL);
  }
  broadcastMapId(mapId: number): void {
    if (!isHost()) return;
    console.log("[NetworkManager] Broadcasting mapId:", mapId);
    RPC.call("mapId", mapId, RPC.Mode.ALL);
  }

  // Broadcast player list (host only) - authoritative order for colors
  broadcastPlayerList(): void {
    if (!isHost()) return;
    this.updateHostState();
    const meta: PlayerMeta[] = this.playerOrder.map((playerId) => {
      const player = this.players.get(playerId);
      return {
        id: playerId,
        customName: (player?.getState("customName") as string) || undefined,
        profileName: player?.getProfile()?.name || undefined,
        botType: (player?.getState("botType") as "ai" | "local") || undefined,
        colorIndex: (player?.getState("colorIndex") as number) ?? undefined,
        keySlot: (player?.getState("keySlot") as number) ?? undefined,
      };
    });
    console.log(
      "[NetworkManager] Broadcasting playerList:",
      this.playerOrder.length,
      this.playerOrder,
    );
    RPC.call(
      "playerList",
      { order: this.playerOrder, meta, hostId: this.hostId },
      RPC.Mode.ALL,
    );
  }

  // Reset all player states (for game restart)
  async resetAllPlayerStates(): Promise<void> {
    if (!isHost()) return;
    console.log("[NetworkManager] Resetting all player states");
    await resetPlayersStates(["customName", "botType", "keySlot"]); // Keep bot identity fields
  }

  // Update player kill count
  updateKills(playerId: string, kills: number): void {
    const player = this.players.get(playerId);
    if (player) {
      player.setState("kills", kills, true);
    }
  }

  updateRoundWins(playerId: string, wins: number): void {
    const player = this.players.get(playerId);
    if (player) {
      player.setState("roundWins", wins, true);
    }
  }

  // Update player state (ACTIVE, EJECTED, SPECTATING)
  updatePlayerState(playerId: string, state: PlayerData["state"]): void {
    const player = this.players.get(playerId);
    if (player) {
      player.setState("playerState", state, true);
    }
  }

  getMyPlayerId(): string | null {
    return myPlayer()?.id ?? null;
  }

  isHost(): boolean {
    return isHost();
  }

  isWebRtcConnected(): boolean {
    return this.webrtcConnected;
  }

  getRoomCode(): string {
    return getRoomCode() || "";
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getPlayerIds(): string[] {
    return [...this.playerOrder];
  }

  getPlayerIndex(playerId: string): number {
    return this.playerOrder.indexOf(playerId);
  }

  getPlayerColor(playerId: string): { primary: string; glow: string } {
    const player = this.players.get(playerId);
    if (!isHost()) {
      const meta = this.playerMetaById.get(playerId);
      const metaIndex = meta?.colorIndex;
      if (Number.isFinite(metaIndex)) {
        return PLAYER_COLORS[(metaIndex as number) % PLAYER_COLORS.length];
      }
    }
    const colorIndex = player?.getState("colorIndex") as number | undefined;
    if (Number.isFinite(colorIndex)) {
      return PLAYER_COLORS[(colorIndex as number) % PLAYER_COLORS.length];
    }
    const index = this.getPlayerIndex(playerId);
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  getPlayerName(playerId: string): string {
    const player = this.players.get(playerId);
    if (!isHost()) {
      const meta = this.playerMetaById.get(playerId);
      if (meta?.customName) return meta.customName;
      if (meta?.profileName) return meta.profileName;
    }
    if (player) {
      const customName = player.getState("customName") as string;
      if (customName) return customName;
      const profile = player.getProfile();
      if (profile?.name) return profile.name;
    }
    const index = this.getPlayerIndex(playerId);
    return `Player ${index + 1}`;
  }

  getHostId(): string | null {
    const stateHost = getState("hostId") as string | undefined;
    if (stateHost) return stateHost;
    return this.hostId;
  }

  setCustomName(name: string): void {
    const player = myPlayer();
    if (player) {
      player.setState("customName", name, true);
    }
  }

  async disconnect(): Promise<void> {
    this.stopSync();
    this.shareRoomCode(null);
    this.connected = false;
    this.resetState();

    // Call leaveRoom WITH listeners still active — PK needs them to
    // properly tear down internal state (bots subsystem, etc.)
    // Listener cleanup is deferred to the next createRoom/joinRoom call.
    try {
      const player = myPlayer();
      if (player) {
        await player.leaveRoom();
      }
    } catch (e) {
      console.log("[NetworkManager] Error leaving room:", e);
    }
  }

  // Deregister PK listeners from a previous session (called before new insertCoin)
  private cleanupPreviousListeners(): void {
    for (const cleanup of this.cleanupFunctions) {
      try {
        cleanup();
      } catch (e) {
        // Ignore cleanup errors from stale listeners
      }
    }
    this.cleanupFunctions = [];
  }

  // Clear all state (call between sessions)
  private resetState(): void {
    this.players.clear();
    this.playerOrder = [];
    this.botMgr.resetCounter();
    this.hostId = null;
    this.colorUsed.clear();
    this.colorIndexById.clear();
    this.playerMetaById.clear();
    this.webrtcConnected = false;
    this.pingSeq = 0;
    this.lastPingSentAt = 0;
    this.lastPingEchoSeq = -1;
    this.lastPingSeqByPlayer.clear();
  }

  private handlePingTick(now: number): void {
    const localPlayer = myPlayer();
    if (!localPlayer) return;

    const echo = localPlayer.getState("pingEcho") as PingPayload | undefined;
    if (echo && echo.seq !== this.lastPingEchoSeq) {
      this.lastPingEchoSeq = echo.seq;
      const rtt = Math.max(0, now - echo.sentAt);
      this.callbacks?.onPingReceived(rtt);
    }

    if (isHost()) {
      this.players.forEach((player, playerId) => {
        const ping = player.getState("ping") as PingPayload | undefined;
        if (!ping) return;
        const lastSeq = this.lastPingSeqByPlayer.get(playerId);
        if (lastSeq === ping.seq) return;
        this.lastPingSeqByPlayer.set(playerId, ping.seq);
        player.setState("pingEcho", ping, false);
      });
    }

    if (now - this.lastPingSentAt < NetworkManager.PING_INTERVAL_MS) {
      return;
    }

    this.lastPingSentAt = now;
    this.pingSeq += 1;
    const payload: PingPayload = { seq: this.pingSeq, sentAt: now };
    localPlayer.setState("ping", payload, false);
  }

  private updateHostState(): void {
    if (!isHost()) return;
    const myId = myPlayer()?.id;
    if (!myId) return;
    const hostChanged = this.hostId !== myId;
    this.hostId = myId;
    setState("hostId", myId, true);
    if (hostChanged) {
      this.rebuildColorUsage();
    }
  }

  private shareRoomCode(code: string | null): void {
    if (
      typeof (
        window as unknown as { shareRoomCode?: (code: string | null) => void }
      ).shareRoomCode === "function"
    ) {
      (
        window as unknown as { shareRoomCode: (code: string | null) => void }
      ).shareRoomCode(code);
    }
  }

  private assignColorOnJoin(player: PlayroomPlayerState): void {
    const existing = player.getState("colorIndex") as number | undefined;
    const index = this.pickColorIndex(existing);
    this.colorUsed.add(index);
    this.colorIndexById.set(player.id, index);
    if (!Number.isFinite(existing) || existing !== index) {
      player.setState("colorIndex", index, true);
    }
  }

  private releaseColor(playerId: string): void {
    const index = this.colorIndexById.get(playerId);
    if (index !== undefined) {
      this.colorUsed.delete(index);
      this.colorIndexById.delete(playerId);
    }
  }

  private rebuildColorUsage(): void {
    this.colorUsed.clear();
    this.colorIndexById.clear();
    for (const [playerId, player] of this.players) {
      if (!isHost()) return;
      const existing = player.getState("colorIndex") as number | undefined;
      const index = this.pickColorIndex(existing);
      this.colorUsed.add(index);
      this.colorIndexById.set(playerId, index);
      if (!Number.isFinite(existing) || existing !== index) {
        player.setState("colorIndex", index, true);
      }
    }
  }

  private pickColorIndex(existing?: number): number {
    if (Number.isFinite(existing) && !this.colorUsed.has(existing as number)) {
      return existing as number;
    }
    for (let i = 0; i < PLAYER_COLORS.length; i++) {
      if (!this.colorUsed.has(i)) return i;
    }
    return 0;
  }

  // ============= BOT MANAGEMENT (delegated to NetworkBotManager) =============

  async addAIBot(): Promise<AstroBot | null> {
    return this.botMgr.addAIBot();
  }

  async addLocalBot(keySlot: number): Promise<AstroBot | null> {
    return this.botMgr.addLocalBot(keySlot);
  }

  async removeBot(playerId: string): Promise<boolean> {
    return this.botMgr.removeBot(playerId);
  }

  async kickPlayer(playerId: string): Promise<boolean> {
    if (!isHost()) {
      console.log("[NetworkManager] Only host can kick players");
      return false;
    }

    const myId = myPlayer()?.id;
    if (myId && playerId === myId) {
      console.log("[NetworkManager] Host cannot kick themselves");
      return false;
    }

    const player = this.players.get(playerId);
    if (!player) {
      console.log("[NetworkManager] Player not found:", playerId);
      return false;
    }

    try {
      await player.kick();
      console.log("[NetworkManager] Player kicked:", playerId);
      return true;
    } catch (e) {
      console.error("[NetworkManager] Failed to kick player:", e);
      return false;
    }
  }

  isPlayerBot(playerId: string): boolean {
    return this.botMgr.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    if (!isHost()) {
      const meta = this.playerMetaById.get(playerId);
      if (meta?.botType) return meta.botType;
    }
    return this.botMgr.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    if (!isHost()) {
      const meta = this.playerMetaById.get(playerId);
      if (Number.isFinite(meta?.keySlot)) return meta?.keySlot as number;
    }
    return this.botMgr.getPlayerKeySlot(playerId);
  }

  getPlayer(playerId: string): PlayroomPlayerState | undefined {
    return this.botMgr.getPlayer(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.botMgr.hasRemotePlayers();
  }

  getBotCount(): number {
    return this.botMgr.getBotCount();
  }
}
