# Windows applications in Aster: runtime decision

Research date: 2026-09-07. Goal: existing Windows executables, credible performance and verified execution, without pretending WebGPU implements Windows.

| Candidate | Execution model | Assessment |
| --- | --- | --- |
| Wine + local/remote companion | Native x86-64 CPU; Win32 compatibility layer; streamed display | Avoids whole-CPU browser emulation, existing Wine ecosystem and persistent environments. Requires a host. **Implemented.** |
| Boxedwine WebAssembly | CPU + Linux kernel emulation running 32-bit Wine | Browser-contained legacy apps; upstream still describes its WebAssembly build as slow with JIT work outstanding. Not the fast default. |
| CheerpX + Wine | x86-to-Wasm JIT and Linux syscall runtime | Promising in-browser approach but needs Wine image packaging, application testing and licensing review. Not represented as turnkey generic EXE support. |
| v86 + Windows guest | Emulated PC with a guest OS | Useful legacy/retro option, but needs guest installation/images, licensing, memory/startup and CPU/device emulation. Not selected for fast modern apps. |
| Windows RDP/RemoteApp + Guacamole | A separately configured Windows host | Strong future option when Wine compatibility is insufficient. Requires a licensed/configured Windows deployment and gateway. Not implemented in this PR. |

## Implementation

Aster Windows Apps → authenticated HTTP API → per-package Wine prefix → cookie-authenticated private Xvfb display → loopback-only x11vnc → one-time-ticket binary WebSocket → noVNC canvas in an Aster window.

The companion also serves Aster, enabling same-origin localhost use. GitHub Pages serves only static assets; native execution always stays on the user's companion. HTTPS remote use requires a trusted certificate and exact origin allowlist. The pairing token stays in memory in Aster's parent page; an expiring, single-use ticket authorizes each viewer. Native files persist on the companion separately from browser IndexedDB.

Wine translates Windows API calls rather than emulating a complete Windows machine on matching hardware [1]. Native x86-64 therefore avoids the browser CPU-emulation layer. The display path uses incremental RFB frames, selectable compression, binary transport/backpressure, local scaling and reusable prefixes [3]. This is an architectural rationale, **not a measured speedup against native Windows, Boxedwine or RDP**. Xvfb rendering is software-based; WebGPU only belongs to Aster's shell. No GPU/audio acceleration claim is made.

A browser cannot run a PE executable merely by feeding it to WebGPU: shaders do not supply an x86 ABI, Windows kernel, PE process loader or Win32 libraries. This feature supplements rather than replaces Aster's existing HTML app sandbox.

## Evidence standard

A successful test compiles a Win32 PE, creates native GUI controls, delivers keyboard and mouse input through the actual Aster display stream, uses Win32 WriteFile to save typed text, retrieves that result through the authenticated API, reconnects, relaunches on the persistent prefix and terminates managed Wine/X processes. Both 32-bit and 64-bit probes are compiled from original source. A screenshot or header-only PE fixture is not execution evidence.

## Primary sources reviewed

1. Wine project architecture: https://www.winehq.org/
2. Boxedwine upstream README/platforms/WASM TODOs: https://github.com/danoon2/Boxedwine
3. noVNC API (WebSocket protocols, compression, quality, clipboard, scaling): https://novnc.com/noVNC/docs/API.html
4. noVNC distribution-baseline API source: https://github.com/novnc/noVNC/blob/v1.3.0/core/rfb.js
5. CheerpX overview: https://cheerpx.io/docs/overview
6. v86 upstream: https://github.com/copy/v86
7. Apache Guacamole RDP/RemoteApp: https://guacamole.apache.org/doc/gug/configuring-guacamole.html#remoteapp
8. GitHub Pages static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

Dependencies evolve; maintainers should re-evaluate compatibility and security for their chosen deployment. Third-party dependencies keep their own licenses; no proprietary application or Windows image is bundled.
