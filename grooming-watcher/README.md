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

## How to turn it on
1. Push this repo to GitHub (the watcher branch already has everything).
2. Add the secrets/variables above.
3. Go to the **Actions** tab → enable workflows if prompted.
4. Run **"Grooming availability watcher" → Run workflow** once with
   **dry_run = true**. This does a check + notify with **no booking**, and
   uploads screenshots so you can confirm it reads the calendar correctly.
5. Open the run's **Artifacts** and check `2-July-2026.png` — you should see the
   July calendar. If the calendar didn't load, see *Tuning* below.
6. Once the dry run looks right, let the 15‑minute schedule take over. It will
   notify + auto‑book automatically when July 6–11 opens up.

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
