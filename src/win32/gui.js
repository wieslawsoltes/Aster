/* Browser-backed USER32 windows, resource dialogs and menus. MIT.
 * Guest callbacks run only on the emulation stack; browser events enqueue messages.
 * No window, menu, clipboard or process outside this virtual process is exposed.
 */
'use strict';
(() => {
const W=globalThis.AsterWin32;
const CHILD=0x40000000,VISIBLE=0x10000000,DISABLED=0x08000000;
const BUILTIN=new Map([[0x80,'BUTTON'],[0x81,'EDIT'],[0x82,'STATIC'],[0x83,'LISTBOX'],[0x84,'SCROLLBAR'],[0x85,'COMBOBOX']]);
const COLORS=[0xc8c8c8,0,0xd77800,0xb99d63,0xf0f0f0,0xffffff,0x646464,0,0,0xffffff,0xb4b4b4,0xfcf7f4,0xababab,0xd77800,0xffffff,0xf0f0f0,0xa0a0a0,0x6d6d6d,0,0,0xffffff,0x696969,0xe3e3e3,0,0xe1ffff,0,0xcc6600,0xd77800,0xb99d63,0xd77800,0xf0f0f0];
const makeLong=(lo,hi)=>((lo&65535)|((hi&65535)<<16))>>>0;
function installGUI(rt){
    const m=rt.mem,c=rt.cpu;
    const colors=rt.systemColors=COLORS.slice(); rt.themeRevision=0;
    const u=(name,n,fn)=>rt.register('user32.dll',name,n,fn),g=(name,n,fn)=>rt.register('gdi32.dll',name,n,fn);
    const pair=(reg,name,n,fn)=>{reg(name+'A',n,(...args)=>fn(false,...args));reg(name+'W',n,(...args)=>fn(true,...args));};
    const fail=(error,result=0)=>{rt.lastError=error;return result;};
    const gui=rt.gui={atoms:new Map(),nextAtom:0xc000,focus:0,active:0,capture:0,cursor:0,modal:[],keys:new Set(),menuRevision:0};
    const win=h=>rt.handles.get(h)?.type==='window'?rt.handles.get(h):null;
    const windows=()=>[...rt.handles].filter(([,v])=>v.type==='window');
    const children=h=>windows().filter(([,v])=>v.parent===h);
    const text=(p,wide)=>p?m.string(p,wide):'';
    const call=(dll,name,...args)=>rt.apis.get(dll+'!'+name).fn(...args);
    const extents=(style,ex,menu)=>{if(style&CHILD)return {left:0,top:0,right:0,bottom:0};const border=(style&0x00c00000)||(ex&1)?4:0;return {left:border,right:border,top:border+((style&0x00c00000)===0x00c00000?24:0)+(menu?22:0),bottom:border};};
    const rect=p=>[m.i32(p),m.i32(p+4),m.i32(p+8),m.i32(p+12)];
    const putRect=(p,r)=>{m.check(p,16);r.forEach((v,i)=>m.w32(p+i*4,v));return r[2]>r[0]&&r[3]>r[1]?1:0;};
    const intersect=(a,b)=>{const r=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];return r[2]>r[0]&&r[3]>r[1]?r:[0,0,0,0];};
    const origin=(h,seen=new Set())=>{const w=win(h);if(!w)return [0,0];if(seen.has(h))throw Error('Window parent cycle');seen.add(h);if(w.parent){const p=origin(w.parent,seen);return [p[0]+w.x,p[1]+w.y];}const e=extents(w.style,w.ex,w.menu);return [w.x+e.left,w.y+e.top];};
    const isChild=(parent,h)=>{const seen=new Set();for(let w=win(h);w?.parent;w=win(w.parent)){if(w.parent===parent)return true;if(seen.has(w.parent))return false;seen.add(w.parent);}return false;};
    const enabled=h=>{for(let w=win(h);w;w=win(w.parent))if(w.style&DISABLED)return false;return !!win(h);};
    const sendState=h=>{const w=win(h);if(w)rt.emit('controlstate',{hwnd:h,style:w.style,enabled:enabled(h),check:w.check||0,selection:w.selection||[0,0],limit:w.limit||32767,items:w.items||[],selected:w.selected??-1,font:w.font||0});};
    const className=(p,wide)=>typeof p==='string'?p:p<=65535?(gui.atoms.get(p)||BUILTIN.get(p)||''):text(p,wide);
    const classRecord=name=>rt.classes.get(String(name).toLowerCase());
    const menuObject=h=>rt.handles.get(h)?.type==='menu'?rt.handles.get(h):null;
    const menuTree=(h,seen=new Set(),depth=0)=>{
        if(depth>8||seen.has(h))throw Error('Menu cycle/nesting limit');const menu=menuObject(h);if(!menu)return [];seen.add(h);
        const result=menu.items.map(i=>({id:i.id,text:i.text,state:i.state,type:i.flags,separator:!!(i.flags&0x800),submenu:i.submenu||0,children:i.submenu?menuTree(i.submenu,new Set(seen),depth+1):null}));return result;
    };
    const changedMenu=()=>{gui.menuRevision++;for(const [hwnd,w]of windows())if(w.menu)rt.emit('menu',{hwnd,handle:w.menu,items:menuTree(w.menu),revision:gui.menuRevision});};
    const findItem=(h,id,flags=0,seen=new Set())=>{const menu=menuObject(h);if(!menu||seen.has(h))return null;seen.add(h);if(flags&0x400)return menu.items[id]?{menu,index:id,item:menu.items[id]}:null;for(let index=0;index<menu.items.length;index++){const item=menu.items[index];if(item.id===id&&!item.submenu)return {menu,index,item};if(item.submenu){const found=findItem(item.submenu,id,flags,seen);if(found)return found;}}return null;};
    const createMenu=(list=[],popup=false)=>{if([...rt.handles.values()].filter(h=>h.type==='menu').length>=128)throw Error('Menu handle quota exceeded');const h=rt.handle({type:'menu',popup,items:[]});const menu=menuObject(h);for(const item of list)menu.items.push({id:item.id,text:item.text,state:item.state||0,flags:item.type||0,submenu:item.children?createMenu(item.children,true):0});return h;};
    const loadMenu=(h,name)=>{const res=rt.resource(h,4,name);return res?createMenu(W.parseMenu(m,res.address,res.size)):0;};
    const destroyMenu=(h,seen=new Set())=>{const menu=menuObject(h);if(!menu||seen.has(h))return 0;seen.add(h);for(const item of menu.items)if(item.submenu)destroyMenu(item.submenu,seen);for(const [,w]of windows())if(w.menu===h)w.menu=0;rt.handles.delete(h);return 1;};
    const defineClass=(wide,p,extended)=>{
        const off=extended?4:0;m.check(p,extended?48:40);if(extended&&m.u32(p)!==48)return fail(87);
        const name=className(m.u32(p+off+36),wide).toLowerCase();if(!name)return fail(87);if(rt.classes.has(name))return fail(1410);
        const extra=m.i32(p+off+12);if(extra<0||extra>1024||rt.classes.size>=128)return fail(8);
        const atom=gui.nextAtom++;rt.classes.set(name,{proc:m.u32(p+off+4),background:m.u32(p+off+28),wide,extra,instance:m.u32(p+off+16),menu:rt.resourceName(m.u32(p+off+32),wide),style:m.u32(p+off),atom});gui.atoms.set(atom,name);return atom;
    };
    pair(u,'RegisterClass',1,(wide,p)=>defineClass(wide,p,false));pair(u,'RegisterClassEx',1,(wide,p)=>defineClass(wide,p,true));
    pair(u,'UnregisterClass',2,(wide,p,instance)=>{const name=className(p,wide).toLowerCase(),cls=classRecord(name);if(!cls)return fail(1411);if(windows().some(([,w])=>w.className.toLowerCase()===name))return fail(1412);rt.classes.delete(name);gui.atoms.delete(cls.atom);return 1;});
    // A virtual nonclient frame has fixed metrics. AdjustWindowRect and geometry
    // APIs use the same metrics; DOM window furniture does not alter guest memory.
    async function createWindow(wide,ex,pClass,pTitle,style,x,y,width,height,parent,id,instance,param,options={}){
        const name=className(pClass,wide),cls=classRecord(name),builtin=['BUTTON','EDIT','STATIC'].includes(name.toUpperCase());
        if(!name||!cls&&!builtin&&!options.dialog)return fail(1407);
        const child=!!(style&CHILD);if(parent&&!win(parent))return fail(1400);
        if(windows().length>=128||!child&&windows().filter(([,w])=>!w.parent).length>=8)return fail(8);
        let menu=child?0:id;if(!menu&&cls?.menu)menu=loadMenu(instance,cls.menu);if(menu&&!menuObject(menu))return fail(1401);
        const e=extents(style,ex,menu),ow=(width|0)<=0?680:width|0,oh=(height|0)<=0?460:height|0;
        width=options.client?ow:Math.max(1,ow-e.left-e.right);height=options.client?oh:Math.max(1,oh-e.top-e.bottom);
        if(width>2048||height>2048)return fail(8);
        x=(x|0)===-2147483648?0:x|0;y=(y|0)===-2147483648?0:y|0;
        const title=typeof pTitle==='string'?pTitle:text(pTitle,wide);
        const record={type:'window',className:name,text:title,width,height,x,y,parent:child?parent:0,owner:child?0:parent,id:child?id:0,menu,style:style>>>0,ex:ex>>>0,instance,wide,proc:cls?.proc||0,background:cls?.background||0,visible:!!(style&VISIBLE),extra:new Uint8Array(options.dialog?32:cls?.extra||0),selection:[0,0],limit:32767,items:[],selected:-1,...options};
        const h=rt.handle(record);if(!child&&!rt.mainWindow)rt.mainWindow=h;
        await rt.emit('window',{hwnd:h,parent:record.parent,owner:record.owner,className:name,title,width,height,x,y,style:record.style,ex,dialog:!!options.dialog,modal:!!options.modal,id:record.id,menu});
        if(menu)changedMenu();
        if(record.proc&&!options.dialog){const p=m.alloc(48),temporary=[];const stringPtr=(value,wide)=>{if(typeof value!=='string')return value;const ptr=m.str(value,wide);temporary.push(ptr);return ptr;};
            [param,instance,id,parent,height,width,y,x,style,stringPtr(pTitle,wide),stringPtr(pClass,wide),ex].forEach((v,i)=>m.w32(p+i*4,v));
            try{if(!await rt.invoke(record.proc,[h,0x81,0,p])){record.ncCreateFailed=true;await rt.destroyWindow(h);return 0;}const result=await rt.invoke(record.proc,[h,1,0,p]);if((result|0)===-1){await rt.destroyWindow(h);return 0;}}finally{m.free(p);for(const ptr of temporary)m.free(ptr);}
        }
        return h;
    }
    pair(u,'CreateWindowEx',12,(wide,...args)=>createWindow(wide,...args));
    pair(u,'CreateWindow',11,(wide,...args)=>createWindow(wide,0,...args));
    u('IsWindow',1,h=>win(h)?1:0);u('IsWindowUnicode',1,h=>win(h)?.wide?1:0);u('IsChild',2,(p,h)=>isChild(p,h)?1:0);
    u('GetParent',1,h=>win(h)?.parent||win(h)?.owner||0);u('GetDlgCtrlID',1,h=>win(h)?.id||0);
    u('GetAncestor',2,(h,flags)=>{if(!win(h))return 0;if(flags===1)return win(h).parent;let at=h,seen=new Set();while(win(at)){if(seen.has(at))return 0;seen.add(at);const next=win(at).parent||(flags===3?win(at).owner:0);if(!next)return at;at=next;}return 0;});
    pair(u,'GetClassName',3,(wide,h,p,n)=>win(h)?m.putString(p,win(h).className,wide,n):fail(1400));
    u('GetWindow',2,(h,cmd)=>{const w=win(h);if(!w)return 0;if(cmd===4)return w.owner||0;if(cmd===5)return children(h)[0]?.[0]||0;const siblings=windows().filter(([,x])=>x.parent===w.parent),at=siblings.findIndex(([id])=>id===h);return (cmd===0?siblings[0]:cmd===1?siblings.at(-1):cmd===2?siblings[at+1]:cmd===3?siblings[at-1]:null)?.[0]||0;});
    for(const prefix of ['GetWindowLong','GetWindowLongPtr'])pair(u,prefix,2,(wide,h,index)=>{
        const w=win(h);if(!w)return fail(1400);index|=0;
        const fields={'-4':'proc','-6':'instance','-8':w.parent?'parent':'owner','-12':'id','-16':'style','-20':'ex','-21':'userData'};
        if(fields[index])return w[fields[index]]||0;if(index<0||index+4>w.extra.length)return fail(1413);return new DataView(w.extra.buffer).getUint32(index,true);
    });
    for(const prefix of ['SetWindowLong','SetWindowLongPtr'])pair(u,prefix,3,(wide,h,index,value)=>{
        const w=win(h);if(!w)return fail(1400);index|=0;const old=call('user32.dll','GetWindowLongW',h,index);
        const fields={'-4':'proc','-6':'instance','-8':w.parent?'parent':'owner','-12':'id','-16':'style','-20':'ex','-21':'userData'};
        if(index===-8){if(value&&!win(value)||value===h||isChild(h,value))return fail(87);if(w.parent&&value!==w.parent)throw Error('Reparenting child HWNDs is not implemented');const seen=new Set([h]);for(let at=value;at;at=win(at)?.owner||0){if(seen.has(at))return fail(87);seen.add(at);}}
        if(fields[index])w[fields[index]]=value;else{if(index<0||index+4>w.extra.length)return fail(1413);new DataView(w.extra.buffer).setUint32(index,value,true);}
        if(index===-16){w.visible=!!(value&VISIBLE);rt.emit('show',{hwnd:h,visible:w.visible});sendState(h);}return old;
    });
    pair(u,'CallWindowProc',5,(wide,proc,h,msg,wp,lp)=>rt.invoke(proc,[h,msg,wp,lp]));
    pair(u,'SendMessage',4,(wide,h,msg,wp,lp)=>win(h)?rt.windowProc(h,msg,wp,lp):fail(1400));
    pair(u,'SendDlgItemMessage',5,(wide,h,id,msg,wp,lp)=>{const child=children(h).find(([,w])=>w.id===id)?.[0];return child?rt.windowProc(child,msg,wp,lp):0;});
    u('GetDlgItem',2,(h,id)=>children(h).find(([,w])=>w.id===(id>>>0))?.[0]||0);
    pair(u,'SetDlgItemText',3,(wide,h,id,p)=>{const child=call('user32.dll','GetDlgItem',h,id);return child?call('user32.dll','SetWindowText'+(wide?'W':'A'),child,p):0;});
    pair(u,'GetDlgItemText',4,(wide,h,id,p,n)=>{const child=call('user32.dll','GetDlgItem',h,id);if(!child){if(n)m.putString(p,'',wide,n);return 0;}return call('user32.dll','GetWindowText'+(wide?'W':'A'),child,p,n);});
    u('SetDlgItemInt',4,(h,id,value,signed)=>{const child=call('user32.dll','GetDlgItem',h,id);if(!child)return 0;const w=win(child);w.text=String(signed?value|0:value>>>0);rt.emit('text',{hwnd:child,text:w.text});return 1;});
    u('GetDlgItemInt',4,(h,id,out,signed)=>{if(out)m.w32(out,0);const child=call('user32.dll','GetDlgItem',h,id);if(!child)return 0;const match=win(child).text.match(signed?/^\s*([+-]?\d+)/:/^\s*(\+?\d+)/);if(!match)return 0;const n=Number(match[1]);if(!Number.isSafeInteger(n)||n<(signed?-2147483648:0)||n>(signed?2147483647:0xffffffff))return 0;if(out)m.w32(out,1);return n>>>0;});
    pair(u,'SetWindowText',2,(wide,h,p)=>{const w=win(h);if(!w)return fail(1400);w.text=text(p,wide).slice(0,w.limit||32767);rt.emit('text',{hwnd:h,text:w.text});return 1;});
    pair(u,'GetWindowText',3,(wide,h,p,n)=>win(h)?m.putString(p,win(h).text,wide,n):fail(1400));
    pair(u,'GetWindowTextLength',1,(wide,h)=>win(h)?.text.length||0);
    u('EnableWindow',2,(h,value)=>{const w=win(h);if(!w)return fail(1400);const old=!!(w.style&DISABLED);w.style=value?w.style&~DISABLED:w.style|DISABLED;sendState(h);return old?1:0;});
    u('IsWindowEnabled',1,h=>enabled(h)?1:0);u('IsWindowVisible',1,h=>{for(let w=win(h);w;w=win(w.parent))if(!w.visible)return 0;return win(h)?1:0;});
    u('SetFocus',1,h=>{if(h&&!enabled(h))return 0;const old=gui.focus;gui.focus=h;if(old&&win(old))rt.post(old,8,h,0);if(h){rt.post(h,7,old,0);rt.emit('focus',{hwnd:h});}return old;});u('GetFocus',0,()=>gui.focus);
    u('SetActiveWindow',1,h=>{if(h&&!win(h))return 0;const old=gui.active;gui.active=h;return old;});u('GetActiveWindow',0,()=>gui.active||rt.mainWindow);
    u('SetForegroundWindow',1,h=>{if(!win(h))return 0;gui.active=h;rt.emit('focus',{hwnd:h});return 1;});u('GetForegroundWindow',0,()=>gui.active||rt.mainWindow);
    u('SetCapture',1,h=>{if(!win(h))return 0;const old=gui.capture;gui.capture=h;return old;});u('GetCapture',0,()=>gui.capture);u('ReleaseCapture',0,()=>{gui.capture=0;return 1;});
    u('GetKeyState',1,key=>gui.keys.has(key)?0x8000:0);u('GetAsyncKeyState',1,key=>gui.keys.has(key)?0x8000:0);
    u('GetKeyboardState',1,p=>{m.zero(p,256);for(const key of gui.keys)if(key<256)m.w8(p+key,128);return 1;});
    u('GetClientRect',2,(h,p)=>win(h)?(putRect(p,[0,0,win(h).width,win(h).height]),1):fail(1400));
    u('GetWindowRect',2,(h,p)=>{const w=win(h);if(!w)return fail(1400);const e=extents(w.style,w.ex,w.menu),o=origin(h);putRect(p,[o[0]-e.left,o[1]-e.top,o[0]+w.width+e.right,o[1]+w.height+e.bottom]);return 1;});
    const adjust=(p,style,menu,ex)=>{const r=rect(p),e=extents(style,ex,menu);putRect(p,[r[0]-e.left,r[1]-e.top,r[2]+e.right,r[3]+e.bottom]);return 1;};
    u('AdjustWindowRect',3,(p,style,menu)=>adjust(p,style,menu,0));u('AdjustWindowRectEx',4,adjust);
    u('ClientToScreen',2,(h,p)=>{if(!win(h))return fail(1400);const o=origin(h);m.w32(p,m.i32(p)+o[0]);m.w32(p+4,m.i32(p+4)+o[1]);return 1;});
    u('ScreenToClient',2,(h,p)=>{if(!win(h))return fail(1400);const o=origin(h);m.w32(p,m.i32(p)-o[0]);m.w32(p+4,m.i32(p+4)-o[1]);return 1;});
    u('MapWindowPoints',4,(from,to,p,n)=>{if(n>128||from&&!win(from)||to&&!win(to))return fail(87);const a=origin(from),b=origin(to),dx=a[0]-b[0],dy=a[1]-b[1];m.check(p,n*8);for(let i=0;i<n;i++){m.w32(p+i*8,m.i32(p+i*8)+dx);m.w32(p+i*8+4,m.i32(p+i*8+4)+dy);}return makeLong(dx,dy);});
    async function position(h,after,x,y,width,height,flags){
        const w=win(h);if(!w)return fail(1400);const oldW=w.width,oldH=w.height,e=extents(w.style,w.ex,w.menu);
        if(!(flags&1)){width=(width|0)-e.left-e.right;height=(height|0)-e.top-e.bottom;if(width<1||height<1||width>2048||height>2048)return fail(87);w.width=width;w.height=height;}
        if(!(flags&2)){w.x=x|0;w.y=y|0;}
        if(flags&64){w.visible=true;w.style|=VISIBLE;}if(flags&128){w.visible=false;w.style&=~VISIBLE;}
        await rt.flush();await rt.emit('geometry',{hwnd:h,x:w.x,y:w.y,width:w.width,height:w.height,visible:w.visible});
        if(!(flags&2))rt.post(h,3,0,makeLong(w.x,w.y));if(w.width!==oldW||w.height!==oldH){rt.post(h,5,0,makeLong(w.width,w.height));invalidate(h,0,true);}
        return 1;
    }
    u('SetWindowPos',7,position);u('MoveWindow',6,async(h,x,y,width,height,repaint)=>{const ok=await position(h,0,x,y,width,height,4|16);if(ok&&repaint)invalidate(h,0,true);return ok;});
    u('ShowWindow',2,(h,cmd)=>{const w=win(h);if(!w)return fail(1400);const old=w.visible;w.visible=cmd!==0;w.style=w.visible?w.style|VISIBLE:w.style&~VISIBLE;rt.emit('show',{hwnd:h,visible:w.visible});if(w.visible)invalidate(h,0,true);return old?1:0;});
    u('IsIconic',1,h=>win(h)?.minimized?1:0);u('IsZoomed',1,h=>win(h)?.maximized?1:0);
    function invalidate(h,p,erase){const w=win(h);if(!w)return fail(1400);const r=p?intersect(rect(p),[0,0,w.width,w.height]):[0,0,w.width,w.height];if(r[0]===r[2]||r[1]===r[3])return 1;const old=w.paintRect;w.paintRect=old?[Math.min(old[0],r[0]),Math.min(old[1],r[1]),Math.max(old[2],r[2]),Math.max(old[3],r[3])]:r;w.erase=!!erase||w.erase;return rt.post(h,15);}
    u('InvalidateRect',3,invalidate);u('ValidateRect',2,(h,p)=>{const w=win(h);if(!w)return fail(1400);if(p)throw Error('Partial ValidateRect regions not implemented');w.paintRect=null;w.erase=false;rt.messages=rt.messages.filter(x=>x.hwnd!==h||x.message!==15);return 1;});
    u('RedrawWindow',4,async(h,p,region,flags)=>{if(region)throw Error('RedrawWindow HRGN is not implemented');if(flags&1)invalidate(h,p,!!(flags&4));if(flags&8)call('user32.dll','ValidateRect',h,p);if(flags&0x100)return call('user32.dll','UpdateWindow',h);return win(h)?1:0;});
    u('UpdateWindow',1,async h=>{const w=win(h);if(!w)return fail(1400);if(w.painting)return 1;if(!w.paintRect&&!rt.messages.some(x=>x.hwnd===h&&x.message===15))return 1;w.painting=true;rt.messages=rt.messages.filter(x=>x.hwnd!==h||x.message!==15);try{await rt.windowProc(h,15);return 1;}finally{w.painting=false;}});
    u('BeginPaint',2,(h,p)=>{const w=rt.get(h,'window'),dc=rt.dc(h),r=w.paintRect||[0,0,w.width,w.height];m.zero(p,64);m.w32(p,dc);m.w32(p+4,w.erase?1:0);putRect(p+8,r);if(w.erase&&w.background){let brush=w.background<=31?{color:W.color(colors[w.background-1]||0)}:rt.handles.get(w.background);if(brush?.color)rt.draw(h,{op:'rect',x:r[0],y:r[1],w:r[2]-r[0],h:r[3]-r[1],color:brush.color});}w.paintRect=null;w.erase=false;rt.messages=rt.messages.filter(x=>x.hwnd!==h||x.message!==15);return dc;});
    u('GetUpdateRect',3,(h,p,erase)=>{const w=win(h);if(!w)return 0;if(p)putRect(p,w.paintRect||[0,0,0,0]);return w.paintRect?1:0;});
    // Bounded, handle-backed menus. Non-string owner-drawn entries are rejected.
    u('CreateMenu',0,()=>createMenu());u('CreatePopupMenu',0,()=>createMenu([],true));u('DestroyMenu',1,h=>{const ok=destroyMenu(h);changedMenu();return ok;});
    pair(u,'LoadMenu',2,(wide,h,p)=>loadMenu(h,rt.resourceName(p,wide)));pair(u,'LoadMenuIndirect',1,(wide,p)=>createMenu(W.parseMenu(m,p)));
    u('GetMenu',1,h=>win(h)?.menu||0);u('GetSubMenu',2,(h,index)=>menuObject(h)?.items[index]?.submenu||0);
    u('SetMenu',2,(h,menu)=>{const w=win(h);if(!w||menu&&!menuObject(menu))return fail(1401);w.menu=menu;changedMenu();return 1;});u('DrawMenuBar',1,h=>{if(!win(h))return 0;changedMenu();return 1;});
    u('GetMenuItemCount',1,h=>menuObject(h)?.items.length??-1);u('GetMenuItemID',2,(h,index)=>{const item=menuObject(h)?.items[index];return item&&!item.submenu?item.id:-1;});u('IsMenu',1,h=>menuObject(h)?1:0);
    const insert=(wide,h,at,flags,id,p,replace=false)=>{let menu=menuObject(h);if(!menu)return fail(1401);if(flags&0x104)throw Error('Owner-drawn/bitmap menu items are not implemented');if(menu.items.length>=512)return fail(8);
        const found=at===0xffffffff?null:findItem(h,at,flags);if(at!==0xffffffff&&!found)return fail(1456);if(found)menu=found.menu;
        const item={id:flags&0x10?0:id,text:flags&0x800?'':text(p,wide),flags:flags&0x900,state:flags&0xb,submenu:flags&0x10?id:0};
        if(item.submenu){if(!menuObject(item.submenu))return fail(1401);const contains=(sub,target,seen=new Set())=>{if(sub===target)return true;if(seen.has(sub))return false;seen.add(sub);return menuObject(sub)?.items.some(i=>i.submenu&&contains(i.submenu,target,seen));};if(contains(item.submenu,h))return fail(87);}
        menu.items.splice(found?found.index:menu.items.length,replace?1:0,item);changedMenu();return 1;};
    pair(u,'AppendMenu',4,(wide,h,flags,id,p)=>insert(wide,h,0xffffffff,flags,id,p));pair(u,'InsertMenu',5,(wide,...args)=>insert(wide,...args));pair(u,'ModifyMenu',5,(wide,...args)=>insert(wide,...args,true));
    u('RemoveMenu',3,(h,id,flags)=>{const found=findItem(h,id,flags);if(!found)return fail(1456);found.menu.items.splice(found.index,1);changedMenu();return 1;});
    u('DeleteMenu',3,(h,id,flags)=>{const found=findItem(h,id,flags);if(!found)return fail(1456);found.menu.items.splice(found.index,1);if(found.item.submenu)destroyMenu(found.item.submenu);changedMenu();return 1;});
    u('CheckMenuItem',3,(h,id,flags)=>{const found=findItem(h,id,flags);if(!found)return -1;const old=found.item.state&8;found.item.state=(found.item.state&~8)|(flags&8);changedMenu();return old;});
    u('EnableMenuItem',3,(h,id,flags)=>{const found=findItem(h,id,flags);if(!found)return -1;const old=found.item.state&3;found.item.state=(found.item.state&~3)|(flags&3);changedMenu();return old;});
    u('CheckMenuRadioItem',5,(h,first,last,checked,flags)=>{if(last-first>512)return fail(87);for(let id=first;id<=last;id++){const f=findItem(h,id,flags);if(f){f.item.state=id===checked?f.item.state|8:f.item.state&~8;f.item.flags|=0x200;}}changedMenu();return 1;});
    u('GetMenuState',3,(h,id,flags)=>{const found=findItem(h,id,flags);return found?found.item.state|found.item.flags|(found.item.submenu?0x10:0):-1;});
    pair(u,'GetMenuString',5,(wide,h,id,p,n,flags)=>{const item=findItem(h,id,flags)?.item;if(!item)return 0;return p&&n?m.putString(p,item.text,wide,n):item.text.length;});
    // Dialog templates are materialized as actual guest HWNDs. A modal call pumps
    // this process's queue reentrantly on the single guest execution stack.
    async function createDialog(instance,template,owner,proc,param,modal,size=65536){
        if(gui.modal.length>=8)return fail(8,-1);const spec=W.parseDialog(m,template,size),scaleX=1.75,scaleY=1.75;
        const h=await createWindow(true,spec.ex,'#32770',spec.title,(spec.style|0x80000000)&~VISIBLE,30,30,Math.ceil(spec.width*scaleX),Math.ceil(spec.height*scaleY),owner,0,instance,0,{dialog:true,client:true,proc,template:spec,modal,dialogResult:null});
        if(!h)return modal?-1:0;const w=win(h);w.baseUnits=[scaleX*4,scaleY*8];
        if(spec.menu)w.menu=loadMenu(instance,spec.menu);
        try{
            for(const ctl of spec.controls){const cls=typeof ctl.className==='number'?BUILTIN.get(ctl.className):ctl.className;if(!cls)throw Error('Unknown dialog control class');
                const title=typeof ctl.title==='string'?ctl.title:'';
                const child=await createWindow(true,ctl.ex,cls,title,ctl.style|CHILD,Math.round(ctl.x*scaleX),Math.round(ctl.y*scaleY),Math.ceil(ctl.width*scaleX),Math.ceil(ctl.height*scaleY),h,ctl.id,instance,ctl.creationData,{client:true});if(!child)throw Error('Dialog control creation failed');
            }
            const wasEnabled=owner?enabled(owner):false;if(modal){gui.modal.push(h);if(owner)call('user32.dll','EnableWindow',owner,0);}
            try{
                const first=children(h).find(([,ctl])=>(ctl.style&0x10000)&&enabled(ctl.parent))?.[0]||children(h).find(([,ctl])=>ctl.className==='EDIT')?.[0]||0;
                const focus=proc?await rt.invoke(proc,[h,0x110,first,param]):1;
                if(w.dialogResult===null){call('user32.dll','ShowWindow',h,5);if(focus&&first)call('user32.dll','SetFocus',first);}
                if(!modal)return h;
                const msg=m.alloc(28);try{while(!rt.stopped&&w.dialogResult===null&&win(h)){const ok=await rt.getMessage(msg,0,0,0,true,true);if(!ok){if(!rt.stopped)rt.post(0,18,m.u32(msg+8));break;}const target=m.u32(msg),message=m.u32(msg+4);if(win(target))await rt.windowProc(target,message,m.u32(msg+8),m.u32(msg+12));}}finally{m.free(msg);}
                const result=w.dialogResult??0;if(win(h))await rt.destroyWindow(h);return result;
            }finally{if(modal){gui.modal=gui.modal.filter(id=>id!==h);if(owner&&win(owner)&&wasEnabled)call('user32.dll','EnableWindow',owner,1);if(owner&&win(owner))rt.emit('focus',{hwnd:owner});}}
        }catch(error){if(win(h))await rt.destroyWindow(h);throw error;}
    }
    for(const [name,modal,indirect]of[['DialogBoxParam',true,false],['DialogBoxIndirectParam',true,true],['CreateDialogParam',false,false],['CreateDialogIndirectParam',false,true]])pair(u,name,5,(wide,instance,p,owner,proc,param)=>{
        if(indirect)return createDialog(instance,p,owner,proc,param,modal);const res=rt.resource(instance,5,rt.resourceName(p,wide));return res?createDialog(instance,res.address,owner,proc,param,modal,res.size):modal?-1:0;
    });
    u('EndDialog',2,(h,result)=>{const w=win(h);if(!w?.dialog||!w.modal)return fail(1400);w.dialogResult=result|0;rt.wake();return 1;});
    u('MapDialogRect',2,(h,p)=>{const w=win(h);if(!w?.dialog)return 0;const [x,y]=w.baseUnits;const r=rect(p);putRect(p,[Math.round(r[0]*x/4),Math.round(r[1]*y/8),Math.round(r[2]*x/4),Math.round(r[3]*y/8)]);return 1;});
    u('GetDialogBaseUnits',0,()=>makeLong(7,14));
    pair(u,'IsDialogMessage',2,async(wide,h,p)=>{if(!win(h)?.dialog)return 0;const target=m.u32(p),msg=m.u32(p+4),key=m.u32(p+8);if(msg!==0x100||target!==h&&!isChild(h,target))return 0;if(key===13||key===27){await rt.windowProc(h,273,key===27?2:1,0);return 1;}return 0;});
    pair(u,'DefDlgProc',4,(wide,h,msg,wp,lp)=>dialogDefault(h,msg,wp,lp));
    const oldDefault=rt.defaultProc.bind(rt);
    const dialogDefault=(h,msg,wp,lp)=>{const w=win(h);if(!w)return 0;if(msg===0x10){if(w.modal){w.dialogResult=2;rt.wake();return 0;}return rt.destroyWindow(h);}return defaultControl(h,msg,wp,lp);};
    async function defaultControl(h,msg,wp,lp){
        const w=win(h);if(!w)return 0;const cls=w.className.toUpperCase();
        if(msg===0xc){w.text=text(lp,w.wide).slice(0,w.limit||32767);rt.emit('text',{hwnd:h,text:w.text});return 1;}
        if(msg===0xd)return m.putString(lp,w.text,w.wide,wp);if(msg===0xe)return w.text.length;
        if(msg===0x30){if(wp&&rt.handles.get(wp)?.type!=='font')return 0;w.font=wp;sendState(h);return 0;}if(msg===0x31)return w.font||0;
        if(cls==='BUTTON'){
            if(msg===0xf0)return w.check||0;if(msg===0xf1){w.check=wp&3;sendState(h);return 0;}if(msg===0xf2)return (w.check||0)|(gui.focus===h?8:0);if(msg===0xf5){button(h);return 0;}
        }
        if(cls==='EDIT'){
            if(msg===0xb0){if(wp)m.w32(wp,w.selection[0]);if(lp)m.w32(lp,w.selection[1]);return makeLong(...w.selection);}
            if(msg===0xb1){const a=wp|0,b=lp|0;w.selection=[a<0?w.text.length:Math.min(a,w.text.length),b<0?w.text.length:Math.min(b,w.text.length)];sendState(h);return 0;}
            if(msg===0xc5){w.limit=wp?Math.min(wp,32767):32767;sendState(h);return 0;}if(msg===0xd5)return w.limit;
            if(msg===0xc2){const a=Math.min(...w.selection),b=Math.max(...w.selection),s=text(lp,w.wide);w.text=(w.text.slice(0,a)+s+w.text.slice(b)).slice(0,w.limit);w.selection=[Math.min(a+s.length,w.text.length),Math.min(a+s.length,w.text.length)];rt.emit('text',{hwnd:h,text:w.text});sendState(h);rt.post(w.parent,273,makeLong(w.id,0x300),h);return 1;}
            if(msg===0xcf){w.style=wp?w.style|0x800:w.style&~0x800;sendState(h);return 1;}
        }
        if(msg===0x81)return 1;if(msg===15){if(w.dialog){rt.draw(h,{op:'rect',x:0,y:0,w:w.width,h:w.height,color:W.color(COLORS[15])});rt.flush();}w.paintRect=null;rt.messages=rt.messages.filter(x=>x.hwnd!==h||x.message!==15);return 0;}return oldDefault(h,msg,wp,lp);
    }
    rt.defaultProc=defaultControl;
    rt.windowProc=async(h,msg,wp=0,lp=0)=>{
        const w=win(h);if(!w)return 0;
        if(w.dialog){if(w.proc){const result=await rt.invoke(w.proc,[h,msg,wp,lp]);if(result)return result;}return dialogDefault(h,msg,wp,lp);}
        return w.proc?rt.invoke(w.proc,[h,msg,wp,lp]):defaultControl(h,msg,wp,lp);
    };
    // Keep HWND data alive through WM_NCDESTROY, and finish queued bitmap work
    // before removing its host surface. WM_DESTROY sees living child windows;
    // WM_NCDESTROY sees them already gone, matching the Win32 lifetime contract.
    rt.destroyWindow=async h=>{
        const w=win(h);if(!w||w.destroying)return 0;w.destroying=true;w.visible=false;rt.emit('show',{hwnd:h,visible:false});
        if(!w.ncCreateFailed&&!rt.stopped)await rt.windowProc(h,2,0,0);
        for(const [id,owned]of windows())if(owned.parent===h||owned.owner===h)await rt.destroyWindow(id);
        if(!rt.stopped)await rt.windowProc(h,0x82,0,0);
        await rt.flush();rt.emit('destroy',{hwnd:h});rt.messages=rt.messages.filter(x=>x.hwnd!==h);
        for(const [id,t]of rt.timers)if(t.hwnd===h){clearInterval(t.timer);rt.timers.delete(id);}
        if(w.dc)rt.handles.delete(w.dc);rt.handles.delete(h);if(w.menu)destroyMenu(w.menu);
        if(rt.mainWindow===h)rt.mainWindow=windows().find(([,v])=>!v.parent&&!v.owner)?.[0]||0;
        for(const field of ['focus','active','capture'])if(gui[field]===h)gui[field]=0;
        if(w.parent&&win(w.parent)&&!win(w.parent).destroying&&!(w.ex&4)&&!rt.stopped)await rt.windowProc(w.parent,0x210,makeLong(2,w.id),h);
        return 1;
    };
    function button(h){const w=win(h);if(!w||!enabled(h)||w.className.toUpperCase()!=='BUTTON')return;const kind=w.style&15;if([3,6].includes(kind)){w.check=((w.check||0)+1)%(kind===6?3:2);sendState(h);}else if(kind===9){const siblings=children(w.parent),at=siblings.findIndex(([id])=>id===h);let first=at,last=at+1;while(first>0&&!(siblings[first][1].style&0x20000))first--;while(last<siblings.length&&!(siblings[last][1].style&0x20000))last++;for(const [id,child]of siblings.slice(first,last))if(child.className.toUpperCase()==='BUTTON'&&[4,9].includes(child.style&15)){child.check=id===h?1:0;sendState(id);}}if(kind===7)return;rt.post(w.parent,273,w.id,h);}
    u('CheckDlgButton',3,(h,id,value)=>{const child=call('user32.dll','GetDlgItem',h,id);if(!child)return 0;win(child).check=value&3;sendState(child);return 1;});u('IsDlgButtonChecked',2,(h,id)=>win(call('user32.dll','GetDlgItem',h,id))?.check||0);
    u('CheckRadioButton',4,(h,first,last,selected)=>{for(const [id,w]of children(h))if(w.id>=first&&w.id<=last){w.check=w.id===selected?1:0;sendState(id);}return 1;});
    // Events only mutate control state or enqueue; no reentrant CPU invocation here.
    const oldEvent=rt.event.bind(rt);
    rt.event=event=>{
        if(event.type==='theme')return rt.setSystemColors(event.colors);
        if(event.type==='response')return oldEvent(event);
        const h=event.hwnd>>>0,w=win(h);if(!w)return;
        if(!enabled(h)&&event.type!=='message')return;
        if(event.type==='text'){if(w.className.toUpperCase()!=='EDIT'||w.style&0x800)return;w.text=String(event.text).slice(0,w.limit||32767);w.selection=[w.text.length,w.text.length];rt.post(w.parent,273,makeLong(w.id,0x300),h);return;}
        if(event.type==='selection'){if(w.className.toUpperCase()!=='EDIT')return;w.selection=[Math.max(0,Math.min(Number(event.start)||0,w.text.length)),Math.max(0,Math.min(Number(event.end)||0,w.text.length))];return;}
        if(event.type==='button'){button(h);return;}
        if(event.type==='menu'){const menu=w.menu,found=findItem(menu,event.id>>>0);if(!found||found.item.state&3||found.item.flags&0x800||!enabled(h))return;rt.post(h,273,found.item.id,0);return;}
        if(event.type==='focus'){gui.focus=h;return;}
        if(event.type==='message'){
            const msg=event.message>>>0;if(![0x10,0xf,0x100,0x101,0x102,0x104,0x105,0x200,0x201,0x202,0x204,0x205,0x207,0x208,0x20a].includes(msg))throw Error('Unsupported browser input message');
            if(!enabled(h)&&msg!==15)return;
            if(msg===0x100||msg===0x104)gui.keys.add(event.wParam>>>0);if(msg===0x101||msg===0x105)gui.keys.delete(event.wParam>>>0);
            const modal=gui.modal.at(-1);if(modal&&(h===modal||isChild(modal,h))&&msg===0x100&&[13,27].includes(event.wParam)){rt.post(modal,273,event.wParam===27?2:1,0);return;}
            rt.post(h,msg,event.wParam>>>0,event.lParam>>>0);return;
        }
    };
    // Standard accelerator tables. Modifiers come from actual browser key events.
    pair(u,'LoadAccelerators',2,(wide,instance,p)=>{const res=rt.resource(instance,9,rt.resourceName(p,wide));if(!res)return 0;if(res.size%8||res.size>2048)throw Error('Invalid accelerator resource');const items=[];for(let at=res.address;at<res.address+res.size;at+=8){const flags=m.u16(at);items.push({flags:flags&0x7f,key:m.u16(at+2),id:m.u16(at+4)});if(flags&0x80)break;}return rt.handle({type:'accelerators',items});});
    pair(u,'CreateAcceleratorTable',2,(wide,p,n)=>{if(!n||n>256)return fail(87);m.check(p,n*6);const items=[];for(let i=0;i<n;i++)items.push({flags:m.u8(p+i*6),key:m.u16(p+i*6+2),id:m.u16(p+i*6+4)});return rt.handle({type:'accelerators',items});});
    pair(u,'TranslateAccelerator',3,async(wide,h,table,p)=>{const a=rt.handles.get(table);if(a?.type!=='accelerators'||!enabled(h))return 0;const msg=m.u32(p+4),key=m.u32(p+8);if(![0x100,0x104,0x102].includes(msg))return 0;const item=a.items.find(i=>i.key===key&&(!!(i.flags&1)?msg!==0x102:msg===0x102)&&!!(i.flags&4)===gui.keys.has(16)&&!!(i.flags&8)===gui.keys.has(17)&&!!(i.flags&16)===gui.keys.has(18));if(!item)return 0;await rt.windowProc(h,273,makeLong(item.id,1),0);return 1;});
    u('DestroyAcceleratorTable',1,h=>{if(rt.handles.get(h)?.type!=='accelerators')return 0;rt.handles.delete(h);return 1;});
    u('SetRect',5,(p,l,t,r,b)=>(putRect(p,[l,t,r,b]),1));u('SetRectEmpty',1,p=>(putRect(p,[0,0,0,0]),1));u('CopyRect',2,(to,from)=>(putRect(to,rect(from)),1));
    u('IsRectEmpty',1,p=>{const r=rect(p);return r[2]<=r[0]||r[3]<=r[1]?1:0;});u('EqualRect',2,(a,b)=>rect(a).every((v,i)=>v===rect(b)[i])?1:0);
    u('PtInRect',3,(p,x,y)=>{const r=rect(p);return (x|0)>=r[0]&&(y|0)>=r[1]&&(x|0)<r[2]&&(y|0)<r[3]?1:0;});
    u('OffsetRect',3,(p,x,y)=>{const r=rect(p);putRect(p,[r[0]+(x|0),r[1]+(y|0),r[2]+(x|0),r[3]+(y|0)]);return 1;});u('InflateRect',3,(p,x,y)=>{const r=rect(p);putRect(p,[r[0]-(x|0),r[1]-(y|0),r[2]+(x|0),r[3]+(y|0)]);return 1;});
    u('IntersectRect',3,(out,a,b)=>putRect(out,intersect(rect(a),rect(b))));u('UnionRect',3,(out,a,b)=>{a=rect(a);b=rect(b);if(a[2]<=a[0]||a[3]<=a[1])return putRect(out,b);if(b[2]<=b[0]||b[3]<=b[1])return putRect(out,a);return putRect(out,[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]);});
    u('GetSystemMetrics',1,id=>({0:1280,1:720,2:17,3:17,4:24,5:1,6:1,7:4,8:4,11:32,12:32,13:32,14:32,15:22,16:1280,17:672,19:3,20:17,21:17,28:112,29:27,30:4,31:4,32:4,33:4,49:16,50:16,76:0,77:0,78:1280,79:720,80:1})[id]||0);
    u('GetSysColor',1,id=>colors[id]??0);
    const systemBrushes=new Map();
    u('GetSysColorBrush',1,id=>{
        if(!Number.isInteger(id)||id<0||id>=colors.length)return 0;
        if(!systemBrushes.has(id))systemBrushes.set(id,rt.handle({type:'brush',stock:true,color:W.color(colors[id])}));
        return systemBrushes.get(id);
    });
    // Validate and preflight the entire update. No guest callback is invoked from
    // the browser transport; ordinary guest DispatchMessage runs the notifications.
    rt.setSystemColors=(snapshot,notify=true)=>{
        if(!Array.isArray(snapshot)||snapshot.length!==31||snapshot.some(n=>!Number.isInteger(n)||n<0||n>0xffffff))throw Error('Invalid system-color snapshot');
        if(rt.stopped)return false;
        const changed=snapshot.some((n,i)=>n!==colors[i]);
        const targets=notify&&changed?windows().filter(([,w])=>!w.parent&&!w.destroying):[];
        const pending=rt.messages.filter(m=>!m.themeNotification),time=(performance.now()-rt.started)>>>0;
        for(const [hwnd] of targets){
            for(const message of [0x15,0x31a])pending.push({hwnd,message,wParam:0,lParam:0,time,themeNotification:true});
            if(!pending.some(m=>m.hwnd===hwnd&&m.message===15))pending.push({hwnd,message:15,wParam:0,lParam:0,time,themeNotification:true});
        }
        if(pending.length>1024)return false;
        if(changed){
            snapshot.forEach((n,i)=>colors[i]=n);
            for(const [i,h] of systemBrushes){const brush=rt.handles.get(h);if(brush)brush.color=W.color(colors[i]);}
            if(notify){rt.messages=pending;for(const [,w] of targets){w.paintRect=[0,0,w.width,w.height];w.erase=true;}}
            rt.themeRevision++;
        }
        rt.emit('system-colors',{revision:rt.themeRevision,colors:colors.slice()});
        rt.wake();return true;
    };
    u('MonitorFromRect',2,(p,flags)=>{rect(p);return 0x70000001;});u('MonitorFromWindow',2,(h,flags)=>win(h)?0x70000001:0);u('MonitorFromPoint',3,(x,y,flags)=>0x70000001);
    pair(u,'GetMonitorInfo',2,(wide,h,p)=>{const n=m.u32(p);if(h!==0x70000001||n<(wide?40:40))return fail(87);m.check(p,n);putRect(p+4,[0,0,1280,720]);putRect(p+20,[0,0,1280,672]);m.w32(p+36,1);if(n>40)m.putString(p+40,'\\\\.\\DISPLAY1',wide,Math.min(32,(n-40)/(wide?2:1)));return 1;});
    // Icons/cursors are metadata handles; application drawing still uses bitmaps.
    const images=new Map();const imageHandle=(wide,h,p,type)=>{const name=rt.resourceName(p,wide),key=[h,name,type].join(':');if(h&&!rt.resource(h,type==='icon'?14:12,name))return 0;if(!images.has(key))images.set(key,rt.handle({type,name,stock:true}));return images.get(key);};
    pair(u,'LoadCursor',2,(wide,h,p)=>imageHandle(wide,h,p,'cursor'));pair(u,'LoadIcon',2,(wide,h,p)=>imageHandle(wide,h,p,'icon'));
    pair(u,'LoadImage',6,(wide,h,p,type,cx,cy,flags)=>{if(flags&0x10)throw Error('LoadImage from file not implemented');if(type===0)return call('user32.dll','LoadBitmap'+(wide?'W':'A'),h,p);if(type===1||type===2)return imageHandle(wide,h,p,type===1?'icon':'cursor');return fail(87);});
    u('SetCursor',1,h=>{const old=gui.cursor;if(h&&rt.handles.get(h)?.type!=='cursor')return 0;gui.cursor=h;return old;});u('GetCursor',0,()=>gui.cursor);
    rt.register('comctl32.dll','InitCommonControls',0,()=>0);rt.register('comctl32.dll','InitCommonControlsEx',1,p=>m.u32(p)===8&&!(m.u32(p+4)&~0x4000)?1:0);
    pair(u,'MessageBox',4,async(wide,h,pTitle,pCaption,flags)=>{const buttons=({0:[[1,'OK']],1:[[1,'OK'],[2,'Cancel']],2:[[3,'Abort'],[4,'Retry'],[5,'Ignore']],3:[[6,'Yes'],[7,'No'],[2,'Cancel']],4:[[6,'Yes'],[7,'No']],5:[[4,'Retry'],[2,'Cancel']],6:[[2,'Cancel'],[10,'Try again'],[11,'Continue']]})[flags&15];if(!buttons)return fail(87);if(h&&!win(h))return fail(1400);const wasEnabled=h&&enabled(h);if(wasEnabled)call('user32.dll','EnableWindow',h,0);try{return await rt.request('messagebox',{hwnd:h,title:text(pCaption,wide),text:text(pTitle,wide),buttons,defaultButton:Math.min((flags>>>8)&3,buttons.length-1),cancel:buttons.some(([id])=>id===2)});}finally{if(wasEnabled&&win(h))call('user32.dll','EnableWindow',h,1);}});
    for(const wide of [false,true])rt.register('shell32.dll','ShellAbout'+(wide?'W':'A'),4,(h,app,other,icon)=>rt.request('messagebox',{hwnd:h,title:'About '+text(app,wide),text:text(other,wide),buttons:[[1,'OK']]}));
    // Win32 wsprintf is cdecl, integer-only, with its documented 1024-character
    // ceiling. This facade never delegates formatting to a host executable.
    function wsformat(wide,out,pattern,ap){let at=ap,result='',format=text(pattern,wide),last=0;const re=/%([-+ #0]*)(\d*)(?:\.(\d+))?([hlw]?)([diuxXoscCsS%])/g;let match;
        while((match=re.exec(format))){result+=format.slice(last,match.index);last=re.lastIndex;const [,flags,widths,precision,length,kind]=match;if(kind==='%'){result+='%';continue;}const value=m.u32(at);at+=4;let word='',width=Math.min(Number(widths)||0,1024);
            if('sS'.includes(kind)){const isWide=length==='h'?false:length==='l'||length==='w'?true:kind==='s'?wide:!wide;word=value?m.string(value,isWide):'(null)';if(precision!==undefined)word=word.slice(0,Number(precision));}
            else if('cC'.includes(kind))word=String.fromCharCode(value&((length==='h'||!wide&&kind==='c')?255:65535));
            else{const signed='di'.includes(kind),base=kind==='o'?8:'xX'.includes(kind)?16:10,n=signed?value|0:value;word=n.toString(base);if(kind==='X')word=word.toUpperCase();if(precision!==undefined)word=word.padStart(Math.min(Number(precision),1024),'0');if(flags.includes('+')&&signed&&n>=0)word='+'+word;if(flags.includes('#')&&value&&'xX'.includes(kind))word=(kind==='X'?'0X':'0x')+word;}
            if(flags.includes('-'))word=word.padEnd(width,' ');else word=word.padStart(width,flags.includes('0')?'0':' ');result+=word;if(result.length>=1024)throw Error('wsprintf output exceeds 1023 characters');
        }result+=format.slice(last);if(result.length>=1024||/%/.test(format.replace(re,'')))throw Error('Unsupported or oversized wsprintf format');m.putString(out,result,wide,1024);return result.length;
    }
    for(const wide of [false,true]){rt.register('user32.dll','wsprintf'+(wide?'W':'A'),2,(out,p)=>wsformat(wide,out,p,(c.get_reg(4)>>>0)+12),true);u('wvsprintf'+(wide?'W':'A'),3,(out,p,ap)=>wsformat(wide,out,p,ap));}
    for(const wide of [false,true])rt.register('kernel32.dll','lstrcpyn'+(wide?'W':'A'),3,(out,source,n)=>{if((n|0)<=0)return out;m.putString(out,text(source,wide),wide,n);return out;});
    let seed=1;rt.register('msvcrt.dll','srand',1,n=>{seed=n>>>0;return 0;},true);rt.register('msvcrt.dll','rand',0,()=>{seed=(Math.imul(seed,214013)+2531011)>>>0;return(seed>>>16)&32767;},true);
    rt.register('msvcrt.dll','_time64',1,p=>{const n=Math.floor(Date.now()/1000);if(p){m.w32(p,n);m.w32(p+4,0);}c.set_reg(2,0);return n;},true);
    rt.register('msvcrt.dll','_time32',1,p=>call('msvcrt.dll','time',p),true);
    Object.assign(gui,{createWindow,createDialog,menuTree,findItem,win,children,enabled,sendState,extents,intersect,rect,putRect,origin,invalidate});
}
Object.assign(W,{installGUI,GUI_COLORS:COLORS});if(typeof module!=='undefined'&&module.exports)module.exports=W;
})();
