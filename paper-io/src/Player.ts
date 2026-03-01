import { Direction, DIRECTION_VEC, PLAYER_SPEED, TRAIL_SAMPLE_DIST, MAP_RADIUS, type Vec2, dist2 } from './constants.ts';
import { Territory } from './Territory.ts';
import * as THREE from 'three';

export interface PlayerState {
  id: number;
  color: number;
  colorStr: string;
  name: string;
  position: Vec2;
  moveDir: Vec2;       // normalized movement direction
  trail: Vec2[];
  territory: Territory;
  alive: boolean;
  isHuman: boolean;
  speed: number;
  isTrailing: boolean;
  hasInput: boolean;    // has the player given any input yet
}

export function createPlayer(
  id: number, color: number, colorStr: string, name: string,
  spawnX: number, spawnZ: number, isHuman: boolean,
): PlayerState {
  const territory = new Territory();
  territory.initAtSpawn(spawnX, spawnZ);

  return {
    id, color, colorStr, name,
    position: { x: spawnX, z: spawnZ },
    moveDir: { x: 1, z: 0 },
    trail: [],
    territory,
    alive: true,
    isHuman,
    speed: PLAYER_SPEED,
    isTrailing: false,
    hasInput: false,
  };
}

/** Set direction from a Direction enum (used by bots) */
export function setDirectionEnum(player: PlayerState, dir: Direction): void {
  const vec = DIRECTION_VEC[dir];
  player.moveDir = { x: vec.dx, z: vec.dz };
  player.hasInput = true;
}

/** Set direction toward a world target point */
export function setDirectionToward(player: PlayerState, target: Vec2): void {
  const dx = target.x - player.position.x;
  const dz = target.z - player.position.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.1) return; // too close, don't change direction
  player.moveDir = { x: dx / len, z: dz / len };
  player.hasInput = true;
}

export function computeMovement(player: PlayerState, dt: number): Vec2 {
  return {
    x: player.position.x + player.moveDir.x * player.speed * dt,
    z: player.position.z + player.moveDir.z * player.speed * dt,
  };
}

export function isInBounds(pos: Vec2): boolean {
  return (pos.x * pos.x + pos.z * pos.z) <= MAP_RADIUS * MAP_RADIUS;
}

/** Clamp position to stay inside the circular arena */
export function clampToArena(pos: Vec2): Vec2 {
  const d2 = pos.x * pos.x + pos.z * pos.z;
  const r2 = MAP_RADIUS * MAP_RADIUS;
  if (d2 <= r2) return pos;
  const scale = MAP_RADIUS / Math.sqrt(d2);
  return { x: pos.x * scale, z: pos.z * scale };
}

export function sampleTrailPoint(player: PlayerState): void {
  const lastPoint = player.trail.length > 0 ? player.trail[player.trail.length - 1] : null;
  if (!lastPoint || dist2(player.position, lastPoint) >= TRAIL_SAMPLE_DIST * TRAIL_SAMPLE_DIST) {
    player.trail.push({ x: player.position.x, z: player.position.z });
  }
}

// Reusable objects for raycasting — avoids allocations every mouse/touch event
const _raycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitTarget = new THREE.Vector3();

/** Raycasts screen coordinates to the y=0 ground plane */
function screenToGround(
  screenX: number, screenY: number,
  camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement,
): Vec2 | null {
  const rect = canvas.getBoundingClientRect();
  _ndcVec.set(((screenX - rect.left) / rect.width) * 2 - 1, -((screenY - rect.top) / rect.height) * 2 + 1);
  _raycaster.setFromCamera(_ndcVec, camera);

  const hit = _raycaster.ray.intersectPlane(_groundPlane, _hitTarget);
  if (!hit) return null;

  return { x: _hitTarget.x, z: _hitTarget.z };
}

export class InputHandler {
  private player: PlayerState;
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private mouseWorldPos: Vec2 | null = null;
  private touching = false;

  constructor(player: PlayerState, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.player = player;
    this.camera = camera;
    this.canvas = canvas;
    this.setupKeyboard();
    this.setupMouse();
    this.setupTouch();
  }

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W':
          setDirectionEnum(this.player, Direction.UP); this.mouseWorldPos = null; break;
        case 'ArrowDown': case 's': case 'S':
          setDirectionEnum(this.player, Direction.DOWN); this.mouseWorldPos = null; break;
        case 'ArrowLeft': case 'a': case 'A':
          setDirectionEnum(this.player, Direction.LEFT); this.mouseWorldPos = null; break;
        case 'ArrowRight': case 'd': case 'D':
          setDirectionEnum(this.player, Direction.RIGHT); this.mouseWorldPos = null; break;
      }
    });
  }

  private setupMouse(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      const pos = screenToGround(e.clientX, e.clientY, this.camera, this.canvas);
      if (pos) this.mouseWorldPos = pos;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      const pos = screenToGround(e.clientX, e.clientY, this.camera, this.canvas);
      if (pos) {
        this.mouseWorldPos = pos;
        this.player.hasInput = true;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      // Keep last direction when mouse leaves
    });
  }

  private setupTouch(): void {
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touching = true;
      const t = e.touches[0];
      const pos = screenToGround(t.clientX, t.clientY, this.camera, this.canvas);
      if (pos) {
        this.mouseWorldPos = pos;
        this.player.hasInput = true;
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const pos = screenToGround(t.clientX, t.clientY, this.camera, this.canvas);
      if (pos) this.mouseWorldPos = pos;
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      this.touching = false;
      // Keep last direction
    });
  }

  /** Call every frame to update player direction toward mouse/touch */
  update(): void {
    if (this.mouseWorldPos) {
      setDirectionToward(this.player, this.mouseWorldPos);
    }
  }

  updatePlayer(p: PlayerState): void {
    this.player = p;
  }
}
