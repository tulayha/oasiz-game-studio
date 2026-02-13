import { ColyseusTransport } from "./ColyseusTransport";
import type { NetworkTransport } from "./NetworkTransport";

export function createTransport(): NetworkTransport {
  // Build-safe default: only Colyseus is active in v1.
  // Playroom legacy implementation remains archived under:
  // src/network/transports/playroom-legacy/*
  return new ColyseusTransport();
}

