/* Native surface adapter. In ordinary browsers no privileged bridge is installed. MIT. */
'use strict';
(() => {
    const OS=Aster,bridge=window.AsterNativeBrowser;
    const available=!!(bridge?.version===1&&typeof bridge.create==='function'&&typeof bridge.subscribe==='function');
    const live=new Map();let lastLayout='',lastSent=0,frame=0;
    function layout() {
        frame=0;if(!available||!live.size)return;
        const overlay=!!document.querySelector('.lock-screen,.dialog-backdrop,#context-menu:not([hidden])') || [...document.querySelectorAll('#panel-layer > *,#toast-layer > *')].some(n=>!n.hidden&&n.getBoundingClientRect().height>0);
        let target=null;
        if(!overlay&&document.visibilityState!=='hidden')for(const surface of live.values()) {
            const owner=surface.owner,slot=surface.slot;
            if(surface.disposed||!surface.ready||!slot.isConnected||slot.closest('[hidden]')||owner.closed||owner.minimized||owner.desktop!==OS.activeDesktop||OS.focused!==owner.id||owner.el.classList.contains('dragging'))continue;
            const r=slot.getBoundingClientRect();if(r.width<20||r.height<20||r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight)continue;
            const points=[[2,2],[r.width-2,2],[r.width/2,r.height/2],[2,r.height-2],[r.width-2,r.height-2]];
            if(!points.every(([x,y])=>slot.contains(document.elementFromPoint(r.x+x,r.y+y))))continue;
            target={id:surface.id,bounds:{x:Math.ceil(r.x),y:Math.ceil(r.y),width:Math.floor(r.width)-1,height:Math.floor(r.height)-1}};break;
        }
        const encoded=JSON.stringify(target),now=performance.now();
        if(encoded!==lastLayout||now-lastSent>500){lastLayout=encoded;lastSent=now;bridge.layout(target);}
        frame=requestAnimationFrame(layout);
    }
    function sync(){if(available&&!frame&&live.size)frame=requestAnimationFrame(layout);}
    class NativeSurface {
        constructor(slot,owner,onState,onPopup) {
            this.slot=slot;this.owner=owner;this.onState=onState;this.onPopup=onPopup;this.id=OS.uid();this.disposed=false;this.ready=false;
            this.state={url:'',title:'Website',loading:true,canBack:false,canForward:false,zoom:1,error:null};
            live.set(this.id,this);this.started=bridge.create({id:this.id}).then(()=>{if(this.disposed)return bridge.destroy(this.id);this.ready=true;sync();}).catch(e=>{if(!this.disposed)this.onState({...this.state,error:e.message,loading:false});throw e;});
            slot.onclick=()=>{owner.focus(false);sync();setTimeout(()=>this.command('focus').catch(()=>{}),40);};
            slot.tabIndex=0;slot.setAttribute('role','group');slot.setAttribute('aria-label','Native Chromium website');
            slot.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();this.command('focus').catch(()=>{});}};
            sync();
        }
        async navigate(url){await this.started;if(!this.disposed)return bridge.navigate(this.id,url);return false;}
        async command(action,value){await this.started;if(!this.disposed)return bridge.command(this.id,action,value);return false;}
        dispose(){if(this.disposed)return;this.disposed=true;live.delete(this.id);this.started.then(()=>bridge.destroy(this.id)).catch(()=>{});if(!live.size){cancelAnimationFrame(frame);frame=0;lastLayout='';bridge.layout(null);}else sync();}
    }
    if(available){
        bridge.subscribe(event=>{
            const s=live.get(event?.id);if(!s||s.disposed)return;
            if(event.type==='state'){s.state={...s.state,...event};s.onState(s.state);}
            if(event.type==='popup')OS.guard(()=>s.onPopup?.(event.url))();
            if(event.type==='shortcut'){
                s.owner.focus(false);const e=new KeyboardEvent('keydown',{key:event.key,ctrlKey:OS.input.platform()!=='macos',metaKey:OS.input.platform()==='macos',shiftKey:event.shift,bubbles:true,cancelable:true});
                if(event.key==='f'){const input=s.slot.parentElement.querySelector('input[type=search]');input?.focus();input?.select();}else s.owner.onKey?.(e);
            }
            if(event.type==='closed'){s.dispose();s.onState({...s.state,loading:false,error:'Website session cleared. Reload to start a new page.'});}
            if(event.type==='notice')OS.notify('Orbit Browser',event.message);
        });
        new MutationObserver(()=>{if(live.size){cancelAnimationFrame(frame);layout();}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
        OS.on('clipboard-lock',()=>{bridge.layout(null);lastLayout='';});
        window.addEventListener('pagehide',()=>{for(const s of [...live.values()])s.dispose();});
    }
    OS.nativeBrowser=Object.freeze({available,create:(...args)=>{if(!available)throw Error('Launch Aster Desktop to use the native browser engine.');return new NativeSurface(...args);},clearSession:()=>available?bridge.clearSession():Promise.resolve(false),sync});
})();
