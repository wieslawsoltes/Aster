/* Integrated taskbar window list, read-only Quick Preview and desktop visibility.
 * No cloned iframes, screenshot capture, host-folder reads or preview execution.
 * Every transient surface has an explicit lifetime and cancellation generation. MIT. */
'use strict';
(() => {
    const OS=Aster,M=AsterDesktopRefinementModels,$=OS.$;
    const snapshots=new Map();
    OS.showDesktop=()=>{
        OS.closePanels();const desktop=OS.activeDesktop,snapshot=snapshots.get(desktop),all=[...OS.windows.values()];
        const plan=M.desktopPlan(all,desktop,snapshot);
        if(plan.action==='hide'){
            if(!plan.ids.length)return;
            snapshots.set(desktop,{ids:plan.ids,focused:OS.focused});
            for(const id of plan.ids){const w=OS.windows.get(id);w.dismissSnapLayouts();w.keyboardFinish?.(true);w.minimized=true;w.sync();}
            OS.focused=null;for(const w of all)w.el.classList.add('inactive');
            OS.emit('window-action',{action:'Minimize'});
        }else{
            snapshots.delete(desktop);
            for(const id of plan.ids){const w=OS.windows.get(id);w.minimized=false;w.sync();}
            const focus=OS.windows.get(plan.focused);if(focus&&!focus.minimized&&focus.desktop===desktop)focus.focus();
        }
        for(const id of snapshots.keys())if(!OS.desktops.some(d=>d.id===id))snapshots.delete(id);
        OS.emit('windows');OS.saveSession();OS.renderer?.invalidate();
    };
    OS.desktopVisibility=Object.freeze({get savedDesktops(){return snapshots.size;}});
    // Serialize reorder and pin/unpin writes. Rapid keyboard input must be
    // evaluated against the last committed order, not an obsolete IDB snapshot.
    let pinQueue=Promise.resolve(),pinJobs=0;
    function mutatePins(edit,focusId){
        if(pinJobs>=32)return Promise.reject(Error('Too many pending taskbar changes.'));
        pinJobs++;
        const job=pinQueue.then(async()=>{
            const next=edit([...OS.pins]);
            if(!Array.isArray(next)||next.length>256)throw Error('Taskbar pin limit reached.');
            if(next.join('\0')!==OS.pins.join('\0')){
                await OS.db.set('taskbarPins',next);OS.pins=next;OS.emit('windows');
            }
            if(focusId)[...document.querySelectorAll('#taskbar [data-app]')].find(b=>b.dataset.app===focusId)?.focus({preventScroll:true});
        });
        pinQueue=job.then(()=>{pinJobs--;},()=>{pinJobs--;});return job;
    }
    OS.moveTaskbarPin=(id,before)=>mutatePins(pins=>M.reorderPins(pins,id,before),id);
    OS.taskbarPinMove=(id,delta)=>mutatePins(pins=>{
        const i=pins.indexOf(id),j=i+(delta<0?-1:1);if(i<0||j<0||j>=pins.length)return pins;
        [pins[i],pins[j]]=[pins[j],pins[i]];return pins;
    },id);
    OS.togglePin=id=>mutatePins(pins=>{
        if(!OS.apps.has(id))throw Error('Application is not installed.');
        return pins.includes(id)?pins.filter(p=>p!==id):[...pins,id];
    });
    OS.taskbarOrdering=Object.freeze({get pending(){return pinJobs;}});
    OS.showTaskWindows=(appId,anchor,keyboard=false)=>{
        if(OS.shellPanelType&&OS.shellPanelType!=='preview')return;
        const app=OS.apps.get(appId);if(!app)return;
        const live=()=>[...OS.windows.values()].filter(w=>!w.closed&&w.appId===appId).sort((a,b)=>b.stackOrder-a.stackOrder);
        if(!live().length)return;
        const panel=OS.el('section',{class:'task-preview task-window-panel flyout',role:'dialog','aria-label':app.title+' windows'});
        const heading=OS.el('header',{class:'task-window-heading'}),count=OS.el('strong'),list=OS.el('div',{class:'task-window-grid'}),footer=OS.el('footer',{class:'task-window-footer'});
        heading.append(OS.el('span',{html:OS.appIcon(appId,24)}),count);
        const more=OS.el('button',{class:'secondary',text:'Show all windows',onclick:()=>{OS.closePanels();OS.showTaskView();}});
        const create=OS.el('button',{class:'secondary',text:'New window',disabled:!!app.singleton,onclick:()=>{OS.closePanels();OS.openApp(appId);}});
        footer.append(create,more);panel.append(heading,list,footer);
        const taskAnchor=()=>[...document.querySelectorAll('#taskbar [data-app]')].find(b=>b.dataset.app===appId)||anchor;
        let disposed=false,refreshQueued=false;
        const position=()=>{if(!disposed)OS.placeThemePopup?.(taskAnchor(),panel);};
        const render=()=>{
            if(disposed)return;const items=live();if(!items.length){OS.closePanels();taskAnchor()?.focus({preventScroll:true});return;}
            const active=document.activeElement,oldIndex=[...list.querySelectorAll('.preview-activate')].findIndex(b=>b===active||b.parentNode.contains(active)),oldId=active?.closest('[data-preview-window]')?.dataset.previewWindow;
            list.replaceChildren();count.textContent=app.title+' · '+items.length+(items.length===1?' window':' windows');
            // Bounded layout: all practical app windows, with Task View for overflow.
            for(const w of items.slice(0,60)){
                const card=OS.el('article',{class:'task-window-card','data-preview-window':w.id});
                const activate=OS.el('button',{class:'preview-activate','aria-label':'Activate '+w.title,onclick:()=>{OS.closePanels();w.restore();}},
                    OS.el('span',{class:'preview-app-art',html:OS.appIcon(appId,38)}),OS.el('strong',{text:w.title}),
                    OS.el('small',{text:(OS.desktops.find(d=>d.id===w.desktop)?.name||'Desktop')+' · '+(w.minimized?'Minimized':w.maximized?'Maximized':'Open')+(w.alwaysOnTop?' · On top':'')}));
                // Sibling, not a button nested inside another button.
                const close=OS.el('button',{class:'preview-close icon-button','aria-label':'Close '+w.title,title:'Close '+w.title,html:OS.icon('close',14),onclick:OS.guard(async e=>{e.stopPropagation();await w.close();if(!disposed)render();})});
                card.append(activate,close);card.oncontextmenu=e=>w.titleMenu(e);list.append(card);
            }
            more.hidden=items.length<=60;position();
            if(oldIndex>=0){const cards=[...list.children],item=cards.find(c=>c.dataset.previewWindow===oldId)||cards[Math.min(oldIndex,cards.length-1)];item?.querySelector('.preview-activate')?.focus({preventScroll:true});}
        };
        const off=OS.on('windows',()=>{if(disposed||refreshQueued)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;render();});});
        const offTheme=OS.on('theme-change',position);
        const cleanup=()=>{disposed=true;off();offTheme();window.removeEventListener('resize',position);};
        OS.mountShellPanel('preview',panel,cleanup,anchor);render();window.addEventListener('resize',position);
        panel.onmouseenter=()=>OS.cancelTaskPreviewTimer?.();
        panel.addEventListener('keydown',e=>{
            if(e.key==='Escape'){e.preventDefault();e.stopPropagation();OS.closePanels();taskAnchor()?.focus({preventScroll:true});return;}
            if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
            const buttons=[...list.querySelectorAll('.preview-activate')],index=buttons.findIndex(b=>b===document.activeElement||b.parentNode.contains(document.activeElement));
            e.preventDefault();e.stopPropagation();const step=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
            const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+step+buttons.length)%buttons.length;
            buttons[next]?.focus();
        });
        if(keyboard)list.querySelector('.preview-activate')?.focus();
    };

    let preview=null,liveURLs=0;
    OS.quickPreview=Object.freeze({get active(){return!!preview;},get liveURLs(){return liveURLs;}});
    OS.previewFiles=async(paths,start=0,owner=null)=>{
        const unique=[...new Set(Array.isArray(paths)?paths.slice(0,512):[])].filter(M.virtualPath).slice(0,512);
        if(!unique.length)throw Error('Quick Preview supports files in Aster’s virtual drive.');
        preview?.close();OS.closePanels();const previous=document.activeElement;
        const cover=OS.el('div',{class:'dialog-backdrop quick-preview-backdrop'}),dialog=OS.el('section',{class:'dialog quick-preview',role:'dialog','aria-modal':'true','aria-label':'Quick preview',tabindex:'-1'});
        const title=OS.el('h2'),caption=OS.el('small',{class:'preview-file-caption'}),body=OS.el('div',{class:'quick-preview-body','aria-live':'polite'});
        const header=OS.el('header',{class:'quick-preview-header'}),info=OS.el('div',{class:'grow'},title,caption);
        const open=OS.el('button',{class:'secondary',text:'Open in app'}),close=OS.el('button',{class:'icon-button',title:'Close preview','aria-label':'Close preview',html:OS.icon('close',18)});
        header.append(info,open,close);
        const before=OS.el('button',{class:'secondary','aria-label':'Previous file',html:OS.icon('back',18)}),after=OS.el('button',{class:'secondary','aria-label':'Next file',html:OS.icon('forward',18)}),position=OS.el('span'),foot=OS.el('footer',{class:'quick-preview-footer'},before,position,after);
        dialog.append(header,body,foot);cover.append(dialog);$('#dialog-layer').append(cover);
        let index=Math.max(0,Math.min(unique.length-1,Number.isInteger(start)?start:0)),generation=0,url=null,disposed=false;
        const disposeContent=()=>{
            for(const media of body.querySelectorAll('audio,video')){media.pause();media.removeAttribute('src');media.load();}
            body.replaceChildren();if(url){URL.revokeObjectURL(url);url=null;liveURLs--;}
        };
        const finish=()=>{
            if(disposed)return;disposed=true;++generation;disposeContent();off();cover.remove();
            if(preview?.close===finish)preview=null;
            if(previous?.isConnected)previous.focus({preventScroll:true});
        };
        const off=OS.on('windows',()=>{if(owner?.closed)finish();});
        preview={close:finish};close.onclick=finish;
        open.onclick=OS.guard(async()=>{const path=unique[index];finish();await OS.openPath(path);});
        const message=text=>OS.el('p',{class:'quick-preview-notice',text});
        async function load(next){
            index=next;const mine=++generation;disposeContent();const path=unique[index];
            title.textContent=OS.fs.name(path);caption.textContent=path;position.textContent=(index+1)+' of '+unique.length;
            before.disabled=index===0;after.disabled=index===unique.length-1;open.disabled=true;body.append(message('Loading preview…'));body.setAttribute('aria-busy','true');
            try{
                const entry=await OS.fs.stat(path);if(disposed||mine!==generation)return;
                if(!entry||entry.kind!=='file'){body.replaceChildren(message('This file is no longer available.'));return;}
                const kind=M.previewKind(path,entry.mime);open.disabled=false;caption.textContent=path+' · '+OS.formatBytes(entry.size||0);
                if(kind==='metadata'||(kind!=='text'&&(entry.size||0)>M.PREVIEW_LIMIT)){body.replaceChildren(OS.el('div',{class:'quick-preview-fallback',html:OS.fileIcon(entry,64)}),message(kind==='metadata'?'No inline preview for this file type. Use Open in app to choose its normal handler.':'Media previews are limited to 16 MiB. The original file is unchanged.'));return;}
                const file=await OS.fs.read(path);if(disposed||mine!==generation)return;
                const blob=await OS.fs.blob(file);if(disposed||mine!==generation)return;
                // The file may have been replaced after stat; bound actual bytes too.
                if(kind!=='text'&&blob.size>M.PREVIEW_LIMIT){body.replaceChildren(message('Media previews are limited to 16 MiB. The original file is unchanged.'));return;}
                if(kind==='text'){
                    const text=await blob.slice(0,M.TEXT_LIMIT).text();if(disposed||mine!==generation)return;
                    body.replaceChildren(OS.el('pre',{class:'quick-preview-text',text,tabindex:'0','aria-label':'File content'}));
                    if(blob.size>M.TEXT_LIMIT)body.append(message('Preview limited to the first 128 KiB; the complete file is unchanged.'));
                }else{
                    url=URL.createObjectURL(blob);liveURLs++;const media=kind==='image'?OS.el('img',{alt:OS.fs.name(path),src:url}):OS.el(kind,{controls:true,preload:'metadata',src:url});
                    if(kind==='video')media.setAttribute('playsinline','');
                    media.onerror=()=>{if(!disposed&&mine===generation){disposeContent();body.append(message('This browser could not decode the file. Open it in its normal application.'));}};
                    body.replaceChildren(media);
                }
            }catch(error){if(!disposed&&mine===generation)body.replaceChildren(message('Preview unavailable: '+error.message));}
            finally{if(!disposed&&mine===generation)body.removeAttribute('aria-busy');}
        }
        before.onclick=()=>void load(Math.max(0,index-1));after.onclick=()=>void load(Math.min(unique.length-1,index+1));
        cover.onkeydown=e=>{
            if(e.key==='Escape'||(e.code==='Space'&&!e.target.closest('button,audio,video,input'))){e.preventDefault();e.stopPropagation();finish();return;}
            if(['ArrowLeft','ArrowRight'].includes(e.key)&&!e.target.closest('audio,video')){e.preventDefault();e.stopPropagation();if(e.key==='ArrowLeft')before.click();else after.click();return;}
            if(e.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not(:disabled),[tabindex="0"],audio,video')];const i=nodes.indexOf(document.activeElement);e.preventDefault();const next=i<0?(e.shiftKey?nodes.length-1:0):(i+(e.shiftKey?nodes.length-1:1))%nodes.length;nodes[next]?.focus();}
            e.stopPropagation();
        };
        dialog.focus();await load(index);return{close:finish};
    };
})();
