import { ColyseusTransport } from "./ColyseusTransport";
import type { NetworkTransport } from "./NetworkTransport";

export function createTransport(): NetworkTransport {
  // Current runtime is Colyseus-only. Local mode will plug in a shared-sim transport.
  return new ColyseusTransport();
}

