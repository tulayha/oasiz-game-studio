import {
  getRoomCode,
  getState,
  insertCoin,
  isHost,
  myPlayer,
  onDisconnect,
  onPlayerJoin,
  setState,
} from "playroomkit";

declare global {
  interface Window {
    __ROOM_CODE__?: string;
    __PLAYER_NAME__?: string;
    __PLAYER_AVATAR__?: string;
    shareRoomCode?: (code: string | null) => void;
    submitScore?: (score: number) => void;
    triggerHaptic?: (
      type: "light" | "medium" | "heavy" | "success" | "error",
    ) => void;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface PingPayload {
  seq: number;
  sentAt: number;
  pad?: string;
}

interface MetricSnapshot {
  last: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
  jitter: number;
  samples: number;
}

interface TrysteroAnnouncePayload {
  pkId: string;
  trId: string;
}

interface PeerLike {
  id: string;
  setState: (key: string, value: unknown, reliable?: boolean) => void;
  getState: (key: string) => unknown;
  onQuit: (cb: () => void) => void;
  leaveRoom?: () => Promise<void>;
  on?: (event: string, cb: () => void) => void;
  off?: (event: string, cb: () => void) => void;
  removeListener?: (event: string, cb: () => void) => void;
  webrtcConnected?: boolean;
}

const SETTINGS_KEY = "p2p-rtt-lab-settings";
const PAYLOAD_PAD_KEY = "p2p-rtt-lab-payload-pad-bytes";
const PLAYROOM_HOST_KEY = "hostId";
const PLAYROOM_PING_KEY = "pkPing";
const PLAYROOM_PONG_KEY = "pkPong";
const TRYSTERO_APP_ID = "oasiz-astro-party-rtt-bench-v1";
const TRYSTERO_TORRENT_RELAYS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.webtorrent.dev",
  "wss://tracker.btorrent.xyz",
];
const TRYSTERO_RELAY_REDUNDANCY = 2;
const MAX_STATS_SAMPLES = 60;
const PING_INTERVAL_MS = 1000;
const MAX_PAD_BYTES = 16384;
const START_BUTTON_LABEL = "Create / Join Benchmark";

function log(scope: string, message: string): void {
  console.log("[" + scope + "]", message);
}

function shareRoomCode(code: string | null): void {
  if (typeof window.shareRoomCode === "function") {
    window.shareRoomCode(code);
  }
}

function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function getRoomCodeFromURL(): string | null {
  const hash = window.location.hash;
  const match = hash.match(/[#&]r=([A-Z0-9]+)/i);
  if (!match) return null;
  return normalizeRoomCode(match[1]);
}

function formatMs(value: number): string {
  return Math.round(value).toString() + " ms";
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function buildPayloadPad(bytes: number): string {
  if (bytes <= 0) return "";
  return "x".repeat(bytes);
}

function loadPayloadPadBytes(): number {
  try {
    const raw = localStorage.getItem(PAYLOAD_PAD_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 0;
    return clampInt(parsed, 0, MAX_PAD_BYTES);
  } catch (_e) {
    log("Payload", "Failed to load payload padding bytes, using default");
    return 0;
  }
}

function savePayloadPadBytes(bytes: number): void {
  const clamped = clampInt(bytes, 0, MAX_PAD_BYTES);
  localStorage.setItem(PAYLOAD_PAD_KEY, clamped.toString());
}

class SettingsStore {
  private settings: Settings;

  constructor() {
    this.settings = this.load();
  }

  private load(): Settings {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved) {
        return { music: true, fx: true, haptics: true };
      }
      const parsed = JSON.parse(saved) as Partial<Settings>;
      return {
        music: parsed.music !== false,
        fx: parsed.fx !== false,
        haptics: parsed.haptics !== false,
      };
    } catch (_e) {
      log("SettingsStore", "Failed to load settings, using defaults");
      return { music: true, fx: true, haptics: true };
    }
  }

  private save(): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
  }

  get(): Settings {
    return { ...this.settings };
  }

  set(key: keyof Settings, value: boolean): void {
    this.settings[key] = value;
    this.save();
  }
}

class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicOsc: OscillatorNode | null = null;
  private musicGain: GainNode | null = null;
  private musicEnabled = false;

  private ensureContext(): void {
    if (this.context) return;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.05;
    this.masterGain.connect(this.context.destination);
  }

  async warmUp(): Promise<void> {
    this.ensureContext();
    if (this.context && this.context.state !== "running") {
      await this.context.resume();
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopMusic();
      return;
    }
    this.startMusic();
  }

  private startMusic(): void {
    this.ensureContext();
    if (!this.context || !this.masterGain || this.musicOsc) return;
    if (this.context.state !== "running") return;

    this.musicOsc = this.context.createOscillator();
    this.musicOsc.type = "triangle";
    this.musicOsc.frequency.value = 110;

    this.musicGain = this.context.createGain();
    this.musicGain.gain.value = this.musicEnabled ? 0.12 : 0;

    this.musicOsc.connect(this.musicGain);
    this.musicGain.connect(this.masterGain);
    this.musicOsc.start();
    log("AudioEngine", "Music started");
  }

  stopMusic(): void {
    if (this.musicOsc) {
      this.musicOsc.stop();
      this.musicOsc.disconnect();
      this.musicOsc = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
  }

  playFx(enabled: boolean): void {
    if (!enabled) return;
    this.ensureContext();
    if (!this.context || !this.masterGain) return;
    if (this.context.state !== "running") return;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "square";
    osc.frequency.value = 420;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(this.masterGain);

    const now = this.context.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.start(now);
    osc.stop(now + 0.09);
  }
}

class StatsAccumulator {
  private samples: number[] = [];
  private totalSamples = 0;

  addSample(sampleMs: number): void {
    const clamped = Math.max(0, sampleMs);
    this.samples.push(clamped);
    if (this.samples.length > MAX_STATS_SAMPLES) {
      this.samples.shift();
    }
    this.totalSamples += 1;
  }

  reset(): void {
    this.samples = [];
    this.totalSamples = 0;
  }

  getTotalSamples(): number {
    return this.totalSamples;
  }

  snapshot(): MetricSnapshot | null {
    if (this.samples.length === 0) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const last = this.samples[this.samples.length - 1];
    const sum = this.samples.reduce((acc, value) => acc + value, 0);
    const avg = sum / this.samples.length;
    const idx = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    const p95 = sorted[idx];
    let jitter = 0;
    if (this.samples.length > 1) {
      let jitterSum = 0;
      for (let i = 1; i < this.samples.length; i += 1) {
        jitterSum += Math.abs(this.samples[i] - this.samples[i - 1]);
      }
      jitter = jitterSum / (this.samples.length - 1);
    }
    return {
      last,
      avg,
      min,
      max,
      p95,
      jitter,
      samples: this.totalSamples,
    };
  }
}

class PlayroomProbe {
  private players = new Map<string, PeerLike>();
  private cleanupFns: Array<() => void> = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private pingSeq = 0;
  private lastPingSentAt = 0;
  private lastEchoSeq = -1;
  private lastSeenPingByPlayer = new Map<string, number>();
  private connected = false;
  private roomCode = "";
  private hostId: string | null = null;
  private transport = "WS";
  private localId: string | null = null;
  private payloadPad = "";

  constructor(
    private readonly onRtt: (rttMs: number) => void,
    private readonly onPlayerCount: (count: number) => void,
    private readonly onHostIdChange: (hostId: string | null) => void,
    private readonly onTransportChange: (label: string) => void,
    private readonly onDisconnected: (reason: string) => void,
  ) {}

  async connect(targetRoomCode: string | null): Promise<string> {
    this.cleanupLocalOnly();

    const options: Record<string, unknown> = {
      skipLobby: true,
      maxPlayersPerRoom: 4,
      defaultPlayerStates: {
        pkPing: null,
        pkPong: null,
      },
    };
    if (targetRoomCode) {
      options.roomCode = targetRoomCode;
    }

    await insertCoin(options);
    this.connected = true;
    this.roomCode = getRoomCode() || targetRoomCode || "";
    log("PlayroomProbe", "Connected with room code " + this.roomCode);
    this.setupListeners();
    return this.roomCode;
  }

  setPayloadPadding(pad: string): void {
    this.payloadPad = pad;
  }

  private setupListeners(): void {
    const me = myPlayer() as unknown as PeerLike | undefined;
    if (me) {
      this.localId = me.id;
      this.players.set(me.id, me);
      this.onPlayerCount(this.players.size);
      this.updateTransportFromPeer(me);
      if (isHost()) {
        this.hostId = me.id;
        setState(PLAYROOM_HOST_KEY, me.id, true);
        this.onHostIdChange(this.hostId);
      } else {
        const stateHost = getState(PLAYROOM_HOST_KEY) as string | undefined;
        this.hostId = stateHost || null;
        this.onHostIdChange(this.hostId);
      }

      if (typeof me.on === "function") {
        const handleConnected = (): void => {
          this.transport = "RTC";
          this.onTransportChange(this.transport);
        };
        me.on("webrtc_connected", handleConnected);
        this.cleanupFns.push(() => {
          if (typeof me.off === "function") {
            me.off("webrtc_connected", handleConnected);
          } else if (typeof me.removeListener === "function") {
            me.removeListener("webrtc_connected", handleConnected);
          }
        });
      }
    }

    this.cleanupFns.push(
      onPlayerJoin((player) => {
        const peer = player as unknown as PeerLike;
        if (this.players.has(peer.id)) return;
        this.players.set(peer.id, peer);
        this.onPlayerCount(this.players.size);
        log("PlayroomProbe", "Player joined " + peer.id);
        peer.onQuit(() => {
          this.players.delete(peer.id);
          this.lastSeenPingByPlayer.delete(peer.id);
          this.onPlayerCount(this.players.size);
          log("PlayroomProbe", "Player left " + peer.id);
        });
      }),
    );

    this.cleanupFns.push(
      onDisconnect((event) => {
        this.connected = false;
        this.stopTick();
        const reason =
          "Disconnected " + String((event as { code?: number }).code ?? "");
        this.onDisconnected(reason);
      }),
    );

    this.tickTimer = setInterval(() => this.tick(), 100);
  }

  private updateTransportFromPeer(peer: PeerLike): void {
    const next = peer.webrtcConnected ? "RTC" : "WS";
    if (next !== this.transport) {
      this.transport = next;
      this.onTransportChange(this.transport);
    }
  }

  private tick(): void {
    if (!this.connected) return;
    const me = myPlayer() as unknown as PeerLike | undefined;
    if (!me) return;
    this.updateTransportFromPeer(me);

    if (isHost()) {
      if (this.hostId !== me.id) {
        this.hostId = me.id;
        setState(PLAYROOM_HOST_KEY, me.id, true);
        this.onHostIdChange(this.hostId);
      }
    } else {
      const stateHost = getState(PLAYROOM_HOST_KEY) as string | undefined;
      if (stateHost && stateHost !== this.hostId) {
        this.hostId = stateHost;
        this.onHostIdChange(this.hostId);
      }
    }

    const now = performance.now();
    const echo = me.getState(PLAYROOM_PONG_KEY) as PingPayload | undefined;
    if (echo && echo.seq !== this.lastEchoSeq) {
      this.lastEchoSeq = echo.seq;
      this.onRtt(Math.max(0, now - echo.sentAt));
    }

    if (isHost()) {
      this.players.forEach((peer, peerId) => {
        const ping = peer.getState(PLAYROOM_PING_KEY) as PingPayload | undefined;
        if (!ping) return;
        const lastSeen = this.lastSeenPingByPlayer.get(peerId);
        if (lastSeen === ping.seq) return;
        this.lastSeenPingByPlayer.set(peerId, ping.seq);
        peer.setState(PLAYROOM_PONG_KEY, ping, false);
      });
    }

    if (now - this.lastPingSentAt < PING_INTERVAL_MS) return;
    this.lastPingSentAt = now;
    this.pingSeq += 1;
    const payload: PingPayload = { seq: this.pingSeq, sentAt: now };
    if (this.payloadPad.length > 0) {
      payload.pad = this.payloadPad;
    }
    me.setState(PLAYROOM_PING_KEY, payload, false);
  }

  private stopTick(): void {
    if (!this.tickTimer) return;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  private cleanupLocalOnly(): void {
    this.stopTick();
    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch (_e) {}
    }
    this.cleanupFns = [];
    this.players.clear();
    this.lastSeenPingByPlayer.clear();
    this.hostId = null;
    this.roomCode = "";
    this.localId = null;
    this.transport = "WS";
    this.pingSeq = 0;
    this.lastEchoSeq = -1;
    this.lastPingSentAt = 0;
    this.connected = false;
  }

  async disconnect(): Promise<void> {
    const me = myPlayer() as unknown as PeerLike | undefined;
    this.cleanupLocalOnly();
    if (me && typeof me.leaveRoom === "function") {
      try {
        await me.leaveRoom();
      } catch (_e) {
        log("PlayroomProbe", "Error while leaving room");
      }
    }
  }

  getRoomCode(): string {
    return this.roomCode || getRoomCode() || "";
  }

  getHostId(): string | null {
    return this.hostId;
  }

  getLocalId(): string | null {
    return this.localId;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getTransportLabel(): string {
    return this.transport;
  }
}

class TrysteroProbe {
  private moduleRef: Record<string, unknown> | null = null;
  private room: Record<string, unknown> | null = null;
  private cleanupFns: Array<() => void> = [];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private announceTimer: ReturnType<typeof setInterval> | null = null;
  private lastNativePingSentAt = 0;
  private lastManualPingSentAt = 0;
  private manualSeq = 0;
  private lastManualEchoSeq = -1;
  private localPlayroomId = "";
  private localTrysteroId = "";
  private hostPlayroomId: string | null = null;
  private hostTrysteroId: string | null = null;
  private nativeStatus = "Not connected";
  private manualStatus = "Not connected";
  private peerIdToPlayroomId = new Map<string, string>();
  private playroomIdToPeerId = new Map<string, string>();
  private pendingManualPingByPeer = new Map<string, PingPayload>();
  private lastHandledManualPingSeqByPeer = new Map<string, number>();
  private latestManualPong: PingPayload | null = null;
  private sendAnnounce: ((payload: TrysteroAnnouncePayload) => void) | null =
    null;
  private sendStatePing: ((payload: PingPayload, peerId?: string) => void) | null =
    null;
  private sendStatePong: ((payload: PingPayload, peerId?: string) => void) | null =
    null;
  private getHostPlayroomId: () => string | null = () => null;
  private payloadPad = "";

  constructor(
    private readonly onBuiltinRtt: (rttMs: number) => void,
    private readonly onManualRtt: (rttMs: number) => void,
  ) {}

  private setNativeStatus(next: string): void {
    if (next === this.nativeStatus) return;
    this.nativeStatus = next;
    log("TrysteroProbe", "Native: " + next);
  }

  private setManualStatus(next: string): void {
    if (next === this.manualStatus) return;
    this.manualStatus = next;
    log("TrysteroProbe", "Manual: " + next);
  }

  async connect(
    playroomRoomCode: string,
    localPlayroomId: string,
    getHostPlayroomId: () => string | null,
  ): Promise<void> {
    await this.disconnect();
    this.localPlayroomId = localPlayroomId;
    this.getHostPlayroomId = getHostPlayroomId;
    this.hostPlayroomId = getHostPlayroomId();

    const moduleRef = (await import("trystero/torrent")) as unknown as Record<
      string,
      unknown
    >;
    this.moduleRef = moduleRef;
    type JoinRoomFn = (
      config: Record<string, unknown>,
      roomId: string,
      onJoinError?: (details: { error?: string }) => void,
    ) => unknown;
    const joinRoomFn =
      (moduleRef.joinRoom as JoinRoomFn | undefined) ||
      ((moduleRef.default as Record<string, unknown> | undefined)?.joinRoom as
        | JoinRoomFn
        | undefined);
    if (typeof joinRoomFn !== "function") {
      throw new Error("Could not resolve Trystero joinRoom");
    }

    const roomName = "rtt-" + playroomRoomCode;
    const room = joinRoomFn(
      {
        appId: TRYSTERO_APP_ID,
        relayUrls: TRYSTERO_TORRENT_RELAYS,
        relayRedundancy: TRYSTERO_RELAY_REDUNDANCY,
      },
      roomName,
      (details: { error?: string }) => {
        const errorMessage = details?.error || "unknown join error";
        this.setNativeStatus("Join error: " + errorMessage);
        this.setManualStatus("Join error: " + errorMessage);
      },
    ) as Record<
      string,
      unknown
    >;
    this.room = room;
    this.resolveLocalTrysteroId();
    this.bindRoomActions();
    this.sendAnnounceNow();
    this.announceTimer = setInterval(() => this.sendAnnounceNow(), 2000);
    this.tickTimer = setInterval(() => this.tick(), 100);
    this.setNativeStatus("Connected to Trystero room " + roomName);
    this.setManualStatus("Manual ping channel initializing");
  }

  setPayloadPadding(pad: string): void {
    this.payloadPad = pad;
  }

  private resolveActionPair(actionResult: unknown): {
    send: (payload: unknown, peerId?: string) => void;
    receive: (
      cb: (payload: Record<string, unknown>, peerId: string) => void,
    ) => unknown;
  } {
    if (!Array.isArray(actionResult) || actionResult.length < 2) {
      throw new Error("Unexpected Trystero action pair");
    }
    return {
      send: actionResult[0] as (payload: unknown, peerId?: string) => void,
      receive: actionResult[1] as (
        cb: (payload: Record<string, unknown>, peerId: string) => void,
      ) => unknown,
    };
  }

  private bindRoomActions(): void {
    if (!this.room) return;
    const makeAction = this.room.makeAction as
      | ((name: string) => unknown)
      | undefined;
    if (typeof makeAction !== "function") {
      throw new Error("Trystero room has no makeAction");
    }

    const announcePair = this.resolveActionPair(makeAction("announce"));
    this.sendAnnounce = (payload: TrysteroAnnouncePayload): void => {
      announcePair.send(payload);
    };
    const announceCleanup = announcePair.receive((payload, peerId) => {
      const playroomId = String(payload.pkId || "");
      if (!playroomId) return;
      this.peerIdToPlayroomId.set(peerId, playroomId);
      this.playroomIdToPeerId.set(playroomId, peerId);
      this.hostPlayroomId = this.getHostPlayroomId();
      if (this.hostPlayroomId && playroomId === this.hostPlayroomId) {
        this.hostTrysteroId = peerId;
      }
    });
    if (typeof announceCleanup === "function") {
      this.cleanupFns.push(announceCleanup as () => void);
    }

    const statePingPair = this.resolveActionPair(makeAction("statePing"));
    this.sendStatePing = (payload: PingPayload, peerId?: string): void => {
      statePingPair.send(payload, peerId);
    };
    const statePingCleanup = statePingPair.receive((payload, peerId) => {
      const seq = Number(payload.seq);
      const sentAt = Number(payload.sentAt);
      if (!Number.isFinite(seq) || !Number.isFinite(sentAt)) return;
      const pingPayload: PingPayload = { seq, sentAt };
      if (typeof payload.pad === "string" && payload.pad.length > 0) {
        pingPayload.pad = payload.pad;
      }
      this.pendingManualPingByPeer.set(peerId, pingPayload);
    });
    if (typeof statePingCleanup === "function") {
      this.cleanupFns.push(statePingCleanup as () => void);
    }

    const statePongPair = this.resolveActionPair(makeAction("statePong"));
    this.sendStatePong = (payload: PingPayload, peerId?: string): void => {
      statePongPair.send(payload, peerId);
    };
    const statePongCleanup = statePongPair.receive((payload) => {
      const seq = Number(payload.seq);
      const sentAt = Number(payload.sentAt);
      if (!Number.isFinite(seq) || !Number.isFinite(sentAt)) return;
      this.latestManualPong = { seq, sentAt };
    });
    if (typeof statePongCleanup === "function") {
      this.cleanupFns.push(statePongCleanup as () => void);
    }

    const onPeerJoin = this.room.onPeerJoin as
      | ((cb: (peerId: string) => void) => unknown)
      | undefined;
    if (typeof onPeerJoin === "function") {
      const cleanup = onPeerJoin((peerId: string) => {
        this.resolveLocalTrysteroId();
        log("TrysteroProbe", "Peer joined " + peerId);
        this.sendAnnounceNow();
      });
      if (typeof cleanup === "function") {
        this.cleanupFns.push(cleanup as () => void);
      }
    }

    const onPeerLeave = this.room.onPeerLeave as
      | ((cb: (peerId: string) => void) => unknown)
      | undefined;
    if (typeof onPeerLeave === "function") {
      const cleanup = onPeerLeave((peerId: string) => {
        const playroomId = this.peerIdToPlayroomId.get(peerId);
        this.peerIdToPlayroomId.delete(peerId);
        if (playroomId) {
          this.playroomIdToPeerId.delete(playroomId);
          if (this.hostPlayroomId && playroomId === this.hostPlayroomId) {
            this.hostTrysteroId = null;
          }
        }
        log("TrysteroProbe", "Peer left " + peerId);
      });
      if (typeof cleanup === "function") {
        this.cleanupFns.push(cleanup as () => void);
      }
    }
  }

  private resolveLocalTrysteroId(): void {
    if (!this.room || this.localTrysteroId) return;
    const roomSelf = this.room.selfId;
    if (typeof roomSelf === "string" && roomSelf.length > 0) {
      this.localTrysteroId = roomSelf;
      return;
    }
    if (!this.moduleRef) return;
    const moduleSelf = this.moduleRef.selfId;
    if (typeof moduleSelf === "function") {
      const resolved = moduleSelf();
      if (typeof resolved === "string" && resolved.length > 0) {
        this.localTrysteroId = resolved;
        return;
      }
    }
    if (typeof moduleSelf === "string" && moduleSelf.length > 0) {
      this.localTrysteroId = moduleSelf;
    }
  }

  private sendAnnounceNow(): void {
    this.resolveLocalTrysteroId();
    if (!this.sendAnnounce) return;
    this.sendAnnounce({
      pkId: this.localPlayroomId,
      trId: this.localTrysteroId || "",
    });
  }

  private tick(): void {
    const hostPlayroomId = this.getHostPlayroomId();
    this.hostPlayroomId = hostPlayroomId;
    this.resolveLocalTrysteroId();
    this.processManualPongForClient();

    if (!hostPlayroomId) {
      this.setNativeStatus("Waiting for Playroom host id");
      this.setManualStatus("Waiting for Playroom host id");
      return;
    }
    if (hostPlayroomId === this.localPlayroomId) {
      this.hostTrysteroId = this.localTrysteroId || null;
      this.setNativeStatus("Local peer is host");
      this.processManualPingQueueForHost();
      if (this.sendStatePong) {
        this.setManualStatus("Local peer is host");
      } else {
        this.setManualStatus("Waiting for manual ping channel");
      }
      return;
    }

    const mappedHostPeer = this.playroomIdToPeerId.get(hostPlayroomId);
    this.hostTrysteroId = mappedHostPeer || null;
    if (!this.hostTrysteroId) {
      this.setNativeStatus("Waiting for host Trystero mapping");
      this.setManualStatus("Waiting for host Trystero mapping");
      return;
    }

    const roomPing = this.room?.ping as ((peerId: string) => Promise<number>) | undefined;
    if (typeof roomPing !== "function") {
      this.setNativeStatus("Waiting for Trystero ping API");
    } else {
      const now = performance.now();
      if (now - this.lastNativePingSentAt >= PING_INTERVAL_MS) {
        this.lastNativePingSentAt = now;
        void roomPing(this.hostTrysteroId)
          .then((rtt) => {
            if (Number.isFinite(rtt)) {
              this.onBuiltinRtt(Math.max(0, rtt));
              this.setNativeStatus("Measuring RTT to host");
            }
          })
          .catch((_e) => {
            if (this.hostTrysteroId) {
              this.setNativeStatus("Ping failed, retrying");
            }
          });
      }
    }

    if (!this.sendStatePing) {
      this.setManualStatus("Waiting for manual ping channel");
      return;
    }

    const now = performance.now();
    if (now - this.lastManualPingSentAt < PING_INTERVAL_MS) {
      return;
    }
    this.lastManualPingSentAt = now;
    this.manualSeq += 1;
    const payload: PingPayload = { seq: this.manualSeq, sentAt: now };
    if (this.payloadPad.length > 0) {
      payload.pad = this.payloadPad;
    }
    this.sendStatePing(payload, this.hostTrysteroId);
    this.setManualStatus("Waiting for host echo");
  }

  private processManualPongForClient(): void {
    if (!this.latestManualPong) return;
    const pong = this.latestManualPong;
    if (pong.seq === this.lastManualEchoSeq) return;
    this.lastManualEchoSeq = pong.seq;
    this.onManualRtt(Math.max(0, performance.now() - pong.sentAt));
    this.setManualStatus("Measuring RTT to host");
  }

  private processManualPingQueueForHost(): void {
    if (!this.sendStatePong) return;
    this.pendingManualPingByPeer.forEach((payload, peerId) => {
      const lastHandled = this.lastHandledManualPingSeqByPeer.get(peerId);
      if (lastHandled === payload.seq) return;
      this.lastHandledManualPingSeqByPeer.set(peerId, payload.seq);
      this.sendStatePong?.(payload, peerId);
    });
  }

  async disconnect(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }
    for (const cleanup of this.cleanupFns) {
      try {
        cleanup();
      } catch (_e) {}
    }
    this.cleanupFns = [];

    if (this.room) {
      const leave = this.room.leave as (() => unknown) | undefined;
      if (typeof leave === "function") {
        try {
          await Promise.resolve(leave());
        } catch (_e) {
          log("TrysteroProbe", "Error while leaving room");
        }
      }
    }

    this.room = null;
    this.moduleRef = null;
    this.sendAnnounce = null;
    this.sendStatePing = null;
    this.sendStatePong = null;
    this.localPlayroomId = "";
    this.localTrysteroId = "";
    this.hostPlayroomId = null;
    this.hostTrysteroId = null;
    this.nativeStatus = "Not connected";
    this.manualStatus = "Not connected";
    this.peerIdToPlayroomId.clear();
    this.playroomIdToPeerId.clear();
    this.pendingManualPingByPeer.clear();
    this.lastHandledManualPingSeqByPeer.clear();
    this.latestManualPong = null;
    this.lastNativePingSentAt = 0;
    this.lastManualPingSentAt = 0;
    this.manualSeq = 0;
    this.lastManualEchoSeq = -1;
  }

  getLocalTrysteroId(): string {
    return this.localTrysteroId || "-";
  }

  getHostTrysteroId(): string {
    return this.hostTrysteroId || "-";
  }

  getBuiltinStatus(): string {
    return this.nativeStatus;
  }

  getManualStatus(): string {
    return this.manualStatus;
  }
}

class BackgroundRenderer {
  private t = 0;
  private w = 0;
  private h = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  step(ms: number): void {
    this.t += ms * 0.001;
    this.draw();
  }

  draw(): void {
    const g = this.ctx.createLinearGradient(0, 0, this.w, this.h);
    g.addColorStop(0, "#041019");
    g.addColorStop(0.5, "#0a2e3d");
    g.addColorStop(1, "#103d4a");
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.w, this.h);

    this.ctx.globalAlpha = 0.24;
    for (let i = 0; i < 4; i += 1) {
      const yBase = this.h * (0.25 + i * 0.16);
      this.ctx.beginPath();
      for (let x = 0; x <= this.w; x += 14) {
        const y =
          yBase +
          Math.sin(this.t * 0.9 + i * 0.8 + x * 0.009) * (12 + i * 3) +
          Math.cos(this.t * 0.5 + x * 0.004) * 6;
        if (x === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.strokeStyle = "rgba(158, 230, 247, 0.35)";
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
    this.ctx.globalAlpha = 1;
  }
}

interface UIElements {
  startScreen: HTMLElement;
  startButton: HTMLButtonElement;
  startError: HTMLElement;
  roomCodeInput: HTMLInputElement;
  leaveButton: HTMLButtonElement;
  settingsButton: HTMLButtonElement;
  settingsModal: HTMLElement;
  settingsBackdrop: HTMLElement;
  settingsClose: HTMLButtonElement;
  toggleMusic: HTMLButtonElement;
  toggleFx: HTMLButtonElement;
  toggleHaptics: HTMLButtonElement;
  sessionPanel: HTMLElement;
  playroomMain: HTMLElement;
  playroomSub: HTMLElement;
  trysteroNativeMain: HTMLElement;
  trysteroNativeSub: HTMLElement;
  trysteroManualMain: HTMLElement;
  trysteroManualSub: HTMLElement;
  roomCodeValue: HTMLElement;
  playerCountValue: HTMLElement;
  payloadBytesValue: HTMLElement;
  payloadBytesInput: HTMLInputElement;
  payloadApplyButton: HTMLButtonElement;
  transportValue: HTMLElement;
  hostPlayroomValue: HTMLElement;
  hostTrysteroValue: HTMLElement;
  localIdsValue: HTMLElement;
}

class AppController {
  private readonly settingsStore = new SettingsStore();
  private readonly audioEngine = new AudioEngine();
  private readonly playroomStats = new StatsAccumulator();
  private readonly trysteroNativeStats = new StatsAccumulator();
  private readonly trysteroManualStats = new StatsAccumulator();
  private readonly playroomProbe: PlayroomProbe;
  private readonly trysteroProbe: TrysteroProbe;
  private readonly ui: UIElements;
  private readonly background: BackgroundRenderer;

  private sessionActive = false;
  private roomCode = "-";
  private playerCount = 0;
  private transport = "WS";
  private hostPlayroomId: string | null = null;
  private scoreSubmitted = false;
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private rafId = 0;
  private lastFrameAt = performance.now();
  private payloadPadBytes = 0;
  private payloadPad = "";

  constructor() {
    const canvas = document.getElementById("bg-canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is required");
    }
    this.background = new BackgroundRenderer(canvas, ctx);

    this.ui = {
      startScreen: document.getElementById("start-screen") as HTMLElement,
      startButton: document.getElementById("start-btn") as HTMLButtonElement,
      startError: document.getElementById("start-error") as HTMLElement,
      roomCodeInput: document.getElementById("room-code-input") as HTMLInputElement,
      leaveButton: document.getElementById("leave-btn") as HTMLButtonElement,
      settingsButton: document.getElementById("settings-btn") as HTMLButtonElement,
      settingsModal: document.getElementById("settings-modal") as HTMLElement,
      settingsBackdrop: document.getElementById("settings-backdrop") as HTMLElement,
      settingsClose: document.getElementById("settings-close") as HTMLButtonElement,
      toggleMusic: document.getElementById("toggle-music") as HTMLButtonElement,
      toggleFx: document.getElementById("toggle-fx") as HTMLButtonElement,
      toggleHaptics: document.getElementById("toggle-haptics") as HTMLButtonElement,
      sessionPanel: document.getElementById("session-panel") as HTMLElement,
      playroomMain: document.getElementById("playroom-rtt-main") as HTMLElement,
      playroomSub: document.getElementById("playroom-rtt-sub") as HTMLElement,
      trysteroNativeMain: document.getElementById("trystero-native-rtt-main") as HTMLElement,
      trysteroNativeSub: document.getElementById("trystero-native-rtt-sub") as HTMLElement,
      trysteroManualMain: document.getElementById("trystero-manual-rtt-main") as HTMLElement,
      trysteroManualSub: document.getElementById("trystero-manual-rtt-sub") as HTMLElement,
      roomCodeValue: document.getElementById("room-code-value") as HTMLElement,
      playerCountValue: document.getElementById("player-count-value") as HTMLElement,
      payloadBytesValue: document.getElementById("payload-bytes-value") as HTMLElement,
      payloadBytesInput: document.getElementById("payload-bytes-input") as HTMLInputElement,
      payloadApplyButton: document.getElementById("payload-apply-btn") as HTMLButtonElement,
      transportValue: document.getElementById("playroom-transport-value") as HTMLElement,
      hostPlayroomValue: document.getElementById("host-playroom-value") as HTMLElement,
      hostTrysteroValue: document.getElementById("host-trystero-value") as HTMLElement,
      localIdsValue: document.getElementById("local-ids-value") as HTMLElement,
    };

    this.playroomProbe = new PlayroomProbe(
      (rttMs) => this.playroomStats.addSample(rttMs),
      (count) => {
        this.playerCount = count;
      },
      (hostId) => {
        this.hostPlayroomId = hostId;
      },
      (label) => {
        this.transport = label;
      },
      (_reason) => {
        this.handleRemoteDisconnect();
      },
    );
    this.trysteroProbe = new TrysteroProbe(
      (rttMs) => {
        this.trysteroNativeStats.addSample(rttMs);
      },
      (rttMs) => {
        this.trysteroManualStats.addSample(rttMs);
      },
    );
    this.applyPayloadPad(loadPayloadPadBytes(), false);
  }

  init(): void {
    this.setupBackground();
    this.bindUI();
    this.applySettingsUI();
    this.showStartScreen();
    this.updateUI();
    this.setupTextHooks();

    const injectedCode = window.__ROOM_CODE__
      ? normalizeRoomCode(window.__ROOM_CODE__)
      : null;
    const urlCode = getRoomCodeFromURL();
    const autoCode = injectedCode || urlCode;
    if (autoCode) {
      this.startSession(autoCode);
    }
  }

  private setupTextHooks(): void {
    window.render_game_to_text = () => {
      const payload = {
        mode: this.sessionActive ? "SESSION" : "START",
        roomCode: this.roomCode,
        transport: this.transport,
        playerCount: this.playerCount,
        payloadPadBytes: this.payloadPadBytes,
        playroom: this.playroomStats.snapshot(),
        trysteroNative: this.trysteroNativeStats.snapshot(),
        trysteroManual: this.trysteroManualStats.snapshot(),
        hostPlayroomId: this.hostPlayroomId,
        hostTrysteroId: this.trysteroProbe.getHostTrysteroId(),
        localIds: {
          playroom: this.playroomProbe.getLocalId(),
          trystero: this.trysteroProbe.getLocalTrysteroId(),
        },
      };
      return JSON.stringify(payload);
    };
    window.advanceTime = (ms: number) => {
      this.background.step(ms);
    };
  }

  private setupBackground(): void {
    const resizeCanvas = (): void => {
      this.background.resize(window.innerWidth, window.innerHeight);
      this.background.draw();
    };
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    const animate = (): void => {
      const now = performance.now();
      const delta = Math.min(50, now - this.lastFrameAt);
      this.lastFrameAt = now;
      this.background.step(delta);
      this.rafId = window.requestAnimationFrame(animate);
    };
    this.lastFrameAt = performance.now();
    this.rafId = window.requestAnimationFrame(animate);
  }

  private bindUI(): void {
    this.ui.roomCodeInput.addEventListener("input", () => {
      this.ui.roomCodeInput.value = normalizeRoomCode(this.ui.roomCodeInput.value);
    });

    this.ui.startButton.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      const requestedCode = normalizeRoomCode(this.ui.roomCodeInput.value);
      await this.startSession(requestedCode || null);
    });

    this.ui.leaveButton.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      await this.leaveSession(true);
    });

    this.ui.settingsButton.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      this.openSettings();
    });

    this.ui.settingsBackdrop.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      this.closeSettings();
    });

    this.ui.settingsClose.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      this.closeSettings();
    });

    this.ui.toggleMusic.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      const current = this.settingsStore.get();
      this.settingsStore.set("music", !current.music);
      this.applySettingsUI();
    });

    this.ui.toggleFx.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      const current = this.settingsStore.get();
      this.settingsStore.set("fx", !current.fx);
      this.applySettingsUI();
    });

    this.ui.toggleHaptics.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      const current = this.settingsStore.get();
      this.settingsStore.set("haptics", !current.haptics);
      this.applySettingsUI();
    });

    this.ui.payloadBytesInput.addEventListener("input", () => {
      const value = Number.parseInt(this.ui.payloadBytesInput.value || "0", 10);
      const clamped = Number.isFinite(value)
        ? clampInt(value, 0, MAX_PAD_BYTES)
        : 0;
      this.ui.payloadBytesInput.value = clamped.toString();
    });

    this.ui.payloadApplyButton.addEventListener("click", async () => {
      await this.handleUserTap();
      this.tapFeedback();
      const nextBytes = this.readPayloadInputBytes();
      this.applyPayloadPad(nextBytes, true);
    });

    this.ui.payloadBytesInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      await this.handleUserTap();
      this.tapFeedback();
      const nextBytes = this.readPayloadInputBytes();
      this.applyPayloadPad(nextBytes, true);
    });

    window.addEventListener("beforeunload", () => {
      shareRoomCode(null);
    });
  }

  private tapFeedback(): void {
    const settings = this.settingsStore.get();
    this.audioEngine.playFx(settings.fx);
    if (settings.haptics && typeof window.triggerHaptic === "function") {
      window.triggerHaptic("light");
    }
  }

  private async handleUserTap(): Promise<void> {
    try {
      await this.audioEngine.warmUp();
    } catch (_e) {
      log("AppController", "Audio warmup failed");
    }
  }

  private readPayloadInputBytes(): number {
    const raw = Number.parseInt(this.ui.payloadBytesInput.value || "0", 10);
    if (!Number.isFinite(raw)) return 0;
    return clampInt(raw, 0, MAX_PAD_BYTES);
  }

  private applyPayloadPad(bytes: number, persist: boolean): void {
    const clamped = clampInt(bytes, 0, MAX_PAD_BYTES);
    this.payloadPadBytes = clamped;
    this.payloadPad = buildPayloadPad(clamped);
    this.playroomProbe.setPayloadPadding(this.payloadPad);
    this.trysteroProbe.setPayloadPadding(this.payloadPad);
    this.ui.payloadBytesInput.value = clamped.toString();
    this.ui.payloadBytesValue.textContent = clamped.toString();
    if (persist) {
      savePayloadPadBytes(clamped);
      log("Payload", "Set payload pad bytes to " + clamped.toString());
    }
  }

  private applySettingsUI(): void {
    const settings = this.settingsStore.get();
    this.ui.toggleMusic.classList.toggle("active", settings.music);
    this.ui.toggleFx.classList.toggle("active", settings.fx);
    this.ui.toggleHaptics.classList.toggle("active", settings.haptics);
    this.audioEngine.setMusicEnabled(settings.music && this.sessionActive);
  }

  private openSettings(): void {
    this.ui.settingsModal.classList.remove("hidden");
    this.ui.settingsBackdrop.classList.remove("hidden");
  }

  private closeSettings(): void {
    this.ui.settingsModal.classList.add("hidden");
    this.ui.settingsBackdrop.classList.add("hidden");
  }

  private showStartScreen(): void {
    this.ui.startScreen.classList.remove("hidden");
    this.ui.leaveButton.classList.add("hidden");
    this.ui.settingsButton.classList.add("hidden");
    this.ui.sessionPanel.classList.add("hidden");
    this.closeSettings();
    this.ui.startButton.disabled = false;
  }

  private showSessionScreen(): void {
    this.ui.startScreen.classList.add("hidden");
    this.ui.leaveButton.classList.remove("hidden");
    this.ui.settingsButton.classList.remove("hidden");
    this.ui.sessionPanel.classList.remove("hidden");
  }

  private async startSession(inputRoomCode: string | null): Promise<void> {
    if (this.sessionActive) return;
    this.ui.startError.textContent = "";
    this.ui.startButton.disabled = true;
    this.ui.startButton.textContent = "Connecting...";

    try {
      const connectedRoomCode = await this.playroomProbe.connect(inputRoomCode);
      this.roomCode = await this.resolveRoomCode(connectedRoomCode);
      if (!this.roomCode) {
        throw new Error("Playroom room code unavailable");
      }
      shareRoomCode(this.roomCode);

      const localPlayroomId = this.playroomProbe.getLocalId();
      if (!localPlayroomId) {
        throw new Error("Playroom local player id unavailable");
      }

      await this.trysteroProbe.connect(this.roomCode, localPlayroomId, () =>
        this.playroomProbe.getHostId(),
      );

      this.playroomStats.reset();
      this.trysteroNativeStats.reset();
      this.trysteroManualStats.reset();
      this.playerCount = this.playroomProbe.getPlayerCount();
      this.transport = this.playroomProbe.getTransportLabel();
      this.hostPlayroomId = this.playroomProbe.getHostId();
      this.sessionActive = true;
      this.scoreSubmitted = false;
      this.showSessionScreen();
      this.applySettingsUI();
      this.startRenderLoop();
      log("AppController", "Session started");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not connect to benchmark room";
      this.ui.startError.textContent = message;
      await this.leaveSession(false);
    } finally {
      this.ui.startButton.disabled = false;
      this.ui.startButton.textContent = START_BUTTON_LABEL;
    }
  }

  private async resolveRoomCode(initialCode: string): Promise<string> {
    let code = initialCode || this.playroomProbe.getRoomCode();
    if (code) return code;

    for (let i = 0; i < 100; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      code = this.playroomProbe.getRoomCode();
      if (code) return code;
    }
    return "";
  }

  private async leaveSession(submitFinalScore: boolean): Promise<void> {
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }

    if (this.sessionActive && submitFinalScore) {
      this.submitFinalScoreOnce();
    }

    this.sessionActive = false;
    this.roomCode = "-";
    this.playerCount = 0;
    this.transport = "WS";
    this.hostPlayroomId = null;
    this.playroomStats.reset();
    this.trysteroNativeStats.reset();
    this.trysteroManualStats.reset();

    await this.trysteroProbe.disconnect();
    await this.playroomProbe.disconnect();
    shareRoomCode(null);
    this.applySettingsUI();
    this.showStartScreen();
    this.updateUI();
    log("AppController", "Session stopped");
  }

  private handleRemoteDisconnect(): void {
    this.leaveSession(false);
  }

  private submitFinalScoreOnce(): void {
    if (this.scoreSubmitted) return;
    this.scoreSubmitted = true;
    const score =
      this.playroomStats.getTotalSamples() +
      this.trysteroNativeStats.getTotalSamples() +
      this.trysteroManualStats.getTotalSamples();
    log("AppController", "Submitting final score " + score.toString());
    if (typeof window.submitScore === "function") {
      window.submitScore(Math.max(0, Math.floor(score)));
    }
    if (typeof window.triggerHaptic === "function") {
      const settings = this.settingsStore.get();
      if (settings.haptics) {
        window.triggerHaptic("error");
      }
    }
  }

  private startRenderLoop(): void {
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
    }
    this.renderTimer = setInterval(() => this.updateUI(), 250);
    this.updateUI();
  }

  private updateCard(
    targetMain: HTMLElement,
    targetSub: HTMLElement,
    snapshot: MetricSnapshot | null,
    fallbackReason: string,
  ): void {
    if (!snapshot) {
      targetMain.textContent = "N/A";
      targetSub.textContent = fallbackReason;
      return;
    }

    targetMain.textContent = formatMs(snapshot.last);
    targetSub.textContent =
      "avg " +
      formatMs(snapshot.avg) +
      " | min " +
      formatMs(snapshot.min) +
      " | max " +
      formatMs(snapshot.max) +
      " | p95 " +
      formatMs(snapshot.p95) +
      " | jit " +
      formatMs(snapshot.jitter) +
      " | n " +
      snapshot.samples.toString();
  }

  private updateUI(): void {
    this.ui.roomCodeValue.textContent = this.roomCode;
    this.ui.playerCountValue.textContent = this.playerCount.toString();
    this.ui.transportValue.textContent = this.transport;
    this.ui.hostPlayroomValue.textContent = this.hostPlayroomId || "-";
    this.ui.hostTrysteroValue.textContent = this.trysteroProbe.getHostTrysteroId();
    this.ui.localIdsValue.textContent =
      "PK " +
      (this.playroomProbe.getLocalId() || "-") +
      " | TR " +
      this.trysteroProbe.getLocalTrysteroId();

    this.updateCard(
      this.ui.playroomMain,
      this.ui.playroomSub,
      this.playroomStats.snapshot(),
      "Waiting for Playroom echo samples",
    );
    this.updateCard(
      this.ui.trysteroNativeMain,
      this.ui.trysteroNativeSub,
      this.trysteroNativeStats.snapshot(),
      this.trysteroProbe.getBuiltinStatus(),
    );
    this.updateCard(
      this.ui.trysteroManualMain,
      this.ui.trysteroManualSub,
      this.trysteroManualStats.snapshot(),
      this.trysteroProbe.getManualStatus(),
    );
  }

  async destroy(): Promise<void> {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    await this.leaveSession(false);
  }
}

const app = new AppController();
app.init();
