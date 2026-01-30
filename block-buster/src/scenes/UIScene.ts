
// You can write more code here

/* START OF COMPILED CODE */

export default class UIScene extends Phaser.Scene {

    constructor() {
        super("UIScene");

        /* START-USER-CTR-CODE */
        // Write your code here.
        /* END-USER-CTR-CODE */
    }

    editorCreate(): void {

        // Design your UI here via code or use the editor if available.
        // For now, I will implement basic text objects in create()
        this.events.emit("scene-awake");
    }

    /* START-USER-CODE */

    /* START-USER-CODE */
    private moneyDiv!: HTMLElement | null;
    private levelDiv!: HTMLElement | null;
    private reloadBtn!: HTMLElement | null;
    private damageBtn!: HTMLElement | null;
    private ballsBtn!: HTMLElement | null;
    private duplicateBtn!: HTMLElement | null;
    private rearshotBtn!: HTMLElement | null;
    private laserBtn!: HTMLElement | null;

    // Settings UI
    private btnSettings!: HTMLElement | null;
    private modalSettings!: HTMLElement | null;
    private btnCloseSettings!: HTMLElement | null;
    private toggleMusic!: HTMLInputElement | null;
    private toggleFX!: HTMLInputElement | null;
    private toggleHaptics!: HTMLInputElement | null;

    // Game Over UI
    private modalGameOver!: HTMLElement | null;
    private finalScoreText!: HTMLElement | null;
    private btnRestart!: HTMLElement | null;

    create() {

        this.editorCreate();

        // Get HTML Elements
        this.moneyDiv = document.getElementById('hud-money');
        this.levelDiv = document.getElementById('hud-level');
        this.reloadBtn = document.getElementById('btn-reload');
        this.damageBtn = document.getElementById('btn-damage');
        this.ballsBtn = document.getElementById('btn-balls');
        this.duplicateBtn = document.getElementById('btn-duplicate');
        this.rearshotBtn = document.getElementById('btn-rearshot');
        this.laserBtn = document.getElementById('btn-laser');
        console.log("Rear Shot Button found:", !!this.rearshotBtn);

        // Settings Elements
        this.btnSettings = document.getElementById('btn-settings');
        this.modalSettings = document.getElementById('modal-settings');
        this.btnCloseSettings = document.getElementById('btn-close-settings');
        this.toggleMusic = document.getElementById('toggle-music') as HTMLInputElement;
        this.toggleFX = document.getElementById('toggle-fx') as HTMLInputElement;
        this.toggleHaptics = document.getElementById('toggle-haptics') as HTMLInputElement;

        // Game Over Elements
        this.modalGameOver = document.getElementById('modal-gameover');
        this.finalScoreText = document.getElementById('final-score');
        this.btnRestart = document.getElementById('btn-restart');

        // Listen for events from the Game Scene
        const gameScene = this.scene.get('Scene');
        gameScene.events.emit('request-shop-update');

        // Setup Buttons
        if (this.reloadBtn) {
            this.reloadBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'reload');
                this.animateBtn(this.reloadBtn!);
            };
        }

        if (this.damageBtn) {
            this.damageBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'damage');
                this.animateBtn(this.damageBtn!);
            };
        }

        if (this.ballsBtn) {
            this.ballsBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'balls');
                this.animateBtn(this.ballsBtn!);
            };
        }

        if (this.duplicateBtn) {
            this.duplicateBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'duplicate');
                this.animateBtn(this.duplicateBtn!);
            };
        }

        if (this.rearshotBtn) {
            this.rearshotBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'rearshot');
                this.animateBtn(this.rearshotBtn!);
            };
        }

        if (this.laserBtn) {
            this.laserBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'laser');
                this.animateBtn(this.laserBtn!);
            };
        }

        // Settings Logic
        this.loadSettings();

        if (this.btnSettings) {
            this.btnSettings.onclick = () => {
                if (this.modalSettings) this.modalSettings.classList.remove('hidden');
            };
        }

        if (this.btnCloseSettings) {
            this.btnCloseSettings.onclick = () => {
                if (this.modalSettings) this.modalSettings.classList.add('hidden');
            };
        }

        if (this.toggleMusic) this.toggleMusic.onchange = () => this.saveSettings();
        if (this.toggleFX) this.toggleFX.onchange = () => this.saveSettings();
        if (this.toggleHaptics) this.toggleHaptics.onchange = () => this.saveSettings();

        // Game Over Logic
        if (this.btnRestart) {
            this.btnRestart.onclick = () => {
                // Reload the page to restart cleanly
                window.location.reload();
            };
        }

        gameScene.events.on('game-over', (score: number) => {
            if (this.modalGameOver) {
                this.modalGameOver.classList.remove('hidden');
            }
            if (this.finalScoreText) {
                this.finalScoreText.innerText = score.toString();
            }
        }, this);


        gameScene.events.on('update-money', (amount: number) => {
            if (this.moneyDiv) this.moneyDiv.innerText = 'MONEY: $' + amount;
        }, this);

        gameScene.events.on('update-level', (level: number) => {
            if (this.levelDiv) this.levelDiv.innerText = 'LEVEL: ' + level;
        }, this);

        gameScene.events.on('update-shop-prices', (prices: { reload: number, damage: number, balls: number, duplicate: number, rearshot: number, laser: number, reloadMax?: boolean, ballsMax?: boolean, duplicateMax?: boolean, rearshotMax?: boolean, laserMax?: boolean }) => {
            if (this.reloadBtn) {
                const priceText = prices.reloadMax ? 'MAX' : `$${prices.reload}`;
                this.reloadBtn.innerHTML = `
                    <span class="text-[8px] mb-1 text-white">RELOAD</span>
                    <span class="text-[10px] text-yellow-300">${priceText}</span>
                `;
            }
            if (this.damageBtn) {
                this.damageBtn.innerHTML = `
                    <span class="text-[8px] mb-1 text-white">DAMAGE</span>
                    <span class="text-[10px] text-yellow-300">$${prices.damage}</span>
                `;
            }
            if (this.ballsBtn) {
                const priceText = prices.ballsMax ? 'MAX' : `$${prices.balls}`;
                this.ballsBtn.innerHTML = `
                    <span class="text-[8px] mb-1 text-white">BALLS</span>
                    <span class="text-[10px] text-yellow-300">${priceText}</span>
                `;
            }
            if (this.duplicateBtn) {
                const priceText = prices.duplicateMax ? 'MAX' : `$${prices.duplicate}`;
                this.duplicateBtn.innerHTML = `
                    <span class="text-[8px] mb-1 text-white">DUPLICATE</span>
                    <span class="text-[10px] text-purple-300">${priceText}</span>
                `;
            }
            if (this.rearshotBtn) {
                const priceText = prices.rearshotMax ? 'MAX' : `$${prices.rearshot}`;
                this.rearshotBtn.innerHTML = `
                    <span class="text-[8px] mb-1 text-white">REAR SHOT</span>
                    <span class="text-[10px] text-orange-300">${priceText}</span>
                `;
            }
            if (this.laserBtn) {
                const priceText = prices.laserMax ? 'MAX' : `$${prices.laser}`;
                this.laserBtn.innerHTML = `
                    <span class="text-[8px] mb-1 text-white">LASER BEAM</span>
                    <span class="text-[10px] text-red-300">${priceText}</span>
                `;
            }
        }, this);

        // Ensure UI is visible (in case it was hidden)
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) {
            uiLayer.style.display = 'flex';
            // Ensure we remove any 'hidden' class if it was manually added before
            uiLayer.classList.remove('hidden');
        }
    }

    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('joy_settings') || '{"music":true,"fx":true,"haptics":true}');
        if (this.toggleMusic) this.toggleMusic.checked = settings.music;
        if (this.toggleFX) this.toggleFX.checked = settings.fx;
        if (this.toggleHaptics) this.toggleHaptics.checked = settings.haptics;
    }

    saveSettings() {
        const settings = {
            music: this.toggleMusic?.checked,
            fx: this.toggleFX?.checked,
            haptics: this.toggleHaptics?.checked
        };
        localStorage.setItem('joy_settings', JSON.stringify(settings));

        // Notify Game Scene
        const gameScene = this.scene.get('Scene');
        gameScene.events.emit('update-settings', settings);
    }

    animateBtn(btn: HTMLElement) {
        // CSS Animation or simple JS class toggle could work better, but let's use a simple transform
        btn.style.transform = 'translateY(4px)';
        setTimeout(() => {
            btn.style.transform = 'translateY(0px)';
        }, 100);
    }
    /* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
