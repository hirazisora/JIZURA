/* Independent upstream part sets, available in both editing modes. */
(() => {
  for (const anchor of (document.querySelectorAll?.('.extra-toggle') || [])) {
    const labels = {typo:J.mediaLabel('文字PV系の演出','Typographic effects'),kinetic:J.mediaLabel('キネティックの演出','Kinetic effects'),horror:J.mediaLabel('ホラーの演出','Horror effects')};
    for (const key of J.SET_ORDER) {
      const label=document.createElement('label');label.className='check';
      const input=document.createElement('input');input.type='checkbox';input.className=key+'-toggle';input.checked=J.SETS[key].on;
      const span=document.createElement('span');span.textContent=labels[key];label.append(input,span);anchor.closest('label').before(label);
    }
  }
})();

