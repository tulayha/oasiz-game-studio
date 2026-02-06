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
  private botNameCounter = 0;

  constructor(private players: Map<string, PlayroomPlayerState>) {}

  resetCounter(): void {
    this.botNameCounter = 0;
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
      const bot = (await addBot()) as AstroBot;

      const botPlayer = this.getPlayerByBot(bot);
      if (botPlayer) {
        botPlayer.setState("botType", "ai", true);
        this.botNameCounter++;
        botPlayer.setState("customName", `Bot ${this.botNameCounter}`, true);
      }

      return bot;
    } catch (e) {
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
      console.log("[NetworkManager] Adding local player with keySlot:", keySlot);
      const bot = (await addBot()) as AstroBot;

      const botPlayer = this.getPlayerByBot(bot);
      if (botPlayer) {
        botPlayer.setState("botType", "local", true);
        botPlayer.setState("keySlot", keySlot, true);
        botPlayer.setState("customName", `Player ${this.players.size}`, true);
      }

      return bot;
    } catch (e) {
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

  private getPlayerByBot(bot: AstroBot): PlayroomPlayerState | null {
    for (const player of this.players.values()) {
      if (player.isBot?.() && player.bot === bot) {
        return player;
      }
    }
    for (const player of this.players.values()) {
      if (player.isBot?.() && !player.getState("botType")) {
        return player;
      }
    }
    return null;
  }
}
