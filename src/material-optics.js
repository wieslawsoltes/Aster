/* Original bounded optical-field math for browser-composited glass. MIT.
 * This is not Apple's material implementation. No screen pixels are read.
 */
'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AsterMaterialOptics=api;})(globalThis,()=>{
    const LIMITS=Object.freeze({surfaces:16,cache:24,pixels:131072,axis:512,gpuBytes:524288});
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
    function geometry(width,height,radius=20,quality='balanced'){
        if(![width,height,radius].every(Number.isFinite)||width<=0||height<=0||width>16384||height>16384)throw Error('Invalid glass geometry');
        width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
        radius=clamp(radius,0,Math.min(width,height)/2);
        const axis=quality==='high'?512:384,area=quality==='high'?LIMITS.pixels:65536;
        const ratio=Math.min(1,axis/width,axis/height,Math.sqrt(area/(width*height)));
        const cols=Math.max(1,Math.floor(width*ratio)),rows=Math.max(1,Math.floor(height*ratio));
        return {width,height,radius,cols,rows,rim:clamp(Math.min(width,height)*.18,3,18),key:[width,height,radius,cols,rows].join(':')};
    }
    // Gradient of a rounded-rectangle signed distance field. Only the inner rim
    // bends light; the flat central region retains the real backdrop unchanged.
    function vector(x,y,g){
        const px=x-g.width/2,py=y-g.height/2,qx=Math.abs(px)-g.width/2+g.radius,qy=Math.abs(py)-g.height/2+g.radius;
        const ax=Math.max(qx,0),ay=Math.max(qy,0),len=Math.hypot(ax,ay),d=len+Math.min(Math.max(qx,qy),0)-g.radius;
        if(d>=0||d<=-g.rim)return [0,0];
        const u=-d/g.rim,bend=3.2*Math.sqrt(u)*(1-u)*(1-u);
        const nx=len>1e-6?ax/len:qx>=qy?1:0,ny=len>1e-6?ay/len:qx>=qy?0:1;
        return [Math.sign(px)*nx*bend,Math.sign(py)*ny*bend];
    }
    function field(g){
        if(!g||![g.width,g.height,g.radius,g.rim].every(Number.isFinite)||g.width<=0||g.height<=0||g.width>16384||g.height>16384||g.radius<0||g.radius>Math.min(g.width,g.height)/2||g.rim<=0||!Number.isInteger(g.cols)||!Number.isInteger(g.rows)||g.cols<1||g.rows<1||g.cols>LIMITS.axis||g.rows>LIMITS.axis||g.cols*g.rows>LIMITS.pixels)throw Error('Glass field exceeds bounds');
        const bytes=new Uint8ClampedArray(g.cols*g.rows*4);
        for(let y=0;y<g.rows;y++)for(let x=0;x<g.cols;x++){
            const [nx,ny]=vector((x+.5)*g.width/g.cols,(y+.5)*g.height/g.rows,g),i=(y*g.cols+x)*4;
            bytes[i]=Math.round(128+126*nx);bytes[i+1]=Math.round(128+126*ny);bytes[i+2]=128;bytes[i+3]=255;
        }
        return bytes;
    }
    function recipe({glass='clear',role='regular',bend=65,dispersion=8,quality='balanced'}={}){
        bend=Number.isFinite(bend)?clamp(bend,0,100):65;dispersion=Number.isFinite(dispersion)?clamp(dispersion,0,25):8;
        const clear=glass==='clear'&&role==='clear';
        return {blur:clear?2:glass==='tinted'?14:9,saturation:clear?1.35:1.2,scale:(clear?22:14)*bend/100,dispersion:quality==='high'?dispersion/100:0,clear};
    }
    const WGSL=`
struct Params { size:vec2f, radius:f32, rim:f32, grid:vec2u, pad:vec2u };
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read_write> pixels:array<u32>;
@compute @workgroup_size(8,8) fn field(@builtin(global_invocation_id) id:vec3u){
 if(any(id.xy>=p.grid)){return;}
 let point=(vec2f(id.xy)+.5)*p.size/vec2f(p.grid)-p.size*.5;
 let q=abs(point)-p.size*.5+p.radius;let a=max(q,vec2f(0));let len=length(a);
 let d=len+min(max(q.x,q.y),0.)-p.radius;
 var n=vec2f(0);
 if(d<0.&&d> -p.rim){
  let u= -d/p.rim;let bend=3.2*sqrt(u)*(1.-u)*(1.-u);
  var normal=select(vec2f(0,1),vec2f(1,0),q.x>=q.y);
  if(len>0.000001){normal=a/len;}
  n=sign(point)*normal*bend;
 }
 let channel=vec2u(clamp(round(vec2f(128)+126.*n),vec2f(0),vec2f(255)));
 pixels[id.y*p.grid.x+id.x]=channel.x|(channel.y<<8u)|(128u<<16u)|(255u<<24u);
}`;
    return Object.freeze({LIMITS,geometry,vector,field,recipe,WGSL});
});
