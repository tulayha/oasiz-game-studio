import { AudioManager } from "./AudioManager";
import type { AudioAssetId } from "./audio/assetManifest";

const STARTUP_AUDIO_ASSETS: AudioAssetId[] = [
  "splashScreenSting",
  "logoRevealSting",
];
const AUDIO_PRELOAD_TIMEOUT_MS = 7000;
const IMAGE_PRELOAD_TIMEOUT_MS = 5000;

let startupPreloadPromise: Promise<void> | null = null;

function getSplashLoaderTextElement(): HTMLElement | null {
  return document.getElementById("splashLoaderText");
}

function getSplashScreenElement(): HTMLElement | null {
  return document.getElementById("splashScreen");
}

export function setStartupLoaderState(
  visible: boolean,
  message: string = "Loading assets...",
): void {
  const splash = getSplashScreenElement();
  if (splash) {
    splash.classList.toggle("preloading", visible);
  }

  const loaderText = getSplashLoaderTextElement();
  if (loaderText) {
    loaderText.textContent = message;
  }
}

function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode !== "function") {
    return Promise.resolve();
  }

  return image.decode().catch((error: unknown) => {
    console.log("[Preload.decodeImage]", "Image decode failed");
    console.log("[Preload.decodeImage]", String(error));
  });
}

function preloadSplashLogoImage(): Promise<void> {
  const splashLogo = document.getElementById("splashLogoImage");
  if (!(splashLogo instanceof HTMLImageElement)) {
    console.log("[Preload.preloadSplashLogoImage]", "Splash logo image not found");
    return Promise.resolve();
  }

  if (splashLogo.complete && splashLogo.naturalWidth > 0) {
    return decodeImage(splashLogo);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const finalize = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      splashLogo.removeEventListener("load", handleLoad);
      splashLogo.removeEventListener("error", handleError);
      void decodeImage(splashLogo).finally(() => {
        resolve();
      });
    };

    const handleLoad = (): void => {
      finalize();
    };

    const handleError = (): void => {
      console.log("[Preload.preloadSplashLogoImage]", "Splash logo failed to load");
      finalize();
    };

    timeoutHandle = setTimeout(() => {
      console.log("[Preload.preloadSplashLogoImage]", "Splash logo preload timeout");
      finalize();
    }, IMAGE_PRELOAD_TIMEOUT_MS);

    splashLogo.addEventListener("load", handleLoad);
    splashLogo.addEventListener("error", handleError);
  });
}

export function preloadStartupAssets(): Promise<void> {
  if (startupPreloadPromise !== null) {
    return startupPreloadPromise;
  }

  startupPreloadPromise = (async () => {
    setStartupLoaderState(true, "Loading startup assets...");
    console.log("[Preload.preloadStartupAssets]", "Starting startup preload");
    await Promise.all([
      preloadSplashLogoImage(),
      AudioManager.preloadAssets(STARTUP_AUDIO_ASSETS, AUDIO_PRELOAD_TIMEOUT_MS),
    ]);
    setStartupLoaderState(true, "Starting...");
    console.log("[Preload.preloadStartupAssets]", "Startup preload complete");
  })();

  return startupPreloadPromise;
}
