/* Optional Aster webview presentation SDK. No desktop or file permissions. MIT. */
'use strict';
(() => {
    if (window.AsterWebview) return;
    let port = null, dirty = false;
    const send = () => {
        if (port) port.postMessage({type:'aster-webview-state', version:1,
            title:document.title.slice(0,160), url:location.href, dirty});
    };
    const connect = e => {
        if (window.parent === window || e.source !== window.parent ||
            e.data?.type !== 'aster-webview-init' || e.data.version !== 1 || e.ports.length !== 1) return;
        // The direct embedding parent receives presentation only. No parent-supplied
        // script, command, URL, HTML or file request is accepted through this port.
        port?.close(); port = e.ports[0]; port.start(); send();
    };
    window.addEventListener('message', connect);
    window.addEventListener('hashchange', send);
    window.addEventListener('popstate', send);
    let timer = null;
    const observer = new MutationObserver(() => {
        clearTimeout(timer); timer = setTimeout(send, 60);
    });
    if (document.head) observer.observe(document.head, {subtree:true, childList:true, characterData:true});
    window.AsterWebview = Object.freeze({
        get connected() { return !!port; },
        setDirty(value) { if (typeof value !== 'boolean') throw new TypeError('Dirty state must be boolean.'); dirty = value; send(); },
        update: send,
        dispose() {
            clearTimeout(timer); observer.disconnect(); port?.close(); port = null;
            window.removeEventListener('message', connect);
            window.removeEventListener('hashchange', send);
            window.removeEventListener('popstate', send);
        }
    });
})();
