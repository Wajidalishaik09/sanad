/* ============================================================
   Sanad: saving. One localStorage entry holds everything.
   Loaded before app.js. Its functions run later, once app.js has
   defined LIB, DRAFT and the rest.
   ============================================================ */
const STORE_KEY="sanad.v1";
let FOLDERS=[], DISMISSED=[];            // folder names; duplicate pairs the student said are different
let storeReady=false, saveTimer=null;

function snapshot(){
  return { lib:LIB, nextId:NEXT_ID, folders:FOLDERS, dismissed:DISMISSED, draft:DRAFT,
           refused:REFUSED, log:LOG, question:$("#q").value, unlocked };
}
function saveState(){
  if(!storeReady) return;                // never overwrite saved work before it has been read
  try{ localStorage.setItem(STORE_KEY,JSON.stringify(snapshot())); $("#saveWarn").hidden=true; }
  catch(e){ $("#saveWarn").hidden=false; }
}
function saveStateSoon(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveState,300); }

/* Saved data can be edited by hand, so it is checked like any other input. */
const list = x => Array.isArray(x)?x:[];
const text = x => typeof x==="string"?x:"";
function cleanSource(s){
  if(!s||!/^L\d+$/.test(s.id)||!text(s.doi)||s.opened!==true) return null;          // Gate 1 holds across a refresh
  return {...s, title:text(s.title), abstract:text(s.abstract), venue:text(s.venue), type:text(s.type), note:text(s.note),
    folder:FOLDERS.includes(s.folder)?s.folder:"", authors:list(s.authors).map(String), tags:list(s.tags).map(String),
    topics:list(s.topics).map(String), grants:list(s.grants), mergedFrom:list(s.mergedFrom).map(String)};
}
function readState(){
  let raw=null;
  try{
    raw=localStorage.getItem(STORE_KEY);
    return raw?JSON.parse(raw):null;
  }catch(e){
    try{ localStorage.setItem(STORE_KEY+".damaged",raw||""); }catch(e2){}             // keep the original, start clean
    return null;
  }
}
function loadState(){
  const s=readState();
  if(s&&typeof s==="object"){
    FOLDERS=list(s.folders).map(String); DISMISSED=list(s.dismissed).map(String);
    LIB=list(s.lib).map(cleanSource).filter(Boolean);
    NEXT_ID=Math.max(Number(s.nextId)||1,...LIB.map(i=>Number(i.id.slice(1))+1),1);
    REFUSED=Number(s.refused)||0;
    list(s.log).forEach(e=>{ const t=new Date(e.t); if(!isNaN(t)) LOG.push({t,who:text(e.who),what:text(e.what),kind:text(e.kind)}); });
    $("#q").value=text(s.question);
    DRAFT=loadDraft(s.draft);
    unlocked=DRAFT?Math.min(4,Math.max(2,Number(s.unlocked)||2)):Math.min(1,LIB.length);
  }
  storeReady=true;
}
/* A restored claim must still cite a source in the library, and earns its label again. */
function loadDraft(d){
  if(!d||!Array.isArray(d.claims)) return null;
  const claims=d.claims.filter(c=>c&&text(c.text)&&LIB.some(i=>i.id===c.src)&&!writesReference(c.text)&&!RAW_REF.test(text(c.quote)));
  claims.forEach(c=>{ c.quote=text(c.quote); c.accepted=text(c.accepted); c.label=judgeClaim(c,LIB.find(i=>i.id===c.src)); });
  return {claims,blocked:Number(d.blocked)||0,usedModel:!!d.usedModel};
}
function showRestored(){
  unlock(unlocked); refreshGate1(); drawRefused(); drawLog();
  if(!DRAFT) return;
  renderDraft(DRAFT); renderExport(DRAFT);
  window.__DRAFT_TEXT=DRAFT.claims.map(c=>`${c.text} [${c.src}] (${c.label})`).join("\n");
  $("#challenge").innerHTML=`<div class="empty">Objections are not kept after a refresh. Go back to Draft and send it to the Challenger again.</div>`;
}
/* Sources, folders, tags, notes and the draft go. The activity log stays: it is the record of AI use. */
function clearLibrary(){
  if(!confirm(`Clear ${LIB.length} source(s), all folders, tags, notes and the draft? This cannot be undone.`)) return false;
  const n=LIB.length;
  LIB=[]; FOLDERS=[]; DISMISSED=[]; DRAFT=null; unlocked=0;
  ["#draft","#challenge","#gateBox","#apaOut","#aiOut","#sourceList"].forEach(id=>$(id).innerHTML="");
  libPill(); refreshGate1(); gateChip(2,"","you clear every claim");
  log("You",`cleared the library (${n} sources)`);
  goStage(0);
  return true;
}
