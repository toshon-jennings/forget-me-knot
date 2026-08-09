import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dev = process.argv.includes("--dev");

mkdirSync("dist", { recursive: true });

// Main process — ESM, external electron
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  outfile: "dist/main.js",
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["electron"],
  sourcemap: dev,
});

// Preload — needs to be CJS for Electron sandbox
await build({
  entryPoints: ["src/preload.ts"],
  bundle: true,
  outfile: "dist/preload.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  sourcemap: dev,
});

// GUI — bundle app.js for browser
await build({
  entryPoints: ["src/gui/app.js"],
  bundle: true,
  outfile: "dist/gui/app.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: dev,
});

// Copy static files
copyFileSync("src/gui/index.html", "dist/gui/index.html");
copyFileSync("src/gui/styles.css", "dist/gui/styles.css");

console.log("Build complete.");
