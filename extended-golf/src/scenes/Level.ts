
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import TerrainGenerator from "../scripts/TerrainGenerator";
import SettingsModal from "../scripts/SettingsModal";
/* END-USER-IMPORTS */

export default class Level extends Phaser.Scene {

	constructor() {
		super("Level");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		// fufuSuperDino
		this.add.image(640, 257, "FufuSuperDino");

		// text
		const text = this.add.text(640, 458, "", {});
		text.setOrigin(0.5, 0.5);
		text.text = "Phaser 3 + Phaser Editor v4\nVite + TypeScript";
		text.setStyle({ "align": "center", "fontFamily": "Arial", "fontSize": "3em" });

		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	private ball: MatterJS.BodyType | undefined;
	private graphics: Phaser.GameObjects.Graphics | undefined;
	private isDragging: boolean = false;
	private dragStartPoint: Phaser.Math.Vector2 | undefined;
	private scoreText: Phaser.GameObjects.Text | undefined;
	private shotsRemaining: number = 2;
	private shotVisuals: Phaser.GameObjects.Arc[] = [];
	private ballMoving: boolean = false;
	private isGameOver: boolean = false;
	private isTransitioning: boolean = false;
	private spawnPoint: { x: number, y: number } = { x: 0, y: 0 };
	private settingsModal: SettingsModal | undefined;
	private terrainGen: TerrainGenerator | undefined;
	private currentTerrain: any; // TerrainInstance
	private flagGraphics: Phaser.GameObjects.Graphics | undefined;
	private bgMusic: Phaser.Sound.BaseSound | undefined;
	private ballVisual: Phaser.GameObjects.Arc | undefined;
	private lastSettledPos: { x: number, y: number } | undefined;
	private stopTimestamp: number = 0;
	private isWaitingForGameOver: boolean = false;
	private isMenuOpen: boolean = true;
	private lastTrailSpawnTime: number = 0;

	create() {
		// --- Explicit State Resets ---
		this.isGameOver = false;
		this.shotsRemaining = 2;
		this.ballMoving = false;
		this.shotVisuals = [];
		this.data.set('isWon', false);
		this.isTransitioning = false;
		this.isWaitingForGameOver = false;
		this.stopTimestamp = 0;
		this.lastSettledPos = undefined;
		this.isMenuOpen = true;

		// Matter.js settings
		// Matter.js settings - Reduced iterations for better mobile performance
		this.matter.world.engine.positionIterations = 8;
		this.matter.world.engine.velocityIterations = 8;
		this.matter.world.engine.constraintIterations = 8;
		this.matter.world.engine.enableSleeping = false;

		const width = this.scale.width;
		const height = this.scale.height;

		// --- Audio Setup ---
		if (!this.sound.get('GolfBgMusic')) {
			this.bgMusic = this.sound.add('GolfBgMusic', { loop: true, volume: 0.4 });
		} else {
			this.bgMusic = this.sound.get('GolfBgMusic');
		}

		if (localStorage.getItem('golf_settings_music') === 'true' && this.bgMusic && !this.bgMusic.isPlaying) {
			this.bgMusic.play();
		}

		// Background & Decoration
		const sky = this.add.graphics();
		sky.fillStyle(0x81D4FA, 1);
		sky.fillRect(0, 0, width, height);
		sky.setDepth(-100);
		sky.setScrollFactor(0);

		// --- Add Mountains (Background Parallax) ---
		for (let i = 0; i < 5; i++) {
			const mx = Phaser.Math.Between(0, width * 3);
			const my = height * 0.75;
			const mWidth = Phaser.Math.Between(400, 800);
			const mHeight = Phaser.Math.Between(300, 500);

			const mountain = this.add.graphics();
			mountain.fillStyle(0x4A9099, 0.4); // Tealy-blue shade from reference
			// Use ellipse for smooth mountain shape
			mountain.fillEllipse(mx, my, mWidth, mHeight * 2);
			mountain.setDepth(-95);
			mountain.setScrollFactor(0.05); // Very slow parallax
		}

		// --- Add Stylized Clouds (Pill Shape) ---
		for (let i = 0; i < 10; i++) {
			const cx = Phaser.Math.Between(0, width * 3);
			const cy = Phaser.Math.Between(20, 250);
			const cWidth = Phaser.Math.Between(120, 240);
			const cHeight = Phaser.Math.Between(40, 70);

			const cloud = this.add.graphics();
			cloud.fillStyle(0xffffff, 0.3); // Semi-transparent white
			cloud.fillRoundedRect(-cWidth / 2, -cHeight / 2, cWidth, cHeight, cHeight / 2);

			const container = this.add.container(cx, cy, [cloud]);
			container.setDepth(-90);
			container.setScrollFactor(0.15); // Slightly faster than mountains

			// Slow horizontal drifting
			this.tweens.add({
				targets: container,
				x: cx + Phaser.Math.Between(50, 150),
				duration: Phaser.Math.Between(8000, 15000),
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut'
			});
		}

		// Terrain
		this.terrainGen = new TerrainGenerator(this);
		const currentScore = this.registry.get('score') || 0;
		// Reach difficulty (1 + 5/12) ≈ 1.416 at score 100
		const cappedScore = Math.min(currentScore, 100);
		const initialDifficulty = 1 + (cappedScore * (0.05 / 12));
		this.currentTerrain = this.terrainGen.generateTerrain(undefined, 0, initialDifficulty);

		this.settingsModal = new SettingsModal(this);
		this.settingsModal.create();

		this.drawFlag();

		// Launch Menu as overlay
		this.isMenuOpen = true;
		this.matter.world.pause();
		this.scene.launch('Menu');

		// Smooth Entry
		this.cameras.main.fadeIn(500, 0, 0, 0);

		// Hide HUD and Settings on start screen
		this.settingsModal?.setVisible(false);
		this.scoreText?.setVisible(false);
	}

	public resumeFromMenu() {
		this.isMenuOpen = false;
		this.matter.world.resume();

		// Show Settings only during gameplay
		this.settingsModal?.setVisible(true);

		// Start gameplay with a delay/animation
		this.startGameplay();
	}

	private createBallObject() {
		// Cleanup old visual if it exists (like the one stuck in the hole)
		if (this.ballVisual) {
			this.ballVisual.destroy();
			this.ballVisual = undefined;
		}

		const ballRadius = 15;
		this.ball = this.matter.add.circle(this.spawnPoint.x, this.spawnPoint.y, ballRadius, {
			restitution: 0.45,
			friction: 0.001,
			frictionAir: 0.0004,
			frictionStatic: 0,
			density: 0.002,
			render: { fillColor: 0xffffff }
		});

		this.ballVisual = this.add.circle(this.spawnPoint.x, this.spawnPoint.y, ballRadius, 0xffffff);
		this.ballVisual.setDepth(50);
		this.matter.add.gameObject(this.ballVisual, this.ball);
	}

	private startGameplay() {
		// 1. Setup spawn point
		const spawnX = this.data.get('spawnX');
		const spawnY = this.data.get('spawnY');
		this.spawnPoint = { x: spawnX, y: spawnY - 20 };

		this.createBallObject();
		this.ballVisual?.setAlpha(0);

		this.graphics = this.add.graphics();
		this.graphics.setDepth(100); // Drag arrow always on top
		this.dragStartPoint = new Phaser.Math.Vector2(0, 0);

		this.createUI();
		this.scoreText?.setAlpha(0);
		this.shotVisuals.forEach(v => v.setAlpha(0));

		// Collision Detection - Win is now handled in update() with 1s stay rule
		this.matter.world.on('collisionstart', (event: any) => {
			event.pairs.forEach((pair: any) => {
				const { bodyA, bodyB } = pair;

				const isHoleHit = (bodyA.label === 'hole-bottom' || bodyA.label === 'hole-sensor') && bodyB === this.ball ||
					(bodyB.label === 'hole-bottom' || bodyB.label === 'hole-sensor') && bodyA === this.ball;

				if (isHoleHit && !this.data.get('isWon')) {
					// Optional: Play a "plop" sound if needed, but win is delayed 1s
				}
			});
		});

		// Interaction (Re-bind to ensure fresh state)
		this.input.removeAllListeners();
		this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
		this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
		this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));

		// Final Smooth Fade In for everything
		this.tweens.add({
			targets: [this.ballVisual, this.scoreText, ...this.shotVisuals],
			alpha: 1,
			duration: 800,
			ease: 'Power2',
			onStart: () => {
				this.scoreText?.setVisible(true);
				this.shotVisuals.forEach(v => v.setVisible(true));
			}
		});
	}

	private playSFX(key: string) {
		if (localStorage.getItem('golf_settings_fx') === 'true') {
			this.sound.play(key);
		}
	}

	private createUI() {
		const height = this.scale.height;
		this.add.text(10, 10, 'Drag on ball to shoot', { fontSize: '20px', color: '#ffffff' }).setScrollFactor(0);

		if (this.registry.get('score') === undefined) this.registry.set('score', 0);
		this.scoreText = this.add.text(10, 40, `Score: ${this.registry.get('score')}`, {
			fontSize: '32px', color: '#ffffff', fontFamily: 'VT323',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 4
		}).setDepth(1000).setScrollFactor(0);

		this.shotVisuals = [];
		const startX = 30;
		const startY = height - 30;
		for (let i = 0; i < 2; i++) {
			const ball = this.add.circle(startX + i * 25, startY, 8, 0xffffff);
			ball.setDepth(1000).setStrokeStyle(2, 0x000000).setScrollFactor(0);
			this.shotVisuals.push(ball);
		}
	}

	private drawFlag() {
		const holeX = this.data.get('holeX');
		const holeY = this.data.get('holeY');
		if (this.flagGraphics) this.flagGraphics.destroy();
		this.flagGraphics = this.add.graphics();
		this.flagGraphics.setDepth(10); // Terrainin önünde ama topun arkasında olabilir
		this.flagGraphics.lineStyle(6, 0xCCCCCC, 1).beginPath()
			.moveTo(holeX, holeY).lineTo(holeX, holeY - 140).strokePath();
		this.flagGraphics.fillStyle(0xFF0000, 1).beginPath()
			.moveTo(holeX, holeY - 140).lineTo(holeX + 50, holeY - 110)
			.lineTo(holeX, holeY - 80).closePath().fillPath();
	}

	private onPointerDown(pointer: Phaser.Input.Pointer) {
		if (!this.ball || this.ballMoving || this.shotsRemaining <= 0 || this.isGameOver || this.data.get('isWon') || this.isTransitioning || this.isMenuOpen) return;
		if (this.settingsModal?.getIsOpen()) return;
		const dist = Phaser.Math.Distance.Between(pointer.x + this.cameras.main.scrollX, pointer.y, this.ball.position.x, this.ball.position.y);
		if (dist < 80) { // Increased from 50 for easier mobile pickup
			this.isDragging = true;
			this.dragStartPoint?.set(pointer.x, pointer.y);
		}
	}

	private onPointerMove(pointer: Phaser.Input.Pointer) {
		if (this.isDragging && this.ball && this.graphics) {
			this.graphics.clear().fillStyle(0xffffff, 1);
			const pullX = (this.ball.position.x - this.cameras.main.scrollX) - pointer.x;
			const pullY = this.ball.position.y - pointer.y;
			const vx = pullX * 0.022 * 3.75;
			const vy = pullY * 0.022 * 3.75;
			for (let i = 0; i < 15; i++) {
				const t = (i + 1) * 3;
				const px = this.ball.position.x + vx * t;
				const py = this.ball.position.y + vy * t + 0.5 * 1 * t * t * 0.05;
				this.graphics.beginPath().arc(px, py, 4, 0, Math.PI * 2).fillPath();
			}
		}
	}

	private onPointerUp(pointer: Phaser.Input.Pointer) {
		if (this.isDragging && this.ball && this.graphics) {
			this.isDragging = false;
			this.graphics.clear();
			// SNAPPY LAUNCH: Reduced force multiplier by 1.5x for better control
			// SNAPPY LAUNCH: Using setVelocity instead of applyForce to prevent FPS-dependent distance
			const velX = (this.ball.position.x - (pointer.x + this.cameras.main.scrollX)) * 0.096;
			const velY = (this.ball.position.y - pointer.y) * 0.096;
			this.matter.body.setVelocity(this.ball, { x: velX, y: velY });
			this.shotsRemaining--;
			this.updateShotVisuals();
			this.playSFX('HitBall');
			if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("light");
		}
	}

	private handleWin() {
		this.data.set('isWon', true);

		// 1. Disable Physics & Animate ball to bottom
		if (this.ball && this.ballVisual) {
			const holeX = this.data.get('holeX');
			const holeY = this.data.get('holeY');
			const holeDepth = this.data.get('holeDepth');
			const ballRadius = 15;

			// Remove from physics world immediately
			this.matter.world.remove(this.ball);
			this.ball = undefined;

			// Smoothly slide ball to the very bottom
			this.tweens.add({
				targets: this.ballVisual,
				x: holeX,
				y: holeY + holeDepth - ballRadius + 5,
				duration: 800,
				ease: 'Cubic.out'
			});
		}

		const currentScore = this.registry.get('score') + 1;
		this.registry.set('score', currentScore);
		if (this.scoreText) this.scoreText.setText(`Score: ${currentScore}`);

		this.playSFX('Score');

		this.add.text(this.cameras.main.scrollX + this.scale.width / 2, this.scale.height / 2, 'SCORE!', {
			fontSize: '84px', color: '#ffffff', fontFamily: '"Press Start 2P"',
			fontStyle: 'bold', stroke: '#000000', strokeThickness: 12
		}).setOrigin(0.5).setDepth(100);

		if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("success");

		this.time.delayedCall(1500, () => this.startTransition());
	}

	private startTransition() {
		this.isTransitioning = true;
		const lastY = this.currentTerrain.points[this.currentTerrain.points.length - 1].y;
		const currentScore = this.registry.get('score') || 0;
		// Reach difficulty (1 + 5/12) ≈ 1.416 at score 100
		const cappedScore = Math.min(currentScore, 100);
		const nextDifficulty = 1 + (cappedScore * (0.05 / 12));
		const nextTerrain = this.terrainGen!.generateTerrain(lastY, this.cameras.main.scrollX + this.scale.width, nextDifficulty);

		this.cameras.main.pan(this.cameras.main.scrollX + this.scale.width + this.scale.width / 2, this.scale.height / 2, 2000, 'Power2');

		this.cameras.main.once('camerapancomplete', () => {
			// Cleanup old
			this.currentTerrain.graphics.destroy();
			this.currentTerrain.bodies.forEach((b: any) => this.matter.world.remove(b));

			this.currentTerrain = nextTerrain;
			this.isTransitioning = false;
			this.data.set('isWon', false);
			this.shotsRemaining = 2;
			this.updateShotVisuals();

			// Move ball to new spawn
			const sX = this.data.get('spawnX');
			const sY = this.data.get('spawnY');
			this.spawnPoint = { x: sX, y: sY - 20 };
			this.resetBall();
			this.drawFlag();
		});
	}

	update(time: number, delta: number) {
		// PERFECT DELTA SYNC: Manually step physics to match real-time (PC speed) on any mobile device
		this.matter.world.step(delta);

		if (!this.ball || this.isGameOver) return;

		const velocity = Math.sqrt(this.ball.velocity.x ** 2 + this.ball.velocity.y ** 2);
		const angularVelocity = Math.abs(this.ball.angularVelocity);

		// Daha hassas durma kontrolü (hem hız hem de dönme)
		// Eğimde akması için eşiği düşürdük
		this.ballMoving = velocity > 0.02 || angularVelocity > 0.005;

		if (!this.isTransitioning && (this.ball.position.y > this.scale.height + 150 || Math.abs(this.ball.position.x - (this.cameras.main.scrollX + this.scale.width / 2)) > 800)) {
			this.resetBall();
			if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("error");
		}

		// --- WIN DETECTION: Must stay in hole for 1 second ---
		const holeX = this.data.get('holeX');
		const holeY = this.data.get('holeY');
		const holeWidth = this.data.get('holeWidth');

		// Trail logic (Clone trail) - Optimized spawn rate for mobile
		if (this.ball && this.ballMoving && velocity > 0.5) {
			const now = this.time.now;
			if (now - this.lastTrailSpawnTime > 50) { // Reduced frequency from 25ms to 50ms
				this.lastTrailSpawnTime = now;
				const ghost = this.add.circle(this.ball.position.x, this.ball.position.y, 15, 0xffffff);
				ghost.setDepth(40).setAlpha(0.5);

				this.tweens.add({
					targets: ghost,
					alpha: 0,
					scale: 0,
					duration: 800,
					onComplete: () => ghost.destroy()
				});
			}
		}

		// --- WIN DETECTION: Immediate when entering hole mouth ---
		const inHoleX = Math.abs(this.ball.position.x - holeX) < (holeWidth / 2) + 5;
		const inHoleY = this.ball.position.y > holeY && this.ball.position.y < holeY + 30; // Just entering the top

		if (inHoleX && inHoleY && !this.data.get('isWon') && !this.isTransitioning) {
			this.handleWin();
		}

		// Atışlar bittiyse ve top TAMAMEN durduysa Game Over süreci başlasın
		if (!this.ballMoving && this.shotsRemaining <= 0 && !this.data.get('isWon') && !this.isTransitioning) {
			if (!this.isWaitingForGameOver) {
				// İlk duruş anı: Konumu ve zamanı kaydet
				this.isWaitingForGameOver = true;
				this.stopTimestamp = this.time.now;
				this.lastSettledPos = { x: this.ball.position.x, y: this.ball.position.y };
			} else {
				// Zaten bekliyoruz, 2 saniye geçti mi kontrol et
				const elapsed = this.time.now - this.stopTimestamp;
				if (elapsed >= 2000) {
					// 2 saniye doldu, konumu tekrar kontrol et
					const distMoved = Phaser.Math.Distance.Between(
						this.ball!.position.x, this.ball!.position.y,
						this.lastSettledPos!.x, this.lastSettledPos!.y
					);

					if (distMoved < 2) {
						// Gerçekten durmuş!
						this.handleGameOver();
					} else {
						// Hala hareket ediyor veya kaymış, bekleme durumunu sıfırla tekrar ölçmeye başla
						this.isWaitingForGameOver = false;
					}
				}
			}
		} else {
			// Top tekrar hareket ederse (veya haklar dolarsa) bekleme sürecini iptal et
			this.isWaitingForGameOver = false;
		}
	}

	private updateShotVisuals() {
		this.shotVisuals.forEach((v, i) => v.setFillStyle(i >= this.shotsRemaining ? 0x666666 : 0xffffff));
	}

	private resetBall() {
		if (!this.ball) {
			this.createBallObject();
			return;
		}
		this.matter.body.setVelocity(this.ball, { x: 0, y: 0 });
		this.matter.body.setAngularVelocity(this.ball, 0);
		(this.matter.body as any).setPosition(this.ball, { x: this.spawnPoint.x, y: this.spawnPoint.y });
		this.ball.isSleeping = false;
		if (this.ball.gameObject) {
			const obj = this.ball.gameObject as any;
			obj.x = this.spawnPoint.x;
			obj.y = this.spawnPoint.y;
		}
	}

	private handleGameOver() {
		if (this.isGameOver) return;
		this.isGameOver = true;

		this.playSFX('GameOver');
		this.settingsModal?.setVisible(false);

		// Hide gameplay HUD
		this.scoreText?.setVisible(false);
		this.shotVisuals.forEach(v => v.setVisible(false));

		// Score is submitted at game over
		const finalScore = this.registry.get('score');

		if (typeof (window as any).submitScore === "function") (window as any).submitScore(finalScore);
		if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("error");

		const { width, height } = this.scale;
		const centerX = this.cameras.main.scrollX + width / 2;
		const centerY = height / 2;

		// 1. Overlay
		this.add.graphics()
			.fillStyle(0x000000, 0.8)
			.fillRect(this.cameras.main.scrollX, 0, width, height)
			.setDepth(5000);

		// 2. Panel Setup (Retro Pixel Mono Style)
		const panelWidth = 440;
		const panelHeight = 440; // Adjusted for score only
		const panel = this.add.graphics().setDepth(5001);

		// Shadow
		panel.fillStyle(0x000000, 0.4);
		panel.fillRoundedRect(centerX - panelWidth / 2 + 10, centerY - panelHeight / 2 + 10, panelWidth, panelHeight, 12);

		// Bg (Light Gray)
		panel.fillStyle(0xcccccc, 1);
		panel.fillRoundedRect(centerX - panelWidth / 2, centerY - panelHeight / 2, panelWidth, panelHeight, 12);

		// Border (Black)
		panel.lineStyle(6, 0x000000, 1);
		panel.strokeRoundedRect(centerX - panelWidth / 2, centerY - panelHeight / 2, panelWidth, panelHeight, 12);

		// 3. Texts
		this.add.text(centerX, centerY - 140, 'GAME OVER', {
			fontSize: '42px', color: '#000000', fontFamily: '"Press Start 2P"', fontStyle: 'bold'
		}).setOrigin(0.5).setDepth(5002);

		// Divider
		panel.lineStyle(4, 0x000000, 0.2);
		panel.lineBetween(centerX - 160, centerY - 90, centerX + 160, centerY - 90);

		// Current Score
		this.add.text(centerX, centerY - 30, 'TOTAL SCORE', {
			fontSize: '32px', color: '#444444', fontFamily: 'VT323', fontStyle: 'bold'
		}).setOrigin(0.5).setDepth(5002);

		this.add.text(centerX, centerY + 40, finalScore.toString(), {
			fontSize: '90px', color: '#000000', fontFamily: 'VT323', fontStyle: 'bold'
		}).setOrigin(0.5).setDepth(5002);

		// 4. Retry Button
		const btnWidth = 200;
		const btnHeight = 60;
		const btnY = centerY + 145;

		const btnGfx = this.add.graphics().setDepth(5003);
		btnGfx.fillStyle(0x000000, 0.3);
		btnGfx.fillRoundedRect(centerX - btnWidth / 2 + 4, btnY - btnHeight / 2 + 4, btnWidth, btnHeight, 8);
		btnGfx.fillStyle(0x333333, 1);
		btnGfx.fillRoundedRect(centerX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, 8);
		btnGfx.lineStyle(4, 0x000000, 1);
		btnGfx.strokeRoundedRect(centerX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, 8);

		const retryBtn = this.add.text(centerX, btnY, 'RETRY', {
			fontSize: '24px', color: '#ffffff', fontFamily: '"Press Start 2P"', fontStyle: 'bold'
		}).setOrigin(0.5).setDepth(5004).setInteractive({ useHandCursor: true });

		retryBtn.on('pointerdown', () => {
			if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("light");
			this.playSFX('ButtonClick');
			this.registry.set('score', 0);
			this.scene.restart();
		});

		retryBtn.on('pointerover', () => {
			if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("light");
			btnGfx.clear();
			btnGfx.fillStyle(0x000000, 0.3);
			btnGfx.fillRoundedRect(centerX - btnWidth / 2 + 4, btnY - btnHeight / 2 + 4, btnWidth, btnHeight, 8);
			btnGfx.fillStyle(0x444444, 1);
			btnGfx.fillRoundedRect(centerX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, 8);
			btnGfx.strokeRoundedRect(centerX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, 8);
		});

		retryBtn.on('pointerout', () => {
			btnGfx.clear();
			btnGfx.fillStyle(0x000000, 0.3);
			btnGfx.fillRoundedRect(centerX - btnWidth / 2 + 4, btnY - btnHeight / 2 + 4, btnWidth, btnHeight, 8);
			btnGfx.fillStyle(0x333333, 1);
			btnGfx.fillRoundedRect(centerX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, 8);
			btnGfx.strokeRoundedRect(centerX - btnWidth / 2, btnY - btnHeight / 2, btnWidth, btnHeight, 8);
		});
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
