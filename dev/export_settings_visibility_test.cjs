const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const lang of ['', 'en/'])for(const width of [1500,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='http://127.0.0.1/'?r.fulfill({contentType:'text/html',body:fs.readFileSync(lang+'index.html')}):r.abort());await page.goto('http://127.0.0.1/');
  await page.locator('#modeEasy').click();
  const videoSettings=page.locator('#easyPanel .easy-sec').filter({has:page.locator('#eFps')});
  assert.equal(await videoSettings.locator('h3').textContent(),lang?'Video settings':'動画設定');
  assert.equal(await videoSettings.locator('button').count(),0);
  assert.equal(await page.locator('#eMP4').count(),0);
  await page.locator('#eFps').selectOption('24');
  assert.equal(await page.evaluate(()=>J.ui.project.fps),24);
  await page.locator('#modePro').click();await page.locator('[data-tab="out"]').click();
  assert.equal(await page.locator('[data-tab="out"]').textContent(),lang?'Video settings':'動画設定');
  assert.equal(await page.locator('[data-tab="out"]').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#outFps').inputValue(),'24');
  assert.equal(await page.locator('[data-pane="out"] button').count(),0);
  assert.equal(await page.locator('[data-pane="out"] #outAudio').count(),0);
  assert.equal(await page.locator('#outAudio').isVisible(),false);
  assert.equal(await page.locator('#outAudio').evaluate(el=>el.closest('dialog').id),'exportDlg');
  for(const id of ['btnMP4','btnShort','btnPNG','btnPNGA']){
   assert.equal(await page.locator('#'+id).isVisible(),false);
   assert.equal(await page.locator('#'+id).evaluate(el=>el.closest('dialog').id),'exportDlg');
  }
  await page.locator('[data-tab="style"]').click();await page.locator('[data-tab="out"]').click();
  assert(await page.locator('#outFps').isVisible());
  await page.locator('#closeSettingsDrawer').click();
  for(const quality of ['qp','custom','high'])for(const kind of ['png','pnga','mp4']){
  await page.evaluate(({quality,kind})=>{const p=J.defaultProject();p.lyrics='test';p.durationOverride=.1;p.quality=quality;p.exportQP=12;p.exportBitrate=5500000;J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();document.querySelector('[data-export-dialog="'+kind+'"]').click();},{quality,kind});
  const check=async()=>{
   for(const id of ['outQuality','outAudio','codecNote'])assert.equal(await page.locator('#'+id).isVisible(),kind==='mp4',id+' '+kind);
   for(const id of ['outQP','outQPNote'])assert.equal(await page.locator('#'+id).isVisible(),kind==='mp4'&&quality==='qp',id+' '+kind);
   assert.equal(await page.locator('#outBitrate').isVisible(),kind==='mp4'&&quality==='custom');
   assert.equal(await page.locator('#outKey').isVisible(),kind!=='pnga');assert.equal(await page.locator('#exportSettings .key-note').isVisible(),kind!=='pnga');
   for(const id of ['outAspect','outRes','outFps','outVideoSize'])assert(await page.locator('#'+id).isVisible());
  };
  await check();
  // These edits used to reintroduce QP/custom bitrate into PNG dialogs.
  await page.locator('#outRes').selectOption('720');await check();
  await page.locator('#outFps').selectOption('24');await check();
  await page.locator('#outAspect').selectOption('1:1');await check();
  await page.locator('#outVideoSize').selectOption('custom');await check();
  assert(await page.locator('#outVideoWidth').isVisible());assert(await page.locator('#outVideoHeight').isVisible());
  await page.locator('#outVideoWidth').fill('640');await page.locator('#outVideoWidth').dispatchEvent('change');await check();
  await page.evaluate(()=>J.uiApi.syncUI());await check();
  await page.locator('#btnCloseExport').click();await page.waitForFunction(()=>document.getElementById('exportSettings').parentElement.id==='exportSettingsHome');
  assert.equal(await page.locator('#outQP').evaluate(el=>el.closest('label').hidden),quality!=='qp');
  assert.equal(await page.locator('#outBitrate').evaluate(el=>el.closest('label').hidden),quality!=='custom');
 }
 assert.deepEqual(errors,[]);console.log('PASS export format visibility across edits, reopen, QP/bitrate '+(lang||'ja')+' '+width);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
