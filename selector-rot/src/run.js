// Experiment driver.
//
//   node src/run.js                       full 3-arm experiment
//   node src/run.js --arms C --seeds 1    harness check, no API key needed
//   node src/run.js --generations 4 --seeds 5 --concurrency 12

import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.js';
import { FLOWS, buildSpec } from './flows.js';
import { buildTasks } from './perturb.js';
import { runEpisode } from './agent.js';
import { emptyMemory, validate } from './memory.js';
import { buildFailureReport, proposeEdit } from './selfedit.js';
import { report } from './metrics.js';
import { createMockClient } from './mockclient.js';

function parseArgs(argv) {
  const o = { arms: ['A', 'B', 'C'], generations: 3, seeds: 3, concurrency: 12, out: 'results/latest.json' };
  const flags = new Set(["--mock"]);
  for (let i = 2; i < argv.length; i += 2) {
    if (flags.has(argv[i])) { i -= 1; continue; }
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (k === 'arms') o.arms = v.split(',').map((s) => s.trim().toUpperCase());
    else if (k === 'out') o.out = v;
    else if (k in o) o[k] = Number(v);
  }
  return o;
}

/** Run every task concurrently across a fixed pool of pages. */
async function evaluate(browser, tasks, rules, seed, concurrency) {
  const pages = await Promise.all(
    Array.from({ length: concurrency }, () => browser.newPage()),
  );
  const results = new Array(tasks.length);
  let cursor = 0;

  await Promise.all(
    pages.map(async (page) => {
      for (;;) {
        const i = cursor++;
        if (i >= tasks.length) break;
        const t = tasks[i];
        const spec = buildSpec(t.flow, t.perturb, seed);
        let r;
        try {
          r = await runEpisode(page, spec, rules);
        } catch (e) {
          r = { success: false, booked: false, trace: [{ type: 'harness-error', error: e.message }], digest: null };
        }
        results[i] = {
          taskId: t.id, flowId: t.flow.id, split: t.flow.split, profile: t.profile,
          ...r,
        };
      }
    }),
  );

  await Promise.all(pages.map((p) => p.close()));
  return results;
}

async function main() {
  const opts = parseArgs(process.argv);
  const mock = process.argv.includes('--mock');
  if (mock) console.log('MOCK MODE: replaying scripted edits, no API calls.\n');
  const needsApi = !mock && opts.arms.some((a) => a !== 'C');
  if (needsApi && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error(
      'Arms A/B call the Claude API. Set ANTHROPIC_API_KEY (or run `ant auth login`),\n' +
      'or run the harness-only control:  node src/run.js --arms C --seeds 1',
    );
    process.exit(1);
  }

  const tasks = buildTasks(FLOWS);
  const trainTasks = tasks.filter((t) => t.flow.split === 'train');
  const scratchDir = path.resolve('results/.scratch');
  const memDir = path.resolve('results/memory');
  fs.mkdirSync(memDir, { recursive: true });

  console.log(
    `selector-rot: ${FLOWS.length} flows x ${tasks.length / FLOWS.length} profiles = ${tasks.length} tasks ` +
    `(${trainTasks.length} train / ${tasks.length - trainTasks.length} held-out)`,
  );
  console.log(`arms=${opts.arms.join(',')}  generations=${opts.generations}  seeds=${opts.seeds}\n`);

  const browser = await launch();
  const run = { startedAt: new Date().toISOString(), opts, arms: [] };

  for (const arm of opts.arms) {
    for (let seed = 1; seed <= opts.seeds; seed++) {
      const armRun = { arm, seed, generations: [] };
      // A fresh mock per (arm, seed) so each replays the same scripted sequence.
      const client = mock ? createMockClient() : undefined;
      let memorySource = emptyMemory();
      let rules = [];

      for (let gen = 0; gen < opts.generations; gen++) {
        const t0 = Date.now();
        const results = await evaluate(browser, tasks, rules, seed, opts.concurrency);
        const train = results.filter((r) => r.split === 'train');
        const held = results.filter((r) => r.split === 'heldout');
        const p = (rs) => `${rs.filter((r) => r.success).length}/${rs.length}`;

        console.log(
          `  arm ${arm} seed ${seed} gen ${gen}:  train ${p(train)}  held-out ${p(held)}  ` +
          `(${rules.length} rules, ${((Date.now() - t0) / 1000).toFixed(1)}s)`,
        );

        fs.writeFileSync(path.join(memDir, `arm${arm}-seed${seed}-gen${gen}.mjs`), memorySource);
        const genRecord = { index: gen, results, rulesCount: rules.length, memorySource, editRejections: [] };
        armRun.generations.push(genRecord);

        const isLast = gen === opts.generations - 1;
        if (arm === 'C' || isLast) continue;

        // Self-edit sees TRAINING failures only. Held-out is never fed back.
        const edit = await proposeEdit({
          currentMemory: memorySource,
          report: buildFailureReport(train),
          arm,
          scratchDir,
          client,
        });
        genRecord.editRejections = edit.rejections;
        if (edit.ok) {
          const v = await validate(edit.memorySource, arm, scratchDir);
          if (v.ok) {
            memorySource = edit.memorySource;
            rules = v.rules;
            genRecord.analysis = edit.analysis;
          }
        } else {
          console.log(`    self-edit produced no usable patch: ${edit.rejections.join('; ')}`);
        }
      }
      run.arms.push(armRun);
    }
  }

  await browser.close();
  run.finishedAt = new Date().toISOString();

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, JSON.stringify(run, null, 1));
  console.log(report(run));
  console.log(`  full results: ${opts.out}`);
  console.log(`  memory per generation: ${memDir}/  (diff gen0 against the last to see what was learned)\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
