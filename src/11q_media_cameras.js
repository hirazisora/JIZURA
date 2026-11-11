/* Lyric cameras (詳細 → 手法 → カメラ) reused as foreground/background cinema techniques.
   Each media cut feeds the camera the same env fields the lyric renderer does. */
(() => {
'use strict';
const L = J.mediaLabel, PREFIX = 'cam_', DEG = Math.PI / 180;
J.MEDIA_CAMERA_KEYS = [];
for (const id of J.CAMERA_ORDER) {
  const key = PREFIX + id;
  J.MEDIA_CAMERA_KEYS.push(key);
  const def = { group: 'cinema', camera: id, enter: 'fade', hold: key, exit: 'fade', treat: 'none', trans: 'none' };
  // Read the camera's name on use: app/english.js renames the registry after this file loads.
  Object.defineProperty(def, 'name', { enumerable: true, get: () => L('カメラ：', 'Camera: ') + (J.CAMERA[id]?.name || id) });
  J.MEDIA_TECH[key] = def;
}
// Unset cameras follow the lyric random rules (追加分, 和風, part sets such as ホラー) for this project.
const settings = J.mediaEffectSettings;
J.mediaEffectSettings = (project, layer) => {
  const s = settings(project, layer);
  for (const key of J.MEDIA_CAMERA_KEYS) if (s.enabled[key] === undefined && J.randomOk && !J.randomOk(project, 'cam', key.slice(PREFIX.length))) s.enabled[key] = false;
  return s;
};

const beatAt = (beats, t) => {
  let lo = 0, hi = beats.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m] <= t) { i = m; lo = m + 1; } else hi = m - 1; }
  if (i < 0) return null;
  const len = i + 1 < beats.length ? beats[i + 1] - beats[i] : (i > 0 ? beats[i] - beats[i - 1] : .5);
  return { since: t - beats[i], len: Math.max(.2, len), index: i };
};
// One stable stand-in per media cut, so the cameras' per-cut caches and plans persist across frames.
const cameraCut = (cut, id) => {
  let c = cut.cameraCut;
  if (!c || c.id !== id || c.start !== cut.start || c.end !== cut.end || c.seed !== (cut.seed | 0)) {
    const seed = cut.seed | 0, def = J.CAMERA[id];
    c = { id, start: cut.start, end: cut.end, dur: Math.max(.04, cut.end - cut.start), seed, index: cut.index | 0, words: [] };
    try { c.P = def.plan ? def.plan(J.rng(J.h(seed, 631))) || {} : {}; } catch { c.P = {}; }
    Object.defineProperty(cut, 'cameraCut', { value: c, configurable: true, writable: true });
  }
  return c;
};
J.mediaCameraState = (cut, p, w, h) => {
  const id = J.MEDIA_TECH[cut.hold]?.camera, def = id && J.CAMERA[id];
  if (!def) return null;
  const c = cameraCut(cut, id), t = c.start + J.clamp(p, 0, 1) * c.dur, beats = cut.songBeats || [];
  // fx.motion .8 gives the cameras their standard strength; Motion intensity scales it in paint. No song loudness here:
  // energy is left unset so a loudness-driven camera (追加分2 音量で寄る) falls back to its own motion instead of standing still.
  const env = { cut: c, t, lt: t - c.start, ltb: t - c.start, step: Math.floor(t * 24 + 1e-6), W: w, H: h, fx: { motion: .8 },
    beat: beats.length ? beatAt(beats, t) : null, plan: { beats }, energy: null, scale: 1, allowFilter: true, pass: 'main' };
  let cam = null;
  try { cam = def.get(env, c.P); } catch { cam = null; }
  cam = cam || {};
  const n = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  return { x: n(cam.x), y: n(cam.y), rotation: n(cam.rot) * DEG, scale: n(cam.s, 1), sx: n(cam.sx, 1), sy: n(cam.sy, 1), skew: n(cam.skx) * DEG, blur: Math.max(0, n(cam.blur)) };
};
const previousState = J.mediaVariationState;
J.mediaVariationState = (cut, p, fade, out, w, h) => {
  const v = previousState(cut, p, fade, out, w, h), cam = J.mediaCameraState(cut, p, w, h);
  if (!cam) return v;
  v.x += cam.x; v.y += cam.y; v.rotation += cam.rotation; v.scale *= cam.scale;
  v.sx = (v.sx ?? 1) * cam.sx; v.sy = (v.sy ?? 1) * cam.sy; v.skew = (v.skew || 0) + cam.skew; v.blur = (v.blur || 0) + cam.blur;
  return v;
};
})();
