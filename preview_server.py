"""Local browser preview: python preview_server.py --port 8766 (no external API)."""
import argparse
from html import escape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
MANUAL = ROOT / 'manual'


def branch_name():
    try:
        result = subprocess.run(
            ['git', '-c', f'safe.directory={ROOT.as_posix()}', '-C', str(ROOT),
             'branch', '--show-current'],
            capture_output=True, text=True, encoding='utf-8', timeout=3, check=True,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        )
        return result.stdout.strip() or 'detached HEAD'
    except (OSError, subprocess.SubprocessError):
        return 'local'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = urlsplit(self.path).path
        pages = {'/': 'index.html', '/index.html': 'index.html',
                 **{f'/{lang}/{name}': f'{lang}/index.html' for lang in ('en', 'zh', 'ko') for name in ('', 'index.html')}}
        if path == '/favicon.ico':
            return super().send_head()
        # The help menu opens the manual reader; serve its static files so the link works locally.
        if path in ('/manual', '/manual/') or path.startswith('/manual/'):
            target = Path(self.translate_path(self.path)).resolve()
            if target == MANUAL or MANUAL in target.parents:
                return super().send_head()
            self.send_error(404)
            return None
        if path not in pages:
            self.send_error(404)
            return None
        try:
            source = (ROOT / pages[path]).read_text(encoding='utf-8')
        except OSError:
            self.send_error(404)
            return None
        prefix = escape(f'【{branch_name()}】', quote=False)
        source = re.sub(r'(<title\b[^>]*>)', lambda m: m.group(1) + prefix,
                        source, count=1, flags=re.IGNORECASE)
        data = source.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        return BytesIO(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--host', default='127.0.0.1', help='Use 0.0.0.0 for LAN preview')
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f'Preview: http://{args.host}:{args.port}/ [{branch_name()}]', flush=True)
    server.serve_forever()
