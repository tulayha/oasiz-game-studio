export interface ShapePoint {
  x: number;
  y: number;
}

// Matches Matter.js Bodies.fromVertices output used by prior implementation.
export const SHIP_COLLIDER_VERTICES: ReadonlyArray<ShapePoint> = [
  { x: 17, y: 0 },
  { x: -8.5, y: 9 },
  { x: -8.5, y: -9 },
];

// Matches Matter.js Bodies.fromVertices output used by prior implementation.
export const PILOT_COLLIDER_VERTICES: ReadonlyArray<ShapePoint> = [
  { x: -11.297, y: -4 },
  { x: -7.297, y: -5 },
  { x: 4.703, y: -5 },
  { x: 11.203, y: -4.5 },
  { x: 11.203, y: 4.5 },
  { x: 4.703, y: 5 },
  { x: -7.297, y: 5 },
  { x: -11.297, y: 4 },
];

export function cloneShapeVertices(
  vertices: ReadonlyArray<ShapePoint>,
): ShapePoint[] {
  return vertices.map((point) => ({ x: point.x, y: point.y }));
}

export function transformLocalVertices(
  vertices: ReadonlyArray<ShapePoint>,
  x: number,
  y: number,
  angle: number,
): Array<ShapePoint> {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return vertices.map((vertex) => ({
    x: x + vertex.x * cos - vertex.y * sin,
    y: y + vertex.x * sin + vertex.y * cos,
  }));
}
