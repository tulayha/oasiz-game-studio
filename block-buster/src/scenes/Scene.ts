
// You can write more code here
/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
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
	private money: number = 0;
	private level: number = 1;
	private enemiesDefeated: number = 0; // To track leveling
	private enemySpeed: number = 1;
	private enemyHP: number = 2;
	private autoFireDelay: number = 500; // ms
	private autoFireTimer!: Phaser.Time.TimerEvent;

	// Shop & Combat Stats
	private bulletDamage: number = 1;
	private fireRateCost: number = 100;
	private damageCost: number = 100;

	// Spiral Burst Stats
	private maxBalls: number = 1; // User requested start 1
	private ballCost: number = 50; // Cheap
	private spiralAngle: number = -Math.PI / 2; // Start from top
	private duplicateChance: number = 0;
	private duplicateCost: number = 50; // Sync with ballCost initially



	private spawnDistance: number = 60; // Distance between waves in pixels (Tighter)
	private spawnTimer!: Phaser.Time.TimerEvent;

	// Upgrade Levels
	private reloadLevel: number = 1;
	private ballsLevel: number = 1;
	private damageLevel: number = 1;
	private duplicateLevel: number = 1;
	private laserLevel: number = 0; // Starts at 0
	private laserCost: number = 200;
	private laserChance: number = 0;
	private rearShotLevel: number = 0; // Starts at 0 (inactive)
	private rearShotCost: number = 200;
	private reloadMaxed: boolean = false;
	private ballsMaxed: boolean = false;
	private duplicateMaxed: boolean = false;

	// Level Management
	private wavesSpawned: number = 0;
	private maxWavesPerLevel: number = 6;
	private isLevelActive: boolean = true;

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

		const r = 40;
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
		this.scene.launch("UIScene");

		// Initialize values
		this.money = 0;
		this.level = 1;
		this.enemiesDefeated = 0;
		this.wavesSpawned = 0;
		this.isLevelActive = true;

		// TEST MODE: Start at Level 100 with Upgrades
		if (data && data.isTestMode) {
			this.level = 100;
			this.money = 1000000; // Big money for testing
			this.bulletDamage = 80;
			this.autoFireDelay = 50; // Max speed
			this.maxBalls = 20;
			this.reloadLevel = 20;
			this.ballsLevel = 20;
			this.damageLevel = 20;
			this.duplicateLevel = 20;
			this.rearShotLevel = 5;
			this.laserLevel = 6;
			this.laserChance = 20;
			this.damageCost = 6000;
			this.rearShotCost = 200; // Reset for display even if maxed
			this.laserCost = 200;
			this.duplicateChance = 0.5;

			// Difficulty Scaling (Level 100 difficulty)
			// Speed caps at Level 20
			this.enemyHP = 2 + (100 - 1) * 1.0; // Scaled HP
			this.enemySpeed = 1 + (19 * 0.037); // Max speed (level 20 cap)
			this.globalWorldSpeed = 0.5 + (19 * 0.11); // Max speed (level 20 cap)
			this.maxWavesPerLevel = 20; // Max waves

			// Update UI initial states
			this.time.delayedCall(100, () => {
				this.events.emit('update-money', this.money);
				this.events.emit('update-level', this.level);
			});
		}

		// Spawn Timer (Dynamic)
		this.scheduleNextWave();

		// Auto-fire timer (Now Reload Timer)
		this.autoFireTimer = this.time.addEvent({
			delay: this.autoFireDelay,
			callback: this.fireBurst,
			callbackScope: this,
			loop: true
		});

		// Removed Spacebar Listener per request

		// Upgrade Listener

		this.events.on('request-upgrade', (type: string) => {
			let purchased = false;
			if (type === 'reload') {
				if (!this.reloadMaxed && this.money >= this.fireRateCost) {
					this.addMoney(-this.fireRateCost);
					this.reloadLevel++;
					this.autoFireDelay = Math.max(50, this.autoFireDelay * 0.9);

					if (this.fireRateCost === 23650) {
						this.reloadMaxed = true;
					} else {
						this.fireRateCost = Math.round((this.fireRateCost * 1.5) / 50) * 50;
						if (this.fireRateCost > 23650) this.fireRateCost = 23650;
					}

					this.autoFireTimer.reset({
						delay: this.autoFireDelay,
						callback: this.fireBurst,
						callbackScope: this,
						loop: true
					});
					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'damage') {
				if (this.money >= this.damageCost) {
					this.addMoney(-this.damageCost);
					this.damageLevel++;
					this.bulletDamage += 0.3;

					if (this.damageLevel >= 20 || this.damageCost >= 6000) {
						this.damageCost = 6000;
					} else {
						this.damageCost = Math.round((this.damageCost * 1.5) / 50) * 50;
						if (this.damageCost > 6000) this.damageCost = 6000;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'balls') {
				if (!this.ballsMaxed && this.money >= this.ballCost) {
					this.addMoney(-this.ballCost);
					this.ballsLevel++;
					this.maxBalls++;

					if (this.ballCost === 23650) {
						this.ballsMaxed = true;
					} else {
						this.ballCost = Math.round((this.ballCost * 1.5) / 50) * 50;
						if (this.ballCost > 23650) this.ballCost = 23650;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'duplicate') {
				if (!this.duplicateMaxed && this.money >= this.duplicateCost) {
					this.addMoney(-this.duplicateCost);
					this.duplicateLevel++;
					this.duplicateChance += 0.03;

					if (this.duplicateCost === 23650) {
						this.duplicateMaxed = true;
					} else {
						this.duplicateCost = Math.round((this.duplicateCost * 1.5) / 50) * 50;
						if (this.duplicateCost > 23650) this.duplicateCost = 23650;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'rearshot') {
				if (this.rearShotLevel < 5 && this.money >= this.rearShotCost) {
					this.addMoney(-this.rearShotCost);
					this.rearShotLevel++;

					if (this.rearShotLevel < 5) {
						this.rearShotCost = Math.round((this.rearShotCost * 1.5) / 50) * 50;
					}

					this.updateShopUI();
					purchased = true;
				}
			} else if (type === 'laser') {
				if (this.laserLevel < 6 && this.money >= this.laserCost) {
					this.addMoney(-this.laserCost);
					this.laserLevel++;

					// Level 1 = 10%, +2% each level up to 20%
					if (this.laserLevel === 1) {
						this.laserChance = 10;
					} else {
						this.laserChance += 2;
					}

					if (this.laserLevel < 6) {
						this.laserCost = Math.round((this.laserCost * 1.5) / 50) * 50;
					}

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
	}

	updateShopUI() {
		this.events.emit('update-shop-prices', {
			reload: this.fireRateCost,
			damage: this.damageCost,
			balls: this.ballCost,
			duplicate: this.duplicateCost,
			rearshot: this.rearShotCost,
			laser: this.laserCost,
			reloadMax: this.reloadMaxed,
			ballsMax: this.ballsMaxed,
			duplicateMax: this.duplicateMaxed,
			rearshotMax: this.rearShotLevel >= 5,
			laserMax: this.laserLevel >= 6
		});
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

		// Schedule next wave based on current speed to maintain constant distance
		this.scheduleNextWave();

		this.wavesSpawned++;
		if (this.wavesSpawned >= this.maxWavesPerLevel) {
			this.isLevelActive = false; // Stop spawning for this level
			console.log("Wave Limit Reached. Waiting for clear...");
			return;
		}

		// Ekranın yarısının biraz fazlası yarıçap
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;
		const radius = Math.max(this.scale.width, this.scale.height) * 0.8;

		// Bir dairede kaç kutu olsun?
		const count = 35;
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
			let moneyValue = 2 + (this.level - 1); // Base money increases by 1 each level

			// HP Scaling Formulas
			// White: 2 + (Level-1)*0.75
			// Blue: 4 + (Level-1)*1.5
			// Red: 6 + (Level-1)*2.0
			const whiteHP = 2 + (this.level - 1) * 0.75;
			const blueHP = 4 + (this.level - 1) * 1.5;
			const redHP = 6 + (this.level - 1) * 2.0;

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

	scheduleNextWave() {
		// Calculate delay: Distance (pixels) / Speed (pixels/frame) * FrameTime (ms/frame)
		// Assuming 60 FPS typically, update runs every ~16.6ms.
		// Speed is added to position every frame.
		// If Speed is 1, it moves 1 pixel per frame.
		// To cover 200 pixels, it takes 200 frames.
		// 200 frames * 16.6ms = 3320ms.
		// Formula: delay = (spawnDistance / enemySpeed) * (1000 / 60)

		// Apply Global World Speed AND Screen Resolution Multiplier
		const speedMultiplier = this.getSpeedMultiplier();
		const effectiveSpeed = this.enemySpeed * this.globalWorldSpeed * speedMultiplier;

		// Slower speed means we need MORE delay. Faster speed means LESS delay.
		const delay = (this.spawnDistance / effectiveSpeed) * (1000 / 60);

		this.time.addEvent({
			delay: delay,
			callback: this.spawnCircleWave,
			callbackScope: this,
			loop: false
		});
	}

	fireBurst() {
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;

		let forwardFired = 0;
		let rearFired = 0;
		const totalSteps = Math.max(this.maxBalls, this.rearShotLevel);

		this.time.addEvent({
			delay: 25,
			repeat: totalSteps - 1,
			callback: () => {
				const speed = 25;
				let shotPlayed = false;

				// Forward Shot
				if (forwardFired < this.maxBalls) {
					const vx = Math.cos(this.spiralAngle) * speed;
					const vy = Math.sin(this.spiralAngle) * speed;
					const bullet = this.add.circle(centerX, centerY, 10, 0xffffff);
					this.bullets.add(bullet);
					bullet.setData('vx', vx);
					bullet.setData('vy', vy);
					bullet.setData('bounces', 40);

					forwardFired++;
					this.playSound('ballShoot', 0.6, Phaser.Math.Between(-300, 300));
					shotPlayed = true;
				}

				// Rear Shot
				if (rearFired < this.rearShotLevel) {
					const rearAngle = this.spiralAngle - Math.PI;
					const rvx = Math.cos(rearAngle) * speed;
					const rvy = Math.sin(rearAngle) * speed;
					const rearBullet = this.add.circle(centerX, centerY, 10, 0xffffff);
					this.bullets.add(rearBullet);
					rearBullet.setData('vx', rvx);
					rearBullet.setData('vy', rvy);
					rearBullet.setData('bounces', 40);

					rearFired++;
					if (!shotPlayed) {
						this.playSound('ballShoot', 0.6, Phaser.Math.Between(-300, 300));
						shotPlayed = true;
					}
				}

				this.spiralAngle += 0.2;
			},
			callbackScope: this
		});
	}

	update(time: number, delta: number) {
		if (!this.isLevelActive && this.enemies.countActive() === 0) {
			// Level Clear Logic previously here, but moved to trackProgress or just handled here if needed.
			// actually trackProgress handles levelUp calling.
		}

		// Rotate Idle Hexagon
		if (this.idleHexagon) {
			this.idleHexagon.rotation += 0.005;
		}

		// Game Over Check: If we are not running updates or scene paused?
		// Actually we just stop physics or ignore updates if game over.
		// Let's add a flag? Or just destroy looking at logic below.

		// 1. Düşmanları güncelle
		this.enemies.getChildren().forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;

			if (!enemy.active) return;

			// İleri doğru hareket et (rotation yönünde)
			const speed = enemy.getData('speed') || 2;
			enemy.x += Math.cos(enemy.rotation) * speed;
			enemy.y += Math.sin(enemy.rotation) * speed;

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

			// Hareket ettir
			// Her frame güncel hızı al (çünkü sekerken değişebilir)
			const vx = bullet.getData('vx');
			const vy = bullet.getData('vy');
			bullet.x += vx;
			bullet.y += vy;

			// Emit trail particle
			this.trailEmitter.emitParticleAt(bullet.x, bullet.y);

			// Ekran dışına çıkarsa yok et - Sınırları 3 katına çıkar (Zoom ve spawn distance arttığı için)
			const bounds = { x: 0, y: 0, width: this.scale.width, height: this.scale.height };
			if (!Phaser.Geom.Rectangle.ContainsPoint(
				new Phaser.Geom.Rectangle(-50, -50, bounds.width + 100, bounds.height + 100),
				new Phaser.Geom.Point(bullet.x, bullet.y))) {
				bullet.destroy();
				continue;
			}

			// Çarpışma Kontrolü (Basit Mesafe Kontrolü)
			// Kare ve Daire çarpışması için yaklaşık bir mesafe kullanıyoruz (kare yarıçapı ~25 + mermi yarıçapı 10 = ~35)
			for (let j = enemiesArray.length - 1; j >= 0; j--) {
				const enemy = enemiesArray[j] as Phaser.GameObjects.Container;

				if (!enemy.active) continue;

				if (Phaser.Math.Distance.Between(bullet.x, bullet.y, enemy.x, enemy.y) < 35) {
					// --- ÇARPIŞMA OLDU ---

					// 1. DÜŞMAN HASARI
					let hp = enemy.getData('hp');
					hp -= this.bulletDamage;
					enemy.setData('hp', hp);

					if (hp <= 0) {
						// Retrieve money value before destroying
						const reward = enemy.getData('moneyValue') || 10;

						if (enemy.getData('originalColor') === 0xff0000) {
							console.log("Exploding Red Block at", enemy.x, enemy.y);
							this.triggerExplosion(enemy.x, enemy.y);
							this.playSound('redBlockExplosion');
						} else {
							// Normal block pop sound for non-red explosion (or trigger pop implies hit?)
							// User asked: "redBlockExplosion when red block exploded".
							// And "blockPop when block hit".
							// So valid to play pop here too? Logic below handles "hit" but this is "death".
							// Usually death also implies a hit. 
							// Let's add blockPop to the "hit" section generally, or just play it here if not red?
							// Actually "block hit" -> existing "damage" logic?
							// Let's look at "blockPop, kırmızı blok patlatıldığında redBlockExplosion"
							// Maybe blockPop is for REGULAR hit?
						}

						// LASER CHANCE
						if (this.laserChance > 0 && Phaser.Math.Between(0, 100) < this.laserChance) {
							// Fire Laser in direction of bullet movement
							const lvx = bullet.getData('vx');
							const lvy = bullet.getData('vy');
							this.fireLaser(enemy.x, enemy.y, lvx, lvy);
						}

						enemy.destroy();
						this.addMoney(reward);
						this.addScore(100); // 100 points per kill
						this.showFloatingText(enemy.x, enemy.y, "+" + reward);
						this.trackProgress();
						this.triggerHaptic('medium');

						// Impact Effect (Big)
						this.impactEmitter.explode(20, bullet.x, bullet.y);
					} else {
						// Canı kaldıysa renk değiştir (Hasar aldığını belli et - Kırmızılaş)
						// Vuruş Efekti: Parlama ve Titreme
						// Not: Rectangle objelerinde setTint yoktur, setFillStyle kullanılır.
						const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
						this.triggerHaptic('light');
						this.playSound('blockPop');




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
					let bounces = bullet.getData('bounces');
					bounces--;
					bullet.setData('bounces', bounces);

					if (bounces <= 0) {
						bullet.destroy();
						break;
					} else {
						// Calculate Bounce (User Style: Radial)
						let vx = bullet.getData('vx');
						let vy = bullet.getData('vy');
						const dx = bullet.x - enemy.x;
						const dy = bullet.y - enemy.y;

						let speed = Math.sqrt(vx * vx + vy * vy);
						const bounceAngle = Math.atan2(dy, dx);
						const rDev = Phaser.Math.FloatBetween(-0.5, 0.5);

						vx = Math.cos(bounceAngle + rDev) * speed;
						vy = Math.sin(bounceAngle + rDev) * speed;

						// Blue Block / Speed Boost Logic
						const originalColor = enemy.getData('originalColor');

						if (originalColor === 0x4444ff) {
							// Blue Block: Turn Blue & Boost
							vx *= 1.3;
							vy *= 1.3;
							bullet.setFillStyle(0x4444ff);
							this.triggerHaptic('success');
						} else {
							// Normal: Boost 5%
							vx *= 1.05;
							vy *= 1.05;

							// Color interpolation (Green tint)
							const startBounces = 40;
							const colorObj = Phaser.Display.Color.Interpolate.ColorWithColor(
								new Phaser.Display.Color(255, 255, 255),
								new Phaser.Display.Color(0, 255, 0),
								startBounces,
								startBounces - bounces
							);
							const newColor = Phaser.Display.Color.GetColor(colorObj.r, colorObj.g, colorObj.b);
							bullet.setFillStyle(newColor);
						}

						// Save Final Velocity to Data (CRITICAL FIX)
						bullet.setData('vx', vx);
						bullet.setData('vy', vy);

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
		this.events.emit('update-money', this.money);
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

		// Level Progression Logic:
		// If we have stopped spawning (limit reached) AND there are no enemies left alive
		if (!this.isLevelActive && this.enemies.countActive() === 0) {
			this.levelUp();
		}
	}

	levelUp() {
		this.level++;
		this.events.emit('update-level', this.level);
		this.triggerHaptic('success');

		// Increase difficulty
		this.enemyHP += 1;

		// Speed reaches original Level 8 difficulty at Level 20
		// And caps at Level 20
		if (this.level <= 20) {
			this.enemySpeed += 0.037;
			this.globalWorldSpeed += 0.11;
		}

		// Reset Level State
		this.wavesSpawned = 0;
		this.isLevelActive = true;

		// Calculate new max waves for this level (Scale from 6 to 20 over 19 levels)
		this.maxWavesPerLevel = Math.min(20, Math.floor(6 + (this.level - 1) * (14 / 19)));

		// Start spawning again
		this.scheduleNextWave();

		// Visual feedback (optional)
		console.log("Level Up! Level: " + this.level);
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
		// Visual Effect
		this.explosionEmitter.explode(50, x, y);

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

		// Beam Length (very long to cover screen)
		const length = 2000;
		const endX = x + Math.cos(angle) * length;
		const endY = y + Math.sin(angle) * length;

		// Visuals: Laser Beam
		const graphics = this.add.graphics();
		graphics.lineStyle(20, 0xffffff, 1);
		graphics.lineBetween(x, y, endX, endY);
		graphics.setBlendMode(Phaser.BlendModes.ADD);
		graphics.setDepth(50); // Below text but above background

		// Inner Core
		const core = this.add.graphics();
		core.lineStyle(8, 0xffaaaa, 1); // Reddish core
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
		this.playSound('explosion'); // Use explosion sound as requested

		// Collision Logic: Raycast / Line Intersection check against all enemies
		const laserLine = new Phaser.Geom.Line(x, y, endX, endY);
		const enemies = this.enemies.getChildren();

		// Create a separate array to avoid modification issues during iteration
		const enemieshit: Phaser.GameObjects.Container[] = [];

		enemies.forEach((child: any) => {
			const enemy = child as Phaser.GameObjects.Container;
			if (!enemy.active) return;

			// Simple circle check for enemies (radius ~25)
			const enemyCircle = new Phaser.Geom.Circle(enemy.x, enemy.y, 30);

			// Check if line intersects circle
			if (Phaser.Geom.Intersects.LineToCircle(laserLine, enemyCircle)) {
				enemieshit.push(enemy);
			}
		});

		// Apply Damage
		enemieshit.forEach(enemy => {
			if (!enemy.active) return;

			let hp = enemy.getData('hp');
			// Damage = Ball Damage
			hp -= this.bulletDamage;
			enemy.setData('hp', hp);

			// Visual Feedback for hit
			this.impactEmitter.explode(10, enemy.x, enemy.y);

			if (hp <= 0) {
				const reward = enemy.getData('moneyValue') || 10;
				enemy.destroy();
				this.addMoney(reward);
				this.addScore(100);
				this.showFloatingText(enemy.x, enemy.y, "+" + reward);
				this.trackProgress();
			} else {
				// Flash/Update Color logic (simplified copy from hit logic)
				const top = enemy.getByName('top') as Phaser.GameObjects.Rectangle;
				if (top) {
					top.setFillStyle(0xffffff); // White flash
					this.time.delayedCall(50, () => {
						if (enemy.active && top.active) {
							// Revert to approximate color logic would be complex here, 
							// so let's just trigger a re-render or leave it for next frame update/hit.
							// For now just white flash is enough feedback.
							// Actually, let's call applyDynamicColor for this single enemy if we could, 
							// but simpler is to just let the update loop handle it or just leave it flashed briefly?
							// No, we should restore color.
							// Let's re-use the color calculation logic briefly? 
							// Or simpler: force an update if possible.
							// Let's just leave it white for 50ms then restore to 'originalColor' or 'dynamic'.

							// Re-calculate color
							let baseColorVal;
							if (enemy.getData('isDynamicColor')) {
								baseColorVal = this.currentDynamicColor;
								if (baseColorVal === 0x000000) baseColorVal = 0xffffff;
							} else {
								baseColorVal = enemy.getData('originalColor') || 0xffffff;
							}
							const colorObj = Phaser.Display.Color.ValueToColor(baseColorVal);
							const maxHP = enemy.getData('maxHP') || 1;
							const ratio = (enemy.getData('hp')) / maxHP;
							const brightness = 0.5 + (0.5 * ratio);
							const r = Math.floor(colorObj.red * brightness);
							const g = Math.floor(colorObj.green * brightness);
							const b = Math.floor(colorObj.blue * brightness);
							top.setFillStyle(Phaser.Display.Color.GetColor(r, g, b));
						}
					});
				}
			}
		});
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
