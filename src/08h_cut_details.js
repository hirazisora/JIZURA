/* Per-cut render overrides. Keep identity, timing links and generated caches out
   of the editable payload; project JSON and undo already preserve this data. */
(() => {
'use strict';
J.cutDetailKeys = {
  lyrics: ['text','layout','enter','hold','exit','inDur','outDur','stagger','decor','scheme','params','treat','treatP','bg','bgP','cam','camP','trans','transP','transDur','area','motionScale','contentScale','fonts','palette','fontParams'],
  media: ['enter','exit','independentPhases','layout','hold','treat','trans','transP','transDur','effectSettings','bpm','beatOffset'],
};
J.applyCutDetails = (cut, details, plan, layer) => {
  if (!details || typeof details !== 'object') return;
  const copy = value => JSON.parse(JSON.stringify(value));
  if (details.trans && details.trans !== 'none' && details.trans !== cut.trans) {
    const def=J.TRANS[details.trans];
    cut.transDur=def?.dur || .35;
    cut.transP=def?.plan ? def.plan(J.rng(cut.seed),plan.style) : {};
  }
  if (layer === 'lyrics') {
    const cutStyle = details.fonts ? {...plan.style,fonts:details.fonts} : plan.style;
    const area = details.area || cut.area;
    for (const [key, param, registry] of [['layout','params',J.LAYOUTS],['treat','treatP',J.TREAT],['bg','bgP',J.BG],['cam','camP',J.CAMERA],['trans','transP',J.TRANS]]) {
      const rebuildLayout = key === 'layout' && (details.area !== undefined || details.text !== undefined || details.layout !== undefined && details.params === undefined);
      if (!rebuildLayout && (details[key] === undefined || details[key] === cut[key])) continue;
      const def = registry[details[key] ?? cut[key]], rng = J.rng(cut.seed);
      cut[param] = def?.plan ? (key === 'layout' ? def.plan(rng, {
        text: details.text ?? cut.text, n: [...(details.text ?? cut.text).replace(/\s/g,'')].length,
        W: plan.W * (area?.w ?? 1), H: plan.H * (area?.h ?? 1), dur: cut.dur,
      }, cutStyle) : def.plan(rng, cutStyle)) : {};
    }
  }
  for (const key of J.cutDetailKeys[layer === 'lyrics' ? 'lyrics' : 'media']) {
    if (Object.prototype.hasOwnProperty.call(details,key)) cut[key] = copy(details[key]);
  }
  if (layer === 'lyrics' && Array.isArray(details.fontParams)) {
    for (const entry of details.fontParams) {
      if (!Array.isArray(entry.path) || !J.FONTS[entry.font] || entry.path.some(k=>['__proto__','constructor','prototype'].includes(k))) continue;
      let parent=cut.params;
      for (const key of entry.path.slice(0,-1)) parent=parent?.[key];
      const key=entry.path.at(-1);
      if (parent && Object.hasOwn(parent,key) && typeof parent[key]==='string') parent[key]=entry.font;
    }
  }
  if (cut.trans === 'none') cut.trans = null;
  if (layer === 'lyrics' && details.area) cut.areaMode = 'manual';
  if (layer === 'lyrics' && typeof details.text === 'string') cut.words = J.chunkText(cut.text);
  for (const key of ['inDur','outDur','transDur']) if (Number.isFinite(cut[key])) cut[key] = J.clamp(cut[key],0,(cut.end-cut.start)*.45);
};
const planLyrics = J.plan;
J.plan = function(project, ...args) {
  const plan = planLyrics(project,...args);
  for (const cut of plan.cuts) if (Number.isInteger(cut.part) && cut.line >= 0) {
    J.applyCutDetails(cut,project.lyricCutOptions?.[`${cut.line}:${cut.part}`]?.details,plan,'lyrics');
  }
  // Retained groups use the final cut's edited departure.
  const last = new Map();
  for (const cut of plan.cuts) if (cut.group != null && Number.isInteger(cut.part)) last.set(cut.group,cut);
  for (const cut of plan.cuts) if (last.has(cut.group)) {
    cut.groupExit = last.get(cut.group).exit; cut.groupOutDur = last.get(cut.group).outDur;
  }
  J.applyLyricGroupAvoidance(project,plan);
  return plan;
};
const planMedia = J.planMedia;
J.planMedia = function(project, plan, audioDuration, layer='media') {
  const result = planMedia(project,plan,audioDuration,layer);
  for (const cut of result.cuts) J.applyCutDetails(cut,project[layer]?.cutOverrides?.[cut.index]?.details,plan,layer);
  return result;
};
})();
