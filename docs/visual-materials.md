# Visual profiles and live optical materials (Aster 1.9.2)

## User controls

Use **Settings → Personalization → Themes** to choose Windows, macOS 26 or Ubuntu
light/dark presets. **Personalization → Colors** includes **Glass rendering**
(Balanced lens, Detailed lens with dispersion, Blur only), **Refraction strength**,
**Color dispersion** and **Dock magnification**. These settings are saved with the
theme, survive reload, and round-trip in portable themes and the non-executable
Aster extension of Windows `.theme` files. Existing custom metrics are retained;
select a preset to adopt its revised metrics. No running application is remounted.

Windows has wallpaper-tinted opaque Mica, Acrylic transient surfaces, 46-pixel
caption targets, Fluent spacing and combined Explorer caption/tab strips.
macOS has concentric window/sidebar corners, revised traffic lights, focused-app
File/Edit/Go/Window menus, a floating refractive Dock, pointer highlights and
magnification. Ubuntu has a solid GNOME-style top panel, Yaru-inspired header bars,
a side dock, centered clock, circular close control and orange selection accents.
Explorer and Settings get profile-specific row densities, sidebars and controls.
Icons are original inline vector artwork. No system fonts, wallpapers, native
icon files or proprietary theme binaries are bundled.

The earlier compact-web-app setting is unchanged: catalog and installed HTML
apps keep their outer title bars hidden by default. No lens is installed on a
hidden title bar, and external app contents are not forcibly styled.

## Material pipeline

`material-optics.js` defines rounded-rectangle distance-field geometry and its
normal gradient. An inner rim bends light while the central region remains flat.
The field is encoded into bounded RGBA pixels, not a captured desktop image.
`liquid-material.js` computes this field once per shape/recipe and applies it with
an SVG **backdrop filter** to the actual browser-composited backdrop. Foreground
text, icons, videos and application canvases remain unwarped.

The regular recipe provides stronger blur and a readable tint for text-heavy
navigation. Clear is reserved for the Dock; tinted mode is more opaque. Detailed
mode separates and recombines red/green/blue refractive samples, with bounded
user-controlled dispersion. Edge highlights and shadows are separate layers;
pointer motion changes highlights without regenerating the field. Solid content
panes are not transformed into glass or copied into a texture.

When Aster has a WebGPU device, an 8×8 compute shader generates the normal field.
Only **self-generated geometry bytes** are read back once, never pixels from an
iframe or another app. The browser then performs the real backdrop sampling.
Without WebGPU, the same bounded field is generated using CPU math. This CPU
fallback still has real refraction in supported Chromium browsers. Unsupported
browser engines and explicit Blur only mode use ordinary CSS backdrop blur and
are labeled accordingly; a CSS syntax check alone is not claimed to prove SVG
rendering. Firefox/Safari native-engine pixel fidelity is not certified.

For macOS, the WebGPU window surface retains its analytical shadow while allowing
navigation chrome to expose the backdrop; content panes remain opaque. Windows
uses an opaque wallpaper-tinted base. Ubuntu uses solid header/content surfaces.
Switching profiles or accessibility modes invalidates existing GPU window layers.

## Bounds and accessibility

At most **16 visible surfaces**, **24 cached map/recipe entries**, and **16 pending
map requests** are tracked. A detailed field has at most **131,072 pixels** and a
512-pixel longest axis (524,288 bytes); balanced uses at most 65,536 pixels and
384-pixel axes. This bounds raw field-cache accounting to 12 MiB. PNG encodings and
browser-internal backdrop buffers are reported/separate: this is not a claim that
the entire browser uses 12 MiB. One GPU field/readback job runs at a time, and its
buffers are destroyed in `finally`. The desktop renderer keeps at most two GPU
frame submissions in flight, retaining dirty state while the queue is busy so
wallpaper rendering cannot flood the queue ahead of interactive compute.
Generation checks discard obsolete results.

Resize/DOM/theme notifications are coalesced into one animation-frame update.
Idle surfaces do not rebuild maps. Reduced motion disables moving highlights and
Dock magnification; transparency off, forced colors and contrast settings use
opaque/readable controls. Blur-only mode releases unused maps; leaving macOS or
closing a surface releases its references. Page disposal disconnects observers
and listeners. No continuous background ray tracing, screen capture, external
request, framework, remote renderer or security-policy bypass is involved.

## Evidence and fidelity boundaries

`tests/visual-materials/` tests actual shell controls, unsaved-editor identity,
real Explorer menus, geometry, accessibility, resource budgets and full reloads.
The pixel comparison places an **explicit test checkerboard behind the real
Dock**, compares the refractive screenshot against the identical SVG chain with displacement set to zero,
then changes the backdrop and verifies the displayed output changes. This proves
refraction beyond blur, **not similarity to a native OS screenshot**. A separate
WebGPU readback compares actual compute output against CPU math to within one
8-bit channel unit, and requires the production engine to use WebGPU fields.

The inherited themes suite continues to verify WebGPU GDI output, live guest
colors and Windows theme-file interoperability. Linux hosted GPU tests use
SwiftShader software Vulkan; no physical-GPU benchmark or native-speed advantage
is claimed. Application-owned drawings and independent embedded sites can retain
their own visual language.

The profiles are detailed original adaptations of the referenced desktop design
systems. They are **not** native DWM/UxTheme, AppKit/Liquid Glass or GNOME Shell;
there is no measured “100% parity” score. In particular, native wallpaper/icon
art, system font rasterization, compositor blur kernels, content-luminance
adaptation, shared glass morphing, native menu tracking and host-level animations
are not reproduced identically. No headless test proves those properties. The
browser-material path provides lensing, dispersion, layered highlights, tint,
blur, live backdrop updates and accessibility fallbacks rather than labeling a
simple opacity/blur style as the full native implementation.

## Primary references inspected September 9, 2026

- [Apple: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
  — regular versus clear, navigation/control use and accessibility adaptation.
- [Apple WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
  — lensing, light response, separation from content and responsive material design.
- [Apple: macOS 26 appearance settings](https://support.apple.com/guide/mac-help/change-appearance-settings-mchlp1225/26/mac/26)
  — appearance and liquid material customization.
- [Microsoft: Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)
  — opaque, wallpaper-tinted persistent surfaces.
- [Microsoft: Acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)
  — translucent transient surfaces and accessibility/performance fallbacks.
- [Ubuntu: visual shell overview](https://help.ubuntu.com/stable/ubuntu-help/shell-introduction.html.en)
  — panel, application launcher and overview organization.
- [Ubuntu: Yaru](https://github.com/ubuntu/yaru)
  — visual reference only; no Yaru source/assets are incorporated here.
