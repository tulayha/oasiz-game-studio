
import Phaser from "phaser";

export default class Menu extends Phaser.Scene {
    constructor() {
        super("Menu");
    }

    create() {
        const { width, height } = this.scale;

        // No background, let the Level scene show through fully

        // --- Title: Extended Golf (Double Layer Retro Style) ---
        const titleText = this.add.text(width / 2, height * 0.3, "EXTENDED\nGOLF", {
            fontSize: '80px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P"',
            stroke: '#000000',
            strokeThickness: 12,
            align: 'center',
            lineSpacing: 20,
            shadow: {
                offsetX: 8,
                offsetY: 8,
                color: '#000000',
                blur: 0,
                stroke: true,
                fill: true
            }
        }).setOrigin(0.5);

        // --- Play Button: 3D White Square Style ---
        const btnWidth = 220;
        const btnHeight = 80;
        const btnX = width / 2;
        const btnY = height * 0.65;

        const btnContainer = this.add.container(btnX, btnY);

        // 3D Shadow (Black/Dark Gray)
        const shadow = this.add.graphics();
        shadow.fillStyle(0x000000, 0.4);
        shadow.fillRoundedRect(-btnWidth / 2 + 8, -btnHeight / 2 + 8, btnWidth, btnHeight, 10);
        btnContainer.add(shadow);

        // Button Surface (White)
        const surface = this.add.graphics();
        surface.fillStyle(0xffffff, 1);
        surface.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
        surface.lineStyle(4, 0x000000, 1);
        surface.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
        btnContainer.add(surface);

        const playText = this.add.text(0, 0, 'PLAY', {
            fontSize: '28px',
            color: '#000000',
            fontFamily: '"Press Start 2P"',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        btnContainer.add(playText);

        // Interaction Area (Hit Area for the entire button square)
        const hitArea = this.add.zone(btnX, btnY, btnWidth, btnHeight).setInteractive({ useHandCursor: true });

        // Interactions
        btnContainer.setAlpha(0);
        let ready = false;
        this.time.delayedCall(500, () => {
            this.tweens.add({
                targets: btnContainer,
                alpha: 1,
                duration: 500
            });
            ready = true;
        });

        hitArea.on('pointerover', () => {
            if (!ready) return;
            if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("light");
            surface.clear();
            surface.fillStyle(0xeeeeee, 1);
            surface.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
            surface.lineStyle(4, 0x000000, 1);
            surface.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
            btnContainer.y = btnY + 2;
        });

        hitArea.on('pointerout', () => {
            surface.clear();
            surface.fillStyle(0xffffff, 1);
            surface.fillRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
            surface.lineStyle(4, 0x000000, 1);
            surface.strokeRoundedRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, 10);
            btnContainer.y = btnY;
        });

        hitArea.on('pointerdown', () => {
            if (!ready) return;
            if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("light");
            ready = false;

            if (this.sound.get('ButtonClick')) {
                this.sound.play('ButtonClick');
            }

            // Clean up hit area to avoid multiple clicks during animation
            hitArea.destroy();

            // --- SMOOTH EXIT ANIMATION ---
            // Title moves UP
            this.tweens.add({
                targets: titleText,
                y: -200,
                duration: 800,
                ease: 'Back.easeIn'
            });

            // Button moves DOWN
            this.tweens.add({
                targets: btnContainer,
                y: height + 200,
                duration: 800,
                ease: 'Back.easeIn',
                onComplete: () => {
                    const level = this.scene.get('Level') as any;
                    if (level && typeof level.resumeFromMenu === 'function') {
                        level.resumeFromMenu();
                    }
                    this.scene.stop();
                }
            });
        });

        // Floating animation for title
        this.tweens.add({
            targets: titleText,
            y: height * 0.3 - 10,
            duration: 2000,
            ease: 'Sine.easeInOut',
            yoyo: true,
            loop: -1
        });
    }
}
