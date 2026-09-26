/* Layouts with a dedicated supplied-note/secondary-copy rendering path. */
(() => {
'use strict';
for (const key of ['labels','lowerThird','arcTop','magazine','headlineDeck','poster','dictionary','newspaper','letterPaper','crossword']) {
  if (J.LAYOUTS[key]) J.LAYOUTS[key].supportsNote=true;
}
})();
