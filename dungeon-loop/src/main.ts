import Phaser from "phaser";
import Level from "./scenes/Level";
import Preload from "./scenes/Preload";
import TestTiles from "./scenes/TestTiles";

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

window.addEventListener('load', function () {

	const isMobileDevice = () =>
		window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

	const applyForcedLandscapeLayout = (game: Phaser.Game) => {
		const portrait = window.innerHeight > window.innerWidth;
		const forceLandscape = isMobileDevice() && portrait;
		document.body.classList.toggle("force-landscape", forceLandscape);
		// Let ScaleManager recalculate after CSS/layout changes.
		window.requestAnimationFrame(() => game.scale.refresh());
	};

	const game = new Phaser.Game({
		width: 1280,
		height: 720,
		backgroundColor: "#141a26",
		parent: "game-container",
		pixelArt: true,
		// Helps headless / automated screenshot capture for WebGL canvases.
		render: {
			preserveDrawingBuffer: true
		},
		scale: {
			mode: Phaser.Scale.ScaleModes.FIT,
			autoCenter: Phaser.Scale.Center.CENTER_BOTH
		},
		physics: {
			default: 'arcade',
			arcade: {
				gravity: { x: 0, y: 0 },
				debug: false
			}
		},
		scene: [Boot, Preload, Level, TestTiles]
	});

	if (isMobileDevice() && (screen.orientation as any)?.lock) {
		(screen.orientation as any).lock("landscape").catch(() => undefined);
	}
	applyForcedLandscapeLayout(game);
	window.addEventListener("resize", () => applyForcedLandscapeLayout(game));
	window.addEventListener("orientationchange", () => applyForcedLandscapeLayout(game));

	game.scene.start("Boot");
});
