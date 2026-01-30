import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// Load environment variables
import { config } from "dotenv";
config();

const GAME_NAME = process.argv[2] || "vampire-survivors";

if (!GAME_NAME) {
  console.error("Usage: bun run upload <game-name>");
  process.exit(1);
}

const GAME_DIR = join(process.cwd(), GAME_NAME);
const DIST_FILE = join(GAME_DIR, "dist", "index.html");
const PUBLISH_FILE = join(GAME_DIR, "publish.json");
const THUMBNAIL_DIR = join(GAME_DIR, "thumbnail");

// Check required env vars
const UPLOAD_TOKEN = process.env.OASIZ_UPLOAD_TOKEN;
const EMAIL = process.env.OASIZ_EMAIL;
let API_URL = process.env.OASIZ_API_URL || "https://api.oasiz.ai/api/upload/game";

// Ensure HTTPS if URL starts with http://
if (API_URL.startsWith("http://")) {
  API_URL = API_URL.replace("http://", "https://");
}

if (!UPLOAD_TOKEN || !EMAIL) {
  console.error("Missing required environment variables:");
  console.error("  OASIZ_UPLOAD_TOKEN:", UPLOAD_TOKEN ? "✓" : "✗");
  console.error("  OASIZ_EMAIL:", EMAIL ? "✓" : "✗");
  console.error("\nPlease set these in your .env file or environment.");
  process.exit(1);
}

// Check if dist file already exists
if (!existsSync(DIST_FILE)) {
  console.log(`[Upload] Building ${GAME_NAME}...`);
  
  // Build the game
  try {
    execSync("npm run build", { cwd: GAME_DIR, stdio: "inherit" });
  } catch (error) {
    console.error("[Upload] Build failed!");
    process.exit(1);
  }
} else {
  console.log(`[Upload] Using existing build from dist/index.html`);
}

// Read built HTML
if (!existsSync(DIST_FILE)) {
  console.error(`[Upload] Built file not found: ${DIST_FILE}`);
  process.exit(1);
}

const htmlContent = readFileSync(DIST_FILE, "utf-8");
console.log(`[Upload] Read ${htmlContent.length} bytes from dist/index.html`);

// Read publish.json if it exists
let metadata: any = {
  title: GAME_NAME,
  description: "A game built for Oasiz",
  category: "action",
};

if (existsSync(PUBLISH_FILE)) {
  try {
    const publishData = JSON.parse(readFileSync(PUBLISH_FILE, "utf-8"));
    metadata = { ...metadata, ...publishData };
    console.log(`[Upload] Loaded metadata from publish.json`);
  } catch (error) {
    console.warn(`[Upload] Failed to parse publish.json:`, error);
  }
}

// Read thumbnail if it exists
let thumbnailBase64: string | undefined;
if (existsSync(THUMBNAIL_DIR)) {
  const thumbnailFiles = ["thumbnail.webp", "thumbnail.png", "thumbnail.jpg"];
  for (const filename of thumbnailFiles) {
    const thumbnailPath = join(THUMBNAIL_DIR, filename);
    if (existsSync(thumbnailPath)) {
      const thumbnailBuffer = readFileSync(thumbnailPath);
      thumbnailBase64 = `data:image/${filename.split(".").pop()};base64,${thumbnailBuffer.toString("base64")}`;
      console.log(`[Upload] Loaded thumbnail: ${filename}`);
      break;
    }
  }
}

// Prepare request body - try JSON format
const requestBody: any = {
  html: htmlContent,
  title: metadata.title,
  description: metadata.description,
  category: metadata.category,
  email: EMAIL.replace(/"/g, ""), // Remove quotes from email if present
};

if (thumbnailBase64) {
  requestBody.thumbnail = thumbnailBase64;
}

console.log(`[Upload] Uploading to ${API_URL}...`);
console.log(`[Upload] Game: ${metadata.title}`);
console.log(`[Upload] Category: ${metadata.category}`);

// Upload
try {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPLOAD_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Upload] Upload failed (${response.status}):`, errorText);
    process.exit(1);
  }

  const result = await response.json();
  console.log(`[Upload] ✓ Success!`);
  console.log(`[Upload] Result:`, JSON.stringify(result, null, 2));
} catch (error: any) {
  console.error(`[Upload] Upload error:`, error.message);
  if (error.cause) {
    console.error(`[Upload] Cause:`, error.cause);
  }
  process.exit(1);
}
