/* Vercel serverless function — same contract as server.js.
   Set GEMINI_API_KEY (or NVIDIA_API_KEY + PROVIDER=nvidia) in the Vercel
   dashboard under Settings → Environment Variables. Never in the repo. */
export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"POST only" });
  const { system, user, schema } = req.body || {};
  const provider = (process.env.PROVIDER || "gemini").toLowerCase();
  try{
    let text = "";
    if (provider === "nvidia"){
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method:"POST",
        headers:{ Authorization:"Bearer "+process.env.NVIDIA_API_KEY, "Content-Type":"application/json" },
        body: JSON.stringify({ model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
          messages:[{role:"system",content:system},{role:"user",content:user}],
          temperature:0.2, max_tokens:1400, response_format:{type:"json_object"} })
      });
      if(!r.ok) throw new Error("NVIDIA "+r.status);
      text = (await r.json()).choices?.[0]?.message?.content || "";
    } else {
      /* Gemini answers 503 when busy, so a second model stands by. */
      let error;
      for (const model of [process.env.GEMINI_MODEL || "gemini-3.8-flash", process.env.GEMINI_FALLBACK || "gemini-3.5-flash-lite"]){
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
          method:"POST", headers:{ "Content-Type":"application/json", "x-goog-api-key":process.env.GEMINI_API_KEY },
          body: JSON.stringify({ systemInstruction:{parts:[{text:system}]},
            contents:[{role:"user",parts:[{text:user}]}],
            generationConfig:{ temperature:0.2, responseMimeType:"application/json", ...(schema?{responseSchema:schema}:{}) } })
        });
        if(!r.ok){ error = new Error("Gemini "+r.status); continue; }
        text = ((await r.json()).candidates?.[0]?.content?.parts || []).map(p=>p.text||"").join("");
        if(text) break;
      }
      if(!text) throw error || new Error("Gemini returned no text");
    }
    res.status(200).json({ ok:true, text, provider });
  }catch(e){ res.status(200).json({ ok:false, error:e.message }); }
}
