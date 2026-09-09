/* Browser address validation and frame policy shared by Orbit and reviewed apps. MIT. */
'use strict';
((root) => {
    const isolated = 'allow-scripts allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox';
    const media = new Set(['Frameforge','PulsegridStudio','SonoraStudio','SignalForgeStudio','VeyraWorkspace']);
    function address(input, search = true) {
        if (typeof input !== 'string' || input.length > 4096 || /[\x00-\x1f\x7f]/.test(input)) throw Error('Enter an address of at most 4,096 characters without control characters.');
        let value = input.trim();
        if (!value) return 'aster://home';
        if (/^aster:\/\/(home|apps)$/.test(value)) return value;
        if (value.startsWith('aster://file/')) {
            const path = decodeURIComponent(value.slice('aster://file'.length));
            if (/[\x00-\x1f\x7f\\]/.test(path) || path.includes('//') || path.split('/').some(s => s === '..' || s === '.')) throw Error('Invalid local Aster file path.');
            return 'aster://file' + encodeURI(path).replace(/#/g,'%23').replace(/\?/g,'%3F');
        }
        if (/^(?:localhost|\[[\da-f:]+\]|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:[/?#]|$)/i.test(value)) value = 'https://' + value;
        if (!/^https?:\/\//i.test(value)) {
            if (/^[a-z][a-z\d+.-]*:/i.test(value) || !search) throw Error('Only HTTP, HTTPS and supported local Aster addresses are allowed.');
            return 'https://duckduckgo.com/?q=' + encodeURIComponent(value);
        }
        let url;
        try { url = new URL(value); } catch { throw Error('That website address is invalid.'); }
        if (!url.hostname || url.username || url.password) throw Error('Website addresses must have a hostname and must not contain credentials.');
        return url.href;
    }
    function catalogApp(url, apps = []) {
        const normalized = address(url, false);
        return apps.find(app => app.repo !== 'Aster' && /^[a-z\d_-]+$/i.test(app.repo) &&
            app.url === 'https://wieslawsoltes.github.io/' + app.repo + '/' && app.url === normalized) || null;
    }
    function framePolicy(url, apps = []) {
        const app = catalogApp(url, apps);
        return {
            trusted: !!app,
            sandbox: isolated + (app ? ' allow-same-origin allow-pointer-lock' : ''),
            allow: (app ? 'autoplay; fullscreen; clipboard-read; clipboard-write' : 'fullscreen') +
                (app && media.has(app.repo) ? '; microphone; camera; display-capture' : '') +
                (app && ['Wayline','MeridianGISStudio'].includes(app.repo) ? '; geolocation' : '')
        };
    }
    const api = Object.freeze({ address, catalogApp, framePolicy });
    root.AsterWebNavigation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
