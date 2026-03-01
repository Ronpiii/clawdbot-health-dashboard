#!/usr/bin/env node
/**
 * arc bench — workspace benchmark
 * 
 * runs all quality/health tools in parallel, extracts scores,
 * produces a composite rating with radar visualization and trends.
 * 
 * usage:
 *   arc bench              full benchmark with radar chart
 *   arc bench --short      one-liner score
 *   arc bench --trend      show score history
 *   arc bench --json       machine-readable output
 *   arc bench --fast       skip slow checks (pulse, debt)
 */

import { execFile } from 'child_process';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SNAPSHOT_FILE = join(ROOT, 'memory', 'bench-snapshots.json');

const args = process.argv.slice(2);
const SHORT = args.includes('--short');
const TREND = args.includes('--trend');
const JSON_OUT = args.includes('--json');
const FAST = args.includes('--fast');

// ── dimension definitions ──────────────────────────────────────
// each dimension: { name, icon, weight, script, args, extract(json) → 0-100 }

const DIMENSIONS = [
  {
    name: 'health',
    icon: '♥',
    weight: 0.20,
    desc: 'memory, git, tasks, projects',
    script: 'health.mjs',
    args: ['--json'],
    extract: d => d.overall ?? 0,
  },
  {
    name: 'security',
    icon: '⛨',
    weight: 0.15,
    desc: 'secrets, dependencies, permissions',
    script: 'shield.mjs',
    args: ['--quick', '--json'],
    extract: d => d.summary?.score ?? 0,
  },
  {
    name: 'integrity',
    icon: '⚯',
    weight: 0.10,
    desc: 'broken references, dead links',
    script: 'mirror.mjs',
    args: ['--json'],
    extract: d => d.score ?? 0,
  },
  {
    name: 'debt',
    icon: '△',
    weight: 0.15,
    desc: 'TODOs, any types, nesting, console.logs',
    script: 'debt.mjs',
    args: ['--json'],
    extract: d => d.summary?.score ?? 0,
    slow: true,
  },
  {
    name: 'services',
    icon: '◉',
    weight: 0.10,
    desc: 'production endpoints up/down',
    script: 'pulse.mjs',
    args: ['--json'],
    extract: d => {
      const s = d.summary;
      if (!s || !s.total) return 0;
      return Math.round((s.up / s.total) * 100);
    },
    slow: true,
  },
  {
    name: 'env',
    icon: '⚙',
    weight: 0.10,
    desc: 'env var coverage, drift',
    script: 'env-audit.mjs',
    args: ['--json'],
    extract: d => {
      const t = d.totals;
      if (!t || !t.vars) return 100;
      const missing = t.missing ?? 0;
      const total = t.vars + missing;
      if (total === 0) return 100;
      return Math.round(((total - missing) / total) * 100);
    },
  },
  {
    name: 'momentum',
    icon: '→',
    weight: 0.10,
    desc: 'week-over-week trajectory',
    script: 'orbit.mjs',
    args: ['--json'],
    extract: d => {
      // momentum is -100..100, map to 0..100
      const m = d.momentum ?? 0;
      return Math.round((m + 100) / 2);
    },
  },
  {
    name: 'hygiene',
    icon: '✦',
    weight: 0.10,
    desc: 'disk cruft, caches, stale branches',
    script: 'clean.mjs',
    args: ['--json'],
    extract: d => {
      // derive score from issues count
      const issues = d.summary?.issues ?? 0;
      const temp = (d.tempFiles?.length ?? 0);
      const empty = (d.emptyDirs?.length ?? 0);
      const stale = (d.staleBranches?.length ?? 0);
      const nextCaches = (d.nextCaches?.length ?? 0);
      const penalty = issues * 3 + temp * 2 + empty + stale * 2 + nextCaches * 5;
      return Math.max(0, Math.min(100, 100 - penalty));
    },
  },
];

// ── run a script and parse JSON output ─────────────────────────

function runScript(script, scriptArgs) {
  return new Promise(resolve => {
    const proc = execFile('node', [join(__dirname, script), ...scriptArgs], {
      cwd: ROOT,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve(null);
      }
    });
  });
}

// ── radar chart rendering ──────────────────────────────────────

function renderRadar(dimensions, scores) {
  // text-based radar chart — concentric rings at 25/50/75/100
  // 8 axes arranged in a circle
  const n = dimensions.length;
  const W = 41; // width of chart area (odd for center)
  const H = 21; // height (odd for center)
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const R = Math.min(cx, cy) - 1; // max radius in chars

  // init grid
  const grid = Array.from({ length: H }, () => Array(W).fill(' '));

  // angle for each dimension (start from top, go clockwise)
  const angles = dimensions.map((_, i) => (i / n) * 2 * Math.PI - Math.PI / 2);

  // draw concentric rings (25, 50, 75, 100) with dots
  for (const ring of [0.25, 0.5, 0.75, 1.0]) {
    const r = ring * R;
    const steps = Math.round(r * 12);
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * 2 * Math.PI;
      const x = Math.round(cx + r * Math.cos(a) * 1.8); // stretch x for char aspect ratio
      const y = Math.round(cy + r * Math.sin(a));
      if (x >= 0 && x < W && y >= 0 && y < H && grid[y][x] === ' ') {
        grid[y][x] = '·';
      }
    }
  }

  // draw axes
  for (let i = 0; i < n; i++) {
    const a = angles[i];
    const steps = Math.round(R * 2);
    for (let s = 0; s <= steps; s++) {
      const frac = s / steps;
      const x = Math.round(cx + frac * R * Math.cos(a) * 1.8);
      const y = Math.round(cy + frac * R * Math.sin(a));
      if (x >= 0 && x < W && y >= 0 && y < H && grid[y][x] === ' ') {
        grid[y][x] = '╌';
      }
    }
  }

  // draw score points and fill shape
  const scorePoints = [];
  for (let i = 0; i < n; i++) {
    const a = angles[i];
    const frac = (scores[i] ?? 0) / 100;
    const x = Math.round(cx + frac * R * Math.cos(a) * 1.8);
    const y = Math.round(cy + frac * R * Math.sin(a));
    scorePoints.push({ x, y });
    if (x >= 0 && x < W && y >= 0 && y < H) {
      grid[y][x] = '●';
    }
  }

  // connect score points with lines
  for (let i = 0; i < n; i++) {
    const p1 = scorePoints[i];
    const p2 = scorePoints[(i + 1) % n];
    const steps = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
    if (steps === 0) continue;
    for (let s = 1; s < steps; s++) {
      const x = Math.round(p1.x + (p2.x - p1.x) * s / steps);
      const y = Math.round(p1.y + (p2.y - p1.y) * s / steps);
      if (x >= 0 && x < W && y >= 0 && y < H && grid[y][x] !== '●') {
        grid[y][x] = '▪';
      }
    }
  }

  // center marker
  grid[cy][cx] = '+';

  return grid.map(row => '  ' + row.join('')).join('\n');
}

// ── score bar ──────────────────────────────────────────────────

function scoreBar(score, width = 20) {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function gradeColor(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function gradeLabel(score) {
  if (score >= 90) return 'exceptional';
  if (score >= 80) return 'strong';
  if (score >= 70) return 'solid';
  if (score >= 60) return 'decent';
  if (score >= 50) return 'middling';
  if (score >= 40) return 'needs work';
  if (score >= 30) return 'rough';
  if (score >= 20) return 'struggling';
  return 'critical';
}

// ── trend / sparkline ──────────────────────────────────────────

function sparkline(values) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chars = '▁▂▃▄▅▆▇█';
  return values.map(v => chars[Math.min(7, Math.floor(((v - min) / range) * 7.99))]).join('');
}

// ── snapshot persistence ───────────────────────────────────────

async function loadSnapshots() {
  try {
    const data = await readFile(SNAPSHOT_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveSnapshot(snapshot) {
  const snapshots = await loadSnapshots();
  snapshots.push(snapshot);
  // keep last 90 snapshots
  const trimmed = snapshots.slice(-90);
  await mkdir(dirname(SNAPSHOT_FILE), { recursive: true });
  await writeFile(SNAPSHOT_FILE, JSON.stringify(trimmed, null, 2));
}

// ── trend display ──────────────────────────────────────────────

async function showTrend() {
  const snapshots = await loadSnapshots();
  if (snapshots.length === 0) {
    console.log('no benchmark history yet. run `arc bench` to create the first snapshot.');
    return;
  }

  const lines = [];
  lines.push('');
  lines.push('  ┌─────────────────────────────────────────────────────┐');
  lines.push('  │  WORKSPACE BENCHMARK TREND                          │');
  lines.push('  └─────────────────────────────────────────────────────┘');
  lines.push('');

  // overall score sparkline
  const scores = snapshots.map(s => s.composite);
  lines.push(`  overall  ${sparkline(scores)}  ${scores[scores.length - 1]}/100`);
  lines.push('');

  // per-dimension sparklines
  const dimNames = DIMENSIONS.map(d => d.name);
  const maxName = Math.max(...dimNames.map(n => n.length));
  for (const dim of DIMENSIONS) {
    const vals = snapshots.map(s => s.dimensions?.[dim.name] ?? 0);
    const pad = ' '.repeat(maxName - dim.name.length);
    lines.push(`  ${dim.icon} ${dim.name}${pad}  ${sparkline(vals)}  ${vals[vals.length - 1]}`);
  }

  lines.push('');

  // recent entries table
  const recent = snapshots.slice(-10);
  lines.push('  date                composite   grade   delta');
  lines.push('  ─────────────────── ─────────── ─────── ──────');
  for (let i = 0; i < recent.length; i++) {
    const s = recent[i];
    const date = new Date(s.timestamp).toISOString().slice(0, 16).replace('T', ' ');
    const grade = gradeColor(s.composite);
    const prev = i > 0 ? recent[i - 1].composite : (snapshots.length > recent.length ? snapshots[snapshots.length - recent.length - 1].composite : null);
    const delta = prev !== null ? s.composite - prev : 0;
    const deltaStr = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : ' 0';
    lines.push(`  ${date}   ${String(s.composite).padStart(3)}/100       ${grade}    ${deltaStr}`);
  }

  lines.push('');
  lines.push(`  ${snapshots.length} snapshots, ${sparkline(scores)}`);
  lines.push('');

  console.log(lines.join('\n'));
}

// ── main ───────────────────────────────────────────────────────

async function main() {
  if (TREND) {
    if (JSON_OUT) {
      const snapshots = await loadSnapshots();
      console.log(JSON.stringify(snapshots, null, 2));
    } else {
      await showTrend();
    }
    return;
  }

  // run all dimensions in parallel
  const activeDims = FAST
    ? DIMENSIONS.filter(d => !d.slow)
    : DIMENSIONS;

  const startTime = Date.now();

  const results = await Promise.all(
    activeDims.map(async dim => {
      const json = await runScript(dim.script, dim.args);
      const score = json ? dim.extract(json) : null;
      return { ...dim, score, error: json === null };
    })
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // calculate composite score
  const scored = results.filter(r => r.score !== null);
  const totalWeight = scored.reduce((sum, r) => sum + r.weight, 0);
  const composite = totalWeight > 0
    ? Math.round(scored.reduce((sum, r) => sum + r.score * (r.weight / totalWeight), 0))
    : 0;

  // build snapshot
  const snapshot = {
    timestamp: new Date().toISOString(),
    composite,
    grade: gradeColor(composite),
    dimensions: Object.fromEntries(results.map(r => [r.name, r.score ?? 0])),
    elapsed: parseFloat(elapsed),
  };

  // save snapshot
  await saveSnapshot(snapshot);

  // load history for delta
  const snapshots = await loadSnapshots();
  const prev = snapshots.length >= 2 ? snapshots[snapshots.length - 2].composite : null;
  const delta = prev !== null ? composite - prev : null;

  if (JSON_OUT) {
    console.log(JSON.stringify({ ...snapshot, delta, history: snapshots.slice(-30) }, null, 2));
    return;
  }

  if (SHORT) {
    const deltaStr = delta !== null ? (delta >= 0 ? ` (+${delta})` : ` (${delta})`) : '';
    console.log(`bench: ${composite}/100 ${gradeColor(composite)}${deltaStr} — ${gradeLabel(composite)}`);
    return;
  }

  // ── full display ──────────────────────────────────────────

  const lines = [];
  lines.push('');
  lines.push('  ┌─────────────────────────────────────────────────────┐');
  lines.push('  │  WORKSPACE BENCHMARK                                │');
  lines.push('  └─────────────────────────────────────────────────────┘');
  lines.push('');

  // composite score
  const deltaStr = delta !== null ? (delta >= 0 ? ` (+${delta})` : ` (${delta})`) : '';
  lines.push(`  composite: ${composite}/100  grade ${gradeColor(composite)}  ${gradeLabel(composite)}${deltaStr}`);
  lines.push(`  ${scoreBar(composite, 40)}`);
  lines.push('');

  // dimension breakdown
  lines.push('  ─── dimensions ───────────────────────────────────────');
  lines.push('');

  const maxName = Math.max(...results.map(r => r.name.length));
  for (const r of results) {
    const pad = ' '.repeat(maxName - r.name.length);
    if (r.error) {
      lines.push(`  ${r.icon} ${r.name}${pad}  ---  (error)`);
    } else {
      const grade = gradeColor(r.score);
      const w = Math.round(r.weight * 100);
      lines.push(`  ${r.icon} ${r.name}${pad}  ${scoreBar(r.score, 16)} ${String(r.score).padStart(3)}/100  ${grade}  (${w}%)`);
    }
  }

  lines.push('');

  // radar chart
  lines.push('  ─── radar ────────────────────────────────────────────');
  lines.push('');

  const radarScores = DIMENSIONS.map(d => {
    const r = results.find(r2 => r2.name === d.name);
    return r?.score ?? 0;
  });
  lines.push(renderRadar(DIMENSIONS, radarScores));

  // axis labels around the chart
  const labelLines = [];
  const labels = DIMENSIONS.map((d, i) => `${d.icon} ${d.name}`);
  // top
  labelLines.push(`  ${' '.repeat(16)}${labels[0]}`);
  // sides: arrange labels roughly around the radar
  // for 8 dimensions: top, top-right, right, bottom-right, bottom, bottom-left, left, top-left
  if (labels.length >= 8) {
    labelLines.push(`  ${labels[7]}${' '.repeat(Math.max(1, 30 - labels[7].length))}${labels[1]}`);
    labelLines.push(`  ${labels[6]}${' '.repeat(Math.max(1, 30 - labels[6].length))}${labels[2]}`);
    labelLines.push(`  ${labels[5]}${' '.repeat(Math.max(1, 30 - labels[5].length))}${labels[3]}`);
    labelLines.push(`  ${' '.repeat(16)}${labels[4]}`);
  }
  lines.push(labelLines.join('\n'));
  lines.push('');

  // sparkline history (if we have >1 snapshot)
  if (snapshots.length > 1) {
    lines.push('  ─── history ──────────────────────────────────────────');
    lines.push('');
    const histScores = snapshots.slice(-30).map(s => s.composite);
    lines.push(`  ${sparkline(histScores)}  (last ${histScores.length} runs)`);
    lines.push('');
  }

  // weakest dimensions (recommendations)
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  const weak = sorted.filter(r => r.score < 60).slice(0, 3);
  if (weak.length > 0) {
    lines.push('  ─── focus areas ──────────────────────────────────────');
    lines.push('');
    for (const r of weak) {
      lines.push(`  ${r.icon} ${r.name} (${r.score}/100) — ${r.desc}`);
    }
    lines.push('');
  }

  // strongest
  const strong = sorted.filter(r => r.score >= 80).reverse().slice(0, 3);
  if (strong.length > 0) {
    lines.push('  ─── strengths ────────────────────────────────────────');
    lines.push('');
    for (const r of strong) {
      lines.push(`  ${r.icon} ${r.name} (${r.score}/100) — ${r.desc}`);
    }
    lines.push('');
  }

  lines.push(`  ran ${results.length} checks in ${elapsed}s`);
  lines.push('');

  console.log(lines.join('\n'));
}

main().catch(err => {
  console.error('bench error:', err.message);
  process.exit(1);
});
