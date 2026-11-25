/* Forwards a read-only request to one scholarly database and adds the key or
   email on the server, so neither ever reaches the browser.
   Used by api/openalex.js and api/crossref.js:  /api/openalex?path=/works?search=... */
const HOSTS = { openalex: "https://api.openalex.org", crossref: "https://api.crossref.org" };

module.exports = name => async function handler(req, res) {
  const path = new URL(req.url, "http://x").searchParams.get("path") || "";
  if (req.method !== "GET" || !/^\/works([/?]|$)/.test(path) || path.includes(".."))
    return res.status(400).json({ error: "GET with path=/works... only" });

  const url = new URL(HOSTS[name] + path);
  const email = process.env.CONTACT_EMAIL || "", key = process.env.OPENALEX_API_KEY || "";
  if (email) url.searchParams.set("mailto", email);
  if (name === "openalex" && key) url.searchParams.set("api_key", key);

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const body = await r.text();
    const retry = r.headers.get("Retry-After");
    if (retry) res.setHeader("Retry-After", retry);
    res.status(r.status);
    if (!r.ok) return res.json({ error: `${name} ${r.status}` });   // never echo a body that might repeat our key
    res.setHeader("Content-Type", "application/json");
    res.end(body);
  } catch (e) {
    res.status(502).json({ error: `${name} unreachable` });         // 502 means "cannot check", never "not found"
  }
};
