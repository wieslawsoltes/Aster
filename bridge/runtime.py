"""Native Wine + private X display + incremental VNC transport lifecycle."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from contextlib import suppress
import os
from pathlib import Path
import platform
import secrets
import shutil
import signal
import socket
import time
import uuid

from .storage import Library


def find_wine() -> str | None:
    return shutil.which("wine") or shutil.which("wine64")


@dataclass
class Session:
    id: str
    app_id: str
    entry: str
    width: int
    height: int
    status: str = "starting"
    error: str = ""
    port: int = 0
    started: float = field(default_factory=time.monotonic)
    last_seen: float = field(default_factory=time.monotonic)
    startup_ms: int | None = None
    bytes_out: int = 0
    viewers: int = 0
    processes: list = field(default_factory=list, repr=False)
    env: dict = field(default_factory=dict, repr=False)
    task: asyncio.Task | None = field(default=None, repr=False)
    log: object = field(default=None, repr=False)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    sockets: set = field(default_factory=set, repr=False)

    def public(self) -> dict:
        return {key: getattr(self, key) for key in (
            "id", "app_id", "entry", "width", "height", "status", "error",
            "startup_ms", "bytes_out", "viewers")}


class Runtime:
    def __init__(self, library: Library, max_sessions: int = 2, idle_seconds: int = 180):
        self.library = library
        self.sessions: dict[str, Session] = {}
        self.max_sessions = max_sessions
        self.idle_seconds = idle_seconds
        self._launch_lock = asyncio.Lock()

    def capabilities(self) -> dict:
        dependencies = [name for name in ("Xvfb", "xauth", "x11vnc", "openbox", "wineserver")
                        if not shutil.which(name)]
        if not find_wine():
            dependencies.append("wine")
        native = platform.system() == "Linux" and platform.machine().lower() in ("x86_64", "amd64")
        return {"backend": "wine", "native_x86_64": native, "missing": dependencies,
                "ready": native and not dependencies, "max_sessions": self.max_sessions,
                "idle_seconds": self.idle_seconds, "audio": False, "gpu_passthrough": False,
                "transport": "incremental VNC over authenticated WebSocket"}

    async def launch(self, app_id: str, entry: str, width: int, height: int) -> Session:
        caps = self.capabilities()
        if not caps["ready"]:
            raise ValueError("Use a Linux x86-64 companion with Wine, Xvfb, xauth, openbox and x11vnc. "
                             + "Missing: " + ", ".join(caps["missing"]))
        if type(width) is not int or type(height) is not int or not (640 <= width <= 1920 and 480 <= height <= 1080):
            raise ValueError("Resolution must be 640–1920 by 480–1080")
        self.library.executable(app_id, entry)
        async with self._launch_lock:
            active = [s for s in self.sessions.values() if s.status in ("starting", "running", "stopping")]
            if len(active) >= self.max_sessions:
                raise ValueError("Session limit reached; stop another application first")
            if any(s.app_id == app_id for s in active):
                raise ValueError("This application already has a session; reconnect to it")
            session = Session(uuid.uuid4().hex, app_id, entry, width, height)
            self.sessions[session.id] = session
            for old in list(self.sessions.values())[:-32]:
                if old.status in ("stopped", "failed"):
                    del self.sessions[old.id]
            session.task = asyncio.create_task(self._start(session))
            return session

    async def _spawn(self, session: Session, *args: str):
        proc = await asyncio.create_subprocess_exec(*args, env=session.env,
            stdin=asyncio.subprocess.DEVNULL, stdout=session.log, stderr=session.log,
            start_new_session=True)
        session.processes.append(proc)
        return proc

    async def _command(self, session: Session, *args: str, timeout: int = 60):
        proc = await self._spawn(session, *args)
        code = await asyncio.wait_for(proc.wait(), timeout)
        if code:
            raise RuntimeError(f"{Path(args[0]).name} exited with status {code}; inspect the application log")

    async def _start(self, s: Session) -> None:
        try:
            async with asyncio.timeout(120):
                directory = self.library.directory(s.app_id)
                home = directory / "home"
                home.mkdir(exist_ok=True)
                prefix = directory / "prefix"
                auth = directory / "Xauthority"
                auth.touch(mode=0o600)
                s.log = (directory / "runtime.log").open("wb")
                # No API tokens, cloud credentials, loader variables or original HOME are inherited.
                s.env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(home),
                         "LANG": "C.UTF-8", "WINEPREFIX": str(prefix), "WINEARCH": "win64",
                         "WINEDEBUG": "-all", "WINEDLLOVERRIDES": "mscoree,mshtml=",
                         "XAUTHORITY": str(auth), "XDG_CONFIG_HOME": str(home / ".config")}
                display = None
                for number in secrets.SystemRandom().sample(range(100, 500), 40):
                    if Path(f"/tmp/.X{number}-lock").exists() or Path(f"/tmp/.X11-unix/X{number}").exists():
                        continue
                    display = f":{number}"
                    break
                if display is None:
                    raise RuntimeError("Could not reserve an X display")
                s.env["DISPLAY"] = display
                await self._command(s, "xauth", "-f", str(auth), "add", display,
                                    "MIT-MAGIC-COOKIE-1", secrets.token_hex(16), timeout=5)
                xvfb = await self._spawn(s, "Xvfb", display, "-screen", "0",
                    f"{s.width}x{s.height}x24", "-nolisten", "tcp", "-auth", str(auth), "-noreset")
                for _ in range(100):
                    if xvfb.returncode is not None:
                        raise RuntimeError("X display failed to start")
                    if Path(f"/tmp/.X11-unix/X{display[1:]}").exists():
                        break
                    await asyncio.sleep(.05)
                else:
                    raise RuntimeError("X display timed out")
                await self._spawn(s, "openbox", "--sm-disable")
                ready = directory / "prefix-ready"
                if not ready.exists():
                    await self._command(s, find_wine(), "wineboot", "--init", timeout=90)
                    ready.touch()
                # Removing Z: avoids accidental host browsing; it is NOT native-code isolation.
                (prefix / "dosdevices" / "z:").unlink(missing_ok=True)
                with socket.socket() as probe:
                    probe.bind(("127.0.0.1", 0))
                    s.port = probe.getsockname()[1]
                vnc = await self._spawn(s, "x11vnc", "-display", display, "-auth", str(auth),
                    "-localhost", "-rfbport", str(s.port), "-forever", "-shared", "-nopw",
                    "-noxdamage", "-wait", "16", "-defer", "5", "-quiet")
                for _ in range(100):
                    if vnc.returncode is not None:
                        raise RuntimeError("VNC server failed to start")
                    try:
                        reader, writer = await asyncio.open_connection("127.0.0.1", s.port)
                        try:
                            banner = await asyncio.wait_for(reader.readexactly(12), 2)
                        finally:
                            writer.close()
                            await writer.wait_closed()
                        if not banner.startswith(b"RFB "):
                            raise RuntimeError("Invalid VNC greeting")
                        break
                    except (ConnectionRefusedError, asyncio.IncompleteReadError):
                        await asyncio.sleep(.05)
                else:
                    raise RuntimeError("VNC startup timed out")
                exe = self.library.executable(s.app_id, s.entry)
                winpath = "C:\\" + s.entry.replace("/", "\\")
                # Absolute Win32 path and argv; never shell=True or arbitrary commands.
                proc = await asyncio.create_subprocess_exec(find_wine(), winpath, env=s.env,
                    cwd=str(exe.parent), stdin=asyncio.subprocess.DEVNULL,
                    stdout=s.log, stderr=s.log, start_new_session=True)
                s.processes.append(proc)
                await asyncio.sleep(.25)
                if proc.returncode not in (None, 0):
                    raise RuntimeError(f"Wine could not launch the executable (exit {proc.returncode})")
                s.status = "running"
                s.startup_ms = round((time.monotonic() - s.started) * 1000)
                s.last_seen = time.monotonic()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            s.error = str(error) or type(error).__name__
            await self._cleanup(s)
            s.status = "failed"

    async def _cleanup(self, s: Session) -> None:
        for ws in list(s.sockets):
            await ws.close(code=1001, message=b"Session stopped")
        if s.env and shutil.which("wineserver"):
            with suppress(Exception):
                proc = await asyncio.create_subprocess_exec("wineserver", "-k", env=s.env,
                    stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                await asyncio.wait_for(proc.wait(), 5)
        for proc in reversed(s.processes):
            if proc.returncode is None:
                with suppress(ProcessLookupError):
                    os.killpg(proc.pid, signal.SIGTERM)
        for proc in s.processes:
            try:
                await asyncio.wait_for(proc.wait(), 3)
            except asyncio.TimeoutError:
                with suppress(ProcessLookupError):
                    os.killpg(proc.pid, signal.SIGKILL)
                await proc.wait()
        if s.log:
            s.log.close()
            s.log = None

    async def stop(self, session_id: str) -> None:
        s = self.sessions.get(session_id)
        if s is None:
            raise FileNotFoundError("Session not found")
        async with s.lock:
            if s.status == "stopped":
                return
            s.status = "stopping"
            if s.task and not s.task.done():
                s.task.cancel()
                with suppress(asyncio.CancelledError):
                    await s.task
            await self._cleanup(s)
            s.status = "stopped"

    async def reap(self) -> None:
        now = time.monotonic()
        for s in list(self.sessions.values()):
            if s.status == "running" and not s.viewers and now - s.last_seen > self.idle_seconds:
                await self.stop(s.id)

    async def close(self) -> None:
        await asyncio.gather(*(self.stop(s.id) for s in list(self.sessions.values())), return_exceptions=True)
