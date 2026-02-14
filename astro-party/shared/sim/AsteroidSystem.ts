import type { SimState, RuntimeAsteroid } from "./types.js";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  ARENA_PADDING,
  ASTEROID_INITIAL_MIN,
  ASTEROID_INITIAL_MAX,
  ASTEROID_LARGE_MIN,
  ASTEROID_LARGE_MAX,
  ASTEROID_SMALL_MIN,
  ASTEROID_SMALL_MAX,
  ASTEROID_SPLIT_COUNT,
  ASTEROID_DRIFT_MIN,
  ASTEROID_DRIFT_MAX,
  ASTEROID_RESTITUTION,
  ASTEROID_DROP_CHANCE,
  ASTEROID_VERTICES_MIN,
  ASTEROID_VERTICES_MAX,
  ASTEROID_SPAWN_INTERVAL_MIN_MS,
  ASTEROID_SPAWN_INTERVAL_MAX_MS,
  ASTEROID_SPAWN_BATCH_MIN,
  ASTEROID_SPAWN_BATCH_MAX,
  POWERUP_SPAWN_WEIGHTS,
  POWERUP_MAGNETIC_RADIUS,
  POWERUP_MAGNETIC_SPEED,
} from "./constants.js";
import type { PowerUpType } from "./types.js";
import { clamp } from "./utils.js";

interface Point2D {
  x: number;
  y: number;
}

export function spawnInitialAsteroids(sim: SimState): void {
  if (sim.settings.asteroidDensity === "NONE") return;
  const { min, max } = getInitialAsteroidRange(sim);
  const count = sim.asteroidRng.nextInt(min, max);

  const centerX = ARENA_WIDTH * 0.5;
  const centerY = ARENA_HEIGHT * 0.5;
  const spreadX = ARENA_WIDTH * 0.28;
  const spreadY = ARENA_HEIGHT * 0.28;
  const maxAttempts = 20;

  for (let i = 0; i < count; i++) {
    const tier = i === 0 ? "LARGE" : rollAsteroidTier(sim);
    const size = randomAsteroidSize(sim, tier);
    let x = centerX;
    let y = centerY;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateX = centerX + (sim.asteroidRng.next() * 2 - 1) * spreadX;
      const candidateY = centerY + (sim.asteroidRng.next() * 2 - 1) * spreadY;
      if (isAsteroidSpawnClear(sim, candidateX, candidateY, size)) {
        x = candidateX;
        y = candidateY;
        break;
      }
    }

    const angle = sim.asteroidRng.next() * Math.PI * 2;
    const speed = sim.asteroidRng.nextRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
    const velocityScale = 0.75;
    sim.asteroids.push({
      id: sim.nextEntityId("ast"),
      x,
      y,
      vx: Math.cos(angle) * speed * velocityScale,
      vy: Math.sin(angle) * speed * velocityScale,
      angle: 0,
      angularVelocity: randomAsteroidAngularVelocity(sim),
      size,
      alive: true,
      vertices: generateAsteroidVertices(sim, size),
    });
  }
}

export function scheduleAsteroidSpawn(sim: SimState): void {
  if (sim.settings.asteroidDensity !== "SPAWN") {
    sim.nextAsteroidSpawnAtMs = null;
    return;
  }
  const round = Math.max(1, sim.currentRound);
  const t = clamp((round - 1) / 4, 0, 1);
  const intervalScale = 3 + ((1 / 1.5) - 3) * t;
  const delay = sim.asteroidRng.nextRange(
    ASTEROID_SPAWN_INTERVAL_MIN_MS,
    ASTEROID_SPAWN_INTERVAL_MAX_MS,
  );
  sim.nextAsteroidSpawnAtMs = sim.nowMs + delay * intervalScale;
}

export function updateAsteroidSpawning(sim: SimState): void {
  if (sim.settings.asteroidDensity !== "SPAWN") return;
  if (sim.nextAsteroidSpawnAtMs === null) {
    scheduleAsteroidSpawn(sim);
    return;
  }
  if (sim.nowMs < sim.nextAsteroidSpawnAtMs) return;

  const batch = sim.asteroidRng.nextInt(ASTEROID_SPAWN_BATCH_MIN, ASTEROID_SPAWN_BATCH_MAX);
  for (let i = 0; i < batch; i++) {
    spawnSingleAsteroidFromBorder(sim);
  }
  scheduleAsteroidSpawn(sim);
}

export function updateAsteroids(sim: SimState, dtSec: number): void {
  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    asteroid.angle += asteroid.angularVelocity * dtSec;
  }
}

export function destroyAsteroid(sim: SimState, asteroid: RuntimeAsteroid): void {
  if (!asteroid.alive) return;
  asteroid.alive = false;
  sim.triggerScreenShake(8, 0.2);

  if (asteroid.size >= ASTEROID_LARGE_MIN) {
    splitAsteroid(sim, asteroid);
  }

  if (asteroid.size < ASTEROID_LARGE_MIN && sim.powerUpRng.next() <= ASTEROID_DROP_CHANCE) {
    const entries = Object.entries(POWERUP_SPAWN_WEIGHTS) as Array<[PowerUpType, number]>;
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    const r = sim.powerUpRng.next() * total;
    let cumulative = 0;
    let type: PowerUpType = entries[0][0];
    for (const [entryType, weight] of entries) {
      cumulative += weight;
      if (r <= cumulative) {
        type = entryType;
        break;
      }
    }
    sim.powerUps.push({
      id: sim.nextEntityId("pow"),
      x: asteroid.x,
      y: asteroid.y,
      type,
      spawnTime: sim.nowMs,
      remainingTimeFraction: 1,
      alive: true,
      magneticRadius: POWERUP_MAGNETIC_RADIUS,
      isMagneticActive: false,
      magneticSpeed: POWERUP_MAGNETIC_SPEED,
      targetPlayerId: null,
    });
  }
}

function splitAsteroid(sim: SimState, asteroid: RuntimeAsteroid): void {
  const baseVx = asteroid.vx * 0.4;
  const baseVy = asteroid.vy * 0.4;
  for (let i = 0; i < ASTEROID_SPLIT_COUNT; i++) {
    const angle =
      (Math.PI * 2 * i) / ASTEROID_SPLIT_COUNT + (sim.asteroidRng.next() - 0.5) * 0.6;
    const speed = sim.asteroidRng.nextRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
    const offset = 10 + sim.asteroidRng.next() * 6;
    const size = randomAsteroidSize(sim, "SMALL");
    sim.asteroids.push({
      id: sim.nextEntityId("ast"),
      x: asteroid.x + Math.cos(angle) * offset,
      y: asteroid.y + Math.sin(angle) * offset,
      vx: baseVx + Math.cos(angle) * speed,
      vy: baseVy + Math.sin(angle) * speed,
      angle: 0,
      angularVelocity: randomAsteroidAngularVelocity(sim),
      size,
      alive: true,
      vertices: generateAsteroidVertices(sim, size),
    });
  }
}

function spawnSingleAsteroidFromBorder(sim: SimState): void {
  const inset = ARENA_PADDING + 6;
  const side = Math.floor(sim.asteroidRng.next() * 4);

  let x = inset;
  let y = inset;
  if (side === 0) {
    x = inset + sim.asteroidRng.next() * (ARENA_WIDTH - inset * 2);
    y = inset;
  } else if (side === 1) {
    x = ARENA_WIDTH - inset;
    y = inset + sim.asteroidRng.next() * (ARENA_HEIGHT - inset * 2);
  } else if (side === 2) {
    x = inset + sim.asteroidRng.next() * (ARENA_WIDTH - inset * 2);
    y = ARENA_HEIGHT - inset;
  } else {
    x = inset;
    y = inset + sim.asteroidRng.next() * (ARENA_HEIGHT - inset * 2);
  }

  const targetX = ARENA_WIDTH * (0.3 + sim.asteroidRng.next() * 0.4);
  const targetY = ARENA_HEIGHT * (0.3 + sim.asteroidRng.next() * 0.4);
  const baseAngle = Math.atan2(targetY - y, targetX - x);
  const finalAngle = baseAngle + (sim.asteroidRng.next() - 0.5) * (Math.PI / 3);
  const speed = sim.asteroidRng.nextRange(ASTEROID_DRIFT_MIN, ASTEROID_DRIFT_MAX);
  const tier = rollAsteroidTier(sim);
  const size = randomAsteroidSize(sim, tier);

  sim.asteroids.push({
    id: sim.nextEntityId("ast"),
    x,
    y,
    vx: Math.cos(finalAngle) * speed,
    vy: Math.sin(finalAngle) * speed,
    angle: 0,
    angularVelocity: randomAsteroidAngularVelocity(sim),
    size,
    alive: true,
    vertices: generateAsteroidVertices(sim, size),
  });
}

export function generateAsteroidVertices(sim: SimState, size: number): { x: number; y: number }[] {
  const targetCount =
    ASTEROID_VERTICES_MIN +
    Math.floor(sim.asteroidRng.next() * (ASTEROID_VERTICES_MAX - ASTEROID_VERTICES_MIN + 1));
  const sampleCount = Math.max(targetCount * 2, targetCount + 3);

  for (let attempt = 0; attempt < 4; attempt++) {
    const samples: Point2D[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const sector = (Math.PI * 2) / sampleCount;
      const angleJitter = sector * 0.45;
      const angle =
        (i / sampleCount) * Math.PI * 2 +
        (sim.asteroidRng.next() * 2 - 1) * angleJitter;
      const radius = size * (0.72 + sim.asteroidRng.next() * 0.56);
      samples.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }

    const hull = computeConvexHull(samples);
    if (hull.length < 3) continue;
    const reduced = downsampleConvexVertices(hull, targetCount);
    if (reduced.length >= 3) {
      return ensureCounterClockwise(reduced);
    }
  }

  return createRegularConvexFallback(size, Math.max(5, targetCount));
}

function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 3) return points.slice();

  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x,
  );

  const unique: Point2D[] = [];
  for (const p of sorted) {
    const prev = unique[unique.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) {
      unique.push(p);
    }
  }
  if (unique.length <= 3) return unique;

  const cross = (o: Point2D, a: Point2D, b: Point2D): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2D[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2D[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : unique.slice(0, 3);
}

function downsampleConvexVertices(vertices: Point2D[], targetCount: number): Point2D[] {
  if (vertices.length <= targetCount) return vertices.slice();
  const out: Point2D[] = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor((i * vertices.length) / targetCount);
    out.push(vertices[idx]);
  }
  return out;
}

function ensureCounterClockwise(vertices: Point2D[]): Point2D[] {
  if (vertices.length < 3) return vertices.slice();
  let area2 = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  if (area2 > 0) return vertices.slice();
  return [...vertices].reverse();
}

function createRegularConvexFallback(size: number, count: number): Point2D[] {
  const n = Math.max(3, count);
  const radius = Math.max(4, size);
  const vertices: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n;
    vertices.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return vertices;
}

function getInitialAsteroidRange(sim: SimState): { min: number; max: number } {
  if (sim.settings.asteroidDensity === "NONE") {
    return { min: 0, max: 0 };
  }
  if (
    sim.settings.asteroidDensity === "MANY" ||
    sim.settings.asteroidDensity === "SPAWN"
  ) {
    return { min: 8, max: 11 };
  }
  return { min: ASTEROID_INITIAL_MIN, max: ASTEROID_INITIAL_MAX };
}

function isAsteroidSpawnClear(sim: SimState, x: number, y: number, size: number): boolean {
  const minDistance = size * 1.8;
  for (const asteroid of sim.asteroids) {
    if (!asteroid.alive) continue;
    const dx = asteroid.x - x;
    const dy = asteroid.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < minDistance + asteroid.size) {
      return false;
    }
  }
  return true;
}

function rollAsteroidTier(sim: SimState): "LARGE" | "SMALL" {
  return sim.asteroidRng.next() < 0.6 ? "LARGE" : "SMALL";
}

function randomAsteroidSize(sim: SimState, tier: "LARGE" | "SMALL"): number {
  if (tier === "LARGE") {
    return sim.asteroidRng.nextRange(ASTEROID_LARGE_MIN, ASTEROID_LARGE_MAX);
  }
  return sim.asteroidRng.nextRange(ASTEROID_SMALL_MIN, ASTEROID_SMALL_MAX);
}

function randomAsteroidAngularVelocity(sim: SimState): number {
  return (sim.asteroidRng.next() - 0.5) * 0.02 * 60;
}
