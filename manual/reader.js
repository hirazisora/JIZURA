(() => {
'use strict';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),english=params.get('lang')==='en',links=[...document.querySelectorAll('#manualToc a')],pages=[...document.querySelectorAll('.manual-page')];let current=1;
const copy=english?{manual:'Manual',contents:'Contents',close:'Close',pdf:'Open PDF',home:'Back to JIZURA',previous:'Previous',next:'Next',zoom:'View',skip:'Skip to pages',hint:'Close this tab to return to the editor.',footer:'19 pages · Japanese PDF',download:'Download PDF'}:null;
if(copy){document.documentElement.lang='en';document.title='JIZURA — Manual';document.querySelectorAll('[data-copy]').forEach(el=>el.textContent=copy[el.dataset.copy]);$('tocToggle').setAttribute('aria-label','Open contents');$('manualToc').setAttribute('aria-label','Manual contents');$('manualPages').setAttribute('aria-label','Manual pages');}
$('editorLink').href=english&&params.get('edition')!=='cep'?'../en/index.html':'../index.html';
const compact=matchMedia('(max-width:850px)');
function toggleContents(open,returnFocus=false){$('manualToc').classList.toggle('is-open',open);$('tocBackdrop').hidden=!open;$('tocToggle').setAttribute('aria-expanded',String(open));document.body.classList.toggle('toc-open',open);if(open){$('tocClose').focus();}else if(returnFocus){$('tocToggle').focus();}}
$('tocToggle').onclick=()=>toggleContents($('tocToggle').getAttribute('aria-expanded')!=='true');$('tocClose').onclick=()=>toggleContents(false,true);$('tocBackdrop').onclick=()=>toggleContents(false,true);
compact.addEventListener('change',()=>toggleContents(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('manualToc').classList.contains('is-open')){e.preventDefault();toggleContents(false,true);}if(e.key==='Tab'&&compact.matches&&$('manualToc').classList.contains('is-open')){const focusable=[$('tocClose'),...links],first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
function setCurrent(page){current=Math.max(1,Math.min(pages.length,page));$('pageCounter').textContent=current+' / '+pages.length;$('previousPage').disabled=current===1;$('nextPage').disabled=current===pages.length;links.forEach((link,i)=>{if(i===current-1)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});}
function scrollPage(page){setCurrent(page);pages[current-1].scrollIntoView({block:'start'});}
function navigate(page){toggleContents(false);page=Math.max(1,Math.min(pages.length,page));const hash='#page-'+String(page).padStart(2,'0');if(location.hash===hash)scrollPage(page);else location.hash=hash;}
links.forEach((link,i)=>link.addEventListener('click',e=>{e.preventDefault();navigate(i+1);if(compact.matches)pages[i].focus({preventScroll:true});}));
$('previousPage').onclick=()=>navigate(current-1);$('nextPage').onclick=()=>navigate(current+1);
const pageFromHash=()=>{const match=/^#page-(\d+)$/.exec(location.hash);return match&&+match[1]>=1&&+match[1]<=pages.length?+match[1]:1;};window.addEventListener('hashchange',()=>scrollPage(pageFromHash()));
const header=document.querySelector('.reader-header');new ResizeObserver(()=>document.documentElement.style.setProperty('--header-height',header.offsetHeight+'px')).observe(header);
$('pageZoom').onchange=e=>{document.documentElement.style.setProperty('--page-zoom',String(+e.target.value));scrollPage(current);};
let scrolling=false;window.addEventListener('scroll',()=>{if(scrolling)return;scrolling=true;requestAnimationFrame(()=>{const top=header.offsetHeight+32;let page=1;pages.forEach((el,i)=>{if(el.getBoundingClientRect().top<=top)page=i+1;});if(document.documentElement.scrollHeight-window.scrollY-innerHeight<3)page=pages.length;setCurrent(page);scrolling=false;});},{passive:true});
$('closeReader').onclick=()=>{window.close();$('closeHint').hidden=false;};
setCurrent(pageFromHash());if(location.hash)requestAnimationFrame(()=>scrollPage(pageFromHash()));
})();
