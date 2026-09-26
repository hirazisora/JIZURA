/* Media techniques: seeded recipes, transparent masks and canvas-local motion. */
(() => {
'use strict';
J.mediaLabel = (ja, en) => typeof document !== 'undefined' && document.documentElement?.lang === 'en' ? en : ja;
const label = J.mediaLabel;
J.MEDIA_TECH = {};
const add = (key, ja, en, group, enter, hold, exit, treat = 'none', trans = 'none') => {
  J.MEDIA_TECH[key] = { name: label(ja, en), group, enter, hold, exit, treat, trans };
};
add('dissolve', '柔らかなディゾルブ', 'Soft dissolve', 'cinema', 'fade', 'still', 'fade', 'none', 'crossfade');
add('pushIn', 'シネマ・プッシュイン', 'Cinematic push in', 'cinema', 'fade', 'push', 'fade');
add('pullOut', 'シネマ・プルアウト', 'Cinematic pull out', 'cinema', 'fade', 'pull', 'fade');
add('drift', '浮遊するフレーム', 'Floating frame', 'cinema', 'fade', 'float', 'fade');
add('panorama', 'パノラマ移動', 'Panorama', 'cinema', 'slide', 'pan', 'slide');
add('rise', 'ゆっくり上昇', 'Slow ascent', 'cinema', 'rise', 'rise', 'rise');
add('diagonal', '対角トラッキング', 'Diagonal tracking', 'cinema', 'diagonal', 'diagonal', 'diagonal');
add('rackFocus', 'ピント送り', 'Rack focus', 'cinema', 'blur', 'push', 'blur');
add('pop', '弾むポップ', 'Spring pop', 'dynamic', 'bounce', 'breathe', 'shrink');
add('spin', 'スピンイン', 'Spin in', 'dynamic', 'spin', 'rock', 'spin');
add('swing', '振り子スイング', 'Pendulum swing', 'dynamic', 'swing', 'swing', 'swing');
add('whip', 'ウィップパン', 'Whip pan', 'dynamic', 'whip', 'still', 'whip');
add('impact', 'インパクトズーム', 'Impact zoom', 'dynamic', 'impact', 'shake', 'zoom');
add('pulse', 'リズムパルス', 'Rhythmic pulse', 'dynamic', 'zoom', 'pulse', 'shrink');
add('orbit', 'オービット', 'Orbit', 'dynamic', 'fade', 'orbit', 'fade');
add('tumble', '回転ズーム', 'Rotating zoom', 'dynamic', 'spin', 'rotate', 'shrink');
add('wipe', '横ワイプ', 'Horizontal reveal', 'mask', 'wipe', 'still', 'wipe');
add('curtain', 'カーテンオープン', 'Curtain open', 'mask', 'curtain', 'push', 'curtain');
add('iris', '円形アイリス', 'Circular iris', 'mask', 'iris', 'breathe', 'iris');
add('diamond', 'ダイヤモンド', 'Diamond reveal', 'mask', 'diamond', 'still', 'diamond');
add('blinds', 'ブラインド', 'Venetian blinds', 'mask', 'blinds', 'pan', 'blinds');
add('tiles', 'タイル出現', 'Tile reveal', 'mask', 'tiles', 'still', 'tiles');
add('scan', '縦スキャン', 'Vertical scan', 'mask', 'scan', 'rise', 'scan');
add('split', 'スプリットオープン', 'Split open', 'mask', 'split', 'pull', 'split');
add('noir', 'フィルム・ノワール', 'Film noir', 'texture', 'fade', 'push', 'fade', 'mono');
add('sepia', 'セピアの記憶', 'Sepia memory', 'texture', 'blur', 'float', 'fade', 'sepia');
add('vivid', 'ビビッドポップ', 'Vivid pop', 'texture', 'bounce', 'pulse', 'shrink', 'vivid');
add('dream', 'ドリームグロー', 'Dream glow', 'texture', 'blur', 'breathe', 'blur', 'glow');
add('duotone', '冷たいコントラスト', 'Cool contrast', 'texture', 'wipe', 'pan', 'wipe', 'cool');
add('warm', 'ウォームフィルム', 'Warm film', 'texture', 'fade', 'pull', 'fade', 'warm');
add('invert', 'ネガ反転', 'Negative', 'texture', 'scan', 'still', 'scan', 'invert');
add('poster', 'ポスタライズ', 'Poster contrast', 'texture', 'tiles', 'still', 'tiles', 'poster');
add('echo', 'モーション残像', 'Motion echoes', 'graphic', 'slide', 'pan', 'slide', 'echo');
add('glitch', 'グリッチスライス', 'Glitch slices', 'graphic', 'glitch', 'shake', 'glitch', 'glitch');
add('triptych', '三連パネル', 'Triptych', 'graphic', 'curtain', 'still', 'curtain', 'triptych');
add('prism', 'プリズム残像', 'Prismatic echoes', 'graphic', 'zoom', 'float', 'zoom', 'prism');
for (const [key, ja, en] of [
  ['wipe', 'ワイプ接続', 'Wipe transition'], ['diagonalWipe', '斜めワイプ接続', 'Diagonal wipe transition'],
  ['clockWipe', '時計ワイプ接続', 'Clock wipe transition'], ['irisOpen', 'アイリス接続', 'Iris transition'],
  ['pushSlide', '押し出し接続', 'Push transition'], ['cover', 'カバー接続', 'Cover transition'],
  ['uncover', 'アンカバー接続', 'Uncover transition'], ['zoomThrough', 'ズームスルー接続', 'Zoom through transition'],
  ['checker', 'チェッカー接続', 'Checker transition'], ['blockDissolve', 'ブロック接続', 'Block dissolve transition'],
  ['flashCross', 'フラッシュ接続', 'Flash cross transition'],
]) add('transition_' + key, ja, en, 'transition', 'fade', 'still', 'fade', 'none', key);
J.mediaEffectSettings = (p, layer = 'media') => {
  // Projects saved before the layer split have one shared mediaEffects object.
  const settings = Object.assign({ motion: 1, treatment: 1, duration: 0.45, autoPlacement: true, applyLyricBackground: true, sizeMin: 75, sizeMax: 125, enabled: {} }, p[layer]?.effects || p.mediaEffects || {});
  for (const [key, min, max, fallback] of [['motion', 0, 2, 1], ['treatment', 0, 1, 1], ['duration', .05, 1.5, .45]]) settings[key] = Number.isFinite(+settings[key]) ? J.clamp(+settings[key], min, max) : fallback;
  const sizeMin = Number.isFinite(+settings.sizeMin) ? J.clamp(+settings.sizeMin, 0, 500) : 75;
  const sizeMax = Number.isFinite(+settings.sizeMax) ? J.clamp(+settings.sizeMax, 0, 500) : 125;
  settings.sizeMin = Math.min(sizeMin, sizeMax); settings.sizeMax = Math.max(sizeMin, sizeMax);
  settings.enabled = settings.enabled && typeof settings.enabled === 'object' ? Object.assign({}, settings.enabled) : {};
  return settings;
};
J.randomMediaEffectSettings = (project, layer, rnd = Math.random) => {
  const settings = J.mediaEffectSettings(project, layer), keys = Object.keys(J.MEDIA_TECH);
  settings.enabled = Object.fromEntries(keys.map(key => [key, rnd() < .55]));
  // Keep a usable pool even for an unlucky draw, while still producing a subset.
  const pick = () => keys[Math.floor(rnd() * keys.length)];
  if (keys.length && !keys.some(key => settings.enabled[key])) settings.enabled[pick()] = true;
  if (keys.length > 1 && keys.every(key => settings.enabled[key])) settings.enabled[pick()] = false;
  return settings;
};
J.mediaTechnique = (project, ov, rng, layer = 'media') => {
  const settings = J.mediaEffectSettings(project, layer);
  // Untouched cuts retain the previous instant/still default. Explicit Auto is null.
  const legacy = ['layout', 'enter', 'hold', 'exit', 'treat', 'trans'].some(k => Object.hasOwn(ov, k));
  let key = ov.lock && ov.lockedTechnique ? ov.lockedTechnique : ov.technique;
  if (key === 'legacy') return { technique: 'legacy' };
  if (key === undefined) {
    if (legacy) return { technique: 'legacy' };
    key = ov.seed != null ? null : 'none';
  }
  if (key !== 'none' && !J.MEDIA_TECH[key]) {
    const pool = Object.keys(J.MEDIA_TECH).filter(k => !J.MEDIA_TECH[k].stage && settings.enabled[k] !== false);
    key = pool.length ? rng.pick(pool) : 'none';
  }
  // Keep the cut's source filename; technique labels are read from MEDIA_TECH.
  const { name, ...recipe } = J.MEDIA_TECH[key] || {};
  return Object.assign({ technique: key, effectSettings: settings, layout: 'contain', enter: 'cut', hold: 'still', exit: 'cut', treat: 'none', trans: 'none' }, recipe);
};
J.mediaTechniqueName = cut => cut.technique === 'legacy' ? label('従来の設定', 'Legacy settings') : J.MEDIA_TECH[cut.technique]?.name || label('演出無し', 'No effects');

J.paintMediaEffect = (ctx, source, fit, cut, p, fade, out) => {
  // Also synchronize old projects and manually selected legacy hold names.
  if (J.mediaBpmHoldAliases?.[cut.hold]) cut = {...cut, hold:J.mediaBpmHoldAliases[cut.hold]};
  const settings = cut.effectSettings || {}, amount = settings.motion ?? 1, treatment = settings.treatment ?? 1;
  const w = fit[0], h = fit[1], tau = Math.PI * 2, t = p * tau;
  let x = 0, y = 0, rotation = 0, scale = 1, sx = 1, sy = 1, alpha = 1, blur = 0;
  const progress = q => 1 - Math.pow(1 - J.clamp(q, 0, 1), 3);
  const phase = (type, q, leaving) => {
    const a = 1 - progress(q), sign = leaving ? -1 : 1;
    if (type === 'fade') alpha *= progress(q);
    if (type === 'slide' || type === 'whip') x += sign * a * w * (type === 'whip' ? 1.6 : 1);
    if (type === 'rise') y += sign * a * h;
    if (type === 'diagonal') { x += sign * a * w; y += sign * a * h; }
    if (type === 'zoom' || type === 'impact') scale *= 1 + a * (type === 'impact' ? 1.2 : 0.35);
    if (type === 'shrink') { scale *= Math.max(0.001, 1 - a); alpha *= progress(q); }
    if (type === 'bounce') { scale *= Math.max(0.001, 1 - Math.exp(-7 * q) * Math.cos(q * 11)); alpha *= Math.min(1, q * 5); }
    if (type === 'spin') { rotation += sign * a * Math.PI; scale *= Math.max(0.001, 1 - a); alpha *= progress(q); }
    if (type === 'swing') { rotation += sign * a * 0.7; y -= a * h * 0.4; alpha *= progress(q); }
    if (type === 'blur') { blur += a * 22; alpha *= progress(q); }
    if (type === 'glitch') { x += Math.sin(q * 61) * a * w * 0.22; alpha *= progress(q); }
    if (type === 'slideLeft') x -= sign * a * w;
    if (type === 'fall') y -= sign * a * h;
    if (type === 'flipX') { sx *= Math.sin(J.clamp(q) * Math.PI / 2); x += sign * a * w * .15; alpha *= progress(q); }
    if (type === 'flipY') { sy *= Math.sin(J.clamp(q) * Math.PI / 2); y += sign * a * h * .15; alpha *= progress(q); }
    if (type === 'squeezeX') { sx *= progress(q); sy *= 1 + a * .4; alpha *= progress(q); }
    if (type === 'squeezeY') { sy *= progress(q); sx *= 1 + a * .4; alpha *= progress(q); }
  };
  phase(cut.enter, fade, false); phase(cut.exit, out, true);
  switch (cut.hold) {
    case 'push': scale *= 1 + p * 0.16; break;
    case 'pull': scale *= 1.16 - p * 0.16; break;
    case 'pan': x += (0.5 - p) * w * 0.16; break;
    case 'rise': y += (0.5 - p) * h * 0.16; break;
    case 'diagonal': x += (p - 0.5) * w * 0.12; y -= (p - 0.5) * h * 0.12; break;
    case 'float': x += Math.sin(t) * w * 0.025; y += Math.sin(t * 2) * h * 0.035; rotation += Math.sin(t) * 0.025; break;
    case 'breathe': scale *= 1 + Math.sin(p * Math.PI) * 0.065; break;
    case 'pulse': scale *= 1 + Math.pow((1 + Math.cos(t * 3)) / 2, 6) * 0.09; break;
    case 'rock': rotation += Math.sin(t) * 0.06; break;
    case 'swing': rotation += Math.sin(t * 2) * 0.11; break;
    case 'orbit': x += Math.sin(t) * w * 0.05; y += Math.cos(t) * h * 0.05; break;
    case 'rotate': rotation += (p - 0.5) * 0.3; break;
    case 'shake': x += Math.sin(t * 19) * w * 0.009; y += Math.cos(t * 23) * h * 0.009; break;
  }
  if (J.mediaVariationState) {
    const v = J.mediaVariationState(cut, p, fade, out, w, h);
    x += v.x; y += v.y; rotation += v.rotation; scale *= v.scale; alpha *= v.alpha;
  }
  if (J.mediaBeatState) {
    const v = J.mediaBeatState(cut, p, w, h);
    x += v.x; y += v.y; rotation += v.rotation; scale *= v.scale; alpha *= v.alpha;
    sx *= v.sx ?? 1; sy *= v.sy ?? 1;
  }
  ctx.translate(x * amount, y * amount); ctx.rotate(rotation * amount); ctx.scale(Math.max(0.001, 1 + (scale * sx - 1) * amount), Math.max(0.001, 1 + (scale * sy - 1) * amount)); ctx.globalAlpha *= alpha;
  const mask = (type, q) => {
    if (q >= 1) return;
    const a = progress(q); ctx.beginPath();
    if (type === 'wipe') ctx.rect(-w / 2, -h / 2, w * a, h);
    else if (type === 'scan') ctx.rect(-w / 2, -h / 2, w, h * a);
    else if (type === 'curtain') ctx.rect(-w * a / 2, -h / 2, w * a, h);
    else if (type === 'split') ctx.rect(-w / 2, -h * a / 2, w, h * a);
    else if (type === 'iris') ctx.arc(0, 0, Math.hypot(w, h) * a / 2, 0, tau);
    else if (type === 'diamond') { ctx.moveTo(0, -h * a); ctx.lineTo(w * a, 0); ctx.lineTo(0, h * a); ctx.lineTo(-w * a, 0); ctx.closePath(); }
    else if (type === 'blinds') { for (let i = 0; i < 10; i++) ctx.rect(-w / 2, -h / 2 + i * h / 10, w, h * a / 10); }
    else if (type === 'tiles') { for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const s = J.clamp(q * 1.8 - (i + j) / 12, 0, 1); ctx.rect(-w / 2 + (i + (1 - s) / 2) * w / 6, -h / 2 + (j + (1 - s) / 2) * h / 4, w * s / 6, h * s / 4); } }
    else if (!J.mediaVariationMask || !J.mediaVariationMask(ctx, type, q, w, h, cut.seed)) return;
    ctx.clip();
  };
  mask(cut.enter, fade); mask(cut.exit, out);
  const filters = { mono: `grayscale(${treatment})`, sepia: `sepia(${treatment * .85})`, contrast: `contrast(${1 + treatment * .6})`, blur: `blur(${8 * treatment}px)`, vivid: `saturate(${1 + treatment})`, glow: `brightness(${1 + treatment * .12}) saturate(${1 + treatment * .25})`, cool: `sepia(${treatment * .5}) hue-rotate(150deg)`, warm: `sepia(${treatment * .45}) saturate(${1 + treatment * .4})`, invert: `invert(${treatment})`, poster: `contrast(${1 + treatment * 1.5}) saturate(${1 + treatment * .6})` };
  ctx.filter = `${filters[cut.treat] || ''} blur(${blur * w / 1920}px)`.trim();
  const draw = (dx = 0, dy = 0, dw = w, dh = h) => ctx.drawImage(source, -dw / 2 + dx, -dh / 2 + dy, dw, dh);
  if (['echo', 'prism'].includes(cut.treat) && treatment > 0) {
    ctx.save(); ctx.globalAlpha *= .22 * treatment;
    for (const n of [-2, -1, 1, 2]) { if (cut.treat === 'prism') ctx.filter = `hue-rotate(${n * 65}deg)`; draw(n * w * .035 * treatment); }
    ctx.restore();
  }
  if (J.drawMediaVariation && J.drawMediaVariation(ctx, source, fit, cut, p, treatment)) return;
  if (cut.treat === 'triptych' && treatment > 0) { for (const n of [-1, 0, 1]) draw(n * w / 3, 0, w / 3, h / 3); }
  else if (cut.treat === 'glitch' && treatment > 0) {
    for (let i = 0; i < 12; i++) { ctx.save(); ctx.beginPath(); ctx.rect(-w, -h / 2 + i * h / 12, w * 2, h / 12 + .5); ctx.clip(); draw(Math.sin(Math.floor(p * 32) * 19 + i * 31 + cut.seed) * w * .035 * treatment); ctx.restore(); }
  } else draw();
};
})();
