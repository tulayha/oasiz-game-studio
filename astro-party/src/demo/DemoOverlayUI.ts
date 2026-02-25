import {
  getTutorialSteps,
  typewriteText,
  createControlDiagram,
} from "./demoTutorial";
import { AudioManager } from "../AudioManager";

export interface DemoOverlayCallbacks {
  onTapToStart: () => void;
  onTutorialComplete: () => void;
  onSkipToMenu: () => void;
  /** Called when tutorial panel should pause the sim */
  onPauseGame: () => void;
  /** Called when tutorial panel should resume the sim ("try it" phase) */
  onResumeGame: () => void;
  /** Returns the player's ship primary color hex */
  getShipColor: () => string;
  /** Returns the ship's current CSS viewport position */
  getShipPos: () => { x: number; y: number } | null;
  /** Sets/clears the camera zoom boost */
  setZoom: (boost: number | null) => void;
}

export class DemoOverlayUI {
  private attractOverlay: HTMLElement;
  private tapText: HTMLElement;
  private skipBtn: HTMLButtonElement;
  private tutorialOverlay: HTMLElement;
  private tutorialPanel: HTMLElement;
  private tutorialDiagram: HTMLElement;
  private tutorialDialogue: HTMLElement;
  private tutorialSkip: HTMLButtonElement;
  private tutorialNext: HTMLButtonElement;
  private exitBtn: HTMLButtonElement;

  private callbacks: DemoOverlayCallbacks | null = null;
  private isMobile: boolean;
  private transitioning = false;
  private tutorialRunning = false;
  private cancelTypewriter: (() => void) | null = null;

  private boundOnTap: () => void;
  private boundOnKey: (e: KeyboardEvent) => void;

  constructor(isMobile: boolean) {
    this.isMobile = isMobile;

    this.attractOverlay = document.getElementById("demoAttractOverlay")!;
    this.tapText = document.getElementById("demoTapText")!;
    this.skipBtn = document.getElementById("demoSkipBtn") as HTMLButtonElement;
    this.tutorialOverlay = document.getElementById("demoTutorialOverlay")!;
    this.tutorialPanel = document.getElementById("demoTutorialPanel")!;
    this.tutorialDiagram = document.getElementById("demoTutorialDiagram")!;
    this.tutorialDialogue = document.getElementById("demoTutorialDialogue")!;
    this.tutorialSkip = document.getElementById(
      "demoTutorialSkip",
    ) as HTMLButtonElement;
    this.tutorialNext = document.getElementById(
      "demoTutorialNext",
    ) as HTMLButtonElement;
    this.exitBtn = document.getElementById(
      "demoExitBtn",
    ) as HTMLButtonElement;

    this.boundOnTap = this.handleTap.bind(this);
    this.boundOnKey = this.handleKey.bind(this);

    if (!isMobile) {
      this.tapText.textContent = "Press any key to Start";
    }
  }

  setCallbacks(callbacks: DemoOverlayCallbacks): void {
    this.callbacks = callbacks;
  }

  showAttract(): void {
    this.attractOverlay.classList.remove("hidden");

    this.attractOverlay.addEventListener("click", this.boundOnTap);
    document.addEventListener("keydown", this.boundOnKey);

    this.skipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleSkip();
    });
  }

  showTutorial(isMobile = this.isMobile): void {
    this.attractOverlay.classList.add("hidden");
    this.attractOverlay.removeEventListener("click", this.boundOnTap);
    document.removeEventListener("keydown", this.boundOnKey);

    // Inject diagram
    this.tutorialDiagram.innerHTML = createControlDiagram(isMobile);

    this.tutorialOverlay.classList.remove("hidden");

    this.tutorialSkip.addEventListener("click", () => {
      this.handleSkip();
    });

    void this.runTutorial();
  }

  /** Shows the Exit Demo button (top-left). Call after tutorial completes. */
  showExitButton(onExit: () => void): void {
    this.exitBtn.classList.remove("hidden");
    // Clone to remove any prior click listeners
    const fresh = this.exitBtn.cloneNode(true) as HTMLButtonElement;
    this.exitBtn.parentNode?.replaceChild(fresh, this.exitBtn);
    this.exitBtn = fresh;
    this.exitBtn.addEventListener("click", () => {
      this.exitBtn.classList.add("hidden");
      onExit();
    });
  }

  /** Shows the "Next →" button and resolves when clicked. */
  private waitForNextButton(): Promise<void> {
    return new Promise((resolve) => {
      const handler = (): void => {
        this.tutorialNext.classList.add("hidden");
        this.tutorialNext.removeEventListener("click", handler);
        resolve();
      };
      this.tutorialNext.classList.remove("hidden");
      this.tutorialNext.addEventListener("click", handler);
    });
  }

  hideAll(): void {
    this.attractOverlay.classList.add("hidden");
    this.tutorialOverlay.classList.add("hidden");
    this.tutorialNext.classList.add("hidden");
    this.exitBtn.classList.add("hidden");
    this.attractOverlay.removeEventListener("click", this.boundOnTap);
    document.removeEventListener("keydown", this.boundOnKey);
    this.cancelTypewriter?.();
    this.tutorialRunning = false;
  }

  destroy(): void {
    this.hideAll();
  }

  private handleTap(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.callbacks?.onTapToStart();
  }

  private handleKey(e: KeyboardEvent): void {
    if (
      e.key === "Shift" ||
      e.key === "Control" ||
      e.key === "Alt" ||
      e.key === "Meta"
    )
      return;
    this.handleTap();
  }

  private handleSkip(): void {
    this.cancelTypewriter?.();
    this.tutorialRunning = false;
    this.callbacks?.onSkipToMenu();
  }

  // -------------------------------------------------------------------------
  // Interactive tutorial flow
  // -------------------------------------------------------------------------

  private async runTutorial(): Promise<void> {
    this.tutorialRunning = true;
    const steps = getTutorialSteps(this.isMobile);
    let rotateStepDone = false;

    for (const step of steps) {
      if (!this.tutorialRunning) break;

      // Show panel, pause sim while dialogue is playing
      this.showPanel();
      this.callbacks?.onPauseGame();

      this.tutorialDialogue.textContent = "";
      await this.typeStep(step.text);
      if (!this.tutorialRunning) break;

      // Always wait for player to click "Next" before proceeding
      await this.waitForNextButton();
      if (!this.tutorialRunning) break;

      if (step.waitFor !== null) {
        // After the rotate step, show the player intro zoom
        if (step.waitFor === "rotate" && !rotateStepDone) {
          rotateStepDone = true;
          this.hidePanel();
          // Keep sim paused — runPlayerIntro will resume it when player presses A
          await this.runPlayerIntro();
          if (!this.tutorialRunning) break;
          // After intro, wait for the actual rotate input
          await this.waitForInput(step.waitFor, step.tryDurationMs);
          if (!this.tutorialRunning) break;
        } else {
          // "Try it" phase: hide panel, resume sim, wait for input
          this.hidePanel();
          this.callbacks?.onResumeGame();
          await this.waitForInput(step.waitFor, step.tryDurationMs);
          if (!this.tutorialRunning) break;
        }
      }
      // (waitFor: null steps just continue after Next click — no extra delay)
    }

    if (!this.tutorialRunning) return;

    // All steps done — show a "Start Playing" panel
    this.tutorialRunning = false;
    this.showPanel();
    this.callbacks?.onPauseGame();
    this.tutorialDialogue.textContent = "You're ready. Good luck, Cadet!";
    this.showStartPlayingButton();
  }

  private showPanel(): void {
    this.tutorialPanel.classList.remove("panel-hidden");
  }

  private hidePanel(): void {
    this.tutorialPanel.classList.add("panel-hidden");
  }

  private showStartPlayingButton(): void {
    // Replace the skip button with a prominent "Start Playing" button
    this.tutorialSkip.textContent = "Start Playing";
    this.tutorialSkip.classList.add("demo-start-playing-btn");
    // Remove old listeners and wire a one-shot complete callback
    const fresh = this.tutorialSkip.cloneNode(true) as HTMLButtonElement;
    this.tutorialSkip.parentNode?.replaceChild(fresh, this.tutorialSkip);
    this.tutorialSkip = fresh;
    this.tutorialSkip.textContent = "Start Playing";
    this.tutorialSkip.classList.add("demo-start-playing-btn");
    this.tutorialSkip.addEventListener("click", () => {
      this.tutorialOverlay.classList.add("hidden");
      this.callbacks?.onTutorialComplete();
    });
  }

  private async typeStep(text: string): Promise<void> {
    let lastSfxAt = 0;
    let charCount = 0;

    const tw = typewriteText(this.tutorialDialogue, text, 28);
    this.cancelTypewriter = tw.cancel;

    const sfxInterval = setInterval(() => {
      if (!this.tutorialRunning) {
        clearInterval(sfxInterval);
        return;
      }
      const now = performance.now();
      charCount++;
      if (charCount % 3 === 0 && now - lastSfxAt > 80) {
        AudioManager.playUIClick();
        lastSfxAt = now;
      }
    }, 28 * 3);

    await tw.done;
    clearInterval(sfxInterval);
    this.cancelTypewriter = null;
  }

  /**
   * Shows a zoom-in spotlight on the player's ship and waits for them to press
   * rotate (A / ←) before resolving. Uses callbacks supplied by main.ts.
   */
  private runPlayerIntro(): Promise<void> {
    return new Promise((resolve) => {
      const cb = this.callbacks;
      if (!cb) {
        resolve();
        return;
      }

      const overlay = document.getElementById(
        "demoPlayerIntroOverlay",
      ) as HTMLElement | null;
      const ring = document.getElementById(
        "demoPlayerIntroRing",
      ) as HTMLElement | null;
      const label = overlay?.querySelector(
        ".demo-player-intro-label",
      ) as HTMLElement | null;

      if (!overlay || !ring) {
        resolve();
        return;
      }

      const shipColor = cb.getShipColor();

      // Apply ship color to ring
      ring.style.borderColor = shipColor;
      ring.style.boxShadow = `0 0 28px ${shipColor}, 0 0 56px ${shipColor}55`;
      ring.style.animation = "none";
      void ring.offsetWidth; // reflow to restart animation
      ring.style.animation = "";

      // Zoom the camera in on the player's ship
      cb.setZoom(2.2);

      const positionRing = (): void => {
        const pos = cb.getShipPos();
        if (pos && ring) {
          ring.style.left = `${pos.x}px`;
          ring.style.top = `${pos.y}px`;
          const r = ring.getBoundingClientRect().width / 2;
          overlay.style.setProperty("--spot-x", `${pos.x}px`);
          overlay.style.setProperty("--spot-y", `${pos.y}px`);
          overlay.style.setProperty("--spot-r", `${Math.max(r, 48)}px`);
        }
      };

      overlay.classList.remove("hidden");
      setTimeout(positionRing, 120);
      const trackInterval = setInterval(positionRing, 50);

      if (label) label.textContent = "Press ← / A to take control";

      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearInterval(trackInterval);
        document.removeEventListener("keydown", onRotateKey);
        overlay.classList.add("hidden");
        cb.setZoom(null);
        // Resume sim — player pressed A and can now fly freely
        cb.onResumeGame();
        setTimeout(resolve, 380);
      };

      const ROTATE_KEYS = new Set(["a", "A", "ArrowLeft"]);
      const onRotateKey = (e: KeyboardEvent): void => {
        if (ROTATE_KEYS.has(e.key)) finish();
      };
      document.addEventListener("keydown", onRotateKey);
    });
  }

  /**
   * Waits for the player to perform a specific action (rotate or fire),
   * then auto-advances after tryDurationMs to ensure forward progress.
   */
  private waitForInput(
    action: "rotate" | "fire",
    autoAdvanceMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;

      const done = (): void => {
        if (resolved) return;
        resolved = true;
        document.removeEventListener("keydown", onKey);
        clearTimeout(autoTimeout);
        // Let player play freely before next panel
        setTimeout(resolve, 6000);
      };

      const ROTATE_KEYS = new Set(["a", "A", "ArrowLeft"]);
      const FIRE_KEYS = new Set(["d", "D", "ArrowRight", " "]);

      const onKey = (e: KeyboardEvent): void => {
        if (!this.tutorialRunning) {
          done();
          return;
        }
        const key = e.key;
        if (action === "rotate" && ROTATE_KEYS.has(key)) done();
        if (action === "fire" && FIRE_KEYS.has(key)) done();
      };

      document.addEventListener("keydown", onKey);

      // Auto-advance so tutorial never gets stuck
      const autoTimeout = setTimeout(done, autoAdvanceMs);
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
