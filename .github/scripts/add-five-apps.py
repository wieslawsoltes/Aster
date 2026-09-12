#!/usr/bin/env python3
"""One-shot catalog preparation; never included in the published Aster tree."""
import base64
import hashlib
import html
import json
import re
import subprocess
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path.cwd()
BASE = 'e797446a15ab51bd67d0950e2161e6e9d386f08b'
REQUESTED = [
    ('Velsign', 'Velsign', 'office', 'Prepare agreements, place signature fields and manage browser-local signing demos', '43f7713ccade187b401836500c5f26f4bc8c12a1'),
    ('Folio', 'Folio', 'office', 'Local-first documents, knowledge pages, project databases and notes', '970cf8c3dbefd676c8ad6fcaeedeefa46f376943'),
    ('MirevaStudio', 'Mireva Studio', 'design', 'Interface design, multi-screen prototypes, vector editing and local projects', '61217e6759576e1b21be34ba75561b6ea05db251'),
    ('Orivane', 'Orivane', 'office', 'Local-first whiteboards, sticky notes, diagrams and presentations', '39174782b857db5d82c2088133e2fa0d24530b48'),
    ('Velora', 'Velora Design Studio', 'design', 'Presentations, social graphics, posters and multipage visual designs', '525f5cf170d134c24da40449261282896d050c1e'),
]
PATHS = ['src/web-app-catalog.js', 'docs/web-app-inventory.json', 'tests/web-apps/catalog.cjs',
         'tests/web-apps/browser.py', 'tests/app-library/browser.py', 'tests/smoke.py',
         'README.md', 'docs/web-apps.md', 'docs/app-library.md', 'tests/web-apps/README.md',
         'tests/app-library/README.md', 'sw.js']
BEFORE = {}
# Every edited input must still equal the user's current baseline, not just share a filename.
for name in PATHS:
    data = (ROOT/name).read_bytes()
    original = subprocess.check_output(['git', 'show', BASE+':'+name])
    assert data == original, 'Concurrent source change: '+name
    BEFORE[name] = data
texts = {name: data.decode('utf-8') for name, data in BEFORE.items()}


def read_url(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Aster-catalog-audit', 'Accept': '*/*'})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read(32*1024*1024+1)
        assert len(data) <= 32*1024*1024, 'Oversized audit response'
        return response.status, response.url, {k.lower(): v for k, v in response.headers.items()}, data


def api(path):
    status, final, headers, data = read_url('https://api.github.com/'+path)
    assert status == 200 and final.startswith('https://api.github.com/')
    return json.loads(data)


source = texts['src/web-app-catalog.js']
begin = source.index('{', source.index('const data = '))
end = source.index('\n};', begin)+2
catalog = json.loads(source[begin:end])
inventory = json.loads(texts['docs/web-app-inventory.json'])
assert len(catalog['apps']) == 79 and len(inventory['repositories']) == 80
assert not {r[0] for r in REQUESTED} & {a['repo'] for a in catalog['apps']}
old_apps = json.loads(json.dumps(catalog['apps']))
old_inventory = json.loads(json.dumps(inventory['repositories']))
now = datetime.now(timezone.utc).isoformat()
for repo, title, category, description, readme_sha in REQUESTED:
    metadata = api('repos/wieslawsoltes/'+repo)
    assert metadata['full_name'] == 'wieslawsoltes/'+repo and not metadata['private'] and not metadata['fork']
    readme = api('repos/wieslawsoltes/'+repo+'/readme')
    assert readme['sha'] == readme_sha, 'README changed since review: '+repo
    url = 'https://wieslawsoltes.github.io/'+repo+'/'
    assert url in base64.b64decode(readme['content']).decode('utf-8-sig'), 'Unconfirmed Pages URL'
    status, final, headers, data = read_url(url)
    assert status == 200 and final == url, (repo, status, final)
    assert 'text/html' in headers.get('content-type', '').lower()
    assert not headers.get('x-frame-options'), 'Framing denied: '+repo
    assert not re.search(r'frame-ancestors\s+[^;]*(?:\x27none\x27|\x27self\x27)', headers.get('content-security-policy', ''), re.I)
    match = re.search(r'<title[^>]*>(.*?)</title\s*>', data.decode('utf-8'), re.I|re.S)
    assert match, 'Missing document title: '+repo
    document_title = html.unescape(re.sub('<[^>]+>', '', match[1])).strip()
    assert document_title and 'site not found' not in document_title.lower()
    catalog['apps'].append(dict(repo=repo, title=title, description=description, category=category,
        createdAt=metadata['created_at'], url=url, documentTitle=document_title,
        selection='explicit-request', addedAt=now))
    inventory['repositories'].append(dict(name=repo, createdAt=metadata['created_at'],
        createdLocal=datetime.fromisoformat(metadata['created_at'].replace('Z', '+00:00')).astimezone(ZoneInfo('Europe/Warsaw')).isoformat(),
        repository=metadata['html_url'], readmeSHA=readme_sha, included=True,
        selection='explicit-request', addedAt=now,
        reason='Explicit user request for Velsign, Folio, Mireva Studio, Orivane and Velora; outside the original date-window selection.',
        deployments=[dict(requestedUrl=url, status=status, finalUrl=final,
            headers={k: v for k, v in headers.items() if k in ('content-type','content-security-policy','x-frame-options')},
            bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), title=document_title, checkedAt=now)]))
    print('AUDITED', repo, status, len(data), document_title, flush=True)
assert catalog['apps'][:79] == old_apps and inventory['repositories'][:80] == old_inventory
catalog['version'] = 4
catalog['updatedAt'] = inventory['updatedAt'] = now
texts['src/web-app-catalog.js'] = source[:begin]+json.dumps(catalog, ensure_ascii=False, indent=2)+source[end:]
texts['docs/web-app-inventory.json'] = json.dumps(inventory, ensure_ascii=False, indent=2)+'\n'


def replace(name, old, new, count=1):
    assert texts[name].count(old) == count, ('Unexpected source', name, old, texts[name].count(old))
    texts[name] = texts[name].replace(old, new)


replace('tests/web-apps/catalog.cjs', 'inventory.repositories.length, 80', 'inventory.repositories.length, 85')
for old, new in [('catalog.apps.length, 79', 'catalog.apps.length, 84'),
                 ('a.id)).size, 79', 'a.id)).size, 84'), ('apps.size, 79', 'apps.size, 84'),
                 ('"explicit-request").length, 5', '"explicit-request").length, 10')]:
    replace('tests/web-apps/catalog.cjs', old, new)
texts['tests/web-apps/catalog.cjs'] += '''

test('Requested workspace and design apps are unique, searchable and do not gain media access', () => {
    const {apps} = register();
    const requested = [
        ['Velsign', 'Velsign', 'office'], ['Folio', 'Folio', 'office'],
        ['MirevaStudio', 'Mireva Studio', 'design'], ['Orivane', 'Orivane', 'office'],
        ['Velora', 'Velora Design Studio', 'design']
    ];
    assert.equal(catalog.version, 4);
    const recording = launcher.match(/const recordingApps = new Set\\(\\[([^\\]]+)\\]\\)/)[1];
    for (const [repo, title, category] of requested) {
        const matches = catalog.apps.filter(a => a.repo === repo);
        assert.equal(matches.length, 1);
        const app = matches[0], audit = inventory.repositories.find(r => r.name === repo);
        assert.equal(app.title, title); assert.equal(app.category, category);
        assert.equal(app.selection, 'explicit-request'); assert.equal(audit.selection, app.selection);
        assert.equal(audit.addedAt, app.addedAt);
        assert.equal(audit.deployments[0].title, app.documentTitle);
        assert.match(audit.readmeSHA, /^[a-f0-9]{40}$/);
        assert.match(audit.deployments[0].sha256, /^[a-f0-9]{64}$/);
        assert(audit.deployments[0].bytes > 0);
        assert(apps.get(app.id).keywords.includes(repo));
        assert(!recording.includes("'" + repo + "'"));
    }
});

test('The standalone embeds the exact same catalog, including all five additions', () => {
    const standalone = fs.readFileSync(root + '/Aster.html', 'utf8');
    const marker = '/* src/web-app-catalog.js */';
    const begin = standalone.indexOf(marker);
    assert(begin >= 0);
    const end = standalone.indexOf('</script>', begin);
    assert(end > begin);
    const context = {};
    vm.runInNewContext(standalone.slice(begin, end), context, {timeout: 1000});
    assert.deepEqual(JSON.parse(JSON.stringify(context.AsterWebCatalog)), JSON.parse(JSON.stringify(catalog)));
});
'''
replace('tests/web-apps/browser.py', '79', '84', 6)
replace('tests/web-apps/browser.py', "'AureonStudio']:page.screenshot", "'AureonStudio','Velsign','Folio','MirevaStudio','Orivane','Velora']:page.screenshot")
needle = "            def search():\n"
new = '''            def requested_apps():
                for repo in ['Velsign','Folio','MirevaStudio','Orivane','Velora']:
                    app=next(a for a in apps if a['repo']==repo)
                    category=next(c['title'] for c in categories if c['id']==app['category'])
                    start();page.get_by_role('textbox',name='Search apps and files').fill(repo)
                    page.get_by_role('button',name=app['title']+' App · '+category,exact=False).click()
                    current_frame().get_by_role('heading',name='Window behavior fixture').wait_for()
                    frame=page.locator('.web-app-frame')
                    assert frame.get_attribute('src')==app['url']
                    assert page.locator('.window').get_attribute('data-app')==app['id']
                    assert not any(permission in (frame.get_attribute('allow') or '') for permission in ['camera','microphone','display-capture','geolocation'])
                    close_all()
                web_index()
                return 'All five search results launch their canonical frames; inert fixtures, not live application verification'
            check('Requested workspace and design apps launch from Start without extra permissions',requested_apps)
            def search():
'''
replace('tests/web-apps/browser.py', needle, new)
replace('tests/app-library/browser.py', '79', '84', 2)
replace('tests/app-library/browser.py', 'OS.apps.size===108', 'OS.apps.size===113')
replace('tests/smoke.py', '79', '84', 2)
replace('docs/app-library.md', '79 reviewed', '84 reviewed')
replace('tests/app-library/README.md', '79 catalog sites', '84 catalog sites')
replace('tests/web-apps/README.md', 'for the ten inventory', 'for the inventory')
replace('tests/web-apps/README.md', 'for the twelve HTTP-served desktop-host', 'for the HTTP-served desktop-host')
replace('tests/web-apps/README.md', 'all 79 real deployed projects', 'all 84 real deployed projects')
texts['tests/web-apps/README.md'] += '\nThe requested-workspace regression checks all five new Start search results and\ncanonical iframe URLs without extending media permissions. The live run separately\nopens Velsign, Folio, Mireva Studio, Orivane and Velora and retains screenshots.\n'
replace('docs/web-apps.md', 'All 79 reviewed', 'All 84 reviewed')
replace('docs/web-apps.md', '75 repositories and the collection 79 apps', '85 repositories and the collection 84 apps')
replace('docs/web-apps.md', 'not all 79 application payloads', 'not all 84 application payloads')
counts = Counter(a['category'] for a in catalog['apps'])
for category in catalog['categories']:
    # A literal table row, not Markdown interpreted as a regular expression.
    pattern = r'(?m)^\| '+re.escape(category['title'])+r' \| \d+ \|$'
    texts['docs/web-apps.md'], n = re.subn(pattern, '| '+category['title']+' | '+str(counts[category['id']])+' |', texts['docs/web-apps.md'])
    assert n == 1, category['title']
section = '''## Workspace and design additions

| App | Category | GitHub Pages edition |
| --- | --- | --- |
| Velsign | Office & Productivity | Browser-local agreement preparation and signing demos |
| Folio | Office & Productivity | Documents, knowledge pages and project databases |
| Mireva Studio | Design & Graphics | Interface design, vectors and multi-screen prototypes |
| Orivane | Office & Productivity | Whiteboards, notes, diagrams and presentations |
| Velora Design Studio | Design & Graphics | Presentations, social graphics and multipage designs |

These are explicit additions, not a change to the original date-window audit.
The previous VoltWeave, Stratum Intelligence, Veldra, Avolith and Aureon entries
remain present. The inventory retains the actual HTTPS response, document title,
response hash and inspected README hash for each new entry.

All five launch their public Pages edition and store local work in their own
browser storage. Server-backed accounts, cross-device collaboration and connected
AI require each project's separately deployed backend; Aster does not supply or
silently connect those services. Velsign's local signing demo does not establish
verified identities or certified signatures. Export important work from the app
before clearing its site data. These additions receive no camera, microphone,
screen-capture or geolocation delegation.

'''
replace('docs/web-apps.md', '## Hosting, permissions and trust\n', section+'## Hosting, permissions and trust\n')
texts['README.md'] = '''## Catalog update — 84 web apps

Added **Velsign**, **Folio**, **Mireva Studio**, **Orivane** and **Velora Design Studio**
to **Start → Your web apps** and **App Center → Discover**. Search by title,
repository name or purpose; existing pinning, favorites and window actions apply.
Velsign, Folio and Orivane are in Office & Productivity; Mireva and Velora are in
Design & Graphics. These launch the public, local-first Pages editions, not a
silently connected cloud service. [Catalog, provenance and hosting limits](docs/web-apps.md).

'''+texts['README.md']
replace('sw.js', "aster-desktop-2.4-clipboard-r7", "aster-desktop-2.4-catalog84-r1")
# No input is written until every audit and exact source replacement succeeds.
for name, text in texts.items():
    (ROOT/name).write_text(text, encoding='utf-8')
print('Updated', len(texts), 'editable files; existing entries preserved; total apps', len(catalog['apps']), flush=True)
