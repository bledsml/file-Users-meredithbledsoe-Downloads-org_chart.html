# SelectorRot

**An RSI eval for web agents.** Not "can an agent self-improve" — almost anything
improves on the tasks you let it retry. The question here is narrower and testable
in an afternoon:

> Does failure-driven self-editing produce **transferable procedural knowledge**,
> or does it just memorize the pages it was shown?

The agent is given a fixed, deliberately brittle base policy and a **procedural
memory** of executable rules. It attempts booking flows, fails, reads its own
failure traces, and rewrites its memory. Then it does it again. Held-out flows it
has never seen — and never self-improves on — are what actually get measured.

---

## Why the failure modes are what they are

Every perturbation in this harness is a bug a real browser agent hit in
production, taken from `../grooming-watcher`'s git history — a Playwright bot that
needed **~9 rounds of human debugging** to book one appointment at one groomer:

| Perturbation | The commit it comes from |
|---|---|
| `interstitial` | `Login: dismiss marketing popup, force Sign in modal` |
| `addonPopup` | `close the add-ons popup before each NEXT (it blocked advancing)` |
| `lazyHydration` | `robust wizard nav — wait for hydration` |
| `phantomAvailability` | `dump day-cell styling to fix false-positive availability` |
| `decoyAdvance` | `robust wizard nav — verify NEXT advanced` |
| `classRename` | selector rot: the failure that arrives on its own, later |

That human debugging loop — trace, diagnose, patch, retry — is exactly the loop
this project automates. Gen-0 needed nine human interventions. The metric is how
many it needs after *k* rounds of editing itself.

---

## Quickstart

```bash
npm install

# 1. Harness check — no API key, no token spend. Arm C is the no-self-edit control.
node src/run.js --arms C --seeds 1 --generations 1
#    expect: 31/90, and 30/30 on the three control profiles

# 2. Whole loop offline, with scripted edits replayed instead of API calls.
node src/run.js --arms A,B,C --seeds 1 --generations 3 --mock

# 3. The real experiment (needs ANTHROPIC_API_KEY).
node src/run.js
```

A generation is ~16s (90 episodes, 12-way concurrency). The full default
experiment is 27 evaluations plus **18 API calls** — episodes are pure Playwright,
so the model is only ever invoked to *edit the memory*, never to click a button.

---

## The experiment

Three arms, identical failure evidence, differing only in what the self-editor is
allowed to write:

| Arm | Self-edit | Constraint |
|---|---|---|
| **A** | yes | unconstrained |
| **B** | yes | may not contain literal class names or site ids |
| **C** | **no** | control — memory stays empty |

**Hypothesis:** self-editing produces transferable knowledge *only when the edit
is forced to be site-agnostic*. If B beats A on held-out while A ties or beats B
on train, the constraint **is** the generalization mechanism. If A matches B on
held-out, the constraint is unnecessary and the hypothesis is wrong — which is a
perfectly good afternoon's result, and worth reporting as one.

### Splits

10 flows × 9 perturbation profiles = **90 tasks**. Six flows are `train`; four are
`heldout` and are never fed to the self-editor. Two held-out flows use a DOM
dialect (`hashed` — bundler-mangled class names) the agent has never seen, which
is the sharpest available test of transfer.

### Metrics

| Metric | Reads |
|---|---|
| Gen-*k* pass rate, held-out | the RSI claim — slope > 0 or bust |
| **Transfer delta** = Δheld-out − Δtrain | ≤ 0 means the gains were memorization |
| **Regression rate** | tasks that passed at gen *k−1* and fail at gen *k* |
| Seed spread (min–max) | whether any of the above survives noise |

Regression rate is the one people forget. Unconstrained self-modification is not
monotone, and an RSI system that improves on average while silently breaking what
already worked has not improved.

---

## How the agent works

The **base policy is fixed and never edited.** It is brittle in the same ways an
undebugged Playwright script is brittle: it doesn't check for overlays, doesn't
wait for hydration, decides a day is bookable **from its background colour**, and
clicks the first advance-looking button without checking it did anything.

Learning happens only by writing rules into procedural memory, at three hooks:

```js
beforeStep(page, ctx)    // before acting on a step — dismiss overlays, wait for hydration
dateFilter(page, cell)   // return false to reject a candidate day
afterAdvance(page, ctx)  // return { retryNext: true } to try the next advance candidate
```

`memory/reference.mjs` is a hand-written memory that scores **90/90**. It is the
harness's own sanity check, never shown to the self-editor: it proves the ceiling
is reachable through these three hooks using only site-agnostic DOM semantics. If
it stops scoring 100%, the harness is broken, not the agent.

### Integrity guards

Two reward hacks are blocked in **all** arms, because both are things a capable
model will find:

- Reading the fixture's own answer key (`window.__SPEC__`, the availability list).
- Writing `data-booked` — asserting success instead of achieving it.

A rule tripping either is discarded and the rejection is recorded in the results.

---

## What this does not establish

Read this section before quoting a number from this harness.

1. **The fixtures are synthetic.** The pages and their failure modes were written
   by hand. They are modelled on real bugs, but a model may find authored
   perturbations easier than real-world rot. **Absolute pass rates are optimistic;
   the arm-vs-arm comparison is the result.**
2. **The generality validator is lexical, not semantic.** It rejects literal class
   tokens. It cannot stop a rule from encoding site-specific *structure* — "click
   the third button" — without naming anything. Arm B's constraint is therefore a
   lower bound on memorization, not a proof of its absence.
3. **The fixtures are more legible than the real web.** They expose `[data-date]`
   and `data-step-key`. Real sites frequently offer nothing so semantic, so the
   navigation half of the task is easier here than in production. The availability
   half (styling vs. `aria-disabled`) is realistic.
4. **n is small.** 4 held-out flows. Error bars are wide; report the seed spread,
   never a single number.
5. **Mock mode proves plumbing, not the hypothesis.** Its edits are hand-written.

### Moving toward real sites

The honest next step is replacing authored fixtures with frozen captures of real
booking flows — `page.content()` plus computed styles, saved as static replayable
DOM, one hand-written oracle each. That is deliberately **not** implemented here:
it needs a live site per fixture, so it cannot be written and verified in the same
sitting as the rest of this. The seam is `src/flows.js` — anything that can
produce an HTML string and an oracle date drops straight into the harness.

---

## Layout

```
src/flows.js       fixture generator: dialects, perturbation rendering, in-page wizard
src/perturb.js     the 9 perturbation profiles
src/agent.js       fixed brittle base policy + the three learning hooks
src/memory.js      rule loading, integrity + generality validators
src/selfedit.js    the only API call: failure traces -> rewritten memory
src/metrics.js     pass rates, transfer delta, regressions, seed spread
src/run.js         experiment driver
memory/reference.mjs  hand-written 90/90 memory (harness sanity check)
```

Per-generation memory is written to `results/memory/`. `diff` gen 0 against the
last generation to read, in English and executable code, what the system learned.
That diff is the demo.
