import * as THREE from 'three';

export interface SkinDef {
  id: string;
  name: string;
  type: 'color' | 'texture';
  color: number;
  colorStr: string;
  textureUrl?: string;
  unlockedByDefault: boolean;
  unlockScore: number;
}

export const SKINS: SkinDef[] = [
  { id: 'cyan', name: 'Cyan', type: 'color', color: 0x00E5FF, colorStr: '#00E5FF', unlockedByDefault: true, unlockScore: 0 },
  { id: 'pink', name: 'Pink', type: 'color', color: 0xFF3D71, colorStr: '#FF3D71', unlockedByDefault: true, unlockScore: 0 },
  { id: 'orange', name: 'Orange', type: 'color', color: 0xFFAA00, colorStr: '#FFAA00', unlockedByDefault: true, unlockScore: 0 },
  { id: 'green', name: 'Green', type: 'color', color: 0x00E096, colorStr: '#00E096', unlockedByDefault: true, unlockScore: 0 },
  { id: 'purple', name: 'Purple', type: 'color', color: 0xA259FF, colorStr: '#A259FF', unlockedByDefault: true, unlockScore: 0 },
  { id: 'vermillion', name: 'Vermillion', type: 'color', color: 0xFF6B35, colorStr: '#FF6B35', unlockedByDefault: true, unlockScore: 0 },

  { id: 'redstone', name: 'Redstone', type: 'texture', color: 0xCC0000, colorStr: '#CC0000',
    textureUrl: '/assets/skins/120px-Block_of_Redstone_(texture)_JE2_BE2.png', unlockedByDefault: false, unlockScore: 10 },
  { id: 'diamond', name: 'Diamond', type: 'texture', color: 0x4DD0E1, colorStr: '#4DD0E1',
    textureUrl: '/assets/skins/images.jpg', unlockedByDefault: false, unlockScore: 15 },
  { id: 'grass', name: 'Grass Block', type: 'texture', color: 0x5B8731, colorStr: '#5B8731',
    textureUrl: '/assets/skins/minecraft_grass_block_texture_by_psddude_df8r26t-pre.jpg', unlockedByDefault: false, unlockScore: 20 },
  { id: 'gold-star', name: 'Gold Star', type: 'texture', color: 0xFFD700, colorStr: '#FFD700',
    textureUrl: '/assets/skins/gold-star-pixel-free-vector.jpg', unlockedByDefault: false, unlockScore: 30 },
  { id: 'pixel-star', name: 'Pixel Star', type: 'texture', color: 0xFF8C00, colorStr: '#FF8C00',
    textureUrl: '/assets/skins/pixel-art-illustration-star-pixelated-star-shining-star-pixelated-for-the-pixel-art-game-and-icon-for-website-and-video-game-old-school-retro-vector.jpg', unlockedByDefault: false, unlockScore: 40 },
  { id: 'blaze', name: 'Blaze', type: 'texture', color: 0xFF4500, colorStr: '#FF4500',
    textureUrl: '/assets/skins/New Project.png', unlockedByDefault: false, unlockScore: 50 },
];

export class SkinSystem {
  private textures: Map<string, THREE.Texture> = new Map();
  private unlockedSkins: Set<string> = new Set();
  private textureLoader = new THREE.TextureLoader();

  constructor() {
    this.loadUnlockState();
    this.preloadTextures();
  }

  private loadUnlockState(): void {
    for (const skin of SKINS) {
      if (skin.unlockedByDefault) {
        this.unlockedSkins.add(skin.id);
      }
    }

    let savedUnlocks: string[] = [];
    if (typeof (window as any).loadGameState === 'function') {
      const state = (window as any).loadGameState() ?? {};
      if (Array.isArray(state.unlockedSkins)) {
        savedUnlocks = state.unlockedSkins;
      }
    }

    if (savedUnlocks.length === 0) {
      try {
        const local = localStorage.getItem('paperio-unlocked-skins');
        if (local) savedUnlocks = JSON.parse(local);
      } catch { /* ignore */ }
    }

    for (const id of savedUnlocks) {
      this.unlockedSkins.add(id);
    }
  }

  private saveUnlockState(): void {
    const unlocked = Array.from(this.unlockedSkins);
    if (typeof (window as any).saveGameState === 'function') {
      let currentState: Record<string, unknown> = {};
      if (typeof (window as any).loadGameState === 'function') {
        currentState = (window as any).loadGameState() ?? {};
      }
      (window as any).saveGameState({ ...currentState, unlockedSkins: unlocked });
    }
    try {
      localStorage.setItem('paperio-unlocked-skins', JSON.stringify(unlocked));
    } catch { /* ignore */ }
  }

  private preloadTextures(): void {
    for (const skin of SKINS) {
      if (skin.type === 'texture' && skin.textureUrl) {
        const tex = this.textureLoader.load(skin.textureUrl);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestMipmapLinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.textures.set(skin.id, tex);
      }
    }
  }

  getSkin(id: string): SkinDef | undefined {
    return SKINS.find(s => s.id === id);
  }

  getDefaultSkin(): SkinDef {
    return SKINS[0];
  }

  getTexture(skinId: string): THREE.Texture | null {
    return this.textures.get(skinId) ?? null;
  }

  isUnlocked(skinId: string): boolean {
    return this.unlockedSkins.has(skinId);
  }

  tryUnlock(scorePercent: number): SkinDef[] {
    const newlyUnlocked: SkinDef[] = [];
    for (const skin of SKINS) {
      if (!this.unlockedSkins.has(skin.id) && scorePercent >= skin.unlockScore) {
        this.unlockedSkins.add(skin.id);
        newlyUnlocked.push(skin);
      }
    }
    if (newlyUnlocked.length > 0) {
      this.saveUnlockState();
    }
    return newlyUnlocked;
  }

  getShuffledBotSkins(excludeId: string, count: number): SkinDef[] {
    const pool = SKINS.filter(s => s.id !== excludeId);
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const result: SkinDef[] = [];
    for (let i = 0; i < count; i++) {
      result.push(shuffled[i % shuffled.length]);
    }
    return result;
  }

  getColorSkins(): SkinDef[] {
    return SKINS.filter(s => s.type === 'color');
  }

  getTextureSkins(): SkinDef[] {
    return SKINS.filter(s => s.type === 'texture');
  }
}
