# Astro Party Learning Log

Durable implementation learnings to avoid repeating known mistakes.

## Usage Rules

- Append-only. Do not rewrite historical entries.
- Keep entries actionable and specific to a failed assumption or correction.
- When a learning becomes stable policy, mirror it into `AGENTS.md`.
- Link major learnings to matching `progress.md` milestones where relevant.

## Entry Template

```md
## YYYY-MM-DD - <short title>
- Context:
- Wrong assumption:
- Detection signal:
- Corrected approach:
- Guardrail:
- Related files:
```

## 2026-02-26 - Demo tutorial input path must reuse game pipeline

- Context:
  - Mobile demo tutorial progression was keyboard-only in practice.
- Wrong assumption:
  - Overlay-local touch/keyboard handlers were enough to drive tutorial action detection.
- Detection signal:
  - Touch did not advance tutorial/control handoff while gameplay touch zones existed.
  - Required behavior was only observed through keyboard path.
- Corrected approach:
  - Route tutorial action detection through canonical local input action callback path:
    - `Game.onLocalInputAction -> main.ts subscriber bridge -> DemoOverlayUI`.
  - Ensure overlays are non-blocking during try/control phases so touch zones receive input.
- Guardrail:
  - Do not add duplicate gameplay input detection in overlays when input pipeline callbacks already exist.
- Related files:
  - `src/Game.ts`
  - `src/main.ts`
  - `src/demo/DemoOverlayUI.ts`

## 2026-02-26 - Demo teardown must precede create/join transitions

- Context:
  - Entering create room/lobby caused transient jump patterns and unintended start-screen side effects.
- Wrong assumption:
  - It was safe to phase-hop while demo state was still partially active.
- Detection signal:
  - Visible transition from demo PLAYING -> START-like behavior -> lobby.
  - Intro/audio/UI effects briefly replayed out of scope.
- Corrected approach:
  - Perform explicit demo teardown before initiating create/join flow.
  - Keep suppress-next-start side effects scoped to teardown-for-action path.
- Guardrail:
  - For demo-to-action transitions, never patch around transient phases; teardown first, then transition.
- Related files:
  - `src/main.ts`
  - `src/demo/DemoController.ts`
  - `src/demo/DemoOverlayUI.ts`

## 2026-02-26 - Splash/logo/menu audio sequencing must be single-owner per cue

- Context:
  - Cue conflicts occurred between splash/logo/start BGM, including duplicate or conflicting trigger timing.
- Wrong assumption:
  - Multiple flow owners could safely trigger the same cue family with independent timing.
- Detection signal:
  - Perceived conflict where one cue masked another, and retriggers occurred across nearby transitions.
- Corrected approach:
  - Assign one owner per cue timeline segment and gate scene music starts around intro completion boundaries.
  - Cancel pending timers and clear conflicting cue paths when leaving scope.
- Guardrail:
  - For timeline-sensitive cues, keep single ownership and explicit cancellation/phase gates.
- Related files:
  - `src/main.ts`
  - `src/ui/startScreen.ts`
  - `src/AudioManager.ts`

## 2026-02-28 - Batch responsive layout work instead of iterative CSS patch chains

- Context:
  - Lobby/start screen responsiveness required many follow-up fixes across the same breakpoints.
- Wrong assumption:
  - Small incremental CSS tweaks would converge quickly without causing regressions in nearby viewport states.
- Detection signal:
  - Repeated same-day layout milestones on identical UI surfaces and recurring overflow/compression regressions.
- Corrected approach:
  - Do one ownership pass for layout math and breakpoint strategy first, then execute one coherent implementation slice.
  - Validate against fixed viewport matrix before moving to polish.
- Guardrail:
  - For responsive/UI-heavy tasks, do not ship repeated micro-patches without a unified layout model and test matrix.
- Related files:
  - `index.html`
  - `progress.md`

## 2026-02-28 - Coarse-pointer interactions need a shared debounce wrapper everywhere

- Context:
  - Duplicate mobile tap firing appeared in multiple places (lobby actions, debug panel controls, settings-adjacent buttons).
- Wrong assumption:
  - Per-component click handlers were sufficient and could be fixed ad hoc.
- Detection signal:
  - Single tap triggered two state flips/actions due synthetic click/touch event overlap.
- Corrected approach:
  - Standardize a reusable coarse-pointer tap guard with preventDefault/stopPropagation and cooldown timing.
- Guardrail:
  - Any new high-frequency mobile action button must use the shared tap-guard path by default.
- Related files:
  - `src/ui/lobby.ts`
  - `src/debug/debugPanel.ts`

## 2026-02-28 - Process tooling should be source-of-truth aware before becoming policy

- Context:
  - Governance hash drift checks were added, then rolled back when local-only tracking proved insufficient.
- Wrong assumption:
  - Local repository hash snapshots were a reliable proxy for upstream governance drift.
- Detection signal:
  - Tooling overhead increased while still missing the intended upstream/main-tracking requirement.
- Corrected approach:
  - Run a viability test against the real authority path (upstream/default branch or maintainer-managed source) before codifying workflow.
- Guardrail:
  - Do not harden process automation into AGENTS policy unless it validates against actual source-of-truth boundaries.
- Related files:
  - `AGENTS.md`
  - `README.md`
  - `progress.md`

## 2026-02-28 - Lock loadtest objective before choosing transport path

- Context:
  - Loadtest flow switched between matchmaking parity and direct Colyseus join paths to satisfy different goals.
- Wrong assumption:
  - A single loadtest connection path can optimize both gameplay-path fidelity and loadtest panel observability.
- Detection signal:
  - Repeated toggles in runner connection strategy and follow-up fixes for NOT_FOUND/visibility behavior.
- Corrected approach:
  - Define test intent first per runner:
    - parity runner follows real client matchmaking flow,
    - observability runner may use direct Colyseus APIs for panel counters.
- Guardrail:
  - Every loadtest runner must declare its primary objective in docs and avoid mixed-purpose path changes.
- Related files:
  - `server/loadtest/*.ts`
  - `server/README.md`
  - `progress.md`

## 2026-02-28 - Learning promotion sweep into policy guardrails

- Context:
  - Multiple repeat issues were already captured, but policy-level guidance needed stronger concrete rules to prevent recurrence.
- Wrong assumption:
  - Keeping learnings only in `.agents/learning.md` was enough to change day-to-day implementation behavior.
- Detection signal:
  - Recurring patterns continued across responsive UI passes, tap handling, and tooling/loadtest flow decisions.
- Corrected approach:
  - Promote stable cross-task learnings directly into `AGENTS.md` as enforceable guardrails.
  - Keep `learning.md` focused on assumption/failure context and promotion decisions.
- Guardrail:
  - Run periodic learning-promotion sweeps; when a learning repeats, convert it into explicit AGENTS policy language with action verbs.
- Promoted now:
  - shared coarse-pointer tap guard usage
  - coherent responsive planning before CSS micro-iterations
  - source-of-truth validation before policy automation
  - explicit loadtest objective declaration (parity vs observability)
- Related files:
  - `AGENTS.md`
  - `progress.md`
