import { Game } from "./Game";
import { GamePhase, PlayerData, GAME_CONFIG } from "./types";
import { SettingsManager } from "./SettingsManager";
import { AudioManager } from "./AudioManager";

// Declare platform-injected variables
declare global {
  interface Window {
    __ROOM_CODE__?: string;
    __PLAYER_NAME__?: string;
    __PLAYER_AVATAR__?: string;
  }
}

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
const leaveEndBtn = document.getElementById("leaveEndBtn") as HTMLButtonElement;

// HUD
const hud = document.getElementById("hud")!;
const scoreTrack = document.getElementById("scoreTrack")!;
const leaveGameBtn = document.getElementById(
  "leaveGameBtn",
) as HTMLButtonElement;

// Leave confirmation modal
const leaveModal = document.getElementById("leaveModal")!;
const leaveBackdrop = document.getElementById("leaveBackdrop")!;
const leaveCancelBtn = document.getElementById(
  "leaveCancelBtn",
) as HTMLButtonElement;
const leaveConfirmBtn = document.getElementById(
  "leaveConfirmBtn",
) as HTMLButtonElement;

// Settings
const settingsBtn = document.getElementById("settingsBtn")!;
const settingsModal = document.getElementById("settingsModal")!;
const settingsBackdrop = document.getElementById("settingsBackdrop")!;
const toggleMusic = document.getElementById("toggleMusic")!;
const toggleFx = document.getElementById("toggleFx")!;
const toggleHaptics = document.getElementById("toggleHaptics")!;
const settingsClose = document.getElementById("settingsClose")!;

// Bot controls
const addBotSection = document.getElementById("addBotSection")!;
const addAIBotBtn = document.getElementById("addAIBotBtn") as HTMLButtonElement;
const addLocalPlayerBtn = document.getElementById(
  "addLocalPlayerBtn",
) as HTMLButtonElement;

// Key selection modal
const keySelectModal = document.getElementById("keySelectModal")!;
const keySelectBackdrop = document.getElementById("keySelectBackdrop")!;
const keyOptions = document.getElementById("keyOptions")!;
const keySelectCancel = document.getElementById(
  "keySelectCancel",
) as HTMLButtonElement;

// Local player hints
const localPlayerHints = document.getElementById("localPlayerHints")!;

// Ping indicator
const pingIndicator = document.getElementById("pingIndicator")!;

// Mobile controls
const mobileControls = document.getElementById("mobileControls")!;

// ============= GAME INSTANCE =============

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const game = new Game(canvas);
let addingBot = false;

// ============= SETTINGS =============

function updateSettingsUI(): void {
  const settings = SettingsManager.get();
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
  settingsBtn.style.display = screen === "game" ? "flex" : "none";

  // On mobile: use adaptive touch zones instead of old mobile-controls
  if (isMobile) {
    // Old mobile controls are disabled on mobile - touch zones handle everything
    mobileControls.classList.remove("active");
    if (screen === "game") {
      game.updateTouchLayout();
    } else {
      game.clearTouchLayout();
    }
  } else {
    mobileControls.classList.toggle("active", screen === "game");
  }

  // Show ping indicator in lobby and game screens (if enabled)
  const showPing =
    game.shouldShowPing() && (screen === "lobby" || screen === "game");
  pingIndicator.style.display = showPing ? "block" : "none";

  // Show local player hints during gameplay (only when there are local players, desktop only)
  if (screen === "game" && game.hasLocalPlayers() && !isMobile) {
    updateLocalPlayerHints();
    localPlayerHints.classList.remove("hidden");
  } else {
    localPlayerHints.classList.add("hidden");
  }
}

// Update local player hints overlay with current player info
function updateLocalPlayerHints(): void {
  const localPlayers = game.getLocalPlayersInfo();
  if (localPlayers.length <= 1) {
    // Only one player (the host), no need for hints
    localPlayerHints.classList.add("hidden");
    return;
  }

  localPlayerHints.innerHTML = localPlayers
    .map(
      (player) =>
        `<div class="hint-row" style="color: ${player.color}">${escapeHtml(player.name)}: ${player.keyPreset}</div>`,
    )
    .join("");
}

// Update ping indicator display
function updatePingIndicator(): void {
  if (!game.shouldShowPing()) return;

  const latency = game.getLatencyMs();

  // Don't show until we have a valid ping (latency > 0 means we received at least one ping)
  if (latency === 0) {
    pingIndicator.textContent = "";
    return;
  }

  pingIndicator.textContent = `${latency}ms`;

  // Color code based on latency
  pingIndicator.classList.remove("good", "medium", "bad");
  if (latency < 50) {
    pingIndicator.classList.add("good");
  } else if (latency < 150) {
    pingIndicator.classList.add("medium");
  } else {
    pingIndicator.classList.add("bad");
  }
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
  SettingsManager.triggerHaptic(type);
}

// ============= LOBBY UI =============

function updateLobbyUI(players: PlayerData[]): void {
  const myPlayerId = game.getMyPlayerId();
  const isHost = game.isHost();

  // Update player list
  playersList.innerHTML = players
    .map((player, index) => {
      const isHostPlayer = index === 0; // First player in array is host (PlayroomKit convention)
      const isSelf = player.id === myPlayerId;

      // Check if this player is a bot
      const isBot = game.isPlayerBot(player.id);
      const botType = game.getPlayerBotType(player.id);
      const keySlot = game.getPlayerKeySlot(player.id);

      // Use SVG icons instead of emojis for cross-platform consistency
      // Host star is white to avoid conflict with yellow player color
      const hostIcon = `<svg viewBox="0 0 24 24" width="24" height="24" fill="#ffffff"><path d="M12 1L9 9l-7 1 5 5-1.5 7L12 18l6.5 4L17 15l5-5-7-1z"/></svg>`;
      const playerIcon = `<svg viewBox="0 0 24 24" width="24" height="24" fill="${player.color.primary}"><path d="M12 2L4 12l3 1.5L12 22l5-8.5L20 12z"/></svg>`;

      // Bot badge for AI bots
      const botBadge =
        botType === "ai"
          ? `<div class="bot-badge"><svg viewBox="0 0 24 24" fill="${player.color.primary}"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg></div>`
          : "";

      // Key preset label for local human players
      const keyPresetLabel =
        botType === "local" && keySlot >= 0
          ? `<div class="key-preset">${getKeyPresetName(keySlot)}</div>`
          : "";

      // Remove button for bots (host only)
      const removeBtn =
        isHost && isBot
          ? `<button class="remove-bot-btn" data-player-id="${player.id}" title="Remove">×</button>`
          : "";

      // Show "(You)" suffix for local player
      const nameDisplay = isSelf
        ? `${escapeHtml(player.name)} <span style="opacity: 0.6">(You)</span>`
        : escapeHtml(player.name);

      return `
      <div class="player-slot ${isHostPlayer ? "host" : ""} ${isSelf ? "self" : ""} ${isBot ? "bot" : ""}">
        <div class="player-avatar" style="background: ${player.color.primary}">
          ${isHostPlayer ? hostIcon : playerIcon}
          ${botBadge}
        </div>
        ${removeBtn}
        <div class="player-name">${nameDisplay}</div>
        ${keyPresetLabel}
      </div>
    `;
    })
    .join("");

  // Update status and start button based on host status
  const canStart = game.canStartGame();

  if (isHost) {
    startGameBtn.style.display = "block";
    startGameBtn.disabled = !canStart;
    if (canStart) {
      lobbyStatus.innerHTML = "Ready to start!";
    } else {
      lobbyStatus.innerHTML = `Need at least 2 players<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>`;
    }
  } else {
    startGameBtn.style.display = "none";
    lobbyStatus.innerHTML = `Waiting for host to start<span class="waiting-dots"><span class="waiting-dot"></span><span class="waiting-dot"></span><span class="waiting-dot"></span></span>`;
  }

  // Show/hide bot controls (host only)
  updateBotControlsVisibility(players.length, isHost);

  // Attach remove button handlers
  attachRemoveBotHandlers();
}

// Get key preset name by slot index
function getKeyPresetName(slot: number): string {
  const names = ["WASD", "Arrows", "IJKL", "Numpad"];
  return names[slot] || `Keys ${slot}`;
}

// Update visibility of bot control buttons
function updateBotControlsVisibility(playerCount: number, isHost: boolean): void {
  if (!isHost) {
    addBotSection.classList.add("hidden");
    return;
  }

  // Show section if room not full
  if (playerCount < 4) {
    addBotSection.classList.remove("hidden");

    // Add AI always available
    addAIBotBtn.disabled = false;

    // Add Local only available when no remote players (offline mode)
    const hasRemote = game.hasRemotePlayers();
    addLocalPlayerBtn.style.display = hasRemote ? "none" : "flex";
  } else {
    addBotSection.classList.add("hidden");
  }
}

// Attach click handlers to remove bot buttons
function attachRemoveBotHandlers(): void {
  const removeButtons = document.querySelectorAll(".remove-bot-btn");
  removeButtons.forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const playerId = (btn as HTMLElement).dataset.playerId;
      if (playerId) {
        triggerHaptic("light");
        AudioManager.playUIClick();
        await game.removeBot(playerId);
      }
    });
  });
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

  // Update button states based on host status
  if (game.isHost()) {
    playAgainBtn.textContent = "Play Again";
    playAgainBtn.disabled = false;
  } else {
    playAgainBtn.textContent = "Waiting for host...";
    playAgainBtn.disabled = true;
  }
  // Leave button is always available for everyone
  leaveEndBtn.textContent = "Leave";
  leaveEndBtn.disabled = false;
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
        // Reset button states when returning to start
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = "Create Room";
        hideJoinSection();
        break;
      case "LOBBY":
        showScreen("lobby");
        roomCodeDisplay.textContent = game.getRoomCode();
        // Reset game end buttons when returning to lobby
        playAgainBtn.disabled = false;
        playAgainBtn.textContent = "Play Again";
        leaveEndBtn.disabled = false;
        leaveEndBtn.textContent = "Leave";
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

    // Update touch layout when players change (mobile only)
    if (isMobile && game.getPhase() === "PLAYING") {
      game.updateTouchLayout();
    }
  },

  onCountdownUpdate: (count: number) => {
    // Countdown is rendered in the game canvas
    if (count > 0) {
      triggerHaptic("light");
      AudioManager.playCountdown(count);
    } else {
      triggerHaptic("medium");
      AudioManager.playFight();
    }
  },
});

// ============= EVENT LISTENERS =============

// Start screen
createRoomBtn.addEventListener("click", async () => {
  triggerHaptic("light");
  AudioManager.playUIClick();
  createRoomBtn.disabled = true;
  createRoomBtn.textContent = "Creating...";

  try {
    const code = await game.createRoom();
    console.log("[Main] Room created:", code);
    // Set player name from platform if provided
    if (window.__PLAYER_NAME__) {
      game.setPlayerName(window.__PLAYER_NAME__);
    }
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
  AudioManager.playUIClick();
  submitJoinBtn.disabled = true;
  submitJoinBtn.textContent = "Joining...";

  try {
    const success = await game.joinRoom(code);
    if (success) {
      // Set player name from platform if provided
      if (window.__PLAYER_NAME__) {
        game.setPlayerName(window.__PLAYER_NAME__);
      }
    } else {
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

// Bot controls
addAIBotBtn.addEventListener("click", async () => {
  if (addingBot) return;
  addingBot = true;
  triggerHaptic("light");
  AudioManager.playUIClick();
  addAIBotBtn.disabled = true;

  try {
    await game.addAIBot();
  } catch (e) {
    console.error("[Main] Failed to add AI bot:", e);
  }

  addAIBotBtn.disabled = false;
  addingBot = false;
});

addLocalPlayerBtn.addEventListener("click", async () => {
  triggerHaptic("light");
  AudioManager.playUIClick();

  if (isMobile) {
    // On mobile, skip key selection - auto-assign next available touch slot
    const usedSlots = game.getUsedKeySlots();
    // Find first unused slot starting from 1 (slot 0 is host's WASD/touch)
    let nextSlot = -1;
    for (let i = 1; i < 4; i++) {
      if (!usedSlots.includes(i)) {
        nextSlot = i;
        break;
      }
    }
    if (nextSlot >= 0) {
      try {
        await game.addLocalBot(nextSlot);
      } catch (e) {
        console.error("[Main] Failed to add local player:", e);
      }
    }
  } else {
    showKeySelectModal();
  }
});

// Key selection modal
function showKeySelectModal(): void {
  keySelectModal.classList.add("active");
  keySelectBackdrop.classList.add("active");

  // Disable already-used key slots
  const usedSlots = game.getUsedKeySlots();
  const options = keyOptions.querySelectorAll(".key-option");
  options.forEach((option) => {
    const slot = parseInt((option as HTMLElement).dataset.slot || "0");
    (option as HTMLButtonElement).disabled = usedSlots.includes(slot);
  });
}

function hideKeySelectModal(): void {
  keySelectModal.classList.remove("active");
  keySelectBackdrop.classList.remove("active");
}

keySelectBackdrop.addEventListener("click", hideKeySelectModal);
keySelectCancel.addEventListener("click", () => {
  triggerHaptic("light");
  hideKeySelectModal();
});

keyOptions.addEventListener("click", async (e) => {
  const option = (e.target as HTMLElement).closest(".key-option") as HTMLButtonElement;
  if (!option || option.disabled || addingBot) return;

  addingBot = true;
  triggerHaptic("light");
  AudioManager.playUIClick();
  hideKeySelectModal();

  const slot = parseInt(option.dataset.slot || "1");
  try {
    await game.addLocalBot(slot);
  } catch (e) {
    console.error("[Main] Failed to add local player:", e);
  }
  addingBot = false;
});

startGameBtn.addEventListener("click", () => {
  if (!game.canStartGame()) return;
  triggerHaptic("medium");
  game.startGame();
});

leaveLobbyBtn.addEventListener("click", async () => {
  triggerHaptic("light");
  leaveLobbyBtn.disabled = true;
  leaveLobbyBtn.textContent = "Leaving...";
  await game.leaveGame();
  leaveLobbyBtn.disabled = false;
  leaveLobbyBtn.textContent = "Leave";
});

// Leave game button (during gameplay) - shows in-game modal
leaveGameBtn.addEventListener("click", () => {
  triggerHaptic("light");
  leaveModal.classList.add("active");
  leaveBackdrop.classList.add("active");
});

// Leave modal - cancel
leaveCancelBtn.addEventListener("click", () => {
  triggerHaptic("light");
  leaveModal.classList.remove("active");
  leaveBackdrop.classList.remove("active");
});

// Leave modal - backdrop click to cancel
leaveBackdrop.addEventListener("click", () => {
  leaveModal.classList.remove("active");
  leaveBackdrop.classList.remove("active");
});

// Leave modal - confirm leave
leaveConfirmBtn.addEventListener("click", async () => {
  triggerHaptic("light");
  leaveModal.classList.remove("active");
  leaveBackdrop.classList.remove("active");
  await game.leaveGame();
});

// Game end screen
playAgainBtn.addEventListener("click", async () => {
  triggerHaptic("light");
  if (game.isHost()) {
    playAgainBtn.disabled = true;
    playAgainBtn.textContent = "Restarting...";
    await game.restartGame();
  } else {
    // Non-host can't restart, show waiting message
    playAgainBtn.textContent = "Waiting for host...";
    playAgainBtn.disabled = true;
  }
});

// Leave button on game end - available for everyone
leaveEndBtn.addEventListener("click", async () => {
  triggerHaptic("light");
  leaveEndBtn.disabled = true;
  leaveEndBtn.textContent = "Leaving...";
  await game.leaveGame();
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
  SettingsManager.toggle("music");
  updateSettingsUI();
  triggerHaptic("light");
});

toggleFx.addEventListener("click", () => {
  SettingsManager.toggle("fx");
  updateSettingsUI();
  triggerHaptic("light");
});

toggleHaptics.addEventListener("click", () => {
  SettingsManager.toggle("haptics");
  updateSettingsUI();
  // Always trigger this one so user feels the toggle (bypass settings check)
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

const isMobile = window.matchMedia("(pointer: coarse)").matches;

async function init(): Promise<void> {
  console.log("[Main] Initializing Astro Party");

  // Attempt to lock orientation to landscape on mobile
  if (isMobile) {
    try {
      await (screen.orientation as any)?.lock?.("landscape");
    } catch {
      // Orientation lock not supported or not allowed - CSS overlay handles this
    }
  }

  updateSettingsUI();
  showScreen("start");

  // Start the game render loop (runs in background)
  game.start();

  // Update ping indicator periodically
  setInterval(updatePingIndicator, 500);

  // Check for platform-injected room code for auto-join
  if (window.__ROOM_CODE__) {
    console.log("[Main] Platform injected room code:", window.__ROOM_CODE__);
    try {
      const success = await game.joinRoom(window.__ROOM_CODE__);
      if (success) {
        // Set player name from platform if provided
        if (window.__PLAYER_NAME__) {
          console.log("[Main] Setting player name:", window.__PLAYER_NAME__);
          game.setPlayerName(window.__PLAYER_NAME__);
        }
      } else {
        console.log("[Main] Failed to auto-join room, staying on start screen");
      }
    } catch (e) {
      console.error("[Main] Error auto-joining room:", e);
    }
  }
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
