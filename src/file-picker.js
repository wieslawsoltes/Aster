/* Aster profile-aware file chooser. Original artwork; MIT.
 * Presentation and navigation only. The broker supplies ALL validation and
 * mutation callbacks. This module never creates a capability or writes a file.
 */
'use strict';
(() => {
    const OS = Aster, M = AsterFilePickerModels, el = OS.el;
    const KEY = 'file-picker-ui-v1'; let active = null, prefs = M.preferences(), saveQueue = Promise.resolve();
    let loaded = false, preferenceRevision = 0;
    const persist = patch => {
        prefs = M.preferences({ ...prefs, ...patch }); preferenceRevision++;
        const snapshot = { ...prefs }; saveQueue = saveQueue.catch(() => {}).then(() => OS.db.set(KEY, snapshot));
        // Display preferences must never interrupt a pending file operation.
        saveQueue.catch(() => OS.notify('Picker preferences', 'This view could not be saved. Your files are unchanged.', 'warning'));
    };
    const iconButton = (icon, label, action) => el('button', { type: 'button', class: 'io-tool', title: label,
        'aria-label': label, html: OS.icon(icon, 17), onclick: action });
    OS.filePicker = {
        get diagnostics() { return { open: !!active, objectURLs: active?.urls.size || 0, subscriptions: active?.subscriptions || 0 }; },
        get pending() { return saveQueue; },
        show(config) {
            if (active) throw new DOMException('Another file dialog is already open.', 'InvalidStateError');
            const { kind, title, appTitle, options: o, startDirectory, validate, stat, list: readList, onConfirm, onNewFolder } = config;
            let dir = startDirectory, rows = [], shown = [], selection = new Set(), anchor = null, focusPath = null;
            let view = { ...prefs }, done = false, busy = false, navigating = false, navigationFailed = false;
            let readVersion = 0, previewVersion = 0, refreshTimer = 0, typed = '', typedAt = 0, errorMessage = '';
            let filter = config.acceptOverride || o.types[0]?.accept || [], profile = '', prefsTouched = false;
            const history = new M.History(dir), previous = document.activeElement, cleanup = [], urls = new Set();
            const cover = el('div', { class: 'dialog-backdrop io-picker-backdrop' });
            const panel = el('section', { class: 'dialog io-picker', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, 'data-kind': kind });
            const heading = el('div', { class: 'io-heading' }, el('h2', { text: kind === 'save' ? 'Save As' : kind === 'folder' ? 'Choose a Folder' : 'Open' }), el('p', { text: appTitle }));
            const header = el('header', { class: 'io-titlebar' }), headStart = el('div', { class: 'io-title-start' }), headEnd = el('div', { class: 'io-title-end' });
            const close = iconButton('close', 'Close file picker', () => cancel.click()); close.classList.add('io-close');
            const emblem = el('span', { class: 'io-title-icon', html: OS.icon(kind === 'save' ? 'save' : 'folder', 17), 'aria-hidden': 'true' });
            header.append(headStart, heading, headEnd);
            const address = el('input', { 'aria-label': 'Aster folder', value: dir, spellcheck: false, autocomplete: 'off' });
            const go = el('button', { type: 'button', class: 'io-go', text: 'Go', title: 'Go to folder' });
            const back = iconButton('back', 'Back', () => travel(-1)), forward = iconButton('forward', 'Forward', () => travel(1));
            const up = iconButton('up', 'Parent folder', () => navigate(OS.fs.parent(dir)));
            const refresh = iconButton('refresh', 'Refresh folder', () => reload());
            const location = el('div', { class: 'io-location' }, el('span', { html: OS.icon('folder', 16), 'aria-hidden': 'true' }), address, go);
            const search = el('input', { type: 'search', 'aria-label': 'Filter files', placeholder: 'Search this folder', spellcheck: false, maxlength: '200' });
            const searchBox = el('label', { class: 'io-search' }, el('span', { html: OS.icon('search', 16), 'aria-hidden': 'true' }), search);
            const navigation = el('div', { class: 'io-address' }, el('div', { class: 'io-history', role: 'group', 'aria-label': 'Folder history' }, back, forward, up), location, searchBox);
            const places = el('nav', { class: 'io-places', 'aria-label': 'Places' });
            const favoritesLabel = el('h3', { text: 'Quick access' }); places.append(favoritesLabel);
            for (const [path, icon] of [['/Desktop', 'grid'], ['/Downloads', 'download'], ['/Documents', 'file'], ['/Pictures', 'image'], ['/Music', 'music'], ['/Videos', 'video']]) {
                places.append(el('button', { type: 'button', 'data-place': path, html: OS.icon(icon, 17) + '<span>' + OS.esc(M.name(path)) + '</span>', onclick: () => navigate(path) }));
            }
            places.append(el('h3', { text: 'Locations' }), el('button', { type: 'button', 'data-place': '/', html: OS.icon('folder', 17) + '<span>Aster files</span>', onclick: () => navigate('/') }),
                el('div', { class: 'io-device-note' }, el('span', { html: OS.icon('shield', 17), 'aria-hidden': 'true' }), el('span', { text: 'On this desktop' })));
            const newFolder = el('button', { type: 'button', class: 'io-new-folder', html: OS.icon('plus', 16) + '<span>New folder</span>', onclick: createFolder });
            const listView = iconButton('list', 'List view', () => setView({ view: 'list' }));
            const gridView = iconButton('grid', 'Icon view', () => setView({ view: 'grid' }));
            const hidden = iconButton('eye', 'Show hidden files', () => setView({ hidden: !view.hidden }));
            const previewToggle = iconButton('info', 'Preview pane', () => setView({ preview: !view.preview }));
            const tools = el('div', { class: 'io-commands' }, newFolder, el('span', { class: 'io-tool-divider' }), refresh,
                el('span', { class: 'spacer' }), hidden, previewToggle, el('span', { class: 'io-tool-divider' }),
                el('div', { class: 'io-view-switch', role: 'group', 'aria-label': 'File view' }, listView, gridView));
            const sortBar = el('div', { class: 'io-columns', role: 'group', 'aria-label': 'Sort files' });
            for (const [key, label] of [['name', 'Name'], ['modified', 'Date modified'], ['type', 'Type'], ['size', 'Size']]) {
                const column = el('div', { 'data-sort': key });
                column.append(el('button', { type: 'button', title: 'Sort by ' + label, 'aria-label': 'Sort by ' + label,
                    html: '<span>' + label + '</span>' + OS.icon('up', 12), onclick: () => setView({ sort: key, ascending: view.sort === key ? !view.ascending : true }) }));
                sortBar.append(column);
            }
            const fileList = el('div', { class: 'io-file-list', role: 'listbox', 'aria-label': 'Aster files', tabindex: '0', 'aria-multiselectable': String(o.multiple && kind === 'open') });
            const empty = el('div', { class: 'io-empty', hidden: true }, el('span', { html: OS.icon('folder', 44), 'aria-hidden': 'true' }), el('strong'), el('p'));
            const content = el('div', { class: 'io-files' }, sortBar, el('div', { class: 'io-list-area' }, fileList, empty));
            const preview = el('aside', { class: 'io-preview', 'aria-label': 'File preview', hidden: true });
            const listing = el('div', { class: 'io-listing' }, content, preview);
            const crumbs = el('nav', { class: 'io-breadcrumbs', 'aria-label': 'Folder breadcrumb' });
            const body = el('div', { class: 'io-layout' }, places, el('div', { class: 'io-browser' }, tools, listing, crumbs));
            const filename = el('input', { 'aria-label': 'File name', value: kind === 'save' ? o.suggestedName : '', spellcheck: false, autocomplete: 'off', maxlength: '255' });
            const nameRow = el('label', { class: 'io-name' }, el('span', { text: 'File name:' }), filename);
            const types = el('select', { 'aria-label': 'File types' });
            if (!o.excludeAcceptAllOption) types.append(el('option', { value: 'all', text: 'All files' }));
            o.types.forEach((t, i) => types.append(el('option', { value: String(i), text: t.description + ' (' + t.accept.filter(v => v.startsWith('.')).map(v => '*' + v).join(', ') + ')' })));
            types.value = o.types.length ? '0' : 'all';
            const typeRow = el('label', { class: 'io-type' }, el('span', { text: 'File type:' }), types);
            typeRow.hidden = kind === 'folder' || config.acceptOverride !== null;
            const options = el('div', { class: 'io-options' });
            const nameTop = el('div', { class: 'io-name-top' });
            const status = el('p', { class: 'io-picker-status', role: 'status', 'aria-live': 'polite' });
            const count = el('span', { class: 'io-count', 'aria-live': 'polite' });
            const stateBar = el('div', { class: 'io-statebar' }, status, count);
            const scopeText = kind === 'folder'
                ? (o.mode === 'readwrite' ? 'Read and edit the selected folder and its contents.' : 'Read the selected folder and its contents.')
                : 'Only your confirmed selection is shared.';
            const scope = el('div', { class: 'io-scope', id: 'io-scope-' + OS.uid() }, el('span', { html: OS.icon('shield', 14), 'aria-hidden': 'true' }), el('span', { text: scopeText }));
            panel.setAttribute('aria-describedby', scope.id);
            const actions = el('div', { class: 'dialog-actions io-actions' });
            const cancel = el('button', { type: 'button', class: 'secondary', text: 'Cancel', onclick: () => finish(null, new DOMException('Selection cancelled or access revoked.', 'AbortError')) });
            const confirm = el('button', { type: 'button', class: 'primary', text: kind === 'save' ? 'Save' : kind === 'folder' ? 'Select folder' : 'Open', onclick: submit });
            const footer = el('footer', { class: 'io-footer' }, options, el('div', { class: 'io-bottom' }, scope, actions));
            panel.append(header, nameTop, navigation, body, stateBar, footer); cover.append(panel);
            let resolve, reject;
            const promise = new Promise((r, j) => { resolve = r; reject = j; });
            const session = active = { urls, subscriptions: 0, cancel: () => cancel.click() };
            // Keep the desktop inaccessible to keyboard/screen-reader navigation
            // while the host chooser is modal. Restore each pre-existing state.
            for (const node of document.querySelectorAll('#desktop,#window-layer,#taskbar,#panel-layer,#theme-topbar')) {
                const was = node.inert; node.inert = true; cleanup.push(() => { if (node.isConnected) node.inert = was; });
            }
            OS.$('#dialog-layer').append(cover); OS.emit('window-action', { action: 'SystemQuestion' });
            function subscribe(event, fn) { const off = OS.on(event, fn); session.subscriptions++; cleanup.push(off); }
            function finish(value, error) {
                if (done) return; done = true; ++readVersion; ++previewVersion; clearTimeout(refreshTimer);
                cleanup.splice(0).forEach(fn => fn()); clearURLs(); cover.remove(); active = null;
                config.onClose?.();
                if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
                // Removing inert must reach the compositor before the app receives
                // its promise, or its next real click may hit the old modal layer.
                let settled = false;
                const settle = () => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
                const timer = setTimeout(settle, 120);
                requestAnimationFrame(() => requestAnimationFrame(settle));
            }
            function clearURLs() { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }
            const publicPath = path => path === '/' ? path : validate(path);
            const fileAllowed = row => row.kind === 'directory' || (kind !== 'folder' && AsterIOModels.accepts(M.name(row.path), row.mime || '', filter));
            const visibleButtons = () => [...panel.querySelectorAll('button,input,select,[tabindex]')].filter(n => !n.disabled && n.tabIndex >= 0 && n.getClientRects().length && !n.closest('[hidden],[inert]'));
            const topmost = () => OS.$('#dialog-layer').lastElementChild === cover;
            function setStatus(message = '', error = false) {
                errorMessage = error ? String(message) : ''; status.textContent = error ? String(message) : dir;
                status.classList.toggle('error', error); status.title = String(message || dir);
            }
            function enabled() {
                const first = shown.find(r => selection.has(r.path));
                const hasName = filename.value.trim().length > 0;
                let validFolder = true;
                try { if (kind === 'folder') validate(first?.kind === 'directory' ? first.path : dir); } catch { validFolder = false; }
                confirm.disabled = busy || navigating || navigationFailed || (kind === 'folder' ? !validFolder : kind === 'save' ? !hasName : !first && !hasName);
                scope.lastElementChild.textContent = kind === 'folder' && !validFolder ? 'Choose one user folder; the filesystem root cannot be shared.' : scopeText;
                newFolder.disabled = busy || navigating || navigationFailed || dir === '/' || !onNewFolder || (config.canCreate && !config.canCreate());
                back.disabled = busy || !history.back; forward.disabled = busy || !history.forward; up.disabled = busy || dir === '/';
                panel.setAttribute('aria-busy', String(busy || navigating));
            }
            function theme() {
                if (done) return;
                const current = document.activeElement, hadFocus = panel.contains(current), start = current === filename ? filename.selectionStart : null, end = current === filename ? filename.selectionEnd : null;
                const next = OS.themes?.chrome?.profile || document.body.dataset.profile || 'windows';
                if (next !== profile) {
                    profile = next; panel.dataset.pickerProfile = profile;
                    headStart.replaceChildren(); headEnd.replaceChildren(); actions.replaceChildren(); nameTop.replaceChildren(); options.replaceChildren();
                    nameRow.hidden = kind === 'folder'; nameTop.hidden = kind !== 'save' || profile === 'windows';
                    if (profile === 'ubuntu') { headStart.append(cancel); headEnd.append(confirm); }
                    else if (profile === 'macos26') actions.append(cancel, confirm);
                    else { headStart.append(emblem); headEnd.append(close); actions.append(confirm, cancel); }
                    if (kind === 'save' && profile !== 'windows') nameTop.append(nameRow);
                    else options.append(nameRow);
                    options.append(typeRow); favoritesLabel.textContent = profile === 'windows' ? 'Quick access' : profile === 'macos26' ? 'Favorites' : 'Places';
                    nameRow.firstElementChild.textContent = kind === 'save' && profile === 'macos26' ? 'Save As:' : 'File name:';
                }
                panel.style.colorScheme = profile === 'ubuntu' ? document.body.dataset.theme || 'light' : document.body.dataset.shellMode || document.body.dataset.theme || 'light';
                // Only refresh vector contents; preserve row identity and focus.
                for (const button of fileList.querySelectorAll('[data-io-path]')) {
                    const row = shown.find(r => r.path === button.dataset.ioPath);
                    if (row) button.querySelector('.io-file-symbol').innerHTML = OS.fileIcon(row, view.view === 'grid' ? 42 : 21);
                }
                if (current?.isConnected && panel.contains(current)) { current.focus({ preventScroll: true }); if (start !== null) filename.setSelectionRange(start, end); }
                else if (hadFocus) cancel.focus({ preventScroll: true });
            }
            function setView(patch) {
                if (done) return;
                view = M.preferences({ ...view, ...patch }); prefsTouched = true; persist(patch); render();
            }
            function select(path, event = {}, focus = true) {
                const next = M.select(shown, selection, path, anchor, { multiple: o.multiple && kind === 'open', toggle: event.ctrlKey || event.metaKey, range: event.shiftKey });
                if (next.size > 256) { setStatus('Select no more than 256 files.', true); return; }
                selection = next; if (!event.shiftKey) anchor = path; focusPath = path;
                const r = shown.find(row => row.path === path);
                if (kind !== 'folder') filename.value = selection.size === 1 && r?.kind === 'file' ? M.name(path) : '';
                updateSelection(focus); if (!navigationFailed) setStatus();
            }
            function updateSelection(focus = false) {
                for (const button of fileList.querySelectorAll('[data-io-path]')) {
                    const selected = selection.has(button.dataset.ioPath); button.classList.toggle('selected', selected);
                    button.setAttribute('aria-selected', String(selected)); button.tabIndex = button.dataset.ioPath === focusPath ? 0 : -1;
                    if (focus && button.dataset.ioPath === focusPath) button.focus({ preventScroll: false });
                }
                fileList.tabIndex = shown.length ? -1 : 0;
                count.textContent = selection.size ? selection.size + ' selected' : shown.length + (shown.length === 1 ? ' item' : ' items');
                enabled(); updatePreview();
            }
            function render() {
                if (done) return;
                const focused = panel.contains(document.activeElement) && document.activeElement?.closest('.io-file');
                shown = M.ordered(rows.filter(fileAllowed), view, search.value);
                const available = new Set(shown.map(r => r.path)); selection = new Set([...selection].filter(p => available.has(p)));
                if (!available.has(focusPath)) focusPath = shown[0]?.path || null;
                panel.dataset.view = view.view; panel.classList.toggle('io-with-preview', view.preview);
                preview.hidden = !view.preview;
                for (const [button, pressed] of [[listView, view.view === 'list'], [gridView, view.view === 'grid'], [hidden, view.hidden], [previewToggle, view.preview]]) button.setAttribute('aria-pressed', String(pressed));
                for (const column of sortBar.children) {
                    const direction = column.dataset.sort === view.sort ? view.ascending ? 'ascending' : 'descending' : 'none';
                    column.dataset.sortDirection = direction; column.firstElementChild.setAttribute('aria-pressed', String(direction !== 'none'));
                    column.firstElementChild.setAttribute('aria-description', direction === 'none' ? 'Not sorted by this column' : 'Sorted ' + direction);
                }
                const fragment = document.createDocumentFragment();
                for (const row of shown) {
                    const name = M.name(row.path), date = row.modified ? new Date(row.modified).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
                    const button = el('button', { type: 'button', class: 'io-file', role: 'option', 'data-io-path': row.path, 'aria-label': name, title: name, tabindex: '-1' },
                        el('span', { class: 'io-file-name' }, el('span', { class: 'io-file-symbol', html: OS.fileIcon(row, view.view === 'grid' ? 42 : 21), 'aria-hidden': 'true' }), el('span', { text: name })),
                        el('span', { class: 'io-file-date', text: date }), el('span', { class: 'io-file-type', text: M.type(row) }),
                        el('span', { class: 'io-file-size', text: row.kind === 'directory' ? '—' : OS.formatBytes(row.size || 0) }));
                    button.onclick = event => select(row.path, event);
                    button.ondblclick = event => { event.preventDefault(); row.kind === 'directory' ? navigate(row.path) : submit(); };
                    fragment.append(button);
                }
                fileList.replaceChildren(fragment); empty.hidden = shown.length !== 0;
                empty.querySelector('strong').textContent = search.value ? 'No matching files' : kind === 'folder' ? 'No folders here' : 'This folder is empty';
                empty.querySelector('p').textContent = search.value ? 'Try a different name or clear your search.' : kind === 'folder' ? 'Choose this folder, or create a new one.' : 'Choose another location or create a new folder.';
                crumbs.replaceChildren(...M.breadcrumbs(dir).map((part, i, all) => el('button', { type: 'button', text: part.name, 'aria-label': part.name, 'aria-current': i === all.length - 1 ? 'location' : null, onclick: () => navigate(part.path) })));
                for (const place of places.querySelectorAll('[data-place]')) place.setAttribute('aria-current', String(place.dataset.place === dir));
                updateSelection(!!focused); if (!errorMessage) setStatus();
            }
            async function updatePreview() {
                const generation = ++previewVersion; clearURLs(); preview.replaceChildren();
                if (!view.preview || done) return;
                const row = shown.find(r => selection.has(r.path));
                if (!row || selection.size !== 1) { preview.append(el('span', { class: 'io-preview-symbol', html: OS.icon('file', 44) }), el('p', { text: selection.size > 1 ? selection.size + ' items selected' : 'Select a file to preview' })); return; }
                preview.append(el('span', { class: 'io-preview-symbol', html: OS.fileIcon(row, 54) }), el('strong', { text: M.name(row.path) }));
                const dl = el('dl');
                for (const [key, value] of [['Kind', M.type(row)], ['Size', row.kind === 'file' ? OS.formatBytes(row.size || 0) : 'Folder'], ['Modified', row.modified ? new Date(row.modified).toLocaleString() : '—']]) dl.append(el('dt', { text: key }), el('dd', { text: value }));
                preview.append(dl);
                if (row.kind !== 'file' || row.size > 8 * 1024 * 1024) return;
                const isCurrent = () => !done && view.preview && generation === previewVersion && selection.has(row.path);
                try {
                    validate(row.path); const actual = await OS.fs.read(row.path); if (!isCurrent() || !actual || actual.kind !== 'file' || actual.size > 8 * 1024 * 1024) return;
                    const blob = await OS.fs.blob(actual); if (!isCurrent() || blob.size > 8 * 1024 * 1024) return;
                    const mime = actual.mime || blob.type || '', name = M.name(row.path);
                    if (/\.(?:png|jpe?g|webp|gif|bmp|avif)$/i.test(name) && /^image\/(?:png|jpeg|webp|gif|bmp|avif)$/i.test(mime)) {
                        const url = URL.createObjectURL(blob); urls.add(url);
                        const image = el('img', { src: url, alt: 'Preview of ' + name }); image.onerror = () => { if (isCurrent()) image.replaceWith(el('p', { text: 'Image preview unavailable.' })); URL.revokeObjectURL(url); urls.delete(url); }; preview.append(image);
                    } else if (/^text\//.test(mime) || /\.(?:txt|md|json|csv|html?|svg|xml|css|[cm]?js|log|ini|yaml|yml)$/i.test(name)) {
                        const text = await blob.slice(0, 16384).text(); if (!isCurrent()) return;
                        preview.append(el('pre', { text })); if (blob.size > 16384) preview.append(el('p', { text: 'Preview: first 16 KiB' }));
                    }
                } catch { if (isCurrent()) preview.append(el('p', { text: 'Preview unavailable. The file may have changed.' })); }
            }
            async function navigate(path, historyIndex = null, retain = false) {
                if (done || busy) return;
                const generation = ++readVersion, originalInput = address.value; navigating = true; navigationFailed = false; enabled();
                try {
                    if (typeof path !== 'string') throw new TypeError('Invalid folder path.');
                    publicPath(path);
                    const folder = await stat(path); if (done || generation !== readVersion) return;
                    if (!folder || folder.kind !== 'directory') throw new DOMException('Folder does not exist or is no longer a directory.', folder ? 'TypeMismatchError' : 'NotFoundError');
                    const items = await readList(path); if (done || generation !== readVersion) return;
                    dir = path; rows = items.filter(row => { try { validate(row.path); return true; } catch { return false; } });
                    history.commit(path, historyIndex); navigating = false; navigationFailed = false;
                    if (address.value === originalInput) address.value = dir;
                    if (!retain) { selection.clear(); focusPath = null; anchor = null; search.value = ''; if (kind !== 'save') filename.value = ''; }
                    setStatus(); render();
                } catch (error) {
                    if (done || generation !== readVersion) return;
                    navigating = false; navigationFailed = true; setStatus(error.message || error, true); enabled();
                }
            }
            function reload() { return navigate(dir, history.index, true); }
            function travel(step) { const index = history.index + step, path = history.target(step); if (path !== undefined) navigate(path, index); }
            async function submit() {
                if (done || busy || navigating || navigationFailed) return;
                busy = true; enabled();
                try {
                    const selected = shown.filter(r => selection.has(r.path)); let folder = dir, paths = selected.filter(r => r.kind === 'file').map(r => r.path), name = filename.value;
                    if (kind === 'folder') { if (selected[0]?.kind === 'directory') folder = selected[0].path; }
                    else if (selected.length === 1 && selected[0].kind === 'directory' && !name.trim()) { busy = false; await navigate(selected[0].path); return; }
                    else if (kind === 'open' && name.trim() && selected.length <= 1) {
                        const path = validate(OS.fs.join(dir, AsterIOModels.name(name)));
                        const live = await stat(path); if (done) return;
                        if (live?.kind === 'directory') { busy = false; await navigate(path); return; }
                        paths = [path];
                    }
                    const value = await onConfirm({ dir: folder, paths, name, filter, allTypes: types.value === 'all' && config.acceptOverride == null });
                    if (done) return;
                    if (value !== null && value !== undefined) { finish(value); return; }
                    busy = false; enabled();
                } catch (error) { if (!done) { busy = false; setStatus(error.message || error, true); enabled(); } }
            }
            async function createFolder() {
                if (done || newFolder.disabled) return;
                busy = true; enabled();
                try { const path = await onNewFolder(dir); if (done) return; busy = false; if (path) await navigate(path); else enabled(); }
                catch (error) { if (!done) { busy = false; setStatus(error.message || error, true); enabled(); } }
            }
            function listKey(event) {
                const index = shown.findIndex(r => r.path === focusPath), key = event.key, toggle = event.ctrlKey || event.metaKey;
                let columns = 1; if (view.view === 'grid' && fileList.children.length) columns = Math.max(1, Math.round(fileList.clientWidth / (fileList.firstElementChild.getBoundingClientRect().width + 9)));
                let target = null;
                if (key === 'ArrowDown') target = Math.min(shown.length - 1, index + columns);
                if (key === 'ArrowUp') target = Math.max(0, index - columns);
                if (key === 'ArrowRight' && view.view === 'grid') target = Math.min(shown.length - 1, index + 1);
                if (key === 'ArrowLeft' && view.view === 'grid') target = Math.max(0, index - 1);
                if (key === 'Home') target = 0; if (key === 'End') target = shown.length - 1;
                if (target !== null && shown[target]) {
                    event.preventDefault(); if (toggle && !event.shiftKey) { focusPath = shown[target].path; updateSelection(true); } else select(shown[target].path, event); return;
                }
                if (toggle && key.toLowerCase() === 'a' && o.multiple && kind === 'open') { event.preventDefault(); const files = shown.filter(r => r.kind === 'file'); if (files.length > 256) { setStatus('Select no more than 256 files.', true); return; } selection = new Set(files.map(r => r.path)); filename.value = ''; updateSelection(); return; }
                if (key === ' ') { event.preventDefault(); if (focusPath) select(focusPath, { ctrlKey: toggle }); return; }
                if (key === 'Enter') { event.preventDefault(); const row = shown[index]; if (row?.kind === 'directory') navigate(row.path); else submit(); return; }
                if (key.length === 1 && !toggle && !event.altKey) {
                    typed = Date.now() - typedAt < 900 ? typed + key : key; typedAt = Date.now();
                    const ordered = [...shown.slice(index + 1), ...shown.slice(0, index + 1)], match = ordered.find(r => M.name(r.path).toLocaleLowerCase().startsWith(typed.toLocaleLowerCase()));
                    if (match) { event.preventDefault(); select(match.path); }
                }
            }
            cover.addEventListener('keydown', event => {
                if (!topmost()) return;
                event.stopPropagation(); const key = event.key, command = event.ctrlKey || event.metaKey;
                if (key === 'Escape') { event.preventDefault(); cancel.click(); return; }
                if (key === 'Tab') {
                    const nodes = visibleButtons(), i = nodes.indexOf(document.activeElement);
                    if (!nodes.length) return;
                    if (event.shiftKey && i <= 0 || !event.shiftKey && (i === nodes.length - 1 || i < 0)) { event.preventDefault(); nodes[event.shiftKey ? nodes.length - 1 : 0].focus(); } return;
                }
                if (command && key.toLowerCase() === 'l' || event.altKey && key.toLowerCase() === 'd') { event.preventDefault(); address.focus(); address.select(); return; }
                if (command && key.toLowerCase() === 'f') { event.preventDefault(); search.focus(); search.select(); return; }
                if (command && event.shiftKey && key.toLowerCase() === 'n') { event.preventDefault(); createFolder(); return; }
                if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(key)) { event.preventDefault(); key === 'ArrowUp' ? navigate(OS.fs.parent(dir)) : travel(key === 'ArrowLeft' ? -1 : 1); return; }
                if (key === 'F5') { event.preventDefault(); reload(); return; }
                if (fileList.contains(event.target)) listKey(event);
                else if (key === 'Enter' && event.target === address) { event.preventDefault(); navigate(address.value); }
                else if (key === 'Enter' && event.target === filename) { event.preventDefault(); selection.clear(); submit(); }
                else if (key === 'Enter' && event.target === search) { event.preventDefault(); if (shown[0]) select(shown[0].path); }
            });
            go.onclick = () => navigate(address.value);
            search.oninput = () => { selection.clear(); if (kind !== 'save') filename.value = ''; render(); };
            filename.oninput = () => { selection.clear(); updateSelection(); };
            types.onchange = () => { filter = types.value === 'all' ? [] : o.types[+types.value]?.accept || []; selection.clear(); render(); };
            subscribe('theme-change', theme);
            subscribe('fs-change', () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (!done && !busy && !navigating && !navigationFailed) reload(); }, 90); });
            theme(); render(); navigate(dir);
            const focusInitial = () => { if (!done && topmost()) { (kind === 'save' ? filename : address).focus(); if (kind === 'save') filename.select(); } };
            queueMicrotask(focusInitial);
            if (!loaded) {
                const revision = preferenceRevision;
                OS.db.get(KEY).then(value => { loaded = true; if (revision !== preferenceRevision) return; prefs = M.preferences(value); if (done || prefsTouched) return; view = { ...prefs }; render(); }).catch(() => {});
            }
            return { promise, cancel: session.cancel };
        }
    };
})();
