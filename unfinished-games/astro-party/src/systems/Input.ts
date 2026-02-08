import { PlayerInput } from "../types";
import { SettingsManager } from "../SettingsManager";

const DOUBLE_TAP_WINDOW = 300; // ms

export class InputManager {
  buttonA = false;
  buttonB = false;
  // Dev keys for testing powerups
  devKeyO = false;
  devKeyP = false;
  private wasButtonA = false;
  private lastButtonATime = 0;
  private onDashDetected: (() => void) | null = null;
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
      // Dev keys for testing powerups (O = Laser, P = Shield)
      if (e.code === "KeyO") {
        e.preventDefault();
        this.devKeyO = true;
        handled = true;
      }
      if (e.code === "KeyP") {
        e.preventDefault();
        this.devKeyP = true;
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
      if (e.code === "KeyO") {
        this.devKeyO = false;
      }
      if (e.code === "KeyP") {
        this.devKeyP = false;
      }
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

  // Dev keys for testing - returns which dev key was pressed
  consumeDevKeys(): { laser: boolean; shield: boolean } {
    const result = { laser: this.devKeyO, shield: this.devKeyP };
    this.devKeyO = false;
    this.devKeyP = false;
    return result;
  }

  // Clear all input state (call on round end)
  reset(): void {
    this.buttonA = false;
    this.buttonB = false;
    this.wasButtonA = false;
    this.lastButtonATime = 0;
    this.devKeyO = false;
    this.devKeyP = false;
  }
}
