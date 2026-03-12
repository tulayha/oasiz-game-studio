/**
 * loadAvatarTexture.ts
 * ────────────────────
 * Load a cross-origin image (e.g. DiceBear) for use as a Pixi texture.
 * Uses Image + crossOrigin so the texture is not tainted and can be drawn in WebGL.
 */

import { Texture } from "pixi.js";

export function loadAvatarTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(Texture.from(img, true));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load avatar image"));
    img.src = url;
  });
}
