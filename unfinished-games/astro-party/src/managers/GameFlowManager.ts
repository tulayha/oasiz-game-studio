import Matter from "matter-js";
import { Physics } from "../systems/Physics";
import { Renderer } from "../systems/Renderer";
import { InputManager } from "../systems/Input";
import { MultiInputManager } from "../systems/MultiInputManager";
import { NetworkManager } from "../network/NetworkManager";
import { Ship } from "../entities/Ship";
import { Pilot } from "../entities/Pilot";
import { Projectile } from "../entities/Projectile";
import { SettingsManager } from "../SettingsManager";
import { GameConfig } from "../GameConfig";
import {
  GamePhase,
  PlayerData,
  PlayerInput,
  RoundResultPayload,
  GAME_CONFIG,
  PLAYER_COLORS,
} from "../types";

export class GameFlowManager {
  phase: GamePhase = "START";
  countdown: number = 0;
  countdownInterval: ReturnType<typeof setInterval> | null = null;
  roundEndTimeout: ReturnType<typeof setTimeout> | null = null;
  winnerId: string | null = null;
  winnerName: string | null = null;
  currentRound: number = 1;
  roundWinnerId: string | null = null;
  roundWinnerName: string | null = null;
  roundIsTie: boolean = false;

  // Callbacks
  onPhaseChange: ((phase: GamePhase) => void) | null = null;
  onPlayersUpdate: (() => void) | null = null;
  onCountdownUpdate: ((count: number) => void) | null = null;
  onBeginMatch: (() => void) | null = null;
  onRoundResult: ((payload: RoundResultPayload) => void) | null = null;
  onResetRound: (() => void) | null = null;

  constructor(
    private network: NetworkManager,
    private physics: Physics,
    private renderer: Renderer,
    private input: InputManager,
    private multiInput: MultiInputManager | null,
  ) {}

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.onPhaseChange?.(phase);

    if (this.network.isHost()) {
      this.network.broadcastGamePhase(
        phase,
        phase === "GAME_END" ? (this.winnerId ?? undefined) : undefined,
        phase === "GAME_END" ? (this.winnerName ?? undefined) : undefined,
      );
    }
  }

  startGame(): void {
    if (!this.network.isHost()) return;
    if (this.phase !== "LOBBY") return;
    if (this.network.getPlayerCount() < 2) return;

    this.currentRound = 1;
    this.roundWinnerId = null;
    this.roundWinnerName = null;
    this.roundIsTie = false;

    this.startCountdown();
  }

  startCountdown(): void {
    this.setPhase("COUNTDOWN");
    this.countdown = GAME_CONFIG.COUNTDOWN_DURATION;
    this.onCountdownUpdate?.(this.countdown);
    this.network.broadcastCountdown(this.countdown);

    this.countdownInterval = setInterval(() => {
      this.countdown--;
      this.onCountdownUpdate?.(this.countdown);
      this.network.broadcastCountdown(this.countdown);

      if (this.countdown <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        this.onBeginMatch?.();
      }
    }, 1000);
  }

  beginMatch(players: Map<string, PlayerData>, ships: Map<string, Ship>): void {
    this.setPhase("PLAYING");

    this.physics.createWalls(GAME_CONFIG.ARENA_WIDTH, GAME_CONFIG.ARENA_HEIGHT);

    if (this.network.isHost()) {
      const playerIds = this.network.getPlayerIds();
      const spawnPoints = this.getSpawnPoints(
        playerIds.length,
        GAME_CONFIG.ARENA_WIDTH,
        GAME_CONFIG.ARENA_HEIGHT,
      );

      playerIds.forEach((playerId, index) => {
        const spawn = spawnPoints[index];
        const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
        const ship = new Ship(
          this.physics,
          spawn.x,
          spawn.y,
          playerId,
          color,
          spawn.angle,
        );
        ship.invulnerableUntil = Date.now() + GAME_CONFIG.INVULNERABLE_TIME;
        ships.set(playerId, ship);

        const player = players.get(playerId);
        if (player) {
          player.state = "ACTIVE";
        }
      });
    }

    this.onPlayersUpdate?.();
  }

  getSpawnPoints(
    count: number,
    width: number,
    height: number,
  ): { x: number; y: number; angle: number }[] {
    const padding = 100;

    const corners = [
      { x: padding, y: padding, angle: 0 },
      { x: width - padding, y: padding, angle: Math.PI / 2 },
      { x: width - padding, y: height - padding, angle: Math.PI },
      { x: padding, y: height - padding, angle: -Math.PI / 2 },
    ];

    if (count === 2) {
      return [corners[0], corners[2]];
    }
    if (count === 3) {
      return [corners[0], corners[1], corners[2]];
    }

    const points: { x: number; y: number; angle: number }[] = [];
    for (let i = 0; i < count; i++) {
      points.push(corners[i % corners.length]);
    }
    return points;
  }

  // ============= COMBAT =============

  destroyShip(
    playerId: string,
    ships: Map<string, Ship>,
    pilots: Map<string, Pilot>,
    players: Map<string, PlayerData>,
  ): void {
    const ship = ships.get(playerId);
    if (!ship || !ship.alive) return;

    const pos = ship.body.position;
    const vel = ship.body.velocity;
    const angle = ship.body.angle;
    const angularVelocity = ship.body.angularVelocity;
    const isBot = this.network.isPlayerBot(playerId);
    const botType = this.network.getPlayerBotType(playerId);
    const controlMode: "player" | "ai" =
      isBot && botType === "ai" ? "ai" : "player";

    this.renderer.spawnExplosion(pos.x, pos.y, ship.color.primary);
    this.triggerScreenShake(15, 0.4);

    const pilot = new Pilot(
      this.physics,
      pos.x,
      pos.y,
      playerId,
      vel,
      controlMode,
      angle,
      angularVelocity * 0.6,
    );
    pilots.set(playerId, pilot);

    ship.destroy();
    ships.delete(playerId);

    const player = players.get(playerId);
    if (player) {
      player.state = "EJECTED";
      this.network.updatePlayerState(playerId, "EJECTED");
    }

    this.onPlayersUpdate?.();
    SettingsManager.triggerHaptic("heavy");
    this.network.broadcastGameSound("explosion", playerId);
  }

  killPilot(
    pilotPlayerId: string,
    killerId: string,
    pilots: Map<string, Pilot>,
    players: Map<string, PlayerData>,
  ): void {
    const pilot = pilots.get(pilotPlayerId);
    if (!pilot || !pilot.alive) return;

    const pos = pilot.body.position;

    this.renderer.spawnExplosion(pos.x, pos.y, "#ff0000");
    this.triggerScreenShake(10, 0.3);

    pilot.destroy();
    pilots.delete(pilotPlayerId);

    const player = players.get(pilotPlayerId);
    if (player) {
      player.state = "SPECTATING";
      this.network.updatePlayerState(pilotPlayerId, "SPECTATING");
    }

    // Award kill to killer (skip if killed by asteroid/environment)
    if (killerId !== "asteroid") {
      const killer = players.get(killerId);
      if (killer) {
        killer.kills++;
        this.network.updateKills(killerId, killer.kills);
      }
    }

    this.checkEliminationWin(players);

    this.onPlayersUpdate?.();
    SettingsManager.triggerHaptic("success");
    this.network.broadcastGameSound("kill", pilotPlayerId);
  }

  private triggerScreenShake(intensity: number, duration: number): void {
    this.renderer.addScreenShake(intensity, duration);
    this.network.broadcastScreenShake(intensity, duration);
  }

  checkEliminationWin(players: Map<string, PlayerData>): void {
    const alivePlayers = [...players.values()].filter(
      (p) => p.state !== "SPECTATING",
    );

    if (alivePlayers.length === 1) {
      if (players.size === 1) {
        this.endGame(alivePlayers[0].id, players);
        return;
      }
      this.endRound(players, alivePlayers[0].id);
    } else if (alivePlayers.length === 0 && players.size > 0) {
      this.endRound(players, null);
    }
  }

  respawnPlayer(
    playerId: string,
    position: { x: number; y: number },
    ships: Map<string, Ship>,
    players: Map<string, PlayerData>,
  ): void {
    const player = players.get(playerId);
    if (!player) return;

    const color = player.color;
    const centerX = GAME_CONFIG.ARENA_WIDTH / 2;
    const centerY = GAME_CONFIG.ARENA_HEIGHT / 2;
    const angleToCenter = Math.atan2(
      centerY - position.y,
      centerX - position.x,
    );

    const ship = new Ship(
      this.physics,
      position.x,
      position.y,
      playerId,
      color,
      angleToCenter,
    );
    ship.invulnerableUntil = Date.now() + GAME_CONFIG.INVULNERABLE_TIME;
    ships.set(playerId, ship);

    player.state = "ACTIVE";
    this.network.updatePlayerState(playerId, "ACTIVE");

    this.onPlayersUpdate?.();
    this.network.broadcastGameSound("respawn", playerId);
  }

  endRound(players: Map<string, PlayerData>, winnerId: string | null): void {
    if (!this.network.isHost()) return;
    if (this.phase !== "PLAYING") return;

    if (this.roundEndTimeout) {
      clearTimeout(this.roundEndTimeout);
      this.roundEndTimeout = null;
    }

    const isTie = winnerId === null;
    let winnerName: string | null = null;

    if (!isTie && winnerId) {
      const winner = players.get(winnerId);
      if (winner) {
        winner.roundWins += 1;
        this.network.updateRoundWins(winnerId, winner.roundWins);
        winnerName = this.network.getPlayerName(winnerId);
      }
    }

    this.roundWinnerId = winnerId;
    this.roundWinnerName = winnerName;
    this.roundIsTie = isTie;

    const roundWinsById: Record<string, number> = {};
    players.forEach((player) => {
      roundWinsById[player.id] = player.roundWins;
    });

    const payload: RoundResultPayload = {
      roundNumber: this.currentRound,
      winnerId: winnerId ?? undefined,
      winnerName: winnerName ?? undefined,
      isTie,
      roundWinsById,
    };

    this.onRoundResult?.(payload);
    this.network.broadcastRoundResult(payload);

    if (!isTie && winnerId) {
      const winner = players.get(winnerId);
      if (winner && winner.roundWins >= GameConfig.config.ROUNDS_TO_WIN) {
        this.endGame(winnerId, players);
        return;
      }
    }

    this.setPhase("ROUND_END");

    this.roundEndTimeout = setTimeout(() => {
      this.roundEndTimeout = null;
      if (!this.network.isHost()) return;
      if (this.phase !== "ROUND_END") return;
      this.currentRound += 1;
      this.onResetRound?.();
      this.startCountdown();
    }, GAME_CONFIG.ROUND_RESULTS_DURATION * 1000);
  }

  endGame(winnerId: string, players: Map<string, PlayerData>): void {
    this.winnerId = winnerId;
    this.winnerName = this.network.getPlayerName(winnerId);
    this.setPhase("GAME_END");
    SettingsManager.triggerHaptic("success");
    this.network.broadcastGameSound("win", winnerId);

    // Submit local player's score to the platform
    const myId = this.network.getMyPlayerId();
    if (myId) {
      const myPlayer = players.get(myId);
      if (myPlayer) {
        this.submitScore(myPlayer.roundWins);
      }
    }
  }

  async restartGame(
    players: Map<string, PlayerData>,
    ships: Map<string, Ship>,
    pilots: Map<string, Pilot>,
    projectiles: Projectile[],
    pendingInputs: Map<string, PlayerInput>,
    pendingDashes: Set<string>,
  ): Promise<void> {
    if (!this.network.isHost()) {
      console.log("[Game] Non-host cannot restart game, waiting for host");
      return;
    }

    await this.network.resetAllPlayerStates();

    this.clearGameState(
      ships,
      pilots,
      projectiles,
      pendingInputs,
      pendingDashes,
      players,
    );
    this.setPhase("LOBBY");
    this.onPlayersUpdate?.();
  }

  clearGameState(
    ships: Map<string, Ship>,
    pilots: Map<string, Pilot>,
    projectiles: Projectile[],
    pendingInputs: Map<string, PlayerInput>,
    pendingDashes: Set<string>,
    players: Map<string, PlayerData>,
    resetScores: boolean = true,
  ): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.roundEndTimeout) {
      clearTimeout(this.roundEndTimeout);
      this.roundEndTimeout = null;
    }

    ships.forEach((ship) => ship.destroy());
    ships.clear();

    pilots.forEach((pilot) => pilot.destroy());
    pilots.clear();

    projectiles.forEach((proj) => proj.destroy());
    projectiles.length = 0;

    pendingInputs.clear();
    pendingDashes.clear();
    this.input.reset();
    this.multiInput?.reset();

    players.forEach((player) => {
      if (resetScores) {
        player.kills = 0;
        player.roundWins = 0;
      }
      player.state = "ACTIVE";
    });

    this.winnerId = null;
    this.winnerName = null;
    this.roundWinnerId = null;
    this.roundWinnerName = null;
    this.roundIsTie = false;
    if (resetScores) {
      this.currentRound = 1;
    }
  }

  removeProjectileByBody(body: Matter.Body, projectiles: Projectile[]): void {
    const index = projectiles.findIndex((p) => p.body === body);
    if (index !== -1) {
      projectiles[index].destroy();
      projectiles.splice(index, 1);
    }
  }

  private submitScore(score: number): void {
    console.log("[Game] Submitting score:", score);
    if (
      typeof (window as unknown as { submitScore?: (score: number) => void })
        .submitScore === "function"
    ) {
      (
        window as unknown as { submitScore: (score: number) => void }
      ).submitScore(score);
    }
  }
}
