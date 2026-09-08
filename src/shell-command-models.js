/* Bounded shell routing models. No evaluation, network or host process execution. MIT. */
'use strict';
((root) => {
    const IMAGE = 'png jpg jpeg gif webp bmp avif ico svg'.split(' ');
    const MEDIA = 'mp3 wav ogg mp4 webm m4a flac aac opus mov'.split(' ');
    const TEXT = 'txt md json js css csv log xml yaml yml ini conf c h cpp cs py sh bat sql'.split(' ');
    const STARTUP = Object.freeze(['files','notepad','calculator','calendar','clock','tasks','terminal','settings']);
    const SECTIONS = Object.freeze({'':'home',defaultapps:'defaultapps',startupapps:'startupapps',display:'display',sound:'sound',notifications:'notifications',focus:'focus',clipboard:'clipboard',storagesense:'storage',multitasking:'multitasking',recovery:'recovery',personalization:'personalization',themes:'themes','personalization-background':'background','personalization-colors':'colors',taskbar:'taskbar-theme','easeofaccess-highcontrast':'contrast-themes','easeofaccess-display':'accessibility',privacy:'privacy',about:'about','dateandtime':'time'});
    const ALIASES = Object.freeze({notepad:'notepad',calc:'calculator',calculator:'calculator',explorer:'files',mspaint:'paint',paint:'paint',taskmgr:'taskmanager',control:'settings',settings:'settings',winver:'settings',snippingtool:'snips',clock:'clock',calendar:'calendar',terminal:'terminal'});
    const FOLDERS = Object.freeze({desktop:'/Desktop',personal:'/Documents',documents:'/Documents',downloads:'/Downloads',pictures:'/Pictures',music:'/Music',videos:'/Videos',recyclebinfolder:'/.Trash'});
    const extension = path => { const n=String(path).split('/').pop(),i=n.lastIndexOf('.');return i>0&&/^[a-z0-9_-]{1,20}$/i.test(n.slice(i+1))?n.slice(i+1).toLowerCase():''; };
    function candidates(path,mime='') {
        const ext=extension(path);
        if(ext==='exe')return ['win32'];
        if(ext==='zip')return ['files'];
        if(['html','htm'].includes(ext))return ['browser','notepad'];
        if(IMAGE.includes(ext)||mime.startsWith('image/'))return ext==='svg'?['photos','paint','notepad']:['photos','paint'];
        if(MEDIA.includes(ext)||/^(audio|video)\//.test(mime))return ['media'];
        return ['notepad'];
    }
    const defaultHandler=(path,mime='',defaults={})=>{const available=candidates(path,mime),chosen=Object.hasOwn(defaults,extension(path))?defaults[extension(path)]:null;return available.includes(chosen)?chosen:available[0];};
    const knownExtensions=Object.freeze([...new Set([...IMAGE,...MEDIA,...TEXT,'html','htm','zip','exe'])].sort());
    const validPath=path=>typeof path==='string'&&path.length<=1024&&path.startsWith('/')&&!path.includes('\\')&&!/[\x00-\x1f\x7f:]/.test(path)&&!path.includes('//')&&!path.split('/').some(s=>s==='..'||s==='.')&&path!=='/.Trash'&&!path.startsWith('/.Trash/')&&path!=='/Local'&&!path.startsWith('/Local/')&&!path.startsWith('/.');
    function normalizeState(raw) {
        const state={defaults:{},recent:[],pins:[],runHistory:[],startup:[],trackRecent:true};
        if(!raw||typeof raw!=='object')return state;
        state.trackRecent=raw.trackRecent!==false;
        for(const [ext,app]of Object.entries(raw.defaults||{}).slice(0,128))if(/^[a-z0-9_-]{1,20}$/.test(ext)&&candidates('x.'+ext).includes(app))Object.defineProperty(state.defaults,ext,{value:app,enumerable:true,writable:true,configurable:true});
        for(const key of ['recent','pins']) {
            const seen=new Set();
            for(const item of (Array.isArray(raw[key])?raw[key]:[]).slice(0,120)) {
                if(!item||!validPath(item.path)||!['files','notepad','paint','photos','media','browser','win32'].includes(item.app))continue;
                const id=item.app+'\0'+item.path;if(seen.has(id))continue;seen.add(id);
                if(key==='recent'&&!state.trackRecent)continue;
                state[key].push({app:item.app,path:item.path,time:Number.isFinite(Number(item.time))?Math.max(0,Number(item.time)):0});
                if(state[key].length===(key==='pins'?24:60))break;
            }
        }
        for(const line of (Array.isArray(raw.runHistory)?raw.runHistory:[]).slice(0,20))if(typeof line==='string'&&line.length<=1024&&!/[\x00-\x1f]/.test(line)&&!state.runHistory.includes(line))state.runHistory.push(line);
        const used=new Set();
        for(const item of (Array.isArray(raw.startup)?raw.startup:[]).slice(0,128))if(item&&STARTUP.includes(item.app)&&!used.has(item.app)&&state.startup.length<6){used.add(item.app);state.startup.push({app:item.app,minimized:!!item.minimized});}
        return state;
    }
    function localPath(value) {
        let path=value.trim();if(path.startsWith('"')&&path.endsWith('"'))path=path.slice(1,-1);
        if(/^c:\\/i.test(path))path='/'+path.slice(3).replaceAll('\\','/');
        if(!validPath(path))throw Error('Use an Aster path such as /Documents or C:\\Documents. Network, device and parent paths are not supported.');
        return path.replace(/\/$/,'')||'/';
    }
    function parseRun(value,visibleApps=[]) {
        if(typeof value!=='string'||value.length>1024||/[\x00-\x1f]/.test(value))throw Error('Enter a single command (1,024 characters maximum).');
        const line=value.trim();if(!line)throw Error('Enter an app, folder, file or supported settings command.');
        const lower=line.toLowerCase();
        if(lower.startsWith('ms-settings:')){const key=lower.slice(12);if(!Object.hasOwn(SECTIONS,key))throw Error('That Settings page is not implemented in Aster.');return {kind:'app',app:'settings',options:{section:SECTIONS[key]}};}
        if(lower.startsWith('shell:')){const key=lower.slice(6);if(key==='startup')return {kind:'app',app:'settings',options:{section:'startupapps'}};if(key==='appsfolder')return {kind:'app',app:'store',options:{}};if(!Object.hasOwn(FOLDERS,key))throw Error('That shell folder is not supported.');return {kind:'folder',path:FOLDERS[key]};}
        if(/^(?:\/|c:\\|")/i.test(line))return {kind:'path',path:localPath(line)};
        const match=/^(\S+)(?:\s+([\s\S]+))?$/.exec(line),command=match[1].toLowerCase().replace(/\.exe$/,''),tail=match[2]||'';
        const app=Object.hasOwn(ALIASES,command)?ALIASES[command]:visibleApps.find(a=>a.id===command)?.id;
        if(!app)throw Error('Aster cannot find that command. Use a listed app or a supported shell: / ms-settings: destination.');
        if(tail&&!['notepad','files','paint','photos','media','browser'].includes(app))throw Error('Arguments are not supported for this app.');
        return {kind:'app',app,options:tail?{path:localPath(tail)}:command==='winver'?{section:'about'}:{}};
    }
    const api=Object.freeze({extension,candidates,defaultHandler,knownExtensions,STARTUP,SECTIONS,ALIASES,validPath,localPath,parseRun,normalizeState});
    root.AsterShellCommands=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
