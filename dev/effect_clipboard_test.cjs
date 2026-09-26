const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const locale of ['', 'en/']){
const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const url='http://127.0.0.1:8765/'+locale;await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..',locale,'index.html'))}):r.abort());await page.goto(url);
await page.evaluate(()=>{
window.testClipboard='';window.denyClipboard=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.denyClipboard||window.denyWriteOnly)throw Error('denied');window.testClipboard=text},readText:async()=>{if(window.denyClipboard)throw Error('denied');return window.testClipboard}}});
const p=J.defaultProject();p.lyrics='[00:00]元の歌詞\n[00:04]貼り付け先の長い歌詞';p.durationOverride=8;
p.overrides={0:{area:{x:.1,y:.1,w:.7,h:.5,angle:30}},1:{area:{x:.4,y:.6,w:.4,h:.3,angle:-20}}};
p.lyricCutOptions={'0:0':{blend:'screen',opacity:43,details:{layout:'center',enter:'wipe',hold:'still',exit:'blur',treat:'none',bg:'none',cam:'push',trans:'none'}},'1:0':{details:{text:'本文は維持する',area:{x:.4,y:.6,w:.4,h:.3,angle:-20}}}};
for(const layer of ['foreground','media'])p[layer]={...p[layer],manualCuts:true,cutCount:1,cutOverrides:{0:{technique:layer==='foreground'?'beatPulse':'none',placement:{cx:layer==='foreground'?.2:.7,cy:.5,w:.3,h:.4,angle:layer==='foreground'?10:40,lockAspect:false},details:{effectSettings:{motion:1.6,treatment:.8,duration:.7}}}},timing:{lineTimes:{0:0}}};
J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();J.uiApi.seek(.2);
});
await page.evaluate(()=>J.uiApi.flushSave());await page.reload();await page.evaluate(()=>{
window.testClipboard='';window.denyClipboard=false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.denyClipboard||window.denyWriteOnly)throw Error('denied');window.testClipboard=text},readText:async()=>{if(window.denyClipboard)throw Error('denied');return window.testClipboard}}});J.uiApi.seek(.2);
});
await page.locator('#modePro').click();const cuts=page.locator('.lyric-cut-option');
const target=await page.evaluate(()=>JSON.parse(JSON.stringify(J.ui.plan.cuts.find(c=>c.line===1&&c.part===0))));
await cuts.first().locator('.effect-copy').click();await page.waitForFunction(()=>window.testClipboard.length>0);
const payload=await page.evaluate(()=>JSON.parse(window.testClipboard));assert.equal(payload.kind,'lyrics');assert.equal(payload.details.area,undefined);assert.equal(payload.details.text,undefined);assert.ok(payload.details.params);assert.ok(Number.isFinite(payload.details.seed));assert.ok(Array.isArray(payload.details.effectEvents));assert.ok(payload.details.fonts);assert.ok(payload.details.palette);assert.ok(payload.details.fontParams.length);
await page.evaluate(()=>{J.ui.project.fonts.display='mono';J.ui.project.colors={enabled:true,bg:'#ffffff',fg:'#112233',accent:'#998877'};J.uiApi.replan()});
await page.locator('.lyric-cut-option[data-line="1"][data-part="0"] .effect-paste').click();await page.waitForFunction(()=>J.ui.project.lyricCutOptions['1:0'].opacity===43);
const pasted=await page.evaluate(()=>JSON.parse(JSON.stringify(J.ui.plan.cuts.find(c=>c.line===1&&c.part===0))));assert.deepEqual(pasted.area,target.area);assert.equal(pasted.text,target.text);assert.equal(pasted.start,target.start);assert.equal(pasted.end,target.end);assert.equal(pasted.enter,'wipe');assert.equal(pasted.opacity,43);assert.deepEqual(pasted.params,payload.details.params);assert.equal(pasted.seed,payload.details.seed);assert.deepEqual(pasted.effectEvents,payload.details.effectEvents);assert.deepEqual(pasted.fonts,payload.details.fonts);assert.deepEqual(pasted.palette,payload.details.palette);assert.equal(pasted.params.font,payload.details.fontParams.find(e=>e.path.join('.')==='font').font);
await page.locator('#btnUndo').click();assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['1:0'].opacity),undefined);await page.locator('#btnRedo').click();assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['1:0'].opacity),43);
const snapshot=await page.evaluate(()=>JSON.stringify(J.ui.project));await page.evaluate(()=>window.testClipboard='ordinary text');await page.locator('.lyric-cut-option[data-line="1"] .effect-paste').first().click();assert.equal(await page.evaluate(()=>JSON.stringify(J.ui.project)),snapshot);
// Clipboard permission denial still permits explicit copy/paste within this page.
await page.evaluate(()=>window.denyWriteOnly=true);await cuts.first().locator('.effect-copy').click();await page.locator('.lyric-cut-option[data-line="1"] .effect-paste').first().click();
await page.locator('#sourceForeground').click();await page.locator('#mediaLineList .effect-copy').first().click();await page.locator('#sourceMedia').click();const before=await page.evaluate(()=>({...J.ui.plan.media.cuts[0]}));
await page.locator('#mediaLineList .effect-paste').first().click();await page.waitForFunction(()=>J.ui.plan.media.cuts[0].technique==='beatPulse');const media=await page.evaluate(()=>J.ui.plan.media.cuts[0]);assert.deepEqual(media.placement,before.placement);assert.equal(media.itemId,before.itemId);assert.equal(media.start,before.start);assert.equal(media.end,before.end);assert.equal(media.effectSettings.motion,1.6);
await page.locator('#sourceLyrics').click();const beforeMismatch=await page.evaluate(()=>JSON.stringify(J.ui.project));await cuts.first().locator('.effect-paste').click();assert.equal(await page.evaluate(()=>JSON.stringify(J.ui.project)),beforeMismatch);
assert.ok(await page.locator('#timelineLinks [data-action="copy"][data-part="0"]').count()>0);assert.ok(await page.locator('#itemFrames [data-action="paste"]').count()>0);
await page.evaluate(()=>{const cv=document.createElement('canvas');cv.width=320;cv.height=180;for(const t of [.2,4.3])new J.Renderer().frame(cv.getContext('2d'),J.ui.plan,t,{scale:320/J.ui.plan.W});J.uiApi.flushSave()});
await page.reload();assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['1:0'].opacity),43);const pastedBefore=await page.evaluate(()=>JSON.parse(JSON.stringify(J.ui.project.lyricCutOptions['1:0'])));
const seedBefore=await page.evaluate(()=>J.ui.plan.cuts.find(c=>c.line===1&&c.part===0).seed);
await page.locator('#timelineLinks [data-action="dice"][data-layer="lyrics"][data-index="1"]').first().dispatchEvent('pointerdown');
assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['1:0'].details.seed),undefined);
assert.notEqual(await page.evaluate(()=>J.ui.plan.cuts.find(c=>c.line===1&&c.part===0).seed),seedBefore);
assert.deepEqual(await page.evaluate(()=>J.ui.project.lyricCutOptions['1:0'].details),{text:pastedBefore.details.text,area:pastedBefore.details.area});
await page.locator('#btnUndo').click();assert.deepEqual(await page.evaluate(()=>J.ui.project.lyricCutOptions['1:0']),pastedBefore);
await page.locator('#btnRedo').click();assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['1:0'].details.seed),undefined);
// Global randomization respects locked lines and old pasted projects without a marker.
await page.evaluate(()=>{const p=J.ui.project;p.lyricCutOptions['0:0'].details={seed:42,effectEvents:[],text:'keep'};delete p.lyricCutOptions['0:0'].pastedEffects;p.overrides[0].lock=true;J.clearPastedLyricEffects(p);if(p.lyricCutOptions['0:0'].details.seed!==42)throw Error('locked paste cleared');p.overrides[0].lock=false;J.clearPastedLyricEffects(p);if(p.lyricCutOptions['0:0'].details.seed!==undefined||p.lyricCutOptions['0:0'].details.text!=='keep')throw Error('legacy paste not cleared')});
assert.deepEqual(errors,[]);console.log(locale||'ja','clipboard, isolation, media transfer, fallback, undo and persistence passed');await page.close();}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

