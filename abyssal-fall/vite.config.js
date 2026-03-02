import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs/promises";
import path from "node:path";

function hitboxCollidersApi() {
  return {
    name: "hitbox-colliders-api",
    configureServer(server) {
      const collidersPath = path.resolve(process.cwd(), "public", "hitbox-colliders.json");
      server.middlewares.use("/__hitbox-colliders", async (req, res) => {
        try {
          if (req.method === "GET") {
            let payload = "{}";
            try {
              payload = await fs.readFile(collidersPath, "utf8");
            } catch {}
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(payload);
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk.toString();
            });
            req.on("end", async () => {
              try {
                const parsed = JSON.parse(body || "{}");
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                  res.statusCode = 400;
                  res.end("Invalid payload: expected object");
                  return;
                }
                await fs.writeFile(collidersPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ ok: true }));
              } catch (err) {
                res.statusCode = 400;
                res.end(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
              }
            });
            return;
          }

          res.statusCode = 405;
          res.end("Method Not Allowed");
        } catch (err) {
          res.statusCode = 500;
          res.end(`Server error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // Single-file packaging is only needed for production builds.
  plugins: command === "build" ? [viteSingleFile()] : [hitboxCollidersApi()],
  server: {
    // WSL-mounted Windows paths (/mnt/c/...) can miss FS events without polling.
    watch: {
      usePolling: true,
      interval: 120,
    },
  },
  build: {
    target: "esnext",
    minify: true,
    // Ensure everything is inlined into a single file
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  // Suppress warnings during build
  logLevel: "warn",
}));

