import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { EMPTY_TOOLBOX, type Service, type ToolBox } from "./types.js";

export function dataDir(): string {
  return join(homedir(), ".toolbox");
}

export function dataFile(): string {
  return join(dataDir(), "toolbox.json");
}

export function faviconsDir(): string {
  return join(dataDir(), "favicons");
}

export function ensureDirs(): void {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const favDir = faviconsDir();
  if (!existsSync(favDir)) mkdirSync(favDir, { recursive: true });
}

export function load(): ToolBox {
  ensureDirs();
  const file = dataFile();
  if (!existsSync(file)) {
    save(EMPTY_TOOLBOX);
    return structuredClone(EMPTY_TOOLBOX);
  }
  const raw = readFileSync(file, "utf-8");
  return JSON.parse(raw) as ToolBox;
}

export function save(toolbox: ToolBox): void {
  ensureDirs();
  const file = dataFile();
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(toolbox, null, 2), "utf-8");
  renameSync(tmp, file);
}

export function addService(toolbox: ToolBox, service: Service): ToolBox {
  const next = structuredClone(toolbox);
  next.services.push(service);
  return next;
}

export function updateService(
  toolbox: ToolBox,
  id: string,
  patch: Partial<Omit<Service, "id">>
): ToolBox {
  const next = structuredClone(toolbox);
  const idx = next.services.findIndex((s) => s.id === id);
  if (idx >= 0) {
    next.services[idx] = { ...next.services[idx], ...patch };
  }
  return next;
}

export function findById(toolbox: ToolBox, id: string): Service | undefined {
  return toolbox.services.find((s) => s.id === id);
}

export function findByQuery(toolbox: ToolBox, query: string): Service[] {
  const q = query.toLowerCase();
  return toolbox.services.filter(
    (s) =>
      s.id === q ||
      s.name.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q) ||
      (s.notes ?? "").toLowerCase().includes(q) ||
      (s.category ?? "").toLowerCase().includes(q)
  );
}
