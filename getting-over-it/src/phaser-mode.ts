// Stone Ascent – Phaser Mode (Hammer Physics)
// Force-based hammer system matching PlayerControl.cs from Unity reference.
// The hammer does NOT attach to rocks. When the hammer overlaps a rock,
// a spring force pushes the player body. Only input: move the mouse.
//
// Visual reference:
//   Hand.cs  — two hands rotate toward hammer handle, stretch with distance
//   Head.cs  — head looks toward mouse (±30° clamp), random blinking
//   PlayerControl.cs — force = (hammerPos - mouseVec - bodyPos) * 80

import Phaser from 'phaser';

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_RANGE   = 150;     // max mouse offset px (Unity: maxRange=2.0)
const FORCE_MULT  = 0.002;   // spring force multiplier (Unity: 80, scaled for Matter.js)
const MAX_SPEED   = 8;       // velocity clamp (Unity: 6, slightly higher for pixel scale)
const LERP        = 0.2;     // hammer lerp toward target (same as Unity)
const BODY_R      = 18;      // player body radius
const HEAD_R      = 12;      // head radius
const HAND_R      = 5;       // hand circle radius
const HAMMER_R    = 14;      // hammer head collision check radius
const GROUND_Y    = 580;     // world Y of ground floor
const SPAWN_X     = 400;
const SPAWN_Y     = 500;
const WORLD_W     = 800;
const WORLD_H     = 4000;

// ─── Rock definitions — tighter spacing so hammer can reach ─────────────────
// Rocks are ~60-80px apart vertically with small horizontal offsets (≤120px)
// so the hammer (150px range) can always reach the next one.
const ROCK_DEFS = [
  // Starting platform
  { x: 400, y: 560, w: 500, h: 40 },
  // Ascending — tight zigzag
  { x: 330, y: 490, w: 160, h: 28 },
  { x: 470, y: 425, w: 150, h: 28 },
  { x: 340, y: 360, w: 160, h: 28 },
  { x: 480, y: 295, w: 150, h: 28 },
  { x: 350, y: 230, w: 160, h: 28 },
  { x: 460, y: 168, w: 150, h: 28 },
  { x: 330, y: 108, w: 160, h: 28 },
  { x: 470, y:  48, w: 150, h: 28 },
  { x: 350, y: -12, w: 160, h: 28 },
  { x: 460, y: -72, w: 150, h: 28 },
  { x: 330, y: -132, w: 160, h: 28 },
  { x: 470, y: -192, w: 150, h: 28 },
  { x: 350, y: -252, w: 160, h: 28 },
  { x: 460, y: -312, w: 150, h: 28 },
  { x: 330, y: -372, w: 160, h: 28 },
  { x: 470, y: -432, w: 150, h: 28 },
  { x: 350, y: -492, w: 160, h: 28 },
  { x: 460, y: -552, w: 150, h: 28 },
  { x: 330, y: -612, w: 160, h: 28 },
  { x: 470, y: -672, w: 150, h: 28 },
  // Walls
  { x: 20, y: -200, w: 40, h: 2000 },
  { x: 780, y: -200, w: 40, h: 2000 },
];

// ─── Callbacks for HUD ─────────────────────────────────────────────────────
let onAltitudeUpdate: ((meters: number) => void) | null = null;

export function setAltitudeCallback(cb: (meters: number) => void): void {
  onAltitudeUpdate = cb;
}

// ─── Phaser Scene ───────────────────────────────────────────────────────────
class ClimbScene extends Phaser.Scene {
  private playerBody!: MatterJS.BodyType;
  private hammerPos = { x: SPAWN_X, y: SPAWN_Y - 50 };
  private mouseWorld = { x: SPAWN_X, y: SPAWN_Y };
  private mouseScreen = { x: 0, y: 0 };  // normalized -1..1 for head look
  private rockBodies: MatterJS.BodyType[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private maxHeight = 0;

  // Head blinking state (from Head.cs)
  private blinking = false;
  private blinkTimer = 0;
  private nextBlinkAt = 0;
  private blinkPhase = 0;  // 0=open, 1=closed1, 2=open1, 3=closed2, 4=done

  constructor() {
    super({ key: 'ClimbScene' });
  }

  create(): void {
    this.matter.world.setBounds(0, -WORLD_H + 600, WORLD_W, WORLD_H + 200);

    // Create rocks as static Matter.js bodies
    for (const def of ROCK_DEFS) {
      const body = this.matter.add.rectangle(def.x, def.y, def.w, def.h, {
        isStatic: true,
        label: 'rock',
        friction: 0.8,
        restitution: 0.1,
      });
      this.rockBodies.push(body);
    }

    // Ground
    this.matter.add.rectangle(WORLD_W / 2, GROUND_Y + 25, WORLD_W + 200, 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.9,
    });

    // Player body (dynamic circle)
    this.playerBody = this.matter.add.circle(SPAWN_X, SPAWN_Y, BODY_R, {
      label: 'player',
      friction: 0.4,
      frictionAir: 0.012,
      restitution: 0.05,
      density: 0.002,
    });

    this.hammerPos.x = SPAWN_X;
    this.hammerPos.y = SPAWN_Y - 60;

    this.gfx = this.add.graphics();

    // Initialize blink timer (Head.cs: Random.Range(0, 10))
    this.nextBlinkAt = Math.random() * 10000;
    this.blinkTimer = 0;

    // Mouse tracking
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.mouseWorld.x = pointer.worldX;
      this.mouseWorld.y = pointer.worldY;
      // Normalized screen position for head look (Head.cs)
      this.mouseScreen.x = (pointer.x / this.scale.width) * 2.0 - 1.0;
      this.mouseScreen.y = (pointer.y / this.scale.height) * 2.0 - 1.0;
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.mouseWorld.x = pointer.worldX;
      this.mouseWorld.y = pointer.worldY;
      this.mouseScreen.x = (pointer.x / this.scale.width) * 2.0 - 1.0;
      this.mouseScreen.y = (pointer.y / this.scale.height) * 2.0 - 1.0;
    });
  }

  update(_time: number, delta: number): void {
    const body = this.playerBody;
    const bx = body.position.x;
    const by = body.position.y;

    // ── 1. Compute mouseVec (clamped offset from screen center to mouse) ────
    // PlayerControl.cs: mouseVec = ClampMagnitude(mouse - center, maxRange)
    const cam = this.cameras.main;
    const screenCenterWorld = {
      x: cam.scrollX + cam.width / 2,
      y: cam.scrollY + cam.height / 2,
    };
    const rawDx = this.mouseWorld.x - screenCenterWorld.x;
    const rawDy = this.mouseWorld.y - screenCenterWorld.y;
    const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const clampedDist = Math.min(rawDist, MAX_RANGE);
    const mouseVec = rawDist > 0
      ? { x: (rawDx / rawDist) * clampedDist, y: (rawDy / rawDist) * clampedDist }
      : { x: 0, y: 0 };

    // ── 2. Compute hammer target and lerp ───────────────────────────────────
    // PlayerControl.cs: newHammerPos = body.position + mouseVec
    // then lerp 20%: newHammerPos = hammerHead.position + (newHammerPos - hammerHead.position) * 0.2
    const hammerTarget = { x: bx + mouseVec.x, y: by + mouseVec.y };
    this.hammerPos.x += (hammerTarget.x - this.hammerPos.x) * LERP;
    this.hammerPos.y += (hammerTarget.y - this.hammerPos.y) * LERP;

    // ── 3. Check if hammer overlaps any rock ────────────────────────────────
    const MatterLib = (Phaser.Physics.Matter as any).Matter;
    const allBodies = (this.matter.world.localWorld as any).bodies as MatterJS.BodyType[];
    const staticBodies = allBodies.filter(
      (b: MatterJS.BodyType) => b.isStatic && (b.label === 'rock' || b.label === 'ground')
    );

    // Point query + small region for better detection
    const hammerQuery = MatterLib.Query.point(staticBodies, this.hammerPos);
    const hammerBounds = {
      min: { x: this.hammerPos.x - HAMMER_R, y: this.hammerPos.y - HAMMER_R },
      max: { x: this.hammerPos.x + HAMMER_R, y: this.hammerPos.y + HAMMER_R },
    };
    const hammerRegionQuery = MatterLib.Query.region(staticBodies, hammerBounds);
    const isOverlapping = hammerQuery.length > 0 || hammerRegionQuery.length > 0;

    // ── 4. Apply force if hammer overlaps rock ──────────────────────────────
    // PlayerControl.cs: targetBodyPos = hammerHead.position - mouseVec
    //                   force = (targetBodyPos - body.position) * 80
    if (isOverlapping) {
      const targetBodyX = this.hammerPos.x - mouseVec.x;
      const targetBodyY = this.hammerPos.y - mouseVec.y;
      const fx = (targetBodyX - bx) * FORCE_MULT;
      const fy = (targetBodyY - by) * FORCE_MULT;
      MatterLib.Body.applyForce(body, body.position, { x: fx, y: fy });

      // Clamp velocity (Unity: ClampMagnitude(velocity, 6))
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        MatterLib.Body.setVelocity(body, { x: vx * scale, y: vy * scale });
      }
    }

    // ── 5. Camera follow ────────────────────────────────────────────────────
    cam.scrollX += (bx - cam.width / 2 - cam.scrollX) * 0.08;
    cam.scrollY += (by - cam.height * 0.6 - cam.scrollY) * 0.08;

    // ── 6. Track altitude ───────────────────────────────────────────────────
    const altitude = Math.max(0, Math.round((SPAWN_Y - by) / 9));
    if (altitude > this.maxHeight) this.maxHeight = altitude;
    if (onAltitudeUpdate) onAltitudeUpdate(this.maxHeight);

    // ── 7. Update blink timer (Head.cs) ─────────────────────────────────────
    this.updateBlink(delta);

    // ── 8. Render ───────────────────────────────────────────────────────────
    this.renderScene(isOverlapping, mouseVec);
  }

  // Head.cs blink coroutine: wait random 0-10s, then blink twice (0.2s each)
  private updateBlink(delta: number): void {
    this.blinkTimer += delta;
    if (!this.blinking) {
      if (this.blinkTimer >= this.nextBlinkAt) {
        this.blinking = true;
        this.blinkPhase = 0;
        this.blinkTimer = 0;
      }
    } else {
      // Each phase lasts 200ms (0.2s), 4 phases: closed-open-closed-open
      if (this.blinkTimer >= 200) {
        this.blinkTimer = 0;
        this.blinkPhase++;
        if (this.blinkPhase >= 4) {
          this.blinking = false;
          this.nextBlinkAt = Math.random() * 10000;
          this.blinkTimer = 0;
        }
      }
    }
  }

  private get isEyesClosed(): boolean {
    // Closed during phases 0 and 2
    return this.blinking && (this.blinkPhase === 0 || this.blinkPhase === 2);
  }

  private renderScene(hammerOnRock: boolean, mouseVec: { x: number; y: number }): void {
    const gfx = this.gfx;
    gfx.clear();

    const bx = this.playerBody.position.x;
    const by = this.playerBody.position.y;
    const hx = this.hammerPos.x;
    const hy = this.hammerPos.y;

    // ── Background ──────────────────────────────────────────────────────────
    const cam = this.cameras.main;
    gfx.fillStyle(0x0a0a0f);
    gfx.fillRect(cam.scrollX - 10, cam.scrollY - 10, cam.width + 20, cam.height + 20);

    // ── Ground ──────────────────────────────────────────────────────────────
    gfx.fillStyle(0x0d0b08);
    gfx.fillRect(0, GROUND_Y, WORLD_W, 200);
    gfx.lineStyle(3, 0x4b5563);
    gfx.lineBetween(0, GROUND_Y, WORLD_W, GROUND_Y);

    // ── Rocks ───────────────────────────────────────────────────────────────
    for (const def of ROCK_DEFS) {
      gfx.fillStyle(0x374151);
      gfx.fillRect(def.x - def.w / 2, def.y - def.h / 2, def.w, def.h);
      gfx.lineStyle(2, 0x4b5563);
      gfx.strokeRect(def.x - def.w / 2, def.y - def.h / 2, def.w, def.h);
      gfx.lineStyle(1, 0x6b7280);
      gfx.lineBetween(
        def.x - def.w / 2, def.y - def.h / 2,
        def.x + def.w / 2, def.y - def.h / 2
      );
    }

    // ── Hands + Arms (Hand.cs) ──────────────────────────────────────────────
    // Two hands at shoulder positions, arms extend toward hammer handle
    // Hand.cs: handDir = hammerHandle.position - hand.position
    //          rotation = FromToRotation(Vector3.down, handDir)
    const shoulderOffset = BODY_R * 0.7;
    const shoulderY = by - 2;

    // Hammer handle midpoint (where arms reach toward)
    const handleMidX = bx + (hx - bx) * 0.4;
    const handleMidY = by + (hy - by) * 0.4;

    // Left hand
    const lhx = bx - shoulderOffset;
    const lhy = shoulderY;
    const lDirX = handleMidX - lhx;
    const lDirY = handleMidY - lhy;
    const lDist = Math.sqrt(lDirX * lDirX + lDirY * lDirY);
    const lArmLen = Math.min(lDist, BODY_R * 2.5);
    const lArmEndX = lhx + (lDirX / (lDist || 1)) * lArmLen;
    const lArmEndY = lhy + (lDirY / (lDist || 1)) * lArmLen;

    // Right hand
    const rhx = bx + shoulderOffset;
    const rhy = shoulderY;
    const rDirX = handleMidX - rhx;
    const rDirY = handleMidY - rhy;
    const rDist = Math.sqrt(rDirX * rDirX + rDirY * rDirY);
    const rArmLen = Math.min(rDist, BODY_R * 2.5);
    const rArmEndX = rhx + (rDirX / (rDist || 1)) * rArmLen;
    const rArmEndY = rhy + (rDirY / (rDist || 1)) * rArmLen;

    // Draw arms (lines from shoulders to hands)
    gfx.lineStyle(4, 0x78563d);
    gfx.lineBetween(lhx, lhy, lArmEndX, lArmEndY);
    gfx.lineBetween(rhx, rhy, rArmEndX, rArmEndY);

    // Draw hands (circles at arm ends) — Hand.cs sprite stretch approximation
    // spriteIndex = clamp(handDir.magnitude * 8, 0, max)
    const lHandSize = HAND_R + Math.min(2, lDist * 0.02);
    const rHandSize = HAND_R + Math.min(2, rDist * 0.02);
    gfx.fillStyle(0x9e7b5a);
    gfx.fillCircle(lArmEndX, lArmEndY, lHandSize);
    gfx.fillCircle(rArmEndX, rArmEndY, rHandSize);
    gfx.lineStyle(1, 0x5a3e28);
    gfx.strokeCircle(lArmEndX, lArmEndY, lHandSize);
    gfx.strokeCircle(rArmEndX, rArmEndY, rHandSize);

    // ── Pickaxe handle (line from hands to hammer head) ─────────────────────
    // Handle goes from between the two hand endpoints to the hammer head
    const gripX = (lArmEndX + rArmEndX) / 2;
    const gripY = (lArmEndY + rArmEndY) / 2;
    gfx.lineStyle(5, 0x92400e);
    gfx.lineBetween(gripX, gripY, hx, hy);

    // ── Pickaxe head (does NOT rotate — fixed downward orientation) ─────────
    // The head always points downward like a real pickaxe, regardless of handle angle
    const pickW = 20;
    const pickH = 8;
    gfx.fillStyle(hammerOnRock ? 0xfbbf24 : 0x9ca3af);
    // Blade pointing down-left
    gfx.beginPath();
    gfx.moveTo(hx - pickW * 0.6, hy + pickH);     // blade tip left
    gfx.lineTo(hx - pickW * 0.1, hy - pickH * 0.5); // top left
    gfx.lineTo(hx + pickW * 0.1, hy - pickH * 0.5); // top right
    gfx.lineTo(hx + pickW * 0.6, hy + pickH);     // blade tip right
    gfx.lineTo(hx, hy + pickH * 0.3);              // bottom center notch
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(1, 0x374151);
    gfx.strokePath();

    // Hammer glow when touching rock
    if (hammerOnRock) {
      gfx.fillStyle(0xfbbf24, 0.25);
      gfx.fillCircle(hx, hy, HAMMER_R + 6);
    }

    // ── Cauldron / stone slab ───────────────────────────────────────────────
    gfx.fillStyle(0x374151);
    gfx.fillEllipse(bx, by + BODY_R + 4, 40, 12);
    gfx.lineStyle(1, 0x4b5563);
    gfx.strokeEllipse(bx, by + BODY_R + 4, 40, 12);

    // ── Player body ─────────────────────────────────────────────────────────
    gfx.fillStyle(0x78563d);
    gfx.fillCircle(bx, by, BODY_R);
    gfx.fillStyle(0x2d1f14, 0.4);
    gfx.fillCircle(bx + 2, by + 2, BODY_R - 2);
    gfx.lineStyle(1.5, 0x5a3e28);
    gfx.strokeCircle(bx, by, BODY_R);

    // ── Head (Head.cs) ──────────────────────────────────────────────────────
    // Head sits on top of body, looks toward mouse
    // Head.cs: mouseDir = normalized screen pos (-1..1)
    //          degrees = atan2(mouseDir.y, abs(mouseDir.x)) clamped ±30°
    //          flipped = mouseDir.x < 0
    const headX = bx;
    const headY = by - BODY_R - HEAD_R + 4; // slightly overlapping body top
    const msx = this.mouseScreen.x;
    const msy = -this.mouseScreen.y; // flip Y (screen Y is inverted vs Unity)
    const headFlipped = msx < 0;
    let headDegrees = (180 / Math.PI) * Math.atan2(msy, Math.abs(msx));
    headDegrees = Math.max(-30, Math.min(30, headDegrees));
    const headRadians = (headDegrees * (headFlipped ? -1 : 1)) * (Math.PI / 180);

    // Head circle
    gfx.fillStyle(0xd4a574);
    gfx.fillCircle(headX, headY, HEAD_R);
    gfx.lineStyle(1, 0x8b6b4a);
    gfx.strokeCircle(headX, headY, HEAD_R);

    // Eyes — positioned based on head rotation and flip
    const eyeOffX = headFlipped ? -3 : 3;
    const eyeSpacing = 4;
    const eyeY = headY - 2;
    const cosR = Math.cos(headRadians);
    const sinR = Math.sin(headRadians);

    if (this.isEyesClosed) {
      // Closed eyes — horizontal lines
      gfx.lineStyle(1.5, 0x2d1f14);
      const e1x = headX + eyeOffX - eyeSpacing;
      const e2x = headX + eyeOffX + eyeSpacing;
      gfx.lineBetween(e1x - 2, eyeY, e1x + 2, eyeY);
      gfx.lineBetween(e2x - 2, eyeY, e2x + 2, eyeY);
    } else {
      // Open eyes
      gfx.fillStyle(0xffffff);
      const e1x = headX + eyeOffX - eyeSpacing;
      const e2x = headX + eyeOffX + eyeSpacing;
      gfx.fillCircle(e1x, eyeY, 2.5);
      gfx.fillCircle(e2x, eyeY, 2.5);
      // Pupils — shift slightly toward mouse
      const pupilShift = headFlipped ? -0.8 : 0.8;
      gfx.fillStyle(0x1a1008);
      gfx.fillCircle(e1x + pupilShift, eyeY, 1.2);
      gfx.fillCircle(e2x + pupilShift, eyeY, 1.2);
    }

    // Mouth — small line
    const mouthX = headX + (headFlipped ? -1 : 1);
    const mouthY = headY + 4;
    gfx.lineStyle(1, 0x5a3020);
    gfx.lineBetween(mouthX - 2.5, mouthY, mouthX + 2.5, mouthY);

    // Suppress unused vars
    void cosR;
    void sinR;
    void mouseVec;
  }

  getMaxHeight(): number {
    return this.maxHeight;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function launchPhaserGame(container: HTMLElement): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: window.innerWidth,
    height: window.innerHeight,
    transparent: true,
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: 1.2 },
        debug: false,
      },
    },
    scene: [ClimbScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      mouse: { preventDefaultWheel: true },
    },
  };

  return new Phaser.Game(config);
}

export function destroyPhaserGame(game: Phaser.Game): void {
  onAltitudeUpdate = null;
  game.destroy(true);
}
