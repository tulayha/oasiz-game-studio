
import Phaser from "phaser";

export default class SettingsModal {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container | undefined;
    private isOpen: boolean = false;

    // Tasarımdan alınan renkler
    private colors = {
        primary: 0x3d3d4b,
        bgLight: 0xf2ebd9,
        bgDark: 0x1a1a1a,
        border: 0x2d2822
    };

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.initSettings();
    }

    private initSettings() {
        if (localStorage.getItem('golf_settings_music') === null) localStorage.setItem('golf_settings_music', 'true');
        if (localStorage.getItem('golf_settings_fx') === null) localStorage.setItem('golf_settings_fx', 'true');
        if (localStorage.getItem('golf_settings_haptics') === null) localStorage.setItem('golf_settings_haptics', 'true');
    }

    private settingsBtnGraphics: Phaser.GameObjects.Graphics | undefined;
    private settingsHitArea: Phaser.GameObjects.Zone | undefined;
    private settingsBtnText: Phaser.GameObjects.Text | undefined;

    public create() {
        const { width, height } = this.scene.scale;

        // --- Retro Settings Butonu (Top Right) ---
        const isMobile = window.matchMedia('(pointer: coarse)').matches;
        // Desktop: 45px, Mobile: 120px from top per platform rules
        const gearY = isMobile ? 120 : 45;
        const gearX = width - 100;

        // Buton Arka Planı (Shadow effect first)
        this.settingsBtnGraphics = this.scene.add.graphics();
        this.settingsBtnGraphics.setDepth(10000);

        // Shadow
        this.settingsBtnGraphics.fillStyle(0x000000, 0.2);
        this.settingsBtnGraphics.fillCircle(gearX + 2, gearY + 2, 25);
        this.settingsBtnGraphics.setScrollFactor(0);

        // Main circle
        this.settingsBtnGraphics.fillStyle(this.colors.primary, 1);
        this.settingsBtnGraphics.fillCircle(gearX, gearY, 25);
        this.settingsBtnGraphics.lineStyle(3, this.colors.bgDark, 1);
        this.settingsBtnGraphics.strokeCircle(gearX, gearY, 25);

        // Gear teeth
        const teeth = 8;
        const innerRadius = 22;
        const outerRadius = 28;
        this.settingsBtnGraphics.fillStyle(this.colors.primary, 1);
        for (let i = 0; i < teeth; i++) {
            const angle = (i / teeth) * Math.PI * 2;
            const x1 = gearX + Math.cos(angle - 0.2) * innerRadius;
            const y1 = gearY + Math.sin(angle - 0.2) * innerRadius;
            const x2 = gearX + Math.cos(angle + 0.2) * innerRadius;
            const y2 = gearY + Math.sin(angle + 0.2) * innerRadius;
            const x3 = gearX + Math.cos(angle + 0.2) * outerRadius;
            const y3 = gearY + Math.sin(angle + 0.2) * outerRadius;
            const x4 = gearX + Math.cos(angle - 0.2) * outerRadius;
            const y4 = gearY + Math.sin(angle - 0.2) * outerRadius;

            this.settingsBtnGraphics.fillPoints([
                new Phaser.Math.Vector2(x1, y1),
                new Phaser.Math.Vector2(x2, y2),
                new Phaser.Math.Vector2(x3, y3),
                new Phaser.Math.Vector2(x4, y4)
            ], true);
            this.settingsBtnGraphics.strokePoints([
                new Phaser.Math.Vector2(x1, y1),
                new Phaser.Math.Vector2(x2, y2),
                new Phaser.Math.Vector2(x3, y3),
                new Phaser.Math.Vector2(x4, y4)
            ], true);
        }

        // Inner circle of gear
        this.settingsBtnGraphics.fillStyle(this.colors.bgLight, 1);
        this.settingsBtnGraphics.fillCircle(gearX, gearY, 8);
        this.settingsBtnGraphics.strokeCircle(gearX, gearY, 8);

        // Interaction Area for Settings Button (Circle)
        this.settingsHitArea = this.scene.add.zone(gearX, gearY, 60, 60).setInteractive(new Phaser.Geom.Circle(30, 30, 30), Phaser.Geom.Circle.Contains).setDepth(10002).setScrollFactor(0);
        this.settingsHitArea.setOrigin(0.5);

        this.settingsHitArea.on('pointerdown', () => {
            this.playSFX('ButtonClick');
            if (typeof (window as any).triggerHaptic === "function") {
                (window as any).triggerHaptic("light");
            }
            this.toggle();
        });

        // Hide by default (visible only during gameplay)
        this.setVisible(false);

        // --- Modal Container ---
        this.container = this.scene.add.container(width / 2, height / 2);
        this.container.setDepth(20000);
        this.container.setVisible(false);

        // Overlay
        const overlay = this.scene.add.graphics();
        overlay.fillStyle(0x000000, 0.75);
        overlay.fillRect(-width / 2, -height / 2, width, height);
        overlay.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
        this.container.add(overlay);

        // Panel (Retro Pixel Border Style)
        const panelWidth = 450;
        const panelHeight = 500;
        const panel = this.scene.add.graphics();

        // Shadow Effect
        panel.fillStyle(0x000000, 0.2);
        panel.fillRoundedRect(-panelWidth / 2 + 8, -panelHeight / 2 + 8, panelWidth, panelHeight, 12);

        // Main Bg
        panel.fillStyle(this.colors.bgLight, 1);
        panel.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);

        // Pixel Border
        panel.lineStyle(6, this.colors.border, 1);
        panel.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);

        this.container.add(panel);

        // Title
        const title = this.scene.add.text(0, -panelHeight / 2 + 60, 'SETTINGS', {
            fontSize: '32px',
            color: '#2d2822',
            fontFamily: '"Press Start 2P"',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(title);

        // Divider
        const divider = this.scene.add.graphics();
        divider.lineStyle(4, this.colors.border, 0.2);
        divider.lineBetween(-180, -panelHeight / 2 + 100, 180, -panelHeight / 2 + 100);
        this.container.add(divider);

        // Toggles
        this.createToggle('Music Enable', 'golf_settings_music', -80);
        this.createToggle('Audio FX', 'golf_settings_fx', 20);
        this.createToggle('Haptics Link', 'golf_settings_haptics', 120);

        // Close Button
        const closeBtnBg = this.scene.add.graphics();
        closeBtnBg.fillStyle(this.colors.primary, 1);
        closeBtnBg.fillRoundedRect(-80, panelHeight / 2 - 80, 160, 50, 8);
        closeBtnBg.lineStyle(4, this.colors.bgDark, 1);
        closeBtnBg.strokeRoundedRect(-80, panelHeight / 2 - 80, 160, 50, 8);
        this.container.add(closeBtnBg);

        const closeBtnText = this.scene.add.text(0, panelHeight / 2 - 55, 'BACK', {
            fontSize: '24px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P"',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.container.add(closeBtnText);

        // Close Button Hit Area
        const closeHitArea = this.scene.add.zone(0, panelHeight / 2 - 55, 160, 50).setInteractive({ useHandCursor: true });
        closeHitArea.on('pointerdown', () => {
            this.playSFX('ButtonClick');
            if (typeof (window as any).triggerHaptic === "function") {
                (window as any).triggerHaptic("light");
            }
            this.toggle();
        });
        this.container.add(closeHitArea);
    }

    private createToggle(labelTxt: string, key: string, y: number) {
        const row = this.scene.add.container(0, y);
        this.container?.add(row);

        const label = this.scene.add.text(-180, 0, labelTxt.toUpperCase(), {
            fontSize: '24px',
            color: '#3d3d4b',
            fontFamily: 'VT323',
            fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        row.add(label);

        const status = localStorage.getItem(key) === 'true';

        // Toggle Butonu Arka Planı
        const toggleBg = this.scene.add.graphics();
        this.drawToggleBtn(toggleBg, 120, -22, status);
        row.add(toggleBg);

        const toggleBtnText = this.scene.add.text(160, 0, status ? 'ON' : 'OFF', {
            fontSize: '20px',
            color: '#ffffff',
            fontFamily: '"Press Start 2P"',
            fontStyle: 'bold'
        }).setOrigin(0.5);

        const toggleHitArea = this.scene.add.zone(160, 0, 80, 44).setInteractive({ useHandCursor: true });
        toggleHitArea.on('pointerdown', () => {
            this.playSFX('ButtonClick');
            const current = localStorage.getItem(key) === 'true';
            const next = !current;
            localStorage.setItem(key, next.toString());

            toggleBtnText.setText(next ? 'ON' : 'OFF');
            this.drawToggleBtn(toggleBg, 120, -22, next);

            // Instant music feedback
            if (key === 'golf_settings_music') {
                const bgMusic = this.scene.sound.get('GolfBgMusic') as Phaser.Sound.BaseSound;
                if (bgMusic) {
                    if (next) {
                        if (!bgMusic.isPlaying) bgMusic.play();
                    } else {
                        bgMusic.stop();
                    }
                }
            }

            if (typeof (window as any).triggerHaptic === "function") {
                (window as any).triggerHaptic("light");
            }
        });
        row.add(toggleBtnText);
        row.add(toggleHitArea);
    }

    private playSFX(key: string) {
        if (localStorage.getItem('golf_settings_fx') === 'true') {
            this.scene.sound.play(key);
        }
    }

    private drawToggleBtn(graphics: Phaser.GameObjects.Graphics, x: number, y: number, state: boolean) {
        graphics.clear();
        graphics.fillStyle(state ? 0x4caf50 : 0x3d3d4b, 1); // Green if ON, Primary gray if OFF
        graphics.fillRoundedRect(x, y, 80, 44, 4);
        graphics.lineStyle(3, this.colors.bgDark, 1);
        graphics.strokeRoundedRect(x, y, 80, 44, 4);

        // Pixel shadow effect on button
        graphics.fillStyle(0x000000, 0.2);
        graphics.fillRect(x + 2, y + 35, 76, 6);
    }

    public setVisible(visible: boolean) {
        if (this.settingsBtnGraphics) this.settingsBtnGraphics.setVisible(visible);
        if (this.settingsHitArea) this.settingsHitArea.active = visible;
        if (this.settingsBtnText) this.settingsBtnText.setVisible(visible);
    }

    public getIsOpen() {
        return this.isOpen;
    }

    public toggle() {
        this.isOpen = !this.isOpen;
        this.container?.setVisible(this.isOpen);

        if (this.isOpen) {
            this.scene.matter.world.pause();
            // Bring this scene (Level) to the top so settings are visible over Menu scene
            this.scene.scene.bringToTop();
        } else {
            this.scene.matter.world.resume();
            // If we are still in the menu, bring Menu back to top
            if (this.scene.scene.isActive('Menu')) {
                this.scene.scene.bringToTop('Menu');
            }
        }
    }
}
