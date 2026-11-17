# VidhyaLabs setup

## 1. Backend and database (Vercel + Postgres, about 5 minutes)
The API lives in `api/index.js` and stores everything in a Postgres database. The website, app, admin, driver and store pages already call it at `/api`.
1. Vercel dashboard > your project > **Storage** > **Create Database** > **Neon (Postgres)** > create it and **connect it to this project** (all environments). Vercel adds `DATABASE_URL` automatically.
2. Project **Settings > Environment Variables** > add `ADMIN_KEY` = your admin password (use a long one; mark it Sensitive). `ADMIN_PASSWORD` also works if it is already set. Apply to Production, Preview and Development.
3. **Deployments > latest > Redeploy** so the new variables take effect. The tables are created automatically on the first request.
4. Check `https://vidhyalabs.com/api?db=1`. It should show `"database":"connected"` and `"admin":"configured"`.
5. Open `https://vidhyalabs.com/admin.html` and sign in with `ADMIN_KEY`.

Notes:
- Data is stored in these tables: `orders`, `messages`, `waitlist`, `drivers`, `stores` (plus `rl` for login lockouts). The schema is in `db/schema.sql`. You can browse and export the data in Vercel > Storage > your database > Open in Neon (SQL editor, CSV export).
- Run the tests with `npm install && npm test` (uses an in-memory Postgres).
- `backend/Code.gs` is the older Google Apps Script version. It is no longer used.

## 2. What the admin page does
- **Orders:** new orders are highlighted. Tap a status (Placed, Confirmed, Out for delivery, Delivered, Cancelled). Customers see the status in their app within about a minute.
- **Messages:** read customer messages and reply. Replies show up in the customer's app.
- **Waitlist:** website signups, with a Copy as CSV button.
- The page refreshes every 30 seconds. It is not linked from the site and tells search engines not to index it. Keep the URL and password private.

## 3. Stores and delivery drivers
Three more pages work once the database is connected:
- `partner.html` is public ("Partner with us" in the site menu). Store owners apply here.
- `admin.html > Stores`: approve or reject applications. Approving shows a PIN **once**; share it privately. Use Reset PIN if it is lost, Suspend to block a store.
- `admin.html > Drivers`: add a driver (name and phone); a PIN is shown **once**. Use Reset PIN or Deactivate when needed.
- `admin.html > Orders`: pick a **Store** and a **Driver** for each order, then set the status. Flow: Placed > Confirmed > Ready for pickup (store taps it) > Out for delivery > Delivered (driver taps these). Customers see the status in their app.
- `store.html`: approved stores sign in with their phone and PIN. They see only their assigned orders (items and delivery area, not the customer's name, phone or address) and mark them ready for pickup.
- `driver.html`: drivers sign in with phone and PIN. They see only their assigned orders with the customer's name, address and phone, the cash to collect, and buttons to start delivery and mark delivered.
- Five wrong PIN attempts lock that phone number for 15 minutes. Do not link `driver.html`, `store.html` or `admin.html` publicly; give the addresses only to the people who need them.

## 4. Before going live
- The site is served over HTTPS by Vercel, so the app can be installed to the home screen.
- All ordering and messaging happens inside the app; WhatsApp is not used anywhere.
- Fill the [bracketed] items in `legal.html`.

Until the database is connected (section 1), `/api` answers "database not connected", orders stay on the customer's phone and the admin page cannot sign in.
