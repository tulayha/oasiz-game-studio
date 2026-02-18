import {
  GENERATED_ENTITY_SVG_DATA,
  type GeneratedEntitySvgData,
  type ShapePoint,
} from "./generated/EntitySvgData.js";

export type EntityAssetId = (typeof GENERATED_ENTITY_SVG_DATA)[number]["id"];

export interface EntityAssetDefinition {
  id: EntityAssetId;
  svgTemplate: string;
  colliderPath: string;
  colliderVertices: ReadonlyArray<ShapePoint>;
  viewBox: Readonly<{
    minX: number;
    minY: number;
    width: number;
    height: number;
  }>;
  renderSize: Readonly<{ width: number; height: number }>;
  renderScale: number;
  physicsScale: number;
  slotDefaults: Readonly<Record<string, string>>;
}

function scaleVertices(
  vertices: ReadonlyArray<ShapePoint>,
  scale: number,
): ReadonlyArray<ShapePoint> {
  if (scale === 1) {
    return Object.freeze(vertices.map((point) => ({ x: point.x, y: point.y })));
  }

  return Object.freeze(
    vertices.map((point) => ({
      x: point.x * scale,
      y: point.y * scale,
    })),
  );
}

function buildDefinition(raw: GeneratedEntitySvgData): EntityAssetDefinition {
  const renderWidth = raw.viewBox.width * raw.renderScale;
  const renderHeight = raw.viewBox.height * raw.renderScale;

  return {
    id: raw.id as EntityAssetId,
    svgTemplate: raw.svgTemplate,
    colliderPath: raw.colliderPath,
    colliderVertices: scaleVertices(raw.colliderVertices, raw.physicsScale),
    viewBox: Object.freeze({
      minX: raw.viewBox.minX,
      minY: raw.viewBox.minY,
      width: raw.viewBox.width,
      height: raw.viewBox.height,
    }),
    renderSize: Object.freeze({
      width: renderWidth,
      height: renderHeight,
    }),
    renderScale: raw.renderScale,
    physicsScale: raw.physicsScale,
    slotDefaults: Object.freeze({ ...raw.slotDefaults }),
  };
}

const entries = GENERATED_ENTITY_SVG_DATA.map((raw) => [raw.id, buildDefinition(raw)] as const);

export const ENTITY_ASSETS: Readonly<Record<EntityAssetId, EntityAssetDefinition>> =
  Object.freeze(Object.fromEntries(entries)) as Readonly<
    Record<EntityAssetId, EntityAssetDefinition>
  >;

export function getEntityAsset(id: EntityAssetId): EntityAssetDefinition {
  const entity = ENTITY_ASSETS[id];
  if (!entity) {
    throw new Error(`[EntityAssets] Unknown entity asset id: ${id}`);
  }
  return entity;
}

export function applySvgColorSlots(
  svgTemplate: string,
  slots: Readonly<Record<string, string>>,
): string {
  const styleVars = Object.entries(slots)
    .map(([key, value]) => `--${key}: ${value};`)
    .join(" ");

  return svgTemplate.replace(
    /<svg\b([^>]*)>/i,
    (fullMatch: string, attrs: string) => {
      const styleMatch = attrs.match(/style=(["'])(.*?)\1/i);
      if (!styleMatch) {
        return `<svg${attrs} style="${styleVars}">`;
      }
      const quote = styleMatch[1];
      const existing = styleMatch[2].trim();
      const mergedStyle =
        existing.length > 0 ? `${existing}; ${styleVars}` : styleVars;
      return fullMatch.replace(styleMatch[0], `style=${quote}${mergedStyle}${quote}`);
    },
  );
}

