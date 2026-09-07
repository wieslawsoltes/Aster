'use strict';
(() => {
    const OS = Aster, $ = OS.$, esc = OS.esc;
    const ib = (icon, label, fn) => OS.el('button', { class: 'icon-button', title: label, 'aria-label': label, html: OS.icon(icon, 18), onclick: OS.guard(fn) });
    OS.exportBackup = async () => {
        const files = await OS.db.all();
        if (files.reduce((n, f) => n + (f.size || 0), 0) > 100 * 1024 * 1024)
            throw Error('This in-browser backup is limited to 100 MB of file data. Download large media files individually first.');
        const packed = [];
        for (const f of files) {
            const entry = { ...f };
            if (f.content instanceof Blob) {
                entry.content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ type: 'base64', data: String(reader.result).split(',')[1] }); reader.onerror = () => reject(reader.error); reader.readAsDataURL(f.content); });
            }
            else if (f.kind === 'file')
                entry.content = { type: 'text', data: String(f.content || '') };
            packed.push(entry);
        }
        const backup = { format: 'aster-desktop-backup', version: 1, createdAt: new Date().toISOString(), settings: OS.settings, files: packed, tasks: await OS.db.get('tasks') || [], calendarEvents: await OS.db.get('calendarEvents') || [], customApps: OS.customApps, worldCities: await OS.db.get('worldCities') || [] };
        OS.download(new Blob([JSON.stringify(backup)], { type: 'application/json' }), 'Aster-backup-' + OS.isoDate(new Date()) + '.json');
        OS.notify('Backup exported', `${files.length} virtual files and folders. Connected local folders are not included.`);
    };
    OS.importBackup = async () => {
        const [file] = await OS.readFile('.json,application/json');
        if (!file)
            return;
        if (file.size > 150 * 1024 * 1024)
            throw Error('Backup is larger than the 150 MB import limit.');
        const backup = JSON.parse(await file.text());
        if (backup.format !== 'aster-desktop-backup' || backup.version !== 1 || !Array.isArray(backup.files))
            throw Error('This is not a supported Aster backup.');
        if (backup.files.length > 30000)
            throw Error('Backup contains too many files.');
        const puts = [], seen = new Set();
        let total = 0;
        for (const f of backup.files) {
            if (typeof f.path !== 'string' || f.path !== OS.fs.normalize(f.path) || f.path === '/' || f.path === '/Local' || f.path.startsWith('/Local/') || seen.has(f.path) || !['file', 'directory'].includes(f.kind))
                throw Error('Backup contains an invalid or duplicate path.');
            seen.add(f.path);
            let content;
            if (f.kind === 'file') {
                if (f.content?.type === 'base64') {
                    const binary = atob(f.content.data), data = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++)
                        data[i] = binary.charCodeAt(i);
                    content = new Blob([data], { type: typeof f.mime === 'string' ? f.mime : 'application/octet-stream' });
                }
                else if (f.content?.type === 'text' && typeof f.content.data === 'string')
                    content = f.content.data;
                else
                    throw Error('Invalid file content in backup.');
            }
            const size = f.kind === 'file' ? (content instanceof Blob ? content.size : new Blob([content]).size) : 0;
            total += size;
            if (total > 100 * 1024 * 1024)
                throw Error('Backup expands to more than 100 MB.');
            const entry = { path: f.path, kind: f.kind, modified: Number(f.modified) || Date.now(), ...(f.kind === 'file' ? { content, mime: typeof f.mime === 'string' ? f.mime : OS.fs.mime(f.path), size } : {}) };
            if (typeof f.originalPath === 'string' && f.path.startsWith('/.Trash/') && f.originalPath === OS.fs.normalize(f.originalPath) && !f.originalPath.startsWith('/Local'))
                entry.originalPath = f.originalPath;
            puts.push(entry);
        }
        const dirs = new Set(puts.filter(f => f.kind === 'directory').map(f => f.path));
        for (const f of puts) {
            let p = OS.fs.parent(f.path);
            while (p !== '/') {
                if (seen.has(p) ? !dirs.has(p) : (await OS.fs.stat(p))?.kind !== 'directory')
                    throw Error('A parent directory is missing from the backup: ' + p);
                p = OS.fs.parent(p);
            }
        }
        if (!await OS.confirm('Restore Aster backup?', `${puts.length} virtual files and folders will be merged into this workspace. Matching virtual files, tasks, and calendar events will be replaced. Your connected local folders are never touched. Export your current backup first to keep it.`, 'Restore'))
            return;
        await OS.db.batch(puts);
        const safeTasks = (Array.isArray(backup.tasks) ? backup.tasks : []).slice(0, 10000).filter(t => typeof t.title === 'string').map(t => ({ id: OS.uid(), title: t.title.slice(0, 200), done: !!t.done, priority: t.priority === 'high' ? 'high' : 'normal', due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '', notes: String(t.notes || '').slice(0, 20000), addedDay: String(t.addedDay || '') }));
        const safeEvents = (Array.isArray(backup.calendarEvents) ? backup.calendarEvents : []).slice(0, 10000).filter(e => typeof e.title === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^\d{2}:\d{2}$/.test(e.time)).map(e => ({ id: OS.uid(), title: e.title.slice(0, 150), date: e.date, time: e.time, notes: String(e.notes || '').slice(0, 20000), reminder: !!e.reminder }));
        await OS.db.set('tasks', safeTasks);
        await OS.db.set('calendarEvents', safeEvents);
        for (const record of Array.isArray(backup.customApps) ? backup.customApps : []) {
            if (typeof record.id === 'string' && /^custom-[\w-]+$/.test(record.id) && typeof record.title === 'string' && typeof record.path === 'string' && record.path === OS.fs.normalize(record.path) && !record.path.startsWith('/Local') && (await OS.fs.stat(record.path))?.kind === 'file') {
                const app = { id: record.id, title: record.title.slice(0, 60), path: record.path };
                const old = OS.customApps.find(a => a.id === app.id);
                if (old)
                    Object.assign(old, app);
                else
                    OS.customApps.push(app);
                OS.registerCustom(app);
            }
        }
        await OS.db.set('customApps', OS.customApps);
        OS.emit('fs-change', { path: '/' });
        OS.emit('tasks-change');
        OS.emit('calendar-change');
        OS.notify('Backup restored', 'Virtual files, tasks, calendar, and app launchers were restored. Appearance settings are kept unchanged. Reopen Tasks and Calendar to refresh open views.');
    };
    OS.register('settings', { title: 'Settings', description: 'Make this workspace feel like you.', category: 'System', width: 995, height: 710, minWidth: 460, singleton: true,
        mount: async (w, options) => {
            let section = options.section || w.state.section || 'system';
            const layout = OS.el('div', { class: 'settings-layout' }), side = OS.el('aside', { class: 'settings-sidebar' }), main = OS.el('div', { class: 'settings-main' });
            w.body.classList.add('transparent');
            layout.append(side, main);
            w.body.append(layout);
            const navigation = [['system', 'desktop', 'System', 'display sound brightness volume startup renderer network'], ['personalization', 'paint', 'Personalization', 'theme wallpaper dark light accent taskbar transparency animation'], ['apps', 'store', 'Apps', 'installed import html applications default local folder'], ['storage', 'folder', 'Storage', 'backup restore files disk recycle bin reset'], ['accessibility', 'eye', 'Accessibility', 'text size motion contrast keyboard'], ['about', 'info', 'About Aster', 'version browser capabilities privacy security help']];
            const user = OS.el('div', { class: 'settings-user', html: `<div class="user-avatar">${esc(OS.settings.username[0] || 'A')}</div><div><strong>${esc(OS.settings.username)}</strong><small>Local account</small></div>` }), search = OS.el('input', { class: 'settings-search', placeholder: 'Find a setting', 'aria-label': 'Find a setting' }), nav = OS.el('div');
            side.append(user, search, nav);
            const row = (icon, title, description, control) => { const r = OS.el('div', { class: 'setting-row' }, OS.el('span', { html: OS.icon(icon, 23) }), OS.el('div', { class: 'setting-label' }, OS.el('strong', { text: title }), OS.el('small', { text: description }))); if (control)
                r.append(control); return r; };
            const toggle = key => { const b = OS.el('button', { class: 'switch' + (OS.settings[key] ? ' on' : ''), role: 'switch', 'aria-checked': String(!!OS.settings[key]), 'aria-label': key }); b.onclick = OS.guard(async () => { await OS.setSetting(key, !OS.settings[key]); b.classList.toggle('on', !!OS.settings[key]); b.setAttribute('aria-checked', String(!!OS.settings[key])); }); return b; };
            const select = (key, values) => { const s = OS.el('select', { 'aria-label': key }); for (const [value, label] of values)
                s.append(OS.el('option', { value: String(value), text: label, selected: String(OS.settings[key]) === String(value) })); s.onchange = OS.guard(async () => { await OS.setSetting(key, typeof OS.settings[key] === 'number' ? Number(s.value) : s.value); }); return s; };
            const range = (key, min, max) => { const group = OS.el('div', { class: 'row' }), input = OS.el('input', { type: 'range', min, max, value: OS.settings[key], 'aria-label': key }), label = OS.el('span', { text: OS.settings[key] + '%', style: 'font-size:10px;min-width:33px;text-align:right' }); input.oninput = () => { OS.settings[key] = Number(input.value); label.textContent = input.value + '%'; OS.applySettings(); }; input.onchange = () => OS.db.set('settings', OS.settings); group.append(input, label); return group; };
            const heading = t => main.append(OS.el('h3', { class: 'settings-section-title', text: t }));
            async function render() {
                w.state.section = section;
                OS.saveSession();
                nav.replaceChildren();
                for (const [id, icon, title] of navigation)
                    nav.append(OS.el('button', { class: 'nav-item' + (section === id ? ' active' : ''), html: OS.icon(icon, 19) + title, onclick: () => navigate(id) }));
                main.replaceChildren(OS.el('h1', { text: navigation.find(n => n[0] === section)?.[2] || 'Settings' }));
                if (section === 'system') {
                    main.append(OS.el('div', { class: 'settings-hero', html: `<div class="device-preview"><div class="aster-symbol"></div></div><div><strong style="font-size:17px;font-weight:550">Your Aster workspace</strong><div class="muted" style="font-size:11px;margin:5px 0">A browser desktop. A world of possibilities.</div><span class="pill">${OS.icon('shield', 12)} Local session</span></div>` }));
                    main.append(row('desktop', 'Display brightness', 'Dims Aster only. Your real display brightness is unchanged.', range('brightness', 15, 100)), row('speaker', 'App volume', 'Controls Aster media playback and notification tones.', range('volume', 0, 100)), row('speaker', 'Mute Aster audio', 'Does not change your device’s volume.', toggle('muted')));
                    heading('Your session');
                    main.append(row('user', 'Display name', 'Shown in Start, Settings, and your desktop.', OS.el('button', { class: 'secondary', text: 'Change', onclick: OS.guard(async () => { const name = await OS.prompt('Your display name', OS.settings.username); if (name?.trim()) {
                            await OS.setSetting('username', name.trim().slice(0, 40));
                            $('.user-avatar', user).textContent = OS.settings.username[0];
                            $('strong', user).textContent = OS.settings.username;
                        } }) })), row('restore', 'Restore windows on startup', 'Reopen your app windows and saved editor drafts.', toggle('restore')), row('clock', 'Time format', 'Uses your browser’s local time zone.', select('clock24', [[true, '24-hour'], [false, '12-hour']])));
                    // Boolean selects require explicit conversion instead of string truthiness.
                    const clockSelect = OS.$('select[aria-label="clock24"]', main);
                    clockSelect.onchange = () => OS.setSetting('clock24', clockSelect.value === 'true');
                    heading('Runtime');
                    main.append(row('gpu', 'Graphics engine', OS.metrics.mode === 'WebGPU' ? 'WebGPU wallpaper and per-window GPU surfaces. HTML handles interactive content.' : 'Canvas wallpaper and native CSS window surfaces. ' + (OS.renderer?.fallbackReason || ''), OS.el('button', { class: 'secondary', text: 'Performance', onclick: () => OS.launch('taskmanager', { section: 'performance' }) })), row(navigator.onLine ? 'wifi' : 'disconnect', 'Network status', navigator.onLine ? 'The browser reports a network connection. Internet reachability is not independently verified.' : 'The browser reports that it is offline.', OS.el('span', { class: 'pill', text: navigator.onLine ? 'Online signal' : 'Offline' })));
                }
                else if (section === 'personalization') {
                    heading('Choose your background');
                    const wallpapers = OS.el('div', { class: 'wallpaper-grid' });
                    for (const [id, name, colors] of [['bloom', 'Blue bloom', ['#092c6c', '#3f97e9']], ['midnight', 'Midnight', ['#121733', '#7267c0']], ['dusk', 'Afterglow', ['#512254', '#e39eaa']], ['sage', 'Soft sage', ['#153f3c', '#7bb8a7']]]) {
                        const b = OS.el('button', { class: 'wallpaper-option' + (OS.settings.wallpaper === id ? ' active' : ''), html: `<span class="wallpaper-swatch" style="background:linear-gradient(135deg,${colors.join(',')})"></span><span>${name}</span>`, onclick: OS.guard(async () => { await OS.setSetting('wallpaper', id); OS.$$('.wallpaper-option', wallpapers).forEach(x => x.classList.toggle('active', x === b)); }) });
                        wallpapers.append(b);
                    }
                    main.append(wallpapers);
                    main.append(row('sun', 'Choose your mode', 'Light, dark, or follow your real system appearance.', select('theme', [['light', 'Light'], ['dark', 'Dark'], ['auto', 'System']])));
                    const colors = OS.el('div', { class: 'accent-palette' });
                    for (const color of ['#176ae6', '#7956c8', '#bd477a', '#177e77', '#ab6523']) {
                        const b = OS.el('button', { class: 'accent-color' + (OS.settings.accent === color ? ' active' : ''), style: '--color:' + color, title: color, 'aria-label': 'Accent ' + color, onclick: async () => { await OS.setSetting('accent', color); OS.$$('.accent-color', colors).forEach(x => x.classList.toggle('active', x === b)); } });
                        colors.append(b);
                    }
                    const custom = OS.el('input', { type: 'color', value: OS.settings.accent, 'aria-label': 'Custom accent' });
                    custom.onchange = () => OS.setSetting('accent', custom.value);
                    colors.append(custom);
                    main.append(row('paint', 'Accent color', 'A little color across your workspace.', colors), row('eye', 'Transparency effects', 'Frosted glass in menus, flyouts, and the taskbar.', toggle('transparency')), row('spark', 'Desktop animation', 'Subtle GPU wallpaper motion. Respects reduced-motion preferences.', toggle('motion')), row('gpu', 'Rendering resolution', 'Lower values reduce GPU pixel work. Changes graphics, not text sharpness.', select('quality', [[.5, 'Efficient · 50%'], [.75, 'Balanced · 75%'], [1, 'Full · 100%']])));
                    heading('Taskbar and desktop');
                    main.append(row('taskview', 'Taskbar alignment', 'Keep your favorite apps centered or left-aligned.', select('align', [['center', 'Center'], ['left', 'Left']])), row('grid', 'Desktop icons', 'Show shortcuts and desktop files.', toggle('desktopIcons')));
                }
                else if (section === 'apps') {
                    main.append(row('store', 'App Center', `${Array.from(OS.apps.values()).filter(a => !a.hidden).length} apps ready to open. No downloads required for built-in apps.`, OS.el('button', { class: 'primary', text: 'Open', onclick: () => OS.launch('store') })), row('code', 'Run your own HTML apps', 'Use Code Studio or import a self-contained HTML file.', OS.el('button', { class: 'secondary', text: 'Code Studio', onclick: () => OS.launch('code') })));
                    heading('Files and permissions');
                    main.append(row('folder', 'Connect a local folder', 'A permission prompt lets you choose which real folder Aster can read and write.', OS.el('button', { class: 'secondary', text: 'Choose folder', onclick: OS.guard(async () => { const path = await OS.fs.mount(); OS.launch('files', { path }); }) })), row('cut', 'Screen capture', 'Only captures a screen, window, or tab you explicitly choose.', OS.el('button', { class: 'secondary', text: 'Open Snips', onclick: () => OS.launch('snips') })));
                    heading('App behavior');
                    main.append(OS.el('div', { class: 'card', html: '<h3>Built for the browser</h3><p class="muted" style="font-size:12px;line-height:1.8;margin:0">Built-in apps share Aster’s virtual file system. Imported HTML apps run in isolated frames without direct access to your desktop data. They may still make network requests. Only run code you trust. Win32 Lab runs a limited subset of 32-bit Windows executables in a browser worker. Drivers, installers, native host execution, and operating-system services are not supported.</p>' }));
                    if (OS.customApps.length) {
                        heading('Your apps');
                        for (const app of OS.customApps)
                            main.append(row('code', app.title, app.path, OS.el('button', { class: 'secondary', text: 'Launch', onclick: () => OS.launch(app.id) })));
                    }
                }
                else if (section === 'storage') {
                    const all = await OS.db.all(), bytes = all.reduce((n, f) => n + (f.size || 0), 0);
                    let estimate = {};
                    try {
                        estimate = await navigator.storage?.estimate?.() || {};
                    }
                    catch { }
                    const persisted = await navigator.storage?.persisted?.().catch(() => false);
                    main.append(OS.el('div', { class: 'card', html: `<div class="row">${OS.icon('folder', 34)}<div><h2 style="margin:0">${OS.formatBytes(bytes)}</h2><small>${all.filter(f => f.kind === 'file').length} virtual files · ${all.filter(f => f.kind === 'directory').length} folders</small></div></div><div class="storage-bar"><span style="width:${estimate.quota ? Math.max(1, Math.min(100, bytes / estimate.quota * 100)) : 5}%"></span></div><p class="muted" style="font-size:10px;margin:11px 0 0">${estimate.quota ? 'Browser-reported site quota: ' + OS.formatBytes(estimate.quota) + '. Usage includes files; cache and other site data may add to it.' : 'The browser has not exposed a storage quota.'}</p>` }));
                    heading('Keep your work safe');
                    main.append(row('download', 'Export backup', 'Downloads virtual files, tasks, calendar events, and your app launchers.', OS.el('button', { class: 'primary', text: 'Export', onclick: OS.guard(OS.exportBackup) })), row('upload', 'Restore backup', 'Merge a previous Aster backup. Matching virtual files are replaced.', OS.el('button', { class: 'secondary', text: 'Import', onclick: OS.guard(OS.importBackup) })), row('shield', 'Persistent storage', persisted ? 'This browser has granted persistent storage. You can still delete it in browser settings.' : 'Ask the browser to protect site data from automatic eviction.', OS.el('button', { class: 'secondary', text: persisted ? 'Granted' : 'Request', disabled: !!persisted, onclick: OS.guard(async () => { if (!navigator.storage?.persist)
                            throw Error('Persistent storage requests are not available here.'); const granted = await navigator.storage.persist(); OS.notify(granted ? 'Storage protected' : 'Not granted', granted ? 'The browser granted persistent storage. Backups are still recommended.' : 'Your browser did not grant persistent storage. Export backups regularly.'); render(); }) })));
                    heading('Manage storage');
                    main.append(row('trash', 'Empty Recycle Bin', 'Permanently delete virtual items already in the Recycle Bin.', OS.el('button', { class: 'secondary danger', text: 'Empty', onclick: OS.guard(async () => { const files = await OS.fs.list('/.Trash'); if (!files.length) {
                            OS.notify('Already empty', 'There are no items in the Recycle Bin.');
                            return;
                        } if (await OS.confirm('Empty Recycle Bin?', `${files.length} items will be permanently removed.`, 'Empty', true)) {
                            for (const f of files)
                                await OS.fs.remove(f.path, true);
                            render();
                        } }) })), row('refresh', 'Reset Aster', 'Erase this browser’s Aster data. Real local folders are not affected.', OS.el('button', { class: 'secondary danger', text: 'Reset', onclick: OS.guard(async () => { const text = await OS.dialog({ title: 'Erase all Aster data?', message: 'This permanently removes virtual files, drafts, tasks, events, and app launchers in this browser. Export a backup first. Connected real folders are never deleted.\n\nType ERASE to continue.', value: '', confirm: 'Erase Aster', danger: true }); if (text !== 'ERASE')
                            return; for (const win of Array.from(OS.windows.values()))
                            await win.close(true); OS.cancelSessionSave(); OS.db.db?.close(); const r = indexedDB.deleteDatabase('aster-desktop'); r.onsuccess = () => location.reload(); r.onerror = () => OS.notify('Reset failed', r.error?.message || 'Storage could not be removed.', 'warning'); r.onblocked = () => OS.notify('Close other Aster tabs', 'Another open tab is keeping the database in use.', 'warning'); }) })));
                    main.append(OS.el('p', { class: 'muted', text: 'Browser-local storage is not a cloud backup. Changing browser profiles, clearing site data, private browsing, or browser eviction can remove virtual files. Export your work regularly.', style: 'font-size:11px;line-height:1.8;margin:22px 0' }));
                }
                else if (section === 'accessibility') {
                    main.append(row('file', 'Text size', 'Adjust the base interface text size.', select('fontSize', [[12, 'Small · 12 px'], [13, 'Default · 13 px'], [14, 'Medium · 14 px'], [15, 'Large · 15 px']])), row('eye', 'High-contrast interface', 'Stronger borders and opaque surfaces.', toggle('highContrast')), row('spark', 'Animations', 'Disable for a quieter, more static desktop.', toggle('motion')), row('eye', 'Transparent surfaces', 'Turn off for stronger separation between surfaces.', toggle('transparency')), row('bell', 'Do not disturb', 'Keep notifications in Notification Center without pop-up toasts.', toggle('dnd')));
                    heading('Keyboard shortcuts');
                    main.append(OS.el('div', { class: 'card', html: `<table class="shortcut-table">${[['Start and search', 'Ctrl + Space'], ['Task view', 'Ctrl + Alt + Tab'], ['New terminal', 'Ctrl + Alt + T'], ['New note', 'Ctrl + Alt + N'], ['Show desktop', 'Ctrl + Alt + D'], ['Snap left / right', 'Ctrl + Alt + ← / →'], ['Maximize', 'Ctrl + Alt + ↑'], ['Save in editors', 'Ctrl + S'], ['Close active app', 'Alt + F4'], ['Dismiss menus', 'Escape']].map(([a, b]) => `<tr><td>${a}</td><td><kbd>${b}</kbd></td></tr>`).join('')}</table><p class="muted" style="font-size:10px;margin:15px 0 0">Some shortcuts may be intercepted by your real OS or browser. Every action is also available with the mouse.</p>` }));
                }
                else {
                    const info = OS.renderer?.info || {};
                    main.append(OS.el('div', { class: 'about-mark', html: '<div class="aster-symbol"></div><div><h1>Aster</h1><small>YOUR SPACE. YOUR PACE.</small></div>' }), OS.el('p', { class: 'muted', text: 'An independent, Windows 11-inspired browser desktop.', style: 'margin-bottom:24px;font-size:13px' }));
                    const facts = [['Version', OS.version], ['Renderer', OS.metrics.mode], ['GPU adapter', info.description || [info.vendor, info.architecture].filter(Boolean).join(' · ') || 'Not exposed by this browser'], ['Storage', OS.db.mode], ['Secure context', window.isSecureContext ? 'Yes' : 'No'], ['Local folder picker', window.showDirectoryPicker ? 'Available' : 'Not available — use file import'], ['Screen capture', navigator.mediaDevices?.getDisplayMedia ? 'Available with permission' : 'Not available'], ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone], ['Browser platform', navigator.platform || 'Not exposed']];
                    main.append(OS.el('div', { class: 'card', html: `<table class="shortcut-table">${facts.map(([a, b]) => `<tr><td>${esc(a)}</td><td style="text-align:left;word-break:break-word">${esc(b)}</td></tr>`).join('')}</table>` }));
                    heading('A desktop, not a kernel');
                    main.append(OS.el('div', { class: 'card', html: '<p class="muted" style="font-size:12px;line-height:1.85;margin:0">Aster is a web application. It does not boot a computer or replace Windows. Win32 Lab emulates a small subset of x86/Win32 for compatible PE32 EXEs; MSI installers and host-system control remain unsupported. Its terminal is a virtual shell. Its lock screen is a visual cover, not an authentication boundary.<br><br>The project uses original icons, graphics, code, and branding. It is not affiliated with, endorsed by, or distributed by Microsoft. Windows is a Microsoft trademark.</p>' }));
                    heading('Local by design');
                    main.append(OS.el('p', { class: 'muted', text: 'No sign-in, analytics, external fonts, or CDN dependencies are built in. Your files stay in this browser unless you explicitly download, export, connect a folder, browse a website, or run app code that accesses a network.', style: 'font-size:11px;line-height:1.8' }));
                }
            }
            function navigate(id) { section = navigation.some(n => n[0] === id) ? id : 'system'; search.value = ''; OS.guard(render)(); }
            search.oninput = () => { const q = search.value.trim().toLowerCase(); if (!q) {
                render();
                return;
            } main.replaceChildren(OS.el('h1', { text: 'Search settings' })); const matches = navigation.filter(n => (n[2] + ' ' + n[3]).toLowerCase().includes(q)); for (const [id, icon, title, keywords] of matches) {
                main.append(OS.el('button', { class: 'setting-row', style: 'width:100%;text-align:left;white-space:normal', html: OS.icon(icon, 23) + `<div class="setting-label"><strong>${esc(title)}</strong><small>${esc(keywords)}</small></div>` + OS.icon('forward', 15), onclick: () => navigate(id) }));
            } if (!matches.length)
                main.append(OS.el('div', { class: 'empty', text: 'No matching settings. Try “theme”, “backup”, or “text”.' })); };
            w.navigate = navigate;
            await render();
        }
    });
    OS.register('taskmanager', { title: 'Task Manager', description: 'A clear view of what your desktop is doing.', category: 'System', width: 900, height: 625, minWidth: 480, singleton: true,
        mount: async (w, options) => {
            let section = options.section || 'processes';
            const layout = OS.el('div', { class: 'manager-layout' }), side = OS.el('aside', { class: 'manager-sidebar' }), main = OS.el('div', { class: 'manager-main' });
            layout.append(side, main);
            w.body.append(layout);
            let paintChart = () => { };
            const render = () => {
                side.replaceChildren();
                for (const [id, icon, title] of [['processes', 'list', 'Processes'], ['performance', 'gpu', 'Performance'], ['details', 'info', 'Runtime details']])
                    side.append(OS.el('button', { class: 'nav-item' + (id === section ? ' active' : ''), html: OS.icon(icon, 18) + title, onclick: () => { section = id; render(); } }));
                main.replaceChildren(OS.el('h2', { text: section === 'processes' ? 'Processes' : section === 'performance' ? 'Performance' : 'Runtime details' }));
                paintChart = () => { };
                if (section === 'processes') {
                    const windows = Array.from(OS.windows.values()).sort((a, b) => b.z - a.z);
                    main.append(OS.el('p', { class: 'muted', text: 'These are Aster app windows, not operating-system processes.', style: 'font-size:11px' }));
                    const table = OS.el('table', { class: 'process-table' });
                    table.innerHTML = '<thead><tr><th>Name</th><th>Status</th><th>Desktop</th><th></th></tr></thead>';
                    const body = OS.el('tbody');
                    for (const target of windows) {
                        const row = OS.el('tr');
                        row.innerHTML = `<td><div class="row">${OS.appIcon(target.appId, 25)}<span>${esc(target.title)}</span></div></td><td class="muted">${target.minimized ? 'Minimized' : target.id === OS.focused ? 'Active' : 'Open'}</td><td class="muted">${esc(OS.desktops.find(d => d.id === target.desktop)?.name || '—')}</td>`;
                        const cell = OS.el('td');
                        cell.append(OS.el('button', { class: 'secondary', text: 'End task', onclick: () => target.close() }));
                        row.append(cell);
                        body.append(row);
                    }
                    table.append(body);
                    main.append(table, OS.el('p', { class: 'muted', text: 'Per-app CPU, GPU execution time, and private memory are not exposed by the browser and are intentionally not fabricated.', style: 'font-size:10px;line-height:1.8;margin-top:22px' }));
                }
                else if (section === 'performance') {
                    const heap = performance.memory?.usedJSHeapSize;
                    main.append(OS.el('div', { class: 'manager-stats', html: `<div class="metric-card"><small>RENDERER</small><strong>${OS.metrics.mode}</strong><small>Current graphics backend</small></div><div class="metric-card"><small>SUBMISSIONS / SEC</small><strong data-metric="fps">${OS.metrics.fps}</strong><small>0 at rest with animation off</small></div><div class="metric-card"><small>JS HEAP</small><strong data-metric="heap">${heap ? OS.formatBytes(heap) : 'N/A'}</strong><small>Browser-reported, not per app</small></div>` }));
                    main.append(OS.el('h3', { text: 'Renderer submissions', style: 'font-size:13px' }));
                    const chart = OS.el('canvas', { class: 'performance-chart', width: 650, height: 170, 'aria-label': 'Renderer submissions history' });
                    main.append(chart);
                    const info = OS.el('p', { class: 'muted', style: 'font-size:11px;line-height:1.8' });
                    main.append(info);
                    paintChart = () => { const fps = $('[data-metric="fps"]', main), heapEl = $('[data-metric="heap"]', main); if (fps)
                        fps.textContent = String(OS.metrics.fps); if (heapEl)
                        heapEl.textContent = performance.memory ? OS.formatBytes(performance.memory.usedJSHeapSize) : 'N/A'; const ctx = chart.getContext('2d'), data = OS.metrics.frames; ctx.clearRect(0, 0, 650, 170); ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border'); ctx.lineWidth = 1; for (let y = 15; y < 170; y += 35) {
                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(650, y);
                        ctx.stroke();
                    } ctx.strokeStyle = OS.settings.accent; ctx.lineWidth = 2; ctx.beginPath(); data.forEach((v, i) => { const x = i / 59 * 650, y = 160 - Math.min(120, v) / 120 * 150; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); info.textContent = `Last CPU-side render submission: ${OS.metrics.frameMs.toFixed(2)} ms. Draw calls in last submitted frame: ${OS.metrics.drawCalls}. ${OS.windows.size} app windows. These are render-submission measurements, not GPU execution time or monitor refresh rate. Animated wallpaper targets 30 submissions per second; interaction invalidates surfaces immediately.`; };
                    paintChart();
                }
                else {
                    const info = OS.renderer?.info || {};
                    const rows = [['Backend', OS.metrics.mode], ['Adapter vendor', info.vendor || 'Not exposed'], ['Architecture', info.architecture || 'Not exposed'], ['Description', info.description || 'Not exposed'], ['Max texture dimension', OS.renderer?.device?.limits?.maxTextureDimension2D || 'Not exposed'], ['Reported hardware concurrency', navigator.hardwareConcurrency || 'Not exposed'], ['Reported device memory', navigator.deviceMemory ? navigator.deviceMemory + ' GB (coarse browser value)' : 'Not exposed'], ['App windows', OS.windows.size], ['Virtual desktops', OS.desktops.length], ['Storage engine', OS.db.mode], ['Uptime', Math.floor((performance.now() - OS.started) / 1000) + ' seconds'], ['User agent', navigator.userAgent]];
                    main.append(OS.el('div', { class: 'card', html: `<table class="shortcut-table">${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td style="text-align:left;font-size:11px;word-break:break-word">${esc(b)}</td></tr>`).join('')}</table>` }));
                }
            };
            const timer = setInterval(() => { if (section === 'performance')
                paintChart(); }, 1000);
            w.addCleanup(() => clearInterval(timer));
            let pending;
            w.on('windows', () => { if (section === 'processes') {
                clearTimeout(pending);
                pending = setTimeout(() => { if (!w.closed)
                    render(); }, 120);
            } });
            w.addCleanup(() => clearTimeout(pending));
            w.navigate = id => { section = id; render(); };
            render();
        }
    });
    OS.installHTML = async () => {
        const [file] = await OS.readFile('.html,.htm,text/html');
        if (!file)
            return;
        if (file.size > 5 * 1024 * 1024)
            throw Error('HTML app packages are limited to 5 MB. Use self-contained HTML without large embedded media.');
        const name = await OS.prompt('Install HTML app', file.name.replace(/\.[^.]+$/, ''), 'The app runs in an isolated frame. Only install code you trust; it may make network requests. It will not have direct access to Aster’s files.');
        if (!name?.trim())
            return;
        const folder = '/Projects/Installed apps';
        if (!await OS.fs.stat(folder))
            await OS.fs.mkdir(folder);
        const path = await OS.fs.unique(OS.fs.join(folder, file.name));
        await OS.fs.write(path, await file.text(), 'text/html');
        const record = { id: 'custom-' + OS.uid(), title: name.trim().slice(0, 60), path };
        OS.customApps.push(record);
        await OS.db.set('customApps', OS.customApps);
        OS.registerCustom(record);
        OS.notify('App installed in Aster', record.title, 'info', { label: 'Launch', fn: () => OS.launch(record.id) });
    };
    OS.uninstallApp = async (id) => { const app = OS.customApps.find(a => a.id === id); if (!app)
        return; if (!await OS.confirm('Remove ' + app.title + '?', `This removes the app launcher and closes its windows. Its source file is kept at ${app.path}.`, 'Remove'))
        return; for (const w of Array.from(OS.windows.values()).filter(w => w.appId === id))
        await w.close(true); OS.customApps = OS.customApps.filter(a => a.id !== id); OS.apps.delete(id); await OS.db.set('customApps', OS.customApps); OS.emit('apps'); };
    OS.register('store', { title: 'App Center', description: 'A small collection of genuinely useful apps.', category: 'System', width: 985, height: 700, minWidth: 430, singleton: true,
        mount: async (w) => {
            let query = '';
            const toolbar = OS.el('div', { class: 'toolbar' }), search = OS.el('input', { placeholder: 'Search your apps', 'aria-label': 'Search apps', style: 'width:250px;max-width:55%;font-size:12px' }), main = OS.el('div', { class: 'store-main' });
            toolbar.append(search, OS.el('span', { class: 'spacer' }), OS.el('button', { class: 'secondary', html: OS.icon('upload', 16) + 'Install HTML app', onclick: OS.guard(OS.installHTML) }));
            w.body.append(toolbar, main);
            const render = () => { main.replaceChildren(); if (!query) {
                main.append(OS.el('div', { class: 'store-hero', html: '<div class="grow"><div class="eyebrow" style="color:#b9c9f3;margin-bottom:9px">A LITTLE MORE POSSIBILITY</div><h1>Good things come built in.</h1><p>Write, create, organize, and explore. Every app here runs in your browser. No account. No subscriptions.</p></div><div class="aster-symbol"></div>' }));
            } const apps = Array.from(OS.apps.values()).filter(a => !a.hidden && (a.title + ' ' + a.description + ' ' + a.category).toLowerCase().includes(query)); main.append(OS.el('div', { class: 'section-heading', html: `<span>${query ? 'Search results' : 'Your collection'}</span><span class="muted" style="font-size:11px;font-weight:400">${apps.length} apps</span>` })); const grid = OS.el('div', { class: 'store-grid' }); for (const app of apps) {
                const card = OS.el('div', { class: 'store-card' }), content = OS.el('div', { class: 'grow' });
                content.append(OS.el('strong', { text: app.title }), OS.el('p', { text: app.description || 'Your HTML application' }));
                const row = OS.el('div', { class: 'row' });
                row.append(OS.el('button', { text: 'Open', onclick: () => OS.launch(app.id) }), ib('more', 'App options', () => { }));
                row.lastChild.onclick = e => OS.context(e, [{ text: 'Open', icon: 'play', action: () => OS.launch(app.id) }, { text: 'Add desktop shortcut', icon: 'desktop', action: () => OS.addDesktopShortcut?.(app.id) }, ...(app.custom ? [null, { text: 'Remove app', icon: 'trash', danger: true, action: () => OS.uninstallApp(app.id) }] : [])]);
                content.append(row);
                card.append(OS.el('span', { html: OS.appIcon(app.id, 48) }), content);
                grid.append(card);
            } main.append(grid); if (!apps.length)
                main.append(OS.el('div', { class: 'empty', text: 'No apps match that search.' })); main.append(OS.el('p', { class: 'muted', text: 'App Center is a local app library, not an online marketplace. Imported HTML apps are isolated, but they may access the network. Install only code you trust.', style: 'font-size:10px;line-height:1.8;margin-top:25px' })); };
            search.oninput = () => { query = search.value.toLowerCase(); render(); };
            w.on('apps', render);
            render();
        }
    });
    OS.register('welcome', { title: 'Welcome to Aster', description: 'Meet your new little corner of the internet.', category: 'System', width: 765, height: 680, minWidth: 370, singleton: true,
        mount: async (w) => {
            const page = OS.el('article', { class: 'welcome' });
            page.innerHTML = `<div class="row" style="margin-bottom:26px"><div class="aster-symbol" style="width:42px;height:42px"></div><span class="eyebrow" style="margin-left:3px">ASTER DESKTOP</span><span class="spacer"></span><span class="pill">${OS.icon('gpu', 12)} ${esc(OS.metrics.mode)}</span></div><h1>Your space.<br>Your pace.</h1><p class="welcome-subtitle">A familiar desktop, with a little more room for you. Built for the browser. Made to do real things.</p>`;
            const grid = OS.el('div', { class: 'welcome-grid' });
            for (const [id, title, description] of [['files', 'Make yourself at home', 'Organize files, connect a local folder, and keep things close.'], ['notepad', 'Catch a thought', 'Write, edit, find, replace, and save real text documents.'], ['paint', 'Color outside the lines', 'Draw, paint, edit images, and export your creations.'], ['code', 'Build something yours', 'Write HTML, CSS, and JavaScript. Run it as your own app.']])
                grid.append(OS.el('button', { class: 'welcome-card', html: OS.appIcon(id, 35) + `<div><h3>${title}</h3><p>${description}</p></div>`, onclick: () => OS.launch(id) }));
            page.append(grid, OS.el('div', { class: 'row', style: 'flex-wrap:wrap;margin-bottom:25px' }, OS.el('button', { class: 'primary', html: OS.icon('paint', 16) + 'Make it yours', onclick: () => OS.launch('settings', { section: 'personalization' }) }), OS.el('button', { class: 'secondary', html: OS.icon('store', 16) + 'Explore all apps', onclick: () => OS.launch('store') })));
            page.append(OS.el('div', { class: 'welcome-foot', html: '<strong style="color:var(--text)">A couple of things to know.</strong><br>Drag windows by their title bars. Hover over Maximize for snap layouts. Use Task View for more desktops. Press <kbd>Ctrl</kbd> + <kbd>Space</kbd> to find anything.<br><br>Your virtual files live in this browser, not in the cloud. Export a backup in Settings to keep them safe. Aster is a web desktop, not a bootable OS. Win32 Lab runs a limited set of 32-bit Windows programs locally in the browser; it does not replace your real system.<br><br><span class="eyebrow" style="font-size:9px">INDEPENDENTLY BUILT · PLAIN HTML / CSS / JAVASCRIPT / WGSL</span>' }));
            w.body.append(page);
        }
    });
})();
