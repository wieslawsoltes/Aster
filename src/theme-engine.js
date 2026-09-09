/* Shared theme service: declarative resources -> shell/app tokens -> live controls.
 * Theme changes never reload applications, inject arbitrary CSS, or fetch assets.
 * Theme library and legacy appearance mirrors are committed together. MIT.
 */
'use strict';
(() => {
    const OS=Aster,M=AsterThemeModels,A=AsterThemeAssets,$=OS.$;
    let current=M.getPreset('windows-light'),saved=[],initialized=false,revision=0,queue=Promise.resolve(),legacyTimer=0;
    let mirror={},tokens={},backgroundKey='',slideTimer=0,slideIndex=0,cursorTimer=0,cursorKey='',resourceKey='';let cachedAssets={};
    const urls=new Map(),soundBuffers=new Map();const soundJobs=new Set();let soundEpoch=0,audioEnded=0;let accentJob=null;
    const light={text:'#202126',muted:'#616875',surface:'#ffffff',surface2:'#f8f9fb',surface3:'#eff1f5',mica:'#edf1f7',glass:'#f0f4fa',border:'#00000024',hover:'#0000000d'};
    const dark={text:'#f3f4f7',muted:'#b2b8c3',surface:'#2b2d32',surface2:'#22252b',surface3:'#34373e',mica:'#20242b',glass:'#262b33',border:'#ffffff2b',hover:'#ffffff12'};
    const resolveMode=mode=>mode==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;
    const legacyFor=t=>({theme:t.appMode,accent:t.accent,transparency:t.transparency,motion:t.motion,highContrast:t.contrast.enabled,fontSize:t.fontSize,align:t.taskbar.align,wallpaper:t.background.builtin});
    function syncLegacy(){mirror=legacyFor(current);Object.assign(OS.settings,mirror);}
    function record(next=current,list=saved){return{version:1,revision:revision+1,current:next,saved:list};}
    async function persist(next,list){
        const payload=record(next,list),settings={...OS.settings,...legacyFor(next)};
        if(JSON.stringify(payload).length>40*1024*1024)throw Error('Theme library exceeds 40 MiB. Delete unused custom themes first.');
        if(OS.db.memory){OS.db.memory.meta.set('theme-library',structuredClone(payload));OS.db.memory.meta.set('settings',structuredClone(settings));}
        else await new Promise((resolve,reject)=>{const tx=OS.db.db.transaction('meta','readwrite'),store=tx.objectStore('meta');store.put(payload,'theme-library');store.put(settings,'settings');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Theme persistence aborted.'));tx.onerror=()=>reject(tx.error);});
        revision=payload.revision;
    }
    function transact(fn){const result=queue.catch(()=>{}).then(async()=>{const next=fn(structuredClone(current),structuredClone(saved));next.current=M.normalize(next.current);for(const [name,a]of Object.entries(next.current.assets))if(current.assets[name]?.data!==a.data||current.assets[name]?.mime!==a.mime){if(A.validate(name,M.decodeBase64(a.data))!==a.mime)throw Error('Asset type mismatch: '+name);}if(next.saved.length>8)throw Error('Keep at most eight saved custom themes.');await persist(next.current,next.saved);current=next.current;saved=next.saved;syncLegacy();OS.applySettings();OS.emit('theme-change',publicTheme());return publicTheme();});queue=result;return result;}
    function publicTheme(){return{version:1,id:current.id,title:current.title,profile:current.profile,appMode:resolveMode(current.appMode),shellMode:resolveMode(current.shellMode),accent:tokens.accent||current.accent,contrast:current.contrast.enabled,tokens:{...tokens.app}};}
    function stopSounds(){soundEpoch++;for(const job of [...soundJobs])job.cancel();}
    function win32Colors(){
        const p=tokens.app||light,c=tokens.contrast?{}:current.colors,accent=tokens.accent||current.accent;
        const names=['Scrollbar','Background','ActiveTitle','InactiveTitle','Menu','Window','WindowFrame','MenuText','WindowText','TitleText','ActiveBorder','InactiveBorder','AppWorkspace','Hilight','HilightText','ButtonFace','ButtonShadow','GrayText','ButtonText','InactiveTitleText','ButtonHilight','ButtonDkShadow','ButtonLight','InfoText','InfoWindow',null,'HotTrackingColor','GradientActiveTitle','GradientInactiveTitle','MenuHilight','MenuBar'];
        const defaults=[p.surface3,current.background.color,accent,p.mica,p.surface,p.surface,p.text,p.text,p.text,M.contrastText(accent),p.muted,p.muted,p.mica,current.selection,M.contrastText(current.selection),p.surface3,p.muted,p.muted,p.text,p.muted,p.surface,p.text,p.surface2,p.text,p.surface2,'#000000',accent,accent,p.mica,current.selection,p.surface];
        if(tokens.contrast){defaults[1]=current.contrast.colors.background;defaults[13]=defaults[29]=current.contrast.colors.selection;defaults[14]=current.contrast.colors.selectedText;}
        return names.map((name,i)=>{const hex=c[name]||defaults[i],n=parseInt(hex.slice(1),16);return ((n&255)<<16)|(n&0xff00)|(n>>>16);});
    }
    function disposeResources(){stopSounds();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();soundBuffers.clear();resourceKey='';cachedAssets={};accentJob=null;}
    function assetURL(name){const a=current.assets[name];if(!a)return null;const key=name+'\0'+a.data;if(!urls.has(key))urls.set(key,URL.createObjectURL(new Blob([M.decodeBase64(a.data)],{type:a.mime})));return urls.get(key);}
    function palette(mode){return{...(mode==='dark'?dark:light)};}
    function applyTokens(){
        const root=document.documentElement,body=document.body,t=current,app=palette(resolveMode(t.appMode)),shell=palette(resolveMode(t.shellMode));
        if(t.profile==='windows'){for(const [p,mode]of [[app,resolveMode(t.appMode)],[shell,resolveMode(t.shellMode)]])Object.assign(p,mode==='light'?{text:'#1a1a1a',muted:'#606060',surface:'#ffffff',surface2:'#fbfbfb',surface3:'#f3f3f3',mica:'#eef2f7',glass:'#f3f3f3',border:'#00000014'}:{text:'#ffffff',muted:'#c5c5c5',surface:'#2d2d2d',surface2:'#272727',surface3:'#323232',mica:'#202020',glass:'#282828',border:'#ffffff16'});}
        if(t.profile==='macos26'){for(const [p,mode]of [[app,resolveMode(t.appMode)],[shell,resolveMode(t.shellMode)]])Object.assign(p,mode==='light'?{text:'#222225',muted:'#6c6c70',surface:'#ffffff',surface2:'#f6f6f8',surface3:'#e8e8ed',mica:'#eeedf1',glass:'#f4f3f7',border:'#0000001c'}:{text:'#f4f3f5',muted:'#ababaf',surface:'#29282c',surface2:'#242326',surface3:'#3a383e',mica:'#302e34',glass:'#37353c',border:'#ffffff20'});}
        if(t.profile==='ubuntu'){if(resolveMode(t.appMode)==='light')Object.assign(app,{surface2:'#fafafa',mica:'#ebebeb',surface3:'#eeeeee'});else Object.assign(app,{surface:'#303030',surface2:'#242424',mica:'#303030',surface3:'#3d3d3d'});Object.assign(shell,{text:'#ffffff',muted:'#dddddd',mica:'#242424',glass:'#242424',surface:'#333333',surface2:'#252525',surface3:'#3d3d3d',border:'#ffffff35',hover:'#ffffff20'});}
        if(t.profile==='windows'&&t.transparency){
            const bg=effectiveBackground(),tint=bg.type==='color'?bg.color:OS.themes?.imageAccent||({bloom:'#287dda',midnight:'#6c56b7',dusk:'#b24d80',sage:'#287e6c',tahoe:'#7d75e6',ubuntu:'#9c3659',graphite:'#788797'}[bg.builtin]||'#808080');
            const mix=(a,b,n)=>'#'+a.slice(1).match(/../g).map((v,i)=>Math.round(parseInt(v,16)*(1-n)+parseInt(b.slice(1+i*2,3+i*2),16)*n).toString(16).padStart(2,'0')).join('');
            app.mica=mix(app.mica,tint,resolveMode(t.appMode)==='dark'?.025:.035);
        }
        let accent=t.accent;
        if(t.autoAccent){const bg=effectiveBackground();accent=({bloom:'#287dda',midnight:'#9583e8',dusk:'#b24d80',sage:'#287e6c',tahoe:'#7d75e6',ubuntu:'#e95420',graphite:'#aeb6c7'})[bg.builtin]||accent;if(bg.type==='color')accent=bg.color;else if(bg.images.length&&OS.themes.imageAccent)accent=OS.themes.imageAccent;}
        if(t.colors.Window)app.surface=t.colors.Window;if(t.colors.WindowText)app.text=t.colors.WindowText;
        if(t.colors.ButtonFace)app.surface3=t.colors.ButtonFace;if(t.colors.GrayText)app.muted=t.colors.GrayText;
        const contrast=t.contrast.enabled||matchMedia('(forced-colors: active)').matches;
        if(contrast){const c=t.contrast.colors;for(const p of [app,shell])Object.assign(p,{text:c.text,muted:c.disabled,surface:c.background,surface2:c.background,surface3:c.button,mica:c.background,glass:c.background,border:c.text,hover:c.selection});accent=c.link;}
        tokens={app,shell,accent,contrast};
        const set=(k,v)=>root.style.setProperty(k,v);
        for(const name of M.COLORS){root.style.removeProperty('--sys-'+name.toLowerCase());if(t.colors[name]&&!contrast)set('--sys-'+name.toLowerCase(),t.colors[name]);}
        for(const [key,value]of Object.entries(app))set('--app-'+key,value);
        for(const [key,value]of Object.entries(shell))set('--shell-'+key,value);
        set('--accent',accent);set('--accent-text',M.contrastText(accent));set('--selection',contrast?t.contrast.colors.selection:(t.colors.Hilight||t.selection));set('--selection-text',contrast?t.contrast.colors.selectedText:(t.colors.HilightText||M.contrastText(t.selection)));
        set('--theme-radius',t.radius+'px');set('--theme-title-height',t.titleHeight+'px');set('--theme-border-width',t.borderWidth+'px');set('--theme-scrollbar',t.scrollbarWidth+'px');set('--theme-icon-size',t.taskbar.size+'px');
        set('--theme-active-title',t.colors.ActiveTitle||accent);set('--theme-title-text',t.colors.TitleText||M.contrastText(accent));set('--theme-inactive-title',t.colors.InactiveTitle||app.mica);set('--theme-inactive-title-text',t.colors.InactiveTitleText||app.muted);
        const font=t.font==='mono'?'var(--mono)':t.font==='serif'?'Georgia,serif':t.font==='sans'?'Arial,sans-serif':t.profile==='macos26'?'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif':t.profile==='ubuntu'?'Ubuntu,Cantarell,"Noto Sans",system-ui,sans-serif':'"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif';
        set('--font',font);set('--font-size',t.fontSize+'px');
        body.dataset.profile=t.profile;body.dataset.theme=resolveMode(t.appMode);body.dataset.shellMode=resolveMode(t.shellMode);body.dataset.glass=t.glass;body.dataset.iconStyle=t.iconStyle;
        body.dataset.dockPosition=t.taskbar.position;body.dataset.autoHide=String(t.taskbar.autoHide);
        body.classList.add('theme-managed');body.classList.toggle('theme-contrast',contrast);body.classList.toggle('no-transparency',!t.transparency||contrast);body.classList.toggle('no-motion',!t.motion||contrast);
        body.classList.toggle('theme-accent-shell',t.accentOnShell&&resolveMode(t.shellMode)==='dark'&&!contrast);body.classList.toggle('theme-accent-title',t.accentOnTitle||!!t.colors.ActiveTitle);
        for(const [k,label]of [['showSearch','search'],['showTaskView','taskview'],['showWidgets','widgets']])body.classList.toggle('theme-hide-'+label,!t.taskbar[k]);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content',shell.mica);
        for(const w of OS.windows.values())w.gpuDirty=true;
        return tokens;
    }
    function geometry(){const area=M.layout(current,innerWidth,innerHeight);const root=document.documentElement;
        for(const k of ['left','right','top','bottom'])root.style.setProperty('--work-'+k,area[k]+'px');
        root.style.setProperty('--bar-height',area.thickness+'px');root.style.setProperty('--dock-thickness',area.thickness+'px');
        document.body.dataset.dockSide=String(area.side);
        return area;
    }
    function reflow(){const area=geometry();for(const w of OS.windows.values()){if(w.maximized)w.rect={x:0,y:0,w:area.w,h:area.h};else w.constrain();w.sync();w.onResize?.();}OS.renderer?.invalidate();}
    function effectiveBackground(){const id=OS.activeDesktop,override=current.desktopBackgrounds[id];if(override)return override;const legacy=OS.desktops.find(d=>d.id===id)?.wallpaper;if(legacy&&['bloom','midnight','dusk','sage'].includes(legacy))return{...current.background,type:'builtin',builtin:legacy};return current.background;}
    const builtins={tahoe:'radial-gradient(ellipse at 80% 12%,#dab7ff 0%,transparent 52%),radial-gradient(ellipse at 10% 85%,#0654bc 0%,transparent 70%),linear-gradient(160deg,#a8c8ff 0%,#8781d9 39%,#343b87 40%,#8791dc 64%,#274d90 65%,#182f62 100%)',ubuntu:'radial-gradient(ellipse at 80% 15%,#ef632d 0%,transparent 57%),linear-gradient(140deg,#4d194d 0%,#792453 38%,#a94249 39%,#48224c 70%,#211333 100%)',graphite:'radial-gradient(ellipse at 75% 25%,#475364,transparent 70%),linear-gradient(145deg,#0d131f,#27313d)'};
    function ensureBackground(){let bg=$('#theme-background');if(!bg){bg=OS.el('div',{id:'theme-background','aria-hidden':'true'});$('#compositor').after(bg);}return bg;}
    async function calculateAccent(name){const url=assetURL(name);if(!url||accentJob===url)return;accentJob=url;try{const image=await createImageBitmap(new Blob([M.decodeBase64(current.assets[name].data)],{type:current.assets[name].mime}));const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,16,16);image.close();const data=ctx.getImageData(0,0,16,16).data;let r=0,g=0,b=0,n=0;for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;r+=data[i];g+=data[i+1];b+=data[i+2];n++;}if(n&&assetURL(name)===url&&effectiveBackground().images[slideIndex%effectiveBackground().images.length]===name){OS.themes.imageAccent='#'+[r,g,b].map(x=>Math.round(x/n).toString(16).padStart(2,'0')).join('');applyTokens();OS.renderer?.invalidate();}}catch{/* Explicit manual accent remains usable when browser image decoding is unavailable. */}finally{if(accentJob===url)accentJob=null;}}
    function renderBackground(){const bg=effectiveBackground(),node=ensureBackground();const key=JSON.stringify(bg)+'|'+OS.activeDesktop;
        if(key!==backgroundKey){backgroundKey=key;clearInterval(slideTimer);slideTimer=0;slideIndex=0;OS.themes.imageAccent=null;if(bg.type==='slideshow'&&bg.images.length>1)slideTimer=setInterval(()=>{if(!document.hidden)nextBackground();},bg.interval);}
        node.style.backgroundColor=bg.color;node.style.backgroundPosition='center';node.style.backgroundRepeat=bg.fit==='tile'?'repeat':'no-repeat';node.style.backgroundSize=bg.fit==='fit'?'contain':bg.fit==='stretch'?'100% 100%':['center','tile'].includes(bg.fit)?'auto':'cover';
        if(bg.type==='builtin'){node.style.backgroundImage=builtins[bg.builtin]||'none';node.hidden=!builtins[bg.builtin];}
        else{node.hidden=false;node.style.backgroundImage=bg.type==='color'?'none':`url("${assetURL(bg.images[slideIndex%bg.images.length])}")`;if(bg.type!=='color'&&(current.autoAccent||current.profile==='windows')&&!OS.themes.imageAccent)void calculateAccent(bg.images[slideIndex%bg.images.length]);}
        document.documentElement.style.setProperty('--theme-lock-background',node.hidden?'linear-gradient(140deg,#114583,#3468ad)':(node.style.backgroundImage==='none'?bg.color:node.style.backgroundImage));
        node.dataset.fit=bg.fit;node.dataset.slide=String(slideIndex);
    }
    function nextBackground(){const bg=effectiveBackground();if(bg.images.length<2)return;if(bg.shuffle)slideIndex=(slideIndex+1+Math.floor(Math.random()*(bg.images.length-1)))%bg.images.length;else slideIndex=(slideIndex+1)%bg.images.length;OS.themes.imageAccent=null;renderBackground();OS.emit('theme-background');}
    function cursorFrames(path){const a=current.assets[path];if(!a)return[];const bytes=M.decodeBase64(a.data);
        const frames=a.mime==='application/x-navi-animation'?A.ani(bytes):[{bytes,...(a.mime==='image/x-icon'?A.icon(bytes):{x:0,y:0,width:32,height:32}),duration:1000}];
        return frames.map((frame,i)=>{const key='cursor:'+path+':'+i;if(!urls.has(key))urls.set(key,URL.createObjectURL(new Blob([frame.bytes],{type:a.mime==='image/png'?'image/png':'image/x-icon'})));return{url:urls.get(key),x:frame.x,y:frame.y,duration:frame.duration};});}
    function applyCursor(){const t=current,c=t.cursor,key=JSON.stringify(c)+t.motion+resourceKey;if(key===cursorKey)return;cursorKey=key;clearInterval(cursorTimer);cursorTimer=0;
        const root=document.documentElement,roles={Arrow:'default',Hand:'pointer',IBeam:'text',Help:'help',Wait:'wait',AppStarting:'progress',Crosshair:'crosshair',SizeNS:'ns-resize',SizeWE:'ew-resize',SizeNWSE:'nwse-resize',SizeNESW:'nesw-resize',SizeAll:'move',No:'not-allowed',UpArrow:'n-resize',NWPen:'crosshair'};
        for(const [role,fallback]of Object.entries(roles))root.style.setProperty('--cursor-'+role.toLowerCase(),fallback);
        if(c.scheme!=='default'){const fill=c.scheme==='light'?'#ffffff':c.scheme==='accent'?tokens.accent:'#141414',stroke=M.contrastText(fill);const size=c.size;
            const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><path d="M3 2v25l7-7 5 10 5-3-6-10h11z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/></svg>`;
            root.style.setProperty('--cursor-arrow',`url("data:image/svg+xml;base64,${btoa(svg)}") 3 2, default`);
        }
        const animated=[];
        for(const [role,path]of Object.entries(c.custom)){const frames=cursorFrames(path),fallback=roles[role];if(!frames.length)continue;const set=frame=>root.style.setProperty('--cursor-'+role.toLowerCase(),`url("${frame.url}") ${frame.x} ${frame.y}, ${fallback}`);set(frames[0]);if(frames.length>1&&t.motion&&!tokens.contrast&&!matchMedia('(prefers-reduced-motion: reduce)').matches)animated.push({frames,set,index:0,next:performance.now()+frames[0].duration});}
        if(animated.length)cursorTimer=setInterval(()=>{if(document.hidden)return;const now=performance.now();for(const animation of animated)if(now>=animation.next){animation.index=(animation.index+1)%animation.frames.length;const frame=animation.frames[animation.index];animation.next=now+frame.duration;animation.set(frame);}},16);
    }
    function applyIcons(){OS.refreshIconArtwork?.();for(const node of document.querySelectorAll('.desktop-icon')){const entry=node._entry;const key=entry?.shortcut?({files:'computer',trash:'trash',browser:'network'})[entry.app]:entry?.file?.path==='/Desktop/Documents'?'documents':null;const path=key&&current.icons[key];node.classList.toggle('theme-custom-icon',!!path);if(path)node.style.setProperty('--custom-desktop-icon',`url("${assetURL(path)}")`);else node.style.removeProperty('--custom-desktop-icon');}}
    function apply(){if(!initialized)return;const names=Object.keys(current.assets);if(names.length!==Object.keys(cachedAssets).length||names.some(k=>cachedAssets[k]?.data!==current.assets[k].data)){disposeResources();cachedAssets=current.assets;resourceKey=String(Date.now());cursorKey='';backgroundKey='';}
        if(OS.settings.muted||!current.sounds.enabled||current.sounds.scheme==='none')stopSounds();applyTokens();geometry();renderBackground();applyCursor();applyIcons();OS.renderer?.invalidate();}
    function applyLegacy(){if(!initialized)return;let changed=false;const patch={};
        for(const key of Object.keys(mirror)){const value=OS.settings[key];if(value===mirror[key])continue;changed=true;
            if(key==='theme'){patch.appMode=value;patch.shellMode=value;}else if(key==='highContrast')patch.contrast={enabled:!!value};else if(key==='align')patch.taskbar={align:value};else if(key==='wallpaper')patch.background={type:'builtin',builtin:value};else patch[key]=value;}
        if(changed){current=M.merge(current,{...patch,id:'custom'});syncLegacy();clearTimeout(legacyTimer);legacyTimer=setTimeout(()=>update({}).catch(e=>OS.notify('Theme not saved',e.message,'warning')),150);}
        apply();
    }
    async function initialize(){let stored=await OS.db.get('theme-library');
        try{if(stored){if(stored.version!==1||JSON.stringify(stored).length>40*1024*1024)throw Error('Invalid theme library.');current=M.normalize(stored.current);saved=(Array.isArray(stored.saved)?stored.saved:[]).slice(0,8).map(M.normalize);revision=Number.isSafeInteger(stored.revision)?stored.revision:0;for(const t of [current,...saved])verifyAssets(t.assets);}
            else current=M.merge(current,{appMode:OS.settings.theme,shellMode:OS.settings.theme,accent:OS.settings.accent,selection:OS.settings.accent,transparency:OS.settings.transparency,motion:OS.settings.motion,fontSize:OS.settings.fontSize,contrast:{enabled:OS.settings.highContrast},taskbar:{align:OS.settings.align},background:{builtin:OS.settings.wallpaper}});
        }catch(error){current=M.getPreset('windows-light');saved=[];OS.themes.warnings=['Theme recovery: '+error.message];}
        if(new URLSearchParams(location.search).get('theme')==='reset')current=M.getPreset('windows-light');initialized=true;syncLegacy();apply();
    }
    function update(patch){clearTimeout(legacyTimer);return transact((t,list)=>({current:M.merge(t,{...patch,id:'custom'}),saved:list}));}
    async function select(id){clearTimeout(legacyTimer);return transact((t,list)=>{const found=list.find(v=>v.id===id)||M.PRESETS.find(v=>v.id===id);if(!found)throw Error('Theme not found.');return{current:structuredClone(found),saved:list};}).then(value=>{for(const d of OS.desktops)delete d.wallpaper;void OS.db.set('desktops',OS.desktops);backgroundKey='';apply();reflow();return value;});}
    function saveCurrent(title){return transact((t,list)=>{if(!title||!title.trim())throw Error('Enter a theme name.');const item=M.normalize({...t,id:'user-'+OS.uid().replace(/[^a-z\d-]/gi,'').toLowerCase(),title});list.push(item);return{current:item,saved:list};});}
    function remove(id){return transact((t,list)=>({current:t,saved:list.filter(x=>x.id!==id)}));}
    function verifyAssets(assets){for(const [name,a]of Object.entries(assets)){if(A.validate(name,M.decodeBase64(a.data))!==a.mime)throw Error('Asset type mismatch: '+name);}}
    async function importFiles(files){if(!files?.length)return null;let entries=[];const primary=files.find(f=>/\.(astertheme|json|theme|themepack|deskthemepack|cab|zip)$/i.test(f.name))||files[0];if(primary.size>32*1024*1024)throw Error('Theme package exceeds 32 MiB.');
        const ext=primary.name.split('.').at(-1).toLowerCase();let theme,warnings=[];
        if(ext==='json'||ext==='astertheme'){const body=JSON.parse(await primary.text());if(body.format!=='aster-theme'||body.version!==1)throw Error('This is not an Aster theme.');theme=M.normalize(body.theme);verifyAssets(theme.assets);}
        else {
            if(['themepack','deskthemepack','cab'].includes(ext))entries=await AsterThemePacks.run('unpack',new Uint8Array(await primary.arrayBuffer()));
            else if(ext==='zip')entries=await AsterZIP.run('unpack',new Uint8Array(await primary.arrayBuffer()));
            else if(ext==='theme'){for(const f of files){if(f.size>16*1024*1024)throw Error('Theme file exceeds 16 MiB.');entries.push({name:f.webkitRelativePath||f.name,bytes:new Uint8Array(await f.arrayBuffer())});}}
            else throw Error('Choose .theme, .themepack, .deskthemepack, .cab, .zip or .astertheme. Native .msstyles are not executable here.');
            const themes=entries.filter(e=>/\.theme$/i.test(e.name));if(themes.length!==1)throw Error('A theme pack must contain exactly one .theme file.');const assets={};let total=0;
            for(const entry of entries){if(entry===themes[0]||entry.name.endsWith('/'))continue;const name=M.safePath(entry.name.replace(/\\/g,'/'));
                if(!A.MIME[name.split('.').at(-1).toLowerCase()]){warnings.push('Unsupported asset not installed: '+name);continue;}
                total+=entry.bytes.length;if(total>M.LIMIT)throw Error('Theme assets exceed 16 MiB.');const mime=A.validate(name,entry.bytes);assets[name]={mime,data:M.encodeBase64(entry.bytes)};}
            const result=M.fromWindows(M.decodeText(themes[0].bytes),assets);theme=result.theme;warnings.push(...result.warnings);
        }
        theme.id='custom';return{theme,warnings};
    }
    function install(theme){theme=M.normalize(theme);verifyAssets(theme.assets||{});return transact((t,list)=>({current:M.normalize(theme),saved:list})).then(value=>{backgroundKey='';apply();reflow();return value;});}
    async function exportTheme(kind='astertheme'){
        const theme=M.normalize(current);
        if(kind==='astertheme')return new Blob([JSON.stringify({format:'aster-theme',version:1,theme},null,2)],{type:'application/json'});
        if(kind==='theme')return new Blob(['\ufeff'+M.toWindows(theme)],{type:'text/plain;charset=utf-8'});
        if(!['themepack','zip'].includes(kind))throw Error('Unsupported theme export format.');
        const entries=[{name:'Aster.theme',bytes:new TextEncoder().encode('\ufeff'+M.toWindows(theme))},...Object.entries(theme.assets).map(([name,a])=>({name,bytes:M.decodeBase64(a.data)}))];
        if(kind==='zip')return AsterZIP.run('pack',entries);
        return new Blob([await AsterThemePacks.run('pack',entries)],{type:'application/vnd.ms-cab-compressed'});
    }
    async function addAssets(files,target,options={}){if(!files?.length||files.length>(target==='background'?24:1))throw Error('Choose one resource, or up to 24 wallpaper images.');const assets={...current.assets},names=[];let n=0;
        for(const file of files){if(file.size>8*1024*1024)throw Error('Each theme asset is limited to 8 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());const ext=file.name.split('.').at(-1).toLowerCase(),mime=A.validate(file.name,bytes);const name=(target==='background'?'DesktopBackground/':'')+'asset-'+Date.now()+'-'+(n++)+'.'+ext;assets[name]={mime,data:M.encodeBase64(bytes)};names.push(name);}
        let patch={assets};
        if(target==='background'){const bg={...effectiveBackground(),type:names.length>1?'slideshow':'picture',images:names};if(options.desktop)patch.desktopBackgrounds={...current.desktopBackgrounds,[OS.activeDesktop]:bg};else{patch.background=bg;patch.desktopBackgrounds={};}}
        if(target==='cursor')patch.cursor={custom:{...current.cursor.custom,[options.role||'Arrow']:names[0]}};
        if(target==='sound')patch.sounds={enabled:true,scheme:'custom',events:{...current.sounds.events,[options.event||'SystemAsterisk']:names[0]}};
        if(target==='icon')patch.icons={...current.icons,[options.icon||'computer']:names[0]};
        await update(patch);if(target==='background'&&!options.desktop){for(const d of OS.desktops)delete d.wallpaper;await OS.db.set('desktops',OS.desktops);backgroundKey='';apply();}
        return publicTheme();
    }
    async function playSound(event='SystemAsterisk',preview=false){
        const sound=current.sounds;
        if(!sound.enabled||sound.scheme==='none'||OS.settings.muted||!OS.settings.volume||!sound.volume||(!preview&&OS.quiet?.active())||soundJobs.size>=4)return false;
        OS.unlockAudio?.();const ctx=OS.audioContext;if(!ctx||ctx.state!=='running')return false;
        const epoch=soundEpoch,volume=OS.settings.volume/100*sound.volume/100*.4;
        const gain=ctx.createGain();gain.gain.value=volume;gain.connect(ctx.destination);
        let node,closed=false,timer=0;
        // Natural end, explicit stop, cancellation and decode failure may race.
        // Release resources exactly once and never count a cancelled decode as active.
        const release=()=>{if(closed)return;closed=true;clearTimeout(timer);soundJobs.delete(job);if(node){node.onended=null;try{node.stop();}catch{}node.disconnect();}gain.disconnect();};
        const job={cancel:release};soundJobs.add(job);
        try{
            const path=sound.events[event];
            if(path){
                let buffer=soundBuffers.get(path);
                if(!buffer){buffer=await ctx.decodeAudioData(M.decodeBase64(current.assets[path].data).buffer);if(buffer.duration>10)throw Error('Theme sound exceeds ten seconds.');if(soundBuffers.size>=16)soundBuffers.clear();if(epoch===soundEpoch)soundBuffers.set(path,buffer);}
                if(closed||epoch!==soundEpoch||OS.settings.muted){release();return false;}
                node=ctx.createBufferSource();node.buffer=buffer;
            }else{
                node=ctx.createOscillator();node.type='sine';const base=sound.scheme==='soft'?440:660;
                node.frequency.value=base;node.frequency.exponentialRampToValueAtTime(base*1.25,ctx.currentTime+.14);
                gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(volume,ctx.currentTime+.025);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.28);
            }
            node.connect(gain);node.onended=()=>{if(!closed)audioEnded++;release();};node.start();
            const duration=node.buffer?Math.min(10,node.buffer.duration):.3;node.stop(ctx.currentTime+duration);
            timer=setTimeout(release,Math.ceil(duration*1000)+2000);return true;
        }catch(error){release();console.info('Theme sound unavailable:',error.message);return false;}
    }
    OS.themes={win32Colors,initialize,applyLegacy,apply,update,select,saveCurrent,remove,install,importFiles,exportTheme,addAssets,playSound,nextBackground,reflow,effectiveBackground,
        get artwork(){return{profile:current.profile,family:current.iconFamily};},get visual(){return{profile:current.profile,glass:current.glass,transparency:current.transparency,motion:current.motion,contrast:current.contrast.enabled,optics:{...current.optics}};},get current(){return structuredClone(current);},get saved(){return structuredClone(saved);},get presets(){return structuredClone(M.PRESETS);},get tokens(){return tokens;},get metrics(){return {radius:current.radius,titleHeight:current.titleHeight};},get chrome(){return {profile:current.profile,taskbar:{...current.taskbar}};},get ready(){return initialized;},get revision(){return revision;},get pending(){return queue;},get diagnostics(){return{urls:urls.size,slideTimer:!!slideTimer,cursorTimer:!!cursorTimer,playing:soundJobs.size,audioEnded};},warnings:[],imageAccent:null,workArea:()=>M.layout(current,innerWidth,innerHeight),publicTheme};
    OS.on('windows',()=>{if(initialized)renderBackground();});
    OS.on('window-ready',()=>{OS.decorateTaskbar?.($('#taskbar'));});
    OS.on('desktop-rendered',()=>{if(initialized)applyIcons();});
    OS.on('notification',e=>{if(initialized)void playSound(e.kind==='warning'?'SystemExclamation':e.kind==='error'?'SystemHand':'SystemAsterisk');});
    OS.on('window-action',e=>{void playSound(e.action);});
    OS.on('theme-change',()=>reflow());
    for(const media of ['(prefers-color-scheme: dark)','(forced-colors: active)','(prefers-reduced-motion: reduce)'])matchMedia(media).addEventListener?.('change',()=>{cursorKey='';apply();OS.emit('theme-change',publicTheme());});
    window.addEventListener('resize',()=>{if(initialized)geometry();});
    window.addEventListener('pagehide',()=>{clearInterval(slideTimer);clearInterval(cursorTimer);slideTimer=cursorTimer=0;disposeResources();backgroundKey=cursorKey='';});
    window.addEventListener('pageshow',event=>{if(event.persisted&&initialized){apply();reflow();}});
})();
