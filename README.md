# 🚗 SF Ride Price Compare

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
