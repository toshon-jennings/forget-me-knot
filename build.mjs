import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const dev = process.argv.includes("--dev");

mkdirSync("dist/gui", { recursive: true });

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
