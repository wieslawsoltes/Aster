"""API/storage checks. Header and echo fixtures are NOT Windows execution evidence."""
import asyncio
import io
from pathlib import Path
import struct
import tempfile
import time
import unittest
from unittest.mock import patch
import zipfile
from aiohttp import WSServerHandshakeError
from aiohttp.test_utils import TestClient, TestServer
from bridge.server import BRIDGE_KEY, Config, create_app, origin
from bridge.runtime import Session
from bridge.storage import Library, inspect_pe, safe_path


def pe(machine=0x8664, subsystem=2, dll=False):
    data = bytearray(256)
    data[:2] = b'MZ'
    struct.pack_into('<I', data, 60, 64)
    data[64:68] = b'PE\0\0'
    struct.pack_into('<HHIIIHH', data, 68, machine, 1, 0, 0, 0, 112, 2 | (0x2000 if dll else 0))
    struct.pack_into('<H', data, 88, 0x20b if machine == 0x8664 else 0x10b)
    struct.pack_into('<H', data, 156, subsystem)
    return bytes(data)


def archive(entries):
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w') as z:
        for name, data in entries:
            z.writestr(name, data)
    return result.getvalue()


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.library = Library(self.root)
        self.upload = self.root/'input'

    def import_file(self, data, name='test.exe'):
        self.upload.write_bytes(data)
        return self.library.import_package(self.upload, name)

    def test_x64_and_x86_headers(self):
        for machine, arch in [(0x8664, 'x64'), (0x14c, 'x86')]:
            self.upload.write_bytes(pe(machine))
            self.assertEqual(inspect_pe(self.upload)['architecture'], arch)

    def test_reject_non_pe_dll_driver_and_arm(self):
        for data in [b'not exe', pe(dll=True), pe(subsystem=1), pe(machine=0xaa64)]:
            with self.subTest(data=data[:8]), self.assertRaises(ValueError):
                self.import_file(data)
        self.assertFalse(self.library.all())

    def test_bad_signature_and_pointer(self):
        for field in [0, 64, 60]:
            data = bytearray(pe()); data[field:field+4] = b'\xff'*4
            with self.subTest(field=field), self.assertRaises(ValueError): self.import_file(data)

    def test_import_hash_entries_and_removal(self):
        app = self.import_file(pe())
        self.assertEqual(len(app['sha256']), 64)
        entry = self.library.entries(app['id'])[0]
        self.assertEqual(self.library.executable(app['id'], entry['path']).read_bytes(), pe())
        self.assertEqual(self.library.all()[0]['id'], app['id'])
        self.library.delete(app['id']); self.assertFalse(self.library.all())

    def test_zip_sidecar_files(self):
        app = self.import_file(archive([('Portable/app.exe', pe()), ('Portable/data/a.txt', b'ok')]), 'app.zip')
        self.assertEqual(len(app['entries']), 1)
        self.assertEqual((self.library.drive(app['id'])/'Aster/Package/Portable/data/a.txt').read_bytes(), b'ok')

    def test_zip_traversal_duplicate_and_symlink(self):
        for name in ['../escape.exe', '/escape.exe', 'C:/escape.exe', 'a\\b.exe']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.import_file(archive([(name, pe())]), 'bad.zip')
        with self.assertRaises(ValueError):
            self.import_file(archive([('a.exe', pe()), ('A.EXE', pe())]), 'bad.zip')
        link = zipfile.ZipInfo('link.exe'); link.create_system = 3; link.external_attr = 0o120777 << 16
        with self.assertRaises(ValueError): self.import_file(archive([(link, b'/etc/passwd')]), 'bad.zip')
        self.assertFalse(self.library.all())

    def test_safe_paths_and_ids(self):
        for path in ['../x', '/etc/passwd', 'C:/x', 'a\\b', '\x00']:
            with self.subTest(path=path), self.assertRaises(ValueError): safe_path(self.root, path)
        (self.root/'link').symlink_to('/tmp')
        with self.assertRaises(ValueError): safe_path(self.root, 'link/file')
        for app_id in ['../', 'a'*31, 'g'*32]:
            with self.assertRaises(ValueError): self.library.directory(app_id)

    def test_zip_budgets_and_no_executable(self):
        with patch('bridge.storage.MAX_EXPANDED', 128), self.assertRaises(ValueError):
            self.import_file(archive([('app.exe', pe())]), 'large.zip')
        with patch('bridge.storage.MAX_FILES', 1), self.assertRaises(ValueError):
            self.import_file(archive([('app.exe', pe()), ('a.txt', b'a')]), 'many.zip')
        with self.assertRaises(ValueError): self.import_file(archive([('readme.txt', b'hi')]), 'empty.zip')

    def test_symlinked_download_rejected(self):
        app = self.import_file(pe())
        (self.library.drive(app['id'])/'link.txt').symlink_to('/etc/passwd')
        with self.assertRaises(ValueError): safe_path(self.library.drive(app['id']), 'link.txt')

    def test_unsafe_configuration(self):
        for url in ['http://example.com', 'https://user:secret@example.com', 'https://example.com/path', 'file:///tmp']:
            with self.assertRaises(ValueError): origin(url)
        self.assertEqual(origin('https://example.com/'), 'https://example.com')
        with self.assertRaises(ValueError): Config(self.root, 'short')


class APITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.token = 'test-token-'+'a'*40
        self.origin = 'http://localhost:8787'
        self.app = create_app(Config(Path(self.tmp.name)/'private', self.token))
        self.bridge = self.app[BRIDGE_KEY]
        self.client = TestClient(TestServer(self.app)); await self.client.start_server()
        self.headers = {'Host':'localhost:8787', 'Origin':self.origin, 'Authorization':'Bearer '+self.token}
        self.addAsyncCleanup(self.client.close)

    async def request(self, method, path, **kwargs):
        return await self.client.request(method, path, headers=kwargs.pop('headers', self.headers), **kwargs)

    async def upload(self):
        headers = {**self.headers, 'X-Aster-Consent':'run-trusted-windows-code', 'X-Aster-Filename':'test.exe'}
        response = await self.request('POST', '/api/apps', headers=headers, data=pe())
        self.assertEqual(response.status, 201, await response.text())
        return await response.json()

    async def test_auth_host_origin_and_no_store(self):
        for headers, status in [({'Host':'localhost:8787'},401),
                ({**self.headers,'Origin':'https://attacker.example'},403),
                ({**self.headers,'Host':'attacker.example'},403),
                ({**self.headers,'Authorization':'Bearer wrong'},401)]:
            self.assertEqual((await self.request('GET', '/api/apps', headers=headers)).status, status)
        response = await self.request('GET', '/api/apps')
        self.assertEqual(response.status,200)
        self.assertEqual(response.headers['Cache-Control'],'no-store')
        self.assertEqual(response.headers['Access-Control-Allow-Origin'],self.origin)

    async def test_consent_and_bad_methods(self):
        self.assertEqual((await self.request('POST','/api/apps',data=pe())).status,400)
        app = await self.upload()
        response = await self.request('POST','/api/sessions',json={'app_id':app['id'],'entry':app['entries'][0]['path']})
        self.assertEqual(response.status,400)
        for path in ['/api/apps','/api/sessions']:
            self.assertEqual((await self.request('PUT',path)).status,405)
        self.assertFalse(self.bridge.runtime.sessions)

    async def test_missing_runtime_is_not_fake_success(self):
        with patch('bridge.runtime.find_wine', return_value=None):
            info = await (await self.request('GET','/api/capabilities')).json()
            self.assertFalse(info['ready']); self.assertIn('wine',info['missing'])

    async def test_files_private_routes_and_traversal(self):
        app = await self.upload(); app_id = app['id']
        response = await self.request('GET',f'/api/apps/{app_id}/files',params={'path':app['entries'][0]['path'],'download':'1'})
        self.assertEqual(await response.read(),pe())
        self.assertEqual(response.headers['Content-Disposition'],'attachment')
        for path in ['/bridge/server.py','/.git/config','/pairing-token','/README.md']:
            self.assertEqual((await self.request('GET',path)).status,404)
        response = await self.request('GET',f'/api/apps/{app_id}/files',params={'path':'../../etc/passwd','download':'1'})
        self.assertEqual(response.status,400)

    async def test_malformed_zip_rollback(self):
        headers = {**self.headers,'X-Aster-Consent':'run-trusted-windows-code','X-Aster-Filename':'bad.zip'}
        response = await self.request('POST','/api/apps',headers=headers,data=b'not zip')
        self.assertEqual(response.status,400)
        self.assertFalse(list(Path(self.tmp.name).rglob('upload-*')))

    async def test_tickets_and_binary_transport(self):
        async def echo(reader,writer):
            try:
                writer.write(b'RFB 003.008\n');await writer.drain()
                while data := await reader.read(4096): writer.write(data);await writer.drain()
            finally: writer.close();await writer.wait_closed()
        server = await asyncio.start_server(echo,'127.0.0.1',0);self.addCleanup(server.close)
        session = Session('b'*32,'a'*32,'test.exe',800,600,status='running',port=server.sockets[0].getsockname()[1])
        self.bridge.runtime.sessions[session.id]=session
        path = '/stream/'+session.id
        async def ticket():
            response = await self.request('POST','/api/sessions/'+session.id+'/ticket',json={})
            self.assertEqual(response.status,200);return (await response.json())['ticket']
        secret = await ticket();self.assertNotIn(self.token,secret)
        with self.assertRaises(WSServerHandshakeError):
            await self.client.ws_connect(path,headers={**self.headers,'Origin':'https://attacker.example'},protocols=['binary','aster-ticket.'+secret])
        ws = await self.client.ws_connect(path,headers=self.headers,protocols=['binary','aster-ticket.'+secret])
        self.assertEqual((await ws.receive()).data,b'RFB 003.008\n')
        await ws.send_bytes(b'test input');self.assertEqual((await ws.receive()).data,b'test input')
        self.assertGreater(session.bytes_out,0)
        with self.assertRaises(WSServerHandshakeError):
            await self.client.ws_connect(path,headers=self.headers,protocols=['binary','aster-ticket.'+secret])
        expired = await ticket();self.bridge.tickets[expired]=(session.id,time.monotonic()-1)
        with self.assertRaises(WSServerHandshakeError):
            await self.client.ws_connect(path,headers=self.headers,protocols=['binary','aster-ticket.'+expired])
        await ws.close()

    async def test_unknown_idle_and_idempotent_stop(self):
        self.assertEqual((await self.request('DELETE','/api/sessions/'+'0'*32)).status,404)
        session=Session('c'*32,'a'*32,'test.exe',800,600,status='running',last_seen=time.monotonic()-1000)
        self.bridge.runtime.sessions[session.id]=session
        await self.bridge.runtime.reap();self.assertEqual(session.status,'stopped')
        await self.bridge.runtime.stop(session.id)

if __name__=='__main__': unittest.main(verbosity=2)
