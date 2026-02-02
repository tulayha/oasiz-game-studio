
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
/* END-USER-IMPORTS */

export default class Preload extends Phaser.Scene {

	constructor() {
		super("Preload");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {
		// No-op: Loading screen removed
	}

	// progressBar removed (unused)

	/* START-USER-CODE */

	// Write your code here

	preload() {

		this.load.pack("asset-pack", "assets/asset-pack.json");

		// Audio assets
		this.load.audio('Score', 'Audio/Score.wav');
		this.load.audio('GameOver', 'Audio/GameOver.wav');
		this.load.audio('HitBall', 'Audio/HitBall.wav');
		this.load.audio('ButtonClick', 'Audio/ButtonClick.wav');
		this.load.audio('GolfBgMusic', 'Audio/GolfBgMusic.mp3');
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

		this.scene.start("Level");
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
