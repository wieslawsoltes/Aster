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

## Hosted continuation regressions

The snippet-edit assertion now waits for the actual rendered edited text after the
IndexedDB-backed save rather than checking the previous card in the same event
turn. The exact text, export and import assertions remain. Native Cut and undo are
also checked with history off. Workbench Manual paste deliberately updates only
its preview; it never implicitly inserts into the remembered editor. An isolated
guest's helper is revoked on lock and reconnects after explicit Resume without
reloading or losing its draft. Every subsequent request still needs approval.

Firefox exposed a real Files focus bug: clicking a non-focusable table row could
leave focus on the window rather than the file list. Row selection now focuses
the list, and clipboard events are scoped to the owning window so caption focus
works too. The native test asserts actual list focus before Copy; no synthetic
copy event or fake clipboard is used for the file-reference transfer.

The inherited theme helper moves the pointer off the dock and uses Escape before
programmatic Settings navigation. This dismisses a real taskbar hover preview
that otherwise intercepted a contrast-preset click; no forced click is used.

Sensitive autocomplete matching includes multi-token, section-prefixed and
case-insensitive credit-card, password and one-time-code fields. The browser
regression copies their actual text and verifies that no history or target survives.

File-list Copy/Cut starts a real native Copy transaction on the key gesture. A
selected virtual file is not a DOM text selection; relying only on an otherwise
empty browser Copy event left the file clipboard unset in hosted Firefox. Text
inputs remain on the browser's native editing path. The cross-browser test still
uses real Copy/Paste keys, requires actual bytes at the destination, and rejects
stale internal paths after a different page changes the system clipboard.

Committed file assertions explicitly await each IndexedDB read until the file
exists, with a failing deadline. A Promise-valued wait_for_function predicate was
truthy before its storage result and could race the native paste transaction in
Firefox. All exact-byte, image-representation and stale-reference assertions are
retained; no in-memory seeding or transaction is substituted for native paste.

The lock regression explicitly focuses the real document editor before locking.
The resulting focusout must not re-acquire its selection after lock invalidation.
Remember/capture/add reject while locked, including late asynchronous capture.
Native macOS testing exposed this focus-order race; target validation and the
separate visual-lock/non-authentication boundary remain intact.

## Final Firefox native file-paste repair

The retained native-event trace showed Paste targeting BODY while the Files list
held focus. It also showed the custom MIME marker missing from the native
clipboard. Files now routes body-targeted native events to its focused live owner,
and writes a token-bearing inert HTML fallback alongside the custom format.
Both token and exact path text must match the in-memory reference. The unchanged
native Copy/Paste scenario still verifies actual copied bytes; an added identical-
path external text copy must not authorize a stale file operation. Multiple live
Files windows must not intercept paste into the focused search field. Unit tests
cover missing/stale markers, changed text and escaped markup. No test clipboard
object, forced permission, or weakened assertion is used for these checks.
