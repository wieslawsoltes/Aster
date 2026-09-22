"""Live deployed-app startup checks, kept separate from inert host fixtures."""
import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def wait_for_app_startup(embedded, repo, gpu):
    if repo != 'CinderLab':
        return {}
    # CinderLab completes 42 volumetric warmup steps before removing its startup
    # overlay. SwiftShader can take longer than the generic control timeout.
    # Keep the real URL, simulation and subsequent actionable-control test intact.
    timeout = 300000 if gpu else 60000
    started = time.perf_counter()
    embedded.wait_for_function("""() => {
        const startup = document.querySelector('#startup');
        return !startup || startup.classList.contains('failed');
    }""", timeout=timeout)
    failure = embedded.locator('#startup.failed')
    assert failure.count() == 0, failure.inner_text() if failure.count() else ''
    return {'startupTimeoutMs': timeout,
            'startupWaitMs': round((time.perf_counter() - started) * 1000)}


def check_live_apps(page, apps, args, out, report, close_all):
    if args.repos:
        missing=set(args.repos)-{app['repo'] for app in apps}
        if missing:raise ValueError('Unknown catalog repositories: '+', '.join(sorted(missing)))
        apps=[app for app in apps if app['repo'] in args.repos]
    requested_repos={row['repo'] for row in json.loads((ROOT/'tests/web-apps/requested-2026-09-22.json').read_text())}
    results=[]
    for app in apps:
        errors=[]
        begin=time.perf_counter();row={'repo':app['repo'],'url':app['url']}
        try:
            page.evaluate('async id=>{window.web=Aster.launch(id);await web.ready;}',app['id'])
            frame=page.locator('.web-app-frame');handle=frame.element_handle();embedded=handle.content_frame()
            embedded.wait_for_url('https://wieslawsoltes.github.io/'+app['repo']+'/**',timeout=30000)
            embedded.wait_for_load_state('domcontentloaded',timeout=30000)
            embedded.wait_for_function('!!document.body && (document.body.innerText.trim().length>40 || document.querySelectorAll("canvas,button,input").length>3)',timeout=20000)
            # A loading screen has body text too. Each newly requested app
            # must finish booting and expose a genuinely actionable control.
            if app['repo'] in requested_repos:
                embedded.wait_for_function('document.querySelectorAll("button,input,textarea,select").length > 3',timeout=60000)
                row.update(wait_for_app_startup(embedded, app['repo'], args.gpu))
                control=embedded.locator('button:visible:enabled, input:not([type=hidden]):visible:enabled, textarea:visible:enabled, select:visible:enabled').first
                control.click(trial=True,timeout=60000)
                row['actionableControl']=control.evaluate('(el)=>el.getAttribute("aria-label") || el.getAttribute("title") || el.innerText.trim() || el.tagName.toLowerCase()')
            # Keep the earlier app-specific readiness checks as well.
            ready={'Velsign':'Upload a document','Folio':'Share','MirevaStudio':'Preview','Orivane':'Workspace','Velora':'Present'}
            if app['repo']=='Orivane':
                embedded.get_by_text('A shared space for better ideas.',exact=True).wait_for(state='hidden',timeout=45000)
            if app['repo'] in ready:
                embedded.get_by_role('button',name=ready[app['repo']],exact=False).first.click(trial=True,timeout=45000)
                row['actionableControl']=ready[app['repo']]
            info=embedded.evaluate('({title:document.title,url:location.href,elements:document.body.querySelectorAll("*").length,textLength:document.body.innerText.trim().length,canvases:document.querySelectorAll("canvas").length,controls:document.querySelectorAll("button,input,textarea,select").length})')
            assert not info['title'].startswith('Site not found'),info
            row.update(status='PASS',ms=round((time.perf_counter()-begin)*1000),document=info)
            if app['repo'] in requested_repos or app['repo'] in ['PaintXP','Vellum','Gridline','AxiomCAD','VeyraWorkspace','AsterionEDA','TwinForge','Branchglass','NotepadXP','Formalyth','Jailbreak','VoltWeaveCircuitStudio','StratumIntelligence','Veldra3D','AvolithStudio','AureonStudio','Velsign','Folio','MirevaStudio','Orivane','Velora']:page.screenshot(path=str(out/(app['repo']+'-live.png')))
        except Exception as e:
            row.update(status='FAIL',error=str(e))
            page.screenshot(path=str(out/(app['repo']+'-live-failure.png')))
        finally:close_all()
        results.append(row);print(row['status'],app['repo'],row.get('error',''),flush=True)
    report['apps']=results;report['passed']=sum(r['status']=='PASS' for r in results)
    assert report['passed']==len(apps),[r for r in results if r['status']!='PASS']
    return
