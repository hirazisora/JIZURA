const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {timelineAction}=require('./ui_helpers.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
for(const locale of ['', 'en/']){
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(locale+'index.html')}));await page.goto('http://test/');
 const fixture=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):null;
 const target=await page.evaluate(fixture=>{
  let p=fixture;
  if(!p){p=J.defaultProject();p.lyrics='[00:00]追加演出の編集';p.durationOverride=8;
   for(let seed=1;seed<=300;seed++){p.seed=seed;if(J.plan(p).events.some(e=>e.type==='anamorphic'&&e.cutOwner))break;}
  }
  J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();
  const event=J.ui.plan.events.find(e=>e.type==='anamorphic'&&e.cutOwner&&(fixture?e.t>23&&e.t<24:true));
  if(!event)throw Error('Expected generated anamorphic flare');
  const [line,part]=event.cutOwner.split(':').map(Number),cut=J.ui.plan.cuts.find(c=>c.line===line&&c.part===part);
  if(cut.effectEvents!==undefined)throw Error('Fixture must exercise generated events, not captured favorites');
  J.uiApi.seek(event.t+.066);
  window.target={line,part,owner:event.cutOwner,time:event.t+.066};
  window.eventBaseline=JSON.stringify(J.ui.plan.events);
  window.otherBaseline=JSON.stringify(J.ui.plan.events.filter(e=>e.cutOwner!==event.cutOwner));
  // Use the real frame renderer to verify this effect is active at the reported time.
  window.flareDraws=()=>{let calls=0;const old=J.FXE.anamorphic.draw;J.FXE.anamorphic.draw=(...args)=>{calls++;return old(...args)};
   try{const canvas=document.createElement('canvas'),plan=J.ui.plan;canvas.width=320;canvas.height=Math.round(320*plan.H/plan.W);new J.Renderer().frame(canvas.getContext('2d'),plan,window.target.time,{scale:320/plan.W,noHud:true});}finally{J.FXE.anamorphic.draw=old;}return calls;};
  return {line,part,calls:window.flareDraws()};
 },fixture);
 assert.ok(target.calls>0,'flare is actually rendered before edit');
 await timelineAction(page,`[data-layer="lyrics"][data-index="${target.line}"][data-part="${target.part}"]`,'details');
 const dialog=page.locator('#cutDetailsDialog');await dialog.locator('[data-detail-tab=effects]').click();
 const events=dialog.locator('[data-detail-section=effectEvents]');assert.equal(await events.count(),1);
 await events.locator(':scope > summary').click();
 const remove=()=>events.locator('.cut-detail-array-actions > button').filter({hasText:locale?'Anamorphic':'アナモフレア'});
 assert.equal(await remove().count(),1,'generated flare can be removed by name');
 const before=await page.evaluate(()=>JSON.stringify(J.ui.project));
 await remove().click();assert.equal(await remove().count(),0);
 await dialog.locator('[data-detail-undo]').click();assert.equal(await remove().count(),1,'undo restores generated effect');
 await dialog.locator('[data-detail-redo]').click();assert.equal(await remove().count(),0);
 assert.equal(await page.evaluate(()=>JSON.stringify(J.ui.project)),before,'preview does not mutate project');
 await dialog.locator('button[type=submit]').click();
 assert.equal(await page.evaluate(()=>J.ui.plan.events.some(e=>e.cutOwner===target.owner&&e.type==='anamorphic')),false);
 assert.equal(await page.evaluate(()=>window.flareDraws()),0,'renderer no longer draws the flare');
 assert.deepEqual(await page.evaluate(()=>J.ui.plan.events.filter(e=>e.cutOwner!==target.owner)),JSON.parse(await page.evaluate(()=>window.otherBaseline)),'other cuts retain effects');
 const saved=await page.evaluate(()=>JSON.stringify(J.ui.project));
 await page.evaluate(saved=>{J.ui.project=JSON.parse(saved);J.uiApi.syncUI();J.uiApi.replan()},saved);
 assert.equal(await page.evaluate(()=>J.ui.plan.events.some(e=>e.cutOwner===target.owner&&e.type==='anamorphic')),false,'saved project keeps removal');
 await timelineAction(page,`[data-layer="lyrics"][data-index="${target.line}"][data-part="${target.part}"]`,'details');
 await dialog.getByRole('button',{name:locale?'Cancel':'キャンセル',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.stringify(J.ui.project)),saved,'opening and cancelling does not freeze random effects');
 assert.deepEqual(errors,[]);console.log(locale||'ja','generated flare removal, undo/redo, renderer and save round trip passed',fixture?'(attached project)':'');await page.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
