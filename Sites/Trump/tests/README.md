# Trump test suites

Run against a server pointed at a **development** database — never production.

```bash
# start a dev server first, e.g.
DATABASE_URL="postgresql://…/emenyu_dev" TRUMP_MAINTENANCE_MODE=false \
  TRUMP_PORT=3099 TRUMP_HOST=127.0.0.1 node server.js

node tests/guest-experience.js    # no login / no cart / no chatbot, 14 locales, RTL, CJK
node tests/full-stack.js          # localized menu + engagement events reaching Postgres
node tests/content-admin.js       # owner media, translations and cut editing
node tests/perf-butchery.js       # tablet performance budget (4x CPU throttle)
```

Every suite accepts `TEST_BASE` (default `http://127.0.0.1:3099/Trump`), and
each cleans up whatever it creates, including its throwaway admin account.

`full-stack.js` and `content-admin.js` read the database directly: set
`DATABASE_URL`, and for `full-stack.js` a `PSQL` command and `PGPASSWORD`.

## What each one is actually protecting

| Suite | The regression it exists to catch |
|---|---|
| `guest-experience` | An ordering affordance, a chatbot or a login creeping back into the guest app; RTL or CJK breaking the layout |
| `full-stack` | Menu localization silently falling back to English; engagement events never reaching the database; PII appearing in the event table |
| `content-admin` | Unsafe media URLs being accepted; a blank translation blanking a dish instead of falling back; edits from one dish landing on another |
| `perf-butchery` | The cut animation dropping below ~30fps on the floor tablet, or the route's weight creeping up |
