import { Game } from "./Game";
import { GamePhase, PlayerData, Settings, GAME_CONFIG } from "./types";

// ============= DOM ELEMENTS =============

// Screens
const startScreen = document.getElementById("startScreen")!;
const lobbyScreen = document.getElementById("lobbyScreen")!;
const gameEndScreen = document.getElementById("gameEndScreen")!;

// Start screen
const mainButtons = document.getElementById("mainButtons")!;
const joinSection = document.getElementById("joinSection")!;
const createRoomBtn = document.getElementById(
  "createRoomBtn",
) as HTMLButtonElement;
const joinRoomBtn = document.getElementById("joinRoomBtn") as HTMLButtonElement;
const roomCodeInput = document.getElementById(
  "roomCodeInput",
) as HTMLInputElement;
const joinError = document.getElementById("joinError")!;
const submitJoinBtn = document.getElementById(
  "submitJoinBtn",
) as HTMLButtonElement;
const backToStartBtn = document.getElementById(
  "backToStartBtn",
) as HTMLButtonElement;

// Lobby screen
const roomCodeDisplay = document.getElementById("roomCodeDisplay")!;
const copyCodeBtn = document.getElementById("copyCodeBtn") as HTMLButtonElement;
const playersList = document.getElementById("playersList")!;
const lobbyStatus = document.getElementById("lobbyStatus")!;
const startGameBtn = document.getElementById(
  "startGameBtn",
) as HTMLButtonElement;
const leaveLobbyBtn = document.getElementById(
  "leaveLobbyBtn",
) as HTMLButtonElement;

// Game end screen
const winnerName = document.getElementById("winnerName")!;
const finalScores = document.getElementById("finalScores")!;
const playAgainBtn = document.getElementById(
  "playAgainBtn",
) as HTMLButtonElement;
const backToLobbyBtn = document.getElementById(
  "backToLobbyBtn",
) as HTMLButtonElement;

// HUD
const hud = document.getElementById("hud")!;
const scoreTrack = document.getElementById("scoreTrack")!;

// Settings
const settingsBtn = document.getElementById("settingsBtn")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBackdrop = document.getElementById("settingsBackdrop")!;
const toggleMusic = document.getElementById("toggleMusic")!;
const toggleFx = document.getElementById("toggleFx")!;
const toggleHaptics = document.getElementById("toggleHaptics")!;
const settingsClose = document.getElementById("settingsClose")!;

// Mobile controls
const mobileControls = document.getElementById("mobileControls")!;

// ============= GAME INSTANCE =============

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const game = new Game(canvas);

// ============= SETTINGS =============

let settings: Settings = loadSettings();

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem("astro-party-settings");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.log("[Main] Could not load settings");
  }
  return { music: true, fx: true, haptics: true };
}

function saveSettings(): void {
  try {
    localStorage.setItem("astro-party-settings", JSON.stringify(settings));
  } catch (e) {
    console.log("[Main] Could not save settings");
  }
}

function updateSettingsUI(): void {
  toggleMusic.classList.toggle("active", settings.music);
  toggleFx.classList.toggle("active", settings.fx);
  toggleHaptics.classList.toggle("active", settings.haptics);
}

// ============= UI HELPERS =============

function showScreen(screen: "start" | "lobby" | "game" | "end"): void {
  startScreen.classList.toggle("hidden", screen !== "start");
  lobbyScreen.classList.toggle("hidden", screen !== "lobby");
  gameEndScreen.classList.toggle("hidden", screen !== "end");
  hud.classList.toggle("active", screen === "game");
  mobileControls.classList.toggle("active", screen === "game");
  settingsBtn.style.display = screen === "game" ? "flex" : "none";
}

function showJoinSection(): void {
  mainButtons.style.display = "none";
  joinSection.classList.add("active");
  roomCodeInput.value = "";
  joinError.classList.remove("active");
  roomCodeInput.focus();
}

function hideJoinSection(): void {
  mainButtons.style.display = "flex";
  joinSection.classList.remove("active");
}

function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
): void {
  if (
    settings.haptics &&
    typeof (window as unknown as { triggerHaptic?: (type: string) => void })
      .triggerHaptic === "function"
  ) {
    (
      window as unknown as { triggerHaptic: (type: string) => void }
    ).triggerHaptic(type);
  }
}

// ============= LOBBY UI =============

function updateLobbyUI(players: PlayerData[]): void {
  // Update player list
  playersList.innerHTML = players
    .map((player, index) => {
      const isHost = index === 0; // First player is usually host
      return `
      <div class="player-slot ${isHost ? "host" : ""}">
        <div class="player-avatar" style="background: ${player.color.primary}">
          ${isHost ? "👑" : "🚀"}
        </div>
        <div class="player-name">${escapeHtml(player.name)}</div>
      </div>
    `;
    })
    .join("");

  // Update status and start button
  const canStart = game.canStartGame();
  startGameBtn.disabled = !canStart;

  if (game.isHost()) {
    if (canStart) {
      lobbyStatus.innerHTML = "Ready to start!";
    } else {
      lobbyStatus.innerHTML = `Need at least 2 players<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>`;
    }
  } else {
    lobbyStatus.innerHTML = `Waiting for host to start<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>`;
    startGameBtn.style.display = "none";
  }
}

function updateScoreTrack(players: PlayerData[]): void {
  scoreTrack.innerHTML = players
    .map((player) => {
      const dots = Array.from({ length: GAME_CONFIG.KILLS_TO_WIN }, (_, i) => {
        const filled = i < player.kills;
        return `<div class="score-dot ${filled ? "filled" : ""}" style="color: ${player.color.primary}"></div>`;
      }).join("");

      return `
      <div class="score-row">
        <span class="score-player-name" style="color: ${player.color.primary}">${escapeHtml(player.name)}</span>
        <div class="score-dots">${dots}</div>
        <span class="score-kills">${player.kills}</span>
      </div>
    `;
    })
    .join("");
}

function updateGameEnd(players: PlayerData[]): void {
  const winner = game.getWinnerName();
  winnerName.textContent = winner || "Unknown";

  // Sort by kills descending
  const sorted = [...players].sort((a, b) => b.kills - a.kills);
  finalScores.innerHTML = sorted
    .map(
      (player) => `
    <div class="final-score-row">
      <span class="final-score-name" style="color: ${player.color.primary}">${escapeHtml(player.name)}</span>
      <span class="final-score-kills">${player.kills} kills</span>
    </div>
  `,
    )
    .join("");
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ============= GAME CALLBACKS =============

game.setUICallbacks({
  onPhaseChange: (phase: GamePhase) => {
    console.log("[Main] Phase changed:", phase);

    switch (phase) {
      case "START":
        showScreen("start");
        break;
      case "LOBBY":
        showScreen("lobby");
        roomCodeDisplay.textContent = game.getRoomCode();
        break;
      case "COUNTDOWN":
      case "PLAYING":
        showScreen("game");
        break;
      case "GAME_END":
        showScreen("end");
        updateGameEnd(game.getPlayers());
        triggerHaptic("success");
        break;
    }
  },

  onPlayersUpdate: (players: PlayerData[]) => {
    updateLobbyUI(players);
    updateScoreTrack(players);
  },

  onCountdownUpdate: (count: number) => {
    // Countdown is rendered in the game canvas
    if (count > 0) {
      triggerHaptic("light");
    } else {
      triggerHaptic("medium");
    }
  },
});

// ============= EVENT LISTENERS =============

// Start screen
createRoomBtn.addEventListener("click", async () => {
  triggerHaptic("light");
  createRoomBtn.disabled = true;
  createRoomBtn.textContent = "Creating...";

  try {
    const code = await game.createRoom();
    console.log("[Main] Room created:", code);
  } catch (e) {
    console.error("[Main] Failed to create room:", e);
    createRoomBtn.disabled = false;
    createRoomBtn.textContent = "Create Room";
  }
});

joinRoomBtn.addEventListener("click", () => {
  triggerHaptic("light");
  showJoinSection();
});

backToStartBtn.addEventListener("click", () => {
  triggerHaptic("light");
  hideJoinSection();
});

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  joinError.classList.remove("active");
});

roomCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    submitJoinBtn.click();
  }
});

submitJoinBtn.addEventListener("click", async () => {
  const code = roomCodeInput.value.trim().toUpperCase();

  if (code.length < 4) {
    joinError.textContent = "Code must be 4 characters";
    joinError.classList.add("active");
    triggerHaptic("error");
    return;
  }

  triggerHaptic("light");
  submitJoinBtn.disabled = true;
  submitJoinBtn.textContent = "Joining...";

  try {
    const success = await game.joinRoom(code);
    if (!success) {
      joinError.textContent = "Could not join room";
      joinError.classList.add("active");
      triggerHaptic("error");
    }
  } catch (e) {
    console.error("[Main] Failed to join room:", e);
    joinError.textContent = "Connection failed";
    joinError.classList.add("active");
    triggerHaptic("error");
  }

  submitJoinBtn.disabled = false;
  submitJoinBtn.textContent = "Join";
});

// Lobby screen
copyCodeBtn.addEventListener("click", () => {
  const code = game.getRoomCode();
  navigator.clipboard.writeText(code).then(() => {
    triggerHaptic("light");
    copyCodeBtn.innerHTML =
      '<svg viewBox="0 0 24 24"><path fill="#22c55e" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    setTimeout(() => {
      copyCodeBtn.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    }, 2000);
  });
});

startGameBtn.addEventListener("click", () => {
  if (!game.canStartGame()) return;
  triggerHaptic("medium");
  game.startGame();
});

leaveLobbyBtn.addEventListener("click", () => {
  triggerHaptic("light");
  // For now, just reload to disconnect
  window.location.reload();
});

// Game end screen
playAgainBtn.addEventListener("click", () => {
  triggerHaptic("light");
  game.restartGame();
});

backToLobbyBtn.addEventListener("click", () => {
  triggerHaptic("light");
  game.restartGame();
});

// Settings
settingsBtn.addEventListener("click", () => {
  triggerHaptic("light");
  settingsModal.classList.add("active");
  settingsBackdrop.classList.add("active");
});

settingsBackdrop.addEventListener("click", () => {
  settingsModal.classList.remove("active");
  settingsBackdrop.classList.remove("active");
});

settingsClose.addEventListener("click", () => {
  triggerHaptic("light");
  settingsModal.classList.remove("active");
  settingsBackdrop.classList.remove("active");
});

toggleMusic.addEventListener("click", () => {
  settings.music = !settings.music;
  updateSettingsUI();
  saveSettings();
  triggerHaptic("light");
});

toggleFx.addEventListener("click", () => {
  settings.fx = !settings.fx;
  updateSettingsUI();
  saveSettings();
  triggerHaptic("light");
});

toggleHaptics.addEventListener("click", () => {
  settings.haptics = !settings.haptics;
  updateSettingsUI();
  saveSettings();
  // Always trigger this one so user feels the toggle
  if (
    typeof (window as unknown as { triggerHaptic?: (type: string) => void })
      .triggerHaptic === "function"
  ) {
    (
      window as unknown as { triggerHaptic: (type: string) => void }
    ).triggerHaptic("light");
  }
});

// ============= INITIALIZATION =============

function init(): void {
  console.log("[Main] Initializing Astro Party");

  updateSettingsUI();
  showScreen("start");

  // Start the game render loop (runs in background)
  game.start();
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
