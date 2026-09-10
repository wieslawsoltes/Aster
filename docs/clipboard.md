# Clipboard and keyboard — Aster 2.4

## Start here

Paste normally into a focused text field: Command+V on macOS, Control+V on
Windows/Linux, or the browser/touch Paste menu. Clipboard history is **not** a
prerequisite. These are native browser editing operations, including the browser's
selection replacement and undo, rather than simulated keyboard events.

The previous shell captured Command+V as a Windows-key history command, and
Command+A/Z as desktop actions. The corrected policy detects the **host keyboard**
independently of the visual theme. AltGr, composition, Dead/Process keys, already
claimed events, and repeated launch keys are excluded. App-level key handlers,
file pickers, dialogs, and editors respect this priority. Native context menus are
kept for text inputs, textareas and contenteditable fields.

Open **Start → Clipboard Utilities** for the workbench and snippets. Open
**Settings → System → Clipboard** for the same configuration panel. The original
Clipboard history flyout remains available from Start or the configurable
shortcut, initially Control+Alt+V. OS-reserved shortcuts cannot be reassigned by
this web application; use the visible launcher when the host reserves one.

## Workbench and paste targets

The workbench accepts ordinary native Paste, including touch/menu paste. Read
system clipboard is a separate, explicit browser API action. On denied or missing
API support, paste into the workbench or the Manual paste dialog instead. These
fallbacks do not silently use an old Aster history entry in place of the OS clipboard.

Edit or transform text, copy it to the real OS clipboard, download UTF-8 text, or
insert into the field that was active before opening clipboard tools. Transformations
are original/plain text, edge trimming, one line, uppercase/lowercase and LF line
endings. The original/plain option preserves the supplied string and Unicode.
Native text controls can normalize line endings as part of their own editing.

The insertion service snapshots the original text selection or rich-field Range,
not just the field. If that field changes, closes, becomes private or unavailable,
paste rejects instead of overwriting newer work. Pasting focuses the original Aster
window. Programmatic plain insertion uses native insertText where supported for
undo, with a deterministic selection-replacement fallback. Native shortcut paste
is not intercepted in ordinary text inputs.

Cut/Copy/Paste/Select all are available in Notepad's Edit menu. The macOS-themed
Files Edit menu distinguishes its search/address field from a file selection.
Copy helpers report permission failures instead of claiming success. A legacy
execCommand Copy fallback exists only for explicit user copy when Async Clipboard
is unavailable; there is no attempted execCommand Paste or clipboard API override.

## Formats and Files

Read system clipboard can inspect text/plain, inert text/html source, and PNG
when the browser exposes those representations. HTML is displayed as text, never
executed or inserted as markup. PNG can be previewed, copied, downloaded or saved
into Pictures as actual bytes. Clear preview releases its object URL. Clear system
clipboard is a separate confirmed action replacing the actual OS clipboard with
empty text; clearing Aster history alone does not change the OS clipboard.

Files keeps file-reference copy/cut separate from text history. Native file-list
Copy/Cut sets an opaque clipboard token and visible path text. Native Paste accepts
Aster file references only when the token matches the current OS ClipboardEvent,
so copying external text cannot accidentally paste stale Aster files. A portable,
escaped HTML representation carries the same token for browsers that discard the
custom MIME type; readable plain path text is unchanged. Matching requires the
current token and exact path text, never path text alone, and the HTML is not
parsed or executed. Document-body paste events are routed only to the live,
focused Files window; editable fields and open dialogs keep their native paste. Toolbar and
menu Paste are explicit virtual file actions; without virtual references they offer
text/PNG import with a manual fallback. File clipboard entries exposed by the
browser are imported through one checked files transaction, with unique destination
names, no overwrite and collision/removed-folder checks. External desktop file-manager
clipboard exposure varies; this is not an unrestricted native file-system clipboard.

## Configuration and privacy

Keyboard profiles are Automatic, Windows, macOS and Linux. The explicit profile
controls Aster chord presentation and Super interpretation, not native OS remapping.
Desktop shortcuts can be disabled. Super/Windows-key actions are automatic (off on
macOS), always off, or enabled outside editable fields. History shortcut choices
are Control+Alt+V, Control+Shift+H, Command/Super+Alt+H, or none. AltGr is always
excluded, including when represented as Control+Alt. Alternate physical key codes
support Option-modified configurable shortcuts without treating AltGr as a shortcut.

History is off by default. When enabled, copied/cut text inside supported Aster
fields is captured through trusted clipboard events. Capturing explicit pasted
text is a separate opt-in, also off initially. There is no clipboard polling,
background OS read, cross-application clipboard monitor or clipboard-change listener.
Password, OTP, credit-card autocomplete, data-private fields and private ancestors
are excluded; private document selections are excluded too. Arbitrary embedded
application content is not inspected or harvested into history.

History supports search, pin/unpin, editing, delete, clearing unpinned/all, and
confirmed JSON export/import. Capacity is 10, 25 (default), 50 or 100 text items.
Unpinned expiration choices are at reload, 15 minutes, 1 hour or 24 hours; expired
items are pruned on history access or mutation, not by a background OS monitor.
New capture does not evict an all-pinned collection. Explicit capacity reduction
removes excess entries, unpinned first. Only pinned snippets are eligible for disk
persistence; unpinned clipboard entries and format previews are session memory.

Keep pinned snippets after reload can be turned off. Disabling history erases both
the active collection and stored pins. The default Clear temporary data on Aster
lock removes unpinned snippets, previews and paste targets. Aster's visual lock is
not authentication. Pins are unencrypted in browser-local storage and exported
JSON contains actual text: do not store secrets there. File backups may contain
previously saved metadata; clearing history does not rewrite existing exported
backups or erase clipboard data held by the host OS or other websites.

Plain rich-field paste is optional. Editor Tab can indent/complete or navigate
focus. Terminal has a default multiline/control-character paste review: cancellation
leaves the command unchanged, approval inserts one editable line, and no pasted
text is executed until a later explicit Enter. Copying a selected terminal command
does not trigger Control+C interruption. IME confirmation Enter does not execute.

## Cooperating embedded apps

Include `sdk/aster-clipboard.js` in a cooperating page. `AsterClipboard.readText()`
and `AsterClipboard.writeText(text)` return promises. The host creates a fresh
MessageChannel for each loaded frame. The client accepts only the immediate parent
handshake; requests cannot target arbitrary desktop windows. Every operation
requires the live, active, focused app and a separate visible host dialog. Read
starts with an empty paste box; only the text the user approves is returned. The
user may explicitly request a system read inside that dialog, subject to browser
permission, or use native Paste. Write previews the exact requested text before
copying. Neither operation returns history, image formats, files, or desktop APIs.

One approval is active at a time. Requests are bounded, timed out, cancelled on
frame replacement, window disposal, lock, and helper disable; they revalidate live
ownership and policy after approval. Re-enabling helpers creates a fresh channel.
`connected` means a helper channel exists, **not** permission to read the OS clipboard.
The application must handle rejection and retain its normal keyboard/menu paste.
No same-origin sandbox privilege or media/file permission is added.

## Limits, compatibility and verification

Explicit text helper operations: 1 Mi characters. History: 16,384 characters per
item, 100 items maximum. JSON snippet import: 2 MiB, 100 items. PNG preview/copy:
8 MiB. File paste import: up to 32 supplied files / 32 MiB into writable virtual
folders, not external mounted folders. An unsupported or rejected format is not
reported as successfully pasted. This release is not native Windows clipboard
synchronization, macOS Universal Clipboard, an X11 PRIMARY-selection daemon, a
remote clipboard service, a cloud account sync system, or rich office-format parity.

Async Clipboard support, permissions and user activation differ between browsers;
HTTPS or localhost is preferred for those APIs. Native keyboard paste remains the
primary path for hosted, standalone and opaque embedded text editors. Aster cannot
grant itself browser permission or override an embedded application's own editing
code. The diagnostic button queries only advertised capabilities/permission state
on request, and does not assume that an unsupported permission query means denial.

Standards used for the implementation:
- W3C Clipboard API and events: https://www.w3.org/TR/clipboard-apis/
- W3C UI Events: https://www.w3.org/TR/uievents/
- MDN browser-specific clipboard security considerations:
  https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API

Reproduction, fixture boundaries and actual verification commands are in
[tests/clipboard/README.md](../tests/clipboard/README.md). Test artifacts distinguish
native clipboard operations from supplied synthetic file fixtures and distinguish
injected memory storage from ordinary HTTP/file IndexedDB verification.

### Manual workbench paste and lock lifecycle

The workbench's Manual paste action fills its preview only. Insertion into a
previous editor remains a separate explicit action. Lock revokes guest clipboard
channels and pending requests; resuming the visual desktop reconnects enabled
helpers without reloading their documents. Disabled helpers do not handshake on
new frame loads, and reconnecting never grants clipboard contents automatically.

Lock-triggered editor blur cannot re-acquire an insertion target. Captures and
late history additions are ignored while the visual desktop is locked. This is
clipboard lifecycle protection, not host-OS authentication or clipboard erasure.
