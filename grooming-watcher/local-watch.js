'use strict';

/**
 * Local grooming watcher — runs on YOUR computer in a real browser profile.
 *
 * The booking site blocks automated logins with reCAPTCHA, so instead of having
 * a bot log in, YOU log in once as a human (passing the bot check + the emailed
 * code). That session is saved in a local browser profile, and this script
 * reuses it to check availability for your target week and alert you.
 *
 *   node local-watch.js --login        # opens a window; you log in once
 *   node local-watch.js                # one availability check
 *   node local-watch.js --loop 15      # check every 15 minutes, alert on openings
 *   node local-watch.js --headed       # show the browser while checking (debug)
 *
 * Optional email alerts: set SMTP_USER, SMTP_PASS (Gmail App Password) and
 * NOTIFY_TO in your environment. Without them, it still alerts loudly in the
 * terminal (and opens the booking page) when a slot opens.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { sendEmail } = require('./lib/notify');
const { wait, tryClick, gotoMonth, isDayAvailable } = require('./lib/booking');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PROFILE_DIR = process.env.PROFILE_DIR || path.join(ROOT, '.profile');

const argv = process.argv.slice(2);
const LOGIN_MODE = argv.includes('--login');
const HEADED = argv.includes('--headed');
const loopAt = argv.indexOf('--loop');
const LOOP_MIN = loopAt >= 0 ? Number(argv[loopAt + 1] || 15) : 0;

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, monthIndex: m - 1, day: d, iso };
}

async function isLoggedIn(page) {
  return page.evaluate(() =>
    /hi,\s|my account|log\s?out|sign\s?out/i.test(document.body.innerText || '')).catch(() => false);
}

async function openContext(headless) {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    viewport: { width: 1366, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

/** Headed one-time login: you sign in by hand; the session is saved. */
async function doLogin() {
  const ctx = await openContext(false);
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(cfg.login.loginUrl || cfg.bookingUrl, { waitUntil: 'domcontentloaded' });
  console.log('\n================ LOG IN ================');
  console.log('A browser window opened. Please sign in:');
  console.log('  email  ->  CONTINUE  ->  password  ->  LOGIN  ->  enter the emailed code.');
  console.log('Waiting until you are signed in (up to 5 minutes)...');
  let ok = false;
  for (let i = 0; i < 150 && !ok; i++) { await wait(2000); ok = await isLoggedIn(page); }
  if (ok) console.log('\n✓ Signed in — session saved. You can close the window.\n   Now run:  node local-watch.js --loop 15');
  else console.log('\n⚠️  Did not detect a signed-in state. Re-run "node local-watch.js --login" and finish signing in.');
  await wait(2500);
  await ctx.close();
}

/** One availability check using the saved session. */
async function checkOnce() {
  const targets = cfg.targetDates.map(parseDate);
  const { year, monthIndex } = targets[0];
  const ctx = await openContext(!HEADED);
  const page = ctx.pages()[0] || (await ctx.newPage());
  try {
    await page.goto(cfg.bookingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2500);
    if (!(await isLoggedIn(page))) {
      console.log('[local] Not signed in (session expired). Run:  node local-watch.js --login');
      return { error: 'not-logged-in' };
    }
    for (const step of cfg.preSteps || []) { await tryClick(page, step, 8000); await wait(1200); }
    const frame = await gotoMonth(page, year, monthIndex, cfg);
    const available = [];
    for (const t of targets) {
      const r = await isDayAvailable(frame, t.day, cfg.selectors && cfg.selectors.dayCell);
      console.log(`[local] ${t.iso}: ${r.available ? 'AVAILABLE ✅' : 'unavailable'}`);
      if (r.available) available.push(t);
    }
    return { available };
  } catch (e) {
    console.error('[local] check error:', e.message);
    return { error: e.message };
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function alert(available) {
  const list = available.map((t) => t.iso).join(', ');
  // Loud terminal alert (with a bell).
  process.stdout.write('\x07');
  console.log(`\n🐶🔔 SLOT OPEN for George: ${list}\n   Book now: ${cfg.bookingUrl}\n   (sign in → d4 → George → pick the date → pay the $20 deposit)\n`);
  // Pop the booking page open so you can grab it immediately.
  try {
    const ctx = await openContext(false);
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(cfg.bookingUrl).catch(() => {});
    // leave it open; don't close
  } catch { /* ignore */ }
  // Email too, if configured.
  await sendEmail({
    subject: `🐶 BOOK NOW — grooming slot OPEN for George (${list})`,
    text: `A slot just opened for the week you're watching:\n\n${available.map((t) => '• ' + t.iso).join('\n')}\n\nBook it now: ${cfg.bookingUrl}\n(sign in → d4 Doodle/Curly Large Breed Full Groom → George → pick the date → pay the $20 deposit)`,
  }).catch(() => {});
}

(async () => {
  if (LOGIN_MODE) { await doLogin(); return; }
  const seen = new Set();
  do {
    const res = await checkOnce();
    if (res.available && res.available.length) {
      const fresh = res.available.filter((t) => !seen.has(t.iso));
      if (fresh.length) { fresh.forEach((t) => seen.add(t.iso)); await alert(res.available); }
      else console.log('[local] (already alerted for these dates)');
    } else if (!res.error) {
      console.log('[local] No availability in the target week this check.');
    }
    if (LOOP_MIN > 0) {
      console.log(`[local] next check in ${LOOP_MIN} min — leave this running. (Ctrl+C to stop)`);
      await wait(LOOP_MIN * 60 * 1000);
    }
  } while (LOOP_MIN > 0);
})();
