#!/usr/bin/env python3
"""Build the standalone Aster HTML. Python standard library only."""
from pathlib import Path
import argparse, base64, re, json

ROOT=Path(__file__).resolve().parent

def build(destination:Path)->None:
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    def style(match):
        path=ROOT/match.group(1)
        return '<style>\n'+path.read_text(encoding='utf-8')+'\n</style>'
    html=re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>',style,html)
    html=re.sub(r'<link\s+rel="manifest"[^>]*>','',html)
    icon=base64.b64encode((ROOT/'assets/icon.svg').read_bytes()).decode('ascii')
    html=html.replace('href="assets/icon.svg"','href="data:image/svg+xml;base64,'+icon+'"')
    assets={str(p.relative_to(ROOT)):base64.b64encode(p.read_bytes()).decode('ascii') for p in sorted((ROOT/'src/win32').rglob('*')) if p.is_file() and p.name not in ('gdi.js','gui-host.js')}
    assets['third-party/tinycc/tcc-0.9.27.tar.bz2']=base64.b64encode((ROOT/'third-party/tinycc/tcc-0.9.27.tar.bz2').read_bytes()).decode('ascii')
    assets['third-party/winemine/winemine-source.zip']=base64.b64encode((ROOT/'third-party/winemine/winemine-source.zip').read_bytes()).decode('ascii')
    html=html.replace('</head>','<script>window.ASTER_WIN32_ASSETS='+json.dumps(assets,separators=(',',':'))+';</script>\n</head>')
    html=html.replace('</head>','<script>window.ASTER_STANDALONE=true;</script>\n</head>')
    def inline(match:re.Match)->str:
        relative=match.group(1)
        source=(ROOT/relative).read_text(encoding='utf-8')
        # HTML parsers scan raw script text even inside JS string literals.
        source=re.sub(r'</script',lambda _:'<\\/script',source,flags=re.IGNORECASE)
        return '<script>\n/* '+relative+' */\n'+source+'\n</script>'
    html=re.sub(r'<script\s+src="([^"]+)"\s*>\s*</script>',inline,html)
    destination.parent.mkdir(parents=True,exist_ok=True)
    html=re.sub(r'(?m)^[ \t]+$', '', html)
    destination.write_text(html,encoding='utf-8')
    print(f'Built {destination} ({destination.stat().st_size:,} bytes)')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'Aster.html')
    build(parser.parse_args().output)
