# Public demonstration behind a path prefix

The Polza Agency landing page is `/openmetrika`. The actual read-only application
is `/openmetrika-demo/`, proxied to a separate container. The proxy strips the
prefix before forwarding requests; no analytics API is mounted into the site's
own `/api` namespace.

```sh
docker build --build-arg OPENMETRIKA_BASE_PATH=/openmetrika-demo/ -t openmetrika:demo .
docker run --read-only --tmpfs /tmp:size=256m,mode=1777 \
  -e DEMO_HOST=0.0.0.0 -e DEMO_PORT=3015 -e DEMO_READ_ONLY=1 \
  openmetrika:demo node scripts/demo.mjs
```

Publish only through your existing HTTPS reverse proxy on a private Docker
network. No external container port, production database, API token, amoCRM
credential or persistent data volume is needed. Do not pass the marketing site's
`.env` to this container. Deploy the demo with a memory limit and dropped Linux
capabilities, as in the Polza site Compose configuration.

Vite's `OPENMETRIKA_BASE_PATH` includes leading/trailing slashes and is a build-time
setting. It controls JS/CSS, report API requests and CSV exports. With no setting,
the self-hosted root deployment continues to use `/`.

`DEMO_READ_ONLY=1` blocks POST, PATCH, DELETE and other write methods globally,
including collection endpoints. OAuth is disabled, reports are automatically
available through the fictional demo owner, and data is recreated on container
restart. Recordings and snapshots contain only synthetic examples. Public users
cannot connect real sites or upload data.

Local editable demos remain loopback-only by default (`npm run demo`).
