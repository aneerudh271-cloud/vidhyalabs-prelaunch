# VidhyaLabs

Your everyday needs. One platform. Hyperlocal website + installable app (PWA) for Bhopal (Indus Town, Krishnapuram, Radhapuram).

## Structure
- `index.html` – marketing website
- `app.html`, `app.js` – customer PWA
- `admin.html`, `driver.html`, `store.html`, `partner.html` – ops panels (noindex)
- `data.js` – config + catalog (edit `formEndpoint`, `email` here)
- `backend/Code.gs` – Google Apps Script backend (see `SETUP.md`)
- `legal.html` – privacy/terms draft (fill the [brackets])

## Deploy
Static site, no build step. Publish the repo root on Vercel (Framework: Other) or Netlify.

## Before launch
1. Deploy the backend per `SETUP.md`, paste the web app URL into `formEndpoint` in `data.js`.
2. Set the real contact email in `data.js`.
3. Fill the `[bracketed]` gaps in `legal.html`.
4. Verify produce prices; add prices for unpriced groceries.
