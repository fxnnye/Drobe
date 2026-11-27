#!/usr/bin/env python3
# Erzeugt impressum.html, datenschutz.html und agb.html aus den Rechtstexten in index.html.
# Nach jeder Änderung der Texte in index.html einmal ausführen:  python3 ios-app/make-legal.py
import re, os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
html = open(os.path.join(root, 'index.html'), encoding='utf-8').read()
body = html[html.index('id="legalBody"'):]
pages = {'impressum': ('impressum.html', 'Impressum'), 'datenschutz': ('datenschutz.html', 'Datenschutz'), 'nutzung': ('agb.html', 'AGB')}
marks = [(m.start(), m.group(1)) for m in re.finditer(r'<div data-legal-page="(\w+)"[^>]*>', body)]
css = '''body{margin:0;background:#fff;color:#111;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
@media(prefers-color-scheme:dark){body{background:#000;color:#eee}a{color:#9cf}}
main{max-width:720px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:14px;letter-spacing:.2em;margin:0 0 24px}h2{font-size:22px}h3{font-size:16px;margin:24px 0 4px}
nav{display:flex;gap:16px;margin-bottom:24px;font-size:14px}ul,ol{padding-left:24px}'''
for i, (pos, key) in enumerate(marks):
    end = marks[i + 1][0] if i + 1 < len(marks) else None
    seg = body[pos:end] if end else body[pos:]
    seg = seg[seg.index('>') + 1:]
    # bis zum schließenden </div> des Abschnitts (Tiefe zählen)
    depth, j = 1, 0
    for m in re.finditer(r'</?div\b[^>]*>', seg):
        depth += -1 if m.group(0).startswith('</') else 1
        if depth == 0: j = m.start(); break
    inner = seg[:j].strip()
    fn, title = pages[key]
    nav = ''.join(f'<a href="{f}">{t}</a>' for f, t in pages.values())
    out = f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} – JAWNZ</title><meta name="robots" content="index,follow"><link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png?v=2"><style>{css}</style></head>
<body><main><h1>JAWNZ</h1><nav>{nav}<a href="./">Zur App</a></nav>
{inner}
</main></body></html>
'''
    open(os.path.join(root, fn), 'w', encoding='utf-8').write(out)
    print(fn, len(out))
