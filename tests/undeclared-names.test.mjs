import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { undeclaredNames } from "../scripts/undeclared-names.mjs";

// When a feature moves out of index.html, a variable it used can be left behind with nothing complaining until someone clicks the button that needs it (the
// Storage screen's "Lock settings" did exactly that). This reads every script of the app and fails on a name that is used but declared nowhere in its file.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const walk = (dir) => readdirSync(path.join(root, dir)).flatMap((f) => {
  const rel = dir + "/" + f;
  if (f === "vendor" || f === "node_modules") return [];
  return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : /\.(mjs|js)$/.test(f) ? [rel] : [];
});
const files = [...walk("chat"), ...walk("runtime").filter((f) => !f.includes("/vendor/")), "local-models.js", "conversation-messages.mjs"];

test("no script uses a name it never declares", () => {
  const problems = [];
  for (const f of files) {
    for (const u of undeclaredNames(readFileSync(path.join(root, f), "utf8"))) problems.push(f + ":" + u.line + " " + u.name);
  }
  assert.deepEqual(problems, [], "used but never declared:\n" + problems.join("\n"));
});

test("the page's own script uses no name it never declares", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const a = html.indexOf("<script>\n    /*\n     * Private Chat Client");
  assert.ok(a > 0, "the page script is where this test expects it");
  const code = html.slice(a + "<script>".length, html.indexOf("</script>", a));
  const problems = undeclaredNames(code).map((u) => "index.html script, line " + u.line + " of the script: " + u.name);
  assert.deepEqual(problems, [], "used but never declared:\n" + problems.join("\n"));
});
