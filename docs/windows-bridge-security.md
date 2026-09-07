# Windows Bridge security boundary

**For one trusted owner running trusted native applications. Not a multi-tenant service or malware sandbox.** Wine prefixes separate application state, not operating-system privileges. Native code has the companion user's authority, may read/modify accessible files and memory, access networks and interfere with other applications. A private HOME and removal of Wine's default Z: host mapping are conveniences, not a hostile-code boundary.

## Browser/API protections

The CLI refuses root and binds to loopback by default. Remote origins require HTTPS. A generated 256-bit token is kept in a private file (0600) and authenticated via a Bearer header with constant-time comparison. Access logging is disabled. The token never appears in URLs, normal browser storage, Aster settings/backups or iframe parameters.

Exact Host validation reduces DNS-rebinding exposure. CORS, Origin and frame-ancestor policies allow only configured origins, with no wildcard or opaque/null origin. The trusted viewer receives only a 30-second single-use session-bound ticket in a validated postMessage; it puts that ticket in the WebSocket subprotocol header, not a query string. Raw VNC listens only on loopback and cannot proxy arbitrary addresses. On a shared native host, other local users may reach raw loopback RFB; use a dedicated container/VM rather than sharing that host.

Imports and launches require explicit native-code consent. The API does not accept shell commands, executable arguments or arbitrary host paths. PE validation rejects unsupported architectures/DLLs/drivers; **it is not malware or authenticity verification**. Archive processing bounds sizes/counts and rejects traversal, absolute paths, symlinks, special/encrypted entries and duplicate case-colliding paths. Download traversal and symlinks are rejected.

Native files are authenticated downloads, never directly executable website content. Static routes expose only public Aster runtime files, the trusted viewer and installed noVNC assets, not private data, `.git`, source secrets or directory listings. Responses are no-store. The service worker caches only an explicit public-asset allowlist and excludes Authorization-bearing requests, API calls, native downloads and tickets.

Clipboard transfer is explicit. Remote clipboard data is not automatically written into the user's clipboard. Messages validate both source window and exact origin. Session/resolution/viewer/ticket limits, binary message bounds, awaited writes and disconnected-session expiry limit accidental resource use; they do not impose a native-code CPU/disk sandbox. Stop terminates the whole prefix and managed process groups.

## Operator responsibilities

Use a dedicated unprivileged account or the supplied non-root container with no valuable host mounts. Protect and back up the data volume; monitor disk capacity. The container drops capabilities, makes its root filesystem read-only and sets resource limits, but still permits outbound networking and is not a guarantee against hostile code. Use an isolated disposable VM for untrusted programs.

Protect the startup log containing the token; `--rotate-token` replaces it on restart. Provide a trusted TLS certificate, network restrictions and explicit origin allowlists for remote use. A reverse proxy must preserve Host and WebSocket upgrades without recording Authorization or ticket headers. Anyone controlling the paired desktop origin can act with the paired owner's authority. Only pair with a desktop deployment you trust.

Public `/api/health` and `/api/config` disclose protocol identification and allowed parent origins, not applications, session details, credentials or files. They still enforce Host/Origin policy. There is no arbitrary URL-fetching or installer-download service.

Unit tests cover API/storage/transport authorization gates. Native integration separately proves actual Windows execution. Neither suite is an adversarial audit of Wine, noVNC, X11, native code isolation or public multi-user hosting.
