import { InputManager } from "./Input";
import { MultiInputManager } from "./MultiInputManager";
import { NetworkManager } from "../network/NetworkManager";
import { BotManager } from "../managers/BotManager";
import { PlayerInput, GAME_CONFIG } from "../types";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Projectile } from "../entities/Projectile";

export class PlayerInputResolver {
  private static readonly REMOTE_INPUT_STALE_TIMEOUT_MS = 1000;

  private pendingInputs: Map<string, PlayerInput> = new Map();
  private pendingInputReceivedAt: Map<string, number> = new Map();
  private pendingDashes: Set<string> = new Set();
  private localInputState: PlayerInput = {
    buttonA: false,
    buttonB: false,
    timestamp: 0,
    clientTimeMs: 0,
  };
  private lastInputSendTime: number = 0;

  constructor(
    private network: NetworkManager,
    private input: InputManager,
    private multiInput: MultiInputManager | null,
    private botMgr: BotManager,
  ) {}

  getPendingInputs(): Map<string, PlayerInput> {
    return this.pendingInputs;
  }

  getPendingDashes(): Set<string> {
    return this.pendingDashes;
  }

  captureLocalInput(now: number, useTouchForHost: boolean): PlayerInput {
    const capturedInput = useTouchForHost
      ? this.multiInput?.capture(0) || this.emptyInput()
      : this.input.capture();

    this.localInputState = {
      ...capturedInput,
      timestamp: now,
      clientTimeMs: now,
    };

    return this.localInputState;
  }

  sendLocalInputIfNeeded(now: number): void {
    if (this.network.isHost()) return;
    if (now - this.lastInputSendTime < GAME_CONFIG.SYNC_INTERVAL) return;

    const sendInput: PlayerInput = {
      ...this.localInputState,
      timestamp: now,
      clientTimeMs: now,
    };
    this.network.sendInput(sendInput);
    this.lastInputSendTime = now;
  }

  setPendingInput(playerId: string, input: PlayerInput): void {
    this.pendingInputs.set(playerId, input);
    this.pendingInputReceivedAt.set(playerId, performance.now());
  }

  queueDash(playerId: string): void {
    this.pendingDashes.add(playerId);
  }

  resolveHostInput(
    playerId: string,
    ships: Map<string, Ship>,
    pilots: Map<string, Pilot>,
    projectiles: Projectile[],
    nowMs: number,
  ): { input: PlayerInput; shouldDash: boolean } {
    let input: PlayerInput;
    let shouldDash = false;

    const isBot = this.network.isPlayerBot(playerId);
    const botType = this.network.getPlayerBotType(playerId);

    if (isBot && botType === "ai") {
      const player = this.network.getPlayer(playerId);
      const bot = player?.bot;
      if (bot) {
        const botData = this.botMgr.getBotVisibleData(
          playerId,
          ships,
          pilots,
          projectiles,
          nowMs,
        );
        const action = bot.decideAction(botData);
        input = {
          buttonA: action.buttonA,
          buttonB: action.buttonB,
          timestamp: nowMs,
          clientTimeMs: nowMs,
        };
        shouldDash = action.dash;
      } else {
        input = this.emptyInput();
      }
    } else if (isBot && botType === "local") {
      const keySlot = this.network.getPlayerKeySlot(playerId);
      input = this.multiInput?.capture(keySlot) || this.emptyInput();
      shouldDash = this.multiInput?.consumeDash(keySlot) || false;
    } else {
      const myId = this.network.getMyPlayerId();
      const isMe = playerId === myId;

      if (isMe && this.botMgr.useTouchForHost) {
        input = this.multiInput?.capture(0) || this.emptyInput();
        shouldDash = this.multiInput?.consumeDash(0) || false;
      } else if (isMe) {
        input = this.localInputState;
        shouldDash = this.consumeDash(playerId);
      } else {
        input = this.getRemoteInputWithStaleGuard(playerId);
        shouldDash = this.consumeDash(playerId);
      }
    }

    return { input, shouldDash };
  }

  getPilotInputForPlayer(playerId: string): PlayerInput {
    const isBot = this.network.isPlayerBot(playerId);
    const botType = this.network.getPlayerBotType(playerId);

    if (isBot && botType === "local") {
      const keySlot = this.network.getPlayerKeySlot(playerId);
      return this.multiInput?.capture(keySlot) || this.emptyInput();
    }

    const myId = this.network.getMyPlayerId();
    const isMe = playerId === myId;
    if (isMe && this.botMgr.useTouchForHost) {
      return this.multiInput?.capture(0) || this.emptyInput();
    }
    if (isMe) {
      return this.localInputState;
    }

    return this.getRemoteInputWithStaleGuard(playerId);
  }

  private consumeDash(playerId: string): boolean {
    if (!this.pendingDashes.has(playerId)) return false;
    this.pendingDashes.delete(playerId);
    return true;
  }

  private emptyInput(): PlayerInput {
    return {
      buttonA: false,
      buttonB: false,
      timestamp: 0,
      clientTimeMs: 0,
    };
  }

  private getRemoteInputWithStaleGuard(playerId: string): PlayerInput {
    const receivedAt = this.pendingInputReceivedAt.get(playerId) || 0;
    const isStale =
      receivedAt > 0 &&
      performance.now() - receivedAt >
        PlayerInputResolver.REMOTE_INPUT_STALE_TIMEOUT_MS;

    if (isStale) {
      this.pendingInputs.delete(playerId);
      this.pendingInputReceivedAt.delete(playerId);
      return this.emptyInput();
    }

    return this.pendingInputs.get(playerId) || this.emptyInput();
  }
}
