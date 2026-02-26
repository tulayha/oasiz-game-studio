# Astro Party Server

Authoritative multiplayer backend for Astro Party.

## Responsibilities

- Hosts Colyseus room `astro_party`.
- Runs fixed-step simulation and broadcasts snapshots/events.
- Exposes matchmaking and health HTTP endpoints.
- Exposes Colyseus monitor dashboard endpoint.
- Tracks room codes for friend joins.

## Stack

- Node.js + TypeScript
- Colyseus (`colyseus`, `@colyseus/ws-transport`)
- Colyseus Monitor (`@colyseus/monitor`)
- Express (`/healthz`, `/match/create`, `/match/join`)

## Run locally

```bash
cd astro-party/server
npm install
npm run dev
```

Build/start:

```bash
cd astro-party/server
npm run build
npm run start
```

Default port is `2567`.

## Load testing

This server includes a minimal Colyseus load-test harness powered by `@colyseus/loadtest`.

Run from `astro-party/server`:

```bash
npm run loadtest -- --roomCode BJ9H --numClients 24 --delay 20 --durationSec 90
```

Or from game root (`astro-party/`):

```bash
npm run loadtest:roomcode -- --roomCode BJ9H --numClients 24 --delay 20 --durationSec 90
```

Behavior:

- each client joins the exact room code via `/match/join` + seat reservation consume
- input spam starts only in `PLAYING`, pauses in other phases, and resumes when `PLAYING` returns
- reads `evt:snapshot` payloads and discards them (with metrics)
- sends `cmd:input` (`buttonA` + `buttonB`) at default client debounce (`1000/60`), aligned to server `tickDurationMs` when available
- on room errors, attempts a graceful leave (`leave(false)`) and relies on `onLeave` for terminal cleanup

Useful flags:

- `--roomCode <ABCD>` (required)
- `--numClients <n>`
- `--delay <ms>`
- `--durationSec <n>` / `--durationMs <n>`
- `--requestTimeoutMs <n>` (default `15000`)
- `--summaryIntervalMs <n>` (default `5000`)
- `--inputDebounceMs <n>` (default `16.666...`)
- `--autoExitOnComplete true|false` (default `true` when duration is set)

Endpoint resolution:

- If `--endpoint` is provided, it is used.
- Otherwise, `VITE_COLYSEUS_WS_URL` must be set.
- If neither is available, loadtest exits with an error.

Output logs:

- If `--output <path>` is provided, that path is used.
- If `--output` is omitted, the launcher writes to:
  - `./loadtest-logs/loadtest-roomcode-YYYYMMDD-HHmmss.log`
- The launcher prints the chosen path on startup:
  - `[LoadTest.run-roomcode] Using output log <path>`

Environment variable equivalents:

- `LOADTEST_ROOM_CODE`
- `LOADTEST_REQUEST_TIMEOUT_MS`
- `LOADTEST_DURATION_SEC` / `LOADTEST_DURATION_MS`
- `LOADTEST_AUTO_EXIT_ON_COMPLETE`
- `LOADTEST_SUMMARY_INTERVAL_MS`
- `LOADTEST_INPUT_DEBOUNCE_MS`

Implementation files:

- `loadtest/minimal-roomcode.loadtest.ts`
- `loadtest/run-roomcode-loadtest.ts`

## Colyseus Monitor

The server mounts Colyseus Monitor on the same HTTP server.

Default behavior:

- enabled automatically when `NODE_ENV` is not `production`
- default path is `/colyseus`
- in `production`, set `COLYSEUS_MONITOR_ENABLED=true` to enable

Quick local usage:

```bash
cd astro-party/server
npm run dev
# open http://localhost:2567/colyseus
```

Optional password protection (Basic Auth):

- set both `COLYSEUS_MONITOR_USERNAME` and `COLYSEUS_MONITOR_PASSWORD`
- if only one is set, monitor is disabled for safety

PowerShell example:

```powershell
cd astro-party/server
$env:COLYSEUS_MONITOR_ENABLED="true"
$env:COLYSEUS_MONITOR_USERNAME="admin"
$env:COLYSEUS_MONITOR_PASSWORD="change-me"
npm run dev
```

## Validation snapshot (February 23, 2026)

- `cd astro-party/server && npm run typecheck`: passes.
- `cd astro-party/server && npm run build`: passes.
- `cd astro-party/server && npm run start`: uses compiled entry `dist/server/src/index.js`.

## Environment variables

These are read from `process.env`.

`npm run dev` and `npm run start` load `.env` from `astro-party/server/.env` via Node's `--env-file-if-exists=.env`.

There is currently no `astro-party/server/.env.example`; create `.env` manually if you want file-based local overrides.

Shell-provided environment variables still work and take precedence over `.env`.

- `PORT` (default: `2567`)
- `CORS_ORIGIN` (default: `*`)
- `MAX_PLAYERS` (default: `4`)
- `SIM_TICK_HZ` (default: `60`)
- `ROOM_CODE_LENGTH` (default: `4`)
- `SNAPSHOT_HZ_LOBBY` (default: `12`, capped at tick rate)
- `CLIENT_MAX_OUTBOUND_BUFFER_BYTES` (default: `262144`)
- `WS_MAX_PAYLOAD_BYTES` (default: `262144`)
- `COLYSEUS_MONITOR_ENABLED` (default: `true` outside production, `false` in production)
- `COLYSEUS_MONITOR_PATH` (default: `/colyseus`)
- `COLYSEUS_MONITOR_USERNAME` (optional; requires password too)
- `COLYSEUS_MONITOR_PASSWORD` (optional; requires username too)
- `DEBUG_TOOLS_ENABLED` (default: `false`)

## Debug tools

Debug commands are enabled only when both server and client gates are enabled.

### 1) Enable on server

Set `DEBUG_TOOLS_ENABLED=true` in the server process environment.

PowerShell:

```powershell
cd astro-party/server
$env:DEBUG_TOOLS_ENABLED="true"
npm run dev
```

Bash:

```bash
cd astro-party/server
DEBUG_TOOLS_ENABLED=true npm run dev
```

If your deploy runner does not use `.env`, set `DEBUG_TOOLS_ENABLED=true` in the process environment.
If you run the server with custom commands (not `npm run dev` / `npm run start`), pass envs explicitly or include `--env-file-if-exists=.env`.

### 2) Enable on client

Client debug tools are enabled in either case:

- Running a dev build (`import.meta.env.DEV === true`)
- `VITE_QA_DEBUG_TOOLS=true`

### 3) In-game debug keys

- `0` toggle dev visualization
- `1` Laser
- `2` Shield
- `3` Scatter
- `4` Mine
- `5` Reverse
- `6` Joust
- `7` Homing missile
- `9` Spawn random power-up

## HTTP API

- `GET /healthz` -> `{ ok: true }`
- `POST /match/create`
  - body: `{ "playerName"?: string }`
  - returns: `{ roomCode, roomId, seatReservation }`
- `POST /match/join`
  - body: `{ "roomCode": string, "playerName"?: string }`
  - returns success payload: `{ ok: true, roomCode, roomId, seatReservation }`
  - invalid/missing/locked room code cases return `{ ok: false, error, message }`
  - unexpected join failures return HTTP `409` with `{ error: "JOIN_FAILED", message }`

## Deploy note

`server-deploy-script.txt` contains a PM2-based deployment script used in production workflows.
