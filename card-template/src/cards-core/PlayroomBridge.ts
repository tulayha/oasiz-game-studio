/**
 * PlayroomBridge.ts
 * ─────────────────
 * All PlayroomKit wiring in one place.
 * Neither renderer imports playroomkit directly — they receive a bridge instance.
 *
 * State polling pattern: 100ms setInterval diffs against a shadow object
 * and fires registered callbacks on change.
 */

import { oasiz } from "@oasiz/sdk";
import type { CardFace, CardGamePhase, LocalCard, PlayerState } from "./types";
import type { CardGameEngine } from "./CardGameEngine";

// ── Minimal mirror of the playroomkit public API ──────────────────────────────

interface PrPlayer {
  id: string;
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown, reliable?: boolean) => void;
  onQuit: (cb: () => void) => void;
}

interface PlayroomKit {
  insertCoin: (opts: object) => Promise<void>;
  myPlayer: () => PrPlayer;
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown, reliable?: boolean) => void;
  onPlayerJoin: (cb: (p: PrPlayer) => void) => void;
  isHost: () => boolean;
  getRoomCode: () => string;
}

// ── Callback interface ────────────────────────────────────────────────────────

export interface BridgeCallbacks {
  onTurnChange: (playerId: string) => void;
  onDiscardTopChange: (card: CardFace | null) => void;
  onDeckCountChange: (count: number) => void;
  onOpponentHandCountChange: (playerId: string, count: number) => void;
  onGamePhaseChange: (phase: CardGamePhase) => void;
  onPlayersUpdate: (players: PlayerState[]) => void;
}

// ── Bridge ────────────────────────────────────────────────────────────────────

export class PlayroomBridge {
  private pr: PlayroomKit | null = null;
  private pollInterval = 0;
  private shadow: Record<string, unknown> = {};
  private players: PrPlayer[] = [];
  private callbacks: BridgeCallbacks | null = null;
  private engine: CardGameEngine | null = null;

  // ── Connection ──────────────────────────────────────────────────────────────

  async connect(roomCode: string | null, options?: { avatars?: string[] }): Promise<void> {
    const mod = await import("playroomkit") as unknown as PlayroomKit;
    this.pr = mod;

    await mod.insertCoin({
      skipLobby: true,
      maxPlayersPerRoom: 4,
      ...(roomCode ? { roomCode } : {}),
      ...(options?.avatars?.length ? { avatars: options.avatars } : {}),
      defaultPlayerStates: {
        handCount: 8,
        playerName: "",
        playerAvatar: null,
        isReady: false,
      },
    });

    mod.onPlayerJoin((player) => {
      this.players.push(player);
      this.emitPlayersUpdate();

      player.onQuit(() => {
        this.players = this.players.filter(p => p.id !== player.id);
        this.emitPlayersUpdate();
        if (this.pr?.isHost() && this.pr.getState("currentTurn") === player.id) {
          this.advanceTurnFrom(player.id);
        }
      });
    });

    oasiz.shareRoomCode(mod.getRoomCode());
  }

  // ── Polling init ────────────────────────────────────────────────────────────

  init(callbacks: BridgeCallbacks, engine?: CardGameEngine | null): void {
    this.callbacks = callbacks;
    this.engine = engine ?? null;
    this.shadow = {};
    if (this.pollInterval) window.clearInterval(this.pollInterval);
    this.pollInterval = window.setInterval(() => this.poll(), 100);
  }

  setEngine(engine: CardGameEngine | null): void {
    this.engine = engine;
  }

  /** Request to draw a card (my turn only). Returns the new card or null. */
  requestDraw(): LocalCard | null {
    if (!this.engine || !this.isMyTurn()) {
      oasiz.triggerHaptic("error");
      return null;
    }
    const card = this.engine.drawCard();
    this.setHandCount(this.engine.handCount);
    this.decrementDeckCount();
    oasiz.triggerHaptic("medium");
    return card;
  }

  /** Request to play the card at index (my turn only). Returns the card or null. */
  requestThrow(index: number): LocalCard | null {
    if (!this.engine || !this.isMyTurn()) {
      oasiz.triggerHaptic("error");
      return null;
    }
    const card = this.engine.playCard(index);
    this.setHandCount(this.engine.handCount);
    this.setDiscardTop(card);
    // Signal turn done — host picks this up in poll() and advances for everyone.
    this.pr?.setState("turnDoneBy", this.getMyId(), true);
    oasiz.triggerHaptic("medium");
    return card;
  }

  /** Leave the room and clear connection. */
  leaveRoom(): void {
    window.clearInterval(this.pollInterval);
    this.pollInterval = 0;
    this.pr = null;
    this.players = [];
    this.callbacks = null;
    this.engine = null;
    this.shadow = {};
    oasiz.shareRoomCode(null);
  }

  // ── Read helpers ────────────────────────────────────────────────────────────

  getRoomCode(): string { return this.pr?.getRoomCode() ?? ""; }
  isHost(): boolean { return this.pr?.isHost() ?? false; }
  isMyTurn(): boolean {
    if (!this.pr) return false;
    return this.pr.getState("currentTurn") === this.pr.myPlayer().id;
  }
  getMyId(): string { return this.pr?.myPlayer().id ?? ""; }

  getPlayers(): PlayerState[] {
    return this.players.map(p => ({
      id: p.id,
      handCount: (p.getState("handCount") as number) ?? 0,
      playerName: (p.getState("playerName") as string) ?? "",
      playerAvatar: (p.getState("playerAvatar") as string | null) ?? null,
      isReady: (p.getState("isReady") as boolean) ?? false,
    }));
  }

  // ── Host-only: room state mutations ────────────────────────────────────────

  initializeDeck(deckCount: number): void {
    if (!this.pr?.isHost()) return;
    this.pr.setState("deckCount", deckCount, true);
    this.pr.setState("currentTurn", this.players[0]?.id ?? "", true);
    this.pr.setState("discardTopCard", null, true);
    this.pr.setState("gamePhase", "playing", true);
  }

  advanceTurnFrom(currentPlayerId: string): void {
    if (!this.pr || !this.pr.isHost()) return;
    // Guard: bail if it's no longer this player's turn (prevents duplicate advances)
    if ((this.pr.getState("currentTurn") as string) !== currentPlayerId) return;
    const idx = this.players.findIndex(p => p.id === currentPlayerId);
    if (idx === -1) return;
    const next = this.players[(idx + 1) % this.players.length];
    if (next) this.pr.setState("currentTurn", next.id, true);
  }

  decrementDeckCount(): void {
    if (!this.pr) return;
    const cur = (this.pr.getState("deckCount") as number) ?? 0;
    this.pr.setState("deckCount", Math.max(0, cur - 1), true);
  }

  setGamePhase(phase: CardGamePhase): void {
    this.pr?.setState("gamePhase", phase, true);
  }

  // ── Per-player state mutations ──────────────────────────────────────────────

  setHandCount(count: number): void {
    this.pr?.myPlayer().setState("handCount", count, true);
  }

  setDiscardTop(card: CardFace | null): void {
    this.pr?.setState("discardTopCard", card, true);
  }

  setReady(ready: boolean): void {
    this.pr?.myPlayer().setState("isReady", ready, true);
  }

  setPlayerName(name: string): void {
    this.pr?.myPlayer().setState("playerName", name, true);
  }

  setPlayerAvatar(url: string | null): void {
    this.pr?.myPlayer().setState("playerAvatar", url, true);
  }

  // ── Polling ─────────────────────────────────────────────────────────────────

  private poll(): void {
    if (!this.pr || !this.callbacks) return;
    const cb = this.callbacks;

    this.checkKey("currentTurn", v => cb.onTurnChange(v as string));
    this.checkKey("discardTopCard", v => cb.onDiscardTopChange(v as CardFace | null));
    this.checkKey("deckCount", v => cb.onDeckCountChange(v as number));
    this.checkKey("gamePhase", v => cb.onGamePhaseChange(v as CardGamePhase));

    // Host is the single authority on turn advancement.
    // When any player signals "turnDoneBy", the host advances from that player.
    this.checkKey("turnDoneBy", (v) => {
      if (this.pr?.isHost()) {
        this.advanceTurnFrom(v as string);
      }
    });

    // Per-player hand counts (skip self)
    const myId = this.pr.myPlayer().id;
    let playersChanged = false;
    for (const player of this.players) {
      if (player.id !== myId) {
        const key = `hc_${player.id}`;
        const val = (player.getState("handCount") as number) ?? 0;
        if (this.shadow[key] !== val) {
          this.shadow[key] = val;
          cb.onOpponentHandCountChange(player.id, val);
        }
      }
      const readyKey = `ready_${player.id}`;
      const readyVal = (player.getState("isReady") as boolean) ?? false;
      if (this.shadow[readyKey] !== readyVal) {
        this.shadow[readyKey] = readyVal;
        playersChanged = true;
      }
    }
    if (playersChanged) this.emitPlayersUpdate();
  }

  private checkKey(key: string, cb: (v: unknown) => void): void {
    const val = this.pr!.getState(key);
    if (this.shadow[key] !== val) {
      this.shadow[key] = val;
      cb(val);
    }
  }

  private emitPlayersUpdate(): void {
    this.callbacks?.onPlayersUpdate(this.getPlayers());
  }

  // ── Teardown ────────────────────────────────────────────────────────────────

  destroy(): void {
    this.leaveRoom();
  }
}
