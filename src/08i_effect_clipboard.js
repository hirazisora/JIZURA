/* Portable cut effects. Text, assets, timing, and placement never enter this payload. */
(() => {
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const lyricKeys=['layout','enter','hold','exit','inDur','outDur','stagger','decor','scheme','treat','treatP','bg','bgP','cam','camP','trans','transP','transDur','motionScale','contentScale','fonts','palette','fontParams','params','seed','effectEvents','effectStyle','effectFx'];
const mediaKeys=['layout','enter','hold','exit','treat','trans','transP','transDur','effectSettings','bpm','beatOffset','independentPhases'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,clone(value[k])]));
J.cutFontParams = value => {
  const result = [];
  const visit = (node,path) => {
    if (typeof node === 'string' && J.FONTS[node]) result.push({path,font:node});
    else if (node && typeof node === 'object') for (const [key,child] of Object.entries(node)) visit(child,[...path,key]);
  };
  visit(value,[]); return result;
};
J.cutEffectsPayload=(cut,layer,plan)=>{
  const kind=layer==='lyrics'?'lyrics':'media';
  const details=pick(cut,kind==='lyrics'?lyricKeys:mediaKeys);
  if(kind==='lyrics' && plan){
    details.fonts=clone(cut.fonts || plan.style.fonts);
    details.palette=clone(cut.palette || plan.style.schemes[cut.scheme % plan.style.schemes.length] || plan.style.schemes[0]);
    details.fontParams=J.cutFontParams(cut.params);
    details.effectStyle=clone(cut.effectStyle || plan.style);
    details.effectFx=clone(cut.effectFx || plan.fx);
    details.effectEvents=clone(cut.effectEvents || plan.events.filter(event=>event.cutOwner===`${cut.line}:${cut.part}`).map(({t,cutOwner,...event})=>({...event,offset:t-cut.start})));
    // These layout fields contain lyric strings, not visual settings.
    for (const key of ['chunks','msgs','units']) if (Array.isArray(details.params?.[key])) delete details.params[key];
  }
  if(kind==='media' && details.effectSettings)details.effectSettings=pick(details.effectSettings,['motion','treatment','duration']);
  return {format:'jizura-cut-effects',version:1,kind,details,native:pick(cut,kind==='lyrics'?['blend','opacity','frontmost']:['technique','entrance','departure','chromaKey','chromaColor'])};
};
J.readCutEffects=text=>{
  if(typeof text!=='string'||text.length>262144)throw Error('invalid');
  const data=JSON.parse(text,(key,value)=>{
    if(['__proto__','constructor','prototype'].includes(key))throw Error('invalid');
    return value;
  });
  if(data?.format!=='jizura-cut-effects'||data.version!==1||!['lyrics','media'].includes(data.kind)||!data.details||typeof data.details!=='object'||Array.isArray(data.details))throw Error('invalid');
  const payload=J.cutEffectsPayload({...data.details,...data.native},data.kind);
  const d=payload.details,n=payload.native;
  if(!Object.keys(d).length)throw Error('invalid');
  if(data.kind==='lyrics'){
    for(const key of ['params','effectStyle','effectFx'])if(d[key]!==undefined&&(!d[key]||typeof d[key]!=='object'||Array.isArray(d[key])))throw Error('invalid');
    if(d.effectEvents!==undefined&&(!Array.isArray(d.effectEvents)||d.effectEvents.some(ev=>!ev||typeof ev.type!=='string'||!Number.isFinite(ev.offset)||!Number.isFinite(ev.amp)||!Number.isFinite(ev.dur)||ev.dur<0)))throw Error('invalid');
    if(d.fonts!==undefined && (!d.fonts || typeof d.fonts!=='object' || Array.isArray(d.fonts) || Object.values(d.fonts).some(role=>!Array.isArray(role)||role.some(font=>typeof font!=='string'))))throw Error('invalid');
    if(d.palette!==undefined && (!d.palette || typeof d.palette!=='object' || Array.isArray(d.palette) || Object.values(d.palette).some(color=>typeof color!=='string')))throw Error('invalid');
    if(d.fontParams!==undefined && (!Array.isArray(d.fontParams) || d.fontParams.some(entry=>!entry || !Array.isArray(entry.path) || entry.path.some(key=>typeof key!=='string'||['__proto__','constructor','prototype'].includes(key)) || typeof entry.font!=='string')))throw Error('invalid');

    for(const key of ['layout','enter','hold','exit','treat','bg','cam','trans'])if(d[key]!=null&&!(key==='trans'&&d[key]==='none')&&!Object.hasOwn(J.registry(key),d[key]))throw Error('invalid');
    if(d.decor && (!Array.isArray(d.decor)||d.decor.some(x=>!x||!Object.hasOwn(J.DECOR,x.id))))throw Error('invalid');
    if(n.blend!==undefined&&!J.LYRIC_BLENDS.includes(n.blend))throw Error('invalid');
    if(n.opacity!==undefined&&(!Number.isFinite(n.opacity)||n.opacity<0||n.opacity>100))throw Error('invalid');
  }else{
    if(n.technique!==undefined&&!['none','legacy'].includes(n.technique)&&!Object.hasOwn(J.MEDIA_TECH,n.technique))throw Error('invalid');
    for(const key of ['entrance','departure'])if(n[key]!=null&&typeof n[key]!=='string')throw Error('invalid');
  }
  for(const key of ['inDur','outDur','stagger','scheme','transDur','motionScale','contentScale','bpm','beatOffset','seed'])if(d[key]!==undefined&&!Number.isFinite(d[key]))throw Error('invalid');
  return payload;
};
J.pasteCutEffects=(project,plan,layer,cut,payload)=>{
  if(payload.kind!==(layer==='lyrics'?'lyrics':'media'))throw Error('incompatible');
  if(layer==='lyrics'){
    const key=`${cut.line}:${cut.part}`,old=project.lyricCutOptions[key]||{};
    // Keep target text and display area while retaining the exact visual parameters.
    const preserved=pick(old.details||{},['text','area']);
    project.lyricCutOptions[key]={...old,...clone(payload.native),details:{...clone(payload.details),...preserved}};
  }else{
    const old={...project[layer].overrides?.[cut.itemId],...project[layer].cutOverrides[cut.index]},details={...clone(payload.details)};
    details.effectSettings={...cut.effectSettings,...details.effectSettings};
    let placement=cut.placement;
    if(!placement){const dim=J.mediaSourceDimensions(plan,cut,cut.start)||{width:plan.W,height:plan.H};
      const scale=cut.layout==='cover'?Math.max(plan.W/dim.width,plan.H/dim.height):Math.min(plan.W/dim.width,plan.H/dim.height);
      placement={cx:.5,cy:.5,w:dim.width*scale/plan.W,h:dim.height*scale/plan.H,angle:0,lockAspect:true};
    }
    const patch={...old,...clone(payload.native),placement:clone(placement),details};
    if(old.lock)Object.assign(patch,{lockedTechnique:patch.technique,lockedEntrance:patch.entrance,lockedDeparture:patch.departure,lockedPlacement:clone(placement),lockedPlacementMode:'manual'});
    project[layer].cutOverrides[cut.index]=patch;
  }
};
})();
