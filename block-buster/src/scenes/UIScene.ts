
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
    private damageBtn!: HTMLElement | null;
    private ballsBtn!: HTMLElement | null;
    private duplicateBtn!: HTMLElement | null;
    private laserBtn!: HTMLElement | null;
    private electricBtn!: HTMLElement | null;
    private bombBtn!: HTMLElement | null;
    private burstBtn!: HTMLElement | null;

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
        this.damageBtn = document.getElementById('btn-damage');
        this.ballsBtn = document.getElementById('btn-balls');
        this.duplicateBtn = document.getElementById('btn-duplicate');
        this.laserBtn = document.getElementById('btn-laser');
        this.electricBtn = document.getElementById('btn-electric');
        this.bombBtn = document.getElementById('btn-bomb');

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

        if (this.laserBtn) {
            this.laserBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'laser');
                this.animateBtn(this.laserBtn!);
            };
        }

        if (this.electricBtn) {
            this.electricBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'electric');
                this.animateBtn(this.electricBtn!);
            };
        }

        if (this.bombBtn) {
            this.bombBtn.onclick = () => {
                gameScene.events.emit('request-upgrade', 'bomb');
                this.animateBtn(this.bombBtn!);
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

        // Burst Button
        this.burstBtn = document.getElementById('btn-burst');
        if (this.burstBtn) {
            this.animateBtn(this.burstBtn);
            this.burstBtn.addEventListener('touchstart', (e) => {
                e.preventDefault(); e.stopPropagation();
                gameScene.events.emit('request-upgrade', 'burst');
            });
            this.burstBtn.addEventListener('mousedown', (e) => {
                e.preventDefault(); e.stopPropagation();
                gameScene.events.emit('request-upgrade', 'burst');
            });
        }

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
            if (this.moneyDiv) this.moneyDiv.innerText = 'MONEY: $' + Math.floor(amount);
        }, this);

        gameScene.events.on('update-level', (level: number) => {
            if (this.levelDiv) this.levelDiv.innerText = 'LEVEL: ' + level;
        }, this);

        gameScene.events.on('update-shop-prices', (prices: { damage: number, balls: number, duplicate: number, burst: number, laser: number, electric: number, bomb: number, duplicateMax?: boolean, burstMax?: boolean, laserMax?: boolean, electricMax?: boolean, bombMax?: boolean, locked?: boolean, timeLocked?: boolean }) => {
            const isBallLocked = prices.locked === true;
            const isInitialLocked = prices.timeLocked === true;

            const toggleLock = (btn: HTMLElement | null, forceLocked: boolean = false) => {
                if (btn) {
                    if (forceLocked) {
                        btn.classList.add('opacity-50', 'pointer-events-none', 'grayscale');
                    } else {
                        btn.classList.remove('opacity-50', 'pointer-events-none', 'grayscale');
                    }
                }
            };

            if (this.damageBtn) {
                toggleLock(this.damageBtn, isInitialLocked || isBallLocked);
                this.damageBtn.innerHTML = `
                    <span class="label">DAMAGE</span>
                    <span class="price text-yellow-300">$${Math.round(prices.damage)}</span>
                `;
            }
            if (this.ballsBtn) {
                // Balls button is ONLY locked during the first 5 seconds
                toggleLock(this.ballsBtn, isInitialLocked);
                this.ballsBtn.innerHTML = `
                    <span class="label">BALLS</span>
                    <span class="price text-yellow-300">$${Math.round(prices.balls)}</span>
                `;
            }
            if (this.duplicateBtn) {
                toggleLock(this.duplicateBtn, isInitialLocked || isBallLocked);
                const priceText = prices.duplicateMax ? 'MAX' : `$${Math.round(prices.duplicate)}`;
                this.duplicateBtn.innerHTML = `
                    <span class="label">DUPLICATE</span>
                    <span class="price text-purple-300">${priceText}</span>
                `;
            }
            if (this.laserBtn) {
                toggleLock(this.laserBtn, isInitialLocked || isBallLocked);
                const priceText = prices.laserMax ? 'MAX' : `$${Math.round(prices.laser)}`;
                this.laserBtn.innerHTML = `
                    <span class="label">LASER</span>
                    <span class="price text-red-300">${priceText}</span>
                `;
            }
            if (this.electricBtn) {
                toggleLock(this.electricBtn, isInitialLocked || isBallLocked);
                const priceText = prices.electricMax ? 'MAX' : `$${Math.round(prices.electric)}`;
                this.electricBtn.innerHTML = `
                    <span class="label">ELECTRIC</span>
                    <span class="price text-blue-300">${priceText}</span>
                `;
            }
            if (this.bombBtn) {
                toggleLock(this.bombBtn, isInitialLocked || isBallLocked);
                const priceText = prices.bombMax ? 'MAX' : `$${Math.round(prices.bomb)}`;
                this.bombBtn.innerHTML = `
                    <span class="label">BOMB</span>
                    <span class="price text-orange-300">${priceText}</span>
                `;
            }
            if (this.burstBtn) {
                toggleLock(this.burstBtn, isInitialLocked || isBallLocked);
                const priceText = `$${Math.round(prices.burst)}`;
                this.burstBtn.innerHTML = `
                    <span class="label">BURST</span>
                    <span class="price text-red-300">${priceText}</span>
                `;
            }
        }, this);

        const uiLayer = document.getElementById('ui-layer');
        const settingsBtn = document.getElementById('btn-settings');

        // Show UI by default since UIScene is only active during gameplay
        if (uiLayer) {
            uiLayer.classList.remove('hidden');
            uiLayer.style.display = 'flex';
        }
        if (settingsBtn) {
            settingsBtn.classList.remove('hidden');
        }

        // Listen for game states (redundant but safe)
        gameScene.events.on('game-start', () => {
            if (uiLayer) {
                uiLayer.classList.remove('hidden');
                uiLayer.style.display = 'flex';
            }
            if (settingsBtn) {
                settingsBtn.classList.remove('hidden');
            }
        });

        gameScene.events.on('game-over', (score: number) => {
            // Hide normal UI, but keep the game over modal visible (handled elsewhere)
            if (uiLayer) {
                // We keep uiLayer visible for the modal, but hide children?
                // Better: Hide HUD, but show modal
                const hud = document.getElementById('ui-bottom-bar');
                if (hud) hud.classList.add('hidden');
            }
            if (settingsBtn) settingsBtn.classList.add('hidden');

            if (this.modalGameOver) {
                this.modalGameOver.classList.remove('hidden');
                this.modalGameOver.style.display = 'flex';
            }
            if (this.finalScoreText) {
                this.finalScoreText.innerText = score.toString();
            }
        }, this);

        gameScene.events.emit('request-shop-update');
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
