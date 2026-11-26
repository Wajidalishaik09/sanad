/* ============================================================
   A STATUS FOR EVERY REFERENCE, AND THE STUDENT DECIDES.
   Reads a pasted line, shows what was found, and offers choices:
   add, leave out, accept a fix, keep mine, merge, keep both.
   Nothing is added, corrected, swapped or deleted on its own.
   No AI is called here. Verdicts still come from verifyLine.
   ============================================================ */

/* ---------- reading a line: APA, Harvard, Vancouver, web page ---------- */
const URL_RE=/https?:\/\/[^\s"<>]+/i;
const ORG_WORD=/\b(organi[sz]ation|institute|university|agency|association|foundation|ministry|department|council|society|bank|cent(?:re|er)|nations|government|office|commission|authority|service)\b/i;
const stripRefs = l => String(l).replace(/^\s*(\[\d+\]|\d{1,3}[.)])\s+/,"").replace(/https?:\/\/\S+/g," ").replace(/\b(doi:\s*)?10\.\d{4,9}\/\S+/gi," ").replace(/\s+/g," ").trim();
const noStop = s => String(s||"").trim().replace(/[.,;]+$/,"");

/* "FAMILY AB, FAMILY C. Title. Journal 2015;521(2):436-44." */
function readVancouver(s){
  const m=s.match(/^(.+?)\.\s+(.+?[.?!])\s+([^;]+?)\.?\s+((?:19|20)\d{2})[^;]*;\s*(\d+)?\s*(?:\(([^)]+)\))?\s*(?::\s*([A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?))?/u);
  if(!m) return null;
  const people=m[1].split(",").map(x=>x.trim()).filter(x=>x&&!/^et al/i.test(x));
  const each=people.map(p=>p.match(/^(\p{L}[\p{L}'’\- ]*?)\s+(\p{Lu}{1,3})$/u));
  if(!people.length||each.some(x=>!x)) return null;
  return { authors:each.map(x=>x[2].split("").map(i=>i+".").join(" ")+" "+x[1]), surnames:each.map(x=>norm(x[1])),
    title:noStop(m[2]), venue:noStop(m[3]), year:+m[4], volume:m[5]||"", issue:m[6]||"", pages:m[7]||"" };
}
/* Names written "Family, A. B." or "A. B. Family". */
function readNames(head){
  const family="(\\p{Lu}[\\p{L}\\p{M}'’\\-]+(?:\\s\\p{Lu}[\\p{L}'’\\-]+)?)", init="((?:\\p{Lu}\\.[\\s\\-]*)+)";
  const first=/^\p{Lu}\./u.test(head), re=new RegExp(first?init+family:family+"\\s*,\\s*"+init,"gu");
  return [...head.matchAll(re)].map(m=>first?`${m[1].trim()} ${m[2]}`:`${m[2].trim()} ${m[1]}`);
}
/* Volume, issue and pages, only when written. */
function readNumbers(s){
  const full=s.match(/,\s*(\d+)\s*(?:\(([\w\-–]+)\))?\s*,\s*(?:pp?\.\s*)?([A-Za-z]?\d+(?:\s*[-–]\s*[A-Za-z]?\d+)?)/);
  if(full) return {volume:full[1],issue:full[2]||"",pages:full[3]};
  const vol=s.match(/,\s*(\d+)\s*(?:\(([\w\-–]+)\))?\.?\s*$/);
  return {volume:vol?vol[1]:"",issue:vol&&vol[2]||"",pages:""};
}
/* A web page: a link that is not a DOI, and nothing that looks like a journal article. */
function readWeb(line){
  const url=(String(line).match(URL_RE)||[""])[0].replace(/[.,;)]+$/,"");
  if(!url||/doi\.org|arxiv\.org/i.test(url)||extractDOI(line)||/\d+\s*\(\d+\)|;\s*\d+\s*:/.test(stripRefs(line))) return null;
  const dated=stripRefs(line).match(/\((?:(?:19|20)\d{2}|n\.d\.)[^)]*\)/i);
  const parts=stripRefs(line).replace(/\((?:(?:19|20)\d{2}|n\.d\.)[^)]*\)\.?/i,"|").split(/\||\.\s+(?=\p{Lu})/u).map(noStop).filter(Boolean);
  let org=parts.find(p=>ORG_WORD.test(p))||(dated?parts[0]:parts.length===2?parts[1]:"");
  const title=parts.find(p=>p!==org)||parts[0]||url;
  if(org===title) org="";
  return { web:true, url, title, authors:org?[org]:[], surnames:org?[norm(org)]:[], year:extractYear(dated?dated[0]:""), venue:"", volume:"", issue:"", pages:"" };
}
function parseReference(line){
  const web=readWeb(line); if(web) return web;
  const s=stripRefs(line), v=readVancouver(s); if(v) return v;
  const head=s.split(/\(\s*(?:19|20)\d{2}|["“„‘]/)[0];
  const single=s.match(/\((?:19|20)\d{2}[a-z]?\)\s*[‘'](.{6,}?)[’'](?=[,.]|\s)/);       // Harvard 'Title'
  const title=single?noStop(single[1]):extractTitle(line);
  const after=title&&s.includes(title)?s.slice(s.indexOf(title)+title.length):"";
  const venue=noStop((after.replace(/^[’'"”.,?!\s]+/,"").match(/^(\p{Lu}[^,]*?)(?=,\s*\d|\.\s*$|\.\s|$)/u)||["",""])[1]);
  return { authors:readNames(head), surnames:extractSurnames(line), title, venue, year:extractYear(s), ...readNumbers(s) };
}

/* ---------- differences between the line and the record ---------- */
const pageEnds = p => { const [a,b]=String(p||"").split(/\s*[-–]\s*/); return [a||"", b&&b.length<a.length ? a.slice(0,a.length-b.length)+b : b||""]; };
const pagesDiffer = (x,y) => { const a=pageEnds(x), b=pageEnds(y); return a[0].toLowerCase()!==b[0].toLowerCase()||!!(a[1]&&b[1]&&a[1]!==b[1]); };
const recordNames = rec => (rec.authors||[]).map(a=>a.display_name||[a.given,a.family].filter(Boolean).join(" "));
function findFixes(p,rec,line){
  const out=[], add=(field,yours,record)=>out.push({field,yours,record,kept:false});
  if(p.title&&similarity(p.title,rec.title)<T_MATCH&&!lineContainsTitle(line,rec.title)) add("title",p.title,rec.title);
  const fam=(rec.authors||[]).map(familyName);
  if(p.surnames.length&&fam.length&&p.surnames.some(s=>!fam.some(f=>sameFamily(f,s)))) add("authors",p.authors,recordNames(rec));
  if(p.year&&rec.year&&p.year!==rec.year) add("year",p.year,rec.year);
  const dash=v=>String(v).replace(/–/g,"-");
  for(const k of ["volume","issue"]) if(p[k]&&rec[k]&&dash(p[k])!==dash(rec[k])) add(k,p[k],rec[k]);
  if(p.pages&&rec.pages&&pagesDiffer(p.pages,rec.pages)) add("pages",p.pages,rec.pages);
  return out;
}

/* ---------- one status per reference ---------- */
const STATUS={ "Verified":"ok", "Needs fix":"warn", "Mismatch":"bad", "Retracted":"bad", "Not found":"bad", "Not checked":"warn" };
function resultStatus(r){
  if(r.badge==="Cannot check"||r.badge==="Not checked") return "Not checked";
  if(r.badge==="Retracted") return "Retracted";
  if(r.badge==="Wrong paper"||r.badge==="Wrong authors") return "Mismatch";
  if(r.badge==="Not found") return "Not found";
  if(r.badge==="Unconfirmed") return r.cited.title.length<6?"Not checked":r.typedDoi?"Mismatch":"Not found";
  return r.badge==="Verified"&&!r.fixes.length ? "Verified" : "Needs fix";
}
function statusOf(i){
  if(i.web) return "Not checked";
  if(i.audit==="Retracted"||(i.retraction&&!/concern/i.test(i.retraction))) return "Retracted";
  if(i.audit==="Wrong paper"||i.audit==="Wrong authors") return "Mismatch";
  if(i.audit==="Not found") return "Not found";
  if((i.fixes||[]).length) return "Needs fix";
  if(i.audit==="Verified") return "Verified";
  return ["Mismatch","Partly verified","Under notice"].includes(i.audit) ? "Needs fix" : "Not checked";
}
const statusChip = s => el("span","status "+STATUS[s],esc(s));
const retractedBanner = () => el("div","retracted-banner","RETRACTED. This paper has been withdrawn by its publisher. Do not rely on its findings.");

/* ---------- from a checked line to a possible library entry ---------- */
const FIELDS=["title","authors","year","venue","volume","issue","pages","doi"];
function entryFrom(r){
  const p=r.parsed, s=resultStatus(r), real=(s==="Verified"||s==="Needs fix"||s==="Retracted")&&r.record;
  const base=real ? {...r.record, authors:recordNames(r.record)} : {...p, doi:r.typedDoi||"", abstract:""};
  const e={ ...base, doi:real?r.record.doi:(r.typedDoi||""), manual:true, web:!!p.web, url:p.url||"", pasted:r.line,
    fixes:real?r.fixes.map(f=>({...f})):[], retraction:real?r.record.retraction:null, opened:false };
  if(real&&p.pages&&!pagesDiffer(p.pages,r.record.pages||p.pages)&&!/[-–]/.test(r.record.pages||"")) e.pages=p.pages;   // keep the fuller range the student typed
  for(const k of ["volume","issue","pages"]) if(!e[k]&&p[k]) e[k]=p[k];
  for(const f of e.fixes) e[f.field]=f.yours;                       // the student's wording stays until they accept
  const unconfirmed={"Mismatch":"Wrong paper","Not found":"Not found"}[s]||"Cannot check";
  e.audit=e.web?"Not checked":r.badge==="Unconfirmed"?unconfirmed:e.fixes.length&&r.badge!=="Retracted"?"Mismatch":r.badge;
  return e;
}
const firstFamily = e => (e.authors||[]).length ? (e.web?norm(e.authors[0]):familyName({display_name:e.authors[0]})) : "";
function sameWork(a,b){
  if(a.doi&&b.doi&&a.doi.toLowerCase()===b.doi.toLowerCase()) return true;
  if(similarity(a.title,b.title)<0.95) return false;
  if(a.year&&b.year&&Math.abs(a.year-b.year)>1) return false;
  return !firstFamily(a)||!firstFamily(b)||sameFamily(firstFamily(a),firstFamily(b));
}
function addEntry(e){
  const it=addToLibrary({...e, keepSeparate:true, authors:e.authors.map(n=>({display_name:n}))},"added from a checked list");
  if(!it) return null;
  Object.assign(it,{manual:true,web:e.web,url:e.url,pasted:e.pasted,fixes:e.fixes,audit:e.audit});
  log("You",`added ${it.id} marked ${statusOf(it)}`); refreshGate1(); unlock(1); saveState();
  return it;
}

/* ---------- fixes: shared by the check card and the library card ---------- */
const shown = v => Array.isArray(v)?v.join(", "):String(v??"");
async function acceptFix(target,f){
  target[f.field]=f.record; target.fixes=target.fixes.filter(x=>x!==f);
  log("You",`accepted a fix${target.id?" on "+target.id:""}: ${f.field} changed from "${shown(f.yours)}" to "${shown(f.record)}"`);
  if(!target.fixes.length) await auditSource(target);               // only a check may call it verified
}
function fixRows(target,redraw){
  const box=el("div","fixes");
  (target.fixes||[]).forEach(f=>{
    const row=el("div","fix",`<span><b>${esc(f.field)}</b>: you wrote “${esc(shown(f.yours))}”; the record says “${esc(shown(f.record))}”.${f.kept?" <b>You kept yours.</b>":""}</span>`);
    row.append(button("Accept fix",async()=>{ await acceptFix(target,f); redraw(); }),
      button("Keep mine",()=>{ f.kept=true; log("You",`kept their own ${f.field}${target.id?" on "+target.id:""}`); redraw(); }));
    box.appendChild(row);
  });
  return box;
}

/* ---------- duplicates ---------- */
const entryText = e => `${esc(e.authors.slice(0,3).join(", "))}${e.authors.length>3?" et al.":""} (${e.year||"n.d."}). ${esc(e.title)}. ${esc([e.venue,e.volume,e.pages].filter(Boolean).join(", "))}${e.doi?` · <code>${esc(e.doi)}</code>`:""}`;
function duplicatePanel(entry,old,done){
  const box=el("div","dup-panel",`<b>Duplicate</b><div class="dup-two"><div><u>In your library (${old.id})</u><br>${entryText(old)}</div><div><u>The one you are adding</u><br>${entryText(entry)}</div></div>`);
  const row=el("div","row");
  row.append(button("Merge (keep one)",()=>{ row.remove(); box.appendChild(mergeChooser(entry,old,done)); }),
    button("Keep both",()=>{ const it=addEntry(entry); done(it?`Kept both. Added as ${it.id}.`:"Not added."); }));
  box.appendChild(row); return box;
}
function mergeChooser(entry,old,done){
  const box=el("div","merge"), picks={}, differ=FIELDS.filter(k=>shown(old[k])!==shown(entry[k]));
  differ.forEach(k=>{
    const set=el("fieldset",null,`<legend>Keep which ${esc(k)}?</legend>`);
    [["library",old[k]],["new",entry[k]]].forEach(([which,v],n)=>{
      const lab=el("label",null,`<input type="radio" name="m-${old.id}-${k}" ${n?"":"checked"}> ${esc(shown(v)||"(empty)")} <i>(${which})</i>`);
      lab.firstChild.onchange=()=>{ if(n) picks[k]=v; else delete picks[k]; }; set.appendChild(lab);
    });
    box.appendChild(set);
  });
  if(!differ.length) box.appendChild(el("div",null,"The two entries are the same in every field."));
  box.appendChild(button("Merge now",async()=>{
    Object.assign(old,picks);
    old.fixes=(old.fixes||[]).filter(f=>!(f.field in picks));
    log("You",`merged a duplicate into ${old.id}; fields taken from the new one: ${Object.keys(picks).join(", ")||"none"}`);
    if(Object.keys(picks).length) await auditSource(old);
    saveState(); done(`Merged. One entry remains: ${old.id}.`);
  },"btn small"));
  return box;
}

/* ---------- what a checked line shows ---------- */
function twoColumns(r){
  const rec=r.record||r.suggestion, p=r.parsed;
  const col=(h,x,names)=>`<div><u>${h}</u><br><b>Title:</b> ${esc(x.title||"(not read)")}<br><b>Authors:</b> ${esc(names.join(", ")||"(not read)")}<br><b>Year:</b> ${x.year||"(none)"}<br><b>Journal:</b> ${esc(x.venue||"(none)")}</div>`;
  return el("div","dup-two columns",col("You pasted",p,p.authors)+col("This DOI actually points to",rec,recordNames(rec)));
}
function decisionArea(r){
  const box=el("div","decide"), entry=r.entry, say=t=>{ box.innerHTML=""; box.appendChild(el("b",null,esc(t))); };
  const draw=()=>{
    box.innerHTML="";
    box.appendChild(fixRows(entry,draw));
    const status=resultStatus(r);
    const details=el("div","c-abstract",`${entryText(entry)}<br>${entry.abstract?esc(entry.abstract):"No abstract is available for this entry."}`); details.hidden=!entry.opened;
    const row=el("div","row");
    const open=button("Open details",()=>{ details.hidden=!details.hidden; add.disabled=false;
      if(!entry.opened){ entry.opened=true; log("You",`opened the details of "${entry.title.slice(0,50)}"`); } },"btn small");
    const add=button(["Verified","Needs fix"].includes(status)?"Add to library":`Add anyway (marked ${status})`,()=>{
      const old=LIB.find(i=>sameWork(i,entry));
      if(old){ add.disabled=true; box.appendChild(duplicatePanel(entry,old,say)); return; }
      const it=addEntry(entry); say(it?`In your library as ${it.id}, marked ${statusOf(it)}.`:"Not added.");
    });
    add.disabled=!entry.opened;                                       // Gate 1: opened first, then approved
    row.append(open,add,button("Leave out",()=>{ log("You",`left out "${entry.title.slice(0,50)}"`); say("Left out. Nothing was added."); }));
    box.append(details,row);
  };
  draw(); return box;
}
function renderCheckCard(r){
  const status=resultStatus(r), could=r.badge==="Cannot check";
  const c=renderResult(r);
  c.className="card "+(could?"warn":STATUS[status]);
  const head=c.querySelector(".headline");
  head.className="verdict headline "+(could?"warn":STATUS[status]);
  head.textContent=could?"Could not check, try again":status;
  const why=r.parsed.web?"Web source: not checked in a scholarly database":r.headline&&r.headline!==status?r.headline:"";
  if(why) head.after(el("div","why",esc(why)));
  if(status==="Retracted") head.after(retractedBanner());
  if(status==="Mismatch"&&(r.record||r.suggestion)) c.appendChild(twoColumns(r));
  c.appendChild(el("div","searched",r.searched.length?`<b>Searched:</b> ${r.searched.map(esc).join("; ")}`:"<b>Searched:</b> no scholarly database was searched."));
  r.entry=entryFrom(r);
  c.appendChild(decisionArea(r));
  return c;
}
/* Lines in one pasted list that are the same work. */
function flagListDuplicates(results,cards){
  results.forEach((r,j)=>{
    const i=results.findIndex((o,n)=>n<j&&sameWork(o.entry,r.entry));
    if(i>=0) cards[j].querySelector(".headline").after(el("div","dup-flag",`Duplicate of line ${i+1}: ${esc(results[i].entry.title)}`));
  });
}

/* ---------- Ask: a request for something that may not exist ---------- */
const ASK_FILLER=new Set("give me show find list get provide three two five some any studies study papers paper research articles article peer reviewed measure measures measured please that how".split(" "));
/* Names and years the student asked about, taken from their own words. */
function askedNames(question){
  const words=String(question).replace(/[^\p{L}\p{N}\s'-]/gu," ").split(/\s+/).filter(Boolean);
  return [...new Set(words.filter((w,i)=>(i>0&&/^\p{Lu}/u.test(w))||/^(19|20)\d\d$/.test(w)).map(norm).filter(w=>w&&!ASK_FILLER.has(w)))];
}
const coversNames = (rec,names) => { const have=` ${norm(rec.title+" "+rec.abstract+" "+rec.venue)} `; return names.filter(n=>have.includes(` ${n} `)).length/names.length>=0.6; };
const topicWords = (question,names) => contentWords(question).filter(w=>!ASK_FILLER.has(w)&&!names.includes(w));
/* Real records only. Each is checked by the Auditor before it is shown. */
async function checkedCards(box,rows){
  for(const w of rows){
    const t={...w, authors:recordNames(w), url:""}; await auditSource(t); w.checked=statusOf(t);
    box.appendChild(sourceCard(w));
  }
}
async function showAnswer(question,rows){
  const names=askedNames(question), specific=names.length>=2;
  const matches=specific?rows.filter(r=>coversNames(r,names)):rows;
  if(matches.length){ renderSources(matches); return; }
  const searched=[`OpenAlex search "${norm(question)}"`];
  let related=rows.slice(0,3);
  const topic=topicWords(question,names).join(" ");
  if(!related.length&&topic){
    searched.push(`OpenAlex search "${topic}"`);
    related=((await getJSON(OPENALEX(`/works?per-page=3&search=${searchWords(topic)}`))).results||[]).map(openalexRecord).filter(r=>r.doi);
  }
  const box=$("#sourceList"); box.innerHTML="";
  box.appendChild(el("div","card bad",`<div class="verdict headline bad">Not found</div><div class="note bad">No source matching what you asked for was found. Sanad does not write study titles to fill the gap.</div>
    <div class="searched"><b>Searched:</b> ${searched.map(esc).join("; ")}</div>`));
  agent("scout","done","Not found"); log("Scout",`Not found for "${question.slice(0,80)}"; ${related.length} related record(s) shown separately`);
  if(related.length){
    box.appendChild(el("h3","sub","Related real sources (not what you asked for)"));
    await checkedCards(box,related);
  }
}

/* ---------- a retracted source needs a tick before it can be cited ---------- */
function confirmRetracted(id,then){
  const box=$("#atMenu"), at=menuAt; box.innerHTML=""; box.hidden=false;
  const panel=el("div","confirm-box",`<div class="retracted-banner">RETRACTED: ${esc(sourceById(id).title)}</div><label><input type="checkbox"> I know this paper is retracted and I still want to cite it.</label>`);
  panel.onmousedown=e=>{ if(e.target.tagName!=="INPUT") e.preventDefault(); };
  const row=el("div","row"), go=button("Cite it",()=>{ menuAt=at; log("You",`confirmed citing the retracted source ${id}`); then(); },"btn small");
  go.disabled=true; panel.querySelector("input").onchange=e=>{ go.disabled=!e.target.checked; };
  row.append(go,button("Do not cite",closeMenu)); panel.appendChild(row); box.appendChild(panel);
}

/* ---------- "check this quote": never confirmed unless the words are found ---------- */
function readQuoteRequest(line){
  const m=String(line).match(/^([^"“]*)["“](.{12,})["”][.,]?\s*\(([^()]*?)((?:19|20)\d{2})[a-z]?[^()]*\)/);
  if(!m||(m[1].trim()&&!/quot/i.test(m[1]))) return null;
  return { quote:m[2], names:m[3].split(/,|&|\band\b|et al\.?/).map(x=>norm(x)).filter(Boolean), year:+m[4] };
}
async function quoteCard(line,q){
  const item=LIB.find(i=>i.year===q.year&&q.names.length&&(i.authors||[]).some(a=>sameFamily(familyName({display_name:a}),q.names[0])));
  let head="Full text not available to check", k="warn", why="No source in your library matches that author and year. Add it first, then check again.", match="";
  if(item){
    await loadFullText(item);
    const v=checkQuote(q.quote,item); why=`${item.id}: ${v.label}. ${v.why}`; match=v.match;
    if(v.found){ head="Words found in the source"; k="ok"; }
    else if(v.name==="notFound"||v.name==="close"){ head="Quote could not be found"; k="bad"; }
  }
  log("Quote Checker",`checked a pasted quote: ${head}`);
  return el("div","card "+k,`<div class="verdict headline ${k}">${esc(head)}</div><div class="c-cited">You asked about: ${esc(line)}</div><div class="note ${k}">${esc(why)}${match?`<br>Source says: “${esc(match)}”`:""}</div>`);
}

/* ---------- for the AI-use statement ---------- */
function referenceWarnings(){
  const all=LIB.map(statusOf), n=s=>all.filter(x=>x===s).length;
  return `Library references not Verified: ${all.length-n("Verified")} of ${all.length}; retracted: ${n("Retracted")}.`;
}
