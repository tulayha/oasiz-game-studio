import Phaser from "phaser";

export default class TestTiles extends Phaser.Scene {
    constructor() {
        super("TestTiles");
    }

    create() {
        const tilesPerRow = 20;
        const tileSize = 16;
        const scale = 2; // Smaller scale to fit more
        const displaySize = tileSize * scale;

        const texture = this.textures.get("b_tileset");
        const totalFrames = 520;

        for (let i = 0; i < totalFrames; i++) {
            const x = (i % tilesPerRow) * (displaySize + 15) + 60;
            const y = Math.floor(i / tilesPerRow) * (displaySize + 35) + 80;

            const tile = this.add.image(x, y, "b_tileset", i);
            tile.setOrigin(0, 0).setScale(scale);

            this.add.text(x, y + displaySize + 2, `b${i}`, {
                fontSize: "12px",
                color: "#00ff00",
                backgroundColor: "#000000"
            }).setOrigin(0, 0);
        }

        // Add scrolling support
        this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
            this.cameras.main.scrollY += deltaY;
            // Clamp scroll
            if (this.cameras.main.scrollY < 0) this.cameras.main.scrollY = 0;
        });

        // Fixed header
        const header = this.add.container(0, 0);
        header.setScrollFactor(0);

        const bg = this.add.rectangle(0, 0, 1280, 60, 0x000000, 0.8).setOrigin(0, 0);
        const backBtn = this.add.text(20, 15, "<- Back to Level", {
            fontSize: "24px",
            color: "#ffff00",
            backgroundColor: "#333333",
            padding: { x: 10, y: 5 }
        });
        backBtn.setInteractive({ useHandCursor: true });
        backBtn.on('pointerdown', () => {
            this.scene.start("Level");
        });

        const info = this.add.text(250, 20, "Scroll with Mouse Wheel to see all tiles", {
            fontSize: "18px",
            color: "#ffffff"
        });

        header.add([bg, backBtn, info]);
        header.setDepth(100);

        console.log("TestTiles scene started. Total tiles:", totalFrames);
    }
}
