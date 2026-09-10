/* Orbit routing and bounded persistence models. No network, DOM or executable input. MIT. */
'use strict';
((root) => {
    const N = root.AsterWebNavigation || (typeof require === 'function' ? require('./web-navigation.js') : null);
    const LIMITS = Object.freeze({tabs:20, closed:10, navigation:100, bookmarks:200, history:200, routes:100, html:5*1024*1024, shortcut:65536});
    const ENGINES = Object.freeze({duckduckgo:'https://duckduckgo.com/?q=', google:'https://www.google.com/search?q=', bing:'https://www.bing.com/search?q='});
    const text = (v, limit) => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, limit) : '';
    function address(value, engine = 'duckduckgo') {
        const url = N.address(value);
        // Let the shared validator reject active schemes before interpreting search text.
        try { return N.address(value, false); } catch {
            if (!url.startsWith(ENGINES.duckduckgo)) throw Error('Invalid address.');
            return (Object.hasOwn(ENGINES,engine) ? ENGINES[engine] : ENGINES.duckduckgo) + encodeURIComponent(value.trim());
        }
    }
    function webURL(value) {
        const url = N.address(value, false);
        if (!/^https?:\/\//.test(url)) throw Error('Enter an HTTP or HTTPS website address.');
        return url;
    }
    function preferences(raw) {
        const r = raw && typeof raw === 'object' ? raw : {};
        return {engine:Object.hasOwn(ENGINES, r.engine) ? r.engine : 'duckduckgo', recordHistory:r.recordHistory === true,
            restoreTabs:r.restoreTabs === true, confirmLeave:r.confirmLeave !== false};
    }
    function normalize(raw) {
        const r = raw && typeof raw === 'object' ? raw : {}, seen = new Set(), bookmarks=[], history=[], routes=[];
        for (const entry of Array.isArray(r.bookmarks) ? r.bookmarks.slice(0, LIMITS.bookmarks) : []) {
            try {
                const url = webURL(entry.url); if (seen.has(url)) continue; seen.add(url);
                bookmarks.push({url, title:text(entry.title,160) || new URL(url).hostname});
            } catch { /* A malformed record is never executed or promoted. */ }
        }
        seen.clear();
        for (const entry of Array.isArray(r.history) ? r.history.slice(0, LIMITS.history) : []) {
            try {
                const url = webURL(entry.url); if (seen.has(url)) continue; seen.add(url);
                history.push({url, title:text(entry.title,160)||new URL(url).hostname, time:Number.isSafeInteger(entry.time)&&entry.time>0?entry.time:0});
            } catch { }
        }
        seen.clear();
        for (const entry of Array.isArray(r.routes) ? r.routes.slice(0, LIMITS.routes) : []) {
            try {
                const origin = new URL(webURL(entry.origin)).origin;
                if (seen.has(origin) || !['browser','webview'].includes(entry.mode)) continue;
                seen.add(origin);routes.push({origin,mode:entry.mode});
            } catch { }
        }
        return {version:1,preferences:preferences(r.preferences),bookmarks,history,routes};
    }
    function route(url, mode = 'auto', routes = [], catalog = [], hostProtocol = 'https:') {
        url = N.address(url, false);
        if (url.startsWith('aster:')) return {mode:'internal',reason:'Aster page or local file'};
        if (!['auto','webview','browser'].includes(mode)) throw Error('Unknown opening mode.');
        const origin = new URL(url).origin;
        let selected = mode === 'auto' ? routes.find(r=>r.origin===origin)?.mode : mode;
        if (!selected || !['browser','webview'].includes(selected)) selected = N.catalogApp(url, catalog) ? 'webview' : 'browser';
        if (selected === 'webview' && hostProtocol === 'https:' && url.startsWith('http:')) return {mode:'browser',reason:'HTTPS desktops cannot embed insecure HTTP pages. Use a real browser tab.'};
        return {mode:selected,reason:selected === 'browser' ? 'Ordinary sites open in a real browser tab so framing policies and sign-in can work normally.' : 'Embedded webview. The website must permit framing; this does not bypass its policies.'};
    }
    function shortcut(raw) {
        if (typeof raw !== 'string' || raw.length > LIMITS.shortcut) throw Error('Website shortcuts must be under 64 KiB.');
        if (raw.trimStart().startsWith('{')) {
            const r=JSON.parse(raw);if(r.format!=='aster.link'||r.version!==1)throw Error('Not an Aster website shortcut.');
            return {url:webURL(r.url),title:text(r.title,160)};
        }
        let section='', urls=[];
        for(const line of raw.replace(/^\uFEFF/,'').split(/\r?\n/)) {
            const value=line.trim();if(/^\[.*\]$/.test(value))section=value.toLowerCase();
            else if(section==='[internetshortcut]'&&/^url\s*=/i.test(value))urls.push(value.slice(value.indexOf('=')+1).trim());
        }
        if(urls.length!==1)throw Error('The Internet shortcut must contain exactly one URL.');
        return {url:webURL(urls[0]),title:''};
    }
    function session(tabs, active, enabled) {
        if (!enabled) return {tabs:[{url:'aster://home',mode:'auto',zoom:1}],active:0};
        const saved=[];
        for(const t of (Array.isArray(tabs)?tabs:[]).slice(0,LIMITS.tabs)) {
            try { saved.push({url:N.address(t.url,false),mode:['auto','webview','browser'].includes(t.mode)?t.mode:'auto',zoom:zoom(t.zoom)}); }
            catch { saved.push({url:'aster://home',mode:'auto',zoom:1}); }
        }
        if(!saved.length)saved.push({url:'aster://home',mode:'auto',zoom:1});
        return {tabs:saved,active:Math.max(0,Math.min(saved.length-1,Number.isInteger(active)?active:0))};
    }
    function zoom(value){return Math.max(.5,Math.min(2,Math.round((Number(value)||1)*10)/10));}
    function push(history, index, url) {
        const next=history.slice(0,index+1);if(next.at(-1)!==url)next.push(url);
        return next.slice(-LIMITS.navigation);
    }
    const api=Object.freeze({LIMITS,ENGINES,text,address,webURL,preferences,normalize,route,shortcut,session,zoom,push});
    root.AsterOrbitModels=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
