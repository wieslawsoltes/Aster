# Profile picker verification

Run from the repository root:

```sh
python build.py
node --test tests/file-pickers/models.cjs
python -m pip install playwright
python -m playwright install --with-deps chromium firefox
python tests/file-pickers/browser.py
python tests/file-pickers/browser.py --standalone --output tests/file-pickers/artifacts/standalone
python tests/file-pickers/browser.py --engine firefox --output tests/file-pickers/artifacts/firefox
python tests/web-io/browser.py
```

The fixture is an original, explicitly labelled app using standard file APIs in
an opaque sandbox. The suite runs twelve theme presets through Open, Save and
Folder selection, captures six light/dark profiles, and tests actual pointer/key
input, file bytes, New Folder, overwrite confirmation, navigation, sorting,
selection, safe previews, live theme changes, display preference persistence,
permission revocation, touch, and portrait/landscape geometry.

`--inject --browser /path/to/chromium` is a local memory-only option for managed
browsers that block local HTTP/file navigation. It does not replace HTTP and
standalone persistence evidence. The hosted suite requires real IndexedDB and
full reloads; standalone repeats startup offline. Tests retain all page errors.
Delayed-preview verification delays the real filesystem read; it does not replace
its bytes or the production implementation. Screenshots use original local test
content, not a substitute for the live app tests in `tests/web-io/live.py`.

The inherited Web Files suite remains enabled. Its root-selection UI assertion
is updated to require the newly disabled Select Folder button, and also directly
asserts that the unchanged grant validator rejects `/`. The directory-race,
private-scope, asynchronous-navigation, stream, permission, native fallback and
transfer assertions remain intact. No browser isolation flags are relaxed.

No pixel-identical native OS claim, screen-reader certification, native-picker
restyling claim or physical-GPU speed measurement is made by these tests.

## Continuation regressions

The recovered head `6ce70f562c15655896d6a1c734bee02ad0fc3f3f` passed
21 Chromium picker scenarios, but its reload test tried to open an unregistered
in-memory fixture. The suite now re-registers only that descriptor after the
full reload. It does not reseed files, preferences, grants or application bytes.
All IndexedDB, expired-grant, reopen and offline assertions are retained.

Two additional browser regressions failed on the recovered production code:
Ctrl-deselecting from two files to one left the deselected filename in the input,
and Save As discarded a draft filename on folder selection. The fixed suite
checks the exact remaining returned path and saves actual bytes through nested
folder navigation in all three desktop profiles. No forced clicks or replacement
picker implementations are used.
