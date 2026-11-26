/* ============================================================
   EXPORT: the APA 7 list and the short AI use statement.
   Neither is behind Gate 2. Gate 2 still governs claims.
   Plain text cannot show italics, so journal names and volumes
   appear without them; add italics after pasting.
   ============================================================ */

/* ---------- APA 7 ---------- */
const initials = given => given.split(/\s+/).filter(Boolean)
  .map(w=>w.split("-").filter(Boolean).map(x=>x[0].toUpperCase()+".").join("-")).join(" ");
function apaAuthor(name){
  const full=String(name).replace(/[,\s]+(jr|sr|ii|iii)\.?$/i,"").trim(), fam=displayFamily(full);
  const given=full.slice(0,full.lastIndexOf(fam)).trim();
  return given?`${fam}, ${initials(given)}`:fam;
}
function apaAuthors(list,whole){
  const n=(list||[]).filter(Boolean).map(whole?String:apaAuthor);          // an organisation is printed as written
  if(n.length>20) return n.slice(0,19).join(", ")+", . . . "+n[n.length-1];
  return n.length>1 ? n.slice(0,-1).join(", ")+", & "+n[n.length-1] : n[0]||"";
}
/* Venue, volume(issue), pages or article number: whatever the record has. */
function apaSource(it){
  const vol=it.volume?`${it.volume}${it.issue?`(${it.issue})`:""}`:"";
  return [it.venue,vol,it.pages].filter(Boolean).join(", ");
}
const endStop = s => /[.?!]$/.test(s)?s:s+".";
function apa(it,suffix=""){
  const who=apaAuthors(it.authors,it.web), title=endStop(it.title||"[No title]"), src=apaSource(it);
  const year=it.year?it.year+suffix:"n.d."+(suffix?"-"+suffix:"");
  const tail=[src&&endStop(src),it.doi?`https://doi.org/${it.doi}`:it.url].filter(Boolean).join(" ");
  return (who ? `${it.web?endStop(who):who} (${year}). ${title}` : `${title} (${year}).`)+(tail?" "+tail:"");
}
const firstSurname = it => norm((it.authors||[]).length?(it.web?it.authors[0]:displayFamily(it.authors[0])):it.title);
/* Every entry that is not Verified says so wherever it goes. */
const exportMark = it => statusOf(it)==="Verified" ? "" : ` [${statusOf(it).toUpperCase()}]`;
function referenceList(){
  const cited=citedSources(exportDraft()), from=cited.length?cited:[...LIB];
  const lines=from.sort((a,b)=>firstSurname(a).localeCompare(firstSurname(b))||apa(a).localeCompare(apa(b)))
    .map(i=>apa(i,yearSuffix(i))+exportMark(i));
  const note=!LIB.length?"Approve a source to build the list.":cited.length?`Showing the ${cited.length} source(s) you cited.`:`Nothing is cited yet, so this shows all ${LIB.length} approved source(s).`;
  return {text:lines.join("\n\n"),note};
}

/* ---------- copy and download ---------- */
/* Says "Copied" only when the copy worked. Otherwise the text is left selected. */
async function copyText(text,noteId){
  const say=t=>{ $(noteId).textContent=t; };
  try{ await navigator.clipboard.writeText(text); return say("Copied"),true; }catch(e){}
  $$(".copy-box").forEach(b=>b.remove());
  const box=el("textarea","copy-box"); box.value=text; document.body.appendChild(box); box.focus(); box.select();
  let ok=false; try{ ok=document.execCommand("copy"); }catch(e){}
  if(ok){ box.remove(); say("Copied"); return true; }
  box.onblur=()=>box.remove();
  say("Press Cmd+C"); return false;
}
function downloadText(name,text){
  const a=document.createElement("a"), url=URL.createObjectURL(new Blob([text+"\n"],{type:"text/plain;charset=utf-8"}));
  a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ---------- AI use statement: only facts from the log ---------- */
const AGENT_JOBS={ Scout:"searched OpenAlex for sources", Librarian:"looked for duplicates and gaps", Auditor:"checked references",
  "Quote Checker":"looked for quotations in the sources", Access:"looked for open copies" };
/* Model runs are logged as "used model NAME to JOB" when the model has answered. */
function modelRuns(){
  const runs={};
  LOG.forEach(e=>{ const m=e.what.match(/^used model (.+) to (.+)$/); if(m) (runs[m[1]]=runs[m[1]]||new Set()).add(`${e.who}: ${m[2]}`); });
  /* sessions saved by an earlier version logged the run but not the name */
  if(!Object.keys(runs).length&&LOG.some(e=>/ via model|model raised additional/.test(e.what))) runs["a model (name not recorded)"]=new Set(["see the full log"]);
  return Object.entries(runs).map(([model,jobs])=>`${model} (${[...jobs].join("; ")})`);
}
function shortStatement(){
  const runs=modelRuns(), claims=exportDraft().claims, ok=claims.filter(c=>c.label==="Verified").length;
  const jobs=Object.keys(AGENT_JOBS).filter(a=>LOG.some(e=>e.who===a)).map(a=>`${a} ${AGENT_JOBS[a]}`);
  const copied=LOG.some(e=>e.who==="Scribe"&&/by extraction/.test(e.what));
  return [
    runs.length?`AI models used in Sanad: ${runs.join("; ")}.`:"No AI was used.",
    copied?"Scribe also copied sentences from abstracts without a model.":"",
    jobs.length?`Automated steps without AI: ${jobs.join("; ")}.`:"",
    `The student approved ${LIB.length} source(s). Verified claims: ${ok} of ${claims.length}.`,
    `Citations the model attempted that Sanad refused: ${REFUSED}.`,
    DEMO?`Demo data recorded on ${recordedOn} was used; nothing was checked live.`:"",
    "The student reviewed all sources and is accountable for the final work."
  ].filter(Boolean).join(" ");
}

/* ---------- on the Export screen ---------- */
function drawOpenExport(){
  const r=referenceList();
  $("#apaCopied").textContent=$("#shortCopied").textContent="";      // an old "Copied" must not describe new text
  $("#apaOut").textContent=r.text||"No approved sources yet."; $("#apaNote").textContent=r.note;
  $("#copyApa").disabled=$("#downloadApa").disabled=!r.text;
  $("#shortOut").textContent=shortStatement();
}
$("#copyApa").onclick=()=>copyText(referenceList().text,"#apaCopied");
$("#downloadApa").onclick=()=>downloadText("sanad-references-apa7.txt",referenceList().text);
$("#copyShort").onclick=()=>{ drawOpenExport(); return copyText(shortStatement(),"#shortCopied"); };
