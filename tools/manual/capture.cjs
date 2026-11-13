// Screenshots for the localized manual: drives one browser edition (zh / ko …) through the steps the
// manual shows and saves one PNG per shot. Used by build_manual.cjs; can also run alone:
//   node tools/manual/capture.cjs <lang> <out-dir> [app-url]
// NODE_PATH must point at a Playwright installation. The app must be served (python preview_server.py).
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// a short 120 BPM pad (stereo-free 16-bit WAV) so the import dialog, waveform and tap sync have a real song
function makeSong(file, seconds = 24) {
  const sr = 22050, n = sr * seconds, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / sr, beat = t % .5, chord = [220, 174.6, 261.6, 196][Math.floor(t / 2) % 4];
    const v = .18 * Math.sin(2 * Math.PI * chord * t) + .12 * Math.sin(2 * Math.PI * chord * 1.5 * t) + .4 * Math.sin(2 * Math.PI * 55 * t) * Math.exp(-beat * 18);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * Math.min(1, (seconds - t) / 1.5))) * 32767 * .8), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

async function capture(lang, out, url, copy) {
  fs.mkdirSync(out, {recursive: true});
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jizura-manual-'));
  const files = {song: path.join(tmp, copy.files.song), fg: path.join(tmp, copy.files.fg), bg: path.join(tmp, copy.files.bg)};
  makeSong(files.song);
  fs.copyFileSync(path.join(__dirname, 'assets/upper-body.png'), files.fg);
  fs.copyFileSync(path.join(__dirname, 'assets/background.png'), files.bg);
  const browser = await chromium.launch({headless: true, executablePath: EDGE, args: ['--autoplay-policy=no-user-gesture-required']});
  const errors = [];
  try {
    const context = await browser.newContext({viewport: {width: 1440, height: 810}, deviceScaleFactor: 2});
    const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(url); await p.waitForFunction(() => window.J?.uiApi); await p.waitForTimeout(800);
    const wait = ms => p.waitForTimeout(ms);
    const shot = async (name, target, pad = 0) => {
      const file = path.join(out, name + '.png');
      if (typeof target === 'string') target = p.locator(target).first();
      if (target.screenshot && !pad) await target.screenshot({path: file});
      else {
        const box = target.boundingBox ? await target.boundingBox() : target;
        await p.screenshot({path: file, clip: {x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad}});
      }
    };
    const union = async (...sels) => {
      const boxes = []; for (const s of sels) boxes.push(await p.locator(s).first().boundingBox());
      const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
      return {x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y};
    };
    const setLyrics = text => p.evaluate(text => { const el = document.getElementById('lyrics'); el.value = text; el.dispatchEvent(new Event('input', {bubbles: true})); }, text);
    const pause = () => p.evaluate(() => J.uiApi.pause());

    // 01 new project
    await p.click('#projectMenu summary'); await p.click('#btnNew'); await p.locator('#newProjectDlg').waitFor({state: 'visible'});
    await p.focus('#newProjectAspect'); await shot('01', '#newProjectDlg');
    await p.click('#btnCreateProject'); await p.locator('#themesDlg').waitFor({state: 'visible'}); await wait(300);
    // 02 theme dialog: one genre, one taste
    for (const i of [1]) await p.locator('#themeChoices fieldset').nth(0).locator('label').nth(i).click();
    await p.locator('#themeChoices fieldset').nth(1).locator('label').nth(9).click().catch(() => {});
    { const b = await p.locator('#themesDlg').boundingBox(); await shot('02', {x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 470)}); }
    await p.click('#btnApplyThemes'); await wait(300);
    // 03 lyrics
    await p.click('#sourceLyrics'); await setLyrics(copy.lyrics.join('\n')); await wait(600); await pause();
    await p.evaluate(() => J.uiApi.seek(.6)); await wait(300);
    { const b = await p.locator('#sourceDrawer').boundingBox(); await shot('03', {x: b.x, y: b.y, width: 1440 - b.x, height: 540}); }
    // 04 song import dialog
    await p.setInputFiles('#audioFile', files.song); await p.locator('#audioImportDialog').waitFor({state: 'visible'});
    await shot('04', '#audioImportDialog');
    await p.click('#audioImportDialog button:not([data-cancel])'); await wait(1200); await pause();
    // 05 tap sync: tap the first line, then shoot while the next one is waiting
    await p.click('#btnTap'); await p.waitForFunction(() => J.ui.tap && !J.ui.tap.countingDown, null, {timeout: 10000});
    await p.waitForFunction(() => J.ui.t >= 1, null, {timeout: 10000}); await p.keyboard.press('Space');
    await p.waitForFunction(() => J.ui.t >= 3, null, {timeout: 10000}); await p.keyboard.press('Space');
    await shot('05', '#tapPanel', 8);
    for (const t of [5, 7]) { await p.waitForFunction(t => J.ui.t >= t, t, {timeout: 10000}); await p.keyboard.press('Space'); }
    await p.waitForFunction(() => !J.ui.tap, null, {timeout: 30000}).catch(() => p.click('#tapStop').catch(() => {}));
    await pause(); await p.evaluate(() => window.scrollTo(0, 0));
    // 06 omakase
    await p.click('#btnOmakase'); await wait(800); await pause(); await p.evaluate(() => { const c = J.ui.plan.cuts[0]; J.uiApi.seek(c.start + (c.end - c.start) * .7); }); await wait(3500);
    await shot('06', await union('#viewport', '#btnOmakase', '#btnShuffle'), 6);

    // 07 media: the foreground and background panels after adding an image and inserting it along the lyrics
    const panel = async name => { const b = await p.locator('#sourceDrawer').boundingBox(); await shot(name, {x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 700)}); };
    await p.click('#sourceForeground'); await p.setInputFiles('#mediaFiles', files.fg); await wait(800);
    // 08 cropped edges: tick “bottom” on the foreground image
    const bottom = p.locator('#mediaList fieldset input[type=checkbox]').nth(3); await bottom.check(); await wait(300);
    await shot('08', p.locator('#mediaList > *').first(), 4);
    await p.click('#btnMediaFromLyrics'); await wait(600); await panel('07a');
    await p.click('#sourceMedia'); await p.setInputFiles('#mediaFiles', files.bg); await wait(800); await p.click('#btnMediaFromLyrics'); await wait(600); await panel('07b');
    await p.click('#sourceLyrics'); await p.click('#btnOmakase'); await wait(600); await pause(); await p.evaluate(() => J.uiApi.seek(1.4)); await wait(3500);
    // 09 / 10 timeline cut menu (lock highlighted, then randomize highlighted)
    const menuShot = async (name, action) => {
      await p.locator('#timelineLinks [data-action="menu"][data-layer="lyrics"]').nth(1).click(); await p.locator('#timelineCutMenu').waitFor();
      await p.hover(`#timelineCutMenu [data-action="${action}"]`); await wait(200);
      const m = await p.locator('#timelineCutMenu').boundingBox(), t = await p.locator('#timelineStack').boundingBox();
      const x = Math.max(t.x, m.x - 120), y = Math.min(m.y - 70, t.y - 60);
      await shot(name, {x, y, width: Math.min(620, 1440 - x), height: m.y + m.height + 12 - y});
      await p.keyboard.press('Escape'); await wait(200);
    };
    await menuShot('09', 'lock'); await menuShot('10', 'dice');
    // 11 project menu
    await p.click('#projectMenu summary'); await wait(250);
    { const m = await p.locator('#projectMenu').boundingBox(), list = await p.locator('#projectMenu > :not(summary)').first().boundingBox();
      const x = m.x - 260, y = 0; await shot('11', {x, y, width: Math.min(1440 - x, 520), height: list.y + list.height + 16}); }
    await p.click('#projectMenu summary');
    // 12 export dialog
    await p.click('#outputMenu summary'); await p.click('#menuMP4'); await p.locator('#exportDlg').waitFor({state: 'visible'}); await wait(400);
    await shot('12', '#exportDlg'); await p.click('#btnCloseExport'); await wait(300);
    // 14 / 15 lyric notation
    const lyricsShot = async (name, text) => { await setLyrics(text); await wait(500); const a = await p.locator('#lyrics').boundingBox(), b = await p.locator('#lyricInputTools').boundingBox(), d = await p.locator('#sourceDrawer').boundingBox();
      await shot(name, {x: d.x, y: a.y - 40, width: d.width, height: b.y + b.height + 10 - (a.y - 40)}); };
    await lyricsShot('14', copy.lyricsSplit); await lyricsShot('15', copy.lyricsStrength);
    await setLyrics(copy.lyrics.join('\n')); await wait(600); await p.click('#btnOmakase'); await wait(600); await pause(); await p.evaluate(() => J.uiApi.seek(1.4)); await wait(3500);
    // 16 placement editor
    await p.locator('#timelineLinks [data-action="menu"][data-layer="lyrics"]').first().click(); await p.click('#timelineCutMenu [data-action="area"]'); await p.locator('#areaEditControls').waitFor({state: 'visible'}); await wait(500);
    await shot('16', await union('#viewport', '#areaEditControls'), 4); await p.click('#areaCancel'); await wait(300);
    // 17 advanced drawer: style tab and lyrics tab
    await p.click('#modePro'); await p.locator('#settingsDrawer').waitFor({state: 'visible'}); await wait(400);
    const drawer = async name => { const b = await p.locator('#settingsDrawer').boundingBox(); await shot(name, {x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 640)}); };
    await drawer('17a'); await p.click('#settingsDrawer [data-tab="fx"]'); await wait(300); await drawer('17b'); await p.click('#closeSettingsDrawer'); await wait(300);
    // 18 / 19 cut details and its mask tab
    await p.locator('#timelineLinks [data-action="menu"][data-layer="lyrics"]').first().click(); await p.click('#timelineCutMenu [data-action="details"]'); await p.locator('#cutDetailsDialog').waitFor({state: 'visible'}); await wait(900);
    await shot('18', '#cutDetailsDialog');
    await p.click('#cut-detail-tab-mask'); await wait(300);
    await p.locator('#cutDetailsDialog [data-mask-field="enabled"]').check(); await wait(300);
    await p.selectOption('#cutDetailsDialog [data-mask-add]', 'ellipse'); await wait(700);
    await shot('19', '#cut-detail-panel-mask', 6);
    console.log('captured', lang, fs.readdirSync(out).join(' '));
  } finally { await browser.close(); fs.rmSync(tmp, {recursive: true, force: true}); }
  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
}
module.exports = {capture};
if (require.main === module) {
  const [lang, out, url] = process.argv.slice(2);
  const copy = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages.' + lang + '.json'), 'utf8'));
  capture(lang, path.resolve(out), url || `http://127.0.0.1:8775/${lang}/`, copy).catch(e => { console.error(e); process.exit(1); });
}
