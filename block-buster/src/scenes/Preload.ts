
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import { getAllAnimDefs } from "../SpriteAnimConfig";
/* END-USER-IMPORTS */

export default class Preload extends Phaser.Scene {

	constructor() {
		super("Preload");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		// guapen
		const guapen = this.add.image(505.0120544433594, 360, "guapen");
		guapen.scaleX = 0.32715486817515643;
		guapen.scaleY = 0.32715486817515643;

		// progressBar
		const progressBar = this.add.rectangle(553.0120849609375, 361, 256, 20);
		progressBar.setOrigin(0, 0);
		progressBar.isFilled = true;
		progressBar.fillColor = 14737632;

		// progressBarBg
		const progressBarBg = this.add.rectangle(553.0120849609375, 361, 256, 20);
		progressBarBg.setOrigin(0, 0);
		progressBarBg.fillColor = 14737632;
		progressBarBg.isStroked = true;

		// loadingText
		const loadingText = this.add.text(552.0120849609375, 329, "", {});
		loadingText.text = "Loading...";
		loadingText.setStyle({ "color": "#e0e0e0", "fontFamily": "arial", "fontSize": "20px" });

		this.progressBar = progressBar;

		this.events.emit("scene-awake");
	}

	private progressBar!: Phaser.GameObjects.Rectangle;

	/* START-USER-CODE */

	// Write your code here

	preload() {

		this.editorCreate();

		this.load.pack("asset-pack", "assets/asset-pack.json");

		// Load all sprite animation frames
		this.loadSpriteFrames();

		const width = this.progressBar.width;

		this.load.on("progress", (value: number) => {

			this.progressBar.width = width * value;
		});
	}

	loadSpriteFrames() {
		const defs = getAllAnimDefs();
		console.log("[Preload] Loading sprite frames for", defs.length, "animations");

		for (const def of defs) {
			for (let i = 0; i < def.frames; i++) {
				const num = String(i).padStart(4, "0");
				const textureKey = def.key + "_" + i;
				const url = "assets/sprites/" + def.dir + "/frame" + num + ".png";
				this.load.image(textureKey, url);
			}
		}
	}

	create() {

		if (process.env.NODE_ENV === "development") {

			const start = new URLSearchParams(location.search).get("start");

			if (start) {

				console.log(`Development: jump to ${start}`);
				this.scene.start(start);

				return;
			}
		}

		this.scene.start("MainMenu");
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
