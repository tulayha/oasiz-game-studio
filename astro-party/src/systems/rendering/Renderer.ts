import {
  ShipState,
  PilotState,
  ProjectileState,
  AsteroidState,
  PowerUpState,
  LaserBeamState,
  MineState,
  HomingMissileState,
  PlayerColor,
  PLAYER_COLORS,
  GAME_CONFIG,
  MapId,
} from "../../types";
import { SeededRNG } from "../../../shared/sim/SeededRNG";
import {
  SHIP_JOUST_LOCAL_POINTS,
  SHIP_SHIELD_RADII,
  SHIP_VISUAL_REFERENCE_SIZE,
} from "../../../shared/geometry/ShipRenderAnchors";
import { PILOT_EFFECT_LOCAL_POINTS } from "../../../shared/geometry/PilotRenderAnchors";
import {
  SHIP_COLLIDER_VERTICES,
  transformLocalVertices,
} from "../../../shared/geometry/EntityShapes";
import { projectRayToArenaWall } from "../../../shared/sim/physics/geometryMath";
import { EntitySpriteStore } from "./EntitySpriteStore";
import { MapOverlayStore } from "./MapOverlayStore";
import { PowerUpSpriteStore } from "./PowerUpSpriteStore";
import { RenderEffectsSystem } from "./RenderEffectsSystem";
import {
  drawDebugRadius,
  drawMineBody,
  drawMineExplosionEffect,
} from "./RendererVisualPrimitives";
import {
  ShipTrailRenderer,
  type ShipTrailVisualTuning,
} from "./ShipTrailRenderer";
import { ScreenShakeController } from "./ScreenShakeController";
import { MapEffectsRenderer } from "./MapEffectsRenderer";
import {
  CAMERA_DEFAULT_ZOOM,
  CAMERA_EDGE_SLACK_RATIO,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
} from "../camera/cameraConstants";
import type {
  YellowBlock,
  CenterHole,
  RepulsionZone,
} from "../../../shared/sim/maps";
export type { ShipTrailVisualTuning } from "./ShipTrailRenderer";

export class Renderer {
  private static readonly PILOT_DEBRIS_BASELINE_BUMP_RADIUS = 8.2;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private shipTrails = new ShipTrailRenderer();
  private screenShake = new ScreenShakeController();
  private effects: RenderEffectsSystem;
  private visualRng: SeededRNG;
  private gameTimeMs: number | null = null;

  // Dev mode visualization flag
  private devModeEnabled = false;

  // Fixed arena scaling
  private scale: number = 1;
  private cameraZoom: number = CAMERA_DEFAULT_ZOOM;
  private cameraFocusX: number = GAME_CONFIG.ARENA_WIDTH / 2;
  private cameraFocusY: number = GAME_CONFIG.ARENA_HEIGHT / 2;
  private viewportWidth: number = 1;
  private viewportHeight: number = 1;
  private coarsePointer = false;
  private entitySprites = new EntitySpriteStore();
  private mapEffects: MapEffectsRenderer;
  private mapOverlays = new MapOverlayStore();
  private powerUpSprites = new PowerUpSpriteStore();
  private projectileDebugHistory = new Map<
    string,
    Array<{ x: number; y: number; atMs: number }>
  >();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.visualRng = new SeededRNG(Date.now() >>> 0);
    this.mapEffects = new MapEffectsRenderer(this.ctx);
    this.effects = new RenderEffectsSystem(
      this.ctx,
      this.entitySprites,
      () => this.random(),
      () => this.getNowMs(),
    );
  }

  setVisualRng(rng: SeededRNG): void {
    this.visualRng = rng;
  }

  setGameTimeMs(nowMs: number | null): void {
    this.gameTimeMs = nowMs;
  }

  private getNowMs(): number {
    return this.gameTimeMs ?? Date.now();
  }

  private random(): number {
    return this.visualRng.next();
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const rootStyles = getComputedStyle(document.documentElement);
    const layoutWidth = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-width"),
    );
    const layoutHeight = Number.parseFloat(
      rootStyles.getPropertyValue("--layout-height"),
    );
    const targetWidth =
      Number.isFinite(layoutWidth) && layoutWidth > 0
        ? layoutWidth
        : rect.width;
    const targetHeight =
      Number.isFinite(layoutHeight) && layoutHeight > 0
        ? layoutHeight
        : rect.height;

    const cssWidth = Math.max(1, Math.round(targetWidth));
    const cssHeight = Math.max(1, Math.round(targetHeight));
    this.viewportWidth = cssWidth;
    this.viewportHeight = cssHeight;
    this.coarsePointer = window.matchMedia("(pointer: coarse)").matches;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

    // Calculate scale to fit fixed arena in window while maintaining aspect ratio
    const scaleX = cssWidth / GAME_CONFIG.ARENA_WIDTH;
    const scaleY = cssHeight / GAME_CONFIG.ARENA_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);
  }

  setCamera(zoom: number, focusX: number, focusY: number): void {
    this.cameraZoom = this.clampCameraZoom(zoom);
    this.cameraFocusX = Number.isFinite(focusX)
      ? focusX
      : GAME_CONFIG.ARENA_WIDTH / 2;
    this.cameraFocusY = Number.isFinite(focusY)
      ? focusY
      : GAME_CONFIG.ARENA_HEIGHT / 2;
  }

  resetCamera(): void {
    this.cameraZoom = CAMERA_DEFAULT_ZOOM;
    this.cameraFocusX = GAME_CONFIG.ARENA_WIDTH / 2;
    this.cameraFocusY = GAME_CONFIG.ARENA_HEIGHT / 2;
  }

  // Enable/disable dev mode visualization
  setDevMode(enabled: boolean): void {
    this.devModeEnabled = enabled;
    if (!enabled) {
      this.projectileDebugHistory.clear();
    }
  }

  // Draw homing missile detection radius (dev mode only)
  drawHomingMissileDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(0, 255, 0, 0.8)",
      fillStyle: "rgba(0, 255, 0, 0.1)",
      label: "DETECT",
      labelColor: "#00ff00",
      lineDash: [10, 5],
    });
  }

  // Draw mine detection radius (dev mode only)
  drawMineDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(0, 255, 0, 0.8)",
      fillStyle: "rgba(0, 255, 0, 0.1)",
      label: "MINE",
      labelColor: "#00ff00",
      lineDash: [10, 5],
    });
  }

  // Draw turret detection radius (dev mode only)
  drawTurretDetectionRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(255, 50, 50, 0.8)",
      fillStyle: "rgba(255, 50, 50, 0.1)",
      label: "TURRET",
      labelColor: "#ff3333",
      lineDash: [10, 5],
    });
  }

  // Draw turret bullet explosion radius (dev mode only)
  drawTurretBulletRadius(x: number, y: number, radius: number): void {
    if (!this.devModeEnabled) return;
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: "rgba(255, 150, 0, 0.8)",
      fillStyle: "rgba(255, 150, 0, 0.1)",
      label: "BULLET",
      labelColor: "#ff9900",
      lineDash: [10, 5],
    });
  }

  // Draw power-up magnetic radius (dev mode only)
  drawPowerUpMagneticRadius(
    x: number,
    y: number,
    radius: number,
    isActive: boolean,
  ): void {
    if (!this.devModeEnabled) return;
    drawDebugRadius(this.ctx, x, y, radius, {
      strokeStyle: isActive
        ? "rgba(200, 100, 255, 0.9)"
        : "rgba(150, 80, 200, 0.7)",
      fillStyle: isActive
        ? "rgba(200, 100, 255, 0.15)"
        : "rgba(150, 80, 200, 0.08)",
      label: "MAGNET",
      labelColor: isActive ? "#cc66ff" : "#9966cc",
      lineDash: [8, 4],
    });
  }

  // ============= TURRET RENDERING =============

  drawTurret(state: import("../../types").TurretState): void {
    const { ctx } = this;
    const { x, y, angle, isTracking, orbitRadius } = state;

    ctx.save();
    ctx.translate(x, y);

    // Draw orbit ring (visual base)
    ctx.strokeStyle = "rgba(100, 100, 120, 0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Orbit ring glow
    ctx.shadowColor = "#6666ff";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "rgba(100, 100, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, orbitRadius - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw turret base
    ctx.fillStyle = "#444455";
    ctx.strokeStyle = "#666677";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw turret barrel (rotates toward target)
    ctx.rotate(angle);

    // Barrel glow when tracking
    if (isTracking) {
      ctx.shadowColor = "#ff4444";
      ctx.shadowBlur = 15;
    }

    // Barrel
    ctx.fillStyle = isTracking ? "#ff6666" : "#888899";
    ctx.fillRect(15, -6, 25, 12);

    // Barrel detail
    ctx.fillStyle = "#555566";
    ctx.fillRect(18, -4, 20, 8);

    ctx.shadowBlur = 0;

    // Center hub
    ctx.fillStyle = "#333344";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();

    // Center glow
    ctx.fillStyle = isTracking ? "#ff4444" : "#6666ff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ============= TURRET BULLET RENDERING =============

  drawTurretBullet(state: import("../../types").TurretBulletState): void {
    const { ctx } = this;
    const { x, y, vx, vy, exploded, explosionTime, explosionRadius } = state;
    const nowMs = this.getNowMs();

    if (exploded && explosionTime > 0) {
      // Draw explosion effect
      const elapsed = nowMs - explosionTime;
      const progress = this.clamp01(elapsed / 500);
      const blastRadius = Number.isFinite(explosionRadius) ? explosionRadius : 100;
      const radius = blastRadius * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      ctx.save();
      ctx.translate(x, y);

      // Outer white flash
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      // Middle bright ring
      ctx.fillStyle = `rgba(255, 200, 150, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else {
      // Normal bullet
      const angle = Math.atan2(vy, vx);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Glow
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 15;

      // Bullet body
      ctx.fillStyle = "#ff6600";
      ctx.beginPath();
      ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = "#ffaa00";
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;

      // Trail
      ctx.fillStyle = "rgba(255, 100, 0, 0.5)";
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-15, -3);
      ctx.lineTo(-15, 3);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
  }

  beginFrame(): void {
    this.ctx.save();

    // Apply screen shake (using pre-calculated offsets from updateScreenShake)
    this.screenShake.applyTransform(this.ctx);

    // Apply camera around world-space focus.
    const zoom = this.getEffectiveCameraZoom();
    const focus = this.getClampedCameraFocus(zoom);
    const scaled = this.scale * zoom;
    this.ctx.translate(this.viewportWidth / 2, this.viewportHeight / 2);
    this.ctx.scale(scaled, scaled);
    this.ctx.translate(-focus.x, -focus.y);
  }

  endFrame(): void {
    this.ctx.restore();
  }

  updateScreenShake(dt: number): void {
    this.screenShake.update(dt, this.getNowMs());
  }

  addScreenShake(intensity: number, duration: number): void {
    this.screenShake.add(intensity, duration);
  }

  clearEffects(): void {
    this.effects.clear();
    this.shipTrails.clear();
    this.projectileDebugHistory.clear();
    this.screenShake.clear();
    this.mapEffects.clearTransientState();
  }

  getShipTrailVisualTuning(): ShipTrailVisualTuning {
    return this.shipTrails.getVisualTuning();
  }

  resetShipTrailVisualTuning(): void {
    this.shipTrails.resetVisualTuning();
  }

  setShipTrailVisualTuning(next: Partial<ShipTrailVisualTuning>): void {
    this.shipTrails.setVisualTuning(next);
  }

  private clampCameraZoom(zoom: number): number {
    if (!Number.isFinite(zoom)) return CAMERA_DEFAULT_ZOOM;
    return Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, zoom));
  }

  private getViewportZoomCompensation(baseZoom: number): number {
    if (!this.coarsePointer) return 1;
    // Keep mobile close-up from feeling undersized on short-height viewports,
    // while preserving the far-spread baseline zoom exactly.
    const shortEdge = Math.min(this.viewportWidth, this.viewportHeight);
    const t = this.clamp01((620 - shortEdge) / 280);
    const zoomInRange = Math.max(0.0001, CAMERA_MAX_ZOOM - CAMERA_DEFAULT_ZOOM);
    const zoomInT = this.clamp01((baseZoom - CAMERA_DEFAULT_ZOOM) / zoomInRange);
    return 1 + t * 0.16 * zoomInT;
  }

  private getEffectiveCameraZoom(): number {
    const baseZoom = this.clampCameraZoom(this.cameraZoom);
    return this.clampCameraZoom(baseZoom * this.getViewportZoomCompensation(baseZoom));
  }

  private getEffectBlurPx(
    baseBlurAtUnitScale: number,
    minBlur: number,
    maxBlur: number,
  ): number {
    // Shadow blur is screen-space; scale it with world->screen scale
    // so glow remains visually consistent across zoom/device sizes.
    const px = baseBlurAtUnitScale * this.scale * this.getEffectiveCameraZoom();
    return this.clamp(px, minBlur, maxBlur);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private getClampedCameraFocus(zoom: number): { x: number; y: number } {
    const viewHalfWidth = this.viewportWidth / (2 * this.scale * zoom);
    const viewHalfHeight = this.viewportHeight / (2 * this.scale * zoom);
    const edgeSlackX = viewHalfWidth * CAMERA_EDGE_SLACK_RATIO;
    const edgeSlackY = viewHalfHeight * CAMERA_EDGE_SLACK_RATIO;

    const minFocusX = viewHalfWidth - edgeSlackX;
    const maxFocusX = GAME_CONFIG.ARENA_WIDTH - viewHalfWidth + edgeSlackX;
    const minFocusY = viewHalfHeight - edgeSlackY;
    const maxFocusY = GAME_CONFIG.ARENA_HEIGHT - viewHalfHeight + edgeSlackY;

    const x =
      minFocusX > maxFocusX
        ? GAME_CONFIG.ARENA_WIDTH / 2
        : this.clamp(this.cameraFocusX, minFocusX, maxFocusX);
    const y =
      minFocusY > maxFocusY
        ? GAME_CONFIG.ARENA_HEIGHT / 2
        : this.clamp(this.cameraFocusY, minFocusY, maxFocusY);

    return { x, y };
  }

  // ============= SHIP RENDERING =============

  sampleShipTrail(state: ShipState, color: PlayerColor): void {
    this.shipTrails.sample(state, color, this.getNowMs());
  }

  drawShipTrails(): void {
    this.shipTrails.draw(this.ctx, this.getNowMs());
  }

  drawShip(
    state: ShipState,
    color: PlayerColor,
    shieldHits?: number,
    laserCharges?: number,
    laserMaxCharges?: number,
    laserCooldownProgress?: number,
    scatterCharges?: number,
    scatterCooldownProgress?: number,
    joustLeftActive?: boolean,
    joustRightActive?: boolean,
    homingMissileCharges?: number,
  ): void {
    const { ctx } = this;
    const { x, y, angle, invulnerableUntil } = state;
    const nowMs = this.getNowMs();
    const isInvulnerable = nowMs < invulnerableUntil;
    const size = SHIP_VISUAL_REFERENCE_SIZE;
    this.effects.bumpPilotDebrisWithBody(
      x,
      y,
      Math.max(6, size * 0.78),
      state.vx,
      state.vy,
    );

    ctx.save();
    ctx.translate(x, y);

    // Draw shield if present
    if (
      shieldHits !== undefined &&
      shieldHits < GAME_CONFIG.POWERUP_SHIELD_HITS
    ) {
      this.drawShield(0, 0, shieldHits);
    }

    // Draw laser cooldown circle (outside the rotation)
    if (laserCooldownProgress !== undefined && laserCooldownProgress < 1) {
      ctx.strokeStyle = "#ff0066";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        0,
        0,
        22,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * laserCooldownProgress,
      );
      ctx.stroke();
    }

    ctx.rotate(angle);

    // Draw laser charge indicators on ship tail - arranged in arc pattern
    if (laserCharges !== undefined && laserCharges > 0) {
      const maxCharges = Math.max(
        1,
        laserMaxCharges ?? GAME_CONFIG.POWERUP_LASER_CHARGES,
      );
      const dotSize = 3.5;
      const arcRadius = size * 1.3; // Distance from ship center
      const arcAngle = Math.PI * 0.6; // Total arc spread (108 degrees)

      for (let i = 0; i < maxCharges; i++) {
        // Calculate angle for this charge in the arc (spread around back of ship)
        const lerpT = maxCharges <= 1 ? 0.5 : i / (maxCharges - 1);
        const angleOffset = (lerpT - 0.5) * arcAngle;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        // Red if available, dark gray/black if used
        const isAvailable = i < laserCharges;
        ctx.fillStyle = isAvailable ? "#ff0044" : "#333333";
        ctx.strokeStyle = isAvailable ? "#ff6688" : "#222222";
        ctx.lineWidth = 1;

        // Draw bullet-like shape
        ctx.beginPath();
        ctx.ellipse(dotX, dotY, dotSize, dotSize * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Draw scatter shot charge indicators on ship tail - green balls with red centers
    if (scatterCharges !== undefined && scatterCharges > 0) {
      const maxCharges = GAME_CONFIG.POWERUP_SCATTER_CHARGES;
      const ballSize = 5;
      const arcRadius = size * 1.3;
      const arcAngle = Math.PI * 0.6;

      for (let i = 0; i < maxCharges; i++) {
        const angleOffset = (i / (maxCharges - 1) - 0.5) * arcAngle;
        const dotX = Math.cos(Math.PI + angleOffset) * arcRadius;
        const dotY = Math.sin(Math.PI + angleOffset) * arcRadius;

        const isAvailable = i < scatterCharges;

        // Green ball background
        ctx.fillStyle = isAvailable ? "#00ff44" : "#333333";
        ctx.strokeStyle = isAvailable ? "#88ffaa" : "#222222";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.arc(dotX, dotY, ballSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Red center dot
        if (isAvailable) {
          ctx.fillStyle = "#ff0044";
          ctx.beginPath();
          ctx.arc(dotX, dotY, ballSize * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw ammo indicators on ship tail (yellow dots) - rotating around ship
    // Only show when no laser/scatter/homing/joust power-up is active
    if (
      laserCharges === undefined &&
      scatterCharges === undefined &&
      homingMissileCharges === undefined &&
      joustLeftActive === undefined &&
      joustRightActive === undefined &&
      state.maxAmmo > 0
    ) {
      const maxAmmo = state.maxAmmo;
      const currentAmmo = state.ammo;
      const dotRadius = 2.4;
      const orbitRadius = size * 1.3; // Distance from ship center
      const rotation = nowMs * 0.0008; // Slow rotation like missile

      for (let i = 0; i < maxAmmo; i++) {
        // Calculate angle for this ammo rotating around the back of ship
        const angleOffset = (i / maxAmmo) * Math.PI * 2;
        const totalAngle = rotation + angleOffset;
        const dotX = Math.cos(Math.PI + totalAngle) * orbitRadius;
        const dotY = Math.sin(Math.PI + totalAngle) * orbitRadius;

        // Duller circular indicators for normal ammo.
        const isAvailable = i < currentAmmo;
        ctx.fillStyle = isAvailable ? "#b9ac68" : "#343434";
        ctx.strokeStyle = isAvailable ? "#8f844f" : "#262626";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // Draw Homing Missile indicator (red ball on back) - rotates slowly
    if (homingMissileCharges !== undefined && homingMissileCharges > 0) {
      const rotation = nowMs * 0.001; // Slow rotation
      const orbitRadius = size * 1.4;
      const ballX = Math.cos(Math.PI + rotation) * orbitRadius;
      const ballY = Math.sin(Math.PI + rotation) * orbitRadius;

      // Red ball glow
      ctx.shadowColor = "#ff0044";
      ctx.shadowBlur = this.getEffectBlurPx(15, 7, 22);
      ctx.fillStyle = "#ff0044";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ff6688";
      ctx.beginPath();
      ctx.arc(ballX, ballY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Joust lightsabers on ship - positioned at 45 degrees from back corners
    // Left sword: starts at left back corner, points forward at 45 degrees
    // Right sword: starts at right back corner, points forward at 45 degrees
    // This creates a V-shape pointing forward like: >
    if (joustLeftActive !== undefined || joustRightActive !== undefined) {
      const swordLength = GAME_CONFIG.POWERUP_JOUST_SIZE;
      const swordWidth = GAME_CONFIG.POWERUP_JOUST_WIDTH;

      // Glow effect for lightsabers
      ctx.shadowColor = "#00ff44";
      ctx.shadowBlur = this.getEffectBlurPx(20, 8, 28);

      // Left sword - starts at left back corner (top wing), extends straight forward at 0 degrees
      if (joustLeftActive) {
        // Start position from ship asset-derived local hardpoint.
        const startX = SHIP_JOUST_LOCAL_POINTS.left.x;
        const startY = SHIP_JOUST_LOCAL_POINTS.left.y;

        // Angle: 0 degrees from ship centerline (pointing straight forward)
        // Both swords point straight forward, parallel to ship direction
        const swordAngle = 0;

        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(swordAngle);

        // Sword blade (green glow) - extending outward from the corner
        ctx.fillStyle = "#00ff44";
        ctx.fillRect(0, -swordWidth / 2, swordLength, swordWidth);

        // Inner bright core
        ctx.fillStyle = "#88ffaa";
        ctx.fillRect(0, -swordWidth / 4, swordLength, swordWidth / 2);

        // Hilt at the corner
        ctx.fillStyle = "#666666";
        ctx.fillRect(-4, -swordWidth, 8, swordWidth * 2);

        ctx.restore();
      }

      // Right sword - starts at right back corner (bottom wing), extends straight forward at 0 degrees
      if (joustRightActive) {
        // Start position from ship asset-derived local hardpoint.
        const startX = SHIP_JOUST_LOCAL_POINTS.right.x;
        const startY = SHIP_JOUST_LOCAL_POINTS.right.y;

        // Angle: 0 degrees from ship centerline (pointing straight forward)
        // Both swords point straight forward, parallel to ship direction
        const swordAngle = 0;

        ctx.save();
        ctx.translate(startX, startY);
        ctx.rotate(swordAngle);

        // Sword blade (green glow) - extending outward from the corner
        ctx.fillStyle = "#00ff44";
        ctx.fillRect(0, -swordWidth / 2, swordLength, swordWidth);

        // Inner bright core
        ctx.fillStyle = "#88ffaa";
        ctx.fillRect(0, -swordWidth / 4, swordLength, swordWidth / 2);

        // Hilt at the corner
        ctx.fillStyle = "#666666";
        ctx.fillRect(-4, -swordWidth, 8, swordWidth * 2);

        ctx.restore();
      }

      ctx.shadowBlur = 0;
    }

    // Flash when invulnerable
    const shouldFlash = isInvulnerable && Math.floor(nowMs / 100) % 2 === 0;
    if (shouldFlash) {
      ctx.globalAlpha = 0.5;
    }

    // Ship glow disabled for visual comparison pass.
    this.entitySprites.drawEntity(this.ctx, "ship", {
      "slot-primary": color.primary,
    });

    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ============= PILOT RENDERING =============

  drawPilot(state: PilotState, color: PlayerColor): void {
    const { ctx } = this;
    const { x, y, angle, survivalProgress } = state;
    const nowMs = this.getNowMs();
    const isFlashing =
      survivalProgress > 0.6 && Math.floor(nowMs / 150) % 2 === 0;
    const pilotScale = this.effects.getPilotDebrisScaleFactor();
    this.effects.bumpPilotDebrisWithBody(
      x,
      y,
      Renderer.PILOT_DEBRIS_BASELINE_BUMP_RADIUS * pilotScale,
      state.vx,
      state.vy,
    );

    ctx.save();
    ctx.translate(x, y);

    if (isFlashing) {
      ctx.globalAlpha = 0.5;
    }

    // Survival progress ring
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      15,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * survivalProgress,
    );
    ctx.stroke();

    // Astronaut
    ctx.save();
    ctx.rotate(angle);

    const swimIntensity = this.getPilotSwimArmIntensity(state);
    const swimPhase = nowMs * 0.021;

    this.entitySprites.drawEntity(this.ctx, "pilot", {
      "slot-primary": color.primary,
      "slot-secondary": "#f4fbff",
      "slot-tertiary": "#1d2636",
      "slot-outline": "#ffffff",
    });
    this.drawPilotSwimArms(ctx, swimPhase, swimIntensity, color.primary);

    ctx.restore();

    ctx.restore();
  }

  private getPilotSwimArmIntensity(state: PilotState): number {
    const speed = Math.hypot(state.vx, state.vy);
    return Math.max(0.7, Math.min(1.25, 0.72 + speed / 120));
  }

  private drawPilotSwimArms(
    ctx: CanvasRenderingContext2D,
    phase: number,
    intensity: number,
    armColor: string,
  ): void {
    const armFrequency = phase * (1 + (intensity - 0.7) * 0.55);
    this.drawSinglePilotSwimArm(
      ctx,
      PILOT_EFFECT_LOCAL_POINTS.armLeft.x,
      PILOT_EFFECT_LOCAL_POINTS.armLeft.y,
      armFrequency,
      intensity,
      armColor,
      -1,
    );
    this.drawSinglePilotSwimArm(
      ctx,
      PILOT_EFFECT_LOCAL_POINTS.armRight.x,
      PILOT_EFFECT_LOCAL_POINTS.armRight.y,
      armFrequency + Math.PI,
      intensity,
      armColor,
      1,
    );
  }

  private drawSinglePilotSwimArm(
    ctx: CanvasRenderingContext2D,
    anchorX: number,
    anchorY: number,
    phase: number,
    intensity: number,
    armColor: string,
    verticalDirection: 1 | -1,
  ): void {
    const lateralBase = 8.4 + intensity * 2.3;
    const lateralSwing = Math.sin(phase) * (2.8 + intensity * 1.2);
    const trailingPull = Math.cos(phase) * (2.2 + intensity * 0.9);
    const controlLift = Math.sin(phase * 0.5) * 1.2;

    const endX = anchorX - 1.6 - trailingPull;
    const endY = anchorY + verticalDirection * (lateralBase + lateralSwing);
    const controlX = anchorX - 1.1 - trailingPull * 0.45;
    const controlY =
      anchorY +
      verticalDirection * (lateralBase * 0.58 + lateralSwing * 0.72) +
      controlLift;

    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.lineWidth = 3.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(226, 246, 255, 0.84)";
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = armColor;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endX, endY, 1.45 + intensity * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = armColor;
    ctx.fill();
  }

  // ============= ASTEROID RENDERING =============

  drawAsteroid(state: AsteroidState): void {
    const { ctx } = this;
    const { x, y, angle, vertices } = state;
    const isGrey = state.variant === "GREY";
    const glowColor = isGrey
      ? GAME_CONFIG.GREY_ASTEROID_GLOW
      : GAME_CONFIG.ASTEROID_GLOW;
    const bodyColor = isGrey
      ? GAME_CONFIG.GREY_ASTEROID_COLOR
      : GAME_CONFIG.ASTEROID_COLOR;
    const strokeColor = isGrey ? "#b9c0d4" : "#ffaa00";

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow effect
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;

    // Asteroid body
    ctx.fillStyle = bodyColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;

    ctx.beginPath();
    if (vertices.length > 0) {
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
    } else {
      ctx.arc(0, 0, state.size, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Add some surface detail (craters)
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    const craterSource = vertices[0] ?? { x: state.size * 0.7, y: 0 };
    ctx.beginPath();
    ctx.arc(
      craterSource.x * 0.3,
      craterSource.y * 0.3,
      Math.max(3, Math.abs(craterSource.x) * 0.25),
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  // ============= PROJECTILE RENDERING =============

  drawProjectile(state: ProjectileState): void {
    const { ctx } = this;
    const { x, y, vx, vy } = state;
    const angle = Math.atan2(vy, vx);
    const glowRadius = Math.max(
      0.1,
      state.visualGlowRadius ?? GAME_CONFIG.PROJECTILE_VISUAL_GLOW_RADIUS,
    );
    const coreRadius = Math.max(0.1, state.radius ?? GAME_CONFIG.PROJECTILE_RADIUS);
    const tailRadiusX = coreRadius * 1.9;
    const tailRadiusY = coreRadius * 0.62;
    // Keep the visible front edge locked to the collider front (+coreRadius).
    const tailCenterX = coreRadius - tailRadiusX;
    const tailBackX = tailCenterX - tailRadiusX;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Trailing visual only (does not affect hit area).
    const tailGradient = ctx.createLinearGradient(tailBackX, 0, coreRadius, 0);
    tailGradient.addColorStop(0, "rgba(255,255,255,0)");
    tailGradient.addColorStop(0.65, "rgba(255,255,255,0.45)");
    tailGradient.addColorStop(1, "rgba(255,255,255,0.9)");
    ctx.fillStyle = tailGradient;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.ellipse(tailCenterX, 0, tailRadiusX, tailRadiusY, 0, 0, Math.PI * 2);
    ctx.fill();

    // Damaging core (matches physics radius 1:1).
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    if (this.devModeEnabled) {
      // Exact projectile collider.
      ctx.strokeStyle = "rgba(255, 120, 70, 0.95)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawShipColliderDebug(state: ShipState): void {
    if (!this.devModeEnabled) return;
    const { ctx } = this;
    const vertices = transformLocalVertices(
      SHIP_COLLIDER_VERTICES,
      state.x,
      state.y,
      state.angle,
    );
    if (vertices.length < 3) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 170, 0, 0.95)";
    ctx.fillStyle = "rgba(255, 170, 0, 0.12)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i += 1) {
      ctx.lineTo(vertices[i].x, vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ship center marker for quick visual sanity checks.
    ctx.strokeStyle = "rgba(255, 220, 120, 0.95)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(state.x - 2.5, state.y);
    ctx.lineTo(state.x + 2.5, state.y);
    ctx.moveTo(state.x, state.y - 2.5);
    ctx.lineTo(state.x, state.y + 2.5);
    ctx.stroke();
    ctx.restore();
  }

  drawProjectileSweepDebug(projectiles: ProjectileState[]): void {
    if (!this.devModeEnabled) return;
    const { ctx } = this;
    const nowMs = this.getNowMs();
    const activeProjectileIds = new Set<string>();

    for (const projectile of projectiles) {
      activeProjectileIds.add(projectile.id);
      const radius = Math.max(
        0.1,
        projectile.radius ?? GAME_CONFIG.PROJECTILE_RADIUS,
      );
      const history = this.projectileDebugHistory.get(projectile.id) ?? [];
      const last = history[history.length - 1];
      if (!last || Math.hypot(projectile.x - last.x, projectile.y - last.y) > 0.01) {
        history.push({ x: projectile.x, y: projectile.y, atMs: nowMs });
      } else {
        last.atMs = nowMs;
      }
      while (history.length > 14) {
        history.shift();
      }
      while (history.length > 2 && nowMs - history[0].atMs > 380) {
        history.shift();
      }
      this.projectileDebugHistory.set(projectile.id, history);

      const previous = history.length > 1 ? history[history.length - 2] : null;

      if (previous) {
        const dx = projectile.x - previous.x;
        const dy = projectile.y - previous.y;
        const distSq = dx * dx + dy * dy;

        ctx.save();
        for (let i = 1; i < history.length; i += 1) {
          const a = history[i - 1];
          const b = history[i];
          const t = i / history.length;
          ctx.strokeStyle = `rgba(255, 170, 120, ${0.18 + t * 0.42})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }

        if (distSq > 1e-6) {
          // Capsule body matching swept-circle width (diameter = 2 * radius).
          ctx.strokeStyle = "rgba(255, 90, 40, 0.45)";
          ctx.lineWidth = radius * 2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          ctx.lineTo(projectile.x, projectile.y);
          ctx.stroke();
        }

        // End circles and center line to make the sweep easier to read.
        ctx.strokeStyle = "rgba(255, 120, 70, 0.95)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(previous.x, previous.y, radius, 0, Math.PI * 2);
        ctx.arc(projectile.x, projectile.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255, 220, 170, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(previous.x, previous.y);
        ctx.lineTo(projectile.x, projectile.y);
        ctx.stroke();

        // Explicit prev/curr markers.
        ctx.fillStyle = "rgba(255, 210, 120, 0.95)";
        ctx.beginPath();
        ctx.arc(previous.x, previous.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 120, 70, 0.95)";
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Tiny P/C labels so you can tell direction at a glance.
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255, 230, 170, 0.95)";
        ctx.fillText("P", previous.x, previous.y - Math.max(3, radius + 1));
        ctx.fillStyle = "rgba(255, 150, 110, 0.95)";
        ctx.fillText("C", projectile.x, projectile.y - Math.max(3, radius + 1));
        ctx.restore();
      }

    }
    for (const projectileId of [...this.projectileDebugHistory.keys()]) {
      if (activeProjectileIds.has(projectileId)) continue;
      this.projectileDebugHistory.delete(projectileId);
    }
  }

  // ============= PARTICLE SYSTEM =============

  spawnParticle(
    x: number,
    y: number,
    color: string,
    type: "explosion" | "thrust" | "hit",
  ): void {
    this.effects.spawnParticle(x, y, color, type);
  }

  spawnExplosion(x: number, y: number, color: string): void {
    this.effects.spawnExplosion(x, y, color);
  }

  spawnShipDestroyedBurst(x: number, y: number, color: string): void {
    this.effects.spawnShipDestroyedBurst(x, y, color);
  }

  spawnNitroParticle(x: number, y: number, color: string): void {
    this.effects.spawnNitroParticle(x, y, color);
  }

  spawnDashParticles(
    x: number,
    y: number,
    shipAngle: number,
    color: string,
    count: number = 12,
  ): void {
    this.effects.spawnDashParticles(x, y, shipAngle, color, count);
  }

  spawnPilotDashBurstParticles(
    x: number,
    y: number,
    pilotAngle: number,
    color: string,
  ): void {
    this.effects.spawnPilotDashBurstParticles(x, y, pilotAngle, color);
  }

  spawnBulletCasing(
    x: number,
    y: number,
    shotAngle: number,
    inheritedVx: number = 0,
    inheritedVy: number = 0,
  ): void {
    this.effects.spawnBulletCasing(x, y, shotAngle, inheritedVx, inheritedVy);
  }

  spawnAsteroidDebris(x: number, y: number, size: number, color: string): void {
    this.effects.spawnAsteroidDebris(x, y, size, color);
  }

  spawnShipDebris(x: number, y: number, color: string): void {
    this.effects.spawnShipDebris(x, y, color);
  }

  spawnPilotKillBurst(x: number, y: number, color: string): void {
    this.effects.spawnPilotKillBurst(x, y, color);
  }

  spawnPilotDeathBurst(x: number, y: number, color: string): void {
    this.effects.spawnPilotDeathBurst(x, y, color);
  }

  drawPilotDeathDebris(): void {
    this.effects.drawPilotDeathDebris();
  }

  updateParticles(dt: number): void {
    this.effects.updateParticles(dt);
  }

  drawBulletCasings(): void {
    this.effects.drawBulletCasings();
  }

  drawParticles(): void {
    this.effects.drawParticles();
  }

  // ============= POWER-UP RENDERING =============

  drawPowerUp(state: PowerUpState): void {
    const { ctx } = this;
    const { x, y, type, remainingTimeFraction } = state;
    const size = GAME_CONFIG.POWERUP_SIZE;
    const progress = Math.min(1, Math.max(0, remainingTimeFraction));

    ctx.save();
    ctx.translate(x, y);

    // Draw despawn ring
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      size * 0.8,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progress,
    );
    ctx.stroke();

    const glowColor = this.powerUpSprites.getGlowColor(type);
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = this.getEffectBlurPx(15, 7, 22);

    const drewSprite = this.powerUpSprites.drawPowerUp(ctx, type, size);
    ctx.shadowBlur = 0;

    if (!drewSprite) {
      ctx.fillStyle = glowColor;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeRect(-size / 2, -size / 2, size, size);
    }

    ctx.restore();
  }

  // ============= LASER BEAM RENDERING =============

  drawLaserBeam(state: LaserBeamState, beamWidthOverride?: number): void {
    const { ctx } = this;
    const { x, y, angle, id } = state;
    const beamEnd = projectRayToArenaWall(
      { x, y },
      angle,
      GAME_CONFIG.ARENA_WIDTH,
      GAME_CONFIG.ARENA_HEIGHT,
    );
    const beamLength = Math.hypot(beamEnd.x - x, beamEnd.y - y);
    const beamWidth = Number.isFinite(beamWidthOverride)
      ? Math.max(1, beamWidthOverride as number)
      : GAME_CONFIG.POWERUP_BEAM_WIDTH;
    // Use deterministic offsets based on beam id to avoid flickering
    const baseOffset = (id.charCodeAt(id.length - 1) % 10) / 10;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Main beam gradient
    const gradient = ctx.createLinearGradient(
      0,
      -beamWidth / 2,
      0,
      beamWidth / 2,
    );
    gradient.addColorStop(0, "rgba(255, 0, 100, 0.3)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.9)");
    gradient.addColorStop(1, "rgba(255, 0, 100, 0.3)");

    // Draw main beam
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -beamWidth / 2, beamLength, beamWidth);

    // Core beam (bright white center)
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(0, -beamWidth / 4, beamLength, beamWidth / 2);

    // Wire-like effect (sharp lines) - deterministic based on id
    ctx.strokeStyle = "rgba(255, 150, 200, 0.6)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const offset = (((baseOffset + i * 0.2) % 1) - 0.5) * beamWidth * 0.8;
      ctx.beginPath();
      ctx.moveTo(0, offset);
      ctx.lineTo(
        beamLength,
        offset + Math.sin(i * 1.5 + baseOffset * Math.PI) * 5,
      );
      ctx.stroke();
    }

    // Glow effect at beam origin
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    glowGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    glowGradient.addColorStop(0.5, "rgba(255, 0, 100, 0.5)");
    glowGradient.addColorStop(1, "transparent");
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ============= SHIELD RENDERING =============

  drawShield(x: number, y: number, hits: number): void {
    const { ctx } = this;

    // Color based on hits: 0 = blue, 1 = red
    const isDamaged = hits >= 1;
    const alpha = 0.4;
    const color = isDamaged
      ? `rgba(255, 50, 50, ${alpha})`
      : `rgba(50, 150, 255, ${alpha})`;
    const glowColor = isDamaged ? "#ff3333" : "#3399ff";

    ctx.save();
    ctx.translate(x, y);

    // Glow effect
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = this.getEffectBlurPx(20, 8, 28);

    // Draw oval shield
    ctx.fillStyle = color;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.ellipse(0, 0, SHIP_SHIELD_RADII.x, SHIP_SHIELD_RADII.y, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  spawnShieldBreakDebris(x: number, y: number): void {
    this.effects.spawnShieldBreakDebris(x, y);
  }

  // ============= ARENA BORDER =============

  drawArenaBorder(borderColor: string = "#00f0ff"): void {
    this.mapEffects.drawArenaBorder(borderColor);
  }

  drawYellowBlock(block: YellowBlock): void {
    this.mapEffects.drawYellowBlock(block);
  }

  drawCenterHole(
    hole: CenterHole,
    time: number,
    playerMovementDirection: number,
    theme?: {
      ring: string;
      innerRing: string;
      arrow: string;
      glow: string;
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
    },
  ): void {
    this.mapEffects.drawCenterHole(
      hole,
      time,
      playerMovementDirection,
      theme,
    );
  }

  drawRepulsionZone(
    zone: RepulsionZone,
    time: number,
    theme?: {
      gradientInner: string;
      gradientMid: string;
      gradientOuter: string;
      core: string;
      ring: string;
      arrow: string;
      glow: string;
    },
  ): void {
    this.mapEffects.drawRepulsionZone(zone, time, theme);
  }

  hasMapOverlay(mapId: MapId): boolean {
    return this.mapOverlays.hasOverlay(mapId);
  }

  drawMapOverlay(mapId: MapId): void {
    this.mapOverlays.drawMapOverlay(this.ctx, mapId);
  }

  // ============= UI ELEMENTS =============

  drawCountdown(count: number): void {
    const { ctx } = this;
    const text = count > 0 ? count.toString() : "FIGHT!";

    // Countdown is drawn in arena coordinates (already transformed)
    ctx.save();
    ctx.font = "bold 80px Orbitron, sans-serif";
    ctx.fillStyle = count > 0 ? "#ffee00" : "#00ff88";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 30;
    // Center of arena
    ctx.fillText(
      text,
      GAME_CONFIG.ARENA_WIDTH / 2,
      GAME_CONFIG.ARENA_HEIGHT / 2,
    );
    ctx.restore();
  }

  getPlayerColor(index: number): PlayerColor {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
  }

  // ============= MINE RENDERING =============

  drawMineState(state: import("../../types").MineState): void {
    const { x, y, exploded, explosionTime } = state;
    const nowMs = this.getNowMs();

    // Check if mine has exploded
    if (exploded && explosionTime > 0) {
      // Draw explosion effect on client - lasts 500ms
      const elapsed = nowMs - explosionTime;
      const progress = this.clamp01(elapsed / 500);
      const radius =
        GAME_CONFIG.POWERUP_MINE_EXPLOSION_RADIUS * (0.3 + progress * 0.7);
      const alpha = 1 - progress;

      drawMineExplosionEffect(this.ctx, x, y, radius, alpha);
      return;
    }

    drawMineBody(this.ctx, x, y, nowMs, GAME_CONFIG.POWERUP_MINE_SIZE);
  }

  spawnMineExplosion(x: number, y: number, radius: number): void {
    this.effects.spawnMineExplosion(x, y, radius);
  }

  // ============= HOMING MISSILE RENDERING =============

  drawHomingMissile(state: HomingMissileState): void {
    const { ctx } = this;
    const { x, y, angle } = state;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Glow effect
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur = 15;

    // Rocket body (metallic gray)
    ctx.fillStyle = "#888888";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rocket nose (pointed)
    ctx.fillStyle = "#aaaaaa";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(4, -4);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();

    // Fins
    ctx.fillStyle = "#666666";
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, 4);
    ctx.lineTo(-10, 8);
    ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;

    // Fire and smoke particles at the tail
    const tailX = -10;
    const time = this.getNowMs() * 0.02;

    // Fire (orange/yellow)
    ctx.fillStyle = "#ff8800";
    ctx.globalAlpha = 0.7 + Math.sin(time) * 0.2;
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(tailX - 8 - Math.sin(time * 1.5) * 3, -3);
    ctx.lineTo(tailX - 12 - Math.sin(time * 2) * 4, 0);
    ctx.lineTo(tailX - 8 - Math.sin(time * 1.5) * 3, 3);
    ctx.closePath();
    ctx.fill();

    // Inner fire (yellow)
    ctx.fillStyle = "#ffee00";
    ctx.globalAlpha = 0.8 + Math.sin(time * 1.2) * 0.15;
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(tailX - 5 - Math.sin(time * 1.8) * 2, -2);
    ctx.lineTo(tailX - 8 - Math.sin(time * 2.2) * 3, 0);
    ctx.lineTo(tailX - 5 - Math.sin(time * 1.8) * 2, 2);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;

    // Smoke trail (gray)
    ctx.fillStyle = "#555555";
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 3; i++) {
      const offset = (time * 0.5 + i * 2) % 8;
      const smokeX = tailX - 12 - offset * 2;
      const smokeSize = 2 + offset * 0.5;
      ctx.beginPath();
      ctx.arc(smokeX, Math.sin(time + i) * 2, smokeSize, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
