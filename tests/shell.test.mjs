import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry, groupThreadsByDate, greeting } from "../chat/shell/registry.mjs";
import { hybridSearch, passagesFor, cosine } from "../chat/shell/hybrid-search.mjs";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("registry orders, hides and pins entries", () => {
  const r = createRegistry(mem());
  r.register("rail", { id: "b", label: "B", order: 20 });
  r.register("rail", { id: "a", label: "A", order: 10 });
  r.register("rail", { id: "h", label: "H", order: 5, visible: () => false });
  assert.deepEqual(r.list("rail").map((i) => i.id), ["a", "b"]);
  r.register("explore", { id: "memory", label: "Memory", pinnedByDefault: true });
  assert.equal(r.isPinned("memory"), true);
  r.setPinned("memory", false);
  assert.equal(r.isPinned("memory"), false);
  assert.throws(() => r.register("rail", { id: "x" }));
});

test("chats group by date with pinned first", () => {
  const now = new Date(2026, 10, 2, 15).getTime();
  const day = 864e5;
  const t = (id, ago, extra = {}) => ({ id, updatedAt: now - ago, ...extra });
  const groups = groupThreadsByDate([t("old", 90 * day), t("today", 1000), t("pin", 40 * day, { pinned: true }), t("yest", 20 * 3600e3), t("wk", 4 * day), t("mo", 20 * day)], now);
  assert.deepEqual(groups.map((g) => g.label), ["Pinned", "Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"]);
  assert.equal(groups[1].items[0].id, "today");
});

test("greeting is stable text", () => assert.match(greeting(new Date(2026, 0, 1, 9)), /\S/));

const thread = (id, title, texts, extra = {}) => ({ id, title, updatedAt: 1000, messages: texts.map((c, i) => ({ id: id + "m" + i, role: i % 2 ? "assistant" : "user", content: c })), ...extra });
const threads = [
  thread("a", "Trip planning", ["Which hotel near the station is cheapest?"]),
  thread("b", "Taxes", ["How do I file the quarterly estimate?"], { archived: true }),
  thread("c", "Cooking", ["Roast a chicken at 200 degrees"])
];

test("keyword only when there is no embedding model", () => {
  const r = hybridSearch({ threads, query: "hotel" });
  assert.equal(r.length, 1); assert.equal(r[0].threadId, "a"); assert.equal(r[0].via, "words"); assert.equal(r.semanticUsed, false);
});

test("archived chats are hidden unless asked for", () => {
  assert.equal(hybridSearch({ threads, query: "quarterly" }).length, 0);
  assert.equal(hybridSearch({ threads, query: "quarterly", filters: { archived: "all" } }).length, 1);
});

test("meaning finds a chat that shares no words, and both signals rank first", () => {
  const passages = passagesFor(threads);
  const vectors = new Map();
  const unit = (x, y) => { const n = Math.hypot(x, y); return [x / n, y / n]; };
  for (const p of passages) vectors.set(p.key, p.threadId === "c" ? unit(1, 0.1) : unit(0.1, 1));
  const r = hybridSearch({ threads, query: "chicken", semantic: { queryVector: unit(1, 0), vectors, minScore: 0.5 }, passages });
  assert.equal(r.semanticUsed, true);
  assert.equal(r[0].threadId, "c"); assert.equal(r[0].via, "both");
  const meaningOnly = hybridSearch({ threads, query: "dinner ideas", filters: { mode: "meaning" }, semantic: { queryVector: unit(1, 0), vectors, minScore: 0.5 }, passages });
  assert.ok(meaningOnly.some((x) => x.threadId === "c" && x.via === "meaning"));
});

test("filters: pinned, files, role, project, age", () => {
  const ts = [thread("p", "Pinned one", ["alpha"], { pinned: true, folderId: "f1" }), thread("q", "Other", ["alpha"], { updatedAt: 1 })];
  assert.deepEqual(hybridSearch({ threads: ts, query: "alpha", filters: { pinnedOnly: true } }).map((x) => x.threadId), ["p"]);
  assert.deepEqual(hybridSearch({ threads: ts, query: "alpha", filters: { folderId: "f1" } }).map((x) => x.threadId), ["p"]);
  assert.deepEqual(hybridSearch({ threads: ts, query: "alpha", filters: { days: 1 }, now: 3 * 864e5 }).map((x) => x.threadId), []);
  assert.equal(cosine([1, 0], [1, 0]), 1);
});
