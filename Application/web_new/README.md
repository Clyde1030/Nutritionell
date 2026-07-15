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

With both servers running from steps 3–4:

1. **Profile tab** — confirm the philosophy/allergy/ingredient lists actually
   load (they come live from `/api/profile/options`, not hardcoded data), fill
   in a profile, save. Button should read "Update Profile" on subsequent
   saves, confirming the profile id round-tripped and persisted
   (`localStorage` key `nutritionell_profile_id`).
2. **Goals tab** — add a goal, save, reload the page, confirm it's still
   there (proves it's reading/writing the backend, not just local state).
3. **Scan tab** — upload a grocery shelf photo (or use
   `Application/backend/app/assets/sample_shelf.jpg`). This calls the real
   YOLO + Gemini pipeline and needs `GEMINI_API_KEY` set in
   `Application/backend/.env`. For fast iteration without spending Gemini
   tokens, flip `USE_MOCK_ANALYZE` to `true` in `src/lib/api.ts` to hit
   `/api/analyze/mock` instead (4 canned products).
4. **Plan tab** — generate a plan; should return real, profile-specific
   content (also needs `GEMINI_API_KEY`).

Open the browser's network tab during all of the above — every request should
hit `localhost:8000`, not this app's own `/api/*` routes (except
Greenwashing/Recommender/Ingredient Analytics, which are expected to stay
local/mocked for now).

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
