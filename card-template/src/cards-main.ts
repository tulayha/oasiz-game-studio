/**
 * cards-main.ts
 * ─────────────
 * Entry point for the multiplayer card game template.
 * Screen nav: start → lobby → game → gameover.
 * PlayroomKit connect, lobby ready-up, renderer launch (PixiJS), settings, Oasiz lifecycle.
 *
 * When PIXI_DUMMY_MODE is true: skip multiplayer/lobby; show board + 4 players with dummy data only.
 */

import { oasiz } from "@oasiz/sdk";
import { PlayroomBridge } from "./cards-core/PlayroomBridge";
import { CardGameEngine } from "./cards-core/CardGameEngine";
import { DEFAULT_TABLE_CONFIG } from "./cards-core/config";
import type { TableConfig } from "./cards-core/types";
import type { LocalCard } from "./cards-core/types";
const { PixiCardGame } = await import("./pixi-cards/PixiCardGame");

// ── Pixi-only dummy mode (no multiplayer, no play/draw) ─────────────────────

const PIXI_DUMMY_MODE = true;

/** Default avatar URLs for Playroom / start-screen picker (DiceBear avataaars). */
const PLAYROOM_AVATARS = [
  "https://api.dicebear.com/9.x/avataaars/png?seed=1",
  "https://api.dicebear.com/9.x/avataaars/png?seed=2",
  "https://api.dicebear.com/9.x/avataaars/png?seed=3",
  "https://api.dicebear.com/9.x/avataaars/png?seed=4",
  "https://api.dicebear.com/9.x/avataaars/png?seed=5",
  "https://api.dicebear.com/9.x/avataaars/png?seed=6",
  "https://api.dicebear.com/9.x/avataaars/png?seed=7",
  "https://api.dicebear.com/9.x/avataaars/png?seed=8",
];

/** Dummy bridge for Pixi-only dev: no connect, no play/draw, dummy opponent counts. */
class DummyBridge {
  readonly isDummy = true;
  constructor(
    private engine: CardGameEngine,
    private localName: string = "You",
    private localAvatarUrl: string | null = null,
  ) { }
  async connect(_roomCode: string | null): Promise<void> { }
  init(_callbacks: unknown, _engine?: unknown): void { }
  getRoomCode(): string { return "DUMMY"; }
  getPlayers(): { id: string; handCount: number; playerName: string; playerAvatar: string | null; isReady: boolean }[] {
    return [
      { id: "local", handCount: this.engine.handCount, playerName: this.localName, playerAvatar: this.localAvatarUrl, isReady: true },
      { id: "opp-A", handCount: 6, playerName: "Opponent A", playerAvatar: PLAYROOM_AVATARS[0] ?? null, isReady: true },
      { id: "opp-B", handCount: 7, playerName: "Opponent B", playerAvatar: PLAYROOM_AVATARS[1] ?? null, isReady: true },
      { id: "opp-C", handCount: 5, playerName: "Opponent C", playerAvatar: PLAYROOM_AVATARS[2] ?? null, isReady: true },
    ];
  }
  isHost(): boolean { return true; }
  getMyId(): string { return "local"; }
  isMyTurn(): boolean { return false; }
  requestDraw(): LocalCard | null { return null; }
  requestThrow(_index: number): LocalCard | null { return null; }
  leaveRoom(): void { }
}

// ── Settings ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY = "cards_settings";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as Settings;
  } catch { /* ignore */ }
  return { music: true, fx: true, haptics: true };
}

function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

let settings = loadSettings();

// ── DOM ─────────────────────────────────────────────────────────────────────

const startScreen = document.getElementById("start-screen")!;
const loadingScreen = document.getElementById("loading-screen")!;
const lobbyScreen = document.getElementById("lobby-screen")!;
const gameContainer = document.getElementById("game-container")!;
const gameoverOverlay = document.getElementById("gameover-overlay")!;
const rendererMount = document.getElementById("renderer-mount")!;

const btnCreateRoom = document.getElementById("btn-create-room")!;
const btnJoinRoom = document.getElementById("btn-join-room")!;
const startNameInput = document.getElementById("start-name") as HTMLInputElement;
const startAvatarPicker = document.getElementById("start-avatar-picker")!;
const joinSection = document.getElementById("join-section")!;
const joinCodeInput = document.getElementById("join-code") as HTMLInputElement;
const btnJoinSubmit = document.getElementById("btn-join-submit")!;

/** Selected avatar URL on start screen (used when Create Room is clicked). */
let selectedStartAvatarUrl: string | null = PLAYROOM_AVATARS[0] ?? null;

const lobbyRoomCode = document.getElementById("lobby-room-code")!;
const lobbyCopy = document.getElementById("lobby-copy")!;
const lobbyPlayersList = document.getElementById("lobby-players-list")!;
const lobbyName = document.getElementById("lobby-name") as HTMLInputElement;
const btnReady = document.getElementById("btn-ready")!;
const btnStartGame = document.getElementById("btn-start-game")!;
const btnLeaveLobby = document.getElementById("btn-leave-lobby")!;

// const backBtn = document.getElementById("back-btn")!;
// const settingsBtn = document.getElementById("settings-btn")!;
const settingsModal = document.getElementById("settings-modal")!;
const btnPlayAgain = document.getElementById("btn-play-again")!;
const btnBackGameover = document.getElementById("btn-back-from-gameover")!;

// ── State ───────────────────────────────────────────────────────────────────

const bridge = new PlayroomBridge();
const config: TableConfig = DEFAULT_TABLE_CONFIG;
let engine: CardGameEngine | null = null;
let activeRenderer: { destroy(): void } | null = null;

// ── Screens ─────────────────────────────────────────────────────────────────

function showScreen(id: string): void {
  startScreen.classList.add("hidden");
  loadingScreen.classList.add("hidden");
  lobbyScreen.classList.add("hidden");
  gameContainer.classList.add("hidden");
  gameoverOverlay.classList.add("hidden");
  if (id === "start") startScreen.classList.remove("hidden");
  else if (id === "loading") loadingScreen.classList.remove("hidden");
  else if (id === "lobby") lobbyScreen.classList.remove("hidden");
  else if (id === "game") gameContainer.classList.remove("hidden");
  else if (id === "gameover") gameoverOverlay.classList.remove("hidden");
}

// ── Connect & Lobby ──────────────────────────────────────────────────────────

async function connect(roomCode: string | null): Promise<void> {
  showScreen("loading");
  const name = (startNameInput?.value ?? "").trim() || "Player";
  const avatarUrl = selectedStartAvatarUrl;
  try {
    await bridge.connect(roomCode, { avatars: PLAYROOM_AVATARS });
    lobbyRoomCode.textContent = bridge.getRoomCode();
    lobbyName.value = name;
    if (typeof (window as unknown as { oasiz?: { playerName?: string } }).oasiz?.playerName === "string") {
      lobbyName.value = (window as unknown as { oasiz: { playerName: string } }).oasiz.playerName;
    }
    bridge.setPlayerName(lobbyName.value || "Player");
    bridge.setPlayerAvatar(avatarUrl);
    lobbyName.addEventListener("input", () => bridge.setPlayerName(lobbyName.value));
    refreshLobbyPlayers();
    bridge.init({
      onTurnChange: () => { },
      onDiscardTopChange: () => { },
      onDeckCountChange: () => { },
      onOpponentHandCountChange: () => { },
      onGamePhaseChange: (phase) => {
        if (phase === "playing") {
          const onLobby = !lobbyScreen.classList.contains("hidden");
          if (onLobby) {
            showScreen("game");
            launchGame();
          }
        }
      },
      onPlayersUpdate: () => refreshLobbyPlayers(),
    });
    showScreen("lobby");
  } catch (e) {
    console.error("[cards-main] Connect failed", e);
    showScreen("start");
  }
}

function refreshLobbyPlayers(): void {
  const players = bridge.getPlayers();
  lobbyPlayersList.innerHTML = "";
  for (const p of players) {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <span>${escapeHtml(p.playerName || "Player")}</span>
      ${bridge.isHost() && p.id === bridge.getMyId() ? '<span class="host-badge">HOST</span>' : ""}
      ${p.isReady ? '<span class="ready-badge">Ready</span>' : ""}
    `;
    lobbyPlayersList.appendChild(row);
  }
  const allReady = players.length >= 1 && players.every((p) => p.isReady);
  (btnStartGame as HTMLButtonElement).disabled = !bridge.isHost() || !allReady;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ── Game launch ──────────────────────────────────────────────────────────────

function launchGame(): void {
  engine = new CardGameEngine(config);
  bridge.init(
    {
      onTurnChange: () => { },
      onDiscardTopChange: () => { },
      onDeckCountChange: () => { },
      onOpponentHandCountChange: () => { },
      onGamePhaseChange: (phase) => {
        if (phase === "gameover") showScreen("gameover");
      },
      onPlayersUpdate: () => { },
    },
    engine,
  );
  if (bridge.isHost()) {
    bridge.initializeDeck(config.deck.totalCount);
  }
  (async () => {
    activeRenderer = new PixiCardGame(
      rendererMount,
      config,
      bridge,
      engine!,
      settings,
      (phase) => { if (phase === "gameover") showScreen("gameover"); },
    );
  })();
  (oasiz as unknown as Record<string, () => void>).gameplayStart?.();
}

function destroyGame(): void {
  activeRenderer?.destroy();
  activeRenderer = null;
  engine = null;
  rendererMount.innerHTML = "";
}

/** Launch game with dummy data only (no multiplayer, no play/draw). */
function launchGameDummy(): void {
  engine = new CardGameEngine(config);
  const handSize = 10;
  for (let i = 0; i < handSize; i++) engine.drawCard();
  const name = (startNameInput?.value ?? "").trim() || "You";
  const avatarUrl = selectedStartAvatarUrl;
  const dummyBridge = new DummyBridge(engine, name, avatarUrl);
  (async () => {
    activeRenderer = new PixiCardGame(
      rendererMount,
      config,
      dummyBridge as unknown as PlayroomBridge,
      engine!,
      settings,
      (phase) => { if (phase === "gameover") showScreen("gameover"); },
    );
  })();
  (oasiz as unknown as Record<string, () => void>).gameplayStart?.();
}

// ── Event listeners ──────────────────────────────────────────────────────────

// Create Room: connect then lobby; Start Game launches with actual bridge
btnCreateRoom.addEventListener("click", () => connect(null));
btnJoinRoom.addEventListener("click", () => {
  joinSection.classList.toggle("hidden");
  if (!joinSection.classList.contains("hidden")) joinCodeInput.focus();
});
btnJoinSubmit.addEventListener("click", () => {
  const code = (joinCodeInput.value || "").trim().toUpperCase().slice(0, 4);
  if (code.length === 4) connect(code);
});
lobbyCopy.addEventListener("click", () => {
  navigator.clipboard.writeText(bridge.getRoomCode());
  if (settings.haptics) oasiz.triggerHaptic("light");
});
let lastReadyToggle = 0;
btnReady.addEventListener("click", (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (Date.now() - lastReadyToggle < 300) return;
  lastReadyToggle = Date.now();
  const ready = bridge.getPlayers().find((p) => p.id === bridge.getMyId())?.isReady ?? false;
  bridge.setReady(!ready);
  refreshLobbyPlayers();
  if (settings.haptics) oasiz.triggerHaptic("light");
});
btnStartGame.addEventListener("click", () => {
  showScreen("game");
  launchGame();
});
btnLeaveLobby.addEventListener("click", () => {
  bridge.leaveRoom();
  showScreen("start");
  joinSection.classList.add("hidden");
});
// backBtn.addEventListener("click", () => {
//   destroyGame();
//   if (!PIXI_DUMMY_MODE) bridge.leaveRoom();
//   showScreen("start");
//   joinSection.classList.add("hidden");
// });

let lastToggle = 0;
function settingsToggle(cb: () => void): (e: Event) => void {
  return (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - lastToggle < 300) return;
    lastToggle = Date.now();
    cb();
    saveSettings(settings);
    applySettingsToggles();
    if (settings.haptics) oasiz.triggerHaptic("light");
  };
}

function applySettingsToggles(): void {
  document.getElementById("toggle-music")!.classList.toggle("active", settings.music);
  document.getElementById("toggle-fx")!.classList.toggle("active", settings.fx);
  document.getElementById("toggle-haptics")!.classList.toggle("active", settings.haptics);
}

document.getElementById("toggle-music")!.addEventListener("click", settingsToggle(() => { settings.music = !settings.music; }));
document.getElementById("toggle-fx")!.addEventListener("click", settingsToggle(() => { settings.fx = !settings.fx; }));
document.getElementById("toggle-haptics")!.addEventListener("click", settingsToggle(() => { settings.haptics = !settings.haptics; }));

// settingsBtn.addEventListener("click", () => settingsModal.classList.toggle("hidden"));
// document.addEventListener("click", (e) => {
//   if (!settingsModal.classList.contains("hidden") && !settingsModal.contains(e.target as Node) && e.target !== settingsBtn) {
//     settingsModal.classList.add("hidden");
//   }
// });

// btnPlayAgain.addEventListener("click", () => {
//   if (!bridge.isHost()) return;
//   gameoverOverlay.classList.add("hidden");
//   destroyGame();
//   engine = new CardGameEngine(config);
//   bridge.init(...);
//   bridge.initializeDeck(config.deck.totalCount);
//   launchGame();
// });
// btnBackGameover.addEventListener("click", () => {
//   gameoverOverlay.classList.add("hidden");
//   destroyGame();
//   bridge.leaveRoom();
//   showScreen("start");
// });

// ── Auto-join from platform (commented out for Pixi-only dummy mode) ──────────

// if (typeof (window as unknown as { oasiz?: { roomCode?: string } }).oasiz?.roomCode === "string") {
//   const code = (window as unknown as { oasiz: { roomCode: string } }).oasiz.roomCode;
//   if (code) connect(code);
// }

// ── Lifecycle ─────────────────────────────────────────────────────────────────

oasiz.onPause(() => window.dispatchEvent(new CustomEvent("cardsGame:pause")));
oasiz.onResume(() => window.dispatchEvent(new CustomEvent("cardsGame:resume")));

applySettingsToggles();

// ── Start screen: name + Playroom avatar picker ─────────────────────────────

if (typeof (window as unknown as { oasiz?: { playerName?: string } }).oasiz?.playerName === "string") {
  startNameInput.value = (window as unknown as { oasiz: { playerName: string } }).oasiz.playerName;
}
startAvatarPicker.innerHTML = "";
for (let i = 0; i < PLAYROOM_AVATARS.length; i++) {
  const url = PLAYROOM_AVATARS[i];
  const el = document.createElement("button");
  el.type = "button";
  el.className = "avatar-option" + (i === 0 ? " selected" : "");
  el.setAttribute("aria-label", "Avatar " + (i + 1));
  el.style.backgroundImage = "url(" + url + ")";
  el.addEventListener("click", () => {
    startAvatarPicker.querySelectorAll(".avatar-option").forEach((b) => b.classList.remove("selected"));
    el.classList.add("selected");
    selectedStartAvatarUrl = url;
    if (settings.haptics) oasiz.triggerHaptic("light");
  });
  startAvatarPicker.appendChild(el);
}
