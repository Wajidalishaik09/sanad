/* The only file that talks to a language model. Keys come from the environment.
   Models are tried in order, so one busy provider does not stop the demo. */
const TIMEOUT = 25000;
const key  = name => { const k = process.env[name] || ""; return /^paste-/i.test(k) ? "" : k; };   // template text is not a key
const hasKey = () => !!(key("GEMINI_API_KEY") || key("NVIDIA_API_KEY"));

async function post(name, url, headers, body) {
  const r = await fetch(url, { method: "POST", signal: AbortSignal.timeout(TIMEOUT),
    headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${name} answered ${r.status}`);
  return r.json();
}
async function gemini(model, system, user, schema) {
  const d = await post("Gemini", `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { "x-goog-api-key": key("GEMINI_API_KEY") },
    { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json", ...(schema ? { responseSchema: schema } : {}) } });
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
}
async function nvidia(model, system, user, schema) {
  const shape = schema ? "\nReply with JSON matching this schema: " + JSON.stringify(schema) : "";
  const d = await post("NVIDIA", "https://integrate.api.nvidia.com/v1/chat/completions",
    { Authorization: "Bearer " + key("NVIDIA_API_KEY") },
    { model, messages: [{ role: "system", content: system + shape }, { role: "user", content: user }],
      temperature: 0.2, max_tokens: 8192, 
      response_format: schema ? { type: "json_schema", json_schema: { name: "reply", schema } } : { type: "json_object" },
      chat_template_kwargs: { enable_thinking: false } });        // 1 second instead of 11
  /* content only. reasoning_content is the model thinking aloud, never an answer. */
  return d.choices?.[0]?.message?.content || "";
}
/* An empty, cut-off or wrongly shaped answer counts as a failure, so the next provider is tried. */
function usable(text, schema) {
  const json = String(text || "").match(/[\[{][\s\S]*[\]}]/);
  if (!json) return false;
  try { const d = JSON.parse(json[0]); return (schema?.required || []).every(k => k in d); } catch (e) { return false; }
}
async function ask(system, user, schema) {
  const env = process.env, tries = [];
  if (key("GEMINI_API_KEY"))
    for (const m of new Set([env.GEMINI_MODEL || "gemini-3.8-flash", env.GEMINI_FALLBACK || "gemini-3.5-flash-lite"])) tries.push([gemini, m]);
  if (key("NVIDIA_API_KEY")) tries.push([nvidia, env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b"]);
  if ((env.PROVIDER || "").toLowerCase() === "nvidia") tries.unshift(tries.pop());

  const dead = {};
  let last = new Error("no model key");
  /* Overloads pass quickly, so go round the list a second time. */
  for (const [call, model] of [...tries, ...tries]) {
    if (/ (401|403|410)$/.test(dead[model] || "")) continue;      // a bad key or retired model will not recover
    try {
      const text = await call(model, system, user, schema);
      if (usable(text, schema)) return { text, model };
      last = new Error(model + " returned no usable answer");
    } catch (e) { last = e; }
    dead[model] = last.message;
    console.error("model failed:", model, last.message);
  }
  throw last;
}
module.exports = { ask, hasKey };
