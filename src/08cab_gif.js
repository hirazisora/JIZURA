/* GIF87a/89a image frames. Native static GIF decoding handles LZW and interlace;
   disposal and timing share the deterministic APNG composition/render path. */
(() => {
'use strict';
const invalid=()=>new Error(J.mediaLabel('GIFファイルが壊れています','Invalid GIF file'));
J.parseGIF=buffer=>{
  const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  const header=String.fromCharCode(...bytes.subarray(0,6));if(header!=='GIF87a'&&header!=='GIF89a')return null;
  let offset=6;const take=n=>{if(n>bytes.length-offset)throw invalid();const data=bytes.subarray(offset,offset+n);offset+=n;return data;};
  const byte=()=>take(1)[0],word=data=>data[0]|data[1]<<8,screen=take(7),width=word(screen),height=word(screen.subarray(2));if(!width||!height)throw invalid();
  const global=screen[4]&128?take(3*(2<< (screen[4]&7))):null;
  const background=global&&screen[5]*3+2<global.length?[...global.subarray(screen[5]*3,screen[5]*3+3),255]:null;
  const blocks=()=>{const parts=[];for(let n=byte();n;n=byte())parts.push(take(n));return parts;};
  const frames=[];let control=null,plays=1,ended=false;
  while(offset<bytes.length){
    const marker=byte();if(marker===0x3b){ended=true;break;}
    if(marker===0x21){
      const label=byte();
      if(label===0xf9){if(byte()!==4)throw invalid();const data=take(4);if(byte()!==0)throw invalid();const dispose=data[0]>>2&7;if(dispose>3)throw invalid();control={dispose,delay:Math.max(.01,word(data.subarray(1))/100),transparent:data[0]&1?data[3]:null};}
      else if(label===0xff){const id=String.fromCharCode(...take(byte())),parts=blocks();if(id==='NETSCAPE2.0'||id==='ANIMEXTS1.0'){const data=parts[0];if(!data||data.length!==3||data[0]!==1)throw invalid();const repeats=word(data.subarray(1));plays=repeats===0?0:repeats+1;}}
      else if(label===0x01)throw new Error(J.mediaLabel('テキスト描画を含むGIFには対応していません','GIF plain-text rendering is not supported'));
      else blocks();
      continue;
    }
    if(marker!==0x2c)throw invalid();
    const descriptor=take(9),x=word(descriptor),y=word(descriptor.subarray(2)),w=word(descriptor.subarray(4)),h=word(descriptor.subarray(6));
    if(!w||!h||x+w>width||y+h>height)throw invalid();
    const local=descriptor[8]&128?take(3*(2<<(descriptor[8]&7))):null;if(!local&&!global)throw invalid();
    const start=offset,min=byte();if(min<2||min>8)throw invalid();const data=blocks();if(!data.length)throw invalid();
    const c=control||{dispose:0,delay:.01,transparent:null};control=null;
    // Each native decode has only one image, located at (0,0) on its own screen.
    const patchScreen=new Uint8Array([w&255,w>>8,h&255,h>>8,global?(screen[4]&0x87):0,screen[5],0]);
    const patchDescriptor=descriptor.slice();patchDescriptor.fill(0,0,4);
    const transparency=c.transparent===null?[]:[new Uint8Array([0x21,0xf9,4,1,0,0,c.transparent,0])];
    const image=new Blob([bytes.subarray(0,6),patchScreen,...(global?[global]:[]),...transparency,new Uint8Array([0x2c]),patchDescriptor,...(local?[local]:[]),bytes.subarray(start,offset),new Uint8Array([0x3b])],{type:'image/gif'});
    frames.push({width:w,height:h,x,y,delay:c.delay,dispose:c.dispose===3?2:c.dispose===2?1:0,blend:1,background:c.transparent===null?background:null,image,transparent:c.transparent});
  }
  if(!ended||!frames.length||offset!==bytes.length)throw invalid();
  return {format:'gif',width,height,plays,frames,background:frames[0].transparent===null?background:null};
};
J.decodeGIF=async(file,onProgress=()=>{})=>{const parsed=J.parseGIF(await file.arrayBuffer());return parsed&&parsed.frames.length>1?J.composeImageAnimation(parsed,onProgress):null;};
})();
