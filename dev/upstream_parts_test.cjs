const {chromium}=require('playwright'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const locale of ['', 'en/']){
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')errors.push(m.text());});const url='http://127.0.0.1:8765/'+locale;
await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..',locale,'index.html'))}):r.abort());await page.goto(url);
const result=await page.evaluate(()=>{
const failures=[],counts={},seen=new Set();
for(const [key,theme] of Object.entries(J.THEMES)){
 const p=J.defaultProject();p.themes=[key];const pool=J.themeCandidates(p,key);
 for(const g of J.GROUP_KEYS)for(const id of pool.lyrics[g])seen.add(g+':'+id);
 for(let seed=1;seed<=5;seed++) {const look=J.omakase(p,J.rng(seed));if(!pool.styles.includes(look.style))failures.push('style '+key);for(const g of J.GROUP_KEYS)for(const [id,on] of Object.entries(look.enabled[g]))if(on&&!pool.lyrics[g].includes(id))failures.push('pool '+key+id);J.plan({...p,...look});}
}
const cv=document.createElement('canvas');cv.width=320;cv.height=180;
for(const g of J.GROUP_KEYS)for(const id of J.order(g)){
 const def=J.registry(g)[id];if(!['typo','kinetic','horror'].includes(def.set))continue;counts[def.set]=(counts[def.set]||0)+1;
 if(!seen.has(g+':'+id))failures.push('unreachable '+g+':'+id);
 try {
 const p=J.defaultProject();p.horror=true;p.lyrics='[00:00]記憶の向こう Hello world\n[00:04]夜を越えて';p.overrides={0:{layout:'center',[g]:g==='decor'?[id]:id}};
 p.overrides[1]={...p.overrides[0]};
 const plan=J.plan(p),renderer=new J.Renderer();
 // Exercise every new part directly in its normal renderer slot.
 for(const c of plan.cuts){if(g==='decor')c.decor=[{id}];else if(g!=='layout')c[g]=id;}
 if(g==='fx')plan.events=[{id,type:id,t:0,dur:4,seed:1,amp:.6}];
 for(const t of [.08,1.5,3.9,4.05])renderer.frame(cv.getContext('2d'),plan,t,{scale:320/plan.W,noHud:true});
 }catch(e){failures.push(g+':'+id+': '+e.message);}
}
const p=J.defaultProject();if(J.randomOk(p,'layout','hrFlashlight'))failures.push('horror default');p.typo=false;if(J.randomOk(p,'layout','tyRuby'))failures.push('typo disabled');
return {counts,failures};
});assert.deepEqual(result.failures,[]);assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),153);assert.deepEqual(errors,[]);console.log(locale||'ja',result);await page.close();}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
