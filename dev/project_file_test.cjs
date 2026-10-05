const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const wav=Buffer.alloc(44+16000*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(let i=0;i<16000;i++)wav.writeInt16LE(Math.round(Math.sin(i/16000*440*2*Math.PI)*3000),44+i*2);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const lang of ['', 'en/']){
  const errors=[],setup=async()=>{const c=await browser.newContext({viewport:{width:1500,height:1000}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));await p.goto('http://127.0.0.1:8765/'+lang);await p.locator('#modePro').click();return p};
  const p=await setup();assert.match(await p.title(),/^(【[^】]+】)?字面一 JIZURA ONE STOP EDITION$/);// the preview server prefixes the branchassert.equal(await p.locator('#fileProject').getAttribute('accept'),null);
  await p.locator('#projectMenu summary').click();await p.locator('#btnNew').click();await p.locator('#newProjectAspect').selectOption('9:16');await p.locator('#btnCreateProject').click();
  // A new project opens the theme settings; this test continues without choosing themes.
  assert.equal(await p.evaluate(()=>document.getElementById('themesDlg').open),true);await p.keyboard.press('Escape');
  assert.deepEqual(await p.evaluate(()=>[J.ui.project.lyrics,J.ui.project.aspect,J.ui.plan.cuts.length,J.mediaAssets.size,J.ui.audio]),['','9:16',0,0,null]);
  await p.locator('#songTitle').fill('Portable test');await p.locator('#songTitle').dispatchEvent('input');
  await p.locator('#sourceForeground').click();
  const img=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><circle cx="60" cy="40" r="30" fill="red"/></svg>');
  await p.locator('#mediaFiles').setInputFiles({name:'円.svg',mimeType:'image/svg+xml',buffer:img});
  const video=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const ctx=c.getContext('2d');const stream=c.captureStream(10),rec=new MediaRecorder(stream,{mimeType:'video/webm'}),parts=[];rec.ondataavailable=e=>parts.push(e.data);const done=new Promise(r=>rec.onstop=r);rec.start();for(let i=0;i<5;i++){ctx.fillStyle=i%2?'blue':'red';ctx.fillRect(0,0,120,80);await new Promise(r=>setTimeout(r,110))}rec.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()))});
  await p.locator('#sourceMedia').click();await p.locator('#mediaFiles').setInputFiles({name:'clip.webm',mimeType:'video/webm',buffer:Buffer.from(video)});
  await p.locator('#audioFile').setInputFiles({name:'tone.wav',mimeType:'audio/wav',buffer:wav});await p.locator('#audioImportDialog button:not([data-cancel])').click();// confirm the import dialog
  await p.waitForFunction(()=>!!J.ui.audioFile);
  await p.locator('#sourceLyrics').click();// BPM is in the 歌詞・曲 tab
  await p.locator('#bpm').fill('144');await p.locator('#bpm').dispatchEvent('change');
  await p.locator('#fontFile').setInputFiles('C:/Windows/Fonts/arial.ttf');await p.waitForFunction(()=>J.ui.project.userFonts?.some(f=>f.file));
  const before=await p.evaluate(()=>JSON.parse(JSON.stringify(J.ui.project)));
  const wait=p.waitForEvent('download');await p.locator('#projectMenu summary').click();await p.locator('#btnSave').click();await p.locator('#saveFilename').fill('素材 保存 テスト.jizuraichi');await p.locator('#filenameDlg button[value="save"]').click();const download=await wait;
  assert.match(download.suggestedFilename(),/\.jizuraichi$/);const bytes=await fs.readFile(await download.path());assert.equal(bytes.subarray(0,8).toString(),'JIZURA01');
  const q=await setup();await q.locator('#fileProject').setInputFiles({name:'portable.jizuraichi',mimeType:'application/octet-stream',buffer:bytes});await q.waitForFunction(()=>J.ui.project.title==='Portable test'&&!J.ui.projectBusy);
  // Saving also records the saved name as the project name.
  assert.deepEqual(await q.evaluate(()=>JSON.parse(JSON.stringify(J.ui.project))),{...before,projectName:'素材 保存 テスト'});
  assert.deepEqual(await q.evaluate(()=>[J.mediaAssets.size,!!J.ui.audio,J.ui.audioFile.size,Array.from(J.mediaAssets.values()).map(a=>a.element.videoWidth||a.element.naturalWidth)]),[2,true,wav.length,[120,120]]);
  const sizes=await q.evaluate(async()=>{const data=await J.unpackProject(await J.packProject(J.ui.project,J.ui.audioFile));return data.files.map(e=>[e.kind,e.file.size])});assert.deepEqual(sizes.slice(0,3),[['media',video.length],['media',img.length],['audio',wav.length]]);assert.equal(sizes[3][0],'font');assert.ok(sizes[3][1]>1000);
  // Reject a truncated file without replacing the current edit.
  await q.locator('#fileProject').setInputFiles({name:'bad.jizuraichi',mimeType:'application/octet-stream',buffer:bytes.subarray(0,bytes.length-5)});await q.waitForFunction(()=>!J.ui.projectBusy);assert.equal(await q.locator('#songTitle').inputValue(),'Portable test');
  await q.reload();await q.waitForFunction(()=>!!J.ui.audio&&J.mediaAssets.size===2);assert.equal(await q.evaluate(()=>J.ui.project.timing.bpm),144);
  await q.locator('#btnRemoveAudio').click();assert.equal(await q.evaluate(()=>J.ui.audio),null);
  await q.locator('#btnUndo').click();await q.waitForFunction(()=>!!J.ui.audio);
  await q.locator('#btnRedo').click();assert.equal(await q.evaluate(()=>J.ui.audio),null);
  await q.screenshot({path:'../portable-project-'+(lang?'en':'ja')+'.png',fullPage:true});
  await q.locator('#projectMenu summary').click();await q.locator('#btnNew').click();await q.locator('#newProjectAspect').selectOption('1:1');await q.screenshot({path:'../new-project-'+(lang?'en':'ja')+'.png'});await q.locator('#btnCreateProject').click();
  assert.equal(await q.evaluate(()=>document.getElementById('themesDlg').open),true);await q.keyboard.press('Escape');
  assert.deepEqual(await q.evaluate(()=>[J.ui.project.title,J.ui.project.lyrics,J.ui.project.aspect,J.ui.project.timing.bpm,J.ui.audio,J.ui.project.audioAsset||null,J.mediaAssets.size,J.ui.plan.cuts.length,J.ui.project.media.items.length,J.ui.project.foreground.items.length]),['','','1:1',0,null,null,0,0,0,0]);
  assert.equal(await q.locator('#btnUndo').isDisabled(),true);assert.equal(await q.locator('#btnPrev').count(),0);
  // Old settings-only JSON remains readable and carries no old song into it.
  const legacy={...before,title:'Legacy',media:{items:[]},foreground:{items:[]}};delete legacy.audioAsset;
  await q.locator('#fileProject').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await q.waitForFunction(()=>J.ui.project.title==='Legacy'&&!J.ui.projectBusy);assert.equal(await q.evaluate(()=>J.ui.audio),null);
  assert.deepEqual(errors,[]);console.log(lang||'ja','portable image/video/audio, fresh browser, reload, invalid file, legacy JSON and empty new project: OK');await p.context().close();await q.context().close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
