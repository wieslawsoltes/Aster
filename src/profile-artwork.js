/* Aster Prism: original geometric app artwork. MIT.
 * The same owned symbols are used in every OS-inspired profile; no platform
 * logos, smile-face file manager, compass, flower or marketplace monogram.
 * ID-free SVGs avoid collisions when hundreds of icons share a document. */
'use strict';
(() => {
    const OS = Aster;
    const paths = {
        files: '<path d="M17 18h26v11H17zM21 35h26v11H21zM22 23h6m-2 17h6"/>',
        browser: '<ellipse cx="32" cy="32" rx="18" ry="11" transform="rotate(-35 32 32)"/><path d="m25 19 15 26M19 33l26-4"/><circle cx="19" cy="25" r="3"/><circle cx="45" cy="38" r="3"/>',
        notepad: '<path d="M18 15h22l7 7v27H18zM39 15v9h8M24 30h16m-16 7h16m-16 7h9"/>',
        settings: '<path d="M16 21h32M16 32h32M16 43h32"/><rect x="22" y="17" width="7" height="8" rx="2"/><rect x="37" y="28" width="7" height="8" rx="2"/><rect x="25" y="39" width="7" height="8" rx="2"/>',
        photos: '<path d="M17 19h31v25H17zM14 27v22h25m-20-8 8-9 7 5 6-7 6 7"/><circle cx="25" cy="26" r="2.5"/>',
        store: '<path d="m22 15 8 5v10l-8 5-8-5V20zm20 16 8 5v10l-8 5-8-5V36zM39 16h12m-6-6v12M15 43h11"/>',
        calculator: '<path d="M18 15h28v34H18zM23 21h18v7H23zM23 35h6m-3-3v6m10-3h6M23 43h6m7-2h6m-6 4h6"/>',
        terminal: '<path d="M15 19h34v28H15zM16 25h32m-26 6 5 5-5 5m11 0h8"/>',
        paint: '<path d="m19 44 4-10 19-19 7 7-19 19zm4-10 7 7m-15 9h24"/><circle cx="19" cy="20" r="3"/>',
        media: '<path d="M15 22h6v21h-6zm28 0h6v21h-6zM27 18l13 14-13 14z"/>',
        code: '<path d="m23 21-11 11 11 11m18-22 11 11-11 11M35 17l-6 30"/>',
        snips: '<path d="M20 12v7h-7m31-7v7h7M13 44h7v7m31-7h-7v7M27 26l14 14m0-14L27 40"/>',
        calendar: '<path d="M16 19h32v30H16zM16 28h32M24 14v9m16-9v9M23 35h5m8 0h5m-18 8h5"/>',
        clock: '<path d="M25 14h14l11 11v14L39 50H25L14 39V25zM32 22v12l10 5"/>',
        tasks: '<path d="m15 23 4 4 7-8m5 5h16M15 36l4 4 7-8m5 5h16M15 48h28"/>',
        taskmanager: '<path d="M14 45V20m0 25h36M21 37v-9m9 9V16m9 21V25m9 12V20"/>',
        mines: '<path d="M16 16h32v32H16zM27 16v32m10-32v32M16 27h32M16 37h32"/><circle cx="32" cy="32" r="3"/>',
        welcome: '<path d="m32 14 6 12 13 6-13 6-6 13-6-13-13-6 13-6z"/><path d="m28 32 4-4 4 4-4 4z"/>',
        win32: '<rect x="20" y="20" width="24" height="24" rx="4"/><path d="M26 12v8m12-8v8m-12 24v8m12-8v8M12 26h8m-8 12h8m24-12h8m-8 12h8M27 27h10v10H27z"/>',
        trash: '<path d="M20 22h24l-2 28H22zM17 22h30M26 17h12m-10 12v14m8-14v14"/>',
        clipboard: '<path d="M24 18h-7v31h30V18h-7M24 14h16v9H24zM24 32h16m-16 8h11"/>',
        focus: '<path d="M22 16h-6v6m26-6h6v6M16 42v6h6m20 0h6v-6"/><circle cx="32" cy="32" r="10"/><circle cx="32" cy="32" r="3"/>',
        widgets: '<path d="M15 15h14v20H15zM35 15h14v10H35zM15 41h14v8H15zM35 31h14v18H35z"/>',
        workspaces: '<path d="M14 17h26v21H14zM24 43h25V26h-4M14 24h26"/>',
        history: '<path d="M17 28a16 16 0 1 1 1 14M17 16v12h12M33 22v13h9"/>',
        storage: '<path d="M16 19h32v11H16zM16 36h32v11H16zM22 24h3m-3 17h3m11-17h6m-6 17h6"/>',
        archives: '<path d="M17 17h30v31H17zM29 17v5h6v6h-6v6h6v6h-6v8M14 17v-4h36v4"/>',
        accessibility: '<circle cx="32" cy="18" r="5"/><path d="m16 28 16 5 16-5M32 33v9m0-1-10 11m10-11 10 11"/>',
        recorder: '<path d="M14 20h28v26H14zm28 8 9-5v20l-9-5"/><circle cx="28" cy="33" r="7"/>'
    };
    const palettes = [['#245d73','#82d7d2'], ['#61447c','#d4b4ec'], ['#6a4d35','#edc38b'], ['#315d60','#a2ddbc'], ['#654353','#efa9bd'], ['#384e82','#a8c8fa']];
    const order = Object.keys(paths), cache = new Map();
    OS.visualIcon = (id, size = 32) => {
        id = String(id || 'unknown'); size = Math.max(8, Math.min(128, Number.isFinite(Number(size)) ? Number(size) : 32));
        const app = OS.apps?.get(id), glyph = paths[id] || null;
        const key = id + ':' + size + ':' + (app?.icon || '');
        if (cache.has(key)) return cache.get(key);
        let hash = 0; for (const c of id.slice(0,128)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
        const [base, accent] = palettes[hash % palettes.length];
        const symbol = glyph || OS.icon(app?.icon || 'code', 32).replace('<svg ', '<svg x="16" y="16" ');
        const result = `<span class="app-icon themed-app-icon aster-prism-icon" data-icon-id="${OS.esc(id)}" style="--icon-size:${size}px;--art-base:${base};--art-accent:${accent}"><svg class="aster-icon-art" width="100%" height="100%" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false"><path class="art-plate" d="M14 4h28l18 18v28a10 10 0 0 1-10 10H14A10 10 0 0 1 4 50V14A10 10 0 0 1 14 4Z"/><path class="art-fold" d="M42 4v10a8 8 0 0 0 8 8h10Z"/><g class="art-glyph" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${symbol}</g><path class="art-signature" d="m48 52 4-4 4 4-4 4z"/></svg></span>`;
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(key, result); return result;
    };
    OS.iconArtwork = Object.freeze({ name: 'Aster Prism', builtins: Object.freeze(order), get cacheSize() { return cache.size; } });
})();
