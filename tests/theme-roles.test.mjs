// SPDX-License-Identifier: AGPL-3.0-only
// The colour roles of chat/brand.css carry this app's own values; every text and control pair is measured in both schemes with the thresholds of the programme's dark-mode rules:
// 4.5:1 for text, 3:1 for borders, focus rings and icons. A role that is missing or a pair below its threshold fails here, so a colour change cannot slip below AA unseen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../chat/brand.css', import.meta.url), 'utf8');
function block(selector) {
  const out = {};
  for (const m of css.matchAll(new RegExp('(?:^|\\n)' + selector.replace(/[[\]"]/g, '\\$&') + '[^{]*\\{([^}]*)\\}', 'g')))
    for (const d of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function scheme(name) {
  const vars = { ...block(':root, [data-theme="light"]') };
  if (name === 'dark') Object.assign(vars, block('[data-theme="dark"]'));
  const resolve = (v, depth = 0) => {
    v = String(v).trim();
    const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
    if (ref) return resolve(vars[ref[1]], depth + 1);
    const mix = v.match(/^color-mix\(in srgb, (.+?) (\d+)%, (.+)\)$/);
    if (mix) { const a = rgb(resolve(mix[1])), b = rgb(resolve(mix[3])), k = Number(mix[2]) / 100; return '#' + a.map((x, i) => Math.round(x * k + b[i] * (1 - k)).toString(16).padStart(2, '0')).join(''); }
    assert.match(v, /^#[0-9a-fA-F]{6}$/, 'a role resolves to a plain colour: ' + v);
    return v;
  };
  return (role) => { assert.ok(vars['--role-' + role], 'role ' + role + ' is defined in ' + name); return rgb(resolve(vars['--role-' + role])); };
}

// [foreground role, background role, threshold]
const PAIRS = [
  ['text', 'surface-sunken', 4.5], ['text', 'surface', 4.5], ['text', 'surface-raised', 4.5], ['text', 'surface-overlay', 4.5],
  ['text-muted', 'surface-sunken', 4.5], ['text-muted', 'surface', 4.5], ['text-subtle', 'surface', 4.5],
  ['link', 'surface', 4.5], ['link', 'surface-sunken', 4.5], ['link-visited', 'surface', 4.5], ['accent', 'surface', 4.5],
  ['on-accent', 'accent-fill', 4.5], ['accent-strong', 'surface', 3],
  ['border-strong', 'surface', 3], ['border-strong', 'surface-sunken', 3], ['focus', 'surface', 3], ['focus', 'surface-sunken', 3],
  ['ok', 'ok-bg', 4.5], ['bad', 'bad-bg', 4.5], ['warn', 'warn-bg', 4.5], ['ok', 'surface', 4.5], ['bad', 'surface', 4.5], ['warn', 'surface', 4.5],
  ['disabled-text', 'disabled-surface', 4.5]
];
for (const name of ['light', 'dark']) {
  test('colour roles, ' + name + ' scheme: every pair meets its threshold', () => {
    const c = scheme(name); const failing = [];
    for (const [fg, bg, min] of PAIRS) { const r = ratio(c(fg), c(bg)); if (r < min) failing.push(fg + ' on ' + bg + ' = ' + r.toFixed(2) + ' (needs ' + min + ')'); }
    assert.deepEqual(failing, []);
  });
}
