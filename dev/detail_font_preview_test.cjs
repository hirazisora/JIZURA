const {chromium}=require('playwright'),{timelineAction}=require('./ui_helpers.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const lang of ['','en/'])for(const width of [1500,768,390,320,568]){
 const height=width===568?320:900,page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.goto((process.env.JIZURA_TEST_URL||'http://127.0.0.1:8765/')+lang);
 await page.evaluate(async()=>{
  for(const [key,name,local] of [['preview_serif','Preview Serif','Georgia'],['preview_sans','Preview Sans','Arial']]){
   const face=new FontFace(name,`local("${local}")`);await face.load();document.fonts.add(face);J.addUserFont(key,name,name);
  }
  J.setCompositeFonts([{key:'composite_preview',name:'Mixed preview',base:'preview_sans',parts:{latin:'preview_serif'}}]);
  const p=J.defaultProject();p.lyrics='[00:00]Original line';p.durationOverride=8;
  p.lyricCutOptions={'0:0':{details:{text:'夜明けの色を覚えてる — Dawn',fonts:{display:['gothic_black'],body:['gothic_med'],small:['mono']}}}};
  J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();
  window.previewFontRequests=[];const ensure=J.ensureFonts;J.ensureFonts=(text,keys)=>{previewFontRequests.push({text,keys});return ensure(text,keys);};
 });
 const modal=page.locator('#cutDetailsDialog'),popup=page.locator('.detail-search-popup');
 const open=async()=>{
  await timelineAction(page,'[data-layer="lyrics"]','details');
  assert.equal(await modal.locator('[data-detail-field="start"]').getAttribute('type'),'number');assert.equal(await modal.locator('[data-detail-field="start"]').inputValue(),'0');
  assert.equal(await modal.locator('[data-detail-field="opacity"]').getAttribute('type'),'number');assert.equal(await modal.locator('[data-detail-field="opacity"]').inputValue(),'100');
  assert.equal(await modal.locator('[data-detail-field="untilNext"]').getAttribute('type'),'checkbox');assert(await modal.locator('[data-detail-field="untilNext"]').isChecked());
  assert.equal(await modal.locator('[data-detail-field="text"]').inputValue(),await modal.evaluate(el=>el.cutPreview.cut.text));
  await modal.locator('[data-detail-tab="style"]').click();
  assert.equal(await modal.locator('[data-detail-field="layout"]').inputValue(),await modal.evaluate(el=>el.cutPreview.cut.layout));
  for(const section of await modal.locator('details:has([data-detail-font])').all())if(!await section.evaluate(el=>el.open))await section.locator(':scope > summary').click();
 };
 const select=()=>modal.locator('[data-detail-field="fonts.display.0"]');
 const fontState=()=>page.evaluate(()=>JSON.stringify(J.ui.project.lyricCutOptions['0:0'].details.fonts));
 const checkLayout=async()=>{
  const bounds=await popup.evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,overflow:el.scrollWidth-el.clientWidth,buttons:[...el.querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};})};});
  assert(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=height);assert.equal(bounds.overflow,0);
  for(const button of bounds.buttons)assert(button.left>=bounds.left&&button.right<=bounds.right&&button.top>=bounds.top&&button.bottom<=bounds.bottom);
 };
 await open();const before=await fontState();await select().click();await popup.waitFor({state:'visible'});await checkLayout();
 assert.equal(await popup.locator('[data-font-preview-mode="name"]').innerText(),lang?'Show font names':'フォント名を表示');
 assert.equal(await popup.locator('[data-font-preview-mode="lyrics"]').innerText(),lang?'Show lyrics':'歌詞を表示');
 const styling=await popup.locator('.detail-font-option').evaluateAll(items=>items.map(el=>{const key=el.dataset.value,sample=el.querySelector('.detail-font-sample'),expected=J.fontCSS(key,16),probe=document.createElement('span');probe.style.font=expected;return{actual:sample.style.font,expected:probe.style.font,text:sample.textContent,label:el.getAttribute('aria-label')};}));
 assert(styling.length>=24);for(const item of styling){assert.equal(item.actual,item.expected);assert.equal(item.text,item.label);}
 await popup.locator('[data-font-preview-mode="lyrics"]').click();assert.equal(await fontState(),before);await checkLayout();
 assert.equal(await popup.locator('.detail-font-sample').first().innerText(),'夜明けの色を覚えてる — Dawn');
 for(const item of await popup.locator('.detail-font-option').evaluateAll(items=>items.map(el=>{const probe=document.createElement('span');probe.style.font=J.fontCSS(el.dataset.value,16);return{actual:el.querySelector('.detail-font-sample').style.font,expected:probe.style.font};})))assert.equal(item.actual,item.expected);
 const widths=await popup.evaluate(el=>['preview_serif','preview_sans'].map(key=>{const sample=el.querySelector(`[data-value="${key}"] .detail-font-sample`),range=document.createRange();range.selectNodeContents(sample);return range.getBoundingClientRect().width;}));assert.notEqual(widths[0],widths[1],'Loaded fonts must draw different letterforms');
 assert(await page.evaluate(()=>previewFontRequests.some(r=>r.text.includes('夜明け')&&r.keys.includes('preview_serif')&&r.keys.includes('preview_sans'))));
 const composite=popup.locator('[data-value="composite_preview"] .detail-font-sample').first();assert(await composite.locator('span').count()>0);
 await popup.locator('input').fill('no-font-match-zzzz');assert.equal(await popup.locator('[role="option"]').count(),0);assert(await popup.locator('[role="status"]').isVisible());await popup.locator('input').fill('');
 await popup.locator('input').fill('preview serif');assert.equal(await popup.locator('[role="option"]').count(),1);await popup.locator('input').press('Enter');await popup.waitFor({state:'hidden'});assert.equal(await select().inputValue(),'preview_serif');
 await select().click();assert.equal(await popup.locator('[data-font-preview-mode="lyrics"]').getAttribute('aria-pressed'),'true');
 await popup.locator('[data-font-preview-mode="name"]').click();await popup.locator('input').press('Tab');assert.equal(await popup.locator('[data-font-preview-mode="name"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');await popup.waitFor({state:'hidden'});assert(await modal.isVisible());
 await select().click();const outsideBox=await modal.boundingBox();await page.mouse.click(outsideBox.x+2,outsideBox.y+2);await popup.waitFor({state:'hidden'});assert(await modal.isVisible());
 await select().click();await popup.locator('input').fill('mincho');await popup.locator('[data-value="mincho"]').click();assert.equal(await select().inputValue(),'mincho');
 await modal.getByRole('button',{name:lang?'Apply':'適用',exact:true}).click();assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['0:0'].details.fonts.display[0]),'mincho');
 await page.evaluate(()=>J.uiApi.flushSave());await page.reload();await page.waitForFunction(()=>J.ui.plan);assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['0:0'].details.fonts.display[0]),'mincho');
 await open();assert.equal(await select().inputValue(),'mincho');
 for(const [text,expected] of [['長い歌詞'.repeat(90),'長い歌詞'.repeat(30)+'…'],['\n  一行目\n二行目\t三行目  ','一行目 二行目 三行目'],['  \n ','（歌詞なし）']]){
  await modal.locator('[data-detail-tab="basic"]').click();await modal.locator('[data-detail-field="text"]').fill(text);await modal.locator('[data-detail-field="text"]').dispatchEvent('change');
  await modal.locator('[data-detail-tab="style"]').click();await select().click();await popup.locator('[data-font-preview-mode="lyrics"]').click();
  assert.equal(await popup.locator('.detail-font-sample').first().innerText(),expected==='（歌詞なし）'&&lang?'(No lyrics)':expected);await checkLayout();await popup.locator('input').press('Escape');
 }
 await modal.getByRole('button',{name:lang?'Cancel':'キャンセル',exact:true}).click();assert.equal(await page.evaluate(()=>J.ui.project.lyricCutOptions['0:0'].details.text),'夜明けの色を覚えてる — Dawn');
 await open();await modal.locator('[data-detail-field="layout"]').click();assert.equal(await popup.locator('[data-font-preview-mode]').count(),0);await popup.locator('input').press('Escape');
 await modal.getByRole('button',{name:lang?'Cancel':'キャンセル',exact:true}).click();assert.deepEqual(errors,[]);console.log('PASS font previews, glyph loading, search, selection/save, keyboard, reopen, long/multiline/empty, generic menus '+(lang||'ja')+' '+width);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
