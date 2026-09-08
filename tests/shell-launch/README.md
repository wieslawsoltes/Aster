# Shell launch verification

```sh
python build.py
node --test tests/shell-launch/models.cjs
python tests/shell-launch/browser.py
python tests/shell-launch/browser.py --standalone --output tests/shell-launch/artifacts/standalone
```

The 19 model checks cover real handler candidates, compatible defaults, bounds,
metadata normalization, startup allowlisting, privacy, quoted virtual paths,
fixed shell/settings aliases, hostile schemes, network/device paths, control
characters, prototype-looking property names and build/cache inclusion.

Browser scenarios use production apps and actual keyboard/pointer controls,
without fake app implementations. They open saved HTML as text or executable
local HTML, dispatch a PNG to Paint, change defaults through Settings and
Properties, validate Run and quoted C-drive paths, pin/launch/remove Jump List
entries, disable tracking, choose startup preferences, test mobile focus, and
launch Default apps from normal Start search. Cancelled or invalid associations
must not change preferences or launch a window.

Ordinary HTTP additionally reloads the whole page, checks IndexedDB persistence,
and proves that startup opens Clock minimized and reuses the restored Calculator
window. A second load with `?startup=off` must skip those configured launches
without dropping their preferences. The standalone edition repeats these checks
through the same production implementation. Missing features fail the tests.

`--browser` selects an executable. `--inject` is a local fallback only for managed
browsers which block file/localhost navigation; it verifies memory-mode actions
but not durable reloads or real startup behavior. CI does not use that fallback.
Service workers are blocked in the isolated test context so each test reads the
specified revision. Offline service-worker lifecycle is not asserted by this suite.

Reports, genuine screenshots and exact source are retained by `shell-launch.yml`.
Screen-sharing dialogs, external app feature parity, physical GPU performance and
host-reserved Win+R delivery are not claims of this suite.
