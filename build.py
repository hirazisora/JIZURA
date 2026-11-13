"""Build the Japanese, English, Chinese and Korean single-file browser editions from src/, app/ and vendor/.
usage: python3 build.py            -> index.html, en/, zh/ and ko/index.html (GitHub Pages)
       python3 build.py --dev      -> also dev/www/jizura.js + dev/www/test.html for the test tools"""
import glob, os, sys, base64, json
from app.english import localize_body, localize_js
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
read = lambda p: open(p, encoding='utf-8').read()
sources = sorted(glob.glob('src/*.js'))
js = '\n'.join(read(f) for f in sources)
js = js.replace('__EFFECT_PREVIEW_IMAGE__', 'data:image/png;base64,' + base64.b64encode(open('assets/effect-preview.png', 'rb').read()).decode('ascii'))
mux = '/*! mp4-muxer v5.2.2 | MIT License | (c) 2023 Vanilagy | see THIRD_PARTY_NOTICES.md */\n' + read('vendor/mp4-muxer.min.js')
# UI editions: Japanese is the source, English comes from app/english.*, Chinese and Korean translate the English copy
# through app/i18n/<lang>.json (English -> zh / ko; untranslated strings stay English).
LANGS = {  # key: (html lang, folder, switcher label)
    'ja': ('ja', '', '日本語'),
    'en': ('en', 'en/', 'English'),
    'zh': ('zh-Hans', 'zh/', '简体中文'),
    'ko': ('ko', 'ko/', '한국어'),
}
SITE = 'https://hirazisora.github.io/JIZURA/'
COPY = {
    'ja': ('JIZURA 字面', '歌詞を入れると文字PV（リリックモーション）を自動で組み立てて MP4 に書き出すブラウザアプリ', '言語'),
    'en': ('JIZURA — Lyric Motion Video Maker', 'Turn lyrics into animated lyric videos in your browser and export MP4.', 'Language'),
    'zh': ('JIZURA — 歌词动态视频制作', '输入歌词即可在浏览器中自动生成歌词动态视频并导出 MP4。', '语言'),
    'ko': ('JIZURA — 가사 모션 영상 메이커', '가사를 입력하면 브라우저에서 가사 모션 영상을 자동으로 만들어 MP4로 내보냅니다.', '언어'),
}
def language_nav(lang):
    up = '../' if LANGS[lang][1] else ''
    items = []
    for key, (code, folder, label) in LANGS.items():
        items.append(f'<span aria-current="page">{label}</span>' if key == lang else f'<a href="{up}{folder}index.html" lang="{code}">{label}</a>')
    return f'<nav class="lang-switch" aria-label="{COPY[lang][2]}">' + ''.join(items) + '</nav>'
def build(lang):
    code, folder, _ = LANGS[lang]
    table = json.loads(read(f'app/i18n/{lang}.json')) if lang in ('zh', 'ko') else None
    translated = lang != 'ja'
    title, description = COPY[lang][0], COPY[lang][1]
    title = '字面一 JIZURA ONE STOP EDITION'
    canonical = SITE + folder
    body = read('app/body.html').replace('    <div class="acts">', '    ' + language_nav(lang) + '\n    <div class="acts">', 1)
    if translated: body = localize_body(body, table, f'../manual/{lang}/' if table else '../manual/?lang=en')
    script = '\n'.join(localize_js(read(f), f, table) for f in sources) if translated else js
    if translated:
        marker = '/* ============================================================\n   JIZURA — editor UI'
        if marker not in script: raise ValueError('Could not find browser UI entry point')
        extra = read('app/english.js') + ('\n' + read('app/i18n_runtime.js') if table else '')
        script = script.replace(marker, extra + '\n' + marker, 1)
    if table:
        script = 'globalThis.JIZURA_I18N = ' + json.dumps({'lang': code, 't': table}, ensure_ascii=False) + ';\n' + script
    script = script.replace('__EFFECT_PREVIEW_IMAGE__', 'data:image/png;base64,' + base64.b64encode(open('assets/effect-preview.png', 'rb').read()).decode('ascii'))
    alternates = '\n'.join(f'<link rel="alternate" hreflang="{c}" href="{SITE}{f}">' for c, f, _ in LANGS.values())
    html = f'''<!doctype html>
<html lang="{code}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical}">
{alternates}
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>
{read('app/style.css')}
</style>
</head>
<body>
{body}
<script>
{mux}
</script>
<script>
{script}
</script>
</body>
</html>
'''
    target = folder + 'index.html'
    os.makedirs(os.path.dirname(target) or '.', exist_ok=True)
    open(target, 'w', encoding='utf-8').write(html)
    print(target, len(html), 'bytes')
for lang in LANGS: build(lang)
if '--dev' in sys.argv:
    os.makedirs('dev/www', exist_ok=True)
    open('dev/www/jizura.js', 'w', encoding='utf-8').write(js)
    open('dev/www/test.html', 'w', encoding='utf-8').write(read('dev/test.html'))
    print('dev/www ready: cd dev/www && python3 -m http.server 8765')
