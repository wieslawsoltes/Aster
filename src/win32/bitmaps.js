/* GDI bitmap/DC subset. Static sprites upload once; watched DIBs refresh only
 * after guest writes. All pixel storage and handles are process-private. MIT. */
'use strict';
(() => {
const W=globalThis.AsterWin32;
const MAX_PIXELS=2048*2048,MAX_TOTAL=8*1024*1024,SRCCOPY=0x00cc0020;
function dibInfo(mem,p,size=65536,usage=0){
    if(usage)throw Error('DIB_PAL_COLORS palettes are not implemented');
    const end=p+size,check=(at,n)=>{if(at<p||at+n>end)throw Error('Truncated bitmap resource/header');mem.check(at,n);};
    check(p,4);const header=mem.u32(p);if(![12,40,108,124].includes(header))throw Error('Unsupported DIB header size');check(p,header);
    const core=header===12,width=core?mem.u16(p+4):mem.i32(p+4),signedHeight=core?mem.u16(p+6):mem.i32(p+8),height=Math.abs(signedHeight),planes=mem.u16(p+(core?8:12)),bits=mem.u16(p+(core?10:14)),compression=core?0:mem.u32(p+16);
    if(planes!==1||width<1||height<1||width>2048||height>2048||width*height>MAX_PIXELS||![1,4,8,16,24,32].includes(bits))throw Error('Unsupported bitmap dimensions/format');
    if(compression!==0&&compression!==3||compression===3&&![16,32].includes(bits))throw Error('Compressed bitmap format is not implemented');
    let offset=header,masks=bits===16?[0x7c00,0x3e0,0x1f]:[0xff0000,0xff00,0xff];
    if(compression===3){const at=p+(header===40?offset:40);check(at,12);masks=[mem.u32(at),mem.u32(at+4),mem.u32(at+8)];if(header===40)offset+=12;let used=0;for(const mask of masks){if(!mask||(mask&used)||bits===16&&mask>65535)throw Error('Invalid bitmap channel masks');let n=mask>>>0;while(!(n&1))n>>>=1;if((n&(n+1))!==0)throw Error('Noncontiguous bitmap channel mask');used|=mask;}}
    const used=core?0:mem.u32(p+32),paletteCount=bits<=8?(used||1<<bits):used;
    if(paletteCount>256||bits<=8&&paletteCount>1<<bits)throw Error('Bitmap palette exceeds bounds');
    const palette=[];check(p+offset,paletteCount*(core?3:4));for(let i=0;i<paletteCount;i++){const at=p+offset+i*(core?3:4);palette.push([mem.u8(at+2),mem.u8(at+1),mem.u8(at),255]);}offset+=paletteCount*(core?3:4);
    const stride=Math.ceil(width*bits/32)*4,bytes=stride*height;
    return {header,width,height,topDown:signedHeight<0,bits,compression,palette,stride,bytes,offset,masks};
}
function decodePixels(raw,info){
    if(raw.length<info.bytes)throw Error('Truncated bitmap pixels');const out=new Uint8Array(info.width*info.height*4);
    const component=(value,mask)=>{let shift=0;while(!((mask>>>shift)&1))shift++;const max=mask>>>shift;return Math.round(((value&mask)>>>shift)*255/max);};
    for(let y=0;y<info.height;y++){const row=(info.topDown?y:info.height-1-y)*info.stride;for(let x=0;x<info.width;x++){const at=(y*info.width+x)*4;let color;
        if(info.bits<=8){const byte=raw[row+Math.floor(x*info.bits/8)],index=info.bits===8?byte:info.bits===4?(x&1?byte&15:byte>>>4):(byte>>>(7-(x&7)))&1;color=info.palette[index];if(!color)throw Error('Pixel references missing palette entry');}
        else if(info.bits===16||info.compression===3){const p=row+x*(info.bits/8),value=(raw[p]|raw[p+1]<<8|(info.bits===32?(raw[p+2]<<16)|(raw[p+3]<<24):0))>>>0;color=info.masks.map(mask=>component(value,mask));}
        else{const p=row+x*(info.bits/8);color=[raw[p+2],raw[p+1],raw[p]];}
        out[at]=color[0];out[at+1]=color[1];out[at+2]=color[2];out[at+3]=255;
    }}return out;
}
function encodePixels(rgba,info){
    const raw=new Uint8Array(info.bytes),channel=(value,mask)=>{let shift=0;while(!((mask>>>shift)&1))shift++;return (Math.round(value*(mask>>>shift)/255)<<shift)&mask;};
    for(let y=0;y<info.height;y++){const row=(info.topDown?y:info.height-1-y)*info.stride;for(let x=0;x<info.width;x++){const at=(y*info.width+x)*4;
        if(info.bits<=8){let nearest=0,distance=Infinity;for(let j=0;j<info.palette.length;j++){const v=info.palette[j],d=(rgba[at]-v[0])**2+(rgba[at+1]-v[1])**2+(rgba[at+2]-v[2])**2;if(d<distance){distance=d;nearest=j;if(!d)break;}}const p=row+Math.floor(x*info.bits/8);if(info.bits===8)raw[p]=nearest;else if(info.bits===4)raw[p]|=nearest<<((x&1)?0:4);else raw[p]|=nearest<<(7-(x&7));}
        else if(info.bits===16||info.compression===3){let v=0;info.masks.forEach((mask,i)=>v|=channel(rgba[at+i],mask));const p=row+x*(info.bits/8);for(let i=0;i<info.bits/8;i++)raw[p+i]=v>>>(i*8);}
        else{const p=row+x*(info.bits/8);raw[p]=rgba[at+2];raw[p+1]=rgba[at+1];raw[p+2]=rgba[at];if(info.bits===32)raw[p+3]=255;}
    }}return raw;
}
function installBitmaps(rt){
    const m=rt.mem,c=rt.cpu,g=(name,n,fn)=>rt.register('gdi32.dll',name,n,fn),u=(name,n,fn)=>rt.register('user32.dll',name,n,fn);
    const pair=(reg,name,n,fn)=>{reg(name+'A',n,(...a)=>fn(false,...a));reg(name+'W',n,(...a)=>fn(true,...a));};
    const fail=(error,result=0)=>{rt.lastError=error;return result;};
    const state=rt.bitmaps={pixels:0,decodedBytes:0,uploads:0,uploadBytes:0,cacheHits:0,dibRefreshes:0};
    const object=h=>rt.handles.get(h)?.type==='bitmap'?rt.handles.get(h):null;
    const make=(info,pixels,bits=0,stock=false)=>{if([...rt.handles.values()].filter(h=>h.type==='bitmap').length>=128||state.pixels+info.width*info.height>MAX_TOTAL)return fail(8);const h=rt.handle({type:'bitmap',...info,pixels,bitsPtr:bits,stock,revision:1,uploaded:new Map(),pages:[]});const b=object(h);b.id=h;state.pixels+=b.width*b.height;if(bits&&c.watch_memory){c.watch_memory(bits,b.bytes,1);for(let p=bits>>>12;p<Math.ceil((bits+b.bytes)/4096);p++)b.pages.push([p,c.page_version(p)]);}return h;};
    const rawChanged=b=>{if(!b.bitsPtr)return false;if(!c.page_version)return true;let changed=false;for(const item of b.pages){const version=c.page_version(item[0]);if(version!==item[1])changed=true;item[1]=version;}return changed;};
    const refresh=b=>{if(rawChanged(b)){b.pixels=decodePixels(m.bytes.subarray(b.bitsPtr,b.bitsPtr+b.bytes),b);b.revision++;state.dibRefreshes++;state.decodedBytes+=b.bytes;}};
    const modified=b=>{b.revision++;if(b.bitsPtr){m.copy(b.bitsPtr,encodePixels(b.pixels,b));for(const item of b.pages)item[1]=c.page_version?.(item[0])||0;}};
    const empty=(width,height)=>({width,height,bits:32,stride:width*4,bytes:width*height*4,topDown:true,compression:0,palette:[],masks:[0xff0000,0xff00,0xff]});
    const dimensions=(width,height)=>Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0&&width<=2048&&height<=2048&&width*height<=MAX_PIXELS;
    const stockBitmap=()=>{if(!state.stock)state.stock=make(empty(1,1),new Uint8Array([255,255,255,255]),0,true);return state.stock;};
    const bitmapDC=dc=>{const d=rt.get(dc,'dc');if(!d.memory)return null;const b=object(d.bitmapHandle);if(!b)throw Error('Memory DC has no selected bitmap');refresh(b);return b;};
    const ensure=(hwnd,b)=>{refresh(b);if(b.uploaded.get(hwnd)===b.revision){state.cacheHits++;return;}rt.draw(hwnd,{op:'bitmap',id:b.id,revision:b.revision,width:b.width,height:b.height,pixels:b.pixels.slice()});b.uploaded.set(hwnd,b.revision);state.uploads++;state.uploadBytes+=b.pixels.length;};
    pair(u,'LoadBitmap',2,(wide,h,p)=>{const res=rt.resource(h,2,rt.resourceName(p,wide));if(!res)return 0;const info=dibInfo(m,res.address,res.size);if(info.offset+info.bytes>res.size)throw Error('Truncated RT_BITMAP pixels');const pixels=decodePixels(m.bytes.subarray(res.address+info.offset,res.address+info.offset+info.bytes),info);state.decodedBytes+=info.bytes;return make(info,pixels);});
    g('CreateCompatibleDC',1,dc=>{if(dc&&rt.handles.get(dc)?.type!=='dc')return fail(6);const handle=stockBitmap();return rt.handle({type:'dc',memory:true,hwnd:0,bitmapHandle:handle,pen:{type:'pen',color:W.color(0),width:1},brush:{type:'brush',color:W.color(0xffffff)},font:{type:'font',size:16},text:W.color(0),background:W.color(0xffffff),bkMode:2,x:0,y:0,origin:[0,0],saved:[]});});
    g('DeleteDC',1,h=>{const d=rt.handles.get(h);if(d?.type!=='dc'||!d.memory)return 0;rt.handles.delete(h);return 1;});
    g('CreateCompatibleBitmap',3,(dc,width,height)=>{if(dc&&rt.handles.get(dc)?.type!=='dc')return fail(6);if(!width||!height)return stockBitmap();if(!dimensions(width,height))return fail(87);const p=new Uint8Array(width*height*4);for(let i=3;i<p.length;i+=4)p[i]=255;return make(empty(width,height),p);});
    g('CreateDIBSection',6,(dc,p,usage,out,section,offset)=>{if(out)m.w32(out,0);if(!out||section||offset)return fail(87);if(dc&&rt.handles.get(dc)?.type!=='dc')return fail(6);const info=dibInfo(m,p,65536,usage);const ptr=m.alloc(info.bytes);const pixels=decodePixels(m.bytes.subarray(ptr,ptr+info.bytes),info);const h=make(info,pixels,ptr);if(!h){m.free(ptr);return 0;}m.w32(out,ptr);return h;});
    g('CreateDIBitmap',6,(dc,pHeader,init,bits,pInfo,usage)=>{if(init&~4)return fail(87);const info=dibInfo(m,pInfo||pHeader,65536,usage);if(!init)return call('CreateCompatibleBitmap',dc,info.width,info.height);if(!bits)return fail(87);m.check(bits,info.bytes);return make(info,decodePixels(m.bytes.subarray(bits,bits+info.bytes),info));});
    const call=(name,...args)=>rt.apis.get('gdi32.dll!'+name).fn(...args);
    const oldSelect=rt.apis.get('gdi32.dll!SelectObject').fn;
    g('SelectObject',2,(dc,h)=>{const d=rt.handles.get(dc),b=object(h);if(!b)return oldSelect(dc,h);if(d?.type!=='dc'||!d.memory)return fail(87);if(!b.stock&&[...rt.handles.values()].some(v=>v.type==='dc'&&v!==d&&v.bitmapHandle===h))return fail(170);const old=d.bitmapHandle||stockBitmap();d.bitmapHandle=h;return old;});
    const oldDelete=rt.apis.get('gdi32.dll!DeleteObject').fn;
    g('DeleteObject',1,h=>{const b=object(h);if(!b)return oldDelete(h);if(b.stock||[...rt.handles.values()].some(d=>d.type==='dc'&&d.bitmapHandle===h))return 0;for(const hwnd of b.uploaded.keys())if(rt.handles.get(hwnd)?.type==='window')rt.draw(hwnd,{op:'deletebitmap',id:h});if(b.bitsPtr){c.watch_memory?.(b.bitsPtr,b.bytes,0);m.free(b.bitsPtr);}state.pixels-=b.width*b.height;rt.handles.delete(h);return 1;});
    pair(g,'GetObject',3,(wide,h,n,p)=>{const b=object(h);if(!b)return fail(6);const size=b.bitsPtr&&n>=84?84:24;if(!p)return b.bitsPtr?84:24;if(n<24)return 0;m.zero(p,Math.min(n,size));m.w32(p+4,b.width);m.w32(p+8,b.height);m.w32(p+12,b.stride);m.w16(p+16,1);m.w16(p+18,b.bits);m.w32(p+20,b.bitsPtr||0);if(size===84){m.w32(p+24,40);m.w32(p+28,b.width);m.w32(p+32,b.topDown?-b.height:b.height);m.w16(p+36,1);m.w16(p+38,b.bits);m.w32(p+40,b.compression);m.w32(p+44,b.bytes);b.masks.forEach((v,i)=>m.w32(p+64+i*4,v));}return size;});
    g('GetObjectType',1,h=>{const o=rt.handles.get(h);return ({bitmap:7,brush:2,pen:1,font:6,dc:o?.memory?10:3})[o?.type]||0;});
    g('GetCurrentObject',2,(dc,type)=>{const d=rt.handles.get(dc);if(d?.type!=='dc')return 0;return d[({1:'pen',2:'brush',6:'font',7:'bitmap'})[type]+'Handle']||0;});
    function clip(x,y,width,height,sx,sy,sw,sh,dw,dh,bw,bh){
        if(width<=0||height<=0||sw<=0||sh<=0)return null;const left=Math.ceil(Math.max(x,0,x-sx*width/sw)),top=Math.ceil(Math.max(y,0,y-sy*height/sh)),right=Math.floor(Math.min(x+width,dw,x+(bw-sx)*width/sw)),bottom=Math.floor(Math.min(y+height,dh,y+(bh-sy)*height/sh));if(right<=left||bottom<=top)return null;
        return {x:left,y:top,w:right-left,h:bottom-top,sx:sx+(left-x)*sw/width,sy:sy+(top-y)*sh/height,sw:(right-left)*sw/width,sh:(bottom-top)*sh/height};
    }
    function blit(dc,x,y,width,height,src,sx,sy,sw,sh,rop){
        if(rop!==SRCCOPY)throw Error('Only SRCCOPY bitmap raster operation is implemented');
        x|=0;y|=0;width|=0;height|=0;sx|=0;sy|=0;sw|=0;sh|=0;
        if(width<0||height<0||sw<0||sh<0)throw Error('Mirrored bitmap blits are not implemented');
        const d=rt.get(dc,'dc'),s=rt.get(src,'dc'),b=bitmapDC(src);if(!b)throw Error('Window-to-bitmap readback is not implemented');
        const dest=d.memory?bitmapDC(dc):rt.get(d.hwnd,'window'),q=clip(x,y,width,height,sx,sy,sw,sh,dest.width,dest.height,b.width,b.height);if(!q)return 1;
        if(d.memory){const bytes=dest===b?b.pixels.slice():b.pixels;for(let j=0;j<q.h;j++)for(let i=0;i<q.w;i++){const xx=Math.min(b.width-1,Math.floor(q.sx+(i+.5)*q.sw/q.w)),yy=Math.min(b.height-1,Math.floor(q.sy+(j+.5)*q.sh/q.h)),from=(yy*b.width+xx)*4,to=((q.y+j)*dest.width+q.x+i)*4;dest.pixels.set(bytes.subarray(from,from+4),to);}modified(dest);}
        else{ensure(d.hwnd,b);rt.draw(d.hwnd,{op:'blit',id:b.id,...q});}return 1;
    }
    g('BitBlt',9,(dc,x,y,w,h,src,sx,sy,rop)=>blit(dc,x,y,w,h,src,sx,sy,w,h,rop));g('StretchBlt',11,blit);
    g('SetStretchBltMode',2,(dc,mode)=>{const d=rt.get(dc,'dc');if(![1,2,3,4].includes(mode))return fail(87);if(mode!==3)throw Error('Only COLORONCOLOR nearest-neighbor stretching is implemented');const old=d.stretchMode||3;d.stretchMode=mode;return old;});
    g('GetStretchBltMode',1,dc=>rt.get(dc,'dc').stretchMode||3);
    g('SetDIBits',7,(dc,h,start,lines,bits,info,usage)=>{const b=object(h);if(!b||!bits)return fail(87);refresh(b);const fmt=dibInfo(m,info,65536,usage);if(fmt.width!==b.width||start+lines>fmt.height||fmt.height!==b.height)return fail(87);m.check(bits,fmt.stride*lines);const part={...fmt,height:lines,bytes:fmt.stride*lines};const pixels=decodePixels(m.bytes.subarray(bits,bits+part.bytes),part);const top=fmt.topDown?start:fmt.height-start-lines;b.pixels.set(pixels,top*b.width*4);modified(b);return lines;});
    g('GetDIBits',7,(dc,h,start,lines,bits,info,usage)=>{
        const b=object(h);if(!b)return fail(6);refresh(b);if(!bits){if(m.u32(info)<40)return fail(87);m.w32(info+4,b.width);m.w32(info+8,b.height);m.w16(info+12,1);if(!m.u16(info+14))m.w16(info+14,32);const stride=Math.ceil(b.width*m.u16(info+14)/32)*4;m.w32(info+16,0);m.w32(info+20,stride*b.height);return b.height;}
        const fmt=dibInfo(m,info,65536,usage);if(fmt.width!==b.width||fmt.height!==b.height||start+lines>b.height)return fail(87);const raw=encodePixels(b.pixels,fmt);m.copy(bits,raw.subarray(start*fmt.stride,(start+lines)*fmt.stride));return lines;
    });
    const stretchDIB=(dc,x,y,w,h,sx,sy,sw,sh,bits,info,usage,rop)=>{const fmt=dibInfo(m,info,65536,usage);m.check(bits,fmt.bytes);const b=make(fmt,decodePixels(m.bytes.subarray(bits,bits+fmt.bytes),fmt));if(!b)return -1;const memory=call('CreateCompatibleDC',dc),old=call('SelectObject',memory,b);try{return blit(dc,x,y,w,h,memory,sx,sy,sw,sh,rop)?sh:0;}finally{call('SelectObject',memory,old);call('DeleteDC',memory);call('DeleteObject',b);}};
    g('StretchDIBits',13,stretchDIB);
    g('SetDIBitsToDevice',12,(dc,x,y,w,h,sx,sy,start,lines,bits,info,usage)=>{const fmt=dibInfo(m,info,65536,usage);if(start||lines!==fmt.height)throw Error('Partial scan-band SetDIBitsToDevice is not implemented');return stretchDIB(dc,x,y,w,h,sx,sy,w,h,bits,info,usage,SRCCOPY);});
    // Memory DC drawing never paints the desktop. Basic opaque GDI shapes also
    // update DIB-section bytes so later guest CPU reads observe the same pixels.
    const pixel=(b,x,y,color)=>{if(x>=0&&y>=0&&x<b.width&&y<b.height)b.pixels.set(color,(y*b.width+x)*4);};
    const paintRect=(b,x,y,w,h,color)=>{const l=Math.max(0,x),t=Math.max(0,y),r=Math.min(b.width,x+w),bottom=Math.min(b.height,y+h);for(let yy=t;yy<bottom;yy++)for(let xx=l;xx<r;xx++)pixel(b,xx,yy,color);};
    const originalDraw=rt.draw.bind(rt);
    // Existing vector APIs target d.hwnd. Give memory DCs an internal, negative
    // draw destination and intercept it before any host message is constructed.
    const originalCreateDC=rt.apis.get('gdi32.dll!CreateCompatibleDC').fn;
    g('CreateCompatibleDC',1,dc=>{const h=originalCreateDC(dc);if(h)rt.handles.get(h).hwnd=-h;return h;});
    rt.draw=(hwnd,cmd)=>{if(hwnd>=0)return originalDraw(hwnd,cmd);const dc=-hwnd,b=bitmapDC(dc);if(!b)throw Error('Invalid memory drawing surface');
        if(cmd.op==='rect'){if(cmd.color)paintRect(b,cmd.x,cmd.y,cmd.w,cmd.h,cmd.color);if(cmd.stroke){const t=Math.min(cmd.width||1,cmd.w,cmd.h);paintRect(b,cmd.x,cmd.y,cmd.w,t,cmd.stroke);paintRect(b,cmd.x,cmd.y+cmd.h-t,cmd.w,t,cmd.stroke);paintRect(b,cmd.x,cmd.y,t,cmd.h,cmd.stroke);paintRect(b,cmd.x+cmd.w-t,cmd.y,t,cmd.h,cmd.stroke);}}
        else if(cmd.op==='line'){let x=cmd.x,y=cmd.y,dx=Math.abs(cmd.x2-x),dy=-Math.abs(cmd.y2-y),sx=x<cmd.x2?1:-1,sy=y<cmd.y2?1:-1,err=dx+dy,steps=0;for(;;){if(++steps>8192)throw Error('Memory line exceeds budget');pixel(b,x,y,cmd.color);if(x===cmd.x2&&y===cmd.y2)break;const twice=2*err;if(twice>=dy){err+=dy;x+=sx;}if(twice<=dx){err+=dx;y+=sy;}}}
        else throw Error('Memory DC supports opaque rectangles and single-pixel lines only');modified(b);
    };
    g('GetPixel',3,(dc,x,y)=>{const d=rt.get(dc,'dc');if(!d.memory)throw Error('Window GetPixel readback is not implemented');const b=bitmapDC(dc);x|=0;y|=0;if(x<0||y<0||x>=b.width||y>=b.height)return -1;const at=(y*b.width+x)*4;return b.pixels[at]|b.pixels[at+1]<<8|b.pixels[at+2]<<16;});
    u('FillRect',3,(dc,p,brush)=>{const d=rt.get(dc,'dc'),b=brush<=31?{color:W.color(W.GUI_COLORS?.[brush-1]??0xf0f0f0)}:rt.get(brush,'brush');if(!b.null)rt.draw(d.hwnd,{op:'rect',x:m.i32(p),y:m.i32(p+4),w:m.i32(p+8)-m.i32(p),h:m.i32(p+12)-m.i32(p+4),color:b.color});return 1;});
    rt.bitmapObject=object;rt.refreshBitmap=refresh;rt.bitmapInfo=dibInfo;
}
Object.assign(W,{dibInfo,decodePixels,encodePixels,installBitmaps});if(typeof module!=='undefined'&&module.exports)module.exports=W;
})();
