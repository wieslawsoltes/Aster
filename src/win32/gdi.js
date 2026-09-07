/* GDI command renderer: WebGPU primitives and glyph atlas, not a screen stream.
 * The browser rasterizes font glyphs once; GPU draws/composites them thereafter.
 * Canvas2D fallback is explicit. MIT. */
'use strict';
(() => {
const SHADER=`
struct Primitive { rect:vec4f, color:vec4f, uv:vec4f, extra:vec4f }
struct Vertex { @builtin(position) position:vec4f, @location(0) local:vec2f,
 @location(1) uv:vec2f, @location(2) color:vec4f,
 @location(3) @interpolate(flat) kind:u32, @location(4) @interpolate(flat) data:vec4f }
@group(0) @binding(0) var<storage,read> primitives:array<Primitive>;
@group(0) @binding(1) var<uniform> viewport:vec4f;
@group(0) @binding(2) var atlas:texture_2d<f32>;
@group(0) @binding(3) var gdiSampler:sampler;
@vertex fn vs(@builtin(vertex_index) vertex:u32,@builtin(instance_index) instance:u32)->Vertex {
 var corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let q=corners[vertex];let p=primitives[instance];let kind=u32(p.extra.x);
 var position=p.rect.xy+q*p.rect.zw;
 if(kind==3u){let delta=p.rect.zw;let normal=vec2f(-delta.y,delta.x)/max(length(delta),0.001);position=p.rect.xy+q.x*delta+(q.y-0.5)*normal*p.extra.y;}
 var result:Vertex;result.position=vec4f(position/viewport.xy*vec2f(2,-2)+vec2f(-1,1),0,1);
 result.local=q;result.uv=mix(p.uv.xy,p.uv.zw,q);result.color=p.color;result.kind=kind;result.data=vec4f(p.rect.zw,p.extra.y,0);return result;
}
@fragment fn fs(v:Vertex)->@location(0) vec4f {
 var alpha=v.color.a;
 if(v.kind==1u||v.kind==4u){let p=v.local*2-1;if(dot(p,p)>1){discard;}
  if(v.kind==4u){let inner=max(v.data.xy-vec2f(2*v.data.z),vec2f(0.001));let q=p*v.data.xy/inner;if(dot(q,q)<1){discard;}}}
 if(v.kind==2u){alpha*=textureSampleLevel(atlas,gdiSampler,v.uv,0).a;}
 return vec4f(v.color.rgb*alpha,alpha);
}`;
const BLIT=`
struct V { @builtin(position) position:vec4f, @location(0) uv:vec2f }
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var gdiSampler:sampler;
@vertex fn vs(@builtin(vertex_index) i:u32)->V { var points=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));let p=points[i];var v:V;v.position=vec4f(p,0,1);v.uv=p*vec2f(0.5,-0.5)+vec2f(0.5,0.5);return v; }
@fragment fn fs(v:V)->@location(0) vec4f { return textureSampleLevel(image,gdiSampler,v.uv,0); }`;
const css=c=>`rgba(${c[0]},${c[1]},${c[2]},${(c[3]??255)/255})`;
class GDIRenderer {
    constructor(container,width,height,options={}) {
        this.width=width;this.height=height;this.options=options;this.canvas=document.createElement('canvas');this.canvas.width=width;this.canvas.height=height;this.canvas.className='win32-canvas';this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Windows application graphics');container.prepend(this.canvas);
        this.mode='Initializing';this.pending=[];this.frames=0;this.drawCalls=0;this.primitives=0;this.glyphs=new Map();this.dead=false;this.errors=[];this.peakQueuedCommands=0;this.acknowledgedBatches=0;
        this.scratch=document.createElement('canvas');this.scratch.width=512;this.scratch.height=192;this.fontContext=this.scratch.getContext('2d',{willReadFrequently:true});
    }
    async init() {
        try {
            if(this.options.fallback)throw Error('Canvas fallback selected');
            if(!navigator.gpu)throw Error('WebGPU is unavailable in this context');
            this.adapter=await navigator.gpu.requestAdapter();if(!this.adapter)throw Error('No WebGPU adapter');
            this.device=await this.adapter.requestDevice();const d=this.device;
            if(this.dead){d.destroy();return this;}
            d.addEventListener('uncapturederror',event=>{this.errors.push(event.error.message);this.fail(Error('WebGPU: '+event.error.message));});
            d.lost.then(info=>{if(!this.dead&&info.reason!=='destroyed')this.fail(Error('WebGPU device lost: '+info.message));});
            // Compile before getting a WebGPU canvas context, so initial fallback
            // can use a fresh Canvas2D context if shader initialization fails.
            d.pushErrorScope('validation');
            const module=d.createShaderModule({code:SHADER});
            this.pipeline=d.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm',blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'}});
            this.presentFormat=navigator.gpu.getPreferredCanvasFormat();const blit=d.createShaderModule({code:BLIT});this.blitPipeline=d.createRenderPipeline({layout:'auto',vertex:{module:blit,entryPoint:'vs'},fragment:{module:blit,entryPoint:'fs',targets:[{format:this.presentFormat}]},primitive:{topology:'triangle-list'}});
            const compileError=await d.popErrorScope();if(compileError)throw Error(compileError.message);
            this.context=this.canvas.getContext('webgpu');this.context.configure({device:d,format:this.presentFormat,alphaMode:'opaque'});
            this.target=d.createTexture({size:[this.width,this.height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
            this.atlas=d.createTexture({size:[2048,2048],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
            this.sampler=d.createSampler({minFilter:'nearest',magFilter:'nearest'});
            this.buffer=d.createBuffer({size:65536*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
            this.viewport=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(this.viewport,0,new Float32Array([this.width,this.height,0,0]));
            this.bind=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.buffer}},{binding:1,resource:{buffer:this.viewport}},{binding:2,resource:this.atlas.createView()},{binding:3,resource:this.sampler}]});
            this.blitBind=d.createBindGroup({layout:this.blitPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.target.createView()},{binding:1,resource:this.sampler}]});
            this.atlasX=1;this.atlasY=1;this.atlasRow=0;this.initial=true;this.mode='WebGPU';
        } catch(error) {
            if(this.options.requireGPU){this.destroy();throw error;}
            this.device?.destroy();this.device=null;this.fallbackReason=error.message;
            // Canvas contexts cannot be changed after acquisition.
            const fresh=this.canvas.cloneNode();this.canvas.replaceWith(fresh);this.canvas=fresh;
            this.ctx=this.canvas.getContext('2d');if(!this.ctx)throw Error('Neither WebGPU nor Canvas2D is available');
            this.ctx.fillStyle='white';this.ctx.fillRect(0,0,this.width,this.height);this.mode='Canvas 2D';
        }
        return this;
    }
    fail(error) {if(this.dead)return;this.options.onError?.(error);this.destroy();}
    enqueue(commands) {
        if(this.dead)return;
        if(!Array.isArray(commands)||commands.length>4097||this.pending.length+commands.length>32768){this.fail(Error('GDI command queue limit reached'));return;}
        this.pending.push(...commands);this.peakQueuedCommands=Math.max(this.peakQueuedCommands,this.pending.length);
        if(!this.frame&&!this.frameTimer){
            const render=()=>{try{this.flush();}catch(error){this.fail(error);}};
            this.frame=requestAnimationFrame(render);this.frameTimer=setTimeout(render,64);
        }
    }
    async submit(commands) {
        if(this.dead)throw Error('Renderer has stopped');
        this.enqueue(commands);this.flush();
        if(this.dead)throw Error('Renderer rejected the batch');
        if(this.mode==='WebGPU')await this.device.queue.onSubmittedWorkDone();
        this.acknowledgedBatches++;
        return this.stats();
    }
    measure(text,size) {this.fontContext.font=`${size}px sans-serif`;return {width:Math.ceil(this.fontContext.measureText(text).width),height:Math.ceil(size*1.35)};}
    glyph(char,size) {
        const key=size+':'+char;if(this.glyphs.has(key))return this.glyphs.get(key);
        if(this.glyphs.size>=4096)throw Error('Glyph atlas quota exceeded');
        const ctx=this.fontContext;ctx.font=`${size}px sans-serif`;const metrics=ctx.measureText(char),advance=metrics.width;
        const left=Math.max(0,Math.ceil(metrics.actualBoundingBoxLeft||0)),width=Math.max(1,Math.ceil(Math.max(advance,metrics.actualBoundingBoxRight||0)+left)+4),height=Math.ceil(size*1.6)+4;
        if(width>512||height>192)throw Error('Glyph dimensions exceed bounds');
        if(this.atlasX+width>=2048){this.atlasX=1;this.atlasY+=this.atlasRow+2;this.atlasRow=0;}
        if(this.atlasY+height>=2048)throw Error('Glyph atlas is full; restart the guest process');
        ctx.clearRect(0,0,512,192);ctx.fillStyle='white';ctx.textBaseline='top';ctx.fillText(char,2+left,2);
        const pixels=ctx.getImageData(0,0,width,height);
        this.device.queue.writeTexture({texture:this.atlas,origin:[this.atlasX,this.atlasY]},pixels.data,{bytesPerRow:width*4},[width,height]);
        const item={advance,left:2+left,width,height,uv:[this.atlasX/2048,this.atlasY/2048,(this.atlasX+width)/2048,(this.atlasY+height)/2048]};
        this.atlasX+=width+2;this.atlasRow=Math.max(this.atlasRow,height);this.glyphs.set(key,item);return item;
    }
    validate(c) {
        if(!c||!['rect','ellipse','line','text'].includes(c.op))throw Error('Invalid GDI command');
        for(const key of ['x','y','w','h','x2','y2','width','size'])if(c[key]!==undefined&&(!Number.isFinite(c[key])||Math.abs(c[key])>0x80000000))throw Error('Invalid GDI coordinate');
        if(c.op==='text'&&(typeof c.text!=='string'||c.text.length>4096||c.size<8||c.size>128))throw Error('Invalid GDI text');
        for(const key of ['color','stroke','background'])if(c[key]&&(!Array.isArray(c[key])||c[key].length!==4||c[key].some(n=>!Number.isFinite(n)||n<0||n>255)))throw Error('Invalid GDI color');
    }
    expand(commands) {
        const out=[];
        const primitive=(x,y,w,h,color,kind=0,thickness=0,uv=[0,0,0,0])=>{if(!color||!w||!h)return;if(out.length>=65536*16)throw Error('GDI primitive budget exceeded');out.push(x,y,w,h,...color.map(n=>n/255),...uv,kind,thickness,0,0);};
        for(const c of commands){this.validate(c);
            if(c.op==='text'){
                if(c.background)primitive(c.x,c.y,this.measure(c.text,c.size).width,Math.ceil(c.size*1.35),c.background);
                let x=c.x;for(const char of c.text){const g=this.glyph(char,c.size);primitive(x-g.left,c.y-2,g.width,g.height,c.color,2,0,g.uv);x+=g.advance;}continue;
            }
            if(c.op==='line'){const dx=c.x2-c.x,dy=c.y2-c.y;if(dx||dy){ // horizontal/vertical lines must not be dropped by the zero-size rectangle guard.
                if(out.length>=65536*16)throw Error('GDI primitive budget exceeded');out.push(c.x,c.y,dx,dy,...c.color.map(n=>n/255),0,0,0,0,3,c.width||1,0,0);
            }continue;}
            if(c.w<=0||c.h<=0)continue;primitive(c.x,c.y,c.w,c.h,c.color,c.op==='ellipse'?1:0);
            if(c.stroke){const t=Math.min(c.width||1,c.w/2,c.h/2);if(c.op==='ellipse')primitive(c.x,c.y,c.w,c.h,c.stroke,4,t);else{
                primitive(c.x,c.y,c.w,t,c.stroke);primitive(c.x,c.y+c.h-t,c.w,t,c.stroke);primitive(c.x,c.y,t,c.h,c.stroke);primitive(c.x+c.w-t,c.y,t,c.h,c.stroke);
            }}
        }
        return new Float32Array(out);
    }
    flush() {
        if(this.frame)cancelAnimationFrame(this.frame);if(this.frameTimer)clearTimeout(this.frameTimer);this.frame=this.frameTimer=0;
        if(this.dead||!this.pending.length)return;const commands=this.pending.splice(0);
        if(this.mode==='WebGPU'){
            const data=this.expand(commands);if(!data.length)return;const d=this.device;d.queue.writeBuffer(this.buffer,0,data);
            const encoder=d.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[{view:this.target.createView(),loadOp:this.initial?'clear':'load',clearValue:{r:1,g:1,b:1,a:1},storeOp:'store'}]});
            pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bind);pass.draw(6,data.length/16);pass.end();this.initial=false;
            const present=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',clearValue:{r:1,g:1,b:1,a:1},storeOp:'store'}]});present.setPipeline(this.blitPipeline);present.setBindGroup(0,this.blitBind);present.draw(3);present.end();d.queue.submit([encoder.finish()]);this.drawCalls+=2;this.primitives+=data.length/16;
        } else {
            const ctx=this.ctx;for(const c of commands){this.validate(c);ctx.lineWidth=c.width||1;
                if(c.op==='text'){ctx.font=`${c.size}px sans-serif`;ctx.textBaseline='top';if(c.background){ctx.fillStyle=css(c.background);ctx.fillRect(c.x,c.y,ctx.measureText(c.text).width,c.size*1.35);}ctx.fillStyle=css(c.color);ctx.fillText(c.text,c.x,c.y);}
                else if(c.op==='line'){ctx.strokeStyle=css(c.color);ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x2,c.y2);ctx.stroke();}
                else if(c.w>0&&c.h>0){ctx.beginPath();if(c.op==='ellipse')ctx.ellipse(c.x+c.w/2,c.y+c.h/2,c.w/2,c.h/2,0,0,Math.PI*2);else ctx.rect(c.x,c.y,c.w,c.h);if(c.color){ctx.fillStyle=css(c.color);ctx.fill();}if(c.stroke){ctx.strokeStyle=css(c.stroke);ctx.stroke();}}
            }
            this.drawCalls+=commands.length;this.primitives+=commands.length;
        }
        this.frames++;this.options.onFrame?.(this.stats());
    }
    stats() {return {mode:this.mode,adapter:this.adapter?{vendor:this.adapter.info?.vendor,architecture:this.adapter.info?.architecture,description:this.adapter.info?.description}:null,frames:this.frames,acknowledgedBatches:this.acknowledgedBatches,peakQueuedCommands:this.peakQueuedCommands,queuedCommands:this.pending.length,drawCalls:this.drawCalls,primitives:this.primitives,glyphs:this.glyphs.size,errors:this.errors.slice()};}
    async pixel(x,y) {
        this.flush();x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=this.width||y>=this.height)throw Error('Pixel out of bounds');
        if(this.mode!=='WebGPU')return [...this.ctx.getImageData(x,y,1,1).data];
        const d=this.device,b=d.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
        try{const encoder=d.createCommandEncoder();encoder.copyTextureToBuffer({texture:this.target,origin:[x,y]},{buffer:b,bytesPerRow:256},[1,1]);d.queue.submit([encoder.finish()]);await b.mapAsync(GPUMapMode.READ);return [...new Uint8Array(b.getMappedRange(),0,4)];}finally{b.destroy();}
    }
    destroy() {if(this.dead)return;this.dead=true;if(this.frame)cancelAnimationFrame(this.frame);if(this.frameTimer)clearTimeout(this.frameTimer);this.frame=this.frameTimer=0;this.pending=[];this.target?.destroy();this.atlas?.destroy();this.buffer?.destroy();this.viewport?.destroy();this.device?.destroy();}
}
globalThis.AsterGDI=GDIRenderer;
})();
