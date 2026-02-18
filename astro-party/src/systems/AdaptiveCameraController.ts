import { GAME_CONFIG, GamePhase } from "../types";

type CameraTier = 0 | 1 | 2;

export interface CameraAnchor {
  x: number;
  y: number;
}

export interface AdaptiveCameraUpdateInput {
  dt: number;
  nowMs: number;
  phase: GamePhase;
  anchors: readonly CameraAnchor[];
}

export interface AdaptiveCameraState {
  zoom: number;
  focusX: number;
  focusY: number;
  tier: CameraTier;
}

const DEFAULT_FOCUS_X = GAME_CONFIG.ARENA_WIDTH / 2;
const DEFAULT_FOCUS_Y = GAME_CONFIG.ARENA_HEIGHT / 2;

const CAMERA_ZOOM_BY_TIER: Record<CameraTier, number> = {
  0: 1,
  1: 1.14,
  2: 1.28,
};

const TIER_1_ENTER_DISTANCE = 520;
const TIER_1_EXIT_DISTANCE = 620;
const TIER_2_ENTER_DISTANCE = 320;
const TIER_2_EXIT_DISTANCE = 390;

const TIER_1_ENTER_DISTANCE_SQ = TIER_1_ENTER_DISTANCE * TIER_1_ENTER_DISTANCE;
const TIER_1_EXIT_DISTANCE_SQ = TIER_1_EXIT_DISTANCE * TIER_1_EXIT_DISTANCE;
const TIER_2_ENTER_DISTANCE_SQ = TIER_2_ENTER_DISTANCE * TIER_2_ENTER_DISTANCE;
const TIER_2_EXIT_DISTANCE_SQ = TIER_2_EXIT_DISTANCE * TIER_2_EXIT_DISTANCE;

const TIER_SWITCH_COOLDOWN_MS = 220;
const ZOOM_SMOOTHING = 7.5;
const FOCUS_SMOOTHING = 6;

export class AdaptiveCameraController {
  private tier: CameraTier = 0;
  private zoom = CAMERA_ZOOM_BY_TIER[0];
  private focusX = DEFAULT_FOCUS_X;
  private focusY = DEFAULT_FOCUS_Y;
  private lastTierSwitchAtMs = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.tier = 0;
    this.zoom = CAMERA_ZOOM_BY_TIER[0];
    this.focusX = DEFAULT_FOCUS_X;
    this.focusY = DEFAULT_FOCUS_Y;
    this.lastTierSwitchAtMs = Number.NEGATIVE_INFINITY;
  }

  update(input: AdaptiveCameraUpdateInput): AdaptiveCameraState {
    const dt = Math.max(0, Math.min(0.25, input.dt));
    const isAdaptivePhase =
      input.phase === "PLAYING" ||
      input.phase === "ROUND_END" ||
      input.phase === "GAME_END";
    const hasGroup = input.anchors.length >= 2;

    let targetFocusX = DEFAULT_FOCUS_X;
    let targetFocusY = DEFAULT_FOCUS_Y;
    let requestedTier: CameraTier = 0;

    if (isAdaptivePhase && hasGroup) {
      const centroid = this.computeCentroid(input.anchors);
      targetFocusX = centroid.x;
      targetFocusY = centroid.y;
      const maxDistanceSq = this.computeMaxDistanceSq(input.anchors);
      requestedTier = this.resolveTier(maxDistanceSq);
    }

    if (
      requestedTier !== this.tier &&
      input.nowMs - this.lastTierSwitchAtMs >= TIER_SWITCH_COOLDOWN_MS
    ) {
      this.tier = requestedTier;
      this.lastTierSwitchAtMs = input.nowMs;
    }

    const targetZoom = CAMERA_ZOOM_BY_TIER[this.tier];
    const zoomAlpha = 1 - Math.exp(-ZOOM_SMOOTHING * dt);
    const focusAlpha = 1 - Math.exp(-FOCUS_SMOOTHING * dt);

    this.zoom += (targetZoom - this.zoom) * zoomAlpha;
    this.focusX += (targetFocusX - this.focusX) * focusAlpha;
    this.focusY += (targetFocusY - this.focusY) * focusAlpha;

    return {
      zoom: this.zoom,
      focusX: this.focusX,
      focusY: this.focusY,
      tier: this.tier,
    };
  }

  private resolveTier(maxDistanceSq: number): CameraTier {
    if (this.tier === 0) {
      if (maxDistanceSq <= TIER_2_ENTER_DISTANCE_SQ) return 2;
      if (maxDistanceSq <= TIER_1_ENTER_DISTANCE_SQ) return 1;
      return 0;
    }

    if (this.tier === 1) {
      if (maxDistanceSq <= TIER_2_ENTER_DISTANCE_SQ) return 2;
      if (maxDistanceSq >= TIER_1_EXIT_DISTANCE_SQ) return 0;
      return 1;
    }

    if (maxDistanceSq >= TIER_2_EXIT_DISTANCE_SQ) {
      if (maxDistanceSq >= TIER_1_EXIT_DISTANCE_SQ) return 0;
      return 1;
    }
    return 2;
  }

  private computeCentroid(anchors: readonly CameraAnchor[]): CameraAnchor {
    if (anchors.length <= 0) {
      return { x: DEFAULT_FOCUS_X, y: DEFAULT_FOCUS_Y };
    }
    let sumX = 0;
    let sumY = 0;
    for (const anchor of anchors) {
      sumX += anchor.x;
      sumY += anchor.y;
    }
    return { x: sumX / anchors.length, y: sumY / anchors.length };
  }

  private computeMaxDistanceSq(anchors: readonly CameraAnchor[]): number {
    let maxDistanceSq = 0;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      for (let j = i + 1; j < anchors.length; j++) {
        const b = anchors[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > maxDistanceSq) {
          maxDistanceSq = distanceSq;
        }
      }
    }
    return maxDistanceSq;
  }
}
