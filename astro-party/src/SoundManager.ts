// ============= SOUND MANAGER =============
// Handles file-based sound effects and audio loops (WAV/MP3 files).
// For synthesized procedural sounds, see AudioManager.ts.
//
// HOW TO ADD A NEW SOUND:
//   1. Drop the file in astro-party/Sound/
//   2. Add an import in the "Asset Imports" section below
//   3. Add the SoundId to the union type
//   4. Add an entry to SOUND_REGISTRY with its config

import { SettingsManager } from "./SettingsManager";

// ─── Asset Imports ────────────────────────────────────────────────────────────
import splashScreenSrc from "../Sound/Splash-Screen-Sound.wav?url";
import mainMenuSrc from "../Sound/Main-Menu-Sound-13.mp3?url";
import logoHitSrc from "../Sound/Logo-Main-Menu-1.wav?url";
// import nextSoundSrc from "../Sound/Next-Sound.wav?url";  ← future sounds here

// ─── Sound IDs ────────────────────────────────────────────────────────────────
// Add new IDs to this union when registering a new sound.
export type SoundId = "splashScreen" | "mainMenu" | "logoSpace" | "logoForce";

// ─── Sound Config ─────────────────────────────────────────────────────────────
interface SoundDef {
  src: string;
  /** 0–1 gain, default 1 */
  volume: number;
  /** Loop indefinitely (for background loops) */
  loop: boolean;
  /** Gate behind the FX toggle in Settings */
  checkFx: boolean;
  /** Gate behind the Music toggle in Settings */
  checkMusic: boolean;
}

// ─── Registry ─────────────────────────────────────────────────────────────────
const SOUND_REGISTRY: Record<SoundId, SoundDef> = {
  splashScreen: {
    src: splashScreenSrc,
    volume: 1.0,
    loop: false,
    checkFx: false,    // cinematic intro — plays regardless of FX setting
    checkMusic: false,
  },
  mainMenu: {
    src: mainMenuSrc,
    volume: 0.6,
    loop: true,
    checkFx: false,
    checkMusic: true,  // respects the Music toggle in Settings
  },
  // Two separate entries → two Audio elements so both can play without interrupting each other.
  logoSpace: {
    src: logoHitSrc,
    volume: 1.0,
    loop: false,
    checkFx: true,
    checkMusic: false,
  },
  logoForce: {
    src: logoHitSrc,
    volume: 1.0,
    loop: false,
    checkFx: true,
    checkMusic: false,
  },
};

// ─── Manager ──────────────────────────────────────────────────────────────────
class SoundManagerClass {
  private cache = new Map<SoundId, HTMLAudioElement>();

  /**
   * Pre-create the Audio element so play() has zero spin-up latency.
   * Call this as early as possible for time-critical sounds.
   */
  preload(id: SoundId): void {
    if (this.cache.has(id)) return;
    const def = SOUND_REGISTRY[id];
    const audio = new Audio(def.src);
    audio.volume = def.volume;
    audio.loop = def.loop;
    audio.preload = "auto";
    this.cache.set(id, audio);
  }

  /**
   * Play a sound. Silently no-ops when blocked by settings.
   * Note: browsers block audio autoplay before the first user gesture —
   * this works automatically on the Oasiz platform (native WebView allows
   * media autoplay). For local browser dev, allow autoplay for localhost in
   * Chrome: address bar lock icon → Sound → Allow.
   */
  async play(id: SoundId): Promise<void> {
    const def = SOUND_REGISTRY[id];
    if (def.checkFx && !SettingsManager.shouldPlayFx()) return;
    if (def.checkMusic && !SettingsManager.shouldPlayMusic()) return;

    let audio = this.cache.get(id);
    if (!audio) {
      audio = new Audio(def.src);
      audio.volume = def.volume;
      audio.loop = def.loop;
      this.cache.set(id, audio);
    }

    audio.currentTime = 0;
    try {
      await audio.play();
    } catch (e) {
      const err = e as DOMException;
      if (err.name === "NotAllowedError") {
        console.log(
          `[SoundManager] "${id}" blocked by autoplay policy. ` +
          `On Oasiz platform this plays automatically. ` +
          `For browser dev: allow sound for localhost in Chrome site settings.`,
        );
      } else {
        console.log(`[SoundManager] "${id}" could not play:`, err.message);
      }
    }
  }

  /** Stop a playing or looping sound and reset its position. */
  stop(id: SoundId): void {
    const audio = this.cache.get(id);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  /** Adjust volume at runtime, e.g. for fade-in / fade-out effects. */
  setVolume(id: SoundId, volume: number): void {
    const audio = this.cache.get(id);
    if (audio) audio.volume = Math.max(0, Math.min(1, volume));
  }

  /** Returns true if the sound is currently playing. */
  isPlaying(id: SoundId): boolean {
    const audio = this.cache.get(id);
    return !!audio && !audio.paused;
  }

  destroy(): void {
    for (const audio of this.cache.values()) {
      audio.pause();
      audio.src = "";
    }
    this.cache.clear();
  }
}

export const SoundManager = new SoundManagerClass();
