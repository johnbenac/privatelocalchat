import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// The page asks questions in its own dialogs (window.plcDialogs, index.html), never with the browser's confirm / alert / prompt.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = ["index.html", "local-models.js", "dev-tools/ui.mjs",
  ...["chat", "chat/shell", "chat/lock", "chat/call", "chat/models", "runtime", "runtime/providers"].flatMap((d) => readdirSync(path.join(root, d)).filter((f) => f.endsWith(".mjs") || f.endsWith(".js")).map((f) => d + "/" + f))];
const NATIVE = /(^|[^\w.$])(window\.)?(confirm|alert|prompt)\s*\(/;

test("no source file uses the browser's confirm, alert or prompt", () => {
  const found = [];
  for (const f of files) {
    readFileSync(path.join(root, f), "utf8").split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''"); // not comments, not the text of messages
      if (NATIVE.test(code)) found.push(f + ":" + (i + 1) + " " + line.trim().slice(0, 100));
    });
  }
  assert.deepEqual(found, [], "use window.plcDialogs.confirm / alert / copyText instead:\n" + found.join("\n"));
});
