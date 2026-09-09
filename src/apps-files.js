'use strict';
(() => {
    const OS = Aster, $ = OS.$, esc = OS.esc;
    const button = (icon, label, fn, cls = '') => OS.el('button', { class: cls, title: label, 'aria-label': label, html: OS.icon(icon, 18), onclick: OS.guard(fn) });
    const displayName = e => OS.fs.name(e.originalPath || e.path);
    const fileType = e => e.kind === 'directory' ? 'File folder' : (e.mime?.startsWith('image/') ? 'Image' : e.mime?.startsWith('audio/') ? 'Audio file' : e.mime?.startsWith('video/') ? 'Video file' : ({ md: 'Markdown document', txt: 'Text document', html: 'HTML document', js: 'JavaScript file', json: 'JSON document', css: 'CSS stylesheet' })[e.path.split('.').pop()] || 'File');
    OS.fileQueryMatches = (entry, source) => {
        const name=displayName(entry).toLowerCase(),mime=entry.mime||'',kind=entry.kind==='directory'?'folder':mime.startsWith('image/')?'image':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':/\.zip$/i.test(name)?'archive':mime.startsWith('text/')?'text':'file';
        return String(source).slice(0,200).toLowerCase().split(/\s+/).filter(Boolean).every(term=>{
            if(term.startsWith('kind:'))return term.slice(5)==='file'?entry.kind==='file':kind===term.slice(5);
            if(term.startsWith('ext:'))return entry.kind==='file'&&name.endsWith('.'+term.slice(4).replace(/^\./,''));
            const size=/^size:([<>])(\d+(?:\.\d+)?)(kb|mb|gb|b)?$/.exec(term);
            if(size){const bytes=Number(size[2])*({b:1,kb:1024,mb:1048576,gb:1073741824}[size[3]||'b']);return size[1]==='>'?(entry.size||0)>bytes:(entry.size||0)<bytes;}
            return name.includes(term);
        });
    };
    OS.register('files', { title: 'File Explorer', description: 'Files, folders, and everything in between.', category: 'Essentials', width: 1020, height: 665, minWidth: 430, minHeight: 320,
        mount: async (w, options) => {
            let path = options.path || w.state.path || 'home', history = [path], historyIndex = 0, rows = [], selected = new Set(), anchor = null, view = w.state.view || 'list', query = '', sort = 'name', asc = true, token = 0, urls = [];
            const validTab = t => t && typeof t.path === 'string' && t.path.length < 1024;
            let fileTabs = (Array.isArray(w.state.explorerTabs) ? w.state.explorerTabs : []).filter(validTab).slice(0,12);
            if (!fileTabs.length) fileTabs = [{path, history:[path], historyIndex:0, query:'', view, sort:'name', asc:true}];
            let archivePrefix='',archiveActive=false,archiveCache=null;
            let activeTab = Math.min(fileTabs.length-1, Math.max(0, Number(w.state.activeFileTab)||0)), detailToken=0, previewURL='';
            const tabs = OS.el('div', { class: 'explorer-tabs', role:'tablist', 'aria-label':'Folder tabs' });
            function stashTab() { fileTabs[activeTab] = {path,history:history.slice(-50),historyIndex:Math.min(historyIndex,49),query,view,sort,asc,archivePrefix}; w.state.explorerTabs=fileTabs.map(t=>({...t})); w.state.activeFileTab=activeTab; }
            function loadTab() { const t=fileTabs[activeTab];path=t.path;archivePrefix=typeof t.archivePrefix==='string'?t.archivePrefix:'';history=(Array.isArray(t.history)?t.history:[path]).filter(p=>typeof p==='string').slice(-50);if(!history.length)history=[path];historyIndex=Math.min(history.length-1,Math.max(0,Number(t.historyIndex)||0));query=typeof t.query==='string'?t.query.slice(0,200):'';view=t.view==='grid'?'grid':'list';sort=['name','modified','type','size'].includes(t.sort)?t.sort:'name';asc=t.asc!==false;selected.clear();anchor=null; }
            loadTab();
            function openTab(dest=path) { if(fileTabs.length>=12) {OS.notify('Tab limit reached','Close a folder tab first (limit 12).');return;}stashTab();fileTabs.push({path:dest});activeTab=fileTabs.length-1;loadTab();search.value=query;OS.guard(render)(); }
            function closeTab(index) { if(fileTabs.length===1) return w.close();stashTab();fileTabs.splice(index,1);if(index<activeTab)activeTab--;else if(index===activeTab)activeTab=Math.min(index,fileTabs.length-1);loadTab();search.value=query;OS.guard(render)(); }
            function switchTab(index) { stashTab();activeTab=index;loadTab();search.value=query;OS.guard(render)(); }
            function renderTabs() { tabs.replaceChildren();fileTabs.forEach((tab,i)=>{const name=tab.path==='home'?'Home':OS.fs.name(tab.path),wrap=OS.el('div',{class:'explorer-tab-slot'}),b=OS.el('button',{class:'explorer-tab'+(i===activeTab?' active':''),role:'tab','aria-selected':String(i===activeTab),tabindex:i===activeTab?'0':'-1',html:OS.icon('folder',15)+'<span>'+esc(name)+'</span>',onclick:()=>switchTab(i)});b.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();switchTab((i+(e.key==='ArrowRight'?1:fileTabs.length-1))%fileTabs.length);setTimeout(()=>OS.$('[role=tab][aria-selected=true]',tabs)?.focus(),0);}};wrap.append(b,button('close','Close tab '+name,()=>closeTab(i),'icon-button'));tabs.append(wrap);});tabs.append(button('plus','New folder tab',()=>openTab(path),'icon-button')); }

            const cmd = OS.el('div', { class: 'toolbar explorer-commandbar' }), nav = OS.el('div', { class: 'explorer-nav' }), side = OS.el('aside', { class: 'explorer-sidebar', 'aria-label': 'Folder navigation' }), main = OS.el('div', { class: 'explorer-main', tabindex: '0', 'aria-label': 'Files' }), details = OS.el('aside', { class: 'explorer-details', 'aria-label': 'Details pane' }), layout = OS.el('div', { class: 'explorer-layout' }, side, main, details), status = OS.el('footer', { class: 'statusbar' });
            w.body.classList.add('transparent');
            w.body.append(tabs, cmd, nav, layout, status);
            const targetDir = () => path === 'home' ? '/Documents' : archiveActive ? OS.fs.parent(path) : path;
            const virtualSelection = (paths=[...selected],dir=targetDir()) => !dir.startsWith('/Local') && paths.every(p=>!p.startsWith('/Local/'));
            const importFiles = async (files,dir=targetDir()) => dir.startsWith('/Local/') ? OS.fs.import(files,dir) : OS.fileOps.execute({kind:'import',destination:dir,files:files.map(f=>({name:f.name,content:f,mime:f.type||OS.fs.mime(f.name)}))});
            const selectedRows = () => rows.filter(e => selected.has(e.path));
            const quickPreview=()=>{
                if(archiveActive)throw Error('Extract this file before previewing it.');
                const candidates=rows.filter(e=>e.kind==='file'&&!e.native&&AsterDesktopRefinementModels.virtualPath(e.path)).map(e=>e.path);
                const selectedPath=[...selected][0],index=candidates.indexOf(selectedPath);
                if(index<0)return;
                return OS.previewFiles(candidates,index,w);
            };

            const newItem = async (kind) => { const dir = targetDir(); if (dir === '/.Trash')
                throw Error('Create files outside the Recycle Bin.'); const name = await OS.prompt(kind === 'directory' ? 'New folder' : 'New text document', kind === 'directory' ? 'New folder' : 'Untitled.txt'); if (name === null)
                return; OS.fs.validateName(name); const p = OS.fs.join(dir, name); if (await OS.fs.stat(p))
                throw Error('This name is already in use.'); if (!dir.startsWith('/Local/')) await OS.fileOps.execute({kind:'create',destination:dir,name,directory:kind==='directory'});
            else if(kind==='directory') await OS.fs.mkdir(p); else await OS.fs.write(p,'','text/plain'); selected = new Set([p]); await render(); };
            const copy = cut => { if (!selected.size)
                return; OS.clipboard = { paths: [...selected], cut }; OS.notify(cut ? 'Ready to move' : 'Copied', `${selected.size} item${selected.size === 1 ? '' : 's'} on the Aster clipboard.`); updateCommandState(); };
            const paste = async () => {
                if (!OS.clipboard?.paths.length)
                    return;
                const clip = OS.clipboard, dir = targetDir();
                if (dir === '/.Trash')
                    throw Error('Use Delete to move items to the Recycle Bin.');
                if (clip.cut && clip.paths.some(p => OS.fs.native(p)) && !await OS.confirm('Move local files?', 'Moving removes the original local files after they are copied.', 'Move'))
                    return;
                if(virtualSelection(clip.paths,dir)){const outcome=await OS.fileOps.execute({kind:clip.cut?'move':'copy',paths:clip.paths,destination:dir});if(outcome.cancelled)return;if(clip.cut)OS.clipboard=outcome.skipped.length?{paths:outcome.skipped,cut:true}:null;selected=new Set(outcome.results);await render();return;}
                const result = [];
                for (const src of clip.paths) {
                    let dest = OS.fs.join(dir, OS.fs.name(src));
                    if (clip.cut && src === dest)
                        continue;
                    dest = await OS.fs.unique(dest);
                    await OS.fs.copy(src, dest, clip.cut);
                    result.push(dest);
                }
                if (clip.cut)
                    OS.clipboard = null;
                selected = new Set(result);
                await render();
            };
            const rename = async () => { if(selected.size>1){if(!virtualSelection())throw Error('Batch rename is available for virtual files only.');const result=await OS.fileOps.renameDialog([...selected]);if(!result.cancelled)selected=new Set(result.results);await render();return;} const [e] = selectedRows(); if (!e)
                return; const name = await OS.prompt('Rename', displayName(e)); if (name === null || name === displayName(e))
                return; OS.fs.validateName(name); const dest = OS.fs.join(OS.fs.parent(e.path), name); if(!e.native)await OS.fileOps.execute({kind:'rename',paths:[e.path],pairs:[{source:e.path,target:dest}],policy:'error'});else await OS.fs.copy(e.path,dest,true);selected = new Set([dest]); await render(); };
            const remove = async () => {
                const list = selectedRows();
                if (!list.length)
                    return;
                const permanent = path === '/.Trash' || list.some(e => e.native);
                if (permanent && !await OS.confirm('Delete permanently?', `Permanently delete ${list.length} selected item${list.length === 1 ? '' : 's'}? This cannot be undone. Local files will be removed from your actual folder.`, 'Delete', true))
                    return;
                if(!permanent&&virtualSelection()){await OS.fileOps.execute({kind:'trash',paths:list.map(e=>e.path)});selected.clear();await render();return;}
                const removed = [];
                for (const e of list) {
                    const result = await OS.fs.remove(e.path, permanent);
                    if (result)
                        removed.push(result);
                }
                selected.clear();
                await render();
                if (removed.length)
                    OS.notify('Moved to Recycle Bin', `${removed.length} item${removed.length === 1 ? '' : 's'}.`, 'info', { label: 'Undo', fn: async () => { for (const p of removed)
                            await OS.fs.restore(p); } });
            };
            const download = async () => { for (const e of selectedRows()) {
                if (e.kind === 'directory') {
                    OS.notify('Compress this folder first', 'Use Compress to ZIP file in the context menu, then download the ZIP.');
                    continue;
                }
                OS.download(await OS.fs.blob(await OS.fs.read(e.path)), displayName(e));
            } };
            const properties = async () => { const e=selectedRows()[0];if(e)await OS.showFileProperties(archiveActive?path:e.path); };
            async function extractCurrent() { if(!archiveActive)return;if(!await OS.confirm('Extract compressed folder?','Extract all entries beside this ZIP. The original archive is kept.','Extract all'))return;const dest=await OS.archives.extract(path,OS.fs.parent(path));if(!w.closed)navigate(dest); }
            const openSelection = () => { const e = selectedRows()[0]; if (e) {
                if(archiveActive){if(e.kind==='directory'){archivePrefix=e.zipName.replace(/\/$/,'')+'/';selected.clear();render();}else OS.notify('Extract this file first','Choose Extract all to work with files from this compressed folder.');return;}
                if (path === '/.Trash')
                    return OS.notify('Restore this item first', 'Right-click and choose Restore.');
                if (e.kind === 'directory')
                    navigate(e.path);
                else if(/\.zip$/i.test(e.path)&&!e.native) navigate(e.path);
                else
                    OS.guard(OS.openPath)(e.path);
            } };
            const createZip = async () => {const chosen=[...selected];if(!chosen.length)throw Error('Select files or folders to archive.');const dir=targetDir();const name=await OS.prompt('ZIP file name','Archive.zip');if(name===null)return;OS.fs.validateName(name);await OS.archives.create(chosen,OS.fs.join(dir,name.endsWith('.zip')?name:name+'.zip'));await render();};
            const context = (e, entry = null) => {
                if (entry && !selected.has(entry.path)) {
                    selected = new Set([entry.path]);
                    markSelection();
                }
                if(archiveActive){OS.context(e,[{text:'Open',icon:'folder',disabled:!selectedRows().length,action:openSelection},{text:'Extract all…',icon:'folder',action:extractCurrent},{text:'Archive properties',icon:'info',action:()=>OS.showFileProperties(path)}]);return;}
                const inTrash = path === '/.Trash', sel = selectedRows();
                OS.context(e, [
                    ...(!inTrash && sel.length===1 && sel[0].kind==='directory'?[{text:'Open in new tab',icon:'plus',action:()=>openTab(sel[0].path)}]:[]),
                    ...(!inTrash && sel.length?[{text:'Compress to ZIP file',icon:'folder',action:createZip}]:[]),
                    ...(!inTrash && sel.length===1 && /\.zip$/i.test(sel[0].path)?[{text:'Extract all…',icon:'folder',action:()=>OS.openCompressedFolder(sel[0].path,targetDir(),navigate)}]:[]),
                    ...(!inTrash && sel.length===1 && sel[0].kind==='file' && !sel[0].native?[{text:'Previous versions',icon:'undo',action:()=>OS.showFileProperties(sel[0].path,'versions')}]:[]),
                    ...(sel.length ? [{ text: inTrash ? 'Restore' : 'Open', icon: inTrash ? 'undo' : 'folder', action: async () => { if (inTrash) {
                                await OS.fileOps.execute({kind:'restore',paths:sel.map(f=>f.path)});
                            }
                            else
                                openSelection(); } }, ...(!inTrash && sel.length === 1 && sel[0].kind === 'file' ? [{ text: 'Open with…', icon: 'file', action: () => OS.showOpenWith(sel[0].path) }, {text:'Quick preview',icon:'eye',key:'Space',disabled:sel[0].native,action:quickPreview}] : []), null, { text: 'Cut', icon: 'cut', key: 'Ctrl+X', disabled: inTrash, action: () => copy(true) }, { text: 'Copy', icon: 'copy', key: 'Ctrl+C', disabled: inTrash, action: () => copy(false) }, { text: 'Rename', icon: 'rename', key: 'F2', disabled: !sel.length || inTrash || sel.length>1&&!virtualSelection(), action: rename }, { text: inTrash ? 'Delete permanently' : 'Delete', icon: 'trash', key: 'Del', danger: true, action: remove }, { text: 'Download', icon: 'download', action: download }, null, { text: 'Properties', icon: 'info', action: properties }] : [
                        { text: 'New folder', icon: 'folder', disabled: inTrash, action: () => newItem('directory') }, { text: 'New text document', icon: 'file', disabled: inTrash, action: () => newItem('file') }, { text: 'Paste', icon: 'paste', disabled: !OS.clipboard || inTrash, action: paste }, { text: 'Refresh', icon: 'refresh', action: render }, { text: 'Open in Terminal', icon: 'terminal', action: () => OS.launch('terminal', { cwd: targetDir() }) }
                    ])
                ]);
            };
            const newButton = OS.el('button', { html: OS.icon('plus', 18) + '<span class="cmd-text">New</span>' + OS.icon('down', 12), onclick: e => OS.context(e, [{ text: 'Folder', icon: 'folder', action: () => newItem('directory') }, { text: 'Text document', icon: 'file', action: () => newItem('file') }]) });
            const undoB=button('undo','Undo file operation',()=>OS.fileOps.undo()),redoB=button('redo','Redo file operation',()=>OS.fileOps.redo());
            const cutB = button('cut', 'Cut', () => copy(true)), copyB = button('copy', 'Copy', () => copy(false)), pasteB = button('paste', 'Paste', paste), renameB = button('rename', 'Rename', rename), deleteB = button('trash', 'Delete', remove), downloadB = button('download', 'Download selected files', download);
            const sortB = OS.el('button', { html: OS.icon('list', 17) + '<span class="cmd-text">Sort</span>' + OS.icon('down', 11), onclick: e => OS.context(e, [...['name', 'modified', 'type', 'size'].map(s => ({ text: (sort === s ? '✓ ' : '') + s[0].toUpperCase() + s.slice(1), action: () => { sort = s; render(); } })), null, { text: asc ? 'Descending order' : 'Ascending order', action: () => { asc = !asc; render(); } }]) });
            const viewB = OS.el('button', { html: OS.icon('grid', 17) + '<span class="cmd-text">View</span>' + OS.icon('down', 11), onclick: e => OS.context(e, [{ text: 'Details', icon: 'list', action: () => { view = 'list'; w.state.view = view; render(); } }, { text: 'Large icons', icon: 'grid', action: () => { view = 'grid'; w.state.view = view; render(); } }, { text: 'Toggle details pane', icon: 'taskview', action: () => { details.hidden = !details.hidden; } }]) });
            const extractB=OS.el('button',{class:'extract-command',text:'Extract all',hidden:true,onclick:OS.guard(()=>archiveActive?extractCurrent():OS.openCompressedFolder([...selected][0],targetDir(),navigate))});
            const moreB = button('more', 'More actions', e => { }, 'icon-button');
            moreB.onclick = e => OS.context(e, [{text:'Undo '+OS.fileOps.undoLabel,icon:'undo',key:'Ctrl+Z',disabled:!OS.fileOps.canUndo,action:()=>OS.fileOps.undo()},{text:'Redo '+OS.fileOps.redoLabel,icon:'redo',key:'Ctrl+Y',disabled:!OS.fileOps.canRedo,action:()=>OS.fileOps.redo()},{text:'File operations',icon:'copy',action:()=>OS.fileOps.show()},null,{text:'Compress to ZIP file',icon:'folder',disabled:archiveActive||!selected.size||path==='/.Trash',action:createZip},{text:'New folder tab',icon:'plus',action:()=>openTab(path)},{ text: 'Import files', icon: 'upload', disabled:archiveActive, action: async () => { const f = await OS.readFile('', true); if (f.length)
                        await importFiles(f, targetDir()); } }, { text: 'Connect local folder', icon: 'folder', action: async () => navigate(await OS.fs.mount()) }, { text: 'Open in Terminal', icon: 'terminal', action: () => OS.launch('terminal', { cwd: targetDir() }) }, null, { text: 'Empty Recycle Bin', icon: 'trash', danger: true, action: async () => { if (await OS.confirm('Empty Recycle Bin?', 'All items in the virtual Recycle Bin will be permanently deleted.', 'Empty', true)) {
                        for (const f of await OS.fs.list('/.Trash'))
                            await OS.fs.remove(f.path, true);
                        void OS.themes?.playSound('EmptyRecycleBin');
                    } } }, { text: 'Properties', icon: 'info', disabled: !selected.size, action: properties }]);
            cmd.append(newButton, OS.el('span', { class: 'divider' }), undoB, redoB, cutB, copyB, pasteB, renameB, downloadB, deleteB, OS.el('span', { class: 'divider' }), sortB, viewB, extractB, OS.el('span', { class: 'spacer' }), moreB);
            const back = button('back', 'Back', () => { if (historyIndex > 0) {
                historyIndex--;
                path = history[historyIndex];
                query = '';
                search.value = '';
                selected.clear();
                render();
            } }, 'icon-button'), forward = button('forward', 'Forward', () => { if (historyIndex < history.length - 1) {
                path = history[++historyIndex];
                query = '';
                search.value = '';
                selected.clear();
                render();
            } }, 'icon-button'), up = button('up', 'Up', () => { if (path !== 'home')
                {if(archiveActive&&archivePrefix){archivePrefix=archivePrefix.replace(/[^/]+\/$/,'');selected.clear();render();}else navigate(OS.fs.parent(path));} }, 'icon-button'), refresh = button('refresh', 'Refresh', () => render(), 'icon-button'), crumbs = OS.el('div', { class: 'breadcrumbs' }), search = OS.el('input', { class: 'folder-search', placeholder: 'Search Home', 'aria-label': 'Search this folder' });
            search.value=query;search.title='Search by name, kind:image, ext:txt, or size:>1mb';
            search.oninput = () => { query = search.value; stashTab(); OS.saveSession(); renderMain(); };
            crumbs.ondblclick = OS.guard(async () => { const p = await OS.prompt('Go to folder', path === 'home' ? '/' : path); if (p !== null) {
                if (p.toLowerCase() === 'home')
                    navigate('home');
                else {
                    const normalized = OS.fs.normalize(p);
                    if ((await OS.fs.stat(normalized))?.kind !== 'directory')
                        throw Error('Folder not found.');
                    navigate(normalized);
                }
            } });
            nav.append(back, forward, up, refresh, crumbs, search);
            function updateCommandState() {undoB.disabled=!OS.fileOps.canUndo;redoB.disabled=!OS.fileOps.canRedo; extractB.hidden=!(archiveActive || selected.size===1 && /\.zip$/i.test([...selected][0]) && path!=='/.Trash');newButton.disabled=archiveActive;cutB.disabled = copyB.disabled = renameB.disabled = deleteB.disabled = downloadB.disabled = archiveActive||!selected.size; renameB.disabled = archiveActive||!selected.size||selected.size>1&&!virtualSelection(); pasteB.disabled = archiveActive||!OS.clipboard; }
            function markSelection() { for (const item of OS.$$('[data-path]', main)) {
                item.classList.toggle('selected', selected.has(item.dataset.path));
                item.setAttribute('aria-selected', String(selected.has(item.dataset.path)));
            } updateCommandState(); status.textContent = `${rows.length} item${rows.length === 1 ? '' : 's'}${selected.size ? '  ·  ' + selected.size + ' selected' : ''}  ${path.startsWith('/Local/') ? '·  Connected local folder' : '·  Browser-local storage'}`; renderDetails(); }
            function select(e, entry) { if (e.shiftKey && anchor) {
                const start = rows.findIndex(r => r.path === anchor), end = rows.findIndex(r => r.path === entry.path);
                if (start >= 0 && end >= 0)
                    for (let i = Math.min(start, end); i <= Math.max(start, end); i++)
                        selected.add(rows[i].path);
            }
            else if (e.ctrlKey || e.metaKey) {
                selected.has(entry.path) ? selected.delete(entry.path) : selected.add(entry.path);
            }
            else
                selected = new Set([entry.path]); anchor = entry.path; markSelection(); main.focus({ preventScroll: true }); }
            function wireRow(el, entry) { el.dataset.path = entry.path; el.setAttribute('aria-selected', String(selected.has(entry.path))); el.onclick = e => { e.stopPropagation(); select(e, entry); }; el.ondblclick = () => { selected = new Set([entry.path]); openSelection(); }; el.oncontextmenu = e => context(e, entry); el.draggable = !archiveActive&&path !== '/.Trash'; el.ondragstart = e => { if (!selected.has(entry.path)) {
                selected = new Set([entry.path]);
                markSelection();
            } e.dataTransfer.setData('application/x-aster-paths', JSON.stringify([...selected])); e.dataTransfer.effectAllowed = 'copyMove'; }; if (!archiveActive && entry.kind === 'directory') {
                el.ondragover = e => { e.preventDefault(); e.stopPropagation(); el.classList.add('selected'); };
                el.ondragleave = () => markSelection();
                el.ondrop = OS.guard(async (e) => { e.preventDefault(); e.stopPropagation(); await drop(e, entry.path); });
            } return el; }
            async function renderDetails() {
                const e = selectedRows()[0], currentDetail=++detailToken;
                if(previewURL){URL.revokeObjectURL(previewURL);previewURL='';}
                details.replaceChildren();
                if (!e) {
                    details.innerHTML = `<div class="detail-preview">${OS.icon('taskview', 56)}</div><h3>A little more detail</h3><p class="muted" style="font-size:11px;line-height:1.7">Select a file to see its information.<br>Press Space for Quick Preview.</p><div class="spacer"></div><span class="pill">${OS.icon('shield', 12)} Local-first, always</span>`;
                    return;
                }
                details.innerHTML = `<div class="detail-preview">${OS.fileIcon(e, 64)}</div><h3 style="word-break:break-word">${esc(displayName(e))}</h3><span class="muted" style="font-size:11px">${esc(fileType(e))}</span><dl class="detail-info"><dt>Location</dt><dd>${esc(OS.fs.parent(e.originalPath || e.path))}</dd><dt>Modified</dt><dd>${e.modified ? esc(new Date(e.modified).toLocaleString()) : '—'}</dd><dt>Size</dt><dd>${e.kind === 'directory' ? 'Folder' : OS.formatBytes(e.size)}</dd><dt>Stored in</dt><dd>${e.native ? 'Your connected local folder' : 'This browser'}</dd></dl>`;
                if(archiveActive){details.append(OS.el('p',{class:'integration-note',text:'Inside a compressed folder. Extract all to edit or open its files.'}));return;}
                if (e.kind === 'file' && e.mime?.startsWith('image/') && (e.size || 0) < 20e6) {
                    try {
                        const url = URL.createObjectURL(await OS.fs.blob(await OS.fs.read(e.path)));
                        if(currentDetail!==detailToken||w.closed){URL.revokeObjectURL(url);return;}
                        previewURL=url;
                        if (selected.has(e.path)) {
                            const preview = $('.detail-preview', details);
                            preview?.replaceChildren(OS.el('img', { src: url, alt: displayName(e) }));
                        }
                    }
                    catch { }
                }
                else if(e.kind==='file' && (e.size||0)<=256000 && (/^text\//.test(e.mime||'') || /\.(txt|md|json|csv|js|css)$/i.test(e.path))) {
                    try {const text=await OS.fs.text(await OS.fs.read(e.path));if(currentDetail!==detailToken||w.closed)return;details.append(OS.el('pre',{class:'explorer-text-preview',text:text.slice(0,8000)}));}catch{}
                }
                if(currentDetail!==detailToken||w.closed)return;
                if(!e.native && e.kind==='file' && !e.path.startsWith('/.')) details.append(OS.el('button',{class:'secondary',text:'Previous versions',onclick:()=>OS.showFileProperties(e.path,'versions')}));
                details.append(OS.el('button',{class:'secondary',text:OS.fileFavorites.includes(e.path)?'Unpin favorite':'Pin to favorites',onclick:OS.guard(async()=>{OS.fileFavorites=OS.fileFavorites.includes(e.path)?OS.fileFavorites.filter(p=>p!==e.path):[e.path,...OS.fileFavorites].slice(0,30);await OS.db.set('file-favorites',OS.fileFavorites);OS.emit('favorites-change');})}));
            }
            function table(entries) { const table = OS.el('table', { class: 'file-table', role: 'grid', 'aria-label': 'Files' }), head = OS.el('thead'), tr = OS.el('tr'); for (const [name, key] of [['Name', 'name'], ['Date modified', 'modified'], ['Type', 'type'], ['Size', 'size']]) {
                const th = OS.el('th', { scope: 'col', 'aria-sort': sort === key ? (asc ? 'ascending' : 'descending') : 'none' });
                const b = OS.el('button', { title: name, 'aria-label': 'Sort by ' + name, text: name + (sort === key ? (asc ? ' ↑' : ' ↓') : ''), onclick: () => { if (sort === key)
                        asc = !asc;
                    else {
                        sort = key;
                        asc = true;
                    } renderMain(); } });
                th.append(b);
                tr.append(th);
            } head.append(tr); const body = OS.el('tbody'); for (const e of entries) {
                const row = OS.el('tr', { class: 'file-row' + (selected.has(e.path) ? ' selected' : ''), role: 'row' });
                row.innerHTML = `<td><div class="file-name">${OS.fileIcon(e, 25)}<span>${esc(displayName(e))}</span></div></td><td class="muted">${e.modified ? esc(OS.date(new Date(e.modified))) : '—'}</td><td class="muted">${esc(fileType(e))}</td><td class="muted">${e.kind === 'directory' ? '' : OS.formatBytes(e.size)}</td>`;
                wireRow(row, e);
                body.append(row);
            } table.append(head, body); return table; }
            async function renderCompressed(myToken) {
                if (!/\.zip$/i.test(path) || path.startsWith('/Local/')) return false;
                const file=await OS.fs.stat(path);if(file?.kind!=='file')return false;
                if(file.size>AsterZIP.LIMIT+1024*1024)throw Error('ZIP is too large.');
                if(!archiveCache||archiveCache.path!==path||archiveCache.modified!==file.modified){
                    const bytes=await(await OS.fs.blob(await OS.fs.read(path))).arrayBuffer();
                    const parsed=AsterZIP.inspect(bytes);if(myToken!==token||w.closed)return true;
                    archiveCache={path,modified:file.modified,parsed};
                }
                if(myToken!==token||w.closed)return true;archiveActive=true;
                const all=archiveCache.parsed.entries;
                if(archivePrefix&&!all.some(e=>e.name.startsWith(archivePrefix)))archivePrefix='';
                const listing=new Map();
                for(const entry of all){
                    if(!entry.name.startsWith(archivePrefix))continue;
                    const remainder=entry.name.slice(archivePrefix.length);if(!remainder)continue;
                    const name=remainder.split('/')[0],directory=remainder.includes('/')||entry.directory;
                    if(listing.has(name)&&listing.get(name).kind==='directory')continue;
                    listing.set(name,{path:path+'/'+archivePrefix+name,zipName:archivePrefix+name,kind:directory?'directory':'file',mime:'application/octet-stream',size:entry.length,modified:file.modified});
                }
                rows=[...listing.values()].filter(e=>OS.fileQueryMatches(e,query)).sort((a,b)=>{const order=(a.kind===b.kind?0:a.kind==='directory'?-1:1)||(sort==='size'?a.size-b.size:displayName(a).localeCompare(displayName(b)));return asc?order:-order;});
                main.replaceChildren(OS.el('div',{class:'compressed-folder-banner'},OS.el('span',{html:OS.icon('folder',22)}),OS.el('div',{class:'grow'},OS.el('strong',{text:'Compressed folder'}),OS.el('small',{text:'Read-only archive contents. Extract to open or edit files.'}))));
                if(rows.length)main.append(table(rows));else main.append(OS.el('div',{class:'empty',text:query?'No matching entries':'This compressed folder is empty.'}));
                crumbs.querySelectorAll('[data-zip-crumb]').forEach(e=>e.remove());
                if(archivePrefix){let prefix='';for(const part of archivePrefix.split('/').filter(Boolean)){prefix+=part+'/';const dest=prefix;crumbs.append(OS.el('span',{'data-zip-crumb':'',html:OS.icon('forward',11)}),OS.el('button',{'data-zip-crumb':'',text:part,onclick:()=>{archivePrefix=dest;selected.clear();render();}}));}}
                markSelection();status.textContent=rows.length+' entries · Compressed folder · '+OS.formatBytes(archiveCache.parsed.total)+' expanded';stashTab();return true;
            }
            async function renderMain() {
                const myToken = ++token;archiveActive=false;
                if(await renderCompressed(myToken))return;archiveCache=null;archivePrefix='';
                let entries;
                if (path === 'home') {
                    const defaults = ['/Documents/Welcome to Aster.md', '/Documents/Ideas.txt', '/Projects/Hello Aster.html', '/Pictures/Blue hour.svg'];
                    entries = (await Promise.all([...new Set([...OS.recent, ...defaults])].slice(0, 10).map(p => OS.fs.stat(p).catch(() => null)))).filter(Boolean);
                }
                else
                    entries = await OS.fs.list(path);
                if (myToken !== token || w.closed)
                    return;
                entries = entries.filter(e => path === '/.Trash' || !OS.fs.name(e.path).startsWith('.'));
                if (query)
                    entries = entries.filter(e => OS.fileQueryMatches(e, query));
                rows = entries.sort((a, b) => { let n = (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1); if (!n) {
                    if (sort === 'name')
                        n = displayName(a).localeCompare(displayName(b), undefined, { numeric: true });
                    else if (sort === 'modified')
                        n = (a.modified || 0) - (b.modified || 0);
                    else if (sort === 'size')
                        n = (a.size || 0) - (b.size || 0);
                    else
                        n = fileType(a).localeCompare(fileType(b));
                } return n * (asc ? 1 : -1); });
                urls.forEach(URL.revokeObjectURL);
                urls = [];
                main.replaceChildren();
                if (path === 'home' && !query) {
                    const banner = OS.el('div', { class: 'explorer-banner', html: OS.appIcon('welcome', 37) + `<div class="grow"><strong>Welcome home, ${esc(OS.settings.username.split(' ')[0])}.</strong><p>Your files, your ideas, your own little universe.</p></div>` });
                    const learn = OS.el('button', { title: 'Explore Aster', 'aria-label': 'Explore Aster', html: OS.icon('forward', 16), onclick: () => OS.launch('welcome') });
                    banner.append(learn);
                    main.append(banner, OS.el('div', { class: 'section-heading', html: `<span>${OS.icon('star', 15)} &nbsp;Quick access</span><span class="muted" style="font-size:10px;font-weight:400">Pinned folders</span>` }));
                    const quick = OS.el('div', { class: 'quick-access' });
                    for (const [name, desc] of [['Desktop', 'Your workspace'], ['Downloads', 'Recent imports'], ['Documents', 'Notes & documents'], ['Pictures', 'Your gallery'], ['Music', 'Listen a little'], ['Projects', 'Make something']]) {
                        quick.append(OS.el('button', { class: 'folder-card', html: OS.appIcon('files', 39) + `<div><strong>${name}</strong><small>${desc}</small></div>`, onclick: () => navigate('/' + name) }));
                    }
                    main.append(quick, OS.el('div', { class: 'section-heading', html: `<span>${OS.icon('clock', 15)} &nbsp;Recent</span><span class="muted" style="font-size:10px;font-weight:400">On this device</span>` }));
                }
                if (!rows.length) {
                    main.append(OS.el('div', { class: 'empty', html: OS.icon(path === '/.Trash' ? 'trash' : 'folder', 45) + `<strong>${query ? 'No matching files' : path === '/.Trash' ? 'The Recycle Bin is empty' : 'This folder is empty'}</strong><span>${query ? 'Try a different search.' : path === '/Local' ? 'Use ⋯ → Connect local folder to open a real folder.' : 'Drop files here, or choose New to get started.'}</span>` }));
                }
                else if (view === 'list' || path === 'home')
                    main.append(table(rows));
                else {
                    const grid = OS.el('div', { class: 'file-grid', role: 'grid', 'aria-label': 'Files' });
                    main.append(grid);
                    for (const e of rows) {
                        const tile = wireRow(OS.el('div', { class: 'file-tile' + (selected.has(e.path) ? ' selected' : ''), role: 'row', html: OS.fileIcon(e, 52) + `<span>${esc(displayName(e))}</span>` }), e);
                        grid.append(tile);
                        if (e.mime?.startsWith('image/') && (e.size || 0) < 10e6) {
                            OS.fs.read(e.path).then(OS.fs.blob.bind(OS.fs)).then(blob => { if (myToken !== token)
                                return; const url = URL.createObjectURL(blob); urls.push(url); tile.firstElementChild?.replaceWith(OS.el('img', { class: 'thumb', src: url, alt: '' })); }).catch(() => { });
                        }
                    }
                }
                markSelection();
            }
            async function render() {
                w.state.path = path;
                w.setTitle((path === 'home' ? 'Home' : path === '/.Trash' ? 'Recycle Bin' : OS.fs.name(path)) + ' — File Explorer');
                stashTab();renderTabs();
                back.disabled = historyIndex === 0;
                forward.disabled = historyIndex === history.length - 1;
                up.disabled = path === 'home' || path === '/';
                search.placeholder = 'Search ' + (path === 'home' ? 'Home' : path === '/.Trash' ? 'Recycle Bin' : OS.fs.name(path));
                crumbs.replaceChildren();
                if (path === 'home') {
                    crumbs.append(OS.el('button', { html: OS.icon('home', 15) + '<span>Home</span>', onclick: () => navigate('home') }));
                }
                else {
                    crumbs.append(OS.el('button', { html: OS.icon('desktop', 15), title: 'Aster drive', onclick: () => navigate('/') }));
                    const parts = path.split('/').filter(Boolean);
                    let p = '';
                    for (const part of parts) {
                        p += '/' + part;
                        const dest = p;
                        crumbs.append(OS.el('span', { html: OS.icon('forward', 11) }), OS.el('button', { text: part === '.Trash' ? 'Recycle Bin' : part, onclick: () => navigate(dest) }));
                    }
                }
                side.replaceChildren();
                for (const [name, dest, icon] of [['Home', 'home', 'home'], ['Gallery', '/Pictures', 'image']])
                    side.append(navItem(name, dest, icon));
                side.append(OS.el('div', { class: 'separator' }));
                if(OS.fileFavorites.length){side.append(OS.el('div',{class:'menu-label',text:'Favorites'}));for(const dest of OS.fileFavorites)side.append(OS.el('button',{class:'nav-item',text:OS.fs.name(dest),onclick:OS.guard(async()=>{const f=await OS.fs.stat(dest);if(!f)throw Error('Favorite no longer exists. Unpin it from its folder or reset favorites.');if(f.kind==='directory')navigate(dest);else OS.openPath(dest);}),oncontextmenu:e=>OS.context(e,[{text:'Unpin favorite',action:async()=>{OS.fileFavorites=OS.fileFavorites.filter(p=>p!==dest);await OS.db.set('file-favorites',OS.fileFavorites);OS.emit('favorites-change');}}])}));}

                for (const [name, icon] of [['Desktop', 'desktop'], ['Downloads', 'download'], ['Documents', 'file'], ['Pictures', 'image'], ['Music', 'music'], ['Videos', 'video'], ['Projects', 'code']])
                    side.append(navItem(name, '/' + name, icon, true));
                side.append(OS.el('div', { class: 'separator' }), navItem('This PC', '/', 'desktop'), navItem('Local folders', '/Local', 'folder'));
                for (const name of OS.mounts.keys())
                    side.append(navItem(name, '/Local/' + name, 'folder'));
                side.append(OS.el('div', { class: 'separator' }), navItem('Recycle Bin', '/.Trash', 'trash'));
                await renderMain();
                OS.saveSession();
            }
            function navItem(name, dest, icon, pin = false) { return OS.el('button', { class: 'nav-item' + (path === dest ? ' active' : ''), html: OS.icon(icon, 17) + `<span>${esc(name)}</span>` + (pin ? OS.icon('pin', 11, 'nav-pin') : ''), onclick: () => navigate(dest) }); }
            function navigate(dest) { archivePrefix='';path = dest; history = history.slice(0, historyIndex + 1); history.push(dest); historyIndex++; selected.clear(); query = ''; search.value = ''; OS.guard(render)(); }
            async function drop(e, dir = targetDir()) { if(archiveActive)throw Error('Extract the compressed folder before adding files.');const nativeFiles = Array.from(e.dataTransfer.files); if (nativeFiles.length) {
                await importFiles(nativeFiles, dir);
                OS.notify('Files imported', `${nativeFiles.length} file${nativeFiles.length === 1 ? '' : 's'} added to ${OS.fs.name(dir)}.`);
            }
            else {
                const data = e.dataTransfer.getData('application/x-aster-paths');
                if (data) {
                    const sources=JSON.parse(data);if(!Array.isArray(sources)||sources.length>4096||sources.some(p=>typeof p!=='string'))throw Error('Invalid dropped paths.');
                    if(virtualSelection(sources,dir))await OS.fileOps.execute({kind:e.ctrlKey?'copy':'move',paths:sources,destination:dir});
                    else for (const src of sources) {const dest=await OS.fs.unique(OS.fs.join(dir,OS.fs.name(src)));await OS.fs.copy(src,dest,false);}
                }
            } await render(); }
            main.addEventListener('contextmenu', e => { if (!e.target.closest('[data-path]')) {
                selected.clear();
                markSelection();
                context(e);
            } });
            main.addEventListener('click', e => { if (!e.target.closest('[data-path],button')) {
                selected.clear();
                markSelection();
            } });
            main.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey||e.dataTransfer.types.includes('Files')?'copy':'move'; });
            main.addEventListener('drop', OS.guard(e => { e.preventDefault(); return drop(e); }));
            w.onKey = e => {
                if((e.ctrlKey||e.metaKey)&&['t','w','Tab'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='t')openTab(path);else if(e.key==='w')closeTab(activeTab);else switchTab((activeTab+(e.shiftKey?fileTabs.length-1:1))%fileTabs.length);return;}
                if(archiveActive && (['Delete','F2'].includes(e.key)||(e.ctrlKey||e.metaKey)&&['c','x','v'].includes(e.key.toLowerCase()))){e.preventDefault();return;}
                if (/INPUT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable)
                return; if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();OS.guard(()=>e.key.toLowerCase()==='y'||e.shiftKey?OS.fileOps.redo():OS.fileOps.undo())();return;} if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'x', 'v'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                switch (e.key.toLowerCase()) {
                    case 'a':
                        selected = new Set(rows.map(r => r.path));
                        markSelection();
                        break;
                    case 'c':
                        copy(false);
                        break;
                    case 'x':
                        copy(true);
                        break;
                    case 'v':
                        OS.guard(paste)();
                        break;
                }
            }
            else if(e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey){e.preventDefault();e.stopPropagation();OS.guard(quickPreview)();}
            else if (e.key === 'Delete') {
                e.preventDefault();
                OS.guard(remove)();
            }
            else if (e.key === 'F2') {
                e.preventDefault();
                OS.guard(rename)();
            }
            else if (e.altKey && e.key === 'Enter') {
                e.preventDefault(); OS.guard(()=>properties([...selected][0]||path))();
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                openSelection();
            }
            else if (e.altKey && e.key === 'ArrowUp') {
                e.preventDefault();
                up.click();
            }
            else if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                e.preventDefault();
                const index = rows.findIndex(r => selected.has(r.path)), next = rows[Math.max(0, Math.min(rows.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))];
                if (next) {
                    selected = new Set([next.path]);
                    markSelection();
                    OS.$$('[data-path]', main).find(el => el.dataset.path === next.path)?.scrollIntoView({ block: 'nearest' });
                }
            } };
            w.on('fs-change', () => { clearTimeout(w.refreshTimer); w.refreshTimer = setTimeout(() => OS.guard(render)(), 80); });
            w.on('settings', () => renderDetails());
            w.on('file-operations',updateCommandState);
            w.on('favorites-change',()=>OS.guard(render)());
            w.addCleanup(() => { archiveCache=null;detailToken++;if(previewURL)URL.revokeObjectURL(previewURL);urls.forEach(URL.revokeObjectURL); clearTimeout(w.refreshTimer); });
            w.navigate = navigate;
            w.refresh = render;
            await render();
        }
    });
    OS.markdown = text => {
        let source = esc(text);
        const blocks = [];
        source = source.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => { blocks.push('<pre><code>' + code + '</code></pre>'); return '\n@@BLOCK' + (blocks.length - 1) + '@@\n'; });
        const inline = t => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
        let list = false;
        const lines = source.split('\n').map(line => { let pre = ''; if (!/^[-*] /.test(line) && list) {
            pre = '</ul>';
            list = false;
        } if (/^@@BLOCK\d+@@$/.test(line))
            return pre + blocks[Number(line.match(/\d+/)[0])]; if (/^#{1,6} /.test(line)) {
            const n = line.match(/^#+/)[0].length;
            return pre + `<h${n}>${inline(line.slice(n + 1))}</h${n}>`;
        } if (/^[-*] /.test(line)) {
            const start = list ? '' : '<ul>';
            list = true;
            return start + '<li>' + inline(line.slice(2)) + '</li>';
        } return pre + (line.trim() ? '<p>' + inline(line) + '</p>' : ''); });
        return lines.join('\n') + (list ? '</ul>' : '');
    };
    OS.register('notepad', { title: 'Notepad', description: 'A quiet place for words, notes, and code.', category: 'Essentials', width: 790, height: 575, minWidth: 360,
        mount: async (w, options) => {
            let path = options.path || w.state.path || null, wrap = w.state.wrap ?? true, previewMode = false, zoom = w.state.zoom || 14;
            const menu = OS.el('div', { class: 'menu-bar' }), find = OS.el('div', { class: 'editor-find', hidden: true }), editor = OS.el('textarea', { class: 'notepad-editor' + (wrap ? ' wrap' : ''), spellcheck: 'false', 'aria-label': 'Document editor' }), preview = OS.el('article', { class: 'markdown-preview', hidden: true }), status = OS.el('footer', { class: 'statusbar' });
            w.body.append(menu, find, editor, preview, status);
            editor.style.fontSize = zoom + 'px';
            let savedText = '';
            if (w.state.dirty && typeof w.state.text === 'string') {
                editor.value = w.state.text;
                w.dirty = true;
            }
            else if (path) {
                const f = await OS.fs.read(path);
                if ((f.size || 0) > 20e6)
                    throw Error('This file is larger than the 20 MB text editor limit.');
                editor.value = await OS.fs.text(f);
                savedText = editor.value;
            }
            else
                editor.value = w.state.text || '';
            const update = () => {
                const value = editor.value, before = value.slice(0, editor.selectionStart), line = before.split('\n').length, col = before.length - before.lastIndexOf('\n');
                const words = value.trim() ? value.trim().split(/\s+/).length : 0;
                status.innerHTML = `<span>Ln ${line}, Col ${col}</span><span>${value.length.toLocaleString()} characters</span><span>${words} words</span><span class="spacer"></span><span>${Math.round(zoom / 14 * 100)}%</span><span>UTF-8</span><span>${path?.startsWith('/Local/') ? 'Local folder' : 'Browser storage'}</span>`;
                w.setTitle((w.dirty ? '● ' : '') + (path ? OS.fs.name(path) : 'Untitled') + ' — Notepad');
                w.state.path = path;
                w.state.text = value;
                w.state.dirty = !!w.dirty;
                w.state.zoom = zoom;
                w.state.wrap = wrap;
                OS.saveSession();
            };
            editor.oninput = () => { w.dirty = editor.value !== savedText; if (previewMode)
                preview.innerHTML = OS.markdown(editor.value); update(); };
            editor.onkeyup = editor.onclick = update;
            editor.onselect = () => { update(); };
            const save = async (as = false) => {
                let dest = path;
                if (!dest || as) {
                    dest = await OS.prompt('Save document', path || '/Documents/Untitled.txt', 'Choose a path in Aster. Paths under /Local write to your connected real folder.');
                    if (dest === null)
                        return false;
                    dest = OS.fs.normalize(dest);
                    if (dest !== path && await OS.fs.stat(dest) && !await OS.confirm('Replace this file?', dest + ' already exists. Saving will replace its contents.', 'Replace'))
                        return false;
                }
                await OS.fs.write(dest, editor.value, OS.fs.mime(dest));
                path = dest;
                savedText = editor.value;
                w.dirty = false;
                update();
                OS.notify('Document saved', OS.fs.name(path));
                return true;
            };
            const canReplace = async () => !w.dirty || await OS.confirm('Discard unsaved changes?', 'Save first with Ctrl+S to keep your current changes.', 'Discard', true);
            const open = async () => { if (!await canReplace())
                return; const p = await OS.prompt('Open document', path || '/Documents/Welcome to Aster.md', 'Enter a path in the Aster file system.'); if (p === null)
                return; const file = await OS.fs.read(OS.fs.normalize(p)); if (file.kind !== 'file')
                throw Error('Select a file, not a folder.'); if ((file.size || 0) > 20e6)
                throw Error('File is larger than the 20 MB editor limit.'); editor.value = await OS.fs.text(file); path = file.path; savedText = editor.value; w.dirty = false; update(); };
            const importText = async () => { if (!await canReplace())
                return; const [file] = await OS.readFile('.txt,.md,.html,.htm,.js,.css,.json,.csv,.xml,.log,.svg'); if (!file)
                return; if (file.size > 20e6)
                throw Error('File is larger than the 20 MB editor limit.'); editor.value = await file.text(); path = null; savedText = ''; w.dirty = true; update(); };
            const findInput = OS.el('input', { placeholder: 'Find in document', 'aria-label': 'Find text' }), replaceInput = OS.el('input', { placeholder: 'Replace with', 'aria-label': 'Replace text' });
            const findNext = () => { const needle = findInput.value; if (!needle)
                return; const start = editor.selectionEnd, index = editor.value.toLowerCase().indexOf(needle.toLowerCase(), start); const i = index < 0 ? editor.value.toLowerCase().indexOf(needle.toLowerCase()) : index; if (i < 0) {
                OS.notify('No matches', needle);
                return;
            } editor.focus(); editor.setSelectionRange(i, i + needle.length); update(); };
            const replace = () => { const needle = findInput.value; if (!needle)
                return; if (editor.value.slice(editor.selectionStart, editor.selectionEnd).toLowerCase() === needle.toLowerCase()) {
                editor.setRangeText(replaceInput.value, editor.selectionStart, editor.selectionEnd, 'end');
                editor.oninput();
            } findNext(); };
            const replaceAll = () => { const needle = findInput.value; if (!needle)
                return; const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); let count = 0; editor.value = editor.value.replace(new RegExp(escaped, 'gi'), () => { count++; return replaceInput.value; }); editor.oninput(); OS.notify('Replace all', `${count} replacement${count === 1 ? '' : 's'}.`); };
            find.append(findInput, replaceInput, OS.el('button', { text: 'Next', onclick: findNext }), OS.el('button', { text: 'Replace', onclick: replace }), OS.el('button', { text: 'All', onclick: replaceAll }), button('close', 'Close find', () => { find.hidden = true; editor.focus(); }));
            findInput.onkeydown = e => { if (e.key === 'Enter') {
                e.preventDefault();
                findNext();
            } };
            const togglePreview = () => { previewMode = !previewMode; preview.hidden = !previewMode; editor.hidden = previewMode; if (previewMode)
                preview.innerHTML = OS.markdown(editor.value); };
            const fileMenu = OS.el('button', { text: 'File', onclick: e => OS.context(e, [{ text: 'New window', icon: 'plus', key: 'Ctrl+N', action: () => OS.launch('notepad') }, { text: 'Open…', icon: 'folder', key: 'Ctrl+O', action: open }, { text: 'Import from computer…', icon: 'upload', action: importText }, null, { text: 'Save', icon: 'save', key: 'Ctrl+S', action: () => save() }, { text: 'Save as…', icon: 'save', key: 'Ctrl+Shift+S', action: () => save(true) }, { text: 'Download a copy', icon: 'download', action: () => OS.download(new Blob([editor.value], { type: 'text/plain' }), path ? OS.fs.name(path) : 'Untitled.txt') }, null, { text: 'Close', icon: 'close', action: () => w.close() }]) });
            const editMenu = OS.el('button', { text: 'Edit', onclick: e => OS.context(e, [{ text: 'Undo', icon: 'undo', key: 'Ctrl+Z', action: () => { editor.focus(); document.execCommand('undo'); } }, { text: 'Redo', icon: 'redo', key: 'Ctrl+Y', action: () => { editor.focus(); document.execCommand('redo'); } }, null, { text: 'Find and replace', icon: 'search', key: 'Ctrl+F', action: () => { find.hidden = false; findInput.focus(); } }, { text: 'Select all', icon: 'file', key: 'Ctrl+A', action: () => { editor.focus(); editor.select(); } }, { text: 'Insert date and time', icon: 'clock', key: 'F5', action: () => { editor.setRangeText(new Date().toLocaleString(), editor.selectionStart, editor.selectionEnd, 'end'); editor.oninput(); } }]) });
            const viewMenu = OS.el('button', { text: 'View', onclick: e => OS.context(e, [{ text: (wrap ? '✓ ' : '') + 'Word wrap', action: () => { wrap = !wrap; editor.classList.toggle('wrap', wrap); update(); } }, { text: 'Zoom in', icon: 'plus', action: () => { zoom = Math.min(34, zoom + 2); editor.style.fontSize = zoom + 'px'; update(); } }, { text: 'Zoom out', icon: 'min', action: () => { zoom = Math.max(10, zoom - 2); editor.style.fontSize = zoom + 'px'; update(); } }, { text: 'Reset zoom', action: () => { zoom = 14; editor.style.fontSize = '14px'; update(); } }, null, { text: previewMode ? 'Edit text' : 'Markdown preview', icon: 'eye', action: togglePreview }]) });
            menu.append(fileMenu, editMenu, viewMenu, OS.el('span', { class: 'spacer' }), button('save', 'Save document', () => save()), button('eye', 'Toggle Markdown preview', togglePreview));
            w.onKey = e => {
                if ((e.ctrlKey || e.metaKey) && ['s', 'o', 'f', 'n'].includes(e.key.toLowerCase())) {
                    e.preventDefault();
                    const k = e.key.toLowerCase();
                    if (k === 's')
                        OS.guard(save)(e.shiftKey);
                    if (k === 'o')
                        OS.guard(open)();
                    if (k === 'f') {
                        find.hidden = false;
                        findInput.focus();
                    }
                    if (k === 'n')
                        OS.launch('notepad');
                }
                if (e.key === 'Tab' && e.target === editor) {
                    e.preventDefault();
                    editor.setRangeText('    ', editor.selectionStart, editor.selectionEnd, 'end');
                    editor.oninput();
                }
                if (e.key === 'F5') {
                    e.preventDefault();
                    editor.setRangeText(new Date().toLocaleString(), editor.selectionStart, editor.selectionEnd, 'end');
                    editor.oninput();
                }
            };
            w.beforeClose = canReplace;
            w.save = save;
            w.editor = editor;
            update();
            setTimeout(() => { if (!w.closed && !w.minimized && OS.focused === w.id && document.activeElement === w.el && !OS.shellPanelType && OS.$('#context-menu').hidden && !OS.$('#dialog-layer').children.length)
                editor.focus(); }, 60);
        }
    });
    OS.register('browser', { title: 'Orbit Browser', description: 'A home for the web and your HTML apps.', category: 'Essentials', width: 1010, height: 670, minWidth: 420,
        mount: async (w, options) => {
            let tabs = [], active = null, alive = true;
            const addresses = AsterWebNavigation;
            const tabbar = OS.el('div', { class: 'browser-tabs' }), nav = OS.el('div', { class: 'browser-nav' }), holder = OS.el('div', { class: 'browser-content' });
            const back = button('back', 'Back', () => historyMove(-1), 'icon-button'), forward = button('forward', 'Forward', () => historyMove(1), 'icon-button'), reload = button('refresh', 'Reload', () => renderContent(current()), 'icon-button'), home = button('home', 'Home', () => navigate('aster://home'), 'icon-button'), address = OS.el('input', { class: 'browser-address', 'aria-label': 'Address or search', placeholder: 'Search the web or enter an address' }), external = button('external', 'Open page in your real browser', () => openExternal(), 'icon-button');
            nav.append(back, forward, reload, home, address, external);
            w.body.append(tabbar, nav, holder);
            const current = () => tabs.find(t => t.id === active);
            const persist = () => { w.state.tabs = tabs.map(t => ({ url: t.url })); w.state.active = tabs.findIndex(t => t.id === active); OS.saveSession(); };
            function renderTabs() { tabbar.replaceChildren(); for (const t of tabs) {
                const tab = OS.el('div', { class: 'browser-tab' + (t.id === active ? ' active' : ''), role: 'tab', tabindex: '0', 'aria-selected': String(t.id === active) });
                tab.innerHTML = OS.icon(t.url.startsWith('aster:') ? 'spark' : 'globe', 14) + `<span>${esc(t.title || t.url)}</span>`;
                const close = button('close', 'Close tab', () => { }, 'icon-button');
                close.onclick = e => { e.stopPropagation(); disposeTab(t); t.pane.remove(); tabs = tabs.filter(x => x.id !== t.id); if (!tabs.length) {
                    addTab();
                    return;
                } if (active === t.id)
                    activate(tabs[tabs.length - 1].id);
                else
                    renderTabs(); persist(); };
                tab.append(close);
                tab.onclick = () => activate(t.id);
                tab.onkeydown = e => { if (e.key === 'Enter')
                    activate(t.id); };
                tabbar.append(tab);
            } tabbar.append(button('plus', 'New tab', () => addTab(), 'icon-button')); }
            function activate(id) { active = id; const t = current(); tabs.forEach(x => x.pane.hidden = x.id !== active); address.value = t.url; back.disabled = t.index <= 0; forward.disabled = t.index >= t.history.length - 1; external.disabled = t.url.startsWith('aster:'); w.setTitle((t.title || 'Orbit') + ' — Orbit Browser'); renderTabs(); persist(); }
            function addTab(url = 'aster://home') {
                if (tabs.length >= 20) throw Error('Close a tab first (20 tabs maximum).');
                url = addresses.address(url);
 const pane = OS.el('div', { class: 'browser-content' }), t = { id: OS.uid(), url, title: 'New tab', pane, history: [url], index: 0 }; tabs.push(t); holder.append(pane); active = t.id; OS.guard(renderContent)(t); activate(t.id); return t; }
            async function navigate(input, newTab = false) {
                const url = addresses.address(input);
                if (!alive) return;
                if (newTab) {
                    addTab(url);
                    return;
                }
                const t = current();
                t.url = url;
                t.history = t.history.slice(0, t.index + 1);
                t.history.push(url);
                t.history = t.history.slice(-100); t.index = t.history.length - 1;
                await renderContent(t);
                if (alive && tabs.includes(t)) activate(t.id);
            }
            async function historyMove(delta) { const t = current(), i = t.index + delta; if (i < 0 || i >= t.history.length)
                return; t.index = i; t.url = t.history[i]; await renderContent(t); if (alive && tabs.includes(t)) activate(t.id); }
            function openExternal() { const t = current(); if (/^https?:\/\//i.test(t.url))
                window.open(t.url, '_blank', 'noopener,noreferrer'); }
            function disposeTab(t) {
                t.renderVersion = (t.renderVersion || 0) + 1;
                t.detachFrame?.(); t.detachFrame = null;
                for (const frame of t.pane.querySelectorAll('iframe')) { frame.remove(); frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; }
                t.pane.replaceChildren();
            }
            async function renderContent(t) {
                if (!t || !alive || !tabs.includes(t)) return;
                disposeTab(t);
                const generation = t.renderVersion, target = t.url;
                const isCurrent = () => alive && tabs.includes(t) && generation === t.renderVersion;
                try { t.url = addresses.address(target, false); } catch (error) {
                    t.pane.append(OS.el('div', {class:'empty',text:error.message})); return;
                }
                if (t.url === 'aster://home' || t.url === 'aster://apps') {
                    t.title = t.url.endsWith('apps') ? 'Your apps' : 'New tab';
                    const page = OS.el('div', { class: 'browser-home' });
                    page.innerHTML = `<div class="aster-symbol" style="width:48px;height:48px"></div><h1>A little space to explore.</h1><p>Your next idea is just a tab away.</p>`;
                    const form = OS.el('form', { class: 'browser-home-search' }), search = OS.el('input', { placeholder: 'Search the web', 'aria-label': 'Search the web' });
                    form.append(search, button('search', 'Search', () => { }));
                    form.onsubmit = e => { e.preventDefault(); navigate(search.value); };
                    page.append(form);
                    const links = OS.el('div', { class: 'browser-links' });
                    const items = t.url.endsWith('apps') ? Array.from(OS.apps.values()).filter(a=>!a.hidden).slice(0, 12).map(a => [a.id, a.title, () => OS.launch(a.id)]) : [['files', 'My files', () => OS.launch('files')], ['code', 'Code Studio', () => OS.launch('code')], ['welcome', 'Get started', () => OS.launch('welcome')], ['store', 'App Center', () => OS.launch('store')], ['browser', 'Wikipedia', () => navigate('https://en.wikipedia.org')], ['store', 'Your web apps', () => navigate('aster://apps')]];
                    for (const [id, title, fn] of items)
                        links.append(OS.el('button', { class: 'browser-link', html: OS.appIcon(id, 39) + `<span>${esc(title)}</span>`, onclick: fn }));
                    if (t.url.endsWith('apps')) {
                        links.replaceChildren();
                        for (const app of OS.webCatalog?.apps || []) links.append(OS.el('button',{class:'browser-link',title:app.description,html:OS.appIcon(app.id,32)+'<span>'+esc(app.title)+'</span>',onclick:OS.guard(()=>navigate(app.url))}));
                    }
                    page.append(links, OS.el('small', { text: 'Websites and searches open in Aster. Sites that block embedding can be opened in your real browser.', style: 'font-size:10px;margin-top:34px' }));
                    t.pane.append(page);
                }
                else if (t.url.startsWith('aster://file/')) {
                    const path = decodeURIComponent(t.url.slice('aster://file'.length)), file = await OS.fs.read(path);
                    if (!isCurrent()) return;
                    t.title = OS.fs.name(path);
                    const note = OS.el('div', { class: 'browser-note', html: OS.icon('shield', 13) + '<span>Local HTML app · isolated sandbox · no desktop API access</span>' });
                    const edit = OS.el('button', { text: 'Edit source', onclick: () => OS.launch('notepad', { path }) });
                    note.append(edit);
                    const frame = OS.el('iframe', { class: 'browser-iframe', sandbox: 'allow-scripts allow-forms allow-modals allow-downloads', title: t.title });
                    const html = await OS.fs.text(file);
                    if (!isCurrent()) return;
                    frame.srcdoc = html; t.pane.append(note, frame);
                }
                else if (/^https?:\/\//i.test(t.url)) {
                    const u = new URL(t.url);
                    t.title = u.hostname;
                    const policy = addresses.framePolicy(u.href, OS.webCatalog?.apps || []);
                    const note = OS.el('div', { class: 'browser-note', html: OS.icon('info', 13) + '<span>Website opened inside Aster. Blank or blocked? This site may forbid embedding or require a separate tab. The address shows the last address you entered.</span>' });
                    note.append(OS.el('button', { text: 'Open in browser ↗', onclick: () => window.open(u.href, '_blank', 'noopener,noreferrer') }));
                    const frame = OS.el('iframe', { class: 'browser-iframe', sandbox:policy.sandbox, allow:policy.allow, allowfullscreen:true, title:u.hostname, referrerpolicy:'no-referrer' });
                    // Only reviewed catalog roots get their existing trusted-app policy.
                    // Unknown websites and local HTML remain opaque-origin sandboxes.
                    frame.dataset.browserPolicy = policy.trusted ? 'reviewed-app' : 'isolated';
                    frame.src = u.href; t.pane.append(note, frame);
                    const focusFrame = () => {
                        if (isCurrent() && active === t.id && document.activeElement === frame && !w.minimized && w.desktop === OS.activeDesktop) { OS.closePanels?.(); w.focus(false); }
                    };
                    window.addEventListener('blur', focusFrame);
                    t.detachFrame = () => window.removeEventListener('blur', focusFrame);
                }
                else {
                    t.title = 'Address not supported';
                    t.pane.append(OS.el('div', { class: 'empty', html: OS.icon('shield', 45) + '<strong>Address not supported</strong><span>Use an https:// address or a local Aster page.</span>' }));
                }
                if (isCurrent() && t.id === active)
                    activate(t.id);
            }
            address.onkeydown = e => { if (e.key === 'Enter') {
                e.preventDefault();
                OS.guard(navigate)(address.value);
            } };
            address.onfocus = () => address.select();
            w.onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                address.focus();
                address.select();
            } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
                e.preventDefault();
                addTab();
            } };
            w.addCleanup(() => {alive = false; tabs.forEach(disposeTab);});
            if (options.path && !options.state?.tabs?.length)
                addTab(addresses.address('aster://file' + encodeURI(options.path).replace(/#/g,'%23').replace(/\?/g,'%3F'), false));
            else if (options.url && !options.state?.tabs?.length) addTab(addresses.address(options.url, false));
            else if (Array.isArray(w.state.tabs) && w.state.tabs.length) {
                const saved = w.state.tabs.slice(0,20), savedActive = Math.max(0, Number(w.state.active) || 0);
                for (const t of saved) {
                    try { addTab(addresses.address(t.url, false)); } catch { addTab('aster://home'); }
                }
                activate(tabs[Math.min(savedActive, tabs.length - 1)].id);
            }
            else
                addTab();
            w.navigate = navigate;
        }
    });
    OS.register('terminal', { title: 'Terminal', description: 'A real command line for your Aster files.', category: 'Development', width: 830, height: 540, minWidth: 370,
        mount: async (w, options) => {
            let cwd = options.cwd || w.state.cwd || '/Documents', history = [], historyIndex = 0, busy = false;
            const term = OS.el('div', { class: 'terminal', tabindex: '0', 'aria-label': 'Aster terminal' }), output = OS.el('div', { class: 'terminal-output', role: 'log', 'aria-live': 'polite' }), row = OS.el('div', { class: 'terminal-input-row' }), prompt = OS.el('span', { class: 'terminal-prompt' }), input = OS.el('input', { class: 'terminal-input', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Terminal command' });
            row.append(prompt, input);
            term.append(output, row);
            w.body.append(term);
            const print = (text = '', cls = '') => { const el = OS.el('div', { class: 'terminal-line ' + cls, text }); output.append(el); while (output.childElementCount > 1800)
                output.firstChild.remove(); term.scrollTop = term.scrollHeight; };
            const promptUpdate = () => { prompt.textContent = `aster:${cwd === '/' ? '/' : OS.fs.name(cwd)} ❯`; w.state.cwd = cwd; OS.saveSession(); };
            const resolve = path => OS.fs.normalize((path || '.').startsWith('/') ? path : OS.fs.join(cwd, path || '.'));
            const tokenize = text => (text.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) || []).map(s => (s[0] === '"' && s.endsWith('"') ? s.slice(1, -1).replace(/\\(["\\])/g, '$1') : s[0] === "'" && s.endsWith("'") ? s.slice(1, -1) : s));
            print('    ✦  ASTER TERMINAL', 'accent');
            print('    Your files. Your commands.');
            print('');
            print('This is the Aster virtual shell, not your computer’s native shell.');
            print('Type help to see available commands. Quotes preserve spaces in paths.');
            print('');
            const help = `FILES\n  ls [path]             List a directory\n  cd <path>             Change directory\n  pwd                   Print working directory\n  cat <file>            Read a text file\n  echo <text> [> file]   Print or write text (>> appends)\n  touch <file>          Create an empty file\n  mkdir <folder>        Create a directory\n  cp <source> <dest>    Copy a file or folder\n  mv <source> <dest>    Move a file or folder\n  rm <path>             Move virtual files to Recycle Bin\n  tree [path]           Show a folder tree\n  find <text>           Search virtual file names\n  export <file>         Download a file\n\nAPPS & DESKTOP\n  open <file|folder>    Open an item\n  edit <file>           Open in Notepad\n  apps                  List app identifiers\n  launch <app-id>       Run an app\n  ps                    List Aster windows\n  kill <id-prefix>      Close an Aster window\n  theme light|dark      Change appearance\n  desk [number]         List or switch desktops\n  date / whoami / uname / neofetch / clear / help\n\nPaths with spaces must be quoted.\nNative shell commands, executables, pipes and networking are not supported.`;
            async function command(text) {
                const args = tokenize(text), name = (args.shift() || '').toLowerCase();
                if (!name)
                    return;
                switch (name) {
                    case 'help':
                        print(help);
                        break;
                    case 'clear':
                        output.replaceChildren();
                        break;
                    case 'pwd':
                        print(cwd);
                        break;
                    case 'whoami':
                        print(OS.settings.username);
                        break;
                    case 'date':
                        print(new Date().toString());
                        break;
                    case 'uname':
                        print('Aster Desktop ' + OS.version + ' / browser runtime / ' + navigator.platform);
                        break;
                    case 'neofetch':
                        print(`       ✦       ${OS.settings.username}@aster\n   ✧   ✦   ✧   ────────────────────────\n       ✦       Desktop  Aster ${OS.version}\n               Runtime  Browser JavaScript\n               Renderer ${OS.metrics.mode}\n               Storage  ${OS.db.mode}\n               Windows  ${OS.windows.size}\n               Uptime   ${Math.floor((performance.now() - OS.started) / 60000)} minutes`, 'accent');
                        break;
                    case 'ls': {
                        const p = resolve(args[0]);
                        const entry = await OS.fs.stat(p);
                        if (!entry)
                            throw Error('Path not found: ' + p);
                        if (entry.kind === 'file') {
                            print(OS.fs.name(p));
                            break;
                        }
                        const files = await OS.fs.list(p);
                        for (const f of files)
                            print((f.kind === 'directory' ? '▸ ' : '  ') + OS.fs.name(f.path) + (f.kind === 'directory' ? '/' : '').padEnd(1) + (f.kind === 'file' ? '   ' + OS.formatBytes(f.size) : ''), f.kind === 'directory' ? 'accent' : '');
                        if (!files.length)
                            print('(empty)');
                        break;
                    }
                    case 'cd': {
                        const p = resolve(args[0] || '/');
                        if ((await OS.fs.stat(p))?.kind !== 'directory')
                            throw Error('Not a directory: ' + p);
                        cwd = p;
                        promptUpdate();
                        break;
                    }
                    case 'cat': {
                        if (!args.length)
                            throw Error('Usage: cat <file>');
                        for (const arg of args) {
                            const f = await OS.fs.read(resolve(arg));
                            if (f.kind !== 'file')
                                throw Error('Not a file.');
                            if ((f.size || 0) > 2e6)
                                throw Error('cat is limited to 2 MB. Open this file in an editor.');
                            print(await OS.fs.text(f));
                        }
                        break;
                    }
                    case 'echo': {
                        const redir = args.findIndex(x => x === '>' || x === '>>');
                        if (redir >= 0) {
                            const dest = args[redir + 1];
                            if (!dest)
                                throw Error('Specify the output file after > or >>.');
                            const p = resolve(dest);
                            let content = args.slice(0, redir).join(' ') + '\n';
                            if (args[redir] === '>>' && await OS.fs.stat(p))
                                content = await OS.fs.text(await OS.fs.read(p)) + content;
                            await OS.fs.write(p, content);
                        }
                        else
                            print(args.join(' '));
                        break;
                    }
                    case 'touch': {
                        if (!args.length)
                            throw Error('Usage: touch <file>');
                        for (const a of args) {
                            const p = resolve(a);
                            if (!await OS.fs.stat(p))
                                await OS.fs.write(p, '');
                        }
                        break;
                    }
                    case 'mkdir': {
                        if (!args.length)
                            throw Error('Usage: mkdir <folder>');
                        for (const a of args)
                            await OS.fs.mkdir(resolve(a));
                        break;
                    }
                    case 'cp':
                    case 'mv': {
                        if (args.length !== 2)
                            throw Error('Usage: ' + name + ' <source> <destination>');
                        const src = resolve(args[0]);
                        let dest = resolve(args[1]);
                        if ((await OS.fs.stat(dest))?.kind === 'directory')
                            dest = OS.fs.join(dest, OS.fs.name(src));
                        if (name === 'mv' && OS.fs.native(src) && !await OS.confirm('Move a local file?', 'The source will be removed from your actual connected folder after copying.', 'Move'))
                            break;
                        await OS.fs.copy(src, dest, name === 'mv');
                        print('→ ' + dest, 'success');
                        break;
                    }
                    case 'rm': {
                        if (!args.length)
                            throw Error('Usage: rm <path>');
                        for (const a of args) {
                            if (a.startsWith('-'))
                                throw Error('Flags are not supported. Virtual items are moved to Recycle Bin.');
                            const p = resolve(a);
                            if (OS.fs.native(p)) {
                                if (!await OS.confirm('Delete local item permanently?', p + ' will be removed from your real folder. This cannot be undone.', 'Delete', true))
                                    continue;
                                await OS.fs.remove(p, true);
                            }
                            else
                                await OS.fs.remove(p, false);
                        }
                        break;
                    }
                    case 'tree': {
                        let count = 0;
                        async function walk(p, prefix = '', depth = 0) { if (depth > 8) {
                            print(prefix + '… depth limit');
                            return;
                        } const entries = await OS.fs.list(p); for (let i = 0; i < entries.length; i++) {
                            if (++count > 300) {
                                if (count === 301)
                                    print('… tree output limited to 300 items');
                                return;
                            }
                            const f = entries[i];
                            print(prefix + (i === entries.length - 1 ? '└─ ' : '├─ ') + OS.fs.name(f.path));
                            if (f.kind === 'directory')
                                await walk(f.path, prefix + (i === entries.length - 1 ? '   ' : '│  '), depth + 1);
                        } }
                        const p = resolve(args[0]);
                        print(p);
                        await walk(p);
                        break;
                    }
                    case 'find': {
                        const q = args.join(' ').toLowerCase();
                        if (!q)
                            throw Error('Usage: find <text>');
                        const matches = (await OS.db.all()).filter(f => !f.path.startsWith('/.Trash') && f.path.toLowerCase().includes(q));
                        matches.slice(0, 200).forEach(f => print(f.path));
                        print(`${matches.length} matches in virtual storage.`);
                        break;
                    }
                    case 'export': {
                        if (!args[0])
                            throw Error('Usage: export <file>');
                        const f = await OS.fs.read(resolve(args[0]));
                        OS.download(await OS.fs.blob(f), OS.fs.name(f.path));
                        print('Download requested.', 'success');
                        break;
                    }
                    case 'open': {
                        if (!args[0])
                            throw Error('Usage: open <file or folder>');
                        await OS.openPath(resolve(args[0]));
                        break;
                    }
                    case 'edit': {
                        if (!args[0])
                            throw Error('Usage: edit <file>');
                        const p = resolve(args[0]);
                        if (!await OS.fs.stat(p))
                            await OS.fs.write(p, '');
                        OS.launch('notepad', { path: p });
                        break;
                    }
                    case 'apps': {
                        for (const [id, a] of OS.apps)
                            print(id.padEnd(14) + a.title);
                        break;
                    }
                    case 'launch': {
                        if (!OS.apps.has(args[0]))
                            throw Error('Unknown app. Type apps for identifiers.');
                        OS.launch(args[0]);
                        break;
                    }
                    case 'ps': {
                        print('ID        APP             STATE       TITLE');
                        for (const x of OS.windows.values())
                            print(x.id.slice(0, 8) + '  ' + x.appId.padEnd(15) + (x.minimized ? 'minimized' : 'running').padEnd(12) + x.title);
                        break;
                    }
                    case 'kill': {
                        if (!args[0])
                            throw Error('Usage: kill <id-prefix>');
                        const matches = Array.from(OS.windows.values()).filter(x => x.id.startsWith(args[0]));
                        if (matches.length !== 1)
                            throw Error(matches.length ? 'Ambiguous ID. Use a longer prefix.' : 'Window not found.');
                        await matches[0].close();
                        break;
                    }
                    case 'theme': {
                        if (!['light', 'dark', 'auto'].includes(args[0]))
                            throw Error('Usage: theme light|dark|auto');
                        await OS.setSetting('theme', args[0]);
                        print('Theme changed.', 'success');
                        break;
                    }
                    case 'desk': {
                        if (args[0]) {
                            const d = OS.desktops[Number(args[0]) - 1];
                            if (!d)
                                throw Error('Desktop not found.');
                            OS.switchDesktop(d.id);
                        }
                        else
                            OS.desktops.forEach((d, i) => print(`${i + 1}. ${d.name}${d.id === OS.activeDesktop ? '  ← current' : ''}`));
                        break;
                    }
                    default: throw Error(`${name}: command not found. Type help for available commands.`);
                }
            }
            input.onkeydown = async (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (busy)
                        return;
                    const text = input.value;
                    input.value = '';
                    print(prompt.textContent + ' ' + text);
                    if (text.trim()) {
                        history.push(text);
                        historyIndex = history.length;
                    }
                    busy = true;
                    input.disabled = true;
                    try {
                        await command(text);
                    }
                    catch (error) {
                        print(error.message, 'error');
                    }
                    finally {
                        busy = false;
                        input.disabled = false;
                        promptUpdate();
                        if (OS.focused === w.id && !w.closed)
                            input.focus();
                        term.scrollTop = term.scrollHeight;
                    }
                }
                else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    historyIndex = Math.max(0, historyIndex - 1);
                    input.value = history[historyIndex] || '';
                }
                else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    historyIndex = Math.min(history.length, historyIndex + 1);
                    input.value = history[historyIndex] || '';
                }
                else if (e.key === 'Tab') {
                    e.preventDefault();
                    const tokens = tokenize(input.value), last = tokens.at(-1) || '';
                    const commands = ['help', 'ls', 'cd', 'pwd', 'cat', 'echo', 'touch', 'mkdir', 'cp', 'mv', 'rm', 'tree', 'find', 'export', 'open', 'edit', 'apps', 'launch', 'ps', 'kill', 'theme', 'desk', 'date', 'whoami', 'uname', 'neofetch', 'clear'];
                    let matches;
                    if (tokens.length <= 1)
                        matches = commands.filter(x => x.startsWith(last));
                    else {
                        try {
                            const entries = await OS.fs.list(cwd);
                            matches = entries.map(f => OS.fs.name(f.path)).filter(n => n.toLowerCase().startsWith(last.toLowerCase()));
                        }
                        catch {
                            matches = [];
                        }
                    }
                    if (matches.length === 1) {
                        const value = matches[0].includes(' ') ? '"' + matches[0] + '"' : matches[0];
                        input.value = input.value.slice(0, input.value.lastIndexOf(last)) + value;
                    }
                    else if (matches.length > 1)
                        print(matches.join('  '), 'accent');
                }
                else if (e.ctrlKey && e.key === 'l') {
                    e.preventDefault();
                    output.replaceChildren();
                }
                else if (e.ctrlKey && e.key === 'c' && !window.getSelection().toString()) {
                    e.preventDefault();
                    print(prompt.textContent + ' ' + input.value + ' ^C');
                    input.value = '';
                }
            };
            term.onclick = e => { if (!window.getSelection().toString())
                input.focus(); };
            w.runCommand = command;
            promptUpdate();
            setTimeout(() => { if (!w.closed && !w.minimized && OS.focused === w.id && document.activeElement === w.el && !OS.shellPanelType && OS.$('#context-menu').hidden && !OS.$('#dialog-layer').children.length)
                input.focus(); }, 50);
        }
    });
})();
