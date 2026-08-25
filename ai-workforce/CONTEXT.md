# AI Workforce — Living Context

> **Purpose of this file:** persistent memory for Meredith's AI workforce project.
> Any Claude session working on the workforce should read this first and update it
> before finishing (add a changelog entry at the bottom). The org chart itself is
> `org-chart.html` in this folder, published as a private artifact:
> https://claude.ai/code/artifact/bb683075-62b0-40bb-8872-990d9ca4a0ea

## Who / what this serves

- **Meredith Bledsoe** (bledsml@gmail.com; secondary: meredithbledsoesf@gmail.com);
  birthday **Aug 14**. Landlord insurance for the TN cabin: **Obie**.
- Works at **Google** (compensation/refresher analysis done Aug 2026; open to
  watching roles at target companies — list not yet defined, ask her).
- **Properties:** Tennessee cabin "**Firefly Cottage**" at 4325 New Pioneer Trail
  (refinance loan #265502580 researched Jul 2026), Kentucky house "**The Old
  Kentucky Estate**" (closed ~May 2026; live on Airbnb as of Aug 2026 — first
  three bookings landed Aug 16–17 totaling ~$6.7k), family stays at "Mom's
  cabin" (arrival checklist built Jul 2026). Uses **Hospitable** ($59/mo) for
  short-term-rental management.
- **Dog:** George. Grooming-slot watcher already built (`grooming-watcher/` in
  this repo). Chewy Autoship for his supplies.
- **Health goals:** daily protein target with effortless logging; wants Oura ring
  + Apple Watch data incorporated; supplements/skincare on an intentional schedule.
- **Ventures:** full portfolio in `ventures/README.md` — **Confetti Confessions**
  (the confetti brand for Etsy); **Haven** (pitch deck + app prototype artifacts
  built); Becky's workstream (mini-workforce for her business, unscoped);
  **skills to sell to companies** (brainstorm in `ventures/skill-ideas.md`);
  Etsy invite auto-poster (built, PR #22); Penny name retired (taken; the name
  conversation resurfaced when naming the CoS — Jamal won); shoe-sanitizer patent
  scan done; time-tracking app (PR #21).

## The workforce (v2, Aug 12 2026)

Chief-of-staff routes six departments. Full detail in `org-chart.html`.

| Dept | Agents |
|---|---|
| Properties | refi-watcher, maintenance-scout, guest-prep |
| Finance | goal-watcher, expense-tracker, tax-strategist, receipt-filer |
| Career | comp-analyst, job-scout, application-drafter |
| Health | protein-tracker, wearable-sync, supplement-planner |
| Ventures | listing-poster (built), confetti-studio, becky-ops, skill-forge, market-researcher, pitch-builder |
| Home & Admin | grooming-watcher (built), appointment-scheduler, subscription-manager, calendar-auditor, inbox-triager, deal-hunter |

**Status:** chief of staff is HIRED and named **Jamal** (Meredith's choice,
Aug 12 2026). Routine `trig_01GiRiodoPt2ExUdXLcFEFh2`, weekdays 12:00 UTC
(7am Nashville during CDT; shifts to 6am when CST returns — ask Meredith if
she wants it moved to `0 13 * * 1-5` in November). It fires into session
"AI workforce setup proposal" (session_01TwEy1519jPm3u89hDAJmoe), which holds
the Gmail + Google Calendar connectors; the brief folds in inbox-triager,
calendar-auditor, and a Monday subscription-manager pass. If a fired run finds
Gmail tools unavailable, tell Meredith to recreate the routine from the
claude.ai Routines UI with connectors attached (org blocks storing connectors
on triggers created in-session).

Next hires: protein-tracker + goal-watcher (Week 2–3), then refi-watcher and
job-scout; ventures run as scoped projects.

## Subscription audit (Gmail, ~6 months, run Aug 12 2026)

Active: Chewy Autoship (monthly, George), Dermstore EltaMD SPF + cleanser (new
Aug 6), LMNT (~bimonthly), Apple News+ ($12.99/mo), Bloomberg, Marina Run Club
($20/mo), Ring Protect (trial started Jul 22 → converts ~Aug 21), Amazon
Unlimited Grocery Delivery, Hospitable, Bumble Premium (on sf@ address).
New Aug 12: **ChatGPT Plus** ($20/mo, subscribed overnight — flagged in the
Aug 12 brief to confirm intentional).
New Aug 16–17 (Monday watch): **NYT subscription** (welcome email Aug 16),
**Hospitable invoice $59 "Payment Due"** (verify autopay), **Target Circle 360**
membership observed. PG&E on autopay ($95.84 due 9/4, no action).
Aug 24 (Monday watch): **Starlink $140/mo** (cabin internet, autopay, renews
20th). **Ring trial presumed converted Aug 21** — no cancellation seen; verify
the charge and decide keep/cancel. Chewy card fix still unconfirmed (order
ships Aug 26 — watch for ship/fail email).
Aug 25: Sevier Electric RESOLVED — autopaid $240.09 (it does have autopay).
Open items: Elite Cabin Care $585 (invoice 3842-2, re-issued, open since
Aug 12); Goosehead DocuSign unsigned; TN Dept of Revenue correspondence for
**MGB INVESTMENTS LLC** (her TN entity — sales & use tax, read via TNTAP);
Maui unwind unconfirmed (UA1750/A3QEP4 + Hertz L680E9885C7).
Canceled/ending: Sephora Same-Day Unlimited (Feb), Tractive (cancel requested
June — confirm it ended).

**Action flags raised:** Ring trial converts ~Aug 21; Chewy card on file failed
4× in June and canceled one order.

## Recurring appointments to systematize

House cleaning, eyebrows, car detailing, George's grooming cadence. No vendors/
cadences captured yet — appointment-scheduler's first task is to collect them.

## Constraints & preferences

- Meredith approves anything outward-facing: purchases, cancellations,
  applications, bookings. Agents draft/watch/flag only.
- Protein logging must be genuinely easy (message me → I do the math).
- Oura has a personal-token API; Apple Watch data comes via Apple Health export
  (no direct connector) — wearable-sync should start with whatever is lowest
  friction.
- Claude Code sessions history is visible only as titles/summaries, not full
  transcripts; claude.ai app chats aren't accessible from here. This file is the
  substitute — keep it current.

## Where things live

- This repo (`bledsml/file-Users-meredithbledsoe-Downloads-org_chart.html`):
  grooming-watcher (root `grooming-watcher/`), ride-compare app (`index.html`),
  this folder.
- Branches carry past outputs: Etsy auto-poster (PR #22), time tracker (PR #21),
  Haven deck, cabin checklist, etc.
- Artifacts: org chart (link above), Haven deck + prototype.

## Notes from Jamal's runs

- **Meredith is San Francisco-based** (calendar TZ America/Los_Angeles; Olympic
  Club, Marina Run Club). The TN cabin is named **Firefly Cottage** (Elite Cabin
  Care cleans it; Plumber In A Box services it; guest turnovers appear as
  "Departure Clean" calendar events). Brief currently fires 12:00 UTC = 5am PT —
  offered to move to 7am PT (`0 14 * * 1-5`); awaiting her word.
- GitHub "Run failed: grooming-watcher.yml — No jobs were run" emails on branch
  pushes are expected noise (cloud cron disabled); ignore.

## Changelog

- **2026-08-24 (Monday watch):** Maui trip canceled Aug 23 (minor head injury —
  Four Seasons refunded; United return A3QEP4 + Hertz still to unwind). KY
  house's Airbnb listing is titled "The Bourbon Trail"; first KY guests
  (Melissa) left 5 stars. Becky's Cowork onboarding started organically
  (expense-reconciliation prompt sent; she's connecting Gmail) — becky-ops is
  live in practice. Subscriptions: added Starlink $140/mo; Ring presumed
  converted. Note: a separate "Your Day Ahead" daily-brief email (from
  meredithbledsoesf+cc@gmail.com) also runs — avoid duplicating it.
- **2026-08-17 (Monday watch):** Old Kentucky Estate live on Airbnb — 3 bookings
  (~$6.7k). Subscription inventory: added NYT, Hospitable $59/mo, Target Circle
  360. Standing flags still open: Ring (converts ~Aug 21), Chewy card.
- **2026-08-14:** Jamal's Friday run: noted birthday (Aug 14) and Obie as the
  cabin's landlord insurer (inspection notice received).
- **2026-08-12 (v3.1):** Added `ventures/` folder: README.md portfolio naming
  **Confetti Confessions** and **Haven** explicitly, plus `skill-ideas.md` — a
  brainstorm area for skills to sell to companies, seeded with 8 ideas traced
  to things already built.
- **2026-08-12 (v3):** Meredith hired the chief of staff and named him
  **Jamal**. Weekday 7am CT morning-brief routine created (self-bound to the
  workforce session for connector access). Org chart updated to v3.

- **2026-08-12 (v2):** Added Health dept, subscription-manager + first Gmail
  audit, appointment-scheduler, goal-watcher, confetti-studio, becky-ops,
  skill-forge. Created `ai-workforce/` folder; moved org chart here; started
  this context file. (Session: "AI workforce setup proposal", PR #23.)
- **2026-08-12 (v1):** Initial 5-dept / 16-agent proposal from session history.
