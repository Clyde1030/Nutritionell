# Nutritionell Web (web_new)

Next.js frontend for Nutritionell. Profile, Goals, Scan, and Plan all call the
real FastAPI backend (see [Application/backend](../backend)) directly from the
browser — this app has no database or AI keys of its own for those flows.
Greenwashing, the "Nutritional Vector Recommender" toggle on the Scan results
page, and Ingredient Analytics are still mocked in this app's own Next.js API
routes (`src/app/api/{greenwashing,recommender,ingredient-intel}/route.ts`) —
there's no backend endpoint for them yet.

## Prerequisites

- Node 18.17+ and npm (Next.js 14 requirement)
- The backend running locally and reachable — see
  [Application/backend/README.md](../backend/README.md). Profile/Goals/Scan/Plan
  will show a "cannot reach backend" state until it's up.

## 1. Install

```bash
cd Application/web_new
npm install
```

## 2. Configure environment

Create a **file** at `Application/web_new/.env.local` (gitignored) containing
the line below — this is a file to save, not a command to run in the shell:

```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

This is the only required variable — it's the base URL the frontend calls for
every backend request (`src/lib/api.ts`). Point it at a deployed backend URL
instead of `localhost:8000` when testing against a non-local environment.

`USDA_API_KEY` is optional and only used by the still-mocked
`ingredient-intel` route; leave it unset to run the directory in its empty
"no data" state.

## 3. Start the backend

From the **repo root**:

```bash
docker compose up -d postgres
```

From `Application/backend`:

```bash
source .venv/bin/activate   # after the one-time `python3 -m venv .venv && pip install -r requirements.txt`
bash scripts/setup_db.sh
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Confirm it's actually up before moving on:

```bash
curl http://localhost:8000/health         # {"status":"ok"}
curl http://localhost:8000/health/model   # confirms the YOLO model loaded
```

If `uvicorn` fails with `[Errno 48] Address already in use`, something is
already listening on 8000 — often a backend from a previous session that
never got stopped. Find and kill it, then retry:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN   # note the PID
kill <PID>
```

Same idea for `npm run dev` failing on port 3000 (`lsof -nP -iTCP:3000 -sTCP:LISTEN`).

## 4. Start the web app

```bash
cd Application/web_new
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing locally

### Type-check and build (no backend required)

```bash
npx tsc --noEmit
npm run build
```

This is what CI-equivalent verification looks like today — there's no test
runner configured for this app yet, so a clean `tsc`/`build` is the baseline
signal that nothing is broken.

### Backend contract sanity checks (no browser required)

Confirms the exact endpoints the frontend calls are live and shaped as
expected — useful before a manual pass, or in place of one if you can't drive
a browser:

```bash
curl http://localhost:8000/api/profile/options   # ProfileTab on mount

curl -X POST http://localhost:8000/api/profile \
  -H "Content-Type: application/json" \
  -d '{"dietary_philosophy": "Vegan"}'            # ProfileTab save -> note the returned "id"

curl -X POST http://localhost:8000/api/profile/nutrition-plan \
  -H "Content-Type: application/json" \
  -d '{"profile_id": "<id from above>"}'          # PlanTab generate
```

Also run the backend's own suite (see
[Application/backend/README.md](../backend/README.md#testing-locally)):

```bash
cd Application/backend && pytest tests/ -v
```

### Manual smoke test (full golden path, in a browser)

With both servers running from steps 3–4. **Every feature now requires an
account** — only Home and Contact Us work signed out.

1. **Signed out** — open `/` in a fresh session (or clear the
   `nutritionell_auth_token` localStorage key). Home and Contact Us render
   normally; every other nav item is dimmed and clicking it opens the login
   modal *instead of navigating*, leaving you on Home. Same for a direct deep
   link like `/scan` — it deliberately does not redirect to `/`, so you land on
   the tab you asked for once you sign in.
2. **Create an account** — use the hero CTA ("Create your free account") or the
   header "Log In" → "Create an account". On success the modal closes, the
   header shows your email, and you land on whatever tab you were headed to.

   > **Approval gate:** a brand-new account is *pending* until an admin approves
   > it. You'll see "Your account is pending approval" on the gated tabs rather
   > than the real content — that's correct, not a bug. Approve yourself with the
   > admin API (see *Admin approval (temporary)* in the backend README), then
   > reload: everything unlocks on the existing session, no need to sign in again.
3. **Profile tab** — confirm the philosophy/allergy/ingredient lists load live
   from `/api/profile/options`, fill in a profile, save. There is no profile id
   anywhere client-side any more: the backend resolves the profile from your
   bearer token, so `/api/profile/me` is the only route involved.
4. **Goals tab** — add a goal, save, **reload the page**, confirm it's still
   there. This is the important one: it proves the session was restored from
   `localStorage` via `GET /api/auth/me` *and* that the data round-tripped
   through the backend under your account, not local state.
5. **Scan tab** — upload a grocery shelf photo (or use
   `Application/backend/app/assets/sample_shelf.jpg`). This calls the real
   YOLO + Gemini pipeline and needs `GEMINI_API_KEY` set in
   `Application/backend/.env`. For fast iteration without spending Gemini
   tokens, flip `USE_MOCK_ANALYZE` to `true` in `src/lib/api.ts` to hit
   `/api/analyze/mock` instead (4 canned products) — note the mock route
   requires auth too, so it exercises the same contract as the real one.
6. **Plan tab** — generate a plan; should return real, profile-specific
   content (also needs `GEMINI_API_KEY`). The request has no body — the plan is
   built from whoever holds the token.
7. **Log out** — account menu (your email, top right) → "Log out". Gated tabs
   are blocked again, Home and Contact Us still work, and the stored token is
   gone.

**Password reset** needs the *deployed* backend: SES only sends from there, and
sending is additionally blocked until the SES sandbox exit in
`infra/AWS_SETUP_LOGIN_FEATURE.md` is approved. Locally you can still exercise
the last half of the flow by hitting `POST /api/auth/forgot-password`, reading
the token out of the backend's logs, and opening
`http://localhost:3000/?reset_token=<token>` — the modal opens straight into the
"choose a new password" step and strips the token from the URL afterwards.

Open the browser's network tab during all of the above — every request should
hit `localhost:8000` with an `Authorization: Bearer …` header, not this app's own
`/api/*` routes (except Greenwashing/Recommender/Ingredient Analytics, which are
expected to stay local/mocked for now).

## Shutting down / cleanup

1. **Frontend** — `Ctrl+C` in the terminal running `npm run dev`. If it was
   backgrounded and you lost the terminal:
   ```bash
   lsof -nP -iTCP:3000 -sTCP:LISTEN   # note the PID
   kill <PID>
   ```
2. **Backend** — `Ctrl+C` in the terminal running `uvicorn` (same
   `lsof -nP -iTCP:8000 -sTCP:LISTEN` + `kill <PID>` fallback if backgrounded),
   then `deactivate` to leave the Python venv.
3. **Database** — from the repo root:
   ```bash
   docker compose stop postgres
   ```
   Stops the container but keeps the `nutritionell_pg_data` volume, so your
   profiles/USDA data are still there next time you `docker compose up -d
   postgres` — this is the right choice for day-to-day shutdown.

   `docker compose down` also works and additionally removes the container
   (still keeps the named volume). Only add `-v` (`docker compose down -v`)
   if you actually want to wipe the database — you'll need to rerun
   `bash scripts/setup_db.sh` afterward to use it again.

## Production build

```bash
npm run build
npm run start
```

Set `NEXT_PUBLIC_API_URL` to the deployed backend's URL before building —
it's inlined at build time, not read at runtime.
