/* Optional host-assisted Windows applications. Native code runs on the companion, not in this tab. */
'use strict';
(() => {
    const OS = Aster;
    document.head.append(OS.el('style', {text:`
.winapps{display:flex;flex-direction:column;height:100%;min-height:0;font-size:13px}
.winapps .wa-scroll{overflow:auto;padding:24px;flex:1;min-height:0}.winapps h2{font-size:25px;margin:0 0 12px}
.winapps p{line-height:1.55;margin:6px 0}.winapps .wa-muted{color:var(--muted)}
.winapps .wa-card{padding:16px;border:1px solid var(--border);border-radius:10px;margin:12px 0;background:var(--surface)}
.winapps .wa-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.winapps .wa-field{display:grid;gap:6px;margin:12px 0}
.winapps input:not([type=checkbox]),.winapps select{min-width:0;padding:9px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text)}
.winapps .wa-status{font-size:12px;padding:10px 14px;border-top:1px solid var(--border);overflow-wrap:anywhere}.winapps .wa-error{color:var(--danger)}
.winapps .wa-library{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.winapps .wa-library .wa-card{margin:0;overflow:hidden}
.winapps .wa-library strong{display:block;overflow-wrap:anywhere;margin:0 0 10px}.winapps .wa-library select{width:100%;max-width:100%;margin:8px 0 12px}
.winapps .wa-toolbar{display:flex;flex-wrap:wrap;gap:8px;padding:10px;border-bottom:1px solid var(--border)}
.winapps .wa-display{border:0;flex:1;width:100%;min-height:220px;background:#20232b}
.winapps .wa-consent{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--border);border-radius:8px;line-height:1.5}
.winapps .wa-consent input{margin-top:4px;flex:none}.winapps .wa-code{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:var(--hover);border-radius:8px;font-size:12px}
.winapps .wa-files{display:grid;gap:5px;margin-top:12px}.winapps .wa-files button{max-width:100%;white-space:normal;overflow-wrap:anywhere;justify-content:start}
`}));
    // Pairing credentials are closure-only, memory-only: never persisted in session/settings/backups.
    let connection = null;
    const appForFile = OS.appForFile;
    OS.appForFile = (path, mime) => /\.exe$/i.test(path) ? 'winapps' : appForFile(path, mime);
    function endpoint(value) {
        const url = new URL(value);
        if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))
            throw Error('Enter an exact companion origin, for example http://127.0.0.1:8787');
        if (url.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname))
            throw Error('Remote companions must use HTTPS. HTTP is allowed only on loopback.');
        if (location.protocol === 'file:') throw Error('Serve Aster on localhost or HTTPS before pairing. File URLs have an opaque origin.');
        return url.origin;
    }
    async function api(path, options = {}, target = connection) {
        if (!target) throw Error('Pair with your Windows companion first.');
        let response;
        try {
            response = await fetch(target.origin+path, {...options, cache:'no-store', credentials:'omit',
                signal:options.signal || AbortSignal.timeout(130000),
                headers:{...options.headers, Authorization:'Bearer '+target.token}});
        } catch (error) {
            throw Error('Companion unreachable. Check the address, TLS certificate, allowed origin and browser local-network permission. '+error.message);
        }
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw Error(body.error || 'Companion HTTP '+response.status);
        }
        return response;
    }
    const json = async (path, options, target) => (await api(path, options, target)).json();
    const post = (path, body, target) => json(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}, target);
    OS.register('winapps', {title:'Windows Apps', icon:'desktop', category:'Development',
        description:'Run real Windows executables with your Wine companion.', width:1120, height:760, minWidth:430, minHeight:380,
        mount:async (w, options = {}) => {
            w.body.classList.add('winapps');
            const content = OS.el('div', {class:'wa-scroll'});
            const status = OS.el('div', {class:'wa-status', role:'status', text:'Native execution requires your companion. Browser-only Aster remains available without it.'});
            w.body.append(content, status);
            let session=null, activeConnection=null, frame=null, poll=null, remoteClipboard='', closed=false, generation=0, profile='balanced';
            const setStatus = (text, error=false) => {status.textContent=text;status.classList.toggle('wa-error',error);};
            const handle = fn => async () => {try {await fn();} catch (error) {setStatus(error.message,true);}};
            const btn = (text, action, cls='secondary') => OS.el('button', {class:cls,text,onclick:handle(action)});
            const send = message => frame?.contentWindow?.postMessage(message, activeConnection.origin);
            function pair() {
                content.className='wa-scroll';
                const url=OS.el('input',{type:'url','aria-label':'Companion URL',value:connection?.origin || 'http://127.0.0.1:8787'});
                const token=OS.el('input',{type:'password','aria-label':'Pairing token',autocomplete:'off',placeholder:'Token printed by the companion'});
                const connect=btn('Connect companion',async () => {
                    connect.disabled=true;
                    try {
                        const target={origin:endpoint(url.value.trim()),token:token.value.trim()};
                        if (target.token.length<32) throw Error('Paste the complete pairing token.');
                        const caps=await json('/api/capabilities',{},target);
                        if (!caps.ready || !caps.viewer_ready) throw Error('Companion dependencies are incomplete: '+[...caps.missing,...(!caps.viewer_ready?['noVNC']:[])].join(', '));
                        connection=target;token.value='';await library();
                    } finally {connect.disabled=false;}
                },'primary');
                content.replaceChildren(OS.el('h2',{text:'Windows apps. Real code.'}),
                    OS.el('p',{text:'Your executable runs through Wine on your Linux x86-64 companion. Aster receives a live interactive display; JavaScript and WebGPU do not execute the EXE.'}),
                    OS.el('div',{class:'wa-card'},OS.el('label',{class:'wa-field'},'Companion address',url),OS.el('label',{class:'wa-field'},'Pairing token (memory only)',token),connect),
                    OS.el('h3',{text:'Start your companion'}),OS.el('pre',{class:'wa-code',text:'docker compose -f bridge/compose.yml up --build\n# Open http://127.0.0.1:8787 and paste the printed token.'}),
                    OS.el('p',{class:'wa-muted',text:'Only run trusted programs. Wine is not a security sandbox. Use a dedicated unprivileged host, VM, or the supplied non-root container.'}),
                    OS.el('p',{class:'wa-muted',text:'On GitHub Pages, allow https://wieslawsoltes.github.io on a browser-trusted HTTPS companion. The Pages server does not run Windows code.'}),
                    OS.el('p',{class:'wa-muted',text:'Portable EXE/ZIP support. Compatibility varies. No audio, GPU passthrough, drivers, anti-cheat, or Windows images are included.'}));
            }
            async function files(app, path='') {
                const reply=await json('/api/apps/'+app.id+'/files?path='+encodeURIComponent(path));
                content.className='wa-scroll';
                content.replaceChildren(btn('Back to library',library),OS.el('h2',{text:app.name+' — C:\\'+path.replaceAll('/','\\')}),
                    OS.el('p',{class:'wa-muted',text:'These files live on your companion. Click a file to download it; symbolic links are not exposed.'}));
                if (path) content.append(btn('Parent folder',()=>files(app,path.split('/').slice(0,-1).join('/'))));
                const list=OS.el('div',{class:'wa-files'});
                for (const item of reply.files) list.append(btn((item.directory?'Folder: ':'Download: ')+item.name,async()=>{
                    if(item.directory) return files(app,item.path);
                    const response=await api('/api/apps/'+app.id+'/files?download=1&path='+encodeURIComponent(item.path));
                    OS.download(await response.blob(),item.name);
                }));
                content.append(list);
            }
            async function importFile(file, consent) {
                if (!consent) throw Error('Confirm that you trust this native program before sending it to your companion.');
                if (file.size>128*1024*1024) throw Error('Choose a file smaller than 128 MiB.');
                setStatus('Transferring and validating '+file.name+'…');
                await json('/api/apps',{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream',
                    'X-Aster-Filename':encodeURIComponent(file.name),'X-Aster-Consent':'run-trusted-windows-code'}});
                await library();
            }
            async function library() {
                if (closed) return;
                if (!connection) return pair();
                const [catalog,running]=await Promise.all([json('/api/apps'),json('/api/sessions')]);
                if (closed) return;
                content.className='wa-scroll';
                content.replaceChildren(OS.el('h2',{text:'Windows Apps'}),OS.el('p',{class:'wa-muted',text:'Connected to '+connection.origin+' · Native Wine backend · Files persist on the companion'}));
                const trust=OS.el('input',{type:'checkbox','aria-label':'I trust this Windows program'});
                const consent=OS.el('label',{class:'wa-consent'},trust,OS.el('span',{text:'I trust this program. It will run on my companion with that user’s permissions. Wine is not a malware sandbox. Do not run unknown executables.'}));
                const upload=OS.el('input',{type:'file',accept:'.exe,.zip','aria-label':'Import Windows executable or ZIP'});
                upload.addEventListener('change',handle(async()=>{if(upload.files[0])await importFile(upload.files[0],trust.checked);}));
                const resolution=OS.el('select',{'aria-label':'Windows display resolution'},...['1280x720','1024x768','1600x900','1920x1080'].map(s=>OS.el('option',{value:s,text:s})));
                content.append(consent,OS.el('div',{class:'wa-card wa-row'},upload,resolution,btn('Refresh library',library),btn('Forget pairing',async()=>{connection=null;pair();})));
                if(options.path)content.append(btn('Import '+OS.fs.name(options.path)+' from Aster files',async()=>{
                    const record=await OS.fs.read(options.path);
                    await importFile(new File([await OS.fs.blob(record)],OS.fs.name(options.path)),trust.checked);
                }));
                const active=running.sessions.filter(s=>['starting','running'].includes(s.status));
                if(active.length)content.append(OS.el('div',{class:'wa-card'},OS.el('h3',{text:'Running sessions'}),...active.map(s=>btn(s.entry.split('/').pop()+' — '+s.status,()=>showSession(s,connection)))));
                const grid=OS.el('div',{class:'wa-library'});
                for(const app of catalog.apps){
                    const {entries}=await json('/api/apps/'+app.id+'/entries');
                    const entry=OS.el('select',{'aria-label':'Executable for '+app.name},...entries.map(e=>OS.el('option',{value:e.path,text:e.path+' ('+e.architecture+')'})));
                    const run=btn('Run',async()=>{
                        if(!trust.checked)throw Error('Confirm that you trust this native program before running it.');
                        run.disabled=true;
                        try{const [width,height]=resolution.value.split('x').map(Number);
                            const next=await post('/api/sessions',{app_id:app.id,entry:entry.value,width,height,consent:true});
                            await showSession(next,connection);
                        }finally{run.disabled=false;}
                    },'primary');
                    run.disabled=!entries.length;
                    const remove=btn('Remove',async()=>{
                        if(await OS.confirm('Remove Windows application?','Permanently delete this application and its companion C: drive, including saved documents?','Remove',true)){
                            await json('/api/apps/'+app.id,{method:'DELETE'});await library();
                        }
                    });
                    grid.append(OS.el('div',{class:'wa-card'},OS.el('strong',{text:app.name}),OS.el('small',{class:'wa-muted',text:OS.formatBytes(app.bytes)+' · SHA-256 '+app.sha256.slice(0,12)+'…'}),entry,OS.el('div',{class:'wa-row'},run,btn('Files',()=>files(app)),remove)));
                }
                if(!catalog.apps.length)grid.append(OS.el('p',{text:'Import a portable EXE or a ZIP containing its DLLs and assets. EXE installers can also run; refresh afterward to discover their installed executables.'}));
                if(!closed)content.append(grid);
                setStatus('Ready · No native program runs until you choose Run.');
            }
            function clearDisplay(){
                generation++;clearTimeout(poll);poll=null;
                if(frame){frame.src='about:blank';frame.remove();frame=null;}
            }
            async function reconnect(){
                if(!session||session.status!=='running'||closed)return;
                if(frame){frame.src='about:blank';frame.remove();}
                frame=OS.el('iframe',{class:'wa-display',title:'Live Windows application',referrerpolicy:'no-referrer',
                    sandbox:'allow-scripts allow-same-origin',src:activeConnection.origin+'/bridge-client/viewer.html#parent='+encodeURIComponent(location.origin)});
                w.body.insertBefore(frame,status);
            }
            async function showSession(next,target){
                clearDisplay();session=next;activeConnection=target;
                const currentGeneration=generation,currentId=next.id;
                content.className='wa-toolbar';
                const preset=OS.el('select',{'aria-label':'Streaming quality'},...[
                    ['latency','Low latency / LAN'],['balanced','Balanced'],['bandwidth','Low bandwidth']].map(([value,text])=>OS.el('option',{value,text})));
                preset.value=profile;preset.onchange=()=>{profile=preset.value;send({type:'aster-windows-profile',profile});};
                content.replaceChildren(btn('Library',async()=>{clearDisplay();session=null;w.setTitle('Windows Apps');await library();}),
                    btn('Reconnect display',reconnect),preset,
                    btn('Send clipboard',async()=>send({type:'aster-windows-clipboard',text:await navigator.clipboard.readText()})),
                    btn('Copy remote clipboard',async()=>{await navigator.clipboard.writeText(remoteClipboard);setStatus('Remote clipboard copied.');}),
                    btn('Ctrl+Alt+Del',()=>send({type:'aster-windows-ctrlaltdel'})),
                    btn('Stop app',async()=>{
                        if(await OS.confirm('Stop Windows application?','Unsaved work may be lost. Files already saved to your companion remain available.','Stop',true)){
                            await json('/api/sessions/'+session.id,{method:'DELETE'},activeConnection);
                            clearDisplay();session=null;w.setTitle('Windows Apps');await library();
                        }
                    }));
                w.setTitle(next.entry.split('/').pop()+' — Windows Apps');setStatus('Starting Wine and the private application display…');
                const tick=async()=>{
                    if(!session||closed||generation!==currentGeneration)return;
                    try{
                        const updated=await json('/api/sessions/'+currentId,{},target);
                        if(closed||generation!==currentGeneration)return;
                        session=updated;
                        if(session.status==='running'){
                            if(!frame)await reconnect();
                            setStatus(`Running · ${session.width} × ${session.height} · startup ${session.startup_ms} ms · ${OS.formatBytes(session.bytes_out)} streamed · ${session.viewers} viewer(s)`);
                        }else if(['failed','stopped'].includes(session.status)){setStatus(session.error||'Application stopped.',true);return;}
                    }catch(error){if(generation===currentGeneration&&!closed)setStatus(error.message,true);return;}
                    poll=setTimeout(tick,session.status==='starting'?500:2000);
                };
                await tick();
            }
            const messages=async event=>{
                if(!frame||event.source!==frame.contentWindow||event.origin!==activeConnection.origin)return;
                const data=event.data;
                if(!data||typeof data.type!=='string')return;
                if(data.type==='aster-windows-viewer-ready'){
                    try{
                        const expectedFrame=frame,expectedId=session.id,expectedTarget=activeConnection;
                        const {ticket}=await post('/api/sessions/'+expectedId+'/ticket',{},expectedTarget);
                        if(closed||frame!==expectedFrame||session?.id!==expectedId)return;
                        send({type:'aster-windows-connect',session:expectedId,ticket,profile});
                    }catch(error){setStatus(error.message,true);}
                }
                if(data.type==='aster-windows-clipboard')remoteClipboard=String(data.text).slice(0,65536);
                if(data.type==='aster-windows-error')setStatus(data.message,true);
                if(data.type==='aster-windows-disconnected')setStatus('Display disconnected. Reconnect to resume; saved files stay on the companion.',true);
            };
            window.addEventListener('message',messages);
            w.beforeClose=async()=>!session||await OS.confirm('Disconnect Windows display?','The application can continue briefly on your companion. Use Stop app to terminate it immediately. Unviewed sessions expire automatically.','Disconnect');
            w.addCleanup(()=>{closed=true;clearDisplay();window.removeEventListener('message',messages);});
            if(connection){try{await library();}catch(error){connection=null;pair();setStatus(error.message,true);}}else pair();
        }
    });
})();
