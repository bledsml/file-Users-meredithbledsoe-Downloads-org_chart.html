# This repo

Small single-file web apps — open the `.html` file in any browser, no build step.

## ⏱ Studio Hours (`time-tracker.html`)

Client time & budget guard for designers. Track how much time each client
project eats (calls, texts, email, meetings), see every project against its
contracted hours, and when a project crosses its alert threshold (default 80%),
the app flags it and drafts a friendly courtesy email to the client explaining
that further consultation will be billed hourly. Comes seeded with demo data —
a big new-construction project pacing fine next to a small project with a
chatty client burning its budget. Data is stored in your browser
(localStorage); use **Projects → Start blank** for real use.

Automatic capture note: phones don't let apps read personal texts/call logs, so
the real-product path to auto-tracking is a business phone line (OpenPhone /
RingCentral / Twilio APIs) plus a connected email account (Gmail / Outlook
APIs). The prototype's one-tap quick log covers the workflow today.

## 🚗 SF Ride Price Compare (`index.html`)

A single-page web app to compare estimated fares for **Uber**, **Lyft**, and
**Waymo One** for a ride in San Francisco — so you can see who's cheapest before
you book.

## Use it

Open `index.html` in any browser. No build step, no server.

1. Pick a **pickup** and **drop-off** from the SF location dropdowns, or click
   the map (first click = pickup, second = drop-off, third resets).
2. Set riders, demand/surge level, and time of day.
3. Optionally include shared/pool and premium tiers.
4. Hit **Compare prices** — quotes are sorted cheapest-first and the best deal
   is highlighted.

## How the estimates work

Uber, Lyft, and Waymo do **not** offer a free public price API (Uber retired
its public price-estimate endpoint; Waymo has none). So this app **models** each
service's published San Francisco pricing structure:

- Base fare + per-mile + per-minute + booking/service fee, floored at the trip
  minimum.
- Distance = straight-line (haversine) between the two points × a 1.35 road
  winding factor.
- Time assumes ~18 mph average SF city speed.
- Your selected **surge** and **time-of-day** multipliers are applied to the
  metered portion.

**These are estimates, not live quotes.** Real prices vary with live demand,
traffic, tolls, and promotions — always confirm in each app before booking.

### Wiring in live prices

Replace `estimateFare()` in `index.html` with authenticated calls to each
provider's partner pricing endpoint. The pricing tables live in the `SERVICES`
object, so swapping in real rates (or live API responses) is localized to one
place.

## Tech

- Plain HTML/CSS/JS, single file.
- [Leaflet](https://leafletjs.com/) + OpenStreetMap tiles for the map (loaded
  from CDN; needs internet for map tiles, but fare math works offline).
