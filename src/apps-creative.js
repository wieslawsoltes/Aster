'use strict';
(() => {
    const OS = Aster, $ = OS.$, esc = OS.esc;
    const iconButton = (icon, label, fn, cls = 'icon-button') => OS.el('button', { class: cls, title: label, 'aria-label': label, html: OS.icon(icon, 18), onclick: OS.guard(fn) });
    const decodeImage = blob => new Promise((resolve, reject) => { const url = URL.createObjectURL(blob), img = new Image(); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(Error('This image format could not be decoded.')); }; img.src = url; });
    OS.decodeImage = decodeImage;
    OS.register('paint', { title: 'Paint', description: 'A canvas for whatever comes to mind.', category: 'Creative', width: 1040, height: 725, minWidth: 460, minHeight: 380,
        mount: async (w, options) => {
            let tool = 'brush', color = '#176ae6', size = 6, filled = false, drawing = false, start = null, last = null, base = null, undo = [], redo = [], path = options.path || null;
            const menu = OS.el('div', { class: 'menu-bar' }), toolbar = OS.el('div', { class: 'toolbar paint-toolbar' }), workspace = OS.el('div', { class: 'paint-workspace' }), canvas = OS.el('canvas', { class: 'paint-canvas', width: 960, height: 600, 'aria-label': 'Drawing canvas', tabindex: '0' }), status = OS.el('div', { class: 'statusbar' });
            workspace.append(canvas);
            w.body.append(menu, toolbar, workspace, status);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const snapshot = () => ({ width: canvas.width, height: canvas.height, image: ctx.getImageData(0, 0, canvas.width, canvas.height) });
            const pushUndo = () => { undo.push(snapshot()); while (undo.length > 16 || undo.reduce((n, s) => n + s.image.data.byteLength, 0) > 64 * 1024 * 1024)
                undo.shift(); redo = []; };
            const restore = s => { canvas.width = s.width; canvas.height = s.height; ctx.putImageData(s.image, 0, 0); changed(); };
            const undoAction = () => { if (undo.length) {
                redo.push(snapshot());
                restore(undo.pop());
            } };
            const redoAction = () => { if (redo.length) {
                undo.push(snapshot());
                restore(redo.pop());
            } };
            const update = () => { for (const b of OS.$$('[data-tool]', toolbar))
                b.classList.toggle('active', b.dataset.tool === tool); for (const b of OS.$$('.color-dot', toolbar))
                b.classList.toggle('selected', b.dataset.color === color); colorInput.value = color; undoB.disabled = !undo.length; redoB.disabled = !redo.length; status.innerHTML = `<span>${canvas.width} × ${canvas.height} px</span><span>${tool[0].toUpperCase() + tool.slice(1)}</span><span>${size} px</span><span class="spacer"></span><span>${w.dirty ? 'Unsaved changes' : 'PNG canvas'}</span>`; w.setTitle((w.dirty ? '● ' : '') + (path ? OS.fs.name(path) : 'Untitled') + ' — Paint'); };
            const changed = () => { w.dirty = true; update(); };
            const setTool = t => { tool = t; canvas.style.cursor = t === 'eyedropper' ? 'copy' : t === 'fill' ? 'cell' : 'crosshair'; update(); };
            const loadBlob = async (blob, newPath = null) => { if (blob.size > 40e6)
                throw Error('Images larger than 40 MB are not supported.'); const img = await decodeImage(blob); const scale = Math.min(1, 4096 / img.naturalWidth, 4096 / img.naturalHeight); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale)); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); path = newPath; w.state.path = path; undo = []; redo = []; w.dirty = false; update(); OS.saveSession(); };
            const canReplace = async () => !w.dirty || await OS.confirm('Discard the unsaved drawing?', 'Save your canvas first to keep your changes.', 'Discard', true);
            const openImage = async () => { if (!await canReplace())
                return; const [f] = await OS.readFile('image/*'); if (f)
                await loadBlob(f); };
            const toBlob = () => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('The canvas could not be exported.')), 'image/png'));
            const save = async (as = false) => {
                let dest = path && /\.png$/i.test(path) ? path : null;
                if (!dest || as) {
                    dest = await OS.prompt('Save drawing', dest || '/Pictures/Untitled.png', 'PNG keeps your drawing at its full canvas resolution.');
                    if (dest === null)
                        return false;
                    dest = OS.fs.normalize(dest);
                    if (!/\.png$/i.test(dest))
                        dest += '.png';
                    if (dest !== path && await OS.fs.stat(dest) && !await OS.confirm('Replace image?', dest + ' already exists.', 'Replace'))
                        return false;
                }
                await OS.fs.write(dest, await toBlob(), 'image/png');
                path = dest;
                w.state.path = path;
                w.dirty = false;
                update();
                OS.saveSession();
                OS.notify('Drawing saved', OS.fs.name(dest));
                return true;
            };
            const newCanvas = async () => { if (!await canReplace())
                return; canvas.width = 960; canvas.height = 600; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 960, 600); undo = []; redo = []; path = null; w.state.path = null; w.dirty = false; update(); OS.saveSession(); };
            const resizeCanvas = async () => { const value = await OS.prompt('Canvas size', `${canvas.width} × ${canvas.height}`, 'Enter width × height in pixels. Maximum: 4096 × 4096.'); if (value === null)
                return; const m = value.match(/^\s*(\d+)\s*[x×, ]\s*(\d+)\s*$/i); if (!m || +m[1] < 1 || +m[2] < 1 || +m[1] > 4096 || +m[2] > 4096)
                throw Error('Enter two positive dimensions no larger than 4096.'); pushUndo(); const old = document.createElement('canvas'); old.width = canvas.width; old.height = canvas.height; old.getContext('2d').drawImage(canvas, 0, 0); canvas.width = +m[1]; canvas.height = +m[2]; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(old, 0, 0); changed(); };
            menu.append(OS.el('button', { text: 'File', onclick: e => OS.context(e, [{ text: 'New canvas', icon: 'plus', action: newCanvas }, { text: 'Open image…', icon: 'folder', action: openImage }, { text: 'Save', icon: 'save', key: 'Ctrl+S', action: () => save() }, { text: 'Save as…', icon: 'save', action: () => save(true) }, { text: 'Download PNG', icon: 'download', action: async () => OS.download(await toBlob(), path ? OS.fs.name(path).replace(/\.[^.]+$/, '.png') : 'Aster drawing.png') }]) }), OS.el('button', { text: 'Edit', onclick: e => OS.context(e, [{ text: 'Undo', icon: 'undo', key: 'Ctrl+Z', disabled: !undo.length, action: undoAction }, { text: 'Redo', icon: 'redo', key: 'Ctrl+Y', disabled: !redo.length, action: redoAction }, null, { text: 'Resize canvas…', icon: 'crop', action: resizeCanvas }, { text: 'Clear canvas', icon: 'trash', action: async () => { if (await OS.confirm('Clear the canvas?', 'This action can be undone.', 'Clear')) {
                            pushUndo();
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            ctx.fillStyle = '#fff';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            changed();
                        } } }]) }), OS.el('span', { class: 'spacer' }));
            const undoB = iconButton('undo', 'Undo', undoAction), redoB = iconButton('redo', 'Redo', redoAction);
            menu.append(undoB, redoB, iconButton('save', 'Save drawing', () => save()));
            for (const [id, icon, label] of [['brush', 'brush', 'Brush (B)'], ['eraser', 'eraser', 'Eraser (E)'], ['line', 'line', 'Line (L)'], ['rectangle', 'rect', 'Rectangle (R)'], ['ellipse', 'circle', 'Ellipse (O)'], ['fill', 'fill', 'Fill (F)'], ['eyedropper', 'zoom', 'Color picker (I)']]) {
                const b = iconButton(icon, label, () => setTool(id), 'paint-tool');
                b.dataset.tool = id;
                toolbar.append(b);
            }
            const width = OS.el('select', { 'aria-label': 'Brush size' });
            for (const v of [1, 2, 4, 6, 10, 16, 24, 40, 64])
                width.append(OS.el('option', { value: v, text: v + ' px', selected: v === size }));
            width.onchange = () => { size = Number(width.value); update(); };
            toolbar.append(OS.el('span', { class: 'divider' }), width);
            const fillToggle = OS.el('button', { text: 'Fill shapes', class: 'secondary', title: 'Toggle filled rectangles and ellipses', 'aria-pressed': 'false', onclick: () => { filled = !filled; fillToggle.classList.toggle('primary', filled); fillToggle.setAttribute('aria-pressed', String(filled)); } });
            toolbar.append(fillToggle, OS.el('span', { class: 'divider' }));
            const colors = OS.el('div', { class: 'paint-colors' });
            for (const hex of ['#17191f', '#687386', '#bfc5cd', '#ffffff', '#e34850', '#f49536', '#f5d041', '#80bc54', '#176ae6', '#5644b9', '#9058c0', '#e768ad', '#52b3dd', '#22a99b', '#7b502a', '#f4bc8e']) {
                const b = OS.el('button', { class: 'color-dot', style: '--dot:' + hex, title: hex, 'aria-label': 'Use color ' + hex });
                b.dataset.color = hex;
                b.onclick = () => { color = hex; update(); };
                colors.append(b);
            }
            const colorInput = OS.el('input', { type: 'color', value: color, 'aria-label': 'Custom paint color' });
            colorInput.oninput = () => { color = colorInput.value; update(); };
            toolbar.append(colors, colorInput);
            const point = e => { const r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(canvas.width - 1, (e.clientX - r.left) * canvas.width / r.width)), y: Math.max(0, Math.min(canvas.height - 1, (e.clientY - r.top) * canvas.height / r.height)), p: e.pressure || .5 }; };
            const setup = (pressure = 1) => { ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = size * (tool === 'brush' ? Math.max(.2, pressure * 1.6) : 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };
            const stroke = (a, b) => { setup(b.p); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; };
            const fillAt = p => {
                const image = ctx.getImageData(0, 0, canvas.width, canvas.height), pixels = new Uint32Array(image.data.buffer), i = (p.y | 0) * canvas.width + (p.x | 0), target = pixels[i];
                const c = document.createElement('canvas');
                c.width = c.height = 1;
                const cc = c.getContext('2d');
                cc.fillStyle = color;
                cc.fillRect(0, 0, 1, 1);
                const replacement = new Uint32Array(cc.getImageData(0, 0, 1, 1).data.buffer)[0];
                if (target === replacement)
                    return;
                const queue = new Int32Array(pixels.length);
                let head = 0, tail = 0;
                queue[tail++] = i;
                pixels[i] = replacement;
                const width = canvas.width;
                while (head < tail) {
                    const pos = queue[head++], x = pos % width;
                    if (x > 0 && pixels[pos - 1] === target) {
                        pixels[pos - 1] = replacement;
                        queue[tail++] = pos - 1;
                    }
                    if (x < width - 1 && pixels[pos + 1] === target) {
                        pixels[pos + 1] = replacement;
                        queue[tail++] = pos + 1;
                    }
                    if (pos >= width && pixels[pos - width] === target) {
                        pixels[pos - width] = replacement;
                        queue[tail++] = pos - width;
                    }
                    if (pos < pixels.length - width && pixels[pos + width] === target) {
                        pixels[pos + width] = replacement;
                        queue[tail++] = pos + width;
                    }
                }
                ctx.putImageData(image, 0, 0);
            };
            canvas.onpointerdown = e => { if (e.button !== 0)
                return; e.preventDefault(); canvas.focus(); const p = point(e); if (tool === 'eyedropper') {
                const d = ctx.getImageData(p.x | 0, p.y | 0, 1, 1).data;
                color = '#' + [d[0], d[1], d[2]].map(x => x.toString(16).padStart(2, '0')).join('');
                setTool('brush');
                return;
            } pushUndo(); start = last = p; drawing = true; canvas.setPointerCapture(e.pointerId); base = ['line', 'rectangle', 'ellipse'].includes(tool) ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null; if (tool === 'fill') {
                fillAt(p);
                drawing = false;
                changed();
                return;
            } if (tool === 'brush' || tool === 'eraser')
                stroke(p, { ...p, x: p.x + .1 }); changed(); };
            canvas.onpointermove = e => { if (!drawing)
                return; const p = point(e); if (tool === 'brush' || tool === 'eraser') {
                let events = e.getCoalescedEvents?.();
                if (!events?.length)
                    events = [e];
                for (const ev of events) {
                    const next = point(ev);
                    stroke(last, next);
                    last = next;
                }
            }
            else {
                ctx.putImageData(base, 0, 0);
                setup();
                ctx.beginPath();
                if (tool === 'line') {
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(p.x, p.y);
                }
                else if (tool === 'rectangle')
                    ctx.rect(start.x, start.y, p.x - start.x, p.y - start.y);
                else if (tool === 'ellipse')
                    ctx.ellipse((p.x + start.x) / 2, (p.y + start.y) / 2, Math.abs(p.x - start.x) / 2, Math.abs(p.y - start.y) / 2, 0, 0, Math.PI * 2);
                if (filled && tool !== 'line')
                    ctx.fill();
                else
                    ctx.stroke();
            } last = p; };
            canvas.onpointerup = canvas.onpointercancel = () => { if (drawing) {
                drawing = false;
                base = null;
                ctx.globalCompositeOperation = 'source-over';
                changed();
            } };
            workspace.ondragover = e => e.preventDefault();
            workspace.ondrop = OS.guard(async (e) => { e.preventDefault(); const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith('image/')); if (file && await canReplace())
                await loadBlob(file); });
            w.onKey = e => { if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))
                return; if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    OS.guard(save)(e.shiftKey);
                }
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    e.shiftKey ? redoAction() : undoAction();
                }
                if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    redoAction();
                }
            }
            else {
                const map = { b: 'brush', e: 'eraser', l: 'line', r: 'rectangle', o: 'ellipse', f: 'fill', i: 'eyedropper' };
                if (map[e.key.toLowerCase()])
                    setTool(map[e.key.toLowerCase()]);
            } };
            w.beforeClose = canReplace;
            w.canvas = canvas;
            w.save = save;
            update();
            if (path) {
                const f = await OS.fs.read(path);
                await loadBlob(await OS.fs.blob(f), path);
            }
            w.addCleanup(() => { undo = []; redo = []; base = null; canvas.width = canvas.height = 1; });
        }
    });
    OS.register('photos', { title: 'Photos', description: 'A closer look at your favorite images.', category: 'Creative', width: 980, height: 650, minWidth: 400,
        mount: async (w, options) => {
            let files = [], index = 0, zoom = 1, rotation = 0, pan = { x: 0, y: 0 }, urls = new Map(), currentImage = null, galleryMode = !options.path;
            const toolbar = OS.el('div', { class: 'toolbar' }), layout = OS.el('div', { class: 'photos-layout' }), stage = OS.el('div', { class: 'photo-stage' }), film = OS.el('div', { class: 'photo-filmstrip' });
            layout.append(stage, film);
            w.body.append(toolbar, layout);
            const getURL = async (path) => { if (!urls.has(path)) {
                const file = await OS.fs.read(path);
                urls.set(path, URL.createObjectURL(await OS.fs.blob(file)));
            } return urls.get(path); };
            const transform = () => { if (currentImage)
                currentImage.style.transform = `translate(${pan.x}px,${pan.y}px) rotate(${rotation}deg) scale(${zoom})`; zoomLabel.textContent = Math.round(zoom * 100) + '%'; };
            const fit = () => { zoom = 1; rotation = 0; pan = { x: 0, y: 0 }; transform(); };
            const show = async (i = index) => { if (!files.length) {
                stage.innerHTML = '<div class="empty"><strong>No images yet</strong><span>Open an image or drop one into Photos.</span></div>';
                film.replaceChildren();
                return;
            } index = (i + files.length) % files.length; galleryMode = false; stage.replaceChildren(); const file = files[index]; const img = OS.el('img', { src: await getURL(file.path), alt: OS.fs.name(file.path), draggable: 'false', style: 'width:100%;height:100%;object-fit:contain' }); currentImage = img; stage.append(img, OS.el('span', { class: 'photo-name', text: OS.fs.name(file.path) })); zoom = 1; rotation = 0; pan = { x: 0, y: 0 }; transform(); w.setTitle(OS.fs.name(file.path) + ' — Photos'); w.state.path = file.path; OS.saveSession(); film.hidden = false; await renderFilm(); };
            const renderFilm = async () => { film.replaceChildren(); for (let i = 0; i < files.length; i++) {
                const file = files[i], thumb = OS.el('button', { class: 'photo-thumb' + (i === index ? ' active' : ''), title: OS.fs.name(file.path), 'aria-label': OS.fs.name(file.path) });
                thumb.append(OS.el('img', { src: await getURL(file.path), alt: '' }));
                thumb.onclick = OS.guard(() => show(i));
                film.append(thumb);
            } };
            const gallery = async () => { galleryMode = true; film.hidden = true; currentImage = null; stage.replaceChildren(); const grid = OS.el('div', { class: 'gallery-grid', style: 'width:100%;height:100%;align-content:start' }); stage.append(grid); for (let i = 0; i < files.length; i++) {
                const f = files[i], card = OS.el('button', { class: 'gallery-card' });
                card.append(OS.el('img', { src: await getURL(f.path), alt: '' }), OS.el('span', { text: OS.fs.name(f.path) }));
                card.onclick = OS.guard(() => show(i));
                grid.append(card);
            } w.setTitle('Gallery — Photos'); };
            const refresh = async () => { const all = await OS.fs.list('/Pictures'); files = all.filter(f => f.kind === 'file' && OS.appForFile(f.path, f.mime) === 'photos'); if (options.path && !files.some(f => f.path === options.path)) {
                const f = await OS.fs.stat(options.path);
                if (f)
                    files.push(f);
            } if (galleryMode)
                await gallery();
            else
                await show(index); };
            const importImages = async () => { const input = await OS.readFile('image/*', true); if (!input.length)
                return; await OS.fs.import(input, '/Pictures'); await refresh(); await show(files.length - 1); };
            const download = async () => { if (!files.length)
                return; const file = await OS.fs.read(files[index].path); if (!rotation) {
                OS.download(await OS.fs.blob(file), OS.fs.name(file.path));
                return;
            } const img = await decodeImage(await OS.fs.blob(file)), c = document.createElement('canvas'), angle = ((rotation % 360) + 360) % 360; c.width = angle % 180 ? img.height : img.width; c.height = angle % 180 ? img.width : img.height; const ctx = c.getContext('2d'); ctx.translate(c.width / 2, c.height / 2); ctx.rotate(rotation * Math.PI / 180); ctx.drawImage(img, -img.width / 2, -img.height / 2); c.toBlob(blob => { if (blob)
                OS.download(blob, OS.fs.name(file.path).replace(/\.[^.]+$/, '') + '-rotated.png'); }); };
            toolbar.append(iconButton('grid', 'Gallery', gallery), OS.el('button', { html: OS.icon('folder', 17) + 'Open', onclick: OS.guard(importImages) }), OS.el('span', { class: 'divider' }), iconButton('back', 'Previous image', () => show(index - 1)), iconButton('forward', 'Next image', () => show(index + 1)), OS.el('span', { class: 'spacer' }), iconButton('min', 'Zoom out', () => { zoom = Math.max(.1, zoom / 1.2); transform(); }));
            const zoomLabel = OS.el('span', { text: '100%', style: 'font-size:11px;min-width:38px;text-align:center' });
            toolbar.append(zoomLabel, iconButton('plus', 'Zoom in', () => { zoom = Math.min(8, zoom * 1.2); transform(); }), iconButton('max', 'Fit image', fit), iconButton('rotate', 'Rotate 90°', () => { rotation += 90; transform(); }), OS.el('span', { class: 'divider' }), iconButton('paint', 'Edit in Paint', () => { if (files[index])
                OS.launch('paint', { path: files[index].path }); }), iconButton('download', 'Download image', download));
            stage.onwheel = e => { if (galleryMode)
                return; e.preventDefault(); zoom = Math.min(8, Math.max(.1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); transform(); };
            stage.onpointerdown = e => { if (galleryMode || !currentImage)
                return; stage.setPointerCapture(e.pointerId); const start = { x: e.clientX - pan.x, y: e.clientY - pan.y }; const move = ev => { pan = { x: ev.clientX - start.x, y: ev.clientY - start.y }; transform(); }; const end = () => stage.removeEventListener('pointermove', move); stage.addEventListener('pointermove', move); stage.addEventListener('pointerup', end, { once: true }); stage.addEventListener('pointercancel', end, { once: true }); };
            stage.ondblclick = fit;
            layout.ondragover = e => e.preventDefault();
            layout.ondrop = OS.guard(async (e) => { e.preventDefault(); const images = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')); if (images.length) {
                await OS.fs.import(images, '/Pictures');
                await refresh();
            } });
            w.onKey = e => { if (e.key === 'ArrowRight')
                OS.guard(show)(index + 1); if (e.key === 'ArrowLeft')
                OS.guard(show)(index - 1); };
            w.addCleanup(() => { urls.forEach(URL.revokeObjectURL); urls.clear(); });
            await refresh();
            if (options.path) {
                const i = files.findIndex(f => f.path === options.path);
                await show(Math.max(0, i));
            }
        }
    });
    OS.register('media', { title: 'Media Player', description: 'Your music and video. Nothing uploaded.', category: 'Creative', width: 870, height: 595, minWidth: 420,
        mount: async (w, options) => {
            let files = [], index = 0, media = null, context = null, source = null, analyser = null, frequencyData = null, frame = 0, urls = new Map(), loop = false;
            const layout = OS.el('div', { class: 'media-app' }), main = OS.el('div', { class: 'media-main' }), playlist = OS.el('aside', { class: 'media-playlist' });
            layout.append(main, playlist);
            w.body.append(layout);
            const art = OS.el('div', { class: 'album-art', html: OS.icon('music', 64) }), title = OS.el('h2', { text: 'A little soundtrack.' }), sub = OS.el('p', { text: 'Choose a track from your library.' }), visual = OS.el('canvas', { class: 'media-visualizer', width: 460, height: 58, 'aria-hidden': 'true' }), mediaHolder = OS.el('div', { style: 'width:100%;display:flex;justify-content:center' }), controls = OS.el('div', { class: 'row' });
            main.append(art, title, sub, mediaHolder, visual, controls);
            const prev = iconButton('prev', 'Previous track', () => load(index - 1, true)), next = iconButton('next', 'Next track', () => load(index + 1, true)), loopB = iconButton('refresh', 'Repeat current track', () => { loop = !loop; loopB.classList.toggle('primary', loop); if (media)
                media.loop = loop; });
            const speed = OS.el('select', { 'aria-label': 'Playback speed', style: 'font-size:11px;background:#252b3b;color:#fff;border-color:#ffffff20' });
            for (const v of [.75, 1, 1.25, 1.5, 2])
                speed.append(OS.el('option', { value: v, text: v + '×', selected: v === 1 }));
            speed.onchange = () => { if (media)
                media.playbackRate = Number(speed.value); };
            controls.append(prev, next, loopB, speed);
            const draw = () => { frame = 0; if (w.closed || !analyser || !media || media.paused)
                return; frame = requestAnimationFrame(draw); if (document.hidden || w.minimized || w.desktop !== OS.activeDesktop)
                return; const data = frequencyData || (frequencyData = new Uint8Array(analyser.frequencyBinCount)); analyser.getByteFrequencyData(data); const ctx = visual.getContext('2d'); ctx.clearRect(0, 0, visual.width, visual.height); const g = ctx.createLinearGradient(0, 0, visual.width, 0); g.addColorStop(0, '#6387df'); g.addColorStop(1, '#79dac9'); ctx.fillStyle = g; for (let i = 0; i < 48; i++) {
                const h = Math.max(2, data[i * 2] / 255 * 54);
                ctx.fillRect(i * 9.6, 58 - h, 5.5, h);
            } };
            const audioGraph = async () => { if (!window.AudioContext && !window.webkitAudioContext)
                return; try {
                if (!context)
                    context = new (window.AudioContext || window.webkitAudioContext)();
                if (!source) {
                    source = context.createMediaElementSource(media);
                    analyser = context.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);
                    analyser.connect(context.destination);
                }
                if (context.state === 'suspended')
                    await context.resume();
                if (!frame)
                    draw();
            }
            catch (e) {
                console.warn('Audio visualization unavailable:', e);
            } };
            const applyVolume = () => { if (media) {
                media.volume = OS.settings.volume / 100;
                media.muted = OS.settings.muted;
            } };
            const renderList = () => {
                playlist.replaceChildren(OS.el('h3', { text: 'Your library' }));
                const importB = OS.el('button', { class: 'secondary', html: OS.icon('plus', 15) + 'Add media', style: 'font-size:11px;margin:0 8px 15px;background:#252b3b;color:#e1e8fa;border-color:#ffffff20', onclick: OS.guard(async () => { const f = await OS.readFile('audio/*,video/*', true); if (f.length) {
                        for (const file of f)
                            await OS.fs.import([file], file.type.startsWith('video/') ? '/Videos' : '/Music');
                        await refresh();
                    } }) });
                playlist.append(importB);
                for (let i = 0; i < files.length; i++) {
                    const f = files[i], b = OS.el('button', { class: 'track' + (i === index ? ' active' : ''), html: OS.appIcon('media', 30) + `<div><span>${esc(OS.fs.name(f.path).replace(/\.[^.]+$/, ''))}</span><small>${OS.formatBytes(f.size)} · ${f.mime?.startsWith('video/') ? 'Video' : 'Audio'}</small></div>`, onclick: OS.guard(() => load(i, true)) });
                    playlist.append(b);
                }
            };
            async function load(i, play = false) {
                if (!files.length) {
                    title.textContent = 'Your library is empty';
                    return;
                }
                index = (i + files.length) % files.length;
                const f = files[index];
                if (media) {
                    media.pause();
                    media.removeAttribute('src');
                    media.load();
                    media.remove();
                }
                source?.disconnect();
                analyser?.disconnect();
                source = null;
                analyser = null;
                if (!urls.has(f.path)) {
                    const file = await OS.fs.read(f.path);
                    urls.set(f.path, URL.createObjectURL(await OS.fs.blob(file)));
                }
                const isVideo = f.mime?.startsWith('video/') || /\.(mp4|webm)$/i.test(f.path);
                media = OS.el(isVideo ? 'video' : 'audio', { class: 'aster-media-element', controls: true, src: urls.get(f.path), preload: 'metadata', 'aria-label': OS.fs.name(f.path) });
                media.loop = loop;
                media.playbackRate = Number(speed.value);
                mediaHolder.replaceChildren(media);
                art.hidden = isVideo;
                visual.hidden = isVideo;
                title.textContent = OS.fs.name(f.path).replace(/\.[^.]+$/, '');
                sub.textContent = f.path === '/Music/First light.wav' ? 'Original synthesized audio · Aster Sessions' : 'Local media · Never uploaded';
                applyVolume();
                media.onplay = audioGraph;
                media.onpause = () => { cancelAnimationFrame(frame); frame = 0; };
                media.onended = () => { if (!loop && files.length > 1)
                    OS.guard(load)(index + 1, true); };
                media.onerror = () => OS.notify('Unable to play this file', 'The browser could not decode this media format. Try a browser-supported audio or video file.', 'warning');
                w.setTitle(title.textContent + ' — Media Player');
                w.state.path = f.path;
                OS.saveSession();
                renderList();
                if (play)
                    try {
                        await media.play();
                    }
                    catch (e) {
                        OS.notify('Press Play to begin', e.message);
                    }
            }
            async function refresh() { const current = files[index]?.path; files = [...await OS.fs.list('/Music'), ...await OS.fs.list('/Videos')].filter(f => f.kind === 'file' && OS.appForFile(f.path, f.mime) === 'media'); if (options.path && !files.some(f => f.path === options.path)) {
                const f = await OS.fs.stat(options.path);
                if (f)
                    files.push(f);
            } const ix = files.findIndex(f => f.path === (options.path || current)); index = Math.max(0, ix); renderList(); }
            w.on('settings', applyVolume);
            w.addCleanup(() => { cancelAnimationFrame(frame); if (media) {
                media.pause();
                media.removeAttribute('src');
                media.load();
            } source?.disconnect(); analyser?.disconnect(); context?.close(); urls.forEach(URL.revokeObjectURL); });
            await refresh();
            await load(index, false);
            w.mediaElement = () => media;
        }
    });
    const defaultHTML = `<main class="app">\n  <div class="orb">✦</div>\n  <p class="eyebrow">BUILT IN ASTER</p>\n  <h1>Hello, little universe.</h1>\n  <p>One idea. A few lines of code. A world of possibilities.</p>\n  <button id="counter">Make a little magic</button>\n  <small id="status">Your app is running in an isolated sandbox.</small>\n</main>`;
    const defaultCSS = `* { box-sizing: border-box; }\nbody { margin: 0; min-height: 100vh; display: grid; place-items: center;\n  background: #f1f5ff; color: #1c2952; font-family: system-ui, sans-serif; }\n.app { padding: 35px; text-align: center; max-width: 620px; }\n.orb { font-size: 70px; color: #417cde; margin-bottom: 20px; }\n.eyebrow { font-size: 10px; letter-spacing: 3px; color: #7988ac; }\nh1 { font-size: clamp(28px, 6vw, 44px); letter-spacing: -1.5px; font-weight: 550; }\np { color: #7180a2; line-height: 1.7; }\nbutton { margin: 20px 0; background: #286de0; border: 0; color: white;\n  border-radius: 8px; padding: 13px 24px; font: inherit; cursor: pointer; }\nbutton:hover { background: #185bca; }\nsmall { display: block; font-size: 10px; color: #8d99b2; }`;
    const defaultJS = `let count = 0;\nconst button = document.querySelector('#counter');\nbutton.addEventListener('click', () => {\n  count += 1;\n  button.textContent = count === 1 ? 'A little magic ✦' : count + ' little moments of magic ✦';\n  document.querySelector('.orb').style.transform = 'rotate(' + count * 45 + 'deg)';\n  console.log('Button clicked', count);\n});\nconsole.log('Hello from your Aster app!');`;
    OS.register('code', { title: 'Code Studio', description: 'Build and run real HTML, CSS, and JavaScript apps.', category: 'Development', width: 1130, height: 720, minWidth: 540,
        mount: async (w, options) => {
            let sources = { html: defaultHTML, css: defaultCSS, js: defaultJS, ...w.state.sources }, active = w.state.activeFile || 'html', project = w.state.project || null, previewVisible = true;
            const channel = OS.uid();
            const toolbar = OS.el('div', { class: 'toolbar' }), layout = OS.el('div', { class: 'code-layout' }), side = OS.el('aside', { class: 'code-sidebar' }), editArea = OS.el('div', { class: 'code-editor-area' }), tab = OS.el('div', { class: 'code-tabbar' }), editorWrap = OS.el('div', { class: 'code-edit' }), gutter = OS.el('div', { class: 'code-gutter', 'aria-hidden': 'true' }), editor = OS.el('textarea', { class: 'code-text', spellcheck: 'false', 'aria-label': 'Code editor' }), preview = OS.el('iframe', { class: 'code-preview', title: 'Live app preview', sandbox: 'allow-scripts allow-forms allow-modals allow-downloads' }), consolePanel = OS.el('div', { hidden: true, style: 'height:125px;flex:none;background:#10131c;color:#b8c7e3;font:11px/1.6 var(--mono);overflow:auto;padding:10px 15px;user-select:text;border-top:1px solid #ffffff14' }), status = OS.el('div', { class: 'statusbar' });
            editorWrap.append(gutter, editor);
            editArea.append(tab, editorWrap, consolePanel);
            layout.append(side, editArea, preview);
            w.body.append(toolbar, layout, status);
            w.dirty = !!w.state.dirty;
            const fileNames = { html: 'index.html', css: 'style.css', js: 'script.js' };
            const compose = (withConsole = false) => {
                sources[active] = editor.value;
                let html = sources.html;
                const style = '<style>' + sources.css.replace(/<\/style/gi, '<\\/style') + '</style>';
                const script = '<script>' + sources.js.replace(/<\/script/gi, '<\\/script') + '<\/script>';
                const consoleScript = withConsole ? `<script>(()=>{const token=${JSON.stringify(channel)};const send=(type,args)=>{let message=args.map(a=>{try{return typeof a==='string'?a:JSON.stringify(a)}catch{return String(a)}}).join(' ').slice(0,3000);parent.postMessage({type:'aster-console',token,level:type,message},'*');};for(const type of ['log','warn','error','info']){const old=console[type];console[type]=(...args)=>{old.apply(console,args);send(type,args);};}window.addEventListener('error',e=>send('error',[e.message]));window.addEventListener('unhandledrejection',e=>send('error',[String(e.reason)]));})();<\/script>` : '';
                if (!/<html[\s>]/i.test(html))
                    html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + style + consoleScript + '</head><body>' + html + script + '</body></html>';
                else {
                    if (/<\/head>/i.test(html))
                        html = html.replace(/<\/head>/i, style + consoleScript + '</head>');
                    else
                        html = style + consoleScript + html;
                    if (/<\/body>/i.test(html))
                        html = html.replace(/<\/body>/i, script + '</body>');
                    else
                        html += script;
                }
                return html;
            };
            const sync = () => {
                sources[active] = editor.value;
                w.state.sources = { ...sources };
                w.state.activeFile = active;
                w.state.project = project;
                w.state.dirty = !!w.dirty;
                gutter.textContent = Array.from({ length: Math.max(40, editor.value.split('\n').length) }, (_, i) => i + 1).join('\n');
                gutter.scrollTop = editor.scrollTop;
                const before = editor.value.slice(0, editor.selectionStart);
                status.innerHTML = `<span>${fileNames[active]}</span><span>Ln ${before.split('\n').length}, Col ${before.length - before.lastIndexOf('\n')}</span><span class="spacer"></span><span>${w.dirty ? 'Unsaved changes' : 'Saved'}</span><span>UTF-8</span><span>Sandboxed preview</span>`;
                w.setTitle((w.dirty ? '● ' : '') + (project ? OS.fs.name(project) : 'Untitled project') + ' — Code Studio');
                OS.saveSession();
            };
            const selectFile = id => { sources[active] = editor.value; active = id; editor.value = sources[id]; tab.textContent = fileNames[id]; for (const b of OS.$$('button', side))
                b.classList.toggle('active', b.dataset.file === id); sync(); editor.focus(); };
            side.append(OS.el('div', { class: 'eyebrow', text: 'Explorer' }));
            for (const [id, name] of Object.entries(fileNames)) {
                const b = OS.el('button', { html: OS.icon(id === 'html' ? 'code' : id === 'css' ? 'paint' : 'file', 13) + esc(name) });
                b.dataset.file = id;
                b.onclick = () => selectFile(id);
                side.append(b);
            }
            const run = () => { consolePanel.replaceChildren(); preview.srcdoc = compose(true); previewVisible = true; layout.classList.remove('preview-hidden'); OS.notify('Preview updated', 'Your HTML, CSS, and JavaScript are running in the sandbox.'); };
            const save = async () => {
                sources[active] = editor.value;
                if (!project) {
                    const p = await OS.prompt('Save project', '/Projects/My app', 'A folder containing index.html, style.css, script.js, and a self-contained app.html will be created.');
                    if (p === null)
                        return false;
                    project = OS.fs.normalize(p);
                    const existing = await OS.fs.stat(project);
                    if (existing && existing.kind !== 'directory')
                        throw Error('A file already uses this path.');
                    if (existing && !await OS.confirm('Use existing project folder?', 'Matching source files will be replaced.', 'Save here')) {
                        project = null;
                        return false;
                    }
                    if (!existing)
                        await OS.fs.mkdir(project);
                }
                for (const [id, name] of Object.entries(fileNames))
                    await OS.fs.write(OS.fs.join(project, name), sources[id]);
                await OS.fs.write(OS.fs.join(project, 'app.html'), compose(false), 'text/html');
                w.dirty = false;
                sync();
                OS.notify('Project saved', project);
                return true;
            };
            const open = async () => { if (w.dirty && !await OS.confirm('Discard source changes?', 'Save the current project first to keep your changes.', 'Discard', true))
                return; const p = await OS.prompt('Open project folder', project || '/Projects/My app'); if (p === null)
                return; const folder = OS.fs.normalize(p), next = {}; for (const [id, name] of Object.entries(fileNames))
                next[id] = await OS.fs.text(await OS.fs.read(OS.fs.join(folder, name))); project = folder; sources = next; editor.value = sources[active]; w.dirty = false; sync(); preview.srcdoc = compose(true); };
            const install = async () => { if (!await save())
                return; const name = await OS.prompt('Add app to Start', OS.fs.name(project), 'This installs your HTML app inside Aster only. It does not install software on your operating system.'); if (!name?.trim())
                return; const path = OS.fs.join(project, 'app.html'), existing = OS.customApps.find(a => a.path === path), record = { id: existing?.id || 'custom-' + OS.uid(), title: name.trim().slice(0, 60), path }; if (existing)
                Object.assign(existing, record);
            else
                OS.customApps.push(record); await OS.db.set('customApps', OS.customApps); OS.registerCustom(record); OS.notify('App added', record.title + ' is now available in Start and App Center.', 'info', { label: 'Launch app', fn: () => OS.launch(record.id) }); };
            toolbar.append(OS.el('button', { class: 'primary', html: OS.icon('play', 15) + 'Run preview', onclick: run }), iconButton('save', 'Save project', save), iconButton('folder', 'Open project', open), OS.el('span', { class: 'divider' }), OS.el('button', { html: OS.icon('external', 16) + 'Run as app', onclick: () => { const html = compose(false); const id = 'preview-' + OS.uid(); OS.register(id, { title: 'App preview', category: 'Temporary', hidden: true, width: 850, height: 620, mount: app => { const frame = OS.el('iframe', { class: 'app-frame', sandbox: 'allow-scripts allow-forms allow-modals allow-downloads', title: 'Your app' }); frame.srcdoc = html; app.body.append(frame); app.addCleanup(() => { OS.apps.delete(id); OS.emit('apps'); }); } }); OS.launch(id); } }), OS.el('button', { html: OS.icon('store', 16) + 'Add to Start', onclick: OS.guard(install) }), OS.el('span', { class: 'spacer' }), iconButton('terminal', 'Toggle console', () => consolePanel.hidden = !consolePanel.hidden), iconButton('taskview', 'Toggle live preview', () => { previewVisible = !previewVisible; layout.classList.toggle('preview-hidden', !previewVisible); }), iconButton('download', 'Download app.html', () => OS.download(new Blob([compose(false)], { type: 'text/html' }), (project ? OS.fs.name(project) : 'Aster app') + '.html')));
            editor.value = sources[active];
            editor.oninput = () => { w.dirty = true; sync(); };
            editor.onscroll = () => { gutter.scrollTop = editor.scrollTop; };
            editor.onclick = editor.onkeyup = () => sync();
            editor.onkeydown = e => { if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart, end = editor.selectionEnd;
                if (e.shiftKey) {
                    const lineStart = editor.value.lastIndexOf('\n', start - 1) + 1;
                    if (editor.value.slice(lineStart, lineStart + 2) === '  ')
                        editor.setRangeText('', lineStart, lineStart + 2, 'preserve');
                }
                else
                    editor.setRangeText('  ', start, end, 'end');
                editor.oninput();
            } if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const before = editor.value.slice(0, editor.selectionStart), line = before.split('\n').at(-1), indent = line.match(/^\s*/)[0] + (/[({[]\s*$/.test(line) ? '  ' : '');
                editor.setRangeText('\n' + indent, editor.selectionStart, editor.selectionEnd, 'end');
                editor.oninput();
            } };
            const onMessage = e => { if (e.source !== preview.contentWindow || e.data?.type !== 'aster-console' || e.data?.token !== channel)
                return; const line = OS.el('div', { text: String(e.data.message).slice(0, 3000), style: e.data.level === 'error' ? 'color:#ff909a' : '' }); consolePanel.append(line); while (consolePanel.childElementCount > 150)
                consolePanel.firstChild.remove(); consolePanel.scrollTop = consolePanel.scrollHeight; };
            window.addEventListener('message', onMessage);
            w.addCleanup(() => { window.removeEventListener('message', onMessage); preview.srcdoc = ''; });
            w.onKey = e => { if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    OS.guard(save)();
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    run();
                }
            } };
            w.beforeClose = async () => !w.dirty || await OS.confirm('Discard unsaved source changes?', 'Save with Ctrl+S to keep your project.', 'Discard', true);
            w.sources = sources;
            w.editor = editor;
            w.run = run;
            w.save = save;
            w.compose = compose;
            tab.textContent = fileNames[active];
            for (const b of OS.$$('button', side))
                b.classList.toggle('active', b.dataset.file === active);
            sync();
            preview.srcdoc = compose(true);
        }
    });
    OS.register('snips', { title: 'Snips', description: 'Capture, save, and annotate a screen you choose.', category: 'Creative', width: 690, height: 540, minWidth: 350,
        mount: async (w) => {
            let blob = null, path = null, url = null, captureStream = null;
            const toolbar = OS.el('div', { class: 'toolbar' }), body = OS.el('div', { class: 'snips-app' });
            w.body.append(toolbar, body);
            body.innerHTML = OS.appIcon('snips', 65) + '<h1 style="margin-bottom:0">Keep a little moment.</h1><p>Capture a screen, window, or tab that you choose. Your browser asks for permission every time. Aster stops sharing as soon as the still image is captured.</p>';
            const capture = async () => { if (!navigator.mediaDevices?.getDisplayMedia)
                throw Error('Screen capture is not supported here. Open Aster on localhost or HTTPS in a compatible desktop browser.'); let stream; try {
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                if(w.closed){stream.getTracks().forEach(t=>t.stop());return;}
                captureStream=stream;
                const video = document.createElement('video');
                video.muted = true;
                video.srcObject = stream;
                await video.play();
                await new Promise(resolve => setTimeout(resolve, 180));
                if(w.closed)return;
                if (!video.videoWidth)
                    throw Error('The selected screen did not produce an image.');
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 4096 / video.videoWidth);
                canvas.width = Math.round(video.videoWidth * scale);
                canvas.height = Math.round(video.videoHeight * scale);
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if(w.closed)return;
                if (!blob)
                    throw Error('Capture failed.');
                path = await OS.fs.unique('/Pictures/Snip ' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png');
                if(w.closed)return;
                await OS.fs.write(path, blob, 'image/png');
                if(w.closed)return;
                if (url)
                    URL.revokeObjectURL(url);
                url = URL.createObjectURL(blob);
                body.replaceChildren(OS.el('img', { class: 'snips-preview', src: url, alt: 'Your selected screen capture' }), OS.el('p', { text: 'Saved to ' + path }), OS.el('button', { class: 'primary', html: OS.icon('paint', 17) + 'Annotate in Paint', onclick: () => OS.launch('paint', { path }) }));
                downloadB.disabled = false;
                OS.notify('Screen capture saved', OS.fs.name(path));
            }
            finally {
                stream?.getTracks().forEach(t => t.stop());captureStream=null;
            } };
            const captureB = OS.el('button', { class: 'primary', html: OS.icon('plus', 16) + 'New capture', onclick: OS.guard(capture) }), downloadB = OS.el('button', { html: OS.icon('download', 17) + 'Download', disabled: true, onclick: () => { if (blob)
                    OS.download(blob, OS.fs.name(path)); } });
            toolbar.append(captureB, downloadB, OS.el('span', { class: 'spacer' }), OS.el('span', { class: 'pill', html: OS.icon('shield', 12) + 'Permission required' }));
            w.addCleanup(() => { captureStream?.getTracks().forEach(t=>t.stop()); if (url)
                URL.revokeObjectURL(url); });
        }
    });
})();
