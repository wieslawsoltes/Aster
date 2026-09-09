/* Declarative theme contract, presets and Windows .theme interoperability. MIT.
 * No CSS, scripts, native binaries, external URLs or host paths are executed.
 */
'use strict';
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AsterThemeModels = api;
})(globalThis, () => {
    const LIMIT = 16 * 1024 * 1024;
    const PROFILES = ['windows', 'macos26', 'ubuntu'];
    const FITS = ['fill', 'fit', 'stretch', 'tile', 'center', 'span'];
    const ROLES = ['Arrow','Help','AppStarting','Wait','Crosshair','IBeam','No','SizeNS','SizeWE','SizeNWSE','SizeNESW','SizeAll','UpArrow','Hand','NWPen'];
    const EVENTS = ['SystemAsterisk','SystemExclamation','SystemHand','SystemQuestion','SystemStart','SystemExit','Open','Close','Minimize','Maximize','RestoreDown','MenuCommand','EmptyRecycleBin'];
    const COLORS = ['Background','Window','WindowText','Menu','MenuText','ButtonFace','ButtonText','GrayText','Hilight','HilightText','ActiveTitle','TitleText','InactiveTitle','InactiveTitleText','ActiveBorder','InactiveBorder','WindowFrame','Scrollbar','InfoWindow','InfoText','HotTrackingColor','ButtonShadow','ButtonHilight','ButtonDkShadow','ButtonLight','AppWorkspace','GradientActiveTitle','GradientInactiveTitle','MenuHilight','MenuBar'];
    const color = (v, fallback = '#176ae6') => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;
    const choice = (v, values, fallback) => values.includes(v) ? v : fallback;
    const number = (v, min, max, fallback) => typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.max(min, Math.min(max, v))) : fallback;
    const bool = (v, fallback) => typeof v === 'boolean' ? v : fallback;
    const text = (v, fallback, max = 80) => typeof v === 'string' && !/[\x00-\x1f\x7f]/.test(v) ? v.slice(0, max).trim() || fallback : fallback;
    function safePath(path) {
        if (typeof path !== 'string' || path.length > 240 || !path || /[\\:\x00-\x1f\x7f]/.test(path)) throw Error('Unsafe theme asset path.');
        if (path.split('/').some(p => !p || p === '.' || p === '..' || ['__proto__','constructor','prototype'].includes(p.toLowerCase()) || p.startsWith('.') || /[. ]$/.test(p))) throw Error('Unsafe theme asset path.');
        return path;
    }
    const BASE = {
        version: 1, id: 'windows-light', title: 'Windows Light', profile: 'windows',
        shellMode: 'light', appMode: 'light', accent: '#176ae6', selection: '#176ae6', autoAccent: false,
        accentOnShell: false, accentOnTitle: false, transparency: true, motion: true,
        optics: {quality:'balanced',bend:65,dispersion:8,magnify:true},
        glass: 'clear', iconStyle: 'colorful', font: 'system', fontSize: 13, titleHeight: 32,
        borderWidth: 1, radius: 8, scrollbarWidth: 10,
        taskbar: { position: 'bottom', align: 'center', size: 40, autoHide: false, showSearch: true, showTaskView: true, showWidgets: true },
        background: { type: 'builtin', builtin: 'bloom', color: '#123b75', fit: 'fill', images: [], interval: 60000, shuffle: false },
        cursor: { scheme: 'default', size: 24, custom: {} },
        sounds: { enabled: false, scheme: 'aster', volume: 35, events: {} },
        contrast: { enabled: false, colors: { background: '#000000', text: '#ffffff', link: '#ffff00', disabled: '#9f9f9f', selection: '#00ffff', selectedText: '#000000', button: '#000000' } },
        colors: {}, icons: {}, assets: {}, desktopBackgrounds: {}
    };
    function normalize(input = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid theme descriptor.');
        if (input.version !== undefined && input.version !== 1) throw Error('Unsupported theme descriptor version.');
        const o = input, b = BASE, t = {};
        t.version = 1; t.id = /^[a-z][a-z\d-]{0,63}$/.test(o.id || '') ? o.id : 'custom';
        t.title = text(o.title, 'Custom theme'); t.profile = choice(o.profile, PROFILES, b.profile);
        for (const k of ['shellMode','appMode']) t[k] = choice(o[k], ['light','dark','auto'], b[k]);
        for (const k of ['accent','selection']) t[k] = color(o[k], o.accent && k === 'selection' ? color(o.accent) : b[k]);
        for (const k of ['autoAccent','accentOnShell','accentOnTitle','transparency','motion']) t[k] = bool(o[k], b[k]);
        const optics=o.optics||{};t.optics={quality:choice(optics.quality,['balanced','high','blur'],'balanced'),bend:number(optics.bend,0,100,65),dispersion:number(optics.dispersion,0,25,8),magnify:bool(optics.magnify,true)};
        t.glass = choice(o.glass, ['clear','tinted'], b.glass); t.iconStyle = choice(o.iconStyle, ['colorful','dark','tinted','clear'], b.iconStyle);
        t.font = choice(o.font, ['system','sans','serif','mono'], b.font);
        for (const [k,min,max] of [['fontSize',11,22],['titleHeight',30,52],['borderWidth',1,4],['radius',0,20],['scrollbarWidth',8,24]]) t[k] = number(o[k],min,max,b[k]);
        const bar = o.taskbar || {}, db = b.taskbar;
        t.taskbar = { position: choice(bar.position, ['bottom','left','right'], t.profile === 'ubuntu' ? 'left' : 'bottom'), align: choice(bar.align,['center','left'],db.align), size: number(bar.size,32,64,db.size) };
        for (const k of ['autoHide','showSearch','showTaskView','showWidgets']) t.taskbar[k] = bool(bar[k],db[k]);
        if (t.profile === 'windows') t.taskbar.position = 'bottom';
        const assets = o.assets || {}; let total = 0;
        if (Object.keys(assets).length > 64) throw Error('A theme supports at most 64 assets.');
        t.assets = {};
        for (const [name,a] of Object.entries(assets)) {
            safePath(name);
            if (!a || !['image/png','image/jpeg','image/webp','image/gif','image/bmp','image/x-icon','application/x-navi-animation','audio/wav'].includes(a.mime) || typeof a.data !== 'string' || a.data.length > LIMIT*4/3+4 || a.data.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)) throw Error('Invalid theme asset: ' + name);
            total += a.data.length * .75; if (total > LIMIT) throw Error('Theme assets exceed 16 MiB.');
            t.assets[name] = { mime: a.mime, data: a.data };
        }
        function assetMap(value, keys, prefix) {
            const out = {};
            for (const k of keys) if (typeof value?.[k] === 'string') {
                const path = safePath(value[k]);
                if (!t.assets[path]) throw Error('Missing theme asset: ' + path);
                if (prefix && !t.assets[path].mime.startsWith(prefix)) throw Error('Incorrect asset type: ' + path);
                out[k] = path;
            }
            return out;
        }
        function background(v = {}) {
            const d = b.background, bg = { type: choice(v.type,['builtin','color','picture','slideshow'],d.type), builtin: choice(v.builtin,['bloom','midnight','dusk','sage','tahoe','ubuntu','graphite'],d.builtin), color: color(v.color,d.color), fit: choice(v.fit,FITS,d.fit), images: [], interval: number(v.interval,10000,86400000,d.interval), shuffle: bool(v.shuffle,d.shuffle) };
            if (Array.isArray(v.images)) for (const name of v.images.slice(0,24)) {
                safePath(name); if (!t.assets[name]?.mime.startsWith('image/')) throw Error('Missing wallpaper image: ' + name);
                if (!bg.images.includes(name)) bg.images.push(name);
            }
            if (['picture','slideshow'].includes(bg.type) && !bg.images.length) bg.type = 'builtin';
            return bg;
        }
        t.background = background(o.background);
        t.desktopBackgrounds = {};
        for (const [id,bg] of Object.entries(o.desktopBackgrounds || {}).slice(0,16)) if (/^[\w-]{1,80}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id)) t.desktopBackgrounds[id] = background(bg);
        const c = o.cursor || {}; t.cursor = { scheme: choice(c.scheme,['default','light','dark','accent'],b.cursor.scheme), size:number(c.size,24,64,24), custom:assetMap(c.custom,ROLES,null) };
        for (const path of Object.values(t.cursor.custom)) if (!['image/x-icon','image/png','application/x-navi-animation'].includes(t.assets[path].mime)) throw Error('A cursor must be PNG, CUR or ANI.');
        const s = o.sounds || {}; t.sounds = { enabled: bool(s.enabled,false), scheme: choice(s.scheme,['aster','soft','none','custom'],'aster'), volume:number(s.volume,0,100,35), events:assetMap(s.events,EVENTS,'audio/') };
        const h = o.contrast || {}; t.contrast = { enabled:bool(h.enabled,false), colors:{} };
        for (const k of Object.keys(b.contrast.colors)) t.contrast.colors[k] = color(h.colors?.[k],b.contrast.colors[k]);
        t.colors = {}; for (const k of COLORS) if (o.colors?.[k]) t.colors[k] = color(o.colors[k]);
        t.icons = assetMap(o.icons,['computer','documents','trash','network'],'image/');
        return t;
    }
    function merge(theme, patch) {
        const n = structuredClone(theme);
        for (const [key,v] of Object.entries(patch)) {
            if (['taskbar','background','cursor','sounds','contrast','optics'].includes(key)) n[key] = {...n[key], ...v};
            else n[key] = v;
        }
        return normalize(n);
    }
    const preset = (id,title,patch) => normalize({...structuredClone(BASE),id,title,...patch});
    const PRESETS = [
        preset('windows-light','Windows Light',{}),
        preset('windows-dark','Windows Dark',{shellMode:'dark',appMode:'dark',background:{builtin:'midnight'}}),
        preset('windows-custom','Windows Custom',{shellMode:'dark',appMode:'light'}),
        preset('macos26-light','macOS 26 · Glass',{profile:'macos26',accent:'#007aff',selection:'#007aff',radius:18,titleHeight:46,background:{builtin:'tahoe'},taskbar:{size:52}}),
        preset('macos26-dark','macOS 26 · Dark',{profile:'macos26',shellMode:'dark',appMode:'dark',accent:'#82acff',selection:'#517eca',radius:18,titleHeight:46,glass:'tinted',background:{builtin:'tahoe'},taskbar:{size:52}}),
        preset('ubuntu-light','Ubuntu GNOME · Light',{profile:'ubuntu',accent:'#e95420',selection:'#c74414',radius:12,titleHeight:46,background:{builtin:'ubuntu'},taskbar:{position:'left',size:46}}),
        preset('ubuntu-dark','Ubuntu GNOME · Dark',{profile:'ubuntu',shellMode:'dark',appMode:'dark',accent:'#ed764c',selection:'#ba431f',radius:12,titleHeight:46,background:{builtin:'ubuntu'},taskbar:{position:'left',size:46}}),
        preset('aster-sage','Aster Sage',{accent:'#257966',selection:'#257966',background:{builtin:'sage'}}),
        preset('aster-rose','Aster Rose',{accent:'#a63666',selection:'#a63666',background:{builtin:'dusk'},radius:12}),
        preset('aster-graphite','Aster Graphite',{shellMode:'dark',appMode:'dark',accent:'#c6c8d1',selection:'#666a7a',transparency:false,radius:3,background:{builtin:'graphite'}}),
        preset('contrast-night','Contrast · Night',{shellMode:'dark',appMode:'dark',transparency:false,motion:false,contrast:{enabled:true},background:{type:'color',color:'#000000'}}),
        preset('contrast-day','Contrast · Day',{transparency:false,motion:false,contrast:{enabled:true,colors:{background:'#ffffff',text:'#000000',button:'#ffffff',link:'#0000bb',disabled:'#666666',selection:'#000000',selectedText:'#ffffff'}},background:{type:'color',color:'#ffffff'}})
    ];
    const getPreset = id => structuredClone(PRESETS.find(t => t.id === id) || PRESETS[0]);
    function layout(t, width, height) {
        const mobile = width < 600, top = t.profile === 'windows' ? 0 : 30;
        const side = !mobile && t.taskbar.position !== 'bottom' && t.profile !== 'windows';
        const thickness = t.profile === 'windows' ? Math.max(48,t.taskbar.size + 8) : t.taskbar.size + 18;
        const reserve = t.taskbar.autoHide ? 4 : thickness + (t.profile === 'macos26' || mobile ? 10 : 0);
        const left = side && t.taskbar.position === 'left' ? reserve : 0;
        const right = side && t.taskbar.position === 'right' ? reserve : 0;
        const bottom = side ? 0 : reserve;
        return {x:left,y:top,w:Math.max(200,width-left-right),h:Math.max(120,height-top-bottom),left,right,top,bottom,thickness,side,mobile};
    }
    function contrastText(hex) {
        const rgb = color(hex).slice(1).match(/../g).map(s=>parseInt(s,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
        const l = .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
        return (l+.05)/.05 >= 1.05/(l+.05) ? '#000000' : '#ffffff';
    }
    function parseINI(source) {
        if (typeof source !== 'string' || source.length > 256*1024) throw Error('Theme text exceeds 256 KiB.');
        const sections = Object.create(null); let current=null, entries=0;
        for (const raw of source.replace(/^\ufeff/,'').split(/\r?\n/)) {
            const line=raw.trim(); if (!line || /^[;#]/.test(line)) continue;
            const m=line.match(/^\[([^\]\x00-\x1f]{1,200})\]$/);
            if (m) { const key=m[1].toLowerCase(); current=sections[key] ||= Object.create(null); continue; }
            const eq=line.indexOf('='); if (!current || eq<1) throw Error('Malformed .theme INI line.');
            const key=line.slice(0,eq).trim().toLowerCase(), value=line.slice(eq+1).trim();
            if (++entries>2048 || value.length>65536 || /[\x00-\x08]/.test(value)) throw Error('Theme entry limit exceeded.');
            current[key]=value;
        }
        return sections;
    }
    const decodeBase64 = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    const encodeBase64 = bytes => {let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
    function fromWindows(source, supplied={}) {
        const ini=parseINI(source), warnings=[], refs=[], base=getPreset('windows-light');
        if (!ini['control panel\\desktop'] || !ini.visualstyles || ini.masterthemeselector?.mtsm!=='DABJDKT') throw Error('Missing required Windows theme sections or MasterThemeSelector tag.');
        const suppliedTheme=normalize({assets:supplied}); base.assets=suppliedTheme.assets;
        const resolve=(path,role)=>{
            if (!path) return null;
            const p=path.replace(/^"|"$/g,'').replace(/\\/g,'/');
            refs.push({path,role});
            let match=Object.keys(base.assets).find(k=>k.toLowerCase()===p.toLowerCase());
            if (!match) {const candidates=Object.keys(base.assets).filter(k=>k.split('/').at(-1).toLowerCase()===p.split('/').at(-1).toLowerCase());if(candidates.length===1)match=candidates[0];}
            if (!match) warnings.push('Not loaded: '+role+' — '+path+' (supply the asset; host paths and remote URLs are never fetched).');
            return match||null;
        };
        base.title=text(ini.theme?.displayname,'Imported Windows theme');
        if(base.title.startsWith('@')){warnings.push('Localized resource name not resolved: '+base.title);base.title='Imported Windows theme';}
        const v=ini.visualstyles, d=ini['control panel\\desktop'];
        if (v.colorizationcolor && /^(?:0x)?[\da-f]{8}$/i.test(v.colorizationcolor)) base.accent=base.selection='#'+v.colorizationcolor.replace(/^0x/i,'').slice(2).toLowerCase();
        if(v.transparency!==undefined)base.transparency=v.transparency==='1';
        if(v.path)warnings.push('Native visual style is not executed: '+v.path+'. Colors and supported settings are mapped to Aster controls.');
        for (const key of COLORS) {
            const value=ini['control panel\\colors']?.[key.toLowerCase()]; if(value===undefined)continue;
            const rgb=value.split(/\s+/).map(Number);
            if(rgb.length!==3||rgb.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('Invalid Windows system color: '+key);
            base.colors[key]='#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('');
        }
        base.background.color=base.colors.Background||base.background.color;
        base.background.fit=d.tilewallpaper==='1'?'tile':({'0':'center','2':'stretch','6':'fit','10':'fill','22':'span'}[d.wallpaperstyle]||'fill');
        const image=resolve(d.wallpaper,'Wallpaper'); if(image){base.background.type='picture';base.background.images=[image];}
        const slide=ini.slideshow;
        if(slide){const images=Object.entries(slide).filter(([k])=>/^item\d+path$/.test(k)).sort(([a],[b])=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0])).map(([,p])=>resolve(p,'Slideshow image')).filter(Boolean);
            if(!images.length&&slide.imagesrootpath)for(const k of Object.keys(base.assets))if(base.assets[k].mime.startsWith('image/')&&!/\.(ico|cur)$/i.test(k))images.push(k);
            if(images.length){base.background.type='slideshow';base.background.images=images;base.background.interval=number(Number(slide.interval),10000,86400000,60000);base.background.shuffle=slide.shuffle==='1';}
            if(slide.rssfeed)warnings.push('RSS background feeds are not fetched. Supply local images.');}
        const cursor=ini['control panel\\cursors'];for(const role of ROLES){const p=resolve(cursor?.[role.toLowerCase()],role+' cursor');if(p)base.cursor.custom[role]=p;}
        for(const [section,values]of Object.entries(ini))if(section.startsWith('appevents\\schemes\\apps\\')){
            const name=section.split('\\').at(-1),event=EVENTS.find(e=>e.toLowerCase()===name);if(!event){warnings.push('Unsupported sound event: '+name);continue;}
            const path=resolve(values.defaultvalue,event+' sound');if(path){base.sounds.events[event]=path;base.sounds.scheme='custom';base.sounds.enabled=true;}}
        const guids={computer:'20d04fe0-3aea-1069-a2d8-08002b30309d',documents:'59031a47-3f72-44a7-89c5-5595fe6b30ee',network:'f02c1a0d-be21-4350-88b0-7367fc96ef3c',trash:'645ff040-5081-101b-9f08-00aa002f954e'};
        for(const [key,guid]of Object.entries(guids)){const p=ini['clsid\\{'+guid+'}\\defaulticon'];const a=resolve(p?.defaultvalue||p?.empty,key+' icon');if(a)base.icons[key]=a;}
        if(ini['control panel\\desktop\\windowmetrics']&&Object.keys(ini['control panel\\desktop\\windowmetrics']).length)warnings.push('Native WindowMetrics registry values are not applied; use Aster metrics controls.');
        if(ini.sounds?.schemename)warnings.push('Native sound-scheme name is not resolved: '+ini.sounds.schemename+'. Supply WAV event files.');
        if(d.pattern)warnings.push('Legacy desktop Pattern is not applied.');
        if(ini.metrics&&Object.keys(ini.metrics).length)warnings.push('Binary NONCLIENTMETRICS/ICONMETRICS are not applied; use Aster metrics controls.');
        if(ini.boot?.['scrnsave.exe'])warnings.push('Native .scr screen savers are not executed.');
        if(ini.theme?.brandimage)warnings.push('BrandImage is metadata only; previews are generated from theme settings.');
        const known=['theme','control panel\\desktop','control panel\\colors','control panel\\cursors','visualstyles','masterthemeselector','slideshow','metrics','control panel\\desktop\\windowmetrics','sounds','boot','aster'];
        for(const key of Object.keys(ini))if(!known.includes(key)&&!key.startsWith('appevents\\')&&!key.startsWith('clsid\\'))warnings.push('Unsupported section: '+key);
        let theme=base;
        if(ini.aster?.descriptor){try {const parsed=JSON.parse(new TextDecoder().decode(decodeBase64(ini.aster.descriptor)));
            const retain=bg=>{if(bg&&Array.isArray(bg.images))bg.images=bg.images.filter(path=>{if(base.assets[path])return true;warnings.push('Not loaded: wallpaper — '+path+' (companion asset missing).');return false;});};
            retain(parsed.background);for(const bg of Object.values(parsed.desktopBackgrounds||{}))retain(bg);
            for(const map of [parsed.cursor?.custom,parsed.sounds?.events,parsed.icons])if(map)for(const [key,path]of Object.entries(map))if(!base.assets[path]){warnings.push('Not loaded: '+key+' — '+path+' (companion asset missing).');delete map[key];}
            theme=normalize({...parsed,assets:base.assets});}catch(e){throw Error('Invalid Aster extension: '+e.message);}}
        return {theme:normalize(theme),warnings:[...new Set(warnings)],references:refs};
    }
    function toWindows(input) {
        const t=normalize(input), bg=t.background, lines=['; Aster portable theme. Standard Windows fields plus a non-executable Aster extension.','[Theme]','DisplayName='+t.title,'','[Control Panel\\Desktop]','Wallpaper='+(bg.images[0]||''),'TileWallpaper='+(bg.fit==='tile'?1:0),'WallpaperStyle='+({center:0,tile:0,stretch:2,fit:6,fill:10,span:22}[bg.fit]),'','[VisualStyles]','Path='+(Object.keys(t.colors).length||t.contrast.enabled?'':'%ResourceDir%\\Themes\\Aero\\Aero.msstyles'),'ColorStyle=NormalColor','Size=NormalSize','ColorizationColor=0xFF'+t.accent.slice(1).toUpperCase(),'Transparency='+(t.transparency?1:0),'','[Control Panel\\Colors]'];
        const colors={Background:bg.color,...t.colors};for(const [k,c]of Object.entries(colors))lines.push(k+'='+c.slice(1).match(/../g).map(s=>parseInt(s,16)).join(' '));
        if(bg.type==='slideshow'){lines.push('','[Slideshow]','Interval='+bg.interval,'Shuffle='+(bg.shuffle?1:0),'ImagesRootPath=DesktopBackground');bg.images.forEach((p,i)=>lines.push('Item'+i+'Path='+p));}
        lines.push('','[Control Panel\\Cursors]');for(const [role,path]of Object.entries(t.cursor.custom))lines.push(role+'='+path);
        for(const [event,path]of Object.entries(t.sounds.events))lines.push('','[AppEvents\\Schemes\\Apps\\'+(event==='EmptyRecycleBin'?'Explorer':'.Default')+'\\'+event+']','DefaultValue='+path);
        const guids={computer:'20D04FE0-3AEA-1069-A2D8-08002B30309D',documents:'59031A47-3F72-44A7-89C5-5595FE6B30EE',network:'F02C1A0D-BE21-4350-88B0-7367FC96EF3C',trash:'645FF040-5081-101B-9F08-00AA002F954E'};
        for(const [key,path]of Object.entries(t.icons))lines.push('','[CLSID\\{'+guids[key]+'}\\DefaultIcon]','DefaultValue='+path,...(key==='trash'?['Empty='+path,'Full='+path]:[]));
        const descriptor={...t,assets:{}};
        lines.push('','[MasterThemeSelector]','MTSM=DABJDKT','','[Aster]','Descriptor='+encodeBase64(new TextEncoder().encode(JSON.stringify(descriptor))),'');
        return lines.join('\r\n');
    }
    function decodeText(bytes){if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le',{fatal:true}).decode(bytes);if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be',{fatal:true}).decode(bytes);try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1252').decode(bytes);}}
    return {BASE,PRESETS,PROFILES,FITS,ROLES,EVENTS,COLORS,LIMIT,normalize,merge,getPreset,layout,color,contrastText,safePath,parseINI,fromWindows,toWindows,decodeBase64,encodeBase64,decodeText};
});
