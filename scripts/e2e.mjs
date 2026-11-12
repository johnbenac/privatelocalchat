// Run browser (e2e) suites without running all of them every time.
//   node scripts/e2e.mjs                 every suite (before a release)
//   node scripts/e2e.mjs voice lock      only the suites whose file name contains "voice" or "lock"
// Suites run one at a time (each builds dist/, so two at once collide) and every result is listed at the end.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const dir = new URL("../tests/e2e/", import.meta.url).pathname;
const wanted = process.argv.slice(2);
const all = readdirSync(dir).filter((f) => f.endsWith(".e2e.mjs")).sort();
const suites = wanted.length ? all.filter((f) => wanted.some((w) => f.includes(w))) : all;
if (!suites.length) { console.error("no suite matches: " + wanted.join(", ") + "\navailable: " + all.map((f) => f.replace(".e2e.mjs", "")).join(" ")); process.exit(2); }
const results = [];
for (const f of suites) {
  console.log("== " + f);
  const r = spawnSync("node", [dir + f], { stdio: "inherit", env: { ...process.env, PLC_E2E_BRANCH: process.env.PLC_E2E_BRANCH || "dev" } }); // dev builds carry our development tooling, which belongs to the site target: the suites build it with the fixture site (tests/helpers/dev-site.mjs)
  results.push([f, r.status === 0]);
}
console.log("\n" + results.map(([f, ok]) => (ok ? "ok   " : "FAIL ") + f).join("\n"));
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
