// Localized manuals (manual/zh/, manual/ko/ …): screenshots of that browser edition (capture.cjs) are laid out
// on slides styled like the Japanese manual, saved as WebP pages plus a PDF, and wrapped in the shared reader.
//   python preview_server.py --port 8775            (serves the built editions)
//   node tools/manual/build_manual.cjs [zh ko] [--url http://127.0.0.1:8775/] [--shots <dir>]
// --shots reuses screenshots from an earlier run (<dir>/<lang>/NN.png) instead of driving the app again.
// The text of each page lives in tools/manual/pages.<lang>.json. NODE_PATH must point at Playwright.
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const {capture} = require('./capture.cjs');
const ROOT = path.resolve(__dirname, '../..'), EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const W = 2001, H = 1125;
const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const base = opt('--url') || 'http://127.0.0.1:8775/', reuse = opt('--shots'), langs = args.length ? args : ['zh', 'ko'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataURL = file => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');

// which screenshots each page shows (page 8 adds the language-free before/after illustration)
const SHOTS = {1: ['01'], 2: ['02'], 3: ['03'], 4: ['04'], 5: ['05'], 6: ['06'], 7: ['07a', '07b'], 8: ['08'], 9: ['09'], 10: ['10'], 11: ['11'], 12: ['12'],
  14: ['14'], 15: ['15'], 16: ['16'], 17: ['17a', '17b'], 18: ['18'], 19: ['19']};

function slideHTML(copy) {
  return `<!doctype html><html lang="${copy.lang}"><head><meta charset="utf-8"><link rel="stylesheet" href="${copy.fontCss}"><style>
  *{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{background:#eaf0f7;color:#384a5a;font-family:${copy.font};position:relative}
  .kicker{position:absolute;left:75px;top:34px;font-size:27px;color:#3d617e;font-weight:500}
  h1{position:absolute;left:75px;top:78px;font-size:66px;line-height:1.15;color:#1a2c3d;font-weight:700;letter-spacing:.02em;max-width:1640px}
  .num{position:absolute;right:134px;top:110px;font-size:29px;color:#66737f;letter-spacing:.03em}
  .rule{position:absolute;left:75px;right:76px;top:209px;height:2px;background:#cdd7df}.rule:before{content:"";position:absolute;left:0;top:-1px;width:76px;height:4px;background:#386a90}
  .text{position:absolute;left:75px;top:262px;width:var(--text-w);font-size:37px;line-height:1.5;color:#384a5a}.text p{margin:0 0 30px}
  .shots{position:absolute;right:66px;top:250px;bottom:56px;width:var(--shots-w);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
  .row{display:flex;gap:26px;align-items:center;justify-content:center;max-width:100%;max-height:100%}
  .frame{background:#fff;border:1px solid #cbd3da;padding:11px;box-shadow:0 6px 0 #dde5ec}.frame img{display:block;max-width:100%;max-height:100%}
  .cover{position:absolute;inset:0;display:grid;place-items:center;font-size:74px;font-weight:700;color:#1a2c3d}
  </style></head><body></body></html>`;
}

async function renderSlides(browser, copy, shots, outDir) {
  const page = await browser.newPage({viewport: {width: W, height: H}, deviceScaleFactor: 1});
  await page.setContent(slideHTML(copy), {waitUntil: 'networkidle'}).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const total = copy.pages.length, slides = [];
  for (let i = 0; i < total; i++) {
    const n = i + 1, pg = copy.pages[i], num = `${String(n).padStart(2, '0')} / ${total}`;
    let body;
    if (pg.cover) body = `<div class="cover">${esc(pg.title)}</div>`;
    else {
      const imgs = (SHOTS[n] || []).map(id => dataURL(path.join(shots, id + '.png')));
      const extra = n === 8 ? dataURL(path.join(__dirname, 'assets/cropped-edge-example.png')) : null;
      const frames = imgs.map(src => `<div class="frame"><img src="${src}"></div>`).join('');
      body = `${pg.advanced ? `<div class="kicker">${esc(copy.advanced)}</div>` : ''}<h1>${esc(pg.title)}</h1><div class="num">${num}</div><div class="rule"></div>
        <div class="text">${pg.paras.map(t => `<p>${esc(t)}</p>`).join('')}</div>
        <div class="shots"><div class="row">${frames}</div>${extra ? `<div class="row"><img src="${extra}" style="max-width:100%"></div>` : ''}</div>`;
    }
    await page.evaluate(({body, text, shots}) => {
      document.body.innerHTML = body; document.body.style.setProperty('--text-w', text + 'px'); document.body.style.setProperty('--shots-w', shots + 'px');
    }, {body, text: 560, shots: 1260});
    await page.evaluate(() => Promise.all([...document.images].map(im => im.decode().catch(() => {}))));
    // fit the screenshots: shrink each row until the column fits, and widen the text column when the shots are narrow
    await page.evaluate(() => {
      const box = document.querySelector('.shots'); if (!box) return;
      const rows = [...box.querySelectorAll('.row')], frames = [...box.querySelectorAll('.frame img')];
      const maxH = box.clientHeight, maxW = box.clientWidth, gap = 28 * (rows.length - 1);
      // first row holds the app screenshots; scale them together so that they keep their relative size
      const natural = frames.map(im => [im.naturalWidth / 2, im.naturalHeight / 2]);  // captured at 2× device pixels
      const extraH = rows.length > 1 ? Math.min(rows[1].scrollHeight, maxH * .45) : 0;
      const rowW = natural.reduce((s, [w]) => s + w + 24, 0) + 26 * (natural.length - 1), rowH = Math.max(...natural.map(([, h]) => h + 24));
      const k = Math.min(2, (maxW) / rowW, (maxH - gap - extraH) / rowH);
      frames.forEach((im, i) => { im.style.width = natural[i][0] * k + 'px'; im.style.height = natural[i][1] * k + 'px'; im.style.maxWidth = 'none'; im.style.maxHeight = 'none'; });
      const used = Math.max(rowW * k, rows[1] ? rows[1].scrollWidth : 0), spare = maxW - used;
      if (spare > 120) { box.style.width = used + 20 + 'px'; document.querySelector('.text').style.width = Math.min(900, 560 + spare - 40) + 'px'; }
    });
    const png = await page.screenshot({type: 'png'});
    const webp = await page.evaluate(async b64 => {
      const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
      return c.toDataURL('image/webp', .9).split(',')[1];
    }, png.toString('base64'));
    fs.writeFileSync(path.join(outDir, 'pages', String(n).padStart(2, '0') + '.webp'), Buffer.from(webp, 'base64'));
    slides.push({n, title: pg.title, text: [pg.advanced ? copy.advanced : null, pg.title, num, ...(pg.paras || [])].filter(Boolean).join('\n') + '\n', png});
  }
  await page.close();
  return slides;
}

async function writePDF(browser, slides, file) {
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><style>@page{size:${W}px ${H}px;margin:0}*{margin:0}img{display:block;width:${W}px;height:${H}px;break-after:page}</style>` +
    slides.map(s => `<img src="data:image/jpeg;base64,${s.jpg}">`).join(''));
  await page.evaluate(() => Promise.all([...document.images].map(im => im.decode())));
  await page.pdf({path: file, width: W + 'px', height: H + 'px', printBackground: true});
  await page.close();
}

function readerHTML(copy, slides) {
  const r = copy.reader, total = slides.length;
  const toc = slides.map(s => `<li><a href="#page-${String(s.n).padStart(2, '0')}"><span>${String(s.n).padStart(2, '0')}</span>${esc(s.title)}</a></li>`).join('\n');
  const figures = slides.map(s => { const id = String(s.n).padStart(2, '0');
    return `<figure lang="${copy.lang}" class="manual-page" id="page-${id}" tabindex="-1" aria-labelledby="title-${s.n}"><figcaption id="title-${s.n}"><span>${id} / ${total}</span>${esc(s.title)}</figcaption><img src="pages/${id}.webp" width="${W}" height="${H}" ${s.n > 2 ? 'loading="lazy" ' : ' '}decoding="async" alt="${esc(r.alt.replace('{n}', s.n).replace('{title}', s.title))}"><p class="sr-only">${esc(s.text)}</p></figure>`; }).join('\n');
  return `<!doctype html>
<html lang="${copy.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)}</title><meta name="description" content="${esc(r.description)}"><link rel="stylesheet" href="../reader.css"><script src="../reader.js" defer></script></head><body data-editor="../../${copy.app}">
<a href="#manualPages" class="skip-link">${esc(r.skip)}</a>
<header class="reader-header"><div class="reader-brand"><h1>${esc(r.manual)}</h1><p>JIZURA ONE STOP EDITION</p></div><div class="reader-actions">
<button id="tocToggle" aria-expanded="false" aria-controls="manualToc" aria-label="${esc(r.openContents)}">${esc(r.contents)}</button><div class="page-nav"><button id="previousPage">${esc(r.previous)}</button><span id="pageCounter" class="page-counter" aria-live="polite">1 / ${total}</span><button id="nextPage">${esc(r.next)}</button></div>
<label><span>${esc(r.zoom)}</span><select id="pageZoom" aria-label="${esc(r.zoomLabel)}"><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option><option value="3">300%</option><option value="4">400%</option></select></label>
<a href="JIZURA-manual.pdf" target="_blank" rel="noopener">${esc(r.pdf)}</a><a id="editorLink" href="../../${copy.app}">${esc(r.home)}</a><button id="closeReader">${esc(r.close)}</button></div></header>
<div id="tocBackdrop" hidden></div><nav id="manualToc" class="reader-toc" aria-label="${esc(r.tocLabel)}"><div class="toc-heading"><h2>${esc(r.contents)}</h2><button id="tocClose">${esc(r.close)}</button></div><ol>${toc}</ol></nav>
<main id="manualPages" class="reader-pages" aria-label="${esc(r.pagesLabel)}"><p id="closeHint" hidden>${esc(r.hint)}</p>${figures}
</main></body></html>
`;
}

(async () => {
  const browser = await chromium.launch({headless: true, executablePath: EDGE});
  try {
    for (const lang of langs) {
      const copy = JSON.parse(fs.readFileSync(path.join(__dirname, `pages.${lang}.json`), 'utf8'));
      const outDir = path.join(ROOT, 'manual', copy.folder);
      fs.rmSync(path.join(outDir, 'pages'), {recursive: true, force: true}); fs.mkdirSync(path.join(outDir, 'pages'), {recursive: true});
      let shots = reuse && path.join(path.resolve(reuse), lang);
      if (!shots) { shots = fs.mkdtempSync(path.join(os.tmpdir(), `jizura-shots-${lang}-`)); await capture(lang, shots, base + copy.folder + '/', copy); }
      const slides = await renderSlides(browser, copy, shots, outDir);
      const jpgPage = await browser.newPage({viewport: {width: W, height: H}});
      for (const s of slides) s.jpg = (await jpgPage.evaluate(async b64 => {
        const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0);
        return c.toDataURL('image/jpeg', .88).split(',')[1];
      }, s.png.toString('base64')));
      await jpgPage.close();
      await writePDF(browser, slides, path.join(outDir, 'JIZURA-manual.pdf'));
      fs.writeFileSync(path.join(outDir, 'index.html'), readerHTML(copy, slides));
      fs.writeFileSync(path.join(outDir, 'contents.json'), JSON.stringify({pages: slides.map(s => ({page: s.n, title: s.title, text: s.text, width: W, height: H}))}, null, 2) + '\n');
      console.log('manual/' + copy.folder + '/', slides.length, 'pages');
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
