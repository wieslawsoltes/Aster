'use strict';
(() => {
    const OS = Aster, $ = OS.$;
    let zCounter = 10, sessionTimer = 0, snapTimer = 0;
    OS.focused = null;
    OS.cancelSessionSave = () => clearTimeout(sessionTimer);
    OS.persistSessionNow = () => OS.db.set('session', Array.from(OS.windows.values()).filter(w => !w.closed).map(w => ({ app: w.appId, rect: w.rect, restoreRect: w.restoreRect, maximized: w.maximized, minimized: w.minimized, desktop: w.desktop, state: w.state })));
    OS.saveSession = () => {
        clearTimeout(sessionTimer);
        sessionTimer = setTimeout(() => {
            const data = Array.from(OS.windows.values()).filter(w => !w.closed).map(w => ({ app: w.appId, rect: w.rect, restoreRect: w.restoreRect, maximized: w.maximized, minimized: w.minimized, desktop: w.desktop, state: w.state }));
            OS.db.set('session', data).catch(e => console.warn('Session persistence:', e));
        }, 300);
    };
    OS.viewport = () => OS.themes?.ready ? OS.themes.workArea() : ({ x: 0, y: 0, w: innerWidth, h: innerHeight - ($('#taskbar')?.getBoundingClientRect().height || 48) });
    OS.context = (event, items) => {
        event?.preventDefault();
        event?.stopPropagation();
        const trigger = event?.target?.closest('button,[tabindex]') || document.activeElement;
        if (!event?.target?.closest('.start-menu,.integrated-task-view')) OS.closePanels?.();
        const menu = $('#context-menu');
        menu.replaceChildren();
        for (const item of items) {
            if (!item) {
                menu.append(OS.el('div', { class: 'separator', role: 'separator' }));
                continue;
            }
            if (item.label) {
                menu.append(OS.el('div', { class: 'menu-label', text: item.label }));
                continue;
            }
            const b = OS.el('button', { class: 'menu-item' + (item.danger ? ' danger' : ''), role: 'menuitem', disabled: item.disabled, html: (item.icon ? OS.icon(item.icon) : '<span style="width:16px"></span>') + `<span>${OS.esc(item.text)}</span>` + (item.key ? `<kbd>${OS.esc(item.key)}</kbd>` : '') });
            b.onclick = OS.guard(async () => { menu.hidden = true; if (trigger?.isConnected) trigger.focus({preventScroll:true}); OS.emit('window-action', {action: 'MenuCommand'}); await item.action?.(); });
            menu.append(b);
        }
        menu.hidden = false;
        const r = menu.getBoundingClientRect();
        const anchorRect=trigger?.getBoundingClientRect?.();
        const x = event?.clientX || anchorRect?.left || innerWidth / 2, y = event?.clientY || anchorRect?.bottom || innerHeight / 2;
        menu.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 8)) + 'px';
        menu.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 8)) + 'px';
        const first = menu.querySelector('button:not(:disabled)');
        first?.focus();
        menu.onkeydown = e => { const b = Array.from(menu.querySelectorAll('button:not(:disabled)')); const i = b.indexOf(document.activeElement); if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation(); menu.hidden = true; if(trigger?.isConnected)trigger.focus({preventScroll:true});
        } if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            b[(i + (e.key === 'ArrowDown' ? 1 : b.length - 1)) % b.length]?.focus();
        } };
    };
    document.addEventListener('pointerdown', e => { if (!e.target.closest('#context-menu'))
        $('#context-menu').hidden = true; });
    OS.dialog = ({ title, message = '', value = null, placeholder = '', confirm = 'OK', cancel = 'Cancel', danger = false, extra = null }) => new Promise(resolve => {
        const previous = document.activeElement;
        const cover = OS.el('div', { class: 'dialog-backdrop' }), dialog = OS.el('section', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
        const content = OS.el('div', { class: 'dialog-content' }, OS.el('h2', { text: title }), OS.el('p', { text: message }));
        let input;
        if (value !== null) {
            input = OS.el('input', { value, placeholder, 'aria-label': title });
            content.append(input);
        }
        if (extra)
            content.append(extra);
        const actions = OS.el('div', { class: 'dialog-actions' });
        const no = OS.el('button', { class: 'secondary', text: cancel }), yes = OS.el('button', { class: danger ? 'primary danger' : 'primary', text: confirm });
        let done = false;
        const finish = result => { if (done)
            return; done = true; cover.remove(); if (previous?.isConnected)
            previous.focus(); resolve(result); };
        no.onclick = () => finish(null);
        yes.onclick = () => finish(input ? input.value : true);
        actions.append(no, yes);
        dialog.append(content, actions);
        cover.append(dialog);
        $('#dialog-layer').append(cover); OS.emit('window-action', {action: 'SystemQuestion'});
        cover.onkeydown = e => { if (e.key === 'Escape') {
            e.stopPropagation();
            finish(null);
        } if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            yes.click();
        } if (e.key === 'Tab') {
            const elements = Array.from(cover.querySelectorAll('button,input,select,textarea,[tabindex="0"]')).filter(x => !x.disabled);
            let index = elements.indexOf(document.activeElement);
            e.preventDefault();
            elements[(index + (e.shiftKey ? elements.length - 1 : 1)) % elements.length]?.focus();
        } };
        setTimeout(() => { (input || yes).focus(); input?.select(); }, 20);
    });
    OS.confirm = (title, message, confirm = 'Continue', danger = false) => OS.dialog({ title, message, confirm, danger });
    OS.prompt = (title, value = '', message = '') => OS.dialog({ title, value, message, confirm: 'Save' });
    OS.notify = (title, message = '', kind = 'info', action = null, options = {}) => {
        const n = { id: OS.uid(), title, message, kind, time: Date.now(), priority: options.priority === 'high' ? 'high' : 'normal' };
        OS.notifications.unshift(n);
        OS.notifications = OS.notifications.slice(0, 80);
        OS.db.set('notifications', OS.notifications);
        OS.emit('notification', n);
        if ((OS.quiet?.active() || OS.settings.dnd) && n.priority !== 'high')
            return n;
        const toast = OS.el('article', { class: 'toast flyout' });
        toast.innerHTML = `<div class="toast-header">${OS.icon(kind === 'warning' ? 'shield' : 'spark', 15)}<span>Aster Desktop</span><button aria-label="Dismiss notification">${OS.icon('close', 13)}</button></div><strong>${OS.esc(title)}</strong><p>${OS.esc(message)}</p>`;
        toast.querySelector('button').onclick = () => toast.remove();
        if (action) {
            const b = OS.el('button', { class: 'toast-action', text: action.label });
            b.onclick = OS.guard(async () => { toast.remove(); await action.fn(); });
            toast.append(b);
        }
        $('#toast-layer').append(toast);
        setTimeout(() => toast.remove(), 6500);
        return n;
    };
    class DesktopWindow {
        constructor(app, options = {}) {
            const vp = OS.viewport(), index = OS.windows.size;
            this.id = OS.uid();
            this.appId = app.id;
            this.app = app;
            this.title = app.title;
            this.state = { ...(options.state || {}), ...options };
            delete this.state.rect;
            delete this.state.state;
            this.desktop = options.desktop || OS.activeDesktop;
            this.minimized = false;
            this.maximized = false;
            this.closed = false;
            this.z = ++zCounter;
            this.cleanups = [];
            const width = Math.min(app.width || 850, vp.w - 30), height = Math.min(app.height || 590, vp.h - 36);
            this.rect = options.rect ? { ...options.rect } : { x: Math.max(10, Math.round((vp.w - width) / 2) + (index % 5) * 22 - 20), y: Math.max(12, Math.round((vp.h - height) / 2) + (index % 5) * 20 - 12), w: width, h: height };
            this.constrain();
            this.el = OS.el('section', { class: 'window', 'data-window': this.id, 'data-app': app.id, role: 'region', 'aria-label': app.title, tabindex: '-1' });
            this.bar = OS.el('header', { class: 'titlebar' });
            this.titleEl = OS.el('div', { class: 'window-title', html: OS.appIcon(app.id, 17) + `<span>${OS.esc(this.title)}</span>` });
            const controls = OS.el('div', { class: 'window-controls' });
            const min = OS.el('button', { title: 'Minimize', 'aria-label': 'Minimize', html: OS.icon('min') }), max = OS.el('button', { title: 'Maximize', 'aria-label': 'Maximize', html: OS.icon('max') }), close = OS.el('button', { title: 'Close', 'aria-label': 'Close', html: OS.icon('close') });
            min.onclick = () => this.minimize();
            max.onclick = () => this.toggleMaximize();
            close.onclick = () => this.close();
            this.maxButton = max;
            controls.append(min, max, close);
            this.bar.append(this.titleEl, controls);
            this.body = OS.el('div', { class: 'window-body' });
            this.el.append(this.bar, this.body);
            for (const direction of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
                const h = OS.el('div', { class: 'resize-handle ' + direction, 'aria-hidden': 'true' });
                h.onpointerdown = e => this.beginResize(e, direction);
                this.el.append(h);
            }
            this.el.addEventListener('pointerdown', () => this.focus(), { capture: true });
            this.el.addEventListener('focusin', () => { if (OS.focused !== this.id)
                this.focus(false); });
            this.bar.addEventListener('pointerdown', e => { if (!e.target.closest('button'))
                this.beginDrag(e); });
            this.bar.addEventListener('dblclick', e => { if (!e.target.closest('button'))
                this.toggleMaximize(); });
            this.bar.addEventListener('contextmenu', e => this.titleMenu(e));
            max.addEventListener('mouseenter', () => { clearTimeout(snapTimer); snapTimer = setTimeout(() => this.showSnapLayouts(), 400); });
            max.addEventListener('mouseleave', () => clearTimeout(snapTimer));
            this.el.addEventListener('keydown', e => { if (e.altKey && e.key === 'F4') {
                e.preventDefault();
                this.close();
            }
            else
                this.onKey?.(e); });
            OS.windows.set(this.id, this);
            $('#window-layer').append(this.el);
            this.sync();
            this.focus();
            if (options.maximized) {
                this.restoreRect = options.restoreRect || { ...this.rect };
                this.maximized = true;
                this.rect = { x: 0, y: 0, w: vp.w, h: vp.h };
                this.sync();
            }
            this.ready = Promise.resolve().then(() => app.mount(this, options)).then(() => { if (options.minimized)
                this.minimize(); OS.emit('window-ready', this); OS.emit('window-action', {action: 'Open'}); return this; }).catch(e => { console.error(e); this.body.replaceChildren(OS.el('div', { class: 'app-error' }, OS.el('h2', { text: 'This app could not open' }), OS.el('p', { text: e.message }), OS.el('button', { class: 'secondary', text: 'Close', onclick: () => this.close() }))); return this; });
            OS.emit('windows');
            OS.saveSession();
        }
        addCleanup(fn) { if (this.closed) {
            try {
                fn();
            }
            catch (error) {
                console.warn(error);
            }
        }
        else
            this.cleanups.push(fn); return fn; }
        on(event, fn) { this.addCleanup(OS.on(event, fn)); }
        setTitle(title) { this.title = title; this.titleEl.lastElementChild.textContent = title; this.el.setAttribute('aria-label', title); OS.emit('windows'); }
        constrain() { const v = OS.viewport(); this.rect.w = Math.min(Math.max(280, this.rect.w), v.w - 8); this.rect.h = Math.min(Math.max(180, this.rect.h), v.h - 8); this.rect.x = Math.max(0, Math.min(this.rect.x, v.w - this.rect.w)); this.rect.y = Math.max(0, Math.min(this.rect.y, v.h - this.rect.h)); }
        sync() {
            const r = this.rect;
            this.el.style.transform = `translate3d(${Math.round(r.x)}px,${Math.round(r.y)}px,0)`;
            this.el.style.width = Math.round(r.w) + 'px';
            this.el.style.height = Math.round(r.h) + 'px';
            this.el.style.zIndex = this.z;
            this.el.classList.toggle('minimized', this.minimized);
            this.el.classList.toggle('maximized', this.maximized);
            this.el.classList.toggle('other-desktop', this.desktop !== OS.activeDesktop);
            this.el.classList.toggle('inactive', OS.focused !== this.id);
            this.maxButton.innerHTML = OS.icon(this.maximized ? 'restore' : 'max');
            this.maxButton.setAttribute('aria-label', this.maximized ? 'Restore' : 'Maximize');
            this.maxButton.title = this.maximized ? 'Restore' : 'Maximize';
            this.gpuDirty = true;
            if (OS.renderer?.mode === 'WebGPU')
                OS.renderer.invalidate();
            OS.saveSession();
        }
        focus(dom = true) {
            if (this.closed)
                return;
            if (this.desktop !== OS.activeDesktop)
                OS.switchDesktop(this.desktop);
            if (this.minimized)
                this.minimized = false;
            OS.focused = this.id;
            this.z = ++zCounter;
            if (zCounter > 9000) {
                Array.from(OS.windows.values()).sort((a, b) => a.z - b.z).forEach((w, i) => { w.z = i + 10; w.el.style.zIndex = w.z; });
                zCounter = OS.windows.size + 11;
            }
            for (const w of OS.windows.values()) {
                w.el.classList.toggle('inactive', w.id !== this.id);
                w.gpuDirty = true;
            }
            this.sync();
            if (dom && !this.el.contains(document.activeElement))
                this.el.focus({ preventScroll: true });
            OS.emit('windows');
        }
        minimize() { OS.emit('window-action', {action: 'Minimize'}); this.minimized = true; this.sync(); if (OS.focused === this.id) {
            OS.focused = null;
            const next = Array.from(OS.windows.values()).filter(w => !w.minimized && w.desktop === OS.activeDesktop && w.id !== this.id).sort((a, b) => b.z - a.z)[0];
            next?.focus();
        } OS.emit('windows'); }
        restore() { this.minimized = false; this.focus(); }
        toggleMaximize() { OS.emit('window-action', {action: this.maximized ? 'RestoreDown' : 'Maximize'}); if (this.maximized) {
            this.rect = { ...this.restoreRect };
            this.maximized = false;
            this.constrain();
        }
        else {
            this.restoreRect = { ...this.rect };
            const v = OS.viewport();
            this.rect = { x: 0, y: 0, w: v.w, h: v.h };
            this.maximized = true;
        } this.sync(); this.focus(); }
        snap(zone) {
            const v = OS.viewport(), gap = 8, half = (v.w - gap * 3) / 2, hh = (v.h - gap * 3) / 2;
            this.maximized = false;
            this.restoreRect = { ...this.rect };
            const zones = { left: { x: gap, y: gap, w: half, h: v.h - gap * 2 }, right: { x: half + gap * 2, y: gap, w: half, h: v.h - gap * 2 }, 'top-left': { x: gap, y: gap, w: half, h: hh }, 'top-right': { x: half + gap * 2, y: gap, w: half, h: hh }, 'bottom-left': { x: gap, y: hh + gap * 2, w: half, h: hh }, 'bottom-right': { x: half + gap * 2, y: hh + gap * 2, w: half, h: hh }, third: { x: gap, y: gap, w: (v.w - gap * 4) / 3, h: v.h - gap * 2 }, 'two-thirds': { x: (v.w - gap * 4) / 3 + gap * 2, y: gap, w: (v.w - gap * 4) * 2 / 3 + gap, h: v.h - gap * 2 }, center: { x: v.w * .17, y: v.h * .08, w: v.w * .66, h: v.h * .84 } };
            if (zone === 'max') {
                if (!this.maximized) {
                    this.maximized = true;
                    this.rect = { x: 0, y: 0, w: v.w, h: v.h };
                }
            }
            else
                this.rect = zones[zone] || zones.center;
            this.sync();
            this.focus();
            OS.closePanels?.();
            if(!OS.suppressSnapAssist) OS.showSnapAssist?.(this,zone);
        }
        beginDrag(e) {
            if (e.button !== 0)
                return;
            e.preventDefault();
            this.focus();
            OS.closePanels?.();
            const start = { x: e.clientX, y: e.clientY, rect: { ...this.rect } }, bar = this.bar;
            let moved = false, last = e, pending = 0, zone = null;
            bar.setPointerCapture(e.pointerId);
            this.el.classList.add('dragging');
            const render = () => {
                pending = 0;
                const dx = last.clientX - start.x, dy = last.clientY - start.y;
                if (Math.abs(dx) + Math.abs(dy) < 4 && !moved)
                    return;
                if (!moved && this.maximized) {
                    this.maximized = false;
                    const restore = this.restoreRect || { w: 850, h: 590 };
                    const area = OS.viewport();
                    const relative = (start.x - area.x - start.rect.x) / start.rect.w;
                    this.rect.w = Math.min(restore.w, innerWidth - 20);
                    this.rect.h = Math.min(restore.h, innerHeight - 80);
                    start.rect = { ...this.rect, x: start.x - area.x - this.rect.w * relative, y: start.y - area.y - 18 };
                    start.x = last.clientX;
                    start.y = last.clientY;
                }
                moved = true;
                const v = OS.viewport();
                this.rect.x = Math.max(-this.rect.w + 120, Math.min(v.w - 120, start.rect.x + dx));
                this.rect.y = Math.max(0, Math.min(v.h - 39, start.rect.y + dy));
                this.sync();
                zone = last.clientY < v.y + 9 ? 'max' : last.clientX < v.x + 12 ? 'left' : last.clientX > v.x + v.w - 12 ? 'right' : null;
                const preview = $('#snap-preview');
                if (zone) {
                    const r = zone === 'max' ? { x: 0, y: 0, w: v.w, h: v.h } : zone === 'left' ? { x: 8, y: 8, w: (v.w - 24) / 2, h: v.h - 16 } : { x: (v.w + 8) / 2, y: 8, w: (v.w - 24) / 2, h: v.h - 16 };
                    preview.hidden = false;
                    Object.assign(preview.style, { left: (r.x + v.x) + 'px', top: (r.y + v.y) + 'px', width: r.w + 'px', height: r.h + 'px' });
                }
                else
                    preview.hidden = true;
            };
            const move = ev => { last = ev; if (!pending)
                pending = requestAnimationFrame(render); };
            const end = () => { if (pending) {
                cancelAnimationFrame(pending);
                render();
            } bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', end); bar.removeEventListener('pointercancel', cancel); this.el.classList.remove('dragging'); $('#snap-preview').hidden = true; if (zone)
                this.snap(zone); OS.saveSession(); };
            const cancel = () => { zone = null; end(); };
            bar.addEventListener('pointermove', move);
            bar.addEventListener('pointerup', end, { once: true });
            bar.addEventListener('pointercancel', cancel, { once: true });
        }
        beginResize(e, edge) {
            if (e.button !== 0 || this.maximized)
                return;
            e.preventDefault();
            e.stopPropagation();
            this.focus();
            OS.closePanels?.();
            const start = { x: e.clientX, y: e.clientY, r: { ...this.rect } }, target = e.currentTarget;
            let last = e, pending = 0;
            target.setPointerCapture(e.pointerId);
            this.el.classList.add('dragging');
            const render = () => {
                pending = 0;
                const dx = last.clientX - start.x, dy = last.clientY - start.y, r = { ...start.r }, v = OS.viewport(), minW = Math.min(this.app.minWidth || 320, v.w - 16), minH = Math.min(this.app.minHeight || 240, v.h - 16);
                if (edge.includes('e'))
                    r.w = Math.max(minW, Math.min(v.w - r.x, start.r.w + dx));
                if (edge.includes('s'))
                    r.h = Math.max(minH, Math.min(v.h - r.y, start.r.h + dy));
                if (edge.includes('w')) {
                    r.x = Math.max(0, Math.min(start.r.x + dx, start.r.x + start.r.w - minW));
                    r.w = start.r.w + start.r.x - r.x;
                }
                if (edge.includes('n')) {
                    r.y = Math.max(0, Math.min(start.r.y + dy, start.r.y + start.r.h - minH));
                    r.h = start.r.h + start.r.y - r.y;
                }
                this.rect = r;
                this.sync();
                this.onResize?.();
            };
            const move = ev => { last = ev; if (!pending)
                pending = requestAnimationFrame(render); };
            const end = () => { if (pending) {
                cancelAnimationFrame(pending);
                render();
            } target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', end); target.removeEventListener('pointercancel', end); this.el.classList.remove('dragging'); OS.saveSession(); };
            target.addEventListener('pointermove', move);
            target.addEventListener('pointerup', end, { once: true });
            target.addEventListener('pointercancel', end, { once: true });
        }
        titleMenu(e) { OS.context(e, [{ text: 'Restore', icon: 'restore', disabled: !this.maximized && !this.minimized, action: () => { if (this.maximized)
                    this.toggleMaximize(); this.restore(); } }, { text: 'Minimize', icon: 'min', action: () => this.minimize() }, { text: 'Maximize', icon: 'max', action: () => { if (!this.maximized)
                    this.toggleMaximize(); } }, null, { label: 'Move to desktop' }, ...OS.desktops.map(d => ({ text: d.name, icon: 'desktop', disabled: d.id === this.desktop, action: () => { this.desktop = d.id; this.sync(); OS.emit('windows'); } })), null, { text: 'Close', icon: 'close', key: 'Alt+F4', action: () => this.close() }]); }
        showSnapLayouts() {
            if (this.closed || this.minimized)
                return;
            OS.$('.snap-layouts')?.remove();
            const r = this.maxButton.getBoundingClientRect(), p = OS.el('div', { class: 'snap-layouts flyout', role: 'group', 'aria-label': 'Snap layouts' });
            const layouts = [['left', 'right'], ['third', 'two-thirds'], ['top-left', 'top-right', 'bottom-left', 'bottom-right']];
            for (const zones of layouts) {
                const layout = OS.el('div', { class: 'snap-layout'+(zones.length===4?' snap-four':zones[0]==='third'?' snap-thirds':'') });
                for (const zone of zones) {
                    const b = OS.el('button', { class: 'snap-zone', title: zone, 'aria-label': 'Snap ' + zone });
                    b.onclick = () => { p.remove(); this.snap(zone); };
                    layout.append(b);
                }
                p.append(layout);
            }
            p.style.left = Math.max(8, Math.min(innerWidth - 270, r.right - 230)) + 'px';
            p.style.top = (r.bottom + 7) + 'px';
            $('#panel-layer').append(p);
            let t = setTimeout(() => p.remove(), 3000);
            p.onmouseenter = () => clearTimeout(t);
            p.onmouseleave = () => { t = setTimeout(() => p.remove(), 350); };
        }
        async close(force = false) {
            if (this.closed)
                return;
            if (!force && this.beforeClose && !(await this.beforeClose()))
                return;
            this.closed = true;
            OS.emit('window-action', {action: 'Close'});
            for (const cleanup of this.cleanups) {
                try {
                    cleanup();
                }
                catch (e) {
                    console.warn(e);
                }
            }
            this.cleanups = [];
            this.el.remove();
            OS.windows.delete(this.id);
            OS.renderer?.removeSurface?.(this);
            if (OS.focused === this.id) {
                OS.focused = null;
                const next = Array.from(OS.windows.values()).filter(w => !w.minimized && w.desktop === OS.activeDesktop).sort((a, b) => b.z - a.z)[0];
                next?.focus();
            }
            OS.renderer?.invalidate();
            OS.emit('windows');
            OS.saveSession();
            return true;
        }
    }
    OS.launch = (id, options = {}) => {
        OS.closePanels?.();
        const app = OS.apps.get(id);
        if (!app) {
            OS.notify('App not found', id, 'warning');
            return null;
        }
        if (app.singleton) {
            const existing = Array.from(OS.windows.values()).find(w => w.appId === id);
            if (existing) {
                existing.restore();
                if (options.mode)
                    existing.ready = Promise.resolve(existing.navigate?.(options.mode)).then(()=>existing);
                else if (options.section)
                    existing.ready = Promise.resolve(existing.navigate?.(options.section)).then(()=>existing);
                else if (options.date)
                    existing.navigate?.(options.date);
                return existing;
            }
        }
        return new DesktopWindow(app, options);
    };
    OS.switchDesktop = id => { if (!OS.desktops.some(d => d.id === id))
        return; OS.activeDesktop = id; OS.focused = null; for (const w of OS.windows.values())
        w.sync(); const top = Array.from(OS.windows.values()).filter(w => w.desktop === id && !w.minimized).sort((a, b) => b.z - a.z)[0]; top?.focus(); OS.renderer?.invalidate(); OS.emit('windows'); };
    OS.addDesktop = async () => { const d = { id: OS.uid(), name: 'Desktop ' + (OS.desktops.length + 1) }; OS.desktops.push(d); await OS.db.set('desktops', OS.desktops); OS.switchDesktop(d.id); return d; };
    OS.showDesktop = () => { const ws = Array.from(OS.windows.values()).filter(w => w.desktop === OS.activeDesktop); if (ws.some(w => !w.minimized)) {
        OS.hiddenForDesktop = ws.filter(w => !w.minimized).map(w => w.id);
        ws.forEach(w => w.minimize());
    }
    else {
        for (const id of OS.hiddenForDesktop || [])
            OS.windows.get(id)?.restore();
        OS.hiddenForDesktop = [];
    } };
    window.addEventListener('resize', () => { for (const w of OS.windows.values()) {
        if (w.maximized) {
            const v = OS.viewport();
            w.rect = { x: 0, y: 0, w: v.w, h: v.h };
        }
        else
            w.constrain();
        w.sync();
    } OS.closePanels?.(); });
    document.addEventListener('keydown', e => {
        if ($('#dialog-layer').children.length)
            return;
        if (e.key === 'Escape') {
            $('#context-menu').hidden = true;
            OS.closePanels?.();
        }
        if (e.ctrlKey && e.code === 'Space') {
            e.preventDefault();
            OS.toggleStart?.();
        }
        if (e.ctrlKey && e.altKey) {
            const current = OS.windows.get(OS.focused);
            switch (e.key.toLowerCase()) {
                case 't':
                    e.preventDefault();
                    OS.launch('terminal');
                    break;
                case 'n':
                    e.preventDefault();
                    OS.launch('notepad');
                    break;
                case 'd':
                    e.preventDefault();
                    OS.showDesktop();
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    current?.snap('left');
                    break;
                case 'arrowright':
                    e.preventDefault();
                    current?.snap('right');
                    break;
                case 'arrowup':
                    e.preventDefault();
                    current?.snap('max');
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    current?.minimize();
                    break;
                case 'tab':
                    e.preventDefault();
                    OS.showTaskView?.();
                    break;
            }
        }
    });
    window.addEventListener('beforeunload', e => { if (!OS.ignoreUnload && Array.from(OS.windows.values()).some(w => w.dirty)) {
        e.preventDefault();
        e.returnValue = '';
    } });
})();
