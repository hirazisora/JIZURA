const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    for(const locale of ['', 'en/']) {
      const page=await browser.newPage({viewport:{width:1500,height:1000}}), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:8765/'+locale);
      await page.locator('#modePro').click();
      for(const layer of ['foreground','media']) {
        await page.locator(layer==='media'?'#sourceMedia':'#sourceForeground').click();
        const files=['cyan','coral','gold'].map((color,i)=>({name:color+'.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><circle cx="60" cy="40" r="30" fill="${['cyan','coral','gold'][i]}"/></svg>`)}));
        await page.locator('#mediaFiles').setInputFiles(files);
        await page.waitForFunction(layer=>J.ui.project[layer].items.length===3&&J.ui.plan[layer].cuts.length===3,layer);
        await page.locator('#mediaLoop').check();
        await page.locator('#mediaLineList .media-cut-insert button').nth(2).click();
        assert.equal(await page.evaluate(layer=>J.ui.project[layer].manualCuts,layer),true);
        assert.equal(await page.locator('#mediaRandom').isEnabled(),true,'manual edits must not disable random order');
        const baseline=await page.evaluate(layer=>({ids:J.ui.plan[layer].cuts.map(c=>c.itemId),times:J.ui.plan[layer].cuts.map(c=>c.start),overrides:structuredClone(J.ui.project[layer].cutOverrides)}),layer);
        await page.locator('#mediaRandom').check();
        const shuffled=await page.evaluate(layer=>{
          const cuts=J.ui.plan[layer].cuts,order=J.mediaOrder(J.ui.project,layer).map(i=>i.id);
          return {ids:cuts.map(c=>c.itemId),times:cuts.map(c=>c.start),sequence:cuts.filter(c=>c.itemId).map((c,i)=>c.itemId===order[i%order.length]),sources:cuts.map(c=>c.sourceItemId),overrides:J.ui.project[layer].cutOverrides};
        },layer);
        assert.ok(shuffled.sequence.every(Boolean));assert.equal(shuffled.ids[2],null);
        assert.deepEqual(shuffled.sources,baseline.ids);assert.deepEqual(shuffled.times,baseline.times);assert.deepEqual(shuffled.overrides,baseline.overrides);
        assert.equal(await page.locator('.media-cut-file').first().isDisabled(),true);
        await page.locator('#mediaRandom').uncheck();
        assert.deepEqual(await page.evaluate(layer=>J.ui.plan[layer].cuts.map(c=>c.itemId),layer),baseline.ids);
        assert.equal(await page.locator('.media-cut-file').first().isEnabled(),true);
        await page.locator('#btnUndo').click();assert.equal(await page.locator('#mediaRandom').isChecked(),true);
        await page.locator('#btnRedo').click();assert.equal(await page.locator('#mediaRandom').isChecked(),false);
        await page.locator('#mediaRandom').check();
        await page.locator('#mediaLineList .lock').first().click();
        const locked=await page.evaluate(layer=>J.ui.plan[layer].cuts[0].itemId,layer);
        await page.locator(`[data-tab="${layer}Fx"]`).click();await page.locator(`#${layer}EffectsPanel [data-media-action="shuffle"]`).click();
        assert.equal(await page.evaluate(layer=>J.ui.plan[layer].cuts[0].itemId,layer),locked);
        // Editing cut structure while shuffled must preserve the underlying manual order.
        await page.locator('#mediaLineList .media-cut-insert button').last().click();
        await page.locator('#mediaLineList .remove-media-cut').last().click();
        await page.locator('#mediaRandom').uncheck();
        const restored=await page.evaluate(layer=>J.ui.plan[layer].cuts.map(c=>c.itemId),layer);
        assert.deepEqual(restored,[locked,...baseline.ids.slice(1)]);
        await page.locator('#mediaRandom').check();const beforeReload=await page.evaluate(layer=>J.ui.plan[layer].cuts.map(c=>c.itemId),layer);
        await page.reload();await page.locator(layer==='media'?'#sourceMedia':'#sourceForeground').click();
        assert.equal(await page.locator('#mediaRandom').isEnabled(),true);assert.equal(await page.locator('#mediaRandom').isChecked(),true);
        assert.deepEqual(await page.evaluate(layer=>J.ui.plan[layer].cuts.map(c=>c.itemId),layer),beforeReload);
        // Loop tap-sync uses the same order, and can be toggled afterward.
        await page.locator('#btnTapMedia').click();
        for(let i=0;i<7;i++)await page.evaluate(t=>{J.ui.t=t;document.querySelector('#tapBtn').click()},.4+i);
        await page.locator('#tapStop').click();
        assert.equal(await page.locator('#mediaRandom').isEnabled(),true);
        assert.ok(await page.evaluate(layer=>{const order=J.mediaOrder(J.ui.project,layer);return J.ui.plan[layer].cuts.every((c,i)=>c.itemId===order[i%order.length].id)},layer));
        await page.locator('#mediaRandom').uncheck();
        assert.ok(await page.evaluate(layer=>{const items=J.ui.project[layer].items;return J.ui.plan[layer].cuts.every((c,i)=>c.itemId===items[i%items.length].id)},layer));
        await page.locator('#mediaRandom').check();
        await page.locator('#mediaList .media-item button').last().click();
        await page.locator('#mediaList .media-item button').last().click();
        assert.equal(await page.locator('#mediaRandom').isEnabled(),true,'a checked option must remain switchable with one asset');
        await page.locator('#mediaRandom').uncheck();assert.equal(await page.locator('#mediaRandom').isDisabled(),true);
      }
      assert.deepEqual(errors,[]);console.log(locale||'ja','random order: OK');await page.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
