import { type Difficulty } from './constants.ts';
import { SkinSystem, type SkinDef } from './SkinSystem.ts';

export interface MenuConfig {
  botCount: number;
  difficulty: Difficulty;
  playerSkinId: string;
}

export class Menu {
  private menuScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private pauseOverlay: HTMLElement;
  private shopModal: HTMLElement;
  private skinSystem: SkinSystem;
  private onPlay: ((config: MenuConfig) => void) | null = null;
  private onPlayAgain: (() => void) | null = null;
  private onMainMenu: (() => void) | null = null;
  private config: MenuConfig = { botCount: 5, difficulty: 'medium', playerSkinId: 'cyan' };

  constructor(skinSystem: SkinSystem) {
    this.skinSystem = skinSystem;
    this.menuScreen = document.getElementById('menu-screen')!;
    this.gameOverScreen = document.getElementById('game-over')!;
    this.pauseOverlay = document.getElementById('pause-overlay')!;
    this.shopModal = document.getElementById('shop-modal')!;

    this.setupMenu();
  }

  private setupMenu(): void {
    this.buildShop();

    document.getElementById('play-btn')!.addEventListener('click', () => {
      this.onPlay?.(this.config);
    });

    document.getElementById('how-to-toggle')!.addEventListener('click', () => {
      document.getElementById('how-to-content')!.classList.toggle('show');
    });

    document.getElementById('go-play-again')!.addEventListener('click', () => {
      this.hideGameOver();
      this.onPlayAgain?.();
    });
    document.getElementById('go-main-menu')!.addEventListener('click', () => {
      this.hideGameOver();
      this.onMainMenu?.();
    });
  }

  private buildShop(): void {
    const openBtn = document.getElementById('shop-open-btn');
    const closeBtn = document.getElementById('shop-close-btn');

    openBtn?.addEventListener('click', () => {
      this.refreshShop();
      this.shopModal.classList.add('visible');
    });

    closeBtn?.addEventListener('click', () => {
      this.shopModal.classList.remove('visible');
    });

    this.shopModal.addEventListener('click', (e) => {
      if (e.target === this.shopModal) {
        this.shopModal.classList.remove('visible');
      }
    });

    this.refreshShop();
    this.updatePreview();
  }

  refreshShop(): void {
    const colorsContainer = document.getElementById('shop-colors')!;
    const skinsContainer = document.getElementById('shop-skins')!;

    colorsContainer.innerHTML = '';
    skinsContainer.innerHTML = '';

    for (const skin of this.skinSystem.getColorSkins()) {
      const btn = document.createElement('button');
      btn.className = 'shop-color-btn' + (skin.id === this.config.playerSkinId ? ' selected' : '');
      btn.dataset.skinId = skin.id;
      btn.setAttribute('aria-label', skin.name);

      const swatch = document.createElement('span');
      swatch.className = 'shop-swatch';
      swatch.style.background = skin.colorStr;
      btn.appendChild(swatch);

      btn.addEventListener('click', () => this.selectSkin(skin.id));
      colorsContainer.appendChild(btn);
    }

    for (const skin of this.skinSystem.getTextureSkins()) {
      const btn = document.createElement('button');
      const isUnlocked = this.skinSystem.isUnlocked(skin.id);
      const isSelected = skin.id === this.config.playerSkinId;
      btn.className = 'shop-skin-btn' + (isSelected ? ' selected' : '') + (!isUnlocked ? ' locked' : '');
      btn.dataset.skinId = skin.id;
      btn.setAttribute('aria-label', skin.name);

      const img = document.createElement('img');
      img.className = 'skin-preview';
      img.src = skin.textureUrl ?? '';
      img.alt = skin.name;
      btn.appendChild(img);

      const nameEl = document.createElement('span');
      nameEl.className = 'skin-name';
      nameEl.textContent = skin.name;
      btn.appendChild(nameEl);

      if (!isUnlocked) {
        const overlay = document.createElement('div');
        overlay.className = 'skin-lock-overlay';
        overlay.innerHTML =
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="white">' +
          '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>' +
          '</svg>' +
          '<span>' + skin.unlockScore + '% territory</span>';
        btn.appendChild(overlay);
      }

      if (isUnlocked) {
        btn.addEventListener('click', () => this.selectSkin(skin.id));
      }

      skinsContainer.appendChild(btn);
    }
  }

  private selectSkin(skinId: string): void {
    this.config.playerSkinId = skinId;

    document.querySelectorAll('.shop-color-btn, .shop-skin-btn').forEach(btn => {
      btn.classList.toggle('selected', (btn as HTMLElement).dataset.skinId === skinId);
    });

    this.updatePreview();
  }

  private updatePreview(): void {
    const preview = document.getElementById('shop-preview') as HTMLElement | null;
    if (!preview) return;

    const skin = this.skinSystem.getSkin(this.config.playerSkinId);
    if (!skin) return;

    if (skin.type === 'texture' && skin.textureUrl) {
      preview.style.background = 'url(' + skin.textureUrl + ') center/cover';
      preview.style.borderRadius = '6px';
    } else {
      preview.style.background = skin.colorStr;
      preview.style.borderRadius = '999px';
    }
  }

  setCallbacks(
    onPlay: (config: MenuConfig) => void,
    onPlayAgain: () => void,
    onMainMenu: () => void,
  ): void {
    this.onPlay = onPlay;
    this.onPlayAgain = onPlayAgain;
    this.onMainMenu = onMainMenu;
  }

  showMenu(): void {
    this.menuScreen.style.display = 'flex';
    this.refreshShop();
    this.updatePreview();
  }

  hideMenu(): void {
    this.menuScreen.style.display = 'none';
  }

  showGameOver(score: string, rank: string, time: string, unlockedSkins?: SkinDef[]): void {
    document.getElementById('go-score')!.textContent = score;
    document.getElementById('go-rank')!.textContent = rank;
    document.getElementById('go-time')!.textContent = time;

    const unlockEl = document.getElementById('go-unlocks');
    if (unlockEl) {
      if (unlockedSkins && unlockedSkins.length > 0) {
        const names = unlockedSkins.map(s => s.name).join(', ');
        unlockEl.innerHTML =
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="#E8736C" style="vertical-align:middle;margin-right:4px">' +
          '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>' +
          '</svg>' +
          'Unlocked: <span style="font-weight:700;color:#E8736C">' + names + '</span>';
        unlockEl.style.display = 'block';
      } else {
        unlockEl.style.display = 'none';
      }
    }

    this.gameOverScreen.classList.add('visible');
  }

  hideGameOver(): void {
    this.gameOverScreen.classList.remove('visible');
  }

  showPause(): void {
    this.pauseOverlay.classList.add('visible');
  }

  hidePause(): void {
    this.pauseOverlay.classList.remove('visible');
  }

  get currentConfig(): MenuConfig {
    return this.config;
  }
}
