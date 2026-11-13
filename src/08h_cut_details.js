/* Per-cut render overrides. Keep identity, timing links and generated caches out
   of the editable payload; project JSON and undo already preserve this data. */
(() => {
'use strict';
J.cutDetailKeys = {
  lyrics: ['enterP','holdP','exitP','drawing','text','note','layout','enter','hold','exit','inDur','outDur','stagger','decor','scheme','params','treat','treatP','bg','bgP','cam','camP','trans','transP','transDur','area','motionScale','contentScale','fonts','palette','fontParams','seed','effectEvents','effectStyle','effectFx','mask'],
  media: ['techniqueP','entranceP','departureP','drawing','enter','exit','independentPhases','layout','hold','treat','trans','transP','transDur','effectSettings','bpm','beatOffset','decor','mask'],
};
// The look of a cut at lock time: its effect payload (see the effect clipboard), without text or placement.
J.cutLockSnapshot = (cut, layer, plan) => J.cutEffectsPayload(cut, layer, plan).details;
// Resolved automatic choices travel with their cut options (including insert,
// delete, undo and project save). Pool/timing changes affect the next explicit
// draw, rather than silently changing a cut already on the timeline.
const copyEffects=value=>JSON.parse(JSON.stringify(value));
const effectKey=(project,layer,index)=>JSON.stringify(layer==='lyrics'
  ?[project.seed,project.overrides?.[index]?.seed||0]
  :[project.seed,project[layer]?.seed,project[layer]?.cutOverrides?.[index]?.seed||0]);
const effectParams={layout:'params',enter:'enterP',hold:'holdP',exit:'exitP',treat:'treatP',bg:'bgP',cam:'camP',trans:'transP'};
function stableDetails(project,layer,cut,options,locked){
  const saved=options?.autoEffects;
  if(locked||!saved||saved.key!==effectKey(project,layer,layer==='lyrics'?cut.line:cut.index))return {};
  const result=copyEffects(saved.details),explicit=options.details||{};
  for(const [field,param] of Object.entries(effectParams))if(Object.hasOwn(explicit,field)&&explicit[field]!==result[field])delete result[param];
  if(layer==='lyrics'){
    const override=project.overrides?.[cut.line]||{};
    for(const [field,param] of Object.entries(effectParams))if(override[field]&&override[field]!==result[field]&&J.registry(field)?.[override[field]]){result[field]=override[field];delete result[param];}
    if(Array.isArray(override.decor))result.decor=copyEffects(cut.decor);
  }else{
    const override={...project[layer]?.overrides?.[cut.itemId],...options};
    if(override.technique!=null&&override.technique!==saved.native.technique)return {};
    for(const [field,phase,param] of [['entrance','enter','entranceP'],['departure','exit','departureP']])if(override[field]!=null&&override[field]!==saved.native[field]){delete result[phase];delete result[param];}
    for(const field of ['technique','entrance','departure'])if(override[field]==null)cut[field]=saved.native[field];
  }
  return result;
}
J.captureAutoEffects=(project,plan)=>{
  for(const layer of ['lyrics','media','foreground'])for(const cut of (layer==='lyrics'?plan.cuts:plan[layer]?.cuts)||[]){
    if(layer==='lyrics'&&(!Number.isInteger(cut.part)||cut.line<0))continue;
    const index=layer==='lyrics'?cut.line:cut.index,options=layer==='lyrics'
      ?((project.lyricCutOptions||={})[`${cut.line}:${cut.part}`]||={})
      :((project[layer].cutOverrides||={})[index]||={});
    const key=effectKey(project,layer,index);
    if(options.autoEffects?.key===key)continue;
    const payload=J.cutEffectsPayload(cut,layer,plan),details=payload.details;
    for(const field of ['drawing','effectStyle','effectFx','fonts','palette','fontParams','motionScale','contentScale','effectSettings','bpm','beatOffset'])delete details[field];
    options.autoEffects={key,details,native:payload.native};
  }
};
J.applyCutDetails = (cut, details, plan, layer) => {
  if (!details || typeof details !== 'object') return;
  if(details.drawing){J.validateDrawing(details.drawing);if(layer!=='lyrics'&&cut.technique==='legacy')cut.technique='none';}
  const copy = value => JSON.parse(JSON.stringify(value));
  const seedChanged=layer==='lyrics' && Number.isFinite(details.seed) && details.seed!==cut.seed;
  if (layer === 'lyrics' && Number.isFinite(details.seed)) cut.seed=details.seed;
  if (details.trans && details.trans !== 'none' && details.trans !== cut.trans) {
    const def=J.TRANS[details.trans];
    cut.transDur=def?.dur || .35;
    cut.transP=def?.plan ? def.plan(J.rng(cut.seed),plan.style) : {};
  }
  if (layer === 'lyrics') {
    if(details.effectStyle)cut.effectStyle={...plan.style,...cut.effectStyle,...copy(details.effectStyle)};
    if(details.effectFx)cut.effectFx={...plan.fx,...cut.effectFx,...copy(details.effectFx)};
    const cutStyle = {...(cut.effectStyle || plan.style),...(details.fonts ? {fonts:details.fonts} : {})};
    const area = details.area || cut.area;
    for (const [key, param, registry] of [['layout','params',J.LAYOUTS],['treat','treatP',J.TREAT],['bg','bgP',J.BG],['cam','camP',J.CAMERA],['trans','transP',J.TRANS]]) {
      const rebuildLayout = key === 'layout' && (seedChanged || details.area !== undefined || details.text !== undefined || details.layout !== undefined || details.params !== undefined || details.fonts !== undefined);
      if (!rebuildLayout && !seedChanged && (details[key] === undefined || details[key] === cut[key])) continue;
      const def = registry[details[key] ?? cut[key]], rng = J.rng(cut.seed);
      cut[param] = def?.plan ? (key === 'layout' ? def.plan(rng, {
        text: details.text ?? cut.text, n: [...(details.text ?? cut.text).replace(/\s/g,'')].length,
        W: plan.W * (area?.w ?? 1), H: plan.H * (area?.h ?? 1), dur: cut.dur,
      }, cutStyle) : def.plan(rng, cutStyle)) : {};
    }
  }
  for (const key of J.cutDetailKeys[layer === 'lyrics' ? 'lyrics' : 'media']) {
    if (Object.prototype.hasOwnProperty.call(details,key)) {
      if (layer === 'lyrics' && key === 'params') cut.params = {...cut.params,...copy(details.params)};
      else if(layer==='lyrics' && ['effectStyle','effectFx'].includes(key))continue;
      else cut[key] = copy(details[key]);
    }
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
  // Imported favorites and older projects can contain empty/partial parameter
  // objects. Fill required defaults without overwriting the user's own values.
  if (layer === 'lyrics') {
    for (const [key,param] of [['treat','treatP'],['bg','bgP'],['cam','camP'],['trans','transP']]) {
      const def=J.registry(key)[cut[key]];
      if(def?.plan)cut[param]={...def.plan(J.rng(cut.seed),cut.effectStyle || plan.style),...cut[param]};
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
  // A locked cut keeps the look captured when it was locked (J.cutLockSnapshot); the user's own
  // detail edits still apply on top of it.
  for (const cut of plan.cuts) if (Number.isInteger(cut.part) && cut.line >= 0) {
    const options=project.lyricCutOptions?.[`${cut.line}:${cut.part}`],details=options?.details;
    const locked=project.overrides?.[cut.line]?.lock ? project.overrides[cut.line].lockedEffects?.[cut.part] : null;
    J.applyCutDetails(cut,{...stableDetails(project,'lyrics',cut,options,locked),...(locked||{}),...(details||{})},plan,'lyrics');
  }
  // Events belong to their originating cut, including accents before its boundary.
  for (const cut of plan.cuts) if (Array.isArray(cut.effectEvents)) {
    const owner=`${cut.line}:${cut.part}`;
    plan.events=plan.events.filter(event=>event.cutOwner!==owner);
    for (const {offset,...event} of cut.effectEvents) {
      const t=cut.start+offset;
      if (t<cut.end && t<plan.duration) plan.events.push({...event,t,cutOwner:owner});
    }
  }
  plan.events.sort((a,b)=>a.t-b.t);
  // Retained groups use the final cut's edited departure.
  const last = new Map();
  for (const cut of plan.cuts) if (cut.group != null && Number.isInteger(cut.part)) last.set(cut.group,cut);
  for (const cut of plan.cuts) if (last.has(cut.group)) {
    cut.groupExit = last.get(cut.group).exit; cut.groupOutDur = last.get(cut.group).outDur;
  }
  J.applyLyricGroupAvoidance(project,plan);
  // The lyric directive owns area size even when saved detail overrides or
  // retained-group avoidance have supplied an area. Preserve position/rotation.
  for(const cut of plan.cuts)if(cut.lyricSize!=null && cut.line>=0 && Number.isInteger(cut.part)){
    const a=cut.area || {x:0,y:0,w:1,h:1,angle:0,lockAspect:true};
    const size=Math.max(.04,cut.lyricSize/100);
    const area={...a,x:a.x+(a.w-size)/2,y:a.y+(a.h-size)/2,w:size,h:size};
    J.applyCutDetails(cut,{area},plan,'lyrics');
    cut.areaMode='notation';
  }
  return plan;
};
const planMedia = J.planMedia;
J.planMedia = function(project, plan, audioDuration, layer='media') {
  const overrides={...project[layer]?.cutOverrides};
  for(const [index,options] of Object.entries(overrides)){
    const saved=options.autoEffects;
    if(options.lock||!saved||saved.key!==effectKey(project,layer,+index))continue;
    const resolved={...project[layer]?.overrides?.[options.itemId],...options};
    overrides[index]={...options};
    for(const field of ['technique','entrance','departure'])if(resolved[field]==null)overrides[index][field]=saved.native[field];
  }
  const input={...project,[layer]:{...project[layer],cutOverrides:overrides}};
  const result = planMedia(input,plan,audioDuration,layer);
  for (const cut of result.cuts) {
    const options=project[layer]?.cutOverrides?.[cut.index],locked=options?.lock ? options.lockedEffects : null;
    J.applyCutDetails(cut,{...stableDetails(project,layer,cut,options,locked),...(locked||{}),...(options?.details||{})},plan,layer);
  }
  return result;
};
})();
