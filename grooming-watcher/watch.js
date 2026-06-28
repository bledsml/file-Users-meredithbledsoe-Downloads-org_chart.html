'use strict';

/**
 * grooming-watcher — checks Pet Wants ATL Metro South for dog grooming
 * availability in a target week and notifies + (optionally) auto-books.
 *
 * Designed to run headless on a schedule (GitHub Actions). It is defensive:
 * the detect + notify path uses generic calendar heuristics that work across
 * most booking widgets, and every run drops screenshots into ./artifacts so
 * the booking flow can be confirmed/tuned from the real page.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const { sendEmail } = require('./lib/notify');
const {
  MONTHS, wait, tryClick, login, acceptWaivers, gotoMonth, isDayAvailable, clickDay,
} = require('./lib/booking');

const ROOT = __dirname;
const ARTIFACTS = path.join(ROOT, 'artifacts');
const STATE_FILE = process.env.STATE_FILE || path.join(ROOT, '.state', 'state.json');

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

  // Env overrides (set as GitHub Actions secrets/vars).
  if (process.env.BOOKING_URL) cfg.bookingUrl = process.env.BOOKING_URL;
  if (process.env.TARGET_DATES) cfg.targetDates = process.env.TARGET_DATES.split(',').map((s) => s.trim()).filter(Boolean);
  if (process.env.AUTO_BOOK) cfg.autoBook = process.env.AUTO_BOOK === 'true';
  if (process.env.DRY_RUN === '1') cfg.autoBook = false;

  cfg.booking = cfg.booking || {};
  cfg.booking.customerName = process.env.CUSTOMER_NAME || cfg.booking.customerName || '';
  cfg.booking.customerEmail = process.env.NOTIFY_TO || process.env.BOOKING_EMAIL || cfg.booking.customerEmail || '';
  cfg.booking.customerPhone = process.env.CUSTOMER_PHONE || cfg.booking.customerPhone || '';
  cfg.booking.petName = process.env.PET_NAME || cfg.booking.petName || '';
  if (process.env.BOOKING_SERVICE) cfg.booking.service = process.env.BOOKING_SERVICE;
  if (process.env.BOOKING_STYLIST) cfg.booking.stylist = process.env.BOOKING_STYLIST;
  return cfg;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { booked: false, notifiedDates: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, monthIndex: m - 1, day: d, iso };
}

async function shot(page, name) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const file = path.join(ARTIFACTS, `${name}.png`);
  try { await page.screenshot({ path: file, fullPage: true }); } catch { /* ignore */ }
  return file;
}

async function dumpHtml(page, name) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const file = path.join(ARTIFACTS, `${name}.html`);
  try { fs.writeFileSync(file, await page.content()); } catch { /* ignore */ }
  return file;
}

/**
 * Best-effort booking flow once a day is open. Heavily defensive: every step
 * is optional and screenshotted. Returns { booked, detail }.
 */
async function attemptBooking(page, frame, dateInfo, cfg) {
  const sel = cfg.selectors || {};
  const log = [];
  const nextSel = sel.nextButton || 'text=/next|continue/i';

  // 1) Pick the open day.
  const clickedDay = await clickDay(frame, dateInfo.day, sel.dayCell);
  log.push(`select day ${dateInfo.iso}: ${clickedDay ? 'ok' : 'FAILED'}`);
  if (!clickedDay) return { booked: false, detail: log.join('\n') + '\n(could not click the open day)' };
  await wait(1500);
  await shot(page, `book-1-day-${dateInfo.iso}`);

  // 2) Pick the first enabled time slot (times appear after choosing the day).
  const pickedTime = await frame.evaluate((configuredTimeSel) => {
    const isTime = (t) => /^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(t.trim()) || /\d{1,2}:\d{2}/.test(t);
    const els = configuredTimeSel
      ? [...document.querySelectorAll(configuredTimeSel)]
      : [...document.querySelectorAll('button, [role=button], a, li')].filter((e) => isTime((e.textContent || '').trim()));
    const ok = els.find((el) => {
      const s = getComputedStyle(el);
      const cls = (el.className || '').toString().toLowerCase();
      const bad = el.hasAttribute('disabled') ||
        (el.getAttribute('aria-disabled') || '') === 'true' ||
        /(disabl|unavail|booked|past|inactive)/.test(cls) ||
        parseFloat(s.opacity || '1') < 0.45;
      return !bad;
    });
    if (!ok) return null;
    const label = (ok.textContent || '').trim();
    (ok.closest('button, a, [role=button]') || ok).click();
    return label;
  }, sel.timeSlot || '');
  log.push(`pick time: ${pickedTime || 'none found'}`);
  await wait(1200);
  await shot(page, `book-2-time-${dateInfo.iso}`);

  // 3) Advance to Waivers.
  if (await tryClick(page, nextSel, 6000)) { log.push('Next -> waivers'); await wait(1500); }
  await shot(page, `book-3-waivers-${dateInfo.iso}`);

  // 4) Accept the grooming waiver, then advance to Payment.
  log.push(`waivers: ${await acceptWaivers(page)}`);
  await wait(800);
  if (await tryClick(page, nextSel, 6000)) { log.push('Next -> payment'); await wait(2000); }
  await shot(page, `book-4-payment-${dateInfo.iso}`);

  // 5) Payment. The deposit is taken via Google Pay (account-authenticated
  //    popup) or manual card entry — neither can be safely automated. So we do
  //    NOT attempt to pay; we confirm we've reached the payment screen with the
  //    slot in checkout, then signal the caller to alert the user to tap Pay.
  await dumpHtml(page, `book-5-payment-${dateInfo.iso}`);
  const atPayment = await page.evaluate(() =>
    /payment information|deposit|google pay|place a deposit|pay franpos/i
      .test(document.body.innerText || '')).catch(() => false);

  log.push(`reached payment screen: ${atPayment}`);
  return {
    booked: false,
    paymentReady: atPayment,
    detail: log.join('\n')
      + (atPayment
        ? '\nSlot is in checkout — user must tap Pay ($20 deposit) to confirm.'
        : '\nDid not reach the payment screen; see screenshots.'),
  };
}

async function main() {
  const cfg = loadConfig();
  const state = loadState();

  console.log(`[watch] Target dates: ${cfg.targetDates.join(', ')}  autoBook=${cfg.autoBook}`);

  if (state.booked) {
    console.log('[watch] Already booked on a prior run — nothing to do. (Clear .state/state.json to re-arm.)');
    return;
  }

  const targets = cfg.targetDates.map(parseDate);
  const { year, monthIndex } = targets[0]; // all in the same target month

  const launchOpts = { headless: true };
  // In the Claude Code web container, Chromium is pre-installed and the download
  // CDN is blocked; the session hook exports this path. Unset on GitHub Actions,
  // where the matching browser is installed normally.
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOpts.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: cfg.timezone || 'America/New_York',
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const errors = [];
  let available = [];

  try {
    await page.goto(cfg.bookingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2500);
    await tryClick(page, (cfg.selectors && cfg.selectors.cookieAccept) || '', 2500);
    await shot(page, '0-landing');

    // Sign in (required to select the pet and reach the calendar).
    if (cfg.login && cfg.login.enabled) {
      const lr = await login(page, cfg, (name) => shot(page, name));
      console.log(`[watch] login: ok=${lr.ok} (${lr.detail})`);
      await page.goto(cfg.bookingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await wait(2500);
      await shot(page, '0b-after-login');
    }

    // Optional pre-steps to reach the calendar (service/stylist selection, etc.)
    for (const step of cfg.preSteps || []) {
      const ok = await tryClick(page, step, 8000);
      console.log(`[watch] preStep "${step}": ${ok ? 'clicked' : 'not found'}`);
      await wait(1200);
    }
    await shot(page, '1-before-calendar');

    const frame = await gotoMonth(page, year, monthIndex, cfg);
    await shot(page, `2-${MONTHS[monthIndex]}-${year}`);

    for (const t of targets) {
      const res = await isDayAvailable(frame, t.day, cfg.selectors && cfg.selectors.dayCell);
      console.log(`[watch] ${t.iso}: ${res.available ? 'AVAILABLE' : 'unavailable'} (found=${res.found})`);
      if (res.available) available.push(t);
    }
  } catch (err) {
    console.error('[watch] Error during check:', err.message);
    errors.push(err.message);
    await shot(page, 'error');
    await dumpHtml(page, 'error');
  }

  // ---- Act on results -------------------------------------------------------
  try {
    if (available.length) {
      const newDates = available.filter((t) => !state.notifiedDates.includes(t.iso));

      // 1) Notify (once per date) regardless of booking outcome.
      if (newDates.length) {
        const list = available.map((t) => `• ${t.iso}`).join('\n');
        await sendEmail({
          subject: `🐶 Grooming slot OPEN — week of July 6 (${available.map((t) => t.iso).join(', ')})`,
          text:
`Availability just opened at Pet Wants ATL Metro South for your target week:

${list}

Book here: ${cfg.bookingUrl}

${cfg.autoBook ? 'The watcher is now confirming the slot is bookable — watch for a "BOOK NOW" email with the exact date, then book it yourself (sign in → d4 → George → date → pay the $20 deposit).' : 'Book it yourself using the link above.'}`,
          attachments: fs.existsSync(path.join(ARTIFACTS, `2-${MONTHS[monthIndex]}-${year}.png`))
            ? [{ filename: 'calendar.png', path: path.join(ARTIFACTS, `2-${MONTHS[monthIndex]}-${year}.png`) }]
            : [],
        });
        state.notifiedDates = [...new Set([...state.notifiedDates, ...newDates.map((t) => t.iso)])];
        saveState(state);
      } else {
        console.log('[watch] Availability already notified previously — not re-sending the "open" email.');
      }

      // 2) Auto-advance the earliest open day to the one-tap payment screen.
      //    Throttle so we don't repeatedly drive a slot into checkout every run.
      const recentlyAdvanced = state.awaitingPaymentUntil && Date.now() < state.awaitingPaymentUntil;
      if (cfg.autoBook && !recentlyAdvanced) {
        const target = available[0];
        console.log(`[watch] Auto-advancing ${target.iso} to payment...`);
        let frame;
        try { frame = await gotoMonth(page, year, monthIndex, cfg); } catch (e) { frame = null; errors.push(`re-nav: ${e.message}`); }
        const result = frame
          ? await attemptBooking(page, frame, target, cfg)
          : { booked: false, detail: 'Could not re-open the calendar to book.' };

        if (result.paymentReady) {
          // Slot is in checkout. Alert the user to tap Pay; cool down for 40 min.
          state.awaitingPaymentUntil = Date.now() + 40 * 60 * 1000;
          state.awaitingPaymentDate = target.iso;
          saveState(state);
          await sendEmail({
            subject: `🐶 BOOK NOW — grooming slot OPEN for George on ${target.iso}`,
            text:
`A grooming slot just opened for the week you're watching, and the watcher
confirmed it's actually bookable (logged in and walked it to the payment step):

  Service: d4) Doodle/Curly Large Breed Full Groom ($125, $20 deposit)
  Pet: George   Date: ${target.iso}

👉 Book it NOW before someone else grabs it — open ${cfg.bookingUrl} and:
   sign in → pick the d4 service → George → choose ${target.iso} → pay the
   $20 deposit (Google Pay).

Cancellations get taken fast, so don't wait. The watcher can't complete the
payment for you (Google Pay needs your tap), so the final booking is yours.

Flow log:
${result.detail}`,
          });
        } else {
          await sendEmail({
            subject: `⚠️ Slot open ${target.iso} but auto-advance stalled — book it manually NOW`,
            text:
`A slot is open for ${target.iso} but the watcher couldn't reach the payment screen on its own. Grab it manually now: ${cfg.bookingUrl}

Flow log:
${result.detail}

Screenshots are in the GitHub Actions artifacts.`,
          });
        }
      } else if (recentlyAdvanced) {
        console.log(`[watch] Already advanced ${state.awaitingPaymentDate} to payment recently — awaiting your tap, not re-advancing.`);
      }
    } else if (errors.length) {
      // Only email errors if SMTP is set; harmless no-op otherwise.
      await sendEmail({
        subject: '⚠️ grooming-watcher run had an error',
        text: `The watcher could not complete its check:\n\n${errors.join('\n')}\n\nSee the screenshots/HTML in the GitHub Actions artifacts to tune selectors.`,
      });
    } else {
      console.log('[watch] No availability in the target week this run.');
    }
  } catch (err) {
    console.error('[watch] Error while acting on results:', err.message);
  } finally {
    await browser.close();
  }

  // Surface a non-fatal exit; the workflow still uploads artifacts.
  if (errors.length && !available.length) process.exitCode = 0;
}

main().catch((e) => {
  console.error('[watch] Fatal:', e);
  process.exitCode = 1;
});
