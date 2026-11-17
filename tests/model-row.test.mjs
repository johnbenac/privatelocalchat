import test from "node:test";
import assert from "node:assert/strict";
import { rowParts } from "../chat/shell/model-row.mjs";

test("one description of a row for every place: name, badge, state words, progress, the click's action", () => {
  const vm = { id: "kitten", kind: "voice", label: "Kitten", inUse: true, state: "downloading", progress: 0.4, license: "Apache-2.0", sizeBytes: 28e6 };
  const p = rowParts(vm, ["Recommended for this device"]);
  assert.equal(p.label, "Kitten"); assert.equal(p.inUse, true); assert.equal(p.progress, 0.4); assert.equal(p.action, "cancel");
  assert.equal(p.desc, "Downloading 40% · Apache-2.0 · Recommended for this device");
  assert.equal(rowParts({ ...vm, state: "loaded", progress: null }).progress, null);
  assert.equal(rowParts({ id: "os", kind: "system", label: "System voice", note: "Built into your device.", inUse: false, state: "ready" }).desc, "Built into your device.");
});
