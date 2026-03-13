/**
 * PixiCardGame.ts
 * ───────────────
 * PIXI.Application bootstrap and top-level coordinator for the multiplayer card table.
 * Layer stack: table → opponents → local fan → fly → HUD.
 * Wires PlayroomBridge callbacks to table, local fan, opponent fans, and turn HUD.
 */

import { Application, Assets, Color, Container, Graphics, Sprite } from "pixi.js";
import { PlayroomBridge } from "../cards-core/PlayroomBridge";
import { CardGameEngine } from "../cards-core/CardGameEngine";
import type { TableConfig, TableZone } from "../cards-core/types";
import { PixiTable } from "./PixiTable";
import { PixiLocalFan } from "./PixiLocalFan";
import { PixiOpponentFan, type OpponentSlot } from "./PixiOpponentFan";
import { PixiTurnHUD } from "./PixiTurnHUD";
import { CARD_W, CARD_H } from "./PixiCard";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

export class PixiCardGame {
  private app!: Application;
  private table!: PixiTable;
  private localFan!: PixiLocalFan;
  private opponentFans: PixiOpponentFan[] = [];
  private turnHUD!: PixiTurnHUD;
  private backgroundLayer!: Container;
  private tableLayer!: Container;
  private opponentLayer!: Container;
  private localFanLayer!: Container;
  private flyLayer!: Container;
  private hudLayer!: Container;

  private readonly mount: HTMLElement;
  private readonly config: TableConfig;
  private readonly bridge: PlayroomBridge;
  private readonly engine: CardGameEngine;
  private readonly settings: Settings;
  private readonly onGamePhaseChange?: (phase: string) => void;

  /** Prevents queuing multiple draw animations simultaneously. */
  private _drawLocked = false;

  constructor(
    mount: HTMLElement,
    config: TableConfig,
    bridge: PlayroomBridge,
    engine: CardGameEngine,
    settings: Settings,
    onGamePhaseChange?: (phase: string) => void,
  ) {
    this.mount = mount;
    this.config = config;
    this.bridge = bridge;
    this.engine = engine;
    this.settings = settings;
    this.onGamePhaseChange = onGamePhaseChange;
    void this.init();
  }

  private async init(): Promise<void> {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const isMobile = window.matchMedia("(pointer: coarse)").matches;

    this.app = new Application();

    /** @ts-ignore */
    globalThis.__PIXI_APP__ = this.app;

    await this.app.init({
      width: W,
      height: H,
      backgroundColor: new Color(this.config.visualConfig.backgroundColor),
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });

    this.mount.appendChild(this.app.canvas as HTMLCanvasElement);

    this.backgroundLayer = new Container();
    this.tableLayer = new Container();
    this.opponentLayer = new Container();
    this.localFanLayer = new Container();
    this.flyLayer = new Container();
    this.hudLayer = new Container();
    this.app.stage.addChild(
      this.backgroundLayer,
      this.tableLayer,
      this.opponentLayer,
      this.localFanLayer,
      this.flyLayer,
      this.hudLayer,
    );

    await this.setupBackground(W, H);

    const layout = this.calcLayout(W, H);
    const zones = this.buildZones(layout);

    this.table = new PixiTable(this.config);
    this.table.init(zones);
    this.table.onDrawRequest = () => {
      if (this._drawLocked) return;
      const card = this.bridge.requestDraw();
      if (card) {
        this._drawLocked = true;
        this.table.setDeckInteractable(false);
        this.localFan.addCard(card, this.table.deckCenterX, this.table.deckCenterY, () => {
          this._drawLocked = false;
          if (this.bridge.isMyTurn()) this.table.setDeckInteractable(true);
        });
      }
    };
    this.tableLayer.addChild(this.table);

    const slotA = new PixiOpponentFan("A", layout.slotA_x, layout.slotA_y, this.config.visualConfig);
    const slotB = new PixiOpponentFan("B", layout.slotB_x, layout.slotB_y, this.config.visualConfig);
    const slotC = new PixiOpponentFan("C", layout.slotC_x, layout.slotC_y, this.config.visualConfig);
    this.opponentFans = [slotA, slotB, slotC];
    this.opponentLayer.addChild(slotA, slotB, slotC);

    this.localFan = new PixiLocalFan(
      layout.localFanX,
      layout.localFanY,
      layout.fanRadius,
      this.config.visualConfig,
      this.flyLayer,
    );
    this.localFan.onCardTap = (index) => {
      const card = this.bridge.requestThrow(index);
      if (card) {
        const discardZone = zones.find((z) => z.key === "discard");
        const discardX = discardZone ? discardZone.x + 28 : layout.playCenterX;
        const discardY = discardZone ? discardZone.y + 40 : layout.tableCenterY;
        this.localFan.throwCard(index, discardX, discardY);
      }
    };
    this.localFanLayer.addChild(this.localFan);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointermove", this.onStagePointerMove);
    this.app.stage.on("pointerdown", this.onStagePointerDown);
    this.app.stage.on("pointerup", this.onStagePointerUp);
    this.app.stage.on("pointerupoutside", this.onStagePointerUp);

    // Pixi-only dummy mode: seed local fan from engine (no draw/play mechanics)
    const bridgeDummy = (this.bridge as { isDummy?: boolean }).isDummy;
    if (bridgeDummy) {
      for (const card of this.engine.getHand()) {
        this.localFan.addCard(card, this.table.deckCenterX, this.table.deckCenterY);
      }
    }

    this.turnHUD = new PixiTurnHUD();
    this.turnHUD.registerSlot("local", layout.localFanX, layout.localFanY + 24);
    this.turnHUD.registerSlot("A", layout.slotA_x, layout.slotA_y + 20);
    this.turnHUD.registerSlot("B", layout.slotB_x, layout.slotB_y + 20);
    this.turnHUD.registerSlot("C", layout.slotC_x, layout.slotC_y + 20);
    this.hudLayer.addChild(this.turnHUD);

    this.bridge.init(
      {
        onTurnChange: (playerId) => {
          const slot = this.playerIdToSlot(playerId);
          this.turnHUD.setActiveTurn(slot);
          this.localFan.setInteractable(this.bridge.isMyTurn());
          this.table.setDeckInteractable(this.bridge.isMyTurn());
          const players = this.bridge.getPlayers();
          const myPlayer = players.find((p) => p.id === this.bridge.getMyId());
          this.turnHUD.setPlayerName("local", myPlayer?.playerName ?? "You");
          this.turnHUD.setPlayerAvatar("local", myPlayer?.playerAvatar ?? null);
          for (let i = 0; i < 3; i++) {
            const opp = this.getOpponentAtSlot(i);
            if (opp) this.turnHUD.setPlayerName(this.slotIndexToSlot(i), opp.playerName ?? "Opponent");
          }
        },
        onDiscardTopChange: (card) => this.table.updateDiscardPile(card),
        onDeckCountChange: (count) => this.table.updateDeckCount(count),
        onOpponentHandCountChange: (playerId, count) => {
          const slot = this.opponentSlotForPlayer(playerId);
          if (slot !== null) this.opponentFans[slot].setHandCount(count);
        },
        onGamePhaseChange: (phase) => this.onGamePhaseChange?.(phase),
        onPlayersUpdate: () => this.updateOpponentSlots(),
      },
      this.engine,
    );

    this.updateOpponentSlots();
    const players = this.bridge.getPlayers();
    const myPlayer = players.find((p) => p.id === this.bridge.getMyId());
    this.turnHUD.setPlayerName("local", myPlayer?.playerName ?? "You");
    this.turnHUD.setPlayerAvatar("local", myPlayer?.playerAvatar ?? null);

    if (bridgeDummy) {
      this.localFan.setInteractable(true);
      this.table.setDeckInteractable(false);
    }

    window.addEventListener("resize", this.onResize);
    window.addEventListener("cardsGame:pause", this.onPause);
    window.addEventListener("cardsGame:resume", this.onResume);
  }

  /** Try to load background from assets folder; fallback to gradient/solid. */
  private async setupBackground(W: number, H: number): Promise<void> {
    const base = "/assets";
    const candidates = ["/background.png", "/background.jpg", "/background.webp"].map((p) => base + p);
    let textureLoaded = false;
    for (const url of candidates) {
      try {
        const texture = await Assets.load(url);
        if (texture) {
          const sprite = new Sprite({ texture });
          sprite.width = W;
          sprite.height = H;
          sprite.position.set(0, 0);
          this.backgroundLayer.addChild(sprite);
          textureLoaded = true;
          console.log("[PixiCardGame] Background loaded from", url);
          break;
        }
      } catch {
        // try next candidate
      }
    }
    if (!textureLoaded) {
      const c = this.config.visualConfig.backgroundColor;
      const r = Math.round(((c >> 16) & 0xff) * 0.5);
      const g = Math.round(((c >> 8) & 0xff) * 0.5);
      const b = Math.round((c & 0xff) * 0.5);
      const darker = (r << 16) | (g << 8) | b;
      const gfx = new Graphics();
      gfx.rect(0, 0, W, H);
      gfx.fill({ color: darker, alpha: 1 });
      gfx.rect(0, 0, W, H * 0.6);
      gfx.fill({ color: c, alpha: 0.95 });
      this.backgroundLayer.addChild(gfx);
      console.log("[PixiCardGame] Background: fallback gradient (no image in assets)");
    }
  }

  /** Portrait-first layout: opponents high, table mid, local fan large and in front. */
  private calcLayout(W: number, H: number) {
    const isPortrait = H > W;
    if (isPortrait) {
      const slotA_y = H * 0.12;
      const slotBC_y = H * 0.28;
      const tableCenterY = H * 0.34;
      const localFanY = H * 0.94;
      const fanRadius = 4.2;
      return {
        slotA_x: W * 0.5,
        slotA_y,
        slotB_x: W * 0.12,
        slotB_y: slotBC_y,
        slotC_x: W * 0.88,
        slotC_y: slotBC_y,
        tableCenterY,
        deckCenterX: W * 0.38,
        playCenterX: W * 0.62,
        localFanX: W * 0.5,
        localFanY,
        fanRadius,
      };
    }
    const slotA_y = (H * 0.2) * 0.5;
    const slotBC_y = H * 0.42;
    const tableCenterY = H * 0.46;
    const localFanY = H * 0.84;
    const fanRadius = CARD_H * 3.5;
    return {
      slotA_x: W * 0.5,
      slotA_y,
      slotB_x: W * 0.1,
      slotB_y: slotBC_y,
      slotC_x: W * 0.9,
      slotC_y: slotBC_y,
      tableCenterY,
      deckCenterX: W * 0.38,
      playCenterX: W * 0.62,
      localFanX: W * 0.5,
      localFanY,
      fanRadius,
    };
  }

  private buildZones(layout: ReturnType<PixiCardGame["calcLayout"]>): TableZone[] {
    const deckX = layout.deckCenterX - 28;
    const deckY = layout.tableCenterY - 40;
    const discardX = layout.playCenterX - 28;
    const discardY = layout.tableCenterY - 40;
    return this.config.zones.map((z) => {
      if (z.key === "deck") return { ...z, x: deckX, y: deckY };
      if (z.key === "discard") return { ...z, x: discardX, y: discardY };
      return { ...z, x: layout.playCenterX - 28, y: layout.tableCenterY - 40 };
    });
  }

  private playerIdToSlot(playerId: string): "local" | "A" | "B" | "C" {
    if (playerId === this.bridge.getMyId()) return "local";
    const players = this.bridge.getPlayers();
    const opponents = players.filter((p) => p.id !== this.bridge.getMyId());
    const idx = opponents.findIndex((p) => p.id === playerId);
    if (idx === 0) return "A";
    if (idx === 1) return "B";
    if (idx === 2) return "C";
    return "local";
  }

  private slotIndexToSlot(i: number): "A" | "B" | "C" {
    return (["A", "B", "C"] as const)[i] ?? "A";
  }

  private opponentSlotForPlayer(playerId: string): number | null {
    const players = this.bridge.getPlayers();
    const opponents = players.filter((p) => p.id !== this.bridge.getMyId());
    const idx = opponents.findIndex((p) => p.id === playerId);
    return idx >= 0 ? idx : null;
  }

  private getOpponentAtSlot(slotIndex: number): { id: string; playerName: string; handCount: number; playerAvatar: string | null } | null {
    const players = this.bridge.getPlayers();
    const opponents = players.filter((p) => p.id !== this.bridge.getMyId());
    return opponents[slotIndex] ?? null;
  }

  private updateOpponentSlots(): void {
    const players = this.bridge.getPlayers();
    const opponents = players.filter((p) => p.id !== this.bridge.getMyId());
    const visibility: Record<OpponentSlot, boolean> = {
      A: opponents.length === 1 || opponents.length === 3,
      B: opponents.length >= 2,
      C: opponents.length >= 2,
    };
    this.opponentFans[0].showSlot(visibility.A);
    this.opponentFans[1].showSlot(visibility.B);
    this.opponentFans[2].showSlot(visibility.C);
    if (opponents.length >= 1) {
      this.opponentFans[0].setPlayerName(opponents[0].playerName ?? "Opponent");
      this.opponentFans[0].setHandCount(opponents[0].handCount);
      this.opponentFans[0].setPlayerAvatar(opponents[0].playerAvatar ?? null);
    }
    if (opponents.length >= 2) {
      this.opponentFans[1].setPlayerName(opponents[1].playerName ?? "Opponent");
      this.opponentFans[1].setHandCount(opponents[1].handCount);
      this.opponentFans[1].setPlayerAvatar(opponents[1].playerAvatar ?? null);
    }
    if (opponents.length >= 3) {
      this.opponentFans[2].setPlayerName(opponents[2].playerName ?? "Opponent");
      this.opponentFans[2].setHandCount(opponents[2].handCount);
      this.opponentFans[2].setPlayerAvatar(opponents[2].playerAvatar ?? null);
    }
  }

  private onResize = (): void => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    this.app.renderer.resize(W, H);
    const first = this.backgroundLayer.children[0];
    if (first && "width" in first && "height" in first) {
      (first as { width: number; height: number }).width = W;
      (first as { width: number; height: number }).height = H;
    }
    const layout = this.calcLayout(W, H);
    const zones = this.buildZones(layout);
    this.table.reposition(zones);
    this.localFan.reposition(layout.localFanX, layout.localFanY, layout.fanRadius);
    this.opponentFans[0].reposition(layout.slotA_x, layout.slotA_y);
    this.opponentFans[1].reposition(layout.slotB_x, layout.slotB_y);
    this.opponentFans[2].reposition(layout.slotC_x, layout.slotC_y);
  };

  private onPause = (): void => { /* optional: pause ticker */ };
  private onResume = (): void => { /* optional */ };

  private onStagePointerMove = (e: { global: { x: number; y: number } }): void => {
    this.localFan.updateDrag(e.global.x, e.global.y);
    this.localFan.updateHighlight(e.global.x, e.global.y);
  };

  private onStagePointerDown = (e: { global: { x: number; y: number } }): void => {
    this.localFan.handlePointerDown(e.global.x, e.global.y);
  };

  private onStagePointerUp = (): void => {
    this.localFan.endDrag();
  };

  destroy(): void {
    this.app.stage.off("pointermove", this.onStagePointerMove);
    this.app.stage.off("pointerdown", this.onStagePointerDown);
    this.app.stage.off("pointerup", this.onStagePointerUp);
    this.app.stage.off("pointerupoutside", this.onStagePointerUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("cardsGame:pause", this.onPause);
    window.removeEventListener("cardsGame:resume", this.onResume);
    this.table.onDrawRequest = undefined;
    this.localFan.onCardTap = undefined;
    this.turnHUD.destroy();
    this.app.destroy(true, { children: true });
    this.mount.innerHTML = "";
  }
}
