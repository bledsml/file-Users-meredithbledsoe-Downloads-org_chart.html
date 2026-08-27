// REFERENCE MEMORY — the harness's own sanity check, never shown to the self-editor.
//
// Proves the ceiling is reachable: that every injected failure mode is fixable
// through the three hook points using only site-agnostic DOM semantics. If this
// file stops scoring 100%, the harness is broken, not the agent.

export const rules = [
  {
    id: 'dismiss-overlays',
    hook: 'beforeStep',
    note: 'A dialog covering the page intercepts clicks. Close it before acting.',
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
    note: 'Controls can render disabled until client-side hydration finishes.',
    async run(page) {
      await page
        .waitForFunction(
          () => [...document.querySelectorAll('button')].some((b) => !b.disabled),
          { timeout: 3000 },
        )
        .catch(() => {});
    },
  },
  {
    id: 'reject-styled-but-disabled-days',
    hook: 'dateFilter',
    note: 'Appearance is not availability. Trust the accessibility state.',
    async run(page, cell) {
      return cell.attrs['aria-disabled'] !== 'true' && cell.attrs.disabled == null;
    },
  },
  {
    id: 'verify-advance-actually-advanced',
    hook: 'afterAdvance',
    note: 'A control whose label matches the CTA verb may navigate nothing. If the '
        + 'step did not change and the form did not reject the input, try the next candidate.',
    async run(page, ctx) {
      if (ctx.booked) return {};
      const stalled = ctx.stepIndexAfter === ctx.stepIndexBefore;
      const rejectedByForm = ctx.blockedAfter > ctx.blockedBefore;
      return { retryNext: stalled && !rejectedByForm };
    },
  },
];
