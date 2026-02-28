# Astro Party Remaining Issues (Post Fixes 1-4)

Date: 2026-02-28

This captures the issues that remained after the requested fixes for findings 1-4 (loop lifecycle, SDK migration, timer typing, and start/join action race guard).

## 1) Orientation Ownership Mismatch

- Severity: Medium
- Status: Open
- Summary:
  - Architecture policy says the platform owns forced landscape behavior and the client should not rely on portrait rotation transforms as a normal compatibility path.
  - Client still applies CSS portrait-to-landscape rotation and demo code still contains rotation-specific coordinate remapping.
- Impact:
  - Increases layout/input complexity and risk of overlay/touch alignment regressions in portrait edge cases.
  - Conflicts with documented architecture ownership, which can cause future implementation drift.
- Evidence:
  - [ARCHITECTURE.md:99](/i:/Repos/Oasiz/space-force-dev/astro-party/ARCHITECTURE.md:99)
  - [ARCHITECTURE.md:101](/i:/Repos/Oasiz/space-force-dev/astro-party/ARCHITECTURE.md:101)
  - [index.html:2379](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:2379)
  - [index.html:2384](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:2384)
  - [index.html:2395](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:2395)
  - [main.ts:497](/i:/Repos/Oasiz/space-force-dev/astro-party/src/main.ts:497)
- Suggested fix:
  - Remove portrait rotation fallback (`rotate(-90deg)`) and portrait remap logic from demo ship position pipeline.
  - Keep layout safe-area handling in landscape coordinates only.

## 2) Top Safe-Area Offset Budget Not Enforced for Interactive Top Controls

- Severity: Medium
- Status: Open
- Summary:
  - Top-corner interactive controls (leave/settings/demo-exit) are positioned using small `--hud-top-pad` values (6px desktop, 12px coarse-pointer override), not the stricter top offset budget expected for embedded platform overlays.
- Impact:
  - Buttons may be partially covered by platform HUD/chrome/notch overlays on some devices.
  - Risk of reduced tap reliability and discoverability for critical controls.
- Evidence:
  - [index.html:208](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:208)
  - [index.html:1228](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:1228)
  - [index.html:1230](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:1230)
  - [index.html:1258](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:1258)
  - [index.html:1260](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:1260)
  - [index.html:2882](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:2882)
  - [index.html:3327](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:3327)
  - [index.html:3330](/i:/Repos/Oasiz/space-force-dev/astro-party/index.html:3330)
- Suggested fix:
  - Enforce explicit minimum top offsets for interactive top controls via dedicated CSS vars/classes per input mode.
  - Example policy target:
    - Desktop: minimum 45px from effective top.
    - Mobile/coarse pointer: minimum 120px from effective top.
