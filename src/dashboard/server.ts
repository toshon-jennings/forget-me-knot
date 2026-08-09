import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import { resolveFavicon } from "../favicon.js";
import { addService, dataFile, faviconsDir, load, save, updateService } from "../store.js";
import type { Service } from "../types.js";

const PORT = 4782;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
};

function send(res: any, status: number, body: string | Buffer, type = "text/plain") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function sendJson(res: any, status: number, data: unknown) {
  send(res, status, JSON.stringify(data), "application/json");
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function startDashboard(): void {
  const staticDir = join(__dirname, "static");

  const server = createServer(async (req, res) => {
    const url = req.url ?? "/";

    if (url === "/api/data" && req.method === "GET") {
      return sendJson(res, 200, load());
    }

    if (url === "/api/add" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req));
        const id = randomUUID();
        const parsed = new URL(body.url);
        const name = body.name ?? parsed.hostname.replace(/^www\./, "");

        const { favicon } = await resolveFavicon(body.url, id);
        const now = new Date().toISOString().slice(0, 10);

        const service: Service = {
          id,
          name,
          url: body.url,
          favicon,
          category: body.category ?? null,
          notes: body.notes ?? null,
          addedAt: now,
          lastUsedAt: now,
          status: "active",
        };
        save(addService(load(), service));
        return sendJson(res, 200, { ok: true, id });
      } catch (err) {
        return sendJson(res, 400, { error: String(err) });
      }
    }

    if (url.startsWith("/api/open/") && req.method === "POST") {
      const id = url.replace("/api/open/", "");
      const tb = load();
      const match = tb.services.find((s) => s.id === id);
      if (match) save(updateService(tb, id, { lastUsedAt: new Date().toISOString().slice(0, 10) }));
      return sendJson(res, 200, { ok: true });
    }

    if (url.startsWith("/api/favicon/")) {
      const id = url.replace("/api/favicon/", "");
      const dir = faviconsDir();
      for (const ext of ["png", "ico", "svg", "jpg", "gif", "webp"]) {
        const p = join(dir, `${id}.${ext}`);
        if (existsSync(p)) {
          res.writeHead(200, { "Content-Type": MIME[`.${ext}`] ?? "application/octet-stream" });
          return createReadStream(p).pipe(res);
        }
      }
      return send(res, 404, "not found");
    }

    const filePath = url === "/" ? "index.html" : url.replace(/^\//, "");
    const full = join(staticDir, filePath);

    if (!existsSync(full)) return send(res, 404, "not found");

    const ext = filePath.match(/\.\w+$/)?.[0] ?? "";
    send(res, 200, readFileSync(full), MIME[ext] ?? "text/plain");
  });

  server.listen(PORT, () => {
    console.log(`ToolBox dashboard → http://localhost:${PORT}`);
  });
}
