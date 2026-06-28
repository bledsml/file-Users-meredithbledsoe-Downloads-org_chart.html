# 🐶 Local grooming watcher (runs on your computer)

The booking site blocks automated logins with reCAPTCHA, so a hands-off cloud
bot can't work. This version runs on **your** computer: **you** sign in once as a
human (passing the bot check + the emailed code), and the script reuses that
saved session to check availability for the **week of July 6** and **alert you**
the instant a slot opens. You then book it yourself (the $20 Google Pay deposit
is always your tap).

> Your computer needs to be **on and awake** while it runs. On Mac, you can keep
> it awake by running the loop under `caffeinate` (shown below). On Windows, set
> Power & sleep → "When plugged in, turn off after: Never".

## One-time setup (~5 min)
1. Install **Node.js** (https://nodejs.org, the LTS version).
2. Download this repo to your computer (GitHub → Code → Download ZIP, or
   `git clone`), then open a terminal in the `grooming-watcher` folder.
3. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```
4. *(Optional, for phone alerts)* set email env vars so it can also email you:
   - Mac/Linux: `export SMTP_USER="you@gmail.com" SMTP_PASS="your-app-password" NOTIFY_TO="you@gmail.com"`
   - Windows (PowerShell): `$env:SMTP_USER="you@gmail.com"; $env:SMTP_PASS="..."; $env:NOTIFY_TO="you@gmail.com"`
   Without this it still alerts loudly in the terminal and pops the booking page open.

## Step 1 — Sign in once
```bash
node local-watch.js --login
```
A browser window opens. Sign in normally: **email → CONTINUE → password → LOGIN →
enter the code emailed to you**. When it detects you're signed in, it saves the
session and tells you you're done. (Re-do this whenever it says the session
expired — usually every week or two.)

## Step 2 — Start watching
```bash
node local-watch.js --loop 15
```
Leave this terminal running. It checks every 15 minutes. When a slot opens for
July 6–11 it will: **beep, print a BOOK NOW message, pop open the booking page**,
and email you (if configured). Then you sign in and pay the $20 deposit.

Keep the Mac awake while watching:
```bash
caffeinate -i node local-watch.js --loop 15
```

## Handy commands
| Command | What it does |
| --- | --- |
| `node local-watch.js --login` | Sign in once (saves session) |
| `node local-watch.js` | Run a single check now |
| `node local-watch.js --loop 15` | Check every 15 min, alert on openings |
| `node local-watch.js --headed` | Show the browser while checking (to debug) |

## Notes
- Target dates, service (d4 Doodle/Curly Large Breed Full Groom), and the wizard
  steps all come from `config.json` — same as the cloud version.
- If it prints **"Not signed in (session expired)"**, just re-run Step 1.
- It only **checks and alerts** — it never logs in for you and never pays, so it
  won't trip the site's bot protection the way the cloud version did.
