import Phaser from "phaser";
import Level from "./scenes/Level";
import Scene from "./scenes/Scene";
import Preload from "./scenes/Preload";
import UIScene from "./scenes/UIScene";
import MainMenu from "./scenes/MainMenu";

class Boot extends Phaser.Scene {

	constructor() {
		super("Boot");
	}

	preload() {

		this.load.pack("pack", "assets/preload-asset-pack.json");
	}

	create() {

		this.scene.start("Preload");
	}
}

const initGame = () => {
	// Prevent multiple initializations
	if ((window as any)._gameInitialized) return;
	(window as any)._gameInitialized = true;

	const game = new Phaser.Game({
		width: '100%',
		height: '100%',
		backgroundColor: "#242424",
		pixelArt: true,
		roundPixels: true,
		parent: "game-container",
		scale: {
			mode: Phaser.Scale.ScaleModes.RESIZE,
		},
		dom: {
			createContainer: true
		},
		scene: [Boot, Preload, MainMenu, Level, Scene, UIScene]
	});

	game.scene.start("Boot");
};

// Expose isMobile globally for HUD logic
(window as any).isMobile = window.matchMedia('(pointer: coarse)').matches;

if (document.readyState === 'complete') {
	initGame();
} else {
	window.addEventListener('load', initGame);
}