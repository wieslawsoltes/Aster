/* Aster Desktop — original vanilla JavaScript implementation. MIT license. */
'use strict';
(() => {
    const OS = window.Aster = {
        version: '1.5.0', apps: new Map(), windows: new Map(), mounts: new Map(),
        events: new EventTarget(), clipboard: null, started: performance.now(),
        metrics: { fps: 0, frameMs: 0, drawCalls: 0, mode: 'Starting', frames: [] },
        settings: { theme: 'light', accent: '#176ae6', wallpaper: 'bloom', transparency: true, motion: true,
            highContrast: false, quality: 1, brightness: 100, volume: 65, muted: false, dnd: false, align: 'center', clock24: true,
            username: 'Aster User', restore: true, desktopIcons: true, fontSize: 13 },
        desktops: [{ id: 'desk-1', name: 'Desktop 1' }, { id: 'desk-2', name: 'Desktop 2' }],
        activeDesktop: 'desk-1', notifications: [], recent: [], customApps: [],
    };
    const $ = OS.$ = (s, r = document) => r.querySelector(s);
    OS.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    OS.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    OS.uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    OS.emit = (name, detail) => OS.events.dispatchEvent(new CustomEvent(name, { detail }));
    OS.on = (name, fn) => { const h = e => fn(e.detail); OS.events.addEventListener(name, h); return () => OS.events.removeEventListener(name, h); };
    OS.el = (tag, attrs = {}, ...children) => {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'class')
                e.className = v;
            else if (k === 'text')
                e.textContent = v;
            else if (k === 'html')
                e.innerHTML = v;
            else if (k.startsWith('on') && typeof v === 'function')
                e.addEventListener(k.slice(2), v);
            else if (v !== false && v != null)
                e.setAttribute(k, v === true ? '' : v);
        }
        children.flat().forEach(c => { if (c != null)
            e.append(typeof c === 'string' ? document.createTextNode(c) : c); });
        return e;
    };
    OS.formatBytes = n => { if (!n)
        return '0 B'; const k = 1024, i = Math.min(3, Math.floor(Math.log(n) / Math.log(k))); return `${(n / k ** i).toFixed(i ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][i]}`; };
    OS.time = (d = new Date()) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: !OS.settings.clock24 }).format(d);
    OS.date = (d = new Date()) => new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
    OS.download = (blob, name) => { const u = URL.createObjectURL(blob); const a = OS.el('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 15000); };
    OS.readFile = (accept = '', multiple = false) => new Promise(resolve => {
        const i = OS.el('input', { type: 'file', accept, multiple });
        i.hidden = true;
        document.body.append(i);
        const finish = v => { i.remove(); resolve(v); };
        i.onchange = () => finish(Array.from(i.files));
        i.oncancel = () => finish([]);
        i.click();
    });
    OS.guard = fn => async (...args) => { try {
        return await fn(...args);
    }
    catch (e) {
        if (e?.name !== 'AbortError') {
            console.error(e);
            OS.notify('Could not complete the action', e.message || String(e), 'warning');
        }
    } };
    const paths = {
        home: '<path d="m3 10 9-7 9 7v10H5V10m4 10v-7h6v7"/>',
        search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
        folder: '<path d="M3 7V5h7l2 2h9v13H3z" fill="currentColor" opacity=".25"/><path d="M3 7V5h7l2 2h9v13H3zM3 10h18"/>',
        file: '<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7m-7 4h7"/>',
        image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-6 4 4 3-4 5 6"/>',
        music: '<path d="M10 18V5l10-2v13M10 8l10-2"/><ellipse cx="7" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
        video: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',
        terminal: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m6 0h5"/>',
        settings: '<path d="m9 3 1-1h4l1 3 3 1 3 1v4l-2 2 1 3-2 3-3-1-3 2-3-2-3 1-2-3 1-3-2-2V7l3-1 3-1z"/><circle cx="12" cy="11" r="3"/>',
        globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
        back: '<path d="m14 5-7 7 7 7"/>', forward: '<path d="m10 5 7 7-7 7"/>', up: '<path d="m5 14 7-7 7 7M12 7v14"/>', down: '<path d="m5 9 7 7 7-7"/>',
        refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6"/>', plus: '<path d="M12 4v16M4 12h16"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
        min: '<path d="M5 12h14"/>', max: '<rect x="5" y="5" width="14" height="14" rx="1"/>', restore: '<path d="M8 5V3h13v13h-3M3 8h13v13H3z"/>',
        copy: '<path d="M8 5V2h13v15h-3M3 7h13v15H3z"/>', cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 12 12M8 16 20 4"/>',
        paste: '<path d="M8 5H4v17h16V5h-4M8 2h8v6H8z"/>', rename: '<path d="M12 4h7m-3.5 0v16M12 20h7M9 7H3v10h6m11-10h1v10h-1"/>',
        trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 9v9m4-9v9"/>', save: '<path d="M3 3h15l3 3v15H3zM7 3v6h10V3M7 21v-8h10v8"/>',
        download: '<path d="M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5"/>', upload: '<path d="M12 17V3m-5 5 5-5 5 5M3 16v5h18v-5"/>',
        list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
        pin: '<path d="m15 3 6 6-4 1-3 6-3-3-7 7 7-7-3-3 6-3z"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18m-14 4h2m3 0h2m3 0h1m-11 4h2m3 0h2"/>',
        check: '<path d="m4 12 5 5L20 6"/>', checklist: '<rect x="4" y="3" width="16" height="19" rx="2"/><path d="m7 9 1 1 2-3m3 2h4m-10 7 1 1 2-3m3 2h4"/>',
        paint: '<path d="m14 3 7 7-10 10H4v-7zM11 6l7 7M4 20h16"/>', code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18"/>',
        calculator: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 5h8v4H8zM8 13h1m3 0h1m3 0h1M8 17h1m3 0h1m3 0h1"/>',
        play: '<path d="m8 4 12 8-12 8z" fill="currentColor"/>', pause: '<path d="M7 4v16M17 4v16" stroke-width="4"/>', stop: '<rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor"/>',
        prev: '<path d="M5 4v16m14-16L7 12l12 8z"/>', next: '<path d="M19 4v16M5 4l12 8-12 8z"/>', speaker: '<path d="M3 9h4l5-5v16l-5-5H3zM16 8q5 4 0 8m3-11q8 7 0 14"/>',
        wifi: '<path d="M2 8q10-9 20 0M5 12q7-7 14 0M9 16q3-3 6 0"/><circle cx="12" cy="20" r="1"/>', battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M23 10v4"/><rect x="5" y="10" width="12" height="4" fill="currentColor" stroke="none"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>', moon: '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12z"/>',
        bell: '<path d="M5 17V9a7 7 0 0 1 14 0v8l2 2H3zM9 21h6"/>', lock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
        power: '<path d="M12 2v10M6 5a9 9 0 1 0 12 0"/>', user: '<circle cx="12" cy="7" r="4"/><path d="M3 22a9 9 0 0 1 18 0"/>',
        desktop: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-6 0h12"/>', gpu: '<rect x="3" y="3" width="18" height="16" rx="2"/><circle cx="10" cy="11" r="4"/><path d="M17 7v8M6 19v3m4-3v3m4-3v3"/>',
        taskview: '<rect x="2" y="4" width="13" height="16" rx="2"/><path d="M18 4h4v16h-4"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v7M12 6v1"/>',
        store: '<path d="M3 8h18l-1 14H4zM8 8V5a4 4 0 0 1 8 0v3"/><path d="m9 14 2 2 4-4"/>',
        undo: '<path d="M9 4 3 10l6 6M3 10h11a7 7 0 0 1 7 7v3"/>', redo: '<path d="m15 4 6 6-6 6m6-6H10a7 7 0 0 0-7 7v3"/>',
        eye: '<path d="M2 12q10-14 20 0-10 14-20 0z"/><circle cx="12" cy="12" r="3"/>', external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
        brush: '<path d="m9 14 10-12 3 3-12 11M9 14c-8-1-4 7-8 7 6 3 11-1 9-5z"/>', eraser: '<path d="m8 20-6-6L14 2l8 8-10 10zm-4-8 8 8m0 0h10"/>',
        line: '<path d="M3 21 21 3"/>', rect: '<rect x="3" y="5" width="18" height="14" rx="1"/>', circle: '<ellipse cx="12" cy="12" rx="9" ry="7"/>', fill: '<path d="m3 11 8-8 10 10-8 8zM3 11h18M8 2l5 5m8 10q5 5 0 5-4 0 0-5"/>',
        crop: '<path d="M6 2v16h16M2 6h16v16"/>', rotate: '<path d="M20 8a8 8 0 1 0 1 8M20 2v7h-7"/>', zoom: '<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7M6 10h8m-4-4v8"/>',
        shield: '<path d="m12 2 9 4v7c0 5-9 9-9 9s-9-4-9-9V6z"/><path d="m7 12 3 3 7-7"/>',
        bug: '<circle cx="12" cy="13" r="6"/><path d="M8 7 6 3m10 4 2-4M2 10h4m12 0h4M2 16h4m12 0h4M7 19l-3 3m13-3 3 3M12 7v12"/>',
        flag: '<path d="M5 22V3c6-5 8 5 16 0v10c-8 5-10-5-16 0"/>', spark: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
        cloud: '<path d="M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 6 6 0 0 1 1 11z"/>', disconnect: '<path d="M2 2 22 22M3 8q9-7 18-1M6 12q4-4 9-2m-6 6q3-3 6 0m-3 4h.01"/>',
        mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 5 10 8L22 5"/>',
    };
    OS.icon = (name, size = 20, cls = '') => `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
    OS.appIcon = (id, size = 32) => {
        const spec = { files: ['folder', 'gold'], browser: ['globe', 'teal'], notepad: ['file', 'blue'], terminal: ['terminal', 'charcoal'], paint: ['paint', 'violet'], photos: ['image', 'blue'], media: ['play', 'coral'], calculator: ['calculator', 'slate'], settings: ['settings', 'slate'], calendar: ['calendar', 'blue'], clock: ['clock', 'slate'], tasks: ['check', 'blue'], taskmanager: ['gpu', 'teal'], store: ['store', 'blue'], code: ['code', 'violet'], mines: ['bug', 'green'], welcome: ['spark', 'blue'], win32: ['gpu', 'violet'], snips: ['cut', 'coral'], trash: ['trash', 'slate'] };
        const app = OS.apps.get(id);
        const [icon, color] = spec[id] || (app?.icon ? [app.icon, app.color || 'blue'] : ['code', 'violet']);
        return `<span class="app-icon app-icon-${color}" style="--icon-size:${size}px">${OS.icon(icon, Math.round(size * .72))}</span>`;
    };
    OS.fileIcon = (e, size = 28) => e.kind === 'directory' ? OS.appIcon('files', size) : OS.appIcon(OS.appForFile(e.path, e.mime), size);
    OS.register = (id, config) => { OS.apps.set(id, { id, ...config }); OS.emit('apps'); };
    OS.registerCustom = record => OS.register(record.id, { title: record.title, description: 'Your sandboxed HTML application', category: 'Your apps', width: 850, height: 610, icon: 'code', custom: true, mount: async (w) => {
            const frame = OS.el('iframe', { class: 'app-frame', sandbox: 'allow-scripts allow-forms allow-modals allow-downloads', title: record.title });
            const file = await OS.fs.read(record.path);
            frame.srcdoc = await OS.fs.text(file);
            w.body.append(frame);
            w.addCleanup(() => { frame.srcdoc = ''; });
        } });
    OS.appForFile = (path, mime = '') => {
        const ext = path.split('.').pop().toLowerCase();
        if (ext === 'zip') return 'archives';
        if (ext === 'exe') return 'win32';
        if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif'].includes(ext))
            return 'photos';
        if (mime.startsWith('audio/') || mime.startsWith('video/') || ['mp3', 'wav', 'ogg', 'mp4', 'webm', 'm4a', 'flac'].includes(ext))
            return 'media';
        if (['html', 'htm'].includes(ext))
            return 'browser';
        return 'notepad';
    };
    OS.openPath = async (path) => { const f = await OS.fs.stat(path); if (!f)
        throw Error('File not found: ' + path); if (f.kind === 'directory')
        OS.launch('files', { path });
    else {
        OS.recent = [path, ...OS.recent.filter(x => x !== path)].slice(0, 16);
        OS.db.set('recent', OS.recent);
        OS.launch(OS.appForFile(path, f.mime), { path });
    } };
    class Database {
        async init() {
            try {
                this.db = await new Promise((resolve, reject) => { const r = indexedDB.open('aster-desktop', 2); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('files')) r.result.createObjectStore('files', { keyPath: 'path' }); if (!r.result.objectStoreNames.contains('meta')) r.result.createObjectStore('meta'); if (!r.result.objectStoreNames.contains('history')) r.result.createObjectStore('history', { keyPath: 'id' }); }; let blocked=false;r.onblocked=()=>{blocked=true;reject(Error('Close other Aster tabs, then reload to upgrade storage. This tab is memory-only until then.'));};r.onsuccess = () => {if(blocked)r.result.close();else resolve(r.result);}; r.onerror = () => reject(r.error); });
                this.db.onversionchange=()=>{this.db.close();this.problem='Storage changed in another Aster tab. Reload before saving.';console.warn(this.problem);};
                this.mode = 'IndexedDB';
            }
            catch (e) {
                this.problem=e.message;console.warn('Persistent storage unavailable', e);
                this.memory = { files: new Map(), meta: new Map(), history: new Map() };
                this.mode = 'Memory only';
            }
        }
        async request(store, mode, op) {
            if (this.memory)
                return op(null, this.memory[store]);
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, mode);
                const r = op(tx.objectStore(store));
                let result;
                if (r) {
                    r.onsuccess = () => result = r.result;
                    r.onerror = () => reject(r.error);
                }
                tx.oncomplete = () => resolve(result);
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || Error('Storage transaction aborted'));
            });
        }
        get(k) { return this.request('meta', 'readonly', (s, m) => s ? s.get(k) : m.get(k)); }
        set(k, v) { return this.request('meta', 'readwrite', (s, m) => s ? s.put(v, k) : m.set(k, v)); }
        all() { return this.request('files', 'readonly', (s, m) => s ? s.getAll() : Array.from(m.values())); }
        file(p) { return this.request('files', 'readonly', (s, m) => s ? s.get(p) : m.get(p)); }
        async batch(puts = [], deletes = []) { return this.request('files', 'readwrite', (s, m) => { for (const p of deletes)
            s ? s.delete(p) : m.delete(p); for (const e of puts)
            s ? s.put(e) : m.set(e.path, e); }); }
    }
    OS.db = new Database();
    class FileSystem {
        normalize(path) { const a = []; for (const p of String(path).replace(/\\/g, '/').split('/')) {
            if (!p || p === '.')
                continue;
            if (p === '..')
                a.pop();
            else
                a.push(p);
        } return '/' + a.join('/'); }
        parent(path) { path = this.normalize(path); return path.slice(0, path.lastIndexOf('/')) || '/'; }
        name(path) { return this.normalize(path).split('/').pop() || 'Aster'; }
        join(a, b) { return this.normalize(a + '/' + b); }
        validateName(name) { if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name) || name.trim() !== name)
            throw Error('Use a name without slashes, leading/trailing spaces, or null characters.'); return name; }
        native(path) { const p = this.normalize(path).split('/').filter(Boolean); if (p[0] !== 'Local' || !p[1])
            return null; const root = OS.mounts.get(p[1]); return root ? { root, parts: p.slice(2), mount: p[1] } : null; }
        async handle(path, parent = false) {
            const n = this.native(path);
            if (!n)
                throw Error('Local folder is not mounted.');
            let h = n.root;
            const parts = parent ? n.parts.slice(0, -1) : n.parts;
            for (let i = 0; i < parts.length; i++) {
                if (i === parts.length - 1 && !parent) {
                    try {
                        h = await h.getDirectoryHandle(parts[i]);
                    }
                    catch (e) {
                        if (e.name !== 'TypeMismatchError' && e.name !== 'NotFoundError')
                            throw e;
                        h = await h.getFileHandle(parts[i]);
                    }
                }
                else
                    h = await h.getDirectoryHandle(parts[i]);
            }
            return h;
        }
        async stat(path) { path = this.normalize(path); if (path === '/')
            return { path, kind: 'directory', modified: 0 }; if (path === '/Local')
            return { path, kind: 'directory', modified: 0 }; if (this.native(path)) {
            try {
                const h = await this.handle(path);
                return h.kind === 'directory' ? { path, kind: h.kind, native: true, modified: 0 } : { path, kind: h.kind, native: true, ...await this.fileInfo(h) };
            }
            catch (e) {
                if (e.name === 'NotFoundError')
                    return null;
                throw e;
            }
        } return OS.db.file(path); }
        async fileInfo(h) { const f = await h.getFile(); return { mime: f.type, size: f.size, modified: f.lastModified }; }
        async list(path = '/') {
            path = this.normalize(path);
            if (path === '/Local')
                return Array.from(OS.mounts.keys()).map(n => ({ path: '/Local/' + n, kind: 'directory', native: true, modified: 0 }));
            if (this.native(path)) {
                const h = await this.handle(path), rows = [];
                for await (const [name, entry] of h.entries()) {
                    rows.push({ path: this.join(path, name), kind: entry.kind, native: true, ...(entry.kind === 'file' ? await this.fileInfo(entry) : { modified: 0 }) });
                }
                return this.sort(rows);
            }
            const all = await OS.db.all();
            const rows = all.filter(e => this.parent(e.path) === path && e.path !== path);
            if (path === '/')
                rows.push({ path: '/Local', kind: 'directory', modified: 0 });
            return this.sort(rows);
        }
        sort(rows) { return rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1) || this.name(a.path).localeCompare(this.name(b.path), undefined, { numeric: true })); }
        async read(path) { path = this.normalize(path); if (this.native(path)) {
            const h = await this.handle(path);
            if (h.kind !== 'file')
                throw Error('This is a folder.');
            return { path, kind: 'file', content: await h.getFile(), native: true, ...await this.fileInfo(h) };
        } const f = await OS.db.file(path); if (!f)
            throw Error('File not found: ' + path); return f; }
        async text(file) { return file.content instanceof Blob ? file.content.text() : String(file.content ?? ''); }
        async blob(file) { return file.content instanceof Blob ? file.content : new Blob([file.content ?? ''], { type: file.mime || 'text/plain' }); }
        mime(path) { const e = path.split('.').pop().toLowerCase(); return ({ zip: 'application/zip', txt: 'text/plain', md: 'text/markdown', json: 'application/json', js: 'text/javascript', css: 'text/css', html: 'text/html', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', wav: 'audio/wav', mp3: 'audio/mpeg', mp4: 'video/mp4', webm: 'video/webm', ogg: 'audio/ogg' })[e] || 'application/octet-stream'; }
        async write(path, content, mime) {
            path = this.normalize(path);
            this.validateName(this.name(path));
            mime = mime || this.mime(path);
            if (path === '/' || path === '/Local')
                throw Error('Choose a file name.');
            if (path.startsWith('/Local/') && !this.native(path))
                throw Error('Connect that local folder first.');
            if (this.native(path)) {
                const parent = await this.handle(path, true);
                const h = await parent.getFileHandle(this.name(path), { create: true });
                const writer = await h.createWritable();
                try {
                    await writer.write(content);
                    await writer.close();
                }
                catch (e) {
                    await writer.abort().catch(() => { });
                    throw e;
                }
            }
            else {
                const p = await this.stat(this.parent(path));
                if (!p || p.kind !== 'directory')
                    throw Error('The parent folder does not exist.');
                const old = await this.stat(path);
                if (old?.kind === 'directory')
                    throw Error('A folder already uses this name.');
                await OS.db.writeVersioned({ path, kind: 'file', mime, content, size: content instanceof Blob ? content.size : new Blob([content]).size, modified: Date.now() });
            }
            OS.emit('fs-change', { path });
            return path;
        }
        async mkdir(path) { path = this.normalize(path); if (path.startsWith('/Local/') && !this.native(path))
            throw Error('Connect that local folder first.'); this.validateName(this.name(path)); if (await this.stat(path))
            throw Error('A file or folder already uses that name.'); const p = await this.stat(this.parent(path)); if (!p || p.kind !== 'directory')
            throw Error('Parent folder not found.'); if (this.native(path)) {
            const h = await this.handle(path, true);
            await h.getDirectoryHandle(this.name(path), { create: true });
        }
        else
            await OS.db.batch([{ path, kind: 'directory', modified: Date.now() }]); OS.emit('fs-change', { path }); return path; }
        async unique(path) { let p = path, i = 2; const base = this.name(path), parent = this.parent(path), dot = base.lastIndexOf('.'); while (await this.stat(p)) {
            const n = dot > 0 ? `${base.slice(0, dot)} (${i++})${base.slice(dot)}` : `${base} (${i++})`;
            p = this.join(parent, n);
        } return p; }
        protected(path) { return ['/', '/Local', '/.Trash', '/Desktop', '/Documents', '/Downloads', '/Pictures', '/Music', '/Videos', '/Projects'].includes(path) || (this.native(path)?.parts.length === 0); }
        async copy(src, dest, move = false) {
            src = this.normalize(src);
            dest = this.normalize(dest);
            if (dest.startsWith('/Local/') && !this.native(dest))
                throw Error('Connect that local folder first.');
            if (src === dest)
                return dest;
            if (dest.startsWith(src + '/'))
                throw Error('A folder cannot be placed inside itself.');
            if (move && this.protected(src))
                throw Error('This system folder cannot be moved.');
            if (await this.stat(dest))
                throw Error('The destination already exists.');
            const f = await this.stat(src);
            if (!f)
                throw Error('Source not found.');
            if (!this.native(src) && !this.native(dest)) {
                const parent = await this.stat(this.parent(dest));
                if (!parent || parent.kind !== 'directory')
                    throw Error('Destination folder not found.');
                const all = await OS.db.all(), entries = all.filter(e => e.path === src || e.path.startsWith(src + '/'));
                await OS.db.batch(entries.map(e => ({ ...e, path: dest + e.path.slice(src.length), modified: Date.now() })), move ? entries.map(e => e.path) : []);
            }
            else {
                if (f.kind === 'directory') {
                    await this.mkdir(dest);
                    for (const child of await this.list(src))
                        await this.copy(child.path, this.join(dest, this.name(child.path)), false);
                }
                else {
                    const full = await this.read(src);
                    await this.write(dest, await this.blob(full), full.mime);
                }
                if (move)
                    await this.remove(src, true);
            }
            OS.emit('fs-change', { path: dest });
            return dest;
        }
        async remove(path, permanent = false) {
            path = this.normalize(path);
            if (this.protected(path))
                throw Error('This system folder cannot be removed.');
            const f = await this.stat(path);
            if (!f)
                return;
            if (this.native(path)) {
                if (!permanent)
                    throw Error('Local files must be explicitly deleted permanently.');
                const h = await this.handle(path, true);
                await h.removeEntry(this.name(path), { recursive: true });
            }
            else if (permanent || path.startsWith('/.Trash/')) {
                const rows = await OS.db.all();
                await OS.db.batch([], rows.filter(e => e.path === path || e.path.startsWith(path + '/')).map(e => e.path));
            }
            else {
                const dest = '/.Trash/' + OS.uid() + '_' + this.name(path);
                const rows = (await OS.db.all()).filter(e => e.path === path || e.path.startsWith(path + '/'));
                await OS.db.batch(rows.map(e => ({ ...e, path: dest + e.path.slice(path.length), ...(e.path === path ? { originalPath: path, deletedAt: Date.now() } : {}) })), rows.map(e => e.path));
                OS.emit('fs-change', { path });
                return dest;
            }
            OS.emit('fs-change', { path });
        }
        async restore(path) { const e = await this.stat(path); if (!e?.originalPath)
            throw Error('This item has no original location.'); let parent = this.parent(e.originalPath); if (!await this.stat(parent))
            parent = '/Documents'; const dest = await this.unique(this.join(parent, this.name(e.originalPath))); await this.copy(path, dest, true); const row = await this.stat(dest); delete row.originalPath; delete row.deletedAt; await OS.db.batch([row]); OS.emit('fs-change', { path: dest }); return dest; }
        async mount() { if (!window.showDirectoryPicker)
            throw Error('This browser does not support local folder access. Use Import files instead, or open Aster in a compatible browser.'); const h = await window.showDirectoryPicker({ mode: 'readwrite' }); let name = h.name, i = 2; while (OS.mounts.has(name))
            name = h.name + ' ' + i++; OS.mounts.set(name, h); OS.emit('fs-change', { path: '/Local' }); return '/Local/' + name; }
        async import(files, dir = '/Downloads') { let count = 0; for (const f of files) {
            const path = await this.unique(this.join(dir, f.name));
            await this.write(path, f, f.type || this.mime(path));
            count++;
        } return count; }
        async seed() {
            if (await OS.db.get('seeded'))
                return;
            const directories = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Projects', '.Trash'];
            await OS.db.batch(directories.map(n => ({ path: '/' + n, kind: 'directory', modified: Date.now() })));
            await this.write('/Documents/Welcome to Aster.md', `# Welcome to Aster\n\nYour space. Your pace.\n\nAster is an independent browser desktop, written in plain HTML, CSS, JavaScript and WGSL. This is a working web environment, not a bootable operating system.\n\n## Make yourself at home\n\n- Open apps from Start or the taskbar.\n- Drag, resize and snap windows. Hover over Maximize for layouts.\n- Write a note, draw in Paint, or play the built-in music.\n- Use File Explorer to organize your browser-local files.\n- Connect a local folder with your permission. Saving there modifies real files.\n- Build an HTML/CSS/JS app in Code Studio and run it in a sandbox.\n\n## Keyboard shortcuts\n\nCtrl + Space: Start / search\nCtrl + Alt + T: Terminal\nCtrl + Alt + N: Notepad\nCtrl + Alt + D: Show desktop\nCtrl + Alt + Left / Right: Snap active window\nCtrl + Alt + Up: Maximize active window\nCtrl + Alt + Tab: Task view\nCtrl + S: Save in supported editors\nEscape: Dismiss menus\n\n## Your data\n\nVirtual files are saved in IndexedDB in this browser profile. They are not cloud-synced. Export a backup from Settings before clearing site data. Imported local folders are connected only for this session.\n\n## Honest boundaries\n\nWin32 Lab executes a limited subset of 32-bit Windows EXEs locally in your browser. Aster does not emulate a Windows kernel, support MSI installers, or give guest programs unrestricted access to your computer. The terminal operates on Aster files; it is not your machine's shell. Some websites prevent embedding. Hardware and network controls remain with your real operating system.\n\nEnjoy your new workspace.\n`, 'text/markdown');
            await this.write('/Documents/Ideas.txt', 'A little room for big ideas.\n\n1. Build something useful.\n2. Make it a little more beautiful.\n3. Share it with someone.\n', 'text/plain');
            await this.write('/Projects/Hello Aster.html', `<!doctype html><html><head><meta charset="utf-8"><style>body{font:18px system-ui;display:grid;place-items:center;min-height:90vh;background:#edf3ff;color:#13214b}main{text-align:center}button{font:inherit;border:0;background:#176ae6;color:white;padding:14px 26px;border-radius:12px;cursor:pointer}h1{font-size:52px;letter-spacing:-2px}</style></head><body><main><p>MY FIRST ASTER APP</p><h1>Hello, little universe.</h1><p>This is a real HTML app running in a sandbox.</p><button id="count">You clicked 0 times</button></main><script>let n=0;document.querySelector('button').onclick=e=>e.target.textContent='You clicked '+(++n)+' times';<\/script></body></html>`, 'text/html');
            const palettes = [['Blue hour', '#061c52', '#1769d5', '#7bcdff'], ['Aurora', '#062d2e', '#199a85', '#aff2bf'], ['Afterglow', '#351557', '#a44a92', '#ffd3a8']];
            for (const [name, a, b, c] of palettes) {
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><linearGradient id="r" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${b}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><g fill="none" stroke="url(#r)" stroke-width="95">${Array.from({ length: 8 }, (_, i) => `<path d="M${-180 + i * 105},1100 C${500 + i * 42},${950 - i * 95} ${70 + i * 85},${120 - i * 10} ${950 + i * 90},${170 + i * 60} S1800,550 1700,1100"/>`).join('')}</g></svg>`;
                await this.write('/Pictures/' + name + '.svg', svg, 'image/svg+xml');
            }
            // Original procedural audio. No external media is downloaded.
            const rate = 16000, seconds = 12, buffer = new ArrayBuffer(44 + rate * seconds * 2), v = new DataView(buffer), str = (o, s) => { for (let i = 0; i < s.length; i++)
                v.setUint8(o + i, s.charCodeAt(i)); };
            str(0, 'RIFF');
            v.setUint32(4, 36 + rate * seconds * 2, true);
            str(8, 'WAVE');
            str(12, 'fmt ');
            v.setUint32(16, 16, true);
            v.setUint16(20, 1, true);
            v.setUint16(22, 1, true);
            v.setUint32(24, rate, true);
            v.setUint32(28, rate * 2, true);
            v.setUint16(32, 2, true);
            v.setUint16(34, 16, true);
            str(36, 'data');
            v.setUint32(40, rate * seconds * 2, true);
            const notes = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66];
            for (let i = 0; i < rate * seconds; i++) {
                const t = i / rate;
                let s = 0;
                for (let n = 0; n < notes.length; n++) {
                    const dt = t - n * 1.25;
                    if (dt >= 0 && dt < 4)
                        s += Math.sin(2 * Math.PI * notes[n] * dt) * Math.exp(-dt * 1.4) * Math.min(1, dt * 35) * .2;
                }
                s *= Math.min(1, (seconds - t) * 2);
                v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 26000, true);
            }
            await this.write('/Music/First light.wav', new Blob([buffer], { type: 'audio/wav' }), 'audio/wav');
            await OS.db.set('tasks', [{ id: OS.uid(), title: 'Make this workspace yours', done: false, priority: 'normal', due: '', notes: 'Try Personalization in Settings.' }, { id: OS.uid(), title: 'Create your first note', done: false, priority: 'normal', due: '', notes: '' }, { id: OS.uid(), title: 'Explore Aster', done: true, priority: 'normal', due: '', notes: '' }]);
            await OS.db.set('seeded', true);
        }
    }
    OS.fs = new FileSystem();
    OS.applySettings = () => {
        const s = OS.settings, theme = s.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.theme;
        document.body.dataset.theme = theme;
        document.body.classList.toggle('no-transparency', !s.transparency);
        document.body.classList.toggle('no-motion', !s.motion);
        document.body.classList.toggle('high-contrast', !!s.highContrast);
        document.documentElement.style.setProperty('--accent', s.accent);
        document.documentElement.style.setProperty('--font-size', s.fontSize + 'px');
        $('#brightness').style.opacity = String((100 - s.brightness) / 100 * .8);
        $('#desktop-icons').hidden = !s.desktopIcons;
        OS.renderer?.invalidate();
        OS.emit('settings', s);
    };
    OS.setSetting = async (k, v) => { OS.settings[k] = v; OS.applySettings(); await OS.db.set('settings', OS.settings); };
    OS.init = async () => {
        await OS.db.init();
        Object.assign(OS.settings, await OS.db.get('settings') || {});
        OS.recent = await OS.db.get('recent') || [];
        OS.notifications = await OS.db.get('notifications') || [];
        OS.desktops = await OS.db.get('desktops') || OS.desktops;
        OS.activeDesktop = OS.desktops[0].id;
        await OS.fs.seed();
        OS.customApps = await OS.db.get('customApps') || [];
        OS.customApps.forEach(OS.registerCustom);
        await OS.initDesktopServices();
        OS.applySettings();
    };
})();
