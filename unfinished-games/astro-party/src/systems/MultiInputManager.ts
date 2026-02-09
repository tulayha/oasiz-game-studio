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
    primaryA: ["KeyA"],
    primaryB: ["KeyD"],
    altA: ["KeyQ"],
    altB: ["KeyE", "KeyW"],
  },
  {
    name: "Arrows",
    primaryA: ["ArrowLeft"],
    primaryB: ["ArrowRight"],
    altA: [],
    altB: ["Space"],
  },
  {
    name: "IJKL",
    primaryA: ["KeyJ"],
    primaryB: ["KeyL"],
    altA: [],
    altB: ["KeyI"],
  },
  {
    name: "Numpad",
    primaryA: ["Numpad4"],
    primaryB: ["Numpad6"],
    altA: [],
    altB: ["Numpad8"],
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
  private keyboardEnabled = true;
  private allowAltKeys = true;
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

      for (const key of preset.primaryA) {
        this.keyToSlot.set(key, { slot, button: "A" });
      }
      for (const key of preset.primaryB) {
        this.keyToSlot.set(key, { slot, button: "B" });
      }
      if (this.allowAltKeys) {
        for (const key of preset.altA) {
          this.keyToSlot.set(key, { slot, button: "A" });
        }
        for (const key of preset.altB) {
          this.keyToSlot.set(key, { slot, button: "B" });
        }
      }
    }
  }

  private setupKeyboardListeners(): void {
    window.addEventListener("keydown", (e) => {
      if (!this.keyboardEnabled || this.isEditableTarget(e.target)) {
        return;
      }
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
      if (!this.keyboardEnabled || this.isEditableTarget(e.target)) {
        return;
      }
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
   * @param localSlotOrder - Slots in local player order (spawn order)
   * @param slotToColor - Map of slot number to player primary color
   */
  setupTouchZones(
    layout: TouchLayout,
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    if (!this.isMobile || !this.touchZoneContainer) return;

    // Clear existing zones
    this.destroyTouchZones();
    this.currentLayout = layout;
    this.touchZoneContainer.classList.add("active");

    switch (layout) {
      case "single":
        this.createSingleLayout(localSlotOrder, slotToColor);
        break;
      case "dual":
        this.createDualLayout(localSlotOrder, slotToColor);
        break;
      case "corner":
        this.createCornerLayout(localSlotOrder, slotToColor);
        break;
    }

  }

  /**
   * Layout A: Single player - two buttons at bottom of screen
   */
  private createSingleLayout(
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    const slot = localSlotOrder[0] ?? 0;
    const fallbackColor = PLAYER_COLORS[0].primary;
    const color = slotToColor.get(slot) ?? fallbackColor;

    // Left button (rotate) - bottom left
    this.createTouchZone({
      slot,
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
      slot,
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
  private createDualLayout(
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    const bounds = this.getTouchZoneBounds();
    const width = bounds.width;
    const height = bounds.height;
    const inset = 8;
    const shortSide = Math.min(width, height);
    const availableHeight = height - inset * 2;
    const desiredHeightPx = Math.round(shortSide * 0.4);
    const zoneHeightPx = Math.min(
      desiredHeightPx,
      Math.floor(availableHeight / 2),
    );
    const desiredWidthPx = Math.round(width * 0.25);
    const maxWidthPx = Math.max(0, Math.floor((width - inset * 2) / 2));
    const zoneWidthPx = Math.max(
      120,
      Math.min(desiredWidthPx, maxWidthPx),
    );
    const blockHeightPx = zoneHeightPx * 2;
    const blockTopPx =
      inset + Math.max(0, Math.floor((availableHeight - blockHeightPx) / 2));
    const leftSlot = localSlotOrder[0] ?? 0;
    const rightSlot = localSlotOrder[1] ?? 1;

    const leftColor =
      slotToColor.get(leftSlot) ?? PLAYER_COLORS[0].primary;
    const rightColor =
      slotToColor.get(rightSlot) ?? PLAYER_COLORS[1].primary;

    // Left player - rotate (top) and fire (bottom)
    this.createTouchZone({
      slot: leftSlot,
      button: "A",
      label: "ROT",
      sublabel: "2x: dash",
      color: leftColor,
      style: {
        left: `${inset}px`,
        top: `${blockTopPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
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
        left: `${inset}px`,
        top: `${blockTopPx + zoneHeightPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
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
        right: `${inset}px`,
        top: `${blockTopPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
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
        right: `${inset}px`,
        top: `${blockTopPx + zoneHeightPx}px`,
        width: `${zoneWidthPx}px`,
        height: `${zoneHeightPx}px`,
        borderRadius: "12px",
      },
    });
  }

  /**
   * Layout C: 3-4 players - corner controls matching original Astro Party
   * Each corner has 2 buttons on adjacent edges of the arena border
   */
  private createCornerLayout(
    localSlotOrder: number[],
    slotToColor: Map<number, string>,
  ): void {
    const count = Math.min(localSlotOrder.length, 4);
    const bounds = this.getTouchZoneBounds();
    const width = bounds.width;
    const height = bounds.height;
    const inset = 8;
    const gap = 0;

    // Zone sizing: diagonal corner edges
    const shortSide = Math.min(width, height);
    const desiredEdgeLengthPx = Math.round(shortSide * 0.4);
    const desiredThicknessPx = Math.round(shortSide * 0.14);
    const maxEdgeLengthWidth = Math.max(
      0,
      Math.floor((width - inset * 2) / 2),
    );
    const maxEdgeLengthHeight = Math.max(
      0,
      Math.floor((height - inset * 2 - desiredThicknessPx * 2) / 2),
    );
    const edgeLengthPx = Math.max(
      0,
      Math.min(desiredEdgeLengthPx, maxEdgeLengthWidth, maxEdgeLengthHeight),
    );
    const edgeThicknessPx = Math.min(desiredThicknessPx, shortSide * 0.2);

    for (let i = 0; i < count; i++) {
      const slot = localSlotOrder[i] ?? i;
      const corner = CORNER_POSITIONS[i];
      const fallbackColor = PLAYER_COLORS[i % PLAYER_COLORS.length].primary;
      const color = slotToColor.get(slot) ?? fallbackColor;

      const isTop = corner.corner.includes("top");
      const isLeft = corner.corner.includes("left");

      // ROT on one edge of the corner
      this.createTouchZone({
        slot,
        button: "A",
        label: "ROT",
        sublabel: "",
        color,
        style: {
          [isTop ? "top" : "bottom"]: `${inset}px`,
          [isLeft ? "left" : "right"]: `${inset}px`,
          width: `${edgeLengthPx}px`,
          height: `${edgeThicknessPx}px`,
          borderRadius: "8px",
        },
      });

      // FIRE on the adjacent edge of the corner
      this.createTouchZone({
        slot,
        button: "B",
        label: "FIRE",
        sublabel: "",
        color,
        style: {
          [isLeft ? "left" : "right"]: `${inset}px`,
          [isTop ? "top" : "bottom"]: `${inset + edgeThicknessPx + gap}px`,
          width: `${edgeThicknessPx}px`,
          height: `${edgeLengthPx}px`,
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

  setKeyboardEnabled(enabled: boolean): void {
    this.keyboardEnabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  setAllowAltKeys(allow: boolean): void {
    this.allowAltKeys = allow;
    this.rebuildKeyMap();
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  private getTouchZoneBounds(): { width: number; height: number } {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const parsePx = (value: string): number => {
      const num = Number.parseFloat(value);
      return Number.isFinite(num) ? num : 0;
    };

    const width = parsePx(styles.getPropertyValue("--box-width"));
    const height = parsePx(styles.getPropertyValue("--box-height"));
    if (width > 0 && height > 0) {
      return { width, height };
    }

    const rect = this.touchZoneContainer?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height };
    }

    return { width: window.innerWidth, height: window.innerHeight };
  }
}
