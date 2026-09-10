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

## Hosted regressions and diagnostic boundaries

The first Firefox trace showed that `fill()` alone on a newly launched inactive
iframe did not enter text: the value stayed `Original` with no input event, and
the document identity did not change. The regression now clicks the actual editor
first and asserts the exact draft immediately, before opening app details, and
again after metadata edits and source replacement. No DOM text setter, forced
click or replacement app implementation is used.

The first Chromium run passed the real IndexedDB abort, reload and migration
checks but observed registry removal before the separate shell pin queues
finished. The test waits for all three required removals, then additionally
checks the saved `taskbarPins` and `startPins` records. The inherited Widgets test
likewise waits for its asynchronously rebuilt task card to exist before checking
its contents; absence is not accepted as task completion.

Desktop backup checks operate real Settings export/restore controls and native
file choosers. They restore descriptions, favorite and artwork metadata and actual
HTML contents after changing them. A malformed legacy record remains inert but
is retained in the exported recovery backup before an explicit normalized edit.
