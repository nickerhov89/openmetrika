# Security

Report vulnerabilities privately to the repository owner through GitHub security
advisories. Do not attach real recordings, API keys or personal event data to issues.

## Deployment

- Keep first-run setup private until you have created the owner account.
- Bind the app to loopback or a private network; use an HTTPS reverse proxy.
- Set `COOKIE_SECURE=1` and `PUBLIC_ORIGIN` to the dashboard HTTPS origin.
- Keep `.env`, `data/`, backups and deployment credentials out of Git.
- `DEMO_MODE=1` grants automatic demo-owner access. Use it locally; an externally
  reachable demo must use `DEMO_READ_ONLY=1` and separate disposable storage.
- Back up outside the host. Test restore before relying on the backup.
- The application rate limiter is per process and uses the direct peer IP.
  Configure perimeter request/body limits for public counters and login endpoints.
  Do not blindly trust client-supplied forwarded IP headers.

## Controls

Scrypt password hashes with random salts; opaque hashed expiring sessions; HttpOnly
SameSite cookies; Origin/content-type mutation checks; site access checks on every
report and recording; read-only site-scoped hashed API keys; parameterized SQLite;
body, batch, recording and retention limits; first-party tracker; input masking;
privacy exclusion classes; CSP, no sniffing, private API cache headers and CSV
formula escaping. No IP address is stored in analytics tables.

The domain allowlist and CORS reduce accidental misuse; they are **not proof that
an event is authentic**. Any public analytics counter can receive fabricated events
from an attacker able to forge HTTP headers. Protect high-value business events
with your own server-side checks and perimeter abuse controls. Never treat this
browser counter as a billing ledger.

Session recording may include page text, image URLs and DOM attributes. Input masking
does not automatically remove every personal detail from a page. Mark private content
with `om-block` / `data-om-private`, mask text with `om-mask`, use consent mode and
disable recording for account, checkout and other sensitive routes as appropriate.
Do not put personal information into UTM tags or custom event properties.

No remote URL-fetching proxy is provided. rrweb replay disables scripts. A report
viewer can access all recordings on a counter they can view; use separate counters
for different organizations. Editor access manages goals/funnels but not ownership,
membership, API keys, retention deletion or site settings.

SQLite/Node 24's built-in SQLite API is marked experimental by Node. Pin runtime
versions and keep verified backups across upgrades. This release is single-node;
it has no distributed abuse limiter, SSO or external security audit.
