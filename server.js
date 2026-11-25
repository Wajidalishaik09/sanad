/* ============================================================
   Sanad: local server. Zero dependencies, Node 18+.

       node server.js        ->  http://localhost:8000

   It serves the site and runs the same api/*.js files Vercel runs.
   Keys are read from .env and never reach the browser.
   ============================================================ */
const http = require("http");
const fs   = require("fs");
const path = require("path");

try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch (e) { console.log("No .env file found. Copy .env.example to .env and add your keys."); }

const PORT = Number(process.env.PORT || 8000);
const API  = {};
for (const name of ["llm", "health", "openalex", "crossref"]) API["/api/" + name] = require("./api/" + name);
const MIME = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript",
               ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };

/* The small part of Vercel's request and response helpers that we use. */
function vercelStyle(req, res, body) {
  try { req.body = body ? JSON.parse(body) : {}; } catch (e) { req.body = {}; }
  res.status = code => { res.statusCode = code; return res; };
  res.json   = data => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); };
}
function serveFile(pathname, res) {
  const file = path.join(__dirname, path.normalize(pathname === "/" ? "/index.html" : pathname));
  if (/\/\./.test(pathname)) { res.writeHead(404); return res.end("Not found"); }   // .env, .git
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}
http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://x");
  const handler = API[pathname];
  if (!handler) return serveFile(pathname, res);
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => { vercelStyle(req, res, body); handler(req, res); });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Sanad running at http://localhost:${PORT}`);
  console.log(`  Model key:    ${require("./lib/model").hasKey()}`);
  console.log(`  OpenAlex key: ${!!process.env.OPENALEX_API_KEY}\n`);
});
