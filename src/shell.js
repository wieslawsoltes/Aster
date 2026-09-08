'use strict';
(() => {
    const OS = Aster, $ = OS.$, esc = OS.esc;
    let panel = null, previewTimer = 0, desktopToken = 0, clockInterval = 0, taskViewRender = null;
    const iconButton = (icon, label, fn) => OS.el('button', { class: 'icon-button', title: label, 'aria-label': label, html: OS.icon(icon, 18), onclick: OS.guard(fn) });
    OS.closePanels = (restoreFocus = false) => {
        const anchor = OS.panelReturnFocus;
        const cleanup = OS.panelCleanup; OS.panelCleanup = null; OS.panelReturnFocus = null;
        cleanup?.();
        $('#panel-layer').replaceChildren(); panel = null; OS.shellPanelType = null; taskViewRender = null;
        clearTimeout(previewTimer);
        OS.$$('.task-button.panel-active').forEach(b => b.classList.remove('panel-active'));
        if (restoreFocus && anchor?.isConnected) anchor.focus({preventScroll:true});
    };
    const mountPanel = (type, el) => { OS.closePanels(); panel = type; OS.shellPanelType = type; $('#panel-layer').append(el); return el; };
    OS.mountShellPanel = (type, el, cleanup, anchor) => { mountPanel(type, el); OS.panelCleanup = cleanup; OS.panelReturnFocus = anchor; return el; };
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#panel-layer,#taskbar,#context-menu,#dialog-layer'))
        OS.closePanels(); });
    document.addEventListener('contextmenu', e => { if (!e.target.closest('input,textarea,audio,video,iframe'))
        e.preventDefault(); });
    const visibleApps = () => Array.from(OS.apps.values()).filter(a => !a.hidden);
    OS.lock = () => { OS.closePanels(); if ($('.lock-screen'))
        return; const cover = OS.el('section', { class: 'lock-screen', role: 'dialog', 'aria-label': 'Visual desktop lock', 'aria-modal': 'true', tabindex: '0' }), time = OS.el('div', { class: 'lock-time' }), date = OS.el('div', { class: 'lock-date' }), user = OS.el('div', { class: 'lock-user' }); const initials = OS.settings.username.split(' ').map(s => s[0]).slice(0, 2).join(''); user.innerHTML = `<div class="user-avatar">${esc(initials)}</div><strong style="font-size:18px;font-weight:500">${esc(OS.settings.username)}</strong>`; const resume = OS.el('button', { text: 'Resume your session' }); user.append(resume, OS.el('small', { text: 'Visual lock only — not an authentication boundary', style: 'font-size:10px' })); cover.append(time, date, user); document.body.append(cover); const tick = () => { time.textContent = OS.time(); date.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); }; tick(); const interval = setInterval(tick, 1000); const unlock = () => { clearInterval(interval); cover.remove(); OS.windows.get(OS.focused)?.focus(); }; resume.onclick = unlock; cover.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        unlock();
    }
    else if (e.key === 'Tab') {
        e.preventDefault();
        resume.focus();
    } }; resume.focus(); };
    OS.restart = async () => { if (!await OS.confirm('Restart Aster?', 'Your virtual files are kept. Save open drawings and other unsaved work before restarting the browser desktop.', 'Restart'))
        return; await OS.persistSessionNow(); OS.ignoreUnload = true; location.reload(); };
    const powerMenu = e => OS.context(e, [{ text: 'Lock desktop', icon: 'lock', action: OS.lock }, { text: 'Restart Aster', icon: 'refresh', action: OS.restart }, { text: 'Close all apps', icon: 'power', action: async () => { for (const w of Array.from(OS.windows.values()))
                await w.close(); } }]);
    OS.toggleStart = (focusSearch = false) => {
        if (panel === 'start' && !focusSearch) {
            OS.closePanels();
            return;
        }
        const start = OS.el('section', { class: 'panel start-menu flyout', role: 'dialog', 'aria-label': 'Start menu' }), searchWrap = OS.el('div', { class: 'start-search' }), searchField = OS.el('div', { class: 'search-field', html: OS.icon('search', 17) }), input = OS.el('input', { placeholder: 'Search for apps, files, and settings', 'aria-label': 'Search apps and files', autocomplete: 'off' }), main = OS.el('div', { class: 'start-main' }), footer = OS.el('div', { class: 'start-footer' });
        searchField.append(input);
        searchWrap.append(searchField);
        const profile = OS.el('button', { html: `<span class="user-avatar">${esc(OS.settings.username[0] || 'A')}</span><span style="font-size:12px">${esc(OS.settings.username)}</span>`, onclick: () => OS.openApp('settings', { section: 'system' }) });
        footer.append(profile, OS.el('button', { class: 'icon-button', title: 'Power', 'aria-label': 'Power', html: OS.icon('power', 19), onclick: powerMenu }));
        start.append(searchWrap, main, footer);
        mountPanel('start', start);
        let all = false, searchVersion = 0, webMode = false, webCategory = null;
        const showWeb = (category = null, focus = true) => {
            ++searchVersion; webMode = true; webCategory = category; input.value = '';
            OS.renderWebAppStart(main, category, showWeb, () => {
                if (webCategory) showWeb();
                else { webMode = false; home(); $('button.web-start-entry', main)?.focus(); }
            }, focus);
        };
        const webEntry = () => OS.el('button', {
            class: 'web-start-entry', 'aria-label': 'Web apps, ' + (OS.webCatalog?.apps.length || 0) + ' projects',
            html: OS.icon('grid', 26) + '<span class="grow"><strong>Your web apps</strong><small>' +
                (OS.webCatalog?.apps.length || 0) + ' projects, organized by category</small></span>' + OS.icon('forward', 15),
            onclick: () => showWeb()
        });
        start.addEventListener('keydown', e => {
            if (webMode && !input.value && (e.key === 'Escape' || (e.key === 'ArrowLeft' && e.target !== input))) {
                e.preventDefault(); e.stopPropagation();
                if (webCategory) showWeb();
                else { webMode = false; home(); $('button.web-start-entry', main)?.focus(); }
            }
        }, true);
        const appContext = (e,id) => {
            const app=OS.apps.get(id), pinned=(OS.startPins||[]).includes(id);
            OS.context(e,[{text:'Open',icon:'play',action:()=>OS.openApp(id)},
                {text:'New window',icon:'plus',disabled:!!app.singleton,action:()=>OS.openApp(id)},
                {text:pinned?'Unpin from Start':'Pin to Start',icon:'pin',action:async()=>{await OS.toggleStartPin(id);if(start.isConnected)home();}},
                {text:OS.pins.includes(id)?'Unpin from taskbar':'Pin to taskbar',icon:'pin',action:()=>OS.togglePin(id)},
                {text:'Add desktop shortcut',icon:'desktop',action:()=>OS.addDesktopShortcut(id)},
                ...(app.custom?[null,{text:'Remove app',icon:'trash',danger:true,action:()=>OS.uninstallApp(id)}]:[])]);
        };
        const appButton = (id,cls='pinned-app') => {
            const app=OS.apps.get(id),b=OS.el('button',{class:cls,title:app.description||app.title,'data-start-app':id,
                html:OS.appIcon(id,34)+'<span>'+esc(app.title.replace('Welcome to Aster','Welcome'))+'</span>',
                onclick:()=>OS.openApp(id),oncontextmenu:e=>appContext(e,id),draggable:true});
            b.ondragstart=e=>{e.dataTransfer.setData('application/x-aster-start-pin',id);e.dataTransfer.effectAllowed='move';};
            b.ondragover=e=>{if([...e.dataTransfer.types].includes('application/x-aster-start-pin')){e.preventDefault();e.dataTransfer.dropEffect='move';}};
            b.ondrop=OS.guard(async e=>{e.preventDefault();await OS.moveStartPin(e.dataTransfer.getData('application/x-aster-start-pin'),id);if(start.isConnected)home();});
            return b;
        };
        async function home() {
            ++searchVersion;
            if (webMode && OS.renderWebAppStart) { showWeb(webCategory, false); return; }
            main.replaceChildren();

            const head = OS.el('div', { class: 'section-heading' }, OS.el('span', { text: all ? 'All apps' : 'Pinned' }));
            head.append(OS.el('button', { html: (all ? 'Back' : 'All apps') + OS.icon(all ? 'back' : 'forward', 11), onclick: () => { all = !all; home(); } }));
            main.append(head);
            if (all) {
                const list = OS.el('div', { class: 'search-results' });
                if (OS.renderWebAppStart) main.append(webEntry());
                for (const app of visibleApps().filter(a => !a.webApp).sort((a, b) => a.title.localeCompare(b.title))) {
                    const b = OS.el('button', { class: 'search-result', html: OS.appIcon(app.id, 31) + `<div class="grow"><span>${esc(app.title)}</span><small>${esc(app.category || 'Your apps')}</small></div>` + OS.icon('forward', 13), onclick: () => OS.openApp(app.id),oncontextmenu:e=>appContext(e,app.id) });
                    list.append(b);
                }
                main.append(list);
                return;
            }
            const grid = OS.el('div', { class: 'pinned-grid' });
            const ids = OS.startPins || ['browser', 'files', 'settings', 'notepad', 'photos', 'store', 'paint', 'calculator', 'terminal', 'calendar', 'tasks', 'media', 'code', 'clock', 'mines', 'snips', 'taskmanager', 'welcome'];
            for (const id of ids)
                if (OS.apps.has(id))
                    grid.append(appButton(id));
            main.append(grid);
            if (OS.renderWebAppStart) main.append(webEntry());
            main.append(OS.el('div', { class: 'section-heading', html: '<span>Recommended</span><span class="muted" style="font-weight:400;font-size:10px">Your recent files</span>' }));
            const recent = OS.el('div', { class: 'recommended-grid' });
            main.append(recent);
            const paths = OS.shellLaunch?.state.trackRecent === false ? [] : [...new Set([...OS.recent, '/Documents/Welcome to Aster.md', '/Documents/Ideas.txt', '/Projects/Hello Aster.html', '/Music/First light.wav'])].slice(0, 4);
            if (!paths.length) recent.append(OS.el('button', { class: 'recommended-item', text: 'Recent documents are turned off. Manage recent items.', onclick: () => OS.openApp('settings', { section: 'recentitems' }) }));
            for (const path of paths) {
                const file = await OS.fs.stat(path).catch(() => null);
                if (!start.isConnected)
                    return;
                if (!file)
                    continue;
                const b = OS.el('button', { class: 'recommended-item', html: OS.fileIcon(file, 29) + `<div><strong>${esc(OS.fs.name(path))}</strong><small>${esc(OS.fs.name(OS.fs.parent(path)))} · Local file</small></div>`, onclick: OS.guard(() => OS.openPath(path)) });
                recent.append(b);
            }
        }
        async function search() {
            const version = ++searchVersion, q = input.value.trim().toLowerCase();
            if (!q) {
                home();
                return;
            }
            const apps = visibleApps().filter(a => [a.title, a.id, a.description, a.category, a.keywords].join(' ').toLowerCase().includes(q));
            const files = (await OS.db.all()).filter(f => !f.path.startsWith('/.Trash') && OS.fs.name(f.path).toLowerCase().includes(q)).slice(0, 9);
            if (version !== searchVersion || !start.isConnected)
                return;
            main.replaceChildren();
            main.append(OS.el('div', { class: 'section-heading', text: 'Best matches' }));
            const list = OS.el('div', { class: 'search-results' });
            for (const app of apps)
                list.append(OS.el('button', { class: 'search-result', html: OS.appIcon(app.id, 35) + `<div><strong style="font-size:12px;font-weight:500">${esc(app.title)}</strong><small>App · ${esc(app.category || 'Your apps')}</small></div>`, onclick: () => OS.openApp(app.id),oncontextmenu:e=>appContext(e,app.id) }));
            for (const [id, feature] of Object.entries(OS.integratedFeatures || {}))
                if ((feature.title + ' ' + feature.keys).toLowerCase().includes(q))
                    list.append(OS.el('button', {class:'search-result system-result', html:OS.appIcon(id,30)+'<div><strong>'+esc(feature.title)+'</strong><small>'+esc(feature.group)+' · System feature</small></div>',onclick:()=>OS.openApp(id)}));
            for (const file of files)
                list.append(OS.el('button', { class: 'search-result', html: OS.fileIcon(file, 30) + `<div><strong style="font-size:12px;font-weight:500">${esc(OS.fs.name(file.path))}</strong><small>${esc(OS.fs.parent(file.path))}</small></div>`, onclick: OS.guard(() => OS.openPath(file.path)) }));
            for (const [id, glyph, title, keywords] of (OS.integrations?.navigation || []))
                if (['defaultapps', 'startupapps', 'recentitems'].includes(id) && (title + ' ' + keywords).toLowerCase().includes(q))
                    list.append(OS.el('button', { class: 'search-result system-result', 'data-settings-section': id,
                        html: OS.icon(glyph, 30) + '<div><strong>' + esc(title) + '</strong><small>Settings</small></div>',
                        onclick: () => OS.openApp('settings', { section: id }) }));
            const settingsMap = [['theme', 'Personalization', 'personalization'], ['wallpaper', 'Desktop background', 'personalization'], ['backup', 'Export or restore backup', 'recovery'], ['storage', 'Storage settings', 'storage'], ['sound', 'Sound and volume', 'sound'], ['text', 'Accessibility settings', 'accessibility']];
            for (const [term, label, section] of settingsMap)
                if (term.includes(q) || q.includes(term))
                    list.append(OS.el('button', { class: 'search-result', html: OS.appIcon('settings', 30) + `<div><span>${label}</span><small>Setting</small></div>`, onclick: () => OS.openApp('settings', { section }) }));
            if (!list.childElementCount)
                list.append(OS.el('div', { class: 'empty', html: OS.icon('search', 40) + '<strong>No matches yet.</strong><span>Search an app, a web project, a category, or one of your virtual files.</span>' }));
            main.append(list);
        }
        input.oninput = () => OS.guard(search)();
        input.onkeydown = e => { if (e.key === 'Enter') {
            e.preventDefault();
            $('button.search-result,button.pinned-app,button.web-category-item,button.web-start-entry', main)?.click();
        } if (e.key === 'ArrowDown') {
            e.preventDefault();
            $('button.search-result,button.pinned-app,button.web-category-item,button.web-start-entry', main)?.focus();
        } };
        main.onkeydown = e => { if (webMode) return; if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key))
            return; const items = OS.$$('button.pinned-app,button.search-result', main), index = items.indexOf(document.activeElement); if (index < 0)
            return; const columns = input.value || all ? 1 : innerWidth <= 500 ? 4 : 6, delta = { ArrowDown: columns, ArrowUp: -columns, ArrowLeft: -1, ArrowRight: 1 }[e.key]; e.preventDefault(); const next = index + delta; if (next < 0)
            input.focus();
        else
            items[Math.min(items.length - 1, next)]?.focus(); };
        home();
        setTimeout(() => input.focus(), 40);
    };
    OS.togglePin = async (id) => { OS.pins = OS.pins.includes(id) ? OS.pins.filter(x => x !== id) : [...OS.pins, id]; await OS.db.set('taskbarPins', OS.pins); renderTaskbar(); };
    function showPreview(id, anchor) { const windows = Array.from(OS.windows.values()).filter(w => w.appId === id); if (!windows.length)
        return; if (panel && panel !== 'preview')
        return; const p = OS.el('div', { class: 'task-preview flyout' }); for (const w of windows.slice(0, 4)) {
        const card = OS.el('div', { class: 'preview-card', role: 'button', tabindex: '0' }), header = OS.el('div', { class: 'row' }), title = OS.el('div', { class: 'preview-title grow', text: w.title }), close = iconButton('close', 'Close ' + w.title, () => { });
        close.onclick = e => { e.stopPropagation(); w.close(); OS.closePanels(); };
        header.append(title, close);
        const image = OS.el('div', { class: 'preview-image', html: OS.appIcon(id, 38) });
        if (w.state.text)
            image.append(OS.el('small', { text: w.state.text.slice(0, 95), style: 'padding:3px 12px;font:9px var(--mono);white-space:pre-wrap;max-height:35px;overflow:hidden' }));
        card.append(header, image);
        card.onclick = () => { OS.closePanels(); w.restore(); };
        card.onkeydown = e => { if (e.key === 'Enter')
            card.click(); };
        p.append(card);
    } mountPanel('preview', p); const r = anchor.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(innerWidth - p.getBoundingClientRect().width - 8, r.left + r.width / 2 - p.getBoundingClientRect().width / 2)) + 'px'; p.onmouseenter = () => clearTimeout(previewTimer); p.onmouseleave = () => { previewTimer = setTimeout(() => { if (panel === 'preview')
        OS.closePanels(); }, 250); }; }
    function taskAppButton(id, extra = false) {
        const app = OS.apps.get(id);
        if (!app)
            return null;
        const windows = Array.from(OS.windows.values()).filter(w => w.appId === id), active = windows.some(w => w.id === OS.focused && !w.minimized && w.desktop === OS.activeDesktop);
        const b = OS.el('button', { class: 'task-button' + (windows.length ? ' running' : '') + (active ? ' active' : '') + (extra ? ' task-pinned-extra' : ''), 'data-app': id, title: app.title, 'aria-label': app.title, html: OS.appIcon(id, 28) });
        b.onclick = e => { if (e.ctrlKey || e.shiftKey) {
            OS.openApp(id);
            return;
        } clearTimeout(previewTimer); const current = windows.find(w => w.id === OS.focused); if (!windows.length)
            OS.openApp(id);
        else if (windows.length > 1) {
            if (panel === 'preview') {
                OS.closePanels();
                (current || windows.at(-1)).restore();
            }
            else
                showPreview(id, b);
        }
        else {
            OS.closePanels();
            if (current && !current.minimized)
                current.minimize();
            else
                windows[0].restore();
        } };
        b.onauxclick = e => { if (e.button === 1) {
            e.preventDefault();
            OS.openApp(id);
        } };
        b.onmouseenter = () => { if (windows.length)
            previewTimer = setTimeout(() => showPreview(id, b), 600); };
        b.onmouseleave = () => { clearTimeout(previewTimer); if (panel === 'preview')
            previewTimer = setTimeout(() => { if (panel === 'preview')
                OS.closePanels(); }, 250); };
        b.oncontextmenu = e => {clearTimeout(previewTimer);if(OS.showJumpList)return OS.guard(OS.showJumpList)(e,id,b);return OS.context(e, [{ text: app.title, icon: app.icon || 'play', action: () => OS.openApp(id) }, { text: OS.pins.includes(id) ? 'Unpin from taskbar' : 'Pin to taskbar', icon: 'pin', action: () => OS.togglePin(id) }, ...(windows.length ? [null, ...windows.slice(0, 5).map(w => ({ text: w.title, icon: 'restore', action: () => w.restore() })), { text: windows.length > 1 ? 'Close all windows' : 'Close window', icon: 'close', action: async () => { for (const w of windows)
                        await w.close(); } }] : [])]);};
        return b;
    }
    function renderTaskbar() {
        if (!OS.pins)
            return;
        const bar = $('#taskbar');
        bar.replaceChildren();
        bar.classList.toggle('taskbar-left', OS.settings.align === 'left');
        const now = new Date(), left = OS.el('button', { class: 'task-left', title: 'Your day', 'aria-label': 'Open your day widgets', html: OS.icon('sun', 25) + `<div style="text-align:left"><strong>${esc(now.toLocaleDateString(undefined, { weekday: 'long' }))}</strong><small>${esc(now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))} · Your day</small></div>`, onclick: () => OS.showWidgets() });
        const center = OS.el('div', { class: 'task-center' }), start = OS.el('button', { class: 'task-button', id: 'start-button', title: 'Start (Ctrl + Space)', 'aria-label': 'Start', html: '<div class="aster-symbol" style="width:27px;height:27px"></div>', onclick: () => OS.toggleStart() }), search = OS.el('button', { class: 'task-search', title: 'Search', 'aria-label': 'Search apps and files', html: OS.icon('search', 18) + '<span>Search</span>', onclick: () => OS.toggleStart(true) }), taskview = OS.el('button', { class: 'task-button', title: 'Task View', 'aria-label': 'Task View', html: OS.icon('taskview', 23), onclick: () => OS.showTaskView() });
        center.append(start, search, taskview);
        const apps = [...new Set([...OS.pins.filter(id => OS.apps.has(id) && !OS.apps.get(id).systemFeature), ...Array.from(OS.windows.values()).map(w => w.appId)])];
        const max = innerWidth > 1200 ? 11 : innerWidth > 900 ? 8 : innerWidth > 700 ? 6 : 5;
        for (const id of apps.slice(0, max)) {
            const b = taskAppButton(id, !OS.pins.includes(id));
            if (b)
                center.append(b);
        }
        if (apps.length > max)
            center.append(OS.el('button', { class: 'task-button', html: OS.icon('more', 20), title: 'More running apps', 'aria-label': 'More apps', onclick: e => OS.context(e, apps.slice(max).map(id => ({ text: OS.apps.get(id)?.title || id, icon: 'play', action: () => { const w = Array.from(OS.windows.values()).find(w => w.appId === id); w ? w.restore() : OS.openApp(id); } }))) }));
        const right = OS.el('div', { class: 'task-right' }), quick = OS.el('button', { class: 'tray-status', id: 'quick-settings-button', title: 'Quick settings', 'aria-label': 'Quick settings', html: OS.icon(navigator.onLine ? 'wifi' : 'disconnect', 16) + OS.icon('speaker', 16) + OS.icon(OS.battery ? 'battery' : 'shield', 16), onclick: () => OS.toggleQuick() }), clock = OS.el('button', { class: 'tray-clock', id: 'tray-clock', title: 'Notification Center and calendar', 'aria-label': 'Notifications and calendar', onclick: () => OS.showNotifications() }), bell = OS.el('button', { class: 'icon-button', title: OS.settings.dnd ? 'Do not disturb' : 'Notifications', 'aria-label': 'Notifications', html: OS.icon(OS.quiet?.active() ? 'moon' : 'bell', 17), onclick: () => OS.showNotifications() });
        const unread = OS.notifications.filter(n => !n.read).length;
        if (unread) {
            bell.style.position = 'relative';
            bell.append(OS.el('span', { text: String(Math.min(unread, 9)), style: 'position:absolute;right:0;top:1px;min-width:13px;height:13px;background:var(--accent);color:white;border-radius:9px;font-size:8px;line-height:13px' }));
        }
        const showDesktop = OS.el('button', { class: 'show-desktop', title: 'Show desktop', 'aria-label': 'Show desktop', onclick: OS.showDesktop });
        right.append(quick, clock, bell, showDesktop);
        bar.append(left, center, right);
        start.oncontextmenu = e => OS.context(e, [
            {text:'System',icon:'desktop',action:()=>OS.openApp('settings',{section:'system'})},
            {text:'Task Manager',icon:'list',action:()=>OS.openApp('taskmanager')},
            {text:'Settings',icon:'settings',action:()=>OS.openApp('settings')},
            {text:'File Explorer',icon:'folder',action:()=>OS.openApp('files')},
            {text:'Terminal',icon:'terminal',action:()=>OS.openApp('terminal')},
            {text:'Run',icon:'play',key:'Win+R',action:()=>OS.showRun()},null,
            {text:'Desktop',icon:'desktop',action:OS.showDesktop},
            {text:'Lock',icon:'lock',action:OS.lock}]);
        bar.oncontextmenu = e => { if(e.target===bar || e.target===center) OS.context(e,[
            {text:'Task Manager',icon:'list',action:()=>OS.openApp('taskmanager')},
            {text:'Taskbar settings',icon:'settings',action:()=>OS.openApp('settings',{section:'personalization'})}]); };
        updateClock();
    }
    function updateClock() { const el = $('#tray-clock'); if (el) {
        const now = new Date();
        el.replaceChildren(OS.el('div', { text: OS.time(now) }), OS.el('div', { text: now.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) }));
    } }
    OS.toggleQuick = () => {
        if (panel === 'quick') {
            OS.closePanels();
            return;
        }
        const p = OS.el('section', { class: 'panel quick-panel flyout', role: 'dialog', 'aria-label': 'Quick settings' }), grid = OS.el('div', { class: 'quick-grid' }), sliders = OS.el('div', { class: 'quick-sliders' }), bottom = OS.el('div', { class: 'quick-bottom' });
        const specs = [['moon', () => document.body.dataset.theme === 'dark', () => document.body.dataset.theme === 'dark' ? 'Dark mode' : 'Light mode', async () => OS.setSetting('theme', document.body.dataset.theme === 'dark' ? 'light' : 'dark')], ['bell', () => OS.settings.dnd, () => 'Quiet mode', () => OS.setSetting('dnd', !OS.settings.dnd)], ['spark', () => OS.settings.motion, () => 'Motion', () => OS.setSetting('motion', !OS.settings.motion)], ['max', () => !!document.fullscreenElement, () => 'Full screen', async () => { if (document.fullscreenElement)
                    await document.exitFullscreen();
                else if (document.documentElement.requestFullscreen)
                    await document.documentElement.requestFullscreen();
                else
                    throw Error('Fullscreen is not available in this browser.'); }], ['gpu', () => OS.settings.quality < 1, () => 'Efficient GPU', () => OS.setSetting('quality', OS.settings.quality < 1 ? 1 : .5)], ['eye', () => OS.settings.transparency, () => 'Transparency', () => OS.setSetting('transparency', !OS.settings.transparency)]];
        for (const [icon, active, label, action] of specs) {
            const b = OS.el('button', { class: 'quick-tile' + (active() ? ' on' : ''), 'aria-pressed': String(!!active()), html: '<span>' + OS.icon(icon, 21) + '</span><label>' + label() + '</label>' });
            b.onclick = OS.guard(async () => { await action(); b.classList.toggle('on', !!active()); b.setAttribute('aria-pressed', String(!!active())); $('label', b).textContent = label(); });
            grid.append(b);
        }
        for (const [key, icon, label, min] of [['brightness', 'sun', 'Aster brightness', 15], ['volume', 'speaker', 'Aster volume', 0]]) {
            const row = OS.el('div', { class: 'row' }), input = OS.el('input', { type: 'range', min, max: 100, value: OS.settings[key], 'aria-label': label }), value = OS.el('span', { text: OS.settings[key] + '%', style: 'font-size:10px;min-width:30px;text-align:right' });
            input.oninput = () => { OS.settings[key] = Number(input.value); if (key === 'volume')
                OS.settings.muted = false; value.textContent = input.value + '%'; OS.applySettings(); };
            input.onchange = () => OS.db.set('settings', OS.settings);
            row.append(OS.el('span', { html: OS.icon(icon, 20) }), input, value);
            sliders.append(row);
        }
        const battery = OS.battery ? `${Math.round(OS.battery.level * 100)}%${OS.battery.charging ? ' · Charging' : ''}` : OS.metrics.mode + ' · ' + (navigator.onLine ? 'Online signal' : 'Offline');
        bottom.append(OS.el('span', { class: 'row', html: OS.icon(OS.battery ? 'battery' : 'gpu', 16) + esc(battery) }), iconButton('settings', 'Open Settings', () => OS.openApp('settings')));
        p.append(grid, sliders, bottom);
        mountPanel('quick', p);
    };
    OS.showNotifications = (refresh = false) => {
        if (panel === 'notifications' && !refresh) {
            OS.closePanels();
            return;
        }
        const p = OS.el('section', { class: 'panel notification-panel flyout', role: 'dialog', 'aria-label': 'Notifications and calendar' }), head = OS.el('div', { class: 'notification-header' }), list = OS.el('div', { class: 'notification-list' }), calendar = OS.el('div', { class: 'mini-calendar' });
        head.append(iconButton('clock', 'Focus sessions', () => OS.openApp('focus')), OS.el('strong', { text: 'Notifications', style: 'font-size:13px' }), OS.el('button', { class: 'secondary', text: 'Clear all', style: 'font-size:10px;padding:4px 8px', onclick: async () => { OS.notifications = []; await OS.db.set('notifications', []); OS.showNotifications(true); renderTaskbar(); } }));
        if (!OS.notifications.length)
            list.append(OS.el('div', { class: 'empty', style: 'height:110px;min-height:110px;font-size:12px', html: OS.icon('bell', 26) + '<span>You’re all caught up.</span>' }));
        for (const n of OS.notifications.slice(0, 8)) {
            n.read = true;
            const card = OS.el('article', { class: 'notification-item' }), row = OS.el('div', { class: 'row' });
            row.append(OS.el('h4', { text: n.title, style: 'flex:1' }), iconButton('close', 'Dismiss notification', async () => { OS.notifications = OS.notifications.filter(x => x.id !== n.id); await OS.db.set('notifications', OS.notifications); OS.showNotifications(true); renderTaskbar(); }));
            card.append(row, OS.el('p', { text: n.message }), OS.el('time', { text: OS.time(new Date(n.time)), style: 'display:block;margin-top:6px' }));
            list.append(card);
        }
        OS.db.set('notifications', OS.notifications);
        let month = new Date();
        function renderCalendar() { calendar.replaceChildren(); const heading = OS.el('div', { class: 'row', style: 'margin-bottom:10px' }); heading.append(OS.el('strong', { text: month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), style: 'font-size:13px;flex:1' }), iconButton('back', 'Previous month', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCalendar(); }), iconButton('forward', 'Next month', () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCalendar(); })); const grid = OS.el('div', { class: 'calendar-grid' }); for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
            grid.append(OS.el('span', { class: 'weekday', text: d })); const today = OS.isoDate(new Date()); for (const date of OS.calendarDays(month)) {
            const iso = OS.isoDate(date);
            grid.append(OS.el('button', { class: (iso === today ? 'today ' : '') + (date.getMonth() !== month.getMonth() ? 'outside' : ''), text: date.getDate(), 'aria-label': date.toDateString(), onclick: () => OS.openApp('calendar', { date: iso }) }));
        } calendar.append(heading, grid, OS.el('button', { class: 'secondary', text: 'Open Calendar', style: 'margin-top:14px;width:100%;font-size:11px', onclick: () => OS.openApp('calendar') })); }
        renderCalendar();
        p.append(head, list, calendar);
        mountPanel('notifications', p);
        renderTaskbar();
    };
    OS.showWidgets = () => OS.openApp('widgets');
    OS.showTaskView = () => {
        if (panel === 'taskview') {
            OS.closePanels();
            return;
        }
        const p = OS.el('section', { class: 'task-view', role: 'dialog', 'aria-label': 'Task View' });
        mountPanel('taskview', p);
        taskViewRender = () => {
            if (!p.isConnected)
                return;
            p.replaceChildren();
            const header = OS.el('div', { class: 'row' }, OS.el('h2', { text: OS.desktops.find(d => d.id === OS.activeDesktop)?.name || 'Your desktop', style: 'flex:1;margin:0' }), OS.el('span', { style: 'font-size:11px;color:#cfdaeb', text: 'Drag a window onto another desktop to move it.' }), iconButton('taskview', 'Saved window groups', () => OS.openApp('workspaces')), iconButton('close', 'Close Task View', OS.closePanels));
            p.append(header);
            const grid = OS.el('div', { class: 'task-view-grid' }), windows = Array.from(OS.windows.values()).filter(w => w.desktop === OS.activeDesktop).sort((a, b) => b.z - a.z);
            for (const w of windows) {
                const card = OS.el('div', { class: 'task-view-window', role: 'button', tabindex: '0', draggable: true, 'aria-label': 'Switch to ' + w.title }), title = OS.el('div', { class: 'row' }, OS.el('span', { style: 'font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1', text: w.title })), close = iconButton('close', 'Close ' + w.title, () => { });
                close.onclick = e => { e.stopPropagation(); w.close(); };
                title.append(close);
                card.append(title, OS.el('div', { style: 'margin:auto', html: OS.appIcon(w.appId, 48) }), OS.el('small', { text: w.minimized ? 'Minimized' : w.state.path || OS.apps.get(w.appId)?.description || 'Open app', style: 'font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;display:block' }));
                card.onclick = () => { OS.closePanels(); w.restore(); };
                card.onkeydown = e => { if (e.key === 'Enter')
                    card.click(); };
                card.ondragstart = e => e.dataTransfer.setData('application/x-aster-window', w.id);
                grid.append(card);
            }
            if (!windows.length)
                grid.append(OS.el('div', { style: 'padding:45px 0 60px;color:#d5dfed', text: 'A fresh desktop. Open an app from Start to get going.' }));
            p.append(grid);
            const desks = OS.el('div', { class: 'desktop-switcher' });
            for (const d of OS.desktops) {
                const card = OS.el('div', { class: 'desktop-card' + (d.id === OS.activeDesktop ? ' active' : ''), role: 'button', tabindex: '0' }), preview = OS.el('div', { class: 'desktop-card-preview', html: `<span style="font-size:11px;color:#fff">${Array.from(OS.windows.values()).filter(w => w.desktop === d.id).length} windows</span>` });
                card.append(preview, OS.el('span', { text: d.name, style: 'font-size:12px' }));
                card.onclick = () => { OS.switchDesktop(d.id); taskViewRender?.(); };
                card.onkeydown = e => { if (e.key === 'Enter')
                    card.click(); };
                card.ondragover = e => e.preventDefault();
                card.ondrop = e => { e.preventDefault(); const id = e.dataTransfer.getData('application/x-aster-window'), win = OS.windows.get(id); if (win) {
                    win.desktop = d.id;
                    win.sync();
                    OS.emit('windows');
                    taskViewRender?.();
                } };
                card.oncontextmenu = e => OS.context(e, [{ text: 'Rename desktop', icon: 'rename', action: async () => { const name = await OS.prompt('Desktop name', d.name); if (name?.trim()) {
                            d.name = name.trim().slice(0, 30);
                            await OS.db.set('desktops', OS.desktops);
                            OS.showTaskView();
                        } } }, { text: 'Remove desktop', icon: 'close', disabled: OS.desktops.length < 2, action: async () => { const other = OS.desktops.find(x => x.id !== d.id); for (const win of OS.windows.values())
                            if (win.desktop === d.id) {
                                win.desktop = other.id;
                                win.sync();
                            } OS.desktops = OS.desktops.filter(x => x.id !== d.id); await OS.db.set('desktops', OS.desktops); OS.switchDesktop(other.id); OS.showTaskView(); } }]);
                desks.append(card);
            }
            const add = OS.el('button', { class: 'desktop-card', html: '<div class="desktop-card-preview" style="background:#ffffff10;border:1px solid #ffffff20">' + OS.icon('plus', 32) + '</div><span style="font-size:12px">New desktop</span>', onclick: async () => { if (OS.desktops.length >= 8) {
                    OS.notify('Eight desktops is the limit', 'Close an existing desktop to create another.');
                    return;
                } await OS.addDesktop(); taskViewRender?.(); } });
            desks.append(add);
            p.append(desks);
        };
        taskViewRender();
    };
    OS.addDesktopShortcut = async (id) => { if (OS.desktopShortcuts.some(s => s.app === id)) {
        OS.notify('Shortcut already exists', 'You can find this app on your desktop.');
        return;
    } const app = OS.apps.get(id); if (!app)
        return; OS.desktopShortcuts.push({ app: id, title: app.title }); await OS.db.set('desktopShortcuts', OS.desktopShortcuts); renderDesktop(); OS.notify('Added to desktop', app.title); };
    async function renderDesktop() {
        if (!OS.desktopShortcuts)
            return;
        const token = ++desktopToken, container = $('#desktop-icons'), files = await OS.fs.list('/Desktop');
        if (token !== desktopToken)
            return;
        container.replaceChildren();
        const entries = [...OS.desktopShortcuts.filter(s => s.app === 'trash' || OS.apps.has(s.app)).map(s => ({ shortcut: s, title: s.title, app: s.app })), ...files.map(f => ({ file: f, title: OS.fs.name(f.path), app: f.kind === 'directory' ? 'files' : OS.appForFile(f.path, f.mime) }))];
        const clear = () => OS.$$('.desktop-icon', container).forEach(b => b.classList.remove('selected'));
        for (const entry of entries) {
            const b = OS.el('button', { class: 'desktop-icon', title: entry.title, 'aria-label': entry.title, html: OS.appIcon(entry.app, 39) + `<span>${esc(entry.title)}</span>`, draggable: !!entry.shortcut });
            b._entry = entry;
            const open = () => { if (entry.file)
                OS.guard(OS.openPath)(entry.file.path);
            else if (entry.app === 'trash')
                OS.openApp('files', { path: '/.Trash' });
            else if (entry.app === 'files')
                OS.openApp('files', { path: '/' });
            else
                OS.openApp(entry.app); };
            b.onclick = e => { if (!e.ctrlKey && !e.metaKey)
                clear(); b.classList.toggle('selected', !e.ctrlKey || !b.classList.contains('selected')); };
            b.ondblclick = open;
            b.onkeydown = e => { if (e.key === 'Enter') {
                e.preventDefault();
                open();
            } if (e.key === 'F2') {
                e.preventDefault();
                renameEntry(entry);
            } if (e.key === 'Delete') {
                e.preventDefault();
                removeEntry(entry);
            } if (e.key === 'F5') {
                e.preventDefault();
                renderDesktop();
            } };
            b.oncontextmenu = e => { clear(); b.classList.add('selected'); OS.context(e, [{ text: 'Open', icon: 'play', action: open }, { text: 'Rename', icon: 'rename', key: 'F2', action: () => renameEntry(entry) }, { text: entry.file ? 'Delete' : 'Remove shortcut', icon: 'trash', key: 'Del', action: () => removeEntry(entry) }, ...(entry.file ? [null, { text: 'Open with…', icon: 'file', disabled: entry.file.kind === 'directory', action: () => OS.showOpenWith(entry.file.path) }] : [])]); };
            if (entry.shortcut)
                b.ondragstart = e => e.dataTransfer.setData('application/x-aster-shortcut', entry.app);
            b.ondragover = e => { if (e.dataTransfer.types.includes('application/x-aster-shortcut'))
                e.preventDefault(); };
            b.ondrop = async (e) => { const id = e.dataTransfer.getData('application/x-aster-shortcut'); if (id && entry.shortcut) {
                e.preventDefault();
                e.stopPropagation();
                const from = OS.desktopShortcuts.findIndex(s => s.app === id), to = OS.desktopShortcuts.indexOf(entry.shortcut);
                if (from >= 0 && to >= 0) {
                    const item = OS.desktopShortcuts.splice(from, 1)[0];
                    OS.desktopShortcuts.splice(to, 0, item);
                    await OS.db.set('desktopShortcuts', OS.desktopShortcuts);
                    renderDesktop();
                }
            } };
            container.append(b);
        }
    }
    const renameEntry = OS.guard(async (entry) => { const title = await OS.prompt('Rename', entry.title); if (title === null || !title.trim())
        return; if (entry.file) {
        OS.fs.validateName(title);
        await OS.fs.copy(entry.file.path, OS.fs.join('/Desktop', title), true);
    }
    else {
        entry.shortcut.title = title.trim().slice(0, 50);
        await OS.db.set('desktopShortcuts', OS.desktopShortcuts);
    } renderDesktop(); });
    const removeEntry = OS.guard(async (entry) => { if (entry.file) {
        const dest = await OS.fs.remove(entry.file.path);
        OS.notify('Moved to Recycle Bin', entry.title, 'info', dest ? { label: 'Undo', fn: () => OS.fs.restore(dest) } : null);
    }
    else {
        OS.desktopShortcuts = OS.desktopShortcuts.filter(s => s !== entry.shortcut);
        await OS.db.set('desktopShortcuts', OS.desktopShortcuts);
    } renderDesktop(); });
    const newDesktopFile = async (kind) => { const name = await OS.prompt(kind === 'directory' ? 'New folder' : 'New document', kind === 'directory' ? 'New folder' : 'New document.txt'); if (name === null)
        return; OS.fs.validateName(name); const path = OS.fs.join('/Desktop', name); if (await OS.fs.stat(path))
        throw Error('That name is already in use.'); if (kind === 'directory')
        await OS.fs.mkdir(path);
    else
        await OS.fs.write(path, '', 'text/plain'); };
    const desktop = $('#desktop');
    desktop.oncontextmenu = e => { if (e.target.closest('.desktop-icon'))
        return; OS.context(e, [{ text: 'New folder', icon: 'folder', action: () => newDesktopFile('directory') }, { text: 'New text document', icon: 'file', action: () => newDesktopFile('file') }, { text: 'Paste', icon: 'paste', disabled: !OS.clipboard, action: async () => { if (!OS.clipboard)
                return; const clip = OS.clipboard; for (const src of clip.paths)
                await OS.fs.copy(src, await OS.fs.unique(OS.fs.join('/Desktop', OS.fs.name(src))), clip.cut); if (clip.cut)
                OS.clipboard = null; } }, null, { text: 'Refresh', icon: 'refresh', action: renderDesktop }, { text: 'Open Terminal here', icon: 'terminal', action: () => OS.openApp('terminal', { cwd: '/Desktop' }) }, null, { text: 'Display settings', icon: 'desktop', action: () => OS.openApp('settings', { section: 'system' }) }, { text: 'Personalize', icon: 'paint', action: () => OS.openApp('settings', { section: 'personalization' }) }]); };
    desktop.addEventListener('dragover', e => e.preventDefault());
    desktop.addEventListener('drop', OS.guard(async (e) => { e.preventDefault(); if (e.dataTransfer.files.length)
        await OS.fs.import(Array.from(e.dataTransfer.files), '/Desktop');
    else {
        const raw = e.dataTransfer.getData('application/x-aster-paths');
        if (raw)
            for (const path of JSON.parse(raw))
                await OS.fs.copy(path, await OS.fs.unique(OS.fs.join('/Desktop', OS.fs.name(path))), false);
    } }));
    desktop.addEventListener('pointerdown', e => { if (e.button !== 0 || e.target.closest('.desktop-icon'))
        return; const icons = OS.$$('.desktop-icon', desktop); if (!e.ctrlKey)
        icons.forEach(b => b.classList.remove('selected')); const marquee = OS.el('div', { style: 'position:fixed;border:1px solid #c1ddff;background:#6ba8f333;pointer-events:none;z-index:5' }); const sx = e.clientX, sy = e.clientY; desktop.append(marquee); desktop.setPointerCapture(e.pointerId); const move = ev => { const x = Math.min(sx, ev.clientX), y = Math.min(sy, ev.clientY), width = Math.abs(ev.clientX - sx), height = Math.abs(ev.clientY - sy); Object.assign(marquee.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' }); for (const b of icons) {
        const r = b.getBoundingClientRect();
        if (!e.ctrlKey || r.left < x + width && r.right > x && r.top < y + height && r.bottom > y)
            b.classList.toggle('selected', r.left < x + width && r.right > x && r.top < y + height && r.bottom > y);
    } }; const end = () => { marquee.remove(); desktop.removeEventListener('pointermove', move); desktop.removeEventListener('pointerup', end); desktop.removeEventListener('pointercancel', end); }; desktop.addEventListener('pointermove', move); desktop.addEventListener('pointerup', end, { once: true }); desktop.addEventListener('pointercancel', end, { once: true }); });
    OS.unlockAudio = () => { try {
        OS.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        if (OS.audioContext.state === 'suspended')
            OS.audioContext.resume();
    }
    catch { } };
    OS.tone = () => { if (OS.settings.muted || OS.settings.volume === 0 || OS.quiet?.active())
        return; try {
        const c = OS.audioContext;
        if (!c || c.state !== 'running')
            return;
        const osc = c.createOscillator(), gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + .13);
        gain.gain.setValueAtTime(0, c.currentTime);
        gain.gain.linearRampToValueAtTime(OS.settings.volume / 100 * .1, c.currentTime + .02);
        gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + .55);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + .6);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
    catch { } };
    async function timerTick() { if (OS.timer.endAt && Date.now() >= OS.timer.endAt && !OS.timer.notified) {
        OS.timer.endAt = null;
        OS.timer.remaining = 0;
        OS.timer.notified = true;
        OS.tone();
        OS.notify('Time’s up', 'Your Aster timer has finished.', 'info', { label: 'Open Clock', fn: () => OS.openApp('clock') });
    } }
    let checkedMinute = '', reminded = new Set();
    async function calendarTick() { const now = new Date(), key = OS.isoDate(now) + ' ' + now.getHours() + ':' + now.getMinutes(); if (key === checkedMinute)
        return; checkedMinute = key; const events = await OS.db.get('calendarEvents') || []; for (const event of events) {
        if (!event.reminder || reminded.has(event.id) || event.date !== OS.isoDate(now))
            continue;
        const due = new Date(event.date + 'T' + event.time);
        if (now >= due && now - due < 60000) {
            reminded.add(event.id);
            OS.tone();
            OS.notify(event.title, event.time + ' · ' + (event.notes || 'Calendar reminder'), 'info', { label: 'Open Calendar', fn: () => OS.openApp('calendar', { date: event.date }) });
        }
    } }
    OS.on('windows', () => { renderTaskbar(); taskViewRender?.(); });
    OS.on('apps', () => { if (OS.pins) {
        renderTaskbar();
        renderDesktop();
    } });
    OS.on('settings', () => { if (OS.pins) {
        renderTaskbar();
        renderDesktop();
    } document.querySelector('meta[name="theme-color"]')?.setAttribute('content', document.body.dataset.theme === 'dark' ? '#20232c' : '#eaf0fc'); });
    OS.on('notification', () => { if (OS.pins)
        renderTaskbar(); if (panel === 'notifications')
        OS.showNotifications(true); });
    let desktopRefresh;
    OS.on('fs-change', () => { clearTimeout(desktopRefresh); desktopRefresh = setTimeout(() => OS.guard(renderDesktop)(), 100); });
    window.addEventListener('online', renderTaskbar);
    window.addEventListener('offline', renderTaskbar);
    window.addEventListener('resize', renderTaskbar);
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (OS.settings.theme === 'auto')
        OS.applySettings(); });
    document.addEventListener('keydown', e => {
        if(e.ctrlKey && e.altKey && ['v','f','w','u','r'].includes(e.key.toLowerCase()) && !OS.$('#dialog-layer').children.length && !OS.$('.lock-screen')){e.preventDefault();const id={v:'clipboard',f:'focus',w:'workspaces',u:'accessibility',r:'recorder'}[e.key.toLowerCase()];OS.openApp(id);}
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        OS.lock();
    } });
    OS.ready = (async () => {
        await OS.init();
        OS.pins = await OS.db.get('taskbarPins') || ['files', 'browser', 'notepad', 'terminal', 'store'];
        OS.pins = [...new Set(OS.pins.map(id=>OS.migrateShellSession({app:id})?.app).filter(id=>id&&OS.apps.has(id)))];
        OS.desktopShortcuts = await OS.db.get('desktopShortcuts') || [{ app: 'files', title: 'This PC' }, { app: 'trash', title: 'Recycle Bin' }, { app: 'browser', title: 'Orbit Browser' }, { app: 'welcome', title: 'Welcome to Aster' }];
        OS.renderer = new OS.Renderer();
        await OS.renderer.init();
        renderTaskbar();
        await renderDesktop();
        let session = OS.settings.restore ? await OS.db.get('session') : null;
        if (Array.isArray(session) && session.length) {
            for (const previous of session.slice(0, 18)) {
                const saved = OS.migrateShellSession(previous); if (!saved) continue;
                if (!OS.apps.has(saved.app))
                    continue;
                const desk = OS.desktops.some(d => d.id === saved.desktop) ? saved.desktop : OS.desktops[0].id;
                OS.launch(saved.app, { ...saved.state, rect: saved.rect, restoreRect: saved.restoreRect, maximized: saved.maximized, minimized: saved.minimized, desktop: desk, state: saved.state });
            }
            OS.switchDesktop(OS.desktops[0].id);
        }
        else
            OS.openApp('files');
        await OS.runStartup?.();
        clockInterval = setInterval(() => { updateClock(); timerTick(); }, 1000);
        setInterval(() => calendarTick().catch(console.warn), 5000);
        navigator.getBattery?.().then(b => { OS.battery = b; renderTaskbar(); b.addEventListener('levelchange', renderTaskbar); b.addEventListener('chargingchange', renderTaskbar); }).catch(() => { });
        if (!window.ASTER_STANDALONE && 'serviceWorker' in navigator && location.protocol !== 'file:')
            navigator.serviceWorker.register('./sw.js').catch(e => console.info('Offline cache unavailable:', e.message));
        const boot = $('#boot');
        boot.style.opacity = '0';
        setTimeout(() => boot.remove(), 320);
        OS.booted = true;
        if (OS.db.mode !== 'IndexedDB')
            OS.notify('Temporary session only', 'Persistent browser storage is unavailable. Export your work before closing this page. '+(OS.db.problem||''), 'warning');
        if (!await OS.db.get('welcomed')) {
            await OS.db.set('welcomed', true);
            setTimeout(() => OS.notify('Welcome to your new workspace', 'Open Start to explore built-in tools and ' + (OS.webCatalog?.apps.length || 0) + ' categorized web apps. ' + (OS.db.mode === 'IndexedDB' ? 'Your virtual files are saved in this browser.' : 'Export your work before closing this temporary session.'), 'info', { label: 'Meet Aster', fn: () => OS.openApp('welcome') }), 800);
        }
        return OS;
    })().catch(error => { console.error('Aster startup:', error); const boot = $('#boot'); if (boot) {
        boot.replaceChildren(OS.el('h1', { text: 'Aster could not start' }), OS.el('p', { text: error.message, style: 'max-width:550px;text-align:center;padding:20px' }), OS.el('button', { class: 'primary', text: 'Try again', onclick: () => location.reload() }));
    } throw error; });
})();
