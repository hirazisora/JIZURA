const {chromium}=require('playwright');const assert=require('node:assert/strict');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const locale of ['', 'en/']){const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await page.goto('http://127.0.0.1:8765/'+locale);await proMode(page);
assert.equal(await page.locator('#btnJev,#btnJevBig,#jevPrompt').count(),0);
assert.equal((await page.request.post('http://127.0.0.1:8765/api/jev')).status(),501);
const report=await page.evaluate(()=>{
 const failures=[],check=(v,m)=>{if(!v)failures.push(m)};let runs=0;
 for(const [id,theme] of Object.entries(J.THEMES)){
  for(const key of theme.styles)check(!!J.STYLES[key],id+': style '+key);
  for(const key of theme.media)check(!!J.MEDIA_TECH[key],id+': media '+key);
  for(let seed=1;seed<=24;seed++){
   const p=J.defaultProject();p.themes=[id];p.extra=seed%2===0;p.wa=seed%3===0;p.overrides={0:{lock:true,layout:'center',seed:123}};
   const result=J.omakase(p,J.rng(seed)),pool=J.themeCandidates(p,id);runs++;
   check(pool.styles.includes(result.style),id+': style escaped');check(theme.moods.includes(result.mood),id+': mood escaped');
   for(const group of J.GROUP_KEYS)for(const [key,on] of Object.entries(result.enabled[group]))if(on)check(pool.lyrics[group].includes(key),id+': lyric escaped '+group+':'+key);
   for(const layer of ['foreground','media']){
    const on=Object.keys(result[layer].effects.enabled).filter(k=>result[layer].effects.enabled[k]);check(on.every(k=>pool.media.includes(k)),id+': media escaped');
    for(const stage of [undefined,'enter','exit'])check(on.some(k=>J.MEDIA_TECH[k].stage===stage),id+': empty '+stage);
   }
   check(JSON.stringify(result.overrides[0])===JSON.stringify(p.overrides[0]),id+': lost lock');
   check(!result.colors.enabled&&!result.colors.accentOn&&Object.keys(result.fonts).length===0,id+': random palette/fonts');
   J.plan({...p,...result});
  }
 }
 const p=J.defaultProject();p.themes=['ballad','cute','unknown','cute'];check(JSON.stringify(J.themeIds(p))==='["ballad","cute"]','normalize');const seen=new Set();for(let i=1;i<=60;i++)seen.add(J.omakase(p,J.rng(i)).appliedTheme);check(seen.size===2&&[...seen].every(id=>p.themes.includes(id)),'multi selection');
 return {failures:[...new Set(failures)],runs,themes:Object.keys(J.THEMES).length};
});assert.deepEqual(report.failures,[]);
const before=await page.evaluate(()=>J.ui.project.style);await page.locator('#btnThemes').click();await page.locator('[data-theme="ballad"]').check();await page.locator('[data-theme="cute"]').check();await page.locator('#btnApplyThemes').click();assert.equal(await page.locator('#themeLabels .theme-label').count(),2);assert.equal(await page.evaluate(()=>J.ui.project.style),before);
await page.locator('#btnUndo').click();assert.equal(await page.locator('#themeLabels .theme-label').count(),0);await page.locator('#btnRedo').click();assert.equal(await page.locator('#themeLabels .theme-label').count(),2);
await page.locator('#btnOmakase').click();assert.ok(['ballad','cute'].includes(await page.evaluate(()=>J.ui.project.appliedTheme)));
await page.locator('#btnThemes').click();await page.locator('#btnClearThemes').click();await page.locator('#themesDlg button[value="cancel"]').click();assert.equal(await page.locator('#themeLabels .theme-label').count(),2);
await page.evaluate(()=>J.uiApi.flushSave());await page.reload();assert.equal(await page.locator('#themeLabels .theme-label').count(),2);
const roundtrip=await page.evaluate(async()=>{const blob=await J.packProject(J.ui.project,null);return (await J.unpackProject(blob)).project.themes});assert.deepEqual(roundtrip,['ballad','cute']);
await page.locator('#btnThemes').click();await page.screenshot({path:'../themes-'+(locale?'en':'ja')+'.png'});await page.locator('#btnClearThemes').click();await page.locator('#btnApplyThemes').click();await page.locator('#modeEasy').click();await page.locator('#btnOmakase').click();assert.deepEqual(errors,[]);console.log(locale||'ja',report);await page.close();}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
