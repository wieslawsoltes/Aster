#!/usr/bin/env bash
set -euo pipefail
python -m unittest discover -s tests/ci -p 'test_*.py' -v
find src sdk -type f -name '*.js' -print0 | xargs -0 -n1 node --check
node --check sw.js
python -m compileall -q build.py start.py tests
node --test tests/*/models.cjs tests/integrated-shell/contracts.cjs tests/web-apps/catalog.cjs tests/themes/win32.cjs
python build.py
git diff --exit-code -- Aster.html sdk/aster-files.js sdk/aster-clipboard.js
cmp sdk/aster-files.js src/web-io-client.js
git diff --check
mkdir -p tests/ci/artifacts
# One source archive per run replaces a duplicate archive in every suite artifact.
git archive --format=zip HEAD -o tests/ci/artifacts/source.zip
python - <<'PY'
import hashlib, json, os, subprocess
from pathlib import Path
files = subprocess.check_output(['git', 'ls-files', '-z']).split(b'\0')
manifest = {os.fsdecode(p): hashlib.sha256(Path(os.fsdecode(p)).read_bytes()).hexdigest()
            for p in files if p and Path(os.fsdecode(p)).is_file()}
Path('tests/ci/artifacts/provenance.json').write_text(json.dumps({
    'checkout': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'pullRequestHead': os.environ.get('PR_HEAD', ''),
    'files': manifest,
}, indent=2) + '\n')
PY
