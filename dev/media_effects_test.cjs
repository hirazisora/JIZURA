const { chromium } = require('playwright');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    for (const locale of ['', 'en/']) {
      const page = await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', e => { if(e.type() === 'warning' && e.text().startsWith('media trans')) errors.push(e.text()); });
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await page.goto('http://127.0.0.1:8765/' + locale);
      await proMode(page);
      const file = {name:'test.svg', mimeType:'image/svg+xml', buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#ffae42"/><circle cx="35" cy="30" r="22" fill="#185ace"/><path d="M70 10L110 70H50Z" fill="#da185c"/></svg>')};
      for (const layer of ['media','foreground']) {
        await page.locator(layer === 'media' ? '#sourceMedia' : '#sourceForeground').click();
        await page.locator('#mediaFiles').setInputFiles(file);
        await page.locator('#mediaLineList .media-technique').waitFor();
        assert.equal(await page.locator('#mediaLineList .tools select').count(),1);
        assert.equal(await page.locator('.media-technique option').first().getAttribute('value'),'none');
        await page.locator('.media-technique').selectOption('');
        assert.ok(await page.evaluate(layer => !!J.MEDIA_TECH[J.ui.plan[layer].cuts[0].technique],layer));
        await page.locator('#mediaLineList .lock').click();
        const locked = await page.evaluate(layer => J.ui.plan[layer].cuts[0].technique,layer);
        await page.locator(`[data-tab="${layer}Fx"]`).click();
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
        assert.equal(await page.evaluate(layer => J.ui.plan[layer].cuts[0].technique,layer),locked);
        await page.locator('#mediaLineList .lock').click();
        await page.locator('.media-technique').selectOption('pushIn');
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
        assert.equal(await page.evaluate(layer => J.ui.plan[layer].cuts[0].technique,layer),'pushIn');
        await page.locator('.media-technique').selectOption('');
        await page.locator(`#${layer}EffectsPanel [data-media-action="disable"]`).click();
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
        assert.equal(await page.evaluate(layer => J.ui.plan[layer].cuts[0].technique,layer),'none');
        await page.locator(`#${layer}EffectsPanel details`).filter({has:page.locator('[data-media-tech="pixelScatter"]')}).locator('summary').click();
        await page.locator(`#${layer}EffectsPanel [data-media-tech="pixelScatter"]`).check();
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
        assert.equal(await page.evaluate(layer => J.ui.plan[layer].cuts[0].entrance,layer),'pixelScatter');
        assert.equal(await page.evaluate(layer => J.ui.plan[layer].cuts[0].technique,layer),'none');
        await page.locator(`#${layer}EffectsPanel [data-media-action="enable"]`).click();
        await page.locator('.media-technique').selectOption('none');
        await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
        assert.equal(await page.evaluate(layer => J.ui.plan[layer].cuts[0].technique,layer),'none');
      }
      const report = await page.evaluate(() => {
        const failures=[], signatures = new Set(), c=document.createElement('canvas'); c.width=320;c.height=180;
        const ctx=c.getContext('2d'), item=J.ui.project.foreground.items[0];
        for (const key of ['none', ...Object.keys(J.MEDIA_TECH)]) {
          const project = structuredClone(J.ui.project); project.foreground = {items:[item],cutOverrides:{0:{technique:key,entrance:J.MEDIA_TECH[key]?.stage==='enter'?key:'none',departure:J.MEDIA_TECH[key]?.stage==='exit'?key:'none',placement:{cx:.5,cy:.5,w:.4}}}};
          const plan=J.planMedia(project,{duration:4,lines:[]},0,'foreground'), cut=plan.cuts[0];
          for (const p of [.01,.05,.5,.95,.99]) {
            ctx.clearRect(0,0,320,180); J.drawMediaCut(ctx,cut,p*4);
            const data=ctx.getImageData(0,0,320,180).data;
            if (!data.some((value,index) => index%4===3 && value>0)) failures.push(key+':empty:'+p);
            if(!data.some((value,index)=>index%4===3 && value===0)) failures.push(key+':lost transparent surroundings:'+p);
            if(p===.05) signatures.add(c.toDataURL());
          }
          if(key==='none') {
            ctx.clearRect(0,0,320,180);J.drawMediaCut(ctx,cut,0);
            if(ctx.getImageData(160,90,1,1).data[3]!==255) failures.push('none: not instant');
          }
        }
        for (const layer of ['media','foreground']) for (const key of Object.keys(J.MEDIA_TECH).filter(k => k.startsWith('transition_'))) {
          const project=structuredClone(J.ui.project);
          project[layer]={items:[item],manualCuts:true,cutCount:2,cutOverrides:{0:{technique:'none'},1:{technique:key}},timing:{lineTimes:{0:0,1:2}}};
          const plan=J.plan(project,null);plan[layer]=J.planMedia(project,plan,0,layer);
          const cut=plan[layer].cuts[1];
          if(!cut.trans) failures.push(key+':missing transition');
          for(const p of [.1,.5,.9]) {ctx.clearRect(0,0,320,180);J.drawMedia(ctx,plan,cut.start+cut.transDur*p,{},layer);}
        }
        // Composite an actual green-keyed source at low opacity; green must stay transparent.
        const source=document.createElement('canvas');source.width=120;source.height=80;
        const x=source.getContext('2d');x.fillStyle='#00ff00';x.fillRect(0,0,120,80);x.fillStyle='red';x.fillRect(40,20,40,40);
        const video={id:'keyed',name:'keyed',type:'video'};J.mediaAssets.set(video.id,{element:source});
        for (const key of ['none','iris','echo','glitch']) {
          const plan=J.planMedia({seed:1,foreground:{items:[video],cutOverrides:{0:{technique:key,chromaKey:true,placement:{cx:.5,cy:.5,w:.84375}}}}},{duration:4,lines:[]},0,'foreground');
          ctx.clearRect(0,0,320,180);ctx.globalAlpha=.3;J.drawMediaCut(ctx,plan.cuts[0],2);ctx.globalAlpha=1;
          if(ctx.getImageData(40,50,1,1).data[3]) failures.push(key+':chroma leaked');
          if(!ctx.getImageData(160,90,1,1).data[3]) failures.push(key+':subject disappeared');
        }
        // Scratch buffers must render the current video frame, never a cached still.
        for (const key of J.MEDIA_VARIATION_KEYS) {
          const project={seed:3,foreground:{items:[video],cutOverrides:{0:{technique:key,entrance:J.MEDIA_TECH[key]?.stage==='enter'?key:'none',departure:J.MEDIA_TECH[key]?.stage==='exit'?key:'none',placement:{cx:.5,cy:.5,w:.4}}}}};
          const cut=J.planMedia(project,{duration:4,lines:[]},0,'foreground').cuts[0];
          const snapshots=[];
          for(const offset of [0,30]) {
            x.clearRect(0,0,120,80); x.fillStyle='#ff4060';x.fillRect(25+offset,20,20,25);
            ctx.clearRect(0,0,320,180);ctx.globalAlpha=.3;J.drawMediaCut(ctx,cut,2);ctx.globalAlpha=1;
            if(ctx.getImageData(0,0,1,1).data[3])failures.push(key+':transparent corner filled');
            snapshots.push(c.toDataURL());
          }
          if(snapshots[0]===snapshots[1])failures.push(key+':video frame did not update');
          ctx.clearRect(0,0,320,180);J.drawMediaCut(ctx,cut,.12);const first=c.toDataURL();
          ctx.clearRect(0,0,320,180);J.drawMediaCut(ctx,cut,3.9);
          ctx.clearRect(0,0,320,180);J.drawMediaCut(ctx,cut,.12);
          if(c.toDataURL()!==first)failures.push(key+':seeking changed rendering');
        }
        return {failures,distinct:signatures.size,total:Object.keys(J.MEDIA_TECH).length};
      });
      assert.deepEqual(report.failures,[]); assert.ok(report.distinct>=60,JSON.stringify(report)); assert.ok(report.total > 120);
      await page.locator('.media-technique').selectOption('neonContour');
      await page.locator('#btnUndo').click();
      assert.equal(await page.locator('.media-technique').inputValue(),'none');
      await page.locator('#btnRedo').click();
      assert.equal(await page.locator('.media-technique').inputValue(),'neonContour');
      if(!locale) await page.screenshot({path:'../media-effects-ui.png',fullPage:true});
      await page.reload(); await page.locator('#sourceForeground').click();
      assert.equal(await page.locator('.media-technique').inputValue(),'neonContour');
      assert.deepEqual(errors,[]);
      console.log(locale || 'ja',report);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
