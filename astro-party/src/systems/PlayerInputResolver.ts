import { InputManager } from "./Input";
import { MultiInputManager } from "./MultiInputManager";
import { NetworkManager } from "../network/NetworkManager";
import { PlayerInput, GAME_CONFIG } from "../types";

export class PlayerInputResolver {
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
  ) {}

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
    if (this.network.isSimulationAuthority()) return;
    if (now - this.lastInputSendTime < GAME_CONFIG.SYNC_INTERVAL) return;

    const sendInput: PlayerInput = {
      ...this.localInputState,
      timestamp: now,
      clientTimeMs: now,
    };
    this.network.sendInput(sendInput);
    this.lastInputSendTime = now;
  }

  private emptyInput(): PlayerInput {
    return {
      buttonA: false,
      buttonB: false,
      timestamp: 0,
      clientTimeMs: 0,
    };
  }
}
