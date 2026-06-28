# 🐶 Grooming availability watcher

Watches **Pet Wants ATL Metro South** (`petwantsatlmetrosouth.com/booking`) for
dog‑grooming availability the **week of July 6, 2026** and, when a slot opens:

1. **Emails you** immediately with a booking link + a screenshot, and
2. **Auto‑books** the earliest open day (optional — on by default).

It runs every **15 minutes** on **GitHub Actions**, so nothing on your own
computer has to stay on. State (already‑booked / already‑notified) is cached
between runs so you don't get spammed and it won't double‑book.

---

## What you need to set up (one time)

All of this lives in your repo's **Settings → Secrets and variables → Actions**.

### Required secrets (for notifications)
| Secret | What it is |
| --- | --- |
| `SMTP_USER` | Your Gmail address (the sender). |
| `SMTP_PASS` | A Gmail **App Password** — *not* your normal password. Create one at <https://myaccount.google.com/apppasswords> (requires 2‑Step Verification). |
| `NOTIFY_TO` | Where alerts go, e.g. `bledsml@gmail.com`. |

> Prefer a different email provider? Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`
> secrets too. Gmail is the default.

### Required for auto‑booking (to fill the form)
| Secret | What it is |
| --- | --- |
| `CUSTOMER_NAME` | Your full name. |
| `CUSTOMER_PHONE` | Your phone number. |
| `PET_NAME` | Your dog's name. |
| `BOOKING_EMAIL` | Account email if the site makes you log in (optional). |
| `BOOKING_PASSWORD` | Account password if login is required (optional). |

### Optional **variables** (not secrets — plain config)
| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTO_BOOK` | `true` | `false` = notify only, never book. |
| `BOOKING_SERVICE` | — | Exact service name to pick (e.g. "Full Groom"). |
| `BOOKING_STYLIST` | — | Stylist name, if you want a specific one. |
| `TARGET_DATES` | week of Jul 6 | Comma‑separated `YYYY-MM-DD` to override the target week. |

---

## How to turn it on — all doable from your phone (GitHub app or github.com)

> ⚠️ **The 15‑minute schedule only starts once this workflow file is on the
> repo's _default branch_.** GitHub never runs `schedule:` (or shows the
> "Run workflow" button) for a file that only lives on a side branch. So step 4
> below — merging the PR — is the real "go live" switch.

1. **Add the secrets & variables** from the tables above:
   repo → **Settings → Secrets and variables → Actions**. (The `+` buttons work
   fine on mobile.) Minimum to start: `SMTP_USER`, `SMTP_PASS`, `NOTIFY_TO`,
   `CUSTOMER_NAME`, `CUSTOMER_PHONE`, `PET_NAME`.
2. **Enable Actions** if prompted on the **Actions** tab.
3. **Merge PR #2** into the default branch (`claude/ride-price-comparison-agy6z5`).
   This is what activates the cron. (Tell me and I'll merge it, or tap **Merge**
   yourself once the secrets are in.)
4. **Smoke‑test:** Actions → **"Grooming availability watcher" → Run workflow** →
   set **dry_run = true**. This checks + emails with **no booking**, and uploads
   screenshots. Open the run's **Artifacts** → `2-July-2026.png` and confirm you
   see the July calendar. If it didn't load, see *Tuning* below.
5. Once the dry run looks right, the 15‑minute schedule takes over and will
   notify + auto‑book automatically the moment July 6–11 opens up.

You only need a **computer** if you want to debug selectors locally (next
section) — none of the steps above require one.

## Test / run locally
```bash
cd grooming-watcher
npm install
npx playwright install chromium
# notify-only test (no booking):
DRY_RUN=1 SMTP_USER=... SMTP_PASS=... NOTIFY_TO=... node watch.js
```
Screenshots land in `grooming-watcher/artifacts/`.

---

## Tuning (only if the first run looks off)

The **detect + notify** path uses generic calendar heuristics and usually works
with zero tuning. The **booking** path may need one small adjustment because the
exact booking widget couldn't be inspected ahead of time. Everything you need is
in the uploaded **artifacts** (screenshots + page HTML of each step).

Edit [`config.json`](./config.json):

- **`preSteps`** — if the calendar isn't the first thing shown, list the clicks
  to reach it, e.g. `["text=Grooming", "text=Any Stylist", "text=Next"]`.
- **`selectors.dayCell` / `timeSlot` / `nextButton` / `confirmButton`** — only
  fill these if the screenshots show a step was missed. Use a CSS selector or
  `text=/.../i`.

The script never blindly confirms: if it can't complete a booking it emails you
a **"could not auto‑book — book it manually"** alert with the link, so you never
miss the slot even if a selector needs tweaking.

---

## Notes & limits
- **Time zone:** checks run in `America/New_York` (set in `config.json`).
- **No double‑booking:** once it books, it records that in cached state and stops
  trying. Delete the `.state` cache (or push a change) to re‑arm.
- **Honesty:** confirm the appointment landed by checking your email/account —
  the success check reads the page text, which is a strong but not absolute
  signal.
