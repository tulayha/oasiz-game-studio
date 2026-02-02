type GameState = "MENU" | "PLAYING" | "GAME_OVER";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface CorridorChunk {
  x: number;
  width: number;
  topPath: number[]; // Array of Y values for top boundary
  bottomPath: number[]; // Array of Y values for bottom boundary
  spikeWheels: SpikeWheel[]; // Spike wheels attached to this chunk
}

interface SpikeWheel {
  x: number; // Relative to chunk
  y: number; // Center Y position
  radius: number;
  rotation: number;
  rotationSpeed: number;
  spikeCount: number;
}

interface Obstacle {
  x: number;
  gapCenterY: number;
  gapHalfHeight: number;
  width: number;
}

interface InputState {
  active: boolean;
}

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const gameContainer = document.getElementById("game-container") as HTMLDivElement;

const startOverlay = document.getElementById("startOverlay") as HTMLDivElement;
const gameOverOverlay = document.getElementById("gameOverOverlay") as HTMLDivElement;
const settingsModal = document.getElementById("settingsModal") as HTMLDivElement;

const startButton = document.getElementById("startButton") as HTMLButtonElement;
const restartButton = document.getElementById("restartButton") as HTMLButtonElement;
const backToMenuButton = document.getElementById("backToMenuButton") as HTMLButtonElement;

const pauseButton = document.getElementById("pauseButton") as HTMLButtonElement;
const settingsButton = document.getElementById("settingsButton") as HTMLButtonElement;

const scoreValue = document.getElementById("scoreValue") as HTMLSpanElement;
const finalScoreText = document.getElementById("finalScoreText") as HTMLParagraphElement;

const musicToggle = document.getElementById("musicToggle") as HTMLDivElement;
const fxToggle = document.getElementById("fxToggle") as HTMLDivElement;
const hapticsToggle = document.getElementById("hapticsToggle") as HTMLDivElement;
const settingsCloseButton = document.getElementById(
  "settingsCloseButton",
) as HTMLButtonElement;

const wavePreview = document.getElementById("wavePreview") as HTMLDivElement;

let w = 0;
let h = 0;
const isMobile = window.matchMedia("(pointer: coarse)").matches;

// Game state
let gameState: GameState = "MENU";
let distanceScore = 0;
let cameraX = 0;
let screenShake = 0;
let deathFlash = 0;

// Wave player
let playerX = 0;
let playerY = 0;
let waveAngleUp = -Math.PI / 4;
let waveAngleDown = Math.PI / 4;
let waveSpeed = 420; // pixels per second along direction vector
let playerTrail: { x: number; y: number; life: number; maxLife: number }[] = [];

// Obstacles
let obstacles: Obstacle[] = [];
const obstacleConfig = {
  spacing: 320,
  width: 48,
  minGap: 120,
  maxGap: 170,
};

// Settings
let settings: Settings = {
  music: true,
  fx: true,
  haptics: true,
};

// Simple background music stub (can be wired to real asset later)
let bgm: HTMLAudioElement | null = null;

const inputState: InputState = { active: false };

function loadSettings(): void {
  try {
    const raw = localStorage.getItem("waveRunnerSettings");
    if (raw) {
      const parsed = JSON.parse(raw) as Settings;
      settings = {
        music: parsed.music ?? true,
        fx: parsed.fx ?? true,
        haptics: parsed.haptics ?? true,
      };
    }
  } catch {
    settings = { music: true, fx: true, haptics: true };
  }
}

function saveSettings(): void {
  localStorage.setItem("waveRunnerSettings", JSON.stringify(settings));
}

function updateToggleVisual(toggle: HTMLDivElement, active: boolean): void {
  if (active) {
    toggle.classList.add("active");
  } else {
    toggle.classList.remove("active");
  }
}

function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
  if (!settings.haptics) return;
  const win = window as any;
  if (typeof win.triggerHaptic === "function") {
    win.triggerHaptic(type);
  }
}

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // Match container size to canvas bounds
  const rect = gameContainer.getBoundingClientRect();
  w = rect.width;
  h = rect.height;
}

function resetWavePlayer(): void {
  cameraX = 0;
  distanceScore = 0;
  scoreValue.textContent = "0";
  waveSpeed = isMobile ? 390 : 430;
  playerX = w * 0.26;
  playerY = h * 0.5;
  playerTrail = [];
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function resetObstacles(): void {
  obstacles = [];
  const startX = w * 0.7;
  const maxX = startX + obstacleConfig.spacing * 6;
  let x = startX;
  while (x < maxX) {
    const gapCenterY = randomInRange(h * 0.32, h * 0.68);
    const gapHeight = randomInRange(obstacleConfig.minGap, obstacleConfig.maxGap);
    obstacles.push({
      x,
      gapCenterY,
      gapHalfHeight: gapHeight / 2,
      width: obstacleConfig.width,
    });
    x += obstacleConfig.spacing;
  }
}

function resetGame(): void {
  resetWavePlayer();
  resetObstacles();
}

function setGameState(next: GameState): void {
  gameState = next;

  if (next === "MENU") {
    startOverlay.classList.remove("hidden");
    gameOverOverlay.classList.add("hidden");
    pauseButton.style.visibility = "hidden";
  } else if (next === "PLAYING") {
    startOverlay.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");
    pauseButton.style.visibility = "visible";
  } else if (next === "GAME_OVER") {
    startOverlay.classList.add("hidden");
    gameOverOverlay.classList.remove("hidden");
    pauseButton.style.visibility = "hidden";
  }
}

function ensureBgm(): void {
  if (bgm) return;
  bgm = new Audio("https://assets.oasiz.ai/audio/paddle_song.mp3");
  bgm.loop = true;
  bgm.volume = 0.6;
}

function updateMusicPlayback(): void {
  ensureBgm();
  if (!bgm) return;

  if (settings.music && (gameState === "PLAYING" || gameState === "MENU")) {
    bgm
      .play()
      .catch(() => {
        // ignore autoplay errors
      });
  } else {
    bgm.pause();
  }
}

function submitFinalScore(): void {
  const win = window as any;
  if (typeof win.submitScore === "function") {
    console.log("[WaveRunner] Submitting final score:", distanceScore);
    win.submitScore(Math.max(0, Math.floor(distanceScore)));
  }
}

function onGameOver(): void {
  setGameState("GAME_OVER");
  finalScoreText.textContent = "Distance: " + Math.floor(distanceScore).toString();
  submitFinalScore();
  triggerHaptic("error");

  // Screen flash and shake
  deathFlash = 1.0;
  screenShake = 15;
}

function flipWaveDirection(): void {
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function updateObstacles(dt: number): void {
  const worldPlayerX = cameraX + playerX;
  const spawnAhead = cameraX + w * 1.6;
  const removeBefore = cameraX - w * 0.6;

  // Remove obstacles far behind the camera
  obstacles = obstacles.filter((o) => o.x + o.width > removeBefore);

  // Ensure there are always a few obstacles ahead
  let furthestX =
    obstacles.length > 0 ? obstacles[obstacles.length - 1].x : worldPlayerX + w * 0.6;
  while (furthestX < spawnAhead) {
    furthestX += obstacleConfig.spacing;
    const gapCenterY = randomInRange(h * 0.28, h * 0.72);
    const gapHeight = randomInRange(obstacleConfig.minGap, obstacleConfig.maxGap);
    obstacles.push({
      x: furthestX,
      gapCenterY,
      gapHalfHeight: gapHeight / 2,
      width: obstacleConfig.width,
    });
  }

  // Collision against vertical "columns" approximating spikes
  const playerHalfSize = Math.min(w, h) * 0.018;
  const px = playerX;
  const py = playerY;
  const pw = playerHalfSize * 2.1;
  const ph = playerHalfSize * 2.1;

  for (const o of obstacles) {
    const localX = o.x - cameraX;
    const colWidth = o.width;

    const topHeight = o.gapCenterY - o.gapHalfHeight;
    const bottomY = o.gapCenterY + o.gapHalfHeight;
    const bottomHeight = h - bottomY;

    // Top block
    if (topHeight > 0) {
      if (
        rectsOverlap(
          px - pw / 2,
          py - ph / 2,
          pw,
          ph,
          localX,
          0,
          colWidth,
          topHeight,
        )
      ) {
        onGameOver();
        return;
      }
    }

    // Bottom block
    if (bottomHeight > 0) {
      if (
        rectsOverlap(
          px - pw / 2,
          py - ph / 2,
          pw,
          ph,
          localX,
          bottomY,
          colWidth,
          bottomHeight,
        )
      ) {
        onGameOver();
        return;
      }
    }
  }

  // World bounds
  const margin = h * 0.08;
  if (py < margin || py > h - margin) {
    onGameOver();
  }
}

function updateWave(dt: number): void {
  const dirAngle = inputState.active ? waveAngleUp : waveAngleDown;
  const vx = Math.cos(dirAngle) * waveSpeed;
  const vy = Math.sin(dirAngle) * waveSpeed;

  const dx = vx * dt;
  const dy = vy * dt;

  cameraX += dx;
  playerY += dy;

  // Score is distance traveled along X
  distanceScore = cameraX / 12;
  scoreValue.textContent = Math.max(0, Math.floor(distanceScore)).toString();

  // Trail
  playerTrail.push({
    x: playerX,
    y: playerY,
    life: 260,
    maxLife: 260,
  });
  if (playerTrail.length > 80) {
    playerTrail.shift();
  }
}

function update(dtMs: number): void {
  if (gameState !== "PLAYING") return;
  const dt = dtMs / 1000;
  updateWave(dt);
  updateObstacles(dt);
  updateWaveHum();
}

function drawBackground(): void {
  // Bright neon yellow/green gradient (Geometry Dash style)
  const gTop = ctx.createLinearGradient(0, 0, 0, h);
  gTop.addColorStop(0, "#FFEB3B"); // Bright yellow
  gTop.addColorStop(0.3, "#C6FF00"); // Yellow-green
  gTop.addColorStop(0.6, "#76FF03"); // Bright green
  gTop.addColorStop(1, "#4CAF50"); // Deeper green
  ctx.fillStyle = gTop;
  ctx.fillRect(0, 0, w, h);
  
  // Subtle moving particles
  if (gameState === "PLAYING") {
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 30; i++) {
      const x = (cameraX * 0.1 + i * 120) % (w * 2);
      const y = (h * 0.2 + Math.sin(cameraX * 0.01 + i) * h * 0.1) % h;
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawObstacles(): void {
  ctx.save();
  ctx.lineWidth = 2;

  for (const o of obstacles) {
    const localX = o.x - cameraX;
    if (localX + o.width < -40 || localX > w + 40) continue;

    const topHeight = o.gapCenterY - o.gapHalfHeight;
    const bottomY = o.gapCenterY + o.gapHalfHeight;
    const bottomHeight = h - bottomY;

    // Top spike block
    if (topHeight > 0) {
      const gx = ctx.createLinearGradient(localX, 0, localX + o.width, 0);
      gx.addColorStop(0, "#22c1c3");
      gx.addColorStop(1, "#4f46e5");
      ctx.fillStyle = gx;

      ctx.beginPath();
      ctx.moveTo(localX, topHeight);
      ctx.lineTo(localX + o.width / 2, 0);
      ctx.lineTo(localX + o.width, topHeight);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(191, 219, 254, 0.9)";
      ctx.stroke();
    }

    // Bottom spike block
    if (bottomHeight > 0) {
      const gy = ctx.createLinearGradient(localX, h, localX + o.width, h - bottomHeight);
      gy.addColorStop(0, "#f97316");
      gy.addColorStop(1, "#e11d48");
      ctx.fillStyle = gy;

      ctx.beginPath();
      ctx.moveTo(localX, bottomY);
      ctx.lineTo(localX + o.width / 2, h);
      ctx.lineTo(localX + o.width, bottomY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(254, 215, 170, 0.9)";
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawPlayer(): void {
  const size = Math.min(w, h) * 0.022;
  const glowSize = size * 3;

  // Trail
  for (const t of playerTrail) {
    const alpha = t.life / t.maxLife;
    ctx.beginPath();
    ctx.arc(t.x, t.y, size * 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(59, 130, 246," + (alpha * 0.25).toString() + ")";
    ctx.fill();
    t.life -= 16;
  }
  playerTrail = playerTrail.filter((p) => p.life > 0);

  // Glow
  const glow = ctx.createRadialGradient(
    playerX,
    playerY,
    0,
    playerX,
    playerY,
    glowSize,
  );
  glow.addColorStop(0, "rgba(236, 72, 153, 0.95)");
  glow.addColorStop(0.2, "rgba(59, 130, 246, 0.9)");
  glow.addColorStop(1, "rgba(15, 23, 42, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(playerX, playerY, glowSize, 0, Math.PI * 2);
  ctx.fill();

  // Core triangle
  const angle = inputState.active ? waveAngleUp : waveAngleDown;
  ctx.save();
  ctx.translate(playerX, playerY);
  ctx.rotate(angle);

  ctx.beginPath();
  // Symmetric arrow pointing exactly along +X before rotation
  ctx.moveTo(size * 1.6, 0); // tip
  ctx.lineTo(-size * 1.0, -size * 0.7);
  ctx.lineTo(-size * 1.0, size * 0.7);
  ctx.closePath();

  const body = ctx.createLinearGradient(size * 1.8, 0, -size * 1.2, 0);
  body.addColorStop(0, "#22d3ee");
  body.addColorStop(1, "#a855f7");
  ctx.fillStyle = body;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
  ctx.stroke();

  ctx.restore();
}

function drawHUD(): void {
  // HUD is in DOM; nothing extra here for now.
}

function clearCanvas(): void {
  // Apply screen shake
  ctx.save();
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake;
    const shakeY = (Math.random() - 0.5) * screenShake;
    ctx.translate(shakeX, shakeY);
    screenShake *= 0.85; // Decay
    if (screenShake < 0.1) screenShake = 0;
  }
  
  // Apply death flash
  if (deathFlash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${deathFlash})`;
    ctx.fillRect(0, 0, w, h);
    deathFlash *= 0.92; // Decay
    if (deathFlash < 0.01) deathFlash = 0;
  }
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

let lastTime = 0;

function loop(timestamp: number): void {
  if (!lastTime) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  clearCanvas();
  drawBackground();
  if (gameState === "PLAYING" || gameState === "GAME_OVER" || gameState === "MENU") {
    drawObstacles();
    drawPlayer();
  }

  update(dt);
  drawHUD();

  requestAnimationFrame(loop);
}

function setupInput(): void {
  function handlePrimaryInputDown(): void {
    inputState.active = true;
    triggerHaptic("light");
    if (gameState === "MENU") {
      resetGame();
      setGameState("PLAYING");
      updateMusicPlayback();
      return;
    }
  }

  function handlePrimaryInputUp(): void {
    inputState.active = false;
  }

  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    handlePrimaryInputDown();
  });
  canvas.addEventListener("mouseup", (e) => {
    e.preventDefault();
    handlePrimaryInputUp();
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handlePrimaryInputDown();
  });
  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    handlePrimaryInputUp();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!inputState.active) {
        handlePrimaryInputDown();
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      handlePrimaryInputUp();
    }
  });

  startButton.addEventListener("click", () => {
    triggerHaptic("light");
    resetGame();
    setGameState("PLAYING");
    updateMusicPlayback();
  });

  restartButton.addEventListener("click", () => {
    triggerHaptic("light");
    resetGame();
    setGameState("PLAYING");
    updateMusicPlayback();
  });

  backToMenuButton.addEventListener("click", () => {
    triggerHaptic("light");
    setGameState("MENU");
    updateMusicPlayback();
  });

  settingsButton.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.add("visible");
  });

  settingsCloseButton.addEventListener("click", () => {
    triggerHaptic("light");
    settingsModal.classList.remove("visible");
  });

  musicToggle.addEventListener("click", () => {
    settings.music = !settings.music;
    updateToggleVisual(musicToggle, settings.music);
    saveSettings();
    updateMusicPlayback();
  });

  fxToggle.addEventListener("click", () => {
    settings.fx = !settings.fx;
    updateToggleVisual(fxToggle, settings.fx);
    saveSettings();
  });

  hapticsToggle.addEventListener("click", () => {
    settings.haptics = !settings.haptics;
    updateToggleVisual(hapticsToggle, settings.haptics);
    saveSettings();
    triggerHaptic("light");
  });
}

function drawWavePreview(): void {
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = wavePreview.clientWidth || 300;
  previewCanvas.height = wavePreview.clientHeight || 120;
  wavePreview.innerHTML = "";
  wavePreview.appendChild(previewCanvas);

  const pctx = previewCanvas.getContext("2d");
  if (!pctx) return;

  const pw = previewCanvas.width;
  const ph = previewCanvas.height;
  pctx.clearRect(0, 0, pw, ph);

  const bg = pctx.createLinearGradient(0, 0, 0, ph);
  bg.addColorStop(0, "rgba(15, 23, 42, 0.95)");
  bg.addColorStop(1, "rgba(12, 10, 39, 0.95)");
  pctx.fillStyle = bg;
  pctx.fillRect(0, 0, pw, ph);

  pctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
  pctx.lineWidth = 1;
  const rows = 5;
  for (let i = 0; i <= rows; i++) {
    const y = (ph * i) / rows;
    pctx.beginPath();
    pctx.moveTo(0, y);
    pctx.lineTo(pw, y);
    pctx.stroke();
  }

  const cx = 26;
  const cy = ph / 2;
  const amp = ph * 0.28;

  pctx.beginPath();
  pctx.moveTo(0, cy);
  let dir: 1 | -1 = 1;
  const segment = pw / 6;
  for (let i = 0; i <= 6; i++) {
    const x0 = i * segment;
    const y0 = cy + dir * amp;
    const x1 = x0 + segment;
    const y1 = cy - dir * amp;
    pctx.lineTo(x0, y0);
    pctx.lineTo(x1, y1);
    dir = dir === 1 ? -1 : 1;
  }
  pctx.strokeStyle = "rgba(94, 234, 212, 0.8)";
  pctx.lineWidth = 2;
  pctx.stroke();

  const grad = pctx.createRadialGradient(cx, cy, 0, cx, cy, amp * 1.6);
  grad.addColorStop(0, "rgba(236, 72, 153, 0.9)");
  grad.addColorStop(0.5, "rgba(59, 130, 246, 0.8)");
  grad.addColorStop(1, "rgba(15, 23, 42, 0)");
  pctx.fillStyle = grad;
  pctx.beginPath();
  pctx.arc(cx, cy, amp * 1.6, 0, Math.PI * 2);
  pctx.fill();
}

function init(): void {
  console.log("[WaveRunner] init");
  loadSettings();
  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
  });

  resetGame();
  setGameState("MENU");

  updateToggleVisual(musicToggle, settings.music);
  updateToggleVisual(fxToggle, settings.fx);
  updateToggleVisual(hapticsToggle, settings.haptics);

  setupInput();
  drawWavePreview();
  updateMusicPlayback();

  requestAnimationFrame(loop);
}

init();

