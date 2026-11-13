const {chromium}=require('playwright');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try {for(const locale of ['', 'en/']) {
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await page.goto('http://127.0.0.1:8765/'+locale);
  await proMode(page);
  for(const layer of ['foreground','media']) {
   await page.locator(layer==='foreground'?'#sourceForeground':'#sourceMedia').click();
   await page.locator('#mediaFiles').setInputFiles({name:'phases.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect x="10" y="10" width="90" height="55" fill="red"/><circle cx="65" cy="30" r="20" fill="blue"/></svg>')});
   const enter=page.locator('[data-media-phase="entrance"]'),exit=page.locator('[data-media-phase="departure"]');
   assert.equal(await enter.inputValue(),'');assert.equal(await exit.inputValue(),'');
   assert.equal(await page.locator('.media-technique option[value="iris"]').count(),0);
   await page.locator('.media-technique').selectOption('beatPulse');
   await enter.selectOption('enter_flipX');await exit.selectOption('exit_fade');
   assert.deepEqual(await page.evaluate(layer=>{const c=J.ui.plan[layer].cuts[0];return [c.hold,c.enter,c.exit,c.bpm]},layer),['beatPulse','flipX','fade',120]);
   // BPM is a song setting in the 歌詞・曲 tab.
   await page.locator('#sourceLyrics').click();
   await page.locator('#bpm').fill('180');await page.locator('#bpm').dispatchEvent('change');
   assert.equal(await page.evaluate(layer=>J.ui.plan[layer].cuts[0].bpm,layer),180);
   await page.locator('#bpm').fill('');await page.locator('#bpm').dispatchEvent('change');
   await page.locator(layer==='foreground'?'#sourceForeground':'#sourceMedia').click();
   await page.locator(`[data-tab="${layer}Fx"]`).click();
   await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
   assert.equal(await enter.inputValue(),'enter_flipX');assert.equal(await exit.inputValue(),'exit_fade');
   await enter.selectOption('');await exit.selectOption('');
   await page.locator('#mediaLineList .lock').click();
   const locked=await page.evaluate(layer=>{const c=J.ui.plan[layer].cuts[0];return [c.entrance,c.departure]},layer);
   await page.locator(`#${layer}EffectsPanel [data-media-action="disable"]`).click();
   await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
   assert.deepEqual(await page.evaluate(layer=>{const c=J.ui.plan[layer].cuts[0];return [c.entrance,c.departure]},layer),locked);
   await page.locator('#mediaLineList .lock').click();await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
   assert.deepEqual(await page.evaluate(layer=>{const c=J.ui.plan[layer].cuts[0];return [c.enter,c.exit]},layer),['cut','cut']);
   await page.locator(`#${layer}EffectsPanel [data-media-action="enable"]`).click();
   await enter.selectOption('enter_flipY');await exit.selectOption('exit_squeezeX');
   await page.locator('#btnUndo').click();assert.equal(await exit.inputValue(),'');
   await page.locator('#btnRedo').click();assert.equal(await exit.inputValue(),'exit_squeezeX');
  }
  const report=await page.evaluate(()=>{
   const failures=[],check=(ok,s)=>{if(!ok)failures.push(s)},item=J.ui.project.foreground.items[0];
   const plan=(ov={},bpm=0,layer='foreground',enabled={})=>J.planMedia({seed:33,timing:{bpm},[layer]:{items:[item],effects:{enabled},cutOverrides:{0:{technique:'none',...ov}}}},{duration:4,lines:[]},0,layer).cuts[0];
   const ids=Object.keys(J.MEDIA_TECH),only=Object.fromEntries(ids.map(k=>[k,['enter_flipX','exit_flipY','beatPulse'].includes(k)]));
   for(const layer of ['foreground','media']) {
    const c=plan({technique:null},0,layer,only);check(c.enter==='flipX'&&c.exit==='flipY'&&c.hold==='beatPulse',layer+': independent pools');
    check(JSON.stringify(c)===JSON.stringify(plan({technique:null},0,layer,only)),layer+': deterministic');
   }
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
   const raster=(c,t)=>{ctx.clearRect(0,0,320,180);J.drawMediaCut(ctx,c,t);return canvas.toDataURL()};
   for(const [key,def] of Object.entries(J.MEDIA_TECH).filter(([,d])=>d.stage)) {
    const c=plan({entrance:def.stage==='enter'?key:'none',departure:def.stage==='exit'?key:'none',placement:{cx:.5,cy:.5,w:.4}});
    const mid=raster(c,2),edge=raster(c,def.stage==='enter'?.015:3.985);
    check(mid!==edge,key+': phase must animate');check(raster(c,2)===mid,key+': seek deterministic');
   }
   for(const [key] of Object.entries(J.MEDIA_TECH).filter(([,d])=>d.group==='bpm')) {
    const c=plan({technique:key,entrance:'none',departure:'none',placement:{cx:.5,cy:.5,w:.4}},120);
    // beatFlip turns only in the 4th beat of each bar (1.5–2 s at 120 BPM).
    check(key==='beatFlip'?raster(c,1.51)!==raster(c,1.75):raster(c,1.01)!==raster(c,key==='beatStep'?1.63:1.13),key+': visible beat motion');
    const state=(cut,t)=>J.mediaBeatState(cut,(t-cut.start)/(cut.end-cut.start),120,80);
    const a=state(c,1.125),b=state({...c,start:.7,end:6.1},1.125),fast=state({...c,bpm:240},.5625);
    for(const k of Object.keys(a)){check(Math.abs(a[k]-b[k])<1e-9,key+': absolute clock '+k);check(Math.abs(a[k]-fast[k])<1e-9,key+': BPM speed '+k)}
    const offset=state({...c,beatOffset:.2},1.325);for(const k of Object.keys(a))check(Math.abs(a[k]-offset[k])<1e-9,key+': offset '+k);
   }
   const old=plan({technique:'iris'});check(old.enter==='iris'&&old.exit===J.MEDIA_TECH.iris.exit,'legacy explicit reveal');
   return {failures,entrances:J.mediaPhaseOptions('enter').length,exits:J.mediaPhaseOptions('exit').length,bpm:Object.values(J.MEDIA_TECH).filter(d=>d.group==='bpm').length};
  });
  assert.deepEqual(report.failures,[]);
  await page.reload();await page.locator('#sourceMedia').click();
  assert.equal(await page.locator('[data-media-phase="entrance"]').inputValue(),'enter_flipY');
  assert.equal(await page.locator('[data-media-phase="departure"]').inputValue(),'exit_squeezeX');
  assert.deepEqual(errors,[]);console.log(locale||'ja',report);await page.close();
 }} finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
