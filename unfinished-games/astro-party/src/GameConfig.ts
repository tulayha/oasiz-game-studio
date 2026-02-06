import {
  GAME_CONFIG,
  GameConfigType,
  SANE_OVERRIDES,
  SANE_PHYSICS,
  CHAOTIC_PHYSICS,
  GameMode,
} from "./types";

type PhysicsOverrides = typeof SANE_PHYSICS;

let currentMode: GameMode = "CHAOTIC";
let activeConfig: GameConfigType = { ...GAME_CONFIG };
let activePhysics: PhysicsOverrides = { ...CHAOTIC_PHYSICS };

export const GameConfig = {
  setMode(mode: GameMode): void {
    currentMode = mode;
    if (mode === "SANE") {
      activeConfig = { ...GAME_CONFIG, ...SANE_OVERRIDES } as GameConfigType;
      activePhysics = { ...SANE_PHYSICS };
    } else {
      activeConfig = { ...GAME_CONFIG };
      activePhysics = { ...CHAOTIC_PHYSICS };
    }
    console.log("[GameConfig] Mode set to:", mode);
  },

  getMode(): GameMode {
    return currentMode;
  },

  get config(): GameConfigType {
    return activeConfig;
  },

  get physics(): PhysicsOverrides {
    return activePhysics;
  },
};
