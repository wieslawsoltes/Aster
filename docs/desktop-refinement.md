# Aster 1.9.4 — adaptive artwork and desktop workflows

This pass replaces the uniform Prism badge with original **Aster Atelier** artwork
adapted to each desktop profile, and improves everyday Explorer/taskbar behavior.
Existing window caption hit fixes, unsaved-close guards, glass rendering, themes,
74 external apps and browser-only Win32 remain in place.

## Profile-specific artwork

Twenty-nine purpose-based illustrations are authored as inline vectors. They use
original geometry and colors, not extracted icons, logos, proprietary fonts or
native theme files. Other registered apps retain their generic category symbol
inside an original frame; each external app does not receive a bespoke brand icon.

| Profile | Treatment |
| --- | --- |
| Windows | Distinct free silhouettes for papers, folders, instruments, displays and disks; layered color, restrained rim/shadow, golden file folders. |
| macOS | A consistent rounded enclosure with a separate colored object, layered highlights, blue file folders and neutral terminal treatment. |
| Ubuntu/GNOME | Geometric solid objects with a shallow shaded front/lower edge, flatter lighting, orange folders and an aubergine terminal. |
| Legacy Prism | The prior cut-corner glyph badge remains an explicit preference. |

Icon design defaults to **Match desktop theme**. Change it independently at
**Settings → Personalization → Window metrics → Icon design**. Colorful, dark,
tinted and clear styles remain separate from family selection. The preference
is normalized by the existing theme service and included in portable descriptors.
Old saved themes without this field follow their existing desktop profile.

The service updates only the icon wrapper's vector children, never enclosing
buttons, window objects or editors. Focus and unsaved text are preserved. Sizes
are clamped to 8–128 CSS pixels; artwork uses an ID-free 64-unit viewbox. At small
sizes decorative signatures are omitted. Cache size is capped at 256 entries.
A small `themes.artwork` descriptor avoids cloning wallpaper/sound assets while
rendering individual icons. Contrast and forced-color modes replace decorative
colors with semantic foreground/background values.

### Design references and deliberate differences

Primary references consulted for the conventions (not copied assets):

- Microsoft [App icon design](https://learn.microsoft.com/en-us/windows/apps/design/iconography/app-icon-design): recognizable metaphors, unique silhouettes, clear small-size geometry and restrained layering.
- Apple [Icon Composer](https://developer.apple.com/icon-composer/): layered appearance, material enclosure and coherent alternate appearances.
- GNOME [App icons](https://developer.gnome.org/hig/guidelines/app-icons.html) and [UI icons](https://developer.gnome.org/hig/guidelines/ui-icons.html): original geometric metaphors, simple shaded profile, and small symbolic controls.

These are Aster interpretations of the conventions, not native icon parity,
certification, or legal clearance. Native font rasterization, Apple compositing,
GTK theme metrics and independently embedded application interiors may differ.
The existing macOS glass implementation and its documented Firefox blur fallback
are preserved; this change does not claim additional native Liquid Glass parity.

## Taskbar and Dock window list

Hover a running app, or focus its taskbar/Dock button and press Arrow Up/Down.
The window list no longer silently cuts off at four windows. It presents actual
window titles, desktop names and minimized/maximized/pinned state. Activate a
window to restore it on its own desktop; close through the normal unsaved-work
confirmation. Arrow keys and Home/End select a card; Enter activates it; Tab
reaches the separate Close buttons; Escape closes the list and returns focus.

These cards are **window metadata, not live screenshot thumbnails**. They do not
clone app DOM, capture an iframe, read document bodies or claim remote previews.
Up to 60 cards are rendered; larger groups have a Show all windows action opening
Task View. The grid scrolls, and card titles wrap/truncate rather than overlapping.
The title/count and anchor are refreshed after window changes. Event listeners,
resize hooks and pending updates are disposed with the flyout. Close and Activate
are sibling buttons, never invalid nested interactive elements.

## Reorder taskbar/Dock pins

Drag an existing pinned app onto another pin to place it before that pin. With a
pin focused, **Alt+Shift+Left/Right** (or Up/Down for a side dock) moves it one
position. Taskbar controls retain focus across the necessary taskbar repaint.
Reorder and ordinary pin/unpin share one serialized database-write queue, so
rapid commands apply to the last committed order rather than losing updates.

Only installed, already-pinned apps are reorder targets. The queue is bounded to
32 pending changes and the pin array to 256 entries. Failed writes do not publish
a new in-memory order. Pins remain local browser preferences; these actions do
not rearrange the host computer's taskbar. Concurrent *browser tabs* do not share
an ordering transaction service. Host-reserved keyboard shortcuts can be captured
by the surrounding OS/browser instead of reaching Aster.

## Quick Preview in Explorer

Select a file in the virtual drive and press **Space**, or choose **Quick preview**
from its context menu. A read-only modal uses the current theme without creating
a utility app/window/taskbar item. Previous/Next browse the current folder's file
selection; arrow keys navigate outside media controls. Escape or the close button
returns focus to Explorer. **Open in app** uses the existing real file association.

Supported inline content:

| Kind | Behavior |
| --- | --- |
| Text/code/HTML/SVG | Inert selectable text, assigned through `textContent`. No script execution, iframe or `srcdoc`. First 128 KiB only; original content is unchanged. |
| PNG/JPEG/WebP/GIF/BMP/ICO | Browser-decoded raster images with contained aspect ratio. |
| WAV/MP3/OGG/M4A/FLAC | Native browser audio controls, metadata preload and no autoplay. Codec support depends on the browser. |
| WebM/MP4/OGV/MOV | Native inline video controls, no autoplay, browser-dependent codecs. |
| Unknown/binary/EXE | Metadata notice only. No execution or implicit handler launch. |

Media larger than 16 MiB is not decoded. Invalid media produces a visible notice.
A maximum of 512 bounded virtual paths is accepted. Permission-mounted `/Local`
folders and trash paths are excluded. Archive entries must be extracted first.
This is preview, not PDF rendering, a codec pack, a native-folder viewer or a
sandbox for executing downloaded code.

Only one Quick Preview is active. Replacing content or closing the preview pauses
media, clears its source and revokes its object URL. Generations prevent a late
file-read/decode result from attaching to a newer or closed preview. Closing the
owning Explorer disposes the preview. A full desktop reload does not restore it.
Audio metadata/decoding is tested with actual generated PCM WAV bytes; physical
audio output is not an automated-test claim. Video uses ordinary browser controls
and is not an assertion of universal format or DRM support.

## Show Desktop per virtual desktop

Show Desktop now has an independent restore set for each Aster virtual desktop.
Only currently visible windows are hidden. Switching desktops and hiding that
desktop does not overwrite the first restore set. Restoring does not switch to
another desktop, reopen closed windows, or wake apps that were already minimized.
Windows moved to another desktop or manually restored are skipped safely. This
is a transient visibility transaction; snapshots do not persist across reloads.

## Verification

See [reproduction and evidence boundaries](../tests/desktop-refinement/README.md).
The new tests use actual file handlers, theme settings, window objects, drag/drop,
keyboard input, generated media and database persistence. They do not replace the
caption handlers or implementation with predefined app fixtures. Inherited tests
retain the 12-preset × 3-application caption matrix and full regression workflows.
Passing these tests is not exhaustive coverage of every operation in every app.
