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

module.exports = {
  MONTHS,
  wait,
  tryClick,
  findCalendarFrame,
  readMonthLabel,
  gotoMonth,
  isDayAvailable,
  clickDay,
};
