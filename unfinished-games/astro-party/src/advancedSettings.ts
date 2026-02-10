import {
  AdvancedSettings,
  AsteroidDensity,
  DashPreset,
  DEFAULT_ADVANCED_SETTINGS,
  BaseGameMode,
  GameConfigType,
  ModePreset,
  SpeedPreset,
  STANDARD_OVERRIDES,
  SANE_OVERRIDES,
  GAME_CONFIG,
  STANDARD_PHYSICS,
  SANE_PHYSICS,
  CHAOTIC_PHYSICS,
} from "./types";

const ASTEROID_DENSITIES: AsteroidDensity[] = ["NONE", "SOME", "MANY", "SPAWN"];
const SPEED_PRESETS: SpeedPreset[] = ["SLOW", "NORMAL", "FAST"];
const DASH_PRESETS: DashPreset[] = ["LOW", "NORMAL", "HIGH"];
const MODE_PRESETS: ModePreset[] = ["STANDARD", "SANE", "CHAOTIC"];

export type ModeTemplate = AdvancedSettings;

function clampRounds(value: number): number {
  const rounded = Math.round(value);
  if (rounded < 3) return 3;
  if (rounded > 6) return 6;
  return rounded;
}

export function sanitizeAdvancedSettings(
  input: Partial<AdvancedSettings> | AdvancedSettings,
): AdvancedSettings {
  const merged: AdvancedSettings = {
    ...DEFAULT_ADVANCED_SETTINGS,
    ...input,
  };

  if (merged.asteroidDensity === "MORE") {
    merged.asteroidDensity = "MANY";
  }

  if (!ASTEROID_DENSITIES.includes(merged.asteroidDensity)) {
    merged.asteroidDensity = DEFAULT_ADVANCED_SETTINGS.asteroidDensity;
  }
  if (!SPEED_PRESETS.includes(merged.shipSpeed)) {
    merged.shipSpeed = DEFAULT_ADVANCED_SETTINGS.shipSpeed;
  }
  if (!DASH_PRESETS.includes(merged.dashPower)) {
    merged.dashPower = DEFAULT_ADVANCED_SETTINGS.dashPower;
  }
  if (!MODE_PRESETS.includes(merged.rotationPreset)) {
    merged.rotationPreset = DEFAULT_ADVANCED_SETTINGS.rotationPreset;
  }
  if (!MODE_PRESETS.includes(merged.rotationBoostPreset)) {
    merged.rotationBoostPreset = DEFAULT_ADVANCED_SETTINGS.rotationBoostPreset;
  }
  if (!MODE_PRESETS.includes(merged.recoilPreset)) {
    merged.recoilPreset = DEFAULT_ADVANCED_SETTINGS.recoilPreset;
  }
  if (!MODE_PRESETS.includes(merged.shipRestitutionPreset)) {
    merged.shipRestitutionPreset =
      DEFAULT_ADVANCED_SETTINGS.shipRestitutionPreset;
  }
  if (!MODE_PRESETS.includes(merged.shipFrictionAirPreset)) {
    merged.shipFrictionAirPreset =
      DEFAULT_ADVANCED_SETTINGS.shipFrictionAirPreset;
  }
  if (!MODE_PRESETS.includes(merged.wallRestitutionPreset)) {
    merged.wallRestitutionPreset =
      DEFAULT_ADVANCED_SETTINGS.wallRestitutionPreset;
  }
  if (!MODE_PRESETS.includes(merged.wallFrictionPreset)) {
    merged.wallFrictionPreset = DEFAULT_ADVANCED_SETTINGS.wallFrictionPreset;
  }
  if (!MODE_PRESETS.includes(merged.shipFrictionPreset)) {
    merged.shipFrictionPreset = DEFAULT_ADVANCED_SETTINGS.shipFrictionPreset;
  }
  if (!MODE_PRESETS.includes(merged.angularDampingPreset)) {
    merged.angularDampingPreset =
      DEFAULT_ADVANCED_SETTINGS.angularDampingPreset;
  }

  merged.startPowerups = Boolean(merged.startPowerups);

  if (!Number.isFinite(merged.roundsToWin)) {
    merged.roundsToWin = DEFAULT_ADVANCED_SETTINGS.roundsToWin;
  } else {
    merged.roundsToWin = clampRounds(merged.roundsToWin);
  }

  return merged;
}

function resolveConfigValue(
  preset: ModePreset,
  key: keyof GameConfigType,
): number {
  const baseValue = GAME_CONFIG[key];
  const overrides =
    preset === "STANDARD"
      ? STANDARD_OVERRIDES
      : preset === "SANE"
        ? SANE_OVERRIDES
        : {};
  const overrideValue = overrides[key] as number | undefined;
  if (typeof overrideValue === "number") return overrideValue;
  return baseValue as number;
}

function resolvePhysicsValue(
  preset: ModePreset,
  key: keyof typeof STANDARD_PHYSICS,
): number {
  const table =
    preset === "STANDARD"
      ? STANDARD_PHYSICS
      : preset === "SANE"
        ? SANE_PHYSICS
        : CHAOTIC_PHYSICS;
  return table[key];
}

function applyConfigPresetOverride(
  settingsPreset: ModePreset,
  basePreset: ModePreset,
  key: keyof GameConfigType,
  overrides: Partial<GameConfigType>,
): void {
  if (settingsPreset === basePreset) return;
  overrides[key] = resolveConfigValue(settingsPreset, key);
}

function applyPhysicsPresetOverride(
  settingsPreset: ModePreset,
  basePreset: ModePreset,
  key: keyof typeof STANDARD_PHYSICS,
  overrides: Partial<typeof STANDARD_PHYSICS>,
): void {
  if (settingsPreset === basePreset) return;
  overrides[key] = resolvePhysicsValue(settingsPreset, key);
}

export const MODE_TEMPLATES: Record<BaseGameMode, ModeTemplate> = {
  STANDARD: {
    ...DEFAULT_ADVANCED_SETTINGS,
    asteroidDensity: "SOME",
    startPowerups: false,
    rotationPreset: "STANDARD",
    rotationBoostPreset: "STANDARD",
    recoilPreset: "STANDARD",
    shipRestitutionPreset: "STANDARD",
    shipFrictionAirPreset: "STANDARD",
    wallRestitutionPreset: "STANDARD",
    wallFrictionPreset: "STANDARD",
    shipFrictionPreset: "STANDARD",
    angularDampingPreset: "STANDARD",
  },
  SANE: {
    ...DEFAULT_ADVANCED_SETTINGS,
    asteroidDensity: "MANY",
    startPowerups: true,
    rotationPreset: "SANE",
    rotationBoostPreset: "SANE",
    recoilPreset: "SANE",
    shipRestitutionPreset: "SANE",
    shipFrictionAirPreset: "SANE",
    wallRestitutionPreset: "SANE",
    wallFrictionPreset: "SANE",
    shipFrictionPreset: "SANE",
    angularDampingPreset: "SANE",
  },
  CHAOTIC: {
    ...DEFAULT_ADVANCED_SETTINGS,
    asteroidDensity: "SPAWN",
    startPowerups: true,
    rotationPreset: "CHAOTIC",
    rotationBoostPreset: "CHAOTIC",
    recoilPreset: "CHAOTIC",
    shipRestitutionPreset: "CHAOTIC",
    shipFrictionAirPreset: "CHAOTIC",
    wallRestitutionPreset: "CHAOTIC",
    wallFrictionPreset: "CHAOTIC",
    shipFrictionPreset: "CHAOTIC",
    angularDampingPreset: "CHAOTIC",
  },
};

export function applyModeTemplate(mode: BaseGameMode): ModeTemplate {
  return { ...MODE_TEMPLATES[mode] };
}

export function isCustomComparedToTemplate(
  settings: AdvancedSettings,
  template: AdvancedSettings,
): boolean {
  return (
    settings.asteroidDensity !== template.asteroidDensity ||
    settings.startPowerups !== template.startPowerups ||
    settings.shipSpeed !== template.shipSpeed ||
    settings.dashPower !== template.dashPower ||
    settings.rotationPreset !== template.rotationPreset ||
    settings.rotationBoostPreset !== template.rotationBoostPreset ||
    settings.recoilPreset !== template.recoilPreset ||
    settings.shipRestitutionPreset !== template.shipRestitutionPreset ||
    settings.shipFrictionAirPreset !== template.shipFrictionAirPreset ||
    settings.wallRestitutionPreset !== template.wallRestitutionPreset ||
    settings.wallFrictionPreset !== template.wallFrictionPreset ||
    settings.shipFrictionPreset !== template.shipFrictionPreset ||
    settings.angularDampingPreset !== template.angularDampingPreset
  );
}

export function buildAdvancedOverrides(
  settings: AdvancedSettings,
  baseTemplate: AdvancedSettings,
): {
  configOverrides?: Partial<GameConfigType>;
  physicsOverrides?: Partial<typeof STANDARD_PHYSICS>;
} {
  const configOverrides: Partial<GameConfigType> = {};
  const physicsOverrides: Partial<typeof STANDARD_PHYSICS> = {};

  configOverrides.ROUNDS_TO_WIN = settings.roundsToWin;

  if (settings.asteroidDensity === "NONE") {
    configOverrides.ASTEROID_INITIAL_MIN = 0;
    configOverrides.ASTEROID_INITIAL_MAX = 0;
    configOverrides.ASTEROID_SPAWN_BATCH_MIN = 0;
    configOverrides.ASTEROID_SPAWN_BATCH_MAX = 0;
  } else if (
    settings.asteroidDensity === "MANY" ||
    settings.asteroidDensity === "SPAWN"
  ) {
    configOverrides.ASTEROID_INITIAL_MIN = 8;
    configOverrides.ASTEROID_INITIAL_MAX = 11;
  }

  if (settings.shipSpeed !== baseTemplate.shipSpeed) {
    if (settings.shipSpeed === "SLOW") {
      configOverrides.SHIP_TARGET_SPEED = 3.6;
      configOverrides.BASE_THRUST = 0.0001;
    } else if (settings.shipSpeed === "FAST") {
      configOverrides.SHIP_TARGET_SPEED = 5.2;
      configOverrides.BASE_THRUST = 0.0002;
    }
  }

  if (settings.dashPower !== baseTemplate.dashPower) {
    if (settings.dashPower === "LOW") {
      configOverrides.SHIP_DASH_BOOST = 1.2;
      configOverrides.DASH_FORCE = 0.007;
    } else if (settings.dashPower === "HIGH") {
      configOverrides.SHIP_DASH_BOOST = 2.8;
      configOverrides.DASH_FORCE = 0.018;
    }
  }

  applyConfigPresetOverride(
    settings.rotationPreset,
    baseTemplate.rotationPreset,
    "ROTATION_SPEED",
    configOverrides,
  );
  applyConfigPresetOverride(
    settings.rotationBoostPreset,
    baseTemplate.rotationBoostPreset,
    "ROTATION_THRUST_BONUS",
    configOverrides,
  );
  applyConfigPresetOverride(
    settings.recoilPreset,
    baseTemplate.recoilPreset,
    "RECOIL_FORCE",
    configOverrides,
  );
  applyConfigPresetOverride(
    settings.shipRestitutionPreset,
    baseTemplate.shipRestitutionPreset,
    "SHIP_RESTITUTION",
    configOverrides,
  );
  applyConfigPresetOverride(
    settings.shipFrictionAirPreset,
    baseTemplate.shipFrictionAirPreset,
    "SHIP_FRICTION_AIR",
    configOverrides,
  );

  applyPhysicsPresetOverride(
    settings.wallFrictionPreset,
    baseTemplate.wallFrictionPreset,
    "WALL_FRICTION",
    physicsOverrides,
  );
  applyPhysicsPresetOverride(
    settings.shipFrictionPreset,
    baseTemplate.shipFrictionPreset,
    "SHIP_FRICTION",
    physicsOverrides,
  );
  applyPhysicsPresetOverride(
    settings.angularDampingPreset,
    baseTemplate.angularDampingPreset,
    "SHIP_ANGULAR_DAMPING",
    physicsOverrides,
  );
  applyPhysicsPresetOverride(
    settings.wallRestitutionPreset,
    baseTemplate.wallRestitutionPreset,
    "WALL_RESTITUTION",
    physicsOverrides,
  );

  return {
    configOverrides:
      Object.keys(configOverrides).length > 0 ? configOverrides : undefined,
    physicsOverrides:
      Object.keys(physicsOverrides).length > 0 ? physicsOverrides : undefined,
  };
}
