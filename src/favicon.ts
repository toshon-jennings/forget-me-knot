import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { faviconsDir } from "./store.js";

const FAVICON_REGEX =
  /<link[^>]+rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]+href=["']([^"']+)["']/gi;

export interface FaviconResult {
  favicon: string;
  localPath: string | null;
}

export function defaultFaviconUrl(url: string): string {
  const host = new URL(url).origin;
  return `${host}/favicon.ico`;
}

export function extractFaviconFromHtml(html: string, baseUrl: string): string | null {
  for (const match of html.matchAll(FAVICON_REGEX)) {
    const href = match[1];
    try {
      return new URL(href, baseUrl).href;
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "toolbox/0.1 (+https://github.com/local/toolbox)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

export async function fetchFaviconBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "toolbox/0.1" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function cacheFavicon(id: string, bytes: Buffer): string {
  const dir = faviconsDir();
  const ext = guessExt(bytes);
  const path = join(dir, `${id}.${ext}`);
  writeFileSync(path, bytes);
  return path;
}

export function getCachedFavicon(id: string): string | null {
  const dir = faviconsDir();
  for (const ext of ["png", "ico", "svg", "jpg", "gif", "webp"]) {
    const path = join(dir, `${id}.${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

export async function resolveFavicon(url: string, id: string): Promise<FaviconResult> {
  const cached = getCachedFavicon(id);
  if (cached) {
    return { favicon: defaultFaviconUrl(url), localPath: cached };
  }

  let faviconUrl = defaultFaviconUrl(url);

  try {
    const html = await fetchPage(url);
    const extracted = extractFaviconFromHtml(html, url);
    if (extracted) faviconUrl = extracted;
  } catch {
    // fall back to default
  }

  const bytes = await fetchFaviconBytes(faviconUrl);
  if (bytes) {
    const localPath = cacheFavicon(id, bytes);
    return { favicon: faviconUrl, localPath };
  }

  return { favicon: faviconUrl, localPath: null };
}

function guessExt(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "gif";
  if (buf[0] === 0x3c && buf[1] === 0x3f) return "svg";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "webp";
  return "ico";
}
