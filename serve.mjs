import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Inline .env loader — .env.local overrides .env
function loadEnv() {
  const env = {};
  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const HOST = env.ERGOPAD_HOST ?? "localhost";
const PORT = parseInt(env.ERGOPAD_PORT ?? "3000", 10);
const PREFIX = "/ergopad";
const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "docs");

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer((req, res) => {
  const url = req.url.split("?")[0];

  // Redirect /ergopad → /ergopad/
  if (url === PREFIX) {
    res.writeHead(301, { Location: `${PREFIX}/` });
    return res.end();
  }

  // Only serve under /ergopad/
  if (!url.startsWith(`${PREFIX}/`)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("404 Not Found");
  }

  let filePath = join(DOCS_DIR, url.slice(PREFIX.length));

  // Serve index.html for directory requests
  if (filePath.endsWith("/")) filePath = join(filePath, "index.html");

  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Serving docs/ at http://${HOST}:${PORT}${PREFIX}/`);
  if (HOST === "localhost") {
    console.log(`\nTip: To expose via Tailscale, create .env.local with ERGOPAD_HOST=0.0.0.0`);
    console.log(`     then run: tailscale serve --bg ${PORT}`);
  }
});
