// Catch Up – Main entry point
// Only Box2D mode is used; launches directly from the start screen.

import { launchBox2DGame, destroyBox2DGame, setAltitudeCallback as setBox2DAltCb } from './box2d-mode';

// ─── Game state ──────────────────────────────────────────────────────────────
type GameState = 'start' | 'playing';
let gameState: GameState = 'start';
let box2dGame: Phaser.Game | null = null;
let maxHeight = 0;

// ─── UI elements ─────────────────────────────────────────────────────────────
const startScreen      = document.getElementById('start-screen')!;
const playBtn          = document.getElementById('play-btn')!;
const hud              = document.getElementById('hud')!;
const settingsBtn      = document.getElementById('settings-btn')!;
const quitBtn          = document.getElementById('quit-btn')!;
const phaserContainer  = document.getElementById('phaser-container')!;

function startGame(): void {
  gameState      = 'playing';
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  quitBtn.classList.remove('hidden');
  maxHeight      = 0;
  phaserContainer.classList.remove('hidden');
  setBox2DAltCb((meters) => { maxHeight = meters; });
  box2dGame = launchBox2DGame(phaserContainer);
}

function stopGame(): void {
  if (box2dGame) {
    destroyBox2DGame(box2dGame);
    box2dGame = null;
  }
  phaserContainer.classList.add('hidden');
}

playBtn.addEventListener('click', () => startGame());

// ─── Quit / return to menu ───────────────────────────────────────────────────
const quitScreen    = document.getElementById('quit-screen')!;
const finalHeight   = document.getElementById('final-height')!;
const playAgainBtn  = document.getElementById('play-again-btn')!;

quitBtn.addEventListener('click', () => {
  gameState = 'start';
  finalHeight.textContent = String(maxHeight);
  hud.classList.add('hidden');
  settingsBtn.classList.add('hidden');
  quitBtn.classList.add('hidden');
  stopGame();
  quitScreen.classList.remove('hidden');
});

playAgainBtn.addEventListener('click', () => {
  quitScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
});

// ─── Settings modal ──────────────────────────────────────────────────────────
const settingsModal = document.getElementById('settings-modal')!;
const settingsClose = document.getElementById('settings-close')!;

settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
settingsClose.addEventListener('click', () => settingsModal.classList.add('hidden'));

// ─── Custom cursor ───────────────────────────────────────────────────────────
const cursor = document.getElementById('cursor')!;
document.addEventListener('mousemove', (e) => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';
});
