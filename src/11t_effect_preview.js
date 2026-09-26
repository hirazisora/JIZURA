/* Isolated technique previews: never replace or save the editor project. */
(() => {
'use strict';
// Label/export tooling also loads src files without browser APIs.
if (typeof Image === 'undefined') return;
let dialog, canvas, heading, frame=0, generation=0, assetId=null;
const image=new Image();image.src='__EFFECT_PREVIEW_IMAGE__';
function stop(){generation++;cancelAnimationFrame(frame);frame=0;if(assetId)J.mediaAssets.delete(assetId);assetId=null;}
function ensureDialog(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='effectPreviewDialog';
  dialog.innerHTML='<form method="dialog"><button class="effect-preview-close" value="close">×</button></form><h2 id="effectPreviewName"></h2><canvas width="640" height="360"></canvas><p class="effect-preview-error" hidden></p>';
  dialog.setAttribute('aria-labelledby','effectPreviewName');
  dialog.querySelector('button').setAttribute('aria-label',J.mediaLabel('閉じる','Close'));
  document.body.append(dialog);canvas=dialog.querySelector('canvas');heading=dialog.querySelector('h2');
  dialog.addEventListener('close',stop);
  const outside = event => {
    const rect=dialog.getBoundingClientRect();
    return event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom;
  };
  let pressedOutside=false;
  dialog.addEventListener('pointerdown',event=>{pressedOutside=event.target===dialog && outside(event);});
  dialog.addEventListener('click',event=>{
    if(pressedOutside && event.target===dialog && outside(event))dialog.close();
    pressedOutside=false;
  });
}
J.makeEffectPreviewPlan=(group,key,layer='lyrics',id)=>{
  const project=J.defaultProject();project.lyrics='[00:00]プレビュー|ルビ\n[00:03]プレビュー|ルビ';project.durationOverride=6;
  project.title='';project.aspect='16:9';project.res=640;project.fps=30;project.seed=2468;
  project.fx={...project.fx,hud:'off',texture:0,chroma:0,glitch:0,decor:0,onTwos:false,koma:0};
  for(const i of [0,1])project.overrides[i]={single:true,layout:'center',enter:'cut',hold:'still',exit:'cut',treat:'none',bg:'none',cam:'none',trans:'none',decor:group==='decor'?[key]:[]};
  if(layer!=='lyrics'){
    project.lyrics='';
    const def=J.MEDIA_TECH[key],m=project[layer]=J.normalizeMedia(null);
    m.items=[{id,name:'Preview',type:'image',width:image.naturalWidth,height:image.naturalHeight}];m.manualCuts=true;m.cutCount=2;m.timing.lineTimes={0:0,1:3};
    m.effects={...J.mediaEffectSettings(project,layer),autoPlacement:false,applyLyricBackground:false};
    for(const i of [0,1])m.cutOverrides[i]={itemId:id,technique:def.stage?'none':key,entrance:'none',departure:'none',...(def.stage==='enter'?{entrance:key}:def.stage==='exit'?{departure:key}:{})};
  }
  if(group==='fx'&&key==='chroma')project.fx.chroma=.7;
  const plan=J.plan(project);
  plan.events=[];plan.beats=J.beatGrid(120,0,6);
  if(layer==='lyrics')for(const cut of plan.cuts){
    if(cut.line<0)continue;
    if(group!=='decor')cut.decor=[];cut.bg='none';cut.cam='none';cut.trans=null;
    const details={inDur:.8,outDur:.8};
    if(group==='decor')details.decor=cut.decor;
    else if(group==='fx'){plan.events.push({t:cut.start+.6,type:key,amp:1,dur:Math.max(.4,(J.FXE[key]?.dur||12)/24)});}
    else {details[group]=key;if(group==='trans')details.transDur=.9;}
    J.applyCutDetails(cut,details,plan,'lyrics');
  }
  else {plan.media=J.planMedia(project,plan,null,'media');plan.foreground=J.planMedia(project,plan,null,'foreground');}
  return plan;
};
J.openEffectPreview=async(group,key,layer='lyrics')=>{
  ensureDialog();stop();J.uiApi?.pause();
  const token=generation,def=layer==='lyrics'?J.registry(group)[key]:J.MEDIA_TECH[key];
  if(!def)return;
  heading.textContent=def.name;canvas.setAttribute('aria-label',def.name);
  const error=dialog.querySelector('p');error.hidden=true;
  canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  if(!dialog.open)dialog.showModal();
  try{
    if(layer!=='lyrics'){await image.decode();if(token!==generation||!dialog.open)return;assetId='__jizura_effect_preview__';J.mediaAssets.set(assetId,{element:image,type:'image'});}
    const plan=J.makeEffectPreviewPlan(group,key,layer,assetId);
    await J.ensureFonts('プレビュールビ',J.fontsOfPlan(plan));
    if(token!==generation||!dialog.open)return;
    const renderer=new J.Renderer(),start=performance.now();
    const draw=now=>{if(token!==generation||!dialog.open)return;const t=((now-start)/1000)%6;renderer.frame(canvas.getContext('2d'),plan,t,{scale:canvas.width/plan.W,noHud:true});frame=requestAnimationFrame(draw);};
    frame=requestAnimationFrame(draw);
  }catch(err){if(token!==generation)return;error.textContent=J.mediaLabel('プレビューを再生できませんでした：','Could not play preview: ')+err.message;error.hidden=false;stop();}
};
J.effectPreviewButton=(group,key,layer='lyrics')=>{
  const button=document.createElement('button');button.type='button';button.className='effect-preview-play';button.textContent='▶';
  button.dataset.previewGroup=group;button.dataset.previewKey=key;button.dataset.previewLayer=layer;
  button.title=J.mediaLabel('プレビューを再生','Play preview');button.setAttribute('aria-label',button.title);
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();J.openEffectPreview(group,key,layer);});return button;
};
})();
