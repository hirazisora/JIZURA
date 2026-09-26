/* Portable cut effects. Text, assets, timing, and placement never enter this payload. */
(() => {
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));
const lyricKeys=['layout','enter','hold','exit','inDur','outDur','stagger','decor','scheme','treat','treatP','bg','bgP','cam','camP','trans','transP','transDur','motionScale','contentScale'];
const mediaKeys=['layout','enter','hold','exit','treat','trans','transP','transDur','effectSettings','bpm','beatOffset','independentPhases'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,clone(value[k])]));
J.cutEffectsPayload=(cut,layer)=>{
  const kind=layer==='lyrics'?'lyrics':'media';
  const details=pick(cut,kind==='lyrics'?lyricKeys:mediaKeys);
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
    for(const key of ['layout','enter','hold','exit','treat','bg','cam','trans'])if(d[key]!=null&&!(key==='trans'&&d[key]==='none')&&!Object.hasOwn(J.registry(key),d[key]))throw Error('invalid');
    if(d.decor && (!Array.isArray(d.decor)||d.decor.some(x=>!x||!Object.hasOwn(J.DECOR,x.id))))throw Error('invalid');
    if(n.blend!==undefined&&!J.LYRIC_BLENDS.includes(n.blend))throw Error('invalid');
    if(n.opacity!==undefined&&(!Number.isFinite(n.opacity)||n.opacity<0||n.opacity>100))throw Error('invalid');
  }else{
    if(n.technique!==undefined&&!['none','legacy'].includes(n.technique)&&!Object.hasOwn(J.MEDIA_TECH,n.technique))throw Error('invalid');
    for(const key of ['entrance','departure'])if(n[key]!=null&&typeof n[key]!=='string')throw Error('invalid');
  }
  for(const key of ['inDur','outDur','stagger','scheme','transDur','motionScale','contentScale','bpm','beatOffset'])if(d[key]!==undefined&&!Number.isFinite(d[key]))throw Error('invalid');
  return payload;
};
J.pasteCutEffects=(project,plan,layer,cut,payload)=>{
  if(payload.kind!==(layer==='lyrics'?'lyrics':'media'))throw Error('incompatible');
  if(layer==='lyrics'){
    const key=`${cut.line}:${cut.part}`,old=project.lyricCutOptions[key]||{};
    // Preserve edited text and area; regenerate layout geometry for the target text.
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
