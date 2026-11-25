/* ============================================================
   AGENT: ACCESS. Asks Unpaywall whether a legal open copy exists
   and shows links, so the student can open the source and check.
   Links only. Nothing here changes a verdict, a label or a gate,
   and no verdict code reads this file. No AI, no full text.
   ============================================================ */
const ACCESS={};                         // doi -> {result, page, pdf, licence, checkedAt, why}
const ACCESS_DAYS=7;                     // a saved answer is asked again after this
const ACCESS_TEXT={
  open_copy:"Open copy",
  no_open_copy_found:"No open copy found. Ask your library.",
  cannot_check:"Could not check right now",
  no_doi:"No DOI, so no copy can be looked up",
  loading:"Looking for an open copy"
};
const accessUrl=doi=>"/api/unpaywall?doi="+encodeURIComponent(doi);

/* Untrusted: only plain web links become links. */
function safeLink(u){
  try{
    const x=new URL(String(u)), web=x.protocol==="https:"||x.protocol==="http:";
    return web&&!x.username&&!x.password&&x.hostname.includes(".")?x.href:"";
  }catch(e){ return ""; }
}
function readAccess(d){
  if(!d||d.status==="cannot_check"||typeof d.is_oa!=="boolean") return {result:"cannot_check",why:String(d&&d.reason||"").slice(0,40)};
  const at=String(d.checked_at||"");
  if(!d.is_oa) return {result:"no_open_copy_found",checkedAt:at};
  const b=d.best_oa_location||{}, page=safeLink(b.url), pdf=safeLink(b.url_for_pdf);
  if(!page&&!pdf) return {result:"cannot_check",why:"no usable link"};
  const licence=typeof b.license==="string"?b.license.slice(0,40):"";
  return {result:"open_copy", page:page||pdf, pdf:pdf!==page?pdf:"", licence, checkedAt:at};
}

/* The one entry point: open_copy, no_open_copy_found, cannot_check or no_doi. */
const hasDoi=doi=>doi.startsWith("10.")&&doi.includes("/");
async function getAccess(ref){
  const doi=stripDoi(ref&&ref.doi);
  if(!hasDoi(doi)) return {result:"no_doi"};
  if(ACCESS[doi]) return ACCESS[doi].promise||ACCESS[doi];
  const promise=askAccess(doi);
  ACCESS[doi]={result:"loading",promise};
  const a=ACCESS[doi]=await promise;
  if(a.result!=="cannot_check") saveStateSoon();
  fillAccess(); drawAccessAgent();
  return a;
}
async function askAccess(doi){
  let a;
  try{ a=readAccess(await getJSON(accessUrl(doi))); }
  catch(e){ a={result:"cannot_check",why:e.notInDemo?NOT_IN_DEMO:"no answer"}; }
  if(!DEMO||isAnswer(a)) log("Access",`looked for an open copy of ${doi}: ${a.result}`);
  if(a.result==="cannot_check") cache.delete(accessUrl(doi));       // a failure is never remembered as an answer
  return a;
}
function tryAgain(doi){ ACCESS[doi]=undefined; getAccess({doi}); fillAccess(); }

/* ---------- saving (called by store.js): only real answers, checked again on the way in ---------- */
const isAnswer=a=>!!a&&(a.result==="open_copy"||a.result==="no_open_copy_found");
function accessToSave(){
  return Object.fromEntries(Object.entries(ACCESS).filter(pair=>isAnswer(pair[1])));
}
function loadAccess(saved){
  if(!saved||typeof saved!=="object") return;
  for(const doi of Object.keys(saved)){
    const a=saved[doi]; if(!isAnswer(a)) continue;
    const age=(Date.now()-Date.parse(a.checkedAt))/86400000;
    if(!(age>=0&&age<ACCESS_DAYS)) continue;
    const again=readAccess({is_oa:a.result==="open_copy",checked_at:a.checkedAt,best_oa_location:{url:a.page,url_for_pdf:a.pdf,license:a.licence}});
    if(again.result===a.result) ACCESS[doi]=again;
  }
}

/* ---------- drawing: placeholders are filled in place, so nothing loses focus ---------- */
function drawAccessAgent(){
  const all=LIB.map(i=>ACCESS[i.doi]).filter(Boolean), n=r=>all.filter(a=>a.result===r).length;
  if(n("loading")) return agent("access","run","looking for open copies");
  agent("access","done",`${n("open_copy")} open, ${n("no_open_copy_found")} none, ${n("cannot_check")} not checked`);
}
function outLink(href,label){
  const a=el("a","out",esc(label)); a.href=href; a.target="_blank"; a.rel="noopener noreferrer"; return a;
}
const recordLink=doi=>"https://doi.org/"+doiPath(doi);
function accessSlot(item,kind){
  const s=el(kind==="chip"?"div":"span","access-slot");
  s.dataset.access=stripDoi(item.doi); s.dataset.kind=kind; s.dataset.id=item.id;
  getAccess(item); return s;
}
function drawChip(slot,a,doi){
  const why=a.why?` (${esc(a.why)})`:"";
  slot.appendChild(el("span","access-chip "+a.result,`<b>Access</b> ${esc(ACCESS_TEXT[a.result])}${why}`));
  if(a.result==="open_copy"){
    slot.append(outLink(a.page,"Open the source"));
    if(a.pdf) slot.append(outLink(a.pdf,"PDF"));
    slot.append(a.licence?`Licence: ${a.licence}`:"Licence not stated");
  }
  if(a.result==="cannot_check") slot.append(button("Try again",()=>tryAgain(doi),"link minor"));
  slot.appendChild(el("div","access-note","Access shows links only. It does not change verification."));
}
function drawLink(slot,a,doi,id){
  if(!hasDoi(doi)) return;
  slot.appendChild(a.result==="open_copy" ? outLink(a.page,`Open the source (${id})`)
                                          : outLink(recordLink(doi),`Open the record (${id}), may be paywalled`));
}
function fillAccess(){
  $$("[data-access]").forEach(slot=>{
    const doi=slot.dataset.access, a=!hasDoi(doi)?{result:"no_doi"}:ACCESS[doi]||{result:"loading"};
    slot.innerHTML="";
    if(slot.dataset.kind==="chip") drawChip(slot,a,doi); else drawLink(slot,a,doi,slot.dataset.id);
  });
}
const accessChip=item=>accessSlot(item,"chip");
function accessLinks(ids){
  const box=el("div","access-links");
  ids.map(id=>LIB.find(i=>i.id===id)).filter(Boolean).forEach(i=>box.appendChild(accessSlot(i,"link")));
  return box;
}
