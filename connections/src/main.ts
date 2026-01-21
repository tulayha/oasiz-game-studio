type Difficulty = "yellow" | "green" | "blue" | "purple";

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface Group {
  id: string;
  name: string;
  difficulty: Difficulty;
  words: string[];
}

interface Puzzle {
  id: string;
  title: string;
  groups: Group[];
}

interface LevelDef {
  id: string;
  timeLimitSec: number;
  puzzle: Puzzle;
}

interface WordItem {
  word: string;
  groupId: string;
  solved: boolean;
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wordsKey(words: string[]): string {
  return words
    .slice()
    .map((w) => w.trim().toUpperCase())
    .sort()
    .join("|");
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private fxGain: GainNode | null = null;
  private musicNodes: OscillatorNode[] = [];
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicLoading: Promise<void> | null = null;

  constructor(private settings: Settings) {
    console.log("[AudioManager] Created");
  }

  private ensure(): void {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.fxGain = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain.connect(this.master);
      this.fxGain.connect(this.master);
      this.updateVolumes();
      console.log("[AudioManager.ensure] Ready");
    } catch (e) {
      console.warn("[AudioManager.ensure] Failed:", e);
    }
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.updateVolumes();
    if (!this.settings.music) {
      this.stopMusic();
    } else {
      // If music was toggled back on, resume if nothing is playing.
      if (!this.musicSource) this.startMusic();
    }
  }

  private updateVolumes(): void {
    if (this.musicGain) this.musicGain.gain.value = this.settings.music ? 0.22 : 0;
    if (this.fxGain) this.fxGain.gain.value = this.settings.fx ? 0.55 : 0;
  }

  startMusic(): void {
    this.ensure();
    if (!this.ctx || !this.musicGain) return;
    if (!this.settings.music) return;
    if (this.musicSource) return;

    if (this.musicBuffer) {
      this.playBufferLoop();
      return;
    }

    if (!this.musicLoading) {
      this.musicLoading = this.loadLoopMusic()
        .then(() => {
          if (this.settings.music) this.playBufferLoop();
        })
        .catch((e) => {
          console.warn(
            "[AudioManager.startMusic] Failed to load loop audio, falling back:",
            e,
          );
          this.startSynthFallback();
        })
        .finally(() => {
          this.musicLoading = null;
        });
    }
  }

  stopMusic(): void {
    if (!this.ctx) return;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {}
      this.musicSource = null;
    }
    const now = this.ctx.currentTime;
    for (const osc of this.musicNodes) {
      try {
        osc.stop(now + 0.05);
      } catch {}
    }
    this.musicNodes = [];
  }

  private playBufferLoop(): void {
    if (!this.ctx || !this.musicGain || !this.musicBuffer) return;
    if (!this.settings.music) return;
    if (this.musicSource) return;

    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.musicBuffer;
      src.loop = true;
      src.connect(this.musicGain);
      src.start(0);
      this.musicSource = src;
      console.log("[AudioManager.playBufferLoop] Started");
    } catch (e) {
      console.warn("[AudioManager.playBufferLoop] Failed:", e);
    }
  }

  private async loadLoopMusic(): Promise<void> {
    if (!this.ctx) return;
    console.log("[AudioManager.loadLoopMusic] Loading src/Quiet Logic Loop.mp3");

    const url = new URL("./Quiet Logic Loop.mp3", import.meta.url);
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    this.musicBuffer = await this.ctx.decodeAudioData(buf.slice(0));
    console.log("[AudioManager.loadLoopMusic] Loaded");
  }

  private startSynthFallback(): void {
    if (!this.ctx || !this.musicGain) return;
    if (!this.settings.music) return;
    if (this.musicNodes.length) return;

    console.log("[AudioManager.startSynthFallback] Starting synth fallback");
    const now = this.ctx.currentTime;
    const freqs = [196, 246.94, 293.66]; // G3, B3, D4

    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqs[i], now);
      osc.detune.setValueAtTime((i - 1) * 7, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 1.2);
      gain.gain.linearRampToValueAtTime(0.14, now + 3.5);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(now);
      this.musicNodes.push(osc);
    }
  }

  click(): void {
    this.ensure();
    if (!this.ctx || !this.fxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.fxGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  success(): void {
    this.ensure();
    if (!this.ctx || !this.fxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
    for (let i = 0; i < freqs.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqs[i], now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.fxGain);
      osc.start(now);
      osc.stop(now + 0.24);
    }
  }

  levelWin(): void {
    this.ensure();
    if (!this.ctx || !this.fxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;

    // Short uplifting arpeggio (longer than success(), distinct from correct-group sound)
    const seq = [392, 523.25, 659.25, 783.99]; // G4 C5 E5 G5
    for (let i = 0; i < seq.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(seq[i], now + i * 0.08);
      gain.gain.setValueAtTime(0.0001, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(this.fxGain);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.26);
    }
  }

  levelLose(): void {
    this.ensure();
    if (!this.ctx || !this.fxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;

    // Low "fail" thud + downward sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.28);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.33);
    osc.connect(gain);
    gain.connect(this.fxGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  error(): void {
    this.ensure();
    if (!this.ctx || !this.fxGain || !this.settings.fx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.fxGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }
}

class ConnectionsGame {
  private readonly maxMistakes = 4;
  private readonly maxSelect = 4;

  private settings: Settings;
  private audio: AudioManager;
  private readonly coaching: boolean;
  private coach: CoachTour | null = null;
  private coachStarted: boolean = false;

  private readonly levels: LevelDef[];
  private levelIndex: number = 0;
  private puzzle: Puzzle;
  private words: WordItem[] = [];
  private selection: Set<string> = new Set();
  private solvedGroupIds: Set<string> = new Set();
  private mistakesRemaining: number = 4;
  private guessesMade: number = 0;
  private mistakesMade: number = 0;
  private startedAtMs: number = 0;
  private ended: boolean = false;
  private submitted: boolean = false;
  private shuffleCount: number = 0;
  private sessionScore: number = 0;

  // Level timer
  private levelEndsAtMs: number = 0;
  private levelStartedAtMs: number = 0;
  private levelTimeLimitSec: number = 0;
  private timerHandle: number | null = null;
  private lastShownTimeSec: number = -1;

  // DOM
  private startScreen = document.getElementById("startScreen")!;
  private startButton = document.getElementById("startButton") as HTMLButtonElement;
  private gameOverScreen = document.getElementById("gameOverScreen")!;
  private restartButton = document.getElementById("restartButton") as HTMLButtonElement;
  private levelCompleteOverlay = document.getElementById("levelCompleteOverlay")!;
  private nextLevelButton = document.getElementById("nextLevelButton") as HTMLButtonElement;

  private hud = document.getElementById("hud")!;
  private topbar = document.getElementById("topbar")!;
  private settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
  private helpBtn = document.getElementById("help-btn") as HTMLButtonElement;
  private menuBtn = document.getElementById("menu-btn") as HTMLButtonElement;
  private wordGrid = document.getElementById("wordGrid")!;
  private solvedGroups = document.getElementById("solvedGroups")!;

  private submitBtn = document.getElementById("submitBtn") as HTMLButtonElement;
  private deselectBtn = document.getElementById("deselectBtn") as HTMLButtonElement;
  private shuffleBtn = document.getElementById("shuffleBtn") as HTMLButtonElement;

  private mistakesValue = document.getElementById("mistakesValue")!;
  private solvedValue = document.getElementById("solvedValue")!;
  private toast = document.getElementById("toast")!;
  private mistakesPill = document.getElementById("mistakesPill")!;
  private solvedPill = document.getElementById("solvedPill")!;
  private levelPill = document.getElementById("levelPill")!;
  private levelValue = document.getElementById("levelValue")!;
  private timePill = document.getElementById("timePill")!;
  private timeValue = document.getElementById("timeValue")!;

  private gameOverTitle = document.getElementById("gameOverTitle")!;
  private gameOverSubtitle = document.getElementById("gameOverSubtitle")!;
  private finalScore = document.getElementById("finalScore")!;
  private resultPill = document.getElementById("resultPill")!;
  private guessesMadeEl = document.getElementById("guessesMade")!;
  private mistakesMadeEl = document.getElementById("mistakesMade")!;
  private levelTimeBonus = document.getElementById("levelTimeBonus")!;
  private levelProgressPill = document.getElementById("levelProgressPill")!;

  private settingsOverlay = document.getElementById("settingsOverlay")!;
  private settingsCloseBtn = document.getElementById("settingsCloseBtn") as HTMLButtonElement;
  private toggleMusic = document.getElementById("toggleMusic")!;
  private toggleFx = document.getElementById("toggleFx")!;
  private toggleHaptics = document.getElementById("toggleHaptics")!;

  constructor() {
    console.log("[ConnectionsGame] Initializing");
    this.settings = this.loadSettings();
    this.audio = new AudioManager(this.settings);
    this.coaching = this.shouldRunCoach();
    this.levels = this.buildLevels();
    this.levelIndex = 0;
    this.puzzle = this.levels[this.levelIndex].puzzle;
    this.resetStateForPuzzle();
    this.bindUI();
    this.syncSettingsUI();
    this.renderAll();
    if (this.coaching) {
      this.coach = new CoachTour(this);
    }

    // Start menu music on first user gesture (autoplay-safe)
    window.addEventListener(
      "pointerdown",
      () => {
        if (!this.startScreen.classList.contains("hidden")) {
          this.audio.startMusic();
        }
      },
      { once: true },
    );

    window.addEventListener("resize", () => this.updateHudSpacing());
  }

  private async fadeScene(action: () => void): Promise<void> {
    const fade = document.getElementById("sceneFade");
    if (!fade) {
      action();
      return;
    }
    fade.classList.add("on");
    await new Promise((r) => window.setTimeout(r, 260));
    action();
    // Let layout settle before fading out
    await new Promise((r) => window.setTimeout(r, 40));
    fade.classList.remove("on");
  }

  private bindUI(): void {
    this.startButton.addEventListener("click", () => {
      console.log("[ConnectionsGame] Start clicked");
      this.triggerHaptic("light");
      this.audio.click();
      this.start();
    });

    this.restartButton.addEventListener("click", () => {
      console.log("[ConnectionsGame] Restart clicked");
      this.triggerHaptic("light");
      this.audio.click();
      this.restart();
    });

    this.nextLevelButton.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      this.advanceLevel();
    });

    this.submitBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      this.submitSelection();
    });

    this.deselectBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      this.clearSelection();
      this.renderGrid();
      this.updateControls();
    });

    this.shuffleBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      const shell = document.getElementById("boardShell");
      if (shell) {
        shell.classList.remove("shuffling");
        void shell.offsetWidth;
        shell.classList.add("shuffling");
      }
      this.shuffleCount++;
      this.shuffleVisibleWords();
      this.renderGrid();
    });

    this.settingsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      this.openSettings();
    });

    this.helpBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      // Allow restarting the tour any time.
      if (!this.coach) this.coach = new CoachTour(this);
      this.coach.start(true);
    });

    this.menuBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      this.goToMainMenu();
    });

    this.settingsCloseBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.audio.click();
      this.closeSettings();
    });

    this.settingsOverlay.addEventListener("click", (e) => {
      if (e.target === this.settingsOverlay) {
        this.triggerHaptic("light");
        this.audio.click();
        this.closeSettings();
      }
    });

    const toggle = (el: HTMLElement, key: keyof Settings) => {
      const handler = () => {
        this.triggerHaptic("light");
        this.audio.click();
        this.settings = { ...this.settings, [key]: !this.settings[key] };
        this.saveSettings();
        this.audio.updateSettings(this.settings);
        if (key === "music" && this.settings.music) {
          // Ensure music resumes immediately when toggled back on.
          this.audio.startMusic();
        }
        this.syncSettingsUI();
      };
      el.addEventListener("click", handler);
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          handler();
        }
      });
    };

    toggle(this.toggleMusic, "music");
    toggle(this.toggleFx, "fx");
    toggle(this.toggleHaptics, "haptics");
  }

  private start(): void {
    void this.fadeScene(() => {
      this.startScreen.classList.add("hidden");
      this.hud.classList.remove("hidden");
      this.settingsBtn.classList.remove("hidden");
      this.helpBtn.classList.remove("hidden");
      this.menuBtn.classList.remove("hidden");
      this.topbar.classList.remove("hidden");
      this.audio.startMusic();
      this.startedAtMs = Date.now();
      this.updateHudSpacing();
    });

    // Start interactive coach tour AFTER the game begins (Play is never part of the tutorial).
    if (this.coaching && this.coach && !this.coachStarted) {
      this.coachStarted = true;
      window.setTimeout(() => this.coach?.start(), 60);
    }

    this.startLevelTimer();
  }

  private restart(): void {
    void this.fadeScene(() => {
      this.closeSettings();
      this.gameOverScreen.classList.add("hidden");
      this.levelCompleteOverlay.classList.add("hidden");
      this.ended = false;
      this.submitted = false;
      this.sessionScore = 0;
      this.levelIndex = 0;
      this.puzzle = this.levels[this.levelIndex].puzzle;
      this.resetStateForPuzzle();
      this.renderAll();
      this.start();
    });
  }

  private goToMainMenu(): void {
    void this.fadeScene(() => {
      // Return to start screen cleanly, without leaving timers running.
      this.stopLevelTimer();
      this.closeSettings();
      this.levelCompleteOverlay.classList.add("hidden");
      this.gameOverScreen.classList.add("hidden");
      this.hud.classList.add("hidden");
      this.settingsBtn.classList.add("hidden");
      this.helpBtn.classList.add("hidden");
      this.menuBtn.classList.add("hidden");
      this.topbar.classList.add("hidden");
      this.startScreen.classList.remove("hidden");
    });
  }

  private resetStateForPuzzle(): void {
    this.selection = new Set();
    this.solvedGroupIds = new Set();
    this.mistakesRemaining = this.maxMistakes;
    this.guessesMade = 0;
    this.mistakesMade = 0;
    this.ended = false;
    this.shuffleCount = 0;
    this.lastShownTimeSec = -1;

    const items: WordItem[] = [];
    for (const g of this.puzzle.groups) {
      for (const w of g.words) {
        items.push({ word: w.toUpperCase(), groupId: g.id, solved: false });
      }
    }
    // Deterministic shuffle by date + puzzle id.
    const seed = this.seedForToday(this.puzzle.id + "_L" + String(this.levelIndex + 1));
    const rand = mulberry32(seed);
    this.words = shuffled(items, rand);
  }

  private seedForToday(extra: string): number {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const base = y * 10000 + m * 100 + day;
    let h = base;
    for (let i = 0; i < extra.length; i++) {
      h = (h * 31 + extra.charCodeAt(i)) >>> 0;
    }
    return h >>> 0;
  }

  private buildLevels(): LevelDef[] {
    // Difficulty ramps via tighter time limits + more abstract/overlapping associations.
    // Keep words short-ish for mobile; all caps for consistent layout.
    const levels: LevelDef[] = [
      {
        id: "L1",
        timeLimitSec: 120,
        puzzle: {
          id: "p2",
          title: "Warm-up",
          groups: [
            { id: "g1", name: "Weather", difficulty: "yellow", words: ["RAIN", "WIND", "SNOW", "FOG"] },
            { id: "g2", name: "Units of time", difficulty: "green", words: ["SECOND", "MINUTE", "HOUR", "DAY"] },
            { id: "g3", name: "Card suits", difficulty: "blue", words: ["SPADE", "HEART", "DIAMOND", "CLUB"] },
            { id: "g4", name: "Double letters", difficulty: "purple", words: ["COFFEE", "BALLOON", "KITTEN", "PUPPY"] },
          ],
        },
      },
      {
        id: "L2",
        timeLimitSec: 115,
        puzzle: {
          id: "p3",
          title: "Easy",
          groups: [
            { id: "g1", name: "Fruits", difficulty: "yellow", words: ["APPLE", "PEAR", "PLUM", "GRAPE"] },
            { id: "g2", name: "Colors", difficulty: "green", words: ["RED", "BLUE", "GREEN", "PINK"] },
            { id: "g3", name: "Planets", difficulty: "blue", words: ["MARS", "VENUS", "EARTH", "SATURN"] },
            { id: "g4", name: "Can be '___ time'", difficulty: "purple", words: ["SHOW", "NAP", "GAME", "SNACK"] },
          ],
        },
      },
      {
        id: "L3",
        timeLimitSec: 110,
        puzzle: {
          id: "p4",
          title: "Easy",
          groups: [
            { id: "g1", name: "Kitchen tools", difficulty: "yellow", words: ["WHISK", "TONGS", "LADLE", "GRATER"] },
            { id: "g2", name: "Fasteners", difficulty: "green", words: ["ZIP", "BUTTON", "SNAP", "CLASP"] },
            { id: "g3", name: "Dog breeds", difficulty: "blue", words: ["BEAGLE", "POODLE", "HUSKY", "BOXER"] },
            { id: "g4", name: "Start with 're-'", difficulty: "purple", words: ["REPLAY", "RENAME", "REWRITE", "REBUILD"] },
          ],
        },
      },
      {
        id: "L4",
        timeLimitSec: 105,
        puzzle: {
          id: "p5",
          title: "Medium",
          groups: [
            { id: "g1", name: "Board games", difficulty: "yellow", words: ["CHESS", "CHECKERS", "SCRABBLE", "SORRY"] },
            { id: "g2", name: "Web verbs", difficulty: "green", words: ["SEARCH", "UPLOAD", "SCROLL", "SHARE"] },
            { id: "g3", name: "Music symbols", difficulty: "blue", words: ["CLEF", "REST", "NOTE", "STAFF"] },
            { id: "g4", name: "Have a 'line'", difficulty: "purple", words: ["PLOT", "JOKE", "TAN", "FISH"] },
          ],
        },
      },
      {
        id: "L5",
        timeLimitSec: 100,
        puzzle: {
          id: "p6",
          title: "Medium",
          groups: [
            { id: "g1", name: "Birds", difficulty: "yellow", words: ["ROBIN", "EAGLE", "CROW", "SWAN"] },
            { id: "g2", name: "Math ops", difficulty: "green", words: ["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE"] },
            { id: "g3", name: "Parts of a book", difficulty: "blue", words: ["COVER", "SPINE", "INDEX", "CHAPTER"] },
            { id: "g4", name: "___ case", difficulty: "purple", words: ["PHONE", "SUIT", "PENCIL", "SHOW"] },
          ],
        },
      },
      {
        id: "L6",
        timeLimitSec: 95,
        puzzle: {
          id: "p7",
          title: "Medium",
          groups: [
            { id: "g1", name: "Sea life", difficulty: "yellow", words: ["EEL", "SHARK", "OCTOPUS", "CRAB"] },
            { id: "g2", name: "Types of shoes", difficulty: "green", words: ["BOOT", "SNEAKER", "SANDAL", "CLOG"] },
            { id: "g3", name: "Textures", difficulty: "blue", words: ["SILKY", "GRITTY", "FROSTY", "WAXY"] },
            { id: "g4", name: "Hidden animal", difficulty: "purple", words: ["CATERPILLAR", "SEALANT", "BEARER", "HORSESHOE"] },
          ],
        },
      },
      {
        id: "L7",
        timeLimitSec: 90,
        puzzle: {
          id: "p8",
          title: "Medium+",
          groups: [
            { id: "g1", name: "Tools", difficulty: "yellow", words: ["HAMMER", "WRENCH", "DRILL", "SAW"] },
            { id: "g2", name: "Email actions", difficulty: "green", words: ["REPLY", "FORWARD", "ARCHIVE", "DELETE"] },
            { id: "g3", name: "Gym equipment", difficulty: "blue", words: ["BARBELL", "DUMBBELL", "TREADMILL", "KETTLEBELL"] },
            { id: "g4", name: "Words with silent letters", difficulty: "purple", words: ["KNIFE", "WRAP", "ISLAND", "SUBTLE"] },
          ],
        },
      },
      {
        id: "L8",
        timeLimitSec: 85,
        puzzle: {
          id: "p9",
          title: "Hard",
          groups: [
            { id: "g1", name: "Office supplies", difficulty: "yellow", words: ["STAPLE", "CLIP", "TAPE", "GLUE"] },
            { id: "g2", name: "Tiny", difficulty: "green", words: ["MINI", "TEENY", "SMALL", "MERE"] },
            { id: "g3", name: "A-listers", difficulty: "blue", words: ["STAR", "ICON", "LEGEND", "NAME"] },
            { id: "g4", name: "Start/end same letter", difficulty: "purple", words: ["LEVEL", "REFER", "RADAR", "CIVIC"] },
          ],
        },
      },
      {
        id: "L9",
        timeLimitSec: 80,
        puzzle: {
          id: "p10",
          title: "Hard",
          groups: [
            { id: "g1", name: "Baked goods", difficulty: "yellow", words: ["SCONE", "MUFFIN", "BAGEL", "BROWNIE"] },
            { id: "g2", name: "Synonyms for steal", difficulty: "green", words: ["SWIPE", "LIFT", "NICK", "PINCH"] },
            { id: "g3", name: "Chess terms", difficulty: "blue", words: ["CHECK", "MATE", "CASTLE", "GAMBIT"] },
            { id: "g4", name: "Contain a number", difficulty: "purple", words: ["ALONE", "FREIGHT", "STONE", "SIXTY"] },
          ],
        },
      },
      {
        id: "L10",
        timeLimitSec: 75,
        puzzle: {
          id: "p11",
          title: "Hard+",
          groups: [
            { id: "g1", name: "Parts of a tree", difficulty: "yellow", words: ["BARK", "RING", "ROOT", "LEAF"] },
            { id: "g2", name: "Crowd reactions", difficulty: "green", words: ["CHEER", "BOO", "GASP", "CLAP"] },
            { id: "g3", name: "Camera terms", difficulty: "blue", words: ["FOCUS", "ZOOM", "LENS", "FLASH"] },
            { id: "g4", name: "Can be a verb and a noun", difficulty: "purple", words: ["DRINK", "DREAM", "FISH", "TEXT"] },
          ],
        },
      },
      {
        id: "L11",
        timeLimitSec: 70,
        puzzle: {
          id: "p12",
          title: "Hard+",
          groups: [
            { id: "g1", name: "Card games", difficulty: "yellow", words: ["POKER", "BRIDGE", "RUMMY", "HEARTS"] },
            { id: "g2", name: "Computer parts", difficulty: "green", words: ["CPU", "RAM", "DISK", "GPU"] },
            { id: "g3", name: "Types of roads", difficulty: "blue", words: ["LANE", "AVENUE", "DRIVE", "BOULEVARD"] },
            { id: "g4", name: "Words that can precede 'room'", difficulty: "purple", words: ["CHAT", "CLASS", "SHOW", "MAIL"] },
          ],
        },
      },
      {
        id: "L12",
        timeLimitSec: 65,
        puzzle: {
          id: "p13",
          title: "Expert",
          groups: [
            { id: "g1", name: "Kinds of lines", difficulty: "yellow", words: ["QUEUE", "TAN", "BORDER", "PUNCH"] },
            { id: "g2", name: "Bird sounds", difficulty: "green", words: ["CHIRP", "COO", "CROAK", "SQUAWK"] },
            { id: "g3", name: "Finance verbs", difficulty: "blue", words: ["INVEST", "SAVE", "SPEND", "BORROW"] },
            { id: "g4", name: "Hidden colors", difficulty: "purple", words: ["BROWNIE", "REDUCE", "GREENHOUSE", "BLUEPRINT"] },
          ],
        },
      },
      {
        id: "L13",
        timeLimitSec: 60,
        puzzle: {
          id: "p14",
          title: "Expert",
          groups: [
            { id: "g1", name: "Coffee add-ins", difficulty: "yellow", words: ["CREAM", "SUGAR", "SYRUP", "CINNAMON"] },
            { id: "g2", name: "Sea directions", difficulty: "green", words: ["PORT", "STARBOARD", "BOW", "STERN"] },
            { id: "g3", name: "Tiny animals", difficulty: "blue", words: ["GNAT", "FLEA", "MITE", "LOUSE"] },
            { id: "g4", name: "Change one letter: day", difficulty: "purple", words: ["BAY", "HAY", "MAY", "PAY"] },
          ],
        },
      },
      {
        id: "L14",
        timeLimitSec: 55,
        puzzle: {
          id: "p15",
          title: "Master",
          groups: [
            { id: "g1", name: "Words on a watch", difficulty: "yellow", words: ["HOUR", "MINUTE", "SECOND", "DATE"] },
            { id: "g2", name: "Punctuation", difficulty: "green", words: ["COMMA", "PERIOD", "COLON", "DASH"] },
            { id: "g3", name: "Tennis terms", difficulty: "blue", words: ["ACE", "SERVE", "RALLY", "VOLLEY"] },
            { id: "g4", name: "Contain a day", difficulty: "purple", words: ["MONARCH", "TUESDAY", "SUNDAY", "FRIDAY"] },
          ],
        },
      },
      {
        id: "L15",
        timeLimitSec: 50,
        puzzle: {
          id: "p16",
          title: "Final",
          groups: [
            { id: "g1", name: "Opposites", difficulty: "yellow", words: ["UP", "DOWN", "IN", "OUT"] },
            { id: "g2", name: "Synonyms for look", difficulty: "green", words: ["SEE", "PEEK", "GLANCE", "STARE"] },
            { id: "g3", name: "Music tempo", difficulty: "blue", words: ["LARGO", "ALLEGRO", "ADAGIO", "PRESTO"] },
            { id: "g4", name: "Start with a note", difficulty: "purple", words: ["DOZEN", "RELAY", "MIAMI", "FABLE"] },
          ],
        },
      },
    ];

    return levels;
  }

  private renderAll(): void {
    this.renderTopbar();
    this.renderSolved();
    this.renderGrid();
    this.updateControls();
    this.updateHudSpacing();
  }

  private renderTopbar(): void {
    this.mistakesValue.textContent = String(this.mistakesRemaining);
    this.solvedValue.textContent = String(this.solvedGroupIds.size) + "/4";
    this.levelValue.textContent = String(this.levelIndex + 1) + "/15";
  }

  private updateHudSpacing(): void {
    // Keep the board from sliding under the top HUD, even when it wraps on mobile.
    try {
      if (this.hud.classList.contains("hidden")) return;
      const r = this.hud.getBoundingClientRect();
      const bottom = Math.max(0, Math.ceil(r.bottom));
      document.documentElement.style.setProperty("--hudBottom", bottom + "px");
    } catch {}
  }

  private startLevelTimer(): void {
    this.stopLevelTimer();
    const lvl = this.levels[this.levelIndex];
    this.levelStartedAtMs = Date.now();
    this.levelTimeLimitSec = lvl.timeLimitSec;
    this.levelEndsAtMs = this.levelStartedAtMs + lvl.timeLimitSec * 1000;
    this.tickTimer(true);
    this.timerHandle = window.setInterval(() => this.tickTimer(false), 200);
  }

  private stopLevelTimer(): void {
    if (this.timerHandle !== null) {
      window.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private tickTimer(force: boolean): void {
    if (this.ended) return;
    const now = Date.now();
    const msLeft = Math.max(0, this.levelEndsAtMs - now);
    const elapsedSec = Math.floor((now - this.levelStartedAtMs) / 1000);
    if (force || elapsedSec !== this.lastShownTimeSec) {
      this.lastShownTimeSec = elapsedSec;
      this.timeValue.textContent = this.formatTime(elapsedSec);
    }
    if (msLeft <= 0) {
      this.onTimeUp();
    }
  }

  private formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const ss = s < 10 ? "0" + String(s) : String(s);
    return String(m) + ":" + ss;
  }

  private onTimeUp(): void {
    if (this.ended) return;
    this.toastMsg("Time.", "bad");
    this.triggerHaptic("error");
    this.audio.error();
    this.end(false, "time");
  }

  private renderSolved(): void {
    this.solvedGroups.innerHTML = "";
    const order: Difficulty[] = ["yellow", "green", "blue", "purple"];
    const groups = this.puzzle.groups
      .filter((g) => this.solvedGroupIds.has(g.id))
      .slice()
      .sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));

    for (const g of groups) {
      const el = document.createElement("div");
      el.className = "group " + g.difficulty;
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = g.name;
      const words = document.createElement("div");
      words.className = "words";
      words.textContent = g.words.map((w) => w.toUpperCase()).join(" • ");
      el.appendChild(name);
      el.appendChild(words);
      this.solvedGroups.appendChild(el);
    }
  }

  private renderGrid(): void {
    this.wordGrid.innerHTML = "";
    const remaining = this.words.filter((w) => !w.solved);
    for (const item of remaining) {
      const btn = document.createElement("button");
      btn.className = "word";
      btn.type = "button";
      btn.textContent = item.word;
      btn.dataset.word = item.word;

      const isSelected = this.selection.has(item.word);
      if (isSelected) btn.classList.add("selected");

      if (this.ended) btn.classList.add("disabled");
      btn.disabled = this.ended;

      btn.addEventListener("click", () => {
        if (this.ended) return;
        this.onWordClicked(item.word);
      });

      this.wordGrid.appendChild(btn);
    }
  }

  private onWordClicked(word: string): void {
    if (this.selection.has(word)) {
      this.selection.delete(word);
      this.triggerHaptic("light");
      this.audio.click();
      this.pulsePill(this.solvedPill);
      this.renderGrid();
      this.updateControls();
      return;
    }
    if (this.selection.size >= this.maxSelect) {
      this.toastMsg("Pick four.", "bad");
      this.triggerHaptic("error");
      this.audio.error();
      this.pulsePill(this.mistakesPill);
      return;
    }
    this.selection.add(word);
    this.triggerHaptic("light");
    this.audio.click();
    this.renderGrid();
    this.updateControls();
  }

  private clearSelection(): void {
    this.selection.clear();
  }

  public coachPrepare(): void {
    this.closeSettings();
    this.clearSelection();
    this.renderGrid();
    this.updateControls();
  }

  public getCoachTargetGroupWords(): string[] | null {
    // Prefer easiest remaining group (yellow -> green -> blue -> purple)
    const order: Difficulty[] = ["yellow", "green", "blue", "purple"];
    const remaining = this.puzzle.groups
      .filter((g) => !this.solvedGroupIds.has(g.id))
      .slice()
      .sort((a, b) => order.indexOf(a.difficulty) - order.indexOf(b.difficulty));

    if (!remaining.length) return null;
    return remaining[0].words.map((w) => w.toUpperCase());
  }

  private updateControls(): void {
    this.submitBtn.disabled = this.selection.size !== 4 || this.ended;
    this.deselectBtn.disabled = this.selection.size === 0 || this.ended;
    this.shuffleBtn.disabled = this.ended;
  }

  private submitSelection(): void {
    if (this.ended) return;
    if (this.selection.size !== 4) return;

    const selected = Array.from(this.selection);
    const selectedKey = wordsKey(selected);
    const unsolvedGroups = this.puzzle.groups.filter((g) => !this.solvedGroupIds.has(g.id));

    this.guessesMade++;
    let matched: Group | null = null;
    for (const g of unsolvedGroups) {
      if (wordsKey(g.words) === selectedKey) {
        matched = g;
        break;
      }
    }

    if (matched) {
      this.solvedGroupIds.add(matched.id);
      for (const w of this.words) {
        if (w.groupId === matched.id) w.solved = true;
      }
      this.animateWords(Array.from(this.selection), "good");
      this.clearSelection();
      this.toastMsg("Correct.", "good");
      this.triggerHaptic("success");
      this.audio.success();
      this.pulsePill(this.solvedPill);
      this.renderSolved();
      this.shuffleVisibleWords(true);
      this.renderGrid();
      this.renderTopbar();
      this.updateControls();

      if (this.solvedGroupIds.size === 4) {
        this.onLevelComplete();
      }
      return;
    }

    // Incorrect
    this.mistakesRemaining = clamp(this.mistakesRemaining - 1, 0, this.maxMistakes);
    this.mistakesMade++;

    const best = this.bestOverlapCount(selected, unsolvedGroups);
    const oneAway = best === 3;
    this.animateWords(selected, "shake");
    this.toastMsg(oneAway ? "One away." : "Nope.", "bad");
    this.triggerHaptic("error");
    this.audio.error();
    this.pulsePill(this.mistakesPill);

    this.renderTopbar();
    this.updateControls();

    if (this.mistakesRemaining <= 0) {
      this.end(false, "mistakes");
    }
  }

  private isOneAway(selected: string[], groups: Group[]): boolean {
    const set = new Set(selected.map((w) => w.toUpperCase()));
    let best = 0;
    for (const g of groups) {
      let hit = 0;
      for (const w of g.words) {
        if (set.has(w.toUpperCase())) hit++;
      }
      best = Math.max(best, hit);
    }
    return best === 3;
  }

  private bestOverlapCount(selected: string[], groups: Group[]): number {
    const set = new Set(selected.map((w) => w.toUpperCase()));
    let best = 0;
    for (const g of groups) {
      let hit = 0;
      for (const w of g.words) {
        if (set.has(w.toUpperCase())) hit++;
      }
      best = Math.max(best, hit);
    }
    return best;
  }

  private shuffleVisibleWords(forceDeterministic: boolean = false): void {
    const remaining = this.words.filter((w) => !w.solved);
    const solved = this.words.filter((w) => w.solved);

    const seed = this.seedForToday(this.puzzle.id) ^ (this.shuffleCount * 0x9e3779b9);
    const rand = mulberry32(seed >>> 0);

    const next = shuffled(remaining, rand);
    this.words = solved.concat(next);

    // optional: when a group is solved, keep a slightly different ordering
    if (forceDeterministic) {
      this.shuffleCount++;
    }
  }

  private toastMsg(msg: string, kind: "good" | "bad" | "neutral" = "neutral"): void {
    this.toast.textContent = msg;
    this.toast.classList.remove("good", "bad");
    if (kind !== "neutral") this.toast.classList.add(kind);
    this.toast.style.display = "block";
    window.clearTimeout((this.toast as any).__t);
    (this.toast as any).__t = window.setTimeout(() => {
      this.toast.style.display = "none";
    }, 1200);
  }

  private animateWords(words: string[], cls: "shake" | "good"): void {
    const nodes = Array.from(this.wordGrid.querySelectorAll("button.word")) as HTMLButtonElement[];
    for (const w of words) {
      const el = nodes.find((b) => b.dataset.word === w);
      if (!el) continue;
      el.classList.remove("shake", "good");
      void el.offsetWidth;
      el.classList.add(cls);
      window.setTimeout(() => el.classList.remove(cls), 380);
    }
  }

  private pulsePill(el: HTMLElement): void {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    window.setTimeout(() => el.classList.remove("bump"), 260);
  }

  private shouldRunCoach(): boolean {
    try {
      const seen = localStorage.getItem("connections_seen_coach");
      return seen !== "true";
    } catch {
      return true;
    }
  }

  private onLevelComplete(): void {
    this.stopLevelTimer();
    this.audio.levelWin();

    const secLeft = Math.max(
      0,
      Math.ceil((this.levelEndsAtMs - Date.now()) / 1000),
    );
    const levelBonus = secLeft * (20 + this.levelIndex * 2);
    this.sessionScore += 250 + levelBonus;

    this.levelTimeBonus.textContent = String(levelBonus);
    this.levelProgressPill.textContent =
      "level " + String(this.levelIndex + 1) + "/15";

    // Hide any open settings during level transition
    this.closeSettings();

    void this.fadeScene(() => {
      this.levelCompleteOverlay.classList.remove("hidden");
    });

    this.triggerHaptic("success");
  }

  private advanceLevel(): void {
    void this.fadeScene(() => {
      this.levelCompleteOverlay.classList.add("hidden");
      this.levelIndex++;

      if (this.levelIndex >= this.levels.length) {
        // Run complete
        this.end(true, "complete");
        return;
      }

      this.puzzle = this.levels[this.levelIndex].puzzle;
      this.resetStateForPuzzle();
      this.renderAll();
      this.startLevelTimer();
    });
  }

  private end(won: boolean, reason: "complete" | "time" | "mistakes"): void {
    if (this.ended) return;
    this.ended = true;
    this.clearSelection();
    this.renderGrid();
    this.updateControls();
    this.stopLevelTimer();

    // Distinct SFX for run completion vs failing a level/run
    if (won) {
      this.audio.levelWin();
    } else {
      this.audio.levelLose();
    }

    const solvedLevels = won ? 15 : this.levelIndex;
    const endBonus = won ? 500 : 0;
    const score = clamp(this.sessionScore + solvedLevels * 100 + endBonus, 0, 999999);

    if (won) {
      this.gameOverTitle.textContent = "run complete";
      this.gameOverSubtitle.textContent = "15 levels cleared";
    } else if (reason === "time") {
      this.gameOverTitle.textContent = "time's up";
      this.gameOverSubtitle.textContent = "try faster group spotting";
    } else {
      this.gameOverTitle.textContent = "out of mistakes";
      this.gameOverSubtitle.textContent = "try a different approach";
    }
    this.finalScore.textContent = String(score);
    this.resultPill.textContent = "level: " + String(this.levelIndex + (won ? 0 : 1)) + "/15";
    this.guessesMadeEl.textContent = String(this.guessesMade);
    this.mistakesMadeEl.textContent = String(this.mistakesMade);

    // Submit score once, only at end.
    if (!this.submitted && typeof (window as any).submitScore === "function") {
      this.submitted = true;
      console.log("[ConnectionsGame.end] Submitting score:", score);
      (window as any).submitScore(score);
    }

    void this.fadeScene(() => {
      this.gameOverScreen.classList.remove("hidden");
    });

    this.triggerHaptic(won ? "success" : "error");
  }

  private openSettings(): void {
    this.settingsOverlay.classList.add("open");
    this.settingsOverlay.setAttribute("aria-hidden", "false");
  }

  private closeSettings(): void {
    this.settingsOverlay.classList.remove("open");
    this.settingsOverlay.setAttribute("aria-hidden", "true");
  }

  private syncSettingsUI(): void {
    const setSwitch = (el: HTMLElement, on: boolean) => {
      el.classList.toggle("on", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
    };
    setSwitch(this.toggleMusic, this.settings.music);
    setSwitch(this.toggleFx, this.settings.fx);
    setSwitch(this.toggleHaptics, this.settings.haptics);
  }

  private triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error"): void {
    if (!this.settings.haptics) return;
    if (typeof (window as any).triggerHaptic === "function") {
      (window as any).triggerHaptic(type);
    }
  }

  private loadSettings(): Settings {
    try {
      const saved = localStorage.getItem("gameSettings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          music: parsed.music !== false,
          fx: parsed.fx !== false,
          haptics: parsed.haptics !== false,
        };
      }
    } catch {}
    return { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem("gameSettings", JSON.stringify(this.settings));
    } catch {}
  }

  public getLevelIndex(): number {
    return this.levelIndex;
  }
}

type CoachStep = {
  title: string;
  text: string;
  target: () => HTMLElement | null;
  afterMs?: number;
  mode?: "target" | "next";
};

class CoachTour {
  private overlay = document.getElementById("coachOverlay")!;
  private card = document.getElementById("coachCard")!;
  private titleEl = document.getElementById("coachTitle")!;
  private textEl = document.getElementById("coachText")!;
  private hintEl = document.getElementById("coachHint")!;
  private nextBtn = document.getElementById("coachNextBtn") as HTMLButtonElement;
  private blockTop = document.getElementById("coachBlockTop")!;
  private blockLeft = document.getElementById("coachBlockLeft")!;
  private blockRight = document.getElementById("coachBlockRight")!;
  private blockBottom = document.getElementById("coachBlockBottom")!;

  private idx: number = 0;
  private currentTarget: HTMLElement | null = null;
  private steps: CoachStep[];

  constructor(private game: ConnectionsGame) {
    this.steps = this.buildSteps();
    window.addEventListener("resize", () => this.refresh());
  }

  start(force: boolean = false): void {
    // Starting the tour always resets selection so we can guide deterministically.
    this.game.coachPrepare();

    // Rebuild steps because words/level/progress can change.
    this.steps = this.buildSteps();

    if (force) {
      this.idx = 0;
      this.clearHighlight();
    } else {
      // If the tour was never started before, begin at step 0.
      this.idx = 0;
    }

    this.open();
    this.showStep(this.idx);
  }

  private buildSteps(): CoachStep[] {
    const anyWord = () => document.querySelector("button.word") as HTMLElement | null;
    const group = this.game.getCoachTargetGroupWords() || [];
    const wordBtn = (w: string) => () =>
      document.querySelector('button.word[data-word="' + w + '"]') as HTMLElement | null;
    const fallbackUnselected = () =>
      document.querySelector("button.word:not(.selected)") as HTMLElement | null;

    // Level 1 scripted onboarding:
    // Select DIAMOND, CLUB, SPADE, RAIN -> deselect RAIN -> select HEART -> submit.
    const scriptedLevel1 =
      this.game.getLevelIndex() === 0 &&
      ["DIAMOND", "CLUB", "SPADE", "RAIN", "HEART"].every(
        (w) => !!wordBtn(w)(),
      );

    if (scriptedLevel1) {
      return [
        {
          title: "objective",
          text:
            "Objective: Find four words that belong together and solve all groups.\n\nWe'll do one together: DIAMOND • CLUB • SPADE • HEART.\n\nTap continue when you're ready.",
          target: () => this.card,
          mode: "next",
        },
        { title: "select", text: "Tap DIAMOND.", target: wordBtn("DIAMOND") },
        { title: "select", text: "Tap CLUB.", target: wordBtn("CLUB") },
        { title: "select", text: "Tap SPADE.", target: wordBtn("SPADE") },
        { title: "select", text: "Tap RAIN.", target: wordBtn("RAIN") },
        {
          title: "fix it",
          text: "Oops — RAIN doesn't match. Tap it again to deselect.",
          target: wordBtn("RAIN"),
        },
        { title: "select", text: "Now tap HEART.", target: wordBtn("HEART") },
        {
          title: "submit",
          text: "Perfect. Tap Submit to confirm the group.",
          target: () => document.getElementById("submitBtn"),
          afterMs: 250,
        },
        {
          title: "keep going",
          text: "Keep going — solve the remaining groups and aim for the highest score.",
          target: anyWord,
          afterMs: 120,
        },
      ];
    }

    return [
      {
        title: "objective",
        text: "Solve four hidden groups of four before you run out of mistakes.",
        target: anyWord,
        afterMs: 150,
      },
      {
        title: "find a group",
        text: "Let’s do a guaranteed-correct group. Tap these four words.",
        target: group[0] ? wordBtn(group[0]) : fallbackUnselected,
      },
      {
        title: "find a group",
        text: "Good. Tap the next one.",
        target: group[1] ? wordBtn(group[1]) : fallbackUnselected,
      },
      {
        title: "find a group",
        text: "Keep going.",
        target: group[2] ? wordBtn(group[2]) : fallbackUnselected,
      },
      {
        title: "find a group",
        text: "One more — then submit.",
        target: group[3] ? wordBtn(group[3]) : fallbackUnselected,
      },
      {
        title: "submit",
        text: "Now tap Submit to lock in your group.",
        target: () => document.getElementById("submitBtn"),
        afterMs: 250,
      },
      {
        title: "shuffle",
        text: "Tap Shuffle to rearrange the grid and spot patterns.",
        target: () => document.getElementById("shuffleBtn"),
      },
      { title: "deselect", text: "Tap a word to select it…", target: fallbackUnselected },
      {
        title: "deselect",
        text: "…then tap Deselect to clear your picks.",
        target: () => document.getElementById("deselectBtn"),
      },
      {
        title: "keep going",
        text: "Nice — keep going. Find the remaining groups and aim for the highest score.",
        target: anyWord,
        afterMs: 120,
      },
    ];
  }

  private open(): void {
    this.overlay.classList.add("open");
    this.overlay.setAttribute("aria-hidden", "false");
    this.hintEl.textContent = "Only the highlighted control is clickable.";
  }

  private close(markSeen: boolean): void {
    this.clearHighlight();
    this.layoutBlockers(null);
    this.overlay.classList.remove("open");
    this.overlay.setAttribute("aria-hidden", "true");
    if (markSeen) {
      try {
        localStorage.setItem("connections_seen_coach", "true");
      } catch {}
    }
  }

  private showStep(i: number): void {
    this.idx = i;
    const step = this.steps[i];
    if (!step) {
      this.close(true);
      return;
    }

    const target = step.target();
    if (!target) {
      window.setTimeout(() => this.showStep(i), 80);
      return;
    }

    this.titleEl.textContent = step.title;
    this.textEl.textContent = step.text;

    // Default: hide the continue button
    this.nextBtn.style.display = "none";

    if (step.mode === "next") {
      // Full-screen dim, no highlighted game control. User advances via the button.
      this.clearHighlight();
      this.layoutBlockersFull();
      this.positionCardCentered();

      this.hintEl.textContent = "Tap continue to start.";
      this.nextBtn.style.display = "inline-flex";
      this.nextBtn.addEventListener(
        "click",
        () => {
          window.setTimeout(() => this.showStep(i + 1), step.afterMs ?? 0);
        },
        { once: true },
      );
      return;
    }

    this.setHighlight(target);
    this.positionCard(target);

    const after = step.afterMs ?? 0;
    target.addEventListener(
      "click",
      () => {
        window.setTimeout(() => this.showStep(i + 1), after);
      },
      { once: true },
    );
  }

  private setHighlight(el: HTMLElement): void {
    this.clearHighlight();
    this.currentTarget = el;
    el.classList.add("coach-highlight");
    this.layoutBlockers(el);
  }

  private clearHighlight(): void {
    if (this.currentTarget) {
      this.currentTarget.classList.remove("coach-highlight");
    }
    this.currentTarget = null;
  }

  private refresh(): void {
    if (!this.currentTarget) return;
    this.layoutBlockers(this.currentTarget);
    this.positionCard(this.currentTarget);
  }

  private layoutBlockers(el: HTMLElement | null): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 10;

    if (!el) {
      // Hide blockers
      for (const b of [this.blockTop, this.blockLeft, this.blockRight, this.blockBottom]) {
        (b as HTMLElement).style.width = "0px";
        (b as HTMLElement).style.height = "0px";
      }
      return;
    }

    const r = el.getBoundingClientRect();
    const holeLeft = clamp(r.left - pad, 0, w);
    const holeTop = clamp(r.top - pad, 0, h);
    const holeRight = clamp(r.right + pad, 0, w);
    const holeBottom = clamp(r.bottom + pad, 0, h);

    // Top
    this.blockTop.style.left = "0px";
    this.blockTop.style.top = "0px";
    this.blockTop.style.width = w + "px";
    this.blockTop.style.height = holeTop + "px";

    // Bottom
    this.blockBottom.style.left = "0px";
    this.blockBottom.style.top = holeBottom + "px";
    this.blockBottom.style.width = w + "px";
    this.blockBottom.style.height = Math.max(0, h - holeBottom) + "px";

    // Left
    this.blockLeft.style.left = "0px";
    this.blockLeft.style.top = holeTop + "px";
    this.blockLeft.style.width = holeLeft + "px";
    this.blockLeft.style.height = Math.max(0, holeBottom - holeTop) + "px";

    // Right
    this.blockRight.style.left = holeRight + "px";
    this.blockRight.style.top = holeTop + "px";
    this.blockRight.style.width = Math.max(0, w - holeRight) + "px";
    this.blockRight.style.height = Math.max(0, holeBottom - holeTop) + "px";
  }

  private layoutBlockersFull(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Top covers everything; others are zero.
    this.blockTop.style.left = "0px";
    this.blockTop.style.top = "0px";
    this.blockTop.style.width = w + "px";
    this.blockTop.style.height = h + "px";
    for (const b of [this.blockLeft, this.blockRight, this.blockBottom]) {
      (b as HTMLElement).style.width = "0px";
      (b as HTMLElement).style.height = "0px";
    }
  }

  private positionCardCentered(): void {
    // Center-ish, respecting safe area.
    const padding = 16;
    this.card.style.left = "50%";
    this.card.style.top = "50%";
    this.card.style.transform = "translate(-50%, -50%)";
    // Keep within viewport if very small.
    const r = this.card.getBoundingClientRect();
    const left = clamp((window.innerWidth - r.width) / 2, padding, window.innerWidth - padding - r.width);
    const top = clamp((window.innerHeight - r.height) / 2, padding, window.innerHeight - padding - r.height);
    this.card.style.left = left + "px";
    this.card.style.top = top + "px";
    this.card.style.transform = "";
  }

  private positionCard(target: HTMLElement): void {
    const r = target.getBoundingClientRect();
    const padding = 12;
    const maxLeft = window.innerWidth - padding;

    // Set a baseline so we can measure.
    this.card.style.left = padding + "px";
    this.card.style.top = padding + "px";

    const cardRect = this.card.getBoundingClientRect();
    const preferBelow = r.bottom + padding + cardRect.height < window.innerHeight - 16;

    const top = preferBelow
      ? r.bottom + padding
      : Math.max(16, r.top - padding - cardRect.height);
    const left = clamp(
      r.left + r.width / 2 - cardRect.width / 2,
      padding,
      maxLeft - cardRect.width,
    );

    this.card.style.left = left + "px";
    this.card.style.top = top + "px";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] Initializing Connections");
  new ConnectionsGame();
});

