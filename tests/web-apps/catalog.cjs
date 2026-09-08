'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const root = path.resolve(__dirname, '../..');
const catalog = require(root + '/src/web-app-catalog.js');
const inventory = JSON.parse(fs.readFileSync(root + '/docs/web-app-inventory.json', 'utf8'));
const launcher = fs.readFileSync(root + '/src/apps-web.js', 'utf8');
function register(c = catalog) {
    const apps = new Map();
    const OS = { register: (id, spec) => { assert(!apps.has(id)); apps.set(id, spec); } };
    vm.runInNewContext(launcher, { Aster: OS, AsterWebCatalog: c, URL }, {timeout: 1000});
    return {apps, OS};
}
test('Every audited web project appears exactly once; only Aster itself is excluded', () => {
    assert.equal(inventory.repositories.length, 68);
    assert.equal(catalog.apps.length, 67);
    assert.equal(new Set(catalog.apps.map(a => a.id)).size, 67);
    assert.deepEqual(catalog.apps.map(a => a.repo).sort(), inventory.repositories.filter(r => r.included).map(r => r.name).sort());
    assert.deepEqual(inventory.repositories.filter(r => !r.included).map(r => r.name), ['Aster']);
});
test('The inclusive Sunday–Tuesday window uses Warsaw time, not UTC midnight', () => {
    assert.equal(catalog.startInclusive, '2026-09-06T00:00:00+02:00');
    assert.equal(catalog.endExclusive, '2026-09-09T00:00:00+02:00');
    for (const app of catalog.apps) {
        assert(Date.parse(app.createdAt) >= Date.parse(catalog.startInclusive));
        assert(Date.parse(app.createdAt) < Date.parse(catalog.endExclusive));
    }
    assert(Date.parse(catalog.apps.find(a => a.repo === 'Vellum').createdAt) < Date.parse('2026-09-06T00:00:00Z'));
});
test('Category submenus cover all projects and never contain an empty folder', () => {
    assert.equal(catalog.categories.length, 10);
    const ids = new Set(catalog.categories.map(c => c.id));
    assert.equal(ids.size, 10);
    for (const app of catalog.apps) assert(ids.has(app.category));
    for (const id of ids) assert(catalog.apps.some(a => a.category === id));
});
test('Launch URLs, repository identity, descriptions and deployment evidence agree', () => {
    for (const app of catalog.apps) {
        assert.equal(app.url, 'https://wieslawsoltes.github.io/' + app.repo + '/');
        assert.equal(app.repository, 'https://github.com/wieslawsoltes/' + app.repo);
        assert(app.description.length > 12 && app.documentTitle);
        const repo = inventory.repositories.find(r => r.name === app.repo);
        const deployment = repo.deployments.find(d => d.finalUrl === app.url);
        assert.equal(deployment.status, 200);
        assert(!deployment.headers['x-frame-options']);
        assert(!/frame-ancestors\s+'none'/.test(deployment.headers['content-security-policy'] || ''));
    }
});
test('Catalog objects and collections are immutable', () => {
    for (const value of [catalog, catalog.apps, catalog.categories, ...catalog.apps, ...catalog.categories]) assert(Object.isFrozen(value));
});
test('All projects register real mounts without DOM, network or eager iframe creation', () => {
    const {apps} = register();
    assert.equal(apps.size, 67);
    for (const [id, app] of apps) {
        assert.equal(app.webApp, true); assert.equal(typeof app.mount, 'function');
        assert(app.category && app.keywords && app.icon && app.color);
        assert(id.startsWith('web-'));
    }
});
test('The host rejects arbitrary origins, schemes, credentials and altered paths', () => {
    const original = catalog.apps[0];
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'http://wieslawsoltes.github.io/Vellum/', 'https://evil.example/Vellum/', 'https://user@wieslawsoltes.github.io/Vellum/', 'https://wieslawsoltes.github.io/Vellum/?token=x', 'https://wieslawsoltes.github.io/Aster/']) {
        assert.throws(() => register({...catalog, apps: [{...original, url}]}));
    }
});
test('Static and standalone loaders include catalog before launcher and shell', () => {
    const html = fs.readFileSync(root + '/index.html', 'utf8');
    assert(html.indexOf('src/web-app-catalog.js') < html.indexOf('src/apps-web.js'));
    assert(html.indexOf('src/apps-web.js') < html.indexOf('src/shell.js'));
    const sw = fs.readFileSync(root + '/sw.js', 'utf8');
    for (const asset of ['src/web-app-catalog.js', 'src/apps-web.js']) assert(sw.includes(asset));
    const standalone = fs.readFileSync(root + '/Aster.html', 'utf8');
    assert(!standalone.includes('<script src="src/apps-web.js"'));
    assert(standalone.includes('OS.renderWebAppStart') && standalone.includes('w.webFrame = next'));
});
