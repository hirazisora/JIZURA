/* Registry metadata for theme pools and effect badges. Legacy pack flags no longer gate random choices. */
(() => {
'use strict';
J.BASE_PACKS = ['core', undefined, 'layoutsA', 'layoutsB', 'enter', 'exitHold', 'decor', 'looks'];
J.BASE_STYLES = ['noir', 'crimson', 'caution', 'magenta', 'paper', 'hud', 'mint', 'specimen', 'transit', 'blueprint', 'rouge', 'mono'];
J.EXTRA_FONTS = ['reggae', 'rampart', 'potta', 'kiwi', 'klee', 'shippori'];
J.WA = {
  layout: ['ema', 'chochin', 'noren', 'tanzaku', 'omikuji', 'kakejiku', 'shoji', 'karuta', 'origami', 'postcard', 'letterPaper', 'genkou', 'hanko'],
  enter: ['fanOpen', 'brushReveal'],
  exit: ['fanClose'],
  decor: ['seal', 'kamon', 'seigaiha', 'asanoha', 'chochin', 'shimenawa', 'sensu', 'tsukiKumo', 'momiji', 'namiGashira', 'kasumi', 'brushStroke', 'petals'],
  bg: ['seigaiha', 'asanoha'],
  treat: ['monoGrid'],
  style: ['sakura', 'sumi'],
};
J.SETS = { horror: { on: false }, typo: { on: true }, kinetic: { on: true } };   // on = default (UI labels live in 12_ui.js)
J.SET_ORDER = Object.keys(J.SETS);
/* Compatibility helper: selection is now controlled by themes, not saved switches. */
J.setOn = (project, set) => Object.hasOwn(J.SETS, set);
const def = (g, k) => g === 'style' ? J.STYLES[k] : g === 'font' ? J.FONTS[k] : (J.registry(g) || {})[k];
// mark the part sets, then 追加分 (set entries are not 追加分: they have their own switch)
// 追加分2 (upstream v0.12, packs named x2…): ordinary parts here (no switch of their own; themes and the checkboxes
// choose). Packs named x2typo… / x2kinetic… / x2horror… belong to that part set, so the 文字PV / キネティック / ホラー
// themes offer them; the rest carry set 'extra2' as upstream does (only the After Effects panel's own switch reads it).
for (const g of J.GROUP_KEYS) for (const k of J.order(g)) {
  const d = def(g, k); if (!d || !/^x2/.test(d.pack || '')) continue;
  d.x2 = true;
  const m = /^x2(typo|kinetic|horror)/.exec(d.pack); if (!d.set) d.set = m ? m[1] : 'extra2';
}
for (const g of J.GROUP_KEYS) for (const k of J.order(g)) { const d = def(g, k); if (d && !d.set && J.SETS[d.pack]) d.set = d.pack; }
for (const g of J.GROUP_KEYS) for (const k of J.order(g)) { const d = def(g, k); if (d && !d.set && !J.BASE_PACKS.includes(d.pack)) d.extra = true; }
for (const k of J.STYLE_ORDER) if (!J.BASE_STYLES.includes(k) && !J.STYLES[k].set) J.STYLES[k].extra = true;
for (const k of J.EXTRA_FONTS) if (J.FONTS[k]) J.FONTS[k].extra = true;
// mark 和風
for (const [g, keys] of Object.entries(J.WA)) for (const k of keys) { const d = def(g, k); if (d) d.wa = true; }

J.isWa = (g, k) => { const d = def(g, k); return !!(d && d.wa); };
J.isExtra = (g, k) => { const d = def(g, k); return !!(d && d.extra); };
J.setOf = (g, k) => { const d = def(g, k); return (d && d.set) || null; };
/* may random picks use this entry? (g: a group key, 'style' or 'font') — 追加分 first, then 和風 */
J.randomOk = (project, g, k) => {
  const d = def(g, k); if (!d) return false;
  // Theme pools and individual enabled checkboxes now control candidates.
  // Legacy extra/wa/part-set flags must not remain invisible restrictions.
  return true;
};
})();
