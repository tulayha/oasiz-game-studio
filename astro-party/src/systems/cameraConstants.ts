// Baseline zoom when players are far apart (max spread state).
// Lower = more zoomed out overall. Higher = tighter framing overall.
export const CAMERA_DEFAULT_ZOOM = 0.95;

// Hard zoom clamps applied by renderer.
// Use these to prevent extreme values from controller/output noise.
export const CAMERA_MIN_ZOOM = 0.9;
export const CAMERA_MAX_ZOOM = 1.35;

// Closest-group zoom target when players are very near each other.
// Higher = stronger close-up when grouped.
export const CAMERA_MAX_CLOSE_ZOOM = 1.28;

// Spread thresholds (in world units, px in arena space) for mapping spread->zoom.
// <= MIN_SPREAD_FOR_MAX_ZOOM -> CAMERA_MAX_CLOSE_ZOOM
// >= MAX_SPREAD_FOR_DEFAULT_ZOOM -> CAMERA_DEFAULT_ZOOM
// Between them -> smooth interpolation.
export const CAMERA_MIN_SPREAD_FOR_MAX_ZOOM = 320;
export const CAMERA_MAX_SPREAD_FOR_DEFAULT_ZOOM = 620;

// Smoothing times (seconds) for critically-damped filters.
// Higher values = slower/smoother response. Lower values = snappier response.
export const CAMERA_ZOOM_SMOOTH_TIME = 0.24;
export const CAMERA_FOCUS_SMOOTH_TIME = 0.2;
export const CAMERA_SPREAD_SMOOTH_TIME = 0.16;

// Ignore tiny zoom target deltas to reduce "breathing" near boundaries.
// Higher = more stable but less responsive micro-adjustments.
export const CAMERA_ZOOM_DEADBAND = 0.01;

// How far camera focus may go past arena edges, as a fraction of view half-size.
// 0.0 = strict clamp to map edge, 1.0 = allow full half-view overshoot.
export const CAMERA_EDGE_SLACK_RATIO = 1.0;
