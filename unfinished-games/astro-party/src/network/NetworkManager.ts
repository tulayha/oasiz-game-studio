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
  PlayerState as PlayroomPlayerState,
} from "playroomkit";
import {
  GameStateSync,
  PlayerInput,
  PlayerData,
  PLAYER_COLORS,
  GAME_CONFIG,
} from "../types";

export interface NetworkCallbacks {
  onPlayerJoined: (playerId: string, playerIndex: number) => void;
  onPlayerLeft: (playerId: string) => void;
  onGameStateReceived: (state: GameStateSync) => void;
  onInputReceived: (playerId: string, input: PlayerInput) => void;
  onHostChanged: () => void;
  onDisconnected: () => void;
  onGamePhaseReceived: (phase: GameStateSync["phase"]) => void;
  onWinnerReceived: (winnerId: string) => void;
  onCountdownReceived: (count: number) => void;
  onGameSoundReceived: (type: string, playerId: string) => void;
  onDashRequested: (playerId: string) => void;
}

export class NetworkManager {
  private players: Map<string, PlayroomPlayerState> = new Map();
  private playerOrder: string[] = [];
  private callbacks: NetworkCallbacks | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  async createRoom(): Promise<string> {
    console.log("[NetworkManager] Creating new room...");

    // Don't pass roomCode - let PlayroomKit generate one
    await insertCoin({
      skipLobby: true,
      maxPlayersPerRoom: 4,
      defaultPlayerStates: {
        kills: 0,
        playerState: "ACTIVE",
        input: null,
      },
    });

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

      // Pass roomCode to join existing room
      await insertCoin({
        skipLobby: true,
        maxPlayersPerRoom: 4,
        roomCode: roomCode,
        defaultPlayerStates: {
          kills: 0,
          playerState: "ACTIVE",
          input: null,
        },
      });

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

  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;

    // Register RPC handlers for game events
    this.setupRPCHandlers();

    // Setup player join/leave handlers
    onPlayerJoin((player) => {
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
        this.playerOrder = this.playerOrder.filter((id) => id !== player.id);
        this.callbacks?.onPlayerLeft(player.id);

        // Check if we became host after someone left
        if (isHost()) {
          this.callbacks?.onHostChanged();
        }
      });
    });

    // Setup disconnect handler (for when current player disconnects/leaves)
    onDisconnect((e) => {
      console.log("[NetworkManager] Disconnected:", e.code, e.reason);
      this.connected = false;
      this.stopSync();
      this.callbacks?.onDisconnected();
    });
  }

  private setupRPCHandlers(): void {
    // Handle game phase changes from host
    RPC.register("gamePhase", async (phase: GameStateSync["phase"]) => {
      console.log("[NetworkManager] RPC gamePhase received:", phase);
      this.callbacks?.onGamePhaseReceived(phase);
    });

    // Handle winner announcement from host
    RPC.register("gameWinner", async (winnerId: string) => {
      console.log("[NetworkManager] RPC gameWinner received:", winnerId);
      this.callbacks?.onWinnerReceived(winnerId);
    });

    // Handle countdown updates from host
    RPC.register("countdown", async (count: number) => {
      console.log("[NetworkManager] RPC countdown received:", count);
      this.callbacks?.onCountdownReceived(count);
    });

    // Handle game sound events from host
    RPC.register(
      "gameSound",
      async (data: { type: string; playerId: string }) => {
        this.callbacks?.onGameSoundReceived(data.type, data.playerId);
      },
    );

    // Handle dash request from any player (sent to host)
    RPC.register("dashRequest", async (playerId: string) => {
      this.callbacks?.onDashRequested(playerId);
    });
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

  // Broadcast game phase change via RPC (reliable one-time event)
  broadcastGamePhase(phase: GameStateSync["phase"]): void {
    if (!isHost()) return;
    console.log("[NetworkManager] Broadcasting game phase via RPC:", phase);
    RPC.call("gamePhase", phase, RPC.Mode.ALL);
  }

  // Broadcast winner via RPC (reliable one-time event)
  broadcastWinner(winnerId: string): void {
    if (!isHost()) return;
    console.log("[NetworkManager] Broadcasting winner via RPC:", winnerId);
    RPC.call("gameWinner", winnerId, RPC.Mode.ALL);
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

  // Reset all player states (for game restart)
  async resetAllPlayerStates(): Promise<void> {
    if (!isHost()) return;
    console.log("[NetworkManager] Resetting all player states");
    await resetPlayersStates(["customName"]); // Keep custom names
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
    try {
      const player = myPlayer();
      if (player) {
        await player.leaveRoom();
      }
    } catch (e) {
      console.log("[NetworkManager] Error leaving room:", e);
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
}
