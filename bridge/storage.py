"""Bounded package import and confined file access. Wine is NOT a sandbox."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import struct
import uuid
import zipfile

MAX_UPLOAD = 128 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024
MAX_FILES = 2048
ID_RE = re.compile(r"^[0-9a-f]{32}$")


def safe_path(root: Path, relative: str = "") -> Path:
    """Refuse traversal, Windows alternate streams, and every symlink component."""
    if not isinstance(relative, str) or "\\" in relative or ":" in relative or "\x00" in relative:
        raise ValueError("Invalid relative path")
    p = PurePosixPath(relative)
    if p.is_absolute() or ".." in p.parts:
        raise ValueError("Path must stay inside this application's C: drive")
    root = root.resolve()
    candidate = root
    for part in p.parts:
        candidate /= part
        if candidate.is_symlink():
            raise ValueError("Symbolic links are not exposed by the bridge")
    if not candidate.resolve().is_relative_to(root):
        raise ValueError("Path escapes the application")
    return candidate


def inspect_pe(path: Path) -> dict:
    """Identify an executable PE32/PE32+ (not a DLL, driver, ELF or script)."""
    with path.open("rb") as file:
        dos = file.read(64)
        if len(dos) != 64 or dos[:2] != b"MZ":
            raise ValueError("Not a Windows PE executable (missing MZ header)")
        offset = struct.unpack_from("<I", dos, 60)[0]
        if not 64 <= offset <= 1024 * 1024:
            raise ValueError("Invalid PE header offset")
        file.seek(offset)
        header = file.read(96)
    if len(header) < 96 or header[:4] != b"PE\0\0":
        raise ValueError("Invalid or truncated PE header")
    machine, sections = struct.unpack_from("<HH", header, 4)
    optional_size, flags, magic = struct.unpack_from("<HHH", header, 20)
    subsystem = struct.unpack_from("<H", header, 24 + 68)[0]
    if machine not in (0x14C, 0x8664):
        raise ValueError("This companion supports x86/x64 executables, not ARM binaries")
    if magic != (0x10B if machine == 0x14C else 0x20B) or optional_size < 72 or not sections:
        raise ValueError("Inconsistent PE executable headers")
    if not flags & 2 or flags & 0x2000 or subsystem not in (2, 3):
        raise ValueError("DLLs and kernel drivers cannot be launched as applications")
    return {"architecture": "x64" if machine == 0x8664 else "x86",
            "subsystem": "gui" if subsystem == 2 else "console"}


class Library:
    def __init__(self, data: Path):
        self.root = data.resolve() / "apps"
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def directory(self, app_id: str) -> Path:
        if not isinstance(app_id, str) or not ID_RE.fullmatch(app_id):
            raise ValueError("Invalid application ID")
        path = self.root / app_id
        if path.is_symlink():
            raise ValueError("Invalid application directory")
        return path

    def drive(self, app_id: str) -> Path:
        self.get(app_id)
        return self.directory(app_id) / "prefix" / "drive_c"

    def get(self, app_id: str) -> dict:
        path = self.directory(app_id) / "app.json"
        if not path.is_file():
            raise FileNotFoundError("Application not found")
        return json.loads(path.read_text())

    def all(self) -> list[dict]:
        result = []
        for path in sorted(self.root.glob("*/app.json")):
            if ID_RE.fullmatch(path.parent.name) and not path.parent.is_symlink():
                result.append(self.get(path.parent.name))
        return result

    def import_package(self, source: Path, filename: str) -> dict:
        if (not filename or len(filename) > 160 or filename != PurePosixPath(filename).name
                or any(c in filename for c in '\\:\x00') or any(ord(c) < 32 for c in filename)):
            raise ValueError("Invalid package filename")
        suffix = Path(filename).suffix.lower()
        if suffix not in (".exe", ".zip"):
            raise ValueError("Choose a Windows .exe or a .zip containing a portable application")
        if source.stat().st_size > MAX_UPLOAD:
            raise ValueError("The upload limit is 128 MiB")
        if len(self.all()) >= 32:
            raise ValueError("Library limit reached (32 applications); remove an application first")
        app_id = uuid.uuid4().hex
        directory = self.directory(app_id)
        package = directory / "prefix" / "drive_c" / "Aster" / "Package"
        package.mkdir(parents=True, mode=0o700)
        try:
            if suffix == ".exe":
                inspect_pe(source)
                shutil.copyfile(source, package / filename)
            else:
                self._unzip(source, package)
            entries = self._entries(directory / "prefix" / "drive_c")
            if not entries:
                raise ValueError("The package contains no supported Windows executable")
            with source.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            info = {"id": app_id, "name": filename, "sha256": digest,
                    "bytes": source.stat().st_size, "entries": entries}
            (directory / "app.json").write_text(json.dumps(info, indent=2) + "\n")
            return info
        except BaseException:
            shutil.rmtree(directory, ignore_errors=True)
            raise

    @staticmethod
    def _unzip(source: Path, target: Path) -> None:
        with zipfile.ZipFile(source) as archive:
            members = archive.infolist()
            if len(members) > MAX_FILES or sum(m.file_size for m in members) > MAX_EXPANDED:
                raise ValueError("Archive exceeds 2,048 entries or 512 MiB expanded")
            seen = set()
            for member in members:
                path = safe_path(target, member.filename)
                key = member.filename.casefold().rstrip("/")
                if key in seen:
                    raise ValueError("Duplicate/case-colliding archive paths")
                seen.add(key)
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                    raise ValueError("Archive links and special files are forbidden")
                if member.flag_bits & 1:
                    raise ValueError("Encrypted archives are not supported")
                if member.is_dir():
                    path.mkdir(parents=True, exist_ok=True)
                else:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    written = 0
                    with archive.open(member) as src, path.open("xb") as dst:
                        while chunk := src.read(1024 * 1024):
                            written += len(chunk)
                            if written > member.file_size or written > MAX_EXPANDED:
                                raise ValueError("Archive expanded beyond its declared size")
                            dst.write(chunk)

    @staticmethod
    def _entries(drive: Path) -> list[dict]:
        entries = []
        visited = 0
        for base, dirs, files in os.walk(drive, followlinks=False):
            dirs[:] = [d for d in dirs if not (Path(base) / d).is_symlink()
                       and not (Path(base) == drive and d.lower() == "windows")]
            for name in files:
                visited += 1
                if visited > 20000 or len(entries) >= 256:
                    return entries
                path = Path(base) / name
                if path.suffix.lower() != ".exe" or path.is_symlink():
                    continue
                try:
                    entries.append({"path": path.relative_to(drive).as_posix(), **inspect_pe(path)})
                except (OSError, ValueError):
                    continue
        return sorted(entries, key=lambda item: item["path"].casefold())

    def entries(self, app_id: str) -> list[dict]:
        return self._entries(self.drive(app_id))

    def executable(self, app_id: str, entry: str) -> Path:
        path = safe_path(self.drive(app_id), entry)
        if path.suffix.lower() != ".exe":
            raise ValueError("Only .exe entry points may be launched")
        inspect_pe(path)
        return path

    def files(self, app_id: str, relative: str) -> list[dict]:
        drive = self.drive(app_id)
        path = safe_path(drive, relative)
        if not path.is_dir():
            raise FileNotFoundError("Folder not found")
        result = []
        for item in sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.casefold())):
            if item.is_symlink():
                continue
            result.append({"name": item.name, "path": item.relative_to(drive).as_posix(),
                           "directory": item.is_dir(), "bytes": item.stat().st_size if item.is_file() else 0})
            if len(result) >= 1000:
                break
        return result

    def delete(self, app_id: str) -> None:
        self.get(app_id)
        shutil.rmtree(self.directory(app_id))
