/* Local app-library records. Data only: no HTML execution, network or DOM. MIT. */
'use strict';
(() => {
    const LIMITS = Object.freeze({ apps: 128, html: 5 * 1024 * 1024, title: 60, description: 500, category: 48, url: 2048 });
    const ICONS = Object.freeze(['code','globe','file','folder','paint','image','play','video','spark','settings','calculator','calendar','clock','check','terminal','gpu','rect','music','book']);
    const COLORS = Object.freeze(['blue','violet','teal','green','gold','coral','slate','charcoal']);
    const DEFAULT_DESCRIPTION = 'Your sandboxed HTML application';
    function text(value, fallback, max) { return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max) : fallback; }
    function url(value) {
        if (typeof value !== 'string' || value.length > LIMITS.url || /[\u0000-\u0020\u007f]/.test(value)) throw Error('Enter a complete HTTPS website address without spaces or credentials.');
        let u; try { u = new URL(value); } catch { throw Error('Enter a complete HTTPS website address.'); }
        if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) throw Error('Only HTTPS website addresses without credentials are allowed.');
        return u.href;
    }
    function path(value) {
        if (typeof value !== 'string' || value.length > 1024 || !value.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(value)) throw Error('Invalid virtual HTML source path.');
        const parts = value.slice(1).split('/');
        if (parts.length < 2 || parts.some(p => !p || p === '.' || p === '..') || ['Local','.Trash'].includes(parts[0]) || parts[0].startsWith('.')) throw Error('Use an ordinary Aster virtual file, not a host folder or reserved path.');
        return value;
    }
    function normalize(value, persistent = true) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid installed application.');
        if (typeof value.id !== 'string' || !(persistent ? /^custom-[\w-]{1,90}$/ : /^[a-z][\w-]{0,97}$/).test(value.id) || ['constructor','prototype','__proto__'].includes(value.id) || value.id.startsWith('web-')) throw Error('Invalid installed application identifier.');
        if(value.kind != null && !['html','url'].includes(value.kind)) throw Error('Unsupported installed app type.');
        const kind = value.kind === 'url' ? 'url' : 'html', title = text(value.title,'',LIMITS.title);
        if (!title) throw Error('An app name is required.');
        const r = { schema: 2, id: value.id, kind, title,
            description: text(value.description,kind === 'html' ? DEFAULT_DESCRIPTION : 'Your sandboxed web shortcut',LIMITS.description),
            category: text(value.category,'Your apps',LIMITS.category) || 'Your apps',
            icon: ICONS.includes(value.icon) ? value.icon : kind === 'html' ? 'code' : 'globe',
            color: COLORS.includes(value.color) ? value.color : 'violet',
            publisher: text(value.publisher,'',80), version: text(value.version,'',40),
            favorite: value.favorite === true,
            installedAt: Number.isSafeInteger(value.installedAt) && value.installedAt > 0 ? value.installedAt : 0,
            updatedAt: Number.isSafeInteger(value.updatedAt) && value.updatedAt > 0 ? value.updatedAt : 0,
            revision: Number.isSafeInteger(value.revision) && value.revision > 0 ? value.revision : 0 };
        if (kind === 'url') r.url = url(value.url); else r.path = path(value.path);
        return r;
    }
    function records(value) {
        const apps = [], rejected = [], seen = new Set();
        if (!Array.isArray(value)) return { apps, rejected: value == null ? [] : ['Invalid saved app list'] };
        for (const raw of value.slice(0,LIMITS.apps)) {
            try { const r = normalize(raw); if (seen.has(r.id)) throw Error('Duplicate app identifier'); seen.add(r.id); apps.push(r); }
            catch(e) { rejected.push(e.message); }
        }
        if (value.length > LIMITS.apps) rejected.push('App limit exceeded');
        return { apps, rejected };
    }
    function matches(app, query) { return [app.title,app.description,app.category,app.publisher,app.version,app.repository,app.url].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase().includes(String(query).normalize('NFKC').trim().toLocaleLowerCase()); }
    function sort(apps, order = 'name') { return [...apps].sort((a,b) => (order === 'updated' ? (b.updatedAt || 0)-(a.updatedAt || 0) : order === 'installed' ? (b.installedAt || 0)-(a.installedAt || 0) : 0) || a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:'base'}) || a.id.localeCompare(b.id)); }
    function packageData(record, source) {
        const app = normalize(record);
        if (app.kind === 'html' && (typeof source !== 'string' || new TextEncoder().encode(source).length > LIMITS.html)) throw Error('HTML apps are limited to 5 MiB.');
        const {id,path: ignored,revision,installedAt,updatedAt,...metadata} = app;
        return { format: 'aster-app-package', version: 1, app: metadata, ...(app.kind === 'html' ? {html:source} : {}) };
    }
    function unpack(value) {
        if (!value || value.format !== 'aster-app-package' || value.version !== 1 || !value.app || !['html','url'].includes(value.app.kind)) throw Error('This is not an Aster app package.');
        const r = normalize({...value.app,id:'custom-import',path:'/Projects/package.html'});
        packageData(r,value.html);
        return { details:r, source:r.kind === 'html' ? value.html : null };
    }
    const api = Object.freeze({LIMITS,ICONS,COLORS,DEFAULT_DESCRIPTION,text,url,path,normalize,records,matches,sort,packageData,unpack});
    globalThis.AsterAppLibraryModels = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
