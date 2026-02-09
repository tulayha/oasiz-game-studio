import { Game } from "../Game";
import { triggerHaptic } from "./haptics";
import { elements } from "./elements";

export interface LeaveModalUI {
  openLeaveModal: () => void;
}

export function createLeaveModal(game: Game): LeaveModalUI {
  function openLeaveModal(): void {
    triggerHaptic("light");
    elements.leaveModal.classList.add("active");
    elements.leaveBackdrop.classList.add("active");
  }

  function closeLeaveModal(): void {
    elements.leaveModal.classList.remove("active");
    elements.leaveBackdrop.classList.remove("active");
  }

  elements.leaveGameBtn.addEventListener("click", () => {
    openLeaveModal();
  });

  elements.leaveCancelBtn.addEventListener("click", () => {
    triggerHaptic("light");
    closeLeaveModal();
  });

  elements.leaveBackdrop.addEventListener("click", () => {
    closeLeaveModal();
  });

  elements.leaveConfirmBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    closeLeaveModal();
    await game.leaveGame();
  });

  return { openLeaveModal };
}
