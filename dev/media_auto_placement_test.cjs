const {chromium} = require('playwright');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    for(const locale of ['', 'en/']) {
      const page=await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:8765/'+locale);
      await proMode(page);
      const planning=await page.evaluate(()=>{
        const failures=[], same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
        for(const [width,height,type] of [[1024,1024,'image'],[1920,1080,'image'],[720,1280,'video']]) {
          for(const [W,H] of [[1920,1080],[1080,1920]]) for(const layer of ['foreground','media']) {
            const item={id:'fixture',name:'fixture',type,width,height};
            const project={seed:3,[layer]:{items:[item],loop:true,cutCount:12,seed:1,cutOverrides:Object.fromEntries(Array.from({length:12},(_,i)=>[i,{technique:null}]))}};
            const lyric={duration:24,lines:[],W,H}, saved=JSON.stringify(project);
            const plan=()=>J.planMedia(project,lyric,null,layer).cuts;
            const first=plan();
            if(!same(first,plan()))failures.push('non-deterministic planning');
            if(JSON.stringify(project)!==saved)failures.push('planner mutated saved project');
            if(new Set(first.map(c=>c.placement?.w.toFixed(4))).size<4)failures.push('too few sizes');
            if(new Set(first.map(c=>c.placement?.cx.toFixed(2)+':'+c.placement?.cy.toFixed(2))).size<4)failures.push('too few positions');
            for(const cut of first) {
              const r=J.mediaPlacementRect(cut.placement,width,height,W,H);
              if(Math.abs(r.w*W/(r.h*H)-width/height)>1e-8)failures.push('aspect ratio changed');
              if(layer==='media' && cut.bgLayout) {
                // A dynamic layout fills its mask window (background_layout_test); the whole-stage rules are for plain framings.
              } else if(layer==='media') {
                const fit=J.mediaPlacementRect(null,width,height,W,H);
                if(r.w<fit.w-1e-9||r.h<fit.h-1e-9)failures.push('background smaller than 100% full fit');
                for(const [start,extent] of [[r.x,r.w],[r.y,r.h]]) {
                  if(extent>=1 && (start>1e-9||start+extent<1-1e-9))failures.push('enlarged background exposes an edge');
                  if(extent<1 && (start<0||start+extent>1))failures.push('background cropped on the smaller axis');
                }
              } else if(r.x<.025||r.y<.025||r.x+r.w> .975||r.y+r.h>.975)failures.push('base placement outside safe bounds');
            }
            project.seed=200;
            if(same(first.map(c=>c.placement),plan().map(c=>c.placement)))failures.push('shuffle did not change placement');
            const locked=first[0];
            project[layer].cutOverrides[0]={technique:null,lock:true,lockedSeed:locked.seed,lockedTechnique:locked.technique,lockedPlacement:locked.placement,lockedPlacementMode:'auto'};
            project.mediaEffects={autoPlacement:false};
            if(!same(plan()[0].placement,locked.placement))failures.push('lock did not preserve framing');
            if(plan()[1].placement!==null)failures.push('disabled automatic placement still active');
            const manual={cx:.2,cy:.7,w:.34,h:.25,lockAspect:false,angle:27};
            project[layer].cutOverrides[0]={technique:'pushIn',placement:manual};
            if(!same(plan()[0].placement,manual))failures.push('manual placement changed');
            delete project.mediaEffects;
            project[layer].cutOverrides[0]={technique:'none'};
            if(plan()[0].placement!==null)failures.push('no-effects framing changed');
            project[layer].cutOverrides[0]={enter:'slide',layout:'cover'};
            if(plan()[0].placement!==null)failures.push('legacy framing changed');
            project[layer].cutOverrides[0]={technique:'pushIn',lock:true,lockedSeed:2};
            if(plan()[0].placement!==null)failures.push('old locked framing changed');
          }
        }
        return failures;
      });
      assert.deepEqual(planning,[]);
      for(const layer of ['foreground','media']) {
        await page.locator(layer==='media'?'#sourceMedia':'#sourceForeground').click();
        await page.locator('#mediaFiles').setInputFiles({name:layer+'.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="320"><circle cx="90" cy="160" r="80" fill="cyan"/></svg>')});
        await page.locator('.media-technique').waitFor();
        assert.deepEqual(await page.evaluate(layer=>[J.ui.project[layer].items[0].width,J.ui.project[layer].items[0].height],layer),[180,320]);
        await page.locator('.media-technique').selectOption('pushIn');
        const current=()=>page.evaluate(layer=>J.ui.plan[layer].cuts[0].placement,layer);
        const initial=await current();assert.ok(initial);
        await page.locator(`[data-tab="${layer}Fx"]`).click();
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
        assert.notDeepEqual(await current(),initial);
        await page.locator('#mediaLineList .lock').click();const locked=await current();
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();assert.deepEqual(await current(),locked);
        await page.locator('#mediaLineList .lock').click();
        await page.locator('.foreground-placement-open').click();
        const rect=await page.locator('#areaEditRect').boundingBox(),view=await page.locator('#view').boundingBox();
        // A portrait image covering the frame reaches far outside the preview: drag from its visible part.
        const box={x:Math.max(rect.x,view.x),y:Math.max(rect.y,view.y)};box.width=Math.min(rect.x+rect.width,view.x+view.width)-box.x;box.height=Math.min(rect.y+rect.height,view.y+view.height)-box.y;
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+25,box.y+box.height/2+10,{steps:5});await page.mouse.up();
        await page.locator('#areaApplyOne').click();const manual=await current();
        assert.equal(await page.evaluate(layer=>J.ui.plan[layer].cuts[0].placementMode,layer),'manual');
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();assert.deepEqual(await current(),manual);
        await page.locator('.foreground-placement-reset').click();
        assert.equal(await page.evaluate(layer=>J.ui.plan[layer].cuts[0].placementMode,layer),'auto');
        await page.locator('#btnUndo').click();assert.deepEqual(await current(),manual);
        await page.locator('#btnRedo').click();
        await page.locator(`#${layer}EffectsPanel [data-media-setting="autoPlacement"]`).uncheck();assert.equal(await current(),null);
        await page.locator(`#${layer}EffectsPanel [data-media-setting="autoPlacement"]`).check();const restored=await current();assert.ok(restored);
        await page.reload();await page.waitForFunction(()=>J.mediaAssets.size>0);await page.locator(layer==='media'?'#sourceMedia':'#sourceForeground').click();
        assert.deepEqual(await current(),restored);
      }
      assert.deepEqual(errors,[]);console.log(locale||'ja','automatic placement: OK');await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
