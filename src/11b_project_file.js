/* Portable project: fixed header, UTF-8 manifest, then original binary files.
   Blob slices avoid base64 expansion and copying entire videos into JS strings. */
(() => {
'use strict';
const magic = 'JIZURA01', text = new TextEncoder(), decode = new TextDecoder();
const fail = () => new Error(J.mediaLabel('プロジェクトファイルが不正または未対応の形式です', 'Invalid or unsupported project file'));
// Explicit settings allowlist keeps song content and future asset fields out of presets.
const settingKeys = ['themes','style','mood','extra','wa','horror','typo','kinetic','keyBg',
  'seed','aspect','res','fps','videoSize','videoSizeMode','quality','includeAudio','fx','enabled',
  'lyricEffects','colors','fonts','userFonts','compositeFonts'];
const clone = value => JSON.parse(JSON.stringify(value));
J.projectSettings = project => {
  const result = {};
  for (const key of settingKeys) if (project[key] !== undefined) result[key] = clone(project[key]);
  for (const layer of ['media','foreground']) result[layer] = { effects: clone(J.mediaEffectSettings(project,layer)), opacity: project[layer]?.opacity ?? 100, blend: project[layer]?.blend ?? 'normal' };
  return result;
};
J.settingsProject = project => {
  const settings = J.projectSettings(project), result = Object.assign(J.defaultProject(),settings);
  result.lyrics = ''; result.title = ''; result.artist = '';
  for (const layer of ['media','foreground']) result[layer] = Object.assign(J.normalizeMedia(null),settings[layer]);
  return result;
};
J.applyProjectSettings = (current, source) => {
  const settings = J.projectSettings(source), result = clone(current);
  // Density is also an automatic cut splitter. Retain existing line divisions while
  // accepting the preset density for new lines and future explicit density edits.
  result.overrides ||= {};
  J.parseLyrics(current.lyrics).lines.forEach((line,index) => {
    const ov = result.overrides[index] ||= {};
    ov.divisionDensity ??= current.fx?.density ?? J.defaultProject().fx.density;
  });
  for (const key of settingKeys) if (settings[key] !== undefined) result[key] = settings[key];
  for (const layer of ['media','foreground']) Object.assign(result[layer],settings[layer]);
  // Existing cuts may still refer to fonts absent from the preset.
  for (const key of ['userFonts','compositeFonts']) {
    const imported = result[key] || [];
    result[key] = [...(current[key] || []).filter(f => !imported.some(g => g.key === f.key)),...imported];
  }
  return result;
};
J.packProject = async (project, audioFile) => {
  const entries = [], parts = []; let offset = 0;
  const add = (kind, id, file, name) => {
    if (!(file instanceof Blob)) throw new Error(J.mediaLabel('素材が見つかりません。再読み込みしてください：', 'Missing asset. Please import it again: ') + name);
    entries.push({kind,id,name:name || file.name || id,type:file.type,offset,size:file.size});
    parts.push(file); offset += file.size;
  };
  const items = new Map([...project.media.items,...project.foreground.items].map(item=>[item.id,item]));
  for (const [id,item] of items) add('media',id,J.mediaAssets.get(id)?.file || await J.loadMedia(id),item.name);
  if (project.audioAsset) add('audio',project.audioAsset.id,audioFile || await J.loadMedia(project.audioAsset.id),project.audioAsset.name);
  for (const font of project.userFonts || []) if (font.file) add('font',font.key,await J.readFontFile(font.key),font.label);
  const manifest = text.encode(JSON.stringify({format:'jizura',version:1,project,entries}));
  if (manifest.length > 32 * 1024 * 1024) throw fail();
  const header = new Uint8Array(12); header.set(text.encode(magic)); new DataView(header.buffer).setUint32(8,manifest.length,true);
  return new Blob([header,manifest,...parts],{type:'application/octet-stream'});
};
J.unpackProject = async file => {
  const header = new Uint8Array(await file.slice(0,12).arrayBuffer());
  if (decode.decode(header.slice(0,8)) !== magic) {
    // Only legacy JSON may use the text path; never decode a video-sized binary.
    if (file.size > 32 * 1024 * 1024 || !/^\s*\{/.test(decode.decode(header))) throw fail();
    const project = JSON.parse(await file.text());
    if (!project || typeof project !== 'object' || typeof project.lyrics !== 'string') throw fail();
    return {project,files:[],portable:false};
  }
  if (header.length !== 12) throw fail();
  const length = new DataView(header.buffer).getUint32(8,true), start = 12 + length;
  if (length > 32 * 1024 * 1024 || start > file.size) throw fail();
  const manifest = JSON.parse(await file.slice(12,start).text());
  if (manifest.format !== 'jizura' || manifest.version !== 1 || typeof manifest.project?.lyrics !== 'string' || !Array.isArray(manifest.entries)) throw fail();
  let end = 0; const seen = new Set(), files = [];
  for (const entry of manifest.entries) {
    if (!['media','audio','font'].includes(entry.kind) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.type !== 'string' || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.offset !== end || start+end+entry.size > file.size || seen.has(entry.kind+':'+entry.id)) throw fail();
    seen.add(entry.kind+':'+entry.id); end += entry.size;
    files.push({...entry,file:new File([file.slice(start+entry.offset,start+end)],entry.name,{type:entry.type})});
  }
  if (start+end !== file.size) throw fail();
  for (const item of [...(manifest.project.media?.items || []),...(manifest.project.foreground?.items || [])]) if (!seen.has('media:'+item.id)) throw fail();
  if (manifest.project.audioAsset && !seen.has('audio:'+manifest.project.audioAsset.id)) throw fail();
  for (const font of manifest.project.userFonts || []) if (font.file && !seen.has('font:'+font.key)) throw fail();
  return {project:manifest.project,files,portable:true};
};
})();
