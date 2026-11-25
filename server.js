/* ============================================================
   Sanad: local dev server + LLM proxy
   Zero dependencies. Node 18+ (uses global fetch).

       node server.js        →  http://localhost:8000

   The API key is read from .env and never reaches the browser.
   ============================================================ */
const http = require("http");
const fs   = require("fs");
const path = require("path");

/* ---- tiny .env reader (no dotenv dependency) ---- */
const env = {};
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach(line => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch (e) {
  console.log("No .env file found. Copy .env.example to .env and add your key.");
}

const PROVIDER = (env.PROVIDER || "gemini").toLowerCase();
const PORT     = Number(env.PORT || 8000);

/* The template value in .env.example is not a key. */
const realKey  = k => (k && !/^paste-/i.test(k)) ? k : "";
const KEY      = realKey(PROVIDER === "nvidia" ? env.NVIDIA_API_KEY : env.GEMINI_API_KEY);
const TIMEOUT  = 30000;   // a hung model must not freeze the demo
const modelError = async (name, r) => {
  let msg = ""; try { msg = (await r.json()).error?.message || ""; } catch (e) {}
  return new Error(`${name} ${r.status} ${msg}`.trim().slice(0, 160));
};

const MIME = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript",
               ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" };

/* ---------- the model call ---------- */
async function callModel(system, user, schema){
  if (PROVIDER === "nvidia"){
    const key = KEY;
    if (!key) throw new Error("NVIDIA_API_KEY missing from .env");
    const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method:"POST", signal: AbortSignal.timeout(TIMEOUT),
      headers:{ "Authorization":"Bearer "+key, "Content-Type":"application/json" },
      body: JSON.stringify({
        model: env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
        messages:[ {role:"system",content:system}, {role:"user",content:user} ],
        temperature:0.2, max_tokens:1400,
        response_format:{ type:"json_object" }
      })
    });
    if (!r.ok) throw await modelError("NVIDIA", r);
    const d = await r.json();
    return d.choices?.[0]?.message?.content || "";
  }

  /* default: Gemini */
  const key = KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing from .env");
  /* Gemini answers 503 when busy, so a second model stands by. */
  let last;
  for (const model of [env.GEMINI_MODEL || "gemini-3.8-flash", env.GEMINI_FALLBACK || "gemini-3.5-flash-lite"]){
    try { return await callGemini(model, key, system, user, schema); }
    catch (e) { last = e; console.error(`${model}: ${e.message}`); }
  }
  throw last;
}
async function callGemini(model, key, system, user, schema){
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method:"POST", signal: AbortSignal.timeout(TIMEOUT),
    headers:{ "Content-Type":"application/json", "x-goog-api-key":key },
    body: JSON.stringify({
      systemInstruction:{ parts:[{ text: system }] },
      contents:[{ role:"user", parts:[{ text: user }] }],
      generationConfig:{ temperature:0.2, responseMimeType:"application/json",
                         ...(schema ? { responseSchema: schema } : {}) }
    })
  });
  if (!r.ok) throw await modelError("Gemini", r);
  const d = await r.json();
  const text = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

/* ---------- server ---------- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/api/llm" && req.method === "POST"){
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { system, user, schema } = JSON.parse(body || "{}");
        const text = await callModel(system, user, schema);
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify({ ok:true, text, provider:PROVIDER }));
      } catch (e) {
        console.error("LLM error:", e.message);
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify({ ok:false, error:e.message }));
      }
    });
    return;
  }

  if (url.pathname === "/api/health"){
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify({
      ok:true, provider:PROVIDER,
      keyPresent: !!KEY
    }));
    return;
  }

  /* static files. Dotfiles (.env, .git) are never served. */
  if (/\/\./.test(url.pathname)){ res.writeHead(404); res.end("Not found"); return; }
  let f = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(__dirname, path.normalize(f).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, {"Content-Type": MIME[path.extname(file)] || "application/octet-stream"});
    res.end(data);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Sanad running at http://localhost:${PORT}`);
  console.log(`  LLM provider: ${PROVIDER}`);
  console.log(`  Key loaded:   ${!!KEY}\n`);
});
