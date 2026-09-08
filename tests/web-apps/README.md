# Categorized web app verification

Run `node --test tests/web-apps/catalog.cjs` for the eight inventory, date,
category, URL, lazy-registration and loader checks.

Run `python tests/web-apps/browser.py` for the eleven HTTP-served desktop-host
checks. The external iframe pages are explicit inert fixtures. These tests
verify Start submenus, keyboard navigation, search, real window controls, input,
resize, snap, focus, reload, mobile containment and standalone cleanup. The mobile
test waits for the actual resize event before opening Start: resizing closes
panels by design, so opening a submenu before that event would race the shell.
No application assertion or resize handler is disabled.

Run `python tests/web-apps/browser.py --live --gpu --headed` in the documented
Chromium/SwiftShader test environment to launch all 67 real deployed projects.
This path has no fixture routing and records each app's URL, title, visible page
content and DOM/control/canvas counts. It verifies deployed iframe startup, not
all editing, media, file-system or graphics features of every external app.

The local `--inject` mode exists only for managed browsers that block navigation;
it is not evidence of real HTTP hosting, persistence or live project execution.
The CI workflow uses ordinary HTTP plus a separate all-project live run. The
existing Win32/native/GUI and desktop regression workflow remains enabled.
