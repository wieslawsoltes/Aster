"""Real Wine/Win32/streamed-input E2E. No runtime mocks or missing-dependency skips."""
import argparse
import asyncio
from contextlib import suppress
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import tempfile
import time
from aiohttp import ClientSession, web
from playwright.async_api import async_playwright
from bridge.server import BRIDGE_KEY, Config, create_app

ROOT=Path(__file__).resolve().parents[2]
ARTIFACTS=ROOT/'tests/windows/artifacts'

async def main(args):
    ARTIFACTS.mkdir(exist_ok=True)
    reports=[]; errors=[]
    with tempfile.TemporaryDirectory(prefix='aster-win32-') as temporary:
        data=Path(temporary)
        with socket.socket() as sock: sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
        origin=f'http://127.0.0.1:{port}'; token=secrets.token_urlsafe(32)
        app=create_app(Config(data,token,origin,novnc=Path(args.novnc)))
        bridge=app[BRIDGE_KEY]
        assert bridge.runtime.capabilities()['ready'],bridge.runtime.capabilities()
        assert (Path(args.novnc)/'core/rfb.js').is_file(),'Install noVNC'
        runner=web.AppRunner(app,access_log=None);await runner.setup();await web.TCPSite(runner,'127.0.0.1',port).start()
        try:
            async with ClientSession(headers={'Authorization':'Bearer '+token}) as client:
                async def api(path,method='GET',**kwargs):
                    async with client.request(method,origin+path,**kwargs) as response:
                        body=await response.read()
                        if response.status>=400: raise AssertionError(f'{path}: HTTP {response.status} {body[:500]!r}')
                        return json.loads(body) if response.content_type=='application/json' else body
                async def until(action,predicate=bool,timeout=150):
                    end=time.monotonic()+timeout;last=None
                    while time.monotonic()<end:
                        try:
                            last=await action()
                            if predicate(last):return last
                        except (AssertionError,FileNotFoundError,json.JSONDecodeError) as error:last=str(error)
                        await asyncio.sleep(.15)
                    raise AssertionError(f'Timed out: {last}')
                async def file(app_id,name):return await api(f'/api/apps/{app_id}/files',params={'path':'Aster/Package/'+name,'download':'1'})
                async def running():
                    sessions=(await api('/api/sessions'))['sessions']
                    failed=[s for s in sessions if s['status']=='failed']
                    if failed:raise RuntimeError(f'Native launch failed: {failed}')
                    return next((s for s in reversed(sessions) if s['status']=='running'),None)
                async with async_playwright() as playwright:
                    options={'headless':True,'args':['--no-sandbox']}
                    if args.browser:options['executable_path']=args.browser
                    browser=await playwright.chromium.launch(**options)
                    page=await browser.new_page(viewport={'width':1600,'height':1050})
                    page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(20000)
                    console=[];page.on('console',lambda m:console.append({'level':m.type,'text':m.text}))
                    try:
                        await page.goto(origin,wait_until='networkidle');await page.wait_for_function('window.Aster?.booted')
                        await page.evaluate("async()=>{for(const w of [...Aster.windows.values()])await w.close(true);const w=Aster.launch('winapps',{rect:{x:30,y:25,w:1440,h:950}});await w.ready;}")
                        await page.get_by_label('Companion URL').fill(origin);await page.get_by_label('Pairing token').fill(token)
                        await page.get_by_role('button',name='Connect companion',exact=True).click()
                        await page.get_by_label('Import Windows executable or ZIP').wait_for()
                        for executable in args.exe:
                            executable=Path(executable).resolve();assert executable.is_file(),executable
                            await page.locator('.wa-consent input').check()
                            await page.get_by_label('Import Windows executable or ZIP').set_input_files(str(executable))
                            await page.get_by_text(executable.name,exact=True).wait_for()
                            catalog=await api('/api/apps');record=next(a for a in catalog['apps'] if a['name']==executable.name);app_id=record['id']
                            timings={}
                            for attempt in ['cold','warm']:
                                await page.locator('.wa-consent input').check()
                                card=page.locator('.wa-library .wa-card').filter(has=page.get_by_text(executable.name,exact=True))
                                start=time.monotonic();await card.get_by_role('button',name='Run',exact=True).click()
                                session=await until(running);timings[attempt+'_runtime_ready_ms']=session['startup_ms']
                                proof=json.loads(await until(lambda:file(app_id,'ready.json')))
                                geometry=json.loads(await file(app_id,'geometry.json'))
                                frame=page.frame_locator('iframe.wa-display');canvas=frame.locator('canvas')
                                await canvas.wait_for(state='visible');await frame.locator('#status').wait_for(state='hidden')
                                timings[attempt+'_first_connected_ms']=round((time.monotonic()-start)*1000)
                                await asyncio.sleep(.4)
                                box=await canvas.bounding_box();assert box,'No remote framebuffer'
                                def point(rect):return {'x':(rect[0]+rect[2])/2/session['width']*box['width'],'y':(rect[1]+rect[3])/2/session['height']*box['height']}
                                text=f'Aster actual {geometry["bits"]}-bit Win32 {attempt} execution'
                                await canvas.click(position=point(geometry['edit']));await page.keyboard.press('Control+a');await page.keyboard.type(text,delay=12)
                                click_start=time.monotonic();await canvas.click(position=point(geometry['button']))
                                await until(lambda:file(app_id,'result.txt'),lambda b:b.decode()==text,timeout=15)
                                timings[attempt+'_save_roundtrip_ms']=round((time.monotonic()-click_start)*1000)
                                current=await api('/api/sessions/'+session['id'])
                                assert current['bytes_out']>1000 and current['viewers']==1,current
                                await page.get_by_role('button',name='Reconnect display',exact=True).click();await frame.locator('#status').wait_for(state='hidden')
                                assert (await file(app_id,'result.txt')).decode()==text
                                await page.screenshot(path=str(ARTIFACTS/f'win32-{geometry["bits"]}-{attempt}.png'))
                                await api('/api/sessions/'+session['id'],'DELETE')
                                assert all(p.returncode is not None for p in bridge.runtime.sessions[session['id']].processes)
                                assert (await file(app_id,'result.txt')).decode()==text,'Persisted C: file lost'
                                await page.get_by_role('button',name='Library',exact=True).click()
                                if attempt=='cold':
                                    for name in ['ready.json','geometry.json']:(bridge.library.drive(app_id)/'Aster/Package'/name).unlink()
                            reports.append({'exe':executable.name,'bits':geometry['bits'],'native_proof':proof,'timings':timings,
                                'assertions':['real PE execution','Win32 window','streamed keyboard and pointer','Win32 WriteFile result','authenticated reconnect','warm prefix reuse','persisted files after stop','managed processes cleaned up']})
                            print(json.dumps(reports[-1],indent=2),flush=True)
                        cached=await page.evaluate("async()=>{let urls=[];for(const n of await caches.keys()){const c=await caches.open(n);urls.push(...(await c.keys()).map(r=>r.url));}return urls;}")
                        assert not any('/api/' in url or '/stream/' in url for url in cached),cached
                        assert not errors,errors
                        assert await page.evaluate('Aster.appForFile("/Downloads/app.exe")')=='winapps'
                        assert token not in await page.evaluate('JSON.stringify(Aster.settings)')
                        await page.reload(wait_until='networkidle');await page.wait_for_function('window.Aster?.booted')
                        await page.evaluate("async()=>{for(const w of [...Aster.windows.values()])await w.close(true);await Aster.launch('winapps').ready;}")
                        await page.get_by_label('Pairing token').wait_for();assert await page.get_by_label('Pairing token').input_value()==''
                        assert len((await api('/api/apps'))['apps'])==len(args.exe)
                    except Exception:
                        with suppress(Exception):await page.screenshot(path=str(ARTIFACTS/'failure.png'))
                        raise
                    finally:
                        # Neither request headers nor pairing tokens are logged.
                        (ARTIFACTS/'results.json').write_text(json.dumps({'runs':reports,'browser_errors':errors,'console':console,
                            'environment':{'platform':os.uname().sysname,'machine':os.uname().machine},
                            'note':'Runner observations, not FPS, pure input latency or a broad compatibility certification.'},indent=2))
                        await browser.close()
        finally:
            await runner.cleanup()
            for path in data.rglob('runtime.log'):shutil.copyfile(path,ARTIFACTS/(path.parent.name+'-runtime.log'))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--exe',action='append',required=True)
    parser.add_argument('--browser');parser.add_argument('--novnc',default='/usr/share/novnc')
    asyncio.run(main(parser.parse_args()))
