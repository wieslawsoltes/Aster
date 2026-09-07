"""Single-owner Windows companion. Run as an unprivileged user: python -m bridge.server."""
from __future__ import annotations
import argparse
import asyncio
from contextlib import suppress
from dataclasses import dataclass
import hmac
import json
import os
from pathlib import Path
import secrets
import ssl
import tempfile
import time
from urllib.parse import unquote, urlsplit
import zipfile
from aiohttp import web, WSMsgType
from .storage import Library, MAX_UPLOAD, safe_path
from .runtime import Runtime

ROOT = Path(__file__).resolve().parents[1]
CLIENT = Path(__file__).resolve().parent / 'client'


def origin(value: str) -> str:
    p = urlsplit(value)
    if (p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password
            or p.path not in ('', '/') or p.query or p.fragment):
        raise ValueError('Expected an exact HTTP(S) origin without paths or credentials')
    if p.scheme == 'http' and p.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise ValueError('Remote companions require HTTPS')
    # Reject invalid ports now instead of after accepting the configuration.
    _ = p.port
    return f'{p.scheme}://{p.netloc}'


@dataclass
class Config:
    data: Path
    token: str
    public_origin: str = 'http://127.0.0.1:8787'
    allowed_origins: tuple[str, ...] = ()
    novnc: Path = Path('/usr/share/novnc')
    root: Path = ROOT
    idle_seconds: int = 180

    def __post_init__(self):
        self.public_origin = origin(self.public_origin)
        if len(self.token) < 32:
            raise ValueError('Pairing tokens must contain at least 32 characters')
        self.own_origins = {self.public_origin}
        p = urlsplit(self.public_origin)
        if p.hostname in ('localhost', '127.0.0.1'):
            port = f':{p.port}' if p.port else ''
            self.own_origins |= {f'{p.scheme}://localhost{port}', f'{p.scheme}://127.0.0.1{port}'}
        self.origins = self.own_origins | {origin(v) for v in self.allowed_origins}
        self.hosts = {urlsplit(v).netloc for v in self.own_origins}
        self.data = self.data.resolve()
        self.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        if self.data.is_relative_to(self.root.resolve()):
            raise ValueError('Private data must be outside the public source directory')


class Bridge:
    def __init__(self, config: Config):
        self.config = config
        self.library = Library(config.data)
        self.runtime = Runtime(self.library, idle_seconds=config.idle_seconds)
        self.tickets: dict[str, tuple[str, float]] = {}
        self.upload_lock = asyncio.Lock()

    def session(self, request):
        value = self.runtime.sessions.get(request.match_info['session_id'])
        if not value:
            raise FileNotFoundError('Session not found')
        return value

    async def health(self, request):
        return web.json_response({'name': 'Aster Windows Bridge', 'api': 1})

    async def config_json(self, request):
        return web.json_response({'parentOrigins': sorted(self.config.origins)})

    async def capabilities(self, request):
        data = self.runtime.capabilities()
        data.update(viewer_ready=(self.config.novnc / 'core/rfb.js').is_file(), max_upload=MAX_UPLOAD)
        return web.json_response(data)

    async def apps(self, request):
        if request.method == 'GET':
            return web.json_response({'apps': await asyncio.to_thread(self.library.all)})
        if request.headers.get('X-Aster-Consent') != 'run-trusted-windows-code':
            raise web.HTTPBadRequest(text='Explicit native-code consent is required')
        if self.upload_lock.locked():
            raise web.HTTPTooManyRequests(text='Another upload is in progress')
        async with self.upload_lock:
            filename = unquote(request.headers.get('X-Aster-Filename', ''))
            fd, name = tempfile.mkstemp(dir=self.config.data, prefix='upload-')
            os.close(fd)
            path = Path(name)
            try:
                count = 0
                with path.open('wb') as output:
                    async with asyncio.timeout(120):
                        async for chunk in request.content.iter_chunked(1024 * 1024):
                            count += len(chunk)
                            if count > MAX_UPLOAD:
                                raise web.HTTPRequestEntityTooLarge(max_size=MAX_UPLOAD, actual_size=count)
                            output.write(chunk)
                app = await asyncio.to_thread(self.library.import_package, path, filename)
                return web.json_response(app, status=201)
            finally:
                path.unlink(missing_ok=True)

    async def app_delete(self, request):
        app_id = request.match_info['app_id']
        if any(s.app_id == app_id and s.status in ('starting', 'running', 'stopping') for s in self.runtime.sessions.values()):
            raise web.HTTPConflict(text='Stop the application before deleting its files')
        await asyncio.to_thread(self.library.delete, app_id)
        return web.json_response({'deleted': True})

    async def entries(self, request):
        return web.json_response({'entries': await asyncio.to_thread(self.library.entries, request.match_info['app_id'])})

    async def files(self, request):
        app_id, relative = request.match_info['app_id'], request.query.get('path', '')
        if request.query.get('download') == '1':
            path = safe_path(self.library.drive(app_id), relative)
            if not path.is_file():
                raise FileNotFoundError('File not found')
            if path.stat().st_size > MAX_UPLOAD:
                raise ValueError('Downloads are limited to 128 MiB per file')
            return web.FileResponse(path, headers={'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment', 'Cache-Control': 'no-store'})
        return web.json_response({'files': await asyncio.to_thread(self.library.files, app_id, relative)})

    async def sessions(self, request):
        if request.method == 'GET':
            return web.json_response({'sessions': [s.public() for s in self.runtime.sessions.values()]})
        body = await request.json()
        if not isinstance(body, dict) or body.get('consent') is not True:
            raise ValueError('Launching requires explicit consent to run trusted native code')
        session = await self.runtime.launch(body.get('app_id', ''), body.get('entry', ''),
                                           body.get('width', 1280), body.get('height', 720))
        return web.json_response(session.public(), status=202)

    async def session_detail(self, request):
        session = self.session(request)
        if request.method == 'DELETE':
            await self.runtime.stop(session.id)
        else:
            session.last_seen = time.monotonic()
        return web.json_response(session.public())

    async def ticket(self, request):
        session = self.session(request)
        if session.status != 'running':
            raise web.HTTPConflict(text='Session is not running')
        now = time.monotonic()
        self.tickets = {key: value for key, value in self.tickets.items() if value[1] > now}
        if len(self.tickets) >= 64:
            raise web.HTTPTooManyRequests(text='Too many pending viewer connections')
        token = secrets.token_urlsafe(32)
        self.tickets[token] = (session.id, now + 30)
        return web.json_response({'ticket': token, 'expires_in': 30})

    async def websocket(self, request):
        if request.headers.get('Origin') not in self.config.own_origins:
            raise web.HTTPForbidden(text='The viewer must be served by this companion')
        protocols = [p.strip() for p in request.headers.get('Sec-WebSocket-Protocol', '').split(',')]
        tokens = [p[len('aster-ticket.'):] for p in protocols if p.startswith('aster-ticket.')]
        ticket = self.tickets.pop(tokens[0], None) if len(tokens) == 1 else None
        if not ticket or ticket[1] < time.monotonic() or ticket[0] != request.match_info['session_id']:
            raise web.HTTPUnauthorized(text='Viewer ticket is invalid, expired or already used')
        session = self.session(request)
        if session.status != 'running' or session.viewers >= 2:
            raise web.HTTPConflict(text='Session unavailable or viewer limit reached')
        # Reserve a viewer slot before awaiting the TCP connection.
        session.viewers += 1
        writer = None
        ws = web.WebSocketResponse(protocols=['binary'], heartbeat=20, compress=False, max_msg_size=2*1024*1024)
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection('127.0.0.1', session.port), 5)
            await ws.prepare(request)
            session.sockets.add(ws)
            async def output():
                try:
                    while data := await reader.read(64*1024):
                        session.bytes_out += len(data)
                        await ws.send_bytes(data)  # Awaited binary writes provide backpressure.
                finally:
                    await ws.close()
            sender = asyncio.create_task(output())
            try:
                async for message in ws:
                    session.last_seen = time.monotonic()
                    if message.type == WSMsgType.BINARY:
                        writer.write(message.data)
                        await writer.drain()
                    elif message.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
                        break
                    else:
                        await ws.close(code=1003, message=b'Binary RFB frames required')
                        break
            finally:
                sender.cancel()
                with suppress(asyncio.CancelledError, ConnectionError):
                    await sender
        finally:
            session.sockets.discard(ws)
            session.viewers -= 1
            session.last_seen = time.monotonic()
            if writer:
                writer.close()
                with suppress(ConnectionError):
                    await writer.wait_closed()
        return ws

    async def static(self, request):
        relative = request.match_info.get('path', '') or 'index.html'
        if relative.startswith('bridge-client/'):
            path = safe_path(CLIENT, relative[len('bridge-client/'):])
        elif relative.startswith('vendor/novnc/'):
            path = safe_path(self.config.novnc, relative[len('vendor/novnc/'):])
        elif relative.split('/')[0] in ('src', 'assets') or relative in ('index.html', 'Aster.html', 'sw.js', 'manifest.webmanifest', 'LICENSE'):
            path = safe_path(self.config.root, relative)
        else:
            raise web.HTTPNotFound()
        if not path.is_file():
            raise web.HTTPNotFound()
        return web.FileResponse(path)


BRIDGE_KEY = web.AppKey('bridge', Bridge)


def create_app(config: Config) -> web.Application:
    bridge = Bridge(config)
    @web.middleware
    async def security(request, handler):
        supplied_origin = request.headers.get('Origin')
        try:
            if request.host not in config.hosts:
                raise web.HTTPForbidden(text='Untrusted Host header')
            if supplied_origin and supplied_origin not in config.origins:
                raise web.HTTPForbidden(text='Origin not allowed; configure --allow-origin explicitly')
            if request.method == 'OPTIONS':
                response = web.Response(status=204)
            else:
                protected = request.path.startswith('/api/') and request.path not in ('/api/health', '/api/config')
                if protected and not hmac.compare_digest(request.headers.get('Authorization', '').encode(), ('Bearer '+config.token).encode()):
                    raise web.HTTPUnauthorized(text='Pair with the token printed by your companion')
                response = await handler(request)
        except web.HTTPException as error:
            response = web.json_response({'error': error.text}, status=error.status)
        except (ValueError, TypeError, KeyError, zipfile.BadZipFile) as error:
            response = web.json_response({'error': str(error)}, status=400)
        except FileNotFoundError as error:
            response = web.json_response({'error': str(error)}, status=404)
        except (asyncio.TimeoutError, ConnectionError):
            response = web.json_response({'error': 'Companion operation timed out or disconnected'}, status=503)
        if response.prepared:
            return response
        response.headers.update({'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store'})
        if supplied_origin in config.origins:
            response.headers.update({'Access-Control-Allow-Origin': supplied_origin, 'Vary': 'Origin',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Aster-Filename, X-Aster-Consent'})
        if request.path.startswith('/bridge-client/'):
            response.headers['Content-Security-Policy'] = ("default-src 'none'; script-src 'self'; style-src 'self'; "
                "img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors " + ' '.join(sorted(config.origins)))
        return response
    app = web.Application(middlewares=[security], client_max_size=MAX_UPLOAD)
    app[BRIDGE_KEY] = bridge
    for route, action in [('/api/health', bridge.health), ('/api/config', bridge.config_json),
            ('/api/capabilities', bridge.capabilities), ('/api/apps', bridge.apps),
            ('/api/apps/{app_id}/entries', bridge.entries), ('/api/apps/{app_id}/files', bridge.files),
            ('/api/sessions', bridge.sessions), ('/api/sessions/{session_id}', bridge.session_detail)]:
        app.router.add_get(route, action, allow_head=False)
    app.router.add_post('/api/apps', bridge.apps)
    app.router.add_delete('/api/apps/{app_id}', bridge.app_delete)
    app.router.add_post('/api/sessions', bridge.sessions)
    app.router.add_delete('/api/sessions/{session_id}', bridge.session_detail)
    app.router.add_post('/api/sessions/{session_id}/ticket', bridge.ticket)
    app.router.add_get('/stream/{session_id}', bridge.websocket)
    app.router.add_get('/{path:.*}', bridge.static)
    async def lifecycle(app):
        async def reaper():
            while True:
                await asyncio.sleep(10)
                await bridge.runtime.reap()
        task = asyncio.create_task(reaper())
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await bridge.runtime.close()
    app.cleanup_ctx.append(lifecycle)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--data', type=Path, default=Path.home()/'.local/share/aster-windows')
    parser.add_argument('--public-origin')
    parser.add_argument('--allow-origin', action='append', default=[])
    parser.add_argument('--novnc', type=Path, default=Path('/usr/share/novnc'))
    parser.add_argument('--cert', type=Path)
    parser.add_argument('--key', type=Path)
    parser.add_argument('--rotate-token', action='store_true')
    args = parser.parse_args()
    if os.geteuid() == 0:
        parser.error('Do not run Wine as root. Use the non-root container or an unprivileged user.')
    os.umask(0o077)
    args.data.mkdir(parents=True, exist_ok=True, mode=0o700)
    secret = args.data/'pairing-token'
    if args.rotate_token or not secret.exists():
        secret.write_text(secrets.token_urlsafe(32)+'\n')
        secret.chmod(0o600)
    context = None
    if bool(args.cert) != bool(args.key):
        parser.error('TLS requires both --cert and --key')
    if args.cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(args.cert, args.key)
    public = args.public_origin or f'{"https" if context else "http"}://127.0.0.1:{args.port}'
    config = Config(args.data, secret.read_text().strip(), public, tuple(args.allow_origin), args.novnc)
    print(f'Aster Windows Bridge: {config.public_origin}\nPairing token (keep private): {config.token}', flush=True)
    print('Run trusted code only. Wine is not a malware sandbox. Ctrl+C stops all sessions.', flush=True)
    web.run_app(create_app(config), host=args.host, port=args.port, ssl_context=context, access_log=None, shutdown_timeout=15)

if __name__ == '__main__':
    main()
