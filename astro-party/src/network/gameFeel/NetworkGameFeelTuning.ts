import { GAME_CONFIG } from "../../types";

export const NETWORK_GAME_FEEL_TUNING = {
  remoteSmoothing: {
    maxSnapshotBufferSize: 120,
    interpolationDelayBaseMs: 120,
    interpolationDelayMinMs: 80,
    interpolationDelayMaxMs: 220,
    interpolationDelayJitterScale: 1.5,
    interpolationDelaySmoothing: 0.15,
    extrapolationCapBaseMs: 110,
    extrapolationCapMinMs: 100,
    extrapolationCapMaxMs: 140,
    extrapolationCapJitterScale: 0.6,
    snapshotIntervalTargetMs: GAME_CONFIG.SYNC_INTERVAL,
    snapshotJitterSmoothing: 0.1,
  },
  selfPrediction: {
    replayStepSec: GAME_CONFIG.SYNC_INTERVAL / 1000,
    pendingInputLimit: 64,
    maxFrameStepSec: 0.05,
    correctionThresholdPx: 2,
    softBlendThresholdPx: 32,
    hardSnapThresholdPx: 85,
    softBlendFactor: 0.55,
    nonStandardResponseScale: 0.75,
  },
  localAuthoritativeSoundSuppressionMs: {
    fire: 260,
    dash: 320,
  },
} as const;
