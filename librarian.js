/* ============================================================
   AGENT: LIBRARIAN. Organises with folders, tags and notes.
   Suggests tags, flags gaps, points out duplicates.
   Every change to the library is made by the student.
   Loaded after app.js. Saving is in store.js.
   ============================================================ */
const VIEW={ folder:"*", tag:"" };        // "*" is every folder, "" is sources in no folder
const button=(label,fn,cls="btn ghost small")=>{ const b=el("button",cls,esc(label)); b.onclick=fn; return b; };
const changed=()=>{ saveState(); drawLibrary(); };
const tidy=s=>String(s||"").replace(/\s+/g," ").trim().slice(0,60);

/* ---------- folders ---------- */
const sameName=(a,b)=>a.toLowerCase()===b.toLowerCase();
function createFolder(name){
  name=tidy(name);
  if(!name||FOLDERS.some(f=>sameName(f,name))) return false;
  FOLDERS.push(name); log("You",`created folder "${name}"`); return true;
}
function renameFolder(old,name){
  name=tidy(name);
  if(!name||FOLDERS.some(f=>f!==old&&sameName(f,name))) return false;
  FOLDERS[FOLDERS.indexOf(old)]=name;
  LIB.forEach(i=>{ if(i.folder===old) i.folder=name; });
  if(VIEW.folder===old) VIEW.folder=name;
  log("You",`renamed folder "${old}" to "${name}"`); return true;
}
function deleteFolder(name){
  const inside=LIB.filter(i=>i.folder===name);
  if(inside.length&&!confirm(`Delete folder "${name}"? Its ${inside.length} source(s) stay in the library.`)) return false;
  inside.forEach(i=>i.folder="");
  FOLDERS=FOLDERS.filter(f=>f!==name);
  if(VIEW.folder===name) VIEW.folder="*";
  log("You",`deleted folder "${name}"`); return true;
}

/* ---------- tags ---------- */
function addTag(item,tag){
  tag=tidy(tag);
  if(!tag||item.tags.some(t=>sameName(t,tag))) return false;
  item.tags.push(tag); return true;
}
function removeTag(item,tag){
  item.tags=item.tags.filter(t=>t!==tag);
  if(VIEW.tag===tag&&!LIB.some(i=>i.tags.includes(tag))) VIEW.tag="";
}
const suggestedTags=item=>item.topics.filter(t=>t&&!item.tags.some(x=>sameName(x,t)));
function tagCounts(){
  const n={}; LIB.forEach(i=>i.tags.forEach(t=>n[t]=(n[t]||0)+1));
  return Object.entries(n).sort((a,b)=>a[0].localeCompare(b[0]));
}
const visibleSources=()=>LIB.filter(i=>(VIEW.folder==="*"||i.folder===VIEW.folder)&&(!VIEW.tag||i.tags.includes(VIEW.tag)));

/* ---------- flags ---------- */
function flagsOf(i){
  const f=[];
  if(i.retraction) f.push(["Retracted","fail"]);
  if(!i.abstract) f.push(["No abstract: nothing can be quoted","fail"]);
  if(i.isOA===false) f.push(["OpenAlex lists no open access","unknown"]);
  if(i.isOA===null||i.isOA===undefined) f.push(["Open access not known","unknown"]);
  return f;
}

/* ---------- duplicates: suggested here, decided by the student ---------- */
const DUP=0.90;                           // Dice on bigrams
const pairKey=(a,b)=>[a.doi,b.doi].sort().join("|");
const isPreprint=i=>/preprint|arxiv|biorxiv|medrxiv|ssrn/i.test([i.type,i.venue,i.doi].join(" "));
function duplicatePairs(){
  const out=[];
  LIB.forEach((a,n)=>LIB.slice(n+1).forEach(b=>{
    if(!DISMISSED.includes(pairKey(a,b))&&similarity(a.title,b.title)>=DUP) out.push([a,b]);
  }));
  return out;
}
function sharedAuthors(a,b){
  const fam=i=>i.authors.map(n=>familyName({display_name:n}));
  return fam(a).filter(x=>fam(b).some(y=>sameFamily(x,y))).length;
}
function dismissPair(a,b){ DISMISSED.push(pairKey(a,b)); log("You",`said ${a.id} and ${b.id} are different works`); }
/* Claims that cited the merged source now cite a different text, so they are judged again. */
function mergeInto(keep,gone){
  gone.tags.forEach(t=>addTag(keep,t));
  keep.note=[keep.note,gone.note].filter(Boolean).join("\n");
  keep.folder=keep.folder||gone.folder;
  keep.mergedFrom.push(gone.doi,...gone.mergedFrom);
  LIB=LIB.filter(i=>i!==gone);
  claimsOf(gone.id).forEach(c=>{ c.src=keep.id; c.accepted=""; c.label=judgeClaim(c,keep); });
  moveCitations(gone.id,keep.id);
  afterSourceLeft(); log("You",`merged ${gone.id} into ${keep.id}`);
}
const claimsOf=id=>(DRAFT?DRAFT.claims:[]).filter(c=>c.src===id);
function removeSource(item){
  const cited=claimsOf(item.id);
  const also=cited.length?` ${cited.length} claim(s) in your draft cite it and will be removed too.`:"";
  const own=studentClaims().filter(c=>c.srcs.includes(item.id)).length;
  const text=own?` ${own} sentence(s) you wrote cite it; they will show Not found until you change them.`:"";
  if(!confirm(`Remove ${item.id} and its notes from the library?${also}${text}`)) return false;
  LIB=LIB.filter(i=>i!==item);
  if(DRAFT) DRAFT.claims=DRAFT.claims.filter(c=>!cited.includes(c));
  afterSourceLeft(); log("You",`removed ${item.id} from the library`);
  return true;
}
function afterSourceLeft(){
  if(VIEW.tag&&!LIB.some(i=>i.tags.includes(VIEW.tag))) VIEW.tag="";
  libPill(); refreshGate1();
  redrawWriting();
  if(!DRAFT) return;
  window.__DRAFT_TEXT=DRAFT.claims.map(c=>`${c.text} [${c.src}] (${c.label})`).join("\n");
  renderDraft(DRAFT); renderExport();
}

/* ---------- the agent's report when the student hands over to Scribe ---------- */
async function librarian(){
  agent("librarian","run","organising your library");
  pipeNote("Librarian is looking for duplicates and gaps");
  const dupes=duplicatePairs(), count=f=>LIB.filter(f).length, notes=[];
  dupes.forEach(([a,b])=>notes.push(`${a.id} and ${b.id} look like the same work. Open the library to merge or dismiss.`));
  if(count(i=>!i.abstract)) notes.push(`${count(i=>!i.abstract)} source(s) have no abstract, so nothing can be quoted from them.`);
  if(count(i=>i.isOA===false)) notes.push(`${count(i=>i.isOA===false)} source(s) are not open access.`);
  agent("librarian","done",`${dupes.length} possible duplicate(s)`);
  log("Librarian",`looked over ${LIB.length} sources; ${dupes.length} possible duplicate(s), none changed`);
  return notes;
}

/* ===================== drawing ===================== */
function drawLibrary(){
  if(!$("#slib").classList.contains("on")) return;
  drawFolders(); drawTagFilter(); drawDuplicates(); drawSources();
}
function inputRow(placeholder,label,fn,value=""){
  const row=el("div","lib-row"), inp=el("input"); inp.type="text"; inp.placeholder=placeholder; inp.value=value; inp.setAttribute("aria-label",placeholder);
  const go=()=>{ if(fn(inp.value)) changed(); else { inp.classList.add("bad"); inp.focus(); } };
  inp.onkeydown=e=>{ if(e.key==="Enter") go(); };
  row.append(inp,button(label,go)); return row;
}
function folderLine(label,key,n){
  const row=el("div","folder-line"+(VIEW.folder===key?" on":""));
  row.appendChild(button(`${label} (${n})`,()=>{ VIEW.folder=key; drawLibrary(); },"link"));
  if(key&&key!=="*"){
    row.appendChild(button("Rename",()=>{ const r=inputRow("New folder name","Save",v=>renameFolder(key,v),key); row.replaceWith(r); r.firstChild.focus(); },"link minor"));
    row.appendChild(button("Delete",()=>{ if(deleteFolder(key)) changed(); },"link minor"));
  }
  return row;
}
function drawFolders(){
  const box=$("#folderBox"); box.innerHTML="";
  box.append(folderLine("All sources","*",LIB.length), folderLine("No folder","",LIB.filter(i=>!i.folder).length));
  FOLDERS.forEach(f=>box.appendChild(folderLine(f,f,LIB.filter(i=>i.folder===f).length)));
  box.appendChild(inputRow("New folder","Create",createFolder));
}
function drawTagFilter(){
  const box=$("#tagBox"); box.innerHTML="";
  const all=tagCounts();
  if(!all.length) box.textContent="No tags yet. Accept a suggestion or add your own.";
  all.forEach(([t,n])=>box.appendChild(button(`${t} (${n})`,()=>{ VIEW.tag=VIEW.tag===t?"":t; drawLibrary(); },"chip"+(VIEW.tag===t?" on":""))));
  if(VIEW.tag) box.appendChild(button("Clear filter",()=>{ VIEW.tag=""; drawLibrary(); },"link"));
}
function duplicateCard([a,b]){
  const c=el("div","card warn"), n=sharedAuthors(a,b);
  c.innerHTML=`<div class="c-top"><div class="c-title">Possibly the same work</div><span class="verdict warn">You decide</span></div>`;
  [a,b].forEach(i=>c.appendChild(el("div","c-meta",`<b>${i.id}</b> ${esc(i.title)} · ${i.year||"n.d."} · ${esc(i.venue)} · <code>${esc(i.doi)}</code>${isPreprint(i)?" · looks like a preprint":""}`)));
  c.appendChild(el("div","note",`Titles ${Math.round(similarity(a.title,b.title)*100)}% alike. Authors in common: ${n}.${n?"":" Two different works can share a title, so check before merging."}`));
  const row=el("div","row");
  row.append(button(`Keep ${a.id}, merge ${b.id} into it`,()=>{ mergeInto(a,b); changed(); }),
             button(`Keep ${b.id}, merge ${a.id} into it`,()=>{ mergeInto(b,a); changed(); }),
             button("Different works, keep both",()=>{ dismissPair(a,b); changed(); }));
  c.appendChild(row); return c;
}
function drawDuplicates(){
  const box=$("#dupBox"); box.innerHTML="";
  duplicatePairs().forEach(p=>box.appendChild(duplicateCard(p)));
}
function tagRow(i){
  const row=el("div","lib-row");
  i.tags.forEach(t=>row.appendChild(button(`${t} ×`,()=>{ removeTag(i,t); changed(); },"chip on")));
  suggestedTags(i).forEach(t=>row.appendChild(button(`+ ${t}`,()=>{ if(addTag(i,t)) changed(); },"chip suggest")));
  return row;
}
function folderPicker(i){
  const s=el("select"); s.setAttribute("aria-label","Folder for "+i.id);
  ["",...FOLDERS].forEach(f=>{ const o=el("option",null,esc(f||"No folder")); o.value=f; o.selected=i.folder===f; s.appendChild(o); });
  s.onchange=()=>{ i.folder=s.value; changed(); };
  return s;
}
function noteBox(i){
  const t=el("textarea"); t.rows=2; t.value=i.note; t.placeholder="Your notes on this source"; t.setAttribute("aria-label","Notes on "+i.id);
  t.oninput=()=>{ i.note=t.value; saveStateSoon(); };
  t.onblur=saveState;
  return t;
}
function libraryCard(i){
  const c=el("div","card"+(i.retraction?" bad":""));
  c.appendChild(el("div","c-title",`<span class="src">${i.id}</span> ${esc(i.title)}`));
  c.appendChild(el("div","c-meta",`${esc(i.authors.slice(0,3).join(", "))}${i.authors.length>3?" et al.":""} · ${i.year||"n.d."} · ${esc(i.venue)} · <code>${esc(i.doi)}</code>${i.mergedFrom.length?` · includes ${esc(i.mergedFrom.join(", "))}`:""}`));
  const flags=el("div","checks"); flagsOf(i).forEach(([l,k])=>flags.appendChild(el("span","check "+k,esc(l)))); c.appendChild(flags);
  c.appendChild(accessStatus(i));
  c.appendChild(tagRow(i));
  const row=el("div","lib-row");
  row.append(folderPicker(i),inputRow("Add your own tag","Add",v=>addTag(i,v)),button("Remove",()=>{ if(removeSource(i)) changed(); }));
  c.append(row,noteBox(i));
  return c;
}
function drawSources(){
  const box=$("#libList"), items=visibleSources(); box.innerHTML="";
  $("#libTitle").textContent=`Your library: ${items.length} of ${LIB.length}`;
  if(!items.length) box.appendChild(el("div","empty",LIB.length?"No source matches this folder and tag.":"Your library is empty. Ask a question and approve some sources."));
  items.forEach(i=>box.appendChild(libraryCard(i)));
  fillAccess();
}

$("#libPill").onclick=()=>{ showPanel("#slib"); drawLibrary(); };
$("#libBack").onclick=()=>goStage(unlocked);
$("#clearLib").onclick=()=>{ if(clearLibrary()) { VIEW.folder="*"; VIEW.tag=""; } };
