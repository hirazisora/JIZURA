// Locked cuts change only through direct operations on them (re-roll, details, position); edits elsewhere,
// inserting or typing lyrics, おまかせ, シャッフル and style changes leave them exactly as they were.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openSettings,closeSettings,proMode,timelineAction}=require('./ui_helpers.cjs');
const root=path.join(__dirname,'..');
const LOCKED='ねえまだ間に合うかな';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const lang of ['','en/']){
 const failures=[],check=(ok,m)=>{if(!ok)failures.push(m)};
 const scenario=async(name,op,expect)=>{
  const p=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  const url='http://localhost:8765/'+lang;await p.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,lang,'index.html'))}):r.abort());
  await p.goto(url);await proMode(p);
  await p.evaluate(()=>{const P=J.ui.project;P.lyrics=['夜明けの色を覚えてる','ほどけた声が遠くで鳴った','ねえまだ間に合うかな','透明なままじゃ終われない','この歌で夜をこえてく'].join('\n');
   P.timing.lineTimes={0:1,1:5,2:9,3:13,4:17};P.durationOverride=21;P.lyricEffects={...P.lyricEffects,autoPlacement:true};
   for(const [layer,id,color] of [['foreground','fg','#e33'],['media','bg','#33e']]){const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,400,300);J.mediaAssets.set(id,{element:c,type:'image'});
    P[layer]={...P[layer],items:[{id,name:id+'.png',type:'image',width:400,height:300}],manualCuts:true,cutCount:5,timing:{lineTimes:{0:1,1:5,2:9,3:13,4:17}},cutOverrides:Object.fromEntries([0,1,2,3,4].map(i=>[i,{itemId:id,technique:null}]))};}
   J.uiApi.syncUI();J.uiApi.replan();J.uiApi.pause();J.uiApi.seek(10);});
  await p.waitForTimeout(200);await p.locator('#showItemFrames').check();
  for(const layer of ['lyrics','foreground','media']){await p.locator(`.item-frame-action[data-action="lock"][data-layer="${layer}"]`).first().click();await p.waitForTimeout(100);}
  // The locked cuts, found by content rather than index (inserting shifts indices).
  const sig=()=>p.evaluate(LOCKED=>{const P=J.ui.plan,drop=new Set(['index','start','end','dur','displayEnd','words','line','group','text','lineText','sourceItemId','songBeats','placementMode','areaMode','groupExit','groupOutDur']);
   const clean=c=>JSON.stringify(Object.fromEntries(Object.entries({...c,...(Number.isInteger(c.part)?{effectStyle:c.effectStyle||P.style,effectFx:c.effectFx||P.fx}:{})}).filter(([k])=>!drop.has(k)).sort()));
   const line=P.lines.find(l=>l.text===LOCKED);
   const media=l=>{const c=P[l].cuts.find(c=>J.ui.project[l].cutOverrides[c.index]?.lock);return c?clean(c):null;};
   return {lyric:P.cuts.filter(c=>c.line===line?.index&&Number.isInteger(c.part)).map(clean),lyricLocked:!!J.ui.project.overrides[line?.index]?.lock,
    fg:media('foreground'),bg:media('media'),fgLocked:Object.values(J.ui.project.foreground.cutOverrides).some(o=>o.lock),bgLocked:Object.values(J.ui.project.media.cutOverrides).some(o=>o.lock)};},LOCKED);
  const before=await sig();
  await op(p);await p.waitForTimeout(300);
  const after=await sig();
  // Style settings the locked look did not have yet (new style keys) fall back to the current style.
  const same=(k,x,y)=>['effectStyle','effectFx'].includes(k)&&x&&y?Object.keys(x).every(s=>JSON.stringify(x[s])===JSON.stringify(y[s])):JSON.stringify(x)===JSON.stringify(y);
  const changed=(a,b)=>{const A=JSON.parse(a||'{}'),B=JSON.parse(b||'{}');return Object.keys({...A,...B}).filter(k=>!same(k,A[k],B[k]));};
  const lyricChanged=before.lyric.length!==after.lyric.length?['parts']:[...new Set(before.lyric.flatMap((x,i)=>changed(x,after.lyric[i])))];
  check(after.lyricLocked&&after.fgLocked&&after.bgLocked,`${name}: still locked`);
  expect({lyric:lyricChanged,fg:changed(before.fg,after.fg),bg:changed(before.bg,after.bg)},(ok,m)=>check(ok,`${name}: ${m}`));
  check(!errors.length,`${name}: page errors ${errors}`);await p.close();};
 const seekAnd=async(p,t)=>{await p.locator('#showItemFrames').check();await p.evaluate(t=>{J.uiApi.pause();J.uiApi.seek(t);},t);await p.waitForTimeout(120);};
 const unchanged=(c,ok)=>{ok(!c.lyric.length,'lyric changed: '+c.lyric);ok(!c.fg.length,'foreground changed: '+c.fg);ok(!c.bg.length,'background changed: '+c.bg);};
 // Indirect changes: nothing moves.
 await scenario('resize another lyric area',p=>p.evaluate(()=>{J.ui.project.overrides[1]={...J.ui.project.overrides[1],area:{x:.1,y:.1,w:.4,h:.3,angle:0,lockAspect:true}};J.uiApi.replan();}),unchanged);
 await scenario('move another foreground cut',p=>p.evaluate(()=>{J.ui.project.foreground.cutOverrides[1].placement={cx:.3,cy:.3,w:.3,h:.225,lockAspect:true,angle:0};J.uiApi.replan();}),unchanged);
 await scenario('re-roll the previous line and cut',async p=>{await seekAnd(p,6);for(const l of ['lyrics','foreground','media'])await p.locator(`.item-frame-action[data-action="dice"][data-layer="${l}"]`).first().click();},unchanged);
 await scenario('insert a lyric before it',async p=>{await seekAnd(p,7);await p.locator('[data-playhead-menu="insert"]').click();await p.locator('#insertLyricAtPlayhead').click();await p.locator('#insertCutDialog textarea').fill('挿入');await p.locator('#insertCutDialog button[type=submit]').click();},unchanged);
 await scenario('type a line before it',async p=>{await p.evaluate(()=>{const el=document.getElementById('lyrics'),i=el.value.indexOf('ねえ');el.focus();el.setSelectionRange(i,i);});await p.keyboard.type('新しい行');await p.keyboard.press('Enter');},unchanged);
 await scenario('insert media cuts before it',async p=>{await seekAnd(p,7);for(const id of ['#insertForegroundAtPlayhead','#insertBackgroundAtPlayhead']){await p.locator('[data-playhead-menu="insert"]').click();await p.locator(id).click();await p.locator('#insertCutDialog button[type=submit]').click();}},unchanged);
 await scenario('omakase',p=>p.locator('#btnOmakase').click(),unchanged);
 await scenario('shuffle',p=>p.locator('#btnShuffle').click(),unchanged);
 await scenario('change style',p=>p.evaluate(()=>{J.ui.project.style=Object.keys(J.STYLES).find(k=>k!==J.ui.project.style);J.uiApi.replan();}),unchanged);
 // Direct operations apply, and the cut stays locked with its new state.
 await scenario('resize the locked lyric',async p=>{await seekAnd(p,10);await p.locator('.item-frame-name[data-select-layer="lyrics"]').first().click();await p.waitForTimeout(200);
  await p.evaluate(()=>{const r=document.getElementById('areaEditRect').getBoundingClientRect();window.__r=r;});
  const r=await p.evaluate(()=>window.__r);await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(r.x+r.width/2-60,r.y+r.height/2-40,{steps:5});await p.mouse.up();
  await p.locator('#areaApplyOne').click();},(c,ok)=>{ok(c.lyric.includes('area'),'area applied');ok(c.lyric.every(k=>['area','params'].includes(k)),'only the area changed: '+c.lyric);});
 await scenario('re-roll the locked cuts',async p=>{await seekAnd(p,10);for(const l of ['lyrics','foreground'])await p.locator(`.item-frame-action[data-action="dice"][data-layer="${l}"]`).first().click();},
  (c,ok)=>{ok(c.lyric.includes('seed'),'lyric re-rolled');ok(c.fg.includes('seed'),'foreground re-rolled');ok(!c.lyric.includes('area')&&!c.fg.includes('placement'),'place kept');});
 await scenario('edit the locked lyric in details',async p=>{await seekAnd(p,10);await p.locator('.item-frame-action[data-action="details"][data-layer="lyrics"]').first().click();await p.waitForTimeout(300);await p.locator('#cutDetailsDialog [data-detail-tab="motion"]').click();
  await p.evaluate(()=>{const d=document.getElementById('cutDetailsDialog');for(const s of d.querySelectorAll('select')){if(s.dataset.maskMotion||!s.offsetParent)continue;const box=s.closest('div,label,section');if(box&&/^(登場|Entrance)/.test(box.textContent.trim())){s.value=[...s.options].map(o=>o.value).find(v=>v&&v!==s.value);s.dispatchEvent(new Event('change',{bubbles:true}));break;}}});
  await p.waitForTimeout(200);await p.locator('#cutDetailsDialog button[type=submit]').click();},(c,ok)=>{ok(c.lyric.length===1&&c.lyric[0]==='enter','only the entrance changed: '+c.lyric);});
 await scenario('move the locked foreground',p=>p.evaluate(()=>{const o=J.ui.project.foreground.cutOverrides[2];o.placement={cx:.25,cy:.25,w:.3,h:.225,lockAspect:true,angle:0};J.uiApi.replan();}),(c,ok)=>{ok(c.fg.length===1&&c.fg[0]==='placement','only the placement changed: '+c.fg);});
 assert.deepEqual(failures,[]);console.log(lang||'ja','cut lock passed');}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
