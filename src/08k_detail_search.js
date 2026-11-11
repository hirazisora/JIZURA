/* Search vocabulary shared by Japanese and English cut-detail dropdowns. */
(() => {
'use strict';
const normalize = value => String(value).normalize('NFKC')
  .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[‐‑–—−_-]/g, ' ').replace(/[・･]/g, '');
// Keep concepts separate (for example, enlarging and shrinking). Match aliases
// against the original text only, so overlapping concepts do not propagate.
const groups = [
  ['ぼかし','ぼかす','ぼけ','ボケ','暈し','ブラー','blur','blurring','defocus','ピント送り','rack focus'],
  ['回転','かいてん','回る','回って','スピン','ローテーション','rotate','rotation','rotating','spin','spinning'],
  ['拡大','かくだい','大きく','ズームイン','寄る','プッシュイン','zoom in','zoomIn','push in','pushIn','enlarge','enlargement'],
  ['縮小','しゅくしょう','小さく','ズームアウト','遠ざかる','プルアウト','zoom out','zoomOut','pull out','pullOut','shrink','shrinking'],
  ['ズーム','zoom','拡大縮小','スケール','scale','scaling'],
  ['揺れ','揺れる','ゆれ','ゆれる','揺らぎ','ゆらぎ','振動','震える','シェイク','shake','shaking','jitter','vibration'],
  ['跳ねる','はねる','跳ね','弾む','はずむ','バウンド','バウンス','bounce','bouncing','spring'],
  ['点滅','てんめつ','明滅','フリッカー','blink','blinking','flicker'],
  ['発光','光る','ひかる','輝く','グロー','glow','glowing','bloom'],
  ['閃光','フラッシュ','flash','flashing'],
  ['残像','ざんぞう','残響','エコー','afterimage','echo','echoes','trail'],
  ['輪郭','りんかく','縁取り','ふちどり','フチ取り','アウトライン','outline','stroke'],
  ['影','かげ','陰影','シャドウ','shadow'],
  ['白黒','しろくろ','モノクロ','モノクローム','グレースケール','グレイスケール','mono','monochrome','grayscale','greyscale','black and white'],
  ['反転','はんてん','ネガ','invert','inverted','negative'],
  ['鏡','かがみ','鏡像','ミラー','mirror','mirrored'],
  ['ノイズ','雑音','ざつおん','noise','noisy'],
  ['グリッチ','バグ','乱れ','glitch','glitching','distortion'],
  ['色ずれ','色ズレ','色収差','しきしゅうさ','クロマ','chroma','chromatic','rgb shift'],
  ['粒子','りゅうし','粒','パーティクル','particle','particles'],
  ['粒状','ざらざら','ざらつき','グレイン','grain','grainy'],
  ['モザイク','ピクセル','ドット','mosaic','pixel','pixelate','pixelation'],
  ['フェード','フェイド','fade','fading'],
  ['ディゾルブ','ディゾルヴ','溶ける','dissolve','dissolving'],
  ['滑る','すべる','スライド','slide','sliding'],
  ['上昇','じょうしょう','上へ','上に','rise','rising','ascent','upward'],
  ['下降','かこう','落下','らっか','沈む','下へ','下に','fall','falling','drop','sink','downward'],
  ['浮遊','ふゆう','浮く','ふわふわ','フロート','float','floating','drift'],
  ['波','なみ','波形','波紋','ウェーブ','ウエーブ','wave','waves','ripple'],
  ['脈動','鼓動','拍動','パルス','pulse','pulsing','heartbeat'],
  ['振り子','ふりこ','スイング','swing','swinging','pendulum'],
  ['円','円形','円環','丸','まる','サークル','circle','circular','ring'],
  ['四角','しかく','矩形','長方形','四角形','rectangle','rect','rectangular','square'],
  ['ひし形','菱形','ダイヤ','ダイヤモンド','diamond','rhombus'],
  ['縦','たて','垂直','vertical'],
  ['横','よこ','水平','horizontal'],
  ['斜め','ななめ','対角','diagonal'],
  ['中央','ちゅうおう','真ん中','まんなか','センター','center','centre','centered'],
  ['分割','ぶんかつ','割れる','スプリット','split','splitting'],
  ['格子','こうし','グリッド','grid','lattice'],
  ['市松','いちまつ','チェッカー','checker','checkerboard'],
  ['立体','りったい','3D','三次元','押し出し','extrude','extrusion'],
  ['注釈','ちゅうしゃく','ルビ','ふりがな','振り仮名','ruby','annotation','note'],
  ['自動','じどう','おまかせ','auto','automatic'],
  ['なし','無し','無効','オフ','none','off','disabled'],
  ['通常','つうじょう','標準','ノーマル','normal'],
  ['乗算','じょうざん','multiply'],
  ['スクリーン','screen'],
  ['オーバーレイ','overlay'],
  // Mask pack (詳細 → 背景の演出 → マスク).
  ['マスク','ますく','マスキング','型抜き','くり抜き','mask','masks','masked','masking'],
  ['二重露光','多重露光','にじゅうろこう','ダブルエクスポージャー','double exposure','multiple exposure'],
  ['シネマスコープ','シネスコ','レターボックス','ワイドスクリーン','cinemascope','letterbox','widescreen'],
  ['パララックス','視差','parallax'],
  ['ビート','拍子','リズム','beat','beats','rhythm'],
  ['シャッター','ブラインド','スリット','shutter','shutters','blinds','slit','slits','slat','slats'],
  ['窓','ウィンドウ','ウインドウ','window','windows'],
  // Words common in the 追加分2 part names.
  ['線','せん','ライン','line','lines'],
  ['罫線','罫','けいせん','ルール','rule','rules'],
  ['点','てん','dot','dots','dotted'],
  ['灯り','明かり','あかり','灯','ともしび','ランプ','提灯','灯籠','lamp','lantern','lanterns'],
  ['紙','かみ','ペーパー','paper'],
  ['折る','折り','折れ','おる','おり','fold','folding','folded','origami'],
  ['和風','和柄','わふう','和モダン','japanese','traditional'],
  ['墨','すみ','インク','ink'],
  ['斜体','しゃたい','イタリック','italic','skew','oblique'],
].map(aliases => [...new Set(aliases.map(normalize))]);
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliasGroups = new Map();
groups.forEach((aliases, id) => aliases.forEach(alias => aliasGroups.set(alias, id)));
const pattern = [...aliasGroups.keys()].sort((a,b) => b.length-a.length).map(alias =>
  (/^[a-z0-9]/.test(alias)?'(?<![a-z0-9])':'') + escape(alias).replace(/ /g,'\\s*') + (/[a-z0-9]$/.test(alias)?'(?![a-z0-9])':'')
).join('|');
const concepts = text => {
  const ids = new Set();
  const rest = text.replace(new RegExp(pattern,'g'), match => {
    const id=aliasGroups.get(match) ?? aliasGroups.get(match.replace(/\s+/g,' '));
    // Multiword aliases may also be entered without spaces.
    const resolved=id ?? [...aliasGroups].find(([alias])=>alias.replace(/\s/g,'')===match.replace(/\s/g,''))?.[1];
    if(resolved!==undefined)ids.add(resolved);
    return ' ';
  });
  return {ids,rest};
};
const subsequence = (text,query) => {
  let pos=0;for(const char of query){pos=text.indexOf(char,pos);if(pos<0)return false;pos++;}return true;
};
// The other-language name of a part (追加分2 parts carry an English name; the English UI keeps the Japanese one), so a
// part is found by either. Keys shared by several groups (a layout and a decor called chochin) give both.
let altNames=null;
J.detailSearchAlt = key => {
  if(!altNames){
    altNames=new Map();
    for(const group of J.GROUP_KEYS||[])for(const [id,def] of Object.entries(J.registry(group)||{})){
      const alt=[def.en,def.ja].filter(name=>name&&name!==def.name).join(' ');
      if(alt)altNames.set(id,((altNames.get(id)||'')+' '+alt).trim());
    }
  }
  return altNames.get(key)||'';
};
J.detailSearchQuery = query => {
  const normalized=normalize(query).trim(), parsed=concepts(normalized);
  const words=normalized.split(/\s+/), remaining=parsed.rest.trim().split(/\s+/).filter(Boolean);
  return value => {
    const text=normalize(value);
    if(words.every(word=>subsequence(text,word)))return true;
    if(!parsed.ids.size)return false;
    const candidate=concepts(text);
    return [...parsed.ids].every(id=>candidate.ids.has(id)) && remaining.every(word=>subsequence(text,word));
  };
};
})();
