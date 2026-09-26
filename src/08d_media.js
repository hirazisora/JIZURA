/* Uploaded-image/video planning and browser-local asset storage. */
(() => {
'use strict';
J.MEDIA_LAYOUT = { cover: '全画面', contain: '全体を表示' };
J.MEDIA_ENTER = { fade: 'フェード', slide: 'スライド', zoom: 'ズーム', cut: '即時' };
J.MEDIA_HOLD = { still: '静止', push: 'ゆっくり拡大', pan: '横移動' };
J.MEDIA_EXIT = { fade: 'フェード', slide: 'スライド', zoom: 'ズーム', cut: '即時' };
J.MEDIA_TREAT = { none: 'なし', mono: 'モノクロ', sepia: 'セピア', contrast: '高コントラスト', blur: 'ぼかし' };
J.MEDIA_FOCUS = { tl: '左上', tc: '上', tr: '右上', ml: '左', mc: '中央', mr: '右', bl: '左下', bc: '下', br: '右下' };
J.MEDIA_TRANS_KEYS = ['wipe', 'diagonalWipe', 'clockWipe', 'irisOpen', 'pushSlide', 'cover', 'uncover', 'zoomThrough', 'checker', 'blockDissolve', 'flashCross'];
J.mediaTransOptions = () => {
  const trans = J.TRANS || {};
  return Object.assign({ none: 'なし', crossfade: 'クロスフェード' }, Object.fromEntries(J.MEDIA_TRANS_KEYS.filter(k => trans[k]).map(k => [k, trans[k].name])));
};
J.mediaFocusPoint = (focus, w, h) => {
  const index = Object.keys(J.MEDIA_FOCUS).indexOf(focus);
  return { x: ((index < 0 ? 4 : index) % 3 - 1) * w / 3, y: (Math.floor((index < 0 ? 4 : index) / 3) - 1) * h / 3 };
};
J.mediaPlacementRect = (placement, sw, sh, w, h) => {
  if (!sw || !sh || !w || !h) return null;
  const aspect = sw / sh, stageAspect = w / h;
  const defaultWidth = Math.min(1, aspect / stageAspect);
  const locked = !placement || placement.lockAspect !== false;
  const limit = placement?.croppedAuto ? Infinity : 4;
  let pw = placement && Number.isFinite(+placement.w) ? J.clamp(+placement.w, 0.005, limit) : defaultWidth;
  let ph = locked ? pw * stageAspect / aspect : placement && Number.isFinite(+placement.h) ? J.clamp(+placement.h, 0.005, 4) : pw * stageAspect / aspect;
  if (locked && ph > limit) { ph = limit; pw = ph * aspect / stageAspect; }
  const cx = placement && Number.isFinite(+placement.cx) ? J.clamp(+placement.cx, 0, 1) : 0.5;
  const cy = placement && Number.isFinite(+placement.cy) ? J.clamp(+placement.cy, 0, 1) : 0.5;
  return { x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph };
};
J.mediaAssets = new Map();
J.normalizeMediaPlacement = p => p && ['cx', 'cy', 'w'].every(k => Number.isFinite(+p[k])) ? {
  cx: +p.cx, cy: +p.cy, w: +p.w,
  h: p.h != null && Number.isFinite(+p.h) ? +p.h : undefined,
  lockAspect: p.lockAspect !== false,
  angle: p.angle != null && Number.isFinite(+p.angle) ? J.clamp(+p.angle, -180, 180) : 0,
  ...(p.croppedAuto ? { croppedAuto: true } : {}),
} : null;
J.autoMediaPlacement = (project, cut, item, plan, layer) => {
  const [W, H] = plan.W && plan.H ? [plan.W, plan.H] : J.designSize ? J.designSize(project) : [1920, 1080];
  const source = J.mediaAssets.get(cut.itemId)?.element;
  const sw = source && (source.videoWidth || source.naturalWidth || source.width) || item.width || W;
  const sh = source && (source.videoHeight || source.naturalHeight || source.height) || item.height || H;
  const fit = J.mediaPlacementRect(null, sw, sh, W, H);
  const rng = J.rng(J.h(cut.seed, J.sid(layer), 733));
  // Automatic framing preserves the fitted source aspect ratio.
  const [px, py, size] = rng.pick([
    [.5, .5, .92], [.5, .5, .7], [.27, .5, .64], [.73, .5, .64],
    [.5, .27, .64], [.5, .73, .64], [.26, .26, .48], [.74, .26, .48],
    [.26, .74, .48], [.74, .74, .48],
  ]);
  const group = J.MEDIA_TECH?.[cut.technique]?.group;
  const dynamic = group === 'dynamic' || group === 'graphic';
  const background = layer === 'media';
  const settings = cut.effectSettings || J.mediaEffectSettings(project, layer);
  const sizeScale = rng.range(settings.sizeMin ?? 75, settings.sizeMax ?? 125) / 100;
  const baseScale = background ? rng.range(1, 1.35) : J.clamp(size * .9 * rng.range(.92, 1.08), .36, dynamic ? .72 : .94);
  const scale = background ? Math.max(1, baseScale * sizeScale) : J.clamp(baseScale * sizeScale, .005, 4);
  const w = fit.w * scale, h = fit.h * scale, margin = dynamic ? .07 : .03;
  const position = (center, extent) => {
    const target = center + rng.range(-.025, .025);
    // Pan inside the available crop on enlarged axes; keep smaller axes in view.
    if (background) return .5 + (J.clamp(target, 0, 1) - .5) * Math.abs(1 - extent);
    return J.clamp(target, extent / 2 + margin, 1 - extent / 2 - margin);
  };
  const placement = { cx: position(px, w), cy: position(py, h), w, h, lockAspect: true, angle: 0 };
  const edges = item.croppedEdges || {}, crop = .2;
  if (!['left','right','top','bottom'].some(edge => edges[edge] === true)) return placement;
  // Hide 20% of the source extent at each selected edge. Opposite edges
  // leave the middle 60% in frame, enlarging proportionally when necessary.
  const grow = Math.max(1, edges.left && edges.right ? 1 / ((1 - 2 * crop) * w) : 1, edges.top && edges.bottom ? 1 / ((1 - 2 * crop) * h) : 1);
  placement.w *= grow; placement.h *= grow; placement.croppedAuto = true;
  const anchor = (center, extent, before, after) => J.clamp(before && after ? .5 : before ? extent * (.5 - crop) : after ? 1 - extent * (.5 - crop) : center, 0, 1);
  placement.cx = anchor(placement.cx, placement.w, edges.left, edges.right);
  placement.cy = anchor(placement.cy, placement.h, edges.top, edges.bottom);
  return placement;
};
const defaults = () => ({ items: [], randomOrder: false, loop: false, lyricInsertMode: 'line', groupLyricsAsOneCut: true, cutCount: 0, manualCuts: false, seed: 1, timing: { lineTimes: {} }, overrides: {}, cutOverrides: {}, blend: 'normal', opacity: 100 });
J.normalizeMedia = m => {
  const o = Object.assign(defaults(), m || {});
  o.items = Array.isArray(o.items) ? o.items.filter(x => x && x.id && x.name && ['image', 'video'].includes(x.type)) : [];
  o.timing = Object.assign({ lineTimes: {} }, o.timing || {});
  o.overrides = o.overrides || {};
  o.cutOverrides = o.cutOverrides || {};
  o.loop = !!o.loop;
  o.lyricInsertMode = o.lyricInsertMode === 'cut' ? 'cut' : 'line';
  o.groupLyricsAsOneCut = o.groupLyricsAsOneCut !== false;
  o.manualCuts = !!o.manualCuts;
  o.cutCount = J.clamp(Math.floor(+o.cutCount || 0), 0, 1000);
  if (!['normal', 'multiply', 'screen'].includes(o.blend)) o.blend = 'normal';
  o.opacity = J.clamp(+o.opacity || 0, 0, 100);
  return o;
};
J.mediaOrder = (project, layer = 'media') => {
  const m = J.normalizeMedia(project[layer]), order = m.items.slice();
  if (m.randomOrder && order.length > 1) {
    const rng = J.rng(J.h(project.seed, m.seed));
    for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  }
  return order;
};
J.planMedia = (project, lyricPlan, audioDuration, layer = 'media') => {
  const m = J.normalizeMedia(project[layer]), items = m.items.slice();
  const fixedDuration = Number.isFinite(+project.durationOverride) && +project.durationOverride > 0 ? +project.durationOverride : null;
  const count = m.manualCuts ? m.cutCount : items.length ? (m.loop ? (m.cutCount || Math.min(1000, items.length * 2)) : items.length) : 0;
  const order = J.mediaOrder(project, layer);
  const baseItems = Array.from({ length: count }, (_, i) => {
    const assigned = m.cutOverrides[i];
    if (assigned && Object.hasOwn(assigned, 'itemId')) return items.find(item => item.id === assigned.itemId) || null;
    return items.length ? items[i % items.length] : null;
  });
  let randomIndex = 0;
  const displayItems = baseItems.map((item, i) => {
    if (!item) return null; // Explicit blank cuts never consume a shuffled slot.
    const ov = Object.assign({}, m.overrides[item.id] || {}, m.cutOverrides[i] || {});
    if (ov.lock) return items.find(x => x.id === (ov.lockedItemId || item.id)) || null;
    return m.randomOrder && order.length ? order[randomIndex++ % order.length] : item;
  });
  const itemAt = i => displayItems[i];
  const videoDurationAt = i => {
    const item = itemAt(i);
    const setting = Object.assign({}, item && m.overrides[item.id] || {}, m.cutOverrides[i] || {}).videoDuration;
    return item && item.type === 'video' && setting != null && Number.isFinite(+setting) && +setting > 0 ? J.clamp(+setting, 0.04, 3600) : null;
  };
  const manualEntries = Object.entries(m.timing.lineTimes).filter(([i, t]) => +i < count && isFinite(+t));
  const manualEnd = Math.max(0, ...manualEntries.map(([, t]) => +t + 4));
  const fixedMinimum = Math.max(count * 0.04, ...manualEntries.map(([i, t]) => +t + (count - +i) * 0.04));
  let duration = fixedDuration != null
    ? Math.max(fixedDuration, lyricPlan.duration, fixedMinimum)
    : Math.max(lyricPlan.duration, audioDuration || 0,
      manualEnd, lyricPlan.lines.length ? 0 : Array.from({ length: count }, (_, i) => itemAt(i)).reduce((n, x) => n + (x && x.type === 'video' ? J.clamp(+x.duration || 4, 1, 12) : 4), 0));
  const lyricCount = Math.min(count, lyricPlan.lines.length);
  const starts = Array.from({ length: count }, (_, i) => {
    const v = m.timing.lineTimes[i];
    if (v != null && isFinite(+v)) return J.clamp(+v, 0, duration);
    if (lyricPlan.lines[i]) return lyricPlan.lines[i].start;
    if (lyricCount) return lyricPlan.lines[lyricCount - 1].start + (duration - lyricPlan.lines[lyricCount - 1].start) * (i - lyricCount + 1) / (count - lyricCount + 1);
    return i * duration / Math.max(1, count);
  });
  const lastTail = count ? Math.max(0.04, duration - starts[count - 1]) : 0;
  for (let i = 1; i < starts.length; i++) {
    const minimum = starts[i - 1] + (m.timing.lineTimes[i] == null ? videoDurationAt(i - 1) || 0.04 : 0.04);
    starts[i] = Math.max(starts[i], minimum);
    if (fixedDuration != null && m.timing.lineTimes[i] == null) starts[i] = Math.max(starts[i - 1] + 0.04, Math.min(starts[i], duration - (count - i) * 0.04));
  }
  if (count) duration = Math.max(duration, starts[count - 1] + (fixedDuration == null ? videoDurationAt(count - 1) ?? lastTail : 0.04));
  const cuts = Array.from({ length: count }, (_, i) => {
    const item = itemAt(i), ov = Object.assign({}, item && m.overrides[item.id] || {}, m.cutOverrides[i] || {});
    const seed = ov.lock && ov.lockedSeed != null ? ov.lockedSeed : J.h(project.seed, m.seed, i, ov.seed | 0);
    const rng = J.rng(seed), reroll = ov.seed != null;
    const videoDuration = videoDurationAt(i);
    const nextStart = i + 1 < count ? starts[i + 1] : duration;
    return { index: i, itemId: item ? item.id : null, sourceItemId: baseItems[i]?.id || null, name: item ? item.name : '画像無し', type: item ? item.type : null, start: starts[i], end: videoDuration != null ? Math.min(nextStart, starts[i] + videoDuration) : nextStart, videoDuration,
      layout: ov.layout === 'stretch' ? 'cover' : J.MEDIA_LAYOUT[ov.layout] ? ov.layout : reroll ? rng.pick(Object.keys(J.MEDIA_LAYOUT)) : 'contain', enter: ov.enter || (reroll ? rng.pick(Object.keys(J.MEDIA_ENTER)) : 'cut'),
      hold: ov.hold || (reroll ? rng.pick(Object.keys(J.MEDIA_HOLD)) : 'still'), exit: ov.exit || (reroll ? rng.pick(Object.keys(J.MEDIA_EXIT)) : 'cut'),
      treat: ov.treat || (reroll ? rng.pick(Object.keys(J.MEDIA_TREAT)) : 'none'),
      zoom: 100, focus: 'mc',
      videoLoop: !!item && item.type === 'video' && ov.videoLoop !== false,
      chromaKey: !!item && item.type === 'video' && ov.chromaKey === true,
      chromaColor: /^#[0-9a-fA-F]{6}$/.test(ov.chromaColor || '') ? ov.chromaColor : '#00ff00',
      placement: J.normalizeMediaPlacement(ov.placement), seed };
  });
  if (J.mediaTechnique) for (const cut of cuts) {
    const ov = Object.assign({}, m.overrides[cut.itemId] || {}, m.cutOverrides[cut.index] || {});
    Object.assign(cut, J.mediaTechnique(project, ov, J.rng(J.h(cut.seed, 173)), layer));
    if (J.applyMediaPhases) J.applyMediaPhases(project, cut, ov, layer);
    cut.effectTransition = cut.trans;
    delete cut.trans;
  }
  for (const cut of cuts) {
    const ov = Object.assign({}, m.overrides[cut.itemId] || {}, m.cutOverrides[cut.index] || {});
    cut.placementMode = cut.placement ? 'manual' : 'default';
    if (cut.placement || !cut.itemId) continue;
    if (ov.lock) {
      // Old locks without a stored placement retain their original centered framing.
      cut.placement = J.normalizeMediaPlacement(ov.lockedPlacement);
      cut.placementMode = ov.lockedPlacementMode || (cut.placement ? 'auto' : 'default');
    } else if (cut.technique && !['none', 'legacy'].includes(cut.technique) && cut.effectSettings?.autoPlacement !== false) {
      cut.placement = J.autoMediaPlacement(project, cut, items.find(item => item.id === cut.itemId), lyricPlan, layer);
      cut.placementMode = 'auto';
    }
  }
  for (let i = 1; i < cuts.length; i++) {
    const cut = cuts[i], prev = cuts[i - 1], ov = Object.assign({}, m.overrides[cut.itemId] || {}, m.cutOverrides[i] || {});
    if (!cut.itemId || !prev.itemId) continue;
    const rng = J.rng(J.h(cut.seed, 89));
    const registry = J.TRANS || {}, options = ['crossfade', ...J.MEDIA_TRANS_KEYS.filter(k => registry[k])];
    const selectedTrans = cut.technique && cut.technique !== 'legacy' ? cut.effectTransition : ov.trans;
    delete cut.trans;
    const trans = selectedTrans === 'none' ? null : options.includes(selectedTrans) ? selectedTrans : rng.chance(0.65) ? rng.pick(options) : null;
    if (trans && cut.end - cut.start > 0.2 && Math.abs(prev.end - cut.start) < 0.06) {
      cut.trans = trans;
      cut.transDur = Math.min(registry[trans] ? registry[trans].dur || 0.35 : 0.35, 0.6, (cut.end - cut.start) * 0.45);
      cut.transP = registry[trans] && registry[trans].plan ? registry[trans].plan(rng, lyricPlan.style) : {};
    }
  }
  return { cuts, duration, applyLyricBackground: J.mediaEffectSettings(project, layer).applyLyricBackground !== false, blend: m.blend, opacity: m.opacity, randomOrder: m.randomOrder, loop: m.loop };
};
J.mediaAt = (plan, t, layer = 'media') => plan[layer] && plan[layer].cuts.find(c => t >= c.start && t < c.end) || null;
J.mediaVideoTime = (cut, t, duration) => {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const elapsed = Math.max(0, t - cut.start);
  return Math.min(cut.videoLoop ? elapsed % duration : elapsed, Math.max(0, duration - 0.001));
};

const DB = 'jizura-media-v1';
const dbOpen = () => new Promise((resolve, reject) => {
  const q = indexedDB.open(DB, 1);
  q.onupgradeneeded = () => q.result.createObjectStore('files');
  q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
});
const dbOp = async (mode, cb) => {
  const db = await dbOpen();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode), q = cb(tx.objectStore('files'));
    tx.oncomplete = () => resolve(q.result);
    tx.onerror = () => reject(tx.error || q.error); tx.onabort = () => reject(tx.error || new Error('Media storage transaction aborted'));
  }); } finally { db.close(); }
};
J.storeMedia = (id, file) => dbOp('readwrite', s => s.put(file, id));
J.loadMedia = id => dbOp('readonly', s => s.get(id));
J.removeMedia = id => dbOp('readwrite', s => s.delete(id));
J.attachMedia = (item, file, assets = J.mediaAssets) => new Promise((resolve, reject) => {
  const previous = assets.get(item.id); if (previous) URL.revokeObjectURL(previous.url);
  const url = URL.createObjectURL(file);
  const el = document.createElement(item.type === 'video' ? 'video' : 'img');
  if (item.type === 'video') { el.muted = true; el.playsInline = true; el.preload = 'auto'; }
  const ready = () => {
    item.width = el.videoWidth || el.naturalWidth;
    item.height = el.videoHeight || el.naturalHeight;
    let poster = url;
    if (item.type === 'video') {
      try { const c = document.createElement('canvas'); c.width = 96; c.height = 54; c.getContext('2d').drawImage(el, 0, 0, 96, 54); poster = c.toDataURL('image/png'); } catch (e) {}
    }
    const posterElement = item.type === 'video' ? new Image() : null;
    if (posterElement) posterElement.src = poster;
    assets.set(item.id, { url, element: el, type: item.type, poster, posterElement, file }); resolve(el);
  };
  el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像・動画を読み込めませんでした')); };
  if (item.type === 'video') el.onloadeddata = ready; else el.onload = ready;
  el.src = url;
});
const seekMediaVideo = async (v, target, signal) => {
  v.pause(); target = Math.max(0, Math.min(target, (v.duration || 1) - 0.001));
  if (Math.abs(v.currentTime - target) < 0.002 && v.readyState >= 2) return;
  await new Promise((resolve, reject) => {
    const finish = () => { v.removeEventListener('seeked', ok); v.removeEventListener('error', fail); if (signal) signal.removeEventListener('abort', abort); };
    const ok = () => { finish(); resolve(); }, fail = () => { finish(); reject(new Error('動画を読み込めませんでした')); }, abort = () => { finish(); reject(new Error('キャンセルしました')); };
    v.addEventListener('seeked', ok, { once: true }); v.addEventListener('error', fail, { once: true });
    if (signal) signal.addEventListener('abort', abort, { once: true });
    v.currentTime = target;
  });
};
const transitionFrame = layer => layer === 'media' ? J.mediaTransitionFrame : J.foregroundTransitionFrame;
const captureMediaVideo = (plan, cut, layer) => {
  const asset = J.mediaAssets.get(cut.itemId), v = asset && asset.element;
  if (!v || !v.videoWidth || !v.videoHeight || v.readyState < 2) return;
  const old = transitionFrame(layer);
  const c = old && old.canvas || document.createElement('canvas');
  if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
  c.getContext('2d').drawImage(v, 0, 0);
  if (layer === 'media') J.mediaTransitionFrame = { plan, index: cut.index, canvas: c };
  else J.foregroundTransitionFrame = { plan, index: cut.index, canvas: c };
};
J.prepareMediaFrame = async (plan, t, signal) => {
  for (const layer of ['media', 'foreground']) {
    const cut = J.mediaAt(plan, t, layer); if (!cut) continue;
    const prev = cut.index > 0 && plan[layer].cuts[cut.index - 1], snapshot = transitionFrame(layer);
    if (prev && prev.type === 'video' && cut.trans && t - cut.start < cut.transDur && (!snapshot || snapshot.plan !== plan || snapshot.index !== prev.index)) {
      const prior = J.mediaAssets.get(prev.itemId);
      if (prior) { await seekMediaVideo(prior.element, J.mediaVideoTime(prev, prev.end - 0.001, prior.element.duration), signal); captureMediaVideo(plan, prev, layer); }
    }
    if (cut.type !== 'video') continue;
    const asset = J.mediaAssets.get(cut.itemId); if (asset) await seekMediaVideo(asset.element, J.mediaVideoTime(cut, t, asset.element.duration), signal);
  }
};
J.syncMediaPreview = (plan, t, playing) => {
  const active = new Map();
  for (const layer of ['media', 'foreground']) {
    const cut = J.mediaAt(plan, t, layer), last = layer === 'media' ? J._previewMediaCut : J._previewForegroundCut;
    const prev = cut && cut.index > 0 && plan[layer].cuts[cut.index - 1];
    if (prev && prev.type === 'video' && cut.trans && t - cut.start < cut.transDur && last && last.plan === plan && last.index === prev.index) captureMediaVideo(plan, prev, layer);
    if (layer === 'media') J._previewMediaCut = cut ? { plan, index: cut.index } : null;
    else J._previewForegroundCut = cut ? { plan, index: cut.index } : null;
    if (cut && cut.type === 'video') active.set(cut.itemId, cut);
  }
  for (const [id, asset] of J.mediaAssets) {
    if (asset.type !== 'video') continue;
    const v = asset.element, cut = active.get(id);
    if (!cut) { v.pause(); v.loop = false; continue; }
    v.loop = !!cut.videoLoop;
    const target = J.mediaVideoTime(cut, t, v.duration);
    if (Math.abs(v.currentTime - target) > (playing ? 0.18 : 0.02)) v.currentTime = target;
    if (playing && v.paused) v.play().catch(() => {});
    if (!playing) v.pause();
  }
};
const chromaCanvases = new WeakMap();
J.chromaSource = (src, cut, w, h) => {
  let c = chromaCanvases.get(src);
  if (!c) { c = document.createElement('canvas'); chromaCanvases.set(src, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d', { willReadFrequently: true });
  x.globalCompositeOperation = 'copy'; x.drawImage(src, 0, 0, w, h); x.globalCompositeOperation = 'source-over';
  const pixels = x.getImageData(0, 0, w, h), d = pixels.data;
  const key = cut.chromaColor || '#00ff00', kr = parseInt(key.slice(1, 3), 16), kg = parseInt(key.slice(3, 5), 16), kb = parseInt(key.slice(5, 7), 16);
  const keyMax = Math.max(kr, kg, kb), keyMin = Math.min(kr, kg, kb), keyRange = keyMax - keyMin;
  const hueOf = (r, g, b, max, range) => {
    if (max === r) return ((g - b) / range + 6) % 6;
    if (max === g) return (b - r) / range + 2;
    return (r - g) / range + 4;
  };
  const keyHue = keyRange ? hueOf(kr, kg, kb, keyMax, keyRange) : 0;
  for (let i = 0; i < d.length; i += 4) {
    if (keyRange < 32) {
      const distance = Math.hypot(d[i] - kr, d[i + 1] - kg, d[i + 2] - kb);
      d[i + 3] = Math.round(d[i + 3] * J.clamp((distance - 65) / 55, 0, 1));
      continue;
    }
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), range = max - Math.min(r, g, b);
    if (max < 24 || range < max * 0.18) continue;
    const hue = hueOf(r, g, b, max, range), difference = Math.abs(hue - keyHue);
    const hueDistance = Math.min(difference, 6 - difference);
    const hueMatch = 1 - J.clamp((hueDistance - 0.35) / 0.4, 0, 1);
    const saturationMatch = J.clamp((range / max - 0.18) / 0.17, 0, 1);
    d[i + 3] = Math.round(d[i + 3] * (1 - hueMatch * saturationMatch));
  }
  // Green-screen exports may include black padding inside the video frame.
  // Trim dark runs from the four edges without erasing enclosed dark subject details.
  const trim = (start, step, length) => {
    for (let n = 0, i = start; n < length; n++, i += step) {
      if (d[i] > 24 || d[i + 1] > 24 || d[i + 2] > 24) break;
      d[i + 3] = 0;
    }
  };
  for (let row = 0; row < h; row++) {
    trim(row * w * 4, 4, w);
    trim((row * w + w - 1) * 4, -4, w);
  }
  for (let col = 0; col < w; col++) {
    trim(col * 4, w * 4, h);
    trim(((h - 1) * w + col) * 4, -w * 4, h);
  }
  x.putImageData(pixels, 0, 0); return c;
};
J.drawMediaCut = (ctx, cut, t, options = {}) => {
  const asset = J.mediaAssets.get(cut.itemId); if (!asset) return false;
  const src = options.source || asset.element, sw = src.videoWidth || src.naturalWidth || src.width, sh = src.videoHeight || src.naturalHeight || src.height;
  if (!sw || !sh) return false;
  const w = ctx.canvas.width, h = ctx.canvas.height, d = Math.max(0.04, cut.end - cut.start), p = J.clamp((t - cut.start) / d, 0, 1);
  const fade = options.noEnter ? 1 : Math.min(1, (t - cut.start) / Math.min(cut.effectSettings?.duration || 0.45, d * 0.3));
  const out = options.noExit ? 1 : Math.min(1, (cut.end - t) / Math.min(cut.effectSettings?.duration || 0.45, d * 0.3));
  if (cut.technique && (cut.technique !== 'legacy' || cut.independentPhases) && J.paintMediaEffect) {
    const placement = cut.placement && J.mediaPlacementRect(cut.placement, sw, sh, w, h);
    const scale = cut.layout === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const fit = placement ? [placement.w * w, placement.h * h] : [sw * scale, sh * scale];
    const previewScale = options.previewEdit ? Math.min(1, w / sw, h / sh) : 1;
    const source = cut.type === 'video' && cut.chromaKey ? J.chromaSource(src, cut, Math.max(1, Math.round(sw * previewScale)), Math.max(1, Math.round(sh * previewScale))) : src;
    ctx.save();
    ctx.translate(placement ? (placement.x + placement.w / 2) * w : w / 2, placement ? (placement.y + placement.h / 2) * h : h / 2);
    ctx.rotate((cut.placement?.angle || 0) * Math.PI / 180);
    J.paintMediaEffect(ctx, source, fit, options.previewEdit ? Object.assign({}, cut, { enter: 'cut', exit: 'cut', hold: 'still', treat: 'none' }) : cut, p, fade, out);
    ctx.restore(); return true;
  }
  let alpha = (cut.enter === 'fade' ? fade : 1) * (cut.exit === 'fade' ? out : 1);
  let z = (cut.zoom || 100) / 100 * (cut.hold === 'push' ? 1 + p * 0.12 : 1);
  if (cut.enter === 'zoom' && !options.noEnter) z *= 1 + (1 - fade) * 0.16;
  if (cut.exit === 'zoom' && !options.noExit) z *= 1 + (1 - out) * 0.16;
  let dx = cut.hold === 'pan' ? (0.5 - p) * w * 0.12 : 0;
  if (cut.enter === 'slide' && !options.noEnter) dx += (1 - fade) * w;
  if (cut.exit === 'slide' && !options.noExit) dx -= (1 - out) * w;
  const s = cut.layout === 'contain' ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
  const placement = cut.placement && J.mediaPlacementRect(cut.placement, sw, sh, w, h);
  const fit = placement ? [placement.w * w, placement.h * h] : [sw * s, sh * s];
  const focus = J.mediaFocusPoint(cut.focus, w, h);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(placement ? (placement.x + placement.w / 2) * w + dx : w / 2 + dx, placement ? (placement.y + placement.h / 2) * h : h / 2);
  if (placement) ctx.rotate((cut.placement.angle || 0) * Math.PI / 180);
  if (!placement) ctx.translate(focus.x, focus.y);
  ctx.scale(z, z);
  if (!placement) ctx.translate(-focus.x, -focus.y);
  ctx.filter = ({ mono: 'grayscale(1)', sepia: 'sepia(1)', contrast: 'contrast(1.6)', blur: 'blur(8px)' })[cut.treat] || 'none';
  const previewScale = options.previewEdit ? Math.min(1, w / sw, h / sh) : 1;
  const source = cut.type === 'video' && cut.chromaKey ? J.chromaSource(src, cut, Math.max(1, Math.round(sw * previewScale)), Math.max(1, Math.round(sh * previewScale))) : src;
  ctx.drawImage(source, -fit[0] / 2, -fit[1] / 2, fit[0], fit[1]); ctx.restore();
  return true;
};
J.drawMedia = (ctx, plan, t, owner, layer = 'media', previewEdit = false) => {
  const cut = J.mediaAt(plan, t, layer); if (!cut || !J.mediaAssets.has(cut.itemId)) return false;
  const prev = cut.index > 0 ? plan[layer].cuts[cut.index - 1] : null;
  const next = plan[layer].cuts[cut.index + 1];
  const active = !previewEdit && prev && cut.trans && t - cut.start < cut.transDur && Math.abs(prev.end - cut.start) < 0.06 && J.mediaAssets.has(prev.itemId);
  if (!active) return J.drawMediaCut(ctx, cut, t, { noEnter: !cut.independentPhases && !!cut.trans, noExit: !cut.independentPhases && !!(next && next.trans && Math.abs(next.start - cut.end) < 0.06), previewEdit });
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const canvas = key => {
    const c = owner ? (owner[key] || (owner[key] = document.createElement('canvas'))) : document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  };
  const A = canvas(layer + 'PrevLayer'), B = canvas(layer + 'NextLayer');
  const bg = plan.style && plan.style.schemes ? plan.style.schemes[0].bg : '#000';
  const clear = c => { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, w, h); if (layer === 'media') { x.fillStyle = bg; x.fillRect(0, 0, w, h); } return x; };
  const snapshot = transitionFrame(layer);
  const priorAsset = J.mediaAssets.get(prev.itemId);
  const prevSource = prev.type === 'video' ? (snapshot && snapshot.plan === plan && snapshot.index === prev.index ? snapshot.canvas : prev.itemId === cut.itemId && priorAsset.posterElement && priorAsset.posterElement.complete ? priorAsset.posterElement : null) : null;
  J.drawMediaCut(clear(A), prev, Math.max(prev.start, prev.end - 0.001), { noExit: true, source: prevSource });
  J.drawMediaCut(clear(B), cut, t, { noEnter: !cut.independentPhases });
  const p = J.clamp((t - cut.start) / cut.transDur);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  if (cut.trans === 'crossfade' || !J.TRANS || !J.TRANS[cut.trans]) {
    ctx.drawImage(A, 0, 0); ctx.globalAlpha = J.smooth(0, 1, p); ctx.drawImage(B, 0, 0);
  } else {
    const st = plan.style, sc = st.schemes[0];
    try { J.TRANS[cut.trans].draw(ctx, A, B, p, { cw: w, ch: h, sc, scPrev: sc, st, P: cut.transP || {}, step: Math.floor(t * (plan.fps || 24)), t, scale: w / plan.W, allowFilter: true, seed: cut.seed | 0,
      tmp: (tw, th) => { const c = owner ? (owner.mediaTransTmp || (owner.mediaTransTmp = document.createElement('canvas'))) : document.createElement('canvas'); if (c.width !== tw || c.height !== th) { c.width = tw; c.height = th; } return c; } }); }
    catch (e) { console.warn('media trans', cut.trans, e); ctx.drawImage(B, 0, 0); }
  }
  ctx.restore();
  return true;
};
})();
