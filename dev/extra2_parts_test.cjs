// 追加分2 (upstream v0.12, 855 parts) taken in as ordinary parts: every one renders in its slot (landscape and portrait,
// Japanese and Latin lyrics), every one is offered by some theme (by its mood tags, its part set or 和風), names in
// both languages, and the fuzzy search finds a part by its name in the other language too.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const locale of ['', 'en/']){
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:8765/'+locale;await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..',locale,'index.html'))}):r.abort());await page.goto(url);
const en=!!locale;
const result=await page.evaluate(en=>{
 const failures=[],fail=m=>{if(failures.length<40)failures.push(m)},counts={},sets={},T=String.fromCharCode(10);
 const x2=[];for(const g of J.GROUP_KEYS)for(const id of J.order(g)){const d=J.registry(g)[id];if(d.x2){x2.push([g,id,d]);counts[g]=(counts[g]||0)+1;if(d.set&&d.set!=='extra2')sets[d.set]=(sets[d.set]||0)+1;if(d.wa)sets.wa=(sets.wa||0)+1;}}
 // packs: x2typo… / x2kinetic… / x2horror… join that part set; the rest have none (no 追加分2 switch here)
 for(const [g,id,d] of x2){const m=/^x2(typo|kinetic|horror)/.exec(d.pack);if(d.set!==(m?m[1]:'extra2'))fail('set '+g+':'+id+' '+d.set);}
 if(J.SETS.extra2)fail('no 追加分2 switch');
 // reachable from a theme
 const seen=new Set();
 for(const key of Object.keys(J.THEMES)){const p=J.defaultProject();p.themes=[key];const pool=J.themeCandidates(p,key);for(const g of J.GROUP_KEYS)for(const id of pool.lyrics[g])seen.add(g+':'+id);}
 for(const [g,id] of x2)if(!seen.has(g+':'+id))fail('unreachable '+g+':'+id);
 // themes keep their direction: the 文字PV theme offers 文字PV parts only (plus the neutral ones), 和風 offers 和風 parts
 {const p=J.defaultProject();const typo=J.themeCandidates(p,'typo'),wa=J.themeCandidates(p,'wa');
  for(const g of J.GROUP_KEYS){for(const id of typo.lyrics[g]){const d=J.registry(g)[id];if(d.x2&&d.set!=='typo')fail('typo theme '+g+':'+id);}
   for(const id of wa.lyrics[g]){const d=J.registry(g)[id];if(d.x2&&!d.wa)fail('wa theme '+g+':'+id);}}}
 // names: Japanese in the Japanese UI, the part's own English name in the English UI
 for(const [g,id,d] of x2){if(!d.name)fail('name '+g+':'+id);else if(en?(d.name!==d.en):!/[぀-ヿ㐀-鿿]/.test(d.name)&&d.name===d.en)fail('label '+g+':'+id+' '+d.name);}
 // fuzzy search: by the name shown, and by the other language's name
 {const [g,id,d]=x2.find(([g])=>g==='layout'),other=en?d.ja:d.en;
  if(!J.detailSearchQuery(d.name)(d.name+' '+id+' '+J.detailSearchAlt(id)))fail('search by name');
  if(!other||!J.detailSearchQuery(other)(d.name+' '+id+' '+J.detailSearchAlt(id)))fail('search by the other name '+other);}
 for(const [q,text] of [['ランプ','灯籠流し'],['lantern','灯籠流し'],['fold','角折れ'],['和風','japanese pattern'],['ink','墨の滲み'],['italic','斜体の残像']])if(!J.detailSearchQuery(q)(text))fail('vocabulary '+q+' → '+text);
 // every part renders in its slot
 const cv=document.createElement('canvas'),ctx=cv.getContext('2d'),renderer=new J.Renderer();
 for(const [aspect,w,h] of [['16:9',192,108],['9:16',108,192]])for(const lyric of ['記憶の向こう、夜を越えて','Hello world, still waiting']){
  cv.width=w;cv.height=h;
  for(const [g,id] of x2){
   try{
    const p=J.defaultProject();p.aspect=aspect;p.horror=true;p.durationOverride=8;p.lyrics=`[00:00]${lyric}${T}[00:04]夜を越えて`;
    const ov=g==='fx'?{}:{[g]:g==='decor'?[id]:id};p.overrides={0:ov,1:ov};
    const plan=J.plan(p);
    if(g==='fx')plan.events=[{id,type:id,t:0,dur:4,seed:1,amp:.6}];
    else if(g!=='layout'&&!plan.cuts.some(c=>g==='decor'?c.decor.some(x=>x.id===id):c[g]===id))fail('not applied '+g+':'+id);
    for(const t of [.08,1.5,3.95,4.1])renderer.frame(ctx,plan,t,{scale:w/plan.W,noHud:true});
   }catch(e){fail(aspect+' '+g+':'+id+': '+e.message);}
  }
 }
 // おまかせ with a theme still plans
 for(const key of ['typo','kinetic','horror','wa','pop','ballad'])for(let seed=1;seed<=3;seed++){const p=J.defaultProject();p.themes=[key];p.lyrics='[00:00]夜明けの色を覚えてる'+T+'[00:04]Hello world';const look=J.omakase(p,J.rng(seed));try{J.plan({...p,...look});}catch(e){fail('plan '+key+': '+e.message);}}
 return {total:x2.length,counts,sets,failures};
},en);
assert.deepEqual(result.failures,[]);assert.equal(result.total,855);assert.deepEqual(errors,[]);console.log(locale||'ja',JSON.stringify({total:result.total,counts:result.counts,sets:result.sets}));await page.close();}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
