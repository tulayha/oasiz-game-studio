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
import {
  NetworkBotManager,
  PlayroomPlayerState,
} from "./NetworkBotManager";
import {
  GameStateSync,
  GamePhase,
  PlayerInput,
  PlayerData,
  PLAYER_COLORS,
  GAME_CONFIG,
} from "../types";

export type { PlayroomPlayerState } from "./NetworkBotManager";

export interface NetworkCallbacks {
  onPlayerJoined: (playerId: string, playerIndex: number) => void;
  onPlayerLeft: (playerId: string) => void;
  onGameStateReceived: (state: GameStateSync) => void;
  onInputReceived: (playerId: string, input: PlayerInput) => void;
  onHostChanged: () => void;
  onDisconnected: () => void;
  onGamePhaseReceived: (phase: GamePhase, winnerId?: string, winnerName?: string) => void;
  onCountdownReceived: (count: number) => void;
  onGameSoundReceived: (type: string, playerId: string) => void;
  onDashRequested: (playerId: string) => void;
  onPingReceived: (latencyMs: number) => void;
  onPlayerListReceived: (playerOrder: string[]) => void;
}

export class NetworkManager {
  private players: Map<string, PlayroomPlayerState> = new Map();
  private playerOrder: string[] = [];
  private callbacks: NetworkCallbacks | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private cleanupFunctions: (() => void)[] = [];
  private botMgr = new NetworkBotManager(this.players);

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
          playerState: "ACTIVE",
          input: null,
          botType: null,
        },
      });

      // Register PK listeners fresh for this session
      this.setupListeners();

      this.connected = true;
      console.log("[NetworkManager] Joined room! Code:", getRoomCode());

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
        this.players.set(player.id, player);
        this.playerOrder.push(player.id);

        const playerIndex = this.playerOrder.indexOf(player.id);
        this.callbacks?.onPlayerJoined(player.id, playerIndex);

        // Check if we became host
        if (isHost() && myPlayer()?.id === player.id) {
          this.callbacks?.onHostChanged();
        }

        player.onQuit(() => {
          console.log("[NetworkManager] Player left:", player.id);
          this.players.delete(player.id);
          this.playerOrder = this.playerOrder.filter(
            (id) => id !== player.id,
          );
          this.callbacks?.onPlayerLeft(player.id);

          // Check if we became host after someone left
          if (isHost()) {
            this.callbacks?.onHostChanged();
          }
        });
      }),
    );

    // Setup disconnect handler (for when current player disconnects/leaves)
    this.cleanupFunctions.push(
      onDisconnect((e) => {
        console.log("[NetworkManager] Disconnected:", e.code, e.reason);
        this.connected = false;
        this.stopSync();
        this.callbacks?.onDisconnected();
      }),
    );

    // Register RPC handlers
    this.setupRPCHandlers();
  }

  private setupRPCHandlers(): void {
    // Handle game phase changes from host (GAME_END includes winner info)
    this.cleanupFunctions.push(
      RPC.register(
        "gamePhase",
        async (data: { phase: GamePhase; winnerId?: string; winnerName?: string }) => {
          console.log("[NetworkManager] RPC gamePhase received:", data.phase);
          this.callbacks?.onGamePhaseReceived(data.phase, data.winnerId, data.winnerName);
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

    // Handle ping from host (for latency display)
    this.cleanupFunctions.push(
      RPC.register("ping", async (hostTime: number) => {
        const latency = Date.now() - hostTime;
        this.callbacks?.onPingReceived(latency);
      }),
    );

    // Handle player list sync from host (authoritative order)
    this.cleanupFunctions.push(
      RPC.register("playerList", async (playerOrder: string[]) => {
        // Update local playerOrder to match host's authoritative order
        if (!isHost()) {
          this.playerOrder = [...playerOrder];
        }
        this.callbacks?.onPlayerListReceived(playerOrder);
      }),
    );
  }

  startSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      if (!this.connected) return;

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
  broadcastGamePhase(phase: GamePhase, winnerId?: string, winnerName?: string): void {
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
  broadcastGameSound(type: string, playerId: string): void {
    if (!isHost()) return;
    RPC.call("gameSound", { type, playerId }, RPC.Mode.ALL);
  }

  // Send dash request to host (any player can call)
  sendDashRequest(): void {
    const playerId = myPlayer()?.id;
    if (!playerId) return;
    RPC.call("dashRequest", playerId, RPC.Mode.HOST);
  }

  // Broadcast ping for latency measurement (host only)
  broadcastPing(): void {
    if (!isHost()) return;
    RPC.call("ping", Date.now(), RPC.Mode.ALL);
  }

  // Broadcast player list (host only) - authoritative order for colors
  broadcastPlayerList(): void {
    if (!isHost()) return;
    RPC.call("playerList", this.playerOrder, RPC.Mode.ALL);
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
    const index = this.getPlayerIndex(playerId);
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  getPlayerName(playerId: string): string {
    const player = this.players.get(playerId);
    if (player) {
      const customName = player.getState("customName") as string;
      if (customName) return customName;
      const profile = player.getProfile();
      if (profile?.name) return profile.name;
    }
    const index = this.getPlayerIndex(playerId);
    return `Player ${index + 1}`;
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

  isPlayerBot(playerId: string): boolean {
    return this.botMgr.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.botMgr.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
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
