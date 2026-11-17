import test from "node:test";
import assert from "node:assert/strict";
import { languageRows, voiceRows, otherRows, stateLine, toggleAction, sizeText } from "../chat/models/models-view.mjs";

const item = (label, ok, bytes = 0) => ({ info: { label, modelId: label, downloadBytes: 2e9, memory: { steadyBytes: 3e9 } }, install: { ok, bytesPresent: bytes } });
const base = () => ({ selection: { tier: "light" }, tiers: { light: item("Qwen3.5-2B", true, 2e9), granite: item("Granite", false) }, load: { state: "unloaded" }, busy: false, transfer: null, lastError: null });

test("chat model rows: downloaded, loaded, downloading, loading, failed", () => {
  let s = base(); let rows = languageRows(s);
  assert.deepEqual(rows.map((r) => [r.id, r.state, r.inUse]), [["light", "downloaded", true], ["granite", "none", false]]);
  s = { ...base(), load: { state: "ready", tier: "light" } }; assert.equal(languageRows(s)[0].state, "loaded");
  s = { ...base(), busy: "install", transfer: { bytesDone: 1, bytesTotal: 4 }, tiers: { light: item("Q", false) } }; const d = languageRows(s)[0]; assert.equal(d.state, "downloading"); assert.equal(d.progress, 0.25);
  s = { ...base(), busy: "load" }; assert.equal(languageRows(s)[0].state, "loading");
  s = { ...base(), lastError: { message: "no GPU" } }; assert.equal(languageRows(s)[0].state, "failed");
  assert.equal(languageRows(base(), { mode: "api" })[0].inUse, false, "with a connected provider no on-device model is in use");
});

test("the same words for the same state, with no cost words", () => {
  assert.equal(stateLine({ state: "none", sizeBytes: 28e6 }), "Not downloaded (28 MB)");
  assert.equal(stateLine({ state: "downloading", progress: 0.42 }), "Downloading 42%");
  assert.equal(stateLine({ state: "downloaded", bytesOnDevice: 28e6 }), "Downloaded (28 MB) · not in memory");
  assert.equal(stateLine({ state: "loaded" }), "In memory, ready");
  assert.match(stateLine({ state: "failed", error: "boom." }), /^Failed: boom\. Tap to try again\.$/);
  for (const st of ["none", "downloading", "testing", "downloaded", "loading", "loaded", "busy", "failed"]) assert.doesNotMatch(stateLine({ state: st, sizeBytes: 1e6 }), /free|instant|light|fast/i);
  assert.equal(sizeText(2.1e9), "2.10 GB");
});

test("a click is a toggle for models and a plain selection for the system voice and providers", () => {
  const act = (kind, state, inUse = false) => toggleAction({ kind, state, inUse });
  assert.equal(act("language", "none"), "download"); assert.equal(act("voice", "downloading"), "cancel"); assert.equal(act("voice", "testing"), "cancel");
  assert.equal(act("language", "downloaded"), "load"); assert.equal(act("voice", "loaded"), "unload"); assert.equal(act("voice", "busy"), "unload");
  assert.equal(act("voice", "failed"), "retry"); assert.equal(act("language", "loading"), "wait");
  assert.equal(act("system", "ready"), "use"); assert.equal(act("system", "ready", true), "in-use"); assert.equal(act("provider", "ready"), "use");
});

test("voice rows: the system voice is not a model; downloaded voices show their memory state", () => {
  const snap = { voices: [
    { id: "os", label: "System voice", note: "Built into your device.", selected: false, state: "ready" },
    { id: "kitten", label: "Kitten", selected: true, state: "ready", memory: "loaded", size: 28e6, bytesOnDevice: 28e6, license: "Apache-2.0" },
    { id: "kokoro", label: "Kokoro", selected: false, state: "installing", progress: { done: 5, total: 10 }, size: 97e6 }] };
  const rows = voiceRows(snap);
  assert.equal(rows[0].kind, "system"); assert.equal(rows[1].state, "loaded"); assert.equal(rows[2].state, "downloading"); assert.equal(rows[2].progress, 0.5);
});

test("other models come from the memory manager, minus the chat model and the voice", () => {
  const rows = otherRows({ residents: [{ id: "chat-llm", label: "x", state: "loaded" }, { id: "voice", label: "y", state: "loaded" }, { id: "matching", kind: "embedding", label: "the embedding model", state: "unloaded", busy: false }] });
  assert.deepEqual(rows.map((r) => [r.id, r.label, r.state]), [["matching", "The embedding model", "downloaded"]]);
});

test("the check of saved files at start-up is not a download: no 'Downloading 0%' while it runs", () => {
  const s = { ...base(), busy: "inspect", transfer: { bytesDone: 0, bytesTotal: 1.2e9, phase: "inspect" } };
  const row = languageRows(s)[0];
  assert.equal(row.state, "downloaded", "the row keeps what is known about the files");
  assert.notEqual(row.state, "downloading");
  const r2 = languageRows({ ...base(), tiers: { light: item("Q", false) }, busy: "inspect", transfer: { bytesDone: 0, bytesTotal: 1e9, phase: "inspect" } })[0];
  assert.equal(r2.state, "none");
});
