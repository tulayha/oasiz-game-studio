/**
 * PhaserCardGame.ts
 * ─────────────────
 * Phaser 3 renderer entry point. Drop-in replacement for PixiCardGame.
 *
 * Creates a Phaser.Game, injects shared state via registry, and boots into
 * CardBootScene → CardGameScene. Exposes destroy() for lifecycle parity.
 *
 * Constructor signature is identical to PixiCardGame so cards-main.ts can
 * swap renderers with zero changes via the VITE_USE_PHASER feature flag.
 */

import Phaser from "phaser";
import type { TableConfig } from "../cards-core/types";
import type { PlayroomBridge } from "../cards-core/PlayroomBridge";
import type { CardGameEngine } from "../cards-core/CardGameEngine";
import { CardBootScene } from "./scenes/CardBootScene";
import { CardGameScene } from "./scenes/CardGameScene";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export class PhaserCardGame {
  private game: Phaser.Game;

  constructor(
    mount: HTMLElement,
    config: TableConfig,
    bridge: PlayroomBridge,
    engine: CardGameEngine,
    settings: Settings,
    onGamePhaseChange?: (phase: string) => void,
  ) {
    const W = window.innerWidth;
    const H = window.innerHeight;

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount,
      width: W,
      height: H,
      backgroundColor: "#" + config.visualConfig.backgroundColor.toString(16).padStart(6, "0"),
      transparent: false,
      antialias: true,
      scene: [CardBootScene, CardGameScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: W,
        height: H,
      },
      // No physics needed for a card game
      physics: { default: "arcade", arcade: { debug: false } },
    });

    // ── Inject shared state via registry before scenes start ─────────────────
    // Registry is the Phaser-idiomatic way to pass data between scenes and the
    // host without prop-drilling or singleton modules.
    this.game.registry.set("tableConfig", config);
    this.game.registry.set("visualConfig", config.visualConfig);
    this.game.registry.set("bridge", bridge);
    this.game.registry.set("engine", engine);
    this.game.registry.set("settings", settings);
    this.game.registry.set("onGamePhaseChange", onGamePhaseChange ?? null);
  }

  destroy(): void {
    this.game.registry.destroy();
    this.game.destroy(true);
  }
}
