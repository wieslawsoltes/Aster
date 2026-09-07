import RFB from '/vendor/novnc/core/rfb.js';
const status = document.querySelector('#status');
const config = await fetch('/api/config', {cache:'no-store'}).then(r => r.json());
let rfb = null, parentOrigin = null;
const report = (type, extra = {}) => parentOrigin && parent.postMessage({type:'aster-windows-'+type, ...extra}, parentOrigin);
function profile(name) {
    if (!rfb) return;
    const profiles = {latency:[7,0], balanced:[6,2], bandwidth:[3,6]};
    [rfb.qualityLevel, rfb.compressionLevel] = profiles[name] || profiles.balanced;
}
window.addEventListener('message', event => {
    if (event.source !== parent || !config.parentOrigins.includes(event.origin)) return;
    const message = event.data;
    if (!message || typeof message.type !== 'string') return;
    if (message.type === 'aster-windows-connect') {
        if (rfb || !/^[a-f0-9]{32}$/.test(message.session) || !/^[A-Za-z0-9_-]{32,80}$/.test(message.ticket)) return;
        parentOrigin = event.origin;
        const url = new URL('/stream/'+message.session, location.origin);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        status.textContent = 'Connecting to the live Windows display…';
        // A single-use ticket, not the pairing token. No secrets in URLs or referrers.
        rfb = new RFB(document.querySelector('#screen'), url.href, {
            shared:true, wsProtocols:['binary', 'aster-ticket.'+message.ticket]
        });
        rfb.scaleViewport = true;
        rfb.resizeSession = false; // Xvfb has a fixed resolution; browser window resizes scale locally.
        rfb.focusOnClick = true;
        profile(message.profile);
        rfb.addEventListener('connect', () => {status.hidden=true; report('connected');});
        rfb.addEventListener('disconnect', event => {
            status.hidden=false; status.textContent='Display disconnected. Use Reconnect in Aster.';
            report('disconnected', {clean:event.detail.clean});
        });
        rfb.addEventListener('securityfailure', () => report('error',{message:'VNC authentication failed'}));
        rfb.addEventListener('clipboard', event => report('clipboard',{text:String(event.detail.text).slice(0,65536)}));
    } else if (event.origin === parentOrigin && rfb) {
        if (message.type === 'aster-windows-profile') profile(message.profile);
        if (message.type === 'aster-windows-clipboard' && typeof message.text === 'string') rfb.clipboardPasteFrom(message.text.slice(0,65536));
        if (message.type === 'aster-windows-ctrlaltdel') rfb.sendCtrlAltDel();
        if (message.type === 'aster-windows-disconnect') rfb.disconnect();
    }
});
// Post only after modules/config load, to the expected, allowlisted parent origin.
const target = new URLSearchParams(location.hash.slice(1)).get('parent');
if (config.parentOrigins.includes(target)) parent.postMessage({type:'aster-windows-viewer-ready'}, target);
else status.textContent = 'Open this display from an authorized Aster desktop.';
