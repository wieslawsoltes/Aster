/* Aster integrated desktop surfaces. Original browser-scoped implementation. MIT. */
'use strict';
(() => {
    const OS = Aster, $ = OS.$;
    const button = (text, action, primary = false) => OS.el('button', {
        class: primary ? 'primary' : 'secondary', text, onclick: OS.guard(action)
    });
    const icon = (name, label, action) => OS.el('button', {
        class: 'icon-button', title: label, 'aria-label': label, html: OS.icon(name, 18), onclick: OS.guard(action)
    });
    const note = text => OS.el('p', { class: 'integration-note', text });
    OS.settings.nightLight = false;

    // An embedded view owns subscriptions and async work, but is NOT an OS window.
    // Disposing it never closes its Settings/Clock/Snips owner or another view.
    OS.activeIntegratedViews = new Set();
    OS.mountView = (appId, container, options = {}, owner = null, descriptor = null) => {
        const app = descriptor || OS.apps.get(appId);
        if (!app) throw Error('Unknown embedded view: ' + appId);
        const body = OS.el('div', { class: 'embedded-view', 'data-view': appId });
        container.append(body);
        const cleanups = [];
        const view = {
            id: OS.uid(), appId, hostAppId: owner?.appId || null, app, body, el: body, state: { ...options }, closed: false,
            dirty: false, title: app.title,
            addCleanup(fn) { if (this.closed) fn(); else cleanups.push(fn); return fn; },
            on(event, fn) { return this.addCleanup(OS.on(event, value => { if (!this.closed) fn(value); })); },
            setTitle(title) { this.title = title; },
            focus() { body.querySelector('input,button,textarea')?.focus(); },
            async close(force = false) {
                if (!force && this.beforeClose && !await this.beforeClose()) return false;
                this.dispose(); return true;
            },
            dispose() {
                if (this.closed) return;
                this.closed = true;
                OS.activeIntegratedViews.delete(this); owner?._integratedViews?.delete(this);
                for (const fn of cleanups.splice(0)) { try { fn(); } catch (e) { console.warn(e); } }
                body.remove();
            }
        };
        view.ready = Promise.resolve().then(() => {
            if (!view.closed) return app.mount(view, options);
        }).then(() => {
            // A pending mount may register a cleanup after it has been removed.
            if (view.closed) return view;
            body.querySelector('.suite-heading')?.remove();
            return view;
        }).catch(error => {
            if (!view.closed) body.replaceChildren(note(error.message));
            throw error;
        });
        OS.activeIntegratedViews.add(view);
        if(owner){
            if(!owner._integratedViews){owner._integratedViews=new Set();owner.addCleanup(()=>{for(const child of [...owner._integratedViews])child.dispose();});}
            owner._integratedViews.add(view);
        }
        return view;
    };

    const destinations = OS.integratedFeatures = Object.freeze({
        clipboard: { title: 'Clipboard history', group: 'System', section: 'clipboard', keys: 'copy paste snippets clipboard', open: () => OS.showClipboard() },
        focus: { title: 'Focus', group: 'System', section: 'focus', keys: 'timer quiet do not disturb focus', open: () => OS.openApp('clock', { mode: 'focus' }) },
        widgets: { title: 'Widgets', group: 'Personalization', keys: 'board widgets agenda quick note', open: () => OS.showWidgets() },
        workspaces: { title: 'Task View & desktops', group: 'System', section: 'multitasking', keys: 'snap groups saved windows desktops workspace', open: () => OS.showTaskView() },
        history: { title: 'Previous versions', group: 'System', section: 'recovery', keys: 'file history restore versions recovery', open: options => options.path ? OS.showFileProperties(options.path, 'versions') : OS.openApp('settings', { section: 'recovery' }) },
        storage: { title: 'Storage', group: 'System', section: 'storage', keys: 'storage sense cleanup disk space', open: () => OS.openApp('settings', { section: 'storage' }) },
        accessibility: { title: 'Accessibility', group: 'Settings', section: 'accessibility', keys: 'reading voice contrast pointer color filters accessibility', open: () => OS.openApp('settings', { section: 'accessibility' }) },
        recorder: { title: 'Screen recording', group: 'Snips', keys: 'capture video screen recorder recording', open: () => OS.openApp('snips', { mode: 'record' }) },
        archives: { title: 'Compressed folders', group: 'File Explorer', keys: 'zip archive compressed extract', open: options => OS.openApp('files', { path: options.path || '/Downloads' }) }
    });
    // Preserve registered app endpoints for saved sessions and downstream integrations.
    // Normal desktop launch points dispatch to the integrated destination instead.
    for (const id of Object.keys(destinations)) Object.assign(OS.apps.get(id), { hidden: true, systemFeature: true });
    OS.openApp = (id, options = {}) => destinations[id] ? destinations[id].open(options) : OS.launch(id, options);
    // Old persisted utility windows migrate to their natural parent surfaces.
    // Transient clipboard/widgets/Task View never pop up automatically on reload.
    OS.migrateShellSession = saved => {
        if (!saved || typeof saved.app !== 'string') return null;
        const state = { ...(saved.state || {}) };
        const map = {storage:['settings','storage'], accessibility:['settings','accessibility'],
            history:['settings','recovery'], focus:['clock','focus'], recorder:['snips','record'], archives:['files',null]};
        if (['clipboard','widgets','workspaces'].includes(saved.app)) return null;
        const target = map[saved.app];
        if (!target) return { ...saved, state };
        if (target[0] === 'settings') state.section = target[1];
        if (target[0] === 'clock' || target[0] === 'snips') state.mode = target[1];
        if (target[0] === 'files') state.path = state.path ? OS.fs.parent(state.path) : '/Downloads';
        return { ...saved, app: target[0], state };
    };
    OS.integrations = {
        destinations,
        navigation: [
            ['home', 'home', 'Home', 'recommended recent settings'],
            ['system', 'desktop', 'System', 'display sound notifications focus clipboard storage multitasking'],
            ['personalization', 'paint', 'Personalization', 'theme wallpaper dark light accent taskbar transparency animation'],
            ['apps', 'store', 'Apps', 'installed import html applications default local folder'],
            ['time', 'clock', 'Time & language', 'clock date time format timezone language'],
            ['accessibility', 'eye', 'Accessibility', 'text size color filters reading pointer speech contrast keyboard'],
            ['privacy', 'shield', 'Privacy & permissions', 'clipboard recording permissions local privacy'],
            ['about', 'info', 'About Aster', 'version browser capabilities help'],
            ['display', 'desktop', 'Display', 'brightness night light', 'system'],
            ['sound', 'speaker', 'Sound', 'volume muted audio', 'system'],
            ['notifications', 'bell', 'Notifications', 'do not disturb quiet hours notifications', 'system'],
            ['focus', 'clock', 'Focus', 'focus duration daily goal tasks', 'system'],
            ['storage', 'folder', 'Storage', 'storage sense cleanup largest files quota recycle', 'system'],
            ['multitasking', 'taskview', 'Multitasking', 'snap groups virtual desktops restore windows', 'system'],
            ['clipboard', 'paste', 'Clipboard', 'history pinned copy paste', 'system'],
            ['recovery', 'undo', 'File recovery & backup', 'backup restore file history previous versions', 'system']
        ],
        normalize(id) { return id === 'essentials' ? 'system' : id; },
        async renderSettings(w, section, main, navigate) {
            const row = (glyph, title, description, control) => {
                const result = OS.el('div', { class: 'setting-row' }, OS.el('span', { html: OS.icon(glyph, 22) }),
                    OS.el('div', { class: 'setting-label' }, OS.el('strong', { text: title }), OS.el('small', { text: description })));
                if (control) result.append(control);
                return result;
            };
            const switchFor = (key, label) => {
                const b = OS.el('button', { class: 'switch' + (OS.settings[key] ? ' on' : ''), role: 'switch', 'aria-label': label, 'aria-checked': String(!!OS.settings[key]) });
                b.onclick = OS.guard(async () => {
                    await OS.setSetting(key, !OS.settings[key]);
                    b.classList.toggle('on', !!OS.settings[key]); b.setAttribute('aria-checked', String(!!OS.settings[key]));
                });
                return b;
            };
            const link = (id, detail) => {
                const item = this.navigation.find(n => n[0] === id);
                const r = OS.el('button', { class: 'setting-row settings-link', 'aria-label': item[2], onclick: () => navigate(id) },
                    OS.el('span', { html: OS.icon(item[1], 24) }), OS.el('div', { class: 'setting-label' },
                    OS.el('strong', { text: item[2] }), OS.el('small', { text: detail || item[3] })), OS.el('span', { html: OS.icon('forward', 15) }));
                main.append(r);
            };
            const embed = async (id, options) => {
                const slot = OS.el('section', { class: 'settings-embedded', 'aria-label': OS.apps.get(id).title }); main.append(slot);
                const view = OS.mountView(id, slot, options, w); w.integrationView = view;
                await view.ready;
                return view;
            };
            if (section === 'home') {
                main.append(OS.el('div', { class: 'settings-hero' }, OS.el('div', { class: 'device-preview', html: '<div class="aster-symbol"></div>' }),
                    OS.el('div', {}, OS.el('h2', { text: 'Your Aster desktop' }), note(OS.settings.username + ' · Local browser session'))));
                main.append(row('user','Display name','Shown in Start and this local desktop.',button('Change name',async()=>{const name=await OS.prompt('Your display name',OS.settings.username);if(name?.trim()){await OS.setSetting('username',name.trim().slice(0,40));navigate('home');}})));
                link('personalization', 'Make this desktop yours'); link('system', 'Display, sound, notifications and storage');
                link('accessibility', 'Vision, interaction and reading');
                main.append(note('Settings apply to this Aster desktop. Your computer’s system settings stay unchanged.'));
                return true;
            }
            if (section === 'system') {
                main.append(OS.el('div', { class: 'settings-hero' }, OS.el('div', { class: 'device-preview', html: '<div class="aster-symbol"></div>' }),
                    OS.el('div', {}, OS.el('h2', { text: 'Aster' }), note(OS.version + ' · ' + OS.db.mode + ' · ' + OS.metrics.mode))));
                for (const [id, text] of [['display', 'Brightness, night light'], ['sound', 'Aster media and notification volume'], ['notifications', 'Do not disturb and quiet hours'], ['focus', 'Session duration and daily progress'], ['storage', 'Storage Sense and cleanup recommendations'], ['multitasking', 'Snap windows, desktops and saved groups'], ['clipboard', 'Clipboard history and pinned items'], ['recovery', 'Previous versions, export and restore']]) link(id, text);
                return true;
            }
            if (section === 'display' || section === 'sound') {
                const key = section === 'display' ? 'brightness' : 'volume';
                const range = OS.el('input', { type: 'range', min: key === 'brightness' ? 15 : 0, max: 100, value: OS.settings[key], 'aria-label': key === 'brightness' ? 'Aster brightness' : 'Aster volume' });
                const value = OS.el('output', { text: OS.settings[key] + '%' });
                range.oninput = () => { OS.settings[key] = Number(range.value); value.textContent = range.value + '%'; if (key === 'volume') OS.settings.muted = false; OS.applySettings(); };
                range.onchange = OS.guard(() => OS.db.set('settings', OS.settings));
                main.append(row(section === 'display' ? 'sun' : 'speaker', section === 'display' ? 'Brightness' : 'Volume', 'Affects Aster only, not the host device.', OS.el('div', { class: 'row' }, range, value)));
                if (section === 'display') {
                    main.append(row('moon', 'Night light', 'Warmer colors inside this desktop.', switchFor('nightLight', 'Night light'))); link('personalization');
                } else main.append(row('speaker', 'Mute Aster audio', 'Media playback and notification tones in Aster.', switchFor('muted', 'Mute Aster audio')));
                return true;
            }
            if (section === 'notifications') {
                main.append(row('bell', 'Do not disturb', 'Notifications stay in Notification Center while banners and sounds are quiet.', switchFor('dnd', 'Do not disturb')));
                const q = OS.quiet.schedule;
                const schedule = OS.el('input', { type: 'checkbox', checked: q.enabled, 'aria-label': 'Scheduled quiet hours' });
                schedule.onchange = OS.guard(async () => { q.enabled = schedule.checked; await OS.featureSave('quiet-hours', q); OS.featureChange('focus'); });
                main.append(row('clock', 'Turn on automatically', 'Scheduled quiet hours in your browser time zone.', schedule));
                for (const [key, label] of [['start', 'From'], ['end', 'Until']]) {
                    const time = OS.el('input', { type: 'time', value: q[key], 'aria-label': 'Quiet hours ' + key });
                    time.onchange = OS.guard(async () => { q[key] = time.value; await OS.featureSave('quiet-hours', q); OS.featureChange('focus'); });
                    main.append(row('clock', label, '', time));
                }
                main.append(row('info', 'During Focus', 'Quiet mode follows an active focus session without overwriting manual Do not disturb.', button('Open Focus', () => navigate('focus'))));
                main.append(button('Open Notification Center', () => OS.showNotifications())); return true;
            }
            if (section === 'clipboard') {
                main.append(row('paste', 'Clipboard history', 'Opt in to saving text copied in supported Aster editors. Unpinned items disappear on reload.', switchFor('clipboardHistory', 'Clipboard history')),
                    row('shield', 'Sync across devices', 'Not available. Text is not uploaded or synced to an account.'),
                    row('trash', 'Clear clipboard data', 'Pinned entries are kept.', button('Clear', async () => { OS.clipboardText.model.clear(); await OS.clipboardText.save(); })),
                    button('Open clipboard history', () => OS.showClipboard())); return true;
            }
            if(section === 'time'){
                const select=OS.el('select',{'aria-label':'clock24'});
                for(const [value,label]of [['true','24-hour'],['false','12-hour']])select.append(OS.el('option',{value,text:label,selected:String(OS.settings.clock24)===value}));
                select.onchange=OS.guard(()=>OS.setSetting('clock24',select.value==='true'));
                main.append(row('clock','Time format','Applied to Aster clocks and calendar.',select),
                    row('globe','Time zone',Intl.DateTimeFormat().resolvedOptions().timeZone),note('Date, language and time zone follow this browser. Aster cannot change the host clock.'));
                return true;
            }
            if (section === 'focus') { await embed('focus'); return true; }
            if (section === 'storage') {
                const granted=await navigator.storage?.persisted?.().catch(()=>false);
                if(!main.isConnected)return true;
                main.append(row('shield','Persistent storage','Ask the browser to reduce automatic eviction risk. Exported backups are still needed.',button(granted?'Granted':'Request storage protection',async()=>{
                    if(!navigator.storage?.persist)throw Error('Persistent storage requests are unavailable in this browser.');
                    const approved=await navigator.storage.persist();OS.notify(approved?'Storage protected':'Not granted',approved?'The browser granted persistent storage. Keep external backups too.':'Export your work regularly; storage protection was not granted.');
                })));
                await embed('storage'); return true;
            }
            if (section === 'multitasking') {
                main.append(row('taskview', 'Snap windows', 'Hover over Maximize, drag to an edge, or use the keyboard. Snap Assist helps fill the other half.', switchFor('snapAssist', 'Snap Assist')),
                    row('restore', 'Remember open windows', 'Restore saved window positions and supported drafts on startup.', switchFor('restore', 'Remember open windows')),
                    row('desktop', 'Desktops & window groups', 'Manage desktops and restore saved arrangements directly in Task View.', button('Open Task View', () => OS.showTaskView())));
                return true;
            }
            if (section === 'recovery') {
                main.append(row('undo', 'Keep previous versions', 'Local overwrite recovery only. Browser data loss also removes these versions.', switchFor('historyEnabled', 'Keep previous versions')),
                    OS.el('div', { class: 'suite-actions' }, button('Export backup', OS.exportBackup, true), button('Restore backup', OS.importBackup)),
                    note('Backups contain current virtual files, tasks and events. Version history, native folders and embedded app storage are not included.'));
                await embed('history');
                if(!main.isConnected)return true;
                main.append(row('refresh','Reset Aster','Erases Aster files and metadata from this browser, not connected folders or other app databases.',button('Reset Aster',async()=>{
                    const answer=await OS.dialog({title:'Erase all Aster data?',message:'Export a backup first. This removes virtual files, drafts, tasks, events and app launchers. Connected folders are not deleted. Type ERASE to continue.',value:'',confirm:'Erase Aster',danger:true});
                    if(answer!=='ERASE')return;
                    if(OS.db.mode!=='IndexedDB')throw Error('This is a temporary session. Reload to discard it, after exporting important work.');
                    for(const win of [...OS.windows.values()])await win.close(true);
                    OS.cancelSessionSave();OS.db.db?.close();const request=indexedDB.deleteDatabase('aster-desktop');
                    request.onsuccess=()=>{OS.ignoreUnload=true;location.reload();};
                    request.onerror=()=>OS.notify('Reset failed',request.error?.message||'Storage could not be removed.','warning');
                    request.onblocked=()=>OS.notify('Close other Aster tabs','Another tab is keeping the database open.','warning');
                })));
                return true;
            }
            if (section === 'accessibility') { await embed('accessibility'); return true; }
            if (section === 'privacy') {
                main.append(row('paste', 'Clipboard', 'No clipboard polling. Read system clipboard is an explicit, browser-permission-gated action.', button('Clipboard settings', () => navigate('clipboard'))),
                    row('video', 'Screen recording', 'Sharing begins only when you choose a source. No camera or microphone is requested.', button('Open Snips', () => OS.openApp('snips', { mode: 'record' }))),
                    row('folder', 'Local folders', 'Only folders you choose can be accessed. Revoke browser permissions from your browser settings.'),
                    note('Aster does not control host security settings. The lock screen is a visual cover, not authentication.'));
                return true;
            }
            return false;
        }
    };

    // Reuse the same production feature view in its natural app. There is only one
    // active mount and one close guard; switching modes disposes its listeners.
    function integrateModes(id, modes) {
        const app = OS.apps.get(id), original = app.mount; app.singleton=true;
        const raw = { ...app, mount: original };
        app.mount = async (w, options) => {
            let active, current = null, busy = false;
            const bar = OS.el('nav', { class: 'integrated-modebar', 'aria-label': id === 'snips' ? 'Capture mode' : 'Clock mode' });
            const body = OS.el('div', { class: 'integrated-mode-content' });
            w.body.append(bar, body);
            async function show(mode) {
                if (busy || (mode === active && current)) return;
                if (!modes.some(m => m.id === mode)) mode = modes[0].id;
                busy = true;
                try {
                    if (current && current.beforeClose && !await current.beforeClose()) return;
                    if(current&&active===modes[0].id) Object.assign(w.state,current.state);
                    current?.dispose(); current = null; body.replaceChildren(); active = mode; w.state.mode = mode;
                    for (const b of bar.children) { b.classList.toggle('selected', b.dataset.mode === mode); b.setAttribute('aria-selected', String(b.dataset.mode === mode)); b.tabIndex=b.dataset.mode===mode?0:-1; }
                    const spec = modes.find(m => m.id === mode);
                    // mountView accepts a registry view; original app view is supplied
                    // explicitly to avoid recursion without manufacturing an app entry.
                    const viewId = spec.app || id;
                    current = OS.mountView(viewId, body, { ...w.state, ...options, mode }, w, spec.app ? null : raw);
                    await current.ready;
                    if (w.closed) { current.dispose(); return; }
                    if (id === 'snips') w.recorder = current.recorder;
                    w.onKey = e => {current?.onKey?.(e);if(active===modes[0].id)Object.assign(w.state,current.state);};
                    Object.defineProperty(w, 'dirty', { configurable: true, get: () => !!current?.dirty, set: value => { if (current) current.dirty = value; } });
                    w.setTitle(id === 'snips' ? 'Snips' : 'Clock'); OS.saveSession();
                } finally { busy = false; }
            }
            for (const mode of modes) bar.append(OS.el('button', { class: 'mode-button', role: 'tab', 'aria-selected': 'false', 'data-mode': mode.id,
                html: OS.icon(mode.icon, 18) + '<span>' + OS.esc(mode.title) + '</span>', onclick: OS.guard(() => show(mode.id)) }));
            bar.setAttribute('role', 'tablist');
            bar.addEventListener('keydown', e => {
                if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                const index = modes.findIndex(m => m.id === active), next = (index + (e.key === 'ArrowRight' ? 1 : modes.length - 1)) % modes.length;
                e.preventDefault(); OS.guard(async () => { await show(modes[next].id); bar.children[next]?.focus(); })();
            });
            w.navigate = mode => show(mode); w.beforeClose = () => current?.beforeClose ? current.beforeClose() : Promise.resolve(true);
            w.addCleanup(() => current?.dispose());
            await show(options.mode || w.state.mode || modes[0].id);
        };
    }
    integrateModes('snips', [{ id: 'image', icon: 'cut', title: 'Screenshot' }, { id: 'record', icon: 'video', title: 'Record', app: 'recorder' }]);
    integrateModes('clock', [{ id: 'tools', icon: 'clock', title: 'Timers & clocks' }, { id: 'focus', icon: 'moon', title: 'Focus sessions', app: 'focus' }]);
    OS.settings.snapAssist = true;

    OS.showFileProperties = async (path, tab = 'general') => {
        const file = await OS.fs.stat(path);
        if (!file) throw Error('The selected file no longer exists.');
        const root = OS.el('div', { class: 'file-properties' }), tabs = OS.el('div', { class: 'properties-tabs', role: 'tablist', 'aria-label': 'File properties tabs' });
        const content = OS.el('div', { class: 'properties-content' }); root.append(tabs, content);
        let live = true, generation = 0;
        async function render(next) {
            const version = ++generation; tab = next;
            for (const b of tabs.children) { b.classList.toggle('selected', b.dataset.tab === tab); b.setAttribute('aria-selected', String(b.dataset.tab === tab)); }
            content.replaceChildren();
            if (tab === 'general') {
                content.append(OS.el('div', { class: 'properties-name' }, OS.el('span', { html: OS.fileIcon(file, 36) }), OS.el('strong', { text: OS.fs.name(path) })),
                    note('Location: ' + OS.fs.parent(path)), note('Type: ' + (file.kind === 'directory' ? 'File folder' : file.mime || 'File')),
                    note('Size: ' + OS.formatBytes(file.size || 0)), note('Modified: ' + (file.modified ? new Date(file.modified).toLocaleString() : 'Not available')),
                    note(file.native ? 'Stored in your permission-connected folder.' : 'Stored in this browser’s Aster file system.'));
                return;
            }
            if (file.native || file.kind !== 'file') { content.append(note('Previous versions are available for virtual files, not native folders or directories.')); return; }
            const versions = await OS.history.list(path);
            if (!live || version !== generation) return;
            content.append(note('Local versions of this file. Restoring does not change an unsaved editor buffer. This is not an external backup.'));
            if (!versions.length) content.append(note('There are no previous versions. Save changes to this virtual file to create one.'));
            for (const row of versions) {
                const item = OS.el('article', { class: 'version-row', 'data-version': row.id });
                item.append(OS.el('strong', { text: new Date(row.time).toLocaleString() }), OS.el('small', { text: OS.formatBytes(row.size) }));
                const actions = OS.el('div', { class: 'suite-actions' });
                actions.append(button('Preview', async () => {
                    const entry = await OS.history.get(row.id); if (!entry) throw Error('This version has expired.');
                    const text = /^text\/|json/.test(entry.mime) ? await new Blob([entry.content]).slice(0, 100000).text() : 'Binary file. Download this version to inspect it.';
                    await OS.dialog({ title: 'Previous version', extra: OS.el('pre', { class: 'history-preview', text }), confirm: 'Done' });
                }), button('Restore copy', async () => { const restored = await OS.history.restore(row.id, true); OS.notify('Version restored', restored); }),
                button('Restore', async () => {
                    if (await OS.confirm('Restore this version?', 'The current saved file will be retained in history. Unsaved edits are not replaced.', 'Restore')) { await OS.history.restore(row.id); await render('versions'); }
                }, true), button('Download', async () => { const entry = await OS.history.get(row.id); if (entry) OS.download(new Blob([entry.content], { type: entry.mime }), OS.fs.name(path)); }));
                item.append(actions); content.append(item);
            }
        }
        for (const [id, text] of [['general', 'General'], ['versions', 'Previous versions']]) tabs.append(OS.el('button', {
            role: 'tab', 'data-tab': id, text, onclick: OS.guard(() => render(id))
        }));
        await render(tab);
        try { return await OS.dialog({ title: OS.fs.name(path) + ' Properties', extra: root, confirm: 'OK', cancel: 'Close' }); }
        finally { live = false; generation++; }
    };

    // Open a compressed folder from Explorer: inspect first; keep extraction inside
    // the originating Explorer. There is no ZIP utility window on this path.
    OS.openCompressedFolder = async (path, parent, navigate = null) => {
        const file = await OS.fs.read(path);
        if (file.size > AsterZIP.LIMIT + 1024 * 1024) throw Error('ZIP file is too large.');
        const parsed = AsterZIP.inspect(await (await OS.fs.blob(file)).arrayBuffer());
        const root = OS.el('div', { class: 'compressed-folder-list' });
        root.append(note(parsed.entries.length + ' entries · ' + OS.formatBytes(parsed.total) + ' expanded'));
        for (const e of parsed.entries) root.append(OS.el('div', { class: 'archive-row' }, OS.el('span', { text: e.name }), OS.el('small', { text: e.directory ? 'Folder' : OS.formatBytes(e.length) })));
        const yes = await OS.dialog({ title: OS.fs.name(path), message: 'Compressed folder. Extract to a new folder beside the archive; originals stay unchanged.', extra: root, confirm: 'Extract all', cancel: 'Close' });
        if (!yes) return;
        const destination = await OS.archives.extract(path, parent);
        if (navigate) navigate(destination); else OS.openApp('files', { path: destination });
        return destination;
    };
    const baseOpen = OS.openPath;
    OS.openPath = async path => /\.zip$/i.test(path) && !path.startsWith('/Local/') ? OS.openApp('files', {path}) : baseOpen(path);

    const apply = () => {
        document.body.classList.toggle('night-light', !!OS.settings.nightLight);
        document.body.classList.add('shell-integrated');
    };
    OS.on('settings', apply); apply();
})();
