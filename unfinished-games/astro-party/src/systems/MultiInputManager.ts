// ============= MULTI INPUT MANAGER =============
// Handles multiple keyboard input sets for local multiplayer
// Allows multiple players on the same machine with different key bindings

import { PlayerInput } from "../types";
import { SettingsManager } from "../SettingsManager";

// Predefined key binding sets
// Slot 0 (WASD) is reserved for the host player (handled by InputManager)
// Slots 1-3 are for additional local players
const KEY_PRESETS = [
  {
    name: "WASD",
    buttonA: ["KeyA", "KeyQ"],
    buttonB: ["KeyD", "KeyE", "KeyW"],
  },
  {
    name: "Arrows",
    buttonA: ["ArrowLeft"],
    buttonB: ["ArrowRight", "Space"],
  },
  {
    name: "IJKL",
    buttonA: ["KeyJ"],
    buttonB: ["KeyL", "KeyI"],
  },
  {
    name: "Numpad",
    buttonA: ["Numpad4"],
    buttonB: ["Numpad6", "Numpad8"],
  },
];

const DOUBLE_TAP_WINDOW = 300; // ms

interface SlotState {
  buttonA: boolean;
  buttonB: boolean;
  wasButtonA: boolean;
  lastButtonATime: number;
  dashPending: boolean;
}

export class MultiInputManager {
  private slots: Map<number, SlotState> = new Map();
  private activeSlots: Set<number> = new Set();
  private keyToSlot: Map<string, { slot: number; button: "A" | "B" }> =
    new Map();
  private setupDone = false;

  constructor() {
    // Initialize state for all slots
    for (let i = 0; i < KEY_PRESETS.length; i++) {
      this.slots.set(i, {
        buttonA: false,
        buttonB: false,
        wasButtonA: false,
        lastButtonATime: 0,
        dashPending: false,
      });
    }
  }

  // Activate a slot for a local player
  activateSlot(slot: number): void {
    if (slot < 0 || slot >= KEY_PRESETS.length) return;
    this.activeSlots.add(slot);
    this.rebuildKeyMap();

    if (!this.setupDone) {
      this.setupKeyboardListeners();
      this.setupDone = true;
    }
  }

  // Deactivate a slot when player is removed
  deactivateSlot(slot: number): void {
    this.activeSlots.delete(slot);
    this.rebuildKeyMap();

    // Reset slot state
    const state = this.slots.get(slot);
    if (state) {
      state.buttonA = false;
      state.buttonB = false;
      state.dashPending = false;
    }
  }

  private rebuildKeyMap(): void {
    this.keyToSlot.clear();

    for (const slot of this.activeSlots) {
      const preset = KEY_PRESETS[slot];
      if (!preset) continue;

      for (const key of preset.buttonA) {
        this.keyToSlot.set(key, { slot, button: "A" });
      }
      for (const key of preset.buttonB) {
        this.keyToSlot.set(key, { slot, button: "B" });
      }
    }
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e) => {
      const mapping = this.keyToSlot.get(e.code);
      if (!mapping) return;

      e.preventDefault();
      const state = this.slots.get(mapping.slot);
      if (!state) return;

      if (mapping.button === "A") {
        // Check for double-tap dash
        if (!state.buttonA) {
          const now = performance.now();
          if (now - state.lastButtonATime < DOUBLE_TAP_WINDOW) {
            state.dashPending = true;
            SettingsManager.triggerHaptic("medium");
          }
          state.lastButtonATime = now;
        }
        state.buttonA = true;
      } else {
        state.buttonB = true;
      }

      SettingsManager.triggerHaptic("light");
    });

    window.addEventListener("keyup", (e) => {
      const mapping = this.keyToSlot.get(e.code);
      if (!mapping) return;

      const state = this.slots.get(mapping.slot);
      if (!state) return;

      if (mapping.button === "A") {
        state.buttonA = false;
      } else {
        state.buttonB = false;
      }
    });
  }

  // Capture input for a specific slot
  capture(slot: number): PlayerInput {
    const state = this.slots.get(slot);
    if (!state || !this.activeSlots.has(slot)) {
      return { buttonA: false, buttonB: false, timestamp: 0 };
    }

    // Track wasButtonA for dash detection
    state.wasButtonA = state.buttonA;

    return {
      buttonA: state.buttonA,
      buttonB: state.buttonB,
      timestamp: performance.now(),
    };
  }

  // Consume pending dash for a slot (returns true once then resets)
  consumeDash(slot: number): boolean {
    const state = this.slots.get(slot);
    if (!state) return false;

    const dash = state.dashPending;
    state.dashPending = false;
    return dash;
  }

  // Get the display name for a key preset
  static getPresetName(slot: number): string {
    return KEY_PRESETS[slot]?.name || `Keys ${slot}`;
  }

  // Get all preset names
  static getAllPresets(): { slot: number; name: string }[] {
    return KEY_PRESETS.map((preset, slot) => ({
      slot,
      name: preset.name,
    }));
  }

  // Reset all input state
  reset(): void {
    for (const state of this.slots.values()) {
      state.buttonA = false;
      state.buttonB = false;
      state.wasButtonA = false;
      state.dashPending = false;
    }
  }
}
