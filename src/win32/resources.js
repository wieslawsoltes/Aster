/* Bounded PE resources and standard/extended Win32 templates. MIT. */
'use strict';
(() => {
const W=globalThis.AsterWin32;
const resourceKey=value=>typeof value==='number'?'#'+value:'s:'+value;
class Reader {
    constructor(mem, start, size=65536) {
        if(!Number.isInteger(size)||size<0||size>8*1024*1024)throw Error('Resource size exceeds bounds');
        mem.check(start,size);this.mem=mem;this.start=start;this.end=start+size;this.at=start;
    }
    check(n) {if(!Number.isInteger(n)||n<0||this.at+n>this.end)throw Error('Truncated Win32 resource/template');return this.at;}
    u8(){const n=this.mem.u8(this.check(1));this.at++;return n;}
    u16(){const n=this.mem.u16(this.check(2));this.at+=2;return n;}
    i16(){return (this.u16()<<16)>>16;}
    u32(){const n=this.mem.u32(this.check(4));this.at+=4;return n;}
    align(n=4){this.at=Math.ceil(this.at/n)*n;this.check(0);}
    skip(n){this.check(n);this.at+=n;}
    string(first=null){let result='',ch=first===null?this.u16():first;for(let i=0;ch;i++){if(i>=32767)throw Error('Resource string quota exceeded');result+=String.fromCharCode(ch);ch=this.u16();}return result;}
    name(){const first=this.u16();return first===65535?this.u16():this.string(first);}
}
class ResourceIndex {
    constructor(image,mem){
        this.image=image;this.mem=mem;this.entries=[];this.lookups=new Map();
        const directory=image.resources;if(!directory?.rva)return;
        const {rva,size}=directory,base=image.base+rva;let budget=0;const stack=new Set();
        const within=(offset,n)=>{if(!Number.isInteger(offset)||offset<0||n<0||offset+n>size)throw Error('Resource directory offset outside bounds');return base+offset;};
        const mapped=(at,n)=>{if(at<image.base||at+n>image.base+image.imageSize||!image.sections.some(s=>at>=image.base+s.rva&&at+n<=image.base+s.rva+s.size))throw Error('Resource data outside mapped PE section');};
        const name=raw=>{if(!(raw&0x80000000))return raw;const p=within(raw&0x7fffffff,2),len=mem.u16(p);if(len>256)throw Error('Resource name quota exceeded');within((raw&0x7fffffff)+2,len*2);return mem.string(p+2,true,len);};
        const visit=(offset,path)=>{
            if(path.length>2||stack.has(offset))throw Error('Cyclic or overdeep resource directory');stack.add(offset);
            const p=within(offset,16),named=mem.u16(p+12),ids=mem.u16(p+14),count=named+ids;
            if(count>4096||(budget+=count)>8192)throw Error('Resource entry quota exceeded');within(offset+16,count*8);
            const seen=new Set();
            for(let i=0;i<count;i++){
                const raw=mem.u32(p+16+i*8),child=mem.u32(p+20+i*8),key=name(raw),tag=resourceKey(key);
                if(seen.has(tag))throw Error('Duplicate resource entry');seen.add(tag);
                if((i<named)!==!!(raw&0x80000000))throw Error('Invalid named resource ordering');
                if(child&0x80000000){visit(child&0x7fffffff,[...path,key]);continue;}
                if(path.length!==2||typeof key!=='number'||key>65535)throw Error('Invalid resource language leaf');
                const data=within(child,16),address=image.base+mem.u32(data),length=mem.u32(data+4);if(length>8*1024*1024)throw Error('Resource data quota exceeded');mapped(address,length);
                const record={type:path[0],name:path[1],lang:key,address,size:length,codePage:mem.u32(data+8),image};
                this.entries.push(record);const lookup=resourceKey(path[0])+'|'+resourceKey(path[1]);let list=this.lookups.get(lookup);if(!list)this.lookups.set(lookup,list=[]);list.push(record);
            }
            stack.delete(offset);
        };
        visit(0,[]);
    }
    find(type,name,lang=0){
        const values=this.lookups.get(resourceKey(type)+'|'+resourceKey(name));if(!values)return null;
        const exact=values.find(r=>r.lang===lang);if(exact)return exact;
        if(lang)return values.find(r=>r.lang===(lang&0x3ff))||values.find(r=>r.lang===0)||null;
        return values.find(r=>r.lang===0x409)||values[0]||null;
    }
}
function parseDialog(mem,ptr,size=65536){
    const r=new Reader(mem,ptr,Math.min(size,1048576));let extended=false,style,ex,help=0,count;
    const first=r.u16(),second=r.u16();r.at=ptr;
    if(first===1&&second===65535){extended=true;r.skip(4);help=r.u32();ex=r.u32();style=r.u32();count=r.u16();}
    else{style=r.u32();ex=r.u32();count=r.u16();}
    if(count>128)throw Error('Dialog control limit: 128');
    const x=r.i16(),y=r.i16(),width=r.i16(),height=r.i16(),menu=r.name(),className=r.name(),title=r.string();
    if(width<=0||height<=0||width>2048||height>2048)throw Error('Invalid dialog dimensions');
    let font=null;
    if(style&0x40){const size=r.u16();let weight=400,italic=0,charset=1;if(extended){weight=r.u16();italic=r.u8();charset=r.u8();}font={size,weight,italic,charset,face:r.string()};if(!size||size>72)throw Error('Dialog font exceeds bounds');}
    const controls=[];
    for(let i=0;i<count;i++){
        r.align();let controlHelp=0,controlEx,controlStyle;
        if(extended){controlHelp=r.u32();controlEx=r.u32();controlStyle=r.u32();}else{controlStyle=r.u32();controlEx=r.u32();}
        const cx=r.i16(),cy=r.i16(),cw=r.i16(),ch=r.i16(),id=extended?r.u32():r.u16(),cls=r.name(),text=r.name(),extra=r.u16();
        if(cw<0||ch<0||cw>2048||ch>2048)throw Error('Invalid dialog control dimensions');
        // Standard creation-data length includes its WORD; DIALOGEX excludes it.
        const creationData=extra?r.at:0,creationBytes=extra?(extended?extra:extra-2):0;
        if(creationBytes<0)throw Error('Invalid dialog creation-data length');r.skip(creationBytes);
        controls.push({help:controlHelp,ex:controlEx,style:controlStyle,x:cx,y:cy,width:cw,height:ch,id,className:cls,title:text,creationData,creationBytes});
    }
    return {extended,help,ex,style,x,y,width,height,menu,className,title,font,controls};
}
function parseMenu(mem,ptr,size=65536){
    const r=new Reader(mem,ptr,Math.min(size,1048576)),version=r.u16(),offset=r.u16();let count=0;
    if(version!==0&&version!==1)throw Error('Unsupported menu template version');
    if(version===1&&offset<4)throw Error('Invalid MENUEX header');r.skip(offset);
    const read=(depth=0)=>{
        if(depth>8)throw Error('Menu nesting exceeds eight');const list=[];let ended=false;
        while(!ended){
            if(++count>512)throw Error('Menu item quota exceeded');let flags,type=0,state=0,id=0,popup;
            if(version===1){r.align();type=r.u32();state=r.u32();id=r.u32();flags=r.u16();popup=!!(flags&1);}
            else{flags=r.u16();popup=!!(flags&0x10);if(!popup)id=r.u16();type=flags&0x900;state=flags&0xb;}
            const text=r.string();let children=null;
            if(popup){if(version===1){r.align();r.u32();}children=read(depth+1);}
            list.push({id,text,type,state,children,separator:!!(type&0x800)||(!popup&&!text&&!id)});ended=!!(flags&0x80);
        }return list;
    };
    return read();
}
function installResources(rt){
    const m=rt.mem,k=(name,n,fn)=>rt.register('kernel32.dll',name,n,fn),u=(name,n,fn)=>rt.register('user32.dll',name,n,fn);
    const pair=(reg,name,n,fn)=>{reg(name+'A',n,(...a)=>fn(false,...a));reg(name+'W',n,(...a)=>fn(true,...a));};
    const imageFor=h=>!h||h===rt.image?.base?rt.image:[...rt.modules.values()].find(im=>im.base===h);
    rt.resourceName=(p,wide=false)=>{if(p<=65535)return p;const name=m.string(p,wide);return /^#\d+$/.test(name)?Number(name.slice(1)):name;};
    rt.resource=(h,type,name,lang=0)=>{const image=imageFor(h);if(!image){rt.lastError=126;return null;}image.resourceIndex??=new ResourceIndex(image,m);const result=image.resourceIndex.find(type,name,lang);if(!result)rt.lastError=1814;return result;};
    const find=(wide,h,name,type,lang)=>{const res=rt.resource(h,rt.resourceName(type,wide),rt.resourceName(name,wide),lang);if(!res)return 0;res.handle??=rt.handle({type:'resource',record:res});return res.handle;};
    pair(k,'FindResource',3,(wide,h,name,type)=>find(wide,h,name,type,0));
    pair(k,'FindResourceEx',4,(wide,h,type,name,lang)=>find(wide,h,name,type,lang));
    k('SizeofResource',2,(h,res)=>{const r=rt.handles.get(res);if(r?.type!=='resource'||(h&&h!==r.record.image.base)){rt.lastError=6;return 0;}return r.record.size;});
    k('LoadResource',2,(h,res)=>{const r=rt.handles.get(res);if(r?.type!=='resource'||(h&&h!==r.record.image.base)){rt.lastError=6;return 0;}return r.record.address;});
    k('LockResource',1,p=>[...rt.handles.values()].some(h=>h.type==='resource'&&h.record.address===p)?p:0);
    k('FreeResource',1,()=>0);
    pair(u,'LoadString',4,(wide,h,id,out,n)=>{
        const res=rt.resource(h,6,(id>>>4)+1);if(!res)return 0;const r=new Reader(m,res.address,res.size);let length=0,address=0;
        for(let i=0;i<=(id&15);i++){length=r.u16();address=r.at;r.skip(length*2);}
        if(wide&&!n){m.w32(out,address);return length;}if(!n)return 0;
        const text=m.string(address,true,length);return m.putString(out,text,wide,n);
    });
    rt.resourceReader=Reader;
}
Object.assign(W,{ResourceReader:Reader,ResourceIndex,parseDialog,parseMenu,installResources});
if(typeof module!=='undefined'&&module.exports)module.exports=W;
})();
