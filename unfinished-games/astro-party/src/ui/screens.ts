import { Game } from "../Game";
import { PlayerData } from "../types";
import { GameConfig } from "../GameConfig";
import { triggerHaptic } from "./haptics";
import { elements } from "./elements";
import { escapeHtml } from "./text";

type Screen = "start" | "lobby" | "game" | "end";

export interface ScreenController {
  showScreen: (screen: Screen) => void;
  updateHudControlsVisibility: () => void;
  updatePingIndicator: () => void;
  updateRoundResultOverlay: () => void;
  setRoundResultVisible: (visible: boolean) => void;
  updateScoreTrack: (players: PlayerData[]) => void;
  updateGameEnd: (players: PlayerData[]) => void;
  resetEndScreenButtons: () => void;
}

export function createScreenController(
  game: Game,
  isMobile: boolean,
): ScreenController {
  let activeScreen: Screen = "start";

  function updateHudControlsVisibility(): void {
    if (activeScreen !== "game") {
      elements.leaveGameBtn.style.display = "none";
      elements.settingsBtn.style.display = "none";
      elements.settingsCenterHotspot.style.display = "none";
      return;
    }

    const localMobile = isMobile && game.hasLocalPlayers();
    elements.leaveGameBtn.style.display = localMobile ? "none" : "block";
    elements.settingsBtn.style.display = localMobile ? "none" : "flex";
    elements.settingsCenterHotspot.style.display = localMobile
      ? "block"
      : "none";
  }

  function showScreen(screen: Screen): void {
    activeScreen = screen;
    elements.startScreen.classList.toggle("hidden", screen !== "start");
    elements.lobbyScreen.classList.toggle("hidden", screen !== "lobby");
    elements.gameEndScreen.classList.toggle("hidden", screen !== "end");
    elements.hud.classList.toggle("active", screen === "game");
    updateHudControlsVisibility();
    game.setKeyboardInputEnabled(screen === "game");
    game.setDevKeysEnabled(screen === "game");
    if (screen !== "game") {
      elements.roundResult.classList.add("hidden");
    }

    if (isMobile) {
      elements.mobileControls.classList.remove("active");
      if (screen === "game") {
        game.updateTouchLayout();
      } else {
        game.clearTouchLayout();
      }
    } else {
      elements.mobileControls.classList.toggle("active", screen === "game");
    }

    const showPing =
      game.shouldShowPing() && (screen === "lobby" || screen === "game");
    elements.pingIndicator.style.display = showPing ? "block" : "none";
  }

  function updatePingIndicator(): void {
    if (!game.shouldShowPing()) return;

    const latency = game.getLatencyMs();
    if (latency === 0) {
      elements.pingIndicator.textContent = "";
      return;
    }

    elements.pingIndicator.textContent = latency + "ms";

    elements.pingIndicator.classList.remove("good", "medium", "bad");
    if (latency < 50) {
      elements.pingIndicator.classList.add("good");
    } else if (latency < 150) {
      elements.pingIndicator.classList.add("medium");
    } else {
      elements.pingIndicator.classList.add("bad");
    }
  }

  function updateRoundResultOverlay(): void {
    const result = game.getRoundResult();
    if (!result) {
      elements.roundResult.classList.add("hidden");
      return;
    }

    elements.roundResultTitle.textContent = "ROUND " + result.roundNumber;
    if (result.isTie) {
      elements.roundResultSubtitle.textContent = "TIE";
    } else {
      elements.roundResultSubtitle.textContent =
        "WINNER: " + (result.winnerName ?? "UNKNOWN");
    }
  }

  function setRoundResultVisible(visible: boolean): void {
    elements.roundResult.classList.toggle("hidden", !visible);
  }

  function updateScoreTrack(players: PlayerData[]): void {
    elements.scoreTrack.innerHTML = players
      .map((player) => {
        const dots = Array.from(
          { length: GameConfig.config.ROUNDS_TO_WIN },
          (_, i) => {
            const filled = i < player.roundWins;
            return (
              '<div class="score-dot ' +
              (filled ? "filled" : "") +
              '" style="color: ' +
              player.color.primary +
              '"></div>'
            );
          },
        ).join("");

        return (
          '<div class="score-row">' +
          '<span class="score-player-name" style="color: ' +
          player.color.primary +
          '">' +
          escapeHtml(player.name) +
          "</span>" +
          '<div class="score-dots">' +
          dots +
          "</div>" +
          '<span class="score-kills">' +
          player.kills +
          "K</span>" +
          "</div>"
        );
      })
      .join("");
  }

  function updateGameEnd(players: PlayerData[]): void {
    const winner = game.getWinnerName();
    elements.winnerName.textContent = winner || "Unknown";

    const sorted = [...players].sort((a, b) => {
      if (b.roundWins !== a.roundWins) return b.roundWins - a.roundWins;
      return b.kills - a.kills;
    });
    elements.finalScores.innerHTML = sorted
      .map(
        (player) =>
          '<div class="final-score-row">' +
          '<span class="final-score-name" style="color: ' +
          player.color.primary +
          '">' +
          escapeHtml(player.name) +
          "</span>" +
          '<span class="final-score-kills">' +
          player.roundWins +
          " pts &bull; " +
          player.kills +
          " kills</span>" +
          "</div>",
      )
      .join("");

    if (game.didHostLeave()) {
      elements.playAgainBtn.style.display = "none";
    } else if (game.isHost()) {
      elements.playAgainBtn.style.display = "block";
      elements.playAgainBtn.textContent = "Play Again";
      elements.playAgainBtn.disabled = false;
    } else {
      elements.playAgainBtn.style.display = "block";
      elements.playAgainBtn.textContent = "Waiting for host...";
      elements.playAgainBtn.disabled = true;
    }

    elements.leaveEndBtn.textContent = "Leave";
    elements.leaveEndBtn.disabled = false;
  }

  function resetEndScreenButtons(): void {
    elements.playAgainBtn.disabled = false;
    elements.playAgainBtn.textContent = "Play Again";
    elements.leaveEndBtn.disabled = false;
    elements.leaveEndBtn.textContent = "Leave";
  }

  return {
    showScreen,
    updateHudControlsVisibility,
    updatePingIndicator,
    updateRoundResultOverlay,
    setRoundResultVisible,
    updateScoreTrack,
    updateGameEnd,
    resetEndScreenButtons,
  };
}

export function bindEndScreenUI(game: Game): void {
  elements.playAgainBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    if (game.isHost()) {
      elements.playAgainBtn.disabled = true;
      elements.playAgainBtn.textContent = "Restarting...";
      await game.restartGame();
    } else {
      elements.playAgainBtn.textContent = "Waiting for host...";
      elements.playAgainBtn.disabled = true;
    }
  });

  elements.leaveEndBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    elements.leaveEndBtn.disabled = true;
    elements.leaveEndBtn.textContent = "Leaving...";
    await game.leaveGame();
  });
}
