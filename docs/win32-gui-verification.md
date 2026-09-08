# Win32 GUI verification

The GUI implementation is committed as editable source, rather than only a
staged transport archive. The import verified all 29 source paths, rebuilt the
CPU and pinned WineMine fixture, and passed the 40 core, 24 compatibility and
39 GUI runtime checks plus the slow-display integration check.

The import previously stopped on an indentation-only line in the generated
standalone HTML. The standalone builder now normalizes blank-line whitespace;
the whitespace check remains enabled.

The `Browser Win32 — PE32 execution and WebGPU` workflow is the merge gate for
each revision. It must pass the shipped and rebuilt runtime tests, actual browser
WebGPU/menu/dialog tests, desktop regressions, native Windows comparison and the
offline byte-identical WineMine rebuild. A prior revision's green run is not a
substitute for these checks.

Run `node tests/win32/gui.cjs` for resource, registry, DIB and guest-callback tests.
Run `python tests/win32/gui-browser.py --gpu --headed` in the documented test
environment for browser behavior; `tests/win32/native-gui.py` is test-only and
executes the same fixture on Windows. End users need neither Wine nor a compiler.

The browser test waits for the asynchronous session to exist before reading its
renderer. The native reference uses bounded WM_GETTEXT/WM_SETTEXT messages for
cross-process edit controls; GetWindowText intentionally returns window captions,
not another application's edit contents. Native dialogs and saved settings have
passed this corrected reference test.

Offline third-party tests preload the new resources, registry, GUI and bitmap
modules before disconnecting the browser. Their no-network-during-execution
assertion remains enabled. This fixes the test's outdated preloading list, not
an exemption from offline execution or an added runtime backend.
