/* Records real API responses for demo mode. Run once:   node scripts/capture-fixtures.js
   Crossref and OpenAlex go through lib/scholar.js, so keys stay in .env.
   Nothing is edited: each entry is the exact body that came back, with its time. */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
fs.readFileSync(path.join(root, ".env"), "utf8").split("\n").forEach(line => {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] = m[2];
});
const proxy = { openalex: require("../api/openalex"), crossref: require("../api/crossref") };
const wait = ms => new Promise(r => setTimeout(r, ms));
const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const NCBI = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&rettype=xml&id=";

/* ---------- what to record ---------- */
const PAPERS = [{ doi: "10.1371/journal.pmed.0020124", pmcid: "PMC1182327" },     // Ioannidis 2005
                { doi: "10.1371/journal.pone.0005738", pmcid: "PMC2685008" }];    // Fanelli 2009
const RETRACTED = "10.1016/s0140-6736(97)11096-0";                                // Wakefield 1998
const WRONG_DOI = "10.1038/s41586-021-03819-2";                                   // AlphaFold, pasted with another title
const FAKE_DOI  = "10.1016/j.jai.2023.119284";                                    // never registered
const TITLES = ["deep residual learning for image recognition",                   // the paper the wrong DOI was meant for
                "transformer architectures for automated citation integrity",     // fabricated
                "why most citation managers cannot detect invented references"];  // fabricated, real author
const QUESTION = "How reliable are published research findings";
const enc = encodeURIComponent, doiPath = d => enc(d).replace(/%2F/gi, "/");
const words = s => enc(s.toLowerCase());

const crossref = p => "/api/crossref?path=" + enc(p), openalex = p => "/api/openalex?path=" + enc(p);
const urls = [
  ...[...PAPERS.map(p => p.doi), RETRACTED, WRONG_DOI, FAKE_DOI].map(d => crossref(`/works/${doiPath(d)}`)),
  ...[...PAPERS.map(p => p.doi), FAKE_DOI].map(d => openalex(`/works/doi:${doiPath(d)}`)),
  ...TITLES.map(t => openalex(`/works?per-page=8&filter=title.search:${enc(t)}`)),
  ...TITLES.slice(1).map(t => crossref(`/works?rows=5&select=DOI,title,author,issued,container-title&query.bibliographic=${enc(t)}`)),
  openalex(`/works?per-page=15&search=${words(QUESTION)}`),
  openalex(`/works?per-page=4&search=${words(QUESTION + " limitations criticism contradictory evidence")}`),
  `https://doi.org/api/handles/${doiPath(FAKE_DOI)}`,
  ...PAPERS.map(p => `${EPMC}/search?query=${enc(`DOI:"${p.doi}"`)}&format=json&resultType=lite`),
  ...PAPERS.map(p => `${EPMC}/${p.pmcid}/fullTextXML`),
];

/* ---------- recording ---------- */
function viaProxy(url) {
  return new Promise(done => {
    const out = { status: 200, body: "" };
    const res = { setHeader() {}, status(c) { out.status = c; return res; }, json(d) { out.body = JSON.stringify(d); done(out); }, end(b) { out.body = b; done(out); } };
    proxy[url.split("?")[0].split("/").pop()]({ method: "GET", url }, res);
  });
}
async function direct(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  return { status: r.status, body: await r.text() };
}
/* Only a real answer is recorded: 200, or 404 meaning "no such record". */
async function record(url) {
  for (let n = 0; n < 6; n++) {
    try {
      const r = await (url.startsWith("/api/") ? viaProxy(url) : direct(url));
      if (r.status === 200 || r.status === 404) return { url, capturedAt: new Date().toISOString(), ...r };
      console.log("  ", r.status, "trying again");
    } catch (e) { console.log("  ", e.message, "trying again"); }
    await wait(3000 * (n + 1));
  }
  if (/fullTextXML$/.test(url)) {                          // NCBI holds the same article
    const alt = NCBI + url.match(/PMC(\d+)/)[1], r = await direct(alt);
    if (r.status === 200) return { url: alt, capturedAt: new Date().toISOString(), ...r };
  }
  throw new Error("no answer for " + url);
}
(async () => {
  const entries = [];
  for (const url of urls) { const e = await record(url); entries.push(e); console.log(e.status, String(e.body.length).padStart(7), decodeURIComponent(url).slice(0, 100)); await wait(1200); }
  const text = JSON.stringify({ capturedAt: entries[0].capturedAt, entries }, null, 1);
  for (const [k, v] of Object.entries(process.env))
    if (/(_KEY|_EMAIL)$/.test(k) && v.length > 6 && text.includes(v)) throw new Error("refusing to save: response contains " + k);
  fs.writeFileSync(path.join(root, "fixtures", "data.js"), "/* Recorded by scripts/capture-fixtures.js. Real responses, unedited. */\nconst FIXTURE_DATA = " + text + ";\n");
  console.log("saved", entries.length, "responses,", Math.round(text.length / 1024), "KB");
})().catch(e => { console.error("STOPPED:", e.message); process.exit(1); });
