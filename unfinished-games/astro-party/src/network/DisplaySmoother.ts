/**
 * DisplaySmoother — Velocity extrapolation + smooth correction for non-host rendering.
 *
 * Between 50ms network snapshots, entities are advanced using their last-known
 * velocity so they glide smoothly at 60fps. When a new snapshot arrives, display
 * positions blend toward the corrected target instead of snapping.
 */

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpAngle = (a: number, b: number, t: number): number => {
  const twoPi = Math.PI * 2;
  let diff = (b - a) % twoPi;
  if (diff > Math.PI) diff -= twoPi;
  if (diff < -Math.PI) diff += twoPi;
  return a + diff * t;
};

interface SmoothedEntity {
  dx: number;
  dy: number;
  da: number;
  tx: number;
  ty: number;
  ta: number;
  vx: number;
  vy: number;
  age: number;
  isNew: boolean;
}

export class DisplaySmoother {
  private entities: Map<string, SmoothedEntity> = new Map();

  constructor(
    private blendFactor: number,
    private hardSnapDistance: number,
  ) {}

  /** Update targets from a new network snapshot. */
  applySnapshot<T extends { x: number; y: number; angle?: number; vx: number; vy: number }>(
    items: T[],
    getId: (item: T) => string,
  ): void {
    const activeIds = new Set<string>();
    for (const item of items) {
      const id = getId(item);
      activeIds.add(id);
      const existing = this.entities.get(id);
      const angle = item.angle ?? 0;
      if (existing) {
        existing.tx = item.x;
        existing.ty = item.y;
        existing.ta = angle;
        existing.vx = item.vx;
        existing.vy = item.vy;
        existing.age = 0;
        // Hard snap if too far off
        const ddx = existing.dx - item.x;
        const ddy = existing.dy - item.y;
        if (ddx * ddx + ddy * ddy > this.hardSnapDistance * this.hardSnapDistance) {
          existing.dx = item.x;
          existing.dy = item.y;
          existing.da = angle;
        }
      } else {
        this.entities.set(id, {
          dx: item.x,
          dy: item.y,
          da: angle,
          tx: item.x,
          ty: item.y,
          ta: angle,
          vx: item.vx,
          vy: item.vy,
          age: 0,
          isNew: true,
        });
      }
    }
    // Remove entities no longer in snapshot (skip if snapshot was empty to
    // avoid wiping all display state on a network glitch)
    if (activeIds.size > 0) {
      for (const id of this.entities.keys()) {
        if (!activeIds.has(id)) {
          this.entities.delete(id);
        }
      }
    }
  }

  /** Advance display positions each frame. Call once per render frame. */
  update(dtMs: number): void {
    for (const e of this.entities.values()) {
      e.age += dtMs;
      if (e.isNew) {
        e.isNew = false;
        continue; // Already snapped on creation
      }
      // Cap extrapolation to 200ms to avoid overshoot on late snapshots
      const ageSec = Math.min(e.age, 200) / 1000;
      const targetX = e.tx + e.vx * ageSec;
      const targetY = e.ty + e.vy * ageSec;
      e.dx = lerp(e.dx, targetX, this.blendFactor);
      e.dy = lerp(e.dy, targetY, this.blendFactor);
      e.da = lerpAngle(e.da, e.ta, this.blendFactor);
    }
  }

  /** Return items with display positions replacing snapshot positions. */
  smooth<T extends { x: number; y: number; angle?: number }>(
    items: T[],
    getId: (item: T) => string,
  ): T[] {
    return items.map((item) => {
      const e = this.entities.get(getId(item));
      if (!e) return item;
      const result = { ...item, x: e.dx, y: e.dy };
      if ("angle" in item) {
        (result as T & { angle: number }).angle = e.da;
      }
      return result;
    });
  }

  /** Nudge a specific entity's display angle (for local input hint). */
  nudgeAngle(id: string, delta: number): void {
    const e = this.entities.get(id);
    if (e) e.da += delta;
  }

  clear(): void {
    this.entities.clear();
  }
}
