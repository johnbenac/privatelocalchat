// Page-load counting at privatelocal.chat (Cloudflare Web Analytics, added by the host, not by this code) reports a page view
// whenever a page changes its own address. The privacy page promises nothing inside the app is counted, so the app must never
// navigate or change its address as people use it. The one exception is clearing a shared settings link from the address bar.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["index.html", "chat", "runtime", "local-models.js", "conversation-messages.mjs"];
const SKIP = /(^|\/)(vendor|node_modules)(\/|$)/;
const FILE = /\.(mjs|js|html)$/;
const PATTERN = /\.pushState\s*\(|\.replaceState\s*\(|location\.(assign|replace)\s*\(|location\.(href|pathname|search)\s*=[^=]/g;
const ALLOWED = new Map([["chat/transfer/transfer-glue.mjs", 1]]); // history.replaceState: removes a shared settings link from the address

function walk(p, out = []) {
  if (!fs.existsSync(p) || SKIP.test(p)) return out;
  const st = fs.statSync(p);
  if (st.isFile()) { if (FILE.test(p)) out.push(p); return out; }
  for (const e of fs.readdirSync(p)) walk(path.join(p, e), out);
  return out;
}

test("the app does not change its own address as people use it", () => {
  const found = new Map();
  for (const file of ROOTS.flatMap((r) => walk(r))) {
    const hits = fs.readFileSync(file, "utf8").match(PATTERN);
    if (hits) found.set(file, hits.length);
  }
  assert.deepEqual([...found.entries()].sort(), [...ALLOWED.entries()].sort(),
    "an address change in the app would be counted as a page view by the host's page-load counting; see privacy/index.html (page-load-counting)");
});
