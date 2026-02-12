# Astro Party Colyseus Server

Server-authoritative multiplayer backend for `unfinished-games/astro-party`.

## Local Run

```bash
npm install
npm run dev
```

Default port is `2567`.

## HTTP API

- `GET /healthz`
- `POST /match/create` with optional `{ "playerName": "..." }`
- `POST /match/join` with `{ "roomCode": "ABCD", "playerName": "..." }`

Both create/join return a Colyseus seat reservation consumed by the web client.

## Docker

```bash
docker compose up --build -d
```

## Droplet Notes

1. Terminate TLS on a reverse proxy (Nginx/Caddy/Traefik).
2. Proxy both HTTP and WebSocket traffic to the container on port `2567`.
3. Expose `wss://` URL to the game client through environment config.

