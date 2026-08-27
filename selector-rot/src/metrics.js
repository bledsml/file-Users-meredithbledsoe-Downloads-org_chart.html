// Metrics. The headline is not "did it improve" but "did the improvement transfer".

export function rate(results, split) {
  const rows = results.filter((r) => r.split === split);
  if (!rows.length) return 0;
  return rows.filter((r) => r.success).length / rows.length;
}

/** Tasks that passed at gen k-1 and fail at gen k. Self-editing is not monotone. */
export function regressions(prev, curr) {
  if (!prev) return { count: 0, of: 0, tasks: [] };
  const was = new Map(prev.map((r) => [r.taskId, r.success]));
  const broken = curr.filter((r) => was.get(r.taskId) === true && !r.success);
  return {
    count: broken.length,
    of: prev.filter((r) => r.success).length,
    tasks: broken.map((r) => r.taskId),
  };
}

export function summarize(run) {
  const out = [];
  for (const arm of run.arms) {
    for (const gen of arm.generations) {
      const prev = arm.generations[gen.index - 1];
      out.push({
        arm: arm.arm,
        seed: arm.seed,
        generation: gen.index,
        train: rate(gen.results, 'train'),
        heldout: rate(gen.results, 'heldout'),
        regressions: regressions(prev?.results, gen.results),
        rulesCount: gen.rulesCount,
        editRejections: gen.editRejections || [],
      });
    }
  }
  return out;
}

/** Mean +/- spread across seeds, per (arm, generation). */
export function aggregate(rows) {
  const key = (r) => `${r.arm}|${r.generation}`;
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(key(r))) groups.set(key(r), []);
    groups.get(key(r)).push(r);
  }
  const out = [];
  for (const [k, rs] of groups) {
    const [arm, generation] = k.split('|');
    const mean = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    const spread = (f) => {
      const vs = rs.map(f);
      return { min: Math.min(...vs), max: Math.max(...vs) };
    };
    out.push({
      arm,
      generation: Number(generation),
      seeds: rs.length,
      train: mean((r) => r.train),
      trainSpread: spread((r) => r.train),
      heldout: mean((r) => r.heldout),
      heldoutSpread: spread((r) => r.heldout),
      regressionRate: mean((r) => (r.regressions.of ? r.regressions.count / r.regressions.of : 0)),
    });
  }
  return out.sort((a, b) => a.arm.localeCompare(b.arm) || a.generation - b.generation);
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;

export function report(run) {
  const rows = summarize(run);
  const agg = aggregate(rows);
  const lines = [];

  lines.push('');
  lines.push('  arm  gen   train (min-max)        held-out (min-max)     regress');
  lines.push('  ' + '-'.repeat(68));
  for (const a of agg) {
    lines.push(
      `  ${a.arm.padEnd(4)} ${String(a.generation).padEnd(4)}` +
      `${pct(a.train).padStart(6)} (${pct(a.trainSpread.min)}-${pct(a.trainSpread.max)})`.padEnd(23) +
      `${pct(a.heldout).padStart(6)} (${pct(a.heldoutSpread.min)}-${pct(a.heldoutSpread.max)})`.padEnd(23) +
      pct(a.regressionRate).padStart(6),
    );
  }

  // Transfer delta: improvement on unseen sites minus improvement on trained sites.
  // <= 0 means the gains were memorization.
  lines.push('');
  lines.push('  TRANSFER DELTA  (heldout gain - train gain, gen 0 -> last)');
  const arms = [...new Set(agg.map((a) => a.arm))];
  for (const arm of arms) {
    const rowsA = agg.filter((a) => a.arm === arm);
    const first = rowsA[0];
    const last = rowsA[rowsA.length - 1];
    const dTrain = last.train - first.train;
    const dHeld = last.heldout - first.heldout;
    lines.push(
      `  arm ${arm}:  train ${dTrain >= 0 ? '+' : ''}${pct(dTrain)}   ` +
      `heldout ${dHeld >= 0 ? '+' : ''}${pct(dHeld)}   ` +
      `delta ${dHeld - dTrain >= 0 ? '+' : ''}${pct(dHeld - dTrain)}`,
    );
  }
  lines.push('');
  lines.push('  ARMS   A = unconstrained self-edit   B = generality-constrained   C = no self-edit (control)');
  lines.push('');
  return lines.join('\n');
}

// CLI: node src/metrics.js results/latest.json
if (process.argv[1] && process.argv[1].endsWith('metrics.js')) {
  const fs = await import('node:fs');
  const file = process.argv[2] || 'results/latest.json';
  console.log(report(JSON.parse(fs.readFileSync(file, 'utf8'))));
}
