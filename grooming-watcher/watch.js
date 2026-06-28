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
  MONTHS, wait, tryClick, gotoMonth, isDayAvailable, clickDay,
} = require('./lib/booking');

const ROOT = __dirname;
const ARTIFACTS = path.join(ROOT, 'artifacts');
const STATE_FILE = process.env.STATE_FILE || path.join(ROOT, '.state', 'state.json');

function loadConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

  // Env overrides (set as GitHub Actions secrets/vars).
  if (process.env.BOOKING_URL) cfg.bookingUrl = process.env.BOOKING_URL;
  if (process.env.TARGET_DATES) cfg.targetDates = process.env.TARGET_DATES.split(',').map((s) => s.trim());
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
  const b = cfg.booking || {};
  const log = [];

  const clickedDay = await clickDay(frame, dateInfo.day, sel.dayCell);
  log.push(`select day ${dateInfo.iso}: ${clickedDay ? 'ok' : 'FAILED'}`);
  if (!clickedDay) return { booked: false, detail: log.join('\n') + '\n(could not click the open day)' };
  await wait(1200);
  await shot(page, `book-1-day-${dateInfo.iso}`);

  // Advance to time selection.
  if (await tryClick(frame, sel.nextButton || 'text=/next|continue/i')) { log.push('clicked Next'); await wait(1200); }
  await shot(page, `book-2-times-${dateInfo.iso}`);

  // Pick the first enabled time slot.
  const pickedTime = await frame.evaluate((configuredTimeSel) => {
    const isTime = (t) => /^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(t.trim()) || /\d{1,2}:\d{2}/.test(t);
    let els = configuredTimeSel
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
  await wait(1000);
  await shot(page, `book-3-picked-${dateInfo.iso}`);

  // Move to the details form.
  if (await tryClick(frame, sel.nextButton || 'text=/next|continue/i')) { log.push('clicked Next -> form'); await wait(1200); }

  // Fill any contact/pet fields we can identify by label/placeholder/name.
  const filled = await frame.evaluate((info) => {
    const set = (el, val) => { if (!el || !val) return false; el.focus(); el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    const match = (el, words) => {
      const hay = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
        (el.labels && el.labels[0] && el.labels[0].textContent) || ''].join(' ').toLowerCase();
      return words.some((w) => hay.includes(w));
    };
    const inputs = [...document.querySelectorAll('input, textarea')];
    const done = [];
    for (const el of inputs) {
      if (el.type === 'hidden' || el.disabled || el.value) continue;
      if (el.type === 'email' || match(el, ['email'])) { if (set(el, info.customerEmail)) done.push('email'); }
      else if (el.type === 'tel' || match(el, ['phone', 'mobile', 'tel'])) { if (set(el, info.customerPhone)) done.push('phone'); }
      else if (match(el, ['pet name', 'dog name', 'pet'])) { if (set(el, info.petName)) done.push('pet'); }
      else if (match(el, ['first name', 'firstname'])) { if (set(el, (info.customerName || '').split(' ')[0])) done.push('first'); }
      else if (match(el, ['last name', 'lastname', 'surname'])) { if (set(el, (info.customerName || '').split(' ').slice(1).join(' '))) done.push('last'); }
      else if (match(el, ['name'])) { if (set(el, info.customerName)) done.push('name'); }
      else if (match(el, ['note', 'comment', 'message'])) { if (set(el, info.notes || '')) done.push('notes'); }
    }
    return done;
  }, {
    customerName: b.customerName, customerEmail: b.customerEmail,
    customerPhone: b.customerPhone, petName: b.petName, notes: b.notes,
  });
  log.push(`filled fields: ${filled.join(', ') || 'none'}`);
  await shot(page, `book-4-form-${dateInfo.iso}`);

  // Final confirm.
  const confirmed = await tryClick(frame, sel.confirmButton || 'text=/confirm|book now|complete|submit|finish/i', 6000);
  log.push(`confirm: ${confirmed ? 'clicked' : 'NOT clicked'}`);
  await wait(2500);
  await shot(page, `book-5-result-${dateInfo.iso}`);
  await dumpHtml(page, `book-5-result-${dateInfo.iso}`);

  // Heuristic success check.
  const success = await page.evaluate(() =>
    /confirmed|booked|see you|thank you|appointment.*(set|scheduled)|booking.*(complete|confirmed)/i
      .test(document.body.innerText || '')).catch(() => false);

  return {
    booked: confirmed && success,
    detail: log.join('\n') + `\nfinal page signals success: ${success}`,
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
    viewport: { width: 430, height: 932 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();

  const errors = [];
  let available = [];

  try {
    await page.goto(cfg.bookingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2500);
    await tryClick(page, (cfg.selectors && cfg.selectors.cookieAccept) || '', 2500);
    await shot(page, '0-landing');

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

${cfg.autoBook ? 'Auto-booking is enabled — attempting to reserve the earliest open day now. You\'ll get a follow-up email with the result.' : 'Auto-booking is OFF — book it yourself using the link above.'}`,
          attachments: fs.existsSync(path.join(ARTIFACTS, `2-${MONTHS[monthIndex]}-${year}.png`))
            ? [{ filename: 'calendar.png', path: path.join(ARTIFACTS, `2-${MONTHS[monthIndex]}-${year}.png`) }]
            : [],
        });
        state.notifiedDates = [...new Set([...state.notifiedDates, ...newDates.map((t) => t.iso)])];
        saveState(state);
      } else {
        console.log('[watch] Availability already notified previously — not re-sending the "open" email.');
      }

      // 2) Auto-book the earliest open day.
      if (cfg.autoBook) {
        const target = available[0];
        console.log(`[watch] Attempting to auto-book ${target.iso}...`);
        // Re-resolve the calendar frame (page state may have changed during checks).
        let frame;
        try { frame = await gotoMonth(page, year, monthIndex, cfg); } catch (e) { frame = null; errors.push(`re-nav: ${e.message}`); }
        const result = frame
          ? await attemptBooking(page, frame, target, cfg)
          : { booked: false, detail: 'Could not re-open the calendar to book.' };

        if (result.booked) {
          state.booked = true;
          state.bookedDate = target.iso;
          saveState(state);
        }
        await sendEmail({
          subject: result.booked
            ? `✅ BOOKED grooming for ${target.iso}`
            : `⚠️ Could NOT auto-book ${target.iso} — book it manually ASAP`,
          text:
`${result.booked
  ? `Your grooming appointment for ${target.iso} appears to be BOOKED. Please double-check your email/account for a confirmation from Pet Wants.`
  : `A slot is open for ${target.iso} but the automated booking did not complete. Grab it manually now: ${cfg.bookingUrl}`}

Flow log:
${result.detail}

Screenshots are attached to the GitHub Actions run.`,
        });
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
