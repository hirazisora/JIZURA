const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
const root=path.join(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const lang of ['','en/']){const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://localhost:8765/'+lang;await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,lang,'index.html'))}):r.abort());await page.goto(url);
const result=await page.evaluate(()=>{
const failures=[],check=(ok,m)=>{if(!ok)failures.push(m)},warnings=[],warn=console.warn;console.warn=(...a)=>warnings.push(a.map(String).join(' '));
try{
const setup=(layer,overrides,decor,decorEnabled)=>{const p=J.defaultProject(),m=p[layer];m.items=[{id:'a',name:'a.png',type:'image',width:160,height:90},{id:'b',name:'b.png',type:'image',width:160,height:90}];m.manualCuts=true;m.cutCount=overrides.length;m.timing.lineTimes=Object.fromEntries(overrides.map((_,i)=>[i,i*2]));m.cutOverrides=Object.fromEntries(overrides.map((o,i)=>[i,{itemId:i%2?'b':'a',entrance:'none',departure:'none',...o}]));m.effects={...J.mediaEffectSettings(p,layer),decor,...(decorEnabled?{decorEnabled}:{})};return p;};
const cuts=(p,layer)=>{const plan=J.plan(p);return J.planMedia(p,plan,null,layer).cuts;};
for(const layer of ['foreground','media']){
 check(J.mediaEffectSettings(J.defaultProject(),layer).decor===true&&J.mediaEffectSettings({[layer]:{effects:{decor:false}}},layer).decor===false,layer+' default on, can be turned off');
 const autos=Array.from({length:12},()=>({technique:null}));
 check(cuts(setup(layer,autos,false),layer).every(c=>Array.isArray(c.decor)&&!c.decor.length),layer+' off gives no decor');
 const on=cuts(setup(layer,autos,true),layer),pool=J.mediaDecorCandidates(J.defaultProject(),layer);
 check(pool.length>10&&pool.every(k=>J.DECOR[k].layer==='front'),layer+' front-only pool');
 check(on.every(c=>c.decor.length>=1&&c.decor.length<=2&&c.decor.every(d=>pool.includes(d.id))),layer+' auto decor '+JSON.stringify(on.map(c=>c.decor.map(d=>d.id))));
 check(new Set(on.map(c=>c.decor.map(d=>d.id).join())).size>3,layer+' varied');
 check(JSON.stringify(on.map(c=>c.decor))===JSON.stringify(cuts(setup(layer,autos,true),layer).map(c=>c.decor)),layer+' deterministic');
 const mixed=cuts(setup(layer,[{technique:'kenBurns'},{technique:'none'},{technique:null}],true),layer);
 check(!mixed[0].decor.length&&!mixed[1].decor.length&&mixed[2].decor.length,layer+' explicit/none stay plain');
 // The layer's own decoration checks decide; back decorations join once checked.
 const only=id=>Object.fromEntries(J.order('decor').map(k=>[k,k===id]));
 check(cuts(setup(layer,autos,true,only('brackets')),layer).every(c=>c.decor.length===1&&c.decor[0].id==='brackets'),layer+' follows layer decor checks');
 const back=J.order('decor').find(k=>J.DECOR[k]?.layer==='back'&&J.randomOk(J.defaultProject(),'decor',k));
 check(cuts(setup(layer,autos,true,only(back)),layer).every(c=>c.decor.length===1&&c.decor[0].id===back),layer+' checked back decor '+back);
 check(J.mediaDecorCandidates(J.defaultProject(),layer).every(k=>J.DECOR[k].layer==='front'),layer+' back off by default');
 check(!JSON.stringify(on[0]).includes('decorStage'),layer+' stage not serialized');
}
// Layers are independent, and Randomize / themes set the decoration checks.
{const p=J.defaultProject();p.foreground.effects={...J.mediaEffectSettings(p,'foreground'),decorEnabled:Object.fromEntries(J.order('decor').map(k=>[k,k==='brackets']))};
 check(J.mediaDecorCandidates(p,'foreground').join()==='brackets'&&J.mediaDecorCandidates(p,'media').length>10,'independent layers');
 for(let seed=1;seed<=20;seed++){const s=J.randomMediaEffectSettings(p,'media',J.rng(seed));const on=Object.keys(s.decorEnabled).filter(k=>s.decorEnabled[k]);check(on.length>0&&on.every(k=>J.DECOR[k].layer==='front'),'randomize decor '+seed);}
 for(const id of Object.keys(J.THEMES)){const q=J.defaultProject();q.themes=[id];const look=J.omakase(q,J.rng(4));for(const layer of ['foreground','media']){const e=look[layer].effects.decorEnabled;check(Object.keys(e).every(k=>!e[k]||(look.enabled.decor[k]&&J.DECOR[k].layer==='front')),id+' theme decor '+layer);}}}
// Effect copy/paste carries media decorations and rejects unknown ones.
{const p=setup('media',[{technique:null},{technique:'kenBurns'}],true),plan=J.plan(p);plan.media=J.planMedia(p,plan,null,'media');const from=plan.media.cuts[0];
 const payload=J.readCutEffects(JSON.stringify(J.cutEffectsPayload(from,'media',plan)));check(JSON.stringify(payload.details.decor)===JSON.stringify(from.decor)&&from.decor.length>0,'payload decor');
 J.pasteCutEffects(p,plan,'media',plan.media.cuts[1],payload);const again=J.plan(p);check(JSON.stringify(J.planMedia(p,again,null,'media').cuts[1].decor)===JSON.stringify(from.decor),'pasted decor');
 let rejected=false;try{J.readCutEffects(JSON.stringify({format:'jizura-cut-effects',version:1,kind:'media',details:{decor:[{id:'noSuchDecor'}]},native:{}}));}catch(e){rejected=true;}check(rejected,'unknown decor rejected');}
// Rendering: every decoration draws without errors; back ones sit under an opaque source, front ones over it.
const src=document.createElement('canvas');src.width=160;src.height=90;src.getContext('2d').fillStyle='#e33';src.getContext('2d').fillRect(0,0,160,90);
const out=document.createElement('canvas');out.width=640;out.height=360;const ctx=out.getContext('2d');
const base=cuts(setup('media',[{technique:null}],true),'media')[0];
const paint=(decor,p=.5)=>{const c={...base,hold:'still',treat:'none',enter:'cut',exit:'cut',decor};Object.defineProperty(c,'decorStage',{value:base.decorStage});ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,640,360);ctx.translate(320,180);J.paintMediaEffect(ctx,src,[320,180],c,p,1,1);ctx.setTransform(1,0,0,1,0,0);return ctx.getImageData(0,0,640,360).data;};
const plain=paint([]),inside=(d,x0=180,y0=100,x1=460,y1=260)=>{for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){const i=(y*640+x)*4;if(Math.abs(d[i]-plain[i])+Math.abs(d[i+1]-plain[i+1])+Math.abs(d[i+2]-plain[i+2])>6)return true;}return false;};
let drew=0,total=0;const drawn=new Set();
for(const id of J.order('decor')){const D=J.DECOR[id];if(!D)continue;total++;const rng=J.rng(5);const params={id,seed:12345,n:3,right:true,low:false,accent:true,corner:true,big:true,mode:'count',from:1,to:99,v:2,r:.4};
 let any=false;for(const p of [.3,.5,.7]){const d=paint([params],p);if(d.some((v,i)=>v!==plain[i]))any=true;if(D.layer==='back'&&inside(d))failures.push('back decor over source '+id);}
 if(any){drew++;drawn.add(id);}}
const silent=J.mediaDecorCandidates(J.defaultProject(),'media').filter(id=>J.DECOR[id].layer==='front'&&!drawn.has(id));check(!silent.length,'media decorations that draw nothing '+silent.join(' '));check(drew>=total*.6,'decorations drawn '+drew+'/'+total);
// Front decorations hug the frame edges, so look at the whole frame (160..480 × 90..270).
check(J.order('decor').filter(id=>J.DECOR[id]?.layer==='front').some(id=>inside(paint([{id,seed:1,n:2,corner:true,big:true,accent:true}]),160,90,480,270)),'front decor over source');
check(warnings.filter(w=>w.includes('media decor')).length===0,'decor warnings '+warnings.filter(w=>w.includes('media decor')).slice(0,3));
}finally{console.warn=warn}
return failures;});
assert.deepEqual(result,[]);
// UI: the option sits in Details → Foreground / Background, on by default; manual decor via cut details.
await proMode(page);
for(const layer of ['foreground','media']){
 await page.locator(`[data-tab="${layer}Fx"]`).click();const box=page.locator(`#${layer}EffectsPanel [data-media-setting="decor"]`);
 assert.equal(await box.isChecked(),true);assert.ok((await box.locator('xpath=..').textContent()).startsWith(lang?'Enable decorations':'装飾を有効にする'));
 await box.uncheck();assert.equal(await page.evaluate(layer=>J.ui.project[layer].effects.decor,layer),false);await box.check();assert.equal(await page.evaluate(layer=>J.ui.project[layer].effects.decor,layer),true);await box.uncheck();
 const group=page.locator(`#${layer}EffectsPanel [data-media-group="decor"]`);assert.equal((await group.locator('.tg-name').textContent()),lang?'Decoration':'装飾');await group.locator('summary').click();
 const front=await page.evaluate(()=>J.order('decor').filter(k=>J.DECOR[k]).map(k=>J.DECOR[k].layer==='front'));assert.deepEqual(await group.locator('[data-media-decor]').evaluateAll(els=>els.map(e=>e.checked)),front);
 assert.equal(await group.locator('.tg-cnt').textContent(),front.filter(Boolean).length+'/'+front.length);
 await group.locator('[data-media-decor="brackets"]').uncheck();assert.equal(await page.evaluate(layer=>J.ui.project[layer].effects.decorEnabled.brackets,layer),false);
 await group.locator('[data-media-group-action="off"]').click();assert.equal(await page.locator(`#${layer}EffectsPanel [data-media-group="decor"] .tg-cnt`).textContent(),'0/'+front.length);
}
await page.evaluate(()=>{const p=J.ui.project;const img=document.createElement('canvas');img.width=160;img.height=90;J.mediaAssets.set('md',{element:img,type:'image'});p.media={...p.media,items:[{id:'md',name:'md.png',type:'image',width:160,height:90}],manualCuts:true,cutCount:1,timing:{lineTimes:{0:0}},cutOverrides:{0:{itemId:'md',technique:'kenBurns'}}};J.uiApi.syncUI();J.uiApi.replan();});
await timelineAction(page,'[data-layer="media"]','details');
const modal=page.locator('#cutDetailsDialog');const section=modal.locator('[data-detail-section="decor"]');
// Cut details are split into tabs: open the one that holds the decorations.
const panel=await section.evaluate(e=>e.closest('.cut-details-tab-panel')?.id);if(panel)await modal.locator(`[role=tab][aria-controls="${panel}"]`).click();
if(await section.evaluate(e=>e.tagName==='DETAILS'))await section.locator('summary').first().click();
await section.getByRole('button',{name:lang?'Add decoration':'装飾を追加'}).click();
await modal.getByRole('button',{name:lang?'Apply':'適用',exact:true}).click();
const saved=await page.evaluate(()=>({details:J.ui.project.media.cutOverrides[0].details?.decor?.length,plan:J.ui.plan.media.cuts[0].decor.length}));
assert.deepEqual(saved,{details:1,plan:1});
assert.deepEqual(errors,[]);console.log(lang||'ja','media decor passed');await page.close();}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
