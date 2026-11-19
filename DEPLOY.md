# Deploying Streakly

Everything here is verified against the code in this repo as of the
audit-hardening PRs (#75-#80). If a step disagrees with the code, the code
wins — fix this file in the same PR.

Two images, one database:

| Piece | Image | Runs | Talks to |
| --- | --- | --- | --- |
| api | `apps/api/Dockerfile` | Hono on Bun, owns the database | Postgres, Resend |
| web | `apps/web/Dockerfile` | Next standalone server | the api over the internal network |

The website owns no data. It proxies `/api/*` to the api, so there is one
public origin and no CORS surface. Keep it that way.

---

## 1. Pick a host

What the deployment actually needs:

- **Two containers in one private network.** The web image reaches the api by
  service name (`http://api:4000`), so the platform must give them a shared
  network and internal DNS. Railway, Fly, Render and a single Docker host all
  do. A static site host does not.
- **A managed Postgres 16** reachable over TLS from the api. Docker compose
  locally uses 16-alpine; keep the major version the same or restore from a
  dump instead of relying on migration compatibility.
- **Edge IP header support.** Rate limits key on the visitor's IP, read from a
  header the edge overwrites. Railway: `x-real-ip`. Fly: `fly-client-ip`.
  Cloudflare in front of either: `cf-connecting-ip`. Verify it (step 6)
  rather than trusting the docs — Railway's `x-real-ip` has been reported to
  hold the edge's IP instead of the visitor's.
- **An in-memory rate limiter, one instance.** See "Known limits" below
  before you scale past one api container.

## 2. Set the environment

Copy `.env.example` to your platform's environment settings. The api's boot
guard (`apps/api/src/lib/env-guard.ts`) refuses to start outside development
and test unless all five of these are present and valid:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The managed database URL. `?sslmode=require` when the host requires TLS. |
| `BETTER_AUTH_SECRET` | 32+ characters, `openssl rand -base64 32`. Rotating it signs everyone out. |
| `BETTER_AUTH_URL` | **The website's public origin**, `https://your-domain`. Not the api's URL. It drives the origin check and the Secure cookie flag. |
| `RESEND_API_KEY` | The Resend key. Without it password reset emails silently never send. |
| `EMAIL_FROM` | `Streakly <hello@your-domain>`. The domain must be verified in Resend. |
| `CLIENT_IP_HEADER` | The edge's client-IP header. `none` only when there is no edge proxy. |

Optional: `BETTER_AUTH_TRUSTED_ORIGINS` (comma-separated; defaults to
`BETTER_AUTH_URL`), `PORT` (default 4000).

`API_PROXY_URL` belongs to the **web** image and is a **build** argument:
Next bakes the proxy target into `routes-manifest.json`, so setting it at
runtime does nothing. Rebuild the web image to change it.

The web container needs no secrets. It only serves pages and proxies.

## 3. Build and start

```sh
docker build -f apps/api/Dockerfile -t streakly-api .
docker build -f apps/web/Dockerfile --build-arg API_PROXY_URL=http://api:4000 -t streakly-web .
```

The api image runs `bunx prisma migrate deploy` before it serves. That
applies the committed migrations; it never edits the schema. It does **not**
regenerate the Prisma client — the image build already did that against the
same schema, so no extra step is needed in the image. Outside the image, a
`migrate deploy` without a following `prisma generate` leaves a stale client
and the first query fails with `SchemaMismatchError`.

Do not run `prisma db push` against production. It skips migrations, so the
next deploy has no history to replay.

## 4. First-boot checks

The api does not need a public URL. Keep it reachable only on the internal
network and let the website's proxy be the single public entry point.

```sh
curl -i https://your-domain/api/health            # 200 through the web proxy
```

If the api exits immediately, read the log: the boot guard names the missing
variable and the reason.

## 5. Sign-in round trip

```sh
curl -i -X POST https://your-domain/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://your-domain' \
  -d '{"email":"you@your-domain","password":"..."}'
```

Check the response's `set-cookie`: it must carry `Secure` and the `__Secure-`
prefix. Better Auth follows `BETTER_AUTH_URL`'s protocol for that flag, not
`NODE_ENV`, so an `http://` base URL in production means insecure cookies.
Sign-in without an `Origin` header returns 403 by design.

Then in the browser: sign in, create a goal, check in, reload. The check-in
must still be there, and the streak count must match the goal's history.

## 6. Verify the IP header (rate limits)

The api keys rate limits on `CLIENT_IP_HEADER`. If the edge sends its own IP
instead of the visitor's, every visitor shares one bucket and five wrong
passwords lock sign-in for everyone.

```sh
curl -i -X POST https://your-domain/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: https://your-domain' \
  -d '{"email":"nobody@example.com","password":"wrong"}'
```

Repeat six times from two different networks. Expected: six 401s, then 429
on the sixth attempt **per IP**, and a different network is not locked out.
If both networks get locked together, the header holds the edge's IP —
change `CLIENT_IP_HEADER` or add a proxy that appends the real one.

## 7. Security headers

```sh
curl -I https://your-domain/ | grep -Ei 'content-security|x-frame|strict-transport|referrer|permissions'
```

All six must be present. `script-src` must not contain `'unsafe-eval'` in a
production build. If `Content-Security-Policy` is missing, the web image was
built without the current `next.config.ts`.

## 8. Known limits before you invite users

- **Rate limiting is in-memory and per instance.** Buckets reset on restart
  and are not shared between containers. One api instance is fine; two means
  double the allowed attempts. Move to secondary storage (Redis) before
  scaling out.
- **The CSP allows `'unsafe-inline'` for scripts and styles**, because Next
  injects the RSC payload and the theme bootstrap inline. Nonces are a
  follow-up PR, not a config toggle.
- **Email verification is off.** Anyone can sign up with any address. This
  matters for the parked Google sign-in, not for password auth.
- **Goal routes are rate-limited per user in memory** (120 reads and 60
  writes a minute, `GOALS_READS_PER_MINUTE` / `GOALS_WRITES_PER_MINUTE` to
  change them). Same per-instance caveat as the auth limiter.
- **The auth rate limit resets on api restart.** When curl-testing, restart
  the api to clear a full bucket.

## 9. Rollback

Images are tagged per build; roll back by redeploying the previous tag. The
database is the hard part: migrations are forward-only. A rollback that
crosses a schema change needs a restored dump, so take one before the first
deploy of a schema-changing release:

```sh
pg_dump "$DATABASE_URL" > streakly-$(date +%F).sql
```

---

## Local production rehearsal

Same images, same headers, same proxy — on one machine:

```sh
docker compose --profile app up -d --build   # web on http://localhost:3100
```

`CLIENT_IP_HEADER=none` there, because nothing sets a client IP header. Every
visitor shares one bucket; that is expected locally and unacceptable in
production.
