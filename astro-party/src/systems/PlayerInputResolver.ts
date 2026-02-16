import { InputManager } from "./Input";
import { MultiInputManager } from "./MultiInputManager";
import { NetworkManager } from "../network/NetworkManager";
import { PlayerInput, GAME_CONFIG } from "../types";
import { NETWORK_GAME_FEEL_TUNING } from "../network/gameFeel/NetworkGameFeelTuning";

export class PlayerInputResolver {
  private localInputState: PlayerInput = {
    buttonA: false,
    buttonB: false,
    timestamp: 0,
    clientTimeMs: 0,
    inputSequence: 0,
  };
  private lastInputSendTime: number = 0;
  private nextInputSequence = 1;

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
      inputSequence: this.localInputState.inputSequence,
    };

    return this.localInputState;
  }

  sendLocalInputIfNeeded(now: number): PlayerInput | null {
    if (this.network.isSimulationAuthority()) return null;
    const sendIntervalMs =
      this.network.getTransportMode() === "online"
        ? NETWORK_GAME_FEEL_TUNING.selfPrediction.inputSendIntervalMs
        : GAME_CONFIG.SYNC_INTERVAL;
    if (now - this.lastInputSendTime < sendIntervalMs) return null;

    const inputSequence = this.nextInputSequence++;

    const sendInput: PlayerInput = {
      ...this.localInputState,
      timestamp: now,
      clientTimeMs: now,
      inputSequence,
    };
    this.network.sendInput(sendInput);
    this.localInputState.inputSequence = inputSequence;
    this.lastInputSendTime = now;
    return sendInput;
  }

  getCurrentInputState(): PlayerInput {
    return this.localInputState;
  }

  private emptyInput(): PlayerInput {
    return {
      buttonA: false,
      buttonB: false,
      timestamp: 0,
      clientTimeMs: 0,
      inputSequence: 0,
    };
  }
}
