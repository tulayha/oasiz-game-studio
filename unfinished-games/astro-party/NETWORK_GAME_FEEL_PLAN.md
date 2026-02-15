# Astro Party — Network Game Feel Improvement Plan (Practical Flow)

This is a practical, implementation-oriented design for improving game feel in **Astro Party** under high latency (up to ~400ms RTT), without changing the host-authoritative security model.

## 1) Quick evaluation of current behavior

Current architecture is already host-authoritative and uses 20Hz unreliable snapshots (`SYNC_INTERVAL: 50ms`) with a display smoother for remote entities.

That means:
- Remote visuals are relatively smooth.
- But non-host **self-control** still feels delayed because player input must round-trip through host authority before the player sees their own ship react.
- At ~400ms RTT, effective self-input delay can become "unplayably heavy" for dodge/fire timing.

## 2) Target feel at 400ms RTT

Design goal:
- Keep host authoritative truth for fairness.
- Make local player feel immediate (<1 frame to react on their own screen).
- Keep remote players stable and readable (few warps, low jitter).
- Make correction errors understandable (small nudges, not hard snaps).

The solution is a hybrid:
1. **Remote interpolation** for everyone you do *not* control locally.
2. **Local prediction + reconciliation** for your own controlled ship/pilot.
3. **Server-side lag handling** for time-sensitive actions (shots, dashes, collisions) so high-ping players are not unfairly punished.

---

## 3) Practical runtime flow

## A. Input pipeline (local prediction path)

For the local player (non-host):
1. Player presses/holds A/B (or dash trigger).
2. Input is tagged with a monotonic `inputSequence` and local timestamp.
3. Input is sent to host on the existing fast channel.
4. **Immediately** (same frame), client applies that input to a local predicted simulation for their own ship/pilot.
5. Client stores input in a short history buffer (sequence + input + delta time used).

Effect: local player sees immediate turning/thrust/recoil intent, instead of waiting for round trip.

## B. Host authority pipeline

On host:
1. Host receives input stream (possibly late/out-of-order).
2. Host applies most recent valid input per player in its authoritative 60fps simulation.
3. Host snapshots include:
   - Authoritative transform/velocity.
   - Last processed `inputSequence` for each player.
4. Host continues broadcasting snapshots at fixed rate.

Effect: host stays source of truth; clients can reconcile precisely.

## C. Reconciliation flow (for self entity)

When non-host receives authoritative state for its own ship:
1. Read host-confirmed `lastProcessedInputSequence`.
2. Remove acknowledged inputs from local history.
3. Snap local *simulation state* to authoritative baseline (small hidden correction).
4. Re-simulate remaining unacknowledged inputs from history to "catch up".
5. Render from corrected predicted state.

If error is tiny: smooth it over a few frames.
If error is large (e.g., collision/death): do controlled hard correction with strong FX/audio cue so it feels intentional.

## D. Remote entity path (interpolation-first)

For all non-owned entities (other ships, projectiles, pilots):
1. Keep a small snapshot buffer (time-ordered).
2. Render at `now - interpolationDelay` (typically 100–180ms, adaptive to jitter).
3. Interpolate between two authoritative snapshots around that render time.
4. Use short extrapolation only when packet gap exceeds buffer (bounded horizon).

Why this helps at 400ms RTT:
- You intentionally render remote players slightly in the past to avoid jitter/jumps.
- Motion becomes more consistent and readable, even if absolute freshness is lower.

## E. Action handling (fire/dash/hit feel)

### Fire
- Local player should get immediate local muzzle flash/recoil/sfx (predicted cosmetic feedback).
- Projectile/hit authority remains host-side.
- If host rejects/changes outcome, client corrects projectile timeline subtly.

### Dash
- Local dash starts instantly as predicted movement burst.
- Host validates cooldown/state and either confirms or corrects.
- Reconciliation must prioritize dash continuity (never stutter mid-dash).

### Damage/death
- Never finalize death purely client-side.
- Client may show "pre-hit" feedback quickly, but elimination state flips only on host confirmation.

---

## 4) Interpolation tuning strategy for Astro Party

Given fast ship motion + arena collisions:
- Start interpolation delay around 120ms.
- Raise toward 160–200ms when jitter spikes.
- Lower toward 80–100ms on clean links.

Per-entity behavior:
- **Remote ships/pilots**: interpolation with gentle velocity-assisted blending.
- **Projectiles**: interpolation + short extrapolation cap (projectiles are fast; avoid long blind extrapolation).
- **Static/slow objects** (powerups/mines before trigger): snap or very light smoothing.

Key principle: self entity prioritizes responsiveness (prediction), remote entities prioritize stability (interpolation).

## 5) Reconciliation error budget (what feels good)

Define practical correction thresholds:
- Tiny error: fully smooth, invisible.
- Medium error: quick nudge over 2–5 frames.
- Large error: hard correction with explicit feedback (impact flash/shake/sfx) to preserve trust.

At high RTT, the main UX win is reducing *frequency* and *surprise* of large corrections.

## 6) Fairness under high RTT (lag-aware authority)

To keep 300–400ms players competitive:
- Host tracks per-player latency estimate.
- For hit-sensitive checks (especially projectile-vs-ship), host evaluates against a short historical transform window (rewind/lag compensation window with strict max bound).
- Keep bounds conservative to prevent abuse.

This avoids "I was already clear on my screen" frustration while preserving anti-cheat authority.

## 7) Rollout plan (low-risk sequence)

Phase 1 — **Remote interpolation buffer upgrade**
- Add snapshot buffering + interpolation delay control.
- Keep existing authority and game rules unchanged.

Phase 2 — **Local prediction for self movement only**
- Predict rotation/thrust for own ship/pilot.
- Add input sequence + reconciliation.
- Keep combat outcomes host-only.

Phase 3 — **Predicted local feedback for actions**
- Immediate local fire/dash VFX/SFX.
- Still host-authoritative projectile/hit resolution.

Phase 4 — **Lag-aware host validation**
- Add bounded rewind checks for hit fairness.
- Instrument and tune with live metrics.

## 8) What to measure while tuning

Track these metrics in telemetry overlay/logs:
- RTT (avg, p95), jitter.
- Snapshot gap variance.
- Reconciliation corrections: count, average magnitude, max magnitude.
- Number of hard snaps per minute.
- Time from input press to local visual response.
- Time from input press to host confirmation.

Success signal:
- Input feels immediate locally even at 300–400ms RTT.
- Remote motion is readable and mostly warp-free.
- Hard corrections are rare and understandable.
