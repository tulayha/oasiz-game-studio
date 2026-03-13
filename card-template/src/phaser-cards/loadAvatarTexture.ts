/**
 * loadAvatarTexture.ts
 * ─────────────────────
 * Load a cross-origin image (DiceBear, etc.) and register it as a Phaser texture.
 * Uses HTML Image + canvas so WebGL doesn't taint the texture.
 */

export function loadAvatarTexture(
  scene: Phaser.Scene,
  url: string,
  textureKey: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Remove stale texture from previous load cycle
    if (scene.textures.exists(textureKey)) {
      scene.textures.remove(textureKey);
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 64;
        canvas.height = img.naturalHeight || 64;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas 2d not available")); return; }
        ctx.drawImage(img, 0, 0);
        scene.textures.addCanvas(textureKey, canvas);
        resolve(textureKey);
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => reject(new Error(`Failed to load avatar: ${url}`));
    img.src = url;
  });
}
