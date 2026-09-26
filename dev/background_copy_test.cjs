const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{for(const locale of ['', 'en/']){
const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning')errors.push(m.text())});const url='http://127.0.0.1:8765/'+locale;await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..',locale,'index.html'))}):r.abort());await page.goto(url);
const report=await page.evaluate(async()=>{
const p=J.defaultProject();p.lyrics='[00:00]コピーする歌詞\n[00:02]次の歌詞';p.durationOverride=4;p.videoSize={w:320,h:180};p.fx.texture=0;p.fx.chroma=0;p.fx.hud='off';
const image=document.createElement('canvas');image.width=320;image.height=180;const ix=image.getContext('2d');ix.fillStyle='#ff0000';ix.fillRect(0,0,320,180);J.mediaAssets.set('test-red',{element:image,type:'image',file:await new Promise(resolve=>image.toBlob(resolve))});
p.foreground={...p.foreground,opacity:50,items:[{id:'test-red',name:'red',type:'image',width:320,height:180}],manualCuts:true,cutCount:1,timing:{lineTimes:{0:0}},cutOverrides:{0:{itemId:'test-red',technique:'none',placement:{cx:.5,cy:.5,w:.5,h:.5,lockAspect:true}}}};
p.media={...p.media,manualCuts:true,cutCount:1,timing:{lineTimes:{0:0}},cutOverrides:{0:{itemId:'@copy:foreground-source',technique:'none'}}};
const plan=J.plan(p);plan.foreground=J.planMedia(p,plan,null,'foreground');plan.media=J.planMedia(p,plan);
const cv=document.createElement('canvas');cv.width=320;cv.height=180;const ctx=cv.getContext('2d',{willReadFrequently:true}),owner=new J.Renderer(),pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data),clear=()=>ctx.clearRect(0,0,320,180);
J.drawMedia(ctx,plan,.5,owner);const rawEdge=pixel(5,90),rawCenter=pixel(160,90);clear();
plan.media.cuts[0].itemId='@copy:foreground-render';J.drawMedia(ctx,plan,.5,owner);const renderedEdge=pixel(5,90),renderedCenter=pixel(160,90);clear();
plan.media.cuts[0].technique='legacy';plan.media.cuts[0].independentPhases=false;plan.media.cuts[0].treat='mono';J.drawMedia(ctx,plan,.5,owner);const filtered=pixel(160,90);clear();
// A later foreground frame must be read live, not cached by the background cut.
ix.fillStyle='#0000ff';ix.fillRect(0,0,320,180);plan.media.cuts[0].itemId='@copy:foreground-source';plan.media.cuts[0].treat='none';J.drawMedia(ctx,plan,1,owner);const later=pixel(160,90);
const lyricCopy=J.mediaCopySource(plan,{itemId:'@copy:lyrics'},.5,owner,320,180).toDataURL();const expected=document.createElement('canvas');expected.width=320;expected.height=180;owner.copyRenderer.frame(expected.getContext('2d'),plan,.5,{scale:320/plan.W,noMedia:true,noForeground:true,transparent:true,noHud:true,copyLyrics:true});const lyricEqual=lyricCopy===expected.toDataURL();
// Foreground motion is preserved only by the rendered mode.
const fg=plan.foreground.cuts[0],original={...fg};Object.assign(fg,{technique:'legacy',independentPhases:false,hold:'pan'});
const first=J.mediaCopySource(plan,{itemId:'@copy:foreground-render'},.2,owner,320,180).toDataURL();
const second=J.mediaCopySource(plan,{itemId:'@copy:foreground-render'},2.5,owner,320,180).toDataURL();
const motion=first!==second;Object.assign(fg,original);
const savedForeground=plan.foreground.cuts;plan.foreground.cuts=[];
const empty=J.mediaCopySource(plan,{itemId:'@copy:foreground-render'},.5,owner,320,180).getContext('2d').getImageData(160,90,1,1).data[3];
plan.foreground.cuts=savedForeground;
// Full composition and transitions exercise recursion guards at multiple times.
plan.media.cuts[0].itemId='@copy:lyrics';for(const t of [.01,.5,1.9,2.1])owner.frame(ctx,plan,t,{scale:320/plan.W});
const savedCuts=plan.media.cuts;plan.media.cuts=[{...savedCuts[0],index:0,start:0,end:2,itemId:'@copy:foreground-render'},{...savedCuts[0],index:1,start:2,end:4,itemId:'@copy:lyrics',trans:'crossfade',transDur:.4}];
for(const t of [1.99,2.01,2.2,2.5])owner.frame(ctx,plan,t,{scale:320/plan.W});plan.media.cuts=savedCuts;
p.media.randomOrder=true;p.media.cutOverrides[0].lock=true;p.media.cutOverrides[0].lockedItemId='@copy:lyrics';const locked=J.planMedia(p,plan).cuts[0].itemId;
p.media.randomOrder=false;p.media.cutOverrides[0]={itemId:'@copy:lyrics',technique:'none'};J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();J.uiApi.seek(.5);
const restored=(await J.unpackProject(await J.packProject(p,null))).project;
return {motion,empty,rawEdge,rawCenter,renderedEdge,renderedCenter,filtered,later,lyricEqual,locked,roundtrip:restored.media.cutOverrides[0].itemId};
});
assert.equal(report.motion,true);assert.equal(report.empty,0);assert.deepEqual(report.rawEdge,[255,0,0,255]);assert.equal(report.renderedEdge[3],0);assert.ok(Math.abs(report.renderedCenter[3]-128)<=1);assert.equal(report.filtered[0],report.filtered[1]);assert.equal(report.filtered[1],report.filtered[2]);assert.deepEqual(report.later,[0,0,255,255]);assert.equal(report.lyricEqual,true);assert.equal(report.locked,'@copy:lyrics');assert.equal(report.roundtrip,'@copy:lyrics');
await page.locator('#sourceMedia').click();const select=page.locator('.media-cut-file').first();assert.equal(await select.locator('option[value^="@copy:"]').count(),3);for(const value of ['@copy:foreground-source','@copy:foreground-render','@copy:lyrics']){await select.selectOption(value);assert.equal(await page.evaluate(()=>J.ui.plan.media.cuts[0].itemId),value);}
await page.locator('#itemFrames [data-layer="media"][data-action="area"]').click();await page.locator('#areaCancel').click();await page.locator('#sourceForeground').click();assert.equal(await page.locator('.media-cut-file option[value^="@copy:"]').count(),0);assert.deepEqual(errors,[]);console.log(locale||'ja',report);await page.close();}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});



