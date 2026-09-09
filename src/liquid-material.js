/* Aster live refractive materials. MIT.
 * SVG backdrop filters bend the REAL browser-composited backdrop; content/iframes
 * are never captured, copied, serialized or accessed. WebGPU only computes a
 * geometry normal field, once per shape. Unsupported engines retain CSS blur.
 */
'use strict';
(() => {
    const OS=Aster,M=AsterMaterialOptics,NS='http://www.w3.org/2000/svg';
    const selector='#taskbar,.start-menu,.shell-surface:not(.integrated-task-view),.context-menu,.task-preview,.snap-layouts,.dialog,.window:not(.web-app-compact)>.titlebar,.window[data-app="files"] .explorer-sidebar,.window[data-app="settings"] .settings-sidebar';
    const priority='#taskbar,.context-menu,.start-menu,.shell-surface:not(.integrated-task-view),.task-preview,.snap-layouts,.dialog';
    const active=new Map(),cache=new Map(),pending=new Map();
    const media={motion:matchMedia('(prefers-reduced-motion: reduce)'),contrast:matchMedia('(prefers-contrast: more)'),colors:matchMedia('(forced-colors: active)'),transparency:matchMedia('(prefers-reduced-transparency: reduce)')};
    // CSS.supports alone cannot prove SVG backdrop execution. Blink is the
    // verified backend. Other engines deliberately use the labeled blur tier.
    const blink=/(?:Chrome|Chromium|Edg|OPR)\//.test(navigator.userAgent)&&!/EdgiOS|CriOS|OPiOS/.test(navigator.userAgent);
    const svgCapable=blink&&typeof SVGFEImageElement!=='undefined'&&CSS.supports('backdrop-filter','url("#aster-test")');
    let needsField=false;
    let svg=null,defs=null,serial=0,scheduled=0,epoch=0,disposed=false,builds=0,hits=0,gpuBuilds=0,cpuBuilds=0,fieldBackend='CPU',reason='',pipeline=null,pipelineDevice=null,gpuQueue=Promise.resolve(),gpuLive=0;
    let sheenFrame=0,pointer=null,lastSheen=null,dockFrame=0,dockPointer=null,lastDock=null;
    const svgNode=(name,attrs={})=>{const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
    function root(){if(defs)return defs;svg=svgNode('svg',{'aria-hidden':'true',width:0,height:0,id:'aster-optical-defs'});svg.style.cssText='position:fixed;left:0;top:0;pointer-events:none;overflow:hidden';defs=svgNode('defs');svg.append(defs);document.body.append(svg);return defs;}
    function config(){const t=OS.themes?.visual;const opaque=!t||!t.transparency||t.contrast||media.contrast.matches||media.colors.matches||media.transparency.matches;return {t,opaque,enabled:!!t&&t.profile==='macos26'&&!opaque,motion:!!t&&t.motion&&!media.motion.matches&&!media.contrast.matches,optics:t?.optics||{quality:'balanced',bend:65,dispersion:8,magnify:true}};}
    async function gpuField(g){
        const device=OS.renderer?.mode==='WebGPU'&&OS.renderer.device;
        if(!device)throw Error('No WebGPU device; using bounded CPU optical fields');
        if(pipelineDevice!==device){pipeline=null;pipelineDevice=device;}
        if(!pipeline){device.pushErrorScope('validation');try{const mod=device.createShaderModule({code:M.WGSL,label:'Aster rounded glass normals'});pipeline=await device.createComputePipelineAsync({label:'Aster optical field',layout:'auto',compute:{module:mod,entryPoint:'field'}});}finally{const e=await device.popErrorScope();if(e)throw Error(e.message);}}
        const bytes=g.cols*g.rows*4;let uniform,output,read;
        device.pushErrorScope('validation');gpuLive++;
        try{
            uniform=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
            output=device.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
            read=device.createBuffer({size:bytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
            const params=new ArrayBuffer(32);new Float32Array(params).set([g.width,g.height,g.radius,g.rim]);new Uint32Array(params,16).set([g.cols,g.rows]);device.queue.writeBuffer(uniform,0,params);
            const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}},{binding:1,resource:{buffer:output}}]});
            const enc=device.createCommandEncoder({label:'One-time glass map'}),pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(g.cols/8),Math.ceil(g.rows/8));pass.end();enc.copyBufferToBuffer(output,0,read,0,bytes);device.queue.submit([enc.finish()]);
            await read.mapAsync(GPUMapMode.READ);const data=new Uint8ClampedArray(read.getMappedRange().slice(0));read.unmap();return data;
        }finally{uniform?.destroy();output?.destroy();read?.destroy();gpuLive--;const e=await device.popErrorScope();if(e)throw Error(e.message);}
    }
    // One compute/readback at a time. No GPU resources survive completion and
    // no asynchronous result can reinstall a surface after theme/disposal.
    async function normalImage(g){
        const generation=epoch;
        let bytes;
        if(OS.renderer?.mode==='WebGPU'){
            const job=gpuQueue.catch(()=>{}).then(()=>{if(generation!==epoch||disposed)throw Error('Stale optical field');return gpuField(g);});gpuQueue=job;
            try{bytes=await job;gpuBuilds++;fieldBackend='WebGPU';}catch(e){reason=e.message;}
        }
        if(generation!==epoch||disposed)return '';
        if(!bytes){bytes=M.field(g);cpuBuilds++;fieldBackend='CPU';}
        const c=document.createElement('canvas');c.width=g.cols;c.height=g.rows;const ctx=c.getContext('2d');ctx.putImageData(new ImageData(bytes,g.cols,g.rows),0,0);
        const url=c.toDataURL('image/png');c.width=c.height=1;return url;
    }
    function trim(){for(const[k,v]of cache){if(cache.size<=M.LIMITS.cache)break;if(!v.refs){v.node.remove();cache.delete(k);}}}
    function filter(g,r,image){
        const id='aster-lens-'+(++serial),f=svgNode('filter',{id,x:0,y:0,width:'100%',height:'100%',filterUnits:'objectBoundingBox',primitiveUnits:'userSpaceOnUse','color-interpolation-filters':'sRGB'});
        f.append(svgNode('feGaussianBlur',{in:'SourceGraphic',stdDeviation:r.blur,result:'soft'}),svgNode('feColorMatrix',{in:'soft',type:'saturate',values:r.saturation,result:'lit'}),svgNode('feImage',{href:image,x:0,y:0,width:g.width,height:g.height,preserveAspectRatio:'none',result:'normals'}));
        if(r.dispersion){
            for(const[channel,multiplier,matrix]of [['red',1+r.dispersion,'1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],['green',1,'0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],['blue',1-r.dispersion,'0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']]){
                f.append(svgNode('feDisplacementMap',{in:'lit',in2:'normals',scale:r.scale*multiplier,xChannelSelector:'R',yChannelSelector:'G',result:channel+'Lens'}),svgNode('feColorMatrix',{in:channel+'Lens',type:'matrix',values:matrix,result:channel}));
            }
            f.append(svgNode('feBlend',{in:'red',in2:'green',mode:'screen',result:'rg'}),svgNode('feBlend',{in:'rg',in2:'blue',mode:'screen'}));
        }else f.append(svgNode('feDisplacementMap',{in:'lit',in2:'normals',scale:r.scale,xChannelSelector:'R',yChannelSelector:'G'}));
        return {id,node:f,refs:0,bytes:g.cols*g.rows*4,encodedBytes:image.length};
    }
    async function resource(g,r,key){
        if(cache.has(key)){const v=cache.get(key);cache.delete(key);cache.set(key,v);hits++;return v;}
        if(pending.has(key))return pending.get(key);
        if(pending.size>=M.LIMITS.surfaces)return null;
        const generation=epoch;
        const job=(async()=>{const image=await normalImage(g);if(generation!==epoch||disposed)return null;const v=filter(g,r,image);root().append(v.node);cache.set(key,v);builds++;trim();return v;})();pending.set(key,job);
        try{return await job;}finally{if(pending.get(key)===job)pending.delete(key);}
    }
    function release(el){const state=active.get(el);if(!state)return;if(state.resource)state.resource.refs--;active.delete(el);resize.unobserve(el);el.classList.remove('liquid-surface');el.style.removeProperty('--optical-filter');el.style.removeProperty('--light-x');el.style.removeProperty('--light-y');delete el.dataset.material;delete el.dataset.optical;trim();}
    function clear(){epoch++;for(const el of [...active.keys()])release(el);for(const v of cache.values())v.node.remove();cache.clear();pending.clear();svg?.remove();svg=defs=null;resetDock();}
    function visible(el){return el.isConnected&&!el.hidden&&!el.closest('[hidden],.minimized,.other-desktop')&&el.getClientRects().length>0;}
    function schedule(){if(disposed||scheduled||document.hidden)return;scheduled=requestAnimationFrame(reconcile);}
    function reconcile(){
        scheduled=0;const c=config();needsField=c.enabled&&svgCapable&&c.optics.quality!=='blur';document.body.dataset.glassBackend=c.opaque?'opaque':c.enabled?(svgCapable&&c.optics.quality!=='blur'?'svg-refraction':'css-blur'):'off';
        document.body.classList.toggle('material-reduced-motion',!c.motion);document.body.classList.toggle('material-contrast',media.contrast.matches);document.body.classList.toggle('material-solid',c.opaque);
        if(!c.enabled){if(active.size||cache.size)clear();return;}
        const nodes=[...document.querySelectorAll(priority),...document.querySelectorAll(selector)].filter((el,i,a)=>a.indexOf(el)===i&&visible(el));
        // Active-window surfaces get priority over background app decoration.
        nodes.sort((a,b)=>Number(b.matches(priority))-Number(a.matches(priority))||Number(!!b.closest('.window:not(.inactive)'))-Number(!!a.closest('.window:not(.inactive)')));
        const wanted=new Set(nodes.slice(0,M.LIMITS.surfaces));
        for(const el of active.keys())if(!wanted.has(el))release(el);
        for(const el of wanted){
            let state=active.get(el);if(!state){state={key:'',token:0,resource:null};active.set(el,state);resize.observe(el);el.classList.add('liquid-surface');}
            const box=el.getBoundingClientRect(),radius=parseFloat(getComputedStyle(el).borderTopLeftRadius)||0;
            const role=el.id==='taskbar'?'clear':'regular',r=M.recipe({glass:c.t.glass,role,bend:c.optics.bend,dispersion:c.optics.dispersion,quality:c.optics.quality});el.dataset.material=r.clear?'clear':'regular';
            const g=M.geometry(box.width,box.height,radius,c.optics.quality),key=g.key+':'+JSON.stringify(r)+':'+(svgCapable&&c.optics.quality!=='blur')+':'+OS.renderer?.mode;
            if(state.key===key)continue;
            state.key=key;const token=++state.token;if(state.resource){state.resource.refs--;state.resource=null;trim();}el.style.removeProperty('--optical-filter');el.dataset.optical='blur';
            if(!svgCapable||c.optics.quality==='blur')continue;
            const generation=epoch;
            void resource(g,r,key).then(res=>{
                if(!res||disposed||generation!==epoch||active.get(el)!==state||state.token!==token||!visible(el)){if(!res&&active.get(el)===state&&state.token===token){state.key='';schedule();}trim();return;}
                state.resource=res;res.refs++;el.style.setProperty('--optical-filter',`url("#${res.id}")`);el.dataset.optical='refractive';
            }).catch(e=>{reason=e.message;});
        }
        if(c.optics.quality==='blur')for(const[k,v]of cache)if(!v.refs){v.node.remove();cache.delete(k);}
        trim();
    }
    const resize=new ResizeObserver(()=>schedule());
    const mutation=new MutationObserver(records=>{
        if(records.some(r=>!r.target.closest?.('#aster-optical-defs')&&(r.type==='attributes'?(r.target===document.body||r.target.matches?.(selector)||r.target.classList?.contains('window')):[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.(selector)||n.querySelector?.(selector))))))schedule();
    });
    mutation.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
    function pointerMove(e){
        const c=config();if(!c.enabled||!c.motion)return;
        const surface=e.target.closest?.('.liquid-surface');if(surface){pointer={surface,x:e.clientX,y:e.clientY};if(!sheenFrame)sheenFrame=requestAnimationFrame(()=>{sheenFrame=0;const v=pointer;if(!v?.surface.isConnected)return;const r=v.surface.getBoundingClientRect();if(lastSheen&&lastSheen!==v.surface){lastSheen.style.removeProperty('--light-x');lastSheen.style.removeProperty('--light-y');}v.surface.style.setProperty('--light-x',(v.x-r.x)+'px');v.surface.style.setProperty('--light-y',(v.y-r.y)+'px');lastSheen=v.surface;});}
        const dock=e.target.closest?.('#taskbar');if(dock&&c.optics.magnify){dockPointer={x:e.clientX,y:e.clientY,dock};if(!dockFrame)dockFrame=requestAnimationFrame(magnify);}else resetDock();
    }
    function resetDock(){if(lastDock){for(const icon of lastDock.querySelectorAll('.app-icon')){icon.style.removeProperty('--dock-scale');icon.style.removeProperty('--dock-lift');}lastDock=null;}dockPointer=null;}
    function magnify(){dockFrame=0;const v=dockPointer;if(!v?.dock.isConnected)return;lastDock=v.dock;const side=OS.themes.chrome.taskbar.position!=='bottom'&&innerWidth>=600;
        for(const b of v.dock.querySelectorAll('.task-button[data-app]')){const r=b.getBoundingClientRect(),distance=side?Math.abs(v.y-r.y-r.height/2):Math.abs(v.x-r.x-r.width/2),weight=Math.exp(-Math.pow(distance/65,2));const icon=b.querySelector('.app-icon');icon?.style.setProperty('--dock-scale',String(1+.18*weight));icon?.style.setProperty('--dock-lift',(-5*weight)+'px');}
    }
    document.addEventListener('pointermove',pointerMove,{passive:true});
    const visibility=()=>{if(document.hidden){cancelAnimationFrame(scheduled);scheduled=0;resetDock();}else schedule();};document.addEventListener('visibilitychange',visibility);
    const change=()=>{const c=config();if(!c.motion)resetDock();for(const w of OS.windows.values())w.gpuDirty=true;OS.renderer?.invalidate();schedule();};for(const m of Object.values(media))m.addEventListener('change',change);
    const disposers=['theme-change','renderer','windows','ready','settings','desktop'].map(e=>OS.on(e,change));
    function destroy(){if(disposed)return;disposed=true;cancelAnimationFrame(scheduled);cancelAnimationFrame(sheenFrame);cancelAnimationFrame(dockFrame);clear();mutation.disconnect();resize.disconnect();document.removeEventListener('pointermove',pointerMove);document.removeEventListener('visibilitychange',visibility);for(const m of Object.values(media))m.removeEventListener('change',change);for(const off of disposers)off();}
    window.addEventListener('pagehide',e=>{if(!e.persisted)destroy();});
    OS.materials={refresh:schedule,destroy,get diagnostics(){const unresolved=needsField?[...active].filter(([el,state])=>visible(el)&&!state.resource).length:0;return{scheduled:!!scheduled,unresolved,settled:!scheduled&&!pending.size&&!gpuLive&&!unresolved,backend:document.body.dataset.glassBackend||'off',fieldBackend,surfaces:active.size,cache:cache.size,bytes:[...cache.values()].reduce((n,v)=>n+v.bytes,0),encodedBytes:[...cache.values()].reduce((n,v)=>n+v.encodedBytes,0),pending:pending.size,gpuLive,builds,hits,gpuBuilds,cpuBuilds,reason,limits:M.LIMITS};}};
    schedule();
})();
