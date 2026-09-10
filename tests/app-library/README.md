# App-library verification

```sh
node --test tests/app-library/models.cjs
python -m pip install playwright
python -m playwright install chromium firefox
python tests/app-library/browser.py
python tests/app-library/browser.py --standalone --output tests/app-library/artifacts/standalone
python tests/app-library/browser.py --engine firefox --output tests/app-library/artifacts/firefox
```

A Chromium executable can be passed with `--browser /path/to/chromium`.
`--inject` is a separately labeled fallback for managed environments which block
HTTP and file navigation; it cannot establish IndexedDB persistence. HTTP and
standalone tests require real IndexedDB and reload the page. No data or grants
are re-seeded after reload. Standalone additionally reloads with networking off.

The library tests use actual HTML and `.asterapp` file choosers, real downloaded
JSON packages, sandboxed document execution, unchanged textarea contents and
iframe identity, filesystem bytes, stale revisions, real transaction abort,
legacy entries, touch-capable layout, six themes, and keyboard focus loops.
A minimal HTTPS response fixture tests generic-link isolation only; it is not
used to claim the external catalog applications were live-tested. The separate
inherited web-app workflow visits the actual 79 catalog sites.

Test output is ignored under `artifacts/`. CI saves reports, genuine screenshots,
exported package, exact source archive, commit SHA and standalone hash, even on
failure. The historical `tests/results.json` is not new evidence.
