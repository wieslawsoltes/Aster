/* A bounded per-executable virtual registry. Never accesses a host registry. MIT. */
'use strict';
(() => {
const W=globalThis.AsterWin32;
const ROOTS=new Map([[0x80000000,'hkcr'],[0x80000001,'hkcu'],[0x80000002,'hklm'],[0x80000003,'hku'],[0x80000005,'hkcc']]);
const LIMITS={keys:256,values:512,valueBytes:16384,totalBytes:1048576};
function installRegistry(rt){
    const m=rt.mem,keys=new Map(),adv=(name,n,fn)=>rt.register('advapi32.dll',name,n,fn);
    const pair=(name,n,fn)=>{adv(name+'A',n,(...a)=>fn(false,...a));adv(name+'W',n,(...a)=>fn(true,...a));};
    for(const root of ROOTS.values())keys.set(root,{path:root,name:root,volatile:false,values:new Map()});
    rt.registry={keys,revision:0,dirty:false};
    const changed=()=>{rt.registry.revision++;rt.registry.dirty=true;};
    const split=name=>{if(typeof name!=='string'||name.length>512||name.includes('\0'))throw Error('Registry path exceeds bounds');const parts=name.split('\\').filter(Boolean);if(parts.length>32||parts.some(p=>p.length>255))throw Error('Registry key name exceeds bounds');return parts;};
    const handle=(h,rights=0)=>{
        if(ROOTS.has(h))return {path:ROOTS.get(h),access:0x3f};
        const key=rt.handles.get(h);if(key?.type!=='regkey'||!keys.has(key.path))return {error:6};
        if(rights&&(key.access&rights)!==rights)return {error:5};return key;
    };
    const target=(h,name,rights=0)=>{const key=handle(h,rights);if(key.error)return key;const parts=split(name);return {path:key.path+(parts.length?'\\'+parts.join('\\').toLowerCase():''),parts,parent:key.path,access:key.access};};
    const getName=(p,wide)=>p?m.string(p,wide):'';
    const decodeA=bytes=>m.decoder.decode(bytes),encodeA=text=>Uint8Array.from(text,ch=>m.encoder.get(ch)??63);
    const decodeW=bytes=>{if(bytes.length%2)throw Error('Odd UTF-16 registry data');let text='';for(let i=0;i<bytes.length;i+=2)text+=String.fromCharCode(bytes[i]|bytes[i+1]<<8);return text;};
    const encodeW=text=>{const bytes=new Uint8Array(text.length*2),view=new DataView(bytes.buffer);for(let i=0;i<text.length;i++)view.setUint16(i*2,text.charCodeAt(i),true);return bytes;};
    const stringType=type=>[1,2,7].includes(type);
    const budget=(exclude=null)=>{let count=0,bytes=0;for(const key of keys.values())for(const v of key.values.values())if(v!==exclude){count++;bytes+=v.bytes.length;}return {count,bytes};};
    const validAccess=access=>!(access&~0x010f033f); // Standard rights + 32/64-bit views share this private namespace.
    pair('RegOpenKeyEx',5,(wide,h,p,options,access,out)=>{
        if(!out)return 87;m.w32(out,0);if(options||!validAccess(access))return 87;
        const key=target(h,getName(p,wide));if(key.error)return key.error;if(!keys.has(key.path))return 2;
        m.w32(out,rt.handle({type:'regkey',path:key.path,access:access&0x3f}));return 0;
    });
    pair('RegOpenKey',3,(wide,h,p,out)=>rt.apis.get('advapi32.dll!RegOpenKeyEx'+(wide?'W':'A')).fn(h,p,0,0x3f,out));
    pair('RegCreateKeyEx',9,(wide,h,p,reserved,cls,options,access,security,out,disposition)=>{
        if(!out)return 87;m.w32(out,0);if(reserved||security||options>1||!validAccess(access))return 87;
        const key=target(h,getName(p,wide),4);if(key.error)return key.error;
        let path=key.parent;const missing=[];for(const part of key.parts){path+='\\'+part.toLowerCase();if(!keys.has(path))missing.push({path,name:part});}
        if(keys.size+missing.length>LIMITS.keys)return 8;
        const existed=keys.has(key.path);for(const item of missing)keys.set(item.path,{...item,volatile:!!options||keys.get(item.path.slice(0,item.path.lastIndexOf('\\')))?.volatile,values:new Map()});
        if(missing.length)changed();m.w32(out,rt.handle({type:'regkey',path:key.path,access:access&0x3f}));if(disposition)m.w32(disposition,existed?2:1);return 0;
    });
    pair('RegCreateKey',3,(wide,h,p,out)=>rt.apis.get('advapi32.dll!RegCreateKeyEx'+(wide?'W':'A')).fn(h,p,0,0,0,0x3f,0,out,0));
    adv('RegCloseKey',1,h=>{if(ROOTS.has(h))return 0;if(rt.handles.get(h)?.type!=='regkey')return 6;rt.handles.delete(h);return 0;});
    pair('RegSetValueEx',6,(wide,h,p,reserved,type,data,n)=>{
        const key=handle(h,2);if(key.error)return key.error;
        if(reserved||![0,1,2,3,4,7,11].includes(type)||n>LIMITS.valueBytes||(!data&&n)||type===4&&n!==4||type===11&&n!==8||wide&&stringType(type)&&n%2)return 87;
        const name=getName(p,wide);if(name.length>255)return 87;let bytes=n?m.bytes.slice(m.check(data,n),data+n):new Uint8Array();
        if(!wide&&stringType(type))bytes=encodeW(decodeA(bytes));if(bytes.length>LIMITS.valueBytes)return 8;
        const values=keys.get(key.path).values,old=values.get(name.toLowerCase()),b=budget(old);if(b.count>=LIMITS.values||b.bytes+bytes.length>LIMITS.totalBytes)return 8;
        values.set(name.toLowerCase(),{name,type,bytes});changed();return 0;
    });
    const query=(wide,h,p,reserved,type,out,size)=>{
        const key=handle(h,1);if(key.error)return key.error;if(reserved||out&&!size)return 87;
        const value=keys.get(key.path).values.get(getName(p,wide).toLowerCase());if(!value)return 2;
        const bytes=!wide&&stringType(value.type)?encodeA(decodeW(value.bytes)):value.bytes;
        if(type)m.w32(type,value.type);if(!size)return 0;const capacity=m.u32(size);m.w32(size,bytes.length);
        if(!out)return 0;if(capacity<bytes.length)return 234;m.copy(out,bytes);return 0;
    };
    pair('RegQueryValueEx',6,query);
    pair('RegDeleteValue',2,(wide,h,p)=>{const key=handle(h,2);if(key.error)return key.error;if(!keys.get(key.path).values.delete(getName(p,wide).toLowerCase()))return 2;changed();return 0;});
    const children=path=>[...keys.values()].filter(k=>k.path.startsWith(path+'\\')&&!k.path.slice(path.length+1).includes('\\')).sort((a,b)=>a.path<b.path?-1:1);
    pair('RegDeleteKey',2,(wide,h,p)=>{const key=target(h,getName(p,wide));if(key.error)return key.error;if(!key.parts.length)return 5;if(!keys.has(key.path))return 2;if(children(key.path).length)return 5;keys.delete(key.path);changed();return 0;});
    pair('RegDeleteTree',2,(wide,h,p)=>{const key=target(h,getName(p,wide),2|8);if(key.error)return key.error;if(!keys.has(key.path))return 2;for(const path of [...keys.keys()])if(path.startsWith(key.path+'\\')||(key.parts.length&&path===key.path))keys.delete(path);if(!key.parts.length)keys.get(key.path).values.clear();changed();return 0;});
    pair('RegEnumKeyEx',8,(wide,h,index,out,length,reserved,cls,classLength,time)=>{
        const key=handle(h,8);if(key.error)return key.error;if(reserved||!length||!out)return 87;const child=children(key.path)[index];if(!child)return 259;
        const n=m.u32(length);m.w32(length,child.name.length);if(n<=child.name.length)return 234;m.putString(out,child.name,wide,n);
        if(classLength){const capacity=m.u32(classLength);m.w32(classLength,0);if(cls&&capacity)m.putString(cls,'',wide,capacity);}if(time)m.zero(time,8);return 0;
    });
    pair('RegEnumKey',4,(wide,h,index,out,n)=>{const key=handle(h,8);if(key.error)return key.error;const child=children(key.path)[index];if(!child)return 259;if(n<=child.name.length)return 234;m.putString(out,child.name,wide,n);return 0;});
    pair('RegEnumValue',8,(wide,h,index,out,length,reserved,type,data,size)=>{
        const key=handle(h,1);if(key.error)return key.error;if(reserved||!length||!out||data&&!size)return 87;
        const value=[...keys.get(key.path).values.values()].sort((a,b)=>a.name.toLowerCase()<b.name.toLowerCase()?-1:1)[index];if(!value)return 259;
        const bytes=!wide&&stringType(value.type)?encodeA(decodeW(value.bytes)):value.bytes,n=m.u32(length),capacity=size?m.u32(size):0;
        m.w32(length,value.name.length);if(type)m.w32(type,value.type);if(size)m.w32(size,bytes.length);
        if(n<=value.name.length||data&&capacity<bytes.length)return 234;m.putString(out,value.name,wide,n);if(data)m.copy(data,bytes);return 0;
    });
    pair('RegQueryInfoKey',12,(wide,h,cls,clsLen,reserved,nKeys,maxKey,maxClass,nValues,maxValue,maxData,securitySize,time)=>{
        const key=handle(h,1);if(key.error)return key.error;if(reserved)return 87;const sub=children(key.path),values=[...keys.get(key.path).values.values()];
        if(clsLen){const n=m.u32(clsLen);m.w32(clsLen,0);if(cls&&n)m.putString(cls,'',wide,n);}
        for(const [p,n]of[[nKeys,sub.length],[maxKey,Math.max(0,...sub.map(k=>k.name.length))],[maxClass,0],[nValues,values.length],[maxValue,Math.max(0,...values.map(v=>v.name.length))],[maxData,Math.max(0,...values.map(v=>v.bytes.length))],[securitySize,0]])if(p)m.w32(p,n);
        if(time)m.zero(time,8);return 0;
    });
    adv('RegFlushKey',1,h=>{const key=handle(h);if(key.error)return key.error;rt.registry.dirty=true;return 0;});
    // Snapshot validation is transactional: a bad entry changes no registry state.
    rt.exportRegistry=()=>({version:1,keys:[...keys.values()].filter(k=>!k.volatile).map(k=>({path:k.path,name:k.name,values:[...k.values.values()].map(v=>({name:v.name,type:v.type,bytes:v.bytes.slice()}))}))});
    rt.importRegistry=snapshot=>{
        if(snapshot==null)return;if(snapshot.version!==1||!Array.isArray(snapshot.keys)||snapshot.keys.length>LIMITS.keys)throw Error('Invalid registry snapshot');
        const next=new Map();let valueCount=0,total=0;
        for(const item of snapshot.keys){
            if(!item||typeof item.path!=='string'||item.path!==item.path.toLowerCase()||![...ROOTS.values()].includes(item.path.split('\\')[0])||typeof item.name!=='string'||item.name.length>255||item.name.includes('\0')||!Array.isArray(item.values)||next.has(item.path))throw Error('Invalid registry key snapshot');
            const parts=split(item.path);if(parts.join('\\')!==item.path||item.name.toLowerCase()!==parts.at(-1))throw Error('Noncanonical registry key snapshot');const values=new Map();for(const v of item.values){
                if(!v||typeof v.name!=='string'||v.name.length>255||v.name.includes('\0')||![0,1,2,3,4,7,11].includes(v.type)||!(v.bytes instanceof Uint8Array)||v.bytes.length>LIMITS.valueBytes||stringType(v.type)&&v.bytes.length%2||v.type===4&&v.bytes.length!==4||v.type===11&&v.bytes.length!==8||values.has(v.name.toLowerCase()))throw Error('Invalid registry value snapshot');
                if(++valueCount>LIMITS.values||(total+=v.bytes.length)>LIMITS.totalBytes)throw Error('Registry snapshot exceeds quota');values.set(v.name.toLowerCase(),{name:v.name,type:v.type,bytes:v.bytes.slice()});
            }next.set(item.path,{path:item.path,name:item.name,values,volatile:false});
        }
        for(const root of ROOTS.values())if(!next.has(root))next.set(root,{path:root,name:root,values:new Map(),volatile:false});
        if(next.size>LIMITS.keys)throw Error('Registry key quota exceeded');
        for(const key of next.values())if(key.path.includes('\\')&&!next.has(key.path.slice(0,key.path.lastIndexOf('\\'))))throw Error('Registry snapshot missing parent key');
        keys.clear();for(const [path,key]of next)keys.set(path,key);rt.registry.dirty=false;
    };
}
Object.assign(W,{installRegistry,REGISTRY_LIMITS:LIMITS});if(typeof module!=='undefined'&&module.exports)module.exports=W;
})();
