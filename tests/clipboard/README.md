# Clipboard and keyboard verification

The suite exercises the real production shell and its native editing. An independent
browser page populates the **real system clipboard through its Copy shortcut**;
Aster receives it through its normal Paste shortcut. A second native Paste checks
text copied by the workbench. No replacement navigator.clipboard or fake clipboard
cache is used. macOS uses actual Command key events; Linux/Windows use Control.

```sh
node --test tests/*/models.cjs tests/integrated-shell/contracts.cjs tests/web-apps/catalog.cjs
python build.py
python -m pip install playwright
python -m playwright install --with-deps chromium firefox
python tests/clipboard/browser.py
python tests/clipboard/browser.py --standalone --output tests/clipboard/artifacts/standalone
python tests/clipboard/browser.py --engine firefox --output tests/clipboard/artifacts/firefox
```

Run native clipboard suites **serially in one machine/session**: their independent
pages intentionally share the OS clipboard. CI engines/host platforms use separate
jobs. --browser selects an installed executable. --inject loads the built production
standalone using set_content for restricted local development; it is explicitly
memory-only storage and is never persistence evidence. Normal HTTP/file modes test
real IndexedDB reloads and pinned-only storage. Standalone mode goes offline after
loading the file, including the local HTML SDK guest.

The PNG check runs only on ordinary Chromium HTTP with explicitly granted test
clipboard permissions. It writes and reads a real ClipboardItem, saves it through
actual Files storage, and verifies its representation. This does not claim a native
permission chooser can be bypassed or automated for users. Firefox and macOS must
still pass the native text-paste and scoped-helper checks; browser API permission
UI is not replaced by fake success. The synthetic DataTransfer file case is labeled:
it validates the actual byte importer, not external file-manager clipboard exposure
on every operating system.

Coverage includes Unicode replacement and undo with history off; Command editing
under all visual profiles; AltGr, composition, dead keys and event claiming; real
history capture and private-field exclusion; selected insertion and owning-window
focus; manual paste without Clipboard API; workbench transfer and transformation;
stale target rejection; inert rich-field text and native context menus; actual
configuration and Tab navigation; snippet JSON export/import; file-reference token
copy/paste and stale-reference rejection; real supplied file bytes; terminal
multiline review; opaque guest native paste and per-request helper approval,
revocation and close cleanup; lock clearing, disabled-history erasure, mobile layout,
and pinned-only reload. Models verify size bounds, expiration, deduplication,
configuration normalization and pin-safe capacity.

The visible Utilities app is new, so inherited application counts increase by one
(29 built-in apps / 108 total). Those count assertions are updated, not removed.
All pre-existing shell, App Center, Files, picker and browser workflows remain.

Failures remain failures; progress, error, DOM and screenshot evidence are retained.
A passing run records its browser engine, real host platform, mode and exact checks.
The permanent workflow retains the exact source archive and standalone checksum.
This is automated browser verification, not screen-reader certification, physical
keyboard-layout coverage or a native OS clipboard daemon certification.
