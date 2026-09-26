const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
const page=await browser.newPage(),url='http://127.0.0.1:8765/';await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..','index.html'))}):r.abort());await page.goto(url);
const result=await page.evaluate(()=>{
const check=(ok,msg)=>{if(!ok)throw Error(msg)},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),errors=[];
let tested=0;
for(const layout of Object.keys(J.LAYOUTS).filter(k=>!['blank','interlude','title'].includes(k))){
const p=J.defaultProject();p.lyrics='[00:00]コピー元の長い文章\n[00:04]貼付先の違う文字です';p.durationOverride=8;p.overrides={0:{single:true,layout,enter:'cut',exit:'cut',trans:'none'},1:{single:true,layout:'center',enter:'cut',exit:'cut',trans:'none',area:{x:.2,y:.1,w:.6,h:.8,angle:12}}};
let plan=J.plan(p),source=plan.cuts.find(c=>c.line===0&&c.part===0),target=plan.cuts.find(c=>c.line===1&&c.part===0);
const payload=J.readCutEffects(JSON.stringify(J.cutEffectsPayload(source,'lyrics',plan)));J.pasteCutEffects(p,plan,'lyrics',target,payload);const next=J.plan(p),copied=next.cuts.find(c=>c.line===1&&c.part===0);
check(copied.text===target.text && same(copied.area,target.area),layout+': content/area');
for(const key of ['seed','layout','enter','exit','hold','decor','bg','bgP','cam','camP','treat','treatP','stagger'])check(same(source[key],copied[key]),layout+': '+key);
for(const [key,value] of Object.entries(source.params))if(!['chunks','msgs','units'].includes(key))check(same(value,copied.params[key]),layout+': params.'+key);
for(const key of ['chunks','msgs','units'])if(copied.params[key])check(!copied.params[key].join('').includes('コピー元'),layout+': leaked source lyrics');
const events=next.events.filter(e=>e.cutOwner==='1:0').map(({t,cutOwner,...e})=>({...e,offset:t-copied.start}));check(events.length===payload.details.effectEvents.filter(e=>copied.start+e.offset<copied.end).length,layout+': events');
// Draw both at the same local phase to catch missed rendering parameters.
if(['center','mixed','scatter'].includes(layout)){
const render=cut=>{const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;const ctx=canvas.getContext('2d');ctx.scale(480/plan.W,270/plan.H);const renderer=new J.Renderer();renderer.drawCut(renderer.makeEnv(ctx,plan,cut,plan.style.schemes[cut.scheme],{pass:'main',lt:.6,ltb:.6,t:.6,step:14,scale:480/plan.W,allowFilter:false}));return canvas.toDataURL()};
const sameText={...copied,text:source.text,lineText:source.lineText,words:source.words,note:source.note,area:source.area,line:source.line,part:source.part,start:source.start,end:source.end,dur:source.dur};check(render(source)===render(sameText),layout+': render differs');
}
tested++;
}
return {tested,errors};
});assert.ok(result.tested>50);console.log(result.tested,'layouts: exact parameters/seed, target text/area, events and representative pixel equality OK');await page.close();
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
