/* Aster native-profile file picker models. Original UI, MIT. No filesystem authority. */
'use strict';
(function (root) {
    const name = path => path === '/' ? 'Aster' : path.split('/').at(-1);
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const DEFAULTS = Object.freeze({ view: 'list', sort: 'name', ascending: true, hidden: false, preview: false });
    function preferences(value = {}) {
        return { view: value?.view === 'grid' ? 'grid' : 'list',
            sort: ['name', 'modified', 'type', 'size'].includes(value?.sort) ? value.sort : 'name',
            ascending: value?.ascending !== false, hidden: value?.hidden === true, preview: value?.preview === true };
    }
    function type(row) {
        if (row.kind === 'directory') return 'Folder';
        const ext = name(row.path).split('.').slice(1).at(-1)?.toLowerCase();
        return ({ txt: 'Text document', md: 'Markdown document', json: 'JSON document', html: 'HTML document',
            js: 'JavaScript', css: 'Stylesheet', csv: 'CSV document', pdf: 'PDF document', zip: 'ZIP archive',
            png: 'PNG image', jpg: 'JPEG image', jpeg: 'JPEG image', webp: 'WebP image', svg: 'SVG image',
            gif: 'GIF image', mp3: 'MP3 audio', wav: 'WAV audio', mp4: 'MP4 video' })[ext] || (ext ? ext.toUpperCase() + ' file' : 'File');
    }
    function ordered(rows, prefs, query = '') {
        const p = preferences(prefs), q = query.normalize('NFC').toLocaleLowerCase().trim();
        return rows.filter(r => (p.hidden || !name(r.path).startsWith('.')) && name(r.path).normalize('NFC').toLocaleLowerCase().includes(q))
            .slice().sort((a, b) => {
                // Folders always precede files, even with descending order.
                if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
                const comparison = p.sort === 'size' || p.sort === 'modified'
                    ? (Number(a[p.sort]) || 0) - (Number(b[p.sort]) || 0)
                    : collator.compare(p.sort === 'type' ? type(a) : name(a.path), p.sort === 'type' ? type(b) : name(b.path));
                return (comparison || collator.compare(name(a.path), name(b.path)) || a.path.localeCompare(b.path)) * (p.ascending ? 1 : -1);
            });
    }
    function breadcrumbs(path) {
        const result = [{ path: '/', name: 'Aster' }]; let current = '';
        for (const part of path.split('/').filter(Boolean)) { current += '/' + part; result.push({ path: current, name: part }); }
        return result;
    }
    function select(rows, previous, target, anchor, { multiple = false, toggle = false, range = false } = {}) {
        const row = rows.find(r => r.path === target); if (!row) return new Set();
        if (!multiple || row.kind === 'directory') return new Set([target]);
        const keep = new Set([...previous].filter(p => rows.some(r => r.path === p && r.kind === 'file')));
        if (range) {
            const a = rows.findIndex(r => r.path === anchor), b = rows.indexOf(row);
            const selection = toggle ? keep : new Set();
            for (const r of rows.slice(Math.min(a < 0 ? b : a, b), Math.max(a < 0 ? b : a, b) + 1)) if (r.kind === 'file') selection.add(r.path);
            return selection;
        }
        if (toggle) { if (keep.has(target)) keep.delete(target); else keep.add(target); return keep; }
        return new Set([target]);
    }
    class History {
        constructor(path) { this.paths = [path]; this.index = 0; }
        get back() { return this.index > 0; }
        get forward() { return this.index < this.paths.length - 1; }
        target(step) { return this.paths[this.index + step]; }
        commit(path, index = null) {
            if (index !== null && this.paths[index] === path) { this.index = index; return; }
            if (this.paths[this.index] === path) return;
            this.paths = this.paths.slice(0, this.index + 1); this.paths.push(path);
            this.paths = this.paths.slice(-50); this.index = this.paths.length - 1;
        }
    }
    const api = Object.freeze({ name, type, preferences, ordered, breadcrumbs, select, History, DEFAULTS });
    root.AsterFilePickerModels = api; if (typeof module === 'object') module.exports = api;
})(globalThis);
