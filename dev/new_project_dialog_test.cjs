const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{for(const lang of ['','en/'])for(const viewport of [{width:1500,height:1000},{width:768,height:900},{width:390,height:844},{width:320,height:568},{width:568,height:320}]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.goto((process.env.JIZURA_TEST_URL||'http://127.0.0.1:8765/')+lang);
 const dialog=page.locator('#newProjectDlg'),select=page.locator('#newProjectAspect');
 const open=async()=>{await page.locator('#projectMenu summary').click();await page.locator('#btnNew').click();await dialog.waitFor({state:'visible'});};
 const checkLayout=async()=>{
  const warning=dialog.locator('.project-save-warning');
  assert.equal(await warning.innerText(),lang?'Save first if you want to keep your current work!':'現在の内容を残す場合は、先に保存してください！');
  const appearance=await warning.evaluate(el=>{
   const style=getComputedStyle(el),parent=getComputedStyle(el.closest('dialog')),box=el.getBoundingClientRect().toJSON(),select=el.closest('dialog').querySelector('select').getBoundingClientRect().toJSON();
   const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(x=>+x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
   const fg=luminance(style.color),bg=luminance(parent.backgroundColor);
   return{contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),color:style.color,danger:style.getPropertyValue('--danger').trim(),weight:+style.fontWeight,box,select,overflow:el.scrollWidth-el.clientWidth};
  });
  assert.equal(appearance.color,'rgb(255, 90, 106)');assert.equal(appearance.danger,'#ff5a6a');assert(appearance.weight>=700);assert(appearance.contrast>=4.5,'Warning text must remain readable');
  assert.equal(appearance.overflow,0);assert(appearance.box.bottom<appearance.select.top,'Wrapped warning must clear the aspect selector');
  const geometry=await dialog.evaluate(el=>{const select=el.querySelector('select'),buttons=[...el.querySelectorAll('button')],box=x=>x.getBoundingClientRect().toJSON();return{select:box(select),buttons:buttons.map(box),dialog:box(el),overflow:el.scrollWidth-el.clientWidth};});
  assert.equal(geometry.overflow,0);assert(geometry.dialog.left>=0&&geometry.dialog.right<=viewport.width);
  for(const button of geometry.buttons){assert(button.top-geometry.select.bottom>=16,'Footer must clear the select and its focus outline');assert(button.left>=geometry.dialog.left&&button.right<=geometry.dialog.right);assert(button.top>=geometry.dialog.top&&button.bottom<=geometry.dialog.bottom);}
 };
 for(const aspect of ['16:9','9:16','4:3','3:4','1:1','4:5','21:9']){
  const before=await page.evaluate(()=>JSON.stringify(J.ui.project));await open();await select.selectOption(aspect);await select.focus();await checkLayout();
  await dialog.locator('button[value="cancel"]').click();await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>JSON.stringify(J.ui.project)),before,'Cancel must preserve the project');
  await open();await select.selectOption(aspect);await checkLayout();await page.locator('#btnCreateProject').click();await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(aspect=>J.ui.project.aspect===aspect&&document.getElementById('themesDlg').open,aspect);
  assert.equal(await page.evaluate(()=>J.ui.project.lyrics),'');await page.keyboard.press('Escape');await page.locator('#themesDlg').waitFor({state:'hidden'});
 }
 await open();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 if(process.env.JIZURA_NEW_PROJECT_SHOTS&&[1500,390].includes(viewport.width)){
  await open();await select.selectOption('9:16');await select.focus();await checkLayout();
  const out=process.env.JIZURA_NEW_PROJECT_SHOTS;fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`jizura-new-project-${lang?'en':'ja'}-${viewport.width}.png`)});
 }
 assert.deepEqual(errors,[]);console.log('PASS new project layout, all ratios, cancel/create, reopen and Escape '+(lang||'ja')+' '+viewport.width+'x'+viewport.height);await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
