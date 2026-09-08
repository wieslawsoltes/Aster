/* Integrated file associations, Run, Jump Lists and startup preferences. MIT. */
'use strict';
(() => {
    const OS=Aster,M=AsterShellCommands,$=OS.$;
    const note=text=>OS.el('p',{class:'integration-note',text});
    const button=(text,action,primary=false)=>OS.el('button',{class:primary?'primary':'secondary',text,onclick:OS.guard(action)});
    const icon=(glyph,label,action)=>OS.el('button',{class:'icon-button',title:label,'aria-label':label,html:OS.icon(glyph,17),onclick:OS.guard(action)});
    let state=M.normalizeState(null),saving=Promise.resolve(),runOpen=false,epoch=0,startupDone=false;
    const save=()=>{const snapshot=structuredClone(state);saving=saving.catch(()=>{}).then(()=>OS.db.set('shell-launch',snapshot));return saving;};
    const emit=()=>{OS.emit('shell-launch');OS.emit('apps');};
    OS.fileTypeApp=(path,mime='')=>M.defaultHandler(path,mime);
    OS.appForFile=(path,mime='')=>M.defaultHandler(path,mime,state.defaults);
    const normalizeApp=id=>id==='archives'?'files':id;
    const initial=OS.init;
    OS.init=async()=>{await initial();const raw=await OS.db.get('shell-launch');state=M.normalizeState(raw);
        if(!raw&&Array.isArray(OS.recent))for(const path of OS.recent.slice(0,16))if(M.validPath(path))state.recent.push({app:normalizeApp(OS.appForFile(path,OS.fs.mime(path))),path,time:Date.now()});
        if(!state.trackRecent){OS.recent=[];await OS.db.set('recent',[]);}
    };
    async function remember(app,path) {
        const current=epoch;if(!state.trackRecent||!M.validPath(path))return;
        const entry=await OS.fs.stat(path);if(!entry||current!==epoch||!state.trackRecent)return;
        app=normalizeApp(app);if(!['files','notepad','paint','photos','media','browser','win32'].includes(app))return;
        state.recent=[{app,path,time:Date.now()},...state.recent.filter(e=>e.app!==app||e.path!==path)].slice(0,60);
        OS.recent=[path,...OS.recent.filter(p=>p!==path)].slice(0,16);await OS.db.set('recent',OS.recent);await save();OS.emit('shell-launch');
    }
    OS.on('window-ready',w=>{const path=w.state?.path;if(path&&!w.closed&&!w.body.querySelector('.app-error'))remember(w.appId,path).catch(console.warn);});
    async function launchFile(path,app) {
        const file=await OS.fs.stat(path);if(!file)throw Error('File not found: '+path);
        if(file.kind==='directory'){if(app&&app!=='files')throw Error('Folders open in File Explorer.');return OS.openApp('files',{path});}
        const available=M.candidates(path,file.mime).filter(id=>OS.apps.has(id));app=normalizeApp(app||OS.appForFile(path,file.mime));
        if(!available.includes(app))throw Error('This app does not handle that file type.');
        const w=OS.openApp(app,{path});if(w?.ready)await w.ready;
        if(w?.body?.querySelector('.app-error'))throw Error('The selected app could not open this file.');
        await remember(app,path);return w;
    }
    OS.openPath=path=>launchFile(path);
    async function setDefault(ext,app) {
        ext=String(ext).replace(/^\./,'').toLowerCase();
        if(!/^[a-z0-9_-]{1,20}$/.test(ext)||!M.candidates('file.'+ext).includes(app)||!OS.apps.has(app))throw Error('Unsupported file association.');
        if(!Object.hasOwn(state.defaults,ext)&&Object.keys(state.defaults).length>=128)throw Error('Default-app limit reached. Reset an association first.');
        Object.defineProperty(state.defaults,ext,{value:app,writable:true,configurable:true,enumerable:true});await save();emit();
    }
    OS.showOpenWith=async(path,{launch=true}={})=>{
        const file=await OS.fs.stat(path);if(!file||file.kind!=='file')throw Error('Choose a saved file.');
        if(!launch&&!M.extension(path))throw Error('Files without an extension cannot have a per-extension default. Use Open with to choose an app once.');
        const candidates=M.candidates(path,file.mime).filter(id=>OS.apps.has(id));
        let selected=normalizeApp(OS.appForFile(path,file.mime));if(!candidates.includes(selected))selected=candidates[0];
        const root=OS.el('div',{class:'open-with-content'}),list=OS.el('div',{class:'open-with-options',role:'radiogroup','aria-label':'Choose an app'}),ext=M.extension(path);
        root.append(OS.el('strong',{text:OS.fs.name(path)}),note('Choose how Aster opens this file. This changes Aster only, not your browser or operating system.'),list);
        const always=OS.el('input',{type:'checkbox','aria-label':'Always use this app',disabled:!ext,checked:!launch&&!!ext});
        for(const id of candidates){const choice=OS.el('button',{class:'open-with-option',role:'radio','aria-checked':String(id===selected),'data-handler':id,html:OS.appIcon(id,30)+'<span>'+OS.esc(OS.apps.get(id).title)+'</span>'});
            choice.onclick=()=>{selected=id;for(const b of list.children)b.setAttribute('aria-checked',String(b===choice));always.disabled=!ext||!M.candidates('file.'+ext).includes(id);if(always.disabled)always.checked=false;};list.append(choice);}
        list.onkeydown=e=>{if(['ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();const choices=[...list.children],at=choices.indexOf(document.activeElement),next=choices[(at+(['ArrowUp','ArrowLeft'].includes(e.key)?choices.length-1:1))%choices.length];next.click();next.focus();}};
        root.append(OS.el('label',{class:'open-with-always'},always,OS.el('span',{text:ext?'Always use this app for .'+ext+' files':'Files without an extension use their built-in handler'})));
        if(!ext||candidates.length===1)root.append(note(candidates.length===1?'Only the implemented handler is offered. Installing arbitrary EXE or iframe handlers is not supported.':'A default can be stored only for a named file extension.'));
        const accepted=await OS.dialog({title:launch?'Open with':'Choose a default app',extra:root,confirm:launch?'Open':'Set default'});if(!accepted)return null;
        if((await OS.fs.stat(path))?.kind!=='file')throw Error('The file is no longer available.');
        if(always.checked)await setDefault(ext,selected);
        if(launch)return launchFile(path,selected);
        if(ext)await setDefault(ext,selected);return selected;
    };
    async function pin(app,path) {
        app=normalizeApp(app);if(!['files','notepad','paint','photos','media','browser','win32'].includes(app)||!M.validPath(path)||(await OS.fs.stat(path))==null)throw Error('Only existing virtual files and folders can be pinned.');
        const ix=state.pins.findIndex(e=>e.app===app&&e.path===path);
        if(ix>=0)state.pins.splice(ix,1);else{if(state.pins.length>=24)throw Error('Unpin a document first (24 pinned documents maximum).');state.pins.push({app,path,time:Date.now()});}
        await save();OS.emit('shell-launch');
    }
    async function setTracking(enabled) {
        epoch++;state.trackRecent=!!enabled;if(!enabled){state.recent=[];OS.recent=[];await OS.db.set('recent',[]);}await save();emit();
    }
    async function clearRecent(){epoch++;state.recent=[];OS.recent=[];await OS.db.set('recent',[]);await save();emit();}
    async function setStartup(app,enabled,minimized=false) {
        if(!M.STARTUP.includes(app))throw Error('This app is not eligible for automatic startup.');
        const found=state.startup.find(x=>x.app===app);
        if(enabled&&!found&&state.startup.length>=6)throw Error('Disable a startup app first (six maximum).');
        state.startup=state.startup.filter(x=>x.app!==app);if(enabled)state.startup.push({app,minimized:!!minimized});await save();OS.emit('shell-launch');
    }
    OS.runStartup=async()=>{
        if(startupDone)return;startupDone=true;OS.startupReport=[];
        if(new URLSearchParams(location.search).get('startup')==='off'){OS.startupReport.push({status:'skipped',reason:'startup=off'});return;}
        for(const entry of state.startup){if(!M.STARTUP.includes(entry.app))continue;
            if([...OS.windows.values()].some(w=>w.appId===entry.app&&!w.closed)){OS.startupReport.push({app:entry.app,status:'reused'});continue;}
            const w=OS.openApp(entry.app,{minimized:entry.minimized});OS.startupReport.push({app:entry.app,status:w?'launched':'unavailable'});
            await new Promise(resolve=>setTimeout(resolve,16));
        }
    };
    async function executeRun(text) {
        const visible=[...OS.apps.values()].filter(a=>!a.hidden),command=M.parseRun(text,visible);
        let w;
        if(command.kind==='folder')w=OS.openApp('files',{path:command.path});
        else if(command.kind==='path')w=await launchFile(command.path);
        else if(command.options.path)w=await launchFile(command.options.path,command.app);
        else w=OS.openApp(command.app,command.options);
        if(!w)throw Error('The command did not open an application.');
        if(w.ready)await w.ready;
        if(w.body?.querySelector('.app-error'))throw Error('The application could not open.');
        state.runHistory=[text.trim(),...state.runHistory.filter(x=>x!==text.trim())].slice(0,20);await save();return w;
    }
    OS.showRun=async(initialValue='')=>{
        if(runOpen)return;runOpen=true;OS.closePanels?.();
        const hint=OS.el('div',{class:'run-options'}),examples=OS.el('div',{class:'run-examples'});
        hint.append(note('Open an Aster app, saved file or folder. Examples: calc, notepad /Documents/note.txt, C:\\Documents, ms-settings:defaultapps. Commands never run on the host OS.'),examples);
        try {
            const pending=OS.dialog({title:'Run',message:'Type the name of an app, folder, document or supported settings page.',value:initialValue,placeholder:'Open:',extra:hint,confirm:'OK'});
            const dialog=$('#dialog-layer .dialog:last-child')||[...OS.$$('.dialog')].at(-1),input=dialog.querySelector('input');
            const history=OS.el('datalist',{id:'aster-run-history'});for(const line of state.runHistory)history.append(OS.el('option',{value:line}));hint.append(history);input.setAttribute('list',history.id);input.focus();input.select();
            for(const text of ['calc','explorer','ms-settings:defaultapps','shell:startup'])examples.append(button(text,()=>{input.value=text;input.focus();}));
            const error=OS.el('p',{class:'run-error',role:'alert'});hint.append(error);
            const yes=dialog.querySelector('.dialog-actions .primary');yes.addEventListener('click',e=>{try{M.parseRun(input.value,[...OS.apps.values()].filter(a=>!a.hidden));}catch(err){e.preventDefault();e.stopImmediatePropagation();error.textContent=err.message;input.focus();}},true);
            const value=await pending;if(value!==null)return await executeRun(value);
        } finally {runOpen=false;}
    };
    OS.shellLaunch={get state(){return structuredClone(state);},setDefault,launchFile,remember,pin,setTracking,clearRecent,setStartup,executeRun,save,
        async resetDefaults(){state.defaults={};await save();emit();},async clearRun(){state.runHistory=[];await save();OS.emit('shell-launch');}};

    OS.showJumpList=async(event,appId,anchor)=>{
        event.preventDefault();event.stopPropagation();OS.closePanels?.();const app=OS.apps.get(appId);if(!app)return;
        const panel=OS.el('section',{class:'panel flyout shell-surface jump-list',role:'dialog','aria-label':app.title+' Jump List',tabindex:'-1'});
        let live=true,generation=0;
        OS.mountShellPanel('jump-list',panel,()=>{live=false;generation++;},anchor);
        const header=OS.el('header',{},OS.el('strong',{text:app.title}),icon('close','Close Jump List',()=>OS.closePanels(true)));
        const list=OS.el('div',{class:'jump-documents'}),actions=OS.el('div',{class:'jump-actions'});panel.append(header,list,actions);
        async function render(){const seq=++generation;list.replaceChildren();
            const pinned=state.pins.filter(e=>e.app===appId),recent=state.trackRecent?state.recent.filter(e=>e.app===appId&&!pinned.some(p=>p.path===e.path)).slice(0,8):[];
            for(const [label,entries]of [['Pinned',pinned],['Recent',recent]]){if(!entries.length)continue;const group=OS.el('div',{class:'jump-group'},OS.el('h3',{text:label}));
                for(const item of entries){const f=await OS.fs.stat(item.path);if(!live||seq!==generation)return;const row=OS.el('div',{class:'jump-entry','data-path':item.path});
                    const open=button(OS.fs.name(item.path),async()=>{OS.closePanels();const win=await launchFile(item.path,appId);win?.focus();});open.disabled=!f;open.title=item.path+(f?'':' — unavailable');
                    row.append(open,icon(label==='Pinned'?'pin':'plus',(label==='Pinned'?'Unpin ':'Pin ')+OS.fs.name(item.path),async()=>{if(!f&&label==='Pinned'){state.pins=state.pins.filter(e=>e!==item);await save();}else await pin(appId,item.path);await render();}),icon('close','Remove '+OS.fs.name(item.path),async()=>{state.recent=state.recent.filter(e=>e.app!==appId||e.path!==item.path);state.pins=state.pins.filter(e=>e.app!==appId||e.path!==item.path);await save();await render();}));group.append(row);}
                list.append(group);}
            if(!pinned.length&&!recent.length)list.append(note('Open a saved document in this app to see it here. Recent tracking can be changed in Settings.'));
        }
        const act=(text,fn)=>actions.append(button(text,async()=>{OS.closePanels();await fn();}));
        act('New window',()=>OS.openApp(appId));act(OS.pins.includes(appId)?'Unpin from taskbar':'Pin to taskbar',()=>OS.togglePin(appId));
        if(appId==='files')for(const path of ['/Documents','/Downloads','/Pictures']){const p=path.startsWith('/')?path:'/'+path;act(OS.fs.name(p),()=>OS.openApp('files',{path:p}));}
        const windows=[...OS.windows.values()].filter(w=>w.appId===appId);if(windows.length)act('Close all windows',async()=>{for(const w of windows)await w.close();});
        act('Recent items settings',()=>OS.openApp('settings',{section:'recentitems'}));
        const r=anchor.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(innerWidth-348,r.left))+'px';panel.style.bottom='58px';
        panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();OS.closePanels(true);}else if(['ArrowDown','ArrowUp','Tab'].includes(e.key)){const items=[...panel.querySelectorAll('button:not(:disabled)')],at=items.indexOf(document.activeElement);e.preventDefault();items[(at+((e.key==='ArrowUp'||e.shiftKey)?items.length-1:1))%items.length]?.focus();}};
        await render();if(live)panel.querySelector('button')?.focus();
    };
    OS.integrations.navigation.push(['defaultapps','file','Default apps','file types extensions open with associations','apps'],['startupapps','play','Startup','automatic startup apps minimized','apps'],['recentitems','clock','Recent items','jump lists recent documents privacy run history','privacy']);
    const originalRender=OS.integrations.renderSettings;
    OS.integrations.renderSettings=async function(w,section,main,navigate){
        const row=(title,description,control)=>OS.el('div',{class:'setting-row'},OS.el('div',{class:'setting-label'},OS.el('strong',{text:title}),OS.el('small',{text:description})),control);
        const link=(id,description)=>main.append(row(this.navigation.find(n=>n[0]===id)[2],description,button('Manage',()=>navigate(id))));
        if(section==='apps'){link('defaultapps','Choose which Aster app opens each file type.');link('startupapps','Choose built-in apps to open when this desktop starts.');}
        if(section==='privacy')link('recentitems','Control recent documents, taskbar Jump Lists and Run history.');
        if(section==='defaultapps'){
            main.append(note('These associations apply only to files opened through Aster. The actual supported apps are offered; they do not change the host operating system.'),button('Reset defaults',async()=>{if(await OS.confirm('Reset default apps?','Files will use Aster’s built-in handlers.','Reset')){await OS.shellLaunch.resetDefaults();await draw();}}));
            const search=OS.el('input',{type:'search',placeholder:'Find a file type or app','aria-label':'Find a file type'}),list=OS.el('div',{class:'default-app-list'});main.append(search,list);
            const extensions=[...new Set([...M.knownExtensions,...Object.keys(state.defaults),...(await OS.db.all()).map(e=>M.extension(e.path)).filter(Boolean)])].sort().slice(0,256);
            async function draw(){if(!main.isConnected)return;list.replaceChildren();const q=search.value.trim().toLowerCase();
                for(const ext of extensions){const current=normalizeApp(OS.appForFile('file.'+ext));if(q&&!('.'+ext+' '+OS.apps.get(current)?.title).toLowerCase().includes(q))continue;
                    const select=OS.el('select',{'aria-label':'Default for .'+ext});for(const id of M.candidates('file.'+ext))if(OS.apps.has(id))select.append(OS.el('option',{value:id,text:OS.apps.get(id).title,selected:id===current}));
                    select.onchange=OS.guard(async()=>{await setDefault(ext,select.value);select.closest('.setting-row').querySelector('small').textContent='Your choice';});list.append(row('.'+ext,ext==='zip'?'Compressed folders':ext==='exe'?'Limited PE32 compatibility':state.defaults[ext]?'Your choice':'Built-in default',select));}}
            search.oninput=draw;await draw();return true;
        }
        if(section==='startupapps'){
            main.append(note('Only apps you enable here open automatically. Existing restored windows are reused. No native programs, external websites or imported code run at startup. Add ?startup=off to the address to skip startup apps for a session.'));
            for(const id of M.STARTUP){const configured=state.startup.find(x=>x.app===id),enabled=OS.el('input',{type:'checkbox',checked:!!configured,'aria-label':'Start '+OS.apps.get(id).title}),mini=OS.el('input',{type:'checkbox',checked:!!configured?.minimized,disabled:!configured,'aria-label':'Start minimized '+OS.apps.get(id).title});
                enabled.onchange=OS.guard(async()=>{try{await setStartup(id,enabled.checked,mini.checked);}finally{enabled.checked=state.startup.some(x=>x.app===id);mini.disabled=!enabled.checked;}});mini.onchange=OS.guard(()=>setStartup(id,true,mini.checked));
                main.append(row(OS.apps.get(id).title,'Open when this Aster desktop starts.',OS.el('div',{class:'startup-options'},OS.el('label',{},enabled,' On'),OS.el('label',{},mini,' Minimized'))));}return true;
        }
        if(section==='recentitems'){
            const track=OS.el('input',{type:'checkbox',checked:state.trackRecent,'aria-label':'Remember recent documents'});track.onchange=OS.guard(()=>setTracking(track.checked));
            main.append(row('Remember recent documents','Show documents in Start and taskbar Jump Lists. Turning this off clears recent entries, but keeps deliberate pins.',track),row('Clear recent documents','Does not delete files or pinned Jump List items.',button('Clear recent documents',clearRecent)),row('Run history','Command text is local and limited to 20 successful launches. Do not put secrets in commands.',button('Clear Run history',()=>OS.shellLaunch.clearRun())),note('This local metadata is separate from file content. Clearing an entry never deletes the document. Aster backups do not include these preferences.'));return true;
        }
        return originalRender.call(this,w,section,main,navigate);
    };
})();
