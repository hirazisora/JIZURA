/* Chinese / Korean editions: after english.js has given every part its English name, translate the names,
   style descriptions, moods and sample lyrics through the English -> zh/ko table (English stays as fallback).
   The table itself (globalThis.JIZURA_I18N) is placed at the top of the script by build.py. */
(() => {
  'use strict';
  const table = globalThis.JIZURA_I18N && globalThis.JIZURA_I18N.t;
  if (!table) return;
  const tr = text => typeof text === 'string' && table[text] != null ? table[text] : text;
  for (const group of J.GROUP_KEYS) {
    for (const key of J.order(group)) {
      const item = J.registry(group)[key];
      if (item) item.name = tr(item.name);
    }
  }
  for (const style of Object.values(J.STYLES)) { style.name = tr(style.name); style.desc = tr(style.desc); }
  for (const mood of Object.values(J.MOODS)) mood.name = tr(mood.name);
  J.SAMPLE_LYRICS = tr(J.SAMPLE_LYRICS);
})();
