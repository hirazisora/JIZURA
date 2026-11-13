// Mask pack: the techniques sit in their own マスク category of the background effects (not the
// foreground's), おまかせ and themes can pick them for the background only, and each one draws a masked
// frame that differs from the plain shot without errors.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {timelineAction}=require('./ui_helpers.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const locale of ['', 'en/']){
const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const url='http://127.0.0.1:8765/'+locale;await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..',locale,'index.html'))}):r.abort());await page.goto(url);
const keys=await page.evaluate(()=>J.MEDIA_MASK_KEYS);assert.equal(keys.length,10);
// 詳細 → 背景の演出 has a マスク category with all of them; the foreground panel has none.
const panel=await page.evaluate(()=>{const group=document.querySelector('#mediaEffectsPanel [data-media-group="maskFx"]');return {name:group?.querySelector('.tg-name').textContent,items:[...(group?.querySelectorAll('[data-media-tech]')||[])].map(i=>i.dataset.mediaTech),foreground:document.querySelectorAll('#foregroundEffectsPanel [data-media-group="maskFx"], #foregroundEffectsPanel [data-media-tech^="mask"]').length};});
assert.equal(panel.name,locale?'Masks':'マスク');assert.deepEqual(panel.items,keys);assert.equal(panel.foreground,0);
// A background cut and a foreground cut, each with only the mask techniques enabled.
const picks=await page.evaluate(()=>{
 for(const [id,color] of [['bg','#335'],['fg','#e33']]){const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,400,300);g.fillStyle='#fc6';g.fillRect(150,100,100,100);J.mediaAssets.set(id,{element:c,type:'image'});}
 const P=J.defaultProject();P.lyrics='';P.durationOverride=24;
 for(const [layer,id] of [['media','bg'],['foreground','fg']]){
  const effects=J.mediaEffectSettings(P,layer);effects.enabled=Object.fromEntries(Object.keys(J.MEDIA_TECH).map(k=>[k,J.MEDIA_MASK_KEYS.includes(k)]));
  P[layer]={...P[layer],effects,items:[{id,name:id+'.png',type:'image',width:400,height:300}],manualCuts:true,cutCount:6,timing:{lineTimes:{0:0,1:4,2:8,3:12,4:16,5:20}},cutOverrides:Object.fromEntries([0,1,2,3,4,5].map(i=>[i,{itemId:id,technique:null}]))};
 }
 // A manual mask technique on the foreground falls back to the automatic pick too.
 P.foreground.cutOverrides[0].technique='maskRings';
 J.ui.project=P;J.uiApi.syncUI();J.uiApi.replan();
 return {media:J.ui.plan.media.cuts.map(c=>c.technique),foreground:J.ui.plan.foreground.cuts.map(c=>c.technique)};
});
assert.ok(picks.media.every(k=>keys.includes(k)),'background uses the mask pool: '+picks.media);
assert.ok(picks.foreground.every(k=>!keys.includes(k)),'foreground never uses masks: '+picks.foreground);
// The per-cut technique lists offer them for the background only.
const lists=await page.evaluate(()=>{const has=layer=>{const cut=layer==='media'?'#sourceMedia':'#sourceForeground';document.querySelector(cut).click();return [...document.querySelectorAll('#mediaLineList .media-technique option')].some(o=>o.value.startsWith('mask'));};return {media:has('media'),foreground:has('foreground')};});
assert.deepEqual(lists,{media:true,foreground:false});
// おまかせ enables some of them, and every theme offers some to the background.
const random=await page.evaluate(()=>{const P=J.ui.project;let on=0;for(let i=0;i<20;i++){const s=J.randomMediaEffectSettings(P,'media',J.rng(i+1));on+=J.MEDIA_MASK_KEYS.filter(k=>s.enabled[k]).length;}return on;});
assert.ok(random>0);
const themed=await page.evaluate(()=>['pop','ballad','dance','cool','elegant'].map(key=>J.themeCandidates(J.ui.project,key).media.filter(id=>J.MEDIA_MASK_KEYS.includes(id)).length));
assert.ok(themed.every(n=>n>0),'themes offer masks: '+themed);
// Each technique draws something different from the unmasked shot, all through the cut.
const drawn=await page.evaluate(keys=>{
 const plan=J.ui.plan,cut=plan.media.cuts[0],c=document.createElement('canvas');c.width=192;c.height=108;const x=c.getContext('2d');
 const snap=(technique,q)=>{x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,192,108);const k={...cut,technique,treat:J.MEDIA_TECH[technique]?.treat||'none',enter:'cut',exit:'cut'};x.save();x.translate(96,54);J.paintMediaEffect(x,J.mediaAssets.get('bg').element,[192,108],k,q,1,1);x.restore();return x.getImageData(0,0,192,108).data;};
 const out={};for(const key of keys){let diff=0;for(const q of [.2,.5,.8]){const a=snap(key,q),b=snap('none',q);for(let i=0;i<a.length;i+=4)diff+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);}out[key]=diff;}
 return out;
},keys);
for(const key of keys)assert.ok(drawn[key]>0,key+' draws a masked frame');
// The ▶ preview of a mask technique shows it on the background sample.
const preview=await page.evaluate(()=>{const plan=J.makeEffectPreviewPlan('media','maskRings','media','bg',{motion:1,treatment:1,duration:.45});return (plan.media?.cuts||[]).map(c=>c.technique);});
assert.ok(preview.includes('maskRings'),'preview plan uses the mask: '+preview);
// With a theme set, おまかせ turns on that theme's masks for the background and none for the foreground.
const themedOmakase=await page.evaluate(()=>{const P={...J.ui.project,themes:['ballad']};let bg=0,fg=0;for(let i=0;i<10;i++){const look=J.omakase(P,J.rng(i+7));bg+=J.MEDIA_MASK_KEYS.filter(k=>look.media.effects.enabled[k]).length;fg+=J.MEDIA_MASK_KEYS.filter(k=>look.foreground.effects.enabled[k]).length;}return {bg,fg};});
assert.ok(themedOmakase.bg>0,'themed おまかせ enables background masks');assert.equal(themedOmakase.fg,0);
// Fuzzy search in the cut details finds them by category, synonym or English name.
await timelineAction(page,'[data-layer="media"]','details');await page.locator('#cutDetailsDialog [data-detail-tab="motion"]').click();await page.locator('#cutDetailsDialog [data-detail-field="technique"]').click();
const search=page.locator('.detail-search-popup input'),found=async query=>{await search.fill(query);return page.locator('.detail-search-option').evaluateAll(els=>els.map(e=>e.dataset.value));};
const byCategory=await found(locale?'mask':'マスク');assert.ok(keys.every(k=>byCategory.includes(k)),'category search: '+byCategory);
for(const [query,key] of [['レターボックス','maskCinemascope'],['letterbox','maskCinemascope'],['多重露光','maskDoubleExposure'],['視差','maskSlashParallax'],['shutter','maskShutterBeat'],['ウィンドウ','maskBeatWindows'],['rings','maskRings']])assert.ok((await found(query)).includes(key),query+' finds '+key);
await search.press('Escape');await page.locator('#cutDetailsDialog').getByRole('button',{name:locale?'Cancel':'キャンセル',exact:true}).click();
assert.deepEqual(errors,[]);console.log(locale||'ja','mask category, background-only pool, おまかせ, themes and drawing passed');await page.close();}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
