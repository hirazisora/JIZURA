/* Animated-image frame timing and composition. Each frame is decoded as a static image,
   so preview, seeking and export use the project clock rather than an <img> clock. */
(() => {
'use strict';
const signature=new Uint8Array([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
const chunk=(name,data)=>{const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);for(let i=0;i<4;i++)bytes[4+i]=name.charCodeAt(i);bytes.set(data,8);view.setUint32(data.length+8,crc(bytes.subarray(4,data.length+8)));return bytes;};
const invalid=()=>new Error(J.mediaLabel('APNG ファイルが壊れています','Invalid APNG file'));
J.parseAPNG=buffer=>{
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(bytes.length<8||!signature.every((b,i)=>bytes[i]===b))return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks=[];
  for(let offset=8;offset<bytes.length;){
    if(offset+12>bytes.length)throw invalid();
    const length=view.getUint32(offset);if(length>bytes.length-offset-12)throw invalid();
    const name=String.fromCharCode(...bytes.subarray(offset+4,offset+8)),data=bytes.subarray(offset+8,offset+8+length);
    chunks.push({name,data,raw:bytes.subarray(offset,offset+length+12),crc:view.getUint32(offset+length+8)});offset+=length+12;
    if(name==='IEND'){if(offset!==bytes.length)throw invalid();break;}
  }
  if(!chunks.some(c=>c.name==='acTL'))return null;
  if(chunks[0]?.name!=='IHDR'||chunks[0].data.length!==13||chunks.at(-1)?.name!=='IEND')throw invalid();
  for(const c of chunks)if(crc(c.raw.subarray(4,c.raw.length-4))!==c.crc)throw invalid();
  const header=chunks[0].data,head=new DataView(header.buffer,header.byteOffset,header.byteLength),width=head.getUint32(0),height=head.getUint32(4);
  let control=null,frame=null,sequence=0,seenIDAT=false;const frames=[],shared=[],defaultData=[];
  const finish=()=>{if(frame){if(!frame.data.length)throw invalid();frames.push(frame);frame=null;}};
  for(const c of chunks.slice(1)){
    const d=new DataView(c.data.buffer,c.data.byteOffset,c.data.byteLength);
    if(c.name==='acTL'){
      if(control||seenIDAT||c.data.length!==8)throw invalid();control={frames:d.getUint32(0),plays:d.getUint32(4)};if(!control.frames)throw invalid();
    }else if(c.name==='fcTL'){
      if(!control||c.data.length!==26||d.getUint32(0)!==sequence++)throw invalid();finish();
      frame={width:d.getUint32(4),height:d.getUint32(8),x:d.getUint32(12),y:d.getUint32(16),delay:Math.max(.01,d.getUint16(20)/(d.getUint16(22)||100)),dispose:d.getUint8(24),blend:d.getUint8(25),data:[]};
      if(!frame.width||!frame.height||frame.x+frame.width>width||frame.y+frame.height>height||frame.dispose>2||frame.blend>1)throw invalid();
      if(!seenIDAT&&(frame.x||frame.y||frame.width!==width||frame.height!==height))throw invalid();
    }else if(c.name==='IDAT'){
      if(!control||frames.length)throw invalid();seenIDAT=true;defaultData.push(c.data);if(frame)frame.data.push(c.data);
    }else if(c.name==='fdAT'){
      if(!frame||!seenIDAT||c.data.length<4||d.getUint32(0)!==sequence++)throw invalid();frame.data.push(c.data.subarray(4));
    }else if(c.name==='IEND')finish();
    else if(!seenIDAT)shared.push(c.raw);
  }
  if(!control||frames.length!==control.frames||!defaultData.length)throw invalid();
  const png=(w,h,parts)=>{const ihdr=header.slice(),v=new DataView(ihdr.buffer);v.setUint32(0,w);v.setUint32(4,h);return new Blob([signature,chunk('IHDR',ihdr),...shared,...parts.map(p=>chunk('IDAT',p)),chunk('IEND',new Uint8Array())],{type:'image/png'});};
  for(const f of frames){f.png=png(f.width,f.height,f.data);delete f.data;}
  return {format:'apng',width,height,plays:control.plays,frames,defaultImage:png(width,height,defaultData)};
};
const decodeImage=async blob=>{
  if(typeof createImageBitmap==='function')return createImageBitmap(blob);
  const image=new Image(),url=URL.createObjectURL(blob);
  try{image.src=url;await image.decode();return image;}catch(error){image.removeAttribute('src');throw error;}finally{URL.revokeObjectURL(url);}
};
const closeImage=image=>{if(image?.close)image.close();else image?.removeAttribute?.('src');};
const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare animation frame')),'image/png'));
J.composeImageAnimation=async(parsed,onProgress=()=>{})=>{
  const canvas=document.createElement('canvas');canvas.width=parsed.width;canvas.height=parsed.height;
  const ctx=canvas.getContext('2d'),element=document.createElement('canvas');element.width=canvas.width;element.height=canvas.height;
  const fill=(frame,color)=>{ctx.clearRect(frame.x,frame.y,frame.width,frame.height);if(color?.[3]){ctx.fillStyle=`rgba(${color[0]},${color[1]},${color[2]},${color[3]/255})`;ctx.fillRect(frame.x,frame.y,frame.width,frame.height);}};
  if(parsed.background)fill({x:0,y:0,width:canvas.width,height:canvas.height},parsed.background);
  const frames=[],ends=[];let duration=0;
  for(const [index,frame] of parsed.frames.entries()){
    const previous=frame.dispose===2&&index?ctx.getImageData(frame.x,frame.y,frame.width,frame.height):null;
    const image=await decodeImage(frame.image||frame.png);
    try{if(frame.blend===0)ctx.clearRect(frame.x,frame.y,frame.width,frame.height);ctx.drawImage(image,frame.x,frame.y);}finally{closeImage(image);}
    if(index===0)element.getContext('2d').drawImage(canvas,0,0);
    frames.push(await canvasBlob(canvas));duration+=frame.delay;ends.push(duration);
    if(frame.dispose===1||frame.dispose===2&&!index)fill(frame,frame.background);
    else if(previous)ctx.putImageData(previous,frame.x,frame.y);
    onProgress({phase:'decode',frame:index+1,total:parsed.frames.length});
  }
  canvas.width=canvas.height=1;
  return {format:parsed.format,element,defaultImage:parsed.defaultImage||frames[0],frames,ends,duration,plays:parsed.plays,cache:new Map(),pending:new Map(),pins:new Set(),limit:Math.max(2,Math.floor(32*1024*1024/(element.width*element.height*4))),released:false};
};
J.decodeAPNG=async(file,onProgress=()=>{})=>{const parsed=J.parseAPNG(await file.arrayBuffer());return parsed?J.composeImageAnimation(parsed,onProgress):null;};
J.apngFrameIndex=(animation,cut,t)=>{
  const elapsed=Math.max(0,+cut.animationStart||0)+Math.max(0,t-cut.start),plays=cut.animationLoop==='loop'?0:cut.animationLoop==='once'?1:animation.plays;
  if(plays&&elapsed>=animation.duration*plays-1e-9)return animation.frames.length-1;
  const local=elapsed%animation.duration;let lo=0,hi=animation.ends.length-1;
  while(lo<hi){const mid=(lo+hi)>>>1;if(animation.ends[mid]<=local+1e-9)lo=mid+1;else hi=mid;}
  return lo;
};
const prune=(animation,keep)=>{for(const [index,image] of animation.cache){if(animation.cache.size<=animation.limit)break;if(index!==keep&&!animation.pins.has(index)){animation.cache.delete(index);closeImage(image);}}};
J.apngFrame=async(asset,index)=>{
  const a=asset.animation;if(a.released)throw new Error('Animated image asset released');if(index===0)return a.element;
  if(a.cache.has(index)){const image=a.cache.get(index);a.cache.delete(index);a.cache.set(index,image);return image;}
  if(a.pending.has(index))return a.pending.get(index);
  const pending=(async()=>{const image=await decodeImage(a.frames[index]);if(a.released){closeImage(image);throw new Error('Animated image asset released');}a.cache.set(index,image);prune(a,index);window.dispatchEvent(new Event('jizura-media-ready'));return image;})();
  a.pending.set(index,pending);try{return await pending;}finally{a.pending.delete(index);}
};
J.mediaFrameSource=(asset,cut,t)=>{
  if(!asset.animation)return asset.element;const a=asset.animation,index=J.apngFrameIndex(a,cut,t);
  if(index===0)return a.element;if(a.cache.has(index))return a.cache.get(index);
  if(!a.pending.has(index))J.apngFrame(asset,index).catch(error=>{if(!a.released&&!asset.previewError){asset.previewError=error.message;window.dispatchEvent(new CustomEvent('jizura-media-error',{detail:{id:cut.itemId,message:error.message}}));}});
  return a.element;
};
J.prepareAPNGFrames=async(plan,t,signal)=>{
  if(signal?.aborted)throw new Error('Cancelled');const requests=new Map();
  const add=(cut,time)=>{const asset=cut&&J.mediaAssets.get(cut.itemId);if(!asset?.animation)return;let indices=requests.get(asset);if(!indices)requests.set(asset,indices=new Set());indices.add(J.apngFrameIndex(asset.animation,cut,time));};
  const effects=J.cutAt?.(plan,t)?.effectFx||plan.fx,step=effects&&J.stepDur?.(effects,plan.fps),lyricTime=step?Math.floor(t/step+1e-6)*step:t;
  const times=[t],lyric=J.cutAt?.(plan,lyricTime),prior=lyric?.index>0&&plan.cuts[lyric.index-1];
  if(lyric?.trans&&prior&&lyricTime-lyric.start<(lyric.transDur||.35)&&Math.abs(prior.end-lyric.start)<.06)times.push(Math.max(prior.start,prior.end-.001));
  for(const time of times)for(const layer of ['media','foreground']){
    if(plan.layerVisibility?.[layer]===false)continue;
    for(const cut of J.mediaCutsAt(plan,time,layer)){
      add(cut,time);const prev=cut.index>0&&plan[layer].cuts[cut.index-1];
      if(prev&&cut.trans&&time-cut.start<cut.transDur&&Math.abs(prev.end-cut.start)<.06)add(prev,Math.max(prev.start,prev.end-.001));
      if(cut.itemId==='@copy:foreground-source')add(J.mediaAt(plan,time,'foreground'),time);
    }
  }
  for(const asset of J.mediaAssets.values())if(asset.animation){asset.animation.pins=requests.get(asset)||new Set();prune(asset.animation);}
  await Promise.all([...requests].flatMap(([asset,indices])=>[...indices].map(index=>J.apngFrame(asset,index))));
  if(signal?.aborted)throw new Error('Cancelled');
};
J.releaseAPNG=animation=>{animation.released=true;for(const image of animation.cache.values())closeImage(image);animation.cache.clear();animation.frames.length=0;animation.element.width=animation.element.height=1;};
})();
