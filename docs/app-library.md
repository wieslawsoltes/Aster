# App Center and installed applications — Aster 2.2

## Use the local library

Open **Start → App Center**. Discover lists the 79 reviewed, lazy-loaded web
applications, Installed lists locally installed HTML apps and saved HTTPS links,
Favorites uses your saved stars, and Built-in apps lists Aster's built-in tools.
Search includes descriptions, category, publisher and version. Filter by category
and sort by name or the recorded installation/update time. These are real local
records, not online marketplace listings, ratings or download counts.

**Install HTML app** accepts a self-contained `.html`/`.htm` file or a portable
`.asterapp` package. Before anything is stored, edit its name, **description**,
category, icon, color, publisher, version and favorite status. This fixes issue
#11. Empty descriptions are allowed; old installations without a description
retain their original fallback until edited. Publisher and version are plain,
self-reported metadata, not verified authorship or executable signatures.

**Details → Edit details** changes the same saved record used by App Center,
Start search, Settings, and new launches. Existing windows retain their iframe,
unsaved content and file handles. Their displayed title changes without reloading
the guest. Settings → Apps → Manage installed apps opens the same library;
Start's installed-app context menu includes Details and Edit details.

**Add web app** saves an HTTPS shortcut. It does not download a site, enumerate
its dependencies, install a native PWA or change the curated catalog. Generic
links stay in an opaque sandbox and offer Open in browser. Some websites refuse
embedding or need a separate tab for cookies, login, workers or device APIs.
HTTPS links cannot include credentials or executable/data/file/blob schemes.

## Packages, updates and removal

**Replace HTML** selects a new self-contained source file and asks for
confirmation. It writes a new, unique virtual source file and changes the
launcher in one transaction. The old source remains at its original path, and
running windows continue executing the old document. Save work and close/reopen
the app to use the replacement. Nothing silently updates a running editor.

**Export app package** downloads `.asterapp` JSON containing the allowlisted
metadata and, for HTML apps, the actual source bytes as text. Import always
assigns a new local ID and asks for confirmation in the installation form.
Identity, file grants, sandbox permissions and source paths are never imported.
The normal desktop backup also retains descriptions, favorites and the other
validated app metadata. Backup restoration remains the existing merge workflow,
not an atomic whole-desktop rollback; unrelated appearance settings are unchanged.

**Remove app** removes the launcher, then removes its taskbar and Start pins
through the shell's existing persistence paths. Every running app's close guard
is respected. Cancelling one close cancels removal; previously confirmed windows
may already have closed. HTML sources, exported packages, documents and private
app storage are deliberately kept. Desktop shortcut records are hidden when the
app is no longer registered; they are not destructive file deletions. Remove
unneeded preserved files explicitly in Explorer after backing them up.

Code Studio's Add to Start opens the same metadata form and installs a copy of
its saved HTML, leaving the editable project unchanged. Repeating it can create
another independently managed copy, rather than silently replacing an app.

## Storage and concurrency

`src/app-library-models.js` defines the bounded, versioned data schema, migration,
URL/path validation, sorting/search and portable package format. It has no DOM,
network or runtime code dependencies and is independently tested in Node.

`src/app-library.js` is the single persistent service. The existing `customApps`
metadata key is retained. HTML installation/replacement writes package files and
launcher metadata in **one IndexedDB files/meta transaction**. It validates the
previous metadata and destination records *inside* the transaction. Publication
to the runtime registry occurs only after commit. The memory fallback follows
the same validation order but is explicitly nonpersistent.

Writes serialize in one tab. Revisions reject stale detail forms. Concurrent
changes from another tab are rejected rather than silently overwritten; this is
not a collaborative synchronization service. Preserve drafts and reload the
older tab when another tab changed its library. Taskbar/Start pin cleanup is
separate from the app/package transaction, following the existing shell queues.

Legacy records preserve IDs and source paths. Malformed/duplicate records are
not registered; Installed shows a diagnostic. They remain in the saved list for
backup until the next explicit library change normalizes the list. No browser
database migration deletes the old records or files at startup.

Limits: 128 installed records; 5 MiB decoded HTML; 32 MiB package-container
import; names 60 characters; descriptions 500; category 48; publisher 80;
version 40; HTTPS URL 2048. Icons/colors use a fixed original-artwork allowlist.
Missing HTML sources are reported in Details with a replace/restore remedy.

## Security and boundaries

Imported HTML keeps the existing sandbox flags: scripts, forms, modals and
downloads. **No `allow-same-origin` is added.** The existing Web Files bootstrap
and permission broker remain the only automatic HTML-file integration. Saved
web links do not get automatic Aster file access or sandbox exemptions. Curated
catalog apps retain their existing explicitly reviewed execution policy; a
user-edited title or URL never upgrades a generic app into that trust tier.

Metadata is rendered as text, never HTML. Import forms do not preview/execute
uploaded code or parse HTML in a resource-fetching document. Installs and source
updates do not request the remote application. Application code can still make
network requests when launched: install code you trust. The manager is not a
malware scanner, OS application installer, browser sandbox bypass, remote app
store, automatic updater, or guarantee of offline support for external sites.

The Windows/macOS/Ubuntu profiles share theme tokens and original Aster icons.
Keyboard focus loops and responsive layouts are tested; no formal screen-reader
certification or native-OS pixel parity is claimed.

## Verification

`tests/app-library/models.cjs` tests schema migration, descriptions, input bounds,
URL/path rejection, search/sort and package round trips. `browser.py` drives real
file choosers, installation/edit forms, running guest documents, update packages,
download/reimport, cancellation, Start/Settings and responsive/theme workflows.
Normal HTTP and standalone runs additionally exercise actual IndexedDB aborts,
full reloads and legacy migration. Only the HTTPS-link test uses a clearly
labeled website response fixture. The inherited all-catalog live suite visits
unchanged actual deployments, separately from these manager tests.

Run the permanent `app-library.yml` workflow for Chromium HTTP, standalone/offline
and Firefox, followed by the inherited desktop/file/GPU workflows. A local
`--inject` run exercises the same interaction code but is memory-only and is not
used as durable-storage or live-site evidence.
