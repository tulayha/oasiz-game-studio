import { PlayerInput } from "../types";
import { SettingsManager } from "../SettingsManager";

const DOUBLE_TAP_WINDOW = 300; // ms

export class InputManager {
  buttonA = false;
  buttonB = false;
  // Dev-only power-up keys (kept isolated for easy removal later)
  private devKeysEnabled = false;
  private devModeEnabled = false; // Toggle for dev visualization mode (key "0")
  private devPowerUpKeys = {
    laser: false,
    shield: false,
    scatter: false,
    mine: false,
    reverse: false,
    joust: false,
    homing: false,
  };
  private wasButtonA = false;
  private lastButtonATime = 0;
  private onDashDetected: (() => void) | null = null;
  private onDevModeToggle: ((enabled: boolean) => void) | null = null;
  private isMobile: boolean;
  private keyboardEnabled = true;
  private allowAltKeys = true;
  private primaryAKeys = new Set<string>(["KeyA"]);
  private primaryBKeys = new Set<string>(["KeyD"]);
  private altAKeys = new Set<string>(["ArrowLeft"]);
  private altBKeys = new Set<string>(["ArrowRight", "Space"]);

  constructor() {
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
  }

  setup(): void {
    this.setupKeyboard();
    if (this.isMobile) {
      this.setupTouch();
    }
  }

  private setupKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      if (!this.keyboardEnabled || this.isEditableTarget(e.target)) {
        return;
      }
      let handled = false;
      // Button A: A key or Left Arrow
      if (this.isButtonAKey(e.code)) {
        e.preventDefault();
        this.buttonA = true;
        handled = true;
      }
      // Button B: D key, Right Arrow, or Space
      if (this.isButtonBKey(e.code)) {
        e.preventDefault();
        this.buttonB = true;
        handled = true;
      }
      // Dev keys for testing powerups (1 = Laser, 2 = Shield, 3 = Scatter, 4 = Mine, 5 = Reverse)
      // Dev keys for testing powerups (1-7, not numpad)
      // Dev mode toggle (0) for visualization
      if (this.handleDevKeyDown(e.code)) {
        e.preventDefault();
        handled = true;
      }
      if (!handled) return;
    });

    window.addEventListener("keyup", (e) => {
      if (!this.keyboardEnabled || this.isEditableTarget(e.target)) {
        return;
      }
      if (this.isButtonAKey(e.code)) {
        this.buttonA = false;
      }
      if (this.isButtonBKey(e.code)) {
        this.buttonB = false;
      }
      this.handleDevKeyUp(e.code);
    });
  }

  private setupTouch(): void {
    const leftZone = document.getElementById("control-zone-left");
    const rightZone = document.getElementById("control-zone-right");

    if (leftZone) {
      // Button A: Left side (rotate + dash)
      leftZone.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          this.buttonA = true;
          leftZone.classList.add("active");
          this.triggerHaptic("light");
        },
        { passive: false },
      );

      leftZone.addEventListener("touchend", () => {
        this.buttonA = false;
        leftZone.classList.remove("active");
      });

      leftZone.addEventListener("touchcancel", () => {
        this.buttonA = false;
        leftZone.classList.remove("active");
      });
    }

    if (rightZone) {
      // Button B: Right side (thrust + fire)
      rightZone.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          this.buttonB = true;
          rightZone.classList.add("active");
          this.triggerHaptic("light");
        },
        { passive: false },
      );

      rightZone.addEventListener("touchend", () => {
        this.buttonB = false;
        rightZone.classList.remove("active");
      });

      rightZone.addEventListener("touchcancel", () => {
        this.buttonB = false;
        rightZone.classList.remove("active");
      });
    }
  }

  setDashCallback(callback: () => void): void {
    this.onDashDetected = callback;
  }

  setKeyboardEnabled(enabled: boolean): void {
    this.keyboardEnabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  setAllowAltKeys(allow: boolean): void {
    this.allowAltKeys = allow;
  }

  setDevKeysEnabled(enabled: boolean): void {
    this.devKeysEnabled = enabled;
    if (!enabled) {
      this.resetDevKeys();
    }
  }

  capture(): PlayerInput {
    const now = performance.now();

    // Detect double-tap on Button A for dash
    if (this.buttonA && !this.wasButtonA) {
      if (now - this.lastButtonATime < DOUBLE_TAP_WINDOW) {
        this.triggerHaptic("medium");
        this.onDashDetected?.(); // Send RPC immediately
      }
      this.lastButtonATime = now;
    }
    this.wasButtonA = this.buttonA;

    return {
      buttonA: this.buttonA,
      buttonB: this.buttonB,
      timestamp: now,
      clientTimeMs: now,
    };
  }

  private triggerHaptic(
    type: "light" | "medium" | "heavy" | "success" | "error",
  ): void {
    SettingsManager.triggerHaptic(type);
  }

  getIsMobile(): boolean {
    return this.isMobile;
  }

  private isButtonAKey(code: string): boolean {
    if (this.primaryAKeys.has(code)) return true;
    return this.allowAltKeys && this.altAKeys.has(code);
  }

  private isButtonBKey(code: string): boolean {
    if (this.primaryBKeys.has(code)) return true;
    return this.allowAltKeys && this.altBKeys.has(code);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  // Set callback for dev mode toggle
  setDevModeCallback(callback: (enabled: boolean) => void): void {
    this.onDevModeToggle = callback;
  }

  // Toggle dev mode visualization (key "0")
  toggleDevMode(): boolean {
    this.devModeEnabled = !this.devModeEnabled;
    console.log(
      "[Dev] Dev mode visualizers:",
      this.devModeEnabled ? "ON" : "OFF",
    );
    // Notify Game class to update renderer
    this.onDevModeToggle?.(this.devModeEnabled);
    return this.devModeEnabled;
  }

  // Get current dev mode state
  isDevModeEnabled(): boolean {
    return this.devModeEnabled;
  }

  // Dev keys for testing - returns which dev key was pressed
  consumeDevKeys(): {
    laser: boolean;
    shield: boolean;
    scatter: boolean;
    mine: boolean;
    reverse: boolean;
    joust: boolean;
    homing: boolean;
  } {
    const result = {
      laser: this.devPowerUpKeys.laser,
      shield: this.devPowerUpKeys.shield,
      scatter: this.devPowerUpKeys.scatter,
      mine: this.devPowerUpKeys.mine,
      reverse: this.devPowerUpKeys.reverse,
      joust: this.devPowerUpKeys.joust,
      homing: this.devPowerUpKeys.homing,
    };
    this.resetDevKeys();
    return result;
  }

  // Clear all input state (call on round end)
  reset(): void {
    this.buttonA = false;
    this.buttonB = false;
    this.wasButtonA = false;
    this.lastButtonATime = 0;
    this.resetDevKeys();
  }

  private handleDevKeyDown(code: string): boolean {
    // Dev mode toggle works regardless of devKeysEnabled
    if (code === "Digit0") {
      this.toggleDevMode();
      return true;
    }

    if (!this.devKeysEnabled) return false;
    switch (code) {
      case "Digit1":
        this.devPowerUpKeys.laser = true;
        return true;
      case "Digit2":
        this.devPowerUpKeys.shield = true;
        return true;
      case "Digit3":
        this.devPowerUpKeys.scatter = true;
        return true;
      case "Digit4":
        this.devPowerUpKeys.mine = true;
        return true;
      case "Digit5":
        this.devPowerUpKeys.reverse = true;
        return true;
      case "Digit6":
        this.devPowerUpKeys.joust = true;
        return true;
      case "Digit7":
        this.devPowerUpKeys.homing = true;
        return true;
      default:
        return false;
    }
  }

  private handleDevKeyUp(code: string): void {
    if (!this.devKeysEnabled) return;
    switch (code) {
      case "Digit0":
        // Toggle is handled on keydown
        break;
      case "Digit1":
        this.devPowerUpKeys.laser = false;
        break;
      case "Digit2":
        this.devPowerUpKeys.shield = false;
        break;
      case "Digit3":
        this.devPowerUpKeys.scatter = false;
        break;
      case "Digit4":
        this.devPowerUpKeys.mine = false;
        break;
      case "Digit5":
        this.devPowerUpKeys.reverse = false;
        break;
      case "Digit6":
        this.devPowerUpKeys.joust = false;
        break;
      case "Digit7":
        this.devPowerUpKeys.homing = false;
        break;
      default:
        break;
    }
  }

  private resetDevKeys(): void {
    this.devPowerUpKeys.laser = false;
    this.devPowerUpKeys.shield = false;
    this.devPowerUpKeys.scatter = false;
    this.devPowerUpKeys.mine = false;
    this.devPowerUpKeys.reverse = false;
    this.devPowerUpKeys.joust = false;
    this.devPowerUpKeys.homing = false;
  }
}
