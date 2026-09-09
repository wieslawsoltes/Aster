/* Theme-aware shell composition. Reuses the real task buttons, tray and callbacks. MIT. */
'use strict';
(() => {
    const OS=Aster,$=OS.$;
    let lastShellLayout=null;
    const shellLayout=()=>JSON.stringify(OS.themes.chrome);
    const action=(label,fn,icon)=>OS.el('button',{'aria-label':label,title:label,...(icon?{html:OS.icon(icon,16)}:{text:label}),onclick:OS.guard(fn)});
    OS.placeThemePopup=(anchor,panel)=>{
        if(!OS.themes?.ready||!anchor?.isConnected||!panel?.isConnected)return;
        const area=OS.themes.workArea(),r=anchor.getBoundingClientRect(),p=panel.getBoundingClientRect();
        let left=r.left+r.width/2-p.width/2,top=r.top-p.height-10;
        if(area.side){left=area.left?r.right+10:r.left-p.width-10;top=Math.max(area.top+8,r.top);}
        panel.style.bottom='auto';panel.style.left=Math.max(8,Math.min(innerWidth-p.width-8,left))+'px';panel.style.top=Math.max(area.top+8,Math.min(innerHeight-p.height-8,top))+'px';
        panel.style.maxHeight=(innerHeight-area.top-24)+'px';
    };
    OS.decorateTaskbar=bar=>{
        if(!bar||!OS.themes?.ready)return;
        const t=OS.themes.chrome,profile=t.profile,center=bar.querySelector('.task-center');if(!center)return;
        if(lastShellLayout===null)lastShellLayout=shellLayout();
        let top=$('#theme-topbar');if(!top){top=OS.el('nav',{id:'theme-topbar','aria-label':'Desktop menu bar'});bar.before(top);}
        const oldTray=bar.querySelector('.task-right')||top.querySelector('.task-right');
        const oldClock=top.querySelector('#tray-clock');if(oldClock&&oldTray&&!oldTray.querySelector('#tray-clock'))oldTray.append(oldClock);
        top.replaceChildren();top.hidden=profile==='windows';
        const dock=t.taskbar.position;bar.setAttribute('aria-label',profile==='windows'?'Taskbar':'Application Dock');
        const launchIcon=center.querySelector('#start-button .aster-symbol');if(launchIcon){launchIcon.dataset.launchProfile=profile;launchIcon.innerHTML=profile==='ubuntu'?'<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">'+[5,12,19].flatMap(y=>[5,12,19].map(x=>'<circle cx="'+x+'" cy="'+y+'" r="1.7" fill="currentColor"/>')).join('')+'</svg>':'';}
        if(profile==='windows'){if(oldTray&&!bar.contains(oldTray))bar.append(oldTray);const start=center.querySelector('#start-button');if(start)center.prepend(start);return;}
        const current=OS.windows.get(OS.focused),menus=OS.el('div',{class:'theme-global-menus'});
        if(profile==='ubuntu')menus.append(action('Activities',()=>OS.showTaskView()));
        else{
            menus.append(action('Aster menu',e=>OS.context(e,[{text:'About Aster',icon:'info',action:()=>OS.openApp('settings',{section:'about'})},{text:'System Settings',icon:'settings',action:()=>OS.openApp('settings')},{text:'Themes',icon:'paint',action:()=>OS.openApp('settings',{section:'themes'})},null,{text:'Lock desktop',icon:'lock',action:OS.lock},{text:'Restart Aster',icon:'refresh',action:OS.restart}]),'spark'));
            menus.append(OS.el('strong',{class:'theme-active-app',text:current?.app?.title||'Aster Desktop'}));
            for(const item of [...(current?.body.querySelectorAll('.menu-bar > button')||[])].filter(x=>x.textContent.trim()&&!x.classList.contains('icon-button')).slice(0,4)){
                menus.append(action(item.textContent.trim(),event=>{const r=event.currentTarget.getBoundingClientRect();item.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+2,clientY:r.bottom+2}));}));
            }
            // Explorer's global menus dispatch to its actual handlers. A single
            // folder tab may be hidden visually; New tab remains available here.
            if(current?.appId==='files'){
                const key=(name,ctrl=true)=>current.onKey?.({key:name,ctrlKey:ctrl,metaKey:false,shiftKey:false,altKey:false,target:current.body,preventDefault(){},stopPropagation(){}});
                const menu=(label,items)=>menus.append(action(label,event=>OS.context(event,items)));
                menu('File',[{text:'New window',key:'⌘N',action:()=>OS.openApp('files',{path:current.state.path})},{text:'New tab',key:'⌘T',action:()=>key('t')},null,{text:'Close window',key:'⌘W',action:()=>current.close()}]);
                menu('Edit',[{text:'Undo',key:'⌘Z',disabled:!OS.fileOps.canUndo,action:()=>OS.fileOps.undo()},{text:'Redo',key:'⇧⌘Z',disabled:!OS.fileOps.canRedo,action:()=>OS.fileOps.redo()},null,{text:'Cut',key:'⌘X',action:()=>key('x')},{text:'Copy',key:'⌘C',action:()=>key('c')},{text:'Paste',key:'⌘V',action:()=>key('v')},{text:'Select all',key:'⌘A',action:()=>key('a')}]);
                menu('Go',[['Home','home'],['Desktop','/Desktop'],['Documents','/Documents'],['Downloads','/Downloads'],['Pictures','/Pictures']].map(([text,path])=>({text,action:()=>current.navigate(path)})));
            }
            menus.append(action('Window',event=>OS.context(event,[
                {text:'Minimize',icon:'min',disabled:!current,action:()=>current.minimize()},
                {text:current?.maximized?'Restore':'Zoom',icon:'max',disabled:!current,action:()=>current.toggleMaximize()},
                {text:'Center window',icon:'center',disabled:!current||current.maximized,action:()=>current.center()},
                {text:'Always on top',icon:'pin',checked:!!current?.alwaysOnTop,disabled:!current,action:()=>current.setAlwaysOnTop(!current.alwaysOnTop)},
                {text:'Window controls…',icon:'more',disabled:!current,action:()=>current.titleMenu()},
                {text:'Tile left',icon:'taskview',disabled:!current,action:()=>current.snap('left')},
                {text:'Tile right',icon:'taskview',disabled:!current,action:()=>current.snap('right')},
                {text:'Show all windows',icon:'taskview',action:()=>OS.showTaskView()},null,
                ...[...OS.windows.values()].slice(0,20).map(w=>({text:w.title,icon:'restore',action:()=>w.restore()}))])));
        }
        const tray=oldTray||OS.el('div',{class:'task-right'});
        const tools=OS.el('div',{class:'theme-top-tools'},action('Search apps and files',()=>OS.toggleStart(true),'search'),action('Open your day widgets',()=>OS.showWidgets(),'sun'));
        top.append(menus);
        if(profile==='ubuntu'){const clock=tray.querySelector('#tray-clock');if(clock){clock.classList.add('theme-center-clock');top.append(clock);}}
        tools.append(tray);top.append(tools);
        const start=center.querySelector('#start-button');if(start){start.title=profile==='ubuntu'?'Show Applications':'Applications';if(profile!=='windows')center.append(start);}
        bar.dataset.themeDock=dock;
    };
    OS.on('theme-change',()=>{
        // Legacy color settings persist asynchronously. Do not dismiss a newly
        // opened flyout merely because that color-only transaction completed.
        // Dock/profile changes invalidate anchors; those still dismiss panels.
        const next=shellLayout();
        if(lastShellLayout!==null&&lastShellLayout!==next)OS.closePanels?.();
        lastShellLayout=next;OS.decorateTaskbar($('#taskbar'));
    });
    const nativeOpen=OS.openPath;
    OS.openPath=async function(path,...args){
        if(!/\.(theme|themepack|deskthemepack|astertheme)$/i.test(path))return nativeOpen.call(OS,path,...args);
        const file=await OS.fs.read(path);if(!file||file.kind==='directory')return nativeOpen.call(OS,path,...args);
        const blob=await OS.fs.blob(file),name=OS.fs.name(path);
        const result=await OS.themes.importFiles([new File([blob],name,{type:blob.type})]);
        const content=OS.el('div',{},OS.el('p',{text:result.theme.title+' · '+result.theme.profile}),...result.warnings.map(text=>OS.el('p',{text})),OS.el('p',{text:'Apply appearance to Aster? No native binaries are run and your open files are kept.'}));
        if(await OS.dialog({title:'Apply imported theme?',extra:content,confirm:'Apply theme'})){await OS.themes.install(result.theme);OS.themes.warnings=result.warnings;return OS.openApp('settings',{section:'themes'});}
        return null;
    };
    let startupSound=false;document.addEventListener('pointerdown',()=>{if(startupSound||!OS.themes.ready)return;startupSound=true;void OS.themes.playSound('SystemStart');},{once:true});
    // Publish a small opt-in theme message to reviewed frames. Never inject styles
    // into independently owned app documents or send theme assets/document data.
    const send=w=>{if(!w.webFrame||!OS.themes.ready)return;try{w.webFrame.contentWindow?.postMessage({type:'aster:theme',...OS.themes.publicTheme()},new URL(w.app.url||w.webFrame.src).origin);}catch{/* Detached or navigating frame. */}};
    OS.on('web-app-load',e=>{const w=OS.windows.get(e.windowId);if(w)send(w);});
    OS.on('theme-change',()=>{for(const w of OS.windows.values())send(w);});
})();
