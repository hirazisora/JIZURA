const {chromium} = require('playwright');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    for (const locale of ['', 'en/']) {
      const page = await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await page.goto((process.env.JIZURA_TEST_URL||'http://127.0.0.1:8765/')+locale);
      const report = await page.evaluate(async () => {
        const check=(ok,message)=>{if(!ok)throw new Error(message);};
        const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
        const p=J.defaultProject();p.lyrics='[00:00]Same words';p.videoSize={w:320,h:180};
        p.fx={...p.fx,koma:0,chroma:0,texture:0,hud:'off',density:1};p.overrides={0:{single:true}};p.lyricEffects={autoPlacement:false};// full-stage lyrics: the probe samples the centre
        const defaults=J.plan(p).cuts[0];
        check(defaults.blend==='normal'&&defaults.opacity===100,'new cuts default to Normal and 100%');
        const values=plan=>plan.cuts.filter(c=>Number.isInteger(c.part)).map(c=>({blend:c.blend,opacity:c.opacity}));
        const randomProject={...p,lyrics:'{\n[00:00]First/phrase\n[00:02]*Second*\n[00:04]~Third~\n}',overrides:{},
          lyricEffects:{randomBlend:true,randomOpacity:true,opacityMin:20,opacityMax:80}};
        const randomPlan=J.plan(randomProject), randomCuts=randomPlan.cuts.filter(c=>Number.isInteger(c.part));
        check(randomCuts.length>=4,'manual phrase cuts receive separate settings');
        check(equal(values(randomPlan),values(J.plan(randomProject))),'random settings are stable during preview/export');
        check(!equal(values(randomPlan),values(J.plan({...randomProject,seed:p.seed+1}))),'shuffle rerolls the cut settings');
        check(randomCuts.every(c=>c.opacity>=20&&c.opacity<=80&&J.LYRIC_BLENDS.includes(c.blend)),'random values stay inside the configured range');
        check(randomCuts.find(c=>c.emphasis).opacity>=60&&randomCuts.find(c=>c.suppressed).opacity<=40,'emphasis selects the upper third and suppression the lower third');
        for(const seed of [1,2,3,4,5]) {
          const q={...p,seed,lyricEffects:randomProject.lyricEffects};
          const plain=J.plan(q).cuts[0], strong=J.plan({...q,lyrics:'[00:00]*Same words*'}).cuts[0], soft=J.plan({...q,lyrics:'[00:00]~Same words~'}).cuts[0];
          check(strong.opacity>=plain.opacity&&plain.opacity>=soft.opacity,'control characters bias otherwise identical draws');
        }
        const fixed=J.plan({...randomProject,lyricEffects:{randomOpacity:true,opacityMin:37,opacityMax:37}});
        check(values(fixed).every(c=>c.opacity===37),'equal min/max is supported');
        const fractional=J.plan({...randomProject,lyricEffects:{randomOpacity:true,opacityMin:37.2,opacityMax:37.6}});
        check(values(fractional).every(c=>c.opacity>=37.2&&c.opacity<=37.6),'fractional imported bounds must also be respected');
        const manual=J.plan({...randomProject,lyricCutOptions:{'0:0':{blend:'overlay',opacity:0}}});
        check(manual.cuts[0].blend==='overlay'&&manual.cuts[0].opacity===0,'manual settings override randomization, including zero');
        const invalid=J.plan({...p,lyricCutOptions:{'0:0':{blend:'invalid',opacity:'invalid'}}}).cuts[0];
        check(invalid.blend==='normal'&&invalid.opacity===100,'invalid imported values fall back safely');

        // Compare actual pixels to blend equations. Two overlapping marks in
        // one cut must receive opacity once, while retained cuts blend separately.
        const cv=document.createElement('canvas');cv.width=320;cv.height=180;
        const ctx=cv.getContext('2d'), renderer=new J.Renderer();
        const colors=[[208,112,48],[32,96,192]];
        const asset=(id,color)=>{
          const element=document.createElement('canvas');element.width=320;element.height=180;
          const x=element.getContext('2d');x.fillStyle=color;x.fillRect(0,0,320,180);
          J.mediaAssets.set(id,{element,type:'image'});
          return {id,name:id+'.png',type:'image',width:320,height:180};
        };
        const bg=asset('blend-background','#4080c0'), fg=asset('blend-foreground','#6096d2');
        const layer=item=>({...J.defaultProject().media,items:[item],manualCuts:true,cutCount:1,
          timing:{lineTimes:{0:0}},cutOverrides:{0:{itemId:item.id,technique:'none',placement:{cx:.5,cy:.5,w:1,h:1,lockAspect:false,angle:0}}}});
        J.LAYOUTS.__blendProbe={render(env){
          const color=colors[env.cut.line%2];
          for(let i=0;i<2;i++)env.rect(env.W*.2,env.H*.2,env.W*.6,env.H*.6,`rgb(${color.join(',')})`);
        }};
        const makePlan=project=>{
          const plan=J.plan(project);plan.media=J.planMedia(project,plan);plan.foreground=J.planMedia(project,plan,null,'foreground');
          plan.events=[];plan.hud=false;
          for(const c of plan.cuts)Object.assign(c,{layout:'__blendProbe',cam:'none',decor:[],trans:null,contentScale:1,groupExit:'cut',groupOutDur:0});
          return plan;
        };
        const pixel=()=>Array.from(ctx.getImageData(160,90,1,1).data).slice(0,3);
        const mix=(base,source,mode,opacity)=>base.map((b,i)=>{
          const s=source[i], blended=mode==='multiply'?b*s/255:mode==='screen'?255-(255-b)*(255-s)/255:mode==='overlay'?(b<128?2*b*s/255:255-2*(255-b)*(255-s)/255):s;
          return Math.round(b+(blended-b)*opacity/100);
        });
        const close=(actual,expected,label)=>check(actual.every((c,i)=>Math.abs(c-expected[i])<=2),`${label}: ${actual} vs ${expected}`);
        const opts={scale:320/J.plan(p).W,noPost:true,noGhost:true,noHud:true};
        let cases=0;
        for(const scene of ['none','background','foreground','both']) {
          const q={...p,media:scene==='background'||scene==='both'?layer(bg):p.media,foreground:scene==='foreground'||scene==='both'?layer(fg):p.foreground};
          const plan=makePlan(q), cut=plan.cuts[0];cut.frontmost=true;
          renderer.frame(ctx,plan,.5,{...opts,noLyrics:true});const base=pixel();
          for(const blend of J.LYRIC_BLENDS)for(const opacity of [0,25,100]) {
            Object.assign(cut,{blend,opacity});renderer.frame(ctx,plan,.5,opts);
            close(pixel(),mix(base,colors[0],blend,opacity),`${scene} ${blend} ${opacity}%`);cases++;
          }
        }
        for(const scene of ['background','foreground']) {
          const q={...p,lyrics:'[00:00]First\n[00:01]Second',durationOverride:2,
            media:scene==='background'?layer(bg):p.media,foreground:scene==='foreground'?layer(fg):p.foreground,
            lyricCutOptions:{'0:0':{blend:'multiply',opacity:35},'1:0':{blend:'overlay',opacity:72}}};
          const plan=makePlan(q);plan.cuts.forEach(c=>{c.frontmost=scene==='foreground';});
          Object.assign(plan.cuts[1],{trans:'wipe',transDur:.4,transP:{dir:'R'}});
          renderer.frame(ctx,plan,1.1,{...opts,noLyrics:true});const base=pixel();
          for(const t of [1.0834,1.3334,1.0834]) {
            renderer.frame(ctx,plan,t,opts);
            const previous=t<1.2;
            close(pixel(),mix(base,colors[previous?0:1],previous?'multiply':'overlay',previous?35:72),`${scene} transition preserves each cut's composite`);
          }
        }
        const stackedProject={...p,lyrics:'{\n[00:00]First\n[00:01]Second\n}',media:layer(bg),durationOverride:2,
          lyricCutOptions:{'0:0':{blend:'multiply',opacity:35},'1:0':{blend:'overlay',opacity:72}}};
        const stacked=makePlan(stackedProject);
        renderer.frame(ctx,stacked,1.5,{...opts,noLyrics:true});const base=pixel();
        renderer.frame(ctx,stacked,1.5,opts);
        const expected=mix(mix(base,colors[0],'multiply',35),colors[1],'overlay',72);
        close(pixel(),expected,'retained cuts use separate compositing');
        const buffer=renderer.lyricCutLayer;
        for(let i=0;i<12;i++)renderer.frame(ctx,stacked,1+i/24,opts);
        check(renderer.lyricCutLayer===buffer,'retained cuts reuse one composite canvas');
        // Decode a real exported frame, including the per-cut blend and opacity.
        const encoded=await J.exportMP4({plan:stacked,project:stackedProject,quality:'standard'});
        const video=document.createElement('video'),url=URL.createObjectURL(encoded.blob);
        try {
          video.src=url;
          await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('MP4 decode failed'));});
          await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=1.5;});
          ctx.drawImage(video,0,0,320,180);
          check(pixel().every((c,i)=>Math.abs(c-expected[i])<10),'MP4 export preserves per-cut blending');
        }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
        J.mediaAssets.delete(bg.id);J.mediaAssets.delete(fg.id);delete J.LAYOUTS.__blendProbe;
        return {fixture:randomProject,cases,bytes:encoded.blob.size};
      });
      console.log(locale||'ja','planner and pixel/MP4 compositing',report.cases,report.bytes);

      const load=async project=>{
        await page.locator('#fileProject').setInputFiles({name:'composite.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
        await page.waitForFunction(lyrics=>J.ui.project.lyrics===lyrics,project.lyrics);
      };
      const project=()=>page.evaluate(()=>structuredClone(J.ui.project));
      const cuts=()=>page.evaluate(()=>J.ui.plan.cuts.filter(c=>Number.isInteger(c.part)).map(c=>({line:c.line,part:c.part,blend:c.blend,opacity:c.opacity})));
      await proMode(page);
      await load({...report.fixture,lyricEffects:{}});
      assert.equal(await page.locator('#lyricBlend, #lyricOpacity').count(),0,'global lyric controls are removed');
      const first=page.locator('.lyric-cut-option[data-line="0"][data-part="0"]');
      assert.equal(await first.locator('.lyric-cut-blend').inputValue(),'normal');
      assert.equal(await first.locator('.lyric-cut-opacity').inputValue(),'100');
      await first.locator('.lyric-cut-blend').selectOption('overlay');
      await first.locator('.lyric-cut-opacity').fill('48');await first.locator('.lyric-cut-opacity').press('Tab');
      assert.deepEqual((await cuts())[0],{line:0,part:0,blend:'overlay',opacity:48});
      assert.equal((await cuts())[1].opacity,100,'editing one cut leaves the adjacent cut at its default');
      await page.locator('#btnUndo').click();assert.equal((await cuts())[0].opacity,100);
      await page.locator('#btnRedo').click();assert.equal((await cuts())[0].opacity,48);
      await page.locator('[data-tab="fx"]').click();
      assert.equal(await page.locator('#lyricOpacityRange').isVisible(),false);
      await page.locator('#lyricRandomBlend').check();await page.locator('#lyricRandomOpacity').check();
      assert.equal(await page.locator('#lyricOpacityRange').isVisible(),true);
      for(const [id,value]of [['#lyricOpacityMin','20'],['#lyricOpacityMax','80']]){await page.locator(id).fill(value);await page.locator(id).press('Tab');}
      await page.locator('#btnShuffle').click();
      assert.equal((await cuts())[0].opacity,48,'manual opacity survives shuffle');
      assert.equal((await cuts())[0].blend,'overlay','manual blend survives shuffle');
      await first.locator('.lyric-composite-auto').click();
      assert.equal((await project()).lyricCutOptions['0:0'],undefined);
      assert.equal(await first.locator('.lyric-cut-blend').inputValue(),'');
      await page.locator('#lineList .lock').first().click();
      const locked=(await cuts()).filter(c=>c.line===0);
      await page.locator('#btnShuffle').click();
      assert.deepEqual((await cuts()).filter(c=>c.line===0),locked,'locked cuts preserve their random blend and opacity');
      await first.locator('.lyric-cut-blend').selectOption('screen');
      const lockedOpacity=locked[0].opacity;
      await page.locator('#lyricOpacityMax').fill('25');await page.locator('#lyricOpacityMax').press('Tab');
      assert.equal((await cuts())[0].opacity,lockedOpacity,'editing a locked blend must not unlock its opacity');
      await page.locator('#btnUndo').click();await page.locator('#btnUndo').click();
      assert.deepEqual((await cuts()).filter(c=>c.line===0),locked);
      // Reversed endpoints are corrected in the UI, not left as invalid bounds.
      await page.locator('#lyricOpacityMin').fill('90');await page.locator('#lyricOpacityMin').press('Tab');
      assert.equal(await page.locator('#lyricOpacityMax').inputValue(),'90');
      await page.locator('#btnUndo').click();
      const saved=await project(),resolved=await cuts();
      await page.evaluate(()=>J.uiApi.flushSave());await page.reload();
      await page.waitForFunction(()=>J.ui.project.lyrics.includes('Third'));
      assert.deepEqual(await project(),saved);assert.deepEqual(await cuts(),resolved);
      await page.locator('[data-tab="fx"]').click();
      if(locale)assert.doesNotMatch(await page.locator('[data-pane="fx"] .pick-sets').first().innerText(),/[\u3040-\u30ff\u4e00-\u9fff]/);
      await page.screenshot({path:`../lyric-compositing-${locale?'en':'ja'}.png`,fullPage:true});
      const legacy={...report.fixture,lyricEffects:{},lyricCutOptions:{},overrides:{},media:{...report.fixture.media,blend:'screen',opacity:45}};
      await load(legacy);
      await page.waitForFunction(()=>J.ui.plan.cuts.filter(c=>Number.isInteger(c.part)).every(c=>c.blend==='screen'&&c.opacity===45));
      assert.equal((await project()).media.opacity,100,'legacy global settings are migrated exactly once');
      await page.evaluate(()=>J.uiApi.flushSave());await page.reload();
      await page.waitForFunction(()=>J.ui.plan.cuts[0].opacity===45);
      assert.deepEqual(errors,[]);
      console.log(locale||'ja','per-cut UI, random limits, locks, undo, migration and reload: OK');
      await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
