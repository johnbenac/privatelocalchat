// Advice about text-to-speech voices for this device. As of the voice picker (chat/voice/voice-choice.mjs) NOTHING here blocks a choice: every voice can always be picked
// and downloaded on every device. The picker asks `pickVoiceEngine` (with `manual: true`) which voice suits this device and shows it as "Recommended for this
// device", and the limits below decide only when a voice is labelled "may be slow here" or reported as slow after download. The probe and speed limits were
// calibrated on real devices and simulated slow CPUs (docs/VOICE-CALIBRATION.md); the others remain conservative values.

export const VOICE_CONFIG = Object.freeze({
  calibrated: true,          // 2026-11-02: set from measurements on six browsers across five devices (docs/evidence/voice/lane-results.json)
  // stage 1 gate (cheap signals)
  minMemoryGB: 4,            // placeholder
  minCores: 4,               // placeholder
  minFreeStorageMB: 600,     // placeholder (the 27.6 MB download needs far less; this keeps a phone from being filled): free space that must remain after the download
  storageHeadroomFactor: 3,  // free space must be at least this many times the download
  // stage 2 advice threshold (compute probe, milliseconds for the reference loop in chat/voice-probe, the MEDIAN of 3 runs; lower is faster)
  // The fits below are in docs/VOICE-CALIBRATION.md and docs/evidence/voice/calibration-throttling.json (CPU contention sweep, 7 slowdowns x 5 probes).
  probeMaxMs: 500,           // advice threshold ("may be slow here" above it). Measured: Kitten real-time factor x probe ms is about 640 (sweep, 4 threads) and 711 to 752
                             // on the real desktops (probe 137 to 216 ms, 3.3x to 5.5x); the 20 s start delay stays under maxStartDelayMs up to a probe of about 820 ms (4 threads) or 670 ms
                             // (1 thread). 500 keeps a factor of 1.35 to 1.64 for device differences the sweep cannot show. The Galaxy S8+ (1,997 to 4,000 ms, 0.26x) is 4x above it.
  // stage 3 (after install). Real time is NICE, NOT REQUIRED (owner decision, 2026-11-02): a voice slower than playback is kept as long as playback can
  // start soon (it buffers ahead so it does not stutter) and it is not hopelessly slow. Measured: Kitten ran at 0.26x on a Galaxy S8+, 3.3x on the N100 (Firefox).
  minRealTimeFactor: 0.7,    // advice threshold, derived: 20 s of speech may wait at most maxStartDelayMs, which implies a factor of about 0.67 (20 / 30); the sweep crosses it at slowdown 4 to 6
  maxFirstAudioMs: 4000,     // advice threshold: the sweep gives first audio of 2.7 s (Kitten) and 1.9 s (Kokoro) at their probe limits, so 4000 is a factor of 1.5 or more above those
  maxStartDelayMs: 10000,    // policy value (owner), not a measurement: longest wait before gapless playback of a typical 20 s reply may begin (see startDelayMs)
  qualityMinMemoryGB: 8,     // placeholder: memory (or unknown on desktop) needed for the larger voice
  qualityProbeMaxMs: 200     // advice threshold for recommending the larger voice (or a real GPU adapter). Measured: Kokoro factor x probe ms is about 235 (sweep, 4 threads) and 300 to 317 on the real desktops
                             // (Centroid 2.31x at 137 ms, Boiler 2.00x at 150 ms); the start delay stays under maxStartDelayMs up to a probe of about 317 ms (190 ms with 1 thread). 200 keeps a factor of 1.0 to 1.6 and the
                             // desktops 137 and 150 pass with 1.3x or more. The N100 (probe 216) is above it; its Kokoro run is not usable evidence (its recorded audio length is that of the Kitten text).
});

/** Candidates. `tier` orders them; sizes are the bytes the person would download (model plus voices). */
export const VOICE_ENGINES = Object.freeze({
  kitten: Object.freeze({ id: "kitten", label: "Kitten TTS nano", tier: 1, downloadBytes: 24369971 + 3278902, languages: ["en"] }),
  kokoro: Object.freeze({ id: "kokoro", label: "Kokoro", tier: 2, downloadBytes: 96542690, languages: ["en"] })
});

const IOS = /iPhone|iPad|iPod/;
const MOBILE = /iPhone|iPad|iPod|Android/;
/** iPhone, iPad, and an iPad that reports itself as a Mac. The one platform rule with hard evidence (docs/IPHONE-INVESTIGATION.md). */
export const isIOSDevice = (userAgent = "", maxTouchPoints = 0) => IOS.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
const isMobile = (userAgent, maxTouchPoints) => MOBILE.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

const os = (reason, extra = {}) => ({ engine: "os", offer: false, reason, ...extra });

/**
 * @param {object} a
 * @param {object} a.env              capability probe result: { deviceMemoryGB, cores, webgpu:{available,isFallbackAdapter} }
 * @param {string} a.userAgent
 * @param {number} a.maxTouchPoints
 * @param {{usage:number,quota:number,writeOk?:boolean}|null} a.storage   navigator.storage.estimate() in bytes. Chrome sizes the quota from TOTAL disk,
 *        not free space (a phone with 430 MB free reported a 34 GB quota), so on mobile the estimate is never trusted alone: `writeOk` is the
 *        result of really writing the download size plus a margin to private storage and deleting it again.
 * @param {{ms:number}|null} a.probe  compute probe result; null when it has not run yet
 * @param {string} a.language         BCP-47 language of the chat, e.g. "en" or "en-US"
 * @param {string|null} a.chosen      "os", an engine id, or null when the person has not chosen
 * @param {Record<string,boolean>} a.installed   engine ids whose verified files are on disk
 * @param {number} a.chatModelResidentGB  memory the loaded chat model holds (0 when none is loaded)
 * @param {boolean} a.devOffer        dev flag that shows the offer while thresholds are uncalibrated
 * @param {object} a.config
 * @param {string[]|null} a.only      engine ids that are actually implemented in this build; others are never offered (null = all, for tests)
 * @param {boolean} a.manual          the person explicitly asked to try a voice now. On iPhone and iPad this is the only way in (and only the small voice is considered);
 *                                    everywhere it also skips the "memory is hidden on mobile" refusal, because the person decided. The storage write test,
 *                                    the probe and the after-install speed check still apply.
 */
export function pickVoiceEngine({ env = {}, userAgent = "", maxTouchPoints = 0, storage = null, probe = null, language = "en", chosen = null, installed = {}, chatModelResidentGB = 0, devOffer = false, config = VOICE_CONFIG, only = null, manual = false } = {}) {
  // 1. what the person decided always wins
  if (chosen === "os") return os("user-choice");
  if (chosen && VOICE_ENGINES[chosen] && installed[chosen]) return { engine: chosen, offer: false, reason: "user-choice-installed", loadWhen: loadPolicy(env, VOICE_ENGINES[chosen], chatModelResidentGB) };

  // 2. iPhone and iPad: a process memory limit of about 2 GB was measured on one iPhone 15 Pro while the chat model was loaded (docs/IPHONE-INVESTIGATION.md). It
  //    is a conservative default for every iPhone and iPad, not evidence about all of them, so it is not applied when the person opts in. Only the small voice is
  //    then considered.
  const ios = isIOSDevice(userAgent, maxTouchPoints);
  if (ios && !manual) return os("ios-system-voice-only");
  const engineIds = ios ? ["kitten"].filter((id) => !only || only.includes(id)) : only;

  // 3. coverage: the small engines are English only
  const lang = String(language || "").toLowerCase().split("-")[0];
  const candidates = Object.values(VOICE_ENGINES).filter((e) => e.languages.includes(lang) && (!engineIds || engineIds.includes(e.id)));
  if (!candidates.length) return os("language-not-covered");

  // 4. stage 1: cheap signals. Anything missing is "no", never "yes".
  const mobile = isMobile(userAgent, maxTouchPoints);
  const mem = Number.isFinite(env.deviceMemoryGB) ? env.deviceMemoryGB : null;
  const cores = Number.isFinite(env.cores) ? env.cores : null;
  if (cores === null || cores < config.minCores) return os("too-few-cores", { stage: 1 });
  if (mobile && mem === null && !manual) return os("memory-unknown-on-mobile", { stage: 1 });
  if (mem !== null && mem < config.minMemoryGB) return os("low-memory", { stage: 1 });
  if (!storage || !Number.isFinite(storage.quota) || !Number.isFinite(storage.usage)) return os("storage-unknown", { stage: 1 });
  const freeMB = (storage.quota - storage.usage) / 1e6;
  // a mobile browser's estimate can overstate free space by orders of magnitude: it must be proven with a real write
  // (desktop Chrome and Safari size the quota from total disk too, so every platform needs the proof, not only phones)
  if (storage.writeOk !== true) return os(storage.writeOk === false ? "not-enough-free-storage" : "storage-unverified", { stage: 1, needsStorageTest: storage.writeOk === undefined });

  // the larger voice needs memory headroom (or, on desktop where memory is hidden, a fast probe below)
  // Measured 2026-11-02: Kokoro q8 on WASM/CPU ran at 0.56x (1 thread) to 0.86x (8 threads) real time on a 16-core desktop. Real time is not required,
  // but a slow CPU would make the wait unreasonable, so the larger voice needs a real GPU adapter or a desktop-class probe.
  const realGpu = Boolean(env.webgpu?.available) && !env.webgpu?.isFallbackAdapter;
  const fastCpu = Number.isFinite(probe?.ms) && probe.ms <= config.qualityProbeMaxMs;
  const wantQuality = (realGpu || fastCpu) && (mem !== null ? mem >= config.qualityMinMemoryGB : !mobile) && candidates.some((c) => c.tier === 2);
  const pick = (wantQuality ? candidates.find((c) => c.tier === 2) : candidates.find((c) => c.tier === 1)) || candidates[0];
  const needMB = (pick.downloadBytes / 1e6) * config.storageHeadroomFactor;
  if (freeMB < Math.max(needMB, config.minFreeStorageMB + pick.downloadBytes / 1e6)) {
    // the smaller voice may still fit
    const small = candidates.find((c) => c.tier === 1);
    if (small && small !== pick && freeMB >= Math.max((small.downloadBytes / 1e6) * config.storageHeadroomFactor, config.minFreeStorageMB + small.downloadBytes / 1e6)) return decide(small);
    return os("not-enough-free-storage", { stage: 1, freeMB: Math.round(freeMB) });
  }
  return decide(pick);

  function decide(engine) {
    // 5. stage 2: the compute probe has to have run and passed
    if (!probe || !Number.isFinite(probe.ms)) return os("probe-needed", { stage: 2, needsProbe: true, candidate: engine.id });
    if (probe.ms > config.probeMaxMs) return os("probe-too-slow", { stage: 2, ms: probe.ms });
    // 6. offered only when calibrated, or when the dev flag asks for it
    const offerOk = config.calibrated === true || devOffer === true;
    return { engine: "os", offer: offerOk, candidate: engine.id, reason: offerOk ? "offer" : "uncalibrated", stage: 2,
      loadWhen: loadPolicy(env, engine, chatModelResidentGB), downloadBytes: engine.downloadBytes };
  }
}

/** The voice model loads beside the chat model only when memory is known and there is room; otherwise it waits until the chat model is idle. */
export function loadPolicy(env, engine, chatModelResidentGB = 0) {
  const mem = Number.isFinite(env?.deviceMemoryGB) ? env.deviceMemoryGB : null;
  if (mem === null) return "when-idle";
  const needGB = engine.tier === 2 ? 1.2 : 0.5;
  return mem - chatModelResidentGB >= needGB + 1 ? "with-chat" : "when-idle";
}

/**
 * How long playback must wait so it never stutters: synthesis of the rest must finish before playback catches up. 0 when the voice is at least real time.
 * For a reply of `audioSeconds` made at `realTimeFactor` (audio seconds per compute second), the compute takes audioSeconds / rtf.
 */
export function startDelayMs({ audioSeconds, realTimeFactor, firstAudioMs = 0 }) {
  if (!(realTimeFactor > 0) || !(audioSeconds > 0)) return Infinity;
  const computeMs = (audioSeconds / realTimeFactor) * 1000;
  return Math.max(firstAudioMs, computeMs - audioSeconds * 1000 + firstAudioMs);
}

/** Stage 3: after install. Real time is not required: it is enough that sound starts soon, the voice is not hopelessly slow, and a typical reply can play without stutter after a bearable wait. */
export function voiceIsFastEnough({ realTimeFactor, firstAudioMs, typicalReplySeconds = 20 }, config = VOICE_CONFIG) {
  if (!Number.isFinite(realTimeFactor) || !Number.isFinite(firstAudioMs)) return false;
  if (realTimeFactor < config.minRealTimeFactor || firstAudioMs > config.maxFirstAudioMs) return false;
  return startDelayMs({ audioSeconds: typicalReplySeconds, realTimeFactor, firstAudioMs }) <= config.maxStartDelayMs;
}
