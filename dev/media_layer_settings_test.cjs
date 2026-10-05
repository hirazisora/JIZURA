const {chromium} = require('playwright');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    for (const locale of ['', 'en/']) {
      const page = await browser.newPage({viewport:{width:1500,height:1000}}), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType:'text/css',body:''}));
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
      await page.goto('http://127.0.0.1:8765/' + locale);
      await proMode(page);
      for (const layer of ['foreground','media']) {
        await page.locator(layer === 'media' ? '#sourceMedia' : '#sourceForeground').click();
        await page.locator('#mediaFiles').setInputFiles(['cyan','coral','gold'].map(color => ({
          name:color + '.svg', mimeType:'image/svg+xml',
          buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><circle cx="80" cy="45" r="35" fill="${color}"/></svg>`),
        })));
        await page.waitForFunction(layer => J.ui.project[layer].items.length === 3 && J.ui.plan[layer].cuts.length === 3, layer);
      }
      // Import a real old-format project with shared settings and automatic cuts.
      const legacy = await page.evaluate(() => {
        const p = structuredClone(J.ui.project); p.lyrics = '';
        p.mediaEffects = {motion:.65,treatment:.4,duration:.6,autoPlacement:false,enabled:Object.fromEntries(Object.keys(J.MEDIA_TECH).map(key => [key,key === 'neonContour']))};
        for (const layer of ['foreground','media']) {
          delete p[layer].effects;
          Object.assign(p[layer], {loop:true,cutCount:6,randomOrder:true,cutOverrides:Object.fromEntries(Array.from({length:6},(_,i) => [i,{technique:null}]))});
        }
        return p;
      });
      await page.locator('#fileProject').setInputFiles({name:'shared.jizura.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
      await page.waitForFunction(() => J.ui.plan.foreground.cuts.length === 6);
      const snapshot = layer => page.evaluate(layer => ({project:J.ui.project[layer],cuts:J.ui.plan[layer].cuts}), layer);
      // The foreground composes with the background's dynamic layouts: when the background tab changes, only the foreground's placement may follow.
      const settingsOnly = (s, layer) => layer === 'media' ? JSON.parse(JSON.stringify(s, (k, v) => ['placement', 'composition', 'compositionZone', 'placementMode'].includes(k) ? undefined : v)) : s;
      for (const layer of ['foreground','media']) {
        const initial = await snapshot(layer);
        // Settings added since then take their defaults; every old shared value survives.
        const kept = effects => Object.fromEntries(Object.keys(legacy.mediaEffects).map(key => [key, effects[key]]));
        assert.deepEqual(kept(initial.project.effects), legacy.mediaEffects, 'old shared values must survive migration');
        assert.ok(initial.cuts.every(c => c.technique === 'neonContour' && c.placement === null));
        assert.ok(initial.cuts.every(c => JSON.stringify(kept(c.effectSettings)) === JSON.stringify(legacy.mediaEffects)));
      }
      assert.equal(await page.evaluate(() => J.ui.project.foreground.effects.enabled === J.ui.project.media.effects.enabled), false);
      assert.equal(await page.evaluate(() => Object.hasOwn(J.ui.project, 'mediaEffects')), false);

      for (const layer of ['foreground','media']) {
        const other = layer === 'foreground' ? 'media' : 'foreground', untouched = await snapshot(other);
        const tab = page.locator(`[data-tab="${layer}Fx"]`), panel = page.locator(`#${layer}EffectsPanel`);
        await tab.click();
        assert.equal(await tab.innerText(), layer === 'foreground' ? (locale ? 'Foreground' : '前景') : (locale ? 'Background' : '背景'));
        assert.equal(await panel.isVisible(), true);
        assert.equal(await page.locator(`#${other}EffectsPanel`).isVisible(), false);
        // The マスク category (background-only techniques) appears in the background panel only.
        assert.equal(await panel.locator('[data-media-tech]').count(), await page.evaluate(layer=>Object.keys(J.MEDIA_TECH).filter(key=>J.mediaTechAllowed(key,layer)).length,layer));
        assert.equal(await panel.locator('details[data-media-group]').count(),layer==='media'?10:9);// 8 technique categories (+ マスク on the background) + 装飾
        assert.equal(await panel.locator('details[open]').count(),0,'categories initially collapse independently per layer');
        assert.equal(await panel.locator('[data-media-tech]').first().isVisible(),false);
        const cinema = panel.locator('[data-media-group="cinema"]'), total = await cinema.locator('[data-media-tech]').count();
        await cinema.locator('summary').click();
        await cinema.locator('[data-media-group-action="on"]').click();
        assert.equal(await cinema.locator('.tg-cnt').innerText(),`${total}/${total}`);
        assert.equal(await cinema.locator('[data-media-tech]:checked').count(),total);
        await cinema.locator('[data-media-group-action="flip"]').click();
        assert.equal(await cinema.locator('.tg-cnt').innerText(),`0/${total}`);
        await cinema.locator('[data-media-tech]').first().check();
        assert.equal(await cinema.locator('.tg-cnt').innerText(),`1/${total}`);
        await cinema.locator('[data-media-group-action="off"]').click();
        assert.equal(await cinema.evaluate(el=>el.open),true,'bulk edits keep the category expanded');
        await cinema.locator('summary').click();
        assert.equal(await panel.locator('[data-media-tech]').first().isVisible(),false);
        assert.deepEqual(await snapshot(other),untouched,'category actions must stay local to the tab');
        if(locale) assert.doesNotMatch(await panel.locator('summary').allTextContents().then(text=>text.join(' ')),/[\u3040-\u30ff\u4e00-\u9fff]/);
        const values = layer === 'foreground' ? {motion:1.6,treatment:.8,duration:.25} : {motion:.3,treatment:.1,duration:1.2};
        for (const [key,value] of Object.entries(values)) {
          await panel.locator(`[data-media-setting="${key}"]`).evaluate((el,value) => {el.value = value; el.dispatchEvent(new Event('input',{bubbles:true}));}, String(value));
          await page.waitForFunction(({layer,key,value}) => J.ui.plan[layer].cuts.every(c => c.effectSettings[key] === value), {layer,key,value});
        }
        await panel.locator('[data-media-setting="autoPlacement"]').check();
        assert.ok((await snapshot(layer)).cuts.every(c => c.placementMode === 'auto'));
        // The foreground composes with the background's dynamic layouts, so its placement follows the background tab's automatic placement.
        assert.deepEqual(settingsOnly(await snapshot(other), layer), settingsOnly(untouched, layer), 'sliders and automatic placement must stay local to the tab');

        const resolvedCuts = cuts => cuts.map(c => ({...c,effectSettings:Object.fromEntries(Object.entries(c.effectSettings).filter(([key])=>key!=='enabled'))}));
        const resolvedBeforeDisable = resolvedCuts((await snapshot(layer)).cuts);
        await panel.locator('[data-media-action="disable"]').click();
        assert.equal(await panel.locator('[data-media-tech]:checked').count(),0);
        assert.deepEqual(resolvedCuts((await snapshot(layer)).cuts),resolvedBeforeDisable,'candidate edits preserve resolved cut effects until an explicit shuffle');
        await panel.locator('[data-media-action="shuffle"]').click();
        assert.ok((await snapshot(layer)).cuts.every(c => c.technique === 'none'));
        const technique = layer === 'foreground' ? 'neonContour' : 'pushIn';
        await panel.locator('details').filter({has:page.locator(`[data-media-tech="${technique}"]`)}).locator('summary').click();
        await panel.locator(`[data-media-tech="${technique}"]`).check();
        assert.ok((await snapshot(layer)).cuts.every(c => c.technique === 'none'),'checking a candidate does not reroll existing cuts');
        await page.locator('#btnUndo').click();
        assert.ok((await snapshot(layer)).cuts.every(c => c.technique === 'none'));
        assert.equal(await panel.locator(`[data-media-tech="${technique}"]`).isChecked(), false);
        await page.locator('#btnRedo').click();
        assert.equal(await panel.locator(`[data-media-tech="${technique}"]`).isChecked(),true);
        assert.ok((await snapshot(layer)).cuts.every(c => c.technique === 'none'),'redo restores candidates without rerolling');
        await panel.locator('[data-media-action="shuffle"]').click();
        assert.ok((await snapshot(layer)).cuts.every(c => c.technique === technique));
        await panel.locator('[data-media-action="enable"]').click();
        assert.equal(await panel.locator('[data-media-tech]:checked').count(), await page.evaluate(layer=>Object.keys(J.MEDIA_TECH).filter(key=>J.mediaTechAllowed(key,layer)).length,layer));
        assert.ok((await snapshot(layer)).cuts.every(c => c.technique === technique),'enabling candidates preserves resolved effects');
        assert.deepEqual(settingsOnly(await snapshot(other), layer), settingsOnly(untouched, layer), 'candidate edits, undo and tab shuffle must stay local to the tab');
        await page.locator('#btnUndo').click();

        const beforeShuffle = await snapshot(layer);
        await panel.locator('[data-media-action="shuffle"]').click();
        const afterShuffle = await snapshot(layer);
        assert.notDeepEqual(afterShuffle.cuts.map(c => c.placement), beforeShuffle.cuts.map(c => c.placement));
        assert.deepEqual(afterShuffle.project.effects, beforeShuffle.project.effects);
        assert.deepEqual(settingsOnly(await snapshot(other), layer), settingsOnly(untouched, layer), 'tab shuffle must not change the other layer or its material order');
      }
      const beforeGlobal = {foreground:await snapshot('foreground'),media:await snapshot('media')};
      await page.locator('#btnShuffle').click();
      for (const layer of ['foreground','media']) {
        assert.notDeepEqual((await snapshot(layer)).cuts.map(c => c.seed), beforeGlobal[layer].cuts.map(c => c.seed));
        assert.deepEqual((await snapshot(layer)).project.effects, beforeGlobal[layer].project.effects);
      }
      const randomChecks = await page.evaluate(() => {
        const failures=[], p=structuredClone(J.ui.project), original=JSON.stringify(p);
        const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b), keys=Object.keys(J.MEDIA_TECH);
        for(const seed of [12,71,2026]) {
          const a=J.omakase(p,J.rng(seed)), b=J.omakase(p,J.rng(seed));
          for(const layer of ['foreground','media']) {
            const effects=a[layer].effects, on=keys.filter(key=>effects.enabled[key]);
            if(!on.length||on.length===keys.length)failures.push('random subset missing on/off values');
            if(!same(effects,b[layer].effects))failures.push('seeded randomization is not reproducible');
            for(const key of ['motion','treatment','duration','autoPlacement'])if(effects[key]!==p[layer].effects[key])failures.push('randomization changed '+key);
          }
          if(same(a.foreground.effects.enabled,a.media.effects.enabled))failures.push('layers share one random subset');
        }
        for(const value of [0,.999]) {
          const settings=J.randomMediaEffectSettings(p,'foreground',()=>value);
          const on=keys.filter(key=>settings.enabled[key]);
          if(!on.length||on.length===keys.length)failures.push('degenerate random source leaves no variation');
        }
        if(JSON.stringify(p)!==original)failures.push('randomization mutated the input project');
        return failures;
      });
      assert.deepEqual(randomChecks,[]);
      await page.evaluate(() => {
        for(const layer of ['foreground','media'])Object.assign(J.ui.project[layer].cutOverrides,{
          0:{technique:'iris'},1:{technique:'none'},
          2:{technique:null,lock:true,lockedTechnique:'glitch',lockedSeed:42,lockedItemId:J.ui.project[layer].items[0].id,lockedPlacement:{cx:.5,cy:.5,w:.5}},
          3:{itemId:null,technique:null},
        });
        J.uiApi.replan();
      });
      const beforeRandom={foreground:await snapshot('foreground'),media:await snapshot('media')};
      await page.locator('#btnOmakase').click();
      const afterRandom={foreground:await snapshot('foreground'),media:await snapshot('media')};
      for(const layer of ['foreground','media']) {
        const before=beforeRandom[layer], after=afterRandom[layer], {effects,...rest}=after.project;
        // autoEffects is the generated cache refreshed by an explicit randomize; manual options must survive.
        const manualSettings = project => {const {effects,...rest}=project;return {...rest,cutOverrides:Object.fromEntries(Object.entries(rest.cutOverrides).map(([index,{autoEffects,...manual}])=>[index,manual]))};};
        assert.deepEqual(manualSettings(after.project),manualSettings(before.project),'omakase preserves material and explicit cut settings');
        assert.notDeepEqual(effects.enabled,before.project.effects.enabled);
        assert.deepEqual(after.cuts.slice(0,3).map(c=>c.technique),['iris','none','glitch'],'manual, no-effects and locked cuts stay fixed');
        assert.equal(after.cuts[3].itemId,null);
        assert.ok(after.cuts.slice(4).every(c=>effects.enabled[c.technique]),'automatic cuts must use enabled techniques');
        const panel=page.locator(`#${layer}EffectsPanel`);
        const uiChecks=await panel.locator('[data-media-tech]').evaluateAll(inputs=>Object.fromEntries(inputs.map(el=>[el.dataset.mediaTech,el.checked])));
        assert.deepEqual(uiChecks,effects.enabled,'omakase updates visible checkbox state');
        for(const group of await panel.locator('details').all()) {
          const input=await group.getAttribute('data-media-group')==='decor'?'[data-media-decor]':'[data-media-tech]';// 装飾 counts decorations
          const total=await group.locator(input).count(), on=await group.locator(input+':checked').count();
          assert.equal(await group.locator('.tg-cnt').innerText(),`${on}/${total}`);
        }
      }
      await page.locator('#btnUndo').click();
      for(const layer of ['foreground','media'])assert.deepEqual((await snapshot(layer)).project.effects,beforeRandom[layer].project.effects,'undo restores randomized candidates');
      await page.locator('#btnRedo').click();
      for(const layer of ['foreground','media'])assert.deepEqual((await snapshot(layer)).project.effects,afterRandom[layer].project.effects,'redo restores randomized candidates');
      await page.evaluate(()=>{J.ui.project.foreground.timing.lineTimes[0]=.25;J.uiApi.replan();});
      assert.equal(await page.locator('#btnPrev, #btnNext').count(),0);
      assert.equal((await snapshot('foreground')).project.timing.lineTimes[0],.25);
      const saved = {foreground:await snapshot('foreground'),media:await snapshot('media')};
      const downloadReady = page.waitForEvent('download');
      await page.locator('#projectMenu summary').click();await page.locator('#btnSave').click();await page.locator('#saveFilename').fill('素材 保存 テスト.jizuraichi');await page.locator('#filenameDlg button[value="save"]').click();
      const download = await downloadReady, chunks = [];
      for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      const json = Buffer.concat(chunks);
      assert.deepEqual(JSON.parse(json.subarray(12,12+json.readUInt32LE(8)).toString()).project.foreground.effects, saved.foreground.project.effects);
      assert.deepEqual(JSON.parse(json.subarray(12,12+json.readUInt32LE(8)).toString()).project.media.effects, saved.media.project.effects);
      await page.reload();
      await page.waitForFunction(() => J.mediaAssets.size === 6);
      for (const layer of ['foreground','media']) assert.deepEqual(await snapshot(layer), saved[layer], 'autosave reload must preserve each layer');
      await page.locator('#fileProject').setInputFiles({name:'split.jizura',mimeType:'application/octet-stream',buffer:json});
      await page.waitForFunction(() => document.querySelector('#fileProject').value === '');
      for (const layer of ['foreground','media']) assert.deepEqual(await snapshot(layer), saved[layer], 'saved JSON must preserve each layer');
      await page.locator('[data-tab="foregroundFx"]').click();
      await page.screenshot({path:`../media-layer-settings-${locale ? 'en' : 'ja'}.png`,fullPage:true});
      assert.deepEqual(errors, []);
      console.log(locale || 'ja', 'folding, category actions, independent random subsets, locked/manual cuts, shuffle, undo/redo and save/reload: OK');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exit(1);});
