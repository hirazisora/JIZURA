/* Lyric display lifetimes and deterministic, foreground-aware placement. */
(() => {
'use strict';

J.LYRIC_BLENDS = ['normal', 'multiply', 'screen', 'overlay'];
const percent = (value, fallback) => value != null && value !== '' && Number.isFinite(+value) ? J.clamp(+value, 0, 100) : fallback;
J.lyricEffectSettings = project => {
  const settings = project.lyricEffects || {};
  const min = percent(settings.opacityMin, 0), max = percent(settings.opacityMax, 100);
  const sizeMin = settings.sizeMin != null && Number.isFinite(+settings.sizeMin) ? J.clamp(+settings.sizeMin, 0, 500) : 75;
  const sizeMax = settings.sizeMax != null && Number.isFinite(+settings.sizeMax) ? J.clamp(+settings.sizeMax, 0, 500) : 125;
  return {
    autoPlacement: settings.autoPlacement === true, avoidForeground: settings.avoidForeground !== false,
    avoidanceStrength: settings.avoidanceStrength != null && Number.isFinite(+settings.avoidanceStrength) ? J.clamp(+settings.avoidanceStrength, 0, 1) : 1,
    lyricAvoidanceStrength: settings.lyricAvoidanceStrength != null && Number.isFinite(+settings.lyricAvoidanceStrength) ? J.clamp(+settings.lyricAvoidanceStrength,0,1) : 1,
    sizeMin: Math.min(sizeMin, sizeMax), sizeMax: Math.max(sizeMin, sizeMax),
    randomBlend: settings.randomBlend === true, randomOpacity: settings.randomOpacity === true,
    opacityMin: Math.min(min, max), opacityMax: Math.max(min, max),
  };
};

J.lyricComposite = (project, cut, settings = J.lyricEffectSettings(project)) => {
  const options = project.lyricCutOptions?.[`${cut.line}:${cut.part}`] || {};
  const line = project.overrides?.[cut.line];
  const locked = line?.lock ? line.lockedComposites?.[cut.part] : null;
  const blend = J.LYRIC_BLENDS.includes(options.blend) ? options.blend : J.LYRIC_BLENDS.includes(locked?.blend) ? locked.blend
    : settings.randomBlend ? J.rng(J.h(cut.seed, 953)).pick(J.LYRIC_BLENDS) : 'normal';
  const random = J.rng(J.h(cut.seed, 967))();
  const strength = cut.emphasis ? (2 + random) / 3 : cut.suppressed ? random / 3 : random;
  const opacity = percent(options.opacity, null) ?? percent(locked?.opacity, null)
    ?? (settings.randomOpacity ? J.clamp(Math.round(J.lerp(settings.opacityMin, settings.opacityMax, strength)), settings.opacityMin, settings.opacityMax) : 100);
  return { blend, opacity };
};

// Older projects stored one lyric blend/opacity on the background layer.
// Transfer a non-default setting to the existing cuts once, preserving edits.
J.migrateLyricCompositing = project => {
  const media = project.media;
  if (!media || (media.blend === 'normal' && media.opacity === 100)) return;
  const blend = J.LYRIC_BLENDS.includes(media.blend) ? media.blend : 'normal';
  const opacity = percent(media.opacity, 100);
  const options = project.lyricCutOptions || (project.lyricCutOptions = {});
  for (const cut of J.plan(project).cuts) if (cut.line >= 0 && Number.isInteger(cut.part)) {
    const key = `${cut.line}:${cut.part}`;
    options[key] = { blend, opacity, ...options[key] };
  }
  media.blend = 'normal'; media.opacity = 100;
};

// Use the actual fitted source rectangle, including its rotation. Coordinates are
// normalized to the stage; rotation is calculated in pixels to preserve aspect.
J.foregroundBounds = (project, plan, cut) => {
  if (!cut.itemId) return null;
  const item = project.foreground?.items?.find(item => item.id === cut.itemId);
  if (!item) return null;
  const source = J.mediaAssets?.get(cut.itemId)?.element;
  const sw = source && (source.videoWidth || source.naturalWidth || source.width) || item.width || plan.W;
  const sh = source && (source.videoHeight || source.naturalHeight || source.height) || item.height || plan.H;
  const r = !cut.placement && cut.layout === 'cover' ? { x: 0, y: 0, w: 1, h: 1 }
    : J.mediaPlacementRect(cut.placement, sw, sh, plan.W, plan.H);
  if (!r) return null;
  const a = (cut.placement?.angle || 0) * J.DEG, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = r.w * c + r.h * plan.H / plan.W * s;
  const h = r.h * c + r.w * plan.W / plan.H * s;
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
};

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function emptyRegions(obstacles) {
  let regions = [{ x: .025, y: .025, w: .95, h: .95 }];
  for (const b of obstacles) {
    const next = [];
    for (const a of regions) {
      if (!overlap(a, b)) { next.push(a); continue; }
      const x0 = Math.max(a.x, b.x), x1 = Math.min(a.x + a.w, b.x + b.w);
      const y0 = Math.max(a.y, b.y), y1 = Math.min(a.y + a.h, b.y + b.h);
      next.push({ x: a.x, y: a.y, w: x0 - a.x, h: a.h },
        { x: x1, y: a.y, w: a.x + a.w - x1, h: a.h },
        { x: x0, y: a.y, w: x1 - x0, h: y0 - a.y },
        { x: x0, y: y1, w: x1 - x0, h: a.y + a.h - y1 });
    }
    // Bound work even for a lyric spanning hundreds of foreground cuts.
    regions = next.filter(r => r.w >= .04 && r.h >= .04).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 64);
    if (!regions.length) break;
  }
  return regions;
}

J.autoLyricArea = (cut, plan, obstacles = [], settings = J.lyricEffectSettings({})) => {
  const rng = J.rng(J.h(cut.seed, 947));
  const portrait = plan.W < plan.H;
  let w = cut.emphasis ? rng.range(.82, .95) : cut.suppressed ? rng.range(.28, .4) : rng.range(.48, .72);
  let h = cut.emphasis ? rng.range(.7, .92) : cut.suppressed ? rng.range(.2, .3) : rng.range(.4, .62);
  if (portrait && !cut.emphasis) { w = Math.min(.9, w * 1.2); h *= .8; }
  const minSize = Math.min(settings.sizeMin, settings.sizeMax), maxSize = Math.max(settings.sizeMin, settings.sizeMax);
  const scale = rng.range(minSize, maxSize) / 100;
  const fitScale = Math.min(scale, 1 / w, 1 / h);
  w = Math.max(.04, w * fitScale); h = Math.max(.04, h * fitScale);
  const regions = emptyRegions(obstacles);
  if (regions.length) {
    const candidates = regions.map(r => ({ r, w: Math.min(w, r.w), h: Math.min(h, r.h) }));
    const best = Math.max(...candidates.map(c => c.w * c.h));
    const fit = rng.pick(candidates.filter(c => c.w * c.h >= best * .8));
    w = fit.w; h = fit.h;
    const x = fit.r.x + rng.pick([0, .5, 1]) * (fit.r.w - w);
    const y = fit.r.y + rng.pick([0, .5, 1]) * (fit.r.h - h);
    return { x, y, w, h, angle: 0, lockAspect: true };
  }
  // A full-stage foreground can leave no empty rectangle. Keep the lyric
  // readable in the least covered candidate instead of generating a zero area.
  const candidates = [];
  for (const x of [0, .25, .5, .75, 1]) for (const y of [0, .25, .5, .75, 1]) {
    const r = { x: .025 + x * (.95 - w), y: .025 + y * (.95 - h), w, h, angle: 0, lockAspect: true };
    candidates.push({ r, score: obstacles.reduce((sum, b) => sum + overlap(r, b), 0) });
  }
  const min = Math.min(...candidates.map(c => c.score));
  return rng.pick(candidates.filter(c => c.score <= min + 1e-8)).r;
};

J.finishLyricPlan = (project, plan, audio) => {
  const groups = new Map();
  for (const cut of plan.cuts) if (cut.group != null && Number.isInteger(cut.part)) {
    if (!groups.has(cut.group)) groups.set(cut.group, []);
    groups.get(cut.group).push(cut);
  }
  plan.retainedCutIndices = [];
  for (const cuts of groups.values()) {
    const last = cuts[cuts.length - 1];
    for (const cut of cuts) {
      cut.displayEnd = last.end;
      cut.groupExit = last.exit;
      cut.groupOutDur = last.outDur;
      plan.retainedCutIndices.push(cut.index);
    }
  }
  const settings = J.lyricEffectSettings(project);
  const foreground = settings.autoPlacement && settings.avoidForeground && J.planMedia
    ? J.planMedia(project, plan, audio?.duration, 'foreground') : null;
  const bounds = foreground && foreground.opacity > 0 ? foreground.cuts.map(cut => ({ cut, box: J.foregroundBounds(project, plan, cut) })) : [];
  for (const cut of plan.cuts) {
    if (cut.line < 0 || !Number.isInteger(cut.part)) continue;
    Object.assign(cut, J.lyricComposite(project, cut, settings));
    cut.areaMode = cut.area ? 'manual' : 'default';
    if (cut.area || !settings.autoPlacement) continue;
    const locked = project.overrides?.[cut.line];
    const lockedArea = locked?.lock && locked.lockedAreas?.[cut.part];
    if (lockedArea !== undefined && lockedArea !== false) {
      cut.area = J.lyricArea(lockedArea);
      cut.areaMode = cut.area ? 'auto' : 'default';
    } else {
      // Retention extends rendering only. Place each cut using its own time slot
      // so later foregrounds do not force a whole group into one shared area.
      const obstacles = cut.emphasis || settings.avoidanceStrength === 0 ? [] : bounds
        .filter(({ cut: f, box }) => box && f.start < cut.end && f.end + .6 > cut.start)
        .map(({ box }) => {
          const s = settings.avoidanceStrength;
          // Lower strengths allow overlap around the foreground's perimeter.
          const w = (box.w + .04) * s, h = (box.h + .04) * s;
          return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
        });
      cut.area = J.autoLyricArea(cut, plan, obstacles, settings);
      cut.areaMode = 'auto';
    }
    // Some layouts choose columns or orientation during planning. Give those
    // choices the resolved area dimensions as well as using them at render time.
    if (cut.area && J.LAYOUTS[cut.layout]?.plan) {
      cut.params = J.LAYOUTS[cut.layout].plan(J.rng(J.h(cut.seed, 318)), {
        text: cut.text, n: [...cut.text.replace(/\s/g, '')].length,
        W: plan.W * cut.area.w, H: plan.H * cut.area.h, dur: cut.dur,
      }, plan.style);
      if (cut.text.includes('\n')) cut.params.sx = 1;
    }
  }
};

// Resolve retained groups once at plan time: seeking never moves earlier lyrics.
// Pack rotated display areas rather than stretching text or changing timeline times.
J.applyLyricGroupAvoidance = (project, plan) => {
  const settings=J.lyricEffectSettings(project),strength=settings.lyricAvoidanceStrength;
  if(strength===0)return;
  const groups=new Map();
  for(const cut of plan.cuts)if(cut.avoidOverlap && cut.group!=null && Number.isInteger(cut.part) && !cut.effectsOnly){
    if(!groups.has(cut.group))groups.set(cut.group,[]);groups.get(cut.group).push(cut);
  }
  const bounds=area=>{
    const angle=(area.angle||0)*J.DEG,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
    const w=area.w*c+area.h*plan.H/plan.W*s,h=area.h*c+area.w*plan.W/plan.H*s;
    return {x:area.x+area.w/2-w/2,y:area.y+area.h/2-h/2,w,h};
  };
  const foreground=settings.autoPlacement&&settings.avoidForeground&&settings.avoidanceStrength>0
    ? J.planMedia(project,plan,null,'foreground') : null;
  for(const cuts of groups.values()){
    if(cuts.length<2)continue;
    const areas=cuts.map(c=>c.area||{x:0,y:0,w:1,h:1,angle:0,lockAspect:true}),boxes=areas.map(bounds);
    if(!boxes.some((box,i)=>boxes.slice(i+1).some(other=>overlap(box,other)>1e-8)))continue;
    const obstacles=foreground?.opacity>0?foreground.cuts.filter(f=>f.start<cuts.at(-1).displayEnd&&f.end>cuts[0].start)
      .map(f=>J.foregroundBounds(project,plan,f)).filter(Boolean).map(b=>{
        const w=b.w*settings.avoidanceStrength,h=b.h*settings.avoidanceStrength;
        return {x:b.x+b.w/2-w/2,y:b.y+b.h/2-h/2,w,h};
      }):[];
    let regions=emptyRegions(obstacles);if(!regions.length)regions=[{x:.025,y:.025,w:.95,h:.95}];
    const maxW=Math.max(...boxes.map(b=>b.w)),maxH=Math.max(...boxes.map(b=>b.h)),n=cuts.length;
    let best=null;
    // Bounded search even for large lyric groups.
    for(const region of regions)for(const cols of new Set([...Array.from({length:Math.min(n,64)},(_,i)=>i+1),n])){
      const rows=Math.ceil(n/cols),cw=region.w/cols,ch=region.h/rows;
      const scale=Math.min(1,cw*.94/maxW,ch*.94/maxH);
      if(!best||scale>best.scale+1e-9)best={region,cols,rows,cw,ch,scale};
    }
    cuts.forEach((cut,i)=>{
      const a=areas[i],b=best,scale=J.lerp(1,b.scale,strength);
      const cx=J.lerp(a.x+a.w/2,b.region.x+(i%b.cols+.5)*b.cw,strength);
      const cy=J.lerp(a.y+a.h/2,b.region.y+(Math.floor(i/b.cols)+.5)*b.ch,strength);
      cut.area={...a,x:cx-a.w*scale/2,y:cy-a.h*scale/2,w:a.w*scale,h:a.h*scale};
      cut.areaMode='group';
      const layout=J.LAYOUTS[cut.layout];
      if(layout?.plan)cut.params=layout.plan(J.rng(J.h(cut.seed,318)),{
        text:cut.text,n:[...cut.text.replace(/\s/g,'')].length,W:plan.W*cut.area.w,H:plan.H*cut.area.h,dur:cut.dur,
      },plan.style);
      if(cut.text.includes('\n'))cut.params.sx=1;
      const customParams=project.lyricCutOptions?.[`${cut.line}:${cut.part}`]?.details?.params;
      if(customParams && typeof customParams==='object')Object.assign(cut.params,customParams);
    });
  }
};

// Timing/linking uses the original start/end; rendering alone extends a group's
// lifetime. Store indices rather than references to avoid duplicating cut graphs.
J.lyricCutsAt = (plan, t) => {
  const current = J.cutAt(plan, t), cuts = [];
  for (const index of plan.retainedCutIndices || []) {
    const cut = plan.cuts[index];
    if (cut && cut.start <= t && t < cut.displayEnd) cuts.push(cut);
  }
  if (current && !current.blank && !cuts.includes(current)) cuts.push(current);
  return cuts.sort((a, b) => a.index - b.index);
};
J.lyricRenderCut = cut => cut.displayEnd != null ? Object.assign({}, cut, {
  end: cut.displayEnd, dur: cut.displayEnd - cut.start,
  exit: cut.groupExit, outDur: cut.groupOutDur,
}) : cut;
})();
