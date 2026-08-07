# Confetti & Co. — Etsy Auto-Poster

Posts your invitation packs to Etsy automatically, using the listing copy and
designs you already made (the "Invitation Small Business Bazaar" project).

It creates **draft** listings by default — drafts are free, invisible to buyers,
and you press Publish in Etsy when you're happy. Publishing is when Etsy charges
its $0.20 listing fee.

What each listing gets, all automatic:

- Title, description, price, and 13 SEO tags from your approved listing copy
  (`listings.json` — edit it anytime, it's just text)
- The pack cover image plus all 5 design previews
- The 5 design PDFs attached as the instant-download files
- Etsy's required digital-download settings, plus the AI-assistance disclosure
  line in the description (Etsy requires this)

## One-time setup (about 15 minutes)

1. **Get an Etsy API key.** Go to <https://www.etsy.com/developers/register>,
   sign in with your shop account, create an app (name it "Confetti and Co
   Poster", personal use). Copy the **keystring**. In the app settings, add this
   callback URL: `http://localhost:4477/callback`
   - Note: Etsy reviews new API apps; "personal access" apps for managing your
     own shop are typically approved quickly.
2. **Save the key.** In this folder, copy `etsy.config.example.json` to
   `etsy.config.json` and paste the keystring into `apiKey`.
3. **Point at your designs.** Set `assetsDir` to the folder that holds the
   design files. Your local copy is `~/Desktop/AI Meredith/Invitation Small
   Business Bazaar` (already the default) — or download the Google Drive folder
   "Invitation Small Business Bazaar" anywhere and use that path.
4. **Connect your shop.** Run:
   ```
   node auth.js
   ```
   Open the printed link, click **Grant access**, done. Tokens are stored in
   `tokens.json` (kept out of git) and refresh themselves.

## Everyday use

```
node post.js status                 # see the queue: 6 packs, what's posted
node post.js post --next --dry-run  # rehearsal: shows exactly what would post
node post.js post --next            # post the next listing as a draft
node post.js post --all             # post everything not yet posted
node post.js post --key wedding     # post one specific pack
```

Add `--singles` to any command to also queue **one listing per individual
design** (30 more listings at $4.50/$6.00 each). More listings = more ways to be
found in Etsy search, and it costs nothing until you publish:

```
node post.js status --singles
node post.js post --next --singles
```

Add `--publish` to skip the draft step and go live immediately (this is when
the $0.20/listing fee applies).

## Auto-posting on a schedule

Etsy search likes shops that add fresh listings steadily. Once you've checked a
few drafts and trust the output, drip one new listing per day:

- **Mac (cron):** `crontab -e`, then add
  ```
  0 9 * * * cd "$HOME/path/to/this/folder" && /usr/local/bin/node post.js post --next --singles --publish >> autopost.log 2>&1
  ```
  That posts one new listing every morning at 9am until the queue is empty
  (6 packs + 30 singles = 36 days of daily fresh listings).
- Or leave `--publish` off to get a fresh **draft** each morning and publish it
  yourself from the Etsy app — 30 seconds a day, zero risk.

The queue lives in `state.json`; delete an entry there (or use `--force`) to
re-post something.

## Etsy business settings that protect your margin

- **Turn OFF Offsite Ads** (Shop Manager → Settings → Offsite Ads). Allowed
  while under $10k/yr revenue; saves you a surprise 15% fee on ad-attributed
  sales.
- Fees on a $9 sale: $0.20 listing + 6.5% transaction ($0.59) + payment
  processing (~$0.52) ≈ **$7.70 in your pocket**.
- Etsy is the *passive search* channel in your plan — keep the Instagram bio
  link pointed at Stan/Payhip, not Etsy.

## Files here

| File | What it is |
| --- | --- |
| `listings.json` | All 6 packs' titles, copy, tags, prices, and design lists |
| `post.js` | The poster (status / post / find-taxonomy) |
| `auth.js` | One-time Etsy sign-in |
| `lib/etsy.js` | Tiny Etsy API v3 client (no dependencies) |
| `etsy.config.example.json` | Template for your private config |
| `tokens.json`, `state.json`, `etsy.config.json` | Created locally, never committed |
