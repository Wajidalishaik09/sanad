/* /api/unpaywall?doi=10.x/y   Links only.
   The contact email is added here and never reaches the browser. No answer, an unknown
   DOI (404) or a rate limit (429) is "cannot_check", never "no open copy". */
const cleanDoi = d => String(d || "").toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");

function reduce(d) {
  const b = d.best_oa_location;
  return { is_oa: d.is_oa, oa_status: d.oa_status || null, checked_at: new Date().toISOString(),
    best_oa_location: b ? { url: b.url || null, url_for_pdf: b.url_for_pdf || null, license: b.license || null, host_type: b.host_type || null } : null };
}
module.exports = async function handler(req, res) {
  const doi = cleanDoi(new URL(req.url, "http://x").searchParams.get("doi"));
  const email = process.env.UNPAYWALL_EMAIL;
  const cannot = reason => res.status(200).json({ status: "cannot_check", reason, checked_at: new Date().toISOString() });
  if (req.method !== "GET" || !/^10\.\d{4,9}\/\S+$/.test(doi)) return res.status(400).json({ status: "cannot_check", reason: "GET with doi=10.x/y only" });
  if (!email) return cannot("not set up");
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi).replace(/%2F/gi, "/")}?email=${encodeURIComponent(email)}`;
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    const retry = r.headers.get("Retry-After");
    if (retry) res.setHeader("Retry-After", retry);
    if (r.status === 404) return cannot("unknown DOI");
    if (!r.ok) return cannot(r.status === 429 ? "rate limited" : "no answer");
    const d = await r.json();
    if (cleanDoi(d.doi) !== doi || typeof d.is_oa !== "boolean") return cannot("unusable answer");
    res.status(200).json(reduce(d));
  } catch (e) { cannot("no answer"); }
};
