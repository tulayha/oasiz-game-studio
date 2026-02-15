import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { AstroPartyRoom } from "./rooms/AstroPartyRoom.js";
import {
  generateUniqueRoomCode,
  getRoomIdByCode,
  normalizeRoomCode,
  registerRoomCode,
} from "./http/roomCodeRegistry.js";

const port = Number.parseInt(process.env.PORT ?? "2567", 10);
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const maxPlayers = Number.parseInt(process.env.MAX_PLAYERS ?? "4", 10);
const simTickHz = Number.parseInt(process.env.SIM_TICK_HZ ?? "60", 10);
const snapshotHz = Number.parseInt(process.env.SNAPSHOT_HZ ?? "20", 10);
const roomCodeLength = Number.parseInt(process.env.ROOM_CODE_LENGTH ?? "4", 10);

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

gameServer.define("astro_party", AstroPartyRoom);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/match/create", async (req, res) => {
  try {
    const playerName =
      typeof req.body?.playerName === "string" ? req.body.playerName : undefined;
    const roomCode = generateUniqueRoomCode(roomCodeLength);
    const room = await matchMaker.createRoom("astro_party", {
      roomCode,
      maxPlayers,
      simTickHz,
      snapshotHz,
    });
    registerRoomCode(room.roomId, roomCode);
    const seatReservation = await matchMaker.joinById(room.roomId, {
      playerName,
    });

    res.json({
      roomCode,
      roomId: room.roomId,
      seatReservation,
    });
  } catch (error) {
    console.error("[Server] Failed to create match", error);
    res.status(500).json({
      error: "CREATE_FAILED",
      message: "Failed to create room",
    });
  }
});

app.post("/match/join", async (req, res) => {
  try {
    const code =
      typeof req.body?.roomCode === "string"
        ? normalizeRoomCode(req.body.roomCode)
        : "";
    if (code.length < roomCodeLength) {
      res.json({
        ok: false,
        error: "INVALID_CODE",
        message: "Room code is invalid",
      });
      return;
    }

    const roomId = getRoomIdByCode(code);
    if (!roomId) {
      res.json({
        ok: false,
        error: "NOT_FOUND",
        message: "Room not found",
      });
      return;
    }

    const playerName =
      typeof req.body?.playerName === "string" ? req.body.playerName : undefined;
    const seatReservation = await matchMaker.joinById(roomId, {
      playerName,
    });

    res.json({
      ok: true,
      roomCode: code,
      roomId,
      seatReservation,
    });
  } catch (error) {
    console.error("[Server] Failed to join match", error);
    res.status(409).json({
      error: "JOIN_FAILED",
      message: "Could not join room",
    });
  }
});

httpServer.listen(port, () => {
  console.log("[Server] Astro Party Colyseus server listening on port", port);
});

