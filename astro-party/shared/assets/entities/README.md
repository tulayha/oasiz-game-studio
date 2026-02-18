# Entity SVG Pipeline

This folder is the source of truth for entity art + collider geometry.

## Contract per SVG

1. Include a valid `viewBox`.
2. Include a collider path with a stable id, for example:
   - `<path id="collider" d="M ... Z" />`
3. Keep collider path commands simple (`M`, `L`, `Z`) so deterministic vertex extraction stays stable.

## Add or update an entity

1. Add/update the SVG file in this folder.
2. Update `manifest.json` with:
   - `file`
   - `colliderPathId`
   - `renderScale` (visual-only scale from viewBox)
   - `physicsScale` (collider-only scale)
   - `slotDefaults` (CSS variables used by the SVG)
3. Run `bun run build` from `astro-party/` (prebuild regenerates shared data).

Generated data is emitted to `shared/geometry/generated/EntitySvgData.ts`.

