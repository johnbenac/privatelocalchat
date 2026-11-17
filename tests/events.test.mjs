import test from "node:test";
import assert from "node:assert/strict";
import { createEvents, EVENT_NAMES } from "../chat/events.mjs";

test("an unknown event name is an error, so a typo fails at once", () => {
  const e = createEvents();
  assert.throws(() => e.on("reply:strat", () => {}), /unknown event: reply:strat/);
  assert.throws(() => e.emit("nope"), /unknown event/);
  assert.deepEqual(e.names, [...EVENT_NAMES]);
});

test("emit runs listeners in order, with the arguments, and one failing listener does not stop the others", () => {
  const e = createEvents(["a"]); const seen = [];
  e.on("a", (x, y) => seen.push("1:" + x + y)); e.on("a", () => { throw new Error("boom"); }); e.on("a", (x) => seen.push("3:" + x));
  const log = console.error; const logged = []; console.error = (...m) => logged.push(m.join(" ")); try { e.emit("a", "p", "q"); } finally { console.error = log; }
  assert.deepEqual(seen, ["1:pq", "3:p"]); assert.match(logged[0], /event a: a listener failed/);
});

test("on returns a way to stop listening", () => {
  const e = createEvents(["a"]); let n = 0; const off = e.on("a", () => { n++; });
  e.emit("a"); off(); e.emit("a"); assert.equal(n, 1);
});

test("emitAwait waits for each listener in turn and lets errors through", async () => {
  const e = createEvents(["a"]); const order = [];
  e.on("a", async () => { await new Promise((r) => setTimeout(r, 5)); order.push(1); }); e.on("a", () => order.push(2));
  await e.emitAwait("a"); assert.deepEqual(order, [1, 2]);
  e.on("a", () => { throw new Error("stop"); }); await assert.rejects(e.emitAwait("a"), /stop/);
});

test("collect returns every answer in order; intercept stops at the first listener that handled it", async () => {
  const e = createEvents(["c", "i"]);
  e.on("c", async () => ({ preamble: ["x"] })); e.on("c", () => undefined); e.on("c", async () => ({ preamble: ["y"] }));
  assert.deepEqual(await e.collect("c"), [{ preamble: ["x"] }, undefined, { preamble: ["y"] }]);
  let asked = 0; e.on("i", () => { asked++; return false; }); e.on("i", () => { asked++; return true; }); e.on("i", () => { asked++; return true; });
  assert.equal(await e.intercept("i"), true); assert.equal(asked, 2, "the third listener is not asked");
  assert.equal(await createEvents(["i"]).intercept("i"), false, "nothing handled it");
});
