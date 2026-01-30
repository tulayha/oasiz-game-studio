import { mkdir } from "node:fs/promises";
import { generateImage } from "../../tools/imageGenerator";
import { removeBackground } from "../../tools/backgroundRemover";

type Asset = {
  name: string;
  prompt: string;
  removeBg: boolean;
};

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

async function main(): Promise<void> {
  const outDir = "assets";
  const rawDir = outDir + "/raw";
  await ensureDir(outDir);
  await ensureDir(rawDir);

  const assets: Asset[] = [
    {
      name: "car_player.png",
      removeBg: true,
      prompt:
        "2D top-down car sprite, compact rocket-league style bumper car, neon cyan paint with subtle gradients, thick solid dark outline, simple readable silhouette at small sizes, glowing trim accents, no text, no drop shadow outside the sprite, centered, pure white background, crisp edges, game sprite",
    },
    {
      name: "car_bot.png",
      removeBg: true,
      prompt:
        "2D top-down car sprite, compact rocket-league style bumper car, neon magenta paint with subtle gradients, thick solid dark outline, simple readable silhouette at small sizes, glowing trim accents, no text, no drop shadow outside the sprite, centered, pure white background, crisp edges, game sprite",
    },
    {
      name: "ball.png",
      removeBg: true,
      prompt:
        "2D top-down soccer ball sprite, futuristic panel design, white and pale blue panels, thick solid outline, subtle highlight, no text, no drop shadow, centered, pure white background, crisp vector-like edges",
    },
    {
      name: "goal_frame_top.png",
      removeBg: true,
      prompt:
        "2D top-down goal frame sprite, futuristic neon goal mouth, cyan metal frame with glowing edges, thick solid outline, no text, centered, pure white background, crisp edges",
    },
    {
      name: "goal_frame_bottom.png",
      removeBg: true,
      prompt:
        "2D top-down goal frame sprite, futuristic neon goal mouth, magenta metal frame with glowing edges, thick solid outline, no text, centered, pure white background, crisp edges",
    },
    {
      name: "ui_icon_settings.png",
      removeBg: true,
      prompt:
        "2D UI icon, minimalist solid glyph with thick outline, cyber neon style, icon of a gear (settings), centered, pure white background, no text, crisp edges",
    },
    {
      name: "ui_icon_menu.png",
      removeBg: true,
      prompt:
        "2D UI icon, minimalist solid glyph with thick outline, cyber neon style, icon of a grid menu (main menu), centered, pure white background, no text, crisp edges",
    },
    {
      name: "ui_icon_boost.png",
      removeBg: true,
      prompt:
        "2D UI icon, minimalist solid glyph with thick outline, cyber neon style, icon of a lightning bolt (boost), centered, pure white background, no text, crisp edges",
    },
    {
      name: "joystick_base.png",
      removeBg: true,
      prompt:
        "2D UI sprite, circular joystick base, translucent glass ring with neon cyan edge glow, thick outline, centered, pure white background, no text, crisp edges",
    },
    {
      name: "joystick_knob.png",
      removeBg: true,
      prompt:
        "2D UI sprite, joystick knob, rounded circle with inner highlight, neon cyan glow edge, thick outline, centered, pure white background, no text, crisp edges",
    },
    {
      name: "ui_button_glass.png",
      removeBg: true,
      prompt:
        "2D UI button background sprite, rounded rectangle, glassmorphism style, subtle inner glow, neon cyan highlight, thick solid outline, centered, pure white background, no text, crisp edges, premium",
    },
    {
      name: "turf_tile_1024.png",
      removeBg: false,
      prompt:
        "Seamless tileable top-down futuristic turf texture, dark navy base with subtle grid weave, faint alternating stripes, tiny speckle noise, no large shapes, no text, seamless edges, 1024x1024, high quality",
    },
  ];

  for (const a of assets) {
    const rawPath = rawDir + "/" + a.name;
    const outPath = outDir + "/" + a.name;

    await generateImage(a.prompt, rawPath, { size: "1024x1024", outputFormat: "png" });

    if (a.removeBg) {
      await removeBackground(rawPath, outPath);
    } else {
      const buf = Buffer.from(await Bun.file(rawPath).arrayBuffer());
      await Bun.write(outPath, buf);
    }
  }

  console.log("[generate-assets] Done. Output:", outDir);
}

main().catch((e) => {
  console.error("[generate-assets] Failed:", e);
  process.exit(1);
});

