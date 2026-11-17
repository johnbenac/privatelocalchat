// Evaluate Roberta's intent router on the held-out queries (tests/fixtures/ivr-eval-queries.json): lexical only, semantic only and hybrid,
// with the REAL embedding model in Node (the same engine code and model files as the browser). Prints a table; --json prints the numbers.
//
//   EMBEDDING_NODE_MODULES=<scratch>/node_modules node scripts/eval-intent-router.mjs [--json]
//
// The queries are split by kind so that the numbers say how much to believe them:
//   development  plain, noisy, owner, hard   used to find confusions and to calibrate (and to improve the examples and keywords)
//   validation   blind                       looked at once after calibration
//   final        blind2                      written after the content and thresholds were frozen
// Each query is routed on its own; "top-1" means the best candidate is the expected topic whatever the confidence.
// "acted" means high or medium confidence: what the phone menu would actually go to; "precision" is how often that was right.
// Off-topic queries (kind *off-topic*) must come out "low"; "adjacent" ones mention the app's words (phones, downloads, recording) but are
// not about the app, so they are reported separately.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createIntentRouter } from "../chat/roberta/intent-router.mjs";
import { NODES } from "../chat/roberta/ivr-content.mjs";

const fixturePath = fileURLToPath(new URL("../tests/fixtures/ivr-eval-queries.json", import.meta.url));
const vectorsPath = fileURLToPath(new URL("../chat/roberta/ivr-vectors.json", import.meta.url));
export const loadQueries = async () => JSON.parse(await readFile(fixturePath, "utf8")).queries;
export const loadVectors = async () => JSON.parse(await readFile(vectorsPath, "utf8"));

export const SPLITS = {
  development: (q) => !q.kind.startsWith("blind"),
  validation: (q) => q.kind.startsWith("blind") && !q.kind.startsWith("blind2"),
  final: (q) => q.kind.startsWith("blind2"),
  all: () => true,
};

/** Route every query; returns [{ query, result }]. */
export async function routeAll(router, queries) {
  const rows = [];
  for (const query of queries) rows.push({ query, result: await router.route(query.text) });
  return rows;
}

/** The numbers for one set of routed queries. `topIntent` reads the best candidate (the router must be made with nearFloor: 0). */
export function summarise(rows) {
  const inScope = rows.filter((r) => r.query.intent);
  const off = rows.filter((r) => !r.query.intent && !/adjacent/.test(r.query.kind));
  const adjacent = rows.filter((r) => !r.query.intent && /adjacent/.test(r.query.kind));
  const top = (r) => r.result.candidates[0]?.intent ?? null;
  const acted = inScope.filter((r) => r.result.confidence !== "low");
  const high = inScope.filter((r) => r.result.confidence === "high");
  const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
  const top1 = inScope.filter((r) => top(r) === r.query.intent).length;
  const top3 = inScope.filter((r) => r.result.candidates.slice(0, 3).some((c) => c.intent === r.query.intent)).length;
  const actedRight = acted.filter((r) => r.result.intent === r.query.intent).length;
  // the neighbouring topic (a menu and one of its own sub-topics) is the right branch of the menu, so it is counted separately
  const near = (a, b) => a === b || NODES[a]?.children?.includes(b) || NODES[b]?.children?.includes(a);
  const actedBranch = acted.filter((r) => near(r.result.intent, r.query.intent)).length;
  const highRight = high.filter((r) => r.result.intent === r.query.intent).length;
  const rejected = off.filter((r) => r.result.confidence === "low").length;
  const adjacentRejected = adjacent.filter((r) => r.result.confidence === "low").length;
  return {
    inScope: inScope.length, top1, top1Pct: pct(top1, inScope.length), top3, top3Pct: pct(top3, inScope.length),
    acted: acted.length, actedPct: pct(acted.length, inScope.length), actedPrecisionPct: pct(actedRight, acted.length), actedBranchPct: pct(actedBranch, acted.length),
    high: high.length, highPrecisionPct: pct(highRight, high.length),
    offTopic: off.length, offTopicRejected: rejected, offTopicRejectedPct: pct(rejected, off.length),
    adjacent: adjacent.length, adjacentRejected, adjacentRejectedPct: pct(adjacentRejected, adjacent.length),
  };
}

export function makeRouters({ embedder, vectors }) {
  const base = { vectors, nearFloor: 0 };
  return {
    lexical: createIntentRouter({ ...base, embedder: null }),
    semantic: createIntentRouter({ ...base, embedder, semanticWeight: 1 }),
    hybrid: createIntentRouter({ ...base, embedder }),
  };
}

/** Wrap an engine (Node) as the small interface the router needs; vectors are memoised so a method does not embed twice. */
export function engineEmbedder(engine) {
  const cache = new Map();
  return {
    state: "ready", ready: async () => {},
    embedQuery: async (text) => { if (!cache.has(text)) cache.set(text, await engine.embedQuery(text)); return cache.get(text); },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createNodeEngine } = await import("../ops/embedding/node-engine.mjs");
  const engine = await createNodeEngine();
  await engine.init();
  const routers = makeRouters({ embedder: engineEmbedder(engine), vectors: await loadVectors() });
  const queries = await loadQueries();
  const out = {};
  const rowsBy = {};
  for (const [method, router] of Object.entries(routers)) {
    rowsBy[method] = await routeAll(router, queries);
    out[method] = Object.fromEntries(Object.entries(SPLITS).map(([split, keep]) => [split, summarise(rowsBy[method].filter((r) => keep(r.query)))]));
  }
  await engine.dispose();
  if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
  else {
    for (const split of Object.keys(SPLITS)) {
      console.log(`\n${split} (${out.hybrid[split].inScope} in-scope, ${out.hybrid[split].offTopic} off-topic, ${out.hybrid[split].adjacent} adjacent)`);
      console.log("method     top1    top3    acted   acted-prec  branch-prec  high-prec  off-topic->low  adjacent->low");
      for (const method of Object.keys(routers)) {
        const s = out[method][split];
        console.log(`${method.padEnd(10)} ${String(s.top1Pct).padStart(5)}%  ${String(s.top3Pct).padStart(5)}%  ${String(s.actedPct).padStart(5)}%  ${String(s.actedPrecisionPct).padStart(9)}%  ${String(s.actedBranchPct).padStart(10)}%  ${String(s.highPrecisionPct).padStart(8)}%  ${`${s.offTopicRejected}/${s.offTopic}`.padStart(8)} ${String(s.offTopicRejectedPct).padStart(5)}%  ${`${s.adjacentRejected}/${s.adjacent}`.padStart(6)}`);
      }
    }
    if (process.argv.includes("--misses")) {
      for (const r of rowsBy.hybrid) {
        const c = r.result.candidates;
        const ok = r.query.intent ? c[0]?.intent === r.query.intent : r.result.confidence === "low";
        if (!ok) console.log(`MISS ${r.query.kind} ${r.query.intent ?? "OFF"} <- "${r.query.text}" => ${r.result.confidence} ${c.slice(0, 3).map((k) => `${k.intent}:${k.score.toFixed(2)}`).join(" ")}`);
      }
    }
  }
}
