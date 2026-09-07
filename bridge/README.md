# Aster Windows Bridge

Run **real x86/x64 Windows EXEs** in an Aster window through a Linux x86-64 companion. Wine executes the program on the host CPU; Aster displays and controls its private desktop through noVNC/WebSocket. This is not an EXE-to-JavaScript converter, a Windows installation, or browser-only emulation.

## Start

From the repository root, with Docker Engine and Compose:

```sh
docker compose -f bridge/compose.yml up --build
```

Open **http://127.0.0.1:8787/**. Launch **Windows Apps** from Start, paste the pairing token printed in the terminal, and select **Connect companion**. Confirm that you trust the program, import a portable `.exe` or a `.zip` containing its executable/DLLs/assets, confirm trust again, and select **Run**. The default display is 1280×720.

**Only run trusted programs. Wine is not a malware sandbox.** Native programs execute with your companion user's permissions. The supplied container runs non-root, binds to loopback, has no host-directory mounts, uses a read-only root filesystem, drops capabilities and limits resources. These precautions are not a security guarantee against hostile code. Use a disposable, properly isolated VM for untrusted software.

The image is `linux/amd64`. On x86-64 Linux this avoids CPU emulation. Docker Desktop adds VM overhead; an ARM host must emulate amd64 and is **not** the native-speed target.

The `windows-data` named volume retains applications, per-app Wine prefixes, saved C: files and the pairing token. Closing an Aster window disconnects the viewer. **Stop app** terminates the complete Wine prefix and private display. Disconnected sessions expire after 180 seconds without a viewer or authenticated heartbeat. **Library → Files** browses/downloads saved C: files. **Remove** deletes the entire application's prefix after its sessions stop.

```sh
# Stop while retaining saved data:
docker compose -f bridge/compose.yml down
# Recover the pairing token from startup logs; do not share these logs:
docker compose -f bridge/compose.yml logs windows
```

Do not use `down --volumes` unless you intend to delete saved data.

## Native Linux installation

Use a dedicated **unprivileged** Linux x86-64 user and Python 3.11+. Debian/Ubuntu example:

```sh
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install wine wine64 wine32:i386 xvfb xauth x11vnc openbox novnc python3-venv fonts-liberation
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r bridge/requirements.txt
python -m bridge.server
```

The CLI refuses root. Data defaults to `~/.local/share/aster-windows`, outside the publicly served source tree. `--data` selects another private directory; `--rotate-token` replaces the pairing token on startup; `--novnc` selects another installed noVNC directory. Ctrl+C stops managed sessions. Keep dependencies patched; their licenses/notices remain in their installed packages, not under Aster's MIT license.

## GitHub Pages / HTTPS desktop

GitHub Pages hosts static assets; **it does not run your Windows programs**. Your own companion must remain running. The simplest configuration is the companion's same-origin localhost Aster URL above.

For an HTTPS-hosted Aster desktop, provide a **browser-trusted HTTPS companion**, protect it with a firewall/private network, and allow the desktop's exact origin (not its path):

```sh
python -m bridge.server \
  --host 0.0.0.0 --public-origin https://windows.example.com:8787 \
  --cert /path/to/fullchain.pem --key /path/to/private-key.pem \
  --allow-origin https://wieslawsoltes.github.io
```

This is an example configuration, not a deployed service. Certificate provisioning, DNS, identity management and production network controls are not included. Do not disable browser security or certificate validation. Browser local-network access may require permission and differs across browsers. The API and viewer use exact origin allowlists, never wildcard or `null` origins. A reverse proxy must preserve the configured Host and WebSocket upgrades without logging Authorization or WebSocket-ticket headers. Companion access logging is disabled.

`file://Aster.html` cannot pair because its origin is opaque. Serve the standalone edition over localhost/HTTPS instead. Ordinary Aster apps remain usable with no companion.

## Compatibility and limits

Portable Win32 GUI utilities are the primary target. x86 and x64 executable PE headers are accepted; DLLs and kernel drivers cannot be launched as entry points. Console executables may run but this version does not create a terminal for their output. EXE installers can run; after stopping the installer, refresh the library to discover its installed EXEs. No direct `.msi` entry point, arbitrary shell commands/arguments, Winetricks UI or automatic component installer is provided. .NET/HTML runtime auto-install prompts are disabled, so applications requiring missing components may fail.

Each imported package has a persistent prefix and a private desktop. Up to two sessions total, one per package; at most 32 packages. Uploads: 128 MiB. ZIP extraction: 512 MiB and 2,048 entries. Downloads: 128 MiB/file. Executable discovery scans at most 20,000 files and returns at most 256 EXEs. Monitor volume capacity: a running native program can write beyond import limits.

No GPU passthrough, audio streaming, Windows kernel drivers, UWP, anti-cheat support, guaranteed Windows services, DirectX performance guarantee, or seamless per-Win32-window remoting is implemented. The display is a private desktop inside an Aster window. IME, accessibility inside the remote canvas, advanced keyboard layouts and high-DPI behavior need further work. Wine/application compatibility is not universal; passing an original test program does not certify all Windows software.

Resolution is selected at launch (API: 640–1920 × 480–1080), then client-scaled when the Aster window resizes. Stop terminates all Wine processes in that prefix. A normally exited main program may leave other processes; use Stop or idle expiry. Forced host shutdown can leave processes outside normal cleanup on native installations.

## Performance

The native-host approach avoids emulating the entire x86 CPU inside WebAssembly; it does not eliminate Wine API overhead or display latency. Aster's WebGPU shell renderer does **not** accelerate Wine's Xvfb display. This implementation uses software-rendered displays and targets utilities, not GPU-heavy workloads.

The streaming path sends incremental binary RFB updates, uses noVNC's decoder/local cursor, awaits transport writes for backpressure, and never polls full-frame screenshots or base64-encodes the stream. Persistent Wine prefixes avoid initializing the environment on every launch. **Low latency / LAN** selects quality/compression 7/0; **Balanced** 6/2; **Low bandwidth** 3/6. Lower compression trades bandwidth for reduced compression work. Start at 1280×720 with a nearby companion.

The UI reports measured startup time and streamed bytes. Native integration reports cold/warm startup, first-connected display and browser-click-to-Win32-file-save round trips. Those observations include runner/network/polling overhead; they are **not** FPS, pure input latency, a native-Windows comparison, or a speedup benchmark. No universal performance percentage is claimed.

## Verify actual execution

```sh
python -m unittest discover -s tests/windows -p 'test_*.py' -v
# Install MinGW and Playwright Chromium for native integration:
x86_64-w64-mingw32-gcc -O2 -mwindows -static tests/windows/probe.c -o /tmp/aster-probe-x64.exe -luser32 -lgdi32
i686-w64-mingw32-gcc -O2 -mwindows -static tests/windows/probe.c -o /tmp/aster-probe-x86.exe -luser32 -lgdi32
python -m tests.windows.integration --exe /tmp/aster-probe-x64.exe --exe /tmp/aster-probe-x86.exe
```

The **Windows apps — native execution and security** Actions workflow installs Wine/noVNC, compiles both real Windows executables, drives their GUI through Aster/noVNC, verifies a Win32-created output file, reconnects, tests prefix reuse/persistence and stops managed processes. Missing dependencies fail instead of silently skipping. Artifacts contain screenshots, runtime logs, timings and a rebuilt standalone app. Unit tests separately use minimal PE-header and echo fixtures to check validation/authentication, **not** as execution evidence.

See [research](../docs/windows-runtime-research.md) and [security boundaries](../docs/windows-bridge-security.md). No Microsoft binaries, Windows images, license keys or proprietary apps are bundled.
