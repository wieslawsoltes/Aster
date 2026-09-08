/* Accessible browser host for virtual Win32 HWNDs. No per-application UI or logic.
 * Owned dialogs remain inside their Win32 Lab process, not separate host windows.
 * All labels use textContent; guest strings never become HTML. MIT. */
'use strict';
(() => {
const handled=new Set(['window','draw','text','show','destroy','menu','geometry','controlstate','focus','messagebox','measure']);
const label=s=>String(s||'').replace(/&&/g,'\u0000').replace(/&/g,'').replace(/\u0000/g,'&');
const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
class GUIHost {
    constructor(session){this.session=session;this.stage=session.nodes.stage;this.views=new Map();this.controls=new Map();this.dead=false;this.nextZ=1;this.menuOpen=[];this.observer=new ResizeObserver(()=>this.fit());this.observer.observe(this.stage);}
    handles(type){return handled.has(type);}
    send(value){if(!this.dead&&!this.session.halted)this.session.send(value);}
    ack(e){if(e.credit)this.session.send({type:'ack',credit:e.credit});}
    focus(h){const control=this.controls.get(h),view=this.views.get(h);if(control){(control.input||control.node).focus();}else if(view){view.renderer.canvas.focus();view.shell.style.zIndex=String(view.dialog?100+(++this.nextZ):++this.nextZ);}}
    fit(){const rect=this.stage.getBoundingClientRect();for(const view of this.views.values()){const height=view.height+(view.dialog?32:0)+(view.menu?.childElementCount?26:0),scale=Math.max(.2,Math.min(1,(rect.width-24)/view.width,(rect.height-24)/height));view.shell.style.width=view.width+'px';view.client.style.height=view.height+'px';view.shell.style.transform=`translate(-50%,-50%) scale(${scale})`;}}
    async window(e){
        if(!Number.isInteger(e.hwnd)||this.views.has(e.hwnd)||this.controls.has(e.hwnd)||e.width<1||e.height<0||e.width>2048||e.height>2048)throw Error('Invalid virtual window');
        if(e.parent)return this.control(e);
        if(this.views.size>=8)throw Error('Virtual top-level window quota exceeded');
        if(!this.primary||!this.views.has(this.primary.hwnd))this.stage.replaceChildren();
        const shell=element('section','win32-guest-frame'+(e.dialog?' win32-guest-dialog':'')),client=element('div','win32-guest-client');
        const view={hwnd:e.hwnd,owner:e.owner,dialog:!!e.dialog,shell,client,width:e.width,height:e.height,style:e.style,visible:!!(e.style&0x10000000)};
        shell.dataset.hwnd=e.hwnd;shell.setAttribute('aria-label',e.title||'Windows application');shell.style.zIndex=String(view.dialog?100+(++this.nextZ):++this.nextZ);shell.hidden=!view.visible;
        if(view.dialog){shell.setAttribute('role','dialog');shell.setAttribute('aria-modal',String(!!e.modal));const title=element('header','win32-guest-title');view.title=element('span','',e.title);const close=element('button','win32-guest-close','×');close.type='button';close.setAttribute('aria-label','Close '+e.title);close.onclick=()=>this.send({type:'message',hwnd:e.hwnd,message:0x10});title.append(view.title,close);shell.append(title);this.trapFocus(shell);}
        view.menu=element('nav','win32-menubar');view.menu.setAttribute('role','menubar');view.menu.setAttribute('aria-label','Windows application menu');view.menu.hidden=true;shell.append(view.menu,client);this.stage.append(shell);this.views.set(e.hwnd,view);
        client.style.width=e.width+'px';client.style.height=e.height+'px';
        view.renderer=await new AsterGDI(client,e.width,e.height,{requireGPU:!!globalThis.ASTER_WIN32_REQUIRE_GPU,onError:error=>this.session.error(error),onFrame:()=>this.session.metrics()}).init();
        if(this.dead||this.session.halted){view.renderer.destroy();this.ack(e);return;}
        if(!this.primary||!this.views.has(this.primary.hwnd)){this.primary=view;this.session.hwnd=e.hwnd;this.session.board=client;this.session.renderer=view.renderer;this.session.width=e.width;this.session.height=e.height;this.session.w.setTitle?.(e.title+' · Win32');}
        this.bindGraphics(view);this.fit();this.ack(e);
    }
    control(e){
        const parent=this.views.get(e.parent)?.client||this.controls.get(e.parent)?.node;if(!parent||['INPUT','TEXTAREA','SELECT'].includes(parent.tagName))throw Error('Unsupported parent for child window');
        if(this.controls.size>=128)throw Error('Control quota exceeded');const type=e.className.toUpperCase(),record={...e,type,node:null,input:null};let node;
        if(type==='EDIT'){
            node=element(e.style&4?'textarea':'input','win32-edit');node.value=e.title;node.maxLength=32767;node.spellcheck=false;node.setAttribute('aria-label',e.id?'Windows edit '+e.id:'Windows edit control');node.readOnly=!!(e.style&0x800);
            if(e.style&0x2000)node.inputMode='numeric';if(e.style&0x20&&node.tagName==='INPUT')node.type='password';
            node.addEventListener('input',()=>{record.title=node.value.replace(/\r?\n/g,'\r\n');this.send({type:'text',hwnd:e.hwnd,text:record.title});});
            const selection=()=>this.send({type:'selection',hwnd:e.hwnd,start:node.value.slice(0,node.selectionStart||0).replace(/\r?\n/g,'\r\n').length,end:node.value.slice(0,node.selectionEnd||0).replace(/\r?\n/g,'\r\n').length});node.addEventListener('select',selection);node.addEventListener('keyup',selection);
        }else if(type==='BUTTON'){
            const kind=e.style&15;
            if(kind===7){node=element('fieldset','win32-groupbox');node.append(element('legend','',label(e.title)));}
            else if([2,3,4,5,6,9].includes(kind)){node=element('label','win32-choice');const input=element('input');input.type=[4,9].includes(kind)?'radio':'checkbox';input.name='win32-radio-'+e.hwnd;input.addEventListener('click',event=>{event.preventDefault();this.send({type:'button',hwnd:e.hwnd});});record.input=input;node.append(input,element('span','',label(e.title)));}
            else if(kind<=1){node=element('button','win32-button',label(e.title));node.type='button';if(kind===1)node.classList.add('win32-default-button');node.onclick=()=>this.send({type:'button',hwnd:e.hwnd});}
            else throw Error('Unsupported Win32 button style '+kind);
        }else if(type==='STATIC'){if((e.style&31)>2)throw Error('Only text STATIC controls are implemented');node=element('div','win32-static',label(e.title));node.style.textAlign=['left','center','right'][e.style&3]||'left';}
        else throw Error('Unsupported browser control class '+type);
        record.node=node;node.dataset.hwnd=e.hwnd;node.dataset.controlId=e.id||0;node.style.left=e.x+'px';node.style.top=e.y+'px';node.style.width=e.width+'px';node.style.height=e.height+'px';node.hidden=!(e.style&0x10000000);node.disabled=!!(e.style&0x08000000);if(record.input)record.input.disabled=node.disabled;
        (record.input||node).addEventListener('focus',()=>this.send({type:'focus',hwnd:e.hwnd}));this.bindKeys(record.input||node,e.hwnd,true);
        this.controls.set(e.hwnd,record);this.session.controls.set(e.hwnd,node);parent.append(node);
        // Associate preceding text labels with resource-created edit controls.
        if(type==='EDIT'){const preceding=[...this.controls.values()].filter(c=>c.parent===e.parent&&c.type==='STATIC'&&c.y<=e.y&&Math.abs(c.x-e.x)<6).at(-1);if(preceding)node.setAttribute('aria-label',label(preceding.title));}
    }
    bindKeys(node,hwnd,editing=false){
        const message=(type,wp,lp)=>this.send({type:'message',hwnd,message:type,wParam:wp,lParam:lp});
        node.addEventListener('keydown',event=>{
            if(event.metaKey)return;const key=event.keyCode||event.which;
            if(editing&&!['F2','Escape'].includes(event.key)&&!(event.key==='Enter'&&node.tagName!=='TEXTAREA'))return;
            if(event.key==='Tab')return;event.stopPropagation();event.preventDefault();message(event.altKey?0x104:0x100,key,event.repeat?0x40000001:1);
            if(!editing&&event.key.length===1&&!event.ctrlKey&&!event.altKey)for(let i=0;i<event.key.length;i++)message(0x102,event.key.charCodeAt(i),1);
        });
        node.addEventListener('keyup',event=>{if(event.metaKey||editing&&!['F2','Escape','Enter'].includes(event.key))return;if(event.key==='Tab')return;event.stopPropagation();message(event.altKey?0x105:0x101,event.keyCode||event.which,0xc0000001);});
    }
    bindGraphics(view){
        const canvas=view.renderer.canvas,message=(type,wp=0,lp=0)=>this.send({type:'message',hwnd:view.hwnd,message:type,wParam:wp,lParam:lp});
        const point=event=>{const rect=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-rect.left)*view.width/rect.width),y=Math.floor((event.clientY-rect.top)*view.height/rect.height);return (x&65535)|((y&65535)<<16);};
        const flags=e=>(e.buttons&1?1:0)|(e.buttons&2?2:0)|(e.shiftKey?4:0)|(e.ctrlKey?8:0)|(e.buttons&4?16:0);
        canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);message(e.button===2?0x204:e.button===1?0x207:0x201,flags(e),point(e));});
        canvas.addEventListener('pointerup',e=>{e.preventDefault();message(e.button===2?0x205:e.button===1?0x208:0x202,flags(e),point(e));if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
        let pending=null,timer=0;canvas.addEventListener('pointermove',e=>{pending={flags:flags(e),point:point(e)};if(!timer)timer=setTimeout(()=>{timer=0;if(!this.dead)message(0x200,pending.flags,pending.point);},16);});
        canvas.addEventListener('pointercancel',()=>{message(0x202,0,0);message(0x205,0,0);});canvas.addEventListener('contextmenu',e=>e.preventDefault());this.bindKeys(canvas,view.hwnd);
    }
    closeMenus(){for(const popup of this.menuOpen)popup.remove();this.menuOpen=[];for(const view of this.views.values())for(const b of view.menu.querySelectorAll('[aria-expanded]'))b.setAttribute('aria-expanded','false');}
    menu(e){
        const view=this.views.get(e.hwnd);if(!view)return;this.closeMenus();view.menu.replaceChildren();if(!Array.isArray(e.items)||e.items.length>512)throw Error('Invalid menu tree');let count=0;const validate=(items,depth=0)=>{if(depth>8||!Array.isArray(items))throw Error('Invalid menu tree');for(const item of items){if(!item||++count>512||typeof item.text!=='string'||item.text.length>32767)throw Error('Invalid menu entry');if(item.children)validate(item.children,depth+1);}};validate(e.items);
        const itemButton=(item,parent,depth=0)=>{
            
            if(item.separator){const line=element('div','win32-menu-separator');line.setAttribute('role','separator');parent.append(line);return null;}
            const button=element('button',depth?'win32-menu-entry':'win32-menu-root');button.type='button';button.setAttribute('role',item.state&8?'menuitemcheckbox':'menuitem');if(item.state&8)button.setAttribute('aria-checked','true');button.disabled=!!(item.state&3);button.dataset.command=item.id;
            const parts=label(item.text).split('\t');button.append(element('span','win32-menu-check',item.state&8?'✓':''),element('span','win32-menu-label',parts[0]));if(parts[1])button.append(element('kbd','',parts[1]));parent.append(button);
            if(item.children){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.onclick=event=>{
                event.stopPropagation();if(button.disabled)return;const was=button.getAttribute('aria-expanded')==='true';if(depth===0)this.closeMenus();else{for(const popup of this.menuOpen.filter(p=>p.dataset.depth>=depth))popup.remove();this.menuOpen=this.menuOpen.filter(p=>Number(p.dataset.depth)<depth);}if(was)return;
                const popup=element('div','win32-menu-popup');popup.setAttribute('role','menu');popup.dataset.depth=depth;button.setAttribute('aria-expanded','true');button.parentNode.append(popup);
                popup.style.left=(depth?button.offsetLeft+button.offsetWidth:button.offsetLeft)+'px';popup.style.top=(depth?button.offsetTop:button.offsetTop+button.offsetHeight)+'px';for(const child of item.children)itemButton(child,popup,depth+1);this.menuOpen.push(popup);popup.querySelector('button:not(:disabled)')?.focus();
                popup.addEventListener('keydown',key=>{const buttons=[...popup.querySelectorAll(':scope > button:not(:disabled)')],at=buttons.indexOf(document.activeElement);if(key.key==='Escape'){key.preventDefault();key.stopPropagation();popup.remove();button.setAttribute('aria-expanded','false');button.focus();}else if(key.key==='ArrowDown'||key.key==='ArrowUp'){key.preventDefault();buttons[(at+(key.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}});
            };button.addEventListener('keydown',key=>{if(['ArrowDown','ArrowRight'].includes(key.key)){key.preventDefault();button.click();}});
            }else button.onclick=()=>{this.closeMenus();this.send({type:'menu',hwnd:e.hwnd,id:item.id});view.renderer.canvas.focus();};
            return button;
        };
        for(const item of e.items)itemButton(item,view.menu);view.menu.hidden=!e.items.length;this.fit();
        if(!this.outside){this.outside=event=>{if(!event.target.closest('.win32-menubar'))this.closeMenus();};this.stage.addEventListener('pointerdown',this.outside);}
    }
    trapFocus(node){node.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const list=[...node.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')].filter(e=>!e.hidden&&e.getClientRects().length);if(!list.length)return;const index=list.indexOf(document.activeElement),next=event.shiftKey?(index<=0?list.at(-1):list[index-1]):list[(index+1)%list.length];event.preventDefault();event.stopPropagation();next.focus();});}
    messagebox(e){
        const body=element('div','win32-messagebox');body.setAttribute('role','alertdialog');body.setAttribute('aria-modal','true');body.setAttribute('aria-label',e.title||'Windows application');body.append(element('h2','',e.title||'Windows application'),element('p','',e.text));
        const buttons=e.buttons||(e.cancel?[[1,'OK'],[2,'Cancel']]:[[1,'OK']]);if(!Array.isArray(buttons)||buttons.length>3)throw Error('Invalid message-box buttons');let done=false;
        const answer=value=>{if(done)return;done=true;this.send({type:'response',id:e.id,value});body.remove();if(e.hwnd)this.focus(e.hwnd);};
        buttons.forEach(([value,title],index)=>{const button=element('button',index===(e.defaultButton||0)?'primary':'secondary',title);button.type='button';button.onclick=()=>answer(value);body.append(button);});this.trapFocus(body);
        body.addEventListener('keydown',key=>{if(key.key==='Escape'&&buttons.some(([id])=>id===2)){key.preventDefault();answer(2);}});this.stage.append(body);body.querySelectorAll('button')[e.defaultButton||0]?.focus();
    }
    async receive(e){
        if(this.dead){this.ack(e);return;}
        if(e.type==='window')return this.window(e);
        if(e.type==='draw'){const view=this.views.get(e.hwnd);if(!view)throw Error('Unknown GDI window target');await view.renderer.submit(e.commands);this.ack(e);return;}
        if(e.type==='menu')return this.menu(e);
        if(e.type==='messagebox')return this.messagebox(e);
        if(e.type==='measure'){const renderer=this.views.get(e.hwnd)?.renderer||this.primary?.renderer;if(!renderer)throw Error('No font measurement surface');this.send({type:'response',id:e.id,value:renderer.measure(e.text,e.size)});return;}
        const control=this.controls.get(e.hwnd),view=this.views.get(e.hwnd);
        if(e.type==='text'){
            if(control){control.title=e.text;if(control.node.matches('input,textarea'))control.node.value=e.text;else if(control.type==='BUTTON'&&(control.style&15)===7)control.node.querySelector('legend').textContent=label(e.text);else if(control.input)control.node.querySelector('span').textContent=label(e.text);else control.node.textContent=label(e.text);}
            else if(view){view.shell.setAttribute('aria-label',e.text);if(view.title)view.title.textContent=e.text;if(view===this.primary)this.session.w.setTitle?.(e.text+' · Win32');}
        }else if(e.type==='show'){if(control)control.node.hidden=!e.visible;else if(view){view.visible=e.visible;view.shell.hidden=!e.visible;this.fit();}}
        else if(e.type==='controlstate'){
            if(control){const node=control.input||control.node;node.disabled=!e.enabled;control.node.setAttribute('aria-disabled',String(!e.enabled));if(control.input){control.input.checked=!!e.check;control.input.indeterminate=e.check===2;}if(control.type==='EDIT'){node.readOnly=!!(e.style&0x800);node.maxLength=e.limit||32767;if(e.selection)try{const text=node.value.replace(/\r?\n/g,'\r\n');node.setSelectionRange(text.slice(0,e.selection[0]).replace(/\r\n/g,'\n').length,text.slice(0,e.selection[1]).replace(/\r\n/g,'\n').length);}catch{}}}
            if(view){view.shell.inert=!e.enabled;view.shell.classList.toggle('win32-disabled',!e.enabled);}
        }else if(e.type==='focus')this.focus(e.hwnd);
        else if(e.type==='geometry'){
            if(control){const node=control.node;Object.assign(node.style,{left:e.x+'px',top:e.y+'px',width:e.width+'px',height:e.height+'px'});}
            else if(view){view.width=e.width;view.height=e.height;view.renderer.resize(e.width,e.height);view.client.style.width=e.width+'px';view.client.style.height=e.height+'px';if(view===this.primary){this.session.width=e.width;this.session.height=e.height;}this.fit();}
            this.ack(e);
        }else if(e.type==='destroy'){
            if(control){control.node.remove();this.controls.delete(e.hwnd);this.session.controls.delete(e.hwnd);}
            else if(view){view.renderer.destroy();view.shell.remove();this.views.delete(e.hwnd);if(view===this.primary){this.primary=null;this.session.hwnd=0;}}
        }
    }
    destroy(){if(this.dead)return;this.dead=true;this.closeMenus();this.observer.disconnect();if(this.outside)this.stage.removeEventListener('pointerdown',this.outside);for(const view of this.views.values())view.renderer.destroy();this.views.clear();this.controls.clear();this.stage.querySelectorAll('.win32-messagebox').forEach(e=>e.remove());}
}
globalThis.AsterWin32GUIHost=GUIHost;
})();
