/* Compact app windows and in-place preferences. Theme-agnostic; no iframe reload. MIT. */
'use strict';
(() => {
    const OS = Aster, M = AsterWebNavigation;
    const isWeb = w => w.app.webApp || w.app.custom;
    OS.openInBrowser = async input => {
        const url = M.address(input, false);
        const w = OS.openApp('browser', {url});
        await w.ready;
        return w;
    };
    OS.applyWebAppChrome = w => {
        if (!isWeb(w) || w.closed) return;
        if (!w.webChrome) {
            const tools = OS.el('div', {class:'web-window-tools', role:'group', 'aria-label':w.app.title + ' window controls'});
            const grip = OS.el('button', {class:'web-window-grip', title:'Move window · drag or use arrow keys', 'aria-label':'Move app window', html:OS.icon('move',14)});
            const menu = OS.el('button', {title:'Window controls', 'aria-label':'Window controls', html:OS.icon('more',16)});
            grip.addEventListener('pointerdown', e => w.beginDrag(e, grip));
            grip.ondblclick = () => w.toggleMaximize();
            grip.onkeydown = e => {
                const step = e.shiftKey ? 1 : 10, d = {ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
                if (!d) return;
                e.preventDefault(); e.stopPropagation(); if (w.maximized) w.toggleMaximize();
                w.rect.x += d[0]; w.rect.y += d[1]; w.constrain(); w.sync();
            };
            menu.onclick = e => w.titleMenu(e);
            tools.append(grip, menu); w.el.append(tools); w.webChrome = tools;
            const oldKey = w.onKey;
            w.onKey = e => {
                if (e.altKey && e.code === 'Space') { e.preventDefault(); w.titleMenu({preventDefault(){},stopPropagation(){},target:menu}); }
                else oldKey?.(e);
            };
            const original = w.extraTitleMenu;
            w.extraTitleMenu = () => [...(original?.() || []), null,
                {text:'Web app appearance settings',icon:'settings',action:()=>OS.openApp('settings',{section:'webapps'})}];
        }
        w.el.classList.add('web-app-host');
        const showTitle = OS.settings.webAppTitleBars === true;
        w.bar.hidden = !showTitle;
        w.webChrome.hidden = showTitle;
        w.el.classList.toggle('web-app-compact', !showTitle);
        for (const node of w.body.querySelectorAll(':scope > .web-app-toolbar, :scope > .web-app-footer')) node.hidden = OS.settings.webAppToolbars !== true;
        w.gpuDirty = true; OS.renderer?.invalidate();
    };
    OS.on('window-ready', OS.applyWebAppChrome);
    OS.on('settings', () => {for (const w of OS.windows.values()) OS.applyWebAppChrome(w);});
    OS.integrations.navigation.push(['webapps','globe','Web apps','web app windows title bars address toolbar chrome embedded browser','apps']);
    const previous = OS.integrations.renderSettings;
    OS.integrations.renderSettings = async function(w, section, main, navigate) {
        const row = (title, text, control) => OS.el('div',{class:'setting-row'},OS.el('div',{class:'setting-label'},OS.el('strong',{text:title}),OS.el('small',{text})),control);
        if (section === 'apps') main.append(row('Web app windows','Choose title bars and navigation controls for embedded apps.',OS.el('button',{class:'secondary',text:'Manage',onclick:()=>navigate('webapps')})));
        if (section !== 'webapps') return previous.call(this,w,section,main,navigate);
        const inputs = [];
        for (const [key,title,text] of [
            ['webAppTitleBars','Show web app title bars','Show the Aster title bar above web apps. Off by default; the small window controls still support moving, minimizing, maximizing and closing.'],
            ['webAppToolbars','Show web app address toolbar','Show the app address, Reload, browser actions, Source and category footer. Off by default; the window menu keeps these actions available.']
        ]) {
            const input = OS.el('input',{type:'checkbox','aria-label':title,checked:OS.settings[key] === true});
            input.onchange = OS.guard(async()=>{input.disabled=true;try{await OS.setSetting(key,input.checked);}finally{input.disabled=false;input.checked=OS.settings[key]===true;}});
            inputs.push([key,input]); main.append(row(title,text,input));
        }
        const off = OS.on('settings',()=>inputs.forEach(([key,i])=>i.checked=OS.settings[key]===true));
        w.integrationView = {dispose:off};
        main.append(OS.el('p',{class:'muted',text:'Changes apply immediately to open and future app windows without reloading their pages. Built-in apps and Orbit Browser keep their normal title bars. Website-owned toolbars are not modified.'}),
            row('Orbit Browser','Open websites inside Aster. Sites can still block embedding; Open in browser remains available for those sites.',OS.el('button',{class:'secondary',text:'Open Aster Browser',onclick:()=>OS.openApp('browser')})));
        return true;
    };
})();
