import { MultiInputManager } from "../systems/MultiInputManager";
import { NetworkManager } from "../network/NetworkManager";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Projectile } from "../entities/Projectile";
import { BotVisibleData } from "../entities/AstroBot";
import { GamePhase, PlayerData, GAME_CONFIG } from "../types";

export class BotManager {
  readonly localPlayerSlots: Map<string, number> = new Map();
  useTouchForHost = false;
  private reservedLocalSlots: Set<number> = new Set();

  constructor(
    private network: NetworkManager,
    private multiInput: MultiInputManager | null,
  ) {}

  isPlayerBot(playerId: string): boolean {
    return this.network.isPlayerBot(playerId);
  }

  getPlayerBotType(playerId: string): "ai" | "local" | null {
    return this.network.getPlayerBotType(playerId);
  }

  getPlayerKeySlot(playerId: string): number {
    return this.network.getPlayerKeySlot(playerId);
  }

  hasRemotePlayers(): boolean {
    return this.network.hasRemotePlayers();
  }

  async addAIBot(phase: GamePhase): Promise<boolean> {
    if (phase !== "LOBBY") {
      console.log("[Game] Cannot add bots outside lobby phase");
      return false;
    }
    const bot = await this.network.addAIBot();
    return bot !== null;
  }

  async addLocalBot(
    keySlot: number,
    phase: GamePhase,
    players: Map<string, PlayerData>,
  ): Promise<boolean> {
    if (phase !== "LOBBY") {
      console.log("[Game] Cannot add bots outside lobby phase");
      return false;
    }
    if (
      this.getUsedKeySlots(players).includes(keySlot) ||
      this.reservedLocalSlots.has(keySlot)
    ) {
      console.log("[Game] Key slot already in use:", keySlot);
      return false;
    }
    this.reservedLocalSlots.add(keySlot);
    const bot = await this.network.addLocalBot(keySlot);
    if (bot) {
      this.multiInput?.activateSlot(keySlot);

      setTimeout(() => {
        for (const [playerId] of players) {
          const botType = this.network.getPlayerBotType(playerId);
          const slot = this.network.getPlayerKeySlot(playerId);
          if (botType === "local" && slot === keySlot) {
            this.localPlayerSlots.set(playerId, keySlot);
            this.reservedLocalSlots.delete(keySlot);
            break;
          }
        }
      }, 100);

      return true;
    }
    this.reservedLocalSlots.delete(keySlot);
    return false;
  }

  async removeBot(playerId: string): Promise<boolean> {
    const slot = this.localPlayerSlots.get(playerId);
    if (slot !== undefined) {
      this.multiInput?.deactivateSlot(slot);
      this.localPlayerSlots.delete(playerId);
      this.reservedLocalSlots.delete(slot);
    }

    return this.network.removeBot(playerId);
  }

  getUsedKeySlots(players: Map<string, PlayerData>): number[] {
    const slots: number[] = [];
    slots.push(0); // Slot 0 (WASD) is always used by the host

    for (const [playerId] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        const slot = this.network.getPlayerKeySlot(playerId);
        if (slot >= 0) slots.push(slot);
      }
    }
    for (const slot of this.reservedLocalSlots) {
      if (!slots.includes(slot)) {
        slots.push(slot);
      }
    }
    return slots;
  }

  getLocalPlayersInfo(
    players: Map<string, PlayerData>,
  ): Array<{ name: string; color: string; keyPreset: string }> {
    const localPlayers: Array<{
      name: string;
      color: string;
      keyPreset: string;
    }> = [];

    const myId = this.network.getMyPlayerId();
    const myPlayer = myId ? players.get(myId) : null;
    if (myPlayer) {
      localPlayers.push({
        name: myPlayer.name,
        color: myPlayer.color.primary,
        keyPreset: "A rotate | D fire",
      });
    }

    for (const [playerId, player] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        const slot = this.network.getPlayerKeySlot(playerId);
        const keyHints = this.getKeyHintForSlot(slot);
        localPlayers.push({
          name: player.name,
          color: player.color.primary,
          keyPreset: keyHints,
        });
      }
    }

    return localPlayers;
  }

  getKeyHintForSlot(slot: number): string {
    switch (slot) {
      case 1:
        return "← rotate | → fire";
      case 2:
        return "J rotate | L fire";
      case 3:
        return "Num4 rotate | Num6 fire";
      default:
        return "A rotate | D fire";
    }
  }

  getLocalPlayerCount(players: Map<string, PlayerData>): number {
    let count = 0;
    const myId = this.network.getMyPlayerId();
    if (myId && players.has(myId)) {
      count += 1;
    }
    for (const [playerId] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        count += 1;
      }
    }
    return count;
  }

  hasLocalPlayers(players: Map<string, PlayerData>): boolean {
    for (const [playerId] of players) {
      const botType = this.network.getPlayerBotType(playerId);
      if (botType === "local") {
        return true;
      }
    }
    return false;
  }

  // ============= TOUCH LAYOUT =============

  updateTouchLayout(orderedPlayers: PlayerData[]): void {
    if (!this.multiInput) return;

    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    if (!isMobile) {
      this.useTouchForHost = false;
      this.multiInput.destroyTouchZones();
      return;
    }

    const slotToColor = new Map<number, string>();
    const localSlotOrder: number[] = [];
    const myId = this.network.getMyPlayerId();

    for (const player of orderedPlayers) {
      const isHostPlayer = myId !== null && player.id === myId;
      const botType = this.network.getPlayerBotType(player.id);
      const isLocal = isHostPlayer || botType === "local";
      if (!isLocal) continue;

      const slot = isHostPlayer ? 0 : this.network.getPlayerKeySlot(player.id);
      if (slot < 0) continue;

      if (!localSlotOrder.includes(slot)) {
        localSlotOrder.push(slot);
      }
      slotToColor.set(slot, player.color.primary);
    }

    const localCount = localSlotOrder.length;
    if (localCount === 0) {
      this.multiInput.destroyTouchZones();
      this.useTouchForHost = false;
      return;
    }
    let layout: "single" | "dual" | "corner";
    if (localCount <= 1) {
      layout = "single";
    } else if (localCount === 2) {
      layout = "dual";
    } else {
      layout = "corner";
    }

    for (const slot of localSlotOrder) {
      this.multiInput.activateSlot(slot);
    }

    this.multiInput.setupTouchZones(layout, localSlotOrder, slotToColor);
    this.useTouchForHost = localSlotOrder.includes(0);
  }

  clearTouchLayout(): void {
    this.useTouchForHost = false;
    this.multiInput?.destroyTouchZones();
  }

  // ============= AI DATA =============

  getBotVisibleData(
    botPlayerId: string,
    ships: Map<string, Ship>,
    pilots: Map<string, Pilot>,
    projectiles: Projectile[],
  ): BotVisibleData {
    const myShip = ships.get(botPlayerId);
    const myPilot = pilots.get(botPlayerId);

    const enemyShips: BotVisibleData["enemyShips"] = [];
    ships.forEach((ship, playerId) => {
      if (playerId !== botPlayerId && ship.alive) {
        enemyShips.push({
          x: ship.body.position.x,
          y: ship.body.position.y,
          angle: ship.body.angle,
          vx: ship.body.velocity.x,
          vy: ship.body.velocity.y,
          playerId,
        });
      }
    });

    const enemyPilots: BotVisibleData["enemyPilots"] = [];
    pilots.forEach((pilot, playerId) => {
      if (playerId !== botPlayerId && pilot.alive) {
        enemyPilots.push({
          x: pilot.body.position.x,
          y: pilot.body.position.y,
          vx: pilot.body.velocity.x,
          vy: pilot.body.velocity.y,
          playerId,
        });
      }
    });

    const projData: BotVisibleData["projectiles"] = [];
    projectiles.forEach((proj) => {
      if (proj.ownerId !== botPlayerId) {
        projData.push({
          x: proj.body.position.x,
          y: proj.body.position.y,
          vx: proj.body.velocity.x,
          vy: proj.body.velocity.y,
          ownerId: proj.ownerId,
        });
      }
    });

    return {
      myShip: myShip
        ? {
            x: myShip.body.position.x,
            y: myShip.body.position.y,
            angle: myShip.body.angle,
            vx: myShip.body.velocity.x,
            vy: myShip.body.velocity.y,
            alive: myShip.alive,
          }
        : null,
      myPilot: myPilot
        ? {
            x: myPilot.body.position.x,
            y: myPilot.body.position.y,
            vx: myPilot.body.velocity.x,
            vy: myPilot.body.velocity.y,
            alive: myPilot.alive,
          }
        : null,
      enemyShips,
      enemyPilots,
      projectiles: projData,
      arenaWidth: GAME_CONFIG.ARENA_WIDTH,
      arenaHeight: GAME_CONFIG.ARENA_HEIGHT,
    };
  }
}
