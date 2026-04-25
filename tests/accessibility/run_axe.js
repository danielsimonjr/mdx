#!/usr/bin/env node
/**
 * Phase 3.3 axe-core + Playwright runner. Closes the half of the
 * accessibility conformance suite that the existing Python runner
 * cannot touch: contrast (WCAG 1.4.3), keyboard / focus (2.1.1, 2.4.7),
 * ARIA (4.1.2), form labels (1.3.1), table semantics (1.3.1), and
 * landmarks (1.3.1) — all of which require a real browser.
 *
 * Fixtures live in `tests/accessibility/fixtures-axe/`. Each fixture
 * directory contains:
 *   - `input.html` — minimal page that demonstrates the rule. Author
 *     intent is "just enough to reproduce the violation when wrong,
 *     and pass cleanly when right." Pages are loaded via
 *     `page.setContent()` (no network).
 *   - `expected.json` — `{ expected_violations: ["axe-rule-id"...],
 *     wcag_level, description }`. An empty `expected_violations` array
 *     means the fixture must pass clean.
 *
 * The runner injects `axe.min.js` from `node_modules/axe-core/`,
 * runs `axe.run(document)`, and asserts the actually-fired rules
 * exactly match `expected_violations`. Drift either direction
 * (fixture loosens or rule changes break the fixture) surfaces as
 * a per-fixture FAIL line.
 *
 * Usage:
 *   node tests/accessibility/run_axe.js              # All fixtures
 *   node tests/accessibility/run_axe.js color-*      # Glob filter
 *
 * Exit 0 if every fixture matches; 1 on any drift.
 *
 * Why this is opt-in (not in the default `npm run test:a11y`):
 * Playwright + chromium-headless-shell is a ~110 MB install. The
 * Python runner stays the always-on baseline; this runner is opted
 * in via `npm run test:a11y-real` once Playwright + axe-core are
 * installed.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error(
    '✗ playwright not installed. Run `npm install playwright axe-core` first, ' +
      'then `npx playwright install chromium`.',
  );
  process.exit(2);
}

let axeSource;
try {
  axeSource = fs.readFileSync(
    require.resolve('axe-core/axe.min.js'),
    'utf-8',
  );
} catch {
  console.error('✗ axe-core not installed. Run `npm install axe-core` first.');
  process.exit(2);
}

const FIXTURES_DIR = path.join(__dirname, 'fixtures-axe');

function listFixtures(filter) {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  const all = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory());
  if (!filter) return all;
  // Simple glob: `*` only.
  const re = new RegExp('^' + filter.replace(/\*/g, '.*') + '$');
  return all.filter((f) => re.test(f));
}

async function runFixture(page, name) {
  const dir = path.join(FIXTURES_DIR, name);
  const html = fs.readFileSync(path.join(dir, 'input.html'), 'utf-8');
  const expected = JSON.parse(
    fs.readFileSync(path.join(dir, 'expected.json'), 'utf-8'),
  );
  await page.setContent(html, { waitUntil: 'load' });
  await page.addScriptTag({ content: axeSource });
  // Run WCAG A/AA + best-practice rules. Best-practice covers real
  // failure modes (landmarks, region wrapping, page-has-h1) that
  // strict WCAG doesn't mandate but professional audits flag.
  const result = await page.evaluate(() =>
    // eslint-disable-next-line no-undef
    axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa', 'best-practice'],
      },
    }),
  );
  const fired = result.violations.map((v) => v.id).sort();
  const expect = (expected.expected_violations ?? []).slice().sort();
  const equal =
    fired.length === expect.length && fired.every((r, i) => r === expect[i]);
  return { name, expected: expect, fired, equal, description: expected.description };
}

async function main() {
  const filter = process.argv[2];
  const fixtures = listFixtures(filter);
  if (fixtures.length === 0) {
    console.log('No axe fixtures found in', FIXTURES_DIR);
    if (filter) {
      console.log('  (filter:', filter, ')');
      process.exit(1);
    }
    return;
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  let fail = 0;
  for (const name of fixtures) {
    try {
      const r = await runFixture(page, name);
      if (r.equal) {
        console.log(`PASS  ${name}  [${r.expected.join(', ') || '<clean>'}]`);
      } else {
        fail++;
        console.log(`FAIL  ${name}`);
        console.log(`  expected: [${r.expected.join(', ') || '<clean>'}]`);
        console.log(`  fired:    [${r.fired.join(', ') || '<clean>'}]`);
        if (r.description) console.log(`  about:    ${r.description}`);
      }
    } catch (e) {
      fail++;
      console.log(`ERROR ${name}: ${e.message}`);
    }
  }
  await browser.close();

  console.log(`\n${fixtures.length - fail}/${fixtures.length} fixtures passed.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(2);
});
