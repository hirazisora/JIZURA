// Chinese / Korean editions: they load without errors, carry the four-language switcher, and their UI copy,
// part names and media technique names are translated (no Japanese kana, little untranslated English).
const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),assert=require('assert');const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});try{
const editions=[['','ja','日本語'],['en/','en','English'],['zh/','zh-Hans','简体中文'],['ko/','ko','한국어']];
for(const [dir,code,label] of editions){
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://localhost:8765/'+dir;
  await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,dir,'index.html'))}):r.abort());
  await page.goto(url);await page.waitForFunction(()=>window.J&&J.STYLES&&document.querySelector('.lang-switch'));
  const r=await page.evaluate(()=>{
    const nav=document.querySelector('.lang-switch');
    const items=[...nav.children].map(e=>({tag:e.tagName,text:e.textContent,href:e.getAttribute('href'),current:e.getAttribute('aria-current')}));
    const kana=/[\u3040-\u30ff]/,latinOnly=t=>/[A-Za-z]{2}/.test(t)&&/^[\x20-\x7e…–—’]+$/.test(t);
    const names=[];for(const g of J.GROUP_KEYS)for(const k of J.order(g)){const it=J.registry(g)[k];if(it)names.push(it.name);}
    const tech=Object.values(J.MEDIA_TECH).map(t=>t.name);
    const text=[];document.querySelectorAll('body *:not(script):not(style)').forEach(e=>{for(const n of e.childNodes)if(n.nodeType===3&&n.textContent.trim())text.push(n.textContent.trim());for(const a of ['title','placeholder','aria-label']){const v=e.getAttribute(a);if(v&&v.trim())text.push(v.trim());}});
    return {lang:document.documentElement.lang,items,
      kanaNames:names.filter(n=>kana.test(n)).length,latinNames:names.filter(latinOnly).length,names:names.length,
      kanaTech:tech.filter(n=>kana.test(n)).length,latinTech:tech.filter(latinOnly).length,tech:tech.length,
      kanaText:text.filter(t=>kana.test(t)),latinText:text.filter(latinOnly).length,text:text.length,
      label:J.mediaLabel('前景','Foreground'),sample:J.SAMPLE_LYRICS.split('\n')[0],style:J.STYLES.noir.name};
  });
  assert.equal(r.lang,code,dir+' html lang');
  assert.deepEqual(r.items.map(i=>i.text),['日本語','English','简体中文','한국어'],dir+' switcher order');
  const current=r.items.filter(i=>i.current==='page');assert.equal(current.length,1,dir+' one current language');assert.equal(current[0].text,label,dir+' current language');
  const up=dir?'../':'';const hrefs={'日本語':up+'index.html','English':up+'en/index.html','简体中文':up+'zh/index.html','한국어':up+'ko/index.html'};
  for(const i of r.items)if(i.current!=='page')assert.equal(i.href,hrefs[i.text],dir+' link '+i.text);
  if(code==='zh-Hans'||code==='ko'){
    assert.equal(r.kanaNames,0,dir+' part names with kana');assert.equal(r.kanaTech,0,dir+' media techniques with kana');
    assert.ok(r.latinNames<=r.names*0.02,dir+' untranslated part names '+r.latinNames+'/'+r.names);
    assert.ok(r.latinTech<=r.tech*0.02,dir+' untranslated media techniques '+r.latinTech+'/'+r.tech);
    assert.ok(r.kanaText.length<=5,dir+' visible kana '+JSON.stringify(r.kanaText));
    assert.ok(r.latinText<=r.text*0.02,dir+' untranslated visible text '+r.latinText+'/'+r.text);
    assert.equal(r.label,code==='ko'?'전경':'前景');
    assert.ok(!/[A-Za-z]{3}/.test(r.sample)&&!/[\u3040-\u30ff]/.test(r.sample),dir+' sample lyrics '+r.sample);
    assert.ok(!/[A-Za-z]{3}/.test(r.style),dir+' style name '+r.style);
  }else{
    assert.equal(r.label,code==='en'?'Foreground':'前景',dir+' mediaLabel');
  }
  assert.deepEqual(errors,[],dir+' page errors');
  console.log(dir||'ja/',JSON.stringify({names:r.names,latinNames:r.latinNames,tech:r.tech,latinTech:r.latinTech,text:r.text,latinText:r.latinText,kanaText:r.kanaText.length}));
  await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
