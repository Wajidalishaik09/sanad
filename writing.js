/* ============================================================
   WRITING SURFACE. The student's own text, with @ citations.
   No AI is called from this file. It reads the text; it never rewrites it.

   WRITING (in store.js) = { segments, checked, accepted }
     segments : [{t:"plain text"}, {src:"L3"}]   a citation is an attachment, not words
     checked  : keys of sentences the student pressed Check on
     accepted : sentence key -> written reason
   A key is the sentence's words plus its sources. Edit the sentence and the key
   changes, so an old check or reason can never cover new words.
   ============================================================ */
const editor=$("#editor"), CHIP="￼", ZWSP="​";       // CHIP stands for a citation in flat text
const sourceById=id=>LIB.find(i=>i.id===id);

/* ---------- in-text form: always built from the library record ---------- */
const PARTICLE=/^(van|von|de|der|den|di|da|la|le|bin|ibn|al|el)$/i;
function displayFamily(name){
  const p=String(name).replace(/[,\s]+(jr|sr|ii|iii)\.?$/i,"").trim().split(/\s+/);
  let n=p.length-1; while(n>1&&PARTICLE.test(p[n-1])) n--;
  return p.slice(n).join(" ");
}
function shortAuthors(item){
  const f=item.authors.filter(Boolean).map(displayFamily);
  if(!f.length) return `“${item.title.split(/\s+/).slice(0,4).join(" ")}”`;
  return f.length===1?f[0]:f.length===2?`${f[0]} & ${f[1]}`:`${f[0]} et al.`;
}
/* APA: two cited works that look the same get 2020a, 2020b. */
function yearSuffix(item){
  const same=citedSources(exportDraft()).filter(i=>shortAuthors(i)===shortAuthors(item)&&i.year===item.year);
  if(same.length<2||!same.includes(item)) return "";
  return "abcdefghij"[same.sort((a,b)=>a.title.localeCompare(b.title)).indexOf(item)]||"";
}
function inText(id){
  const i=sourceById(id); if(!i) return "(source removed)";
  const s=yearSuffix(i);
  return `(${shortAuthors(i)}, ${i.year?i.year+s:"n.d."+(s?"-"+s:"")})`;
}

/* ---------- between the page and the saved segments ---------- */
function pushText(out,t){
  t=t.replace(/[​￼]/g,"").replace(/ /g," "); if(!t) return;
  const last=out[out.length-1];
  if(last&&"t" in last) last.t+=t; else out.push({t});
}
function readNode(node,out){
  if(node.nodeType===3) return pushText(out,node.data);
  if(node.nodeType!==1) return;
  if(node.dataset.src) return void out.push({src:node.dataset.src});
  if(node.nodeName==="BR") return pushText(out,"\n");
  if(/^(DIV|P)$/.test(node.nodeName)&&out.length) pushText(out,"\n");
  node.childNodes.forEach(n=>readNode(n,out));
}
function readEditor(){ const out=[]; editor.childNodes.forEach(n=>readNode(n,out)); return out; }
function makeChip(id){
  const c=el("span","cite"); c.contentEditable="false"; c.dataset.src=id;
  c.appendChild(el("span","cite-text",esc(inText(id))));
  const x=button("×",()=>{ c.remove(); editorChanged(); },"cite-x"); x.tabIndex=-1; x.title="Remove this citation"; c.appendChild(x);
  return c;
}
function drawEditor(){
  editor.innerHTML="";
  WRITING.segments.forEach(s=>editor.append(s.src?makeChip(s.src):document.createTextNode(s.t)));
  editor.append(ZWSP);
}
function refreshChips(){ editor.querySelectorAll(".cite").forEach(c=>{ c.firstChild.textContent=inText(c.dataset.src); c.classList.toggle("gone",!sourceById(c.dataset.src)); }); }

/* ---------- sentences ---------- */
const flatText=segs=>segs.map(s=>s.src?CHIP:s.t).join("");
const openQuote=s=>(s.match(/“/g)||[]).length>(s.match(/”/g)||[]).length || (s.match(/"/g)||[]).length%2===1;
const ABBREV=/(?:\b(?:e\.g|i\.e|cf|vs|al|Dr|Prof|Fig|No|p|pp)|\b\p{Lu})\.\s*$/u;
/* Spans [start,end) in flat text. A sentence never ends inside a quotation or after an
   abbreviation, and a citation written after the full stop belongs to the sentence before. */
function sentenceSpans(flatStr){
  const out=[]; let start=0;
  const re=/[.!?]+["”’)]*(?=\s|￼|$)|\n/g; let m;
  while((m=re.exec(flatStr))){
    let end=m.index+m[0].length; const s=flatStr.slice(start,end);
    if(openQuote(s)&&!/\n\s*\n/.test(s)&&m[0]!=="\n") continue;
    if(m[0]==="\n"&&openQuote(s)&&/^[^\n]/.test(flatStr.slice(end))) continue;          // a quote pasted with line breaks
    if(m[0]!=="\n"&&ABBREV.test(s)) continue;
    const trailing=flatStr.slice(end).match(/^[ ]*￼(?:[ ]*￼)*[.]?(?=\s*(?:\n|$|\p{Lu}))/u);
    if(trailing&&m[0]!=="\n"){ end+=trailing[0].length; re.lastIndex=end; }
    out.push([start,end]); start=end;
  }
  if(start<flatStr.length) out.push([start,flatStr.length]);
  return out;
}
const QUOTED=/“([^”]+)”|"([^"]+)"/g;
const quotesIn=s=>[...s.matchAll(QUOTED)].map(m=>(m[1]||m[2]).trim().replace(/[.,;:]+$/,""));
const keyOf=s=>flat(s.text)+"|"+s.srcs.join(",");
function readSentences(){
  const segs=WRITING.segments, f=flatText(segs), ids=segs.filter(s=>s.src).map(s=>s.src);
  let used=0;
  return sentenceSpans(f).map(([start,end])=>{
    const raw=f.slice(start,end), n=(raw.match(/￼/g)||[]).length;
    const s={ start, srcs:[...new Set(ids.slice(used,used+n))], text:raw.replace(/￼/g," ").replace(/\s+/g," ").replace(/ ([.,;:!?])/g,"$1").trim() };
    used+=n; s.key=keyOf(s); return s;
  }).filter(s=>s.text||s.srcs.length);
}

/* ---------- judging: a sentence starts as Reported and needs evidence to rise ---------- */
const REPORTED="Reported (not checked)";
const typedReference=s=>writesReference(s.text.replace(QUOTED," "))||RAW_REF.test(s.text);
const fromScribe=s=>(DRAFT?DRAFT.claims:[]).find(c=>flat(c.text)===flat(s.text));
function judgeSentence(s){
  const items=s.srcs.map(sourceById), say=(label,why,quotes=[])=>({label,why,quotes});
  if(items.some(i=>!i)) return say("Not found","A cited source is no longer in your library.");
  if(typedReference(s)) return say("Not found","A reference was typed by hand. Use @ to attach a source from your library.");
  const ai=fromScribe(s);
  if(ai&&(ai.label==="AI reasoning"||ai.label==="Not found")) return say(ai.label,"These words are Scribe's, with the label they had there.");
  if(!WRITING.checked.includes(s.key)) return say(REPORTED,"Not checked yet.");
  return judgeQuotes(s,items,say);
}
/* Verified: every quote found word for word, every cited source proven and audited,
   and the sentence says no more than its quotes. */
function judgeQuotes(s,items,say){
  const quotes=quotesIn(s.text);
  if(!quotes.length) return say(REPORTED,"No quoted words to look for, so the claim itself was not checked.");
  const vs=quotes.map(q=>({...bestVerdict(q,items),quote:q}));
  const no=why=>say(REPORTED,why,vs);
  if(vs.some(v=>v.name==="notFound")) return say("Not found","",vs);
  if(vs.some(v=>!v.found)) return no("");
  if(quotes.some(q=>wordCount(q)<MIN_QUOTE)) return no(`A quotation under ${MIN_QUOTE} words proves too little.`);
  const bad=items.find(i=>i.audit!=="Verified");
  if(bad) return no(`The words are there, but the audit of ${bad.id} says: ${bad.audit||"not audited"}.`);
  const empty=items.find(i=>!quotes.some(q=>checkQuote(q,i).found));
  if(empty) return no(`No quoted words come from ${empty.id}, so that citation is not proven.`);
  if(!claimWithinQuote(s.text,quotes.join(" "))) return no("The quotation is real, but the sentence says more than the quotation does.");
  return say("Verified","The exact words are in the source and the reference passed audit.",vs);
}
/* The sentences that count as claims: cited ones, and any with a typed reference. */
function studentClaims(){
  return readSentences().filter(s=>s.srcs.length||typedReference(s)).map(s=>{
    const j=judgeSentence(s);
    return {...s, student:true, src:s.srcs.join(", ")||"no source", label:j.label, why:j.why, quotes:j.quotes, accepted:WRITING.accepted[s.key]||"",
            quote:j.label==="Verified"?quotesIn(s.text).join(" … "):"" };
  });
}

/* ---------- Check this: audits and looks, never edits ---------- */
async function checkWriting(){
  const claims=studentClaims(), btn=$("#checkWriting"); if(!claims.length) return;
  btn.disabled=true; agent("auditor","run","checking your sentences"); pipeNote("Auditor is checking your text. It changes nothing.");
  for(const id of new Set(claims.flatMap(c=>c.srcs))){ const i=sourceById(id); if(i) await auditSource(i); }
  WRITING.checked=[...new Set([...WRITING.checked,...claims.map(c=>c.key)])];      // only the words that were there when pressed
  await quoteChecker(studentClaims());
  const now=studentClaims(), v=now.filter(c=>c.label==="Verified").length;
  agent("auditor","done",`${v} of ${now.length} sentences verified`);
  log("Auditor",`checked ${claims.length} of the student's sentences; ${v} verified; no words changed`);
  btn.disabled=false; drawBadges(); renderExport();
}

/* ---------- badges in the margin ---------- */
function pointAt(offset){
  let left=offset;
  const walk=node=>{
    if(node.nodeType===3){
      const vis=[...node.data].map((c,i)=>/[​￼]/.test(c)?-1:i).filter(i=>i>=0);
      if(left<vis.length) return [node,vis[left]];
      left-=vis.length; return null;
    }
    if(node.dataset?.src||node.nodeName==="BR"){ if(left===0) return [node,-1]; left--; return null; }
    if(/^(DIV|P)$/.test(node.nodeName)&&node!==editor&&node.previousSibling) left=Math.max(0,left-1);
    for(const n of node.childNodes){ const hit=walk(n); if(hit) return hit; }
    return null;
  };
  return walk(editor);
}
function topOf(s){
  const lead=flatText(WRITING.segments).slice(s.start).match(/^\s*/)[0].length;
  const at=pointAt(s.start+lead); if(!at) return 0;
  if(at[1]<0) return at[0].getBoundingClientRect().top;
  const r=document.createRange(); r.setStart(at[0],at[1]); r.setEnd(at[0],at[1]+1);
  return r.getBoundingClientRect().top;
}
function drawBadges(){
  const box=$("#margin"); box.innerHTML="";
  const base=editor.getBoundingClientRect().top; let floor=0;
  const claims=studentClaims();
  claims.forEach(c=>{
    const {text,k,note}=badgeFor(c), b=el("div","margin-badge "+k,`<b>${esc(text)}</b><span>${note?esc(note)+" ":""}${esc(c.srcs.join(", "))} ${esc(c.why)}${c.accepted?" You kept it because: "+esc(c.accepted):""}</span>${c.quotes.map(quoteLine).join("")}`);
    b.appendChild(accessLinks(c.srcs)); box.appendChild(b);
    b.dataset.want=topOf(c)-base;
  });
  fillAccess();                                                // links first, so each badge has its final height
  [...box.children].forEach(b=>{ const top=Math.max(+b.dataset.want,floor); b.style.top=top+"px"; floor=top+b.offsetHeight+8; });
  box.style.minHeight=floor+"px";
  const all=readSentences().length;
  $("#writeCount").textContent=all?`${all} sentence(s): ${claims.filter(c=>c.srcs.length).length} with a citation, ${claims.filter(c=>!c.srcs.length).length} with a typed reference.`:"";
  $("#checkWriting").disabled=!claims.length;
}

/* ---------- changes ---------- */
const citesNow=()=>WRITING.segments.filter(s=>s.src).map(s=>s.src);
function editorChanged(){
  const before=citesNow(); WRITING.segments=readEditor();
  const after=citesNow(), gone=before.filter(id=>{ const n=after.indexOf(id); if(n>=0) after.splice(n,1); return n<0; });
  gone.forEach(id=>log("You",`removed a citation of ${id}`));
  refreshChips(); drawBadges(); unlockWriting(); saveStateSoon();
}
function unlockWriting(){ if(studentClaims().length) unlock(5); }
function redrawWriting(){ drawEditor(); refreshChips(); drawBadges(); }
/* After a merge, citations of the merged source point to the kept one and must be checked again. */
function moveCitations(from,to){ WRITING.segments.forEach(s=>{ if(s.src===from) s.src=to; }); redrawWriting(); }
function resetWriting(){ WRITING={segments:[],checked:[],accepted:{}}; redrawWriting(); }

/* ---------- the @ menu ---------- */
let menuAt=null, menuPick=0;
function atQuery(){
  const sel=getSelection(); if(!sel.isCollapsed||!sel.anchorNode||sel.anchorNode.nodeType!==3||!editor.contains(sel.anchorNode)) return null;
  const before=sel.anchorNode.data.slice(0,sel.anchorOffset), m=before.match(/(?:^|[^\p{L}\p{N}])@([\p{L}\p{N}' -]{0,30})$/u);
  return m?{node:sel.anchorNode,from:sel.anchorOffset-m[1].length-1,to:sel.anchorOffset,q:m[1]}:null;
}
function matches(q){
  const want=norm(q);
  return LIB.filter(i=>i.opened===true&&norm([i.id,i.authors.join(" "),i.year,i.title].join(" ")).includes(want)).slice(0,8);
}
function closeMenu(){ menuAt=null; $("#atMenu").hidden=true; }
function drawMenu(){
  const at=atQuery(), box=$("#atMenu"); if(!at) return closeMenu();
  const found=matches(at.q);
  if(!found.length&&/\s/.test(at.q)) return closeMenu();                // ordinary text after an @
  menuAt=at; menuPick=Math.min(menuPick,Math.max(0,found.length-1)); box.innerHTML=""; box.hidden=false;
  if(!found.length) box.appendChild(el("div","at-none",LIB.length?"Not found in your library. Only sources you approved can be cited.":"Your library is empty. Approve a source first."));
  found.forEach((i,n)=>{
    const b=el("button","at-item"+(n===menuPick?" on":""),`<b>${esc(i.id)} ${esc(shortAuthors(i))}, ${esc(i.year||"n.d.")}</b><span>${esc(i.title)}</span>`);
    b.onmousedown=e=>{ e.preventDefault(); insertCitation(i.id); }; box.appendChild(b);
  });
  const r=document.createRange(); r.setStart(at.node,at.from); r.setEnd(at.node,at.to);
  const c=r.getBoundingClientRect(), w=$("#writeWrap").getBoundingClientRect();
  box.style.top=(c.bottom-w.top+6)+"px"; box.style.left=Math.max(0,Math.min(c.left-w.left,w.width-380))+"px";
}
function insertCitation(id){
  if(!menuAt||!sourceById(id)?.opened) return;
  const r=document.createRange(); r.setStart(menuAt.node,menuAt.from); r.setEnd(menuAt.node,menuAt.to); r.deleteContents();
  const tail=document.createTextNode(ZWSP), chip=makeChip(id); r.insertNode(tail); r.insertNode(chip);
  getSelection().collapse(tail,1); closeMenu();
  log("You",`cited ${id}`); editorChanged();
}
function menuKey(e){
  const items=$("#atMenu").querySelectorAll(".at-item");
  if(e.key==="Escape"){ e.preventDefault(); return closeMenu(); }
  if(!items.length) return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); menuPick=(menuPick+(e.key==="ArrowDown"?1:items.length-1))%items.length; drawMenu(); }
  if(e.key==="Enter"||e.key==="Tab"){ e.preventDefault(); insertCitation(matches(menuAt.q)[menuPick].id); }
}

/* ---------- wiring: plain text in, nothing else ---------- */
const typeText=t=>document.execCommand("insertText",false,t);
editor.oninput=()=>{ menuPick=0; editorChanged(); drawMenu(); };
editor.onkeydown=e=>{
  if(menuAt) return menuKey(e);
  if(e.key==="Enter"){ e.preventDefault(); document.execCommand("insertLineBreak"); }
};
editor.onbeforeinput=e=>{ if(/^format/.test(e.inputType)) e.preventDefault(); };
editor.onpaste=e=>{ e.preventDefault(); typeText(e.clipboardData.getData("text/plain")); };   // a pasted citation arrives as plain words, unattached
editor.ondrop=e=>e.preventDefault();
editor.onblur=closeMenu;
addEventListener("resize",()=>{ if($("#s2").classList.contains("on")) drawBadges(); });
function openWriting(){ unlock(2); goStage(2); redrawWriting(); editor.focus(); }
$("#toWrite").onclick=openWriting;
$("#checkWriting").onclick=checkWriting;
$("#writeExport").onclick=()=>{ unlock(5); goStage(5); renderExport(); };
$("#askScribe").onclick=()=>$("#toDraft").click();
