# Aster 1.9.3: caption correctness, Aster Prism and window actions

## Reproduced defects and changes

The baseline is merged revision `9bf1ab8ac2cacb3d6e0250920c44b9eb66e79011`.
In the macOS glass profile the foreground title was assigned z-index 1 while
absolutely positioned caption controls had automatic stacking. Normal pointer
clicks were intercepted by `.window-title`. Existing visual tests checked caption
geometry but invoked window methods directly, so they did not detect the fault.
The new regression uses real hit testing and unforced pointer clicks in all 12
presets, on Notepad, Explorer and Settings.

Caption controls now occupy a layer above decorative glass. Noninteractive title
text cannot intercept pointer events. macOS indicators retain a small circular
visual with separate 26px targets (32px for coarse pointers). Controls are ordered
close/minimize/maximize in both DOM keyboard order and visual order for that
profile; Windows/Ubuntu use minimize/maximize/close. Controls have stable action
attributes and labels. Focusing a window no longer recreates an unchanged
maximize SVG. Inactive windows remain actionable on the first click.

Other corrections found while testing:

* Delayed Notepad/Terminal initial focus only applies when the window itself still
  has focus. It cannot steal focus from an already opened menu, caption or dialog.
* Double close requests share one existing unsaved-document confirmation. Cancel
  preserves the editor; errors clear the guard for another attempt.
* Snap-hover timers belong to each window and are cleared by close/minimize and
  shell dismissal. Keyboard focus in the palette suspends pointer dismissal.
* Narrow Explorer headings ellipsize instead of overlapping the next column.
  Full sorting labels remain accessible and `aria-sort` reflects actual state.
* Ubuntu's dark shell surfaces now establish their own text/background tokens,
  independently from a light application theme.

## Original artwork, not copied application identities

`src/profile-artwork.js` implements the **Aster Prism** icon language: a cut-corner
plate, simple purpose-based line geometry and a small diamond signature. All
profiles use the same owned symbols rather than imitating platform application
identities. There are 29 dedicated symbols (including Recycle Bin); other registered
apps use their existing generic glyph inside the same generated tile. This does
not replace or inject artwork inside embedded third-party apps.

Removed the old smile-face file-manager, compass-browser, flower-photo and
marketplace-monogram artwork. Settings now uses sliders; file management uses
indexed drawers; Orbit uses an orbital diagram; Photos uses a framed composition;
App Center uses connected packages. No system icons, logo files, font files or
external image resources are bundled. This is a description of the implemented
artwork choices, not a legal clearance opinion or measured native-parity score.

SVGs are ID-free (no duplicate gradient/clip identifiers), have no external image
or script references, and scale as a unit from 8 to 128 CSS pixels. Caller sizes
are sanitized; the render cache is bounded to 256 entries. Colored, dark, tinted,
clear, increased contrast and forced-colors modes retain a visible glyph.

## Integrated window features

The existing titlebar menu (also **Alt+Space**) includes:

| Command | Behavior |
| --- | --- |
| Move / Alt+F7 | Arrow-key positioning; 10px steps or 1px with Shift. |
| Resize / Alt+F8 | Adjust right/bottom edges within current work area and minimum dimensions. |
| Center window | Center in the theme's work area, accounting for top panels and side docks. |
| Always on top | User-controlled stacking band above ordinary Aster windows. |
| Maximize / Alt+F10 | Fill current work area, or return to the preceding rectangle. |

Enter commits keyboard movement; Escape reverts. Switching theme, losing browser
focus or resizing the host viewport cancels a pending keyboard transform. A
non-window status overlay explains the controls; it does not add a taskbar app.
A pointer action accepts the pending transform. Closing disposes its listeners.

Always-on-top is a strict boolean in existing window session state. It is off
unless explicitly enabled and is restored only when normal session restoration
is enabled. DOM z-index and WebGPU surface order use the same stacking order.
It does not escape the Aster tab, alter host windows, cross virtual desktops or
sit above shell panels. It is not an OS-level always-on-top capability.

The macOS global Window menu exposes Center, Always on top and the full window
menu. Maximize-button hover still offers the existing snap zones. A focused
maximize button + Down opens those same choices; arrows/Home/End navigate and
Escape returns focus. This remains Aster's work-area maximizing, not native
macOS fullscreen Spaces or AppKit tiling.

## Verification methodology

`tests/ui-refinement/models.cjs` checks actual artwork generation, cache/sizing
bounds, callback guards, session flag typing, stacking and centering methods.
The caption stacking CSS invariant is also checked, but is **not** the sole
proof of pointer behavior.

`tests/ui-refinement/browser.py` uses the production window manager and built-in
apps. It does not force clicks, replace event handlers or assert only that a
button exists. The all-preset matrix performs maximize, restore, minimize,
taskbar restore and close for 36 preset/app pairs, with multiple points tested
inside each button. Additional scenarios cover inactive glass captions, dirty
confirmation, actual touch at 390px, actual keyboard transforms, palette cleanup,
app-wide icon rendering, sorting, focus races, media-query accessibility and
full-page session reload. The icon inventory screenshot is an explicitly labeled
test gallery; it is not another application. Six desktop captures use actual
Explorer/Notepad windows. Injected local execution is explicitly memory-only.

Hosted CI runs Chromium HTTP, Chromium standalone/offline and independent Firefox
HTTP. All existing visual optics, theme-native-format, Explorer, shell, compact
web-app, deployed-catalog and Win32/native workflows remain enabled. A successful
workflow is recorded separately from full native OS fidelity: these tests do not
prove every operation in all 74 external websites, hardware GPU performance,
Safari rendering or host permission dialogs. This pass does not expand the
Win32 instruction/API subset or implement the missing native compositor effects.

## Additional verification findings

Run's open-dialog guard previously remained held while the chosen app mounted
and its command history was saved. A second Run shortcut during that interval
could be silently ignored even though the dialog had disappeared. The guard now
ends with the visible dialog, not the asynchronous launch. A model regression
executes the actual production dialog method with delayed launch dependencies;
the inherited HTTP/standalone suite retains its real consecutive Run commands.

The column-sort test waits for the actual IndexedDB-backed ascending/descending
header state rather than asserting against the old render. The offline test
minimizes the deliberately restored always-on-top editor through its real
caption before clicking the underlying Explorer. It does not force clicks
through an intentionally higher window or disable window stacking.

## Primary behavior references

Reviewed September 9, 2026. Aster's original artwork is deliberately not modeled
on platform application icon identities.

- Microsoft titlebar interaction/geometry: https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design
- Microsoft interactive caption areas: https://learn.microsoft.com/en-us/windows/apps/develop/title-bar
- Apple window actions: https://support.apple.com/en-au/guide/mac-help/mchlp2469/mac
- Apple materials and accessibility hierarchy: https://developer.apple.com/design/human-interface-guidelines/materials
- GNOME maximize/restore behavior: https://help.gnome.org/gnome-help/shell-windows-maximize.html
