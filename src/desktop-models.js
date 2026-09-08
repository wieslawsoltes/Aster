/* Browser-scoped desktop models. No network, DOM or host OS access. MIT. */
'use strict';
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AsterDesktopModels = api;
})(globalThis, () => {
    const clamp = (value, min, max, fallback = min) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
    const dayKey = time => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const validText = (value, max = 100) => typeof value === 'string' ? value.slice(0,max) : '';
    class ClipboardHistory {
        constructor(saved = []) {
            this.entries = []; this.sequence = 0;
            for (const row of (Array.isArray(saved) ? saved : []).slice(0,25).reverse()) {
                if (row && typeof row.text === 'string' && row.text && row.text.length <= 16384) this.add(row.text, true);
            }
        }
        add(text, pinned = false) {
            if (typeof text !== 'string' || !text || text.length > 16384) return false;
            const old = this.entries.find(e => e.text === text);
            if (old) { this.entries = [old, ...this.entries.filter(e => e !== old)]; old.pinned ||= pinned; return old; }
            if (this.entries.length >= 25 && this.entries.every(e => e.pinned)) return false;
            const entry = {id: `clip-${++this.sequence}`, text, pinned, time: Date.now()};
            this.entries.unshift(entry);
            while (this.entries.length > 25) { const index = this.entries.findLastIndex(e => !e.pinned); this.entries.splice(index,1); }
            return entry;
        }
        pin(id) { const entry = this.entries.find(e => e.id === id); if (entry) entry.pinned = !entry.pinned; }
        remove(id) { this.entries = this.entries.filter(e => e.id !== id); }
        clear(all = false) { this.entries = all ? [] : this.entries.filter(e => e.pinned); }
        saved() { return this.entries.filter(e => e.pinned).map(({text}) => ({text})); }
    }
    class FocusSession {
        constructor(saved = {}, now = Date.now()) {
            this.state = { status: 'idle', remaining: 25*60000, duration: 25*60000, endAt: 0, task: '', completed: [], goal: 60 };
            if (saved && typeof saved === 'object') {
                this.state.goal = clamp(saved.goal, 5, 480, 60);
                this.state.duration = clamp(saved.duration, 60000, 180*60000, 25*60000);
                this.state.remaining = clamp(saved.remaining, 0, this.state.duration, this.state.duration);
                this.state.task = validText(saved.task,200);
                this.state.completed = (Array.isArray(saved.completed) ? saved.completed : []).filter(x => x && Number.isFinite(x.at) && Number.isFinite(x.minutes) && x.minutes > 0 && x.minutes <=180).slice(-366);
                if (['running','paused'].includes(saved.status)) {
                    this.state.status = saved.status;
                    this.state.endAt = clamp(saved.endAt, 0, now+180*60000, now);
                }
            }
        }
        start(minutes = 25, task = '', now = Date.now()) {
            if (!Number.isFinite(Number(minutes)) || minutes<1 || minutes>180) throw Error('Choose a duration from 1 to 180 minutes.');
            Object.assign(this.state, {status:'running', duration:Math.round(minutes*60000), remaining:Math.round(minutes*60000), endAt:now+Math.round(minutes*60000), task:validText(task,200)});
        }
        remaining(now = Date.now()) { return this.state.status === 'running' ? Math.max(0,this.state.endAt-now) : this.state.remaining; }
        pause(now = Date.now()) { if (this.state.status === 'running') { this.state.remaining=this.remaining(now); this.state.status='paused'; } }
        resume(now = Date.now()) { if (this.state.status === 'paused') { this.state.endAt=now+this.state.remaining; this.state.status='running'; } }
        cancel() { this.state.status='idle'; this.state.remaining=this.state.duration; this.state.endAt=0; }
        tick(now = Date.now()) {
            if (this.state.status !== 'running' || this.remaining(now)>0) return false;
            this.state.completed.push({at:now,minutes:this.state.duration/60000}); this.state.completed=this.state.completed.slice(-366);
            this.state.status='complete'; this.state.remaining=0; this.state.endAt=0; return true;
        }
        today(now = Date.now()) { return this.state.completed.filter(e=>dayKey(e.at)===dayKey(now)).reduce((n,e)=>n+e.minutes,0); }
    }
    function inQuietHours(schedule, now = new Date()) {
        if (!schedule?.enabled || !/^\d{2}:\d{2}$/.test(schedule.start) || !/^\d{2}:\d{2}$/.test(schedule.end)) return false;
        const parse=t=>{const [h,m]=t.split(':').map(Number);return h<24&&m<60?h*60+m:-1;};
        const start=parse(schedule.start), end=parse(schedule.end), minute=now.getHours()*60+now.getMinutes();
        if(start<0||end<0||start===end) return false;
        return start<end ? minute>=start&&minute<end : minute>=start||minute<end;
    }
    function pruneHistory(index, entry, {maxCount=200,maxBytes=32*1024*1024,perFile=10} = {}) {
        const rows=[...index,entry], removed=[];
        const drop=i=>removed.push(...rows.splice(i,1));
        while(rows.filter(r=>r.path===entry.path).length>perFile) drop(rows.findIndex(r=>r.path===entry.path));
        let bytes=rows.reduce((n,r)=>n+r.size,0);
        while(rows.length>maxCount || bytes>maxBytes) {const first=rows[0];drop(0);bytes-=first.size;}
        return {rows,removed};
    }
    function safeWindowState(state = {}) {
        const clean={};
        for(const key of ['path','cwd','view','section','date']) if(typeof state[key]==='string' && state[key].length<=1024) clean[key]=state[key];
        return clean;
    }
    function layoutRects(layout, count, viewport) {
        const gap=8, width=Math.max(200,viewport.w), height=Math.max(160,viewport.h);
        count=Math.min(4,Math.max(1,count));
        if(count===1) return [{x:gap,y:gap,w:width-2*gap,h:height-2*gap}];
        let cells;
        if(layout==='columns') cells=Array.from({length:count},(_,i)=>[i/count,0,1/count,1]);
        else if(layout==='primary') cells=[[0,0,.6,1],...Array.from({length:count-1},(_,i)=>[.6,i/(count-1),.4,1/(count-1)])];
        else cells=Array.from({length:count},(_,i)=>[i%2/2,Math.floor(i/2)/Math.ceil(count/2),.5,1/Math.ceil(count/2)]);
        return cells.map(([x,y,w,h])=>({x:gap+x*(width-gap),y:gap+y*(height-gap),w:w*(width-gap)-gap,h:h*(height-gap)-gap}));
    }
    return {clamp,dayKey,validText,ClipboardHistory,FocusSession,inQuietHours,pruneHistory,safeWindowState,layoutRects};
});
