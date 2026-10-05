const {chromium}=require('playwright');
const {proMode,openSource,closeSource,timelineAction}=require('./ui_helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try{for(const lang of ['', 'en/'])for(const width of [320,390,768,844,1440]){
    const mobile=width<1000,page=await browser.newPage({viewport:{width,height:width===844?390:844},isMobile:mobile,hasTouch:mobile});
    page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>r.request().url()==='http://localhost/'?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(__dirname,'..',lang,'index.html'))}):r.abort());
    await page.goto('http://localhost/');await proMode(page);
    const baseline=await page.evaluate(()=>JSON.stringify(J.ui.project));
    const dimensions=await page.evaluate(()=>({width:document.documentElement.scrollWidth,view:document.querySelector('#view').getBoundingClientRect().height}));
    assert(dimensions.width<=width+1,'page overflow '+width);assert(dimensions.view>=120,'preview too small '+width);
    assert.equal(await page.locator('#btnPrev, #btnNext').count(),0);
    await page.locator('#projectMenu summary')[mobile?'tap':'click']();
    const menu=await page.locator('#projectMenu .header-menu-items').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=width+1,'menu outside screen');
    await page.locator('#projectMenu summary')[mobile?'tap':'click']();
    await openSource(page,'lyrics');await page.locator('#btnThemes')[mobile?'tap':'click']();
    assert(await page.locator('[data-theme=wa]').isVisible());
    const themeOverflow=await page.locator('#themesDlg').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert(!themeOverflow,'theme overflow');
    await page.locator('#themesDlg button[value=cancel]')[mobile?'tap':'click']();await closeSource(page);
    await page.locator('#timelineZoomIn')[mobile?'tap':'click']();
    if(mobile){assert(await page.locator('#timelinePan').isEnabled());await page.locator('#timelinePan').fill(await page.locator('#timelinePan').getAttribute('max'));await page.locator('#timelinePan').dispatchEvent('input');assert(await page.locator('#timelineScroll').evaluate(el=>el.scrollLeft>0));}
    await page.locator('#timelineZoomOut')[mobile?'tap':'click']();
    await timelineAction(page,'[data-layer="lyrics"]','details');
    const detail=page.locator('#cutDetailsDialog');assert(await detail.isVisible());
    assert(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'detail overflow');
    assert.equal(await detail.locator('[role=tab][aria-selected=true]').getAttribute('data-detail-tab'),'basic');
    await detail.locator('[data-detail-tab=motion]')[mobile?'tap':'click']();
    assert.equal(await detail.locator('[role=tab][aria-selected=true]').getAttribute('data-detail-tab'),'motion');
    await page.locator('[data-detail-field=enter]')[mobile?'tap':'click']();await page.locator('.detail-search-popup input').fill('ぼかし');assert(await page.locator('.detail-search-option').count()>0);
    await page.locator('.detail-search-popup input').press('Escape');
    await detail.getByRole('button',{name:lang?'Cancel':'キャンセル',exact:true})[mobile?'tap':'click']();
    await page.locator('#viewport').evaluate(el=>el.requestFullscreen=undefined);
    await page.locator('#previewFullscreen')[mobile?'tap':'click']();assert(await page.locator('#fullscreenPlay').isVisible());
    const full=await page.locator('#viewport').boundingBox();assert(full.width>=width-1);
    await page.locator('#fullscreenPlay')[mobile?'tap':'click']();assert(await page.evaluate(()=>J.ui.playing));await page.locator('#fullscreenPlay')[mobile?'tap':'click']();
    await page.locator('#exitPreviewFullscreen')[mobile?'tap':'click']();assert.equal(await page.locator('.preview-fullscreen').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(J.ui.project)),baseline,'UI navigation changed project');
    await page.locator('#modeEasy')[mobile?'tap':'click']();assert(await page.locator('#easyNow').isVisible());assert.equal(await page.locator('#btnOmakaseBig, #btnPrev2, #btnNext2').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    if(width===390)await page.screenshot({path:path.join(process.env.TEMP||'.','jizura-mobile-'+(lang?'en':'ja')+'.png')});
    assert.deepEqual(errors,[]);console.log((lang||'ja')+' '+width+': responsive layout, dialogs, search, timeline scrolling, fullscreen and unchanged project passed');await page.close();
  }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
