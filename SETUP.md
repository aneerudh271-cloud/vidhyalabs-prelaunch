# VidhyaLabs setup

## 1. Backend for orders, messages, signups and the admin page (about 5 minutes, free)
1. Create a new Google Sheet (any name).
2. In the Sheet: **Extensions > Apps Script**. Delete the sample code and paste the contents of `backend/Code.gs`.
3. **Project Settings (gear icon) > Script properties > Add property**: name `ADMIN_KEY`, value = your admin password (use a long one).
4. **Deploy > New deployment > type: Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and allow access.
5. Copy the **Web app URL** and paste it into `data.js` as `formEndpoint`.
6. Upload the folder to your host again. Open `yoursite/admin.html` and sign in with your admin password.

Orders, messages and signups appear as tabs in the Sheet too. After you change `Code.gs`, use Deploy > Manage deployments > Edit > New version.

## 2. What the admin page does
- **Orders:** new orders are highlighted. Tap a status (Placed, Confirmed, Out for delivery, Delivered, Cancelled). Customers see the status in their app within about a minute.
- **Messages:** read customer messages and reply. Replies show up in the customer's app.
- **Waitlist:** website signups, with a Copy as CSV button.
- The page refreshes every 30 seconds. It is not linked from the site and tells search engines not to index it. Keep the URL and password private.

## 3. Stores and delivery drivers
Three more pages work once the backend is connected:
- `partner.html` is public ("Partner with us" in the site menu). Store owners apply here.
- `admin.html > Stores`: approve or reject applications. Approving shows a PIN **once**; share it privately. Use Reset PIN if it is lost, Suspend to block a store.
- `admin.html > Drivers`: add a driver (name and phone); a PIN is shown **once**. Use Reset PIN or Deactivate when needed.
- `admin.html > Orders`: pick a **Store** and a **Driver** for each order, then set the status. Flow: Placed > Confirmed > Ready for pickup (store taps it) > Out for delivery > Delivered (driver taps these). Customers see the status in their app.
- `store.html`: approved stores sign in with their phone and PIN. They see only their assigned orders (items and delivery area, not the customer's name, phone or address) and mark them ready for pickup.
- `driver.html`: drivers sign in with phone and PIN. They see only their assigned orders with the customer's name, address and phone, the cash to collect, and buttons to start delivery and mark delivered.
- Five wrong PIN attempts lock that phone number for 15 minutes. Do not link `driver.html`, `store.html` or `admin.html` publicly; give the addresses only to the people who need them.
- After updating `Code.gs`, redeploy it: Deploy > Manage deployments > Edit > New version.

## 4. Before going live
- Host over HTTPS (Netlify Drop, Cloudflare Pages) so the app can be installed to the home screen.
- All ordering and messaging happens inside the app; WhatsApp is not used anywhere.
- Fill the [bracketed] items in `legal.html`.

Without step 1, the app still works but orders and messages stay on the customer's phone, and admin.html runs in demo mode showing only data saved in that browser.
