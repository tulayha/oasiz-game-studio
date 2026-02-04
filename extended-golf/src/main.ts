import Phaser from "phaser";
import Level from "./scenes/Level";
import Preload from "./scenes/Preload";
import Menu from "./scenes/Menu";
import BallSelect from "./scenes/BallSelect";
import MapSelect from "./scenes/MapSelect";

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

window.addEventListener('load', async function () {
	// Ensure fonts are loaded before starting the game to prevent blank text
	if ((document as any).fonts) {
		await (document as any).fonts.ready;
	}

	const game = new Phaser.Game({
		type: Phaser.AUTO,
		width: 1280,
		height: 720,
		backgroundColor: "#2f2f2f",
		parent: "game-container",
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH,
			width: 1280,
			height: 720
		},
		scene: [Boot, Preload, Level, Menu, BallSelect, MapSelect],
		physics: {
			default: 'matter',
			matter: {
				debug: false,
				gravity: { y: 1, x: 0 },
				runner: {
					isFixed: false, // Variable delta-time: prevents "slow motion" when FPS drops
					fps: 60
				},
				autoUpdate: false // We will step the world manually in Level.ts for perfect Delta-Time sync
			}
		}
	});

	// Handle window resize and orientation for better mobile experience
	const updateScale = () => {
		const isPortrait = window.innerHeight > window.innerWidth;
		const container = document.getElementById('game-container');
		const isMobile = /Mobi|Android/i.test(navigator.userAgent);

		if (container) {
			if (isPortrait && isMobile) {
				container.classList.add('force-landscape');
				// Inform Phaser about the rotated parent dimensions so input mapping works
				game.scale.setParentSize(window.innerHeight * 0.92, window.innerWidth * 0.92);

				// Fix coordinate mapping for CSS rotation by overriding transformPointer
				const inputManager = game.input as any;
				if (!inputManager._originalTransform) {
					inputManager._originalTransform = inputManager.transformPointer;
					inputManager.transformPointer = function (pointer: any, pageX: number, pageY: number, wasMove: boolean) {
						const isPortraitNow = window.innerHeight > window.innerWidth;
						if (isPortraitNow && /Mobi|Android/i.test(navigator.userAgent)) {
							const winW = window.innerWidth;
							const winH = window.innerHeight;

							// High precision mapping based on viewport center and FIT scale
							const gameW = 1280;
							const gameH = 720;
							const parentW = winH * 0.92;
							const parentH = winW * 0.92;
							const scale = Math.min(parentW / gameW, parentH / gameH);

							// Center points
							const centerX = winW / 2;
							const centerY = winH / 2;

							// Relative to center
							const dx = (pageX - window.scrollX) - centerX;
							const dy = (pageY - window.scrollY) - centerY;

							// Rotate -90 degrees (CCW) to match game orientation
							// (dx, dy) rotates to (dy, -dx)
							const rotatedDx = dy;
							const rotatedDy = -dx;

							// Offset back to game pixels from (640, 360)
							pointer.x = 640 + (rotatedDx / scale);
							pointer.y = 360 + (rotatedDy / scale);

							// Update world coordinates
							game.scene.getScenes(true).forEach((scene: Phaser.Scene) => {
								if (scene.cameras && scene.cameras.main) {
									const cam = scene.cameras.main;
									pointer.worldX = cam.scrollX + (pointer.x / cam.zoom);
									pointer.worldY = cam.scrollY + (pointer.y / cam.zoom);
								}
							});
						} else {
							this._originalTransform(pointer, pageX, pageY, wasMove);
						}
					};
				}
			} else {
				container.classList.remove('force-landscape');
				game.scale.setParentSize(window.innerWidth, window.innerHeight);
			}
		}

		game.scale.refresh();
	};

	window.addEventListener('resize', updateScale);
	window.addEventListener('orientationchange', () => {
		setTimeout(updateScale, 500);
	});

	// Important for input sync on mobile
	window.addEventListener('touchstart', updateScale, { once: true });

	updateScale();
	game.scene.start("Boot");
});