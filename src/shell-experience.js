/* Unified shell interactions: flyouts, calendar Focus, Task View and input. MIT. */
'use strict';
(() => {
    const OS = Aster, $ = OS.$;
    const button = (text, fn, primary = false) => OS.el('button', { class: primary ? 'primary' : 'secondary', text, onclick: OS.guard(fn) });
    const icon = (name, label, fn) => OS.el('button', { class: 'icon-button', title: label, 'aria-label': label, html: OS.icon(name, 18), onclick: OS.guard(fn) });
    const note = text => OS.el('p', { class: 'integration-note', text });
    const title = (heading, ...actions) => OS.el('header', { class: 'surface-heading' }, OS.el('h2', { class: 'grow', text: heading }), ...actions);
    const tabbable = root => [...root.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(e => !e.disabled && e.getClientRects().length && !e.closest('[hidden]'));
    let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDate = OS.isoDate(new Date()), focusMinutes = 25;

    // Every shell surface participates in the same exclusive panel lifecycle.
    // Escape returns to the original editor/trigger; outside clicks retain their own focus.
    function surface(type, label, className, anchor = document.activeElement) {
        if (OS.shellPanelType === type) { OS.closePanels(true); return null; }
        const panel = OS.el('section', { class: 'panel flyout shell-surface ' + className, role: 'dialog', 'aria-label': label, tabindex: '-1', 'data-shell-surface': type });
        const cleanups = [];
        OS.mountShellPanel(type, panel, () => { for (const fn of cleanups.splice(0)) fn(); }, anchor);
        panel.addEventListener('keydown', e => {
            if ($('#dialog-layer').children.length || !$('#context-menu').hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); OS.closePanels(true); }
            else if (e.key === 'Tab') {
                const items = tabbable(panel), i = items.indexOf(document.activeElement);
                if (!items.length) { e.preventDefault(); panel.focus(); }
                else if ((e.shiftKey && i <= 0) || (!e.shiftKey && (i < 0 || i === items.length - 1))) {
                    e.preventDefault(); items[e.shiftKey ? items.length - 1 : 0].focus();
                }
            }
        });
        const api = {
            panel, cleanups,
            on(event, fn) { cleanups.push(OS.on(event, data => { if (panel.isConnected) fn(data); })); },
            focus(selector = 'button,input,textarea') { requestAnimationFrame(() => { if (panel.isConnected) (panel.querySelector(selector) || panel).focus({ preventScroll: true }); }); }
        };
        return api;
    }
    OS.showClipboard = () => {
        const previous = document.activeElement;
        if (previous?.matches('input[type="password"],[data-private]')) OS.clipboardText.target = null;
        else if (!previous?.closest('[data-app="clipboard"]')) OS.clipboardText.remember(previous);
        const host = surface('clipboard', 'Clipboard history', 'clipboard-flyout', previous);
        if (!host) return;
        const p = host.panel; p.dataset.app = 'clipboard';
        const head = title('Clipboard', icon('settings', 'Clipboard settings', () => OS.openApp('settings', { section: 'clipboard' })), icon('close', 'Close clipboard', () => OS.closePanels(true)));
        const search = OS.el('input', { type: 'search', placeholder: 'Search clipboard history', 'aria-label': 'Search clipboard history' });
        const list = OS.el('div', { class: 'clipboard-items' });
        const footer = OS.el('footer', { class: 'surface-footer' }, button('Clear all unpinned', async () => { OS.clipboardText.model.clear(); await OS.clipboardText.save(); }), button('Read system clipboard', async () => {
            if (!OS.settings.clipboardHistory) throw Error('Turn clipboard history on first.'); await OS.clipboardText.readSystem();
        }));
        p.append(head, search, list, footer);
        function render() {
            list.replaceChildren(); search.hidden = footer.hidden = !OS.settings.clipboardHistory;
            if (!OS.settings.clipboardHistory) {
                list.append(OS.el('div', { class: 'flyout-empty' }, OS.el('span', { html: OS.icon('paste', 40) }), OS.el('h3', { text: 'Save multiple clipboard items' }),
                    note('Turn on history for text copied inside Aster. Only pinned items are kept after reload.'), button('Turn on', async () => { await OS.setSetting('clipboardHistory', true); render(); }, true)));
                return;
            }
            const entries = OS.clipboardText.model.entries.filter(e => e.text.toLowerCase().includes(search.value.toLowerCase()));
            if (!entries.length) list.append(OS.el('div', { class: 'flyout-empty' }, OS.el('span', { html: OS.icon('paste', 36) }), note('Nothing here yet. Copy text in an Aster editor.')));
            for (const entry of entries) {
                const item = OS.el('article', { class: 'clipboard-item', 'data-clip': entry.id });
                const paste = OS.el('button', { class: 'clipboard-paste', 'aria-label': 'Paste ' + entry.text.slice(0, 50), text: entry.text.slice(0, 1200), onclick: OS.guard(() => { OS.clipboardText.paste(entry.id); OS.closePanels(); }) });
                const actions = OS.el('div', { class: 'clipboard-item-actions' }, OS.el('span', { text: entry.pinned ? 'Pinned' : 'Text', class: 'grow' }),
                    icon('pin', entry.pinned ? 'Unpin item' : 'Pin item', async () => { OS.clipboardText.model.pin(entry.id); await OS.clipboardText.save(); }),
                    icon('trash', 'Delete item', async () => { OS.clipboardText.model.remove(entry.id); await OS.clipboardText.save(); }));
                item.append(paste, actions); list.append(item);
            }
        }
        search.oninput = render; host.on('feature-change', e => { if (e.name === 'clipboard') render(); }); host.on('settings', render);
        render(); host.focus(OS.settings.clipboardHistory ? 'input' : 'button.primary');
    };

    OS.showWidgets = () => {
        const host = surface('widgets', 'Widgets', 'widgets-flyout'); if (!host) return;
        const p = host.panel;
        p.append(title('Widgets', icon('settings', 'Personalization settings', () => OS.openApp('settings', { section: 'personalization' })), icon('close', 'Close widgets', () => OS.closePanels(true))),
            OS.el('div', { class: 'widgets-greeting' }, OS.el('h1', { text: 'Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening') }), note(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))));
        const content = OS.el('div', { class: 'surface-scroll' }); p.append(content);
        const view = OS.mountView('widgets', content); host.cleanups.push(() => view.dispose());
        view.ready.then(() => host.focus()).catch(console.warn);
    };

    OS.toggleQuick = () => {
        const host = surface('quick', 'Quick settings', 'quick-panel quick-integrated'); if (!host) return;
        const p = host.panel, grid = OS.el('div', { class: 'quick-grid' }), details = OS.el('div', { class: 'quick-details', hidden: true });
        const specs = [
            ['wifi', 'Connectivity', () => navigator.onLine, () => {
                details.hidden = !details.hidden; details.replaceChildren(title('Network status'), note(navigator.onLine ? 'The browser reports an online connection.' : 'The browser reports it is offline.'), note('Aster cannot select Wi-Fi networks or control your network adapter.'), button('Done', () => { details.hidden = true; }));
            }],
            ['moon', 'Night light', () => OS.settings.nightLight, () => OS.setSetting('nightLight', !OS.settings.nightLight)],
            ['eye', 'Accessibility', () => OS.settings.highContrast || OS.settings.readingGuide, () => {
                details.hidden = false; details.replaceChildren(title('Accessibility', icon('back', 'Back to Quick settings', () => { details.hidden = true; })));
                for (const [key, label] of [['highContrast', 'High contrast'], ['largePointer', 'Large pointer'], ['readingGuide', 'Reading guide'], ['motion', 'Animation effects']]) {
                    const input = OS.el('input', { type: 'checkbox', checked: OS.settings[key], 'aria-label': label });
                    input.onchange = OS.guard(() => OS.setSetting(key, input.checked));
                    details.append(OS.el('label', { class: 'quick-access-row' }, OS.el('span', { text: label, class: 'grow' }), input));
                }
                details.append(button('More accessibility settings', () => OS.openApp('settings', { section: 'accessibility' })));
            }],
            ['bell', 'Do not disturb', () => OS.quiet.active(), () => OS.setSetting('dnd', !OS.settings.dnd)],
            ['paint', 'Dark mode', () => document.body.dataset.theme === 'dark', () => OS.setSetting('theme', document.body.dataset.theme === 'dark' ? 'light' : 'dark')],
            ['max', 'Full screen', () => !!document.fullscreenElement, async () => {
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
                else throw Error('Full screen is not available in this browser.');
            }]
        ];
        const buttons = [];
        for (const [glyph, label, active, run] of specs) {
            const b = OS.el('button', { class: 'quick-tile', 'aria-label': label, html: '<span>' + OS.icon(glyph, 22) + '</span><label>' + label + '</label>', onclick: OS.guard(async () => { await run(); update(); }) });
            buttons.push([b, active]); grid.append(b);
        }
        const sliders = OS.el('div', { class: 'quick-sliders' });
        for (const [key, glyph, label, min] of [['brightness', 'sun', 'Aster brightness', 15], ['volume', 'speaker', 'Aster volume', 0]]) {
            const input = OS.el('input', { type: 'range', min, max: 100, value: OS.settings[key], 'aria-label': label }), output = OS.el('output', { text: OS.settings[key] + '%' });
            const glyphControl = key === 'volume' ? icon('speaker', 'Toggle Aster mute', () => OS.setSetting('muted', !OS.settings.muted)) : OS.el('span', { html: OS.icon(glyph, 20) });
            input.oninput = () => { OS.settings[key] = Number(input.value); if (key === 'volume') OS.settings.muted = false; OS.applySettings(); };
            input.onchange = OS.guard(() => OS.db.set('settings', OS.settings));
            sliders.append(OS.el('div', { class: 'row' }, glyphControl, input, output));
            host.on('settings', () => { input.value = OS.settings[key]; output.textContent = OS.settings[key] + '%'; if (key === 'volume') glyphControl.setAttribute('aria-pressed', String(OS.settings.muted)); });
        }
        const state = OS.el('small', { class: 'quick-status grow' });
        p.append(grid, details, sliders, OS.el('footer', { class: 'quick-bottom' }, state, icon('settings', 'Open Settings', () => OS.openApp('settings'))));
        function update() {
            for (const [b, active] of buttons) { b.classList.toggle('on', !!active()); b.setAttribute('aria-pressed', String(!!active())); }
            state.textContent = OS.focusSession.state.status === 'running' ? 'Focus is keeping notifications quiet' : 'Aster controls · ' + (OS.settings.muted ? 'Muted' : OS.metrics.mode);
        }
        host.on('settings', update); host.on('feature-change', update); update(); host.focus();
    };

    OS.showNotifications = (refresh = false) => {
        if (OS.shellPanelType === 'notifications' && refresh) { OS.refreshNotificationSurface?.(); return; }
        const host = surface('notifications', 'Notifications and calendar', 'notification-panel notifications-integrated'); if (!host) return;
        const p = host.panel, top = OS.el('section', { class: 'notification-stack' }), list = OS.el('div', { class: 'notification-list' });
        const quiet = icon('moon', 'Do not disturb', async () => { await OS.setSetting('dnd', !OS.settings.dnd); updateFocus(); });
        top.append(title('Notification Center', quiet, button('Clear all', async () => { OS.notifications = []; await OS.db.set('notifications', []); renderNotifications(); OS.emit('windows'); })), list);
        const calendar = OS.el('section', { class: 'calendar-surface' }), calendarBody = OS.el('div', { class: 'calendar-surface-body' }), day = OS.el('button', { class: 'calendar-date-heading', text: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) });
        day.setAttribute('aria-expanded', 'true'); day.onclick = () => { calendarBody.hidden = !calendarBody.hidden; day.setAttribute('aria-expanded', String(!calendarBody.hidden)); };
        const agenda = OS.el('div', { class: 'calendar-inline-agenda' }), focus = OS.el('footer', { class: 'calendar-focus' });
        const duration = OS.el('span', { class: 'focus-duration', 'aria-live': 'polite' });
        const less = icon('min', 'Decrease focus duration', () => { focusMinutes = Math.max(5, focusMinutes - 5); updateFocus(); });
        const more = icon('plus', 'Increase focus duration', () => { focusMinutes = Math.min(180, focusMinutes + 5); updateFocus(); });
        const go = button('Focus', async () => { if (OS.focusSession.state.status === 'running' || OS.focusSession.state.status === 'paused') await OS.focusAction('cancel'); else await OS.focusAction('start', focusMinutes, ''); updateFocus(); }, true);
        go.setAttribute('aria-label', 'Start focus session');
        focus.append(less, duration, more, go, icon('clock', 'Open Focus in Clock', () => OS.openApp('clock', { mode: 'focus' })));
        calendar.append(day, calendarBody, agenda, focus); p.append(top, calendar);
        let agendaToken = 0;
        function renderNotifications() {
            const activeId = document.activeElement?.getAttribute('data-notification');
            list.replaceChildren();
            if (!OS.notifications.length) list.append(OS.el('div', { class: 'notifications-empty', text: 'No new notifications' }));
            for (const n of OS.notifications.slice(0, 20)) {
                n.read = true;
                const dismiss = icon('close', 'Dismiss ' + n.title, async () => { OS.notifications = OS.notifications.filter(x => x.id !== n.id); await OS.db.set('notifications', OS.notifications); renderNotifications(); OS.emit('windows'); });
                dismiss.dataset.notification = n.id;
                list.append(OS.el('article', { class: 'notification-item' }, OS.el('div', { class: 'row' }, OS.el('span', { class: 'notification-source grow', text: 'Aster' }), dismiss), OS.el('h4', { text: n.title }), OS.el('p', { text: n.message }), OS.el('time', { text: OS.time(new Date(n.time)) })));
            }
            OS.featureSave('notifications', OS.notifications).catch(console.warn);
            if (activeId) [...list.querySelectorAll('button')].find(b => b.dataset.notification === activeId)?.focus();
        }
        async function renderAgenda() {
            const token = ++agendaToken, entries = (await OS.db.get('calendarEvents') || []).filter(e => e.date === selectedDate).sort((a, b) => a.time.localeCompare(b.time));
            if (!p.isConnected || token !== agendaToken) return;
            agenda.replaceChildren();
            const open = button('Open Calendar', () => OS.openApp('calendar', { date: selectedDate }));
            agenda.append(OS.el('div', { class: 'row' }, OS.el('strong', { class: 'grow', text: new Date(selectedDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }), open));
            if (!entries.length) agenda.append(note('No events for this day'));
            for (const event of entries.slice(0, 3)) agenda.append(OS.el('button', { class: 'agenda-event', text: event.time + '  ' + event.title, onclick: () => OS.openApp('calendar', { date: selectedDate }) }));
        }
        function renderCalendar(focusDate = null) {
            calendarBody.replaceChildren();
            const heading = OS.el('div', { class: 'row calendar-month-heading' }, OS.el('strong', { class: 'grow', text: calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }),
                icon('up', 'Previous month', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); }),
                icon('down', 'Next month', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); }));
            const grid = OS.el('div', { class: 'calendar-grid', role: 'group', 'aria-label': 'Choose a calendar date' });
            for (const d of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) grid.append(OS.el('span', { class: 'weekday', text: d }));
            const today = OS.isoDate(new Date());
            for (const date of OS.calendarDays(calendarMonth)) {
                const iso = OS.isoDate(date), b = OS.el('button', { text: date.getDate(), 'data-date': iso, 'aria-label': date.toDateString(), 'aria-pressed': String(iso === selectedDate),
                    class: (iso === today ? 'today ' : '') + (iso === selectedDate ? 'selected ' : '') + (date.getMonth() !== calendarMonth.getMonth() ? 'outside' : ''),
                    onclick: () => { selectedDate = iso; renderCalendar(iso); renderAgenda(); } });
                b.onkeydown = e => {
                    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!delta) return;
                    e.preventDefault(); const next = new Date(iso + 'T12:00:00'); next.setDate(next.getDate() + delta);
                    selectedDate = OS.isoDate(next); calendarMonth = new Date(next.getFullYear(), next.getMonth(), 1); renderCalendar(selectedDate); renderAgenda();
                };
                grid.append(b);
            }
            calendarBody.append(heading, grid);
            if (focusDate) calendarBody.querySelector('[data-date="' + focusDate + '"]')?.focus();
        }
        function updateFocus() {
            const state = OS.focusSession.state, active = ['running', 'paused'].includes(state.status);
            duration.textContent = active ? Math.ceil(OS.focusSession.remaining() / 60000) + ' min left' : focusMinutes + ' min';
            less.disabled = more.disabled = active;
            go.textContent = active ? 'End focus' : 'Focus'; go.setAttribute('aria-label', active ? 'End focus session' : 'Start focus session');
            quiet.classList.toggle('on', OS.quiet.active()); quiet.setAttribute('aria-pressed', String(OS.quiet.active()));
        }
        OS.refreshNotificationSurface = renderNotifications;
        host.cleanups.push(() => { agendaToken++; OS.refreshNotificationSurface = null; });
        host.on('focus-tick', updateFocus); host.on('settings', updateFocus); host.on('calendar-change', renderAgenda);
        renderNotifications(); renderCalendar(); renderAgenda(); updateFocus(); host.focus(); OS.emit('windows');
    };

    OS.showTaskView = () => {
        const host = surface('taskview', 'Task View', 'task-view integrated-task-view'); if (!host) return;
        const p = host.panel, selected = new Set(); let showingGroups = false;
        const header = OS.el('header', { class: 'taskview-toolbar' }), windows = OS.el('div', { class: 'task-view-grid' }), groupArea = OS.el('section', { class: 'taskview-groups', hidden: true }), desks = OS.el('div', { class: 'desktop-switcher' });
        const saved = button('Saved groups', () => { showingGroups = !showingGroups; groupArea.hidden = !showingGroups; saved.setAttribute('aria-expanded', String(showingGroups)); renderGroups(); }); saved.setAttribute('aria-expanded', 'false');
        header.append(OS.el('h1', { class: 'grow', text: 'Task View' }), saved, button('Save this layout', async () => { const name = await OS.prompt('Save window group', 'My workspace'); if (name?.trim()) { await OS.workspaces.save(name); showingGroups = true; groupArea.hidden = false; saved.setAttribute('aria-expanded', 'true'); renderGroups(); } }), icon('close', 'Close Task View', () => OS.closePanels(true)));
        const arranging = OS.el('div', { class: 'taskview-arrange' }, OS.el('span', { text: 'Select up to four windows to arrange', class: 'grow' }));
        for (const [layout, text] of [['columns', 'Side by side'], ['grid', 'Grid'], ['primary', 'Main + stack']]) arranging.append(button(text, () => {
            const ids = [...selected]; if (!ids.length) throw Error('Select the windows to arrange first.'); OS.workspaces.arrange(layout, ids); OS.closePanels();
        }));
        p.append(header, groupArea, windows, arranging, desks);
        async function saveDesktops() { await OS.featureSave('desktops', OS.desktops); OS.renderer?.invalidate(); OS.emit('windows'); }
        function renderDesktops() {
            desks.replaceChildren();
            for (const d of OS.desktops) {
                const wrap = OS.el('div', { class: 'taskview-desktop', 'data-desktop': d.id });
                const card = OS.el('button', { class: 'desktop-card' + (d.id === OS.activeDesktop ? ' active' : ''), 'aria-label': 'Switch to ' + d.name, 'aria-pressed': String(d.id === OS.activeDesktop), onclick: () => OS.switchDesktop(d.id) });
                const preview = OS.el('div', { class: 'desktop-card-preview', 'data-wallpaper': d.wallpaper || OS.settings.wallpaper });
                for (const win of [...OS.windows.values()].filter(w => w.desktop === d.id).slice(0, 5)) preview.append(OS.el('span', { class: 'desktop-mini-window', html: OS.appIcon(win.appId, 20) }));
                card.append(preview, OS.el('span', { text: d.name }));
                const rename = async () => { const name = await OS.prompt('Rename desktop', d.name); if (name?.trim()) { d.name = name.trim().slice(0, 40); await saveDesktops(); } };
                const remove = async () => {
                    if (OS.desktops.length < 2) return;
                    const target = OS.desktops.find(x => x.id !== d.id);
                    for (const w of OS.windows.values()) if (w.desktop === d.id) { w.desktop = target.id; w.sync(); }
                    OS.desktops = OS.desktops.filter(x => x.id !== d.id);
                    if (OS.activeDesktop === d.id) OS.switchDesktop(target.id);
                    await saveDesktops();
                };
                const menu = e => OS.context(e, [{ text: 'Rename', icon: 'rename', action: rename },
                    { text: 'Move left', icon: 'back', disabled: OS.desktops.indexOf(d) === 0, action: async () => { const i = OS.desktops.indexOf(d); if (i > 0) { [OS.desktops[i], OS.desktops[i - 1]] = [OS.desktops[i - 1], OS.desktops[i]]; await saveDesktops(); } } },
                    { text: 'Move right', icon: 'forward', disabled: OS.desktops.indexOf(d) === OS.desktops.length - 1, action: async () => { const i = OS.desktops.indexOf(d); if (i < OS.desktops.length - 1) { [OS.desktops[i], OS.desktops[i + 1]] = [OS.desktops[i + 1], OS.desktops[i]]; await saveDesktops(); } } },
                    null, { label: 'Desktop background' }, ...[['bloom', 'Blue bloom'], ['midnight', 'Midnight'], ['dusk', 'Afterglow'], ['sage', 'Sage']].map(([id, text]) => ({ text, icon: 'paint', action: async () => { d.wallpaper = id; await saveDesktops(); } })),
                    null, { text: 'Close desktop', icon: 'close', disabled: OS.desktops.length < 2, action: remove }]);
                card.oncontextmenu = menu; card.onkeydown = e => { if (e.key === 'F2') { e.preventDefault(); OS.guard(rename)(); } };
                card.ondragover = e => e.preventDefault(); card.ondrop = e => { e.preventDefault(); const win = OS.windows.get(e.dataTransfer.getData('application/x-aster-window')); if (win) { win.desktop = d.id; win.sync(); OS.emit('windows'); } };
                const controls = OS.el('div', { class: 'desktop-inline-controls' }, icon('more', 'Options for ' + d.name, menu), icon('close', 'Close ' + d.name, remove));
                controls.lastChild.disabled = OS.desktops.length < 2;
                wrap.append(card, controls); desks.append(wrap);
            }
            desks.append(OS.el('button', { class: 'desktop-card new-desktop', 'aria-label': 'New desktop', html: '<div class="desktop-card-preview">' + OS.icon('plus', 30) + '</div><span>New desktop</span>', onclick: OS.guard(async () => { if (OS.desktops.length >= 8) throw Error('Close a desktop before adding another (limit 8).'); await OS.addDesktop(); }) }));
        }
        function renderWindows() {
            const focusId = document.activeElement?.getAttribute('data-taskview-window');
            windows.replaceChildren();
            const items = [...OS.windows.values()].filter(w => w.desktop === OS.activeDesktop && !w.closed).sort((a, b) => b.z - a.z);
            for (const id of selected) if (!items.some(w => w.id === id)) selected.delete(id);
            if (!items.length) windows.append(OS.el('div', { class: 'taskview-empty', text: 'No open windows on this desktop.' }));
            for (const w of items) {
                const card = OS.el('article', { class: 'task-view-window', draggable: true, 'data-taskview-window': w.id });
                const check = OS.el('input', { type: 'checkbox', checked: selected.has(w.id), 'aria-label': 'Select ' + w.title + ' for layout' });
                check.onchange = () => { if (check.checked && selected.size >= 4) { check.checked = false; OS.notify('Select at most four windows', 'Deselect a window before adding another.'); return; } check.checked ? selected.add(w.id) : selected.delete(w.id); };
                const activate = OS.el('button', { class: 'taskview-activate', 'data-taskview-window': w.id, 'aria-label': 'Switch to ' + w.title, onclick: () => { OS.closePanels(); w.restore(); } });
                activate.append(OS.el('div', { class: 'taskview-app-preview', html: OS.appIcon(w.appId, 46) }), OS.el('small', { text: w.minimized ? 'Minimized' : w.state.path || 'Open window' }));
                card.append(OS.el('header', { class: 'row' }, check, OS.el('span', { class: 'grow', text: w.title }), icon('close', 'Close ' + w.title, () => w.close())), activate);
                card.ondragstart = e => e.dataTransfer.setData('application/x-aster-window', w.id);
                card.oncontextmenu = e => OS.context(e, [{ label: 'Move to desktop' }, ...OS.desktops.map(d => ({ text: d.name, icon: 'desktop', disabled: d.id === w.desktop, action: () => { w.desktop = d.id; w.sync(); OS.emit('windows'); } }))]);
                windows.append(card);
            }
            if (focusId) [...windows.querySelectorAll('button[data-taskview-window]')].find(b => b.dataset.taskviewWindow === focusId)?.focus();
        }
        function renderGroups() {
            groupArea.replaceChildren();
            if (!OS.workspaces.groups.length) groupArea.append(note('Save this layout to restore these app positions later. Unsaved documents are not included.'));
            for (const group of OS.workspaces.groups) groupArea.append(OS.el('div', { class: 'saved-group' },
                OS.el('span', { class: 'grow', text: group.name + ' · ' + group.entries.length + ' windows' }),
                button('Restore ' + group.name, async () => { OS.closePanels(); await OS.workspaces.restore(group.id); }),
                icon('rename', 'Rename ' + group.name, async () => { const name = await OS.prompt('Rename window group', group.name); if (name?.trim()) { group.name = name.trim().slice(0, 60); await OS.workspaces.persist(); } }),
                icon('trash', 'Remove ' + group.name, async () => { if (await OS.confirm('Remove saved group?', 'Open windows and documents are kept.', 'Remove')) { OS.workspaces.groups = OS.workspaces.groups.filter(g => g.id !== group.id); await OS.workspaces.persist(); } })));
        }
        host.on('windows', () => { renderWindows(); renderDesktops(); }); host.on('feature-change', e => { if (e.name === 'workspaces') renderGroups(); });
        renderWindows(); renderDesktops(); renderGroups(); host.focus();
    };

    OS.showSnapAssist = (window, zone) => {
        if (!OS.settings.snapAssist || !['left', 'right'].includes(zone) || innerWidth < 700) return;
        const candidates = [...OS.windows.values()].filter(w => w !== window && w.desktop === window.desktop && !w.closed);
        if (!candidates.length) return;
        const host = surface('snapassist', 'Snap Assist', 'snap-assist'); if (!host) return;
        const opposite = zone === 'left' ? 'right' : 'left', vp = OS.viewport();
        Object.assign(host.panel.style, { left: (opposite === 'left' ? 8 : vp.w / 2 + 4) + 'px', top: '8px', width: (vp.w / 2 - 12) + 'px', maxHeight: (vp.h - 16) + 'px' });
        host.panel.append(title('Choose another window', icon('close', 'Dismiss Snap Assist', () => OS.closePanels(true))));
        const grid = OS.el('div', { class: 'snap-assist-grid' });
        for (const other of candidates) grid.append(OS.el('button', { class: 'snap-assist-choice', 'aria-label': 'Snap ' + other.title + ' ' + opposite, html: OS.appIcon(other.appId, 38) + '<span>' + OS.esc(other.title) + '</span>', onclick: () => {
            OS.closePanels(); OS.suppressSnapAssist = true;
            try { other.snap(opposite); } finally { OS.suppressSnapAssist = false; }
            OS.emit('snap-group', { windows: [window.id, other.id] });
        } }));
        host.panel.append(grid); host.focus();
    };

    let startKey = false;
    document.addEventListener('keydown', e => {
        if ($('#dialog-layer').children.length || $('.lock-screen')) return;
        const key = e.key.toLowerCase();
        if (key === 'meta') { startKey = true; return; }
        if (e.metaKey) startKey = false;
        let action;
        if (e.metaKey && !e.ctrlKey && !e.altKey) {
            action = ({ v: OS.showClipboard, a: OS.toggleQuick, n: OS.showNotifications, w: OS.showWidgets, tab: OS.showTaskView,
                e: () => OS.openApp('files'), i: () => OS.openApp('settings'), d: OS.showDesktop, l: OS.lock,
                z: () => OS.windows.get(OS.focused)?.showSnapLayouts(), arrowleft: () => OS.windows.get(OS.focused)?.snap('left'),
                arrowright: () => OS.windows.get(OS.focused)?.snap('right'), arrowup: () => OS.windows.get(OS.focused)?.snap('max'), arrowdown: () => OS.windows.get(OS.focused)?.minimize() })[key];
            if (e.shiftKey && key === 's') action = () => OS.openApp('snips');
        } else if (e.ctrlKey && e.altKey) action = ({ v: OS.showClipboard, f: () => OS.openApp('clock', { mode: 'focus' }), w: OS.showTaskView,
            u: () => OS.openApp('settings', { section: 'accessibility' }), r: () => OS.openApp('snips', { mode: 'record' }), a: OS.toggleQuick })[key];
        if (action) { e.preventDefault(); e.stopImmediatePropagation(); OS.guard(action)(); }
    }, true);
    document.addEventListener('keyup', e => { if (e.key === 'Meta' && startKey && !$('#dialog-layer').children.length && !$('.lock-screen')) { e.preventDefault(); startKey = false; OS.toggleStart(); } });
    window.addEventListener('blur', () => { startKey = false; });

    OS.ready.then(async () => {
        const saved = await OS.db.get('startPins');
        OS.startPins = [...new Set((Array.isArray(saved) ? saved : ['browser','files','settings','notepad','photos','store','paint','calculator','terminal','calendar','tasks','media','code','clock','mines','snips','taskmanager','welcome']).filter(id => OS.apps.has(id) && !OS.apps.get(id).hidden))].slice(0, 24);
        OS.toggleStartPin = async id => {
            if(!OS.apps.has(id)||OS.apps.get(id).hidden)throw Error('Only visible apps can be pinned.');
            if(!OS.startPins.includes(id)&&OS.startPins.length>=24)throw Error('Unpin an app first (24 Start pins maximum).');
            OS.startPins=OS.startPins.includes(id)?OS.startPins.filter(x=>x!==id):[...OS.startPins,id];
            await OS.featureSave('startPins',OS.startPins);
        };
        OS.moveStartPin=async (id,before)=>{
            if(id===before||!OS.startPins.includes(id)||!OS.startPins.includes(before))return false;
            const next=OS.startPins.filter(x=>x!==id);next.splice(next.indexOf(before),0,id);OS.startPins=next;
            await OS.featureSave('startPins',OS.startPins);return true;
        };
    }).catch(console.warn);
})();
