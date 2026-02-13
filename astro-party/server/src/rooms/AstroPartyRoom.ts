import { Client, Room } from "colyseus";
import {
  AstroPartySimulation,
} from "../../../shared/sim/AstroPartySimulation.js";
import type {
  AdvancedSettingsSync,
  GamePhase,
  PlayerListPayload,
  RoomMetaPayload,
  RoundResultPayload,
  SnapshotPayload,
} from "../../../shared/sim/types.js";
import { unregisterRoomCodeByRoomId } from "../http/roomCodeRegistry.js";

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
}

interface DashMessage {
  controlledPlayerId?: string;
}

interface SetModeMessage {
  mode: "STANDARD" | "SANE" | "CHAOTIC" | "CUSTOM";
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

export class AstroPartyRoom extends Room {
  maxClients = 4;
  private simulation!: AstroPartySimulation;
  private latestSnapshot: SnapshotPayload | null = null;

  async onCreate(options: CreateOptions): Promise<void> {
    const roomCode = options.roomCode ?? "----";
    const maxPlayers = options.maxPlayers ?? 4;
    const simTickHz = options.simTickHz ?? 60;
    const snapshotHz = options.snapshotHz ?? 20;
    const tickDurationMs = 1000 / simTickHz;

    this.maxClients = maxPlayers;

    this.simulation = new AstroPartySimulation(
      roomCode,
      maxPlayers,
      tickDurationMs,
      {
        onPlayers: (payload: PlayerListPayload) => {
          this.broadcast("evt:players", payload);
        },
        onRoomMeta: (payload: RoomMetaPayload) => {
          this.setMetadata({
            roomCode: payload.roomCode,
            leaderPlayerId: payload.leaderPlayerId,
          });
          this.broadcast("evt:room_meta", payload);
          this.broadcast("evt:advanced_settings", {
            mode: payload.mode,
            baseMode: payload.baseMode,
            settings: payload.settings,
          } satisfies AdvancedSettingsSync);
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
          this.broadcast("evt:dev_mode", { enabled });
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
      this.simulation.update(deltaMs);
    }, tickDurationMs);

    this.clock.setInterval(() => {
      if (!this.latestSnapshot) return;
      this.broadcast("evt:snapshot", this.latestSnapshot);
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
      (client, _payload: { keySlot?: number } = {}) => {
        this.simulation.addLocalPlayer(client.sessionId);
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
    client.send("evt:self", {
      playerId: this.simulation.getPlayerIdForSession(client.sessionId),
    });
    client.send("evt:dev_mode", {
      enabled: this.simulation.getDevModeEnabled(),
    });
    if (this.latestSnapshot) {
      client.send("evt:snapshot", this.latestSnapshot);
    }
  }

  onLeave(client: Client): void {
    this.simulation.removeSession(client.sessionId);
  }

  onDispose(): void {
    unregisterRoomCodeByRoomId(this.roomId);
  }
}
