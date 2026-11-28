import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/*
 * A pretend CrossPoint reader: the web server its File Transfer screen runs,
 * as docs/webserver-endpoints.md in CrossPoint describes it, holding its card
 * in memory. Strict where the real one is: no overwriting without asking,
 * folders made only once, and its own files never handed over.
 */

export type PretendCrossPoint = {
  host: string;
  /** The card, by path from its root, like "/Books/Emma.epub". Folders are kept as paths ending in "/". */
  card: Map<string, Buffer>;
  /** What was asked of it, in order, as "METHOD /path". */
  asked: string[];
  close: () => Promise<void>;
};

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((done) => {
    const parts: Buffer[] = [];
    req.on("data", (part) => parts.push(part));
    req.on("end", () => done(Buffer.concat(parts)));
  });

/** The one file in a multipart form, and its name. */
function fileIn(data: Buffer, type: string) {
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  if (!boundary) return null;
  const start = data.indexOf("\r\n\r\n");
  const head = data.subarray(0, start).toString("utf8");
  const name = /filename="([^"]*)"/.exec(head)?.[1];
  const end = data.lastIndexOf(Buffer.from(`\r\n--${boundary}--`));
  if (!name || start < 0 || end < start) return null;
  return { name, data: data.subarray(start + 4, end) };
}

const PROTECTED = /^\/(\.crosspoint|System Volume Information|XTCache)(\/|$)/;

export async function pretendCrossPoint(files: Record<string, string | Buffer> = {}, device = "X4"): Promise<PretendCrossPoint> {
  const card = new Map<string, Buffer>();
  for (const [path, data] of Object.entries(files)) card.set(path, Buffer.from(data));
  for (const path of [...card.keys()]) {
    const parts = path.split("/").slice(1, -1);
    for (let i = 1; i <= parts.length; i++) card.set("/" + parts.slice(0, i).join("/") + "/", Buffer.alloc(0));
  }
  const asked: string[] = [];
  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://reader");
    asked.push(`${req.method} ${url.pathname}`);
    const send = (status: number, text: string, type = "text/plain") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(text);
    };
    if (req.method === "GET" && url.pathname === "/api/status") {
      return send(200, JSON.stringify({ version: "2.0.0", firmwareFamily: "crosspoint", ip: "127.0.0.1", mode: "STA", rssi: -45, device }), "application/json");
    }
    if (req.method === "GET" && url.pathname === "/api/files") {
      const dir = (url.searchParams.get("path") ?? "/").replace(/\/?$/, "/");
      if (dir !== "/" && !card.has(dir)) return send(404, "Not found");
      const seen = new Map<string, { name: string; size: number; isDirectory: boolean; isEpub: boolean }>();
      for (const [path, data] of card) {
        if (!path.startsWith(dir) || path === dir) continue;
        const rest = path.slice(dir.length);
        const name = rest.split("/")[0];
        const isDirectory = rest.includes("/");
        if (name.startsWith(".")) continue;
        seen.set(name, { name, size: isDirectory ? 0 : data.length, isDirectory, isEpub: /\.epub$/i.test(name) });
      }
      return send(200, JSON.stringify([...seen.values()]), "application/json");
    }
    if (req.method === "GET" && url.pathname === "/download") {
      const path = url.searchParams.get("path") ?? "";
      const data = card.get(path);
      if (!data || path.endsWith("/") || PROTECTED.test(path)) return send(404, "Not found");
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      return res.end(data);
    }
    if (req.method === "POST" && url.pathname === "/mkdir") {
      const form = new URLSearchParams((await body(req)).toString("utf8"));
      const path = `${(form.get("path") ?? "/").replace(/\/?$/, "/")}${form.get("name")}/`;
      if (card.has(path)) return send(400, "Folder already exists");
      card.set(path, Buffer.alloc(0));
      return send(200, "Folder created");
    }
    if (req.method === "POST" && url.pathname === "/upload") {
      const dir = (url.searchParams.get("path") ?? "/").replace(/\/?$/, "/");
      const overwrite = /^(1|true)$/.test(url.searchParams.get("overwrite") ?? "");
      const file = fileIn(await body(req), req.headers["content-type"] ?? "");
      if (!file) return send(400, "No file");
      const path = dir + file.name;
      if (dir !== "/" && !card.has(dir)) return send(500, "Failed to create file");
      if (card.has(path) && !overwrite) return send(400, `File already exists: ${file.name}`);
      card.set(path, Buffer.from(file.data));
      return send(200, `File uploaded successfully: ${file.name}`);
    }
    if (req.method === "POST" && url.pathname === "/delete") {
      const form = new URLSearchParams((await body(req)).toString("utf8"));
      const paths = form.get("paths") ? (JSON.parse(form.get("paths")!) as string[]) : [form.get("path") ?? ""];
      for (const path of paths) if (PROTECTED.test(path) || !card.has(path)) return send(400, `Cannot delete: ${path}`);
      for (const path of paths) card.delete(path);
      return send(200, "Deleted");
    }
    send(404, "Not found");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    host: `127.0.0.1:${port}`,
    card,
    asked,
    close: () => new Promise((done) => server.close(() => done())),
  };
}
