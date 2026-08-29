/* ===================== 设置 MenuTree 多版本管理平台 ===================== */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>(s==null?'':String(s)).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const shortLabel=n=>String(n.label||'').split('\n')[0];
const REGIONS=['海外','国内','机芯'];

/* ---------- field canonicalization (ported from parser) ---------- */
const CANON={
 '默认值':'默认值','Default':'默认值','菜单内容':'取值/选项',
 '说明（zh-CN）':'说明(中)','Explanation':'说明(英/通用)','说明（en-US）':'说明(英)',
 '隐藏条件':'隐藏条件','隐藏逻辑':'隐藏条件','灰显条件':'灰显条件','置灰条件':'灰显条件',
 '灰显提示Toast （纯文本，中文）':'灰显提示(中)','灰显提示语（中）':'灰显提示(中)','置灰提示语（中）':'灰显提示(中)',
 '灰显提示Toast （纯文本，英文）':'灰显提示(英)','灰显提示语（英）':'灰显提示(英)','置灰提示语（英）':'灰显提示(英)',
 '配置项':'配置项','机芯条件':'机芯条件','是否跟随图像重置恢复':'跟随重置','控制中心配置快捷设置':'快捷设置',
 'SPEC':'SPEC','备注':'备注','TV Source':'信号源:TV','Launcher':'信号源:Launcher','Mdida':'信号源:Media',
 'HDMI':'信号源:HDMI','VGA':'信号源:VGA','Third-party application':'信号源:三方应用'
};
const FIELD_ORDER=["取值/选项","默认值","说明(中)","说明(英)","说明(英/通用)","隐藏条件","灰显条件","灰显提示(中)","灰显提示(英)","配置项","机芯条件","跟随重置","快捷设置","SPEC","备注","信号源:TV","信号源:Launcher","信号源:Media","信号源:HDMI","信号源:VGA","信号源:三方应用"];
function canonKey(k){
  if(CANON[k]) return CANON[k];
  if(/^备注/.test(k)) return '备注';
  if(/^隐藏/.test(k)) return '隐藏条件';
  if(/^(灰显|置灰)/.test(k)) return /提示/.test(k)?'灰显提示(中)':'灰显条件';
  return k;
}

/* ---------- IndexedDB wrapper ---------- */
const IDB={db:null,
  open(){return new Promise((res,rej)=>{
    const rq=indexedDB.open('yinhua_menutree_db',1);
    rq.onupgradeneeded=e=>{const db=e.target.result; if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');};
    rq.onsuccess=e=>{this.db=e.target.result;res();}; rq.onerror=e=>rej(e);
  });},
  get(key){return new Promise((res,rej)=>{const t=this.db.transaction('kv','readonly').objectStore('kv').get(key); t.onsuccess=()=>res(t.result); t.onerror=rej;});},
  set(key,val){return new Promise((res,rej)=>{const t=this.db.transaction('kv','readwrite').objectStore('kv').put(val,key); t.onsuccess=()=>res(); t.onerror=rej;});}
};

/* ---------- global state ---------- */
let STORE={versions:[],data:{},history:[]};   // versions:[{id,name}], data:{dsKey:Dataset}, history:[logEntry]
let curVer=null, curRegion='海外';
const dsKey=(v,r)=>v+'::'+r;
function curDS(){ const k=dsKey(curVer,curRegion); return STORE.data[k]||null; }
function ensureDS(v,r){ const k=dsKey(v,r); if(!STORE.data[k]) STORE.data[k]={trees:[],rawSheets:[],originalFiles:[],sheetEdits:{},sheetLayout:{},sourceClears:{},edits:{},added:[],deleted:{},ts:{},confirmed:{},customCols:[],hiddenColumns:[],layout:{colWidths:{},rowHeights:{}},cellColors:{},cellFormats:{},columnMarks:{},ui:{}}; const ds=STORE.data[k]; if(!ds.sheetEdits)ds.sheetEdits={};if(!ds.sheetLayout)ds.sheetLayout={};if(!ds.sourceClears)ds.sourceClears={}; if(!ds.ts) ds.ts={}; if(!ds.confirmed) ds.confirmed={}; if(!ds.customCols) ds.customCols=[]; if(!ds.hiddenColumns)ds.hiddenColumns=[]; if(!ds.rawSheets) ds.rawSheets=[]; if(!ds.originalFiles)ds.originalFiles=[]; if(!ds.layout) ds.layout={colWidths:{},rowHeights:{}}; if(!ds.layout.colWidths)ds.layout.colWidths={}; if(!ds.layout.rowHeights)ds.layout.rowHeights={}; if(!ds.cellColors)ds.cellColors={}; if(!ds.cellFormats)ds.cellFormats={}; if(!ds.columnMarks)ds.columnMarks={};if(!ds.ui)ds.ui={}; return ds; }
const colorKey=(id,key)=>id+'@@'+key;
function cellColor(ds,r,key){ return (ds.cellColors&&ds.cellColors[colorKey(r.id,key)]) || (key==='__name'?r.sourceNameColor:(r.sourceColors&&r.sourceColors[key])) || ''; }
function cellFormat(ds,r,key){ const src=key==='__name'?(r.sourceNameFormat||{}):((r.sourceFormats&&r.sourceFormats[key])||{}); const manual=(ds.cellFormats&&ds.cellFormats[colorKey(r.id,key)])||{}; return Object.assign({},src,manual); }
function inlineCellStyle(ds,r,key){ const f=cellFormat(ds,r,key),bg=cellColor(ds,r,key); const s=[]; if(bg)s.push('background:'+bg); if(f.bold)s.push('font-weight:700'); if(f.italic)s.push('font-style:italic'); const deco=[f.underline?'underline':'',f.strike?'line-through':''].filter(Boolean).join(' '); if(deco)s.push('text-decoration:'+deco); if(f.color)s.push('color:'+f.color); if(f.align)s.push('text-align:'+f.align); return s.length?` style="${s.join(';')}"`:''; }
function setCellColor(id,key,color){ const ds=curDS(); ds.cellColors=ds.cellColors||{}; const src=String(id).startsWith('SRC@@'),k=src?id:colorKey(id,key);if(src&&color&&ds.sourceClears&&ds.sourceClears[k])delete ds.sourceClears[k].fill;if(color)ds.cellColors[k]=color;else delete ds.cellColors[k]; persist();render(); }
const tsKey=(id,key)=>id+'@@'+key;
// confirm an edit: keep the new value but clear the red highlight
function confirmField(id,key){
  const ds=curDS(); if(!ds) return; pushUndo(); ds.confirmed=ds.confirmed||{}; ds.confirmed[tsKey(id,key)]=true;
  persist(); render(); refreshDrawerIfOpen(); toast('已确认「'+fieldTitle(key)+'」');
}
function confirmName(id){
  const ds=curDS(); if(!ds) return; pushUndo(); ds.confirmed=ds.confirmed||{}; ds.confirmed[tsKey(id,'__name')]=true;
  persist(); render(); refreshDrawerIfOpen(); toast('已确认菜单名修改');
}
function isConfirmed(ds,id,key){ return ds.confirmed&&ds.confirmed[tsKey(id,key)]; }

let saveTimer=null;
function persist(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>{ if(!IDB.db)return; IDB.set('store',STORE).catch(e=>console.warn('persist fail',e)); },150); }

/* ---------- undo / redo (per current dataset) ---------- */
const UNDO={}, REDO={}; // key: dsKey -> array of snapshots
const UNDO_LIMIT=50;
function dsSnapshot(ds){ return JSON.stringify({sheetEdits:ds.sheetEdits,sheetLayout:ds.sheetLayout,sourceClears:ds.sourceClears,edits:ds.edits,added:ds.added,deleted:ds.deleted,ts:ds.ts,confirmed:ds.confirmed,customCols:ds.customCols,hiddenColumns:ds.hiddenColumns,cellColors:ds.cellColors,cellFormats:ds.cellFormats,columnMarks:ds.columnMarks,ui:ds.ui}); }
function applySnapshot(ds,snap){ const s=JSON.parse(snap); ds.sheetEdits=s.sheetEdits||{};ds.sheetLayout=s.sheetLayout||{};ds.sourceClears=s.sourceClears||{};ds.edits=s.edits||{}; ds.added=s.added||[]; ds.deleted=s.deleted||{}; ds.ts=s.ts||{}; ds.confirmed=s.confirmed||{}; ds.customCols=s.customCols||[]; ds.hiddenColumns=s.hiddenColumns||[]; ds.cellColors=s.cellColors||{}; ds.cellFormats=s.cellFormats||{}; ds.columnMarks=s.columnMarks||{};ds.ui=s.ui||{}; }
// call BEFORE mutating current dataset
function pushUndo(){ const k=dsKey(curVer,curRegion); const ds=curDS(); if(!ds) return; (UNDO[k]=UNDO[k]||[]).push(dsSnapshot(ds)); if(UNDO[k].length>UNDO_LIMIT) UNDO[k].shift(); REDO[k]=[]; updateUndoButtons(); }
function undo(){ const k=dsKey(curVer,curRegion); const ds=curDS(); if(!ds||!(UNDO[k]&&UNDO[k].length)){ toast('没有可撤销的操作'); return; }
  (REDO[k]=REDO[k]||[]).push(dsSnapshot(ds)); applySnapshot(ds,UNDO[k].pop());
  persist(); rebuildColumns(ds); render(); refreshDrawerIfOpen(); updateUndoButtons(); toast('已撤销上一步'); }
function redo(){ const k=dsKey(curVer,curRegion); const ds=curDS(); if(!ds||!(REDO[k]&&REDO[k].length)){ toast('没有可重做的操作'); return; }
  (UNDO[k]=UNDO[k]||[]).push(dsSnapshot(ds)); applySnapshot(ds,REDO[k].pop());
  persist(); rebuildColumns(ds); render(); refreshDrawerIfOpen(); updateUndoButtons(); toast('已重做下一步'); }
function updateUndoButtons(){ const k=dsKey(curVer,curRegion); const ub=$('#undoBtn'),rb=$('#redoBtn'); if(ub) ub.disabled=!(UNDO[k]&&UNDO[k].length); if(rb) rb.disabled=!(REDO[k]&&REDO[k].length); }

/* ---------- modification history log ---------- */
function logChange(entry){
  STORE.history=STORE.history||[];
  STORE.history.push(Object.assign({ts:Date.now()},entry));
  // cap to last 2000 entries
  if(STORE.history.length>2000) STORE.history=STORE.history.slice(-2000);
}

/* ---------- Excel parser (browser, ported from Python parse.py) ---------- */
const LEVEL_PAT=/(小标题|一级|二级|三级|四级|五级|六级|l\s*[1-6]|first\s*level|second\s*level|third\s*level|fourth\s*level|fifth\s*level|sixth\s*level|菜单内容)/i;
const norm=v=>v==null?'':String(v).replace(/\r\n/g,'\n').trim();
function findHeaderRow(rows){
  let best=0,bestScore=-1;
  for(let r=0;r<Math.min(4,rows.length);r++){
    let score=0; (rows[r]||[]).forEach(c=>{ if(LEVEL_PAT.test(norm(c))) score++; });
    if(score>bestScore){bestScore=score;best=r;}
  }
  return best;
}
function classifyCols(header){
  const level=[],other={};
  header.forEach((raw,ci)=>{ const h=norm(raw); if(!h) return;
    if(LEVEL_PAT.test(h)&&!/菜单内容/.test(h)) level.push(ci);
    else other[ci]=h;
  });
  return {level,other};
}
// Read Excel fill colour (SheetJS stores this as ARGB on the cell style).
// Return #RRGGBB, or empty when the cell uses the default/no fill.
function excelFillColor(ws,row,col){
  if(!ws)return'';
  const addr=XLSX.utils.encode_cell({r:row,c:col}); const cell=ws[addr];
  const style=cell&&cell.s; const fill=style&&(style.fill||style);
  const rgb=fill&&fill.fgColor&&fill.fgColor.rgb;
  if(!rgb)return'';
  const hex=String(rgb).replace(/^#/, '').slice(-6).toUpperCase();
  if(!/^[0-9A-F]{6}$/.test(hex)||hex==='FFFFFF'||hex==='000000')return'';
  return '#'+hex;
}
function attachWorkbookStyles(wb){
  const styles=wb.Styles||{};
  wb.SheetNames.forEach((sn,idx)=>{ const ws=wb.Sheets[sn]; const f=wb.files&&wb.files['xl/worksheets/sheet'+(idx+1)+'.xml']; if(!ws||!f||!f.content)return; const xml=f.content.toString(); ws.__formats={};
    const re=/<c\s+([^>]*\br="([A-Z]+\d+)"[^>]*)>/g; let m;
    while((m=re.exec(xml))){ const attrs=m[1],addr=m[2],sm=/\bs="(\d+)"/.exec(attrs); if(!sm)continue; const xf=(styles.CellXf||[])[+sm[1]]||{}; const font=(styles.Fonts||[])[+(xf.fontId??xf.fontid??0)]||{}; const out={}; if(font.bold)out.bold=true;if(font.italic)out.italic=true;if(font.strike)out.strike=true;if(font.underline)out.underline=true;const rgb=font.color&&font.color.rgb;if(rgb)out.color='#'+String(rgb).slice(-6);const al=xf.alignment&&xf.alignment.horizontal;if(['left','center','right'].includes(al))out.align=al;ws.__formats[addr]=out;
    }
  });
}
function excelTextFormat(ws,row,col){
  if(!ws)return{}; const addr=XLSX.utils.encode_cell({r:row,c:col}); const cell=ws[addr]; const s=cell&&cell.s||{}; const f=s.font||{}; const a=s.alignment||{};
  const out=Object.assign({},ws.__formats&&ws.__formats[addr]||{}); const rgb=f.color&&f.color.rgb; const color=rgb&&/^[0-9A-F]{6,8}$/.test(String(rgb).replace(/^#/,'').slice(-6))?'#'+String(rgb).replace(/^#/,'').slice(-6):'';
  if(f.bold)out.bold=true; if(f.italic)out.italic=true; if(f.underline)out.underline=true; if(f.strike)out.strike=true; if(color)out.color=color;
  const h=(a.horizontal||'').toLowerCase(); if(['left','center','right'].includes(h))out.align=h;
  return out;
}
function parseSheet(aoa,region,category,sheetName,ws){
  const hr=findHeaderRow(aoa);
  const {level,other}=classifyCols(aoa[hr]||[]);
  const roots=[]; const stack=[]; let idc=0;
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    let depth=null,label='',labelColor='',labelFormat={};
    for(let i=0;i<level.length;i++){ const v=norm(row[level[i]]); if(v){depth=i;label=v;labelColor=excelFillColor(ws,r,level[i]);labelFormat=excelTextFormat(ws,r,level[i]);break;} }
    const fields={};
    const fieldColors={}; const fieldFormats={};
    Object.keys(other).forEach(ci=>{ const v=norm(row[ci]); if(v){ const ck=other[ci]; if(fields[ck]&&!fields[ck].includes(v)) fields[ck]+='\n'+v; else if(!fields[ck]) fields[ck]=v; const color=excelFillColor(ws,r,+ci); if(color)fieldColors[ck]=color; const fmt=excelTextFormat(ws,r,+ci); if(Object.keys(fmt).length)fieldFormats[ck]=fmt; } });
    const blank=(depth===null)&&Object.keys(fields).length===0;
    if(blank) continue;
    if(depth===null){ // continuation row -> merge into last node
      if(stack.length){ const tgt=stack[stack.length-1].node; Object.entries(fields).forEach(([k,v])=>{ if(tgt.fields[k]&&!tgt.fields[k].includes(v)) tgt.fields[k]+='\n'+v; else if(!tgt.fields[k]) tgt.fields[k]=v; }); }
      continue;
    }
    idc++;
    const node={id:region+'|'+category+'|'+sheetName+'|'+idc,label,depth,labelColor,labelFormat,fields,fieldColors,fieldFormats,children:[]};
    while(stack.length&&stack[stack.length-1].depth>=depth) stack.pop();
    if(stack.length) stack[stack.length-1].node.children.push(node); else roots.push(node);
    stack.push({depth,node});
  }
  return roots;
}
function categoryOf(sheet){
  if(/图像|Picture/i.test(sheet)) return '图像';
  if(/声音|Sound/i.test(sheet)) return '声音';
  if(/Screen/i.test(sheet)) return '屏幕设置';
  if(/Audio\s*Output/i.test(sheet)) return '音频输出';
  return sheet;
}
function countNodes(roots){ let n=0; const w=x=>{n++;(x.children||[]).forEach(w);}; roots.forEach(w); return n; }
function addPaths(roots,prefix){ const w=(n,p)=>{ n.path=p.concat([shortLabel(n)]); (n.children||[]).forEach(c=>w(c,n.path)); }; roots.forEach(n=>w(n,prefix)); }

/* drop field keys that are empty across ALL nodes in a set of roots */
function pruneEmptyFields(roots){
  const nonEmpty=new Set();
  const scan=n=>{ Object.entries(n.fields||{}).forEach(([k,v])=>{ if(v!=null&&String(v).trim()!=='') nonEmpty.add(k); }); (n.children||[]).forEach(scan); };
  roots.forEach(scan);
  const prune=n=>{ Object.keys(n.fields||{}).forEach(k=>{ if(!nonEmpty.has(k)) delete n.fields[k]; }); (n.children||[]).forEach(prune); };
  roots.forEach(prune);
  return nonEmpty.size;
}

/* parse ArrayBuffer: menu trees + non-menu sheets (Revision History etc.) */
function rawSheetFromWorksheet(sheet,ws){
  // This is the literal source-grid cache used by selected-sheet mirror mode.
  // It deliberately records individual cell display text and presentational
  // metadata rather than reusing menu-tree fields, which are only a derived view.
  const range=ws&&ws['!ref']?XLSX.utils.decode_range(ws['!ref']):{s:{r:0,c:0},e:{r:0,c:0}};
  const rowCount=Math.max(0,range.e.r-range.s.r+1), colCount=Math.max(0,range.e.c-range.s.c+1);
  const rows=[],cellStyles=[];
  for(let r=range.s.r;r<=range.e.r;r++){
    const row=[],styles=[];
    for(let c=range.s.c;c<=range.e.c;c++){
      const cell=ws[XLSX.utils.encode_cell({r,c})];
      // Use the workbook's displayed text (`w`) whenever present. It is what
      // Excel showed at import time (numbers/dates/formulas), not a normalized value.
      row.push(cell&&cell.w!=null?cell.w:(cell&&cell.v!=null?cell.v:(cell&&cell.f!=null?'='+cell.f:'')));
      const fill=excelFillColor(ws,r,c),format=excelTextFormat(ws,r,c);
      styles.push((fill||Object.keys(format).length)?{fill,format}:null);
    }
    rows.push(row);cellStyles.push(styles);
  }
  return {sheet,rows,cellStyles,rowCount,colCount,startRow:range.s.r,startCol:range.s.c,merges:ws['!merges']||[],ref:ws['!ref']||'',rowsMeta:ws['!rows']||[],colsMeta:ws['!cols']||[]};
}

/* ---------- parse ArrayBuffer: derived menu trees + a complete original-sheet index ---------- */
function parseWorkbook(arrayBuf,region){
  const wb=XLSX.read(arrayBuf,{type:'array',cellStyles:true,bookFiles:true});
  attachWorkbookStyles(wb);
  const trees=[],rawSheets=[];
  wb.SheetNames.forEach(sn=>{
    const ws=wb.Sheets[sn];
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:true});
    rawSheets.push(rawSheetFromWorksheet(sn,ws));
    const cat=categoryOf(sn);
    const isRevision=/revision\s*history|修订记录|版本记录/i.test(sn);
    const hr=findHeaderRow(aoa);
    const classified=classifyCols(aoa[hr]||[]);
    const sourceColumns=Object.values(classified.other);
    const levelPos=new Map(classified.level.map((ci,i)=>[ci,i]));
    const sourceSchema=(aoa[hr]||[]).map((raw,ci)=>{
      const title=norm(raw); if(!title)return null;
      if(levelPos.has(ci)){const depth=levelPos.get(ci);return {key:'__lv'+depth,title,kind:'level',depth};}
      return {key:classified.other[ci],title,kind:'field'};
    }).filter(Boolean);
    const roots=isRevision?[]:parseSheet(aoa,region,cat,sn,ws);
    if(!roots.length)return;
    // Trees are a working view only; rawSheets and originalFiles keep every source cell.
    pruneEmptyFields(roots); addPaths(roots,[cat]);
    trees.push({sheet:sn,category:cat,roots,node_count:countNodes(roots),sourceColumns,sourceSchema});
  });
  return {trees,rawSheets};
}

/* ---------- flatten current dataset into rows ---------- */
function baseRows(ds){
  const rows=[]; let ord=0;
  (ds.trees||[]).forEach(t=>{
    const walk=(n,parent)=>{ rows.push({id:n.id,category:t.category,sheet:t.sheet,depth:n.depth,name:shortLabel(n),path:(n.path||[]).join(' › '),fields:n.fields||{},sourceColors:n.fieldColors||{},sourceNameColor:n.labelColor||'',sourceFormats:n.fieldFormats||{},sourceNameFormat:n.labelFormat||{},parent:parent||null,_order:ord++}); (n.children||[]).forEach(c=>walk(c,n.id)); };
    t.roots.forEach(r=>walk(r,null));
  });
  return rows;
}
function liveRows(ds){
  const base=baseRows(ds).filter(r=>!ds.deleted[r.id]);
  return base.concat(ds.added||[]);
}
function isAdded(ds,r){ return (ds.added||[]).some(a=>a.id===r.id); }
function rowFieldVal(ds,r,k){
  if(isAdded(ds,r)) return r.fields[k]||'';
  if(ds.edits[r.id]&&k in ds.edits[r.id]) return ds.edits[r.id][k];
  return r.fields[k]||'';
}
function rowName(ds,r){ if(!isAdded(ds,r)&&ds.edits[r.id]&&'__name' in ds.edits[r.id]) return ds.edits[r.id].__name; return r.name; }
function isFieldEdited(ds,r,k){ return !isAdded(ds,r)&&ds.edits[r.id]&&k in ds.edits[r.id]; }
function baseFieldOf(ds,id,k){ // original value from trees
  let found=''; (ds.trees||[]).forEach(t=>{ const w=n=>{ if(n.id===id){ found=n.fields[k]||''; } (n.children||[]).forEach(w); }; t.roots.forEach(w); }); return found;
}
function baseNameOf(ds,id){ let nm=''; (ds.trees||[]).forEach(t=>{ const w=n=>{ if(n.id===id) nm=shortLabel(n); (n.children||[]).forEach(w); }; t.roots.forEach(w); }); return nm; }

/* enumerable candidate values per field, for dropdown editing */
function buildCandidates(ds){
  const cand={};
  baseRows(ds).forEach(r=>Object.entries(r.fields).forEach(([k,v])=>{
    if(!v) return; const t=String(v).trim();
    if(t.length<=24 && /[\/、,]|开|关|自动|标准|低|中|高/.test(t) && !t.includes('\n')) (cand[k]=cand[k]||new Set()).add(t);
  }));
  const out={}; Object.entries(cand).forEach(([k,s])=>{ if(s.size>=2&&s.size<=40) out[k]=[...s].sort(); }); return out;
}

/* ---------- columns for current dataset ---------- */
const DEFAULT_HIDDEN=new Set(['说明(英)','说明(英/通用)','灰显提示(中)','灰显提示(英)','跟随重置','快捷设置','SPEC','信号源:TV','信号源:Launcher','信号源:Media','信号源:HDMI','信号源:VGA','信号源:三方应用']);
let COLS=[], visible={}, CANDIDATES={}, sortKey=null, sortDir=1;
const LEVEL_NAMES=['小标题','二级菜单','三级菜单','四级菜单'];
const MAX_LEVEL=3; // cap at 四级菜单 (depth 0..3); deeper items collapse into 四级 column
let MAX_DEPTH=0;
// display depth: clamp real depth to MAX_LEVEL so 5th+ level shows in 四级 column
function dispDepth(r){ return Math.min(r.depth,MAX_LEVEL); }
function sheetSourceColumns(ds,sheet){ const t=(ds.trees||[]).find(x=>x.sheet===sheet); return t&&t.sourceColumns||[]; }
function sheetSourceSchema(ds,sheet){
  const t=(ds.trees||[]).find(x=>x.sheet===sheet); if(t&&t.sourceSchema&&t.sourceSchema.length)return t.sourceSchema;
  // Backward compatibility: derive schema from a raw sheet imported by an earlier build.
  const raw=(ds.rawSheets||[]).find(x=>x.sheet===sheet); if(!raw||!raw.rows)return [];
  const hr=findHeaderRow(raw.rows),classified=classifyCols(raw.rows[hr]||[]),levelPos=new Map(classified.level.map((ci,i)=>[ci,i]));
  return (raw.rows[hr]||[]).map((v,ci)=>{const title=norm(v);if(!title)return null;return levelPos.has(ci)?{key:'__lv'+levelPos.get(ci),title,kind:'level',depth:levelPos.get(ci)}:{key:classified.other[ci],title,kind:'field'};}).filter(Boolean);
}
function sourceColumnsForRows(ds,rows){
  const out=[]; rows.forEach(r=>sheetSourceColumns(ds,r.sheet).forEach(k=>{if(!out.includes(k))out.push(k);})); return out;
}
function orderedFieldColumns(ds,rows){
  const used=new Set(); rows.forEach(r=>Object.keys(r.fields||{}).forEach(k=>used.add(k))); (ds.customCols||[]).forEach(k=>used.add(k));
  const sourceOrder=sourceColumnsForRows(ds,rows);
  const fallbackOrder=FIELD_ORDER.filter(k=>used.has(k)&&!sourceOrder.includes(k));
  const remainder=[...used].filter(k=>!sourceOrder.includes(k)&&!fallbackOrder.includes(k));
  return [...sourceOrder,...fallbackOrder,...remainder].filter(k=>!(ds.hiddenColumns||[]).includes(k));
}
function currentSheetFilter(){ return ($('#fSheet')&&$('#fSheet').value)||''; }
function rebuildColumns(ds){
  const used=new Set();
  const addKeys=r=>Object.entries(r.fields).forEach(([k,v])=>{ if(v!=null&&String(v).trim()!=='') used.add(k); });
  baseRows(ds).forEach(addKeys); (ds.added||[]).forEach(addKeys);
  // Source headers are structural data.  Keep even all-empty imported columns;
  // a blank source column must not disappear from the management view.
  (ds.trees||[]).forEach(t=>(t.sourceColumns||[]).forEach(k=>used.add(k)));
  (ds.customCols||[]).forEach(k=>used.add(k)); // user-added custom columns always show
  // Preserve the left-to-right source-header order first.  Canonical ordering is
  // only a fallback for manually added/legacy data with no workbook schema.
  const sourceOrder=[]; (ds.trees||[]).forEach(t=>(t.sourceColumns||[]).forEach(k=>{if(!sourceOrder.includes(k))sourceOrder.push(k);}));
  const fallbackOrder=FIELD_ORDER.filter(k=>used.has(k)&&!sourceOrder.includes(k));
  const remainder=[...used].filter(k=>!sourceOrder.includes(k)&&!fallbackOrder.includes(k));
  const fieldColsArr=[...sourceOrder,...fallbackOrder,...remainder];
  MAX_DEPTH=Math.min(MAX_LEVEL,Math.max(0,...liveRows(ds).map(r=>r.depth)));
  const levelCols=[]; for(let i=0;i<=MAX_DEPTH;i++) levelCols.push({key:'__lv'+i,title:LEVEL_NAMES[i]||('第'+(i+1)+'级'),kind:'level',depth:i});
  COLS=[{key:'__cat',title:'分类',kind:'meta'},...levelCols,...fieldColsArr.map(k=>({key:k,title:k,kind:'field'}))].filter(c=>!(ds.hiddenColumns||[]).includes(c.key));
  const sourceKeys=new Set(sourceOrder);
  const nv={}; COLS.forEach(c=>{ nv[c.key]=(c.key in visible)?visible[c.key]:(sourceKeys.has(c.key)?true:!DEFAULT_HIDDEN.has(c.title)); }); visible=nv;
  CANDIDATES=buildCandidates(ds);
}
function fieldCols(){ return COLS.filter(c=>c.kind==='field').map(c=>c.key); }
function cellVal(ds,r,key){
  if(key==='__cat') return r.category;
  if(key&&key.indexOf('__lv')===0){ const dep=+key.slice(4); return dep===dispDepth(r)?rowName(ds,r):''; }
  return rowFieldVal(ds,r,key);
}
function fieldClass(k){ if(k.includes('隐藏'))return'hide'; if(k.includes('灰显'))return'gray'; if(k.includes('配置项'))return'cfg'; return''; }
function hl(text,q){ const s=esc(text); if(!q) return s; try{ return s.replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi'),'<mark>$1</mark>'); }catch(e){ return s; } }

/* ---------- filters ---------- */
function levelLabel(header,i){const h=norm(header||'');if(/^l\s*1$/i.test(h))return'小标题';if(/^l\s*2$/i.test(h))return'二级菜单';if(/^l\s*3$/i.test(h))return'三级菜单';if(/^l\s*4$/i.test(h))return'四级菜单';return h||LEVEL_NAMES[i]||('第'+(i+1)+'级菜单');}
function refreshLevelFilter(ds,sheet){
  // The level selector follows the management table, not the source
  // workbook's arbitrary header names. It always exposes exactly the four
  // levels supported by the product table and acts as a row filter.
  const old=$('#fDepth').value;
  const deps=[{value:'(全部)',label:'全部'},...LEVEL_NAMES.map((label,i)=>({value:'L'+(i+1),label}))];
  $('#fDepth').innerHTML=deps.map(d=>`<option value="${d.value}">${esc(d.label)}</option>`).join('');
  $('#fDepth').value=deps.some(d=>d.value===old)?old:'(全部)';
}
function initFilters(ds){
  // Original-sheet mode does not use category grouping; the actual worksheet
  // itself is the only selector.
  const sheetSelect=$('#fSheet');sheetSelect.disabled=false;
  // Deliberately expose only real imported worksheets.  The aggregate menu
  // view is no longer a selector option, so imported data cannot show as a
  // stitched table by accident.
  const sheets=[...new Set((ds.rawSheets||[]).map(s=>s.sheet))];
  const wanted=(ds.ui&&ds.ui.viewSheet); const selected=sheets.includes(wanted)?wanted:(sheets[0]||'');
  $('#fSheet').innerHTML=sheets.map(s=>`<option>${esc(s)}</option>`).join(''); $('#fSheet').value=selected;
  ds.ui=ds.ui||{};ds.ui.viewSheet=selected;
  refreshLevelFilter(ds,selected);
}
function currentFilter(){ return {cat:'(全部)',sheet:currentSheetFilter(),depth:$('#fDepth').value,q:$('#fSearch').value.trim().toLowerCase(),hide:false,gray:false,cfg:false,edited:false}; }
function filteredRows(ds){
  const f=currentFilter();
  let rows=liveRows(ds).filter(r=>{
    if(f.cat!=='(全部)'&&r.category!==f.cat) return false;
    if(f.sheet&&r.sheet!==f.sheet) return false;
    if(f.depth!=='(全部)'&&('L'+(r.depth+1))!==f.depth) return false;
    if(f.hide&&!rowFieldVal(ds,r,'隐藏条件')) return false;
    if(f.gray&&!rowFieldVal(ds,r,'灰显条件')) return false;
    if(f.cfg&&!rowFieldVal(ds,r,'配置项')) return false;
    if(f.edited&&!(isAdded(ds,r)||ds.edits[r.id])) return false;
    if(f.q){ const hay=(rowName(ds,r)+' '+r.path+' '+fieldCols().map(k=>rowFieldVal(ds,r,k)).join(' ')).toLowerCase(); if(!hay.includes(f.q)) return false; }
    return true;
  });
  if(sortKey){ rows=rows.slice().sort((a,b)=>{ const va=cellVal(ds,a,sortKey),vb=cellVal(ds,b,sortKey); return va<vb?-sortDir:va>vb?sortDir:0; }); }
  return rows;
}

function applySourceFreeze(){
  const table=$('#tableWrap table');if(!table||!table.classList.contains('source-grid'))return;
  const cols=[...table.querySelectorAll('colgroup col')],widths=cols.slice(0,4).map(c=>Math.max(45,c.getBoundingClientRect().width||parseFloat(c.style.width)||160));
  $('#tbody').querySelectorAll('td.source-frozen[data-source-ci]').forEach(td=>{const ci=+td.dataset.sourceCi;if(ci>3)return;td.style.left=widths.slice(0,ci).reduce((a,b)=>a+b,0)+'px';td.classList.toggle('source-frozen-edge',ci===3);});
}
function sourceLayout(ds,sheet){ds.sheetLayout=ds.sheetLayout||{};return ds.sheetLayout[sheet]||(ds.sheetLayout[sheet]={colWidths:{},rowHeights:{}});}
function sourceTextWidth(value){
  const lines=String(value??'').split(/\r?\n/);
  let units=0;
  lines.forEach(line=>{
    let n=0;
    Array.from(line).forEach(ch=>{ n+=/[^\x00-\xff]/.test(ch)?2:1; });
    units=Math.max(units,n);
  });
  return units*8+28;
}
function sourceAutoWidths(rows,colCount){
  const widths=[];
  for(let ci=0;ci<colCount;ci++){
    let preferred=120;
    rows.forEach(row=>{ preferred=Math.max(preferred,sourceTextWidth(row&&row[ci])); });
    // Do not inherit oversized Excel column metadata. Fit to imported content,
    // keep a readable minimum, and cap long descriptions so the sheet can
    // still be scanned horizontally.
    widths[ci]=Math.round(Math.max(120,Math.min(520,preferred)));
  }
  return widths;
}
function initSourceResize(ds,raw){
  const table=$('#tableWrap table'),layout=sourceLayout(ds,raw.sheet),cols=[...table.querySelectorAll('colgroup col')],rows=[...$('#tbody').querySelectorAll('tr[data-source-row]')];
  const applyCol=(ci,w)=>{if(cols[ci])cols[ci].style.width=w+'px';};
  Object.entries(layout.colWidths||{}).forEach(([ci,w])=>applyCol(+ci,w));
  Object.entries(layout.rowHeights||{}).forEach(([ri,h])=>{const tr=rows.find(x=>+x.dataset.sourceRow===+ri);if(tr)tr.style.height=h+'px';});
  // First displayed row carries column resize handles.  They resize the entire
  // original sheet column, preserving the source data and cell positions.
  const first=rows[0];if(first)[...first.children].forEach((td,ci)=>{const h=document.createElement('span');h.className='source-col-resize';h.title='拖动调整本列宽度';h.onmousedown=e=>{e.preventDefault();e.stopPropagation();const startX=e.clientX,startW=cols[ci]?cols[ci].getBoundingClientRect().width:td.getBoundingClientRect().width;document.body.classList.add('resizing-col');const move=ev=>{applyCol(ci,Math.max(45,Math.min(900,startW+ev.clientX-startX)));applySourceFreeze();};const up=ev=>{const w=Math.round(Math.max(45,Math.min(900,startW+ev.clientX-startX)));layout.colWidths[ci]=w;applySourceFreeze();persist();document.body.classList.remove('resizing-col');window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);};td.appendChild(h);});
  rows.forEach(tr=>{const ri=+tr.dataset.sourceRow,h=document.createElement('span');h.className='source-row-resize';h.title='拖动调整本行高度';h.onmousedown=e=>{e.preventDefault();e.stopPropagation();const startY=e.clientY,startH=tr.getBoundingClientRect().height;document.body.classList.add('resizing-row');const move=ev=>tr.style.height=Math.max(22,Math.min(900,startH+ev.clientY-startY))+'px';const up=ev=>{layout.rowHeights[ri]=Math.round(Math.max(22,Math.min(900,startH+ev.clientY-startY)));persist();document.body.classList.remove('resizing-row');window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);};tr.appendChild(h);});
}
function sourceFormatKey(sheet,ri,ci){return 'SRC@@'+sheet+'@@'+ri+'@@'+ci;}
function selectedSourceInfo(ds){if(!selectedCell||!String(selectedCell.id||'').startsWith('SRC@@'))return null;const a=selectedCell.id.split('@@');const raw=(ds.rawSheets||[]).find(s=>s.sheet===a[1]);return raw?{raw,sheet:a[1],ri:+a[2],ci:+a[3],key:sourceFormatKey(a[1],+a[2],+a[3])}:null;}
function sourceCellStyle(ds,raw,ri,ci){
  const k=sourceFormatKey(raw.sheet,ri,ci),src=raw.cellStyles&&raw.cellStyles[ri]&&raw.cellStyles[ri][ci]||{},manual=ds.cellFormats&&ds.cellFormats[k]||{},clear=ds.sourceClears&&ds.sourceClears[k]||{},f=Object.assign({},src.format||{},manual),bg=(ds.cellColors&&ds.cellColors[k])||((clear.fill)?'':src.fill||'');const a=[];if(bg)a.push('background:'+bg);if(f.bold&&!clear.bold)a.push('font-weight:700');if(f.italic&&!clear.italic)a.push('font-style:italic');const deco=[f.underline&&!clear.underline?'underline':'',f.strike&&!clear.strike?'line-through':''].filter(Boolean).join(' ');if(deco)a.push('text-decoration:'+deco);if(f.color&&!clear.color)a.push('color:'+f.color);if(f.align&&!clear.align)a.push('text-align:'+f.align);return a.length?' style="'+a.join(';')+'"':'';
}
function sourceEditKey(sheet,ri,ci){return sheet+'@@'+ri+'@@'+ci;}
function sourceCellValue(ds,raw,ri,ci){const k=sourceEditKey(raw.sheet,ri,ci);return ds.sheetEdits&&Object.prototype.hasOwnProperty.call(ds.sheetEdits,k)?ds.sheetEdits[k]:(raw.rows[ri]&&raw.rows[ri][ci]||'');}
function editSourceCell(td){
  if(td.querySelector('textarea,input'))return;const ds=curDS(),raw=(ds.rawSheets||[]).find(s=>s.sheet===td.dataset.sheet);if(!raw)return;
  const ri=+td.dataset.ri,ci=+td.dataset.ci,old=sourceCellValue(ds,raw,ri,ci);
  const tree=(ds.trees||[]).find(t=>t.sheet===raw.sheet),category=tree?tree.category:categoryOf(raw.sheet),headerIndex=findHeaderRow(raw.rows||[]),header=raw.rows&&raw.rows[headerIndex]||[],levelCols=classifyCols(header).level.slice(0,4),levelIndex=levelCols.indexOf(ci),headerTitle=norm(header[ci])||('第'+(ci+1)+'列'),hierarchy=sourceHierarchyKey(raw,ri,category),sourcePath=raw.sheet+'!R'+(ri+1)+'C'+(ci+1);
  td.innerHTML=`<textarea class="cellinput source-input">${esc(old)}</textarea>`;td.classList.add('editing');const input=td.querySelector('textarea');input.focus();
  const grow=()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight+4,480)+'px';};grow();input.oninput=grow;
  const commit=()=>{
    const nv=input.value;if(nv===old){render();return;}
    pushUndo();
    ds.sheetEdits=ds.sheetEdits||{}; ds.ts=ds.ts||{};
    const key=sourceEditKey(raw.sheet,ri,ci),original=raw.rows[ri]&&raw.rows[ri][ci]!=null?String(raw.rows[ri][ci]):'';
    if(nv===original){ delete ds.sheetEdits[key]; delete ds.ts['SRC@@'+key]; }
    else { ds.sheetEdits[key]=nv; ds.ts['SRC@@'+key]=Date.now(); }
    logChange({version:curVer,region:curRegion,path:sourcePath,field:'原始 Sheet 单元格',oldVal:old,newVal:nv,type:'edit'});
    persist(); render(); updateChgBadge(ds); refreshDrawerIfOpen(); toast('已保存单元格修改（原始导入文件未改动）');
    offerSourceSync({sheet:raw.sheet,category,hierarchy,headerTitle,levelIndex:levelIndex>=0?levelIndex:null,ci,path:sourcePath,fieldTitle:headerTitle,newVal:nv});
  };
  input.onblur=commit;input.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.preventDefault();render();}};
}
function renderSourceSheet(ds,sheet,q,depthFilter){
  const raw=(ds.rawSheets||[]).find(s=>s.sheet===sheet);
  if(!raw){ toast('未找到该 Sheet 的原始数据，请重新导入该 Excel'); return false; }
  const rows=raw.rows||[], colCount=raw.colCount||Math.max(0,...rows.map(r=>r.length));
  if(!rows.length||!colCount){ $('#thead').innerHTML='';$('#tbody').innerHTML='<tr><td><div class="nores">此 Sheet 没有可显示的单元格。</div></td></tr>';return true; }
  const headerIndex=findHeaderRow(rows),header=rows[headerIndex]||[],levelCols=classifyCols(header).level.slice(0,4);
  const wantedDepth=/^L[1-4]$/.test(depthFilter||'')?+depthFilter.slice(1)-1:null;
  const rowDepths=[]; let activeDepth=null;
  rows.forEach((row,ri)=>{
    if(ri===headerIndex){rowDepths[ri]=null;return;}
    const own=levelCols.findIndex(ci=>norm(row&&row[ci])!=='');
    if(own>=0)activeDepth=own;
    rowDepths[ri]=activeDepth;
  });
  const visibleRowIndexes=rows.map((_,ri)=>ri).filter(ri=>ri===headerIndex||wantedDepth===null||rowDepths[ri]===wantedDepth);
  const merged=new Map();(raw.merges||[]).forEach(m=>{for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++){const k=(r-raw.startRow)+'@'+(c-raw.startCol);merged.set(k,{top:r===m.s.r&&c===m.s.c,rowspan:r===m.s.r?m.e.r-m.s.r+1:0,colspan:c===m.s.c?m.e.c-m.s.c+1:0});}});
  const cssFor=(ri,ci)=>sourceCellStyle(ds,raw,ri,ci);
  const renderCell=(v,tag,ri,ci)=>{const m=wantedDepth===null?merged.get(ri+'@'+ci):null;if(m&&!m.top)return '';const span=m?(m.rowspan>1?' rowspan="'+m.rowspan+'"':'')+(m.colspan>1?' colspan="'+m.colspan+'"':''):'';const val=sourceCellValue(ds,raw,ri,ci),frozen=ci<4?' source-frozen':'';return `<${tag} class="source-cell${frozen}" data-source-ci="${ci}" data-sheet="${esc(raw.sheet)}" data-ri="${ri}" data-ci="${ci}"${span}${cssFor(ri,ci)} title="双击编辑；Ctrl/Cmd+Enter 保存">${val==null||val===''?'<span class="source-blank">&nbsp;</span>':hl(val,q)}</${tag}>`;};
  // Literal rectangular source mirror.  No header detection, category grouping,
  // tree flattening, row merge or column reordering takes place in this branch.
  const tr=ri=>'<tr data-source-row="'+ri+'">'+Array.from({length:colCount},(_,ci)=>renderCell(rows[ri][ci]??'','td',ri,ci)).join('')+'</tr>';
  $('#thead').innerHTML=''; $('#tbody').innerHTML=visibleRowIndexes.map(tr).join('');
  $('#tbody').querySelectorAll('.source-cell').forEach(td=>{td.ondblclick=()=>editSourceCell(td);td.onclick=e=>{if(e.target.closest('textarea,input,.source-col-resize,.source-row-resize'))return;selectCell(sourceFormatKey(td.dataset.sheet,+td.dataset.ri,+td.dataset.ci),'__source');};});
  const table=$('#tableWrap table');table.classList.add('source-grid');table.style.width='max-content';table.style.minWidth='max-content';
  table.querySelectorAll('colgroup').forEach(x=>x.remove());
  const cg=document.createElement('colgroup'),layout=sourceLayout(ds,raw),autoWidths=sourceAutoWidths(rows,colCount);
  layout.colWidths=layout.colWidths||{};
  layout.rowHeights=layout.rowHeights||{};
  for(let ci=0;ci<colCount;ci++){
    const col=document.createElement('col');
    // A manually resized width wins. Otherwise calculate a content-based width
    // once for this imported sheet instead of inheriting the Excel column width.
    const saved=layout.colWidths&&layout.colWidths[ci];
    const px=saved||autoWidths[ci];
    if(!saved)layout.colWidths[ci]=px;
    col.style.width=Math.max(120,px)+'px';
    cg.appendChild(col);
  }
  table.insertBefore(cg,table.firstChild);
  $('#tbody').querySelectorAll('tr[data-source-row]').forEach(tr=>{const ri=+tr.dataset.sourceRow,m=(raw.rowsMeta||[])[ri];if(m&&m.hpt)tr.style.height=m.hpt+'pt';});
  initSourceResize(ds,raw);applySourceFreeze();
  const levelText=wantedDepth===null?'全部层级':LEVEL_NAMES[wantedDepth];
  $('#statline').innerHTML=`原始 Sheet 可编辑镜像 · <b>${esc(sheet)}</b> · 层级筛选：<b>${esc(levelText)}</b> · 显示 ${visibleRowIndexes.length}/${rows.length} 行 × ${colCount} 列 · 已按内容自适应列宽；前四列（小标题至四级菜单）已冻结；双击编辑，拖动调整行列尺寸`;
  return true;
}

/* ---------- render table ---------- */
function render(){
  const ds=curDS();
  if(!curVer){ $('#tableWrap').style.display='none'; $('#emptyState').style.display='flex'; return; }
  $('#emptyState').style.display='none'; $('#tableWrap').style.display='block';
  const f=currentFilter();
  if(f.sheet&&ds&&renderSourceSheet(ds,f.sheet,f.q,f.depth)){ $('#toolbar').style.display='flex';return; }
  if(!ds||!ds.trees.length){ renderEmptyDataset(); return; }
  $('#toolbar').style.display='flex';
  $('#tableWrap table').classList.remove('source-grid');
  $('#tableWrap table').style.width='';
  $('#tableWrap table').style.minWidth='';
  const rows=filteredRows(ds);
  // A chosen worksheet is rendered from its complete source schema: menu-level
  // columns and field columns stay at their exact original positions.
  let scopeKeys=null, scopeDepth=MAX_DEPTH, activeSchema=[];
  if(f.sheet){
    const sheetRows=liveRows(ds).filter(r=>r.sheet===f.sheet);
    activeSchema=sheetSourceSchema(ds,f.sheet);
    scopeKeys=new Set(activeSchema.filter(c=>c.kind==='field').map(c=>c.key)); scopeDepth=0;
    sheetRows.forEach(r=>{scopeDepth=Math.max(scopeDepth,dispDepth(r));Object.keys(r.fields||{}).forEach(k=>scopeKeys.add(k));});
    (ds.customCols||[]).forEach(k=>scopeKeys.add(k));
  } else if(f.cat!=='(全部)'){
    const catRows=liveRows(ds).filter(r=>r.category===f.cat);
    scopeKeys=new Set(); scopeDepth=0;
    catRows.forEach(r=>{ scopeDepth=Math.max(scopeDepth,dispDepth(r)); fieldCols().forEach(k=>{ const v=rowFieldVal(ds,r,k); if(v!=null&&String(v).trim()!=='') scopeKeys.add(k); }); });
    (ds.customCols||[]).forEach(k=>scopeKeys.add(k)); // custom cols always kept
  }
  let cols;
  if(activeSchema.length){
    // Do not let the standard frozen menu block rearrange the source worksheet.
    // The active worksheet is authoritative for both headers and their position.
    cols=activeSchema.filter(c=>c.kind==='level'||visible[c.key]).map(c=>Object.assign({},c));
    const known=new Set(cols.map(c=>c.key));
    (ds.customCols||[]).forEach(k=>{if(!known.has(k)&&visible[k]!==false)cols.push({key:k,title:k,kind:'field'});});
  } else cols=COLS.filter(c=>{
    if(!visible[c.key]) return false;
    if(scopeKeys){
      if(c.kind==='field') return scopeKeys.has(c.key);
      if(c.kind==='level') return c.depth<=scopeDepth;
    }
    return true;
  });
  let head='<tr><th class="actcol frz"><input type="checkbox" id="selectAllRows" title="选择当前显示的所有行"> 操作</th>'+cols.map(c=>{ const mark=(ds.columnMarks&&ds.columnMarks[c.key])||{}; const arrow=sortKey===c.key?`<span class="sortarrow">${sortDir>0?'▲':'▼'}</span>`:''; const hint=c.kind==='field'?'<div class="hthint">双击编辑</div>':(c.kind==='level'?'<div class="hthint">双击改名</div>':''); const frozen=(c.kind==='level'||c.key==='__cat'); const cls=[c.kind==='level'?'levelcol':'',frozen?'frz':'',selectedColumn===c.key?'selected-column':''].filter(Boolean).join(' '); const band=mark.color?`<span class="col-band" style="background:${mark.color}"></span>`:''; const badge=mark.icon?`<span class="col-icon">${esc(mark.icon)}</span>`:''; const label=mark.label?`<span class="col-label">${esc(mark.label)}</span>`:''; return `<th class="${cls}" data-key="${esc(c.key)}" title="单击设置列标记；Shift+单击选中整列">${band}${badge}${esc(c.title)}${label}${arrow}${hint}<span class="col-resize" data-resize-col="${esc(c.key)}"></span></th>`; }).join('')+'</tr>';
  $('#thead').innerHTML=head;
  $('#thead').querySelectorAll('th[data-key]').forEach(th=>th.onclick=e=>{if(e.target.closest('.col-resize'))return;if(e.shiftKey){selectColumn(th.dataset.key);return;}openColumnMark(th.dataset.key,th.getBoundingClientRect());});
  const selectAll=$('#selectAllRows'); if(selectAll){selectAll.checked=rows.length>0&&rows.every(r=>selectedRowIds.has(r.id));selectAll.onchange=()=>{rows.forEach(r=>selectAll.checked?selectedRowIds.add(r.id):selectedRowIds.delete(r.id));render();};}
  // 表头仅展示字段与调整列宽；不允许点击表头改变表格显示顺序
  if(!rows.length){ $('#tbody').innerHTML=`<tr><td colspan="${cols.length+1}"><div class="nores">没有符合条件的菜单项</div></td></tr>`; updateStat(ds,0); updateBulkActions(); return; }
  const frag=rows.map(r=>{
    const added=isAdded(ds,r);
    const act=`<td class="actcol frz"><input class="rowcheck" type="checkbox" data-rowcheck="${esc(r.id)}" ${selectedRowIds.has(r.id)?'checked':''} title="选择此行"><button class="rowbtn" data-act="dup" data-id="${esc(r.id)}" title="复制为新行">⧉</button><button class="rowbtn del" data-act="del" data-id="${esc(r.id)}" title="删除">✕</button></td>`;
    const tds=cols.map(c=>{
      const v=cellVal(ds,r,c.key);
      if(c.kind==='level'){
        const isSelf=(c.depth===dispDepth(r));
        if(!isSelf){ const emptyKey='__lv'+c.depth; const emptyColor=cellColor(ds,r,emptyKey); const emptyStyle=emptyColor?` style="background:${emptyColor}"`:''; return `<td class="lvcell empty-lv frz" data-lv="${c.depth}" data-id="${esc(r.id)}" data-key="${emptyKey}"${emptyStyle} title="右键标记颜色"></td>`; }
        const nmEd=!added&&ds.edits[r.id]&&'__name' in ds.edits[r.id]; const nmConf=nmEd&&isConfirmed(ds,r.id,'__name');
        const hlN=(nmEd&&!nmConf)?' name-edited':''; const btnN=(nmEd&&!nmConf)?`<span class="confirmbtn" data-confirmname="${esc(r.id)}" title="确认改名">✓</span>`:'';
        const style=inlineCellStyle(ds,r,'__name');
        return `<td class="lvcell name frz${hlN}" data-id="${esc(r.id)}" data-name="1"${style} title="${nmEd?esc('原名:'+baseNameOf(ds,r.id)):'双击改名；右键标记颜色'}">${added?'<span class="newtag">新</span>':''}${(nmEd&&!nmConf)?'<span class="editflag">改</span>':''}${hl(v,f.q)}${btnN}</td>`;
      }
      if(c.key==='__cat'){ const catColor=cellColor(ds,r,'__cat'); const catStyle=catColor?` style="background:${catColor}"`:''; return `<td class="nowrap frz" data-id="${esc(r.id)}" data-key="__cat"${catStyle} title="右键标记颜色">${esc(v)}</td>`; }
      const edited=isFieldEdited(ds,r,c.key);
      const confd=edited&&isConfirmed(ds,r.id,c.key);
      const hlCls=(edited&&!confd)?' edited':'';
      const disp=v?hl(v,f.q):'<span class="emptycell">—</span>';
      const flag=(edited&&!confd)?'<span class="editflag">改</span>':'';
      const btn=(edited&&!confd)?`<span class="confirmbtn" data-confirm="${esc(r.id)}" data-ckey="${esc(c.key)}" title="确认此改动(清除高亮,保留内容)">✓</span>`:'';
      const tip=edited?('原值:'+(baseFieldOf(ds,r.id,c.key)||'(空)')):'双击编辑';
      const style=inlineCellStyle(ds,r,c.key);
      return `<td class="wrap field${hlCls}" data-id="${esc(r.id)}" data-key="${esc(c.key)}"${style} title="${esc(tip)}；右键标记颜色">${flag}${disp}${btn}</td>`;
    }).join('');
    return `<tr data-rowid="${esc(r.id)}" class="${added?'newrow':''}">`+act+tds+'</tr>';
  });
  $('#tbody').innerHTML=frag.join('');
  $('#tbody').querySelectorAll('td.field').forEach(td=>td.ondblclick=()=>startEdit(td));
  $('#tbody').querySelectorAll('td[data-name]').forEach(td=>td.ondblclick=()=>editName(td));
  $('#tbody').querySelectorAll('.rowbtn').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const id=b.dataset.id; b.dataset.act==='dup'?duplicateRow(id):deleteRow(id); });
  $('#tbody').querySelectorAll('[data-rowcheck]').forEach(cb=>cb.onchange=e=>{if(cb.checked)selectedRowIds.add(cb.dataset.rowcheck);else selectedRowIds.delete(cb.dataset.rowcheck);e.stopPropagation();render();});
  $('#tbody').querySelectorAll('.confirmbtn').forEach(b=>{ b.onclick=e=>{ e.stopPropagation(); if(b.dataset.confirmname) confirmName(b.dataset.confirmname); else confirmField(b.dataset.confirm,b.dataset.ckey); }; b.ondblclick=e=>e.stopPropagation(); });
  $('#tbody').querySelectorAll('td[data-id]').forEach(td=>{td.oncontextmenu=e=>{e.preventDefault();openColorPicker(td.dataset.id,td.dataset.name?'__name':td.dataset.key,e.clientX,e.clientY);};td.onclick=e=>{if(e.target.closest('button,textarea,input,.confirmbtn'))return;selectCell(td.dataset.id,td.dataset.name?'__name':td.dataset.key);};});
  initTableResize(ds);
  applyFreeze();
  updateStat(ds,rows.length);
  updateBulkActions();
}
let selectedCell=null;
let selectedColumn=null;
const selectedRowIds=new Set();
function updateBulkActions(){
  const ds=curDS(),count=ds?[...selectedRowIds].filter(id=>liveRows(ds).some(r=>r.id===id)).length:0;
  const box=$('#bulkActions'),label=$('#selectionCount'); if(!box||!label)return;
  box.hidden=!count; label.textContent=`已选 ${count} 行`;
}
function selectColumn(key){
  selectedColumn=(selectedColumn===key)?null:key;
  render();
  if(selectedColumn)toast('已选中列「'+fieldTitle(selectedColumn)+'」；可在“更多工具”中隐藏该列');
}
function deleteSelectedRows(){
  const ds=curDS(); const ids=[...selectedRowIds].filter(id=>liveRows(ds).some(r=>r.id===id));
  if(!ids.length){toast('请先勾选要删除的行');return;}
  if(!confirm('确定删除选中的 '+ids.length+' 行？此操作只影响管理视图，可撤销；原始 Excel 不会被改动。'))return;
  pushUndo();
  ids.forEach(id=>{const r=liveRows(ds).find(x=>x.id===id);if(!r)return;if(isAdded(ds,r))ds.added=ds.added.filter(x=>x.id!==id);else{ds.deleted[id]=true;delete ds.edits[id];}logChange({version:curVer,region:curRegion,path:r.path,field:'—',oldVal:rowName(ds,r),newVal:'(已删除)',type:'delete'});});
  selectedRowIds.clear(); persist(); render(); refreshDrawerIfOpen(); toast('已删除 '+ids.length+' 行（原始 Excel 已保留）');
}
function deleteSelectedColumn(){
  const ds=curDS(),key=selectedColumn;
  if(!key){toast('请按 Shift 单击表头选中要删除的列');return;}
  const col=COLS.find(c=>c.key===key);
  if(!col||col.kind!=='field'){toast('分类和菜单层级列不能删除');return;}
  if(!confirm('确定从管理视图删除列「'+col.title+'」？此操作可撤销，原始 Excel 中的列不会删除。'))return;
  pushUndo(); ds.hiddenColumns=ds.hiddenColumns||[]; if(!ds.hiddenColumns.includes(key))ds.hiddenColumns.push(key);
  logChange({version:curVer,region:curRegion,path:'(整表)',field:col.title,oldVal:'(显示)',newVal:'(管理视图已删除)',type:'delete'});
  selectedColumn=null; persist(); rebuildColumns(ds); render(); refreshDrawerIfOpen(); toast('已从管理视图删除列「'+col.title+'」（原始 Excel 已保留）');
}
function selectCell(id,key){
  selectedCell={id,key}; document.querySelectorAll('td.selected-cell').forEach(x=>x.classList.remove('selected-cell'));
  let el;if(String(id).startsWith('SRC@@')){const a=String(id).split('@@');el=document.querySelector(`td.source-cell[data-sheet="${(window.CSS&&CSS.escape)?CSS.escape(a[1]):a[1]}"][data-ri="${a[2]}"][data-ci="${a[3]}"]`);}else{const escid=(window.CSS&&CSS.escape)?CSS.escape(id):id;el=document.querySelector(`td[data-id="${escid}"][data-key="${key}"]`)||document.querySelector(`td[data-id="${escid}"][data-name]`);}if(el)el.classList.add('selected-cell'); setFormatBarVisible(true); updateFormatToolbar();
}
function setFormat(prop,value){
  if(!selectedCell){toast('请先单击选择一个单元格');return;}const ds=curDS(),src=selectedSourceInfo(ds),k=src?src.key:colorKey(selectedCell.id,selectedCell.key);pushUndo();if(src&&value!==null&&ds.sourceClears&&ds.sourceClears[k])delete ds.sourceClears[k][prop];ds.cellFormats=ds.cellFormats||{};const f=ds.cellFormats[k]||{};if(value===null)delete f[prop];else f[prop]=value;if(!Object.keys(f).length)delete ds.cellFormats[k];else ds.cellFormats[k]=f;persist();render();
}
function toggleFormat(prop){ const ds=curDS(),src=selectedSourceInfo(ds),k=src?src.key:(selectedCell&&colorKey(selectedCell.id,selectedCell.key)),f=selectedCell&&ds.cellFormats&&ds.cellFormats[k]||{}; setFormat(prop,!f[prop]); }
function clearFormat(){
  if(!selectedCell)return;const ds=curDS(),src=selectedSourceInfo(ds),k=src?src.key:colorKey(selectedCell.id,selectedCell.key);pushUndo();if(src){ds.sourceClears=ds.sourceClears||{};ds.sourceClears[k]={fill:true,bold:true,italic:true,underline:true,strike:true,color:true,align:true};}delete ds.cellFormats[k];delete ds.cellColors[k];persist();render();
}
function applyPresetBg(color){if(!selectedCell){toast('请先单击选择一个单元格');return;}setCellColor(selectedCell.id,selectedCell.key,color);}
function updateFormatToolbar(){
  const ds=curDS(),src=selectedSourceInfo(ds),k=src?src.key:(selectedCell&&colorKey(selectedCell.id,selectedCell.key));let f={};let bg='';if(src){const base=src.raw.cellStyles&&src.raw.cellStyles[src.ri]&&src.raw.cellStyles[src.ri][src.ci]||{};f=Object.assign({},base.format||{},ds.cellFormats&&ds.cellFormats[k]||{});bg=(ds.cellColors&&ds.cellColors[k])||base.fill||'';}else if(selectedCell){f=cellFormat(ds,{id:selectedCell.id,sourceColors:{},sourceNameColor:''},selectedCell.key)||{};const r=liveRows(ds).find(x=>x.id===selectedCell.id);bg=r?cellColor(ds,r,selectedCell.key):'';}['fmtBold','fmtItalic','fmtUnderline','fmtStrike'].forEach((id,i)=>{const p=['bold','italic','underline','strike'][i];const b=$('#'+id);if(b)b.classList.toggle('active',!!f[p]);});document.querySelectorAll('.preset-color').forEach(b=>b.classList.toggle('active',b.dataset.presetBg===bg));
}
function openColorPicker(id,key,x,y){
  const p=$('#colorPicker'); p.dataset.id=id;p.dataset.key=key;
  const ds=curDS(),r=liveRows(ds).find(z=>z.id===id); const cur=r?cellColor(ds,r,key):'';
  p.style.left=Math.min(x,window.innerWidth-250)+'px';p.style.top=Math.min(y,window.innerHeight-170)+'px';p.classList.add('show');
  p.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('selected',b.dataset.color===cur));
}
function closeColorPicker(){ $('#colorPicker').classList.remove('show'); }
function chooseColor(color){ const p=$('#colorPicker'); setCellColor(p.dataset.id,p.dataset.key,color); closeColorPicker(); }

function openColumnMark(key,rect){ const ds=curDS(),m=(ds.columnMarks&&ds.columnMarks[key])||{}; const p=$('#colMarkPicker');p.dataset.key=key;p.style.left=Math.min(rect.left,window.innerWidth-300)+'px';p.style.top=Math.min(rect.bottom+4,window.innerHeight-260)+'px';$('#cmLabel').value=m.label||'';$('#cmIcon').value=m.icon||'●';$('#cmColor').value=m.color||'#FFF2CC';p.classList.add('show'); }
function saveColumnMark(){ const p=$('#colMarkPicker'),key=p.dataset.key,ds=curDS();ds.columnMarks=ds.columnMarks||{};const label=$('#cmLabel').value.trim(),icon=$('#cmIcon').value,color=$('#cmColor').value;if(label||icon||color)ds.columnMarks[key]={label,icon,color};else delete ds.columnMarks[key];persist();render();closeColumnMark(); }
function clearColumnMark(){ const p=$('#colMarkPicker'),ds=curDS();if(ds.columnMarks)delete ds.columnMarks[p.dataset.key];persist();render();closeColumnMark(); }
function closeColumnMark(){$('#colMarkPicker').classList.remove('show');}

/* ---------- column width + row height resize ---------- */
function initTableResize(ds){
  const layout=ds.layout||(ds.layout={colWidths:{},rowHeights:{}}); const table=$('#tableWrap table'); if(!table) return;
  // apply saved column widths to header and all body cells in that column
  const applyCol=(key,w)=>{ const idx=[...$('#thead').querySelectorAll('th')].findIndex(th=>th.dataset.key===key); if(idx<0)return; table.querySelectorAll('tr').forEach(tr=>{const cell=tr.children[idx];if(cell)cell.style.width=w+'px';}); };
  Object.entries(layout.colWidths||{}).forEach(([k,w])=>applyCol(k,w));
  // apply saved row heights
  $('#tbody').querySelectorAll('tr[data-rowid]').forEach(tr=>{const h=layout.rowHeights[tr.dataset.rowid];if(h)tr.style.height=h+'px';});
  // column resize drag handle
  $('#thead').querySelectorAll('.col-resize').forEach(handle=>handle.onmousedown=e=>{
    e.preventDefault();e.stopPropagation(); const th=handle.closest('th'),key=handle.dataset.resizeCol,startX=e.clientX,startW=th.getBoundingClientRect().width;
    document.body.classList.add('resizing-col');
    const move=ev=>{const w=Math.max(80,Math.min(700,startW+ev.clientX-startX));applyCol(key,w);applyFreeze();};
    const up=ev=>{const w=Math.max(80,Math.min(700,startW+ev.clientX-startX));layout.colWidths[key]=Math.round(w);persist();document.body.classList.remove('resizing-col');window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  });
  // row resize: drag the bottom 7px of any row
  $('#tbody').querySelectorAll('tr[data-rowid]').forEach(tr=>tr.onmousemove=e=>{const rect=tr.getBoundingClientRect();tr.style.cursor=(rect.bottom-e.clientY<7)?'row-resize':'';});
  $('#tbody').querySelectorAll('tr[data-rowid]').forEach(tr=>tr.onmousedown=e=>{
    const rect=tr.getBoundingClientRect();if(rect.bottom-e.clientY>=7)return;
    e.preventDefault(); const id=tr.dataset.rowid,startY=e.clientY,startH=rect.height;document.body.classList.add('resizing-row');
    const move=ev=>{tr.style.height=Math.max(28,Math.min(900,startH+ev.clientY-startY))+'px';};
    const up=ev=>{layout.rowHeights[id]=Math.round(Math.max(28,Math.min(900,startH+ev.clientY-startY)));persist();document.body.classList.remove('resizing-row');window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
  });
}

// compute cumulative left offsets for frozen columns (action + 分类 + level cols)
function applyFreeze(){
  const headFrz=[...$('#thead').querySelectorAll('th.frz')];
  if(!headFrz.length) return;
  let left=0; const offs=[];
  headFrz.forEach(th=>{ offs.push(left); left+=th.getBoundingClientRect().width; });
  const last=headFrz.length-1;
  headFrz.forEach((th,i)=>{ th.style.left=offs[i]+'px'; th.classList.toggle('frz-edge',i===last); });
  // apply to each body row's frozen cells in order
  $('#tbody').querySelectorAll('tr').forEach(tr=>{
    const cells=[...tr.querySelectorAll('td.frz')];
    cells.forEach((td,i)=>{ if(offs[i]!=null){ td.style.left=offs[i]+'px'; td.classList.toggle('frz-edge',i===last); } });
  });
}
function renderEmptyDataset(){
  $('#toolbar').style.display='flex';
  // A new version has no table columns yet. Rendering the message inside a
  // one-cell table makes the text inherit the first column's narrow width and
  // causes it to wrap one or two characters per line. Use the page-level empty
  // state instead so the message occupies the full content area.
  $('#tableWrap').style.display='none';
  $('#emptyState').style.display='flex';
  $('#emptyTitle').textContent=`「${curVer} · ${curRegion}」还没有数据`;
  $('#emptyHint').innerHTML='点击右上角 <b>导入 Excel</b>，平台会直接逐格显示该文件的每个原始 Sheet。';
  $('#thead').innerHTML='';
  $('#tbody').innerHTML='';
  $('#statline').innerHTML='';
  const sheet=$('#fSheet');if(sheet){sheet.innerHTML='<option value="">尚未导入工作表</option>';sheet.disabled=true;}
}
function updateStat(ds,n){
  const total=liveRows(ds).length;
  const ne=Object.keys(ds.edits).length,na=(ds.added||[]).length,nd=Object.keys(ds.deleted).length;
  let chg=''; if(ne||na||nd){ const p=[]; if(ne)p.push('改 '+ne); if(na)p.push('增 '+na); if(nd)p.push('删 '+nd); chg=` · <span style="color:var(--warn)">本地已保存(${p.join(' / ')})</span>`; }
  $('#statline').innerHTML=`显示 <b>${n}</b> / ${total} 项`+chg+` · 隐藏条件 <b>${liveRows(ds).filter(r=>rowFieldVal(ds,r,'隐藏条件')).length}</b> · 灰显条件 <b>${liveRows(ds).filter(r=>rowFieldVal(ds,r,'灰显条件')).length}</b> · 配置项 <b>${liveRows(ds).filter(r=>rowFieldVal(ds,r,'配置项')).length}</b>`;
  updateChgBadge(ds);
}

/* ---------- inline edit ---------- */
function startEdit(td){
  if(td.querySelector('textarea,input')) return;
  const ds=curDS(); const id=td.dataset.id,key=td.dataset.key;
  const r=liveRows(ds).find(x=>x.id===id); if(!r) return;
  const cur=cellVal(ds,r,key); const cands=CANDIDATES[key];
  // use single-line dropdown ONLY for short enumerable values; long/multiline content -> resizable textarea
  const useDropdown=cands && cur.length<=24 && !cur.includes('\n');
  if(useDropdown){ const lid='dl_'+Math.random().toString(36).slice(2); td.innerHTML=`<input class="cellinput" list="${lid}" value="${esc(cur)}"><datalist id="${lid}">`+cands.map(c=>`<option value="${esc(c)}">`).join('')+`</datalist>`; }
  else td.innerHTML=`<textarea class="cellinput">${esc(cur)}</textarea>`;
  td.classList.add('editing');
  const el=td.querySelector('textarea,input'); el.focus(); try{el.setSelectionRange(el.value.length,el.value.length);}catch(e){}
  // auto-grow textarea to fit content
  if(el.tagName==='TEXTAREA'){ const grow=()=>{ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight+4,480)+'px'; }; grow(); el.oninput=grow; }
  const before=cellVal(ds,r,key);
  const commit=()=>{ const nv=el.value; if(nv===before){ render(); return; }
    pushUndo();
    const oldV=isAdded(ds,r)?before:baseFieldOf(ds,id,key);
    if(isAdded(ds,r)){ const a=ds.added.find(x=>x.id===id); a.fields[key]=nv; }
    else{ const orig=baseFieldOf(ds,id,key); if(nv===orig){ if(ds.edits[id]){ delete ds.edits[id][key]; if(!Object.keys(ds.edits[id]).length) delete ds.edits[id]; } delete (ds.ts||{})[tsKey(id,key)]; if(ds.confirmed) delete ds.confirmed[tsKey(id,key)]; } else { ds.edits[id]=ds.edits[id]||{}; ds.edits[id][key]=nv; ds.ts=ds.ts||{}; ds.ts[tsKey(id,key)]=Date.now(); if(ds.confirmed) delete ds.confirmed[tsKey(id,key)]; } }
    logChange({version:curVer,region:curRegion,path:r.path,field:fieldTitle(key),oldVal:oldV,newVal:nv,type:'edit'});
    const sourceSynced=syncTreeEditToSource(ds,r,key,nv);
    persist(); render(); refreshDrawerIfOpen();
    if(sourceSynced)toast('已同步到原始 Sheet 镜像');
    offerSync({field:key,fieldTitle:fieldTitle(key),path:r.path,depth:r.depth,category:r.category,newVal:nv});
  };
  el.onblur=commit; el.onkeydown=e=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey||el.tagName==='INPUT')){e.preventDefault();commit();} if(e.key==='Escape'){e.preventDefault();render();} };
}
function editName(td){
  if(td.querySelector('input,textarea')) return;
  const ds=curDS(); const id=td.dataset.id; const r=liveRows(ds).find(x=>x.id===id); if(!r) return;
  const before=rowName(ds,r);
  const longName=before.length>24||before.includes('\n');
  td.classList.add('editing');
  td.innerHTML=longName?`<textarea class="cellinput">${esc(before)}</textarea>`:`<input class="cellinput" style="min-height:0" value="${esc(before)}">`;
  const ip=td.querySelector('textarea,input'); ip.focus();
  if(ip.tagName==='TEXTAREA'){
    const grow=()=>{ ip.style.height='auto'; ip.style.height=Math.min(ip.scrollHeight+4,520)+'px'; };
    grow(); ip.oninput=grow;
  }
  const commit=()=>{ const nv=ip.value.trim()||before; if(nv===before){ render(); return; }
    pushUndo();
    if(isAdded(ds,r)){ const a=ds.added.find(x=>x.id===id); a.name=nv; a.label=nv; }
    else { const orig=baseNameOf(ds,id); if(nv===orig){ if(ds.edits[id]) delete ds.edits[id].__name; } else { ds.edits[id]=ds.edits[id]||{}; ds.edits[id].__name=nv; } if(ds.confirmed) delete ds.confirmed[tsKey(id,'__name')]; }
    logChange({version:curVer,region:curRegion,path:r.path,field:'菜单名称',oldVal:before,newVal:nv,type:'rename'});
    const sourceSynced=syncTreeEditToSource(ds,r,'__name',nv);
    persist(); render(); refreshDrawerIfOpen();
    if(sourceSynced)toast('已同步到原始 Sheet 镜像');
  };
  ip.onblur=commit;
  ip.onkeydown=e=>{ if((ip.tagName==='INPUT'&&e.key==='Enter')||(ip.tagName==='TEXTAREA'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey))){e.preventDefault();commit();} if(e.key==='Escape'){render();} };
}

/* ---------- row ops ---------- */
let addSeq=0;
function newRow(category,depth,parentId,name){ addSeq++; const ds=curDS(); const p=parentId?liveRows(ds).find(r=>r.id===parentId):null; const path=p?p.path+' › '+name:category+' › '+name; return {id:'NEW|'+Date.now()+'|'+addSeq,category,depth,name:name||'新菜单项',label:name||'新菜单项',path,fields:{},parent:parentId||null,_order:1e9+addSeq}; }
function duplicateRow(id){ const ds=curDS(); const src=liveRows(ds).find(r=>r.id===id); if(!src) return; pushUndo(); const r=newRow(src.category,src.depth,src.parent,src.name+'（副本）'); fieldCols().forEach(k=>{ const v=rowFieldVal(ds,src,k); if(v) r.fields[k]=v; }); ds.added.push(r); persist(); rebuildColumns(ds); render(); refreshDrawerIfOpen(); toast('已复制为新行'); }
function deleteRow(id){ const ds=curDS(); const r=liveRows(ds).find(x=>x.id===id); if(!r) return; if(!confirm('确定删除「'+rowName(ds,r)+'」?')) return; pushUndo(); const nm=rowName(ds,r),p=r.path; if(isAdded(ds,r)) ds.added=ds.added.filter(x=>x.id!==id); else{ ds.deleted[id]=true; delete ds.edits[id]; } logChange({version:curVer,region:curRegion,path:p,field:'—',oldVal:nm,newVal:'(已删除)',type:'delete'}); persist(); render(); refreshDrawerIfOpen(); toast('已删除'); }
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2200); }
function addColumn(){ const ds=curDS(); if(!ds){ toast('请先选择版本'); return; }
  const name=prompt('新增列名称(如 优先级 / 负责人 / 测试状态):'); if(!name||!name.trim()) return;
  const key=name.trim();
  const exist=COLS.some(c=>c.title===key)||( ds.customCols||[]).includes(key);
  if(exist){ toast('已存在同名列'); return; }
  pushUndo();
  ds.customCols=ds.customCols||[]; ds.customCols.push(key);
  logChange({version:curVer,region:curRegion,path:'(整表)',field:key,oldVal:'',newVal:'(新增列)',type:'add'});
  persist(); rebuildColumns(ds); visible[key]=true; render(); toast('已新增列:'+key+'(双击单元格填写)'); }

/* ---------- cross-version sync ---------- */
function rowHierarchyKey(r){
  // Matching follows the four columns exposed by the management table:
  // category + 小标题 + 二级菜单 + 三级菜单 + 四级菜单.
  return String(r&&r.path||'').split(' › ').slice(0,5).join(' › ');
}
function sourceHierarchyKey(raw,ri,category){
  if(!raw||!raw.rows)return '';
  const rows=raw.rows,headerIndex=findHeaderRow(rows),header=rows[headerIndex]||[],levelCols=classifyCols(header).level.slice(0,4),labels=['','','',''];
  for(let i=headerIndex+1;i<=ri&&i<rows.length;i++){
    const row=rows[i]||[],depth=levelCols.findIndex(ci=>norm(row[ci])!=='');
    if(depth<0)continue;
    labels[depth]=norm(row[levelCols[depth]]);
    for(let j=depth+1;j<4;j++)labels[j]='';
  }
  return [category,...labels].join(' › ');
}
function sourceColumnIndex(raw,ctx){
  const rows=raw&&raw.rows||[],headerIndex=findHeaderRow(rows),header=rows[headerIndex]||[],classified=classifyCols(header);
  if(ctx.levelIndex!=null)return classified.level[ctx.levelIndex]??-1;
  const wanted=norm(ctx.headerTitle),exact=header.findIndex(v=>norm(v)===wanted);
  if(exact>=0)return exact;
  const canonical=canonKey(wanted),meaning=header.findIndex(v=>canonKey(norm(v))===canonical);
  if(meaning>=0)return meaning;
  return ctx.ci<Math.max(raw.colCount||0,header.length)?ctx.ci:-1;
}
function syncTreeEditToSource(ds,row,key,newVal){
  // Only mirror a tree edit when it still maps unambiguously to one source cell.
  // Continuation rows and independently changed source cells remain authoritative.
  if(isAdded(ds,row))return false;
  const raw=(ds.rawSheets||[]).find(s=>s.sheet===row.sheet);
  if(!raw)return false;
  const ri=sourceRowForMenu(raw,row);
  if(ri==null)return false;
  const schema=sheetSourceSchema(ds,row.sheet);
  const col=key==='__name'?schema.find(c=>c.kind==='level'&&c.depth===row.depth):schema.find(c=>c.kind==='field'&&c.key===key);
  if(!col)return false;
  const ci=(raw.rows[findHeaderRow(raw.rows||[])]||[]).findIndex(v=>norm(v)===norm(col.title));
  if(ci<0)return false;
  const sourceKey=sourceEditKey(raw.sheet,ri,ci);
  const expected=key==='__name'?baseNameOf(ds,row.id):baseFieldOf(ds,row.id,key);
  if(String(sourceCellValue(ds,raw,ri,ci))!==String(expected))return false;
  const original=raw.rows[ri]&&raw.rows[ri][ci]!=null?String(raw.rows[ri][ci]):'';
  ds.sheetEdits=ds.sheetEdits||{};
  ds.ts=ds.ts||{};
  if(String(newVal)===original){delete ds.sheetEdits[sourceKey];delete ds.ts['SRC@@'+sourceKey];}
  else{ds.sheetEdits[sourceKey]=newVal;ds.ts['SRC@@'+sourceKey]=Date.now();}
  return true;
}
function findSourceMatch(ds,ctx){
  if(!ds)return null;
  const candidates=(ds.rawSheets||[]),sameSheet=candidates.find(s=>s.sheet===ctx.sheet),sameCategory=candidates.find(s=>categoryOf(s.sheet)===ctx.category),raw=sameSheet||sameCategory;
  if(raw){
    const rows=raw.rows||[],headerIndex=findHeaderRow(rows),ci=sourceColumnIndex(raw,ctx);
    if(ci>=0){
      for(let ri=headerIndex+1;ri<rows.length;ri++){
        if(sourceHierarchyKey(raw,ri,ctx.category)!==ctx.hierarchy)continue;
        return {source:true,raw,ri,ci,key:sourceEditKey(raw.sheet,ri,ci),curVal:sourceCellValue(ds,raw,ri,ci)};
      }
    }
  }
  // Older seed projects may contain the derived tree but no raw Sheet cache.
  const hit=liveRows(ds).find(r=>rowHierarchyKey(r)===ctx.hierarchy); if(!hit)return null;
  const field=ctx.levelIndex!=null?'__name':canonFieldLookup(ds,ctx.headerTitle);
  return {source:false,id:hit.id,added:isAdded(ds,hit),field,curVal:ctx.levelIndex!=null?rowName(ds,hit):rowFieldVal(ds,hit,field)};
}
// find a row in a dataset by the four visible hierarchy levels
function findByPath(ds,path,field){
  const rows=liveRows(ds);
  const wanted=String(path||'').split(' › ').slice(0,5).join(' › ');
  const hit=rows.find(r=>rowHierarchyKey(r)===wanted);
  if(!hit) return null;
  const targetField=canonFieldLookup(ds,field);
  return {id:hit.id, added:isAdded(ds,hit), field:targetField, curVal:rowFieldVal(ds,hit,targetField)};
}
let pendingSync=null;
function showSyncDialog(ctx,rowsInfo){
  pendingSync=pendingSync||{ctx,rowsInfo};
  const box=$('#syncList');
  box.innerHTML=rowsInfo.map(ri=>{
    const found=!!ri.match;
    const same=found&&ri.curVal===ctx.newVal;
    const dis=(!found||same)?'disabled':'';
    const status=!found?`<span class="sync-miss">未找到相同层级项</span>`
      :same?`<span class="sync-same">已是相同值</span>`
      :`<span class="sync-old">${esc(ri.curVal||'(空)')}</span><span class="chg-arrow">→</span><span class="sync-new">${esc(ctx.newVal||'(空)')}</span>`;
    return `<label class="sync-item ${(!found||same)?'na':''}"><input type="checkbox" data-v="${esc(ri.version)}" ${dis} ${(found&&!same)?'checked':''}><span class="sync-v">${esc(ri.version)} · ${esc(curRegion)}</span><span class="sync-diff">${status}</span></label>`;
  }).join('');
  $('#syncField').textContent=ctx.fieldTitle+'：'+ctx.path;
  const anyTarget=rowsInfo.some(ri=>ri.match&&ri.curVal!==ctx.newVal);
  $('#syncOk').disabled=!anyTarget;
  $('#syncDlg').style.display='flex';
}
function offerSync(ctx){
  // ctx: {field,fieldTitle,path,depth,category,newVal}
  const others=STORE.versions.filter(v=>v.name!==curVer);
  if(!others.length) return; // nothing to sync to
  // compute matches in same region for each other version
  const rowsInfo=others.map(v=>{
    const ds=STORE.data[dsKey(v.name,curRegion)];
    const m=ds?findByPath(ds,ctx.path,ctx.field):null;
    return {version:v.name, match:m, curVal:m?m.curVal:null};
  });
  pendingSync={ctx,rowsInfo,kind:'tree'};
  showSyncDialog(ctx,rowsInfo);
}
function offerSourceSync(ctx){
  const others=STORE.versions.filter(v=>v.name!==curVer); if(!others.length)return;
  const rowsInfo=others.map(v=>{const ds=STORE.data[dsKey(v.name,curRegion)],m=findSourceMatch(ds,ctx);return {version:v.name,match:m,curVal:m?m.curVal:null};});
  pendingSync={ctx,rowsInfo,kind:'source'};
  showSyncDialog(ctx,rowsInfo);
}
function confirmSync(){
  if(!pendingSync) return;
  const {ctx,kind}=pendingSync;
  const chosen=[...$('#syncList').querySelectorAll('input:checked:not(:disabled)')].map(cb=>cb.dataset.v);
  if(!chosen.length){ $('#syncDlg').style.display='none'; return; }
  const done=[];
  chosen.forEach(vname=>{
    const ds=STORE.data[dsKey(vname,curRegion)]; if(!ds) return;
    if(kind==='source'){
      const m=findSourceMatch(ds,ctx); if(!m)return;
      const oldV=m.curVal;
      if(m.source){
        ds.sheetEdits=ds.sheetEdits||{};ds.ts=ds.ts||{};
        const original=m.raw.rows[m.ri]&&m.raw.rows[m.ri][m.ci]!=null?String(m.raw.rows[m.ri][m.ci]):'';
        if(ctx.newVal===original){delete ds.sheetEdits[m.key];delete ds.ts['SRC@@'+m.key];}
        else{ds.sheetEdits[m.key]=ctx.newVal;ds.ts['SRC@@'+m.key]=Date.now();}
      } else if(m.added){
        const a=ds.added.find(x=>x.id===m.id);if(!a)return;if(m.field==='__name'){a.name=ctx.newVal;a.label=ctx.newVal;}else a.fields[m.field]=ctx.newVal;
      } else {
        const orig=m.field==='__name'?baseNameOf(ds,m.id):baseFieldOf(ds,m.id,m.field);
        if(m.field==='__name'){ds.edits[m.id]=ds.edits[m.id]||{};if(ctx.newVal===orig)delete ds.edits[m.id].__name;else ds.edits[m.id].__name=ctx.newVal;}
        else{ds.edits[m.id]=ds.edits[m.id]||{};if(ctx.newVal===orig)delete ds.edits[m.id][m.field];else ds.edits[m.id][m.field]=ctx.newVal;}
      }
      logChange({version:vname,region:curRegion,path:ctx.path,field:ctx.fieldTitle,oldVal:oldV,newVal:ctx.newVal,type:'sync',from:curVer});done.push(vname);return;
    }
    const m=findByPath(ds,ctx.path,ctx.field); if(!m) return;
    const oldV=m.curVal;
    const targetField=m.field||ctx.field;
    if(m.added){ const a=ds.added.find(x=>x.id===m.id); a.fields[targetField]=ctx.newVal; }
    else { const orig=baseFieldOf(ds,m.id,targetField); if(ctx.newVal===orig){ if(ds.edits[m.id]) delete ds.edits[m.id][targetField]; } else { ds.edits[m.id]=ds.edits[m.id]||{}; ds.edits[m.id][targetField]=ctx.newVal; } }
    logChange({version:vname,region:curRegion,path:ctx.path,field:ctx.fieldTitle,oldVal:oldV,newVal:ctx.newVal,type:'sync',from:curVer});
    done.push(vname);
  });
  persist(); $('#syncDlg').style.display='none'; render(); renderVersions(); refreshDrawerIfOpen();
  if(done.length) toast('已同步「'+ctx.fieldTitle+'」到:'+done.join('、'));
  pendingSync=null;
}

/* ---------- changes drawer ---------- */
function totalChanges(ds){ let n=(ds.added||[]).length+Object.keys(ds.deleted).length; Object.values(ds.edits||{}).forEach(e=>n+=Object.keys(e).length); n+=Object.keys(ds.sheetEdits||{}).length; return n; }
function updateChgBadge(ds){ const n=ds?totalChanges(ds):0; const b=$('#chgCount'); if(b){ b.textContent=n; b.classList.toggle('zero',n===0); } }
function fieldTitle(k){ const c=COLS.find(x=>x.key===k); return c?c.title:k; }
function refreshDrawerIfOpen(){ const d=$('#chgDrawer'); if(d&&d.classList.contains('show')) renderChanges(); }
function renderChanges(){
  const ds=curDS(); const body=$('#chgBody');
  if(!ds||!totalChanges(ds)){ body.innerHTML='<div class="chg-empty">当前版本还没有任何改动。</div>'; return; }
  let h='';
  // gather edited-field entries with time, sort newest first
  const entries=[];
  Object.keys(ds.edits||{}).forEach(id=>{ Object.keys(ds.edits[id]||{}).forEach(key=>{
    const isName=key==='__name'; const r=liveRows(ds).find(x=>x.id===id);
    entries.push({id,key,isName,path:(r&&r.path)||id, field:isName?'菜单名称':fieldTitle(key), oldV:isName?baseNameOf(ds,id):(baseFieldOf(ds,id,key)||'(空)'), newV:ds.edits[id][key]||'(空)', ts:(ds.ts&&ds.ts[tsKey(id,key)])||0, confirmed:isConfirmed(ds,id,key)});
  }); });
  Object.entries(ds.sheetEdits||{}).forEach(([key,newV])=>{
    const parts=key.split('@@'),ci=+parts.pop(),ri=+parts.pop(),sheet=parts.join('@@'),raw=(ds.rawSheets||[]).find(s=>s.sheet===sheet);
    const oldV=raw&&raw.rows&&raw.rows[ri]&&raw.rows[ri][ci]!=null?String(raw.rows[ri][ci]):'(空)';
    const path=sheet+'!R'+(ri+1)+'C'+(ci+1);
    entries.push({sourceKey:key,source:true,path,field:'原始 Sheet 单元格',oldV:oldV||'(空)',newV:String(newV??'')||'(空)',ts:(ds.ts&&ds.ts['SRC@@'+key])||0});
  });
  entries.sort((a,b)=>b.ts-a.ts);
  if(entries.length){ let items='';
    entries.forEach(e=>{ const t=e.ts?fmtTime(e.ts):''; const conf=e.confirmed?'<span class="chg-badge cb-conf">已确认</span>':'';
      const loc=e.source?`<div class="chg-loc" data-source-jump="${encodeURIComponent(e.sourceKey)}" title="点击跳转到原始 Sheet 对应单元格">${esc(e.path)}</div>`:`<div class="chg-loc">${esc(e.path)}</div>`;
      items+=`<div class="chg-item clamp" data-jump="${esc(e.id||'')}"><div class="chg-head"><span class="chg-time">${t}</span><span class="chg-fld">${esc(e.field)}</span>${conf}<span class="chg-caret">▸</span></div>${loc}<div class="chg-diff"><span class="chg-old">${esc(e.oldV)}</span><span class="chg-arrow">→</span><span class="chg-new">${esc(e.newV)}</span></div></div>`; });
    h+='<div class="chg-sec">已修改字段</div>'+items;
  }
  if((ds.added||[]).length){ h+='<div class="chg-sec">新增菜单项</div>'+ds.added.map(r=>`<div class="chg-item clamp" data-jump="${esc(r.id)}"><div class="chg-head"><span class="chg-fld">${esc(rowName(ds,r))}</span><span class="chg-badge cb-new">新增</span><span class="chg-caret">▸</span></div><div class="chg-loc">${esc(r.category)}</div><div class="chg-diff chg-new">${esc(Object.entries(r.fields).filter(([k,v])=>v).map(([k,v])=>fieldTitle(k)+'：'+v).join(' · ')||'(暂无字段)')}</div></div>`).join(''); }
  const delIds=Object.keys(ds.deleted);
  if(delIds.length){ h+='<div class="chg-sec">已删除菜单项</div>'+delIds.map(id=>`<div class="chg-item" data-undel="${esc(id)}" title="点击撤销删除"><div class="chg-head"><span class="chg-fld">${esc(baseNameOf(ds,id))}</span><span class="chg-badge cb-del">已删除</span></div><div class="chg-diff" style="color:var(--sub)">点击撤销删除</div></div>`).join(''); }
  body.innerHTML=h;
  // click: expand (toggle clamp); double-click or the row jumps. Use single click to expand, and a jump on the location.
  body.querySelectorAll('.chg-item.clamp').forEach(el=>{ el.onclick=e=>{ const source=e.target.closest('[data-source-jump]'); if(source){ jumpToSourceCell(decodeURIComponent(source.dataset.sourceJump)); return; } if(e.target.closest('.chg-loc')){ jumpToRow(el.dataset.jump); return; } el.classList.toggle('expanded'); }; });
  body.querySelectorAll('[data-undel]').forEach(el=>el.onclick=()=>{ delete ds.deleted[el.dataset.undel]; persist(); render(); renderChanges(); toast('已撤销删除'); });
}
function jumpToRow(id){ const ds=curDS(); const r=liveRows(ds).find(x=>x.id===id); if(!r){toast('该项不在当前数据');return;} $('#fCat').value='(全部)';$('#fDepth').value='L'+(Math.min(r.depth,MAX_LEVEL)+1);$('#fSearch').value=''; render(); setTimeout(()=>{ const td=$(`#tbody td[data-id="${(window.CSS&&CSS.escape)?CSS.escape(id):id}"]`); const tr=td?td.closest('tr'):null; if(tr){ if(tr.scrollIntoView) tr.scrollIntoView({block:'center'}); tr.querySelectorAll('td').forEach(c=>c.style.background='#fff3cd'); setTimeout(()=>tr.querySelectorAll('td').forEach(c=>c.style.background=''),1200); } },60); }
function jumpToSourceCell(key){
  const parts=String(key||'').split('@@'),ci=+parts.pop(),ri=+parts.pop(),sheet=parts.join('@@'),ds=curDS();
  const raw=ds&&(ds.rawSheets||[]).find(s=>s.sheet===sheet);
  if(!raw){toast('未找到对应的原始 Sheet');return;}
  ds.ui=ds.ui||{};ds.ui.viewSheet=sheet;rebuildForCurrent();$('#fDepth').value='(全部)';$('#fSearch').value='';persist();render();toggleDrawer(false);
  setTimeout(()=>{
    const td=[...document.querySelectorAll('#tbody td.source-cell')].find(cell=>cell.dataset.sheet===sheet&&+cell.dataset.ri===ri&&+cell.dataset.ci===ci);
    const tr=td&&td.closest('tr');
    if(tr){tr.classList.add('diff-jump-target');td.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});setTimeout(()=>tr.classList.remove('diff-jump-target'),1500);}
    else toast('已切换到对应 Sheet，但未找到该单元格');
  },80);
}
function toggleDrawer(show){ const d=$('#chgDrawer'); const open=show!==undefined?show:!d.classList.contains('show'); if(open) renderChanges(); d.classList.toggle('show',open); }

/* ---------- modification history panel ---------- */
const TYPE_LABEL={edit:'修改',rename:'改名',add:'新增',delete:'删除',sync:'同步',revert:'恢复'};
function fmtTime(ts){ const d=new Date(ts); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function renderHistory(){
  const body=$('#histBody'); const hist=(STORE.history||[]).slice().reverse();
  const filt=$('#histVerFilter').value;
  const rows=hist.filter(h=>filt==='(全部版本)'||h.version===filt);
  if(!rows.length){ body.innerHTML='<div class="chg-empty">还没有修改记录。</div>'; return; }
  body.innerHTML=rows.map((h,i)=>{
    const badge=`<span class="hist-type t-${h.type}">${TYPE_LABEL[h.type]||h.type}</span>`;
    const menu=(h.path||'').split(' › ').pop();
    // compact one-liner + hidden detail
    let diff='';
    if(h.type==='edit'||h.type==='rename'||h.type==='sync'||h.type==='revert'){ diff=`<div class="chg-diff"><span class="chg-old">${esc(h.oldVal||'(空)')}</span><span class="chg-arrow">→</span><span class="chg-new">${esc(h.newVal||'(空)')}</span></div>`; }
    else { diff=`<div class="chg-diff chg-new">${esc(h.newVal||h.oldVal||'')}</div>`; }
    const from=h.type==='sync'&&h.from?`<div class="hist-drow"><span class="hist-dk">同步自</span><span class="hist-from">${esc(h.from)}</span></div>`:'';
    return `<div class="hist-row" data-i="${i}">
      <div class="hist-line"><span class="hist-time">${fmtTime(h.ts)}</span>${badge}<span class="hist-ver">${esc(h.version)}·${esc(h.region)}</span><span class="hist-menu">${esc(menu)}</span><span class="hist-field">${esc(h.field)}</span><span class="hist-caret">▸</span></div>
      <div class="hist-detail">
        <div class="hist-drow"><span class="hist-dk">完整路径</span><span>${esc(h.path)}</span></div>
        <div class="hist-drow"><span class="hist-dk">字段</span><span>${esc(h.field)}</span></div>
        ${from}
        <div class="hist-drow"><span class="hist-dk">变更</span><span>${diff}</span></div>
      </div></div>`;
  }).join('');
  body.querySelectorAll('.hist-row').forEach(el=>{ el.querySelector('.hist-line').onclick=()=>el.classList.toggle('open'); });
}
function openHistory(){
  const sel=$('#histVerFilter'); const vers=['(全部版本)',...STORE.versions.map(v=>v.name)];
  sel.innerHTML=vers.map(v=>`<option>${esc(v)}</option>`).join('');
  renderHistory(); $('#histDrawer').classList.add('show');
}
function exportHistory(){
  const rows=[['时间','操作','版本','区域','菜单路径','字段','原值','新值','同步自']];
  (STORE.history||[]).forEach(h=>rows.push([fmtTime(h.ts),TYPE_LABEL[h.type]||h.type,h.version,h.region,h.path,h.field,h.oldVal||'',h.newVal||'',h.from||'']));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'修改记录'); XLSX.writeFile(wb,'设置MenuTree_修改记录.xlsx'); toast('已导出修改记录');
}

/* ---------- version sidebar ---------- */
/* ---------- hierarchical version tree ---------- */
const OPEN_VERSIONS=new Set();
let versionMenuTarget=null;
function openVersionMenu(name,x,y){
  versionMenuTarget=name; const menu=$('#versionMenu');
  menu.style.left=Math.min(x,window.innerWidth-175)+'px'; menu.style.top=Math.min(y,window.innerHeight-185)+'px'; menu.classList.add('show');
}
function closeVersionMenu(){ const m=$('#versionMenu');if(m)m.classList.remove('show');versionMenuTarget=null; }
function runVersionMenu(action){
  const name=versionMenuTarget; closeVersionMenu(); if(!name)return;
  ({child:()=>addChildVersion(name),rename:()=>renameVersion(name),copy:()=>copyVersion(name),delete:()=>delVersion(name)})[action]?.();
}
function versionChildren(parent){ return STORE.versions.filter(v=>(v.parent||null)===(parent||null)); }
function versionByName(name){ return STORE.versions.find(v=>v.name===name)||null; }
function versionDescendants(name){
  const found=[],seen=new Set(),walk=parent=>versionChildren(parent).forEach(child=>{ if(seen.has(child.name))return; seen.add(child.name); found.push(child); walk(child.name); });
  walk(name); return found;
}
function repairVersionTree(){
  const names=new Set(STORE.versions.map(v=>v.name)); const repaired=[];
  STORE.versions.forEach(v=>{ if(v.parent&&(!names.has(v.parent)||v.parent===v.name)){ repaired.push(v.name); v.parent=null; } });
  if(repaired.length){ logChange({version:'—',region:'—',path:'(版本树)',field:'版本关系修复',oldVal:'恢复 '+repaired.length+' 个悬挂版本',newVal:repaired.join('、'),type:'revert'}); persist(); }
  return repaired;
}
function versionCount(name){ return REGIONS.reduce((s,r)=>{ const d=STORE.data[dsKey(name,r)]; return s+(d?liveRows(d).length:0); },0); }
function renderVersions(){
  repairVersionTree();
  const box=$('#verList');
  const renderNode=(v,depth)=>{
    const children=versionChildren(v.name); const hasKids=children.length>0; const open=OPEN_VERSIONS.has(v.name)||v.name===curVer;
    const caret=hasKids?`<span class="vcaret ${open?'open':''}" data-toggle="${esc(v.name)}">▶</span>`:'<span class="vcaret empty">▶</span>';
    const cnt=versionCount(v.name);
    let h=`<div class="veritem${v.name===curVer?' active':''}" data-v="${esc(v.name)}" style="padding-left:${10+depth*18}px">${caret}<span class="vname">${esc(v.name)}</span><span class="vcount">${cnt||''}</span></div>`;
    if(hasKids&&open) h+='<div class="verchildren">'+children.map(c=>renderNode(c,depth+1)).join('')+'</div>';
    return h;
  };
  const roots=versionChildren(null); box.innerHTML=roots.map(v=>renderNode(v,0)).join('');
  box.querySelectorAll('.veritem').forEach(el=>{el.onclick=e=>{if(e.target.dataset.toggle)return;selectVersion(el.dataset.v);};el.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();selectVersion(el.dataset.v);openVersionMenu(el.dataset.v,e.clientX,e.clientY);};});
  box.querySelectorAll('.vcaret[data-toggle]').forEach(el=>el.onclick=e=>{e.stopPropagation();const n=el.dataset.toggle;OPEN_VERSIONS.has(n)?OPEN_VERSIONS.delete(n):OPEN_VERSIONS.add(n);renderVersions();});
}
function suggestChildName(parent){ const m=parent.match(/^(.*?)(\d+(?:\.\d+)*)(.*)$/); if(!m)return parent+' 子版本'; const base=m[1],nums=m[2].split('.').map(Number),tail=m[3];nums.push(1);let n=base+nums.join('.')+tail;let i=1;while(STORE.versions.some(v=>v.name===n)){nums[nums.length-1]=++i;n=base+nums.join('.')+tail;}return n; }
function addChildVersion(parent){ const def=suggestChildName(parent);const name=prompt('在「'+parent+'」下新增小版本（将完整复制父版本数据）:',def);if(!name||!name.trim())return;const nm=name.trim();if(STORE.versions.some(v=>v.name===nm)){toast('版本名已存在');return;}STORE.versions.push({id:'v_'+Date.now(),name:nm,parent});REGIONS.forEach(r=>{const s=STORE.data[dsKey(parent,r)];if(s)STORE.data[dsKey(nm,r)]=JSON.parse(JSON.stringify(s));});logChange({version:nm,region:'—',path:'(版本树)',field:'新增子版本',oldVal:'父版本 '+parent,newVal:'(新版本)',type:'add'});OPEN_VERSIONS.add(parent);persist();selectVersion(nm);renderVersions();toast('已新增小版本:'+nm);}
function renameVersion(oldName){ const v=STORE.versions.find(x=>x.name===oldName);if(!v)return;const name=prompt('修改版本名称:',oldName);if(!name||!name.trim()||name.trim()===oldName)return;const nm=name.trim();if(STORE.versions.some(x=>x.name===nm)){toast('版本名已存在');return;}REGIONS.forEach(r=>{const oldK=dsKey(oldName,r),newK=dsKey(nm,r);if(STORE.data[oldK]){STORE.data[newK]=STORE.data[oldK];delete STORE.data[oldK];}});STORE.versions.forEach(x=>{if(x.parent===oldName)x.parent=nm;});v.name=nm;if(curVer===oldName)curVer=nm;if(OPEN_VERSIONS.has(oldName)){OPEN_VERSIONS.delete(oldName);OPEN_VERSIONS.add(nm);}logChange({version:nm,region:'—',path:'(版本树)',field:'重命名版本',oldVal:oldName,newVal:nm,type:'rename'});persist();rebuildForCurrent();renderVersions();render();toast('已修改版本名称');}
// suggest an incremented version name, e.g. "V 6.0" -> "V 6.1", "V 5.9"->"V 6.0"
function suggestNextName(src){
  const m=src.match(/^(.*?)(\d+)\.(\d+)(.*)$/);
  if(m){ let major=+m[2],minor=+m[3]; minor++; if(minor>9){major++;minor=0;} let n=`${m[1]}${major}.${minor}${m[4]}`; if(!STORE.versions.some(v=>v.name===n)) return n; }
  let i=2, base=src+' 副本'; let n=base; while(STORE.versions.some(v=>v.name===n)){ n=base+i; i++; }
  return n;
}
function copyCurrentVersion(){
  if(!curVer){ toast('请先选择一个版本'); return; }
  copyVersion(curVer);
}
function copyVersion(src){
  const def=suggestNextName(src);
  const name=prompt('把「'+src+'」另存为新版本(含全部数据),新版本名:',def); if(!name||!name.trim()) return;
  const nm=name.trim(); if(STORE.versions.some(v=>v.name===nm)){ toast('版本名已存在'); return; }
  STORE.versions.push({id:'v_'+Date.now(),name:nm});
  REGIONS.forEach(r=>{ const s=STORE.data[dsKey(src,r)]; if(s) STORE.data[dsKey(nm,r)]=JSON.parse(JSON.stringify(s)); });
  logChange({version:nm,region:'—',path:'(整个版本)',field:'—',oldVal:'复制自 '+src,newVal:'(新版本)',type:'add'});
  persist(); selectVersion(nm); renderVersions(); toast('已复制出版本:'+nm);
}
function selectVersion(name){ curVer=name; rebuildForCurrent(); renderVersions(); render(); }
function rebuildForCurrent(){ const ds=curDS(); if(ds){ rebuildColumns(ds); initFilters(ds); } else { $('#fSheet').innerHTML=''; } $$('#regionTabs .rtab').forEach(t=>t.classList.toggle('active',t.dataset.r===curRegion)); const lbl=$('#curVerLabel'); if(lbl) lbl.innerHTML=curVer?`当前:<b>${esc(curVer)}</b> · ${esc(curRegion)}`:''; updateUndoButtons(); }
function addVersion(name){ if(!name) return; if(STORE.versions.some(v=>v.name===name)){ toast('版本已存在'); selectVersion(name); return; } STORE.versions.push({id:'v_'+Date.now(),name}); logChange({version:name,region:'—',path:'(版本树)',field:'新增版本',oldVal:'',newVal:'(新版本)',type:'add'}); persist(); selectVersion(name); renderVersions(); toast('已新建版本:'+name); }
function purgeCurrentContent(){
  const ds=curDS(); if(!curVer||!ds){toast('请先选择一个版本和区域');return;}
  const count=liveRows(ds).length, files=(ds.originalFiles||[]).length;
  if(!confirm('删除「'+curVer+' · '+curRegion+'」的全部当前内容？\n\n将清空 '+count+' 条管理数据、所有原始表预览和 '+files+' 个导入原文件。此操作不可撤销；建议先点击“备份”。'))return;
  const fresh={trees:[],rawSheets:[],originalFiles:[],sheetEdits:{},sheetLayout:{},sourceClears:{},edits:{},added:[],deleted:{},ts:{},confirmed:{},customCols:[],hiddenColumns:[],layout:{colWidths:{},rowHeights:{}},cellColors:{},cellFormats:{},columnMarks:{}};
  STORE.data[dsKey(curVer,curRegion)]=fresh;
  selectedRowIds.clear();selectedColumn=null;selectedCell=null;
  ds.ui={viewSheet:''};
  logChange({version:curVer,region:curRegion,path:'(当前区域全部内容)',field:'—',oldVal:count+' 条管理数据 / '+files+' 个原文件',newVal:'(已清空)',type:'delete'});
  persist();rebuildForCurrent();renderVersions();render();toast('已删除当前内容，可重新导入 Excel');
}
let pendingVersionDelete=null;
function openDeleteVersionDialog(name){
  const target=versionByName(name); if(!target)return;
  const children=versionChildren(name), descendants=versionDescendants(name), all=[target,...descendants];
  pendingVersionDelete={target,children,descendants,all};
  $('#deleteVersionSummary').textContent=children.length?`「${name}」有 ${children.length} 个直接子版本、${descendants.length} 个后代版本。删除此版本不会让子版本丢失：可将直接子版本上移到当前层级。`:`将永久删除版本「${name}」及其现有地区数据。此操作不能通过撤销恢复。`;
  $('#deleteVersionChildren').innerHTML=children.length?children.map(v=>`<div class="sync-item"><span class="sync-v">${esc(v.name)}</span><span class="sync-diff">将上移并保留全部数据</span></div>`).join(''):'';
  $('#deleteVersionHint').textContent=children.length?`“删除整个分支”会删除 ${all.length} 个版本及其所有地区数据，无法撤销。建议先执行工程备份。`:'建议先执行工程备份；删除后可通过工程备份恢复。';
  $('#deleteVersionPromote').style.display=children.length?'':'none';
  $('#deleteVersionBranch').textContent=children.length?`删除整个分支（${all.length} 个版本）`:'永久删除此版本';
  $('#deleteVersionDlg').style.display='flex'; $('#deleteVersionCancel').focus();
}
function closeDeleteVersionDialog(){ pendingVersionDelete=null; $('#deleteVersionDlg').style.display='none'; }
function selectVisibleVersion(preferred=[]){
  const names=new Set(STORE.versions.map(v=>v.name)); const next=preferred.find(name=>names.has(name))||versionChildren(null)[0]?.name||STORE.versions[0]?.name||null;
  curVer=next;
}
function commitVersionDelete(mode){
  const pending=pendingVersionDelete; if(!pending)return;
  const {target,children,descendants}=pending;
  const deleted=mode==='branch'?[target,...descendants]:[target];
  const deletedNames=new Set(deleted.map(v=>v.name));
  const promoted=mode==='promote'?children:[];
  const replacementParent=target.parent||null;
  if(mode==='promote'){
    promoted.forEach(child=>child.parent=replacementParent);
    if(replacementParent) OPEN_VERSIONS.add(replacementParent);
  }
  STORE.versions=STORE.versions.filter(v=>!deletedNames.has(v.name));
  deleted.forEach(v=>REGIONS.forEach(r=>delete STORE.data[dsKey(v.name,r)]));
  deleted.forEach(v=>OPEN_VERSIONS.delete(v.name));
  const activeWasDeleted=deletedNames.has(curVer);
  if(activeWasDeleted) selectVisibleVersion([...promoted.map(v=>v.name),replacementParent]);
  logChange({version:target.name,region:'—',path:'(版本树)',field:mode==='branch'?'删除整个分支':'删除版本并上移子版本',oldVal:mode==='branch'?'删除 '+deleted.length+' 个版本':'保留并上移 '+promoted.length+' 个子版本',newVal:'(已删除)',type:'delete'});
  closeDeleteVersionDialog(); persist(); rebuildForCurrent(); renderVersions(); render();
  toast(mode==='branch'?`已删除 ${deleted.length} 个版本`:`已删除版本；已保留 ${promoted.length} 个子版本`);
}
function delVersion(name){ openDeleteVersionDialog(name); }

/* ---------- cross-version diff ---------- */
let diffJumpTargets=[];
function registerDiffTarget(version,region,path){ diffJumpTargets.push({version,region,path}); return diffJumpTargets.length-1; }
function sourceRowForMenu(raw,row){
  if(!raw||!row||!raw.rows)return null;
  const rows=raw.rows,headerIndex=findHeaderRow(rows),header=rows[headerIndex]||[],levelCols=classifyCols(header).level.slice(0,4);
  if(!levelCols.length)return null;
  const stack=[];
  for(let ri=headerIndex+1;ri<rows.length;ri++){
    const values=rows[ri]||[],depth=levelCols.findIndex(ci=>norm(values[ci])!=='');
    if(depth<0)continue;
    stack.length=depth;
    stack[depth]=norm(values[levelCols[depth]]);
    const path=[row.category,...stack.slice(0,depth+1)].join(' › ');
    if(path===row.path)return ri;
  }
  return null;
}
function jumpToDiffTarget(index){
  const target=diffJumpTargets[index]; if(!target)return;
  $('#diffDlg').style.display='none';
  curRegion=target.region;
  selectVersion(target.version);
  const ds=curDS(),row=ds&&liveRows(ds).find(r=>r.path===target.path);
  if(!row){ toast('未找到对应菜单项：'+target.path); return; }
  ds.ui=ds.ui||{}; ds.ui.viewSheet=row.sheet||'';
  rebuildForCurrent();
  $('#fDepth').value='(全部)'; $('#fSearch').value='';
  persist(); render();
  setTimeout(()=>{
    const raw=(ds.rawSheets||[]).find(s=>s.sheet===row.sheet);
    const sourceRi=sourceRowForMenu(raw,row);
    let tr=sourceRi==null?null:document.querySelector(`#tbody tr[data-source-row="${sourceRi}"]`);
    if(!tr){
      const td=[...document.querySelectorAll('#tbody td[data-id]')].find(x=>x.dataset.id===row.id);
      tr=td&&td.closest('tr');
    }
    if(tr){tr.classList.add('diff-jump-target');tr.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>tr.classList.remove('diff-jump-target'),1500);}
    else toast('已切换到对应版本，但未找到表格中的具体行');
  },80);
}
function openDiff(){
  if(STORE.versions.length<2){ toast('至少需要两个版本才能对比'); return; }
  const opts=STORE.versions.map(v=>`<option>${esc(v.name)}</option>`).join('');
  $('#diffA').innerHTML=opts; $('#diffB').innerHTML=opts;
  if(STORE.versions[1]) $('#diffB').selectedIndex=1;
  $('#diffRegion').innerHTML=REGIONS.map(r=>`<option ${r===curRegion?'selected':''}>${esc(r)}</option>`).join('');
  $('#diffResult').innerHTML='<div class="chg-empty">选择两个版本后点「开始对比」。</div>';
  $('#diffDlg').style.display='flex';
}
function dsRowsMap(vname,region){
  const ds=STORE.data[dsKey(vname,region)]; if(!ds) return null;
  const m=new Map();
  liveRows(ds).forEach(r=>{ m.set(r.path,{row:r,ds}); });
  return {ds,map:m};
}
function runDiff(){
  const A=$('#diffA').value,B=$('#diffB').value,region=$('#diffRegion').value;
  if(A===B){ $('#diffResult').innerHTML='<div class="chg-empty">请选择两个不同的版本。</div>'; return; }
  const da=dsRowsMap(A,region), db=dsRowsMap(B,region);
  if(!da||!db){ $('#diffResult').innerHTML=`<div class="chg-empty">版本「${esc(!da?A:B)}」在「${esc(region)}」下没有数据。</div>`; return; }
  const keys=new Set([...da.map.keys(),...db.map.keys()]);
  const added=[],removed=[],changed=[];
  const allFields=new Set(); [da.ds,db.ds].forEach(ds=>liveRows(ds).forEach(r=>Object.keys(r.fields).forEach(k=>allFields.add(k))));
  [...keys].forEach(path=>{
    const a=da.map.get(path), b=db.map.get(path);
    if(a&&!b){ removed.push(path); }
    else if(!a&&b){ added.push(path); }
    else {
      const diffs=[];
      allFields.forEach(k=>{ const va=rowFieldVal(a.ds,a.row,k)||'', vb=rowFieldVal(b.ds,b.row,k)||''; if(va!==vb) diffs.push({field:fieldTitle(k),va,vb}); });
      if(diffs.length) changed.push({path,diffs});
    }
  });
  let h=`<div class="diff-sum"><span class="ds-add">新增 ${added.length}</span><span class="ds-del">删除 ${removed.length}</span><span class="ds-chg">变更 ${changed.length}</span><span style="color:var(--sub)">${esc(A)} → ${esc(B)} · ${esc(region)}</span></div>`;
  if(!added.length&&!removed.length&&!changed.length){ h+='<div class="chg-empty">两个版本在该区域完全一致。</div>'; $('#diffResult').innerHTML=h; return; }

  // Render one horizontal comparison table. Each changed field occupies one
  // row so the two version values can be scanned left-to-right. Added and
  // removed menu paths use an empty cell on the missing side.
  diffJumpTargets=[];
  const rows=[];
  added.forEach(path=>rows.push({kind:'add',path,field:'菜单项',oldVal:'—',newVal:'新增菜单项'}));
  removed.forEach(path=>rows.push({kind:'del',path,field:'菜单项',oldVal:'删除菜单项',newVal:'—'}));
  changed.forEach(item=>item.diffs.forEach(df=>rows.push({kind:'chg',path:item.path,field:df.field,oldVal:df.va||'(空)',newVal:df.vb||'(空)'})));
  const status={add:'新增',del:'删除',chg:'变更'};
  h+=`<div class="diff-compare-wrap"><table class="diff-compare"><thead><tr><th class="diff-status">状态</th><th class="diff-path">菜单路径</th><th class="diff-field">字段</th><th class="diff-side">${esc(A)}（对比前）</th><th class="diff-side">${esc(B)}（对比后）</th></tr></thead><tbody>`;
  const sideCell=(version,path,value,missing)=>missing?'<span class="diff-empty-cell">—</span>':`<button class="diff-jump" data-diff-jump="${registerDiffTarget(version,region,path)}" title="点击跳转到该版本对应位置">${esc(value)}</button>`;
  h+=rows.map(r=>`<tr class="diff-${r.kind}"><td class="diff-status">${status[r.kind]}</td><td class="diff-path">${esc(r.path)}</td><td class="diff-field">${esc(r.field)}</td><td class="diff-side diff-old${r.oldVal==='—'?' diff-empty-cell':''}">${sideCell(A,r.path,r.oldVal,r.oldVal==='—')}</td><td class="diff-side diff-new${r.newVal==='—'?' diff-empty-cell':''}">${sideCell(B,r.path,r.newVal,r.newVal==='—')}</td></tr>`).join('');
  h+='</tbody></table></div>';
  $('#diffResult').innerHTML=h;
}

function downloadOriginalFile(){
  const ds=curDS();const files=ds&&ds.originalFiles||[];
  if(!files.length){toast('此版本没有保存原始 Excel 文件');return;}
  if(files.length===1){const f=files[0];download(f.name,new Blob([new Uint8Array(f.bytes)],{type:f.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));return;}
  const selected=prompt('当前共导入 '+files.length+' 个原始 Excel。请输入要下载的序号(1-'+files.length+')：\n'+files.map((f,i)=>(i+1)+'. '+f.name).join('\n'),'1');
  const f=files[(+selected||1)-1];if(f)download(f.name,new Blob([new Uint8Array(f.bytes)],{type:f.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
}
function openRawSheets(){ const ds=curDS(); if(!ds||(ds.rawSheets||[]).length===0){toast('当前版本/区域没有原始表');return;} $('#rawSel').innerHTML=ds.rawSheets.map((s,i)=>`<option value="${i}">${esc(s.sheet)} · ${s.rowCount||s.rows.length} 行 × ${s.colCount||Math.max(0,...s.rows.map(r=>r.length))} 列</option>`).join(''); $('#rawSel').onchange=renderRawSheet; renderRawSheet(); $('#rawDlg').style.display='flex'; }
function renderRawSheet(){ const ds=curDS(); const s=ds.rawSheets[+$('#rawSel').value]; if(!s)return; const rows=s.rows||[]; const colCount=s.colCount||Math.max(0,...rows.map(r=>r.length)); let h='<table class="cmptable rawtable">'; rows.forEach((r,ri)=>{h+='<tr>'+Array.from({length:colCount},(_,ci)=>`<${ri===0?'th':'td'} data-ri="${ri}" data-ci="${ci}">${esc(r[ci]??'')}</${ri===0?'th':'td'}>`).join('')+'</tr>';}); h+='</table>'; $('#rawView').innerHTML=h; }

/* ---------- global cross-version search ---------- */
function openGlobalSearch(){ $('#gsInput').value=''; $('#gsResult').innerHTML='<div class="chg-empty">输入关键词(菜单名 / 配置项 / feature flag / 条件 …),搜索所有版本。</div>'; $('#gsDlg').style.display='flex'; $('#gsInput').focus(); }
function runGlobalSearch(){
  const term=$('#gsInput').value.trim().toLowerCase(); const box=$('#gsResult');
  if(!term){ box.innerHTML=''; return; }
  const hits=[];
  STORE.versions.forEach(v=>REGIONS.forEach(region=>{ const ds=STORE.data[dsKey(v.name,region)]; if(!ds) return;
    liveRows(ds).forEach(r=>{ let snip='';
      if(rowName(ds,r).toLowerCase().includes(term)) snip='菜单名';
      else { for(const k of fieldColsOf(ds)){ const val=String(rowFieldVal(ds,r,k)||''); const idx=val.toLowerCase().indexOf(term); if(idx>=0){ snip=fieldTitle(k)+': …'+val.substring(Math.max(0,idx-15),idx+term.length+30).replace(/\n/g,' ')+'…'; break; } } }
      if(snip) hits.push({v:v.name,region,path:r.path,name:rowName(ds,r),snip});
    });
  }));
  let h=`<div class="count">在所有版本中命中 ${hits.length} 处</div>`;
  const byV={}; hits.forEach(x=>(byV[x.v+' · '+x.region]=byV[x.v+' · '+x.region]||[]).push(x));
  Object.entries(byV).forEach(([grp,arr])=>{ h+=`<div class="chg-sec">${esc(grp)}(${arr.length})</div>`+arr.slice(0,50).map(x=>`<div class="gs-item"><div class="m">${esc(x.name)}</div><div class="p">${esc(x.path)}</div><div class="snip">${esc(x.snip)}</div></div>`).join(''); });
  box.innerHTML=h;
}
function fieldColsOf(ds){ const s=new Set(); baseRows(ds).forEach(r=>Object.keys(r.fields).forEach(k=>s.add(k))); (ds.added||[]).forEach(r=>Object.keys(r.fields).forEach(k=>s.add(k))); (ds.customCols||[]).forEach(k=>s.add(k)); return [...s]; }
function canonFieldLookup(ds,key){
  const direct=new Set(fieldColsOf(ds)); if(direct.has(key))return key;
  const target=canonKey(key); return [...direct].find(k=>canonKey(k)===target)||key;
}
function getFieldByMeaning(ds,r,key){ return rowFieldVal(ds,r,canonFieldLookup(ds,key)); }

/* ---------- data health check ---------- */
function runHealthCheck(){
  const ds=curDS(); if(!ds){ toast('无数据'); return; }
  const issues=[]; const rows=liveRows(ds);
  rows.forEach(r=>{
    const hide=getFieldByMeaning(ds,r,'隐藏条件'), gray=getFieldByMeaning(ds,r,'灰显条件');
    const gz=getFieldByMeaning(ds,r,'灰显提示(中)'), ge=getFieldByMeaning(ds,r,'灰显提示(英)');
    const opts=getFieldByMeaning(ds,r,'取值/选项'), def=getFieldByMeaning(ds,r,'默认值');
    const zh=getFieldByMeaning(ds,r,'说明(中)'), en=getFieldByMeaning(ds,r,'说明(英)')||getFieldByMeaning(ds,r,'说明(英/通用)');
    if(gray&&!gz&&!ge) issues.push({path:r.path,type:'缺灰显提示',detail:'有灰显条件但没填灰显提示语'});
    if(zh&&!en) issues.push({path:r.path,type:'缺英文说明',detail:'有中文说明但没有英文说明'});
    // default not in options (when options look like an enumerated slash list)
    if(def&&opts&&/[\/、]/.test(opts)&&!/[~\-0-9]/.test(opts)){ const set=opts.split(/[\/、,]/).map(s=>s.trim()); if(set.length>1&&!set.includes(def.trim())) issues.push({path:r.path,type:'默认值不在取值内',detail:`默认「${def}」不在取值「${opts}」中`}); }
  });
  // config-item spelling variants: same-looking feature flags differing only by case
  const flagMap={};
  rows.forEach(r=>{ const c=rowFieldVal(ds,r,'配置项'); if(c){ (c.match(/feature_[a-z0-9_]+/gi)||[]).forEach(t=>{ const low=t.toLowerCase(); (flagMap[low]=flagMap[low]||new Set()).add(t); }); } });
  Object.entries(flagMap).forEach(([low,set])=>{ if(set.size>1) issues.push({path:'(多处)',type:'配置项大小写不一致',detail:[...set].join(' / ')}); });
  const box=$('#hcResult');
  if(!issues.length){ box.innerHTML='<div class="chg-empty">未发现可疑项 👍</div>'; }
  else { const byType={}; issues.forEach(i=>(byType[i.type]=byType[i.type]||[]).push(i));
    box.innerHTML=`<div class="count">共 ${issues.length} 个可疑项(仅提示,不自动改)</div>`+Object.entries(byType).map(([t,arr])=>`<div class="chg-sec">${esc(t)}(${arr.length})</div>`+arr.slice(0,80).map(i=>`<div class="hc-item"><div class="p">${esc(i.path)}</div><div class="d">${esc(i.detail)}</div></div>`).join('')).join(''); }
  $('#hcDlg').style.display='flex';
}

/* ---------- batch sync a whole category ---------- */
function openBatchSync(){
  const ds=curDS(); if(!ds){ toast('无数据'); return; }
  const cats=[...new Set(baseRows(ds).map(r=>r.category))];
  $('#bsCat').innerHTML=cats.map(c=>`<option>${esc(c)}</option>`).join('');
  const others=STORE.versions.filter(v=>v.name!==curVer);
  $('#bsVers').innerHTML=others.length?others.map(v=>`<label class="sync-item"><input type="checkbox" data-v="${esc(v.name)}" checked><span class="sync-v">${esc(v.name)} · ${esc(curRegion)}</span></label>`).join(''):'<div class="chg-empty">没有其他版本可同步</div>';
  $('#bsDlg').style.display='flex';
}
function runBatchSync(){
  const ds=curDS(); const cat=$('#bsCat').value;
  const targets=[...$('#bsVers').querySelectorAll('input:checked')].map(cb=>cb.dataset.v);
  if(!targets.length){ $('#bsDlg').style.display='none'; return; }
  const srcRows=liveRows(ds).filter(r=>r.category===cat);
  let matched=0,fieldsCopied=0; const touched=new Set();
  targets.forEach(vname=>{ const tds=STORE.data[dsKey(vname,curRegion)]; if(!tds) return;
    srcRows.forEach(sr=>{ const m=findByPath(tds,sr.path); if(!m) return; matched++;
      const mrow=liveRows(tds).find(x=>x.id===m.id);
      fieldColsOf(ds).forEach(k=>{ const nv=rowFieldVal(ds,sr,k); if(nv==null||nv==='') return; const curVal=rowFieldVal(tds,mrow,k); if(curVal===nv) return;
        if(m.added){ const a=tds.added.find(x=>x.id===m.id); a.fields[k]=nv; } else { const orig=baseFieldOf(tds,m.id,k); if(nv===orig){ if(tds.edits[m.id]) delete tds.edits[m.id][k]; } else { tds.edits[m.id]=tds.edits[m.id]||{}; tds.edits[m.id][k]=nv; } }
        fieldsCopied++; touched.add(vname);
        logChange({version:vname,region:curRegion,path:sr.path,field:fieldTitle(k),oldVal:curVal,newVal:nv,type:'sync',from:curVer});
      });
    });
  });
  persist(); $('#bsDlg').style.display='none'; render(); renderVersions();
  toast(`批量同步「${cat}」:${fieldsCopied} 处字段 → ${[...touched].join('、')||'无匹配'}`);
}

/* ---------- import Excel ---------- */
async function importFiles(fileList){
  if(!curVer){ toast('请先选择或新建一个版本'); return; }
  const ds=ensureDS(curVer,curRegion);
  let totalSheets=0,totalNodes=0,totalRaw=0,firstImportedSheet='';
  for(const file of fileList){
    const buf=await file.arrayBuffer();
    // Preserve complete original workbook bytes in JSON-safe form. This survives IndexedDB,
    // project backups and restores without losing any sheet, style, merge or formula.
    ds.originalFiles.push({name:file.name||'导入文件.xlsx',type:file.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes:Array.from(new Uint8Array(buf)),importedAt:Date.now()});
    const parsed=parseWorkbook(buf,curRegion);
    parsed.trees.forEach(p=>{
      // Keep the source schema as well as source columns.  Losing it here made
      // the source-sheet selector appear to import nothing in some workbooks.
      let sheet=p.sheet, i=2; while(ds.trees.some(t=>t.sheet===sheet)){ sheet=p.sheet+' ('+i+')'; i++; }
      ds.trees.push({sheet,category:p.category,roots:p.roots,node_count:p.node_count,sourceColumns:p.sourceColumns||[],sourceSchema:p.sourceSchema||[]});
      totalSheets++; totalNodes+=p.node_count;
    });
    parsed.rawSheets.forEach(p=>{
      let sheet=p.sheet,i=2; while(ds.rawSheets.some(t=>t.sheet===sheet)){sheet=p.sheet+' ('+i+')';i++;}
      if(!firstImportedSheet)firstImportedSheet=sheet;
      ds.rawSheets.push({sheet,rows:p.rows,cellStyles:p.cellStyles||[],merges:p.merges||[],ref:p.ref||'',rowsMeta:p.rowsMeta||[],colsMeta:p.colsMeta||[],rowCount:p.rowCount||p.rows.length,colCount:p.colCount||0}); totalRaw++;
    });
  }
  ds.ui=ds.ui||{}; if(firstImportedSheet)ds.ui.viewSheet=firstImportedSheet;
  rebuildColumns(ds); initFilters(ds); persist(); renderVersions(); render();
  toast(`导入完成:${totalSheets} 个菜单 sheet / ${totalRaw} 个原始 Sheet / ${totalNodes} 个菜单项 → 已打开第一个原始 Sheet`);
}

/* ---------- export current view ---------- */
function currentExportView(){const ds=curDS(),rows=filteredRows(ds),f=currentFilter();let scope=null,dep=MAX_DEPTH,activeSchema=[];if(f.sheet){scope=new Set(sheetSourceColumns(ds,f.sheet));dep=0;liveRows(ds).filter(r=>r.sheet===f.sheet).forEach(r=>{dep=Math.max(dep,dispDepth(r));Object.keys(r.fields||{}).forEach(k=>scope.add(k));});activeSchema=sheetSourceSchema(ds,f.sheet);}else if(f.cat!=='(全部)'){scope=new Set();dep=0;liveRows(ds).filter(r=>r.category===f.cat).forEach(r=>{dep=Math.max(dep,dispDepth(r));fieldCols().forEach(k=>{if(String(rowFieldVal(ds,r,k)||'').trim())scope.add(k);});});}(ds.customCols||[]).forEach(k=>scope&&scope.add(k));let cols;if(activeSchema.length){cols=activeSchema.filter(c=>c.kind==='level'||visible[c.key]).map(c=>Object.assign({},c));}else cols=COLS.filter(c=>visible[c.key]&&(!scope||(c.kind==='field'?scope.has(c.key):c.kind==='level'?c.depth<=dep:true)));return{ds,rows,cols};}
function ev(ds,r,c){return cellVal(ds,r,c.key);}
function xe(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function exportMarkdown(){const{ds,rows,cols}=currentExportView();let m=`# 设置 MenuTree\n\n版本：${curVer}  \n区域：${curRegion}\n\n| ${cols.map(c=>c.title).join(' | ')} |\n| ${cols.map(()=> '---').join(' | ')} |\n`;rows.forEach(r=>m+='| '+cols.map(c=>String(ev(ds,r,c)||'').replace(/\|/g,'\\|').replace(/\n/g,'<br>')).join(' | ')+' |\n');download(`${curVer}_${curRegion}_当前视图.md`,new Blob([m],{type:'text/markdown;charset=utf-8'}));toast('已导出 Markdown');}
function exportJavaScript(){const{ds,rows,cols}=currentExportView();const data={version:curVer,region:curRegion,exportedAt:new Date().toISOString(),columns:cols.map(c=>({key:c.key,title:c.title,type:c.kind})),rows:rows.map(r=>({id:r.id,path:r.path,values:Object.fromEntries(cols.map(c=>[c.key,ev(ds,r,c)])),format:Object.fromEntries(cols.map(c=>[c.key,cellFormat(ds,r,c.key)])),background:Object.fromEntries(cols.map(c=>[c.key,cellColor(ds,r,c.key)]))}))};download(`${curVer}_${curRegion}_当前视图.js`,new Blob([`export const menuTreeData = ${JSON.stringify(data,null,2)};\nexport default menuTreeData;\n`],{type:'text/javascript;charset=utf-8'}));toast('已导出 JavaScript');}
function exportXlsx(){
  const view=currentExportView(),ds=view.ds,rows=view.rows,cols=view.cols;
  const widths=cols.map(c=>Math.round((((ds.layout&&ds.layout.colWidths&&ds.layout.colWidths[c.key])||(c.kind==='level'?150:180))*.75)));
  const esc=v=>xe(v); let xml='<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles>';
  const styles={};
  const sid=(f,b)=>{const k=JSON.stringify({f,b});if(styles[k])return styles[k].id;const id='s'+(Object.keys(styles).length+1);styles[k]={id,f,b};return id;};
  const cell=(v,f,b)=>`<Cell ss:StyleID="${sid(f,b)}"><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  let body='<Row ss:Height="26">'+cols.map(c=>cell(c.title,{bold:true,align:'center'},(ds.columnMarks&&ds.columnMarks[c.key]&&ds.columnMarks[c.key].color)||'#EAF0FF')).join('')+'</Row>';
  rows.forEach(r=>{const h=ds.layout&&ds.layout.rowHeights&&ds.layout.rowHeights[r.id];body+=`<Row${h?` ss:Height="${Math.round(h*.75)}"`:''}>`+cols.map(c=>cell(ev(ds,r,c),cellFormat(ds,r,c.key),cellColor(ds,r,c.key))).join('')+'</Row>';});
  Object.values(styles).forEach(s=>{const f=s.f||{},b=String(s.b||'FFFFFF').replace('#','');xml+=`<Style ss:ID="${s.id}"><Font ss:Bold="${f.bold?1:0}" ss:Italic="${f.italic?1:0}" ss:Underline="${f.underline?'Single':'None'}" ss:StrikeThrough="${f.strike?1:0}"${f.color?` ss:Color="#${String(f.color).replace('#','')}"`:''}/><Interior ss:Color="#${b}" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/></Borders><Alignment ss:Horizontal="${f.align==='center'?'Center':f.align==='right'?'Right':'Left'}" ss:Vertical="Top" ss:WrapText="1"/></Style>`;});
  xml+='</Styles><Worksheet ss:Name="当前视图"><Table>'+widths.map(x=>`<Column ss:Width="${x}"/>`).join('')+body+'</Table></Worksheet></Workbook>';
  download(`${curVer}_${curRegion}_当前视图.xls`,new Blob([xml],{type:'application/vnd.ms-excel'}));toast('已导出 Excel（含格式）');
}
function exportFullExcel(){
 const ds=curDS();if(!ds){toast('无数据');return;}const border='<Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B8C0CC"/></Borders>';
 let xml='<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="base">'+border+'<Alignment ss:Vertical="Top" ss:WrapText="1"/></Style><Style ss:ID="head"><Font ss:Bold="1"/>'+border+'<Interior ss:Color="#EAF0FF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Top" ss:WrapText="1"/></Style></Styles>';
 const addSheet=(name,rows,widths)=>{let safe=String(name).replace(/[\\\/\?\*\[\]:]/g,'').slice(0,31)||'Sheet';xml+='<Worksheet ss:Name="'+xe(safe)+'"><Table>'+widths.map(w=>`<Column ss:Width="${w}"/>`).join('');rows.forEach((r,i)=>{xml+='<Row>'+r.map(v=>`<Cell ss:StyleID="${i===0?'head':'base'}"><Data ss:Type="String">${xe(v)}</Data></Cell>`).join('')+'</Row>';});xml+='</Table></Worksheet>';};
 const byCat={};liveRows(ds).forEach(r=>(byCat[r.category]=byCat[r.category]||[]).push(r));Object.entries(byCat).forEach(([cat,rows])=>{const max=Math.max(1,...rows.map(r=>dispDepth(r)+1));const heads=[];for(let i=0;i<max;i++)heads.push(LEVEL_NAMES[i]||('第'+(i+1)+'级'));const fields=[...new Set(rows.flatMap(r=>Object.keys(r.fields)))];addSheet('菜单-'+cat,[[...heads,...fields],...rows.map(r=>{const lv=new Array(max).fill('');lv[dispDepth(r)]=rowName(ds,r);return [...lv,...fields.map(k=>rowFieldVal(ds,r,k)||'')];})],[...heads.map(()=>130),...fields.map(()=>180)]);});
 (ds.rawSheets||[]).forEach(s=>{const max=Math.max(1,...(s.rows||[]).map(r=>r.length));const rows=(s.rows||[]).map(r=>{const a=r.slice();while(a.length<max)a.push('');return a;});addSheet('原始-'+s.sheet,rows,Array(max).fill(140));});
 xml+='</Workbook>';download(`${curVer}_${curRegion}_完整内容.xls`,new Blob([xml],{type:'application/vnd.ms-excel'}));toast('已导出完整 Excel（所有 Sheet，含框线）');
}
function exportJson(){const{ds,rows,cols}=currentExportView();const o={version:curVer,region:curRegion,rows:rows.map(r=>Object.fromEntries(cols.map(c=>[c.key,ev(ds,r,c)])))};download(`${curVer}_${curRegion}_当前视图.json`,new Blob([JSON.stringify(o,null,2)],{type:'application/json'}));toast('已导出 JSON');}
function download(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}

/* ---------- whole-project backup / restore ---------- */
function backupProject(){
  const payload={_type:'yinhua_menutree_project',_ver:1,exported_at:new Date().toISOString(),store:STORE};
  const ymd=new Date().toISOString().slice(0,10);
  download(`设置MenuTree_工程备份_${ymd}.json`, new Blob([JSON.stringify(payload)],{type:'application/json'}));
  toast('已导出工程备份('+STORE.versions.length+' 个版本)');
}
async function restoreProject(file){
  let data; try{ data=JSON.parse(await file.text()); }catch(e){ toast('文件解析失败'); return; }
  const incoming=data.store||data; // tolerate raw store
  if(!incoming||!incoming.versions){ toast('不是有效的工程文件'); return; }
  const mode=confirm('恢复方式:\n【确定】=覆盖(用文件完全替换当前所有版本)\n【取消】=合并(把文件里的版本并入,同名版本以文件为准)');
  if(mode){ STORE={versions:incoming.versions||[],data:incoming.data||{},history:incoming.history||[]}; }
  else {
    incoming.versions.forEach(v=>{ if(!STORE.versions.some(x=>x.name===v.name)) STORE.versions.push(v); });
    Object.assign(STORE.data, incoming.data||{});
    STORE.history=(STORE.history||[]).concat(incoming.history||[]);
  }
  curVer=STORE.versions[0]?STORE.versions[0].name:null;
  const repaired=repairVersionTree();
  persist(); rebuildForCurrent(); renderVersions(); render();
  toast('已恢复工程('+STORE.versions.length+' 个版本)'+(repaired.length?'；已修复 '+repaired.length+' 个悬挂版本':''));
}

/* ---------- add-row dialog ---------- */
function openAddDialog(){ const ds=curDS(); if(!ds||!ds.trees.length){ toast('请先导入该版本的数据'); return; }
  const cats=[...new Set(baseRows(ds).map(r=>r.category))];
  $('#adCat').innerHTML=cats.map(c=>`<option>${esc(c)}</option>`).join('');
  const syncP=()=>{ const cat=$('#adCat').value; const cand=liveRows(ds).filter(r=>r.category===cat); $('#adParent').innerHTML='<option value="">（作为顶层项）</option>'+cand.map(r=>`<option value="${esc(r.id)}">${'　'.repeat(r.depth)}${esc(rowName(ds,r))}</option>`).join(''); };
  $('#adCat').onchange=syncP; syncP(); $('#adName').value=''; $('#addDlg').style.display='flex'; $('#adName').focus();
}
function confirmAdd(){ const ds=curDS(); const cat=$('#adCat').value; const parentId=$('#adParent').value||null; const name=$('#adName').value.trim()||'新菜单项'; let depth=0; if(parentId){ const p=liveRows(ds).find(r=>r.id===parentId); depth=p?p.depth+1:0; } pushUndo(); const r=newRow(cat,depth,parentId,name); ds.added.push(r); logChange({version:curVer,region:curRegion,path:r.path,field:'—',oldVal:'',newVal:'(新增菜单项)',type:'add'}); persist(); rebuildColumns(ds); render(); refreshDrawerIfOpen(); $('#addDlg').style.display='none'; toast('已新增:'+name); }

/* ---------- column chooser ---------- */
function renderColMenu(){ const ds=curDS(); const custom=new Set((ds&&ds.customCols)||[]);
  const menu=$('#colMenu');
  menu.innerHTML=COLS.map(c=>{ const isCustom=custom.has(c.key); const del=isCustom?`<span class="coldel" data-delcol="${esc(c.key)}" title="删除此列">✕</span>`:''; const dis=(c.kind==='level'||c.kind==='meta')?'disabled':''; return `<label class="ci"><input type="checkbox" data-key="${esc(c.key)}" ${visible[c.key]?'checked':''} ${dis}> <span class="citxt">${esc(c.title)}${isCustom?' <em>(自定义)</em>':''}</span>${del}</label>`; }).join('');
  menu.querySelectorAll('input').forEach(cb=>cb.onchange=()=>{ visible[cb.dataset.key]=cb.checked; render(); });
  menu.querySelectorAll('.coldel').forEach(x=>x.onclick=e=>{ e.preventDefault(); e.stopPropagation(); const k=x.dataset.delcol; if(!confirm('删除自定义列「'+k+'」及其所有已填内容?')) return; ds.customCols=ds.customCols.filter(c=>c!==k); baseRows(ds).forEach(r=>{ if(ds.edits[r.id]) delete ds.edits[r.id][k]; }); (ds.added||[]).forEach(r=>delete r.fields[k]); persist(); rebuildColumns(ds); render(); renderColMenu(); toast('已删除列:'+k); }); }

/* ---------- seed: preload V6.0 from embedded SEED_V6 ---------- */
function seedV6(){
  // SEED_V6 is the parsed menu_data.json (trees with region/category/roots)
  STORE.versions=[{id:'v_seed',name:'V 6.0'}];
  // Keep seed headers exactly as their source workbook supplied them.  Canonical
  // aliases are only used by diagnostic logic; table columns must never merge.
  const normNode=n=>{ n.fields=Object.assign({},n.fields||{}); (n.children||[]).forEach(normNode); };
  const groups={'海外':[],'国内':[]};
  SEED_V6.trees.forEach(t=>{
    const region=/海外/.test(t.region)?'海外':'国内';
    t.roots.forEach(normNode);
    addPaths(t.roots,[t.category]);
    const sheet=t.region.includes('·')?t.sheet+'〔'+t.region.split('·')[1]+'〕':t.sheet;
    groups[region].push({sheet, category:t.category, roots:t.roots, node_count:countNodes(t.roots)});
  });
  REGIONS.forEach(r=>{ const ds=ensureDS('V 6.0',r); ds.trees=groups[r]; });
  curVer='V 6.0';
}

function initSideResizer(){
  const side=$('.vside'),handle=$('#sideResizer');
  STORE.ui=STORE.ui||{}; const saved=+STORE.ui.sidebarWidth; if(saved>=180&&saved<=620){side.style.width=saved+'px';side.style.flexBasis=saved+'px';}
  handle.onmousedown=e=>{e.preventDefault();const startX=e.clientX,startW=side.getBoundingClientRect().width;document.body.classList.add('resizing-side');const move=ev=>{const w=Math.max(180,Math.min(620,startW+ev.clientX-startX));side.style.width=w+'px';side.style.flexBasis=w+'px';};const up=ev=>{const w=Math.max(180,Math.min(620,startW+ev.clientX-startX));STORE.ui.sidebarWidth=Math.round(w);persist();document.body.classList.remove('resizing-side');window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);};
}

function resetFilters(){ $('#fSheet').selectedIndex=0;const ds=curDS();if(ds){ds.ui=ds.ui||{};ds.ui.viewSheet=$('#fSheet').value;persist();}$('#fDepth').value='(全部)';$('#fSearch').value=''; sortKey=null; render(); }
function discardLocalChanges(){ const ds=curDS(); if(!ds||!totalChanges(ds)){toast('当前版本没有改动');return;} if(confirm('丢弃「'+curVer+'·'+curRegion+'」的所有本地改动（编辑、新增、删除行和原始 Sheet 单元格修改）？')){ ds.edits={};ds.added=[];ds.deleted={};ds.sheetEdits={};ds.ts={}; persist(); render(); updateChgBadge(ds); refreshDrawerIfOpen(); toast('已丢弃该版本原始数据后的本地改动'); } }
function setFormatBarVisible(show){ const bar=$('#formatBar');if(!bar)return;bar.hidden=!show; }
function closeToolsMenu(){ const menu=$('#toolsMenu'),btn=$('#toolsMenuBtn');if(menu)menu.classList.remove('show');if(btn)btn.setAttribute('aria-expanded','false'); }
function runTool(action){
  closeToolsMenu();
  ({
    reset:resetFilters,raw:openRawSheets,copy:copyCurrentVersion,search:openGlobalSearch,
    health:()=>{ $('#hcVer').textContent=curVer+' · '+curRegion; runHealthCheck(); },sync:openBatchSync,
    history:openHistory,format:()=>{if(!selectedCell){toast('请先单击选择一个单元格');return;}setFormatBarVisible(true);updateFormatToolbar();},
    'hide-column':deleteSelectedColumn,
    discard:discardLocalChanges,purge:purgeCurrentContent
  })[action]?.();
}

/* ---------- init ---------- */
async function init(){
  try{ await IDB.open(); const s=await IDB.get('store'); if(s&&s.versions&&s.versions.length){ STORE=s; STORE.history=STORE.history||[]; const repaired=repairVersionTree(); curVer=STORE.versions[0].name; if(repaired.length)setTimeout(()=>toast('已恢复 '+repaired.length+' 个历史悬挂版本到根级'),0); } else { seedV6(); persist(); } }
  catch(e){ console.warn('IDB unavailable, seeding in-memory',e); seedV6(); }
  initSideResizer();
  // wire region tabs
  $$('#regionTabs .rtab').forEach(t=>t.onclick=()=>{ curRegion=t.dataset.r; if(curVer)ensureDS(curVer,curRegion); rebuildForCurrent(); render(); });
  // filters
  let deb; $('#fSearch').oninput=()=>{clearTimeout(deb);deb=setTimeout(render,120);};
  $('#fDepth').onchange=render; $('#fSheet').onchange=()=>{const ds=curDS();if(ds){ds.ui=ds.ui||{};ds.ui.viewSheet=$('#fSheet').value;refreshLevelFilter(ds,$('#fSheet').value);persist();}render();};
  // toolbar buttons
  $('#colBtn').onclick=e=>{ e.stopPropagation(); renderColMenu(); $('#colMenu').classList.toggle('show'); };
  document.addEventListener('click',e=>{ const m=$('#colMenu'); if(m&&!m.contains(e.target)&&e.target!==$('#colBtn')) m.classList.remove('show'); });
  $('#toolsMenuBtn').onclick=e=>{e.stopPropagation();const menu=$('#toolsMenu'),open=!menu.classList.contains('show');menu.classList.toggle('show',open);$('#toolsMenuBtn').setAttribute('aria-expanded',String(open));};
  $('#toolsMenu').querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>runTool(b.dataset.tool));
  document.addEventListener('click',e=>{if(!e.target.closest('.toolmenu'))closeToolsMenu();});
  $('#addBtn').onclick=openAddDialog; $('#adOk').onclick=confirmAdd; $('#adCancel').onclick=()=>$('#addDlg').style.display='none';
  $('#deleteRowBtn').onclick=deleteSelectedRows;
  $('#rawClose').onclick=()=>$('#rawDlg').style.display='none'; $('#rawDownload').onclick=downloadOriginalFile;
  $('#colorPicker').querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>chooseColor(b.dataset.color));
  $('#customColor').onchange=e=>chooseColor(e.target.value);
  $('#clearColor').onclick=()=>chooseColor('');
  $('#fmtBold').onclick=()=>toggleFormat('bold'); $('#fmtItalic').onclick=()=>toggleFormat('italic'); $('#fmtUnderline').onclick=()=>toggleFormat('underline'); $('#fmtStrike').onclick=()=>toggleFormat('strike');
  $('#fmtTextColor').onchange=e=>setFormat('color',e.target.value); $('#fmtBgColor').onchange=e=>{if(!selectedCell){toast('请先单击选择一个单元格');return;}setCellColor(selectedCell.id,selectedCell.key,e.target.value);};
  document.querySelectorAll('[data-preset-bg]').forEach(b=>b.onclick=()=>applyPresetBg(b.dataset.presetBg));
  document.querySelectorAll('[data-align]').forEach(b=>b.onclick=()=>setFormat('align',b.dataset.align)); $('#fmtClear').onclick=clearFormat;
  document.addEventListener('click',e=>{if(!e.target.closest('#colorPicker'))closeColorPicker();});
  $('#cmSave').onclick=saveColumnMark;$('#cmClear').onclick=clearColumnMark;
  document.addEventListener('click',e=>{if(!e.target.closest('#colMarkPicker')&&!e.target.closest('th[data-key]'))closeColumnMark();});
  $('#undoBtn').onclick=undo; $('#redoBtn').onclick=redo;
  document.addEventListener('keydown',e=>{ if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){ if(document.querySelector('.cellinput'))return; e.preventDefault(); undo(); } if((e.metaKey||e.ctrlKey)&&(e.key.toLowerCase()==='y'||(e.shiftKey&&e.key.toLowerCase()==='z'))){ if(document.querySelector('.cellinput'))return; e.preventDefault(); redo(); } });
  $('#changesBtn').onclick=()=>toggleDrawer(); $('#chgClose').onclick=()=>toggleDrawer(false);
  $('#histClose').onclick=()=>$('#histDrawer').classList.remove('show');
  $('#histVerFilter').onchange=renderHistory; $('#histExport').onclick=exportHistory;
  $('#syncOk').onclick=confirmSync; $('#syncCancel').onclick=()=>{ $('#syncDlg').style.display='none'; pendingSync=null; };
  $('#syncList').onchange=()=>{ const any=[...$('#syncList').querySelectorAll('input:checked:not(:disabled)')].length; $('#syncOk').disabled=!any; };
  $('#exportMenuBtn').onclick=e=>{e.stopPropagation();$('#exportList').classList.toggle('show');};
  $('#exportList').querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>{const t=b.dataset.export;({xlsx:exportXlsx,'xlsx-full':exportFullExcel,md:exportMarkdown,js:exportJavaScript,json:exportJson}[t])();$('#exportList').classList.remove('show');});
  document.addEventListener('click',e=>{if(!e.target.closest('.exportmenu'))$('#exportList').classList.remove('show');});
  $('#versionMenu').querySelectorAll('[data-vm]').forEach(b=>b.onclick=()=>runVersionMenu(b.dataset.vm));
  document.addEventListener('click',e=>{if(!e.target.closest('#versionMenu'))closeVersionMenu();});
  $('#deleteVersionCancel').onclick=closeDeleteVersionDialog;
  $('#deleteVersionPromote').onclick=()=>commitVersionDelete('promote');
  $('#deleteVersionBranch').onclick=()=>{if(!pendingVersionDelete)return;const count=pendingVersionDelete.all.length;if(confirm(`确定永久删除整个分支（${count} 个版本）？此操作不可撤销，建议先备份工程。`))commitVersionDelete('branch');};
  $('#deleteVersionDlg').onclick=e=>{if(e.target===e.currentTarget)closeDeleteVersionDialog();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pendingVersionDelete)closeDeleteVersionDialog();});
  // version add
  $('#addVerBtn').onclick=()=>{ const n=prompt('新版本名称(如 V 5.2 / FTV EU / STAR项目):'); if(n&&n.trim()) addVersion(n.trim()); };
  // backup / restore / diff
  $('#backupBtn').onclick=backupProject;
  $('#restoreBtn').onclick=()=>$('#projFile').click();
  $('#projFile').onchange=async e=>{ const f=e.target.files[0]; if(f) await restoreProject(f); e.target.value=''; };
  $('#diffBtn').onclick=openDiff;
  $('#diffClose').onclick=()=>$('#diffDlg').style.display='none';
  $('#diffRun').onclick=runDiff;
  $('#diffResult').onclick=e=>{const btn=e.target.closest('[data-diff-jump]');if(btn)jumpToDiffTarget(+btn.dataset.diffJump);};
  // dialogs and advanced tools
  $('#gsClose').onclick=()=>$('#gsDlg').style.display='none';
  $('#gsRun').onclick=runGlobalSearch; let gd; $('#gsInput').oninput=()=>{clearTimeout(gd);gd=setTimeout(runGlobalSearch,180);};
  $('#hcClose').onclick=()=>$('#hcDlg').style.display='none';
  $('#bsCancel').onclick=()=>$('#bsDlg').style.display='none'; $('#bsRun').onclick=runBatchSync;
  // import
  $('#importBtn').onclick=()=>$('#fileInput').click();
  $('#fileInput').onchange=async e=>{ const files=[...e.target.files]; if(!files.length)return; const btn=$('#importBtn');const old=btn.textContent;btn.disabled=true;btn.textContent='正在导入…';try{await importFiles(files);}catch(err){console.error('Excel import failed',err);toast('导入失败：'+(err&&err.message||'文件无法解析，请确认是有效 Excel 文件'));}finally{btn.disabled=false;btn.textContent=old;e.target.value='';} };
  window.addEventListener('resize',()=>{ clearTimeout(window.__rz); window.__rz=setTimeout(applyFreeze,120); });
  rebuildForCurrent(); renderVersions(); render();
}
// expose internals for e2e testing
if(typeof window!=='undefined'){ window.__init=init; window.__t={get STORE(){return STORE;},set STORE(v){STORE=v;},get curVer(){return curVer;},get curDS(){return curDS;},get liveRows(){return liveRows;},get rowFieldVal(){return rowFieldVal;},get renderVersions(){return renderVersions;},get selectedRowIds(){return selectedRowIds;},get selectedColumn(){return selectedColumn;},parseWorkbook,rawSheetFromWorksheet,deleteSelectedRows,deleteSelectedColumn,selectColumn,purgeCurrentContent,openVersionMenu,runVersionMenu,rebuildColumns,render,setFormat,applyPresetBg,clearFormat,dsKey,versionChildren,versionDescendants,repairVersionTree,openDeleteVersionDialog,commitVersionDelete}; }
if(typeof indexedDB!=='undefined'||typeof window!=='undefined') init();
