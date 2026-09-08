# Integrated shell verification

Run from repository root:

```sh
python3 build.py
node --test tests/integrated-shell/contracts.cjs
python3 tests/integrated-shell/browser.py
```

The seven contract checks cover legacy destination hiding/migration, transient
session suppression, parent-app modes, Settings hierarchy and inclusion in
standalone/offline assets. Browser checks exercise actual flyouts and parent
windows with real data and controls. They assert no extra utility windows/taskbar
entries, editor focus preservation, context-menu nesting, widget tasks/notes,
Settings view disposal, Clock/Snips modes, file version recovery, compressed
folder navigation/extraction, desktops/groups, Snap Assist, recording lifecycle
and mobile/dark layouts. Normal HTTP additionally performs a full page reload.

Reports/screenshots are generated in `tests/integrated-shell/artifacts/` and
uploaded by the integration workflow. Tests fail rather than accepting absent
features. The first failure records a screenshot and error. Host page errors are
checked independently.

`--browser /path/to/chromium` selects a browser executable. `--inject` is only a
local fallback for environments that block all localhost navigation; it injects
the rebuilt standalone HTML and cannot establish IndexedDB reload persistence or
service-worker behavior. It is not used by hosted CI.

Recording uses a labeled synthetic canvas MediaStream only as the chooser result.
The real production recorder creates a video, the browser decodes it, the virtual
filesystem stores it, and all tracks are asserted ended. A delayed chooser result
after closing Snips must also terminate. The physical user permission chooser,
system audio, audible local speech and host-reserved shortcuts are not automated.

The inherited desktop-essentials, web-apps and Win32/native workflows continue to
run and provide storage migration, ZIP interoperability, 67 deployed app startup,
WebGPU pixel checks and executable regression coverage.
