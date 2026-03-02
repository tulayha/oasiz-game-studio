Original prompt: joystick sistemini tamamen baştan yap titreyip duruyor en sonda

- Rebuilt mobile joystick input flow in `src/main.ts` for both P1 and P2:
  - Removed smoothing and frame polling.
  - Added direct pointer/touch ID tracking.
  - Moved move/end tracking to `window` listeners so release outside control still resets cleanly.
  - Added touch fallback for P2 boost button.
- Updated joystick visual CSS in `index.html`:
  - Set `touch-action: none` on joystick container.
  - Removed knob transform transition and enabled `will-change: transform`.
- Next: run typecheck + mobile Playwright verification to confirm release jitter is gone.
