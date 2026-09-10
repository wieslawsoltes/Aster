/* Clipboard and keyboard policy. Pure, bounded and independent of visual themes. MIT. */
'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AsterInputModels=api;})(globalThis,()=>{
    const LIMITS=Object.freeze({text:1024*1024,historyText:16384,items:100,package:2*1024*1024,image:8*1024*1024,files:32});
    const DEFAULTS=Object.freeze({keyboardProfile:'auto',shellShortcuts:true,superShortcuts:'auto',clipboardShortcut:'Ctrl+Alt+V',editorTabFocus:false,terminalPasteGuard:true,
        clipboardHistory:false,clipboardLimit:25,clipboardExpire:0,clipboardCapturePaste:false,clipboardPersistPins:true,clipboardClearOnLock:true,clipboardPlainPaste:false,clipboardBridge:true});
    const oneOf=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
    function preferences(value={}) {const p={...DEFAULTS};for(const k of Object.keys(p))if(typeof p[k]==='boolean')p[k]=typeof value[k]==='boolean'?value[k]:p[k];
        p.keyboardProfile=oneOf(value.keyboardProfile,['auto','windows','macos','linux'],'auto');p.superShortcuts=oneOf(value.superShortcuts,['auto','on','off'],'auto');
        p.clipboardShortcut=oneOf(value.clipboardShortcut,['Ctrl+Alt+V','Ctrl+Shift+H','Meta+Alt+H','none'],'Ctrl+Alt+V');
        p.clipboardLimit=oneOf(Number(value.clipboardLimit),[10,25,50,100],25);p.clipboardExpire=oneOf(Number(value.clipboardExpire),[0,15,60,1440],0);return p;}
    function platform(hint=''){return /mac|iphone|ipad|ipod/i.test(hint)?'macos':/linux|android/i.test(hint)?'linux':'windows';}
    function profile(p,hint){return preferences(p).keyboardProfile==='auto'?platform(hint):preferences(p).keyboardProfile;}
    function blocked(e){return !!(e.defaultPrevented||e.isComposing||e.keyCode===229||e.key==='Dead'||e.key==='Process'||e.getModifierState?.('AltGraph'));}
    function primary(e){return !blocked(e)&&!e.altKey&&(e.ctrlKey||e.metaKey);}
    function accelerator(e,value){if(blocked(e)||e.repeat||value==='none')return false;const parts=value.split('+'),key=parts.pop();return (e.key.toLowerCase()===key.toLowerCase()||e.altKey&&e.code==='Key'+key.toUpperCase())&&!!e.ctrlKey===parts.includes('Ctrl')&&!!e.metaKey===parts.includes('Meta')&&!!e.altKey===parts.includes('Alt')&&!!e.shiftKey===parts.includes('Shift');}
    function shellAction(e,p={},hint='',editing=false){p=preferences(p);if(blocked(e)||e.repeat||!p.shellShortcuts)return null;const key=e.key.toLowerCase();
        if(accelerator(e,p.clipboardShortcut))return 'clipboard';
        // A visual Windows theme must never turn a physical Command key into Win.
        // Editing chords remain native even with an explicit Windows keyboard profile.
        if(e.metaKey&&!e.ctrlKey&&!e.altKey&&p.superShortcuts!=='off'&&(p.superShortcuts==='on'||profile(p,hint)!=='macos')&&!editing){
            if(e.shiftKey)return key==='s'?'snips':null;
            return ({r:'run',v:'clipboard',a:'quick',n:'notifications',w:'widgets',tab:'taskview',e:'files',i:'settings',d:'desktop',l:'lock',z:'snap',arrowleft:'left',arrowright:'right',arrowup:'max',arrowdown:'min'})[key]||null;}
        if(e.ctrlKey&&e.altKey&&!e.metaKey&&!e.shiftKey)return ({f:'focus',w:'taskview',u:'accessibility',o:'run',r:'recorder',a:'quick',t:'terminal',n:'notepad',d:'desktop',l:'lock',arrowleft:'left',arrowright:'right',arrowup:'max',arrowdown:'min',tab:'taskview'})[key]||null;
        return null;}
    function transform(text,mode='plain'){if(typeof text!=='string'||text.length>LIMITS.text)throw Error('Text is limited to 1 Mi characters.');switch(mode){case'plain':return text;case'trim':return text.trim();case'line':return text.replace(/\s+/g,' ').trim();case'upper':return text.toLocaleUpperCase();case'lower':return text.toLocaleLowerCase();case'lf':return text.replace(/\r\n?/g,'\n');default:throw Error('Unknown text transformation.');}}
    class History {
        constructor(saved=[],p={}){this.entries=[];this.sequence=0;this.configure(p);for(const r of (Array.isArray(saved)?saved:[]).slice(0,this.limit).reverse())if(r&&typeof r.text==='string')this.add(r.text,true);}
        configure(p){p=preferences(p);this.limit=p.clipboardLimit;this.expire=p.clipboardExpire;this.prune();}
        prune(now=Date.now()){this.entries=this.entries.filter(e=>e.pinned||!this.expire||now-e.time<this.expire*60000);while(this.entries.length>this.limit){const unpinned=this.entries.findLastIndex(e=>!e.pinned);this.entries.splice(unpinned<0?this.entries.length-1:unpinned,1);}return this.entries;}
        add(text,pinned=false,now=Date.now()){if(typeof text!=='string'||!text||text.length>LIMITS.historyText)return false;this.prune(now);let e=this.entries.find(e=>e.text===text);if(e){e.pinned ||= pinned;e.time=now;this.entries=this.entries.filter(x=>x!==e);}else{if(this.entries.length>=this.limit&&this.entries.every(x=>x.pinned))return false;e={id:'clip-'+(++this.sequence),text,pinned:!!pinned,time:now};}this.entries.unshift(e);this.prune(now);return e;}
        pin(id){const e=this.entries.find(e=>e.id===id);if(e)e.pinned=!e.pinned;return e;}
        edit(id,text){if(typeof text!=='string'||!text||text.length>LIMITS.historyText)throw Error('A snippet needs 1–16,384 characters.');const e=this.entries.find(e=>e.id===id);if(!e)throw Error('This snippet is no longer retained.');e.text=text;e.time=Date.now();return e;}
        remove(id){this.entries=this.entries.filter(e=>e.id!==id);}
        clear(all=false){this.entries=all?[]:this.entries.filter(e=>e.pinned);}
        saved(){return this.entries.filter(e=>e.pinned).map(e=>({text:e.text}));}
    }
    function unpack(value){if(!value||value.format!=='aster.clipboard'||value.version!==1||!Array.isArray(value.snippets)||value.snippets.length>LIMITS.items)throw Error('Invalid Aster clipboard package.');return value.snippets.map(e=>{if(!e||typeof e.text!=='string'||!e.text||e.text.length>LIMITS.historyText)throw Error('Invalid snippet text.');return {text:e.text,pinned:e.pinned===true};});}
    return Object.freeze({LIMITS,DEFAULTS,preferences,platform,profile,blocked,primary,accelerator,shellAction,transform,History,unpack});
});
