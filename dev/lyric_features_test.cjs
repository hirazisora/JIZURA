const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    for (const locale of ['', 'en/']) {
      const page = await browser.newPage({viewport:{width:1500,height:1000}}), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:''}));
      await page.goto('http://127.0.0.1:8765/' + locale);
      await page.waitForFunction(() => J.ui?.plan);
      const result = await page.evaluate(async () => {
        const check = (condition, label) => { if (!condition) throw new Error(label); };
        const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
        const overlap = (a,b) => Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
        const p = J.defaultProject();
        p.lyrics = '{\n[00:00]First/phrase\n[00:02]*Second*\n[00:04]~Third~\n}\n[00:06]Fourth\\nFifth';
        p.fx.density = 1; p.fx.koma = 0; p.fx.hud = 'off'; p.videoSize = {w:320,h:180};
        const plan = J.plan(p), group = plan.cuts.filter(c => c.group != null);
        check(group.length === 4, 'separate phrase cuts must remain in the timeline');
        check(group.every(c => c.displayEnd === 6), 'a group lasts through its last lyric cut');
        check(group[0].end < group[0].displayEnd, 'retention must not change timeline boundaries');
        check(J.lyricCutsAt(plan,4.5).length === 4 && J.lyricCutsAt(plan,.1).length === 1, 'seek backward and forward must reconstruct the stack');
        check(J.lyricCutsAt(plan,6).every(c => c.group == null), 'group disappears at its end');
        const multiline = plan.cuts.filter(c => c.line === 3);
        check(multiline.length === 1 && multiline[0].text === 'Fourth\nFifth', 'inline line breaks stay inside one cut');
        check(J.splitLines(multiline[0].text,2) === multiline[0].text, 'explicit rows are not rewrapped');
        const glyphs = J.layoutText({text:multiline[0].text,font:multiline[0].params.font,size:40});
        check(new Set(glyphs.map(g => g.y)).size === 2 && !glyphs.some(g => g.ch === '\n'), 'line breaks render as two rows');
        check(group.find(c => c.line === 1).frontmost, 'asterisk emphasis enables frontmost');
        check(group.find(c => c.line === 2).motionScale < 1, 'suppression reduces motion');
        check(plan.cuts.every(c => !c.area), 'automatic areas default to off');

        // Foreground bounds use source aspect and rotation during each cut's
        // own time slot, even when braces extend its rendered lifetime.
        const fg = {id:'lyric-test-foreground',name:'foreground.png',type:'image',width:640,height:360};
        const placement = {cx:.65,cy:.5,w:.4,h:.8,lockAspect:false,angle:15};
        p.foreground = {...p.foreground,items:[fg],manualCuts:true,cutCount:2,
          cutOverrides:{0:{itemId:fg.id,technique:'none',placement},1:{itemId:fg.id,technique:'none',placement:{...placement,cx:.6,angle:-15}}},timing:{lineTimes:{0:0,1:3}}};
        p.lyricEffects = {autoPlacement:true,avoidForeground:true};
        const auto = J.plan(p), fore = J.planMedia(p,auto,null,'foreground');
        for (const cut of auto.cuts.filter(c => c.line < 3 && !c.emphasis)) {
          for (const f of fore.cuts.filter(f => f.start < cut.end && f.end + .6 > cut.start))
            check(overlap(cut.area,J.foregroundBounds(p,auto,f)) < 1e-8, 'automatic area must avoid all overlapping foreground cuts');
        }
        // A right-side foreground followed by a top foreground used to squeeze
        // every retained cut into their one shared lower-left rectangle.
        const words = '[00:00]First\n[00:01]Second\n[00:02]Third';
        const groupedProject = {...p,seed:1234,lyrics:`{\n${words}\n}\n[00:04]Outside`,overrides:{},
          foreground:{...p.foreground,cutOverrides:{
            0:{itemId:fg.id,technique:'none',placement:{cx:.65,cy:.5,w:.7,h:1,angle:0,lockAspect:false}},
            1:{itemId:fg.id,technique:'none',placement:{cx:.5,cy:.3,w:1,h:.6,angle:0,lockAspect:false}},
          },timing:{lineTimes:{0:0,1:2}}}};
        const groupedPlan = J.plan(groupedProject);
        const individualPlan = J.plan({...groupedProject,lyrics:words+'\n[00:04]Outside'});
        const retained = groupedPlan.cuts.filter(c => c.group != null);
        check(retained.length === 3 && retained.every(c => c.displayEnd === 4), 'independent areas preserve grouped lifetimes');
        check(new Set(retained.map(c => JSON.stringify(c.area))).size === 3, 'retained cuts must receive their own varied areas');
        check(same(groupedPlan.cuts.map(c => c.area),individualPlan.cuts.map(c => c.area)), 'braces must not change per-cut automatic placement');
        const active = J.lyricCutsAt(groupedPlan,2.5).map(J.lyricRenderCut);
        check(active.length === 3 && same(active.map(c => c.area),retained.map(c => c.area)), 'simultaneously retained lyrics render with their individual areas');
        check(same(retained.map(c => c.area),J.plan(groupedProject).cuts.filter(c => c.group != null).map(c => c.area)), 'grouped areas are reproducible');
        check(!same(retained.map(c => c.area),J.plan({...groupedProject,seed:1235}).cuts.filter(c => c.group != null).map(c => c.area)), 'shuffle varies grouped areas');
        const strong = auto.cuts.find(c => c.emphasis);
        check(overlap(strong.area,J.foregroundBounds(p,auto,fore.cuts[0])) > .05, 'emphasis ignores foreground avoidance');
        const noAvoid = J.plan({...p,lyricEffects:{autoPlacement:true,avoidForeground:false}});
        check(noAvoid.cuts[0].area.w * noAvoid.cuts[0].area.h > auto.cuts[0].area.w * auto.cuts[0].area.h, 'avoidance off restores unconstrained area');
        const variant = type => {
          const q = {...p,lyrics:type === 'strong' ? '*Same words*' : type === 'soft' ? '~Same words~' : 'Same words',overrides:{0:{single:true}},lyricEffects:{autoPlacement:true,avoidForeground:false}};
          return J.plan(q).cuts[0];
        };
        const normal = variant('normal'), big = variant('strong'), small = variant('soft');
        check(big.area.w * big.area.h > normal.area.w * normal.area.h && small.area.w * small.area.h < normal.area.w * normal.area.h, 'control characters scale the area');
        check(same(auto.cuts.map(c => c.area),J.plan(p).cuts.map(c => c.area)), 'placement must be deterministic');
        check(!same(auto.cuts.map(c => c.area),J.plan({...p,seed:p.seed+1}).cuts.map(c => c.area)), 'shuffle changes automatic placement');
        const manual = {x:.1,y:.1,w:.3,h:.2,angle:20,lockAspect:true};
        const manualProject = {...p,overrides:{0:{area:manual}}};
        check(same(J.plan(manualProject).cuts[0].area,manual), 'manual area wins over automatic placement');
        const shuffled = {...manualProject,...J.omakase(manualProject)};
        check(same(J.plan(shuffled).cuts[0].area,manual), 'omakase retains a manual area');
        const cover = {...p,foreground:{...p.foreground,cutCount:1,cutOverrides:{0:{itemId:fg.id,technique:'none',layout:'cover'}},timing:{lineTimes:{0:0}}}};
        check(J.plan(cover).cuts.every(c => !c.area || c.area.w > 0 && c.area.h > 0), 'full-stage foreground must not create an empty or invalid area');
        const short = J.plan({...p,durationOverride:6.1});
        check(short.cuts.every(c => (c.displayEnd ?? c.end) <= short.duration), 'retention respects the video duration');
        const span = J.plan({...p,lyrics:'*First/Second*',overrides:{},lyricEffects:{autoPlacement:false}});
        check(span.cuts.filter(c => Number.isInteger(c.part)).every(c => c.frontmost), 'emphasis spans manual cut boundaries');
        const animated = J.plan({...p,lyrics:'Same words',overrides:{0:{single:true,enter:'zoom',exit:'cut',hold:'still',treat:'none'}},lyricEffects:{autoPlacement:false}});
        const motionCanvas = document.createElement('canvas'), motionRenderer = new J.Renderer(), drawFx = J.drawFx;
        const motions = [];
        try {
          J.drawFx = (env,item) => { motions.push({x:item.x,y:item.y,size:item.size,sx:item.sx??1,sy:item.sy??1}); };
          for(const motionScale of [1,.25]) {
            const cut = {...animated.cuts[0],motionScale}, lt = cut.inDur*.4;
            const env=motionRenderer.makeEnv(motionCanvas.getContext('2d'),animated,cut,animated.style.schemes[0],{pass:'main',t:lt,lt,ltb:lt,step:2,scale:1,allowFilter:false});
            J.mainDraw(env,{text:cut.text,font:cut.params.font||'gothic_black',size:80,x:100,y:100});
          }
        } finally {J.drawFx=drawFx;}
        const distance = item => Math.abs(item.size-80)+Math.abs(item.sx-1)*80+Math.abs(item.sy-1)*80+Math.abs(item.x-100)+Math.abs(item.y-100);
        check(distance(motions[0])>0 && distance(motions[1])<distance(motions[0])*.5, 'suppression must actually reduce animation amplitude');

        // Colored probes exercise real renderer compositing, rather than only
        // inspecting plan fields. Red is a retained lyric, green is foreground,
        // blue is emphasized/frontmost, yellow is a later regular lyric.
        const cv = document.createElement('canvas'); cv.width=320; cv.height=180;
        const ctx = cv.getContext('2d'), source = document.createElement('canvas'); source.width=640;source.height=360;
        source.getContext('2d').fillStyle='#00ff00';source.getContext('2d').fillRect(0,0,640,360);
        J.mediaAssets.set(fg.id,{element:source,type:'image'});
        const renderProject = {...p,lyricEffects:{autoPlacement:false},foreground:{...p.foreground,cutCount:1,
          cutOverrides:{0:{itemId:fg.id,technique:'none',entrance:'none',departure:'none',placement:{cx:.5,cy:.5,w:.6,h:.6,lockAspect:false,angle:0}}},timing:{lineTimes:{0:0}}}};
        const rp = J.plan(renderProject);rp.foreground=J.planMedia(renderProject,rp,null,'foreground');
        rp.media={cuts:[],opacity:100,blend:'normal'};rp.events=[];rp.fx.chroma=0;rp.fx.texture=0;
        const calls=[];
        J.LAYOUTS.__lyricProbe={render(env){
          calls.push({line:env.cut.line,out:env.pOut,end:env.cut.end});
          const rects=[[0,.1,.6,.6,'#ff0000'],[.25,.25,.5,.5,'#0000ff'],[.4,.1,.3,.6,'#ffff00']];
          const r=rects[env.cut.line];if(r)env.rect(r[0]*env.W,r[1]*env.H,r[2]*env.W,r[3]*env.H,r[4]);
        }};
        for(const c of rp.cuts) Object.assign(c,{layout:'__lyricProbe',cam:'none',decor:[],trans:null,contentScale:1,groupExit:'cut',groupOutDur:0});
        const renderer=new J.Renderer(), options={scale:cv.width/rp.W,noPost:true,noGhost:true,noHud:true};
        const pixel=(x,y)=>Array.from(ctx.getImageData(Math.floor(x*320),Math.floor(y*180),1,1).data).slice(0,3).join(',');
        renderer.frame(ctx,rp,4.5,options);
        check(pixel(.1,.3)==='255,0,0', 'an early group cut must remain visible');
        check(pixel(.23,.3)==='0,255,0', 'foreground must cover regular retained lyrics');
        check(pixel(.5,.5)==='0,0,255', 'frontmost retained lyrics must stay above foreground and later regular lyrics');
        check(pixel(.65,.15)==='255,255,0', 'new regular lyrics must stack above previous regular lyrics');
        check(calls.filter(c=>c.line===0).every(c=>c.out===0&&c.end===6), 'old cuts must not exit at their original boundary');
        const savedForeground=rp.foreground;rp.foreground=null;
        renderer.frame(ctx,rp,4.5,options);check(pixel(.5,.5)==='0,0,255','frontmost stack order must also hold during empty foreground cuts');
        rp.foreground=savedForeground;
        renderer.frame(ctx,rp,.25,options);check(pixel(.5,.5)==='0,255,0','seeking backward must remove later lyrics');
        renderer.frame(ctx,rp,6.1,options);check(pixel(.5,.5)==='0,255,0','retained frontmost lyrics must disappear at group end');
        J.CAMERA.__lyricBlur={get:()=>({blur:25})};
        rp.cuts.find(c=>c.line===2).cam='__lyricBlur';
        renderer.frame(ctx,rp,4.5,options);
        const reused=renderer.camLayer;
        check(pixel(.1,.3)==='255,0,0','a later focus blur must not blur earlier retained lyrics');
        for(let i=0;i<20;i++)renderer.frame(ctx,rp,4+i/40,options);
        check(renderer.camLayer===reused,'retained cuts must reuse their camera canvas');
        rp.cuts.find(c=>c.line===2).cam='none';delete J.CAMERA.__lyricBlur;

        // Encode and decode a frame with the same renderer used for MP4 export.
        const encoded=await J.exportMP4({plan:rp,project:renderProject,quality:'standard'});
        const video=document.createElement('video'),url=URL.createObjectURL(encoded.blob);
        try {
          video.src=url;
          await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('MP4 decode failed'));});
          await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=4.5;});
          ctx.drawImage(video,0,0,320,180);
          const px=ctx.getImageData(160,90,1,1).data;
          check(px[2]>220&&px[0]<35&&px[1]<35,'exported MP4 must preserve retained frontmost compositing');
        } finally {video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
        delete J.LAYOUTS.__lyricProbe;J.mediaAssets.delete(fg.id);
        return {fixture:p,bytes:encoded.blob.size,cuts:group.length};
      });
      console.log(locale || 'ja', 'planner, seeking, layering and MP4:', {bytes:result.bytes,cuts:result.cuts});
      await page.locator('#fileProject').setInputFiles({name:'lyrics.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(result.fixture))});
      await page.waitForFunction(()=>J.ui.project.lyrics.includes('Fourth'));
      await page.locator('#modePro').click();
      await page.locator('[data-tab="tech"]').click();
      assert.equal(await page.locator('#lyricAutoPlacement').isChecked(),true);
      assert.equal(await page.locator('#lyricAvoidForeground').isChecked(),true);
      if(locale) assert.doesNotMatch(await page.locator('#lyricAutoPlacement').locator('..').innerText(),/[\u3040-\u30ff\u4e00-\u9fff]/);
      await page.locator('#lyricAutoPlacement').uncheck();
      await page.waitForFunction(()=>J.ui.plan.cuts.every(c=>!c.area));
      await page.locator('#btnUndo').click();
      await page.waitForFunction(()=>J.ui.project.lyricEffects.autoPlacement);
      assert.equal(await page.locator('#lyricAutoPlacement').isChecked(),true);
      const firstArea=await page.evaluate(()=>J.ui.plan.cuts[0].area);
      await page.locator('#lineList .lyric-area-thumb').first().click();
      assert.equal(await page.locator('#areaResetAuto').isVisible(),true);
      const draft=await page.evaluate(()=>J.ui.areaEdit.draft);
      assert.deepEqual(draft,firstArea,'area editor starts at the resolved automatic area');
      await page.locator('#areaResetFull').click();await page.locator('#areaApplyOne').click();
      await page.waitForFunction(()=>J.ui.plan.cuts[0].area.w===1);
      await page.locator('#btnShuffle').click();
      assert.equal(await page.evaluate(()=>J.ui.plan.cuts[0].area.w),1,'manual full-stage reset survives shuffle');
      await page.locator('#lineList .lyric-area-thumb').first().click();
      await page.locator('#areaResetAuto').click();await page.locator('#areaApplyOne').click();
      await page.waitForFunction(()=>J.ui.plan.cuts[0].areaMode==='auto');
      await page.locator('#lineList .lock').first().click();
      const locked=await page.evaluate(()=>J.ui.plan.cuts.filter(c=>c.line===0).map(c=>c.area));
      await page.locator('#btnShuffle').click();
      assert.deepEqual(await page.evaluate(()=>J.ui.plan.cuts.filter(c=>c.line===0).map(c=>c.area)),locked,'locked areas survive shuffle');
      const strongToggle=page.locator('#lineList .lyric-ln').nth(1).locator('.lyric-frontmost input').first();
      assert.equal(await strongToggle.isChecked(),true);assert.equal(await strongToggle.isDisabled(),true);
      assert.equal(await page.evaluate(()=>J.ui.plan.cuts.find(c=>c.line===1).frontmost),true,'emphasis remains frontmost');
      await page.evaluate(()=>J.uiApi.flushSave());await page.reload();
      await page.waitForFunction(()=>J.ui.plan.lines.length===4);
      assert.equal(await page.evaluate(()=>J.ui.project.lyricEffects.autoPlacement),true);
      assert.equal(await page.evaluate(()=>J.ui.plan.cuts.find(c=>c.line===1).frontmost),true);
      assert.deepEqual(errors,[]);
      await page.locator('[data-tab="tech"]').click();
      await page.evaluate(()=>J.uiApi.seek(4.5));
      await page.screenshot({path:locale?'../lyric-features-en.png':'../lyric-features-ja.png',fullPage:true});
      await page.close();
      console.log(locale || 'ja','UI, undo, manual area, lock and persistence passed');
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
