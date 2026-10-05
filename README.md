# Grizzly Junk Removal: Leads, Jobs & True Profit

This app is built for running Grizzly Junk Removal from an iPhone. It books jobs, puts them on a calendar, works out route mileage, and tracks every cost on each job, so you can see the **true profit of every job** and of the business as a whole.

```
LEAD COMES IN → SOURCE → LEAD COST → CITY → ADDRESS → MILEAGE → DIESEL PRICE → FUEL COST
   → ESTIMATE → BOOK JOB → COMPLETE → DUMP + LABOR → TOTAL COST → REVENUE → PROFIT → MARGIN
```

**Total Job Cost = Lead + Fuel + Dump + Labor + Other.** Profit = Revenue − Total Job Cost, and Margin = Profit ÷ Revenue × 100. Fuel = Total Miles ÷ MPG (15 by default) × diesel price.

**Stack:** Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS 4, PostgreSQL, Drizzle ORM with SQL migrations, Zod validation, and JWT session cookies. Passwords are hashed with bcrypt.

> **Why Drizzle instead of Prisma?** Prisma needs native engine binaries that it downloads at install and migrate time. Drizzle is pure TypeScript and has no binaries. It still gives you a typed schema, separate related tables and versioned SQL migrations. It also deploys more simply: smaller serverless bundles and no binary-target problems.

---

## 1. Run it locally

You'll need **Node.js 20.9 or newer** and **PostgreSQL 14 or newer** (local, Docker, or a free hosted database).

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env
#   then fill in DATABASE_URL, AUTH_SECRET, APP_ENCRYPTION_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
#   (generate secrets with:  openssl rand -base64 48)

# 3. create tables + your owner login + default settings
npm run db:setup          # = db:migrate + db:bootstrap

# 4. (optional) load sample data to try everything
npm run db:seed-demo

# 5. start
npm run dev               # http://localhost:3000
```

Quick local Postgres with Docker:

```bash
docker run -d --name grizzly-db -p 5432:5432 -e POSTGRES_USER=grizzly -e POSTGRES_PASSWORD=grizzly -e POSTGRES_DB=grizzly postgres:16
# DATABASE_URL="postgresql://grizzly:grizzly@localhost:5432/grizzly"
```

**Use it on your iPhone while it runs on your computer:** run `npm run dev -- -H 0.0.0.0`, then on a phone on the same Wi-Fi open `http://<your-computer-IP>:3000`. For everyday use, deploy it (section 2) and use **Share → Add to Home Screen** in Safari. It then opens full-screen like an app.

### Tests

```bash
npm test            # 60 tests: profit math, time zones, validation, Google Maps/Calendar clients,
                    # plus DB integration tests for reports/marketing and calendar sync
                    # (those need TEST_DATABASE_URL pointing at an EMPTY database; it is wiped)
npm run test:e2e    # 34-step browser test of the full workflow against a running server
npm run typecheck
```

---

## 2. Deploy

The app is a standard Next.js server with a PostgreSQL database. Any of these work.

### Option A: Vercel + Neon (easiest, free tiers available)

1. Create a database at **neon.tech** (or Supabase) and copy the connection string. Add `?sslmode=require` to the end.
2. Push this folder to a private GitHub repo.
3. At **vercel.com**, choose **Add New → Project**, import the repo, and set these:
   - **Build Command:** `npm run db:migrate && npm run build` (this applies new migrations on every deploy)
   - **Environment Variables:** everything from section 3. Set `APP_URL` to your Vercel URL or custom domain, e.g. `https://app.grizzlyjunkremoval.com`.
4. Deploy. Then, **once**, create your login and default settings against the production database from your computer:
   ```bash
   DATABASE_URL="<production url>" ADMIN_EMAIL="you@…" ADMIN_PASSWORD="…" ADMIN_NAME="Daniel" npm run db:bootstrap
   ```
5. Optional: add your own domain in Vercel → Settings → Domains, then update `APP_URL`.

### Option B: Railway / Render (app and database in one place)

Create a PostgreSQL service and a web service from the repo. Set the env vars from section 3.
- Build: `npm ci && npm run build`
- Start: `npm run db:migrate && npm run start -- -p $PORT`

Then run `npm run db:bootstrap` once, using the service's shell or your computer with the production `DATABASE_URL`.

### Option C: Docker (any VPS)

```bash
docker build -t grizzly .
docker run -d -p 3000:3000 --env-file .env --name grizzly grizzly   # runs migrations on start
docker exec grizzly npm run db:bootstrap                            # first time only
```

Put it behind HTTPS (Caddy, Nginx, or Cloudflare). Login cookies are `Secure` in production.

**Backups:** all data lives in PostgreSQL, including receipt photos, which are resized on the phone to about 200–400 KB each. Turn on your host's automatic backups (Neon, Supabase, Railway and Render all offer them), or run `pg_dump` on a schedule.

---

## 3. Environment variables

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (add `?sslmode=require` for hosted databases) |
| `AUTH_SECRET` | ✅ | 32+ random characters; signs login sessions (`openssl rand -base64 48`) |
| `APP_ENCRYPTION_KEY` | ✅ | Random string; encrypts the Google Calendar token in the database (`openssl rand -base64 32`). Don't change it after connecting Google Calendar. |
| `APP_URL` | ✅ | Public URL without a trailing slash (`https://app.yourdomain.com`; locally `http://localhost:3000`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | first setup | Owner login created by `npm run db:bootstrap` (password: 10+ characters, letters and numbers) |
| `GOOGLE_MAPS_API_KEY` | for auto-mileage | Server-side Google Maps key (see section 4) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Calendar | Google OAuth client (see section 5) |
| `EIA_API_KEY` | optional | Fallback source for the current diesel price (free from eia.gov) |
| `DATABASE_SSL`, `DATABASE_POOL_MAX` | optional | Force SSL / pool size |
| `TEST_DATABASE_URL` | tests only | An empty database for integration tests (it gets wiped) |

No keys or secrets are hard-coded. API keys stay on the server: the browser talks to `/api/maps/*`, and the server calls Google.

---

## 4. Google Maps setup (address autocomplete and route mileage)

1. Go to **console.cloud.google.com** and create a project, e.g. "Grizzly".
2. **Billing:** link a billing account. Google gives a monthly free usage credit, and a one-truck business normally stays inside it.
3. **APIs & Services → Library**, and enable:
   - **Places API (New)** for address autocomplete as you type
   - **Routes API** for driving distance on each leg of a multi-stop route
   - **Geocoding API** as a fallback for address lookup
4. **APIs & Services → Credentials → Create credentials → API key**.
5. Restrict the key (click it):
   - **API restrictions:** limit it to the 3 APIs above.
   - **Application restrictions:** "None" or "IP addresses". It's a *server* key and never reaches the browser, so don't use "HTTP referrers".
6. Put it in `GOOGLE_MAPS_API_KEY` and restart or redeploy.
7. In the app, go to **Settings → Business** and pick your **business address** from the suggestions. Every route starts and ends there. Then add your dump facilities with addresses in **Settings → Dump Facilities**.

**Settings → Google Maps & Calendar** shows whether Maps is active. Without a key the app still works: you type leg miles or a total by hand.

**How mileage works:** the default route is *Business → Customer → Dump → Business*. On each job you can switch to *Business → Customer → Business*, add more customers or stops, reorder or remove stops, and the miles recalculate automatically. You can also **manually override** the total. When you complete the job you enter **actual miles**, e.g. from the odometer.

---

### Diesel price (automatic, with manual override)

The app shows **Current Diesel Price: $X.XX/gallon** on every new lead and job. The price is found in this order:

1. **Local stations.** It takes the median posted diesel price at gas stations within about 10 miles of your business address. This uses Google Places API (New) and your `GOOGLE_MAPS_API_KEY`, and needs no extra setup beyond Maps.
2. **Regional weekly average** from the U.S. Energy Information Administration (Lower Atlantic region, which includes Georgia). Get a free key at eia.gov/opendata and set `EIA_API_KEY`.
3. **Your manual price** in Settings → Vehicles, used if neither of the above is available.

Prices are looked up at most every 6 hours and each lookup is saved. On any job you can tap the price to **override** it, for example with what you actually paid; there's a field for that on Complete Job too. Every job **stores the diesel price it used**, so later price changes never alter past jobs. Turn automatic lookup off in Settings → Job Defaults & Mileage.

## 5. Google Calendar setup (optional)

1. In the same Google Cloud project, go to **APIs & Services → Library** and enable the **Google Calendar API**.
2. **OAuth consent screen:**
   - User type **External**, or **Internal** if you use Google Workspace.
   - App name "Grizzly Jobs", with your email.
   - Scopes: `.../auth/calendar.events`, `openid`, `email`.
   - Add yourself as a test user.
   - **Important:** once it works, click **Publish app** ("In production"). Apps left in *Testing* get tokens that expire after 7 days. An unverified app only shows a warning screen to you, which is fine for a single owner.
3. **Credentials → Create credentials → OAuth client ID**, type **Web application**.
   - **Authorized redirect URI:** `https://YOUR-APP-URL/api/google/calendar/callback`. It must match `APP_URL` exactly. For local testing also add `http://localhost:3000/api/google/calendar/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart or redeploy.
5. In the app, go to **Settings → Google Maps & Calendar → Connect Google Calendar** and approve.
   - Optional: paste a separate calendar's ID (Google Calendar → calendar settings → *Integrate calendar*) instead of `primary`.

**What syncs:**
- Jobs with a date and status *Estimate Scheduled, Scheduled, On The Way, In Progress* or *Completed* get an event titled **"Grizzly Junk Removal - Customer Name - $Price"**. The event includes customer, phone, address, quoted price, job type, notes and a link back to the job.
- Changing a job's date, time, price or details updates the event.
- Cancelling the job, marking it Not Booked, or deleting it removes the event.
- If Google is unreachable, the job still saves. The error appears at the bottom of the job page and the next save retries.

---

## 5b. Your logo

Put the official logo file at **`public/brand/logo.png`**. A PNG with a transparent background, about 1000 px wide, works best. It is used automatically on:

- the login screen and loading/splash screen
- the header, sidebar and navigation
- the browser tab icon (favicon), the app icon, and the iPhone home-screen icon (centered on black)

The logo is always scaled to fit (`object-contain`), never stretched. Until the file is added, a built-in green paw mark is shown. After adding the file, rebuild or redeploy so the icons regenerate.

## 6. Database

- Schema: `src/db/schema.ts`. Migrations (plain SQL): `drizzle/`.
- Tables:
  - `users`, `settings`, `vehicles`, `employees`, `lead_sources`, `dump_facilities`
  - `customers`, `jobs`, `job_route_stops`, `job_labor`, `dump_records`, `job_expenses`
  - `business_expenses`, `attachments`
- Money is stored as `NUMERIC(12,2)`, rates as `NUMERIC(10,4)`, and times as UTC. Calendar math uses the business time zone from Settings, America/New_York by default.

| Command | Purpose |
|---|---|
| `npm run db:migrate` | Apply pending migrations (safe in production) |
| `npm run db:bootstrap` | Create settings, default lead sources, the Sprinter vehicle, default workers, and the owner login (safe to re-run) |
| `npm run db:seed-demo` | Load sample customers, jobs and expenses (`-- --reset` wipes jobs, customers and expenses first; **never on real data**) |
| `npm run db:generate` | After editing `schema.ts`, generate a new migration |
| `npm run db:studio` | Browse the database in a web UI |
| `npm run user:create -- --email x@y.com --name "Name" --role OWNER` | Create a user or reset a password from the command line |

**Before real use:** if you loaded demo data, start clean. Either use a fresh database, or run `npm run db:seed-demo -- --reset` and delete the demo dump facilities and the "Marcus" worker in Settings.

---

## 7. Logging in

- Open the app and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your env file. Change the password right away in **Settings → My Account**.
- Sessions last 30 days, so you aren't logging in all day on the truck.
- 5 wrong passwords lock the account for 15 minutes.
- **Sign out on all devices** is in Settings → My Account.
- Add helpers in **Settings → Users**.
  - **Employee** logins can see and work jobs (status buttons, complete job, receipts). They can't see company finances, expenses, reports, marketing or settings.
  - **Admin** logins see everything except user management.
- Forgot your password? Run `npm run user:create -- --email you@… ` against the database to reset it.

---

## 8. What's implemented

### Update 2: leads, diesel, cities, green and black branding

- **Lead tracking:**
  - Every lead records name, phone, email, address, **city**, the date and time it came in, **lead source**, **lead cost**, **lead status** and notes.
  - Statuses: New Lead → Contacted → Estimate Scheduled → Quote Sent → Booked → Lost (with **lost reason**) → Completed.
  - A lead and its job are the same record, so you always see whether a lead was booked and how much revenue and profit it produced.
- **Lead sources:** Google Ads, Google Business Profile, Facebook Ads, Facebook Organic, Website, Phone Call, Realtor, Property Manager, Referral, Repeat Customer, Yard Sign, Other. Existing jobs that used "Facebook" were moved to "Facebook Ads". The old sources (Apartment, Senior Living, Cold Email, Cold Call) are hidden from new leads, but their history is kept.
- **Quick capture while on the phone:**
  - The **+ ADD** button opens **New Lead** or **New Job**.
  - New Lead covers customer, address and city, source chips, lead cost, lead status, estimate, and automatic miles and fuel.
  - On the lead's page: one-tap status chips, **BOOK JOB** (sets date, time and price), and **Lost** with reason chips.
- **Leads page:** filter by period, status, source and city, and search by name, phone or address. It shows totals for leads, lead cost and CPL, booked jobs and conversion, revenue and profit, and each lead's revenue, cost and profit.
- **Mileage:**
  - The default route is now **Start → Customer → Return**, and the job shows **one-way**, **return** and **total** miles.
  - Mileage comes from actual driving routes (Google Routes API).
  - Dump runs and extra stops can still be added, and the total can still be overridden.
- **Diesel price:** automatic local lookup with a per-job override; the price used is stored on each job (see section 4).
- **15 MPG** is the van's default (editable in Settings → Vehicles).
- **Transportation block** on every lead and job: total miles, van MPG, diesel price, gallons used, fuel cost, and the formula that produced them.
- **Job cost breakdown** = Lead + Fuel + Dump + Labor + Other. Per-mile maintenance and depreciation from the first version are still available behind a switch: Settings → Job Defaults → "Add vehicle maintenance & depreciation to job cost". It is off by default.
- **Job view:** CUSTOMER, LEAD, TRANSPORTATION, JOB COSTS and FINANCIALS sections, with profit and margin shown in big type.
- **Lead source performance:**
  - Per source: total leads, ad and lead cost, average cost per lead, booked jobs, cost per booked job, conversion rate, revenue, job costs, profit and ROAS.
  - **Ranked by profit**, not by lead count, and filterable by city.
- **City performance:**
  - Cumming vs Dawsonville head-to-head, plus every other city.
  - Per city: leads, lead cost, average CPL, booked jobs, booking rate, revenue, fuel, dump, labor, total costs, profit, average job value and average profit per job.
- **Dashboard:**
  - **Today:** new leads, booked jobs, jobs today, revenue, costs, profit.
  - **Financial:** revenue, total job costs, gross profit, margin.
  - **Marketing:** leads, cost per lead, booked jobs, cost per booked job, ad spend, revenue, ROAS.
  - **Operations:** miles, fuel, dump, labor, other.
  - Filters: Today / This Week / This Month / Custom, plus lead source, city and job status. Open leads are listed for follow-up.
- **Branding:**
  - GRIZZLY JUNK REMOVAL with a bright green, black and white color scheme.
  - Logo slot used on login, splash, header, sidebar, favicon, app icon and iPhone icon (section 5b).
- **CSV export** now also includes lead status, when the lead came in, lost reason, diesel price and MPG.

### Original features

**Core workflow**
- **New Job** (one phone-friendly screen):
  - Customer name, phone, email and job address (Google autocomplete).
  - Date, arrival time, duration, job type, status, quoted price, deposit, payment status and method.
  - Lead source and lead cost, crew picker with hours, number of workers, dump facility and estimate, other costs, notes.
  - A live **estimated profit** bar and a big **SAVE & SCHEDULE JOB** button.
- **Repeat customers:** as you type a name or phone, existing customers are suggested, and a matching phone or email is detected automatically. The job links to the existing customer instead of creating a duplicate.
- **Route and mileage:**
  - Business address from Settings; automatic distance for every leg (Business → Customer → Dump → Business, Business → Customer → Business, or any multi-stop route).
  - Add, remove and reorder stops; manual leg miles when Maps is off; total-miles override.
  - **TOTAL JOB MILES** shown big.
- **Vehicle costs:** fuel used = miles / MPG; fuel cost = gallons × price; maintenance and depreciation per mile.
  - All of these are editable in Settings; nothing is hard-coded.
  - Each job keeps the rates it was booked with, so changing diesel prices doesn't rewrite history. A "Use current vehicle rates" button updates a job when you want it to.
- **Labor:** workers with hourly cost, per-worker hours, and labor cost = hours × rate (e.g. Daniel 3h × $20 + Worker 2 3h × $18 = $114). Without assigned workers it uses workers × hours × the default rate.
- **Dump fees:** facility, fee, weight and loads; multiple receipts per job ($65 + $42 = $107); can be entered after the job; receipt photos attach to each receipt.
- **Other job costs:** category, description and amount (supplies, gas station, rental, parking, tolls, materials, other), with optional receipt photos.
- **Automatic job profit:**
  - Price, the cost lines, total cost, profit, margin, profit per labor hour and profit per mile.
  - Profit is the biggest number on every job screen.
- **Estimated vs actual:**
  - The estimate is frozen when you complete the job.
  - Actuals: final price, actual miles, real dump receipts, actual hours, and expenses.
  - You see Estimated, Actual and Difference, plus a line-by-line comparison table.
- **Quick job view:**
  - Call and Text buttons, and a Navigate button (opens Apple Maps on iPhone, or Google Maps).
  - Date, time, type, price and notes; mileage, estimated fuel, dump, labor and profit.
  - Big **ON THE WAY / START JOB / COMPLETE JOB** buttons, and one-tap status changes to any of the 10 statuses.
- **Complete Job workflow:**
  - Asks for final price, actual mileage, dump fee(s), actual labor hours, additional expenses, payment method, and whether it's paid.
  - Shows a live profit preview, then the **JOB COMPLETE** screen: revenue, total cost, PROFIT and margin.
- **Job numbers** GJR-0001, GJR-0002, … (the prefix is configurable). **Edit** and **delete** jobs (delete also removes the calendar event).

**Calendar:**
- Day view is a timeline that handles overlapping jobs.
- Week view is a 7-day agenda.
- Month view is a grid with status dots, plus the selected day's jobs.
- Each job shows customer, time, city, price and status, with a distinct color and icon per status. Tap a job to open it.

**Google Calendar sync:** create, update and delete events via OAuth. The refresh token is stored encrypted.

**Customers:**
- Search and sort by last job, revenue or name.
- Each customer shows name, phone, email, address, lead source, number of jobs, lifetime revenue, lifetime profit, last job and notes.
- Full job history and "Book another job".
- Create, edit and delete (delete is blocked when the customer has jobs, to protect history).

**Dashboard:**
- Quick buttons.
- **Today:** jobs, revenue, estimated profit and miles.
- **Upcoming jobs:** time, customer, address, price, status and estimated profit.
- **This month:**
  - Total jobs, revenue, total job costs, operating profit, margin, average job value, average profit per job.
  - Miles, fuel, dump fees, labor, advertising, overhead and net profit.

**Business expenses:**
- The 13 categories, date, vendor, description, amount and receipt photo.
- **No double counting:** an "Already counted in job costs" flag, on by default for Fuel, Vehicle Maintenance, Dump Fees and Payroll. Those rows are kept for records and reconciliation but not subtracted again. Advertising is counted once and can be tagged to a lead source.

**Marketing:**
- Per lead source: leads, jobs booked, booking rate, revenue, ad spend, cost per lead, cost per booked job, average job value, job costs, operating profit, **profit after advertising**, and ROAS.
- Verified with the spec's Google Ads example: $1,500 spend, 35 leads, 14 booked, $7,200 revenue, $2,800 costs gives a $42.86 cost per lead, $107.14 per booked job, 4.8x ROAS, $4,400 operating profit and $2,900 after ads.

**Reports:**
- Periods: Today, This Week, This Month, Last Month, This Year, or a custom range.
- Totals: revenue, number of jobs, average job price, job costs, fuel, dump, labor, vehicle cost, advertising, other, profit and margin, then net profit after ads and overhead.
- Estimate accuracy.
- Revenue, profit and jobs by lead source; revenue and profit by job type.
- An overhead breakdown and a fuel/dump reconciliation.
- **CSV export.**

**Job history:** search by customer, phone, address, date range or job number, and filter by status. Completed jobs are kept permanently; delete only happens when you explicitly confirm it.

**Settings:**
- Business name, address, phone, email, currency, time zone and job-number prefix.
- Vehicles: name, fuel type, MPG, fuel price, maintenance and depreciation per mile.
- Workers and labor rates; dump facilities and typical fees.
- Job defaults: vehicle, dump facility, estimated dump cost, labor rate, duration and crew size.
- Mileage settings: include dump by default, avoid tolls, avoid highways.
- Lead sources, Google Maps status, Google Calendar connection, users, and password.

**Security:**
- bcrypt-hashed passwords, signed httpOnly session cookies, and session revocation.
- Login lockout; role checks on every page, action and API route.
- Every input validated with Zod.
- Upload type and size checks with content-type sniffing.
- CSV formula-injection protection, security headers, and secrets kept only in environment variables.

**Mobile:**
- Designed for a 390px-wide iPhone: bottom navigation (Dashboard, Calendar, raised **+ Job**, Customers, More), 48–60px touch targets, and 16px inputs (no iOS zoom).
- Numeric keypads for money and miles, a sticky save bar, safe-area support, and Add to Home Screen as an app with its own icon.
- The desktop layout has a sidebar.

**Tested:**
- 60 unit and integration tests and a 34-step end-to-end browser test, run against the production build.
- Screenshots of every screen at iPhone size, with a check for horizontal overflow.

### Not included (needs you or is outside the scope)
- Live Google Maps and Calendar calls need your keys. The integration code is complete and tested against mocked Google responses, but I couldn't call Google from my build environment.
- No online payments, customer-facing booking page, or SMS sending. The Text button opens your phone's Messages app.
- No offline mode. The app needs a data connection, like any web app.
