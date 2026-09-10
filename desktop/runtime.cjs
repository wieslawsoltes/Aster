/* Native Chromium top-level documents composited inside Aster. No header rewriting. MIT. */
'use strict';
const {app,BrowserWindow,WebContentsView,ipcMain,protocol,net,session,Menu,dialog,shell} = require('electron');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const P = require('./policy.cjs');
function registerScheme() {
    protocol.registerSchemesAsPrivileged([{scheme:'aster-app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
}
async function createDesktop(options={}) {
    const root = options.root || (app.isPackaged?path.join(__dirname,'runtime'):path.resolve(__dirname,'..'));
    // The application scheme exists in the shell's session only. Guest sessions cannot read it.
    protocol.handle('aster-app',async request=>{
        try {
            if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
            const filename=P.resourcePath(request.url,root);
            // Reject symlink escapes as well as lexical traversal.
            const real=await fs.realpath(filename),base=await fs.realpath(root);
            if(!real.startsWith(base+path.sep))throw Error('Outside runtime');
            return net.fetch(pathToFileURL(real).href);
        } catch {return new Response('Not found',{status:404});}
    });
    const win = new BrowserWindow({title:'Aster Desktop',width:1440,height:940,minWidth:640,minHeight:480,show:false,
        webPreferences:{...P.GUEST,preload:path.join(__dirname,'preload.cjs')}});
    const views=new Map();
    const guestSession=session.fromPartition('aster-orbit-'+randomUUID());
    // No network listener, proxy, shared profile, remote debugger or guest preload.
    guestSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    guestSession.setPermissionCheckHandler(()=>false);
    guestSession.setDevicePermissionHandler(()=>false);
    guestSession.webRequest.onBeforeRequest((details,callback)=>{
        const u=new URL(details.url),permitted=['http:','https:','ws:','wss:','blob:','data:','about:'].includes(u.protocol);
        callback({cancel:!permitted});
    });
    const notify=data=>{if(!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('aster-native-event',data);};
    const authorized=event=>!win.isDestroyed() && event.sender===win.webContents && event.senderFrame===win.webContents.mainFrame && P.shellURL(event.senderFrame.url);
    const lookup=id=>{const r=views.get(P.id(id));if(!r||r.view.webContents.isDestroyed())throw Error('This browser view has closed.');return r;};
    const snapshot=r=>{const wc=r.view.webContents,h=wc.navigationHistory;return {id:r.id,url:r.pendingURL||wc.getURL(),title:wc.getTitle().slice(0,200),loading:wc.isLoading(),canBack:h.canGoBack(),canForward:h.canGoForward(),zoom:wc.getZoomFactor(),muted:wc.isAudioMuted(),error:r.error||null};};
    const publish=r=>{if(views.has(r.id)&&!r.view.webContents.isDestroyed())notify({type:'state',...snapshot(r)});};
    const hideAll=()=>{for(const r of views.values()){if(r.visible)r.view.setVisible(false);r.visible=false;}};
    function destroy(id) {const r=views.get(id);if(!r)return;views.delete(id);r.view.setVisible(false);win.contentView.removeChildView(r.view);if(!r.view.webContents.isDestroyed())r.view.webContents.close({waitForBeforeUnload:false});}
    function create(data) {
        const id=P.id(data?.id);if(views.has(id))throw Error('Duplicate browser view.');if(views.size>=20)throw Error('Close an Orbit page first (20 native pages maximum).');
        const view=new WebContentsView({webPreferences:{...P.GUEST,session:guestSession}}),wc=view.webContents;
        const r={id,view,visible:false,error:null};views.set(id,r);win.contentView.addChildView(view);view.setVisible(false);
        const allowed=value=>{try{P.webURL(value);return true;}catch{return false;}};
        wc.on('will-navigate',(event,url)=>{if(!allowed(url)){event.preventDefault();r.error='This navigation scheme is not allowed.';publish(r);}});
        wc.on('will-redirect',(event,url)=>{if(!allowed(url)){event.preventDefault();r.error='This redirect scheme is not allowed.';publish(r);}});
        wc.on('will-frame-navigate',event=>{if(!/^https?:|^about:|^blob:|^data:/.test(event.url))event.preventDefault();});
        wc.on('will-attach-webview',event=>event.preventDefault());
        wc.setWindowOpenHandler(details=>{
            if(allowed(details.url)&&!details.postBody&&r.visible)notify({type:'popup',id,url:details.url});
            else notify({type:'notice',id,message:'This popup could not be opened. Use a normal same-tab link; POST/opener-dependent popups are not supported.'});
            return {action:'deny'};
        });
        wc.on('page-title-updated',()=>publish(r));
        wc.on('did-start-loading',()=>{r.error=null;publish(r);});
        wc.on('did-stop-loading',()=>publish(r));
        wc.on('did-navigate',()=>{r.pendingURL=null;publish(r);});
        wc.on('did-navigate-in-page',()=>publish(r));
        wc.on('did-fail-load',(_event,code,description,url,isMain)=>{if(isMain&&code!==-3){r.error=String(description).slice(0,240);publish(r);}});
        wc.on('render-process-gone',()=>{r.error='The page process ended. Reload to restart it.';publish(r);});
        wc.on('content-bounds-updated',event=>event.preventDefault());
        wc.on('will-prevent-unload',event=>{
            const answer=dialog.showMessageBoxSync(win,{type:'question',buttons:['Stay','Leave page'],defaultId:0,cancelId:0,title:'Unsaved website changes',message:'This website reports unsaved work. Leave the page?'});
            if(answer===1)event.preventDefault();
        });
        wc.on('before-input-event',(event,input)=>{
            if(input.type!=='keyDown'||input.isAutoRepeat||input.isComposing)return;
            if(input.key==='F5'){event.preventDefault();wc.reload();return;}
            if(input.alt&&!input.control&&!input.meta&&['ArrowLeft','ArrowRight'].includes(input.key)){event.preventDefault();const h=wc.navigationHistory;if(input.key==='ArrowLeft'&&h.canGoBack())h.goBack();else if(input.key==='ArrowRight'&&h.canGoForward())h.goForward();return;}
            const primary=process.platform==='darwin'?input.meta:input.control,k=input.key.toLowerCase();
            if(primary&&!input.alt&&['l','t','w','h','d','r','f'].includes(k)){
                event.preventDefault();win.webContents.focus();notify({type:'shortcut',id,key:k,shift:input.shift===true});
            }
        });
        wc.on('context-menu',(_event,params)=>{
            const items=[];
            if(params.isEditable)items.push({role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'});
            else if(params.selectionText)items.push({role:'copy'});
            if(allowed(params.linkURL))items.push({label:'Open link in new Orbit tab',click:()=>notify({type:'popup',id,url:params.linkURL})});
            items.push({type:'separator'},{label:'Back',enabled:wc.navigationHistory.canGoBack(),click:()=>wc.navigationHistory.goBack()},{label:'Reload',click:()=>wc.reload()});
            Menu.buildFromTemplate(items).popup({window:win});
        });
        return snapshot(r);
    }
    guestSession.on('will-download',(event,item,wc)=>{
        if(![...views.values()].some(r=>r.view.webContents===wc&&r.visible)){event.preventDefault();return;}
        // Native Save As is shown by Chromium/Electron. No silent save or auto-open.
        item.setSaveDialogOptions({title:'Save website download',defaultPath:path.basename(item.getFilename()).replace(/[\\/\x00-\x1f]/g,'_')||'download'});
        item.once('done',(_event,state)=>notify({type:'notice',id:[...views.values()].find(r=>r.view.webContents===wc)?.id,message:'Website download: '+state}));
    });
    const commands=new Set(['back','forward','reload','stop','focus','zoom','find','stopFind','mute','print']);
    async function handle(event,payload) {
        if(!authorized(event))throw Error('Untrusted browser bridge caller.');
        const method=payload?.method,data=payload?.data;
        if(method==='create')return create(data);
        if(method==='clearSession'){
            hideAll();const answer=await dialog.showMessageBox(win,{type:'warning',buttons:['Cancel','Close pages and clear'],defaultId:0,cancelId:0,title:'Clear Orbit website data',message:'Close all native pages and erase their session cookies, cache and website storage? This does not erase Aster files.'});
            if(answer.response!==1)return false;
            for(const id of [...views.keys()]){destroy(id);notify({type:'closed',id});}
            await guestSession.clearStorageData();await guestSession.clearCache();return true;
        }
        const r=lookup(data?.id),wc=r.view.webContents;
        if(method==='destroy'){destroy(r.id);return true;}
        if(method==='navigate'){
            const url=P.webURL(data.url);r.error=null;r.pendingURL=url;
            // Return immediately; navigation/load/error events report actual state.
            wc.loadURL(url).catch(error=>{if(views.has(r.id)&&error.errno!==-3){r.error=String(error.code||error.message).slice(0,240);publish(r);}});
            return true;
        }
        if(method==='command'){
            if(!commands.has(data.action))throw Error('Unsupported browser command.');
            if(data.action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();
            if(data.action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();
            if(data.action==='reload')wc.reload();
            if(data.action==='stop')wc.stop();
            if(data.action==='focus'&&r.visible)wc.focus();
            if(data.action==='zoom')wc.setZoomFactor(Math.max(.5,Math.min(2,Number(data.value)||1)));
            if(data.action==='find'){if(typeof data.value!=='string'||data.value.length>512)throw Error('Invalid search text.');if(data.value)wc.findInPage(data.value);else wc.stopFindInPage('clearSelection');}
            if(data.action==='stopFind')wc.stopFindInPage('clearSelection');
            if(data.action==='mute')wc.setAudioMuted(data.value===true);
            if(data.action==='print')wc.print({silent:false});
            publish(r);return true;
        }
        throw Error('Unknown browser bridge method.');
    }
    ipcMain.handle('aster-native-browser',handle);
    let layoutTime=0;
    function layout(event,data) {
        if(!authorized(event))return;
        // A single foreground surface prevents native content covering other Aster windows.
        layoutTime=Date.now();if(!data?.id||win.isMinimized()||!win.isVisible()){hideAll();return;}for(const r of views.values())if(r.id!==data.id&&r.visible){r.view.setVisible(false);r.visible=false;}
        try{const r=lookup(data.id),[width,height]=win.getContentSize();r.view.setBounds(P.bounds(data.bounds,width,height));if(!r.visible)r.view.setVisible(true);r.visible=true;}catch{hideAll(); /* Invalid bounds fail closed. */ }
    }
    ipcMain.on('aster-native-layout',layout);
    // Shell crash/reload/stall must not leave an unowned page over the desktop.
    const watchdog=setInterval(()=>{if(Date.now()-layoutTime>2000)hideAll();},500);
    win.webContents.on('render-process-gone',hideAll);
    win.webContents.on('did-start-navigation',(_e,_u,_same,main)=>{if(main)for(const id of [...views.keys()])destroy(id);});
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.on('will-attach-webview',event=>event.preventDefault());
    win.webContents.setWindowOpenHandler(details=>{
        // Existing explicit external buttons may launch only HTTP(S), never native protocols.
        try{const url=P.webURL(details.url);dialog.showMessageBox(win,{type:'question',buttons:['Cancel','Open externally'],defaultId:0,cancelId:0,title:'Open outside Aster?',message:url}).then(r=>{if(r.response===1)shell.openExternal(url).catch(()=>{});});}catch{ }
        return {action:'deny'};
    });
    let closing=false;
    win.on('close',event=>{
        if(!closing&&views.size){event.preventDefault();hideAll();dialog.showMessageBox(win,{type:'question',buttons:['Cancel','Close Aster'],defaultId:0,cancelId:0,title:'Close Aster Desktop?',message:'Native website pages may have unsaved work. Save before closing.'}).then(r=>{if(r.response===1&&!win.isDestroyed()){closing=true;win.close();}});}
    });
    win.on('minimize',hideAll);
    win.on('closed',()=>{clearInterval(watchdog);for(const r of views.values())if(!r.view.webContents.isDestroyed())r.view.webContents.close({waitForBeforeUnload:false});views.clear();ipcMain.removeHandler('aster-native-browser');ipcMain.removeListener('aster-native-layout',layout);protocol.unhandle('aster-app');});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
        ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
        {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
        {label:'Window',submenu:[{role:'minimize'},{role:'togglefullscreen'},{role:'close'}]}
    ]));
    await win.loadURL(P.SHELL_URL);win.show();
    return {window:win,views,guestSession,handle,hideAll}; // Main-process-only; not exposed through IPC.
}
module.exports={registerScheme,createDesktop};
