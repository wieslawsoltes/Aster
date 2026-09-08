/* Trusted, reviewed web projects hosted in ordinary Aster desktop windows. MIT. */
'use strict';
(() => {
    const OS = Aster, catalog = globalThis.AsterWebCatalog;
    if (!catalog) throw new Error('The web app catalog was not loaded.');
    const categories = new Map(catalog.categories.map(item => [item.id, item]));
    const allowedOrigin = 'https://wieslawsoltes.github.io';
    const recordingApps = new Set(['Frameforge', 'PulsegridStudio', 'SonoraStudio', 'SignalForgeStudio']);
    function checkedURL(app) {
        const url = new URL(app.url);
        if (url.origin !== allowedOrigin || url.username || url.password ||
            url.pathname !== '/' + app.repo + '/' || url.search || url.hash ||
            !/^[A-Za-z0-9_-]+$/.test(app.repo) || app.repo === 'Aster') {
            throw new Error('The catalog contains an unapproved web application URL.');
        }
        return url.href;
    }
    const link = (href, label, icon) => OS.el('a', {
        class: 'web-app-action', href, target: '_blank', rel: 'noopener noreferrer',
        title: label, 'aria-label': label,
        html: OS.icon(icon, 16) + '<span>' + OS.esc(label) + '</span>'
    });
    function mount(w, app) {
        const url = checkedURL(app);
        let alive = true, loadingTimer = 0, focusTimer = 0, frame = null, detachChild = () => {};
        w.body.classList.add('web-app-window');
        w.state.webApp = app.id; // No credentials, remote document content or transient URLs.
        const toolbar = OS.el('nav', { class: 'web-app-toolbar', 'aria-label': app.title + ' web app controls' });
        const reload = OS.el('button', { class: 'icon-button', title: 'Reload app', 'aria-label': 'Reload app', html: OS.icon('refresh', 17) });
        const address = OS.el('input', { class: 'web-app-address', value: url, readonly: true, 'aria-label': 'App address', title: url });
        const external = link(url, 'Open in browser', 'external'), source = link(app.repository, 'Source', 'code');
        toolbar.append(reload, address, external, source);
        const viewport = OS.el('div', { class: 'web-app-viewport' });
        const notice = OS.el('div', { class: 'web-app-notice', role: 'status', hidden: true });
        const noticeText = OS.el('span');
        const dismiss = OS.el('button', { class: 'icon-button', 'aria-label': 'Dismiss loading notice', html: OS.icon('close', 14) });
        dismiss.onclick = () => { notice.hidden = true; };
        notice.append(noticeText, link(url, 'Open in browser', 'external'), dismiss);
        const status = OS.el('span', { class: 'web-app-status', role: 'status', 'aria-live': 'polite' });
        const footer = OS.el('div', { class: 'web-app-footer' }, status,
            OS.el('span', { text: categories.get(app.category).title, class: 'web-app-category' }));
        w.body.append(toolbar, notice, viewport, footer);
        const inform = text => { noticeText.textContent = text; notice.hidden = false; };
        const focusWindow = () => {
            if (!alive || w.closed || w.minimized || w.desktop !== OS.activeDesktop) return;
            OS.closePanels?.();
            if (OS.focused !== w.id) w.focus(false); // Do not steal keyboard focus from the embedded editor.
        };
        function load() {
            if (!alive) return;
            clearTimeout(loadingTimer); detachChild();
            if (frame) { frame.remove(); frame.src = 'about:blank'; }
            // Scripts + same-origin are intentional for these user-owned applications:
            // they need storage, workers and WebGPU. This is NOT an isolation boundary
            // between Pages projects sharing a host. No arbitrary URLs are accepted.
            const next = OS.el('iframe', {
                class: 'web-app-frame', title: app.title + ' application',
                sandbox: 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox allow-pointer-lock',
                allow: 'autoplay; fullscreen; clipboard-read; clipboard-write' +
                    (recordingApps.has(app.repo) ? '; microphone; camera; display-capture' : '') +
                    (['Wayline', 'MeridianGISStudio'].includes(app.repo) ? '; geolocation' : ''),
                allowfullscreen: true, referrerpolicy: 'no-referrer'
            });
            frame = next; w.webFrame = next;
            status.textContent = 'Loading ' + app.title + '…';
            viewport.setAttribute('aria-busy', 'true'); notice.hidden = true;
            next.addEventListener('load', () => {
                if (!alive || frame !== next) return;
                clearTimeout(loadingTimer); viewport.setAttribute('aria-busy', 'false');
                status.textContent = 'Embedded web app'; notice.hidden = true;
                detachChild(); detachChild = () => {};
                // Readiness of the frame is not certification of every app feature.
                // Same-origin events keep taskbar focus and Alt+F4 behaving like Aster.
                try {
                    const doc = next.contentDocument;
                    if (doc && doc.URL !== 'about:blank') {
                        doc.addEventListener('pointerdown', focusWindow, true);
                        doc.addEventListener('focusin', focusWindow, true);
                        const key = event => {
                            if (event.altKey && event.key === 'F4') {
                                event.preventDefault(); event.stopPropagation(); w.close();
                            }
                        };
                        doc.addEventListener('keydown', key, true);
                        detachChild = () => {
                            doc.removeEventListener('pointerdown', focusWindow, true);
                            doc.removeEventListener('focusin', focusWindow, true);
                            doc.removeEventListener('keydown', key, true);
                        };
                        address.title = url + (doc.title ? '\n' + doc.title.slice(0, 160) : '');
                    }
                } catch { /* Cross-origin embeds still work; the browser protects their DOM. */ }
                if (!navigator.onLine) inform('Offline: this app may need its own cached files. Use Reload when connected.');
                OS.emit('web-app-load', { id: app.id, windowId: w.id, url });
            });
            next.addEventListener('error', () => {
                if (!alive || frame !== next) return;
                clearTimeout(loadingTimer); viewport.setAttribute('aria-busy', 'false');
                status.textContent = 'Embedded view unavailable';
                inform('The embedded view could not load. Retry or open this app in your browser.');
            });
            loadingTimer = setTimeout(() => {
                if (!alive || frame !== next) return;
                status.textContent = 'Still loading';
                inform('Taking longer than usual. Some apps need a separate tab for sign-in, local files or browser permissions.');
            }, 15000);
            next.src = url; viewport.replaceChildren(next);
            if (!navigator.onLine) inform('You are offline. Web apps are hosted separately from the Aster desktop.');
        }
        // Cross-origin iframes do not bubble pointer events into the parent page.
        const blurred = () => {
            clearTimeout(focusTimer);
            focusTimer = setTimeout(() => { if (document.activeElement === frame) focusWindow(); }, 0);
        };
        const offline = () => inform('You are offline. Reconnect and use Reload, or use the app’s own offline support.');
        const online = () => { if (alive) { notice.hidden = true; status.textContent = 'Connection restored · Reload if needed'; } };
        window.addEventListener('blur', blurred);
        window.addEventListener('offline', offline); window.addEventListener('online', online);
        reload.onclick = load;
        w.beforeClose = () => OS.confirm('Close ' + app.title + '?',
            'Save your work inside the app first. Aster cannot determine whether an embedded document has unsaved changes.', 'Close app');
        w.addCleanup(() => {
            alive = false; clearTimeout(loadingTimer); clearTimeout(focusTimer); detachChild();
            window.removeEventListener('blur', blurred); window.removeEventListener('offline', offline); window.removeEventListener('online', online);
            if (frame) { frame.remove(); frame.src = 'about:blank'; }
            w.webFrame = null;
        });
        load();
    }
    for (const app of catalog.apps) {
        checkedURL(app);
        const category = categories.get(app.category);
        if (!category) throw new Error('Unknown web app category: ' + app.category);
        OS.register(app.id, {
            title: app.title, description: app.description, category: category.title,
            keywords: app.repo + ' web app ' + category.title,
            icon: category.icon, color: category.color, webApp: true,
            width: 1180, height: 760, minWidth: 320, minHeight: 260,
            mount: w => mount(w, app)
        });
    }
    OS.webCatalog = catalog;
    // Start-menu folder navigation uses buttons rather than hover-only flyouts, so
    // it fits on touch screens and remains operable with Tab, arrows and Escape.
    OS.renderWebAppStart = (container, categoryId, navigate, back, focus = true) => {
        const category = categories.get(categoryId);
        container.replaceChildren(); container.scrollTop = 0;
        const header = OS.el('div', { class: 'web-start-heading' });
        const backButton = OS.el('button', { class: 'secondary web-start-back', html: OS.icon('back', 15) + 'Back', 'aria-label': category ? 'Back to web app categories' : 'Back to Start', onclick: back });
        header.append(backButton, OS.el('div', {},
            OS.el('h2', { text: category ? category.title : 'Your web apps' }),
            OS.el('p', { text: category ? 'Web apps / ' + category.title : catalog.apps.length + ' projects · September 6–8, 2026' })));
        container.append(header);
        const list = OS.el('div', { class: category ? 'web-start-list' : 'web-category-grid', role: 'group', 'aria-label': category ? category.title + ' apps' : 'Web app categories' });
        if (category) {
            const apps = catalog.apps.filter(app => app.category === category.id).sort((a, b) => a.title.localeCompare(b.title));
            for (const app of apps) {
                const button = OS.el('button', { class: 'web-start-app search-result', 'data-web-app': app.id, title: app.description,
                    html: OS.appIcon(app.id, 33) + '<span class="grow"><strong>' + OS.esc(app.title) + '</strong><small>' + OS.esc(app.description) + '</small></span>' + OS.icon('forward', 14),
                    onclick: () => OS.launch(app.id),
                    oncontextmenu: event => OS.context(event, [
                        { text: 'Open', icon: 'play', action: () => OS.launch(app.id) },
                        { text: OS.pins.includes(app.id) ? 'Unpin from taskbar' : 'Pin to taskbar', icon: 'pin', action: () => OS.togglePin(app.id) },
                        { text: 'Add desktop shortcut', icon: 'desktop', action: () => OS.addDesktopShortcut(app.id) }
                    ]) });
                list.append(button);
            }
        } else {
            for (const item of catalog.categories) {
                const apps = catalog.apps.filter(app => app.category === item.id);
                const button = OS.el('button', { class: 'web-category-item', 'data-web-category': item.id,
                    'aria-label': item.title + ', ' + apps.length + ' apps',
                    html: '<span class="web-category-icon app-icon-' + item.color + '">' + OS.icon(item.icon, 21) + '</span><span class="grow"><strong>' + OS.esc(item.title) + '</strong><small>' + apps.length + ' apps</small></span>' + OS.icon('forward', 14),
                    onclick: () => navigate(item.id) });
                list.append(button);
            }
        }
        container.append(list, OS.el('p', { class: 'web-start-note', text: 'Runs in an Aster window. Hosted apps may need an internet connection. Right-click an app to pin it or add a desktop shortcut.' }));
        list.addEventListener('keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const buttons = [...list.querySelectorAll('button')], current = buttons.indexOf(document.activeElement);
            if (current < 0) return;
            if (event.key === 'ArrowRight' && !category) { event.preventDefault(); event.stopPropagation(); buttons[current].click(); return; }
            const delta = { ArrowDown: 1, ArrowUp: -1, Home: -current, End: buttons.length - 1 - current }[event.key];
            if (delta !== undefined) {
                event.preventDefault(); event.stopPropagation();
                buttons[Math.max(0, Math.min(buttons.length - 1, current + delta))].focus();
            }
        });
        if (focus) list.querySelector('button')?.focus();
    };
})();
