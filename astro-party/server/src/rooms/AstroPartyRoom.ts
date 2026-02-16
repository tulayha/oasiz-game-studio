import { Client, Room } from "colyseus";
import {
  AstroPartySimulation,
} from "../../../shared/sim/AstroPartySimulation.js";
import type {
  AdvancedSettingsSync,
  AsteroidColliderSync,
  GamePhase,
  PlayerListPayload,
  RoomMetaPayload,
  RoundResultPayload,
  SnapshotPayload,
} from "../../../shared/sim/types.js";
import { ASTEROID_COLLIDER_VERTEX_SCALE } from "../../../shared/sim/types.js";
import { unregisterRoomCodeByRoomId } from "../http/roomCodeRegistry.js";
import {
  AstroPartyRoomState,
  RoomPlayerMetaState,
} from "./AstroPartyRoomState.js";

interface CreateOptions {
  roomCode?: string;
  maxPlayers?: number;
  simTickHz?: number;
  snapshotHz?: number;
}

interface PlayerInputMessage {
  controlledPlayerId?: string;
  buttonA: boolean;
  buttonB: boolean;
  clientTimeMs?: number;
  inputSequence?: number;
  rttMs?: number;
}

interface DashMessage {
  controlledPlayerId?: string;
}

interface SetModeMessage {
  mode: "STANDARD" | "SANE" | "CHAOTIC" | "CUSTOM";
}
interface SetMapMessage {
  mapId: number;
}

interface SetAdvancedSettingsMessage extends AdvancedSettingsSync {}
interface SetDevModeMessage {
  enabled: boolean;
}
interface DevGrantPowerUpMessage {
  type:
    | "LASER"
    | "SHIELD"
    | "SCATTER"
    | "MINE"
    | "REVERSE"
    | "JOUST"
    | "HOMING_MISSILE"
    | "SPAWN_RANDOM";
}

export class AstroPartyRoom extends Room<AstroPartyRoomState> {
  maxClients = 4;
  private simulation!: AstroPartySimulation;
  private latestSnapshot: SnapshotPayload | null = null;
  private simAccumulatorMs = 0;
  private asteroidColliderById = new Map<string, number[]>();
  private asteroidColliderSentBySession = new Map<string, Set<string>>();

  async onCreate(options: CreateOptions): Promise<void> {
    const roomCode = options.roomCode ?? "----";
    const maxPlayers = options.maxPlayers ?? 4;
    const simTickHz = options.simTickHz ?? 60;
    const snapshotHz = options.snapshotHz ?? 24;
    const tickDurationMs = 1000 / simTickHz;

    this.maxClients = maxPlayers;
    this.setState(new AstroPartyRoomState());
    this.state.roomCode = roomCode;

    this.simulation = new AstroPartySimulation(
      roomCode,
      maxPlayers,
      tickDurationMs,
      {
        onPlayers: (payload: PlayerListPayload) => {
          this.applyPlayerListState(payload);
        },
        onRoomMeta: (payload: RoomMetaPayload) => {
          this.setMetadata({
            roomCode: payload.roomCode,
            leaderPlayerId: payload.leaderPlayerId,
          });
          this.applyRoomMetaState(payload);
        },
        onPhase: (phase: GamePhase, winnerId?: string, winnerName?: string) => {
          this.broadcast("evt:phase", { phase, winnerId, winnerName });
        },
        onCountdown: (count: number) => {
          this.broadcast("evt:countdown", count);
        },
        onRoundResult: (payload: RoundResultPayload) => {
          this.broadcast("evt:round_result", payload);
        },
        onSnapshot: (payload: SnapshotPayload) => {
          this.latestSnapshot = payload;
        },
        onSound: (type: string, playerId: string) => {
          this.broadcast("evt:sound", { type, playerId });
        },
        onScreenShake: (intensity: number, duration: number) => {
          this.broadcast("evt:screen_shake", { intensity, duration });
        },
        onDashParticles: (payload: {
          playerId: string;
          x: number;
          y: number;
          angle: number;
          color: string;
        }) => {
          this.broadcast("evt:dash_particles", payload);
        },
        onDevMode: (enabled: boolean) => {
          this.state.devModeEnabled = enabled;
        },
        onError: (sessionId: string, code: string, message: string) => {
          const target = this.clients.find((client) => client.sessionId === sessionId);
          if (target) {
            target.send("evt:error", { code, message });
          }
        },
      },
    );

    this.setSimulationInterval((deltaMs) => {
      // Fixed-step simulation with catch-up to keep real-time speed stable.
      const clampedDeltaMs = Math.min(Math.max(deltaMs, 0), 250);
      this.simAccumulatorMs += clampedDeltaMs;

      let substeps = 0;
      const maxSubsteps = 8;
      while (this.simAccumulatorMs >= tickDurationMs && substeps < maxSubsteps) {
        this.simulation.update(tickDurationMs);
        this.simAccumulatorMs -= tickDurationMs;
        substeps += 1;
      }

      // Prevent runaway backlog after long stalls.
      if (substeps >= maxSubsteps) {
        this.simAccumulatorMs = 0;
      }
    }, tickDurationMs);

    this.clock.setInterval(() => {
      this.broadcastSnapshotToClients();
    }, 1000 / snapshotHz);

    this.onMessage("cmd:set_name", (client, payload: { name?: string }) => {
      this.simulation.setName(client.sessionId, payload.name ?? "");
    });

    this.onMessage("cmd:input", (client, payload: PlayerInputMessage) => {
      this.simulation.sendInput(client.sessionId, payload);
    });

    this.onMessage("cmd:dash", (client, payload: DashMessage = {}) => {
      this.simulation.queueDash(client.sessionId, payload);
    });

    this.onMessage("cmd:start_match", (client) => {
      this.simulation.startMatch(client.sessionId);
    });

    this.onMessage("cmd:restart_match", (client) => {
      this.simulation.restartToLobby(client.sessionId);
    });

    this.onMessage("cmd:set_mode", (client, payload: SetModeMessage) => {
      this.simulation.setMode(client.sessionId, payload.mode);
    });

    this.onMessage("cmd:set_map", (client, payload: SetMapMessage) => {
      this.simulation.setMap(client.sessionId, payload.mapId);
    });

    this.onMessage(
      "cmd:set_advanced_settings",
      (client, payload: SetAdvancedSettingsMessage) => {
        this.simulation.setAdvancedSettings(client.sessionId, payload);
      },
    );

    this.onMessage("cmd:dev_mode", (client, payload: SetDevModeMessage) => {
      this.simulation.setDevMode(client.sessionId, Boolean(payload?.enabled));
    });

    this.onMessage(
      "cmd:dev_grant_powerup",
      (client, payload: DevGrantPowerUpMessage) => {
        if (!payload || typeof payload.type !== "string") return;
        this.simulation.devGrantPowerUp(client.sessionId, payload.type);
      },
    );

    this.onMessage("cmd:add_ai_bot", (client) => {
      this.simulation.addAIBot(client.sessionId);
    });

    this.onMessage(
      "cmd:add_local_player",
      (client, payload: { keySlot?: number } = {}) => {
        this.simulation.addLocalPlayer(client.sessionId, payload.keySlot);
      },
    );

    this.onMessage("cmd:remove_bot", (client, payload: { playerId: string }) => {
      this.simulation.removeBot(client.sessionId, payload.playerId);
    });

    this.onMessage("cmd:kick_player", (client, payload: { playerId: string }) => {
      this.simulation.kickPlayer(client.sessionId, payload.playerId);
    });

    this.onMessage("cmd:ping", (client, payload: { sentAt?: number } = {}) => {
      client.send("evt:pong", {
        sentAt: payload.sentAt ?? Date.now(),
        serverAt: Date.now(),
      });
    });
  }

  onJoin(client: Client, options?: { playerName?: string }): void {
    this.simulation.addHuman(client.sessionId, options?.playerName);
    this.asteroidColliderSentBySession.set(client.sessionId, new Set());
    if (this.latestSnapshot) {
      this.sendSnapshotToClient(client, this.latestSnapshot);
    }
  }

  onLeave(client: Client): void {
    this.simulation.removeSession(client.sessionId);
    this.asteroidColliderSentBySession.delete(client.sessionId);
  }

  onDispose(): void {
    this.asteroidColliderById.clear();
    this.asteroidColliderSentBySession.clear();
    unregisterRoomCodeByRoomId(this.roomId);
  }

  private applyPlayerListState(payload: PlayerListPayload): void {
    const nextHostId = payload.hostId ?? "";
    if (this.state.hostId !== nextHostId) {
      this.state.hostId = nextHostId;
    }

    const orderChanged =
      this.state.playerOrder.length !== payload.order.length ||
      payload.order.some((playerId, index) => this.state.playerOrder[index] !== playerId);
    if (orderChanged) {
      while (this.state.playerOrder.length > payload.order.length) {
        this.state.playerOrder.pop();
      }
      for (let i = 0; i < payload.order.length; i += 1) {
        const nextPlayerId = payload.order[i];
        if (i < this.state.playerOrder.length) {
          if (this.state.playerOrder[i] !== nextPlayerId) {
            this.state.playerOrder[i] = nextPlayerId;
          }
        } else {
          this.state.playerOrder.push(nextPlayerId);
        }
      }
    }

    const seen = new Set<string>();
    for (const meta of payload.meta) {
      seen.add(meta.id);
      let target = this.state.players.get(meta.id);
      if (!target) {
        target = new RoomPlayerMetaState();
        this.state.players.set(meta.id, target);
      }
      const nextProfileName = meta.profileName ?? "";
      const nextBotType = meta.botType ?? "";
      const nextKeySlot = Number.isFinite(meta.keySlot) ? (meta.keySlot as number) : -1;
      const nextIsBot = Boolean(meta.isBot);

      if (target.id !== meta.id) target.id = meta.id;
      if (target.customName !== meta.customName) target.customName = meta.customName;
      if (target.profileName !== nextProfileName) target.profileName = nextProfileName;
      if (target.botType !== nextBotType) target.botType = nextBotType;
      if (target.colorIndex !== meta.colorIndex) target.colorIndex = meta.colorIndex;
      if (target.keySlot !== nextKeySlot) target.keySlot = nextKeySlot;
      if (target.kills !== meta.kills) target.kills = meta.kills;
      if (target.roundWins !== meta.roundWins) target.roundWins = meta.roundWins;
      if (target.playerState !== meta.playerState) target.playerState = meta.playerState;
      if (target.isBot !== nextIsBot) target.isBot = nextIsBot;
    }

    const staleIds: string[] = [];
    this.state.players.forEach((_value, playerId) => {
      if (!seen.has(playerId)) staleIds.push(playerId);
    });
    for (const staleId of staleIds) {
      this.state.players.delete(staleId);
    }
  }

  private applyRoomMetaState(payload: RoomMetaPayload): void {
    this.state.roomCode = payload.roomCode;
    this.state.leaderPlayerId = payload.leaderPlayerId ?? "";
    this.state.hostId = payload.leaderPlayerId ?? "";
    this.state.phase = payload.phase;
    this.state.mode = payload.mode;
    this.state.baseMode = payload.baseMode;
    this.state.mapId = payload.mapId;
    this.state.settingsJson = JSON.stringify(payload.settings);
  }

  private broadcastSnapshotToClients(): void {
    if (!this.latestSnapshot) return;
    for (const client of this.clients) {
      this.sendSnapshotToClient(client, this.latestSnapshot);
    }
  }

  private sendSnapshotToClient(client: Client, snapshot: SnapshotPayload): void {
    this.prepareColliderCache(snapshot);
    const pendingColliders = this.collectPendingColliders(client.sessionId, snapshot);
    if (pendingColliders.length > 0) {
      client.send("evt:asteroid_colliders", pendingColliders);
    }
    client.send("evt:snapshot", this.stripAsteroidVertices(snapshot));
  }

  private prepareColliderCache(snapshot: SnapshotPayload): void {
    const aliveIds = new Set<string>();
    for (const asteroid of snapshot.asteroids) {
      aliveIds.add(asteroid.id);
      if (this.asteroidColliderById.has(asteroid.id)) continue;
      if (!asteroid.vertices || asteroid.vertices.length < 3) continue;
      this.asteroidColliderById.set(
        asteroid.id,
        this.encodeAsteroidVertices(asteroid.vertices),
      );
    }

    for (const asteroidId of [...this.asteroidColliderById.keys()]) {
      if (aliveIds.has(asteroidId)) continue;
      this.asteroidColliderById.delete(asteroidId);
    }

    for (const sentSet of this.asteroidColliderSentBySession.values()) {
      for (const asteroidId of [...sentSet]) {
        if (aliveIds.has(asteroidId)) continue;
        sentSet.delete(asteroidId);
      }
    }
  }

  private collectPendingColliders(
    sessionId: string,
    snapshot: SnapshotPayload,
  ): AsteroidColliderSync[] {
    const sentSet = this.getSentColliderSet(sessionId);
    const payload: AsteroidColliderSync[] = [];
    for (const asteroid of snapshot.asteroids) {
      if (sentSet.has(asteroid.id)) continue;
      const encoded = this.asteroidColliderById.get(asteroid.id);
      if (!encoded || encoded.length < 6) continue;
      payload.push({
        asteroidId: asteroid.id,
        vertices: [...encoded],
      });
      sentSet.add(asteroid.id);
    }
    return payload;
  }

  private getSentColliderSet(sessionId: string): Set<string> {
    let sentSet = this.asteroidColliderSentBySession.get(sessionId);
    if (!sentSet) {
      sentSet = new Set<string>();
      this.asteroidColliderSentBySession.set(sessionId, sentSet);
    }
    return sentSet;
  }

  private stripAsteroidVertices(snapshot: SnapshotPayload): SnapshotPayload {
    if (!snapshot.asteroids || snapshot.asteroids.length === 0) return snapshot;
    return {
      ...snapshot,
      asteroids: snapshot.asteroids.map((asteroid) => ({
        ...asteroid,
        vertices: [],
      })),
    };
  }

  private encodeAsteroidVertices(vertices: Array<{ x: number; y: number }>): number[] {
    const encoded: number[] = [];
    for (const point of vertices) {
      encoded.push(Math.round(point.x * ASTEROID_COLLIDER_VERTEX_SCALE));
      encoded.push(Math.round(point.y * ASTEROID_COLLIDER_VERTEX_SCALE));
    }
    return encoded;
  }
}
