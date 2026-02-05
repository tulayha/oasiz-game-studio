import {
  insertCoin,
  isHost,
  myPlayer,
  onPlayerJoin,
  getState,
  setState,
  getRoomCode,
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
}

export class NetworkManager {
  private players: Map<string, PlayroomPlayerState> = new Map();
  private playerOrder: string[] = [];
  private callbacks: NetworkCallbacks | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  async createRoom(): Promise<string> {
    const roomCode = this.generateRoomCode();
    await this.connect(roomCode);
    return roomCode;
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    try {
      await this.connect(roomCode);
      return true;
    } catch (e) {
      console.error("[NetworkManager] Failed to join room:", e);
      return false;
    }
  }

  private async connect(roomCode: string): Promise<void> {
    console.log("[NetworkManager] Connecting to room:", roomCode);

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
    console.log("[NetworkManager] Connected! Room code:", getRoomCode());

    // Share room code with platform
    this.shareRoomCode(roomCode);
  }

  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;

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
  }

  startSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      if (!this.connected) return;

      // Host broadcasts game state
      // (This is called by Game.ts, not here - we just poll for inputs)

      // All clients: check for game state updates
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

  // Host broadcasts game state to all clients
  broadcastGameState(state: GameStateSync): void {
    if (!isHost()) return;
    setState("gameState", state, false); // Unreliable for frequent position updates
  }

  // Broadcast important game events (reliable)
  broadcastGamePhase(phase: GameStateSync["phase"]): void {
    if (!isHost()) return;
    setState("gamePhase", phase, true);
  }

  broadcastWinner(winnerId: string): void {
    if (!isHost()) return;
    setState("winnerId", winnerId, true);
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

  disconnect(): void {
    this.stopSync();
    this.shareRoomCode(null);
    this.connected = false;
    // Note: PlayroomKit doesn't have a direct disconnect method
    // The connection will be cleaned up when the page unloads
  }

  private generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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
