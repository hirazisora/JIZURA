const {chromium}=require('playwright');
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try { for(const locale of ['', 'en/']) {
  const page=await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:8765/'+locale;
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..',locale,'index.html'))}):r.abort());
  await page.goto(url);
  const result=await page.evaluate(()=>{
   const parsed=J.parseLyrics('[00:00]｜　　　｜\n[00:06]歌詞|注釈\n[00:08]｜   ｜');
   const p=J.defaultProject();p.lyrics='[00:00]｜　　　｜';p.durationOverride=8;p.fx.hud='off';
   p.overrides={0:{area:{x:-.3,y:1.1,w:1.5,h:1.2,angle:20}}};
   J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();
   const plan=J.ui.plan, cut=plan.cuts.find(c=>c.line===0);
   let backgrounds=0, layouts=0, decorations=0;
   J.BG.testEmpty={draw:()=>backgrounds++};J.DECOR.testEmpty={layer:'back',draw:()=>decorations++};
   cut.bg='testEmpty';cut.decor=[{id:'testEmpty'}];
   const old=J.LAYOUTS[cut.layout].render;J.LAYOUTS[cut.layout].render=()=>{layouts++;};
   const cv=document.createElement('canvas');cv.width=320;cv.height=180;
   const renderer=new J.Renderer(),opt={scale:320/plan.W,noPost:true,noGhost:true,noHud:true};
   renderer.frame(cv.getContext('2d'),plan,1,opt);const withoutMedia=backgrounds;
   const source=document.createElement('canvas');source.width=320;source.height=180;
   J.mediaAssets.set('test-bg',{element:source,type:'image'});
   plan.media.cuts=[{itemId:'test-bg',index:0,start:0,end:8,type:'image',layout:'contain',hold:'still',enter:'cut',exit:'cut',treat:'none'}];
   renderer.frame(cv.getContext('2d'),plan,1,opt);const withMedia=backgrounds;
   plan.media.applyLyricBackground=false;renderer.frame(cv.getContext('2d'),plan,1,opt);
   J.LAYOUTS[cut.layout].render=old;
   return {parsed:parsed.lines.map(l=>({text:l.text,effectsOnly:l.effectsOnly,note:l.note})),area:cut.area,blank:cut.effectsOnly,cuts:plan.cuts.filter(c=>c.line===0).length,withoutMedia,withMedia,off:backgrounds,layouts,decorations};
  });
  assert.equal(result.parsed.length,3);assert.equal(result.parsed[0].effectsOnly,true);assert.equal(result.parsed[1].note,'注釈');assert.equal(result.parsed[2].effectsOnly,true);
  assert.equal(result.area.x,-.3);assert.equal(result.area.y,1.1);assert.equal(result.area.w,1.5);
  assert.equal(result.blank,true);assert.equal(result.cuts,1);assert.equal(result.layouts,0);assert.ok(result.decorations>0);
  assert.equal(result.withoutMedia,1);assert.equal(result.withMedia,2);assert.equal(result.off,2);
  await page.locator('#modePro').click();await page.locator('[data-tab="mediaFx"]').click();
  const checkbox=page.locator('#mediaEffectsPanel [data-media-setting="applyLyricBackground"]');assert.equal(await checkbox.isChecked(),true);
  await checkbox.uncheck();assert.equal(await page.evaluate(()=>J.ui.plan.media.applyLyricBackground),false);
  await page.locator('#sourceLyrics').click();await page.locator('.lyric-area-thumb').first().click();
  await page.locator('#mediaAreaWidth').fill('200');await page.locator('#mediaAreaWidth').dispatchEvent('change');
  await page.locator('#areaApplyOne').click();
  const saved=await page.evaluate(()=>{J.uiApi.flushSave();return JSON.parse(localStorage.getItem('jizura.project.v1'));});
  assert.equal(saved.overrides[0].area.w,2);assert.ok(saved.overrides[0].area.x<0);assert.equal(saved.media.effects.applyLyricBackground,false);
  assert.deepEqual(errors,[]);await page.close();
 } } finally {await browser.close();}
 console.log('JA/EN: offscreen area persistence, effects-only lines, background toggles and rendering passed');
})().catch(e=>{console.error(e);process.exit(1);});
