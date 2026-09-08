# Desktop essentials verification

Run from the repository root:

```sh
node --test tests/desktop-features/models.cjs
python3 build.py
python3 -m pip install playwright
python3 -m playwright install --with-deps chromium
python3 tests/desktop-features/browser.py
```

The Node suite covers clipboard bounds/order, focus deadline state, quiet-hour
boundaries, version retention, safe window metadata, layout geometry, ZIP/DEFLATE
round-trips, CRC, corruption, directory collisions, path safety and resource limits.

The browser suite exercises actual registered Aster apps and services: Explorer
tabs and preview, version restore, Python-generated ZIP extraction and independent
Python decoding of the browser-generated archive, Worker responsiveness, atomic
collision rollback, real keyboard copy and editor paste, focus actions/DND, widget
Tasks integration, group reuse/desktops, safe cleanup, color-filtered dialogs,
settings/shortcuts, real video encoding/decoding/cleanup, mobile and offline builds.
Normal HTTP mode additionally checks full-page IndexedDB persistence and migration
from the old v1 database with retained legacy files/metadata. Each check has a
bounded timeout and reports its actual result to `artifacts/browser-results.json`.

The recorder test substitutes **only the permission chooser's returned stream**
with a canvas `MediaStream`; the production recorder, real `MediaRecorder`, encoded
Blob, video decoder and save path remain in use. The report labels that fixture.
Permission denial and late-returning streams after close are separate checks.
A successful codec test is **not** verification of interactive OS capture dialogs,
system-audio availability, installed speech voices or audible output. Test those
manually in a supported HTTPS/localhost browser.

`--inject --browser /usr/bin/chromium` is a local fallback for a managed browser
that blocks localhost. It verifies the embedded build but has memory-only storage;
reload and schema-migration checks are explicitly omitted there, never claimed as
passing. Hosted CI uses the full HTTP suite. The inherited Win32 workflow separately
checks real WebGPU shaders/pixels using software Vulkan and native reference EXEs.

Screenshots and reports are CI artifacts, not production assets. The generated
standalone should be byte-identical to running `python3 build.py` on the PR head.
