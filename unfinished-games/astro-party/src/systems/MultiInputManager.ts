// ============= MULTI INPUT MANAGER =============
// Handles multiple keyboard input sets for local multiplayer
// Also manages mobile touch zones for local multiplayer on a single device

import { PlayerInput, PLAYER_COLORS } from "../types";
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

// Touch zone layout types
export type TouchLayout = "single" | "dual" | "corner";

interface SlotState {
  buttonA: boolean;
  buttonB: boolean;
  wasButtonA: boolean;
  lastButtonATime: number;
  dashPending: boolean;
}

// Corner assignments for 3-4 player layout
// Each corner has two buttons on adjacent edges
const CORNER_POSITIONS = [
  { corner: "top-left", label: "P1" },
  { corner: "top-right", label: "P2" },
  { corner: "bottom-left", label: "P3" },
  { corner: "bottom-right", label: "P4" },
];

export class MultiInputManager {
  private slots: Map<number, SlotState> = new Map();
  private activeSlots: Set<number> = new Set();
  private keyToSlot: Map<string, { slot: number; button: "A" | "B" }> =
    new Map();
  private keyboardSetupDone = false;
  private isMobile: boolean;

  // Touch zone state
  private touchZoneContainer: HTMLElement | null = null;
  private touchZoneElements: HTMLElement[] = [];
  private currentLayout: TouchLayout | null = null;
  // Track active touches by identifier → { slot, button }
  private activeTouches: Map<number, { slot: number; button: "A" | "B" }> =
    new Map();

  constructor() {
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;

    // Initialize state for all 4 slots
    for (let i = 0; i < 4; i++) {
      this.slots.set(i, {
        buttonA: false,
        buttonB: false,
        wasButtonA: false,
        lastButtonATime: 0,
        dashPending: false,
      });
    }

    this.touchZoneContainer = document.getElementById("touchZones");
  }

  // Activate a slot for a local player
  activateSlot(slot: number): void {
    if (slot < 0 || slot >= 4) return;
    this.activeSlots.add(slot);
    this.rebuildKeyMap();

    if (!this.keyboardSetupDone && !this.isMobile) {
      this.setupKeyboardListeners();
      this.keyboardSetupDone = true;
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

  // ============= TOUCH ZONE MANAGEMENT =============

  /**
   * Set up touch zones for the given layout and player count.
   * Dynamically creates DOM elements positioned based on layout type.
   *
   * @param layout - 'single' (1 player, bottom buttons), 'dual' (2 players, left/right edges), 'corner' (3-4 players)
   * @param localPlayerCount - Total local players including host (2, 3, or 4)
   * @param slotToColorIndex - Map of slot number to player color index
   */
  setupTouchZones(
    layout: TouchLayout,
    localPlayerCount: number,
    slotToColorIndex: Map<number, number>,
  ): void {
    if (!this.isMobile || !this.touchZoneContainer) return;

    // Clear existing zones
    this.destroyTouchZones();
    this.currentLayout = layout;

    switch (layout) {
      case "single":
        this.createSingleLayout(slotToColorIndex);
        break;
      case "dual":
        this.createDualLayout(slotToColorIndex);
        break;
      case "corner":
        this.createCornerLayout(localPlayerCount, slotToColorIndex);
        break;
    }

    this.touchZoneContainer.classList.add("active");
  }

  /**
   * Layout A: Single player - two buttons at bottom of screen
   */
  private createSingleLayout(slotToColorIndex: Map<number, number>): void {
    const colorIdx = slotToColorIndex.get(0) ?? 0;
    const color = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length].primary;

    // Left button (rotate) - bottom left
    this.createTouchZone({
      slot: 0,
      button: "A",
      label: "ROTATE",
      sublabel: "double-tap: dash",
      color,
      style: {
        left: "20px",
        bottom: "20px",
        width: "38%",
        height: "120px",
        borderRadius: "12px",
      },
    });

    // Right button (fire) - bottom right
    this.createTouchZone({
      slot: 0,
      button: "B",
      label: "FIRE",
      sublabel: "recoil pushes back",
      color,
      style: {
        right: "20px",
        bottom: "20px",
        width: "38%",
        height: "120px",
        borderRadius: "12px",
      },
    });
  }

  /**
   * Layout B: 2 players - controls on left/right edges, stacked vertically
   * Player 1 (slot 0) = left edge, Player 2 (slot 1+) = right edge
   */
  private createDualLayout(slotToColorIndex: Map<number, number>): void {
    const slots = this.getSortedActiveSlots();
    const leftSlot = 0; // Host is always slot 0
    const rightSlot = slots.find((s) => s !== 0) ?? 1;

    const leftColorIdx = slotToColorIndex.get(leftSlot) ?? 0;
    const rightColorIdx = slotToColorIndex.get(rightSlot) ?? 1;
    const leftColor =
      PLAYER_COLORS[leftColorIdx % PLAYER_COLORS.length].primary;
    const rightColor =
      PLAYER_COLORS[rightColorIdx % PLAYER_COLORS.length].primary;

    const zoneWidth = "18%";
    const zoneHeight = "45%";
    const gap = "8px";

    // Left player - rotate (top) and fire (bottom)
    this.createTouchZone({
      slot: leftSlot,
      button: "A",
      label: "ROT",
      sublabel: "2x: dash",
      color: leftColor,
      style: {
        left: "8px",
        top: "8px",
        width: zoneWidth,
        height: zoneHeight,
        borderRadius: "12px",
      },
    });
    this.createTouchZone({
      slot: leftSlot,
      button: "B",
      label: "FIRE",
      sublabel: "",
      color: leftColor,
      style: {
        left: "8px",
        bottom: gap,
        width: zoneWidth,
        height: zoneHeight,
        borderRadius: "12px",
      },
    });

    // Right player - rotate (top) and fire (bottom)
    this.createTouchZone({
      slot: rightSlot,
      button: "A",
      label: "ROT",
      sublabel: "2x: dash",
      color: rightColor,
      style: {
        right: "8px",
        top: "8px",
        width: zoneWidth,
        height: zoneHeight,
        borderRadius: "12px",
      },
    });
    this.createTouchZone({
      slot: rightSlot,
      button: "B",
      label: "FIRE",
      sublabel: "",
      color: rightColor,
      style: {
        right: "8px",
        bottom: gap,
        width: zoneWidth,
        height: zoneHeight,
        borderRadius: "12px",
      },
    });
  }

  /**
   * Layout C: 3-4 players - corner controls matching original Astro Party
   * Each corner has 2 buttons on adjacent edges of the arena border
   */
  private createCornerLayout(
    playerCount: number,
    slotToColorIndex: Map<number, number>,
  ): void {
    const slots = this.getSortedActiveSlots();
    // Include host (slot 0) as first player
    const allSlots = [0, ...slots.filter((s) => s !== 0)];
    const count = Math.min(playerCount, 4);

    // Zone sizing
    const edgeLength = "38%"; // Length along the edge
    const edgeThickness = "60px"; // Thickness perpendicular to edge

    for (let i = 0; i < count; i++) {
      const slot = allSlots[i] ?? i;
      const corner = CORNER_POSITIONS[i];
      const colorIdx = slotToColorIndex.get(slot) ?? i;
      const color = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length].primary;

      const isTop = corner.corner.includes("top");
      const isLeft = corner.corner.includes("left");

      // Button on the horizontal edge (top or bottom)
      // This is the ROTATE button (outer, along the horizontal edge)
      this.createTouchZone({
        slot,
        button: "A",
        label: "ROT",
        sublabel: "",
        color,
        style: {
          [isTop ? "top" : "bottom"]: "4px",
          [isLeft ? "left" : "right"]: "4px",
          width: edgeLength,
          height: edgeThickness,
          borderRadius: "8px",
        },
      });

      // Button on the vertical edge (left or right)
      // This is the FIRE button (inner, along the vertical edge)
      this.createTouchZone({
        slot,
        button: "B",
        label: "FIRE",
        sublabel: "",
        color,
        style: {
          [isLeft ? "left" : "right"]: "4px",
          [isTop ? "top" : "bottom"]: `calc(${edgeThickness} + 12px)`,
          width: edgeThickness,
          height: edgeLength,
          borderRadius: "8px",
        },
      });
    }
  }

  /**
   * Create a single touch zone DOM element and attach touch listeners
   */
  private createTouchZone(config: {
    slot: number;
    button: "A" | "B";
    label: string;
    sublabel: string;
    color: string;
    style: Record<string, string>;
  }): void {
    if (!this.touchZoneContainer) return;

    const zone = document.createElement("div");
    zone.className = "touch-zone";
    zone.dataset.slot = String(config.slot);
    zone.dataset.button = config.button;

    // Apply positioning
    Object.assign(zone.style, config.style);

    // Apply color tint
    zone.style.borderColor = config.color;
    zone.style.color = config.color;
    zone.style.background = `${config.color}10`; // Very subtle tint

    // Label
    const label = document.createElement("div");
    label.className = "touch-zone-label";
    label.textContent = config.label;
    zone.appendChild(label);

    if (config.sublabel) {
      const sub = document.createElement("div");
      sub.className = "touch-zone-sublabel";
      sub.textContent = config.sublabel;
      zone.appendChild(sub);
    }

    // Touch event handlers
    zone.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        // Track each touch individually
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          this.activeTouches.set(touch.identifier, {
            slot: config.slot,
            button: config.button,
          });
        }
        this.updateSlotFromTouch(config.slot, config.button, true);
        zone.classList.add("pressed");
        SettingsManager.triggerHaptic("light");
      },
      { passive: false },
    );

    zone.addEventListener("touchend", (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.activeTouches.delete(e.changedTouches[i].identifier);
      }
      // Check if any other finger is still on this zone/button
      if (!this.isSlotButtonStillTouched(config.slot, config.button)) {
        this.updateSlotFromTouch(config.slot, config.button, false);
        zone.classList.remove("pressed");
      }
    });

    zone.addEventListener("touchcancel", (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        this.activeTouches.delete(e.changedTouches[i].identifier);
      }
      if (!this.isSlotButtonStillTouched(config.slot, config.button)) {
        this.updateSlotFromTouch(config.slot, config.button, false);
        zone.classList.remove("pressed");
      }
    });

    this.touchZoneContainer.appendChild(zone);
    this.touchZoneElements.push(zone);
  }

  /**
   * Check if any active touch is still targeting this slot+button combination
   */
  private isSlotButtonStillTouched(slot: number, button: "A" | "B"): boolean {
    for (const mapping of this.activeTouches.values()) {
      if (mapping.slot === slot && mapping.button === button) return true;
    }
    return false;
  }

  /**
   * Update a slot's button state from touch input, including dash detection
   */
  private updateSlotFromTouch(
    slot: number,
    button: "A" | "B",
    pressed: boolean,
  ): void {
    const state = this.slots.get(slot);
    if (!state) return;

    if (button === "A") {
      // Dash detection on press (not release)
      if (pressed && !state.buttonA) {
        const now = performance.now();
        if (now - state.lastButtonATime < DOUBLE_TAP_WINDOW) {
          state.dashPending = true;
          SettingsManager.triggerHaptic("medium");
        }
        state.lastButtonATime = now;
      }
      state.buttonA = pressed;
    } else {
      state.buttonB = pressed;
    }
  }

  /**
   * Remove all touch zones from the DOM
   */
  destroyTouchZones(): void {
    for (const el of this.touchZoneElements) {
      el.remove();
    }
    this.touchZoneElements = [];
    this.activeTouches.clear();
    this.currentLayout = null;

    if (this.touchZoneContainer) {
      this.touchZoneContainer.classList.remove("active");
    }
  }

  /**
   * Get the current touch layout
   */
  getCurrentLayout(): TouchLayout | null {
    return this.currentLayout;
  }

  /**
   * Get sorted active slots (ascending)
   */
  private getSortedActiveSlots(): number[] {
    return [...this.activeSlots].sort((a, b) => a - b);
  }

  // ============= INPUT CAPTURE =============

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
    this.activeTouches.clear();

    // Remove pressed state from all zones
    for (const el of this.touchZoneElements) {
      el.classList.remove("pressed");
    }
  }
}
