import { Client, Room } from "colyseus.js";
import {
  AdvancedSettingsSync,
  GamePhase,
  GameMode,
  GameStateSync,
  PlayerInput,
  PLAYER_COLORS,
  RoundResultPayload,
} from "../../types";
import type {
  NetworkCallbacks,
  NetworkPlayerState,
  NetworkTransport,
  PlayerMeta,
  PlayerMetaMap,
} from "./NetworkTransport";

interface MatchCreateResponse {
  roomCode: string;
  roomId: string;
  seatReservation: unknown;
}

interface MatchJoinResponse extends MatchCreateResponse {}

interface RoomMetaPayload {
  roomCode: string;
  leaderPlayerId: string | null;
  phase: GamePhase;
  mode: string;
  baseMode: string;
  settings: AdvancedSettingsSync["settings"];
}

interface PlayerListPayload {
  order: string[];
  meta: Array<PlayerMeta>;
  hostId: string | null;
  revision: number;
}

class ColyseusPlayerState implements NetworkPlayerState {
  constructor(
    public readonly id: string,
    private meta: PlayerMeta,
  ) {}

  setMeta(meta: PlayerMeta): void {
    this.meta = meta;
  }

  getState(key: string): unknown {
    if (key === "customName") return this.meta.customName;
    if (key === "colorIndex") return this.meta.colorIndex;
    if (key === "botType") return this.meta.botType;
    if (key === "keySlot") return this.meta.keySlot;
    if (key === "kills") return this.meta.kills ?? 0;
    if (key === "roundWins") return this.meta.roundWins ?? 0;
    if (key === "playerState") return this.meta.playerState ?? "ACTIVE";
    return undefined;
  }

  getProfile(): { name?: string } | null {
    return {
      name: this.meta.profileName ?? this.meta.customName,
    };
  }

  isBot(): boolean {
    return Boolean(this.meta.isBot);
  }
}

export class ColyseusTransport implements NetworkTransport {
  private callbacks: NetworkCallbacks | null = null;
  private client: Client | null = null;
  private room: Room | null = null;
  private connected = false;
  private roomCode = "";
  private hostId: string | null = null;
  private myPlayerId: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private playerOrder: string[] = [];
  private playerMetaById: PlayerMetaMap = new Map();
  private playerRefs = new Map<string, ColyseusPlayerState>();

  private readonly wsUrl: string;
  private readonly httpUrl: string;

  constructor() {
    this.wsUrl = this.resolveWsUrl();
    this.httpUrl = this.resolveHttpUrl();
  }

  setCallbacks(callbacks: NetworkCallbacks): void {
    this.callbacks = callbacks;
  }

  async createRoom(): Promise<string> {
    await this.cleanupConnection();
    const playerName = this.readInjectedPlayerName();
    const response = await this.fetchJson<MatchCreateResponse>(
      this.httpUrl + "/match/create",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName }),
      },
    );
    await this.connectSeat(response.seatReservation, response.roomCode);
    this.shareRoomCode(response.roomCode);
    return response.roomCode;
  }

  async joinRoom(roomCode: string): Promise<boolean> {
    await this.cleanupConnection();
    const playerName = this.readInjectedPlayerName();
    try {
      const response = await this.fetchJson<MatchJoinResponse>(
        this.httpUrl + "/match/join",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode, playerName }),
        },
      );
      await this.connectSeat(response.seatReservation, response.roomCode);
      this.shareRoomCode(response.roomCode);
      return true;
    } catch (error) {
      console.error("[ColyseusTransport] Failed to join room", error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.stopSync();
    this.shareRoomCode(null);
    await this.cleanupConnection();
  }

  startSync(): void {
    if (!this.room || this.pingInterval) return;
    this.pingInterval = setInterval(() => {
      if (!this.room) return;
      this.room.send("cmd:ping", { sentAt: performance.now() });
    }, 1000);
  }

  stopSync(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  sendInput(input: PlayerInput): void {
    if (!this.room) return;
    this.room.send("cmd:input", {
      controlledPlayerId: this.myPlayerId ?? undefined,
      buttonA: input.buttonA,
      buttonB: input.buttonB,
      clientTimeMs: input.clientTimeMs,
    });
  }

  pollHostInputs(): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGameState(_state: GameStateSync): void {
    // Server-authoritative in Colyseus mode.
  }

  startGame(): void {
    if (!this.room) return;
    this.room.send("cmd:start_match", {});
  }

  restartGame(): void {
    if (!this.room) return;
    this.room.send("cmd:restart_match", {});
  }

  setMode(mode: GameMode): void {
    if (!this.room || mode === "CUSTOM") return;
    this.room.send("cmd:set_mode", { mode });
  }

  setAdvancedSettings(payload: AdvancedSettingsSync): void {
    if (!this.room) return;
    this.room.send("cmd:set_advanced_settings", payload);
  }

  sendDashRequest(): void {
    if (!this.room) return;
    this.room.send("cmd:dash", {
      controlledPlayerId: this.myPlayerId ?? undefined,
    });
  }

  broadcastDashParticles(
    _playerId: string,
    _x: number,
    _y: number,
    _angle: number,
    _color: string,
  ): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGamePhase(
    _phase: GamePhase,
    _winnerId?: string,
    _winnerName?: string,
  ): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastCountdown(_count: number): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGameSound(_type: string, _playerId: string): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastGameSoundToOthers(_type: string, _playerId: string): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastScreenShake(_intensity: number, _duration: number): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastRoundResult(_payload: RoundResultPayload): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastDevMode(enabled: boolean): void {
    if (!this.room) return;
    this.room.send("cmd:dev_mode", { enabled });
  }

  broadcastAdvancedSettings(payload: AdvancedSettingsSync): void {
    this.setAdvancedSettings(payload);
  }

  broadcastRNGSeed(_baseSeed: number): void {
    // Server-authoritative in Colyseus mode.
  }

  broadcastPlayerList(): void {
    // Server-authoritative in Colyseus mode.
  }

  resyncPlayerListFromState(_reason = "manual", _force = false): boolean {
    if (!this.callbacks) return false;
    this.callbacks.onPlayerListReceived(this.playerOrder, this.playerMetaById);
    return true;
  }

  async resetAllPlayerStates(): Promise<void> {
    if (!this.room) return;
    this.room.send("cmd:restart_match", {});
  }

  updateKills(_playerId: string, _kills: number): void {
    // Server-authoritative in Colyseus mode.
  }

  updateRoundWins(_playerId: string, _wins: number): void {
    // Server-authoritative in Colyseus mode.
  }

  updatePlayerState(
    _playerId: string,
    _state: "ACTIVE" | "EJECTED" | "SPECTATING",
  ): void {
    // Server-authoritative in Colyseus mode.
  }

  setCustomName(name: string): void {
    if (!this.room) return;
    this.room.send("cmd:set_name", { name });
  }

  async addAIBot(): Promise<unknown | null> {
    if (!this.room) return null;
    this.room.send("cmd:add_ai_bot", {});
    return {};
  }

  async addLocalBot(keySlot: number): Promise<unknown | null> {
    if (!this.room) return null;
    this.room.send("cmd:add_local_player", { keySlot });
    return null;
  }

  async removeBot(playerId: string): Promise<boolean> {
    if (!this.room) return false;
    this.room.send("cmd:remove_bot", { playerId });
    return true;
  }

  async kickPlayer(playerId: string): Promise<boolean> {
    if (!this.room) return false;
    this.room.send("cmd:kick_player", { playerId });
    return true;
  }

  getMyPlayerId(): string | null {
    return this.myPlayerId;
  }

  isHost(): boolean {
    return this.myPlayerId !== null && this.hostId === this.myPlayerId;
  }

  isWebRtcConnected(): boolean {
    return false;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  getPlayerCount(): number {
    return this.playerOrder.length;
  }

  getPlayerIds(): string[] {
    return [...this.playerOrder];
  }

  getPlayerIndex(playerId: string): number {
    return this.playerOrder.indexOf(playerId);
  }

  getPlayerColor(playerId: string): { primary: string; glow: string } {
    const meta = this.playerMetaById.get(playerId);
    const index = Number.isFinite(meta?.colorIndex) ? (meta?.colorIndex as number) : 0;
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  getPlayerName(playerId: string): string {
    const meta = this.playerMetaById.get(playerId);
    if (!meta) return "Player";
    return meta.customName ?? meta.profileName ?? "Player";
  }

  getHostId(): string | null {
    return this.hostId;
  }

  isPlayerBot(playerId: string): boolean {
    const meta = this.playerMetaById.get(playerId);
    return Boolean(meta?.isBot);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    const meta = this.playerMetaById.get(playerId);
    return meta?.botType ?? null;
  }

  getPlayerKeySlot(playerId: string): number {
    const meta = this.playerMetaById.get(playerId);
    if (!Number.isFinite(meta?.keySlot)) return -1;
    return meta?.keySlot as number;
  }

  getPlayer(playerId: string): NetworkPlayerState | undefined {
    return this.playerRefs.get(playerId);
  }

  hasRemotePlayers(): boolean {
    for (const id of this.playerOrder) {
      if (id === this.myPlayerId) continue;
      if (!this.isPlayerBot(id)) return true;
    }
    return false;
  }

  getBotCount(): number {
    let count = 0;
    for (const id of this.playerOrder) {
      if (this.isPlayerBot(id)) count += 1;
    }
    return count;
  }

  isSimulationAuthority(): boolean {
    return false;
  }

  supportsLocalPlayers(): boolean {
    return false;
  }

  private async connectSeat(seatReservation: unknown, roomCode: string): Promise<void> {
    this.client = new Client(this.wsUrl);
    this.room = await this.client.consumeSeatReservation(
      seatReservation as Parameters<Client["consumeSeatReservation"]>[0],
    );
    this.connected = true;
    this.roomCode = roomCode;
    this.bindRoomListeners(this.room);
  }

  private bindRoomListeners(room: Room): void {
    room.onLeave(() => {
      this.connected = false;
      this.stopSync();
      this.callbacks?.onDisconnected();
    });

    room.onMessage("evt:self", (payload: { playerId?: string }) => {
      this.myPlayerId = payload.playerId ?? null;
    });

    room.onMessage("evt:room_meta", (payload: RoomMetaPayload) => {
      const previousHost = this.hostId;
      this.hostId = payload.leaderPlayerId ?? null;
      if (previousHost && previousHost !== this.hostId && this.callbacks) {
        this.callbacks.onHostChanged();
      }
    });

    room.onMessage("evt:players", (payload: PlayerListPayload) => {
      this.handlePlayerList(payload);
    });

    room.onMessage(
      "evt:phase",
      (payload: { phase: GamePhase; winnerId?: string; winnerName?: string }) => {
        this.callbacks?.onGamePhaseReceived(
          payload.phase,
          payload.winnerId,
          payload.winnerName,
        );
      },
    );

    room.onMessage("evt:countdown", (count: number) => {
      this.callbacks?.onCountdownReceived(count);
    });

    room.onMessage("evt:snapshot", (payload: GameStateSync) => {
      this.callbacks?.onGameStateReceived(payload);
    });

    room.onMessage(
      "evt:sound",
      (payload: { type: string; playerId: string }) => {
        this.callbacks?.onGameSoundReceived(payload.type, payload.playerId);
      },
    );

    room.onMessage(
      "evt:screen_shake",
      (payload: { intensity: number; duration: number }) => {
        this.callbacks?.onScreenShakeReceived(payload.intensity, payload.duration);
      },
    );

    room.onMessage(
      "evt:dash_particles",
      (payload: {
        playerId: string;
        x: number;
        y: number;
        angle: number;
        color: string;
      }) => {
        this.callbacks?.onDashParticlesReceived?.(payload);
      },
    );

    room.onMessage("evt:advanced_settings", (payload: AdvancedSettingsSync) => {
      this.callbacks?.onAdvancedSettingsReceived(payload);
    });

    room.onMessage("evt:round_result", (payload: RoundResultPayload) => {
      this.callbacks?.onRoundResultReceived(payload);
    });

    room.onMessage(
      "evt:pong",
      (payload: { sentAt: number; serverAt: number }) => {
        const rtt = Math.max(0, performance.now() - payload.sentAt);
        this.callbacks?.onPingReceived(rtt);
      },
    );

    room.onMessage("evt:error", (payload: { code?: string; message?: string }) => {
      const code = payload.code ?? "ERROR";
      const message = payload.message ?? "Network error";
      console.log("[ColyseusTransport]", code, message);
      this.callbacks?.onTransportError?.(code, message);
    });
  }

  private handlePlayerList(payload: PlayerListPayload): void {
    const previousOrder = [...this.playerOrder];
    const previousSet = new Set(previousOrder);
    const nextSet = new Set(payload.order);

    this.playerOrder = [...payload.order];
    this.playerMetaById.clear();

    for (const meta of payload.meta) {
      this.playerMetaById.set(meta.id, meta);
      const existing = this.playerRefs.get(meta.id);
      if (existing) {
        existing.setMeta(meta);
      } else {
        this.playerRefs.set(meta.id, new ColyseusPlayerState(meta.id, meta));
      }
    }

    for (const previousId of previousSet) {
      if (!nextSet.has(previousId)) {
        this.playerRefs.delete(previousId);
        this.callbacks?.onPlayerLeft(previousId);
      }
    }

    payload.order.forEach((playerId, index) => {
      if (!previousSet.has(playerId)) {
        this.callbacks?.onPlayerJoined(playerId, index);
      }
    });

    this.hostId = payload.hostId ?? this.hostId;
    this.callbacks?.onPlayerListReceived(this.playerOrder, this.playerMetaById);
  }

  private async cleanupConnection(): Promise<void> {
    try {
      if (this.room) {
        await this.room.leave(true);
      }
    } catch (error) {
      console.log("[ColyseusTransport] leave failed", error);
    }
    this.connected = false;
    this.room = null;
    this.client = null;
    this.roomCode = "";
    this.hostId = null;
    this.myPlayerId = null;
    this.playerOrder = [];
    this.playerMetaById.clear();
    this.playerRefs.clear();
  }

  private resolveWsUrl(): string {
    const fromWindow = (window as unknown as { __COLYSEUS_WS_URL__?: string })
      .__COLYSEUS_WS_URL__;
    const fromEnv = (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env?.VITE_COLYSEUS_WS_URL;
    if (fromWindow && fromWindow.trim().length > 0) return fromWindow;
    if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
    const proto = window.location.protocol === "https:" ? "wss://" : "ws://";
    return proto + window.location.hostname + ":2567";
  }

  private resolveHttpUrl(): string {
    const fromWindow = (window as unknown as { __MATCH_HTTP_URL__?: string })
      .__MATCH_HTTP_URL__;
    const fromEnv = (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env?.VITE_MATCH_HTTP_URL;
    if (fromWindow && fromWindow.trim().length > 0) return fromWindow;
    if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
    const proto = window.location.protocol === "https:" ? "https://" : "http://";
    return proto + window.location.hostname + ":2567";
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await response.text();
      throw new Error("HTTP " + response.status.toString() + ": " + text);
    }
    return (await response.json()) as T;
  }

  private readInjectedPlayerName(): string | null {
    const name = (window as unknown as { __PLAYER_NAME__?: string }).__PLAYER_NAME__;
    if (typeof name !== "string") return null;
    const normalized = name.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private shareRoomCode(code: string | null): void {
    const win = window as unknown as {
      shareRoomCode?: (code: string | null) => void;
    };
    if (typeof win.shareRoomCode === "function") {
      win.shareRoomCode(code);
    }
  }
}
