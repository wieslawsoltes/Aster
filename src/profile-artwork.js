/* Aster Atelier: original adaptive application artwork. MIT.
 * Windows: free silhouettes; macOS: layered enclosures; GNOME: solid objects.
 * Original purpose glyphs, never native logos or extracted platform artwork.
 * ID-free SVG and bounded LRU output make repeated inline instances safe. */
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
    // Main metaphors are purpose-based. Silhouettes are not interchangeable
    // colored badges: papers, folders, instruments, disks and tools read at 16px.
    const illustrations={
        files:'<path class="art-paper" d="M19 18h12v15H19zM29 21h14v14H29z"/><path d="M23 22h4m7 3h5"/><path class="art-ink-fill" d="M19 39h14v3H19z"/><path d="M19 46h22"/>',
        notepad:'<path class="art-accent-fill" d="M12 10h5v43h-5z"/><path d="M24 23h14m-14 8h19m-19 8h19m-19 8h11"/><path class="art-paper" d="M41 9v11h9"/>',
        browser:'<circle cx="32" cy="32" r="18"/><ellipse cx="32" cy="32" rx="8" ry="18"/><path d="M15 26h34M15 38h34"/><path class="art-paper" d="m41 9 9 4-2 10-5-7-8-3Z"/>',
        settings:'<path d="M21 21h23M21 32h23M21 43h23"/><rect class="art-paper" x="24" y="16" width="7" height="10" rx="3"/><rect class="art-accent-fill" x="36" y="27" width="7" height="10" rx="3"/><rect class="art-paper" x="26" y="38" width="7" height="10" rx="3"/>',
        photos:'<path class="art-paper" d="M13 21h37v24H13z"/><circle class="art-accent-fill" cx="23" cy="29" r="4"/><path class="art-ink-fill" d="m14 44 12-12 9 7 6-10 8 11v4Z"/>',
        store:'<path class="art-paper" d="m18 23 14-8 14 8-14 8Z"/><path d="m18 23 14 8 14-8v18l-14 8-14-8Zm14 8v18M25 19l14 8"/>',
        calculator:'<rect class="art-paper" x="20" y="14" width="24" height="11" rx="2"/><path d="M24 33h3m-3 8h3m7-8h3m-3 8h3M24 49h3m7 0h3"/><path class="art-accent-fill" d="M40 30h5v21h-5z"/>',
        terminal:'<path class="art-paper" d="m18 26 8 7-8 7 2 3 11-10-11-10Z"/><path d="M34 42h11"/><path class="art-accent-fill" d="M9 16h46v3H9z"/>',
        paint:'<path class="art-paper" d="m24 35 21-23 6 6-21 23Z"/><path class="art-accent-fill" d="m23 35 8 8c-3 11-14 7-17 10 3-4 1-10 9-18Z"/>',
        media:'<circle cx="32" cy="32" r="19"/><path class="art-paper" d="m28 22 13 10-13 10Z"/>',
        code:'<path class="art-paper" d="m23 19-12 13 12 13 4-4-8-9 8-9Zm18 0-4 4 8 9-8 9 4 4 12-13Z"/><path d="m35 17-6 30"/>',
        snips:'<path d="M22 14h-7v9m27-9h7v9M15 41v9h7m20 0h7v-9"/><circle class="art-paper" cx="24" cy="37" r="5"/><circle class="art-paper" cx="39" cy="37" r="5"/><path d="m27 32 15-15m-6 15L21 17"/>',
        calendar:'<path class="art-accent-fill" d="M8 13h48v11H8Z"/><path d="M20 11v7m24-7v7"/><path class="art-ink-fill" d="M17 31h6v6h-6zm13 0h6v6h-6zm13 0h6v6h-6zM17 43h6v6h-6zm13 0h6v6h-6z"/>',
        clock:'<path d="M32 11v4m21 17h-4M32 53v-4M11 32h4M32 20v14l10 6"/><circle class="art-accent-fill" cx="32" cy="32" r="3"/>',
        tasks:'<path d="m20 23 4 4 7-8m6 4h8M20 39l4 4 7-8m6 4h8"/><path class="art-accent-fill" d="M18 9h20v5H18z"/>',
        taskmanager:'<path class="art-paper" d="M16 39h6v-9h-6zm12 0h6V21h-6zm12 0h6V15h-6Z"/><path d="M12 46h40"/>',
        mines:'<path d="M19 14v37m13-37v37m13-37v37M13 24h38M13 37h38"/><path class="art-paper" d="M20 25h11v11H20Z"/><circle class="art-ink-fill" cx="38" cy="44" r="4"/>',
        welcome:'<path class="art-paper" d="m32 13 6 13 13 6-13 6-6 13-6-13-13-6 13-6Z"/><circle class="art-accent-fill" cx="32" cy="32" r="5"/>',
        win32:'<rect class="art-paper" x="22" y="22" width="20" height="20" rx="3"/><path d="M16 26h6m-6 12h6m20-12h6m-6 12h6M26 16v6m12-6v6M26 42v6m12-6v6"/><path class="art-accent-fill" d="M28 28h8v8h-8z"/>',
        trash:'<path class="art-paper" d="M21 23h22l-2 26H23Z"/><path d="M18 20h28M26 15h12m-10 13v15m8-15v15"/>',
        clipboard:'<rect class="art-accent-fill" x="23" y="11" width="18" height="8" rx="3"/><path d="m21 31 4 4 5-7m5 4h10M21 43h24"/>',
        focus:'<circle cx="32" cy="32" r="18"/><path d="M32 14v9m18 9h-9M32 50v-9M14 32h9"/><circle class="art-paper" cx="32" cy="32" r="6"/>',
        widgets:'<path class="art-paper" d="M16 17h12v17H16zM34 17h14v10H34zM16 40h12v8H16z"/><path class="art-accent-fill" d="M34 33h14v15H34z"/>',
        workspaces:'<path class="art-accent-fill" d="M25 27h25v20H25z"/><path class="art-paper" d="M13 18h26v21H13z"/><path d="M13 24h26"/>',
        history:'<path d="M17 29a16 16 0 1 1 2 13M16 17v12h12M33 22v12l9 5"/>',
        storage:'<path class="art-paper" d="M18 18h28v11H18zM18 36h28v11H18z"/><path d="M24 24h5m-5 18h5"/><circle class="art-accent-fill" cx="40" cy="24" r="2"/><circle class="art-accent-fill" cx="40" cy="42" r="2"/>',
        archives:'<path class="art-paper" d="M27 9h10v46H27Z"/><path class="art-ink-fill" d="M28 12h5v5h-5zm5 5h5v5h-5zm-5 5h5v5h-5zm5 5h5v5h-5zm-5 5h5v5h-5z"/><rect x="29" y="40" width="8" height="10" rx="2"/>',
        accessibility:'<circle class="art-paper" cx="32" cy="18" r="5"/><path d="m16 29 16 5 16-5M32 34v7m0 0L22 51m10-10 10 10"/>',
        recorder:'<path class="art-paper" d="M13 22h27v24H13zM42 28l11-5v21l-11-5Z"/><circle class="art-accent-fill" cx="26" cy="34" r="7"/>'
    };
    const silhouettes = {
        folder: 'M7 17Q7 13 12 13H27L33 19H52Q57 19 57 24V49Q57 54 52 54H12Q7 54 7 49Z',
        paper: 'M16 6H40L52 18V54Q52 58 48 58H16Q12 58 12 54V10Q12 6 16 6Z',
        instrument: 'M17 5H47Q52 5 52 10V54Q52 59 47 59H17Q12 59 12 54V10Q12 5 17 5Z',
        screen: 'M9 12H55Q60 12 60 17V47Q60 52 55 52H9Q4 52 4 47V17Q4 12 9 12Z',
        disk: 'M32 5A27 27 0 1 1 32 59A27 27 0 1 1 32 5Z',
        hex: 'M29 5Q32 3 35 5L54 16Q57 18 57 22V44Q57 48 54 50L35 60Q32 62 29 60L10 50Q7 48 7 44V22Q7 18 10 16Z',
        board: 'M12 8H52Q57 8 57 13V51Q57 56 52 56H12Q7 56 7 51V13Q7 8 12 8Z',
        chip: 'M18 8H46Q56 8 56 18V46Q56 56 46 56H18Q8 56 8 46V18Q8 8 18 8Z'
    };
    const specs = {
        files:['folder','#309bad','#176174','#bceff1'], notepad:['paper','#e2f2ff','#20588d','#42a6cf'],
        browser:['disk','#8361d7','#fff9ff','#dec7ff'], settings:['instrument','#647a91','#ffffff','#a8d4e6'],
        photos:['screen','#54ac81','#113e2c','#ddf8b0'], store:['hex','#dd8b45','#4f2c16','#ffe1ad'],
        calculator:['instrument','#344e75','#f7fbff','#f3c482'], terminal:['screen','#263848','#d8f8f2','#59d4bc'],
        paint:['board','#d76885','#fff5fb','#fac398'], media:['disk','#d58055','#fff8e9','#ffd7a6'],
        code:['hex','#527dbd','#f3faff','#b0d7ff'], snips:['board','#b46a80','#fff2f5','#ffcfbb'],
        calendar:['board','#f1e5d4','#714225','#dc855b'], clock:['disk','#ecf4fc','#1f497b','#649dd7'],
        tasks:['paper','#e1f2e8','#276946','#66b88d'], taskmanager:['screen','#548aa4','#f5feff','#b6eceb'],
        mines:['board','#afc995','#354f2a','#f0f6df'], welcome:['hex','#58a4b9','#f8ffff','#c9f5fa'],
        win32:['chip','#7784cb','#f7f8ff','#d0d8ff'], trash:['instrument','#ced8df','#425363','#8da6ba'],
        clipboard:['paper','#eee1c9','#665333','#c9ac68'], focus:['disk','#9f79b6','#fff6ff','#e5c6f3'],
        widgets:['board','#64a79f','#effffe','#bbeee3'], workspaces:['screen','#718baa','#fffaff','#d0dfff'],
        history:['disk','#e7cc9d','#74501d','#c39443'], storage:['instrument','#81a9b4','#153d4c','#bcebf0'],
        archives:['board','#caa064','#473316','#f5dfaa'], accessibility:['disk','#5f82b5','#fffaff','#c4dafa'],
        recorder:['screen','#b9717c','#fff4f3','#fac8c1']
    };
    const palettes={
        windows:{files:['#e6b64a','#715019','#fff0ab']},
        macos26:{files:['#529ed1','#204f79','#d3efff'],terminal:['#343b47','#f0f7fa','#93aec5']},
        ubuntu:{files:['#e4914b','#643820','#ffe1b5'],terminal:['#453247','#f4e7ef','#be7897']}
    };
    const families=['windows','macos26','ubuntu','prism'], order=Object.keys(paths), cache=new Map();
    const enclosure='M20 4H44C55 4 60 9 60 20V44C60 55 55 60 44 60H20C9 60 4 55 4 44V20C4 9 9 4 20 4Z';
    const legacy='M14 4h28l18 18v28a10 10 0 0 1-10 10H14A10 10 0 0 1 4 50V14A10 10 0 0 1 14 4Z';
    const family=()=>{const t=OS.themes?.artwork||{};return families.includes(t.family)?t.family:families.includes(t.profile)?t.profile:'windows';};
    function paint(id,size,which) {
        const app=OS.apps?.get(id), glyph=paths[id]||null;
        let hash=0;for(const c of id.slice(0,128))hash=(hash*31+c.charCodeAt(0))>>>0;
        const fallback=[['board','#5076aa','#f7fbff','#bfd6fc'],['hex','#789b79','#fcfff4','#d5edc5'],['screen','#a97879','#fff7f4','#f1c6b6']][hash%3];
        const [shape,sourceBase,sourceInk,sourceAccent]=specs[id]||fallback, d=silhouettes[shape];
        const [base,ink,accent]=palettes[which]?.[id]||[sourceBase,sourceInk,sourceAccent];
        const symbol=(which==='prism'?glyph:illustrations[id]||glyph)||OS.icon(app?.icon||'code',32).replace('<svg ','<svg x="16" y="16" ');
        const small=size<=20, signature='<path class="art-signature" d="m47 49 2-2 2 2-2 2z"/>';
        let layers,transform='',plate=base,stroke=ink;
        if(which==='macos26'){
            plate=base;stroke=ink;
            layers=`<path class="art-depth" d="${enclosure}" transform="translate(0 .8)"/><path class="art-plate" d="${enclosure}"/><path class="art-glaze" d="M20 5H44C53 5 59 10 59 20V27C46 22 22 31 5 35V20C5 10 10 5 20 5Z"/><path class="art-rim" d="M8 24V20C8 12 12 8 20 8H44C50 8 54 11 56 16"/>`;
            layers+=`<path class="art-object" d="${d}" transform="translate(7 7) scale(.78)"/>`;
            transform='translate(7 7) scale(.78)';
        }else if(which==='prism'){
            layers=`<path class="art-plate" d="${legacy}"/><path class="art-fold" d="M42 4v10a8 8 0 0 0 8 8h10Z"/>`;
        }else{
            const drop=which==='ubuntu'?2.4:1.1;
            layers=`<path class="art-depth" d="${d}" transform="translate(0 ${drop})"/><path class="art-plate" d="${d}"/>`;
            if(shape==='folder')layers+='<path class="art-fold" d="M8 24H56V29H8Z"/>';
            else if(shape==='paper')layers+='<path class="art-fold" d="M40 6V18H52Z"/>';
            else if(shape==='instrument')layers+='<path class="art-fold" d="M13 11H51V15H13Z"/>';
            else if(which==='windows')layers+=`<path class="art-rim" d="${d}" transform="translate(0 -1)"/>`;
            transform=shape==='folder'?'translate(4 11) scale(.88 .73)':'';
        }
        return `<span class="app-icon themed-app-icon aster-prism-icon aster-adaptive-icon" data-icon-id="${OS.esc(id)}" data-icon-family="${which}" data-icon-detail="${small?'small':'full'}" style="--icon-size:${size}px;--art-base:${plate};--art-accent:${accent};--art-ink:${stroke}"><svg class="aster-icon-art" width="100%" height="100%" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">${layers}<g transform="${transform}"><g class="art-glyph" stroke-width="${small?3:2.6}" stroke-linecap="round" stroke-linejoin="round">${symbol}</g>${!small?signature:''}</g></svg></span>`;
    }
    OS.visualIcon=(id,size=32)=>{
        id=String(id||'unknown').slice(0,256);size=Math.max(8,Math.min(128,Number.isFinite(Number(size))?Number(size):32));
        const which=family(),key=which+':'+id+':'+size+':'+(OS.apps?.get(id)?.icon||'');
        if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
        const value=paint(id,size,which);if(cache.size>=256)cache.delete(cache.keys().next().value);cache.set(key,value);return value;
    };
    // Update artwork, not its enclosing buttons/windows: keyboard focus, pointer
    // capture, open panels and application state survive an icon-family change.
    OS.refreshIconArtwork=()=>{
        const which=family();if(typeof document==='undefined')return;
        for(const node of document.querySelectorAll('.aster-adaptive-icon')){
            if(node.dataset.iconFamily===which)continue;
            const size=parseFloat(node.style.getPropertyValue('--icon-size'))||32,template=document.createElement('template');
            template.innerHTML=OS.visualIcon(node.dataset.iconId,size);
            const next=template.content.firstElementChild;
            node.dataset.iconFamily=which;node.style.cssText=next.style.cssText;node.replaceChildren(...next.childNodes);
        }
    };
    OS.iconArtwork=Object.freeze({name:'Aster Atelier',builtins:Object.freeze(order),families:Object.freeze(families),get family(){return family();},get cacheSize(){return cache.size;}});
    OS.on?.('theme-change',()=>OS.refreshIconArtwork());
})();
