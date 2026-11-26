/* ============================================================
   DEMO MODE. Recorded real responses, no network.
   The same code runs in both modes. In demo mode fetch() is
   replaced: it returns the recorded response, or refuses with
   "Not in demo data". It never guesses and never goes online.
   Loaded first. Data is in fixtures/data.js (capture script).
   ============================================================ */
const MODE_KEY="sanad.mode";
const DEMO=(()=>{ try{ return localStorage.getItem(MODE_KEY)==="demo"; }catch(e){ return false; } })();
const NOT_IN_DEMO="Not in demo data";
/* Every day on which something was recorded, so the banner never implies a single capture. */
const recordedOn=[...new Set(FIXTURE_DATA.entries.map(e=>new Date(e.capturedAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})))].join(" and ");

/* One spelling per request, however it was encoded. */
function requestKey(url){
  let s=String(url);
  for(let n=0;n<4;n++){ let d; try{ d=decodeURIComponent(s); }catch(e){ break; } if(d===s) break; s=d; }
  return s.toLowerCase();
}
const RECORDED=new Map(FIXTURE_DATA.entries.map(e=>[requestKey(e.url),e]));
async function recordedFetch(url){
  const e=RECORDED.get(requestKey(url));
  if(!e){ const err=new Error(NOT_IN_DEMO); err.notInDemo=true; throw err; }
  return new Response(e.body,{status:e.status});
}
if(DEMO) window.fetch=recordedFetch;

function setMode(mode){
  saveState(); storeReady=false;
  try{ localStorage.setItem(MODE_KEY,mode); }catch(e){}
  location.reload();
}

/* ---------- what the demo script loads ---------- */
const DEMO_QUESTION="How reliable are published research findings?";
const DEMO_PAPERS=["10.1371/journal.pmed.0020124","10.1371/journal.pone.0005738"];
/* Test input only: what a student might paste. The last four are wrong on purpose. */
const DEMO_REFERENCES=[
  "Ioannidis, J. P. A. (2005). Why most published research findings are false. PLoS Medicine, 2(8), e124. https://doi.org/10.1371/journal.pmed.0020124",
  "Fanelli, D. (2009). How many scientists fabricate and falsify research? A systematic review and meta-analysis of survey data. PLoS ONE, 4(5), e5738. https://doi.org/10.1371/journal.pone.0005738",
  "Mehra, M. R., Desai, S. S., Ruschitzka, F., & Patel, A. N. (2020). Hydroxychloroquine or chloroquine with or without a macrolide for treatment of COVID-19: a multinational registry analysis. The Lancet. https://doi.org/10.1016/S0140-6736(20)31180-6",
  "He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. https://doi.org/10.1038/s41586-021-03819-2",
  "Smith, J. R. (2023). Transformer architectures for automated citation integrity. Journal of Applied Informatics. https://doi.org/10.1016/j.jai.2023.119284",
  "Ioannidis, J. P. A. (2021). Why most citation managers cannot detect invented references."
].join("\n");
const demoDraft=(a,b)=>[
  {t:"Ioannidis writes that “it is impossible to know with 100% certainty what the truth is in any research question” "},{src:a},
  {t:". Fanelli reports that “nine out of ten scientists openly admitted to inventing their data last year” "},{src:b},
  {t:". One paper says “it is nearly impossible to know with 100% certainty what truth is in any research question” "},{src:a},{t:". "}];

/* Fills the panels. Sources still wait at Gate 1 for the student. */
async function runDemoScript(){
  if(!DEMO) return;
  LIB=[]; NEXT_ID=1; FOLDERS=[]; DISMISSED=[]; DRAFT=null; LOG.length=0; REFUSED=0; unlocked=0; resetWriting(); drawRefused(); libPill(); refreshGate1();
  stats={total:0,ok:0,bad:0}; ["#cTotal","#cOk","#cBad"].forEach(i=>$(i).textContent="0"); ["#results","#draft","#challenge"].forEach(i=>$(i).innerHTML="");
  $("#q").value=DEMO_QUESTION; $("#refInput").value=DEMO_REFERENCES;
  log("Sanad",`demo script started with data recorded on ${recordedOn}`);
  const papers=[]; for(const d of DEMO_PAPERS) papers.push(await openalexByDOI(d));
  renderSources(papers); agent("scout","done",`${papers.length} recorded records`);
  unlock(1); goStage(1);
}
/* Once the student has approved both, the prepared text is placed in the editor. */
function placeDemoDraft(){
  const [a,b]=DEMO_PAPERS.map(inLibrary);
  if(!DEMO||!a||!b||WRITING.segments.length) return;
  WRITING.segments=demoDraft(a.id,b.id); redrawWriting(); unlockWriting(); saveState();
  log("Sanad","placed the prepared demo text in the editor");
}

/* ---------- live mode: store the recorded full texts, so quotes can be checked if a server is down ----------
   Full texts only. Retractions can change, so the live Auditor never reads a recording. */
async function warmUp(){
  let n=0;
  for(const doi of DEMO_PAPERS){
    const pmcid=[...RECORDED.values()].map(e=>e.body.includes(doi)&&(e.body.match(/"pmcid":"(PMC\d+)"/)||[])[1]).find(Boolean);
    const e=[...RECORDED.values()].find(e=>pmcid&&(e.url.includes(pmcid)||e.url.endsWith("id="+pmcid.slice(3)))&&e.status===200);
    const texts=e&&[articleText(e.body,doi,false),articleText(e.body,doi,true)];
    if(texts&&texts[0]){ await toCache(doi,texts); if((FULLTEXT[doi]||{}).state!=="full") delete FULLTEXT[doi]; if(await fromCache(doi)) n++; }
  }
  log("Sanad",`warmed up ${n} full text(s) recorded on ${recordedOn}`);
  $("#warmNote").textContent=`${n} of ${DEMO_PAPERS.length} full texts stored (recorded ${recordedOn}). References are still checked live.`;
}

function startMode(){
  document.body.classList.toggle("demo",DEMO);
  $("#demoBar").hidden=!DEMO; $("#demoDate").textContent=`Demo mode: recorded data (${recordedOn})`;
  $("#demoOn").hidden=DEMO; $("#demoOn").onclick=()=>setMode("demo");
  $("#demoOff").onclick=()=>setMode("live"); $("#demoRun").onclick=runDemoScript;
  $("#warmUp").hidden=DEMO; $("#warmUp").onclick=warmUp;
  if(!DEMO) return;
  for(const id of ["#patronBtn","#isnadBtn"]){ $(id).disabled=true; $(id).title=NOT_IN_DEMO; }
}
