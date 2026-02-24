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
import mainMenuSrc from "../Sound/Audio-Main-Menu-5.m4a?url";
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
  /** Loop indefinitely — uses Web Audio API for gapless playback */
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
    checkFx: false,   // cinematic intro — plays regardless of FX setting
    checkMusic: false,
  },
  mainMenu: {
    src: mainMenuSrc,
    volume: 0.51,
    loop: true,
    checkFx: false,
    checkMusic: true, // respects the Music toggle in Settings
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

  // Web Audio API — used for gapless looping (avoids AAC encoder-padding gap)
  private audioCtx: AudioContext | null = null;
  private seamlessBuffers = new Map<SoundId, AudioBuffer>();
  private loopNodes = new Map<SoundId, { source: AudioBufferSourceNode; gain: GainNode }>();

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    return this.audioCtx;
  }

  /**
   * Pre-create the Audio element so play() has zero spin-up latency.
   * Call this as early as possible for time-critical sounds.
   */
  preload(id: SoundId): void {
    const def = SOUND_REGISTRY[id];
    if (def.loop) {
      // Pre-fetch & decode into an AudioBuffer so start is instant
      void this.prefetchLoopBuffer(id, def);
      return;
    }
    if (this.cache.has(id)) return;
    const audio = new Audio(def.src);
    audio.volume = def.volume;
    audio.loop = false;
    audio.preload = "auto";
    this.cache.set(id, audio);
  }

  /**
   * Build a seamless-loop AudioBuffer from a decoded source:
   *  1. Trim silent encoder padding from both ends.
   *  2. Crossfade the tail into the head so the wrap-around is inaudible.
   *
   * Result: a buffer that can be played with `source.loop = true` from
   * sample 0 to the end with zero gap or pop.
   */
  private buildSeamlessLoop(raw: AudioBuffer, crossfadeSec = 0.15): AudioBuffer {
    const ctx = this.getAudioContext();
    const sr = raw.sampleRate;
    const channels = raw.numberOfChannels;
    const len = raw.length;
    const threshold = 0.005;

    // ── 1. Find content boundaries (skip AAC encoder padding) ──
    let firstLoud = 0;
    let lastLoud = len - 1;

    for (let ch = 0; ch < channels; ch++) {
      const d = raw.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        if (Math.abs(d[i]) > threshold) { firstLoud = Math.max(firstLoud, 0); if (ch === 0 || i < firstLoud) firstLoud = i; break; }
      }
      for (let i = len - 1; i >= 0; i--) {
        if (Math.abs(d[i]) > threshold) { if (ch === 0 || i > lastLoud) lastLoud = i; break; }
      }
    }

    const margin = 64; // ~1.5 ms safety
    const trimStart = Math.max(0, firstLoud - margin);
    const trimEnd = Math.min(len, lastLoud + margin + 1);
    const contentLen = trimEnd - trimStart;

    // ── 2. Crossfade tail↔head ──
    const crossfadeSamples = Math.min(
      Math.floor(crossfadeSec * sr),
      Math.floor(contentLen / 4), // never more than 25 % of content
    );

    // Final buffer length = content minus the overlapping crossfade region
    const finalLen = contentLen - crossfadeSamples;
    if (finalLen <= 0) {
      // Content too short for crossfade — return raw trimmed copy
      const buf = ctx.createBuffer(channels, contentLen, sr);
      for (let ch = 0; ch < channels; ch++)
        buf.getChannelData(ch).set(raw.getChannelData(ch).subarray(trimStart, trimEnd));
      return buf;
    }

    const out = ctx.createBuffer(channels, finalLen, sr);

    for (let ch = 0; ch < channels; ch++) {
      const src = raw.getChannelData(ch);
      const dst = out.getChannelData(ch);

      // Copy the head + middle (first `finalLen` samples of trimmed content)
      for (let i = 0; i < finalLen; i++) {
        dst[i] = src[trimStart + i];
      }

      // Blend: for the first `crossfadeSamples` of the buffer, mix in the
      // tail that we cut off. At i = 0 the tail dominates (end of the track),
      // at i = crossfadeSamples the head dominates (start of the track).
      // This makes the wrap-around point (end→start) completely smooth.
      for (let i = 0; i < crossfadeSamples; i++) {
        const t = i / crossfadeSamples;               // 0 → 1
        const headSample = dst[i];                     // beginning of track
        const tailSample = src[trimStart + finalLen + i]; // end of track
        // Equal-power crossfade for smooth energy transition
        dst[i] = tailSample * Math.cos(t * Math.PI * 0.5)
               + headSample * Math.sin(t * Math.PI * 0.5);
      }
    }

    return out;
  }

  private async prefetchLoopBuffer(id: SoundId, def: SoundDef): Promise<void> {
    if (this.seamlessBuffers.has(id)) return;
    try {
      const res = await fetch(def.src);
      const arrayBuffer = await res.arrayBuffer();
      const ctx = this.getAudioContext();
      const raw = await ctx.decodeAudioData(arrayBuffer);
      this.seamlessBuffers.set(id, this.buildSeamlessLoop(raw));
    } catch (e) {
      console.log(`[SoundManager] prefetch failed for "${id}":`, e);
    }
  }

  private async playLoop(id: SoundId, def: SoundDef): Promise<void> {
    // Stop any existing loop node first
    this.stopLoop(id);

    const ctx = this.getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // Build seamless buffer if not already cached
    let buffer = this.seamlessBuffers.get(id);
    if (!buffer) {
      const res = await fetch(def.src);
      const arrayBuffer = await res.arrayBuffer();
      const raw = await ctx.decodeAudioData(arrayBuffer);
      buffer = this.buildSeamlessLoop(raw);
      this.seamlessBuffers.set(id, buffer);
    }

    const gain = ctx.createGain();
    gain.gain.value = def.volume;
    gain.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Buffer is already trimmed + crossfaded — loop from 0 to end
    source.connect(gain);
    source.start(0);

    this.loopNodes.set(id, { source, gain });
  }

  private stopLoop(id: SoundId): void {
    const node = this.loopNodes.get(id);
    if (!node) return;
    try {
      node.source.stop();
    } catch {
      // already stopped
    }
    node.gain.disconnect();
    this.loopNodes.delete(id);
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

    // Looping sounds go through Web Audio API for gapless playback
    if (def.loop) {
      await this.playLoop(id, def);
      return;
    }

    let audio = this.cache.get(id);
    if (!audio) {
      audio = new Audio(def.src);
      audio.volume = def.volume;
      audio.loop = false;
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
    const def = SOUND_REGISTRY[id];
    if (def.loop) {
      this.stopLoop(id);
      return;
    }
    const audio = this.cache.get(id);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  /** Adjust volume at runtime, e.g. for fade-in / fade-out effects. */
  setVolume(id: SoundId, volume: number): void {
    const def = SOUND_REGISTRY[id];
    const clamped = Math.max(0, Math.min(1, volume));
    if (def.loop) {
      const node = this.loopNodes.get(id);
      if (node) node.gain.gain.value = clamped;
      return;
    }
    const audio = this.cache.get(id);
    if (audio) audio.volume = clamped;
  }

  /** Returns true if the sound is currently playing. */
  isPlaying(id: SoundId): boolean {
    const def = SOUND_REGISTRY[id];
    if (def.loop) return this.loopNodes.has(id);
    const audio = this.cache.get(id);
    return !!audio && !audio.paused;
  }

  destroy(): void {
    for (const id of [...this.loopNodes.keys()]) {
      this.stopLoop(id as SoundId);
    }
    for (const audio of this.cache.values()) {
      audio.pause();
      audio.src = "";
    }
    this.cache.clear();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

export const SoundManager = new SoundManagerClass();
