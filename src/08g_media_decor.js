/* Lyric decorations (詳細 → 手法 → 装飾) on foreground/background media cuts.
   The media frame plays the part of the lyric display area; the frame box is the
   "text" box that front decorations surround. */
(() => {
'use strict';
// Same parameters the lyric planner gives each decoration.
const decorParams = (rng, k) => ({ id: k, seed: rng.int(1, 1e9), n: rng.int(1, 3) + (k === 'shapes' ? 3 : 0) + (k === 'sparks' ? 4 : 0), right: rng.chance(0.5), low: rng.chance(0.5), accent: rng.chance(0.4), corner: rng.chance(0.5), big: rng.chance(0.4), mode: rng.pick(['count', 'index']), from: rng.int(0, 20), to: rng.int(30, 999), v: rng.int(0, 5), r: rng() });
// Candidates: the layer's own decoration checks (Details → Foreground / Background) and the
// random rules (追加分, 和風, part sets). Unset checks default to front decorations only, since
// back ones sit under the source and vanish behind opaque images.
J.mediaDecorOn = (settings, k) => settings?.decorEnabled?.[k] ?? J.DECOR[k]?.layer === 'front';
// Decorations that read the lyric text or look for free space beside the lyric draw nothing on a
// media frame (the frame is their whole box), so they are never picked for media cuts.
// dev/media_decor_test.cjs checks that every other front decoration draws.
J.MEDIA_DECOR_SKIP = new Set(["waveLine","speedCorner","twinkle","crossOut","heartsStars","verticalStrip","romajiLine","seal","hanabi","chochin","shimenawa","momiji","namiGashira","sonarArcs","circuit","punchHoles","indexTabs","vines","cloudPuffs","fireflies","memphis","decoCorners","musicNotes","hrStaticPatch","hrCracks","tyColophon","tyRunningHead","tyTextRule","tyTypeScale","xlWingLines","xlProtractor","xmSettle","xmSwarm","xmBounce","xmPendulum","xmDominoes","xmPong","xmConveyor","xmStairs","xmIsoCubes","xmSlide","xmGears","xmSortBars","xmPie","xmScatter","xmBeatSteps","xmGauge","xnSyllables","xnGlyphStats","xnVowels","xnLegend","xnAxes","hzPairEyes","hzStrayGlyph","hzHandprints","hzDoorAjar","hzFilmDirt","kzImpactTicks","kzWhooshCurls","kzWobbleArcs","kzMetronome","kzSpringCoils","kzPushRods","tzNoteMark","tzProgRule","tzTrackMarks","tzSideCaption","tzHeadEnd","tzNumStrip","tzDotLeader","tzCornerNums","tzReadCaret","wzShippo","wzYagasuri","wzUroko","wzMizuhiki","wzChidori","wzUme","wzKazaguruma"]);
J.mediaDecorCandidates = (project, layer = 'media') => { const settings = J.mediaEffectSettings(project, layer); return J.order('decor').filter(k => J.DECOR[k] && !J.MEDIA_DECOR_SKIP.has(k) && J.mediaDecorOn(settings, k) && (!J.randomOk || J.randomOk(project, 'decor', k))); };
J.pickMediaDecor = (project, cut, style, fx, layer = 'media') => {
  const rng = J.rng(J.h(cut.seed, 947)), cands = J.mediaDecorCandidates(project, layer).map(k => [k, (style?.decor?.[k] ?? 1) * (J.DECOR[k].w != null ? J.DECOR[k].w * .5 : .35)]).filter(([, w]) => w > 0);
  // One or two, more often two when the lyric decor slider is high.
  const count = Math.min(cands.length, rng.chance(.25 + .5 * (fx?.decor ?? .5)) ? 2 : 1), out = [];
  for (let i = 0; i < count; i++) { const k = rng.wpick(cands); cands.splice(cands.findIndex(c => c[0] === k), 1); out.push(decorParams(rng, k)); }
  return out;
};
const planMedia = J.planMedia;
J.planMedia = function(project, lyricPlan, audioDuration, layer = 'media') {
  const result = planMedia(project, lyricPlan, audioDuration, layer), m = project[layer] || {};
  for (const cut of result.cuts) {
    const ov = Object.assign({}, m.overrides?.[cut.itemId] || {}, m.cutOverrides?.[cut.index] || {});
    // Only automatic ("おまかせ") techniques get decorations; explicit ones and No effects stay plain.
    const auto = ov.technique === null || ov.technique === undefined && ov.seed != null;
    cut.decor = cut.itemId && cut.technique && !['none', 'legacy'].includes(cut.technique) && auto && cut.effectSettings?.decor && lyricPlan?.style ? J.pickMediaDecor(project, cut, lyricPlan.style, lyricPlan.fx, layer) : [];
    if (lyricPlan?.style) Object.defineProperty(cut, 'decorStage', { value: { W: lyricPlan.W, H: lyricPlan.H, style: lyricPlan.style, fx: lyricPlan.fx, fps: lyricPlan.fps }, configurable: true, writable: true });
  }
  return result;
};

const beatAt = (beats, t) => {
  let lo = 0, hi = beats.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (beats[m] <= t) { i = m; lo = m + 1; } else hi = m - 1; }
  if (i < 0) return null;
  const len = i + 1 < beats.length ? beats[i + 1] - beats[i] : (i > 0 ? beats[i] - beats[i - 1] : .5);
  return { since: t - beats[i], len: Math.max(.2, len), index: i };
};
let renderer = null;
// A stable lyric-like stand-in per media cut: decorations fade in/out with the media's own phases.
const decorCut = cut => {
  let c = cut.decorCut;
  if (!c || c.source !== cut.decor || c.start !== cut.start || c.end !== cut.end) {
    const dur = Math.max(.04, cut.end - cut.start), phase = Math.min(Math.max(.001,cut.effectSettings?.duration ?? .45), dur * .3);
    c = { source: cut.decor, start: cut.start, end: cut.end, dur, inDur: phase, outDur: phase, seed: cut.seed | 0, text: '', words: [], note: null, scheme: 0, decor: cut.decor, index: cut.index | 0 };
    Object.defineProperty(cut, 'decorCut', { value: c, configurable: true, writable: true });
  }
  return c;
};
// ctx: the media paint context, origin at the frame centre; w × h: the frame in canvas pixels.
J.drawMediaDecor = (ctx, cut, p, w, h, layer) => {
  const stage = cut.decorStage; if (!stage?.style || !J.Renderer) return;
  const list = cut.decor.filter(d => J.DECOR[d.id]?.layer === layer); if (!list.length) return;
  const k = ctx.canvas.width / stage.W, c = decorCut(cut), t = c.start + J.clamp(p, 0, 1) * c.dur, lt = t - c.start, beats = cut.songBeats || [];
  const plan = { W: stage.W, H: stage.H, style: stage.style, fx: stage.fx, fps: stage.fps, beats };
  renderer ||= new J.Renderer();
  ctx.save(); ctx.translate(-w / 2, -h / 2); ctx.scale(k, k);
  const env = renderer.makeEnv(ctx, plan, c, stage.style.schemes[0], { pass: 'main', t, lt, ltb: lt, step: Math.floor(t * 24 + 1e-6), scale: k, allowFilter: true, energy: .5, beat: beats.length ? beatAt(beats, t) : null });
  env.W = w / k; env.H = h / k;
  const bb = { x0: 0, y0: 0, x1: env.W, y1: env.H, cx: env.W / 2, cy: env.H / 2 };
  for (const d of list) { ctx.save(); try { J.DECOR[d.id].draw(env, layer === 'front' ? bb : null, d); } catch (e) { console.warn('media decor', d.id, e); } ctx.restore(); }
  ctx.restore();
};
})();
