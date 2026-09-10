# Native browser verification

Run model tests with `node --test tests/native-browser/models.cjs`.
Run the actual Electron integration with `cd desktop && npm ci && npm test`.
On Linux a real display or `xvfb-run -a npm test` is required. Keep Chromium's
sandbox enabled. The hosted workflow installs its setuid helper rather than
passing `--no-sandbox`. Live checks use `ASTER_LIVE=1`, and require ImageMagick's
`import` on Linux to capture the actual OS surface, including WebContentsView.

`integration.cjs` is a privileged maintainer test harness, **not** a shipped API or
preload. Its `executeJavaScript` probes inspect real documents for assertions; the
production bridge does not expose that capability. Native Copy/Paste uses actual
engine keyboard events, not a replacement clipboard. Network fixtures use a real
HTTP server with unchanged framing policy headers. The iframe denial controls
are independent from successful native rendering. Live Google is not fulfilled
from a fixture and is recorded separately. No sign-in or exhaustive Google search
coverage is claimed.

Reports and screenshots go to `tests/native-browser/artifacts/`, excluded from
source. The ordinary web-hosted suite continues to test the non-native route.
