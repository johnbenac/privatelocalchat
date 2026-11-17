import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from "node:test";
import assert from "node:assert/strict";
import { TIERS, TIER_ORDER, tierFiles, loadConfigFor, isWllamaTier, isTinyTier, resolveSources, OFFICIAL_SOURCES } from "../runtime/providers/catalog.mjs";
import { pickTier } from "../runtime/auto-tier.mjs";
import manifest from "../ops/cloudflare/gguf-models.json" with { type: "json" };

const CDN = "https://assets.privatelocal.chat/models/";

test("LFM2.5 and Granite are catalogued tiers served only from the project CDN", () => {
  assert.deepEqual(TIER_ORDER, ["default", "light", "lfm", "granite", "mini", "nano"]);
  for (const t of ["lfm", "granite"]) {
    assert.ok(isWllamaTier(t));
    const files = tierFiles(t);
    assert.ok(files.length >= 6);
    assert.ok(files.every((f) => f.url.startsWith(CDN) && /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 0 && f.scope === "opfs"));
    assert.equal(files.reduce((n, f) => n + f.bytes, 0), TIERS[t].downloadBytes);
    const cfg = loadConfigFor(t, { backend: "cpu" });
    assert.equal(cfg.adapter, "wllama"); assert.equal(cfg.modelUrl, files[0].url); assert.match(files[0].path, /00001-of-000\d\d\.gguf$/);
    assert.equal(cfg.context.n_gpu_layers, 0); assert.equal(cfg.context.fused_gdn_auto, undefined);
    assert.ok(TIERS[t].sampling.temperature > 0 && TIERS[t].sampling.temperature <= 0.5);
  }
  assert.equal(loadConfigFor("light", { backend: "gpu" }).context.fused_gdn_auto, true);
});

test("the repository manifest and the catalogue agree on every file", () => {
  for (const [key, tier] of [["lfm25_2_6b_q3", "lfm"], ["granite40_h_1b_q4km", "granite"], ["smollm2_135m_q4km", "nano"], ["granite40_h_350m_q4km", "mini"]]) {
    const m = manifest[key], files = tierFiles(tier);
    assert.equal(m.files.length, files.length);
    m.files.forEach((f, i) => { assert.equal(files[i].path, f.path); assert.equal(files[i].sha256, f.sha256); assert.equal(files[i].bytes, f.bytes); });
    assert.ok(files[0].url.includes(m.prefix));
  }
});

test("a tier base can be overridden explicitly and the label says so", () => {
  const r = resolveSources({ wllamaTierBase: { lfm: "https://example.test/lfm" } });
  assert.equal(r.sources.wllamaTierBase.lfm, "https://example.test/lfm/");
  assert.equal(r.sources.wllamaTierBase.granite, OFFICIAL_SOURCES.wllamaTierBase.granite);
  assert.equal(r.overridden, true);
});

const gpu = { webgpu: { available: true, shaderF16: true }, wasm: { available: true, simd: true }, deviceMemoryGB: 16 };
test("a model the person chose is honoured, on the GPU and on the processor; nothing picks it for them", () => {
  assert.equal(pickTier({ env: gpu, selection: { tier: "lfm", chosenBy: "human" } }).tier, "lfm");
  assert.equal(pickTier({ env: gpu, selection: { tier: "granite", chosenBy: "human" } }).tier, "granite");
  assert.equal(pickTier({ env: gpu, installed: { granite: true }, selection: { tier: "light", chosenBy: "default" } }).tier, "granite");
  const cpu = { webgpu: { available: false }, wasm: { available: true, simd: true }, deviceMemoryGB: 16 };
  const c = pickTier({ env: cpu, selection: { tier: "lfm", chosenBy: "human" } });
  assert.deepEqual([c.tier, c.backend], ["lfm", "cpu"]);
  assert.equal(pickTier({ env: gpu, selection: { tier: "light", chosenBy: "default" } }).tier, "default");
  assert.equal(pickTier({ env: { ...gpu, deviceMemoryGB: 4 }, selection: { tier: "light", chosenBy: "default" } }).tier, "light");
});

import { createThinkFilter, stripEmptyThink } from "../runtime/providers/think.mjs";
test("empty think blocks in a row are removed, streamed in any split, and real reasoning is kept", () => {
  const run = (parts) => { const f = createThinkFilter(); return parts.map((p) => f.push(p)).join("") + f.flush(); };
  assert.equal(run(["<think></think><think></think>ready"]), "ready");
  assert.equal(run(["<th", "ink></th", "ink><think>", "</think>\n", "ready ", "now"]), "ready now");
  assert.equal(run(["\nThe capital"]), "The capital");
  assert.equal(run(["<think>real thought</think>answer"]), "<think>real thought</think>answer");
  assert.equal(stripEmptyThink("<think>\n\n</think>\n\nhi"), "hi");
  assert.equal(run(["<think></think>"]), "");
  assert.equal(run(["<think>", "</think>", "<think>", "</think>", "ready"]), "ready");
  assert.equal(run(["<think></think>\n", "\nready"]), "ready");
});

test("the tiny models are catalogued, small, Apache-2.0, single files on the project CDN, and pinned by the manifest", () => {
  for (const t of ["mini", "nano"]) {
    assert.ok(isWllamaTier(t) && isTinyTier(t));
    assert.equal(TIERS[t].license, "Apache-2.0");
    const files = tierFiles(t);
    assert.equal(files.length, 1);
    assert.ok(files[0].url.startsWith(CDN) && /^[0-9a-f]{64}$/.test(files[0].sha256) && files[0].scope === "opfs");
    assert.ok(TIERS[t].downloadBytes < 250e6, "tiny means under 250 MB");
    assert.equal(TIERS[t].downloadBytes, files[0].bytes);
    const cfg = loadConfigFor(t, { backend: "cpu" });
    assert.equal(cfg.modelUrl, files[0].url); assert.equal(cfg.context.n_gpu_layers, 0); assert.equal(cfg.context.fused_gdn_auto, undefined);
    assert.ok(cfg.context.n_ctx <= 4096);
  }
  assert.ok(TIERS.nano.downloadBytes < TIERS.mini.downloadBytes && TIERS.mini.downloadBytes < TIERS.granite.downloadBytes);
  for (const big of ["default", "light", "lfm", "granite"]) assert.ok(!isTinyTier(big));
});
