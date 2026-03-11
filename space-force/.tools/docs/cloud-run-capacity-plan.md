# Space Force Cloud Run Capacity Plan

## Purpose
Move from a single-instance Cloud Run setup with unknown headroom to a measured, repeatable capacity envelope and a clear path to safe multi-instance scaling.

## Current State (As-Is)
- Cloud Run max instances is effectively constrained to 1 to avoid room-code routing issues.
- Room code lookup is process-local in-memory (`server/src/http/roomCodeRegistry.ts`), so cross-instance joins are not reliable.
- Capacity limits per instance are not yet measured from production-like load.

## Target State (To-Be)
1. A validated per-instance capacity number (active websocket clients) with safety margin.
2. A documented production envelope (connections and full rooms) for current single-instance mode.
3. A follow-up migration plan to safely support multiple instances.

## Phase 0: Lock a Safe Baseline
Apply explicit Cloud Run settings (do not rely on defaults):
- `--max-instances=1`
- `--cpu=1`
- `--memory=2Gi`
- `--concurrency=40`
- `--timeout=3600`
- Optional: `--min-instances=1` for lower cold-start impact.

Example deploy update:
```bash
gcloud run services update <SERVICE_NAME> \
  --region=<REGION> \
  --platform=managed \
  --max-instances=1 \
  --cpu=1 \
  --memory=2Gi \
  --concurrency=40 \
  --timeout=3600
```

## Phase 1: Measure Capacity (Single Instance)
Run staged load tests from a separate load-generator host.

### 1) Capacity Sweep
From `space-force/server`:
```bash
npm run loadtest:capacity -- \
  --runner lobbyfill \
  --endpoint wss://<SERVICE_URL> \
  --stages 8,16,24,32,40,48,56,64 \
  --usersPerRoom 4 \
  --durationSec 300 \
  --cooldownSec 30
```

### 2) Observe Runtime Health During Each Stage
Track:
- `clients.active`
- `clients.leftUnconsentedTotal`
- `rttMs.p95`
- `process.rssBytes`
- `process.heapUsedBytes`
- disconnect/error counts from loadtest logs

Use:
- `/ops/stats`
- `npm run loadtest:observed` when deeper correlation is needed

### 3) Stage Pass Criteria
A stage passes only if all are true:
- `failedJoins = 0`
- no burst of abnormal disconnects (1006 spikes)
- `leftUnconsentedTotal` stays flat (or near-flat with explained noise)
- `rttMs.p95` remains under agreed SLO (start with `<120ms`)
- memory remains comfortably below limit (no OOM/restart)

### 4) Define Practical Capacity
- `hard_capacity = highest passing stage`
- `prod_capacity = floor(hard_capacity * 0.7)` (30% headroom)
- `full_rooms_capacity = floor(prod_capacity / 4)`

Record these values in this file after first full run.

## Phase 2: Operationalize and Guardrails
1. Bake explicit Cloud Run runtime flags into `cloudbuild.yaml` deploy step.
2. Keep capacity sweep command and pass/fail rubric as release checklist for server-impacting changes.
3. Alert on:
- unconsented leave spikes
- memory growth trend
- repeated abnormal disconnect codes

## Phase 3: Enable Multi-Instance Safely
Required before increasing `max-instances` above 1:
1. Move room-code registry to shared store (Redis/Memorystore or equivalent).
2. Ensure room discovery/presence is shared across instances.
3. Re-run capacity validation in multi-instance mode.
4. Increase `max-instances` gradually and verify join correctness + stability.

## Rollback Plan
If any deployment degrades stability:
1. Revert to last known-good revision.
2. Re-apply prior Cloud Run resource/concurrency values.
3. Re-run a reduced sweep (`8,16,24`) to confirm baseline recovery.

## Execution Checklist
- [ ] Apply explicit Cloud Run baseline settings.
- [ ] Run first full staged sweep.
- [ ] Compute and document hard/prod capacity numbers.
- [ ] Add deploy flag pinning in CI/CD.
- [ ] Add basic operational alert thresholds.
- [ ] Plan and schedule shared room-code registry migration.
