'use strict';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Sleep helper (ms). */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The booking calendar may live in the top document or inside an iframe.
 * Return every frame so we can search all of them.
 */
function allFrames(page) {
  return page.frames();
}

/**
 * Try an optional click for a configured/guessed selector. Never throws.
 * Returns true if something was clicked.
 */
async function tryClick(scope, selector, timeout = 4000) {
  if (!selector) return false;
  try {
    const loc = scope.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout });
    await loc.click({ timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the visible "Month YYYY" label from a frame, e.g. "July 2026".
 * Returns { year, monthIndex } or null.
 */
async function readMonthLabel(frame) {
  try {
    return await frame.evaluate(() => {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const re = new RegExp('\\b(' + months.join('|') + ')\\s+(20\\d\\d)\\b', 'i');
      // Walk text nodes, prefer the shortest matching visible element.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
      let best = null;
      let node = walker.currentNode;
      while (node) {
        const t = (node.innerText || node.textContent || '').trim();
        const m = t.match(re);
        if (m) {
          const rect = node.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;
          if (visible && (!best || t.length < best.len)) {
            best = { month: m[1], year: Number(m[2]), len: t.length };
          }
        }
        node = walker.nextNode();
      }
      if (!best) return null;
      return { year: best.year, month: best.month };
    });
  } catch {
    return null;
  }
}

/**
 * Find the frame that actually contains the month calendar and return it
 * along with the parsed current label.
 */
async function findCalendarFrame(page) {
  for (const frame of allFrames(page)) {
    const label = await readMonthLabel(frame);
    if (label) {
      const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === label.month.toLowerCase());
      if (monthIndex >= 0) return { frame, year: label.year, monthIndex };
    }
  }
  return null;
}

/**
 * Click a "next month" control inside the frame. We try, in order:
 *  - a configured selector
 *  - common aria-labels / chevron buttons near the month label
 */
async function clickNextMonth(frame, configuredSelector) {
  if (await tryClick(frame, configuredSelector)) return true;
  const candidates = [
    '[aria-label*="next" i]',
    'button[title*="next" i]',
    '.next', '.arrow-right', '.chevron-right',
    'button:has(svg):right-of(:text-matches("20\\d\\d"))',
  ];
  for (const c of candidates) {
    if (await tryClick(frame, c, 1500)) return true;
  }
  // Last resort: the right-most clickable in the calendar header row.
  try {
    const clicked = await frame.evaluate(() => {
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const re = new RegExp('\\b(' + months.join('|') + ')\\s+20\\d\\d\\b', 'i');
      const labels = [...document.querySelectorAll('*')].filter((e) => re.test((e.innerText || '').trim()) && (e.innerText || '').trim().length < 40);
      const label = labels.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0];
      if (!label) return false;
      const header = label.closest('div, header, section') || label.parentElement;
      const clickables = [...header.querySelectorAll('button, a, [role=button], svg, [class*=arrow], [class*=chevron], [class*=next]')];
      const lr = label.getBoundingClientRect();
      const right = clickables
        .map((el) => ({ el, x: el.getBoundingClientRect().left }))
        .filter((o) => o.x > lr.right - 5)
        .sort((a, b) => a.x - b.x)[0];
      if (!right) return false;
      (right.el.closest('button, a, [role=button]') || right.el).click();
      return true;
    });
    if (clicked) return true;
  } catch { /* ignore */ }
  return false;
}

/**
 * Advance the calendar until it shows the target year/month.
 * Returns the frame on success, throws on failure.
 */
async function gotoMonth(page, targetYear, targetMonthIndex, cfg) {
  let found = await findCalendarFrame(page);
  if (!found) throw new Error('Could not locate a month calendar on the page.');

  for (let i = 0; i < 24; i++) {
    if (found.year === targetYear && found.monthIndex === targetMonthIndex) {
      return found.frame;
    }
    const targetAhead =
      targetYear > found.year ||
      (targetYear === found.year && targetMonthIndex > found.monthIndex);

    const moved = targetAhead
      ? await clickNextMonth(found.frame, cfg.selectors && cfg.selectors.nextMonth)
      : await tryClick(found.frame, (cfg.selectors && cfg.selectors.prevMonth) || '[aria-label*="prev" i], .prev, .arrow-left, .chevron-left');

    if (!moved) throw new Error('Found the calendar but could not click the month navigation arrow.');
    await wait(700);
    found = await findCalendarFrame(page);
    if (!found) throw new Error('Lost the calendar after navigating months.');
  }
  throw new Error(`Could not reach ${MONTHS[targetMonthIndex]} ${targetYear} within 24 steps.`);
}

/**
 * For a given day-of-month, decide whether it is bookable in the calendar.
 * Generic heuristic: a day is UNavailable if it is disabled, struck-through,
 * greyed/low-opacity, or marked with an unavailable-ish class/attribute.
 *
 * Returns { available: boolean, found: boolean }.
 */
async function isDayAvailable(frame, day, configuredDaySelector) {
  return frame.evaluate(
    ({ day, configuredDaySelector }) => {
      const num = String(day);

      function candidatesFor(n) {
        let els;
        if (configuredDaySelector) {
          els = [...document.querySelectorAll(configuredDaySelector)];
        } else {
          els = [...document.querySelectorAll('[role=gridcell], td, button, a, div, span, li')];
        }
        return els.filter((el) => {
          const txt = (el.textContent || '').trim();
          if (txt !== n) return false;
          // prefer leaf-ish nodes (the actual day cell, not a wrapper)
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.width < 200 && rect.height < 200;
        });
      }

      const els = candidatesFor(num);
      if (!els.length) return { available: false, found: false };

      // If any candidate looks clearly bookable, the day is available.
      let sawUnavailable = false;
      for (const el of els) {
        const style = getComputedStyle(el);
        const cls = (el.className && el.className.toString ? el.className.toString() : '').toLowerCase();
        const aria = (el.getAttribute('aria-disabled') || '').toLowerCase();
        const disabledAttr = el.hasAttribute('disabled') || aria === 'true';
        const looksDisabledClass = /(disabl|unavail|blocked|booked|off|past|muted|inactive|not-?allow|grey|gray|faded)/.test(cls);
        const strike = (style.textDecorationLine || style.textDecoration || '').includes('line-through');
        const faded = parseFloat(style.opacity || '1') < 0.45;
        const noPointer = style.pointerEvents === 'none' || style.cursor === 'not-allowed' || style.cursor === 'default';

        const unavailable = disabledAttr || looksDisabledClass || strike || faded;
        if (unavailable) {
          sawUnavailable = true;
          continue;
        }

        // Positive signal: clickable-looking and not visually disabled.
        const clickable =
          el.tagName === 'BUTTON' ||
          el.tagName === 'A' ||
          el.getAttribute('role') === 'button' ||
          el.getAttribute('role') === 'gridcell' ||
          style.cursor === 'pointer' ||
          !noPointer;
        if (clickable) return { available: true, found: true };
      }
      return { available: false, found: !sawUnavailable ? els.length > 0 : true };
    },
    { day, configuredDaySelector: configuredDaySelector || '' }
  );
}

/** Click a specific day number in the calendar frame. */
async function clickDay(frame, day, configuredDaySelector) {
  const clicked = await frame.evaluate(
    ({ day, configuredDaySelector }) => {
      const num = String(day);
      const base = configuredDaySelector
        ? [...document.querySelectorAll(configuredDaySelector)]
        : [...document.querySelectorAll('[role=gridcell], td, button, a, div, span, li')];
      const els = base.filter((el) => {
        const txt = (el.textContent || '').trim();
        const rect = el.getBoundingClientRect();
        return txt === num && rect.width > 0 && rect.height > 0 && rect.width < 200 && rect.height < 200;
      });
      const target = els.find((el) => {
        const style = getComputedStyle(el);
        const cls = (el.className && el.className.toString ? el.className.toString() : '').toLowerCase();
        const bad = el.hasAttribute('disabled') ||
          (el.getAttribute('aria-disabled') || '').toLowerCase() === 'true' ||
          /(disabl|unavail|blocked|past|inactive)/.test(cls) ||
          (style.textDecorationLine || '').includes('line-through') ||
          parseFloat(style.opacity || '1') < 0.45;
        return !bad;
      });
      if (!target) return false;
      (target.closest('button, a, [role=button], [role=gridcell]') || target).click();
      return true;
    },
    { day, configuredDaySelector: configuredDaySelector || '' }
  );
  return clicked;
}

/** Fill the first matching field across a list of selectors. */
async function fillFirst(scope, selectors, value, timeout = 3000) {
  for (const sel of selectors) {
    if (!sel) continue;
    try {
      const loc = scope.locator(sel).first();
      await loc.waitFor({ state: 'visible', timeout });
      await loc.fill(value, { timeout });
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/**
 * Sign in to the booking account (required to reach the pet/calendar).
 * Generic + best-effort: tries an optional login URL, otherwise finds a
 * password field (clicking an account/sign-in link first if needed).
 * Returns { ok, detail }.
 */
async function login(page, cfg) {
  const email = process.env.BOOKING_EMAIL;
  const pass = process.env.BOOKING_PASSWORD;
  const lg = (cfg && cfg.login) || {};
  if (!lg.enabled || !email || !pass) return { ok: false, detail: 'login disabled or no credentials' };

  // Log in from the homepage, where the email→password modal lives.
  if (lg.loginUrl) {
    try { await page.goto(lg.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch { /* ignore */ }
    await wait(3500);
  }

  const emailSelectors = [lg.emailSelector, 'input[type=email]', 'input[placeholder*="email" i]', 'input[name*="email" i]'].filter(Boolean);
  const emailVisible = async () => {
    for (const s of emailSelectors) {
      try { if (await page.locator(s).first().isVisible({ timeout: 500 })) return true; } catch { /* next */ }
    }
    return false;
  };

  // The modal may auto-open; if not, click the header "Sign in".
  let modal = await emailVisible();
  if (!modal) {
    await tryClick(page, lg.signInSelector || 'text=Sign in', 6000);
    await wait(2000);
    modal = await emailVisible();
  }

  // Step 1 — "Please enter your email": fill email, click CONTINUE.
  const emailOk = await fillFirst(page, emailSelectors, email);
  const continued = await tryClick(page, 'text=/^\\s*continue\\s*$/i', 5000);

  // Step 2 — "Returning customer, sign in". The password step renders only after
  // the server validates the email, so poll for the field (can take seconds).
  const passSelectors = [lg.passwordSelector, 'input[type=password]', 'input[placeholder*="password" i]'].filter(Boolean);
  let passField = null;
  for (let i = 0; i < 10 && !passField; i++) {
    await wait(1500);
    for (const s of passSelectors) {
      try {
        const loc = page.locator(s).first();
        if (await loc.isVisible({ timeout: 400 })) { passField = loc; break; }
      } catch { /* next selector */ }
    }
  }
  let passOk = false;
  if (passField) {
    try { await passField.fill(pass, { timeout: 4000 }); passOk = true; } catch { /* leave false */ }
  }

  let submitted = await tryClick(page, lg.submitSelector || 'text=/^\\s*login\\s*$/i', 6000);
  if (!submitted) submitted = await tryClick(page, 'button[type=submit]', 3000);
  await wait(5000);

  // Heuristic: header switches to "Hi, <name>" / shows a logout control.
  const loggedIn = await page.evaluate(() =>
    /hi,\s|my account|log\s?out|sign\s?out/i.test(document.body.innerText || '')).catch(() => null);

  return {
    ok: Boolean(emailOk && passOk && submitted),
    detail: `modal:${modal} email:${emailOk} continue:${continued} password:${passOk} login:${submitted} loggedIn:${loggedIn}`,
  };
}

/**
 * Complete the "Complete waivers" step: open the waiver, click AGREE in the
 * modal, and tick any agreement checkboxes. Best-effort; returns a log string.
 */
async function acceptWaivers(page) {
  const log = [];
  // Open the waiver document if it's a link, then agree inside the modal.
  if (await tryClick(page, 'text=/grooming waiver|view waiver|read waiver/i', 1500)) {
    await wait(1200);
    if (await tryClick(page, 'text=/^\\s*agree\\s*$/i', 4000)) log.push('clicked AGREE in waiver modal');
    await wait(1000);
  }
  // Tick any remaining unchecked agreement checkboxes.
  for (const f of page.frames()) {
    try {
      const boxes = f.locator('input[type=checkbox]');
      const n = await boxes.count();
      for (let i = 0; i < n; i++) {
        const b = boxes.nth(i);
        if (await b.isVisible().catch(() => false) && !(await b.isChecked().catch(() => false))) {
          await b.check({ timeout: 2000 }).catch(async () => { await b.click({ timeout: 2000 }).catch(() => {}); });
          log.push('ticked a waiver checkbox');
        }
      }
    } catch { /* next frame */ }
  }
  return log.join('; ') || 'no waiver controls found';
}

module.exports = {
  MONTHS,
  wait,
  tryClick,
  fillFirst,
  login,
  acceptWaivers,
  findCalendarFrame,
  readMonthLabel,
  gotoMonth,
  isDayAvailable,
  clickDay,
};
