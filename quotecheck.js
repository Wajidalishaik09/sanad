/* ============================================================
   AGENT: QUOTE CHECKER. Are these words really in the source?
   Looks in the abstract, then in open-access full text.
   Rule: red "not found" only if the full text was searched.
   No answer from a server is "cannot check", never "not found".
   No AI is called here. Fetched text is data: it is only ever
   searched, and shown as plain text.
   ============================================================ */
const EPMC="https://www.ebi.ac.uk/europepmc/webservices/rest";
const NCBI="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&rettype=xml&id=";
const FULLTEXT={};                // doi -> {state:"full"|"none"|"error"|"loading", texts:[...]}
const MIN_QUOTE=6;                // words; shorter quotes prove nothing
const CLOSE=0.75;                 // Dice on bigrams for a close paraphrase

/* ---------- 1. the same words, however they were typed ---------- */
function foldWord(w){
  return w.normalize("NFKC").toLowerCase()
    .replace(/[“”„«»"‘’`´']+/g,"'").replace(/[‐-―−]/g,"-")
    .replace(/(\p{L})-(?=\p{L})/gu,"$1")                    // long-term = longterm
    .replace(/\\(?=%)/g,"").replace(/%/g," percent").replace(/^'+|'+$/g,"").trim();
}
/* Words, each remembering where it came from, so the original passage can be shown. */
function quoteWords(s){
  const raw=String(s||"").replace(/[\u00AD\u200B\uFEFF]/g,"").replace(/\s*(?:—|--+)\s*/g," - ").replace(/\s+–\s+/g," - ").trim().split(/\s+/);
  const out=[];
  raw.forEach((w,i)=>{
    const prev=out[out.length-1], n=foldWord(w); if(!n) return;
    if(prev&&/\p{L}-$/u.test(prev.n)&&/^\p{L}/u.test(n)){ prev.n=prev.n.slice(0,-1)+n; prev.to=i; }      // cita- tion = citation
    else if(prev&&prev.n==="per"&&/^cent\b/.test(n)){ prev.n="per"+n; prev.to=i; }
    else n.split(" ").forEach(x=>out.push({n:x,from:i,to:i}));
  });
  return {raw,words:out,flat:out.map(x=>x.n).join(" ")};
}
const wordCount=q=>quoteWords(q).words.length;
const trimQuote=q=>q.replace(/^[\s.,;:]+|[\s.,;:]+$/g,"");

/* ---------- 2. searching one text ---------- */
const INDEX=new Map();
function indexed(text){ if(!INDEX.has(text)) INDEX.set(text,quoteWords(text)); return INDEX.get(text); }
const passage=(t,a,b)=>t.raw.slice(t.words[a].from,t.words[b].to+1).join(" ");
const wordAt=(t,pos)=>t.flat.slice(0,pos).split(" ").length-1;
/* Exact words. A match may be followed by a digit or a stop (a footnote mark), not by more letters. */
function findExact(q,t){
  for(let p=t.flat.indexOf(q);p>=0;p=t.flat.indexOf(q,p+1)){
    const before=t.flat[p-1]||" ", after=t.flat[p+q.length]||" ";
    if(/[\p{L}\p{N}]/u.test(before)||/\p{L}/u.test(after)||(/\d$/.test(q)&&/[\d.]/.test(after)&&/\d/.test(t.flat.slice(p+q.length,p+q.length+2)))) continue;
    return passage(t,wordAt(t,p),wordAt(t,p+q.length-1));
  }
  return null;
}
/* Slide a window the length of the quote; score the few windows sharing most words. */
function findClose(q,t){
  const want=q.split(" "), n=want.length, need=new Map(); if(t.words.length<3) return null;
  want.forEach(w=>need.set(w,(need.get(w)||0)+1));
  const size=Math.min(n,t.words.length), tops=[];
  for(let i=0;i+size<=t.words.length;i+=Math.max(1,Math.floor(n/8))){
    const left=new Map(need); let hit=0;
    for(let k=i;k<i+size;k++){ const c=left.get(t.words[k].n); if(c>0){ hit++; left.set(t.words[k].n,c-1); } }
    tops.push([hit,i]);
  }
  const scored=tops.sort((a,b)=>b[0]-a[0]).slice(0,6).map(([,i])=>({i,s:similarity(t.words.slice(i,i+size).map(x=>x.n).join(" "),q)})).sort((a,b)=>b.s-a.s);
  return scored[0]&&scored[0].s>=CLOSE ? {score:scored[0].s,text:passage(t,scored[0].i,scored[0].i+size-1)} : null;
}

/* ---------- 3. open-access full text ---------- */
async function fetchText(url){
  for(let n=0;n<2;n++){
    try{
      const r=await fetch(url,{signal:AbortSignal.timeout(8000)});
      if(r.ok) return await r.text();
      if(r.status===404) return "";                                   // the server answered: there is none
      if(r.status!==429&&r.status<500) break;
    }catch(e){ if(e.notInDemo) throw e; if(n) break; }
    await wait(800);
  }
  throw new Error("no answer");
}
/* Plain text from article XML. Scripts cannot run: it is parsed as XML and only textContent is read. */
function articleText(xml,doi,keepMarks){
  const d=new DOMParser().parseFromString(xml,"text/xml");
  if(d.querySelector("parsererror")) return "";
  const art=d.querySelector("article"); if(!art) return "";
  const own=[...art.querySelectorAll("front article-id, article-meta > article-id")].filter(x=>x.getAttribute("pub-id-type")==="doi").map(x=>stripDoi(x.textContent.trim()));
  const body=[...art.children].find(x=>x.nodeName==="body");
  if(!own.includes(doi)||!body||body.textContent.length<3000) return "";        // wrong paper, or a title page only
  art.querySelectorAll("ref-list,tex-math,sub-article,response,journal-meta").forEach(x=>x.remove());
  if(!keepMarks) art.querySelectorAll('xref[ref-type="bibr"]').forEach(x=>x.remove());
  art.querySelectorAll("p,title,td,th,label,caption,sec,list-item,abstract").forEach(x=>x.append("\n"));
  const abstract=[...art.querySelectorAll("article-meta > abstract")].map(x=>x.textContent).join("\n");
  const text=abstract+"\n"+body.textContent+"\n"+([...art.children].find(x=>x.nodeName==="floats-group")||{textContent:""}).textContent;
  return keepMarks?text:text.replace(/[[(][\s,;–-]*[\])]/g,"").replace(/\s+([.,;:])/g,"$1");
}
async function findPmcid(doi){
  const d=JSON.parse(await fetchText(`${EPMC}/search?query=${encodeURIComponent(`DOI:"${doi}"`)}&format=json&resultType=lite`)||"{}");
  if(!d.resultList) throw new Error("no answer");
  const hit=(d.resultList.result||[]).find(r=>stripDoi(r.doi)===doi&&/^PMC\d+$/.test(r.pmcid||""));
  return hit?hit.pmcid:null;
}
/* Europe PMC first. NCBI holds the same article and is asked too if there is no answer in 2.5 s. */
async function downloadFullText(doi){
  const pmcid=await findPmcid(doi); if(!pmcid) return null;
  let failed=null, done=false;
  const ask=async(url,delay)=>{
    await wait(delay); if(done) throw new Error("not needed");
    let xml; try{ xml=await fetchText(url); }catch(e){ failed=e; throw e; }
    const plain=articleText(xml,doi,false); if(!plain) throw new Error("no full text");
    done=true; return [plain,articleText(xml,doi,true)];
  };
  try{ return await Promise.any([ask(`${EPMC}/${pmcid}/fullTextXML`,0),ask(NCBI+pmcid.slice(3),2500)]); }
  catch(e){ if(failed) throw failed; return null; }
}
/* Saved by DOI in the browser's cache, so a paper checked once works with no network. */
const cacheKey=doi=>"/fulltext-cache/"+encodeURIComponent(doi);
async function fromCache(doi){ try{ const r=await (await caches.open("sanad-fulltext")).match(cacheKey(doi)); const t=r&&await r.json(); return Array.isArray(t)&&t.every(x=>typeof x==="string")&&t.length?t:null; }catch(e){ return null; } }
async function toCache(doi,texts){ try{ await (await caches.open("sanad-fulltext")).put(cacheKey(doi),new Response(JSON.stringify(texts))); }catch(e){} }
async function loadFullText(item){
  const had=FULLTEXT[item.doi];
  if(had&&(had.state==="full"||had.state==="none")) return had;
  if(had&&had.state==="loading") return had.promise;
  const job=(async()=>{
    let texts=DEMO?null:await fromCache(item.doi);
    try{
      if(!texts){ texts=await downloadFullText(item.doi); if(texts&&!DEMO) await toCache(item.doi,texts); }
      return FULLTEXT[item.doi]=texts?{state:"full",texts}:{state:"none"};
    }catch(e){ return FULLTEXT[item.doi]={state:"error",why:e.notInDemo?NOT_IN_DEMO+".":""}; }
  })();
  FULLTEXT[item.doi]={state:"loading",promise:job};
  return job;
}

/* ---------- 4. verdicts ---------- */
const VERDICTS={
  verbatim:  {label:"Found verbatim in full text",               k:"ok",  found:true},
  abstract:  {label:"Found in abstract",                         k:"ok",  found:true},
  close:     {label:"Close paraphrase, not the exact words",     k:"warn"},
  notFound:  {label:"Not found in full text",                    k:"bad"},
  notAbstract:{label:"Not in abstract; full text not checked",   k:"warn"},
  cannot:    {label:"Cannot check",                              k:"info"}
};
const verdict=(name,item,match,why)=>({name,...VERDICTS[name],id:item.id,match:match||"",why:why||""});
/* A one-word change can look alike and mean the opposite. */
function meaningChanged(q,source){
  const nums=s=>(s.match(/\d+(?:[.,]\d+)*/g)||[]).sort().join(" ");
  return (nums(q)!==nums(source)?" Careful: a number differs.":"")+(negations(q)!==negations(source)?" Careful: a negative word was added or left out.":"");
}
const MEMO=new Map();                                        // typing redraws badges often; the answer only changes with the texts
function checkQuote(quote,item){
  const key=[item.id,item.doi,(FULLTEXT[item.doi]||{}).state,quote].join("|");
  if(!MEMO.has(key)) MEMO.set(key,judgeQuote(quote,item));
  return MEMO.get(key);
}
function judgeQuote(quote,item){
  const q=quoteWords(trimQuote(quote)).flat, full=FULLTEXT[item.doi]||{state:"unknown"};
  const inAbs=item.abstract?indexed(item.abstract):null, bodies=full.state==="full"?full.texts.map(indexed):[];
  if(!q) return verdict("cannot",item,"","The quotation is empty.");
  if(inAbs){ const m=findExact(q,inAbs); if(m) return verdict("abstract",item,m); }
  for(const b of bodies){ const m=findExact(q,b); if(m) return verdict("verbatim",item,m); }
  const short=wordCount(quote)<MIN_QUOTE;
  if(!short) for(const t of [inAbs,...bodies].filter(Boolean)){ const c=findClose(q,t); if(c) return verdict("close",item,c.text,`${Math.round(c.score*100)}% alike.${meaningChanged(q,quoteWords(c.text).flat)}`); }
  if(short) return verdict("cannot",item,"",`Too short: a quotation needs at least ${MIN_QUOTE} words.`);
  if(full.state==="full") return verdict("notFound",item,"","The abstract and the open-access full text were searched.");
  if(full.state==="error") return verdict("cannot",item,"",full.why||"The full text could not be fetched. That says nothing about the quote.");
  if(full.state!=="none") return verdict("cannot",item,"",full.state==="loading"?"Looking for the full text now.":"The full text has not been looked up yet.");
  return inAbs?verdict("notAbstract",item,"","No open-access full text is available."):verdict("cannot",item,"","No abstract and no open-access full text are available.");
}
/* The best answer any cited source gives. Red only if every cited source's full text was searched. */
const RANK=["abstract","verbatim","close","cannot","notAbstract","notFound"];
const bestVerdict=(quote,items)=>items.map(i=>checkQuote(quote,i)).sort((a,b)=>RANK.indexOf(a.name)-RANK.indexOf(b.name))[0];

/* Scribe is shown abstracts only, so its quotes are looked for there. */
const quoteInAbstract=(quote,item)=>!!item&&wordCount(quote)>=MIN_QUOTE&&!!item.abstract&&!!findExact(quoteWords(trimQuote(quote)).flat,indexed(item.abstract));

/* ---------- running it ---------- */
async function quoteChecker(claims){
  agent("quote","run","looking for the quoted words");
  const need=new Set(claims.filter(c=>quotesIn(c.text).length).flatMap(c=>c.srcs));
  await Promise.all([...need].map(sourceById).filter(Boolean).map(loadFullText));
  const all=studentClaims().flatMap(c=>c.quotes), n=x=>all.filter(v=>v.name===x).length;
  const found=all.filter(v=>v.found).length;
  agent("quote","done",all.length?`${found} of ${all.length} quote(s) found`:"no quotations");
  if(all.length) log("Quote Checker",`${found} found, ${n("close")} close paraphrase, ${n("notFound")} not found in full text, ${n("notAbstract")} not in abstract (full text not checked), ${n("cannot")} cannot check`,n("notFound")?"block":"");
}
/* After a refresh: verdicts are not stored, so fetch the texts again and judge again. */
async function restoreQuoteChecks(){
  const done=studentClaims().filter(c=>WRITING.checked.includes(c.key)&&quotesIn(c.text).length);
  if(!done.length) return;
  await quoteChecker(done); drawBadges();
}
function quoteLine(v){
  return `<div class="qv ${v.k}"><b>${esc(v.label)}</b> <i>${esc(v.id)}</i> ${esc(v.why)}${v.match?`<br>${v.name==="close"?"Your words: “"+esc(v.quote)+"”<br>":""}Source says: “${esc(v.match)}”`:""}</div>`;
}
