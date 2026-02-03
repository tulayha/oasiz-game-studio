console.log("[Main] Script starting...");

import Phaser from "phaser";
console.log("[Main] Phaser imported");

import Scene from "./scenes/Scene";
import Preload from "./scenes/Preload";
console.log("[Main] Scenes imported");

class Boot extends Phaser.Scene {

	constructor() {
		super("Boot");
		console.log("[Boot] Constructor");
	}

	preload() {
		console.log("[Boot] Preload starting");
		// Add error handler for asset loading
		this.load.on('loaderror', (file: Phaser.Loader.File) => {
			console.warn('[Boot] Failed to load:', file.key, file.url);
		});
		this.load.pack("pack", "assets/preload-asset-pack.json");
	}

	create() {
		console.log("[Boot] Create - starting Preload scene");
		this.scene.start("Preload");
	}
}

window.addEventListener('load', function () {
	console.log("[Main] Window load event");

	try {
		const game = new Phaser.Game({
			width: 1280,
			height: 720,
			backgroundColor: "#2f2f2f",
			parent: "game-container",
			pixelArt: false,
			roundPixels: false,
			scale: {
				mode: Phaser.Scale.ScaleModes.RESIZE,
				autoCenter: Phaser.Scale.Center.CENTER_BOTH
			},
			scene: [Boot, Preload, Scene]
		});
		console.log("[Main] Phaser game created");

		game.scene.start("Boot");
		console.log("[Main] Boot scene started");
	} catch (e) {
		console.error("[Main] Error creating game:", e);
	}
});