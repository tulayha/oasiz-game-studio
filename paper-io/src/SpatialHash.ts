import { type Vec2 } from './constants.ts';

/**
 * Spatial hash grid for fast segment-vs-trail collision queries.
 * Inserts trail segments into grid cells, then only checks segments
 * in cells near the query segment.
 */
export class SpatialHash {
  private cellSize: number;
  private cells: Map<number, { playerId: number; segIdx: number }[]> = new Map();
  private w: number; // grid width for key hashing

  constructor(cellSize = 4) {
    this.cellSize = cellSize;
    this.w = 1000; // large enough to avoid collisions
  }

  clear(): void {
    this.cells.clear();
  }

  private key(cx: number, cz: number): number {
    return (cx + 500) * this.w + (cz + 500);
  }

  /** Insert all segments of a player's trail */
  insertTrail(playerId: number, trail: Vec2[]): void {
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i];
      const b = trail[i + 1];
      const minCX = Math.floor(Math.min(a.x, b.x) / this.cellSize);
      const maxCX = Math.floor(Math.max(a.x, b.x) / this.cellSize);
      const minCZ = Math.floor(Math.min(a.z, b.z) / this.cellSize);
      const maxCZ = Math.floor(Math.max(a.z, b.z) / this.cellSize);

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          const k = this.key(cx, cz);
          let bucket = this.cells.get(k);
          if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
          }
          bucket.push({ playerId, segIdx: i });
        }
      }
    }
  }

  /** Query all trail segments that could intersect the segment a→b */
  query(a: Vec2, b: Vec2): { playerId: number; segIdx: number }[] {
    const minCX = Math.floor(Math.min(a.x, b.x) / this.cellSize);
    const maxCX = Math.floor(Math.max(a.x, b.x) / this.cellSize);
    const minCZ = Math.floor(Math.min(a.z, b.z) / this.cellSize);
    const maxCZ = Math.floor(Math.max(a.z, b.z) / this.cellSize);

    const results: { playerId: number; segIdx: number }[] = [];
    const seen = new Set<string>();

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const bucket = this.cells.get(this.key(cx, cz));
        if (!bucket) continue;
        for (const entry of bucket) {
          const dedupKey = `${entry.playerId}_${entry.segIdx}`;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            results.push(entry);
          }
        }
      }
    }

    return results;
  }
}
