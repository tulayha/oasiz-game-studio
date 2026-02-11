
// You can write more code here

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
/* END-USER-IMPORTS */

export default class Level extends Phaser.Scene {

	constructor() {
		super("Level");

		/* START-USER-CTR-CODE */
		// Write your code here.
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	// Write your code here

	private player!: Phaser.GameObjects.Sprite;
	private wasd!: {
		W: Phaser.Input.Keyboard.Key;
		A: Phaser.Input.Keyboard.Key;
		S: Phaser.Input.Keyboard.Key;
		D: Phaser.Input.Keyboard.Key;
	};
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
	private mapTiles: (Phaser.GameObjects.Image)[] = [];
	private collectedKeys: Set<number> = new Set();
	private torchPositions: { x: number, y: number }[] = [];
	private spaceKey!: Phaser.Input.Keyboard.Key;
	private keyOne!: Phaser.Input.Keyboard.Key;
	private keyTwo!: Phaser.Input.Keyboard.Key;
	private keyThree!: Phaser.Input.Keyboard.Key;
	private keyFour!: Phaser.Input.Keyboard.Key;
	private activeCharacter: "knight" | "mage" | "archer" | "rogue" = "knight";
	private readonly playableCharacters: Array<"knight" | "mage" | "archer" | "rogue"> = ["knight", "mage", "archer", "rogue"];
	private characterSelectActive: boolean = false;
	private characterSelectOverlay?: Phaser.GameObjects.Container;
	private characterSelectCandidates: Array<"knight" | "mage" | "archer" | "rogue"> = [];
	private characterSelectHitAreas: Array<{
		candidate: "knight" | "mage" | "archer" | "rogue";
		x: number;
		y: number;
		w: number;
		h: number;
	}> = [];
	private readonly knightMaxHp: number = 10;
	private readonly mageMaxHp: number = 6;
	private readonly archerMaxHp: number = 5;
	private readonly rogueMaxHp: number = 6;
	private mageCasting: boolean = false;
	private mageCastSprite?: Phaser.GameObjects.Sprite;
	private mageFireballs!: Phaser.Physics.Arcade.Group;
	// Character-based feature flags (Mage = character 2)
	// feature1: Lightning Chain
	// feature2: Supernova
	// feature3: Freeze Zone
	// feature4: Poison Zone
	// feature5: Laser Beam
	private mageAutoAttackCount: number = 0;
	private mageFeatureLevels: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	private mageFeature1LightningChainEnabled: boolean = false;
	private mageFeature2SupernovaEnabled: boolean = false;
	private mageFeature3FreezeZoneEnabled: boolean = false;
	private mageFeature4PoisonZoneEnabled: boolean = false;
	private mageFeature5LaserBeamEnabled: boolean = false;
	private readonly mageFeature1EveryAutoAttacks: number = 3;
	private readonly mageFeature2EveryAutoAttacks: number = 4;
	private readonly mageFeature3EveryAutoAttacks: number = 3;
	private readonly mageFeature4EveryAutoAttacks: number = 4;
	private readonly mageFeature5EveryAutoAttacks: number = 5;
	private readonly mageFeature3ZoneDurationMs: number = 2000;
	private readonly mageFeature3ZoneRadius: number = 72;
	private readonly mageFeature3SlowMultiplier: number = 0.45;
	private readonly mageFeature4ZoneDurationMs: number = 2000;
	private readonly mageFeature4ZoneRadius: number = 74;
	private readonly mageFeature4DotTickMs: number = 450;
	private readonly mageFeature4DotDamage: number = 0.5;
	private mageFreezeZones!: Phaser.GameObjects.Group;
	private magePoisonZones!: Phaser.GameObjects.Group;
	private mageLaserVisuals!: Phaser.GameObjects.Group;
	private archerCasting: boolean = false;
	private archerCastSprite?: Phaser.GameObjects.Sprite;
	private archerArrows!: Phaser.Physics.Arcade.Group;
	private readonly archerArrowSpeed: number = 920;
	private readonly archerArrowLifeMs: number = 1800;
	private readonly archerArrowCollideDelayMs: number = 40;
	private readonly archerArrowSeekRangeTiles: number = 8;
	private readonly archerArrowTrailIntervalMs: number = 34;
	// Character-based feature flags (Archer = character 3)
	// feature1: Piercing Arrow
	// feature2: Explosive Shot
	// feature3: Arch Arrow
	// feature4: Binding Shot
	// feature5: Helpful Companions
	private archerAutoAttackCount: number = 0;
	private archerFeatureLevels: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	private archerFeature1PiercingArrowEnabled: boolean = false;
	private archerFeature2ExplosiveShotEnabled: boolean = false;
	private archerFeature3ArchArrowEnabled: boolean = false;
	private archerFeature4BindingShotEnabled: boolean = false;
	private archerFeature5HelpfulCompanionsEnabled: boolean = false;
	private readonly archerFeature1EveryAutoAttacks: number = 3;
	private readonly archerFeature2EveryAutoAttacks: number = 2;
	private readonly archerFeature4EveryAutoAttacks: number = 3;
	private readonly archerFeature4RootMs: number = 1500;
	private readonly archerFeature5SpawnIntervalMs: number = 10000;
	private readonly archerFeature5LifetimeMs: number = 10000;
	private archerFeature5NextSpawnAt: number = 0;
	private archerCompanions!: Phaser.GameObjects.Group;
	private archerCompanionProjectiles!: Phaser.Physics.Arcade.Group;
	private rogueAutoAttackCount: number = 0;
	// Rogue feature map:
	// 1 Heavy Stab
	// 2 Crit Heal
	// 3 Shadow Dash
	// 4 Execution
	// 5 Dodge
	private rogueFeatureLevels: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	private rogueFeature1HeavyStabEnabled: boolean = true;
	private rogueFeature2CritHealEnabled: boolean = false;
	private rogueFeature3ShadowDashEnabled: boolean = false;
	private rogueFeature4ExecutionEnabled: boolean = false;
	private rogueFeature5DodgeEnabled: boolean = false;
	private readonly rogueFeature1EveryAutoAttacks: number = 3;
	private readonly rogueFeature3EveryAutoAttacks: number = 3;
	private readonly rogueFeature4ExecutionThreshold: number = 0.3;
	private knightSlashWaves!: Phaser.Physics.Arcade.Group;
	private isAttacking: boolean = false;
	private lastAttackTime: number = 0;
	private playerFacingDir: -1 | 1 = 1;
	private knightAutoAttackCount: number = 0;
	// Character-based feature flags (Knight = character 1)
	// feature1: Power Slash
	// feature2: Vampiric Tendency
	// feature3: Golden Shield
	// feature4: Fire Aura
	// feature5: Ground Spike
	private knightFeatureLevels: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
	private knightFeature1PowerSlashEnabled: boolean = false;
	private knightFeature2VampiricEnabled: boolean = false;
	private knightFeature2HitCount: number = 0;
	private knightFeature3GoldenShieldEnabled: boolean = false;
	private knightFeature3ShieldHitsRemaining: number = 2;
	private readonly knightFeature3ShieldMaxHits: number = 2;
	private readonly knightFeature3ShieldRegenDelayMs: number = 4000;
	private knightFeature3ShieldRegenReadyAt: number = 0;
	private knightFeature3Icon?: Phaser.GameObjects.Image;
	private knightFeature3CountText?: Phaser.GameObjects.Text;
	private knightFeature3Bubble?: Phaser.GameObjects.Arc;
	private knightFeature4FireAuraEnabled: boolean = false;
	private readonly knightFeature4AuraTickMs: number = 1000;
	private readonly knightFeature4AuraDamagePerTick: number = 0.5;
	private knightFeature4LastTickAt: number = 0;
	private knightFeature4AuraCircle?: Phaser.GameObjects.Arc;
	private knightFeature4AuraInner?: Phaser.GameObjects.Arc;
	private knightFeature4AuraPulseAt: number = 0;
	private knightFeature5GroundSpikeEnabled: boolean = false;
	private readonly knightFeature5EveryAutoAttacks: number = 4;
	private readonly knightFeature5SpikeDurationMs: number = 2000;
	private readonly knightFeature5SpikeStunMs: number = 500;
	private readonly knightFeature5SpikeDamagePerTick: number = 1;
	private knightFeature5SpikeSerial: number = 0;
	private knightFeature5Spikes!: Phaser.Physics.Arcade.Group;
	private readonly knightPowerSlashEvery: number = 3;
	private readonly knightPowerSlashDamageMultiplier: number = 2;
	private readonly knightPowerSlashWaveSpeed: number = 840;
	private readonly knightPowerSlashWaveLifeMs: number = 620;
	private playerHp: number = 3;
	private playerMaxHp: number = 10;
	private playerInvulnUntil: number = 0;
	private playerKnockbackUntil: number = 0;
	private heartIcons: Phaser.GameObjects.Image[] = [];
	private playerDead: boolean = false;
	private score: number = 0;
	private scoreText!: Phaser.GameObjects.Text;
	private levelText!: Phaser.GameObjects.Text;
	private playerLevel: number = 1;
	private playerExp: number = 0;
	private playerExpToNextLevel: number = 25;
	private isPaused: boolean = false;
	private isGameOver: boolean = false;
	private isMainMenu: boolean = true;
	private skillsInfoActive: boolean = false;
	private mapMode: "main" | "tutorial" = "main";
	private tutorialModeActive: boolean = false;
	private tutorialStep: number = 0;
	private tutorialRoomCenterXs: number[] = [];
	private tutorialRoomBaseX: number = 0;
	private tutorialRoomTopY: number = 0;
	private tutorialRoomStride: number = 0;
	private tutorialObjectiveTexts: Phaser.GameObjects.Text[] = [];
	private tutorialGateWalls: Record<number, Phaser.Physics.Arcade.Image | null> = {};
	private tutorialAttackDummy?: Phaser.Physics.Arcade.Sprite;
	private tutorialStep3RewardCollected: boolean = false;
	private tutorialStep4RewardCollected: boolean = false;
	private tutorialStep5RewardCollected: boolean = false;
	private tutorialFinalFightSpawned: boolean = false;
	private tutorialFinalFightCompleted: boolean = false;
	private tutorialFinalEnemies: Set<Phaser.Physics.Arcade.Sprite> = new Set();
	private tutorialTransitioning: boolean = false;
	private tutorialSkillIcon?: Phaser.Physics.Arcade.Image;
	private mainSpawnX: number = 0;
	private mainSpawnY: number = 0;
	private pauseBtn!: Phaser.GameObjects.Image;
	private skillsInfoBtn!: Phaser.GameObjects.Image;
	private hapticsEnabled: boolean = true;
	private settings = { music: true, fx: true, haptics: true };
	private bgm?: Phaser.Sound.BaseSound;
	private enemies!: Phaser.Physics.Arcade.Group;
	private lootIcons!: Phaser.Physics.Arcade.Group;
	private trailSprites!: Phaser.GameObjects.Group;
	private enemySpawnCandidates: { x: number; y: number }[] = [];
	private enemySpawnByType: Record<string, { x: number; y: number }[]> = {};
	private enemySpawnOrder: string[] = [];
	private roomSpawnCandidates: Record<number, { x: number; y: number }[]> = {};
	private waveStarted = false;
	private waveNumber = 0;
	private wavePhase: "idle" | "wave" | "boss" | "between" = "idle";
	private waveSpawnIntervalMs = 4000;
	private waveRoomState: Record<number, { active: boolean; spawned: number; toSpawn: number; nextSpawnAt: number }> = {};
	private waveStatusText?: Phaser.GameObjects.Text;
	private bossOrder = ["slime", "dragon", "mummy"];
	private bossIndex = 0;
	private enemySpawnIndex: number = 0;
	private damageMultiplier: number = 1;
	private knockbackMultiplier: number = 1;
	private doubleDamageText?: Phaser.GameObjects.Text;
	private doubleDamageTimer?: Phaser.Time.TimerEvent;
	private wizardText?: Phaser.GameObjects.Text;
	private wizardTimer?: Phaser.Time.TimerEvent;
	private wizardActive: boolean = false;
	private lastTrailTime: number = 0;
	private shieldHitsRemaining: number = 0;
	private shieldBubble?: Phaser.GameObjects.Arc;
	private readonly uiInsetX: number = 24;
	private readonly uiInsetY: number = 20;
	private readonly uiMobileTopRightShiftX: number = 14;
	private mobileControlsEnabled: boolean = false;
	private mobileMoveVector: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 0);
	private mobileJoystickBase?: Phaser.GameObjects.Arc;
	private mobileJoystickKnob?: Phaser.GameObjects.Arc;
	private mobileJoystickZone?: Phaser.GameObjects.Zone;
	private mobileJoystickPointerId: number = -1;
	private mobileFireButton?: Phaser.GameObjects.Image;
	private mobileFirePointerId: number = -1;
	private mobileFireHeld: boolean = false;
	private readonly mobileJoystickRadius: number = 145;
	private readonly mobileFireIdleAlpha: number = 0.45;
	private readonly mobileFireButtonScale: number = 5.2;
	private readonly mobileInputCalibrateXForceLandscape: number = 0.05;
	private readonly mobileJoystickExtraLeftShiftForceLandscape: number = 0.09;
	private readonly enemyConfigs: Record<string, {
		tex: { idle: string; attack: string; dying: string };
		frame: { w: number; h: number };
		frames: { idle: number; attack: number; dying: number };
		// True when the sprite sheet faces the opposite direction of motion (flipX should be inverted)
		facingInverted?: boolean;
		speed: number;
		hp: number;
		scale?: number;
		body?: { wScale: number; hScale: number };
		damage: number;
		boss?: boolean;
	}> = {
			rat: {
				tex: { idle: "rat_idle", attack: "rat_attack", dying: "rat_dying" },
				frame: { w: 32, h: 22 },
				frames: { idle: 12, attack: 6, dying: 10 },
				// Rat art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 1,
				body: { wScale: 0.6, hScale: 0.55 },
				damage: 1
			},
			beholder: {
				tex: { idle: "beholder_idle", attack: "beholder_attack", dying: "beholder_dying" },
				frame: { w: 32, h: 38 },
				frames: { idle: 18, attack: 9, dying: 18 },
				// Beholder art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 2,
				// Smaller collider helps avoid snagging on corners.
				body: { wScale: 0.24, hScale: 0.225 },
				damage: 2
			},
			golem: {
				tex: { idle: "golem_idle", attack: "golem_attack", dying: "golem_dying" },
				frame: { w: 42, h: 36 },
				frames: { idle: 6, attack: 10, dying: 20 },
				// Golem art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 4,
				body: { wScale: 0.62, hScale: 0.6 },
				damage: 1
			},
			skeleton: {
				tex: { idle: "skeleton_idle", attack: "skeleton_attack", dying: "skeleton_dying" },
				frame: { w: 36, h: 34 },
				frames: { idle: 12, attack: 8, dying: 14 },
				// Skeleton art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 2,
				body: { wScale: 0.6, hScale: 0.55 },
				damage: 2
			},
			stinger: {
				tex: { idle: "stinger_idle", attack: "stinger_attack", dying: "stinger_dying" },
				frame: { w: 46, h: 40 },
				frames: { idle: 12, attack: 10, dying: 11 },
				// Stinger art faces left by default in the sheet.
				facingInverted: true,
				speed: 285,
				hp: 1,
				body: { wScale: 0.6, hScale: 0.55 },
				damage: 1
			},
			slime: {
				tex: { idle: "slime_idle", attack: "slime_attack", dying: "slime_dying" },
				frame: { w: 34, h: 32 },
				frames: { idle: 12, attack: 7, dying: 8 },
				// Slime art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 6,
				scale: 4,
				body: { wScale: 0.0375, hScale: 0.06875 },
				damage: 2,
				boss: true
			},
			slime_split: {
				tex: { idle: "slime_idle", attack: "slime_attack", dying: "slime_dying" },
				frame: { w: 34, h: 32 },
				frames: { idle: 12, attack: 7, dying: 8 },
				// Slime art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 2,
				// 2.5x smaller than the main slime (4 / 2.5 = 1.6)
				scale: 1.6,
				body: { wScale: 0.0375, hScale: 0.06875 },
				damage: 1,
				boss: false
			},
			mummy: {
				tex: { idle: "mummy_idle", attack: "mummy_attack", dying: "mummy_dying" },
				frame: { w: 44, h: 66 },
				frames: { idle: 12, attack: 6, dying: 11 },
				// Mummy art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 6,
				scale: 1.5,
				body: { wScale: 0.12, hScale: 0.16 },
				damage: 2,
				boss: true
			},
			dragon: {
				tex: { idle: "dragon_idle", attack: "dragon_attack", dying: "dragon_dying" },
				frame: { w: 110, h: 72 },
				frames: { idle: 12, attack: 8, dying: 16 },
				// Dragon art faces left by default in the sheet.
				facingInverted: true,
				speed: 190,
				hp: 6,
				scale: 4,
				body: { wScale: 0.0375, hScale: 0.06875 },
				damage: 2,
				boss: true
			}
		};
	private navWalkable: boolean[][] = [];
	private navCols = 0;
	private navRows = 0;
	private mapOriginX = 0;
	private mapOriginY = 0;
	private scaledTileSize = 0;
	private walls!: Phaser.Physics.Arcade.StaticGroup;
	private doors!: Phaser.Physics.Arcade.StaticGroup;
	private chests!: Phaser.Physics.Arcade.StaticGroup;

	create(data?: { mapMode?: "main" | "tutorial"; autoStart?: boolean }) {
		this.editorCreate();
		this.mapMode = data?.mapMode === "tutorial" ? "tutorial" : "main";
		const autoStartFromData = data?.autoStart === true;

		if (this.textures.exists("dungeon_tileset")) {
			// Reset per-run state (scene restart)
			this.collectedKeys = new Set();
			this.mapTiles = [];
			this.torchPositions = [];
			this.enemySpawnCandidates = [];
			this.enemySpawnByType = {};
			this.enemySpawnOrder = [];
			this.enemySpawnIndex = 0;
			this.heartIcons = [];
			this.playerDead = false;
			this.activeCharacter = "knight";
			this.playerLevel = 1;
			this.playerExp = 0;
			this.playerExpToNextLevel = this.getRequiredExpForLevel(this.playerLevel);
			this.mageCasting = false;
			this.mageCastSprite = undefined;
			this.mageAutoAttackCount = 0;
			this.mageFeatureLevels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
			this.syncMageFeatureTogglesFromLevels();
			this.archerCasting = false;
			this.archerCastSprite = undefined;
			this.archerAutoAttackCount = 0;
			this.archerFeatureLevels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
			this.syncArcherFeatureTogglesFromLevels();
			this.archerFeature5NextSpawnAt = 0;
			this.rogueAutoAttackCount = 0;
			this.rogueFeatureLevels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
			this.syncRogueFeatureTogglesFromLevels();
			this.knightFeatureLevels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
			this.syncKnightFeatureTogglesFromLevels();
			this.knightAutoAttackCount = 0;
			this.knightFeature2HitCount = 0;
			this.knightFeature3ShieldHitsRemaining = 0;
			this.knightFeature3ShieldRegenReadyAt = 0;
			this.knightFeature4LastTickAt = 0;
			this.knightFeature4AuraPulseAt = 0;
			this.knightFeature5SpikeSerial = 0;
			this.waveStarted = false;
			this.waveNumber = 0;
			this.wavePhase = "idle";
			this.waveRoomState = {};
			this.bossIndex = 0;
			this.isPaused = false;
			this.isGameOver = false;
			this.isMainMenu = true;
			this.skillsInfoActive = false;
			this.characterSelectActive = false;
			this.characterSelectCandidates = [];
			if (this.characterSelectOverlay?.active) {
				this.characterSelectOverlay.destroy(true);
			}
			this.characterSelectOverlay = undefined;
			this.score = 0;
			this.playerFacingDir = 1;
			this.damageMultiplier = 1;
			this.knockbackMultiplier = 1;
			this.tutorialModeActive = this.mapMode === "tutorial";
			this.tutorialStep = 0;
			this.tutorialRoomCenterXs = [];
			this.tutorialRoomBaseX = 0;
			this.tutorialRoomTopY = 0;
			this.tutorialRoomStride = 0;
			this.tutorialObjectiveTexts = [];
			this.tutorialGateWalls = {};
			this.tutorialAttackDummy = undefined;
			this.tutorialStep3RewardCollected = false;
			this.tutorialStep4RewardCollected = false;
			this.tutorialStep5RewardCollected = false;
			this.tutorialFinalFightSpawned = false;
			this.tutorialFinalFightCompleted = false;
			this.tutorialFinalEnemies.clear();
			this.tutorialTransitioning = false;
			this.tutorialSkillIcon = undefined;
			this.mainSpawnX = 0;
			this.mainSpawnY = 0;
			this.wizardActive = false;
			this.shieldHitsRemaining = 0;
			this.lastTrailTime = 0;
			if (this.doubleDamageText) {
				this.doubleDamageText.destroy();
				this.doubleDamageText = undefined;
			}
			if (this.doubleDamageTimer) {
				this.doubleDamageTimer.remove(false);
				this.doubleDamageTimer = undefined;
			}
			if (this.wizardText) {
				this.wizardText.destroy();
				this.wizardText = undefined;
			}
			if (this.wizardTimer) {
				this.wizardTimer.remove(false);
				this.wizardTimer = undefined;
			}
			if (this.shieldBubble) {
				this.shieldBubble.destroy();
				this.shieldBubble = undefined;
			}
			if (this.knightFeature3Bubble) {
				this.knightFeature3Bubble.destroy();
				this.knightFeature3Bubble = undefined;
			}
			if (this.knightFeature4AuraCircle) {
				this.knightFeature4AuraCircle.destroy();
				this.knightFeature4AuraCircle = undefined;
			}
			if (this.knightFeature4AuraInner) {
				this.knightFeature4AuraInner.destroy();
				this.knightFeature4AuraInner = undefined;
			}

			// Dungeon-themed parallax background for out-of-bounds areas
			const bgW = this.scale.width;
			const bgH = this.scale.height;

			const baseBg = this.add.graphics();
			baseBg.fillGradientStyle(0x141a26, 0x1c2332, 0x0f131b, 0x151a24, 1);
			baseBg.fillRect(0, 0, bgW, bgH);
			baseBg.setScrollFactor(0.15);
			baseBg.setDepth(-30);

			// Subtle square grid texture
			const gridBg = this.add.graphics();
			gridBg.lineStyle(1, 0x0c111a, 0.25);
			const cell = 40;
			for (let x = 0; x <= bgW; x += cell) {
				gridBg.lineBetween(x, 0, x, bgH);
			}
			for (let y = 0; y <= bgH; y += cell) {
				gridBg.lineBetween(0, y, bgW, y);
			}
			gridBg.setScrollFactor(0.2);
			gridBg.setDepth(-29);

			const midBg = this.add.graphics();
			for (let i = 0; i < 10; i++) {
				const r = Phaser.Math.Between(90, 180);
				const x = Phaser.Math.Between(0, bgW);
				const y = Phaser.Math.Between(0, bgH);
				midBg.fillStyle(0x0b0f16, 0.18);
				midBg.fillCircle(x, y, r);
			}
			midBg.setScrollFactor(0.25);
			midBg.setDepth(-28);

			const frontBg = this.add.graphics();
			for (let i = 0; i < 180; i++) {
				const x = Phaser.Math.Between(0, bgW);
				const y = Phaser.Math.Between(0, bgH);
				const w = Phaser.Math.Between(8, 20);
				const h = Phaser.Math.Between(8, 20);
				frontBg.fillStyle(0x0a0d12, 0.12);
				frontBg.fillRect(x, y, w, h);
			}
			frontBg.setScrollFactor(0.35);
			frontBg.setDepth(-27);

			// Smooth wave motion
			this.tweens.add({
				targets: [midBg],
				alpha: 0.88,
				duration: 4200,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut"
			});
			this.tweens.add({
				targets: [frontBg],
				alpha: 0.9,
				duration: 3600,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut"
			});
			this.tweens.add({
				targets: [baseBg],
				alpha: 0.95,
				duration: 5200,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut"
			});

			// Init keys
			this.wasd = this.input.keyboard!.addKeys({
				W: Phaser.Input.Keyboard.KeyCodes.W,
				A: Phaser.Input.Keyboard.KeyCodes.A,
				S: Phaser.Input.Keyboard.KeyCodes.S,
				D: Phaser.Input.Keyboard.KeyCodes.D
			}) as any;
			this.cursors = this.input.keyboard!.createCursorKeys();
			this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
			this.keyOne = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
			this.keyTwo = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
			this.keyThree = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
			this.keyFour = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);

			// Settings (localStorage)
			this.settings = this.loadSettings();
			this.hapticsEnabled = this.settings.haptics;

			// Background music (initially stopped or low volume, started on Play)
			if (!this.bgm) {
				this.bgm = this.sound.add("dungeonBgMusic", { loop: true, volume: 0.35 });
			}
			// Don't auto-play here, wait for interaction (Play button)
			// this.applySettings(); 

			// Camera Initial State for Menu
			// Zoom out to see more (Genişten görsün)
			this.cameras.main.setZoom(0.53);
			this.cameras.main.scrollX = 50; // Closer to 0 for centering
			this.cameras.main.scrollY = 50; // Higher up
			this.cameras.main.stopFollow();

			// Slow pan effect for menu
			this.tweens.add({
				targets: this.cameras.main,
				scrollX: 250,
				scrollY: 150,
				duration: 25000,
				yoyo: true,
				repeat: -1,
				ease: 'Sine.easeInOut'
			});

			// Custom Map Layout
			// Support:
			// - number: Tile Index
			// - Index-: Visual only (rawId < 0)
			// - (TAG/DIR)Index: Connection tags (handled by layout logic)
			// - Index(Rotation): e.g. 54(90)
			// - Index(/Overlay): e.g. 324(/196)
			// - Combined: 324(90)(/196)
			// Variables
			const variables: Record<string, string> = {
				Torch: "{a16,a17,a18,a19,a20,a21,a22,a23[0.15]}",
				bTorch: "{t0,t1,t2,t3,t4,t5[0.15]}",
				bCrate1: "c1",
				bCrate2: "c2",
				bPainting1: "p1",
				bPainting2: "p2",
				bPainting3: "p3",
				bPainting4: "p4"
			};

			const resolveValue = (val: string | number) => {
				let s = val.toString();
				const sortedKeys = Object.keys(variables).sort((a, b) => b.length - a.length);
				for (const key of sortedKeys) {
					s = s.split(key).join(variables[key]);
				}
				return s;
			};

			let mapLayout: (number | string)[][] = [
				// Y=0: Room 3 (Left) | Room 4 (Right)
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b172-", "b173-", "b173-", "b174-", "b175-", "b176-", "b177-",
					0, 0, 0, 0,
					"b172-", "b173-", "b174-", "b173-", "b175-", "b176-", "b177-"],
				// Y=1
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b480-", "b362(/bTorch)-", "b362(/bPainting3)-", "b362-", "b362(bPainting2)-", "b362(/pChain)-", "b362(/bTorch)-",
					0, 0, 0, 0,
					"b480-", "b362(/bTorch)-", "b362(/pChain)-", "b362-", "b362(/bPainting2)-", "b362-", "b362(/bTorch)-"],
				// Y=2
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b480-", "b146(/bChest)*", "b147(/ct_gold_rock)", "b140(/ct_gold_01)", "b141(/bChest)*", "b142(/ct_gold_02)", "b143(/ct_gold_03)",
					0, 0, 0, 0,
					"b480-", "b146", "b147(/ct_carpet_00)(/ct_throne)*", "b140(/ct_carpet_00)(/ct_throne)*", "b141(/ct_gold_01)", "b142", "b143(/bVase1)"],
				// Y=3
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b480-", "b124", "b125(/ct_gold_01)", "b126", "b127(/ct_gold_rock)", "b120", "b121(/ct_gold_02)",
					0, 0, 0, 0,
					"b480-", "b124(/bSkulls)", "b125(bAcid)(/ct_carpet_01)", "b126(bBooks)(/ct_carpet_01)", "b127", "b120", "b121(/ct_tombstone_01)*"],
				// Y=4
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b480-", "b144", "b145(/ct_gold_03)", "b146", "b147(/ct_gold_02)", "b140", "b141", "b120", "b121(/ct_gold_01)", "b122", "b123",
					"b42", "b144", "b145(/ct_carpet_01)", "b146(/ct_carpet_01)", "b147", "b120", "b121(/b521)*"],
				// Y=5
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b480-", "b126(/ct_gold_01)", "b127(/ct_gold_02)", "b120", "b121", "b122(/ct_gold_03)", "b123", "b140", "b141", "b142", "b143(room4/right)",
					"(start)b42", "b126", "b127(bBlood)(/ct_carpet_01)", "b120(/ct_carpet_01)", "b121", "b122", "b123(/b522)*"],
				// Y=6
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b390-", "b146", "b147", "b140", "b141", "b142", "b143", "b292-", "b293-", "b296-", "b297-",
					"b390-", "b146", "b147(/ct_carpet_01)", "b140(/ct_carpet_01)", "b141", "b142(bBlood)", "b143(bChair2)*"],
				// Y=7
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b294-", "b293-", "b294-", "b42", "b296-", "b296-", "b297-", "b312-", "b313-", "b314-", "b317-",
					"b294-", "b293-", "b42(/ct_carpet_01)", "b42(/ct_carpet_01)", "b296-", "b296-", "b297-"],
				// Y=8: Room 3 Bottom Exit
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					"b312-", "b313-", "b314-", "b42(start)", "b314-", "b316-", "b317-",
					0, 0, 0, 0,
					"b312-", "b313-", "b42(/ct_carpet_01)", "b42(room5/down)(/ct_carpet_01)", "b314-", "b316-", "b317"],

				// Y=9: Bridge Top
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, "(room3/up)b42", 0, 0, 0,
					0, 0, 0, 0,
					"b172-", "b173-", "b42(/ct_carpet_01)", "b42(start)(/ct_carpet_01)", "b175-", "b176-", "b177-"],
				// Y=10: Bridge Bottom
				[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, "b42(b520(door[2]))", 0, 0, 0,
					0, 0, 0, 0,
					"b480-", "b362(/bTorch)-", "b42(/ct_carpet_01)", "b42(/ct_carpet_01)", "b362(/bPainting3)-", "b362(/pChain)-", "b362(/bTorch)-"],

				// Y=11: Room 1 | Room 2
				["b172-", "b173-", "b173-", "b174-", "b175-", "b176-", "b177-",
					0, 0, 0, 0,
					"b172-", "b173-", "b173-", "b42", "b175-", "b176-", "b177-",
					0, 0, 0, 0,
					"b480-", "b146(/bVase1)", "b147(/ct_carpet_02)", "b140(/ct_carpet_02)", "b141", "b142(bCrate1)*", "b143"],
				// Y=12
				["b480-", "b362(/bTorch)-", "b362-", "b362(/bPainting2)-", "b362-", "b362-", "b362(/bTorch)-",
					0, 0, 0, 0,
					"b480-", "b362(/bTorch)-", "b362-", "b62", "b362-", "b362(/ct_flag_red)-", "b362-",
					0, 0, 0, 0,
					"b480-", "b124(/bSkulls)", "b125", "b126(bBlood)", "b127(a228(key[3]))", "b120(/bBooks)", "b121"],
				// Y=13
				["b480-", "b120(bChest)*", "b126", "b127(bCrate2)*", "b120", "b121", "b123(bCrate1)*",
					0, 0, 0, 0,
					"b480-", "b146(/ct_book_shelf_01)*", "b147(/ct_book_shelf_01)*", "b140", "b141(/bChest)*", "b142(/ct_vase_grey_broken)", "b143(/ct_vase_grey)",
					0, 0, 0, 0,
					"b480-", "b144", "b145", "b146", "b147", "b120", "b121"],
				// Y=14
				["b480-", "b124", "b125(spawn)", "b126", "b127(bCrate2)*", "b120", "b121",
					0, 0, 0, 0,
					"b480-", "b124(/ct_book_red)", "b125", "b126", "b127", "b120", "b121",
					"b42(a513(door[3]))", "b42", "b42", "b42", "b42",
					"b126", "b127", "b120", "b121(bAcid)", "b122", "b123"],
				// Y=15
				["b480-", "b124", "b125(a228(key[1]))", "b126", "b127(bCrate1)*", "b120", "b121",
					0, 0, 0, 0,
					"b480-", "b144(/ct_book_shelf_01)*", "b145(/ct_book_shelf_01)*", "b146", "b147", "b140(a228(key[2]))", "b141",
					"b292-", "b293-", "b296-", "b297-",
					"b390-", "b146(/bChair2)*", "b147", "b140", "b141", "b142", "b143(bBlood)"],
				// Y=16: Link Row (R1 -> R2)
				["b480-", "b144", "b145", "b146", "b147", "b140", "b141", "b120(a510(door[1]))", "b121", "b120", "b125(room2/right)",
					"(start)b126", "b126", "b127(/ct_books2)", "b120", "b121(/ct_carpet_big_tl)", "b122(/ct_carpet_big_tm)", "b123(/ct_carpet_big_tr)",
					"b312-", "b313-", "b314-", "b317-",
					"b294-", "b293-", "b294-", "b294-", "b296-", "b296-", "b297-"],
				// Y=17
				["b480-", "b126(/b521)*", "b127", "b120", "b121", "b122", "b123", "b272-", "b273-", "b274-", "b275-",
					"b277-", "b146", "b147", "b140", "b141(/ct_carpet_big_bl)(/ct_chair01)*", "b142(/ct_carpet_big_bm)(/ct_table)*", "b143(/ct_carpet_big_br)(/ct_chair02)*",
					0, 0, 0, 0,
					"b312-", "b313-", "b314-", "b315-", "b314-", "b316-", "b317-"],
				// Y=18
				["b480-", "b146(/b522)*", "b147", "b140", "b141", "b142(/bSkulls)", "b143(/bVase1)", "b292-", "b293-", "b294-", "b294-",
					"b294-", "b293-", "b294-", "b295-", "b296-", "b296-", "b297-",
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				// Y=19
				["b192-", "b193-", "b193-", "b193-", "b193-", "b193-", "b197-", "b313-", "b314-", "b315-", "b316-",
					"b312-", "b313-", "b314-", "b315-", "b314-", "b316-", "b317-",
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				// Y=20
				["b292-", "b293-", "b294-", "b295-", "b296-", "b296-", "b297-",
					0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				// Y=21
				["b312-", "b313-", "b314-", "b315-", "b314-", "b316-", "b317-",
					0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0,
					0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
			];
			const mainLayoutRows = mapLayout.length;
			const mainLayoutCols = Math.max(...mapLayout.map((row) => row.length));
			const tutorialLayout = this.getTutorialMapLayout();
			const combinedCols = Math.max(
				...mapLayout.map((row) => row.length),
				...tutorialLayout.map((row) => row.length)
			);
			const normalizeRow = (row: (number | string)[]) => {
				if (row.length >= combinedCols) return row.slice();
				return row.concat(Array(combinedCols - row.length).fill(0));
			};
			const separatorRows = Array.from({ length: 2 }, () => Array(combinedCols).fill(0) as (number | string)[]);
			const tutorialStartRow = mainLayoutRows + separatorRows.length;
			mapLayout = [
				...mapLayout.map(normalizeRow),
				...separatorRows,
				...tutorialLayout.map(normalizeRow)
			];

			const tileSize = 16;
			const scale = 4;
			const scaledTileSize = tileSize * scale;

			// Calculate dimensions and centering
			const maxCols = Math.max(...mapLayout.map(row => row.length));
			const mapWidth = maxCols * scaledTileSize;
			const mapHeight = mapLayout.length * scaledTileSize;
			const mainMapWidth = mainLayoutCols * scaledTileSize;
			const mainMapHeight = mainLayoutRows * scaledTileSize;

			// Keep the original main dungeon framing for menu camera,
			// while tutorial is appended below in the same world.
			const startX = (this.scale.width - mainMapWidth) / 2;
			const startY = (this.scale.height - mainMapHeight) / 2;
			const tutorialFirstRoomCenterX = startX + (3.5 * scaledTileSize);
			const tutorialFirstRoomTopY = startY + tutorialStartRow * scaledTileSize;
			const tutorialRoomStride = 12 * scaledTileSize;
			const tutorialRoomBaseX = tutorialFirstRoomCenterX - 3.5 * scaledTileSize;
			const tutorialRoomCenterXs = Array.from({ length: 6 }, (_, i) => tutorialFirstRoomCenterX + i * tutorialRoomStride);

			this.mapOriginX = startX;
			this.mapOriginY = startY;
			this.scaledTileSize = scaledTileSize;
			this.navRows = mapLayout.length;
			this.navCols = maxCols;
			this.tutorialRoomCenterXs = tutorialRoomCenterXs;
			this.tutorialRoomTopY = tutorialFirstRoomTopY;
			this.tutorialRoomBaseX = tutorialRoomBaseX;
			this.tutorialRoomStride = tutorialRoomStride;


			// Helper to parse tile data
			const getTileData = (item: number | string | undefined): {
				id: number, rawId: number, angle: number, overlayId: number | null, overlayId2: number | null,
				overlayAngle: number, overlayAngle2: number, isVoid: boolean,
				texture: string, overlayTexture: string | null, overlayTexture2: string | null,
				keyId: number | null, doorId: number | null, forceCollider: boolean,
				animation?: { frames: { texture: string, id: number }[], duration: number },
				overlayAnimation?: { frames: { texture: string, id: number }[], duration: number },
				overlayAnimation2?: { frames: { texture: string, id: number }[], duration: number }
			} => {
				const emptyResult = { id: 0, rawId: 0, angle: 0, overlayId: null, overlayId2: null, overlayAngle: 0, overlayAngle2: 0, isVoid: true, texture: "dungeon_tileset", overlayTexture: null, overlayTexture2: null, keyId: null, doorId: null, forceCollider: false };
				if (item === undefined) return emptyResult;

				let rawId = 0;
				let angle = 0;
				let overlayId: number | null = null;
				let overlayId2: number | null = null;
				let overlayAngle = 0;
				let overlayAngle2 = 0;
				let texture = "dungeon_tileset";
				let overlayTexture: string | null = null;
				let overlayTexture2: string | null = null;
				let keyId: number | null = null;
				let doorId: number | null = null;
				let forceCollider = false;
				let animData: any = undefined;
				let overAnimData: any = undefined;
				let overAnimData2: any = undefined;

				const pushOverlay = (tex: string | null, id: number | null, anim?: { frames: { texture: string, id: number }[], duration: number }, angleOverride?: number) => {
					if (tex === null) return;
					if (overlayTexture === null && overlayId === null && !overAnimData) {
						overlayTexture = tex;
						overlayId = id;
						if (typeof angleOverride === "number") overlayAngle = angleOverride;
						if (anim) overAnimData = anim;
					} else if (overlayTexture2 === null && overlayId2 === null && !overAnimData2) {
						overlayTexture2 = tex;
						overlayId2 = id;
						if (typeof angleOverride === "number") overlayAngle2 = angleOverride;
						if (anim) overAnimData2 = anim;
					}
				};

				let itemStr = resolveValue(item.toString());

				// Helper for frame parsing
				const parseFrameStr = (f: string) => {
					let t = "dungeon_tileset";
					let fid = f;
					if (f.startsWith('a')) {
						t = "punyworld_tileset";
						fid = f.substring(1);
					} else if (f.startsWith('b')) {
						t = "b_tileset";
						fid = f.substring(1);
					} else if (f.startsWith('t')) {
						t = "torch_yellow";
						fid = f.substring(1);
					}
					return { texture: t, id: parseInt(fid) };
				};

				// Parse Animation format: {a1,a2[0.4]}
				const parseAnim = (str: string) => {
					const match = str.match(/\{(.*)\[([\d.]+)\]\}/);
					if (match) {
						return {
							frames: match[1].split(',').map(parseFrameStr),
							duration: parseFloat(match[2])
						};
					}
					return null;
				};

				// Extract animations
				const animRegex = /\{[^}]+\}/g;
				const animMatches = itemStr.match(animRegex);
				if (animMatches) {
					animMatches.forEach(m => {
						const parsed = parseAnim(m);
						if (parsed) {
							if (itemStr.includes('(/') && itemStr.indexOf('(/') < itemStr.indexOf(m)) {
								overAnimData = parsed;
							} else {
								animData = parsed;
							}
						}
					});
					itemStr = itemStr.replace(animRegex, '');
				}

				// Advanced Parenthesis Parser
				const getOuterBlocks = (str: string) => {
					const blocks: string[] = [];
					let count = 0, start = -1;
					for (let i = 0; i < str.length; i++) {
						if (str[i] === '(') { if (count === 0) start = i; count++; }
						else if (str[i] === ')') { count--; if (count === 0 && start !== -1) { blocks.push(str.substring(start, i + 1)); } }
					}
					return blocks;
				};

				const processBlock = (block: string) => {
					const inner = block.substring(1, block.length - 1);
					if (inner.startsWith('/')) {
						let sub = inner.substring(1);
						if (sub.includes('*')) { forceCollider = true; sub = sub.replace('*', ''); }
						const subBlocks = getOuterBlocks(sub);
						subBlocks.forEach(sb => { processBlock(sb); sub = sub.replace(sb, ''); });
						let overlayStr = sub;
						if (overlayStr.startsWith("ct_")) {
							let angleOverride = 0;
							const m = overlayStr.match(/\(([-\d]+)\)/);
							if (m) {
								angleOverride = parseInt(m[1]);
								overlayStr = overlayStr.replace(/\([^)]+\)/, "");
							}
							pushOverlay(overlayStr, 0, undefined, angleOverride);
							overlayStr = "0";
						} else if (overlayStr === "pChain" || overlayStr === "bBookShelf" || overlayStr === "bBooks" ||
							overlayStr === "bChair1" || overlayStr === "bChair2" || overlayStr === "bSkulls" ||
							overlayStr === "bVase1" || overlayStr === "bVaseBroken1" || overlayStr === "bVase2" || overlayStr === "bVaseBroken2" ||
							overlayStr === "bAcid" || overlayStr === "bBlood" ||
							overlayStr === "bCrate1" || overlayStr === "bCrate2" || overlayStr === "bChest" ||
							overlayStr === "bPainting1" || overlayStr === "bPainting2" || overlayStr === "bPainting3" || overlayStr === "bPainting4") {

							let tex = overlayStr;
							if (overlayStr.startsWith("bCrate")) tex = overlayStr.replace('bCrate', 'crate');
							else if (overlayStr === "bChest") tex = "chest";
							else if (overlayStr.startsWith("bPainting")) tex = overlayStr.replace('bPainting', 'painting');
							pushOverlay(tex, 0);
							overlayStr = "0";
						} else if (overlayStr.startsWith('a')) {
							pushOverlay("punyworld_tileset", parseInt(overlayStr.substring(1)));
							overlayStr = "0";
						} else if (overlayStr.startsWith('b')) {
							pushOverlay("b_tileset", parseInt(overlayStr.substring(1)));
							overlayStr = "0";
						} else if (overlayStr.startsWith('c')) {
							const cId = overlayStr.substring(1);
							pushOverlay(cId === "1" ? "crate1" : "crate2", 0);
							overlayStr = "0";
						} else if (overlayStr.startsWith('p')) {
							const pId = overlayStr.substring(1);
							pushOverlay(`painting${pId}`, 0);
							overlayStr = "0";
						} else {
							pushOverlay("dungeon_tileset", parseInt(overlayStr));
						}
					} else if (inner.startsWith("ct_")) {
						let angleOverride = 0;
						const m = inner.match(/\(([-\d]+)\)/);
						let cleaned = inner;
						if (m) {
							angleOverride = parseInt(m[1]);
							cleaned = inner.replace(/\([^)]+\)/, "");
						}
						pushOverlay(cleaned, 0, undefined, angleOverride);
					} else if (inner.startsWith('a') && (inner.includes('(') || !isNaN(parseInt(inner.substring(1))))) {
						let sub = inner;
						const subBlocks = getOuterBlocks(sub);
						subBlocks.forEach(sb => { processBlock(sb); sub = sub.replace(sb, ''); });
						pushOverlay("punyworld_tileset", parseInt(sub.substring(1)));
					} else if (inner === "pChain" || inner === "bBookShelf" || inner === "bBooks" ||
						inner === "bChair1" || inner === "bChair2" || inner === "bSkulls" ||
						inner === "bVase1" || inner === "bVaseBroken1" || inner === "bVase2" || inner === "bVaseBroken2" ||
						inner === "bAcid" || inner === "bBlood" ||
						inner === "bCrate1" || inner === "bCrate2" || inner === "bChest" ||
						inner === "bPainting1" || inner === "bPainting2" || inner === "bPainting3" || inner === "bPainting4") {

						let tex = inner;
						if (inner.startsWith("bCrate")) tex = inner.replace('bCrate', 'crate');
						else if (inner === "bChest") tex = "chest";
						else if (inner.startsWith("bPainting")) tex = inner.replace('bPainting', 'painting');
						pushOverlay(tex, 0);
					} else if (inner.startsWith('b') && (inner.includes('(') || !isNaN(parseInt(inner.substring(1))))) {
						let sub = inner;
						const subBlocks = getOuterBlocks(sub);
						subBlocks.forEach(sb => { processBlock(sb); sub = sub.replace(sb, ''); });
						pushOverlay("b_tileset", parseInt(sub.substring(1)));
					} else if (inner.startsWith('c') && !isNaN(parseInt(inner.substring(1)))) {
						const cId = inner.substring(1);
						pushOverlay(cId === "1" ? "crate1" : "crate2", 0);
					} else if (inner.startsWith('p') && !isNaN(parseInt(inner.substring(1)))) {
						const pId = inner.substring(1);
						pushOverlay(`painting${pId}`, 0);
					} else if (inner.startsWith('key[')) {
						const m = inner.match(/key\[(\d+)\]/);
						if (m) keyId = parseInt(m[1]);
					} else if (inner.startsWith('door[')) {
						const m = inner.match(/door\[(\d+)\]/);
						if (m) doorId = parseInt(m[1]);
					} else if (!isNaN(parseInt(inner))) {
						angle = parseInt(inner);
					}
				};

				let blocks = getOuterBlocks(itemStr);
				blocks.forEach(b => { processBlock(b); itemStr = itemStr.replace(b, ''); });

				itemStr = itemStr.replace(/\(spawn\)/g, '').replace(/\(room[^)]*\)/g, '').replace(/\(start\)/g, '');
				if (itemStr.includes('*')) { forceCollider = true; itemStr = itemStr.replace('*', ''); }

				let isVisualOnly = false;
				if (itemStr.includes('-')) { isVisualOnly = true; itemStr = itemStr.replace('-', ''); }

				const parts = itemStr.split('(');
				let idPart = parts[0];

				if (idPart.startsWith("ct_")) {
					texture = idPart;
					idPart = "0";
				} else if (idPart === "pChain" || idPart === "bBookShelf" || idPart === "bBooks" ||
					idPart === "bChair1" || idPart === "bChair2" || idPart === "bChair" || idPart === "bSkulls" ||
					idPart === "bVase1" || idPart === "bVaseBroken1" || idPart === "bVase2" || idPart === "bVaseBroken2" ||
					idPart === "bAcid" || idPart === "bBlood" || idPart === "bChest") {
					texture = idPart === "bChair" ? "bChair1" : (idPart === "bChest" ? "chest" : idPart);
					idPart = "0";
				} else if (idPart.startsWith('a')) {
					texture = "punyworld_tileset";
					idPart = idPart.substring(1);
				} else if (idPart.startsWith('b')) {
					texture = "b_tileset";
					idPart = idPart.substring(1);
				} else if (idPart.startsWith('c')) {
					const cId = idPart.substring(1);
					texture = cId === "1" ? "crate1" : "crate2";
					idPart = "0";
				} else if (idPart.startsWith('p')) {
					const pId = idPart.substring(1);
					texture = `painting${pId}`;
					idPart = "0";
				}

				const parsedId = parseInt(idPart);
				const baseId = isNaN(parsedId) ? 0 : parsedId;
				rawId = isVisualOnly ? -baseId : baseId;

				if (parts.length > 1) {
					let extraStr = parts[1].replace(')', '');
					if (extraStr.startsWith("ct_") && overlayId === null) {
						let angleOverride = 0;
						const m = extraStr.match(/\(([-\d]+)\)/);
						let cleaned = extraStr;
						if (m) {
							angleOverride = parseInt(m[1]);
							cleaned = extraStr.replace(/\([^)]+\)/, "");
						}
						pushOverlay(cleaned, 0, undefined, angleOverride);
					} else if (extraStr.startsWith('a') && overlayId === null) {
						// Extra texture info (like 74(a228)) treated as overlay
						pushOverlay("punyworld_tileset", parseInt(extraStr.substring(1)));
					} else if (extraStr.startsWith('b') && overlayId === null) {
						pushOverlay("b_tileset", parseInt(extraStr.substring(1)));
					} else if ((extraStr === "pChain" || extraStr === "bBookShelf" || extraStr === "bBooks" ||
						extraStr === "bChair1" || extraStr === "bChair2" || extraStr === "bChair" || extraStr === "bSkulls" ||
						extraStr === "bVase1" || extraStr === "bVaseBroken1" || extraStr === "bVase2" || extraStr === "bVaseBroken2" ||
						extraStr === "bAcid" || extraStr === "bBlood") && overlayId === null) {
						pushOverlay(extraStr === "bChair" ? "bChair1" : extraStr, 0);
					} else if (extraStr.startsWith('c') && overlayId === null) {
						const cId = extraStr.substring(1);
						pushOverlay(cId === "1" ? "crate1" : "crate2", 0);
					} else if (extraStr.startsWith('p') && overlayId === null) {
						const pId = extraStr.substring(1);
						pushOverlay(`painting${pId}`, 0);
					} else { /* This case is already handled by processBlock for other types of parenthesis content */ }
				}

				// Final check for special tile mapping (b520+)
				if (texture === "b_tileset") {
					if (baseId === 520) {
						texture = "door_rock";
						rawId = 0;
					} else if (baseId === 521) {
						texture = "coffin";
						rawId = 0;
					} else if (baseId === 522) {
						texture = "coffin";
						rawId = 1;
					}
				}
				if (overlayTexture === "b_tileset") {
					if (overlayId === 520) {
						overlayTexture = "door_rock";
						overlayId = 0;
					} else if (overlayId === 521) {
						overlayTexture = "coffin";
						overlayId = 0;
					} else if (overlayId === 522) {
						overlayTexture = "coffin";
						overlayId = 1;
					}
				}
				if (overlayTexture2 === "b_tileset") {
					if (overlayId2 === 520) {
						overlayTexture2 = "door_rock";
						overlayId2 = 0;
					} else if (overlayId2 === 521) {
						overlayTexture2 = "coffin";
						overlayId2 = 0;
					} else if (overlayId2 === 522) {
						overlayTexture2 = "coffin";
						overlayId2 = 1;
					}
				}

				if (overAnimData && (overlayId === null || isNaN(overlayId))) {
					pushOverlay(overAnimData.frames[0].texture, overAnimData.frames[0].id, overAnimData);
				}
				if (overAnimData2 && (overlayId2 === null || isNaN(overlayId2))) {
					pushOverlay(overAnimData2.frames[0].texture, overAnimData2.frames[0].id, overAnimData2);
				}

				return {
					id: Math.abs(rawId), rawId: rawId, angle: angle, overlayId: overlayId, overlayId2: overlayId2,
					overlayAngle: overlayAngle, overlayAngle2: overlayAngle2,
					isVoid: ((rawId === 0 && texture === "dungeon_tileset") || rawId < 0) && animData === undefined,
					texture: texture, overlayTexture: overlayTexture, overlayTexture2: overlayTexture2,
					keyId, doorId, forceCollider, animation: animData, overlayAnimation: overAnimData, overlayAnimation2: overAnimData2
				};
			};

			// Walls and Objects
			this.walls = this.physics.add.staticGroup();
			this.doors = this.physics.add.staticGroup();
			this.chests = this.physics.add.staticGroup();
			const keys = this.physics.add.staticGroup();
			this.enemies = this.physics.add.group({ runChildUpdate: false });
			this.lootIcons = this.physics.add.group({ runChildUpdate: false });
			this.mageFireballs = this.physics.add.group({ runChildUpdate: false });
			this.mageFreezeZones = this.add.group();
			this.magePoisonZones = this.add.group();
			this.mageLaserVisuals = this.add.group();
			this.archerArrows = this.physics.add.group({ runChildUpdate: false });
			this.archerCompanions = this.add.group();
			this.archerCompanionProjectiles = this.physics.add.group({ runChildUpdate: false });
			this.knightSlashWaves = this.physics.add.group({ runChildUpdate: false });
			this.knightFeature5Spikes = this.physics.add.group({ runChildUpdate: false });
			this.trailSprites = this.add.group();

			// Nav grid (walkable tiles) for basic A* chasing
			this.navWalkable = Array.from({ length: this.navRows }, () => Array(this.navCols).fill(false));
			for (let gy = 0; gy < this.navRows; gy++) {
				for (let gx = 0; gx < this.navCols; gx++) {
					const cell = mapLayout[gy] ? mapLayout[gy][gx] : undefined;
					const td = getTileData(resolveValue(cell ?? 0));
					this.navWalkable[gy][gx] = !td.isVoid && !td.forceCollider && td.doorId === null;
				}
			}

			let mainSpawnX = startX + (5 * scaledTileSize) / 2;
			let mainSpawnY = startY + mapHeight / 2;
			let mainSpawnGridX = 0;
			let mainSpawnGridY = 0;
			let tutorialSpawnX = mainSpawnX;
			let tutorialSpawnY = mainSpawnY;
			let hasTutorialSpawn = false;

			for (let y = 0; y < mapLayout.length; y++) {
				for (let x = 0; x < mapLayout[y].length; x++) {
					const rawItemStr = resolveValue(mapLayout[y][x]);
					const tileData = getTileData(rawItemStr);

					// Skip actual empty space (ID 0 in dungeon tileset and no animation)
					if (tileData.rawId === 0 && tileData.texture === "dungeon_tileset" && !tileData.animation) continue;

					const posX = startX + x * scaledTileSize;
					const posY = startY + y * scaledTileSize;

					// Capture spawn position
					if (rawItemStr.includes("(spawn)")) {
						mainSpawnX = posX + scaledTileSize / 2;
						mainSpawnY = posY + scaledTileSize / 2;
						mainSpawnGridX = x;
						mainSpawnGridY = y;
					}
					if (rawItemStr.includes("(tutorialSpawn)")) {
						tutorialSpawnX = posX + scaledTileSize / 2;
						tutorialSpawnY = posY + scaledTileSize / 2;
						hasTutorialSpawn = true;
					}


					// Place tile visual
					const tile = this.add.image(posX, posY, tileData.texture, tileData.id);
					const isTwoX = tileData.texture === "coffin" || tileData.texture === "door_rock" ||
						tileData.texture === "crate1" || tileData.texture === "crate2" ||
						tileData.texture.startsWith("painting") || tileData.texture.startsWith("ct_") ||
						tileData.texture === "pChain" || tileData.texture === "bBookShelf" ||
						tileData.texture === "bBooks" || tileData.texture === "bChair1" ||
						tileData.texture === "bChair2" || tileData.texture === "bSkulls" ||
						tileData.texture === "bVase1" || tileData.texture === "bVaseBroken1" ||
						tileData.texture === "bVase2" || tileData.texture === "bVaseBroken2" ||
						tileData.texture === "bAcid" || tileData.texture === "bBlood";
					if (isTwoX) {
						tile.setOrigin(0, 0).setScale(scale / 2);
					} else {
						tile.setOrigin(0, 0).setScale(scale);
					}
					tile.setDepth(0);
					this.mapTiles.push(tile);

					if (tileData.angle !== 0) {
						tile.setOrigin(0.5, 0.5);
						tile.x += scaledTileSize / 2;
						tile.y += scaledTileSize / 2;
						tile.setAngle(tileData.angle);
					}

					// Apply Animations if any
					if (tileData.animation) {
						let fIdx = 0;
						this.time.addEvent({
							delay: tileData.animation.duration * 1000,
							callback: () => {
								if (!tile.active) return;
								fIdx = (fIdx + 1) % tileData.animation!.frames.length;
								const f = tileData.animation!.frames[fIdx];
								tile.setTexture(f.texture, f.id);
							},
							loop: true
						});
					}

					// Torch detection (identify light sources) - Check raw item before variable resolution
					if (mapLayout[y][x].toString().includes("Torch")) {
						this.torchPositions.push({ x: posX + scaledTileSize / 2, y: posY + scaledTileSize / 2 });
					}

					// Place overlays if any (supports 2 layers)
					const overlayImgs: Phaser.GameObjects.Image[] = [];
					const addOverlay = (startTex: string, startId: number, anim?: { frames: { texture: string, id: number }[], duration: number }, angleOverride?: number) => {
						let overlayImg: Phaser.GameObjects.Image | null = null;
						let chestSprite: Phaser.Physics.Arcade.Sprite | null = null;
						if (startTex === "chest") {
							chestSprite = this.chests.create(posX, posY, startTex, startId) as Phaser.Physics.Arcade.Sprite;
							overlayImg = chestSprite;
						} else {
							overlayImg = this.add.image(posX, posY, startTex, startId);
						}
						if (startTex === "chest") {
							overlayImg.y -= 18;
						}
						overlayImg.setDepth(1);
						this.mapTiles.push(overlayImg);

						if (startTex === "torch_yellow") {
							// 2x resolution sprite: scale by half of base scale
							overlayImg.setScale(scale / 2);
							// Center horizontally and align slightly higher to fit the wall/shelf
							overlayImg.setOrigin(0.5, 0.7);
							overlayImg.setPosition(posX + scaledTileSize / 2, posY + scaledTileSize / 2);
						} else if (startTex === "door_rock" || startTex === "coffin" || startTex === "crate1" || startTex === "crate2" || startTex === "chest" || startTex.startsWith("painting") || startTex.startsWith("ct_") ||
							startTex === "pChain" || startTex === "bBookShelf" || startTex === "bBooks" ||
							startTex === "bChair1" || startTex === "bChair2" || startTex === "bSkulls" ||
							startTex === "bVase1" || startTex === "bVaseBroken1" ||
							startTex === "bVase2" || startTex === "bVaseBroken2" ||
							startTex === "bAcid" || startTex === "bBlood") {
							// 2x resolution sprite, but should fit the full tile
							overlayImg.setOrigin(0, 0).setScale(scale / 2);
						} else {
							overlayImg.setOrigin(0, 0).setScale(scale);
						}
						if (angleOverride) {
							overlayImg.setOrigin(0.5, 0.5);
							overlayImg.x += scaledTileSize / 2;
							overlayImg.y += scaledTileSize / 2;
							overlayImg.setAngle(angleOverride);
						}

						if (anim) {
							let ofIdx = 0;
							this.time.addEvent({
								delay: anim.duration * 1000,
								callback: () => {
									if (!overlayImg!.active) return;
									ofIdx = (ofIdx + 1) % anim.frames.length;
									const f = anim.frames[ofIdx];
									overlayImg!.setTexture(f.texture, f.id);
								},
								loop: true
							});
						}

						// If specifically tagged or key/door, bring to front
						if (tileData.keyId !== null || tileData.doorId !== null || tileData.forceCollider) {
							overlayImg.setDepth(5);
						}

						if (startTex === "chest" && chestSprite) {
							const cBody = chestSprite.body as Phaser.Physics.Arcade.Body;
							cBody.setSize(scaledTileSize, scaledTileSize);
							cBody.setOffset(0, 0);
							cBody.updateFromGameObject();
							chestSprite.setData("opened", false);
							chestSprite.setData("opening", false);
							chestSprite.setData("gridX", x);
							chestSprite.setData("gridY", y);
							this.navWalkable[y][x] = false;
						}

						overlayImgs.push(overlayImg);
					};

					if (tileData.overlayId !== null || tileData.overlayAnimation) {
						const startId = tileData.overlayAnimation ? tileData.overlayAnimation.frames[0].id : tileData.overlayId!;
						const startTex = tileData.overlayAnimation ? tileData.overlayAnimation.frames[0].texture : (tileData.overlayTexture || "dungeon_tileset");
						addOverlay(startTex, startId, tileData.overlayAnimation, tileData.overlayAngle);
					}
					if (tileData.overlayId2 !== null || tileData.overlayAnimation2) {
						const startId2 = tileData.overlayAnimation2 ? tileData.overlayAnimation2.frames[0].id : tileData.overlayId2!;
						const startTex2 = tileData.overlayAnimation2 ? tileData.overlayAnimation2.frames[0].texture : (tileData.overlayTexture2 || "dungeon_tileset");
						addOverlay(startTex2, startId2, tileData.overlayAnimation2, tileData.overlayAngle2);
					}

					if (tileData.keyId !== null || tileData.doorId !== null) {
						tile.setDepth(5);
					}

					// Logic Objects
					if (tileData.forceCollider) {
						const isSmallObj = tileData.texture === "bChair1" || tileData.texture === "bChair2" ||
							tileData.overlayTexture === "bChair1" || tileData.overlayTexture === "bChair2" ||
							tileData.overlayTexture2 === "bChair1" || tileData.overlayTexture2 === "bChair2" ||
							tileData.texture === "bVase1" || tileData.texture === "bVase2" ||
							tileData.overlayTexture === "bVase1" || tileData.overlayTexture === "bVase2" ||
							tileData.overlayTexture2 === "bVase1" || tileData.overlayTexture2 === "bVase2";

						if (isSmallObj) {
							// Smaller centered collider for chairs and vases
							const wall = this.walls.create(posX + scaledTileSize / 4, posY + scaledTileSize / 4, "dungeon_tileset");
							wall.setOrigin(0, 0).setDisplaySize(scaledTileSize / 2, scaledTileSize / 2);
							wall.setVisible(false);
							wall.refreshBody();
						} else {
							const wall = this.walls.create(posX, posY, "dungeon_tileset");
							wall.setOrigin(0, 0).setDisplaySize(scaledTileSize, scaledTileSize);
							wall.setVisible(false);
							wall.refreshBody();
						}
					}

					// Doors
					if (tileData.doorId !== null) {
						const door = this.doors.create(posX + scaledTileSize / 2, posY + scaledTileSize / 2, "dungeon_tileset");
						door.setVisible(false);
						door.setData("doorId", tileData.doorId);
						// Needed to update nav grid when the door is opened.
						door.setData("gridX", x);
						door.setData("gridY", y);
						const body = door.body as Phaser.Physics.Arcade.StaticBody;
						body.setSize(scaledTileSize / 3, scaledTileSize / 3);
						body.setOffset(scaledTileSize / 3, scaledTileSize / 3);
						// Store visual for destruction: Only overlay if it exists (keeps floor), else base tile.
						door.setData("visuals", overlayImgs.length ? overlayImgs : [tile]);
						door.refreshBody();
					}

					// Keys
					if (tileData.keyId !== null) {
						const keyObj = keys.create(posX + scaledTileSize / 2, posY + scaledTileSize / 2, "dungeon_tileset");
						keyObj.setVisible(false);
						keyObj.setCircle(scaledTileSize / 4);
						keyObj.setData("keyId", tileData.keyId);
						// Store visual for destruction: Only overlay if it exists (keeps floor), else base tile.
						keyObj.setData("visuals", overlayImgs.length ? overlayImgs : [tile]);
					}

					// If this tile is marked as visual-only (negative), skip physics generation
					if (tileData.rawId < 0) continue;

					// Dynamic Boundary Generation
					const wallThickness = 32;

					// Function to add a wall segment
					const addWall = (wx: number, wy: number, w: number, h: number) => {
						const wall = this.walls.create(wx, wy, "dungeon_tileset");
						wall.setOrigin(0, 0);
						wall.setDisplaySize(w, h);
						wall.refreshBody();
						wall.setVisible(false);
					};

					// Check neighbors and add walls
					// Top
					if (y === 0 || getTileData(mapLayout[y - 1] ? mapLayout[y - 1][x] : undefined).isVoid) {
						addWall(posX, posY - wallThickness, scaledTileSize, wallThickness);
					}
					// Bottom
					if (y === mapLayout.length - 1 || getTileData(mapLayout[y + 1] ? mapLayout[y + 1][x] : undefined).isVoid) {
						addWall(posX, posY + scaledTileSize, scaledTileSize, wallThickness);
					}
					// Left
					if (x === 0 || getTileData(mapLayout[y][x - 1]).isVoid) {
						addWall(posX - wallThickness, posY, wallThickness, scaledTileSize);
					}
					// Check Right
					if (x === mapLayout[y].length - 1 || getTileData(mapLayout[y][x + 1]).isVoid) {
						addWall(posX + scaledTileSize, posY, wallThickness, scaledTileSize);
					}
				}

				// Build spawn candidates: any walkable tile not in Room1 (spawn room).
				const room1Mask = this.buildConnectedMask(mainSpawnGridX, mainSpawnGridY);
				this.enemySpawnCandidates = this.buildSpawnCandidates(room1Mask);
			}
			// Room-specific spawn candidates (distribution by room).
			const room2 = this.buildSpawnCandidatesInRange(11, 17, 11, 17);
			const room3 = this.buildSpawnCandidatesInRange(11, 17, 0, 8);
			const room4 = this.buildSpawnCandidatesInRange(22, 28, 0, 8);
			const room5 = this.buildSpawnCandidatesInRange(22, 28, 11, 17);
			this.enemySpawnByType = {
				rat: room2,
				stinger: room2,
				skeleton: room3,
				beholder: room4,
				golem: room5
			};
			this.roomSpawnCandidates = {
				2: room2,
				3: room3,
				4: room4,
				5: room5
			};

			// Create Player (Sprite)
			const useTutorialStart = this.mapMode === "tutorial" && hasTutorialSpawn;
			this.mainSpawnX = mainSpawnX;
			this.mainSpawnY = mainSpawnY;
			const spawnX = useTutorialStart ? tutorialSpawnX : mainSpawnX;
			const spawnY = useTutorialStart ? tutorialSpawnY : mainSpawnY;
			this.player = this.add.sprite(spawnX, spawnY, "player_idle");
			this.player.setScale(scale); // Same scale as map tiles
			this.player.setDepth(10);
			this.physics.add.existing(this.player);
			if (this.mapMode === "tutorial") {
				const tutorialMessages = [
					"Use your joystick to move and get to the next room!",
					"Use your Hit button on the right to attack enemies!",
					"Open the chests to get buffs and character upgrades!",
					"Collect the character-change icon in the center!",
					"Collect the skill icon to unlock your power!",
					"Defeat all enemies to complete the tutorial!"
				];
				this.tutorialObjectiveTexts = tutorialMessages.map((message, idx) => {
					const text = this.add.text(
						tutorialRoomCenterXs[idx],
						tutorialFirstRoomTopY + scaledTileSize * 0.8,
						message,
						{
							fontFamily: "'Press Start 2P', monospace",
							fontSize: "16px",
							color: "#fff3c4",
							stroke: "#000000",
							strokeThickness: 6,
							align: "center",
							wordWrap: { width: scaledTileSize * 7, useAdvancedWrap: true }
						}
					);
					text.setOrigin(0.5, 0.5);
					text.setDepth(40);
					return text;
				});
				this.tutorialStep = 1;
				this.refreshTutorialObjectiveTextStyles();
			}

			// Physics Body adjustments
			const pBody = this.player.body as Phaser.Physics.Arcade.Body;
			pBody.setSize(10, 10);
			pBody.setOffset(4, 10);

			// UI Hearts (top-left)
			this.playerMaxHp = this.knightMaxHp;
			this.playerHp = this.playerMaxHp;
			const heartSize = 84;
			const heartPad = 0;
			for (let i = 0; i < this.playerMaxHp; i++) {
				const heart = this.add.image(this.uiInsetX + i * (heartSize + heartPad), this.uiInsetY, "ui_heart");
				heart.setOrigin(0, 0);
				heart.setScrollFactor(0);
				heart.setDepth(50);
				heart.setDisplaySize(heartSize, heartSize);
				heart.setAlpha(0); // Start hidden for main menu
				this.heartIcons.push(heart);
			}
			this.knightFeature3Icon = this.add.image(this.uiInsetX + 26, this.uiInsetY + heartSize + 10, "icons2x", 15);
			this.knightFeature3Icon.setOrigin(0.5, 0);
			this.knightFeature3Icon.setScrollFactor(0);
			this.knightFeature3Icon.setDepth(50);
			this.knightFeature3Icon.setDisplaySize(34, 34);
			this.knightFeature3Icon.setAlpha(0);
			this.knightFeature3CountText = this.add.text(this.uiInsetX + 52, this.uiInsetY + heartSize + 18, "", {
				fontFamily: "'Press Start 2P', monospace",
				fontSize: "14px",
				color: "#f6d365",
				stroke: "#000000",
				strokeThickness: 3
			});
			this.knightFeature3CountText.setOrigin(0, 0);
			this.knightFeature3CountText.setScrollFactor(0);
			this.knightFeature3CountText.setDepth(50);
			this.knightFeature3CountText.setAlpha(0);
			this.updateHearts();

			// Score (top-right)
			const topRightUiX = this.getTopRightUiX();
			this.scoreText = this.add.text(topRightUiX, this.uiInsetY - 8, "Score: 0", {
				fontFamily: "monospace",
				fontSize: "33px",
				color: "#ffffff",
				stroke: "#000000",
				strokeThickness: 6
			});
			this.scoreText.setOrigin(1, 0);
			this.scoreText.setScrollFactor(0);
			this.scoreText.setDepth(50);
			this.scoreText.setAlpha(0); // Start hidden for main menu

			const levelUi = this.getLevelUiPosition();
			this.levelText = this.add.text(levelUi.x, levelUi.y, "Lv.1  XP 0/25", {
				fontFamily: "'Press Start 2P', monospace",
				fontSize: "20px",
				color: "#ffe08a",
				stroke: "#000000",
				strokeThickness: 6
			});
			this.levelText.setOrigin(0.5, 0);
			this.levelText.setScrollFactor(0);
			this.levelText.setDepth(50);
			this.levelText.setAlpha(0); // Start hidden for main menu
			this.updateLevelUI();

			// Wave status text (top center)
			// Wave status text (top center)
			// Wave status text (top center)
			this.waveStatusText = this.add.text(this.scale.width / 2, this.scale.height * 0.3, "", {
				fontFamily: "'Press Start 2P', monospace",
				fontSize: "32px",
				color: "#ffffff",
				stroke: "#000000",
				strokeThickness: 8,
				align: "center"
			});
			this.waveStatusText.setOrigin(0.5, 0.5);
			this.waveStatusText.setScrollFactor(0);
			this.waveStatusText.setDepth(200);
			this.waveStatusText.setAlpha(0);
			this.waveStatusText.setShadow(4, 4, "#000000", 0, false, true);

			// Pause icon (top-right, below score)
			this.pauseBtn = this.add.image(topRightUiX, this.uiInsetY + 44, "icons2x", 21);
			this.pauseBtn.setOrigin(1, 0);
			this.pauseBtn.setScrollFactor(0);
			this.pauseBtn.setDepth(50);
			this.pauseBtn.setDisplaySize(90, 90);
			this.pauseBtn.setAlpha(0); // Start hidden for main menu
			this.pauseBtn.setInteractive({ useHandCursor: true });
			this.pauseBtn.on("pointerdown", () => {
				if (this.mobileControlsEnabled) return;
				this.triggerHaptic("light");
				this.togglePause();
			});
			this.skillsInfoBtn = this.add.image(topRightUiX - 104, this.uiInsetY + 56, "icons2x", 7);
			this.skillsInfoBtn.setOrigin(1, 0);
			this.skillsInfoBtn.setScrollFactor(0);
			this.skillsInfoBtn.setDepth(50);
			this.skillsInfoBtn.setDisplaySize(66, 66);
			this.skillsInfoBtn.setAlpha(0);
			this.skillsInfoBtn.setInteractive({ useHandCursor: true });
			this.skillsInfoBtn.on("pointerdown", () => {
				if (this.mobileControlsEnabled || this.isMainMenu || this.isGameOver || this.characterSelectActive) return;
				if (this.isPaused && !this.skillsInfoActive) return;
				this.triggerHaptic("light");
				this.toggleSkillsInfoMenu();
			});

			this.setupDOMUI();
			this.createMobileControls();
			this.scale.on("resize", () => {
				this.layoutMobileControls();
				const resizedTopRightUiX = this.getTopRightUiX();
				if (this.scoreText?.active) {
					this.scoreText.setPosition(resizedTopRightUiX, this.uiInsetY - 8);
				}
				if (this.pauseBtn?.active) {
					this.pauseBtn.setPosition(resizedTopRightUiX, this.uiInsetY + 44);
				}
				if (this.skillsInfoBtn?.active) {
					this.skillsInfoBtn.setPosition(resizedTopRightUiX - 104, this.uiInsetY + 56);
				}
				if (this.levelText?.active) {
					const levelUiPos = this.getLevelUiPosition();
					this.levelText.setPosition(levelUiPos.x, levelUiPos.y);
				}
				if (this.characterSelectActive) {
					this.showCharacterSelectMenu();
				}
				if (this.skillsInfoActive) {
					this.updateSkillsInfoMenuContent();
				}
			});

			// Pause hotkey
			this.input.keyboard!.on("keydown-ESC", () => {
				if (this.skillsInfoActive) {
					this.closeSkillsInfoMenu(true);
					return;
				}
				this.togglePause();
			});

			// Animations
			this.anims.create({
				key: 'player-idle',
				frames: this.anims.generateFrameNumbers('player_idle', { start: 0, end: 11 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: 'player-walk',
				frames: this.anims.generateFrameNumbers('player_walk', { start: 0, end: 9 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: 'player-attack',
				frames: this.anims.generateFrameNumbers('player_attack', { start: 0, end: 5 }),
				frameRate: 15,
				repeat: 0
			});

			this.anims.create({
				key: 'mage-idle',
				frames: this.anims.generateFrameNumbers('mage_idle', { start: 0, end: 11 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: 'mage-walk',
				frames: this.anims.generateFrameNumbers('mage_walk', { start: 0, end: 4 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: 'mage-attack',
				frames: this.anims.generateFrameNumbers('mage_attack', { start: 0, end: 11 }),
				frameRate: 15,
				repeat: 0
			});

			this.anims.create({
				key: "mage-cast",
				frames: this.anims.generateFrameNumbers("mage_fireball", { start: 0, end: 5 }),
				frameRate: 12,
				repeat: 0
			});

			this.anims.create({
				key: "archer-idle",
				frames: this.anims.generateFrameNumbers("archer_idle", { start: 0, end: 11 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: "archer-walk",
				frames: this.anims.generateFrameNumbers("archer_walk", { start: 0, end: 9 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: "archer-attack",
				frames: this.anims.generateFrameNumbers("archer_attack", { start: 0, end: 9 }),
				frameRate: 15,
				repeat: 0
			});

			this.anims.create({
				key: "archer-arrow",
				frames: this.anims.generateFrameNumbers("archer_arrow", { start: 0, end: 5 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: "rogue-idle",
				frames: this.anims.generateFrameNumbers("rogue_idle", { start: 0, end: 5 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: "rogue-walk",
				frames: this.anims.generateFrameNumbers("rogue_walk", { start: 0, end: 9 }),
				frameRate: 12,
				repeat: -1
			});

			this.anims.create({
				key: "rogue-attack",
				frames: this.anims.generateFrameNumbers("rogue_attack", { start: 0, end: 7 }),
				frameRate: 15,
				repeat: 0
			});

			this.player.play('player-idle');

			if (!this.anims.exists("chest-open")) {
				this.anims.create({
					key: "chest-open",
					frames: this.anims.generateFrameNumbers("chest", { start: 0, end: 5 }),
					frameRate: 12,
					repeat: 0
				});
			}

			// Listen for attack animation completion
			this.player.on('animationcomplete-player-attack', () => {
				this.isAttacking = false;
			});
			this.player.on('animationcomplete-mage-attack', () => {
				this.isAttacking = false;
			});
			this.player.on('animationcomplete-archer-attack', () => {
				this.isAttacking = false;
			});
			this.player.on('animationcomplete-rogue-attack', () => {
				this.isAttacking = false;
			});

			this.setActiveCharacter(this.activeCharacter, true);

			this.physics.add.collider(this.mageFireballs, this.walls, (_fb, _wall) => {
				const fireball = _fb as Phaser.Physics.Arcade.Image;
				if (!this.canFireballCollide(fireball)) return;
				this.destroyMageFireball(fireball);
			});
			this.physics.add.collider(this.mageFireballs, this.doors, (_fb, _door) => {
				const fireball = _fb as Phaser.Physics.Arcade.Image;
				if (!this.canFireballCollide(fireball)) return;
				this.destroyMageFireball(fireball);
			});
			this.physics.add.overlap(this.mageFireballs, this.enemies, (_fb, enemyObj) => {
				const fireball = _fb as Phaser.Physics.Arcade.Image;
				if (!fireball.active || !this.canFireballCollide(fireball)) return;
				this.handleMageFireballEnemyHit(fireball, enemyObj as Phaser.Physics.Arcade.Sprite);
			});
			this.physics.add.overlap(this.mageFireballs, this.chests, (_fb, chestObj) => {
				const fireball = _fb as Phaser.Physics.Arcade.Image;
				if (!fireball.active) return;
				this.openChest(chestObj as Phaser.Physics.Arcade.Sprite);
				this.destroyMageFireball(fireball);
			});

			this.physics.add.collider(this.archerArrows, this.walls, (_fb, _wall) => {
				const arrow = _fb as Phaser.Physics.Arcade.Image;
				this.handleArcherArrowObstacleCollision(arrow);
			});
			this.physics.add.collider(this.archerArrows, this.doors, (_fb, _door) => {
				const arrow = _fb as Phaser.Physics.Arcade.Image;
				this.handleArcherArrowObstacleCollision(arrow);
			});
			this.physics.add.collider(this.archerCompanionProjectiles, this.walls, (_projObj, _wall) => {
				const projectile = _projObj as Phaser.Physics.Arcade.Image;
				if (!this.canFireballCollide(projectile)) return;
				this.destroyArcherCompanionProjectile(projectile);
			});
			this.physics.add.collider(this.archerCompanionProjectiles, this.doors, (_projObj, _door) => {
				const projectile = _projObj as Phaser.Physics.Arcade.Image;
				if (!this.canFireballCollide(projectile)) return;
				this.destroyArcherCompanionProjectile(projectile);
			});
			this.physics.add.collider(this.knightSlashWaves, this.walls, (_waveObj, _wall) => {
				const wave = _waveObj as Phaser.Physics.Arcade.Image;
				if (!this.canFireballCollide(wave)) return;
				this.destroyKnightSlashWave(wave);
			});
			this.physics.add.collider(this.knightSlashWaves, this.doors, (_waveObj, _door) => {
				const wave = _waveObj as Phaser.Physics.Arcade.Image;
				if (!this.canFireballCollide(wave)) return;
				this.destroyKnightSlashWave(wave);
			});
			this.physics.add.overlap(this.knightSlashWaves, this.enemies, (_waveObj, enemyObj) => {
				const wave = _waveObj as Phaser.Physics.Arcade.Image;
				if (!wave.active || !this.canFireballCollide(wave)) return;
				const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
				let hitEnemies = wave.getData("hitEnemies") as Set<Phaser.Physics.Arcade.Sprite> | undefined;
				if (!hitEnemies) {
					hitEnemies = new Set();
					wave.setData("hitEnemies", hitEnemies);
				}
				if (hitEnemies.has(enemy)) return;
				hitEnemies.add(enemy);
				const dealt = this.damageEnemy(
					enemy,
					this.damageMultiplier * this.knightPowerSlashDamageMultiplier
				);
				if (dealt) this.handleKnightFeature2VampiricHit();
				this.createKnightWaveHitEffect(enemy.x, enemy.y);
			});
			this.physics.add.overlap(this.knightSlashWaves, this.chests, (_waveObj, chestObj) => {
				const wave = _waveObj as Phaser.Physics.Arcade.Image;
				if (!wave.active || !this.canFireballCollide(wave)) return;
				this.openChest(chestObj as Phaser.Physics.Arcade.Sprite);
			});

			// Physics Collider
			this.physics.add.collider(this.player, this.walls);
			this.physics.add.collider(this.player, this.chests);

			// Door Collisions
			this.physics.add.collider(this.player, this.doors, (_player, door) => {
				const d = door as Phaser.Physics.Arcade.Image;
				const doorId = d.getData("doorId");
				if (this.collectedKeys.has(doorId)) {
					this.playFx("openDoor", { volume: 0.7 });
					this.triggerHaptic("light");
					// Door is gone -> mark tile as walkable for rat pathfinding.
					const gx = d.getData("gridX");
					const gy = d.getData("gridY");
					if (typeof gx === "number" && typeof gy === "number") {
						if (this.navWalkable?.[gy] && this.navWalkable[gy][gx] === false) {
							this.navWalkable[gy][gx] = true;
						}
					}
					// Start waves 3 seconds after Room1 door opens.
					if (doorId === 1 && !this.waveStarted) {
						this.waveStarted = true;
						this.time.delayedCall(3000, () => this.startWave(1));
					}

					const visuals = d.getData("visuals");
					if (visuals) {
						visuals.forEach((v: any) => {
							if (v && v.active) {
								this.createPuffEffect(v.x + (v.displayWidth || 0) / 2, v.y + (v.displayHeight || 0) / 2, 2, 30);
								v.destroy();
							}
						});
					}
					d.destroy(); // Open Door
				}
			});

			// Key Collection
			this.physics.add.overlap(this.player, keys, (_player, key) => {
				const k = key as Phaser.Physics.Arcade.Image;
				const keyId = k.getData("keyId");
				if (!this.collectedKeys.has(keyId)) {
					this.collectedKeys.add(keyId);
					this.playFx("getKey", { volume: 0.7 });
					this.triggerHaptic("light");
					const visuals = k.getData("visuals");
					if (visuals) {
						visuals.forEach((v: any) => {
							if (v && v.active) {
								this.createPuffEffect(v.x + (v.displayWidth || 0) / 2, v.y + (v.displayHeight || 0) / 2, 1, 15);
								v.destroy();
							}
						});
					}
					k.destroy();
				}
			});

			// Loot icon pickup (play key sound and puff, then remove)
			this.physics.add.overlap(this.player, this.lootIcons, (_player, iconObj) => {
				const icon = iconObj as Phaser.Physics.Arcade.Image;
				if (!icon.active) return;
				const iconType = icon.getData("iconType");
				let unlockedSkillLabel: string | null = null;
				if (iconType === 3) {
					const healAmount = icon.getData("healAmount") as number | undefined;
					if (typeof healAmount === "number") {
						this.playerHp = Math.min(this.playerMaxHp, this.playerHp + Math.max(0, healAmount));
					} else {
						this.playerHp = this.playerMaxHp;
					}
					this.updateHearts();
				} else if (iconType === 2) {
					if (this.activeCharacter === "rogue") {
						unlockedSkillLabel = this.upgradeRogueFeatureFromSpecialIcon();
					}
				} else if (iconType === 5) {
					if (this.activeCharacter === "mage") {
						unlockedSkillLabel = this.upgradeMageFeatureFromSpecialIcon();
					}
				} else if (iconType === 6) {
					if (this.activeCharacter === "archer") {
						unlockedSkillLabel = this.upgradeArcherFeatureFromSpecialIcon();
					}
				} else if (iconType === 7) {
					if (this.activeCharacter === "knight") {
						unlockedSkillLabel = this.upgradeKnightFeatureFromSpecialIcon();
					}
				} else if (iconType === 8) {
					this.openCharacterSelectMenu();
				} else if (iconType === 15) {
					this.activateShield(3);
				}
				const tutorialRewardStep = icon.getData("tutorialRewardStep") as number | undefined;
				if (typeof tutorialRewardStep === "number") {
					this.markTutorialRewardCollected(tutorialRewardStep, unlockedSkillLabel);
				}
				const tutorialAura = icon.getData("tutorialRewardAura") as Phaser.GameObjects.GameObject | undefined;
				if (tutorialAura && tutorialAura.active) {
					tutorialAura.destroy();
				}
				if (this.tutorialSkillIcon === icon) {
					this.tutorialSkillIcon = undefined;
				}
				this.playFx("getKey", { volume: 0.7 });
				this.createPuffEffect(icon.x, icon.y, 1, 15);
				icon.destroy();
			});

			// Enemy animations
			for (const [enemyType, cfg] of Object.entries(this.enemyConfigs)) {
				const idleKey = `${enemyType}-idle`;
				const atkKey = `${enemyType}-attack`;
				const dyingKey = `${enemyType}-dying`;

				if (!this.anims.exists(idleKey)) {
					this.anims.create({
						key: idleKey,
						frames: this.anims.generateFrameNumbers(cfg.tex.idle, { start: 0, end: cfg.frames.idle - 1 }),
						frameRate: 12,
						repeat: -1
					});
				}
				if (!this.anims.exists(atkKey)) {
					this.anims.create({
						key: atkKey,
						frames: this.anims.generateFrameNumbers(cfg.tex.attack, { start: 0, end: cfg.frames.attack - 1 }),
						frameRate: 12,
						repeat: 0
					});
				}
				if (!this.anims.exists(dyingKey)) {
					this.anims.create({
						key: dyingKey,
						frames: this.anims.generateFrameNumbers(cfg.tex.dying, { start: 0, end: cfg.frames.dying - 1 }),
						frameRate: 12,
						repeat: 0
					});
				}
			}
			if (this.mapMode === "tutorial") {
				this.setupTutorialScenario();
			}

			// Normal enemy spawns (no Room1 spawns)
			const mobsEnabled = false;
			if (mobsEnabled) {
				this.enemySpawnOrder = ["rat", "stinger", "skeleton", "beholder", "golem"];
				this.enemySpawnIndex = 0;

				// Spawn one of each enemy immediately for testing
				this.enemySpawnOrder.forEach((type) => this.spawnEnemyAtRandom(type));

				// Then keep spawning every 10 seconds in a round-robin cycle
				this.time.addEvent({
					delay: 10000,
					loop: true,
					callback: () => this.spawnNextEnemy()
				});
			}

			// Camera will be set up in startGame() interaction
			// this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

			// Deadzone: Camera won't move while player is inside this central rectangle
			// We set it to roughly 25% of the screen size to get that "move a bit before follow" feel
			const dw = this.scale.width * 0.3;
			const dh = this.scale.height * 0.3;
			this.cameras.main.setDeadzone(dw, dh);

			// Text-mode state for automated tests / debugging.
			// Keep this payload small and focused on interactive entities.
			(window as any).render_game_to_text = () => {
				const pb = this.player?.body as Phaser.Physics.Arcade.Body | undefined;
				let enemies: Phaser.Physics.Arcade.Sprite[] = [];
				try {
					const rawEnemies = this.enemies?.getChildren?.() ?? [];
					enemies = rawEnemies.filter((c) => (c as any).active) as Phaser.Physics.Arcade.Sprite[];
				} catch {
					enemies = [];
				}
				return JSON.stringify({
					scene: "Level",
					coordinate_system: "origin top-left, x right, y down",
					player: this.player ? {
						x: Math.round(this.player.x),
						y: Math.round(this.player.y),
						vx: pb ? Math.round(pb.velocity.x) : 0,
						vy: pb ? Math.round(pb.velocity.y) : 0,
						flipX: this.player.flipX,
						character: this.activeCharacter,
						hp: this.playerHp,
						maxHp: this.playerMaxHp,
						level: this.playerLevel,
						exp: this.playerExp,
						expToNext: this.playerExpToNextLevel
					} : null,
					ui: {
						paused: this.isPaused,
						mainMenu: this.isMainMenu,
						gameOver: this.isGameOver,
						characterSelect: this.characterSelectActive,
						skillsInfo: this.skillsInfoActive,
						mapMode: this.mapMode
					},
					score: this.score,
					enemies: enemies.map((e) => ({
						type: e.getData("type") || "unknown",
						x: Math.round(e.x),
						y: Math.round(e.y),
						state: e.getData("state") || "unknown"
					})),
					collectedKeys: Array.from(this.collectedKeys).sort((a, b) => a - b)
				});
			};
			if (autoStartFromData) {
				this.time.delayedCall(20, () => {
					if (!this.scene.isActive(this.scene.key)) return;
					if (this.isMainMenu) {
						this.startGame();
					}
				});
			}

		} else {
			this.add.text(10, 10, "Tileset NOT Loaded!", { fontSize: '20px', color: '#ff0000' });
		}
	}

	update() {
		if (!this.player || !this.player.body) return;

		let speed = this.getCurrentMoveSpeed();
		if (this.damageMultiplier > 1) speed *= 1.2;
		const body = this.player.body as Phaser.Physics.Arcade.Body;

		const currentTime = this.time.now;
		if (this.isPaused || this.isGameOver || this.isMainMenu) {
			body.setVelocity(0);
			return;
		}
		this.updateKnightFeature3GoldenShield(currentTime);
		this.updateKnightFeature4FireAura(currentTime);
		this.updateKnightFeature5GroundSpikes(currentTime);
		if (Phaser.Input.Keyboard.JustDown(this.keyOne)) {
			this.setActiveCharacter("knight");
		} else if (Phaser.Input.Keyboard.JustDown(this.keyTwo)) {
			this.setActiveCharacter("mage");
		} else if (Phaser.Input.Keyboard.JustDown(this.keyThree)) {
			this.setActiveCharacter("archer");
		} else if (Phaser.Input.Keyboard.JustDown(this.keyFour)) {
			this.setActiveCharacter("rogue");
		}
		this.updateWaveSystem();
		this.updateTutorialFlow();
		const inKnockback = currentTime < this.playerKnockbackUntil;

		if (!inKnockback) {
			body.setVelocity(0);
		}

		let moveX = 0;
		let moveY = 0;
		if (this.wasd.W.isDown || this.cursors.up.isDown) moveY -= 1;
		if (this.wasd.S.isDown || this.cursors.down.isDown) moveY += 1;
		if (this.wasd.A.isDown || this.cursors.left.isDown) moveX -= 1;
		if (this.wasd.D.isDown || this.cursors.right.isDown) moveX += 1;
		if (this.mobileControlsEnabled) {
			moveX += this.mobileMoveVector.x;
			moveY += this.mobileMoveVector.y;
		}
		if (moveX < -0.01) {
			this.playerFacingDir = -1;
		} else if (moveX > 0.01) {
			this.playerFacingDir = 1;
		}
		if (!inKnockback) {
			const move = new Phaser.Math.Vector2(moveX, moveY);
			if (move.lengthSq() > 0.0001) {
				move.normalize().scale(speed);
				body.setVelocity(move.x, move.y);
			}
		}

		// Handle Player Animations
		const isMage = this.activeCharacter === "mage";
		const isArcher = this.activeCharacter === "archer";
		const isRogue = this.activeCharacter === "rogue";
		const baseScale = isMage || isArcher ? 2 : 4;
		const idleKey = isMage ? "mage-idle" : isArcher ? "archer-idle" : isRogue ? "rogue-idle" : "player-idle";
		const walkKey = isMage ? "mage-walk" : isArcher ? "archer-walk" : isRogue ? "rogue-walk" : "player-walk";
		const attackKey = isMage ? "mage-attack" : isArcher ? "archer-attack" : isRogue ? "rogue-attack" : "player-attack";
		const pBody = body;
		// Check for Attack Input
		const attackCooldown = this.getCurrentAttackCooldownMs();
		const keyboardAttackPressed = Phaser.Input.Keyboard.JustDown(this.spaceKey);
		const mobileAttackPressed = this.mobileControlsEnabled && this.mobileFireHeld;
		if ((keyboardAttackPressed || mobileAttackPressed) && !this.isAttacking && currentTime - this.lastAttackTime > attackCooldown) {
			if (mobileAttackPressed) {
				this.animateMobileFireButton();
			}
			this.isAttacking = true;
			this.lastAttackTime = currentTime;
			this.player.play(attackKey);
			if (isMage) {
				this.applyPlayerBody("attack");
				this.startMageCast();
				if (this.chests) {
					const chestHit = this.findChestHit(this.player.x, this.player.y);
					if (chestHit) {
						this.openChest(chestHit);
					}
				}
			} else if (isArcher) {
				this.applyPlayerBody("attack");
				this.startArcherCast();
				if (this.chests) {
					const chestHit = this.findChestHit(this.player.x, this.player.y);
					if (chestHit) {
						this.openChest(chestHit);
					}
				}
			} else if (isRogue) {
				this.applyPlayerBody("attack");
				this.time.delayedCall(300, () => {
					if (this.isAttacking) this.doPlayerAttackHit();
				});
			} else {
				this.applyPlayerBody("attack");
				// Deal damage around 75% of the swing so direction changes are respected.
				this.time.delayedCall(300, () => {
					if (this.isAttacking) this.doPlayerAttackHit();
				});
			}
		}

		if (this.isAttacking) {
			// Stay in attack animation, don't switch to walk/idle
		} else if (body.velocity.x !== 0 || body.velocity.y !== 0) {
			if (this.player.anims.currentAnim?.key !== walkKey) {
				this.player.play(walkKey);
				if (isMage || isArcher || isRogue) {
					this.applyPlayerBody("move");
				} else {
					this.applyPlayerBody("move");
				}
			}
		} else {
			if (this.player.anims.currentAnim?.key !== idleKey) {
				this.player.play(idleKey);
				if (isMage || isArcher || isRogue) {
					this.applyPlayerBody("idle");
				} else {
					this.applyPlayerBody("idle");
				}
			}
		}

		// Flip Sprite based on movement
		if (body.velocity.x < 0) {
			this.player.flipX = true;
			this.playerFacingDir = -1;
		} else if (body.velocity.x > 0) {
			this.player.flipX = false;
			this.playerFacingDir = 1;
		}

		// Normalize diagonal movement speed
		if (body.velocity.x !== 0 && body.velocity.y !== 0) {
			body.velocity.normalize().scale(speed);
		}

		// Trail effect while buffs are active, plus a lighter rogue clone trail.
		if ((this.damageMultiplier > 1 || this.wizardActive || isRogue) && this.player) {
			const now = this.time.now;
			const trailInterval = isRogue ? 90 : 60;
			if (now - this.lastTrailTime >= trailInterval) {
				this.lastTrailTime = now;
				const frame = this.player.frame.name as number | string;
				const ghost = this.add.image(this.player.x, this.player.y, this.player.texture.key, frame);
				ghost.setScale(this.player.scaleX, this.player.scaleY);
				ghost.setFlipX(this.player.flipX);
				ghost.setDepth(this.player.depth - 1);
				ghost.setAlpha(isRogue ? 0.28 : 0.6);
				if (this.wizardActive && !isRogue) {
					ghost.setTint(0x55ccff);
				}
				this.trailSprites.add(ghost);
				this.tweens.add({
					targets: ghost,
					alpha: 0,
					duration: isRogue ? 220 : 300,
					onComplete: () => {
						ghost.destroy();
					}
				});
			}
		}

		this.updateMageCasting();
		this.updateMageFireballs();
		this.updateMageFeatureZones();
		this.updateArcherCasting();
		this.updateArcherArrows();
		this.updateArcherCompanions();
		this.updateArcherCompanionProjectiles();
		this.updateKnightPowerSlashWaves();

		this.updateEnemies();

		if (this.shieldBubble && this.player) {
			this.shieldBubble.setPosition(this.player.x, this.player.y);
		}
		this.syncKnightFeature3Bubble();
		this.syncKnightFeature4Aura();
		this.syncKnightFeature5Spikes();

		// Fog of War & Lighting effect
		const playerReveal = 180; // Extended vision for player
		const playerDark = 450;
		const torchReveal = 175;
		const torchDark = 300;

		// Filter out destroyed tiles
		this.mapTiles = this.mapTiles.filter(t => t.active && t.scene);

		this.mapTiles.forEach(tile => {
			if ((tile as any).getData && (tile as any).getData("ignoreLighting")) return;
			const tx = tile.x + (tile.displayWidth || 0) / 2;
			const ty = tile.y + (tile.displayHeight || 0) / 2;

			// Player light contribution
			const playerDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, tx, ty);
			let playerAlpha = 0;
			if (playerDist < playerReveal) playerAlpha = 1;
			else if (playerDist < playerDark) playerAlpha = 1 - (playerDist - playerReveal) / (playerDark - playerReveal);

			// Torch light contribution
			let maxTorchAlpha = 0;
			this.torchPositions.forEach(torch => {
				const torchDist = Phaser.Math.Distance.Between(torch.x, torch.y, tx, ty);
				let torchAlpha = 0;
				if (torchDist < torchReveal) torchAlpha = 1;
				else if (torchDist < torchDark) torchAlpha = 1 - (torchDist - torchReveal) / (torchDark - torchReveal);

				if (torchAlpha > maxTorchAlpha) maxTorchAlpha = torchAlpha;
			});

			// Final brightness is the max of player light and all torch lights
			// Final brightness is the max of player light and all torch lights
			const targetAlpha = Math.max(playerAlpha, maxTorchAlpha);

			// Smoothly lerp current alpha to target alpha
			// If tile has no current 'displayAlpha', init it
			// If main menu is active or just started, snap to visible
			let currentAlpha = (tile as any).displayAlpha ?? targetAlpha;
			if (this.isMainMenu) {
				currentAlpha = 1; // Start fully lit in menu
			}

			const newAlpha = this.isMainMenu ? 1 : Phaser.Math.Linear(currentAlpha, targetAlpha, 0.1);
			(tile as any).displayAlpha = newAlpha;

			tile.setAlpha(newAlpha);

			// Apply warm orange tint based on torch influence
			if (maxTorchAlpha > 0) {
				// Interpolate between white (player light) and a very subtle cream/orange (torch light)
				// fff2e6 is a very light, subtle warm white
				const tintColor = Phaser.Display.Color.Interpolate.ColorWithColor(
					Phaser.Display.Color.ValueToColor(0xffffff),
					Phaser.Display.Color.ValueToColor(0xfff2e6),
					100,
					maxTorchAlpha * 100
				);
				tile.setTint(Phaser.Display.Color.GetColor(tintColor.r, tintColor.g, tintColor.b));
			} else {
				tile.clearTint();
			}
		});

		const getLightAlpha = (x: number, y: number) => {
			const playerDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
			let playerAlpha = 0;
			if (playerDist < playerReveal) playerAlpha = 1;
			else if (playerDist < playerDark) playerAlpha = 1 - (playerDist - playerReveal) / (playerDark - playerReveal);

			let maxTorchAlpha = 0;
			this.torchPositions.forEach(torch => {
				const torchDist = Phaser.Math.Distance.Between(torch.x, torch.y, x, y);
				let torchAlpha = 0;
				if (torchDist < torchReveal) torchAlpha = 1;
				else if (torchDist < torchDark) torchAlpha = 1 - (torchDist - torchReveal) / (torchDark - torchReveal);
				if (torchAlpha > maxTorchAlpha) maxTorchAlpha = torchAlpha;
			});
			return Math.max(playerAlpha, maxTorchAlpha);
		};

		// Apply lighting to enemies so shadows appear on top of them
		if (this.enemies) {
			this.enemies.getChildren().forEach((c) => {
				const e = c as Phaser.Physics.Arcade.Sprite;
				if (!e.active) return;
				const targetAlpha = getLightAlpha(e.x, e.y);
				let currentAlpha = (e as any).displayAlpha ?? targetAlpha;

				if (this.isMainMenu) {
					currentAlpha = 1;
				}

				const newAlpha = this.isMainMenu ? 1 : Phaser.Math.Linear(currentAlpha, targetAlpha, 0.1);
				(e as any).displayAlpha = newAlpha;
				e.setAlpha(newAlpha);
			});
		}
	}

	private spawnEnemyIfClear(type: string, x: number, y: number) {
		if (!this.enemies) return false;
		if (!this.enemyConfigs[type]) return false;

		const minDist = this.scaledTileSize * 0.5;
		const hasNearbyEnemy = this.enemies.getChildren().some((c) => {
			const e = c as Phaser.Physics.Arcade.Sprite;
			return e.active && Phaser.Math.Distance.Between(e.x, e.y, x, y) < minDist;
		});
		if (hasNearbyEnemy) return false;

		const minPlayerDist = this.scaledTileSize * 2;
		if (this.player && Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < minPlayerDist) return false;
		if (this.isEnemySpawnBlocked(type, x, y)) return false;

		this.spawnEnemy(type, x, y);
		return true;
	}

	private spawnEnemyAtRandom(type: string) {
		const candidates = this.enemySpawnByType[type] ?? this.enemySpawnCandidates;
		if (!candidates || candidates.length === 0) return;
		const attempts = 25;
		for (let i = 0; i < attempts; i++) {
			const pick = Phaser.Utils.Array.GetRandom(candidates);
			if (!pick) continue;
			if (this.spawnEnemyIfClear(type, pick.x, pick.y)) {
				return;
			}
		}
	}

	private spawnNextEnemy() {
		if (!this.enemySpawnOrder || this.enemySpawnOrder.length === 0) return;
		const type = this.enemySpawnOrder[this.enemySpawnIndex % this.enemySpawnOrder.length];
		this.enemySpawnIndex += 1;
		this.spawnEnemyAtRandom(type);
	}

	private getRoomTypes(roomId: number): string[] {
		switch (roomId) {
			case 2:
				return ["rat", "stinger"];
			case 3:
				return ["skeleton"];
			case 4:
				return ["beholder"];
			case 5:
				return ["golem"];
			default:
				return [];
		}
	}

	private getRoomIdForTile(tx: number, ty: number): number | null {
		if (tx >= 11 && tx <= 17 && ty >= 11 && ty <= 17) return 2;
		if (tx >= 11 && tx <= 17 && ty >= 0 && ty <= 8) return 3;
		if (tx >= 22 && tx <= 28 && ty >= 0 && ty <= 8) return 4;
		if (tx >= 22 && tx <= 28 && ty >= 11 && ty <= 17) return 5;
		return null;
	}

	private getWaveIntervalMs(roomId: number, wave: number): number {
		const types = this.getRoomTypes(roomId);
		const base = types.length > 1 ? 2000 : 4000;
		const reduced = base - Math.floor((wave - 1) / 2) * 1000;
		return Math.max(1500, reduced);
	}

	private resetChestsForWave() {
		if (!this.chests) return;
		this.chests.getChildren().forEach((c) => {
			const chest = c as Phaser.Physics.Arcade.Sprite;
			if (!chest.active) return;
			chest.setFrame(0);
			chest.setData("opened", false);
			chest.setData("opening", false);
		});
	}



	private spawnLootIcon(
		x: number,
		y: number,
		iconType: number,
		healAmount?: number,
		ownerCharacter?: "knight" | "mage" | "archer" | "rogue",
		isCharacterSpecial: boolean = false
	) {
		const iconFrame = iconType - 1;
		const icon = this.physics.add.image(x, y, "icons2x", iconFrame);
		icon.setDepth(12);
		icon.setDisplaySize(this.scaledTileSize * 0.6, this.scaledTileSize * 0.6);
		icon.body.setAllowGravity(false);
		icon.body.setImmovable(true);
		icon.setData("iconType", iconType);
		if (healAmount !== undefined) {
			icon.setData("healAmount", healAmount);
		}
		if (ownerCharacter) {
			icon.setData("ownerCharacter", ownerCharacter);
		}
		icon.setData("isCharacterSpecial", isCharacterSpecial);
		this.lootIcons.add(icon);
		return icon;
	}

	private getNearestWalkableDropPosition(x: number, y: number) {
		if (!this.navWalkable || this.navRows <= 0 || this.navCols <= 0 || this.scaledTileSize <= 0) {
			return { x, y };
		}
		const origin = this.worldToTile(x, y);
		let best: { x: number; y: number } | null = null;
		let bestDist = Number.POSITIVE_INFINITY;
		const maxRadius = 3;

		for (let r = 0; r <= maxRadius; r++) {
			for (let ty = origin.y - r; ty <= origin.y + r; ty++) {
				for (let tx = origin.x - r; tx <= origin.x + r; tx++) {
					if (tx < 0 || ty < 0 || tx >= this.navCols || ty >= this.navRows) continue;
					if (!this.navWalkable[ty][tx]) continue;
					const world = this.tileToWorld(tx, ty);
					const d = Phaser.Math.Distance.Squared(x, y, world.x, world.y);
					if (d < bestDist) {
						bestDist = d;
						best = world;
					}
				}
			}
			if (best) break;
		}

		return best ?? { x, y };
	}

	private showWaveMessage(text: string) {
		if (!this.waveStatusText) return;
		this.waveStatusText.setStyle({ fontSize: "32px" });
		this.waveStatusText.setText(text.toUpperCase());
		this.waveStatusText.setAlpha(1);
		this.waveStatusText.setScale(0);
		this.waveStatusText.setAngle(Phaser.Math.Between(-5, 5));

		// Pop in with bounce
		this.tweens.add({
			targets: this.waveStatusText,
			scale: 1,
			angle: 0,
			duration: 600,
			ease: "Back.easeOut",
			overshoot: 2.5
		});

		// Fade out and float up
		this.tweens.add({
			targets: this.waveStatusText,
			alpha: 0,
			y: this.waveStatusText.y - 40,
			duration: 500,
			delay: 2000,
			ease: "Quad.easeIn",
			onComplete: () => {
				if (this.waveStatusText) {
					this.waveStatusText.setY(this.scale.height * 0.3); // Reset position
				}
			}
		});
	}

	private getRequiredExpForLevel(level: number) {
		const safeLevel = Math.max(1, level);
		return 25 + (safeLevel - 1) * 15;
	}

	private getCurrentOutgoingDamageMultiplier() {
		const perLevel = 0.055;
		return 1 + Math.max(0, this.playerLevel - 1) * perLevel;
	}

	private getCurrentAttackCooldownMs() {
		const baseCooldown = 680;
		const perLevelBonus = 0.015;
		const speedBonus = Math.max(0, this.playerLevel - 1) * perLevelBonus;
		const attackRateScale = 1 + speedBonus;
		return Math.max(180, Math.round(baseCooldown / attackRateScale));
	}

	private getCurrentMoveSpeed() {
		const base = 280;
		const perLevelBonus = 0.012;
		const moveScale = 1 + Math.max(0, this.playerLevel - 1) * perLevelBonus;
		return base * moveScale;
	}

	private getCurrentCritRate() {
		const baseCrit = 0.2;
		const perLevelBonus = 0.005;
		return Phaser.Math.Clamp(baseCrit + Math.max(0, this.playerLevel - 1) * perLevelBonus, 0, 0.65);
	}

	private gainPlayerExp(amount: number) {
		if (amount <= 0) return;
		this.playerExp += amount;
		let leveledUp = false;
		while (this.playerExp >= this.playerExpToNextLevel) {
			this.playerExp -= this.playerExpToNextLevel;
			this.playerLevel += 1;
			this.playerExpToNextLevel = this.getRequiredExpForLevel(this.playerLevel);
			leveledUp = true;
		}
		this.updateLevelUI();
		if (leveledUp) {
			this.showWaveMessage(`Level ${this.playerLevel}`);
			this.cameras.main.shake(170, 0.006);
			this.playFx("getKey", { volume: 0.7 });
		}
	}

	private updateLevelUI() {
		if (!this.levelText) return;
		this.levelText.setText(`Lv.${this.playerLevel}  XP ${this.playerExp}/${this.playerExpToNextLevel}`);
	}

	private getKnightFeatureLevel(id: 1 | 2 | 3 | 4 | 5) {
		return this.knightFeatureLevels[id] ?? 0;
	}

	private getKnightFeatureMaxLevel(id: 1 | 2 | 3 | 4 | 5) {
		// Max includes unlock level. User upgrade counts are added on top of unlock.
		if (id === 1) return 1; // no upgrades
		if (id === 2) return 4; // +3 upgrades
		if (id === 3) return 5; // +4 upgrades
		if (id === 4) return 3; // +2 upgrades
		return 6; // id 5 => +5 upgrades
	}

	private getKnightFeature2HitsPerHeal() {
		const level = this.getKnightFeatureLevel(2);
		if (level <= 0) return Number.POSITIVE_INFINITY;
		return Math.max(1, 4 - level); // Lv1:3, Lv2:2, Lv3+:1
	}

	private getKnightFeature3SizeScale() {
		const level = this.getKnightFeatureLevel(3);
		if (level <= 0) return 1;
		return 1 + Math.max(0, level - 1) * 0.1;
	}

	private getKnightFeature4ExtraShieldHits() {
		const level = this.getKnightFeatureLevel(4);
		if (level <= 0) return 0;
		return Math.min(2, Math.max(0, level - 1));
	}

	private getKnightFeature5DurationScale() {
		const level = this.getKnightFeatureLevel(5);
		if (level <= 0) return 1;
		return 1 + Math.max(0, level - 1) * 0.1;
	}

	private getKnightFeature3MaxShieldHits() {
		if (this.getKnightFeatureLevel(3) <= 0) return 0;
		return this.knightFeature3ShieldMaxHits + this.getKnightFeature4ExtraShieldHits();
	}

	private hasKnightUpgradableFeature() {
		return ([1, 2, 3, 4, 5] as const).some((id) => this.getKnightFeatureLevel(id) < this.getKnightFeatureMaxLevel(id));
	}

	private syncKnightFeatureTogglesFromLevels() {
		this.knightFeature1PowerSlashEnabled = this.getKnightFeatureLevel(1) > 0;
		this.knightFeature2VampiricEnabled = this.getKnightFeatureLevel(2) > 0;
		this.knightFeature3GoldenShieldEnabled = this.getKnightFeatureLevel(3) > 0;
		this.knightFeature4FireAuraEnabled = this.getKnightFeatureLevel(4) > 0;
		this.knightFeature5GroundSpikeEnabled = this.getKnightFeatureLevel(5) > 0;

		if (!this.knightFeature3GoldenShieldEnabled) {
			this.knightFeature3ShieldHitsRemaining = 0;
			this.knightFeature3ShieldRegenReadyAt = 0;
			return;
		}
		const maxHits = this.getKnightFeature3MaxShieldHits();
		this.knightFeature3ShieldHitsRemaining = Phaser.Math.Clamp(this.knightFeature3ShieldHitsRemaining, 0, maxHits);
	}

	private getArcherFeatureLevel(id: 1 | 2 | 3 | 4 | 5) {
		return this.archerFeatureLevels[id] ?? 0;
	}

	private getArcherFeatureMaxLevel(id: 1 | 2 | 3 | 4 | 5) {
		if (id === 1) return 1; // no upgrades
		if (id === 2) return 5; // +4 upgrades
		if (id === 3) return 3; // +2 upgrades
		if (id === 4) return 5; // +4 upgrades
		return 5; // id 5 => +4 upgrades
	}

	private getArcherFeature2ExplosionScale() {
		const level = this.getArcherFeatureLevel(2);
		if (level <= 0) return 1;
		return 1 + Math.max(0, level - 1) * 0.1;
	}

	private getArcherFeature3ArrowCount() {
		const level = this.getArcherFeatureLevel(3);
		if (level <= 0) return 1;
		return 3 + Math.min(2, Math.max(0, level - 1));
	}

	private getArcherFeature4RootMs() {
		const level = this.getArcherFeatureLevel(4);
		if (level <= 0) return this.archerFeature4RootMs;
		return Math.round(this.archerFeature4RootMs * (1 + Math.max(0, level - 1) * 0.1));
	}

	private getArcherFeature5LifetimeMs() {
		const level = this.getArcherFeatureLevel(5);
		if (level <= 0) return this.archerFeature5LifetimeMs;
		return this.archerFeature5LifetimeMs + Math.max(0, level - 1) * 1000;
	}

	private hasArcherUpgradableFeature() {
		return ([1, 2, 3, 4, 5] as const).some((id) => this.getArcherFeatureLevel(id) < this.getArcherFeatureMaxLevel(id));
	}

	private syncArcherFeatureTogglesFromLevels() {
		this.archerFeature1PiercingArrowEnabled = this.getArcherFeatureLevel(1) > 0;
		this.archerFeature2ExplosiveShotEnabled = this.getArcherFeatureLevel(2) > 0;
		this.archerFeature3ArchArrowEnabled = this.getArcherFeatureLevel(3) > 0;
		this.archerFeature4BindingShotEnabled = this.getArcherFeatureLevel(4) > 0;
		this.archerFeature5HelpfulCompanionsEnabled = this.getArcherFeatureLevel(5) > 0;
		if (!this.archerFeature5HelpfulCompanionsEnabled) {
			this.archerFeature5NextSpawnAt = 0;
			this.clearArcherCompanions();
		}
	}

	private getRogueFeatureLevel(id: 1 | 2 | 3 | 4 | 5) {
		return this.rogueFeatureLevels[id] ?? 0;
	}

	private getRogueFeatureMaxLevel(id: 1 | 2 | 3 | 4 | 5) {
		if (id === 1) return 4; // unlock +3 upgrades (+30% range total)
		if (id === 2) return 3; // unlock +2 upgrades (1/2/3 heal)
		if (id === 3) return 1; // no upgrades
		if (id === 4) return 1; // no upgrades
		return 6; // id 5 => unlock +5 upgrades (10%..50%)
	}

	private hasRogueUpgradableFeature() {
		return ([1, 2, 3, 4, 5] as const).some((id) => this.getRogueFeatureLevel(id) < this.getRogueFeatureMaxLevel(id));
	}

	private syncRogueFeatureTogglesFromLevels() {
		this.rogueFeature1HeavyStabEnabled = this.getRogueFeatureLevel(1) > 0;
		this.rogueFeature2CritHealEnabled = this.getRogueFeatureLevel(2) > 0;
		this.rogueFeature3ShadowDashEnabled = this.getRogueFeatureLevel(3) > 0;
		this.rogueFeature4ExecutionEnabled = this.getRogueFeatureLevel(4) > 0;
		this.rogueFeature5DodgeEnabled = this.getRogueFeatureLevel(5) > 0;
	}

	private getRogueFeature2HealAmount() {
		if (!this.rogueFeature2CritHealEnabled) return 0;
		return Phaser.Math.Clamp(this.getRogueFeatureLevel(2), 1, 3);
	}

	private getRogueFeature1RangeScale() {
		if (!this.rogueFeature1HeavyStabEnabled) return 1;
		const level = this.getRogueFeatureLevel(1);
		if (level <= 0) return 1;
		return 1 + Math.min(3, Math.max(0, level - 1)) * 0.1;
	}

	private getRogueFeature5DodgeChance() {
		if (!this.rogueFeature5DodgeEnabled) return 0;
		const level = this.getRogueFeatureLevel(5);
		if (level <= 0) return 0;
		return Phaser.Math.Clamp(0.1 + Math.max(0, level - 1) * 0.08, 0, 0.5);
	}

	private getMageFeatureLevel(id: 1 | 2 | 3 | 4 | 5) {
		return this.mageFeatureLevels[id] ?? 0;
	}

	private getMageFeatureMaxLevel(id: 1 | 2 | 3 | 4 | 5) {
		if (id === 1) return 1; // no upgrades
		if (id === 2 || id === 3 || id === 4) return 5; // +4 upgrades
		return 3; // id 5 => +2 upgrades (5->4->3 attacks)
	}

	private getMageFeature2SupernovaRadiusScale() {
		const level = this.getMageFeatureLevel(2);
		if (level <= 0) return 1;
		return 1 + Math.max(0, level - 1) * 0.1;
	}

	private getMageFeature3FreezeZoneRadiusScale() {
		const level = this.getMageFeatureLevel(3);
		if (level <= 0) return 1;
		return 1 + Math.max(0, level - 1) * 0.1;
	}

	private getMageFeature4PoisonZoneRadiusScale() {
		const level = this.getMageFeatureLevel(4);
		if (level <= 0) return 1;
		return 1 + Math.max(0, level - 1) * 0.1;
	}

	private getMageFeature5EveryAutoAttacks() {
		const level = this.getMageFeatureLevel(5);
		if (level <= 0) return this.mageFeature5EveryAutoAttacks;
		if (level >= 3) return 3;
		if (level === 2) return 4;
		return 5;
	}

	private hasMageUpgradableFeature() {
		return ([1, 2, 3, 4, 5] as const).some((id) => this.getMageFeatureLevel(id) < this.getMageFeatureMaxLevel(id));
	}

	private syncMageFeatureTogglesFromLevels() {
		this.mageFeature1LightningChainEnabled = this.getMageFeatureLevel(1) > 0;
		this.mageFeature2SupernovaEnabled = this.getMageFeatureLevel(2) > 0;
		this.mageFeature3FreezeZoneEnabled = this.getMageFeatureLevel(3) > 0;
		this.mageFeature4PoisonZoneEnabled = this.getMageFeatureLevel(4) > 0;
		this.mageFeature5LaserBeamEnabled = this.getMageFeatureLevel(5) > 0;
	}

	private showCharacterUpdated(featureLabel: string, updateText: string, levelText?: string) {
		if (!this.waveStatusText) return;
		// Keep upgrade popup noticeably smaller than wave announcements.
		this.waveStatusText.setStyle({ fontSize: "21px" });
		this.waveStatusText.setText(`Character Updated!\n${featureLabel}: ${updateText}${levelText ? `\n${levelText}` : ""}`);
		this.waveStatusText.setAlpha(1);
		this.waveStatusText.setScale(0);
		this.waveStatusText.setAngle(Phaser.Math.Between(-5, 5));
		this.tweens.add({
			targets: this.waveStatusText,
			scale: 1,
			angle: 0,
			duration: 600,
			ease: "Back.easeOut",
			overshoot: 2.5
		});
		this.tweens.add({
			targets: this.waveStatusText,
			alpha: 0,
			y: this.waveStatusText.y - 40,
			duration: 500,
			delay: 2000,
			ease: "Quad.easeIn",
			onComplete: () => {
				if (this.waveStatusText) {
					this.waveStatusText.setY(this.scale.height * 0.3);
				}
			}
		});
		this.cameras.main.shake(220, 0.01);
		this.triggerHaptic("success");
	}

	private upgradeKnightFeatureFromSpecialIcon(): string | null {
		const upgradable = ([1, 2, 3, 4, 5] as const).filter(
			(id) => this.getKnightFeatureLevel(id) < this.getKnightFeatureMaxLevel(id)
		);
		if (upgradable.length === 0) return null;
		const picked = Phaser.Utils.Array.GetRandom(upgradable);
		const previous = this.getKnightFeatureLevel(picked);
		const maxLevel = this.getKnightFeatureMaxLevel(picked);
		const next = Math.min(maxLevel, previous + 1);
		this.knightFeatureLevels[picked] = next;
		this.syncKnightFeatureTogglesFromLevels();

		if (picked === 3 || picked === 4) {
			const maxHits = this.getKnightFeature3MaxShieldHits();
			this.knightFeature3ShieldHitsRemaining = Math.min(maxHits, Math.max(this.knightFeature3ShieldHitsRemaining, maxHits));
		}

		const labels: Record<number, string> = {
			1: "Power Slash",
			2: "Vampiric Tendency",
			3: "Golden Shield",
			4: "Fire Aura",
			5: "Ground Spike"
		};
		let updateText = "Unlocked";
		if (picked === 2) {
			const hits = this.getKnightFeature2HitsPerHeal();
			updateText = previous === 0 ? `Unlocked (${hits} hit = +1 HP)` : `${hits} hit = +1 HP`;
		} else if (picked === 3) {
			updateText = previous === 0 ? "Unlocked" : "Shield Size +10%";
		} else if (picked === 4) {
			updateText = previous === 0 ? "Unlocked" : "+1 Shield Block";
		} else if (picked === 5) {
			updateText = previous === 0 ? "Unlocked" : "Spike Duration +10%";
		}
		this.showCharacterUpdated(labels[picked], updateText, `Lv ${next}/${maxLevel}`);
		this.updateHearts();
		return labels[picked];
	}

	private upgradeArcherFeatureFromSpecialIcon(): string | null {
		const upgradable = ([1, 2, 3, 4, 5] as const).filter(
			(id) => this.getArcherFeatureLevel(id) < this.getArcherFeatureMaxLevel(id)
		);
		if (upgradable.length === 0) return null;
		const picked = Phaser.Utils.Array.GetRandom(upgradable);
		const previous = this.getArcherFeatureLevel(picked);
		const maxLevel = this.getArcherFeatureMaxLevel(picked);
		const next = Math.min(maxLevel, previous + 1);
		this.archerFeatureLevels[picked] = next;
		this.syncArcherFeatureTogglesFromLevels();

		const labels: Record<number, string> = {
			1: "Piercing Arrow",
			2: "Explosive Shot",
			3: "Arch Arrow",
			4: "Binding Shot",
			5: "Helpful Companions"
		};
		let updateText = "Unlocked";
		if (picked === 2) {
			updateText = previous === 0 ? "Unlocked" : "Blast Radius/Knockback +10%";
		} else if (picked === 3) {
			const arrows = this.getArcherFeature3ArrowCount();
			updateText = previous === 0 ? `Unlocked (${arrows} Arrows)` : `+1 Arrow (Total ${arrows})`;
		} else if (picked === 4) {
			updateText = previous === 0 ? "Unlocked" : "Root Duration +10%";
		} else if (picked === 5) {
			const lifeMs = this.getArcherFeature5LifetimeMs();
			updateText = previous === 0 ? `Unlocked (${Math.round(lifeMs / 1000)}s)` : `Companion Duration +1s`;
		}
		this.showCharacterUpdated(labels[picked], updateText, `Lv ${next}/${maxLevel}`);
		return labels[picked];
	}

	private upgradeMageFeatureFromSpecialIcon(): string | null {
		const upgradable = ([1, 2, 3, 4, 5] as const).filter(
			(id) => this.getMageFeatureLevel(id) < this.getMageFeatureMaxLevel(id)
		);
		if (upgradable.length === 0) return null;
		const picked = Phaser.Utils.Array.GetRandom(upgradable);
		const previous = this.getMageFeatureLevel(picked);
		const maxLevel = this.getMageFeatureMaxLevel(picked);
		const next = Math.min(maxLevel, previous + 1);
		this.mageFeatureLevels[picked] = next;
		this.syncMageFeatureTogglesFromLevels();

		const labels: Record<number, string> = {
			1: "Lightning Chain",
			2: "Supernova",
			3: "Freeze Zone",
			4: "Poison Zone",
			5: "Laser Beam"
		};
		let updateText = "Unlocked";
		if (picked === 2) {
			updateText = previous === 0 ? "Unlocked" : "Supernova Radius +10%";
		} else if (picked === 3) {
			updateText = previous === 0 ? "Unlocked" : "Freeze Zone Size +10%";
		} else if (picked === 4) {
			updateText = previous === 0 ? "Unlocked" : "Poison Zone Size +10%";
		} else if (picked === 5) {
			const every = this.getMageFeature5EveryAutoAttacks();
			updateText = previous === 0 ? `Unlocked (Every ${every} Attacks)` : `Beam Every ${every} Attacks`;
		}
		this.showCharacterUpdated(labels[picked], updateText, `Lv ${next}/${maxLevel}`);
		return labels[picked];
	}

	private upgradeRogueFeatureFromSpecialIcon(): string | null {
		const upgradable = ([1, 2, 3, 4, 5] as const).filter(
			(id) => this.getRogueFeatureLevel(id) < this.getRogueFeatureMaxLevel(id)
		);
		if (upgradable.length === 0) return null;
		const picked = Phaser.Utils.Array.GetRandom(upgradable);
		const previous = this.getRogueFeatureLevel(picked);
		const maxLevel = this.getRogueFeatureMaxLevel(picked);
		const next = Math.min(maxLevel, previous + 1);
		this.rogueFeatureLevels[picked] = next;
		this.syncRogueFeatureTogglesFromLevels();

		const labels: Record<number, string> = {
			1: "Heavy Stab",
			2: "Crit Heal",
			3: "Shadow Dash",
			4: "Execution",
			5: "Dodge"
		};
		let updateText = "Unlocked";
		if (picked === 1) {
			const percent = Math.round((this.getRogueFeature1RangeScale() - 1) * 100);
			updateText = previous === 0 ? "Unlocked" : `Heavy Stab Range +${percent}%`;
		} else if (picked === 2) {
			const heal = this.getRogueFeature2HealAmount();
			updateText = previous === 0 ? `Unlocked (+${heal} HP on Crit)` : `Crit Heal +${heal} HP`;
		} else if (picked === 5) {
			updateText = previous === 0 ? `Unlocked (${Math.round(this.getRogueFeature5DodgeChance() * 100)}% Dodge)` : `Dodge ${Math.round(this.getRogueFeature5DodgeChance() * 100)}%`;
		}
		this.showCharacterUpdated(labels[picked], updateText, `Lv ${next}/${maxLevel}`);
		return labels[picked];
	}

	private cleanupCharacterSpecialLoots() {
		if (!this.lootIcons) return;
		this.lootIcons.getChildren().forEach((obj) => {
			const icon = obj as Phaser.Physics.Arcade.Image;
			if (!icon.active) return;
			if (!icon.getData("isCharacterSpecial")) return;
			const owner = icon.getData("ownerCharacter") as string | undefined;
			if (owner && owner !== this.activeCharacter) {
				this.createPuffEffect(icon.x, icon.y, 1.1, 12);
				icon.destroy();
			}
		});
	}

	private startWave(wave: number) {
		this.waveNumber = wave;
		this.wavePhase = "wave";
		this.waveSpawnIntervalMs = this.getWaveIntervalMs(2, wave);
		this.waveRoomState = {};
		for (const roomId of [2, 3, 4, 5]) {
			const types = this.getRoomTypes(roomId);
			const baseCount = 2 + Math.floor((wave - 1) / 2);
			const toSpawn = baseCount + Math.max(0, types.length - 1);
			this.waveRoomState[roomId] = { active: false, spawned: 0, toSpawn, nextSpawnAt: 0 };
		}
		this.resetChestsForWave();
		this.showWaveMessage(`Wave ${wave} started`);
		// Always spawn the first mob in each room immediately.
		for (const roomId of [2, 3, 4, 5]) {
			const types = this.getRoomTypes(roomId);
			if (!types.length) continue;
			this.spawnEnemyAtRandom(types[0]);
			this.waveRoomState[roomId].spawned = 1;
		}
	}

	private startBossPhase() {
		this.wavePhase = "boss";
		this.showWaveMessage("Boss Incoming!");
		const bossType = this.bossOrder[this.bossIndex % this.bossOrder.length];
		this.bossIndex += 1;
		this.spawnBossInRandomRoom(bossType);
	}

	private spawnBossInRandomRoom(type: string) {
		const roomIds = [2, 3, 4, 5];
		const roomId = Phaser.Utils.Array.GetRandom(roomIds);
		const candidates = this.roomSpawnCandidates[roomId] ?? this.enemySpawnCandidates;
		if (!candidates || candidates.length === 0) return;
		const attempts = 30;
		for (let i = 0; i < attempts; i++) {
			const pick = Phaser.Utils.Array.GetRandom(candidates);
			if (!pick) continue;
			if (this.spawnEnemyIfClear(type, pick.x, pick.y)) return;
		}
	}

	private countAliveEnemies(): number {
		if (!this.enemies) return 0;
		return this.enemies.getChildren().filter((c) => {
			const e = c as Phaser.Physics.Arcade.Sprite;
			return e.active && e.getData("state") !== "dying";
		}).length;
	}

	private activateRoomForWave(now: number) {
		if (!this.player) return;
		const tile = this.worldToTile(this.player.x, this.player.y);
		const roomId = this.getRoomIdForTile(tile.x, tile.y);
		if (roomId && this.waveRoomState[roomId] && !this.waveRoomState[roomId].active) {
			const state = this.waveRoomState[roomId];
			state.active = true;
			// Start the timer only after entering the room.
			state.nextSpawnAt = now + this.getWaveIntervalMs(roomId, this.waveNumber);
		}
	}

	private updateWaveSystem() {
		if (!this.waveStarted || this.wavePhase === "idle") return;
		const now = this.time.now;
		if (this.wavePhase === "wave") {
			this.activateRoomForWave(now);
			for (const [roomKey, state] of Object.entries(this.waveRoomState)) {
				const roomId = parseInt(roomKey, 10);
				if (!state.active) continue;
				if (state.spawned >= state.toSpawn) continue;
				if (now < state.nextSpawnAt) continue;
				const types = this.getRoomTypes(roomId);
				if (!types.length) continue;
				const type = types[state.spawned % types.length];
				this.spawnEnemyAtRandom(type);
				state.spawned += 1;
				state.nextSpawnAt = now + this.getWaveIntervalMs(roomId, this.waveNumber);
			}
			const allSpawned = Object.values(this.waveRoomState).every((s) => s.spawned >= s.toSpawn);
			if (allSpawned && this.countAliveEnemies() === 0) {
				this.wavePhase = "between";
				this.showWaveMessage(`Wave ${this.waveNumber} Cleared!`);
				this.time.delayedCall(5000, () => {
					if (this.waveNumber % 3 === 0) {
						this.startBossPhase();
					} else {
						this.startWave(this.waveNumber + 1);
					}
				});
			}
		} else if (this.wavePhase === "boss") {
			if (this.countAliveEnemies() === 0) {
				this.wavePhase = "between";
				this.showWaveMessage("Boss Defeated!");
				this.time.delayedCall(5000, () => {
					this.startWave(this.waveNumber + 1);
				});
			}
		}
	}

	private getEnemyWaveHpBonus() {
		if (!this.waveStarted || this.waveNumber <= 0) return 0;
		return Math.max(0, Math.floor((this.waveNumber - 1) / 2));
	}

	private spawnEnemy(type: string, x: number, y: number): Phaser.Physics.Arcade.Sprite | null {
		const cfg = this.enemyConfigs[type];
		if (!cfg) return null;

		this.createPuffEffect(x, y, 1, 18);

		const enemy = this.physics.add.sprite(x, y, cfg.tex.idle, 0);
		enemy.setDepth(9);
		this.configureEnemySprite(enemy, type, cfg);

		enemy.setData("type", type);
		enemy.setData("state", "idle");
		const bonusHp = this.getEnemyWaveHpBonus();
		const hpMax = Math.max(1, cfg.hp + bonusHp);
		enemy.setData("hp", hpMax);
		enemy.setData("hpMax", hpMax);
		enemy.setData("boss", cfg.boss === true);
		enemy.setData("path", [] as { x: number; y: number }[]);
		enemy.setData("pathIndex", 0);
		enemy.setData("lastPathTime", 0);
		enemy.setData("lastAttackTime", 0);
		enemy.setData("stuckSince", 0);
		enemy.setData("unstuckUntil", 0);

		enemy.play(`${type}-idle`);
		this.createEnemyHealthBar(enemy);

		this.enemies.add(enemy);
		this.physics.add.collider(enemy, this.walls);
		this.physics.add.collider(enemy, this.doors);

		enemy.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
			if (!enemy.active) return;

			if (anim.key === `${type}-attack`) {
				// Return to chasing/idle (movement logic decides which)
				enemy.setData("state", "chase");
				enemy.play(`${type}-idle`);
			} else if (anim.key === `${type}-dying`) {
				this.clearArcherBindingRing(enemy);
				this.destroyEnemyHealthBar(enemy);
				enemy.destroy();
			}
		});
		return enemy;
	}

	private createEnemyHealthBar(enemy: Phaser.Physics.Arcade.Sprite) {
		const barWidth = Phaser.Math.Clamp(enemy.displayWidth * 0.85, 28, 74);
		const bg = this.add.rectangle(enemy.x, enemy.y, barWidth, 6, 0x000000, 0.62);
		bg.setDepth(enemy.depth + 2);
		const fill = this.add.rectangle(enemy.x, enemy.y, barWidth - 2, 4, 0x5cff77, 0.95);
		fill.setDepth(enemy.depth + 2.05);
		enemy.setData("hpBarBg", bg);
		enemy.setData("hpBarFill", fill);
		this.syncEnemyHealthBar(enemy);
	}

	private syncEnemyHealthBar(enemy: Phaser.Physics.Arcade.Sprite) {
		const bg = enemy.getData("hpBarBg") as Phaser.GameObjects.Rectangle | undefined;
		const fill = enemy.getData("hpBarFill") as Phaser.GameObjects.Rectangle | undefined;
		if (!bg || !fill || !bg.active || !fill.active) return;
		if (!enemy.active || enemy.getData("state") === "dying") {
			bg.setVisible(false);
			fill.setVisible(false);
			return;
		}

		const maxHp = Math.max(1, ((enemy.getData("hpMax") as number) ?? 1));
		const hp = Phaser.Math.Clamp(((enemy.getData("hp") as number) ?? maxHp), 0, maxHp);
		const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
		const barWidth = Phaser.Math.Clamp(enemy.displayWidth * 0.85, 28, 74);
		const barY = enemy.y - enemy.displayHeight * 0.56 - 8;

		bg.setVisible(true);
		fill.setVisible(ratio > 0);
		bg.setPosition(enemy.x, barY);
		bg.setSize(barWidth, 6);

		const fillWidth = Math.max(0.001, (barWidth - 2) * ratio);
		fill.setSize(fillWidth, 4);
		fill.setPosition(enemy.x - (barWidth - 2 - fillWidth) * 0.5, barY);
		if (ratio > 0.6) {
			fill.setFillStyle(0x5cff77, 0.95);
		} else if (ratio > 0.3) {
			fill.setFillStyle(0xffdb52, 0.95);
		} else {
			fill.setFillStyle(0xff4f4f, 0.95);
		}
	}

	private destroyEnemyHealthBar(enemy: Phaser.Physics.Arcade.Sprite) {
		const bg = enemy.getData("hpBarBg") as Phaser.GameObjects.Rectangle | undefined;
		const fill = enemy.getData("hpBarFill") as Phaser.GameObjects.Rectangle | undefined;
		if (bg?.active) bg.destroy();
		if (fill?.active) fill.destroy();
		enemy.setData("hpBarBg", undefined);
		enemy.setData("hpBarFill", undefined);
	}

	private configureEnemySprite(
		enemy: Phaser.Physics.Arcade.Sprite,
		type: string,
		cfg: {
			tex: { idle: string; attack: string; dying: string };
			frame: { w: number; h: number };
			frames: { idle: number; attack: number; dying: number };
			facingInverted?: boolean;
			speed: number;
			hp: number;
			scale?: number;
			body?: { wScale: number; hScale: number };
			damage: number;
			boss?: boolean;
		}
	) {
		// Scale enemy to roughly 1 tile wide, then apply optional multiplier.
		const baseScale = this.scaledTileSize / cfg.frame.w;
		const enemyScale = baseScale * (cfg.scale ?? 1);
		enemy.setScale(enemyScale);

		const body = enemy.body as Phaser.Physics.Arcade.Body;
		body.setCollideWorldBounds(false);

		// Collider: centered and bottom-aligned ("feet")
		const scaleMult = cfg.scale ?? 1;
		let bw = Math.round(cfg.frame.w * (cfg.body?.wScale ?? 0.6) * scaleMult);
		let bh = Math.round(cfg.frame.h * (cfg.body?.hScale ?? 0.55) * scaleMult);
		if (type === "dragon" || type === "slime" || type === "slime_split") {
			bw = Math.max(1, bw - 4);
			bh = Math.max(1, bh - 4);
		}
		if (type === "slime") {
			// Slime collider: larger and square
			bw = Math.max(1, Math.round(bw * 4));
			bh = bw;
		}
		if (type === "slime_split") {
			// Slime split collider: widen horizontally 3x and keep square
			bw = Math.max(1, Math.round(bw * 3));
			bh = bw;
		}
		body.setSize(bw, bh);
		const offsetX = Math.round((cfg.frame.w - bw) / 2);
		let offsetY = cfg.frame.h - bh;
		if (type === "beholder") {
			offsetY = Math.max(0, offsetY - 8);
		}
		if (type === "dragon") {
			offsetY = Math.max(0, offsetY - 24);
		}
		if (type === "slime" || type === "slime_split") {
			// Center slime colliders on the sprite
			offsetY = Math.round((cfg.frame.h - bh) / 2) + 5;
		}
		if (type === "mummy") {
			offsetY = Math.max(0, offsetY - 18);
		}
		body.setOffset(offsetX, offsetY);
		body.setMaxVelocity(220, 220);
		enemy.setData("colliderRadius", Math.max(bw, bh) * 0.5);
	}

	private isEnemySpawnBlocked(type: string, x: number, y: number) {
		const cfg = this.enemyConfigs[type];
		if (!cfg) return true;
		const probe = this.physics.add.sprite(x, y, cfg.tex.idle, 0);
		probe.setVisible(false);
		probe.setActive(true);
		this.configureEnemySprite(probe, type, cfg);
		if (type === "beholder" && !this.hasWalkableSpawnBuffer(x, y, 1)) {
			probe.destroy();
			return true;
		}
		if (type === "beholder") {
			// Prevent visual wall-clipping at spawn by requiring extra clearance.
			const body = probe.body as Phaser.Physics.Arcade.Body;
			const pad = Math.max(8, Math.round((this.scaledTileSize || 64) * 0.2));
			body.setSize(body.width + pad * 2, body.height + pad * 2);
			body.setOffset(body.offset.x - pad, body.offset.y - pad);
		}
		const overlapBlocked =
			this.physics.overlap(probe, this.walls) ||
			this.physics.overlap(probe, this.doors) ||
			this.physics.overlap(probe, this.chests);
		probe.destroy();
		return overlapBlocked;
	}

	private hasWalkableSpawnBuffer(worldX: number, worldY: number, radius: number) {
		if (radius <= 0 || !this.navWalkable || this.navRows <= 0 || this.navCols <= 0) return true;
		const tile = this.worldToTile(worldX, worldY);
		for (let ty = tile.y - radius; ty <= tile.y + radius; ty++) {
			for (let tx = tile.x - radius; tx <= tile.x + radius; tx++) {
				if (tx < 0 || ty < 0 || tx >= this.navCols || ty >= this.navRows) return false;
				if (!this.navWalkable[ty][tx]) return false;
			}
		}
		return true;
	}

	private doPlayerAttackHit() {
		if (!this.enemies || !this.player) return;

		const pBody = this.player.body as Phaser.Physics.Arcade.Body;
		const baseHeight = pBody.height;
		const baseWidth = pBody.width;
		const height = baseHeight;
		const width = baseWidth * 1.5;
		const dir = this.getPlayerFacingDirection();
		const forwardOffset = baseWidth * 0.35;
		const backShift = baseWidth * 0.25;
		const hitX = pBody.center.x + dir * (forwardOffset - backShift);
		const hitY = pBody.center.y;
		const hit = this.physics.add.image(hitX, hitY, "dungeon_tileset", 0);
		hit.setVisible(false);
		hit.setDepth(20);

		const body = hit.body as Phaser.Physics.Arcade.Body;
		body.setAllowGravity(false);
		body.setSize(width, height, true);

		const isKnight = this.activeCharacter === "knight";
		const isRogue = this.activeCharacter === "rogue";
		let shouldSpawnGroundSpikeThisAttack = false;
		let groundSpikeSpawned = false;
		if (isKnight) {
			this.knightAutoAttackCount += 1;
			shouldSpawnGroundSpikeThisAttack =
				this.knightFeature5GroundSpikeEnabled &&
				this.knightAutoAttackCount % this.knightFeature5EveryAutoAttacks === 0;
			const isPowerSlashHit =
				this.knightFeature1PowerSlashEnabled &&
				this.knightAutoAttackCount % this.knightPowerSlashEvery === 0;
			if (isPowerSlashHit) {
				this.playFx("threeHitFirst", { volume: 1.45 });
				this.spawnKnightPowerSlashWave(hitX, hitY, dir, width, height);
			} else {
				this.playFx("playerShoot", { volume: 1.2 });
			}
		} else if (isRogue) {
			this.rogueAutoAttackCount += 1;
			const triggerHeavyStab =
				this.rogueFeature1HeavyStabEnabled &&
				this.rogueAutoAttackCount % this.rogueFeature1EveryAutoAttacks === 0;
			const triggerShadowDash =
				this.rogueFeature3ShadowDashEnabled &&
				this.rogueAutoAttackCount % this.rogueFeature3EveryAutoAttacks === 0;

			if (triggerHeavyStab) {
				this.performRogueHeavyStab(hitX, hitY, dir);
				this.playFx("threeHitFirst", { volume: 0.95 });
			} else {
				this.playFx("playerShoot", { volume: 1.2 });
			}
			if (triggerShadowDash) {
				this.performRogueShadowDash(dir);
			}
		} else {
			this.playFx("playerShoot", { volume: 1.4 });
		}

		const hitEnemies = new Set<Phaser.Physics.Arcade.Sprite>();
		this.physics.add.overlap(hit, this.enemies, (_hit, enemyObj) => {
			const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
			if (hitEnemies.has(enemy)) return;
			hitEnemies.add(enemy);
			if (isRogue && this.tryRogueExecution(enemy)) {
				return;
			}
			if (shouldSpawnGroundSpikeThisAttack && !groundSpikeSpawned) {
				groundSpikeSpawned = true;
				this.spawnKnightFeature5GroundSpike(enemy.x, enemy.y);
			}
			const dealt = this.damageEnemy(
				enemy,
				this.damageMultiplier
			);
			if (dealt && isKnight) this.handleKnightFeature2VampiricHit();
		});
		this.physics.add.overlap(hit, this.chests, (_hit, chestObj) => {
			this.openChest(chestObj as Phaser.Physics.Arcade.Sprite);
		});

		this.time.delayedCall(140, () => {
			if (hit && hit.active) hit.destroy();
		});
	}

	private performRogueHeavyStab(originX: number, originY: number, dir: number) {
		if (!this.enemies) return;
		const baseRange = ((this.scaledTileSize || 64) * 4.3) / 2.5;
		const range = baseRange * this.getRogueFeature1RangeScale();
		const endX = originX + dir * range;
		const hits = this.findEnemyHitsAlongPath(originX, originY, endX, originY, 10);
		hits.forEach((enemy) => {
			if (!enemy.active) return;
			if (this.tryRogueExecution(enemy)) return;
			this.damageEnemy(enemy, this.damageMultiplier * 1.25, false, 1.15, true);
		});

		const stab = this.add.graphics();
		stab.setDepth((this.player?.depth ?? 20) + 3);
		stab.setBlendMode(Phaser.BlendModes.ADD);
		stab.lineStyle(10, 0xffd2d2, 0.82);
		stab.beginPath();
		stab.moveTo(originX, originY);
		stab.lineTo(endX, originY);
		stab.strokePath();
		stab.lineStyle(4, 0xffffff, 0.9);
		stab.beginPath();
		stab.moveTo(originX + dir * 8, originY);
		stab.lineTo(endX, originY);
		stab.strokePath();
		this.tweens.add({
			targets: stab,
			alpha: 0,
			duration: 160,
			ease: "Cubic.easeOut",
			onComplete: () => stab.destroy()
		});
		this.cameras.main.shake(120, 0.0035);
	}

	private performRogueShadowDash(dir: number) {
		if (!this.player || !this.enemies || !this.scaledTileSize) return;
		const startX = this.player.x;
		const startY = this.player.y;
		const maxDist = this.scaledTileSize * 2.6;
		const step = Math.max(6, this.scaledTileSize * 0.18);
		let allowedDist = 0;
		for (let d = step; d <= maxDist; d += step) {
			const checkX = startX + dir * d;
			if (!this.isWalkablePointForDash(checkX, startY)) break;
			allowedDist = d;
		}
		if (allowedDist <= 0.01) return;
		const endX = startX + dir * allowedDist;
		const hits = this.findEnemyHitsAlongPath(startX, startY, endX, startY, 10);
		hits.forEach((enemy) => {
			if (!enemy.active) return;
			if (this.tryRogueExecution(enemy)) return;
			this.damageEnemy(enemy, this.damageMultiplier * 1.05, false, 1.15, true);
		});

		this.player.setPosition(endX, startY);
		const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
		if (body) body.setVelocity(0, 0);

		const dashTrail = this.add.ellipse((startX + endX) * 0.5, startY, Math.abs(endX - startX) + 20, 16, 0x8f8fff, 0.2);
		dashTrail.setDepth(this.player.depth - 0.1);
		dashTrail.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: dashTrail,
			alpha: 0,
			duration: 170,
			ease: "Sine.easeOut",
			onComplete: () => dashTrail.destroy()
		});
		this.createPuffEffect(startX, startY, 0.8, 12);
		this.createPuffEffect(endX, startY, 0.9, 14);
		this.cameras.main.shake(100, 0.0025);
	}

	private isWalkablePointForDash(worldX: number, worldY: number) {
		if (!this.navWalkable || this.navRows <= 0 || this.navCols <= 0 || this.scaledTileSize <= 0) return false;
		const tx = Math.floor((worldX - this.mapOriginX) / this.scaledTileSize);
		const ty = Math.floor((worldY - this.mapOriginY) / this.scaledTileSize);
		if (tx < 0 || ty < 0 || tx >= this.navCols || ty >= this.navRows) return false;
		return !!this.navWalkable[ty][tx];
	}

	private tryRogueExecution(enemy: Phaser.Physics.Arcade.Sprite) {
		if (!this.rogueFeature4ExecutionEnabled || this.activeCharacter !== "rogue") return false;
		if (!enemy.active) return false;
		const hp = (enemy.getData("hp") as number) ?? 1;
		const hpMax = Math.max(1, (enemy.getData("hpMax") as number) ?? hp);
		if (hp / hpMax > this.rogueFeature4ExecutionThreshold) return false;
		this.createBloodSplatter(enemy.x, enemy.y);
		this.playFx("enemyHit", { volume: 0.78 });
		this.cameras.main.shake(140, 0.005);
		this.killEnemy(enemy);
		return true;
	}

	private getPlayerFacingDirection(): -1 | 1 {
		if (!this.player) return this.playerFacingDir;
		const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
		if (body) {
			if (body.velocity.x < -0.01) return -1;
			if (body.velocity.x > 0.01) return 1;
		}
		return this.player.flipX ? -1 : this.playerFacingDir;
	}

	private spawnKnightPowerSlashWave(originX: number, originY: number, dir: number, baseHitWidth: number, baseHitHeight: number) {
		if (!this.player || !this.knightSlashWaves) return;
		const spawnX = originX + dir * Math.max(baseHitWidth * 0.9, 24);
		const wave = this.physics.add.image(spawnX, originY, "dungeon_tileset", 0);
		wave.setVisible(false);
		wave.setDepth(this.player.depth + 2);
		wave.setData("bornAt", this.time.now);
		wave.setData("collideAt", this.time.now + 50);
		wave.setData("direction", dir);
		wave.setData("nextTrailAt", this.time.now);
		wave.setData("hitEnemies", new Set<Phaser.Physics.Arcade.Sprite>());

		const waveVisual = this.add.ellipse(spawnX, originY, Math.max(baseHitWidth * 2.4, 76), Math.max(baseHitHeight * 1.2, 24), 0x8fe8ff, 0.9);
		waveVisual.setDepth(this.player.depth + 3);
		waveVisual.setBlendMode(Phaser.BlendModes.ADD);
		waveVisual.setStrokeStyle(3, 0xffffff, 0.9);
		waveVisual.setData("baseWidth", waveVisual.width);
		waveVisual.setData("baseHeight", waveVisual.height);
		wave.setData("visual", waveVisual);

		const body = wave.body as Phaser.Physics.Arcade.Body;
		body.setAllowGravity(false);
		body.setSize(Math.max(baseHitWidth * 3.7, 86), Math.max(baseHitHeight * 1.4, 26), true);
		body.setVelocity(dir * this.knightPowerSlashWaveSpeed, 0);

		this.knightSlashWaves.add(wave);
		this.createKnightPowerSlashCastEffect(originX, originY, dir);
		this.triggerHaptic("heavy");
		this.cameras.main.shake(140, 0.006);
	}

	private createKnightPowerSlashCastEffect(x: number, y: number, dir: number) {
		const slash = this.add.graphics();
		slash.setDepth(27);
		slash.setBlendMode(Phaser.BlendModes.ADD);
		slash.lineStyle(11, 0x73dcff, 0.95);
		slash.beginPath();
		slash.moveTo(x - dir * 12, y - 28);
		slash.lineTo(x + dir * 62, y);
		slash.lineTo(x - dir * 12, y + 28);
		slash.strokePath();
		slash.lineStyle(4, 0xffffff, 1);
		slash.beginPath();
		slash.moveTo(x - dir * 6, y - 16);
		slash.lineTo(x + dir * 66, y);
		slash.lineTo(x - dir * 6, y + 16);
		slash.strokePath();
		this.tweens.add({
			targets: slash,
			alpha: 0,
			duration: 180,
			ease: "Quad.easeOut",
			onComplete: () => slash.destroy()
		});

		const ring = this.add.circle(x + dir * 10, y, 16, 0x89e8ff, 0.55);
		ring.setDepth(26);
		ring.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: ring,
			scaleX: 3.8,
			scaleY: 3.2,
			alpha: 0,
			duration: 230,
			ease: "Cubic.easeOut",
			onComplete: () => ring.destroy()
		});

		this.createPuffEffect(x + dir * 20, y, 1.2, 24);
	}

	private updateKnightPowerSlashWaves() {
		if (!this.knightSlashWaves) return;
		const now = this.time.now;
		this.knightSlashWaves.getChildren().forEach((obj) => {
			const wave = obj as Phaser.Physics.Arcade.Image;
			if (!wave.active) return;
			const bornAt = (wave.getData("bornAt") as number) || 0;
			const age = now - bornAt;
			if (age >= this.knightPowerSlashWaveLifeMs) {
				this.destroyKnightSlashWave(wave);
				return;
			}
			const body = wave.body as Phaser.Physics.Arcade.Body;
			if (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down) {
				this.destroyKnightSlashWave(wave);
				return;
			}

			const dir = (wave.getData("direction") as number) || 1;
			const waveVisual = wave.getData("visual") as Phaser.GameObjects.Ellipse | undefined;
			if (waveVisual?.active) {
				const lifeT = Phaser.Math.Clamp(age / this.knightPowerSlashWaveLifeMs, 0, 1);
				const baseWidth = (waveVisual.getData("baseWidth") as number) || waveVisual.width;
				const baseHeight = (waveVisual.getData("baseHeight") as number) || waveVisual.height;
				waveVisual.setPosition(wave.x, wave.y);
				waveVisual.setAngle(dir > 0 ? 0 : 180);
				waveVisual.setSize(baseWidth * (1 + lifeT * 0.7), baseHeight * (1 + lifeT * 0.25));
				waveVisual.setAlpha(0.95 * (1 - lifeT * 0.9));
			}
			this.applyKnightWaveEffectDamage(wave, dir);

			const nextTrailAt = (wave.getData("nextTrailAt") as number) || 0;
			if (now >= nextTrailAt) {
				this.createKnightWaveTrailEffect(wave.x, wave.y, dir, 1);
				wave.setData("nextTrailAt", now + 32);
			}
		});
	}

	private createKnightWaveTrailEffect(x: number, y: number, dir: number, strength: number) {
		const trail = this.add.ellipse(x - dir * Phaser.Math.Between(10, 24), y + Phaser.Math.Between(-6, 6), 34 * strength, 12 * strength, 0x8adfff, 0.45);
		trail.setDepth(23);
		trail.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: trail,
			alpha: 0,
			scaleX: 1.9,
			scaleY: 1.25,
			duration: 120,
			ease: "Quad.easeOut",
			onComplete: () => trail.destroy()
		});
	}

	private createKnightWaveHitEffect(x: number, y: number) {
		const burst = this.add.circle(x, y, 14, 0xc2f4ff, 0.6);
		burst.setDepth(26);
		burst.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: burst,
			scale: 2.7,
			alpha: 0,
			duration: 170,
			ease: "Cubic.easeOut",
			onComplete: () => burst.destroy()
		});
		for (let i = 0; i < 6; i++) {
			const spark = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0xffffff, 0.95);
			spark.setDepth(26);
			spark.setBlendMode(Phaser.BlendModes.ADD);
			const angle = Math.random() * Math.PI * 2;
			const dist = Phaser.Math.Between(18, 38);
			this.tweens.add({
				targets: spark,
				x: x + Math.cos(angle) * dist,
				y: y + Math.sin(angle) * dist,
				alpha: 0,
				duration: Phaser.Math.Between(110, 170),
				ease: "Quad.easeOut",
				onComplete: () => spark.destroy()
			});
		}
	}

	private applyKnightWaveEffectDamage(wave: Phaser.Physics.Arcade.Image, dir: number) {
		if (!this.enemies || !wave.active) return;
		const waveVisual = wave.getData("visual") as Phaser.GameObjects.Ellipse | undefined;
		const visualWidth = Math.max(80, waveVisual?.width ?? 0);
		const visualHeight = Math.max(22, waveVisual?.height ?? 0);
		const minX = dir > 0 ? wave.x - visualWidth * 0.25 : wave.x - visualWidth * 0.75;
		const maxX = dir > 0 ? wave.x + visualWidth * 0.75 : wave.x + visualWidth * 0.25;
		const hitHalfY = visualHeight * 0.55;
		let hitEnemies = wave.getData("hitEnemies") as Set<Phaser.Physics.Arcade.Sprite> | undefined;
		if (!hitEnemies) {
			hitEnemies = new Set();
			wave.setData("hitEnemies", hitEnemies);
		}

		this.enemies.getChildren().forEach((obj) => {
			const enemy = obj as Phaser.Physics.Arcade.Sprite;
			if (!enemy.active) return;
			if (hitEnemies!.has(enemy)) return;
			if (enemy.x < minX || enemy.x > maxX) return;
			const enemyRadius = Math.max(enemy.displayHeight, enemy.displayWidth) * 0.18;
			if (Math.abs(enemy.y - wave.y) > hitHalfY + enemyRadius) return;

			hitEnemies!.add(enemy);
			const dealt = this.damageEnemy(
				enemy,
				this.damageMultiplier * this.knightPowerSlashDamageMultiplier
			);
			if (dealt) this.handleKnightFeature2VampiricHit();
			this.createKnightWaveHitEffect(enemy.x, enemy.y);
		});
	}

	private handleKnightFeature2VampiricHit() {
		if (!this.knightFeature2VampiricEnabled) return;
		if (!this.player || this.playerDead || this.activeCharacter !== "knight") return;
		this.knightFeature2HitCount += 1;
		const requiredHits = this.getKnightFeature2HitsPerHeal();
		if (!Number.isFinite(requiredHits)) return;
		if (this.knightFeature2HitCount < requiredHits) return;
		this.knightFeature2HitCount = 0;
		if (this.playerHp >= this.playerMaxHp) return;
		this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 1);
		this.updateHearts();
		this.playFx("getKey", { volume: 0.45 });
		const heal = this.add.circle(this.player.x, this.player.y - 16, 10, 0xff4d4d, 0.65);
		heal.setDepth(this.player.depth + 4);
		heal.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: heal,
			y: heal.y - 22,
			scaleX: 1.9,
			scaleY: 1.9,
			alpha: 0,
			duration: 260,
			ease: "Cubic.easeOut",
			onComplete: () => heal.destroy()
		});
	}

	private destroyKnightSlashWave(wave: Phaser.Physics.Arcade.Image) {
		if (!wave.active) return;
		const dir = (wave.getData("direction") as number) || 1;
		const waveVisual = wave.getData("visual") as Phaser.GameObjects.Ellipse | undefined;
		if (waveVisual?.active) {
			waveVisual.destroy();
		}
		this.createKnightWaveTrailEffect(wave.x, wave.y, dir, 1.35);
		this.createPuffEffect(wave.x, wave.y, 1, 16);
		wave.destroy();
	}

	private applyPlayerBody(state: "idle" | "move" | "attack") {
		if (!this.player?.body) return;
		const body = this.player.body as Phaser.Physics.Arcade.Body;
		const frameW = this.player.frame?.realWidth ?? this.player.frame?.width ?? this.player.width;
		const frameH = this.player.frame?.realHeight ?? this.player.frame?.height ?? this.player.height;
		const isMage = this.activeCharacter === "mage";
		const isArcher = this.activeCharacter === "archer";
		const isRogue = this.activeCharacter === "rogue";
		if (isMage || isArcher || isRogue) {
			const baseScale = 2;
			this.player.setScale(baseScale);
			const bw = 14;
			const bh = 16;
			body.setSize(bw, bh);
			body.setOffset((frameW - bw) / 2, Math.max(0, frameH - bh));
			return;
		}

		const baseScale = 4;
		if (state === "idle") {
			this.player.setScale(baseScale);
			const bw = 10;
			const bh = 10;
			body.setSize(bw, bh);
			body.setOffset((frameW - bw) / 2, Math.max(0, frameH - bh));
		} else {
			this.player.setScale(baseScale / 2);
			const bw = 20;
			const bh = 20;
			body.setSize(bw, bh);
			body.setOffset((frameW - bw) / 2, Math.max(0, frameH - bh));
		}
	}

	private setActiveCharacter(type: "knight" | "mage" | "archer" | "rogue", force = false) {
		if (!force && this.activeCharacter === type) return;
		this.activeCharacter = type;
		if (type !== "knight") {
			this.knightAutoAttackCount = 0;
			this.knightFeature2HitCount = 0;
			this.knightFeature4LastTickAt = 0;
			if (this.knightFeature4AuraCircle?.active) this.knightFeature4AuraCircle.destroy();
			if (this.knightFeature4AuraInner?.active) this.knightFeature4AuraInner.destroy();
			this.knightFeature4AuraCircle = undefined;
			this.knightFeature4AuraInner = undefined;
		}
		if (type !== "mage") {
			this.mageAutoAttackCount = 0;
			this.clearMageFeatureObjects();
		} else {
			this.mageAutoAttackCount = 0;
		}
		if (type !== "archer") {
			this.archerAutoAttackCount = 0;
			this.archerFeature5NextSpawnAt = 0;
			this.clearArcherCompanions();
		} else if (this.archerFeature5HelpfulCompanionsEnabled && this.archerFeature5NextSpawnAt <= 0) {
			this.archerFeature5NextSpawnAt = this.time.now + this.archerFeature5SpawnIntervalMs;
		}
		this.rogueAutoAttackCount = 0;
		this.isAttacking = false;
		this.mageCasting = false;
		this.archerCasting = false;
		if (this.mageCastSprite && this.mageCastSprite.active) {
			this.mageCastSprite.destroy();
		}
		this.mageCastSprite = undefined;
		if (this.archerCastSprite && this.archerCastSprite.active) {
			this.archerCastSprite.destroy();
		}
		this.archerCastSprite = undefined;
		this.playerMaxHp =
			type === "mage"
				? this.mageMaxHp
				: type === "archer"
					? this.archerMaxHp
					: type === "rogue"
						? this.rogueMaxHp
						: this.knightMaxHp;
		if (this.playerHp > this.playerMaxHp) {
			this.playerHp = this.playerMaxHp;
		}
		const idleKey = type === "mage" ? "mage-idle" : type === "archer" ? "archer-idle" : type === "rogue" ? "rogue-idle" : "player-idle";
		if (this.player) {
			this.player.play(idleKey);
			this.applyPlayerBody("idle");
			this.updateHearts();
		}
		this.cleanupCharacterSpecialLoots();
		if (this.tutorialModeActive && !this.tutorialStep5RewardCollected) {
			this.spawnOrRefreshTutorialSkillIcon();
		}
		if (this.skillsInfoActive) {
			this.updateSkillsInfoMenuContent();
		}
	}

	private getCharacterIdleAnimKey(type: "knight" | "mage" | "archer" | "rogue"): string {
		if (type === "mage") return "mage-idle";
		if (type === "archer") return "archer-idle";
		if (type === "rogue") return "rogue-idle";
		return "player-idle";
	}

	private getCharacterIdleTextureKey(type: "knight" | "mage" | "archer" | "rogue"): string {
		if (type === "mage") return "mage_idle";
		if (type === "archer") return "archer_idle";
		if (type === "rogue") return "rogue_idle";
		return "player_idle";
	}

	private getCharacterSelectPreviewScale(type: "knight" | "mage" | "archer" | "rogue", cardHeight: number): number {
		const sizeFactor = Phaser.Math.Clamp(cardHeight / 220, 0.78, 1.2);
		if (type === "knight") return 2.8 * sizeFactor;
		if (type === "rogue") return 2.4 * sizeFactor;
		return 2.2 * sizeFactor;
	}

	private openCharacterSelectMenu() {
		if (!this.player || this.characterSelectActive || this.isMainMenu || this.isGameOver) return;
		const candidates = this.playableCharacters.filter((c) => c !== this.activeCharacter);
		if (candidates.length === 0) return;

		this.characterSelectCandidates = candidates;
		this.characterSelectActive = true;
		this.isPaused = true;
		this.physics.world.isPaused = true;
		this.time.timeScale = 0;
		this.tweens.timeScale = 0;

		const pauseMenu = document.getElementById("pause-menu");
		if (pauseMenu) {
			pauseMenu.classList.add("hidden");
			const pauseEl = pauseMenu as HTMLElement;
			pauseEl.style.display = "none";
			pauseEl.style.pointerEvents = "none";
		}
		if (this.mobileControlsEnabled) {
			this.mobileFireHeld = false;
			this.mobileFirePointerId = -1;
			this.mobileJoystickPointerId = -1;
			this.mobileFireButton?.setAlpha(this.mobileFireIdleAlpha);
			this.resetJoystick();
		}

		this.showCharacterSelectMenu();
	}

	private renderCharacterSelectOverlay() {
		// Kept for compatibility with old call sites.
		// Character selection now uses DOM like pause/gameover for reliable mobile input.
		this.showCharacterSelectMenu();
	}

	private isPlayableCharacter(value: string | undefined | null): value is "knight" | "mage" | "archer" | "rogue" {
		return value === "knight" || value === "mage" || value === "archer" || value === "rogue";
	}

	private toggleSkillsInfoMenu() {
		if (this.skillsInfoActive) {
			this.closeSkillsInfoMenu(true);
		} else {
			this.openSkillsInfoMenu();
		}
	}

	private openSkillsInfoMenu() {
		if (this.skillsInfoActive || this.isMainMenu || this.isGameOver || this.characterSelectActive) return;
		const menu = document.getElementById("skills-info-menu");
		if (!menu) return;

		const pauseMenu = document.getElementById("pause-menu");
		if (pauseMenu) {
			pauseMenu.classList.add("hidden");
			const pauseEl = pauseMenu as HTMLElement;
			pauseEl.style.display = "none";
			pauseEl.style.pointerEvents = "none";
		}

		this.skillsInfoActive = true;
		this.isPaused = true;
		this.physics.world.isPaused = true;
		this.time.timeScale = 0;
		this.tweens.timeScale = 0;
		this.updateSkillsInfoMenuContent();
		menu.classList.remove("hidden");
		const menuEl = menu as HTMLElement;
		menuEl.style.display = "block";
		menuEl.style.pointerEvents = "auto";

		if (this.mobileControlsEnabled) {
			this.mobileFireHeld = false;
			this.mobileFirePointerId = -1;
			this.mobileJoystickPointerId = -1;
			this.mobileFireButton?.setAlpha(this.mobileFireIdleAlpha);
			this.resetJoystick();
		}
	}

	private closeSkillsInfoMenu(resumeGameplay: boolean) {
		const menu = document.getElementById("skills-info-menu");
		if (menu) {
			menu.classList.add("hidden");
			const menuEl = menu as HTMLElement;
			menuEl.style.display = "none";
			menuEl.style.pointerEvents = "none";
		}
		this.skillsInfoActive = false;

		if (!resumeGameplay) return;
		if (this.isGameOver || this.isMainMenu || this.characterSelectActive) return;

		this.isPaused = false;
		this.physics.world.isPaused = false;
		this.time.timeScale = 1;
		this.tweens.timeScale = 1;
	}

	private getCharacterDisplayName(type: "knight" | "mage" | "archer" | "rogue") {
		if (type === "knight") return "WARRIOR";
		if (type === "mage") return "MAGE";
		if (type === "archer") return "ARCHER";
		return "ROGUE";
	}

	private getCharacterSkillInfo(type: "knight" | "mage" | "archer" | "rogue") {
		if (type === "knight") {
			return [
				{ iconType: 1, name: "Power Slash", desc: "Every 3 attacks, releases a piercing wave." },
				{ iconType: 2, name: "Vampiric Tendency", desc: "Auto-attacks restore health on hit." },
				{ iconType: 3, name: "Golden Shield", desc: "Blocks incoming hits and can regenerate." },
				{ iconType: 4, name: "Fire Aura", desc: "Burns nearby enemies over time." },
				{ iconType: 5, name: "Ground Spike", desc: "Periodically creates a stunning spike zone." }
			];
		}
		if (type === "mage") {
			return [
				{ iconType: 1, name: "Lightning Chain", desc: "Chain lightning jumps across enemies." },
				{ iconType: 2, name: "Supernova", desc: "Every 4 attacks, triggers an explosion." },
				{ iconType: 3, name: "Freeze Zone", desc: "Creates a slowing ice field." },
				{ iconType: 4, name: "Poison Zone", desc: "Creates a poison area that deals DOT." },
				{ iconType: 5, name: "Laser Beam", desc: "Fires a straight line beam through enemies." }
			];
		}
		if (type === "archer") {
			return [
				{ iconType: 1, name: "Piercing Arrow", desc: "Every 3 attacks, arrows pierce enemies." },
				{ iconType: 2, name: "Explosive Shot", desc: "Shots explode and knock enemies back." },
				{ iconType: 3, name: "Arch Arrow", desc: "Fires an arc of multiple arrows." },
				{ iconType: 4, name: "Binding Shot", desc: "Roots the first enemy hit." },
				{ iconType: 5, name: "Helpful Companions", desc: "Summons temporary ranged companions." }
			];
		}
		return [
			{ iconType: 1, name: "Heavy Stab", desc: "Long-range stab every 3 attacks." },
			{ iconType: 2, name: "Critical Hit", desc: "Critical chance doubles outgoing damage." },
			{ iconType: 3, name: "Shadow Dash", desc: "Dashes through enemies and damages them." },
			{ iconType: 4, name: "Execution", desc: "Instantly kills low-health enemies." },
			{ iconType: 5, name: "Dodge", desc: "Chance to evade incoming enemy attacks." }
		];
	}

	private getActiveCharacterFeatureLevel(id: 1 | 2 | 3 | 4 | 5) {
		if (this.activeCharacter === "mage") return this.getMageFeatureLevel(id);
		if (this.activeCharacter === "archer") return this.getArcherFeatureLevel(id);
		if (this.activeCharacter === "rogue") return this.getRogueFeatureLevel(id);
		return this.getKnightFeatureLevel(id);
	}

	private updateSkillsInfoMenuContent() {
		const title = document.getElementById("skills-info-title");
		const list = document.getElementById("skills-info-list");
		if (!title || !list) return;
		title.textContent = `${this.getCharacterDisplayName(this.activeCharacter)} SKILLS`;
		list.textContent = "";

		const skillInfo = this.getCharacterSkillInfo(this.activeCharacter);
		const characterIconType = this.getSpecialIconTypeForCharacter(this.activeCharacter);
		const frame = Phaser.Math.Clamp(characterIconType - 1, 0, 31);
		const iconColumns = 8;
		const iconCol = frame % iconColumns;
		const iconRow = Math.floor(frame / iconColumns);
		const iconBgPos = `${-iconCol * 32}px ${-iconRow * 32}px`;
		skillInfo.forEach((skill, index) => {
			const row = document.createElement("div");
			row.className = "skill-info-row";

			const textWrap = document.createElement("div");
			textWrap.className = "skill-info-text";
			const name = document.createElement("div");
			name.className = "skill-info-name";
			name.textContent = skill.name;
			const desc = document.createElement("div");
			desc.className = "skill-info-desc";
			desc.textContent = skill.desc;

			textWrap.appendChild(name);
			textWrap.appendChild(desc);
			const featureId = (index + 1) as 1 | 2 | 3 | 4 | 5;
			if (this.getActiveCharacterFeatureLevel(featureId) > 0) {
				const icon = document.createElement("div");
				icon.className = "skill-info-icon";
				icon.style.backgroundPosition = iconBgPos;
				row.appendChild(icon);
			}
			row.appendChild(textWrap);
			list.appendChild(row);
		});
	}

	private getCharacterSpriteClass(type: "knight" | "mage" | "archer" | "rogue") {
		if (type === "knight") return "char-sprite-knight";
		if (type === "mage") return "char-sprite-mage";
		if (type === "archer") return "char-sprite-archer";
		return "char-sprite-rogue";
	}

	private updateCharacterSelectMenuOptions() {
		const ids = ["btn-char-option-1", "btn-char-option-2", "btn-char-option-3"] as const;
		const allSpriteClasses = ["char-sprite-knight", "char-sprite-mage", "char-sprite-archer", "char-sprite-rogue"];
		ids.forEach((id, idx) => {
			const btn = document.getElementById(id) as HTMLButtonElement | null;
			if (!btn) return;
			const nameEl = btn.querySelector(".char-name") as HTMLSpanElement | null;
			const spriteEl = btn.querySelector(".char-sprite") as HTMLSpanElement | null;
			const candidate = this.characterSelectCandidates[idx];
			if (!candidate) {
				if (nameEl) nameEl.textContent = "";
				btn.dataset.character = "";
				btn.style.display = "none";
				btn.style.pointerEvents = "none";
				return;
			}
			if (nameEl) nameEl.textContent = this.getCharacterDisplayName(candidate);
			if (spriteEl) {
				allSpriteClasses.forEach((className) => spriteEl.classList.remove(className));
				spriteEl.classList.add(this.getCharacterSpriteClass(candidate));
			}
			btn.dataset.character = candidate;
			btn.style.display = "flex";
			btn.style.pointerEvents = "auto";
		});
	}

	private showCharacterSelectMenu() {
		const menu = document.getElementById("character-select-menu");
		if (!menu) return;
		this.updateCharacterSelectMenuOptions();
		menu.classList.remove("hidden");
		const el = menu as HTMLElement;
		el.style.display = "block";
		el.style.pointerEvents = "auto";
	}

	private hideCharacterSelectMenu() {
		const menu = document.getElementById("character-select-menu");
		if (!menu) return;
		menu.classList.add("hidden");
		const el = menu as HTMLElement;
		el.style.display = "none";
		el.style.pointerEvents = "none";
	}

	private chooseCharacterFromSelect(type: "knight" | "mage" | "archer" | "rogue") {
		if (!this.characterSelectActive || !this.player || this.activeCharacter === type) return;
		this.closeCharacterSelectMenu(true);

		this.createPuffEffect(this.player.x, this.player.y, 3.2, 64);
		this.cameras.main.shake(420, 0.03);
		this.playFx("characterChange", { volume: 0.8 });
		this.triggerHaptic("heavy");
		this.triggerHaptic("success");
		this.showWaveMessage("Character Changed!");

		this.setActiveCharacter(type);
		this.playerHp = this.playerMaxHp;
		this.updateHearts();
	}

	private closeCharacterSelectMenu(resumeGameplay: boolean) {
		this.hideCharacterSelectMenu();
		if (this.characterSelectOverlay?.active) this.characterSelectOverlay.destroy(true);
		this.characterSelectOverlay = undefined;
		this.characterSelectCandidates = [];
		this.characterSelectHitAreas = [];
		this.characterSelectActive = false;
		if (!resumeGameplay) return;
		this.isPaused = false;
		this.physics.world.isPaused = false;
		this.time.timeScale = 1;
		this.tweens.timeScale = 1;
	}

	private startMageCast() {
		if (!this.player) return;
		if (this.mageCasting) return;
		this.mageCasting = true;
		const offset = this.scaledTileSize > 0 ? this.scaledTileSize * 0.4 : 20;
		const dir = this.player.flipX ? -1 : 1;
		const x = this.player.x + dir * offset;
		const y = this.player.y - 6;
		const cast = this.add.sprite(x, y, "mage_fireball", 0);
		cast.setDepth(this.player.depth + 1);
		cast.setScale(2);
		cast.setFlipX(this.player.flipX);
		cast.play("mage-cast");
		this.mageCastSprite = cast;
		this.time.delayedCall(250, () => {
			if (this.mageCasting) {
				this.playFx("mageShoot", { volume: 0.7 });
			}
		});
		cast.on("animationcomplete", () => {
			if (!this.mageCasting) {
				cast.destroy();
				return;
			}
			this.fireMageAttack();
			this.mageCasting = false;
			cast.destroy();
			if (this.mageCastSprite === cast) this.mageCastSprite = undefined;
		});
	}

	private updateMageCasting() {
		if (!this.mageCasting || !this.mageCastSprite || !this.player) return;
		const offset = this.scaledTileSize > 0 ? this.scaledTileSize * 0.4 : 20;
		const dir = this.player.flipX ? -1 : 1;
		this.mageCastSprite.setPosition(this.player.x + dir * offset, this.player.y - 6);
		this.mageCastSprite.setFlipX(this.player.flipX);
	}

	private fireMageAttack() {
		if (!this.player || !this.mageFireballs) return;
		this.mageAutoAttackCount += 1;

		const triggerChain =
			this.mageFeature1LightningChainEnabled &&
			this.mageAutoAttackCount % this.mageFeature1EveryAutoAttacks === 0;
		const triggerSupernova =
			this.mageFeature2SupernovaEnabled &&
			this.mageAutoAttackCount % this.mageFeature2EveryAutoAttacks === 0;
		const triggerFreezeZone =
			this.mageFeature3FreezeZoneEnabled &&
			this.mageAutoAttackCount % this.mageFeature3EveryAutoAttacks === 0;
		const triggerPoisonZone =
			this.mageFeature4PoisonZoneEnabled &&
			this.mageAutoAttackCount % this.mageFeature4EveryAutoAttacks === 0;
		const triggerLaserBeam =
			this.mageFeature5LaserBeamEnabled &&
			this.mageAutoAttackCount % this.getMageFeature5EveryAutoAttacks() === 0;

		if (triggerLaserBeam) {
			this.castMageLaserBeam();
			return;
		}

		this.spawnMageFireball({
			chainLightning: triggerChain,
			supernova: triggerSupernova,
			freezeZone: triggerFreezeZone,
			poisonZone: triggerPoisonZone
		});
	}

	private spawnMageFireball(config?: {
		chainLightning?: boolean;
		supernova?: boolean;
		freezeZone?: boolean;
		poisonZone?: boolean;
	}) {
		if (!this.player || !this.mageFireballs) return;
		const offset = this.scaledTileSize > 0 ? this.scaledTileSize * 0.9 : 34;
		const dir = this.getPlayerFacingDirection();
		const startX = this.player.x + dir * offset;
		const pBody = this.player.body as Phaser.Physics.Arcade.Body;
		const startY = (pBody ? pBody.center.y : this.player.y) + 0;
		const fireball = this.physics.add.image(startX, startY, "mage_fireball", 5);
		fireball.setDepth(this.player.depth + 1);
		fireball.setScale(2);
		fireball.setFlipX(this.player.flipX);
		fireball.setData("bornAt", this.time.now);
		fireball.setData("collideAt", this.time.now + 150);
		fireball.setData("lastX", startX);
		fireball.setData("lastY", startY);
		fireball.setData("speed", 320);
		fireball.setData("seekRange", (this.scaledTileSize || 64) * 6);
		fireball.setData("direction", dir);
		fireball.setData("chainLightning", Boolean(config?.chainLightning));
		fireball.setData("supernova", Boolean(config?.supernova));
		fireball.setData("freezeZone", Boolean(config?.freezeZone));
		fireball.setData("poisonZone", Boolean(config?.poisonZone));
		if (config?.chainLightning) fireball.setTint(0x79d6ff);
		if (config?.supernova) fireball.setTint(0xffc27a);
		if (config?.freezeZone) fireball.setTint(0xa7e8ff);
		if (config?.poisonZone) fireball.setTint(0x92ffa5);
		const closeTarget = this.findNearestEnemyAnyRange(this.player.x, this.player.y, (this.scaledTileSize || 64) * 0.75);
		fireball.setData("target", closeTarget ?? this.findNearestEnemyInFront(startX, startY, dir, fireball.getData("seekRange")));
		const body = fireball.body as Phaser.Physics.Arcade.Body;
		body.setAllowGravity(false);
		body.setSize(32 / 3, 32 / 3);
		body.setOffset((32 - 32 / 3) / 2, (32 - 32 / 3) / 2);

		const target = fireball.getData("target") as Phaser.Physics.Arcade.Sprite | null;
		if (target && target.active) {
			this.setFireballVelocityTowards(fireball, target.x, target.y);
		} else {
			body.setVelocity(dir * (fireball.getData("speed") as number), 0);
		}

		this.mageFireballs.add(fireball);
	}

	private updateMageFireballs() {
		if (!this.mageFireballs) return;
		const now = this.time.now;
		this.mageFireballs.getChildren().forEach((obj) => {
			const fireball = obj as Phaser.Physics.Arcade.Image;
			if (!fireball.active) return;
			const prevX = (fireball.getData("lastX") as number) ?? fireball.x;
			const prevY = (fireball.getData("lastY") as number) ?? fireball.y;
			const bornAt = (fireball.getData("bornAt") as number) || 0;
			if (now - bornAt > 2600) {
				this.destroyMageFireball(fireball);
				return;
			}
			const hitChest = this.findChestHitAlongPath(prevX, prevY, fireball.x, fireball.y);
			if (hitChest) {
				this.openChest(hitChest);
				this.destroyMageFireball(fireball);
				return;
			}
			const body = fireball.body as Phaser.Physics.Arcade.Body;
			if (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down) {
				this.destroyMageFireball(fireball);
				return;
			}
			const target = fireball.getData("target") as Phaser.Physics.Arcade.Sprite | null;
			const range = (fireball.getData("seekRange") as number) || 0;
			const dir = (fireball.getData("direction") as number) || 1;
			let hasValidTarget = false;
			if (target && target.active) {
				const dist = Phaser.Math.Distance.Between(fireball.x, fireball.y, target.x, target.y);
				if (dist <= range && this.isTargetInFront(fireball.x, target.x, dir)) {
					this.setFireballVelocityTowards(fireball, target.x, target.y);
					hasValidTarget = true;
				}
			}
			if (!hasValidTarget) {
				const closeTarget = this.findNearestEnemyAnyRange(fireball.x, fireball.y, (this.scaledTileSize || 64) * 0.75);
				if (closeTarget) {
					fireball.setData("target", closeTarget);
					this.setFireballVelocityTowards(fireball, closeTarget.x, closeTarget.y);
					hasValidTarget = true;
				}
			}
			if (!hasValidTarget) {
				body.setVelocity(dir * (fireball.getData("speed") as number), 0);
			}
			fireball.setData("lastX", fireball.x);
			fireball.setData("lastY", fireball.y);
		});
	}

	private handleMageFireballEnemyHit(fireball: Phaser.Physics.Arcade.Image, enemy: Phaser.Physics.Arcade.Sprite) {
		const baseDamage = this.damageMultiplier;
		const dealt = this.damageEnemy(enemy, baseDamage);
		if (dealt && fireball.getData("chainLightning")) {
			this.triggerMageLightningChain(enemy, baseDamage);
		}
		if (fireball.getData("supernova")) {
			this.triggerMageSupernova(enemy.x, enemy.y, baseDamage * 1.05);
		}
		if (fireball.getData("freezeZone")) {
			this.spawnMageFreezeZone(enemy.x, enemy.y);
		}
		if (fireball.getData("poisonZone")) {
			this.spawnMagePoisonZone(enemy.x, enemy.y);
		}
		this.destroyMageFireball(fireball);
	}

	private triggerMageLightningChain(sourceEnemy: Phaser.Physics.Arcade.Sprite, baseDamage: number) {
		if (!this.enemies || !sourceEnemy.active) return;
		const chainRadius = (this.scaledTileSize || 64) * 4;
		const chainDamage = baseDamage * 0.5;
		const maxJumps = 4;
		const visited = new Set<Phaser.Physics.Arcade.Sprite>([sourceEnemy]);
		let current: Phaser.Physics.Arcade.Sprite | null = sourceEnemy;

		for (let i = 0; i < maxJumps; i++) {
			if (!current || !current.active) break;
			let next: Phaser.Physics.Arcade.Sprite | null = null;
			let bestDist = Number.POSITIVE_INFINITY;
			this.enemies.getChildren().forEach((obj) => {
				const enemy = obj as Phaser.Physics.Arcade.Sprite;
				if (!enemy.active) return;
				if (enemy.getData("state") === "dying") return;
				if (visited.has(enemy)) return;
				const dist = Phaser.Math.Distance.Between(current!.x, current!.y, enemy.x, enemy.y);
				if (dist <= chainRadius && dist < bestDist) {
					bestDist = dist;
					next = enemy;
				}
			});
			if (!next) break;
			visited.add(next);
			this.createChainLightning(current.x, current.y, next.x, next.y);
			const dealt = this.damageEnemy(next, chainDamage, true, 0.7, true);
			if (dealt) {
				const spark = this.add.circle(next.x, next.y, 8, 0x9ee7ff, 0.45);
				spark.setDepth(next.depth + 0.2);
				spark.setBlendMode(Phaser.BlendModes.ADD);
				this.tweens.add({
					targets: spark,
					alpha: 0,
					scaleX: 1.7,
					scaleY: 1.7,
					duration: 160,
					ease: "Cubic.easeOut",
					onComplete: () => spark.destroy()
				});
			}
			current = next;
		}
	}

	private triggerMageSupernova(x: number, y: number, baseDamage: number) {
		if (!this.enemies) return;
		const radius = (this.scaledTileSize || 64) * 1.9 * this.getMageFeature2SupernovaRadiusScale();
		const blast = this.add.circle(x, y, radius * 0.38, 0xffc682, 0.52);
		blast.setDepth((this.player?.depth ?? 10) + 2.5);
		blast.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: blast,
			scaleX: 1.9,
			scaleY: 1.9,
			alpha: 0,
			duration: 200,
			ease: "Cubic.easeOut",
			onComplete: () => blast.destroy()
		});
		const shock = this.add.circle(x, y, radius * 0.18, 0xfff1cc, 0);
		shock.setStrokeStyle(3, 0xffdf9a, 0.9);
		shock.setDepth((this.player?.depth ?? 10) + 2.6);
		this.tweens.add({
			targets: shock,
			scaleX: 2.6,
			scaleY: 2.6,
			alpha: 0,
			duration: 240,
			ease: "Sine.easeOut",
			onComplete: () => shock.destroy()
		});
		this.enemies.getChildren().forEach((obj) => {
			const enemy = obj as Phaser.Physics.Arcade.Sprite;
			if (!enemy.active) return;
			if (enemy.getData("state") === "dying") return;
			const enemyRadius = Math.max(enemy.displayWidth, enemy.displayHeight) * 0.22;
			const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
			if (dist > radius + enemyRadius) return;
			const t = Phaser.Math.Clamp(dist / Math.max(1, radius), 0, 1);
			const dmg = baseDamage * (1.4 - t * 0.6);
			const kbScale = Math.max(0.65, 1.45 - t * 0.6);
			this.damageEnemy(enemy, dmg, false, kbScale, true);
		});
	}

	private spawnMageFreezeZone(x: number, y: number) {
		if (!this.mageFreezeZones) return;
		const zoneRadius = this.mageFeature3ZoneRadius * this.getMageFeature3FreezeZoneRadiusScale();
		const zone = this.add.circle(x, y, zoneRadius, 0x95e8ff, 0.2);
		zone.setStrokeStyle(2, 0xd6f6ff, 0.82);
		zone.setDepth((this.player?.depth ?? 10) - 0.3);
		zone.setBlendMode(Phaser.BlendModes.ADD);
		zone.setData("expiresAt", this.time.now + this.mageFeature3ZoneDurationMs);
		zone.setData("slowMultiplier", this.mageFeature3SlowMultiplier);
		zone.setData("baseRadius", zoneRadius);
		this.mageFreezeZones.add(zone);
	}

	private spawnMagePoisonZone(x: number, y: number) {
		if (!this.magePoisonZones) return;
		const zoneRadius = this.mageFeature4ZoneRadius * this.getMageFeature4PoisonZoneRadiusScale();
		const zone = this.add.circle(x, y, zoneRadius, 0x36ff62, 0.22);
		zone.setStrokeStyle(2, 0xa6ffb7, 0.88);
		zone.setDepth((this.player?.depth ?? 10) - 0.28);
		zone.setBlendMode(Phaser.BlendModes.ADD);
		zone.setData("expiresAt", this.time.now + this.mageFeature4ZoneDurationMs);
		zone.setData("nextTickAt", this.time.now + this.mageFeature4DotTickMs);
		zone.setData("baseRadius", zoneRadius);
		this.magePoisonZones.add(zone);
	}

	private updateMageFeatureZones() {
		const now = this.time.now;
		if (this.mageFreezeZones) {
			this.mageFreezeZones.getChildren().forEach((obj) => {
				const zone = obj as Phaser.GameObjects.Arc;
				if (!zone.active) return;
				const expiresAt = (zone.getData("expiresAt") as number) || 0;
				if (expiresAt > 0 && now >= expiresAt) {
					zone.destroy();
					return;
				}
				const baseRadius = (zone.getData("baseRadius") as number) || this.mageFeature3ZoneRadius;
				const pulse = 1 + Math.sin(now * 0.012 + zone.x * 0.01) * 0.06;
				zone.setRadius(baseRadius * pulse);
			});
		}
		if (this.magePoisonZones) {
			this.magePoisonZones.getChildren().forEach((obj) => {
				const zone = obj as Phaser.GameObjects.Arc;
				if (!zone.active) return;
				const expiresAt = (zone.getData("expiresAt") as number) || 0;
				if (expiresAt > 0 && now >= expiresAt) {
					zone.destroy();
					return;
				}
				const baseRadius = (zone.getData("baseRadius") as number) || this.mageFeature4ZoneRadius;
				const pulse = 1 + Math.sin(now * 0.016 + zone.y * 0.01) * 0.08;
				zone.setRadius(baseRadius * pulse);

				const nextTickAt = (zone.getData("nextTickAt") as number) || 0;
				if (now < nextTickAt || !this.enemies) return;
				zone.setData("nextTickAt", now + this.mageFeature4DotTickMs);
				this.enemies.getChildren().forEach((enemyObj) => {
					const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
					if (!enemy.active) return;
					if (enemy.getData("state") === "dying") return;
					const enemyRadius = Math.max(enemy.displayWidth, enemy.displayHeight) * 0.2;
					const dist = Phaser.Math.Distance.Between(zone.x, zone.y, enemy.x, enemy.y);
					if (dist > zone.radius + enemyRadius) return;
					this.damageEnemy(
						enemy,
						this.mageFeature4DotDamage * this.damageMultiplier,
						false,
						0.35,
						true
					);
				});
			});
		}
	}

	private getMageEnemySpeedMultiplier(enemy: Phaser.Physics.Arcade.Sprite) {
		if (!this.mageFreezeZones) return 1;
		const now = this.time.now;
		let mult = 1;
		this.mageFreezeZones.getChildren().forEach((obj) => {
			const zone = obj as Phaser.GameObjects.Arc;
			if (!zone.active) return;
			const expiresAt = (zone.getData("expiresAt") as number) || 0;
			if (expiresAt > 0 && now >= expiresAt) return;
			const slowMultiplier = (zone.getData("slowMultiplier") as number) || this.mageFeature3SlowMultiplier;
			const enemyRadius = Math.max(enemy.displayWidth, enemy.displayHeight) * 0.2;
			const dist = Phaser.Math.Distance.Between(zone.x, zone.y, enemy.x, enemy.y);
			if (dist <= zone.radius + enemyRadius) {
				mult = Math.min(mult, slowMultiplier);
			}
		});
		return mult;
	}

	private castMageLaserBeam() {
		if (!this.player) return;
		const dir = this.getPlayerFacingDirection();
		const pBody = this.player.body as Phaser.Physics.Arcade.Body | undefined;
		const beamY = pBody ? pBody.center.y : this.player.y;
		const beamStartX = this.player.x + dir * ((this.scaledTileSize || 64) * 0.8);
		const beamLength = (this.scaledTileSize || 64) * 8;
		const beamEndX = beamStartX + dir * beamLength;
		const beamWidth = (this.scaledTileSize || 64) * 0.82;
		const centerX = (beamStartX + beamEndX) * 0.5;

		const outer = this.add.rectangle(centerX, beamY, beamLength, beamWidth, 0x9fe9ff, 0.32);
		outer.setBlendMode(Phaser.BlendModes.ADD);
		outer.setDepth(this.player.depth + 2);
		const inner = this.add.rectangle(centerX, beamY, beamLength, beamWidth * 0.45, 0xffffff, 0.68);
		inner.setBlendMode(Phaser.BlendModes.ADD);
		inner.setDepth(this.player.depth + 2.1);
		this.mageLaserVisuals?.add(outer);
		this.mageLaserVisuals?.add(inner);

		const beamMinX = Math.min(beamStartX, beamEndX);
		const beamMaxX = Math.max(beamStartX, beamEndX);
		if (this.enemies) {
			this.enemies.getChildren().forEach((obj) => {
				const enemy = obj as Phaser.Physics.Arcade.Sprite;
				if (!enemy.active) return;
				if (enemy.getData("state") === "dying") return;
				if (enemy.x < beamMinX || enemy.x > beamMaxX) return;
				const enemyRadius = Math.max(enemy.displayWidth, enemy.displayHeight) * 0.2;
				if (Math.abs(enemy.y - beamY) > beamWidth * 0.5 + enemyRadius) return;
				this.damageEnemy(
					enemy,
					this.damageMultiplier * 1.8,
					false,
					1.2,
					true
				);
			});
		}

		this.cameras.main.shake(120, 0.003);
		this.tweens.add({
			targets: [outer, inner],
			alpha: 0,
			scaleY: 0.8,
			duration: 190,
			ease: "Sine.easeOut",
			onComplete: () => {
				outer.destroy();
				inner.destroy();
			}
		});
	}

	private clearMageFeatureObjects() {
		if (this.mageFreezeZones) {
			this.mageFreezeZones.getChildren().forEach((obj) => {
				const zone = obj as Phaser.GameObjects.Arc;
				if (zone.active) zone.destroy();
			});
		}
		if (this.magePoisonZones) {
			this.magePoisonZones.getChildren().forEach((obj) => {
				const zone = obj as Phaser.GameObjects.Arc;
				if (zone.active) zone.destroy();
			});
		}
		if (this.mageLaserVisuals) {
			this.mageLaserVisuals.getChildren().forEach((obj) => {
				const beam = obj as Phaser.GameObjects.Rectangle;
				if (beam.active) beam.destroy();
			});
		}
	}

	private startArcherCast() {
		if (!this.player) return;
		if (this.archerCasting) return;
		this.archerCasting = true;
		const attackAnim = this.anims.get("archer-attack");
		const durationMs = attackAnim?.duration ?? 600;
		const shootDelay = Math.max(0, Math.round(durationMs * 0.58));
		this.time.delayedCall(shootDelay, () => {
			if (!this.archerCasting) return;
			this.fireArcherAttack();
			this.playFx("playerShoot", { volume: 0.7 });
			this.archerCasting = false;
		});
	}

	private updateArcherCasting() {
		// No pre-cast sprite; handled via timed shot.
	}

	private fireArcherAttack() {
		if (!this.player || !this.archerArrows) return;
		this.archerAutoAttackCount += 1;

		const isPiercing =
			this.archerFeature1PiercingArrowEnabled &&
			this.archerAutoAttackCount % this.archerFeature1EveryAutoAttacks === 0;
		const isExplosive =
			this.archerFeature2ExplosiveShotEnabled &&
			this.archerAutoAttackCount % this.archerFeature2EveryAutoAttacks === 0;
		const isBinding =
			this.archerFeature4BindingShotEnabled &&
			this.archerAutoAttackCount % this.archerFeature4EveryAutoAttacks === 0;
		let spreadAngles = [0];
		if (this.archerFeature3ArchArrowEnabled) {
			const arrowCount = this.getArcherFeature3ArrowCount();
			const step = 0.16;
			const start = -step * (arrowCount - 1) * 0.5;
			spreadAngles = Array.from({ length: arrowCount }, (_, i) => start + i * step);
		}
		const bindingArrowIndex = Math.floor(spreadAngles.length / 2);

		spreadAngles.forEach((spreadAngle, index) => {
			this.spawnArcherArrow({
				spreadAngle,
				piercing: isPiercing,
				explosive: isExplosive,
				binding: isBinding && index === bindingArrowIndex
			});
		});

		if (isPiercing || isExplosive || isBinding) {
			this.cameras.main.shake(80, 0.0012);
		}
	}

	private spawnArcherArrow(config: { spreadAngle: number; piercing: boolean; explosive: boolean; binding: boolean }) {
		if (!this.player || !this.archerArrows) return;
		const dir = this.getPlayerFacingDirection();
		const pBody = this.player.body as Phaser.Physics.Arcade.Body | undefined;
		const bodyCenterX = pBody ? pBody.center.x : this.player.x;
		const bodyCenterY = pBody ? pBody.center.y : this.player.y;
		const handOffsetX = (this.scaledTileSize || 64) * 0.52;
		const startX = bodyCenterX + dir * handOffsetX;
		const startY = bodyCenterY - 4;
		const seekRange = (this.scaledTileSize || 64) * this.archerArrowSeekRangeTiles;
		const target = this.findBestArcherTarget(startX, startY, dir, seekRange);
		const arrow = this.physics.add.sprite(startX, startY, "archer_arrow", 0);
		arrow.setDepth(this.player.depth + 2);
		arrow.setScale(2);
		arrow.setFlipX(false);
		arrow.play("archer-arrow");
		let tintColor = 0xffffff;
		if (config.binding) tintColor = 0xffe06a;
		if (config.explosive) tintColor = 0xffbb7d;
		if (config.piercing) tintColor = 0x6ec7ff;
		arrow.setTint(tintColor);
		arrow.setData("bornAt", this.time.now);
		arrow.setData("collideAt", this.time.now + this.archerArrowCollideDelayMs);
		arrow.setData("lastX", startX);
		arrow.setData("lastY", startY);
		arrow.setData("nextTrailAt", this.time.now);
		arrow.setData("speed", this.archerArrowSpeed);
		arrow.setData("direction", dir);
		arrow.setData("target", target ?? null);
		arrow.setData("piercing", config.piercing);
		arrow.setData("explosive", config.explosive);
		arrow.setData("binding", config.binding);
		arrow.setData("bindingApplied", false);
		arrow.setData("hitEnemies", new Set<Phaser.Physics.Arcade.Sprite>());
		arrow.setData("explosionRadius", (this.scaledTileSize || 64) * 1.3 * this.getArcherFeature2ExplosionScale());
		let damageScale = 1;
		if (config.piercing) damageScale *= 1.4;
		if (config.explosive) damageScale *= 1.15;
		if (config.binding) damageScale *= 1.08;
		arrow.setData("damageScale", damageScale);

		let aimDirX = dir;
		let aimDirY = 0;
		if (target && target.active) {
			const targetBody = target.body as Phaser.Physics.Arcade.Body | undefined;
			const leadX = target.x + ((targetBody?.velocity.x ?? 0) * 0.12);
			const leadY = target.y + ((targetBody?.velocity.y ?? 0) * 0.12);
			const dx = leadX - startX;
			const dy = leadY - startY;
			const len = Math.hypot(dx, dy) || 1;
			aimDirX = dx / len;
			aimDirY = Phaser.Math.Clamp(dy / len, -0.65, 0.65);
			// Never shoot backwards even if target crosses behind at release frame.
			if (aimDirX * dir < 0.08) {
				aimDirX = dir;
				aimDirY = Phaser.Math.Clamp(aimDirY, -0.35, 0.35);
			}
		}

		const spread = config.spreadAngle + Phaser.Math.FloatBetween(-0.02, 0.02);
		const cos = Math.cos(spread);
		const sin = Math.sin(spread);
		let dirX = aimDirX * cos - aimDirY * sin;
		let dirY = aimDirX * sin + aimDirY * cos;
		const dirLen = Math.hypot(dirX, dirY) || 1;
		dirX /= dirLen;
		dirY /= dirLen;

		const body = arrow.body as Phaser.Physics.Arcade.Body;
		body.setAllowGravity(false);
		const hitW = 14;
		const hitH = 8;
		body.setSize(hitW, hitH);
		body.setOffset((arrow.width - hitW) / 2, (arrow.height - hitH) / 2);
		const speed = (arrow.getData("speed") as number) || this.archerArrowSpeed;
		const aimVX = dirX * speed;
		const aimVY = dirY * speed;
		arrow.setData("aimVX", aimVX);
		arrow.setData("aimVY", aimVY);
		body.setVelocity(aimVX, aimVY);
		this.orientArcherArrow(arrow);

		this.archerArrows.add(arrow);
	}

	private updateArcherArrows() {
		if (!this.archerArrows) return;
		const now = this.time.now;
		this.archerArrows.getChildren().forEach((obj) => {
			const arrow = obj as Phaser.Physics.Arcade.Image;
			if (!arrow.active) return;
			const prevX = (arrow.getData("lastX") as number) ?? arrow.x;
			const prevY = (arrow.getData("lastY") as number) ?? arrow.y;
			const bornAt = (arrow.getData("bornAt") as number) || 0;
			if (now - bornAt > this.archerArrowLifeMs) {
				this.destroyArcherArrow(arrow);
				return;
			}
			const body = arrow.body as Phaser.Physics.Arcade.Body;
			if (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down) {
				this.handleArcherArrowObstacleCollision(arrow);
				return;
			}
			const aimVX = (arrow.getData("aimVX") as number) ?? 0;
			const aimVY = (arrow.getData("aimVY") as number) ?? 0;
			if (Math.abs(aimVX) + Math.abs(aimVY) > 0.001) {
				body.setVelocity(aimVX, aimVY);
			}
			if (this.canFireballCollide(arrow)) {
				const isPiercing = Boolean(arrow.getData("piercing"));
				const isExplosive = Boolean(arrow.getData("explosive"));
				const isBinding = Boolean(arrow.getData("binding"));
				const damageScale = (arrow.getData("damageScale") as number) || 1;
				const explosionRadius =
					(arrow.getData("explosionRadius") as number) ||
					(this.scaledTileSize || 64) * 1.3;
				let hitEnemies = arrow.getData("hitEnemies") as Set<Phaser.Physics.Arcade.Sprite> | undefined;
				if (!hitEnemies) {
					hitEnemies = new Set<Phaser.Physics.Arcade.Sprite>();
					arrow.setData("hitEnemies", hitEnemies);
				}

				const enemyHits = this.findEnemyHitsAlongPath(prevX, prevY, arrow.x, arrow.y, 10);
				if (enemyHits.length > 0) {
					let lastHitX = arrow.x;
					let lastHitY = arrow.y;
					let hitAnything = false;
					for (const hitEnemy of enemyHits) {
						if (!hitEnemy.active) continue;
						if (hitEnemies.has(hitEnemy)) continue;
						hitEnemies.add(hitEnemy);
						hitAnything = true;
						lastHitX = hitEnemy.x;
						lastHitY = hitEnemy.y;

						if (isExplosive) {
							this.triggerArcherExplosion(
								lastHitX,
								lastHitY,
								this.damageMultiplier * damageScale,
								explosionRadius
							);
						} else {
							const dealt = this.damageEnemy(
								hitEnemy,
								this.damageMultiplier * damageScale,
								false,
								isPiercing ? 0.85 : 1
							);
							if (dealt) {
								this.playFx("enemyHit", { volume: 0.6 });
							}
						}

						if (isBinding && !(arrow.getData("bindingApplied") as boolean)) {
							this.applyArcherBinding(hitEnemy);
							arrow.setData("bindingApplied", true);
						}

						if (isExplosive || !isPiercing) {
							this.createArcherArrowImpact(lastHitX, lastHitY, this.getArcherArrowImpactColor(arrow));
							this.destroyArcherArrow(arrow, false);
							return;
						}
					}

					if (hitAnything) {
						this.createArcherArrowImpact(lastHitX, lastHitY, this.getArcherArrowImpactColor(arrow));
					}
				}

				const hitChest = this.findChestHitAlongPath(prevX, prevY, arrow.x, arrow.y);
				if (hitChest) {
					if (isExplosive) {
						this.triggerArcherExplosion(
							hitChest.x,
							hitChest.y,
							this.damageMultiplier * damageScale * 0.85,
							explosionRadius * 0.9
						);
					}
					this.openChest(hitChest);
					this.createArcherArrowImpact(hitChest.x, hitChest.y, this.getArcherArrowImpactColor(arrow));
					this.destroyArcherArrow(arrow, false);
					return;
				}
			}
			const nextTrailAt = (arrow.getData("nextTrailAt") as number) || 0;
			if (now >= nextTrailAt) {
				if (arrow.getData("piercing")) {
					this.createArcherArrowCloneTrail(arrow);
				} else {
					this.createArcherArrowTrail(arrow.x, arrow.y, this.getArcherArrowTrailColor(arrow));
				}
				arrow.setData("nextTrailAt", now + this.archerArrowTrailIntervalMs);
			}
			this.orientArcherArrow(arrow);
			arrow.setData("lastX", arrow.x);
			arrow.setData("lastY", arrow.y);
		});
	}

	private getArcherArrowTrailColor(arrow: Phaser.Physics.Arcade.Image) {
		if (arrow.getData("explosive")) return 0xffa55b;
		if (arrow.getData("binding")) return 0xffdf73;
		if (arrow.getData("piercing")) return 0x78cdff;
		return 0xf7df8b;
	}

	private getArcherArrowImpactColor(arrow: Phaser.Physics.Arcade.Image) {
		if (arrow.getData("explosive")) return 0xffb16b;
		if (arrow.getData("binding")) return 0xffea96;
		if (arrow.getData("piercing")) return 0x8fd8ff;
		return 0xd6e0ff;
	}

	private orientArcherArrow(arrow: Phaser.Physics.Arcade.Image) {
		const body = arrow.body as Phaser.Physics.Arcade.Body | undefined;
		if (!body) return;
		const vx = body.velocity.x;
		const vy = body.velocity.y;
		if (Math.abs(vx) + Math.abs(vy) < 1) return;
		const targetAngle = Math.atan2(vy, vx);
		arrow.setRotation(targetAngle);
	}

	private handleArcherArrowObstacleCollision(arrow: Phaser.Physics.Arcade.Image) {
		if (!arrow.active || !this.canFireballCollide(arrow)) return;
		const isExplosive = Boolean(arrow.getData("explosive"));
		if (isExplosive) {
			const damageScale = (arrow.getData("damageScale") as number) || 1;
			const explosionRadius =
				((arrow.getData("explosionRadius") as number) || ((this.scaledTileSize || 64) * 1.3)) * 0.9;
			this.triggerArcherExplosion(
				arrow.x,
				arrow.y,
				this.damageMultiplier * damageScale * 0.9,
				explosionRadius
			);
			this.createArcherArrowImpact(arrow.x, arrow.y, 0xffb16b);
			this.destroyArcherArrow(arrow, false);
			return;
		}
		this.destroyArcherArrow(arrow);
	}

	private triggerArcherExplosion(x: number, y: number, baseDamage: number, radius: number) {
		this.createArcherExplosionEffect(x, y, radius);
		if (!this.enemies) return;
		let hitCount = 0;
		this.enemies.getChildren().forEach((obj) => {
			const enemy = obj as Phaser.Physics.Arcade.Sprite;
			if (!enemy.active) return;
			if (enemy.getData("state") === "dying") return;
			const enemyRadius = Math.max(enemy.displayWidth, enemy.displayHeight) * 0.24;
			const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
			if (dist > radius + enemyRadius) return;

			const normalized = Phaser.Math.Clamp(dist / Math.max(1, radius), 0, 1);
			const damageFalloff = 1.12 - normalized * 0.5;
			const knockbackScale = (1.7 - normalized * 0.8) * this.getArcherFeature2ExplosionScale();
			const dealt = this.damageEnemy(
				enemy,
				baseDamage * damageFalloff,
				false,
				Math.max(0.6, knockbackScale)
			);
			if (dealt) hitCount += 1;
		});
		if (hitCount > 0) {
			this.playFx("enemyHit", { volume: 0.6 });
		}
	}

	private createArcherExplosionEffect(x: number, y: number, radius: number) {
		const blast = this.add.circle(x, y, Math.max(12, radius * 0.28), 0xffaa55, 0.62);
		blast.setDepth((this.player?.depth ?? 22) + 5);
		blast.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: blast,
			scaleX: 2.5,
			scaleY: 2.5,
			alpha: 0,
			duration: 170,
			ease: "Cubic.easeOut",
			onComplete: () => blast.destroy()
		});

		const shock = this.add.circle(x, y, Math.max(10, radius * 0.2), 0xffebc4, 0);
		shock.setStrokeStyle(2, 0xffd28f, 0.9);
		shock.setDepth((this.player?.depth ?? 22) + 5);
		this.tweens.add({
			targets: shock,
			scaleX: 2.2,
			scaleY: 2.2,
			alpha: 0,
			duration: 190,
			ease: "Sine.easeOut",
			onComplete: () => shock.destroy()
		});
	}

	private applyArcherBinding(enemy: Phaser.Physics.Arcade.Sprite) {
		const now = this.time.now;
		const rootedUntil = (enemy.getData("rootedUntil") as number) || 0;
		enemy.setData("rootedUntil", Math.max(rootedUntil, now + this.getArcherFeature4RootMs()));
		this.syncArcherBindingRing(enemy, enemy.getData("rootedUntil") as number);
	}

	private syncArcherBindingRing(enemy: Phaser.Physics.Arcade.Sprite, rootedUntil: number) {
		const now = this.time.now;
		const activeRoot = rootedUntil > now;
		const ring = enemy.getData("archerBindingRing") as Phaser.GameObjects.Arc | undefined;
		if (!activeRoot) {
			if (ring?.active) ring.destroy();
			enemy.setData("archerBindingRing", undefined);
			return;
		}

		let nextRing = ring;
		if (!nextRing || !nextRing.active) {
			nextRing = this.add.circle(enemy.x, enemy.y + enemy.displayHeight * 0.18, Math.max(12, enemy.displayWidth * 0.24), 0xffd84d, 0.2);
			nextRing.setStrokeStyle(2, 0xfff0aa, 0.9);
			nextRing.setDepth(enemy.depth + 0.25);
			enemy.setData("archerBindingRing", nextRing);
		}
		nextRing.setDepth(enemy.depth + 0.25);
		nextRing.setPosition(enemy.x, enemy.y + enemy.displayHeight * 0.18);
		const pulse = 1 + Math.sin(now * 0.015) * 0.08;
		nextRing.setScale(pulse, pulse * 0.95);
		nextRing.setAlpha(0.22 + (Math.sin(now * 0.02) * 0.05 + 0.05));
	}

	private clearArcherBindingRing(enemy: Phaser.Physics.Arcade.Sprite) {
		const ring = enemy.getData("archerBindingRing") as Phaser.GameObjects.Arc | undefined;
		if (ring?.active) ring.destroy();
		enemy.setData("archerBindingRing", undefined);
	}

	private destroyArcherArrow(arrow: Phaser.Physics.Arcade.Image, showPuff: boolean = true) {
		if (!arrow.active) return;
		if (showPuff) {
			this.createPuffEffect(arrow.x, arrow.y, 1, 16);
		}
		arrow.destroy();
	}

	private createArcherArrowTrail(x: number, y: number, color: number = 0xf7df8b) {
		const trail = this.add.ellipse(x, y, 12, 4, color, 0.46);
		trail.setDepth((this.player?.depth ?? 22) + 1);
		trail.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: trail,
			alpha: 0,
			scaleX: 1.8,
			scaleY: 1.25,
			duration: 120,
			ease: "Quad.easeOut",
			onComplete: () => trail.destroy()
		});
	}

	private createArcherArrowCloneTrail(arrow: Phaser.Physics.Arcade.Image) {
		const frame = arrow.frame.name as number | string;
		const ghost = this.add.image(arrow.x, arrow.y, "archer_arrow", frame);
		ghost.setScale(arrow.scaleX, arrow.scaleY);
		ghost.setRotation(arrow.rotation);
		ghost.setDepth(arrow.depth - 0.05);
		ghost.setTint(0x78cdff);
		ghost.setAlpha(0.52);
		ghost.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: ghost,
			alpha: 0,
			scaleX: ghost.scaleX * 0.9,
			scaleY: ghost.scaleY * 0.9,
			duration: 130,
			ease: "Quad.easeOut",
			onComplete: () => ghost.destroy()
		});
	}

	private createArcherArrowImpact(x: number, y: number, color: number) {
		const flash = this.add.circle(x, y, 7, color, 0.8);
		flash.setDepth((this.player?.depth ?? 22) + 4);
		flash.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: flash,
			alpha: 0,
			scaleX: 1.9,
			scaleY: 1.9,
			duration: 130,
			ease: "Cubic.easeOut",
			onComplete: () => flash.destroy()
		});
		for (let i = 0; i < 4; i++) {
			const spark = this.add.circle(x, y, Phaser.Math.Between(1, 2), 0xffffff, 0.9);
			spark.setDepth((this.player?.depth ?? 22) + 4);
			spark.setBlendMode(Phaser.BlendModes.ADD);
			const angle = (Math.PI * 2 * i) / 4 + Phaser.Math.FloatBetween(-0.35, 0.35);
			const dist = Phaser.Math.Between(11, 20);
			this.tweens.add({
				targets: spark,
				x: x + Math.cos(angle) * dist,
				y: y + Math.sin(angle) * dist,
				alpha: 0,
				duration: Phaser.Math.Between(90, 150),
				ease: "Quad.easeOut",
				onComplete: () => spark.destroy()
			});
		}
	}

	private updateArcherCompanions() {
		if (!this.archerCompanions || !this.player) return;
		const canRun =
			this.activeCharacter === "archer" &&
			this.archerFeature5HelpfulCompanionsEnabled &&
			!this.playerDead;
		const now = this.time.now;
		if (!canRun) {
			this.archerFeature5NextSpawnAt = 0;
			this.clearArcherCompanions();
			return;
		}

		if (this.archerFeature5NextSpawnAt <= 0) {
			this.archerFeature5NextSpawnAt = now + this.archerFeature5SpawnIntervalMs;
		}
		if (now >= this.archerFeature5NextSpawnAt) {
			this.spawnArcherCompanion();
			this.archerFeature5NextSpawnAt = now + this.archerFeature5SpawnIntervalMs;
		}

		this.archerCompanions.getChildren().forEach((obj) => {
			const companion = obj as Phaser.GameObjects.Arc;
			if (!companion.active) return;
			const expiresAt = (companion.getData("expiresAt") as number) || 0;
			if (expiresAt > 0 && now >= expiresAt) {
				this.destroyArcherCompanion(companion);
				return;
			}

			let orbitAngle = (companion.getData("orbitAngle") as number) || 0;
			const orbitRadius = (companion.getData("orbitRadius") as number) || 42;
			orbitAngle += 0.002 * (this.game.loop.delta || 16.6);
			companion.setData("orbitAngle", orbitAngle);
			const desiredX = this.player.x + Math.cos(orbitAngle) * orbitRadius;
			const desiredY = this.player.y - 16 + Math.sin(orbitAngle * 1.3) * 9;
			companion.setPosition(
				Phaser.Math.Linear(companion.x, desiredX, 0.18),
				Phaser.Math.Linear(companion.y, desiredY, 0.18)
			);
			const pulse = 1 + Math.sin(now * 0.02 + orbitAngle) * 0.08;
			companion.setScale(pulse, pulse);
			const nextPulseAt = (companion.getData("nextPulseAt") as number) || 0;
			if (now >= nextPulseAt) {
				this.createArcherCompanionPulse(companion.x, companion.y);
				companion.setData("nextPulseAt", now + 180);
			}

			const nextShotAt = (companion.getData("nextShotAt") as number) || 0;
			if (now < nextShotAt) return;
			const target = this.findNearestEnemyAnyRange(companion.x, companion.y, (this.scaledTileSize || 64) * 20);
			if (!target) {
				companion.setData("nextShotAt", now + 360);
				return;
			}
			this.spawnArcherCompanionProjectile(companion.x, companion.y, target.x, target.y);
			companion.setData("nextShotAt", now + Phaser.Math.Between(1040, 1280));
		});
	}

	private spawnArcherCompanion() {
		if (!this.player || !this.archerCompanions) return;
		const orbitAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
		const orbitRadius = Phaser.Math.Between(36, 50);
		const x = this.player.x + Math.cos(orbitAngle) * orbitRadius;
		const y = this.player.y - 16 + Math.sin(orbitAngle) * 8;
		const companion = this.add.circle(x, y, 13.5, 0xffffff, 0.95);
		companion.setDepth(this.player.depth + 1);
		companion.setStrokeStyle(2, 0xdff6ff, 0.9);
		companion.setBlendMode(Phaser.BlendModes.ADD);
		companion.setData("orbitAngle", orbitAngle);
		companion.setData("orbitRadius", orbitRadius);
		companion.setData("nextShotAt", this.time.now + Phaser.Math.Between(240, 720));
		companion.setData("expiresAt", this.time.now + this.getArcherFeature5LifetimeMs());
		companion.setData("nextPulseAt", this.time.now + 100);
		this.archerCompanions.add(companion);

		const spawnFlash = this.add.circle(x, y, 10, 0xb8f0ff, 0.55);
		spawnFlash.setDepth(companion.depth + 0.2);
		spawnFlash.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: spawnFlash,
			alpha: 0,
			scaleX: 1.8,
			scaleY: 1.8,
			duration: 150,
			ease: "Cubic.easeOut",
			onComplete: () => spawnFlash.destroy()
		});
	}

	private destroyArcherCompanion(companion: Phaser.GameObjects.Arc) {
		if (!companion.active) return;
		this.createPuffEffect(companion.x, companion.y, 0.8, 10);
		companion.destroy();
	}

	private clearArcherCompanions() {
		const companionGroup = this.archerCompanions as Phaser.GameObjects.Group | undefined;
		const projectileGroup = this.archerCompanionProjectiles as Phaser.Physics.Arcade.Group | undefined;
		try {
			const companionChildren = (companionGroup as any)?.children?.entries as Phaser.GameObjects.GameObject[] | undefined;
			if (Array.isArray(companionChildren)) {
				[...companionChildren].forEach((obj) => {
					this.destroyArcherCompanion(obj as Phaser.GameObjects.Arc);
				});
			}
		} catch {
			// Scene can call feature sync during restart before groups are fully reinitialized.
		}
		try {
			const projectileChildren = (projectileGroup as any)?.children?.entries as Phaser.GameObjects.GameObject[] | undefined;
			if (Array.isArray(projectileChildren)) {
				[...projectileChildren].forEach((obj) => {
					this.destroyArcherCompanionProjectile(obj as Phaser.Physics.Arcade.Image, false);
				});
			}
		} catch {
			// Guard against partially-destroyed group internals on restart.
		}
	}

	private createArcherCompanionPulse(x: number, y: number) {
		const pulse = this.add.circle(x, y, 7, 0x98ffb3, 0.24);
		pulse.setDepth((this.player?.depth ?? 22) + 0.9);
		pulse.setStrokeStyle(1, 0xcaffd8, 0.5);
		pulse.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: pulse,
			alpha: 0,
			scaleX: 1.75,
			scaleY: 1.75,
			duration: 170,
			ease: "Sine.easeOut",
			onComplete: () => pulse.destroy()
		});
	}

	private spawnArcherCompanionProjectile(startX: number, startY: number, targetX: number, targetY: number) {
		if (!this.archerCompanionProjectiles) return;
		const projectile = this.physics.add.image(startX, startY, "archer_arrow", 0);
		projectile.setDepth((this.player?.depth ?? 22) + 1);
		projectile.setScale(1.25);
		projectile.setTint(0xa8eeff);
		projectile.setAlpha(0.95);
		projectile.setData("bornAt", this.time.now);
		projectile.setData("collideAt", this.time.now + 35);
		projectile.setData("damage", 0.5);
		projectile.setData("lastX", startX);
		projectile.setData("lastY", startY);
		const body = projectile.body as Phaser.Physics.Arcade.Body;
		body.setAllowGravity(false);
		body.setSize(10, 6);
		body.setOffset((projectile.width - 10) / 2, (projectile.height - 6) / 2);
		const dx = targetX - startX;
		const dy = targetY - startY;
		const len = Math.hypot(dx, dy) || 1;
		const speed = 560;
		let vx = (dx / len) * speed;
		let vy = (dy / len) * speed;
		if (Math.abs(vx) + Math.abs(vy) < 0.01) {
			const fallbackAngle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
			vx = Math.cos(fallbackAngle) * speed;
			vy = Math.sin(fallbackAngle) * speed;
		}
		body.setVelocity(vx, vy);
		projectile.setData("vx", vx);
		projectile.setData("vy", vy);
		projectile.setRotation(Math.atan2(vy, vx));
		this.archerCompanionProjectiles.add(projectile);
	}

	private updateArcherCompanionProjectiles() {
		if (!this.archerCompanionProjectiles) return;
		const now = this.time.now;
		this.archerCompanionProjectiles.getChildren().forEach((obj) => {
			const projectile = obj as Phaser.Physics.Arcade.Image;
			if (!projectile.active) return;
			const prevX = (projectile.getData("lastX") as number) ?? projectile.x;
			const prevY = (projectile.getData("lastY") as number) ?? projectile.y;
			const bornAt = (projectile.getData("bornAt") as number) || 0;
			if (now - bornAt > 1200) {
				this.destroyArcherCompanionProjectile(projectile, false);
				return;
			}
			const body = projectile.body as Phaser.Physics.Arcade.Body;
			if (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down) {
				this.destroyArcherCompanionProjectile(projectile, false);
				return;
			}
			const vx = (projectile.getData("vx") as number) ?? body.velocity.x;
			const vy = (projectile.getData("vy") as number) ?? body.velocity.y;
			if (Math.abs(vx) + Math.abs(vy) > 0.01) {
				body.setVelocity(vx, vy);
			}
			if (Math.abs(body.velocity.x) + Math.abs(body.velocity.y) > 0.01) {
				projectile.setRotation(Math.atan2(body.velocity.y, body.velocity.x));
			}
			if (this.canFireballCollide(projectile)) {
				const hitEnemy = this.findEnemyHitAlongPath(prevX, prevY, projectile.x, projectile.y, 8);
				if (hitEnemy) {
					const damage = (projectile.getData("damage") as number) || 0.5;
					const dealt = this.damageEnemy(hitEnemy, damage, false, 0.7);
					if (dealt) {
						this.playFx("enemyHit", { volume: 0.45 });
						this.createArcherArrowImpact(hitEnemy.x, hitEnemy.y, 0xa7f0ff);
					}
					this.destroyArcherCompanionProjectile(projectile, false);
					return;
				}
			}
			projectile.setData("lastX", projectile.x);
			projectile.setData("lastY", projectile.y);
		});
	}

	private destroyArcherCompanionProjectile(projectile: Phaser.Physics.Arcade.Image, showPuff: boolean = true) {
		if (!projectile.active) return;
		if (showPuff) this.createPuffEffect(projectile.x, projectile.y, 0.6, 8);
		projectile.destroy();
	}

	private setFireballVelocityTowards(fireball: Phaser.Physics.Arcade.Image, x: number, y: number) {
		const body = fireball.body as Phaser.Physics.Arcade.Body;
		const speed = (fireball.getData("speed") as number) || 320;
		const dx = x - fireball.x;
		const dy = y - fireball.y;
		const len = Math.hypot(dx, dy) || 1;
		body.setVelocity((dx / len) * speed, (dy / len) * speed);
	}

	private destroyMageFireball(fireball: Phaser.Physics.Arcade.Image) {
		if (!fireball.active) return;
		this.createPuffEffect(fireball.x, fireball.y, 1, 16);
		fireball.destroy();
	}

	private findNearestEnemyInFront(x: number, y: number, dir: number, range: number) {
		if (!this.enemies) return null;
		let best: Phaser.Physics.Arcade.Sprite | null = null;
		let bestDist = range;
		this.enemies.getChildren().forEach((c) => {
			const e = c as Phaser.Physics.Arcade.Sprite;
			if (!e.active) return;
			const dx = e.x - x;
			const dy = e.y - y;
			const dist = Math.hypot(dx, dy);
			if (dist <= 0.001) return;
			if (!this.isTargetInFront(x, e.x, dir)) return;
			if (dist <= bestDist) {
				bestDist = dist;
				best = e;
			}
		});
		return best;
	}

	private findBestArcherTarget(x: number, y: number, dir: number, range: number) {
		if (!this.enemies) return null;
		let best: Phaser.Physics.Arcade.Sprite | null = null;
		let bestScore = Number.POSITIVE_INFINITY;
		this.enemies.getChildren().forEach((obj) => {
			const enemy = obj as Phaser.Physics.Arcade.Sprite;
			if (!enemy.active) return;
			if (enemy.getData("state") === "dying") return;
			const dx = enemy.x - x;
			const dy = enemy.y - y;
			const dist = Math.hypot(dx, dy);
			if (dist < 6 || dist > range) return;
			const forward = dx * dir;
			if (forward <= 8) return;
			const lateral = Math.abs(dy);
			const coneHalfWidth = Math.max((this.scaledTileSize || 64) * 0.75, dist * 0.55);
			if (lateral > coneHalfWidth) return;
			const score = dist + lateral * 0.75;
			if (score < bestScore) {
				bestScore = score;
				best = enemy;
			}
		});
		return best;
	}

	private findEnemyHitsAlongPath(x0: number, y0: number, x1: number, y1: number, padding: number = 8) {
		if (!this.enemies) return [] as Phaser.Physics.Arcade.Sprite[];
		const path = new Phaser.Geom.Line(x0, y0, x1, y1);
		const hits: { enemy: Phaser.Physics.Arcade.Sprite; dist: number }[] = [];
		this.enemies.getChildren().forEach((obj) => {
			const enemy = obj as Phaser.Physics.Arcade.Sprite;
			if (!enemy.active) return;
			if (enemy.getData("state") === "dying") return;
			const b = enemy.getBounds();
			const rect = new Phaser.Geom.Rectangle(
				b.x - padding,
				b.y - padding,
				b.width + padding * 2,
				b.height + padding * 2
			);
			if (
				rect.contains(x0, y0) ||
				rect.contains(x1, y1) ||
				Phaser.Geom.Intersects.LineToRectangle(path, rect)
			) {
				hits.push({
					enemy,
					dist: Phaser.Math.Distance.Between(x0, y0, enemy.x, enemy.y)
				});
			}
		});
		hits.sort((a, b) => a.dist - b.dist);
		return hits.map((item) => item.enemy);
	}

	private findEnemyHitAlongPath(x0: number, y0: number, x1: number, y1: number, padding: number = 8) {
		const hits = this.findEnemyHitsAlongPath(x0, y0, x1, y1, padding);
		return hits.length > 0 ? hits[0] : null;
	}

	private findNearestEnemyAnyRange(x: number, y: number, range: number) {
		if (!this.enemies) return null;
		let best: Phaser.Physics.Arcade.Sprite | null = null;
		let bestDist = range;
		this.enemies.getChildren().forEach((c) => {
			const e = c as Phaser.Physics.Arcade.Sprite;
			if (!e.active) return;
			const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
			if (dist <= bestDist) {
				bestDist = dist;
				best = e;
			}
		});
		return best;
	}

	private isTargetInFront(originX: number, targetX: number, dir: number) {
		const dx = targetX - originX;
		return dx * dir > 0.01;
	}

	private canFireballCollide(fireball: Phaser.Physics.Arcade.Image) {
		if (!fireball.active) return false;
		const now = this.time.now;
		const collideAt = (fireball.getData("collideAt") as number) || 0;
		return now >= collideAt;
	}

	private findChestHit(x: number, y: number) {
		if (!this.chests) return null;
		const hitRadius = (this.scaledTileSize || 64) * 0.8;
		let hit: Phaser.Physics.Arcade.Sprite | null = null;
		this.chests.getChildren().some((c) => {
			const chest = c as Phaser.Physics.Arcade.Sprite;
			if (!chest.active) return false;
			const center = chest.getCenter();
			const dist = Phaser.Math.Distance.Between(x, y, center.x, center.y);
			if (dist <= hitRadius) {
				hit = chest;
				return true;
			}
			return false;
		});
		return hit;
	}

	private findChestHitAlongPath(x0: number, y0: number, x1: number, y1: number) {
		if (!this.chests) return null;
		const path = new Phaser.Geom.Line(x0, y0, x1, y1);
		let hit: Phaser.Physics.Arcade.Sprite | null = null;
		this.chests.getChildren().some((c) => {
			const chest = c as Phaser.Physics.Arcade.Sprite;
			if (!chest.active) return false;
			const b = chest.getBounds();
			const rect = new Phaser.Geom.Rectangle(b.x - 6, b.y - 6, b.width + 12, b.height + 12);
			if (rect.contains(x1, y1) || rect.contains(x0, y0) || Phaser.Geom.Intersects.LineToRectangle(path, rect)) {
				hit = chest;
				return true;
			}
			return false;
		});
		return hit;
	}

	private damagePlayer(sourceX: number, sourceY: number, amount: number) {
		if (!this.player || !this.player.body) return;
		if (this.playerDead) return;

		const now = this.time.now;
		if (now < this.playerInvulnUntil) return;
		if (this.activeCharacter === "rogue" && this.getRogueFeature5DodgeChance() > 0) {
			if (Math.random() < this.getRogueFeature5DodgeChance()) {
				this.playerInvulnUntil = now + 140;
				const miss = this.add.text(this.player.x, this.player.y - 26, "MISS", {
					fontFamily: "'Press Start 2P', monospace",
					fontSize: "12px",
					color: "#a6d8ff",
					stroke: "#000000",
					strokeThickness: 4
				});
				miss.setOrigin(0.5, 0.5);
				miss.setDepth(120);
				this.tweens.add({
					targets: miss,
					y: miss.y - 18,
					alpha: 0,
					duration: 260,
					ease: "Cubic.easeOut",
					onComplete: () => miss.destroy()
				});
				this.createPuffEffect(this.player.x, this.player.y, 0.6, 8);
				this.playFx("getKey", { volume: 0.35 });
				return;
			}
		}

		if (this.shieldHitsRemaining > 0) {
			this.shieldHitsRemaining -= 1;
			this.playFx("getKey", { volume: 0.6 });
			this.triggerHaptic("light");
			if (this.shieldBubble) {
				this.shieldBubble.setAlpha(0.25);
				this.time.delayedCall(80, () => {
					if (this.shieldBubble?.active) this.shieldBubble.setAlpha(0.6);
				});
			}
			if (this.shieldHitsRemaining <= 0 && this.shieldBubble) {
				this.shieldBubble.destroy();
				this.shieldBubble = undefined;
			}
			this.playerInvulnUntil = now + 200;
			return;
		}
		const goldenShieldActive =
			this.knightFeature3GoldenShieldEnabled &&
			this.activeCharacter === "knight" &&
			this.knightFeature3ShieldHitsRemaining > 0;
		if (goldenShieldActive) {
			this.knightFeature3ShieldHitsRemaining -= 1;
			this.knightFeature3ShieldRegenReadyAt = 0;
			this.playFx("getKey", { volume: 0.6 });
			this.triggerHaptic("light");
			this.createKnightGoldenShieldBlockEffect();
			if (this.knightFeature3ShieldHitsRemaining <= 0) {
				this.knightFeature3ShieldRegenReadyAt = now + this.knightFeature3ShieldRegenDelayMs;
			}
			this.updateHearts();
			this.playerInvulnUntil = now + 200;
			return;
		}
		if (this.knightFeature3GoldenShieldEnabled && this.activeCharacter === "knight" && this.knightFeature3ShieldHitsRemaining <= 0) {
			this.knightFeature3ShieldRegenReadyAt = now + this.knightFeature3ShieldRegenDelayMs;
		}

		this.playerHp = Math.max(0, this.playerHp - amount);
		this.playerInvulnUntil = now + 500;
		this.updateHearts();
		this.playFx("playerGotHit", { volume: 0.7 });
		this.triggerHaptic("error");
		if (this.playerHp <= 0) {
			this.handlePlayerDeath();
			return;
		}

		// Red flash
		this.player.setTintFill(0xff4444);
		this.time.delayedCall(120, () => {
			if (this.player?.active) this.player.clearTint();
		});
		this.createBloodSplatter(this.player.x, this.player.y);

		// Knockback (away from attacker)
		const body = this.player.body as Phaser.Physics.Arcade.Body;
		const angle = Math.atan2(this.player.y - sourceY, this.player.x - sourceX);
		const kb = 320;
		body.setVelocity(Math.cos(angle) * kb, Math.sin(angle) * kb);
		this.playerKnockbackUntil = now + 140;

		// Camera shake
		this.cameras.main.shake(120, 0.003);

		// Brief slow-mo
		this.time.timeScale = 0.5;
		this.tweens.timeScale = 0.5;
		this.physics.world.timeScale = 0.5;
		this.time.delayedCall(80, () => {
			this.time.timeScale = 1;
			this.tweens.timeScale = 1;
			this.physics.world.timeScale = 1;
		});
	}

	private handlePlayerDeath() {
		if (!this.player || this.playerDead) return;
		this.playerDead = true;
		this.isGameOver = true;
		this.triggerHaptic("error");

		// Reset any slow-mo so restart is consistent.
		this.time.timeScale = 1;
		this.tweens.timeScale = 1;
		this.physics.world.timeScale = 1;

		const body = this.player.body as Phaser.Physics.Arcade.Body;
		body.setVelocity(0, 0);
		this.createPuffEffect(this.player.x, this.player.y, 2, 24);
		this.player.setVisible(false);
		this.pauseBtn.setVisible(false);
		if (this.knightFeature3Bubble) {
			this.knightFeature3Bubble.destroy();
			this.knightFeature3Bubble = undefined;
		}
		if (this.knightFeature4AuraCircle) {
			this.knightFeature4AuraCircle.destroy();
			this.knightFeature4AuraCircle = undefined;
		}
		if (this.knightFeature4AuraInner) {
			this.knightFeature4AuraInner.destroy();
			this.knightFeature4AuraInner = undefined;
		}
		if (this.knightFeature5Spikes) {
			this.knightFeature5Spikes.getChildren().forEach((obj) => {
				const spike = obj as Phaser.Physics.Arcade.Image;
				this.destroyKnightFeature5Spike(spike);
			});
		}
		this.clearMageFeatureObjects();
		this.clearArcherCompanions();

		this.time.delayedCall(200, () => {
			this.physics.world.isPaused = true;
			this.time.timeScale = 0;
			this.tweens.timeScale = 0;
			this.showGameOverMenu();
			this.submitFinalScore();
		});
	}

	private submitFinalScore(): void {
		if (typeof (window as any).submitScore === "function") {
			(window as any).submitScore(this.score);
		}
	}

	private spawnDamageNumber(x: number, y: number, amount: number, isCrit: boolean) {
		const rounded = Math.max(1, Math.round(amount * 10) / 10);
		const valueText = Number.isInteger(rounded) ? `${rounded}` : `${rounded.toFixed(1)}`;
		const text = this.add.text(x, y - 16, valueText, {
			fontFamily: "'Press Start 2P', monospace",
			fontSize: isCrit ? "16px" : "13px",
			color: isCrit ? "#ffe17d" : "#ffffff",
			stroke: "#000000",
			strokeThickness: isCrit ? 5 : 4
		});
		text.setOrigin(0.5, 0.5);
		text.setDepth(120);
		if (isCrit) {
			text.setAngle(Phaser.Math.Between(-8, 8));
		}
		this.tweens.add({
			targets: text,
			y: y - (isCrit ? 52 : 42),
			alpha: 0,
			scaleX: isCrit ? 1.12 : 1,
			scaleY: isCrit ? 1.12 : 1,
			duration: isCrit ? 450 : 360,
			ease: "Cubic.easeOut",
			onComplete: () => text.destroy()
		});
	}

	private spawnCritPopup(x: number, y: number) {
		const crit = this.add.text(x + Phaser.Math.Between(-6, 6), y - 30, "CRIT!", {
			fontFamily: "'Press Start 2P', monospace",
			fontSize: "18px",
			color: "#fff3a3",
			stroke: "#000000",
			strokeThickness: 6
		});
		crit.setOrigin(0.5, 0.5);
		crit.setDepth(260);
		crit.setBlendMode(Phaser.BlendModes.ADD);
		crit.setScale(0.92);
		this.tweens.add({
			targets: crit,
			y: crit.y - 30,
			alpha: 0,
			scaleX: 1.18,
			scaleY: 1.18,
			duration: 460,
			ease: "Back.easeOut",
			onComplete: () => crit.destroy()
		});
	}

	private damageEnemy(
		enemy: Phaser.Physics.Arcade.Sprite,
		amount: number,
		fromChain: boolean = false,
		knockbackScale: number = 1,
		ignoreHitCooldown: boolean = false
	) {
		if (!enemy.active) return false;
		const state = enemy.getData("state");
		if (state === "dying") return false;

		const now = this.time.now;
		const lastHit = (enemy.getData("lastHitTime") as number) || 0;
		if (!ignoreHitCooldown && now - lastHit < 180) return false;
		enemy.setData("lastHitTime", now);

		const type = enemy.getData("type") || "rat";
		const hp = (enemy.getData("hp") as number) ?? 1;
		const scaledBaseAmount = amount * this.getCurrentOutgoingDamageMultiplier();
		const isCrit = Math.random() < this.getCurrentCritRate();
		const finalAmount = Math.max(0, scaledBaseAmount * (isCrit ? 2 : 1));
		const nextHp = hp - finalAmount;
		enemy.setData("hp", nextHp);
		this.spawnDamageNumber(enemy.x, enemy.y, finalAmount, isCrit);
		this.syncEnemyHealthBar(enemy);
		if (isCrit) {
			this.spawnCritPopup(enemy.x, enemy.y);
			this.playFx("threeHitFirst", { volume: 0.82 });
			this.cameras.main.shake(120, 0.004);
			const critFlash = this.add.circle(enemy.x, enemy.y, 10, 0xffe8a0, 0.55);
			critFlash.setDepth(enemy.depth + 0.5);
			critFlash.setBlendMode(Phaser.BlendModes.ADD);
			this.tweens.add({
				targets: critFlash,
				alpha: 0,
				scaleX: 2.1,
				scaleY: 2.1,
				duration: 200,
				ease: "Cubic.easeOut",
				onComplete: () => critFlash.destroy()
			});
			if (this.activeCharacter === "rogue" && this.rogueFeature2CritHealEnabled) {
				const healAmount = this.getRogueFeature2HealAmount();
				if (healAmount > 0 && this.playerHp < this.playerMaxHp) {
					this.playerHp = Math.min(this.playerMaxHp, this.playerHp + healAmount);
					this.updateHearts();
					const healVfx = this.add.circle(this.player.x, this.player.y - 14, 10, 0xff5f7f, 0.6);
					healVfx.setDepth(this.player.depth + 2);
					healVfx.setBlendMode(Phaser.BlendModes.ADD);
					this.tweens.add({
						targets: healVfx,
						y: healVfx.y - 18,
						alpha: 0,
						scaleX: 1.6,
						scaleY: 1.6,
						duration: 240,
						ease: "Cubic.easeOut",
						onComplete: () => healVfx.destroy()
					});
				}
			}
		}
		this.playFx("enemyHit", { volume: 0.6 });
		this.triggerHaptic("medium");

		const body = enemy.body as Phaser.Physics.Arcade.Body;
		const angle = Math.atan2(enemy.y - this.player.y, enemy.x - this.player.x);
		const kb = 240 * this.knockbackMultiplier * knockbackScale;

		// Hit flash + knockback + screen shake
		enemy.setTintFill(0xff4444);
		this.time.delayedCall(120, () => {
			if (enemy.active) enemy.clearTint();
		});
		this.createBloodSplatter(enemy.x, enemy.y);
		if (enemy.getData("tutorialPassiveDummy") !== true) {
			body.setVelocity(Math.cos(angle) * kb, Math.sin(angle) * kb);
			enemy.setData("hitUntil", this.time.now + 140);
		}
		this.cameras.main.shake(80, 0.002);

		this.time.delayedCall(140, () => {
			if (!enemy.active) return;
			if (enemy.getData("state") === "dying") return;
			(body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
		});

		if (!fromChain && this.wizardActive && this.enemies) {
			const chainRadius = this.scaledTileSize * 4;
			const chainDamage = finalAmount * 0.5;
			const candidates = this.enemies.getChildren()
				.map((c) => c as Phaser.Physics.Arcade.Sprite)
				.filter((other) => other.active && other !== enemy)
				.map((other) => ({
					enemy: other,
					dist: Phaser.Math.Distance.Between(enemy.x, enemy.y, other.x, other.y)
				}))
				.filter((item) => item.dist <= chainRadius)
				.sort((a, b) => a.dist - b.dist)
				.slice(0, 3);

			candidates.forEach((item) => {
				this.createChainLightning(enemy.x, enemy.y, item.enemy.x, item.enemy.y);
				this.damageEnemy(item.enemy, chainDamage, true);
			});
		}

		if (nextHp <= 0) {
			// Let the knockback + flash land before dying
			this.time.delayedCall(100, () => {
				if (enemy.active) this.killEnemy(enemy);
			});
			return true;
		}

		enemy.setData("state", "chase");
		return true;
	}

	private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
		if (!enemy.active) return;
		const state = enemy.getData("state");
		if (state === "dying") return;

		const type = enemy.getData("type") || "rat";
		if (type === "slime") {
			const offset = this.scaledTileSize * 0.5;
			this.spawnEnemy("slime_split", enemy.x - offset, enemy.y);
			this.spawnEnemy("slime_split", enemy.x + offset, enemy.y);
		}
		if (type === "golem") {
			const dropPos = this.getNearestWalkableDropPosition(enemy.x, enemy.y);
			this.spawnLootIcon(dropPos.x, dropPos.y, 3, 2);
		}

		enemy.setData("state", "dying");
		this.destroyEnemyHealthBar(enemy);
		this.clearArcherBindingRing(enemy);
		(enemy.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
		enemy.play(`${type}-dying`);

		const scoreMap: Record<string, number> = {
			rat: 100,
			stinger: 120,
			skeleton: 200,
			beholder: 300,
			golem: 300,
			slime_split: 150,
			slime: 900,
			dragon: 1200,
			mummy: 1000
		};
		const expMap: Record<string, number> = {
			rat: 8,
			stinger: 9,
			skeleton: 11,
			beholder: 14,
			golem: 16,
			slime_split: 12,
			slime: 45,
			dragon: 55,
			mummy: 52
		};
		this.score += scoreMap[type] ?? 0;
		this.gainPlayerExp(expMap[type] ?? 10);
		if (this.scoreText) {
			this.scoreText.setText(`Score: ${this.score}`);
		}
	}

	private openChest(chest: Phaser.Physics.Arcade.Sprite) {
		if (!chest || !chest.active) return;
		if (chest.getData("opened") || chest.getData("opening")) return;

		chest.setData("opening", true);
		chest.play("chest-open");
		chest.once("animationcomplete-chest-open", () => {
			if (!chest.active) return;
			chest.setData("opened", true);
			chest.setData("opening", false);
			this.playFx("chestOpen", { volume: 0.7 });

			// Drop an icon 2 tiles forward from the chest (no pickup yet).
			const center = chest.getCenter();
			const targetX = center.x;
			const targetY = center.y + this.scaledTileSize * 2;
			let iconType = 3;
			let ownerCharacter: "knight" | "mage" | "archer" | "rogue" | undefined;
			let isCharacterSpecial = false;
			const roll = Math.random();
			const forcedIconType = chest.getData("tutorialDropIcon") as number | undefined;
			if (typeof forcedIconType === "number") {
				iconType = forcedIconType;
				if (iconType === 7) {
					ownerCharacter = "knight";
					isCharacterSpecial = true;
				} else if (iconType === 6) {
					ownerCharacter = "archer";
					isCharacterSpecial = true;
				} else if (iconType === 5) {
					ownerCharacter = "mage";
					isCharacterSpecial = true;
				} else if (iconType === 2) {
					ownerCharacter = "rogue";
					isCharacterSpecial = true;
				}
			} else {
				if (this.activeCharacter === "knight") {
					const canDropSpecial = this.hasKnightUpgradableFeature();
					if (canDropSpecial) {
						// 20% heal, 50% special upgrade, 10% transform, 20% shield
						iconType = roll < 0.2 ? 3 : roll < 0.7 ? 7 : roll < 0.8 ? 8 : 15;
					} else {
						// No upgrade left: remove special icon and rebalance remaining drops.
						iconType = roll < 0.45 ? 3 : roll < 0.7 ? 15 : 8;
					}
					if (iconType === 7) {
						ownerCharacter = "knight";
						isCharacterSpecial = true;
					}
				} else if (this.activeCharacter === "mage") {
					const canDropSpecial = this.hasMageUpgradableFeature();
					if (canDropSpecial) {
						// 20% heal, 50% mage special upgrade, 10% transform, 20% shield
						iconType = roll < 0.2 ? 3 : roll < 0.7 ? 5 : roll < 0.8 ? 8 : 15;
					} else {
						// No upgrade left: remove special icon and rebalance remaining drops.
						iconType = roll < 0.45 ? 3 : roll < 0.7 ? 15 : 8;
					}
					if (iconType === 5) {
						ownerCharacter = "mage";
						isCharacterSpecial = true;
					}
				} else if (this.activeCharacter === "archer") {
					const canDropSpecial = this.hasArcherUpgradableFeature();
					if (canDropSpecial) {
						// 20% heal, 50% archer special upgrade, 10% transform, 20% shield
						iconType = roll < 0.2 ? 3 : roll < 0.7 ? 6 : roll < 0.8 ? 8 : 15;
					} else {
						// No upgrade left: remove special icon and rebalance remaining drops.
						iconType = roll < 0.45 ? 3 : roll < 0.7 ? 15 : 8;
					}
					if (iconType === 6) {
						ownerCharacter = "archer";
						isCharacterSpecial = true;
					}
				} else if (this.activeCharacter === "rogue") {
					const canDropSpecial = this.hasRogueUpgradableFeature();
					if (canDropSpecial) {
						// 20% heal, 50% rogue special upgrade, 10% transform, 20% shield
						iconType = roll < 0.2 ? 3 : roll < 0.7 ? 2 : roll < 0.8 ? 8 : 15;
					} else {
						// No upgrade left: remove special icon and rebalance remaining drops.
						iconType = roll < 0.45 ? 3 : roll < 0.7 ? 15 : 8;
					}
					if (iconType === 2) {
						ownerCharacter = "rogue";
						isCharacterSpecial = true;
					}
				} else {
					// Other characters keep simple fallback drops for now.
					iconType = roll < 0.2 ? 3 : roll < 0.8 ? 15 : 8;
				}
			}
			const icon = this.spawnLootIcon(center.x, center.y, iconType, undefined, ownerCharacter, isCharacterSpecial);
			const tutorialRewardStep = chest.getData("tutorialRewardStep") as number | undefined;
			if (typeof tutorialRewardStep === "number") {
				icon.setData("tutorialRewardStep", tutorialRewardStep);
			}
			this.tweens.add({
				targets: icon,
				x: targetX,
				y: targetY,
				ease: "Sine.easeOut",
				duration: 450
			});
		});
	}

	private startDoubleDamage(durationMs: number) {
		this.damageMultiplier = 2;
		this.knockbackMultiplier = 2;

		if (this.doubleDamageTimer) {
			this.doubleDamageTimer.remove(false);
			this.doubleDamageTimer = undefined;
		}

		if (!this.doubleDamageText) {
			this.doubleDamageText = this.add.text(this.getTopRightUiX(), this.getBuffBaseY(), "", {
				fontFamily: "'Press Start 2P', monospace",
				fontSize: "24px",
				color: "#ffffff",
				stroke: "#000000",
				strokeThickness: 4
			});
			this.doubleDamageText.setOrigin(1, 0);
			this.doubleDamageText.setScrollFactor(0);
			this.doubleDamageText.setDepth(60);
		}

		let remainingTicks = Math.ceil(durationMs / 500);
		const updateLabel = () => {
			this.doubleDamageText?.setText(`Warrior: ${remainingTicks}`);
		};
		updateLabel();

		this.doubleDamageTimer = this.time.addEvent({
			delay: 500,
			loop: true,
			callback: () => {
				remainingTicks -= 1;
				if (remainingTicks <= 0) {
					this.damageMultiplier = 1;
					this.knockbackMultiplier = 1;
					if (this.doubleDamageTimer) {
						this.doubleDamageTimer.remove(false);
						this.doubleDamageTimer = undefined;
					}
					if (this.doubleDamageText) {
						this.doubleDamageText.destroy();
						this.doubleDamageText = undefined;
					}
					this.updateBuffTextPositions();
					return;
				}
				updateLabel();
			}
		});
		this.updateBuffTextPositions();
	}

	private startWizard(durationMs: number) {
		this.wizardActive = true;

		if (this.wizardTimer) {
			this.wizardTimer.remove(false);
			this.wizardTimer = undefined;
		}

		if (!this.wizardText) {
			this.wizardText = this.add.text(this.getTopRightUiX(), this.getBuffBaseY() + 20, "", {
				fontFamily: "'Press Start 2P', monospace",
				fontSize: "24px",
				color: "#ffffff",
				stroke: "#000000",
				strokeThickness: 4
			});
			this.wizardText.setOrigin(1, 0);
			this.wizardText.setScrollFactor(0);
			this.wizardText.setDepth(60);
		}

		let remainingTicks = Math.ceil(durationMs / 500);
		const updateLabel = () => {
			this.wizardText?.setText(`Wizard: ${remainingTicks}`);
		};
		updateLabel();

		this.wizardTimer = this.time.addEvent({
			delay: 500,
			loop: true,
			callback: () => {
				remainingTicks -= 1;
				if (remainingTicks <= 0) {
					this.wizardActive = false;
					if (this.wizardTimer) {
						this.wizardTimer.remove(false);
						this.wizardTimer = undefined;
					}
					if (this.wizardText) {
						this.wizardText.destroy();
						this.wizardText = undefined;
					}
					this.updateBuffTextPositions();
					return;
				}
				updateLabel();
			}
		});
		this.updateBuffTextPositions();
	}

	private updateBuffTextPositions() {
		const baseY = this.getBuffBaseY();
		const rightX = this.getTopRightUiX();
		if (this.doubleDamageText) {
			this.doubleDamageText.setX(rightX);
			this.doubleDamageText.setY(baseY);
		}
		if (this.wizardText) {
			this.wizardText.setX(rightX);
			this.wizardText.setY(this.doubleDamageText ? baseY + 32 : baseY);
		}
	}

	private getBuffBaseY() {
		return Math.round(this.scale.height * 0.55);
	}

	private getLevelUiPosition() {
		return {
			x: this.scale.width * 0.5,
			y: Math.round(this.scale.height * 0.82)
		};
	}

	private getTopRightUiX() {
		const isMobileLike = window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
		return this.scale.width - this.uiInsetX - (isMobileLike ? this.uiMobileTopRightShiftX : 0);
	}

	private isMobileLikeInput() {
		return window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
	}

	private updateKnightFeature3GoldenShield(now: number) {
		if (!this.knightFeature3GoldenShieldEnabled) return;
		if (this.activeCharacter !== "knight") return;
		if (this.knightFeature3ShieldHitsRemaining > 0) return;
		if (this.knightFeature3ShieldRegenReadyAt <= 0 || now < this.knightFeature3ShieldRegenReadyAt) return;
		this.knightFeature3ShieldHitsRemaining = this.getKnightFeature3MaxShieldHits();
		this.knightFeature3ShieldRegenReadyAt = 0;
		this.playFx("getKey", { volume: 0.65 });
		this.createKnightGoldenShieldReformEffect();
		this.updateHearts();
	}

	private updateKnightFeature4FireAura(now: number) {
		if (!this.knightFeature4FireAuraEnabled) return;
		if (this.activeCharacter !== "knight") return;
		if (!this.player || !this.enemies || this.isPaused || this.isGameOver || this.isMainMenu) return;
		if (now - this.knightFeature4LastTickAt < this.knightFeature4AuraTickMs) return;
		this.knightFeature4LastTickAt = now;

		const radius = this.getKnightFeature4AuraRadius();
		let hitAny = false;
		this.enemies.getChildren().forEach((obj) => {
			const enemy = obj as Phaser.Physics.Arcade.Sprite;
			if (!enemy.active) return;
			const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
			if (dist > radius) return;
			const dealt = this.damageEnemy(
				enemy,
				this.knightFeature4AuraDamagePerTick * this.damageMultiplier,
				true,
				0.5
			);
			if (!dealt) return;
			hitAny = true;
			this.createKnightFeature4BurnEffect(enemy.x, enemy.y);
		});
		if (hitAny) {
			this.playFx("enemyHit", { volume: 0.18 });
		}
	}

	private getKnightFeature4AuraRadius() {
		return Math.max(74, (this.scaledTileSize || 64) * 1.35);
	}

	private syncKnightFeature4Aura() {
		const shouldShow =
			!!this.player &&
			!this.playerDead &&
			this.knightFeature4FireAuraEnabled &&
			this.activeCharacter === "knight" &&
			!this.isMainMenu;
		if (!shouldShow) {
			if (this.knightFeature4AuraCircle?.active) this.knightFeature4AuraCircle.destroy();
			if (this.knightFeature4AuraInner?.active) this.knightFeature4AuraInner.destroy();
			this.knightFeature4AuraCircle = undefined;
			this.knightFeature4AuraInner = undefined;
			return;
		}
		const radius = this.getKnightFeature4AuraRadius();
		if (!this.knightFeature4AuraCircle || !this.knightFeature4AuraCircle.active) {
			this.knightFeature4AuraCircle = this.add.circle(this.player.x, this.player.y, radius, 0xff7a1a, 0.2);
			this.knightFeature4AuraCircle.setStrokeStyle(3, 0xffb347, 0.9);
			this.knightFeature4AuraCircle.setBlendMode(Phaser.BlendModes.ADD);
			this.knightFeature4AuraCircle.setDepth(this.player.depth - 0.3);
		}
		if (!this.knightFeature4AuraInner || !this.knightFeature4AuraInner.active) {
			this.knightFeature4AuraInner = this.add.circle(this.player.x, this.player.y, radius * 0.62, 0xff3d00, 0.12);
			this.knightFeature4AuraInner.setBlendMode(Phaser.BlendModes.ADD);
			this.knightFeature4AuraInner.setDepth(this.player.depth - 0.25);
		}
		const pulse = 1 + Math.sin(this.time.now * 0.012) * 0.04;
		this.knightFeature4AuraCircle.setPosition(this.player.x, this.player.y);
		this.knightFeature4AuraCircle.setRadius(radius * pulse);
		this.knightFeature4AuraInner.setPosition(this.player.x, this.player.y);
		this.knightFeature4AuraInner.setRadius(radius * 0.62 * pulse);
	}

	private createKnightFeature4BurnEffect(x: number, y: number) {
		const now = this.time.now;
		if (now - this.knightFeature4AuraPulseAt < 70) return;
		this.knightFeature4AuraPulseAt = now;
		const ember = this.add.circle(x, y - 8, Phaser.Math.Between(3, 5), 0xff9f43, 0.82);
		ember.setDepth(24);
		ember.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: ember,
			y: ember.y - Phaser.Math.Between(12, 20),
			x: ember.x + Phaser.Math.Between(-6, 6),
			alpha: 0,
			duration: Phaser.Math.Between(150, 230),
			ease: "Quad.easeOut",
			onComplete: () => ember.destroy()
		});
	}

	private spawnKnightFeature5GroundSpike(x: number, y: number) {
		if (!this.knightFeature5Spikes) return;
		const radius = Math.max(9, (this.scaledTileSize || 64) * 0.173);
		const spike = this.physics.add.image(x, y, "ground_spike");
		spike.setVisible(true);
		spike.setDepth(8);
		spike.setDisplaySize(radius * 2, radius * 2);
		spike.setAlpha(0.98);
		this.knightFeature5SpikeSerial += 1;
		spike.setData("spikeId", this.knightFeature5SpikeSerial);
		spike.setData("bornAt", this.time.now);
		spike.setData("expiresAt", this.time.now + this.knightFeature5SpikeDurationMs * this.getKnightFeature5DurationScale());
		spike.setData("radius", radius);
		spike.setData("hitEnemies", new Set<Phaser.Physics.Arcade.Sprite>());
		const body = spike.body as Phaser.Physics.Arcade.Body;
		body.setAllowGravity(false);
		body.setImmovable(true);
		body.setSize(radius * 2, radius * 2, true);
		this.knightFeature5Spikes.add(spike);
		const shadow = this.add.ellipse(x, y + radius * 0.42, radius * 1.55, radius * 0.56, 0x000000, 0.36);
		shadow.setDepth(6);
		const glow = this.add.ellipse(x, y + radius * 0.34, radius * 1.08, radius * 0.34, 0xffffff, 0.33);
		glow.setDepth(7);
		spike.setData("glow", glow);
		spike.setData("shadow", shadow);

		this.createPuffEffect(x, y, 1.8, 26);
	}

	private updateKnightFeature5GroundSpikes(now: number) {
		if (!this.knightFeature5GroundSpikeEnabled || !this.knightFeature5Spikes || !this.enemies) return;
		this.knightFeature5Spikes.getChildren().forEach((obj) => {
			const spike = obj as Phaser.Physics.Arcade.Image;
			if (!spike.active) return;
			const expiresAt = (spike.getData("expiresAt") as number) || 0;
			if (now >= expiresAt) {
				this.destroyKnightFeature5Spike(spike);
				return;
			}
			const radius = (spike.getData("radius") as number) || Math.max(22, (this.scaledTileSize || 64) * 0.45);
			let hitEnemies = spike.getData("hitEnemies") as Set<Phaser.Physics.Arcade.Sprite> | undefined;
			if (!hitEnemies) {
				hitEnemies = new Set<Phaser.Physics.Arcade.Sprite>();
				spike.setData("hitEnemies", hitEnemies);
			}
			this.enemies.getChildren().forEach((enemyObj) => {
				const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
				if (!enemy.active) return;
				if (enemy.getData("state") === "dying") return;
				if (hitEnemies!.has(enemy)) return;
				const dist = Phaser.Math.Distance.Between(spike.x, spike.y, enemy.x, enemy.y);
				const enemyRadius = Math.max(
					(enemy.getData("colliderRadius") as number) || 0,
					Math.max(enemy.displayWidth, enemy.displayHeight) * 0.2
				);
				if (dist > radius + enemyRadius) return;
				hitEnemies!.add(enemy);
				const stunnedUntil = (enemy.getData("stunnedUntil") as number) || 0;
				enemy.setData("stunnedUntil", Math.max(stunnedUntil, now + this.knightFeature5SpikeStunMs));
				const dealt = this.damageEnemy(
					enemy,
					this.knightFeature5SpikeDamagePerTick * this.damageMultiplier,
					false,
					0.3,
					true
				);
				if (!dealt) return;
			});
		});
	}

	private syncKnightFeature5Spikes() {
		if (!this.knightFeature5Spikes) return;
		this.knightFeature5Spikes.getChildren().forEach((obj) => {
			const spike = obj as Phaser.Physics.Arcade.Image;
			if (!spike.active) return;
			const radius = (spike.getData("radius") as number) || Math.max(9, (this.scaledTileSize || 64) * 0.173);
			const glow = spike.getData("glow") as Phaser.GameObjects.Ellipse | undefined;
			const shadow = spike.getData("shadow") as Phaser.GameObjects.Ellipse | undefined;
			if (!glow?.active || !shadow?.active) return;
			const pulse = 1 + Math.sin(this.time.now * 0.012 + spike.x * 0.02) * 0.08;
			shadow.setPosition(spike.x, spike.y + radius * 0.42);
			shadow.setSize(radius * 1.55 * (1 + (pulse - 1) * 0.5), radius * 0.56 * (1 + (pulse - 1) * 0.4));
			shadow.setAlpha(0.28 + (Math.sin(this.time.now * 0.013 + spike.x * 0.01) * 0.5 + 0.5) * 0.1);
			glow.setPosition(spike.x, spike.y + radius * 0.34);
			glow.setSize(radius * 1.08 * pulse, radius * 0.34 * pulse);
			glow.setAlpha(0.24 + (Math.sin(this.time.now * 0.016 + spike.y * 0.02) * 0.5 + 0.5) * 0.16);
		});
	}

	private destroyKnightFeature5Spike(spike: Phaser.Physics.Arcade.Image) {
		if (!spike.active) return;
		const glow = spike.getData("glow") as Phaser.GameObjects.Ellipse | undefined;
		const shadow = spike.getData("shadow") as Phaser.GameObjects.Ellipse | undefined;
		if (glow?.active) glow.destroy();
		if (shadow?.active) shadow.destroy();
		this.createPuffEffect(spike.x, spike.y, 1.8, 26);
		spike.destroy();
	}

	private syncKnightFeature3Bubble() {
		const shouldShow =
			!!this.player &&
			!this.playerDead &&
			this.knightFeature3GoldenShieldEnabled &&
			this.activeCharacter === "knight" &&
			this.knightFeature3ShieldHitsRemaining > 0;
		if (!shouldShow) {
			if (this.knightFeature3Bubble?.active) {
				this.knightFeature3Bubble.destroy();
			}
			this.knightFeature3Bubble = undefined;
			return;
		}

		const radius = Math.max(34, this.scaledTileSize * 0.6) * this.getKnightFeature3SizeScale();
		if (!this.knightFeature3Bubble || !this.knightFeature3Bubble.active) {
			this.knightFeature3Bubble = this.add.circle(this.player.x, this.player.y, radius, 0xffd400, 0.34);
			this.knightFeature3Bubble.setStrokeStyle(3, 0xfff07a, 1);
			this.knightFeature3Bubble.setBlendMode(Phaser.BlendModes.NORMAL);
			this.knightFeature3Bubble.setDepth(this.player.depth - 0.1);
		}
		this.knightFeature3Bubble.setPosition(this.player.x, this.player.y);
		this.knightFeature3Bubble.setRadius(radius);
		const maxHits = Math.max(1, this.getKnightFeature3MaxShieldHits());
		this.knightFeature3Bubble.setAlpha(0.3 + (this.knightFeature3ShieldHitsRemaining / maxHits) * 0.2);
	}

	private createKnightGoldenShieldBlockEffect() {
		if (!this.player) return;
		if (this.knightFeature3Bubble?.active) {
			this.knightFeature3Bubble.setAlpha(0.62);
			this.time.delayedCall(120, () => {
				if (this.knightFeature3Bubble?.active) {
					const maxHits = Math.max(1, this.getKnightFeature3MaxShieldHits());
					this.knightFeature3Bubble.setAlpha(0.3 + (this.knightFeature3ShieldHitsRemaining / maxHits) * 0.2);
				}
			});
		}
		const ring = this.add.circle(
			this.player.x,
			this.player.y,
			Math.max(26, this.scaledTileSize * 0.45) * this.getKnightFeature3SizeScale(),
			0xffd400,
			0.38
		);
		ring.setDepth(this.player.depth + 2);
		ring.setBlendMode(Phaser.BlendModes.ADD);
		ring.setStrokeStyle(3, 0xfff07a, 1);
		this.tweens.add({
			targets: ring,
			scaleX: 1.6,
			scaleY: 1.6,
			alpha: 0,
			duration: 220,
			ease: "Cubic.easeOut",
			onComplete: () => ring.destroy()
		});
	}

	private createKnightGoldenShieldReformEffect() {
		if (!this.player) return;
		this.createKnightGoldenShieldBlockEffect();
		this.createPuffEffect(this.player.x, this.player.y, 1.1, 18);
	}

	private createMobileControls() {
		if (!this.isMobileLikeInput()) return;
		this.mobileControlsEnabled = true;
		this.input.addPointer(2);

		this.mobileJoystickBase = this.add.circle(0, 0, this.mobileJoystickRadius, 0x000000, 0.22);
		this.mobileJoystickBase.setStrokeStyle(2, 0xffffff, 0.35);
		this.mobileJoystickBase.setScrollFactor(0);
		this.mobileJoystickBase.setDepth(80);
		this.mobileJoystickBase.setVisible(false);

		this.mobileJoystickKnob = this.add.circle(0, 0, 55, 0xffffff, 0.35);
		this.mobileJoystickKnob.setStrokeStyle(2, 0xffffff, 0.6);
		this.mobileJoystickKnob.setScrollFactor(0);
		this.mobileJoystickKnob.setDepth(81);
		this.mobileJoystickKnob.setVisible(false);

		this.mobileJoystickZone = this.add.zone(0, 0, this.mobileJoystickRadius * 3, this.mobileJoystickRadius * 3);
		this.mobileJoystickZone.setOrigin(0.5, 0.5);
		this.mobileJoystickZone.setScrollFactor(0);
		this.mobileJoystickZone.setDepth(79);

		this.mobileFireButton = this.add.image(0, 0, "icons2x", 6);
		this.mobileFireButton.setScale(this.mobileFireButtonScale);
		this.mobileFireButton.setScrollFactor(0);
		this.mobileFireButton.setDepth(82);
		this.mobileFireButton.setAlpha(0);
		this.mobileFireButton.setVisible(false);

		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
			if (this.characterSelectActive || this.skillsInfoActive) {
				return;
			}
			const p = this.getMobileControlPoint(pointer);
			if (!p) return;

			if (!this.isPaused && !this.isGameOver && !this.isMainMenu && this.skillsInfoBtn?.visible && this.skillsInfoBtn.alpha > 0.01 && this.isPointInsideDisplay(this.skillsInfoBtn, p.x, p.y)) {
				this.triggerHaptic("light");
				this.toggleSkillsInfoMenu();
				return;
			}
			if (!this.isPaused && !this.isGameOver && !this.isMainMenu && this.pauseBtn?.visible && this.pauseBtn.alpha > 0.01 && this.isPointInsideDisplay(this.pauseBtn, p.x, p.y)) {
				this.triggerHaptic("light");
				this.togglePause();
				return;
			}

			if (this.isPaused || this.isGameOver || this.isMainMenu) return;

			if (this.mobileFireButton?.visible && this.mobileFireButton.alpha > 0.01 && this.isPointInsideFireButton(p.x, p.y)) {
				this.mobileFirePointerId = pointer.id;
				this.mobileFireHeld = true;
				this.mobileFireButton.setAlpha(0.9);
				this.animateMobileFireButton();
				return;
			}

				if (this.mobileJoystickBase) {
					const joystickPoint = this.getJoystickControlPoint(p);
					const d = Phaser.Math.Distance.Between(joystickPoint.x, joystickPoint.y, this.mobileJoystickBase.x, this.mobileJoystickBase.y);
					if (d <= this.mobileJoystickRadius * 1.75) {
						this.mobileJoystickPointerId = pointer.id;
						this.setJoystickFromPoint(joystickPoint.x, joystickPoint.y);
					}
				}
			});

		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
			if (pointer.id !== this.mobileJoystickPointerId) return;
			const p = this.getMobileControlPoint(pointer);
			if (!p) return;
			const joystickPoint = this.getJoystickControlPoint(p);
			this.setJoystickFromPoint(joystickPoint.x, joystickPoint.y);
		});
		this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
			if (pointer.id === this.mobileJoystickPointerId) {
				this.mobileJoystickPointerId = -1;
				this.resetJoystick();
			}
			if (pointer.id === this.mobileFirePointerId) {
				this.mobileFirePointerId = -1;
				this.mobileFireHeld = false;
				this.mobileFireButton?.setAlpha(this.mobileFireIdleAlpha);
			}
		});
		this.input.on("pointerupoutside", (pointer: Phaser.Input.Pointer) => {
			if (pointer.id === this.mobileJoystickPointerId) {
				this.mobileJoystickPointerId = -1;
				this.resetJoystick();
			}
			if (pointer.id === this.mobileFirePointerId) {
				this.mobileFirePointerId = -1;
				this.mobileFireHeld = false;
				this.mobileFireButton?.setAlpha(this.mobileFireIdleAlpha);
			}
		});

		this.layoutMobileControls();
	}

	private layoutMobileControls() {
		if (!this.mobileControlsEnabled) return;
		const baseX = this.uiInsetX + this.mobileJoystickRadius + 18;
		const baseY = this.scale.height - (this.uiInsetY + this.mobileJoystickRadius + 18);
		const fireHalf = this.mobileFireButton ? this.mobileFireButton.displayWidth * 0.5 : 72;
		const fireX = this.scale.width - (this.uiInsetX + fireHalf + 12);
		const fireY = this.scale.height - (this.uiInsetY + fireHalf + 12);

		this.mobileJoystickBase?.setPosition(baseX, baseY);
		this.mobileJoystickKnob?.setPosition(baseX, baseY);
		this.mobileJoystickZone?.setPosition(baseX, baseY);
		this.mobileFireButton?.setPosition(fireX, fireY);
		if (this.mobileJoystickPointerId === -1) {
			this.resetJoystick();
		}
	}

	private getMobileControlPoint(pointer: Phaser.Input.Pointer) {
		return this.mapPointerToGamePoint(
			pointer,
			document.body.classList.contains("force-landscape") ? this.mobileInputCalibrateXForceLandscape : 0
		);
	}

	private getUiPointerPoint(pointer: Phaser.Input.Pointer) {
		return this.mapPointerToGamePoint(pointer, 0);
	}

	private mapPointerToGamePoint(pointer: Phaser.Input.Pointer, forceLandscapeOffsetX: number) {
		const canvas = this.game.canvas as HTMLCanvasElement | null;
		if (!canvas) return null;
		const client = this.getPointerClientPosition(pointer);
		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;

		const rx = Phaser.Math.Clamp((client.x - rect.left) / rect.width, 0, 1);
		const ry = Phaser.Math.Clamp((client.y - rect.top) / rect.height, 0, 1);
		const forceLandscape = document.body.classList.contains("force-landscape");
		const rawNx = forceLandscape ? ry : rx;
		const nx = Phaser.Math.Clamp(rawNx + (forceLandscape ? forceLandscapeOffsetX : 0), 0, 1);
		const ny = forceLandscape ? 1 - rx : ry;
		return {
			x: nx * this.scale.width,
			y: ny * this.scale.height
		};
	}

	private getJoystickControlPoint(p: { x: number; y: number }) {
		if (!document.body.classList.contains("force-landscape")) {
			return p;
		}
		return {
			x: Phaser.Math.Clamp(p.x - this.mobileJoystickExtraLeftShiftForceLandscape * this.scale.width, 0, this.scale.width),
			y: p.y
		};
	}

	private getPointerClientPosition(pointer: Phaser.Input.Pointer) {
		const evt = pointer.event as MouseEvent | TouchEvent | undefined;
		if (evt) {
			const touchEvt = evt as TouchEvent;
			const pickTouch = (list: TouchList | undefined | null) => {
				if (!list || list.length === 0) return null;
				for (let i = 0; i < list.length; i++) {
					if (list[i].identifier === pointer.id) return list[i];
				}
				return list[0] ?? null;
			};
			const chosenTouch = pickTouch(touchEvt.changedTouches) ?? pickTouch(touchEvt.touches);
			if (chosenTouch) {
				return { x: chosenTouch.clientX, y: chosenTouch.clientY };
			}
			if ("clientX" in evt && typeof (evt as MouseEvent).clientX === "number") {
				return { x: (evt as MouseEvent).clientX, y: (evt as MouseEvent).clientY };
			}
		}

		const canvas = this.game.canvas as HTMLCanvasElement | null;
		if (canvas) {
			const rect = canvas.getBoundingClientRect();
			const nx = Phaser.Math.Clamp(pointer.x / Math.max(1, this.scale.width), 0, 1);
			const ny = Phaser.Math.Clamp(pointer.y / Math.max(1, this.scale.height), 0, 1);
			return {
				x: rect.left + rect.width * nx,
				y: rect.top + rect.height * ny
			};
		}

		return { x: pointer.x, y: pointer.y };
	}

	private tryHandleCharacterSelectPointer(pointer: Phaser.Input.Pointer) {
		if (!this.characterSelectActive || this.characterSelectHitAreas.length === 0) return;
		const p = this.getUiPointerPoint(pointer);
		if (!p) return;
		const picked = this.characterSelectHitAreas.find((hit) =>
			p.x >= hit.x && p.x <= hit.x + hit.w && p.y >= hit.y && p.y <= hit.y + hit.h
		);
		if (picked) {
			this.chooseCharacterFromSelect(picked.candidate);
		}
	}

	private isPointInsideDisplay(obj: Phaser.GameObjects.GameObject, x: number, y: number) {
		const bounds = (obj as any).getBounds?.() as Phaser.Geom.Rectangle | undefined;
		if (!bounds) return false;
		return Phaser.Geom.Rectangle.Contains(bounds, x, y);
	}

	private isPointInsideFireButton(x: number, y: number) {
		if (!this.mobileFireButton) return false;
		// Touch mapping on rotated mobile screens can skew the lower half.
		// Use a slightly larger ellipse and bias center downward.
		const rx = this.mobileFireButton.displayWidth * 0.78;
		const ry = this.mobileFireButton.displayHeight * 0.98;
		const cx = this.mobileFireButton.x;
		const cy = this.mobileFireButton.y + this.mobileFireButton.displayHeight * 0.14;
		const nx = (x - cx) / Math.max(1, rx);
		const ny = (y - cy) / Math.max(1, ry);
		return nx * nx + ny * ny <= 1;
	}

	private setJoystickFromPoint(px: number, py: number) {
		if (!this.mobileJoystickBase || !this.mobileJoystickKnob) return;
		const dx = px - this.mobileJoystickBase.x;
		const dy = py - this.mobileJoystickBase.y;
		const len = Math.hypot(dx, dy);
		const clamped = Math.min(this.mobileJoystickRadius, len);
		const nx = len > 0 ? dx / len : 0;
		const ny = len > 0 ? dy / len : 0;
		const knobX = this.mobileJoystickBase.x + nx * clamped;
		const knobY = this.mobileJoystickBase.y + ny * clamped;
		this.mobileJoystickKnob.setPosition(knobX, knobY);
		const vx = nx * (clamped / this.mobileJoystickRadius);
		const vy = ny * (clamped / this.mobileJoystickRadius);
		const deadzone = 0.14;
		this.mobileMoveVector.set(
			Math.abs(vx) < deadzone ? 0 : vx,
			Math.abs(vy) < deadzone ? 0 : vy
		);
	}

	private resetJoystick() {
		if (!this.mobileJoystickBase || !this.mobileJoystickKnob) return;
		this.mobileJoystickKnob.setPosition(this.mobileJoystickBase.x, this.mobileJoystickBase.y);
		this.mobileMoveVector.set(0, 0);
	}

	private animateMobileFireButton() {
		if (!this.mobileFireButton || !this.mobileFireButton.active) return;
		const baseScale = this.mobileFireButtonScale;
		this.tweens.killTweensOf(this.mobileFireButton);
		this.mobileFireButton.setScale(baseScale);
		this.tweens.add({
			targets: this.mobileFireButton,
			scaleX: baseScale * 0.88,
			scaleY: baseScale * 0.88,
			duration: 60,
			yoyo: true,
			ease: "Quad.easeOut",
			onComplete: () => {
				if (this.mobileFireButton?.active) this.mobileFireButton.setScale(baseScale);
			}
		});
	}

	private revealMobileControls() {
		if (!this.mobileControlsEnabled) return;
		const show = (obj?: Phaser.GameObjects.GameObject | null) => {
			if (!obj) return;
			(obj as any).setVisible(true);
			(obj as any).setAlpha(0);
		};
		show(this.mobileJoystickBase);
		show(this.mobileJoystickKnob);
		show(this.mobileFireButton);

		if (this.mobileJoystickBase) {
			this.tweens.add({ targets: this.mobileJoystickBase, alpha: 0.22, duration: 250, ease: "Sine.easeOut" });
		}
		if (this.mobileJoystickKnob) {
			this.tweens.add({ targets: this.mobileJoystickKnob, alpha: 0.35, duration: 250, ease: "Sine.easeOut" });
		}
		if (this.mobileFireButton) {
			this.tweens.add({ targets: this.mobileFireButton, alpha: this.mobileFireIdleAlpha, duration: 250, ease: "Sine.easeOut" });
		}
	}

	private activateShield(hits: number) {
		this.shieldHitsRemaining = hits;
		if (this.shieldBubble) {
			this.shieldBubble.destroy();
			this.shieldBubble = undefined;
		}
		const radius = this.scaledTileSize * 0.6;
		this.shieldBubble = this.add.circle(this.player.x, this.player.y, radius, 0x66d9ff, 0.25);
		this.shieldBubble.setStrokeStyle(2, 0xa6ecff, 0.7);
		this.shieldBubble.setDepth(15);
		this.shieldBubble.setAlpha(0.6);
	}

	private createChainLightning(x1: number, y1: number, x2: number, y2: number) {
		const g = this.add.graphics();
		g.setDepth(20);
		const drawBolt = () => {
			g.clear();
			g.lineStyle(6, 0x7fe7ff, 0.95);
			const midPoints = 7;
			let prevX = x1;
			let prevY = y1;
			for (let i = 1; i <= midPoints; i++) {
				const t = i / (midPoints + 1);
				const nx = Phaser.Math.Linear(x1, x2, t) + Phaser.Math.Between(-18, 18);
				const ny = Phaser.Math.Linear(y1, y2, t) + Phaser.Math.Between(-18, 18);
				g.lineBetween(prevX, prevY, nx, ny);
				prevX = nx;
				prevY = ny;
			}
			g.lineBetween(prevX, prevY, x2, y2);

			g.lineStyle(3, 0xffffff, 1);
			prevX = x1;
			prevY = y1;
			for (let i = 1; i <= midPoints; i++) {
				const t = i / (midPoints + 1);
				const nx = Phaser.Math.Linear(x1, x2, t) + Phaser.Math.Between(-14, 14);
				const ny = Phaser.Math.Linear(y1, y2, t) + Phaser.Math.Between(-14, 14);
				g.lineBetween(prevX, prevY, nx, ny);
				prevX = nx;
				prevY = ny;
			}
			g.lineBetween(prevX, prevY, x2, y2);
		};

		drawBolt();
		this.time.delayedCall(50, drawBolt);
		this.time.delayedCall(100, drawBolt);
		this.time.delayedCall(150, drawBolt);
		this.time.delayedCall(220, () => g.destroy());
	}

	private updateHearts() {
		for (let i = 0; i < this.heartIcons.length; i++) {
			const heart = this.heartIcons[i];
			if (!heart) continue;
			if (i >= this.playerMaxHp) {
				heart.setAlpha(0);
				continue;
			}
			heart.setAlpha(this.isMainMenu ? 0 : 1);
			if (i < this.playerHp) {
				heart.clearTint();
			} else {
				heart.setTint(0x000000);
			}
		}
		const showGoldenShield =
			!this.isMainMenu &&
			this.knightFeature3GoldenShieldEnabled &&
			this.activeCharacter === "knight";
		if (this.knightFeature3Icon) {
			this.knightFeature3Icon.setAlpha(showGoldenShield ? 1 : 0);
			if (showGoldenShield) {
				const charged = this.knightFeature3ShieldHitsRemaining > 0;
				this.knightFeature3Icon.setTint(charged ? 0xffd86b : 0x555555);
			} else {
				this.knightFeature3Icon.clearTint();
			}
		}
		if (this.knightFeature3CountText) {
			this.knightFeature3CountText.setAlpha(showGoldenShield ? 1 : 0);
			if (showGoldenShield) {
				const remaining = this.knightFeature3ShieldHitsRemaining;
				this.knightFeature3CountText.setText(`x${remaining}`);
				this.knightFeature3CountText.setColor(remaining > 0 ? "#f6d365" : "#888888");
			} else {
				this.knightFeature3CountText.setText("");
			}
		}
	}

	private loadSettings(): { music: boolean; fx: boolean; haptics: boolean } {
		try {
			const saved = localStorage.getItem("gameSettings");
			if (saved) {
				const parsed = JSON.parse(saved);
				return {
					music: parsed.music !== false,
					fx: parsed.fx !== false,
					haptics: parsed.haptics !== false
				};
			}
		} catch {
			// Ignore corrupted settings
		}
		return { music: true, fx: true, haptics: true };
	}



	private saveSettings(): void {
		localStorage.setItem("gameSettings", JSON.stringify(this.settings));
	}

	private updateSettingsUI(): void {
		const setVal = (id: string, val: boolean) => {
			const el = document.getElementById(id);
			if (el) {
				el.textContent = val ? "ON" : "OFF";
				// industrial-accent (#c54b4b) for ON, gray-500 (#6b7280) for OFF
				el.style.color = val ? "#c54b4b" : "#6b7280";
			}
		};
		setVal("val-music", this.settings.music);
		setVal("val-fx", this.settings.fx);
		setVal("val-haptics", this.settings.haptics);
	}

	private applySettings(): void {
		this.hapticsEnabled = this.settings.haptics;
		if (this.bgm) {
			if (this.settings.music) {
				if (!this.bgm.isPlaying) this.bgm.play();
			} else if (this.bgm.isPlaying) {
				this.bgm.stop();
			}
		}
	}

	private playFx(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
		if (!this.settings.fx) return;
		this.sound.play(key, config);
	}

	private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error") {
		if (!this.hapticsEnabled) return;
		const fn = (window as any).triggerHaptic;
		if (typeof fn === "function") {
			fn(type);
		}
	}

	private setupDOMUI(): void {
		const pauseMenu = document.getElementById("pause-menu");
		const gameOverMenu = document.getElementById("gameover-menu");
		const characterSelectMenu = document.getElementById("character-select-menu");
		const skillsInfoMenu = document.getElementById("skills-info-menu");
		const mainMenu = document.getElementById("main-menu");

		if (pauseMenu) {
			pauseMenu.classList.add("hidden");
			(pauseMenu as HTMLElement).style.display = "none";
			(pauseMenu as HTMLElement).style.pointerEvents = "none";
		}
		if (gameOverMenu) {
			gameOverMenu.classList.add("hidden");
			(gameOverMenu as HTMLElement).style.display = "none";
			(gameOverMenu as HTMLElement).style.pointerEvents = "none";
		}
		if (characterSelectMenu) {
			characterSelectMenu.classList.add("hidden");
			(characterSelectMenu as HTMLElement).style.display = "none";
			(characterSelectMenu as HTMLElement).style.pointerEvents = "none";
		}
		if (skillsInfoMenu) {
			skillsInfoMenu.classList.add("hidden");
			(skillsInfoMenu as HTMLElement).style.display = "none";
			(skillsInfoMenu as HTMLElement).style.pointerEvents = "none";
		}
		if (mainMenu) {
			mainMenu.classList.remove("hidden", "menu-fade-out");
			const mainMenuEl = mainMenu as HTMLElement;
			mainMenuEl.style.display = "flex";
			mainMenuEl.style.pointerEvents = "auto";
		}

		// Helper to safely add listener
		const addListener = (id: string, fn: () => void) => {
			const el = document.getElementById(id);
			if (!el) return;
			// Clone to strip old listeners
			const newEl = el.cloneNode(true) as HTMLElement;
			if (el.parentNode) el.parentNode.replaceChild(newEl, el);
			let lastInvokeAt = 0;
			const invoke = (ev: Event) => {
				ev.preventDefault();
				const now = performance.now();
				if (now - lastInvokeAt < 220) return;
				lastInvokeAt = now;
				fn();
			};
			newEl.addEventListener("click", invoke);
			newEl.addEventListener("pointerdown", invoke);
			newEl.addEventListener("touchstart", invoke, { passive: false });
		};

		addListener("btn-resume", () => {
			this.triggerHaptic("light");
			this.togglePause(false);
		});

		addListener("btn-play", () => {
			this.triggerHaptic("success");
			this.startNormalFromMenu();
		});

		addListener("btn-tutorial", () => {
			this.triggerHaptic("success");
			this.startTutorialFromMenu();
		});

		addListener("btn-restart", () => {
			this.triggerHaptic("light");
			this.restartGame();
		});

		addListener("btn-retry", () => {
			this.triggerHaptic("light");
			this.restartGame();
		});

		const bindCharacterOption = (id: string) => {
			addListener(id, () => {
				const btn = document.getElementById(id) as HTMLButtonElement | null;
				const picked = btn?.dataset.character;
				if (!this.isPlayableCharacter(picked)) return;
				this.triggerHaptic("success");
				this.chooseCharacterFromSelect(picked);
			});
		};
		bindCharacterOption("btn-char-option-1");
		bindCharacterOption("btn-char-option-2");
		bindCharacterOption("btn-char-option-3");
		addListener("btn-char-cancel", () => {
			this.triggerHaptic("light");
			this.closeCharacterSelectMenu(true);
		});
		addListener("btn-skillinfo-close", () => {
			this.triggerHaptic("light");
			this.closeSkillsInfoMenu(true);
		});

		const toggleSetting = (key: "music" | "fx" | "haptics") => {
			this.settings[key] = !this.settings[key];
			this.saveSettings();
			this.applySettings();
			this.updateSettingsUI();
			this.triggerHaptic("light");
		};

		addListener("btn-toggle-music", () => toggleSetting("music"));
		addListener("btn-toggle-fx", () => toggleSetting("fx"));
		addListener("btn-toggle-haptics", () => toggleSetting("haptics"));

		this.updateSettingsUI();
	}

	private togglePause(force?: boolean): void {
		if (this.isGameOver || this.characterSelectActive || this.skillsInfoActive) return;
		const next = typeof force === "boolean" ? force : !this.isPaused;
		if (next === this.isPaused) return;

		this.isPaused = next;
		this.physics.world.isPaused = next;
		this.time.timeScale = next ? 0 : 1;
		this.tweens.timeScale = next ? 0 : 1;

		const pauseMenu = document.getElementById("pause-menu");
		if (pauseMenu) {
			const pauseEl = pauseMenu as HTMLElement;
			if (next) {
				pauseMenu.classList.remove("hidden");
				pauseEl.style.display = "block";
				pauseEl.style.pointerEvents = "auto";
			} else {
				pauseMenu.classList.add("hidden");
				pauseEl.style.display = "none";
				pauseEl.style.pointerEvents = "none";
			}
		}
		if (this.mobileControlsEnabled) {
			this.mobileFireHeld = false;
			this.mobileFirePointerId = -1;
			this.mobileJoystickPointerId = -1;
			this.mobileFireButton?.setAlpha(this.mobileFireIdleAlpha);
			this.resetJoystick();
		}
	}

	private showGameOverMenu(): void {
		const gameOverMenu = document.getElementById("gameover-menu");
		const scoreDisplay = document.getElementById("score-display");

		if (scoreDisplay) scoreDisplay.textContent = this.score.toString();
		if (gameOverMenu) {
			gameOverMenu.classList.remove("hidden");
			const gameOverEl = gameOverMenu as HTMLElement;
			gameOverEl.style.display = "block";
			gameOverEl.style.pointerEvents = "auto";
		}
	}

	private restartGame(): void {
		this.closeCharacterSelectMenu(false);
		this.closeSkillsInfoMenu(false);
		const pauseMenu = document.getElementById("pause-menu");
		const gameOverMenu = document.getElementById("gameover-menu");
		if (pauseMenu) {
			pauseMenu.classList.add("hidden");
			const pauseEl = pauseMenu as HTMLElement;
			pauseEl.style.display = "none";
			pauseEl.style.pointerEvents = "none";
		}
		if (gameOverMenu) {
			gameOverMenu.classList.add("hidden");
			const gameOverEl = gameOverMenu as HTMLElement;
			gameOverEl.style.display = "none";
			gameOverEl.style.pointerEvents = "none";
		}

		this.isPaused = false;
		this.isGameOver = false;
		this.playerDead = false;
		this.isMainMenu = true;
		this.time.timeScale = 1;
		this.tweens.timeScale = 1;
		this.physics.world.isPaused = false;
		this.physics.world.timeScale = 1;
		this.scene.restart({ mapMode: this.mapMode });
	}

	private startNormalFromMenu() {
		if (this.mapMode !== "main") {
			this.scene.restart({ mapMode: "main", autoStart: true });
			return;
		}
		this.startGame();
	}

	private startTutorialFromMenu() {
		if (this.mapMode !== "tutorial") {
			this.scene.restart({ mapMode: "tutorial", autoStart: true });
			return;
		}
		this.startGame();
	}

	private startGame() {
		const mainMenu = document.getElementById("main-menu");
		if (mainMenu) {
			mainMenu.classList.add("menu-fade-out");
			const mainMenuEl = mainMenu as HTMLElement;
			mainMenuEl.style.pointerEvents = "none";
			// Keep fade animation, then remove the DOM overlay so it can't block pause/restart buttons.
			window.setTimeout(() => {
				if (!this.scene.isActive(this.scene.key)) return;
				if (this.isMainMenu) return;
				mainMenu.classList.add("hidden");
				mainMenuEl.style.display = "none";
			}, 950);
		}

		// Enable shadows immediately (by disabling main menu flag)
		this.isMainMenu = false;

		// Wait for shadows to form (1500ms), then pan to player
		this.time.delayedCall(1500, () => {
			// Smooth camera zoom/pan to player
			this.tweens.killTweensOf(this.cameras.main); // Stop the menu pan tween

			this.cameras.main.pan(this.player.x, this.player.y, 1000, 'Power2', false, (camera, progress) => {
				if (progress === 1) {
					camera.startFollow(this.player, true, 0.1, 0.1);
					const visibleHearts = this.heartIcons.filter((_, i) => i < this.playerMaxHp);

					// Fade in UI after camera move is effectively done
					this.tweens.add({
						targets: [this.scoreText, this.levelText, this.pauseBtn, this.skillsInfoBtn, ...visibleHearts, this.knightFeature3Icon, this.knightFeature3CountText].filter(Boolean),
						alpha: { from: 0, to: 1 },
						duration: 500,
						ease: 'Power1'
					});
					this.revealMobileControls();
				}
			});
			this.cameras.main.zoomTo(1, 1000, 'Power2', false);
		});

		// Start Music
		if (this.settings.music && this.bgm && !this.bgm.isPlaying) {
			this.bgm.play();
			this.tweens.add({
				targets: this.bgm,
				volume: 0.35,
				duration: 2000
			});
		}
	}

	private getTutorialMapLayout(): (number | string)[][] {
		const roomTemplate: (number | string)[][] = [
			["b172-", "b173-", "b173-", "b174-", "b175-", "b176-", "b177-"],
			["b480-", "b362-", "b362-", "b362-", "b362-", "b362-", "b362-"],
			["b480-", "b124", "b125", "b126", "b127", "b120", "b121"],
			["b480-", "b124", "b125", "b126", "b127", "b120", "b121"],
			["b480-", "b124", "b125", "b126", "b127", "b120", "b121"],
			["b480-", "b144", "b145", "b146", "b147", "b140", "b141"],
			["b480-", "b126", "b127", "b120", "b121", "b122", "b123"],
			["b480-", "b146", "b147", "b140", "b141", "b142", "b143"],
			["b192-", "b193-", "b193-", "b193-", "b193-", "b193-", "b197-"],
			["b292-", "b293-", "b294-", "b295-", "b296-", "b296-", "b297-"],
			["b312-", "b313-", "b314-", "b315-", "b314-", "b316-", "b317-"]
		];
		const roomCount = 6;
		const bridgeWidth = 5;
		const layout: (number | string)[][] = Array.from({ length: roomTemplate.length }, () => []);

		for (let roomIndex = 0; roomIndex < roomCount; roomIndex++) {
			const roomRows = roomTemplate.map((row) => row.slice());
			roomRows[3][2] = roomIndex === 0 ? "b125(tutorialSpawn)" : "b125";
			if (roomIndex > 0) {
				// Incoming bridge meets a normal room floor tile (not a bridge tile inside the room).
				roomRows[5][0] = "b144";
				roomRows[6][0] = "b127";
			}
			if (roomIndex < roomCount - 1) {
				// Outgoing bridge starts after a normal room floor tile.
				roomRows[5][6] = "b141";
				roomRows[6][6] = "b123";
			}
			for (let rowIndex = 0; rowIndex < roomRows.length; rowIndex++) {
				layout[rowIndex].push(...roomRows[rowIndex]);
			}
			if (roomIndex < roomCount - 1) {
				for (let rowIndex = 0; rowIndex < roomRows.length; rowIndex++) {
					if (rowIndex === 5 || rowIndex === 6) {
						for (let x = 0; x < bridgeWidth; x++) layout[rowIndex].push("b42");
					} else {
						for (let x = 0; x < bridgeWidth; x++) layout[rowIndex].push(0);
					}
				}
			}
		}

		return layout;
	}

	private refreshTutorialObjectiveTextStyles() {
		if (!this.tutorialObjectiveTexts.length) return;
		this.tutorialObjectiveTexts.forEach((text, index) => {
			const stepNumber = index + 1;
			if (stepNumber < this.tutorialStep) {
				text.setColor("#b2ffb8");
				text.setAlpha(0.75);
			} else if (stepNumber === this.tutorialStep) {
				text.setColor("#fff3c4");
				text.setAlpha(1);
			} else {
				text.setColor("#bdd0ff");
				text.setAlpha(0.6);
			}
		});
	}

	private setupTutorialScenario() {
		if (!this.tutorialModeActive) return;
		this.createTutorialGateForStep(2, 1);
		this.createTutorialGateForStep(3, 2);
		this.createTutorialGateForStep(4, 3);
		this.createTutorialGateForStep(5, 4);

		const room2X = this.tutorialRoomCenterXs[1];
		const room3X = this.tutorialRoomCenterXs[2];
		const room4X = this.tutorialRoomCenterXs[3];
		const room5X = this.tutorialRoomCenterXs[4];
		const enemyY = this.tutorialRoomTopY + this.scaledTileSize * 5.6;
		if (typeof room2X === "number") {
			const dummy = this.spawnEnemy("skeleton", room2X, enemyY);
			if (dummy) {
				dummy.setData("tutorialPassiveDummy", true);
				dummy.setData("hp", 3);
				dummy.setData("hpMax", 3);
				this.syncEnemyHealthBar(dummy);
				this.tutorialAttackDummy = dummy;
			}
		}
		if (typeof room3X === "number") {
			this.spawnTutorialChest(room3X, enemyY, 3, 3);
		}
		if (typeof room4X === "number") {
			const icon = this.spawnLootIcon(room4X, enemyY, 8, undefined, undefined, false);
			icon.setData("tutorialRewardStep", 4);
			const aura = this.add.circle(room4X, enemyY, this.scaledTileSize * 0.85, 0x93d7ff, 0.2);
			aura.setDepth(11);
			aura.setBlendMode(Phaser.BlendModes.ADD);
			this.tweens.add({
				targets: aura,
				alpha: { from: 0.18, to: 0.38 },
				scaleX: { from: 0.94, to: 1.07 },
				scaleY: { from: 0.94, to: 1.07 },
				duration: 740,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut"
			});
			icon.setData("tutorialRewardAura", aura);
		}
		if (typeof room5X === "number") {
			this.spawnOrRefreshTutorialSkillIcon();
		}
		this.refreshTutorialObjectiveTextStyles();
	}

	private getSpecialIconTypeForCharacter(type: "knight" | "mage" | "archer" | "rogue") {
		if (type === "mage") return 5;
		if (type === "archer") return 6;
		if (type === "rogue") return 2;
		return 7;
	}

	private spawnOrRefreshTutorialSkillIcon() {
		if (!this.tutorialModeActive || this.tutorialStep5RewardCollected) return;
		const centerX = this.tutorialRoomCenterXs[4];
		if (typeof centerX !== "number") return;
		const y = this.tutorialRoomTopY + this.scaledTileSize * 5.6;
		const desiredType = this.getSpecialIconTypeForCharacter(this.activeCharacter);

		if (this.tutorialSkillIcon && this.tutorialSkillIcon.active) {
			const currentType = this.tutorialSkillIcon.getData("iconType") as number | undefined;
			if (currentType === desiredType) {
				this.tutorialSkillIcon.setData("tutorialRewardStep", 5);
				return;
			}
			const oldAura = this.tutorialSkillIcon.getData("tutorialRewardAura") as Phaser.GameObjects.GameObject | undefined;
			if (oldAura?.active) oldAura.destroy();
			this.createPuffEffect(this.tutorialSkillIcon.x, this.tutorialSkillIcon.y, 0.8, 12);
			this.tutorialSkillIcon.destroy();
			this.tutorialSkillIcon = undefined;
		}

		const icon = this.spawnLootIcon(centerX, y, desiredType, undefined, this.activeCharacter, true);
		icon.setData("tutorialRewardStep", 5);
		const aura = this.add.circle(centerX, y, this.scaledTileSize * 0.82, 0xf4cf74, 0.2);
		aura.setDepth(11);
		aura.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: aura,
			alpha: { from: 0.16, to: 0.36 },
			scaleX: { from: 0.95, to: 1.08 },
			scaleY: { from: 0.95, to: 1.08 },
			duration: 760,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut"
		});
		icon.setData("tutorialRewardAura", aura);
		this.tutorialSkillIcon = icon;
	}

	private createTutorialGateForStep(unlockStep: number, bridgeIndex: number) {
		if (!this.tutorialModeActive || !this.walls) return;
		const gateX = this.tutorialRoomBaseX
			+ bridgeIndex * this.tutorialRoomStride
			+ 7 * this.scaledTileSize
			+ 2 * this.scaledTileSize;
		const gateY = this.tutorialRoomTopY + 5 * this.scaledTileSize;

		const gate = this.walls.create(gateX, gateY, "dungeon_tileset");
		gate.setOrigin(0, 0);
		gate.setDisplaySize(this.scaledTileSize, this.scaledTileSize * 2);
		gate.refreshBody();
		gate.setVisible(false);
		gate.setData("tutorialGate", true);

		const fx = this.add.rectangle(
			gateX + this.scaledTileSize * 0.5,
			gateY + this.scaledTileSize,
			this.scaledTileSize * 0.42,
			this.scaledTileSize * 1.75,
			0x8ecbff,
			0.28
		);
		fx.setDepth(14);
		fx.setBlendMode(Phaser.BlendModes.ADD);
		this.tweens.add({
			targets: fx,
			alpha: { from: 0.2, to: 0.55 },
			duration: 820,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut"
		});
		gate.setData("tutorialGateFx", fx);
		this.tutorialGateWalls[unlockStep] = gate;
	}

	private unlockTutorialGate(stepUnlocked: number) {
		const gate = this.tutorialGateWalls[stepUnlocked];
		if (!gate || !gate.active) return;
		const fx = gate.getData("tutorialGateFx") as Phaser.GameObjects.GameObject | undefined;
		if (fx && fx.active) fx.destroy();
		this.createPuffEffect(gate.x + this.scaledTileSize * 0.5, gate.y + this.scaledTileSize, 1.2, 16);
		this.playFx("openDoor", { volume: 0.65 });
		gate.destroy();
		this.tutorialGateWalls[stepUnlocked] = null;
	}

	private spawnTutorialChest(centerX: number, centerY: number, forcedIconType: number, rewardStep: number) {
		if (!this.chests) return;
		const chest = this.chests.create(
			centerX - this.scaledTileSize * 0.5,
			centerY - this.scaledTileSize * 0.5,
			"chest",
			0
		) as Phaser.Physics.Arcade.Sprite;
		chest.setOrigin(0, 0);
		chest.setScale(2);
		chest.y -= 18;
		chest.setDepth(1);
		const body = chest.body as Phaser.Physics.Arcade.Body;
		body.setSize(this.scaledTileSize, this.scaledTileSize);
		body.setOffset(0, 0);
		body.updateFromGameObject();
		chest.setData("opened", false);
		chest.setData("opening", false);
		chest.setData("tutorialDropIcon", forcedIconType);
		chest.setData("tutorialRewardStep", rewardStep);
	}

	private getTutorialCurrentRoom(): number | null {
		if (!this.tutorialModeActive || !this.player) return null;
		const py = this.player.y;
		const minY = this.tutorialRoomTopY;
		const maxY = this.tutorialRoomTopY + 11 * this.scaledTileSize;
		if (py < minY || py > maxY) return null;

		const px = this.player.x;
		const roomCount = this.tutorialRoomCenterXs.length || 6;
		for (let i = 0; i < roomCount; i++) {
			const roomLeft = this.tutorialRoomBaseX + i * this.tutorialRoomStride;
			const roomRight = roomLeft + 7 * this.scaledTileSize;
			if (px >= roomLeft && px <= roomRight) {
				return i + 1;
			}
		}
		return null;
	}

	private markTutorialRewardCollected(step: number, unlockedSkillLabel?: string | null) {
		if (!this.tutorialModeActive) return;
		if (step === 3 && !this.tutorialStep3RewardCollected) {
			this.tutorialStep3RewardCollected = true;
			this.showWaveMessage("Buff Collected");
		} else if (step === 4 && !this.tutorialStep4RewardCollected) {
			this.tutorialStep4RewardCollected = true;
			this.showWaveMessage("Character Changed");
		} else if (step === 5 && !this.tutorialStep5RewardCollected) {
			this.tutorialStep5RewardCollected = true;
			const aura = this.tutorialSkillIcon?.getData("tutorialRewardAura") as Phaser.GameObjects.GameObject | undefined;
			if (aura?.active) aura.destroy();
			this.tutorialSkillIcon = undefined;
			const unlockedLabel = (unlockedSkillLabel ?? "").trim();
			this.showWaveMessage(unlockedLabel ? `${unlockedLabel} Unlocked` : "Skill Collected");
			this.time.delayedCall(1150, () => {
				if (!this.scene.isActive(this.scene.key)) return;
				if (!this.tutorialModeActive || this.tutorialTransitioning || this.tutorialFinalFightCompleted) return;
				if (this.tutorialStep >= 5) {
					this.showWaveMessage("Move to the next room!");
				}
			});
		}
	}

	private spawnTutorialFinalFight() {
		if (!this.tutorialModeActive || this.tutorialFinalFightSpawned) return;
		const centerX = this.tutorialRoomCenterXs[5];
		if (typeof centerX !== "number") return;
		this.tutorialFinalFightSpawned = true;
		this.tutorialFinalEnemies.clear();
		const baseY = this.tutorialRoomTopY + this.scaledTileSize * 5.7;
		const spawns: Array<{ type: string; dx: number; dy: number }> = [
			{ type: "rat", dx: -this.scaledTileSize * 0.9, dy: 0 },
			{ type: "skeleton", dx: this.scaledTileSize * 0.9, dy: 0 }
		];
		spawns.forEach((spawn) => {
			const enemy = this.spawnEnemy(spawn.type, centerX + spawn.dx, baseY + spawn.dy);
			if (enemy) {
				enemy.setData("tutorialFinalEnemy", true);
				this.tutorialFinalEnemies.add(enemy);
			}
		});
	}

	private updateTutorialFlow() {
		if (!this.tutorialModeActive || this.tutorialTransitioning || !this.player) return;

		const room = this.getTutorialCurrentRoom();
		if (this.tutorialStep === 1 && room !== null && room >= 2) {
			this.tutorialStep = 2;
			this.refreshTutorialObjectiveTextStyles();
		}

		if (this.tutorialStep === 2) {
			const dummyAlive = this.tutorialAttackDummy
				&& this.tutorialAttackDummy.active
				&& this.tutorialAttackDummy.getData("state") !== "dying";
			if (!dummyAlive) {
				this.unlockTutorialGate(2);
				this.tutorialStep = 3;
				this.refreshTutorialObjectiveTextStyles();
				this.showWaveMessage("Enemy Defeated");
			}
		}

		if (this.tutorialStep === 3 && this.tutorialStep3RewardCollected) {
			this.unlockTutorialGate(3);
			this.tutorialStep = 4;
			this.refreshTutorialObjectiveTextStyles();
		}

		if (this.tutorialStep === 4 && this.tutorialStep4RewardCollected) {
			this.unlockTutorialGate(4);
			this.tutorialStep = 5;
			this.refreshTutorialObjectiveTextStyles();
		}

		if (this.tutorialStep === 5 && this.tutorialStep5RewardCollected) {
			this.unlockTutorialGate(5);
			this.tutorialStep = 6;
			this.refreshTutorialObjectiveTextStyles();
		}

		if (this.tutorialStep === 6) {
			if (!this.tutorialFinalFightSpawned && room === 6) {
				this.spawnTutorialFinalFight();
			}
			if (this.tutorialFinalFightSpawned && !this.tutorialFinalFightCompleted) {
				let alive = 0;
				this.tutorialFinalEnemies.forEach((enemy) => {
					if (enemy.active && enemy.getData("state") !== "dying") alive += 1;
				});
				if (alive <= 0) {
					this.tutorialFinalFightCompleted = true;
					this.tutorialStep = 7;
					this.refreshTutorialObjectiveTextStyles();
					this.beginTutorialCompletionTransition();
				}
			}
		}
	}

	private beginTutorialCompletionTransition() {
		if (this.tutorialTransitioning) return;
		this.tutorialTransitioning = true;
		this.showWaveMessage("Tutorial Complete!\nEntering Dungeon...");
		this.triggerHaptic("success");
		this.cameras.main.stopFollow();
		this.tweens.killTweensOf(this.cameras.main);
		const targetX = this.mainSpawnX || this.player.x;
		const targetY = this.mainSpawnY || this.player.y;
		this.cameras.main.pan(targetX, targetY, 1900, "Sine.easeInOut");
		this.time.delayedCall(1100, () => {
			this.cameras.main.fadeOut(1100, 0, 0, 0);
		});
		this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
			this.scene.restart({ mapMode: "main", autoStart: true });
		});
	}

	private updateEnemies() {
		if (!this.enemies || !this.player || !this.scaledTileSize) return;

		const now = this.time.now;
		const baseSpeed = 190;
		const aggroRange = 7 * this.scaledTileSize;
		const attackRange = 0.9 * this.scaledTileSize;
		const attackCooldownMs = 900;

		this.enemies.getChildren().forEach((c) => {
			const enemy = c as Phaser.Physics.Arcade.Sprite;
			if (!enemy.active || !enemy.body) return;

			const type = enemy.getData("type") || "rat";
			if (!this.enemyConfigs[type]) return;

			const idleAnim = `${type}-idle`;
			const atkAnim = `${type}-attack`;

			const state = (enemy.getData("state") as string) || "idle";
			const body = enemy.body as Phaser.Physics.Arcade.Body;

			if (state === "dying") {
				this.clearArcherBindingRing(enemy);
				body.setVelocity(0, 0);
				return;
			}
			if (enemy.getData("tutorialPassiveDummy") === true) {
				enemy.setData("state", "idle");
				body.setVelocity(0, 0);
				if (enemy.anims.currentAnim?.key !== idleAnim) enemy.play(idleAnim);
				return;
			}

			const rootedUntil = (enemy.getData("rootedUntil") as number) || 0;
			this.syncArcherBindingRing(enemy, rootedUntil);

			const hitUntil = (enemy.getData("hitUntil") as number) || 0;
			if (now < hitUntil) {
				return;
			}
				const stunnedUntil = (enemy.getData("stunnedUntil") as number) || 0;
				if (now < stunnedUntil) {
					enemy.setData("state", "idle");
					body.setVelocity(0, 0);
					if (enemy.anims.currentAnim?.key !== idleAnim) enemy.play(idleAnim);
					return;
				}
				const rooted = now < rootedUntil;

				const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);

			// Out of aggro: stop chasing
			if (dist > aggroRange && state !== "attack") {
				enemy.setData("state", "idle");
				body.setVelocity(0, 0);
				if (enemy.anims.currentAnim?.key !== idleAnim) enemy.play(idleAnim);
				return;
			}

			// Attack (stationary). If player steps out mid-attack, they "dodge" it.
			if (state !== "attack" && dist <= attackRange) {
				const lastAttackTime = (enemy.getData("lastAttackTime") as number) || 0;
				if (now - lastAttackTime >= attackCooldownMs) {
					enemy.setData("state", "attack");
					enemy.setData("lastAttackTime", now);
					enemy.setData("attackHitAt", now + 300);
					enemy.setData("attackHitDone", false);
					body.setVelocity(0, 0);
					enemy.play(atkAnim);
					const shootFx =
						type === "dragon"
							? "dragonShoot"
							: type === "slime" || type === "slime_split"
								? "slimeShoot"
								: type === "mummy"
									? "mummyShoot"
									: "enemyShoot";
					const shootVolume =
						type === "dragon" ? 0.8 : type === "slime" || type === "slime_split" ? 0.6 : type === "mummy" ? 0.7 : 0.6;
					this.playFx(shootFx, { volume: shootVolume });
					return;
				}
			}

				if (state === "attack") {
					const hitAt = (enemy.getData("attackHitAt") as number) || 0;
					const hitDone = enemy.getData("attackHitDone") as boolean;
					if (!hitDone && hitAt > 0 && now >= hitAt) {
						enemy.setData("attackHitDone", true);
					if (dist <= attackRange) {
						const dmg = this.enemyConfigs[type]?.damage ?? 1;
						this.damagePlayer(enemy.x, enemy.y, dmg);
					}
				}
					body.setVelocity(0, 0);
					return;
				}

				if (rooted) {
					enemy.setData("state", "idle");
					body.setVelocity(0, 0);
					if (enemy.anims.currentAnim?.key !== idleAnim) enemy.play(idleAnim);
					return;
				}

				// Chase
				enemy.setData("state", "chase");
			if (enemy.anims.currentAnim?.key !== idleAnim) enemy.play(idleAnim);

			const lastPathTime = (enemy.getData("lastPathTime") as number) || 0;
			if (now - lastPathTime > 250) {
				const s = this.worldToTile(enemy.x, enemy.y);
				const g = this.worldToTile(this.player.x, this.player.y);
				const path = this.findPath(s.x, s.y, g.x, g.y);
				enemy.setData("path", path);
				enemy.setData("pathIndex", path.length > 1 ? 1 : 0);
				enemy.setData("lastPathTime", now);
			}

			const path = (enemy.getData("path") as { x: number; y: number }[]) || [];
			let pathIndex = (enemy.getData("pathIndex") as number) || 0;

			let targetX = this.player.x;
			let targetY = this.player.y;

			if (path.length > 0 && pathIndex < path.length) {
				const node = path[pathIndex];
				const w = this.tileToWorld(node.x, node.y);
				targetX = w.x;
				targetY = w.y;

				const radius = (enemy.getData("colliderRadius") as number) || 0;
				const reachThreshold = Math.max(8, radius * 0.6);
				const distToNode = Phaser.Math.Distance.Between(enemy.x, enemy.y, targetX, targetY);
				if (distToNode < reachThreshold) {
					pathIndex++;
					enemy.setData("pathIndex", pathIndex);
				}
			}

			const angle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
			const speed = (this.enemyConfigs[type]?.speed ?? baseSpeed) * this.getMageEnemySpeedMultiplier(enemy);
			body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

			// If we're blocked, advance path sooner to avoid getting stuck on corners.
			const blockedX = body.blocked.left || body.blocked.right;
			const blockedY = body.blocked.up || body.blocked.down;
			const stuckSince = (enemy.getData("stuckSince") as number) || 0;
			const nowMs = this.time.now;
			if ((blockedX || blockedY) && path.length > 0 && pathIndex < path.length) {
				const node = path[pathIndex];
				const w = this.tileToWorld(node.x, node.y);
				const radius = (enemy.getData("colliderRadius") as number) || 0;
				const reachThreshold = Math.max(8, radius * 0.8);
				if (Phaser.Math.Distance.Between(enemy.x, enemy.y, w.x, w.y) < reachThreshold) {
					pathIndex++;
					enemy.setData("pathIndex", pathIndex);
				}
				// If still blocked, try skipping ahead a node to avoid corner traps.
				if (pathIndex + 1 < path.length) {
					enemy.setData("pathIndex", pathIndex + 1);
				}
				enemy.setData("lastPathTime", 0);
			}
			// If still blocked, hard-unstuck: back off and slide for a short burst.
			if (blockedX || blockedY) {
				if (!stuckSince) enemy.setData("stuckSince", nowMs);
				const blockedFor = nowMs - ((enemy.getData("stuckSince") as number) || nowMs);
				if (blockedFor > 120) {
					const escapeSpeed = speed * 1.4;
					let vx = 0;
					let vy = 0;
					if (body.blocked.left) vx = escapeSpeed;
					if (body.blocked.right) vx = -escapeSpeed;
					if (body.blocked.up) vy = escapeSpeed;
					if (body.blocked.down) vy = -escapeSpeed;
					// Add a small perpendicular slide so it doesn't ping-pong.
					if (vx !== 0 && vy === 0) vy = (Math.random() > 0.5 ? 1 : -1) * escapeSpeed * 0.4;
					if (vy !== 0 && vx === 0) vx = (Math.random() > 0.5 ? 1 : -1) * escapeSpeed * 0.4;
					body.setVelocity(vx, vy);
					enemy.setData("unstuckUntil", nowMs + 200);
					enemy.setData("lastPathTime", 0);
				}
			} else {
				enemy.setData("stuckSince", 0);
			}

			// During unstuck burst, keep the escape velocity.
			const unstuckUntil = (enemy.getData("unstuckUntil") as number) || 0;
			if (unstuckUntil > nowMs && (blockedX || blockedY)) {
				return;
			}

			// Sprite faces the moving direction (some sheets are authored facing the opposite way).
			const cfg = this.enemyConfigs[type];
			const movingRight = body.velocity.x > 0;
			enemy.flipX = cfg?.facingInverted ? movingRight : !movingRight;
		});

		this.enemies.getChildren().forEach((c) => {
			this.syncEnemyHealthBar(c as Phaser.Physics.Arcade.Sprite);
		});
	}

	private worldToTile(x: number, y: number) {
		return {
			x: Phaser.Math.Clamp(Math.floor((x - this.mapOriginX) / this.scaledTileSize), 0, this.navCols - 1),
			y: Phaser.Math.Clamp(Math.floor((y - this.mapOriginY) / this.scaledTileSize), 0, this.navRows - 1)
		};
	}

	private tileToWorld(x: number, y: number) {
		return {
			x: this.mapOriginX + x * this.scaledTileSize + this.scaledTileSize / 2,
			y: this.mapOriginY + y * this.scaledTileSize + this.scaledTileSize / 2
		};
	}

	private buildConnectedMask(startX: number, startY: number) {
		const mask = Array.from({ length: this.navRows }, () => Array(this.navCols).fill(false));
		if (!this.navWalkable?.[startY]?.[startX]) return mask;

		const queue: { x: number; y: number }[] = [{ x: startX, y: startY }];
		mask[startY][startX] = true;
		const dirs = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 }
		];

		while (queue.length) {
			const cur = queue.shift()!;
			for (const d of dirs) {
				const nx = cur.x + d.dx;
				const ny = cur.y + d.dy;
				if (ny < 0 || ny >= this.navRows || nx < 0 || nx >= this.navCols) continue;
				if (mask[ny][nx]) continue;
				if (!this.navWalkable[ny][nx]) continue;
				mask[ny][nx] = true;
				queue.push({ x: nx, y: ny });
			}
		}
		return mask;
	}

	private buildSpawnCandidates(excludeMask: boolean[][]) {
		const out: { x: number; y: number }[] = [];
		for (let y = 0; y < this.navRows; y++) {
			for (let x = 0; x < this.navCols; x++) {
				if (!this.navWalkable[y][x]) continue;
				if (excludeMask?.[y]?.[x]) continue;
				out.push(this.tileToWorld(x, y));
			}
		}
		return out;
	}

	private buildSpawnCandidatesInRange(minX: number, maxX: number, minY: number, maxY: number) {
		const out: { x: number; y: number }[] = [];
		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				if (!this.navWalkable?.[y]?.[x]) continue;
				out.push(this.tileToWorld(x, y));
			}
		}
		return out;
	}

	private findPath(sx: number, sy: number, gx: number, gy: number) {
		if (!this.navWalkable || this.navRows === 0 || this.navCols === 0) return [];
		if (sx === gx && sy === gy) return [{ x: sx, y: sy }];

		const inBounds = (x: number, y: number) => y >= 0 && y < this.navRows && x >= 0 && x < this.navCols;
		const key = (x: number, y: number) => `${x},${y}`;
		const heuristic = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);

		const open: { x: number; y: number }[] = [{ x: sx, y: sy }];
		const cameFrom = new Map<string, string>();
		const gScore = new Map<string, number>();
		const fScore = new Map<string, number>();

		gScore.set(key(sx, sy), 0);
		fScore.set(key(sx, sy), heuristic(sx, sy));

		const neighbors = [
			{ dx: 1, dy: 0, cost: 1 },
			{ dx: -1, dy: 0, cost: 1 },
			{ dx: 0, dy: 1, cost: 1 },
			{ dx: 0, dy: -1, cost: 1 },
			{ dx: 1, dy: 1, cost: 1.414 },
			{ dx: -1, dy: 1, cost: 1.414 },
			{ dx: 1, dy: -1, cost: 1.414 },
			{ dx: -1, dy: -1, cost: 1.414 }
		];

		while (open.length > 0) {
			// Pick node with lowest fScore (grid is small, linear scan is fine)
			let bestIdx = 0;
			let bestF = Infinity;
			for (let i = 0; i < open.length; i++) {
				const n = open[i];
				const f = fScore.get(key(n.x, n.y)) ?? Infinity;
				if (f < bestF) {
					bestF = f;
					bestIdx = i;
				}
			}

			const current = open.splice(bestIdx, 1)[0];
			if (current.x === gx && current.y === gy) {
				// Reconstruct path
				const out: { x: number; y: number }[] = [{ x: gx, y: gy }];
				let curKey = key(gx, gy);
				while (cameFrom.has(curKey)) {
					const prev = cameFrom.get(curKey)!;
					const [px, py] = prev.split(",").map(Number);
					out.push({ x: px, y: py });
					curKey = prev;
				}
				out.reverse();
				return out;
			}

			const currentKey = key(current.x, current.y);
			const currentG = gScore.get(currentKey) ?? Infinity;

			for (const nb of neighbors) {
				const nx = current.x + nb.dx;
				const ny = current.y + nb.dy;
				if (!inBounds(nx, ny)) continue;

				// Prevent diagonal corner-cutting: both adjacent cardinals must be walkable.
				if (nb.dx !== 0 && nb.dy !== 0) {
					const ax = current.x + nb.dx;
					const ay = current.y;
					const bx = current.x;
					const by = current.y + nb.dy;
					if (!this.navWalkable[ay]?.[ax] || !this.navWalkable[by]?.[bx]) continue;
				}

				// Allow pathing onto the goal tile even if it isn't marked walkable.
				const walkable = (nx === gx && ny === gy) ? true : this.navWalkable[ny][nx];
				if (!walkable) continue;

				const nk = key(nx, ny);
				const tentativeG = currentG + nb.cost;
				const prevG = gScore.get(nk);
				if (prevG === undefined || tentativeG < prevG) {
					cameFrom.set(nk, currentKey);
					gScore.set(nk, tentativeG);
					fScore.set(nk, tentativeG + heuristic(nx, ny));
					if (!open.some((n) => n.x === nx && n.y === ny)) {
						open.push({ x: nx, y: ny });
					}
				}
			}
		}

		return [];
	}

	private createPuffEffect(x: number, y: number, scale: number = 1, count: number = 10) {
		for (let i = 0; i < count; i++) {
			const size = Phaser.Math.Between(4, 10) * scale;
			const color = Phaser.Display.Color.Interpolate.ColorWithColor(
				Phaser.Display.Color.ValueToColor(0xffffff),
				Phaser.Display.Color.ValueToColor(0xaaaaaa),
				100,
				Phaser.Math.Between(0, 100)
			);

			const p = this.add.circle(x, y, size, Phaser.Display.Color.GetColor(color.r, color.g, color.b));
			p.setDepth(15);

			const angle = Math.random() * Math.PI * 2;
			const dist = Math.random() * 50 * scale;

			this.tweens.add({
				targets: p,
				x: x + Math.cos(angle) * dist,
				y: y + Math.sin(angle) * dist,
				alpha: 0,
				scale: 0.1,
				duration: Phaser.Math.Between(400, 800),
				ease: 'Cubic.out',
				onComplete: () => p.destroy()
			});
		}
	}

	private createBloodSplatter(x: number, y: number) {
		if (!this.textures.exists("blood_pixel")) {
			const g = this.make.graphics({ x: 0, y: 0, add: false });
			g.fillStyle(0x7a0c0c, 1);
			g.fillRect(0, 0, 2, 2);
			g.generateTexture("blood_pixel", 2, 2);
			g.destroy();
		}

		const count = Phaser.Math.Between(12, 18);
		const darkColors = [0xd33b3b];
		for (let i = 0; i < count; i++) {
			const size = Phaser.Math.Between(2, 5);
			const dx = Phaser.Math.Between(-28, 28);
			const dy = Phaser.Math.Between(-22, 22);
			const c = darkColors[Phaser.Math.Between(0, darkColors.length - 1)];
			const blob = this.add.image(x, y, "blood_pixel");
			blob.setOrigin(0.5, 0.5);
			blob.setDisplaySize(size, size);
			blob.setTint(c);
			// Keep it under doors/enemies and out of lighting tint.
			blob.setDepth(1);
			blob.setData("ignoreLighting", true);
			this.mapTiles.push(blob);

			// Toss outwards briefly (2-3 frames), then settle.
			this.tweens.add({
				targets: blob,
				x: x + dx,
				y: y + dy,
				duration: Phaser.Math.Between(90, 140),
				ease: "Quad.easeOut"
			});

			const linger = Phaser.Math.Between(5000, 10000);
			this.time.delayedCall(linger, () => {
				this.tweens.add({
					targets: blob,
					alpha: 0,
					duration: 600,
					ease: "Quad.easeOut",
					onComplete: () => blob.destroy()
				});
			});
		}
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */

// You can write more code here
