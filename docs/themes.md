# Aster theme system (1.9)

Open **Settings → Personalization → Themes**, or search Start for **Themes**.
Right-click the desktop → **Personalize** reaches the same in-place controls.
The **Taskbar & Dock** page is also available from the taskbar context menu.
Run accepts `ms-settings:themes`, `ms-settings:personalization-background`,
`ms-settings:personalization-colors`, `ms-settings:taskbar` and
`ms-settings:easeofaccess-highcontrast`.

This is an implemented browser theme service with Windows-format interchange and
three shell profiles, **not Microsoft's native UxTheme/DWM implementation**.
Native `.msstyles`, AppKit, GTK/GSettings and operating-system binaries are not
loaded. Compatibility is the documented matrix below, not a promise that every
Windows/macOS/GNOME appearance feature or theme package is supported.

## Theme profiles and live shell behavior

| Profile | Shell integration |
| --- | --- |
| Windows | Full-width bottom taskbar, centered/left alignment, Start, tray, right-side window controls, rounded Mica-style windows and independent shell/app modes. |
| macOS 26 | Original glass-like menu bar, active-app name, proxies for the active built-in app's actual File/Edit menus, Window menu, left-side red/yellow/green close/minimize/zoom controls and a floating application Dock. Dock can be bottom/left/right. |
| Ubuntu GNOME | Activities top bar routes to Task View, a centered clock/calendar, system controls and a left/right/bottom application dock with active indicators and Show Applications. Header bars use Ubuntu-style light/dark surfaces and orange accents. |

These profiles recompose the **existing real task buttons, clock and tray**. They
do not mount imitation app windows, rebuild documents, or replace file services.
Changing a theme preserves the same editor DOM, unsaved text, window state and
application objects. Minimize, maximize, close safeguards, taskbar activation,
Jump Lists, resize and snapping remain connected to Aster's window manager.

Maximized windows and snap previews use a shared theme-aware work area. It reserves
the top bar and the active dock edge, or a four-pixel auto-hide reveal edge. Keyboard
focus and open shell panels reveal an automatically hidden dock. On narrow screens,
custom profiles switch to a bottom dock and constrained flyouts.

Twelve presets are included: Windows Light, Dark and Custom; macOS 26 Glass and
Dark; Ubuntu GNOME Light and Dark; original Sage, Rose and Graphite variations;
and Day/Night contrast themes. Original procedural/CSS artwork, icons and generated
sound schemes are used. No Apple/Microsoft/Ubuntu wallpaper or font files are copied.
Fonts use installed system stacks. The profile name identifies the appearance target,
not affiliation or native-operating-system compatibility.

## Personalization controls

| Area | Implemented behavior |
| --- | --- |
| Theme library | Apply presets, edit the active theme, save named custom themes, delete saved entries, preview imports, cancel before application, and export/share complete portable themes. |
| Color modes | Independent shell and application Light/Dark/Follow-system modes, unified modes, separate accent and selection colors, automatic wallpaper-derived accent and active title/border coloring. Start/taskbar accent applies in dark shell mode. |
| Materials | Transparency on/off, clear/tinted glass appearance, application colors and system-color overrides; reduced-motion and forced-colors preferences take priority. These are browser CSS/WebGPU adaptations, not native optical-refraction APIs. |
| Backgrounds | Built-in artwork, solid color, supplied pictures and multi-image slideshows, manual Next, shuffle, interval, fill/fit/stretch/tile/center/span and per-virtual-desktop overrides. Span covers the one browser desktop, not physical monitors. |
| Sounds | Opt-in original synthesized schemes and supplied WAV files per implemented event. Test playback, theme-relative volume, master mute/volume and Do Not Disturb. Windows, dialogs, menus and Recycle Bin events use the service. |
| Mouse pointers | Browser/original light/dark/accent pointer schemes, Arrow size, supplied CUR/PNG roles, and RIFF ANI icon-frame animations with hotspots, sequence and rates. Text, links, resize handles, busy states and drawing surfaces use their role variables. |
| Metrics | Installed font stack, text size, title bar height, border width, corner radius, scrollbar width and taskbar/Dock icon size. Existing Aster controls update in place. |
| Icons | Colorful, dark, tinted and clear icon treatment; supplied ICO/PNG overrides for Computer, Browser/Network, Recycle Bin and a Documents desktop entry when present. Does not replace app-authored art or icon pixels inside remote websites. |
| Accessibility | Editable seven-color contrast palette plus two contrast presets; solid surfaces, visible selection, browser forced-colors and reduced motion. Imported animated cursors stop under reduced motion. |
| Taskbar/Dock | Profile, supported edge, alignment, size, auto-hide and Search/Task View/Widgets visibility; real taskbar and tray functionality remains available. |

The lock surface shares the current backdrop. An independent lock-screen feed,
Windows Spotlight, screen-saver engine, per-monitor wallpaper settings, schedule-
based OS theme switching, native theme synchronization, macOS Stage Manager and
GNOME Shell extensions are **not implemented by this theme service**. Auto appearance
follows the browser's color-scheme preference, not a separately calculated sunrise.
Some built-in app-specific canvas pixels and fixed layout/font metrics intentionally
remain app-owned. This is not an exhaustive pixel-parity claim.

## Windows theme interchange

The import flow understands the documented INI `.theme` organization. Required
Desktop, VisualStyles and MasterThemeSelector sections are validated. Parsing is
case-insensitive and bounded; UTF-8, BOM UTF-16 LE/BE and legacy Windows-1252 input
are decoded. Localized DLL resource names produce diagnostics rather than executing
or reading a Windows DLL.

| Format or section | Scope |
| --- | --- |
| `.theme` | Display name, RGB system colors, ARGB accent, transparency, wallpaper fit/tiling, supplied slideshow paths/interval/shuffle, cursor roles, sound-event WAV paths and desktop icon references. Select companion files as well as the descriptor. |
| `.themepack`, `.deskthemepack`, `.cab` | Real Microsoft CAB input with stored or MSZIP folders; block checksums, bounds and 32 KiB MSZIP history verified. Exactly one `.theme` descriptor is required. |
| `.themepack` export | A real uncompressed CAB containing the descriptor and supplied resources, with Unicode filenames. It is not a ZIP file renamed to `.themepack`. |
| `.astertheme` | Versioned JSON carrying the full Aster profile/settings and embedded asset bytes. Preferred complete Aster-to-Aster interchange. |
| ZIP theme packages | Existing bounded ZIP reader/writer packages the same descriptor and resources. |
| `[Aster]` extension | A non-executable, encoded declarative descriptor preserves Aster-only settings when round-tripping its Windows-format files. Standard Windows consumers ignore that extension. |

The supported named system colors are retained as theme data and mapped to Aster
control tokens and Win32 COLORREF slots where corresponding surfaces exist. The
mapping is not a native Windows Classic visual-style renderer. Standard export
uses a built-in Aero reference when no classic color override is requested; it
does not include that binary. Native Windows deciding which settings to apply is
separate from CAB/INI byte interoperability.

**Not supported:** LZX or Quantum CAB compression, spanning cabinets, native
`.msstyles` execution, DLL/EXE icon extraction, binary NONCLIENTMETRICS/ICONMETRICS,
native WindowMetrics registry blobs, remote RSS wallpapers, native sound-scheme
resource names and executable `.scr` screen savers. Import explains these limitations.
An extracted `.theme` plus supported companion files can be supplied instead of
an unsupported compressed cabinet. TIFF/DIB resource decoding is not included;
use PNG/JPEG/WebP/GIF/BMP, ICO/CUR, ANI or WAV as appropriate.

No host path, URL, environment-variable reference, script, stylesheet or native
binary in a theme is fetched or executed. References resolve only against explicitly
supplied files, by exact relative path or unambiguous basename. Unrecognized assets
are reported and not installed. Missing companions do not invent fake images or sounds.

## Win32 runtime integration

Real running PE32 Workers receive validated 31-slot COLORREF snapshots. `GetSysColor`
returns the current palette; `GetSysColorBrush` keeps its stock handle identity while
updating its color. Class background-color brushes use that same palette during
`BeginPaint`. Top-level guest windows receive coalesced **WM_SYSCOLORCHANGE (0x15)**
and **WM_THEMECHANGED (0x031A)** notifications and are invalidated for redraw.

The original x86 execution and Win32 message loop handle these messages. Theme
updates do not restart guest processes or replace their drawing code. Invalid
snapshots and a full message queue cannot partially overwrite the palette.

This adds **system-color/theme notification compatibility**, not the full UxTheme
API, native theme handles, DirectComposition or `.msstyles` drawing. Guest-created
bitmaps, custom-painted controls and applications that ignore system colors retain
their own rendering. Guest nonclient metrics remain internally consistent and fixed;
changing browser title-bar size does not falsify their Win32 geometry API results.

## External web apps

All 74 reviewed apps keep their existing lazy registration, titlebars, taskbar
entries and privacy boundaries. A small `aster:theme` message is sent to the exact
reviewed frame origin for apps that choose to implement it. No remote CSS is injected
and no document, asset bytes, permission or authentication data is sent. App interiors
keep their own styles unless they explicitly consume the message. A macOS/Ubuntu
profile is not an emulator for native macOS/Linux binaries.

## Persistence, limits and lifecycle

The versioned library is stored locally in IndexedDB under `theme-library`.
Library and legacy appearance mirrors are committed in the same metadata transaction,
so existing Quick Settings and older Settings controls continue to work. Theme changes
are serialized and propagate to open shell surfaces. Existing files are never reset.

At most eight saved custom themes, 64 assets and 16 MiB of resources per theme,
40 MiB of serialized library state, 24 wallpaper images, 16 desktop overrides,
and eight MiB per individual asset are accepted. Images are checked for dimensions
before browser decoding (maximum 8192 per axis and 16 megapixels). CAB input/expanded
content is bounded to 32 MiB and 65 members. Codec jobs run in disposable Workers
with a two-job limit and 30-second deadline. The asset list can retain unused supplied
resources; saving a fresh preset/import is a way to start a smaller library item.

Resources are cached and object URLs revoked on replacement/page exit. Slideshow
and ANI scheduling pauses while hidden; reduced motion disables ANI animation.
WAVs are decoded locally, capped at ten seconds and four concurrent sounds; cancelled
decodes and natural/explicit end callbacks release exactly once. Event audio is off
by default and still subject to browser autoplay policy. Exit sounds cannot be
promised to finish after page unload. Physical audible output is not assumed.

`?theme=reset` restores the visible default profile without deleting saved themes.
Malformed stored themes fall back safely with diagnostics. Export important custom
work using **Export portable theme**: the existing generic desktop backup does not
yet include this separate theme library. Clearing site data can remove it. Cross-tab
synchronization, native machine settings and cloud theme roaming are not provided.

## Architecture

- `theme-models.js`: schema, immutable preset data, validation, work-area calculation,
  Windows INI reader/writer and format extensions. DOM-free and tested in Node.
- `theme-assets.js`: bounded image/CUR/ANI/WAV format validation and ANI frame parsing.
- `theme-packs.js`: original stored/MSZIP CAB codec, RFC1951 decoder and Worker lifecycle.
- `theme-engine.js`: transactional persistence, token application, background/asset
  caching, sound lifecycle, native-color snapshots and live window reflow.
- `theme-settings.js`: existing Settings-page integration and import/export controls.
- `theme-shell.js` / `themes.css`: original profile styling and structural composition,
  real tray/Dock/menu integration, popup positioning and theme-file opening.

The WebGPU window-surface renderer consumes active theme color/radius while retaining
its actual GPU path. DOM/CSS handles controls, glass and image wallpaper composition.
No claim is made that PNG/WAV decoding, CAB parsing or every desktop pixel runs on WebGPU.

## Primary reference specifications

- Microsoft: Theme File Format — https://learn.microsoft.com/en-us/windows/win32/controls/themesfileformat-overview
- Microsoft: Personalize your Colors — https://support.microsoft.com/en-us/windows/experience/personalization/personalize-your-colors-in-windows
- Microsoft: GetSysColor — https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getsyscolor
- Microsoft: WM_SYSCOLORCHANGE — https://learn.microsoft.com/en-us/windows/win32/gdi/wm-syscolorchange
- Microsoft: WM_THEMECHANGED — https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-themechanged
- Microsoft: expand — https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/expand
- Apple: macOS 26 Appearance — https://support.apple.com/guide/mac-help/change-appearance-settings-mchlp1225/26/mac/26
- Apple: Desktop & Dock — https://support.apple.com/guide/mac-help/change-desktop-dock-settings-mchlp1119/26/mac/26
- Ubuntu: GNOME desktop overview — https://help.ubuntu.com/stable/ubuntu-help/shell-introduction.html.en

See `tests/themes/README.md` for reproducible checks and the distinction between
local injected, normal HTTP, standalone, native format-reference and GPU evidence.
