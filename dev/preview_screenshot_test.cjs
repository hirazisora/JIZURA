const {chromium}=require('playwright'),fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const lang of ['', 'en/'])for(const width of [1500,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='http://127.0.0.1/'?r.fulfill({contentType:'text/html',body:fs.readFileSync(lang+'index.html')}):r.abort());await page.goto('http://127.0.0.1/');
 for(const size of [{aspect:'16:9',res:1080,w:1920,h:1080},{aspect:'9:16',res:720,w:720,h:1280},{aspect:'16:9',res:1080,videoSize:{w:1536,h:864},w:1536,h:864}]){
  await page.evaluate(size=>{const p=J.defaultProject();p.lyrics='[00:00]Screenshot';p.durationOverride=5;p.projectName='Capture';p.aspect=size.aspect;p.res=size.res;p.videoSize=size.videoSize||null;J.ui.project=p;J.uiApi.syncUI();J.uiApi.replan();J.uiApi.seek(1.25);window.shot=null;window.shotRenders=[];window.beforeShot={time:J.ui.t,project:JSON.stringify(p),preview:[document.getElementById('view').width,document.getElementById('view').height],maxRes:J.glyphs.maxRes};
   J.saveFile=async(name,blob)=>{const buffer=await blob.arrayBuffer(),header=new DataView(buffer);window.shot={name,w:header.getUint32(16),h:header.getUint32(20),type:blob.type,bytes:blob.size};};
   if(!window.originalFrame){window.originalFrame=J.Renderer.prototype.frame;J.Renderer.prototype.frame=function(ctx,plan,time,options){if(ctx.canvas!==document.getElementById('view'))window.shotRenders.push({w:ctx.canvas.width,h:ctx.canvas.height,scale:options.scale,fast:options.fast,time});return window.originalFrame.call(this,ctx,plan,time,options);};}
   document.getElementById('previewScreenshot').click();
  },size);
  await page.waitForFunction(()=>window.shot&&!document.getElementById('previewScreenshot').disabled).catch(async e=>{console.log(await page.evaluate(()=>({toast:document.body.innerText.slice(-1800),shot:window.shot})));throw e;});
  const shot=await page.evaluate(()=>({shot:window.shot,renders:window.shotRenders,before:window.beforeShot,time:J.ui.t,project:JSON.stringify(J.ui.project),preview:[document.getElementById('view').width,document.getElementById('view').height],maxRes:J.glyphs.maxRes,planW:J.ui.plan.W}));
  assert.deepEqual([shot.shot.w,shot.shot.h],[size.w,size.h]);assert.equal(shot.shot.type,'image/png');assert(shot.shot.bytes>1000);assert.equal(shot.shot.name,'Capture_preview_1-250.png');
  // Preview warmup renders may finish during PNG encoding; retain the complete render trace.
  const render=shot.renders.find(r=>r.w===size.w&&r.h===size.h);assert(render,'Saved PNG must render at the export size');assert.equal(render.scale,size.w/shot.planW);assert.equal(render.fast,false);assert.equal(render.time,1.25);
  assert.deepEqual(shot.preview,shot.before.preview);assert.equal(shot.time,shot.before.time);assert.equal(shot.project,shot.before.project);assert.equal(shot.maxRes,shot.before.maxRes);
 }
 assert.deepEqual(errors,[]);console.log('PASS screenshot resolution, full rendering, playback and preview size '+(lang||'ja')+' '+width);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
