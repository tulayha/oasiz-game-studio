# Astro Party Progress (Condensed)

Condensed on 2026-02-28 to remove repeated micro-iterations and duplicate validation logs.

- Full pre-condense history is archived at `astro-party/progress.archive.2026-02-28.md`.
- This file now keeps milestone-level outcomes, recurring problems, and durable learnings.

## Progress Usage Contract (Effective 2026-02-28)

- `progress.md` is a two-layer tracking surface:
  - `Active Task Threads` for planned prompts (living, updated in-place while active).
  - `Milestone Journal` for shipped outcomes (append-only historical summaries).
- For any prompt requiring planned work, track these fields in an active thread:
  - Original prompt
  - Intent
  - Plan
  - Progress updates
  - Validation status
  - Outcome/next steps
- Once completed, close the thread and capture final outcome in a dated milestone entry.

## Active Task Threads

### 2026-02-28 - Agent doc cleanup activity reference wiring (Closed)

- Original prompt:
  - Add a reference in the agent docs so saying "agent doc cleanup activity" is enough to trigger the full documentation cleanup workflow.
- Intent:
  - Make doc-governance cleanup reusable as a named activity with predictable outputs.
- Plan:
  - Add a reusable activity section in `AGENTS.md` with trigger phrase, scope, workflow, and done criteria.
  - Record this run in `progress.md`.
- Progress updates:
  - Added `Reusable Activity: Agent Doc Cleanup` section to `AGENTS.md`.
  - Documented execution rule so the shorthand phrase directly triggers the workflow.
- Validation:
  - Docs-only update; no runtime commands rerun.
- Outcome:
  - Closed. Future requests can use `agent doc cleanup activity` as the directive.

### 2026-02-28 - Guardrail/Architecture doc finetune (Closed)

- Original prompt:
  - Review learnings, promote concrete guardrails into `AGENTS.md`, update `progress.md` usage as a living planned-work reference, and update architecture constraints for platform-owned landscape orientation.
- Intent:
  - Convert recurring mistakes into policy-level guardrails and reduce repeat orientation/layout churn.
- Plan:
  - Review `learning.md` for stable patterns.
  - Promote policy-level rules into `AGENTS.md`.
  - Update `progress.md` contract for active planned-work tracking.
  - Update `ARCHITECTURE.md` with platform orientation ownership + safe-area responsibilities.
- Progress updates:
  - Completed learning-to-policy promotion in `AGENTS.md`.
  - Added `progress.md` two-layer contract and active-task workflow.
  - Added architecture ownership note: platform enforces landscape; client owns safe-area/HUD-aware placement.
- Validation:
  - Docs-only update; no runtime commands rerun.
- Outcome:
  - Closed. New guardrails and architecture contract are now explicit and durable.

## Recurring Patterns Filtered Out

- Iterative UI micro-patches were repeatedly applied to the same lobby/start layouts.
  - Learning: prefer one coherent responsive pass with a fixed viewport matrix before follow-up polish.
- Mobile taps double-fired across multiple UI surfaces.
  - Learning: use one shared coarse-pointer debounce wrapper for all tap actions.
- Tooling/process experiments were introduced then rolled back quickly.
  - Learning: run a viability check against the real source of truth before enforcing new process automation.
- Loadtest harness behavior drifted from production matchmaking flow.
  - Learning: lock intended test objective first (API parity vs panel observability), then choose connection path.
- Validation output was logged repeatedly for the same milestone.
  - Learning: report one validation block per milestone, with explicit exceptions only.

## 2026-02-16 - Networking Authority Rewrite

- Replaced client interpolation/prediction queueing with newest-snapshot authoritative sync in `src/network/NetworkSyncSystem.ts`.
- Server snapshot delivery aligned to simulation tick; removed decoupled snapshot timer in `server/src/rooms/AstroPartyRoom.ts`.
- Input path sends immediately on edge changes while preserving keepalive cadence in `src/systems/PlayerInputResolver.ts`.
- Simplified network tuning and removed obsolete self-prediction module.
- Validation:
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `bun run build` passed.
  - Smoke automation script executed successfully in later reruns.

## 2026-02-17 - Authoritative Scoring + Midcore UX Corrections

- Centralized score policy and rewards in `shared/sim/scoring.ts`; server became authoritative score owner.
- Propagated `score` and `scoresById` through sim, room schema, transports, and client sync.
- Updated HUD/endboard to render authoritative points-based standings.
- Fixed host mobile touch dash consumption path to match desktop behavior.
- Standardized leave action visibility between HUD and settings on mobile/local-player edge cases.
- Introduced debug-tool gating + taint propagation to block score submission in debug-tainted sessions.
- Added QA/dev debug panel (build-gated) with phase previews and debug actions.
- Expanded map selection model with Classic rotation + Turret map and corresponding preview/sim behavior.
- Validation:
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `bun run build` passed.

## 2026-02-18 - Lobby Responsive System Reset

- Reworked lobby/map panel layout for coarse-pointer portrait constraints to stop overflow and clipping.
- Replaced multi-button mode selector with compact cycle control and aligned Advanced action sizing.
- Removed non-essential map description/behavior text from lobby to preserve usable space.
- Finalized portrait strategy around stable content-fit model instead of incremental per-breakpoint patching.
- Validation:
  - `astro-party`: `bun run build` passed.

## 2026-02-20 to 2026-02-21 - Combat FX + Input Reliability + Mobile Controls

- Added projectile casing visual system with pooling/capping and baseline gating for in-flight snapshot joins.
- Added pilot death debris FX system with deterministic piece behavior and gameplay-interaction impulses.
- Implemented continue-sequence flow to advance matches without full lobby reset.
- Fixed authoritative ship-destroy/pilot-kill FX trigger logic to avoid false positives on disconnect/remove.
- Added server type fix for `poly-decomp` and explicit dependency wiring.
- Improved mobile controls:
  - left-rail safe spacing,
  - touch SVG icon upgrades,
  - triangular one-player controls,
  - coarse-pointer tap debounce guards for duplicate clicks.
- Validation:
  - `astro-party`: `bun run build` passed.
  - `astro-party/server`: `bun run build` passed where server files changed.

## 2026-02-23 to 2026-02-25 - Rendering, Title Intro, and Audio Timeline Polish

- Added pilot swim-arm animation and pilot hardpoint pipeline parity with ship asset flow.
- Rebuilt start/title presentation with staged logo animation and sequential reveal of subtitle/hints/buttons.
- Fixed intro replay and pre-flash regressions by tightening start-screen state ownership.
- Retuned title motion beats and audio cue timing; corrected splash/title cue ownership.
- Added splash build-version label and startup preload improvements.
- Applied in-game comic/cel visual pass and targeted FX follow-up fixes.
- Validation:
  - `astro-party`: repeated `bun run build` passes across milestones.

## 2026-02-26 - Documentation Governance and Structure

- Split docs by ownership:
  - `AGENTS.md` for policy,
  - `ARCHITECTURE.md` for topology/ownership,
  - `.agents/learning.md` for anti-repeat learnings.
- Added and then removed local governance hash-drift tooling after identifying source-of-truth mismatch.
- Kept context-bootstrap and architecture-hydration guardrails as active process policy.
- Moved learning log under `.agents/` and updated references.
- Validation:
  - Docs-only milestones noted where runtime validation was intentionally not rerun.

## 2026-02-26 - Server Loadtest, Monitor, and Deploy Tooling Consolidation

- Added minimal room-code loadtest path, then hardened pause/resume/disconnect handling.
- Added and refined lobby-fill loadtest runner; corrected create/join parity with game matchmaking.
- Added Colyseus monitor integration with optional auth and safer enablement behavior.
- Added `/ops/stats` instrumentation and capacity sweep runner with staged reporting.
- Hardened deploy scripts (preflight checks, branch handling, install-mode fallback, health/ops checks).
- Added monitor setup helper/reference scripts and docs.
- Validation:
  - `astro-party/server`: `npm run typecheck` and `npm run build` passed for code/tooling milestones.
  - Script-template-only updates were documented as not executed in-workspace.

## 2026-02-27 - Observability and Correlated Incident Workflow

- Added richer loadtest disconnect/error telemetry with absolute timestamps.
- Extended server leave diagnostics and `/ops/stats` consented/unconsented leave tracking.
- Added monitoring command reference for PM2, ops stats, host load, and correlation workflows.
- Implemented observed-run pipeline:
  - droplet observer capture,
  - parser/index builder,
  - static dashboard with run comparison and anomaly cards.
- Validation:
  - `astro-party/server`: `npm run typecheck` passed.
  - `astro-party/server`: `npm run build` passed.
  - `astro-party/server`: `npm run observed:index` passed.
  - `astro-party`: `bun run build` passed.
  - `astro-party`: `bun run typecheck` failed due pre-existing `src/demo/DemoOverlayUI.ts` timeout typing mismatch.

## 2026-02-28 - Guardrail promotion + progress workflow + orientation ownership update

- Promoted repeated learnings into concrete `AGENTS.md` guardrails:
  - shared coarse-pointer tap guard requirement
  - coherent responsive planning before micro-patch loops
  - loadtest objective declaration (`parity` vs `observability`)
  - source-of-truth validation before policy automation
- Updated `progress.md` contract to a two-layer model:
  - active task threads for planned prompts (living updates)
  - append-only milestone journal for shipped outcomes
- Updated `ARCHITECTURE.md` ownership contract:
  - platform now owns forced landscape orientation
  - client UI owns safe-area/top-HUD-aware placement for both landscape directions
- Validation:
  - Docs-only update; no runtime commands rerun.

## 2026-02-28 - Reusable "agent doc cleanup activity" workflow added

- Added a named reusable activity section in `AGENTS.md`:
  - trigger phrase
  - execution rule
  - required inputs
  - workflow checklist
  - required outputs
  - done criteria
- Goal:
  - allow shorthand invocation ("agent doc cleanup activity") to run the full policy/architecture/progress cleanup flow.
- Validation:
  - Docs-only update; no runtime commands rerun.

## 2026-02-28 - Reusable activity flow made explicit (`progress -> learning -> AGENTS`)

- Tightened `AGENTS.md` reusable cleanup workflow so it now explicitly requires:
  - extracting recurring issues from `progress.md`
  - distilling/recording them in `.agents/learning.md`
  - promoting stable guardrails into `AGENTS.md`
- Added required output traceability note:
  - promotion mapping must be documented as `progress -> learning -> AGENTS`
- Validation:
  - Docs-only update; no runtime commands rerun.
