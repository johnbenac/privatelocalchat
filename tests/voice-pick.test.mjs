import test from "node:test";
import assert from "node:assert/strict";
import { pickVoiceEngine, voiceIsFastEnough, startDelayMs, loadPolicy, isIOSDevice, VOICE_CONFIG, VOICE_ENGINES } from "../runtime/voice-pick.mjs";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
};
const GB = 1e9;
const gpu = { available: true, isFallbackAdapter: false };
const good = { cores: 8, deviceMemoryGB: 8, webgpu: gpu };
const roomy = { usage: 1 * GB, quota: 40 * GB, writeOk: true };
const fast = { ms: 30 };
const measured = { centroid: 137, boiler: 150, n100: 216, s8plus: 4000 }; // chat/voice/voice-probe.mjs on real devices, 2026-11-02
const on = { ...VOICE_CONFIG, calibrated: true };
const pick = (o) => pickVoiceEngine({ userAgent: UA.linux, env: good, storage: roomy, probe: fast, config: on, ...o });

test("iPhone and iPad always keep the system voice, whatever else is true", () => {
  for (const [userAgent, maxTouchPoints] of [[UA.iphone, 5], [UA.ipadAsMac, 5]]) {
    const r = pick({ userAgent, maxTouchPoints, env: { cores: 16, deviceMemoryGB: 64 }, storage: roomy, probe: { ms: 1 }, devOffer: true });
    assert.equal(r.engine, "os"); assert.equal(r.offer, false); assert.equal(r.reason, "ios-system-voice-only");
  }
  assert.equal(isIOSDevice(UA.mac, 0), false); // a real Mac has no touch points
});

test("a powerful new Android device is offered the larger voice; an old busy one is not", () => {
  const modern = pick({ userAgent: UA.android, maxTouchPoints: 5, env: { cores: 8, deviceMemoryGB: 8, webgpu: gpu } });
  assert.equal(modern.offer, true); assert.equal(modern.candidate, "kokoro");
  const old = pick({ userAgent: UA.android, maxTouchPoints: 5, env: { cores: 4, deviceMemoryGB: 2 } });
  assert.equal(old.offer, false); assert.equal(old.reason, "low-memory");
  const slow = pick({ userAgent: UA.android, maxTouchPoints: 5, env: { cores: 8, deviceMemoryGB: 8 }, probe: { ms: 900 } });
  assert.equal(slow.offer, false); assert.equal(slow.reason, "probe-too-slow");
});

test("Android with memory hidden is never offered a voice (fail safe)", () => {
  const r = pick({ userAgent: UA.android, maxTouchPoints: 5, env: { cores: 8 } });
  assert.equal(r.offer, false); assert.equal(r.reason, "memory-unknown-on-mobile");
});

test("a storage-starved phone gets no offer; a roomier one gets the small voice before the large one", () => {
  const full = pick({ userAgent: UA.android, maxTouchPoints: 5, storage: { usage: 55.3 * GB, quota: 55.8 * GB, writeOk: false } });
  assert.equal(full.offer, false); assert.equal(full.reason, "not-enough-free-storage");
  const medium = pick({ userAgent: UA.android, maxTouchPoints: 5, env: { cores: 8, deviceMemoryGB: 8 }, storage: { usage: 0, quota: 0.65 * GB, writeOk: true } });
  assert.equal(medium.offer, true); assert.equal(medium.candidate, "kitten");
});

test("desktop with hidden memory is judged by cores, storage and the probe", () => {
  const r = pick({ userAgent: UA.mac, maxTouchPoints: 0, env: { cores: 8, deviceMemoryGB: null } });
  assert.equal(r.offer, true);
  const weak = pick({ userAgent: UA.mac, env: { cores: 2, deviceMemoryGB: null } });
  assert.equal(weak.reason, "too-few-cores");
});

test("missing signals mean no offer", () => {
  assert.equal(pick({ env: {} }).reason, "too-few-cores");
  assert.equal(pick({ storage: null }).reason, "storage-unknown");
  const needsProbe = pick({ probe: null });
  assert.equal(needsProbe.reason, "probe-needed"); assert.equal(needsProbe.needsProbe, true); assert.equal(needsProbe.offer, false);
});

test("with uncalibrated thresholds the offer stays hidden unless the dev flag asks", () => {
  const hidden = pickVoiceEngine({ userAgent: UA.linux, env: good, storage: roomy, probe: fast, config: { ...VOICE_CONFIG, calibrated: false } });
  assert.equal(hidden.offer, false); assert.equal(hidden.reason, "uncalibrated");
  assert.equal(pickVoiceEngine({ userAgent: UA.linux, env: good, storage: roomy, probe: fast, devOffer: true, config: { ...VOICE_CONFIG, calibrated: false } }).offer, true);
});

test("the person's choice wins, and an installed engine is used", () => {
  assert.equal(pick({ chosen: "os" }).reason, "user-choice");
  const r = pick({ chosen: "kokoro", installed: { kokoro: true } });
  assert.equal(r.engine, "kokoro");
  assert.equal(pick({ chosen: "kokoro", installed: {} }).engine, "os"); // chosen but not installed: nothing is used
});

test("other languages keep the system voice", () => {
  assert.equal(pick({ language: "fr-FR" }).reason, "language-not-covered");
  assert.equal(pick({ language: "en-GB" }).offer, true);
});

test("the voice waits for the chat model when memory is tight", () => {
  assert.equal(loadPolicy({ deviceMemoryGB: 8 }, VOICE_ENGINES.kokoro, 2.3), "with-chat");
  assert.equal(loadPolicy({ deviceMemoryGB: 4 }, VOICE_ENGINES.kokoro, 2.3), "when-idle");
  assert.equal(loadPolicy({}, VOICE_ENGINES.kokoro, 0), "when-idle");
});

test("stage 3: real time is not required, but the wait must be bearable and the voice not hopeless", () => {
  assert.equal(voiceIsFastEnough({ realTimeFactor: 4, firstAudioMs: 600 }), true);
  assert.equal(voiceIsFastEnough({ realTimeFactor: 1.2, firstAudioMs: 600 }), true);
  assert.equal(voiceIsFastEnough({ realTimeFactor: 0.86, firstAudioMs: 1500 }), true);   // Kokoro on a 16-core CPU: slower than playback, still fine
  assert.equal(voiceIsFastEnough({ realTimeFactor: 0.26, firstAudioMs: 3000 }), false);  // Kitten on the Galaxy S8+: 20 s of speech would wait over a minute
  assert.equal(voiceIsFastEnough({ realTimeFactor: 4, firstAudioMs: 9000 }), false);
  assert.equal(voiceIsFastEnough({}), false);
  assert.equal(startDelayMs({ audioSeconds: 10, realTimeFactor: 2, firstAudioMs: 500 }), 500);
  assert.ok(startDelayMs({ audioSeconds: 20, realTimeFactor: 0.5, firstAudioMs: 500 }) > 19000);
});

test("real Galaxy S8+ numbers: a huge reported quota is not trusted without a write test, and the slow probe still declines", () => {
  // read from the device on 2026-11-02: 8 cores, deviceMemory 4, quota 34 GB while the data partition had about 430 MB free, probe loop 487 ms, the new wasm probe 4000 ms (its cap)
  const s8 = { userAgent: UA.android, maxTouchPoints: 5, env: { cores: 8, deviceMemoryGB: 4 }, storage: { usage: 0.04 * GB, quota: 34.3 * GB }, probe: { ms: 4000 } };
  const noTest = pick(s8);
  assert.equal(noTest.offer, false); assert.equal(noTest.reason, "storage-unverified"); assert.equal(noTest.needsStorageTest, true);
  const tested = pick({ ...s8, storage: { ...s8.storage, writeOk: true } });
  assert.equal(tested.offer, false); assert.equal(tested.reason, "probe-too-slow");
  assert.equal(pick({ ...s8, storage: { ...s8.storage, writeOk: false } }).reason, "not-enough-free-storage");
});

test("the larger voice needs a real GPU adapter or a desktop-class probe", () => {
  const cpuOnly = pick({ env: { cores: 16, deviceMemoryGB: 32, webgpu: { available: false } }, probe: { ms: 100 } });
  assert.equal(cpuOnly.candidate, "kokoro"); // a fast desktop CPU is acceptable now that real time is not required
  const slowCpu = pick({ env: { cores: 8, deviceMemoryGB: 32, webgpu: { available: false } }, probe: { ms: 220 } });
  assert.equal(slowCpu.candidate, "kitten");
  const software = pick({ env: { cores: 16, deviceMemoryGB: 32, webgpu: { available: true, isFallbackAdapter: true } }, probe: { ms: 220 } });
  assert.equal(software.candidate, "kitten");
  assert.equal(pick({ env: { cores: 16, deviceMemoryGB: 32, webgpu: gpu } }).candidate, "kokoro");
});

test("calibrated probe limit: the machines that ran the voice well pass, the Galaxy S8+ does not", () => {
  assert.equal(VOICE_CONFIG.calibrated, true);
  for (const ms of [measured.centroid, measured.boiler, measured.n100]) assert.equal(pick({ probe: { ms }, config: VOICE_CONFIG }).offer, true, `probe ${ms} ms`);
  assert.equal(pick({ probe: { ms: measured.s8plus }, config: VOICE_CONFIG }).reason, "probe-too-slow");
});

// The simulated-slower-CPU sweep (docs/evidence/voice/calibration-throttling.json, docs/VOICE-CALIBRATION.md): probe median and the warm run of each engine.
import { readFileSync } from "node:fs";
const sweep = JSON.parse(readFileSync(new URL("../docs/evidence/voice/calibration-throttling.json", import.meta.url), "utf8")).sweepDefaultThreads.rates;
const at = (rate, engine) => { const r = sweep[rate], w = r.engines[engine].warmRun; return { probe: { ms: r.probeMedianMs }, realTimeFactor: w.realTimeFactor, firstAudioMs: w.firstAudioMs }; };

test("throttled sweep: the probe advice limit sits below where Kitten stops starting a 20 s reply in time, with a margin", () => {
  for (const rate of [1, 2, 4]) assert.equal(voiceIsFastEnough(at(rate, "kitten")), true, `kitten at slowdown ${rate}`);
  for (const rate of [6, 8, 12, 20]) assert.equal(voiceIsFastEnough(at(rate, "kitten")), false, `kitten at slowdown ${rate}`);
  assert.ok(sweep[6].probeMedianMs / VOICE_CONFIG.probeMaxMs >= 1.5, "margin of at least 1.5 to the first failing slowdown (probe 859 ms)");
  assert.ok(VOICE_CONFIG.probeMaxMs >= measured.n100, "the slowest desktop that ran the voice well stays inside");
  assert.equal(pick({ probe: at(2, "kitten").probe, config: VOICE_CONFIG }).offer, true);
  assert.equal(pick({ probe: at(6, "kitten").probe, config: VOICE_CONFIG }).reason, "probe-too-slow");
});

test("throttled sweep: Kokoro is recommended only while its 20 s start delay is bearable, with a margin", () => {
  assert.equal(voiceIsFastEnough(at(1, "kokoro")), true);
  assert.equal(voiceIsFastEnough(at(2, "kokoro")), true);
  for (const rate of [4, 6, 8, 12, 20]) assert.equal(voiceIsFastEnough(at(rate, "kokoro")), false, `kokoro at slowdown ${rate}`);
  const cpu = (ms) => pick({ env: { cores: 8, deviceMemoryGB: 32, webgpu: { available: false } }, probe: { ms }, config: VOICE_CONFIG }).candidate;
  assert.equal(cpu(sweep[1].probeMedianMs), "kokoro");
  assert.equal(cpu(measured.boiler), "kokoro");
  assert.equal(cpu(sweep[2].probeMedianMs), "kitten");
  assert.ok(VOICE_CONFIG.qualityProbeMaxMs >= measured.boiler * 1.25, "the measured 150 ms desktop keeps at least 25 percent margin");
});
