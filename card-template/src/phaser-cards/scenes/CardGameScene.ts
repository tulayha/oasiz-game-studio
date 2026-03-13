/**
 * CardGameScene.ts
 * ─────────────────
 * Main scene: table, opponent fans, local fan, fly layer, HUD.
 * Reads all shared state from game.registry (set by PhaserCardGame before boot).
 *
 * Phase 2: Layout calc + background + layer containers.
 * Phase 3: PhaserTable with deck/discard.
 * Phase 5: PhaserLocalFan with draw/throw and drag-to-throw.
 * Phase 6: PhaserOpponentFan per slot.
 * Phase 7: PhaserTurnHUD (glow ring, YOUR TURN banner, local player pill).
 * Phase 8: Full bridge.init() wiring — turn, discard, deck, hand counts, phase, players.
 * Phase 9: Background image preload with gradient fallback.
 */

import Phaser from "phaser";
import { oasiz } from "@oasiz/sdk";
import type { TableConfig, TableZone } from "../../cards-core/types";
import type { PlayroomBridge } from "../../cards-core/PlayroomBridge";
import type { CardGameEngine } from "../../cards-core/CardGameEngine";
import { PhaserTable } from "../PhaserTable";
import { PhaserLocalFan } from "../PhaserLocalFan";
import { PhaserOpponentFan, type OpponentSlot } from "../PhaserOpponentFan";
import { PhaserTurnHUD, type HudSlot } from "../PhaserTurnHUD";
import { CARD_W, CARD_H } from "../constants";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export interface CardLayout {
  slotA_x: number; slotA_y: number;
  slotB_x: number; slotB_y: number;
  slotC_x: number; slotC_y: number;
  tableCenterY: number;
  deckCenterX: number;
  playCenterX: number;
  localFanX: number;
  localFanY: number;
  fanRadius: number;
}

export class CardGameScene extends Phaser.Scene {
  // Layers — populated in create()
  protected backgroundLayer!: Phaser.GameObjects.Container;
  protected tableLayer!: Phaser.GameObjects.Container;
  protected opponentLayer!: Phaser.GameObjects.Container;
  protected localFanLayer!: Phaser.GameObjects.Container;
  protected flyLayer!: Phaser.GameObjects.Container;
  protected hudLayer!: Phaser.GameObjects.Container;

  // Game objects
  protected table!: PhaserTable;
  protected localFan!: PhaserLocalFan;
  protected opponentFans!: Map<OpponentSlot, PhaserOpponentFan>;
  protected turnHUD!: PhaserTurnHUD;

  /** Prevents queuing multiple draw animations simultaneously. */
  protected _drawLocked = false;

  // ── Debug hitbox overlay ────────────────────────────────────────────────────
  private _debugGfx!: Phaser.GameObjects.Graphics;
  private _debugBtn!: Phaser.GameObjects.Text;
  private _debugEnabled = false;

  // Shared state from registry
  protected config!: TableConfig;
  protected bridge!: PlayroomBridge;
  protected engine!: CardGameEngine;
  protected settings!: Settings;
  protected onGamePhaseChange?: (phase: string) => void;

  // Layout computed once per size
  protected layout!: CardLayout;
  protected zones!: TableZone[];

  constructor() {
    super({ key: "CardGameScene" });
  }

  // ── Phase 9: try loading a custom background image ─────────────────────────
  preload(): void {
    // Silently fails if the file doesn't exist — gradient fallback handles it
    this.load.image("bg", "/assets/background.png");
  }

  create(): void {
    // ── Read shared state from registry ──────────────────────────────────────
    this.config = this.registry.get("tableConfig") as TableConfig;
    this.bridge = this.registry.get("bridge") as PlayroomBridge;
    this.engine = this.registry.get("engine") as CardGameEngine;
    this.settings = this.registry.get("settings") as Settings;
    this.onGamePhaseChange = this.registry.get("onGamePhaseChange") as ((phase: string) => void) | undefined;

    const W = this.scale.width;
    const H = this.scale.height;

    // ── Layer containers (order = z-order) ───────────────────────────────────
    this.backgroundLayer = this.add.container(0, 0);
    this.tableLayer = this.add.container(0, 0);
    this.opponentLayer = this.add.container(0, 0);
    this.localFanLayer = this.add.container(0, 0);
    this.flyLayer = this.add.container(0, 0);
    this.hudLayer = this.add.container(0, 0);

    // ── Background ───────────────────────────────────────────────────────────
    this.drawBackground(W, H);

    // ── Layout + zones ───────────────────────────────────────────────────────
    this.layout = this.calcLayout(W, H);
    this.zones = this.buildZones(this.layout);

    // ── Table ────────────────────────────────────────────────────────────────
    this.table = new PhaserTable(this, this.zones, this.config);
    this.table.onDrawRequest = () => this.onDrawRequest();
    this.tableLayer.add(this.table);

    // ── Local fan ────────────────────────────────────────────────────────────
    this.localFan = new PhaserLocalFan(
      this,
      this.layout.localFanX,
      this.layout.localFanY,
      this.layout.fanRadius,
      this.config.visualConfig,
      this.flyLayer,
    );
    this.localFan.onCardTap = (index, _face) => {
      const card = this.bridge.requestThrow(index);
      if (card) {
        const discardZone = this.zones.find((z) => z.key === "discard");
        const discardX = discardZone ? discardZone.x + CARD_W / 2 : this.layout.playCenterX;
        const discardY = discardZone ? discardZone.y + CARD_H / 2 : this.layout.tableCenterY;
        this.localFan.throwCard(index, discardX, discardY, () => {
          this.table.updateDiscardPile(card);
        });
      }
    };
    this.localFanLayer.add(this.localFan);

    // ── Opponent fans (slots A/B/C) ───────────────────────────────────────────
    this.opponentFans = new Map();
    const slotDefs: [OpponentSlot, number, number][] = [
      ["A", this.layout.slotA_x, this.layout.slotA_y],
      ["B", this.layout.slotB_x, this.layout.slotB_y],
      ["C", this.layout.slotC_x, this.layout.slotC_y],
    ];
    for (const [slot, ax, ay] of slotDefs) {
      const fan = new PhaserOpponentFan(this, slot, ax, ay, this.config.visualConfig);
      this.opponentFans.set(slot, fan);
      this.opponentLayer.add(fan);
    }

    // ── Turn HUD ──────────────────────────────────────────────────────────────
    this.turnHUD = new PhaserTurnHUD(this);
    this.hudLayer.add(this.turnHUD);
    this.turnHUD.setSlotPosition("local", this.layout.localFanX, this.layout.localFanY);
    this.turnHUD.setSlotPosition("A", this.layout.slotA_x, this.layout.slotA_y);
    this.turnHUD.setSlotPosition("B", this.layout.slotB_x, this.layout.slotB_y);
    this.turnHUD.setSlotPosition("C", this.layout.slotC_x, this.layout.slotC_y);

    // Local player identity (may be undefined in local dev)
    const localName = (typeof oasiz !== "undefined" ? oasiz.playerName : undefined) ?? "You";
    const localAvatar = (typeof oasiz !== "undefined" ? oasiz.playerAvatar : undefined) ?? null;
    this.turnHUD.setLocalPlayer(localName, localAvatar);

    // ── Dummy mode vs live bridge ─────────────────────────────────────────────
    const isDummy = (this.bridge as { isDummy?: boolean }).isDummy;
    if (isDummy) {
      for (const card of this.engine.getHand()) {
        this.localFan.addCard(card, this.table.deckCenterX, this.table.deckCenterY);
      }
      this.localFan.setInteractable(true);
      this.table.setDeckInteractable(false);
      this.turnHUD.setActiveTurn("local");
    } else {
      // Start locked — bridge callbacks will unlock on first turn event
      this.localFan.setInteractable(false);
      this.table.setDeckInteractable(false);
      this.initBridge();
    }

    // ── Scene-level input routing (all hits tested manually) ─────────────────
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      this.localFan.updateDrag(p.x, p.y);
      this.localFan.updateHighlight(p.x, p.y);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      // Priority: deck → fan (arrows + cards + scroll gesture)
      if (this.table.containsPoint(p.x, p.y)) {
        this.onDrawRequest();
      } else {
        this.localFan.handlePointerDown(p.x, p.y);
      }
    });
    this.input.on("pointerup", () => {
      this.localFan.endDrag();
    });

    // ── Debug hitbox overlay ─────────────────────────────────────────────────
    this._debugGfx = this.add.graphics();
    this._debugGfx.setDepth(9998);

    this._debugBtn = this.add.text(8, 8, "Hitboxes: OFF", {
      fontSize: "13px",
      color: "#ffffff",
      backgroundColor: "#000000cc",
      padding: { x: 8, y: 5 },
    });
    this._debugBtn.setDepth(9999);
    this._debugBtn.setScrollFactor(0);
    this._debugBtn.setInteractive({ useHandCursor: true });
    this._debugBtn.on("pointerdown", () => {
      this._debugEnabled = !this._debugEnabled;
      this._debugBtn.setText(this._debugEnabled ? "Hitboxes: ON" : "Hitboxes: OFF");
      this._debugBtn.setStyle({ color: this._debugEnabled ? "#00ff88" : "#ffffff" });
      if (!this._debugEnabled) this._debugGfx.clear();
    });

    // ── Resize ───────────────────────────────────────────────────────────────
    this.scale.on("resize", this.onResize, this);
  }

  // ── Draw request ───────────────────────────────────────────────────────────

  private onDrawRequest(): void {
    if (this._drawLocked) return;
    oasiz.triggerHaptic("medium");
    const card = this.bridge.requestDraw();
    if (card) {
      this._drawLocked = true;
      this.table.setDeckInteractable(false);
      this.localFan.addCard(card, this.table.deckCenterX, this.table.deckCenterY, () => {
        this._drawLocked = false;
        if (this.bridge.isMyTurn()) this.table.setDeckInteractable(true);
      });
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  /** Portrait-first layout — mirrors PixiCardGame.calcLayout exactly. */
  calcLayout(W: number, H: number): CardLayout {
    const isPortrait = H > W;
    if (isPortrait) {
      const slotA_y = H * 0.12;
      const slotBC_y = H * 0.28;
      const tableCenterY = H * 0.34;
      const localFanY = H * 0.94;
      return {
        slotA_x: W * 0.5, slotA_y,
        slotB_x: W * 0.12, slotB_y: slotBC_y,
        slotC_x: W * 0.88, slotC_y: slotBC_y,
        tableCenterY,
        deckCenterX: W * 0.38,
        playCenterX: W * 0.62,
        localFanX: W * 0.5,
        localFanY,
        fanRadius: 4.2,
      };
    }
    const slotA_y = (H * 0.2) * 0.5;
    const slotBC_y = H * 0.42;
    const tableCenterY = H * 0.46;
    const localFanY = H * 0.84;
    return {
      slotA_x: W * 0.5, slotA_y,
      slotB_x: W * 0.1, slotB_y: slotBC_y,
      slotC_x: W * 0.9, slotC_y: slotBC_y,
      tableCenterY,
      deckCenterX: W * 0.38,
      playCenterX: W * 0.62,
      localFanX: W * 0.5,
      localFanY,
      fanRadius: CARD_H * 3.5,
    };
  }

  buildZones(layout: CardLayout): TableZone[] {
    const deckX = layout.deckCenterX - CARD_W / 2;
    const deckY = layout.tableCenterY - CARD_H / 2;
    const discardX = layout.playCenterX - CARD_W / 2;
    const discardY = layout.tableCenterY - CARD_H / 2;
    return this.config.zones.map((z) => {
      if (z.key === "deck") return { ...z, x: deckX, y: deckY };
      if (z.key === "discard") return { ...z, x: discardX, y: discardY };
      return { ...z, x: layout.playCenterX - CARD_W / 2, y: layout.tableCenterY - CARD_H / 2 };
    });
  }

  // ── Background ─────────────────────────────────────────────────────────────

  private drawBackground(W: number, H: number): void {
    this.backgroundLayer.removeAll(true);

    // Phase 9: use /assets/background.png when available
    if (this.textures.exists("bg")) {
      const img = this.make.image({ key: "bg", add: false });
      img.setOrigin(0, 0);
      img.setDisplaySize(W, H);
      this.backgroundLayer.add(img);
      return;
    }

    // Fallback: two-tone gradient via graphics
    const c = this.config.visualConfig.backgroundColor;
    const r = Math.round(((c >> 16) & 0xff) * 0.5);
    const g = Math.round(((c >> 8) & 0xff) * 0.5);
    const b = Math.round((c & 0xff) * 0.5);
    const darker = (r << 16) | (g << 8) | b;

    const gfx = this.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(darker, 1);
    gfx.fillRect(0, 0, W, H);
    gfx.fillStyle(c, 0.95);
    gfx.fillRect(0, 0, W, H * 0.6);

    this.backgroundLayer.add(gfx);
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  protected onResize(gameSize: Phaser.Structs.Size): void {
    const W = gameSize.width;
    const H = gameSize.height;

    this.cameras.main.setSize(W, H);
    this.drawBackground(W, H);

    this.layout = this.calcLayout(W, H);
    this.zones = this.buildZones(this.layout);

    this.table?.reposition(this.zones);
    this.localFan?.reposition(this.layout.localFanX, this.layout.localFanY, this.layout.fanRadius);

    this.opponentFans?.get("A")?.reposition(this.layout.slotA_x, this.layout.slotA_y);
    this.opponentFans?.get("B")?.reposition(this.layout.slotB_x, this.layout.slotB_y);
    this.opponentFans?.get("C")?.reposition(this.layout.slotC_x, this.layout.slotC_y);

    this.turnHUD?.setSlotPosition("local", this.layout.localFanX, this.layout.localFanY);
    this.turnHUD?.setSlotPosition("A", this.layout.slotA_x, this.layout.slotA_y);
    this.turnHUD?.setSlotPosition("B", this.layout.slotB_x, this.layout.slotB_y);
    this.turnHUD?.setSlotPosition("C", this.layout.slotC_x, this.layout.slotC_y);
  }

  // ── Player/slot helpers (used in Phase 6+ bridge wiring) ──────────────────

  playerIdToSlot(playerId: string): "local" | "A" | "B" | "C" {
    if (playerId === this.bridge.getMyId()) return "local";
    const opponents = this.bridge.getPlayers().filter((p) => p.id !== this.bridge.getMyId());
    const idx = opponents.findIndex((p) => p.id === playerId);
    if (idx === 0) return "A";
    if (idx === 1) return "B";
    if (idx === 2) return "C";
    return "local";
  }

  opponentSlotForPlayer(playerId: string): number | null {
    const opponents = this.bridge.getPlayers().filter((p) => p.id !== this.bridge.getMyId());
    const idx = opponents.findIndex((p) => p.id === playerId);
    return idx >= 0 ? idx : null;
  }

  /** Show / update one opponent slot. Pass null to hide. */
  updateOpponentSlot(
    slot: OpponentSlot,
    data: { name: string; handCount: number; avatar?: string | null } | null,
  ): void {
    const fan = this.opponentFans.get(slot);
    if (!fan) return;
    if (!data) {
      fan.showSlot(false);
      return;
    }
    fan.showSlot(true);
    fan.setPlayerName(data.name);
    fan.setHandCount(data.handCount);
    if (data.avatar !== undefined) fan.setPlayerAvatar(data.avatar);
  }

  /**
   * Move the turn glow to the given player and update interactivity.
   * Called by Phase 8 bridge wiring on every turn change.
   */
  setActiveTurn(playerId: string | null): void {
    if (!playerId) {
      this.turnHUD?.setActiveTurn(null);
      this.localFan?.setInteractable(false);
      this.table?.setDeckInteractable(false);
      return;
    }
    const slot = this.playerIdToSlot(playerId) as HudSlot;
    this.turnHUD?.setActiveTurn(slot);
    const isMyTurn = slot === "local";
    this.localFan?.setInteractable(isMyTurn);
    this.table?.setDeckInteractable(isMyTurn);
  }

  /** Sync all opponent slots from the current bridge player list. */
  syncOpponents(): void {
    const opponents = this.bridge.getPlayers().filter((p) => p.id !== this.bridge.getMyId());
    const slots: OpponentSlot[] = ["A", "B", "C"];
    for (let i = 0; i < slots.length; i++) {
      const opp = opponents[i];
      const hasOpp = !!opp;
      this.updateOpponentSlot(slots[i]!, opp
        ? { name: opp.playerName ?? `P${i + 2}`, handCount: opp.handCount, avatar: opp.playerAvatar }
        : null,
      );
      // Mirror visibility in the HUD glow slot registry
      this.turnHUD?.showSlot(slots[i]! as HudSlot, hasOpp);
    }
  }

  // ── Phase 8: full bridge wiring ─────────────────────────────────────────────

  private initBridge(): void {
    this.bridge.init({
      onTurnChange: (playerId) => {
        this.setActiveTurn(playerId);
      },

      onDiscardTopChange: (card) => {
        this.table.updateDiscardPile(card);
      },

      onDeckCountChange: (count) => {
        this.table.updateDeckCount(count);
      },

      onOpponentHandCountChange: (playerId, count) => {
        const slot = this.playerIdToSlot(playerId);
        if (slot !== "local") {
          this.opponentFans.get(slot as OpponentSlot)?.setHandCount(count);
        }
      },

      onGamePhaseChange: (phase) => {
        this.onGamePhaseChange?.(phase);
        if (phase === "playing") {
          (oasiz as unknown as Record<string, () => void>).gameplayStart?.();
        } else if (phase === "gameover") {
          (oasiz as unknown as Record<string, () => void>).gameplayStop?.();
          this.localFan.setInteractable(false);
          this.table.setDeckInteractable(false);
          this.turnHUD.setActiveTurn(null);
        }
      },

      onPlayersUpdate: () => {
        this.syncOpponents();
      },
    }, this.engine);

    // Host initializes the deck and starts the first turn
    if (this.bridge.isHost()) {
      this.bridge.initializeDeck(this.config.deck.totalCount);
    }
  }

  // ── Debug hitbox overlay ────────────────────────────────────────────────────
  // Draws known hit areas using the EXACT same geometry as manual hit testing.
  // Since all input is scene-level + manual, this is 100% accurate.

  update(): void {
    if (!this._debugEnabled) return;
    this._debugGfx.clear();
    this.drawDebugHitboxes();
  }

  private drawDebugHitboxes(): void {
    const gfx = this._debugGfx;

    // ── Deck zone (cyan) ──────────────────────────────────────────────────────
    const deckZone = this.zones.find((z) => z.key === "deck");
    if (deckZone) {
      gfx.lineStyle(2, 0x00ffff, 1);
      gfx.strokeRect(deckZone.x, deckZone.y, CARD_W, CARD_H);
      this.debugLabel(gfx, deckZone.x, deckZone.y - 12, "DECK", 0x00ffff);
    }

    // ── Discard zone (cyan, dimmer) ───────────────────────────────────────────
    const discardZone = this.zones.find((z) => z.key === "discard");
    if (discardZone) {
      gfx.lineStyle(1, 0x00cccc, 0.5);
      gfx.strokeRect(discardZone.x, discardZone.y, CARD_W, CARD_H);
    }

    // ── Fan cards (yellow, bottom-center origin) ──────────────────────────────
    this.localFan.getDebugCards().forEach(({ x, y, interactable }) => {
      gfx.lineStyle(2, interactable ? 0xffff00 : 0x888800, interactable ? 0.9 : 0.35);
      gfx.strokeRect(x - CARD_W / 2, y - CARD_H, CARD_W, CARD_H);
      // Origin dot
      gfx.fillStyle(interactable ? 0xffff00 : 0x888800, 1);
      gfx.fillCircle(x, y, 3);
    });

    // ── Arrow pills (magenta) ─────────────────────────────────────────────────
    const PILL_W = 52;
    const PILL_H = 30;
    this.localFan.getDebugArrows().forEach(({ x, y, visible }) => {
      if (!visible) return;
      gfx.lineStyle(2, 0xff00ff, 0.9);
      gfx.strokeRect(x - PILL_W / 2, y - PILL_H / 2, PILL_W, PILL_H);
    });
  }

  private debugLabel(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    text: string,
    color: number,
  ): void {
    // Cheap text via existing scene text objects would persist; skip for now.
    // Color dot instead:
    gfx.fillStyle(color, 1);
    gfx.fillCircle(x + 4, y + 6, 4);
    void text; // suppress unused-var warning
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  shutdown(): void {
    this.scale.off("resize", this.onResize, this);
    this.input.off("pointermove");
    this.input.off("pointerdown");
    this.input.off("pointerup");
    try { (oasiz as unknown as Record<string, () => void>).gameplayStop?.(); } catch { /* SDK not available */ }
  }
}
