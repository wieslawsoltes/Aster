'use strict';
(() => {
    const OS = Aster;
    const wallpaperWGSL = `
struct Uniforms { screen: vec4f, scene: vec4f, accent: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) id:u32) -> VOut {
  var p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:VOut;
  o.pos=vec4f(p[id],0,1);o.uv=p[id]*.5+.5;return o;
}
fn palette(t:f32,style:f32)->vec3f{
  var a=vec3f(.025,.14,.39);var b=vec3f(.11,.42,.86);var c=vec3f(.48,.8,1.);
  if(style>0.5&&style<1.5){a=vec3f(.025,.055,.15);b=vec3f(.21,.21,.51);c=vec3f(.57,.58,1.);}
  if(style>1.5&&style<2.5){a=vec3f(.19,.06,.26);b=vec3f(.57,.25,.52);c=vec3f(1.,.69,.58);}
  if(style>2.5){a=vec3f(.025,.15,.16);b=vec3f(.055,.43,.39);c=vec3f(.60,.87,.73);}
  return mix(mix(a,b,smoothstep(0.,.64,t)),c,smoothstep(.6,1.,t));
}
@fragment fn fs(i:VOut)->@location(0) vec4f{
  let uv=vec2f(i.uv.x,1.-i.uv.y);let aspect=u.screen.x/u.screen.y;
  let drift=sin(u.screen.z*.065)*.023*u.scene.w;
  var p=(uv-vec2f(.56+drift,.51))*vec2f(aspect,1.);
  var color=palette(.18+uv.y*.21,u.scene.y);
  let glow=exp(-dot(p-vec2f(.25,-.22),p-vec2f(.25,-.22))*2.2);
  color+=palette(.65,u.scene.y)*glow*.20;
  // Analytic folded ribbons. No textures, assets, readbacks, or per-frame allocations.
  for(var k=0;k<10;k++){
    let f=f32(k);let angle=atan2(p.y+.20-f*.008,p.x-.01);
    let r=length((p-vec2f(.06,-.04))*vec2f(.90,1.04));
    let wave=.10*sin(angle*2.+f*.14)+.040*sin(angle*4.-f*.21);
    let radius=.18+f*.044+wave;
    let d=r-radius;
    let shadow=exp(-pow((d-.025)/.03,2.))*.45;
    color*=1.-shadow;
    let band=smoothstep(-.025,-.021,d)*(1.-smoothstep(.017,.023,d));
    let light=clamp(.18+.70*smoothstep(-.02,.022,d)+.12*sin(angle-1.1),0.,1.);
    let ribbon=palette(light,u.scene.y);
    let rim=exp(-pow((d-.017)/.0035,2.))*.28;
    color=mix(color,ribbon+vec3f(rim),band);
  }
  let vignette=1.-.27*dot(uv-.5,uv-.5);
  color*=vignette;
  // Tiny deterministic dither avoids gradient banding without external noise textures.
  color+=(fract(sin(dot(i.pos.xy,vec2f(12.9898,78.233)))*43758.5453)-.5)/255.;
  return vec4f(color,1.);
}`;
    const windowWGSL = `
struct Uniforms { screen:vec4f, scene:vec4f, accent:vec4f };
struct Window { rect:vec4f, fill:vec4f, extra:vec4f };
@group(0) @binding(0) var<uniform> u:Uniforms;
@group(0) @binding(1) var<storage,read> windows:array<Window>;
struct Out { @builtin(position) pos:vec4f, @location(0) local:vec2f, @location(1) @interpolate(flat) id:u32 };
@vertex fn vs(@builtin(vertex_index) v:u32,@builtin(instance_index) id:u32)->Out{
  var q=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let w=windows[id];let pad=40.;let local=q[v]*(w.rect.zw+pad*2.)-pad;
  let pixel=(local+w.rect.xy)*u.screen.w;var o:Out;
  o.pos=vec4f(pixel.x/u.screen.x*2.-1.,1.-pixel.y/u.screen.y*2.,0,1);o.local=local;o.id=id;return o;
}
@fragment fn fs(i:Out)->@location(0) vec4f{
  let w=windows[i.id];let radius=w.extra.y;
  let q=abs(i.local-w.rect.zw*.5)-w.rect.zw*.5+radius;
  let d=min(max(q.x,q.y),0.)+length(max(q,vec2f(0.)))-radius;
  let cover=1.-smoothstep(-.5,.5,d);
  let shadow=exp(-max(d,0.)/10.)*.20*w.extra.x;
  let a=cover*w.fill.a+(1.-cover)*shadow;
  let tint=w.fill.rgb*cover*w.fill.a/max(a,.001);
  return vec4f(tint,a);
}`;
    class Renderer {
        constructor() { this.canvas = OS.$('#compositor'); this.dirty = true; this.lastDraw = 0; this.start = performance.now(); this.count = 0; this.sampleStart = performance.now(); this.rectData = new Float32Array(48 * 128); this.uniformData = new Float32Array(12); this.mode = 'Canvas 2D'; this.frame = this.frame.bind(this); }
        async init() {
            if (navigator.gpu) {
                try {
                    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
                    if (!adapter)
                        throw Error('No GPU adapter');
                    const device = this.device = await adapter.requestDevice();
                    this.adapter = adapter;
                    this.info = adapter.info || {};
                    this.context = this.canvas.getContext('webgpu');
                    if (!this.context)
                        throw Error('WebGPU canvas unavailable');
                    this.format = navigator.gpu.getPreferredCanvasFormat();
                    this.context.configure({ device, format: this.format, alphaMode: 'opaque' });
                    this.uniform = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                    this.windowsBuffer = device.createBuffer({ size: this.rectData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                    device.pushErrorScope('validation');
                    const wallpaperModule = device.createShaderModule({ code: wallpaperWGSL });
                    const windowModule = device.createShaderModule({ code: windowWGSL });
                    this.wallpaperPipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: wallpaperModule, entryPoint: 'vs' }, fragment: { module: wallpaperModule, entryPoint: 'fs', targets: [{ format: this.format }] }, primitive: { topology: 'triangle-list' } });
                    this.windowPipeline = await device.createRenderPipelineAsync({ layout: 'auto', vertex: { module: windowModule, entryPoint: 'vs' }, fragment: { module: windowModule, entryPoint: 'fs', targets: [{ format: this.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] }, primitive: { topology: 'triangle-list' } });
                    const error = await device.popErrorScope();
                    if (error)
                        throw Error(error.message);
                    this.wallpaperBind = device.createBindGroup({ layout: this.wallpaperPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }] });
                    this.windowBind = device.createBindGroup({ layout: this.windowPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniform } }, { binding: 1, resource: { buffer: this.windowsBuffer } }] });
                    this.mode = 'WebGPU';
                    document.body.classList.add('gpu-active');
                    device.lost.then(info => { this.fallback('GPU device lost: ' + info.message); });
                    device.addEventListener('uncapturederror', e => { console.error('WebGPU:', e.error); });
                }
                catch (e) {
                    console.warn('WebGPU fallback:', e);
                    this.fallbackReason = e.message;
                    this.fallback();
                }
            }
            else
                this.fallback('WebGPU is not available in this browser/context.');
            OS.metrics.mode = this.mode;
            window.addEventListener('resize', () => this.resize());
            document.addEventListener('visibilitychange', () => { if (!document.hidden)
                this.invalidate(); });
            OS.on('settings', () => { this.resize(); this.invalidate(); });
            this.resize();
            requestAnimationFrame(this.frame);
            OS.emit('renderer');
        }
        fallback(reason) {
            this.fallbackReason = reason || this.fallbackReason;
            this.mode = 'Canvas 2D';
            OS.metrics.mode = this.mode;
            document.body.classList.remove('gpu-active');
            // A canvas cannot switch context types after WebGPU was acquired.
            if (this.context) {
                const c = document.createElement('canvas');
                c.id = 'compositor';
                c.setAttribute('aria-hidden', 'true');
                this.canvas.replaceWith(c);
                this.canvas = c;
                this.context = null;
            }
            for (const w of OS.windows.values()) {
                this.removeSurface(w);
                w.el?.classList.remove('gpu-surface-ready');
            }
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this.resize();
            this.invalidate();
            OS.emit('renderer');
        }
        resize() { const q = Number(OS.settings.quality) || 1; this.ratio = Math.min(window.devicePixelRatio || 1, 2) * q; const max = this.device?.limits?.maxTextureDimension2D || 8192; this.ratio = Math.min(this.ratio, max / (innerWidth + 80), max / (innerHeight + 80)); this.canvas.width = Math.max(1, Math.round(innerWidth * this.ratio)); this.canvas.height = Math.max(1, Math.round(innerHeight * this.ratio)); this.dirty = true; for (const w of OS.windows.values())
            w.gpuDirty = true; }
        invalidate() { this.dirty = true; }
        getWindows() { return Array.from(OS.windows.values()).filter(w => !w.minimized && w.desktop === OS.activeDesktop && !w.closed).sort((a, b) => a.z - b.z).slice(-128); }
        frame(now) {
            requestAnimationFrame(this.frame);
            if (document.hidden)
                return;
            const animate = this.mode === 'WebGPU' && OS.settings.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
            // Static desktops stop drawing. Animation is capped at 30 Hz; interaction invalidates immediately.
            if (!this.dirty && (!animate || now - this.lastDraw < 32)) {
                if (now - this.lastDraw > 1200 && OS.metrics.fps !== 0) {
                    OS.metrics.fps = 0;
                    OS.metrics.frames.push(0);
                    if (OS.metrics.frames.length > 60)
                        OS.metrics.frames.shift();
                    OS.emit('metrics');
                }
                return;
            }
            const before = performance.now();
            try {
                if (this.mode === 'WebGPU')
                    this.drawGPU(now);
                else
                    this.draw2D();
            }
            catch (error) {
                console.warn('Graphics fallback:', error);
                this.fallback(error.message);
                this.draw2D();
            }
            this.dirty = false;
            this.lastDraw = now;
            this.count++;
            OS.metrics.frameMs = performance.now() - before;
            if (now - this.sampleStart >= 1000) {
                OS.metrics.fps = Math.round(this.count * 1000 / (now - this.sampleStart));
                OS.metrics.frames.push(OS.metrics.fps);
                if (OS.metrics.frames.length > 60)
                    OS.metrics.frames.shift();
                this.sampleStart = now;
                this.count = 0;
                OS.emit('metrics');
            }
        }
        attachSurface(w) {
            if (w.gpuSurface)
                return w.gpuSurface;
            const canvas = document.createElement('canvas');
            canvas.className = 'window-surface';
            canvas.setAttribute('aria-hidden', 'true');
            const context = canvas.getContext('webgpu');
            if (!context)
                return null;
            context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
            const uniform = this.device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            const rect = this.device.createBuffer({ size: 48, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            const bind = this.device.createBindGroup({ layout: this.windowPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: rect } }] });
            w.el.prepend(canvas);
            w.el.classList.add('gpu-surface-ready');
            w.gpuDirty = true;
            return w.gpuSurface = { canvas, context, uniform, rect, bind, width: 0, height: 0 };
        }
        removeSurface(w) { const s = w.gpuSurface; if (!s)
            return; s.uniform.destroy(); s.rect.destroy(); s.context.unconfigure(); s.canvas.remove(); delete w.gpuSurface; }
        drawGPU(now) {
            if (!this.device || !this.context)
                return;
            const s = OS.settings, style = ['bloom', 'midnight', 'dusk', 'sage'].indexOf(OS.effectiveWallpaper()), ws = this.getWindows();
            const dark = document.body.dataset.theme === 'dark';
            this.uniformData.set([this.canvas.width, this.canvas.height, (now - this.start) / 1000, this.ratio, dark ? 1 : 0, Math.max(0, style), ws.length, s.motion ? 1 : 0, 0, 0, 0, 0]);
            this.device.queue.writeBuffer(this.uniform, 0, this.uniformData);
            const encoder = this.device.createCommandEncoder({ label: 'Aster retained frame' });
            const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: .03, g: .1, b: .25, a: 1 }, storeOp: 'store' }] });
            pass.setPipeline(this.wallpaperPipeline);
            pass.setBindGroup(0, this.wallpaperBind);
            pass.draw(3);
            pass.end();
            let draws = 1;
            // Each DOM window owns a transparent GPU surface. This preserves correct
            // z-order against HTML content without canvas readback or texture copies.
            for (const w of ws) {
                const surface = this.attachSurface(w);
                if (!surface || !w.gpuDirty)
                    continue;
                const width = Math.max(1, Math.round((w.rect.w + 80) * this.ratio)), height = Math.max(1, Math.round((w.rect.h + 80) * this.ratio));
                if (surface.width !== width || surface.height !== height) {
                    surface.canvas.width = width;
                    surface.canvas.height = height;
                    surface.width = width;
                    surface.height = height;
                }
                const themeColor = OS.themes?.tokens?.app?.mica;
                const color = themeColor ? themeColor.slice(1).match(/../g).map(x=>parseInt(x,16)/255) : dark ? [.115, .13, .16] : [.948, .962, .983];
                const uniform = new Float32Array([width, height, 0, this.ratio, 0, 0, 0, 0, 0, 0, 0, 0]);
                const rect = new Float32Array([40, 40, w.rect.w, w.rect.h, ...color, 1, w.id === OS.focused ? 1 : .55, w.maximized ? 0 : (OS.themes?.metrics?.radius ?? 8), 0, 0]);
                this.device.queue.writeBuffer(surface.uniform, 0, uniform);
                this.device.queue.writeBuffer(surface.rect, 0, rect);
                const p = encoder.beginRenderPass({ colorAttachments: [{ view: surface.context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }] });
                p.setPipeline(this.windowPipeline);
                p.setBindGroup(0, surface.bind);
                p.draw(6, 1);
                p.end();
                w.gpuDirty = false;
                draws++;
            }
            this.device.queue.submit([encoder.finish()]);
            OS.metrics.drawCalls = draws;
        }
        draw2D() {
            const c = this.ctx;
            if (!c)
                return;
            const width = this.canvas.width, height = this.canvas.height;
            c.setTransform(1, 0, 0, 1, 0, 0);
            const p = ({ bloom: ['#072962', '#0754bd', '#8bd4ff'], midnight: ['#070e2c', '#35317a', '#9ca4ff'], dusk: ['#371438', '#9c437f', '#ffd2b6'], sage: ['#082f31', '#187869', '#adebc9'] })[OS.effectiveWallpaper()] || ['#072962', '#0754bd', '#8bd4ff'];
            const bg = c.createLinearGradient(0, 0, width, height);
            bg.addColorStop(0, p[0]);
            bg.addColorStop(1, p[1]);
            c.fillStyle = bg;
            c.fillRect(0, 0, width, height);
            c.save();
            c.translate(width * .55, height * .51);
            const unit = height * .94;
            c.scale(unit, unit);
            // Original folded-ribbon fallback, rendered only when invalidated.
            for (let k = 10; k >= 0; k--) {
                const f = k / 10, rr = .19 + k * .042;
                c.beginPath();
                for (let n = 0; n <= 260; n++) {
                    const a = n / 260 * Math.PI * 2;
                    const r = rr + .095 * Math.sin(a * 2 + k * .14) + .034 * Math.sin(a * 4 - k * .2);
                    const x = Math.cos(a) * r * 1.12, y = Math.sin(a) * r;
                    n ? c.lineTo(x, y) : c.moveTo(x, y);
                }
                c.closePath();
                const g = c.createLinearGradient(-rr, -rr, rr, rr);
                g.addColorStop(0, p[0]);
                g.addColorStop(.27, p[1]);
                g.addColorStop(.48, p[2]);
                g.addColorStop(.55, p[1]);
                g.addColorStop(.8, p[0]);
                g.addColorStop(1, p[1]);
                c.strokeStyle = g;
                c.lineWidth = .065;
                c.shadowColor = '#00153499';
                c.shadowBlur = unit * .025;
                c.shadowOffsetY = unit * .01;
                c.stroke();
                c.shadowBlur = 0;
                c.shadowOffsetY = 0;
                c.strokeStyle = p[2] + '65';
                c.lineWidth = .002;
                c.stroke();
            }
            c.restore();
            OS.metrics.drawCalls = 0;
        }
        destroy() { this.uniform?.destroy(); this.windowsBuffer?.destroy(); this.device?.destroy(); }
    }
    OS.Renderer = Renderer;
})();
