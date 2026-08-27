// Offline stand-in for the Claude client.
//
// Replays a scripted two-stage improvement so the ENTIRE loop — evaluate,
// self-edit, validate, re-evaluate, score — can be verified with no API key and
// no token spend. Use it to confirm the harness works before running the real
// experiment. It proves the plumbing, not the hypothesis: the staged edits are
// written by hand, so a mock run says nothing about whether a model can
// discover them.

const STAGE_1 = `export const rules = [
  {
    id: 'dismiss-blocking-dialogs',
    hook: 'beforeStep',
    note: 'A dialog can cover the page and intercept clicks. Close it first.',
    async run(page) {
      for (const dlg of await page.$$('[role="dialog"]')) {
        const closer = await dlg.$('button');
        if (closer) await closer.click({ timeout: 800 }).catch(() => {});
      }
    },
  },
  {
    id: 'await-hydration',
    hook: 'beforeStep',
    note: 'Controls may render disabled until hydration completes.',
    async run(page) {
      await page.waitForFunction(
        () => [...document.querySelectorAll('button')].some((b) => !b.disabled),
        { timeout: 3000 },
      ).catch(() => {});
    },
  },
];
`;

const STAGE_2 = STAGE_1.replace(/\n\];\n$/, `
  {
    id: 'appearance-is-not-availability',
    hook: 'dateFilter',
    note: 'Styling can present a day as open while it is disabled. Trust state.',
    async run(page, cell) {
      return cell.attrs['aria-disabled'] !== 'true' && cell.attrs.disabled == null;
    },
  },
  {
    id: 'verify-the-step-advanced',
    hook: 'afterAdvance',
    note: 'A control matching the CTA verb may navigate nothing. If the step did '
        + 'not change and the form did not reject input, try the next candidate.',
    async run(page, ctx) {
      if (ctx.booked) return {};
      return { retryNext: ctx.stepIndexAfter === ctx.stepIndexBefore
                          && ctx.blockedAfter === ctx.blockedBefore };
    },
  },
];
`);

export function createMockClient() {
  let call = 0;
  return {
    messages: {
      async parse() {
        const stage = call++ === 0 ? STAGE_1 : STAGE_2;
        return {
          stop_reason: 'end_turn',
          parsed_output: {
            analysis: call === 1
              ? 'Clicks are intercepted by dialogs, and controls are disabled during hydration.'
              : 'Remaining failures: days that look open but are disabled, and an advance control that does not advance.',
            memorySource: stage,
          },
        };
      },
    },
  };
}
