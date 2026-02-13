import {
  GAME_CONFIG,
  GameConfigType,
  STANDARD_OVERRIDES,
  STANDARD_PHYSICS,
  SANE_OVERRIDES,
  SANE_PHYSICS,
  CHAOTIC_PHYSICS,
  BaseGameMode,
} from "./types";

type PhysicsOverrides = typeof STANDARD_PHYSICS;

const MODE_CONFIG_OVERRIDES: Record<BaseGameMode, Partial<GameConfigType>> = {
  STANDARD: STANDARD_OVERRIDES,
  SANE: SANE_OVERRIDES,
  CHAOTIC: {},
};

const MODE_PHYSICS: Record<BaseGameMode, PhysicsOverrides> = {
  STANDARD: STANDARD_PHYSICS,
  SANE: SANE_PHYSICS,
  CHAOTIC: CHAOTIC_PHYSICS,
};

let currentMode: BaseGameMode = "STANDARD";
let advancedConfigOverrides: Partial<GameConfigType> | null = null;
let advancedPhysicsOverrides: Partial<PhysicsOverrides> | null = null;
let activeConfig: GameConfigType = {
  ...GAME_CONFIG,
  ...STANDARD_OVERRIDES,
} as GameConfigType;
let activePhysics: PhysicsOverrides = { ...STANDARD_PHYSICS };

function rebuildActive(): void {
  const modeConfig = MODE_CONFIG_OVERRIDES[currentMode];
  const modePhysics = MODE_PHYSICS[currentMode];
  activeConfig = {
    ...GAME_CONFIG,
    ...modeConfig,
    ...(advancedConfigOverrides ?? {}),
  } as GameConfigType;
  activePhysics = {
    ...modePhysics,
    ...(advancedPhysicsOverrides ?? {}),
  };
}

export const GameConfig = {
  setMode(mode: BaseGameMode): void {
    currentMode = mode;
    rebuildActive();
    console.log("[GameConfig] Mode set to:", mode);
  },

  setAdvancedOverrides(
    configOverrides?: Partial<GameConfigType>,
    physicsOverrides?: Partial<PhysicsOverrides>,
  ): void {
    advancedConfigOverrides = configOverrides ? { ...configOverrides } : null;
    advancedPhysicsOverrides = physicsOverrides
      ? { ...physicsOverrides }
      : null;
    rebuildActive();
    console.log("[GameConfig] Advanced overrides updated");
  },

  clearAdvancedOverrides(): void {
    advancedConfigOverrides = null;
    advancedPhysicsOverrides = null;
    rebuildActive();
    console.log("[GameConfig] Advanced overrides cleared");
  },

  getMode(): BaseGameMode {
    return currentMode;
  },

  get config(): GameConfigType {
    return activeConfig;
  },

  get physics(): PhysicsOverrides {
    return activePhysics;
  },
};
