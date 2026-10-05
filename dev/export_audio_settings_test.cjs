const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const lang of ['','en/'])for(const width of [1500,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='http://127.0.0.1/'?r.fulfill({contentType:'text/html',body:fs.readFileSync(lang+'index.html')}):r.abort());await page.goto('http://127.0.0.1/');
 await page.evaluate(()=>{
  const p=J.defaultProject();p.lyrics='Audio';p.durationOverride=.5;p.videoSize={w:64,h:64};p.fps=24;p.quality='standard';delete p.includeAudio;
  J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();window.showSaveFilePicker=undefined;
  const buffer=new AudioBuffer({length:48000,numberOfChannels:1,sampleRate:48000}),samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=.1*Math.sin(2*Math.PI*440*i/48000);J.ui.audio={buffer};
  const original=J.exportMP4;J.exportMP4=async opts=>{window.audioLocked=document.getElementById('outAudio').disabled;const result=await original(opts);window.resultAudio=result.audio;return result;};
  J.saveFile=async(name,blob)=>{const bytes=new Uint8Array(await blob.arrayBuffer()),hasTrack=new TextDecoder('latin1').decode(bytes).includes('soun');let rms=0;
   if(hasTrack){const context=new AudioContext(),pcm=await context.decodeAudioData(await blob.arrayBuffer()),samples=pcm.getChannelData(0);rms=Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length);await context.close();}
   window.savedAudio={name,hasTrack,rms};return 'saved';};
 });
 await page.locator('#modePro').click();await page.locator('[data-tab="out"]').click();
 assert.equal(await page.locator('[data-pane="out"] #outAudio').count(),0);assert.equal(await page.locator('#outAudio').isVisible(),false);
 await page.locator('#closeSettingsDrawer').click();
 for(const include of [true,false]){
  await page.evaluate(()=>{window.savedAudio=null;document.getElementById('menuMP4').click();});
  const checkbox=page.locator('#outAudio');assert(await checkbox.isVisible());
  assert((await checkbox.locator('..').textContent()).includes(lang?'Include audio in video':'曲を動画に含める'));
  if(include)assert(await checkbox.isChecked(),'Legacy missing includeAudio defaults to on');
  await checkbox.setChecked(include);assert.equal(await page.evaluate(()=>J.ui.project.includeAudio!==false),include);
  await page.waitForFunction(()=>!document.getElementById('btnMP4').disabled);await page.locator('#btnMP4').click();
  await page.waitForFunction(()=>window.savedAudio&&!J.ui.exporting);
  const saved=await page.evaluate(()=>({saved:window.savedAudio,audio:window.resultAudio,locked:window.audioLocked}));
  assert.equal(saved.saved.hasTrack,include);assert.equal(!!saved.audio,include);assert(saved.locked);if(include)assert(saved.saved.rms>.01);
  assert.equal(await checkbox.isEnabled(),true);await page.locator('#btnCloseExport').click();
  await page.waitForFunction(()=>document.getElementById('exportSettings').parentElement.id==='exportSettingsHome');
  assert.equal(await checkbox.isVisible(),false);
 }
 await page.evaluate(()=>J.uiApi.flushSave());await page.reload();
 await page.evaluate(()=>document.getElementById('menuMP4').click());assert.equal(await page.locator('#outAudio').isChecked(),false);
 await page.locator('#outAudio').check();await page.locator('#btnCloseExport').click();
 await page.waitForFunction(()=>document.getElementById('exportSettings').parentElement.id==='exportSettingsHome');
 await page.evaluate(()=>document.getElementById('menuMP4').click());assert(await page.locator('#outAudio').isChecked());
 const packed=await page.evaluate(async()=>{const decoded=await J.unpackProject(await J.packProject(J.ui.project,null));return decoded.project.includeAudio;});assert.equal(packed,true);
 assert.deepEqual(errors,[]);console.log('PASS audio dialog placement, real AAC on/off, legacy defaults and persistence '+(lang||'ja')+' '+width);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
