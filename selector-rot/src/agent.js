// The web agent.
//
// The BASE POLICY is deliberately brittle, in exactly the ways a hand-written
// Playwright script is brittle before a human has debugged it:
//   * it does not look for overlays before clicking
//   * it does not wait for hydration
//   * it decides a day is available from its BACKGROUND COLOUR
//   * it clicks the first advance-looking button and never checks it worked
//
// Learned rules from procedural memory run as middleware at three hook points.
// Everything the agent can learn, it learns by adding rules — the base policy
// below is never edited.

import { renderHTML } from './flows.js';
import { byHook } from './memory.js';

const ADVANCE_RE = /\b(next|continue|proceed|go on|book|confirm|complete|finish|reserve)\b/i;
// Backstop only. Interception is hit-tested above, so the sole remaining way to
// reach this timeout is an element that is stably un-clickable (e.g. aria-disabled).
// That is a stable property, so the timeout length cannot change an outcome — only
// how long we wait to learn it. Deliberately NOT pre-checked: "Timeout exceeded" is
// what a real Playwright script sees, whereas "element is disabled" would leak the
// lesson the self-editor is supposed to discover.
const CLICK_TIMEOUT = 700;
const MAX_ITERS = 14;

function greenish(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
  if (!m) return false;
  const [r, g, b] = [+m[1], +m[2], +m[3]];
  return g > r + 8 && g > b + 8;
}

const bodyAttr = (page, name) =>
  page.evaluate((n) => document.body.getAttribute(n), name);

async function advanceCandidates(page) {
  const buttons = await page.$$('button, [role="button"]');
  const out = [];
  for (const b of buttons) {
    const info = await b.evaluate((el) => ({
      text: (el.textContent || '').trim(),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
    if (info.visible && !info.disabled && ADVANCE_RE.test(info.text)) {
      out.push({ handle: b, text: info.text });
    }
  }
  return out;
}

async function dateCells(page) {
  const handles = await page.$$('[data-date]');
  const cells = [];
  for (const h of handles) {
    const info = await h.evaluate((el) => {
      const cs = getComputedStyle(el);
      const attrs = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      return {
        date: el.getAttribute('data-date'),
        attrs,
        className: el.className,
        background: cs.backgroundColor,
        color: cs.color,
        text: (el.textContent || '').trim(),
      };
    });
    cells.push({ ...info, handle: h });
  }
  return cells;
}

// Interception is detected by hit-testing, not by waiting for a click to time
// out. A timeout-based check makes the outcome depend on CPU load, which makes
// the whole eval non-deterministic under concurrency; a hit-test is exact and
// returns immediately. The click timeout below is a backstop, not a signal.
async function safeClick(handle) {
  const blocked = await handle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return 'element is not visible';
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top) return 'element centre is outside the viewport';
    if (top === el || el.contains(top) || el.contains(top.parentElement)) return null;
    const desc = top.tagName.toLowerCase()
      + (top.getAttribute('role') ? `[role=${top.getAttribute('role')}]` : '');
    return `click intercepted: <${desc}> is the top-most element at the click point`;
  });
  if (blocked) return { ok: false, error: blocked };
  try {
    await handle.click({ timeout: CLICK_TIMEOUT });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message.split('\n')[0] };
  }
}

/** Compact, text-only snapshot of the page for the self-editor to read. */
async function digest(page) {
  return page.evaluate(() => {
    const body = {};
    for (const a of document.body.attributes) body[a.name] = a.value;
    const interactive = [...document.querySelectorAll('button,[role="button"],[data-date],[role="option"],[role="dialog"]')]
      .slice(0, 44)
      .map((el) => {
        const cs = getComputedStyle(el);
        const attrs = {};
        for (const a of el.attributes) attrs[a.name] = a.value;
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().slice(0, 40),
          attrs,
          background: cs.backgroundColor,
          zIndex: cs.zIndex,
          position: cs.position,
        };
      });
    return { body, interactive };
  });
}

async function runRules(rules, hook, page, ctx, trace) {
  const results = [];
  for (const r of byHook(rules, hook)) {
    try {
      results.push({ id: r.id, value: await r.run(page, ctx) });
    } catch (e) {
      trace.push({ type: 'rule-error', hook, rule: r.id, error: e.message.split('\n')[0] });
      results.push({ id: r.id, value: undefined, threw: true });
    }
  }
  return results;
}

export async function runEpisode(page, spec, rules = []) {
  const trace = [];
  // NOTE: setContent() rewrites the document but reuses the JS realm, so timers
  // from the previous episode on this pooled page survive. The fixture guards
  // its own deferred boot with a per-episode token (see flows.js).
  await page.setContent(renderHTML(spec));

  // Stall detection. A stuck agent cannot recover without a rule it does not
  // have, so ending the episode early changes no outcome - it only stops us
  // paying 14 x CLICK_TIMEOUT to watch it fail. The counter resets on any real
  // progress, so a slow-but-working learned rule is never cut off.
  let stalled = 0;
  let fingerprint = null;

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    if ((await bodyAttr(page, 'data-booked')) === 'true') break;

    const fp = await page.evaluate(() => {
      const b = document.body;
      return [b.getAttribute('data-step-index'), b.getAttribute('data-blocked'),
              b.getAttribute('data-hydrated'), document.querySelectorAll('[aria-pressed]').length,
              document.querySelectorAll('[role="dialog"]').length].join('|');
    });
    if (fp === fingerprint) {
      if (++stalled >= 4) { trace.push({ type: 'stalled', iter }); break; }
    } else {
      stalled = 0;
      fingerprint = fp;
    }

    const stepKey = await bodyAttr(page, 'data-step-key');
    const stepIndex = Number(await bodyAttr(page, 'data-step-index'));

    await runRules(rules, 'beforeStep', page, { stepKey, stepIndex, iteration: iter }, trace);

    // ---- select something on this step -------------------------------------
    if (stepKey === 'date') {
      const cells = await dateCells(page);
      // BASE HEURISTIC: "it looks green, so it's open." This is the bug.
      let candidates = cells.filter((c) => greenish(c.background));
      const filters = byHook(rules, 'dateFilter');
      if (filters.length) {
        const kept = [];
        for (const c of candidates) {
          let ok = true;
          for (const r of filters) {
            try {
              if ((await r.run(page, c)) === false) { ok = false; break; }
            } catch (e) {
              trace.push({ type: 'rule-error', hook: 'dateFilter', rule: r.id, error: e.message.split('\n')[0] });
            }
          }
          if (ok) kept.push(c);
        }
        candidates = kept;
      }
      if (!candidates.length) {
        trace.push({ type: 'no-date-candidates', iter, cellsSeen: cells.length });
      } else {
        const pick = candidates[0];
        const res = await safeClick(pick.handle);
        trace.push({ type: 'click-date', iter, date: pick.date, ...res });
      }
    } else if (stepKey && stepKey !== 'confirm') {
      const opts = await page.$$(`[data-step="${stepKey}"] button:not([data-nav])`);
      if (opts.length) {
        const res = await safeClick(opts[0]);
        trace.push({ type: 'click-option', iter, step: stepKey, ...res });
      }
    }

    // ---- advance -----------------------------------------------------------
    const candidates = await advanceCandidates(page);
    if (!candidates.length) {
      trace.push({ type: 'no-advance-candidates', iter, stepKey });
      break;
    }

    for (let attempt = 0; attempt < candidates.length; attempt++) {
      const before = Number(await bodyAttr(page, 'data-step-index'));
      const blockedBefore = Number((await bodyAttr(page, 'data-blocked')) || 0);

      const res = await safeClick(candidates[attempt].handle);
      trace.push({ type: 'click-advance', iter, attempt, label: candidates[attempt].text, ...res });

      const after = Number(await bodyAttr(page, 'data-step-index'));
      const blockedAfter = Number((await bodyAttr(page, 'data-blocked')) || 0);
      const booked = (await bodyAttr(page, 'data-booked')) === 'true';

      const verdicts = await runRules(rules, 'afterAdvance', page, {
        stepIndexBefore: before, stepIndexAfter: after,
        blockedBefore, blockedAfter, booked,
        candidateIndex: attempt, candidatesTotal: candidates.length,
        clickOk: res.ok, clickError: res.error,
      }, trace);

      const retry = verdicts.some((v) => v.value && v.value.retryNext);
      // BASE POLICY: one click, no verification. Only a learned rule retries.
      if (!retry || booked) break;
    }
  }

  const booked = (await bodyAttr(page, 'data-booked')) === 'true';
  const bookedDate = await bodyAttr(page, 'data-booked-date');
  const success = booked && bookedDate === spec.oracleDate;

  return {
    success,
    booked,
    bookedDate,
    expected: spec.oracleDate,
    trace,
    digest: success ? null : await digest(page),
  };
}
