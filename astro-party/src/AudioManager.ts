// ============= AUDIO MANAGER =============
// Handles all game audio using Tone.js for procedural FX and asset manifest paths for music/cues.

import * as Tone from "tone";
import { SettingsManager } from "./SettingsManager";
import {
  AUDIO_ASSETS,
  AUDIO_CUE_ASSETS,
  AUDIO_SCENE_MUSIC,
  resolveAudioAssetUrl,
  type AudioAssetId,
  type AudioCueId,
  type AudioSceneId,
} from "./audio/assetManifest";

interface PlayMusicOptions {
  restart?: boolean;
}

class AudioManagerClass {
  private initialized = false;

  // Sound effect synths
  private fireSynth: Tone.Synth | null = null;
  private explosionSynth: Tone.NoiseSynth | null = null;
  private hitSynth: Tone.MembraneSynth | null = null;
  private dashSynth: Tone.Synth | null = null;
  private countdownSynth: Tone.Synth | null = null;
  private fightSynth: Tone.PolySynth | null = null;
  private winSynth: Tone.PolySynth | null = null;
  private killSynth: Tone.PolySynth | null = null;
  private respawnSynth: Tone.Synth | null = null;
  private uiClickSynth: Tone.Synth | null = null;

  // Manifest-driven asset players
  private assetPlayers: Map<AudioAssetId, HTMLAudioElement> = new Map();
  private activeMusicAssetId: AudioAssetId | null = null;
  private activeMusicPlayer: HTMLAudioElement | null = null;

  constructor() {
    // Defer initialization until first user interaction (required by browsers)
  }

  private async ensureInitialized(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      if (Tone.getContext().state !== "running") {
        await Tone.start();
      }

      this.initSynths();
      this.initialized = true;
      console.log("[AudioManager.ensureInitialized]", "Initialized");
      return true;
    } catch (e) {
      console.log("[AudioManager.ensureInitialized]", "Failed to initialize");
      console.log("[AudioManager.ensureInitialized]", String(e));
      return false;
    }
  }

  private safeTrigger(fn: () => void): void {
    try {
      fn();
    } catch {
      // Ignore Tone.js timing errors - sounds still play
    }
  }

  private initSynths(): void {
    this.fireSynth = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 },
    }).toDestination();
    this.fireSynth.volume.value = -15;

    this.explosionSynth = new Tone.NoiseSynth({
      noise: { type: "brown" },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.2 },
    }).toDestination();
    this.explosionSynth.volume.value = -10;

    this.hitSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 },
    }).toDestination();
    this.hitSynth.volume.value = -12;

    this.dashSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 },
    }).toDestination();
    this.dashSynth.volume.value = -18;

    this.countdownSynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 },
    }).toDestination();
    this.countdownSynth.volume.value = -12;

    this.fightSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.3 },
    }).toDestination();
    this.fightSynth.volume.value = -8;

    this.winSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.5 },
    }).toDestination();
    this.winSynth.volume.value = -6;

    this.killSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.05, release: 0.2 },
    }).toDestination();
    this.killSynth.volume.value = -10;

    this.respawnSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.1, decay: 0.2, sustain: 0.1, release: 0.3 },
    }).toDestination();
    this.respawnSynth.volume.value = -12;

    this.uiClickSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0, release: 0.05 },
    }).toDestination();
    this.uiClickSynth.volume.value = -15;
  }

  private getOrCreateAssetPlayer(assetId: AudioAssetId): HTMLAudioElement {
    const existing = this.assetPlayers.get(assetId);
    if (existing) {
      return existing;
    }

    const asset = AUDIO_ASSETS[assetId];
    const url = this.getAssetUrl(assetId);
    const player = new Audio(url);
    player.preload = asset.preload;
    player.loop = asset.loop;
    player.volume = asset.volume;
    this.assetPlayers.set(assetId, player);
    return player;
  }

  private stopPlayer(player: HTMLAudioElement, resetPosition: boolean): void {
    player.pause();
    if (resetPosition) {
      player.currentTime = 0;
    }
  }

  private async playPlayer(player: HTMLAudioElement): Promise<boolean> {
    try {
      await player.play();
      return true;
    } catch (e) {
      console.log("[AudioManager.playPlayer]", "Playback failed");
      console.log("[AudioManager.playPlayer]", String(e));
      return false;
    }
  }

  getConfiguredAssetIds(): AudioAssetId[] {
    return Object.keys(AUDIO_ASSETS) as AudioAssetId[];
  }

  getAssetUrl(assetId: AudioAssetId): string {
    return resolveAudioAssetUrl(assetId);
  }

  preloadAsset(assetId: AudioAssetId): void {
    const player = this.getOrCreateAssetPlayer(assetId);
    player.load();
  }

  preloadConfiguredAssets(): void {
    const ids = this.getConfiguredAssetIds();
    for (const assetId of ids) {
      const definition = AUDIO_ASSETS[assetId];
      if (definition.preload === "none") {
        continue;
      }
      this.preloadAsset(assetId);
    }
  }

  getSceneMusicAsset(scene: AudioSceneId): AudioAssetId | null {
    return AUDIO_SCENE_MUSIC[scene];
  }

  async playSceneMusic(
    scene: AudioSceneId,
    options: PlayMusicOptions = {},
  ): Promise<void> {
    const sceneAsset = this.getSceneMusicAsset(scene);
    if (!sceneAsset) {
      this.stopMusic();
      return;
    }

    await this.playMusicAsset(sceneAsset, options);
  }

  async playCue(cueId: AudioCueId): Promise<void> {
    const assetId = AUDIO_CUE_ASSETS[cueId];
    const definition = AUDIO_ASSETS[assetId];

    if (definition.channel === "music" && !SettingsManager.shouldPlayMusic()) {
      return;
    }
    if (
      (definition.channel === "fx" || definition.channel === "ui") &&
      !SettingsManager.shouldPlayFx()
    ) {
      return;
    }

    const player = this.getOrCreateAssetPlayer(assetId);
    this.stopPlayer(player, true);
    player.loop = definition.loop;
    player.volume = definition.volume;
    await this.playPlayer(player);
  }

  async playMusicAsset(
    assetId: AudioAssetId,
    options: PlayMusicOptions = {},
  ): Promise<void> {
    if (!SettingsManager.shouldPlayMusic()) {
      return;
    }

    const definition = AUDIO_ASSETS[assetId];
    if (definition.channel !== "music") {
      console.log(
        "[AudioManager.playMusicAsset]",
        "Rejected non-music asset " + assetId,
      );
      return;
    }

    const player = this.getOrCreateAssetPlayer(assetId);
    const shouldRestart =
      options.restart ?? this.activeMusicAssetId !== assetId;

    if (this.activeMusicPlayer && this.activeMusicPlayer !== player) {
      this.stopPlayer(this.activeMusicPlayer, true);
    }

    if (shouldRestart) {
      player.currentTime = 0;
    }

    player.loop = true;
    player.volume = definition.volume;

    const played = await this.playPlayer(player);
    if (!played) {
      return;
    }

    this.activeMusicAssetId = assetId;
    this.activeMusicPlayer = player;
  }

  // ============= SOUND EFFECTS =============

  async playFire(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.fireSynth?.triggerAttackRelease("C6", "16n", now);
    });
  }

  async playExplosion(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      this.explosionSynth?.triggerAttackRelease("8n");
    });
  }

  async playHit(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      this.hitSynth?.triggerAttackRelease("C2", "8n");
    });
  }

  async playDash(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.dashSynth?.triggerAttackRelease("C4", "16n", now);
      this.dashSynth?.triggerAttackRelease("G4", "16n", now + 0.05);
    });
  }

  async playCountdown(count: number): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    if (count > 0) {
      this.safeTrigger(() => {
        this.countdownSynth?.triggerAttackRelease("C5", "8n");
      });
    }
  }

  async playFight(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.fightSynth?.triggerAttackRelease(["C4", "E4", "G4"], "8n", now);
      this.fightSynth?.triggerAttackRelease(
        ["C5", "E5", "G5"],
        "4n",
        now + 0.15,
      );
    });
  }

  async playWin(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.winSynth?.triggerAttackRelease(["C4", "E4", "G4"], "4n", now);
      this.winSynth?.triggerAttackRelease(["C5", "E5", "G5"], "4n", now + 0.3);
      this.winSynth?.triggerAttackRelease(["E5", "G5", "C6"], "2n", now + 0.6);
    });
  }

  async playKill(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.killSynth?.triggerAttackRelease("E5", "16n", now);
      this.killSynth?.triggerAttackRelease("G5", "16n", now + 0.05);
      this.killSynth?.triggerAttackRelease("C6", "8n", now + 0.1);
    });
  }

  async playRespawn(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.respawnSynth?.triggerAttackRelease("C4", "8n", now);
      this.respawnSynth?.triggerAttackRelease("E4", "8n", now + 0.1);
      this.respawnSynth?.triggerAttackRelease("G4", "8n", now + 0.2);
    });
  }

  async playUIClick(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      this.uiClickSynth?.triggerAttackRelease("C5", "32n");
    });
  }

  async playPilotEject(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.dashSynth?.triggerAttackRelease("G3", "16n", now);
      this.dashSynth?.triggerAttackRelease("E3", "16n", now + 0.05);
      this.dashSynth?.triggerAttackRelease("C3", "8n", now + 0.1);
    });
  }

  async playPilotDeath(): Promise<void> {
    if (!SettingsManager.shouldPlayFx()) return;
    if (!(await this.ensureInitialized())) return;

    this.safeTrigger(() => {
      const now = Tone.now();
      this.hitSynth?.triggerAttackRelease("E3", "8n", now);
      this.hitSynth?.triggerAttackRelease("C3", "8n", now + 0.1);
    });
  }

  // ============= BACKGROUND MUSIC =============

  async startMusic(): Promise<void> {
    const target =
      this.activeMusicAssetId !== null
        ? this.activeMusicAssetId
        : AUDIO_SCENE_MUSIC.LOBBY;
    if (!target) {
      return;
    }

    await this.playMusicAsset(target, { restart: false });
  }

  stopMusic(): void {
    if (!this.activeMusicPlayer) {
      return;
    }
    this.stopPlayer(this.activeMusicPlayer, true);
    this.activeMusicPlayer = null;
  }

  updateMusicState(isPlaying: boolean): void {
    if (isPlaying && SettingsManager.shouldPlayMusic()) {
      void this.startMusic();
      return;
    }
    this.stopMusic();
  }

  // ============= CLEANUP =============

  destroy(): void {
    this.stopMusic();

    for (const player of this.assetPlayers.values()) {
      this.stopPlayer(player, true);
      player.src = "";
    }
    this.assetPlayers.clear();
    this.activeMusicAssetId = null;
    this.activeMusicPlayer = null;

    this.fireSynth?.dispose();
    this.explosionSynth?.dispose();
    this.hitSynth?.dispose();
    this.dashSynth?.dispose();
    this.countdownSynth?.dispose();
    this.fightSynth?.dispose();
    this.winSynth?.dispose();
    this.killSynth?.dispose();
    this.respawnSynth?.dispose();
    this.uiClickSynth?.dispose();

    this.initialized = false;
    console.log("[AudioManager.destroy]", "Destroyed");
  }
}

export const AudioManager = new AudioManagerClass();
