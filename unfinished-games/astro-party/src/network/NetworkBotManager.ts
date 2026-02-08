import {
  isHost,
  myPlayer,
  addBot,
  PlayerState as BasePlayerState,
} from "playroomkit";
import { AstroBot } from "../entities/AstroBot";

// Extend PlayroomKit PlayerState to include bot methods (not in official types yet)
export interface PlayroomPlayerState extends BasePlayerState {
  isBot?: () => boolean;
  bot?: AstroBot;
}

export class NetworkBotManager {
  private pendingAssignments: Array<{
    type: "ai" | "local";
    keySlot?: number;
  }> = [];
  private aiUsed = new Set<number>();
  private localUsed = new Set<number>();
  private botTypeById = new Map<string, "ai" | "local">();
  private botIndexById = new Map<string, number>();

  constructor(private players: Map<string, PlayroomPlayerState>) {}

  resetCounter(): void {
    this.pendingAssignments = [];
    this.aiUsed.clear();
    this.localUsed.clear();
    this.botTypeById.clear();
    this.botIndexById.clear();
  }

  async addAIBot(): Promise<AstroBot | null> {
    if (!isHost()) {
      console.log("[NetworkManager] Only host can add bots");
      return null;
    }

    if (this.players.size >= 4) {
      console.log("[NetworkManager] Room is full");
      return null;
    }

    try {
      console.log("[NetworkManager] Adding AI bot...");
      const assignment = { type: "ai" as const };
      this.pendingAssignments.push(assignment);
      const bot = (await addBot()) as AstroBot;

      return bot;
    } catch (e) {
      this.pendingAssignments.pop();
      console.error("[NetworkManager] Failed to add bot:", e);
      return null;
    }
  }

  async addLocalBot(keySlot: number): Promise<AstroBot | null> {
    if (!isHost()) {
      console.log("[NetworkManager] Only host can add local players");
      return null;
    }

    if (this.players.size >= 4) {
      console.log("[NetworkManager] Room is full");
      return null;
    }

    if (this.hasRemotePlayers()) {
      console.log(
        "[NetworkManager] Cannot add local players when remote players are in room",
      );
      return null;
    }

    try {
      console.log(
        "[NetworkManager] Adding local player with keySlot:",
        keySlot,
      );
      const assignment = { type: "local" as const, keySlot };
      this.pendingAssignments.push(assignment);
      const bot = (await addBot()) as AstroBot;

      return bot;
    } catch (e) {
      this.pendingAssignments.pop();
      console.error("[NetworkManager] Failed to add local player:", e);
      return null;
    }
  }

  async removeBot(playerId: string): Promise<boolean> {
    if (!isHost()) {
      console.log("[NetworkManager] Only host can remove bots");
      return false;
    }

    const player = this.players.get(playerId);
    if (!player) {
      console.log("[NetworkManager] Player not found:", playerId);
      return false;
    }

    if (!player.isBot?.()) {
      console.log("[NetworkManager] Player is not a bot:", playerId);
      return false;
    }

    try {
      await player.kick();
      console.log("[NetworkManager] Bot removed:", playerId);
      return true;
    } catch (e) {
      console.error("[NetworkManager] Failed to remove bot:", e);
      return false;
    }
  }

  isPlayerBot(playerId: string): boolean {
    const player = this.players.get(playerId);
    return player?.isBot?.() ?? false;
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    const player = this.players.get(playerId);
    if (!player?.isBot?.()) return null;
    return (player.getState("botType") as "ai" | "local") || "ai";
  }

  getPlayerKeySlot(playerId: string): number {
    const player = this.players.get(playerId);
    return (player?.getState("keySlot") as number) ?? -1;
  }

  getPlayer(playerId: string): PlayroomPlayerState | undefined {
    return this.players.get(playerId);
  }

  hasRemotePlayers(): boolean {
    const myId = myPlayer()?.id;
    for (const [playerId, player] of this.players) {
      if (playerId !== myId && !player.isBot?.()) {
        return true;
      }
    }
    return false;
  }

  getBotCount(): number {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.isBot?.()) count++;
    }
    return count;
  }

  assignBotOnJoin(player: PlayroomPlayerState): void {
    if (!player.isBot?.()) return;

    let type = player.getState("botType") as "ai" | "local" | null;
    if (!type) {
      const assignment = this.pendingAssignments.shift();
      type = assignment?.type ?? "ai";
      player.setState("botType", type, true);
      if (type === "local") {
        player.setState("keySlot", assignment?.keySlot ?? -1, true);
      }
    }

    this.botTypeById.set(player.id, type);

    const existingName = (player.getState("customName") as string) || "";
    const existingIndex = this.extractIndex(existingName, type);
    if (existingIndex && !this.isIndexUsed(type, existingIndex)) {
      this.reserveIndex(type, player.id, existingIndex);
      return;
    }

    const nextIndex = this.getNextAvailableIndex(type);
    this.reserveIndex(type, player.id, nextIndex);
    const prefix = type === "local" ? "Player" : "Bot";
    player.setState("customName", `${prefix} ${nextIndex}`, true);
  }

  releaseBot(playerId: string): void {
    const type = this.botTypeById.get(playerId);
    if (!type) return;
    const index = this.botIndexById.get(playerId);
    if (index !== undefined) {
      if (type === "local") {
        this.localUsed.delete(index);
      } else {
        this.aiUsed.delete(index);
      }
    }
    this.botTypeById.delete(playerId);
    this.botIndexById.delete(playerId);
  }

  private getNextAvailableIndex(type: "ai" | "local"): number {
    const used = type === "local" ? this.localUsed : this.aiUsed;
    let i = 1;
    while (used.has(i)) i++;
    return i;
  }

  private reserveIndex(
    type: "ai" | "local",
    playerId: string,
    index: number,
  ): void {
    if (type === "local") {
      this.localUsed.add(index);
    } else {
      this.aiUsed.add(index);
    }
    this.botIndexById.set(playerId, index);
    this.botTypeById.set(playerId, type);
  }

  private isIndexUsed(type: "ai" | "local", index: number): boolean {
    return type === "local"
      ? this.localUsed.has(index)
      : this.aiUsed.has(index);
  }

  private extractIndex(name: string, type: "ai" | "local"): number | null {
    const prefix = type === "local" ? "Player" : "Bot";
    const match = name.match(new RegExp(`^${prefix}\\s+(\\d+)$`, "i"));
    if (!match) return null;
    const num = Number.parseInt(match[1], 10);
    return Number.isFinite(num) ? num : null;
  }
}
