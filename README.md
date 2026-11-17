# VidhyaLabs

Your everyday needs. One platform. Hyperlocal website + installable app (PWA) for Bhopal (Indus Town, Krishnapuram, Radhapuram).

## Structure
- `index.html` – marketing website
- `app.html`, `app.js` – customer PWA
- `admin.html`, `driver.html`, `store.html`, `partner.html` – ops panels (noindex)
- `data.js` – config + catalog (edit `formEndpoint`, `email` here)
- `api/index.js`, `lib/` – Vercel serverless API on Postgres (see `SETUP.md`); `db/schema.sql` – tables; `test/` – backend tests
- `backend/Code.gs` – old Google Apps Script backend (unused)
- `legal.html` – privacy/terms draft (fill the [brackets])

## Deploy
Static site, no build step. Publish the repo root on Vercel (Framework: Other) or Netlify.

## Before launch
1. Add a Neon Postgres database in Vercel Storage and set `ADMIN_KEY` (see `SETUP.md` section 1).
2. Set the real contact email in `data.js`.
3. Fill the `[bracketed]` gaps in `legal.html`.
4. Verify produce prices; add prices for unpriced groceries.
