const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const locale of ['','en/'])for(const width of [1500,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await page.goto((process.env.JIZURA_TEST_URL||'http://127.0.0.1:8765/')+locale);
  await page.locator('#modePro').click();await page.locator('[data-tab="fx"]').click();
  assert.equal(await page.locator('[data-tab="fx"]').textContent(),locale?'Lyrics':'歌詞');
  assert.equal(await page.locator('[data-tab="tech"], [data-pane="tech"]').count(),0);
  assert.equal(await page.locator('.tabs [role="tab"]').count(),5);
  assert(await page.locator('#fxSliders').isVisible());assert(await page.locator('#techFilter').isVisible());
  assert(await page.locator('#fxSliders').evaluate(el=>!!(el.compareDocumentPosition(document.getElementById('techLists'))&Node.DOCUMENT_POSITION_FOLLOWING)));
  assert.equal(await page.locator('#sourceLyrics').textContent(),locale?'Lyrics & music':'歌詞・曲');
  await page.locator('#fxFlash').check();
  await page.locator('#lyricGroupAvoidanceStrength').fill('0.35');
  await page.locator('#lyricGroupAvoidanceStrength').dispatchEvent('input');
  const all=await page.locator('#techLists input[type="checkbox"]').count();assert(all>0);
  await page.locator('#techFilter').fill('no-such-technique-xyz');assert.equal(await page.locator('#techLists input[type="checkbox"]').count(),0);
  await page.locator('#techFilter').fill('');assert.equal(await page.locator('#techLists input[type="checkbox"]').count(),all);
  await page.locator('#techLists summary').first().click();
  const technique=page.locator('#techLists input[type="checkbox"]').first();const initial=await technique.isChecked();
  await technique.setChecked(!initial);const enabled=await page.evaluate(()=>JSON.stringify(J.ui.project.enabled));
  await page.evaluate(()=>J.uiApi.flushSave());
  await page.locator('[data-tab="out"]').click();await page.locator('[data-tab="fx"]').click();
  assert(await page.locator('#fxFlash').isChecked());assert.equal(await page.locator('#lyricGroupAvoidanceStrength').inputValue(),'0.35');
  const bounds=await page.locator('#settingsDrawer').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width);
  await page.reload();await page.locator('#modePro').click();await page.locator('[data-tab="fx"]').click();
  assert(await page.locator('#fxFlash').isChecked());assert.equal(await page.locator('#lyricGroupAvoidanceStrength').inputValue(),'0.35');
  assert.equal(await page.evaluate(()=>JSON.stringify(J.ui.project.enabled)),enabled);
  assert.deepEqual(errors,[]);console.log('PASS combined lyrics settings, search, persistence and drawer '+(locale||'ja')+' '+width);
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
