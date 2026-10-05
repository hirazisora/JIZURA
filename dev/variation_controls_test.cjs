const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const lang of ['','en/'])for(const width of [1500,768,390,320]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.goto((process.env.JIZURA_TEST_URL||'http://127.0.0.1:8765/')+lang);await page.waitForFunction(()=>J.ui.plan);
 assert.equal(await page.locator('#btnPrev,#btnNext,#btnPrev2,#btnNext2,#btnOmakaseBig,#histPos').count(),0);
 const seed=()=>page.evaluate(()=>J.ui.project.seed);
 const before=await seed();await page.locator('#btnOmakase').click();const randomized=await seed();assert.notEqual(randomized,before);
 await page.locator('#btnUndo').click();assert.equal(await seed(),before);await page.locator('#btnRedo').click();assert.equal(await seed(),randomized);
 await page.locator('#modeEasy').click();assert(await page.locator('#easyNow').isVisible());assert(await page.locator('#eLyricAvoidCenter').isVisible());
 const text=await page.locator('#easyPanel').innerText();assert(!/おまかせで作る|前の案|次の案|Create for me|Previous variation|Next variation/.test(text));
 await page.locator('#eStyle').click();const style=await page.evaluate(()=>J.ui.project.style);assert(style);
 await page.locator('#eLyricAvoidCenter').check();assert(await page.locator('#eLyricAvoidCenter').isChecked());
 if(process.env.JIZURA_VARIATION_SHOTS&&[1500,390].includes(width)){
  const out=process.env.JIZURA_VARIATION_SHOTS;fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`jizura-simple-controls-${lang?'en':'ja'}-${width}.png`)});
 }
 await page.locator('#closeSettingsDrawer').click();await page.locator('#btnOmakase').focus();await page.keyboard.press('r');assert.notEqual(await seed(),randomized);const keyboardSeed=await seed();
 await page.locator('#btnUndo').click();assert.equal(await seed(),randomized);await page.locator('#btnRedo').click();assert.equal(await seed(),keyboardSeed);
 const look=()=>page.evaluate(()=>JSON.stringify([J.ui.project.style,J.ui.project.mood,J.ui.project.colors,J.ui.project.fonts]));
 const unchanged=await look();await page.locator('#btnShuffle').click();assert.notEqual(await seed(),keyboardSeed);assert.equal(await look(),unchanged);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);assert.deepEqual(errors,[]);
 console.log('PASS removed variation controls, retained omakase/R/shuffle/Undo/Redo/simple settings '+(lang||'ja')+' '+width);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
