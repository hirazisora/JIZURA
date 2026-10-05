const {chromium}=require('playwright');const assert=require('node:assert/strict');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const locale of ['', 'en/']){const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await page.goto((process.env.JIZURA_TEST_URL||'http://127.0.0.1:8765/')+locale);await proMode(page);
const result=await page.evaluate(()=>{
 const failures=[],check=(v,msg)=>{if(!v)failures.push(msg)},edges=['left','right','top','bottom'];
 for(const layer of ['media','foreground'])for(const type of ['image','video'])for(const [width,height] of [[1920,1080],[1080,1920],[100,2000],[2000,100]])for(let mask=1;mask<16;mask++)for(let seed=0;seed<8;seed++){
  const p=J.defaultProject(),item={id:'test',name:'test',type,width,height,croppedEdges:Object.fromEntries(edges.map((e,i)=>[e,!!(mask&(1<<i))]))};
  const placement=J.autoMediaPlacement(p,{itemId:item.id,seed,technique:'pushIn'},item,{W:1920,H:1080},layer),r=J.mediaPlacementRect(placement,width,height,1920,1080);
  check(!(mask&1)||-r.x/r.w>=.2-1e-8,'left');check(!(mask&2)||(r.x+r.w-1)/r.w>=.2-1e-8,'right');check(!(mask&4)||-r.y/r.h>=.2-1e-8,'top');check(!(mask&8)||(r.y+r.h-1)/r.h>=.2-1e-8,'bottom');check(Math.abs(r.w*1920/(r.h*1080)-width/height)<1e-8,'aspect');
 }
 const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
 let strong=0,weak=0;
 for(let seed=1;seed<=40;seed++){
  const p=J.defaultProject();p.seed=seed;p.lyrics='test';p.lyricEffects={autoPlacement:true,avoidForeground:true,avoidanceStrength:1};p.foreground={items:[{id:'fg',name:'fg',type:'image',width:1920,height:1080}],cutOverrides:{0:{technique:'none',placement:{cx:.5,cy:.5,w:.55}}}};
  const plan=J.plan(p),a=plan.cuts.find(c=>c.line>=0),box={x:.225,y:.225,w:.55,h:.55};strong+=overlap(a.area,box);
  p.lyricEffects.avoidanceStrength=.5;weak+=overlap(J.plan(p).cuts.find(c=>c.line>=0).area,box);
  p.lyricEffects.avoidanceStrength=0;const zero=J.plan(p).cuts.find(c=>c.line>=0).area;p.lyricEffects.avoidForeground=false;check(JSON.stringify(zero)===JSON.stringify(J.plan(p).cuts.find(c=>c.line>=0).area),'zero matches off');
 }
 check(strong<1e-8,'full avoidance');check(weak>strong+.1,'weaker allows overlap');check(J.lyricEffectSettings({}).avoidanceStrength===1,'default');
 return {failures:[...new Set(failures)],strong,weak};
});assert.deepEqual(result.failures,[]);
for(const layer of ['foreground','media']){await page.locator(layer==='foreground'?'#sourceForeground':'#sourceMedia').click();await page.locator('#mediaFiles').setInputFiles({name:'test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')});await page.locator('.media-technique').selectOption('pushIn');await page.locator('[data-cropped-edge="left"]').check();assert.equal(await page.evaluate(layer=>J.ui.project[layer].items[0].croppedEdges.left,layer),true);await page.locator('#btnUndo').click();assert.equal(await page.locator('[data-cropped-edge="left"]').isChecked(),false);await page.locator('#btnRedo').click();assert.equal(await page.locator('[data-cropped-edge="left"]').isChecked(),true);}
await page.locator('[data-tab="fx"]').click();await page.locator('#lyricAutoPlacement').check();await page.locator('#lyricAvoidanceStrength').evaluate(el=>{el.value='0.5';});await page.locator('#lyricAvoidanceStrength').dispatchEvent('input');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>J.ui.project.lyricEffects.avoidanceStrength),.5);
await page.reload();await page.locator('#sourceForeground').click();assert.equal(await page.locator('[data-cropped-edge="left"]').isChecked(),true);assert.equal(await page.evaluate(()=>J.ui.project.lyricEffects.avoidanceStrength),.5);await page.locator('[data-tab="fx"]').click();await page.screenshot({path:'../cropped-edges-'+(locale?'en':'ja')+'.png',fullPage:true});assert.deepEqual(errors,[]);console.log(locale||'ja',result);await page.close();}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
