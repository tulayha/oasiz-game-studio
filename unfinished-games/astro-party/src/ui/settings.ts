import { SettingsManager } from "../SettingsManager";
import { triggerHaptic, forceLightHaptic } from "./haptics";
import { elements } from "./elements";

export interface SettingsUI {
  updateSettingsUI: () => void;
}

export function createSettingsUI(openLeaveModal: () => void): SettingsUI {
  function updateSettingsUI(): void {
    const settings = SettingsManager.get();
    elements.toggleMusic.classList.toggle("active", settings.music);
    elements.toggleFx.classList.toggle("active", settings.fx);
    elements.toggleHaptics.classList.toggle("active", settings.haptics);
    elements.toggleHints.classList.toggle("active", settings.controlHints);
  }

  function openSettingsModal(): void {
    triggerHaptic("light");
    elements.settingsModal.classList.add("active");
    elements.settingsBackdrop.classList.add("active");
  }

  function closeSettingsModal(): void {
    elements.settingsModal.classList.remove("active");
    elements.settingsBackdrop.classList.remove("active");
  }

  elements.settingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });

  elements.settingsCenterHotspot.addEventListener("click", () => {
    openSettingsModal();
  });

  elements.settingsLeaveBtn.addEventListener("click", () => {
    closeSettingsModal();
    openLeaveModal();
  });

  elements.settingsBackdrop.addEventListener("click", () => {
    closeSettingsModal();
  });

  elements.settingsClose.addEventListener("click", () => {
    triggerHaptic("light");
    closeSettingsModal();
  });

  elements.toggleMusic.addEventListener("click", () => {
    SettingsManager.toggle("music");
    updateSettingsUI();
    triggerHaptic("light");
  });

  elements.toggleFx.addEventListener("click", () => {
    SettingsManager.toggle("fx");
    updateSettingsUI();
    triggerHaptic("light");
  });

  elements.toggleHaptics.addEventListener("click", () => {
    SettingsManager.toggle("haptics");
    updateSettingsUI();
    forceLightHaptic();
  });

  elements.toggleHints.addEventListener("click", () => {
    SettingsManager.toggle("controlHints");
    updateSettingsUI();
    triggerHaptic("light");
  });

  return { updateSettingsUI };
}
