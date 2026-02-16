
import Phaser from "phaser";

export default class Menu extends Phaser.Scene {
    constructor() {
        super("Menu");
    }

    create() {
        const { width, height } = this.scale;

        // --- Title ---
        const titleText = this.add.text(width / 2, height * 0.25, "EXTENDED\nGOLF", {
            fontSize: '80px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P"',
            stroke: '#000000',
            strokeThickness: 12,
            align: 'center',
            lineSpacing: 20,
            shadow: { offsetX: 8, offsetY: 8, color: '#000000', blur: 0, stroke: true, fill: true }
        }).setOrigin(0.5);

        // Floating Title
        this.tweens.add({
            targets: titleText, y: height * 0.25 - 10, duration: 2000,
            ease: 'Sine.easeInOut', yoyo: true, loop: -1
        });

        // Force Level to update theme (in case we returned from MapSelect)
        const level = this.scene.get('Level') as any;
        if (level && typeof level.updateTheme === 'function') {
            level.updateTheme();
        }

        // Helper to create simplified Menu Button
        const createButton = (x: number, y: number, label: string, callback: () => void, isSmall: boolean = false) => {
            const btnW = isSmall ? 180 : 260;
            const btnH = 70;

            const container = this.add.container(x, y);
            const shadow = this.add.graphics();
            shadow.fillStyle(0x000000, 0.4).fillRoundedRect(-btnW / 2 + 6, -btnH / 2 + 6, btnW, btnH, 10);

            const surface = this.add.graphics();
            surface.fillStyle(0xffffff, 1).fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 10)
                .lineStyle(4, 0x000000, 1).strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 10);

            const text = this.add.text(0, 0, label, {
                fontSize: isSmall ? '20px' : '32px', color: '#000000', fontFamily: '"Press Start 2P"'
            }).setOrigin(0.5);

            container.add([shadow, surface, text]);

            const zone = this.add.zone(0, 0, btnW, btnH).setInteractive({ useHandCursor: true });
            container.add(zone);

            zone.on('pointerdown', () => {
                if (this.sound.get('ButtonClick')) this.sound.play('ButtonClick');
                callback();
            });

            // Hover effect
            zone.on('pointerover', () => container.y += 2);
            zone.on('pointerout', () => container.y -= 2);

            return container;
        };

        // --- PLAY ---
        const playBtn = createButton(width / 2, height * 0.55, "PLAY", () => {
            // Animating exit
            this.tweens.add({
                targets: playBtn, y: height + 100, duration: 500, ease: 'Back.easeIn'
            });
            this.tweens.add({
                targets: titleText, y: -200, duration: 500, ease: 'Back.easeIn',
                onComplete: () => {
                    const level = this.scene.get('Level') as any;
                    if (level && typeof level.resumeFromMenu === 'function') {
                        level.resumeFromMenu();
                    }
                    this.scene.stop();
                }
            });
        });

        // --- BALLS ---
        createButton(width / 2 - 140, height * 0.75, "BALLS", () => {
            this.scene.start('BallSelect');
        }, true);

        // --- MAPS ---
        createButton(width / 2 + 140, height * 0.75, "MAPS", () => {
            this.scene.start('MapSelect');
        }, true);
    }
}
