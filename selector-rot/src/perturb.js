// Perturbation profiles. Each is a failure mode observed in a real browser agent
// (see grooming-watcher's git history), isolated so the metrics can attribute
// improvement to a specific class of learned behaviour.

export const PROFILES = {
  // Control: nothing broken. Any agent that fails here has a base-policy bug.
  clean: {},

  // A marketing modal covers the page on load. Clicks are intercepted.
  // -> grooming-watcher: "dismiss marketing popup, force Sign in modal"
  interstitial: { interstitial: true },

  // An upsell popup appears *after* the first advance, blocking the next one.
  // -> grooming-watcher: "close the add-ons popup before each NEXT (it blocked advancing)"
  addonPopup: { addonPopup: true },

  // Controls render disabled until client-side hydration finishes.
  // -> grooming-watcher: "robust wizard nav — wait for hydration"
  lazyHydration: { lazyHydration: 700 },

  // Some day cells are styled to look available but are aria-disabled.
  // -> grooming-watcher: "dump day-cell styling to fix false-positive availability"
  phantomAvailability: { phantomAvailability: true },

  // A month-nav button whose label collides with the primary CTA's verb.
  // -> grooming-watcher: "verify NEXT advanced"
  decoyAdvance: { decoyAdvance: true },

  // Steps swapped. The base policy is already step-key driven, so this is a
  // near-control: it adds DOM diversity without adding a new failure class.
  stepReorder: { stepReorder: true },

  // Class names rewritten. Costs nothing to a selector-agnostic policy;
  // fatal to a memorized one. This is the memorization tripwire.
  classRename: { classRename: true },

  // Everything at once, which is what a real site actually looks like.
  combo: {
    interstitial: true, addonPopup: true, lazyHydration: 500,
    phantomAvailability: true, decoyAdvance: true, classRename: true,
  },
};

export const PROFILE_NAMES = Object.keys(PROFILES);

/** Cartesian product of flows x perturbation profiles. */
export function buildTasks(flows) {
  const tasks = [];
  for (const flow of flows) {
    for (const name of PROFILE_NAMES) {
      tasks.push({ id: `${flow.id}:${name}`, flow, profile: name, perturb: PROFILES[name] });
    }
  }
  return tasks;
}
