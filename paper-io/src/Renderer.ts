import * as THREE from 'three';
import { MAP_RADIUS, BOARD_COLOR, BG_COLOR, GRID_LINE_COLOR, TERRITORY_OPACITY, TRAIL_OPACITY, type Vec2 } from './constants.ts';

/**
 * Winding number point-in-polygon test.
 * Unlike the even-odd (ray-casting) algorithm, this counts a point as inside
 * if the polygon winds around it at all — so self-intersecting polygons
 * (e.g. figure-8 trails) have NO interior holes.
 */
function pointInPolygonWinding(point: Vec2, polygon: Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let winding = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (pj.z <= point.z) {
      if (pi.z > point.z) {
        // Upward crossing
        const cross = (pi.x - pj.x) * (point.z - pj.z) - (point.x - pj.x) * (pi.z - pj.z);
        if (cross > 0) winding++;
      }
    } else {
      if (pi.z <= point.z) {
        // Downward crossing
        const cross = (pi.x - pj.x) * (point.z - pj.z) - (point.x - pj.x) * (pi.z - pj.z);
        if (cross < 0) winding--;
      }
    }
  }
  return winding !== 0;
}

const TERRITORY_Y = 0.03;
const TRAIL_Y = 0.06;
const CELL_SIZE = 0.3; // grid resolution for territory rendering

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  private territoryObjects: Map<number, THREE.Mesh> = new Map();
  private territoryMaterials: Map<number, THREE.MeshLambertMaterial> = new Map();
  private territoryPolyCount: Map<number, number> = new Map(); // track polygon count to skip unchanged
  private trailMeshes: Map<number, THREE.Mesh> = new Map();
  private trailLengths: Map<number, number> = new Map(); // track trail length to skip unchanged
  private avatars: Map<number, THREE.Group> = new Map();

  private cameraTarget: Vec2 = { x: 0, z: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);
    this.scene.fog = new THREE.Fog(BG_COLOR, 30, 55);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 20, 12.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.createBoard();
    this.createLighting();

    window.addEventListener('resize', () => this.onResize());
  }

  private createBoard(): void {
    // Circular arena floor
    const boardGeo = new THREE.CircleGeometry(MAP_RADIUS, 64);
    const boardMat = new THREE.MeshLambertMaterial({ color: BOARD_COLOR });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    board.receiveShadow = true;
    this.scene.add(board);

    // Concentric ring grid lines
    const ringCount = MAP_RADIUS;
    for (let i = 1; i <= ringCount; i++) {
      const ringGeo = new THREE.RingGeometry(i - 0.02, i + 0.02, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: GRID_LINE_COLOR, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.scene.add(ring);
    }

    // Circular border edge
    const borderCurve = new THREE.EllipseCurve(0, 0, MAP_RADIUS, MAP_RADIUS, 0, Math.PI * 2, false, 0);
    const borderPoints = borderCurve.getPoints(128);
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF, opacity: 0.35, transparent: true });
    const border = new THREE.LineLoop(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.02;
    this.scene.add(border);
  }

  private createLighting(): void {
    const ambient = new THREE.AmbientLight(0x1a1a2e, 0.6);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(20, 40, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -40;
    dir.shadow.camera.right = 40;
    dir.shadow.camera.top = 40;
    dir.shadow.camera.bottom = -40;
    this.scene.add(dir);

    const point = new THREE.PointLight(0x00E5FF, 0.4, 80);
    point.position.set(0, 10, 0);
    this.scene.add(point);
  }

  createAvatar(id: number, color: number): THREE.Group {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.7, 0.35, 0.7);
    const bodyMat = new THREE.MeshToonMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.175;
    body.castShadow = true;
    group.add(body);

    const ringGeo = new THREE.TorusGeometry(0.45, 0.04, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.4;
    group.add(ring);

    this.scene.add(group);
    this.avatars.set(id, group);
    return group;
  }

  updateAvatar(id: number, pos: Vec2, time: number, moveDir?: Vec2): void {
    const avatar = this.avatars.get(id);
    if (!avatar || !avatar.visible) return;
    avatar.position.x = pos.x;
    avatar.position.z = pos.z;

    // Rotate to face movement direction
    if (moveDir && (moveDir.x !== 0 || moveDir.z !== 0)) {
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      let current = avatar.rotation.y;
      let delta = targetAngle - current;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      avatar.rotation.y = current + delta * 0.25;
    }

    const ring = avatar.children[1] as THREE.Mesh;
    if (ring?.material instanceof THREE.MeshBasicMaterial) {
      ring.material.opacity = 0.6 + 0.4 * Math.sin(time * 1.2 * Math.PI * 2);
    }
  }

  hideAvatar(id: number): void {
    const avatar = this.avatars.get(id);
    if (avatar) avatar.visible = false;
  }

  /**
   * Grid-scan territory with marching-squares contour for smooth edges.
   * 1. Rasterize all polygons onto a fine grid using pointInPolygon (handles any shape).
   * 2. Interior cells → shared-vertex grid mesh (no gaps possible).
   * 3. Boundary cells → interpolated edge vertices via marching squares for smooth outline.
   */
  updateTerritory(id: number, polygons: Vec2[][], color: number): void {
    // Skip if polygon count hasn't changed (territory unchanged)
    const prevCount = this.territoryPolyCount.get(id) ?? -1;
    if (prevCount === polygons.length && polygons.length > 0) return;
    this.territoryPolyCount.set(id, polygons.length);

    const old = this.territoryObjects.get(id);
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      // Don't dispose material — we reuse it
    }

    if (polygons.length === 0) {
      this.territoryObjects.delete(id);
      this.territoryMaterials.delete(id);
      this.territoryPolyCount.delete(id);
      return;
    }

    // Reuse or create material per player
    let mat = this.territoryMaterials.get(id);
    if (!mat) {
      const boardCol = new THREE.Color(BOARD_COLOR);
      const playerCol = new THREE.Color(color);
      const blended = boardCol.lerp(playerCol, TERRITORY_OPACITY);
      mat = new THREE.MeshLambertMaterial({
        color: blended,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.territoryMaterials.set(id, mat);
    }

    // Bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const poly of polygons) {
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
    }

    // Expand by 2 cells so flood-fill border is guaranteed outside
    minX = Math.floor(minX / CELL_SIZE) * CELL_SIZE - CELL_SIZE * 2;
    minZ = Math.floor(minZ / CELL_SIZE) * CELL_SIZE - CELL_SIZE * 2;
    maxX = Math.ceil(maxX / CELL_SIZE) * CELL_SIZE + CELL_SIZE * 2;
    maxZ = Math.ceil(maxZ / CELL_SIZE) * CELL_SIZE + CELL_SIZE * 2;

    const cols = Math.round((maxX - minX) / CELL_SIZE) + 1;
    const rows = Math.round((maxZ - minZ) / CELL_SIZE) + 1;

    // Sample grid nodes using winding-number point-in-polygon
    const field = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const gz = minZ + r * CELL_SIZE;
      for (let c = 0; c < cols; c++) {
        const gx = minX + c * CELL_SIZE;
        const pt: Vec2 = { x: gx, z: gz };
        for (const poly of polygons) {
          if (pointInPolygonWinding(pt, poly)) {
            field[r * cols + c] = 1;
            break;
          }
        }
      }
    }

    // Flood-fill from edges to find all EXTERIOR cells.
    // Any interior cell NOT reached by the flood is a hole → fill it.
    // This guarantees zero holes inside the territory.
    const exterior = new Uint8Array(cols * rows);
    const stack: number[] = [];

    // Seed all border cells that aren't already territory
    for (let c = 0; c < cols; c++) {
      if (!field[c]) { exterior[c] = 1; stack.push(0, c); }
      const br = (rows - 1) * cols + c;
      if (!field[br]) { exterior[br] = 1; stack.push(rows - 1, c); }
    }
    for (let r = 1; r < rows - 1; r++) {
      if (!field[r * cols]) { exterior[r * cols] = 1; stack.push(r, 0); }
      const ri = r * cols + cols - 1;
      if (!field[ri]) { exterior[ri] = 1; stack.push(r, cols - 1); }
    }

    // BFS flood fill
    while (stack.length > 0) {
      const sc = stack.pop()!;
      const sr = stack.pop()!;
      const neighbors = [
        [sr - 1, sc], [sr + 1, sc], [sr, sc - 1], [sr, sc + 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (exterior[ni] || field[ni]) continue;
        exterior[ni] = 1;
        stack.push(nr, nc);
      }
    }

    // Fill interior holes: any non-exterior, non-field cell becomes territory
    for (let i = 0; i < cols * rows; i++) {
      if (!field[i] && !exterior[i]) field[i] = 1;
    }

    // Build mesh using marching squares
    // Each cell is defined by its 4 corner nodes.
    // Fully inside cells → 2 triangles (quad). Boundary cells → interpolated triangles.
    const verts: number[] = [];
    const indices: number[] = [];
    const vertMap = new Map<string, number>(); // dedup vertices by key

    const addVert = (x: number, z: number): number => {
      // Quantize to avoid floating point key issues
      const key = `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
      const existing = vertMap.get(key);
      if (existing !== undefined) return existing;
      const idx = verts.length / 3;
      verts.push(x, TERRITORY_Y, z);
      vertMap.set(key, idx);
      return idx;
    };

    const addTri = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number) => {
      indices.push(addVert(x0, z0), addVert(x1, z1), addVert(x2, z2));
    };

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        // 4 corners: TL(c,r), TR(c+1,r), BR(c+1,r+1), BL(c,r+1)
        const tl = field[r * cols + c];
        const tr = field[r * cols + (c + 1)];
        const br = field[(r + 1) * cols + (c + 1)];
        const bl = field[(r + 1) * cols + c];

        const config = (tl << 3) | (tr << 2) | (br << 1) | bl;
        if (config === 0) continue; // fully outside

        const x0 = minX + c * CELL_SIZE;
        const x1 = minX + (c + 1) * CELL_SIZE;
        const z0 = minZ + r * CELL_SIZE;
        const z1 = minZ + (r + 1) * CELL_SIZE;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;

        if (config === 15) {
          // Fully inside — simple quad
          addTri(x0, z0, x1, z0, x1, z1);
          addTri(x0, z0, x1, z1, x0, z1);
          continue;
        }

        // Marching squares: edge midpoints for boundary cells
        // Top edge mid, Right edge mid, Bottom edge mid, Left edge mid
        const tm = { x: mx, z: z0 };
        const rm = { x: x1, z: mz };
        const bm = { x: mx, z: z1 };
        const lm = { x: x0, z: mz };

        switch (config) {
          // 1 corner inside
          case 1: // BL
            addTri(x0, z1, lm.x, lm.z, bm.x, bm.z);
            break;
          case 2: // BR
            addTri(x1, z1, bm.x, bm.z, rm.x, rm.z);
            break;
          case 4: // TR
            addTri(x1, z0, rm.x, rm.z, tm.x, tm.z);
            break;
          case 8: // TL
            addTri(x0, z0, tm.x, tm.z, lm.x, lm.z);
            break;

          // 2 adjacent corners
          case 3: // BL+BR (bottom)
            addTri(x0, z1, lm.x, lm.z, rm.x, rm.z);
            addTri(x0, z1, rm.x, rm.z, x1, z1);
            break;
          case 6: // TR+BR (right)
            addTri(x1, z0, tm.x, tm.z, bm.x, bm.z);
            addTri(x1, z0, bm.x, bm.z, x1, z1);
            break;
          case 12: // TL+TR (top)
            addTri(x0, z0, x1, z0, rm.x, rm.z);
            addTri(x0, z0, rm.x, rm.z, lm.x, lm.z);
            break;
          case 9: // TL+BL (left)
            addTri(x0, z0, tm.x, tm.z, bm.x, bm.z);
            addTri(x0, z0, bm.x, bm.z, x0, z1);
            break;

          // 2 diagonal corners (ambiguous — use 2 triangles for each)
          case 5: // TL=0,TR=1,BR=0,BL=1 → BL+TR
            addTri(x0, z1, lm.x, lm.z, bm.x, bm.z);
            addTri(x1, z0, rm.x, rm.z, tm.x, tm.z);
            break;
          case 10: // TL+BR
            addTri(x0, z0, tm.x, tm.z, lm.x, lm.z);
            addTri(x1, z1, bm.x, bm.z, rm.x, rm.z);
            break;

          // 3 corners inside (1 corner outside)
          case 7: // all except TL
            addTri(x1, z0, tm.x, tm.z, lm.x, lm.z);
            addTri(x1, z0, lm.x, lm.z, x0, z1);
            addTri(x1, z0, x0, z1, x1, z1);
            break;
          case 11: // all except TR
            addTri(x0, z0, tm.x, tm.z, rm.x, rm.z);
            addTri(x0, z0, rm.x, rm.z, x1, z1);
            addTri(x0, z0, x1, z1, x0, z1);
            break;
          case 13: // all except BR
            addTri(x0, z0, x1, z0, rm.x, rm.z);
            addTri(x0, z0, rm.x, rm.z, bm.x, bm.z);
            addTri(x0, z0, bm.x, bm.z, x0, z1);
            break;
          case 14: // all except BL
            addTri(x0, z0, x1, z0, x1, z1);
            addTri(x0, z0, x1, z1, bm.x, bm.z);
            addTri(x0, z0, bm.x, bm.z, lm.x, lm.z);
            break;
        }
      }
    }

    if (verts.length === 0) {
      this.territoryObjects.delete(id);
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat!);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.territoryObjects.set(id, mesh);
  }

  /** Update trail as a thick ribbon mesh */
  updateTrail(id: number, trail: Vec2[], color: number): void {
    // Skip if trail length hasn't changed
    const prevLen = this.trailLengths.get(id) ?? 0;
    if (prevLen === trail.length && trail.length > 0) return;
    this.trailLengths.set(id, trail.length);

    const old = this.trailMeshes.get(id);
    if (old) {
      this.scene.remove(old);
      this.disposeObject(old);
      this.trailMeshes.delete(id);
    }

    if (trail.length < 2) return;

    const halfWidth = 0.25;
    const y = TRAIL_Y;
    const verts: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < trail.length; i++) {
      let dx: number, dz: number;
      if (i === 0) {
        dx = trail[1].x - trail[0].x;
        dz = trail[1].z - trail[0].z;
      } else if (i === trail.length - 1) {
        dx = trail[i].x - trail[i - 1].x;
        dz = trail[i].z - trail[i - 1].z;
      } else {
        dx = trail[i + 1].x - trail[i - 1].x;
        dz = trail[i + 1].z - trail[i - 1].z;
      }
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const px = -dz / len * halfWidth;
      const pz = dx / len * halfWidth;

      verts.push(trail[i].x + px, y, trail[i].z + pz);
      verts.push(trail[i].x - px, y, trail[i].z - pz);

      if (i < trail.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi + 1, vi + 2);
        indices.push(vi + 1, vi + 3, vi + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: TRAIL_OPACITY,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.trailMeshes.set(id, mesh);
  }

  setCameraTarget(pos: Vec2): void {
    this.cameraTarget.x = pos.x;
    this.cameraTarget.z = pos.z;
    this.camera.position.x = pos.x;
    this.camera.position.y = 20;
    this.camera.position.z = pos.z + 12.5;
    this.camera.lookAt(pos.x, 0, pos.z);
  }

  updateCamera(targetPos: Vec2, dt: number): void {
    const lerpFactor = 1 - Math.exp(-4 * dt);
    this.cameraTarget.x += (targetPos.x - this.cameraTarget.x) * lerpFactor;
    this.cameraTarget.z += (targetPos.z - this.cameraTarget.z) * lerpFactor;

    this.camera.position.x = this.cameraTarget.x;
    this.camera.position.y = 20;
    this.camera.position.z = this.cameraTarget.z + 12.5;
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private disposeObject(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (obj.material instanceof THREE.Material) obj.material.dispose();
    }
    for (const child of obj.children) {
      this.disposeObject(child);
    }
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  cleanupPlayer(id: number): void {
    const terr = this.territoryObjects.get(id);
    if (terr) {
      this.scene.remove(terr);
      this.disposeObject(terr);
      this.territoryObjects.delete(id);
    }
    const terrMat = this.territoryMaterials.get(id);
    if (terrMat) {
      terrMat.dispose();
      this.territoryMaterials.delete(id);
    }
    this.territoryPolyCount.delete(id);
    const trail = this.trailMeshes.get(id);
    if (trail) {
      this.scene.remove(trail);
      this.disposeObject(trail);
      this.trailMeshes.delete(id);
    }
    this.trailLengths.delete(id);
    this.hideAvatar(id);
  }

  dispose(): void {
    for (const [id] of this.avatars) this.cleanupPlayer(id);
    this.renderer.dispose();
  }
}
