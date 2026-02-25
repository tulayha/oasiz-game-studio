export type TutorialWaitFor = "rotate" | "fire" | null;

export interface TutorialStep {
  text: string;
  /** null = auto-advance after holdMs; "rotate"/"fire" = wait for player input */
  waitFor: TutorialWaitFor;
  /** How long to hold the panel after typewriter finishes (only used when waitFor is null) */
  holdMs: number;
  /** How long to let the player "try it" before auto-advancing to the next step (only when waitFor != null) */
  tryDurationMs: number;
}

export function getTutorialSteps(isMobile: boolean): TutorialStep[] {
  if (isMobile) {
    return [
      {
        text: "Welcome, pilot. Your ship always thrusts forward.",
        waitFor: null,
        holdMs: 2500,
        tryDurationMs: 0,
      },
      {
        text: "Hold the left side to rotate your ship. Give it a try!",
        waitFor: "rotate",
        holdMs: 0,
        tryDurationMs: 3000,
      },
      {
        text: "Tap the right side to fire. Double-tap left to dodge!",
        waitFor: "fire",
        holdMs: 0,
        tryDurationMs: 3000,
      },
      {
        text: "Destroy ships to eject pilots. Eliminate pilots to score!",
        waitFor: null,
        holdMs: 3000,
        tryDurationMs: 0,
      },
    ];
  }

  return [
    {
      text: "Welcome, pilot. Your ship always thrusts forward.",
      waitFor: null,
      holdMs: 2500,
      tryDurationMs: 0,
    },
    {
      text: "Press A or ← to rotate your ship. Give it a try!",
      waitFor: "rotate",
      holdMs: 0,
      tryDurationMs: 3000,
    },
    {
      text: "Press D, → or Space to fire. Double-tap A to dodge!",
      waitFor: "fire",
      holdMs: 0,
      tryDurationMs: 3000,
    },
    {
      text: "Destroy ships to eject pilots. Eliminate pilots to score!",
      waitFor: null,
      holdMs: 3000,
      tryDurationMs: 0,
    },
  ];
}

export function typewriteText(
  element: HTMLElement,
  text: string,
  charDelayMs = 30,
): { cancel: () => void; done: Promise<void> } {
  let cancelled = false;
  let charIndex = 0;

  const done = new Promise<void>((resolve) => {
    function tick(): void {
      if (cancelled) {
        element.textContent = text;
        resolve();
        return;
      }
      if (charIndex >= text.length) {
        resolve();
        return;
      }
      element.textContent = text.slice(0, charIndex + 1);
      charIndex++;
      setTimeout(tick, charDelayMs);
    }
    tick();
  });

  return {
    cancel: () => {
      cancelled = true;
    },
    done,
  };
}

export function createControlDiagram(isMobile: boolean): string {
  if (isMobile) {
    return `<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
      <rect x="4" y="4" width="88" height="72" rx="10" fill="rgba(0,240,255,0.07)" stroke="#00f0ff" stroke-width="1.5"/>
      <text x="48" y="34" text-anchor="middle" fill="#00f0ff" font-family="Orbitron,sans-serif" font-size="9">ROTATE</text>
      <text x="48" y="54" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="9">Hold left side</text>
      <rect x="108" y="4" width="88" height="72" rx="10" fill="rgba(255,0,170,0.07)" stroke="#ff00aa" stroke-width="1.5"/>
      <text x="152" y="34" text-anchor="middle" fill="#ff00aa" font-family="Orbitron,sans-serif" font-size="9">FIRE</text>
      <text x="152" y="54" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="9">Tap right side</text>
    </svg>`;
  }
  return `<svg viewBox="0 0 220 80" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
    <rect x="4" y="4" width="96" height="72" rx="10" fill="rgba(0,240,255,0.07)" stroke="#00f0ff" stroke-width="1.5"/>
    <text x="52" y="30" text-anchor="middle" fill="#00f0ff" font-family="Orbitron,sans-serif" font-size="9">ROTATE</text>
    <text x="52" y="48" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="10">A  /  ←</text>
    <text x="52" y="66" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-family="sans-serif" font-size="8">double-tap to dodge</text>
    <rect x="116" y="4" width="100" height="72" rx="10" fill="rgba(255,0,170,0.07)" stroke="#ff00aa" stroke-width="1.5"/>
    <text x="166" y="30" text-anchor="middle" fill="#ff00aa" font-family="Orbitron,sans-serif" font-size="9">FIRE</text>
    <text x="166" y="48" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="10">D  /  →  /  Space</text>
  </svg>`;
}
