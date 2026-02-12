import { MapId, GAME_CONFIG, PowerUpType } from "../types";

/**
 * Map feature definitions for each map variant.
 * All maps have edge borders by default.
 */

export interface YellowBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CenterHole {
  x: number;
  y: number;
  radius: number;
  hasRotatingArrow: boolean;
}

export interface RepulsionZone {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export interface OverlayBox {
  x: number;
  y: number;
  width: number;
  height: number;
  holes: { x: number; y: number; radius: number }[];
}

export interface AsteroidSpawnConfig {
  enabled: boolean;
  minCount: number;
  maxCount: number;
  greyRatio: number; // 0-1, percentage of grey asteroids
  spawnAroundCenter?: boolean; // For map 2 - spawn around center hole
}

export interface MapPowerUpConfig {
  enabled: boolean;
  x: number; // 0-1 percentage of arena width
  y: number; // 0-1 percentage of arena height
  types: PowerUpType[]; // Allowed powerup types (random if multiple)
  respawnPerRound: boolean; // Whether to respawn every round
}

export interface MapDefinition {
  id: MapId;
  name: string;
  description: string;
  yellowBlocks: YellowBlock[];
  centerHoles: CenterHole[];
  repulsionZones: RepulsionZone[];
  overlayBoxes: OverlayBox[];
  asteroidConfig: AsteroidSpawnConfig;
  hasTurret: boolean;
  powerUpConfig?: MapPowerUpConfig; // Optional powerup configuration
}

const W = GAME_CONFIG.ARENA_WIDTH;
const H = GAME_CONFIG.ARENA_HEIGHT;

// Map 0: Default (current map with turret)
const MAP_0_DEFAULT: MapDefinition = {
  id: 0,
  name: "Classic",
  description: "The original arena with a center turret",
  yellowBlocks: [],
  centerHoles: [],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: { enabled: true, minCount: 5, maxCount: 5, greyRatio: 0 },
  hasTurret: true,
};

// Map 1: The Cache - Yellow blocks + center powerup
const MAP_1_CACHE: MapDefinition = {
  id: 1,
  name: "The Cache",
  description: "Yellow blocks and a powerup in the center",
  yellowBlocks: generateCacheBlocks(),
  centerHoles: [],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: { enabled: false, minCount: 0, maxCount: 0, greyRatio: 0 },
  hasTurret: false,
  powerUpConfig: {
    enabled: true,
    x: 0.5, // Center of arena (50%)
    y: 0.5, // Center of arena (50%)
    types: ["LASER", "SHIELD", "SCATTER", "MINE", "HOMING_MISSILE", "JOUST"],
    respawnPerRound: true,
  },
};

// Map 2: The Vortex - Center hole with rotating arrow
const MAP_2_VORTEX: MapDefinition = {
  id: 2,
  name: "The Vortex",
  description: "A void in the center pulls everything around it",
  yellowBlocks: [],
  centerHoles: [
    {
      x: W / 2,
      y: H / 2,
      radius: 140,
      hasRotatingArrow: false,
    },
  ],
  repulsionZones: [],
  overlayBoxes: [],
  asteroidConfig: {
    enabled: true,
    minCount: 7,
    maxCount: 7,
    greyRatio: 0.43,
    spawnAroundCenter: true,
  },
  hasTurret: false,
};

// Map 3: Repulse - Two repulsion holes on left and right
const MAP_3_REPULSE: MapDefinition = {
  id: 3,
  name: "Repulse",
  description: "Two magnetic fields push ships away",
  yellowBlocks: [],
  centerHoles: [],
  repulsionZones: [
    {
      x: W * 0.3,
      y: H / 2,
      radius: 84,
      strength: 0.035,
    },
    {
      x: W * 0.7,
      y: H / 2,
      radius: 84,
      strength: 0.035,
    },
  ],
  overlayBoxes: [],
  asteroidConfig: { enabled: true, minCount: 6, maxCount: 6, greyRatio: 0.5 },
  hasTurret: false,
};

// Map 4: Bunkers - Four overlay boxes with holes
const MAP_4_BUNKERS: MapDefinition = {
  id: 4,
  name: "Bunkers",
  description: "Solid cover with peek holes",
  yellowBlocks: [],
  centerHoles: [],
  repulsionZones: [],
  overlayBoxes: generateBunkerBoxes(),
  asteroidConfig: { enabled: true, minCount: 5, maxCount: 5, greyRatio: 0.4 },
  hasTurret: false,
};

function generateCacheBlocks(): YellowBlock[] {
  const blocks: YellowBlock[] = [];
  const blockSize = 28; // Slightly smaller blocks
  const gap = 0; // No gap between blocks - they touch each other
  const step = blockSize + gap;
  const rowStartX = 0; // Full map width
  const rowEndX = W;
  const colStartY = 0; // Full map height
  const colEndY = H;

  const xPositions: number[] = [];
  for (let x = rowStartX; x <= rowEndX - blockSize; x += step) {
    xPositions.push(x);
  }
  const yPositions: number[] = [];
  for (let y = colStartY; y <= colEndY - blockSize; y += step) {
    yPositions.push(y);
  }

  const rowIndices = [
    Math.floor(yPositions.length * 0.35),
    Math.floor(yPositions.length * 0.65),
  ];
  const colIndices = [
    Math.floor(xPositions.length * 0.35),
    Math.floor(xPositions.length * 0.65),
  ];

  const rowYs = rowIndices.map(
    (idx) => yPositions[Math.min(idx, yPositions.length - 1)],
  );
  const colXs = colIndices.map(
    (idx) => xPositions[Math.min(idx, xPositions.length - 1)],
  );

  const used = new Set<string>();
  const addBlock = (x: number, y: number): void => {
    const key = `${Math.round(x)}|${Math.round(y)}`;
    if (used.has(key)) return;
    used.add(key);
    blocks.push({
      x,
      y,
      width: blockSize,
      height: blockSize,
    });
  };

  // Two long horizontal rows
  for (const y of rowYs) {
    for (const x of xPositions) {
      addBlock(x, y);
    }
  }

  // Two vertical columns to form a hash sign
  for (const x of colXs) {
    for (const y of yPositions) {
      addBlock(x, y);
    }
  }

  return blocks;
}

function generateBunkerBoxes(): OverlayBox[] {
  const boxW = 260;
  const boxH = 200;
  const marginX = 150;
  const marginY = 145;

  const topLeft: OverlayBox = {
    x: marginX,
    y: marginY,
    width: boxW,
    height: boxH,
    holes: [
      { x: boxW * 0.3, y: boxH * 0.5, radius: 20 },
      { x: boxW * 0.7, y: boxH * 0.7, radius: 15 },
    ],
  };
  const topRight: OverlayBox = {
    x: W - marginX - boxW,
    y: marginY,
    width: boxW,
    height: boxH,
    holes: [
      { x: boxW * 0.5, y: boxH * 0.4, radius: 18 },
      { x: boxW * 0.2, y: boxH * 0.8, radius: 16 },
    ],
  };
  const bottomLeft: OverlayBox = {
    x: marginX,
    y: H - marginY - boxH,
    width: boxW,
    height: boxH,
    holes: [
      { x: boxW * 0.6, y: boxH * 0.3, radius: 17 },
      { x: boxW * 0.3, y: boxH * 0.6, radius: 20 },
    ],
  };
  const bottomRight: OverlayBox = {
    x: W - marginX - boxW,
    y: H - marginY - boxH,
    width: boxW,
    height: boxH,
    holes: [
      { x: boxW * 0.4, y: boxH * 0.5, radius: 19 },
      { x: boxW * 0.8, y: boxH * 0.3, radius: 14 },
    ],
  };

  const pipeWidth = Math.max(50, Math.round(boxW * 0.22));
  const pipeX = topLeft.x + boxW * 0.5 - pipeWidth / 2;
  const pipeY = topLeft.y + boxH;
  const pipeHeight = bottomLeft.y - pipeY;
  const leftPipe: OverlayBox = {
    x: pipeX,
    y: pipeY,
    width: pipeWidth,
    height: pipeHeight,
    holes: [],
  };

  return [
    // Top-left
    topLeft,
    // Top-right
    topRight,
    // Bottom-left
    bottomLeft,
    // Bottom-right
    bottomRight,
    // Connecting pipe (left side)
    leftPipe,
  ];
}

export const MAP_DEFINITIONS: Record<MapId, MapDefinition> = {
  0: MAP_0_DEFAULT,
  1: MAP_1_CACHE,
  2: MAP_2_VORTEX,
  3: MAP_3_REPULSE,
  4: MAP_4_BUNKERS,
};

export const ALL_MAP_IDS: MapId[] = [0, 1, 2, 3, 4];

export function getMapDefinition(id: MapId): MapDefinition {
  return MAP_DEFINITIONS[id];
}
