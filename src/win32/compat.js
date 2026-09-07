/* Browser-only Win32 compatibility for ordinary console binaries.
 * The guest owns a bounded virtual process: no host process, network, registry,
 * filesystem, thread, or privilege is exposed. Unsupported paths fail closed.
 * See docs/browser-win32.md for the intentionally incomplete ABI. MIT.
 */
'use strict';
(() => {
const W = globalThis.AsterWin32;
const INVALID = 0xffffffff, HEAP = 0x60000001;
const STDIN = 0xfffffff6, STDOUT = 0xfffffff5, STDERR = 0xfffffff4;
const FILE_LIMIT = 8 * 1024 * 1024;
const EPOCH = 116444736000000000n;

// Microsoft C argv quoting rules (not a command shell; no expansion/execution).
function splitCommandLine(text) {
    const out = []; let i = 0;
    while (i < text.length) {
        while (/\s/.test(text[i] || '') && i < text.length) i++;
        if (i === text.length) break;
        let word = '', quoted = false;
        while (i < text.length && (quoted || !/\s/.test(text[i]))) {
            let slashes = 0; while (text[i] === '\\') { slashes++; i++; }
            if (text[i] === '"') {
                word += '\\'.repeat(slashes >> 1);
                if (slashes & 1) { word += '"'; i++; }
                else if (quoted && text[i + 1] === '"') { word += '"'; i += 2; }
                else { quoted = !quoted; i++; }
            } else { word += '\\'.repeat(slashes); if (i < text.length) word += text[i++]; }
        }
        out.push(word);
    }
    return out;
}

function installCompat(rt) {
    const m = rt.mem, c = rt.cpu;
    const reg = (dll, name, n, fn, cdecl = false) => rt.register(dll, name, n, fn, cdecl);
    const k = (name, n, fn) => reg('kernel32.dll', name, n, fn);
    const crt = (name, n, fn) => reg('msvcrt.dll', name, n, fn, true);
    const pair = (register, name, n, fn) => { register(name + 'A', n, (...a) => fn(false, ...a)); register(name + 'W', n, (...a) => fn(true, ...a)); };
    const fail = (code, result = 0) => { rt.lastError = code; return result; };
    const data = (name, create) => rt.dataImports.set('msvcrt.dll!' + name, {create});
    const unsupported = (dll, name, n, why, cdecl = false) => {
        reg(dll, name, n, () => { throw Error(why); }, cdecl);
        rt.apis.get(dll + '!' + name).unsupported = why;
    };
    const state = rt.compat = { cwd: '', dirs: new Set(['', 'temp']), attrs: new Map(), times: new Map(),
        heaps: new Map([[HEAP, new Set()]]), virtual: new Map(), tls: new Map(), critical: new Map(),
        env: new Map([['PATH', 'C:\\'], ['TEMP', 'C:\\temp'], ['TMP', 'C:\\temp'], ['COMSPEC', '']]),
        atexit: [], stdin: new TextEncoder().encode(String(rt.options.stdin || '')), stdinOffset: 0,
        streams: new Map(), fds: new Map([[0, STDIN], [1, STDOUT], [2, STDERR]]), nextFD: 3, globals: new Map(), fpuControl: 0x9001f };
    const global = (name, value = 0) => {
        if (!state.globals.has(name)) { const p = m.alloc(4); m.w32(p, value); state.globals.set(name, p); }
        return state.globals.get(name);
    };
    const alloc = (n, zero = false) => { try { return m.alloc(n, zero); } catch { return fail(8); } };
    const realloc = (p, n, zero = false) => {
        if (!p) return alloc(n, zero);
        const old = m.allocations.get(p); if (!old) return fail(87);
        if (!n) { m.free(p); return 0; }
        if (n <= old) return p;
        const to = alloc(n, zero); if (!to) return 0;
        m.copy(to, m.bytes.subarray(p, p + old)); m.free(p); return to;
    };
    const winpath = path => 'C:\\' + path.replace(/\//g, '\\');
    const filePath = text => {
        text = String(text).replace(/\\/g, '/');
        if (/^\/\/\?\/c:(?:\/|$)/i.test(text)) text = text.slice(4); // Extended-length syntax, still only the private C: drive.
        if (text === '.' || text === './') return state.cwd;
        if (text === '/' || /^c:\/?$/i.test(text)) return '';
        // Preserve the existing strict traversal/device checks. No host paths.
        return rt.path(!/^(?:[a-z]:|\/)/i.test(text) && state.cwd ? state.cwd + '/' + text : text);
    };
    rt.filePath = filePath;
    const parent = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const namePart = path => path.slice(path.lastIndexOf('/') + 1);
    const dirExists = path => state.dirs.has(path) || [...rt.files.keys()].some(p => p.startsWith(path ? path + '/' : ''));
    const exists = path => rt.files.has(path) || dirExists(path);
    const attributes = path => dirExists(path) ? 16 : rt.files.has(path) ? (state.attrs.get(path) || 32) : INVALID;
    const getFile = h => { const f = rt.handles.get(h); return f?.type === 'file' ? f : null; };
    const time = path => state.times.get(path) || {creation: EPOCH + 10000n * BigInt(Date.UTC(2020, 0, 1)), access: EPOCH + 10000n * BigInt(Date.UTC(2020, 0, 1)), write: EPOCH + 10000n * BigInt(Date.UTC(2020, 0, 1))};
    const read64 = p => BigInt(m.u32(p)) | (BigInt(m.u32(p + 4)) << 32n);
    const write64 = (p, value) => { const n = BigInt.asUintN(64, BigInt(value)); m.w32(p, Number(n & 0xffffffffn)); m.w32(p + 4, Number(n >> 32n)); };
    const changed = path => { const t = time(path); state.times.set(path, {...t, write: EPOCH + BigInt(Date.now()) * 10000n}); rt.changed(path); };
    const readBytes = (h, n) => {
        if (n > FILE_LIMIT) throw Error('Read exceeds guest file budget');
        if (h === STDIN) { const b = state.stdin.slice(state.stdinOffset, state.stdinOffset + n); state.stdinOffset += b.length; return b; }
        const f = getFile(h); if (!f) { fail(6); return null; }
        if (!(f.access & 0x80000000)) { fail(5); return null; }
        const content = rt.files.get(f.path); if (!content) { fail(2); return null; }
        const b = content.slice(f.offset, f.offset + n); f.offset += b.length; return b;
    };
    const writeBytes = (h, b) => {
        if (b.length > FILE_LIMIT) throw Error('Write exceeds guest file budget');
        if (h === STDOUT || h === STDERR) { rt.log(m.decoder.decode(b)); return b.length; }
        const f = getFile(h); if (!f) return fail(6, -1);
        if (!(f.access & 0x40000000)) return fail(5, -1);
        const old = rt.files.get(f.path); if (!old) return fail(2, -1);
        if (f.offset + b.length > FILE_LIMIT) return fail(112, -1);
        const next = new Uint8Array(Math.max(old.length, f.offset + b.length)); next.set(old); next.set(b, f.offset);
        rt.addFile(f.path, next); f.offset += b.length; changed(f.path); return b.length;
    };
    const openFile = (path, access, disposition, flags = 0, share = 7) => {
        if (flags & (0x40000000 | 0x04000000)) throw Error('Overlapped and delete-on-close files are not implemented');
        if (![1, 2, 3, 4, 5].includes(disposition)) return fail(87, INVALID);
        if (dirExists(path)) return fail(5, INVALID);
        if (!dirExists(parent(path))) return fail(3, INVALID);
        const was = rt.files.has(path);
        if (was && disposition === 1) return fail(80, INVALID);
        if (!was && [3, 5].includes(disposition)) return fail(2, INVALID);
        if ([2, 5].includes(disposition) && !(access & 0x40000000)) return fail(5, INVALID);
        if (was && (state.attrs.get(path) & 1) && (access & 0x40000000)) return fail(5, INVALID);
        for (const f of rt.handles.values()) if (f.type === 'file' && f.path === path) {
            if (((access & 0x80000000) && !(f.share & 1)) || ((access & 0x40000000) && !(f.share & 2)) || ((f.access & 0x80000000) && !(share & 1)) || ((f.access & 0x40000000) && !(share & 2))) return fail(32, INVALID);
        }
        if (!was || [2, 5].includes(disposition)) { rt.addFile(path, new Uint8Array()); changed(path); }
        rt.lastError = was && [2, 4].includes(disposition) ? 183 : 0;
        return rt.handle({type: 'file', path, access, offset: 0, share});
    };
    const close = h => {
        if ([STDIN, STDOUT, STDERR].includes(h)) return 1;
        const value = rt.handles.get(h); if (!value || !['file', 'event', 'semaphore', 'mutex'].includes(value.type)) return fail(6);
        rt.handles.delete(h); return 1;
    };
    const seek = (h, displacement, method) => {
        const f = getFile(h); if (!f) return fail(6, INVALID);
        if (method > 2) return fail(87, INVALID);
        const offset = (method === 0 ? 0 : method === 1 ? f.offset : rt.files.get(f.path).length) + displacement;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > FILE_LIMIT) return fail(131, INVALID);
        f.offset = offset; rt.lastError = 0; return offset;
    };

    // Handles, synchronous files, private directory tree and enumeration.
    pair(k, 'CreateFile', 7, (wide, p, access, share, security, disposition, flags, template) => {
        if (template || security) throw Error('File security/template handles are not implemented');
        return openFile(filePath(m.string(p, wide)), access, disposition, flags, share);
    });
    k('CloseHandle', 1, close);
    k('ReadFile', 5, (h, p, n, count, overlap) => { if (overlap) throw Error('Overlapped I/O unsupported'); if (count) m.w32(count, 0); m.check(p, n); const b = readBytes(h, n); if (!b) return 0; m.copy(p, b); if (count) m.w32(count, b.length); return 1; });
    k('WriteFile', 5, (h, p, n, count, overlap) => { if (overlap) throw Error('Overlapped I/O unsupported'); if (count) m.w32(count, 0); m.check(p, n); const size = writeBytes(h, m.bytes.subarray(p, p + n)); if (size < 0) return 0; if (count) m.w32(count, size); return 1; });
    k('SetFilePointer', 4, (h, low, high, method) => { const n = high ? Number(BigInt.asIntN(64, BigInt(low) | (BigInt(m.u32(high)) << 32n))) : low | 0; const out = seek(h, n, method); if (out !== INVALID && high) m.w32(high, 0); return out; });
    k('SetFilePointerEx', 5, (h, low, high, output, method) => { const n = Number(BigInt.asIntN(64, BigInt(low) | (BigInt(high) << 32n))), out = seek(h, n, method); if (out === INVALID) return 0; if (output) write64(output, out); return 1; });
    k('SetEndOfFile', 1, h => { const f = getFile(h); if (!f) return fail(6); if (!(f.access & 0x40000000)) return fail(5); const b = new Uint8Array(f.offset); b.set(rt.files.get(f.path).subarray(0, b.length)); rt.addFile(f.path, b); changed(f.path); return 1; });
    k('GetFileSize', 2, (h, high) => { const f = getFile(h); if (!f) return fail(6, INVALID); if (high) m.w32(high, 0); return rt.files.get(f.path).length; });
    k('GetFileSizeEx', 2, (h, p) => { const f = getFile(h); if (!f) return fail(6); write64(p, rt.files.get(f.path).length); return 1; });
    k('FlushFileBuffers', 1, h => getFile(h) ? 1 : fail(6)); // Writes already update the private drive; persistence ACK belongs to the browser transport.
    k('GetFileType', 1, h => [STDIN, STDOUT, STDERR].includes(h) ? 2 : getFile(h) ? 1 : fail(6));
    k('GetFileInformationByHandle', 2, (h, p) => { const f = getFile(h); if (!f) return fail(6); const t = time(f.path); m.zero(p, 52); m.w32(p, attributes(f.path)); write64(p + 4, t.creation); write64(p + 12, t.access); write64(p + 20, t.write); m.w32(p + 28, 1); m.w32(p + 36, rt.files.get(f.path).length); m.w32(p + 40, 1); m.w32(p + 48, [...rt.files.keys()].indexOf(f.path) + 1); return 1; });
    k('GetFileTime', 4, (h, creation, access, write) => { const f = getFile(h); if (!f) return fail(6); const t = time(f.path); if (creation) write64(creation, t.creation); if (access) write64(access, t.access); if (write) write64(write, t.write); return 1; });
    k('SetFileTime', 4, (h, creation, access, write) => { const f = getFile(h); if (!f) return fail(6); const t = {...time(f.path)}; for (const [name, p] of [['creation', creation], ['access', access], ['write', write]]) if (p && read64(p) !== 0xffffffffffffffffn) t[name] = read64(p); state.times.set(f.path, t); return 1; });
    pair(k, 'GetFileAttributes', 1, (wide, p) => { const a = attributes(filePath(m.string(p, wide))); return a === INVALID ? fail(2, INVALID) : a; });
    pair(k, 'SetFileAttributes', 2, (wide, p, flags) => { const path = filePath(m.string(p, wide)); if (!exists(path)) return fail(2); // Preserve supported DOS attributes; filesystem-specific/high Unix mode bits have no meaning on this private drive.
        state.attrs.set(path, flags & (1 | 2 | 4 | 32 | 256 | 8192) || 128); return 1; });
    pair(k, 'GetFileAttributesEx', 3, (wide, p, level, info) => { if (level) return fail(87); const path = filePath(m.string(p, wide)), a = attributes(path); if (a === INVALID) return fail(2); const t = time(path); m.zero(info, 36); m.w32(info, a); write64(info + 4, t.creation); write64(info + 12, t.access); write64(info + 20, t.write); m.w32(info + 32, rt.files.get(path)?.length || 0); return 1; });
    pair(k, 'CreateDirectory', 2, (wide, p, security) => { if (security) throw Error('Directory security unsupported'); const path = filePath(m.string(p, wide)); if (exists(path)) return fail(183); if (!dirExists(parent(path))) return fail(3); if (state.dirs.size >= 256) throw Error('Directory quota exceeded'); state.dirs.add(path); return 1; });
    pair(k, 'RemoveDirectory', 1, (wide, p) => { const path = filePath(m.string(p, wide)); if (!path || path === state.cwd) return fail(5); if (!dirExists(path)) return fail(3); if ([...rt.files.keys(), ...state.dirs].some(q => q.startsWith(path + '/'))) return fail(145); state.dirs.delete(path); return 1; });
    pair(k, 'DeleteFile', 1, (wide, p) => { const path = filePath(m.string(p, wide)); if (!rt.files.has(path)) return fail(2); if (state.attrs.get(path) & 1) return fail(5); if ([...rt.handles.values()].some(f => f.type === 'file' && f.path === path && !(f.share & 4))) return fail(32); rt.files.delete(path); changed(path); return 1; });
    const move = (from, to, replace) => {
        if (!rt.files.has(from)) return fail(2); if (!dirExists(parent(to))) return fail(3); if (exists(to) && !replace) return fail(183);
        for (const f of rt.handles.values()) if (f.type === 'file' && (f.path === from || f.path === to) && !(f.share & 4)) return fail(32);
        rt.addFile(to, rt.files.get(from)); rt.files.delete(from); changed(from); changed(to); for (const f of rt.handles.values()) if (f.type === 'file' && f.path === from) f.path = to; return 1;
    };
    pair(k, 'MoveFile', 2, (wide, from, to) => move(filePath(m.string(from, wide)), filePath(m.string(to, wide)), false));
    pair(k, 'MoveFileEx', 3, (wide, from, to, flags) => { if (flags & ~9) return fail(50); return move(filePath(m.string(from, wide)), filePath(m.string(to, wide)), !!(flags & 1)); });
    pair(k, 'MoveFileWithProgress', 5, (wide, from, to, callback, param, flags) => { if (callback || flags & ~9) return fail(50); return move(filePath(m.string(from, wide)), filePath(m.string(to, wide)), !!(flags & 1)); });
    pair(k, 'CopyFile', 3, (wide, from, to, noReplace) => { const a = filePath(m.string(from, wide)), b = filePath(m.string(to, wide)); if (!rt.files.has(a)) return fail(2); if (exists(b) && noReplace) return fail(80); if (!dirExists(parent(b))) return fail(3); rt.addFile(b, rt.files.get(a)); changed(b); return 1; });
    pair(k, 'CreateHardLink', 3, () => fail(50)); // No hard links in this private drive.
    pair(k, 'SetCurrentDirectory', 1, (wide, p) => { const path = filePath(m.string(p, wide)); if (!dirExists(path)) return fail(3); state.cwd = path; return 1; });
    const copyWinString = (p, n, text, wide) => { if (text.length + 1 > n) return text.length + 1; m.putString(p, text, wide, n); return text.length; };
    pair(k, 'GetCurrentDirectory', 2, (wide, n, p) => copyWinString(p, n, winpath(state.cwd), wide));
    pair(k, 'GetFullPathName', 4, (wide, p, n, out, part) => { const text = winpath(filePath(m.string(p, wide))), result = copyWinString(out, n, text, wide); if (result < n && part) m.w32(part, out + (text.lastIndexOf('\\') + 1) * (wide ? 2 : 1)); return result; });
    pair(k, 'GetTempPath', 2, (wide, n, p) => copyWinString(p, n, 'C:\\temp\\', wide));
    pair(k, 'GetLogicalDriveStrings', 2, (wide, n, p) => { if (n < 5) return 5; m.putString(p, 'C:\\\0', wide, 5); return 4; });
    k('GetLogicalDrives', 0, () => 4); pair(k, 'GetDriveType', 1, () => 3);
    const enumFiles = pattern => {
        pattern = String(pattern).replace(/\\/g, '/'); const cut = pattern.lastIndexOf('/');
        const dir = cut < 0 ? state.cwd : filePath(pattern.slice(0, cut) || '/'); let glob = cut < 0 ? pattern : pattern.slice(cut + 1);
        if (!dirExists(dir)) return [];
        if (glob === '*.*') glob = '*'; if (!glob || glob.length > 260 || /[^\x20-\uffff]/.test(glob)) throw Error('Invalid search pattern');
        const expression = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
        const paths = new Set([...state.dirs, ...rt.files.keys()]); for (const path of rt.files.keys()) { let q = parent(path); while (q) { paths.add(q); q = parent(q); } }
        return [...paths].filter(path => path && parent(path) === dir && expression.test(namePart(path))).sort();
    };
    const findData = (p, path, wide) => { const t = time(path); m.zero(p, wide ? 592 : 320); m.w32(p, attributes(path)); write64(p + 4, t.creation); write64(p + 12, t.access); write64(p + 20, t.write); m.w32(p + 32, rt.files.get(path)?.length || 0); m.putString(p + 44, namePart(path), wide, 260); };
    pair(k, 'FindFirstFile', 2, (wide, p, out) => { const paths = enumFiles(m.string(p, wide)); if (!paths.length) return fail(2, INVALID); findData(out, paths[0], wide); return rt.handle({type: 'find', paths, index: 1, wide}); });
    pair(k, 'FindNextFile', 2, (wide, h, out) => { const f = rt.handles.get(h); if (f?.type !== 'find') return fail(6); if (f.index >= f.paths.length) return fail(18); findData(out, f.paths[f.index++], wide); return 1; });
    k('FindClose', 1, h => { if (rt.handles.get(h)?.type !== 'find') return fail(6); rt.handles.delete(h); return 1; });
    pair(k, 'GetDiskFreeSpace', 5, (wide, path, sectors, size, free, total) => { const used = [...rt.files.values()].reduce((n, b) => n + b.length, 0); if (sectors) m.w32(sectors, 1); if (size) m.w32(size, 4096); if (free) m.w32(free, Math.floor((32 * 1024 * 1024 - used) / 4096)); if (total) m.w32(total, 8192); return 1; });
    pair(k, 'GetDiskFreeSpaceEx', 4, (wide, path, available, total, free) => { const used = [...rt.files.values()].reduce((n, b) => n + b.length, 0); if (available) write64(available, 32 * 1024 * 1024 - used); if (total) write64(total, 32 * 1024 * 1024); if (free) write64(free, 32 * 1024 * 1024 - used); return 1; });

    // One logical CPU and thread. Locks/TLS work only in this single-thread model.
    k('GetCurrentProcess', 0, () => INVALID); k('GetCurrentThread', 0, () => 0xfffffffe);
    k('GetVersion', 0, () => 0x0a); pair(k, 'GetVersionEx', 1, (wide, p) => { const size = m.u32(p); if (size < 20 || size > 284) return fail(87); m.zero(p + 4, size - 4); m.w32(p + 4, 10); m.w32(p + 12, 19045); m.w32(p + 16, 2); return 1; });
    k('GetSystemInfo', 1, p => { m.zero(p, 36); m.w16(p, 0); m.w32(p + 4, 4096); m.w32(p + 8, 0x10000); m.w32(p + 12, 0x3bfffff); m.w32(p + 16, 1); m.w32(p + 20, 1); m.w32(p + 24, 586); m.w32(p + 28, 65536); m.w16(p + 32, 5); });
    k('GlobalMemoryStatus', 1, p => { const available = Math.max(0, 0x3c00000 - m.next); [32, Math.round(100 * (1 - available / 0x3c00000)), 64 * 1024 * 1024, available, 64 * 1024 * 1024, available, 64 * 1024 * 1024, available].forEach((v, i) => m.w32(p + i * 4, v)); });
    k('GlobalMemoryStatusEx', 1, p => { if (m.u32(p) !== 64) return fail(87); const available = Math.max(0, 0x3c00000 - m.next); m.w32(p + 4, Math.round(100 * (1 - available / 0x3c00000))); [64 * 1024 * 1024, available, 64 * 1024 * 1024, available, 64 * 1024 * 1024, available, 0].forEach((n, i) => write64(p + 8 + i * 8, n)); return 1; });
    k('IsProcessorFeaturePresent', 1, () => 0); // Optional SIMD/crypto instructions are not advertised.
    k('GetProcessAffinityMask', 3, (h, process, system) => { if (h !== INVALID) return fail(6); m.w32(process, 1); m.w32(system, 1); return 1; });
    k('SetProcessAffinityMask', 2, (h, mask) => h === INVALID && mask === 1 ? 1 : fail(87));
    k('SetThreadAffinityMask', 2, (h, mask) => h === 0xfffffffe && mask === 1 ? 1 : fail(87));
    k('GetProcessTimes', 5, (h, creation, exit, kernel, user) => { if (h !== INVALID) return fail(6); write64(creation, EPOCH + BigInt(Date.now() - Math.floor(performance.now() - rt.started)) * 10000n); write64(exit, 0); write64(kernel, 0); write64(user, BigInt(Math.floor((performance.now() - rt.started) * 10000))); return 1; });
    const initCritical = p => { m.zero(p, 24); m.w32(p + 4, INVALID); state.critical.set(p, 0); };
    k('InitializeCriticalSection', 1, initCritical);
    k('InitializeCriticalSectionAndSpinCount', 2, (p, spin) => { initCritical(p); m.w32(p + 20, spin); return 1; });
    k('EnterCriticalSection', 1, p => { if (!state.critical.has(p)) throw Error('Uninitialized critical section'); const count = state.critical.get(p) + 1; state.critical.set(p, count); m.w32(p + 4, count - 1); m.w32(p + 8, count); m.w32(p + 12, 1); });
    k('LeaveCriticalSection', 1, p => { const count = state.critical.get(p); if (!count) throw Error('Unbalanced critical section'); state.critical.set(p, count - 1); m.w32(p + 4, count - 2); m.w32(p + 8, count - 1); m.w32(p + 12, count > 1 ? 1 : 0); });
    k('DeleteCriticalSection', 1, p => { if (state.critical.get(p)) throw Error('Deleting an owned critical section'); state.critical.delete(p); });
    k('InterlockedIncrement', 1, p => { const n = (m.u32(p) + 1) >>> 0; m.w32(p, n); return n; });
    k('InterlockedDecrement', 1, p => { const n = (m.u32(p) - 1) >>> 0; m.w32(p, n); return n; });
    k('InterlockedExchange', 2, (p, n) => { const old = m.u32(p); m.w32(p, n); return old; });
    k('TlsAlloc', 0, () => { for (let i = 0; i < 1088; i++) if (!state.tls.has(i)) { state.tls.set(i, 0); return i; } return fail(8, INVALID); });
    k('TlsGetValue', 1, index => { if (!state.tls.has(index)) return fail(87); rt.lastError = 0; return state.tls.get(index); });
    k('TlsSetValue', 2, (index, value) => { if (!state.tls.has(index)) return fail(87); state.tls.set(index, value); return 1; });
    k('TlsFree', 1, index => state.tls.delete(index) ? 1 : fail(87));
    pair(k, 'CreateEvent', 4, (wide, security, manual, initial, name) => { if (security || name) return fail(50); return rt.handle({type: 'event', manual: !!manual, signaled: !!initial}); });
    pair(k, 'OpenEvent', 3, () => fail(2));
    k('SetEvent', 1, h => { const e = rt.handles.get(h); if (e?.type !== 'event') return fail(6); e.signaled = true; return 1; });
    k('ResetEvent', 1, h => { const e = rt.handles.get(h); if (e?.type !== 'event') return fail(6); e.signaled = false; return 1; });
    pair(k, 'CreateSemaphore', 4, (wide, security, initial, max, name) => { if (security || name) return fail(50); if (!max || initial > max) return fail(87); return rt.handle({type: 'semaphore', count: initial, max}); });
    k('ReleaseSemaphore', 3, (h, n, previous) => { const s = rt.handles.get(h); if (s?.type !== 'semaphore') return fail(6); if (!n || s.count + n > s.max) return fail(298); if (previous) m.w32(previous, s.count); s.count += n; return 1; });
    k('WaitForSingleObject', 2, async (h, timeout) => { const obj = rt.handles.get(h); if (!obj || !['event', 'semaphore'].includes(obj.type)) return fail(6, INVALID); if (obj.type === 'event' && obj.signaled) { if (!obj.manual) obj.signaled = false; return 0; } if (obj.type === 'semaphore' && obj.count) { obj.count--; return 0; } if (timeout === INVALID) throw Error('Cannot wait indefinitely on an unsignaled object in a single-thread guest'); if (timeout > 60000) throw Error('Wait exceeds guest time limit'); if (timeout) await new Promise(r => setTimeout(r, timeout)); return 258; });
    for (const [name, n] of [['CreateThread', 6], ['ResumeThread', 1], ['SuspendThread', 1]]) unsupported('kernel32.dll', name, n, 'Guest threads are not implemented; use a single-threaded program');

    // The emulator's heap is distinct from the browser/host heap.
    k('HeapCreate', 3, (flags, initial, max) => { if (flags & ~0x40001 || initial > 16 * 1024 * 1024 || max > 32 * 1024 * 1024) return fail(8); const h = rt.handle({type: 'heap'}); state.heaps.set(h, new Set()); return h; });
    k('HeapAlloc', 3, (h, flags, n) => { if (!state.heaps.has(h) || flags & ~9) return fail(87); const p = alloc(n, !!(flags & 8)); if (p) state.heaps.get(h).add(p); return p; });
    k('HeapFree', 3, (h, flags, p) => { const set = state.heaps.get(h); if (!set || (p && !set.has(p))) return fail(87); if (!m.free(p)) return fail(87); set.delete(p); return 1; });
    k('HeapSize', 3, (h, flags, p) => state.heaps.get(h)?.has(p) ? m.allocations.get(p) : fail(87, INVALID));
    k('HeapReAlloc', 4, (h, flags, p, n) => { const set = state.heaps.get(h); if (!set?.has(p)) return fail(87); if (flags & 16 && n > m.allocations.get(p)) return fail(8); const to = realloc(p, n || 1, !!(flags & 8)); if (to) { set.delete(p); set.add(to); } return to; });
    k('HeapDestroy', 1, h => { if (h === HEAP || !state.heaps.has(h)) return fail(87); for (const p of state.heaps.get(h)) m.free(p); state.heaps.delete(h); rt.handles.delete(h); return 1; });
    k('HeapValidate', 3, (h, flags, p) => state.heaps.has(h) && (!p || state.heaps.get(h).has(p)) ? 1 : fail(87));
    k('VirtualAlloc', 4, (address, n, type, protection) => {
        if (!n || n > 16 * 1024 * 1024 || type & ~0x3000 || !(type & 0x3000) || ![2, 4, 0x20, 0x40].includes(protection)) return fail(87);
        if (address) { const entry = state.virtual.get(address); if (!entry || n > entry.n || !(type & 0x1000)) return fail(487); return address; }
        const raw = alloc(Math.ceil(n / 4096) * 4096 + 65536, true); if (!raw) return 0; const p = Math.ceil(raw / 65536) * 65536;
        state.virtual.set(p, {raw, n: Math.ceil(n / 4096) * 4096, protection}); if (protection & 0x60) c.mark_executable(p, n); return p;
    });
    k('VirtualFree', 3, (p, n, type) => { const entry = state.virtual.get(p); if (!entry) return fail(487); if (type === 0x4000 && n <= entry.n) { m.zero(p, n || entry.n); return 1; } if (type !== 0x8000 || n) return fail(87); m.free(entry.raw); state.virtual.delete(p); return 1; });
    k('VirtualProtect', 4, (p, n, protect, old) => { const entry = [...state.virtual.entries()].find(([start, v]) => p >= start && p + n <= start + v.n); if (!entry || ![2, 4, 0x20, 0x40].includes(protect)) return fail(487); m.w32(old, entry[1].protection); entry[1].protection = protect; if (protect & 0x60) c.mark_executable(p, n); return 1; });

    // Module handles name only this original facade. No arbitrary DLL loading.
    const modules = ['kernel32.dll', 'user32.dll', 'gdi32.dll', 'msvcrt.dll', 'advapi32.dll', 'oleaut32.dll'];
    const moduleFor = h => modules[(h - 0xe0000000) / 65536];
    pair(k, 'GetModuleHandle', 1, (wide, p) => { if (!p) return rt.image?.base || 0; let name = m.string(p, wide).toLowerCase(); if (name === rt.name?.toLowerCase()) return rt.image.base; if (!name.endsWith('.dll')) name += '.dll'; const i = modules.indexOf(name); return i < 0 ? fail(126) : 0xe0000000 + i * 65536; });
    pair(k, 'LoadLibrary', 1, (wide, p) => { let name = m.string(p, wide).toLowerCase(); if (!name.endsWith('.dll')) name += '.dll'; const i = modules.indexOf(name); return i < 0 ? fail(126) : 0xe0000000 + i * 65536; });
    k('GetProcAddress', 2, (h, p) => { const dll = moduleFor(h), result = dll ? rt.resolve(dll, p <= 65535 ? '#' + p : m.string(p)) : 0; return result || fail(127); });
    k('FreeLibrary', 1, h => moduleFor(h) ? 1 : fail(6));
    pair(k, 'GetModuleFileName', 3, (wide, h, p, n) => { const text = h && h !== rt.image.base ? moduleFor(h) : 'C:\\' + rt.name; if (!text) return fail(6); if (text.length >= n) { if (n) m.putString(p, text, wide, n); return fail(122, n); } return m.putString(p, text, wide, n); });
    pair(k, 'GetEnvironmentVariable', 3, (wide, p, out, n) => { const value = state.env.get(m.string(p, wide).toUpperCase()); if (value === undefined) return fail(203); return copyWinString(out, n, value, wide); });
    pair(k, 'SetEnvironmentVariable', 2, (wide, p, value) => { const name = m.string(p, wide).toUpperCase(); if (!name || name.includes('=')) return fail(87); if (!value) state.env.delete(name); else { if (state.env.size >= 128) return fail(8); state.env.set(name, m.string(value, wide)); } return 1; });
    for (const wide of [false, true]) { const name = wide ? 'GetEnvironmentStringsW' : 'GetEnvironmentStrings'; k(name, 0, () => m.str([...state.env].map(([k, v]) => k + '=' + v).join('\0') + '\0', wide)); k('FreeEnvironmentStrings' + (wide ? 'W' : 'A'), 1, p => m.free(p) ? 1 : fail(87)); }
    k('GetEnvironmentStringsA', 0, () => rt.apis.get('kernel32.dll!GetEnvironmentStrings').fn());
    pair(k, 'GetStartupInfo', 1, (wide, p) => { m.zero(p, 68); m.w32(p, 68); m.w32(p + 44, 0x100); m.w32(p + 56, STDIN); m.w32(p + 60, STDOUT); m.w32(p + 64, STDERR); });

    // UTF-16/UTF-8 and Windows-1252 ANSI conversion. OEM uses an explicit 437 map.
    const cp437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
    const decode = (bytes, cp, strict = false) => { if (cp === 65001) return new TextDecoder('utf-8', {fatal: strict}).decode(bytes); if (cp === 1 || cp === 437) return [...bytes].map(b => b < 128 ? String.fromCharCode(b) : cp437[b - 128]).join(''); if (![0, 3, 1252].includes(cp)) throw Error('Unsupported guest code page ' + cp); return m.decoder.decode(bytes); };
    const encode = (text, cp) => { if (cp === 65001) return new TextEncoder().encode(text); if (![0, 1, 3, 437, 1252].includes(cp)) throw Error('Unsupported guest code page ' + cp); return Uint8Array.from(text, ch => (cp === 1 || cp === 437) ? (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : cp437.indexOf(ch) < 0 ? 63 : cp437.indexOf(ch) + 128) : m.encoder.get(ch) ?? 63); };
    k('MultiByteToWideChar', 6, (cp, flags, p, count, out, capacity) => { if (!count || count !== INVALID && count > 1048576 || flags & ~8) return fail(87); const n = count === INVALID ? m.string(p).length + 1 : count; m.check(p, n); let text; try { text = decode(m.bytes.subarray(p, p + n), cp, !!(flags & 8)); } catch { return fail(1113); } if (!capacity) return text.length; if (capacity < text.length) return fail(122); m.check(out, text.length * 2); for (let i = 0; i < text.length; i++) m.w16(out + i * 2, text.charCodeAt(i)); return text.length; });
    k('WideCharToMultiByte', 8, (cp, flags, p, count, out, capacity, defaultChar, used) => { if (!count || count !== INVALID && count > 1048576 || flags & ~0x480) return fail(87); const text = count === INVALID ? m.string(p, true) + '\0' : m.string(p, true, count); let bytes; try { bytes = encode(text, cp); } catch { return fail(87); } if (used) m.w32(used, cp === 65001 ? 0 : Number(decode(bytes, cp) !== text)); if (!capacity) return bytes.length; if (capacity < bytes.length) return fail(122); m.copy(out, bytes); return bytes.length; });
    k('GetACP', 0, () => 1252); k('GetOEMCP', 0, () => 437); k('IsValidCodePage', 1, cp => [0, 1, 3, 437, 1252, 65001].includes(cp) ? 1 : 0);
    k('GetCPInfo', 2, (cp, p) => { if (![0, 1, 3, 437, 1252, 65001].includes(cp)) return fail(87); m.zero(p, 20); m.w32(p, cp === 65001 ? 4 : 1); m.w8(p + 4, 63); return 1; });
    k('SetFileApisToOEM', 0, () => { state.oemFiles = true; }); k('SetFileApisToANSI', 0, () => { state.oemFiles = false; });
    k('AreFileApisANSI', 0, () => state.oemFiles ? 0 : 1);
    reg('user32.dll', 'CharUpperW', 1, p => { if (p <= 65535) return String.fromCharCode(p).toUpperCase().charCodeAt(0); const text = m.string(p, true); m.putString(p, text.toUpperCase(), true, text.length + 1); return p; });
    reg('user32.dll', 'CharLowerW', 1, p => { if (p <= 65535) return String.fromCharCode(p).toLowerCase().charCodeAt(0); const text = m.string(p, true); m.putString(p, text.toLowerCase(), true, text.length + 1); return p; });
    pair(k, 'CompareString', 6, (wide, locale, flags, p1, n1, p2, n2) => { let a = m.string(p1, wide, n1 === INVALID ? null : n1), b = m.string(p2, wide, n2 === INVALID ? null : n2); if (flags & 1) { a = a.toLowerCase(); b = b.toLowerCase(); } return a === b ? 2 : a < b ? 1 : 3; });
    pair(k, 'LCMapString', 6, (wide, locale, flags, p, n, out, cap) => { let text = m.string(p, wide, n === INVALID ? null : n); if (flags & 0x100) text = text.toLowerCase(); if (flags & 0x200) text = text.toUpperCase(); if (flags & ~0x300) return fail(1004); if (n === INVALID) text += '\0'; if (!cap) return text.length; if (cap < text.length) return fail(122); for (let i = 0; i < text.length; i++) wide ? m.w16(out + i * 2, text.charCodeAt(i)) : m.w8(out + i, m.encoder.get(text[i]) ?? 63); return text.length; });
    k('GetUserDefaultLCID', 0, () => 0x409); k('GetThreadLocale', 0, () => 0x409);
    pair(k, 'GetLocaleInfo', 4, (wide, locale, type, p, n) => { const values = {1: '0409', 2: 'English', 3: 'ENU', 4: 'English (United States)', 5: '1', 6: 'United States', 7: 'USA', 8: 'United States', 9: '0409', 10: '1252', 11: ',', 12: '0', 13: '.', 14: ',', 15: '3;0', 16: '2', 17: '1', 18: '0123456789', 19: '$', 20: 'USD', 21: '.', 22: ',', 23: '3;0', 24: '2', 25: '2', 26: '0', 27: '0', 28: '/', 29: ':', 30: 'M/d/yyyy', 31: 'dddd, MMMM d, yyyy', 32: '0', 33: '0', 40: 'AM', 41: 'PM', 0x1004: '1252', 0x1009: '1', 0x1010: '1', 0x1011: '0', 0x1012: '0', 0x1013: '0', 0x1014: '0', 0x1015: '0', 0x50: '-', 0x51: '+'}; const text = values[type & 0xffff]; if (text === undefined) return fail(1004); if (type & 0x20000000) { if (n < (wide ? 2 : 4)) return fail(122); m.w32(p, parseInt(text, 10) || 0); return wide ? 2 : 4; } if (!n) return text.length + 1; if (n <= text.length) return fail(122); m.putString(p, text, wide, n); return text.length + 1; });

    // Virtual console is byte/text I/O, not terminal control of the host computer.
    const modes = new Map([[STDIN, 7], [STDOUT, 3], [STDERR, 3]]);
    k('GetConsoleMode', 2, (h, p) => { if (!modes.has(h)) return fail(6); m.w32(p, modes.get(h)); return 1; });
    k('SetConsoleMode', 2, (h, mode) => { if (!modes.has(h)) return fail(6); modes.set(h, mode); return 1; });
    k('SetConsoleCtrlHandler', 2, (p, add) => { state.consoleHandler = add ? p : 0; return 1; });
    k('GetConsoleScreenBufferInfo', 2, (h, p) => { if (![STDOUT, STDERR].includes(h)) return fail(6); m.zero(p, 22); m.w16(p, 100); m.w16(p + 2, 30); m.w16(p + 8, 7); m.w16(p + 14, 99); m.w16(p + 16, 29); m.w16(p + 18, 100); m.w16(p + 20, 30); return 1; });
    pair(k, 'WriteConsole', 5, (wide, h, p, n, written, reserved) => { if (![STDOUT, STDERR].includes(h)) return fail(6); rt.log(m.string(p, wide, n)); if (written) m.w32(written, n); return 1; });
    k('SetConsoleOutputCP', 1, cp => { if (![437, 1252, 65001].includes(cp)) return fail(87); state.outputCP = cp; return 1; });
    k('GetConsoleOutputCP', 0, () => state.outputCP || 437);
    k('GetConsoleCP', 0, () => 437);

    // FILETIME uses UTC in the virtual process; no host timezone mutation.
    const ftDate = p => new Date(Number((read64(p) - EPOCH) / 10000n));
    const systemTime = (p, d) => { [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDay(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()].forEach((v, i) => m.w16(p + i * 2, v)); };
    k('GetSystemTimeAsFileTime', 1, p => write64(p, EPOCH + BigInt(Date.now()) * 10000n));
    k('GetSystemTime', 1, p => systemTime(p, new Date())); k('GetLocalTime', 1, p => systemTime(p, new Date()));
    k('FileTimeToSystemTime', 2, (p, out) => { const d = ftDate(p); if (!Number.isFinite(d.getTime())) return fail(87); systemTime(out, d); return 1; });
    k('SystemTimeToFileTime', 2, (p, out) => { const date = Date.UTC(m.u16(p), m.u16(p + 2) - 1, m.u16(p + 6), m.u16(p + 8), m.u16(p + 10), m.u16(p + 12), m.u16(p + 14)); if (!Number.isFinite(date)) return fail(87); write64(out, EPOCH + BigInt(date) * 10000n); return 1; });
    k('FileTimeToLocalFileTime', 2, (p, out) => { write64(out, read64(p)); return 1; }); k('LocalFileTimeToFileTime', 2, (p, out) => { write64(out, read64(p)); return 1; });
    k('CompareFileTime', 2, (a, b) => read64(a) === read64(b) ? 0 : read64(a) < read64(b) ? -1 : 1);
    k('FileTimeToDosDateTime', 3, (p, date, t) => { const d = ftDate(p), y = d.getUTCFullYear(); if (y < 1980 || y > 2107) return fail(87); m.w16(date, (y - 1980) << 9 | (d.getUTCMonth() + 1) << 5 | d.getUTCDate()); m.w16(t, d.getUTCHours() << 11 | d.getUTCMinutes() << 5 | d.getUTCSeconds() >> 1); return 1; });
    k('DosDateTimeToFileTime', 3, (date, t, out) => { const ms = Date.UTC(1980 + (date >> 9), (date >> 5 & 15) - 1, date & 31, t >> 11, t >> 5 & 63, (t & 31) * 2); write64(out, EPOCH + BigInt(ms) * 10000n); return 1; });
    pair(k, 'FormatMessage', 7, (wide, flags, source, id, language, p, n, args) => { if (!(flags & 0x1000) || flags & 0x400 || args) return fail(50); const names = {2: 'The system cannot find the file specified.', 3: 'The system cannot find the path specified.', 5: 'Access is denied.', 6: 'The handle is invalid.', 8: 'Not enough memory.', 18: 'There are no more files.', 50: 'The request is not supported.', 80: 'The file exists.', 87: 'The parameter is incorrect.', 112: 'There is not enough space on the disk.', 183: 'Cannot create a file when that file already exists.'}; const text = (names[id] || 'Virtual Win32 error ' + id + '.') + '\r\n'; if (flags & 0x100) { m.w32(p, m.str(text, wide)); return text.length; } if (n <= text.length) return fail(122); return m.putString(p, text, wide, n); });

    // Read-only absence/refusal, rather than invented registry/privilege success.
    const adv = (name, n, fn) => reg('advapi32.dll', name, n, fn);
    pair(adv, 'RegOpenKeyEx', 5, (wide, h, name, options, access, out) => { if (out) m.w32(out, 0); return 2; });
    pair(adv, 'RegQueryValueEx', 6, () => 2); adv('RegCloseKey', 1, () => 6);
    adv('OpenProcessToken', 3, (h, access, out) => { if (out) m.w32(out, 0); return fail(5); });
    pair(adv, 'LookupPrivilegeValue', 3, () => fail(1313)); adv('AdjustTokenPrivileges', 6, () => fail(5));
    pair(adv, 'GetFileSecurity', 5, (wide, name, flags, p, n, needed) => { if (needed) m.w32(needed, 0); return fail(50); }); pair(adv, 'SetFileSecurity', 3, () => fail(50));
    k('DeviceIoControl', 8, (h, code, input, inSize, output, outSize, count, overlap) => { if (count) m.w32(count, 0); return fail(1); });
    pair(k, 'OpenFileMapping', 3, () => fail(2));
    unsupported('kernel32.dll', 'MapViewOfFile', 5, 'Shared/mapped files are not implemented');
    k('UnmapViewOfFile', 1, () => fail(487));

    // BSTR/VARIANT are ordinary bounded guest memory, not COM or Automation hosts.
    const ole = (name, ordinal, n, fn) => { reg('oleaut32.dll', name, n, fn); rt.aliases.set('oleaut32.dll!#' + ordinal, 'oleaut32.dll!' + name); };
    const bstr = (p, n) => { if (n > 1048576) return 0; const raw = alloc(n * 2 + 6, true); if (!raw) return 0; m.w32(raw, n * 2); if (p) { m.check(p, n * 2); m.copy(raw + 4, m.bytes.subarray(p, p + n * 2)); } return raw + 4; };
    ole('SysAllocString', 2, 1, p => p ? bstr(p, m.string(p, true).length) : 0);
    ole('SysAllocStringLen', 4, 2, bstr); ole('SysFreeString', 6, 1, p => { if (p && !m.free(p - 4)) throw Error('Invalid BSTR'); });
    ole('SysStringLen', 7, 1, p => p ? m.u32(p - 4) / 2 : 0);
    ole('VariantInit', 8, 1, p => m.zero(p, 16));
    ole('VariantClear', 9, 1, p => { const type = m.u16(p); if (type === 8) { const b = m.u32(p + 8); if (b) m.free(b - 4); } else if (![0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 16, 17, 18, 19, 20, 21].includes(type)) throw Error('Unsupported VARIANT type ' + type); m.zero(p, 16); return 0; });

    ole('VariantCopy', 10, 2, (out, input) => {
        m.check(out, 16); m.check(input, 16); if (out === input) return 0;
        const clear = rt.apis.get('oleaut32.dll!VariantClear').fn, type = m.u16(input);
        if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 16, 17, 18, 19, 20, 21].includes(type)) throw Error('Unsupported VARIANT copy type ' + type);
        const bytes = m.bytes.slice(input, input + 16); let copy = 0;
        if (type === 8 && m.u32(input + 8)) { const p = m.u32(input + 8); copy = bstr(p, m.u32(p - 4) / 2); if (!copy) return 0x8007000e; }
        clear(out); m.copy(out, bytes); if (type === 8) m.w32(out + 8, copy); return 0;
    });

    // MSVCRT startup, allocator and byte/string functions. Guest code is not substituted.
    const errno = () => global('errno'); crt('_errno', 0, errno);
    crt('malloc', 1, n => alloc(n)); crt('calloc', 2, (n, size) => n * size > 16 * 1024 * 1024 ? 0 : alloc(n * size, true));
    crt('realloc', 2, (p, n) => realloc(p, n)); crt('free', 1, p => { if (!m.free(p)) throw Error('Invalid CRT allocation'); });
    crt('_msize', 1, p => m.allocations.get(p) ?? INVALID);
    for (const wide of [false, true]) {
        const width = wide ? 2 : 1, prefix = wide ? 'wcs' : 'str', unit = p => wide ? m.u16(p) : m.u8(p);
        crt(prefix + 'len', 1, p => m.string(p, wide).length);
        crt(prefix + 'cmp', 2, (a, b) => { const x = m.string(a, wide), y = m.string(b, wide); for (let i = 0; i <= Math.max(x.length, y.length); i++) { const d = (x.charCodeAt(i) || 0) - (y.charCodeAt(i) || 0); if (d) return d; } return 0; });
        crt(prefix + 'ncmp', 3, (a, b, n) => { if (n > 1048576) throw Error('Comparison budget'); for (let i = 0; i < n; i++) { const x = unit(a + i * width), y = unit(b + i * width); if (x !== y) return x - y; if (!x) return 0; } return 0; });
        crt('_' + prefix + 'icmp', 2, (a, b) => { const x = m.string(a, wide).toLowerCase(), y = m.string(b, wide).toLowerCase(); return x === y ? 0 : x < y ? -1 : 1; });
        crt(prefix + 'cpy', 2, (out, p) => { m.putString(out, m.string(p, wide), wide); return out; });
        crt(prefix + 'ncpy', 3, (out, p, n) => { if (n > 1048576) throw Error('Copy budget'); m.check(out, n * width); let ended = false; for (let i = 0; i < n; i++) { const v = ended ? 0 : unit(p + i * width); ended ||= v === 0; wide ? m.w16(out + i * 2, v) : m.w8(out + i, v); } return out; });
        crt(prefix + 'cat', 2, (out, p) => { m.putString(out + m.string(out, wide).length * width, m.string(p, wide), wide); return out; });
        crt(prefix + 'chr', 2, (p, ch) => { const text = m.string(p, wide) + '\0', i = text.indexOf(String.fromCharCode(ch & (wide ? 65535 : 255))); return i < 0 ? 0 : p + i * width; });
        crt(prefix + 'rchr', 2, (p, ch) => { const text = m.string(p, wide) + '\0', i = text.lastIndexOf(String.fromCharCode(ch & (wide ? 65535 : 255))); return i < 0 ? 0 : p + i * width; });
        crt(prefix + 'str', 2, (p, needle) => { const i = m.string(p, wide).indexOf(m.string(needle, wide)); return i < 0 ? 0 : p + i * width; });
        crt((wide ? '_wcsdup' : '_strdup'), 1, p => m.str(m.string(p, wide), wide));
    }
    crt('memcmp', 3, (a, b, n) => { m.check(a, n); m.check(b, n); for (let i = 0; i < n; i++) if (m.bytes[a + i] !== m.bytes[b + i]) return m.bytes[a + i] - m.bytes[b + i]; return 0; });
    crt('memchr', 3, (p, ch, n) => { m.check(p, n); for (let i = 0; i < n; i++) if (m.bytes[p + i] === (ch & 255)) return p + i; return 0; });
    crt('atoi', 1, p => parseInt(m.string(p), 10) | 0); crt('atol', 1, p => parseInt(m.string(p), 10) | 0);
    for (const signed of [false, true]) crt(signed ? 'strtol' : 'strtoul', 3, (p, end, radix) => {
        let text = m.string(p), i = 0; while (/\s/.test(text[i] || '') && i < text.length) i++; let negative = false;
        if (text[i] === '+' || text[i] === '-') negative = text[i++] === '-'; if (!radix) radix = /^0x/i.test(text.slice(i)) ? 16 : text[i] === '0' ? 8 : 10;
        if (radix < 2 || radix > 36) { if (end) m.w32(end, p); m.w32(errno(), 22); return 0; }
        if (radix === 16 && /^0x/i.test(text.slice(i))) i += 2; const start = i; let n = 0n;
        while (i < text.length) { const d = parseInt(text[i], 36); if (!Number.isFinite(d) || d >= radix) break; n = n * BigInt(radix) + BigInt(d); i++; }
        if (end) m.w32(end, p + (i === start ? 0 : i)); if (negative) n = -n;
        const min = signed ? -2147483648n : 0n, max = signed ? 2147483647n : 4294967295n;
        if ((signed && n < min) || n > max) { m.w32(errno(), 34); return Number(n < min ? min : max); }
        return Number(BigInt.asUintN(32, n));
    });
    const getArgs = wide => {
        const key = wide ? 'wargv' : 'argv'; if (state[key]) return state[key];
        const values = splitCommandLine(m.string(wide ? rt.commandW : rt.commandA, wide)); const p = m.alloc((values.length + 1) * 4);
        values.forEach((s, i) => m.w32(p + i * 4, m.str(s, wide))); return state[key] = {p, count: values.length};
    };
    const getEnv = wide => { const key = wide ? 'wenv' : 'envp'; if (state[key]) return state[key]; const entries = [...state.env].map(([k, v]) => m.str(k + '=' + v, wide)), p = m.alloc((entries.length + 1) * 4); entries.forEach((v, i) => m.w32(p + i * 4, v)); return state[key] = p; };
    crt('__getmainargs', 5, (argc, argv, envp, wildcard, startup) => { const args = getArgs(false); m.w32(argc, args.count); m.w32(argv, args.p); m.w32(envp, getEnv(false)); return 0; });
    crt('__wgetmainargs', 5, (argc, argv, envp, wildcard, startup) => { const args = getArgs(true); m.w32(argc, args.count); m.w32(argv, args.p); m.w32(envp, getEnv(true)); return 0; });
    for (const [name, value] of [['_fmode', 0x4000], ['_commode', 0], ['__initenv', 0], ['__winitenv', 0]]) crt('__p_' + name, 0, () => global(name, value));
    crt('__p___argc', 0, () => global('argc', getArgs(false).count)); crt('__p___argv', 0, () => global('argv', getArgs(false).p));
    crt('__p__environ', 0, () => global('environ', getEnv(false)));
    crt('__p__acmdln', 0, () => global('acmdln', rt.commandA)); crt('__p__wcmdln', 0, () => global('wcmdln', rt.commandW));
    data('_adjust_fdiv', () => global('_adjust_fdiv', 0)); data('__mb_cur_max', () => global('__mb_cur_max', 1));
    crt('__set_app_type', 1, n => { state.appType = n; }); crt('__setusermatherr', 1, p => { state.mathErrorHandler = p; });
    crt('_initterm', 2, async (begin, end) => { if (end < begin || end - begin > 16384 || (end - begin) % 4) throw Error('Invalid CRT initializer table'); for (let p = begin; p < end; p += 4) { const fn = m.u32(p); if (fn && fn !== INVALID) await rt.invoke(fn, [], true); } });
    crt('_onexit', 1, fn => { if (state.atexit.length >= 256) return 0; state.atexit.push(fn); return fn; }); crt('atexit', 1, fn => { if (state.atexit.length >= 256) return -1; state.atexit.push(fn); return 0; });
    crt('__dllonexit', 3, (fn, pbegin, pend) => { const begin = m.u32(pbegin), end = m.u32(pend), n = end - begin; if (n < 0 || n > 1024 || n % 4) throw Error('Invalid onexit table'); const p = realloc(begin, n + 4); if (!p) return 0; m.w32(p + n, fn); m.w32(pbegin, p); m.w32(pend, p + n + 4); return fn; });
    const exitCRT = async code => { while (state.atexit.length && !rt.stopped) await rt.invoke(state.atexit.pop(), [], true); rt.exit(code); };
    crt('exit', 1, exitCRT); crt('_exit', 1, n => rt.exit(n)); crt('_cexit', 0, async () => { while (state.atexit.length) await rt.invoke(state.atexit.pop(), [], true); });
    crt('_controlfp', 2, (value, mask) => { state.fpuControl = (state.fpuControl & ~mask) | (value & mask); c.set_fpu_control?.(0x3f|((state.fpuControl&0x300)<<2)|((state.fpuControl&0x30000)===0x20000?0:(state.fpuControl&0x30000)===0x10000?0x200:0x300)); return state.fpuControl; });
    crt('_ftol', 0, () => { if (!c.fpu_pop) throw Error('x87 conversion is unavailable'); const x = c.fpu_pop(); if (!Number.isFinite(x) || Math.abs(x) >= 2 ** 63) throw Error('x87 integer conversion out of range'); const n = BigInt(Math.trunc(x)); c.set_reg(2, Number(BigInt.asUintN(64, n) >> 32n)); return Number(BigInt.asUintN(32, n)); });
    for (const [name, n] of [['_XcptFilter', 2], ['_except_handler3', 4], ['__CxxFrameHandler', 4], ['_CxxThrowException', 2], ['_purecall', 0], ['?terminate@@YAXXZ', 0]]) unsupported('msvcrt.dll', name, n, 'Structured/C++ exception dispatch is not implemented', true);
    // type_info has no host sidecar; destructor frees only its optional cached name.
    crt('??1type_info@@UAE@XZ', 0, () => { const self = c.get_reg(1) >>> 0; const p = m.u32(self + 4); if (p) { m.free(p); m.w32(self + 4, 0); } });
    unsupported('msvcrt.dll', '_beginthreadex', 6, 'Guest threads are not implemented; select single-thread mode', true);

    // FILE objects use the 32-byte 32-bit MSVCRT layout, including stdin/out/err.
    const iob = () => { if (!state.iob) { state.iob = m.alloc(32 * 3); for (let fd = 0; fd < 3; fd++) { const p = state.iob + fd * 32; m.w32(p + 12, fd === 0 ? 1 : 2); m.w32(p + 16, fd); state.streams.set(p, {h: state.fds.get(fd), fd, eof: false, error: false, unget: []}); } } return state.iob; };
    data('_iob', iob); crt('__iob_func', 0, iob);
    const stream = p => { iob(); const f = state.streams.get(p); if (!f) throw Error('Invalid MSVCRT FILE pointer'); return f; };
    const fdHandle = fd => state.fds.get(fd) ?? INVALID;
    const textBytes = text => Uint8Array.from(text, ch => m.encoder.get(ch) ?? 63);
    const put = (p, bytes) => { const f = stream(p), n = writeBytes(f.h, bytes); if (n < 0) { f.error = true; m.w32(p + 12, m.u32(p + 12) | 32); } return n; };
    const get = (p, n) => { const f = stream(p), parts = []; while (f.unget.length && parts.length < n) parts.push(f.unget.pop()); const b = readBytes(f.h, n - parts.length); if (b === null) { f.error = true; return new Uint8Array(); } const out = new Uint8Array(parts.length + b.length); out.set(parts); out.set(b, parts.length); if (out.length < n) { f.eof = true; m.w32(p + 12, m.u32(p + 12) | 16); } return out; };
    const fopen = (path, mode) => {
        if (!/^[rwa][bt+]*$/.test(mode)) return 0; const access = (mode[0] === 'r' || mode.includes('+') ? 0x80000000 : 0) | (mode[0] !== 'r' || mode.includes('+') ? 0x40000000 : 0);
        const h = openFile(filePath(path), access, mode[0] === 'r' ? 3 : mode[0] === 'w' ? 2 : 4); if (h === INVALID) return 0;
        if (mode[0] === 'a') seek(h, 0, 2); const fd = state.nextFD++, p = m.alloc(32); state.fds.set(fd, h); state.streams.set(p, {h, fd, eof: false, error: false, unget: []}); m.w32(p + 12, mode[0] === 'r' ? 1 : 2); m.w32(p + 16, fd); return p;
    };
    crt('fopen', 2, (p, mode) => fopen(m.string(p), m.string(mode))); crt('_wfopen', 2, (p, mode) => fopen(m.string(p, true), m.string(mode, true)));
    crt('fclose', 1, p => { const f = stream(p); const result = close(f.h); state.fds.delete(f.fd); state.streams.delete(p); if (p < iob() || p >= iob() + 96) m.free(p); return result ? 0 : -1; });
    crt('fread', 4, (out, size, count, p) => { if (!size || !count) return 0; const n = size * count; if (n > FILE_LIMIT) throw Error('fread budget exceeded'); m.check(out, n); const b = get(p, n); m.copy(out, b); return Math.floor(b.length / size); });
    crt('fwrite', 4, (input, size, count, p) => { if (!size || !count) return 0; const n = size * count; if (n > FILE_LIMIT) throw Error('fwrite budget exceeded'); m.check(input, n); return Math.max(0, Math.floor(put(p, m.bytes.subarray(input, input + n)) / size)); });
    crt('fputc', 2, (ch, p) => put(p, new Uint8Array([ch & 255])) < 0 ? -1 : ch & 255); crt('putchar', 1, ch => writeBytes(STDOUT, new Uint8Array([ch & 255])) < 0 ? -1 : ch & 255);
    crt('fputs', 2, (text, p) => put(p, textBytes(m.string(text))) < 0 ? -1 : 0);
    crt('fgetc', 1, p => { const b = get(p, 1); return b.length ? b[0] : -1; }); crt('getchar', 0, () => { const b = readBytes(STDIN, 1); return b.length ? b[0] : -1; });
    crt('ungetc', 2, (ch, p) => { if (ch === INVALID) return -1; const f = stream(p); if (f.unget.length >= 16) return -1; f.unget.push(ch & 255); f.eof = false; m.w32(p + 12, m.u32(p + 12) & ~16); return ch & 255; });
    crt('fflush', 1, p => { if (p) stream(p); return 0; }); crt('feof', 1, p => stream(p).eof ? 1 : 0); crt('ferror', 1, p => stream(p).error ? 1 : 0);
    crt('clearerr', 1, p => { const f = stream(p); f.error = f.eof = false; m.w32(p + 12, m.u32(p + 12) & ~48); });
    crt('fseek', 3, (p, offset, method) => { const f = stream(p); const n = seek(f.h, offset | 0, method); f.unget = []; f.eof = false; return n === INVALID ? -1 : 0; });
    crt('ftell', 1, p => getFile(stream(p).h)?.offset ?? -1);
    crt('rewind', 1, p => { const f = stream(p); seek(f.h, 0, 0); f.eof = f.error = false; f.unget = []; });
    crt('setvbuf', 4, (p, buffer, mode, size) => { stream(p); if (![0, 64, 4].includes(mode)) return -1; return 0; }); // Unbuffered facade satisfies flush/read ordering.
    crt('_fileno', 1, p => stream(p).fd); crt('_get_osfhandle', 1, fd => fdHandle(fd));
    crt('_isatty', 1, fd => [STDIN, STDOUT, STDERR].includes(fdHandle(fd)) ? 1 : 0);
    crt('_setmode', 2, (fd, mode) => { if (!state.fds.has(fd)) return -1; const old = state.fdModes?.get(fd) || 0x4000; state.fdModes ||= new Map(); state.fdModes.set(fd, mode); return old; });
    crt('_read', 3, (fd, out, n) => { const b = readBytes(fdHandle(fd), n); if (!b) return -1; m.copy(out, b); return b.length; });
    crt('_write', 3, (fd, p, n) => { m.check(p, n); return writeBytes(fdHandle(fd), m.bytes.subarray(p, p + n)); });
    crt('_close', 1, fd => { const h = fdHandle(fd); if (!close(h)) return -1; state.fds.delete(fd); return 0; });
    crt('_lseek', 3, (fd, offset, method) => seek(fdHandle(fd), offset | 0, method));
    crt('getenv', 1, p => { const value = state.env.get(m.string(p).toUpperCase()); return value === undefined ? 0 : m.str(value); });

    // Printf family reads actual guest varargs (including 64-bit integers/doubles).
    const format = (pattern, ap) => {
        let at = ap, out = '', index = 0;
        const next = () => { const v = m.u32(at); at += 4; return v; };
        const wideNumber = () => { const v = read64(at); at += 8; return v; };
        for (const match of pattern.matchAll(/%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d+))?(I64|ll|I32|[hlLw])?([%diuoxXcCsSpfeEgGn])/g)) {
            out += pattern.slice(index, match.index); index = match.index + match[0].length;
            const [, flags, ws, ps, length, kind] = match;
            if (kind === '%') { out += '%'; continue; }
            let width = ws === '*' ? next() | 0 : Number(ws || 0), precision = ps === '*' ? next() | 0 : ps === undefined ? null : Number(ps); let text = '';
            if (Math.abs(width) > 8192 || precision > 8192) throw Error('Printf field budget exceeded');
            if (kind === 'n') throw Error('Printf %n is intentionally unsupported');
            if ('diuoxXp'.includes(kind)) {
                const is64 = length === 'll' || length === 'I64'; let n = is64 ? wideNumber() : BigInt(next());
                if ('di'.includes(kind)) n = BigInt.asIntN(is64 ? 64 : length === 'h' ? 16 : 32, n); else n = BigInt.asUintN(is64 ? 64 : length === 'h' ? 16 : 32, n);
                const negative = n < 0n; if (negative) n = -n; const base = 'xXp'.includes(kind) ? 16 : kind === 'o' ? 8 : 10;
                text = n.toString(base); if (precision !== null) text = text.padStart(Math.max(0, precision), '0'); if (kind === 'X' || kind === 'p') text = text.toUpperCase(); if (kind === 'p') text = text.padStart(8, '0');
                let sign = negative ? '-' : flags.includes('+') && 'di'.includes(kind) ? '+' : flags.includes(' ') && 'di'.includes(kind) ? ' ' : '';
                if (flags.includes('#') && n) sign += kind === 'x' ? '0x' : kind === 'X' ? '0X' : kind === 'o' ? '0' : '';
                if (flags.includes('0') && !flags.includes('-') && precision === null && width > sign.length + text.length) text = text.padStart(width - sign.length, '0'); text = sign + text;
            } else if ('sS'.includes(kind)) { const p = next(); text = p ? m.string(p, length === 'l' || length === 'w' || kind === 'S') : '(null)'; if (precision !== null && precision >= 0) text = text.slice(0, precision); }
            else if ('cC'.includes(kind)) text = String.fromCharCode(next() & (length === 'l' || kind === 'C' ? 65535 : 255));
            else { const n = m.view.getFloat64(m.check(at, 8), true); at += 8; const digits = precision === null ? 6 : Math.max(0, precision); if (digits > 100) throw Error('Floating format precision exceeds 100'); text = kind.toLowerCase() === 'f' ? n.toFixed(digits) : kind.toLowerCase() === 'e' ? n.toExponential(digits) : n.toPrecision(digits || 1); if (kind === kind.toUpperCase()) text = text.toUpperCase(); }
            if (Math.abs(width) > text.length) text = flags.includes('-') || width < 0 ? text.padEnd(Math.abs(width), ' ') : text.padStart(width, ' ');
            out += text; if (out.length > 65536) throw Error('Printf output budget exceeded');
        }
        out += pattern.slice(index); return out;
    };
    const argAt = n => m.u32((c.get_reg(4) >>> 0) + 4 + n * 4), varargs = n => (c.get_reg(4) >>> 0) + 4 + n * 4;
    crt('printf', 1, p => { const text = format(m.string(p), varargs(1)); rt.log(text); return text.length; });
    crt('fprintf', 2, (file, p) => { const text = format(m.string(p), varargs(2)); return put(file, textBytes(text)) < 0 ? -1 : text.length; });
    crt('sprintf', 2, (out, p) => { const text = format(m.string(p), varargs(2)); m.putString(out, text); return text.length; });
    crt('_snprintf', 3, (out, n, p) => { const text = format(m.string(p), varargs(3)); const b = textBytes(text); m.check(out, Math.min(n, b.length + 1)); m.copy(out, b.subarray(0, n)); if (text.length < n) m.w8(out + text.length, 0); return text.length >= n ? -1 : text.length; });
    crt('vfprintf', 3, (file, p, ap) => { const text = format(m.string(p), ap); return put(file, textBytes(text)) < 0 ? -1 : text.length; });
    crt('vsprintf', 3, (out, p, ap) => { const text = format(m.string(p), ap); m.putString(out, text); return text.length; });
    crt('puts', 1, p => { rt.log(m.string(p) + '\n'); return 0; });
    crt('perror', 1, p => { rt.log((p ? m.string(p) + ': ' : '') + 'Virtual runtime error ' + m.u32(errno()) + '\n'); });
    crt('setlocale', 2, (category, p) => { if (p && !['C', 'POSIX', ''].includes(m.string(p))) return 0; return state.cLocale ||= m.str('C'); });
    crt('localeconv', 0, () => { if (!state.lconv) { state.lconv = m.alloc(64); const empty = m.str(''); for (let i = 0; i < 10; i++) m.w32(state.lconv + i * 4, i === 0 ? m.str('.') : empty); for (let i = 40; i < 48; i++) m.w8(state.lconv + i, 127); } return state.lconv; });
    // Single-thread TLS/CRT startup and user-selected PE DLLs stay inside guest RAM.
    const originalPrepare=rt.prepareCompat;
    rt.prepareCompat=()=>{originalPrepare?.();m.w32(global('_acmdln'),rt.commandA);m.w32(global('_wcmdln'),rt.commandW);m.w32(global('__initenv'),getEnv(false));m.w32(global('__winitenv'),getEnv(true));const args=getArgs(false);m.w32(global('__argc'),args.count);m.w32(global('__argv'),args.p);m.w32(global('_environ'),getEnv(false));};
    for(const [name,value] of [['__argc',0],['__argv',0],['_environ',0],['_fmode',0x4000],['_commode',0],['_winmajor',10],['_winminor',0],['_winver',0xa00],['_osver',0],['__initenv',0],['__winitenv',0],['_acmdln',0],['_wcmdln',0]])data(name,()=>global(name,value));
    const moduleImage=h=>[...rt.modules.values(),rt.image].find(x=>x?.base===h);
    pair(k,'GetModuleHandle',1,(wide,p)=>{if(!p)return rt.image.base;let name=m.string(p,wide).toLowerCase();if(name===rt.name.toLowerCase())return rt.image.base;if(!name.endsWith('.dll'))name+='.dll';const image=rt.modules.get(name);if(image)return image.base;const i=modules.indexOf(name);return i<0?fail(126):0xe0000000+i*65536;});
    pair(k,'LoadLibrary',1,async(wide,p)=>{let name=m.string(p,wide).toLowerCase();if(!name.endsWith('.dll'))name+='.dll';const i=modules.indexOf(name);if(i>=0)return 0xe0000000+i*65536;const image=rt.loadPrivateLibrary(name);if(!image)return fail(126);for(const loaded of rt.modules.values())await rt.initializeImage(loaded);return image.base;});
    k('GetProcAddress',2,(h,p)=>{const name=p<=65535?'#'+p:m.string(p),dll=moduleFor(h),image=moduleImage(h);return (dll?rt.resolve(dll,name):image?.exports[name])||fail(127);});
    k('FreeLibrary',1,h=>moduleFor(h)?1:moduleImage(h)?fail(50):fail(6)); // Guest DLLs remain mapped for the process lifetime.
    pair(k,'GetModuleFileName',3,(wide,h,p,n)=>{const image=moduleImage(h||rt.image.base),name=image?(image.name||rt.name):moduleFor(h);if(!name)return fail(6);return copyWinString(p,n,'C:\\'+name,wide);});
    pair(k,'GetSystemDirectory',2,(wide,p,n)=>copyWinString(p,n,'C:\\Windows\\System32',wide));
    pair(k,'SearchPath',6,(wide,path,file,extension,capacity,out,part)=>{
        let name=m.string(file,wide);if(extension&&!namePart(name).includes('.'))name+=m.string(extension,wide);
        const dirs=path?m.string(path,wide).split(';'):['C:\\',winpath(state.cwd)];
        for(const dir of dirs){let candidate;try{candidate=filePath(/[:\\/]/.test(name)?name:dir+'\\'+name);}catch{continue;}if(!rt.files.has(candidate))continue;const full=winpath(candidate),n=copyWinString(out,capacity,full,wide);if(part&&capacity>full.length)m.w32(part,out+(full.lastIndexOf('\\')+1)*(wide?2:1));return n;}return fail(2);
    });
    k('SetUnhandledExceptionFilter',1,p=>{const previous=state.exceptionFilter||0;state.exceptionFilter=p;return previous;});
    unsupported('kernel32.dll','UnhandledExceptionFilter',1,'Guest SEH dispatch is not implemented');
    k('TerminateProcess',2,(h,code)=>{if(h!==INVALID)return fail(6);rt.exit(code);return 1;});
    k('VirtualQuery',3,(p,out,n)=>{
        if(n<28||p>=64*1024*1024)return fail(87);const page=p&~4095,image=m.regions.find(x=>p>=x.base&&p<x.base+x.imageSize),vm=[...state.virtual].find(([base,v])=>p>=base&&p<base+v.n);
        let base=page,size=4096,allocation=0,protect=0,kind=0,commit=0x10000;
        if(image){const section=image.sections.find(x=>p>=image.base+x.rva&&p<image.base+x.rva+x.size);base=section?image.base+(section.rva&~4095):page;size=section?Math.ceil((section.rva%4096+section.size)/4096)*4096:4096;allocation=image.base;protect=section?.executable?(section.writable?0x40:0x20):(section?.writable?4:2);kind=0x1000000;commit=0x1000;}
        else if(vm){allocation=vm[0];size=vm[0]+vm[1].n-page;protect=vm[1].protection;kind=0x20000;commit=0x1000;}
        else if(p>=0x1000000&&p<m.next||p>=0x3c00000&&p<0x3f00000){allocation=page;protect=4;kind=0x20000;commit=0x1000;}
        m.zero(out,28);[base,allocation,protect,size,commit,protect,kind].forEach((v,i)=>m.w32(out+i*4,v));return 28;
    });
    // _mingw pseudo-relocations change writable protection on their own image.
    const protectVirtual=rt.apis.get('kernel32.dll!VirtualProtect').fn;
    k('VirtualProtect',4,(p,n,protect,old)=>{const image=m.regions.find(x=>p>=x.base&&p+n<=x.base+x.imageSize);if(!image)return protectVirtual(p,n,protect,old);if(!n||![2,4,0x20,0x40].includes(protect))return fail(87);const section=image.sections.find(x=>p>=image.base+x.rva&&p<image.base+x.rva+x.size);m.w32(old,section?.executable?0x20:section?.writable?4:2);if(protect&0x60)c.mark_executable(p,n);return 1;});
    crt('__lconv_init',0,()=>{rt.apis.get('msvcrt.dll!localeconv').fn();});
    crt('_lock',1,id=>{state.crtLocks||=new Map();state.crtLocks.set(id,(state.crtLocks.get(id)||0)+1);});
    crt('_unlock',1,id=>{const count=state.crtLocks?.get(id);if(!count)throw Error('Unbalanced CRT lock');state.crtLocks.set(id,count-1);});
    crt('_amsg_exit',1,n=>{rt.log('CRT runtime error '+n+'\n');rt.exit(255);});
    crt('abort',0,()=>{rt.log('Guest program aborted\n');rt.exit(3);});
    for(const [name,n]of[['_spawnvp',3],['_cwait',3]])unsupported('msvcrt.dll',name,n,'Child processes are not implemented in this browser runtime',true);
    crt('_getcwd',2,(p,n)=>{const text=winpath(state.cwd);if(!p)return m.str(text);if(n<=text.length){m.w32(errno(),34);return 0;}m.putString(p,text,false,n);return p;});
    crt('_strlwr',1,p=>{m.putString(p,m.string(p).toLowerCase());return p;});
    crt('_strnicmp',3,(a,b,n)=>{if(n>1048576)throw Error('Comparison budget');const x=m.string(a).slice(0,n).toLowerCase(),y=m.string(b).slice(0,n).toLowerCase();return x===y?0:x<y?-1:1;});
    crt('_unlink',1,p=>rt.apis.get('kernel32.dll!DeleteFileA').fn(p)?0:-1);crt('remove',1,p=>rt.apis.get('msvcrt.dll!_unlink').fn(p));
    crt('_open',2,(p,flags)=>{
        const mode=flags&3,create=flags&0x100,truncate=flags&0x200,exclusive=flags&0x400;
        if(mode===3||flags&~(3|8|0x10|0x80|0x100|0x200|0x400|0x4000|0x8000)){m.w32(errno(),22);return -1;}
        const disposition=create?(exclusive?1:truncate?2:4):truncate?5:3;
        const h=rt.apis.get('kernel32.dll!CreateFileA').fn(p,mode===0?0x80000000:mode===1?0x40000000:0xc0000000,3,0,disposition,0,0);if(h===INVALID){m.w32(errno(),rt.lastError===2?2:13);return -1;}
        const fd=state.nextFD++;state.fds.set(fd,h);if(flags&8)seek(h,0,2);return fd;
    });
    crt('_dup',1,fd=>{const h=fdHandle(fd);if(h===INVALID)return -1;const out=state.nextFD++;state.fds.set(out,[STDIN,STDOUT,STDERR].includes(h)?h:rt.handle(rt.get(h,'file')));return out;});
    crt('_fdopen',2,(fd,mode)=>{const h=fdHandle(fd);if(h===INVALID)return 0;const p=m.alloc(32);state.streams.set(p,{h,fd,unget:[],eof:false,error:false});m.w32(p+12,m.string(mode).startsWith('r')?1:2);m.w32(p+16,fd);return p;});
    crt('fgets',3,(out,n,p)=>{if(!n||n>FILE_LIMIT)return 0;m.check(out,n);let count=0;while(count<n-1){const b=get(p,1);if(!b.length)break;m.w8(out+count++,b[0]);if(b[0]===10)break;}m.w8(out+count,0);return count?out:0;});
    for(const[name,test]of[['islower',n=>n>=97&&n<=122],['isupper',n=>n>=65&&n<=90],['isspace',n=>n===32||n>=9&&n<=13],['isdigit',n=>n>=48&&n<=57],['isalpha',n=>n>=65&&n<=90||n>=97&&n<=122],['isalnum',n=>n>=48&&n<=57||n>=65&&n<=90||n>=97&&n<=122]])crt(name,1,ch=>test(ch)?1:0);
    crt('tolower',1,ch=>ch>=65&&ch<=90?ch+32:ch);crt('toupper',1,ch=>ch>=97&&ch<=122?ch-32:ch);
    crt('_vsnprintf',4,(out,n,p,ap)=>{const text=format(m.string(p),ap),bytes=textBytes(text);m.copy(out,bytes.subarray(0,n));if(text.length<n)m.w8(out+text.length,0);return text.length>=n?-1:text.length;});
    crt('strerror',1,n=>m.str(({0:'No error',2:'No such file or directory',12:'Not enough memory',13:'Permission denied',22:'Invalid argument',34:'Result out of range'})[n]||'Unknown virtual runtime error'));
    crt('time',1,p=>{const seconds=Math.floor(Date.now()/1000);if(p)m.w32(p,seconds);return seconds;});
    crt('localtime',1,p=>{const date=new Date((m.i32(p))*1000),out=state.tm||=m.alloc(36),start=Date.UTC(date.getFullYear(),0,1),day=Math.floor((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-start)/86400000);[date.getSeconds(),date.getMinutes(),date.getHours(),date.getDate(),date.getMonth(),date.getFullYear()-1900,date.getDay(),day,0].forEach((v,i)=>m.w32(out+i*4,v));return out;});
    crt('signal',2,(signal,handler)=>{if(![2,4,8,11,15,21,22].includes(signal)){m.w32(errno(),22);return INVALID;}state.signals||=new Map();const old=state.signals.get(signal)||0;state.signals.set(signal,handler);return old;});
    crt('raise',1,async signal=>{const handler=state.signals?.get(signal);if(handler===1)return 0;if(handler){await rt.invoke(handler,[signal],true);return 0;}rt.exit(128+signal);return 0;});
    // setjmp/longjmp restore the emulated ABI, never the JavaScript call stack.
    crt('_setjmp3',2,(p,unwind)=>{if(unwind>0)throw Error('SEH-unwinding setjmp is not supported');m.check(p,64);state.jumps||=new Map();if(state.jumps.size>=256&&!state.jumps.has(p))throw Error('jmp_buf quota exceeded');const regs=Array.from({length:10},(_,i)=>c.get_reg(i)>>>0),sp=regs[4];regs[4]=sp+4;regs[8]=m.u32(sp);state.jumps.set(p,{regs,depth:rt.depth});return 0;});
    crt('longjmp',2,(p,value)=>{const saved=state.jumps?.get(p);if(!saved||saved.depth!==rt.depth)throw Error('Invalid or cross-callback longjmp');return {jump:{regs:saved.regs,value:value||1}};});
    crt('qsort',4,async(base,count,size,compare)=>{
        if(count>65536||!size||count*size>FILE_LIMIT)throw Error('qsort budget exceeded');m.check(base,count*size);let indices=Array.from({length:count},(_,i)=>i);
        for(let width=1;width<count;width*=2){const next=[];for(let start=0;start<count;start+=width*2){let i=start,j=Math.min(start+width,count),mid=j,end=Math.min(start+2*width,count);while(i<mid||j<end){if(j>=end||i<mid&&(await rt.invoke(compare,[base+indices[i]*size,base+indices[j]*size],true)|0)<=0)next.push(indices[i++]);else next.push(indices[j++]);}}indices=next;}
        const bytes=m.bytes.slice(base,base+count*size);for(let i=0;i<count;i++)m.copy(base+i*size,bytes.subarray(indices[i]*size,(indices[i]+1)*size));
    });
    const returnFloat=value=>{if(!c.fpu_push)throw Error('Floating-point CPU tier is unavailable');c.fpu_push(value);return 0;};
    crt('strtod',2,(p,end)=>{const text=m.string(p),match=text.match(/^\s*[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|inf(?:inity)?|nan)/i);if(end)m.w32(end,p+(match?.[0].length||0));return returnFloat(match?Number(match[0]):0);});
    crt('ldexp',3,(lo,hi,exp)=>{const buffer=new ArrayBuffer(8),v=new DataView(buffer);v.setUint32(0,lo,true);v.setUint32(4,hi,true);return returnFloat(v.getFloat64(0,true)*2**(exp|0));});
    // Only integer/string scans are advertised; other conversions fail explicitly.
    crt('sscanf',2,(input,fmt)=>{const text=m.string(input),pattern=m.string(fmt);let at=0,ap=varargs(2),assigned=0;for(let i=0;i<pattern.length;i++){
        if(/\s/.test(pattern[i])){while(/\s/.test(text[at]||'')&&at<text.length)at++;continue;}if(pattern[i]!=='%'){if(text[at++]!==pattern[i])break;continue;}i++;if(pattern[i]==='%'){if(text[at++]!=='%')break;continue;}
        let skip=false;if(pattern[i]==='*'){skip=true;i++;}let width='';while(/[0-9]/.test(pattern[i]||'')){width+=pattern[i++];}let long=false;if(pattern[i]==='l'){long=true;i++;}const type=pattern[i],limit=width?Number(width):1048576;if(!['d','u','x','i','s','c'].includes(type))throw Error('Unsupported sscanf conversion');if(type!=='c')while(at<text.length&&/\s/.test(text[at]))at++;
        const remaining=text.slice(at,at+limit),match=type==='s'?remaining.match(/^\S+/):type==='c'?[remaining.slice(0,width?limit:1)]:remaining.match(type==='x'?/^[+-]?(?:0x)?[0-9a-f]+/i:type==='i'?/^[+-]?(?:0x[0-9a-f]+|[0-9]+)/i:/^[+-]?[0-9]+/);if(!match||!match[0])break;at+=match[0].length;
        if(!skip){const out=m.u32(ap);ap+=4;if(type==='s')m.putString(out,match[0]);else if(type==='c')m.copy(out,textBytes(match[0]));else m.w32(out,parseInt(match[0],type==='x'?16:type==='i'&&/^[-+]?0x/i.test(match[0])?16:10));assigned++;}
    }return assigned;});

}
Object.assign(W, {installCompat, splitCommandLine});
if (typeof module !== 'undefined' && module.exports) module.exports = W;
})();
