# VidhyaLabs pre-launch signup

A responsive landing page and a Flask form that stores pre-launch signups in SQLite.
The supplied VidhyaLabs logo and service photos are stored locally under `public/static/images`.

## Run locally

1. Create and activate a virtual environment.
2. Install dependencies: `pip install -r requirements.txt`
3. Start the site: `python app.py`
4. Open <http://127.0.0.1:5000>.

The SQLite database (`vidhyalabs.db`) is created automatically beside `app.py`.
Set `VIDHYALABS_DATABASE` to choose another database file and set
`FLASK_SECRET_KEY` to a long, random value before deployment. The built-in
secret-key fallback is intended only for local development; sessions will reset
when the app restarts.

## Admin dashboard

Set the `ADMIN_PASSWORD` environment variable to a strong, private password
before starting the app. Open `/admin` to sign in and view customer names,
addresses, phone numbers, email addresses, interests and signup times. The
dashboard is disabled until a password is configured. Use HTTPS in production;
set `SESSION_COOKIE_SECURE=1` when serving the app over HTTPS.

## Deploy to Vercel

This app uses Vercel's Flask/Python runtime and Neon Postgres in production.
The SQLite database is for local development only; the Vercel runtime is
configured to refuse startup without `DATABASE_URL`, `FLASK_SECRET_KEY` and
`ADMIN_PASSWORD`.

1. Create a Neon project and copy its pooled PostgreSQL connection string. Keep
   the `sslmode=require` parameter in the connection string.
2. Import this project into Vercel and add these environment variables for the
   Production (and Preview, if needed) environment:
   - `DATABASE_URL`: Neon connection string.
   - `FLASK_SECRET_KEY`: a long random secret, unique to this deployment.
   - `ADMIN_PASSWORD`: a strong, private admin password.
   - `SESSION_COOKIE_SECURE`: `1`.
3. Deploy from the Vercel dashboard, or run `npx vercel --prod` after linking the
   project with the Vercel CLI.
4. Sign in at `/admin` to view customer registrations.

Vercel serves the files under `public/static` as static assets. Set the same
environment variables in Vercel before deploying; do not commit database URLs
or secrets to source control.

Each signup stores a name, address, phone number, email, selected interests and
UTC submission time. Keep the database private and back it up securely. Before
launching publicly, deploy behind HTTPS and publish an appropriate privacy
notice/contact address.
