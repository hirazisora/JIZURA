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
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M10 3V2H2v8h1"/></svg>',
  paste: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 3H2v11h12V3h-3"/><rect x="5" y="1" width="6" height="4" rx="1"/><path d="M5 8h6M5 11h6"/></svg>',

  details: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h12M2 8h12M2 12h12"/><path d="M5 2v4M11 6v4M7 10v4" stroke-width="3"/></svg>',
  area: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10"/><path d="M2 6h12M5 3v10"/></svg>',
  remove: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m4 4 8 8m0-8-8 8"/></svg>',

  dice: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/><circle cx="10.5" cy="10.5" r="1" fill="currentColor"/><circle cx="10.5" cy="5.5" r="1" fill="currentColor"/><circle cx="5.5" cy="10.5" r="1" fill="currentColor"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>',
  frontmost: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="5" width="10" height="8" rx="1"/><path d="M5 2h9v8M8 4l2 2 2-2"/></svg>',
};

const S = { project: null, plan: null, audio: null, renderer: new J.Renderer(), playing: false, t: 0, t0: 0, loop: true, need: true, exporting: null, tap: null, linkDrag: null, slow: false, lineEls: [], blankEls: new Map(), mediaLineEls: [], sourceTab: 'lyrics', curLine: -2, timelineZoom: 1 };

/* WebAudio player (works inside sandboxed pages where blob media may be blocked) */
const AP = {
  ctx: null, src: null, startAt: 0,
  play(buffer, offset) {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.stop();
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.connect(this.ctx.destination);
    const off = Math.max(0, Math.min(offset, buffer.duration - 0.01));
    s.start(0, off); this.src = s; this.startAt = this.ctx.currentTime - off;
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
function mergeProject(p) {
  const d = J.defaultProject();
  const o = Object.assign(d, p || {});
  if (o.videoSize) { const [w, h] = J.outputSize(o); o.videoSize = { w, h }; }
  o.fx = Object.assign(J.defaultProject().fx, (p && p.fx) || {});
  o.timing = Object.assign(J.defaultProject().timing, (p && p.timing) || {});
  o.timing.cutTimes = o.timing.cutTimes || {};
  const en = J.defaultProject().enabled;
  for (const g of Object.keys(en)) en[g] = Object.assign(en[g], ((p && p.enabled) || {})[g] || {});
  o.enabled = en;
  o.overrides = (p && p.overrides) || {};
  o.lyricCutOptions = (p && p.lyricCutOptions) || {};
  o.lyricEffects = J.lyricEffectSettings(o);
  o.themes = J.themeIds(o);
  delete o.jevPrompt;
  o.lyricBlankCuts = Array.isArray(p && p.lyricBlankCuts) ? p.lyricBlankCuts : [];
  o.timelineLinks = Array.isArray(p && p.timelineLinks) ? p.timelineLinks : [];
  o.media = J.normalizeMedia(p && p.media);
  o.foreground = J.normalizeMedia(p && p.foreground);
  for (const layer of ['media', 'foreground']) o[layer].effects = J.mediaEffectSettings(o, layer);
  delete o.mediaEffects;
  o.colors = Object.assign({ enabled: false }, (p && p.colors) || {});
  o.fonts = (p && p.fonts) || {};
  o.userFonts = (p && p.userFonts) || [];
  for (const uf of o.userFonts) if (!J.FONTS[uf.key]) J.addUserFont(uf.key, uf.label, uf.family, uf.weight || 400);
  o.compositeFonts = Array.isArray(p && p.compositeFonts) ? p.compositeFonts : [];
  J.setCompositeFonts(o.compositeFonts);
  J.migrateLyricCompositing(o);
  return o;
}
function setBadges(d) {
  return (d && d.extra ? '<span class="set-badge ex" title="最初の公開版のあとに追加">追加</span>' : '') + (d && d.wa ? '<span class="set-badge" title="和風の演出">和</span>' : '');
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
      await J.removeMedia(id);
      const asset = J.mediaAssets.get(id);
      if (asset) { URL.revokeObjectURL(asset.url); J.mediaAssets.delete(id); }
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
function replan() {
  S.plan = J.plan(S.project, audioLike());
  S.plan.media = J.planMedia(S.project, S.plan, S.audio && S.audio.duration);
  S.plan.foreground = J.planMedia(S.project, S.plan, S.audio && S.audio.duration, 'foreground');
  S.plan.duration = Math.max(S.plan.media.duration, S.plan.foreground.duration);
  for (const layer of ['media', 'foreground']) {
    S.plan[layer].duration = S.plan.duration;
    const last = S.plan[layer].cuts.at(-1); if (last && last.videoDuration == null) last.end = S.plan.duration;
  }
  if (S.tap && S.tap.append && !S.audio) extendTapPreview(S.t);
  langNote();
  if (S.t > S.plan.duration) S.t = Math.max(0, S.plan.duration - 1e-3);
  const temporarilyHidden = ref => S.project.durationOverride != null && /^l:\d+:\d+$/.test(ref) && +ref.split(':')[1] < S.plan.lines.length;
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
  const txt = S.project.lyrics + (S.project.title || '') + (S.project.artist || '') + HUD_CHARS;
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
  let cssW = vp.clientWidth || 800, cssH = cssW / ar;
  const maxH = Math.max(220, window.innerHeight * 0.68);
  if (cssH > maxH) { cssH = maxH; cssW = cssH * ar; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(Math.min(S.plan.W, cssW * dpr)), ph = Math.round(pw / ar);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  c.style.width = cssW + 'px'; c.style.height = cssH + 'px';
  positionAreaEditor();
  S.need = true;
}
function draw() {
  const c = $('view'), ctx = c.getContext('2d');
  J.syncMediaPreview(S.plan, S.t, S.playing);
  const t0 = performance.now();
  const previewCuts = S.areaEdit && S.areaEdit.kind === 'lyric' && S.areaEdit.draft ? S.plan.cuts.filter(cut => cut.line === S.areaEdit.index) : [];
  const previousAreas = previewCuts.map(cut => cut.area);
  previewCuts.forEach(cut => { cut.area = { ...S.areaEdit.draft, angle: S.areaEdit.angle }; });
  const edit = S.areaEdit, mediaCut = edit && edit.kind !== 'lyric' && S.plan[edit.kind].cuts[edit.index];
  const previousMedia = mediaCut && { placement: mediaCut.placement, zoom: mediaCut.zoom, hold: mediaCut.hold, enter: mediaCut.enter, exit: mediaCut.exit, trans: mediaCut.trans };
  if (mediaCut) Object.assign(mediaCut, { placement: { cx: edit.draft.x + edit.draft.w / 2, cy: edit.draft.y + edit.draft.h / 2, w: edit.draft.w, h: edit.draft.h, lockAspect: edit.lockAspect, angle: edit.angle }, zoom: 100, hold: 'still', enter: 'cut', exit: 'cut', trans: undefined });
  try { S.renderer.frame(ctx, S.plan, S.t, { scale: c.width / S.plan.W, fast: !!edit || S.playing && S.slow, noTrans: !!edit, noPost: !!edit, previewEdit: !!edit, noForeground: !!edit && edit.kind === 'media' }); }
  finally { previewCuts.forEach((cut, i) => { cut.area = previousAreas[i]; }); if (mediaCut) Object.assign(mediaCut, previousMedia); }
  const dt = performance.now() - t0;
  S.slow = S.playing ? (dt > 30 ? true : dt < 14 ? false : S.slow) : false;
  updateTimeUI(); drawTimeline(); updateCutInfo(); drawItemFrames();
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
function updateTimeUI() {
  $('timeNow').textContent = J.fmtTime(S.t);
  $('timeDur').textContent = J.fmtTime(S.durationDrag ? S.durationDrag.preview : S.plan.duration);
  $('timeDur').classList.toggle('manual', S.project.durationOverride != null || !!S.durationDrag);
  if (!S.scrubbing) $('scrub').value = String(Math.round(S.t / Math.max(0.001, S.plan.duration) * 10000));
}
function minimumProjectDuration() {
  let minimum = 0.1;
  for (const line of S.plan.lines) minimum = Math.max(minimum, line.start + 0.04);
  for (const blank of S.project.lyricBlankCuts || []) if (Number.isFinite(+blank.start)) minimum = Math.max(minimum, +blank.start + 0.04);
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
function play() {
  if (S.audio) AP.play(S.audio.buffer, S.t);
  else S.t0 = performance.now() - S.t * 1000;
  S.playing = true; $('btnPlay').textContent = '❚❚'; $('btnPlay').setAttribute('aria-label', '一時停止');
}
function pause() {
  S.playing = false; AP.stop();
  J.syncMediaPreview(S.plan, S.t, false);
  $('btnPlay').textContent = '▶'; $('btnPlay').setAttribute('aria-label', '再生'); S.need = true;
}
function seek(t) {
  S.t = J.clamp(t, 0, Math.max(0, S.plan.duration - 1e-3));
  if (S.audio) { if (S.playing) AP.play(S.audio.buffer, S.t); }
  else S.t0 = performance.now() - S.t * 1000;
  J.syncMediaPreview(S.plan, S.t, S.playing);
  S.need = true;
}

/* ---------------- timeline ---------------- */
const layoutHue = k => (J.LAYOUT_ORDER.indexOf(k) * 37 + 30) % 360;
function sizeTimelineStack() {
  const scroll = $('timelineScroll'), stack = $('timelineStack');
  const width = Math.max(10, Math.round(scroll.clientWidth * S.timelineZoom));
  if (stack.style.width !== `${width}px`) stack.style.width = `${width}px`;
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
function drawTimeline() {
  sizeTimelineStack();
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
  const top = h * 0.3, bot = h - 8 * dpr;
  for (const cut of S.plan.cuts) {
    const x0 = X(cut.start), x1 = X(cut.end);
    const hue = cut.blank ? 190 : layoutHue(cut.layout);
    x.fillStyle = `hsla(${hue},70%,58%,0.28)`; x.fillRect(x0, top, Math.max(1, x1 - x0 - 1), bot - top);
    x.fillStyle = `hsla(${hue},80%,62%,0.95)`; x.fillRect(x0, top, Math.max(1, 2 * dpr), bot - top);
    if (cut.line >= 0) x.fillRect(x0 - 2 * dpr, top - 3 * dpr, 6 * dpr, 6 * dpr);
    if (x1 - x0 > 34 * dpr) {
      x.fillStyle = 'rgba(236,231,225,0.85)'; x.font = `${10 * dpr}px ${getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace'}`;
      x.save(); x.beginPath(); x.rect(x0, top, x1 - x0 - 3, bot - top); x.clip();
      x.fillText(cut.blank ? '無表示' : (cut.text || cut.lineText || ''), x0 + 5 * dpr, top + 13 * dpr); x.restore();
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
function drawMediaTimeline(layer = 'media') {
  const c = $(layer === 'media' ? 'mediaTimeline' : 'foregroundTimeline'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(10, Math.round(c.clientWidth * dpr)), h = Math.max(10, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d'), D = Math.max(0.001, S.plan.duration), X = t => t / D * w;
  x.fillStyle = '#131316'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#8e8a94'; x.font = `${10 * dpr}px monospace`; x.fillText(layer === 'media' ? '背景' : '前景', 6 * dpr, 12 * dpr);
  for (const cut of S.plan[layer].cuts) {
    const a = X(cut.start), b = X(cut.end);
    x.fillStyle = cut.type === 'video' ? 'rgba(22,244,212,0.28)' : 'rgba(245,165,12,0.28)'; x.fillRect(a, 17 * dpr, Math.max(1, b - a - 1), h - 20 * dpr);
    x.fillStyle = cut.type === 'video' ? '#16f4d4' : '#f5a50c'; x.fillRect(a, 17 * dpr, 2 * dpr, h - 20 * dpr);
    x.fillRect(a - 2 * dpr, 14 * dpr, 6 * dpr, 6 * dpr);
    if (b - a > 45 * dpr) { x.save(); x.beginPath(); x.rect(a, 17 * dpr, b - a - 3, h - 20 * dpr); x.clip(); x.fillStyle = '#ece7e1'; x.fillText(cut.name, a + 5 * dpr, 31 * dpr); x.restore(); }
  }
  x.fillStyle = '#f5a50c'; x.fillRect(Math.round(X(S.t)) - dpr, 0, 2 * dpr, h);
  drawTimelineDragGuide(x, w, h, dpr, layer);
}
function drawTimelineDragGuide(ctx, width, height, dpr, layer) {
  const drag = S.timelineDrag;
  if (!drag || !drag.moved || !linkedRefs(drag.ref).some(ref => boundaryLayer(ref) === layer)) return;
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
  return cut.blank ? `l:blank:${cut.blankId}` : `l:${cut.line}:${cut.part}`;
}
function boundaryLayer(ref) { return ref[0] === 'f' ? 'foreground' : ref[0] === 'm' ? 'media' : 'lyrics'; }
function boundaryCut(ref) {
  if (typeof ref !== 'string' || !S.plan) return null;
  const layer = boundaryLayer(ref);
  if (layer !== 'lyrics') {
    const index = +ref.slice(2);
    return Number.isInteger(index) && index >= 0 && ref === `${ref[0]}:${index}` ? S.plan[layer].cuts[index] || null : null;
  }
  if (ref.startsWith('l:blank:')) return S.plan.cuts.find(c => c.blank && c.blankId === ref.slice(8)) || null;
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
    const canvas = $(id), cuts = layer === 'lyrics' ? S.plan.cuts.filter(c => c.line >= 0 || c.blank) : S.plan[layer].cuts;
    const y = canvas.offsetTop + 11;
    for (const cut of cuts) markers.push({ ref: boundaryRef(layer, cut), layer, x: canvas.offsetLeft + cut.start / D * canvas.clientWidth, y });
  }
  return markers;
}
function rerollLyricLine(index) {
  const line = S.plan.lines[index]; if (!line) return;
  const current = S.project.overrides[index] || {};
  setOv(index, { seed: (current.seed | 0) + 1, lock: false });
  replan(); seek(line.start + 0.001);
}
function toggleLyricLineLock(index) {
  const line = S.plan.lines[index]; if (!line) return;
  const current = S.project.overrides[index] || {};
  const lockedAreas = Object.fromEntries(S.plan.cuts.filter(c => c.line === index && Number.isInteger(c.part)).map(c => [c.part, c.area || null]));
  const lockedComposites = Object.fromEntries(S.plan.cuts.filter(c => c.line === index && Number.isInteger(c.part)).map(c => [c.part, { blend: c.blend, opacity: c.opacity }]));
  setOv(index, current.lock ? { lock: false, lockedSeed: undefined, lockedAreas: undefined, lockedComposites: undefined } : { lock: true, lockedSeed: line.seed, lockedAreas, lockedComposites });
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
  mediaOv(index, { technique: null, seed: (options.seed | 0) + 1, lock: false }, layer);
  replan(); seek(cut.start + 0.001);
}
function toggleMediaCutLock(layer, index) {
  const cut = S.plan[layer].cuts[index], options = mediaCutOptions(layer, index);
  if (!cut || !options) return;
  mediaOv(index, options.lock ? { lock: false, lockedSeed: undefined, lockedTechnique: undefined, lockedEntrance: undefined, lockedDeparture: undefined, lockedPlacement: undefined, lockedPlacementMode: undefined, lockedItemId: undefined } : { lock: true, lockedSeed: cut.seed, lockedTechnique: cut.technique, lockedEntrance: cut.entrance, lockedDeparture: cut.departure, lockedPlacement: cut.placement && { ...cut.placement }, lockedPlacementMode: cut.placementMode, lockedItemId: cut.itemId }, layer);
  replan();
}
let effectClipboard=null,localEffectClipboard=false;
async function effectClipboardAction(action,layer,index,part=0){
  const getCut=()=>layer==='lyrics'?S.plan.cuts.find(c=>c.line===index&&c.part===part):S.plan[layer]?.cuts[index];
  const cut=getCut();if(!cut)return;
  const L=J.mediaLabel;
  if(action==='copy'){
    const text=JSON.stringify(J.cutEffectsPayload(cut,layer,S.plan));effectClipboard=text;
    try{await navigator.clipboard.writeText(text);localEffectClipboard=false;toast(L('演出をクリップボードにコピーしました','Effects copied to clipboard'));}
    catch(e){localEffectClipboard=true;toast(L('演出をコピーしました（このページ内で貼り付け可能）','Effects copied (paste within this page)'));}
    return;
  }
  pause();const project=S.project;
  let text;if(localEffectClipboard)text=effectClipboard;else try{text=await navigator.clipboard.readText();}catch(e){text=effectClipboard;}
  if(project!==S.project||getCut()!==cut||S.playing){toast(L('カットが変更されました。もう一度貼り付けてください','The cut changed. Paste again.'));return;}
  try{
    const payload=J.readCutEffects(text);
    if(payload.kind!==(layer==='lyrics'?'lyrics':'media')){toast(L('歌詞同士、または前景・背景同士で貼り付けてください','Paste between lyric cuts, or between foreground/background cuts'));return;}
    remember();J.pasteCutEffects(S.project,S.plan,layer,cut,payload);replan();
    toast(L('表示エリアを維持して演出を貼り付けました','Effects pasted; display area preserved'));
  }catch(e){toast(L('貼り付け可能な演出がクリップボードにありません','The clipboard does not contain valid cut effects'));}
}
function effectClipboardButtons(layer,index,part=0){
  return ['copy','paste'].map(action=>{
    const button=document.createElement('button');button.type='button';button.className='icon ghost effect-'+action;
    button.title=action==='copy'?J.mediaLabel('演出をコピー','Copy effects'):J.mediaLabel('演出をペースト','Paste effects');button.setAttribute('aria-label',button.title);
    button.innerHTML=ICON[action];button.onclick=()=>effectClipboardAction(action,layer,index,part);return button;
  });
}
function detailButton(onClick) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'icon ghost cut-details-open';
  button.title = J.mediaLabel('カットの詳細編集','Edit cut details'); button.setAttribute('aria-label',button.title);
  button.innerHTML = ICON.details; button.addEventListener('click',onClick); return button;
}
function openCutDetails(layer,index,part=0) {
  const lyric = layer === 'lyrics', L = J.mediaLabel, clone = value => JSON.parse(JSON.stringify(value));
  const blank = lyric && part === 'blank';
  const cut = blank ? S.plan.cuts[index] : lyric ? S.plan.cuts.find(c=>c.line===index && c.part===part) : S.plan[layer]?.cuts[index];
  if (!cut) return;
  pause();
  const key = `${index}:${part}`, original = clone(lyric ? S.project.lyricCutOptions[key] || {} : S.project[layer].cutOverrides[index] || {});
  let draft = clone(original), current = clone(cut), start = cut.start;
  let locked = !!(lyric ? S.project.overrides[index]?.lock : original.lock);
  const initialLock = locked;
  const dialog = document.createElement('dialog'); dialog.id='cutDetailsDialog'; dialog.className='cut-details-dialog';
  dialog.setAttribute('aria-label',L('カットの詳細編集','Edit cut details'));
  document.body.appendChild(dialog);
  const names = {
    text:['歌詞','Lyrics'],layout:['レイアウト','Layout'],enter:['登場','Entrance'],hold:['保持・モーション','Hold / motion'],exit:['退場','Exit'],
    inDur:['登場時間（秒）','Entrance duration (s)'],outDur:['退場時間（秒）','Exit duration (s)'],stagger:['文字の時間差（秒）','Character delay (s)'],
    decor:['装飾','Decoration'],scheme:['配色','Palette'],params:['レイアウト詳細','Layout parameters'],treat:['加工','Treatment'],treatP:['加工の詳細','Treatment parameters'],
    bg:['背景演出','Background effect'],bgP:['背景演出の詳細','Background parameters'],cam:['カメラ','Camera'],camP:['カメラ詳細','Camera parameters'],
    trans:['カット間のつなぎ','Transition'],transP:['つなぎの詳細','Transition parameters'],transDur:['つなぎ時間（秒）','Transition duration (s)'],
    area:['表示範囲（画面比率）','Display area (stage ratios)'],placement:['配置・サイズ（画面比率）','Placement / size (stage ratios)'],
    motionScale:['動きの倍率','Motion scale'],contentScale:['文字サイズ倍率','Text scale'],effectSettings:['演出パラメータ','Effect parameters'],
    motion:['動きの強さ','Motion amount'],treatment:['加工の強さ','Treatment amount'],duration:['登場・退場時間（秒）','Entrance / exit duration (s)'],bpm:['BPM','BPM'],beatOffset:['拍の開始位置（秒）','Beat offset (s)'],x:['左位置','Left'],y:['上位置','Top'],cx:['中心 X','Center X'],cy:['中心 Y','Center Y'],w:['幅','Width'],h:['高さ','Height'],angle:['角度（度）','Angle (degrees)'],lockAspect:['縦横比を固定','Lock aspect ratio'],
    technique:['手法','Technique'],entrance:['登場','Entrance'],departure:['退場','Exit'],itemId:['素材','Asset'],frontmost:['最前に表示','Frontmost'],blend:['合成方法','Blend mode'],opacity:['不透明度（％）','Opacity (%)'],videoLoop:['動画をループ再生','Loop video'],videoDuration:['動画の長さ（秒）','Video duration (s)'],chromaKey:['クロマキー合成','Chroma key'],chromaColor:['クロマキー色','Key color'],
    font:['フォント','Font'],size:['サイズ','Size'],scale:['倍率','Scale'],rotation:['回転','Rotation'],color:['色','Color'],alpha:['不透明度','Opacity'],seed:['乱数シード','Random seed'],n:['個数','Count'],id:['種類','Type'],sx:['横方向倍率','Horizontal scale'],sy:['縦方向倍率','Vertical scale'],
  };
  const label = key => names[key] ? L(...names[key]) : key;
  const nativeKeys = blank ? [] : lyric ? ['frontmost','blend','opacity'] : ['itemId','technique','entrance','departure','placement','videoLoop','videoDuration','chromaKey','chromaColor'];
  function preview() {
    const project = clone(S.project);
    if (lyric) project.lyricCutOptions[key]=draft; else project[layer].cutOverrides[index]=draft;
    const plan=J.plan(project,audioLike());
    current=lyric ? plan.cuts.find(c=>c.line===index&&c.part===part) : J.planMedia(project,plan,S.audio?.duration,layer).cuts[index];
    render();
  }
  function write(field,value,native) {
    if (!lyric && native && ['technique','entrance','departure','itemId'].includes(field)) {
      draft.lock = false; locked = false;
    }
    if(native) draft[field]=value; else { draft.details ||= {}; draft.details[field]=value; }
  }
  function options(field) {
    if(field==='blend') return ['normal','multiply','screen','overlay'].map((v,i)=>[v,[L('通常','Normal'),L('乗算','Multiply'),L('スクリーン','Screen'),L('オーバーレイ','Overlay')][i]]);
    if(field==='itemId') return [['',L('画像無し','No image')],...J.mediaCopyItems(layer).map(a=>[a.id,a.name]),...S.project[layer].items.map(a=>[a.id,a.name])];
    if(field==='scheme') return S.plan.style.schemes.map((_,i)=>[String(i),String(i+1)]);
    if(field==='technique') return [['',L('自動','Auto')],['none',L('演出無し','No effects')],...Object.entries(J.MEDIA_TECH).filter(([,d])=>!d.stage).map(([id,d])=>[id,d.name])];
    if(field==='entrance'||field==='departure') return [['',L('自動','Auto')],['none',L('即時（なし）','Instant (none)')],...J.mediaPhaseOptions(field==='entrance'?'enter':'exit').map(([id,d])=>[id,d.name])];
    if(!lyric && ['layout','hold','treat'].includes(field)) {
      const registry=J['MEDIA_'+field.toUpperCase()] || {}, entries=Object.entries(registry).map(([id,d])=>[id,typeof d==='string'?d:d.name||id]);
      for(const def of Object.values(J.MEDIA_TECH)) if(def[field]&&!entries.some(([id])=>id===def[field])) entries.push([def[field],def.name+' / '+def[field]]);
      return entries;
    }
    const reg={layout:J.LAYOUTS,enter:J.ENTER,hold:J.HOLD,exit:J.EXIT,treat:J.TREAT,bg:J.BG,cam:J.CAMERA,trans:J.TRANS,font:J.FONTS,id:J.DECOR}[field];
    return reg ? [...(field==='trans'?[['none',L('なし','None')]]:[]),...Object.entries(reg).map(([id,d])=>[id,d.name||id])] : null;
  }
  function fieldEditor(parent,field,value,onChange,path=field) {
    if(value && typeof value==='object') {
      const section=document.createElement('details'); section.open=['area','placement'].includes(field);
      const title=document.createElement('summary'); title.textContent=label(field); section.append(title);
      const grid=document.createElement('div'); grid.className='cut-details-grid';section.append(grid);parent.append(section);
      for(const [child,v] of Object.entries(value)) {
        // Random candidate pools belong to the layer; this editor changes the resolved cut.
        if(['enabled','randomize','autoPlacement','sizeMin','sizeMax'].includes(child)) continue;
        fieldEditor(grid,child,v,next=>{
          if (value.lockAspect && ['w','h'].includes(child) && value[child]>0) {
            const other=child==='w'?'h':'w'; value[other]*=next/value[child];
            const input=grid.querySelector(`[data-detail-field="${path}.${other}"]`);if(input)input.value=value[other];
          }
          value[child]=next;onChange(clone(value));
        },`${path}.${child}`);
      }
      if(field==='decor') {
        const add=document.createElement('button');add.type='button';add.textContent=L('装飾を追加','Add decoration');
        add.onclick=()=>{value.push({id:Object.keys(J.DECOR)[0],seed:cut.seed,n:1});onChange(clone(value));preview();};section.append(add);
      }
      if(Array.isArray(value)) value.forEach((_,i)=>{const del=document.createElement('button');del.type='button';del.textContent=L(`${i+1} を削除`,`Remove ${i+1}`);del.onclick=()=>{value.splice(i,1);onChange(clone(value));preview();};section.append(del);});
      return;
    }
    const row=document.createElement('label');row.className='cut-detail-field';const text=document.createElement('span');text.textContent=label(field);row.append(text);
    const choices=options(field); const input=document.createElement(choices?'select':field==='text'?'textarea':'input');input.dataset.detailField=path;
    if(choices) { for(const [v,n] of choices) input.add(new Option(n,v));if(value!=null&&!choices.some(([v])=>String(v)===String(value))) input.add(new Option(String(value),String(value)));input.value=value??''; }
    else if(typeof value==='boolean'){input.type='checkbox';input.checked=value;}
    else if(typeof value==='number'){input.type='number';input.step='any';input.value=value; if(['w','h','n','inDur','outDur','transDur','stagger','motionScale','contentScale','videoDuration','opacity'].includes(field)) input.min=field==='videoDuration'?.04:0; if(field==='opacity')input.max=100;}
    else {if(field!=='text')input.type=/^#[0-9a-f]{6}$/i.test(value||'')?'color':'text';input.value=value??'';}
    if(lyric && field==='frontmost' && cut.emphasis){input.disabled=true;input.title=emphasisFrontmostHint();}
    input.addEventListener('change',()=>{
      const v=typeof value==='boolean'?input.checked:typeof value==='number'?Number(input.value):input.value;
      if(typeof v==='number'&&!Number.isFinite(v))return;
      onChange(v);
      if(choices && !path.includes('.')) {
        const param={layout:'params',treat:'treatP',bg:'bgP',cam:'camP',trans:'transP'}[field];
        if(param&&draft.details)delete draft.details[param];
        if(field==='technique'&&draft.details)for(const key of ['hold','treat','trans','transP'])delete draft.details[key];
        preview();
      }
    });
    row.append(input);parent.append(row);
  }
  function render() {
    dialog.replaceChildren();const form=document.createElement('form');dialog.append(form);
    const heading=document.createElement('h2');heading.textContent=L('カットの詳細編集','Edit cut details')+' — '+(lyric?L('歌詞','Lyrics'):layer==='foreground'?L('前景','Foreground'):L('背景','Background'))+` ${index+1}${lyric?` / ${part+1}`:''}`;form.append(heading);
    const hint=document.createElement('p');hint.className='hint';hint.textContent=L('変更は「適用」で確定します。数値は現在のカットの値です。表示範囲の 1 は画面全体の幅・高さに相当します。','Changes are saved with Apply. Values describe this cut. A display-area ratio of 1 equals the full stage width or height.');form.append(hint);
    const grid=document.createElement('div');grid.className='cut-details-grid';form.append(grid);
    const group=boundaryGroupLimits(boundaryRef(layer,cut));
    fieldEditor(grid,'start',start,v=>{start=v;});
    const time=grid.querySelector('input');time.previousSibling.textContent=L('開始位置（秒・リンク先も移動）','Start (s; linked cuts move together)');time.min=group?.min??0;time.max=group?.max??S.plan.duration;time.disabled=!group;
    if(!blank) {
      fieldEditor(grid,'lock',locked,v=>{locked=v;});
      grid.lastChild.querySelector('span').textContent=lyric?L('行の構成をロック','Lock line composition'):L('カットをロック','Lock cut');
    }
    for(const field of nativeKeys) {
      if(['videoLoop','videoDuration','chromaKey','chromaColor'].includes(field)&&current.type!=='video')continue;
      let value=draft[field]??current[field];
      if(['technique','entrance','departure'].includes(field)&&Object.hasOwn(draft,field))value=draft[field]??'';
      if(field==='placement')value ||= {cx:.5,cy:.5,w:1,h:1,angle:0,lockAspect:true};
      if(field==='videoDuration')value=Number(value)||current.end-current.start;
      fieldEditor(grid,field,clone(value??(field==='opacity'?100:'')),v=>write(field,['itemId','technique','entrance','departure'].includes(field)&&v===''?null:v,true));
    }
    for(const field of blank ? [] : J.cutDetailKeys[lyric?'lyrics':'media']) {
      let value=current[field];
      if(field==='area')value ||= {x:0,y:0,w:1,h:1,angle:0,lockAspect:true};
      if(field==='trans')value ||= 'none';
      if(value===undefined)continue;
      fieldEditor(grid,field,clone(value),v=>write(field,field==='scheme'?+v:v,false));
    }
    const buttons=document.createElement('div');buttons.className='cut-details-actions';form.append(buttons);
    const reset=document.createElement('button');reset.type='button';reset.textContent=L('詳細編集をリセット','Reset detail overrides');reset.onclick=()=>{delete draft.details;preview();};
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent=L('キャンセル','Cancel');cancel.onclick=()=>dialog.close();
    const apply=document.createElement('button');apply.type='submit';apply.textContent=L('適用','Apply');buttons.append(reset,cancel,apply);
    form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;
      if(!blank) { if(lyric) S.project.lyricCutOptions[key]=draft; else S.project[layer].cutOverrides[index]=draft; }
      if(!blank && (locked !== initialLock || !lyric)) {
        if(lyric) setOv(index,locked ? {lock:true,lockedSeed:S.plan.lines[index].seed,
          lockedAreas:Object.fromEntries(S.plan.cuts.filter(c=>c.line===index&&Number.isInteger(c.part)).map(c=>[c.part,c.area||null])),
          lockedComposites:Object.fromEntries(S.plan.cuts.filter(c=>c.line===index&&Number.isInteger(c.part)).map(c=>[c.part,{blend:c.blend,opacity:c.opacity}]))
        } : {lock:false,lockedSeed:undefined,lockedAreas:undefined,lockedComposites:undefined});
        else mediaOv(index,locked ? {lock:true,lockedSeed:current.seed,lockedTechnique:current.technique,lockedEntrance:current.entrance,lockedDeparture:current.departure,lockedPlacement:draft.placement||current.placement,lockedPlacementMode:current.placementMode,lockedItemId:current.itemId} : {lock:false},layer);
      }
      if(group&&start!==cut.start) for(const member of group.members)setTimelineBoundaryTime(member,J.clamp(start,group.min,group.max));
      replan();dialog.close();
    };
  }
  dialog.addEventListener('close',()=>dialog.remove());render();dialog.showModal();
}
// Preview controls are DOM overlays, so they never enter exported frames.
let itemFrameSignature = '';
function drawItemFrames() {
  const overlay=$('itemFrames'), view=$('view').getBoundingClientRect(), host=$('viewport').getBoundingClientRect();
  overlay.hidden=!$('showItemFrames').checked || !!S.areaEdit || !!S.exporting;
  if(overlay.hidden) { itemFrameSignature=''; return; }
  Object.assign(overlay.style,{left:`${view.left-host.left}px`,top:`${view.top-host.top}px`,width:`${view.width}px`,height:`${view.height}px`});
  const items=[];
  for(const layer of ['foreground','lyrics','media']) {
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
  const L=J.mediaLabel,labels={copy:L('演出をコピー','Copy effects'),paste:L('演出をペースト','Paste effects'),dice:L('再抽選','Randomize'),lock:L('ロック','Lock'),area:L('表示範囲','Display area'),details:L('詳細編集','Edit details'),remove:L('削除','Delete'),frontmost:L('最前に表示','Frontmost')};
  const layerNames={foreground:L('前景','Foreground'),lyrics:L('歌詞','Lyrics'),media:L('背景','Background')};
  const occupied=[];
  const html=items.map(({layer,cut,index,area})=>{
    const locked=layer==='lyrics'?!!S.project.overrides[index]?.lock:!!mediaCutOptions(layer,index)?.lock;
    const cx=(area.x+area.w/2)*view.width,cy=(area.y+area.h/2)*view.height,a=(area.angle||0)*Math.PI/180;
    const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{x*=area.w*view.width/2;y*=area.h*view.height/2;return [cx+x*Math.cos(a)-y*Math.sin(a),cy+x*Math.sin(a)+y*Math.cos(a)];});
    const actions=['dice','lock','area','details','copy','paste','remove',...(layer==='lyrics'?['frontmost']:[])];
    const width=Math.min(view.width,actions.length*25+68),x=J.clamp(points[0][0],0,Math.max(0,view.width-width));
    let y=J.clamp(points[0][1],0,Math.max(0,view.height-26));
    while(occupied.some(r=>x<r.x+r.w && x+width>r.x && y<r.y+26 && y+26>r.y) && y+52<=view.height)y+=26;
    occupied.push({x,y,w:width});
    const controls=actions.map(action=>{
      const active=action==='lock'?locked:action==='frontmost'?!!cut.frontmost:false;
      return `<button type="button" class="item-frame-action ${active?'active':''}" data-action="${action}" data-layer="${layer}" data-index="${index}" data-part="${cut.part??0}" title="${labels[action]}" aria-label="${layerNames[layer]} ${labels[action]}" ${['lock','frontmost'].includes(action)?`aria-pressed="${active}"`:''} ${S.playing?'disabled':''}>${ICON[action]}</button>`;
    }).join('');
    return `<svg class="item-frame-outline ${layer}" width="100%" height="100%" aria-hidden="true"><polygon points="${points.map(p=>p.join(',')).join(' ')}"/></svg><div class="item-frame-tools ${layer}" style="left:${x}px;top:${y}px;max-width:${view.width}px" data-layer="${layer}"><span>${layerNames[layer]} ${index+1}</span>${controls}</div>`;
  }).join('');
  if(itemFrameSignature!==html){overlay.innerHTML=html;itemFrameSignature=html;}
}
function removeLyricCut(line,part) {
  remember();
  const key=`${line}:${part}`;
  S.project.lyricCutOptions[key]={...S.project.lyricCutOptions[key],removed:true};
  replan();
}
function performTimelineAction(control) {
  if (control.classList.contains('item-frame-action') && S.playing) return;
  const layer = control.dataset.layer, index = +control.dataset.index;
  if (!Number.isInteger(index) || index < 0) return;
  if (['copy','paste'].includes(control.dataset.action)) { effectClipboardAction(control.dataset.action,layer,index,+control.dataset.part||0); return; }
  if (control.dataset.action === 'details') { openCutDetails(layer,index,control.dataset.part === 'blank' ? 'blank' : +control.dataset.part || 0); return; }
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
  const action = (layer, cut, index, locked) => {
    const canvas = $(layer === 'lyrics' ? 'timeline' : layer === 'foreground' ? 'foregroundTimeline' : 'mediaTimeline');
    const startX = canvas.offsetLeft + cut.start / Math.max(0.001, S.plan.duration) * canvas.clientWidth;
    const y = canvas.offsetTop + 11;
    const actions = [['dice', false, layer === 'lyrics' ? 'この行を再抽選' : 'このカットを再抽選', ICON.dice], ['lock', locked, layer === 'lyrics' ? 'この行の構成をロック' : 'このカットをロック', ICON.lock]];
    if (layer === 'lyrics' || J.mediaSourceAvailable(cut)) actions.push(['area', false, layer === 'lyrics' ? 'この行の表示エリアを編集' : 'このカットの配置とサイズを編集', ICON.area]);
    if (layer !== 'lyrics') actions.push(['details', false, J.mediaLabel('カットの詳細編集','Edit cut details'), ICON.details]);
    if (layer !== 'lyrics') for(const name of ['copy','paste'])actions.push([name,false,name==='copy'?J.mediaLabel('演出をコピー','Copy effects'):J.mediaLabel('演出をペースト','Paste effects'),ICON[name]]);
    if (layer !== 'lyrics') actions.push(['remove', false, 'このカットを削除', ICON.remove]);
    const left = J.clamp(startX + 25, canvas.offsetLeft + 9, canvas.offsetLeft + canvas.clientWidth - (actions.length - 1) * 20 - 23);
    return actions.map(([name, active, label, icon], n) => {
      const x = left + n * 20, graphic = icon.replace('<svg ', '<svg x="-7" y="-7" width="14" height="14" ');
      return `<g class="timeline-action ${active ? 'locked' : ''}" data-action="${name}" data-layer="${layer}" data-index="${index}" role="button" tabindex="0" aria-label="${label}" ${name === 'lock' ? `aria-pressed="${active}"` : ''} transform="translate(${x} ${y})"><title>${label}</title><rect x="-9" y="-9" width="18" height="18" rx="3"/>${graphic}</g>`;
    }).join('');
  };
  const lyricActions = S.plan.lines.map(line => {
    const cut = S.plan.cuts.find(c => c.line === line.index && c.part === 0);
    return cut ? action('lyrics', cut, line.index, !!(S.project.overrides[line.index] || {}).lock) : '';
  }).join('');
  const frontmostActions = S.plan.cuts.filter(cut => cut.line >= 0 && Number.isInteger(cut.part)).map(cut => {
    const canvas = $('timeline'), startX = canvas.offsetLeft + cut.start / Math.max(0.001, S.plan.duration) * canvas.clientWidth;
    const x = J.clamp(startX + 10, canvas.offsetLeft + 9, canvas.offsetLeft + canvas.clientWidth - 9);
    const y = canvas.offsetTop + 33, active = !!cut.frontmost;
    const clipboard=['copy','paste'].map((action,i)=>`<g class="timeline-action" data-action="${action}" data-layer="lyrics" data-index="${cut.line}" data-part="${cut.part}" role="button" tabindex="0" aria-label="${action==='copy'?J.mediaLabel('演出をコピー','Copy effects'):J.mediaLabel('演出をペースト','Paste effects')}" transform="translate(${Math.min(x+40+i*20,canvas.offsetLeft+canvas.clientWidth-9)} ${y})"><rect x="-9" y="-9" width="18" height="18" rx="3"/>${ICON[action].replace('<svg ','<svg x="-7" y="-7" width="14" height="14" ')}</g>`).join('');
    const graphic = ICON.frontmost.replace('<svg ', '<svg x="-7" y="-7" width="14" height="14" ');
    return `${clipboard}<g class="timeline-action ${active ? 'frontmost' : ''}" data-action="frontmost" data-layer="lyrics" data-index="${cut.line}" data-part="${cut.part}" role="button" tabindex="0" aria-label="${cut.line + 1}行目${cut.part + 1}カット目を最前に表示" aria-pressed="${active}" transform="translate(${x} ${y})"><rect x="-9" y="-9" width="18" height="18" rx="3"/>${graphic}</g><g class="timeline-action" data-action="details" data-layer="lyrics" data-index="${cut.line}" data-part="${cut.part}" role="button" tabindex="0" aria-label="${J.mediaLabel('カットの詳細編集','Edit cut details')}" transform="translate(${Math.min(x + 20,canvas.offsetLeft + canvas.clientWidth - 9)} ${y})"><title>${J.mediaLabel('カットの詳細編集','Edit cut details')}</title><rect x="-9" y="-9" width="18" height="18" rx="3"/>${ICON.details.replace('<svg ','<svg x="-7" y="-7" width="14" height="14" ')}</g>`;
  }).join('');
  const blankActions = S.plan.cuts.filter(c=>c.blank).map(c=> {
    const canvas=$('timeline'), x=canvas.offsetLeft+c.start/S.plan.duration*canvas.clientWidth+10;
    return `<g class="timeline-action" data-action="details" data-layer="lyrics" data-index="${c.index}" data-part="blank" role="button" tabindex="0" aria-label="${J.mediaLabel('カットの詳細編集','Edit cut details')}" transform="translate(${x} ${canvas.offsetTop+33})"><rect x="-9" y="-9" width="18" height="18" rx="3"/>${ICON.details.replace('<svg ','<svg x="-7" y="-7" width="14" height="14" ')}</g>`;
  }).join('');
  const mediaActions = ['foreground', 'media'].map(layer => S.plan[layer].cuts.map(cut => action(layer, cut, cut.index, !!mediaCutOptions(layer, cut.index).lock)).join('')).join('');
  svg.innerHTML = links + preview + handles + lyricActions + frontmostActions + blankActions + mediaActions;
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
function timelineBoundaryAt(ev, layer) {
  const rect = ev.currentTarget.getBoundingClientRect(), duration = S.plan.duration;
  const cuts = layer === 'lyrics' ? S.plan.cuts.filter(c => c.line >= 0 || c.blank) : S.plan[layer].cuts;
  let chosen = null, distance = 9;
  for (const cut of cuts) {
    const px = rect.left + cut.start / duration * rect.width, delta = Math.abs(ev.clientX - px);
    if (delta < distance) { chosen = cut; distance = delta; }
  }
  return chosen ? timelineBoundaryForCut(chosen, layer) : null;
}
function timelineBoundaryForCut(chosen, layer) {
  const duration = S.plan.duration;
  let min, max, target;
  if (layer !== 'lyrics') {
    const cutsForLayer = S.plan[layer].cuts, index = chosen.index;
    min = index ? cutsForLayer[index - 1].start + 0.04 : 0;
    max = index + 1 < cutsForLayer.length ? cutsForLayer[index + 1].start - 0.04 : duration - 0.04;
    target = { index };
  } else if (chosen.blank) {
    const rows = [...S.plan.lines.map(line => ({ start: line.start })), ...S.plan.cuts.filter(c => c.blank).map(c => ({ start: c.start, id: c.blankId }))].sort((a, b) => a.start - b.start);
    const i = rows.findIndex(row => row.id === chosen.blankId);
    min = i > 0 ? rows[i - 1].start + 0.04 : 0;
    max = i + 1 < rows.length ? rows[i + 1].start - 0.04 : duration - 0.04;
    target = { blankId: chosen.blankId };
  } else if (chosen.part === 'interlude') {
    const previous = S.plan.cuts.find(c => c.line === chosen.line && typeof c.part === 'number' && c.end === chosen.start);
    min = previous ? previous.start + 0.22 : S.plan.lines[chosen.line].start + 0.5;
    max = chosen.end - 1.31;
    target = { line: chosen.line, part: 'interlude' };
  } else if (chosen.part === 0) {
    const line = chosen.line, lines = S.plan.lines;
    min = line ? lines[line - 1].start + 0.35 : 0;
    max = line + 1 < lines.length ? lines[line + 1].start - 0.5 : duration - 0.5;
    const firstInner = S.project.timing.cutTimes && S.project.timing.cutTimes[`${line}:1`];
    if (firstInner != null && Number.isFinite(+firstInner)) max = Math.min(max, +firstInner - 0.22);
    target = { line, part: 0, nextLineStart: lines[line + 1] && lines[line + 1].start };
  } else {
    const previous = S.plan.cuts.find(c => c.line === chosen.line && c.part === chosen.part - 1);
    min = previous ? previous.start + 0.22 : S.plan.lines[chosen.line].start + 0.22;
    max = chosen.end - 0.22;
    target = { line: chosen.line, part: chosen.part };
  }
  return max > min ? { layer, ref: boundaryRef(layer, chosen), start: chosen.start, min, max, ...target } : null;
}
function setTimelineBoundaryTime(drag, t) {
  if (drag.layer === 'lyrics') {
    const timing = S.project.timing;
    if (drag.blankId) {
      const blank = S.project.lyricBlankCuts.find(b => b.id === drag.blankId);
      if (blank) blank.start = t;
    } else if (drag.part === 0) {
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
  S.blankEls.forEach((el, id) => el.classList.toggle('cur', !!cut && cut.blankId === id));
  const active = S.sourceTab === 'foreground' ? fc : mc;
  S.mediaLineEls.forEach((el, i) => el.classList.toggle('cur', !!active && i === active.index));
  if (idx === lastCutIdx) return;
  lastCutIdx = idx;
  const el = $('cutInfo');
  if (!cut && !mc && !fc) { el.innerHTML = '<span class="hint">この位置にカットはありません</span>'; return; }
  const chip = (cls, k, v) => `<span class="chip ${cls}"><b>${k}</b>${v}</span>`;
  const n = (tbl, k) => (tbl[k] ? tbl[k].name : k);
  el.innerHTML = (cut && cut.blank ? [chip('l', '歌詞', '無表示')] : cut ? [
    `<span class="chip mono">#${String(cut.index + 1).padStart(2, '0')}</span>`,
    chip('l', 'レイアウト', n(J.LAYOUTS, cut.layout)), chip('e', '登場', n(J.ENTER, cut.enter)), chip('h', '保持', n(J.HOLD, cut.hold)), chip('x', '退場', n(J.EXIT, cut.exit)),
    cut.decor && cut.decor.length ? chip('', '装飾', cut.decor.map(d => n(J.DECOR, d.id)).join('・')) : '',
    cut.treat && cut.treat !== 'none' ? chip('t', '加工', n(J.TREAT, cut.treat)) : '',
    cut.bg && cut.bg !== 'none' ? chip('b', '背景', n(J.BG, cut.bg)) : '',
    cut.cam && cut.cam !== 'push' ? chip('c', 'カメラ', n(J.CAMERA, cut.cam)) : '',
    cut.trans ? chip('c', 'つなぎ', n(J.TRANS, cut.trans)) : '',
  ] : []).concat(...[mc, fc].map((mediaCut, i) => mediaCut ? [chip('b', i ? '前景' : '背景', escapeHtml(mediaCut.name)), chip('l', J.mediaLabel('手法', 'Technique'), J.mediaTechniqueName(mediaCut)), mediaCut.placement && mediaCut.placement.angle ? chip('c', '角度', `${mediaCut.placement.angle}°`) : '', mediaCut.chromaKey ? chip('c', 'クロマキー', mediaCut.chromaColor) : ''] : [])).join('');
}

/* ---------------- line list ---------------- */
function insertLyricBlankCut(rows, position) {
  if (S.project.lyricBlankCuts.length >= 1000) { toast('カット数の上限に達しました'); return; }
  const previous = rows[position - 1], next = rows[position];
  let start = previous ? (next ? (previous.start + next.start) / 2 : (previous.start + S.plan.duration) / 2) : 0;
  if (next && next.start - start < 0.04) {
    if (next.blankId) {
      const blank = S.project.lyricBlankCuts.find(b => b.id === next.blankId);
      if (blank) blank.start = +Math.max(0.4, next.start + 0.4).toFixed(3);
    } else S.project.timing.lineTimes[next.line] = +Math.max(0.4, next.start + 0.4).toFixed(3);
  }
  if (!next && S.plan.duration - start < 0.04) start = Math.max(0, S.plan.duration - 0.4);
  S.project.lyricBlankCuts.push({ id: crypto.randomUUID(), beforeLine: next ? next.line ?? next.beforeLine : S.plan.lines.length, start: +start.toFixed(3) });
  replan(); seek(start + 0.001);
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
  for (let a = 1; a < anchors.length; a++) {
    const [oldBefore, newBefore] = anchors[a - 1], [oldAfter, newAfter] = anchors[a];
    for (let k = 1; k <= Math.min(oldAfter - oldBefore - 1, newAfter - newBefore - 1); k++) oldToNew.set(oldBefore + k, newBefore + k);
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
  const newStarts = J.computeTiming(S.project, { lines: newLines }, audioLike()).starts;
  for (const blank of S.project.lyricBlankCuts) {
    const following = newStarts.findIndex(start => start > +blank.start + 1e-6);
    blank.beforeLine = following < 0 ? newLines.length : following;
  }
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
  const ol = $('lineList'); ol.innerHTML = ''; S.lineEls = []; S.blankEls = new Map(); S.curLine = -2;
  const ov = S.project.overrides;
  const layoutOpts = '<option value="">自動</option>' + J.LAYOUT_ORDER.map(k => `<option value="${k}">${J.LAYOUTS[k].name}</option>`).join('');
  const rows = [...S.plan.lines.map(ln => ({ line: ln.index, start: ln.start })), ...S.plan.cuts.filter(c => c.blank).map(c => ({ blankId: c.blankId, beforeLine: c.beforeLine, start: c.start }))].sort((a, b) => a.start - b.start);
  const addButton = position => {
    const row = document.createElement('li'); row.className = 'media-cut-insert';
    row.innerHTML = `<button class="ghost small" type="button" aria-label="${position + 1}番目に無表示カットを追加">＋ 無表示カットを追加</button>`;
    row.querySelector('button').addEventListener('click', () => insertLyricBlankCut(rows, position));
    ol.appendChild(row);
  };
  rows.forEach((row, position) => {
    addButton(position);
    if (row.blankId) {
      const li = document.createElement('li'); li.className = 'ln lyric-ln lyric-blank-ln';
      li.innerHTML = `<span class="no">—</span><input class="time mono" type="number" step="0.01" min="0" value="${row.start.toFixed(2)}" aria-label="無表示カットの開始秒"><span class="txt">無表示</span><div class="meta"><span class="cuts"></span><span class="tools"><button class="ghost small remove-blank" type="button" aria-label="無表示カットを削除">削除</button></span></div>`;
      li.querySelector('.time').addEventListener('change', e => { const blank = S.project.lyricBlankCuts.find(b => b.id === row.blankId); if (blank) blank.start = Math.max(0, parseFloat(e.target.value) || 0); replan(); });
      li.querySelector('.txt').addEventListener('click', () => seek(row.start + 0.001));
      li.querySelector('.remove-blank').addEventListener('click', () => { S.project.lyricBlankCuts = S.project.lyricBlankCuts.filter(b => b.id !== row.blankId); replan(); });
      li.querySelector('.tools').appendChild(detailButton(()=>openCutDetails('lyrics',S.plan.cuts.find(c=>c.blankId===row.blankId).index,'blank')));
      ol.appendChild(li); S.blankEls.set(row.blankId, li);
      return;
    }
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
      cutOption.append(name, detailButton(() => openCutDetails('lyrics',i,c.part)), ...effectClipboardButtons('lyrics',i,c.part), label, controls); cutsEl.appendChild(cutOption);
    });
    ol.appendChild(li); S.lineEls.push(li);
  });
  addButton(rows.length);
  $('linesInfo').textContent = `${S.plan.lines.length}行 / ${S.plan.cuts.length}カット`;
  syncSourceTab();
}
function positionAreaEditor() {
  if (!S.areaEdit) return;
  const view = $('view').getBoundingClientRect(), viewport = $('viewport').getBoundingClientRect(), overlay = $('areaEditOverlay');
  Object.assign(overlay.style, { left: `${view.left - viewport.left}px`, top: `${view.top - viewport.top}px`, width: `${view.width}px`, height: `${view.height}px` });
}
function showAreaDraft() {
  const edit = S.areaEdit, area = edit && edit.draft, rect = $('areaEditRect'), media = !!edit && edit.kind !== 'lyric';
  rect.hidden = !area;
  if (area) Object.assign(rect.style, { left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%`, transform: `rotate(${edit.angle}deg)` });
  $('areaEditOverlay').classList.toggle('media-edit', !!edit);
  $('areaEditOverlay').querySelector('.area-edit-hint').textContent = '内側をドラッグして移動・四隅でサイズ変更・枠の周囲をドラッグして回転';
  $('mediaAreaSizeControls').hidden = !edit;
  if (area) { $('mediaAreaAspectLock').checked = edit.lockAspect; $('mediaAreaWidth').value = String(Math.round(area.w * 1000) / 10); $('mediaAreaHeight').value = String(Math.round(area.h * 1000) / 10); }
  $('mediaAreaAngleField').hidden = !edit;
  if (edit) $('mediaAreaAngle').value = String(edit.angle);
  $('areaResetFull').hidden = !edit || media;
  $('areaResetAuto').hidden = !edit || media;
  $('areaApplyOne').textContent = media ? 'このカットだけに適用' : 'この行だけに適用';
  $('areaApplyOne').disabled = !area;
  $('areaApplyFollowing').disabled = !area;
  S.need = true;
}
function openAreaEditor(index) {
  if (S.exporting || S.tap) return;
  if (S.areaEdit) cancelAreaEditor();
  const line = S.plan.lines[index]; if (!line) return;
  pause();
  clearTimeout(warmTimer); ++warmJob;
  const saved = J.lyricArea((S.project.overrides[index] || {}).area) || S.plan.cuts.find(c => c.line === index && c.part === 0)?.area;
  S.areaEdit = { kind: 'lyric', index, oldTime: S.t, draft: saved || { x: 0, y: 0, w: 1, h: 1 }, ratio: saved ? saved.h / saved.w : 1, lockAspect: saved ? saved.lockAspect : true, angle: saved ? saved.angle : 0, drag: null };
  const cut = S.plan.cuts.find(c => c.line === index);
  seek(cut ? cut.start + Math.min(cut.dur * 0.6, cut.inDur + 0.25) : line.start);
  $('areaEditTitle').textContent = `${index + 1}行目「${line.text}」の表示エリア`;
  $('areaEditOverlay').hidden = false; $('areaEditControls').hidden = false;
  positionAreaEditor(); showAreaDraft();
}
function openMediaEditor(index, layer) {
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
  seek(cut.start + Math.min(0.5, Math.max(0.001, (cut.end - cut.start) / 2)));
  $('areaEditTitle').textContent = `${index + 1}カット目「${cut.name}」の配置・サイズ`;
  $('areaEditOverlay').hidden = false; $('areaEditControls').hidden = false;
  positionAreaEditor(); showAreaDraft();
}
function cancelAreaEditor() {
  if (!S.areaEdit) return;
  const oldTime = S.areaEdit.oldTime;
  S.areaEdit = null; $('areaEditOverlay').hidden = true; $('areaEditControls').hidden = true;
  seek(oldTime);
}
function applyAreaEditor(following) {
  if (!S.areaEdit || !S.areaEdit.draft) return;
  const { kind, index, draft } = S.areaEdit;
  remember();
  if (kind !== 'lyric') {
    for (let i = index; i < (following ? S.plan[kind].cuts.length : index + 1); i++) {
      mediaOv(i, { placement: { cx: draft.x + draft.w / 2, cy: draft.y + draft.h / 2, w: draft.w, h: draft.h, lockAspect: S.areaEdit.lockAspect, angle: S.areaEdit.angle }, zoom: undefined, focus: undefined }, kind);
    }
  } else {
    const area = J.lyricArea({ ...draft, angle: S.areaEdit.angle, lockAspect: S.areaEdit.lockAspect });
    const automatic = S.areaEdit.autoDraft === JSON.stringify(area);
    for (let i = index; i < (following ? S.plan.lines.length : index + 1); i++) setOv(i, { area: automatic ? undefined : area, lockedAreas: undefined });
  }
  S.areaEdit = null; $('areaEditOverlay').hidden = true; $('areaEditControls').hidden = true;
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
  const band = Math.min(18, Math.min(halfW, halfH) * 0.35);
  if (x <= halfW + 18 && y <= halfH + 18 && (x >= halfW - band || y >= halfH - band)) return 'rotate';
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
  $('foregroundBlendFields').hidden = layer !== 'foreground';
  $('linesInfo').textContent = media ? `${m.items.length}素材 / ${S.plan[layer].cuts.length}カット` : `${S.plan.lines.length}行 / ${S.plan.cuts.length}カット`;
  $('mediaRandom').disabled = !media || (m.items.length < 2 && !m.randomOrder);
  $('mediaRandom').title = media && m.items.length < 2 && !m.randomOrder ? J.mediaLabel('素材を2つ以上追加すると選択できます', 'Add at least two files to enable random order') : '';
  $('mediaLoop').disabled = !media || (m.items.length === 0 && S.plan[layer].cuts.length === 0);
  $('mediaGroupLyrics').checked = !media || m.groupLyricsAsOneCut !== false;
  $('audioTimingSection').hidden = media;
  const targets = mediaLyricTargets(layer);
  $('mediaLyricInsertMode').value = media && m.lyricInsertMode === 'cut' ? 'cut' : 'line';
  $('btnMediaFromLyrics').disabled = !targets.length;
  $('mediaLyricInsertHint').textContent = !media || !m.items.length
    ? J.mediaLabel('画像・動画を追加すると使用できます。', 'Add images or videos to use this feature.')
    : !targets.length
      ? J.mediaLabel('対象となる歌詞の行・カットがありません。', 'There are no lyric lines or cuts to align to.')
      : '';
}
function activeMediaLayer() { return S.sourceTab === 'foreground' ? 'foreground' : S.sourceTab === 'media' ? 'media' : null; }
function mediaLyricTargets(layer) {
  const m = layer && S.project[layer];
  if (!m || !m.items.length) return [];
  // Cut mode includes every linkable lyric boundary, including blanks/interludes.
  let targets = S.plan.cuts.filter(cut => m.lyricInsertMode === 'cut' ? cut.line >= 0 || cut.blank : cut.line >= 0 && cut.part === 0);
  if (m.groupLyricsAsOneCut !== false) {
    const seen = new Set();
    targets = targets.filter(cut => {
      const group = cut.line >= 0 ? S.plan.lines[cut.line]?.group : null;
      if (group == null) return true;
      if (seen.has(group)) return false;
      seen.add(group); return true;
    });
  }
  return targets.slice(0, m.loop ? 1000 : Math.min(1000, m.items.length));
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
  targets.forEach((cut, index) => {
    // Keep upload order as the base assignment; the planner applies random order.
    m.cutOverrides[index] = { itemId: m.items[index % m.items.length].id, technique: null };
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
  return `<img class="${cls}" src="${asset.poster || asset.url}" alt="">`;
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
  $('mediaBlend').value = m.blend;
  $('mediaOpacity').value = m.opacity;
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
async function addMediaFiles(files, layer) {
  const m = S.project[layer];
  for (const file of files) {
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
    if (!type) continue;
    const existing = m.items.find(x => x.name === file.name && x.size === file.size && !J.mediaAssets.has(x.id));
    const item = existing || { id: crypto.randomUUID(), name: file.name, size: file.size, type };
    try {
      const el = await J.attachMedia(item, file);
      el.addEventListener('seeked', () => { S.need = true; });
      if (type === 'video') item.duration = el.duration || 0;
      if (!existing) {
        m.items.push(item);
        m.overrides[item.id] = { ...(m.overrides[item.id] || {}), technique: null };
      }
      await J.storeMedia(item.id, file);
    } catch (err) { toast(`${file.name}: 読み込めませんでした`); }
  }
  replan();
}
const MEDIA_EFFECT_GROUPS = {
  enter: J.mediaLabel('登場', 'Entrance'), exit: J.mediaLabel('退場', 'Exit'),
  cinema: J.mediaLabel('シネマ・カメラ', 'Cinema / camera'), dynamic: J.mediaLabel('ダイナミックモーション', 'Dynamic motion'),
  bpm: J.mediaLabel('BPM同期', 'BPM sync'), texture: J.mediaLabel('色・質感', 'Color / texture'),
  graphic: J.mediaLabel('分割・残像・グリッチ', 'Panels / echoes / glitch'), transition: J.mediaLabel('カット間のつなぎ', 'Cut transitions'),
};
function renderMediaLines() {
  const layer = activeMediaLayer() || 'media', m = S.project[layer];
  const ol = $('mediaLineList'); ol.innerHTML = ''; S.mediaLineEls = [];
  const selectTechnique = (ov, cut) => `<select class="media-technique" aria-label="${J.mediaLabel('画像・動画の手法', 'Media technique')}"><option value="none" ${(ov.technique === 'none' || ov.technique === undefined && cut.technique === 'none') ? 'selected' : ''}>${J.mediaLabel('演出無し', 'No effects')}</option><option value="" ${ov.technique === null ? 'selected' : ''}>${J.mediaLabel('自動', 'Auto')}</option>${cut.technique === 'legacy' ? `<option value="legacy" selected>${J.mediaLabel('従来の設定', 'Legacy settings')}</option>` : ''}${J.MEDIA_TECH[cut.technique]?.stage ? `<option value="${cut.technique}" selected>${J.mediaTechniqueName(cut)} (${J.mediaLabel('従来の設定', 'Legacy settings')})</option>` : ''}${Object.entries(MEDIA_EFFECT_GROUPS).filter(([group]) => !['enter', 'exit'].includes(group)).map(([group, name]) => `<optgroup label="${name}">${Object.entries(J.MEDIA_TECH).filter(([, def]) => def.group === group && !def.stage).map(([key, def]) => `<option value="${key}" ${ov.technique === key ? 'selected' : ''}>${def.name}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const selectPhase = (ov, cut, stage, field) => {
    const value = ov[field] ?? '', title = MEDIA_EFFECT_GROUPS[stage];
    return `<label>${title}<select class="media-phase" data-media-phase="${field}" aria-label="${title}"><option value="" ${!value ? 'selected' : ''}>${J.mediaLabel('自動', 'Auto')}</option><option value="none" ${value === 'none' ? 'selected' : ''}>${J.mediaLabel('即時（なし）', 'Instant (none)')}</option>${J.mediaPhaseOptions(stage).map(([key, def]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${def.name}</option>`).join('')}</select></label>`;

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
    const fileSelect = `<select class="media-cut-file" ${m.randomOrder ? `disabled title="${J.mediaLabel('素材を指定するにはランダム順をオフにしてください', 'Turn off random order to select a file')}"` : ''} aria-label="${i + 1}カット目の素材"><option value="">画像無し</option>${[...J.mediaCopyItems(layer),...m.items].map(asset => `<option value="${escapeHtml(asset.id)}" ${cut.itemId === asset.id ? 'selected' : ''}>${escapeHtml(asset.name)}</option>`).join('')}</select>`;
    if (ov.layout === 'stretch') ov.layout = 'cover';
    for (const key of ['layout', 'enter', 'hold', 'exit', 'treat']) if (ov[key] === undefined) ov[key] = cut[key];
    const asset = J.mediaAssets.get(cut.itemId), source = asset && asset.element;
    const dimensions=J.mediaSourceDimensions(S.plan,cut,cut.start);
    const sw=dimensions?.width,sh=dimensions?.height;
    const placement = J.mediaPlacementRect(cut.placement, sw, sh, S.plan.W, S.plan.H);
    const placementControl = `<span class="foreground-placement-controls"><button class="foreground-placement-open ghost" type="button" ${placement ? '' : 'disabled'} aria-label="${i + 1}カット目の配置とサイズを編集"><span class="foreground-placement-thumb"><i style="left:${(placement ? placement.x : 0) * 100}%;top:${(placement ? placement.y : 0) * 100}%;width:${(placement ? placement.w : 1) * 100}%;height:${(placement ? placement.h : 1) * 100}%;transform:rotate(${cut.placement ? cut.placement.angle || 0 : 0}deg)"></i></span>配置・サイズを編集</button>${cut.placementMode === 'auto' ? `<span class="tagl">${J.mediaLabel('自動配置', 'Auto placement')}</span>` : ''}${cut.placementMode === 'manual' ? '<button class="foreground-placement-reset ghost" type="button">自動配置に戻す</button>' : ''}</span>`;
    const li = document.createElement('li'); li.className = 'ln media-ln';
    li.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span><input class="time mono" type="number" step="0.01" min="0" value="${cut.start.toFixed(2)}" aria-label="${i + 1}カット目の開始秒">${fileSelect}${mediaThumb(item, 'media-ln-thumb')}<div class="meta"><span class="cuts"><span>${J.mediaTechniqueName(cut)}</span></span><span class="tools">${selectTechnique(ov, cut)}<button class="icon ghost dice" title="このカットを再抽選">${ICON.dice}</button><button class="icon ghost lock" title="このカットをロック" aria-pressed="${ov.lock ? 'true' : 'false'}">${ICON.lock}</button><button class="ghost small remove-media-cut" type="button" aria-label="${i + 1}カット目を削除">削除</button></span>${placementControl}${cut.type === 'video' ? `<label class="media-video-loop"><input type="checkbox" ${cut.videoLoop ? 'checked' : ''}>動画をループ再生</label><label class="media-video-duration">動画の長さ（秒）<input type="number" min="0.04" max="3600" step="0.01" placeholder="自動" value="${ov.videoDuration ?? ''}" aria-label="${i + 1}カット目の動画の長さ（秒）"></label>` : ''}</div>`;
    if (cut.type === 'video') li.querySelector('.meta').insertAdjacentHTML('beforeend', `<span class="media-chroma"><label><input class="media-chroma-toggle" type="checkbox" ${cut.chromaKey ? 'checked' : ''}>クロマキー合成</label><label>色<input class="media-chroma-color" type="color" value="${cut.chromaColor}" aria-label="${i + 1}カット目のクロマキー色" ${cut.chromaKey ? '' : 'disabled'}></label></span>`);
    li.querySelector('.foreground-placement-controls').insertAdjacentHTML('beforebegin', `<div class="media-phase-controls">${selectPhase(ov, cut, 'enter', 'entrance')}${selectPhase(ov, cut, 'exit', 'departure')}</div>`);
    li.querySelectorAll('[data-media-phase]').forEach(select => select.addEventListener('change', e => {
      mediaOv(i, { [select.dataset.mediaPhase]: e.target.value || null, lock: false }, layer); replan();
    }));
    li.querySelector('.time').addEventListener('change', e => { m.timing.lineTimes[i] = Math.max(0, parseFloat(e.target.value) || 0); replan(); });
    li.querySelector('.media-cut-file').addEventListener('change', e => { mediaOv(i, { itemId: e.target.value || null, ...(ov.lock?{lockedItemId:e.target.value||null}:{}) }, layer); replan(); });
    li.querySelector('.media-technique').addEventListener('change', e => { if (e.target.value !== 'legacy') { mediaOv(i, { technique: e.target.value || null, lock: false, lockedTechnique: undefined }, layer); replan(); } });
    const videoLoop = li.querySelector('.media-video-loop input');
    if (videoLoop) videoLoop.addEventListener('change', e => { mediaOv(i, { videoLoop: e.target.checked }); replan(); });
    const videoDuration = li.querySelector('.media-video-duration input');
    if (videoDuration) videoDuration.addEventListener('change', e => { const v = +e.target.value; mediaOv(i, { videoDuration: e.target.value && Number.isFinite(v) && v > 0 ? J.clamp(v, 0.04, 3600) : undefined }, layer); replan(); });
    const placementOpen = li.querySelector('.foreground-placement-open');
    if (placementOpen) placementOpen.addEventListener('click', () => openMediaEditor(i, layer));
    const placementReset = li.querySelector('.foreground-placement-reset');
    if (placementReset) placementReset.addEventListener('click', () => { mediaOv(i, { placement: null, lock: false, lockedPlacement: undefined, lockedPlacementMode: undefined }); replan(); });
    const chroma = li.querySelector('.media-chroma-toggle');
    if (chroma) {
      chroma.addEventListener('change', e => { mediaOv(i, { chromaKey: e.target.checked }); replan(); });
      li.querySelector('.media-chroma-color').addEventListener('change', e => { mediaOv(i, { chromaColor: e.target.value }); replan(); });
    }
    li.querySelector('.dice').addEventListener('click', () => rerollMediaCut(layer, i));
    li.querySelector('.tools').insertBefore(detailButton(() => openCutDetails(layer,i)), li.querySelector('.remove-media-cut'));
    li.querySelector('.tools').append(...effectClipboardButtons(layer,i));
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
  updateHist();
}
function histGo(d) {
  if (S.exporting) return;
  remember();                    // hand edits made since the last step become a stop of their own
  const j = H.i + d; if (j < 0 || j >= H.list.length) return;
  H.i = j;
  const { mediaEffects, ...look } = JSON.parse(H.list[j]);
  Object.assign(S.project, look);
  for (const layer of ['foreground', 'media']) S.project[layer].effects = mediaEffects[layer];
  fontKey = ''; syncUI(); replan(); updateHist();
  toast(`${j + 1} / ${H.list.length} 案目`);
  restartPreview();
}
function updateHist() {
  const canB = H.i > 0, canF = H.i < H.list.length - 1;
  ['btnPrev', 'btnPrev2'].forEach(id => { $(id).disabled = !canB; });
  ['btnNext', 'btnNext2'].forEach(id => { $(id).disabled = !canF; });
  $('histPos').textContent = H.list.length > 1 ? `${H.i + 1} / ${H.list.length}` : '';
}

/* ---------------- おまかせ ---------------- */
function restartPreview() { seek(0); if (!S.playing && S.mode === 'easy') play(); }
function omakase() {
  if (S.exporting || S.tap) return;
  remember();
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
function setMode(m) {
  S.mode = m === 'easy' ? 'easy' : 'pro';
  const easy = S.mode === 'easy';
  $('app').classList.toggle('is-easy', easy);
  $('easyPanel').hidden = !easy;
  $('modeEasy').setAttribute('aria-pressed', String(easy));
  $('modePro').setAttribute('aria-pressed', String(!easy));
  try { localStorage.setItem('jizura.mode', S.mode); } catch (e) {}
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

/* ---------------- technique tab ---------------- */
const GROUPS = [['layout', 'レイアウト'], ['enter', '登場'], ['hold', '保持'], ['exit', '退場'], ['decor', '装飾'], ['treat', '文字の加工'], ['bg', '背景'], ['cam', 'カメラ'], ['fx', '画面効果'], ['trans', 'カット間のつなぎ']];
const openGroups = new Set();
function techItems(g) { return J.order(g).filter(k => J.registry(g)[k] && !J.registry(g)[k].special); }
function renderTech() {
  const lyricEffects = J.lyricEffectSettings(S.project);
  $('lyricAutoPlacement').checked = lyricEffects.autoPlacement;
  $('lyricAutoSizeRange').hidden = !lyricEffects.autoPlacement;
  $('lyricAutoSizeMin').value = lyricEffects.sizeMin;
  $('lyricAutoSizeMax').value = lyricEffects.sizeMax;
  $('lyricAutoSizeMinValue').textContent = `${lyricEffects.sizeMin}%`;
  $('lyricAutoSizeMaxValue').textContent = `${lyricEffects.sizeMax}%`;
  $('lyricAutoSizeSlider').style.setProperty('--range-min', `${lyricEffects.sizeMin / 5}%`);
  $('lyricAutoSizeSlider').style.setProperty('--range-max', `${lyricEffects.sizeMax / 5}%`);
  $('lyricAvoidForeground').checked = lyricEffects.avoidForeground;
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
  let total = 0, onAll = 0;
  GROUPS.forEach(([g, label]) => {
    const tbl = J.registry(g), items = techItems(g), en = S.project.enabled[g] || (S.project.enabled[g] = {});
    const shown = q ? items.filter(k => (tbl[k].name + ' ' + k).toLowerCase().includes(q)) : items;
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
  const k = J.keyMode(S.project) || 'off';
  $('outKey').value = k; $('eKey').value = k;
  const kb = $('keyBadge');
  kb.hidden = k === 'off';
  if (k !== 'off') kb.innerHTML = `<i style="background:${J.KEY_BG[k]}"></i>${k === 'green' ? 'グリーンバック' : 'ブラックバック'}`;
}
async function codecNote() {
  const [w, h] = J.outputSize(S.project);
  const vc = await J.pickVideoCodec(w, h, S.project.fps, 12e6);
  $('codecNote').textContent = vc ? `このブラウザでは ${vc.label} で書き出します（${w}×${h} / ${S.project.fps}fps）。書き出し中はタブを開いたままにしてください。` : 'このブラウザは動画エンコード（WebCodecs）に対応していません。Chrome / Edge の最新版で開くか、連番PNGを使ってください。';
  $('btnMP4').disabled = !vc; $('eMP4').disabled = !vc;
  if (!vc) $('eMP4').title = 'このブラウザは MP4 書き出しに対応していません（Chrome / Edge 推奨）';
}
const EXP_BTNS = ['btnMP4', 'btnPNG', 'btnPNGA', 'eMP4'];
function openExportDialog(kind) {
  if (S.exporting) return;
  pause();
  const mp4 = kind === 'mp4';
  S.exportKind = kind;
  $('exportFilename').value = baseName() + (mp4 ? '.mp4' : kind === 'pnga' ? '_alpha_png.zip' : '_png.zip');
  $('exportDlgTitle').textContent = J.mediaLabel(mp4 ? 'MP4 を書き出す' : kind === 'pnga' ? '透過PNG（ZIP・背景なし）' : '連番PNG（ZIP）', mp4 ? 'Export MP4' : kind === 'pnga' ? 'Transparent PNG (ZIP)' : 'PNG sequence (ZIP)');
  $('exportDialogContent').appendChild($('exportSettings'));
  for (const [id,type] of [['btnMP4','mp4'],['btnPNG','png'],['btnPNGA','pnga']]) $(id).hidden = kind !== type;
  $('outQuality').closest('label').hidden = !mp4;
  $('outAudio').closest('label').hidden = !mp4;
  $('outKey').closest('label').hidden = kind === 'pnga';
  $('exportSettings').querySelector('.key-note').hidden = kind === 'pnga';
  $('codecNote').hidden = !mp4;
  syncOut(); codecNote(); $('exportDlg').showModal();
}
function restoreExportSettings() {
  $('exportSettingsHome').appendChild($('exportSettings'));
  for (const id of ['btnMP4','btnPNG','btnPNGA','codecNote']) $(id).hidden = false;
  for (const id of ['outQuality','outAudio','outKey']) $(id).closest('label').hidden = false;
  $('exportSettings').querySelector('.key-note').hidden = false;
}
function baseName() {
  const k = J.keyMode(S.project);
  return ((S.project.title || 'jizura').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || 'jizura') + (k ? (k === 'green' ? '_greenback' : '_blackback') : '');
}
function requestFilename(kind) {
  const dlg = $('filenameDlg'), project = kind === 'project' || kind === 'settings';
  $('filenameDlgTitle').textContent = J.mediaLabel(project ? 'プロジェクトを保存' : 'AE用に書き出し', project ? 'Save project' : 'Export for AE');
  if (kind === 'settings') $('filenameDlgTitle').textContent = J.mediaLabel('設定のみ書き出し', 'Export settings only');
  $('saveFilename').value = baseName() + (kind === 'settings' ? '_settings' : '') + (project ? '.jizuraichi' : '_ae.json');
  dlg.returnValue = ''; dlg.showModal(); $('saveFilename').select();
  return new Promise(resolve=>dlg.addEventListener('close',()=>resolve(dlg.returnValue === 'save' ? J.exportFilename($('saveFilename').value,project ? '.jizuraichi' : '.json',baseName()) : null),{once:true}));
}
async function runExport(kind) {
  if (S.exporting) return;
  if (!$('exportDlg').open || S.exportKind !== kind) { openExportDialog(kind); return; }
  const filename = J.exportFilename($('exportFilename').value, kind === 'mp4' ? '.mp4' : '.zip', baseName());
  $('exportFilename').value = filename;
  pause();
  const ac = new AbortController(); S.exporting = ac;
  const settingsInputs = [...$('exportSettings').querySelectorAll('input,select'),$('exportFilename')].map(el=>[el,el.disabled]);
  settingsInputs.forEach(([el])=>{el.disabled=true;}); $('btnCloseExport').disabled = true;
  const boxes = [...document.querySelectorAll('.exp-box')];
  const setText = m => boxes.forEach(b => { b.querySelector('.exp-text').textContent = m; });
  const txt = { set textContent(m) { setText(m); }, get textContent() { return boxes[0].querySelector('.exp-text').textContent; } };
  boxes.forEach(b => { b.hidden = false; b.querySelector('.exp-bar').style.width = '0%'; });
  setText('準備中…');
  EXP_BTNS.forEach(id => { $(id).disabled = true; });
  const onProgress = (p, m) => { boxes.forEach(b => { b.querySelector('.exp-bar').style.width = (p * 100).toFixed(1) + '%'; }); setText(m); };
  const t0 = performance.now();
  try {
    await J.ensureFonts(S.project.lyrics + (S.project.title || '') + (S.project.artist || '') + HUD_CHARS, J.fontsOfPlan(S.plan));
    if (kind === 'mp4') {
      const r = await J.exportMP4({ plan: S.plan, project: S.project, audio: S.project.includeAudio !== false ? S.audio : null, quality: S.project.quality || 'high', onProgress, signal: ac.signal });
      txt.textContent = `完成 ${(r.blob.size / 1048576).toFixed(1)}MB・${r.codec}${r.audio ? ' + ' + r.audio.toUpperCase() : ''}・${((performance.now() - t0) / 1000).toFixed(0)}秒`;
      const res = await J.saveFile(filename, r.blob);
      if (res === 'declined') txt.textContent += '（保存はキャンセルされました）';
    } else {
      const blob = await J.exportPNGZip({ plan: S.plan, project: S.project, transparent: kind === 'pnga', onProgress, signal: ac.signal });
      txt.textContent = `完成 ${(blob.size / 1048576).toFixed(1)}MB`;
      await J.saveFile(filename, blob);
    }
  } catch (e) {
    txt.textContent = 'エラー: ' + (e && e.message ? e.message : e);
    console.error(e);
  } finally {
    S.exporting = null; S.need = true;
    settingsInputs.forEach(([el,disabled])=>{el.disabled=disabled;}); $('btnCloseExport').disabled = false;
    EXP_BTNS.forEach(id => { $(id).disabled = false; });
    codecNote();
  }
}

/* ---------------- tap sync ---------------- */
function startTap() {
  const layer = activeMediaLayer();
  if (!(layer ? S.plan[layer].cuts.length || S.project[layer].loop : S.plan.lines.length)) return;
  S.tap = { i: 0, layer, append: !!layer && S.project[layer].loop };
  if (!S.project.timing.lineTimes) S.project.timing.lineTimes = {};
  $('tapHint').textContent = S.tap.append ? 'タップするたびに素材をループしてカットを追加します。終了するまで続けられます。' : '曲に合わせて、各行・素材が始まる瞬間に Space かボタンを押してください。';
  $('tapPanel').hidden = false; syncTapButtons();
  if (S.tap.append && !S.audio) extendTapPreview(0);
  seek(0); play(); updateTap();
  $('tapBtn').focus();
}
function tapNow() {
  if (!S.tap) return;
  if (S.tap.append) {
    const i = S.tap.i;
    const m = S.project[S.tap.layer];
    if (i === 0) { m.timing.lineTimes = {}; m.cutOverrides = {}; m.manualCuts = true; }
    m.cutCount = i + 1;
    m.cutOverrides[i] = { itemId: m.items.length ? m.items[i % m.items.length].id : null, technique: null };
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
function stopTap() { S.tap = null; $('tapPanel').hidden = true; syncTapButtons(); replan(); }
function syncTapButtons() {
  for (const id of ['btnTap', 'btnTapMedia']) $(id).setAttribute('aria-pressed', String(!!S.tap));
}
function updateTap() {
  if (S.tap.append) {
    const order = J.mediaOrder(S.project, S.tap.layer);
    $('tapLine').textContent = `${S.tap.i + 1}. ${order.length ? order[S.tap.i % order.length].name : '画像無し'}`; return;
  }
  const ln = S.tap.layer ? S.plan[S.tap.layer].cuts[S.tap.i] : S.plan.lines[S.tap.i];
  $('tapLine').textContent = ln ? `${S.tap.i + 1}. ${S.tap.layer ? ln.name : ln.text}` : '—';
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
  const layerNote = layer === 'foreground' ? L('前景の画像・動画に適用します。', 'Applies to foreground images and videos.') : L('背景の画像・動画に適用します。', 'Applies to background images and videos.');
  const shuffleLabel = layer === 'foreground' ? L('前景をシャッフル', 'Shuffle foreground') : L('背景をシャッフル', 'Shuffle background');
  const setting = key => box.querySelector(`[data-media-setting="${key}"]`);
  const action = key => box.querySelector(`[data-media-action="${key}"]`);
  box.innerHTML = `<p class="note">${layerNote} ${L('チェックした手法を「自動」とシャッフルで使用します。手動指定した手法とロック済みカットは維持されます。', 'Checked techniques are used by Auto and Shuffle. Explicit selections and locked cuts are preserved.')}</p><label class="check"><input data-media-setting="autoPlacement" type="checkbox" ${settings.autoPlacement !== false ? 'checked' : ''}><span>${L('配置・サイズにも自動で変化を付ける', 'Vary position and size automatically')}<small>${L('手動配置とロックは維持します。演出無しは中央に全体表示します。', 'Manual placement and locks are preserved. No effects keeps the centered full view.')}</small></span></label><div class="media-auto-size-range" data-media-size-range ${settings.autoPlacement !== false ? '' : 'hidden'}><div class="range-title">${L('最小・最大サイズ倍率（％）', 'Minimum / maximum area scale (%)')}</div><div class="range-pair" data-media-size-slider><input type="range" min="0" max="500" step="5" value="${settings.sizeMin}" data-media-size="min" aria-label="${L('自動サイズの最小倍率', 'Minimum automatic size scale')}"><input type="range" min="0" max="500" step="5" value="${settings.sizeMax}" data-media-size="max" aria-label="${L('自動サイズの最大倍率', 'Maximum automatic size scale')}"></div><div class="range-pair-values"><span>${L('最小 ', 'Min ')}<output data-media-size-value="min">${settings.sizeMin}%</output></span><span>${L('最大 ', 'Max ')}<output data-media-size-value="max">${settings.sizeMax}%</output></span></div></div><div class="media-effect-sliders"></div><div class="row"><button type="button" data-media-action="shuffle">${shuffleLabel}</button><button type="button" data-media-action="enable">${L('全て有効', 'Enable all')}</button><button type="button" data-media-action="disable">${L('全て無効', 'Disable all')}</button></div>`;
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
  const groups = MEDIA_EFFECT_GROUPS;
  for (const [group, name] of Object.entries(groups)) {
    const items = Object.entries(J.MEDIA_TECH).filter(([, def]) => def.group === group);
    const count = enabled => `${items.filter(([key]) => enabled[key] !== false).length}/${items.length}`;
    const section = document.createElement('details'); section.className = 'tgroup media-tech-group'; section.dataset.mediaGroup = group;
    section.open = openMediaGroups[layer].has(group);
    section.addEventListener('toggle', () => {
      if (!section.isConnected) return;
      if (section.open) openMediaGroups[layer].add(group); else openMediaGroups[layer].delete(group);
    });
    section.innerHTML = `<summary><span class="tg-name">${name}</span><span class="tg-cnt mono">${count(settings.enabled)}</span></summary><div class="tg-tools"><button type="button" class="ghost small" data-media-group-action="on">${L('すべてON', 'Enable all')}</button><button type="button" class="ghost small" data-media-group-action="off">${L('すべてOFF', 'Disable all')}</button><button type="button" class="ghost small" data-media-group-action="flip">${L('反転', 'Invert')}</button></div>`;
    const list = document.createElement('div'); list.className = 'checks';
    for (const [key, def] of items) {
      const row = document.createElement('label'); row.innerHTML = `<input type="checkbox" data-media-tech="${key}" ${settings.enabled[key] !== false ? 'checked' : ''}><span>${def.name}</span>`;
      row.querySelector('input').addEventListener('change', e => {
        const next = J.mediaEffectSettings(S.project, layer); next.enabled[key] = e.target.checked; S.project[layer].effects = next;
        section.querySelector('.tg-cnt').textContent = count(next.enabled); replan();
      }); list.appendChild(row);
    }
    section.querySelectorAll('[data-media-group-action]').forEach(button => button.addEventListener('click', () => {
      const next = J.mediaEffectSettings(S.project, layer), action = button.dataset.mediaGroupAction;
      for (const [key] of items) next.enabled[key] = action === 'on' ? true : action === 'off' ? false : next.enabled[key] === false;
      S.project[layer].effects = next; openMediaGroups[layer].add(group); renderMediaEffects(layer); replan();
    }));
    section.appendChild(list);
    box.appendChild(section);
  }
  setting('autoPlacement').onchange = e => { const next = J.mediaEffectSettings(S.project, layer); next.autoPlacement = e.target.checked; S.project[layer].effects = next; renderMediaEffects(layer); replan(); };
  if (layer === 'media') {
    const row = document.createElement('label'); row.className = 'check';
    row.innerHTML = `<input type="checkbox" data-media-setting="applyLyricBackground" ${settings.applyLyricBackground !== false ? 'checked' : ''}><span>${L('歌詞の背景演出も適用', 'Apply lyric background effects')}</span>`;
    row.querySelector('input').onchange = e => { const next = J.mediaEffectSettings(S.project, layer); next.applyLyricBackground = e.target.checked; S.project[layer].effects = next; replan(); };
    box.prepend(row);
  }
  const sizeRange = box.querySelector('[data-media-size-range]');
  const sizeSlider = sizeRange.querySelector('[data-media-size-slider]');
  const syncSizeSlider = (min, max) => {
    sizeSlider.style.setProperty('--range-min', `${min / 5}%`); sizeSlider.style.setProperty('--range-max', `${max / 5}%`);
    sizeRange.querySelector('[data-media-size-value="min"]').textContent = `${min}%`;
    sizeRange.querySelector('[data-media-size-value="max"]').textContent = `${max}%`;
  };
  sizeSlider.querySelectorAll('[data-media-size]').forEach(input => input.addEventListener('input', () => {
    const changed = input.dataset.mediaSize;
    let min = +sizeSlider.querySelector('[data-media-size="min"]').value, max = +sizeSlider.querySelector('[data-media-size="max"]').value;
    if (changed === 'min' && min > max) max = min;
    if (changed === 'max' && max < min) min = max;
    const next = J.mediaEffectSettings(S.project, layer); next.sizeMin = min; next.sizeMax = max; S.project[layer].effects = next;
    sizeSlider.querySelector('[data-media-size="min"]').value = min; sizeSlider.querySelector('[data-media-size="max"]').value = max;
    syncSizeSlider(min, max); markUndoGroup(`mediaEffects:${layer}:size`); replanSoon(100);
  }));
  syncSizeSlider(settings.sizeMin, settings.sizeMax);
  action('shuffle').onclick = () => { shuffleMediaEffects([layer]); S.project[layer].seed++; replan(); };
  const all = value => { const next = J.mediaEffectSettings(S.project, layer); next.enabled = Object.fromEntries(Object.keys(J.MEDIA_TECH).map(key => [key, value])); S.project[layer].effects = next; renderMediaEffects(layer); replan(); };
  action('enable').onclick = () => all(true); action('disable').onclick = () => all(false);
}

/* ---------------- sync all inputs from project ---------------- */
function renderThemes() {
  const ids = J.themeIds(S.project);
  $('themeLabels').innerHTML = ids.length ? ids.map(id=>`<span class="theme-label">${J.THEMES[id].name}</span>`).join('') : `<span class="muted">${J.mediaLabel('未選択：すべてのテーマ','Not selected: unrestricted')}</span>`;
}
function syncUI() {
  renderThemes();
  $('songTitle').value = S.project.title || ''; $('songArtist').value = S.project.artist || '';
  $('lyrics').value = S.project.lyrics;
  $('bpm').value = S.project.timing.bpm > 0 ? S.project.timing.bpm : '';
  $('bpm').placeholder = S.audio ? `自動 ${S.audio.bpm}` : 'なし';
  $('offset').value = S.project.timing.offset ?? 0.4;
  $('lineScale').value = S.project.timing.lineScale ?? 1;
  $('snap').checked = !!S.project.timing.snap;
  document.querySelectorAll('.wa-toggle').forEach(el => { el.checked = S.project.wa !== false; });
  document.querySelectorAll('.extra-toggle').forEach(el => { el.checked = S.project.extra === true; });
  for (const key of J.SET_ORDER) document.querySelectorAll('.'+key+'-toggle').forEach(el=>{el.checked=J.setOn(S.project,key);});
  $('lyricLang').value = J.LANG_LABEL[S.project.lang] ? S.project.lang : 'auto'; langNote();
  renderFontRoles(); renderColors(); renderFx(); renderTech(); renderMediaEffects(); syncOut(); drawStyleGrid();
}

/* ---------------- wiring ---------------- */
function bind() {
  const frameToggle=$('showItemFrames');
  $('showItemFramesLabel').textContent=J.mediaLabel('アイテム枠表示','Show item frames');
  try {frameToggle.checked=localStorage.getItem('jizura.itemFrames')!=='false';}catch(e){}
  frameToggle.addEventListener('change',()=>{try{localStorage.setItem('jizura.itemFrames',String(frameToggle.checked));}catch(e){}S.need=true;drawItemFrames();});
  $('itemFrames').addEventListener('click',e=>{const button=e.target.closest('.item-frame-action');if(button&&!S.playing&&!S.areaEdit){e.stopPropagation();performTimelineAction(button);}});

  $('timelineLegend').innerHTML = [
    [ICON.dice,'再抽選','Reroll',''],
    [ICON.lock,'ロック','Lock',''],
    [ICON.area,'表示範囲','Display area',''],
    [ICON.details,'詳細編集','Edit details',''],
    [ICON.remove,'削除','Delete','remove'],
    [ICON.frontmost,'最前表示','Show in front',''],
    ['🔗','開始位置をリンク','Link start positions','link'],
    ['×','リンク解除','Unlink','unlink'],
  ].map(([icon,ja,en,cls])=>`<span class="timeline-legend-item"><span class="timeline-legend-icon ${cls}" aria-hidden="true">${icon}</span><span>${J.mediaLabel(ja,en)}</span></span>`).join('');

  $('saveFilename').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('filenameDlg').querySelector('button[value="save"]').click();}});
  const menus = [...document.querySelectorAll('.header-menu')];
  menus.forEach(menu => {
    menu.addEventListener('toggle', () => { if (menu.open) menus.forEach(other=>{if(other!==menu)other.open=false;}); });
    menu.addEventListener('click', e => { if (e.target.closest('button')) menu.open=false; });
  });
  document.addEventListener('click', e => menus.forEach(menu=>{if(!menu.contains(e.target))menu.open=false;}));
  document.addEventListener('keydown', e => {if(e.key==='Escape')menus.forEach(menu=>{menu.open=false;});});
  $('fileProject').closest('label').addEventListener('keydown', e => {if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileProject').click();}});
  $('fileProject').addEventListener('change',()=>{$('projectMenu').open=false;});
  document.querySelectorAll('[data-export-dialog]').forEach(button=>button.addEventListener('click',()=>openExportDialog(button.dataset.exportDialog)));
  $('btnCloseExport').addEventListener('click',()=>{if(!S.exporting)$('exportDlg').close();});
  $('exportDlg').addEventListener('cancel',e=>{if(S.exporting)e.preventDefault();});
  $('exportDlg').addEventListener('close',restoreExportSettings);
  $('btnThemes').addEventListener('click', () => {
    const selected = new Set(J.themeIds(S.project));
    $('themeChoices').innerHTML = ['genre','taste'].map(category => `<fieldset><legend>${J.mediaLabel(category === 'genre' ? '曲ジャンル' : 'テイスト',category === 'genre' ? 'Music genre' : 'Taste')}</legend>${Object.entries(J.THEMES).filter(([,t])=>t.category===category).map(([id,t])=>`<label class="check"><input type="checkbox" data-theme="${id}" ${selected.has(id)?'checked':''}><span>${t.name}<small>${t.description}</small></span></label>`).join('')}</fieldset>`).join('');
    $('themesDlg').showModal();
  });
  $('btnApplyThemes').addEventListener('click', () => {
    S.project.themes = [...$('themeChoices').querySelectorAll('input:checked')].map(el=>el.dataset.theme);
    renderThemes(); autosave(); $('themesDlg').close();
  });
  $('btnClearThemes').addEventListener('click', () => $('themeChoices').querySelectorAll('input').forEach(el=>el.checked=false));

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
  for (const [id, key] of [['lyricAutoPlacement', 'autoPlacement'], ['lyricAvoidForeground', 'avoidForeground'], ['lyricRandomBlend', 'randomBlend'], ['lyricRandomOpacity', 'randomOpacity']]) {
    $(id).addEventListener('change', e => { S.project.lyricEffects = { ...J.lyricEffectSettings(S.project), [key]: e.target.checked }; renderTech(); replan(); });
  }
  const updateAutoLyricSize = changed => {
    let min = +$('lyricAutoSizeMin').value, max = +$('lyricAutoSizeMax').value;
    if (changed === 'min' && min > max) max = min;
    if (changed === 'max' && max < min) min = max;
    const settings = { ...J.lyricEffectSettings(S.project), sizeMin: min, sizeMax: max };
    S.project.lyricEffects = settings;
    $('lyricAutoSizeMin').value = min; $('lyricAutoSizeMax').value = max;
    $('lyricAutoSizeMinValue').textContent = `${min}%`; $('lyricAutoSizeMaxValue').textContent = `${max}%`;
    $('lyricAutoSizeSlider').style.setProperty('--range-min', `${min / 5}%`);
    $('lyricAutoSizeSlider').style.setProperty('--range-max', `${max / 5}%`);
    markUndoGroup('lyricAutoSize'); replanSoon(100);
  };
  $('lyricAutoSizeMin').addEventListener('input', () => updateAutoLyricSize('min'));
  $('lyricAutoSizeMax').addEventListener('input', () => updateAutoLyricSize('max'));
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
  $('timelineZoomOut').addEventListener('click', () => setTimelineZoom(S.timelineZoom / 1.5));
  $('timelineZoomIn').addEventListener('click', () => setTimelineZoom(S.timelineZoom * 1.5));
  $('timelineZoomOut').disabled = true;
  $('sourceLyrics').addEventListener('click', () => { cancelAreaEditor(); S.sourceTab = 'lyrics'; syncSourceTab(); });
  $('sourceMedia').addEventListener('click', () => { cancelAreaEditor(); S.sourceTab = 'media'; renderMediaList(); renderMediaLines(); });
  $('sourceForeground').addEventListener('click', () => { cancelAreaEditor(); S.sourceTab = 'foreground'; renderMediaList(); renderMediaLines(); });
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
  $('mediaAreaAngle').addEventListener('input', e => { if (!S.areaEdit || e.target.value === '') return; S.areaEdit.angle = J.clamp(+e.target.value || 0, -180, 180); showAreaDraft(); });
  $('areaResetFull').addEventListener('click', () => { if (!S.areaEdit || S.areaEdit.kind !== 'lyric') return; S.areaEdit.autoDraft = null; S.areaEdit.draft = { x: 0, y: 0, w: 1, h: 1 }; S.areaEdit.ratio = 1; S.areaEdit.angle = 0; showAreaDraft(); });
  $('areaResetAuto').addEventListener('click', () => {
    const edit = S.areaEdit; if (!edit || edit.kind !== 'lyric') return;
    const project = { ...S.project, overrides: { ...S.project.overrides, [edit.index]: { ...S.project.overrides[edit.index], area: undefined, lockedAreas: undefined } } };
    const area = J.plan(project, audioLike()).cuts.find(c => c.line === edit.index && c.part === 0)?.area || { x: 0, y: 0, w: 1, h: 1, angle: 0, lockAspect: true };
    edit.draft = { ...area }; edit.ratio = area.h / area.w; edit.angle = area.angle; edit.lockAspect = area.lockAspect;
    edit.autoDraft = JSON.stringify(J.lyricArea(area));
    showAreaDraft();
  });
  $('areaApplyOne').addEventListener('click', () => applyAreaEditor(false));
  $('areaApplyFollowing').addEventListener('click', () => applyAreaEditor(true));
  $('areaCancel').addEventListener('click', cancelAreaEditor);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.areaEdit) { e.preventDefault(); cancelAreaEditor(); } });
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
  $('mediaBlend').addEventListener('change', e => { S.project.foreground.blend = e.target.value; replan(); });
  $('mediaOpacity').addEventListener('change', e => { S.project.foreground.opacity = J.clamp(+e.target.value || 0, 0, 100); replan(); });
  $('lyricInputTools').addEventListener('click', e => {
    const button=e.target.closest('[data-lyric-insert]'); if (!button) return;
    const input=$('lyrics'), start=input.selectionStart, end=input.selectionEnd;
    const selected=input.value.slice(start,end), kind=button.dataset.lyricInsert;
    const pairs={cut:['/','/'],break:['\\n','\\n'],strong:['*','*'],soft:['~','~'],scene:['{','}'],separate:['{-','-}'],empty:['｜','｜']};
    let [before,after]=pairs[kind], middle=selected;
    if (kind==='empty' && !selected) middle='　　　　';
    if (kind==='cut' || kind==='break') { if (!selected) after=''; }
    if (kind==='scene' || kind==='separate') {
      before=(start && input.value[start-1]!=='\n'?'\n':'')+before+'\n';
      after='\n'+after+(end<input.value.length && input.value[end]!=='\n'?'\n':'');
    }
    input.setRangeText(before+middle+after,start,end,'end');
    input.focus(); input.setSelectionRange(start+before.length,start+before.length+middle.length);
    input.dispatchEvent(new Event('input',{bubbles:true}));
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
  $('btnSyntax').addEventListener('click', e => { const s = $('syntax'); s.hidden = !s.hidden; e.target.setAttribute('aria-expanded', String(!s.hidden)); });
  $('bpm').addEventListener('change', e => { S.project.timing.bpm = Math.max(0, parseFloat(e.target.value) || 0); replan(); });
  $('offset').addEventListener('change', e => { S.project.timing.offset = Math.max(0, parseFloat(e.target.value) || 0); replan(); });
  $('lineScale').addEventListener('change', e => { S.project.timing.lineScale = J.clamp(parseFloat(e.target.value) || 1, 0.3, 4); replan(); });
  $('snap').addEventListener('change', e => { S.project.timing.snap = e.target.checked; replan(); });
  $('btnResetTimes').addEventListener('click', () => { const layer = activeMediaLayer(), timing = layer ? S.project[layer].timing : S.project.timing; timing.lineTimes = {}; if (!layer) timing.cutTimes = {}; replan(); });
  $('audioFile').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) loadAudioFile(f); });
  $('btnRemoveAudio').addEventListener('click', removeAudio);
  $('btnTap').addEventListener('click', () => (S.tap ? stopTap() : startTap()));
  $('btnTapMedia').addEventListener('click', () => (S.tap ? stopTap() : startTap()));
  $('tapBtn').addEventListener('click', tapNow);
  $('tapStop').addEventListener('click', () => { pause(); stopTap(); });
  $('btnPlay').addEventListener('click', () => (S.playing ? pause() : play()));
  $('btnUndo').addEventListener('click', () => undoMove(-1));
  $('btnRedo').addEventListener('click', () => undoMove(1));
  $('btnLoop').addEventListener('click', e => { S.loop = !S.loop; e.target.setAttribute('aria-pressed', String(S.loop)); });
  $('btnShuffle').addEventListener('click', () => { remember(); shuffleMediaEffects(); S.project.seed = (Math.random() * 1e9) | 0; $('seed').value = S.project.seed; replan(); commit(); });
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
      const limits = boundary && boundaryGroupLimits(boundary.ref);
      drag = boundary && limits && limits.max > limits.min ? { ...boundary, min: limits.min, max: limits.max, mode: 'boundary', originX: e.clientX, preview: boundary.start, moved: false, duration: S.plan.duration } : { mode: 'seek' };
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
      if (drag.mode === 'boundary') {
        S.timelineDrag = null;
        if (drag.moved) commitTimelineBoundary(drag);
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
  const setSwitch = (cls, key, on, msgOn, msgOff) => document.querySelectorAll('.' + cls).forEach(el => el.addEventListener('change', e => {
    remember();
    S.project[key] = e.target.checked;
    document.querySelectorAll('.' + cls).forEach(x => { x.checked = e.target.checked; });
    renderTech(); drawStyleGrid(); replan(); commit(); flushSave();
    toast(e.target.checked ? msgOn : msgOff);
  }));
  for (const key of J.SET_ORDER) setSwitch(key+'-toggle',key,true,J.mediaLabel('演出セット：オン','Part set: on'),J.mediaLabel('演出セット：オフ','Part set: off'));
  setSwitch('extra-toggle', 'extra', true, '追加分の演出：使う', '追加分の演出：使わない（最初の公開版の演出だけ）');
  setSwitch('wa-toggle', 'wa', true, '和風の演出：使う', '和風の演出：使わない（おまかせ・シャッフルで選ばれません）');
  $('fxKoma').addEventListener('change', e => { const k = +e.target.value; S.project.fx.koma = k; S.project.fx.onTwos = k > 0; S.project.mood = null; replan(); });
  $('fxHud').addEventListener('change', e => { S.project.fx.hud = e.target.value; replan(); });
  $('seed').addEventListener('change', e => { S.project.seed = parseInt(e.target.value, 10) || 0; replan(); });
  $('btnSeed').addEventListener('click', () => { S.project.seed = (Math.random() * 1e9) | 0; $('seed').value = S.project.seed; replan(); });
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
  $('outQuality').addEventListener('change', e => { S.project.quality = e.target.value; autosave(); });
  ['outKey', 'eKey'].forEach(id => $(id).addEventListener('change', e => {
    S.project.keyBg = e.target.value; syncOut(); replan(); flushSave();
    const k = J.keyMode(S.project);
    toast(k ? `背景：${k === 'green' ? 'グリーンバック' : 'ブラックバック'}（白い文字と演出だけ）` : '背景：通常（スタイルの配色）');
  }));
  $('outAudio').addEventListener('change', e => { S.project.includeAudio = e.target.checked; autosave(); });
  $('btnMP4').addEventListener('click', () => runExport('mp4'));
  $('btnPNG').addEventListener('click', () => runExport('png'));
  $('btnPNGA').addEventListener('click', () => runExport('pnga'));
  document.querySelectorAll('.exp-cancel').forEach(b => b.addEventListener('click', () => { if (S.exporting) S.exporting.abort(); }));
  $('eMP4').addEventListener('click', () => runExport('mp4'));
  // かんたんモード
  $('modeEasy').addEventListener('click', () => setMode('easy'));
  $('modePro').addEventListener('click', () => setMode('pro'));
  $('btnOmakase').addEventListener('click', omakase);
  $('btnOmakaseBig').addEventListener('click', omakase);
  ['btnPrev', 'btnPrev2'].forEach(id => $(id).addEventListener('click', () => histGo(-1)));
  ['btnNext', 'btnNext2'].forEach(id => $(id).addEventListener('click', () => histGo(1)));
  $('eStyle').addEventListener('click', () => rerollPart('style'));
  $('eMood').addEventListener('click', () => rerollPart('mood'));
  $('eCut').addEventListener('click', () => rerollPart('cut'));
  $('ePalette').addEventListener('click', () => { randomPalette(); restartPreview(); });
  // 利用について（出力物の権利・ライセンス）
  const dlg = $('termsDlg');
  const openTerms = () => { if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', ''); };
  document.querySelectorAll('.terms-open').forEach(b => b.addEventListener('click', openTerms));
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close ? dlg.close() : dlg.removeAttribute('open'); });   // click on the backdrop
  $('btnNew').addEventListener('click', () => { if (!S.exporting && !S.projectBusy) $('newProjectDlg').showModal(); });
  $('btnCreateProject').addEventListener('click', () => {
    const project = J.defaultProject(); project.lyrics = ''; project.aspect = $('newProjectAspect').value;
    replaceProject(project, null, null, new Map()); $('newProjectDlg').close();
  });
  $('btnSave').addEventListener('click', async () => {
    if (S.projectBusy) return;
    const filename = await requestFilename('project'); if (!filename) return;
    S.projectBusy = true; $('btnSave').disabled = true;
    const project = JSON.parse(JSON.stringify(S.project)), audio = S.audioFile;
    try { await J.saveFile(filename, await J.packProject(project, audio)); }
    catch (err) { toast(J.mediaLabel('保存できませんでした：', 'Could not save: ') + err.message); }
    finally { S.projectBusy = false; $('btnSave').disabled = false; }
  });
  $('btnSaveSettings').addEventListener('click', async () => {
    if (S.projectBusy || S.exporting) return;
    const filename = await requestFilename('settings'); if (!filename) return;
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
    const filename = await requestFilename('ae'); if (!filename) return;
    try { await J.saveFile(filename, JSON.stringify(J.planForAE(S.plan, S.project), null, 1)); }
    catch (err) { toast(J.mediaLabel('保存できませんでした：','Could not save: ') + err.message); }
  });
  $('fileProject').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (S.exporting || S.projectBusy) { e.target.value = ''; return; }
    S.projectBusy = true;
    try { await openProjectFile(f); }
    catch (err) { toast(J.mediaLabel('プロジェクトを読み込めませんでした：', 'Could not open project: ') + err.message); }
    finally { S.projectBusy = false; }
    e.target.value = '';
  });
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    const typing = (e.target && e.target.isContentEditable) || /INPUT|TEXTAREA|SELECT/.test(tag) && e.target.type !== 'range' && e.target.type !== 'checkbox';
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
  if (window.ResizeObserver) new ResizeObserver(drawTimelineLinks).observe($('timelineStack'));
}

/* song file -> beat analysis (file input, or a host such as the After Effects panel) */
async function loadAudioFile(f) {
  const project = S.project, request = S.audioLoad = (S.audioLoad || 0) + 1;
  $('audioName').textContent = '解析中…';
  try {
    pause();
    const audio = await J.analyzeAudio(f);
    if (S.project !== project || S.audioLoad !== request) return false;
    S.audio = audio; S.audioFile = f;
    S.project.audioAsset = {id:'audio_' + crypto.randomUUID(),name:f.name,type:f.type};
    await J.storeMedia(S.project.audioAsset.id, f).catch(() => {});
    if (S.project !== project || S.audioLoad !== request) return false;
    refreshAudioName();
    S.project.timing.snap = true;
    syncUI(); replan();
    return true;
  } catch (err) {
    if (S.project === project && S.audioLoad === request) { refreshAudioName(); toast(J.mediaLabel('曲を読み込めませんでした：','Could not import audio: ') + err.message); }
    return false;
  }
}

function releaseProjectAssets(assets) {
  for (const asset of assets.values()) {
    if (asset.type === 'video') { asset.element.pause(); asset.element.removeAttribute('src'); asset.element.load(); }
    URL.revokeObjectURL(asset.url);
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
async function openProjectFile(file) {
  const loaded = await J.unpackProject(file), project = loaded.project, assets = new Map();
  let audio = null, audioFile = null;
  try {
    const files = new Map(loaded.files.map(entry=>[entry.kind+':'+entry.id,entry.file]));
    for (const item of [...(project.media?.items || []),...(project.foreground?.items || [])]) {
      if (assets.has(item.id)) continue;
      const blob = files.get('media:'+item.id) || await J.loadMedia(item.id);
      if (blob) await J.attachMedia(item,blob,assets);
    }
    if (project.audioAsset) {
      audioFile = files.get('audio:'+project.audioAsset.id) || await J.loadMedia(project.audioAsset.id);
      if (audioFile) audio = await J.analyzeAudio(audioFile);
    }
    // Decode everything first: malformed projects leave the current edit intact.
    for (const entry of loaded.files) {
      if (entry.kind === 'font') await J.saveFontFile(entry.id,entry.file);
      else await J.storeMedia(entry.id,entry.file);
    }
    await J.restoreFontFiles(project.userFonts);
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
J.uiApi = { toast, replan, syncUI, pause, seek, flushSave, loadAudioFile, restartPreview };
})();
