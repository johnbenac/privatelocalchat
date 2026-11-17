import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { EVENT_NAMES } from "../chat/events.mjs";

// docs/ARCHITECTURE.md is how the app is put together now. These two checks keep it from drifting without any ceremony: the folders and the events it names
// must be the ones that exist.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const doc = readFileSync(path.join(root, "docs/ARCHITECTURE.md"), "utf8");

test("the architecture page names every folder under chat/, and every folder it names exists", () => {
  const folders = readdirSync(path.join(root, "chat")).filter((f) => statSync(path.join(root, "chat", f)).isDirectory());
  const missing = folders.filter((f) => !doc.includes("chat/" + f + "/"));
  assert.deepEqual(missing, [], "add these folders to the map in docs/ARCHITECTURE.md: " + missing.join(", "));
  const named = [...doc.matchAll(/\bchat\/([a-z][a-z-]*)\//g)].map((m) => m[1]);
  const gone = [...new Set(named)].filter((f) => !existsSync(path.join(root, "chat", f)));
  assert.deepEqual(gone, [], "docs/ARCHITECTURE.md names folders that do not exist: " + gone.join(", "));
});

test("the architecture page lists every event in chat/events.mjs, and no event that is not there", () => {
  // the reply events share one table row: `reply:start` / `reply:text` / `reply:end`
  const missing = EVENT_NAMES.filter((n) => !doc.includes("`" + n + "`"));
  assert.deepEqual(missing, [], "add these events to the table in docs/ARCHITECTURE.md: " + missing.join(", "));
  const kinds = [...new Set(EVENT_NAMES.map((n) => n.split(":")[0]))];
  const mentioned = [...new Set([...doc.matchAll(/`([a-z]+:[a-z]+)`/g)].map((m) => m[1]))].filter((n) => kinds.includes(n.split(":")[0]));
  const unknown = mentioned.filter((n) => !EVENT_NAMES.includes(n));
  assert.deepEqual(unknown, [], "docs/ARCHITECTURE.md names events that do not exist: " + unknown.join(", "));
});
