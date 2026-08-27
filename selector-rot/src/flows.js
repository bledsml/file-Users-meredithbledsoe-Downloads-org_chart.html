// Flow fixtures: parameterized booking wizards rendered as self-contained HTML.
//
// Each template is a different DOM "dialect" — different class conventions, date
// widgets, and option widgets — so that a train/held-out split across templates
// actually tests transfer rather than memorization.

const DATES = Array.from({ length: 14 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);

// The in-page wizard runtime. Deliberately contains no backticks so it can be
// embedded in a template literal below.
const RUNTIME = `
(function () {
  var S = window.__SPEC__;
  var stage = document.getElementById('stage');
  var advance = document.getElementById('advance');
  var state = { i: 0, sel: {}, blocked: 0 };
  window.__STATE__ = state;

  function el(tag, cls, attrs, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }

  function clearPressed(scope, sel) {
    Array.prototype.forEach.call(scope.querySelectorAll(sel), function (o) {
      o.removeAttribute('aria-pressed');
      o.classList.remove(S.cls.chosen);
    });
  }

  function renderOptions(step) {
    var wrap = el('div', S.cls.group, { 'data-step': step.key });
    wrap.appendChild(el('h2', S.cls.heading, null, step.title));
    step.options.forEach(function (opt) {
      var b = el('button', S.cls.option, { type: 'button', 'data-value': opt }, opt);
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-disabled') === 'true' || b.disabled) return;
        state.sel[step.key] = opt;
        clearPressed(wrap, '.' + S.cls.option);
        b.setAttribute('aria-pressed', 'true');
        b.classList.add(S.cls.chosen);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function dateNode(d, usable, looksOpen) {
    var tag = S.dateWidget === 'listbox' ? 'div' : (S.dateWidget === 'table' ? 'td' : 'button');
    var attrs = { 'data-date': d };
    if (S.dateWidget === 'listbox') attrs.role = 'option';
    if (tag === 'button') attrs.type = 'button';
    if (!usable) attrs['aria-disabled'] = 'true';
    // looksOpen controls APPEARANCE only. A phantom cell looks open but is not usable.
    var cls = S.cls.day + ' ' + (looksOpen ? S.cls.dayOpen : S.cls.dayShut);
    var n = el(tag, cls, attrs, String(parseInt(d.slice(-2), 10)));
    n.style.background = looksOpen ? '#d8f5e3' : '#e6e6e6';
    n.style.color = looksOpen ? '#0b5c33' : '#9a9a9a';
    n.addEventListener('click', function () {
      if (n.getAttribute('aria-disabled') === 'true') return;
      state.sel.date = d;
      clearPressed(stage, '[data-date]');
      n.setAttribute('aria-pressed', 'true');
      n.classList.add(S.cls.chosen);
    });
    return n;
  }

  function renderDates(step) {
    var wrap = el('div', S.cls.group, { 'data-step': 'date' });
    wrap.appendChild(el('h2', S.cls.heading, null, step.title));
    if (S.perturb.decoyAdvance) {
      // A month-nav control whose label collides with the primary CTA's verb.
      var nav = el('button', S.cls.option, { type: 'button', 'data-nav': 'month' }, S.advanceLabel + ' month');
      nav.addEventListener('click', function () { /* navigates nothing; the wizard does not advance */ });
      wrap.appendChild(nav);
    }
    var host;
    if (S.dateWidget === 'table') {
      var t = el('table', S.cls.calendar, null);
      host = el('tr', null, null);
      t.appendChild(el('tbody', null, null)).appendChild(host);
      wrap.appendChild(t);
    } else {
      host = el('div', S.cls.calendar, S.dateWidget === 'listbox' ? { role: 'listbox' } : null);
      wrap.appendChild(host);
    }
    S.dates.forEach(function (d) {
      var usable = S.available.indexOf(d) >= 0;
      var phantom = S.phantom.indexOf(d) >= 0;
      host.appendChild(dateNode(d, usable, usable || phantom));
    });
    return wrap;
  }

  function renderConfirm(step) {
    var wrap = el('div', S.cls.group, { 'data-step': 'confirm' });
    wrap.appendChild(el('h2', S.cls.heading, null, step.title));
    var keys = Object.keys(state.sel);
    keys.forEach(function (k) {
      wrap.appendChild(el('p', S.cls.summary, { 'data-summary': k }, k + ': ' + state.sel[k]));
    });
    return wrap;
  }

  function currentStep() { return S.steps[state.i]; }

  function render() {
    stage.innerHTML = '';
    var step = currentStep();
    if (!step) return;
    document.body.setAttribute('data-step-key', step.key);
    document.body.setAttribute('data-step-index', String(state.i));
    if (step.key === 'date') stage.appendChild(renderDates(step));
    else if (step.key === 'confirm') stage.appendChild(renderConfirm(step));
    else stage.appendChild(renderOptions(step));
    advance.textContent = step.key === 'confirm' ? S.confirmLabel : S.advanceLabel;
  }

  function satisfied(step) {
    if (step.key === 'confirm') return true;
    return state.sel[step.key] != null;
  }

  advance.addEventListener('click', function () {
    if (advance.disabled) return;
    var step = currentStep();
    if (!satisfied(step)) {
      state.blocked++;
      document.body.setAttribute('data-blocked', String(state.blocked));
      return;
    }
    if (step.key === 'confirm') {
      document.body.setAttribute('data-booked', 'true');
      document.body.setAttribute('data-booked-date', state.sel.date || '');
      stage.innerHTML = '';
      stage.appendChild(el('h2', S.cls.heading, { 'data-confirmation': 'true' }, 'Appointment confirmed'));
      return;
    }
    state.i++;
    render();
    if (S.perturb.addonPopup && step.key === S.steps[0].key) showPopup('addon');
  });

  function showPopup(kind) {
    var ovl = el('div', S.cls.overlay, { role: 'dialog', 'data-overlay': kind });
    ovl.style.cssText = 'position:fixed;inset:0;background:rgba(10,12,18,.55);z-index:9999;display:flex;align-items:center;justify-content:center';
    var box = el('div', S.cls.overlayBox, null);
    box.style.cssText = 'background:#fff;padding:24px;border-radius:12px;max-width:320px';
    box.appendChild(el('p', null, null, kind === 'addon' ? 'Add a nail trim for $15?' : 'Join our newsletter!'));
    var close = el('button', S.cls.overlayClose, { type: 'button', 'aria-label': 'Close' }, kind === 'addon' ? 'No thanks' : 'Dismiss');
    close.addEventListener('click', function () { ovl.remove(); });
    box.appendChild(close);
    ovl.appendChild(box);
    document.body.appendChild(ovl);
  }

  function boot() {
    render();
    if (S.perturb.interstitial) showPopup('marketing');
  }

  if (S.perturb.lazyHydration) {
    document.body.setAttribute('data-hydrated', 'false');
    advance.disabled = true;
    stage.appendChild(el('p', null, null, 'Loading...'));
    setTimeout(function () {
      // setContent() reuses the JS realm, so this timer can outlive its own
      // document and fire into the NEXT episode on a pooled page. The token
      // check makes a stale callback a no-op.
      if (!window.__SPEC__ || window.__SPEC__.token !== S.token) return;
      advance.disabled = false;
      document.body.setAttribute('data-hydrated', 'true');
      boot();
    }, S.perturb.lazyHydration);
  } else {
    document.body.setAttribute('data-hydrated', 'true');
    boot();
  }
})();
`;

// Dialects: same semantics, different DOM conventions.
export const DIALECTS = {
  bem: {
    dateWidget: 'grid',
    advanceLabel: 'Next',
    confirmLabel: 'Confirm booking',
    cls: {
      group: 'wizard__group', heading: 'wizard__heading', option: 'wizard__option',
      calendar: 'wizard__calendar', day: 'wizard__day', dayOpen: 'wizard__day--open',
      dayShut: 'wizard__day--shut', chosen: 'wizard__day--chosen', summary: 'wizard__summary',
      overlay: 'wizard__overlay', overlayBox: 'wizard__overlay-box', overlayClose: 'wizard__overlay-close',
    },
  },
  utility: {
    dateWidget: 'table',
    advanceLabel: 'Continue',
    confirmLabel: 'Book appointment',
    cls: {
      group: 'flex flex-col gap-2', heading: 'text-lg font-bold', option: 'btn btn-ghost',
      calendar: 'grid grid-cols-7', day: 'cell', dayOpen: 'bg-emerald-100',
      dayShut: 'bg-neutral-200', chosen: 'ring-2', summary: 'text-sm',
      overlay: 'modal-backdrop', overlayBox: 'modal-card', overlayClose: 'btn btn-sm',
    },
  },
  aria: {
    dateWidget: 'listbox',
    advanceLabel: 'Proceed',
    confirmLabel: 'Complete reservation',
    cls: {
      group: 'step-panel', heading: 'step-title', option: 'choice',
      calendar: 'daypicker', day: 'daypicker-day', dayOpen: 'is-open',
      dayShut: 'is-closed', chosen: 'is-selected', summary: 'recap-line',
      overlay: 'dialog-scrim', overlayBox: 'dialog-panel', overlayClose: 'dialog-close',
    },
  },
  // Bundler-hashed class names, as emitted by CSS Modules / styled-components.
  // Carries zero semantic signal — the hardest dialect for a memorizing agent.
  hashed: {
    dateWidget: 'grid',
    advanceLabel: 'Go on',
    confirmLabel: 'Finish',
    cls: {
      group: 'sc-1f3a9b', heading: 'sc-2b9c4e', option: 'sc-7d1e0a',
      calendar: 'sc-4a8f21', day: 'sc-9c3b7d', dayOpen: 'sc-0e5a13',
      dayShut: 'sc-6f2d88', chosen: 'sc-3b7e45', summary: 'sc-8a1c60',
      overlay: 'sc-5d9f02', overlayBox: 'sc-1c4b76', overlayClose: 'sc-2e6a39',
    },
  },
};

// Flow templates. `split` controls train/held-out membership.
export const FLOWS = [
  { id: 'groomer',    dialect: 'bem',     split: 'train', target: '2026-07-08',
    steps: [['service', 'Service', ['Full Groom', 'Bath & Brush']], ['pet', 'Pet', ['George', 'Milo']]] },
  { id: 'vet',        dialect: 'bem',     split: 'train', target: '2026-07-03',
    steps: [['service', 'Visit type', ['Checkup', 'Vaccination']], ['patient', 'Patient', ['Rex', 'Nala']]] },
  { id: 'barber',     dialect: 'utility', split: 'train', target: '2026-07-10',
    steps: [['service', 'Cut', ['Fade', 'Trim']], ['stylist', 'Barber', ['Ana', 'Dev']]] },
  { id: 'dentist',    dialect: 'utility', split: 'train', target: '2026-07-05',
    steps: [['service', 'Treatment', ['Cleaning', 'Whitening']], ['provider', 'Provider', ['Dr. Iyer', 'Dr. Cole']]] },
  { id: 'tattoo',     dialect: 'aria',    split: 'train', target: '2026-07-12',
    steps: [['service', 'Piece', ['Flash', 'Custom']], ['artist', 'Artist', ['Wren', 'Sol']]] },
  { id: 'physio',     dialect: 'aria',    split: 'train', target: '2026-07-02',
    steps: [['service', 'Session', ['Assessment', 'Follow-up']], ['therapist', 'Therapist', ['Kim', 'Ora']]] },

  // Held-out: never self-improved on. Two use a dialect ('terse') the agent has
  // never seen, which is the sharpest test of transfer.
  { id: 'kennel',     dialect: 'hashed',   split: 'heldout', target: '2026-07-07',
    steps: [['service', 'Stay', ['Overnight', 'Daycare']], ['pet', 'Pet', ['Biscuit', 'Juno']]] },
  { id: 'spa',        dialect: 'hashed',   split: 'heldout', target: '2026-07-11',
    steps: [['service', 'Treatment', ['Massage', 'Facial']], ['room', 'Room', ['Cedar', 'Fern']]] },
  { id: 'optometry',  dialect: 'aria',    split: 'heldout', target: '2026-07-04',
    steps: [['service', 'Exam', ['Routine', 'Contact fitting']], ['optician', 'Optician', ['Hale', 'Prit']]] },
  { id: 'driving',    dialect: 'utility', split: 'heldout', target: '2026-07-09',
    steps: [['service', 'Lesson', ['Highway', 'Parallel park']], ['instructor', 'Instructor', ['Bo', 'Lex']]] },
];

// Deterministic PRNG so a seed fully reproduces a run.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let episodeCounter = 0;

export function buildSpec(flow, perturb, seed = 0) {
  const rand = mulberry32(seed + flow.id.length * 7919);
  const dialect = DIALECTS[flow.dialect];

  // The target date is always genuinely available; a few others are too.
  const available = [flow.target];
  for (const d of DATES) {
    if (d !== flow.target && rand() < 0.2) available.push(d);
  }
  // Phantom cells look open but are not selectable — the false-positive failure.
  const phantom = perturb.phantomAvailability
    ? DATES.filter((d) => !available.includes(d) && rand() < 0.35)
    : [];

  let steps = flow.steps.map(([key, title, options]) => ({ key, title, options }));
  if (perturb.stepReorder && steps.length > 1) steps = [steps[1], steps[0]];
  steps = [...steps, { key: 'date', title: 'Choose a date' }, { key: 'confirm', title: 'Review' }];

  // Class renaming breaks any memorized literal selector.
  const cls = { ...dialect.cls };
  if (perturb.classRename) {
    const suffix = '-r' + Math.floor(rand() * 9000 + 1000);
    for (const k of Object.keys(cls)) {
      cls[k] = cls[k].split(' ').map((c) => c + suffix).join(' ');
    }
  }

  const oracleDate = [...available].sort()[0];

  return {
    flowId: flow.id,
    token: `${flow.id}-${seed}-${++episodeCounter}`,
    target: flow.target,
    oracleDate,
    dates: DATES,
    available,
    phantom,
    steps,
    cls,
    dateWidget: dialect.dateWidget,
    advanceLabel: dialect.advanceLabel,
    confirmLabel: dialect.confirmLabel,
    perturb,
  };
}

export function renderHTML(spec) {
  return `<!doctype html><meta charset="utf-8"><title>${spec.flowId}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#fbfbfd;color:#14161c}
  #stage{min-height:220px}
  [data-date]{display:inline-block;min-width:38px;padding:8px;margin:2px;border:1px solid #cfd4dd;border-radius:8px;cursor:pointer;text-align:center}
  button{font:inherit}
  #advance{margin-top:18px;padding:10px 18px;border-radius:8px;border:1px solid #2a3550;background:#2a3550;color:#fff;cursor:pointer}
  #advance:disabled{opacity:.5;cursor:not-allowed}
</style>
<body data-flow="${spec.flowId}">
  <div id="stage"></div>
  <button id="advance" type="button">Next</button>
  <script>window.__SPEC__ = ${JSON.stringify(spec)};</script>
  <script>${RUNTIME}</script>
</body>`;
}

export { DATES };
