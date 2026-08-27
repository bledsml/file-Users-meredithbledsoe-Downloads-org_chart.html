import { chromium } from 'playwright-core';

// The pre-provisioned Chromium in this environment does not match the browser
// revision playwright-core expects, so allow an explicit override.
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

export async function launch() {
  const opts = { headless: true };
  try {
    const fs = await import('node:fs');
    if (fs.existsSync(EXECUTABLE)) opts.executablePath = EXECUTABLE;
  } catch { /* fall back to the bundled browser */ }
  return chromium.launch(opts);
}
