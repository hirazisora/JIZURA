# 字面一 JIZURA ONE STOP EDITION

Turn lyrics into animated lyric videos in your browser. JIZURA combines layouts, entrances, holds, exits, decorations, text treatments, backgrounds, camera moves, effects and transitions. Change the seed or press **Create a variation** to explore another arrangement.

**[Open the English fork app](https://hirazisora.github.io/JIZURA/en/)** · [日本語版](https://hirazisora.github.io/JIZURA/) · [Japanese guide](README.md)

The English and Japanese browser editions share the same project format and saved browser data. Use the language links at the top of the editor to switch editions without changing your lyrics or settings. English After Effects panels are available as [ScriptUI](https://hirazisora.github.io/JIZURA/JIZURA_AE_en.jsx) and [CEP](https://hirazisora.github.io/JIZURA/JIZURA_CEP_en.zip) downloads. The AE JSON format is the same in both languages.

## Features added in this fork

The **Foreground**, **Lyrics**, and **Background** tabs let you place uploaded images and videos above or below lyrics. Drop files into the media area, then click a file name in **Lines and cuts** to choose the file for that cut. Add a blank cut before, between, or after existing cuts; its initial file is **No image**. Automatic cut sequences still support random order and looping. Use **Tap to sync** or drag timeline boundaries to set cut times. Each media cut supports entrance, hold, exit, treatment, transition, and position and size controls. Videos can loop or use a chroma key. Foreground media can be blended with the layers below it; lyrics have their own blend mode and opacity controls. You can set a display area for each lyric line.



## Quick start

1. Paste lyrics into the left panel, one phrase per line. The built-in English sample is shown on a fresh install.
2. Optionally import audio. JIZURA detects beats and can snap cut boundaries to them. Use **Tap to sync** to mark the start of each line by pressing Space during playback.
3. Press **Create a variation** (or `R`) to randomize the style, mood, motion, palette and arrangement. **Previous** and **Next** navigate variations; **Change one thing** rerolls just one part.
4. Set aspect ratio, resolution and frame rate, then export MP4. Advanced mode adds a PNG sequence, transparent PNGs, color key backgrounds and individual technique controls.

**Lyrics language.** The styles are designed around Japanese fonts. For Chinese (Traditional / Simplified) and Korean lyrics, set **Lyrics language** below the lyrics box (Auto-detect is the default: kana → Japanese, Hangul → Korean, Chinese only → Traditional or Simplified by characters such as 們/们 and 說/说). Each font is then replaced with a face in that language with a similar feel — e.g. Noto Sans JP → Noto Sans TC / SC / KR, Noto Serif JP → Noto Serif TC / SC / KR, Dela Gothic One → WDXL Lubrifont TC / ZCOOL QingKe HuangYou / Black Han Sans — so a line never mixes fonts. The AE panels have the same setting, the AE JSON carries the language, and AE falls back to the OS fonts (PingFang, Microsoft JhengHei / YaHei, Apple SD Gothic Neo, Malgun Gothic) when those faces are not installed.

Lyric syntax: `I remember/the dawn` makes a manual cut; `*word*` emphasizes a word; a final `!` adds a flash and shake; `lyric|note` adds small annotation text; `[01:23.45]lyric` imports an LRC timestamp; `# comment` is ignored.

Use **Save** and **Open** for portable `.jizuraichi` projects containing settings, lyrics, imported images, videos, audio and font files. They restore assets in another browser or computer. Installed PC fonts selected by name still need to be installed separately. The Open dialog selects `.jizuraichi` files. Saving reports missing assets instead of producing an incomplete portable project. Browser autosave also restores the song. **New** lets you select an aspect ratio and start with empty lyrics, assets, audio and titles, default settings, and cleared undo/variation history. Save your current work before creating a new project. **Export for AE** creates arrangement data to import into the After Effects panel. Generated videos and images belong to their creators; rights to music and lyrics remain with their respective rights holders. Project files, lyrics and audio are handled in the browser. Google Fonts are loaded as needed. The tool is MIT licensed; see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Stacking lyrics, line breaks and automatic areas

Wrap multiple input lines in `{` and `}` to stack their cuts until the last lyric cut in the group disappears. Timeline boundaries and links retain their original timing.

```text
{
Colors of the dawn
*Today\nI remember*
~A quiet voice~
}
```

Write `\n` within one input line to add a horizontal line break inside one cut. It can be combined with `/` to put multiple rows inside each manually separated cut. Use `\\n` for a literal `\n`, and `\{`, `\}`, or `\~` for literal control characters.

In **Advanced → Techniques**, enable **Vary lyric position and size automatically** to vary the area for each lyric cut. This defaults to off, using the full stage. Manual areas and locks are preserved. In the area editor, **Reset automatic placement** clears a manual area; **Reset to full frame** saves an explicit full-stage area.

**Avoid overlapping the foreground** considers foreground position, size and rotation during each cut's original time slot. Lyrics retained with `{}` receive individual areas using the same rules as ordinary cuts. If there is no free region, it chooses a position with the least overlap. `*Emphasis*` creates a larger automatic area, enables **Show in front**, and ignores foreground avoidance. You can override the frontmost setting using the cut checkbox or timeline icon. `~Suppression~` makes the area and text smaller and reduces movement, rotation, camera motion and effects.

## Lyric cut blend modes and opacity

Each cut in **Lines and cuts** has its own blend mode (Normal, Multiply, Screen or Overlay) and opacity (0–100%). New cuts default to Normal and 100%. Lyrics stacked with `{}` are composited individually.

In **Advanced → Techniques**, **Randomize lyric blend modes** and **Randomize lyric opacity** can be enabled independently. Random opacity exposes minimum and maximum values, initially 0–100%. `*Emphasis*` selects from the upper third of that range; `~Suppression~` selects from the lower third. Shuffle or reroll generates new values; the same seed reproduces them.

Manual values and locks take priority. A cut's **Reset to auto** clears its manual settings. With randomization off, automatic values are Normal and 100%. Global lyric settings from older projects are transferred to their existing cuts when opened.

## Build and publish

Run `python3 build.py` at the repository root. It creates `index.html` and `en/index.html`, both standalone pages for GitHub Pages. Run `python3 build_ae.py --lang en` to rebuild `JIZURA_AE_en.jsx`, and `python3 build_cep.py --lang en --out dist` to build `dist/JIZURA_CEP_en.zip` (copy the ZIP to the repository root for Pages downloads). Commit the built pages, panels and translation sources together. Publish from the repository root on GitHub Pages; the English edition is then served at `/JIZURA/en/`. Open either HTML file locally for offline use, with installed fonts as a fallback.

Install `JIZURA_AE_en.jsx` in After Effects' `Scripts/ScriptUI Panels` folder, restart AE, then open it from the Window menu. The English CEP package has a distinct extension ID, so it can coexist with the Japanese CEP panel. Extract the ZIP and use its Windows or macOS installer. These panels require After Effects to verify motion and export behavior; automated checks use a mock AE environment.

### Cropped assets and lyric avoidance strength

Select Left, Right, Top and/or Bottom under **Cropped edges (auto placement)** in each foreground/background asset card. Automatic placement puts about 20% of the source width/height outside the frame at each selected edge; opposite edges may require proportional enlargement. Manual and locked placements take priority. The setting belongs to the asset and is saved with the project. It controls the chosen display rectangle, not subsequent animation movement or rotation.

**Details → Techniques → Foreground avoidance strength** ranges from 0 to 1 (default 1). At 1, automatic lyric areas avoid the foreground bounds. Lower values allow overlap around the foreground perimeter; 0 disables avoidance. Both automatic placement and foreground avoidance must be enabled. Emphasis, manual areas and locks retain their priority. If no free region exists, the least overlapping placement is used.

### Theme settings

Below Import audio, open **Theme settings**, select multiple themes and apply. Labels appear below the song. Genres: Pop, Ballad, Rock, Dance/EDM, Hip-hop, Jazz and Acoustic. Tastes: Cool, Cute, Elegant, Dreamy and Retro.

Each **Randomize** chooses one selected theme and uses only its curated styles, lyric techniques and foreground/background motion and entrance/exit candidates. Palettes and fonts follow the selected style. Choosing themes alone leaves the current arrangement unchanged. No themes means unrestricted randomization. Manual media choices, manual areas and locked cuts keep their existing priority. Extra/Japanese-style permission switches are respected. Themes support project files, local save and Undo/Redo. Selection runs in your browser with no API key.

For local preview run `python preview_server.py` and open `http://127.0.0.1:8765/`.

### Header menus

**Project** contains New, Open and Save. **Export** contains MP4, PNG sequence ZIP, transparent PNG ZIP, and AE arrangement data. MP4/PNG open a settings dialog sharing the settings in Advanced → Export. MP4 includes quality and audio settings; PNG shows the applicable image settings. Start export, monitor progress and cancel from the dialog.

Set **File name** in the export dialog for MP4, PNG sequence ZIP and transparent PNG ZIP. Project Save and Export for AE also ask for a name. Extensions are added automatically without duplication. Blank names fall back to the song title; unsupported filename characters are replaced.

### Effects-only lyrics and offscreen areas

Enter `｜   ｜` (spaces between full-width vertical bars) to create a timed lyric line with effects but no text. Standard timing and boundary linking remain available. Lyric display areas can extend beyond the canvas and reach 400% in width and height. Advanced → Background → Apply lyric background effects is on by default and also draws lyric background graphics over uploaded background media.
