import { Game } from "../Game";
import { AudioManager } from "../AudioManager";
import { triggerHaptic } from "./haptics";
import { elements } from "./elements";

export interface StartScreenUI {
  resetStartButtons: () => void;
}

export function createStartScreenUI(game: Game): StartScreenUI {
  function showJoinSection(): void {
    elements.mainButtons.style.display = "none";
    elements.joinSection.classList.add("active");
    elements.roomCodeInput.value = "";
    elements.joinError.classList.remove("active");
    elements.roomCodeInput.focus();
  }

  function hideJoinSection(): void {
    elements.mainButtons.style.display = "flex";
    elements.joinSection.classList.remove("active");
  }

  function resetStartButtons(): void {
    elements.createRoomBtn.disabled = false;
    elements.createRoomBtn.textContent = "Create Room";
    hideJoinSection();
  }

  elements.createRoomBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    AudioManager.playUIClick();
    elements.createRoomBtn.disabled = true;
    elements.createRoomBtn.textContent = "Creating...";

    try {
      const code = await game.createRoom();
      console.log("[Main] Room created:", code);
      if (window.__PLAYER_NAME__) {
        game.setPlayerName(window.__PLAYER_NAME__);
      }
    } catch (e) {
      console.error("[Main] Failed to create room:", e);
      elements.createRoomBtn.disabled = false;
      elements.createRoomBtn.textContent = "Create Room";
    }
  });

  elements.joinRoomBtn.addEventListener("click", () => {
    triggerHaptic("light");
    showJoinSection();
  });

  elements.backToStartBtn.addEventListener("click", () => {
    triggerHaptic("light");
    hideJoinSection();
  });

  elements.roomCodeInput.addEventListener("input", () => {
    elements.roomCodeInput.value = elements.roomCodeInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    elements.joinError.classList.remove("active");
  });

  elements.roomCodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      elements.submitJoinBtn.click();
    }
  });

  elements.submitJoinBtn.addEventListener("click", async () => {
    const code = elements.roomCodeInput.value.trim().toUpperCase();

    if (code.length < 4) {
      elements.joinError.textContent = "Code must be 4 characters";
      elements.joinError.classList.add("active");
      triggerHaptic("error");
      return;
    }

    triggerHaptic("light");
    AudioManager.playUIClick();
    elements.submitJoinBtn.disabled = true;
    elements.submitJoinBtn.textContent = "Joining...";

    try {
      const success = await game.joinRoom(code);
      if (success) {
        if (window.__PLAYER_NAME__) {
          game.setPlayerName(window.__PLAYER_NAME__);
        }
      } else {
        elements.joinError.textContent = "Could not join room";
        elements.joinError.classList.add("active");
        triggerHaptic("error");
      }
    } catch (e) {
      console.error("[Main] Failed to join room:", e);
      elements.joinError.textContent = "Connection failed";
      elements.joinError.classList.add("active");
      triggerHaptic("error");
    }

    elements.submitJoinBtn.disabled = false;
    elements.submitJoinBtn.textContent = "Join";
  });

  return { resetStartButtons };
}
