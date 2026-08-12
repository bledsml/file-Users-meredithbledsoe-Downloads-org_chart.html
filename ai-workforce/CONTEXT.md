# AI Workforce — Living Context

> **Purpose of this file:** persistent memory for Meredith's AI workforce project.
> Any Claude session working on the workforce should read this first and update it
> before finishing (add a changelog entry at the bottom). The org chart itself is
> `org-chart.html` in this folder, published as a private artifact:
> https://claude.ai/code/artifact/bb683075-62b0-40bb-8872-990d9ca4a0ea

## Who / what this serves

- **Meredith Bledsoe** (bledsml@gmail.com; secondary: meredithbledsoesf@gmail.com)
- Works at **Google** (compensation/refresher analysis done Aug 2026; open to
  watching roles at target companies — list not yet defined, ask her).
- **Properties:** Tennessee cabin at 4325 New Pioneer Trail (refinance loan
  #265502580 researched Jul 2026), a Kentucky house (closed ~May 2026), family
  stays at "Mom's cabin" (arrival checklist built Jul 2026). Uses **Hospitable**
  for short-term-rental management.
- **Dog:** George. Grooming-slot watcher already built (`grooming-watcher/` in
  this repo). Chewy Autoship for his supplies.
- **Health goals:** daily protein target with effortless logging; wants Oura ring
  + Apple Watch data incorporated; supplements/skincare on an intentional schedule.
- **Ventures:** confetti products for Etsy; Etsy invite auto-poster (built, PR #22);
  "Becky's workstream" (build a mini-workforce for Becky's business — scope TBD);
  sellable Claude skills; Haven (pitch deck + app prototype exist as artifacts);
  Penny finance-app name was checked and is taken; shoe-sanitizer patent scan done;
  time-tracking app with profession dropdown (PR #21).

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

**Status:** proposal. Nothing scheduled yet except the pre-existing grooming
watcher. Rollout plan: Week 1 = chief-of-staff morning brief + inbox/calendar/
subscription watchers; Week 2–3 = protein-tracker, goal-watcher, refi-watcher,
job-scout; ventures run as scoped projects.

## Subscription audit (Gmail, ~6 months, run Aug 12 2026)

Active: Chewy Autoship (monthly, George), Dermstore EltaMD SPF + cleanser (new
Aug 6), LMNT (~bimonthly), Apple News+ ($12.99/mo), Bloomberg, Marina Run Club
($20/mo), Ring Protect (trial started Jul 22 → converts ~Aug 21), Amazon
Unlimited Grocery Delivery, Hospitable, Bumble Premium (on sf@ address).
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

## Changelog

- **2026-08-12 (v2):** Added Health dept, subscription-manager + first Gmail
  audit, appointment-scheduler, goal-watcher, confetti-studio, becky-ops,
  skill-forge. Created `ai-workforce/` folder; moved org chart here; started
  this context file. (Session: "AI workforce setup proposal", PR #23.)
- **2026-08-12 (v1):** Initial 5-dept / 16-agent proposal from session history.
