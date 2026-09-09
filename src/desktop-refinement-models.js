/* Pure, bounded desktop workflow rules. No DOM, filesystem or network I/O. MIT. */
'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AsterDesktopRefinementModels=factory();})(globalThis,()=>{
    const PREVIEW_LIMIT=16*1024*1024,TEXT_LIMIT=128*1024;
    function virtualPath(path){return typeof path==='string'&&path.length<=1024&&path.startsWith('/')&&!/[\\\x00-\x1f\x7f]/.test(path)&&!path.split('/').slice(1).some(p=>!p||p==='.'||p==='..')&&!/^\/(?:Local|\.Trash)(?:\/|$)/.test(path);}
    function previewKind(path,mime=''){
        const ext=String(path).split('.').pop().toLowerCase();
        // Active formats (HTML, SVG, JS) are always inert text; never srcdoc.
        if(['txt','md','csv','log','json','js','mjs','cjs','html','htm','svg','css','xml','yaml','yml','c','h','cpp','py','theme'].includes(ext)||/^text\//.test(mime))return 'text';
        if(['png','jpg','jpeg','webp','gif','bmp','ico'].includes(ext))return 'image';
        if(['wav','mp3','ogg','m4a','flac'].includes(ext))return 'audio';
        if(['webm','mp4','ogv','mov'].includes(ext))return 'video';
        return 'metadata';
    }
    function reorderPins(pins,id,before){
        if(!Array.isArray(pins)||pins.length>256||typeof id!=='string'||typeof before!=='string'||!pins.includes(id)||!pins.includes(before))throw Error('Only pinned applications can be reordered.');
        const next=[...new Set(pins)];if(id===before)return next;
        next.splice(next.indexOf(id),1);next.splice(next.indexOf(before),0,id);return next;
    }
    function desktopPlan(windows,desktop,snapshot=null){
        const current=windows.filter(w=>!w.closed&&w.desktop===desktop);
        if(snapshot){const ids=new Set(snapshot.ids);const targets=current.filter(w=>ids.has(w.id)&&w.minimized);
            const focus=current.find(w=>w.id===snapshot.focused&&ids.has(w.id))||targets.slice().sort((a,b)=>b.stackOrder-a.stackOrder)[0];
            return{action:'restore',ids:targets.map(w=>w.id),focused:focus?.id||null};}
        return{action:'hide',ids:current.filter(w=>!w.minimized).map(w=>w.id),focused:null};
    }
    return Object.freeze({PREVIEW_LIMIT,TEXT_LIMIT,virtualPath,previewKind,reorderPins,desktopPlan});
});
