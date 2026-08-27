// The self-improvement step: failure traces in, a rewritten procedural memory out.
//
// This is the ONLY place the API is called. Episodes are pure Playwright, so a
// full 3-arm x 3-seed x 3-generation experiment costs ~27 requests, not thousands.
//
// Arms A and B receive byte-identical failure evidence. The ONLY differences are
// the constraint paragraph below and which validator gates the result. That is
// the ablation.

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { validate } from './memory.js';

const MODEL = process.env.SELECTOR_ROT_MODEL || 'claude-opus-5';

const EditSchema = z.object({
  analysis: z.string().describe('What failure classes the traces show, and why the current rules miss them.'),
  memorySource: z.string().describe('The complete replacement contents of the memory module.'),
});

const HOOK_CONTRACT = `
You are editing the procedural memory of a browser agent. Memory is an ES module
exporting a \`rules\` array. Each rule is:

  { id: string, hook: 'beforeStep' | 'dateFilter' | 'afterAdvance', note: string, run: async fn }

The agent's base policy is fixed and cannot be changed. Your rules run as middleware:

  beforeStep(page, ctx)   ctx = { stepKey, stepIndex, iteration }
                          Runs before the agent acts on each wizard step.
                          \`page\` is a Playwright Page. Return value ignored.

  dateFilter(page, cell)  cell = { date, attrs, className, background, color, text }
                          \`attrs\` is a plain object of the element's attributes.
                          Return false to reject a candidate day, true to keep it.
                          The base policy admits any day whose BACKGROUND LOOKS GREEN.

  afterAdvance(page, ctx) ctx = { stepIndexBefore, stepIndexAfter, blockedBefore,
                                  blockedAfter, booked, candidateIndex,
                                  candidatesTotal, clickOk, clickError }
                          Return { retryNext: true } to make the agent try the next
                          advance-button candidate. The base policy clicks exactly one
                          candidate and never verifies that it worked.
                          \`blockedAfter > blockedBefore\` means the FORM rejected the
                          submission (a required field was unset) - a different
                          candidate will not help.

Rules run in array order. You are replacing the whole module, so you may delete or
rewrite existing rules, not only append. Keep rules that are working: a rewrite that
breaks a previously passing task is scored as a regression.

Hard integrity rules (violating any of these voids the edit):
  - Never read window.__SPEC__, window.__STATE__, or any oracle/answer-key value.
  - Never write or touch the data-booked attribute.
  - Solve the task by driving the page, never by asserting success.

Output the complete module source, starting with \`export const rules = [\`.
`.trim();

const CONSTRAINT_B = `
GENERALITY CONSTRAINT (enforced by a validator; a violating edit is rejected):

Your rules must not contain literal site-specific vocabulary - no CSS class names
copied from the traces, no flow/site identifiers. Standard semantic hooks ARE
allowed and encouraged: aria-* attributes, role, the disabled property, element
tag names, and generic structural relationships.

Write lessons about how web wizards behave, not about how these particular pages
are marked up.
`.trim();

const CONSTRAINT_A = `
There is no constraint on how you write the rules. Use whatever is most effective,
including anything you observed in the traces.
`.trim();

function trimTrace(trace) {
  return trace.slice(-8).map((t) => {
    const o = { ...t };
    if (o.error) o.error = String(o.error).slice(0, 120);
    return o;
  });
}

function trimDigest(d) {
  if (!d) return null;
  return {
    body: d.body,
    interactive: d.interactive.slice(0, 14).map((e) => ({
      tag: e.tag, text: e.text, attrs: e.attrs,
      background: e.background,
      ...(e.position === 'fixed' ? { position: e.position, zIndex: e.zIndex } : {}),
    })),
  };
}

export function buildFailureReport(results, limit = 10) {
  const failures = results.filter((r) => !r.success);
  const sample = failures.slice(0, limit);
  return {
    total: results.length,
    passed: results.length - failures.length,
    failedProfiles: [...new Set(failures.map((f) => f.profile))],
    cases: sample.map((f) => ({
      flow: f.flowId,
      profile: f.profile,
      booked: f.booked,
      bookedDate: f.bookedDate,
      expectedDate: f.expected,
      trace: trimTrace(f.trace),
      pageAtFailure: trimDigest(f.digest),
    })),
  };
}

/**
 * Propose a new memory module from training failures.
 * Returns { ok, memorySource?, analysis?, rejections: [] }.
 */
export async function proposeEdit({ currentMemory, report, arm, scratchDir, client }) {
  const anthropic = client || new Anthropic();
  const rejections = [];

  const baseUser = [
    '## Current procedural memory',
    '```javascript',
    currentMemory,
    '```',
    '',
    '## Results on the training flows',
    `${report.passed}/${report.total} tasks passed.`,
    `Failing perturbation profiles: ${report.failedProfiles.join(', ') || 'none'}`,
    '',
    '## Failure evidence',
    '```json',
    JSON.stringify(report.cases, null, 1),
    '```',
    '',
    'Rewrite the memory module so these failures stop happening.',
  ].join('\n');

  const messages = [{ role: 'user', content: baseUser }];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [HOOK_CONTRACT, arm === 'B' ? CONSTRAINT_B : CONSTRAINT_A].join('\n\n'),
      output_config: { effort: 'high', format: zodOutputFormat(EditSchema) },
      messages,
    });

    if (response.stop_reason === 'refusal') {
      rejections.push('model declined the request');
      return { ok: false, rejections };
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      rejections.push('structured output did not parse');
      continue;
    }

    const check = await validate(parsed.memorySource, arm, scratchDir);
    if (check.ok) {
      return { ok: true, memorySource: parsed.memorySource, analysis: parsed.analysis, rejections };
    }

    rejections.push(check.reason);
    messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
    messages.push({
      role: 'user',
      content: `That edit was rejected: ${check.reason}\n\nRewrite it so it passes. Return the complete module again.`,
    });
  }

  return { ok: false, rejections };
}
