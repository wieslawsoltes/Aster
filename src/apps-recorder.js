/* Permission-based screen recording. No capture occurs without a user gesture. MIT. */
'use strict';
(() => {
    const OS=Aster,U=OS.desktopUI;
    class ScreenRecorder {
        constructor(change=()=>{}){this.change=change;this.state='idle';this.stream=null;this.recorder=null;this.blob=null;this.disposed=false;this.chunks=[];this.bytes=0;this.elapsed=0;this.started=0;this.error='';}
        duration(){return this.elapsed+(this.state==='recording'?performance.now()-this.started:0);}
        async start(audio=false){
            if(!['idle','complete','error'].includes(this.state)||this.disposed)throw Error('Recording is already active.');
            if(!navigator.mediaDevices?.getDisplayMedia||!globalThis.MediaRecorder)throw Error('Screen recording is unavailable in this browser/context. Use a supported browser on HTTPS or localhost.');
            this.state='requesting';this.error='';this.change();let stream;
            try{
                stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:!!audio});
                if(this.disposed){stream.getTracks().forEach(t=>t.stop());throw new DOMException('Window closed while requesting capture','AbortError');}
                if(!stream.getVideoTracks().length)throw Error('No video track was selected.');this.stream=stream;
                const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
                this.recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);this.chunks=[];this.bytes=0;this.blob=null;this.elapsed=0;
                this.finished=new Promise(resolve=>this.resolve=resolve);
                this.recorder.ondataavailable=e=>{if(e.data.size){this.bytes+=e.data.size;if(this.bytes>64*1024*1024){this.error='Recording exceeded the 64 MiB memory limit. Record a shorter clip.';this.chunks=[];this.stop();}else this.chunks.push(e.data);}this.change();};
                this.recorder.onerror=e=>{this.error=e.error?.message||'Media recording failed';this.stop();};
                this.recorder.onstop=()=>{clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.blob=this.error?null:new Blob(this.chunks,{type:this.recorder.mimeType||'video/webm'});this.chunks=[];this.state=this.error?'error':'complete';this.resolve?.(this.blob);if(!this.disposed)this.change();};
                stream.getVideoTracks()[0].addEventListener('ended',()=>this.stop(),{once:true});
                this.recorder.start(1000);this.started=performance.now();this.state='recording';this.timer=setInterval(()=>{if(this.duration()>=30*60000)this.stop();else this.change();},500);this.change();
            }catch(error){stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.state='error';this.error=error.name==='NotAllowedError'?'Screen capture permission was denied or cancelled.':error.message;if(!this.disposed)this.change();throw error;}
        }
        pause(){if(this.state!=='recording')return;this.elapsed=this.duration();this.recorder.pause();this.state='paused';this.change();}
        resume(){if(this.state!=='paused')return;this.recorder.resume();this.started=performance.now();this.state='recording';this.change();}
        stop(){if(['recording','paused'].includes(this.state)){this.elapsed=this.duration();this.state='stopping';clearInterval(this.timer);this.recorder.stop();if(!this.disposed)this.change();}return this.finished||Promise.resolve(this.blob);}
        dispose(){this.disposed=true;this.stop();clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());if(this.state==='complete'){this.blob=null;this.chunks=[];}}
    }
    OS.ScreenRecorder=ScreenRecorder;
    OS.register('recorder',{title:'Screen Recorder',icon:'video',color:'coral',category:'Creation',description:'Record a browser-authorized tab, window or screen; pause, preview and save video.',width:860,height:680,singleton:true,mount(w){
        const root=U.page(w,'Capture a moment in motion','Choose a tab, window, or screen using your browser’s permission dialog. Recording never starts automatically. Audio is included only when offered and selected by the browser.'),actions=OS.el('div',{class:'suite-actions'}),status=OS.el('div',{class:'suite-card recorder-status',role:'status'}),video=OS.el('video',{class:'recorder-preview',controls:true,playsinline:true}),audio=OS.el('input',{type:'checkbox','aria-label':'Request shared system audio'});let url='',currentBlob=null;
        const record=new ScreenRecorder(render);w.recorder=record;
        const start=U.button('Choose screen & record',async()=>{if(record.blob&&w.dirty&&!await OS.confirm('Discard unsaved recording?','Download or save the current clip before starting another.','Discard'))return;await record.start(audio.checked);w.dirty=true;},true),pause=U.button('Pause',()=>record.state==='paused'?record.resume():record.pause()),stop=U.button('Stop',()=>record.stop()),save=U.button('Save to Videos',async()=>{if(!record.blob)return;const ext=record.blob.type.includes('mp4')?'mp4':'webm',path=await OS.fs.unique('/Videos/Recording '+new Date().toISOString().replace(/[:.]/g,'-')+'.'+ext);await OS.fs.write(path,record.blob,record.blob.type);w.dirty=false;OS.notify('Recording saved',path);}),download=U.button('Download video',()=>{if(record.blob){OS.download(record.blob,'Aster-recording.'+(record.blob.type.includes('mp4')?'mp4':'webm'));w.dirty=false;}});
        actions.append(start,pause,stop,save,download);root.append(OS.el('label',{class:'suite-toggle'},audio,OS.el('span',{text:'Request shared system audio (not microphone)'})),actions,status,video,U.note('Maximum 30 minutes or 64 MiB. Capture ends when the source stops sharing or this window closes. Save/download before closing; recording buffers are not persisted automatically.'));
        function render(){if(w.closed)return;const seconds=Math.floor(record.duration()/1000);status.textContent=record.error||`${record.state} · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} · ${OS.formatBytes(record.bytes)}`;start.disabled=['requesting','recording','paused','stopping'].includes(record.state);pause.disabled=!['recording','paused'].includes(record.state);pause.textContent=record.state==='paused'?'Resume':'Pause';stop.disabled=pause.disabled;save.disabled=download.disabled=!record.blob;audio.disabled=start.disabled;
            if(record.blob&&record.blob!==currentBlob){if(url)URL.revokeObjectURL(url);currentBlob=record.blob;url=URL.createObjectURL(record.blob);video.src=url;w.dirty=true;}
            if(record.state==='recording'&&!record.blob&&currentBlob){video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);url='';currentBlob=null;}}
        w.beforeClose=async()=>!w.dirty&&!['requesting','recording','paused'].includes(record.state)||!!await OS.confirm('Close Screen Recorder?','Active capture stops and unsaved video is discarded.','Close');w.addCleanup(()=>{record.dispose();video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);});render();
    }});
})();
