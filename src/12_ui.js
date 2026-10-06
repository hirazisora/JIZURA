/* ============================================================
   JIZURA — editor UI
   ============================================================ */
(() => {
'use strict';
if (!document.getElementById('app')) return;          // engine-only pages (tests)
const $ = id => document.getElementById(id);
const LS_KEY = 'jizura.project.v1';
const MEDIA_DELETE_KEY = 'jizura.media.pendingDelete.v1';
const HUD_CHARS = '0123456789:./-_()【】・No.LYRICRECUNTITLEDXYlinebpminterlude—─／ ';
const ICON = {
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="m8 1 2.1 4.5 4.9.7-3.5 3.5.8 4.9L8 12.3l-4.3 2.3.8-4.9L1 6.2l4.9-.7Z"/></svg>',
  paste: '<svg viewBox="0 0 24 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 8H1m3-3L1 8l3 3m12-10 2.1 4.5 4.9.7-3.5 3.5.8 4.9-4.3-2.3-4.3 2.3.8-4.9L9 6.2l4.9-.7Z"/></svg>',

  details: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12M2 8h12M2 12h12"/><path d="M5 2v4M11 6v4M7 10v4" stroke-width="3"/></svg>',
  area: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10"/><path d="M2 6h12M5 3v10"/></svg>',
  remove: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m4 4 8 8m0-8-8 8"/></svg>',

  dice: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 5.3A5.3 5.3 0 1 0 13.2 10M12.8 1.8v3.8H9"/></svg>',
  disableReroll: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.3A5 5 0 1 0 12.7 9M10 1v3.5H6.5"/><path d="M11.5 2h3.5" stroke="#ff5364" stroke-width="2.2"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>',
  frontmost: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="5" width="10" height="8" rx="1"/><path d="M5 2h9v8M8 4l2 2 2-2"/></svg>',
};

const S = { project: null, plan: null, audio: null, renderer: new J.Renderer(), playing: false, t: 0, t0: 0, loop: true, need: true, exporting: null, tap: null, linkDrag: null, slow: false, lineEls: [], mediaLineEls: [], sourceTab: 'lyrics', curLine: -2, timelineZoom: 1 };

/* WebAudio player (works inside sandboxed pages where blob media may be blocked) */
const AP = {
  ctx: null, src: null, startAt: 0,
  play(buffer, offset, end = null) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.stop();
    const off = end==null ? Math.max(0, Math.min(offset, buffer.duration - 0.01)) : Math.max(0,offset);
    this.startAt = this.ctx.currentTime - off;
    if(end!=null&&(off>=buffer.duration||end<=off))return;
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.connect(this.ctx.destination);
    if(end==null)s.start(0,off);else s.start(0,off,Math.min(end,buffer.duration)-off);
    this.src = s;
  },
  stop() { if (this.src) { try { this.src.stop(); } catch (e) {} try { this.src.disconnect(); } catch (e) {} this.src = null; } },
  time() { return this.ctx ? this.ctx.currentTime - this.startAt : 0; },
};
const NO_AUDIO_LABEL = '曲なし（読み込むと拍を検出してカットを合わせます）';
function removeAudio() {
  if (!S.audio) return;
  S.audioLoad = (S.audioLoad || 0) + 1;
  pause(); S.audio = null; S.audioFile = null; delete S.project.audioAsset;
  S.audioAssetId = null;
  $('audioFile').value = '';
  $('audioName').textContent = NO_AUDIO_LABEL;
  $('btnRemoveAudio').hidden = true;
  syncUI(); replan();
}

/* ---------------- project persistence ---------------- */
// 無表示カット (retired): the lyric showing when a blank began now ends there (カットの終了時間).
function migrateLyricBlankCuts(project) {
  const blanks = (Array.isArray(project.lyricBlankCuts) ? project.lyricBlankCuts : []).filter(b => b && Number.isFinite(+b.start)).sort((a, b) => a.start - b.start);
  delete project.lyricBlankCuts;
  if (!blanks.length) return;
  const plan = J.plan(project), done = new Set();
  for (const blank of blanks) for (const cut of plan.cuts) {
    const key = `${cut.line}:${cut.part}`;
    if (cut.line < 0 || !Number.isInteger(cut.part) || done.has(key) || !(cut.start < +blank.start && cut.end > +blank.start)) continue;
    project.lyricCutOptions[key] = { ...project.lyricCutOptions[key], untilNext: false, endTime: +(+blank.start).toFixed(3) };
    done.add(key);
  }
}
function mergeProject(p) {
  const d = J.defaultProject();
  const o = Object.assign(d, p || {});
  if (o.videoSize) { const [w, h] = J.outputSize(o); o.videoSize = { w, h }; }
  o.shortExport=J.shortExportSettings(o.shortExport);
  o.fx = Object.assign(J.defaultProject().fx, (p && p.fx) || {});
  o.timing = Object.assign(J.defaultProject().timing, (p && p.timing) || {});
  o.timing.cutTimes = o.timing.cutTimes || {};
  o.customEffects=J.validateCustomEffects(o.customEffects||[]);J.activateCustomEffects(o);
  const en = J.defaultProject().enabled;
  for (const g of Object.keys(en)) en[g] = Object.assign(en[g], ((p && p.enabled) || {})[g] || {});
  o.enabled = en;
  o.overrides = (p && p.overrides) || {};
  o.lyricCutOptions = (p && p.lyricCutOptions) || {};
  o.lyricEffects = J.lyricEffectSettings(o);
  o.themes = J.themeIds(o);
  o.themeBalance = o.themeBalance === 'unified' ? 'unified' : 'lively';
  delete o.jevPrompt;
  migrateLyricBlankCuts(o);
  o.effectFavorites = J.normalizeEffectFavorites(o.effectFavorites);
  o.customEffects=J.combineCustomEffects(o.customEffects,...o.effectFavorites.map(f=>f.payload.components||[]));J.activateCustomEffects(o);
  o.favoriteSequence = Math.max(o.effectFavorites.length,Math.floor(+o.favoriteSequence)||0);
  o.timelineLinks = Array.isArray(p && p.timelineLinks) ? p.timelineLinks : [];
  o.media = J.normalizeMedia(p && p.media);
  o.foreground = J.normalizeMedia(p && p.foreground);
  for (const layer of ['media', 'foreground']) o[layer].effects = J.mediaEffectSettings(o, layer);
  delete o.mediaEffects;
  o.colors = Object.assign({ enabled: false }, (p && p.colors) || {});
  o.colorTheme = J.normalizeColorTheme(p && p.colorTheme);
  o.fonts = (p && p.fonts) || {};
  o.userFonts = (p && p.userFonts) || [];
  for (const uf of o.userFonts) if (!J.FONTS[uf.key]) J.addUserFont(uf.key, uf.label, uf.family, uf.weight || 400);
  o.compositeFonts = Array.isArray(p && p.compositeFonts) ? p.compositeFonts : [];
  J.setCompositeFonts(o.compositeFonts);
  J.migrateLyricCompositing(o);
  return o;
}
function setBadges(d) {
  return d && d.custom ? '<span class="set-badge ex" title="'+J.mediaLabel('取り込んだ独自演出','Imported custom effect')+'">'+J.mediaLabel('追加','Added')+'</span>' : '';
}
function loadLocal() { try { const s = localStorage.getItem(LS_KEY); if (s) return mergeProject(JSON.parse(s)); } catch (e) {} return mergeProject(null); }
function pendingMediaDeletes() { try { const ids = JSON.parse(localStorage.getItem(MEDIA_DELETE_KEY) || '[]'); return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []; } catch (e) { return []; } }
function queueMediaDeletion(id) { try { localStorage.setItem(MEDIA_DELETE_KEY, JSON.stringify([...new Set([...pendingMediaDeletes(), id])])); } catch (e) {} }
async function cleanupDeletedMedia() {
  const active = new Set([...S.project.media.items, ...S.project.foreground.items].map(item => item.id));
  const pending = pendingMediaDeletes(), failed = [];
  for (const id of pending) {
    if (active.has(id)) continue;
    try {
      const asset = J.mediaAssets.get(id);
      if (asset) { J.releaseMediaAsset(asset); J.mediaAssets.delete(id); }
      await J.removeMedia(id);
    } catch (e) { failed.push(id); }
  }
  try { localStorage.setItem(MEDIA_DELETE_KEY, JSON.stringify(pendingMediaDeletes().filter(id => !pending.includes(id) || failed.includes(id)))); } catch (e) {}
}
const U = { list: [], i: -1, restoring: false, pendingGroup: null, lastGroup: null, lastAt: 0 };
function initUndo() { U.list = [JSON.stringify(S.project)]; U.i = 0; updateUndoButtons(); }
function markUndoGroup(group) { U.pendingGroup = group; }
function updateUndoButtons() {
  if ($('btnUndo')) $('btnUndo').disabled = U.i <= 0;
  if ($('btnRedo')) $('btnRedo').disabled = U.i >= U.list.length - 1;
}
function recordUndoState() {
  if (U.restoring || !S.project) return;
  const snap = JSON.stringify(S.project), group = U.pendingGroup, now = Date.now();
  U.pendingGroup = null;
  if (U.i < 0) { U.list = [snap]; U.i = 0; updateUndoButtons(); return; }
  if (snap === U.list[U.i]) return;
  const atTip = U.i === U.list.length - 1;
  U.list = U.list.slice(0, U.i + 1);
  if (group && atTip && group === U.lastGroup && now - U.lastAt < 1200 && U.i > 0) U.list[U.i] = snap;
  else { U.list.push(snap); U.i++; }
  if (U.list.length > 100) { U.list.shift(); U.i--; }
  U.lastGroup = group; U.lastAt = now;
  updateUndoButtons();
}
function undoMove(direction) {
  if (S.exporting) return;
  recordUndoState();
  const next = U.i + direction;
  if (next < 0 || next >= U.list.length) return;
  pause(); clearTimeout(replanTimer);
  if (S.areaEdit) cancelAreaEditor();
  S.tap = null; S.timelineDrag = null; S.linkDrag = null;
  $('tapPanel').hidden = true; syncTapButtons();
  U.restoring = true; U.i = next; U.pendingGroup = null; U.lastGroup = null;
  S.project = mergeProject(JSON.parse(U.list[next]));
  if (S.project.audioAsset?.id !== S.audioAssetId) {
    S.audioLoad = (S.audioLoad || 0) + 1;
    S.audio = null; S.audioFile = null; refreshAudioName(); restoreAudioAsset();
  }
  fontKey = ''; syncUI(); replan(); flushSave();
  // mergeProject normalizes (e.g. favorite payload key order); store the normalized snapshot so the
  // next undo/redo doesn't see it as a new edit and drop the redo steps.
  U.list[U.i] = JSON.stringify(S.project);
  U.restoring = false; updateUndoButtons();
}
let saveTimer = 0;
function autosave() { recordUndoState(); clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 700); }
function flushSave() { recordUndoState(); clearTimeout(saveTimer); try { localStorage.setItem(LS_KEY, JSON.stringify(S.project)); } catch (e) {} }
window.addEventListener('pagehide', () => { if (S.project) { flushSave(); cleanupDeletedMedia(); } });

/* ---------------- planning ---------------- */
function audioLike() {
  const T = S.project.timing;
  if (S.audio) {
    const a = Object.assign({}, S.audio);
    if (T.bpm > 0) a.beats = J.beatGrid(T.bpm, T.beatOffset || 0, S.audio.duration);
    return a;
  }
  if (T.bpm > 0) return { beats: J.beatGrid(T.bpm, T.beatOffset || 0, 600) };
  return null;
}
/* 自動判定のとき、判定結果を言語欄の横に出す */
function langNote() {
  const el = $('langNote'); if (!el) return;
  el.textContent = (S.project.lang || 'auto') === 'auto' ? '→ ' + J.LANG_LABEL[J.resolveLang(S.project)] : '';
  if (langNote.last !== undefined && langNote.last !== J.lang) { try { renderFontRoles(); } catch (e) {} }   // font menus show the language's faces
  langNote.last = J.lang;
}
// The full plan (lyrics + media layers) for a project; also used by the cut details preview.
function composePlan(project) {
  const plan = J.plan(project, audioLike());
  plan.media = J.planMedia(project, plan, S.audio && S.audio.duration);
  plan.foreground = J.planMedia(project, plan, S.audio && S.audio.duration, 'foreground');
  plan.duration = Math.max(plan.media.duration, plan.foreground.duration);
  // An explicit output length also caps existing cuts extending past the song.
  if(Number.isFinite(+project.durationOverride)&&+project.durationOverride>0){
    plan.duration=+project.durationOverride;
    plan.cuts=plan.cuts.filter(c=>c.start<plan.duration);
    for(const cut of plan.cuts){cut.end=Math.min(cut.end,plan.duration);cut.dur=cut.end-cut.start;}
    plan.events=plan.events.filter(event=>event.t<plan.duration);
    for(const layer of ['media','foreground']){
      plan[layer].cuts=plan[layer].cuts.filter(c=>c.start<plan.duration);
      for(const cut of plan[layer].cuts)cut.end=Math.min(cut.end,plan.duration);
    }
  }
  for (const layer of ['media', 'foreground']) {
    plan[layer].duration = plan.duration;
    const last = plan[layer].cuts.at(-1); if (last && !last.manualEnd && last.videoDuration == null) last.end = plan.duration;
  }
  return plan;
}
function replan() {
  closeTimelineCutMenu();
  S.plan = composePlan(S.project);
  J.captureAutoEffects(S.project,S.plan);
  if (S.tap && S.tap.append && !S.audio) extendTapPreview(S.t);
  langNote();
  if (S.t > S.plan.duration) S.t = Math.max(0, S.plan.duration - 1e-3);
  const temporarilyHidden = ref => S.project.durationOverride != null && (
    /^l:\d+:\d+$/.test(ref) && +ref.split(':')[1] < S.plan.lines.length ||
    /^[fm]:\d+$/.test(ref) && +ref.slice(2) < S.project[ref[0]==='f'?'foreground':'media'].cutCount);
  S.project.timelineLinks = S.project.timelineLinks.filter(link => link && link.a !== link.b && (boundaryCut(link.a) || temporarilyHidden(link.a)) && (boundaryCut(link.b) || temporarilyHidden(link.b)));
  lastCutIdx = null;
  renderLines(); renderMediaList(); renderMediaLines(); sizeViewport(); drawTimeline(); drawTimelineLinks(); updateTimeUI();
  S.need = true; autosave(); ensureFonts(); drawSwatch(); showNow();
  clearTimeout(warmTimer); warmTimer = setTimeout(warm, 450);
}
/* pre-decompose glyphs used by piece animations while the editor is idle, so playback does not hitch */
let warmTimer = 0, warmJob = 0;
function warm() {
  const job = ++warmJob;
  const cuts = S.plan.cuts.filter(c => c.enter === 'assemble' || ['explode', 'fall', 'drift'].includes(c.exit));
  const src = $('view');
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d');
  let i = 0;
  const idle = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 400 }) : (f) => setTimeout(() => f(null), 40);
  const step = (deadline) => {
    if (job !== warmJob || S.exporting) return;
    do {
      const c = cuts[i++]; if (!c) break;
      const ts = [];
      if (c.enter === 'assemble') ts.push(c.start + Math.min(c.inDur * 0.3, c.dur * 0.2));
      if (c.outDur > 0) ts.push(c.end - c.outDur * 0.5);
      for (const t of ts) { try { S.renderer.frame(ctx, S.plan, t, { scale: cv.width / S.plan.W, fast: true, noHud: true, noGhost: true }); } catch (e) {} }
    } while (i < cuts.length && deadline && deadline.timeRemaining() > 10);
    if (i < cuts.length) idle(step);
  };
  idle(step);
}
let replanTimer = 0;
const replanSoon = (ms = 220) => { clearTimeout(replanTimer); replanTimer = setTimeout(replan, ms); };
let fontKey = '';
let thumbFonts = null;
async function ensureFonts() {
  const txt = S.project.lyrics + (S.project.title || '') + (S.project.artist || '') + HUD_CHARS + J.drawingText(S.plan);
  const keys = J.fontsOfPlan(S.plan);                       // only the faces this plan draws with
  const key = txt + '|' + keys.join(',') + '|' + Object.keys(J.FONTS).length;
  if (key === fontKey) return;
  fontKey = key;
  showMsg('フォントを読み込み中…');
  try { await J.ensureFonts(txt, keys); } catch (e) {}
  showMsg(null); S.need = true; drawStyleGrid(); loadThumbFonts();
}
// style thumbnails need two glyphs of every style's display face — fetched only once the style grid is actually shown
function loadThumbFonts() {
  if (thumbFonts || !$('styleGrid').offsetParent) return;
  thumbFonts = J.ensureFonts('字面', [...new Set(J.STYLE_ORDER.map(k => J.STYLES[k].fonts.display[0]))]).then(() => drawStyleGrid()).catch(() => {});
}
function showMsg(m) { const el = $('viewMsg'); if (!m) { el.hidden = true; return; } el.textContent = m; el.hidden = false; }

/* ---------------- viewport & drawing ---------------- */
function sizeViewport() {
  const vp = $('viewport'), c = $('view');
  const ar = S.plan.W / S.plan.H;
  const app=$('app'),stage=vp.closest('.col-stage');
  const full=document.fullscreenElement===vp||vp.classList.contains('preview-fullscreen');
  // Measure the desktop layout, not the expanded compact layout, to avoid breakpoint oscillation.
  const wasCompact=app.classList.contains('compact-ui');
  const screenW=document.documentElement.clientWidth, screenH=document.documentElement.clientHeight;
  const phone=screenW<=760;
  // Do not briefly restore desktop columns on phones: mobile layout viewports can
  // expand to accommodate their intrinsic width before the next resize callback.
  if(!full)app.classList.toggle('compact-ui',screenW<=1180||!!S.tap);
  const style=getComputedStyle(stage),children=[...stage.children].filter(el=>el!==vp && el.id!=='tapPanel' && getComputedStyle(el).display!=='none');
  const controls=children.reduce((sum,el)=>{const css=getComputedStyle(el);return sum+el.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);},0);
  const desktopH=Math.max(0,innerHeight-Math.max(0,stage.getBoundingClientRect().top)-controls-(parseFloat(style.rowGap)||0)*children.length-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-4);
  const desktopW=vp.clientWidth||800,fitH=Math.min(desktopW/ar,desktopH);
  const compact=full?wasCompact:!!S.tap||screenW<=1180||Math.min(fitH,fitH*ar)<270;
  app.classList.toggle('compact-ui',compact);
  if(compact!==wasCompact){S.sourceOpen=false;syncSourceDrawer();}
  const viewportStyle=getComputedStyle(vp);
  const availableW=vp.clientWidth-(parseFloat(viewportStyle.paddingLeft)||0)-(parseFloat(viewportStyle.paddingRight)||0);
  let cssW=Math.max(1,Math.min(availableW,screenW)),cssH=cssW/ar;
  // Preserve a 270px short edge where screen width permits; scroll controls below the preview.
  const maxH=full?screenH:phone?Math.max(1,screenH*.5):compact?Math.max(270/Math.min(1,ar),screenH*.5):Math.max(60,desktopH);
  if (cssH > maxH) { cssH = maxH; cssW = cssH * ar; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(Math.min(S.plan.W, cssW * dpr)), ph = Math.round(pw / ar);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
  positionAreaEditor();
  if(S.tap)$('tapPanel').style.top=(vp.offsetTop+vp.offsetHeight+6)+'px';
  S.need = true;
}
// Detail previews share the imported videos with the main renderer. Their seeked
// events request main redraws, which must not reset the videos to the main clock.
function syncMainMediaPreview() {
  if(!$('cutDetailsDialog')?.open&&!$('effectFavoritesDialog')?.open&&!($('exportDlg')?.open&&S.exportKind==='short'))J.syncMediaPreview(S.plan,S.t,S.playing);
}
function drawPreviewFrame(ctx, {renderer=S.renderer,fast=false,time=S.t}={}) {
  const previewCuts = S.areaEdit && S.areaEdit.kind === 'lyric' && S.areaEdit.draft ? S.plan.cuts.filter(cut => cut.line === S.areaEdit.index) : [];
  const previousAreas = previewCuts.map(cut => cut.area);
  previewCuts.forEach(cut => { cut.area = { ...S.areaEdit.draft, angle: S.areaEdit.angle }; });
  const edit = S.areaEdit, mediaCut = edit && edit.kind !== 'lyric' && S.plan[edit.kind].cuts[edit.index];
  const previousMedia = mediaCut && { placement: mediaCut.placement, zoom: mediaCut.zoom, hold: mediaCut.hold, enter: mediaCut.enter, exit: mediaCut.exit, trans: mediaCut.trans };
  if (mediaCut) Object.assign(mediaCut, { placement: { cx: edit.draft.x + edit.draft.w / 2, cy: edit.draft.y + edit.draft.h / 2, w: edit.draft.w, h: edit.draft.h, lockAspect: edit.lockAspect, angle: edit.angle }, zoom: 100, hold: 'still', enter: 'cut', exit: 'cut', trans: undefined });
  try { renderer.frame(ctx, S.plan, time, { scale: ctx.canvas.width / S.plan.W, fast, noTrans: !!edit, noPost: !!edit, previewEdit: !!edit && edit.kind !== 'lyric', noForeground: !!edit && edit.kind === 'media' }); }
  finally { previewCuts.forEach((cut, i) => { cut.area = previousAreas[i]; }); if (mediaCut) Object.assign(mediaCut, previousMedia); }
}
function draw() {
  const c = $('view'), ctx = c.getContext('2d');
  if(!S.playPreparing)syncMainMediaPreview();
  const t0 = performance.now();
  drawPreviewFrame(ctx,{fast:!!S.areaEdit || S.playing && S.slow});
  const dt = performance.now() - t0;
  S.slow = S.playing ? (dt > 30 ? true : dt < 14 ? false : S.slow) : false;
  updateTimeUI(); drawTimeline(); followTimelinePlayhead(); updateCutInfo(); drawItemFrames();
}
// While playing, page the zoomed timeline so the playhead stays in view (paused briefly after the user
// scrolls it by hand).
let timelineUserScroll = 0;
function followTimelinePlayhead() {
  if (!S.playing || S.timelineZoom <= 1 || performance.now() - timelineUserScroll < 1500) return;
  const scroll = $('timelineScroll'), box = scroll.getBoundingClientRect(), line = $('timeline').getBoundingClientRect();
  const x = line.left + line.width * J.clamp(S.t / Math.max(.001, S.plan.duration), 0, 1);
  if (x < box.left + box.width * .05 || x > box.right - box.width * .08) scroll.scrollLeft += x - (box.left + box.width * .15);
}
function tick(now) {
  requestAnimationFrame(tick);
  if (S.exporting) return;
  if (S.playing) {
    // rAF timestamps can precede the moment play()/seek() stamped t0 → clamp so t never goes negative
    let t = Math.max(0, S.audio ? AP.time() : (now - S.t0) / 1000);
    if (S.tap && S.tap.append && !S.audio && t >= S.plan.duration - 2) extendTapPreview(t);
    const stopAt = S.tap && S.tap.append && S.audio ? Math.min(S.plan.duration, S.audio.duration) : S.plan.duration;
    if (t >= stopAt - 1e-3) {
      if (S.loop && !S.tap) { seek(0); t = 0; }
      else { pause(); t = stopAt - 1e-3; if (S.tap) stopTap(); }
    }
    S.t = t; S.need = true;
  }
  if (S.need) { S.need = false; draw(); }
}
const lyricPlaybackMarker = { value: null, active: '', rows: [], lines: [] };
function syncLyricPlaybackHighlight() {
  const input=$('lyrics'), overlay=$('lyricPlaybackHighlight');
  if (!input || !overlay) return;
  const marker=lyricPlaybackMarker, mirror=overlay.firstElementChild;
  if (document.activeElement===input || !input.clientWidth || input.value!==S.project.lyrics) {
    overlay.hidden=true; marker.active=''; return;
  }
  if (marker.value!==input.value) {
    marker.value=input.value; marker.active='';
    marker.lines=J.parseLyrics(input.value).lines;
    marker.rows=input.value.replace(/\r/g,'').split('\n').map(text=>{
      const row=document.createElement('span');row.className='lyric-source-row';
      row.textContent=text || '\u200b';return row;
    });
    mirror.replaceChildren(...marker.rows);
  }
  const style=getComputedStyle(input);
  for (const prop of ['font','letterSpacing','lineHeight','textAlign','textIndent','wordSpacing','tabSize','wordBreak','paddingTop','paddingRight','paddingBottom','paddingLeft']) mirror.style[prop]=style[prop];
  overlay.style.left=input.offsetLeft+input.clientLeft+'px';
  overlay.style.top=input.offsetTop+input.clientTop+'px';
  overlay.style.width=input.clientWidth+'px';overlay.style.height=input.clientHeight+'px';
  const cuts=J.lyricCutsAt(S.plan,S.t).filter(c=>c.line>=0&&Number.isInteger(c.part));
  const sourceRows=[...new Set(cuts.map(c=>marker.lines[c.line]?.sourceLine).filter(Number.isInteger))];
  const active=sourceRows.join(',');
  overlay.hidden=!sourceRows.length;
  if (marker.active!==active) {
    marker.rows.forEach((row,i)=>row.classList.toggle('is-current',sourceRows.includes(i)));
    marker.active=active;
    // Follow the newest active line while grouped lyrics can retain earlier ones.
    const latest=cuts.reduce((a,c)=>!a||c.start>a.start?c:a,null);
    const row=latest && marker.rows[marker.lines[latest.line]?.sourceLine];
    if (row) {
      const top=row.offsetTop, bottom=top+row.offsetHeight;
      if (top<input.scrollTop || bottom>input.scrollTop+input.clientHeight)
        input.scrollTop=Math.max(0,top-(input.clientHeight-Math.min(row.offsetHeight,input.clientHeight))/2);
    }
  }
  mirror.style.transform=`translate(${-input.scrollLeft}px,${-input.scrollTop}px)`;
}
function updateTimeUI() {
  syncLyricPlaybackHighlight();
  document.querySelectorAll('#layerVisibilityControls button').forEach(button=>button.disabled=!!S.exporting);
  $('fullscreenPlay').textContent=S.playing?'❚❚':'▶';
  $('fullscreenPlay').setAttribute('aria-label',S.playing?J.mediaLabel('一時停止','Pause'):J.mediaLabel('再生','Play'));
  $('fullscreenTime').textContent=J.fmtTime(S.t)+' / '+J.fmtTime(S.plan.duration);
  if(!S.scrubbing)$('fullscreenScrub').value=String(Math.round(S.t/Math.max(.001,S.plan.duration)*10000));
  syncPlayheadMenu();
  $('timeNow').textContent = J.fmtTime(S.t);
  $('timeDur').textContent = J.fmtTime(S.durationDrag ? S.durationDrag.preview : S.plan.duration);
  $('timeDur').classList.toggle('manual', S.project.durationOverride != null || !!S.durationDrag);
  if (!S.scrubbing) $('scrub').value = String(Math.round(S.t / Math.max(0.001, S.plan.duration) * 10000));
}
function minimumProjectDuration() {
  let minimum = 0.1;
  for (const line of S.plan.lines) minimum = Math.max(minimum, line.start + 0.04);
  for (const layer of ['media', 'foreground']) {
    minimum = Math.max(minimum, S.plan[layer].cuts.length * 0.04);
    for (const [index, time] of Object.entries(S.project[layer].timing.lineTimes)) {
      if (+index < S.plan[layer].cuts.length && Number.isFinite(+time)) minimum = Math.max(minimum, +time + (S.plan[layer].cuts.length - +index) * 0.04);
    }
  }
  return Math.ceil(minimum * 100) / 100;
}
function parseProjectDuration(raw) {
  const parts = String(raw).trim().split(':');
  if (parts.length > 3 || !parts.every(p => /^\d+(?:\.\d{1,2})?$/.test(p))) return NaN;
  if (parts.slice(0, -1).some(p => p.includes('.'))) return NaN;
  if (parts.length > 1 && +parts.at(-1) >= 60) return NaN;
  if (parts.length === 3 && +parts[1] >= 60) return NaN;
  return parts.reduce((seconds, part) => seconds * 60 + +part, 0);
}
function setProjectDuration(seconds) {
  if (S.exporting || S.tap) return false;
  const minimum = minimumProjectDuration();
  if (seconds != null && (!Number.isFinite(seconds) || seconds < minimum - 1e-6 || seconds > 21600)) {
    toast(`動画全体の長さは ${J.fmtTime(minimum)} ～ 06:00:00 の範囲で入力してください`);
    return false;
  }
  if (S.areaEdit) cancelAreaEditor();
  pause();
  S.project.durationOverride = seconds == null ? null : Math.round(seconds * 100) / 100;
  replan();
  return true;
}
async function play() {
  if(S.tap?.countingDown)return;
  if(S.playPreparing){pause();return;}
  const videos=['media','foreground'].some(layer=>S.plan.layerVisibility?.[layer]!==false&&J.mediaAt(S.plan,S.t,layer)?.type==='video');
  if(videos){
    const controller=new AbortController();S.playPreparing=controller;
    $('btnPlay').textContent='…';$('btnPlay').setAttribute('aria-label',J.mediaLabel('動画を準備中（押すと中止）','Preparing video (press to cancel)'));
    // Unlock audio during the original tap before awaiting the video decoder.
    if(S.audio){if(!AP.ctx)AP.ctx=new (window.AudioContext||window.webkitAudioContext)();if(AP.ctx.state==='suspended')AP.ctx.resume();}
    try{await J.prepareMediaFrame(S.plan,S.t,controller.signal);}
    catch(error){if(!controller.signal.aborted)toast(error.message);if(S.playPreparing===controller)pause();return;}
    if(S.playPreparing!==controller||controller.signal.aborted)return;
    S.playPreparing=null;
  }
  if (S.audio) AP.play(S.audio.buffer, S.t);
  else S.t0 = performance.now() - S.t * 1000;
  S.playing = true; $('btnPlay').textContent = '❚❚'; $('btnPlay').setAttribute('aria-label', '一時停止');
}
function pause() {
  S.playPreparing?.abort();S.playPreparing=null;
  S.playing = false; AP.stop();
  syncMainMediaPreview();
  $('btnPlay').textContent = '▶'; $('btnPlay').setAttribute('aria-label', '再生'); S.need = true;
}
function seek(t) {
  if(S.playPreparing)pause();
  S.t = J.clamp(t, 0, Math.max(0, S.plan.duration - 1e-3));
  if (S.audio) { if (S.playing) AP.play(S.audio.buffer, S.t); }
  else S.t0 = performance.now() - S.t * 1000;
  syncMainMediaPreview();
  S.need = true;
}

/* ---------------- timeline ---------------- */
const layoutHue = k => (J.LAYOUT_ORDER.indexOf(k) * 37 + 30) % 360;
function sizeTimelineStack() {
  const scroll = $('timelineScroll'), stack = $('timelineStack');
  const width = Math.max(10, Math.round(scroll.clientWidth * S.timelineZoom));
  if (stack.style.width !== `${width}px`) stack.style.width = `${width}px`;
  syncTimelinePan();
}
function syncTimelinePan(){
  const input=$('timelinePan');if(!input)return;
  const scroll=$('timelineScroll'),max=Math.max(0,scroll.scrollWidth-scroll.clientWidth);
  input.max=String(max);input.value=String(scroll.scrollLeft);input.disabled=max<=8;
}
function setTimelineZoom(zoom) {
  const scroll = $('timelineScroll'), stack = $('timelineStack');
  const center = scroll.scrollLeft + scroll.clientWidth / 2;
  const fraction = center / Math.max(1, stack.clientWidth);
  S.timelineZoom = J.clamp(zoom, 1, 8);
  sizeTimelineStack();
  scroll.scrollLeft = Math.max(0, fraction * stack.clientWidth - scroll.clientWidth / 2);
  $('timelineZoomValue').textContent = `${Math.round(S.timelineZoom * 100)}%`;
  $('timelineZoomOut').disabled = S.timelineZoom <= 1;
  $('timelineZoomIn').disabled = S.timelineZoom >= 8;
  drawTimeline(); drawTimelineLinks();
}
// Overlapping cuts (own end times, 1シーン groups) are drawn in stacked lanes, translucent, so every start
// and end stays reachable. Lanes are assigned greedily by start time; layers grow taller with more lanes.
function timelineCuts(layer) { return layer === 'lyrics' ? S.plan.cuts.filter(c => !c.blank) : S.plan[layer].cuts; }
function timelineLanes(layer) {
  const ends = [], lanes = new Map();
  for (const cut of [...timelineCuts(layer)].sort((a, b) => a.start - b.start || a.index - b.index)) {
    let lane = ends.findIndex(end => end <= cut.start + 1e-6);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = cut.end; lanes.set(cut, lane);
  }
  return { lanes, count: Math.max(1, ends.length) };
}
function timelineCanvas(layer) { return $(layer === 'lyrics' ? 'timeline' : layer === 'media' ? 'mediaTimeline' : 'foregroundTimeline'); }
function fitTimelineHeight(canvas, count, step, free = 2) {
  const extra = Math.max(0, count - free) * step;
  if (+canvas.dataset.extra === extra) return;
  canvas.dataset.extra = String(extra); canvas.style.height = '';
  if (extra) canvas.style.height = canvas.clientHeight + extra + 'px';
}
// Bar band of a layer's canvas in CSS pixels, and a cut's lane within it.
function timelineBand(layer, canvas = timelineCanvas(layer)) {
  const h = canvas.clientHeight;
  return layer === 'lyrics' ? { top: h * 0.3, bottom: h - 8 } : { top: 17, bottom: h - 3 };
}
function laneBox(layer, lane, count, canvas) {
  const band = timelineBand(layer, canvas), height = (band.bottom - band.top) / count;
  return { top: band.top + lane * height, height };
}
function drawTimeline() {
  sizeTimelineStack();
  const lanesInfo = timelineLanes('lyrics');
  fitTimelineHeight($('timeline'), lanesInfo.count, 22);
  const c = $('timeline'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(10, Math.round(c.clientWidth * dpr)), h = Math.max(10, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d'), D = Math.max(0.001, S.plan.duration), X = t => t / D * w;
  x.fillStyle = '#131316'; x.fillRect(0, 0, w, h);
  if (S.audio && S.audio.peaks) {
    const pk = S.audio.peaks, n = pk.length, sd = S.audio.duration;
    x.fillStyle = '#2b2b33';
    for (let i = 0; i < w; i += 2) { const t = i / w * D; if (t > sd) break; const v = pk[Math.min(n - 1, Math.floor(t / sd * n))]; const hh = v * h * 0.8; x.fillRect(i, h * 0.6 - hh / 2, 1.5, hh); }
  }
  const beats = S.plan.beats || [];
  x.fillStyle = '#3a3a44';
  for (const b of beats) { if (b > D) break; x.fillRect(Math.round(X(b)), h - 6 * dpr, 1, 6 * dpr); }
  const top = h * 0.3, overlapping = lanesInfo.count > 1, mono = getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace';
  for (const cut of timelineCuts('lyrics')) {
    const x0 = X(cut.start), x1 = X(cut.end), lane = laneBox('lyrics', lanesInfo.lanes.get(cut), lanesInfo.count, c);
    const y0 = lane.top * dpr, lh = Math.max(2, lane.height * dpr - (overlapping ? 1 : 0));
    const hue = layoutHue(cut.layout);
    x.fillStyle = `hsla(${hue},70%,58%,${overlapping ? 0.2 : 0.28})`; x.fillRect(x0, y0, Math.max(1, x1 - x0 - 1), lh);
    if (overlapping) { x.strokeStyle = `hsla(${hue},80%,62%,0.55)`; x.lineWidth = dpr; x.strokeRect(x0 + .5, y0 + .5, Math.max(1, x1 - x0 - 1), lh - 1); }
    x.fillStyle = `hsla(${hue},80%,62%,${overlapping ? 0.8 : 0.95})`; x.fillRect(x0, y0, Math.max(1, 2 * dpr), lh);
    x.fillRect(x0 - 2 * dpr, top - 3 * dpr, 6 * dpr, 6 * dpr);
    if (cut.manualEnd) drawTimelineEndHandle(x, x1, y0, lh, dpr);
    if (x1 - x0 > 34 * dpr) {
      x.fillStyle = 'rgba(236,231,225,0.85)'; x.font = `${10 * dpr}px ${mono}`;
      x.save(); x.beginPath(); x.rect(x0, y0, x1 - x0 - 3, lh); x.clip();
      x.fillText(cut.text || cut.lineText || '', x0 + 5 * dpr, y0 + Math.min(13 * dpr, lh - 3 * dpr)); x.restore();
    }
  }
  x.font = `${10 * dpr}px monospace`;
  for (const ln of S.plan.lines) {
    const lx = X(ln.start);
    x.fillStyle = '#5d5a63'; x.fillRect(lx, 0, 1, top);
    x.fillStyle = '#8e8a94'; x.fillText(String(ln.index + 1).padStart(2, '0'), lx + 3 * dpr, 12 * dpr);
  }
  const px = X(S.t);
  x.fillStyle = '#f5a50c'; x.fillRect(Math.round(px) - dpr, 0, 2 * dpr, h);
  drawTimelineDragGuide(x, w, h, dpr, 'lyrics');
  drawMediaTimeline();
  drawMediaTimeline('foreground');
}
function extendTapPreview(t) {
  const end = Math.max(S.plan.duration, t + 10);
  S.plan.duration = end;
  for (const layer of ['media', 'foreground']) {
    S.plan[layer].duration = end;
    const last = S.plan[layer].cuts.at(-1); if (last && last.videoDuration == null) last.end = end;
  }
}
// End handle of a cut with its own end time (「次カット再生まで」 off): drag it to change the end.
function drawTimelineEndHandle(x, px, y0, height, dpr) {
  x.fillStyle = '#ece7e1'; x.fillRect(px - 2 * dpr, y0, 2 * dpr, height);
  x.beginPath(); x.moveTo(px - 2 * dpr, y0); x.lineTo(px - 8 * dpr, y0); x.lineTo(px - 2 * dpr, y0 + 6 * dpr); x.closePath(); x.fill();
}
function drawMediaTimeline(layer = 'media') {
  const c = $(layer === 'media' ? 'mediaTimeline' : 'foregroundTimeline'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const lanesInfo = timelineLanes(layer), overlapping = lanesInfo.count > 1;
  fitTimelineHeight(c, lanesInfo.count, 24, 1);
  const w = Math.max(10, Math.round(c.clientWidth * dpr)), h = Math.max(10, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d'), D = Math.max(0.001, S.plan.duration), X = t => t / D * w;
  x.fillStyle = '#131316'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#8e8a94'; x.font = `${10 * dpr}px monospace`; x.fillText(layer === 'media' ? '背景' : '前景', 6 * dpr, 12 * dpr);
  for (const cut of S.plan[layer].cuts) {
    const a = X(cut.start), b = X(cut.end), lane = laneBox(layer, lanesInfo.lanes.get(cut), lanesInfo.count, c);
    const y0 = lane.top * dpr, lh = Math.max(2, lane.height * dpr - (overlapping ? 1 : 0)), rgb = cut.type === 'video' ? '22,244,212' : '245,165,12';
    x.fillStyle = `rgba(${rgb},${overlapping ? 0.2 : 0.28})`; x.fillRect(a, y0, Math.max(1, b - a - 1), lh);
    if (overlapping) { x.strokeStyle = `rgba(${rgb},0.55)`; x.lineWidth = dpr; x.strokeRect(a + .5, y0 + .5, Math.max(1, b - a - 1), lh - 1); }
    x.fillStyle = `rgba(${rgb},${overlapping ? 0.8 : 1})`; x.fillRect(a, y0, 2 * dpr, lh);
    x.fillRect(a - 2 * dpr, 14 * dpr, 6 * dpr, 6 * dpr);
    if (cut.manualEnd) drawTimelineEndHandle(x, b, y0, lh, dpr);
  }
  x.fillStyle = '#f5a50c'; x.fillRect(Math.round(X(S.t)) - dpr, 0, 2 * dpr, h);
  drawTimelineDragGuide(x, w, h, dpr, layer);
}
function drawTimelineDragGuide(ctx, width, height, dpr, layer) {
  const drag = S.timelineDrag;
  if (!drag || !drag.moved || (drag.mode === 'end' ? drag.layer !== layer : !linkedRefs(drag.ref).some(ref => boundaryLayer(ref) === layer))) return;
  const px = drag.preview / Math.max(0.001, S.plan.duration) * width;
  ctx.fillStyle = '#16f4d4'; ctx.fillRect(Math.round(px) - 2 * dpr, 0, 4 * dpr, height);
  ctx.fillStyle = '#101318'; ctx.fillRect(J.clamp(px + 5 * dpr, 0, width - 47 * dpr), 1 * dpr, 47 * dpr, 15 * dpr);
  ctx.fillStyle = '#16f4d4'; ctx.font = `${11 * dpr}px monospace`;
  ctx.fillText(`${drag.preview.toFixed(2)}s`, J.clamp(px + 8 * dpr, 3 * dpr, width - 44 * dpr), 12 * dpr);
}
function timelineSeek(ev) {
  const r = ev.currentTarget.getBoundingClientRect();
  seek((ev.clientX - r.left) / r.width * S.plan.duration);
}
function boundaryRef(layer, cut) {
  if (layer === 'foreground') return `f:${cut.index}`;
  if (layer === 'media') return `m:${cut.index}`;
  return `l:${cut.line}:${cut.part}`;
}
function boundaryLayer(ref) { return ref[0] === 'f' ? 'foreground' : ref[0] === 'm' ? 'media' : 'lyrics'; }
function boundaryCut(ref) {
  if (typeof ref !== 'string' || !S.plan) return null;
  const layer = boundaryLayer(ref);
  if (layer !== 'lyrics') {
    const index = +ref.slice(2);
    return Number.isInteger(index) && index >= 0 && ref === `${ref[0]}:${index}` ? S.plan[layer].cuts[index] || null : null;
  }
  return S.plan.cuts.find(c => c.line >= 0 && boundaryRef('lyrics', c) === ref) || null;
}
function linkedRefs(ref) {
  const seen = new Set([ref]), queue = [ref];
  for (const cur of queue) for (const link of S.project.timelineLinks) {
    const next = link.a === cur ? link.b : link.b === cur ? link.a : null;
    if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return queue;
}
function timelineMarkers() {
  const stack = $('timelineStack'), D = Math.max(0.001, S.plan.duration), markers = [];
  for (const [layer, id] of [['foreground', 'foregroundTimeline'], ['lyrics', 'timeline'], ['media', 'mediaTimeline']]) {
    const canvas = $(id), cuts = layer === 'lyrics' ? S.plan.cuts.filter(c => c.line >= 0) : S.plan[layer].cuts;
    const y = canvas.offsetTop + 11;
    for (const cut of cuts) markers.push({ ref: boundaryRef(layer, cut), layer, x: canvas.offsetLeft + cut.start / D * canvas.clientWidth, y });
  }
  return markers;
}
// Lock: a locked cut keeps the look it had when locked (effects, colours, fonts, division, area/placement);
// planning applies it under the user's own edits, so only direct operations on the cut change it.
// Direct operations (re-roll, details, position) keep it locked and capture the new look afterwards.
const LYRIC_UNLOCK = { lock: false, lockedSeed: undefined, lockedAreas: undefined, lockedComposites: undefined, lockedEffects: undefined, lockedUnits: undefined };
const MEDIA_UNLOCK = { lock: false, lockedSeed: undefined, lockedTechnique: undefined, lockedEntrance: undefined, lockedDeparture: undefined, lockedPlacement: undefined, lockedPlacementMode: undefined, lockedLayout: undefined, lockedItemId: undefined, lockedEffects: undefined };
function lyricLockPatch(index, plan = S.plan) {
  const line = plan.lines[index], cuts = plan.cuts.filter(c => c.line === index && Number.isInteger(c.part));
  return { lock: true, lockedSeed: line.seed,
    lockedAreas: Object.fromEntries(cuts.map(c => [c.part, c.area || null])),
    lockedComposites: Object.fromEntries(cuts.map(c => [c.part, { blend: c.blend, opacity: c.opacity }])),
    lockedEffects: Object.fromEntries(cuts.map(c => [c.part, J.cutLockSnapshot(c, 'lyrics', plan)])),
    lockedUnits: { text: line.text, groups: cuts.filter(c => !c.recap).map(c => c.text), recap: cuts.some(c => c.recap) } };
}
function mediaLockPatch(layer, index, plan = S.plan) {
  const cut = plan[layer].cuts[index];
  return { lock: true, lockedSeed: cut.seed, lockedTechnique: cut.technique, lockedEntrance: cut.entrance, lockedDeparture: cut.departure,
    lockedPlacement: cut.placement, lockedPlacementMode: cut.placementMode, lockedLayout: cut.bgLayout && JSON.parse(JSON.stringify(cut.bgLayout)), lockedItemId: cut.itemId, lockedEffects: J.cutLockSnapshot(cut, layer, plan) };
}
// After a direct operation on a still-locked cut: plan once with the change, then lock that result.
function relock(layer, index) {
  const locked = layer === 'lyrics' ? S.project.overrides[index]?.lock : S.project[layer].cutOverrides[index]?.lock;
  if (!locked) return;
  const plan = composePlan(S.project);
  if (layer === 'lyrics') { if (plan.lines[index]) setOv(index, lyricLockPatch(index, plan)); }
  else if (plan[layer].cuts[index]) mediaOv(index, mediaLockPatch(layer, index, plan), layer);
}
function rerollLyricLine(index) {
  const line = S.plan.lines[index]; if (!line) return;
  const current = S.project.overrides[index] || {};
  J.clearPastedLyricEffects(S.project,index);
  // A locked line re-rolls its effects but keeps its place (re-layout is 再配置's job).
  setOv(index, { seed: (current.seed | 0) + 1, ...LYRIC_UNLOCK, ...(current.lock ? { lock: true, lockedAreas: current.lockedAreas } : {}) });
  relock('lyrics', index);
  replan();
}
function disableAndReroll(layer,index,part=null) {
  const project=S.project;
  if(layer==='lyrics'){
    const cuts=S.plan.cuts.filter(c=>c.line===index && Number.isInteger(c.part) && (part==null || c.part===part));
    if(!cuts.length)return;
    for(const cut of cuts){
      for(const group of ['layout','enter','hold','exit','treat','bg','cam','trans']){
        const key=cut[group];if(key && Object.hasOwn(J.registry(group),key))(project.enabled[group] ||= {})[key]=false;
      }
      for(const decor of cut.decor || [])(project.enabled.decor ||= {})[decor.id]=false;
      for(const event of S.plan.events.filter(e=>e.cutOwner===`${cut.line}:${cut.part}`))(project.enabled.fx ||= {})[event.type]=false;
    }
    // Line-wide reroll must not retain explicit choices that override the pool.
    const ov=project.overrides[index] ||= {};
    for(const key of ['layout','enter','hold','exit','treat','bg','cam','trans','decor'])delete ov[key];
    for(const [key,options] of Object.entries(project.lyricCutOptions || {}))if(key.startsWith(`${index}:`) && options.details){
      options.details=Object.fromEntries(Object.entries(options.details).filter(([field])=>['text','area'].includes(field)));
      delete options.pastedEffects;
    }
    rerollLyricLine(index);renderTech();
  }else{
    const cut=S.plan[layer]?.cuts[index];if(!cut)return;
    const settings=J.mediaEffectSettings(project,layer);
    for(const key of [cut.technique,cut.entrance,cut.departure])if(J.MEDIA_TECH[key])settings.enabled[key]=false;
    project[layer].effects=settings;
    const options=mediaCutOptions(layer,index);
    const patch={technique:null,entrance:null,departure:null,details:undefined};
    for(const key of ['layout','enter','hold','exit','treat','trans','effectSettings'])patch[key]=undefined;
    // Override any asset-wide legacy choices for this cut without changing its placement.
    project[layer].cutOverrides[index]={...options,...patch};
    rerollMediaCut(layer,index);renderMediaEffects(layer);
  }
}
function disableRerollButton(layer,index,part=null){
  const button=document.createElement('button');button.type='button';button.className='icon ghost disable-reroll';
  button.title=J.mediaLabel('この演出をOFFにして再抽選','Disable current effects and randomize');button.setAttribute('aria-label',button.title);button.innerHTML=ICON.disableReroll;
  button.addEventListener('click',()=>disableAndReroll(layer,index,part));return button;
}
function toggleLyricLineLock(index) {
  const line = S.plan.lines[index]; if (!line) return;
  const current = S.project.overrides[index] || {};
  setOv(index, current.lock ? LYRIC_UNLOCK : lyricLockPatch(index));
  replan();
}
function emphasisFrontmostHint() {
  return J.mediaLabel('*強調*した歌詞は常に最前表示です。解除するには歌詞の * を外してください。', 'Emphasized lyrics always appear in front. Remove the * markers to turn this off.');
}
function toggleLyricCutFrontmost(line, part) {
  const key = `${line}:${part}`, options = S.project.lyricCutOptions;
  const cut = S.plan.cuts.find(c => c.line === line && c.part === part);
  if (cut?.emphasis) { toast(emphasisFrontmostHint()); return; }
  options[key] = { ...options[key], frontmost: !cut?.frontmost };
  replan();
}
function setLyricCutComposite(line, part, patch) {
  const key = `${line}:${part}`, options = S.project.lyricCutOptions;
  options[key] = { ...options[key], ...patch };
  for (const field of ['blend', 'opacity']) if (options[key][field] === undefined) delete options[key][field];
  if (!Object.keys(options[key]).length) delete options[key];
  const override = S.project.overrides[line];
  const locked = override?.lockedComposites?.[part];
  if (locked) for (const [field, value] of Object.entries(patch)) if (value === undefined) delete locked[field];
  replan();
}
function mediaCutOptions(layer, index) {
  const cut = S.plan[layer].cuts[index]; if (!cut) return null;
  const media = S.project[layer];
  return Object.assign({}, media.overrides[cut.itemId] || {}, media.cutOverrides[index] || {});
}
function rerollMediaCut(layer, index) {
  const cut = S.plan[layer].cuts[index], options = mediaCutOptions(layer, index);
  if (!cut || !options) return;
  mediaOv(index, { technique: null, seed: (options.seed | 0) + 1, ...MEDIA_UNLOCK, ...(options.lock ? { lock: true, lockedPlacement: options.lockedPlacement, lockedPlacementMode: options.lockedPlacementMode, lockedLayout: options.lockedLayout, lockedItemId: options.lockedItemId } : {}) }, layer);
  relock(layer, index);
  replan();
}
function toggleMediaCutLock(layer, index) {
  const cut = S.plan[layer].cuts[index], options = mediaCutOptions(layer, index);
  if (!cut || !options) return;
  mediaOv(index, options.lock ? MEDIA_UNLOCK : mediaLockPatch(layer, index), layer);
  replan();
}
async function effectFavoriteAction(action,layer,index,part=0){
  const cut=layer==='lyrics'?S.plan.cuts.find(c=>c.line===index&&c.part===part):S.plan[layer]?.cuts[index];
  if(!cut)return;
  pause();
  if(action==='copy'){
    const list=S.project.effectFavorites ||= [];
    const number=(S.project.favoriteSequence||0)+1;
    const project=S.project;
    const payload=J.cutEffectsPayload(cut,layer,S.plan);
    const name=await J.requestFavoriteName(J.mediaLabel('お気に入り','Favorite ')+number);
    if(project!==S.project)return;
    if(name===null)return;
    remember();S.project.favoriteSequence=number;
    list.push({id:J.favoriteId(),name:name.trim()||J.mediaLabel('お気に入り','Favorite ')+number,payload});
    autosave();toast(J.mediaLabel('演出をお気に入りに追加しました','Effects added to favorites'));
  }else openEffectFavorites({layer,index,part,cut});
}
function openEffectFavorites(target=null){
  pause();const project=S.project;
  J.openEffectFavorites({project,target,compose:composePlan,
    changed:()=>{autosave();},
    configure:()=>{syncUI();renderTech();renderMediaEffects('foreground');renderMediaEffects('media');replan();},
    apply:payload=>{
      if(project!==S.project)return false;
      const cut=target.layer==='lyrics'?S.plan.cuts.find(c=>c.line===target.index&&c.part===target.part):S.plan[target.layer]?.cuts[target.index];
      if(cut!==target.cut)return false;
      remember();J.pasteCutEffects(S.project,S.plan,target.layer,cut,payload);replan();
      toast(J.mediaLabel('お気に入りの演出を適用しました','Favorite effects applied'));return true;
    },
    closed:()=>{J.syncMediaPreview(S.plan,S.t,false);S.need=true;}
  });
}
function effectFavoriteButtons(layer,index,part=0){
  return ['copy','paste'].map(action=>{
    const button=document.createElement('button');button.type='button';button.className='icon ghost effect-'+action;
    button.title=action==='copy'?J.mediaLabel('演出をお気に入りに追加','Add effects to favorites'):J.mediaLabel('お気に入りから演出を適用','Apply favorite effects');button.setAttribute('aria-label',button.title);
    button.innerHTML=ICON[action];button.onclick=()=>effectFavoriteAction(action,layer,index,part);return button;
  });
}
function detailButton(onClick) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'icon ghost cut-details-open';
  button.title = J.mediaLabel('カットの詳細編集','Edit cut details'); button.setAttribute('aria-label',button.title);
  button.innerHTML = ICON.details; button.addEventListener('click',onClick); return button;
}
let cutPreviewSolo=false,cutPreviewFocus=false;// remembered while the page is open
function openCutDetails(layer,index,part=0) {
  const lyric = layer === 'lyrics', L = J.mediaLabel, clone = value => JSON.parse(JSON.stringify(value));
  const cut = lyric ? S.plan.cuts.find(c=>c.line===index && c.part===part) : S.plan[layer]?.cuts[index];
  if (!cut) return;
  pause();
  const key = `${index}:${part}`, original = clone(lyric ? S.project.lyricCutOptions[key] || {} : S.project[layer].cutOverrides[index] || {});
  let draft = clone(original), current = clone(cut), start = cut.start;
  let locked = !!(lyric ? S.project.overrides[index]?.lock : original.lock);
  const initialLock = locked;
  const disabledChoices=[];
  let removedDetail = null;
  const openDetails = new Map();
  let activeDetailTab='basic';
  let personFps=draft.personCutout?.fps || Math.min(24,S.plan.fps || 24),personController=null,personStatus=null,personSync=null;
  const dialog = document.createElement('dialog'); dialog.id='cutDetailsDialog'; dialog.className='cut-details-dialog';
  dialog.setAttribute('aria-label',L('カットの詳細編集','Edit cut details'));dialog.tabIndex=-1;
  // Left: a live preview of this cut that stays in view; right: the settings, which scroll on their own.
  const pane=document.createElement('aside');pane.className='cut-details-preview';
  pane.innerHTML=`<h2></h2><canvas></canvas><div class="effect-preview-seek"><button type="button" data-cut-preview-play></button><span class="tc effect-preview-now">00:00.00</span><span class="tc muted">/</span><span class="tc muted effect-preview-dur">00:00.00</span><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i><input type="range" min="0" max="1000" step="1" value="0" data-cut-preview-seek></div></div><label class="check cut-details-solo"><input type="checkbox" data-preview-solo><span></span></label><label class="check cut-details-focus"><input type="checkbox" data-preview-focus><span></span></label>`;
  pane.querySelector('h2').textContent=L('カットの詳細編集','Edit cut details')+' — '+(lyric?L('歌詞','Lyrics'):layer==='foreground'?L('前景','Foreground'):L('背景','Background'))+` ${index+1}${lyric?` / ${part+1}`:''}`;
  pane.querySelector('.progress').setAttribute('aria-label',L('再生位置','Playback position'));
  const solo=pane.querySelector('[data-preview-solo]');solo.checked=cutPreviewSolo;solo.nextElementSibling.textContent=L('編集対象単体を表示','Show the edited cut only');
  solo.addEventListener('change',()=>{cutPreviewSolo=solo.checked;});
  const focus=pane.querySelector('[data-preview-focus]');focus.checked=cutPreviewFocus;focus.nextElementSibling.textContent=L('編集対象にフォーカス','Focus on the edited cut');
  focus.addEventListener('change',()=>{cutPreviewFocus=focus.checked;});
  const formHost=document.createElement('div');formHost.className='cut-details-form';
  dialog.append(pane,formHost);
  document.body.appendChild(dialog);
  const previewCanvas=pane.querySelector('canvas'),previewRenderer=new J.Renderer();
  let previewPlan=S.plan,previewCut=cut,previewFrame=0,previewTimer=0,previewLast=performance.now(),previewTime=0,previewPlaying=true;
  const previewPlay=pane.querySelector('[data-cut-preview-play]'),previewSeek=pane.querySelector('[data-cut-preview-seek]');
  const previewLength=()=>Math.max(.1,Math.min(previewCut.end,previewPlan.duration)-previewCut.start);
  const syncPreviewPlay=()=>{previewPlay.textContent=previewPlaying?'❚❚':'▶';previewPlay.setAttribute('aria-label',previewPlaying?L('停止','Pause'):L('再生','Play'));previewPlay.title=previewPlay.getAttribute('aria-label');};
  syncPreviewPlay();previewSeek.setAttribute('aria-label',L('プレビューの再生位置','Preview playback position'));
  previewPlay.addEventListener('click',()=>{previewPlaying=!previewPlaying;previewLast=performance.now();syncPreviewPlay();});
  previewSeek.addEventListener('input',()=>{previewTime=Number(previewSeek.value)/1000*previewLength();previewLast=performance.now();});
  const findCut=plan=>lyric ? plan.cuts.find(c=>c.line===index&&c.part===part) : plan[layer]?.cuts[index];
  const draftProject=()=>{const project=clone(S.project);applyDisabledChoices(project);{if(lyric)project.lyricCutOptions[key]=draft;else project[layer].cutOverrides[index]=draft;}return project;};
  function refreshPreview(){
    const range=c=>JSON.stringify([c.start,c.end,c.itemId,c.videoStart,c.videoLoop]),before=range(previewCut);
    previewPlan=composePlan(draftProject());previewCut=findCut(previewPlan)||previewCut;
    if(before!==range(previewCut))personStatus=null;
    if(!personController)personSync?.();return previewCut;
  }
  Object.defineProperty(dialog,'cutPreview',{value:Object.freeze({get plan(){return previewPlan;},get cut(){return previewCut;}})});// read-only hook for tests
  // Number and text edits only rebuild the preview; the form is left as it is.
  const detailState=()=>JSON.stringify({draft,locked,start,disabledChoices});
  const detailHistory=[detailState()];let detailHistoryIndex=0;
  function syncDetailHistory(){
    const undo=dialog.querySelector('[data-detail-undo]'),redo=dialog.querySelector('[data-detail-redo]');
    if(undo)undo.disabled=detailHistoryIndex===0;if(redo)redo.disabled=detailHistoryIndex===detailHistory.length-1;
  }
  function rememberDetail(){
    const state=detailState();if(state===detailHistory[detailHistoryIndex])return;
    detailHistory.splice(detailHistoryIndex+1);detailHistory.push(state);
    if(detailHistory.length>100)detailHistory.shift();detailHistoryIndex=detailHistory.length-1;syncDetailHistory();
  }
  function moveDetailHistory(delta){
    if(personController)return;
    const next=detailHistoryIndex+delta;if(next<0||next>=detailHistory.length)return;
    const focused=document.activeElement,attribute=['data-detail-field','data-mask-field','data-mask-shape','data-mask-motion','data-detail-undo','data-detail-redo'].find(a=>focused?.hasAttribute(a));
    const focusSelector=attribute?`[${attribute}="${CSS.escape(focused.getAttribute(attribute))}"]`:'[data-detail-undo]';
    detailHistoryIndex=next;const state=JSON.parse(detailHistory[next]);draft=state.draft;locked=state.locked;start=state.start;disabledChoices.splice(0,disabledChoices.length,...state.disabledChoices);
    clearTimeout(previewTimer);current=refreshPreview();render();const restoredFocus=dialog.querySelector(focusSelector);(restoredFocus&&!restoredFocus.disabled?restoredFocus:dialog).focus({preventScroll:true});
  }
  dialog.addEventListener('keydown',e=>{
    // Enter in an input commits its value without implicitly clicking Apply.
    if(e.key==='Enter'&&e.target instanceof HTMLInputElement&&!e.isComposing)e.preventDefault();
  });
  // Rebuilding the form can leave focus on body. Route modal history before
  // document shortcuts, even when the event does not bubble through the dialog.
  const detailShortcut=e=>{
    if(!dialog.open)return;
    // Repeated Escape can make the browser's cancel event non-cancelable.
    // Stop its default close action before it reaches that native pathway.
    if(personController&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();return;}
    if(!(e.ctrlKey||e.metaKey)||e.altKey||e.isComposing||!['KeyZ','KeyY'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();moveDetailHistory(e.code==='KeyY'||e.shiftKey?1:-1);
  };
  document.addEventListener('keydown',detailShortcut,true);
  const schedulePreview=()=>{rememberDetail();clearTimeout(previewTimer);previewTimer=setTimeout(()=>{if(dialog.open)refreshPreview();},120);};
  // "Show the edited cut only": other layers are switched off and other lyric cuts are left out
  // of a shallow plan copy (the cut keeps its own background effect and transition).
  const soloOptions=lyric?{noForeground:true,noMedia:true}:layer==='foreground'?{noMedia:true,noLyrics:true}:{noForeground:true,noLyrics:true};
  let soloSource=null,soloShown=null;
  const soloPlan=(plan,c)=>{
    if(soloSource!==plan){soloSource=plan;soloShown=lyric?{...plan,retainedCutIndices:(plan.retainedCutIndices||[]).filter(i=>i===c.index)}:{...plan,cuts:[],retainedCutIndices:[],events:[]};}
    return soloShown;
  };
  // "Focus on the edited cut": the union of the cut's drawn pixels over its duration (stage
  // fractions), found by drawing only the cut, transparently and small, at ten times.
  const probe=document.createElement('canvas'),probeRenderer=new J.Renderer();
  let focusSource=null,focusRect=null;
  function focusOf(plan,c){
    if(focusSource===plan)return focusRect;
    focusSource=plan;focusRect=null;
    const pw=240,ph=Math.max(1,Math.round(pw*plan.H/plan.W));probe.width=pw;probe.height=ph;
    const px=probe.getContext('2d',{willReadFrequently:true}),end=Math.min(c.end,plan.duration);
    // Sample the settled part: entrance/exit motion may travel far and would shrink the focus.
    const phase=lyric?null:Math.min(c.effectSettings?.duration||.45,(c.end-c.start)*.3);
    const settleIn=lyric?(c.inDur||0)+(c.stagger||0)*Math.max(0,[...(c.text||'')].length-1):phase,settleOut=lyric?c.outDur||0:phase;
    let from=c.start+settleIn,to=end-settleOut;if(to-from<.05){from=c.start;to=end;}
    const length=Math.max(.05,to-from);
    let x0=Infinity,y0=Infinity,x1=-1,y1=-1;
    for(let k=0;k<10;k++){
      const t=from+length*(k+.5)/10;
      px.setTransform(1,0,0,1,0,0);px.globalAlpha=1;px.globalCompositeOperation='source-over';px.filter='none';px.clearRect(0,0,pw,ph);
      try{
        if(lyric)probeRenderer.frame(px,soloPlan(plan,c),t,{scale:pw/plan.W,noHud:true,noPost:true,transparent:true,...soloOptions});
        else J.drawMediaCut(px,c,t,{source:J.isMediaCopy(c.itemId)?J.mediaCopySource(plan,c,t,probeRenderer,pw,ph):null});
      }catch(e){continue;}
      const d=px.getImageData(0,0,pw,ph).data;
      for(let y=0;y<ph;y++)for(let x=0;x<pw;x++)if(d[(y*pw+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    }
    if(x1>=0)focusRect={x:x0/pw,y:y0/ph,w:(x1-x0+1)/pw,h:(y1-y0+1)/ph};
    return focusRect;
  }
  // The stage window shown when focusing: the cut plus a margin, kept inside the stage.
  function focusWindow(r){
    if(!r)return null;
    const size=Math.min(1,Math.max(r.w,r.h,.04)*1.12),clampTo=(center)=>J.clamp(center-size/2,0,1-size);
    return size>=1?null:{x:clampTo(r.x+r.w/2),y:clampTo(r.y+r.h/2),size};
  }
  const zoomCanvas=document.createElement('canvas');
  function personEditor(parent){
    if(lyric)return;
    const section=document.createElement('section');section.dataset.detailSection='personCutout';section.className='person-cutout-editor';parent.append(section);
    const hint=document.createElement('p');hint.className='hint';hint.textContent=L('カット内で再生する範囲だけ人物マスクを作成します。再生時間・開始位置を変えた後は再実行してください','Generate masks only for the range played in this cut. Run again after changing its duration or source start.');section.append(hint);
    const controls=document.createElement('div');controls.className='person-cutout-controls';section.append(controls);
    const field=(title,input)=>{const label=document.createElement('label');label.className='cut-detail-field';const text=document.createElement('span');text.textContent=title;label.append(text,input);controls.append(label);};
    const fps=document.createElement('input');fps.type='number';fps.min=1;fps.max=60;fps.step=1;fps.value=personFps;fps.dataset.personFps='';fps.onchange=()=>{personFps=J.clamp(Math.round(+fps.value||24),1,60);fps.value=personFps;personStatus=null;sync();};field(L('動画の解析枚数／秒','Video analysis frames / second'),fps);
    const note=document.createElement('p');note.className='hint';note.textContent=L('解析枚数を下げると切り抜きが早く完了しますが、速い動きでマスクがズレやすくなります。','Lowering the analysis rate finishes the cutout sooner, but masks are more likely to misalign during fast motion.');section.append(note);
    const run=document.createElement('button');run.type='button';run.dataset.personRun='';run.textContent=L('人物切り抜きを実行','Generate person mask');
    const stop=document.createElement('button');stop.type='button';stop.dataset.personCancel='';stop.textContent=L('処理を中止','Stop processing');stop.hidden=!personController;stop.onclick=()=>personController?.abort();section.append(run,stop);
    const status=document.createElement('p');status.dataset.personStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');section.append(status);
    const progress=document.createElement('progress');progress.dataset.personProgress='';progress.max=1;progress.hidden=!personController;section.append(progress);
    const options=document.createElement('div');options.className='person-cutout-options';section.append(options);
    const effectsTitle=document.createElement('h4');effectsTitle.textContent=L('切り抜き効果','Cutout effects');options.append(effectsTitle);
    const effectsHint=document.createElement('p');effectsHint.className='hint';effectsHint.textContent=L('マスク作成後に切り抜き効果をONにできます。','Generate a mask to enable cutout effects.');options.append(effectsHint);
    const setOption=(key,value)=>{draft.personCutout={...draft.personCutout,[key]:value};schedulePreview();};
    const display=document.createElement('input');display.type='checkbox';display.dataset.personDisplay='';display.checked=draft.personCutout?.display==='only';display.onchange=()=>setOption('display',display.checked?'only':'none');
    const displayLabel=document.createElement('label');displayLabel.className='check';const displayText=document.createElement('span');displayText.textContent=L('人物のみ表示','Show person only');displayLabel.append(display,displayText);options.append(displayLabel);
    for(const [key,ja,en] of [['behindLyrics','文字を人物の後ろへ','Place text behind the person'],['behindForeground','前景を人物の後ろへ','Place foreground behind the person']]){
      const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.dataset.personOption=key;input.checked=!!draft.personCutout?.[key];input.onchange=()=>setOption(key,input.checked);const text=document.createElement('span');text.textContent=L(ja,en);label.append(input,text);options.append(label);
    }
    let available=false,savedEntry=null;
    const sync=()=>{
      const busy=!!personController,ref=J.personCutout({...current,personCutout:draft.personCutout});
      fps.disabled=busy||current.type!=='video';run.disabled=busy||!J.mediaAssets.has(current.itemId)||J.isMediaCopy(current.itemId);stop.hidden=!busy;progress.hidden=!busy;
      for(const input of options.querySelectorAll('input,select'))input.disabled=busy||!available;
      effectsHint.hidden=busy||available;
      if(personStatus){status.textContent=personStatus.text;if(personStatus.value==null)progress.removeAttribute('value');else progress.value=personStatus.value;}
      else {
        status.textContent=ref?L('保存済みマスク：','Saved mask: ')+`${ref.frameCount} ${L('枚','frames')}`:'';
        if(savedEntry){try{
          if(savedEntry.meta.model!==J.PERSON_MODEL.id || personFps!==savedEntry.meta.fps)status.textContent+=' — '+L('解析設定の変更により、現在の再生範囲を再作成します。','Changed analysis settings will regenerate the current playback range.');
          else {const coverage=J.personMaskCoverage({...previewCut,start},savedEntry);status.textContent+=' — '+(coverage.missing?L(`現在の再生範囲に${coverage.missing}枚不足しています。再実行で追加できます。`,`${coverage.missing} frames missing for the current playback range. Run again to add them.`):L('現在の再生範囲は作成済みです。','The current playback range is already covered.'));}
        }catch(error){status.textContent+=' — '+error.message;}}
      }
      status.hidden=!status.textContent;
    };
    personSync=sync;
    const ref=J.personCutout({...current,personCutout:draft.personCutout});
    if(ref)J.loadPersonMask(ref).then(entry=>{savedEntry=entry;available=!!entry;if(!entry)status.textContent=L('保存済みマスクが見つかりません。再作成してください。','Saved mask is missing. Generate it again.');else sync();}).catch(()=>{status.textContent=L('保存済みマスクを読み込めません。再作成してください。','Cannot load the saved mask. Generate it again.');});
    run.onclick=async()=>{
      if(personController)return;
      clearTimeout(previewTimer);current=refreshPreview();const c={...current,start,personCutout:draft.personCutout},controller=new AbortController();personController=controller;const playingBefore=previewPlaying;previewPlaying=false;syncPreviewPlay();let additional=null;
      // Keep the progress and Stop control accessible; block every other modal
      // region, including preview controls, tabs and both footer actions.
      const frozen=[...dialog.querySelectorAll('input,select,textarea,button')].filter(input=>!input.closest('.person-cutout-editor')).map(input=>[input,input.disabled]);
      const blocked=[...dialog.querySelectorAll('.cut-details-preview,.cut-details-history,.cut-details-tabs,.cut-details-actions,[data-detail-tab-panel]:not([data-detail-tab-panel="personCutout"])')].map(node=>[node,node.inert]);
      const freeze=busy=>{dialog.classList.toggle('person-cutout-busy',busy);for(const [input,disabled] of frozen)input.disabled=busy||disabled;for(const [node,inert] of blocked)node.inert=busy||inert;};
      freeze(true);personStatus={text:L('モデルを準備しています…','Preparing model…')};sync();stop.focus({preventScroll:true});
      try{
        const result=await J.generatePersonMask(c,{fps:personFps,signal:controller.signal,onProgress:p=>{
          if(p.phase==='plan'){additional=p.missing;personStatus={text:L(`再生範囲：${p.total}枚／作成済み：${p.reused}枚／追加：${p.missing}枚`,`Playback range: ${p.total} frames / saved: ${p.reused} / additional: ${p.missing}`),value:p.missing?0:1};}
          else if(p.phase==='download')personStatus={text:p.cached?L('保存済みモデルを読み込んでいます…','Loading cached model…'):L('モデルをダウンロードしています：','Downloading model: ')+(p.loaded?(p.loaded/1048576).toFixed(1)+' MB'+(p.total?' / '+(p.total/1048576).toFixed(1)+' MB':''):'…'),value:p.total?p.loaded/p.total:null};
          else if(p.phase==='initialize')personStatus={text:L('モデルを初期化しています…','Initializing model…')};
          else if(p.phase==='analyze')personStatus={text:L('人物マスクを作成しています：','Generating person masks: ')+`${p.completed} / ${p.total} (${Math.round(p.completed/p.total*100)}%)`+(p.reused?L(` — 作成済み${p.reused}枚を再利用`,` — reusing ${p.reused} saved frames`):'')+` — ${p.backend}`,value:p.completed/p.total};
          else if(p.phase==='save')personStatus={text:L('マスクを保存しています…','Saving mask…')};
          sync();
        }});
        if(controller.signal.aborted || !dialog.open)return;
        draft.personCutout=result;personStatus={text:additional===0?L('現在の再生範囲はすべて作成済みです。追加の解析は行っていません。','The current playback range is already covered. No additional inference was needed.'):L('再生範囲のマスクを作成しました。下の切り抜き効果をONにできます。','Masks generated for the playback range. Enable cutout effects below.'),value:1};rememberDetail();current=refreshPreview();
      }catch(error){personStatus={text:error.name==='AbortError'?L('処理を中止しました。既存のマスクは保持しています。','Processing stopped. The existing mask is preserved.'):L('人物切り抜きに失敗しました：','Person mask generation failed: ')+error.message};}
      finally{personController=null;previewPlaying=playingBefore;previewLast=performance.now();syncPreviewPlay();if(dialog.open){freeze(false);render();dialog.querySelector('[data-person-run]')?.focus({preventScroll:true});}}
    };
    sync();
  }
  // ---- Mask editor: circles / rectangles placed on a reference image of the mask's frame ----
  const maskRef=document.createElement('canvas'),maskRefRenderer=new J.Renderer();
  let maskRefKey=null,maskRefInfo=null,maskSelected=0;
  function maskReference(target){
    const plan=previewPlan,c=previewCut;
    if(maskRefKey&&maskRefKey.plan===plan&&maskRefKey.target===target)return maskRefInfo;
    maskRefKey={plan,target};
    const element=!lyric&&target==='source'&&J.mediaAssets.get(c.itemId)?.element;
    const sw=element&&(element.videoWidth||element.naturalWidth||element.width),sh=element&&(element.videoHeight||element.naturalHeight||element.height);
    if(sw&&sh)return maskRefInfo={image:element,sx:0,sy:0,sw,sh,aspect:sw/sh};
    // Otherwise the cut alone at mid-cut, drawn without masks.
    const rw=480,rh=Math.round(rw*plan.H/plan.W);maskRef.width=rw;maskRef.height=rh;
    const rx=maskRef.getContext('2d');rx.setTransform(1,0,0,1,0,0);rx.clearRect(0,0,rw,rh);
    J.masksSuspended=true;
    const referenceCut=lyric&&target==='source'&&c.area?{...c,area:{...c.area,angle:0}}:c;
    const referencePlan=referenceCut===c?soloPlan(plan,c):{...soloPlan(plan,c),cuts:plan.cuts.map(cut=>cut.index===c.index?referenceCut:cut)};
    try{maskRefRenderer.frame(rx,referencePlan,(c.start+Math.min(c.end,plan.duration))/2,{scale:rw/plan.W,noHud:true,...soloOptions});}catch(e){}
    finally{J.masksSuspended=false;}
    if(lyric&&target==='source'){const a=c.area||{x:0,y:0,w:1,h:1};return maskRefInfo={image:maskRef,sx:a.x*rw,sy:a.y*rh,sw:a.w*rw,sh:a.h*rh,aspect:a.w*plan.W/(a.h*plan.H)};}
    return maskRefInfo={image:maskRef,sx:0,sy:0,sw:rw,sh:rh,aspect:plan.W/plan.H};
  }
  function maskEditor(parent){
    const mask=J.normalizeMask(draft.details?.mask ?? current.mask) || J.normalizeMask({});// defaults include the motion
    maskSelected=Math.min(maskSelected,Math.max(0,mask.shapes.length-1));
    const section=document.createElement('section');section.dataset.detailSection='mask';section.className='cut-mask';
    section.innerHTML=`<div class="cut-mask-controls"><label><input type="checkbox" data-mask-field="enabled"> <span></span></label><label><span></span> <select data-mask-field="target"></select></label><label><input type="checkbox" data-mask-field="invert"> <span></span></label></div><p class="hint cut-mask-hint"></p><div class="cut-mask-aspect"></div><div class="cut-mask-tools"><select data-mask-add></select><button type="button" data-mask-remove></button></div><div class="cut-mask-stage"><canvas class="cut-mask-canvas"></canvas><div class="cut-mask-handles area-edit-overlay media-edit"><div class="area-edit-rect"><span class="area-edit-handle nw" data-mask-handle="nw"></span><span class="area-edit-handle ne" data-mask-handle="ne"></span><span class="area-edit-handle sw" data-mask-handle="sw"></span><span class="area-edit-handle se" data-mask-handle="se"></span><span class="area-rotate-handle n" data-mask-handle="rotate" role="button" aria-label="${L('回転','Rotate')}"></span><span class="area-rotate-handle e" data-mask-handle="rotate" role="button" aria-label="${L('回転','Rotate')}"></span><span class="area-rotate-handle s" data-mask-handle="rotate" role="button" aria-label="${L('回転','Rotate')}"></span><span class="area-rotate-handle w" data-mask-handle="rotate" role="button" aria-label="${L('回転','Rotate')}"></span></div></div></div><div class="cut-details-grid cut-mask-shape"></div><div class="cut-mask-motion"><h4></h4><p class="hint"></p><div class="cut-details-grid"></div></div>`;
    const [useText,targetText,invertText]=section.querySelectorAll('.cut-mask-controls label > span');
    useText.textContent=L('マスクを使う','Use mask');targetText.textContent=L('マスク対象','Mask target');invertText.textContent=L('マスク反転','Invert mask');
    const target=section.querySelector('[data-mask-field="target"]');
    target.add(new Option(L('素材','Source'),'source'));target.add(new Option(L('カット','Cut'),'cut'));
    section.querySelector('[data-mask-field="enabled"]').checked=mask.enabled;target.value=mask.target;section.querySelector('[data-mask-field="invert"]').checked=mask.invert;
    const hint=section.querySelector('.cut-mask-hint');
    const setHint=()=>{hint.textContent=mask.target==='source'
      ?(lyric?L('素材：表示範囲を基準に文字をマスクします。マスク後の文字にカメラなどの演出がかかります。','Source: masks the lyric within its display area; camera and other effects apply to the masked lyric.')
             :L('素材：素材画像を基準にマスクします。マスク後の素材に演出・エフェクトがかかります。','Source: masks the source image itself; techniques and effects apply to the masked source.'))
      :L('カット：画面全体を基準に、演出・エフェクト適用後のカットをマスクします。','Cut: masks the finished cut, after its effects, relative to the whole stage.');};
    const tools={add:section.querySelector('[data-mask-add]'),remove:section.querySelector('[data-mask-remove]')};
    const shapeNames={ellipse:['円','Circle'],rect:['四角','Rectangle'],roundRect:['角丸四角','Rounded rectangle'],triangle:['三角','Triangle'],diamond:['ひし形','Diamond'],pentagon:['五角形','Pentagon'],hexagon:['六角形','Hexagon'],star:['星','Star'],heart:['ハート','Heart']};
    // "Add shape…" menu: picking a type adds that shape; the selected shape's type is edited below.
    tools.add.add(new Option(L('図形を追加…','Add shape…'),''));
    for(const type of J.MASK_SHAPES)tools.add.add(new Option(L(...shapeNames[type]),type));
    tools.add.setAttribute('aria-label',L('図形を追加','Add shape'));tools.remove.textContent=L('選択中の図形を削除','Remove selected shape');
    const canvas=section.querySelector('canvas'),shapeBox=section.querySelector('.cut-mask-shape');
    const save=()=>{write('mask',clone(mask),false);draw();};
    const opacityLabel=document.createElement('label');
    opacityLabel.innerHTML=`<span>${L('不透明度（％）','Opacity (%)')}</span> <input type="number" min="0" max="100" step="1" data-mask-field="opacity">`;
    const opacityInput=opacityLabel.querySelector('input');opacityInput.value=mask.opacity;
    opacityInput.addEventListener('input',()=>{
      if(opacityInput.value===''||!opacityInput.validity.valid)return;
      mask.opacity=Number(opacityInput.value);save();
    });
    const controls=section.querySelector('.cut-mask-controls');
    const [useLabel,targetLabel,invertLabel]=controls.children;
    const opacityRow=document.createElement('div');opacityRow.className='cut-mask-opacity-row';opacityRow.append(opacityLabel,invertLabel);
    const targetRow=document.createElement('div');targetRow.className='cut-mask-target-row';targetRow.append(targetLabel,hint);
    controls.replaceChildren(useLabel,targetRow,opacityRow);
    const featherLabel=document.createElement('label');featherLabel.className='cut-mask-feather';
    featherLabel.innerHTML=`<span>${L('境界のぼかし','Edge feathering')}</span><input type="range" min="0" max="100" step="1" data-mask-field="feather"><output></output>`;
    const featherInput=featherLabel.querySelector('input'),featherValue=featherLabel.querySelector('output');
    featherInput.value=mask.feather;featherValue.textContent=String(mask.feather);
    featherInput.addEventListener('input',()=>{mask.feather=Number(featherInput.value);featherValue.textContent=String(mask.feather);save();});
    controls.append(featherLabel);
    function draw(){
      const ref=maskReference(mask.target),cw=480,ch=Math.round(Math.min(320,cw/ref.aspect)),w=Math.round(Math.min(cw,ch*ref.aspect));
      if(canvas.width!==w||canvas.height!==ch){canvas.width=w;canvas.height=ch;}
      const x=canvas.getContext('2d');x.setTransform(1,0,0,1,0,0);x.globalCompositeOperation='source-over';x.fillStyle='#000';x.fillRect(0,0,w,ch);
      try{x.drawImage(ref.image,ref.sx,ref.sy,ref.sw,ref.sh,0,0,w,ch);}catch(e){}
      // Darken what the mask hides.
      const shade=document.createElement('canvas');shade.width=w;shade.height=ch;const sx=shade.getContext('2d');
      sx.fillStyle='#000';sx.fillRect(0,0,w,ch);
      J.applyMaskToCanvas(shade,{...mask,invert:!mask.invert,opacity:100},new DOMMatrix(),w,ch);
      if(mask.enabled){x.save();x.globalAlpha=.62*mask.opacity/100;x.drawImage(shade,0,0);x.restore();}
      mask.shapes.forEach((s,i)=>{
        x.lineWidth=i===maskSelected?2:1.2;x.strokeStyle=i===maskSelected?'#ffb000':'#4fe3ff';J.maskShapePath(x,[s],w,ch);x.stroke();

      });
      positionMaskHandles();
    }
    function positionMaskHandles(){
      const stage=section.querySelector('.cut-mask-stage'),overlay=section.querySelector('.cut-mask-handles'),rect=overlay.firstElementChild,s=mask.shapes[maskSelected];
      overlay.hidden=!s;if(!s)return;
      const box=canvas.getBoundingClientRect(),host=stage.getBoundingClientRect();
      Object.assign(overlay.style,{left:`${box.left-host.left}px`,top:`${box.top-host.top}px`,width:`${box.width}px`,height:`${box.height}px`});
      Object.assign(rect.style,{left:`${(s.cx-s.w/2)*100}%`,top:`${(s.cy-s.h/2)*100}%`,width:`${s.w*100}%`,height:`${s.h*100}%`,transform:`rotate(${s.angle}deg)`});
    }
    const local=(s,px,py,w,h)=>{const a=-s.angle*J.DEG,dx=px-s.cx*w,dy=py-s.cy*h;return [dx*Math.cos(a)-dy*Math.sin(a),dx*Math.sin(a)+dy*Math.cos(a)];};
    const inside=(s,px,py,w,h)=>{const p=new Path2D();J.maskShapePath(p,[s],w,h);return canvas.getContext('2d').isPointInPath(p,px,py);};
    // New shapes are square on screen (a circle stays round on a wide frame).
    const newShape=(type,size)=>{const aspect=canvas.width/Math.max(1,canvas.height);let w=size,h=size*aspect;if(h>.9){w*=.9/h;h=.9;}return {type,cx:.5,cy:.5,w,h,angle:0,lockAspect:true};};
    function fields(){
      shapeBox.replaceChildren();const aspectRow=section.querySelector('.cut-mask-aspect');aspectRow.replaceChildren();const s=mask.shapes[maskSelected];aspectRow.hidden=!s;tools.remove.disabled=!s;if(!s)return;
      const kind=document.createElement('label');kind.className='cut-detail-field';kind.innerHTML=`<span>${L('形','Shape')}</span><select data-mask-shape="type"></select>`;
      const kindSelect=kind.querySelector('select');for(const type of J.MASK_SHAPES)kindSelect.add(new Option(L(...shapeNames[type]),type));kindSelect.value=s.type;
      kindSelect.addEventListener('change',()=>{s.type=kindSelect.value;save();});shapeBox.append(kind);attachDetailRandom(kindSelect,'mask.shape.type');
      for(const [key,ja,en,min,max] of [['cx','中心 X','Center X',-1,2],['cy','中心 Y','Center Y',-1,2],['w','幅','Width',.01,4],['h','高さ','Height',.01,4],['angle','角度（度）','Angle (degrees)',-180,180]]){
        const factor=['w','h'].includes(key)?100:1;
        const row=document.createElement('label');row.className='cut-detail-field';row.innerHTML=`<span>${L(ja,en)}${factor===100?L('（％）',' (%)'):''}</span><input type="number" step="any" min="${min*factor}" max="${max*factor}" data-mask-shape="${key}">`;
        const input=row.querySelector('input');input.value=+(s[key]*factor).toFixed(4);
        input.addEventListener('change',()=>{
          const v=Number(input.value)/factor;if(!Number.isFinite(v))return;const next=J.clamp(v,min,max);
          // Locked aspect: width and height scale together.
          if(s.lockAspect&&(key==='w'||key==='h')&&s[key]>0){const other=key==='w'?'h':'w';s[other]=J.clamp(s[other]*next/s[key],.01,4);}
          s[key]=next;fields();save();
        });shapeBox.append(row);
      }
      const lock=document.createElement('label');lock.className='cut-detail-field';lock.innerHTML=`<span>${L('アスペクト比を固定','Lock aspect ratio')}</span><input type="checkbox" data-mask-shape="lockAspect">`;
      lock.querySelector('input').checked=s.lockAspect!==false;lock.querySelector('input').addEventListener('change',e=>{s.lockAspect=e.target.checked;save();});aspectRow.append(lock);
    }
    section.querySelector('[data-mask-field="enabled"]').addEventListener('change',e=>{
      mask.enabled=e.target.checked;
      if(mask.enabled&&!mask.shapes.length){mask.shapes.push(newShape('ellipse',.6));maskSelected=0;fields();}
      save();
    });
    target.addEventListener('change',()=>{mask.target=target.value;setHint();save();});
    section.querySelector('[data-mask-field="invert"]').addEventListener('change',e=>{mask.invert=e.target.checked;save();});
    tools.add.addEventListener('change',()=>{const type=tools.add.value;tools.add.value='';if(!type)return;mask.shapes.push(newShape(type,.4));maskSelected=mask.shapes.length-1;fields();save();});
    tools.remove.addEventListener('click',()=>{if(!mask.shapes[maskSelected])return;mask.shapes.splice(maskSelected,1);maskSelected=Math.max(0,maskSelected-1);fields();save();});
    // Use the same four corner and dedicated rotation handles as preview placement.
    const stage=section.querySelector('.cut-mask-stage');
    const point=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];};
    let drag=null;
    stage.addEventListener('pointerdown',e=>{
      const [px,py]=point(e),w=canvas.width,h=canvas.height,grip=e.target.closest('[data-mask-handle]');
      let found=grip?{mode:grip.dataset.maskHandle==='rotate'?'rotate':'size',index:maskSelected,corner:grip.dataset.maskHandle}:null;
      if(!found&&e.target.closest('.area-edit-rect'))found={mode:'move',index:maskSelected};
      if(!found)for(let i=mask.shapes.length-1;i>=0;i--)if(inside(mask.shapes[i],px,py,w,h)){found={mode:'move',index:i};break;}
      if(!found)return;
      e.preventDefault();maskSelected=found.index;const s=mask.shapes[found.index];
      drag={mode:found.mode,corner:found.corner,shape:s,px,py,cx:s.cx,cy:s.cy,w:s.w,h:s.h,angle:s.angle,start:Math.atan2(py-s.cy*h,px-s.cx*w)};
      stage.setPointerCapture(e.pointerId);fields();draw();
    });
    stage.addEventListener('pointermove',e=>{
      if(!drag)return;
      const [px,py]=point(e),w=canvas.width,h=canvas.height,s=drag.shape;
      if(drag.mode==='move'){s.cx=J.clamp(drag.cx+(px-drag.px)/w,-1,2);s.cy=J.clamp(drag.cy+(py-drag.py)/h,-1,2);}
      else if(drag.mode==='rotate'){
        let a=drag.angle+(Math.atan2(py-drag.cy*h,px-drag.cx*w)-drag.start)*180/Math.PI;
        if(e.shiftKey)a=Math.round(a/15)*15;
        s.angle=Math.round(((a+540)%360-180)*10)/10;
      }else{
        const sx=drag.corner.endsWith('e')?1:-1,sy=drag.corner.startsWith('s')?1:-1,a=drag.angle*J.DEG;
        const [lx,ly]=local({...drag,cx:drag.cx,cy:drag.cy},px,py,w,h);
        let nw=J.clamp((sx*lx+drag.w*w/2)/w,.01,4),nh=J.clamp((sy*ly+drag.h*h/2)/h,.01,4);
        if(s.lockAspect!==false){const k=Math.max(nw/drag.w,nh/drag.h);nw=J.clamp(drag.w*k,.01,4);nh=J.clamp(drag.h*k,.01,4);}
        const dx=sx*(nw-drag.w)*w/2,dy=sy*(nh-drag.h)*h/2;
        s.cx=J.clamp(drag.cx+(dx*Math.cos(a)-dy*Math.sin(a))/w,-1,2);s.cy=J.clamp(drag.cy+(dx*Math.sin(a)+dy*Math.cos(a))/h,-1,2);s.w=nw;s.h=nh;
      }
      draw();
    });
    const end=()=>{if(!drag)return;drag=null;fields();save();};
    stage.addEventListener('pointerup',end);
    stage.addEventListener('pointercancel',()=>{if(!drag)return;const s=drag.shape;for(const k of ['cx','cy','w','h','angle'])s[k]=drag[k];drag=null;fields();draw();});
    const maskResize=new ResizeObserver(positionMaskHandles);maskResize.observe(canvas);dialog.addEventListener('close',()=>maskResize.disconnect(),{once:true});
    // Motion: the moving / revealing media techniques, applied to the mask over this cut (all off by default).
    function motionFields(){
      const box=section.querySelector('.cut-mask-motion'),grid=box.querySelector('.cut-details-grid'),m=mask.motion;
      box.querySelector('h4').textContent=L('マスクのモーション','Mask motion');
      box.querySelector('.hint').textContent=L('マスクの図形に、前景・背景と同じ登場・退場・動きを付けます。','Moves the mask shapes with the same entrances, exits and motions as foreground / background.');
      grid.replaceChildren();
      const row=(label,control)=>{const r=document.createElement('label');r.className='cut-detail-field';const s=document.createElement('span');s.textContent=label;r.append(s,control);grid.append(r);return control;};
      const select=(key,groups)=>{const el=document.createElement('select');el.dataset.maskMotion=key;el.add(new Option(L('なし','None'),'none'));
        for(const [name,items] of groups){const g=document.createElement('optgroup');g.label=name;for(const [id,def] of items)g.append(new Option(def.name,id));el.append(g);}
        el.value=m[key];el.addEventListener('change',()=>{m[key]=el.value;save();});return el;};
      row(L('手法','Technique'),select('technique',J.MASK_MOTION_GROUPS.map(group=>[MEDIA_EFFECT_GROUPS[group],Object.entries(J.MEDIA_TECH).filter(([,d])=>!d.stage&&d.group===group)])));
      row(L('登場','Entrance'),select('entrance',[[MEDIA_EFFECT_GROUPS.enter,J.mediaPhaseOptions('enter')]]));
      row(L('退場','Exit'),select('departure',[[MEDIA_EFFECT_GROUPS.exit,J.mediaPhaseOptions('exit')]]));
      for(const [key,ja,en,min,max] of [['amount','動きの強さ','Motion intensity',0,2],['duration','登場・退場時間（秒）','Entrance / exit (s)',.05,1.5]]){
        const input=document.createElement('input');input.type='number';input.step='any';input.min=min;input.max=max;input.value=m[key];input.dataset.maskMotion=key;
        input.addEventListener('change',()=>{const v=Number(input.value);if(!Number.isFinite(v))return;m[key]=J.clamp(v,min,max);input.value=m[key];save();});row(L(ja,en),input);
      }
    }
    setHint();fields();motionFields();parent.append(section);draw();
  }
  function drawPreview(now){
    previewFrame=requestAnimationFrame(drawPreview);
    const plan=previewPlan,c=previewCut;if(!plan||!c)return;
    const w=Math.round(Math.min(plan.W,640)),h=Math.round(w*plan.H/plan.W);
    if(previewCanvas.width!==w||previewCanvas.height!==h){previewCanvas.width=w;previewCanvas.height=h;}
    const length=previewLength();
    if(previewPlaying)previewTime=(previewTime+Math.max(0,now-previewLast)/1000)%length;
    else previewTime=J.clamp(previewTime,0,length);
    previewLast=now;
    const elapsed=previewTime,t=Math.min(c.start+elapsed,c.start+length-1e-6);
    const shown=cutPreviewSolo?soloPlan(plan,c):plan;
    const view=cutPreviewFocus?focusWindow(focusOf(plan,c)):null,options={noHud:true,...(cutPreviewSolo?soloOptions:{})};
    try{
      J.syncMediaPreview(shown,t,previewPlaying);
      if(!view)previewRenderer.frame(previewCanvas.getContext('2d'),shown,t,{...options,scale:w/plan.W});
      else{
        // Render large enough that the window fills the preview sharply (at most full stage resolution).
        const zw=Math.round(Math.min(plan.W,w/view.size)),zh=Math.round(zw*plan.H/plan.W);
        if(zoomCanvas.width!==zw||zoomCanvas.height!==zh){zoomCanvas.width=zw;zoomCanvas.height=zh;}
        previewRenderer.frame(zoomCanvas.getContext('2d'),shown,t,{...options,scale:zw/plan.W});
        const pc=previewCanvas.getContext('2d');pc.setTransform(1,0,0,1,0,0);pc.globalAlpha=1;pc.globalCompositeOperation='copy';pc.imageSmoothingEnabled=true;
        pc.drawImage(zoomCanvas,view.x*zw,view.y*zh,view.size*zw,view.size*zh,0,0,w,h);pc.globalCompositeOperation='source-over';
      }
    }catch(e){}
    previewSeek.value=String(Math.round(elapsed/length*1000));
    const pct=Math.round(elapsed/length*1000)/10;pane.querySelector('.progress i').style.width=pct+'%';pane.querySelector('.progress').setAttribute('aria-valuenow',String(Math.round(pct)));
    pane.querySelector('.effect-preview-now').textContent=J.fmtTime(elapsed);pane.querySelector('.effect-preview-dur').textContent=J.fmtTime(length+1e-6);
  }
  const names = {
    text:['歌詞','Lyrics'],layout:['レイアウト','Layout'],enter:['登場','Entrance'],hold:['保持・モーション','Hold / motion'],exit:['退場','Exit'],
    inDur:['登場時間（秒）','Entrance duration (s)'],outDur:['退場時間（秒）','Exit duration (s)'],stagger:['文字の時間差（秒）','Character delay (s)'],
    effectEvents:['追加演出','Additional effects'],effectFx:['追加演出の設定','Additional effect settings'],offset:['開始からの時間（秒）','Time from cut start (s)'],amp:['強度','Strength'],dur:['時間（秒）','Duration (s)'],type:['演出','Effect'],
    decor:['装飾','Decoration'],scheme:['配色','Palette'],palette:['個別パレット','Custom palette'],params:['レイアウト詳細','Layout parameters'],treat:['加工','Treatment'],treatP:['加工の詳細','Treatment parameters'],
    bg:['背景演出','Background effect'],bgP:['背景演出の詳細','Background parameters'],cam:['カメラ','Camera'],camP:['カメラ詳細','Camera parameters'],
    trans:['カット間のつなぎ','Transition'],transP:['つなぎの詳細','Transition parameters'],transDur:['つなぎ時間（秒）','Transition duration (s)'],
    area:['表示範囲（画面比率）','Display area (stage ratios)'],placement:['配置・サイズ（画面比率）','Placement / size (stage ratios)'],
    motionScale:['動きの倍率','Motion scale'],contentScale:['文字サイズ倍率','Text scale'],effectSettings:['演出パラメータ','Effect parameters'],
    motion:['動きの強さ','Motion amount'],treatment:['加工の強さ','Treatment amount'],duration:['登場・退場時間（秒）','Entrance / exit duration (s)'],bpm:['BPM','BPM'],beatOffset:['拍の開始位置（秒）','Beat offset (s)'],x:['左位置','Left'],y:['上位置','Top'],cx:['中心 X','Center X'],cy:['中心 Y','Center Y'],w:['幅','Width'],h:['高さ','Height'],angle:['角度（度）','Angle (degrees)'],lockAspect:['縦横比を固定','Lock aspect ratio'],
    untilNext:['次カット再生まで','Until the next cut'],endTime:['終了位置（秒）','End position (s)'],technique:['手法','Technique'],entrance:['登場','Entrance'],departure:['退場','Exit'],itemId:['素材','Asset'],frontmost:['最前に表示','Frontmost'],blend:['合成方法','Blend mode'],opacity:['不透明度（％）','Opacity (%)'],videoLoop:['動画をループ再生','Loop video'],videoStart:['素材の再生開始位置（秒）','Source start time (s)'],videoDuration:['動画の長さ（秒）','Video duration (s)'],chromaKey:['クロマキー合成','Chroma key'],chromaColor:['クロマキー色','Key color'],
    animationLoop:['アニメーションの再生','Animation playback'],animationStart:['アニメーションの開始位置（秒）','Animation start time (s)'],
    font:['フォント','Font'],size:['サイズ','Size'],scale:['倍率','Scale'],rotation:['回転','Rotation'],color:['色','Color'],alpha:['不透明度','Opacity'],seed:['乱数シード','Random seed'],n:['個数','Count'],id:['種類','Type'],sx:['横方向倍率','Horizontal scale'],sy:['縦方向倍率','Vertical scale'],
  };
  const label = key => ({enterP:L('登場の詳細','Entrance parameters'),holdP:L('保持の詳細','Hold parameters'),exitP:L('退場の詳細','Exit parameters'),techniqueP:L('手法の詳細','Technique parameters'),entranceP:L('登場の詳細','Entrance parameters'),departureP:L('退場の詳細','Exit parameters')}[key]) || (names[key] ? L(...names[key]) : J.detailFieldLabel(key));
  function customParameterLabel(path,field){
    const [root,index]=path.split('.'),g={params:'layout',enterP:'enter',holdP:'hold',exitP:'exit',treatP:'treat',bgP:'bg',camP:'cam',transP:'trans',techniqueP:'technique',entranceP:'entrance',departureP:'departure'}[root];
    const def=root==='decor'?J.DECOR[current.decor?.[+index]?.id]:g?(lyric?J.registry(g)[current[g]]:J.MEDIA_TECH[current[g]]):null;
    const names=def?.customDefinition?.labels?.[field];return names?L(names.ja||field,names.en||names.ja||field):null;
  }
  const nativeKeys = lyric ? ['frontmost','blend','opacity'] : ['itemId','technique','entrance','departure','blend','opacity','placement','videoLoop','videoStart','videoDuration','animationLoop','animationStart','chromaKey','chromaColor'];
  function preview() {
    rememberDetail();
    clearTimeout(previewTimer);
    current=refreshPreview();
    render();
  }
  function write(field,value,native) {
    // Editing a locked media cut's technique / phases / asset is a direct operation: it stays locked
    // with the new choice.
    if (!lyric && native && draft.lock) {
      const lockedField={technique:'lockedTechnique',entrance:'lockedEntrance',departure:'lockedDeparture',itemId:'lockedItemId'}[field];
      if(lockedField)delete draft[lockedField];
    }
    if(native) {
      draft[field]=value;
      if(!lyric && ['entrance','departure'].includes(field)){const phase=field==='entrance'?'enter':'exit';if(draft.details)delete draft.details[phase];if(draft.lockedEffects)delete draft.lockedEffects[phase];}
    } else {
      draft.details ||= {}; draft.details[field]=value;
      if(lyric && field==='params')draft.details.fontParams=J.cutFontParams(value);
      if(lyric && field==='fonts'){
        // Explicit empty pointers also override a locked cut's captured fonts.
        draft.details.fontParams=[];
        draft.details.params ||= clone(current.params);
        const stripFonts=obj=>{if(!obj||typeof obj!=='object')return;for(const [key,v] of Object.entries(obj)){if(typeof v==='string'&&J.FONTS[v])delete obj[key];else stripFonts(v);}};
        stripFonts(draft.details.params);
      }
      if(lyric && field==='text' && draft.details.params)
        for(const key of ['chunks','msgs','units'])delete draft.details.params[key];
      // An explicit scheme choice also replaces any captured palette (favorites,
      // locks or manual colors) that would otherwise override its colors.
      if(lyric && field==='scheme'){
        const palette=(J.STYLES[S.project.style] || J.STYLES.noir).schemes[Number(value)];
        if(palette)draft.details.palette=clone(palette);
      }
    }
    schedulePreview();
  }
  function options(field) {
    if(field==='animationLoop') return [['auto',L('ファイルの設定通り','As specified by the file')],['once',L('1回再生','Play once')],['loop',L('繰り返し再生','Loop')]];
    if(field==='blend') return ['normal','multiply','screen','overlay'].map((v,i)=>[v,[L('通常','Normal'),L('乗算','Multiply'),L('スクリーン','Screen'),L('オーバーレイ','Overlay')][i]]);
    if(field==='itemId') return [['',L('画像無し','No image')],...J.mediaCopyItems(layer).map(a=>[a.id,a.name]),...S.project[layer].items.map(a=>[a.id,a.name])];
    if(field==='scheme') return S.plan.style.schemes.map((_,i)=>[String(i),String(i+1)]);
    if(field==='technique') return [['',L('自動','Auto')],['none',L('演出無し','No effects')],...Object.entries(J.MEDIA_TECH).filter(([id,d])=>!d.stage&&J.mediaTechAllowed(id,layer)).map(([id,d])=>[id,d.name])];
    if(field==='entrance'||field==='departure') return [['',L('自動','Auto')],['none',L('即時（なし）','Instant (none)')],...J.mediaPhaseOptions(field==='entrance'?'enter':'exit').map(([id,d])=>[id,d.name])];
    if(!lyric && ['layout','enter','exit','hold','treat'].includes(field)) {
      const registry=J['MEDIA_'+field.toUpperCase()] || {}, entries=Object.entries(registry).map(([id,d])=>[id,typeof d==='string'?d:d.name||id]);
      for(const def of Object.values(J.MEDIA_TECH)) if(def[field]&&!entries.some(([id])=>id===def[field])) entries.push([def[field],def.name+' / '+def[field]]);
      if(['enter','exit'].includes(field))for(const def of Object.values(J.MEDIA_TECH))if(def.stage===field&&def.motion&&!entries.some(([id])=>id===def.motion))entries.push([def.motion,def.name]);
      return entries;
    }
    const reg={layout:J.LAYOUTS,enter:J.ENTER,hold:J.HOLD,exit:J.EXIT,treat:J.TREAT,bg:J.BG,cam:J.CAMERA,trans:J.TRANS,font:J.FONTS,id:J.DECOR}[field];
    return reg ? [...(field==='trans'?[['none',L('なし','None')],...(!lyric?[['crossfade',L('クロスフェード','Crossfade')]]:[])]:[]),...Object.entries(reg).map(([id,d])=>[id,d.name||id])] : null;
  }
  function choicePool(path){
    if(/^decor\.\d+\.id$/.test(path))return {kind:lyric?'lyric':'decor',group:'decor'};
    if(lyric && ['layout','enter','hold','exit','treat','bg','cam','trans'].includes(path))return {kind:'lyric',group:path};
    if((!lyric && ['technique','entrance','departure'].includes(path)) || path.startsWith('mask.motion.'))return {kind:'media',group:layer==='lyrics'?'media':layer};
    return {kind:'local',group:layer+':'+path};
  }
  function applyDisabledChoices(project){
    for(const {pool,value} of disabledChoices){
      if(pool.kind==='lyric')((project.enabled ||= {})[pool.group] ||= {})[value]=false;
      else if(pool.kind==='media'||pool.kind==='decor'){
        const target=pool.kind==='decor'?layer:pool.group,settings=J.mediaEffectSettings(project,target);
        (settings[pool.kind==='decor'?'decorEnabled':'enabled'] ||= {})[value]=false;project[target].effects=settings;
      }else ((project.detailRandomExclusions ||= {})[pool.group] ||= {})[value]=true;
    }
  }
  let detailSearchPopup=null,detailFontPreviewMode='name';
  const detailFontName=key=>{
    const font=J.FONTS[key];if(!font)return key;
    return font.composite?font.label:(J.faceOf?.(key).label||font.label||key);
  };
  function closeDetailSearch(){detailSearchPopup?.remove();detailSearchPopup=null;}
  function attachDetailSearch(select){
    if(select.dataset.searchAttached)return;select.dataset.searchAttached='true';
    const open=(initial='')=>{
      if(select.disabled)return;
      closeDetailSearch();
      const popup=document.createElement('div');popup.className='detail-search-popup';popup.setAttribute('popover','auto');
      const fontMenu=select.dataset.detailFont==='true';
      const lyricText=fontMenu?String(refreshPreview().text??'').replace(/\s+/gu,' ').trim():'';
      const chars=Array.from(lyricText),lyricSample=chars.slice(0,120).join('')+(chars.length>120?'…':'')||L('（歌詞なし）','(No lyrics)');
      const search=document.createElement('input');search.type='search';search.placeholder=L('あいまい検索','Fuzzy search');search.setAttribute('aria-label',search.placeholder);search.autocomplete='off';search.value=initial;
      const list=document.createElement('div');list.className='detail-search-options';list.setAttribute('role','listbox');
      list.setAttribute('aria-label',select.closest('label')?.querySelector('span')?.textContent||search.placeholder);
      popup.append(search);
      const modes=[];
      if(fontMenu){
        const controls=document.createElement('div');controls.className='detail-font-preview-modes';controls.setAttribute('role','group');controls.setAttribute('aria-label',L('フォントの表示','Font preview'));
        for(const [mode,ja,en] of [['name','フォント名を表示','Show font names'],['lyrics','歌詞を表示','Show lyrics']]){
          const button=document.createElement('button');button.type='button';button.dataset.fontPreviewMode=mode;button.textContent=L(ja,en);
          button.addEventListener('click',()=>{detailFontPreviewMode=mode;filter();search.focus({preventScroll:true});});controls.append(button);modes.push(button);
        }
        popup.append(controls);
      }
      popup.append(list);dialog.append(popup);detailSearchPopup=popup;
      let items=[],active=-1;
      const fontRequests=new Set();
      const fontSample=(key,text,size)=>{
        const span=document.createElement('span');span.className='detail-font-sample';span.style.font=J.fontCSS(key,size);
        if(J.FONTS[key]?.composite){
          for(const char of text){const glyph=document.createElement('span');glyph.style.font=J.fontCSS(key,size,char);glyph.textContent=char;span.append(glyph);}
        }else span.textContent=text;
        return span;
      };
      const highlight=index=>{
        active=index;items.forEach((item,i)=>{item.classList.toggle('active',i===active);item.setAttribute('aria-selected',String(i===active));});
        if(items[active]){search.setAttribute('aria-activedescendant',items[active].id);items[active].scrollIntoView({block:'nearest'});}
        else search.removeAttribute('aria-activedescendant');
      };
      search.setAttribute('role','combobox');search.setAttribute('aria-expanded','true');search.setAttribute('aria-autocomplete','list');
      list.id='cutDetailSearchOptions';search.setAttribute('aria-controls',list.id);
      const choose=option=>{
        closeDetailSearch();select.focus();select.value=option.value;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      };
      const filter=()=>{
        list.replaceChildren();items=[];const matches=J.detailSearchQuery(search.value);let group=null;
        const fontKeys=new Set(),fontTexts=[];
        for(const button of modes)button.setAttribute('aria-pressed',String(button.dataset.fontPreviewMode===detailFontPreviewMode));
        for(const option of select.options){
          const parent=option.parentElement,groupName=parent.tagName==='OPTGROUP'?parent.label:'';
          if(option.disabled||parent.disabled||!matches(option.textContent+' '+option.value+' '+groupName))continue;
          if(groupName&&group!==groupName){const heading=document.createElement('div');heading.className='detail-search-group';heading.textContent=groupName;list.append(heading);}group=groupName;
          const item=document.createElement('div');item.setAttribute('role','option');item.id='cutDetailSearchOption'+items.length;item.textContent=option.textContent;
          if(fontMenu&&J.FONTS[option.value]){
            const key=option.value,name=option.textContent,sample=detailFontPreviewMode==='lyrics'?lyricSample:name;
            item.classList.add('detail-font-option');item.replaceChildren(fontSample(key,sample,16));item.setAttribute('aria-label',name);item.title=name+(detailFontPreviewMode==='lyrics'?'\n'+sample:'');
            if(detailFontPreviewMode==='lyrics'){const caption=fontSample(key,name,11);caption.classList.add('detail-font-name');item.append(caption);}
            fontKeys.add(key);fontTexts.push(sample,name);
            if(J.FONTS[key].composite)for(const char of sample+name)fontKeys.add(J.fontForChar(key,char));
          }
          item.classList.add('detail-search-option');item.dataset.value=option.value;item.onclick=()=>choose(option);list.append(item);items.push(item);
        }
        if(!items.length){const empty=document.createElement('div');empty.className='detail-search-empty';empty.textContent=L('該当する項目がありません','No matching options');empty.setAttribute('role','status');list.append(empty);}
        highlight(Math.max(0,items.findIndex(item=>item.dataset.value===select.value)));
        if(fontKeys.size){
          const keys=[...fontKeys],text=fontTexts.join(''),request=JSON.stringify([keys,text]);
          if(!fontRequests.has(request)){fontRequests.add(request);J.ensureFonts(text,keys).catch(()=>{});}
        }
      };
      search.addEventListener('input',filter);
      search.addEventListener('keydown',e=>{
        if(e.isComposing)return;
        if(e.key==='Tab'&&fontMenu)return;
        if(['ArrowDown','ArrowUp','Enter','Escape','Tab'].includes(e.key)){
          if(e.key!=='Tab')e.preventDefault();e.stopPropagation();
          if(e.key==='Escape'||e.key==='Tab'){closeDetailSearch();select.focus();}
          else if(e.key==='Enter')items[active]?.click();
          else if(items.length)highlight((active+(e.key==='ArrowDown'?1:-1)+items.length)%items.length);
        }
      });
      popup.addEventListener('click',e=>e.stopPropagation());
      if(fontMenu){
        popup.addEventListener('keydown',e=>{
          if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDetailSearch();select.focus();}
          else if(e.key==='Tab')setTimeout(()=>{if(popup.isConnected&&!popup.contains(document.activeElement))closeDetailSearch();},0);
        });
      }
      popup.addEventListener('toggle',e=>{if(e.newState==='closed'){popup.remove();if(detailSearchPopup===popup)detailSearchPopup=null;}});
      const rect=select.getBoundingClientRect(),width=Math.min(Math.max(rect.width,240),innerWidth-16);
      popup.style.width=width+'px';popup.style.left=Math.max(8,Math.min(rect.left,innerWidth-width-8))+'px';
      const below=innerHeight-rect.bottom-8,above=rect.top-8,down=below>=Math.min(280,above),room=Math.max(100,down?below:above);
      popup.style.maxHeight=Math.min(340,room)+'px';
      if(down)popup.style.top=rect.bottom+'px';else popup.style.bottom=(innerHeight-rect.top)+'px';
      popup.showPopover();filter();search.focus();
    };
    select.addEventListener('pointerdown',e=>{if(e.button===0)e.preventDefault();});
    select.addEventListener('click',e=>{e.preventDefault();open();});
    select.addEventListener('keydown',e=>{
      if(['Enter',' ','ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}
      else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();open(e.key);}
    });
  }
  function attachDetailRandom(select,path){
    if(path==='scheme')return;
    attachDetailSearch(select);
    if(select.dataset.randomAttached)return;select.dataset.randomAttached='true';
    const row=select.closest('label');if(!row)return;
    const title=row.querySelector('span');if(!title)return;
    const pool=choicePool(path),project=draftProject();
    const allowed=value=>{
      if(disabledChoices.some(entry=>entry.pool.kind===pool.kind&&entry.pool.group===pool.group&&entry.value===value))return false;
      if(pool.kind==='lyric')return project.enabled?.[pool.group]?.[value]!==false;
      if(pool.kind==='media')return J.mediaEffectSettings(project,pool.group).enabled?.[value]!==false;
      if(pool.kind==='decor')return J.mediaDecorOn(J.mediaEffectSettings(project,layer),value);
      return !project.detailRandomExclusions?.[pool.group]?.[value];
    };
    const candidates=()=>[...select.options].filter(option=>!option.disabled && option.value!==select.value && option.value!=='' && option.value!=='legacy' && allowed(option.value));
    const controls=document.createElement('span');controls.className='detail-random-actions';
    for(const off of pool.kind==='local'?[false]:[false,true]){
      const button=document.createElement('button');button.type='button';button.className='icon ghost';button.dataset.detailRandom=path;button.dataset.disableCurrent=String(off);
      button.title=off?L('この演出をOFFにして再抽選','Disable current effects and randomize'):L('この項目だけ再抽選','Randomize this setting only');button.setAttribute('aria-label',button.title);
      button.innerHTML=off?ICON.disableReroll:ICON.dice;
      button.disabled=select.disabled || !candidates().length;
      button.onclick=e=>{
        e.preventDefault();e.stopPropagation();const options=candidates();if(!options.length)return;
        // Preserve all other resolved effect values while changing this field.
        const snapshot=J.cutEffectsPayload(current,layer,previewPlan);
        draft.details={...snapshot.details,...draft.details};
        if(!lyric){for(const [key,value] of Object.entries(snapshot.native))if(!Object.hasOwn(draft,key))draft[key]=clone(value);if(!Object.hasOwn(draft,'placement'))draft.placement=clone(current.placement);}
        if(off)disabledChoices.push({pool,value:select.value});
        select.value=options[Math.floor(Math.random()*options.length)].value;
        select.dispatchEvent(new Event('change',{bubbles:true}));
        // Nested controls update values without rebuilding the generic form.
        if(select.isConnected)preview();
      };
      controls.append(button);
    }
    title.classList.add('detail-field-title');title.append(controls);
  }
  const eventName = event => J.FXE[event.type]?.name || event.type;
  function fieldEditor(parent,field,value,onChange,path=field) {
    if(value && typeof value==='object') {
      const section=document.createElement(path==='decor'?'section':'details'); section.dataset.detailSection=path;
      section.open=openDetails.get(path) ?? ['area','placement'].includes(field);
      const title=document.createElement('summary'); title.textContent=/^decor\.\d+$/.test(path) ? (J.DECOR[value.id]?.name || value.id) : /^effectEvents\.\d+$/.test(path) ? eventName(value) : /^\d+$/.test(field) ? L(`項目 ${Number(field)+1}`,`Item ${Number(field)+1}`) : label(field); if(path!=='decor')section.append(title);
      const grid=document.createElement('div'); grid.className='cut-details-grid';section.append(grid);parent.append(section);
      const decoration=/^decor\.\d+$/.test(path),allowed=decoration?new Set(['id',...J.decorDetailFields(value.id)]):null;
      const shown=decoration?{id:value.id,...J.decorDetailDefaults(cut.seed),...J.DECOR[value.id]?.customDefinition?.params,...value}:value;
      for(const [child,v] of Object.entries(shown)) {
        if(allowed && !allowed.has(child))continue;
        if(decoration && value.id==='counter' && shown.mode!=='count' && ['from','to'].includes(child))continue;
        // Random candidate pools belong to the layer; this editor changes the resolved cut.
        if(path==='effectSettings' && !['motion','treatment','duration'].includes(child)) continue;
        fieldEditor(grid,child,v,next=>{
          if (value.lockAspect && ['w','h'].includes(child) && value[child]>0) {
            const other=child==='w'?'h':'w'; value[other]*=next/value[child];
            const input=grid.querySelector(`[data-detail-field="${path}.${other}"]`);if(input)input.value=+(value[other]*100).toFixed(6);
          }
          value[child]=next;
          if(decoration){const defaults=J.decorDetailDefaults(cut.seed);for(const key of J.decorDetailFields(value.id))if(value[key]===undefined&&defaults[key]!==undefined)value[key]=defaults[key];}
          onChange(clone(value));
        },`${path}.${child}`);
      }
      const actions=document.createElement('div');actions.className='cut-detail-array-actions';
      if(Array.isArray(value)){if(field==='decor')section.prepend(actions);else section.append(actions);}
      if(field==='decor') {
        const add=document.createElement('button');add.type='button';add.textContent=L('装飾を追加','Add decoration');
        add.onclick=()=>{value.push({id:Object.keys(J.DECOR)[0],seed:cut.seed,n:1});onChange(clone(value));preview();};actions.append(add);
      }
      if(Array.isArray(value)) value.forEach((_,i)=>{
        const del=document.createElement('button');del.type='button';
        del.textContent=field==='decor'?L('削除','Delete'):field==='effectEvents'?L(`${eventName(value[i])} を削除`,`Remove ${eventName(value[i])}`):L(`${i+1} を削除`,`Remove ${i+1}`);
        del.onclick=e=>{e.preventDefault();e.stopPropagation();removedDetail={path,index:i};value.splice(i,1);onChange(clone(value));preview();};
        if(field==='decor'){
          del.className='cut-decoration-delete';
          grid.querySelector(`[data-detail-section="${path}.${i}"] > summary`).append(del);
        }else actions.append(del);
      });
      return;
    }
    const percent=typeof value==='number' && (field==='contentScale'||/^(area|placement)\.(w|h)$/.test(path)), factor=percent?100:1;
    const row=document.createElement('label');row.className='cut-detail-field';const text=document.createElement('span');text.textContent=(customParameterLabel(path,field)||(/^fonts\.[^.]+\.\d+$/.test(path)?L(`フォント ${Number(field)+1}`,`Font ${Number(field)+1}`):/^\d+$/.test(field)?L(`項目 ${Number(field)+1}`,`Item ${Number(field)+1}`):label(field)))+(percent?L('（％）',' (%)'):'');row.append(text);
    if(path.startsWith('palette.')){
      const colorNames={bg:['背景色','Background color'],fg:['文字色','Text color'],sub:['補助文字色','Secondary text color'],accent:['アクセント色','Accent color'],accent2:['アクセント色2','Accent color 2'],ink:['装飾色','Decoration color'],dim:['背景文字色','Background text color'],ghostA:['色ずれA','Chromatic color A'],ghostB:['色ずれB','Chromatic color B']};
      if(colorNames[field])text.textContent=L(...colorNames[field]);
    }
    const decorationId=/^decor\.\d+\.mode$/.test(path)?current.decor?.[Number(path.split('.')[1])]?.id:null;
    const decorId=J.DECOR[decorationId]?.customDefinition?.base||decorationId;
    const decorMode=['counter','indexNum'].includes(decorId);
    if(decorMode)value=value==='count'?'count':'index';
    const modeChoices=decorMode?(decorId==='indexNum'?[["index",L('少なく回転','Fewer digit rolls')],["count",L('多く回転','More digit rolls')]]:[["index",L('カットの通し番号','Cut number')],["count",L('開始値から終了値へ変化','Animate from start to end')]]):null;
    const choices=modeChoices || (/^fonts\.[^.]+\.\d+$/.test(path)||(path.startsWith('params.')&&typeof value==='string'&&J.FONTS[value])?Object.entries(J.FONTS).map(([id,d])=>[id,d.name||id]):/^effectEvents\.\d+\.type$/.test(path)?Object.entries(J.FXE).map(([id,d])=>[id,d.name||id]):field==='id'&&!path.startsWith('decor.')?null:options(field)); const input=document.createElement(choices?'select':field==='text'?'textarea':'input');input.dataset.detailField=path;
    const fontChoice=choices&&(field==='font'||/^fonts\.[^.]+\.\d+$/.test(path)||(path.startsWith('params.')&&typeof value==='string'&&J.FONTS[value]));
    if(fontChoice)input.dataset.detailFont='true';
    if(choices) { for(const [v,n] of choices) input.add(new Option(n,v));if(value!=null&&!choices.some(([v])=>String(v)===String(value))) input.add(new Option(String(value),String(value)));input.value=value??''; }
    else if(typeof value==='boolean'){input.type='checkbox';input.checked=value;}
    else if(typeof value==='number'){input.type='number';input.step='any';input.value=+(value*factor).toFixed(6); if(['w','h','n','inDur','outDur','transDur','duration','stagger','motionScale','contentScale','videoStart','videoDuration','opacity'].includes(field)) input.min=field==='videoDuration'?.04:0; if(field==='opacity')input.max=100;}
    else {if(field!=='text')input.type=/^#[0-9a-f]{6}$/i.test(value||'')?'color':'text';input.value=value??'';}
    if(fontChoice){for(const option of input.options)if(J.FONTS[option.value])option.textContent=detailFontName(option.value);}
    if(lyric && field==='frontmost' && cut.emphasis){input.disabled=true;input.title=emphasisFrontmostHint();}
    if(typeof value==='number' && ['inDur','outDur','transDur'].includes(path))input.max=Math.max(0,current.end-current.start)*.45;
    input.addEventListener('change',()=>{
      const v=typeof value==='boolean'?input.checked:typeof value==='number'?Number(input.value)/factor:input.value;
      if(typeof v==='number'&&!Number.isFinite(v))return;
      onChange(v);
      if(/^decor\.\d+\.(id|mode)$/.test(path)||/^effectEvents\.\d+\.type$/.test(path))preview();
      if(choices && !path.includes('.')) {
        const param={enter:'enterP',hold:'holdP',exit:'exitP',technique:'techniqueP',entrance:'entranceP',departure:'departureP',layout:'params',treat:'treatP',bg:'bgP',cam:'camP',trans:'transP'}[field];
        if(param&&draft.details)delete draft.details[param];
        if(field==='technique'&&draft.details)for(const key of ['hold','treat','trans','transP'])delete draft.details[key];
        if(field==='itemId' && draft.personCutout?.sourceId!==input.value){delete draft.personCutout;personStatus=null;}
        preview();
      }
    });
    if(!lyric && ['enter','exit'].includes(path))text.textContent=path==='enter'?L('登場モーション（詳細）','Entrance motion (advanced)'):L('退場モーション（詳細）','Exit motion (advanced)');
    if(lyric && current.lyricSize!=null && /^area\.(w|h)$/.test(path)){input.disabled=true;const hint=document.createElement('small');hint.className='muted';hint.textContent=L(`歌詞のサイズ記法 ${current.lyricSize}: が優先されます。歌詞入力で変更してください。`,`The lyric size directive ${current.lyricSize}: takes priority. Change it in the lyrics input.`);row.append(hint);}
    row.append(input);parent.append(row);
    if(decorMode){
      const hint=document.createElement('small');hint.className='muted';
      hint.textContent=decorId==='indexNum'?L('表示される番号は同じです。登場時に数字が回転する回数を選びます。','The displayed number stays the same. Choose how many times the digits roll on entrance.'):L('「カットの通し番号」はカットの番号を表示します。「開始値から終了値へ変化」は指定した開始値から終了値まで数字を変化させます。','Cut number displays the cut index. Animate from start to end changes the number between the specified starting and ending values.');row.append(hint);
    }
    if(field==='scheme'){
      const hint=document.createElement('small');hint.className='muted';hint.textContent=L('選択すると、このカットだけスタイル本来の配色を適用します。','Selecting a scheme applies the original style colors to this cut only.');row.append(hint);
    }
    if(choices)attachDetailRandom(input,path);
  }
  function render() {
    closeDetailSearch();
    openDetails.clear();
    for(const section of dialog.querySelectorAll('details[data-detail-section]')){
      let path=section.dataset.detailSection;
      if(removedDetail && path.startsWith(removedDetail.path+'.')){
        const tail=path.slice(removedDetail.path.length+1).split('.'),i=Number(tail[0]);
        if(i===removedDetail.index)continue;
        if(i>removedDetail.index){tail[0]=String(i-1);path=removedDetail.path+'.'+tail.join('.');}
      }
      openDetails.set(path,section.open);
    }
    removedDetail=null;
    const scrollTop=formHost.scrollTop;
    formHost.replaceChildren();const form=document.createElement('form');formHost.append(form);
    const grid=document.createElement('div');grid.className='cut-details-grid';form.append(grid);
    const group=boundaryGroupLimits(boundaryRef(layer,cut));
    fieldEditor(grid,'start',start,v=>{start=v;rememberDetail();personStatus=null;personSync?.();});
    const time=grid.querySelector('input');time.previousSibling.textContent=L('開始位置（秒・リンク先も移動）','Start (s; linked cuts move together)');time.min=group?.min??0;time.max=group?.max??S.plan.duration;time.disabled=!group;
    // カット終了時間: editable only with 「次カット再生まで」 off (then it may pass the next cut's start).
    if(!lyric || Number.isInteger(cut.part)) {
      const auto=draft.untilNext!==false;let endInput=null;
      fieldEditor(grid,'untilNext',auto,v=>{
        if(v){delete draft.untilNext;delete draft.endTime;} else {draft.untilNext=false;if(!Number.isFinite(+draft.endTime))draft.endTime=+current.end.toFixed(3);}
        endInput.disabled=v;endInput.value=String(v?+current.end.toFixed(3):draft.endTime);schedulePreview();
      });
      fieldEditor(grid,'endTime',+(auto||!Number.isFinite(+draft.endTime)?current.end:+draft.endTime).toFixed(3),v=>{draft.endTime=+Math.max(start+.04,v).toFixed(3);schedulePreview();});
      endInput=grid.lastChild.querySelector('input');endInput.disabled=auto;endInput.min=String(+(start+.04).toFixed(3));endInput.max=String(+S.plan.duration.toFixed(3));
    }
    {
      fieldEditor(grid,'lock',locked,v=>{locked=v;rememberDetail();});
      grid.lastChild.querySelector('span').textContent=lyric?L('行の構成をロック','Lock line composition'):L('カットをロック','Lock cut');
    }
    for(const field of nativeKeys) {
      if(['videoLoop','videoStart','videoDuration','chromaKey','chromaColor'].includes(field)&&current.type!=='video')continue;
      if(['animationLoop','animationStart'].includes(field)&&!current.animation)continue;
      let value=draft[field]??current[field];
      if(['technique','entrance','departure'].includes(field)&&Object.hasOwn(draft,field))value=draft[field]??'';
      if(field==='placement')value ||= {cx:.5,cy:.5,w:1,h:1,angle:0,lockAspect:true};
      if(field==='videoDuration')value=Number(value)||current.end-current.start;
      fieldEditor(grid,field,clone(value??(field==='opacity'?100:'')),v=>write(field,['itemId','technique','entrance','departure'].includes(field)&&v===''?null:v,true));
    }
    maskEditor(grid);
    personEditor(grid);
    for(const field of J.cutDetailKeys[lyric?'lyrics':'media']) {
      if(field==='mask'||field==='fontParams') continue;// masks have their own editor; font paths follow layout font controls
      const parameterSlot={enterP:'enter',holdP:'hold',exitP:'exit',techniqueP:'technique',entranceP:'entrance',departureP:'departure'}[field];
      if(parameterSlot&&!(lyric?J.registry(parameterSlot)[current[parameterSlot]]:J.MEDIA_TECH[current[parameterSlot]])?.custom)continue;
      let value=current[field];
      // Generated post effects live in plan.events until explicitly edited.
      // Read them without freezing random choices just by opening this dialog.
      if(lyric && field==='effectEvents' && value===undefined)
        value=previewPlan.events.filter(e=>e.cutOwner===`${current.line}:${current.part}`)
          .map(({t,cutOwner,...event})=>({...event,offset:t-current.start}));
      if(lyric && field==='fonts')value ||= current.effectStyle?.fonts || previewPlan.style.fonts;
      if(lyric && field==='palette'){const schemes=(current.effectStyle || previewPlan.style).schemes;value ||= schemes[current.scheme % schemes.length];}
      if(lyric && field==='effectStyle'){const style=current.effectStyle || previewPlan.style;value={texture:clone(style.texture),ghost:style.ghost??1,glow:style.glow??.6,useGrad:style.useGrad??false};}
      if(lyric && field==='effectFx'){const fx=current.effectFx || previewPlan.fx;value=Object.fromEntries(['motion','glitch','chroma','texture'].map(k=>[k,fx[k]??0]));value.koma=J.komaOf(fx);}
      if(field==='area')value ||= {x:0,y:0,w:1,h:1,angle:0,lockAspect:true};
      if(field==='trans')value ||= 'none';
      if(value===undefined)continue;
      if(['enterP','holdP','exitP','techniqueP','entranceP','departureP','treatP','bgP','camP','transP'].includes(field) && value && !Object.keys(value).length)continue;
      fieldEditor(grid,field,clone(value),v=>write(field,field==='scheme'?+v:v,false));
    }
    const categories=[
      ['basic',L('基本','Basic'),['start','untilNext','endTime','lock','text','note','itemId','frontmost','blend','opacity','videoLoop','videoStart','videoDuration','animationLoop','animationStart','chromaKey','chromaColor']],
      ['style',L('スタイル','Style'),['layout','params','scheme','fonts','palette','fontParams','effectStyle']],
      ['motion',L('モーション','Motion'),['techniqueP','entranceP','departureP','enterP','holdP','exitP','technique','entrance','departure','enter','hold','exit','inDur','outDur','stagger','motionScale','cam','camP','independentPhases']],
      ['effects',L('加工・演出','Effects'),['treat','treatP','bg','bgP','trans','transP','transDur','effectSettings','effectFx','effectEvents']],
      ['decor',L('装飾','Decorations'),['decor']],
      ['mask',L('マスク','Mask'),['mask']],
      ['personCutout',L('人物切り抜き','Person cutout'),['personCutout']],
      ['placement',L('配置・サイズ','Position / size'),['area','placement','contentScale']],
      ['other',L('その他','Other'),[]],
    ];
    const tabs=document.createElement('div');tabs.className='cut-details-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',L('編集項目','Edit categories'));
    const panels=new Map(),tabButtons=new Map();
    for(const node of [...grid.children]){
      const field=(node.dataset.detailSection || node.querySelector('[data-detail-field]')?.dataset.detailField || '').split('.')[0];
      const category=categories.find(([, ,fields])=>fields.includes(field)) || categories.at(-1);
      if(!panels.has(category[0])){
        const panel=document.createElement('div');panel.className='cut-details-grid cut-details-tab-panel';panel.dataset.detailTabPanel=category[0];
        panel.id=`cut-detail-panel-${category[0]}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`cut-detail-tab-${category[0]}`);panels.set(category[0],panel);
      }
      panels.get(category[0]).append(node);
    }
    const historyRow=document.createElement('div');historyRow.className='cut-details-history';
    const undo=document.createElement('button');undo.type='button';undo.dataset.detailUndo='';undo.textContent=L('元に戻す','Undo');undo.onclick=()=>moveDetailHistory(-1);
    const redo=document.createElement('button');redo.type='button';redo.dataset.detailRedo='';redo.textContent=L('やり直す','Redo');redo.onclick=()=>moveDetailHistory(1);
    const reset=document.createElement('button');reset.type='button';reset.textContent=L('リセット','Reset');reset.onclick=()=>{delete draft.details;preview();};
    historyRow.append(undo,redo,reset);grid.replaceWith(historyRow,tabs);syncDetailHistory();
    const selectTab=(id,focus=false)=>{
      activeDetailTab=id;
      for(const [key,panel] of panels){panel.hidden=key!==id;const button=tabButtons.get(key);button.setAttribute('aria-selected',String(key===id));button.tabIndex=key===id?0:-1;}
      if(focus)tabButtons.get(id).focus();
    };
    for(const [id,title] of categories){
      if(!panels.has(id))continue;
      const button=document.createElement('button');button.type='button';button.id=`cut-detail-tab-${id}`;button.dataset.detailTab=id;button.textContent=title;button.setAttribute('role','tab');button.setAttribute('aria-controls',panels.get(id).id);
      button.onclick=()=>selectTab(id);tabs.append(button);tabButtons.set(id,button);form.append(panels.get(id));
    }
    tabs.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();const keys=[...tabButtons.keys()],i=keys.indexOf(activeDetailTab);
      selectTab(keys[e.key==='Home'?0:e.key==='End'?keys.length-1:(i+(e.key==='ArrowRight'?1:-1)+keys.length)%keys.length],true);
    });
    selectTab(panels.has(activeDetailTab)?activeDetailTab:panels.keys().next().value);
    // Browser validation must reveal the relevant panel before focusing its input.
    form.addEventListener('invalid',e=>{
      const panel=e.target.closest('[data-detail-tab-panel]');if(panel)selectTab(panel.dataset.detailTabPanel);
      for(let node=e.target.parentElement;node&&node!==form;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
    },true);
    for(const select of form.querySelectorAll('select[data-mask-motion],select[data-mask-shape]')){
      const path=select.dataset.maskMotion?'mask.motion.'+select.dataset.maskMotion:select.dataset.maskShape?'mask.shape.'+select.dataset.maskShape:'mask.'+select.dataset.maskField;
      attachDetailRandom(select,path);
    }
    for(const select of form.querySelectorAll('select'))attachDetailSearch(select);
    const buttons=document.createElement('div');buttons.className='cut-details-actions';form.append(buttons);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent=L('キャンセル','Cancel');cancel.onclick=()=>{if(!personController)dialog.close();};
    const apply=document.createElement('button');apply.type='submit';apply.className='primary';apply.textContent=L('適用','Apply');buttons.append(apply,cancel);
    formHost.scrollTop=scrollTop;
    form.onsubmit=e=>{e.preventDefault();if(personController||!form.reportValidity())return;
      applyDisabledChoices(S.project);
      if(lyric) S.project.lyricCutOptions[key]=draft; else S.project[layer].cutOverrides[index]=draft;
      {
        // Locking here captures the edited result; an unchanged lock is re-captured with the edits.
        if(lyric){ if(!locked) { if(initialLock) setOv(index,LYRIC_UNLOCK); } else { if(!initialLock) setOv(index,{lock:true}); relock('lyrics',index); } }
        else if(!locked) mediaOv(index,MEDIA_UNLOCK,layer);
        else { mediaOv(index,{lock:true},layer); relock(layer,index); }
      }
      if(group&&start!==cut.start) for(const member of group.members)setTimelineBoundaryTime(member,J.clamp(start,group.min,group.max));
      replan();if(disabledChoices.length){renderTech();renderMediaEffects();}dialog.close();
    };
  }
  // Backdrop dismissal dispatches cancel too, sharing the Escape guard.
  dialog.addEventListener('cancel',e=>{if(personController)e.preventDefault();});
  dialog.addEventListener('close',()=>{
    document.removeEventListener('keydown',detailShortcut,true);
    personController?.abort();
    cancelAnimationFrame(previewFrame);clearTimeout(previewTimer);dialog.remove();
    // Hand shared video elements back to the editor's own time.
    J.syncMediaPreview(S.plan,S.t,false);S.need=true;
  });
  refreshPreview();render();dialog.showModal();previewLast=performance.now();previewFrame=requestAnimationFrame(drawPreview);
}
// Preview controls are DOM overlays, so they never enter exported frames.
let itemFrameSignature = '';
function drawItemFrames() {
  const overlay=$('itemFrames'), view=$('view').getBoundingClientRect(), host=$('viewport').getBoundingClientRect();
  overlay.hidden=!$('showItemFrames').checked || !!S.exporting;
  if(overlay.hidden) { itemFrameSignature=''; return; }
  Object.assign(overlay.style,{left:`${view.left-host.left}px`,top:`${view.top-host.top}px`,width:`${view.width}px`,height:`${view.height}px`});
  const items=[];
  for(const layer of ['media','lyrics','foreground']) {
    if(S.plan.layerVisibility?.[layer]===false)continue;
    if(layer==='lyrics') {
      for(const cut of J.lyricCutsAt(S.plan,S.t)) if(cut.line>=0) items.push({layer,cut,index:cut.line,area:cut.area||{x:0,y:0,w:1,h:1}});
    } else {
      const cut=J.mediaAt(S.plan,S.t,layer),dimensions=J.mediaSourceDimensions(S.plan,cut,S.t);
      if(!dimensions)continue;
      const sw=dimensions.width,sh=dimensions.height;
      let area=J.mediaPlacementRect(cut.placement,sw,sh,S.plan.W,S.plan.H);
      if(!area)continue;
      if(!cut.placement && cut.layout==='cover') {const scale=Math.max(S.plan.W/sw,S.plan.H/sh);area={x:(1-sw*scale/S.plan.W)/2,y:(1-sh*scale/S.plan.H)/2,w:sw*scale/S.plan.W,h:sh*scale/S.plan.H};}
      items.push({layer,cut,index:cut.index,area:{...area,angle:cut.placement?.angle||0}});
    }
  }
  const L=J.mediaLabel,labels={copy:L('演出をお気に入りに追加','Add effects to favorites'),paste:L('お気に入りから演出を適用','Apply favorite effects'),dice:L('再抽選','Randomize'),disableReroll:L('この演出をOFFにして再抽選','Disable current effects and randomize'),lock:L('ロック','Lock'),area:L('表示範囲','Display area'),details:L('詳細編集','Edit details'),remove:L('削除','Delete'),frontmost:L('最前に表示','Frontmost')};
  const layerNames={foreground:L('前景','Foreground'),lyrics:L('歌詞','Lyrics'),media:L('背景','Background')};
  overlay.classList.toggle('selecting',!!S.areaEdit);
  const occupied=[];
  const html=items.map(({layer,cut,index,area})=>{
    const selected=S.areaEdit && (S.areaEdit.kind==='lyric'?'lyrics':S.areaEdit.kind)===layer && S.areaEdit.index===index;
    if(S.areaEdit&&!selected)return '';
    if(selected)area={...S.areaEdit.draft,angle:S.areaEdit.angle};
    const locked=layer==='lyrics'?!!S.project.overrides[index]?.lock:!!mediaCutOptions(layer,index)?.lock;
    const cx=(area.x+area.w/2)*view.width,cy=(area.y+area.h/2)*view.height,a=(area.angle||0)*Math.PI/180;
    const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{x*=area.w*view.width/2;y*=area.h*view.height/2;return [cx+x*Math.cos(a)-y*Math.sin(a),cy+x*Math.sin(a)+y*Math.cos(a)];});
    const actions=S.areaEdit&&!selected?[]:['lock','dice','disableReroll','copy','paste',...(layer==='lyrics'?['frontmost']:[]),'details'];
    const frameName=layer==='lyrics'?(String(cut.text||'').trim()||L('空の歌詞','Empty lyrics')):(cut.name||L('画像無し','No image'));
    const labelWidth=Math.min(160,Math.max(36,[...frameName].length*10+8));
    const width=Math.min(view.width,actions.length*25+labelWidth),x=J.clamp(points[0][0],0,Math.max(0,view.width-width));
    let y=J.clamp(points[0][1],0,Math.max(0,view.height-26));
    if(S.areaEdit){
      const preferred=Math.min(...points.map(p=>p[1]))-64;
      const handles=[...document.querySelectorAll('.area-edit-handle,.area-rotate-handle')].map(el=>el.getBoundingClientRect());
      const minY=Math.ceil(host.top-view.top+6);
      const candidates=Array.from({length:Math.ceil((view.height+30-minY)/26)},(_,i)=>minY+i*26).filter(v=>v+26<=view.height+30);
      const score=v=>{
        const corners=points.filter(([px,py])=>px>=x-8&&px<=x+width+8&&py>=v-8&&py<=v+34).length;
        const overlaps=occupied.filter(r=>x<r.x+r.w&&x+width>r.x&&v<r.y+26&&v+26>r.y).length;
        const grip=handles.filter(r=>view.left+x<r.right+5&&view.left+x+width>r.left-5&&view.top+v<r.bottom+5&&view.top+v+26>r.top-5).length;
        return grip*1000000000+corners*1000000+overlaps*10000+Math.abs(v-preferred);
      };
      y=candidates.reduce((best,v)=>score(v)<score(best)?v:best,candidates[0]);
    }else while(occupied.some(r=>x<r.x+r.w && x+width>r.x && y<r.y+26 && y+26>r.y) && y+52<=view.height)y+=26;
    occupied.push({x,y,w:width});
    const controls=actions.map(action=>{
      const active=action==='lock'?locked:action==='frontmost'?!!cut.frontmost:false;
      return `<button type="button" class="item-frame-action ${active?'active':''}" data-action="${action}" data-layer="${layer}" data-index="${index}" data-part="${cut.part??0}" title="${labels[action]}" aria-label="${layerNames[layer]} ${labels[action]}" ${['lock','frontmost'].includes(action)?`aria-pressed="${active}"`:''} ${S.playing?'disabled':''}>${ICON[action]}</button>`;
    }).join('');
    return `<svg class="item-frame-outline ${layer} ${selected?'selected':''}" data-select-layer="${layer}" data-select-index="${index}" width="100%" height="100%" aria-hidden="true"><polygon points="${points.map(p=>p.join(',')).join(' ')}"/></svg><div class="item-frame-tools ${layer}" style="left:${x}px;top:${y}px;width:${width}px;max-width:${view.width}px" data-layer="${layer}"><button type="button" class="item-frame-name" data-select-layer="${layer}" data-select-index="${index}" title="${escapeHtml(frameName)}" ${S.playing?'disabled':''}>${escapeHtml(frameName)}</button>${controls}</div>`;
  }).join('');
  if(itemFrameSignature!==html){overlay.innerHTML=html;itemFrameSignature=html;}
}
function removeLyricCut(line,part) {
  remember();
  const key=`${line}:${part}`;
  S.project.lyricCutOptions[key]={...S.project.lyricCutOptions[key],removed:true};
  replan();
}
function setMediaCutAsset(layer,index,itemId) {
  if(S.exporting || S.tap)return;
  const m=S.project[layer];
  if(m.cutOverrides[index]?.personCutout?.sourceId!==itemId && m.cutOverrides[index])delete m.cutOverrides[index].personCutout;
  // Freeze the displayed order before switching from shuffled to manual selection.
  if(m.randomOrder){
    for(const cut of S.plan[layer].cuts)mediaOv(cut.index,{itemId:cut.itemId || null},layer);
    m.randomOrder=false;
  }
  const ov=mediaCutOptions(layer,index);
  mediaOv(index,{itemId,...(ov?.lock?{lockedItemId:itemId}:{})},layer);
  replan();
}
function drawTimelineAssetSelects() {
  const stack=$('timelineStack');
  let overlay=$('timelineAssets');
  if(!overlay){overlay=document.createElement('div');overlay.id='timelineAssets';stack.append(overlay);}
  const retained=new Set();
  for(const layer of ['foreground','media']){
    const m=S.project[layer],canvas=$(layer==='foreground'?'foregroundTimeline':'mediaTimeline'),lanes=timelineLanes(layer);
    const options=`<option value="">${J.mediaLabel('画像無し','No image')}</option>${[...J.mediaCopyItems(layer),...m.items].map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`;
    for(const cut of S.plan[layer].cuts){
      const key=`${layer}-${cut.index}`,duration=Math.max(.001,S.plan.duration);
      const width=(cut.end-cut.start)/duration*canvas.clientWidth-38;
      if(width<=0)continue;
      retained.add(key);
      let select=overlay.querySelector(`[data-key="${key}"]`);
      if(!select){
        select=document.createElement('select');select.className='timeline-asset-select';select.dataset.key=key;
        select.dataset.layer=layer;select.dataset.index=cut.index;
        select.addEventListener('pointerdown',e=>{e.stopPropagation();pause();});
        select.addEventListener('keydown',e=>e.stopPropagation());
        select.addEventListener('change',()=>{
          setMediaCutAsset(layer,+select.dataset.index,select.value || null);
        });
        overlay.append(select);
      }
      // Preserve native dropdown state and focus across timeline redraws.
      if(select._options!==options){select.innerHTML=options;select._options=options;}
      if(select.value!==(cut.itemId || ''))select.value=cut.itemId || '';
      select.disabled=!!(S.exporting || S.tap);
      select.title=m.randomOrder?J.mediaLabel('素材を変更すると現在の並びでランダム順をオフにします','Changing the asset turns off random order and keeps the current order'):cut.name;
      select.setAttribute('aria-label',`${J.mediaLabel(layer==='foreground'?'前景':'背景',layer==='foreground'?'Foreground':'Background')} ${cut.index+1}: ${J.mediaLabel('素材を変更','Change asset')}`);
      select.style.left=`${canvas.offsetLeft+cut.start/duration*canvas.clientWidth+33}px`;
      // Each select sits on its cut's lane.
      const lane=laneBox(layer,lanes.lanes.get(cut),lanes.count,canvas);
      select.style.top=`${canvas.offsetTop+(lanes.count>1?lane.top+Math.max(0,(lane.height-20)/2):22)}px`;select.style.width=`${width}px`;
    }
  }
  for(const select of Array.from(overlay.children))if(!retained.has(select.dataset.key))select.remove();
}
let timelineCutMenu = null;
function closeTimelineCutMenu(restoreFocus=false) {
  if(!timelineCutMenu)return;
  const {menu,controller,trigger}=timelineCutMenu;
  timelineCutMenu=null;controller.abort();menu.remove();trigger.setAttribute('aria-expanded','false');
  if(restoreFocus && trigger.isConnected)trigger.focus();
}
function openTimelineCutMenu(trigger) {
  if(S.exporting || S.tap)return;
  if(timelineCutMenu?.trigger===trigger){closeTimelineCutMenu(true);return;}
  closeTimelineCutMenu();S.playheadMenu=null;syncPlayheadMenu();pause();
  const layer=trigger.dataset.layer,index=+trigger.dataset.index,part=+trigger.dataset.part||0;
  const cut=layer==='lyrics'?S.plan.cuts.find(c=>c.line===index&&c.part===part):S.plan[layer].cuts[index];
  if(!cut)return;
  const L=J.mediaLabel,locked=layer==='lyrics'?!!S.project.overrides[index]?.lock:!!mediaCutOptions(layer,index)?.lock;
  const labels={dice:L('再抽選','Randomize'),disableReroll:L('この演出をOFFにして再抽選','Disable current effects and randomize'),lock:L(locked?'ロック解除':'ロック',locked?'Unlock':'Lock'),area:L('表示範囲','Display area'),details:L('詳細編集','Edit details'),copy:L('演出をお気に入りに追加','Add effects to favorites'),paste:L('お気に入りから演出を適用','Apply favorite effects'),remove:L('削除','Delete'),frontmost:L('最前に表示','Frontmost')};
  const actions=['dice','disableReroll','lock',...(layer==='lyrics'||J.mediaSourceAvailable(cut)?['area']:[]),'details','copy','paste',...(layer==='lyrics'?['frontmost']:[]),'remove'];
  const menu=document.createElement('div'),controller=new AbortController(),signal=controller.signal;
  menu.id='timelineCutMenu';menu.className='timeline-cut-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',L('カットの操作','Cut actions'));
  menu.innerHTML=actions.map(action=>{
    const toggle=['lock','frontmost'].includes(action),active=action==='lock'?locked:action==='frontmost'?!!cut.frontmost:false;
    return `<button type="button" role="${toggle?'menuitemcheckbox':'menuitem'}" ${toggle?`aria-checked="${active}"`:''} data-action="${action}" data-layer="${layer}" data-index="${index}" data-part="${part}">${ICON[action]}<span>${labels[action]}</span>${active?'<span class="menu-check" aria-hidden="true">✓</span>':''}</button>`;
  }).join('');
  document.body.append(menu);timelineCutMenu={menu,controller,trigger};trigger.setAttribute('aria-expanded','true');
  const r=trigger.getBoundingClientRect(),box=menu.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(r.left,innerWidth-box.width-8))+'px';
  menu.style.top=Math.max(8,Math.min(r.bottom+4,innerHeight-box.height-8))+'px';
  menu.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;e.stopPropagation();closeTimelineCutMenu();if(!S.exporting&&!S.tap)performTimelineAction(button);},{signal});
  menu.addEventListener('keydown',e=>{
    e.stopPropagation();
    const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();closeTimelineCutMenu(true);}
    else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
    else if(e.key==='Tab')closeTimelineCutMenu();
  },{signal});
  document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!trigger.contains(e.target))closeTimelineCutMenu();},{capture:true,signal});
  window.addEventListener('resize',()=>closeTimelineCutMenu(),{signal});
  document.addEventListener('scroll',e=>{if(!menu.contains(e.target))closeTimelineCutMenu();},{capture:true,signal});
  menu.querySelector('button').focus();
}
function performTimelineAction(control) {
  if(control.dataset.action==='menu'){openTimelineCutMenu(control);return;}
  if (control.classList.contains('item-frame-action') && S.playing) return;
  const layer = control.dataset.layer, index = +control.dataset.index;
  if (!Number.isInteger(index) || index < 0) return;
  if(control.dataset.action==='disableReroll'){disableAndReroll(layer,index,control.dataset.part==null?null:+control.dataset.part);return;}
  if (['copy','paste'].includes(control.dataset.action)) { effectFavoriteAction(control.dataset.action,layer,index,+control.dataset.part||0); return; }
  if (control.dataset.action === 'details') { openCutDetails(layer,index,+control.dataset.part || 0); return; }
  if (control.dataset.action === 'area') {
    if (layer === 'lyrics') openAreaEditor(index);
    else if (layer === 'foreground' || layer === 'media') openMediaEditor(index, layer);
    return;
  }
  if (control.dataset.action === 'frontmost' && layer === 'lyrics') {
    toggleLyricCutFrontmost(index, +control.dataset.part);
    return;
  }
  if (layer === 'lyrics') {
    if (control.dataset.action === 'remove') removeLyricCut(index,+control.dataset.part||0);
    else if (control.dataset.action === 'dice') rerollLyricLine(index);
    else toggleLyricLineLock(index);
  } else if (layer === 'foreground' || layer === 'media') {
    if (control.dataset.action === 'dice') rerollMediaCut(layer, index);
    else if (control.dataset.action === 'remove') removeMediaCut(index, layer);
    else toggleMediaCutLock(layer, index);
  }
}
function drawTimelineLinks() {
  const svg = $('timelineLinks'), stack = $('timelineStack');
  if (!svg || !S.plan) return;
  for(const [layer,id] of [['foreground','foregroundTimeline'],['lyrics','timeline'],['media','mediaTimeline']]){
    const canvas=$(id),button=$('layerVisibilityControls').querySelector(`[data-layer="${layer}"]`);
    if(!button)continue;
    const visible=S.project.layerVisibility?.[layer]!==false;
    button.style.top=(canvas.offsetTop+(canvas.clientHeight-30)/2)+'px';
    button.setAttribute('aria-pressed',String(visible));
    button.querySelector('.eye-slash').style.display=visible?'none':'';
    button.title=J.mediaLabel({foreground:'前景',lyrics:'歌詞',media:'背景'}[layer],{foreground:'Foreground',lyrics:'Lyrics',media:'Background'}[layer])+': '+J.mediaLabel(visible?'非表示にする':'表示する',visible?'Hide':'Show');
    button.setAttribute('aria-label',button.title);
  }
  const width = stack.clientWidth, height = stack.clientHeight;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const markers = timelineMarkers();
  if (S.timelineDrag && S.timelineDrag.moved) {
    const moving = new Set(linkedRefs(S.timelineDrag.ref));
    for (const marker of markers) if (moving.has(marker.ref)) {
      const canvas = $(marker.layer === 'lyrics' ? 'timeline' : marker.layer === 'media' ? 'mediaTimeline' : 'foregroundTimeline');
      marker.x = canvas.offsetLeft + S.timelineDrag.preview / Math.max(0.001, S.plan.duration) * canvas.clientWidth;
    }
  }
  const byRef = new Map(markers.map(m => [m.ref, m]));
  const links = S.project.timelineLinks.map((link, index) => {
    const a = byRef.get(link.a), b = byRef.get(link.b);
    if (!a || !b) return '';
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    return `<line class="link-wire" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><g class="link-remove" data-edge="${index}" role="button" aria-label="リンクを解除"><circle cx="${mx}" cy="${my}" r="9"/><text x="${mx}" y="${my + 0.5}">×</text></g>`;
  }).join('');
  const preview = S.linkDrag ? `<line class="link-preview" x1="${S.linkDrag.sourceX}" y1="${S.linkDrag.sourceY}" x2="${S.linkDrag.x}" y2="${S.linkDrag.y}"/>` : '';
  const handles = markers.map(m => `<g class="link-handle ${linkedRefs(m.ref).length > 1 ? 'linked' : ''}" data-ref="${escapeHtml(m.ref)}" role="button" aria-label="境界をリンク"><circle cx="${m.x}" cy="${m.y}" r="9"/><text x="${m.x}" y="${m.y + 0.5}">🔗</text></g>`).join('');
  const menus = ['foreground','lyrics','media'].map(layer => {
    const canvas=timelineCanvas(layer), lanes=timelineLanes(layer);
    const list=layer==='lyrics'?S.plan.cuts.filter(c=>c.line>=0&&Number.isInteger(c.part)):S.plan[layer].cuts;
    return list.map(cut=>{
      const index=layer==='lyrics'?cut.line:cut.index, lane=laneBox(layer,lanes.lanes.get(cut),lanes.count,canvas);
      const x=J.clamp(canvas.offsetLeft+cut.start/Math.max(.001,S.plan.duration)*canvas.clientWidth+16,canvas.offsetLeft+12,canvas.offsetLeft+canvas.clientWidth-12);
      const y=canvas.offsetTop+lane.top+lane.height/2;
      const label=J.mediaLabel('カットのメニュー','Cut menu');
      return `<g class="timeline-action" data-action="menu" data-layer="${layer}" data-index="${index}" data-part="${cut.part??0}" role="button" tabindex="0" aria-label="${label}" aria-haspopup="menu" aria-expanded="false" transform="translate(${x} ${y})"><title>${label}</title><rect x="-12" y="-12" width="24" height="24" rx="4"/><path d="M-6 -4h12M-6 0h12M-6 4h12" fill="none" stroke="currentColor" stroke-width="1.5" pointer-events="none"/></g>`;
    }).join('');
  }).join('');
  drawTimelineAssetSelects();
  svg.innerHTML = links + preview + handles + menus;
}
function markerNear(clientX, clientY, sourceLayer) {
  const rect = $('timelineStack').getBoundingClientRect(), x = clientX - rect.left, y = clientY - rect.top;
  let best = null, distance = 18;
  for (const marker of timelineMarkers()) {
    if (marker.layer === sourceLayer) continue;
    const d = Math.hypot(marker.x - x, marker.y - y);
    if (d < distance) { best = marker; distance = d; }
  }
  return best;
}
// The start boundary or end handle under the pointer; with stacked lanes the pointer's lane wins.
function timelineBoundaryAt(ev, layer) {
  const canvas = ev.currentTarget, rect = canvas.getBoundingClientRect(), duration = S.plan.duration;
  const info = timelineLanes(layer), band = timelineBand(layer, canvas), y = ev.clientY - rect.top;
  const laneAt = info.count > 1 && y >= band.top && y <= band.bottom ? Math.min(info.count - 1, Math.floor((y - band.top) / ((band.bottom - band.top) / info.count))) : null;
  const cuts = layer === 'lyrics' ? S.plan.cuts.filter(c => c.line >= 0) : S.plan[layer].cuts;
  let best = null;
  for (const cut of cuts) {
    if (laneAt != null && info.lanes.get(cut) !== laneAt) continue;
    const start = Math.abs(ev.clientX - (rect.left + cut.start / duration * rect.width));
    if (start < 9 && (!best || start < best.distance) && timelineBoundaryForCut(cut, layer)) best = { cut, distance: start, end: false };
    if (!cut.manualEnd || layer === 'lyrics' && !Number.isInteger(cut.part)) continue;
    const end = Math.abs(ev.clientX - (rect.left + cut.end / duration * rect.width));
    if (end < 9 && (!best || end < best.distance)) best = { cut, distance: end, end: true };
  }
  if (!best) return null;
  return best.end ? { mode: 'end', layer, key: layer === 'lyrics' ? `${best.cut.line}:${best.cut.part}` : best.cut.index, start: best.cut.end, min: best.cut.start + 0.04, max: duration }
    : timelineBoundaryForCut(best.cut, layer);
}
// カットの終了時間 (turns 「次カット再生まで」 off); null restores it.
function setCutEnd(layer, key, time) {
  const patch = time == null ? { untilNext: undefined, endTime: undefined } : { untilNext: false, endTime: +time.toFixed(3) };
  if (layer === 'lyrics') {
    const options = S.project.lyricCutOptions, next = { ...options[key], ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    if (Object.keys(next).length) options[key] = next; else delete options[key];
  } else mediaOv(key, patch, layer);
}
function timelineBoundaryForCut(chosen, layer) {
  const duration = S.plan.duration;
  let min, max, target;
  if (layer !== 'lyrics') {
    const cutsForLayer = S.plan[layer].cuts, index = chosen.index;
    min = index ? cutsForLayer[index - 1].start + 0.04 : 0;
    max = index + 1 < cutsForLayer.length ? cutsForLayer[index + 1].start - 0.04 : duration - 0.04;
    target = { index };
  } else if (chosen.part === 'interlude') {
    const previous = S.plan.cuts.find(c => c.line === chosen.line && typeof c.part === 'number' && c.end === chosen.start);
    min = previous ? previous.start + 0.22 : S.plan.lines[chosen.line].start + 0.5;
    max = chosen.end - 1.31;
    target = { line: chosen.line, part: 'interlude' };
  } else if (chosen.part === 0) {
    const line = chosen.line, lines = S.plan.lines;
    // Saved/inserted lines can be out of source order. Use their actual timeline order.
    const before = lines.filter((l, i) => i !== line && l.start < chosen.start);
    const after = lines.filter((l, i) => i !== line && l.start > chosen.start);
    min = before.length ? Math.max(...before.map(l => l.start)) + 0.04 : 0;
    max = after.length ? Math.min(...after.map(l => l.start)) - 0.04 : duration - 0.04;
    const firstInner = S.project.timing.cutTimes && S.project.timing.cutTimes[`${line}:1`];
    if (firstInner != null && Number.isFinite(+firstInner)) max = Math.min(max, +firstInner - 0.22);
    target = { line, part: 0, nextLineStart: lines[line + 1] && lines[line + 1].start };
  } else {
    const previous = S.plan.cuts.find(c => c.line === chosen.line && c.part === chosen.part - 1);
    const following = S.plan.cuts.find(c => c.line === chosen.line && c.part === chosen.part + 1);
    min = previous ? previous.start + 0.22 : S.plan.lines[chosen.line].start + 0.22;
    max = (following ? following.start : S.plan.lines[chosen.line].visEnd ?? chosen.end) - 0.22;
    target = { line: chosen.line, part: chosen.part };
  }
  // A previously saved short cut must remain draggable away from a tight boundary.
  min = Math.min(min, chosen.start); max = Math.max(max, chosen.start);
  return max > min ? { layer, ref: boundaryRef(layer, chosen), start: chosen.start, min, max, ...target } : null;
}
function setTimelineBoundaryTime(drag, t) {
  if (drag.layer === 'lyrics') {
    const timing = S.project.timing;
    if (drag.part === 0) {
      timing.lineTimes[drag.line] = t;
      if (drag.nextLineStart != null && timing.lineTimes[drag.line + 1] == null) timing.lineTimes[drag.line + 1] = +drag.nextLineStart.toFixed(3);
    } else {
      if (!timing.cutTimes) timing.cutTimes = {};
      timing.cutTimes[`${drag.line}:${drag.part}`] = t;
    }
  } else S.project[drag.layer].timing.lineTimes[drag.index] = t;
}
function boundaryGroupLimits(ref) {
  const members = linkedRefs(ref).map(id => {
    const cut = boundaryCut(id);
    return cut && timelineBoundaryForCut(cut, boundaryLayer(id));
  });
  if (members.some(x => !x)) return null;
  return { members, min: Math.max(...members.map(x => x.min)), max: Math.min(...members.map(x => x.max)) };
}
function commitTimelineBoundary(drag) {
  const t = +drag.preview.toFixed(3);
  const group = boundaryGroupLimits(drag.ref);
  if (!group || group.max < group.min) return;
  for (const member of group.members) setTimelineBoundaryTime(member, t);
  replan();
}
function connectTimelineBoundaries(source, target) {
  const from = linkedRefs(source), to = linkedRefs(target);
  if (from.includes(target)) return;
  const layers = from.map(boundaryLayer);
  if (to.some(ref => layers.includes(boundaryLayer(ref)))) { toast('同じレイヤーの境界は同時にリンクできません'); return; }
  const limits = [source, target].map(boundaryGroupLimits);
  if (limits.some(x => !x)) return;
  const min = Math.max(...limits.map(x => x.min)), max = Math.min(...limits.map(x => x.max));
  const targetTime = boundaryCut(target).start;
  if (targetTime < min - 0.001 || targetTime > max + 0.001) { toast('この開始位置にはリンクできません'); return; }
  for (const ref of [...from, ...to]) setTimelineBoundaryTime(timelineBoundaryForCut(boundaryCut(ref), boundaryLayer(ref)), targetTime);
  S.project.timelineLinks.push({ a: source, b: target });
  replan();
}

/* ---------------- cut info ---------------- */
let lastCutIdx = -2;
function updateCutInfo() {
  const cut = J.cutAt(S.plan, S.t);
  const mc = J.mediaAt(S.plan, S.t);
  const fc = J.mediaAt(S.plan, S.t, 'foreground');
  const idx = `${cut ? cut.index : -1}/${mc ? mc.index : -1}/${fc ? fc.index : -1}`;
  const li = cut ? cut.line : -1;
  if (li !== S.curLine) { S.lineEls.forEach((el, i) => el.classList.toggle('cur', i === li)); S.curLine = li; }
  const active = S.sourceTab === 'foreground' ? fc : mc;
  S.mediaLineEls.forEach((el, i) => el.classList.toggle('cur', !!active && i === active.index));
  if (idx === lastCutIdx) return;
  lastCutIdx = idx;

}

/* ---------------- line list ---------------- */
// The inserted line becomes an ordinary line starting at the playhead: it runs until the next line
// (or empty cut) and the line playing before it ends there, re-fitting its words into the shorter span.
// At a line's own start it takes the first half of that line's slot, so no cut collapses to nothing.
function lyricInsertRange(start) {
  const at=S.plan.lines.find(line=>Math.abs(line.start-start)<.05);
  const lineEnd=line=>S.plan.lines.find(l=>l.index>line.index && l.start>line.start+1e-6)?.start ?? S.plan.duration;
  if(at)return {at,end:start+(lineEnd(at)-start)/2};
  return {at:null,end:S.plan.lines.find(line=>line.start>start+1e-6)?.start ?? S.plan.duration};
}
function insertLyricAtPlayhead(text) {
  if(S.exporting || S.tap || !S.plan || S.t>=S.plan.duration-.04)return;
  pause();
  const start=S.t,previous=S.project.lyrics,parsed=J.parseLyrics(previous),range=lyricInsertRange(start);
  const next=range.at || S.plan.lines.find(line=>line.start>=start-1e-6);
  const rows=previous.replace(/\r/g,'').split('\n');
  const sourceLine=next ? parsed.lines[next.index].sourceLine : rows.length;
  const allTimed=parsed.lines.length && parsed.lines.every(line=>line.lrc!=null);
  const timestamp=allTimed ? `[${Math.floor(start/60)}:${(start%60).toFixed(3)}]` : '';
  rows.splice(sourceLine,0,timestamp+text);
  const lyrics=rows.join('\n');
  // Keep existing line starts stable while adding a new line at the playhead.
  for(const line of S.plan.lines)S.project.timing.lineTimes[line.index]=line.start;
  reconcileLyricLines(previous,lyrics);
  const index=J.parseLyrics(lyrics).lines.findIndex(line=>line.sourceLine===sourceLine);
  S.project.timing.lineTimes[index]=start;
  delete S.project.overrides[index];
  if(range.at)S.project.timing.lineTimes[index+1]=+range.end.toFixed(3);
  S.project.durationOverride=S.plan.duration;
  S.project.lyrics=lyrics;$('lyrics').value=lyrics;
  replan();seek(start);
}
function openInsertAtPlayhead(layer) {
  if(S.exporting || S.tap || S.t>=S.plan.duration-.04)return;
  pause();
  const start=S.t,lyric=layer==='lyrics',cuts=lyric?S.plan.cuts:S.plan[layer].cuts;
  const end=lyric?lyricInsertRange(start).end:cuts.filter(c=>c.start>start+1e-6).reduce((end,c)=>Math.min(end,c.start),S.plan.duration);
  if(end-start<.04)return;
  const L=J.mediaLabel,dialog=document.createElement('dialog');dialog.className='insert-cut-dialog';dialog.id='insertCutDialog';
  const name=lyric?L('歌詞を挿入','Insert lyrics'):layer==='foreground'?L('前景を挿入','Insert foreground'):L('背景を挿入','Insert background');
  dialog.innerHTML=`<form><h2>${name}</h2><label>${lyric?L('歌詞','Lyrics'):L('素材','Asset')}${lyric?'<textarea rows="3" required></textarea>':`<select><option value="">${L('画像無し','No image')}</option>${[...J.mediaCopyItems(layer),...S.project[layer].items].map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select>`}</label><p class="hint">${J.fmtTime(start)} ～ ${J.fmtTime(end)}</p><div class="row"><button type="button" data-cancel>${L('キャンセル','Cancel')}</button><button type="submit">${L('挿入','Insert')}</button></div></form>`;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=e=>{
    e.preventDefault();const input=dialog.querySelector('textarea,select');
    if(lyric){
      const text=input.value.trim().replace(/\r/g,'').replace(/\n/g,'\\n');
      if(J.parseLyrics(text).lines.length!==1){input.setCustomValidity(L('歌詞を1行分入力してください','Enter one lyric line'));input.reportValidity();return;}
      S.t=start;insertLyricAtPlayhead(text);
    }else{
      const m=S.project[layer],index=cuts.filter(c=>c.start<start-1e-6).length,overrides={},times={};
      cuts.forEach((cut,i)=>{const n=i>=index?i+1:i;overrides[n]={...m.cutOverrides[i],itemId:cut.itemId};times[n]=cut.start;});
      // Replace a boundary at the exact playhead instead of making a zero-length cut.
      if(cuts[index] && Math.abs(cuts[index].start-start)<1e-6){delete overrides[index+1];delete times[index+1];for(let i=index+2;i<=cuts.length;i++){overrides[i-1]=overrides[i];times[i-1]=times[i];delete overrides[i];delete times[i];}}
      overrides[index]={itemId:input.value||null,technique:null};times[index]=start;
      const replacing=cuts[index] && Math.abs(cuts[index].start-start)<1e-6;
      m.manualCuts=true;m.cutCount=cuts.length+(replacing?0:1);m.cutOverrides=overrides;m.timing.lineTimes=times;m.randomOrder=false;
      if(!replacing){const prefix=layer==='foreground'?'f:':'m:';for(const link of S.project.timelineLinks)for(const side of ['a','b'])if(link[side].startsWith(prefix)&&+link[side].slice(2)>=index)link[side]=prefix+(+link[side].slice(2)+1);}
      S.project.durationOverride=S.plan.duration;replan();seek(start);
    }
    dialog.close();
  };
  dialog.querySelector('textarea')?.addEventListener('input',e=>e.target.setCustomValidity(''));
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();dialog.querySelector('textarea,select').focus();
}
function reconcileLyricLines(previous, next) {
  const oldLines = J.parseLyrics(previous).lines, newLines = J.parseLyrics(next).lines;
  if (oldLines.length === newLines.length) return false;
  const same = (a, b) => a.text === b.text && a.lrc === b.lrc;
  let prefix = 0, suffix = 0;
  while (prefix < Math.min(oldLines.length, newLines.length) && same(oldLines[prefix], newLines[prefix])) prefix++;
  while (suffix < Math.min(oldLines.length, newLines.length) - prefix && same(oldLines[oldLines.length - 1 - suffix], newLines[newLines.length - 1 - suffix])) suffix++;
  const oldMiddle = oldLines.length - prefix - suffix, newMiddle = newLines.length - prefix - suffix;
  const oldToNew = new Map();
  for (let i = 0; i < prefix; i++) oldToNew.set(i, i);
  for (let i = 0; i < suffix; i++) oldToNew.set(oldLines.length - suffix + i, newLines.length - suffix + i);
  if (oldMiddle * newMiddle <= 250000) {
    const dp = Array.from({ length: oldMiddle + 1 }, () => new Uint16Array(newMiddle + 1));
    for (let i = oldMiddle - 1; i >= 0; i--) for (let j = newMiddle - 1; j >= 0; j--) {
      dp[i][j] = same(oldLines[prefix + i], newLines[prefix + j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
    for (let i = 0, j = 0; i < oldMiddle && j < newMiddle;) {
      if (same(oldLines[prefix + i], newLines[prefix + j])) { oldToNew.set(prefix + i, prefix + j); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
  }
  const anchors = [[-1, -1], ...[...oldToNew].sort((a, b) => a[0] - b[0]), [oldLines.length, newLines.length]];
  // Shared characters at either end: typing before a line and pressing Enter splits "new + old" in two,
  // and the old line (with its time, lock and settings) belongs to the half that keeps its text.
  const overlap = (a, b) => {
    let p = 0, s = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return Math.max(p, s);
  };
  for (let a = 1; a < anchors.length; a++) {
    const [oldBefore, newBefore] = anchors[a - 1], [oldAfter, newAfter] = anchors[a];
    const oldGap = oldAfter - oldBefore - 1, newGap = newAfter - newBefore - 1;
    if (oldGap === 1 && newGap > 1) {
      const text = oldLines[oldBefore + 1].text;
      let best = 1;
      for (let k = 2; k <= newGap; k++) if (overlap(text, newLines[newBefore + k].text) > overlap(text, newLines[newBefore + best].text)) best = k;
      oldToNew.set(oldBefore + 1, newBefore + best);
      continue;
    }
    for (let k = 1; k <= Math.min(oldGap, newGap); k++) oldToNew.set(oldBefore + k, newBefore + k);
  }
  const oldStarts = J.computeTiming(S.project, { lines: oldLines }, audioLike()).starts;
  const oldTimes = S.project.timing.lineTimes || {};
  const newTimes = {};
  for (const [key, value] of Object.entries(oldTimes)) {
    const mapped = oldToNew.get(+key);
    if (mapped != null) newTimes[mapped] = value;
  }
  // Preserve following lines, and preserve every LRC time if a new plain line disables all-LRC timing.
  const preserveAll = oldLines.length > 0 && oldLines.every(line => line.lrc != null) && newLines.some(line => line.lrc == null);
  for (let i = preserveAll ? 0 : oldLines.length - suffix; i < oldLines.length; i++) {
    const mapped = oldToNew.get(i);
    if (mapped != null && newTimes[mapped] == null) newTimes[mapped] = +oldStarts[i].toFixed(3);
  }
  const newToOld = new Map([...oldToNew].map(([oldIndex, newIndex]) => [newIndex, oldIndex]));
  for (let i = 0; i < newLines.length;) {
    if (newToOld.has(i)) { i++; continue; }
    let end = i; while (end < newLines.length && !newToOld.has(end)) end++;
    if (end < newLines.length) {
      const before = newToOld.get(i - 1), after = newToOld.get(end);
      const left = before == null ? 0 : oldStarts[before], right = oldStarts[after];
      for (let j = i; j < end; j++) newTimes[j] = +(left + (right - left) * (j - i + 1) / (end - i + 1)).toFixed(3);
    }
    i = end;
  }
  S.project.timing.lineTimes = newTimes;
  const remap = source => {
    const result = {};
    for (const [key, value] of Object.entries(source || {})) {
      const mapped = oldToNew.get(+key);
      if (mapped != null) result[mapped] = value;
    }
    return result;
  };
  S.project.overrides = remap(S.project.overrides);
  const newCutTimes = {};
  for (const [key, value] of Object.entries(S.project.timing.cutTimes || {})) {
    const match = key.match(/^(\d+):(.*)$/), mapped = match && oldToNew.get(+match[1]);
    if (mapped != null) newCutTimes[`${mapped}:${match[2]}`] = value;
  }
  S.project.timing.cutTimes = newCutTimes;
  const newCutOptions = {};
  for (const [key, value] of Object.entries(S.project.lyricCutOptions || {})) {
    const match = key.match(/^(\d+):(.*)$/), mapped = match && oldToNew.get(+match[1]);
    if (mapped != null) newCutOptions[`${mapped}:${match[2]}`] = value;
  }
  S.project.lyricCutOptions = newCutOptions;
  const mapRef = ref => {
    const match = /^l:(\d+):(.*)$/.exec(ref);
    if (!match) return ref;
    const mapped = oldToNew.get(+match[1]);
    return mapped == null ? null : `l:${mapped}:${match[2]}`;
  };
  S.project.timelineLinks = S.project.timelineLinks.flatMap(link => {
    const a = mapRef(link.a), b = mapRef(link.b);
    return a && b ? [{ a, b }] : [];
  });
  return true;
}
function renderLines() {
  const ol = $('lineList'); ol.innerHTML = ''; S.lineEls = []; S.curLine = -2;
  const ov = S.project.overrides;
  const layoutOpts = '<option value="">自動</option>' + J.LAYOUT_ORDER.map(k => `<option value="${k}">${J.LAYOUTS[k].name}</option>`).join('');
  const rows = S.plan.lines.map(ln => ({ line: ln.index, start: ln.start }));
  rows.forEach(row => {
    const i = row.line, ln = S.plan.lines[i];
    const o = ov[i] || {};
    const li = document.createElement('li'); li.className = 'ln lyric-ln';
    const manual = S.project.timing.lineTimes && S.project.timing.lineTimes[i] != null;
    const area = J.lyricArea(o.area) || S.plan.cuts.find(c => c.line === i && c.part === 0)?.area || { x: 0, y: 0, w: 1, h: 1 };
    li.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span>
      <input class="time mono" type="number" step="0.01" min="0" value="${ln.start.toFixed(2)}" title="開始（秒）${manual ? '・手動' : '・自動'}" aria-label="${i + 1}行目の開始秒" style="${manual ? 'border-color:var(--cyan)' : ''}">
      <span class="txt" title="${escapeHtml(ln.text)}">${escapeHtml(ln.text)}</span>
      <button class="lyric-area-thumb" title="${i + 1}行目の歌詞表示エリアを編集" aria-label="${i + 1}行目の歌詞表示エリアを編集"><i style="left:${area.x * 100}%;top:${area.y * 100}%;width:${area.w * 100}%;height:${area.h * 100}%;transform:rotate(${area.angle || 0}deg)"></i></button>
      <div class="meta"><span class="cuts"></span>
      <span class="tools">
        <select aria-label="レイアウト指定">${layoutOpts}</select>
        <button class="icon ghost dice" title="この行を再抽選">${ICON.dice}</button>
        <button class="icon ghost lock" title="この行の構成をロック" aria-pressed="${o.lock ? 'true' : 'false'}">${ICON.lock}</button>
      </span></div>`;
    li.querySelector('select').value = o.layout || '';
    li.querySelector('.time').addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      if (!S.project.timing.lineTimes) S.project.timing.lineTimes = {};
      if (isFinite(v)) S.project.timing.lineTimes[i] = Math.max(0, v); else delete S.project.timing.lineTimes[i];
      replan();
    });
    li.querySelector('.txt').addEventListener('click', () => seek(ln.start + 0.001));
    li.querySelector('.lyric-area-thumb').addEventListener('click', () => openAreaEditor(i));
    li.querySelector('select').addEventListener('change', e => { setOv(i, { layout: e.target.value || undefined }); replan(); });
    li.querySelector('.dice').addEventListener('click', () => rerollLyricLine(i));
    li.querySelector('.dice').after(disableRerollButton('lyrics',i));
    li.querySelector('.lock').addEventListener('click', () => toggleLyricLineLock(i));
    const cutsEl = li.querySelector('.cuts');
    S.plan.cuts.filter(c => c.line === i && J.LAYOUTS[c.layout] && !J.LAYOUTS[c.layout].special).forEach(c => {
      const cutOption = document.createElement('span'); cutOption.className = 'lyric-cut-option';
      cutOption.dataset.line = i; cutOption.dataset.part = c.part;
      cutOption.style.borderColor = `hsla(${layoutHue(c.layout)},70%,58%,0.7)`;
      const name = document.createElement('button'); name.type = 'button'; name.className = 'lyric-cut-name';
      name.textContent = `${c.part + 1}: ${J.LAYOUTS[c.layout].name}`;
      name.title = `${c.text}｜${J.ENTER[c.enter].name} → ${J.EXIT[c.exit].name}`;
      name.addEventListener('click', () => seek(c.start + Math.min(c.dur * 0.5, c.inDur + 0.05)));
      const label = document.createElement('label'); label.className = 'lyric-frontmost';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!c.frontmost;
      input.disabled = !!c.emphasis;
      if (c.emphasis) label.title = emphasisFrontmostHint();
      input.setAttribute('aria-label', `${i + 1}行目${c.part + 1}カット目を最前に表示`);
      input.addEventListener('change', () => toggleLyricCutFrontmost(i, c.part));
      label.append(input, document.createTextNode('最前に表示'));
      const L = J.mediaLabel, settings = J.lyricEffectSettings(S.project);
      const options = S.project.lyricCutOptions[`${i}:${c.part}`] || {};
      const modes = { normal: L('通常', 'Normal'), multiply: L('乗算', 'Multiply'), screen: L('スクリーン', 'Screen'), overlay: L('オーバーレイ', 'Overlay') };
      const controls = document.createElement('div'); controls.className = 'lyric-cut-compositing';
      controls.innerHTML = `<label>${L('合成方法', 'Blend')}<select class="lyric-cut-blend" aria-label="${L('このカットの合成方法', 'This cut blend mode')}"><option value="">${L('自動', 'Auto')} (${modes[c.blend]})</option>${Object.entries(modes).map(([key, text]) => `<option value="${key}">${text}</option>`).join('')}</select></label><label>${L('不透明度（％）', 'Opacity (%)')}<input class="lyric-cut-opacity" type="number" min="0" max="100" step="1" aria-label="${L('このカットの不透明度（％）', 'This cut opacity (%)')}" value="${c.opacity}"></label><button type="button" class="ghost small lyric-composite-auto" title="${L('このカットの合成方法・不透明度を自動に戻す', 'Reset this cut blend and opacity to automatic')}">${L('自動に戻す', 'Reset to auto')}</button>`;
      const blend = controls.querySelector('select'), opacity = controls.querySelector('input'), reset = controls.querySelector('button');
      blend.value = options.blend || (settings.randomBlend ? '' : c.blend);
      opacity.title = settings.randomOpacity && options.opacity == null ? L('自動で選ばれた不透明度。入力すると手動指定になります。', 'Random opacity. Enter a value to set it manually.') : '';
      opacity.classList.toggle('automatic', settings.randomOpacity && options.opacity == null);
      reset.hidden = options.blend == null && options.opacity == null;
      blend.addEventListener('change', e => setLyricCutComposite(i, c.part, { blend: e.target.value || undefined }));
      opacity.addEventListener('change', e => setLyricCutComposite(i, c.part, { opacity: e.target.value === '' ? undefined : J.clamp(+e.target.value || 0, 0, 100) }));
      reset.addEventListener('click', () => setLyricCutComposite(i, c.part, { blend: undefined, opacity: undefined }));
      cutOption.append(name, detailButton(() => openCutDetails('lyrics',i,c.part)), ...effectFavoriteButtons('lyrics',i,c.part), label, controls); cutsEl.appendChild(cutOption);
    });
    ol.appendChild(li); S.lineEls.push(li);
  });
  $('linesInfo').textContent = `${S.plan.lines.length}行 / ${S.plan.cuts.length}カット`;
  syncSourceTab();
}
function beginAreaSelection() {
  const edit=S.areaEdit;if(!edit)return;
  edit.previousEditMode=$('showItemFrames').checked;$('showItemFrames').checked=true;
  $('viewport').classList.add('area-selection');sizeViewport();
  S.settingsOpen=false;S.sourceOpen=false;syncSettingsDrawer();syncSourceDrawer();
  edit.inertNodes=[];
  const allowed=[$('viewport'),$('areaEditControls')];
  const disable=node=>{
    if(allowed.includes(node))return;
    if(allowed.some(el=>node.contains(el))){for(const child of node.children)disable(child);}
    else if(!node.inert && !['SCRIPT','STYLE','DIALOG'].includes(node.tagName)){node.inert=true;edit.inertNodes.push(node);}
  };
  for(const child of document.body.children)disable(child);
  const shade=document.createElementNS('http://www.w3.org/2000/svg','svg');shade.id='areaSelectionShade';shade.classList.add('area-selection-shade');shade.setAttribute('aria-hidden','true');
  shade.innerHTML='<path fill-rule="evenodd"/>';document.body.append(shade);
  $('areaCancel').focus({preventScroll:true});
}
function endAreaSelection() {
  const edit=S.areaEdit;if(!edit)return;
  for(const node of edit.inertNodes||[])node.inert=false;
  $('areaSelectionShade')?.remove();$('showItemFrames').checked=edit.previousEditMode;
  $('viewport').classList.remove('area-selection');sizeViewport();
  itemFrameSignature='';S.need=true;
}
function positionAreaEditor() {
  if (!S.areaEdit) return;
  const view = $('view').getBoundingClientRect(), viewport = $('viewport').getBoundingClientRect(), overlay = $('areaEditOverlay');
  Object.assign(overlay.style, { left: `${view.left - viewport.left}px`, top: `${view.top - viewport.top}px`, width: `${view.width}px`, height: `${view.height}px` });
  const shade=$('areaSelectionShade');
  if(shade){
    shade.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
    const rect=r=>`M${r.left},${r.top}H${r.right}V${r.bottom}H${r.left}Z`;
    shade.querySelector('path').setAttribute('d',`M0,0H${innerWidth}V${innerHeight}H0Z`+rect(viewport)+rect($('areaEditControls').getBoundingClientRect()));
  }
}
function showAreaDraft() {
  const edit = S.areaEdit, area = edit && edit.draft, rect = $('areaEditRect'), media = !!edit && edit.kind !== 'lyric';
  rect.hidden = !area;
  if (area) Object.assign(rect.style, { left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%`, transform: `rotate(${edit.angle}deg)` });
  $('areaEditOverlay').classList.toggle('media-edit', !!edit);
  $('mediaAreaSizeControls').hidden = !edit;
  if (area) { $('mediaAreaAspectLock').checked = edit.lockAspect; $('mediaAreaWidth').value = String(Math.round(area.w * 1000) / 10); $('mediaAreaHeight').value = String(Math.round(area.h * 1000) / 10); }
  $('mediaAreaAngleField').hidden = !edit;
  if (edit) $('mediaAreaAngle').value = String(edit.angle);
  $('areaResetFull').hidden = !edit;
  $('areaResetAuto').hidden = !edit;
  $('areaResetAuto').disabled = !edit || edit.autoDraft===JSON.stringify(J.lyricArea({...area,angle:edit.angle,lockAspect:edit.lockAspect}));
  $('areaApplyOne').textContent = J.mediaLabel('配置決定','Set placement');
  $('areaApplyOne').disabled = !area;
  $('areaApplyFollowing').disabled = !area;
  positionAreaEditor();drawItemFrames();
  S.need = true;
}
function openAreaEditor(index,fromPreview=false) {
  if (S.exporting || S.tap) return;
  if (S.areaEdit) cancelAreaEditor();
  const line = S.plan.lines[index]; if (!line) return;
  pause();
  clearTimeout(warmTimer); ++warmJob;
  const saved = J.lyricArea((S.project.overrides[index] || {}).area) || S.plan.cuts.find(c => c.line === index && c.part === 0)?.area;
  S.areaEdit = { kind: 'lyric', index, oldTime: S.t, draft: saved || { x: 0, y: 0, w: 1, h: 1 }, ratio: saved ? saved.h / saved.w : 1, lockAspect: saved ? saved.lockAspect : true, angle: saved ? saved.angle : 0, drag: null };
  if(!J.lyricArea(S.project.overrides[index]?.area))S.areaEdit.autoDraft=JSON.stringify(J.lyricArea({...S.areaEdit.draft,angle:S.areaEdit.angle,lockAspect:S.areaEdit.lockAspect}));
  const cut = S.plan.cuts.find(c => c.line === index);
  if(!fromPreview)seek(cut ? cut.start + Math.min(cut.dur * 0.6, cut.inDur + 0.25) : line.start);
  $('areaEditOverlay').hidden = false; $('areaEditControls').hidden = false;
  beginAreaSelection();positionAreaEditor(); showAreaDraft();
}
function openMediaEditor(index, layer,fromPreview=false) {
  if (S.exporting || S.tap) return;
  if (S.areaEdit) cancelAreaEditor();
  const cut = S.plan[layer].cuts[index], dimensions = J.mediaSourceDimensions(S.plan,cut,S.t);
  if (!dimensions) return;
  const sw = dimensions.width, sh = dimensions.height;
  const draft = J.mediaPlacementRect(cut.placement, sw, sh, S.plan.W, S.plan.H);
  if (!draft) return;
  pause();
  clearTimeout(warmTimer); ++warmJob;
  S.areaEdit = { kind: layer, index, oldTime: S.t, draft, ratio: S.plan.W / S.plan.H * sh / sw, lockAspect: !cut.placement || cut.placement.lockAspect !== false, type: cut.type, angle: cut.placement && cut.placement.angle || 0, drag: null };
  if(cut.placementMode!=='manual')S.areaEdit.autoDraft=JSON.stringify(J.lyricArea({...draft,angle:S.areaEdit.angle,lockAspect:S.areaEdit.lockAspect}));
  if(!fromPreview)seek(cut.start + Math.min(0.5, Math.max(0.001, (cut.end - cut.start) / 2)));
  $('areaEditOverlay').hidden = false; $('areaEditControls').hidden = false;
  beginAreaSelection();positionAreaEditor(); showAreaDraft();
}
function cancelAreaEditor() {
  if (!S.areaEdit) return;
  const oldTime = S.areaEdit.oldTime;
  endAreaSelection();S.areaEdit = null; $('areaEditOverlay').hidden = true; $('areaEditControls').hidden = true;
  seek(oldTime);
}
function automaticMediaArea(layer,index) {
  const m=S.project[layer],ov=m.cutOverrides[index]||{};
  const project={...S.project,[layer]:{...m,cutOverrides:{...m.cutOverrides,[index]:{...ov,placement:null,lock:false,...autoWindowReset(layer,index)}}}};
  const plan=composePlan(project),resolved=plan[layer].cuts[index],dimensions=J.mediaSourceDimensions(plan,resolved,S.t);
  const area=dimensions&&J.mediaPlacementRect(resolved.placement,dimensions.width,dimensions.height,plan.W,plan.H);
  return {area,cut:resolved};
}
function applyAreaEditor(following) {
  if (!S.areaEdit || !S.areaEdit.draft) return;
  const { kind, index, draft } = S.areaEdit;
  remember();
  // 「以降にも適用」 leaves other locked cuts alone; the edited cut itself stays locked with its new place.
  if (kind !== 'lyric') {
    for (let i = index; i < (following ? S.plan[kind].cuts.length : index + 1); i++) {
      if (i !== index && S.project[kind].cutOverrides[i]?.lock) continue;
      const automatic=S.areaEdit.autoDraft===JSON.stringify(J.lyricArea({...draft,angle:S.areaEdit.angle,lockAspect:S.areaEdit.lockAspect}));
      if(automatic){
        const ov=mediaCutOptions(kind,i),resolved=automaticMediaArea(kind,i);
        mediaOv(i,{placement:null,...autoWindowReset(kind,i),...(ov?.lock?{lockedPlacement:resolved.cut.placement,lockedPlacementMode:resolved.cut.placementMode,lockedLayout:resolved.cut.bgLayout}: {})},kind);
        continue;
      }
      // The placement becomes manual; an automatic layout's window stays with it as the cut's own mask.
      const auto = S.plan[kind].cuts[i], windowSig = layoutWindowSig(kind, auto);
      const details = windowSig ? { ...(S.project[kind].cutOverrides[i]?.details || {}), mask: JSON.parse(JSON.stringify(auto.mask)) } : null;
      mediaOv(i, { placement: { cx: draft.x + draft.w / 2, cy: draft.y + draft.h / 2, w: draft.w, h: draft.h, lockAspect: S.areaEdit.lockAspect, angle: S.areaEdit.angle }, zoom: undefined, focus: undefined, ...(details ? { details, layoutMask: windowSig } : {}) }, kind);
    }
    relock(kind, index);
  } else {
    const area = J.lyricArea({ ...draft, angle: S.areaEdit.angle, lockAspect: S.areaEdit.lockAspect });
    const automatic = S.areaEdit.autoDraft === JSON.stringify(area);
    for (let i = index; i < (following ? S.plan.lines.length : index + 1); i++) {
      if (i !== index && S.project.overrides[i]?.lock) continue;
      setOv(i, { area: automatic ? undefined : area, lockedAreas: undefined });
    }
    relock('lyrics', index);
  }
  endAreaSelection();S.areaEdit = null; $('areaEditOverlay').hidden = true; $('areaEditControls').hidden = true;
  replan(); commit();
}
function areaPointer(ev) {
  const box = $('areaEditOverlay').getBoundingClientRect();
  return { x: J.clamp((ev.clientX - box.left) / box.width), y: J.clamp((ev.clientY - box.top) / box.height) };
}
function mediaPointer(ev) {
  const box = $('areaEditOverlay').getBoundingClientRect();
  return { x: (ev.clientX - box.left) / box.width, y: (ev.clientY - box.top) / box.height };
}
function mediaHit(ev) {
  const edit = S.areaEdit, area = edit.draft, box = $('areaEditOverlay').getBoundingClientRect();
  const cx = box.left + (area.x + area.w / 2) * box.width, cy = box.top + (area.y + area.h / 2) * box.height;
  const dx = ev.clientX - cx, dy = ev.clientY - cy, radians = edit.angle * Math.PI / 180;
  const x = Math.abs(dx * Math.cos(radians) + dy * Math.sin(radians));
  const y = Math.abs(-dx * Math.sin(radians) + dy * Math.cos(radians));
  const halfW = area.w * box.width / 2, halfH = area.h * box.height / 2;
  return x <= halfW && y <= halfH ? 'move' : null;
}
function mediaPointerAngle(ev, area) {
  const box = $('areaEditOverlay').getBoundingClientRect();
  const cx = box.left + (area.x + area.w / 2) * box.width, cy = box.top + (area.y + area.h / 2) * box.height;
  return Math.atan2(ev.clientY - cy, ev.clientX - cx);
}
function wrapMediaAngle(angle) { return ((angle + 180) % 360 + 360) % 360 - 180; }
function setMediaDraftSize(width, height) {
  const edit = S.areaEdit, draft = edit.draft, cx = draft.x + draft.w / 2, cy = draft.y + draft.h / 2;
  const min = edit.kind === 'lyric' ? 0.04 : 0.005, max = 4;
  let w = J.clamp(width, min, max), h = J.clamp(height, min, max);
  if (edit.lockAspect) { w = Math.min(w, max / edit.ratio); h = w * edit.ratio; }
  edit.draft = { x: (edit.kind === 'lyric' ? cx : J.clamp(cx, 0, 1)) - w / 2, y: (edit.kind === 'lyric' ? cy : J.clamp(cy, 0, 1)) - h / 2, w, h };
  showAreaDraft();
}
function moveMediaDraft(ev) {
  const edit = S.areaEdit, drag = edit.drag, point = mediaPointer(ev), dx = point.x - drag.start.x, dy = point.y - drag.start.y, a = drag.previous;
  const lyric = edit.kind === 'lyric', min = lyric ? 0.04 : 0.005, max = 4;
  if (drag.handle === 'rotate') {
    const difference = mediaPointerAngle(ev, a) - drag.pointerAngle;
    edit.angle = Math.round(wrapMediaAngle(drag.previousAngle + Math.atan2(Math.sin(difference), Math.cos(difference)) * 180 / Math.PI) * 10) / 10;
  } else if (drag.handle === 'move') {
    edit.draft = { x: (lyric ? a.x + dx : J.clamp(a.x + dx, -a.w / 2, 1 - a.w / 2)), y: (lyric ? a.y + dy : J.clamp(a.y + dy, -a.h / 2, 1 - a.h / 2)), w: a.w, h: a.h };
  } else {
    const east = drag.handle.includes('e'), south = drag.handle.includes('s');
    const radians = edit.angle * Math.PI / 180, box = $('areaEditOverlay').getBoundingClientRect();
    const localX = (dx * box.width * Math.cos(radians) + dy * box.height * Math.sin(radians)) / box.width;
    const localY = (-dx * box.width * Math.sin(radians) + dy * box.height * Math.cos(radians)) / box.height;
    const deltaX = localX * (east ? 1 : -1), deltaY = localY * (south ? 1 : -1);
    const w = edit.lockAspect ? J.clamp(a.w + (Math.abs(deltaX) > Math.abs(deltaY / edit.ratio) ? deltaX : deltaY / edit.ratio), min, Math.min(max, max / edit.ratio)) : J.clamp(a.w + deltaX, min, max);
    const h = edit.lockAspect ? w * edit.ratio : J.clamp(a.h + deltaY, min, max);
    const x = east ? a.x : a.x + a.w - w, y = south ? a.y : a.y + a.h - h;
    edit.draft = { x: (lyric ? x + w / 2 : J.clamp(x + w / 2, 0, 1)) - w / 2, y: (lyric ? y + h / 2 : J.clamp(y + h / 2, 0, 1)) - h / 2, w, h };
  }
  showAreaDraft();
}
function syncSourceTab() {
  const layer = activeMediaLayer(), media = !!layer, m = media && S.project[layer];
  $('sourceLyrics').setAttribute('aria-selected', String(!media)); $('sourceMedia').setAttribute('aria-selected', String(layer === 'media'));
  $('sourceForeground').setAttribute('aria-selected', String(layer === 'foreground'));
  $('lyricsPane').hidden = media; $('mediaPane').hidden = !media;
  $('lineList').hidden = media; $('mediaLineList').hidden = !media;
  $('cutsHeading').textContent = media ? J.mediaLabel('カット', 'Cuts') : J.mediaLabel('行とカット', 'Lines and cuts');
  $('mediaPaneTitle').textContent = layer === 'foreground' ? '前景' : '背景';
  $('linesInfo').textContent = media ? `${m.items.length}素材 / ${S.plan[layer].cuts.length}カット` : `${S.plan.lines.length}行 / ${S.plan.cuts.length}カット`;
  $('mediaRandom').disabled = !media || (m.items.length < 2 && !m.randomOrder);
  $('mediaRandom').title = media && m.items.length < 2 && !m.randomOrder ? J.mediaLabel('素材を2つ以上追加すると選択できます', 'Add at least two files to enable random order') : '';
  $('mediaLoop').disabled = !media || (m.items.length === 0 && S.plan[layer].cuts.length === 0);
  $('mediaGroupLyrics').checked = !media || m.groupLyricsAsOneCut !== false;
  $('audioTimingSection').hidden = media;
  const targets = mediaLyricTargets(layer);
  $('mediaLyricInsertMode').value = media && m.lyricInsertMode === 'cut' ? 'cut' : 'line';
  const sourceBox=$('backgroundInsertSources');sourceBox.hidden=layer!=='media';
  if(layer==='media'){
    const selected=m.insertSources || {files:true};
    sourceBox.querySelectorAll('label').forEach(label=>label.remove());
    for(const item of [{id:'files',name:J.mediaLabel('画像・動画','Images / videos')},...J.mediaCopyItems('media')]){
      const label=document.createElement('label');label.className='check';
      const input=document.createElement('input');input.type='checkbox';input.dataset.insertSource=item.id;input.checked=!!selected[item.id];
      input.addEventListener('change',()=>{m.insertSources={...selected,[item.id]:input.checked};replan();});
      label.append(input,document.createTextNode(item.name));sourceBox.append(label);
    }
  }
  $('btnMediaFromLyrics').disabled = !targets.length;
  $('btnTapMedia').disabled = !S.tap && (!media || !J.mediaInsertChoices(S.project,layer).length);
  $('mediaLyricInsertHint').textContent = !media || !J.mediaInsertChoices(S.project,layer).length
    ? J.mediaLabel('挿入する項目を選択してください。画像・動画の場合は素材を追加してください。', 'Select items to insert. Add assets to insert images or videos.')
    : !targets.length
      ? J.mediaLabel('対象となる歌詞の行・カットがありません。', 'There are no lyric lines or cuts to align to.')
      : '';
}
function activeMediaLayer() { return S.sourceTab === 'foreground' ? 'foreground' : S.sourceTab === 'media' ? 'media' : null; }
function mediaLyricTargets(layer) {
  const m = layer && S.project[layer];
  const choices=J.mediaInsertChoices(S.project,layer);
  if (!m || !choices.length) return [];
  // Cut mode includes every linkable lyric boundary, including interludes.
  let targets = S.plan.cuts.filter(cut => m.lyricInsertMode === 'cut' ? cut.line >= 0 : cut.line >= 0 && cut.part === 0);
  if (m.groupLyricsAsOneCut !== false) {
    const seen = new Set();
    targets = targets.filter(cut => {
      const group = cut.line >= 0 ? S.plan.lines[cut.line]?.group : null;
      if (group == null) return true;
      if (seen.has(group)) return false;
      seen.add(group); return true;
    });
  }
  return targets.slice(0, m.loop || choices.some(id=>id!=='files') ? 1000 : Math.min(1000, m.items.length));
}
function insertMediaFromLyrics() {
  const layer = activeMediaLayer();
  if (!layer || S.exporting || S.tap) return;
  pause(); cancelAreaEditor();
  clearTimeout(replanTimer); replan();
  const targets = mediaLyricTargets(layer), m = S.project[layer];
  if (!targets.length) return;
  const prefix = layer === 'foreground' ? 'f:' : 'm:';
  // Replace this layer's cuts and links as one undoable edit.
  m.manualCuts = true;
  m.cutCount = targets.length;
  m.cutOverrides = {};
  m.timing.lineTimes = {};
  S.project.timelineLinks = S.project.timelineLinks.filter(link => !link.a.startsWith(prefix) && !link.b.startsWith(prefix));
  const choices=J.mediaInsertChoices(S.project,layer);let fileIndex=0;
  targets.forEach((cut, index) => {
    const available=choices.filter(id=>id!=='files'||m.loop||fileIndex<m.items.length);
    const choice=available[Math.floor(Math.random()*available.length)];
    const itemId=choice==='files'?m.items[fileIndex++ % m.items.length].id:choice;
    m.cutOverrides[index] = { itemId, technique: null };
    m.timing.lineTimes[index] = cut.start;
    // Keep linked inner boundaries fixed when the line start is moved later.
    if (m.lyricInsertMode === 'cut' && cut.line >= 0 && cut.part !== 0) S.project.timing.cutTimes[`${cut.line}:${cut.part}`] = cut.start;
    S.project.timelineLinks.push({ a: prefix + index, b: boundaryRef('lyrics', cut) });
  });
  replan(); seek(targets[0].start);
  toast(J.mediaLabel(`${targets.length}カットを歌詞に合わせて挿入しました`, `Inserted ${targets.length} cuts aligned to lyrics`));
}
function mediaThumb(item, cls = '') {
  if (!item) return `<span class="missing media-ln-thumb" aria-hidden="true">—</span>`;
  if (J.isMediaCopy(item.id)) return `<span class="missing ${cls}" title="${escapeHtml(item.name)}" aria-label="${escapeHtml(item.name)}">↻</span>`;
  const asset = J.mediaAssets.get(item.id);
  if (!asset) return `<span class="missing">素材なし</span>`;
  return `<img class="${cls}" data-media-thumb="${escapeHtml(item.id)}" src="${escapeHtml(asset.poster || asset.url)}" alt="">`;
}
function renderMediaList() {
  const layer = activeMediaLayer() || 'media', m = S.project[layer];
  const box = $('mediaList'); box.innerHTML = '';
  m.items.forEach((item, i) => {
    const row = document.createElement('div'); row.className = 'media-item'; row.dataset.id = item.id;
    row.innerHTML = `${mediaThumb(item)}<span class="name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><button class="ghost small" aria-label="${escapeHtml(item.name)}を削除">×</button>`;
    const edges = document.createElement('fieldset'); edges.className = 'media-cropped-edges';
    edges.innerHTML = `<legend>${J.mediaLabel('見切れている辺（自動配置）','Cropped edges (auto placement)')}</legend>` + [['left','左','Left'],['right','右','Right'],['top','上','Top'],['bottom','下','Bottom']].map(([key,ja,en]) => `<label><input type="checkbox" data-cropped-edge="${key}" ${item.croppedEdges?.[key] ? 'checked' : ''}>${J.mediaLabel(ja,en)}</label>`).join('');
    edges.addEventListener('change', e => {
      const edge = e.target.dataset.croppedEdge; if (!edge) return;
      item.croppedEdges = { ...item.croppedEdges, [edge]: e.target.checked }; replan();
    });
    row.appendChild(edges);
    row.querySelector('button').addEventListener('click', () => {
      freezeMediaCuts(layer);
      m.items.splice(i, 1);
      for (const cut of S.plan[layer].cuts) if (cut.sourceItemId === item.id || m.cutOverrides[cut.index]?.lockedItemId === item.id) mediaOv(cut.index, { itemId: null, lockedItemId: undefined }, layer);
      delete m.overrides[item.id];
      // Keep the file until this session's undo history is no longer available.
      queueMediaDeletion(item.id);
      replan();
    });
    box.appendChild(row);
  });
  $('mediaRandom').checked = !!m.randomOrder;
  $('mediaLoop').checked = !!m.loop;
}
// A dynamic layout's window (mask) shown by a cut, or null when its mask is a hand-made one. When such a
// cut's placement is frozen (split, moved by hand, favorite pasted) the window is frozen with it as the cut's
// own mask, marked with layoutMask (its signature) so that going back to automatic takes it back as well.
function layoutWindowSig(layer, cut) {
  return layer === 'media' && cut?.bgLayout && cut.mask && JSON.stringify(cut.mask) === cut.bgLayout.sig ? cut.bgLayout.sig : null;
}
// The override patch that hands a frozen layout window back to automatic (a mask edited since stays).
function autoWindowReset(layer, index) {
  const o = S.project[layer]?.cutOverrides?.[index];
  if (!o?.layoutMask) return {};
  const details = { ...(o.details || {}) };
  if (JSON.stringify(details.mask) === o.layoutMask) delete details.mask;
  return { layoutMask: undefined, details: Object.keys(details).length ? details : undefined };
}
function mediaOv(index, patch, layer = activeMediaLayer() || 'media') {
  const m = S.project[layer];
  const o = Object.assign({}, m.cutOverrides[index] || {}, patch);
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k];
  if (Object.keys(o).length) m.cutOverrides[index] = o; else delete m.cutOverrides[index];
}
function freezeMediaCuts(layer) {
  const m = S.project[layer], cuts = S.plan[layer].cuts;
  cuts.forEach((cut, i) => { m.cutOverrides[i] = Object.assign({}, m.cutOverrides[i] || {}, { itemId: cut.sourceItemId }); });
  m.manualCuts = true;
  m.cutCount = cuts.length;
}
function mediaSplitTarget(layer) {
  if(!S.plan || S.exporting || S.tap || S.plan[layer].cuts.length>=1000)return null;
  const cut=J.mediaAt(S.plan,S.t,layer);
  return cut && S.t-cut.start>=0.04-1e-7 && cut.end-S.t>=0.04-1e-7 ? cut : null;
}
// 再配置: the unlocked lyric / foreground / background cuts at the playhead get automatic placement again,
// with a fresh placement seed (techniques and other settings keep theirs).
function relayoutTargets() {
  if (!S.plan) return [];
  const targets = [];
  for (const cut of J.lyricCutsAt(S.plan, S.t)) if (cut.line >= 0 && Number.isInteger(cut.part) && !S.project.overrides?.[cut.line]?.lock) targets.push({ layer: 'lyrics', cut });
  for (const layer of ['foreground', 'media']) {
    if (S.project.layerVisibility?.[layer] === false) continue;
    const cut = J.mediaAt(S.plan, S.t, layer);
    if (cut && cut.itemId && !mediaCutOptions(layer, cut.index).lock) targets.push({ layer, cut });
  }
  return targets;
}
// 「再生位置で編集」: the first row picks the action, the second row the layer. Buttons that cannot act at the
// playhead are greyed out, and an action whose layers all are is too.
const PLAYHEAD_LABELS = {
  insert: ['挿入', 'Insert'], split: ['分割', 'Split'], endHere: ['ここまで再生', 'Play until here'], untilNext: ['次カットまで再生', 'Play until the next cut'],
};
const LAYER_LABELS = { foreground: ['前景', 'Foreground'], lyrics: ['歌詞', 'Lyrics'], media: ['背景', 'Background'] };
const PLAYHEAD_TITLES = {
  insert: ['を再生位置に挿入', ': insert at the playhead'], split: ['を再生位置で分割', ': split at the playhead'],
  endHere: ['のカットを再生位置で終わらせる', ': end the cut at the playhead'], untilNext: ['のカットを次のカットの開始まで表示', ': show the cut until the next cut starts'],
};
function initPlayheadMenu() {
  const L = J.mediaLabel;
  const popup=document.querySelector('.playhead-secondary');
  popup.id='playheadPopup';popup.classList.add('timeline-cut-menu');popup.setAttribute('role','menu');
  document.body.append(popup);
  const close=()=>{S.playheadMenu=null;syncPlayheadMenu();};
  document.addEventListener('pointerdown',e=>{if(S.playheadMenu&&!popup.contains(e.target)&&!e.target.closest('[data-playhead-menu]'))close();},{capture:true});
  window.addEventListener('resize',close);
  document.addEventListener('scroll',e=>{if(S.playheadMenu&&!popup.contains(e.target))close();},{capture:true});
  popup.addEventListener('keydown',e=>{
    e.stopPropagation();const buttons=[...popup.querySelectorAll('button:not([hidden]):not(:disabled)')],index=buttons.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();const trigger=document.querySelector(`[data-playhead-menu="${S.playheadMenu}"]`);close();trigger?.focus({preventScroll:true});}
    else if(buttons.length&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus({preventScroll:true});}
    else if(e.key==='Tab')close();
  });
  for (const button of document.querySelectorAll('[data-playhead-menu]')) {
    button.textContent = L(...PLAYHEAD_LABELS[button.dataset.playheadMenu]);
    button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-controls','playheadPopup');
    button.addEventListener('click', () => { closeTimelineCutMenu();S.playheadMenu = S.playheadMenu === button.dataset.playheadMenu ? null : button.dataset.playheadMenu; syncPlayheadMenu();if(S.playheadMenu)popup.querySelector('button:not([hidden]):not(:disabled)')?.focus({preventScroll:true}); });
  }
  for (const button of document.querySelectorAll('[data-playhead-action]')) {
    const [layerJa, layerEn] = LAYER_LABELS[button.dataset.layer], [ja, en] = PLAYHEAD_TITLES[button.dataset.playheadAction];
    const y={foreground:2,lyrics:6,media:10}[button.dataset.layer];
    button.innerHTML=`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M2 3h12M2 8h12M2 13h12" opacity=".35"/><rect x="2" y="${y}" width="12" height="4" rx="1" fill="currentColor"/></svg><span>${L(layerJa, layerEn)}</span>`;button.setAttribute('role','menuitem'); button.title = L(layerJa + ja, layerEn + en); button.setAttribute('aria-label', button.title);
  }
  $('relayoutAtPlayhead').textContent = L('配置をシャッフル', 'Shuffle layout');
  $('relayoutAtPlayhead').title = L('再生位置のカットの配置を組み直す', 'Re-lay out the cuts at the playhead');
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.playheadMenu) { S.playheadMenu = null; syncPlayheadMenu(); } });
}
// The cut 「ここまで再生」 / 「次カットまで再生」 acts on: the latest-starting cut before the playhead
// (the one showing, or the last one to have ended); 次カットまで再生 only for a cut with its own end.
function playheadEndTarget(layer, manualOnly) {
  if (S.exporting || S.tap || !S.plan) return null;
  const cuts = (layer === 'lyrics' ? S.plan.cuts.filter(c => c.line >= 0 && Number.isInteger(c.part)) : S.plan[layer].cuts)
    .filter(c => c.start < S.t - 0.04 && (!manualOnly || c.manualEnd));
  const pick = list => list.reduce((best, c) => !best || c.start > best.start ? c : best, null);
  const target = pick(cuts.filter(c => S.t < c.end)) || pick(cuts);
  if (!target || !manualOnly && Math.abs(target.end - S.t) < 0.01) return null;
  return { cut: target, key: layer === 'lyrics' ? `${target.line}:${target.part}` : target.index };
}
function playheadActionEnabled(action, layer) {
  const busy = S.exporting || S.tap || !S.plan;
  if (action === 'insert') return !busy && S.t < S.plan.duration - .04;
  if (action === 'split') return !!mediaSplitTarget(layer);
  return !!playheadEndTarget(layer, action === 'untilNext');
}
function syncPlayheadMenu() {
  if(S.exporting||S.tap)S.playheadMenu=null;
  const menu = S.playheadMenu;
  for (const button of document.querySelectorAll('[data-playhead-action]')) {
    button.hidden = button.dataset.playheadAction !== menu;
    button.disabled = !playheadActionEnabled(button.dataset.playheadAction, button.dataset.layer);
  }
  for (const button of document.querySelectorAll('[data-playhead-menu]')) {
    const action = button.dataset.playheadMenu;
    button.disabled = ![...document.querySelectorAll(`[data-playhead-action="${action}"]`)].some(b => !b.disabled);
    button.setAttribute('aria-expanded', String(menu === action));
  }
  const popup=document.querySelector('.playhead-secondary');popup.hidden = !menu;
  if(menu){
    const trigger=document.querySelector(`[data-playhead-menu="${menu}"]`);
    if(trigger.disabled){S.playheadMenu=null;popup.hidden=true;trigger.setAttribute('aria-expanded','false');}
    else{popup.setAttribute('aria-label',trigger.textContent);const r=trigger.getBoundingClientRect(),box=popup.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(r.left,innerWidth-box.width-8))+'px';popup.style.top=Math.max(8,Math.min(r.bottom+4,innerHeight-box.height-8))+'px';}
  }
  $('relayoutAtPlayhead').disabled = !!(S.exporting || S.tap) || !relayoutTargets().length;
}
function playheadEnd(layer, untilNext) {
  const target = playheadEndTarget(layer, untilNext); if (!target) return;
  pause();
  setCutEnd(layer, target.key, untilNext ? null : S.t);
  replan();
}
function relayoutAtPlayhead() {
  const targets = relayoutTargets(); if (!targets.length) return;
  pause();
  const L = J.mediaLabel, fresh = () => 1 + Math.floor(Math.random() * 1e9);
  const lyricAuto = J.lyricEffectSettings(S.project).autoPlacement;
  for (const { layer, cut } of targets) {
    if (layer === 'lyrics') {
      // Manual areas give way to automatic placement for this cut (and its line's shared area).
      const options = S.project.lyricCutOptions[`${cut.line}:${cut.part}`] ||= {};
      if (options.details) { delete options.details.area; if (!Object.keys(options.details).length) delete options.details; }
      if (S.project.overrides?.[cut.line]?.area) delete S.project.overrides[cut.line].area;
      options.placementSeed = fresh();
    } else mediaOv(cut.index, { placement: undefined, placementSeed: fresh(), ...autoWindowReset(layer, cut.index) }, layer);
  }
  replan();
  const note = !lyricAuto && targets.some(t => t.layer === 'lyrics') ? L('（歌詞の自動配置がOFFのため、歌詞は全域のままです）', ' (automatic lyric placement is off, so lyrics keep the full stage)') : '';
  toast(L(`再生位置の${targets.length}件のカットを再配置しました`, `Re-laid out ${targets.length} cut(s) at the playhead`) + note);
}
function openSplitMediaCut(layer) {
  if(!mediaSplitTarget(layer))return;
  pause();
  const time=S.t,L=J.mediaLabel,dialog=document.createElement('dialog');
  dialog.id='splitMediaCutDialog';dialog.className='insert-cut-dialog';
  dialog.innerHTML=`<form><h2>${layer==='foreground'?L('前景を分割','Split foreground'):L('背景を分割','Split background')}</h2><div class="split-effect-options"><label><input type="checkbox" name="left">${L('左をランダム演出にする','Randomize left effects')}</label><label><input type="checkbox" name="right">${L('右をランダム演出にする','Randomize right effects')}</label></div><p class="hint">${L('OFFの場合は現在の演出設定を引き継ぎます。','Unchecked sides inherit the current effects.')}</p><div class="row"><button type="button" data-cancel>${L('キャンセル','Cancel')}</button><button type="submit">${L('分割','Split')}</button></div></form>`;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=e=>{
    e.preventDefault();S.t=time;
    splitMediaCut(layer,dialog.querySelector('[name=left]').checked,dialog.querySelector('[name=right]').checked);
    dialog.close();
  };
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
function splitMediaCut(layer,randomLeft=false,randomRight=false) {
  const cut=mediaSplitTarget(layer);if(!cut)return;
  pause();
  const time=S.t,m=S.project[layer],cuts=S.plan[layer].cuts,index=cut.index;
  const clone=v=>JSON.parse(JSON.stringify(v)),overrides={},times={};
  const resolved={...clone(mediaCutOptions(layer,index)),itemId:cut.itemId,
    technique:cut.technique,entrance:cut.entrance,departure:cut.departure,
    placement:clone(cut.placement),blend:cut.blend,opacity:cut.opacity,
    details:Object.fromEntries(J.cutDetailKeys.media.filter(k=>cut[k]!==undefined).map(k=>[k,clone(cut[k])]))};
  const windowSig=layoutWindowSig(layer,cut);if(windowSig)resolved.layoutMask=windowSig;
  const first=clone(resolved),second=clone(resolved);
  for(const [side,random] of [[first,randomLeft],[second,randomRight]]){
    if(!random)continue;
    // Clear resolved effects, including copied detail overrides, while keeping
    // the asset, placement, compositing, mask and source playback settings.
    side.details=side.details.mask?{mask:side.details.mask}:{};
    for(const key of ['technique','entrance','departure','layout','enter','hold','exit','treat','trans'])side[key]=null;
    side.lock=false;side.seed=(side.seed|0)+1;
    for(const key of Object.keys(side))if(key.startsWith('locked'))delete side[key];
  }
  if(cut.type==='video'){
    const asset=J.mediaAssets.get(cut.itemId),item=m.items.find(x=>x.id===cut.itemId);
    const duration=asset?.element?.duration || item?.duration;
    first.videoStart=cut.videoStart;first.videoDuration=time-cut.start;
    second.videoStart=Number.isFinite(duration)&&duration>0 ? J.mediaVideoTime(cut,time,duration) : cut.videoStart+time-cut.start;
    second.videoDuration=cut.end-time;
    first.videoLoop=second.videoLoop=cut.videoLoop;
  }
  if(cut.animation){first.animationStart=cut.animationStart;second.animationStart=cut.animationStart+time-cut.start;first.animationLoop=second.animationLoop=cut.animationLoop;}
  cuts.forEach((c,i)=>{
    const next=i>index?i+1:i;
    overrides[next]=i===index?first:{...clone(m.cutOverrides[i] || {}),itemId:c.itemId};
    times[next]=c.start;
  });
  overrides[index+1]=second;times[index+1]=time;
  m.randomOrder=false;m.manualCuts=true;m.cutCount=cuts.length+1;m.cutOverrides=overrides;m.timing.lineTimes=times;
  S.project.durationOverride=S.plan.duration;
  const prefix=layer==='foreground'?'f:':'m:';
  for(const link of S.project.timelineLinks)for(const end of ['a','b']){
    if(link[end].startsWith(prefix) && +link[end].slice(2)>index)link[end]=prefix+(+link[end].slice(2)+1);
  }
  replan();seek(time);
}
function insertMediaCut(index, layer = activeMediaLayer() || 'media') {
  const m = S.project[layer], cuts = S.plan[layer].cuts;
  if (cuts.length >= 1000) { toast('カット数の上限に達しました'); return; }
  const starts = cuts.map(cut => cut.start);
  const overrides = {};
  cuts.forEach((cut, i) => {
    overrides[i >= index ? i + 1 : i] = Object.assign({}, m.cutOverrides[i] || {}, { itemId: cut.sourceItemId });
  });
  overrides[index] = { itemId: null, technique: null };
  let start;
  if (!cuts.length) start = 0;
  else if (index === 0) {
    start = 0;
    starts[0] = Math.max(starts[0], Math.min(cuts[0].end, starts[0] + Math.max(0.04, (cuts[0].end - starts[0]) / 2)));
  } else if (index === cuts.length) {
    start = Math.max(cuts[index - 1].start + 0.04, (cuts[index - 1].start + S.plan.duration) / 2);
  } else start = (cuts[index - 1].start + cuts[index].start) / 2;
  const times = {};
  starts.forEach((time, i) => { times[i >= index ? i + 1 : i] = +time.toFixed(3); });
  times[index] = +start.toFixed(3);
  m.manualCuts = true;
  m.cutCount = cuts.length + 1;
  m.cutOverrides = overrides;
  m.timing.lineTimes = times;
  const prefix = layer === 'foreground' ? 'f:' : 'm:';
  for (const link of S.project.timelineLinks) for (const end of ['a', 'b']) {
    if (link[end].startsWith(prefix) && +link[end].slice(2) >= index) link[end] = prefix + (+link[end].slice(2) + 1);
  }
  replan(); seek(start);
}
function removeMediaCut(index, layer = activeMediaLayer() || 'media') {
  const m = S.project[layer], cuts = S.plan[layer].cuts;
  if (!Number.isInteger(index) || index < 0 || index >= cuts.length) return;
  cancelAreaEditor();
  if (S.tap) stopTap();
  const overrides = {}, times = {};
  cuts.forEach((cut, oldIndex) => {
    if (oldIndex === index) return;
    const newIndex = oldIndex > index ? oldIndex - 1 : oldIndex;
    overrides[newIndex] = Object.assign({}, m.cutOverrides[oldIndex] || {}, { itemId: cut.sourceItemId });
    times[newIndex] = +cut.start.toFixed(3);
  });
  m.manualCuts = true;
  m.cutCount = cuts.length - 1;
  m.cutOverrides = overrides;
  m.timing.lineTimes = times;
  const prefix = layer === 'foreground' ? 'f:' : 'm:';
  const remapRef = ref => {
    if (typeof ref !== 'string' || !ref.startsWith(prefix)) return ref;
    const oldIndex = +ref.slice(prefix.length);
    if (!Number.isInteger(oldIndex)) return ref;
    return oldIndex === index ? null : prefix + (oldIndex > index ? oldIndex - 1 : oldIndex);
  };
  S.project.timelineLinks = S.project.timelineLinks.flatMap(link => {
    const a = remapRef(link.a), b = remapRef(link.b);
    return a && b ? [{ a, b }] : [];
  });
  replan();
}
function importProgressDialog(id, heading, delay=0) {
  const dialog=document.createElement('dialog');dialog.id=id;dialog.className='insert-cut-dialog media-loading-dialog';
  const title=document.createElement('h2'),status=document.createElement('p'),progress=document.createElement('progress');
  title.id=id+'Title';title.textContent=heading;dialog.setAttribute('aria-labelledby',title.id);
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');progress.max=1;progress.setAttribute('aria-label',heading);
  dialog.setAttribute('aria-busy','true');dialog.append(title,status,progress);
  dialog.addEventListener('cancel',e=>e.preventDefault());
  const escape=e=>{if(dialog.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();}};
  document.addEventListener('keydown',escape,true);
  const show=()=>{document.body.append(dialog);dialog.showModal();};
  const timer=delay?setTimeout(show,delay):null;if(!delay)show();
  return {
    report(text,value=null){status.textContent=text;if(value==null)progress.removeAttribute('value');else progress.value=J.clamp(value,0,1);},
    close(){clearTimeout(timer);document.removeEventListener('keydown',escape,true);if(dialog.open)dialog.close();dialog.remove();}
  };
}
async function addMediaFiles(files, layer) {
  files=files.filter(file=>/^(image|video)\//.test(file.type)||/\.(png|apng|gif)$/i.test(file.name));
  if(!files.length)return;
  if(S.projectBusy || S.exporting){toast(J.mediaLabel('処理が完了してから素材を追加してください','Wait for the current operation before adding assets'));return;}
  S.projectBusy=true;
  const m = S.project[layer];
  const loading=importProgressDialog('mediaLoadingDialog',layer==='foreground'?J.mediaLabel('前景素材を読み込み中','Loading foreground assets'):J.mediaLabel('背景素材を読み込み中','Loading background assets'),files.some(J.isVideoFile)?0:300);
  try {
  for (const [index,file] of files.entries()) {
    const report=(text,value=null)=>loading.report(text+` (${index+1}/${files.length})：${file.name}`,value);
    report(J.mediaLabel('読み込み中','Loading'));
    const type = file.type.startsWith('image/') || /\.(png|apng|gif)$/i.test(file.name) ? 'image' : J.isVideoFile(file) ? 'video' : null;
    if (!type) continue;
    const existing = m.items.find(x => x.name === file.name && x.size === file.size && !J.mediaAssets.has(x.id));
    const item = existing || { id: crypto.randomUUID(), name: file.name, size: file.size, type };
    try {
      const el = await J.attachMedia(item, file, J.mediaAssets, p=>{
        if(p.phase==='read')report(J.mediaLabel('ファイルを読み込み中','Reading file')+(p.total?` ${Math.round(p.loaded/p.total*100)}%`:''),p.total?p.loaded/p.total:null);
        else report(J.mediaLabel('素材を準備中','Preparing asset'));
      });
      el.addEventListener('seeked', () => { S.need = true; });
      if (type === 'video') item.duration = el.duration || 0;
      if (!existing) {
        m.items.push(item);
        m.overrides[item.id] = { ...(m.overrides[item.id] || {}), technique: null };
      }
      report(J.mediaLabel('ブラウザに保存中','Saving in browser'));
      await J.storeMedia(item.id, file);
    } catch (err) { toast(`${file.name}: `+J.mediaLabel('読み込めませんでした','Could not load asset')); }
  }
  replan();
  } finally {
    loading.close();S.projectBusy=false;
  }
}
const MEDIA_EFFECT_GROUPS = {
  enter: J.mediaLabel('登場', 'Entrance'), exit: J.mediaLabel('退場', 'Exit'),
  cinema: J.mediaLabel('カメラ', 'Camera'), dynamic: J.mediaLabel('ダイナミックモーション', 'Dynamic motion'),
  bpm: J.mediaLabel('BPM同期', 'BPM sync'), texture: J.mediaLabel('色・質感', 'Color / texture'),
  graphic: J.mediaLabel('分割・残像・グリッチ', 'Panels / echoes / glitch'), maskFx: J.mediaLabel('マスク', 'Masks'),
  transition: J.mediaLabel('カット間のつなぎ', 'Cut transitions'),
};
function renderMediaLines() {
  const layer = activeMediaLayer() || 'media', m = S.project[layer];
  const ol = $('mediaLineList'); ol.innerHTML = ''; S.mediaLineEls = [];
  const selectTechnique = (ov, cut) => `<select class="media-technique" aria-label="${J.mediaLabel('画像・動画の手法', 'Media technique')}"><option value="none" ${(ov.technique === 'none' || ov.technique === undefined && cut.technique === 'none') ? 'selected' : ''}>${J.mediaLabel('演出無し', 'No effects')}</option><option value="" ${ov.technique === null ? 'selected' : ''}>${J.mediaLabel('自動', 'Auto')}</option>${cut.technique === 'legacy' ? `<option value="legacy" selected>${J.mediaLabel('従来の設定', 'Legacy settings')}</option>` : ''}${J.MEDIA_TECH[cut.technique]?.stage ? `<option value="${cut.technique}" selected>${J.mediaTechniqueName(cut)} (${J.mediaLabel('従来の設定', 'Legacy settings')})</option>` : ''}${Object.entries(MEDIA_EFFECT_GROUPS).filter(([group]) => !['enter', 'exit'].includes(group) && Object.entries(J.MEDIA_TECH).some(([key, def]) => def.group === group && J.mediaTechAllowed(key, layer))).map(([group, name]) => `<optgroup label="${name}">${Object.entries(J.MEDIA_TECH).filter(([key, def]) => def.group === group && !def.stage && J.mediaTechAllowed(key, layer)).map(([key, def]) => `<option value="${key}" ${ov.technique === key ? 'selected' : ''}>${escapeHtml(def.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const selectPhase = (ov, cut, stage, field) => {
    const value = ov[field] ?? '', title = MEDIA_EFFECT_GROUPS[stage];
    return `<label>${title}<select class="media-phase" data-media-phase="${field}" aria-label="${title}"><option value="" ${!value ? 'selected' : ''}>${J.mediaLabel('自動', 'Auto')}</option><option value="none" ${value === 'none' ? 'selected' : ''}>${J.mediaLabel('即時（なし）', 'Instant (none)')}</option>${J.mediaPhaseOptions(stage).map(([key, def]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${escapeHtml(def.name)}</option>`).join('')}</select></label>`;

  };
  const addButton = index => {
    const row = document.createElement('li'); row.className = 'media-cut-insert';
    row.innerHTML = `<button class="ghost small" type="button" aria-label="${index + 1}番目にカットを追加">＋ カットを追加</button>`;
    row.querySelector('button').addEventListener('click', () => insertMediaCut(index, layer));
    ol.appendChild(row);
  };
  S.plan[layer].cuts.forEach((cut, i) => {
    addButton(i);
    const item = [...m.items,...J.mediaCopyItems(layer)].find(x => x.id === cut.itemId), ov = Object.assign({}, m.overrides[cut.itemId] || {}, m.cutOverrides[i] || {});
    const fileSelect = `<select class="media-cut-file" ${m.randomOrder ? `title="${J.mediaLabel('素材を変更すると現在の並びでランダム順をオフにします', 'Changing the asset turns off random order and keeps the current order')}"` : ''} aria-label="${i + 1}カット目の素材"><option value="">画像無し</option>${[...J.mediaCopyItems(layer),...m.items].map(asset => `<option value="${escapeHtml(asset.id)}" ${cut.itemId === asset.id ? 'selected' : ''}>${escapeHtml(asset.name)}</option>`).join('')}</select>`;
    if (ov.layout === 'stretch') ov.layout = 'cover';
    for (const key of ['layout', 'enter', 'hold', 'exit', 'treat']) if (ov[key] === undefined) ov[key] = cut[key];
    const asset = J.mediaAssets.get(cut.itemId), source = asset && asset.element;
    const dimensions=J.mediaSourceDimensions(S.plan,cut,cut.start);
    const sw=dimensions?.width,sh=dimensions?.height;
    const placement = J.mediaPlacementRect(cut.placement, sw, sh, S.plan.W, S.plan.H);
    const placementControl = `<span class="foreground-placement-controls"><button class="foreground-placement-open ghost" type="button" ${placement ? '' : 'disabled'} aria-label="${i + 1}カット目の配置とサイズを編集"><span class="foreground-placement-thumb"><i style="left:${(placement ? placement.x : 0) * 100}%;top:${(placement ? placement.y : 0) * 100}%;width:${(placement ? placement.w : 1) * 100}%;height:${(placement ? placement.h : 1) * 100}%;transform:rotate(${cut.placement ? cut.placement.angle || 0 : 0}deg)"></i></span>配置・サイズを編集</button>${cut.placementMode === 'auto' ? `<span class="tagl">${J.mediaLabel('自動配置', 'Auto placement')}</span>` : ''}${cut.placementMode === 'manual' ? '<button class="foreground-placement-reset ghost" type="button">自動配置に戻す</button>' : ''}</span>`;
    const li = document.createElement('li'); li.className = 'ln media-ln';
    li.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span><input class="time mono" type="number" step="0.01" min="0" value="${cut.start.toFixed(2)}" aria-label="${i + 1}カット目の開始秒">${fileSelect}${mediaThumb(item, 'media-ln-thumb')}<div class="meta"><span class="cuts"><span>${J.mediaTechniqueName(cut)}</span></span><span class="tools">${selectTechnique(ov, cut)}<button class="icon ghost dice" title="このカットを再抽選">${ICON.dice}</button><button class="icon ghost lock" title="このカットをロック" aria-pressed="${ov.lock ? 'true' : 'false'}">${ICON.lock}</button><button class="ghost small remove-media-cut" type="button" aria-label="${i + 1}カット目を削除">削除</button></span>${placementControl}${cut.type === 'video' ? `<label class="media-video-loop"><input type="checkbox" ${cut.videoLoop ? 'checked' : ''}>動画をループ再生</label><label class="media-video-start-field">${J.mediaLabel('素材の再生開始位置（秒）','Source start time (s)')}<input class="media-video-start" type="number" min="0" step="0.01" value="${cut.videoStart}" aria-label="${J.mediaLabel('素材の再生開始位置（秒）','Source start time (s)')}"></label><label class="media-video-duration">動画の長さ（秒）<input type="number" min="0.04" max="3600" step="0.01" placeholder="自動" value="${ov.videoDuration ?? ''}" aria-label="${i + 1}カット目の動画の長さ（秒）"></label>` : ''}</div>`;
    if (cut.type === 'video') li.querySelector('.meta').insertAdjacentHTML('beforeend', `<span class="media-chroma"><label><input class="media-chroma-toggle" type="checkbox" ${cut.chromaKey ? 'checked' : ''}>クロマキー合成</label><label>色<input class="media-chroma-color" type="color" value="${cut.chromaColor}" aria-label="${i + 1}カット目のクロマキー色" ${cut.chromaKey ? '' : 'disabled'}></label></span>`);
    li.querySelector('.foreground-placement-controls').insertAdjacentHTML('beforebegin', `<div class="media-phase-controls">${selectPhase(ov, cut, 'enter', 'entrance')}${selectPhase(ov, cut, 'exit', 'departure')}</div>`);
    li.querySelectorAll('[data-media-phase]').forEach(select => select.addEventListener('change', e => {
      mediaOv(i, { [select.dataset.mediaPhase]: e.target.value || null, lock: false }, layer); replan();
    }));
    const compositing=document.createElement('div');compositing.className='lyric-cut-compositing media-cut-compositing';
    const L=J.mediaLabel,modes={normal:L('通常','Normal'),multiply:L('乗算','Multiply'),screen:L('スクリーン','Screen'),overlay:L('オーバーレイ','Overlay')};
    compositing.innerHTML=`<label>${L('合成方法','Blend')}<select class="media-cut-blend" aria-label="${L('このカットの合成方法','This cut blend mode')}">${Object.entries(modes).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>${L('不透明度（％）','Opacity (%)')}<input class="media-cut-opacity" type="number" min="0" max="100" step="1" value="${cut.opacity}" aria-label="${L('このカットの不透明度（％）','This cut opacity (%)')}"></label>`;
    compositing.querySelector('select').value=cut.blend;
    compositing.querySelector('select').addEventListener('change',e=>{mediaOv(i,{blend:e.target.value},layer);replan();});
    compositing.querySelector('input').addEventListener('change',e=>{mediaOv(i,{opacity:J.clamp(+e.target.value||0,0,100)},layer);replan();});
    li.querySelector('.meta').append(compositing);
    li.querySelector('.time').addEventListener('change', e => { m.timing.lineTimes[i] = Math.max(0, parseFloat(e.target.value) || 0); replan(); });
    li.querySelector('.media-cut-file').addEventListener('change', e => setMediaCutAsset(layer,i,e.target.value || null));
    li.querySelector('.media-technique').addEventListener('change', e => { if (e.target.value !== 'legacy') { mediaOv(i, { technique: e.target.value || null, lock: false, lockedTechnique: undefined }, layer); replan(); } });
    if(cut.animation){
      li.querySelector('.meta').insertAdjacentHTML('beforeend',`<label class="media-video-loop">${J.mediaLabel('アニメーションの再生','Animation playback')}<select class="media-animation-loop">${[['auto',J.mediaLabel('ファイルの設定通り','As specified by the file')],['once',J.mediaLabel('1回再生','Play once')],['loop',J.mediaLabel('繰り返し再生','Loop')]].map(([value,label])=>`<option value="${value}" ${cut.animationLoop===value?'selected':''}>${label}</option>`).join('')}</select></label>`);
      li.querySelector('.media-animation-loop').onchange=e=>{mediaOv(i,{animationLoop:e.target.value},layer);replan();};
    }
    const videoLoop = li.querySelector('.media-video-loop input');
    if (videoLoop) videoLoop.addEventListener('change', e => { mediaOv(i, { videoLoop: e.target.checked }); replan(); });
    const videoStart = li.querySelector('.media-video-start');
    if (videoStart) videoStart.addEventListener('change', e => { const value=Number(e.target.value); mediaOv(i,{videoStart:Number.isFinite(value)?Math.max(0,value):0},layer); replan(); });
    const videoDuration = li.querySelector('.media-video-duration input:not(.media-video-start)');
    if (videoDuration) videoDuration.addEventListener('change', e => { const v = +e.target.value; mediaOv(i, { videoDuration: e.target.value && Number.isFinite(v) && v > 0 ? J.clamp(v, 0.04, 3600) : undefined }, layer); replan(); });
    const placementOpen = li.querySelector('.foreground-placement-open');
    if (placementOpen) placementOpen.addEventListener('click', () => openMediaEditor(i, layer));
    const placementReset = li.querySelector('.foreground-placement-reset');
    if (placementReset) placementReset.addEventListener('click', () => { mediaOv(i, { placement: null, lock: false, lockedPlacement: undefined, lockedPlacementMode: undefined, lockedLayout: undefined, ...autoWindowReset(layer, i) }); replan(); });
    const chroma = li.querySelector('.media-chroma-toggle');
    if (chroma) {
      chroma.addEventListener('change', e => { mediaOv(i, { chromaKey: e.target.checked }); replan(); });
      li.querySelector('.media-chroma-color').addEventListener('change', e => { mediaOv(i, { chromaColor: e.target.value }); replan(); });
    }
    li.querySelector('.dice').addEventListener('click', () => rerollMediaCut(layer, i));
    li.querySelector('.dice').after(disableRerollButton(layer,i));
    li.querySelector('.tools').insertBefore(detailButton(() => openCutDetails(layer,i)), li.querySelector('.remove-media-cut'));
    li.querySelector('.tools').append(...effectFavoriteButtons(layer,i));
    li.querySelector('.lock').addEventListener('click', () => toggleMediaCutLock(layer, i));
    li.querySelector('.remove-media-cut').addEventListener('click', () => removeMediaCut(i, layer));
    ol.appendChild(li); S.mediaLineEls.push(li);
  });
  addButton(S.plan[layer].cuts.length);
  syncSourceTab();
}
async function restoreMediaAssets() {
  for (const item of [...S.project.media.items, ...S.project.foreground.items]) {
    if (J.mediaAssets.has(item.id)) continue;
    try { const blob = await J.loadMedia(item.id); if (blob) { const el = await J.attachMedia(item, blob); el.addEventListener('seeked', () => { S.need = true; }); } } catch (e) {}
  }
  for(const ref of J.personMaskReferences(S.project).values())try{await J.loadPersonMask(ref);}catch(e){}
  replan();
}
function setOv(i, patch) {
  // A later line-wide selection supersedes the corresponding per-cut edit.
  for (const [key, options] of Object.entries(S.project.lyricCutOptions || {})) if (key.startsWith(`${i}:`) && options.details) {
    for (const field of Object.keys(patch)) if (J.cutDetailKeys.lyrics.includes(field)) {
      delete options.details[field];
      const params={layout:'params',treat:'treatP',bg:'bgP',cam:'camP',trans:'transP'}[field];
      if(params)delete options.details[params];
    }
  }
  const cur = Object.assign({}, S.project.overrides[i] || {}, patch);
  for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === false || cur[k] === '') delete cur[k];
  if (Object.keys(cur).length) S.project.overrides[i] = cur; else delete S.project.overrides[i];
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* ---------------- style tab ---------------- */
function drawStyleGrid() {
  const g = $('styleGrid');
  if (!g.children.length) {
    J.STYLE_ORDER.forEach(k => {
      const b = document.createElement('button'); b.className = 'stile'; b.dataset.k = k;
      b.title = J.STYLES[k].desc;
      b.innerHTML = `<canvas width="192" height="108"></canvas><span>${J.STYLES[k].name}</span><span class="badges">${setBadges(J.STYLES[k])}</span>`;
      b.addEventListener('click', () => { remember(); S.project.style = k; S.project.colors.enabled = false; syncUI(); replan(); commit(); });
      g.appendChild(b);
    });
  }
  [...g.children].forEach(b => {
    const k = b.dataset.k, st = J.STYLES[k], sc = st.schemes[0], cv = b.querySelector('canvas'), x = cv.getContext('2d');
    b.setAttribute('aria-pressed', S.project.style === k ? 'true' : 'false');
    const off = !J.randomOk(S.project, 'style', k);
    b.classList.toggle('set-off', off);
    b.title = st.desc + (off ? (st.set ? J.mediaLabel('（演出セットがオフ）',' (Part set is off)') : st.extra && S.project.extra !== true ? '（追加分がオフのため、おまかせでは選ばれません）' : '（和風の演出がオフのため、おまかせでは選ばれません）') : '');
    x.fillStyle = sc.bg; x.fillRect(0, 0, 192, 108);
    st.schemes.slice(1, 4).forEach((s2, i) => { x.fillStyle = s2.bg; x.fillRect(192 - 14 * (i + 1), 0, 14, 10); });
    const f = st.fonts.display[0];
    x.font = J.fontCSS(f, 46); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = sc.ghostB; x.fillText('字面', 96 - 3, 54 - 1);
    x.fillStyle = sc.ghostA; x.fillText('字面', 96 + 3, 54 + 2);
    x.fillStyle = sc.fg; x.fillText('字面', 96, 54);
    x.fillStyle = sc.accent; x.fillRect(12, 90, 30, 4);
    x.font = J.fontCSS('mono', 9); x.textAlign = 'left'; x.fillStyle = sc.sub; x.fillText(k.toUpperCase(), 48, 93);
  });
}
function fontSelectOptions(sel) {
  return '<option value="">スタイルの既定</option>' + Object.entries(J.FONTS).map(([k, f]) => {
    const g = J.faceOf ? J.faceOf(k) : f, alt = g.label && g.label !== f.label ? ' → ' + g.label : '';   // the face actually used for the lyric language
    return `<option value="${escapeHtml(k)}" style="font-family:${escapeHtml(g.family)},sans-serif;font-weight:${g.weight}" ${sel === k ? 'selected' : ''}>${escapeHtml(f.label + alt)}</option>`;
  }).join('');
}
function renderFontRoles() {
  const box = $('fontRoles'); box.innerHTML = '';
  [['display', '見出し'], ['serif', '明朝枠'], ['body', '小さな文字']].forEach(([role, label]) => {
    const row = document.createElement('div'); row.className = 'font-row';
    row.innerHTML = `<span class="muted">${label}</span><select aria-label="${label}のフォント">${fontSelectOptions(S.project.fonts[role])}</select>`;
    row.querySelector('select').addEventListener('change', e => { if (e.target.value) S.project.fonts[role] = e.target.value; else delete S.project.fonts[role]; fontKey = ''; replan(); });
    box.appendChild(row);
  });
  renderCompositeFonts();
}
function renderCompositeFonts() {
  const choices = Object.entries(J.FONTS).filter(([, f]) => !f.composite).map(([key, f]) => `<option value="${escapeHtml(key)}" style="font-family:${escapeHtml((J.faceOf ? J.faceOf(key) : f).family)},sans-serif">${escapeHtml(f.label)}</option>`).join('');
  const base = $('compositeBase');
  if (!base) return;
  const selected = base.value; base.innerHTML = choices;
  if (selected && J.FONTS[selected]) base.value = selected;
  const parts = $('compositeParts'), existing = Object.fromEntries([...parts.querySelectorAll('select')].map(el => [el.dataset.part, el.value]));
  parts.innerHTML = Object.entries(J.COMPOSITE_PARTS).map(([key, label]) => `<label>${label}<select data-part="${key}"><option value="">ベースを使用</option>${choices}</select></label>`).join('');
  for (const select of parts.querySelectorAll('select')) if (existing[select.dataset.part]) select.value = existing[select.dataset.part];
  $('compositeList').innerHTML = (S.project.compositeFonts || []).map(def => `<div class="composite-saved"><span>${escapeHtml(def.name)}</span><button type="button" data-key="${escapeHtml(def.key)}" aria-label="${escapeHtml(def.name)}を削除">×</button></div>`).join('');
}
const BASE_KEYS = [['bg', '背景'], ['fg', '文字'], ['sub', '補助']];
const ACCENT_KEYS = [['accent', 'アクセント'], ['ghostA', 'ズレ色A'], ['ghostB', 'ズレ色B']];
function renderColors() {
  const st = J.STYLES[S.project.style] || J.STYLES.noir, sc = st.schemes[0];
  const c = S.project.colors;
  $('colorOn').checked = !!c.enabled;
  $('accentOn').checked = !!c.accentOn;
  const fill = (rowId, keys, flag) => {
    const row = $(rowId); row.innerHTML = '';
    keys.forEach(([k, label]) => {
      const l = document.createElement('label');
      const v = (c[flag] && c[k]) || c[k] || sc[k];
      l.innerHTML = `${label}<input type="color" value="${toColorInput(v)}">`;
      l.querySelector('input').addEventListener('input', e => {
        c[k] = e.target.value.toUpperCase();
        if (!c[flag]) { c[flag] = true; $(flag === 'enabled' ? 'colorOn' : 'accentOn').checked = true; }
        markUndoGroup(`color:${k}`); replanSoon(60); drawSwatch();
      });
      row.appendChild(l);
    });
  };
  fill('colorRow', BASE_KEYS, 'enabled');
  fill('colorRowAccent', ACCENT_KEYS, 'accentOn');
  drawSwatch();
}
const toColorInput = v => { const h = String(v || '#000000'); return /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : J.toHex(...J.hex(h)).toLowerCase(); };
function swatchHTML(cols) { return cols.map(c => `<i style="background:${c}" title="${c}"></i>`).join(''); }
function drawSwatch() {
  const sc = S.plan ? S.plan.style.schemes[0] : null; if (!sc) return;
  $('paletteSwatch').innerHTML = swatchHTML([sc.accent, sc.ghostA, sc.ghostB]);
}
function randomPalette() {
  remember();
  const c = S.project.colors;
  const sc0 = J.STYLES[S.project.style].schemes[0];
  const bg = c.enabled && c.bg ? c.bg : sc0.bg;
  // A colour theme (genre / theme colour) decides the palette, base colours included when its genre sets them.
  if (J.colorThemeActive(S.project)) {
    S.project.colors = J.themedColors(S.project, S.project.style, Math.random, c);
    const n = S.project.colors;
    renderColors(); replan(); commit();
    toast(J.mediaLabel('配色：テーマのカラーに合わせて変更', 'Colours: changed to match the colour theme'), [n.accent, n.ghostA, n.ghostB]);
    return;
  }
  let p, guard = 0;
  do { p = J.randomPalette(bg); } while (guard++ < 6 && p.ghostA === c.ghostA && p.ghostB === c.ghostB);
  Object.assign(c, { accent: p.accent, ghostA: p.ghostA, ghostB: p.ghostB, accentOn: true });
  renderColors(); replan(); commit();
  toast('配色：アクセント・ズレ色A/Bを変更', [p.accent, p.ghostA, p.ghostB]);
}

/* ---------------- history of looks (◀ ▶) ---------------- */
// only the "look" is tracked — lyrics, timing and output settings are never rolled back
const HKEYS = ['style', 'mood', 'seed', 'fx', 'enabled', 'fonts', 'colors', 'overrides'];
const H = { list: [], i: -1 };
const lookSnap = () => {
  // Undo/import fills in missing enabled keys. Normalize them here too so that
  // restoring a look does not create a duplicate history stop on the next click.
  const enabled = J.defaultProject().enabled;
  for (const group of J.GROUP_KEYS) Object.assign(enabled[group], S.project.enabled[group] || {});
  return JSON.stringify({
    ...Object.fromEntries(HKEYS.map(k => [k, S.project[k] ?? null])), enabled,
    lyricEffects: J.lyricEffectSettings(S.project),
    mediaEffects: Object.fromEntries(['foreground', 'media'].map(layer => [layer, J.mediaEffectSettings(S.project, layer)])),
  });
};
function remember() {            // call before changing the look: makes sure the current look is on the stack
  const s = lookSnap();
  if (H.i >= 0 && H.list[H.i] === s) return;
  H.list = H.list.slice(0, H.i + 1); H.list.push(s); H.i = H.list.length - 1;
}
function commit() {              // call after changing the look
  const s = lookSnap();
  if (H.list[H.i] !== s) { H.list = H.list.slice(0, H.i + 1); H.list.push(s); H.i = H.list.length - 1; }
  if (H.list.length > 80) { H.list.splice(0, H.list.length - 80); H.i = H.list.length - 1; }
}

/* ---------------- おまかせ ---------------- */
function restartPreview() { seek(0); if (!S.playing && S.mode === 'easy') play(); }
function omakase() {
  if (S.exporting || S.tap) return;
  remember();
  J.clearPastedLyricEffects(S.project);
  const r = J.omakase(S.project);
  Object.assign(S.project, r);
  fontKey = ''; syncUI(); replan(); commit();
  toast(`おまかせ：${J.STYLES[r.style].name} × ${J.MOODS[r.mood].name}`, r.colors.accentOn ? [r.colors.accent, r.colors.ghostA, r.colors.ghostB] : null);
  restartPreview();
}
// change just one aspect of the current look
function rerollPart(part) {
  if (S.exporting || S.tap) return;
  remember();
  const P = S.project;
  let msg = '';
  if (part === 'style') {
    let pool = J.STYLE_ORDER.filter(k => k !== P.style && J.randomOk(P, 'style', k));
    if (!pool.length) pool = J.STYLE_ORDER.filter(k => k !== P.style);
    P.style = pool[Math.floor(Math.random() * pool.length)];
    P.colors.enabled = false;
    msg = `スタイル：${J.STYLES[P.style].name}`;
  } else if (part === 'mood') {
    const r = J.omakase(P);
    Object.assign(P, { mood: r.mood, fx: r.fx, enabled: r.enabled });
    msg = `雰囲気：${J.MOODS[r.mood].name}`;
  } else if (part === 'cut') {
    J.clearPastedLyricEffects(P);
    shuffleMediaEffects();
    P.seed = (Math.random() * 1e9) | 0;
    msg = '構成：レイアウトと動きを再抽選';
  }
  fontKey = ''; syncUI(); replan(); commit();
  toast(msg);
  restartPreview();
}
function showNow() {
  const el = $('easyNow'); if (!el || !S.plan || el.closest('[hidden]')) return;
  const P = S.project, sc = S.plan.style.schemes[0];
  const moodName = P.mood && J.MOODS[P.mood] ? J.MOODS[P.mood].name : 'カスタム';
  const fk = S.plan.style.fonts.display[0];
  const fontName = J.FONTS[fk] ? J.FONTS[fk].label : fk;
  const cuts = S.plan.cuts.filter(c => c.line >= 0 && c.layout !== 'interlude');
  const kinds = new Set(cuts.map(c => c.layout)).size;
  const row = (k, v) => `<div class="now-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  el.innerHTML = row('スタイル', `<b>${escapeHtml(J.STYLES[P.style].name)}</b>`)
    + row('雰囲気', escapeHtml(moodName))
    + row('配色', `<span class="swatches">${swatchHTML([sc.bg, sc.fg, sc.accent, sc.ghostA, sc.ghostB])}</span>${P.colors.accentOn ? '<span class="tagl">ランダム</span>' : ''}`)
    + row('見出し書体', escapeHtml(fontName))
    + row('構成', `${cuts.length} カット・レイアウト ${kinds} 種`)
    + row('演出', `加工 ${cuts.filter(c => c.treat && c.treat !== 'none').length}・背景 ${new Set(cuts.map(c => c.bg).filter(b => b && b !== 'none')).size}種・カメラ ${cuts.filter(c => c.cam && c.cam !== 'push').length}`);
}
let toastTimer = 0;
function toast(m, cols) {
  const el = $('toast'); if (!el) return;
  el.innerHTML = escapeHtml(m) + (cols ? `<span class="swatches">${swatchHTML(cols)}</span>` : '');
  el.hidden = false; el.classList.remove('out'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); toastTimer = setTimeout(() => { el.hidden = true; }, 260); }, 1700);
}

/* ---------------- かんたん / 詳細 ---------------- */
// Share light-dismiss across static and dynamically created dialogs/drawers.
// Require the gesture to start outside too, so dragging controls out does not dismiss.
function initOutsideDismiss() {
  let pressed=null;
  const outside=(dialog,e)=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
  const panelTargets=e=>({
    settings:S.settingsOpen&&!e.target.closest('#settingsDrawer,#modeEasy,#modePro'),
    source:S.sourceOpen&&$('app').classList.contains('compact-ui')&&!e.target.closest('.col-left')
  });
  document.addEventListener('pointerdown',e=>{
    pressed=null;if(e.button!==0)return;
    const dialog=e.target.closest('dialog[open]');
    if(dialog){if(e.target===dialog&&outside(dialog,e))pressed={dialog};return;}
    if(document.querySelector('dialog[open]'))return;
    pressed=panelTargets(e);
  },true);
  document.addEventListener('pointercancel',()=>{pressed=null;},true);
  document.addEventListener('click',e=>{
    const start=pressed;pressed=null;if(!start)return;
    if(start.dialog){
      const dialog=start.dialog;
      if(dialog.open&&e.target===dialog&&outside(dialog,e)){
        e.preventDefault();e.stopImmediatePropagation();
        // Use the existing Escape/cancel guards and close cleanup (no Apply/Save).
        if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close('cancel');
      }
      return;
    }
    if(document.querySelector('dialog[open]'))return;
    const end=panelTargets(e);
    if(start.settings&&end.settings){S.settingsOpen=false;syncSettingsDrawer();}
    if(start.source&&end.source){S.sourceOpen=false;syncSourceDrawer();}
  },true);
}
function syncSourceDrawer() {
  const compact=$('app').classList.contains('compact-ui'),panel=document.querySelector('.col-left');
  panel.classList.toggle('source-open',compact&&!!S.sourceOpen);
  for(const [id,tab]of [['sourceForeground','foreground'],['sourceLyrics','lyrics'],['sourceMedia','media']]){
    $(id).setAttribute('aria-expanded',String(!compact||!!S.sourceOpen&&S.sourceTab===tab));
  }
  $('closeSourceDrawer').setAttribute('aria-label',J.mediaLabel('素材設定を閉じる','Close source settings'));
  $('sourceDrawerTitle').textContent=J.mediaLabel(...({foreground:['前景','Foreground'],lyrics:['歌詞・曲','Lyrics / Audio'],media:['背景','Background']}[S.sourceTab]||['歌詞・曲','Lyrics / Audio']));
}
function selectSourceDrawer(tab) {
  if($('app').classList.contains('compact-ui')){
    S.sourceOpen=!(S.sourceOpen&&S.sourceTab===tab);
    if(S.sourceOpen){S.settingsOpen=false;syncSettingsDrawer();}
  }
  cancelAreaEditor();S.sourceTab=tab;syncSourceTab();
  if(tab!=='lyrics'){renderMediaList();renderMediaLines();}
  syncSourceDrawer();
}
function positionSettingsDrawer() {
  const top=Math.max(0,document.querySelector('.bar').getBoundingClientRect().bottom);
  $('app').style.setProperty('--settings-top',Math.min(top,innerHeight-100)+'px');
}
function syncSettingsDrawer() {
  const open=!!S.settingsOpen;
  $('settingsDrawer').hidden=!open;
  $('app').classList.toggle('settings-open',open);
  for(const [id,mode] of [['modeEasy','easy'],['modePro','pro']]){
    const active=open&&S.mode===mode;$(id).setAttribute('aria-expanded',String(active));$(id).setAttribute('aria-pressed',String(active));
  }
  $('settingsDrawerTitle').textContent=S.mode==='easy'?J.mediaLabel('かんたん','Easy'):J.mediaLabel('詳細','Details');
  $('closeSettingsDrawer').setAttribute('aria-label',J.mediaLabel('設定を閉じる','Close settings'));
  positionSettingsDrawer();
}
function toggleSettingsDrawer(mode) {
  S.settingsOpen=!(S.settingsOpen&&S.mode===mode);if(S.settingsOpen){S.sourceOpen=false;syncSourceDrawer();}setMode(mode);
}
function setMode(m) {
  S.mode = m === 'easy' ? 'easy' : 'pro';
  const easy = S.mode === 'easy';
  $('app').classList.toggle('is-easy', easy);
  $('easyPanel').hidden = !easy;
  $('modeEasy').setAttribute('aria-pressed', String(easy));
  $('modePro').setAttribute('aria-pressed', String(!easy));
  try { localStorage.setItem('jizura.mode', S.mode); } catch (e) {}
  syncSettingsDrawer();
  if (easy) { showNow(); syncOut(); codecNote(); }
  sizeViewport(); drawTimeline(); loadThumbFonts();
}

/* ---------------- fx tab ---------------- */
const FX = [['motion', '動きの強さ'], ['glitch', 'グリッチ'], ['chroma', '色ズレ'], ['decor', '装飾の量'], ['density', 'カットの細かさ'], ['texture', '質感'], ['bgSwitch', '背景の切替']];
function renderFx() {
  const box = $('fxSliders'); box.innerHTML = '';
  FX.forEach(([k, label]) => {
    const row = document.createElement('div'); row.className = 'slider';
    const v = S.project.fx[k] ?? 0.5;
    row.innerHTML = `<label for="fx_${k}">${label}</label><input id="fx_${k}" type="range" min="0" max="1" step="0.01" value="${v}"><output>${Math.round(v * 100)}</output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { S.project.fx[k] = +inp.value; if (k === 'density') for (const ov of Object.values(S.project.overrides || {})) delete ov.divisionDensity; S.project.mood = null; out.textContent = Math.round(inp.value * 100); markUndoGroup(`fx:${k}`); replanSoon(120); });
    box.appendChild(row);
  });
  $('fxFlash').checked = !!S.project.fx.flash;
  $('fxKoma').value = String(J.komaOf(S.project.fx));
  $('fxHud').value = S.project.fx.hud || 'auto';
  $('seed').value = S.project.seed;
}

/* ---------------- techniques in the lyrics tab ---------------- */
const GROUPS = [['layout', 'レイアウト'], ['enter', '登場'], ['hold', '保持'], ['exit', '退場'], ['decor', '装飾'], ['treat', '文字の加工'], ['bg', '背景'], ['cam', 'カメラ'], ['fx', '画面効果'], ['trans', 'カット間のつなぎ']];
const openGroups = new Set();
function techItems(g) { return J.order(g).filter(k => J.registry(g)[k] && !J.registry(g)[k].special); }
function renderTech() {
  const lyricEffects = J.lyricEffectSettings(S.project);
  $('lyricAutoPlacement').checked = lyricEffects.autoPlacement;
  $('lyricAvoidForeground').checked = lyricEffects.avoidForeground;
  // 「画面中央を避ける」 (詳細 > 歌詞) and 「歌詞が画面中央を避ける」 (かんたん) are the same setting.
  for (const input of document.querySelectorAll('.avoid-center-toggle')) input.checked = lyricEffects.avoidCenter && lyricEffects.autoPlacement;
  $('lyricAvoidCenter').disabled = !lyricEffects.autoPlacement;
  $('lyricGroupAvoidanceStrength').value = lyricEffects.lyricAvoidanceStrength;
  $('lyricGroupAvoidanceStrengthValue').textContent = lyricEffects.lyricAvoidanceStrength.toFixed(2);
  $('lyricAvoidanceStrength').value = lyricEffects.avoidanceStrength;
  $('lyricAvoidanceStrengthValue').textContent = lyricEffects.avoidanceStrength.toFixed(2);
  $('lyricAvoidanceStrength').disabled = !lyricEffects.autoPlacement || !lyricEffects.avoidForeground;
  $('lyricRandomBlend').checked = lyricEffects.randomBlend;
  $('lyricRandomOpacity').checked = lyricEffects.randomOpacity;
  $('lyricOpacityRange').hidden = !lyricEffects.randomOpacity;
  $('lyricOpacityMin').value = lyricEffects.opacityMin;
  $('lyricOpacityMax').value = lyricEffects.opacityMax;
  const box = $('techLists'); box.innerHTML = '';
  const q = ($('techFilter').value || '').trim().toLowerCase();
  const matches=J.detailSearchQuery(q);
  let total = 0, onAll = 0;
  GROUPS.forEach(([g, label]) => {
    const tbl = J.registry(g), items = techItems(g), en = S.project.enabled[g] || (S.project.enabled[g] = {});
    const shown = items.filter(k => matches(tbl[k].name+' '+k));
    const onN = items.filter(k => en[k] !== false).length;
    total += items.length; onAll += onN;
    if (q && !shown.length) return;
    const d = document.createElement('details'); d.className = 'tgroup';
    d.open = !!q || openGroups.has(g);
    d.addEventListener('toggle', () => { if (d.open) openGroups.add(g); else openGroups.delete(g); });
    d.innerHTML = `<summary><span class="tg-name">${label}</span><span class="tg-cnt mono">${onN}/${items.length}</span></summary><div class="tg-tools"><button class="ghost small" data-a="on">すべてON</button><button class="ghost small" data-a="off">すべてOFF</button><button class="ghost small" data-a="flip">反転</button></div>`;
    const list = document.createElement('div'); list.className = 'checks';
    shown.forEach(k => {
      const l = document.createElement('label');
      l.title = k + (tbl[k].tags && tbl[k].tags.length ? '（' + tbl[k].tags.map(t => (J.MOODS[t] ? J.MOODS[t].name : t)).join('・') + '）' : '');
      if (!J.randomOk(S.project, g, k)) { l.classList.add('set-off'); l.title += tbl[k].set ? J.mediaLabel('（演出セットがオフ）',' (Part set is off)') : tbl[k].extra && S.project.extra !== true ? '（追加分がオフのため、自動では選ばれません）' : '（和風の演出がオフのため、自動では選ばれません）'; }
      l.innerHTML = `<input type="checkbox" ${en[k] !== false ? 'checked' : ''}> ${escapeHtml(tbl[k].name)}${setBadges(tbl[k])}`;
      l.querySelector('input').addEventListener('change', e => { en[k] = e.target.checked; S.project.mood = null; d.querySelector('.tg-cnt').textContent = `${items.filter(x => en[x] !== false).length}/${items.length}`; replanSoon(60); });
      l.appendChild(J.effectPreviewButton(g,k));
      list.appendChild(l);
    });
    d.querySelectorAll('.tg-tools button').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      shown.forEach(k => { en[k] = a === 'on' ? true : a === 'off' ? false : en[k] === false; });
      // keep a fallback so the planner always has something to use
      if (g === 'layout' && !items.some(k => en[k] !== false)) en.center = true;
      if (g === 'enter') en.cut = true; if (g === 'exit') en.cut = true; if (g === 'hold') en.still = true;
      if (g === 'treat') en.none = true; if (g === 'bg') en.none = true; if (g === 'cam') en.push = true;
      S.project.mood = null; openGroups.add(g); renderTech(); replan();
    }));
    d.appendChild(list);
    box.appendChild(d);
  });
  $('techTotal').textContent = `${onAll}/${total}`;
}

/* ---------------- output tab ---------------- */
const shortExportActive=()=>$('exportSettings').parentElement.id==='exportDialogContent'&&S.exportKind==='short';
const activeExportProject=()=>shortExportActive()?J.shortExportProject(S.project):S.project;
let shortPreview=null;
const shortPreviewAudio={...AP,ctx:null,src:null,startAt:0};
const shortPreviewHasAudio=()=>!!S.audio?.buffer&&S.project.includeAudio!==false;
function playShortPreviewAudio(){
  const p=shortPreview;if(!p)return;
  shortPreviewAudio.stop();p.audioClock=shortPreviewHasAudio();p.clock=performance.now()-p.t*1000;
  if(p.audioClock)shortPreviewAudio.play(S.audio.buffer,p.t,J.shortExportRange(S.plan,S.project.shortExport).end);
}
function syncShortPreviewMarkers(){
  const p=shortPreview,time=p?Math.round(p.t*1000)/1000:0,disabled=!!S.exporting||!p?.ready||!shortRangeValid();
  $('shortSetStart').disabled=disabled||time>=S.plan.duration;
  $('shortSetEnd').disabled=disabled||time<=0;
}
function setShortBoundary(id){
  const p=shortPreview;if(!p?.ready||S.exporting)return;
  const duration=S.plan.duration,gap=Math.min(.001,duration),time=J.clamp(Math.round(p.t*1000)/1000,0,duration);
  if(id==='shortStart'){
    if(time>=duration)return;
    $('shortEnd').value=String(Math.max(Number($('shortEnd').value),Math.min(duration,time+gap)));
  }else{
    if(time<=0)return;
    $('shortStart').value=String(Math.min(Number($('shortStart').value),Math.max(0,time-gap)));
  }
  $(id).value=String(time);syncShortRange();updateShortExport();prepareShortPreview(time);
}
function shortRangeValid(){
  try{
    if(!$('shortStartValue').checkValidity()||!$('shortEndValue').checkValidity())throw new Error(J.mediaLabel('開始・終了を動画の範囲内で指定してください。','Choose a start and end within the video.'));
    J.shortExportRange(S.plan,S.project.shortExport);$('shortExportError').textContent=shortPreview?.error||'';return true;
  }
  catch(error){$('shortExportError').textContent=error.message;return false;}
}
function pauseShortPreview(){
  if(!shortPreview)return;
  shortPreview.playing=false;
  shortPreviewAudio.stop();shortPreview.audioClock=false;
  for(const asset of J.mediaAssets.values())if(asset.type==='video')asset.element.pause();
  $('shortPreviewPlay').textContent='▶';$('shortPreviewPlay').setAttribute('aria-label',J.mediaLabel('プレビューを再生','Play preview'));
}
function stopShortPreview(){
  if(!shortPreview)return;
  pauseShortPreview();shortPreview.controller?.abort();cancelAnimationFrame(shortPreview.raf);shortPreview=null;
}
async function prepareShortPreview(time,play=false){
  const p=shortPreview;if(!p||S.exporting)return;p.plan=S.plan;
  if(!shortRangeValid()){pauseShortPreview();p.controller?.abort();return;}
  pauseShortPreview();p.controller?.abort();const controller=new AbortController();p.controller=controller;p.ready=false;p.error='';
  const range=J.shortExportRange(S.plan,S.project.shortExport);
  p.t=play&&(time<range.start||time>=range.end)?range.start:J.clamp(time,0,S.plan.duration);p.plan=S.plan;syncShortPreviewMarkers();
  $('shortPreviewTime').textContent=J.fmtTime(p.t);$('shortPreviewSeek').value=String(p.t);
  try{
    // Resume in the original button gesture, before waiting for video seeks,
    // so audio can start on iOS after the selected frame is ready.
    let audioReady=Promise.resolve();
    if(play&&shortPreviewHasAudio()){
      if(!shortPreviewAudio.ctx)shortPreviewAudio.ctx=new (window.AudioContext||window.webkitAudioContext)();
      if(shortPreviewAudio.ctx.state==='suspended')audioReady=shortPreviewAudio.ctx.resume();
    }
    await Promise.all([J.prepareMediaFrame(p.plan,Math.min(p.t,Math.max(0,p.plan.duration-.001)),controller.signal),audioReady]);
    if(shortPreview!==p||controller.signal.aborted)return;
    p.ready=true;p.need=true;p.playing=play;p.clock=performance.now()-p.t*1000;
    if(play)playShortPreviewAudio();
    $('shortExportError').textContent='';
    syncShortPreviewMarkers();
    $('shortPreviewPlay').textContent=play?'❚❚':'▶';$('shortPreviewPlay').setAttribute('aria-label',J.mediaLabel(play?'プレビューを一時停止':'プレビューを再生',play?'Pause preview':'Play preview'));
  }catch(error){if(shortPreview===p&&!controller.signal.aborted){p.error=error.message;$('shortExportError').textContent=error.message;pauseShortPreview();}}
  finally{if(p.controller===controller)p.controller=null;}
}
function startShortPreview(){
  stopShortPreview();if(!shortExportActive())return;
  const p=shortPreview={renderer:new J.Renderer(),portrait:new J.ShortFrameRenderer(),source:document.createElement('canvas'),t:S.project.shortExport.start,plan:S.plan,ready:false,need:true,playing:false};
  const tick=now=>{
    if(shortPreview!==p)return;p.raf=requestAnimationFrame(tick);if(S.exporting)return;
    if(p.plan!==S.plan){prepareShortPreview(p.t);return;}
    if(!p.ready)return;
    if(p.playing){
      const range=J.shortExportRange(S.plan,S.project.shortExport);p.t=Math.max(range.start,p.audioClock?shortPreviewAudio.time():(now-p.clock)/1000);
      if(p.t>=range.end){p.t=range.start;playShortPreviewAudio();}
      J.syncMediaPreview(S.plan,p.t,true);p.need=true;
    }
    if(!p.need||p.playing&&now-(p.lastDraw??-Infinity)<1000/Math.min(30,S.plan.fps)-1)return;
    p.need=false;p.lastDraw=now;
    try{
      const canvas=$('shortExportPreview'),fit=Math.min(canvas.width/S.plan.W,canvas.height/S.plan.H),sw=Math.max(1,Math.round(S.plan.W*fit)),sh=Math.max(1,Math.round(S.plan.H*fit));
      if(p.source.width!==sw||p.source.height!==sh){p.source.width=sw;p.source.height=sh;}
      p.renderer.frame(p.source.getContext('2d',{alpha:false}),S.plan,Math.min(p.t,Math.max(0,S.plan.duration-.001)),{scale:sw/S.plan.W});
      p.portrait.frame(canvas.getContext('2d',{alpha:false}),p.source,S.project.shortExport);
      $('shortPreviewTime').textContent=J.fmtTime(p.t);$('shortPreviewSeek').value=String(p.t);
      syncShortPreviewMarkers();
    }catch(error){p.error=error.message;$('shortExportError').textContent=error.message;pauseShortPreview();}
  };
  p.raf=requestAnimationFrame(tick);prepareShortPreview(p.t);
}
function syncShortRange(fromSliders=true){
  if(fromSliders){
    $('shortStartValue').value=Number($('shortStart').value).toFixed(3);$('shortEndValue').value=Number($('shortEnd').value).toFixed(3);
  }else{
    for(const [slider,input] of [['shortStart','shortStartValue'],['shortEnd','shortEndValue']])if(Number.isFinite($(input).valueAsNumber))$(slider).value=String($(input).valueAsNumber);
  }
  const duration=S.plan.duration,start=Number($('shortStart').value),end=Number($('shortEnd').value);
  $('shortRange').style.setProperty('--range-start',`${start/duration*100}%`);
  $('shortRange').style.setProperty('--range-end',`${end/duration*100}%`);
}
function initShortExport(){
  const s=J.shortExportSettings(S.project.shortExport),duration=S.plan.duration;
  if(s.start>=duration||s.end!=null&&(s.end<=s.start||s.end>duration)){s.start=0;s.end=null;}
  S.project.shortExport=s;
  $('shortStart').max=$('shortEnd').max=String(duration);
  $('shortStartValue').max=$('shortEndValue').max=String(duration);
  $('shortStartValue').value=String(s.start);$('shortEndValue').value=String(s.end??duration);syncShortRange(false);
  $('shortFill').value=s.mode;$('shortBlur').value=String(s.blur);$('shortBlurValue').value=String(s.blur);$('shortRes').value=String(s.res);
  $('shortExportError').textContent='';
  $('shortPreviewPlay').disabled=$('shortPreviewSeek').disabled=false;
  $('shortPreviewSeek').min='0';$('shortPreviewSeek').max=String(duration);
}
function updateShortExport(rangeChanged=false){
  const start=$('shortStartValue').value,end=$('shortEndValue').value;
  S.project.shortExport={start:start===''?NaN:Number(start),end:end===''?NaN:Number(end),mode:$('shortFill').value,blur:Number($('shortBlur').value),res:Number($('shortRes').value)};
  $('shortBlurValue').value=$('shortBlur').value;
  syncShortRange(false);
  const valid=shortRangeValid();$('shortPreviewPlay').disabled=$('shortPreviewSeek').disabled=!valid;
  if(!valid){pauseShortPreview();shortPreview?.controller?.abort();syncShortPreviewMarkers();}
  else{
    $('shortPreviewSeek').min='0';$('shortPreviewSeek').max=String(S.plan.duration);
    if(rangeChanged)prepareShortPreview(S.project.shortExport.start);else if(shortPreview)shortPreview.need=true;
  }
  syncQuality();codecNote();autosave();
}
function syncExportSettingsVisibility() {
  const inDialog=$('exportSettings').parentElement.id==='exportDialogContent';
  const short=shortExportActive(),mp4=!inDialog||S.exportKind==='mp4'||short,transparent=inDialog&&S.exportKind==='pnga';
  $('shortExportOptions').hidden=!short;
  $('shortExportDescription').hidden=!short;
  for(const id of ['outAspect','outRes','outVideoSize'])$(id).closest('label').hidden=short;
  for(const id of ['outVideoWidth','outVideoHeight'])$(id).closest('label').hidden=short||$('outVideoSize').value!=='custom';
  $('outQuality').closest('label').hidden=!mp4;
  $('outAudio').closest('label').hidden=!inDialog||!mp4;
  $('outBitrate').closest('label').hidden=!mp4||S.project.quality!=='custom';
  $('outQP').closest('label').hidden=$('outQPNote').hidden=!mp4||S.project.quality!=='qp';
  $('outKey').closest('label').hidden=transparent||short;
  $('exportSettings').querySelector('.key-note').hidden=transparent||short;
  $('codecNote').hidden=!mp4;
}
function syncQuality() {
  const project=activeExportProject();
  const names={standard:J.mediaLabel('標準','Standard'),high:J.mediaLabel('高','High'),max:J.mediaLabel('最高','Maximum'),custom:J.mediaLabel('任意ビットレート','Custom bitrate'),qp:J.mediaLabel('画質優先（QP指定）','Quality priority (QP)')};
  for(const option of $('outQuality').options){
    if(option.value==='qp'){option.textContent=names.qp;continue;}
    let rate;try{rate=J.videoBitrate(project,option.value);}catch{rate=null;}
    option.textContent=names[option.value]+(rate==null?'':` (${+(rate/1e6).toFixed(3)} Mbps)`);
  }
  $('outBitrate').value=String((S.project.exportBitrate ?? J.videoBitrate(project,'high'))/1e6);
  $('outQP').value=String(S.project.exportQP ?? 12);
  syncExportSettingsVisibility();
}
function syncOut() {
  $('outAspect').value = S.project.aspect; $('outRes').value = String(S.project.res); $('outFps').value = String(S.project.fps);
  $('eAspect').value = S.project.aspect; $('eRes').value = String(S.project.res); $('eFps').value = String(S.project.fps);
  const size = S.project.videoSize;
  const preset = size ? `${size.w}x${size.h}` : 'legacy';
  for (const id of ['out', 'e']) {
    const selector = $(`${id}VideoSize`);
    selector.value = S.project.videoSizeMode === 'custom' ? 'custom' : [...selector.options].some(option => option.value === preset) ? preset : 'custom';
    if (!size) selector.value = 'legacy';
    $(`${id}VideoWidth`).value = size ? size.w : J.outputSize(S.project)[0];
    $(`${id}VideoHeight`).value = size ? size.h : J.outputSize(S.project)[1];
    $(`${id}VideoWidth`).closest('label').hidden = selector.value !== 'custom';
    $(`${id}VideoHeight`).closest('label').hidden = selector.value !== 'custom';
  }
  for (const id of ['outAspect', 'outRes', 'eAspect', 'eRes']) $(id).disabled = !!size;
  $('outQuality').value = S.project.quality || 'high'; $('outAudio').checked = S.project.includeAudio !== false;
  syncQuality();
  const k = J.keyMode(S.project) || 'off';
  $('outKey').value = k; $('eKey').value = k;
  const kb = $('keyBadge');
  kb.hidden = k === 'off';
  if (k !== 'off') kb.innerHTML = `<i style="background:${J.KEY_BG[k]}"></i>${k === 'green' ? 'グリーンバック' : 'ブラックバック'}`;
}
let codecNoteVersion=0;
async function codecNote() {
  const version=++codecNoteVersion,isQP=S.project.quality==='qp';
  const project=activeExportProject(),[w, h] = J.outputSize(project);
  let bitrate;try{if(isQP)J.videoQuantizer(project);else bitrate=J.videoBitrate(project);}catch(err){$('codecNote').textContent=err.message;$('btnMP4').disabled=true;$('btnShort').disabled=true;return;}
  const vc = await J.pickVideoCodec(w, h, S.project.fps, bitrate,{bitrateMode:isQP?'quantizer':'variable'});
  if(version!==codecNoteVersion||S.exporting)return;
  $('codecNote').textContent = vc ? `このブラウザでは ${vc.label} で書き出します（${w}×${h} / ${S.project.fps}fps）。書き出し中はタブを開いたままにしてください。` : 'このブラウザは動画エンコード（WebCodecs）に対応していません。Chrome / Edge の最新版で開くか、連番PNGを使ってください。';
  $('btnMP4').disabled = !vc;
  $('btnShort').disabled=!vc||shortExportActive()&&!shortRangeValid();
  if(!vc&&isQP)$('codecNote').textContent=J.mediaLabel('このブラウザは画質優先（QP指定）に対応していません。別の画質設定または連番PNGを使用してください。','This browser does not support QP encoding. Choose another quality setting or a PNG sequence.');
}
const EXP_BTNS = ['btnMP4', 'btnShort', 'btnPNG', 'btnPNGA'];
function openExportDialog(kind) {
  if (S.exporting) return;
  pause();
  const mp4 = kind === 'mp4'||kind==='short';
  S.exportKind = kind;
  $('exportDlg').classList.toggle('short-export-dialog',kind==='short');
  if(kind==='short')initShortExport();
  $('exportFilename').value = baseName() + (kind==='short'?'_short.mp4':mp4 ? '.mp4' : kind === 'pnga' ? '_alpha_png.zip' : '_png.zip');
  $('exportDlgTitle').textContent = J.mediaLabel(mp4 ? 'MP4 を書き出す' : kind === 'pnga' ? '透過PNG（ZIP・背景なし）' : '連番PNG（ZIP）', mp4 ? 'Export MP4' : kind === 'pnga' ? 'Transparent PNG (ZIP)' : 'PNG sequence (ZIP)');
  if(kind==='short')$('exportDlgTitle').textContent=J.mediaLabel('ショート用出力','Export for Shorts');
  $('exportDialogContent').appendChild($('exportSettings'));
  for (const [id,type] of [['btnMP4','mp4'],['btnShort','short'],['btnPNG','png'],['btnPNGA','pnga']]) $(id).hidden = kind !== type;
  syncOut();codecNote(); $('exportDlg').showModal();
  if(kind==='short')startShortPreview();
}
function restoreExportSettings() {
  stopShortPreview();
  $('exportDlg').classList.remove('short-export-dialog');
  $('exportSettingsHome').appendChild($('exportSettings'));
  $('btnShort').hidden=true;
  for (const id of ['btnMP4','btnPNG','btnPNGA','codecNote']) $(id).hidden = false;
  syncQuality();codecNote();syncMainMediaPreview();S.need=true;
}
function baseName() {
  const k = J.keyMode(S.project);
  const name = S.project.projectName?.trim() || S.project.title || 'jizura';
  return (name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'jizura') + (k ? (k === 'green' ? '_greenback' : '_blackback') : '');
}
// 「ファイル名に日時を追加」: _yyyyMMddHHmm (local time) before the extension; the choice is remembered here.
const fileStamp = (d = new Date()) => '_' + [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].map((v, i) => String(v).padStart(i ? 2 : 4, '0')).join('');
function withFileStamp(filename) { const dot = filename.lastIndexOf('.'); return filename.slice(0, dot) + fileStamp() + filename.slice(dot); }
function syncFilenamePreview() {
  const ext = $('filenameDlg').dataset.ext || '.jizuraichi', name = J.exportFilename($('saveFilename').value, ext, baseName());
  $('saveFilenamePreview').textContent = $('saveFilenameDate').checked ? J.mediaLabel('保存名：', 'Saved as: ') + withFileStamp(name) : '';
}
// Resolves { filename, name }: the file name to write, and its name without extension or added date.
function requestFilename(kind) {
  const dlg = $('filenameDlg'), project = kind === 'project' || kind === 'settings', ext = project ? '.jizuraichi' : '.json';
  $('filenameDlgTitle').textContent = J.mediaLabel(project ? 'プロジェクトを保存' : 'AE用に書き出し', project ? 'Save project' : 'Export for AE');
  if (kind === 'settings') $('filenameDlgTitle').textContent = J.mediaLabel('設定のみ書き出し', 'Export settings only');
  // A saved project's name is the next project save's default.
  const saved = kind === 'project' && S.project.projectName ? S.project.projectName : '';
  $('saveFilename').value = (saved || baseName() + (kind === 'settings' ? '_settings' : '') + (project ? '' : '_ae')) + ext;
  dlg.dataset.ext = ext;
  try { $('saveFilenameDate').checked = localStorage.getItem('jizura.filenameDate') === 'true'; } catch (e) {}
  syncFilenamePreview();
  dlg.returnValue = ''; dlg.showModal(); $('saveFilename').select();
  return new Promise(resolve=>dlg.addEventListener('close',()=>{
    if (dlg.returnValue !== 'save') { resolve(null); return; }
    const plain = J.exportFilename($('saveFilename').value, ext, baseName());
    try { localStorage.setItem('jizura.filenameDate', String($('saveFilenameDate').checked)); } catch (e) {}
    resolve({ filename: $('saveFilenameDate').checked ? withFileStamp(plain) : plain, name: plain.slice(0, -ext.length) });
  },{once:true}));
}
function confirmHiddenLayers() {
  return !['foreground','lyrics','media'].some(layer=>S.project.layerVisibility?.[layer]===false) || window.confirm(J.mediaLabel('非表示のレイヤーは書き出しに含まれません。よろしいですか？','Hidden layers will not be included in the export. Continue?'));
}
async function runExport(kind) {
  if (S.exporting) return;
  if (!$('exportDlg').open || S.exportKind !== kind) { openExportDialog(kind); return; }
  const mp4=kind==='mp4'||kind==='short';
  if(mp4&&S.project.quality==='custom'&&!$('outBitrate').reportValidity())return;
  if(mp4&&S.project.quality==='qp'&&!$('outQP').reportValidity())return;
  if(kind==='short'&&(!$('shortStartValue').reportValidity()||!$('shortEndValue').reportValidity()||!shortRangeValid()))return;
  if(!confirmHiddenLayers())return;
  const filename = J.exportFilename($('exportFilename').value, mp4 ? '.mp4' : '.zip', baseName());
  $('exportFilename').value = filename;
  pause();
  if(kind==='short')stopShortPreview();
  const ac = new AbortController(); S.exporting = ac;
  const settingsInputs = [...$('exportSettings').querySelectorAll('input,select'),...$('shortExportOptions').querySelectorAll('input,select,button'),$('outAudio'),$('exportFilename')].map(el=>[el,el.disabled]);
  settingsInputs.forEach(([el])=>{el.disabled=true;}); $('btnCloseExport').disabled = true;
  const boxes = [...document.querySelectorAll('.exp-box')];
  const setText = m => boxes.forEach(b => { b.querySelector('.exp-text').textContent = m; });
  const txt = { set textContent(m) { setText(m); }, get textContent() { return boxes[0].querySelector('.exp-text').textContent; } };
  boxes.forEach(b => { b.hidden = false; b.querySelector('.exp-bar').style.width = '0%'; });
  setText('準備中…');
  EXP_BTNS.forEach(id => { $(id).disabled = true; });
  const onProgress = (p, m) => { boxes.forEach(b => { b.querySelector('.exp-bar').style.width = (p * 100).toFixed(1) + '%'; }); setText(m); };
  const t0 = performance.now();
  let fileStream=null;
  try {
    // Ask while the export click still has user activation. Stream large MP4s
    // straight to this file instead of holding the whole movie in browser RAM.
    if(mp4&&typeof window.showSaveFilePicker==='function'){
      try{
        const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'MP4',accept:{'video/mp4':['.mp4']}}]});
        fileStream=await handle.createWritable();
      }catch(e){
        // Embedded pages can expose the API while disallowing its picker.
        if(e?.name!=='SecurityError')throw e;
      }
    }
    await J.ensureFonts(S.project.lyrics + (S.project.title || '') + (S.project.artist || '') + HUD_CHARS + J.drawingText(S.plan), J.fontsOfPlan(S.plan));
    if (mp4) {
      const r = await J.exportMP4({ plan: S.plan, project: activeExportProject(), audio: S.project.includeAudio !== false ? S.audio : null, quality: S.project.quality || 'high', onProgress, signal: ac.signal, fileStream,short:kind==='short'?{...S.project.shortExport}:null });
      fileStream=null;
      txt.textContent = `完成 ${(r.size / 1048576).toFixed(1)}MB・${r.codec}${r.audio ? ' + ' + r.audio.toUpperCase() : ''}・${((performance.now() - t0) / 1000).toFixed(0)}秒`;
      const res = r.saved?'saved':await J.saveFile(filename, r.blob);
      if (res === 'declined') txt.textContent += '（保存はキャンセルされました）';
    } else {
      const blob = await J.exportPNGZip({ plan: S.plan, project: S.project, transparent: kind === 'pnga', onProgress, signal: ac.signal });
      txt.textContent = `完成 ${(blob.size / 1048576).toFixed(1)}MB`;
      await J.saveFile(filename, blob);
    }
  } catch (e) {
    if(fileStream)try{await fileStream.abort();}catch{}
    if(ac.signal.aborted||e?.name==='AbortError'){txt.textContent=J.mediaLabel('キャンセルしました','Cancelled');return;}
    txt.textContent = 'エラー: ' + (e && e.message ? e.message : e);
    console.error(e);
  } finally {
    S.exporting = null; S.need = true;
    settingsInputs.forEach(([el,disabled])=>{el.disabled=disabled;}); $('btnCloseExport').disabled = false;
    EXP_BTNS.forEach(id => { $(id).disabled = false; });
    codecNote();
    if(kind==='short')startShortPreview();
  }
}

/* ---------------- tap sync ---------------- */
function startTap() {
  const layer = activeMediaLayer();
  if (!(layer ? J.mediaInsertChoices(S.project,layer).length : S.plan.lines.length)) return;
  pause();
  S.tap = { i: 0, layer, append: !!layer, fileIndex: 0, countingDown: true };
  if (!S.project.timing.lineTimes) S.project.timing.lineTimes = {};
  $('tapHint').textContent = J.mediaLabel('挿入したいタイミングでボタンをクリック（またはスペースキー）','Click the button (or press Space) at the moment you want to insert.');
  S.sourceOpen=false;S.settingsOpen=false;S.playheadMenu=null;closeTimelineCutMenu();syncSettingsDrawer();syncSourceDrawer();syncPlayheadMenu();
  $('tapPanel').hidden = false; syncTapButtons();sizeViewport();drawTimeline();drawTimelineLinks();
  if (S.tap.append && !S.audio) extendTapPreview(0);
  seek(0); updateTap();
  const session=S.tap,deadline=performance.now()+3000;
  const countdown=$('tapCountdown');countdown.hidden=false;
  $('tapStop').focus({preventScroll:true});
  const tick=()=>{
    if(S.tap!==session)return;
    const remaining=Math.ceil((deadline-performance.now())/1000);
    if(remaining<=0){
      session.countingDown=false;countdown.hidden=true;syncTapButtons();
      seek(0);play();$('tapBtn').focus({preventScroll:true});return;
    }
    countdown.textContent=J.mediaLabel(`開始まで ${remaining}`,`Starting in ${remaining}`);
    session.timer=setTimeout(tick,Math.min(1000,Math.max(1,deadline-performance.now())));
  };
  tick();sizeViewport();
}
function tapNow() {
  if (!S.tap || S.tap.countingDown) return;
  if (S.tap.append) {
    const i = S.tap.i;
    const m = S.project[S.tap.layer];
    if(!S.tap.nextItem)return;
    if (i === 0) {
      m.timing.lineTimes = {}; m.cutOverrides = {}; m.manualCuts = true;
      const prefix=S.tap.layer==='foreground'?'f:':'m:';
      S.project.timelineLinks=S.project.timelineLinks.filter(link=>!link.a.startsWith(prefix)&&!link.b.startsWith(prefix));
    }
    m.cutCount = i + 1;
    m.cutOverrides[i] = { itemId: S.tap.nextItem.id, technique: null };
    if(S.tap.nextItem.file)S.tap.fileIndex++;
    delete S.tap.nextItem;
    m.timing.lineTimes[i] = +S.t.toFixed(3);
    S.tap.i++;
    replan();
    if (S.tap.i >= 1000) { pause(); stopTap(); toast('カット数の上限に達しました'); }
    else updateTap();
    return;
  }
  const layer = S.tap.layer;
  (layer ? S.project[layer].timing : S.project.timing).lineTimes[S.tap.i] = +S.t.toFixed(3);
  S.tap.i++;
  replan();
  if (S.tap.i >= (layer ? S.plan[layer].cuts.length : S.plan.lines.length)) stopTap(); else updateTap();
}
function stopTap() { clearTimeout(S.tap?.timer); $('tapCountdown').hidden=true; S.tap = null; $('tapPanel').hidden = true; syncTapButtons(); replan(); }
function syncTapButtons() {
  $('tapBtn').disabled=!!S.tap?.countingDown;
  if(!S.tap)$('tapCountdown').hidden=true;
  for (const id of ['btnTap', 'btnTapMedia']) $(id).setAttribute('aria-pressed', String(!!S.tap));
}
function updateTap() {
  const lyricQueue=!S.tap.layer,rows=[$('tapLine').parentElement,$('tapLineAhead1').parentElement,$('tapLineAhead2').parentElement];
  for(const row of rows)for(const animation of row.getAnimations())animation.cancel();
  rows[1].hidden=rows[2].hidden=!lyricQueue;
  if (S.tap.append) {
    const m=S.project[S.tap.layer],order=J.mediaOrder(S.project,S.tap.layer);
    if(!S.tap.nextItem){
      const choices=J.mediaInsertChoices(S.project,S.tap.layer).filter(id=>id!=='files'||m.loop||S.tap.fileIndex<m.items.length);
      if(!choices.length){pause();stopTap();return;}
      const choice=choices[Math.floor(Math.random()*choices.length)];
      S.tap.nextItem=choice==='files'
        ? {id:m.items[S.tap.fileIndex % m.items.length].id,name:order[S.tap.fileIndex % order.length].name,file:true}
        : J.mediaCopyItems(S.tap.layer).find(item=>item.id===choice);
    }
    $('tapLine').textContent = `${S.tap.i + 1}. ${S.tap.nextItem.name}`; $('tapLine').title=S.tap.nextItem.name; return;
  }
  const ln = S.tap.layer ? S.plan[S.tap.layer].cuts[S.tap.i] : S.plan.lines[S.tap.i];
  $('tapLine').textContent = ln ? (S.tap.layer ? `${S.tap.i + 1}. ${ln.name}` : ln.text) : '—';
  if(lyricQueue){
    for(const offset of [1,2]){const line=S.plan.lines[S.tap.i+offset],el=$('tapLineAhead'+offset);el.textContent=line?.text || '';el.title=line?.text || '';}
    $('tapLine').title=ln?.text || '';
    if(S.tap.queueIndex!=null && S.tap.queueIndex!==S.tap.i && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      const height=rows[0].getBoundingClientRect().height,opacities=[1,.5,.22];
      rows.forEach((row,i)=>row.animate([{transform:`translateY(-${height}px)`,opacity:opacities[i+1]??0},{transform:'translateY(0)',opacity:opacities[i]}],{duration:220,easing:'ease-out'}));
    }
    S.tap.queueIndex=S.tap.i;
  }
}

function shuffleMediaEffects(layers = ['media', 'foreground']) {
  for (const layer of layers) for (const cut of S.plan[layer].cuts) {
    const ov = mediaCutOptions(layer, cut.index);
    if (!ov.lock && (ov.technique == null)) mediaOv(cut.index, { technique: null }, layer);
  }
}
const openMediaGroups = { foreground: new Set(), media: new Set() };
function renderMediaEffects(layer) {
  if (!layer) { for (const target of ['foreground', 'media']) renderMediaEffects(target); return; }
  const box = $(layer + 'EffectsPanel'); if (!box) return;
  const settings = J.mediaEffectSettings(S.project, layer), L = J.mediaLabel;
  const q=($(layer+'EffectFilter').value||'').trim(),matches=J.detailSearchQuery(q);
  const search=$(layer+'EffectFilter'),searchRow=search.closest('.row'),searchFocused=document.activeElement===search;
  const selection=[search.selectionStart,search.selectionEnd];
  // Retain the search input while rebuilding the panel; place it after settings.
  searchRow.remove();
  const layerNote = layer === 'foreground' ? L('前景の画像・動画に適用します。', 'Applies to foreground images and videos.') : L('背景の画像・動画に適用します。', 'Applies to background images and videos.');
  const shuffleLabel = layer === 'foreground' ? L('前景をシャッフル', 'Shuffle foreground') : L('背景をシャッフル', 'Shuffle background');
  const setting = key => box.querySelector(`[data-media-setting="${key}"]`);
  const action = key => box.querySelector(`[data-media-action="${key}"]`);
  box.innerHTML = `<p class="note">${layerNote} ${L('チェックした手法を「自動」とシャッフルで使用します。手動指定した手法とロック済みカットは維持されます。', 'Checked techniques are used by Auto and Shuffle. Explicit selections and locked cuts are preserved.')}</p><label class="check"><input data-media-setting="autoPlacement" type="checkbox" ${settings.autoPlacement !== false ? 'checked' : ''}><span>${L('配置・サイズにも自動で変化を付ける', 'Vary position and size automatically')}<small>${L('手動配置とロックは維持します。演出無しは中央に全体表示します。', 'Manual placement and locks are preserved. No effects keeps the centered full view.')}</small></span></label><div class="media-effect-sliders"></div><div class="row"><button type="button" data-media-action="shuffle">${shuffleLabel}</button><button type="button" data-media-action="enable">${L('全て有効', 'Enable all')}</button><button type="button" data-media-action="disable">${L('全て無効', 'Disable all')}</button></div>`;
  const randomNote = document.createElement('p'); randomNote.className = 'note';
  randomNote.textContent = L('「おまかせ」では前景・背景それぞれの手法チェックをランダムに設定します。', 'Randomize selects a random set of checked techniques independently for foreground and background.');
  box.appendChild(randomNote);
  const beatNote = document.createElement('p'); beatNote.className = 'note';
  beatNote.textContent = L('登場・退場はカットごとに独立して設定できます（初期値：自動）。BPM同期は「曲・タイミング」のBPMを使用し、未設定時は120 BPMで動きます。', 'Set entrance and exit independently for each cut (default: Auto). BPM sync uses the BPM in Audio and timing, or 120 BPM when unset.');
  box.appendChild(beatNote);
  for (const [key, name, max, step] of [['motion', L('動きの強さ', 'Motion intensity'), 2, .05], ['treatment', L('加工の強さ', 'Treatment intensity'), 1, .05], ['duration', L('登場・退場時間', 'Entrance / exit (s)'), 1.5, .05]]) {
    const row = document.createElement('label'); row.className = 'slider'; row.innerHTML = `<span>${name}</span><input data-media-setting="${key}" type="range" min="${key === 'duration' ? .05 : 0}" max="${max}" step="${step}" value="${settings[key]}"><output>${settings[key]}</output>`;
    row.querySelector('input').addEventListener('input', e => { const next = J.mediaEffectSettings(S.project, layer); next[key] = +e.target.value; S.project[layer].effects = next; row.querySelector('output').textContent = e.target.value; markUndoGroup('mediaEffects:' + layer + ':' + key); replanSoon(100); }); box.querySelector('.media-effect-sliders').appendChild(row);
  }
  box.appendChild(searchRow);
  const groups = MEDIA_EFFECT_GROUPS;
  for (const [group, name] of Object.entries(groups)) {
    const items = Object.entries(J.MEDIA_TECH).filter(([key, def]) => def.group === group && J.mediaTechAllowed(key, layer));
    const shown=items.filter(([key,def])=>matches(def.name+' '+key));
    if (!shown.length) continue;
    const count = enabled => `${items.filter(([key]) => enabled[key] !== false).length}/${items.length}`;
    const section = document.createElement('details'); section.className = 'tgroup media-tech-group'; section.dataset.mediaGroup = group;
    section.open = !!q || openMediaGroups[layer].has(group);
    section.addEventListener('toggle', () => {
      if (!section.isConnected) return;
      if (section.open) openMediaGroups[layer].add(group); else openMediaGroups[layer].delete(group);
    });
    section.innerHTML = `<summary><span class="tg-name">${name}</span><span class="tg-cnt mono">${count(settings.enabled)}</span></summary><div class="tg-tools"><button type="button" class="ghost small" data-media-group-action="on">${L('すべてON', 'Enable all')}</button><button type="button" class="ghost small" data-media-group-action="off">${L('すべてOFF', 'Disable all')}</button><button type="button" class="ghost small" data-media-group-action="flip">${L('反転', 'Invert')}</button></div>`;
    const list = document.createElement('div'); list.className = 'checks';
    for (const [key, def] of shown) {
      const row = document.createElement('label'); row.innerHTML = `<input type="checkbox" data-media-tech="${key}" ${settings.enabled[key] !== false ? 'checked' : ''}><span>${escapeHtml(def.name)}${setBadges(def)}</span>`;
      row.querySelector('input').addEventListener('change', e => {
        const next = J.mediaEffectSettings(S.project, layer); next.enabled[key] = e.target.checked; S.project[layer].effects = next;
        section.querySelector('.tg-cnt').textContent = count(next.enabled); replan();
      }); row.appendChild(J.effectPreviewButton('media',key,layer)); list.appendChild(row);
    }
    section.querySelectorAll('[data-media-group-action]').forEach(button => button.addEventListener('click', () => {
      const next = J.mediaEffectSettings(S.project, layer), action = button.dataset.mediaGroupAction;
      for (const [key] of shown) next.enabled[key] = action === 'on' ? true : action === 'off' ? false : next.enabled[key] === false;
      S.project[layer].effects = next; openMediaGroups[layer].add(group); renderMediaEffects(layer); replan();
    }));
    section.appendChild(list);
    box.appendChild(section);
  }
  {
    // Decorations for this layer, laid out like the technique groups; used when "Enable decorations" is on.
    const items = J.order('decor').filter(key => J.DECOR[key]).map(key => [key, J.DECOR[key]]);
    const shown=items.filter(([key,def])=>matches(def.name+' '+key));
    const count = s => `${items.filter(([key]) => J.mediaDecorOn(s, key)).length}/${items.length}`;
    const section = document.createElement('details'); section.className = 'tgroup media-tech-group'; section.dataset.mediaGroup = 'decor';
    section.open = !!q || openMediaGroups[layer].has('decor');
    section.addEventListener('toggle', () => { if (!section.isConnected) return; if (section.open) openMediaGroups[layer].add('decor'); else openMediaGroups[layer].delete('decor'); });
    section.innerHTML = `<summary><span class="tg-name">${L('装飾', 'Decoration')}</span><span class="tg-cnt mono">${count(settings)}</span></summary><p class="note">${L('「装飾を有効にする」がONのとき、チェックした装飾を「自動」の画像・動画で使います。背面の装飾は素材の下に描かれます。', 'With Enable decorations on, Auto images and videos use the checked decorations. Back decorations are drawn under the source.')}</p><div class="tg-tools"><button type="button" class="ghost small" data-media-group-action="on">${L('すべてON', 'Enable all')}</button><button type="button" class="ghost small" data-media-group-action="off">${L('すべてOFF', 'Disable all')}</button><button type="button" class="ghost small" data-media-group-action="flip">${L('反転', 'Invert')}</button></div>`;
    const list = document.createElement('div'); list.className = 'checks';
    for (const [key, def] of shown) {
      const row = document.createElement('label'); row.innerHTML = `<input type="checkbox" data-media-decor="${key}" ${J.mediaDecorOn(settings, key) ? 'checked' : ''}><span></span>`;
      row.querySelector('span').textContent = def.name + (def.layer === 'back' ? L('（背面）', ' (back)') : '');
      row.querySelector('span').insertAdjacentHTML('beforeend',setBadges(def));
      row.querySelector('input').addEventListener('change', e => {
        const next = J.mediaEffectSettings(S.project, layer); next.decorEnabled[key] = e.target.checked; S.project[layer].effects = next;
        section.querySelector('.tg-cnt').textContent = count(next); replan();
      }); row.appendChild(J.effectPreviewButton('decor', key)); list.appendChild(row);
    }
    section.querySelectorAll('[data-media-group-action]').forEach(button => button.addEventListener('click', () => {
      const next = J.mediaEffectSettings(S.project, layer), act = button.dataset.mediaGroupAction;
      for (const [key] of shown) next.decorEnabled[key] = act === 'on' ? true : act === 'off' ? false : !J.mediaDecorOn(next, key);
      S.project[layer].effects = next; openMediaGroups[layer].add('decor'); renderMediaEffects(layer); replan();
    }));
    section.appendChild(list); if(shown.length)box.appendChild(section);
  }
  setting('autoPlacement').onchange =e => { const next = J.mediaEffectSettings(S.project, layer); next.autoPlacement = e.target.checked; S.project[layer].effects = next; renderMediaEffects(layer); replan(); };
  {
    // Decorations (checked in this layer's Decoration group) on automatic media cuts; off by default.
    const row = document.createElement('label'); row.className = 'check';
    row.innerHTML = `<input type="checkbox" data-media-setting="decor" ${settings.decor ? 'checked' : ''}><span>${L('装飾を有効にする', 'Enable decorations')}<small>${L('「自動」の画像・動画に、下の「装飾」でチェックした装飾を付けます。', 'Adds the decorations checked below to Auto images and videos.')}</small></span>`;
    row.querySelector('input').onchange = e => { const next = J.mediaEffectSettings(S.project, layer); next.decor = e.target.checked; S.project[layer].effects = next; replan(); };
    setting('autoPlacement').closest('label').before(row);
  }
  if (layer === 'media') {
    // Dynamic framing: automatic backgrounds may also be masked into windows (circle, half, band…) that
    // the lyrics and foreground compose around, next to the plain zoom / pan patterns.
    const dynamic = document.createElement('label'); dynamic.className = 'check';
    dynamic.innerHTML = `<input type="checkbox" data-media-setting="dynamicBackground" ${settings.dynamicBackground !== false ? 'checked' : ''} ${settings.autoPlacement === false ? 'disabled' : ''}><span>${L('背景をダイナミックに配置', 'Dynamic background framing')}<small>${L('拡大縮小やマスク（円・半分・帯など）で背景を切り取り、歌詞・前景をそれに合わせて配置する候補を、自動配置の抽選に加えます。', 'Adds framings that mask the background into windows (circle, half, band…) with lyrics and foreground composed around them to the automatic placement lottery.')}</small></span>`;
    dynamic.querySelector('input').onchange = e => { const next = J.mediaEffectSettings(S.project, layer); next.dynamicBackground = e.target.checked; S.project[layer].effects = next; replan(); };
    setting('autoPlacement').closest('label').after(dynamic);
  }
  if (layer === 'media') {
    const row = document.createElement('label'); row.className = 'check';
    row.innerHTML = `<input type="checkbox" data-media-setting="applyLyricBackground" ${settings.applyLyricBackground !== false ? 'checked' : ''}><span>${L('歌詞の背景演出も適用', 'Apply lyric background effects')}</span>`;
    row.querySelector('input').onchange = e => { const next = J.mediaEffectSettings(S.project, layer); next.applyLyricBackground = e.target.checked; S.project[layer].effects = next; replan(); };
    box.prepend(row);
  }
  action('shuffle').onclick = () => { shuffleMediaEffects([layer]); S.project[layer].seed++; replan(); };
  const all = value => { const next = J.mediaEffectSettings(S.project, layer); next.enabled = Object.fromEntries(Object.keys(J.MEDIA_TECH).filter(key => J.mediaTechAllowed(key, layer)).map(key => [key, value])); S.project[layer].effects = next; renderMediaEffects(layer); replan(); };
  action('enable').onclick = () => all(true); action('disable').onclick = () => all(false);
  if(searchFocused){search.focus({preventScroll:true});search.setSelectionRange(...selection);}
}

/* ---------------- sync all inputs from project ---------------- */
function renderThemes() {
  const ids = J.themeIds(S.project), ct = J.normalizeColorTheme(S.project.colorTheme);
  $('themeLabels').innerHTML = ids.length ? ids.map(id=>`<span class="theme-label">${J.THEMES[id].name}</span>`).join('') : `<span class="muted">${J.mediaLabel('未選択：すべてのテーマ','Not selected: unrestricted')}</span>`;
  if (S.project.themeBalance === 'unified') {
    const chip = document.createElement('span'); chip.className = 'theme-label'; chip.textContent = J.mediaLabel('統一感重視', 'Unified look');
    $('themeLabels').prepend(chip);
  }
  if (J.colorThemeActive(S.project)) {
    const chip = document.createElement('span'); chip.className = 'theme-label theme-color-label';
    chip.textContent = J.mediaLabel('カラー：','Colour: ') + (ct.genre !== 'auto' ? J.COLOR_GENRES[ct.genre].name : '');
    if (ct.color) { const dot = document.createElement('i'); dot.style.background = ct.color; dot.title = ct.color; chip.append(dot); }
    $('themeLabels').append(chip);
  }
}
function syncUI() {
  renderThemes();
  $('songTitle').value = S.project.title || ''; $('songArtist').value = S.project.artist || ''; $('projectName').value = S.project.projectName || '';
  $('lyrics').value = S.project.lyrics;
  $('bpm').value = S.project.timing.bpm > 0 ? S.project.timing.bpm : '';
  $('bpm').placeholder = S.audio ? `自動 ${S.audio.bpm}` : 'なし';
  $('offset').value = S.project.timing.offset ?? 0.4;
  $('lineScale').value = S.project.timing.lineScale ?? 1;
  $('snap').checked = !!S.project.timing.snap;
  $('lyricLang').value = J.LANG_LABEL[S.project.lang] ? S.project.lang : 'auto'; langNote();
  renderFontRoles(); renderColors(); renderFx(); renderTech(); renderMediaEffects(); syncOut(); drawStyleGrid();
}

/* ---------------- wiring ---------------- */
function bind() {
  const storageWarning = document.createElement('p');
  storageWarning.id = 'mediaStorageWarning'; storageWarning.hidden = true;
  storageWarning.setAttribute('role', 'status');
  storageWarning.style.cssText = 'flex:0 0 100%;margin:0;padding:8px 12px;border:1px solid var(--amber);color:var(--amber);font-size:12px;white-space:normal';
  storageWarning.textContent = J.mediaLabel('ブラウザ内に素材を保存できないため、一時保存で編集中です。曲・素材は再読み込みで失われます。ページを閉じる前に素材入りプロジェクトを保存してください。', 'Browser storage is unavailable. Imported audio and media are kept only for this session and will be lost on reload. Save a project with assets before closing this page.');
  document.querySelector('#app > .bar').appendChild(storageWarning);
  window.addEventListener('jizura-media-storage', () => { storageWarning.hidden = !J.hasTemporaryMedia(); });
  window.addEventListener('jizura-media-poster',e=>{
    for(const img of document.querySelectorAll('img[data-media-thumb]'))if(img.dataset.mediaThumb===e.detail.id)img.src=e.detail.poster;
    S.need=true;
  });
  window.addEventListener('jizura-media-ready',()=>{S.need=true;});
  window.addEventListener('jizura-media-error',e=>toast(e.detail.message));
  window.addEventListener('beforeunload', event => {
    if (J.hasTemporaryMedia()) { event.preventDefault(); event.returnValue = ''; }
  });
  const frameToggle=$('showItemFrames');
  $('showItemFramesLabel').textContent=J.mediaLabel('編集モード','Edit mode');
  try {frameToggle.checked=localStorage.getItem('jizura.itemFrames')!=='false';}catch(e){}
  frameToggle.addEventListener('change',()=>{try{localStorage.setItem('jizura.itemFrames',String(frameToggle.checked));}catch(e){}S.need=true;drawItemFrames();});
  document.addEventListener('click',e=>{
    if(S.exporting || S.tap || document.querySelector('dialog[open]'))return;
    if(e.target.closest('.item-frame-toggle,#areaEditControls'))return;
    const inside=$('viewport').contains(e.target);
    if(!inside && S.areaEdit)cancelAreaEditor();
    if(frameToggle.checked!==inside){frameToggle.checked=inside;frameToggle.dispatchEvent(new Event('change'));}
  },true);
  $('itemFrames').addEventListener('click',e=>{
    if(S.playing)return;
    const button=e.target.closest('.item-frame-action');
    if(button){e.stopPropagation();performTimelineAction(button);if(S.areaEdit)showAreaDraft();return;}
    const target=e.target.closest('[data-select-layer]');if(!target)return;
    const layer=target.dataset.selectLayer,index=Number(target.dataset.selectIndex);
    if(layer==='lyrics')openAreaEditor(index,true);else openMediaEditor(index,layer,true);
  });

  $('saveFilename').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('filenameDlg').querySelector('button[value="save"]').click();}});
  const menus = [...document.querySelectorAll('.header-menu')];
  menus.forEach(menu => {
    menu.addEventListener('toggle', () => { if (menu.open) menus.forEach(other=>{if(other!==menu)other.open=false;}); });
    menu.addEventListener('click', e => { if (e.target.closest('button,a')) menu.open=false; });
  });
  document.addEventListener('click', e => menus.forEach(menu=>{if(!menu.contains(e.target))menu.open=false;}));
  document.addEventListener('keydown', e => {if(e.key==='Escape'&&!document.querySelector('dialog[open]')){const menu=menus.find(m=>m.open);if(menu){menu.open=false;menu.querySelector('summary').focus();}}});
  document.addEventListener('keydown', e => {if(e.key==='Escape')menus.forEach(menu=>{menu.open=false;});});
  ['fileProject','fileSettings'].forEach(id => J.configurePortableFileInput($(id)));
  $('fileProject').closest('label').addEventListener('keydown', e => {if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileProject').click();}});
  $('fileProject').addEventListener('change',()=>{$('projectMenu').open=false;});
  document.querySelectorAll('[data-export-dialog]').forEach(button=>button.addEventListener('click',()=>openExportDialog(button.dataset.exportDialog)));
  $('btnCloseExport').addEventListener('click',()=>{if(!S.exporting){stopShortPreview();$('exportDlg').close();}});
  $('exportDlg').addEventListener('cancel',e=>{if(S.exporting)e.preventDefault();else stopShortPreview();});
  $('exportDlg').addEventListener('close',restoreExportSettings);
  for(const id of ['shortStart','shortEnd'])$(id).addEventListener('input',()=>{
    const gap=Math.min(.001,S.plan.duration);
    if(id==='shortStart')$('shortStart').value=String(Math.min(Number($('shortStart').value),Number($('shortEnd').value)-gap));
    else $('shortEnd').value=String(Math.max(Number($('shortEnd').value),Number($('shortStart').value)+gap));
    syncShortRange();updateShortExport(true);
  });
  for(const id of ['shortStartValue','shortEndValue'])$(id).addEventListener('input',()=>updateShortExport(true));
  // Range endpoints and the playhead share one keyboard-accessible track.
  // Drag a circular endpoint to trim; elsewhere, click or drag to seek.
  const shortRange=$('shortRange');let rangeDrag=null;
  const moveShortRange=e=>{
    if(!rangeDrag||e.pointerId!==rangeDrag.pointer||$(rangeDrag.id).disabled)return;
    const rect=shortRange.getBoundingClientRect(),fraction=J.clamp((e.clientX-rect.left-10)/Math.max(1,rect.width-20),0,1),input=$(rangeDrag.id);
    input.value=String(fraction*S.plan.duration);input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  shortRange.addEventListener('pointerdown',e=>{
    if(e.button!==0||$('shortStart').disabled||$('shortEnd').disabled)return;
    e.preventDefault();
    const rect=shortRange.getBoundingClientRect(),time=J.clamp((e.clientX-rect.left-10)/Math.max(1,rect.width-20),0,1)*S.plan.duration;
    const startDistance=Math.abs(time-Number($('shortStart').value)),endDistance=Math.abs(time-Number($('shortEnd').value));
    const nearEndpoint=Math.min(startDistance,endDistance)/S.plan.duration*Math.max(1,rect.width-20)<=10&&Math.abs(e.clientY-rect.top-22)<=10;
    const id=nearEndpoint?(startDistance<endDistance?'shortStart':'shortEnd'):'shortPreviewSeek';
    rangeDrag={id,pointer:e.pointerId};$(id).focus({preventScroll:true});shortRange.setPointerCapture(e.pointerId);moveShortRange(e);
  });
  shortRange.addEventListener('pointermove',moveShortRange);
  const endRangeDrag=e=>{if(rangeDrag?.pointer===e.pointerId)rangeDrag=null;};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])shortRange.addEventListener(event,endRangeDrag);
  for(const id of ['shortFill','shortRes'])$(id).addEventListener('change',()=>updateShortExport());
  $('shortBlur').addEventListener('input',()=>updateShortExport());
  $('shortPreviewPlay').addEventListener('click',()=>{
    if(!shortPreview)return;
    if(shortPreview.playing||shortPreview.controller){shortPreview.controller?.abort();pauseShortPreview();}
    else prepareShortPreview(shortPreview.t,true);
  });
  $('shortPreviewSeek').addEventListener('input',e=>prepareShortPreview(Number(e.target.value)));
  $('shortSetStart').addEventListener('click',()=>setShortBoundary('shortStart'));
  $('shortSetEnd').addEventListener('click',()=>setShortBoundary('shortEnd'));
  document.fonts?.addEventListener('loadingdone',()=>{if(shortPreview)shortPreview.need=true;});
  // 統一感重視 / にぎやかさ重視: the note shows the side that is switched on.
  const themeBalanceNote = () => {
    const L = J.mediaLabel, unified = document.querySelector('#themesDlg input[name=themeBalance]:checked')?.value === 'unified';
    $('themeBalanceNote').textContent = unified
      ? L('おまかせで有効になる演出を絞り、同じ演出を連続して使いやすくします。1シーン内・空行で区切られた歌詞のまとまりの中では、同じ強調度の歌詞に同じ演出を使います。', 'Randomize switches on far fewer effects and favours repeating the same ones. Within a block (a One scene group, or lyrics between blank lines), lyrics of the same emphasis get the same effects.')
      : L('標準の挙動です。おまかせは幅広い演出を候補に入れ、カットごとに変化のあるにぎやかな見た目にします。', 'The standard behaviour. Randomize draws on a wide range of effects and varies them from cut to cut for a lively look.');
  };
  document.querySelectorAll('#themesDlg input[name=themeBalance]').forEach(input => input.addEventListener('change', themeBalanceNote));
  $('btnThemes').addEventListener('click', () => {
    const selected = new Set(J.themeIds(S.project));
    document.querySelector(`#themesDlg input[name=themeBalance][value=${S.project.themeBalance === 'unified' ? 'unified' : 'lively'}]`).checked = true;
    themeBalanceNote();
    $('themeChoices').innerHTML = ['genre','taste'].map(category => `<fieldset><legend>${J.mediaLabel(category === 'genre' ? '曲ジャンル' : 'テイスト',category === 'genre' ? 'Music genre' : 'Taste')}</legend>${Object.entries(J.THEMES).filter(([,t])=>t.category===category).map(([id,t])=>`<label class="check"><input type="checkbox" data-theme="${id}" ${selected.has(id)?'checked':''}><span>${t.name}<small>${t.description}</small></span></label>`).join('')}</fieldset>`).join('');
    // Colour: a genre and one theme colour for random palettes, taking priority over the themes above.
    const ct = J.normalizeColorTheme(S.project.colorTheme), L = J.mediaLabel, colors = document.createElement('fieldset'); colors.className = 'theme-colors';
    colors.innerHTML = `<legend>${L('カラー','Colour')}</legend><p class="note">${L('ランダム配色（おまかせ・「配色」ボタン）に使います。曲ジャンル・テイストによる配色より優先されます。','Used by random palettes (Randomize and the Colours button), taking priority over music-genre and taste themes.')}</p><label class="theme-color-row"><span>${L('配色ジャンル','Colour genre')}</span><select id="colorGenre"></select></label><small id="colorGenreNote" class="muted"></small><label class="check"><input type="checkbox" id="colorThemeOn"><span>${L('テーマカラーを使う','Use a theme colour')}<small>${L('この色をアクセントにして、他の色を合わせます。','Uses this colour as the accent and matches the other colours to it.')}</small></span></label><label class="theme-color-row"><span>${L('テーマカラー','Theme colour')}</span><input type="color" id="colorThemeColor"></label>`;
    const genre = colors.querySelector('#colorGenre');
    for (const id of J.COLOR_GENRE_ORDER) genre.add(new Option(J.COLOR_GENRES[id].name, id));
    genre.value = ct.genre;
    const genreNote = () => { colors.querySelector('#colorGenreNote').textContent = J.COLOR_GENRES[genre.value].description; };
    genre.addEventListener('change', genreNote); genreNote();
    colors.querySelector('#colorThemeOn').checked = !!ct.color;
    colors.querySelector('#colorThemeColor').value = (ct.color || '#FF4F8B').toLowerCase();
    colors.querySelector('#colorThemeColor').addEventListener('input', () => { colors.querySelector('#colorThemeOn').checked = true; });
    $('themeChoices').append(colors);
    $('themesDlg').showModal();
  });
  $('btnApplyThemes').addEventListener('click', () => {
    const before = JSON.stringify(J.normalizeColorTheme(S.project.colorTheme)), balanceBefore = S.project.themeBalance;
    S.project.themeBalance = document.querySelector('#themesDlg input[name=themeBalance]:checked')?.value === 'unified' ? 'unified' : 'lively';
    S.project.themes = [...$('themeChoices').querySelectorAll('input[data-theme]:checked')].map(el=>el.dataset.theme);
    S.project.colorTheme = J.normalizeColorTheme({ genre: $('colorGenre').value, color: $('colorThemeOn').checked ? $('colorThemeColor').value : null });
    // A changed colour theme is applied right away, so the choice shows immediately.
    if (JSON.stringify(S.project.colorTheme) !== before && J.colorThemeActive(S.project)) {
      remember(); S.project.colors = J.themedColors(S.project, S.project.style, Math.random); renderColors(); replan(); commit();
    }
    renderThemes(); autosave(); $('themesDlg').close();
    // The unified look also shapes how the current lyrics are planned (shared effects, repeats).
    if (S.project.themeBalance !== balanceBefore) { remember(); replan(); commit(); }
  });
  $('btnClearThemes').addEventListener('click', () => { $('themeChoices').querySelectorAll('input[type="checkbox"]').forEach(el=>el.checked=false); $('colorGenre').value = 'auto'; $('colorGenre').dispatchEvent(new Event('change')); });

  $('lyricGroupAvoidanceStrength').addEventListener('input', e => {
    S.project.lyricEffects = { ...J.lyricEffectSettings(S.project), lyricAvoidanceStrength: +e.target.value };
    $('lyricGroupAvoidanceStrengthValue').textContent = (+e.target.value).toFixed(2);
    markUndoGroup('lyricGroupAvoidanceStrength'); replanSoon(100);
  });
  $('lyricAvoidanceStrength').addEventListener('input', e => {
    S.project.lyricEffects = { ...J.lyricEffectSettings(S.project), avoidanceStrength: +e.target.value };
    $('lyricAvoidanceStrengthValue').textContent = (+e.target.value).toFixed(2);
    markUndoGroup('lyricAvoidanceStrength'); replanSoon(100);
  });
  // The easy-mode switch has no separate automatic-placement toggle, so turning it on also enables placement.
  for (const input of document.querySelectorAll('.avoid-center-toggle')) input.addEventListener('change', e => {
    S.project.lyricEffects = { ...J.lyricEffectSettings(S.project), avoidCenter: e.target.checked, ...(e.target.checked ? { autoPlacement: true } : {}) };
    renderTech(); replan();
  });
  for (const [id, key] of [['lyricAutoPlacement', 'autoPlacement'], ['lyricAvoidForeground', 'avoidForeground'], ['lyricRandomBlend', 'randomBlend'], ['lyricRandomOpacity', 'randomOpacity']]) {
    $(id).addEventListener('change', e => { S.project.lyricEffects = { ...J.lyricEffectSettings(S.project), [key]: e.target.checked }; renderTech(); replan(); });
  }
  for (const [id, key] of [['lyricOpacityMin', 'opacityMin'], ['lyricOpacityMax', 'opacityMax']]) {
    $(id).addEventListener('change', e => {
      const settings = J.lyricEffectSettings(S.project);
      if (e.target.value !== '' && Number.isFinite(+e.target.value)) {
        settings[key] = J.clamp(+e.target.value, 0, 100);
        if (key === 'opacityMin') settings.opacityMax = Math.max(settings.opacityMin, settings.opacityMax);
        else settings.opacityMin = Math.min(settings.opacityMin, settings.opacityMax);
      }
      S.project.lyricEffects = settings; renderTech(); replan();
    });
  }
  for(const [id,layer] of [['insertLyricAtPlayhead','lyrics'],['insertForegroundAtPlayhead','foreground'],['insertBackgroundAtPlayhead','media']])$(id).addEventListener('click',()=>openInsertAtPlayhead(layer));
  for(const layer of ['foreground','lyrics','media']){
    const button=document.createElement('button');button.type='button';button.dataset.layer=layer;
    button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="M3 3l18 18"/></svg>';
    button.addEventListener('click',()=>{if(S.exporting)return;S.project.layerVisibility ||= {};S.project.layerVisibility[layer]=S.project.layerVisibility[layer]===false;replan();});
    $('layerVisibilityControls').append(button);
  }
  $('splitForegroundCut').addEventListener('click',()=>openSplitMediaCut('foreground'));
  $('splitBackgroundCut').addEventListener('click',()=>openSplitMediaCut('media'));
  $('relayoutAtPlayhead').addEventListener('click',()=>{S.playheadMenu=null;relayoutAtPlayhead();syncPlayheadMenu();});
  for(const [id,layer] of [['endForegroundHere','foreground'],['endLyricHere','lyrics'],['endBackgroundHere','media']])$(id).addEventListener('click',()=>playheadEnd(layer,false));
  for(const [id,layer] of [['untilNextForeground','foreground'],['untilNextLyric','lyrics'],['untilNextBackground','media']])$(id).addEventListener('click',()=>playheadEnd(layer,true));
  document.querySelector('.playhead-secondary').addEventListener('click',e=>{if(e.target.closest('[data-playhead-action]')){S.playheadMenu=null;syncPlayheadMenu();}});
  initPlayheadMenu();
  $('timelineZoomOut').addEventListener('click', () => setTimelineZoom(S.timelineZoom / 1.5));
  $('timelineZoomIn').addEventListener('click', () => setTimelineZoom(S.timelineZoom * 1.5));
  $('timelineZoomOut').disabled = true;
  // A dedicated touch scrollbar leaves boundary dragging and seeking intact.
  const panLabel=document.createElement('label');panLabel.className='timeline-touch-scroll';
  panLabel.textContent=J.mediaLabel('タイムラインを横に移動','Scroll timeline');
  const pan=document.createElement('input');pan.type='range';pan.id='timelinePan';pan.min='0';pan.max='0';pan.value='0';pan.disabled=true;pan.setAttribute('aria-label',panLabel.textContent);panLabel.append(pan);
  $('timelineScroll').closest('.timeline-with-visibility').after(panLabel);
  pan.addEventListener('input',()=>{$('timelineScroll').scrollLeft=+pan.value;});
  $('timelineScroll').addEventListener('scroll',syncTimelinePan,{passive:true});
  // Timeline dragging prevents the browser's default focus change. End lyric
  // editing before those handlers run, including cut controls and link markers.
  $('timelineScroll').addEventListener('pointerdown',()=>{
    if(document.activeElement===$('lyrics'))$('lyrics').blur();
  },{capture:true});
  for(const type of ['wheel','pointerdown','touchstart'])$('timelineScroll').addEventListener(type,()=>{timelineUserScroll=performance.now();},{passive:true});
  $('timelinePan')?.addEventListener('pointerdown',()=>{timelineUserScroll=performance.now();});
  $('sourceLyrics').addEventListener('click',()=>selectSourceDrawer('lyrics'));
  $('sourceMedia').addEventListener('click',()=>selectSourceDrawer('media'));
  $('sourceForeground').addEventListener('click',()=>selectSourceDrawer('foreground'));
  $('closeSourceDrawer').addEventListener('click',()=>{S.sourceOpen=false;syncSourceDrawer();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.sourceOpen&&!document.querySelector('dialog[open]')){S.sourceOpen=false;syncSourceDrawer();}});
  $('btnMediaFromLyrics').addEventListener('click', insertMediaFromLyrics);
  $('mediaLyricInsertMode').addEventListener('change', e => {
    const layer = activeMediaLayer(); if (!layer) return;
    S.project[layer].lyricInsertMode = e.target.value;
    syncSourceTab(); autosave();
  });
  $('mediaGroupLyrics').addEventListener('change', e => {
    const layer = activeMediaLayer(); if (!layer) return;
    S.project[layer].groupLyricsAsOneCut = e.target.checked;
    syncSourceTab(); autosave();
  });
  const areaOverlay = $('areaEditOverlay');
  areaOverlay.addEventListener('pointerdown', e => {
    if (!S.areaEdit) return;
    const handle = e.target.closest('[data-handle]'), mode = handle ? handle.dataset.handle : mediaHit(e);
    if (!mode) return;
    e.preventDefault(); areaOverlay.setPointerCapture(e.pointerId);
    S.areaEdit.drag = { start: mediaPointer(e), previous: { ...S.areaEdit.draft }, previousAngle: S.areaEdit.angle, pointerAngle: mediaPointerAngle(e, S.areaEdit.draft), handle: mode };
    areaOverlay.style.cursor = mode === 'rotate' ? 'var(--rotate-cursor)' : '';
    $('areaEditRect').style.cursor = mode === 'rotate' ? 'var(--rotate-cursor)' : '';
  });
  areaOverlay.addEventListener('pointermove', e => {
    if (!S.areaEdit) return;
    if (S.areaEdit.drag) moveMediaDraft(e);
    else {
      const mode = mediaHit(e), cursor = mode === 'rotate' ? 'var(--rotate-cursor)' : mode === 'move' ? 'move' : 'default';
      areaOverlay.style.cursor = cursor; $('areaEditRect').style.cursor = cursor;
    }
  });
  areaOverlay.addEventListener('pointerup', e => {
    if (!S.areaEdit) return;
    S.areaEdit.drag = null; areaOverlay.style.cursor = ''; $('areaEditRect').style.cursor = '';
  });
  areaOverlay.addEventListener('pointercancel', () => { if (!S.areaEdit) return; if (S.areaEdit.drag) { S.areaEdit.draft = S.areaEdit.drag.previous; S.areaEdit.angle = S.areaEdit.drag.previousAngle; } S.areaEdit.drag = null; areaOverlay.style.cursor = ''; $('areaEditRect').style.cursor = ''; showAreaDraft(); });
  $('mediaAreaAspectLock').addEventListener('change', e => { if (!S.areaEdit) return; S.areaEdit.lockAspect = e.target.checked; if (e.target.checked) S.areaEdit.ratio = S.areaEdit.draft.h / S.areaEdit.draft.w; showAreaDraft(); });
  $('mediaAreaWidth').addEventListener('change', e => { if (!S.areaEdit) return; const w = J.clamp(+e.target.value / 100, 0.005, 4); setMediaDraftSize(w, S.areaEdit.lockAspect ? w * S.areaEdit.ratio : S.areaEdit.draft.h); });
  $('mediaAreaHeight').addEventListener('change', e => { if (!S.areaEdit) return; const h = J.clamp(+e.target.value / 100, 0.005, 4); setMediaDraftSize(S.areaEdit.lockAspect ? h / S.areaEdit.ratio : S.areaEdit.draft.w, h); });
  document.addEventListener('scroll',()=>{if(S.areaEdit)positionAreaEditor();},{capture:true,passive:true});
  $('mediaAreaAngle').addEventListener('input', e => { if (!S.areaEdit || e.target.value === '') return; S.areaEdit.angle = J.clamp(+e.target.value || 0, -180, 180); showAreaDraft(); });
  $('areaResetFull').addEventListener('click',()=>{
    const edit=S.areaEdit;if(!edit)return;
    edit.autoDraft=null;edit.angle=0;
    if(edit.kind==='lyric'){edit.draft={x:0,y:0,w:1,h:1};edit.ratio=1;}
    else {
      const dimensions=J.mediaSourceDimensions(S.plan,S.plan[edit.kind].cuts[edit.index],S.t);if(!dimensions)return;
      edit.draft=J.mediaPlacementRect(null,dimensions.width,dimensions.height,S.plan.W,S.plan.H);edit.lockAspect=true;edit.ratio=edit.draft.h/edit.draft.w;
    }
    showAreaDraft();
  });
  $('areaResetAuto').addEventListener('click', () => {
    const edit = S.areaEdit; if (!edit) return;
    if(edit.kind!=='lyric'){
      const {area,cut}=automaticMediaArea(edit.kind,edit.index);if(!area)return;
      edit.draft=area;edit.ratio=area.h/area.w;edit.angle=cut.placement?.angle||0;edit.lockAspect=cut.placement?.lockAspect!==false;
      edit.autoDraft=JSON.stringify(J.lyricArea({...area,angle:edit.angle,lockAspect:edit.lockAspect}));showAreaDraft();return;
    }
    const project = { ...S.project, overrides: { ...S.project.overrides, [edit.index]: { ...S.project.overrides[edit.index], area: undefined, lockedAreas: undefined } } };
    const area = J.plan(project, audioLike()).cuts.find(c => c.line === edit.index && c.part === 0)?.area || { x: 0, y: 0, w: 1, h: 1, angle: 0, lockAspect: true };
    edit.draft = { ...area }; edit.ratio = area.h / area.w; edit.angle = area.angle; edit.lockAspect = area.lockAspect;
    edit.autoDraft = JSON.stringify(J.lyricArea(area));
    showAreaDraft();
  });
  $('areaApplyOne').addEventListener('click', () => applyAreaEditor(false));
  $('areaApplyFollowing').addEventListener('click', () => applyAreaEditor(true));
  $('areaCancel').addEventListener('click', cancelAreaEditor);
  $('areaDelete').addEventListener('click',()=>{
    const edit=S.areaEdit;
    if(!edit || S.playing || S.exporting || S.tap)return;
    const {kind,index}=edit;
    const part=kind==='lyric' ? J.lyricCutsAt(S.plan,S.t).find(c=>c.line===index)?.part || 0 : 0;
    const L=J.mediaLabel,dialog=document.createElement('dialog');dialog.id='areaDeleteDialog';dialog.className='insert-cut-dialog';
    dialog.innerHTML=`<form method="dialog"><p>${L('このカットを削除します。よろしいですか？','Delete this cut?')}</p><div class="row"><button value="cancel">${L('キャンセル','Cancel')}</button><button value="delete" class="area-delete-confirm">${L('削除','Delete')}</button></div></form>`;
    dialog.addEventListener('close',()=>{
      const remove=dialog.returnValue==='delete';dialog.remove();
      if(!remove || S.areaEdit!==edit)return;
      cancelAreaEditor();
      if(kind==='lyric')removeLyricCut(index,part);else removeMediaCut(index,kind);
    },{once:true});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close('cancel');}});
    document.body.append(dialog);dialog.showModal();dialog.querySelector('[value="cancel"]').focus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.areaEdit && !document.querySelector('dialog[open]')) { e.preventDefault(); cancelAreaEditor(); } });
  $('mediaFiles').addEventListener('change', async e => { const files = Array.from(e.target.files || []); e.target.value = ''; await addMediaFiles(files, activeMediaLayer() || 'media'); });
  const mediaPane = $('mediaPane');
  const hasFiles = e => Array.from(e.dataTransfer && e.dataTransfer.types || []).includes('Files');
  mediaPane.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; mediaPane.classList.add('media-drop-active'); });
  mediaPane.addEventListener('dragleave', e => { if (!mediaPane.contains(e.relatedTarget)) mediaPane.classList.remove('media-drop-active'); });
  mediaPane.addEventListener('drop', async e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); mediaPane.classList.remove('media-drop-active');
    await addMediaFiles(Array.from(e.dataTransfer.files || []), activeMediaLayer() || 'media');
  });
  $('mediaRandom').addEventListener('change', e => { S.project[activeMediaLayer()].randomOrder = e.target.checked; replan(); });
  $('mediaLoop').addEventListener('change', e => {
    const m = S.project[activeMediaLayer()]; m.loop = e.target.checked;
    if (e.target.checked && !m.cutCount) m.cutCount = Math.min(1000, m.items.length * 2);
    replan();
  });
  $('lyricInputTools').addEventListener('click', e => {
    const button=e.target.closest('[data-lyric-insert]'); if (!button) return;
    const input=$('lyrics'), start=input.selectionStart, end=input.selectionEnd;
    const selected=input.value.slice(start,end), kind=button.dataset.lyricInsert;
    const pairs={cut:['/','/'],break:['\\n','\\n'],strong:['*','*'],soft:['~','~'],scene:['{','}'],separate:['{-','-}'],empty:['｜','｜']};
    let [before,after]=pairs[kind], middle=selected;
    if (kind==='empty') {
      // Preserve the selected text's half/full-width spacing, but remove its glyphs.
      const blank = selected ? [...selected].map(ch=>ch==='\n'?'\n':/[\u0000-\u007f\uff61-\uff9f]/.test(ch)?' ':'　').join('') : '　　　　';
      before=start && input.value[start-1]!=='\n'?'\n':'';
      middle=blank.split('\n').map(line=>'｜'+(line || '　　　　')+'｜').join('\n');
      after='\n';
    }
    if (kind==='cut' || kind==='break') { if (!selected) after=''; }
    if (kind==='scene' || kind==='separate') {
      before=(start && input.value[start-1]!=='\n'?'\n':'')+before+'\n';
      after='\n'+after+(end<input.value.length && input.value[end]!=='\n'?'\n':'');
    }
    // Commit pending typing first, then give every helper click its own undo step.
    clearTimeout(replanTimer); recordUndoState(); markUndoGroup(null); U.lastGroup=null;
    input.setRangeText(before+middle+after,start,end,'end');
    reconcileLyricLines(S.project.lyrics,input.value);
    S.project.lyrics=input.value;
    replan();
    input.focus();
    const cursor=start+before.length+middle.length+after.length;
    if (kind==='empty') input.setSelectionRange(cursor,cursor);
    else input.setSelectionRange(start+before.length,start+before.length+middle.length);
  });
  for (const event of ['focus','blur','scroll']) $('lyrics').addEventListener(event, syncLyricPlaybackHighlight);
  new ResizeObserver(syncLyricPlaybackHighlight).observe($('lyrics'));
  $('lyrics').addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.code==='KeyZ' || e.code==='KeyY') {
      e.preventDefault(); e.stopPropagation();
      undoMove(e.code==='KeyY' || e.shiftKey ? 1 : -1);
    }
  });
  $('lyrics').addEventListener('input', e => {
    const changedCount = reconcileLyricLines(S.project.lyrics, e.target.value);
    S.project.lyrics = e.target.value;
    markUndoGroup('lyrics');
    if (changedCount) { clearTimeout(replanTimer); replan(); }
    else replanSoon(260);
  });
  $('lyricLang').addEventListener('change', e => {
    remember();
    S.project.lang = e.target.value; replan(); renderFontRoles(); commit(); flushSave();
    const l = J.resolveLang(S.project);
    toast((S.project.lang === 'auto' ? '歌詞の言語：自動判定 → ' : '歌詞の言語：') + J.LANG_LABEL[l]);
  });
  $('songTitle').addEventListener('input', e => { S.project.title = e.target.value; markUndoGroup('title'); replanSoon(300); });
  $('songArtist').addEventListener('input', e => { S.project.artist = e.target.value; markUndoGroup('artist'); replanSoon(300); });
  $('projectName').addEventListener('input', e => { S.project.projectName = e.target.value; markUndoGroup('projectName'); replanSoon(300); });
  $('saveFilename').addEventListener('input', syncFilenamePreview);
  $('saveFilenameDate').addEventListener('change', syncFilenamePreview);
  $('btnSyntax').addEventListener('click', e => { const s = $('syntax'); s.hidden = !s.hidden; e.target.setAttribute('aria-expanded', String(!s.hidden)); });
  $('bpm').addEventListener('change', e => { S.project.timing.bpm = Math.max(0, parseFloat(e.target.value) || 0); replan(); });
  $('offset').addEventListener('change', e => { S.project.timing.offset = Math.max(0, parseFloat(e.target.value) || 0); replan(); });
  $('lineScale').addEventListener('change', e => { S.project.timing.lineScale = J.clamp(parseFloat(e.target.value) || 1, 0.3, 4); replan(); });
  $('snap').addEventListener('change', e => { S.project.timing.snap = e.target.checked; replan(); });
  $('btnResetTimes').addEventListener('click', () => { const layer = activeMediaLayer(), timing = layer ? S.project[layer].timing : S.project.timing; timing.lineTimes = {}; if (!layer) timing.cutTimes = {}; replan(); });
  $('audioFile').addEventListener('change', e => { const f = e.target.files?.[0];e.target.value='';if (f) openAudioImport(f); });
  $('btnRemoveAudio').addEventListener('click', removeAudio);
  $('btnTap').addEventListener('click', () => (S.tap ? stopTap() : startTap()));
  $('btnTapMedia').addEventListener('click', () => (S.tap ? stopTap() : startTap()));
  $('tapBtn').addEventListener('click', tapNow);
  $('tapStop').addEventListener('click', () => { pause(); stopTap(); });
  $('effectFavorites').textContent=J.mediaLabel('☆お気に入り演出','☆ Favorite effects');
  $('effectFavorites').onclick=()=>openEffectFavorites();
  const screenshot=$('previewScreenshot');
  screenshot.textContent=J.mediaLabel('スクショ','Screenshot');
  screenshot.title=J.mediaLabel('書き出し設定の解像度でプレビューをPNG保存','Save preview as PNG at the export resolution');
  screenshot.addEventListener('click',async()=>{
    screenshot.disabled=true;
    try{
      const time=S.t,filename=J.exportFilename(`${baseName()}_preview_${time.toFixed(3).replace('.','-')}`,'.png');
      const [w,h]=J.outputSize(S.project),canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      const previousRes=J.glyphs.maxRes;
      try{
        J.glyphs.maxRes=h>=1000?768:512;
        // Prepare the animation at the captured project time, then render at the output size.
        await J.prepareAPNGFrames(S.plan,time);
        drawPreviewFrame(canvas.getContext('2d'),{renderer:new J.Renderer(),time});
      }finally{J.glyphs.maxRes=previousRes;}
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error(J.mediaLabel('PNGを作成できませんでした','Could not create PNG'))),'image/png'));
      await J.saveFile(filename,blob);
    }catch(error){toast(J.mediaLabel('スクショを保存できませんでした：','Could not save screenshot: ')+error.message);}
    finally{screenshot.disabled=false;}
  });
  $('previewFullscreen').addEventListener('click',async()=>{
    try { await $('viewport').requestFullscreen(); }
    catch { $('viewport').classList.add('preview-fullscreen');document.body.classList.add('preview-fullscreen-open');sizeViewport(); }
  });
  const exitPreviewFullscreen=()=>{
    if(document.fullscreenElement)document.exitFullscreen();
    $('viewport').classList.remove('preview-fullscreen');document.body.classList.remove('preview-fullscreen-open');sizeViewport();
  };
  $('exitPreviewFullscreen').addEventListener('click',exitPreviewFullscreen);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('viewport').classList.contains('preview-fullscreen'))exitPreviewFullscreen();});
  document.addEventListener('fullscreenchange',()=>{sizeViewport();S.need=true;});
  $('fullscreenPlay').addEventListener('click',()=>{S.playing?pause():play();updateTimeUI();});
  const fullscreenScrub=$('fullscreenScrub');
  fullscreenScrub.addEventListener('input',()=>{S.scrubbing=true;seek(fullscreenScrub.value/10000*S.plan.duration);updateTimeUI();});
  fullscreenScrub.addEventListener('change',()=>{S.scrubbing=false;updateTimeUI();});
  document.addEventListener('fullscreenchange',()=>{S.scrubbing=false;updateTimeUI();});
  $('btnPlay').addEventListener('click', () => (S.playing ? pause() : play()));
  $('btnUndo').addEventListener('click', () => undoMove(-1));
  $('btnRedo').addEventListener('click', () => undoMove(1));
  $('btnLoop').addEventListener('click', e => { S.loop = !S.loop; e.target.setAttribute('aria-pressed', String(S.loop)); });
  $('btnShuffle').addEventListener('click', () => { remember(); J.clearPastedLyricEffects(S.project); shuffleMediaEffects(); S.project.seed = (Math.random() * 1e9) | 0; $('seed').value = S.project.seed; replan(); commit(); });
  const sc = $('scrub');
  sc.addEventListener('input', () => { S.scrubbing = true; seek(sc.value / 10000 * S.plan.duration); });
  sc.addEventListener('change', () => { S.scrubbing = false; });
  const durationValue = $('timeDur'), durationInput = $('timeDurInput'), durationHandle = $('timelineDurationHandle');
  const closeDurationInput = save => {
    if (durationInput.hidden) return;
    const raw = durationInput.value.trim();
    durationInput.hidden = true; durationValue.hidden = false;
    if (save) setProjectDuration(raw ? parseProjectDuration(raw) : null);
    updateTimeUI();
  };
  durationValue.addEventListener('click', () => {
    if (S.exporting || S.tap) return;
    pause(); durationValue.hidden = true; durationInput.hidden = false;
    durationInput.value = J.fmtTime(S.plan.duration); durationInput.focus(); durationInput.select();
  });
  durationInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); closeDurationInput(true); }
    else if (e.key === 'Escape') { e.preventDefault(); closeDurationInput(false); }
  });
  durationInput.addEventListener('blur', () => closeDurationInput(true));
  durationHandle.addEventListener('pointerdown', e => {
    if (S.exporting || S.tap) return;
    e.preventDefault();
    closeDurationInput(false); pause();
    S.durationDrag = { pointerId: e.pointerId, originX: e.clientX, originDuration: S.plan.duration, preview: S.plan.duration, moved: false };
    durationHandle.setPointerCapture(e.pointerId);
    durationHandle.classList.add('dragging');
  });
  durationHandle.addEventListener('pointermove', e => {
    const drag = S.durationDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const width = Math.max(1, $('timelineStack').clientWidth);
    if (Math.abs(e.clientX - drag.originX) >= 2) drag.moved = true;
    drag.preview = Math.round(J.clamp(drag.originDuration * (1 + (e.clientX - drag.originX) / width), minimumProjectDuration(), 21600) * 100) / 100;
    durationHandle.style.transform = `translateX(${(drag.preview / drag.originDuration - 1) * width}px)`;
    updateTimeUI();
  });
  durationHandle.addEventListener('pointerup', e => {
    const drag = S.durationDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    S.durationDrag = null; durationHandle.classList.remove('dragging'); durationHandle.style.transform = '';
    if (drag.moved) setProjectDuration(drag.preview);
    else durationValue.click();
    updateTimeUI();
  });
  durationHandle.addEventListener('pointercancel', () => {
    S.durationDrag = null; durationHandle.classList.remove('dragging'); durationHandle.style.transform = ''; updateTimeUI();
  });
  for (const tl of [$('timeline'), $('mediaTimeline'), $('foregroundTimeline')]) {
    const layer = tl.id === 'timeline' ? 'lyrics' : tl.id === 'foregroundTimeline' ? 'foreground' : 'media';
    let drag = null;
    tl.addEventListener('pointerdown', e => {
      const boundary = !S.exporting && !S.tap && timelineBoundaryAt(e, layer);
      const limits = boundary && (boundary.mode === 'end' ? boundary : boundaryGroupLimits(boundary.ref));
      drag = boundary && limits && limits.max > limits.min ? { ...boundary, min: limits.min, max: limits.max, mode: boundary.mode === 'end' ? 'end' : 'boundary', originX: e.clientX, preview: boundary.start, moved: false, duration: S.plan.duration } : { mode: 'seek' };
      e.preventDefault();
      tl.setPointerCapture(e.pointerId);
      if (boundary) { pause(); S.timelineDrag = drag; }
      else timelineSeek(e);
    });
    tl.addEventListener('pointermove', e => {
      if (!drag) { tl.style.cursor = !S.exporting && !S.tap && timelineBoundaryAt(e, layer) ? 'ew-resize' : 'pointer'; return; }
      if (drag.mode === 'seek') { timelineSeek(e); return; }
      if (Math.abs(e.clientX - drag.originX) >= 3) drag.moved = true;
      if (!drag.moved) return;
      const rect = tl.getBoundingClientRect();
      drag.preview = J.clamp((e.clientX - rect.left) / rect.width * drag.duration, drag.min, drag.max);
      drawTimeline();
      drawTimelineLinks();
    });
    tl.addEventListener('pointerup', () => {
      if (!drag) return;
      if (drag.mode === 'boundary' || drag.mode === 'end') {
        S.timelineDrag = null;
        if (drag.moved && drag.mode === 'end') { setCutEnd(drag.layer, drag.key, drag.preview); replan(); }
        else if (drag.moved) commitTimelineBoundary(drag);
        else seek(drag.start);
        drawTimeline();
        drawTimelineLinks();
      }
      drag = null;
    });
    tl.addEventListener('pointercancel', () => { drag = null; S.timelineDrag = null; drawTimeline(); drawTimelineLinks(); });
  }
  const linkSvg = $('timelineLinks');
  linkSvg.addEventListener('pointerdown', e => {
    const action = e.target.closest('.timeline-action');
    if (action) { e.preventDefault(); e.stopPropagation(); performTimelineAction(action); return; }
    const remove = e.target.closest('.link-remove');
    if (remove) {
      e.preventDefault(); e.stopPropagation();
      S.project.timelineLinks.splice(+remove.dataset.edge, 1);
      drawTimelineLinks(); autosave();
      return;
    }
    const handle = e.target.closest('.link-handle');
    if (!handle || S.exporting || S.tap) return;
    e.preventDefault(); e.stopPropagation(); pause();
    const marker = timelineMarkers().find(m => m.ref === handle.dataset.ref);
    if (!marker) return;
    S.linkDrag = { source: marker.ref, sourceLayer: marker.layer, sourceX: marker.x, sourceY: marker.y, x: marker.x, y: marker.y };
    linkSvg.setPointerCapture(e.pointerId);
    drawTimelineLinks();
  });
  linkSvg.addEventListener('pointermove', e => {
    if (!S.linkDrag) return;
    const rect = $('timelineStack').getBoundingClientRect();
    S.linkDrag.x = e.clientX - rect.left; S.linkDrag.y = e.clientY - rect.top;
    drawTimelineLinks();
  });
  linkSvg.addEventListener('pointerup', e => {
    if (!S.linkDrag) return;
    const drag = S.linkDrag, target = markerNear(e.clientX, e.clientY, drag.sourceLayer);
    S.linkDrag = null;
    if (target) connectTimelineBoundaries(drag.source, target.ref);
    drawTimelineLinks();
  });
  linkSvg.addEventListener('pointercancel', () => { S.linkDrag = null; drawTimelineLinks(); });
  linkSvg.addEventListener('keydown', e => {
    const action = e.target.closest('.timeline-action');
    if (action && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); performTimelineAction(action); }
  });
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.tabpane').forEach(p => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    if (b.dataset.tab === 'out') codecNote();
    loadThumbFonts();
  }));
  $('fxFlash').addEventListener('change', e => { S.project.fx.flash = e.target.checked; replan(); });
  $('techFilter').addEventListener('input', () => renderTech());
  for(const layer of ['foreground','media'])$(layer+'EffectFilter').addEventListener('input',()=>renderMediaEffects(layer));
  $('fxKoma').addEventListener('change', e => { const k = +e.target.value; S.project.fx.koma = k; S.project.fx.onTwos = k > 0; S.project.mood = null; replan(); });
  $('fxHud').addEventListener('change', e => { S.project.fx.hud = e.target.value; replan(); });
  $('seed').addEventListener('change', e => { J.clearPastedLyricEffects(S.project); S.project.seed = parseInt(e.target.value, 10) || 0; replan(); });
  $('btnSeed').addEventListener('click', () => { J.clearPastedLyricEffects(S.project); S.project.seed = (Math.random() * 1e9) | 0; $('seed').value = S.project.seed; replan(); });
  const colorToggle = (flag, keys) => e => {
    remember();
    const c = S.project.colors; c[flag] = e.target.checked;
    if (c[flag]) { const sc0 = J.STYLES[S.project.style].schemes[0]; keys.forEach(([k]) => { if (!c[k]) c[k] = sc0[k]; }); }
    renderColors(); replan(); commit();
  };
  $('colorOn').addEventListener('change', colorToggle('enabled', BASE_KEYS));
  $('accentOn').addEventListener('change', colorToggle('accentOn', ACCENT_KEYS));
  $('btnRandPalette').addEventListener('click', randomPalette);
  $('btnAddFont').addEventListener('click', () => {
    const name = $('localFont').value.trim(); if (!name) return;
    const key = 'local_' + name.replace(/\s+/g, '_');
    const weight = /bold|太|black|heavy|w[6-9]|[6-9]00/i.test(name) ? 700 : 400;
    J.addUserFont(key, name + '（PC）', name, weight);
    S.project.userFonts = (S.project.userFonts || []).filter(u => u.key !== key).concat([{ key, label: name + '（PC）', family: name, weight }]);
    S.project.fonts.display = key; $('localFont').value = '';
    fontKey = ''; renderFontRoles(); replan();
  });
  $('btnListFonts').addEventListener('click', async () => {
    if (typeof window.queryLocalFonts !== 'function') { toast('このブラウザではPCフォント一覧を取得できません'); return; }
    try {
      const fonts = await window.queryLocalFonts();
      const unique = new Map();
      for (const font of fonts) if (font.family) unique.set(`${font.family}\u0000${font.style}`, font);
      const selector = $('installedFonts'); selector.innerHTML = '';
      for (const font of [...unique.values()].sort((a, b) => (a.family + a.style).localeCompare(b.family + b.style))) {
        const option = document.createElement('option'); option.value = font.postscriptName || font.fullName; option.textContent = font.fullName || `${font.family} ${font.style}`;
        option.style.fontFamily = `"${font.family.replace(/"/g, '')}"`; option._font = font; selector.appendChild(option);
      }
      selector.hidden = !$('installedFonts').options.length; $('btnImportFont').hidden = selector.hidden;
      if (selector.hidden) toast('フォントが見つかりませんでした');
    } catch (error) { toast('PCフォント一覧の取得が許可されませんでした'); }
  });
  $('btnImportFont').addEventListener('click', () => {
    const selector = $('installedFonts'), font = selector.selectedOptions[0]?._font;
    if (!font) return;
    const family = font.family, weight = /bold|black|heavy|太|[6-9]00/i.test(font.style || '') ? 700 : 400;
    const key = 'local_' + Array.from(family + '_' + (font.style || '')).map(ch => ch.codePointAt(0).toString(16)).join('_');
    const label = font.fullName || `${family} ${font.style || ''}`;
    J.addUserFont(key, label, family, weight);
    S.project.userFonts = (S.project.userFonts || []).filter(item => item.key !== key).concat([{ key, label, family, weight }]);
    S.project.fonts.display = key; fontKey = ''; renderFontRoles(); replan();
  });
  $('btnSaveComposite').addEventListener('click', () => {
    const name = $('compositeName').value.trim(), base = $('compositeBase').value;
    if (!name || !J.FONTS[base] || J.FONTS[base].composite) { toast('設定名とベースフォントを指定してください'); return; }
    const parts = Object.fromEntries([...$('compositeParts').querySelectorAll('select')].filter(el => el.value && J.FONTS[el.value] && !J.FONTS[el.value].composite).map(el => [el.dataset.part, el.value]));
    const key = 'composite_' + Math.random().toString(36).slice(2, 11);
    S.project.compositeFonts.push({ key, name, base, parts }); J.setCompositeFonts(S.project.compositeFonts);
    S.project.fonts.display = key; $('compositeName').value = ''; fontKey = ''; renderFontRoles(); replan();
  });
  $('compositeList').addEventListener('click', e => {
    const button = e.target.closest('[data-key]'); if (!button) return;
    S.project.compositeFonts = S.project.compositeFonts.filter(def => def.key !== button.dataset.key);
    for (const role of Object.keys(S.project.fonts)) if (S.project.fonts[role] === button.dataset.key) delete S.project.fonts[role];
    J.setCompositeFonts(S.project.compositeFonts); fontKey = ''; renderFontRoles(); replan();
  });
  $('fontFile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const key = await J.loadFontFile(f), face = J.FONTS[key];
      S.project.userFonts = (S.project.userFonts || []).filter(item => item.key !== key).concat([{ key, label: face.label, family: face.family.replace(/"/g, ''), weight: face.weight, file: true }]);
      S.project.fonts.display = key; fontKey = ''; renderFontRoles(); replan();
    }
    catch (err) { showMsg('フォントを読み込めませんでした'); setTimeout(() => showMsg(null), 2500); }
  });
  ['outAspect', 'eAspect'].forEach(id => $(id).addEventListener('change', e => { S.project.aspect = e.target.value; syncOut(); replan(); codecNote(); }));
  ['outRes', 'eRes'].forEach(id => $(id).addEventListener('change', e => { S.project.res = +e.target.value; syncOut(); autosave(); codecNote(); }));
  for (const id of ['out', 'e']) {
    $(`${id}VideoSize`).addEventListener('change', e => {
      const choice = e.target.value;
      S.project.videoSizeMode = choice === 'custom' ? 'custom' : 'preset';
      if (choice === 'legacy') S.project.videoSize = null;
      else if (choice === 'custom') {
        const [w, h] = J.outputSize(S.project); S.project.videoSize = { w, h };
      } else { const [w, h] = choice.split('x').map(Number); S.project.videoSize = { w, h }; }
      syncOut(); replan(); codecNote();
    });
    for (const dimension of ['Width', 'Height']) $(`${id}Video${dimension}`).addEventListener('change', e => {
      const n = Math.round(+e.target.value / 2) * 2;
      if (!Number.isFinite(n) || n < 16 || n > 8192) { syncOut(); return; }
      const [w, h] = J.outputSize(S.project);
      S.project.videoSize = { w: dimension === 'Width' ? n : w, h: dimension === 'Height' ? n : h };
      syncOut(); replan(); codecNote();
    });
  }
  ['outFps', 'eFps'].forEach(id => $(id).addEventListener('change', e => { S.project.fps = +e.target.value; syncOut(); replan(); codecNote(); }));
  $('outQuality').addEventListener('change', e => {
    S.project.quality=e.target.value;
    if(e.target.value==='custom'&&S.project.exportBitrate==null)S.project.exportBitrate=J.videoBitrate(activeExportProject(),'high');
    syncQuality();codecNote();autosave();
  });
  $('outBitrate').addEventListener('input',e=>{
    S.project.exportBitrate=Number(e.target.value)*1e6;
    const selection=$('outQuality').querySelector('[value="custom"]');
    selection.textContent=J.mediaLabel('任意ビットレート','Custom bitrate')+(e.target.validity.valid?` (${+e.target.value} Mbps)`:'');
    codecNote();autosave();
  });
  ['outKey', 'eKey'].forEach(id => $(id).addEventListener('change', e => {
    S.project.keyBg = e.target.value; syncOut(); replan(); flushSave();
    const k = J.keyMode(S.project);
    toast(k ? `背景：${k === 'green' ? 'グリーンバック' : 'ブラックバック'}（白い文字と演出だけ）` : '背景：通常（スタイルの配色）');
  }));
  $('outQP').addEventListener('input',e=>{
    S.project.exportQP=e.target.value===''?NaN:Number(e.target.value);codecNote();autosave();
  });
  $('outAudio').addEventListener('change', e => { S.project.includeAudio = e.target.checked;if(shortPreview?.playing)playShortPreviewAudio();autosave(); });
  $('btnMP4').addEventListener('click', () => runExport('mp4'));
  $('btnShort').addEventListener('click', () => runExport('short'));
  $('btnPNG').addEventListener('click', () => runExport('png'));
  $('btnPNGA').addEventListener('click', () => runExport('pnga'));
  document.querySelectorAll('.exp-cancel').forEach(b => b.addEventListener('click', () => { if (S.exporting) S.exporting.abort(); }));
  // かんたんモード
  $('modeEasy').addEventListener('click', () => toggleSettingsDrawer('easy'));
  $('modePro').addEventListener('click', () => toggleSettingsDrawer('pro'));
  initOutsideDismiss();
  $('closeSettingsDrawer').addEventListener('click',()=>{S.settingsOpen=false;syncSettingsDrawer();$(S.mode==='easy'?'modeEasy':'modePro').focus();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.settingsOpen&&!document.querySelector('dialog[open]')&&!timelineCutMenu&&!S.playheadMenu){S.settingsOpen=false;syncSettingsDrawer();$(S.mode==='easy'?'modeEasy':'modePro').focus();}});
  window.addEventListener('scroll',positionSettingsDrawer,{passive:true});
  window.addEventListener('resize',positionSettingsDrawer);
  if(window.ResizeObserver)new ResizeObserver(positionSettingsDrawer).observe(document.querySelector('.bar'));
  $('btnOmakase').addEventListener('click', omakase);
  $('eStyle').addEventListener('click', () => rerollPart('style'));
  $('eMood').addEventListener('click', () => rerollPart('mood'));
  $('eCut').addEventListener('click', () => rerollPart('cut'));
  $('ePalette').addEventListener('click', () => { randomPalette(); restartPreview(); });
  // 利用について（出力物の権利・ライセンス）
  const dlg = $('termsDlg');
  let termsOpener=null;
  const openTerms = e => { termsOpener=e.currentTarget; if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', ''); };
  dlg.addEventListener('close',()=>{const target=termsOpener?.closest('#helpMenu')?$('helpMenu').querySelector('summary'):termsOpener;target?.focus();});
  document.querySelectorAll('.terms-open').forEach(b => b.addEventListener('click', openTerms));
  $('btnNew').addEventListener('click', () => { if (!S.exporting && !S.projectBusy) $('newProjectDlg').showModal(); });
  $('btnCreateProject').addEventListener('click', () => {
    const project = J.defaultProject(); project.lyrics = ''; project.aspect = $('newProjectAspect').value;
    replaceProject(project, null, null, new Map()); $('newProjectDlg').close();
    $('btnThemes').click();
  });
  $('btnSave').addEventListener('click', async () => {
    if (S.projectBusy) return;
    const request = await requestFilename('project'); if (!request) return;
    S.projectBusy = true; $('btnSave').disabled = true;
    // The saved name (without an added date) becomes the project name, stored in the file too.
    const previousName = S.project.projectName;
    S.project.projectName = request.name; $('projectName').value = request.name;
    const project = JSON.parse(JSON.stringify(S.project)), audio = S.audioFile;
    try { await J.saveFile(request.filename, await J.packProject(project, audio)); autosave(); }
    catch (err) { S.project.projectName = previousName; $('projectName').value = previousName || ''; toast(J.mediaLabel('保存できませんでした：', 'Could not save: ') + err.message); }
    finally { S.projectBusy = false; $('btnSave').disabled = false; }
  });
  $('btnSaveSettings').addEventListener('click', async () => {
    if (S.projectBusy || S.exporting) return;
    const filename = (await requestFilename('settings'))?.filename; if (!filename) return;
    S.projectBusy = true; $('btnSaveSettings').disabled = true;
    try { await J.saveFile(filename, await J.packProject(J.settingsProject(S.project), null)); }
    catch (err) { toast(J.mediaLabel('保存できませんでした：', 'Could not save: ') + err.message); }
    finally { S.projectBusy = false; $('btnSaveSettings').disabled = false; }
  });
  $('fileSettings').closest('label').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fileSettings').click(); }
  });
  $('fileSettings').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    $('projectMenu').open = false;
    if (S.projectBusy || S.exporting) { e.target.value = ''; return; }
    S.projectBusy = true;
    try {
      const loaded = await J.unpackProject(file);
      for (const entry of loaded.files) if (entry.kind === 'font') await J.saveFontFile(entry.id,entry.file);
      await J.restoreFontFiles(loaded.project.userFonts);
      pause(); if (S.areaEdit) cancelAreaEditor();
      S.project = mergeProject(J.applyProjectSettings(S.project,loaded.project));
      fontKey = ''; syncUI(); replan(); flushSave();
      toast(J.mediaLabel('設定を読み込みました', 'Settings imported'));
    } catch (err) { toast(J.mediaLabel('設定を読み込めませんでした：', 'Could not import settings: ') + err.message); }
    finally { S.projectBusy = false; e.target.value = ''; }
  });
  $('btnAE').addEventListener('click', async () => {
    if (S.projectBusy || S.exporting) return;
    if(!confirmHiddenLayers())return;
    const filename = (await requestFilename('ae'))?.filename; if (!filename) return;
    try { await J.saveFile(filename, JSON.stringify(J.planForAE(S.plan, S.project), null, 1)); }
    catch (err) { toast(J.mediaLabel('保存できませんでした：','Could not save: ') + err.message); }
  });
  $('fileProject').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (S.exporting || S.projectBusy) { e.target.value = ''; return; }
    S.projectBusy = true;
    const dialog=document.createElement('dialog');dialog.className='insert-cut-dialog';dialog.id='projectLoadingDialog';
    const title=document.createElement('h2'),status=document.createElement('p');title.textContent=J.mediaLabel('プロジェクトを読み込み中','Opening project');status.setAttribute('role','status');status.textContent=f.name;dialog.append(title,status);
    dialog.addEventListener('cancel',event=>{if(S.projectBusy)event.preventDefault();});
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
    try { await openProjectFile(f,message=>{status.textContent=message;});dialog.close(); }
    catch (err) {title.textContent=J.mediaLabel('プロジェクトを読み込めませんでした','Could not open project');status.textContent=err.message;const close=document.createElement('button');close.textContent=J.mediaLabel('閉じる','Close');close.onclick=()=>dialog.close();dialog.append(close);}
    finally { S.projectBusy = false; }
    e.target.value = '';
  });
  document.addEventListener('keydown', e => {
    // Ctrl+S / ⌘S saves the project (also while typing) instead of the browser's "save page".
    if(S.areaEdit)return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS') {
      e.preventDefault();
      if (!e.repeat && !S.projectBusy && !S.exporting && !document.querySelector('dialog[open]')) $('btnSave').click();
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    const typing = (e.target && e.target.isContentEditable) || /INPUT|TEXTAREA|SELECT/.test(tag) && e.target.type !== 'range' && e.target.type !== 'checkbox';
    if(document.querySelector('dialog[open]')&&!e.altKey&&(e.ctrlKey||e.metaKey)&&['KeyZ','KeyY'].includes(e.code))return;
    if (!typing && !e.altKey && (e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); undoMove(e.shiftKey ? 1 : -1); return; }
    if (!typing && !e.altKey && e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); undoMove(1); return; }
    if (S.tap && (e.code === 'Space' || e.code === 'Enter') && !typing) { e.preventDefault(); tapNow(); return; }
    if (S.tap && e.code === 'Escape') { pause(); stopTap(); return; }
    if (typing || document.querySelector('dialog[open]')) return;
    if (e.code === 'Space') { e.preventDefault(); S.playing ? pause() : play(); }
    else if (e.code === 'ArrowRight') seek(S.t + (e.shiftKey ? 1 : 1 / S.plan.fps));
    else if (e.code === 'ArrowLeft') seek(S.t - (e.shiftKey ? 1 : 1 / S.plan.fps));
    else if (e.code === 'KeyR' && !e.metaKey && !e.ctrlKey && !e.altKey && !S.exporting) { e.preventDefault(); omakase(); }
  });
  window.addEventListener('resize', () => { sizeViewport(); drawTimeline(); drawTimelineLinks(); });
  if (window.ResizeObserver) new ResizeObserver(() => { sizeViewport(); drawTimeline(); drawTimelineLinks(); }).observe($('viewport'));
  if(window.ResizeObserver){const observer=new ResizeObserver(sizeViewport);for(const el of document.querySelector('.col-stage').children)if(el.id!=='viewport')observer.observe(el);}
  if (window.ResizeObserver) new ResizeObserver(drawTimelineLinks).observe($('timelineStack'));
}

/* song file -> beat analysis (file input, or a host such as the After Effects panel) */
function openAudioImport(file) {
  if(S.projectBusy||S.exporting){toast(J.mediaLabel('処理が完了してから読み込んでください','Wait for the current operation before importing'));return;}
  pause();
  const L=J.mediaLabel,video=J.isVideoFile(file),dialog=document.createElement('dialog');
  dialog.id='audioImportDialog';dialog.className='insert-cut-dialog';
  dialog.innerHTML=`<form><h2>${L('曲・動画を読み込む','Import audio / video')}</h2><p class="audio-import-name"></p><label class="row"><input name="matchDuration" type="checkbox" checked>${L('作成する動画の長さを合わせる','Match output duration to this file')}</label>${video?`<label class="row"><input name="background" type="checkbox" checked>${L('背景としても取り込む','Also import as background')}</label><p class="hint">${L('背景動画は先頭に挿入します。既存の背景カットは後ろへ移動します。','The video is inserted at the beginning. Existing background cuts move after it.')}</p>`:''}<div class="row"><button type="button" data-cancel>${L('キャンセル','Cancel')}</button><button type="submit">${L('読み込む','Import')}</button></div></form>`;
  dialog.querySelector('.audio-import-name').textContent=file.name;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const options={matchDuration:dialog.querySelector('[name=matchDuration]').checked,background:!!dialog.querySelector('[name=background]')?.checked};dialog.close();loadAudioFile(file,options);};
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
async function loadAudioFile(f,options={matchDuration:true,background:false}) {
  if(S.projectBusy||S.exporting)return false;
  S.projectBusy=true;
  const project = S.project, request = S.audioLoad = (S.audioLoad || 0) + 1;
  const previousDuration=S.plan.duration,video=J.isVideoFile(f),assets=new Map();
  const loading=importProgressDialog('audioLoadingDialog',video?J.mediaLabel('動画を読み込み中','Loading video'):J.mediaLabel('曲を読み込み中','Loading audio'));
  const report=(text,value=null)=>loading.report(text+'：'+f.name,value);
  $('audioName').textContent = '解析中…';
  try {
    pause();
    report(J.mediaLabel('ファイルを読み込み中','Reading file'));
    await new Promise(resolve=>setTimeout(resolve,0));
    const sourceFile=await J.snapshotMediaFile(f,(loaded,total)=>report(J.mediaLabel('ファイルを読み込み中','Reading file')+(total?` ${Math.round(loaded/total*100)}%`:''),total?loaded/total:null));
    let audio=null,audioError=null;
    try{audio=await J.analyzeAudio(sourceFile,p=>report(p.phase==='read'?J.mediaLabel('音声を読み込み中','Reading audio'):p.phase==='decode'?J.mediaLabel('音声を展開中','Decoding audio'):J.mediaLabel('拍・波形を解析中','Analyzing beats and waveform')));}
    catch(error){if(!video||!options.background)throw error;audioError=error;}
    if(video)report(J.mediaLabel('動画の長さを確認中','Checking video duration'));
    const duration=video?await J.videoFileDuration(sourceFile):audio.duration;
    if (S.project !== project || S.audioLoad !== request) return false;
    let audioFile=null;
    if(audio){
      report(J.mediaLabel('音声を保存する準備中','Preparing audio for saving'));
      await new Promise(resolve=>setTimeout(resolve,0));
      audioFile=await J.snapshotMediaFile(video?J.audioWaveFile(audio.buffer,f.name):sourceFile);
    }
    let item=null;
    if(video&&options.background){
      if(S.plan.media.cuts.length>=1000)throw new Error(J.mediaLabel('背景カット数の上限に達しました','Background cut limit reached'));
      item={id:crypto.randomUUID(),name:f.name,size:f.size,type:'video',duration};
      report(J.mediaLabel('背景動画を準備中','Preparing background video'));
      await J.attachMedia(item,sourceFile,assets);
      report(J.mediaLabel('背景動画をブラウザに保存中','Saving background video in browser'));
      await J.storeMedia(item.id,sourceFile);
    }
    let audioAsset=null;
    if(audioFile){
      audioAsset={id:'audio_'+crypto.randomUUID(),name:audioFile.name,type:audioFile.type};
      report(J.mediaLabel('音声をブラウザに保存中','Saving audio in browser'));
      await J.storeMedia(audioAsset.id,audioFile);
    }
    if (S.project !== project || S.audioLoad !== request) return false;
    if(item){
      const m=project.media,cuts=S.plan.media.cuts,overrides={0:{itemId:item.id,technique:'none',entrance:'none',departure:'none',videoStart:0,videoDuration:duration,videoLoop:false}},times={0:0};
      cuts.forEach((cut,i)=>{overrides[i+1]={...m.cutOverrides[i],itemId:cut.itemId};times[i+1]=cut.start+duration;});
      m.items.push(item);m.manualCuts=true;m.randomOrder=false;m.cutCount=cuts.length+1;m.cutOverrides=overrides;m.timing.lineTimes=times;
      for(const link of project.timelineLinks)for(const side of ['a','b'])if(link[side].startsWith('m:'))link[side]='m:'+(+link[side].slice(2)+1);
      for(const [id,asset] of assets){J.mediaAssets.set(id,asset);asset.element.addEventListener('seeked',()=>{S.need=true;});}assets.clear();
    }
    if(audio){S.audio=audio;S.audioFile=audioFile;project.audioAsset=audioAsset;}
    project.durationOverride=options.matchDuration?duration:previousDuration;
    refreshAudioName();
    if(audio)S.project.timing.snap = true;
    report(J.mediaLabel('編集画面を更新中','Updating editor'));
    syncUI(); replan();
    if(audioError)toast(J.mediaLabel('動画を読み込みました。音声を取り出せなかったため、曲は変更していません。','Video imported. Audio could not be extracted, so the existing song was kept.'));
    return true;
  } catch (err) {
    if (S.project === project && S.audioLoad === request) { refreshAudioName(); toast(J.mediaLabel('曲を読み込めませんでした：','Could not import audio: ') + err.message); }
    return false;
  } finally {releaseProjectAssets(assets);loading.close();S.projectBusy=false;}
}

function releaseProjectAssets(assets) {
  for (const asset of assets.values()) {
    J.releaseMediaAsset(asset);
  }
  assets.clear();
}
function refreshAudioName() {
  S.audioAssetId = S.audio ? S.project.audioAsset?.id : null;
  $('audioFile').value = '';
  $('audioName').textContent = S.audio ? `${S.project.audioAsset?.name || ''}（${J.fmtTime(S.audio.duration)}・約${S.audio.bpm}BPM）` : NO_AUDIO_LABEL;
  $('btnRemoveAudio').hidden = !S.audio;
}
function replaceProject(project, audio, audioFile, assets) {
  S.audioLoad = (S.audioLoad || 0) + 1;
  pause(); clearTimeout(replanTimer); clearTimeout(saveTimer);
  if (S.areaEdit) cancelAreaEditor();
  S.tap = null; S.timelineDrag = null; S.linkDrag = null; S.scrubbing = false;
  $('tapPanel').hidden = true; syncTapButtons();
  releaseProjectAssets(J.mediaAssets);
  for (const [id,asset] of assets) { J.mediaAssets.set(id,asset); asset.element.addEventListener('seeked',()=>{S.need=true}); }
  for (const font of S.project.userFonts || []) delete J.FONTS[font.key];
  S.project = mergeProject(project); S.audio = audio; S.audioFile = audioFile;
  S.t = 0; S.sourceTab = 'lyrics'; S.timelineZoom = 1; S.loop = true;
  $('btnLoop').setAttribute('aria-pressed','true'); $('mediaFiles').value = '';
  J.mediaTransitionFrame = null; J.foregroundTransitionFrame = null;
  H.list = []; H.i = -1; fontKey = ''; initUndo();
  refreshAudioName(); syncUI(); replan(); setTimelineZoom(1); commit(); flushSave(); ensureFonts();
}
async function restoreAudioAsset() {
  const project = S.project, info = project.audioAsset;
  if (!info) return;
  try {
    const file = await J.loadMedia(info.id);
    if (!file) return;
    const audio = await J.analyzeAudio(file);
    if (S.project !== project || S.project.audioAsset !== info) return;
    S.audio = audio; S.audioFile = file; refreshAudioName(); syncUI(); replan();
  } catch (err) { toast(J.mediaLabel('曲を復元できませんでした：','Could not restore audio: ') + err.message); }
}
async function openProjectFile(file,report=()=>{}) {
  const L=J.mediaLabel;
  const step=async(message,work)=>{
    report(message);let timer;
    try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message+' — '+L('読み込みがタイムアウトしました。ファイルを端末にダウンロードしてから再度お試しください。','Loading timed out. Download the file to this device and try again.'))),60000);})]);}
    finally{clearTimeout(timer);}
  };
  const loaded = await step(L('ファイルを確認しています','Reading project file'),()=>J.unpackProject(file)), project = loaded.project, assets = new Map();
  let audio = null, audioFile = null;
  try {
    const files = new Map(loaded.files.map(entry=>[entry.kind+':'+entry.id,entry.file]));
    for (const item of [...(project.media?.items || []),...(project.foreground?.items || [])]) {
      if (assets.has(item.id)) continue;
      const blob = files.get('media:'+item.id) || await J.loadMedia(item.id);
      if (blob) await step(L('素材を復元しています：','Restoring asset: ')+item.name,()=>J.attachMedia(item,blob,assets));
    }
    if (project.audioAsset) {
      audioFile = files.get('audio:'+project.audioAsset.id) || await J.loadMedia(project.audioAsset.id);
      if (audioFile) audioFile = await J.snapshotMediaFile(audioFile);
      if (audioFile) audio = await step(L('音声を解析しています','Analyzing audio'),()=>J.analyzeAudio(audioFile));
    }
    // Decode everything first: malformed projects leave the current edit intact.
    for (const entry of loaded.files) {
      await step(L('素材を保存しています：','Saving asset: ')+entry.name,()=>entry.kind==='font'?J.saveFontFile(entry.id,entry.file):J.storeMedia(entry.id,entry.file));
    }
    await step(L('フォントを復元しています','Restoring fonts'),()=>J.restoreFontFiles(project.userFonts));
    for(const ref of J.personMaskReferences(project).values()){
      const blob=files.get('person:'+ref.maskId) || await J.loadMedia(ref.maskId);
      if(blob)await J.attachPersonMask(ref,blob);
    }
    replaceProject(project,audio,audioFile,assets);
  } catch (err) { releaseProjectAssets(assets); throw err; }
}

/* ---------------- boot ---------------- */
function boot() {
  S.project = loadLocal();
  cleanupDeletedMedia();
  initUndo();
  bind(); syncUI(); replan();
  restoreMediaAssets();
  restoreAudioAsset();
  J.restoreFontFiles(S.project.userFonts).then(() => { fontKey = ''; ensureFonts(); S.need = true; }).catch(() => {});
  let mode = 'easy'; try { mode = localStorage.getItem('jizura.mode') || 'easy'; } catch (e) {}
  setMode(mode); commit();
  // open on a representative frame (end of the first cut's entrance)
  const c0 = S.plan.cuts.find(c => c.line >= 0);
  if (c0) seek(c0.start + Math.min(c0.dur * 0.6, c0.inDur + 0.25));
  requestAnimationFrame(tick);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
J.ui = S;
// hooks for hosts that embed the app (the After Effects CEP panel)
J.uiApi = { toast, replan, syncUI, pause, seek, flushSave, loadAudioFile, restartPreview,
  openProjectFile, replaceProject, ensureFonts, splitMediaCut, insertLyricAtPlayhead,
  removeLyricCut, removeMediaCut, connectTimelineBoundaries,
  boundaryGroupLimits, commitTimelineBoundary };
})();
