
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import TerrainGenerator from "../scripts/TerrainGenerator";
import SettingsModal from "../scripts/SettingsModal";
import ThemeManager, { SeasonType, TimeType } from "../scripts/ThemeManager";
import SkinManager, { SkinType } from "../scripts/SkinManager";
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
	private ballVisual: Phaser.GameObjects.Arc | Phaser.GameObjects.Container | undefined;
	private lastSettledPos: { x: number, y: number } | undefined;
	private stopTimestamp: number = 0;
	private isWaitingForGameOver: boolean = false;
	private isMenuOpen: boolean = true;
	private indicatorGraphics: Phaser.GameObjects.Graphics | undefined;
	private sky: Phaser.GameObjects.Graphics | undefined;
	private trailPositions: { x: number, y: number }[] = [];
	private trailGraphics: Phaser.GameObjects.Graphics | undefined;
	private lastTrailSpawnTime: number = 0;
	private readonly MAX_TRAIL_LENGTH: number = 20;

	create() {
		// #region agent log
		fetch('http://127.0.0.1:7245/ingest/997351de-2588-4a8c-ab40-731c1e4f75c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Level.ts:create',message:'Level create() called',data:{hadOldModal:!!this.settingsModal},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
		// #endregion
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
		this.trailPositions = [];

		// Matter.js settings
		// Matter.js settings - Higher iterations to prevent tunneling through smoother terrain
		this.matter.world.engine.positionIterations = 12;
		this.matter.world.engine.velocityIterations = 12;
		this.matter.world.engine.constraintIterations = 12;
		this.matter.world.engine.enableSleeping = false;

		// Indicator Graphics
		this.indicatorGraphics = this.add.graphics();
		this.indicatorGraphics.setDepth(100);
		this.indicatorGraphics.setScrollFactor(0);

		const width = this.scale.width;
		const height = this.scale.height;

		// --- Audio Setup (add sound reference only, don't play yet - iOS requires user gesture) ---
		if (!this.sound.get('GolfBgMusic')) {
			this.bgMusic = this.sound.add('GolfBgMusic', { loop: true, volume: 0.4 });
		} else {
			this.bgMusic = this.sound.get('GolfBgMusic');
		}
		// Music will start in resumeFromMenu() after user clicks PLAY

		// Background & Decoration
		// Fetch current theme from registry
		const season = this.registry.get('season') as SeasonType || 'spring';
		const time = this.registry.get('time') as TimeType || 'day';
		const theme = ThemeManager.getColors(season, time);

		this.sky = this.add.graphics();
		this.sky.fillStyle(theme.sky, 1);
		this.sky.fillRect(0, 0, width, height);
		this.sky.setDepth(-100);
		this.sky.setScrollFactor(0);

		// --- Add Mountains (Background Parallax) ---
		for (let i = 0; i < 5; i++) {
			const mx = Phaser.Math.Between(0, width * 3);
			const my = height * 0.75;
			const mWidth = Phaser.Math.Between(400, 800);
			const mHeight = Phaser.Math.Between(300, 500);

			const mountain = this.add.graphics();
			mountain.fillStyle(theme.mountains, theme.mountainAlpha); // Themed Mountain Color
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
			cloud.fillStyle(theme.clouds, 0.3); // Themed clouds
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

		// Pass theme to generator
		this.currentTerrain = this.terrainGen.generateTerrain(undefined, 0, initialDifficulty, theme);

		// Clean up old SettingsModal before creating new one (prevents duplicate DOM listeners on restart)
		if (this.settingsModal) {
			this.settingsModal.destroy();
		}
		this.settingsModal = new SettingsModal(this);
		this.settingsModal.create();

		// Clean up on scene shutdown/restart to prevent stale DOM handlers
		this.events.once('shutdown', () => {
			console.log('[Level] Scene shutdown - cleaning up');
			this.settingsModal?.destroy();
			this.input.removeAllListeners();
			this.scale.off('resize', this.onResize, this);
		});

		this.drawFlag();

		// Launch Menu as overlay
		this.isMenuOpen = true;
		this.matter.world.pause();
		this.scene.launch('Menu');

		// Handle resize events for dynamic viewport
		this.scale.on('resize', this.onResize, this);

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

		// Start background music now (after user gesture - required for iOS)
		if (localStorage.getItem('golf_settings_music') === 'true' && this.bgMusic && !this.bgMusic.isPlaying) {
			this.bgMusic.play();
		}

		// Start gameplay with a delay/animation
		this.startGameplay();
	}

	public updateTheme() {
		const season = this.registry.get('season') as SeasonType || 'spring';
		const time = this.registry.get('time') as TimeType || 'day';
		const theme = ThemeManager.getColors(season, time);

		if (this.sky) {
			const width = this.scale.width;
			const height = this.scale.height;
			this.sky.clear();
			this.sky.fillStyle(theme.sky, 1);
			this.sky.fillRect(0, 0, width, height);
		}

		// Update Terrain Colors
		if (this.terrainGen && this.currentTerrain) {
			this.terrainGen.redraw(this.currentTerrain, theme);
		}
	}

	private onResize() {
		const width = this.scale.width;
		const height = this.scale.height;

		// Update sky to fill new viewport
		if (this.sky) {
			const season = this.registry.get('season') as SeasonType || 'spring';
			const time = this.registry.get('time') as TimeType || 'day';
			const theme = ThemeManager.getColors(season, time);
			this.sky.clear();
			this.sky.fillStyle(theme.sky, 1);
			this.sky.fillRect(0, 0, width, height);
		}

		// Update shot visuals position
		if (this.shotVisuals && this.shotVisuals.length > 0) {
			const startY = height - 30;
			this.shotVisuals.forEach((ball, i) => {
				ball.setY(startY);
			});
		}
	}

	private createBallObject() {
		// Cleanup old visual if it exists
		if (this.ballVisual) {
			this.ballVisual.destroy();
			this.ballVisual = undefined;
		}

		// Get selected setup
		const ballColor = this.registry.get('ballColor') || 0xffffff;
		const ballSkin = (this.registry.get('ballSkin') as SkinType) || 'solid';

		const ballRadius = 15;
		this.ball = this.matter.add.circle(this.spawnPoint.x, this.spawnPoint.y, ballRadius, {
			restitution: 0.08,    // Minimal bounce - ball lands and rolls
			friction: 0.005,      // Enough friction for natural rolling (not sliding)
			frictionAir: 0.0008,  // Low air drag for longer carries
			frictionStatic: 0.005, // Very low static friction to prevent sticking on slopes
			density: 0.003,       // Slightly lighter for smoother momentum transfer
			render: { fillColor: ballColor }
		});

		// Use SkinManager based Container
		// Note: MatterJS gameObject binding usually expects a single DisplayObject (Sprite/Image/Container).
		// Containers work but origin needs care. Container 0,0 is usually center if children are centered.

		this.ballVisual = SkinManager.drawBall(this, this.spawnPoint.x, this.spawnPoint.y, ballRadius, ballColor, ballSkin);
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

		// Trail graphics for the ribbon effect
		this.trailGraphics = this.add.graphics();
		this.trailGraphics.setDepth(40);

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

				// Ball-terrain bounce haptic feedback
				const isTerrainBounce =
					(bodyA.label === 'terrain' && bodyB === this.ball) ||
					(bodyB.label === 'terrain' && bodyA === this.ball);

				if (isTerrainBounce && !this.isGameOver && !this.data.get('isWon')) {
					// Check haptics setting
					if (localStorage.getItem('golf_settings_haptics') !== 'false') {
						// Scale haptic intensity by impact velocity
						const velocity = this.ball ? Math.sqrt(this.ball.velocity.x ** 2 + this.ball.velocity.y ** 2) : 0;

						if (typeof (window as any).triggerHaptic === "function") {
							if (velocity > 8) {
								(window as any).triggerHaptic("heavy");
							} else if (velocity > 4) {
								(window as any).triggerHaptic("medium");
							} else if (velocity > 1) {
								(window as any).triggerHaptic("light");
							}
						}
					}
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

	private playSFX(key: string, volume: number = 1) {
		if (localStorage.getItem('golf_settings_fx') === 'true') {
			this.sound.play(key, { volume: volume });
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
		this.flagGraphics.setDepth(10);

		// Flag pole - Metallic Gradient look
		this.flagGraphics.lineStyle(4, 0x333333, 0.4).lineBetween(holeX + 3, holeY, holeX + 3, holeY - 145); // Shadow
		this.flagGraphics.lineStyle(5, 0xDDDDDD, 1).lineBetween(holeX, holeY, holeX, holeY - 140);
		this.flagGraphics.lineStyle(2, 0xFFFFFF, 0.8).lineBetween(holeX - 1, holeY, holeX - 1, holeY - 140); // Highlight

		// Flag Shadow
		this.flagGraphics.fillStyle(0x000000, 0.2).beginPath()
			.moveTo(holeX + 4, holeY - 140)
			.lineTo(holeX + 54, holeY - 110)
			.lineTo(holeX + 4, holeY - 80)
			.closePath().fillPath();

		// Red Flag Cloth
		this.flagGraphics.fillStyle(0xFF0000, 1).beginPath()
			.moveTo(holeX, holeY - 140)
			.lineTo(holeX + 50, holeY - 110)
			.lineTo(holeX, holeY - 80)
			.closePath().fillPath();

		// Flag Highlight
		this.flagGraphics.fillStyle(0xFFFFFF, 0.1).beginPath()
			.moveTo(holeX, holeY - 140)
			.lineTo(holeX + 45, holeY - 110)
			.lineTo(holeX, holeY - 125)
			.closePath().fillPath();
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
			let pullX = (this.ball.position.x - this.cameras.main.scrollX) - pointer.x;
			let pullY = this.ball.position.y - pointer.y;

			// Cap the max drag distance so the line doesn't stretch too far
			const maxDrag = 150;
			const dragDist = Math.sqrt(pullX * pullX + pullY * pullY);
			if (dragDist > maxDrag) {
				pullX = (pullX / dragDist) * maxDrag;
				pullY = (pullY / dragDist) * maxDrag;
			}

			const vx = pullX * 0.2;
			const vy = pullY * 0.2;
			for (let i = 0; i < 10; i++) {
				const t = (i + 1) * 1.2;
				const px = this.ball.position.x + vx * t;
				const py = this.ball.position.y + vy * t + 0.5 * 2 * t * t * 0.05;
				const alpha = 1 - (i / 10) * 0.6;
				this.graphics.fillStyle(0xffffff, alpha);
				this.graphics.beginPath().arc(px, py, 3.5 - i * 0.25, 0, Math.PI * 2).fillPath();
			}
		}
	}

	private onPointerUp(pointer: Phaser.Input.Pointer) {
		if (this.isDragging && this.ball && this.graphics) {
			this.isDragging = false;
			this.graphics.clear();
			// Higher multiplier = less drag distance needed for same power
			let pullX = this.ball.position.x - (pointer.x + this.cameras.main.scrollX);
			let pullY = this.ball.position.y - pointer.y;

			// Cap drag distance to match the visual cap
			const maxDrag = 150;
			const dragDist = Math.sqrt(pullX * pullX + pullY * pullY);
			if (dragDist > maxDrag) {
				pullX = (pullX / dragDist) * maxDrag;
				pullY = (pullY / dragDist) * maxDrag;
			}

			const velX = pullX * 0.2;
			const velY = pullY * 0.2;
			this.matter.body.setVelocity(this.ball, { x: velX, y: velY });
			this.shotsRemaining--;
			this.updateShotVisuals();
			this.playSFX('HitBall', 2.5); // Volume increased by 2.5x
			if (typeof (window as any).triggerHaptic === "function") (window as any).triggerHaptic("light");
		}
	}

	private handleWin() {
		this.data.set('isWon', true);

		// Clear trail on win
		this.trailPositions = [];
		this.trailGraphics?.clear();

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
		const season = this.registry.get('season') as SeasonType || 'spring';
		const time = this.registry.get('time') as TimeType || 'day';
		const theme = ThemeManager.getColors(season, time);
		const nextTerrain = this.terrainGen!.generateTerrain(lastY, this.cameras.main.scrollX + this.scale.width, nextDifficulty, theme);

		this.cameras.main.pan(this.cameras.main.scrollX + this.scale.width + this.scale.width / 2, this.scale.height / 2, 2000, 'Power2');

		this.cameras.main.once('camerapancomplete', () => {
			// Cleanup old
			this.currentTerrain.graphics.destroy();
			this.currentTerrain.bodies.forEach((b: any) => this.matter.world.remove(b));

			this.currentTerrain = nextTerrain;
			// The nextTerrain generated above actually used OLD call without theme? 
			// Correct logic: we should generate NEXT terrain with theme too! Note: line 426 above.

			// Fix: We need to re-generate here or fix the call above. 
			// Since we can't edit non-contiguous line 426 easily in this block, we will re-gen or assume fixed.
			// Actually, `generateTerrain` was called at line 426. I missed adding Theme there in previous chunk?
			// Yes, I missed it. Let's fix line 426 via this tool by editing 419-432 block widely? 

			// Re-targeting the startTransition method to fix the generateTerrain call too.
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

	private accumulator: number = 0;
	private readonly fixedDelta: number = 1000 / 60; // 60 FPS fixed step for stability

	update(_time: number, delta: number) {
		// FIXED SUB-STEPPING: Prevents tunneling and "weird" physics on mobile
		// It splits one big laggy frame into multiple precise small physics steps
		this.accumulator += delta;
		while (this.accumulator >= this.fixedDelta) {
			this.matter.world.step(this.fixedDelta);
			this.accumulator -= this.fixedDelta;
		}

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
				const ballColor = this.registry.get('ballColor') || 0xffffff;
				const ghost = this.add.circle(this.ball.position.x, this.ball.position.y, 15, ballColor);
				ghost.setStrokeStyle(1.5, 0x000000, 0.5); // Light border for ghost
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
				// Already waiting — check if 800ms have passed
				const elapsed = this.time.now - this.stopTimestamp;
				if (elapsed >= 800) {
					// Time's up, check if ball really stopped
					const distMoved = Phaser.Math.Distance.Between(
						this.ball!.position.x, this.ball!.position.y,
						this.lastSettledPos!.x, this.lastSettledPos!.y
					);

					if (distMoved < 2) {
						// #region agent log
						fetch('http://127.0.0.1:7245/ingest/997351de-2588-4a8c-ab40-731c1e4f75c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Level.ts:gameOverDetect',message:'Game over triggered',data:{elapsed,distMoved,ballX:this.ball?.position.x,ballY:this.ball?.position.y},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
						// #endregion
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

		// Update Off-screen Indicator
		this.updateIndicator();
	}

	private updateIndicator() {
		if (!this.ball || !this.indicatorGraphics) return;
		if (this.isMenuOpen) {
			this.indicatorGraphics.clear();
			return;
		}

		this.indicatorGraphics.clear();

		const cam = this.cameras.main;
		const ballX = this.ball.position.x;
		const ballY = this.ball.position.y;

		// Screen bounds in world space
		const left = cam.scrollX;
		const right = cam.scrollX + this.scale.width;
		const top = cam.scrollY;
		const bottom = cam.scrollY + this.scale.height;

		const padding = 50;
		const isOffscreen = ballX < left || ballX > right || ballY < top || ballY > bottom;

		if (isOffscreen && !this.isTransitioning && !this.isGameOver) {
			// Clamped position on screen edges
			const targetX = Phaser.Math.Clamp(ballX, left + padding, right - padding);
			const targetY = Phaser.Math.Clamp(ballY, top + padding, bottom - padding);

			// Draw Arrow pointing to ball
			const angle = Phaser.Math.Angle.Between(targetX, targetY, ballX, ballY);

			// Draw 3D-effect Arrow (White with Black border/shadow)
			const screenX = targetX - cam.scrollX;
			const screenY = targetY - cam.scrollY;
			const size = 20;

			// Calculate rotated points for the arrow
			const p1 = Phaser.Math.Rotate({ x: 12, y: 0 }, angle);
			const p2 = Phaser.Math.Rotate({ x: -size, y: -size }, angle);
			const p3 = Phaser.Math.Rotate({ x: -size, y: size }, angle);

			// 3D Shadow (Extra offset)
			this.indicatorGraphics.fillStyle(0x000000, 0.3);
			this.indicatorGraphics.beginPath();
			this.indicatorGraphics.moveTo(screenX + p1.x + 4, screenY + p1.y + 4);
			this.indicatorGraphics.lineTo(screenX + p2.x + 4, screenY + p2.y + 4);
			this.indicatorGraphics.lineTo(screenX + p3.x + 4, screenY + p3.y + 4);
			this.indicatorGraphics.closePath();
			this.indicatorGraphics.fillPath();

			// Border (Black)
			this.indicatorGraphics.lineStyle(6, 0x000000, 1);
			this.indicatorGraphics.fillStyle(0x000000, 1);
			this.indicatorGraphics.beginPath();
			this.indicatorGraphics.moveTo(screenX + p1.x, screenY + p1.y);
			this.indicatorGraphics.lineTo(screenX + p2.x, screenY + p2.y);
			this.indicatorGraphics.lineTo(screenX + p3.x, screenY + p3.y);
			this.indicatorGraphics.closePath();
			this.indicatorGraphics.strokePath();
			this.indicatorGraphics.fillPath();

			// Main Arrow (White)
			this.indicatorGraphics.lineStyle(2, 0xffffff, 1);
			this.indicatorGraphics.fillStyle(0xffffff, 1);
			this.indicatorGraphics.beginPath();
			this.indicatorGraphics.moveTo(screenX + p1.x, screenY + p1.y);
			this.indicatorGraphics.lineTo(screenX + p2.x, screenY + p2.y);
			this.indicatorGraphics.lineTo(screenX + p3.x, screenY + p3.y);
			this.indicatorGraphics.closePath();
			this.indicatorGraphics.fillPath();
			this.indicatorGraphics.strokePath();
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
		// Clear trail when ball resets
		this.trailPositions = [];
		this.trailGraphics?.clear();
	}

	private updateTrail(velocity: number) {
		if (!this.ball || !this.trailGraphics) return;

		// Only add trail points when ball is moving fast enough
		if (this.ballMoving && velocity > 0.5) {
			// Add current position to the front of the trail
			this.trailPositions.unshift({ x: this.ball.position.x, y: this.ball.position.y });

			// Limit trail length
			if (this.trailPositions.length > this.MAX_TRAIL_LENGTH) {
				this.trailPositions.pop();
			}
		} else {
			// Gradually shrink trail when ball slows down
			if (this.trailPositions.length > 0) {
				this.trailPositions.pop();
			}
		}

		// Clear and redraw the trail
		this.trailGraphics.clear();

		if (this.trailPositions.length < 2) return;

		const ballRadius = 15;

		// Draw tapered ribbon trail
		for (let i = 0; i < this.trailPositions.length - 1; i++) {
			const current = this.trailPositions[i];
			const next = this.trailPositions[i + 1];

			// Calculate progress along the trail (0 = near ball, 1 = end of trail)
			const progress = i / (this.trailPositions.length - 1);

			// Taper the width: thick near ball, thin at end
			const width = ballRadius * (1 - progress * 0.85);

			// Fade alpha along the trail
			const alpha = 0.6 * (1 - progress * 0.9);

			// Calculate perpendicular direction for ribbon width
			const dx = next.x - current.x;
			const dy = next.y - current.y;
			const len = Math.sqrt(dx * dx + dy * dy);
			if (len < 0.1) continue;

			const perpX = -dy / len;
			const perpY = dx / len;

			// Calculate the four corners of this ribbon segment
			const x1 = current.x + perpX * width;
			const y1 = current.y + perpY * width;
			const x2 = current.x - perpX * width;
			const y2 = current.y - perpY * width;

			const nextProgress = (i + 1) / (this.trailPositions.length - 1);
			const nextWidth = ballRadius * (1 - nextProgress * 0.85);

			const x3 = next.x - perpX * nextWidth;
			const y3 = next.y + perpY * nextWidth;
			const x4 = next.x + perpX * nextWidth;
			const y4 = next.y - perpY * nextWidth;

			// Draw the quad segment with gradient-like color (white fading)
			this.trailGraphics.fillStyle(0xffffff, alpha);
			this.trailGraphics.beginPath();
			this.trailGraphics.moveTo(x1, y1);
			this.trailGraphics.lineTo(x2, y2);
			this.trailGraphics.lineTo(x3, y3);
			this.trailGraphics.lineTo(x4, y4);
			this.trailGraphics.closePath();
			this.trailGraphics.fillPath();
		}
	}

	private handleGameOver() {
		if (this.isGameOver) return;
		this.isGameOver = true;

		this.playSFX('GameOver');
		// Close settings panel if it was open, then hide the gear button
		this.settingsModal?.close();
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
			// #region agent log
			fetch('http://127.0.0.1:7245/ingest/997351de-2588-4a8c-ab40-731c1e4f75c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'Level.ts:retryBtn',message:'RETRY button pressed - about to restart scene',data:{score:this.registry.get('score'),isGameOver:this.isGameOver},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
			// #endregion
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
