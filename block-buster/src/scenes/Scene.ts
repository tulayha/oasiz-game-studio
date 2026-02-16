
// You can write more code here
/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import {
	getAllAnimDefs,
	DAMAGE_IMPACT,
	DAMAGE_KILL,
	BALL_SPAWN,
	DUPLICATE_SPLIT,
	DASH_TRAIL,
	LASER_IMPACT,
	LASER_ACTIVATION,
	ELECTRIC_CHAIN,
	ELECTRIC_STRIKE,
	ELECTRIC_ENDPOINT,
	BOMB_EXPLOSION,
	BOMB_SHOCKWAVE,
	BOMB_SMOKE,
	BOMB_PREFLASH,
	BURST_FLASH,
} from "../SpriteAnimConfig";
/* END-USER-IMPORTS */

export default class Scene extends Phaser.Scene {

	constructor() {
		super("Scene");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	/* START-USER-CODE */

	// Merkezdeki hedef obje
	private centerTarget!: Phaser.GameObjects.Zone;
	// Düşmanları tutacak grup
	private enemies!: Phaser.GameObjects.Group;
	// Mermileri tutacak grup
	private bullets!: Phaser.GameObjects.Group;

	// Game Progression
	private money: number = 100;
	private level: number = 1;
	private enemiesDefeated: number = 0; // To track leveling
	private enemySpeed: number = 1;
	private enemyHP: number = 3.8;

	// Shop & Combat Stats
	private bulletDamage: number = 1;
	private damageCost: number = 100;

	// Spiral Burst Stats
	private ballCost: number = 50;
	private spiralAngle: number = -Math.PI / 2; // Start from top
	private duplicateCost: number = 50;

	private spawnDistance: number = 55; // Spacing between rings of blocks
	private spawnTimer!: Phaser.Time.TimerEvent;

	// Upgrade Levels
	private damageLevel: number = 1;
	private duplicateLevel: number = 0;
	private laserLevel: number = 0;
	private laserCost: number = 200;
	private laserChance: number = 0;
	private electricLevel: number = 0;
	private electricCost: number = 200;
	private electricChance: number = 0;
	private bombLevel: number = 0;
	private bombCost: number = 200;
	private bombChance: number = 0;

	private duplicateMaxed: boolean = false;
	private purchaseStartTime: number = 0;
	private currentCatchUpMultiplier: number = 1;

	// Level Management
	private wavesSpawned: number = 0;
	private isLevelActive: boolean = true;
	private lastSpawnedDistance: number = 0; // Track distance of last wave for spacing

	// Visuals
	private idleHexagon!: Phaser.GameObjects.Graphics;
	private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
	private impactEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
	private explosionEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

	private bgMusic!: Phaser.Sound.BaseSound;
	private audioSettings: { music: boolean, fx: boolean } = { music: true, fx: true };
	private lastBlockPopPlayTime: number = 0;

	// Dynamic Color System
	private currentDynamicColor: number = 0x242424; // Initial background color
	private colorTransitionTimer!: Phaser.Time.TimerEvent;

	create(data: { isTestMode?: boolean }) {

		this.editorCreate();

		this.cameras.main.setZoom(0.8);

		// Initial background color setup - Start with Black
		this.currentDynamicColor = 0x000000;
		this.cameras.main.setBackgroundColor(this.currentDynamicColor);

		// Start 20-second color transition loop
		this.colorTransitionTimer = this.time.addEvent({
			delay: 20000,
			callback: this.startColorTransition,
			callbackScope: this,
			loop: true
		});

		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;
		this.centerTarget = this.add.zone(centerX, centerY, 10, 10);

		// Create Idle Hexagon (Visual Only)
		this.idleHexagon = this.add.graphics({ x: centerX, y: centerY });

		const r = 30;
		const hexPoints: { x: number, y: number }[] = [];
		for (let i = 0; i < 6; i++) {
			const angle = Phaser.Math.DegToRad(60 * i);
			hexPoints.push({
				x: r * Math.cos(angle),
				y: r * Math.sin(angle)
			});
		}

		this.idleHexagon.lineStyle(2, 0x00ff00);
		this.idleHexagon.fillStyle(0x00ff00, 0.2);
		this.idleHexagon.beginPath();
		this.idleHexagon.moveTo(hexPoints[0].x, hexPoints[0].y);
		for (let i = 1; i < hexPoints.length; i++) {
			this.idleHexagon.lineTo(hexPoints[i].x, hexPoints[i].y);
		}
		this.idleHexagon.closePath();
		this.idleHexagon.fillPath();
		this.idleHexagon.strokePath();

		// Add colored glow
		this.idleHexagon.postFX.addGlow(0x00ff00, 2.5, 0, false, 0.1, 16);

		this.enemies = this.add.group();
		this.bullets = this.add.group();

		// Particle Systems
		const particleManager = this.add.particles(0, 0, 'flare'); // You might need to load a texture, or use a default if available, or create one.
		// Since we might not have a texture, let's create a simple texture for particles
		if (!this.textures.exists('particle')) {
			const graphics = this.make.graphics({ x: 0, y: 0 });
			graphics.fillStyle(0xffffff, 1);
			graphics.fillCircle(4, 4, 4);
			graphics.generateTexture('particle', 8, 8);
		}

		// Ghost Trail Texture (Bigger circle matching bullet size)
		if (!this.textures.exists('bulletTrail')) {
			const graphics = this.make.graphics({ x: 0, y: 0 });
			graphics.fillStyle(0xffffff, 1);
			graphics.fillCircle(10, 10, 10); // Match bullet radius
			graphics.generateTexture('bulletTrail', 20, 20);
		}

		this.trailEmitter = this.add.particles(0, 0, 'bulletTrail', {
			speed: 0,
			scale: { start: 1, end: 0.2 },
			alpha: { start: 0.25, end: 0 },
			lifespan: 150,
			blendMode: 'NORMAL',
			frequency: -1 // Manual emission
		});

		this.impactEmitter = this.add.particles(0, 0, 'particle', {
			speed: { min: 50, max: 150 },
			scale: { start: 1, end: 0 },
			alpha: { start: 1, end: 0 },
			lifespan: 300,
			blendMode: 'ADD',
			emitting: false
		});

		this.explosionEmitter = this.add.particles(0, 0, 'particle', {
			speed: { min: 100, max: 300 },
			scale: { start: 2, end: 0 },
			alpha: { start: 1, end: 0 },
			lifespan: 600,
			blendMode: 'ADD',
			quantity: 30,
			emitting: false,
			tint: 0xff4444 // Reddish tint
		});

		// Start UI Scene
		this.purchaseStartTime = this.time.now;
		this.scene.launch("UIScene");
		this.time.delayedCall(100, () => {
			this.events.emit('game-start');
		});

		// Initialize values
		this.money = 100;
		this.level = 1;
		this.enemiesDefeated = 0;
		this.wavesSpawned = 0;
		this.isLevelActive = true;

		// TEST MODE: Start at Level 100 with Upgrades
		if (data && data.isTestMode) {
			this.level = 100;
			this.money = 1000000; // Big money for testing
			this.bulletDamage = 80;
			// Removed old stats
			this.damageLevel = 20;
			this.duplicateLevel = 20;
			this.laserLevel = 6;
			this.laserChance = 20;
			this.damageCost = 6000;
			this.laserCost = 200;

			// Difficulty Scaling (Level 100 difficulty)
			// Speed caps at Level 20
			this.enemyHP = 2 + (100 - 1) * 1.0; // Scaled HP
			this.enemySpeed = 1 + (19 * 0.037); // Max speed (level 20 cap)
			this.globalWorldSpeed = 2 + (19 * 0.11); // Max speed (level 20 cap)

			// Update UI initial states
			this.time.delayedCall(100, () => {
				this.events.emit('update-money', this.money);
				this.events.emit('update-level', this.level);
			});
		} else {
			// Normal Mode: ALSO emit initial states after delay to ensure UI is ready
			this.time.delayedCall(100, () => {
				this.events.emit('update-money', this.money);
				this.events.emit('update-level', this.level);
			});
		}

		// Spawn Timer (Dynamic)
		this.spawnCircleWave();


		// Upgrade Listener

		this.events.on('request-upgrade', (type: string) => {
			// Enforce 5-second initial lock
			if (this.time.now - this.purchaseStartTime < 5000) {
				this.events.emit('update-shop-prices', { totalLocked: true });
				return;
			}

			// Enforce Lock: Cannot buy anything else until first ball is bought
			if (type !== 'balls' && this.ballCost <= 50) {
				this.events.emit('update-shop-prices', { totalLocked: true });
				return;
			}

			let purchased = false;
			if (type === 'damage') {
				if (this.money >= this.damageCost) {
					this.addMoney(-this.damageCost);
					this.damageLevel++;
					this.bulletDamage += 0.11; // Stretched: 0.3 * (15/40)

					if (this.damageLevel >= 60 || this.damageCost >= 6000) {
						this.damageCost = 6000;
					} else {
						this.damageCost = Math.round((this.damageCost * 1.5) / 50) * 50;
						if (this.damageCost > 6000) this.damageCost = 6000;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'balls') {
				if (this.money >= this.ballCost) {
					this.addMoney(-this.ballCost);
					this.spawnBall();
					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'duplicate') {
				if (!this.duplicateMaxed && this.money >= this.duplicateCost) {
					this.addMoney(-this.duplicateCost);
					this.duplicateLevel++;

					// Each upgrade adds +1 ball.
					// Cost logic:
					if (this.duplicateCost === 23650) {
						this.duplicateMaxed = true;
					} else {
						this.duplicateCost = Math.round((this.duplicateCost * 1.5) / 50) * 50;
						if (this.duplicateCost > 23650) this.duplicateCost = 23650;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'laser') {
				if (this.laserLevel < 6 && this.money >= this.laserCost) {
					this.addMoney(-this.laserCost);
					this.laserLevel++;

					// Level 1 = 5%, +1.25% each level up to 10%
					if (this.laserLevel === 1) {
						this.laserChance = 5;
					} else {
						this.laserChance += 1.25;
					}

					if (this.laserLevel < 6) {
						this.laserCost = Math.round((this.laserCost * 1.5) / 50) * 50;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'electric') {
				if (this.electricLevel < 5 && this.money >= this.electricCost) {
					this.addMoney(-this.electricCost);
					this.electricLevel++;

					// Level 1 = 10%, +2.5% each level up to 20%? 
					// User said "5 kez updatesi olsun" and "ilk satın alındığında %10"
					// I will do 10, 12, 14, 16, 18, 20 or similar.
					if (this.electricLevel === 1) {
						this.electricChance = 5;
					} else {
						this.electricChance += 1.25;
					}

					if (this.electricLevel < 5) {
						this.electricCost = Math.round((this.electricCost * 1.5) / 50) * 50;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'bomb') {
				if (this.bombLevel < 5 && this.money >= this.bombCost) {
					this.addMoney(-this.bombCost);
					this.bombLevel++;

					// Level 1 = 5%, +1.25% each level up to 10%
					if (this.bombLevel === 1) {
						this.bombChance = 5;
					} else {
						this.bombChance += 1.25;
					}

					if (this.bombLevel < 5) {
						this.bombCost = Math.round((this.bombCost * 1.5) / 50) * 50;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'burst') {
				// Burst Cost = Ball Cost * 2
				const cost = this.ballCost * 2;
				if (this.money >= cost) {
					this.addMoney(-cost);
					this.spawnBurst();
					this.updateShopUI();
					purchased = true;
				}
			}

			if (purchased) {
				this.playSound('purchase');
			}
		});

		// Listen for UI requesting update
		this.events.on('request-shop-update', this.updateShopUI, this);

		// Initial UI Update
		this.updateShopUI();

		// Handle Window Resize
		this.scale.on('resize', this.resize, this);

		// Initialize Audio
		this.initAudio();

		// Create sprite animations for skill effects
		this.createSkillAnimations();
	}

	// ── Sprite Animation System ─────────────────────────────────────────

	createSkillAnimations() {
		const defs = getAllAnimDefs();
		console.log("[Scene] Creating", defs.length, "sprite animations");

		for (const def of defs) {
			// Skip if animation already exists (e.g. shared keys)
			if (this.anims.exists(def.key)) continue;

			const frames: Phaser.Types.Animations.AnimationFrame[] = [];
			for (let i = 0; i < def.frames; i++) {
				frames.push({ key: def.key + "_" + i });
			}

			this.anims.create({
				key: def.key,
				frames: frames,
				frameRate: def.fps,
				repeat: 0,
			});
		}
	}

	/**
	 * Play a one-shot sprite animation at a position, then auto-destroy.
	 */
	playEffect(animKey: string, x: number, y: number, scale: number = 2, depth: number = 60): Phaser.GameObjects.Sprite {
		// Use first frame texture as the initial texture
		const sprite = this.add.sprite(x, y, animKey + "_0");
		sprite.setScale(scale);
		sprite.setDepth(depth);
		sprite.setBlendMode(Phaser.BlendModes.ADD);

		sprite.play(animKey);
		sprite.once("animationcomplete", () => {
			sprite.destroy();
		});

		return sprite;
	}

	/**
	 * Get the damage tier (0-3) based on current damage level.
	 * Tier 0: Level 1-15, Tier 1: Level 16-30, Tier 2: Level 31-45, Tier 3: Level 46-60
	 */
	getDamageTier(): number {
		if (this.damageLevel >= 46) return 3;
		if (this.damageLevel >= 31) return 2;
		if (this.damageLevel >= 16) return 1;
		return 0;
	}

	/**
	 * Get the duplicate tier (0-3) based on current duplicate level.
	 * Tier 0: Level 1-5, Tier 1: Level 6-10, Tier 2: Level 11-15, Tier 3: Level 16-20
	 */
	getDuplicateTier(): number {
		if (this.duplicateLevel >= 16) return 3;
		if (this.duplicateLevel >= 11) return 2;
		if (this.duplicateLevel >= 6) return 1;
		return 0;
	}

	/**
	 * Get the laser tier (0-2) based on current laser level.
	 * Tier 0: Level 1-2, Tier 1: Level 3-4, Tier 2: Level 5-6
	 */
	getLaserTier(): number {
		if (this.laserLevel >= 5) return 2;
		if (this.laserLevel >= 3) return 1;
		return 0;
	}

	/**
	 * Get the electric tier (0-2) based on current electric level.
	 * Tier 0: Level 1-2, Tier 1: Level 3-4, Tier 2: Level 5
	 */
	getElectricTier(): number {
		if (this.electricLevel >= 5) return 2;
		if (this.electricLevel >= 3) return 1;
		return 0;
	}

	/**
	 * Get the bomb tier (0-2) based on current bomb level.
	 * Tier 0: Level 1-2, Tier 1: Level 3-4, Tier 2: Level 5
	 */
	getBombTier(): number {
		if (this.bombLevel >= 5) return 2;
		if (this.bombLevel >= 3) return 1;
		return 0;
	}

	/**
	 * Get the bullet tint color based on damage tier.
	 */
	getBulletTint(): number {
		const tier = this.getDamageTier();
		switch (tier) {
			case 3: return 0xff4444; // Red
			case 2: return 0xff8800; // Orange
			case 1: return 0x44ff44; // Green
			default: return 0xffffff; // White (default)
		}
	}

	resize(gameSize: Phaser.Structs.Size, baseSize: Phaser.Structs.Size, displaySize: Phaser.Structs.Size, resolution: number) {
		const width = gameSize.width;
		const height = gameSize.height;

		const centerX = width / 2;
		const centerY = height / 2;

		if (this.centerTarget) {
			this.centerTarget.setPosition(centerX, centerY);
		}

		if (this.idleHexagon) {
			this.idleHexagon.setPosition(centerX, centerY);
		}


		// Note: enemies and bullets are dynamic so they don't strictly need repositioning relative to center immediately,
		// but spawn logic uses current center so new ones will be correct.

		// FIX: Update existing enemies to face the NEW center
		// Otherwise they keep moving towards the OLD center, causing drift/overlap.
		if (this.enemies) {
			this.enemies.getChildren().forEach((child: any) => {
				const enemy = child as Phaser.GameObjects.Container;
				if (enemy.active) {
					const targetAngle = Phaser.Math.Angle.Between(enemy.x, enemy.y, centerX, centerY);
					enemy.rotation = targetAngle;
				}
			});
		}
	}

	updateShopUI() {
		const timeLocked = (this.time.now - this.purchaseStartTime) < 5000;
		// New logic: Only BALLS allowed until first ball bought (Ball Cost > 50).
		const ballLocked = this.ballCost <= 50;
		const burstCost = this.ballCost * 2;

		this.events.emit('update-shop-prices', {
			damage: Math.round(this.damageCost),
			balls: Math.round(this.ballCost),
			duplicate: Math.round(this.duplicateCost),
			laser: Math.round(this.laserCost),
			electric: Math.round(this.electricCost),
			bomb: Math.round(this.bombCost),
			burst: Math.round(burstCost),
			duplicateMax: this.duplicateMaxed,
			laserMax: this.laserLevel >= 6,
			electricMax: this.electricLevel >= 5,
			bombMax: this.bombLevel >= 5,
			locked: ballLocked,
			timeLocked: timeLocked
		});

		// If still in the 5s period, schedule an update precisely when it ends
		if (timeLocked) {
			const remaining = 5000 - (this.time.now - this.purchaseStartTime);
			this.time.delayedCall(remaining + 10, () => this.updateShopUI());
		}
	}

	// World Speed Control
	private globalWorldSpeed: number = 0.2;

	// Helper to calculate speed multiplier based on screen size
	// Mobile reference: ~850px height.
	// If screen is larger (e.g. Desktop 1920x1080), multiplier > 1.
	getSpeedMultiplier(): number {
		const maxDim = Math.max(this.scale.width, this.scale.height);
		// 850px is a rough baseline for a "tall" mobile screen or "standard" view distance
		// We clamp at 1.0 minimum so mobile/smaller screens don't get SLOWER.
		return Math.max(1, maxDim / 850);
	}

	spawnCircleWave() {
		if (!this.isLevelActive) return;

		this.wavesSpawned++;


		// Ekranın yarısının biraz fazlası yarıçap
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;
		const radius = Math.max(this.scale.width, this.scale.height) * 0.84;

		// Bir dairede kaç kutu olsun?
		const count = 50;
		// Her kutu arasındaki açı farkı
		const angleStep = (Math.PI * 2) / count;

		// Offset logic: Shift every other wave by half a step to fill gaps
		const angleOffset = (this.wavesSpawned % 2 === 0) ? (angleStep / 2) : 0;

		// O anki dalga için rastgele bir renk seçelim (Fallback if we needed one, but individual logic overrides)
		// const waveColor = Phaser.Display.Color.RandomRGB().color;

		// Calculate Speed Multiplier ONCE per wave
		const speedMultiplier = this.getSpeedMultiplier();

		for (let i = 0; i < count; i++) {
			// Açıyı hesapla
			const angle = i * angleStep + angleOffset;

			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);

			// Calculate Probabilities
			// Red: Starts low, increases by 0.5% per level, Max 10%
			const redChance = Math.min(5, 2 + (this.level * 0.5));

			// Blue: Fixed 15%
			const blueChance = 15;

			const rand = Phaser.Math.Between(0, 100);

			let color = 0xffffff;
			let hp = 2; // Default (White)
			let type = 'white';
			let moneyValue = 2 + (this.level - 1) * 0.4; // Money income stretched (1 * 0.4)

			// HP Scaling Formulas (Stretched to 40 levels)
			// Base HP same, increments scaled by 0.375 (15/40)
			const whiteHP = 3.8 + (this.level - 1) * 1.5;
			const blueHP = 7.6 + (this.level - 1) * 3;
			const redHP = 11.4 + (this.level - 1) * 4.5;

			if (rand < redChance) {
				color = 0xff0000;
				hp = redHP;
				type = 'red';
				moneyValue = moneyValue * 3; // 3x
			} else if (rand < redChance + blueChance) {
				color = 0x4444ff; // Brighter Blue
				hp = blueHP;
				type = 'blue';
				moneyValue = moneyValue * 2; // 2x
			} else {
				// White
				hp = whiteHP;
			}

			// 3D Blok Efekti için Container
			const enemy = this.add.container(x, y);

			// Alt kısım (Gölge/Derinlik)
			const darkColor = Phaser.Display.Color.ValueToColor(color).darken(30).color;
			const side = this.add.rectangle(6, 6, 50, 50, darkColor);
			side.setStrokeStyle(2, 0x000000);
			side.setName('side');

			// Üst kısım (Ana Renk)
			const top = this.add.rectangle(0, 0, 50, 50, color);
			top.setStrokeStyle(2, 0x000000);
			top.setName('top');

			enemy.add([side, top]);

			if (type === 'white') {
				enemy.setData('isDynamicColor', true);
				// Set initial color based on current system color
				const maxHP = hp;
				const currentHP = hp;
				const ratio = currentHP / maxHP;
				const brightness = 0.5 + (0.5 * ratio);

				// If background is black, make blocks white
				let baseColor = this.currentDynamicColor;
				if (baseColor === 0x000000) baseColor = 0xffffff;

				const colorObj = Phaser.Display.Color.ValueToColor(baseColor);
				const r = Math.floor(colorObj.red * brightness);
				const g = Math.floor(colorObj.green * brightness);
				const b = Math.floor(colorObj.blue * brightness);
				top.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));

				const darkBase = Phaser.Display.Color.ValueToColor(baseColor).darken(30).color;
				side.setFillStyle(darkBase);
			} else {
				enemy.setData('originalColor', color);
			}

			enemy.setData('maxHP', hp);
			enemy.setData('hp', hp);

			// Apply Global World Speed multiplied by Screen Size Multiplier
			const effectiveSpeed = this.enemySpeed * this.globalWorldSpeed * speedMultiplier;
			enemy.setData('speed', effectiveSpeed);

			enemy.setData('moneyValue', moneyValue);

			this.enemies.add(enemy);

			// Hedefe doğru döndür
			const targetAngle = Phaser.Math.Angle.Between(x, y, centerX, centerY);
			enemy.rotation = targetAngle;
		}
	}

	// Remove scheduleNextWave entirely as we will use update loop check
	getGlobalEnemySpeed(): number {
		return this.enemySpeed * this.globalWorldSpeed * this.getSpeedMultiplier() * this.currentCatchUpMultiplier;
	}

	spawnBurst() {
		this.updateShopUI(); // Safe to call

		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;

		// Play light burst flash at center when burst activates
		this.playEffect(BURST_FLASH.key, centerX, centerY, BURST_FLASH.scale, 55);

		// 8 Balls, 10 Bounces, fired with delay
		this.time.addEvent({
			delay: 100, // 100ms delay between shots for "scanning" effect
			repeat: 7,   // Total 8 shots
			callback: () => {
				this.spawnSingleBall(10, 0x00ffff, true);
				this.playSound('ballShoot', 0.5, Phaser.Math.Between(-300, 300));

				// Play dash trail on each fired ball
				this.playEffect(DASH_TRAIL.key, centerX, centerY, DASH_TRAIL.scale, 54);
			},
			callbackScope: this
		});
	}

	spawnSingleBall(bounces: number, color: number, isBurst: boolean = false) {
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;
		const speed = 25;

		const vx = Math.cos(this.spiralAngle) * speed;
		const vy = Math.sin(this.spiralAngle) * speed;

		// Tint burst balls with tier color for visual feedback
		const bulletColor = isBurst ? 0x00ffff : this.getBulletTint();
		const bullet = this.add.circle(centerX, centerY, 10, bulletColor);
		this.bullets.add(bullet);
		bullet.setData('vx', vx);
		bullet.setData('vy', vy);
		bullet.setData('bounces', bounces);
		bullet.setData('isDuplicate', isBurst); // Treat as "duplicate" type (finite bounces)

		// Also apply duplicate level to bursts?
		// "duplicate satın alındığında her updatinde + 1 topla birlikte"
		// The extra balls from duplicate apply to *every* shot usually.
		// If burst is a shot, maybe it should trigger duplication?
		// "8 tane ... top göndersin". 
		// If duplicate Level is 5, does a burst of 8 become 8 * (1+5) = 48 balls?!
		// That might crash the game.
		// Let's assume Burst is simply 8 standard balls for now.
		// Or maybe duplicate adds to main shot only.
		// I'll stick to 8 simple balls for now to avoid chaos.
	}

	spawnBall() {
		// Graduated Price Increase system
		let increment = 50;
		if (this.level >= 15) increment = 2000;
		else if (this.level >= 10) increment = 1000;
		else if (this.level >= 5) increment = 300;

		this.ballCost += increment;
		this.updateShopUI();

		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;
		const speed = 25;

		// Play spawn animation at center
		this.playEffect(BALL_SPAWN.key, centerX, centerY, BALL_SPAWN.scale, 55);

		// Helper to fire
		const fire = (angleOffset: number, isExtra: boolean) => {
			let finalAngle = this.spiralAngle + angleOffset;

			// SMART TARGETING: Occasionaly target the nearest enemy if it's far but incoming
			// Only for the main shot (isExtra === false) AND after 30 seconds
			if (!isExtra && this.enemies.getLength() > 0 && (this.time.now - this.purchaseStartTime > 30000)) {
				const rand = Phaser.Math.Between(0, 100);
				if (rand < 30) { // 30% chance to "lock on" to a random but close-ish enemy
					const nearest = this.getNearestEnemy(centerX, centerY);
					if (nearest) {
						finalAngle = Phaser.Math.Angle.Between(centerX, centerY, nearest.x, nearest.y);
					}
				}
			}

			const vx = Math.cos(finalAngle) * speed;
			const vy = Math.sin(finalAngle) * speed;

			const c = isExtra ? 0xff00ff : this.getBulletTint();
			const b = isExtra ? 15 : 9999; // Infinite for main

			const bullet = this.add.circle(centerX, centerY, 10, c);
			this.bullets.add(bullet);
			bullet.setData('vx', vx);
			bullet.setData('vy', vy);
			bullet.setData('bounces', b);
			bullet.setData('isDuplicate', isExtra);
		};

		// Main Shot
		fire(0, false);

		// Duplicate Shots
		if (this.duplicateLevel > 0) {
			for (let i = 0; i < this.duplicateLevel; i++) {
				const offset = Phaser.Math.FloatBetween(-0.2, 0.2);
				fire(offset, true);
			}

			// Play tiered split effect at center
			const splitTier = this.getDuplicateTier();
			const splitDef = DUPLICATE_SPLIT[splitTier];
			if (splitDef) {
				this.playEffect(splitDef.key, centerX, centerY, splitDef.scale, 55);
			}
		}

		this.playSound('ballShoot', 0.6, Phaser.Math.Between(-300, 300));
	}

	update() {
		// SPAWN LOGIC IN UPDATE (Distance Based)
		if (this.isLevelActive) {
			// Find the "last spawned wave" (furthest from center, or rather, the one with highest ID? 
			// No, simply track the 'distance travelled' of a virtual cursor or check the last added group?
			// Easier: Check if the *Last Added Enemy* has moved 'spawnDistance' pixels towards center.
			// Problem: Enemies move towards center. Distance decreases.

			// Better: Just check if we can spawn.
			// When we spawn a wave, we can store a reference or just a timestamp? Timestamp is time based.
			// We want DISTANCE based.

			// Let's rely on the fact that enemies move at 'speed'.
			// But effective speed changes.

			// Alternative: Keep track of "how much space has cleared".
			// Every frame: spaceCleared += speed.
			// If spaceCleared >= spawnDistance: Spawn() and spaceCleared = 0.

			// This is perfect. It adapts to speed changes instantly.
			const speed = this.getGlobalEnemySpeed();
			this.lastSpawnedDistance += speed;

			if (this.lastSpawnedDistance >= this.spawnDistance) {
				this.spawnCircleWave();
				this.lastSpawnedDistance = 0; // Or subtract spawnDistance to keep remainder
			}
		}

		// Continuous Rotation (Auto)
		this.spiralAngle += 0.08;

		// Rotate Idle Hexagon
		if (this.idleHexagon) {
			this.idleHexagon.rotation += 0.005;
		}


		// Game Over Check: If we are not running updates or scene paused?
		// Actually we just stop physics or ignore updates if game over.
		// Let's add a flag? Or just destroy looking at logic below.

		// CATCH-UP MECHANIC: If nearest enemy is far, increase speed
		// "4 blok mesafe" ~ 200-250px. Let's use 250px.
		if (this.enemies.getLength() > 0) {
			const cx = this.scale.width / 2;
			const cy = this.scale.height / 2;
			const nearest = this.getNearestEnemy(cx, cy);
			if (nearest) {
				const dist = Phaser.Math.Distance.Between(cx, cy, nearest.x, nearest.y);
				// If distance > 250, speed up (1.5x)
				if (dist > 250) {
					this.currentCatchUpMultiplier = 1.6;
				} else {
					this.currentCatchUpMultiplier = 1.0;
				}
			}
		} else {
			// No enemies? Speed up to spawn faster? No, spawn logic is separate.
			// Just reset speed.
			this.currentCatchUpMultiplier = 1.0;
		}

		// 1. Düşmanları güncelle
		this.enemies.getChildren().forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;

			if (!enemy.active) return;

			// İleri doğru			// Hareket ettir: Update position based on GLOBAL speed
			const angle = enemy.rotation;
			// Speed is now uniform for all.
			const speed = this.getGlobalEnemySpeed();

			// Move towards center (rotation points to center)
			enemy.x += Math.cos(angle) * speed;
			enemy.y += Math.sin(angle) * speed;

			// Merkeze çok yaklaşınca OYUN BITIR
			if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.centerTarget.x, this.centerTarget.y) < 15) {
				// GAME OVER LOGIC
				enemy.destroy();
				this.triggerGameOver();
			}
		});

		// 2. Mermileri güncelle ve Çarpışma Kontrolü
		const bulletsArray = this.bullets.getChildren();
		const enemiesArray = this.enemies.getChildren();

		// Tersten döngü kurmak, döngü sırasında eleman silerken güvenlidir
		for (let i = bulletsArray.length - 1; i >= 0; i--) {
			const bullet = bulletsArray[i] as Phaser.GameObjects.Arc;

			if (!bullet.active) continue;

			// Her frame güncel hızı al (çünkü sekerken değişebilir)
			const vx = bullet.getData('vx');
			const vy = bullet.getData('vy');

			// 2.A HOMING LOGIC (Slight pull towards nearest enemy)
			// Only for the main ball (isDuplicate === false) AND after 30 seconds
			if (!bullet.getData('isDuplicate') && this.enemies.getLength() > 0 && (this.time.now - this.purchaseStartTime > 30000)) {
				const nearest = this.getNearestEnemy(bullet.x, bullet.y);
				if (nearest) {
					const targetAngle = Phaser.Math.Angle.Between(bullet.x, bullet.y, nearest.x, nearest.y);
					const currentAngle = Math.atan2(vy, vx);

					// Dynamic Homing Intensity:
					// If bullet is moving AWAY from center, increase homing to bring it back to action
					const distToCenter = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.scale.width / 2, this.scale.height / 2);
					const movingOut = (vx * (bullet.x - this.scale.width / 2) + vy * (bullet.y - this.scale.height / 2)) > 0;

					// Base homing strength scales with distance to center
					let lerpFactor = 0.02;
					if (distToCenter > 250) lerpFactor = 0.04; // Far from character = more pull
					if (movingOut && distToCenter > 400) lerpFactor = 0.08; // Very far and escaping = strong pull

					const newAngle = Phaser.Math.Angle.RotateTo(currentAngle, targetAngle, lerpFactor);
					const speedValue = Math.sqrt(vx * vx + vy * vy);

					bullet.setData('vx', Math.cos(newAngle) * speedValue);
					bullet.setData('vy', Math.sin(newAngle) * speedValue);
				}
			}

			// Hareket ettir
			const updatedVx = bullet.getData('vx');
			const updatedVy = bullet.getData('vy');
			bullet.x += updatedVx;
			bullet.y += updatedVy;

			// Emit trail particle
			this.trailEmitter.emitParticleAt(bullet.x, bullet.y);

			// Ekran dışına çıkarsa yok et - Çok geniş sınırlar (Görünmez olduktan sonra bile devam etsin)
			const bounds = { x: 0, y: 0, width: this.scale.width, height: this.scale.height };
			if (!Phaser.Geom.Rectangle.ContainsPoint(
				new Phaser.Geom.Rectangle(-1000, -1000, bounds.width + 2000, bounds.height + 2000),
				new Phaser.Geom.Point(bullet.x, bullet.y))) {
				bullet.destroy();
				continue;
			}

			// Çarpışma Kontrolü (Basit Mesafe Kontrolü)
			// Kare ve Daire çarpışması için yaklaşık bir mesafe kullanıyoruz (kare yarıçapı ~25 + mermi yarıçapı 10 = ~35)
			for (let j = enemiesArray.length - 1; j >= 0; j--) {
				const enemy = enemiesArray[j] as Phaser.GameObjects.Container;

				if (!enemy.active) continue;

				// Collision radius increased to 50 (from 35) to make it easier to hit enemies (50x50 box + 10 radius + margin)
				if (Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < 90) {
					// --- ÇARPIŞMA OLDU ---

					// 1. DÜŞMAN HASARI
					let hp = enemy.getData('hp');
					const damageDealt = this.bulletDamage;
					hp -= damageDealt;
					enemy.setData('hp', hp);

					// Floating Damage Text
					this.showDamageText(enemy.x, enemy.y, damageDealt);

					if (hp <= 0) {
						// Retrieve money value before destroying
						const reward = enemy.getData('moneyValue') || 10;

						if (enemy.getData('originalColor') === 0xff0000) {
							console.log("Exploding Red Block at", enemy.x, enemy.y);
							this.triggerExplosion(enemy.x, enemy.y);
							this.playSound('redBlockExplosion');
						}

						// LASER CHANCE
						if (this.laserChance > 0 && Phaser.Math.Between(0, 100) < this.laserChance) {
							// Fire Laser in direction of bullet movement
							const lvx = bullet.getData('vx');
							const lvy = bullet.getData('vy');
							this.fireLaser(enemy.x, enemy.y, lvx, lvy);
						}

						// ELECTRIC CHANCE
						if (this.electricChance > 0 && Phaser.Math.Between(0, 100) < this.electricChance) {
							this.triggerElectricEffect(enemy.x, enemy.y);
						}

						// BOMB CHANCE
						if (this.bombChance > 0 && Phaser.Math.Between(0, 100) < this.bombChance) {
							this.triggerBombExplosion(enemy.x, enemy.y);
						}

						enemy.destroy();
						this.addMoney(reward);
						this.addScore(100); // 100 points per kill
						this.showFloatingText(enemy.x, enemy.y, "+" + Math.floor(reward));
						this.trackProgress();
						this.triggerHaptic('medium');

						// Tiered Kill Effect Sprite (replaces old particle explosion)
						const killTier = this.getDamageTier();
						const killDef = DAMAGE_KILL[killTier];
						if (killDef) {
							this.playEffect(killDef.key, enemy.x, enemy.y, killDef.scale);
						}

						// Keep some particles for extra juice
						this.impactEmitter.explode(10, bullet.x, bullet.y);
					} else {
						// Canı kaldıysa renk değiştir (Hasar aldığını belli et - Kırmızılaş)
						const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
						this.triggerHaptic('light');
						this.playSound('blockPop');

						// Tiered Impact Effect Sprite
						const impactTier = this.getDamageTier();
						const impactDef = DAMAGE_IMPACT[impactTier];
						if (impactDef) {
							this.playEffect(impactDef.key, bullet.x, bullet.y, impactDef.scale * 0.8);
						}




						// Darkening Logic immediately after hit (if not dead)
						if (top) {
							const maxHP = enemy.getData('maxHP') || 1;
							const currentHP = hp; // Already updated above

							// Base Color for calculation
							let baseColorVal;
							if (enemy.getData('isDynamicColor')) {
								baseColorVal = this.currentDynamicColor;
								// If background is black, use white for damaged block calculation
								if (baseColorVal === 0x000000) baseColorVal = 0xffffff;
							} else {
								baseColorVal = enemy.getData('originalColor') || 0xffffff;
							}
							const colorObj = Phaser.Display.Color.ValueToColor(baseColorVal);

							// Brightness ratio: 0.5 (darkest) to 1.0 (full)
							// Map ratio 0..1 to 0.5..1.0 so blocks stay visible on black bg
							const ratio = currentHP / maxHP;
							const brightness = 0.5 + (0.5 * ratio);

							// Apply brightness
							const r = Math.floor(colorObj.red * brightness);
							const g = Math.floor(colorObj.green * brightness);
							const b = Math.floor(colorObj.blue * brightness);

							const newColor = Phaser.Display.Color.GetColor(r, g, b);
							top.setFillStyle(newColor);
							top.setStrokeStyle(2, 0x000000); // Re-apply border as fillStyle might clear it? Actually it doesn't but good to be safe/consistent if we used clear()

							// Flash Effect (Red tint over the darkened color)
							// Since we changed fillStyle, we can just tween a property or use a separate overlay. 
							// Simplest: Set to Red, then back to NEW darkened color after 50ms.

							top.setFillStyle(0xff0000);
							this.time.delayedCall(50, () => {
								if (enemy.active && top.active) {
									top.setFillStyle(newColor);
								}
							});
						}

						this.impactEmitter.explode(5, bullet.x, bullet.y);
					}

					// 2. MERMİ SEKME MANTIĞI
					// Infinite Bounce checks
					if (true) {
						// Calculate Bounce (User Style: Radial)
						let vx = bullet.getData('vx');
						let vy = bullet.getData('vy');
						const dx = bullet.x - enemy.x;
						const dy = bullet.y - enemy.y;

						let speed = Math.sqrt(vx * vx + vy * vy);

						// Apply Boost to Scalar Speed First
						const originalColor = enemy.getData('originalColor');
						if (originalColor === 0x4444ff) {
							// Blue Block: Boost 1.15x
							speed *= 1.15;
							bullet.setFillStyle(0x4444ff);
							this.triggerHaptic('success');
						} else {
							// Normal: Boost 1.05x
							speed *= 1.05;
							// Simple Green Tint on bounce
							bullet.setFillStyle(0x00ff00);
						}

						// Clamp Speed (Max 2.2x of Base Speed 25 = 55)
						if (speed > 55) speed = 55;

						let bounceAngle = Math.atan2(dy, dx);

						// CENTER-STEERING BOUNCE: 15% base chance, increased to 25% if "Far" (> 275px from center)
						// Only AFTER 30 seconds to keep early game natural
						const distToCenter = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.scale.width / 2, this.scale.height / 2);
						const isFar = distToCenter > 275;
						const chance = isFar ? 25 : 15;

						if (speed > 30 && Phaser.Math.Between(0, 100) < chance && (this.time.now - this.purchaseStartTime > 30000)) {
							const cx = this.scale.width / 2;
							const cy = this.scale.height / 2;

							// Target "karaktere yakın olan bloklardan biri"
							const nearEnemy = this.getEnemyNearCenter();
							const targetX = nearEnemy ? nearEnemy.x : cx;
							const targetY = nearEnemy ? nearEnemy.y : cy;

							// Angle towards center area with slight noise
							bounceAngle = Phaser.Math.Angle.Between(bullet.x, bullet.y, targetX, targetY) + Phaser.Math.FloatBetween(-0.2, 0.2);
						} else {
							// Normal radial bounce with offset
							bounceAngle += Phaser.Math.FloatBetween(-0.5, 0.5);
						}

						vx = Math.cos(bounceAngle) * speed;
						vy = Math.sin(bounceAngle) * speed;

						// Save Final Velocity to Data
						bullet.setData('vx', vx);
						bullet.setData('vy', vy);

						// DUPLICATE BALL LOGIC: Bounces check
						if (bullet.getData('isDuplicate')) {
							let b = bullet.getData('bounces');
							b--;
							bullet.setData('bounces', b);
							if (b <= 0) {
								console.log("Duplicate Ball Explode!");
								this.triggerExplosion(bullet.x, bullet.y);
								bullet.destroy();
								break; // Stop checking this bullet
							}
						}

						// Break enemy loop (one hit per frame per bullet)
						break;
					}
				}
			}
		}

	}

	private score: number = 0;

	addMoney(amount: number) {
		this.money += amount;
		this.events.emit('update-money', Math.floor(this.money));
	}

	addScore(amount: number) {
		this.score += amount;
	}

	showFloatingText(x: number, y: number, message: string) {
		const text = this.add.text(x, y, message, {
			fontFamily: '"Press Start 2P"',
			fontSize: '16px',
			color: '#ffffff',
			stroke: '#000000',
			strokeThickness: 3,
		});
		text.setOrigin(0.5);
		text.setDepth(100);

		this.tweens.add({
			targets: text,
			y: y - 50,
			alpha: 0,
			duration: 800,
			onComplete: () => {
				text.destroy();
			}
		});
	}

	trackProgress() {
		this.enemiesDefeated++;

		// Kill-Based Leveling Logic
		// 12 waves * 50 enemies = 600 enemies per level
		const enemiesPerLevel = 600;

		if (this.enemiesDefeated % enemiesPerLevel === 0) {
			console.log("Kill Target Reached! Advancing Level...");
			this.levelUp();
		}
	}

	levelUp() {
		this.level++;
		this.events.emit('update-level', this.level);
		this.triggerHaptic('success');

		// Increase difficulty (Stretched to 40 levels)
		this.enemyHP += 1.0; // (0.5 * 2)

		// Speed acceleration stretched AND halved
		// And caps at Level 40
		if (this.level <= 40) {
			this.enemySpeed += 0.007; // (0.0185 * 0.375 / 2)
			this.globalWorldSpeed += 0.02; // (0.055 * 0.375 / 2)
		}

		// Reset Level State
		this.wavesSpawned = 0;
		this.isLevelActive = true;
		this.lastSpawnedDistance = 0;
		this.spawnCircleWave(); // Start immediatelydback (optional)

		// Visual feedback (optional)
		console.log("Level Up! Level: " + this.level);
	}

	showDamageText(x: number, y: number, damage: number) {
		const val = Math.round(damage * 78);
		const text = this.add.text(x, y, val.toString(), {
			fontFamily: '"Press Start 2P"',
			fontSize: '20px',
			color: '#ff0000', // Red
			stroke: '#000000', // Black Border
			strokeThickness: 4,
		});
		text.setOrigin(0.5);
		text.setDepth(110);

		this.tweens.add({
			targets: text,
			y: y - 80,
			x: x + Phaser.Math.Between(-30, 30),
			alpha: 0,
			duration: 600,
			ease: 'Power2',
			onComplete: () => {
				text.destroy();
			}
		});
	}

	triggerGameOver() {
		console.log("GAME OVER");
		this.triggerHaptic('error');

		// Pause Game Loop
		this.scene.pause();

		// Submit Score
		if (typeof (window as any).submitScore === "function") {
			(window as any).submitScore(this.score);
		}

		// Show Game Over UI
		this.events.emit('game-over', this.score);
	}

	triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
		// Check Settings
		const settings = JSON.parse(localStorage.getItem('joy_settings') || '{"music":true,"fx":true,"haptics":true}');
		if (!settings.haptics) return;

		if (typeof (window as any).triggerHaptic === "function") {
			(window as any).triggerHaptic(type);
		}
	}

	triggerExplosion(x: number, y: number) {
		// Visual Effect - particles + sprite
		this.explosionEmitter.explode(30, x, y);

		// Play an explosion sprite (use damage tier kill effect for consistency)
		const killTier = this.getDamageTier();
		const killDef = DAMAGE_KILL[killTier];
		if (killDef) {
			this.playEffect(killDef.key, x, y, killDef.scale * 1.5, 59);
		}

		// Haptics
		this.triggerHaptic('heavy');

		// Camera Shake
		this.cameras.main.shake(200, 0.01);

		// AoE Damage
		const explosionRadius = 150;
		const enemies = this.enemies.getChildren();

		enemies.forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			// Check distance
			const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);

			if (dist <= explosionRadius) {
				// Kill nearby enemies instantly or deal massive damage
				// Let's create a chain reaction effect effectively

				// Show hit effect
				this.impactEmitter.explode(10, enemy.x, enemy.y);

				// Destroy logic reuse? 
				// For now, simpler destroy. 
				// Warning: destroying here might affect the outer loop if not careful?
				// Phaser groups handle removal gracefully usually, but let's be safe.
				// We won't trigger NEW explosions from these chained deaths to avoid infinite loops/crashes in 1 frame.
				// Or maybe we do want chain reactions? That would be fun but risky.
				// Let's just destroy them for now without triggering 'originalColor' check again.

				enemy.destroy();
				this.addScore(50);
				this.addMoney(5); // Less money for chain kills?
			}
		});
	}

	initAudio() {
		// Load Settings
		const savedSettings = JSON.parse(localStorage.getItem('joy_settings') || '{"music":true,"fx":true}');
		this.audioSettings = savedSettings;

		// Initialize BG Music
		if (!this.sound.get('bgMusic')) {
			this.bgMusic = this.sound.add('bgMusic', { loop: true, volume: 0.5 });
		} else {
			this.bgMusic = this.sound.get('bgMusic');
		}

		if (this.audioSettings.music) {
			if (!this.bgMusic.isPlaying) {
				this.bgMusic.play();
			}
		}

		// Listen for settings updates
		this.events.on('update-settings', (settings: { music: boolean, fx: boolean }) => {
			this.audioSettings = settings;

			if (this.audioSettings.music) {
				if (!this.bgMusic.isPlaying) {
					this.bgMusic.play();
				}
			} else {
				if (this.bgMusic.isPlaying) {
					this.bgMusic.stop();
				}
			}
		});
	}

	playSound(key: string, volume: number = 1.0, detune: number = 0) {
		if (!this.audioSettings.fx) return;

		// Throttle blockPop sound to avoid ear-blasting levels of overlapping sound
		if (key === 'blockPop') {
			const now = this.time.now;
			if (now - this.lastBlockPopPlayTime < 100) {
				return;
			}
			this.lastBlockPopPlayTime = now;
		}

		try {
			this.sound.play(key, { volume: volume, detune: detune });
		} catch (e) {
			console.warn(`Failed to play sound: ${key}`, e);
		}
	}

	updateBackgroundColor() {
		// Generate a very dark random color
		// Max value 30 out of 255 for each channel ensures it stays very dark
		const r = Phaser.Math.Between(5, 30);
		const g = Phaser.Math.Between(5, 30);
		const b = Phaser.Math.Between(5, 30);

		const color = Phaser.Display.Color.GetColor(r, g, b);

		// Set the background color
		this.cameras.main.setBackgroundColor(color);
	}

	startColorTransition() {
		// Darker/Premium tones, avoiding neon primary Red, Blue, Green. Black removed from loop.
		const colors = [
			0x706000, // Dark Gold
			0x006070, // Dark Teal
			0x600070, // Deep Purple
			0x703000, // Dark Bronze
			0x400030, // Deep Plum
			0x205070  // Deep Slate Blue
		];
		let nextColor = Phaser.Utils.Array.GetRandom(colors);

		if (this.currentDynamicColor && colors.includes(this.currentDynamicColor)) {
			nextColor = colors[(colors.indexOf(this.currentDynamicColor) + 1) % colors.length];
		}
		const oldColorObj = Phaser.Display.Color.ValueToColor(this.currentDynamicColor);
		const newColorObj = Phaser.Display.Color.ValueToColor(nextColor);
		this.tweens.addCounter({
			from: 0,
			to: 100,
			duration: 3000,
			onUpdate: (tween) => {
				const value = tween.getValue();
				const interColor = Phaser.Display.Color.Interpolate.ColorWithColor(oldColorObj, newColorObj, 100, value);
				this.currentDynamicColor = Phaser.Display.Color.GetColor(interColor.r, interColor.g, interColor.b);
				this.applyDynamicColor(this.currentDynamicColor);
			}
		});
	}

	applyDynamicColor(color: number) {
		this.cameras.main.setBackgroundColor(color);
		this.enemies.getChildren().forEach(child => {
			const enemy = child as Phaser.GameObjects.Container;
			if (enemy.getData('isDynamicColor')) {
				const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
				const side = enemy.getByName('side') as Phaser.GameObjects.Rectangle;
				if (top) {
					const maxHP = enemy.getData('maxHP') || 1;
					const currentHP = enemy.getData('hp');
					const ratio = currentHP / maxHP;
					const brightness = 0.5 + (0.5 * ratio);

					// If background is black, use white for blocks
					let baseColor = color;
					if (baseColor === 0x000000) baseColor = 0xffffff;

					const colorObj = Phaser.Display.Color.ValueToColor(baseColor);
					const r = Math.floor(colorObj.red * brightness);
					const g = Math.floor(colorObj.green * brightness);
					const b = Math.floor(colorObj.blue * brightness);
					const darkened = Phaser.Display.Color.GetColor(r, g, b);

					top.setFillStyle(darkened);
				}

				if (side) {
					let sideBase = color;
					if (sideBase === 0x000000) sideBase = 0xffffff;
					const darkBaseColor = Phaser.Display.Color.ValueToColor(sideBase).darken(30).color;
					side.setFillStyle(darkBaseColor);
				}
			}
		});
	}

	fireLaser(x: number, y: number, vx: number, vy: number) {
		// Calculate direction angle
		const angle = Math.atan2(vy, vx);
		const tier = this.getLaserTier();

		// Tier-based beam colors
		const beamColors = [
			{ outer: 0x4488ff, core: 0x88bbff }, // Tier 0: Blue
			{ outer: 0xff8800, core: 0xffcc66 }, // Tier 1: Orange
			{ outer: 0xff2222, core: 0xff8888 }, // Tier 2: Red
		];
		const colors = beamColors[tier] || beamColors[0];

		// Tier-based beam thickness
		const thicknessMult = 1 + tier * 0.3;

		// Beam Length (very long to cover screen)
		const length = 2000;
		const endX = x + Math.cos(angle) * length;
		const endY = y + Math.sin(angle) * length;

		// Activation flash at source
		this.playEffect(LASER_ACTIVATION.key, x, y, LASER_ACTIVATION.scale, 55);

		// Visuals: Laser Beam
		const graphics = this.add.graphics();
		graphics.lineStyle(Math.round(50 * thicknessMult), colors.outer, 1);
		graphics.lineBetween(x, y, endX, endY);
		graphics.setBlendMode(Phaser.BlendModes.ADD);
		graphics.setDepth(50);

		// Inner Core
		const core = this.add.graphics();
		core.lineStyle(Math.round(20 * thicknessMult), colors.core, 1);
		core.lineBetween(x, y, endX, endY);
		core.setBlendMode(Phaser.BlendModes.ADD);
		core.setDepth(51);

		// Fade Out
		this.tweens.add({
			targets: [graphics, core],
			alpha: 0,
			duration: 300,
			onComplete: () => {
				graphics.destroy();
				core.destroy();
			}
		});

		// Audio
		this.playSound('laser');

		// Collision Logic
		const laserLine = new Phaser.Geom.Line(x, y, endX, endY);
		const enemies = this.enemies.getChildren();
		const enemieshit: Phaser.GameObjects.Container[] = [];

		enemies.forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const enemyCircle = new Phaser.Geom.Circle(enemy.x, enemy.y, 30);
			if (Phaser.Geom.Intersects.LineToCircle(laserLine, enemyCircle)) {
				enemieshit.push(enemy);
			}
		});

		// Apply Instant Destroy with tiered impact sprites
		const impactDef = LASER_IMPACT[tier];

		enemieshit.forEach(enemy => {
			if (!enemy.active) return;

			const reward = enemy.getData('moneyValue') || 10;

			if (enemy.getData('originalColor') === 0xff0000) {
				this.triggerExplosion(enemy.x, enemy.y);
				this.playSound('redBlockExplosion');
			}

			// Tiered impact sprite at each enemy hit location
			if (impactDef) {
				this.playEffect(impactDef.key, enemy.x, enemy.y, impactDef.scale);
			}

			// Keep some particles
			this.impactEmitter.explode(8, enemy.x, enemy.y);

			enemy.destroy();
			this.addMoney(reward);
			this.addScore(100);
			this.showFloatingText(enemy.x, enemy.y, "+" + Math.floor(reward));
			this.trackProgress();
		});
	}

	getNearestEnemy(x: number, y: number): Phaser.GameObjects.Container | null {
		let nearest: Phaser.GameObjects.Container | null = null;
		let minDist = Infinity;

		this.enemies.getChildren().forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
			if (d < minDist) {
				minDist = d;
				nearest = enemy;
			}
		});

		return nearest;
	}

	getEnemyNearCenter(): Phaser.GameObjects.Container | null {
		const cx = this.scale.width / 2;
		const cy = this.scale.height / 2;

		let nearest: Phaser.GameObjects.Container | null = null;
		let minDist = Infinity;

		this.enemies.getChildren().forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const d = Phaser.Math.Distance.Between(cx, cy, enemy.x, enemy.y);
			if (d < minDist) {
				minDist = d;
				nearest = enemy;
			}
		});

		return nearest;
	}

	triggerElectricEffect(sourceX: number, sourceY: number) {
		const tier = this.getElectricTier();
		const nearbyEnemies: any[] = [];
		const maxTargets = 15;
		const radius = 200;

		this.enemies.getChildren().forEach((child: any) => {
			const target = child as Phaser.GameObjects.Container;
			if (!target.active) return;

			const dist = Phaser.Math.Distance.Between(sourceX, sourceY, target.x, target.y);
			if (dist > 0 && dist < radius) {
				nearbyEnemies.push({ target, dist });
			}
		});

		nearbyEnemies.sort((a, b) => a.dist - b.dist);
		const targets = nearbyEnemies.slice(0, maxTargets);

		const damage = this.bulletDamage / 2;

		// Play lightning strike sprite at origin
		const strikeDef = ELECTRIC_STRIKE[tier];
		if (strikeDef) {
			this.playEffect(strikeDef.key, sourceX, sourceY, strikeDef.scale, 58);
		}

		// Play chain effect sprite at origin
		const chainDef = ELECTRIC_CHAIN[tier];
		if (chainDef) {
			this.playEffect(chainDef.key, sourceX, sourceY, chainDef.scale, 56);
		}

		targets.forEach(t => {
			const enemy = t.target;

			// Keep drawn lightning for the actual chain visual
			this.drawLightning(sourceX, sourceY, enemy.x, enemy.y, tier);

			// Play endpoint burst sprite at each target
			const endpointDef = ELECTRIC_ENDPOINT[tier];
			if (endpointDef) {
				this.playEffect(endpointDef.key, enemy.x, enemy.y, endpointDef.scale * 0.8, 57);
			}

			// Deal Damage
			let hp = enemy.getData('hp');
			hp -= damage;
			enemy.setData('hp', hp);

			this.showDamageText(enemy.x, enemy.y, damage);

			if (hp <= 0) {
				const reward = enemy.getData('moneyValue') || 10;
				if (enemy.getData('originalColor') === 0xff0000) {
					this.triggerExplosion(enemy.x, enemy.y);
					this.playSound('redBlockExplosion');
				}
				enemy.destroy();
				this.addMoney(reward);
				this.addScore(100);
				this.showFloatingText(enemy.x, enemy.y, "+" + Math.floor(reward));
				this.trackProgress();
			} else {
				// Flash effect - tier-based color
				const flashColors = [0x00ffff, 0xaa44ff, 0xffff00];
				const flashColor = flashColors[tier] || 0x00ffff;

				const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
				if (top) {
					const originalFill = top.fillColor;
					top.setFillStyle(flashColor);
					this.time.delayedCall(100, () => {
						if (enemy.active && top.active) {
							top.setFillStyle(originalFill);
						}
					});
				}
			}
		});

		if (targets.length > 0) {
			this.playSound('electric');
		}
	}

	drawLightning(x1: number, y1: number, x2: number, y2: number, tier: number = 0) {
		// Tier-based lightning colors
		const lightningColors = [
			{ glow: 0x00ffff, flash: 0x00ffff }, // Tier 0: Cyan/Blue
			{ glow: 0xaa44ff, flash: 0xcc66ff }, // Tier 1: Purple/Violet
			{ glow: 0xffff00, flash: 0xffff88 }, // Tier 2: Yellow
		];
		const colorSet = lightningColors[tier] || lightningColors[0];

		// Draw multiple lightning bolts for more impact
		for (let bolt = 0; bolt < 3; bolt++) {
			const graphics = this.add.graphics();
			const delay = bolt * 50;

			// Outer glow (thicker, more transparent)
			if (bolt === 0) {
				graphics.lineStyle(12, colorSet.glow, 0.3);
				const segments = 5;
				const stepX = (x2 - x1) / segments;
				const stepY = (y2 - y1) / segments;

				graphics.beginPath();
				graphics.moveTo(x1, y1);

				for (let i = 1; i < segments; i++) {
					const jump = 20;
					const offX = Phaser.Math.Between(-jump, jump);
					const offY = Phaser.Math.Between(-jump, jump);
					graphics.lineTo(x1 + stepX * i + offX, y1 + stepY * i + offY);
				}

				graphics.lineTo(x2, y2);
				graphics.strokePath();
			}

			// Main bright bolt
			graphics.lineStyle(6, 0xffffff, 1);
			const segments = 6;
			const stepX = (x2 - x1) / segments;
			const stepY = (y2 - y1) / segments;

			graphics.beginPath();
			graphics.moveTo(x1, y1);

			for (let i = 1; i < segments; i++) {
				const jump = 25;
				const offX = Phaser.Math.Between(-jump, jump);
				const offY = Phaser.Math.Between(-jump, jump);
				graphics.lineTo(x1 + stepX * i + offX, y1 + stepY * i + offY);
			}

			graphics.lineTo(x2, y2);
			graphics.strokePath();

			// Secondary colored glow
			graphics.lineStyle(3, colorSet.glow, 0.8);
			graphics.beginPath();
			graphics.moveTo(x1, y1);

			for (let i = 1; i < segments; i++) {
				const jump = 20;
				const offX = Phaser.Math.Between(-jump, jump);
				const offY = Phaser.Math.Between(-jump, jump);
				graphics.lineTo(x1 + stepX * i + offX, y1 + stepY * i + offY);
			}

			graphics.lineTo(x2, y2);
			graphics.strokePath();

			// Animate with flash effect
			this.time.delayedCall(delay, () => {
				this.tweens.add({
					targets: graphics,
					alpha: 0,
					duration: 300,
					ease: 'Power2',
					onComplete: () => graphics.destroy()
				});
			});
		}

		// Add impact particles
		this.impactEmitter.explode(8, x1, y1);
		this.impactEmitter.explode(6, x2, y2);

		// Flash circles at both ends with tier color
		const flashStart = this.add.circle(x1, y1, 20, colorSet.flash, 0.6);
		const flashEnd = this.add.circle(x2, y2, 15, colorSet.flash, 0.6);

		this.tweens.add({
			targets: [flashStart, flashEnd],
			alpha: 0,
			scale: 2,
			duration: 300,
			onComplete: () => {
				flashStart.destroy();
				flashEnd.destroy();
			}
		});
	}

	triggerBombExplosion(x: number, y: number) {
		const tier = this.getBombTier();

		// Pre-flash effect
		this.playEffect(BOMB_PREFLASH.key, x, y, BOMB_PREFLASH.scale, 58);

		// Tiered explosion sprite (main visual)
		const explosionDef = BOMB_EXPLOSION[tier];
		if (explosionDef) {
			this.playEffect(explosionDef.key, x, y, explosionDef.scale, 60);
		}

		// Shockwave ring (expanding AoE indicator)
		const shockDef = BOMB_SHOCKWAVE[tier];
		if (shockDef) {
			const shockSprite = this.playEffect(shockDef.key, x, y, shockDef.scale * 0.5, 55);
			// Scale up the shockwave over time for expanding ring effect
			this.tweens.add({
				targets: shockSprite,
				scaleX: shockDef.scale * 1.5,
				scaleY: shockDef.scale * 1.5,
				alpha: 0.3,
				duration: 400,
			});
		}

		// Delayed smoke aftermath
		const smokeDef = BOMB_SMOKE[tier];
		if (smokeDef) {
			this.time.delayedCall(150, () => {
				this.playEffect(smokeDef.key, x, y, smokeDef.scale, 54);
			});
		}

		// Keep some particles for extra impact
		this.explosionEmitter.explode(40, x, y);

		// Play explosion sound
		this.playSound('redBlockExplosion');

		// Haptics
		this.triggerHaptic('heavy');

		// Camera Shake (stronger at higher tiers)
		const shakeIntensity = 0.015 + tier * 0.005;
		this.cameras.main.shake(300, shakeIntensity);

		// AoE Damage - radius increases with tier
		const explosionRadius = 150 + tier * 25;
		const enemies = this.enemies.getChildren();

		enemies.forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);

			if (dist <= explosionRadius) {
				this.impactEmitter.explode(10, enemy.x, enemy.y);
				enemy.destroy();
				this.addScore(50);
				this.addMoney(5);
			}
		});
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
